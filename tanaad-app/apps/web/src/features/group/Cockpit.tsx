import { useRef, useState, type ReactNode } from 'react';
import { Activity, AlertTriangle, BarChart3, Bell, Boxes, ChevronRight, Factory, Flame, History, Hourglass, Inbox, Landmark, MessageSquareText, PackageCheck, Recycle, Scale, ShieldCheck, Siren, Truck, Users, Wallet, type LucideIcon } from 'lucide-react';
import type { ShiftKind, Site, SiteCode } from '@tanaad/domain';
import { useStore, type AppState } from '@/data/store';
import { useGo, useRefList } from '@/app/hooks';
import { Avatar, Badge, Bar, Button, DataGrid, Empty, Kbd, Meter, Panel, Row, Sheet, StackedBar, Tabs, cn, useHotkey, useMedia, type Column } from '@/components/ui';
import { ColumnChart, CountUp, Delta, Legend, LineChart, Sparkline, TimeTrack, pctChange } from '@/components/charts';
import { SITE_LIST } from '@/config/sites';
import { categoryColor } from '@/config/categories';
import { SITE_COLOR } from '@/config/siteIdentity';
import { roleLabel } from '@/config/roles';
import { cashDayFor, cashInSafe, cashSummary, clientBalance, currentShiftKind, dailySeries, DEMO_HOUR, headcount, lastWorkingDays, liveSite, machineWall, massBalanceDay, openExceptions, orderTotal, receivables, stockByProduct } from '@/data/selectors';
import { compact, fmtDateTime, fmtDayLong, fmtDayShort, fmtKg, fmtNum, fmtTime, fmtUGX, fmtUSD } from '@/data/format';
import { CountryTag, IconChip, KIND_META, KV, SEVERITIES, SiteBadge, SiteMark, agoLabel, cap, catLabel, plural, rovingKeys, setPresetSelection, severityColor, severityLabel, severityTone, unitName } from './shared';

type DrillKind = 'cash' | 'headcount' | 'output' | 'machines' | 'waste' | 'dispatches' | 'exceptions' | 'receivables' | 'stock' | 'orders';
interface Drill { site: SiteCode | 'all'; kind: DrillKind }

const STOCK_UNIT: Record<SiteCode, string> = { mats: 'bundles', bags: 'packs and rolls', recycling: 'sacks' };
const PROGRESS = Math.max(0.1, Math.min(1, (DEMO_HOUR - 7) / 12));
const avg = (xs: number[]) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : 0);

/** Everything the cockpit shows about one site, worked out once. */
function numbersFor(s: AppState, site: Site, kind: ShiftKind) {
  const series = dailySeries(s, site.id, lastWorkingDays(site.id, s.today, 7));
  const today = series[series.length - 1]; const yesterday = series[series.length - 2]; const past = series.slice(0, -1);
  const cd = cashDayFor(s, site.id, s.today); const cs = cd ? cashSummary(s, cd.id) : undefined;
  const cash = cs?.expectedClosing ?? cashInSafe(s, site.id);
  const hc = headcount(s, site.id, s.today);
  const wall = machineWall(s, site.id, s.today, kind);
  const mb = massBalanceDay(s, site.id, s.today);
  const ex = openExceptions(s, site.id); const recv = receivables(s, site.id); const stock = stockByProduct(s, site.id);
  const dsp = s.dispatches.filter((d) => d.siteId === site.id && d.createdAt.startsWith(s.today));
  const due = Math.round((today.target || avg(past.map((d) => d.units))) * PROGRESS);
  return {
    site, series, today, yesterday, past, cd, cs, cash, hc, wall, mb, ex, recv, dsp, due,
    benchmarked: today.target > 0,
    hcShift: headcount(s, site.id, s.today, kind).total,
    hcYesterday: yesterday ? headcount(s, site.id, yesterday.day, kind).total : 0,
    critical: ex.filter((e) => e.severity === 'critical').length,
    logged: wall.filter((t) => t.state === 'ok' || t.state === 'logged' || t.state === 'below').length,
    notLogged: wall.filter((t) => t.state === 'not_logged').length,
    down: wall.filter((t) => t.state === 'down').length,
    arriving: wall.filter((t) => t.state === 'arriving').length,
    avgWaste: avg(past.map((d) => d.wastePct)),
    toLoad: s.orders.filter((o) => o.siteId === site.id && (o.status === 'approved' || o.status === 'picking')).length,
    recvTotal: recv.reduce((t, r) => t + r.balance, 0),
    stockBundles: stock.reduce((t, r) => t + r.bundles, 0), stockKg: stock.reduce((t, r) => t + r.kg, 0),
  };
}
type SiteNumbers = ReturnType<typeof numbersFor>;

/** One comparable line about a site. The same definition feeds the site cards and the matrix. */
interface Metric { id: string; drill: DrillKind; icon: LucideIcon; color: string; label: string; sub: string; value: ReactNode; delta?: ReactNode; spark?: number[]; meter?: { value: number; max: number; ok: boolean }; mark?: ReactNode }

function metricsFor(p: SiteNumbers): Metric[] {
  const { site, today, yesterday, series } = p; const unit = unitName(site.id);
  const passed = p.dsp.filter((d) => d.gateStatus === 'pass' || d.gateStatus === 'overridden').length; const held = p.dsp.filter((d) => d.gateStatus === 'hold').length;
  const overdue = p.recv.filter((r) => r.ageDays > r.client.creditDays).length;
  const bySeverity = SEVERITIES.map((sev) => ({ label: severityLabel[sev], value: p.ex.filter((e) => e.severity === sev).length, color: severityColor(sev) }));
  return [
    { id: 'cash', drill: 'cash', icon: Wallet, color: 'var(--series-2)', label: 'Cash expected, UGX', value: compact(p.cash),
      sub: p.cs ? `in ${compact(today.cashIn)} · out ${compact(today.cashOut)}` : 'no cash page today',
      delta: <Delta value={yesterday ? pctChange(p.cash, yesterday.closing) : null} label="against yesterday's closing" />, spark: [...p.past.map((d) => d.closing), p.cash] },
    { id: 'people', drill: 'headcount', icon: Users, color: 'var(--series-1)', label: 'On shift', value: fmtNum(p.hc.total),
      sub: `${p.hc.present} full · ${p.hc.half} half day`,
      delta: <Delta value={pctChange(p.hcShift, p.hcYesterday)} label="against yesterday, same shift" />, spark: series.map((d) => d.headcount) },
    { id: 'output', drill: 'output', icon: PackageCheck, color: 'var(--series-3)', label: `${cap(unit)} so far`, value: fmtNum(today.units),
      sub: p.due ? `${fmtNum(p.due)} ${p.benchmarked ? 'due' : 'usual'} by now` : 'Nothing to compare against yet',
      delta: p.due ? <Delta value={(today.units / p.due) * 100 - 100} label={p.benchmarked ? 'against the benchmark due by now' : 'against the usual pace by now'} /> : undefined,
      spark: series.map((d) => d.units), meter: p.due ? { value: today.units, max: Math.max(p.due, today.units), ok: today.units / p.due >= site.thresholds.benchmarkPct / 100 } : undefined },
    { id: 'waste', drill: 'waste', icon: site.id === 'recycling' ? Recycle : Flame, color: 'var(--series-4)', label: 'Waste, measured', value: `${today.wastePct.toFixed(1)}%`,
      sub: `${fmtKg(Math.round(p.mb.wasteKg))} of ${fmtKg(Math.round(p.mb.kgIn))} in`,
      delta: <Delta value={today.wastePct - p.avgWaste} suffix=" pt" goodWhen="down" label="against the 6-day average" />, spark: series.map((d) => d.wastePct) },
    { id: 'dispatches', drill: 'dispatches', icon: Truck, color: 'var(--series-7)', label: 'Dispatches', value: fmtNum(p.dsp.length),
      sub: p.dsp.length ? `${passed} passed the gate${held ? ` · ${held} held` : ''}` : p.toLoad ? `${plural(p.toLoad, 'order')} ready to load` : 'None today, nothing waiting',
      delta: <Delta value={yesterday ? pctChange(today.dispatches, yesterday.dispatches) : null} label="against yesterday" />, spark: series.map((d) => d.dispatches) },
    { id: 'exceptions', drill: 'exceptions', icon: AlertTriangle, color: p.critical ? 'var(--bad)' : p.ex.length ? 'var(--warn)' : 'var(--ok)', label: 'To decide', value: fmtNum(p.ex.length),
      sub: p.ex.length ? bySeverity.filter((x) => x.value).map((x) => `${x.value} ${x.label.toLowerCase()}`).join(' · ') : 'All clear',
      delta: p.critical ? <Badge tone="bad" dot>{p.critical} critical</Badge> : undefined,
      mark: p.ex.length ? <span className="w-[60px] shrink-0"><StackedBar height={6} legend={false} segments={bySeverity} /></span> : undefined },
    p.recv.length
      ? { id: 'receivables', drill: 'receivables', icon: Landmark, color: 'var(--series-5)', label: 'Export receivables', value: `$${compact(p.recvTotal)}`,
        sub: `${plural(p.recv.length, 'client')} · oldest ${Math.max(...p.recv.map((r) => r.ageDays))} d`, delta: overdue ? <Badge tone="warn" dot>{overdue} past terms</Badge> : undefined }
      : { id: 'stock', drill: 'stock', icon: Boxes, color: 'var(--series-5)', label: 'Stock on hand', value: fmtNum(p.stockBundles), sub: `${STOCK_UNIT[site.id]} · ${fmtKg(Math.round(p.stockKg))}` },
  ];
}

