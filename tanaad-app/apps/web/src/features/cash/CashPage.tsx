import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Camera, CheckCircle2, ChevronLeft, ChevronRight, Download, Equal, Landmark, LineChart as LineChartIcon, Lock, PieChart, Plus, Printer, Receipt, ScrollText, ShieldCheck, Unlock, Wallet } from 'lucide-react';
import { useStore } from '@/data/store';
import { useSite, useGo, useSiteSettings } from '@/app/hooks';
import { Avatar, Badge, Button, Combobox, Empty, Field, Input, Kbd, Note, NumberPad, Panel, PinPad, Sheet, StackedBar, Stat, Status, cn } from '@/components/ui';
import { CountUp, Donut, LineChart } from '@/components/charts';
import { cashDayFor, cashSummary, dailySeries, lastWorkingDays } from '@/data/selectors';
import { compact, fmtDay, fmtDayLong, fmtDayShort, fmtNum, fmtUGX, fmtUSD } from '@/data/format';
import { SITE_COLOR } from '@/config/siteIdentity';
import { PRINT_CSS, SITE_MANAGER_PIN, donutSlices, downloadCsv, moneyOutSplit, stampOf, timeOf, useExpenseCategories } from './categories';
import { CloseDaySheet, varianceTone } from './CloseDaySheet';
import { LedgerTable, LineSheet, type LedgerGroup } from './Ledger';

type Overlay = 'none' | 'close' | 'reopen' | 'receipt';

/** One number of the hero equation: opening + in − out = expected closing. */
function Figure({ label, op, value, sub, strong, icon: Icon }: { label: string; op?: string; value?: number; sub: ReactNode; strong?: boolean; icon: typeof Wallet }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-[0.1em] font-semibold text-white/50 flex items-center gap-1.5"><Icon className="size-3.5" />{label}</div>
      <div className={cn('num text-[18px] sm:text-[22px] font-semibold leading-tight mt-1 whitespace-nowrap', strong && 'text-[var(--color-amber-400)]')}>
        {op && <span className="text-white/40 font-medium mr-1 sm:mr-1.5">{op}</span>}
        {value === undefined ? <span className="text-white/40">—</span> : <><span className="text-[12px] font-medium opacity-60 mr-1 max-sm:hidden">UGX</span><CountUp value={value} /></>}
      </div>
      <div className="text-[11.5px] text-white/55 truncate mt-0.5">{sub}</div>
    </div>
  );
}

