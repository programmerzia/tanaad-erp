import { COMPANY } from '@/config/company';
import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BarChart3, BookCheck, Calculator, Download, Layers, Percent, PieChart, Printer, Receipt, Scale, TrendingUp, Wallet } from 'lucide-react';
import type { ExpenseCategory, SiteCode } from '@tanaad/domain';
import { useStore, type AppState } from '@/data/store';
import { useRefList } from '@/app/hooks';
import { Badge, Button, DataGrid, Empty, KpiStrip, Note, Panel, StackedBar, Stat, Tabs, cn, useHotkey, type Column, type Tone } from '@/components/ui';
import { ColumnChart, CountUp, Delta, Donut, Legend, pctChange } from '@/components/charts';
import { SITE_LIST } from '@/config/sites';
import { SITE_COLOR } from '@/config/siteIdentity';
import { CATEGORY_META, EXPENSE_CATEGORIES, categoryColor } from '@/config/categories';
import { addDays, lastWorkingDays, unitCost } from '@/data/selectors';
import { compact, fmtDayShort, fmtNum, fmtUGX } from '@/data/format';
import { DivergingBar, Hero, IconChip, OnHero, ShareBar, SiteMark, SiteTag, downloadCsv, signed, siteLabel, usd0, type SiteOrGroup } from './kit';
import { unitName } from './shared';

type Period = '1' | '3' | '7';
const PERIODS: { value: Period; label: string; long: string }[] = [
  { value: '1', label: 'Today', long: 'today so far' },
  { value: '3', label: '3 days', long: 'last 3 working days' },
  { value: '7', label: '7 days', long: 'last 7 working days' },
];
interface Books { sales: number; out: Record<ExpenseCategory, number>; totalOut: number; net: number }

/** Sales and categorised spend for one site over a set of days, straight from the cash pages. */
function booksFor(s: AppState, site: SiteCode, days: string[]): Books {
  const entries = s.cashEntries.filter((e) => e.siteId === site && days.includes(e.day));
  const sales = entries.filter((e) => e.category === 'sale').reduce((t, e) => t + e.amount, 0);
  const out = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, entries.filter((e) => e.direction === 'out' && (e.category === c || (c === 'wages' && e.category === 'payout'))).reduce((t, e) => t + e.amount, 0)])) as Record<ExpenseCategory, number>;
  const totalOut = EXPENSE_CATEGORIES.reduce((t, c) => t + out[c], 0);
  return { sales, out, totalOut, net: sales - totalOut };
}
const addBooks = (list: Books[]): Books => ({ sales: list.reduce((t, b) => t + b.sales, 0), out: Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, list.reduce((t, b) => t + b.out[c], 0)])) as Record<ExpenseCategory, number>, totalOut: list.reduce((t, b) => t + b.totalOut, 0), net: list.reduce((t, b) => t + b.net, 0) });
const marginOf = (b: { sales: number; net: number }) => (b.sales ? (b.net / b.sales) * 100 : 0);
const marginTone = (pct: number): Tone => (pct < 0 ? 'bad' : pct < 15 ? 'warn' : 'ok');
const marginWord = (pct: number) => (pct < 0 ? 'Loss' : pct < 15 ? 'Thin' : 'Healthy');

