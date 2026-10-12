import { useState } from 'react';
import { Activity, AlertTriangle, BarChart3, Boxes, Factory, Flame, History, PackageCheck, Recycle, Scale, Truck, Users, Wallet, Wrench } from 'lucide-react';
import { useStore } from '@/data/store';
import { useSite, useGo } from '@/app/hooks';
import { Avatar, Badge, Bar, Button, DataGrid, Empty, KpiStrip, Meter, Note, Panel, Stat, Status, Tabs, cn, type Column, type Tone } from '@/components/ui';
import { ColumnChart, CountUp, Delta, Donut, Legend, LineChart, TimeTrack, pctChange } from '@/components/charts';
import { cashDayFor, cashSummary, currentShiftKind, dailySeries, DEMO_HOUR, headcount, headcountBySector, intakeToday, lastWorkingDays, lowStockParts, machineWall, machinesDown, massBalanceDay, openExceptions, outputToday, receivables, rosterFor, stockByProduct, yieldByLine, type MachineTile } from '@/data/selectors';
import { compact, fmtDateTime, fmtDayShort, fmtKg, fmtNum, fmtTime, fmtUGX } from '@/data/format';
import { CATEGORY_META, EXPENSE_CATEGORIES, categoryColor } from '@/config/categories';
import { roleLabel } from '@/config/roles';
import { SITE_COLOR, SITE_ICON } from '@/config/siteIdentity';

const STATE: Record<MachineTile['state'], { label: string; tone: Tone }> = {
  ok: { label: 'On target', tone: 'ok' },
  logged: { label: 'Logged', tone: 'ok' },
  below: { label: 'Below target', tone: 'bad' },
  not_logged: { label: 'Not logged', tone: 'warn' },
  down: { label: 'Down', tone: 'bad' },
  arriving: { label: 'Arriving', tone: 'neutral' },
};

/** One cell of the machine map: the control-room view of a line. */
function MachineCell({ t, onOpen, kg }: { t: MachineTile; onOpen: () => void; kg: boolean }) {
  const tint = t.state === 'below' || t.state === 'down' ? 'var(--bad)' : t.state === 'not_logged' ? 'var(--warn)' : t.state === 'arriving' ? 'var(--text-4)' : 'var(--ok)';
  const idle = t.state === 'arriving' || t.state === 'not_logged';
  return (
    <button onClick={onOpen} title={`${t.machine.code} · ${STATE[t.state].label}${t.operator ? ` · ${t.operator.fullName}` : ''}`}
      className={cn('relative text-left rounded-lg border px-2.5 py-2 min-h-[74px] flex flex-col justify-between transition-shadow hover:shadow-[var(--shadow-raise)] overflow-hidden', t.state === 'arriving' ? 'border-dashed border-[var(--line-2)] bg-transparent' : 'border-[var(--line)] bg-[var(--surface)]')}
      style={t.state === 'arriving' ? undefined : { background: `linear-gradient(180deg, color-mix(in srgb, ${tint} ${t.state === 'down' ? 16 : 7}%, var(--surface)), var(--surface) 70%)` }}>
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: t.state === 'arriving' ? 'transparent' : tint }} />
      <div className="flex items-center justify-between gap-1">
        <span className="t-xs font-semibold text-[var(--text-2)] leading-none whitespace-nowrap">{t.machine.code}</span>
        {t.state === 'not_logged' ? <span className="size-2 rounded-full bg-[var(--warn)] anim-live" /> : t.state === 'down' ? <Wrench className="size-3.5 text-[var(--bad)]" /> : t.operator ? <Avatar name={t.operator.fullName} seed={t.operator.avatarSeed} size={16} /> : null}
      </div>
      {idle ? <div className="t-xs text-[var(--text-3)]">{STATE[t.state].label}</div> : t.state === 'down' ? <div className="t-xs text-[var(--bad)] font-medium">Down</div> : (
        <div>
          <div className="flex items-baseline justify-between gap-1"><span className="num t-lg font-semibold leading-none">{t.entry ? fmtNum(kg ? Math.round(t.entry.outputKg) : t.entry.goodUnits) : '—'}</span>{t.pct !== undefined && <span className={cn('num t-xs font-semibold', t.state === 'below' ? 'text-[var(--bad)]' : 'text-[var(--text-3)]')}>{t.pct}%</span>}</div>
          <div className="flex items-center gap-1 mt-1"><span className="size-1.5 rounded-[2px] shrink-0" style={{ background: t.product?.colour ?? 'var(--text-4)' }} /><span className="t-xs text-[var(--text-3)] truncate">{t.product?.internalName ?? '—'}</span></div>
          {t.pct !== undefined && <Bar value={Math.min(100, t.pct)} max={100} tone={t.state === 'below' ? 'bad' : 'ok'} height={3} className="mt-1.5" />}
        </div>
      )}
    </button>
  );
}

