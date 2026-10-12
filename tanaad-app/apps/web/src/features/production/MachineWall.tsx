import { useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, Clock, Eye, Factory, Flame, GanttChart, ListChecks, PackageCheck, Plus, Recycle, Scale, ScrollText, Timer, Trophy, Wrench, type LucideIcon } from 'lucide-react';
import type { ShiftKind } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useRefList, useSite, useSession, useGo } from '@/app/hooks';
import { Avatar, Badge, Bar, Button, DataGrid, Empty, Kbd, KpiStrip, Meter, Note, Panel, Stat, Status, Tabs, cn, useHotkey, type Column } from '@/components/ui';
import { ColumnChart, CountUp, Delta, Legend, LineChart, Sparkline, TimeTrack } from '@/components/charts';
import { currentShiftKind, lastWorkingDays, machineWall, massBalanceDay, shiftId, type MachineTile, type ProductionEntry } from '@/data/selectors';
import { fmtDayLong, fmtDayShort, fmtKg, fmtNum, fmtTime } from '@/data/format';
import { SITE_COLOR } from '@/config/siteIdentity';
import { ShiftEntrySheet } from './ShiftEntrySheet';
import { NOW_LABEL, REASON_AFTER_MIN, perUnit, byProduct, cap, codeKey, downtimeByReason, hourOf, shiftHistory, shiftWindow, wallConfig, wallTotals, type WallConfig } from './shared';
import { IconChip, MassBadge, MassBalance, Quiet, STATE, Swatch } from './parts';

type Filter = 'all' | 'logged' | 'not_logged' | 'below' | 'down';
const LOGGED: MachineTile['state'][] = ['ok', 'logged', 'below'];
const matches = (t: MachineTile, f: Filter) => f === 'all' || (f === 'logged' ? LOGGED.includes(t.state) : t.state === f);
const dash = <span className="text-[var(--text-4)]">—</span>;
const yieldOf = (e: ProductionEntry) => (e.inputKg ? Math.round((e.outputKg / e.inputKg) * 1000) / 10 : 0);

