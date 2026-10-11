import { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Download, Flame, Grid3x3, PackageCheck, Printer, Recycle, Truck, Users, Wallet } from 'lucide-react';
import type { CashEntry, ExceptionKind, Product } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite } from '@/app/hooks';
import { DEMO_HOUR, addDays, dailySeries, dow, headcount, headcountBySector, lastWorkingDays, massBalanceDay } from '@/data/selectors';
import { compact, fmtDay, fmtDayShort, fmtKg, fmtNum, fmtPct, fmtUGX } from '@/data/format';
import { Badge, Bar, Button, DataGrid, Empty, KpiStrip, Menu, Meter, Note, Panel, StackedBar, Stat, Status, Tabs, cn, useHotkey, useMedia, type Column } from '@/components/ui';
import { ColumnChart, CountUp, Delta, LineChart, pctChange } from '@/components/charts';
import { SITE_COLOR } from '@/config/siteIdentity';
import { CATEGORY_META, PRINT_CSS, categoryColor, downloadCsv, moneyOutSplit, spanLabel, useExpenseCategories } from '@/features/cash/categories';

type Range = 'today' | 'week' | 'last7' | 'month';
const RANGES: { value: Range; label: string; short: string }[] = [{ value: 'today', label: 'Today', short: 'Today' }, { value: 'week', label: 'This week', short: 'Week' }, { value: 'last7', label: 'Last 7 working days', short: '7 days' }, { value: 'month', label: 'This month', short: 'Month' }];
/** What one counted unit of output is called, by the kind of product (a fixed domain enum, not a site list). */
const KIND_UNIT: Record<Product['kind'], string> = { mat: 'mats', bag_pack: 'packs', pellet: 'sacks', roll: 'rolls', material: 'units' };
const KIND_LABEL: Record<ExceptionKind, string> = { gate_variance: 'Gate variance', mass_gap: 'Mass gap', cash_variance: 'Cash variance', below_benchmark: 'Below benchmark', pod_discrepancy: 'Delivery discrepancy', credit_over_limit: 'Credit over limit', ghost_worker: 'Ghost worker', contract_expiring: 'Contract expiring', low_stock: 'Low stock', not_logged: 'Not logged' };
const BALANCE: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' }> = { balanced: { label: 'balanced', tone: 'ok' }, explainable: { label: 'within allowed loss', tone: 'warn' }, missing: { label: 'kilos missing', tone: 'bad' } };

const csv = (name: string, header: string[], rows: (string | number)[][]) => { downloadCsv(name, header, rows); useStore.getState().toast({ kind: 'ok', title: `${name}.csv downloaded` }); };
const CsvButton = ({ onClick }: { onClick: () => void }) => <Button size="sm" variant="ghost" icon={Download} onClick={onClick} className="no-print" aria-label="Export this section as CSV">CSV</Button>;

