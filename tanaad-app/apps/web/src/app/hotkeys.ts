import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Keyboard model for the whole app.
 *
 *   "mod+k"   Ctrl on Windows/Linux, Cmd on macOS
 *   "g d"     sequence: press g, then d
 *   "n", "/", "?", "escape", "shift+n", "alt+1"
 *
 * Single keys and sequences are ignored while typing in a field. Combos with mod/alt always fire.
 * A later registration of the same keys wins, so a page can override a global shortcut.
 */
export interface Hotkey {
  id: number;
  keys: string;
  label: string;
  group: string;
  run: (e: KeyboardEvent) => void;
  allowInInput?: boolean;
  hidden?: boolean;
}

let nextId = 1;
let list: Hotkey[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function registerHotkey(h: Omit<Hotkey, 'id'>): () => void {
  const entry = { ...h, id: nextId++ };
  list = [...list, entry];
  emit();
  return () => { list = list.filter((x) => x.id !== entry.id); emit(); };
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function tokenOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('mod');
  if (e.altKey) parts.push('alt');
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  const isLetterOrNamed = /^[a-z0-9]$/.test(key) || key.length > 1;
  if (e.shiftKey && isLetterOrNamed) parts.push('shift');
  parts.push(key === ' ' ? 'space' : key);
  return parts.join('+');
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

let pending = '';
let pendingTimer: ReturnType<typeof setTimeout> | undefined;
let installed = false;

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
  const token = tokenOf(e);
  const typing = isTyping(e.target);
  const modded = token.includes('mod+') || token.includes('alt+');
  const tryMatch = (seq: string): boolean => {
    for (let i = list.length - 1; i >= 0; i--) {
      const h = list[i];
      if (h.keys !== seq) continue;
      if (typing && !modded && !h.allowInInput && token !== 'escape') continue;
      e.preventDefault();
      h.run(e);
      return true;
    }
    return false;
  };
  const seq = pending ? `${pending} ${token}` : token;
  clearTimeout(pendingTimer);
  if (tryMatch(seq)) { pending = ''; return; }
  if (!typing && !modded && list.some((h) => h.keys.startsWith(`${seq} `))) {
    pending = seq;
    pendingTimer = setTimeout(() => { pending = ''; }, 1100);
    return;
  }
  if (pending) { pending = ''; tryMatch(token); }
}

function ensureInstalled() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('keydown', onKeyDown);
}

/** Register a shortcut for as long as the component is mounted. */
export function useHotkey(keys: string | string[] | null | undefined, run: (e: KeyboardEvent) => void, opts: { label: string; group?: string; enabled?: boolean; allowInInput?: boolean; hidden?: boolean }) {
  const ref = useRef(run);
  ref.current = run;
  const enabled = opts.enabled ?? true;
  const keyList = !keys ? [] : Array.isArray(keys) ? keys : [keys];
  const signature = keyList.join('|');
  useEffect(() => {
    ensureInstalled();
    if (!enabled || !signature) return;
    const offs = signature.split('|').map((k, i) => registerHotkey({ keys: k, label: opts.label, group: opts.group ?? 'This page', run: (e) => ref.current(e), allowInInput: opts.allowInInput, hidden: opts.hidden || i > 0 }));
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled, opts.label, opts.group, opts.allowInInput, opts.hidden]);
}

export function useHotkeyList(): Hotkey[] {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => list, () => list);
}

/** Human form of a key string, split into caps: "mod+k" → ["Ctrl","K"], "g d" → ["G","D"]. */
export function keyCaps(keys: string): string[] {
  const nice = (k: string) => {
    if (k === 'mod') return isMac ? '⌘' : 'Ctrl';
    if (k === 'alt') return isMac ? '⌥' : 'Alt';
    if (k === 'shift') return isMac ? '⇧' : 'Shift';
    if (k === 'escape') return 'Esc';
    if (k === 'enter') return '↵';
    if (k === 'arrowup') return '↑';
    if (k === 'arrowdown') return '↓';
    if (k === 'arrowleft') return '←';
    if (k === 'arrowright') return '→';
    if (k === 'space') return 'Space';
    return k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1);
  };
  return keys.split(' ').flatMap((chord) => chord.split('+').map(nice));
}
