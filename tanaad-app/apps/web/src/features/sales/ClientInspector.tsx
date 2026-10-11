import { useState } from 'react';
import { ArrowLeft, MessageCircle, ScrollText, ShieldCheck, ShoppingCart, Truck, Wallet } from 'lucide-react';
import type { Client, Invoice, Order, Payment } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useGo } from '@/app/hooks';
import { addDays, clientBalance, orderTotal } from '@/data/selectors';
import { fmtDateTime, fmtDayLong, fmtDayShort, fmtMoney } from '@/data/format';
import { Avatar, Badge, Button, DataGrid, Meter, Note, Panel, Sheet, type Column } from '@/components/ui';
import { TimeTrack } from '@/components/charts';
import { FigureRow, StatusBadge, WhatsAppSend, ageDays, invoiceOf, linesSummary, marketOf, plural, termsOf } from './shared';

/** Client inspector: profile, credit position, everything shipped, invoiced and paid, and the two things you do next. */
export function ClientInspector({ client, onClose, onNewOrder }: { client: Client; onClose: () => void; onNewOrder: () => void }) {
  const s = useStore(); const go = useGo(); const [view, setView] = useState<'profile' | 'statement'>('profile');
  const bal = clientBalance(s, client.id); const cur = client.currencyPref;
  const orders = s.orders.filter((o) => o.clientId === client.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const invoices = s.invoices.filter((i) => orders.some((o) => o.id === i.orderId)).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  const payments = s.payments.filter((p) => p.clientId === client.id).sort((a, b) => b.at.localeCompare(a.at));
  const used = client.creditLimit ? Math.round((bal.balance / client.creditLimit) * 100) : 0;
  const oldest = bal.openInvoices[0]; const late = !!oldest && bal.ageDays > client.creditDays;
  const toInvoice = orders.some((o) => invoiceOf(s, o.id) === undefined && (o.status === 'dispatched' || o.status === 'delivered'));
  const statement = [`*Statement of account · ${fmtDayLong(s.today)}*`, `${client.name}`, '', ...bal.openInvoices.map((i) => `${i.number} · ${fmtDayShort(i.issuedAt.slice(0, 10))} · ${fmtMoney(i.total, i.currency)} · ${ageDays(s.today, i.issuedAt)} days`), '', `Paid to date: ${fmtMoney(bal.paid, cur)}`, `*Balance due: ${fmtMoney(bal.balance, cur)}*`, '', 'Thank you for your business. — Tanaad'];

  const orderCols: Column<Order>[] = [
    { key: 'no', header: 'Order', cell: (o) => <span className="code font-medium">{o.number}</span> },
    { key: 'd', header: 'Date', mono: true, cell: (o) => <span className="text-[var(--text-2)]">{fmtDayShort(o.createdAt.slice(0, 10))}</span> },
    { key: 'l', header: 'Lines', truncate: 170, cell: (o) => <span className="text-[var(--text-2)]" title={linesSummary(s, o)}>{linesSummary(s, o)}</span> },
    { key: 't', header: 'Total', align: 'right', mono: true, cell: (o) => <span className="font-medium">{fmtMoney(orderTotal(o), o.currency)}</span> },
    { key: 's', header: 'Status', cell: (o) => <StatusBadge status={o.status} /> },
  ];
  const invCols: Column<Invoice>[] = [
    { key: 'no', header: 'Invoice', cell: (i) => <span className="code font-medium">{i.number}</span> },
    { key: 'd', header: 'Issued', mono: true, cell: (i) => <span className="text-[var(--text-2)]">{fmtDayShort(i.issuedAt.slice(0, 10))}</span> },
    { key: 't', header: 'Total', align: 'right', mono: true, cell: (i) => <span className="font-medium">{fmtMoney(i.total, i.currency)}</span> },
    { key: 's', header: 'Status', cell: (i) => { const paid = orders.find((o) => o.id === i.orderId)?.status === 'paid'; const age = ageDays(s.today, i.issuedAt); return paid ? <Badge tone="ok" dot>Paid</Badge> : <Badge tone={age > client.creditDays ? 'bad' : 'warn'} dot>{age} days open</Badge>; } },
  ];
  const payCols: Column<Payment>[] = [
    { key: 'd', header: 'Received', mono: true, cell: (p) => <span className="text-[var(--text-2)]">{fmtDateTime(p.at)}</span> },
    { key: 'a', header: 'Amount', align: 'right', mono: true, cell: (p) => <span className="font-medium">{fmtMoney(p.amount, p.currency)}</span> },
    { key: 'm', header: 'Method', cell: (p) => p.method },
    { key: 'r', header: 'Reference', truncate: 150, cell: (p) => <span className="code text-[var(--text-2)]">{p.reference}</span> },
    { key: 'i', header: 'Invoice', cell: (p) => (p.invoiceId ? <span className="code">{s.invoices.find((i) => i.id === p.invoiceId)?.number ?? ''}</span> : <span className="text-[var(--text-3)]">On account</span>) },
  ];

  return (
    <Sheet open onClose={onClose} width={620} title={client.name} sub={`${marketOf(client)} · ${termsOf(client)}`}
      footer={view === 'statement' ? <Button variant="ghost" icon={ArrowLeft} className="mr-auto" onClick={() => setView('profile')}>Back to profile</Button> : <>
        <Button icon={MessageCircle} onClick={() => setView('statement')} hotkey="w" hotkeyLabel="Send statement on WhatsApp">Send statement on WhatsApp</Button>
        <Button variant="primary" icon={ShoppingCart} onClick={onNewOrder} hotkey="mod+enter">New order</Button>
      </>}>
      {view === 'statement' ? <WhatsAppSend client={client} lines={statement} attachment={`Statement-${client.name.replace(/\W+/g, '-')}-${s.today}.pdf`} successTitle="Statement sent" /> : (
        <div className="flex flex-col gap-[var(--gap)]">
          <div className="flex items-center gap-3">
            <Avatar name={client.name} size={44} />
            <div className="min-w-0 flex-1">
              <div className="t-lg font-semibold truncate">{client.contact}</div>
              <div className="t-sm text-[var(--text-2)]"><span className="num">{client.whatsapp}</span> · {client.country}</div>
              <div className="flex flex-wrap gap-1.5 mt-1.5"><Badge tone={client.channel === 'export' ? 'accent' : 'neutral'}>{client.channel === 'export' ? `Export · credit ${client.creditDays} days` : 'Local · cash before delivery'}</Badge><Badge tone="neutral">Invoiced in {cur}</Badge></div>
            </div>
            <div className="text-right shrink-0"><div className="t-xs text-[var(--text-3)]">Balance due</div><div className={`num t-kpi ${late ? 'text-[var(--bad)]' : ''}`}>{fmtMoney(bal.balance, cur)}</div></div>
          </div>

          <FigureRow items={[
            { label: 'Open invoices', value: bal.openInvoices.length, sub: bal.openInvoices.length ? `oldest ${bal.ageDays} days` : 'all settled', tone: late ? 'bad' : undefined },
            { label: 'Invoiced to date', value: fmtMoney(bal.invoiced, cur), sub: plural(invoices.length, 'invoice') },
            { label: 'Paid to date', value: fmtMoney(bal.paid, cur), sub: bal.lastPayment ? `last ${fmtDayShort(bal.lastPayment.at.slice(0, 10))} · ${bal.lastPayment.method}` : 'none yet' },
          ]} />

          {client.channel === 'export' ? (
            <Panel icon={ShieldCheck} title="Credit" sub={`${fmtMoney(client.creditLimit, cur)} limit · ${client.creditDays} days`} actions={<span className="pr-2"><Badge tone={used > 100 ? 'bad' : used > 80 ? 'warn' : 'ok'} dot>{used > 100 ? 'Over limit' : used > 80 ? 'Close to limit' : 'Headroom'}</Badge></span>}>
              <Meter label="Credit used" value={bal.balance} max={client.creditLimit || 1} tone={used > 100 ? 'bad' : used > 80 ? 'warn' : 'series'} display={<>{fmtMoney(bal.balance, cur)}<span className="text-[var(--text-3)] font-normal"> of {fmtMoney(client.creditLimit, cur)} · {used}%</span></>} />
              <div className="t-sm text-[var(--text-3)] mb-3">{used > 100 ? 'Over limit: new orders need CEO approval at the credit desk.' : used > 80 ? 'Close to the limit: the next large order will go to the CEO.' : 'Headroom available for new export orders.'}</div>
              {oldest ? <>
                <div className="flex items-baseline justify-between mb-2"><span className="t-base">Oldest open invoice <span className="code">{oldest.number}</span></span><span className={`num t-base font-medium ${late ? 'text-[var(--bad)]' : ''}`}>{late ? `${bal.ageDays - client.creditDays} days past terms` : client.creditDays === bal.ageDays ? 'Due today' : `${client.creditDays - bal.ageDays} days left`}</span></div>
                <TimeTrack progress={client.creditDays ? bal.ageDays / client.creditDays : 1} color={late ? 'var(--bad)' : 'var(--accent)'} startLabel={`Issued ${fmtDayShort(oldest.issuedAt.slice(0, 10))}`} nowLabel={`Day ${bal.ageDays} of ${client.creditDays}`} endLabel={`Due ${fmtDayShort(addDays(oldest.issuedAt.slice(0, 10), client.creditDays))}`} />
              </> : <div className="t-sm text-[var(--text-3)]">No invoice is open, so no credit period is running.</div>}
            </Panel>
          ) : <Note tone="neutral">Local clients have no credit. Orders unlock for dispatch only after the cashier confirms cash.</Note>}

          {toInvoice && <Note tone="accent">Delivered orders are waiting for an invoice. Issue them from Orders.</Note>}

          <Panel icon={Truck} title="Shipment history" sub={orders.length ? plural(orders.length, 'order') : undefined} pad={false}>
            <DataGrid bare dense rows={orders} columns={orderCols} rowKey={(o) => o.id} maxHeight={236} onRowClick={(o) => go.site('sales/orders', undefined, o.number)} empty="No orders yet. Start the first one with New order." />
          </Panel>
          <Panel icon={ScrollText} title="Invoices" sub={invoices.length ? `${plural(invoices.length, 'invoice')} · ${bal.openInvoices.length} open` : undefined} pad={false}>
            <DataGrid bare dense rows={invoices} columns={invCols} rowKey={(i) => i.id} maxHeight={208} onRowClick={(i) => go.site('sales/invoices', undefined, i.number)} empty="No invoices yet." />
          </Panel>
          <Panel icon={Wallet} title="Payments" sub={payments.length ? plural(payments.length, 'payment') : undefined} pad={false}>
            <DataGrid bare dense rows={payments} columns={payCols} rowKey={(p) => p.id} maxHeight={208} empty="No payments yet." />
          </Panel>
        </div>
      )}
    </Sheet>
  );
}