/** Group finance view: per-site P&L from the cash pages, consolidated in USD, plus unit cost per product. */
export function Pnl() {
  const s = useStore(); const toast = useStore((x) => x.toast);
  const [period, setPeriod] = useState<Period>('7'); const n = Number(period);
  const [costSite, setCostSite] = useState<SiteOrGroup>('group');
  const meta = PERIODS.find((p) => p.value === period)!;
  // Category names are the client's own (Settings → Master data); the ids are the enforced keys and carry the colour.
  const catRefs = useRefList('expense_category');
  const label = (c: ExpenseCategory) => catRefs.find((r) => r.id === c)?.label ?? CATEGORY_META[c].label;

  const d = useMemo(() => {
    const rows = SITE_LIST.map((site) => {
      const days = lastWorkingDays(site.id, s.today, n);
      const pages = days.map((day) => ({ day, page: s.cashDays.find((cd) => cd.siteId === site.id && cd.day === day) }));
      const openDays = pages.filter((p) => p.page && p.page.status !== 'closed').map((p) => p.day);
      const prevDays = lastWorkingDays(site.id, addDays(days[0], -1), n);
      return { site, days, pages, openDays, provisional: openDays.length > 0, prevDays, ...booksFor(s, site.id, days) };
    });
    const total = addBooks(rows);
    // The trend window is always the last seven working days that have a cash page, whatever period is selected.
    const window = [...new Set(SITE_LIST.flatMap((site) => lastWorkingDays(site.id, s.today, 7)))].sort().filter((day) => s.cashDays.some((cd) => cd.day === day));
    const daily = window.map((day) => { const bySite = SITE_LIST.map((site) => booksFor(s, site.id, [day])); return { day, bySite, group: addBooks(bySite), partial: day === s.today }; });
    // Reference for the deltas: the period before when the books go back that far, otherwise the run-rate inside the window.
    const hasPrev = rows.some((r) => s.cashDays.some((cd) => cd.siteId === r.site.id && r.prevDays.includes(cd.day)));
    const closed = daily.filter((x) => !x.partial); const k = Math.min(3, Math.floor(closed.length / 2));
    const now = hasPrev ? total : addBooks(closed.slice(-k).map((x) => x.group));
    const before = hasPrev ? addBooks(rows.map((r) => booksFor(s, r.site.id, r.prevDays))) : addBooks(closed.slice(-2 * k, -k).map((x) => x.group));
    const reference = hasPrev ? (n === 1 ? 'today so far against the whole working day before' : `these ${n} working days against the ${n} before`) : k ? `the last ${k} closed day${k === 1 ? '' : 's'} against the ${k} before` : '';
    const comparable = hasPrev || k > 0;
    const costs = SITE_LIST.flatMap((site) => {
      const days = lastWorkingDays(site.id, s.today, n);
      const prov = s.cashDays.some((cd) => cd.siteId === site.id && days.includes(cd.day) && cd.status !== 'closed');
      return s.products.filter((p) => p.siteId === site.id && p.active !== false && p.prices.length > 0 && p.kind !== 'roll' && p.kind !== 'material').flatMap((p) => { const c = unitCost(s, site.id, p, days); return c && c.units > 1 ? [{ site, product: p, prov, ...c }] : []; });
    });
    return { rows, total, daily, now, before, reference, comparable, costs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.cashEntries, s.cashDays, s.products, s.production, s.today, s.fx, n]);

  const { rows, total, daily, costs } = d;
  const fx = s.fx; const margin = marginOf(total);
  const pagesAll = rows.flatMap((r) => r.pages.filter((p) => p.page)); const pagesClosed = pagesAll.filter((p) => p.page!.status === 'closed').length;
  const anyProvisional = rows.some((r) => r.provisional);
  const cats = EXPENSE_CATEGORIES.map((c) => ({ cat: c, label: label(c), value: total.out[c], color: categoryColor(c) }));
  const ranked = cats.filter((c) => c.value > 0).sort((a, b) => b.value - a.value); const top = ranked[0];
  const donutCats = ranked.length > 6 ? [...ranked.slice(0, 5), { cat: 'other' as ExpenseCategory, label: 'Everything else', value: ranked.slice(5).reduce((t, c) => t + c.value, 0), color: 'var(--text-4)' }] : ranked;
  const delta = (f: (b: Books) => number) => (d.comparable ? pctChange(f(d.now), f(d.before)) : null);
  const low = rows.filter((r) => r.sales > 0).sort((a, b) => marginOf(a) - marginOf(b))[0];
  const maxSide = Math.max(1, ...rows.map((r) => Math.max(r.sales, r.totalOut)));
  const shownCosts = costs.filter((c) => costSite === 'group' || c.site.id === costSite);
  const maxMargin = Math.min(100, Math.max(20, ...costs.map((c) => Math.abs(c.marginPct))));
  const columnsOf: { id: SiteOrGroup; b: Books; provisional: boolean; openDays: string[] }[] = [...rows.map((r) => ({ id: r.site.id as SiteOrGroup, b: r as Books, provisional: r.provisional, openDays: r.openDays })), { id: 'group', b: total, provisional: anyProvisional, openDays: [...new Set(rows.flatMap((r) => r.openDays))] }];

  const exportCsv = () => {
    const head = ['Line', ...SITE_LIST.map((x) => `${x.shortName} UGX`), 'Group UGX', `Group USD @ ${fx}`];
    const line = (label: string, f: (b: Books) => number) => [label, ...rows.map((r) => Math.round(f(r))), Math.round(f(total)), Math.round(f(total) / fx)];
    downloadCsv(`tanaad-pnl-${s.today}-${n}d.csv`, [
      [`${COMPANY.name} P&L`, meta.long, `to ${s.today}`], head,
      line('Sales', (b) => b.sales), ...EXPENSE_CATEGORIES.map((c) => line(label(c), (b) => b.out[c])), line('Total costs', (b) => b.totalOut), line('Net', (b) => b.net),
      ['Margin %', ...rows.map((r) => marginOf(r).toFixed(1)), margin.toFixed(1), ''],
      ['Basis', ...rows.map((r) => (r.provisional ? `provisional: ${r.openDays.join(' ')} open` : 'closed days only')), anyProvisional ? 'provisional' : 'closed days only', ''],
      [], ['Unit cost per product (UGX per unit)'], ['Site', 'Product', 'Units', 'Material', 'Overhead', 'Unit cost', 'Local price', 'Margin %', 'Basis'],
      ...costs.map((c) => [c.site.shortName, c.product.internalName, c.units, c.material, c.overhead, c.total, Math.round(c.priceUgx), c.marginPct, c.prov ? 'provisional' : 'closed days only']),
    ]);
    toast({ kind: 'ok', title: 'P&L exported', detail: `${meta.long} · ${rows.length} sites and ${costs.length} products` });
  };
  const print = () => { window.print(); toast({ kind: 'info', title: 'Sent to printer', detail: `Group P&L · ${meta.long}` }); };
  useHotkey('1', () => setPeriod('1'), { label: 'Period: today' });
  useHotkey('2', () => setPeriod('3'), { label: 'Period: 3 days' });
  useHotkey('3', () => setPeriod('7'), { label: 'Period: 7 days' });

  const th = 'px-2.5 h-9 touch:h-11 t-xs font-semibold text-[var(--text-3)] uppercase tracking-[0.04em] whitespace-nowrap border-b border-[var(--line)] bg-[var(--surface-2)]';
  const td = 'px-2.5 py-1.5 align-middle text-right border-b border-[var(--line)]';
  const lead = 'sticky left-0 z-[1] bg-[var(--surface)] px-[var(--pad)] py-1.5 text-left border-b border-[var(--line)] whitespace-nowrap';
  const money = (v: number, o: { bold?: boolean } = {}) => (v ? <span className={cn('num', o.bold && 'font-semibold')}>{fmtNum(Math.round(v))}</span> : <span className="text-[var(--text-4)]">—</span>);

  const costCols: Column<(typeof costs)[number]>[] = [
    { key: 'p', header: 'Product', sticky: true, sort: (c) => c.product.internalName, cell: (c) => <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-[3px] shrink-0" style={{ background: c.product.colour ?? 'var(--text-4)' }} /><span className="font-medium">{c.product.internalName}</span></span> },
    { key: 's', header: 'Site', sort: (c) => c.site.shortName, cell: (c) => <SiteTag site={c.site.id} /> },
    { key: 'u', header: 'Units', align: 'right', mono: true, sort: (c) => c.units, cell: (c) => <>{fmtNum(c.units)}<span className="t-xs text-[var(--text-3)]"> {unitName(c.site.id)}</span></> },
    { key: 'm', header: 'Material', align: 'right', mono: true, sort: (c) => c.material, cell: (c) => fmtNum(c.material) },
    { key: 'o', header: 'Overhead', align: 'right', mono: true, sort: (c) => c.overhead, cell: (c) => fmtNum(c.overhead) },
    { key: 't', header: 'Unit cost', align: 'right', mono: true, sort: (c) => c.total, cell: (c) => <span className="font-semibold">{fmtNum(c.total)}</span> },
    { key: 'mix', header: 'Cost vs price', width: 100, cell: (c) => { const base = Math.max(c.priceUgx, c.total) || 1; return (
      <span className="flex h-2 w-[90px] rounded-[2px] overflow-hidden bg-[var(--surface-3)] gap-px" title={`Material ${fmtNum(c.material)} · overhead ${fmtNum(c.overhead)} · price ${fmtNum(Math.round(c.priceUgx))}`}>
        <span style={{ width: `${(c.material / base) * 100}%`, background: 'var(--series-1)' }} /><span style={{ width: `${(c.overhead / base) * 100}%`, background: 'var(--series-4)' }} />
      </span>
    ); } },
    { key: 'pr', header: 'Local price', align: 'right', mono: true, sort: (c) => c.priceUgx, cell: (c) => fmtNum(Math.round(c.priceUgx)) },
    { key: 'mg', header: 'Margin', align: 'right', sort: (c) => c.marginPct, cell: (c) => <span className="inline-flex items-center gap-2 justify-end"><DivergingBar value={c.marginPct} max={maxMargin} tone={marginTone(c.marginPct)} width={56} /><span className="num font-semibold min-w-[40px] text-right">{c.marginPct < -999 ? '<−999' : signed(c.marginPct, fmtNum)}%</span><Badge tone={marginTone(c.marginPct)} className="w-[56px] justify-center max-2xl:hidden">{marginWord(c.marginPct)}</Badge></span> },
    { key: 'b', header: 'Basis', sort: (c) => (c.prov ? 1 : 0), cell: (c) => (c.prov ? <Badge tone="warn" dot>Provisional</Badge> : <Badge tone="ok" dot>Closed</Badge>) },
  ];

  const costTabs = <Tabs value={costSite} onChange={setCostSite} tabs={[{ value: 'group' as SiteOrGroup, label: 'All sites', count: costs.length }, ...SITE_LIST.map((x) => ({ value: x.id as SiteOrGroup, label: x.shortName, count: costs.filter((c) => c.site.id === x.id).length }))]} />;

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <Hero icon={BarChart3} eyebrow="Head Office · finance" title="P&L and unit costs" sub={`${meta.long[0].toUpperCase()}${meta.long.slice(1)} · USD at ${fmtNum(fx)}`}
        actions={<>
          <Button variant="inverse" icon={Printer} hotkey="p" onClick={print}>Print</Button>
          <Button variant="accent" icon={Download} hotkey="e" onClick={exportCsv}>Export CSV</Button>
        </>}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-2.5 text-[12.5px]">
          <span className="inline-flex items-center gap-1.5 font-medium whitespace-nowrap"><span className={cn('size-1.5 rounded-full', anyProvisional ? 'bg-[var(--color-amber-400)] anim-live' : 'bg-white/70')} />{pagesClosed} of {pagesAll.length} cash days signed<span className="font-normal text-white/60">· {anyProvisional ? `${pagesAll.length - pagesClosed} open, provisional` : 'closed days only'}</span></span>
          <OnHero><Tabs value={period} onChange={setPeriod} tabs={PERIODS.map((p) => ({ value: p.value, label: p.label }))} /></OnHero>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {rows.map((r) => (
            <div key={r.site.id} className="flex items-center gap-2 text-[11.5px] text-white/70">
              <span className="size-1.5 rounded-[2px]" style={{ background: SITE_COLOR[r.site.id] }} />{r.site.shortName}
              <span className="flex gap-[3px]">{r.pages.map((p) => <span key={p.day} title={`${fmtDayShort(p.day)} · ${p.page ? (p.page.status === 'closed' ? 'closed and signed' : p.page.status) : 'no cash page'}`} className={cn('h-3 w-2 rounded-[2px]', !p.page ? 'border border-white/20' : p.page.status === 'closed' ? 'bg-white/65' : 'bg-[var(--color-amber-400)]')} />)}</span>
            </div>
          ))}
        </div>
      </Hero>
      <Note tone="neutral">In production, P&L and costing read <b>closed and signed</b> cash days only. The demo includes today's open page so the numbers move as you work; anything touching an open day is marked provisional.</Note>

      <KpiStrip>
        <Stat label="Group sales" icon={TrendingUp} accent="var(--series-3)" value={<><CountUp value={total.sales} format={compact} /><span className="t-base text-[var(--text-3)] font-medium"> UGX</span></>} delta={<Delta value={delta((b) => b.sales)} label={d.reference} />} spark={daily.map((x) => x.group.sales)} sub={`${usd0(total.sales / fx)} at ${fmtNum(fx)}`} />
        <Stat label="Group costs" icon={Receipt} accent="var(--series-2)" value={<><CountUp value={total.totalOut} format={compact} /><span className="t-base text-[var(--text-3)] font-medium"> UGX</span></>} delta={<Delta value={delta((b) => b.totalOut)} goodWhen="down" label={d.reference} />} spark={daily.map((x) => x.group.totalOut)} sub={`${usd0(total.totalOut / fx)} · ${ranked.length} categories`} />
        <Stat label={total.net >= 0 ? 'Net surplus' : 'Net deficit'} icon={Scale} accent="var(--series-1)" tone={total.net >= 0 ? 'ok' : 'bad'} value={<><CountUp value={total.net} format={(v) => signed(v, compact)} /><span className="t-base text-[var(--text-3)] font-medium"> UGX</span></>} delta={<Delta value={delta((b) => b.net)} label={d.reference} />} spark={daily.map((x) => x.group.net)} sub={`${usd0(total.net / fx)} at ${fmtNum(fx)}`} />
        <Stat label="Margin on sales" icon={Percent} accent="var(--series-7)" value={<><CountUp value={margin} format={(v) => v.toFixed(1)} /><span className="text-[var(--text-3)] font-medium">%</span></>} delta={d.comparable ? <Delta value={marginOf(d.now) - marginOf(d.before)} suffix=" pt" label={d.reference} /> : undefined} spark={daily.map((x) => marginOf(x.group))} sparkColor="var(--series-7)" sub={low ? `${low.site.shortName} lowest at ${Math.round(marginOf(low))}%` : 'No sales in the period'} />
        <Stat label="Largest cost line" icon={top ? CATEGORY_META[top.cat].icon : Layers} accent={top?.color} value={top ? top.label : '—'} spark={top ? daily.map((x) => x.group.out[top.cat]) : undefined} sub={top ? `${Math.round((top.value / (total.totalOut || 1)) * 100)}% of costs · ${compact(top.value)}` : 'Nothing spent yet'} />
        <Stat label="Books closed" icon={BookCheck} accent="var(--series-5)" tone={anyProvisional ? 'warn' : 'neutral'} value={<>{pagesClosed}<span className="text-[var(--text-3)] font-medium">/{pagesAll.length}</span></>}
          sub={<><span className="flex items-center gap-[3px] h-[26px] mb-1.5">{pagesAll.map((x, i) => <span key={i} title={`${fmtDayShort(x.day)} · ${x.page!.status}`} className="flex-1 max-w-[10px] h-3.5 rounded-[2px]" style={{ background: x.page!.status === 'closed' ? 'var(--text-4)' : 'var(--warn)' }} />)}</span><span className="block truncate">{anyProvisional ? `${pagesAll.length - pagesClosed} open · provisional` : 'Every page closed'}</span></>} />
      </KpiStrip>
      {d.comparable && <p className="t-xs text-[var(--text-3)] -mt-1.5">Change chips compare {d.reference}. The trend lines run over the last seven working days.</p>}

      <div className="grid gap-[var(--gap)] xl:grid-cols-[minmax(0,1fr)_360px] items-start">
        <Panel icon={Wallet} title="P&L statement" sub={`UGX · ${meta.long}`} pad={false} actions={<span className="hidden sm:inline-flex">{anyProvisional ? <Badge tone="warn" dot>Today's page is open · provisional</Badge> : <Badge tone="ok" dot>Closed days only</Badge>}</span>}
          footer={<span>Bars on sales show each site's share of group sales; bars on a cost line show its share of that site's costs. The {EXPENSE_CATEGORIES.length} categories are enforced at entry, so nothing is uncategorised.</span>}>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full border-collapse t-base">
              <thead>
                <tr>
                  <th className={cn(th, 'sticky left-0 z-[2] text-left pl-[var(--pad)]')}>Line</th>
                  {columnsOf.map((c) => <th key={c.id} className={cn(th, 'text-right min-w-[112px]')}><span className="inline-flex items-center gap-1.5"><SiteMark site={c.id} size="sm" />{c.id === 'group' ? 'Group · UGX' : siteLabel(c.id)}</span></th>)}
                  <th className={cn(th, 'text-right min-w-[92px]')}>Group · USD</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={lead}><span className="inline-flex items-center gap-2"><IconChip icon={TrendingUp} color="var(--series-3)" size="sm" /><span className="font-semibold">Sales</span><span className="t-xs text-[var(--text-3)] hidden 2xl:inline">Cash sales on the cash page</span></span></td>
                  {columnsOf.map((c) => <td key={c.id} className={td}>{money(c.b.sales, { bold: true })}{c.id !== 'group' && c.b.sales > 0 && <ShareBar className="mt-0.5" pct={(c.b.sales / (total.sales || 1)) * 100} color={SITE_COLOR[c.id]} />}</td>)}
                  <td className={cn(td, 'num font-semibold')}>{usd0(total.sales / fx)}</td>
                </tr>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <tr key={cat}>
                    <td className={lead}><span className="inline-flex items-center gap-2"><IconChip icon={CATEGORY_META[cat].icon} color={categoryColor(cat)} size="sm" /><span>{label(cat)}</span><span className="t-xs text-[var(--text-3)] hidden 2xl:inline">{CATEGORY_META[cat].hint}</span></span></td>
                    {columnsOf.map((c) => <td key={c.id} className={td}>{money(c.b.out[cat])}{c.b.out[cat] > 0 && <ShareBar className="mt-0.5" pct={(c.b.out[cat] / (c.b.totalOut || 1)) * 100} color={categoryColor(cat)} />}</td>)}
                    <td className={cn(td, 'num text-[var(--text-2)]')}>{total.out[cat] ? usd0(total.out[cat] / fx) : <span className="text-[var(--text-4)]">—</span>}</td>
                  </tr>
                ))}
                <tr className="bg-[var(--surface-2)]">
                  <td className={cn(lead, 'bg-[var(--surface-2)]')}><span className="inline-flex items-center gap-2"><IconChip icon={Receipt} color="var(--series-2)" size="sm" /><span className="font-semibold">Total costs</span></span></td>
                  {columnsOf.map((c) => <td key={c.id} className={td}>{money(c.b.totalOut, { bold: true })}<div className="num t-xs text-[var(--text-3)]">{c.b.sales ? `${Math.round((c.b.totalOut / c.b.sales) * 100)}% of sales` : 'no sales'}</div></td>)}
                  <td className={cn(td, 'num font-semibold')}>{usd0(total.totalOut / fx)}</td>
                </tr>
                <tr>
                  <td className={lead}><span className="inline-flex items-center gap-2"><IconChip icon={Scale} color="var(--series-1)" size="sm" /><span className="font-semibold">Net</span></span></td>
                  {columnsOf.map((c) => { const up = c.b.net >= 0; const Icon = up ? ArrowUpRight : ArrowDownRight; return <td key={c.id} className={td}><span className={cn('num font-semibold inline-flex items-center gap-0.5', up ? 'text-[var(--ok)]' : 'text-[var(--bad)]')}><Icon className="size-3.5" strokeWidth={2.5} />{signed(Math.round(c.b.net), fmtNum)}</span><div className="t-xs text-[var(--text-3)]">{up ? 'surplus' : 'deficit'}</div></td>; })}
                  <td className={cn(td, 'num font-semibold')}>{usd0(total.net / fx)}</td>
                </tr>
                <tr>
                  <td className={lead}><span className="inline-flex items-center gap-2"><IconChip icon={Percent} color="var(--series-7)" size="sm" /><span>Margin on sales</span></span></td>
                  {columnsOf.map((c) => { const m = marginOf(c.b); return <td key={c.id} className={td}><span className="inline-flex items-center gap-2 justify-end"><DivergingBar value={m} max={100} tone={marginTone(m)} width={56} /><span className="num font-medium">{c.b.sales ? `${m.toFixed(1)}%` : '—'}</span></span></td>; })}
                  <td className={td} />
                </tr>
                <tr>
                  <td className={cn(lead, 'border-b-0')}><span className="inline-flex items-center gap-2"><IconChip icon={BookCheck} color="var(--series-5)" size="sm" /><span>Basis</span></span></td>
                  {columnsOf.map((c) => <td key={c.id} className={cn(td, 'border-b-0')}>{c.provisional ? <Badge tone="warn" dot>{c.openDays.map(fmtDayShort).join(', ')} open</Badge> : <Badge tone="ok" dot>Closed days</Badge>}</td>)}
                  <td className={cn(td, 'border-b-0 t-xs text-[var(--text-3)] num')}>at {fmtNum(fx)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="flex flex-col gap-[var(--gap)]">
          <Panel icon={Layers} title="Cost structure" sub="share of each site's costs" footer={<Legend items={cats.filter((c) => c.value > 0).map((c) => ({ label: c.label, color: c.color }))} />}>
            {total.totalOut === 0 ? <Empty icon={Layers} title="Nothing spent in the period" /> : columnsOf.map((c) => {
              const big = EXPENSE_CATEGORIES.filter((x) => c.b.out[x] > 0).sort((a, b) => c.b.out[b] - c.b.out[a])[0];
              return (
                <div key={c.id} className="py-2 first:pt-0 last:pb-0 border-b border-[var(--line)] last:border-b-0">
                  <div className="flex items-center gap-2 mb-1.5"><SiteTag site={c.id} className="t-base font-medium flex-1" /><span className="num t-sm text-[var(--text-2)]">{fmtUGX(c.b.totalOut)}</span></div>
                  <StackedBar legend={false} height={12} format={fmtUGX} segments={EXPENSE_CATEGORIES.map((x) => ({ label: label(x), value: c.b.out[x], color: categoryColor(x) }))} />
                  <div className="t-xs text-[var(--text-3)] mt-1">{big ? `Largest: ${label(big)}, ${Math.round((c.b.out[big] / c.b.totalOut) * 100)}% of spend` : 'No spend recorded'}</div>
                </div>
              );
            })}
          </Panel>
          <Panel icon={Scale} title="Sales against costs" sub="UGX · same scale">
            {rows.map((r) => { const m = marginOf(r); return (
              <div key={r.site.id} className="py-2 first:pt-0 last:pb-0 border-b border-[var(--line)] last:border-b-0">
                <div className="flex items-center gap-2 mb-1.5"><SiteTag site={r.site.id} className="t-base font-medium flex-1" /><Badge tone={marginTone(m)}>{r.sales ? `${marginWord(m)} · ${Math.round(m)}%` : 'No sales'}</Badge></div>
                {[['Sales', r.sales, SITE_COLOR[r.site.id]], ['Costs', r.totalOut, 'var(--text-4)']].map(([l, v, col]) => (
                  <div key={l as string} className="flex items-center gap-2 h-5 t-sm"><span className="w-10 text-[var(--text-3)]">{l}</span><span className="flex-1 h-2 rounded-[2px] bg-[var(--surface-3)] overflow-hidden"><span className="block h-full rounded-[2px]" style={{ width: `${((v as number) / maxSide) * 100}%`, background: col as string }} /></span><span className="num w-[62px] text-right font-medium">{compact(v as number)}</span></div>
                ))}
              </div>
            ); })}
          </Panel>
        </div>
      </div>

      <div className="grid gap-[var(--gap)] lg:grid-cols-2 xl:grid-cols-3">
        <Panel icon={TrendingUp} title="Sales per day" sub="UGX · stacked by site · 7 working days">
          <ColumnChart height={200} series={SITE_LIST.map((x) => ({ name: x.shortName, color: SITE_COLOR[x.id] }))} data={daily.map((x) => ({ label: fmtDayShort(x.day), values: x.bySite.map((b) => b.sales), partial: x.partial }))} />
        </Panel>
        <Panel icon={Receipt} title="Costs per day" sub="UGX · stacked by site · 7 working days">
          <ColumnChart height={200} series={SITE_LIST.map((x) => ({ name: x.shortName, color: SITE_COLOR[x.id] }))} data={daily.map((x) => ({ label: fmtDayShort(x.day), values: x.bySite.map((b) => b.totalOut), partial: x.partial }))} />
        </Panel>
        <Panel icon={PieChart} title="Where group money went" sub={`UGX · ${meta.long}`} className="lg:col-span-2 xl:col-span-1">
          {donutCats.length ? (
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
              <Donut segments={donutCats} size={140} thickness={18} center={compact(total.totalOut)} sub="UGX out" />
              <div className="flex-1 min-w-[180px]">{donutCats.map((c) => <div key={c.label} className="flex items-center gap-2 h-7 t-base border-b border-[var(--line)] last:border-b-0"><span className="size-2.5 rounded-[3px] shrink-0" style={{ background: c.color }} /><span className="truncate flex-1">{c.label}</span><span className="num t-sm text-[var(--text-3)]">{Math.round((c.value / (total.totalOut || 1)) * 100)}%</span><span className="num font-medium w-[52px] text-right">{compact(c.value)}</span></div>)}</div>
            </div>
          ) : <Empty icon={Wallet} title="No expenses recorded in the period" />}
        </Panel>
      </div>
      <p className="t-xs text-[var(--text-3)] -mt-1.5">Today's column is drawn lighter because its cash pages are still open.</p>

      <Panel icon={Calculator} title="Unit cost per product" sub={`UGX per unit · ${meta.long}`} pad={false}
        actions={<span className="hidden md:block">{costTabs}</span>}
        footer={<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1"><span>Material at the reference price per kg; overhead is categorised spend allocated by output kg. Local price; USD prices converted at {fmtNum(fx)}.</span><Legend items={[{ label: 'Material', color: 'var(--series-1)' }, { label: 'Overhead', color: 'var(--series-4)' }]} /></div>}>
        <div className="md:hidden px-[var(--pad)] py-2 border-b border-[var(--line)]">{costTabs}</div>
        <DataGrid bare rows={shownCosts} columns={costCols} rowKey={(c) => c.product.id} empty="No output logged for sellable products in the period." />
      </Panel>
    </div>
  );
}
