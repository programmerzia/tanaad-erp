import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlarmClock, BarChart3, Download, FileText, HandCoins, Hourglass, MessageCircle, Printer, ScrollText, ShieldCheck, ShoppingCart, Users, Wallet } from 'lucide-react';
import type { Client, Currency, Invoice } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useGo, useQueryParam, useSite } from '@/app/hooks';
import { addDays, clientBalance } from '@/data/selectors';
import { fmtDateTime, fmtDayLong, fmtDayShort, fmtMoney, fmtNum } from '@/data/format';
import { Avatar, Badge, Button, DataGrid, Empty, KpiStrip, Meter, Note, PageHeader, Panel, SearchInput, Sheet, Split, StackedBar, Stat, Tabs, Toolbar, useMedia, type Column } from '@/components/ui';
import { ColumnChart, CountUp } from '@/components/charts';
import { EfrisBadge, Fact, efrisText, orTbp, ClientCell, StackedMoney, WhatsAppSend, ageDays, alsoMoney, clientOf, clientsForSite, dispatchOf, downloadCsv, fxLine, lastWeeks, leadCur, matches, plural, shortMoney, sumByCur, toUsd, weekOf } from './shared';
import { CompanyDetailsHint, InvoiceDocument, PrintStyles, StatementDocument } from './documents';

type TabKey = 'invoices' | 'statements' | 'payments';
type InvFilter = 'all' | 'unpaid' | 'overdue' | 'paid';
interface Share { client: Client; lines: string[]; attachment: string; successTitle: string }

/**
 * A document with its two actions. Sits beside the list on a wide screen and opens as a sheet on a narrow one.
 * Print / PDF is P, share on WhatsApp is W.
 */
function DocPreview({ mode, title, sub, share, onClose, children, extra, short }: { mode: 'aside' | 'sheet'; title: ReactNode; sub?: string; share: Share; onClose: () => void; children: ReactNode; extra?: ReactNode; /** Short button labels (aside, phone). */ short?: boolean }) {
  const [view, setView] = useState<'doc' | 'share'>('doc');
  const actions = view === 'doc' ? <>
    {extra}
    <Button size={mode === 'aside' ? 'sm' : 'md'} icon={MessageCircle} onClick={() => setView('share')} hotkey="w" hotkeyLabel="Share on WhatsApp">{short ? 'Share' : 'Share on WhatsApp'}</Button>
    <Button size={mode === 'aside' ? 'sm' : 'md'} variant="primary" icon={Printer} onClick={() => window.print()} hotkey="p" hotkeyLabel="Print or save as PDF">{short && mode === 'sheet' ? 'Print' : 'Print / PDF'}</Button>
  </> : null;
  const body = view === 'share'
    ? <WhatsAppSend {...share} onBack={() => setView('doc')} backLabel="Back to the document" />
    : <>{children}<div className="t-xs text-[var(--text-3)] mt-2">Print / PDF uses the browser's print dialog; choose "Save as PDF". Production renders the same layout server-side.</div></>;
  if (mode === 'sheet') return <Sheet open onClose={onClose} title={title} sub={sub} width={760} footer={actions ?? undefined}>{body}</Sheet>;
  return <Panel icon={FileText} title={title} sub={sub} actions={actions} bodyClassName="bg-[var(--surface-2)] rounded-b-[9px] max-h-[calc(100dvh-150px)] overflow-auto scrollbar-thin">{body}</Panel>;
}