/** A headline number on the dark band. */
function HeroStat({ label, short, value, sub, delta, spark, alert, onClick }: { label: string; short?: string; value: ReactNode; sub: ReactNode; delta?: ReactNode; spark?: number[]; alert?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group text-left min-w-0 rounded-lg border border-white/[0.08] bg-white/[0.05] hover:bg-white/[0.1] hover:border-white/20 transition-colors px-3 py-2 max-sm:px-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] uppercase tracking-[0.1em] max-sm:tracking-[0.06em] font-semibold text-white/50 truncate"><span className="max-sm:hidden">{label}</span><span className="sm:hidden">{short ?? label}</span></span>
        {alert && <span className="size-1.5 rounded-full bg-[#ff9d8f] anim-live shrink-0" />}
      </div>
      <div className="flex items-end justify-between gap-2 mt-0.5">
        <span className="num text-[22px] sm:text-[24px] font-semibold tracking-[-0.02em] leading-[1.15] whitespace-nowrap">{value}</span>
        {spark && spark.length > 1 && <span className="max-lg:hidden pb-1 opacity-90"><Sparkline data={spark} width={64} height={22} color="var(--color-amber-400)" /></span>}
      </div>
      <div className="flex items-center gap-1.5 mt-0.5 min-w-0 min-h-[20px]">{delta}<span className={cn('text-[11.5px] text-white/55 truncate', !!delta && 'max-sm:hidden')}>{sub}</span></div>
    </button>
  );
}

/** One line of a site card: what it is, where it is heading, the number, and how it moved. */
function MetricRow({ m, onClick }: { m: Metric; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full min-w-0 flex items-center gap-2.5 px-[var(--pad)] py-1.5 touch:py-2 text-left border-b border-[var(--line)] hover:bg-[var(--hover)]">
      <IconChip icon={m.icon} color={m.color} />
      <span className="min-w-0 flex-1">
        <span className="block t-sm font-medium text-[var(--text-2)] truncate">{m.label}</span>
        <span className="block t-xs text-[var(--text-3)] truncate">{m.sub}</span>
        {m.meter && <Bar value={m.meter.value} max={m.meter.max} tone={m.meter.ok ? 'ok' : 'warn'} height={3} className="mt-1" />}
      </span>
      {m.mark ?? (m.spark && <Sparkline data={m.spark} width={60} height={24} color={m.color} />)}
      <span className="shrink-0 min-w-[62px] flex flex-col items-end gap-0.5">
        <span className="num t-lg font-semibold leading-tight">{m.value}</span>
        {m.delta}
      </span>
    </button>
  );
}

function SiteCard({ p, index, onDrill, onOpen, shift }: { p: SiteNumbers; index: number; onDrill: (kind: DrillKind) => void; onOpen: () => void; shift: ShiftKind }) {
  const metrics = metricsFor(p); const running = p.wall.length - p.arriving;
  const states = [{ label: 'Logged', value: p.logged, color: 'var(--ok)' }, { label: 'Not logged', value: p.notLogged, color: 'var(--warn)' }, { label: 'Down', value: p.down, color: 'var(--bad)' }, { label: 'Arriving', value: p.arriving, color: 'var(--text-4)' }];
  return (
    <Panel pad={false} className="relative overflow-hidden @container/site"
      title={<span className="inline-flex items-center gap-2"><SiteMark site={p.site.id} size={24} />{p.site.name}</span>} sub={<span className="hidden @md/site:inline">{p.site.tagline.split(' · ').slice(1).join(' · ')}</span>}
      actions={<Button size="sm" onClick={onOpen} hotkey={String(index + 1)} hotkeyLabel={`Open the ${p.site.name} portal`}>Open portal</Button>}>
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: SITE_COLOR[p.site.id] }} />
      <div className="grid @xl/site:grid-cols-2 @xl/site:[&>*:nth-child(odd)]:border-r @xl/site:[&>*:nth-child(odd)]:border-r-[var(--line)]">
        {metrics.map((m) => <MetricRow key={m.id} m={m} onClick={() => onDrill(m.drill)} />)}
        <button onClick={() => onDrill('machines')} className="w-full min-w-0 text-left px-[var(--pad)] py-2 hover:bg-[var(--hover)] @xl/site:border-b @xl/site:border-[var(--line)]">
          <span className="flex items-center justify-between gap-3 mb-1.5">
            <span className="t-sm font-medium text-[var(--text-2)] inline-flex items-center gap-1.5 min-w-0"><Activity className="size-3.5 text-[var(--text-3)] shrink-0" /><span className="truncate">{p.site.machineWallTitle} · {shift} shift</span></span>
            <span className="num t-sm text-[var(--text-2)] whitespace-nowrap"><span className="font-semibold text-[var(--text)]">{p.logged}</span> of {running} logged</span>
          </span>
          <StackedBar height={8} legend={false} segments={states} />
          <Legend className="mt-1.5 gap-x-3" items={states.filter((x) => x.value > 0).map((x) => ({ label: x.label, color: x.color, value: x.value }))} />
        </button>
      </div>
    </Panel>
  );
}