/* ───────────────────────────── Machine tile ───────────────────────────── */
/** One machine on the wall: status edge and tint, who is on it, what it runs, the count against what is due by now. */
function Tile({ t, cfg, yieldFloor, readOnly, dim, selected, tabbable, wide, cause, last, onOpen, onFocus }: { t: MachineTile; cfg: WallConfig; yieldFloor: number; readOnly: boolean; dim: boolean; selected: boolean; tabbable: boolean; wide: boolean; cause?: string; last?: { entry: ProductionEntry; operator?: string }; onOpen: () => void; onFocus: () => void }) {
  const { machine: m, entry: e, product, operator, pct, state, expectedSoFar } = t; const st = STATE[state];
  const kgIO = cfg.kgMode === 'in_out'; const trouble = state === 'below' || state === 'down' || state === 'not_logged';
  const Comp: 'button' | 'div' = readOnly ? 'div' : 'button';
  return (
    <Comp data-tile={m.id} tabIndex={readOnly ? undefined : tabbable ? 0 : -1} onClick={readOnly ? undefined : onOpen} onFocus={readOnly ? undefined : onFocus}
      aria-label={`${m.code}, ${st.label}${operator ? `, ${operator.fullName}` : ''}`}
      className={cn('relative text-left rounded-lg border pl-3 pr-2.5 py-2 flex flex-col gap-[5px] min-w-0 overflow-hidden transition-opacity', selected ? 'border-[var(--focus)]' : 'border-[var(--line)]', !readOnly && 'lift', dim && 'opacity-30')}
      style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${st.color} ${state === 'down' ? 14 : trouble ? 9 : 5}%, var(--surface)), var(--surface) 78%)` }}>
      <span className="absolute left-0 inset-y-0 w-[3px]" style={{ background: st.color }} />
      <div className="flex items-center justify-between gap-2">
        <span className="t-sm font-semibold whitespace-nowrap">{m.code}</span>
        <span className={cn('inline-flex items-center gap-1 t-xs font-medium whitespace-nowrap', trouble ? '' : 'text-[var(--text-2)]')} style={trouble ? { color: st.color } : undefined}>
          {state === 'down' ? <Wrench className="size-3" /> : <span className={cn('size-1.5 rounded-full', state === 'not_logged' && 'anim-live')} style={{ background: st.color }} />}{st.label}
        </span>
      </div>
      {e ? (
        <>
          <div className="flex items-center gap-1.5 min-w-0 t-sm">
            {operator ? <><Avatar name={operator.fullName} seed={operator.avatarSeed} size={18} /><span className="font-medium truncate shrink-0 max-w-[46%]">{wide ? operator.fullName : operator.fullName.split(' ')[0]}</span></> : <span className="text-[var(--text-3)]">No operator</span>}
            {product && <><Swatch colour={product.colour} className="ml-1" /><span className="text-[var(--text-2)] truncate">{product.internalName}</span></>}
          </div>
          <div className="flex items-baseline justify-between gap-2">
            {kgIO
              ? <span className="min-w-0 truncate"><span className="num t-lg font-semibold">{fmtNum(Math.round(e.outputKg))}</span><span className="t-xs text-[var(--text-3)]"> kg out of {fmtNum(Math.round(e.inputKg))}</span></span>
              : <span className="min-w-0 truncate"><span className="num t-lg font-semibold">{fmtNum(e.goodUnits)}</span><span className="t-xs text-[var(--text-3)]">{expectedSoFar ? ` / ${fmtNum(expectedSoFar)} due` : ` ${cfg.unit}`}</span></span>}
            {kgIO ? <span className="num t-sm font-semibold shrink-0">{yieldOf(e)}%<span className="t-xs font-normal text-[var(--text-3)]"> yield</span></span>
              : pct !== undefined ? <span className={cn('num t-sm font-semibold shrink-0', state === 'below' && 'text-[var(--bad)]')}>{pct}%</span>
                : <span className="num t-sm text-[var(--text-2)] shrink-0">{fmtKg(Math.round(e.outputKg))}</span>}
          </div>
          {kgIO ? <Bar value={e.outputKg} max={e.inputKg || 1} tone={yieldOf(e) < yieldFloor ? 'warn' : 'ok'} height={4} /> : pct !== undefined ? <Bar value={Math.min(100, pct)} max={100} tone={state === 'below' ? 'bad' : 'ok'} height={4} /> : null}
          {wide && (
            <div className="grid grid-cols-4 gap-2 mt-1 pt-1.5 border-t border-[var(--line)]">
              {[['Input', fmtKg(Math.round(e.inputKg))], ['Output', fmtKg(Math.round(e.outputKg))], [cap(cfg.unit), fmtNum(e.goodUnits)], ['Rejects', fmtNum(e.rejectUnits)]].map(([k, v]) => <div key={k} className="min-w-0"><div className="t-xs text-[var(--text-3)]">{k}</div><div className="num t-base font-medium truncate">{v}</div></div>)}
            </div>
          )}
          {wide && last && <div className="t-xs text-[var(--text-3)] truncate">Previous shift <span className="num text-[var(--text-2)]">{kgIO ? `${fmtKg(Math.round(last.entry.outputKg))} out · ${yieldOf(last.entry)}% yield` : `${fmtNum(last.entry.goodUnits)} ${cfg.unit}`}</span>{last.operator ? ` · ${last.operator}` : ''}</div>}
          <div className="flex items-center justify-between gap-2 t-xs text-[var(--text-3)] mt-auto">
            <span className={cn('inline-flex items-center gap-1 min-w-0', e.downtimeMin > REASON_AFTER_MIN && 'text-[var(--warn)] font-medium')}>
              <Clock className="size-3 shrink-0" /><span className="truncate">{e.downtimeMin ? <><span className="num">{e.downtimeMin}</span> min{e.downtimeReason ? ` · ${e.downtimeReason}` : ''}</> : 'No downtime'}{state === 'below' && !e.downtimeReason && <span className="text-[var(--bad)]"> · no reason</span>}</span>
            </span>
            <span className="num shrink-0">{fmtTime(e.at)}</span>
          </div>
        </>
      ) : (
        <>
          <div className="t-sm text-[var(--text-2)] truncate">{state === 'down' ? (cause ?? 'Reported to the mechanic') : 'No entry this shift'}</div>
          {!readOnly && (
            <span className="mt-0.5 inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-[var(--brand)] text-[var(--brand-contrast)] t-xs font-semibold w-fit shadow-xs">
              <Plus className="size-3.5" />Log output
            </span>
          )}
          <div className="t-xs text-[var(--text-3)] truncate mt-auto">{last ? <>Last shift <span className="num">{fmtNum(cfg.kgMode === 'in_out' ? Math.round(last.entry.outputKg) : last.entry.goodUnits)}</span> {cfg.kgMode === 'in_out' ? 'kg' : cfg.unit}{last.operator ? ` · ${last.operator.split(' ')[0]}` : ''}</> : 'Never logged'}</div>
        </>
      )}
    </Comp>
  );
}

/* ───────────────────────────── Shift replay (Gantt) ───────────────────────────── */
const SEG = {
  run: 'color-mix(in srgb, var(--ok) 70%, var(--surface))',
  below: 'color-mix(in srgb, var(--bad) 42%, var(--surface))',
  downtime: 'var(--warn)',
  down: 'var(--bad)',
  since: 'color-mix(in srgb, var(--text-4) 38%, var(--surface))',
  hatch: 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--warn) 55%, transparent) 0 3px, transparent 3px 7px)',
};

/** The shift hour by hour: one row per machine, what ran, what stood still, what nobody has logged. */
function ShiftReplay({ wall, kind, day, cfg }: { wall: MachineTile[]; kind: ShiftKind; day: string; cfg: WallConfig }) {
  const site = useSite(); const today = useStore((s) => s.today); const breakdowns = useStore((s) => s.breakdowns);
  const w = shiftWindow(site, today, day, kind); const { start, span, nowH } = w;
  const rows = wall.filter((t) => t.state !== 'arriving');
  const hours = Array.from({ length: span + 1 }, (_, i) => (start + i) % 24);
  const x = (h: number) => `${Math.max(0, Math.min(100, (h / span) * 100))}%`;
  const wd = (a: number, b: number) => `${Math.max(0, Math.min(100, ((b - a) / span) * 100))}%`;
  if (rows.length === 0) return <Empty icon={Factory} title="No machines on this wall yet" />;
  return (
    <div className="relative pt-5 [--lab:54px] sm:[--lab:76px] [--sum:0px] md:[--sum:118px]">
      <div className="grid grid-cols-[var(--lab)_minmax(0,1fr)_var(--sum)] gap-x-3 mb-1">
        <div />
        <div className="relative h-4 t-xs num text-[var(--text-3)]">{hours.map((h, i) => <span key={i} className={cn('absolute -translate-x-1/2', i % 2 === 1 && 'hidden sm:block')} style={{ left: x(i) }}>{String(h).padStart(2, '0')}</span>)}</div>
        <div className="hidden md:block t-xs text-[var(--text-3)] text-right">Output · downtime</div>
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((t) => {
          const e = t.entry; const logAt = e ? Math.max(0, Math.min(span, (hourOf(e.at) - start + 24) % 24)) : undefined;
          const end = logAt === undefined ? 0 : Math.min(logAt, nowH); const downH = e ? Math.min(end, e.downtimeMin / 60) : 0;
          const bd = t.state === 'down' ? breakdowns.find((b) => b.machineId === t.machine.id && !b.resolvedAt) : undefined;
          const downFrom = bd && bd.startedAt.slice(0, 10) === day ? Math.max(0, Math.min(nowH, (hourOf(bd.startedAt) - start + 24) % 24)) : 0;
          const title = `${t.machine.code} · ${STATE[t.state].label}${e ? ` · logged ${fmtTime(e.at)}` : ''}${e?.downtimeMin ? ` · ${e.downtimeMin} min downtime${e.downtimeReason ? ` (${e.downtimeReason})` : ''}` : ''}`;
          return (
            <div key={t.machine.id} title={title} className="grid grid-cols-[var(--lab)_minmax(0,1fr)_var(--sum)] gap-x-3 items-center rounded-[4px] hover:bg-[var(--hover)]">
              <div className="t-sm font-medium text-right truncate">{t.machine.code}</div>
              <div className="relative h-[18px] rounded-[4px] bg-[var(--surface-3)] overflow-hidden">
                {hours.map((_, i) => i > 0 && i < span && <span key={i} className="absolute inset-y-0 w-px bg-[var(--surface)] opacity-70" style={{ left: x(i) }} />)}
                {t.state === 'down' ? <>
                  {downFrom > 0 && <div className="absolute inset-y-0 left-0" style={{ width: wd(0, downFrom), background: SEG.run }} />}
                  <div className="absolute inset-y-0" style={{ left: x(downFrom), width: wd(downFrom, nowH), background: SEG.down }} />
                </> : !e ? <div className="absolute inset-y-0 left-0" style={{ width: x(nowH), background: SEG.hatch }} /> : <>
                  <div className="absolute inset-y-0 left-0" style={{ width: wd(0, end - downH), background: t.state === 'below' ? SEG.below : SEG.run }} />
                  {downH > 0 && <div className="absolute inset-y-0" style={{ left: x(end - downH), width: wd(end - downH, end), background: SEG.downtime }} />}
                  {nowH - end > 0.05 && <div className="absolute inset-y-0" style={{ left: x(end), width: wd(end, nowH), background: SEG.since }} />}
                  <div className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-[var(--text)]" style={{ left: x(end) }} />
                </>}
              </div>
              <div className="hidden md:block t-xs num text-right text-[var(--text-2)] truncate">{e ? <>{cfg.kgMode === 'in_out' ? fmtKg(Math.round(e.outputKg)) : `${fmtNum(e.goodUnits)} ${cfg.unit}`}<span className={cn('text-[var(--text-3)]', e.downtimeMin > REASON_AFTER_MIN && 'text-[var(--warn)]')}> · {e.downtimeMin} min</span></> : <span className="text-[var(--text-3)]">{STATE[t.state].label}</span>}</div>
            </div>
          );
        })}
      </div>
      {/* "Now" runs through every row */}
      {w.phase === 'running' && (
        <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: 'calc(var(--lab) + 12px)', right: 'calc(var(--sum) + 12px)' }}>
          <div className="absolute top-4 bottom-0 w-px bg-[var(--accent)]" style={{ left: x(nowH) }} />
          <div className="absolute top-0 -translate-x-1/2 h-4 px-1.5 rounded-[4px] bg-[var(--accent)] text-white t-xs num font-semibold leading-4" style={{ left: x(nowH) }}>{NOW_LABEL} now</div>
        </div>
      )}
      {w.phase === 'upcoming' && <div className="absolute inset-x-0 bottom-0 top-10 grid place-items-center pointer-events-none"><span className="t-sm text-[var(--text-2)] bg-[var(--surface)] border border-[var(--line)] rounded-md px-2.5 py-1">This shift starts at {w.starts}. Nothing has run yet.</span></div>}
    </div>
  );
}

/* ───────────────────────────── Screen ───────────────────────────── */
/** The signature screen: every machine of the site's main stage on one wall, logged from the keyboard or by selecting a tile. */
export function MachineWall() {
  const s = useStore(); const site = useSite(); const session = useSession(); const go = useGo(); const cfg = wallConfig(site.id);
  const [kind, setKind] = useState<ShiftKind>(() => currentShiftKind());
  const [view, setView] = useState<'wall' | 'table'>('wall');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<{ id: string; typed?: string; nonce: number } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null); const board = useRef<HTMLDivElement>(null); const nonce = useRef(0);
  const day = s.today;
  const readOnly = session?.role === 'ceo' || session?.role === 'group_admin';
  const wall = useMemo(() => machineWall(s, site.id, day, kind), [s, site.id, day, kind]);
  const running = wall.filter((t) => t.state !== 'arriving'); const arriving = wall.filter((t) => t.state === 'arriving');
  const count = (st: MachineTile['state'][]) => wall.filter((t) => st.includes(t.state)).length;
  const logged = count(LOGGED); const notLogged = count(['not_logged']); const below = count(['below']); const down = count(['down']);
  const tot = wallTotals(running); const mb = massBalanceDay(s, site.id, day);
  const win = shiftWindow(site, s.today, day, kind); const kgIO = cfg.kgMode === 'in_out';
  const sack = perUnit(useRefList('material'), 'sack')[0]; const yieldFloor = 100 - site.thresholds.massGapPct;
  const hist = useMemo(() => shiftHistory(s, site.id, cfg.stage, kind, lastWorkingDays(site.id, s.today, 7)), [s, site.id, cfg.stage, kind]);
  const past = hist.slice(0, -1).filter((d) => d.entries > 0);
  const products = byProduct(running); const reasons = downtimeByReason(running);
  const ranked = running.filter((t) => t.pct !== undefined && t.operator).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  const attention = running.filter((t) => t.state === 'not_logged' || t.state === 'below' || t.state === 'down');
  const longest = [...running].filter((t) => t.entry?.downtimeMin).sort((a, b) => b.entry!.downtimeMin - a.entry!.downtimeMin)[0];
  const shown = running.filter((t) => matches(t, filter)); const few = running.length <= 4; const hasBench = running.some((t) => t.pct !== undefined);
  const lastByMachine = useMemo(() => {
    const sh = shiftId(site.id, day, kind); const m = new Map<string, { entry: ProductionEntry; operator?: string }>();
    for (const p of s.production) { if (p.siteId !== site.id || p.stageCode !== cfg.stage || p.shiftId === sh) continue; const c = m.get(p.machineId); if (!c || p.day > c.entry.day || (p.day === c.entry.day && p.at > c.entry.at)) m.set(p.machineId, { entry: p, operator: s.people.find((x) => x.id === p.operatorId)?.fullName }); }
    return m;
  }, [s.production, s.people, site.id, cfg.stage, day, kind]);
  const causeOf = (id: string) => s.breakdowns.find((b) => b.machineId === id && !b.resolvedAt)?.cause;

  const openTile = open ? wall.find((t) => t.machine.id === open.id) ?? null : null;
  const openFor = (id: string, typed?: string) => { if (!readOnly) setOpen({ id, typed, nonce: ++nonce.current }); };
  // Closing the sheet hands the keyboard back to the machine it was opened from (tile on the wall, or the table).
  const close = (id = open?.id) => { setOpen(null); setTimeout(() => (board.current?.querySelector<HTMLElement>(`[data-tile="${id}"]`) ?? board.current?.querySelector<HTMLElement>('[tabindex="0"]'))?.focus(), 0); };
  const nextUnlogged = (except?: string) => wall.find((t) => t.state === 'not_logged' && t.machine.id !== except);
  const logNext = () => { const t = nextUnlogged(); if (t) { setFocusId(t.machine.id); openFor(t.machine.id); } };
  const afterSave = (id: string, next: boolean) => {
    const t = next ? nextUnlogged(id) : undefined;
    if (t) { setFocusId(t.machine.id); openFor(t.machine.id); return; }
    close(id);
    if (next) useStore.getState().toast({ kind: 'ok', title: 'Every running machine is logged', detail: `${site.machineWallTitle} · ${kind} shift` });
  };
  useHotkey('v', () => setView((v) => (v === 'wall' ? 'table' : 'wall')), { label: 'Switch between wall and table', enabled: !open });

  // Roving focus: arrows walk the grid as it is laid out on screen, digits start an entry with that count.
  const onGridKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const cur = (e.target as HTMLElement).closest<HTMLElement>('[data-tile]'); if (!cur || !grid.current || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); openFor(cur.dataset.tile!, e.key); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    const els = [...grid.current.querySelectorAll<HTMLElement>('[data-tile]')]; const i = els.indexOf(cur); let to: HTMLElement | undefined;
    if (e.key === 'ArrowRight') to = els[i + 1]; else if (e.key === 'ArrowLeft') to = els[i - 1]; else if (e.key === 'Home') to = els[0]; else if (e.key === 'End') to = els[els.length - 1];
    else {
      const r = cur.getBoundingClientRect(); const dir = e.key === 'ArrowDown' ? 1 : -1;
      const rowsAway = els.map((el) => ({ el, b: el.getBoundingClientRect() })).filter(({ b }) => (b.top - r.top) * dir > 4);
      const nearest = Math.min(...rowsAway.map(({ b }) => Math.abs(b.top - r.top)));
      to = rowsAway.filter(({ b }) => Math.abs(Math.abs(b.top - r.top) - nearest) < 4).sort((a, b) => Math.abs(a.b.left - r.left) - Math.abs(b.b.left - r.left))[0]?.el;
    }
    e.preventDefault(); if (to) { to.focus(); to.scrollIntoView({ block: 'nearest' }); }
  };

  const unitWord = kgIO ? 'kg' : cfg.unit; const outNow = kgIO ? Math.round(tot.outKg) : tot.good;
  const pills: { key: Filter | 'arriving'; label: string; value: number; dot: string }[] = [
    { key: 'logged', label: 'Logged', value: logged, dot: '#4cc088' },
    { key: 'not_logged', label: 'Not logged', value: notLogged, dot: 'var(--color-amber-400)' },
    { key: 'below', label: 'Below target', value: below, dot: '#ee7b6a' },
    { key: 'down', label: 'Down', value: down, dot: '#ee7b6a' },
    { key: 'arriving', label: 'Arriving', value: arriving.length, dot: 'rgb(255 255 255 / .45)' },
  ];

  const columns: Column<MachineTile>[] = [
    { key: 'm', header: 'Machine', sort: (t) => codeKey(t.machine.code), cell: (t) => <span className="font-medium" title={STATE[t.state].label}><Status tone={STATE[t.state].tone}>{t.machine.code}</Status></span> },
    { key: 'op', header: 'Operator', truncate: 170, sort: (t) => t.operator?.fullName ?? '~', cell: (t) => (t.operator ? <span className="inline-flex items-center gap-1.5"><Avatar name={t.operator.fullName} seed={t.operator.avatarSeed} size={20} />{t.operator.fullName}</span> : !t.entry ? <Badge tone={STATE[t.state].tone} dot>{STATE[t.state].label}</Badge> : dash) },
    { key: 'p', header: kgIO ? 'Grade' : 'Product', truncate: 140, sort: (t) => t.product?.internalName ?? '~', cell: (t) => (t.product ? <span className="inline-flex items-center gap-1.5"><Swatch colour={t.product.colour} />{t.product.internalName}</span> : dash) },
    { key: 'out', header: kgIO ? 'Kg in → out' : cap(cfg.unit), align: 'right', mono: true, sort: (t) => (kgIO ? t.entry?.outputKg : t.entry?.goodUnits) ?? -1, cell: (t) => (!t.entry ? dash : kgIO ? <>{fmtNum(Math.round(t.entry.inputKg))}<span className="text-[var(--text-4)]"> → </span><span className="font-medium">{fmtNum(Math.round(t.entry.outputKg))}</span></> : <><span className="font-medium">{fmtNum(t.entry.goodUnits)}</span>{t.expectedSoFar ? <span className="text-[var(--text-3)]"> / {fmtNum(t.expectedSoFar)}</span> : null}</>) },
    { key: 'exp', header: kgIO ? 'Yield' : hasBench ? 'Of due by now' : 'Film', sort: (t) => (kgIO ? (t.entry ? yieldOf(t.entry) : -1) : hasBench ? t.pct ?? -1 : t.entry?.outputKg ?? -1), cell: (t) => {
      if (!t.entry) return dash;
      if (kgIO) return <span className="flex items-center gap-2"><span className="w-[44px] shrink-0"><Bar value={t.entry.outputKg} max={t.entry.inputKg || 1} tone={yieldOf(t.entry) < yieldFloor ? 'warn' : 'ok'} /></span><span className="num font-medium">{yieldOf(t.entry)}%</span></span>;
      if (t.pct === undefined) return <span className="num text-[var(--text-2)]">{fmtKg(Math.round(t.entry.outputKg))}{hasBench ? ' · no benchmark' : ''}</span>;
      return <span className="flex items-center gap-2"><span className="w-[44px] shrink-0"><Bar value={t.pct} max={Math.max(100, t.pct)} tone={t.state === 'below' ? 'bad' : 'ok'} /></span><span className={cn('num font-medium', t.state === 'below' && 'text-[var(--bad)]')}>{t.pct}%</span></span>;
    } },
    { key: 'down', header: 'Downtime', truncate: 150, sort: (t) => t.entry?.downtimeMin ?? -1, cell: (t) => (t.entry?.downtimeMin ? <span><span className={cn('num', t.entry.downtimeMin > REASON_AFTER_MIN && 'text-[var(--warn)] font-medium')}>{t.entry.downtimeMin} min</span>{t.entry.downtimeReason ? <span className="text-[var(--text-3)]"> · {t.entry.downtimeReason}</span> : t.state === 'below' ? <span className="text-[var(--bad)]"> · no reason</span> : null}</span> : t.entry ? <span className="text-[var(--text-3)]">None</span> : dash) },
    { key: 'at', header: 'Logged', align: 'right', mono: true, sort: (t) => t.entry?.at ?? '', cell: (t) => (t.entry ? fmtTime(t.entry.at) : dash) },
  ];

  const kpiIcon: LucideIcon = site.id === 'recycling' ? Recycle : Flame;
  const chartDay = (d: (typeof hist)[number]) => fmtDayShort(d.day);
  const tabbableId = focusId && shown.some((t) => t.machine.id === focusId) ? focusId : shown[0]?.machine.id;

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      {/* Identity, shift clock, the state of the wall in one line, and the actions */}
      <section className="hero relative overflow-hidden px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <span className="size-12 rounded-xl grid place-items-center shrink-0 shadow-[inset_0_1px_0_rgb(255_255_255/.25)]" style={{ background: SITE_COLOR[site.id] }}><Factory className="size-6" /></span>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-white/55 truncate">{site.legalName} · {fmtDayLong(day)}</div>
              <h1 className="text-[24px] font-semibold tracking-[-0.02em] leading-tight">{site.machineWallTitle}</h1>
              <div className="text-[12.5px] text-white/60 sm:truncate"><span className="num text-white/85">{logged}</span> of {running.length} logged · <span className="num text-white/85">{fmtNum(outNow)}</span> {unitWord} so far{tot.due ? <> · <span className="num text-white/85">{Math.round((tot.good / tot.due) * 100)}%</span> of due</> : null}</div>
            </div>
          </div>
          <div className="flex-1 min-w-[250px] max-w-[440px]">
            <div className="flex items-center justify-between mb-2 text-[12.5px]">
              <span className="inline-flex items-center gap-1.5 font-medium">{win.phase === 'running' && <span className="size-1.5 rounded-full bg-[var(--color-amber-400)] anim-live" />}{cap(kind)} shift {win.phase === 'running' ? 'in progress' : win.phase === 'upcoming' ? 'not started' : 'ended'}</span>
              <span className="text-white/60 num">{win.phase === 'running' ? `${Math.floor(win.nowH)} h in · ${win.span - Math.floor(win.nowH)} h left` : win.phase === 'upcoming' ? `starts ${win.starts}` : `ended ${win.ends}`}</span>
            </div>
            <TimeTrack progress={win.phase === 'running' ? Math.max(0.04, Math.floor(win.nowH) / win.span) : win.phase === 'ended' ? 1 : 0} startLabel={win.starts} endLabel={win.ends} nowLabel={win.phase === 'running' ? `${NOW_LABEL} now` : undefined} onDark />
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <Button variant="inverse" icon={ScrollText} onClick={() => go.site('production/sheet')} hotkey={open ? undefined : 's'} hotkeyLabel="Open the shift sheet">Shift sheet</Button>
            {readOnly
              ? <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12.5px] font-medium bg-white/10 text-white/85 whitespace-nowrap"><Eye className="size-3.5" />Read-only · entries are made by the shift supervisor</span>
              : <Button variant="accent" icon={Plus} onClick={logNext} disabled={!notLogged} hotkey={open ? undefined : 'n'} hotkeyLabel="Log the next unlogged machine">{notLogged ? 'Log next unlogged' : 'All logged'}</Button>}
          </div>
        </div>
        <div className="mt-3.5 pt-3 border-t border-white/10 flex flex-wrap items-center gap-1.5">
          {pills.map((p) => {
            const on = p.key !== 'arriving' && filter === p.key; const body = <><span className="size-1.5 rounded-full shrink-0" style={{ background: p.dot }} /><span className="num font-semibold text-white">{p.value}</span><span className="text-white/70">{p.label}</span></>;
            const cls = cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12.5px] border whitespace-nowrap', on ? 'bg-white/20 border-white/45' : 'bg-white/[.07] border-white/10', !p.value && 'opacity-55');
            return p.key === 'arriving' ? <span key={p.key} className={cls}>{body}</span>
              : <button key={p.key} type="button" aria-pressed={on} title={on ? 'Show every machine' : `Show only ${p.label.toLowerCase()}`} onClick={() => setFilter(on ? 'all' : (p.key as Filter))} className={cn(cls, 'hover:bg-white/[.14]')}>{body}</button>;
          })}
          <Tabs className="ml-auto bg-white/10! [&>button]:text-white/65 [&>button:hover]:text-white [&>button[aria-selected=true]]:bg-white/20 [&>button[aria-selected=true]]:text-white [&>button[aria-selected=true]]:shadow-none" value={kind} onChange={setKind} tabs={[{ value: 'day', label: 'Day shift' }, { value: 'night', label: 'Night shift' }]} />
        </div>
      </section>
      {site.toBeConfirmed && <Note tone="warn">{site.toBeConfirmed}</Note>}

      <KpiStrip className="md:grid-cols-4">
        {kgIO
          ? <Stat label="Pellets out" icon={PackageCheck} accent="var(--series-3)" value={<><CountUp value={Math.round(tot.outKg)} /><span className="t-base text-[var(--text-3)] font-medium"> kg</span></>} spark={past.map((d) => d.outKg)} sub={`${fmtNum(tot.good)} sacks${sack ? ` of ${sack.value} kg` : ''} · ${tot.logged} line${tot.logged === 1 ? '' : 's'} logged`} />
          : <Stat label={`${cap(cfg.unit)} this shift`} icon={PackageCheck} accent="var(--series-3)" value={<CountUp value={tot.good} />} delta={tot.due ? <Delta value={(tot.good / tot.due) * 100 - 100} label="against what is due by now" /> : undefined} spark={past.map((d) => d.units)} sub={tot.due ? `${fmtNum(tot.due)} due by now · ${fmtNum(tot.target)} for the shift` : `${tot.logged} of ${running.length} machines logged`} />}
        {kgIO
          ? <Stat label="Yield" icon={Recycle} accent="var(--series-1)" value={<><CountUp value={tot.inKg ? (tot.outKg / tot.inKg) * 100 : 0} format={(n) => n.toFixed(1)} /><span className="text-[var(--text-3)] font-medium">%</span></>} spark={past.map((d) => d.yieldPct)} sub={`${fmtKg(Math.round(tot.inKg - tot.outKg))} wash and melt loss`} />
          : cfg.kgMode === 'entered'
            ? <Stat label="Film extruded" icon={Scale} accent="var(--series-1)" value={<><CountUp value={Math.round(tot.outKg)} /><span className="t-base text-[var(--text-3)] font-medium"> kg</span></>} spark={past.map((d) => d.outKg)} sub={tot.good ? `${fmtKg(Math.round(tot.outKg / tot.good))} per roll on average` : 'No rolls logged yet'} />
            : <Stat label="Rejects" icon={AlertTriangle} accent="var(--series-8)" value={<CountUp value={tot.rejects} />} spark={past.map((d) => d.rejects)} sparkColor="var(--series-8)" sub={tot.good + tot.rejects ? `${((tot.rejects / (tot.good + tot.rejects)) * 100).toFixed(1)}% of ${fmtNum(tot.good + tot.rejects)} pieces made` : 'Nothing made yet'} />}
        <Stat label="Downtime" icon={Timer} accent="var(--series-7)" tone={reasons.some((r) => r.missing) ? 'warn' : 'neutral'} value={<><CountUp value={tot.down} /><span className="t-base text-[var(--text-3)] font-medium"> min</span></>} spark={past.map((d) => d.downtime)} sparkColor="var(--series-7)" sub={longest ? `Longest ${longest.machine.code} · ${longest.entry!.downtimeMin} min${longest.entry!.downtimeReason ? ` · ${longest.entry!.downtimeReason}` : ''}` : 'No machine has stood still'} />
        <Stat label={kgIO ? 'Scrap fed to the lines' : cfg.kgMode === 'entered' ? 'Resin used' : 'String used'} icon={kpiIcon} accent="var(--series-4)" value={<><CountUp value={Math.round(tot.inKg)} /><span className="t-base text-[var(--text-3)] font-medium"> kg</span></>} spark={past.map((d) => d.inKg)} sparkColor="var(--series-4)" sub={cfg.kgMode === 'estimate' ? `Estimated · ${fmtKg(Math.round(tot.outKg))} woven` : `${fmtKg(Math.round(tot.outKg))} out · ${tot.inKg ? (((tot.inKg - tot.outKg) / tot.inKg) * 100).toFixed(1) : '0.0'}% process loss`} />
      </KpiStrip>

      <div className="grid gap-[var(--gap)] xl:grid-cols-[minmax(0,1fr)_348px] items-start">
        <div ref={board} className="flex flex-col gap-[var(--gap)] min-w-0">
          <Panel icon={Factory} title={site.machineWallTitle} sub={`${filter === 'all' ? running.length : `${shown.length} of ${running.length}`} machines · ${kind} shift`} pad={false}
            actions={<Tabs value={view} onChange={setView} tabs={[{ value: 'wall', label: 'Machine Wall' }, { value: 'table', label: 'Table View' }]} />}
            footer={<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
              <Legend items={[{ label: 'On target or logged', color: 'var(--ok)' }, { label: `Below ${site.thresholds.benchmarkPct}% with no reason, or down`, color: 'var(--bad)' }, { label: 'Not logged', color: 'var(--warn)' }]} />
              {!readOnly && <span className="t-xs text-[var(--text-3)]">Click any machine card above to record or update its shift output.</span>}
            </div>}>
            {wall.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={Factory} title="No machines configured for this wall" hint="Add this site's machines in Settings → Machines." action={<Button size="sm" onClick={() => go.site('settings')}>Open Settings</Button>} /></div>
              : view === 'wall' ? (
                <>
                  <div ref={grid} onKeyDown={onGridKey} className={cn('p-[var(--pad)] grid gap-2', few ? 'sm:grid-cols-2' : '[grid-template-columns:repeat(auto-fill,minmax(158px,1fr))]')}>
                    {running.map((t) => <Tile key={t.machine.id} t={t} cfg={cfg} yieldFloor={yieldFloor} readOnly={readOnly} wide={few} dim={!matches(t, filter)} selected={open?.id === t.machine.id} tabbable={t.machine.id === tabbableId} cause={t.state === 'down' ? causeOf(t.machine.id) : undefined} last={lastByMachine.get(t.machine.id)} onOpen={() => openFor(t.machine.id)} onFocus={() => setFocusId(t.machine.id)} />)}
                  </div>
                  {arriving.length > 0 && (
                    <div className="px-[var(--pad)] pb-[var(--pad)] -mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="t-label mr-1">Arriving</span>
                      {arriving.map((t) => <span key={t.machine.id} className="inline-flex items-center h-6 px-2 rounded-md border border-dashed border-[var(--line-2)] t-xs font-medium text-[var(--text-3)] whitespace-nowrap">{t.machine.code}</span>)}
                      <span className="t-xs text-[var(--text-3)] ml-1">Not yet commissioned</span>
                    </div>
                  )}
                </>
              ) : <DataGrid bare rows={shown} columns={columns} rowKey={(t) => t.machine.id} onRowClick={readOnly ? undefined : (t) => openFor(t.machine.id)} selectedKey={open?.id} maxHeight={560} empty="No machine matches this filter." rowClassName={(t) => (t.state === 'not_logged' ? 'bg-[color-mix(in_srgb,var(--warn)_6%,transparent)]' : undefined)} />}
          </Panel>

          <Panel icon={GanttChart} title="Shift replay" sub={`${cap(kind)} shift ${win.starts}–${win.ends} · one row per machine`}
            footer={<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
              <Legend items={[{ label: 'Running', color: SEG.run }, { label: 'Running below target', color: SEG.below }, { label: 'Downtime', color: SEG.downtime }, { label: 'Machine down', color: SEG.down }, { label: 'Not logged', color: 'color-mix(in srgb, var(--warn) 55%, transparent)' }, { label: 'Since the last entry', color: SEG.since }, { label: 'Entry logged', color: 'var(--text)' }]} />
              <span className="t-xs text-[var(--text-3)]">Illustrative: downtime is drawn just before the entry time.</span>
            </div>}>
            <ShiftReplay wall={wall} kind={kind} day={day} cfg={cfg} />
          </Panel>

          {few && (
            <Panel icon={BarChart3} title={`Each machine over its last ${kind} shifts`} sub={`${kgIO ? 'kg out' : cfg.unit} per shift · 7 working days`} pad={false}>
              {running.map((t) => {
                const series = hist.map((d) => { const e = s.production.find((p) => p.machineId === t.machine.id && p.stageCode === cfg.stage && p.shiftId === shiftId(site.id, d.day, kind)); return e ? (kgIO ? Math.round(e.outputKg) : e.goodUnits) : 0; });
                const full = series.slice(0, -1).filter((v) => v > 0); const avg = full.length ? Math.round(full.reduce((a, v) => a + v, 0) / full.length) : 0; const now = series[series.length - 1];
                return (
                  <div key={t.machine.id} className="flex items-center gap-4 px-[var(--pad)] py-2 border-b border-[var(--line)] last:border-b-0">
                    <div className="w-[92px] shrink-0"><div className="t-base font-medium">{t.machine.code}</div><div className="t-xs text-[var(--text-3)] truncate">{t.operator?.fullName ?? STATE[t.state].label}</div></div>
                    <div className="flex-1 min-w-0"><Sparkline fluid height={34} data={series} /></div>
                    <div className="text-right shrink-0"><div className="num t-base font-medium">{fmtNum(now)} <span className="t-xs font-normal text-[var(--text-3)]">so far</span></div><div className="num t-xs text-[var(--text-3)]">{fmtNum(avg)} per full shift</div></div>
                  </div>
                );
              })}
            </Panel>
          )}
        </div>

        <div className="grid gap-[var(--gap)] md:grid-cols-2 xl:grid-cols-1 min-w-0">
          <Panel icon={ListChecks} title="Unlogged or below target" sub={attention.length ? `${attention.length} open` : undefined} pad={false}>
            {attention.length === 0 ? <Quiet icon={CheckCircle2} title="Nothing waiting" hint="Every running machine has an entry, and none is below target without a reason." /> : attention.map((t) => (
              <div key={t.machine.id} className="flex items-center gap-2.5 px-[var(--pad)] py-2 border-b border-[var(--line)] last:border-b-0">
                <IconChip icon={t.state === 'down' ? Wrench : t.state === 'below' ? AlertTriangle : Clock} color={STATE[t.state].color} />
                <div className="min-w-0 flex-1"><div className="t-base font-medium leading-snug">{t.machine.code}</div><div className="t-sm text-[var(--text-3)] truncate">{t.state === 'not_logged' ? 'No entry this shift' : t.state === 'down' ? `Down · ${causeOf(t.machine.id) ?? 'with the mechanic'}` : `${t.pct}% of due · ${t.entry?.downtimeMin ?? 0} min down · no reason`}</div></div>
                {readOnly || t.state === 'down' ? <Badge tone={STATE[t.state].tone} dot>{STATE[t.state].label}</Badge> : <Button size="sm" onClick={() => { setFocusId(t.machine.id); openFor(t.machine.id); }}>{t.state === 'below' ? 'Add reason' : 'Log'}</Button>}
              </div>
            ))}
          </Panel>

          <Panel icon={Scale} title="Mass balance" sub="today, both shifts" actions={<MassBadge mb={mb} />} footer={mb.kgIn > 0 ? <>Allowed loss {site.thresholds.massGapPct}% is <span className="num">{fmtKg(Math.round(mb.allowedLossKg * 10) / 10)}</span></> : undefined}>
            <MassBalance mb={mb} />
          </Panel>

          <Panel icon={PackageCheck} title={kgIO ? 'Output by grade' : 'Output by product'} sub={kgIO ? 'kg this shift' : tot.due ? 'this shift vs due by now' : 'this shift'}>
            {products.length === 0 ? <Empty title="No output logged yet" /> : products.slice(0, 6).map((p) => (
              <Meter key={p.id} tone="series" label={<span className="inline-flex items-center gap-1.5"><Swatch colour={p.colour} />{p.name}</span>} sub={`${p.machines} machine${p.machines === 1 ? '' : 's'}`} value={kgIO ? p.kg : p.units} max={Math.max(kgIO ? p.kg : p.units, kgIO ? Math.max(...products.map((x) => x.kg)) : p.due || Math.max(...products.map((x) => x.units)), 1)}
                display={kgIO ? fmtKg(Math.round(p.kg)) : <>{fmtNum(p.units)}{p.due ? <span className="text-[var(--text-3)] font-normal"> / {fmtNum(p.due)}</span> : <span className="text-[var(--text-3)] font-normal"> · {fmtKg(Math.round(p.kg))}</span>}</>} />
            ))}
          </Panel>

          <Panel icon={Timer} title="Downtime by reason" sub={tot.down ? `${fmtNum(tot.down)} min this shift` : 'this shift'}>
            {reasons.length === 0 ? <Quiet icon={CheckCircle2} title="No downtime recorded" hint="No machine has stood still this shift." flush /> : reasons.map((r) => <Meter key={r.reason} tone={r.missing ? 'bad' : 'series'} label={r.reason} sub={`${r.machines} machine${r.machines === 1 ? '' : 's'}`} value={r.min} max={reasons[0].min} display={`${fmtNum(r.min)} min`} />)}
          </Panel>

          {ranked.length > 0 && (
            <Panel icon={Trophy} title="Operators against benchmark" sub="best first" pad={false}>
              {ranked.slice(0, 6).map((t, i) => (
                <div key={t.machine.id} className="flex items-center gap-2.5 px-[var(--pad)] h-[var(--row-h)] border-b border-[var(--line)] last:border-b-0">
                  <span className="num t-xs text-[var(--text-3)] w-3 text-right">{i + 1}</span>
                  <Avatar name={t.operator!.fullName} seed={t.operator!.avatarSeed} size={22} />
                  <span className="min-w-0 flex-1 truncate t-base">{t.operator!.fullName}<span className="t-sm text-[var(--text-3)]"> · {t.machine.code}</span></span>
                  <span className="w-[52px] shrink-0"><Bar value={Math.min(t.pct ?? 0, 120)} max={120} tone={t.state === 'below' ? 'bad' : 'ok'} height={4} /></span>
                  <span className={cn('num t-base font-medium w-[40px] text-right', t.state === 'below' && 'text-[var(--bad)]')}>{t.pct}%</span>
                </div>
              ))}
            </Panel>
          )}
        </div>
      </div>

      {/* The same shift over the last seven working days */}
      <div className="grid gap-[var(--gap)] lg:grid-cols-2 xl:grid-cols-3">
        <Panel icon={BarChart3} title={kgIO ? `Pellets per ${kind} shift` : `${cap(cfg.unit)} per ${kind} shift`} sub={kgIO ? 'kg · 7 working days' : hist.some((d) => d.target) ? '7 working days · tick = benchmark' : '7 working days'}>
          <ColumnChart height={170} data={hist.map((d) => ({ label: chartDay(d), values: [kgIO ? d.outKg : d.units], partial: d.partial && win.phase !== 'ended', target: !kgIO && d.target ? d.target : undefined }))} />
        </Panel>
        <Panel icon={Timer} title={`Downtime per ${kind} shift`} sub="minutes · 7 working days">
          <ColumnChart height={170} data={hist.map((d) => ({ label: chartDay(d), values: [d.downtime], partial: d.partial && win.phase !== 'ended' }))} series={[{ name: 'Downtime', color: 'var(--series-7)' }]} />
        </Panel>
        {kgIO ? (
          <Panel icon={Recycle} title="Yield per shift" sub="output as % of input · 7 days">
            <LineChart height={170} labels={hist.map(chartDay)} yMax={100} format={(n) => `${Math.round(n)}%`} partialLast={win.phase !== 'ended'} series={[{ name: 'Yield', data: hist.map((d) => (d.entries ? d.yieldPct : null)) }]} />
          </Panel>
        ) : cfg.kgMode === 'entered' ? (
          <Panel icon={Scale} title={`Film per ${kind} shift`} sub="kg · 7 working days">
            <ColumnChart height={170} data={hist.map((d) => ({ label: chartDay(d), values: [Math.round(d.outKg)], partial: d.partial && win.phase !== 'ended' }))} series={[{ name: 'Film', color: 'var(--series-3)' }]} />
          </Panel>
        ) : (
          <Panel icon={AlertTriangle} title={`Rejects per ${kind} shift`} sub="pieces · 7 working days">
            <ColumnChart height={170} data={hist.map((d) => ({ label: chartDay(d), values: [d.rejects], partial: d.partial && win.phase !== 'ended' }))} series={[{ name: 'Rejects', color: 'var(--series-8)' }]} />
          </Panel>
        )}
      </div>

      <ShiftEntrySheet key={open?.nonce ?? 0} tile={readOnly ? null : openTile} kind={kind} day={day} typed={open?.typed} onClose={() => close()} onSaved={afterSave} hasNext={!!open && !!nextUnlogged(open.id)} />
    </div>
  );
}
