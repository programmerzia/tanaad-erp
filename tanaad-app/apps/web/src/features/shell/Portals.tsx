import { COMPANY } from '@/config/company';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Building2, Factory, Lock, LogOut, Recycle, ShoppingBag, type LucideIcon } from 'lucide-react';
import type { Role, SiteCode } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { SITES } from '@/config/sites';
import { roleLabel } from '@/config/roles';
import { Avatar, Kbd, cn } from '@/components/ui';
import { Sparkline } from '@/components/charts';
import { cashInSafe, dailySeries, DEMO_HOUR, headcount, lastWorkingDays, openExceptions, outputToday, portalsFor } from '@/data/selectors';
import { compact, fmtDateTime, fmtDayLong, fmtNum } from '@/data/format';
import { WeavePattern, Logo } from './BrandPanel';

type PortalId = 'group' | SiteCode;
const ICON: Record<PortalId, LucideIcon> = { group: Building2, mats: Factory, bags: ShoppingBag, recycling: Recycle };
const COLOR: Record<PortalId, string> = { group: 'var(--site-group)', mats: 'var(--site-mats)', bags: 'var(--site-bags)', recycling: 'var(--site-recycling)' };
const UNIT: Record<SiteCode, string> = { mats: 'mats', bags: 'packs', recycling: 'sacks' };

/**
 * The launcher: one card per portal the signed-in person may open. Portals they cannot open are shown locked,
 * so access control is visible rather than assumed. Keys: 1–4 open a portal, ←/→ move, Enter opens.
 */