/** The CEOs' first screen: the group in one band, the three sites side by side, then money, people and what is waiting. */
export function Cockpit() {
  const s = useStore(); const go = useGo(); const kind = currentShiftKind(); const markRead = useStore((x) => x.markAlertsRead);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [viewPref, setView] = useState<'cards' | 'matrix'>('cards'); const [cashDir, setCashDir] = useState<'in' | 'out'>('in');
  const wide = useMedia('(min-width: 900px)'); const view = wide ? viewPref : 'cards';
  const waiting = useRef<HTMLDivElement>(null);
  const user = s.users.find((u) => u.id === s.session?.userId);

  const per = SITE_LIST.map((site) => numbersFor(s, liveSite(s, site), kind));
  const sum = (f: (p: SiteNumbers) => number) => per.reduce((t, p) => t + f(p), 0);
  const days = per[0].series.map((d) => d.day); const last = days.length - 1;
  const cashTotal = sum((p) => p.cash); const cashSpark = days.map((_, i) => sum((p) => (i === last ? p.cash : p.series[i]?.closing ?? 0)));
  const hcTotal = sum((p) => p.hc.total); const exTotal = sum((p) => p.ex.length); const critical = sum((p) => p.critical);
  const kgToday = sum((p) => p.today.kgOut);
  const allRecv = receivables(s); const recvTotal = allRecv.reduce((t, r) => t + r.balance, 0); const recvOverdue = allRecv.filter((r) => r.ageDays > r.client.creditDays);
  const awaiting = s.orders.filter((o) => o.status === 'awaiting_approval').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const usd = (o: (typeof awaiting)[number]) => (o.currency === 'USD' ? orderTotal(o) : orderTotal(o) / s.fx);
  const awaitingUsd = awaiting.reduce((t, o) => t + usd(o), 0);
  const unread = s.alerts.filter((a) => !a.read); const alarm = unread[0];
  const exOpen = openExceptions(s).filter((e) => !(e.kind === 'credit_over_limit' && awaiting.some((o) => e.detail.includes(o.number))));
  const decisions = awaiting.length + exOpen.length;
  const recent = [...s.audit].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  const shift = SITE_LIST[0].shifts.find((x) => x.kind === kind);
  const greet = DEMO_HOUR < 12 ? 'Good morning' : DEMO_HOUR < 17 ? 'Good afternoon' : 'Good evening';
  const categories = useRefList('expense_category');
  const spendCats = categories.map((c) => ({ id: c.id, label: c.label, color: c.color ?? categoryColor(c.id as never) }));
  const spend = per.map((p) => {
    const out = (p.cs?.entries ?? []).filter((e) => e.direction === 'out');
    const segments = spendCats.map((c) => ({ label: c.label, color: c.color, value: out.filter((e) => e.category === c.id || (c.id === 'wages' && e.category === 'payout')).reduce((t, e) => t + e.amount, 0) }));
    const total = segments.reduce((t, x) => t + x.value, 0);
    return { p, segments, total, lines: out.length, top: total ? [...segments].sort((a, b) => b.value - a.value)[0] : undefined };
  });
  const openAlert = () => { markRead(); go.group('approvals'); };
  const review = (to: 'approvals' | 'credit', id: string) => { setPresetSelection(id); go.group(to); };

  useHotkey('v', () => setView((v) => (v === 'cards' ? 'matrix' : 'cards')), { label: 'Switch between site cards and the comparison matrix', enabled: wide });
  useHotkey('w', () => { const el = waiting.current?.querySelector<HTMLElement>('[data-roving]'); el?.focus(); el?.scrollIntoView({ block: 'nearest' }); }, { label: 'Jump to "Waiting for you"' });

  /* Matrix: rows are metrics, columns are sites. */
  interface MatrixRow { id: string; drill: DrillKind; icon: LucideIcon; color: string; label: string; note: string; cells: { value: ReactNode; delta?: ReactNode; spark?: number[] }[]; total: ReactNode }
  const all = per.map(metricsFor);
  const pick = (id: string) => all.map((ms) => { const m = ms.find((x) => x.id === id); return m ? { value: m.value, delta: m.delta, spark: m.spark } : { value: <span className="text-[var(--text-4)]">—</span> }; });
  const metricOf = (id: string) => all.flat().find((m) => m.id === id)!;
  const dash = <span className="text-[var(--text-4)]">—</span>;
  const matrix: MatrixRow[] = [
    { ...metricOf('cash'), label: 'Cash expected', note: 'UGX, expected closing', cells: pick('cash'), total: compact(cashTotal) },
    { id: 'cashIn', drill: 'cash', icon: Wallet, color: 'var(--series-3)', label: 'Cash in today', note: 'UGX, sales and receipts', cells: per.map((p) => ({ value: compact(p.today.cashIn), delta: <Delta value={p.yesterday ? pctChange(p.today.cashIn, p.yesterday.cashIn) : null} />, spark: p.series.map((d) => d.cashIn) })), total: compact(sum((p) => p.today.cashIn)) },
    { id: 'cashOut', drill: 'cash', icon: Wallet, color: 'var(--series-8)', label: 'Cash out today', note: 'UGX, expenses and wages', cells: per.map((p) => ({ value: compact(p.today.cashOut), delta: <Delta value={p.yesterday ? pctChange(p.today.cashOut, p.yesterday.cashOut) : null} goodWhen="none" />, spark: p.series.map((d) => d.cashOut) })), total: compact(sum((p) => p.today.cashOut)) },
    { ...metricOf('people'), note: 'all shifts today', cells: pick('people'), total: fmtNum(hcTotal) },
    { ...metricOf('output'), label: 'Output so far', note: per.map((p) => unitName(p.site.id)).join(', '), cells: pick('output'), total: dash },
    { id: 'pace', drill: 'output', icon: BarChart3, color: 'var(--series-3)', label: 'Against due by now', note: 'benchmark, or the usual pace', cells: per.map((p) => ({ value: p.due ? <span className="inline-flex items-center gap-2"><span className="w-[64px] shrink-0"><Bar value={p.today.units} max={Math.max(p.due, p.today.units)} tone={p.today.units / p.due >= p.site.thresholds.benchmarkPct / 100 ? 'ok' : 'warn'} /></span>{Math.round((p.today.units / p.due) * 100)}%</span> : dash })), total: dash },
    { ...metricOf('waste'), note: 'share of kilos in', cells: pick('waste'), total: dash },
    { id: 'machines', drill: 'machines', icon: Activity, color: 'var(--series-7)', label: 'Machines logged', note: `${kind} shift`, cells: per.map((p) => ({ value: <>{p.logged}<span className="text-[var(--text-3)] font-normal"> / {p.wall.length - p.arriving}</span></>, delta: p.down ? <Badge tone="bad" dot>{p.down} down</Badge> : p.notLogged ? <Badge tone="warn" dot>{p.notLogged} not logged</Badge> : undefined })), total: <>{sum((p) => p.logged)}<span className="text-[var(--text-3)] font-normal"> / {sum((p) => p.wall.length - p.arriving)}</span></> },
    { id: 'downtime', drill: 'output', icon: Hourglass, color: 'var(--series-6)', label: 'Downtime', note: 'minutes today', cells: per.map((p) => ({ value: fmtNum(p.today.downtimeMin), delta: <Delta value={p.yesterday ? pctChange(p.today.downtimeMin, p.yesterday.downtimeMin) : null} goodWhen="down" />, spark: p.series.map((d) => d.downtimeMin) })), total: fmtNum(sum((p) => p.today.downtimeMin)) },
    { ...metricOf('dispatches'), note: 'lorries out today', cells: pick('dispatches'), total: fmtNum(sum((p) => p.dsp.length)) },
    { ...metricOf('exceptions'), note: 'open exceptions', cells: per.map((p) => ({ value: fmtNum(p.ex.length), delta: p.critical ? <Badge tone="bad" dot>{p.critical} critical</Badge> : undefined })), total: fmtNum(exTotal) },
    { id: 'receivables', drill: 'receivables', icon: Landmark, color: 'var(--series-5)', label: 'Export receivables', note: 'USD outstanding', cells: per.map((p) => ({ value: p.recv.length ? `$${compact(p.recvTotal)}` : dash })), total: `$${compact(recvTotal)}` },
    { id: 'stock', drill: 'stock', icon: Boxes, color: 'var(--series-5)', label: 'Stock on hand', note: 'labelled units in store', cells: per.map((p) => ({ value: fmtNum(p.stockBundles) })), total: dash },
  ];
  const matrixCols: Column<MatrixRow>[] = [
    { key: 'm', header: 'Metric', cell: (r) => <span className="inline-flex items-center gap-2"><IconChip icon={r.icon} color={r.color} size="sm" /><span className="font-medium">{r.label}</span><span className="t-sm text-[var(--text-3)] max-xl:hidden">{r.note}</span></span> },
    ...per.map((p, i): Column<MatrixRow> => ({ key: p.site.id, align: 'right', header: <span className="inline-flex items-center gap-1.5 normal-case tracking-normal t-sm text-[var(--text)]"><SiteMark site={p.site.id} size={18} />{p.site.name}</span>,
      cell: (r) => { const c = r.cells[i]; return <span className="inline-flex items-center justify-end gap-2.5 align-middle">{c.spark && <span className="max-xl:hidden"><Sparkline data={c.spark} width={52} height={18} color={SITE_COLOR[p.site.id]} /></span>}<span className="min-w-[58px] inline-flex justify-start">{c.delta}</span><span className="num font-semibold min-w-[56px]">{c.value}</span></span>; } })),
    { key: 'g', header: 'Group', align: 'right', width: 110, cell: (r) => <span className="num font-semibold">{r.total}</span> },
  ];

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      {/* Group identity, the shift clock, where to go, and six numbers */}
      <section className="hero relative overflow-hidden px-5 max-sm:px-3.5 py-4 max-sm:py-3 flex flex-col gap-3.5 max-sm:gap-3">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <SiteMark site="group" size={48} className="rounded-xl max-sm:hidden" />
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-white/55">Group HQ · {fmtDayLong(s.today)}</div>
              <h1 className="text-[24px] max-sm:text-[21px] font-semibold tracking-[-0.02em] leading-tight">Tanaad Group</h1>
              <div className="text-[12.5px] text-white/60 sm:truncate">{greet}, {user?.name.split(' ')[0] ?? 'there'}. {decisions ? `${plural(decisions, 'decision')} waiting for you` : 'Nothing is waiting for you'}{critical ? `, ${critical} critical` : ''}.</div>
            </div>
          </div>
          <div className="flex-1 min-w-[240px] max-w-[440px] max-md:hidden">
            <div className="flex items-center justify-between mb-2 text-[12.5px]"><span className="inline-flex items-center gap-1.5 font-medium"><span className="size-1.5 rounded-full bg-[var(--color-amber-400)] anim-live" />{cap(kind)} shift at {SITE_LIST.length} sites</span><span className="text-white/60">{DEMO_HOUR - 7} h in · {19 - DEMO_HOUR} h left</span></div>
            <TimeTrack progress={PROGRESS} startLabel={shift?.starts ?? '07:00'} endLabel={shift?.ends ?? '19:00'} nowLabel={`${DEMO_HOUR}:20 now`} onDark />
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-auto max-sm:ml-0 max-sm:w-full">
            {alarm && (
              <button onClick={openAlert} title={alarm.detail} className="anim-alarm inline-flex items-center gap-1.5 h-8 touch:h-10 px-3 rounded-lg bg-[rgb(239_122_105/.24)] text-[#ffc2b8] border border-[rgb(239_122_105/.5)] text-[12.5px] font-semibold whitespace-nowrap max-w-full">
                <Siren className="size-3.5 shrink-0" /><span className="truncate">{alarm.title}</span>{unread.length > 1 && <span className="num font-medium opacity-80">+{unread.length - 1}</span>}
              </button>
            )}
            <span className="contents max-sm:hidden">
              <Button variant="inverse" icon={MessageSquareText} onClick={() => go.group('brief')} hotkey="b">Morning brief</Button>
              <Button variant="inverse" icon={Landmark} onClick={() => go.group('credit')} hotkey="c" hotkeyLabel="Credit desk">Credit desk{awaiting.length > 0 && <span className="num px-1.5 rounded-[4px] bg-white/15 t-xs font-semibold">{awaiting.length}</span>}</Button>
              <Button variant="accent" icon={Inbox} onClick={() => go.group('approvals')} hotkey="a" hotkeyLabel="Approvals">Approvals{exTotal > 0 && <span className="num px-1.5 rounded-[4px] bg-black/20 t-xs font-semibold">{exTotal}</span>}</Button>
            </span>
            <span className="sm:hidden grid grid-cols-2 gap-2 w-full">
              <Button variant="accent" icon={Inbox} onClick={() => go.group('approvals')}>Approvals{exTotal > 0 && <span className="num px-1.5 rounded-[4px] bg-black/20 t-xs font-semibold">{exTotal}</span>}</Button>
              <Button variant="inverse" icon={Landmark} onClick={() => go.group('credit')}>Credit desk{awaiting.length > 0 && <span className="num px-1.5 rounded-[4px] bg-white/15 t-xs font-semibold">{awaiting.length}</span>}</Button>
            </span>
          </div>
        </div>
        <div data-theme="dark" className="grid grid-cols-3 xl:grid-cols-6 gap-2 max-sm:gap-1.5">
          <HeroStat label={`Cash · ${SITE_LIST.length} safes`} short="Cash, UGX" value={<CountUp value={cashTotal} format={compact} />} delta={<Delta value={pctChange(cashTotal, cashSpark[last - 1] ?? 0)} label="against yesterday's closing" />} sub="UGX expected" spark={cashSpark} onClick={() => setDrill({ site: 'all', kind: 'cash' })} />
          <HeroStat label="On shift" value={<CountUp value={hcTotal} />} delta={<Delta value={pctChange(sum((p) => p.hcShift), sum((p) => p.hcYesterday))} label="against yesterday, same shift" />} sub="people" spark={days.map((_, i) => sum((p) => p.series[i]?.headcount ?? 0))} onClick={() => setDrill({ site: 'all', kind: 'headcount' })} />
          <HeroStat label="Produced today" value={<><CountUp value={kgToday / 1000} format={(n) => n.toFixed(1)} /><span className="text-[14px] text-white/55 font-medium"> t</span></>} short="Produced" sub={<><span className="max-sm:hidden xl:max-2xl:hidden">{per.map((p) => `${fmtNum(p.today.units)} ${unitName(p.site.id)}`).join(' · ')}</span><span className="sm:hidden xl:max-2xl:inline" title={per.map((p) => `${fmtNum(p.today.units)} ${unitName(p.site.id)}`).join(' · ')}>{fmtNum(kgToday)} kg out, all sites</span></>} spark={days.map((_, i) => sum((p) => p.series[i]?.kgOut ?? 0))} onClick={() => setDrill({ site: 'all', kind: 'output' })} />
          <HeroStat label="To decide" value={<CountUp value={exTotal} />} alert={critical > 0} delta={critical ? <Badge tone="bad" dot>{critical} critical</Badge> : undefined} sub={critical ? '' : exTotal ? 'none critical' : 'all clear'} onClick={() => setDrill({ site: 'all', kind: 'exceptions' })} />
          <HeroStat label="Awaiting approval" short="To approve" value={<>$<CountUp value={awaitingUsd} format={compact} /></>} sub={awaiting.length ? `${plural(awaiting.length, 'export order')}` : 'no export orders'} onClick={() => setDrill({ site: 'all', kind: 'orders' })} />
          <HeroStat label="Receivables" value={<>$<CountUp value={recvTotal} format={compact} /></>} delta={recvOverdue.length ? <Badge tone="warn" dot>{recvOverdue.length} past terms</Badge> : undefined} sub={recvOverdue.length ? '' : 'all within terms'} onClick={() => setDrill({ site: 'all', kind: 'receivables' })} />
        </div>
      </section>

      {/* Site comparison */}
      <div className="flex items-center justify-between gap-3 -mb-1">
        <div className="flex items-baseline gap-2 min-w-0"><h2 className="t-lg font-semibold whitespace-nowrap">The three sites</h2><span className="t-sm text-[var(--text-3)] truncate">today so far, against yesterday and the last six working days</span></div>
        <Tabs className="max-[899px]:hidden shrink-0" value={view} onChange={setView} tabs={[{ value: 'cards', label: 'Cards' }, { value: 'matrix', label: <>Matrix<Kbd keys="v" /></> }]} />
      </div>
      {view === 'cards' ? (
        <div className="@container">
          <div className="grid gap-[var(--gap)] @4xl:grid-cols-3 items-start">
            {per.map((p, i) => <SiteCard key={p.site.id} p={p} index={i} shift={kind} onDrill={(k) => setDrill({ site: p.site.id, kind: k })} onOpen={() => go.site('dashboard', p.site.id)} />)}
          </div>
        </div>
      ) : (
        <Panel pad={false} icon={BarChart3} title="Site comparison" sub="read across a row to compare the sites"
          footer={<span>Select a row to see the records behind it at all three sites. Sparklines cover the last 7 working days; the chip beside a number is the change against yesterday.</span>}>
          <DataGrid bare rows={matrix} columns={matrixCols} rowKey={(r) => r.id} onRowClick={(r) => setDrill({ site: 'all', kind: r.drill })} />
        </Panel>
      )}
      <p className="t-xs text-[var(--text-3)] -mt-1">Select any number to see the records behind it. Cash is the expected closing of the open page; it becomes actual when the cashier counts and signs.</p>

      {/* Money and people on the left, what needs the CEOs on the right */}
      <div className="grid gap-[var(--gap)] xl:grid-cols-[minmax(0,1fr)_360px] items-start">
        <div className="flex flex-col gap-[var(--gap)] min-w-0">
          <Panel icon={Wallet} title={cashDir === 'in' ? 'Cash in per day' : 'Cash out per day'} sub="UGX by site · 7 working days"
            actions={<Tabs value={cashDir} onChange={setCashDir} tabs={[{ value: 'in', label: 'Cash in' }, { value: 'out', label: 'Cash out' }]} />}
            footer={<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1"><span className="num">7 days: in {compact(sum((p) => p.series.reduce((t, d) => t + d.cashIn, 0)))} · out {compact(sum((p) => p.series.reduce((t, d) => t + d.cashOut, 0)))} · net {compact(sum((p) => p.series.reduce((t, d) => t + d.cashIn - d.cashOut, 0)))}</span><span>Today is drawn lighter: the cash pages are still open.</span></div>}>
            <ColumnChart height={200} series={per.map((p) => ({ name: p.site.name, color: SITE_COLOR[p.site.id] }))} data={days.map((d, i) => ({ label: fmtDayShort(d), values: per.map((p) => (cashDir === 'in' ? p.series[i]?.cashIn : p.series[i]?.cashOut) ?? 0), partial: i === last }))} />
          </Panel>
          <div className="grid gap-[var(--gap)] md:grid-cols-2">
            <Panel icon={Users} title="People on shift" sub="per site · 7 working days">
              <LineChart height={190} partialLast labels={days.map(fmtDayShort)} series={per.map((p) => ({ name: p.site.shortName, color: SITE_COLOR[p.site.id], data: p.series.map((d) => d.headcount) }))} />
            </Panel>
            <Panel icon={Landmark} title="Export receivables" sub="USD by client, against the credit limit" actions={<Button size="sm" variant="ghost" onClick={() => go.group('credit')}>Credit desk</Button>}
              footer={<div className="flex items-center justify-between gap-3"><span>Outstanding</span><span className="num font-semibold text-[var(--text)]">{fmtUSD(recvTotal)}</span></div>}>
              {allRecv.length === 0 ? <Empty icon={Landmark} title="Nothing outstanding" hint="Local orders are cash before delivery; only export clients carry a balance." /> : allRecv.sort((a, b) => b.balance - a.balance).map((r) => {
                const late = r.ageDays > r.client.creditDays;
                return (
                  <button key={r.client.id} onClick={() => setDrill({ site: 'all', kind: 'receivables' })} className="block w-full text-left rounded-md -mx-1.5 px-1.5 hover:bg-[var(--hover)]">
                    <Meter tone={late ? 'bad' : 'series'} value={r.balance} max={r.client.creditLimit || r.balance}
                      label={<span className="inline-flex items-center gap-1.5"><CountryTag country={r.client.country} />{r.client.name}</span>}
                      display={<>{fmtUSD(Math.round(r.balance))}<span className="text-[var(--text-3)] font-normal"> / {compact(r.client.creditLimit)}</span></>} />
                    <div className="flex items-center justify-between t-xs text-[var(--text-3)] -mt-0.5 pb-1.5"><span>{r.client.creditLimit ? `${Math.round((r.balance / r.client.creditLimit) * 100)}% of limit used` : 'no limit set'}</span><span className={cn(late && 'text-[var(--bad)] font-medium')}>oldest invoice {r.ageDays} d · terms {r.client.creditDays} d</span></div>
                  </button>
                );
              })}
            </Panel>
          </div>
          <div className="grid gap-[var(--gap)] md:grid-cols-2">
            <Panel icon={PackageCheck} title="Kilos out per day" sub="kg by site · 7 working days" footer={<span className="num">Today so far: {per.map((p) => `${p.site.shortName} ${fmtKg(p.today.kgOut)}`).join(' · ')}</span>}>
              <ColumnChart height={190} format={(n) => `${compact(n)}`} series={per.map((p) => ({ name: p.site.shortName, color: SITE_COLOR[p.site.id] }))} data={days.map((d, i) => ({ label: fmtDayShort(d), values: per.map((p) => p.series[i]?.kgOut ?? 0), partial: i === last }))} />
            </Panel>
            <Panel icon={Wallet} title="Money out today" sub="UGX by category, per site" actions={<Button size="sm" variant="ghost" onClick={() => go.group('pnl')}>P&L</Button>}
              footer={categories.length ? <Legend items={spendCats.map((c) => ({ label: c.label, color: c.color }))} /> : undefined}>
              {categories.length === 0 ? <Empty icon={Wallet} title="No expense categories yet" hint="Add expense categories in Settings → Master data." action={<Button size="sm" onClick={() => go.group('settings')}>Open Settings</Button>} /> : spend.map((x) => (
                <button key={x.p.site.id} onClick={() => setDrill({ site: x.p.site.id, kind: 'cash' })} className="block w-full text-left rounded-md -mx-1.5 px-1.5 py-2 hover:bg-[var(--hover)] border-b border-[var(--line)] last:border-b-0">
                  <span className="flex items-center gap-2 mb-1.5"><SiteMark site={x.p.site.id} size={20} /><span className="t-base font-medium flex-1 truncate">{x.p.site.name}</span><span className="num t-base font-semibold">{fmtUGX(x.total)}</span></span>
                  {x.total > 0 ? <StackedBar height={10} legend={false} format={fmtUGX} segments={x.segments} /> : <span className="block h-[10px] rounded-[3px] bg-[var(--surface-3)]" />}
                  <span className="block t-xs text-[var(--text-3)] mt-1">{x.top ? `Largest: ${x.top.label}, ${Math.round((x.top.value / x.total) * 100)}% · ${plural(x.lines, 'payment')}` : 'Nothing paid out yet today'}</span>
                </button>
              ))}
            </Panel>
          </div>
        </div>

        <div className="flex flex-col gap-[var(--gap)] min-w-0">
          <Panel icon={Bell} title="Alerts" sub={unread.length ? `${unread.length} unread` : s.alerts.length ? 'all read' : undefined} pad={false} actions={unread.length > 0 ? <Button size="sm" variant="ghost" onClick={markRead}>Mark read</Button> : undefined}>
            {s.alerts.length === 0 ? (
              <div className="flex items-start gap-2.5 px-[var(--pad)] py-3"><IconChip icon={ShieldCheck} color="var(--ok)" /><div className="min-w-0"><div className="t-base font-medium">No alerts today</div><div className="t-sm text-[var(--text-3)]">A gate lock, a cash variance over threshold, a mass gap or an order over a credit limit lands here the moment it happens.</div></div></div>
            ) : (
              <div className="p-2 flex flex-col gap-1.5">
                {s.alerts.slice(0, 4).map((a) => (
                  <button key={a.id} onClick={openAlert} className={cn('w-full text-left rounded-md border px-2.5 py-2 flex items-start gap-2.5', a.read ? 'border-[var(--line)] bg-[var(--surface-2)]' : 'anim-alarm bg-[var(--bad-bg)] border-[color-mix(in_srgb,var(--bad)_40%,transparent)]')}>
                    <IconChip icon={Siren} color={a.read ? 'var(--text-3)' : 'var(--bad)'} />
                    <span className="min-w-0 flex-1"><span className={cn('block t-base font-semibold leading-snug', !a.read && 'text-[var(--bad)]')}>{a.title}</span><span className="block t-sm text-[var(--text-2)]">{a.detail}</span></span>
                    <span className="shrink-0 flex flex-col items-end gap-1"><span className="num t-xs text-[var(--text-3)]">{fmtTime(a.at)}</span>{a.siteId && <SiteBadge site={a.siteId} />}</span>
                  </button>
                ))}
              </div>
            )}
          </Panel>

          <Panel icon={Inbox} title="Waiting for you" sub={decisions ? plural(decisions, 'decision') : undefined} pad={false}
            footer={<div className="flex items-center justify-between gap-3"><span className="touch:hidden inline-flex items-center gap-1.5"><Kbd keys="w" />jump here<Kbd keys="arrowup" /><Kbd keys="arrowdown" />move<Kbd keys="enter" />open</span><button onClick={() => go.group('approvals')} className="font-medium text-[var(--text)] hover:underline ml-auto">All in Approvals</button></div>}>
            {decisions === 0 ? <div className="p-[var(--pad)]"><Empty icon={Inbox} title="Nothing is waiting for you" hint="Export orders and exceptions land here the moment a site raises them." /></div> : (
              <div ref={waiting} onKeyDown={rovingKeys}>
                {awaiting.map((o, i) => {
                  const c = s.clients.find((x) => x.id === o.clientId); const b = clientBalance(s, o.clientId); const total = orderTotal(o); const pct = c?.creditLimit ? Math.round(((b.balance + total) / c.creditLimit) * 100) : 0;
                  return (
                    <button key={o.id} data-roving tabIndex={i === 0 ? 0 : -1} onClick={() => review('credit', o.id)} className="group w-full flex items-center gap-2.5 px-[var(--pad)] py-2 text-left border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--hover)] focus-visible:bg-[var(--selected)] focus-visible:outline-none focus-visible:shadow-[inset_2px_0_0_var(--focus)]">
                      <IconChip icon={Landmark} color="var(--accent)" />
                      <span className="min-w-0 flex-1"><span className="block t-base font-medium truncate">{c?.name ?? o.number}</span><span className="flex items-center gap-1.5 t-sm text-[var(--text-3)] min-w-0"><SiteBadge site={o.siteId} /><span className="truncate"><span className="code">{o.number}</span> · {agoLabel(o.createdAt, s.today)}</span></span></span>
                      <span className="shrink-0 flex flex-col items-end gap-0.5"><span className="num t-base font-semibold">{o.currency === 'USD' ? fmtUSD(total) : fmtUGX(total)}</span>{pct > 0 && <Badge tone={pct > 100 ? 'bad' : pct > 80 ? 'warn' : 'neutral'}>{pct}% of limit</Badge>}</span>
                      <ChevronRight className="size-4 text-[var(--text-4)] group-hover:text-[var(--text-2)] shrink-0" />
                    </button>
                  );
                })}
                {exOpen.slice(0, Math.max(3, 7 - awaiting.length)).map((e, i) => {
                  const Icon = KIND_META[e.kind].icon;
                  return (
                    <button key={e.id} data-roving tabIndex={awaiting.length === 0 && i === 0 ? 0 : -1} onClick={() => review('approvals', e.id)} className="group w-full flex items-center gap-2.5 px-[var(--pad)] py-2 text-left border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--hover)] focus-visible:bg-[var(--selected)] focus-visible:outline-none focus-visible:shadow-[inset_2px_0_0_var(--focus)]">
                      <IconChip icon={Icon} color={severityColor(e.severity)} />
                      <span className="min-w-0 flex-1"><span className="block t-base font-medium leading-snug line-clamp-2">{e.title}</span><span className="flex items-center gap-1.5 mt-0.5 t-sm text-[var(--text-3)] min-w-0"><SiteBadge site={e.siteId} /><span className="truncate">{roleLabel(e.ownerRole)} · {agoLabel(e.raisedAt, s.today)}</span></span></span>
                      {e.severity !== 'info' && <Badge tone={severityTone(e.severity)} dot>{severityLabel[e.severity]}</Badge>}
                      <ChevronRight className="size-4 text-[var(--text-4)] group-hover:text-[var(--text-2)] shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel icon={History} title="Latest on the record" pad={false} actions={<><Badge tone="neutral">append-only</Badge><Button size="sm" variant="ghost" onClick={() => go.group('audit')}>Audit feed</Button></>}>
            {recent.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={History} title="No changes recorded yet" /></div> : recent.map((a) => (
              <div key={a.id} className="flex items-start gap-2.5 px-[var(--pad)] py-2 border-b border-[var(--line)] last:border-b-0">
                <Avatar name={a.actorName} size={22} className="mt-0.5" />
                <div className="min-w-0 flex-1"><div className="t-sm leading-snug">{a.summary}</div><div className="t-xs text-[var(--text-3)] flex items-center gap-1.5 mt-0.5 flex-wrap"><SiteBadge site={a.siteId} /><span>{a.actorName} · {fmtDateTime(a.at)}</span>{a.flag && a.flag !== 'normal' && <Badge tone={a.flag === 'edit' ? 'warn' : a.flag === 'variance' ? 'accent' : 'bad'}>{a.flag}</Badge>}</div></div>
              </div>
            ))}
          </Panel>
        </div>
      </div>

      <DrillSheet drill={drill} onClose={() => setDrill(null)} />
    </div>
  );
}

const DRILL_TITLE: Record<DrillKind, string> = { cash: 'Cash page today', headcount: 'Attendance today', output: 'Production entries today', machines: 'Machines this shift', waste: 'Mass balance today', dispatches: 'Dispatches today', exceptions: 'Open exceptions', receivables: 'Export receivables', stock: 'Stock on hand', orders: 'Export orders awaiting approval' };
const DRILL_TARGET: Record<DrillKind, string> = { cash: 'cash', headcount: 'people/attendance', output: 'production/wall', machines: 'production/wall', waste: 'reports', dispatches: 'stock/dispatch', exceptions: 'dashboard', receivables: 'sales/invoices', stock: 'stock', orders: 'sales/orders' };
const MACHINE_STATE = { ok: ['On target', 'ok'], logged: ['Logged', 'ok'], below: ['Below target', 'bad'], not_logged: ['Not logged', 'warn'], down: ['Down', 'bad'], arriving: ['Arriving', 'neutral'] } as const;

/** The records behind one number at one site. */
function DrillBody({ site, kind, onClose }: { site: Site; kind: DrillKind; onClose: () => void }) {
  const s = useStore(); const go = useGo();
  const person = (id: string) => s.people.find((p) => p.id === id);
  const client = (orderId: string) => s.clients.find((c) => c.id === s.orders.find((o) => o.id === orderId)?.clientId);

  if (kind === 'cash') {
    const cd = cashDayFor(s, site.id, s.today); const c = cd ? cashSummary(s, cd.id) : undefined;
    if (!c || !cd) return <Empty icon={Wallet} title="No cash page open today" hint="The cashier opens the page with the opening float." />;
    return (
      <div>
        <div className="surface-2 px-3 py-1 mb-2"><KV k="Opening" v={fmtUGX(cd.opening)} /><KV k="Sales in" v={fmtUGX(c.sales)} /><KV k="Other receipts" v={fmtUGX(c.receipts)} /><KV k="Expenses out" v={`− ${fmtUGX(c.expenses)}`} /><KV k="Wages and payouts" v={`− ${fmtUGX(c.wages)}`} /><KV k="Expected closing" v={<span className="font-semibold">{fmtUGX(c.expectedClosing)}</span>} /><KV k="Status" v={<Badge tone={cd.status === 'closed' ? 'ok' : 'warn'} dot>{cd.status}</Badge>} /></div>
        {c.entries.map((e) => <Row key={e.id} left={<span className={cn('size-2 rounded-full shrink-0', e.direction === 'in' ? 'bg-[var(--ok)]' : 'bg-[var(--text-4)]')} />} title={`${catLabel(s.refs, e.category)}${e.subcategory ? ` · ${e.subcategory}` : ''}`} sub={`${e.payee ? `${e.payee} · ` : ''}${fmtTime(e.at)}${e.hasReceiptPhoto ? ' · receipt' : ''}`} right={<span className={cn('num t-base font-medium', e.direction === 'in' && 'text-[var(--ok)]')}>{e.direction === 'in' ? '+' : '−'}{fmtNum(e.amount)}</span>} />)}
      </div>
    );
  }
  if (kind === 'headcount') {
    const ids = s.shifts.filter((sh) => sh.siteId === site.id && sh.day === s.today).map((sh) => sh.id);
    const rows = s.attendance.filter((a) => ids.includes(a.shiftId)).sort((a, b) => a.status.localeCompare(b.status));
    if (!rows.length) return <Empty icon={Users} title="No attendance marked yet" />;
    return <>{rows.map((a) => { const p = person(a.personId); const tone = a.status === 'present' ? 'ok' : a.status === 'half' ? 'warn' : 'bad'; return <Row key={a.id} left={<Avatar name={p?.fullName ?? '?'} seed={p?.avatarSeed} size={26} ring={tone} />} title={p?.fullName ?? a.personId} sub={`${p?.sector ?? ''} · ${a.shiftId.endsWith('night') ? 'night' : 'day'} shift · ${fmtTime(a.at)}${a.workedSiteId !== p?.homeSiteId ? ' · shared' : ''}`} right={<Badge tone={tone}>{a.status}{a.overtimeHours ? ` +${a.overtimeHours} h` : ''}</Badge>} />; })}</>;
  }
  if (kind === 'output') {
    const stage = site.id === 'mats' ? 'weave' : site.id === 'bags' ? 'convert' : 'pelletise';
    const rows = s.production.filter((p) => p.siteId === site.id && p.day === s.today && p.stageCode === stage).sort((a, b) => a.machineId.localeCompare(b.machineId, undefined, { numeric: true }));
    if (!rows.length) return <Empty icon={Factory} title="Nothing logged yet today" />;
    return <>{rows.map((e) => { const m = s.machines.find((x) => x.id === e.machineId); const pr = s.products.find((x) => x.id === e.productId); const bench = s.benchmarks.find((b) => b.machineId === e.machineId && b.productId === e.productId)?.unitsPerShift; return <Row key={e.id} left={<span className="size-2.5 rounded-[3px] shrink-0" style={{ background: pr?.colour ?? 'var(--text-4)' }} />} title={`${m?.code ?? e.machineId}${pr ? ` · ${pr.internalName}` : ''}`} sub={`${person(e.operatorId ?? '')?.fullName ?? 'No operator'} · ${e.downtimeMin ? `${e.downtimeMin} min down${e.downtimeReason ? ` (${e.downtimeReason})` : ' (no reason)'}` : 'no downtime'} · ${fmtTime(e.at)}`} right={<span className="num t-base"><span className="font-semibold">{fmtNum(e.goodUnits)}</span>{bench ? <span className="text-[var(--text-3)]"> / {fmtNum(bench)}</span> : <span className="text-[var(--text-3)]"> · {fmtKg(e.outputKg)}</span>}</span>} />; })}</>;
  }
  if (kind === 'machines') {
    const wall = machineWall(s, site.id, s.today, currentShiftKind());
    return <>{wall.map((t) => { const [label, tone] = MACHINE_STATE[t.state]; return <Row key={t.machine.id} left={t.operator ? <Avatar name={t.operator.fullName} seed={t.operator.avatarSeed} size={24} /> : <IconChip icon={Factory} size="sm" />} title={t.machine.code} sub={t.entry ? `${t.operator?.fullName ?? 'No operator'}${t.product ? ` · ${t.product.internalName}` : ''}${t.entry.downtimeMin ? ` · ${t.entry.downtimeMin} min down` : ''}` : t.state === 'arriving' ? 'Not commissioned yet' : 'No entry this shift'} right={<span className="inline-flex items-center gap-2">{t.pct !== undefined && <span className="num t-sm text-[var(--text-2)]">{t.pct}%</span>}<Badge tone={tone} dot>{label}</Badge></span>} />; })}</>;
  }
  if (kind === 'waste') {
    const mb = massBalanceDay(s, site.id, s.today);
    if (!mb.kgIn) return <Empty icon={Scale} title="No material issued yet today" />;
    const parts = [{ label: 'Output', value: Math.round(mb.kgOut), color: 'var(--series-1)' }, { label: 'Work in progress', value: Math.round(mb.wipDeltaKg), color: 'var(--series-3)' }, { label: 'Weighed waste', value: Math.round(mb.wasteKg), color: 'var(--series-4)' }, { label: 'Unaccounted', value: Math.max(0, Math.round(mb.gapKg)), color: 'var(--bad)' }];
    return (
      <div>
        <div className="mb-3"><StackedBar segments={parts} format={(n) => `${fmtNum(n)} kg`} /></div>
        <div className="surface-2 px-3 py-1"><KV k="Kilos in" v={fmtKg(Math.round(mb.kgIn))} /><KV k="Kilos out" v={fmtKg(Math.round(mb.kgOut))} /><KV k="Work in progress" v={fmtKg(Math.round(mb.wipDeltaKg))} /><KV k="Weighed waste" v={`${fmtKg(Math.round(mb.wasteKg))} · ${((mb.wasteKg / mb.kgIn) * 100).toFixed(1)}%`} /><KV k={`Allowed loss (${site.thresholds.massGapPct}%)`} v={fmtKg(Math.round(mb.allowedLossKg))} /><KV k="Balance" v={<Badge tone={mb.state === 'balanced' ? 'ok' : mb.state === 'explainable' ? 'warn' : 'bad'} dot>{mb.state === 'balanced' ? 'Balanced' : mb.state === 'explainable' ? 'Within allowed loss' : `${fmtKg(Math.round(mb.gapKg))} unaccounted`}</Badge>} /></div>
      </div>
    );
  }
  if (kind === 'dispatches') {
    const rows = s.dispatches.filter((d) => d.siteId === site.id && d.createdAt.startsWith(s.today));
    const ready = s.orders.filter((o) => o.siteId === site.id && (o.status === 'approved' || o.status === 'picking'));
    if (!rows.length) return <Empty icon={Truck} title="No dispatches today" hint={ready.length ? `${plural(ready.length, 'approved order')} ready to load: ${ready.map((o) => o.number).join(', ')}` : 'No approved orders waiting.'} />;
    return <>{rows.map((d) => <Row key={d.id} left={<IconChip icon={Truck} size="sm" />} title={<><span className="code">{d.deliveryNoteNo}</span> · {client(d.orderId)?.name ?? ''}</>} sub={`${d.scannedLabelIds.length} bundles · expected ${fmtKg(d.expectedKg)}${d.gateKg ? ` · scale ${fmtKg(d.gateKg)}` : ''} · ${d.driver}`} right={<Badge tone={d.gateStatus === 'pass' ? 'ok' : d.gateStatus === 'hold' ? 'bad' : d.gateStatus === 'overridden' ? 'warn' : 'neutral'} dot>{d.gateStatus}</Badge>} />)}</>;
  }
  if (kind === 'exceptions') {
    const rows = openExceptions(s, site.id);
    if (!rows.length) return <Empty icon={ShieldCheck} title="Nothing open" hint="Every exception at this site has been decided." />;
    return <>{rows.map((e) => <Row key={e.id} left={<IconChip icon={KIND_META[e.kind].icon} color={severityColor(e.severity)} size="sm" />} title={e.title} sub={`${roleLabel(e.ownerRole)} · ${fmtDateTime(e.raisedAt)}`} right={<Badge tone={severityTone(e.severity)}>{severityLabel[e.severity]}</Badge>} onClick={() => { onClose(); setPresetSelection(e.id); go.group('approvals'); }} chevron />)}</>;
  }
  if (kind === 'receivables') {
    const rows = receivables(s, site.id);
    if (!rows.length) return <Empty icon={Landmark} title="Nothing outstanding" hint="This site sells for cash before delivery." />;
    return <>{rows.map((r) => (
      <div key={r.client.id} className="mb-2">
        <Row left={<Avatar name={r.client.name} size={26} />} title={r.client.name} sub={`${r.client.country} · oldest invoice ${r.ageDays} days · last paid ${r.lastPayment ? fmtDateTime(r.lastPayment.at) : 'never'}`} right={<span className="num t-base font-semibold">{fmtUSD(r.balance)}</span>} />
        {r.openInvoices.map((i) => <div key={i.id} className="flex justify-between t-sm pl-10 pr-1 py-1 text-[var(--text-2)]"><span><span className="code">{i.number}</span> · {fmtDateTime(i.issuedAt)}</span><span className="num">{fmtUSD(i.total)}</span></div>)}
      </div>
    ))}</>;
  }
  if (kind === 'orders') {
    const rows = s.orders.filter((o) => o.siteId === site.id && o.status === 'awaiting_approval');
    if (!rows.length) return <Empty icon={Landmark} title="No export order is waiting" />;
    return <>{rows.map((o) => { const c = s.clients.find((x) => x.id === o.clientId); const b = clientBalance(s, o.clientId); const total = orderTotal(o); const pct = c?.creditLimit ? Math.round(((b.balance + total) / c.creditLimit) * 100) : 0; return <Row key={o.id} left={<Avatar name={c?.name ?? '?'} size={26} />} title={c?.name ?? o.number} sub={<><span className="code">{o.number}</span> · {plural(o.lines.reduce((t, l) => t + l.bundles, 0), 'bundle')} · balance {fmtUSD(b.balance)}</>} right={<span className="flex flex-col items-end gap-0.5"><span className="num t-base font-semibold">{o.currency === 'USD' ? fmtUSD(total) : fmtUGX(total)}</span>{pct > 0 && <Badge tone={pct > 100 ? 'bad' : pct > 80 ? 'warn' : 'neutral'}>{pct}% of limit after</Badge>}</span>} onClick={() => { onClose(); setPresetSelection(o.id); go.group('credit'); }} chevron />; })}</>;
  }
  const rows = stockByProduct(s, site.id);
  if (!rows.length) return <Empty icon={Boxes} title="Nothing in stock" />;
  return <>{rows.map((r) => <Row key={r.product.id} left={<span className="size-2.5 rounded-[3px] shrink-0" style={{ background: r.product.colour ?? 'var(--text-4)' }} />} title={r.product.internalName} sub={`${fmtNum(r.pieces)} pieces · ${fmtKg(r.kg)} · ${plural(r.zones.size, 'zone')}`} right={<span className="num t-base font-semibold">{fmtNum(r.bundles)}</span>} />)}</>;
}

/** The ledger behind a number: one site, or the three sites one after another. */
function DrillSheet({ drill, onClose }: { drill: Drill | null; onClose: () => void }) {
  const go = useGo();
  if (!drill) return null;
  const sites = drill.site === 'all' ? SITE_LIST : SITE_LIST.filter((x) => x.id === drill.site);
  const single = drill.site === 'all' ? undefined : sites[0];
  const groupTarget = drill.kind === 'exceptions' ? ['approvals', 'Open Approvals'] : drill.kind === 'receivables' || drill.kind === 'orders' ? ['credit', 'Open the credit desk'] : undefined;
  return (
    <Sheet open onClose={onClose} title={DRILL_TITLE[drill.kind]} sub={single ? single.name : 'All three sites'} width={500}
      footer={single ? <Button variant="secondary" onClick={() => { onClose(); go.site(DRILL_TARGET[drill.kind], single.id); }}>Open in {single.shortName}</Button> : groupTarget ? <Button variant="secondary" onClick={() => { onClose(); go.group(groupTarget[0]); }}>{groupTarget[1]}</Button> : undefined}>
      {single ? <DrillBody site={single} kind={drill.kind} onClose={onClose} /> : sites.map((site) => (
        <section key={site.id} className="mb-4 last:mb-0">
          <header className="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-[var(--line-2)]"><SiteMark site={site.id} size={22} /><h4 className="t-base font-semibold flex-1 truncate">{site.name}</h4><Button size="sm" variant="ghost" onClick={() => { onClose(); go.site(DRILL_TARGET[drill.kind], site.id); }}>Open in {site.shortName}</Button></header>
          <DrillBody site={site} kind={drill.kind} onClose={onClose} />
        </section>
      ))}
    </Sheet>
  );
}
