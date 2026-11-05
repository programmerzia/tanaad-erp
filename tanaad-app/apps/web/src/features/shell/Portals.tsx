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
    const out: { id: PortalId; name: string; legal: string; location: string; tagline: string; roles: Role[]; open: boolean }[] = [];
    out.push({
      id: 'group',
      name: 'Group Operations HQ',
      legal: COMPANY.groupName,
      location: '8th Floor, DTB Centre, Kampala',
      tagline: 'Executive governance, cross-plant finance & consolidated reporting',
      roles: access.group && access.groupRole ? [access.groupRole] : [],
      open: access.group,
    });
    const locMap: Record<SiteCode, { name: string; location: string; tagline: string }> = {
      mats: {
        name: 'Kawempe Woven Mats Plant',
        location: 'Plot 412, Kawempe Industrial Area',
        tagline: 'PP extrusion, 15 circular looms & mat finishing',
      },
      bags: {
        name: 'Tanaad Packages Ltd',
        location: 'Nabweru Road, Bwaise',
        tagline: 'Woven PP packaging sacks, valve bags & roll conversion',
      },
      recycling: {
        name: 'Kawaala HDPE Recycling Plant',
        location: 'Northern Bypass, Kawaala',
        tagline: 'Flake wash line, density separation & melt pelletizing',
      },
    };
    for (const p of access.sites) {
      out.push({
        id: p.id,
        name: locMap[p.id]?.name ?? SITES[p.id].name,
        legal: SITES[p.id].legalName,
        location: locMap[p.id]?.location ?? 'Kampala, Uganda',
        tagline: locMap[p.id]?.tagline ?? SITES[p.id].tagline,
        roles: p.roles,
        open: p.roles.length > 0,
      });
    }
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
    <div className="h-dvh overflow-auto relative text-slate-100 bg-[#0c1418]" data-theme="dark" style={{ background: 'linear-gradient(180deg, #0e171c 0%, #0a1114 100%)' }}>
      <div className="relative max-w-[1280px] mx-auto px-5 sm:px-8 py-6 min-h-full flex flex-col">
        {/* Top Operational Bar */}
        <header className="flex items-center justify-between pb-5 mb-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Logo onDark size={32} />
            <div className="h-4 w-px bg-white/20 hidden sm:block" />
            <span className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase hidden sm:block">
              Group Operations Platform · v4.0
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right leading-tight">
              <div className="text-[13px] font-semibold text-white">{user.name}</div>
              <div className="text-[11px] text-slate-400">Authenticated · {roleLabel(user.roles[0]?.role ?? 'supervisor')}</div>
            </div>
            <Avatar name={user.name} seed={user.avatarSeed} size={32} />
            <button
              onClick={() => { s.signOut(); nav({ to: '/' }); }}
              className="h-8 px-3 rounded-md border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-medium inline-flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors"
            >
              <LogOut className="size-3" />
              Sign out
            </button>
          </div>
        </header>

        {/* Executive Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold tracking-wider text-[var(--color-amber-400)] uppercase mb-1">
            <span className="size-2 rounded-full bg-[var(--color-amber-400)]" />
            TANAAD HOLDINGS · ENTERPRISE OPERATIONS LAUNCHPAD
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Manufacturing Operations & Plant Portals
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-[75ch]">
            Select a physical manufacturing plant or Group Headquarters to open its operational workspace.
            Each facility maintains an independent local SQLite offline cache for shopfloor resilience.
          </p>
        </div>

        {/* 4 Plant / HQ Cards */}
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
              <div
                key={c.id}
                role={c.open ? 'button' : undefined}
                tabIndex={c.open ? 0 : -1}
                aria-disabled={!c.open}
                onClick={() => open(c.id)}
                onFocus={() => c.open && setFocus(idx)}
                onMouseEnter={() => c.open && setFocus(idx)}
                className={cn(
                  'group relative rounded-xl border p-4.5 flex flex-col text-left transition-all outline-none overflow-hidden',
                  c.open
                    ? 'cursor-pointer bg-[#121f26] hover:bg-[#162730] border-[#203642] hover:border-[#335365]'
                    : 'bg-[#0f181d] border-white/5 opacity-55',
                  c.open && focused && 'border-white/40 ring-1 ring-white/20'
                )}
              >
                <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: c.open ? col : 'transparent' }} />
                
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="size-9 rounded-lg grid place-items-center text-white" style={{ background: col }}>
                      <Icon className="size-4.5" strokeWidth={2.2} />
                    </span>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">{c.legal}</div>
                      <div className="text-base font-bold text-white leading-tight">{c.name}</div>
                    </div>
                  </div>
                  {c.open ? (
                    <span className="[&_kbd]:bg-white/10 [&_kbd]:border-white/20 [&_kbd]:text-white/70">
                      <Kbd keys={String(idx + 1)} />
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                      <Lock className="size-3" /> Locked
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-400 font-mono mb-1">{c.location}</div>
                <div className="text-[12px] text-slate-300 mb-4 line-clamp-2">{c.tagline}</div>

                {c.open ? (
                  <>
                    <div className="grid grid-cols-3 gap-2 py-2.5 px-3 rounded-lg bg-black/30 border border-white/5 mb-3 text-center">
                      <div>
                        <div className="num text-base font-bold text-white">{hc}</div>
                        <div className="text-[9.5px] uppercase tracking-wider text-slate-400 mt-0.5">on shift</div>
                      </div>
                      <div>
                        <div className="num text-base font-bold text-white">
                          {units === null ? compact(cash) : fmtNum(units)}
                        </div>
                        <div className="text-[9.5px] uppercase tracking-wider text-slate-400 mt-0.5">
                          {units === null ? 'UGX Safe' : `${UNIT[c.id as SiteCode]}`}
                        </div>
                      </div>
                      <div>
                        <div className={cn('num text-base font-bold', ex > 0 ? 'text-[var(--color-amber-400)]' : 'text-white')}>
                          {ex}
                        </div>
                        <div className="text-[9.5px] uppercase tracking-wider text-slate-400 mt-0.5">actions</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 mb-3 px-2 text-xs text-slate-400">
                      <span className="text-[11px]">7-day trend</span>
                      <Sparkline data={spark.length > 1 ? spark : [0, 0]} color={col} width={90} height={22} />
                    </div>

                    {c.id !== 'group' && c.roles.length > 1 && (
                      <div className="flex flex-wrap gap-1 mb-3" onClick={(e) => e.stopPropagation()}>
                        {c.roles.map((r) => {
                          const on = (rolePick[c.id as SiteCode] ?? c.roles[0]) === r;
                          return (
                            <button
                              key={r}
                              onClick={() => setRolePick((p) => ({ ...p, [c.id]: r }))}
                              className={cn(
                                'h-6 px-2 rounded text-[11px] font-medium border transition-colors',
                                on ? 'bg-white text-slate-900 border-white font-semibold' : 'border-white/15 text-slate-400 hover:text-white hover:bg-white/5'
                              )}
                            >
                              {roleLabel(r)}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-auto flex items-center justify-between pt-3 border-t border-white/10 text-xs">
                      <span className="text-slate-400">
                        role: <span className="text-white font-medium">{roleLabel(c.id === 'group' ? c.roles[0] : rolePick[c.id as SiteCode] ?? c.roles[0])}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold text-white group-hover:text-[var(--color-amber-400)] transition-colors">
                        Enter Portal
                        <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="mt-auto text-xs text-slate-500 pt-3 border-t border-white/5 italic">
                    Restricted access. Role assignment required from Group Administrator.
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Operational Streams: Decisions & Audits */}
        <div className="grid gap-4 lg:grid-cols-2 mb-6">
          <div className="rounded-xl border border-white/10 bg-[#121f26] p-4.5">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
                Pending Facility Approvals & Decisions
              </span>
              <span className="num text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {alerts.length} pending
              </span>
            </div>
            {alerts.length === 0 ? (
              <div className="text-xs text-slate-400 py-3">No outstanding decisions across plants.</div>
            ) : (
              alerts.slice(0, 4).map((e) => (
                <div key={e.id} className="flex items-start gap-2.5 py-2 border-t border-white/5 first:border-t-0">
                  <span
                    className="mt-1 size-2 rounded-full shrink-0"
                    style={{ background: e.severity === 'critical' ? '#ef4444' : e.severity === 'warning' ? '#f59e0b' : '#3b82f6' }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-white truncate">{e.title}</div>
                    <div className="text-[11px] text-slate-400">
                      {SITES[e.siteId].name} · Assigned to {roleLabel(e.ownerRole)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-[#121f26] p-4.5">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
                Live Plant Operational Log
              </span>
              <span className="text-[11px] font-mono text-slate-500">Immutable Ledger</span>
            </div>
            {recent.length === 0 ? (
              <div className="text-xs text-slate-400 py-3">No activity recorded today.</div>
            ) : (
              recent.map((a) => (
                <div key={a.id} className="flex items-start gap-2.5 py-2 border-t border-white/5 first:border-t-0">
                  <Avatar name={a.actorName} size={18} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-200 truncate">{a.summary}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {a.actorName} · {fmtDateTime(a.at)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Enterprise Footer */}
        <footer className="mt-auto pt-4 pb-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 border-t border-white/10">
          <span className="[&_kbd]:bg-white/10 [&_kbd]:border-white/20 [&_kbd]:text-white/70 inline-flex items-center gap-1.5 touch:hidden">
            <Kbd keys="1" />–<Kbd keys="4" /> open portal · <Kbd keys="arrowleft" /><Kbd keys="arrowright" /> navigate · <Kbd keys="enter" /> open
          </span>
          <div className="flex items-center gap-3">
            <span>Kampala, Uganda (EAT UTC+3)</span>
            <span>•</span>
            <span className="font-mono text-slate-400">Tanaad ERP v4.0 Industrial Edition</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