export function Portals() {
  const s = useStore(); const nav = useNavigate();
  const userId = s.auth?.userId ?? s.session?.userId ?? '';
  const access = useMemo(() => portalsFor(s, userId), [s.users, userId]); // eslint-disable-line react-hooks/exhaustive-deps
  const user = access.user;
  const [rolePick, setRolePick] = useState<Partial<Record<SiteCode, Role>>>({});
  const [focus, setFocus] = useState(0);

  const cards = useMemo(() => {
    const out: { id: PortalId; name: string; legal: string; tagline: string; roles: Role[]; open: boolean }[] = [];
    out.push({ id: 'group', name: 'Head Office', legal: COMPANY.name, tagline: 'All three sites on one screen', roles: access.group && access.groupRole ? [access.groupRole] : [], open: access.group });
    for (const p of access.sites) out.push({ id: p.id, name: SITES[p.id].name, legal: SITES[p.id].legalName, tagline: SITES[p.id].tagline.split(' · ').slice(1).join(' · '), roles: p.roles, open: p.roles.length > 0 });
    return out;
  }, [access]);
  const openable = cards.filter((c) => c.open);

  const open = (id: PortalId) => {
    const card = cards.find((c) => c.id === id); if (!card?.open || !user) return;
    if (id === 'group') { s.signIn(user.id, card.roles[0]); nav({ to: '/g/cockpit' as never }); return; }
    const role = rolePick[id] ?? card.roles[0];
    s.signIn(user.id, role, id);
    nav({ to: `/s/${id}/${role === 'ceo' || role === 'group_admin' || role === 'site_manager' ? 'dashboard' : 'today'}` as never });
  };

  useEffect(() => { if (!user) nav({ to: '/' }); }, [user, nav]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[1-4]$/.test(e.key) && openable[+e.key - 1]) { e.preventDefault(); open(openable[+e.key - 1].id); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setFocus((f) => (f + 1) % openable.length); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setFocus((f) => (f - 1 + openable.length) % openable.length); }
      else if (e.key === 'Enter' && openable[focus] && !(e.target as HTMLElement).closest('button')) { e.preventDefault(); open(openable[focus].id); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openable.map((c) => c.id).join(), focus, rolePick]);

  if (!user) return null;
  const greet = DEMO_HOUR < 12 ? 'Good morning' : DEMO_HOUR < 17 ? 'Good afternoon' : 'Good evening';
  const mySites = access.sites.filter((p) => p.roles.length).map((p) => p.id);
  const recent = s.audit.filter((a) => !a.siteId || mySites.includes(a.siteId)).slice(0, 4);
  const alerts = openExceptions(s).filter((e) => mySites.includes(e.siteId));

  return (
    <div className="h-dvh overflow-auto relative text-white" data-theme="dark" style={{ background: 'radial-gradient(1100px 520px at 88% -12%, rgb(217 126 34 / .22), transparent 62%), radial-gradient(900px 600px at -10% 110%, rgb(42 120 214 / .16), transparent 60%), linear-gradient(160deg, #0a1a20, #12313a 65%, #173a45)' }}>
      <WeavePattern className="pointer-events-none absolute inset-0 w-full h-full text-white/[0.04]" />
      <div className="relative max-w-[1240px] mx-auto px-5 sm:px-8 py-5 min-h-full flex flex-col">
        <header className="flex items-center justify-between mb-8 sm:mb-12">
          <Logo onDark size={34} />
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right leading-tight"><div className="text-[13px] font-medium">{user.name}</div><div className="text-[11.5px] text-white/50">Signed in {s.auth?.method === 'pin' ? 'with PIN' : 'with password'}</div></div>
            <Avatar name={user.name} seed={user.avatarSeed} size={34} />
            <button onClick={() => { s.signOut(); nav({ to: '/' }); }} className="h-9 px-3 rounded-lg border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] text-[13px] font-medium inline-flex items-center gap-1.5"><LogOut className="size-3.5" />Sign out</button>
          </div>
        </header>

        <div className="mb-6">
          <div className="text-[13px] text-white/55 mb-1.5">{fmtDayLong(s.today)}</div>
          <h1 className="text-[30px] sm:text-[40px] leading-[1.08] font-semibold tracking-[-0.025em]">{greet}, {user.name.split(' ')[0]}. <span className="text-[var(--color-amber-400)]">Where to?</span></h1>
          <p className="text-[14.5px] text-white/60 mt-2 max-w-[62ch]">{openable.length === 1 ? 'You have one portal. Press Enter to open it.' : `You can open ${openable.length} of ${cards.length} portals. Each one is its own workspace, with its own people, cash, stock and production.`}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
          {cards.map((c) => {
            const Icon = ICON[c.id]; const col = COLOR[c.id]; const idx = openable.findIndex((o) => o.id === c.id); const focused = c.open && idx === focus;
            const sites: SiteCode[] = c.id === 'group' ? ['mats', 'bags', 'recycling'] : [c.id];
            const hc = sites.reduce((t, x) => t + headcount(s, x, s.today).total, 0);
            const cash = sites.reduce((t, x) => t + cashInSafe(s, x), 0);
            const ex = sites.reduce((t, x) => t + openExceptions(s, x).length, 0);
            const units = c.id === 'group' ? null : outputToday(s, c.id, s.today).reduce((t, o) => t + o.units, 0);
            const spark = c.id === 'group' ? lastWorkingDays('mats', s.today, 7).map((d) => (['mats', 'bags', 'recycling'] as SiteCode[]).reduce((t, x) => t + (dailySeries(s, x, [d])[0]?.cashIn ?? 0), 0)).slice(0, -1) : dailySeries(s, c.id, lastWorkingDays(c.id, s.today, 7)).slice(0, -1).map((d) => d.units);
            return (
              <div key={c.id} role={c.open ? 'button' : undefined} tabIndex={c.open ? 0 : -1} aria-disabled={!c.open} onClick={() => open(c.id)} onFocus={() => c.open && setFocus(idx)} onMouseEnter={() => c.open && setFocus(idx)}
                className={cn('group relative rounded-2xl border p-5 flex flex-col text-left transition-all outline-none overflow-hidden', c.open ? 'cursor-pointer bg-white/[0.06] hover:bg-white/[0.1] backdrop-blur-sm' : 'bg-white/[0.025] border-white/[0.07] opacity-60', c.open && (focused ? 'border-white/40 shadow-[0_18px_50px_-18px_rgb(0_0_0/.7)] -translate-y-0.5' : 'border-white/12'))}>
                <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: c.open ? col : 'transparent' }} />
                <div className="flex items-start justify-between mb-4">
                  <span className="size-11 rounded-xl grid place-items-center" style={{ background: `color-mix(in srgb, ${col} 22%, transparent)`, color: c.open ? '#fff' : 'rgb(255 255 255 / .6)' }}><Icon className="size-5" /></span>
                  {c.open ? <span className="[&_kbd]:bg-white/10 [&_kbd]:border-white/20 [&_kbd]:text-white/70"><Kbd keys={String(idx + 1)} /></span> : <span className="inline-flex items-center gap-1 text-[11.5px] text-white/55"><Lock className="size-3" />No access</span>}
                </div>
                <div className="text-[11px] uppercase tracking-[0.12em] font-semibold mb-0.5" style={{ color: c.open ? `color-mix(in srgb, ${col} 70%, #fff)` : 'rgb(255 255 255 / .4)' }}>{c.legal}</div>
                <div className="text-[21px] font-semibold tracking-[-0.01em] leading-tight">{c.name}</div>
                <div className="text-[12.5px] text-white/55 mb-4">{c.tagline}</div>

                {c.open ? <>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div><div className="num text-[19px] font-semibold leading-none">{hc}</div><div className="text-[10.5px] uppercase tracking-wider text-white/45 mt-1">on shift</div></div>
                    <div><div className="num text-[19px] font-semibold leading-none">{units === null ? compact(cash) : fmtNum(units)}</div><div className="text-[10.5px] uppercase tracking-wider text-white/45 mt-1">{units === null ? 'UGX cash' : `${UNIT[c.id as SiteCode]} today`}</div></div>
                    <div><div className={cn('num text-[19px] font-semibold leading-none', ex > 0 && 'text-[var(--color-amber-400)]')}>{ex}</div><div className="text-[10.5px] uppercase tracking-wider text-white/45 mt-1">to decide</div></div>
                  </div>
                  <div className="flex items-end justify-between gap-3 mb-4 rounded-lg bg-black/15 px-3 py-2">
                    <div className="text-[11px] text-white/50 leading-tight">{c.id === 'group' ? 'Cash in, group' : `${UNIT[c.id as SiteCode][0].toUpperCase()}${UNIT[c.id as SiteCode].slice(1)} per day`}<br /><span className="text-white/35">last 6 working days</span></div>
                    <Sparkline data={spark.length > 1 ? spark : [0, 0]} color={`color-mix(in srgb, ${col} 75%, #fff)`} width={108} height={30} />
                  </div>
                  {c.id !== 'group' && c.roles.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 mb-3" onClick={(e) => e.stopPropagation()}>
                      {c.roles.map((r) => { const on = (rolePick[c.id as SiteCode] ?? c.roles[0]) === r; return <button key={r} onClick={() => setRolePick((p) => ({ ...p, [c.id]: r }))} className={cn('h-7 px-2.5 rounded-md text-[12px] font-medium border', on ? 'bg-white text-[var(--color-ink-900)] border-white' : 'border-white/20 text-white/75 hover:bg-white/10')}>{roleLabel(r)}</button>; })}
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between pt-3 border-t border-white/10">
                    <span className="text-[12.5px] text-white/60">as <span className="text-white font-medium">{roleLabel(c.id === 'group' ? c.roles[0] : rolePick[c.id as SiteCode] ?? c.roles[0])}</span></span>
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">Open portal<ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" style={{ color: `color-mix(in srgb, ${col} 70%, #fff)` }} /></span>
                  </div>
                </> : <div className="mt-auto text-[12.5px] text-white/45 pt-3 border-t border-white/[0.07]">Your account has no role here. A Group Admin can grant one.</div>}
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-2 mb-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between mb-2"><span className="text-[11px] uppercase tracking-[0.1em] font-semibold text-white/50">Waiting for a decision</span><span className="num text-[12px] text-white/50">{alerts.length}</span></div>
            {alerts.length === 0 ? <div className="text-[13px] text-white/50 py-2">Nothing is waiting in your portals.</div> : alerts.slice(0, 4).map((e) => (
              <div key={e.id} className="flex items-start gap-2.5 py-1.5 border-t border-white/[0.07] first:border-t-0">
                <span className="mt-[6px] size-1.5 rounded-full shrink-0" style={{ background: e.severity === 'critical' ? '#ef7a69' : e.severity === 'warning' ? '#f0a04b' : 'rgb(255 255 255 / .4)' }} />
                <div className="min-w-0 flex-1"><div className="text-[13px] truncate">{e.title}</div><div className="text-[11.5px] text-white/45">{SITES[e.siteId].shortName} · {roleLabel(e.ownerRole)} to decide</div></div>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between mb-2"><span className="text-[11px] uppercase tracking-[0.1em] font-semibold text-white/50">Latest on the record</span><span className="text-[12px] text-white/40">append-only</span></div>
            {recent.length === 0 ? <div className="text-[13px] text-white/50 py-2">No recent activity.</div> : recent.map((a) => (
              <div key={a.id} className="flex items-start gap-2.5 py-1.5 border-t border-white/[0.07] first:border-t-0">
                <Avatar name={a.actorName} size={20} className="mt-0.5" />
                <div className="min-w-0 flex-1"><div className="text-[13px] truncate">{a.summary}</div><div className="text-[11.5px] text-white/45">{a.actorName} · {fmtDateTime(a.at)}</div></div>
              </div>
            ))}
          </div>
        </div>

        <footer className="mt-auto pt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-white/40">
          <span className="[&_kbd]:bg-white/10 [&_kbd]:border-white/20 [&_kbd]:text-white/70 inline-flex items-center gap-1.5 touch:hidden"><Kbd keys="1" />–<Kbd keys="4" /> open a portal · <Kbd keys="arrowleft" /><Kbd keys="arrowright" /> move · <Kbd keys="enter" /> open</span>
          <span>Tanaad Management System · v0.2 demo</span>
        </footer>
      </div>
    </div>
  );
}