/** Site reports for the Site Manager: output, waste, cash, headcount, dispatches and exceptions over a chosen range, each exportable. */
export function Reports() {
  const s = useStore(); const site = useSite(); const roomy = useMedia('(min-width: 640px)');
  const cats = useExpenseCategories(); const categoryLabel = cats.label;
  const [range, setRange] = useState<Range>('last7');
  const [pivotBy, setPivotBy] = useState<'units' | 'kg'>('units');
  const days = useMemo(() => {
    if (range === 'today') return [s.today]; if (range === 'last7') return lastWorkingDays(site.id, s.today, 7);
    const start = range === 'week' ? addDays(s.today, -((dow(s.today) + 6) % 7)) : s.today.slice(0, 8) + '01';
    const out: string[] = []; for (let d = start; d <= s.today; d = addDays(d, 1)) if (!site.closedDays.includes(dow(d))) out.push(d); return out.length ? out : [s.today];
  }, [range, s.today, site]);
  const inRange = (day: string) => days.includes(day); const label = days.length === 1 ? fmtDay(days[0]) : spanLabel(days[0], days[days.length - 1], fmtDayShort); const slug = `${site.id}-${range}-${s.today}`;
  useHotkey(['1', '2', '3', '4'], (e) => setRange(RANGES[+e.key - 1].value), { label: 'Switch range: today, week, 7 days, month' });

  // Day-by-day series. A range shorter than three days borrows the last seven working days so the trend charts still show a trend.
  const prevDays = useMemo(() => lastWorkingDays(site.id, addDays(days[0], -1), days.length), [days, site.id]);
  const series = useMemo(() => dailySeries(s, site.id, days), [s, site.id, days]);
  const prev = useMemo(() => dailySeries(s, site.id, prevDays), [s, site.id, prevDays]);
  const borrowed = days.length < 3;
  const trend = useMemo(() => (borrowed ? dailySeries(s, site.id, lastWorkingDays(site.id, s.today, 7)) : series), [borrowed, s, site.id, series]);
  const trendLabel = spanLabel(trend[0].day, trend[trend.length - 1].day, fmtDayShort); const trendPartial = trend[trend.length - 1].partial;
  const xLabels = trend.map((d) => fmtDayShort(d.day));
  const siteKinds = s.products.filter((p) => p.siteId === site.id && p.kind !== 'material' && p.active !== false && s.production.some((e) => e.productId === p.id)).map((p) => p.kind);
  const unit = KIND_UNIT[siteKinds.sort((a, b) => siteKinds.filter((k) => k === b).length - siteKinds.filter((k) => k === a).length)[0] ?? 'material']; const Unit = unit[0].toUpperCase() + unit.slice(1);

  // 1. Output per product per machine
  const prod = s.production.filter((p) => p.siteId === site.id && inRange(p.day) && p.productId && p.goodUnits > 0);
  const products = s.products.filter((p) => prod.some((e) => e.productId === p.id));
  const pivot = [...new Set(prod.map((e) => e.machineId))].map((mid) => {
    const m = s.machines.find((x) => x.id === mid); const by: Record<string, number> = {}; const byKg: Record<string, number> = {};
    for (const e of prod.filter((x) => x.machineId === mid)) { by[e.productId!] = (by[e.productId!] ?? 0) + e.goodUnits; byKg[e.productId!] = (byKg[e.productId!] ?? 0) + e.outputKg; }
    return { id: mid, code: m?.code ?? mid, stage: site.stages.find((st) => st.code === m?.stageCode)?.name ?? m?.stageCode ?? '', by, byKg, total: Object.values(by).reduce((t, v) => t + v, 0), kg: Object.values(byKg).reduce((t, v) => t + v, 0) };
  }).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  type PivotRow = (typeof pivot)[number];
  const cellOf = (r: PivotRow, pid: string) => Math.round((pivotBy === 'units' ? r.by : r.byKg)[pid] ?? 0);
  const colTotal = (pid: string) => pivot.reduce((t, r) => t + cellOf(r, pid), 0);
  const cellMax = Math.max(1, ...pivot.flatMap((r) => products.map((p) => cellOf(r, p.id))));
  const unitsTotal = pivot.reduce((t, r) => t + r.total, 0); const kgTotal = pivot.reduce((t, r) => t + r.kg, 0);
  const pivotCols: Column<PivotRow>[] = [
    { key: 'm', header: 'Machine', sticky: true, sort: (r) => r.code.replace(/\d+/, (x) => x.padStart(3, '0')), cell: (r) => <span className="font-medium">{r.code}<span className="t-xs font-normal text-[var(--text-3)]"> · {r.stage}</span></span> },
    { key: 't', header: pivotBy === 'units' ? 'Total' : 'Total kg', align: 'right', mono: true, sort: (r) => (pivotBy === 'units' ? r.total : r.kg), cell: (r) => <span className="font-semibold">{fmtNum(Math.round(pivotBy === 'units' ? r.total : r.kg))}</span> },
    { key: 'o', header: pivotBy === 'units' ? 'Output kg' : 'Units', align: 'right', mono: true, sort: (r) => (pivotBy === 'units' ? r.kg : r.total), cell: (r) => <span className="text-[var(--text-2)]">{fmtNum(Math.round(pivotBy === 'units' ? r.kg : r.total))}</span> },
    ...products.map((p) => ({ key: p.id, header: <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ background: p.colour ?? 'var(--text-4)' }} />{p.internalName}</span>, align: 'right' as const, mono: true, sort: (r: PivotRow) => cellOf(r, p.id), cell: (r: PivotRow) => { const v = cellOf(r, p.id); return v ? <span className="inline-block min-w-[52px] px-1.5 rounded-[4px] leading-[20px]" style={{ background: `color-mix(in srgb, var(--series-1) ${Math.round(5 + (v / cellMax) * 22)}%, transparent)` }}>{fmtNum(v)}</span> : <span className="text-[var(--text-4)]">·</span>; } })),
  ];

  // 2. Waste per day
  const waste = days.map((d) => { const mb = massBalanceDay(s, site.id, d); return { day: d, ...mb, wastePct: mb.kgIn ? (mb.wasteKg / mb.kgIn) * 100 : 0 }; });
  const wasteTotals = waste.reduce((t, w) => ({ kgIn: t.kgIn + w.kgIn, wasteKg: t.wasteKg + w.wasteKg, gapKg: t.gapKg + Math.max(0, w.gapKg) }), { kgIn: 0, wasteKg: 0, gapKg: 0 });
  const wastePct = wasteTotals.kgIn ? (wasteTotals.wasteKg / wasteTotals.kgIn) * 100 : 0;
  const prevWaste = prevDays.reduce((t, d) => { const mb = massBalanceDay(s, site.id, d); return { kgIn: t.kgIn + mb.kgIn, wasteKg: t.wasteKg + mb.wasteKg }; }, { kgIn: 0, wasteKg: 0 });
  const earlier = trend.slice(0, -1).filter((d) => d.kgIn > 0);
  const wasteDelta = prevWaste.kgIn ? { value: wastePct - (prevWaste.wasteKg / prevWaste.kgIn) * 100, label: `vs the ${prevDays.length} working day${prevDays.length === 1 ? '' : 's'} before` } : earlier.length ? { value: trend[trend.length - 1].wastePct - earlier.reduce((t, d) => t + d.wastePct, 0) / earlier.length, label: 'latest day vs the earlier days' } : undefined;
  const balanceCount = (['balanced', 'explainable', 'missing'] as const).map((k) => ({ ...BALANCE[k], n: waste.filter((w) => w.kgIn > 0 && w.state === k).length }));

  // 3. Cash by category
  const cash = s.cashEntries.filter((e) => e.siteId === site.id && inRange(e.day));
  const catRows = [...new Set(cash.map((e) => e.category))].map((c) => { const es = cash.filter((e) => e.category === c); const sum = (f: (e: CashEntry) => boolean) => es.filter(f).reduce((t, e) => t + e.amount, 0); return { category: c, inAmt: sum((e) => e.direction === 'in'), outAmt: sum((e) => e.direction === 'out'), count: es.length }; }).sort((a, b) => b.outAmt + b.inAmt - (a.outAmt + a.inAmt));
  const totalIn = catRows.reduce((t, r) => t + r.inAmt, 0); const totalOut = catRows.reduce((t, r) => t + r.outAmt, 0);
  const outSplit = moneyOutSplit(cash, cats.items); const prevOut = prev.every((d) => d.cashIn + d.cashOut > 0) ? prev.reduce((t, d) => t + d.cashOut, 0) : 0;

  // 4. Headcount
  const hc = days.map((d) => ({ day: d, ...headcount(s, site.id, d) })); const hcAvg = hc.length ? hc.reduce((t, h) => t + h.total, 0) / hc.length : 0;
  const sectors = headcountBySector(s, site.id, days[days.length - 1]);
  const prevHc = prev.length && prev.every((d) => d.headcount > 0) ? prev.reduce((t, d) => t + d.headcount, 0) / prev.length : 0; const overtime = hc.reduce((t, h) => t + h.overtimeHours, 0);

  // 5. Dispatches
  const dsp = s.dispatches.filter((d) => d.siteId === site.id && inRange(d.createdAt.slice(0, 10))).map((d) => { const o = s.orders.find((x) => x.id === d.orderId); return { d, o, client: s.clients.find((c) => c.id === o?.clientId)?.name ?? '—', bundles: o?.lines.reduce((t, l) => t + l.bundles, 0) ?? 0 }; }).sort((a, b) => b.d.createdAt.localeCompare(a.d.createdAt));
  const dspKg = dsp.reduce((t, r) => t + (r.d.gateKg ?? r.d.expectedKg), 0); const holds = dsp.filter((r) => r.d.gateStatus === 'hold' || r.d.gateStatus === 'overridden');

  // 6. Exceptions by kind
  const ex = s.exceptions.filter((e) => e.siteId === site.id && inRange(e.raisedAt.slice(0, 10)));
  const exRows = (Object.keys(KIND_LABEL) as ExceptionKind[]).map((k) => { const es = ex.filter((e) => e.kind === k); return { kind: k, total: es.length, open: es.filter((e) => e.status === 'open').length, critical: es.filter((e) => e.severity === 'critical').length }; }).filter((r) => r.total > 0).sort((a, b) => b.total - a.total); const exMax = Math.max(1, ...exRows.map((r) => r.total));
  const exOpen = ex.filter((e) => e.status === 'open').length;

  // Output against the benchmark: a day still running is only measured against what is due by now.
  const progress = Math.max(0.1, Math.min(1, (DEMO_HOUR - 7) / 12));
  const units = series.reduce((t, d) => t + d.units, 0); const due = Math.round(series.reduce((t, d) => t + d.target * (d.partial ? progress : 1), 0));

  const exportOutput = () => csv(`output-${slug}`, ['Machine', 'Stage', ...products.map((p) => p.internalName), 'Total', 'Output kg'], pivot.map((r) => [r.code, r.stage, ...products.map((p) => r.by[p.id] ?? 0), r.total, Math.round(r.kg)]));
  const exportWaste = () => csv(`waste-${slug}`, ['Day', 'Kg in', 'Kg out', 'Waste kg', 'Waste %', 'Gap kg', 'State'], waste.map((w) => [w.day, w.kgIn, w.kgOut, w.wasteKg, w.wastePct.toFixed(1), w.gapKg, w.state]));
  const exportCash = () => csv(`cash-${slug}`, ['Category', 'In (UGX)', 'Out (UGX)', 'Entries'], catRows.map((r) => [categoryLabel(r.category), r.inAmt, r.outAmt, r.count]));
  const exportHeadcount = () => csv(`headcount-${slug}`, ['Day', 'Present', 'Half day', 'Total', 'Overtime h'], hc.map((h) => [h.day, h.present, h.half, h.total, h.overtimeHours]));
  const exportDispatches = () => csv(`dispatches-${slug}`, ['Delivery note', 'Day', 'Client', 'Order', 'Bundles', 'Expected kg', 'Gate kg', 'Variance %', 'Gate'], dsp.map((r) => [r.d.deliveryNoteNo, r.d.createdAt.slice(0, 10), r.client, r.o?.number ?? '', r.bundles, r.d.expectedKg, r.d.gateKg ?? '', r.d.variancePct ?? '', r.d.gateStatus]));
  const exportExceptions = () => csv(`exceptions-${slug}`, ['Kind', 'Raised', 'Open', 'Critical'], exRows.map((r) => [KIND_LABEL[r.kind], r.total, r.open, r.critical]));
  const exportDaily = () => csv(`daily-${slug}`, ['Day', Unit, 'Benchmark', 'Kg in', 'Kg out', 'Waste %', 'Cash in (UGX)', 'Cash out (UGX)', 'Headcount', 'Dispatches', 'Downtime min'], series.map((d) => [d.day, d.units, d.target, d.kgIn, d.kgOut, d.wastePct, d.cashIn, d.cashOut, d.headcount, d.dispatches, d.downtimeMin]));

  return (
    <div className="print-area flex flex-col gap-[var(--gap)]">
      <style>{PRINT_CSS}</style>
      <div className="hidden print:block"><div className="t-title">{site.legalName} · Site reports</div><div className="t-sm">{RANGES.find((r) => r.value === range)?.label} · {label} · {days.length} working day{days.length === 1 ? '' : 's'}</div></div>

      <section className="hero relative px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-4 no-print">
        <div className="flex items-center gap-3.5 min-w-0">
          <span className="size-12 rounded-xl grid place-items-center shrink-0 shadow-[inset_0_1px_0_rgb(255_255_255/.25)]" style={{ background: SITE_COLOR[site.id] }}><BarChart3 className="size-6" /></span>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-white/55">{site.legalName} · Site reports</div>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] leading-tight">Reports</h1>
            <div className="text-[12.5px] text-white/60 truncate">{label} · {days.length} working day{days.length === 1 ? '' : 's'}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <Tabs value={range} onChange={setRange} tabs={RANGES.map((r) => ({ value: r.value, label: roomy ? r.label : r.short }))} className="bg-white/10! [&_[role=tab]]:text-white/70 [&_[role=tab]:hover]:text-white [&_[role=tab][aria-selected=true]]:bg-white [&_[role=tab][aria-selected=true]]:text-[var(--hero-a)] [&_[role=tab][aria-selected=true]]:shadow-none" />
          <Button variant="inverse" icon={Printer} hotkey="p" hotkeyLabel="Print the report" onClick={() => window.print()}>Print</Button>
          <Menu align="right" width={248} trigger={({ toggle }) => <Button variant="accent" icon={Download} hotkey="e" hotkeyLabel="Export a section as CSV" onClick={toggle}>Export</Button>}
            items={[
              { label: 'Daily summary', hint: `${series.length} ${series.length === 1 ? 'day' : 'days'}`, icon: Download, onSelect: exportDaily },
              { label: 'Output by machine', hint: `${pivot.length} machines`, icon: Download, onSelect: exportOutput, divider: true },
              { label: 'Waste per day', icon: Download, onSelect: exportWaste },
              { label: 'Cash by category', icon: Download, onSelect: exportCash },
              { label: 'Headcount', icon: Download, onSelect: exportHeadcount },
              { label: 'Dispatches', hint: `${dsp.length} ${dsp.length === 1 ? 'note' : 'notes'}`, icon: Download, onSelect: exportDispatches },
              { label: 'Exceptions by kind', icon: Download, onSelect: exportExceptions },
            ]} />
        </div>
      </section>
      {site.toBeConfirmed && <Note tone="warn">{site.toBeConfirmed}</Note>}

      <KpiStrip>
        <Stat label={`${Unit} produced`} icon={PackageCheck} accent="var(--series-3)" value={<CountUp value={units} />} delta={due ? <Delta value={(units / due) * 100 - 100} label="against the benchmark due so far" /> : undefined} spark={trend.map((d) => d.units)} sub={due ? `${fmtNum(due)} due · ${pivot.length} machines` : `${pivot.length} machines · ${products.length} products`} />
        <Stat label="Waste, measured" icon={site.id === 'recycling' ? Recycle : Flame} accent="var(--series-4)" tone={wasteTotals.gapKg > 0 ? 'warn' : 'neutral'} value={<><CountUp value={wastePct} format={(n) => n.toFixed(1)} /><span className="text-[var(--text-3)] font-medium">%</span></>} delta={wasteDelta ? <Delta value={wasteDelta.value} suffix=" pt" goodWhen="down" label={wasteDelta.label} /> : undefined} spark={trend.map((d) => d.wastePct)} sub={wasteTotals.gapKg > 0 ? `${fmtKg(Math.round(wasteTotals.gapKg))} unexplained` : `${fmtKg(Math.round(wasteTotals.wasteKg))} weighed · all kilos accounted for`} />
        <Stat label="Cash out" icon={Wallet} accent="var(--series-2)" value={<CountUp value={totalOut} format={compact} />} delta={range !== 'today' && prevOut ? <Delta value={pctChange(totalOut, prevOut)} goodWhen="none" label={`vs the ${prevDays.length} working days before`} /> : undefined} spark={trend.map((d) => d.cashOut)} sub={`UGX · ${compact(totalIn)} came in`} />
        <Stat label="Average headcount" icon={Users} accent="var(--series-1)" value={<CountUp value={Math.round(hcAvg)} />} delta={prevHc ? <Delta value={pctChange(hcAvg, prevHc)} label={`vs the ${prevDays.length} working day${prevDays.length === 1 ? '' : 's'} before`} /> : undefined} spark={trend.map((d) => d.headcount)} sub={`${fmtNum(overtime)} overtime hours`} />
        <Stat label="Dispatches" icon={Truck} accent="var(--series-5)" tone={holds.length ? 'warn' : 'neutral'} value={<CountUp value={dsp.length} />} spark={trend.map((d) => d.dispatches)} sub={`${fmtKg(Math.round(dspKg))} · ${holds.length} gate hold${holds.length === 1 ? '' : 's'}`} />
        <Stat label="Exceptions raised" icon={AlertTriangle} accent="var(--series-8)" spark={trend.map((d) => s.exceptions.filter((e) => e.siteId === site.id && e.raisedAt.startsWith(d.day)).length)} tone={exRows.some((r) => r.critical) ? 'bad' : exOpen ? 'warn' : 'neutral'} value={<CountUp value={ex.length} />} sub={ex.length ? `${exOpen} still open · ${exRows.length} kind${exRows.length === 1 ? '' : 's'}` : 'Nothing flagged'} />
      </KpiStrip>

      {/* Trends */}
      <div className="grid gap-[var(--gap)] lg:grid-cols-2 xl:grid-cols-3">
        <Panel icon={BarChart3} title={`${Unit} per day`} sub={`vs benchmark · ${trendLabel}`} actions={<CsvButton onClick={exportDaily} />}>
          {trend.every((d) => !d.units) ? <Empty icon={BarChart3} title="No output logged in this range" hint="Entries from the machine wall appear here." /> : <>
            <ColumnChart height={190} data={trend.map((d) => ({ label: fmtDayShort(d.day), values: [d.units], partial: d.partial, target: d.target || undefined }))} />
            <div className="t-xs text-[var(--text-3)] mt-1">The dark tick on each bar is that day's benchmark.{trendPartial ? ' Today is drawn lighter because the shift is still running.' : ''}{borrowed ? ' Shown over the last 7 working days for context.' : ''}</div>
          </>}
        </Panel>
        <Panel icon={site.id === 'recycling' ? Recycle : Flame} title="Waste per day" sub={`% of kilos in · ${trendLabel}`} actions={<CsvButton onClick={exportWaste} />}>
          {trend.every((d) => !d.kgIn) ? <Empty title="No input recorded" hint="Waste is measured against kilos in at the first stage." /> : <>
            <LineChart height={190} labels={xLabels} partialLast={trendPartial} format={(n) => `${Math.round(n * 10) / 10}%`} series={[{ name: 'Waste %', color: 'var(--series-4)', data: trend.map((d) => (d.kgIn ? d.wastePct : null)) }]} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 t-xs text-[var(--text-2)] mt-1"><span className="text-[var(--text-3)]">Mass balance, {days.length === 1 ? 'today' : `${days.length} days`}:</span>{balanceCount.map((b) => <Status key={b.label} tone={b.tone}><span className="num font-medium">{b.n}</span> {b.label}</Status>)}</div>
          </>}
        </Panel>
        <Panel icon={Wallet} title="Cash in and out" sub={`UGX · ${trendLabel}`} className="lg:col-span-2 xl:col-span-1">
          {trend.every((d) => !d.cashIn && !d.cashOut) ? <Empty title="No cash entries in this range" hint="The cashier's page feeds this chart." /> : <LineChart height={190} labels={xLabels} partialLast={trendPartial} series={[{ name: 'Cash in', color: 'var(--series-3)', data: trend.map((d) => d.cashIn), area: true }, { name: 'Cash out', color: 'var(--series-2)', data: trend.map((d) => d.cashOut) }]} />}
        </Panel>
      </div>

      <div className="grid gap-[var(--gap)] xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] items-start">
        <Panel icon={Wallet} title="Cash by category" sub={label} pad={false} actions={<CsvButton onClick={exportCash} />}>
          {catRows.length === 0 ? <div className="p-[var(--pad)]"><Empty title="No cash entries in this range" hint="The cashier's page feeds this table." /></div> : <>
            <div className="p-[var(--pad)] border-b border-[var(--line)]">
              <div className="flex items-baseline justify-between gap-3 mb-2"><span className="t-sm font-medium text-[var(--text-2)]">Where the cash went</span><span className="num t-lg font-semibold">{fmtUGX(totalOut)}</span></div>
              {outSplit.length ? <StackedBar segments={outSplit} height={12} format={compact} /> : <div className="t-sm text-[var(--text-3)]">Nothing paid out in this range.</div>}
            </div>
            <DataGrid bare dense rows={catRows} rowKey={(r) => r.category} columns={[
              { key: 'c', header: 'Category', sort: (r) => categoryLabel(r.category), cell: (r) => <span className="inline-flex items-center gap-1.5 font-medium"><span className="size-2.5 rounded-[3px]" style={{ background: r.category in CATEGORY_META ? categoryColor(r.category) : 'var(--text-4)' }} />{categoryLabel(r.category)}</span> },
              { key: 'in', header: 'In', align: 'right', mono: true, sort: (r) => r.inAmt, cell: (r) => (r.inAmt ? fmtNum(r.inAmt) : <span className="text-[var(--text-4)]">·</span>) },
              { key: 'out', header: 'Out', align: 'right', mono: true, sort: (r) => r.outAmt, cell: (r) => (r.outAmt ? fmtNum(r.outAmt) : <span className="text-[var(--text-4)]">·</span>) },
              { key: 'sh', header: 'Share of out', width: 150, sort: (r) => r.outAmt, cell: (r) => (r.outAmt ? <span className="flex items-center gap-2"><Bar value={r.outAmt} max={totalOut} tone="neutral" className="flex-1" /><span className="num t-sm w-[38px] text-right">{fmtPct((r.outAmt / Math.max(1, totalOut)) * 100)}</span></span> : null) },
              { key: 'n', header: 'Entries', align: 'right', mono: true, sort: (r) => r.count, cell: (r) => fmtNum(r.count) },
            ]} footer={<tr><td>Total</td><td className="text-right num">{fmtNum(totalIn)}</td><td className="text-right num">{fmtNum(totalOut)}</td><td /><td className="text-right num">{fmtNum(cash.length)}</td></tr>} />
          </>}
        </Panel>
        <Panel icon={Users} title="Headcount" sub={`on shift per day · ${trendLabel}`} actions={<CsvButton onClick={exportHeadcount} />}>
          {trend.every((d) => !d.headcount) ? <Empty title="No attendance marked" hint="Headcount comes from the attendance screen." /> : <>
            <LineChart height={190} labels={xLabels} partialLast={trendPartial} series={[{ name: 'Headcount', color: 'var(--series-1)', data: trend.map((d) => d.headcount) }]} />
            <div className="t-xs text-[var(--text-3)] mt-1">Average {fmtNum(Math.round(hcAvg))} a day over {days.length === 1 ? 'today' : `${days.length} days`} · {fmtNum(overtime)} overtime hours</div>
            {sectors.length > 0 && (
              <div className="border-t border-[var(--line)] mt-2.5 pt-2">
                <div className="t-label mb-1">By sector · {fmtDay(days[days.length - 1])}</div>
                {sectors.slice(0, 5).map((x) => <div key={x.sector} className="flex items-center gap-2.5 h-6 t-sm"><span className="w-[92px] truncate text-[var(--text-2)]">{x.sector}</span><Bar value={x.count} max={sectors[0].count} tone="series" className="flex-1" /><span className="num w-7 text-right font-medium">{x.count}</span></div>)}
              </div>
            )}
          </>}
        </Panel>
      </div>

      <div className="grid gap-[var(--gap)] xl:grid-cols-[minmax(0,1fr)_360px] items-start">
        <Panel icon={Grid3x3} title="Output by machine and product" sub={label} pad={false}
          actions={<><Tabs value={pivotBy} onChange={setPivotBy} tabs={[{ value: 'units', label: Unit }, { value: 'kg', label: 'Kg' }]} /><CsvButton onClick={exportOutput} /></>}
          footer={<div className="flex flex-wrap justify-between gap-x-6 gap-y-1"><span>{pivot.length} machines · {products.length} products · darker cells are bigger numbers</span><span className="num">{fmtNum(unitsTotal)} {unit} · {fmtKg(Math.round(kgTotal))}</span></div>}>
          {pivot.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={BarChart3} title="No output logged in this range" hint="Entries from the machine wall appear here." /></div>
            : <DataGrid bare dense rows={pivot} columns={pivotCols} rowKey={(r) => r.id}
              footer={<tr><td className="sticky left-0 bg-[var(--surface-2)]">Total</td><td className="text-right num">{fmtNum(Math.round(pivotBy === 'units' ? unitsTotal : kgTotal))}</td><td className="text-right num font-normal text-[var(--text-2)]">{fmtNum(Math.round(pivotBy === 'units' ? kgTotal : unitsTotal))}</td>{products.map((p) => <td key={p.id} className="text-right num">{fmtNum(colTotal(p.id))}</td>)}</tr>} />}
        </Panel>

        <div className="grid gap-[var(--gap)] md:grid-cols-2 xl:grid-cols-1 min-w-0">
          <Panel icon={AlertTriangle} title="Exceptions by kind" sub={ex.length ? `${ex.length} raised` : undefined} actions={<CsvButton onClick={exportExceptions} />}
            footer={exRows.length ? <>{exOpen} still open across {exRows.length} kind{exRows.length === 1 ? '' : 's'}. Decisions are taken on the dashboard and at Group HQ.</> : undefined}>
            {exRows.length === 0 ? <Empty title="No exceptions raised in this range" hint="A quiet period. The arithmetic found nothing to flag." />
              : exRows.map((r) => <Meter key={r.kind} tone={r.critical ? 'bad' : 'series'} label={KIND_LABEL[r.kind]} sub={`${r.open} open${r.critical ? ` · ${r.critical} critical` : ''}`} value={r.total} max={exMax} />)}
          </Panel>
          <Panel icon={Truck} title="Dispatches" sub="with gate result" pad={false} actions={<CsvButton onClick={exportDispatches} />}>
            <div className="grid grid-cols-3 divide-x divide-[var(--line)] border-b border-[var(--line)]">
              <div className="px-3 py-2"><div className="t-xs text-[var(--text-3)]">Dispatches</div><div className="num t-lg font-semibold">{fmtNum(dsp.length)}</div></div>
              <div className="px-3 py-2"><div className="t-xs text-[var(--text-3)]">Kg at the gate</div><div className="num t-lg font-semibold">{fmtNum(Math.round(dspKg))}</div></div>
              <div className="px-3 py-2"><div className="t-xs text-[var(--text-3)]">Gate holds</div><div className={cn('num t-lg font-semibold', holds.length > 0 && 'text-[var(--bad)]')}>{fmtNum(holds.length)}<span className="t-xs font-normal text-[var(--text-3)]"> {holds.length ? `· ${holds.filter((h) => h.d.gateStatus === 'overridden').length} overridden` : '· all passed'}</span></div></div>
            </div>
            {dsp.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={Truck} title="No dispatches in this range" /></div> : (
              <div className="max-h-[232px] overflow-auto scrollbar-thin">
                {dsp.map((r) => (
                  <div key={r.d.id} className="flex items-center gap-2.5 px-[var(--pad)] row-h border-b border-[var(--line)] last:border-b-0">
                    <span className="code font-medium">{r.d.deliveryNoteNo}</span>
                    <span className="min-w-0 flex-1 truncate t-sm text-[var(--text-2)]">{r.client}<span className="text-[var(--text-3)]"> · {fmtDayShort(r.d.createdAt.slice(0, 10))}</span></span>
                    <span className="num t-sm whitespace-nowrap">{fmtNum(Math.round(r.d.gateKg ?? r.d.expectedKg))} kg{r.d.gateKg !== undefined && <span className="text-[var(--text-3)]"> {fmtPct(r.d.variancePct ?? 0, true)}</span>}</span>
                    <Badge tone={r.d.gateStatus === 'pass' ? 'ok' : r.d.gateStatus === 'hold' ? 'bad' : r.d.gateStatus === 'overridden' ? 'warn' : 'neutral'} dot>{r.d.gateStatus}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
      <div className="t-xs text-[var(--text-3)]">Reports read live from the site's records; nothing here is typed in separately. Print produces the same layout on paper.</div>
    </div>
  );
}