/** The daily cash-and-sales page: the paper page as a live ledger, with the money-out split beside it and a signed close at the end. */
export function CashPage() {
  const s = useStore(); const site = useSite(); const go = useGo();
  const addCashEntry = useStore((x) => x.addCashEntry); const closeCashDay = useStore((x) => x.closeCashDay); const reopenCashDay = useStore((x) => x.reopenCashDay); const toast = useStore((x) => x.toast);
  const [day, setDay] = useState(s.today);
  const [panel, setPanel] = useState<Overlay>('none');
  const [lineId, setLineId] = useState<string | null>(null);
  const closePanel = useCallback(() => setPanel('none'), []);
  const idle = panel === 'none' && !lineId;
  const key = (k: string) => (idle ? k : undefined);

  // Day list: last 14 working days plus any other day that has a page (e.g. the categorised example page from August).
  const days = useMemo(() => {
    const set = new Set<string>(lastWorkingDays(site.id, s.today, 14));
    for (const c of s.cashDays) if (c.siteId === site.id) set.add(c.day);
    return [...set].sort();
  }, [s.cashDays, s.today, site.id]);
  const idx = days.indexOf(day);
  const pick = (d: string) => { setDay(d); setLineId(null); };
  const cd = cashDayFor(s, site.id, day);
  const sum = cd ? cashSummary(s, cd.id) : undefined;
  const me = s.users.find((u) => u.id === s.session?.userId); const cashierName = me?.name ?? 'Cashier';
  const signerUser = cd?.signedBy ? s.users.find((u) => u.id === cd.signedBy) : undefined;
  const signer = cd?.signedBy ? signerUser?.name ?? cd.signedBy : undefined;
  const isOpen = !cd || cd.status !== 'closed';
  // Tolerance for the count and the category names are master data (Settings), never written here.
  const threshold = useSiteSettings().cashVariance; const cats = useExpenseCategories(); const categoryLabel = cats.label;
  const vTone = sum?.variance !== undefined ? varianceTone(sum.variance, threshold) : 'ok';

  const dayOptions = useMemo(() => [...days].reverse().map((d) => {
    const c = s.cashDays.find((x) => x.siteId === site.id && x.day === d);
    return { value: d, label: `${fmtDay(d)}${d.slice(0, 4) !== s.today.slice(0, 4) || d.slice(0, 7) < s.today.slice(0, 7) ? ` ${d.slice(0, 4)}` : ''}`, sub: d === s.today ? 'today' : undefined, words: `${d} ${fmtDayLong(d)}`, left: <CalendarDays className="size-4 text-[var(--text-3)]" />, right: <span className="t-sm text-[var(--text-2)]"><Status tone={!c ? 'neutral' : c.status === 'closed' ? 'ok' : c.status === 'reopened' ? 'warn' : 'accent'}>{!c ? 'No page' : c.status === 'closed' ? 'Closed' : c.status === 'reopened' ? 'Reopened' : 'Open'}</Status></span> };
  }), [days, s.cashDays, s.today, site.id]);

  const entries = useMemo(() => [...(sum?.entries ?? [])].sort((a, b) => stampOf(a.at).localeCompare(stampOf(b.at))), [sum?.entries]);
  const sales = entries.filter((e) => e.category === 'sale');
  const receipts = entries.filter((e) => e.direction === 'in' && e.category !== 'sale');
  const expenses = entries.filter((e) => e.direction === 'out' && e.category !== 'wages' && e.category !== 'payout');
  const wages = entries.filter((e) => e.category === 'wages' || e.category === 'payout');
  const outLines = entries.filter((e) => e.direction === 'out');
  const usdIn = entries.filter((e) => e.currency === 'USD' && e.direction === 'in').reduce((t, e) => t + e.amount, 0);
  const usdOut = entries.filter((e) => e.currency === 'USD' && e.direction === 'out').reduce((t, e) => t + e.amount, 0);
  const hasUsd = entries.some((e) => e.currency === 'USD');
  const moneyIn = sum ? sum.sales + sum.receipts : 0; const moneyOut = sum ? sum.expenses + sum.wages : 0;

  // The ledger in page order, with the balance after every line.
  const groups: LedgerGroup[] = [];
  if (cd && sum) {
    let bal = cd.opening;
    const add = (key: string, title: string, sign: 1 | -1, list: typeof entries, total: number, none: string) => groups.push({ key, title, sign, total, none, rows: list.map((e) => { bal += sign * e.amount; return { e, balance: bal }; }) });
    add('sales', 'Cash sales', 1, sales, sum.sales, 'None recorded');
    add('receipts', 'Other receipts', 1, receipts, sum.receipts, 'None recorded');
    add('expenses', 'Expenses', -1, expenses, sum.expenses, 'None yet');
    add('wages', 'Wages and payouts', -1, wages, sum.wages, 'None paid');
  }
  const line = lineId ? groups.flatMap((g) => g.rows).find((r) => r.e.id === lineId) : undefined;

  // Where the money went: the day, and the month up to and including the day.
  const split = moneyOutSplit(entries, cats.items); const slices = donutSlices(split);
  const mtd = useMemo(() => {
    const month = day.slice(0, 7); const ids = new Set(s.cashDays.filter((c) => c.siteId === site.id && c.day.startsWith(month) && c.day <= day).map((c) => c.id));
    const list = s.cashEntries.filter((e) => ids.has(e.cashDayId) && e.direction === 'out');
    return { total: list.reduce((t, e) => t + e.amount, 0), split: moneyOutSplit(list, cats.items), days: ids.size };
  }, [s.cashDays, s.cashEntries, site.id, day, cats.items]);
  const trend = useMemo(() => dailySeries(s, site.id, lastWorkingDays(site.id, day, 7)), [s, site.id, day]);
  const photos = outLines.filter((e) => e.hasReceiptPhoto).length;

  const onClose = (counted: number, denominations: Record<string, number>) => {
    if (!cd) return; const { variance } = closeCashDay(cd.id, counted, denominations); setPanel('none');
    const tone = varianceTone(variance, threshold);
    toast({ kind: tone === 'ok' ? 'ok' : 'warn', title: tone === 'ok' ? 'Day closed and signed · balanced' : `Day closed · ${variance < 0 ? 'short' : 'over'} by ${fmtUGX(Math.abs(variance))}`, detail: tone === 'bad' ? 'Exception raised for the Site Manager.' : tone === 'warn' ? 'Within tolerance · noted in the audit log.' : `${fmtUGX(counted)} carried forward to tomorrow.` });
  };
  const exportCsv = () => {
    if (!cd) return;
    downloadCsv(`cash-page-${site.id}-${day}`, ['Section', 'Time', 'Paid to or received from', 'Category', 'Kind', 'Machine', 'Receipt photo', 'In', 'Out', 'Balance'], [
      ['Opening balance', '', '', '', '', '', '', '', '', cd.opening],
      ...groups.flatMap((g) => g.rows.map(({ e, balance }) => [g.title, timeOf(e.at), e.payee ?? e.note ?? '', categoryLabel(e.category), e.subcategory ?? '', s.machines.find((m) => m.id === e.machineId)?.code ?? '', e.hasReceiptPhoto ? 'yes' : 'no', e.direction === 'in' ? e.amount : '', e.direction === 'out' ? e.amount : '', balance])),
      ['Expected closing', '', '', '', '', '', '', moneyIn, moneyOut, sum?.expectedClosing ?? ''],
    ]);
    toast({ kind: 'ok', title: `cash-page-${site.id}-${day}.csv downloaded` });
  };

  const statusPill = !cd ? <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[12px] font-medium whitespace-nowrap bg-white/10 text-white/70">Not opened</span>
    : cd.status === 'closed' ? <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[12px] font-medium whitespace-nowrap bg-[rgb(74_190_135/.18)] text-[#9be3bf]"><Lock className="size-3.5" />Closed by {signer} at {cd.closedAt ? timeOf(cd.closedAt) : '—'}</span>
    : cd.status === 'reopened' ? <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[12px] font-medium whitespace-nowrap bg-[rgb(240_160_75/.2)] text-[var(--color-amber-400)]"><Unlock className="size-3.5" />Reopened · sign again</span>
    : <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[12px] font-medium whitespace-nowrap bg-white/10 text-white/85"><span className="size-1.5 rounded-full bg-[var(--color-amber-400)] anim-live" />Open · {entries.length} {entries.length === 1 ? 'line' : 'lines'}</span>;

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <style>{PRINT_CSS}</style>

      {/* Identity, day picker, state and the page's equation */}
      <section className="hero relative no-print">
        <div className="px-5 pt-4 pb-3.5 flex flex-wrap items-start gap-x-6 gap-y-3.5">
          <div className="flex items-start gap-3.5 min-w-0 max-sm:w-full">
            <span className="size-12 rounded-xl hidden sm:grid place-items-center shrink-0 shadow-[inset_0_1px_0_rgb(255_255_255/.25)]" style={{ background: SITE_COLOR[site.id] }}><Wallet className="size-6" /></span>
            <div className="min-w-0 max-sm:flex-1">
              <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-white/55">Cash · {site.name}</div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h1 className="text-[24px] font-semibold tracking-[-0.02em] leading-tight">Cash-and-sales page</h1>{statusPill}</div>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <Button variant="inverse" icon={ChevronLeft} aria-label="Previous day" title="Previous day" hotkey={key('[')} hotkeyLabel="Previous day" disabled={idx <= 0} onClick={() => pick(days[idx - 1])} />
                <div className="flex-1 min-w-[150px] sm:flex-none sm:w-[204px] text-[var(--text)]"><Combobox options={dayOptions} value={day} onChange={(v) => { if (v) pick(v); }} placeholder="Pick a day" /></div>
                <Button variant="inverse" icon={ChevronRight} aria-label="Next day" title="Next day" hotkey={key(']')} hotkeyLabel="Next day" disabled={idx < 0 || idx >= days.length - 1} onClick={() => pick(days[idx + 1])} />
                {day !== s.today && <Button variant="inverse" hotkey={key('t')} hotkeyLabel="Back to today" onClick={() => pick(s.today)}>Today</Button>}
                <span className="text-[12.5px] text-white/60 ml-1.5 hidden sm:inline">{fmtDayLong(day)}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <Button variant="inverse" icon={Plus} hotkey={key('r')} hotkeyLabel="Add receipt" disabled={!isOpen} onClick={() => setPanel('receipt')}>+ Money In (Receipt)</Button>
            <Button variant="inverse" icon={Receipt} hotkey={key('n')} hotkeyLabel="New expense" onClick={() => go.site('cash/expense')}>+ Money Out (Expense)</Button>
            {cd && isOpen && <Button variant="accent" icon={Lock} hotkey={key('c')} hotkeyLabel="Close day" onClick={() => setPanel('close')}>Count & Close Day</Button>}
            {cd && !isOpen && <Button variant="inverse" icon={Unlock} hotkey={key('o')} hotkeyLabel="Reopen day" onClick={() => setPanel('reopen')}>Reopen Day</Button>}
          </div>
        </div>
        <div className="px-5 py-3.5 border-t border-white/10 grid grid-cols-2 xl:grid-cols-4 gap-x-5 gap-y-3.5">
          <Figure icon={Landmark} label="Opening balance" value={cd?.opening} sub="Carried forward from the last signed close" />
          <Figure icon={ArrowDownLeft} label="Money in" op="+" value={sum ? moneyIn : undefined} sub={sum ? `Sales ${compact(sum.sales)} · receipts ${compact(sum.receipts)}` : 'No page for this day'} />
          <Figure icon={ArrowUpRight} label="Money out" op="−" value={sum ? moneyOut : undefined} sub={sum ? `Expenses ${compact(sum.expenses)} · wages ${compact(sum.wages)}` : 'No page for this day'} />
          <Figure icon={Equal} label="Expected closing" op="=" strong value={sum?.expectedClosing} sub={cd?.countedClosing !== undefined && sum?.variance !== undefined ? `Counted ${fmtNum(cd.countedClosing)} · ${sum.variance === 0 ? 'balanced' : `${sum.variance > 0 ? 'over' : 'short'} ${fmtNum(Math.abs(sum.variance))}`}` : 'What the drawer should hold now'} />
        </div>
      </section>

      {/* Guided 3-step daily cash workflow */}
      <div className="grid gap-[var(--gap)] md:grid-cols-3 no-print">
        <div className="surface p-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="t-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">Step 1 · Money In</div>
            <div className="t-base font-semibold mt-0.5">Record cash receipts & sales</div>
            <div className="t-xs text-[var(--text-3)] truncate">{sum ? `${fmtUGX(moneyIn)} received today` : 'Open day with first receipt'}</div>
          </div>
          <Button size="sm" variant="secondary" icon={Plus} disabled={!isOpen} onClick={() => setPanel('receipt')}>Add Receipt</Button>
        </div>
        <div className="surface p-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="t-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">Step 2 · Money Out</div>
            <div className="t-base font-semibold mt-0.5">Record expenses with category</div>
            <div className="t-xs text-[var(--text-3)] truncate">{sum ? `${outLines.length} expense lines · ${fmtUGX(moneyOut)}` : 'Category & payee required'}</div>
          </div>
          <Button size="sm" variant="primary" icon={Receipt} onClick={() => go.site('cash/expense')}>Record Expense</Button>
        </div>
        <div className="surface p-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="t-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">Step 3 · End of Day</div>
            <div className="t-base font-semibold mt-0.5">Count notes, compare & sign</div>
            <div className="t-xs text-[var(--text-3)] truncate">{cd?.status === 'closed' ? `Closed & signed (${fmtUGX(cd.countedClosing ?? 0)})` : `Expected: ${fmtUGX(sum?.expectedClosing ?? 0)}`}</div>
          </div>
          {cd && isOpen ? (
            <Button size="sm" variant="accent" icon={Lock} onClick={() => setPanel('close')}>Count & Close</Button>
          ) : (
            <Badge tone="ok" dot>Closed</Badge>
          )}
        </div>
      </div>

      {!isOpen && cd && (
        <Note tone="ok" icon={Lock} className="items-center no-print">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex-1 min-w-[240px]"><strong>Closed and signed</strong> by {signer} at {cd.closedAt ? timeOf(cd.closedAt) : '—'}. The page is locked: {fmtUGX(cd.countedClosing ?? 0)} carried forward{sum?.variance !== undefined && sum.variance !== 0 && <>, variance <span className={cn('num font-semibold', vTone === 'bad' ? 'text-[var(--bad)]' : 'text-[var(--warn)]')}>{sum.variance > 0 ? '+' : '−'}{fmtNum(Math.abs(sum.variance))}</span></>}.</span>
            <Button size="sm" icon={Unlock} onClick={() => setPanel('reopen')}>Reopen with Site Manager PIN</Button>
          </div>
        </Note>
      )}
      {cd?.status === 'reopened' && <Note tone="warn" icon={Unlock} className="no-print"><strong>Reopened</strong> by the Site Manager. Add the missing line, then close and sign again.</Note>}

      <div className="grid gap-[var(--gap)] xl:grid-cols-[minmax(0,1fr)_360px] items-start">
        <div className="flex flex-col gap-[var(--gap)] min-w-0">
          {!cd || !sum ? (
            <Panel icon={ScrollText} title="Ledger" sub={fmtDay(day)}>
              <Empty icon={Wallet} title={`No page for ${fmtDay(day)}`} hint={day > s.today ? 'This day has not happened yet.' : 'Record the first receipt or expense and the page opens with the carried-forward balance.'}
                action={day <= s.today ? <div className="flex flex-wrap justify-center gap-2"><Button icon={Plus} onClick={() => setPanel('receipt')}>Add receipt</Button><Button icon={Receipt} variant="primary" onClick={() => go.site('cash/expense')}>New expense</Button></div> : undefined} />
            </Panel>
          ) : (
            <Panel icon={ScrollText} title="Ledger" sub={`${entries.length} ${entries.length === 1 ? 'line' : 'lines'} · UGX`} pad={false} className="print-area"
              actions={<span className="flex items-center gap-1 no-print"><Button size="sm" variant="ghost" icon={Download} hotkey={key('e')} hotkeyLabel="Export the ledger as CSV" onClick={exportCsv}>CSV</Button><Button size="sm" variant="ghost" icon={Printer} hotkey={key('p')} hotkeyLabel="Print the page" onClick={() => window.print()}>Print</Button></span>}
              footer={<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1"><span>{fmtDayLong(day)} · {site.legalName}</span><span className="no-print text-[var(--text-3)]">Click any row in the ledger to inspect full details.</span></div>}>
              <LedgerTable opening={cd.opening} groups={groups} expected={sum.expectedClosing} counted={cd.countedClosing} variance={sum.variance} threshold={threshold} machines={s.machines} onOpen={setLineId} selectedId={lineId}
                note={hasUsd ? <>USD lines: in {fmtUSD(usdIn)} · out {fmtUSD(usdOut)} · at {fmtNum(s.fx)} UGX/USD</> : undefined} />
            </Panel>
          )}

          <Panel icon={LineChartIcon} title="Cash in and out" sub={`UGX · 7 working days to ${fmtDayShort(day)}`} className="no-print">
            <LineChart height={176} labels={trend.map((d) => fmtDayShort(d.day))} partialLast={day === s.today && isOpen} series={[{ name: 'Cash in', color: 'var(--series-3)', data: trend.map((d) => d.cashIn), area: true }, { name: 'Cash out', color: 'var(--series-2)', data: trend.map((d) => d.cashOut) }]} />
          </Panel>
        </div>

        <aside className="grid gap-[var(--gap)] md:grid-cols-2 xl:grid-cols-1 min-w-0 no-print">
          <Panel icon={PieChart} title="Where the money went" sub={sum ? fmtUGX(moneyOut) : undefined}>
            {slices.length ? (
              <div className="flex items-center gap-4">
                <Donut segments={slices} size={124} thickness={16} center={compact(moneyOut)} sub="UGX out" />
                <div className="flex-1 min-w-0">{slices.map((c) => <div key={c.label} className="flex items-center gap-2 h-[26px] t-sm border-b border-[var(--line)] last:border-b-0"><span className="size-2.5 rounded-[3px] shrink-0" style={{ background: c.color }} /><span className="truncate flex-1">{c.label}</span><span className="num font-medium">{compact(c.value)}</span><span className="num t-xs text-[var(--text-3)] w-8 text-right">{Math.round((c.value / Math.max(1, moneyOut)) * 100)}%</span></div>)}</div>
              </div>
            ) : <Empty icon={Wallet} title="Nothing paid out yet" hint="Every expense lands here under its category." />}
          </Panel>

          <Panel icon={CalendarDays} title="Month to date" sub={`${mtd.days} ${mtd.days === 1 ? 'day' : 'days'} to ${fmtDayShort(day)}`}>
            {mtd.total ? <>
              <div className="flex items-baseline justify-between gap-3 mb-2.5"><span className="num t-kpi">{fmtUGX(mtd.total)}</span><span className="t-sm text-[var(--text-3)] num whitespace-nowrap">{compact(mtd.total / Math.max(1, mtd.days))} a day</span></div>
              <StackedBar segments={mtd.split} height={12} format={compact} />
            </> : <Empty title="No spending this month yet" />}
          </Panel>

          <Panel icon={ShieldCheck} title="Day status" actions={<span className="pr-1.5">{!cd ? <Badge tone="neutral">Not opened</Badge> : cd.status === 'closed' ? <Badge tone="ok" dot>Closed</Badge> : cd.status === 'reopened' ? <Badge tone="warn" dot>Reopened</Badge> : <Badge tone="accent" dot>Open</Badge>}</span>}>
            {!cd ? <div className="t-sm text-[var(--text-3)]">The page opens with the first receipt or expense of the day.</div> : cd.status === 'closed' ? (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5"><Avatar name={signer ?? '?'} seed={signerUser?.avatarSeed} size={32} ring="ok" /><div className="min-w-0 flex-1"><div className="t-base font-semibold truncate">{signer}</div><div className="t-sm text-[var(--text-3)]">Signed the count at {cd.closedAt ? timeOf(cd.closedAt) : '—'}</div></div><CheckCircle2 className="size-5 text-[var(--ok)] shrink-0" /></div>
                <div className="border-t border-[var(--line)] pt-1.5">
                  <div className="flex items-center justify-between h-6 t-sm"><span className="text-[var(--text-2)]">Counted</span><span className="num font-medium">{fmtUGX(cd.countedClosing ?? 0)}</span></div>
                  <div className="flex items-center justify-between h-6 t-sm"><span className="text-[var(--text-2)]">Variance</span><Badge tone={vTone} dot>{!sum?.variance ? 'Balanced' : `${sum.variance > 0 ? 'Over' : 'Short'} ${fmtNum(Math.abs(sum.variance))}`}</Badge></div>
                  <div className="flex items-center justify-between h-6 t-sm"><span className="text-[var(--text-2)]">Tolerance</span><span className="num text-[var(--text-3)]">± {fmtNum(threshold)}</span></div>
                </div>
                <Button block icon={Unlock} onClick={() => setPanel('reopen')}>Reopen · Site Manager PIN</Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5"><span className="size-8 rounded-lg grid place-items-center shrink-0" style={{ background: `color-mix(in srgb, ${cd.status === 'reopened' ? 'var(--warn)' : 'var(--accent)'} 14%, transparent)`, color: cd.status === 'reopened' ? 'var(--warn)' : 'var(--accent-strong)' }}><Unlock className="size-4" /></span><div className="min-w-0 flex-1"><div className="t-base font-semibold">{cd.status === 'reopened' ? 'Reopened, waiting for a new signature' : 'Open, not yet counted'}</div><div className="t-sm text-[var(--text-3)]">{entries.length} {entries.length === 1 ? 'line' : 'lines'} so far · {cashierName} signs</div></div></div>
                <div className="border-t border-[var(--line)] pt-1.5">
                  <div className="flex items-center justify-between h-6 t-sm"><span className="text-[var(--text-2)]">Expected in drawer</span><span className="num font-medium">{fmtUGX(sum?.expectedClosing ?? 0)}</span></div>
                  <div className="flex items-center justify-between h-6 t-sm"><span className="text-[var(--text-2)]">Tolerance</span><span className="num text-[var(--text-3)]">± {fmtNum(threshold)}</span></div>
                </div>
                <Button block variant="primary" icon={Lock} onClick={() => setPanel('close')}>Count and close the day</Button>
              </div>
            )}
          </Panel>

          <div className="grid grid-cols-2 gap-[var(--gap)] content-start">
            <Stat label="Uncategorised" icon={CheckCircle2} tone="ok" value={0} sub="Category is required" />
            <Stat label="Receipt photos" icon={Camera} accent="var(--series-1)" value={outLines.length ? <>{photos}<span className="text-[var(--text-3)] font-medium">/{outLines.length}</span></> : '—'} sub={outLines.length ? `${Math.round((photos / outLines.length) * 100)}% of money out` : 'No money out yet'} />
          </div>
        </aside>
      </div>

      {cd && sum && <CloseDaySheet open={panel === 'close'} onClose={closePanel} expected={sum.expectedClosing} threshold={threshold} cashierName={cashierName} dayLabel={fmtDay(day)} onConfirm={onClose} />}
      <ReopenSheet open={panel === 'reopen'} dayLabel={fmtDay(day)} onClose={closePanel} onReopen={(reason) => { if (!cd) return; reopenCashDay(cd.id, reason); setPanel('none'); toast({ kind: 'warn', title: `${fmtDay(day)} reopened`, detail: reason }); }} />
      <ReceiptSheet open={panel === 'receipt'} dayLabel={fmtDay(day)} onClose={closePanel} onSave={(amount, payee) => { addCashEntry({ siteId: site.id, day, direction: 'in', category: 'receipt', amount, payee, hasReceiptPhoto: false }); setPanel('none'); toast({ kind: 'ok', title: `Receipt ${fmtUGX(amount)} recorded`, detail: payee }); }} />
      <LineSheet row={line} onClose={() => setLineId(null)} machines={s.machines} users={s.users} fx={s.fx} />
    </div>
  );
}

/* ------------------------------------------------------------------ Reopen (reason, then PIN) */
function ReopenSheet({ open, onClose, onReopen, dayLabel }: { open: boolean; onClose: () => void; onReopen: (reason: string) => void; dayLabel: string }) {
  const [reason, setReason] = useState(''); const [wrong, setWrong] = useState(false); const [step, setStep] = useState<'reason' | 'pin'>('reason');
  const toast = useStore((x) => x.toast);
  const ready = reason.trim().length >= 4;
  const leave = () => { setReason(''); setWrong(false); setStep('reason'); };
  const submit = useCallback((pin: string) => { if (pin === SITE_MANAGER_PIN) { onReopen(reason.trim()); leave(); } else { setWrong(true); toast({ kind: 'error', title: 'Wrong PIN', detail: 'Only the Site Manager can reopen a signed day.' }); } }, [reason, onReopen, toast]);
  return (
    <Sheet open={open} onClose={() => { leave(); onClose(); }} title="Reopen a signed day" sub={dayLabel} width={440}>
      <Note tone="warn" className="mb-3">Reopening is logged in the audit trail with your reason. The day must be closed and signed again afterwards.</Note>
      <Field label="1 · Why is it being reopened?" hint="At least a few words, e.g. “Fuel receipt found in the drawer”. Press Enter to go on to the PIN.">
        <Input value={reason} onChange={(e) => { setReason(e.target.value); setStep('reason'); }} onKeyDown={(e) => { if (e.key === 'Enter' && ready) { e.preventDefault(); setStep('pin'); } }} placeholder="Reason" data-autofocus="" />
      </Field>
      <div className="mt-4 pt-4 border-t border-[var(--line)]">
        <div className="t-sm font-medium text-[var(--text-2)] mb-2">2 · Site Manager PIN</div>
        {step === 'pin' && ready ? <PinPad title="Site Manager PIN" error={wrong ? 'Wrong PIN. Try again.' : undefined} onSubmit={submit} />
          : <div className="flex flex-col items-center gap-2 py-3"><div className="t-sm text-[var(--text-3)] text-center">{ready ? 'Hand the keyboard to the Site Manager.' : 'Give a reason first.'}</div><Button variant="primary" icon={ShieldCheck} disabled={!ready} onClick={() => setStep('pin')}>Enter the PIN</Button></div>}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ Quick receipt (money in) */
function ReceiptSheet({ open, onClose, onSave, dayLabel }: { open: boolean; onClose: () => void; onSave: (amount: number, payee: string) => void; dayLabel: string }) {
  const [amount, setAmount] = useState(''); const [payee, setPayee] = useState('');
  const n = parseInt(amount || '0', 10);
  const ok = n > 0 && !!payee.trim();
  const save = () => { if (ok) { onSave(n, payee.trim()); setAmount(''); setPayee(''); } };
  return (
    <Sheet open={open} onClose={onClose} title="Add a receipt" sub={`Money in · ${dayLabel}`} width={440}
      footer={<><span className="mr-auto t-sm text-[var(--text-3)]">{!payee.trim() ? 'Say who paid' : !(n > 0) ? 'Enter the amount' : 'Ready to record'}</span><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={Plus} disabled={!ok} hotkey="mod+enter" hotkeyLabel="Record the receipt" onClick={save}>Record {n > 0 ? fmtUGX(n) : 'receipt'}</Button></>}>
      <Field label="Received from" className="mb-3"><Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Name or reason, e.g. Client deposit" data-autofocus="" /></Field>
      <div onKeyDown={(e) => { if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey) && ok) { e.preventDefault(); save(); } }}><NumberPad value={amount} onChange={setAmount} suffix="UGX" label="Amount" max={999_999_999} /></div>
    </Sheet>
  );
}
