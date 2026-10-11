import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Boxes, Building2, CloudOff, Cloud, Contrast, Factory, Hash, Keyboard, LogOut, MonitorSmartphone, Download, Search, ShoppingCart, Tag, User, Users, Wrench, RotateCcw, type LucideIcon } from 'lucide-react';
import type { SiteCode } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { usePrefs } from '@/app/prefs';
import { usePwa } from '@/app/pwa';
import { GROUP_NAV, ROLE_TABS, visibleSiteNav } from '@/app/nav';
import { SITE_LIST, SITES } from '@/config/sites';
import { cn, Kbd } from '@/components/ui';
import { useHotkey } from '@/app/hotkeys';

interface Cmd { id: string; title: string; sub?: string; group: string; icon: LucideIcon; keys?: string; words?: string; run: () => void; rank?: number }

/** Ctrl/Cmd+K. Jump anywhere, run any action, find any record, without touching the mouse. */
export function CommandPalette({ scope, site }: { scope: 'group' | 'site'; site: SiteCode }) {
  const open = usePrefs((s) => s.paletteOpen); const setOpen = usePrefs((s) => s.setPalette);
  const prefs = usePrefs(); const pwa = usePwa(); const nav = useNavigate();
  const s = useStore();
  const role = s.session?.role ?? 'supervisor';
  const [q, setQ] = useState(''); const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null); const listRef = useRef<HTMLDivElement>(null);
  useHotkey('mod+k', () => setOpen(!usePrefs.getState().paletteOpen), { label: 'Command palette', group: 'Global' });
  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => input.current?.focus(), 10); } }, [open]);

  const isGroupRole = role === 'ceo' || role === 'group_admin';
  const commands = useMemo<Cmd[]>(() => {
    if (!open) return [];
    const go = (to: string, search?: Record<string, string>) => () => nav({ to: to as never, search: (search ?? {}) as never });
    const out: Cmd[] = [];
    const tabs = ROLE_TABS[role] ?? [];
    if (scope === 'site') for (const n of visibleSiteNav(role, site)) out.push({ id: `nav:${n.to}`, title: n.label, sub: n.group ? `${SITES[site].shortName} · ${n.group}` : SITES[site].shortName, group: 'Go to', icon: n.icon, keys: n.keys, words: n.words, run: go(`/s/${site}/${n.to}`), rank: tabs.includes(n.to) ? 2 : 1 });
    if (scope === 'group' || isGroupRole) for (const n of GROUP_NAV) out.push({ id: `gnav:${n.to}`, title: n.label, sub: 'Head Office', group: scope === 'group' ? 'Go to' : 'Head Office', icon: n.icon, keys: scope === 'group' ? n.keys : undefined, run: go(`/g/${n.to}`), rank: scope === 'group' ? 2 : 0 });
    if (isGroupRole || scope === 'site') SITE_LIST.forEach((x, i) => { if (scope === 'site' && x.id === site) return; if (!isGroupRole && !s.users.find((u) => u.id === s.session?.userId)?.roles.some((r) => r.siteId === x.id)) return; out.push({ id: `site:${x.id}`, title: `Switch to ${x.name}`, sub: x.tagline, group: 'Portals', icon: Building2, keys: `alt+${i + 1}`, run: go(`/s/${x.id}/${isGroupRole ? 'dashboard' : 'today'}`) }); });
    out.push(
      { id: 'sys:theme', title: prefs.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', group: 'Preferences', icon: Contrast, run: prefs.toggleTheme, words: 'dark light mode appearance' },
      { id: 'sys:density', title: prefs.density === 'compact' ? 'Switch to touch layout (large targets)' : 'Switch to compact layout (keyboard and mouse)', group: 'Preferences', icon: MonitorSmartphone, run: prefs.toggleDensity, words: 'density tablet desktop size' },
      { id: 'sys:keys', title: 'Keyboard shortcuts', group: 'Preferences', icon: Keyboard, keys: '?', run: () => prefs.setHelp(true) },
      { id: 'sys:net', title: s.online ? 'Work offline (simulate lost connection)' : 'Reconnect and sync', group: 'Preferences', icon: s.online ? CloudOff : Cloud, run: () => s.setOnline(!s.online), words: 'offline online sync network' },
    );
    if (pwa.canInstall) out.push({ id: 'sys:install', title: 'Install Tanaad as an app', sub: 'Own window, works offline', group: 'Preferences', icon: Download, run: () => void pwa.install(), words: 'pwa desktop install' });
    out.push(
      { id: 'sys:switch', title: 'All portals', sub: 'Switch workspace', group: 'Session', icon: User, keys: 'alt+p', run: go('/portals') },
      { id: 'sys:reset', title: 'Reset demo data', sub: 'Restore the seeded day', group: 'Session', icon: RotateCcw, run: () => { s.resetDemo(); s.toast({ kind: 'ok', title: 'Demo data restored' }); } },
      { id: 'sys:out', title: 'Sign out', group: 'Session', icon: LogOut, run: () => { s.signOut(); nav({ to: '/' }); } },
    );
    // Records: only once the user has typed something.
    const term = q.trim().toLowerCase();
    if (term.length >= 2) {
      const sites: SiteCode[] = isGroupRole ? ['mats', 'bags', 'recycling'] : [site];
      const hit = (...parts: (string | undefined)[]) => parts.some((p) => p?.toLowerCase().includes(term));
      s.people.filter((p) => sites.includes(p.homeSiteId) && hit(p.fullName, p.idNumber, p.phoneMomo)).slice(0, 6).forEach((p) => out.push({ id: `p:${p.id}`, title: p.fullName, sub: `Worker · ${p.sector} · ${SITES[p.homeSiteId].shortName}${p.status === 'archived' ? ' · archived' : ''}`, group: 'Workers', icon: Users, run: go(`/s/${p.homeSiteId}/people/registry`, { q: p.fullName }), rank: 3 }));
      s.orders.filter((o) => sites.includes(o.siteId) && hit(o.number, s.clients.find((c) => c.id === o.clientId)?.name)).slice(0, 6).forEach((o) => out.push({ id: `o:${o.id}`, title: `${o.number} · ${s.clients.find((c) => c.id === o.clientId)?.name ?? ''}`, sub: `Order · ${o.status.replace(/_/g, ' ')} · ${SITES[o.siteId].shortName}`, group: 'Orders', icon: ShoppingCart, run: go(`/s/${o.siteId}/sales/orders`, { q: o.number }), rank: 3 }));
      s.clients.filter((c) => hit(c.name, c.contact, c.country)).slice(0, 5).forEach((c) => out.push({ id: `c:${c.id}`, title: c.name, sub: `Client · ${c.country} · ${c.channel}`, group: 'Clients', icon: Building2, run: go(`/s/${s.orders.find((o) => o.clientId === c.id)?.siteId ?? site}/sales/clients`, { q: c.name }), rank: 3 }));
      s.products.filter((p) => sites.includes(p.siteId) && hit(p.internalName, p.commercialName)).slice(0, 5).forEach((p) => out.push({ id: `prod:${p.id}`, title: p.internalName, sub: `Product · ${SITES[p.siteId].shortName} · ${s.labels.filter((l) => l.productId === p.id && l.status === 'in_stock').length} in stock`, group: 'Products', icon: Boxes, run: go(`/s/${p.siteId}/stock`, { q: p.internalName }), rank: 3 }));
      s.machines.filter((m) => sites.includes(m.siteId) && hit(m.code)).slice(0, 5).forEach((m) => out.push({ id: `m:${m.id}`, title: m.code, sub: `Machine · ${SITES[m.siteId].shortName} · ${m.status}`, group: 'Machines', icon: Factory, run: go(`/s/${m.siteId}/production/wall`), rank: 3 }));
      s.parts.filter((p) => sites.includes(p.siteId) && hit(p.name)).slice(0, 4).forEach((p) => out.push({ id: `part:${p.id}`, title: p.name, sub: `Spare part · ${p.onHand} ${p.unit} on hand · ${SITES[p.siteId].shortName}`, group: 'Spares', icon: Wrench, run: go(`/s/${p.siteId}/stock/spares`, { q: p.name }), rank: 3 }));
      if (term.length >= 4) s.labels.filter((l) => sites.includes(l.siteId) && l.code.toLowerCase().includes(term)).slice(0, 5).forEach((l) => out.push({ id: `l:${l.id}`, title: l.code, sub: `Label · ${l.kind} · ${l.status.replace('_', ' ')}`, group: 'Labels', icon: Tag, run: go(`/s/${l.siteId}/production/scan`, { q: l.code }), rank: 3 }));
      s.dispatches.filter((d) => sites.includes(d.siteId) && hit(d.deliveryNoteNo)).slice(0, 4).forEach((d) => out.push({ id: `d:${d.id}`, title: d.deliveryNoteNo, sub: `Delivery note · ${d.gateStatus} · ${SITES[d.siteId].shortName}`, group: 'Deliveries', icon: Hash, run: go(`/s/${d.siteId}/stock/deliveries`, { q: d.deliveryNoteNo }), rank: 3 }));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q, scope, site, role, prefs.theme, prefs.density, s.online, pwa.canInstall]);

  const results = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const scored = commands.map((c) => {
      const hay = `${c.title} ${c.sub ?? ''} ${c.words ?? ''} ${c.group}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return null;
      const title = c.title.toLowerCase();
      const score = (c.rank ?? 1) * 10 + (terms.length && title.startsWith(terms[0]) ? 8 : 0) + (terms.length && title.includes(terms[0]) ? 4 : 0);
      return { c, score };
    }).filter((x): x is { c: Cmd; score: number } => !!x);
    if (terms.length) scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 60).map((x) => x.c);
  }, [commands, q]);
  const grouped = useMemo(() => { const order: string[] = []; const map = new Map<string, Cmd[]>(); for (const c of results) { if (!map.has(c.group)) { map.set(c.group, []); order.push(c.group); } map.get(c.group)!.push(c); } return order.map((g) => ({ group: g, items: map.get(g)! })); }, [results]);
  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);
  useEffect(() => { setIdx(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector(`[data-i="${idx}"]`)?.scrollIntoView({ block: 'nearest' }); }, [idx]);
  if (!open) return null;
  const run = (c?: Cmd) => { if (!c) return; setOpen(false); c.run(); };
  let n = -1;
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] px-3" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }} role="dialog" aria-modal aria-label="Command palette">
      <div className="absolute inset-0 bg-[rgb(11_19_23/.38)] anim-fade pointer-events-none" />
      <div className="relative w-full max-w-[640px] bg-[var(--surface)] border border-[var(--line-2)] rounded-lg shadow-[var(--shadow-float)] anim-pop overflow-hidden flex flex-col max-h-[70vh]"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(flat.length - 1, i + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); run(flat[idx]); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
        }}>
        <div className="flex items-center gap-2.5 px-3.5 h-12 border-b border-[var(--line)]">
          <Search className="size-4 text-[var(--text-3)] shrink-0" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search screens, actions, workers, orders, labels…" className="flex-1 bg-transparent outline-none t-lg placeholder:text-[var(--text-4)]" aria-label="Command" />
          <Kbd keys="escape" />
        </div>
        <div ref={listRef} className="overflow-y-auto py-1.5 flex-1">
          {flat.length === 0 && <div className="px-4 py-8 text-center t-sm text-[var(--text-3)]">No match for “{q}”. Try a screen name, a worker, an order number or a label code.</div>}
          {grouped.map((g) => (
            <div key={g.group} className="mb-1">
              <div className="px-3.5 pt-1.5 pb-1 t-label">{g.group}</div>
              {g.items.map((c) => { n += 1; const i = n; return (
                <button key={c.id} data-i={i} onMouseMove={() => setIdx(i)} onClick={() => run(c)} className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 touch:h-12 text-left', i === idx ? 'bg-[var(--selected)]' : '')}>
                  <c.icon className="size-4 text-[var(--text-3)] shrink-0" />
                  <span className="t-base font-medium truncate">{c.title}</span>
                  {c.sub && <span className="t-sm text-[var(--text-3)] truncate">{c.sub}</span>}
                  <span className="ml-auto flex items-center gap-2 shrink-0">{c.keys && <Kbd keys={c.keys} />}{i === idx && <ArrowRight className="size-3.5 text-[var(--text-3)]" />}</span>
                </button>
              ); })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 px-3.5 h-8 border-t border-[var(--line)] bg-[var(--surface-2)] t-xs text-[var(--text-3)] touch:hidden">
          <span className="inline-flex items-center gap-1.5"><Kbd keys="arrowup" /><Kbd keys="arrowdown" />navigate</span>
          <span className="inline-flex items-center gap-1.5"><Kbd keys="enter" />open</span>
          <span className="inline-flex items-center gap-1.5"><Kbd keys="g" />then a letter jumps without the palette</span>
          <span className="ml-auto">{flat.length} results</span>
        </div>
      </div>
    </div>
  );
}