/** The site at a glance, built like a control room: identity and shift clock, six live KPIs, the machine map, then trends. */
export function SiteDashboard() {
  const s = useStore(); const site = useSite(); const go = useGo(); const kind = currentShiftKind();
  const [view, setView] = useState<'map' | 'table'>(site.id === 'recycling' ? 'table' : 'map');
  const days = lastWorkingDays(site.id, s.today, 7); const series = dailySeries(s, site.id, days);
  const today = series[series.length - 1]; const yesterday = series[series.length - 2]; const past = series.slice(0, -1);
  const hc = headcount(s, site.id, s.today); const hcYesterdaySameShift = yesterday ? headcount(s, site.id, yesterday.day, kind).total : 0; const sectors = headcountBySector(s, site.id, s.today);
  const wall = machineWall(s, site.id, s.today, kind); const running = wall.filter((t) => t.state !== 'arriving');
  const cd = cashDayFor(s, site.id, s.today); const cash = cd ? cashSummary(s, cd.id) : undefined;
  const ex = openExceptions(s, site.id); const low = lowStockParts(s, site.id); const down = machinesDown(s, site.id);
  const out = outputToday(s, site.id, s.today); const stock = stockByProduct(s, site.id); const mb = massBalanceDay(s, site.id, s.today); const recv = receivables(s, site.id);
  const dispatches = s.dispatches.filter((d) => d.siteId === site.id && d.createdAt.startsWith(s.today));
  const toLoad = s.orders.filter((o) => o.siteId === site.id && (o.status === 'approved' || o.status === 'picking')).length;
  const unit = site.id === 'mats' ? 'mats' : site.id === 'bags' ? 'packs' : 'sacks'; const Unit = unit[0].toUpperCase() + unit.slice(1);
  const progress = Math.max(0.1, Math.min(1, (DEMO_HOUR - 7) / 12));
  const expected = Math.round(today.target * progress);
  const notLogged = wall.filter((t) => t.state === 'not_logged').length; const below = wall.filter((t) => t.state === 'below').length;
  const critical = ex.filter((e) => e.severity === 'critical').length;
  const shift = site.shifts.find((x) => x.kind === kind); const SiteIcon = SITE_ICON[site.id]; const color = SITE_COLOR[site.id];
  const roster = rosterFor(s, site.id); const byType = (['permanent', 'contract', 'casual'] as const).map((t) => roster.filter((r) => r.engagement?.type === t).length);
  const activity = s.audit.filter((a) => a.siteId === site.id).slice(0, 6);
  const avgWaste = past.length ? past.reduce((t, d) => t + d.wastePct, 0) / past.length : 0;
  const downtime = wall.reduce((t, x) => t + (x.entry?.downtimeMin ?? 0), 0);

  const catTotals = EXPENSE_CATEGORIES.map((c) => ({ label: CATEGORY_META[c].label, value: cash ? cash.entries.filter((e) => e.direction === 'out' && (e.category === c || (c === 'wages' && e.category === 'payout'))).reduce((t, e) => t + e.amount, 0) : 0, color: categoryColor(c) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  const donutCats = catTotals.length > 6 ? [...catTotals.slice(0, 5), { label: 'Everything else', value: catTotals.slice(5).reduce((t, x) => t + x.value, 0), color: 'var(--text-4)' }] : catTotals;

  const machineCols: Column<MachineTile>[] = [
    { key: 'm', header: 'Machine', sort: (t) => t.machine.code.replace(/\d+/, (n) => n.padStart(3, '0')), cell: (t) => <span className="font-medium">{t.machine.code}</span> },
    { key: 'op', header: 'Operator', truncate: 170, cell: (t) => (t.operator ? <span className="inline-flex items-center gap-1.5"><Avatar name={t.operator.fullName} seed={t.operator.avatarSeed} size={20} />{t.operator.fullName}</span> : <span className="text-[var(--text-4)]">—</span>) },
    { key: 'p', header: 'Product', truncate: 160, cell: (t) => (t.product ? <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ background: t.product.colour ?? 'var(--text-4)' }} />{t.product.internalName}</span> : <span className="text-[var(--text-4)]">—</span>) },
    { key: 'out', header: site.id === 'recycling' ? 'Output kg' : 'Output', align: 'right', mono: true, sort: (t) => t.entry?.goodUnits ?? -1, cell: (t) => (t.entry ? <span className="font-medium">{fmtNum(site.id === 'recycling' ? Math.round(t.entry.outputKg) : t.entry.goodUnits)}</span> : '—') },
    { key: 'exp', header: site.id === 'recycling' ? 'Yield' : 'vs due by now', sort: (t) => t.pct ?? -1, cell: (t) => {
      if (site.id === 'recycling') return t.entry ? <span className="num">{t.entry.inputKg ? Math.round((t.entry.outputKg / t.entry.inputKg) * 1000) / 10 : 0}% of {fmtKg(t.entry.inputKg)}</span> : <span className="text-[var(--text-4)]">—</span>;
      if (t.pct === undefined || !t.expectedSoFar) return <span className="text-[var(--text-4)]">{t.entry ? 'no benchmark' : '—'}</span>;
      return <span className="flex items-center gap-2"><Bar value={t.pct} max={Math.max(100, t.pct)} tone={t.state === 'below' ? 'bad' : 'ok'} className="w-[72px]" /><span className="num w-[40px] text-right font-medium">{t.pct}%</span><span className="num t-sm text-[var(--text-3)]">of {t.expectedSoFar}</span></span>;
    } },
    { key: 'down', header: 'Downtime', sort: (t) => t.entry?.downtimeMin ?? 0, cell: (t) => (t.entry?.downtimeMin ? <span><span className={`num ${t.entry.downtimeMin > 60 ? 'text-[var(--warn)] font-medium' : ''}`}>{t.entry.downtimeMin} min</span>{t.entry.downtimeReason ? <span className="text-[var(--text-3)]"> · {t.entry.downtimeReason}</span> : t.state === 'below' ? <span className="text-[var(--bad)]"> · no reason</span> : null}</span> : <span className="text-[var(--text-4)]">—</span>) },
    { key: 'st', header: 'Status', sort: (t) => t.state, cell: (t) => <Badge tone={STATE[t.state].tone} dot>{STATE[t.state].label}</Badge> },
  ];

  const balance = [
    { label: 'Output', value: Math.round(mb.kgOut), color: 'var(--series-1)' },
    { label: 'Work in progress', value: Math.round(mb.wipDeltaKg), color: 'var(--series-3)' },
    { label: 'Weighed waste', value: Math.round(mb.wasteKg), color: 'var(--series-4)' },
    { label: 'Allowed loss', value: Math.round(Math.min(mb.allowedLossKg, Math.max(0, mb.kgIn - mb.kgOut - mb.wipDeltaKg - mb.wasteKg))), color: 'var(--text-4)' },
    { label: 'Unaccounted', value: Math.max(0, Math.round(mb.gapKg)), color: 'var(--bad)' },
  ].filter((x) => x.value > 0);

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      {/* Identity + shift clock */}
      <section className="hero relative overflow-hidden px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <span className="size-12 rounded-xl grid place-items-center shrink-0 shadow-[inset_0_1px_0_rgb(255_255_255/.25)]" style={{ background: color }}><SiteIcon className="size-6" /></span>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-white/55">{site.legalName}</div>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] leading-tight">{site.name}</h1>
            <div className="text-[12.5px] text-white/60 truncate">{site.tagline}</div>
          </div>
        </div>
        <div className="flex-1 min-w-[260px] max-w-[520px]">
          <div className="flex items-center justify-between mb-2 text-[12.5px]"><span className="inline-flex items-center gap-1.5 font-medium"><span className="size-1.5 rounded-full bg-[var(--color-amber-400)] anim-live" />{kind === 'day' ? 'Day' : 'Night'} shift in progress</span><span className="text-white/60">{DEMO_HOUR - 7} h in · {19 - DEMO_HOUR} h left</span></div>
          <TimeTrack progress={progress} startLabel={shift?.starts ?? '07:00'} endLabel={shift?.ends ?? '19:00'} nowLabel={`${DEMO_HOUR}:20 now`} onDark />
        </div>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <span className={cn('inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12.5px] font-medium whitespace-nowrap', critical ? 'bg-[rgb(239_122_105/.22)] text-[#ffb3a7]' : ex.length ? 'bg-[rgb(240_160_75/.2)] text-[var(--color-amber-400)]' : 'bg-white/10 text-white/80')}><AlertTriangle className="size-3.5" />{ex.length ? `${ex.length} to decide${critical ? ` · ${critical} critical` : ''}` : 'Nothing to decide'}</span>
          <Button variant="inverse" onClick={() => go.site('today')}>Today & Workflow</Button>
          <Button variant="inverse" icon={BarChart3} onClick={() => go.site('reports')} hotkey="r" hotkeyLabel="Reports">Reports</Button>
          <Button variant="accent" icon={Factory} onClick={() => go.site('production/wall')} hotkey="w" hotkeyLabel={site.machineWallTitle}>{site.machineWallTitle}</Button>
        </div>
      </section>
      {site.toBeConfirmed && <Note tone="warn">{site.toBeConfirmed}</Note>}

      {/* Live KPIs */}
      <KpiStrip>
        <Stat label="Headcount today" icon={Users} accent="var(--series-1)" value={<CountUp value={hc.total} />} delta={<Delta value={pctChange(headcount(s, site.id, s.today, kind).total, hcYesterdaySameShift)} label={`vs yesterday's ${kind} shift`} />} spark={past.map((d) => d.headcount)} sub={sectors.slice(0, 2).map((x) => `${x.sector} ${x.count}`).join(' · ') || 'Nobody marked yet'} onClick={() => go.site('people/attendance')} />
        <Stat label={`${Unit} so far`} icon={PackageCheck} accent="var(--series-3)" value={<CountUp value={today.units} />} delta={expected ? <Delta value={(today.units / expected) * 100 - 100} label="against what is due by now" /> : undefined} spark={past.map((d) => d.units)} sub={expected ? `${fmtNum(expected)} due by now · ${fmtNum(today.target)} for the shift` : 'No benchmark set'} onClick={() => go.site('production/wall')} />
        <Stat label="Machines running" icon={Activity} accent="var(--series-7)" tone={down.length || notLogged ? 'warn' : 'neutral'} value={<>{running.length - notLogged - down.length}<span className="text-[var(--text-3)] font-medium">/{running.length}</span></>} sub={`${notLogged} not logged · ${down.length} down · ${downtime} min downtime`} spark={past.map((d) => -d.downtimeMin)} sparkColor="var(--series-7)" onClick={() => go.site('production/wall')} />
        <Stat label="Waste, measured" icon={site.id === 'recycling' ? Recycle : Flame} accent="var(--series-4)" value={<><CountUp value={today.wastePct} format={(n) => n.toFixed(1)} /><span className="text-[var(--text-3)] font-medium">%</span></>} delta={<Delta value={today.wastePct - avgWaste} suffix=" pt" goodWhen="down" label="vs 6-day average" />} spark={past.map((d) => d.wastePct)} sub={`${fmtKg(Math.round(mb.wasteKg))} weighed of ${fmtKg(Math.round(mb.kgIn))} in`} onClick={() => go.site(site.id === 'mats' ? 'production/waste' : 'reports')} />
        <Stat label="Cash expected" icon={Wallet} accent="var(--series-2)" value={cash ? <CountUp value={cash.expectedClosing} format={compact} /> : '—'} spark={past.map((d) => d.closing)} sub={cash ? `UGX · in ${compact(cash.sales + cash.receipts)} · out ${compact(cash.expenses + cash.wages)}` : 'No cash day open'} onClick={() => go.site('cash')} />
        {site.id === 'recycling'
          ? <Stat label="Intake today" icon={Scale} accent="var(--series-5)" value={<><CountUp value={Math.round(intakeToday(s, s.today).reduce((t, d) => t + d.netKg, 0))} /><span className="text-[var(--text-3)] font-medium t-base"> kg</span></>} sub={`${intakeToday(s, s.today).length} collector deliveries`} onClick={() => go.site('production/intake')} />
          : <Stat label="Stock on hand" icon={Boxes} accent="var(--series-5)" value={<CountUp value={stock.reduce((t, r) => t + r.bundles, 0)} />} sub={`${site.id === 'bags' ? 'packs and rolls' : 'bundles'} · ${fmtKg(Math.round(stock.reduce((t, r) => t + r.kg, 0)))} · ${toLoad} to load`} onClick={() => go.site('stock')} />}
      </KpiStrip>

      {/* Machines + decisions */}
      <div className="grid gap-[var(--gap)] xl:grid-cols-[minmax(0,1fr)_360px] items-start">
        <Panel icon={Factory} title={site.machineWallTitle} sub={`${running.length} machines · ${kind} shift`} pad={false}
          actions={<><Tabs value={view} onChange={setView} tabs={[{ value: 'map', label: 'Map' }, { value: 'table', label: 'Table' }]} /><Button size="sm" variant="ghost" onClick={() => go.site('production/sheet')}>Shift sheet</Button></>}
          footer={<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1"><Legend items={[{ label: 'On target', color: 'var(--ok)' }, { label: 'Below target or down', color: 'var(--bad)' }, { label: 'Not logged', color: 'var(--warn)' }, { label: 'Arriving', color: 'var(--text-4)' }]} /><span className="num">{fmtNum(today.units)} {unit} · {below} below target · {downtime} min downtime</span></div>}>
          {view === 'map'
            ? <div className="p-[var(--pad)] grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(104px,1fr))]">{wall.map((t) => <MachineCell key={t.machine.id} t={t} kg={site.id === 'recycling'} onOpen={() => go.site('production/wall')} />)}</div>
            : <DataGrid bare rows={running} columns={machineCols} rowKey={(t) => t.machine.id} onRowClick={() => go.site('production/wall')} maxHeight={420} dense rowClassName={(t) => (t.state === 'not_logged' ? 'text-[var(--text-3)]' : undefined)} />}
        </Panel>

        <div className="flex flex-col gap-[var(--gap)]">
          <Panel icon={AlertTriangle} title="Needs a decision" sub={ex.length ? `${ex.length} open` : undefined} pad={false}>
            {ex.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={PackageCheck} title="Nothing open" hint="Gate holds, cash variances and missing entries land here." /></div> : ex.slice(0, 5).map((e) => (
              <div key={e.id} className="flex items-start gap-2.5 px-[var(--pad)] py-2.5 border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--hover)]">
                <span className="mt-0.5 size-6 rounded-md grid place-items-center shrink-0" style={{ background: e.severity === 'critical' ? 'var(--bad-bg)' : e.severity === 'warning' ? 'var(--warn-bg)' : 'var(--surface-3)', color: e.severity === 'critical' ? 'var(--bad)' : e.severity === 'warning' ? 'var(--warn)' : 'var(--text-3)' }}><AlertTriangle className="size-3.5" /></span>
                <div className="min-w-0 flex-1"><div className="t-base font-medium leading-snug">{e.title}</div><div className="t-sm text-[var(--text-3)]">{roleLabel(e.ownerRole)} · raised {fmtTime(e.raisedAt)}</div></div>
              </div>
            ))}
          </Panel>
          <Panel icon={Scale} title="Mass balance" sub="today" actions={<Badge tone={mb.state === 'balanced' ? 'ok' : mb.state === 'explainable' ? 'warn' : 'bad'} dot>{mb.state === 'balanced' ? 'Balanced' : mb.state === 'explainable' ? 'Within allowed loss' : `${fmtKg(Math.round(mb.gapKg))} unaccounted`}</Badge>}>
            {mb.kgIn > 0 ? (
              <div className="flex items-center gap-4">
                <Donut segments={balance} size={112} thickness={14} center={fmtNum(Math.round(mb.kgIn))} sub="kg in" />
                <div className="flex-1 min-w-0">{balance.map((b) => <div key={b.label} className="flex items-center gap-2 h-6 t-sm"><span className="size-2 rounded-[2px] shrink-0" style={{ background: b.color }} /><span className="text-[var(--text-2)] truncate flex-1">{b.label}</span><span className="num font-medium">{fmtNum(b.value)} kg</span></div>)}</div>
              </div>
            ) : <Empty title="No material issued yet today" />}
          </Panel>
        </div>
      </div>

      {/* Trends */}
      <div className="grid gap-[var(--gap)] lg:grid-cols-2 xl:grid-cols-3">
        <Panel icon={BarChart3} title={`${Unit} per day`} sub="vs benchmark">
          <ColumnChart height={190} data={series.map((d) => ({ label: fmtDayShort(d.day), values: [d.units], partial: d.partial, target: d.target || undefined }))} />
          <div className="t-xs text-[var(--text-3)] mt-1">The dark tick on each bar is that day's benchmark. Today is drawn lighter because the shift is still running.</div>
        </Panel>
        <Panel icon={Wallet} title="Cash in and out" sub="UGX · 7 days" actions={<Button size="sm" variant="ghost" onClick={() => go.site('cash')}>Cash page</Button>}>
          <LineChart height={190} labels={series.map((d) => fmtDayShort(d.day))} partialLast series={[{ name: 'Cash in', color: 'var(--series-3)', data: series.map((d) => d.cashIn), area: true }, { name: 'Cash out', color: 'var(--series-2)', data: series.map((d) => d.cashOut) }]} />
        </Panel>
        <Panel icon={Wallet} title="Where the money went" sub={cash ? `today · ${fmtUGX(cash.expenses + cash.wages)}` : 'today'}>
          {donutCats.length ? (
            <div className="flex items-center gap-5">
              <Donut segments={donutCats} size={136} thickness={18} center={compact(donutCats.reduce((t, x) => t + x.value, 0))} sub="UGX out" />
              <div className="flex-1 min-w-0">{donutCats.map((c) => <div key={c.label} className="flex items-center gap-2 h-7 t-base border-b border-[var(--line)] last:border-b-0"><span className="size-2.5 rounded-[3px] shrink-0" style={{ background: c.color }} /><span className="truncate flex-1">{c.label}</span><span className="num font-medium">{compact(c.value)}</span></div>)}<div className="t-xs text-[var(--text-3)] mt-1.5">0 uncategorised lines</div></div>
            </div>
          ) : <Empty icon={Wallet} title="No expenses recorded yet today" />}
        </Panel>
      </div>

      <div className="grid gap-[var(--gap)] lg:grid-cols-2 xl:grid-cols-3">
        <Panel icon={PackageCheck} title="Output by product" sub="today vs full-shift target">
          {out.length === 0 ? <Empty title="No output logged yet" /> : out.slice(0, 6).map((o) => <Meter key={o.product?.id ?? 'all'} tone="series" label={<span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ background: o.product?.colour ?? 'var(--text-4)' }} />{o.product?.internalName ?? 'All products'}</span>} value={o.units} max={Math.max(o.target, o.units) || 1} display={<>{fmtNum(o.units)}{o.target ? <span className="text-[var(--text-3)] font-normal"> / {fmtNum(o.target)}</span> : null}</>} />)}
        </Panel>
        <Panel icon={Users} title="People" sub={`${roster.length} on the roster`} actions={<Button size="sm" variant="ghost" onClick={() => go.site('people/registry')}>Workers</Button>}>
          <div className="flex items-center gap-5">
            <Donut size={112} thickness={14} center={hc.total} sub="on shift" segments={[{ label: 'Permanent', value: byType[0], color: 'var(--series-1)' }, { label: 'Fixed-term contract', value: byType[1], color: 'var(--series-3)' }, { label: 'Casual', value: byType[2], color: 'var(--series-4)' }]} />
            <div className="flex-1 min-w-0">
              {[['Permanent', byType[0], 'var(--series-1)'], ['Fixed-term contract', byType[1], 'var(--series-3)'], ['Casual', byType[2], 'var(--series-4)']].map(([l, v, c]) => <div key={l as string} className="flex items-center gap-2 h-6 t-sm"><span className="size-2 rounded-[2px]" style={{ background: c as string }} /><span className="text-[var(--text-2)] flex-1">{l}</span><span className="num font-medium">{v}</span></div>)}
              <div className="border-t border-[var(--line)] mt-1.5 pt-1.5">{sectors.slice(0, 3).map((x) => <div key={x.sector} className="flex justify-between h-5 t-sm"><span className="text-[var(--text-3)]">{x.sector}</span><span className="num">{x.count}</span></div>)}</div>
            </div>
          </div>
        </Panel>
        <Panel icon={History} title="On the record" sub="latest changes" pad={false} actions={<Badge tone="neutral">append-only</Badge>}>
          {activity.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={History} title="No changes recorded yet" /></div> : activity.map((a) => (
            <div key={a.id} className="flex items-start gap-2.5 px-[var(--pad)] py-2 border-b border-[var(--line)] last:border-b-0">
              <Avatar name={a.actorName} size={22} className="mt-0.5" />
              <div className="min-w-0 flex-1"><div className="t-sm leading-snug">{a.summary}</div><div className="t-xs text-[var(--text-3)]">{a.actorName} · {fmtDateTime(a.at)}{a.flag && a.flag !== 'normal' ? ` · ${a.flag}` : ''}</div></div>
            </div>
          ))}
        </Panel>
      </div>

      <div className="grid gap-[var(--gap)] lg:grid-cols-2 xl:grid-cols-3">
        <Panel icon={Wrench} title="Maintenance" sub={`${down.length} down · ${low.length} parts low`} pad={false} actions={<Button size="sm" variant="ghost" onClick={() => go.site('stock/spares')}>Spares</Button>}>
          {down.length + low.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={Wrench} title="All machines running, all parts above minimum" /></div> : <>
            {down.map((m) => <div key={m.id} className="flex items-center justify-between gap-3 px-[var(--pad)] h-[var(--row-h)] border-b border-[var(--line)] last:border-b-0"><span className="t-base font-medium">{m.code}</span><span className="t-sm text-[var(--text-3)] truncate flex-1">{s.breakdowns.find((b) => b.machineId === m.id && !b.resolvedAt)?.cause}</span><Badge tone="bad" dot>Down</Badge></div>)}
            {low.map((p) => <div key={p.id} className="flex items-center justify-between gap-3 px-[var(--pad)] h-[var(--row-h)] border-b border-[var(--line)] last:border-b-0"><span className="t-base truncate flex-1">{p.name}</span><span className="num t-sm text-[var(--text-2)]">{p.onHand} of {p.minLevel} min</span><Badge tone="warn" dot>Reorder</Badge></div>)}
          </>}
        </Panel>
        <Panel icon={Truck} title="Dispatches today" sub={toLoad ? `${toLoad} ready to load` : undefined} pad={false} actions={<Button size="sm" variant="ghost" onClick={() => go.site('stock/dispatch')}>Dispatch</Button>}>
          {dispatches.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={Truck} title="No lorry has left yet" hint={toLoad ? `${toLoad} order${toLoad === 1 ? '' : 's'} approved and waiting at the store.` : 'Nothing is waiting to load.'} /></div> : dispatches.map((d) => <div key={d.id} className="flex items-center gap-3 px-[var(--pad)] h-[var(--row-h)] border-b border-[var(--line)] last:border-b-0"><span className="code font-medium">{d.deliveryNoteNo}</span><span className="t-sm text-[var(--text-3)] truncate flex-1">{s.clients.find((c) => c.id === s.orders.find((o) => o.id === d.orderId)?.clientId)?.name}</span><Badge tone={d.gateStatus === 'pass' ? 'ok' : d.gateStatus === 'hold' ? 'bad' : 'neutral'} dot>{d.gateStatus}</Badge></div>)}
        </Panel>
        {site.id === 'recycling' ? (
          <Panel icon={Recycle} title="Yield per line" sub="today">{yieldByLine(s, s.today).map((l) => <Meter key={l.machine.id} label={l.machine.code} sub={`${l.yieldPct}% yield`} value={l.outKg} max={l.capacityKg} display={<>{fmtKg(Math.round(l.outKg))}<span className="text-[var(--text-3)] font-normal"> / {fmtKg(l.capacityKg)}</span></>} />)}</Panel>
        ) : (
          <Panel icon={Wallet} title="Export receivables" sub="USD" pad={false}>
            {recv.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={Wallet} title="No export balance outstanding" hint="This site sells for cash before delivery." /></div> : recv.slice(0, 5).map((r) => <div key={r.client.id} className="flex items-center gap-3 px-[var(--pad)] h-[var(--row-h)] border-b border-[var(--line)] last:border-b-0"><Avatar name={r.client.name} size={22} /><span className="t-base truncate flex-1">{r.client.name}</span><Badge tone={r.ageDays > r.client.creditDays ? 'bad' : 'neutral'}>{r.ageDays} d</Badge><span className="num t-base font-medium w-[78px] text-right">${fmtNum(Math.round(r.balance))}</span></div>)}
          </Panel>
        )}
      </div>
    </div>
  );
}