/** Invoices, client statements and payments for the site. Branded preview, print to PDF, share on WhatsApp. */
export function Invoices() {
  const s = useStore(); const site = useSite(); const go = useGo();
  const beside = useMedia('(min-width: 1180px)'); const wide = useMedia('(min-width: 900px)'); const roomy = useMedia('(min-width: 640px)'); const short = beside || !roomy;
  const co = useStore((x) => x.companyProfiles?.[site.id]); const efris = !!co?.efrisConnected;
  const q0 = useQueryParam('q'); const [q, setQ] = useState(q0 ?? '');
  const [tab, setTab] = useState<TabKey>('invoices'); const [filter, setFilter] = useState<InvFilter>('all'); const [method, setMethod] = useState('all');
  const [invId, setInvId] = useState<string | null>(null); const [clientId, setClientId] = useState<string | null>(null); const [sheet, setSheet] = useState(false);
  useEffect(() => { if (q0 !== undefined) { setQ(q0); setTab('invoices'); setFilter('all'); } }, [q0]);

  const siteOrders = useMemo(() => s.orders.filter((o) => o.siteId === site.id), [s.orders, site.id]);
  const invoices = useMemo(() => s.invoices.filter((i) => siteOrders.some((o) => o.id === i.orderId)).map((i) => {
    const order = siteOrders.find((x) => x.id === i.orderId)!; const client = clientOf(s, order.clientId)!; const paid = order.status === 'paid'; const age = ageDays(s.today, i.issuedAt);
    const received = s.payments.filter((p) => p.invoiceId === i.id).reduce((t, p) => t + p.amount, 0);
    return { inv: i, order, client, paid, age, overdue: !paid && age > client.creditDays, balance: paid ? 0 : Math.max(0, i.total - received) };
  }).sort((a, b) => b.inv.issuedAt.localeCompare(a.inv.issuedAt)), [s, siteOrders]);
  type R = (typeof invoices)[number];
  const clientIds = useMemo(() => new Set(siteOrders.map((o) => o.clientId)), [siteOrders]);
  const payments = useMemo(() => s.payments.filter((p) => clientIds.has(p.clientId)).sort((a, b) => b.at.localeCompare(a.at)), [s.payments, clientIds]);
  type P = (typeof payments)[number];
  const statements = useMemo(() => clientsForSite(s, site.id).filter((c) => clientIds.has(c.id)).map((c) => ({ client: c, bal: clientBalance(s, c.id) })).sort((a, b) => b.bal.balance - a.bal.balance || a.client.name.localeCompare(b.client.name)), [s, site.id, clientIds]);
  type St = (typeof statements)[number];

  // KPI figures
  const since = addDays(s.today, -30); const unpaid = invoices.filter((r) => !r.paid); const late = unpaid.filter((r) => r.overdue);
  const cur = (r: R) => r.inv.currency;
  const invoiced30 = sumByCur(invoices.filter((r) => r.inv.issuedAt.slice(0, 10) >= since), (r) => r.inv.total, cur);
  const unpaidBy = sumByCur(unpaid, (r) => r.balance, cur); const lateBy = sumByCur(late, (r) => r.balance, cur);
  const paid30 = payments.filter((p) => p.at.slice(0, 10) >= since); const collected30 = sumByCur(paid30, (p) => p.amount, (p) => p.currency);
  const cInv = leadCur(invoiced30, site.currencyPrimary); const cUnp = leadCur(unpaidBy, 'USD'); const cLate = leadCur(lateBy, cUnp); const cCol = leadCur(collected30, site.currencyPrimary);
  const weeks = lastWeeks(s.today, 9);
  // What was still owed (or already past terms) at the end of a given day, for the KPI trend lines.
  const openAt = (day: string, lateOnly: boolean) => invoices.filter((r) => r.inv.issuedAt.slice(0, 10) <= day && (!lateOnly || ageDays(day, r.inv.issuedAt) > r.client.creditDays)).reduce((t, r) => { const got = s.payments.filter((p) => p.invoiceId === r.inv.id && p.at.slice(0, 10) <= day).reduce((x, p) => x + p.amount, 0); return t + toUsd(Math.max(0, r.inv.total - got), r.inv.currency, r.order.fxReference); }, 0);
  const weekly = weeks.map((w, i) => { const inWeek = invoices.filter((r) => weekOf(weeks, r.inv.issuedAt) === i); return { ...w, paid: inWeek.filter((r) => r.paid).length, open: inWeek.filter((r) => !r.paid).length, invoicedUsd: inWeek.reduce((t, r) => t + toUsd(r.inv.total, r.inv.currency, r.order.fxReference), 0), collectedUsd: payments.filter((p) => weekOf(weeks, p.at) === i).reduce((t, p) => t + toUsd(p.amount, p.currency, s.fx), 0), openUsd: openAt(w.end, false), lateUsd: openAt(w.end, true) }; });
  const ageing = [{ label: '0–30 days', from: 0, to: 30, mix: 38 }, { label: '31–60 days', from: 31, to: 60, mix: 68 }, { label: 'Over 60 days', from: 61, to: Infinity, mix: 100 }].map((b) => { const list = unpaid.filter((r) => r.inv.currency === cUnp && r.age >= b.from && r.age <= b.to); return { label: b.label, value: list.reduce((t, r) => t + r.balance, 0), count: list.length, color: `color-mix(in srgb, var(--series-1) ${b.mix}%, var(--surface))` }; });

  const oldestOpen = unpaid.slice().sort((a, b) => b.age - a.age)[0];

  // Lists
  const invSearched = q.trim() ? invoices.filter((r) => matches(q, r.inv.number, r.order.number, r.client.name, r.client.country, r.inv.currency, dispatchOf(s, r.order.id)?.deliveryNoteNo)) : invoices;
  const byFilter = (f: InvFilter, list: R[]) => (f === 'unpaid' ? list.filter((r) => !r.paid) : f === 'overdue' ? list.filter((r) => r.overdue) : f === 'paid' ? list.filter((r) => r.paid) : list);
  const invRows = byFilter(filter, invSearched);
  const stRows = q.trim() ? statements.filter((r) => matches(q, r.client.name, r.client.contact, r.client.country)) : statements;
  const methods = [...new Set(payments.map((p) => p.method))];
  const paySearched = q.trim() ? payments.filter((p) => matches(q, clientOf(s, p.clientId)?.name, p.reference, p.method, s.invoices.find((i) => i.id === p.invoiceId)?.number)) : payments;
  const payRows = method === 'all' ? paySearched : paySearched.filter((p) => p.method === method);

  // Selection: on a wide screen something is always in the preview pane.
  const selInv = invRows.find((r) => r.inv.id === invId) ?? (beside ? invRows[0] : undefined);
  const selSt = stRows.find((r) => r.client.id === clientId) ?? (beside ? stRows[0] : undefined);
  const openInvoice = (id: string) => { setInvId(id); setSheet(true); };
  const showInvoice = (id: string | undefined) => { if (!id) return; setTab('invoices'); setFilter('all'); setQ(''); openInvoice(id); };
  const pickFilter = (f: InvFilter) => { setTab('invoices'); setFilter((x) => (x === f ? 'all' : f)); };

  const statusCell = (r: R) => (r.paid ? <Badge tone="ok" dot>Paid</Badge> : r.overdue ? <Badge tone="bad" dot>Overdue · {r.age} days</Badge> : <Badge tone="warn" dot>Unpaid · {r.age} days</Badge>);
  const invCols: Column<R>[] = wide ? [
    { key: 'no', header: 'Invoice', sort: (r) => r.inv.number, cell: (r) => <span className="code font-medium">{r.inv.number}</span> },
    { key: 'client', header: 'Client', sort: (r) => r.client.name, cell: (r) => <ClientCell name={r.client.name} width={beside ? 150 : 240} /> },
    ...(beside ? [] : [{ key: 'order', header: 'Order', cell: (r: R) => <span className="code text-[var(--text-2)]">{r.order.number}</span> } as Column<R>]),
    { key: 'total', header: 'Total', align: 'right', mono: true, sort: (r) => toUsd(r.inv.total, r.inv.currency, r.order.fxReference), cell: (r) => <span className="font-medium">{fmtMoney(r.inv.total, r.inv.currency)}</span> },
    { key: 'issued', header: 'Issued', mono: true, sort: (r) => r.inv.issuedAt, cell: (r) => <span className="text-[var(--text-2)]">{fmtDayShort(r.inv.issuedAt.slice(0, 10))}</span> },
    { key: 'status', header: 'Status', sort: (r) => (r.paid ? -1 : r.age), cell: statusCell },
    { key: 'efris', header: 'EFRIS', cell: () => <EfrisBadge connected={efris} /> },
  ] : [
    { key: 'no', header: 'Invoice', wrap: true, cell: (r) => <div className="py-1 min-w-0"><div className="code font-medium">{r.inv.number}</div><div className="t-sm text-[var(--text-2)] truncate max-w-[42vw]">{r.client.name}</div><div className="t-xs text-[var(--text-3)]">EFRIS {efris ? 'awaiting URA' : 'pending'}</div></div> },
    { key: 'total', header: 'Total', align: 'right', wrap: true, cell: (r) => <div className="flex flex-col items-end gap-1 py-1"><span className="num font-medium whitespace-nowrap">{fmtMoney(r.inv.total, r.inv.currency)}</span>{statusCell(r)}</div> },
  ];
  const stCols: Column<St>[] = [
    { key: 'client', header: 'Client', sort: (r) => r.client.name, cell: (r) => <ClientCell name={r.client.name} width={wide ? (beside ? 210 : 260) : 150} /> },
    ...(wide ? [{ key: 'terms', header: 'Terms', cell: (r: St) => <span className="text-[var(--text-2)]">{r.client.channel === 'export' ? `${r.client.creditDays} days` : 'Cash'}</span> } as Column<St>] : []),
    ...(wide && !beside ? [{ key: 'inv', header: 'Invoiced', align: 'right', mono: true, sort: (r: St) => r.bal.invoiced, cell: (r: St) => fmtMoney(r.bal.invoiced, r.client.currencyPref) } as Column<St>, { key: 'paid', header: 'Paid', align: 'right', mono: true, sort: (r: St) => r.bal.paid, cell: (r: St) => fmtMoney(r.bal.paid, r.client.currencyPref) } as Column<St>] : []),
    { key: 'bal', header: 'Balance', align: 'right', mono: true, sort: (r) => toUsd(r.bal.balance, r.client.currencyPref, s.fx), cell: (r) => <span className={r.bal.balance > 0 ? 'font-medium' : 'text-[var(--text-3)]'}>{fmtMoney(r.bal.balance, r.client.currencyPref)}</span> },
    { key: 'age', header: 'Oldest', sort: (r) => (r.bal.openInvoices.length ? r.bal.ageDays : -1), cell: (r) => (r.bal.openInvoices.length ? <Badge tone={r.bal.ageDays > r.client.creditDays ? 'bad' : 'neutral'}>{r.bal.ageDays} days</Badge> : <Badge tone="ok">Settled</Badge>) },
  ];
  const payCols: Column<P>[] = wide ? [
    { key: 'at', header: 'Received', mono: true, sort: (p) => p.at, cell: (p) => <span className="text-[var(--text-2)]">{fmtDateTime(p.at)}</span> },
    { key: 'client', header: 'Client', sort: (p) => clientOf(s, p.clientId)?.name ?? '', cell: (p) => <ClientCell name={clientOf(s, p.clientId)?.name ?? '?'} width={220} /> },
    { key: 'amount', header: 'Amount', align: 'right', mono: true, sort: (p) => toUsd(p.amount, p.currency, s.fx), cell: (p) => <span className="font-medium">{fmtMoney(p.amount, p.currency)}</span> },
    { key: 'method', header: 'Method', sort: (p) => p.method, cell: (p) => <Badge tone="neutral">{p.method}</Badge> },
    { key: 'ref', header: 'Reference', truncate: 170, cell: (p) => <span className="code text-[var(--text-2)]">{p.reference}</span> },
    { key: 'inv', header: 'Invoice', cell: (p) => (p.invoiceId ? <span className="code">{s.invoices.find((i) => i.id === p.invoiceId)?.number}</span> : <span className="text-[var(--text-3)]">On account</span>) },
  ] : [
    { key: 'client', header: 'Payment', wrap: true, cell: (p) => <div className="py-1 min-w-0"><div className="font-medium truncate max-w-[46vw]">{clientOf(s, p.clientId)?.name}</div><div className="t-sm text-[var(--text-3)] num">{fmtDateTime(p.at)} · {p.method}</div></div> },
    { key: 'amount', header: 'Amount', align: 'right', wrap: true, cell: (p) => <div className="py-1"><div className="num font-medium whitespace-nowrap">{fmtMoney(p.amount, p.currency)}</div><div className="code t-sm text-[var(--text-3)]">{s.invoices.find((i) => i.id === p.invoiceId)?.number ?? 'On account'}</div></div> },
  ];

  const exportCsv = () => {
    if (tab === 'invoices') downloadCsv(`invoices-${site.id}-${s.today}.csv`, ['Invoice', 'Order', 'Client', 'Total', 'Currency', 'Issued', 'Status', 'Age days', 'Balance', 'EFRIS', 'Fiscal Document Number'], invRows.map((r) => [r.inv.number, r.order.number, r.client.name, r.inv.total, r.inv.currency, r.inv.issuedAt, r.paid ? 'Paid' : r.overdue ? 'Overdue' : 'Unpaid', r.age, r.balance, efris ? 'Awaiting URA' : 'Pending', '']));
    else if (tab === 'statements') downloadCsv(`statements-${site.id}-${s.today}.csv`, ['Client', 'Currency', 'Invoiced', 'Paid', 'Balance', 'Oldest invoice days'], stRows.map((r) => [r.client.name, r.client.currencyPref, r.bal.invoiced, r.bal.paid, r.bal.balance, r.bal.openInvoices.length ? r.bal.ageDays : '']));
    else downloadCsv(`payments-${site.id}-${s.today}.csv`, ['Received', 'Client', 'Amount', 'Currency', 'Method', 'Reference', 'Invoice'], payRows.map((p) => [p.at, clientOf(s, p.clientId)?.name ?? '', p.amount, p.currency, p.method, p.reference, s.invoices.find((i) => i.id === p.invoiceId)?.number ?? '']));
  };

  // Documents and their WhatsApp text
  const invoiceShare = (r: R): Share => { const dsp = dispatchOf(s, r.order.id); return { client: r.client, attachment: `${r.inv.number}.pdf`, successTitle: `${r.inv.number} shared`, lines: [`*${site.legalName}* · Invoice ${r.inv.number}`, `Dear ${r.client.contact},`, `Please find attached invoice ${r.inv.number} for order ${r.order.number}.`, ...r.order.lines.map((l) => `• ${fmtNum(l.bundles)} bundles ${s.products.find((x) => x.id === l.productId)?.internalName ?? ''}`), `*Total: ${fmtMoney(r.inv.total, r.inv.currency)}*${r.inv.currency === 'USD' ? ` (${fxLine(r.order.fxReference)})` : ''}`, dsp ? `Delivery note ${dsp.deliveryNoteNo}.` : '', r.client.channel === 'export' ? `Payment due within ${r.client.creditDays} days.` : 'Paid in cash before delivery. Thank you.', '— Tanaad'].filter(Boolean) }; };
  const statementShare = (r: St): Share => { const paidOn = (inv: Invoice) => s.payments.filter((p) => p.invoiceId === inv.id).reduce((t, p) => t + p.amount, 0); return { client: r.client, attachment: `Statement-${r.client.name.replace(/\W+/g, '-')}-${s.today}.pdf`, successTitle: 'Statement sent', lines: [`*Statement of account · ${fmtDayLong(s.today)}*`, `${r.client.name} · ${site.legalName}`, '', ...r.bal.openInvoices.map((i) => `${i.number} · ${fmtDayShort(i.issuedAt.slice(0, 10))} · ${fmtMoney(i.total - paidOn(i), i.currency)} · ${ageDays(s.today, i.issuedAt)} days`), '', `*Balance due: ${fmtMoney(r.bal.balance, r.client.currencyPref)}*`, r.bal.ageDays > r.client.creditDays ? `Oldest invoice is ${r.bal.ageDays} days, beyond ${r.client.creditDays}-day terms.` : '', '— Tanaad'].filter(Boolean) }; };
  const mode = beside ? 'aside' : 'sheet';
  const invoicePreview = selInv && (beside || sheet) ? (
    <DocPreview key={selInv.inv.id} mode={mode} short={short} title={<span className="code">{selInv.inv.number}</span>} sub={selInv.client.name} share={invoiceShare(selInv)} onClose={() => setSheet(false)}
      extra={<Button size={beside ? 'sm' : 'md'} variant="ghost" icon={ShoppingCart} onClick={() => go.site('sales/orders', undefined, selInv.order.number)}>{short ? 'Order' : `Order ${selInv.order.number}`}</Button>}>
      <InvoiceDocument s={s} site={site} invoice={selInv.inv} order={selInv.order} client={selInv.client} dispatch={dispatchOf(s, selInv.order.id)} />
      <div className="surface mt-3 overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-[var(--pad)] h-8 touch:h-10 border-b border-[var(--line)] bg-[var(--surface-2)]"><span className="t-label inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5" />Fiscal status · URA EFRIS</span><EfrisBadge connected={efris} /></div>
        <Fact label="Fiscal Document Number"><span className="text-[var(--text-2)]">{efris ? 'Awaiting URA' : 'Pending'}</span></Fact>
        <Fact label="Verification code / QR"><span className="text-[var(--text-2)]">{efris ? 'Awaiting URA' : 'Pending'}</span></Fact>
        <Fact label="Seller TIN"><span className="text-[var(--text-2)]">{orTbp(co?.tin)}</span></Fact>
        <div className="px-[var(--pad)] py-1.5 t-xs text-[var(--text-3)]">{efrisText(efris)}. Nothing is generated locally; the number and QR come from URA.</div>
      </div>
      <CompanyDetailsHint siteId={site.id} />
    </DocPreview>
  ) : null;
  const statementPreview = selSt && (beside || sheet) ? (
    <DocPreview key={selSt.client.id} mode={mode} short={short} title="Statement" sub={selSt.client.name} share={statementShare(selSt)} onClose={() => setSheet(false)}>
      <StatementDocument s={s} site={site} client={selSt.client} />
      <CompanyDetailsHint siteId={site.id} />
    </DocPreview>
  ) : null;
  const noDoc = (what: string) => <Panel icon={FileText} title="Preview"><Empty icon={ScrollText} title={`No ${what} to show`} hint="Invoices are issued from Orders once a dispatch has passed the gate." /></Panel>;
  const layout = (list: ReactNode, aside: ReactNode, width = 480) => (beside ? <Split asideWidth={width} aside={aside}>{list}</Split> : <>{list}{aside}</>);
  const count = (shown: number, total: number, noun: string) => <span className="t-sm text-[var(--text-3)] num">{shown === total ? plural(total, noun) : `${shown} of ${total}`}</span>;

  const invTotals = sumByCur(invRows, (r) => r.inv.total, cur); const payTotals = sumByCur(payRows, (p) => p.amount, (p) => p.currency);
  const byMethod = methods.map((m) => { const list = payments.filter((p) => p.method === m); return { m, n: list.length, by: sumByCur(list, (p) => p.amount, (p) => p.currency) }; }).sort((a, b) => b.n - a.n);
  const payers = [...clientIds].map((id) => { const list = payments.filter((p) => p.clientId === id); return { client: clientOf(s, id), n: list.length, by: sumByCur(list, (p) => p.amount, (p) => p.currency), usd: list.reduce((t, p) => t + toUsd(p.amount, p.currency, s.fx), 0) }; }).filter((x) => x.client && x.n > 0).sort((a, b) => b.usd - a.usd).slice(0, 5);

  return (
    <div>
      <PrintStyles />
      <PageHeader eyebrow={`Sales · ${site.name}`} title="Invoices and statements" meta={<Badge tone="neutral" className="num">{fxLine(s.fx)}</Badge>}
        subtitle="Invoice PDF to WhatsApp in one step. Local invoices settle on cash, export invoices run on credit."
        actions={<Button icon={Download} onClick={exportCsv} hotkey={sheet && !beside ? undefined : 'e'} hotkeyLabel="Export this list to CSV">Export</Button>}
        tabs={<Tabs variant="underline" value={tab} onChange={(t) => { setTab(t); setSheet(false); }} tabs={[{ value: 'invoices', label: 'Invoices', count: invoices.length }, { value: 'statements', label: 'Statements', count: statements.length }, { value: 'payments', label: 'Payments', count: payments.length }]} />} />

      <KpiStrip className="mb-[var(--gap)]">
        <Stat label="Invoiced, 30 days" icon={ScrollText} accent="var(--series-1)" spark={weekly.map((w) => w.invoicedUsd)} value={<CountUp value={invoiced30[cInv]} format={(n) => shortMoney(n, cInv)} />} sub={`${plural(invoices.filter((r) => r.inv.issuedAt.slice(0, 10) >= since).length, 'invoice')} ${alsoMoney(invoiced30, cInv)}`} onClick={() => pickFilter('all')} />
        <Stat label="Unpaid" icon={Hourglass} accent="var(--series-2)" spark={weekly.map((w) => w.openUsd)} className={tab === 'invoices' && filter === 'unpaid' ? '!border-[var(--brand)] !bg-[var(--selected)]' : undefined} value={<CountUp value={unpaidBy[cUnp]} format={(n) => shortMoney(n, cUnp)} />} sub={unpaid.length ? `${plural(unpaid.length, 'invoice')} open ${alsoMoney(unpaidBy, cUnp)}` : 'Every invoice is settled'} onClick={() => pickFilter('unpaid')} />
        <Stat label="Overdue" icon={AlarmClock} accent="var(--series-8)" spark={weekly.map((w) => w.lateUsd)} sparkColor={late.length ? undefined : 'var(--text-4)'} tone={late.length ? 'bad' : 'neutral'} className={tab === 'invoices' && filter === 'overdue' ? '!border-[var(--brand)] !bg-[var(--selected)]' : undefined} value={<CountUp value={lateBy[cLate]} format={(n) => shortMoney(n, cLate)} />} sub={late.length ? `${plural(late.length, 'invoice')} past terms · oldest ${Math.max(...late.map((r) => r.age))} days` : 'Nothing is past its terms'} onClick={() => pickFilter('overdue')} />
        <Stat label="Collected, 30 days" icon={HandCoins} accent="var(--series-3)" sparkColor="var(--series-3)" spark={weekly.map((w) => w.collectedUsd)} value={<CountUp value={collected30[cCol]} format={(n) => shortMoney(n, cCol)} />} sub={paid30.length ? `${plural(paid30.length, 'payment')} ${alsoMoney(collected30, cCol)}` : 'No payment in the last 30 days'} onClick={() => setTab('payments')} />
      </KpiStrip>

      {tab === 'invoices' && <Note tone="info" icon={ShieldCheck} className="mb-[var(--gap)]"><span><b>Uganda EFRIS.</b> Each invoice is fiscalised automatically, with its Fiscal Document Number and verification QR from URA, once the URA integration is configured. {efris ? 'EFRIS is marked as connected; invoices show the number as soon as URA returns it.' : 'Until then every invoice shows EFRIS as pending.'}</span></Note>}
      {tab === 'invoices' && layout(<>
        <div className="grid gap-[var(--gap)] md:grid-cols-2 mb-[var(--gap)]">
          <Panel icon={Hourglass} title="Unpaid by age" sub={cUnp}>
            {unpaid.length === 0 ? <div className="t-sm text-[var(--text-3)] py-2">Nothing is unpaid.</div> : <>
              <StackedBar height={12} legend={false} segments={ageing} format={(n) => fmtMoney(n, cUnp)} />
              <div className="mt-2">{ageing.map((b) => <div key={b.label} className="flex items-center gap-2 h-6 t-sm"><span className="size-2 rounded-[2px] shrink-0" style={{ background: b.color }} /><span className="text-[var(--text-2)] flex-1">{b.label}</span><span className="text-[var(--text-3)] num">{plural(b.count, 'invoice')}</span><span className="num font-medium w-[92px] text-right">{shortMoney(b.value, cUnp)}</span></div>)}</div>
              {oldestOpen && <div className="t-xs text-[var(--text-3)] mt-1.5 pt-1.5 border-t border-[var(--line)] truncate">Oldest: <span className="code">{oldestOpen.inv.number}</span> · {oldestOpen.client.name} · {oldestOpen.age} days</div>}
            </>}
          </Panel>
          <Panel icon={BarChart3} title="Invoices issued" sub="per week · last 9 weeks">
            <ColumnChart height={104} format={(n) => `${n}`} series={[{ name: 'Paid', color: 'var(--series-3)' }, { name: 'Still unpaid', color: 'var(--series-2)' }]} data={weekly.map((w) => ({ label: w.label, values: [w.paid, w.open], partial: w.partial }))} />
          </Panel>
        </div>
        <Toolbar right={count(invRows.length, invoices.length, 'invoice')}>
          <SearchInput value={q} onChange={setQ} placeholder="Search invoice, client…" className={beside ? '!max-w-[210px]' : undefined} />
          <Tabs value={filter} onChange={setFilter} tabs={(['all', 'unpaid', 'overdue', 'paid'] as InvFilter[]).map((f) => ({ value: f, label: f[0].toUpperCase() + f.slice(1), count: byFilter(f, invSearched).length }))} />
        </Toolbar>
        <DataGrid rows={invRows} columns={invCols} rowKey={(r) => r.inv.id} onRowClick={(r) => openInvoice(r.inv.id)} selectedKey={selInv?.inv.id}
          empty={q.trim() ? `No invoice matches “${q.trim()}”.` : invoices.length === 0 ? 'No invoices yet. Invoices are issued from Orders once a dispatch has passed the gate.' : 'No invoice in this view.'}
          footer={invRows.length > 0 ? <tr><td colSpan={wide ? (beside ? 2 : 3) : 1}>{plural(invRows.length, 'invoice')}</td><td className="text-right py-1"><StackedMoney by={invTotals} /></td>{wide && <td colSpan={3} />}</tr> : undefined} />
      </>, invoicePreview ?? (beside ? noDoc('invoice') : null))}

      {tab === 'statements' && layout(<>
        <Toolbar right={count(stRows.length, statements.length, 'client')}><SearchInput value={q} onChange={setQ} placeholder="Search client…" /></Toolbar>
        <DataGrid rows={stRows} columns={stCols} rowKey={(r) => r.client.id} onRowClick={(r) => { setClientId(r.client.id); setSheet(true); }} selectedKey={selSt?.client.id}
          empty={q.trim() ? `No client matches “${q.trim()}”.` : 'No clients with invoices. Statements appear once a client has been invoiced from this site.'} />
        <p className="t-xs text-[var(--text-3)] mt-2">A statement lists every invoice with what is still open and how old it is, then the payments received.</p>
      </>, statementPreview ?? (beside ? noDoc('statement') : null))}

      {tab === 'payments' && layout(<>
        <Toolbar right={count(payRows.length, payments.length, 'payment')}>
          <SearchInput value={q} onChange={setQ} placeholder="Search client, reference…" />
          <Tabs value={method} onChange={setMethod} tabs={[{ value: 'all', label: 'All', count: paySearched.length }, ...methods.map((m) => ({ value: m, label: m, count: paySearched.filter((p) => p.method === m).length }))]} />
        </Toolbar>
        <DataGrid rows={payRows} columns={payCols} rowKey={(p) => p.id} onRowClick={(p) => showInvoice(p.invoiceId)} maxHeight={wide ? 560 : undefined}
          empty={q.trim() ? `No payment matches “${q.trim()}”.` : 'No payments recorded. Record payments against invoices from Orders.'}
          footer={payRows.length > 0 ? (wide ? <tr><td colSpan={2}>{plural(payRows.length, 'payment')}</td><td className="text-right py-1"><StackedMoney by={payTotals} /></td><td colSpan={3} /></tr> : <tr><td>{plural(payRows.length, 'payment')}</td><td className="text-right py-1"><StackedMoney by={payTotals} /></td></tr>) : undefined} />
        <p className="t-xs text-[var(--text-3)] mt-2">Open a payment to see the invoice it settled.</p>
      </>, <div className={beside ? 'flex flex-col gap-[var(--gap)]' : 'grid gap-[var(--gap)] md:grid-cols-2 mt-[var(--gap)]'}>
        <Panel icon={Wallet} title="By method" sub="all recorded payments">
          {byMethod.length === 0 ? <div className="t-sm text-[var(--text-3)]">No payments yet.</div> : byMethod.map((x) => <Meter key={x.m} label={x.m} sub={plural(x.n, 'payment')} value={x.n} max={payments.length || 1} display={(['USD', 'UGX'] as Currency[]).filter((c) => x.by[c] > 0).map((c) => shortMoney(x.by[c], c)).join(' + ')} />)}
        </Panel>
        <Panel icon={Users} title="Who paid most" sub="to date" pad={false}>
          {payers.length === 0 ? <div className="p-[var(--pad)] t-sm text-[var(--text-3)]">No payments yet.</div> : payers.map((x) => <div key={x.client!.id} className="flex items-center gap-2.5 px-[var(--pad)] h-[var(--row-h)] border-b border-[var(--line)] last:border-b-0"><Avatar name={x.client!.name} size={22} /><span className="t-base truncate flex-1">{x.client!.name}</span><span className="t-sm text-[var(--text-3)] num">{x.n}</span><span className="num t-base font-medium text-right whitespace-nowrap">{(['USD', 'UGX'] as Currency[]).filter((c) => x.by[c] > 0).map((c) => shortMoney(x.by[c], c)).join(' + ')}</span></div>)}
        </Panel>
      </div>, 340)}
    </div>
  );
}
