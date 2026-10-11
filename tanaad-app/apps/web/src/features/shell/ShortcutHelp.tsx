import { useMemo } from 'react';
import { usePrefs } from '@/app/prefs';
import { useHotkey, useHotkeyList } from '@/app/hotkeys';
import { Dialog, Kbd } from '@/components/ui';

const ORDER = ['This page', 'Quick actions', 'Go to', 'Portals', 'Global'];
const STATIC: { group: string; keys: string; label: string }[] = [
  { group: 'Tables', keys: 'arrowdown', label: 'Next row (also J)' },
  { group: 'Tables', keys: 'arrowup', label: 'Previous row (also K)' },
  { group: 'Tables', keys: 'enter', label: 'Open the selected row' },
  { group: 'Tables', keys: 'home', label: 'First row · End for last' },
  { group: 'Forms', keys: 'tab', label: 'Next field · Shift+Tab for previous' },
  { group: 'Forms', keys: 'arrowright', label: 'Next option in a choice group' },
  { group: 'Forms', keys: '1', label: 'Digits 1–9 pick the nth option' },
  { group: 'Forms', keys: 'enter', label: 'Confirm a number or submit' },
  { group: 'Forms', keys: 'escape', label: 'Close panel, clear search' },
];

/** "?" opens the cheat sheet. It lists whatever is registered right now, so it is always true for the current screen. */
export function ShortcutHelp() {
  const open = usePrefs((s) => s.helpOpen); const setOpen = usePrefs((s) => s.setHelp);
  const list = useHotkeyList();
  useHotkey(['?', 'mod+/'], () => setOpen(!usePrefs.getState().helpOpen), { label: 'Keyboard shortcuts', group: 'Global' });
  const groups = useMemo(() => {
    const seen = new Set<string>(); const map = new Map<string, { keys: string; label: string }[]>();
    for (let i = list.length - 1; i >= 0; i--) { const h = list[i]; if (h.hidden) continue; const k = `${h.keys}|${h.label}`; if (seen.has(k)) continue; seen.add(k); map.set(h.group, [...(map.get(h.group) ?? []), { keys: h.keys, label: h.label }]); }
    for (const st of STATIC) map.set(st.group, [...(map.get(st.group) ?? []), st]);
    const names = [...map.keys()].sort((a, b) => (ORDER.indexOf(a) < 0 ? 99 : ORDER.indexOf(a)) - (ORDER.indexOf(b) < 0 ? 99 : ORDER.indexOf(b)));
    return names.map((g) => ({ group: g, items: map.get(g)!.sort((a, b) => a.label.localeCompare(b.label)) }));
  }, [list]);
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts" width={760}>
      <div className="columns-1 sm:columns-2 gap-8">
        {groups.map((g) => (
          <div key={g.group} className="break-inside-avoid mb-4">
            <div className="t-label mb-1.5">{g.group}</div>
            {g.items.map((it) => <div key={it.keys + it.label} className="flex items-center justify-between gap-3 h-7 border-b border-[var(--line)] last:border-b-0"><span className="t-base truncate">{it.label}</span><Kbd keys={it.keys} /></div>)}
          </div>
        ))}
      </div>
    </Dialog>
  );
}
