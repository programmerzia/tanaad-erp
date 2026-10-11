import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ClockAlert, Download, Gauge, Hourglass, Landmark, MessageSquareText, Pause, Send, ShieldCheck } from 'lucide-react';
import type { Client, Order } from '@tanaad/domain';
import { useStore, type AppState } from '@/data/store';
import { useQueryParam } from '@/app/hooks';
import { Avatar, Badge, Bar, Button, DataGrid, Empty, Input, Kbd, KpiStrip, Note, PageHeader, Panel, SearchInput, Sheet, Stat, Tabs, Toolbar, cn, useMedia, type Column } from '@/components/ui';
import { CountUp, Delta, Legend, pctChange } from '@/components/charts';
import { WhatsAppPreview } from '@/components/WhatsAppPreview';
import { messaging } from '@/devices';
import { SITES } from '@/config/sites';
import { addDays, clientBalance, orderTotal } from '@/data/selectors';
import { compact, fmtDateTime, fmtDayShort, fmtMoney, fmtNum, fmtUSD } from '@/data/format';
import { CountryTag, KV, SiteBadge, Wrap, agoLabel, downloadCsv, plural, takePresetSelection, useListKeys } from './shared';

type Verdict = 'approved' | 'held';
const usdOf = (s: AppState, o: Order) => (o.currency === 'USD' ? orderTotal(o) : orderTotal(o) / s.fx);

/** Credit limit as a track: what the client owes now, what this order adds, and anything past the limit in red. */
function CreditMeter({ limit, balance, order, currency }: { limit: number; balance: number; order: number; currency: Client['currencyPref'] }) {
  const after = balance + order; const max = Math.max(limit, after) || 1; const over = Math.max(0, after - limit); const pct = limit ? Math.round((after / limit) * 100) : 0;
  const within = Math.max(0, Math.min(order, limit - balance)); const w = (n: number) => `${(Math.max(0, n) / max) * 100}%`;
  return (
    <div>
      <div className="flex items-end justify-between gap-3 mb-2">
        <span className="t-sm font-medium text-[var(--text-2)]">Credit used after this order</span>
        <span className="flex items-baseline gap-1.5"><span className={cn('num t-kpi', over > 0 ? 'text-[var(--bad)]' : pct > 80 ? 'text-[var(--warn)]' : 'text-[var(--text)]')}>{pct}%</span><span className="t-sm text-[var(--text-3)]">of limit</span></span>
      </div>
      <div className="relative py-1" role="img" aria-label={`Balance ${fmtMoney(balance, currency)}, this order ${fmtMoney(order, currency)}, limit ${fmtMoney(limit, currency)}`}>
        <div className="flex h-3 gap-[2px] rounded-[3px] overflow-hidden bg-[var(--surface-3)]">
          <div style={{ width: w(balance), background: 'var(--text-3)' }} title={`Balance now ${fmtMoney(balance, currency)}`} />
          <div style={{ width: w(within), background: 'var(--series-1)' }} title={`This order ${fmtMoney(order, currency)}`} />
          {over > 0 && <div style={{ width: w(Math.min(over, order)), background: 'var(--bad)' }} title={`Over the limit by ${fmtMoney(over, currency)}`} />}
        </div>
        {limit > 0 && <div className="absolute top-0 bottom-0 w-0.5 -ml-px bg-[var(--text)]" style={{ left: w(limit) }} />}
      </div>
      <div className="relative h-4 t-xs text-[var(--text-3)] num"><span className="absolute left-0">0</span>{limit > 0 && <span className="absolute whitespace-nowrap -translate-x-full pr-1" style={{ left: w(limit) }}>limit {fmtMoney(limit, currency)}</span>}</div>
      <Legend className="mt-1.5" items={[{ label: 'Balance now', color: 'var(--text-3)', value: fmtMoney(balance, currency) }, { label: 'This order', color: 'var(--series-1)', value: fmtMoney(order, currency) }, over > 0 ? { label: 'Over the limit', color: 'var(--bad)', value: fmtMoney(over, currency) } : { label: 'Headroom left', color: 'var(--line-2)', value: fmtMoney(Math.max(0, limit - after), currency) }]} />
    </div>
  );
}

/** Export orders awaiting approval with the client's credit picture; receivables and WhatsApp statements below. */
export function CreditDesk() {
  const s = useStore(); const decideOrder = useStore((x) => x.decideOrder); const toast = useStore((x) => x.toast);
  const q0 = useQueryParam('q'); const [q, setQ] = useState(q0 ?? ''); const [filter, setFilter] = useState<'all' | 'balance' | 'late'>('all'); const [market, setMarket] = useState('all');
  const [selId, setSelId] = useState<string | null>(() => takePresetSelection());
  const [armed, setArmed] = useState<Verdict | null>(null); const [reason, setReason] = useState('');
  const [statement, setStatement] = useState<Client | null>(null); const [sending, setSending] = useState(false); const [sentId, setSentId] = useState<string | null>(null);
  const wide = useMedia('(min-width: 640px)');
  const reasonRef = useRef<HTMLInputElement>(null); const listRef = useRef<HTMLDivElement>(null);

  const clientOf = (o: Order) => s.clients.find((c) => c.id === o.clientId)!;
  const productOf = (id: string) => s.products.find((p) => p.id === id);
  const user = s.users.find((u) => u.id === s.session?.userId);
  const awaiting = useMemo(() => s.orders.filter((o) => o.status === 'awaiting_approval').sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [s.orders]);
  const decided = useMemo(() => s.orders.filter((o) => (o.status === 'held' || ((o.status === 'approved' || o.status === 'picking') && !!o.approvedAt)) && s.clients.find((c) => c.id === o.clientId)?.channel === 'export').sort((a, b) => (b.approvedAt ?? '').localeCompare(a.approvedAt ?? '')).slice(0, 5), [s.orders, s.clients]);
  const queue = [...awaiting, ...decided];
  const exportClients = useMemo(() => s.clients.filter((c) => c.channel === 'export').map((c) => ({ client: c, ...clientBalance(s, c.id) })).sort((a, b) => b.ageDays - a.ageDays), [s]);
  type Recv = (typeof exportClients)[number];
  const late = (r: Recv) => r.balance > 0 && r.openInvoices.length > 0 && r.ageDays > r.client.creditDays;
  const used = (r: Recv) => (r.client.creditLimit ? (r.balance / r.client.creditLimit) * 100 : 0);

  const selected = queue.find((o) => o.id === selId) ?? queue[0]; const index = selected ? queue.indexOf(selected) : -1;
  const pending = !!selected && selected.status === 'awaiting_approval';
  const select = (id: string) => { setSelId(id); setArmed(null); setReason(''); };
  useListKeys(queue.length, index, (i) => select(queue[i].id), { noun: 'order' });
  useEffect(() => { listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' }); }, [selected?.id]);

  const arm = (v: Verdict) => { setArmed(v); setTimeout(() => reasonRef.current?.focus(), 40); };
  const disarm = () => { setArmed(null); reasonRef.current?.blur(); };
  const confirm = () => {
    if (!selected || !armed || !pending) return;
    const next = awaiting[awaiting.indexOf(selected) + 1] ?? awaiting[awaiting.indexOf(selected) - 1]; const why = reason.trim() || undefined;
    decideOrder(selected.id, armed, why);
    if (armed === 'approved') toast({ kind: 'ok', title: `${selected.number} approved`, detail: `${clientOf(selected).name} · ${fmtMoney(orderTotal(selected), selected.currency)}. The store can start picking.` });
    else toast({ kind: 'warn', title: `${selected.number} on hold`, detail: why ?? 'No reason given' });
    setArmed(null); setReason(''); reasonRef.current?.blur(); if (next) setSelId(next.id);
  };

  const statementLines = (c: Client) => {
    const b = clientBalance(s, c.id);
    const pays = s.payments.filter((p) => p.clientId === c.id).sort((a, b2) => b2.at.localeCompare(a.at)).slice(0, 3);
    const lastOrder = s.orders.filter((o) => o.clientId === c.id).sort((a, b2) => b2.createdAt.localeCompare(a.createdAt))[0];
    return [
      `Statement · ${c.name}`, `${fmtDayShort(s.today)}${lastOrder ? ` · from ${SITES[lastOrder.siteId].legalName}` : ''}`, '',
      'Open invoices:', ...(b.openInvoices.length ? b.openInvoices.map((i) => `• ${i.number} · ${fmtDayShort(i.issuedAt.slice(0, 10))} · ${fmtMoney(i.total, i.currency)}`) : ['• none']), '',
      'Recent payments:', ...(pays.length ? pays.map((p) => `• ${fmtDayShort(p.at.slice(0, 10))} · ${fmtMoney(p.amount, p.currency)} · ${p.method}`) : ['• none on record']), '',
      `Balance due: ${fmtMoney(b.balance, c.currencyPref)}`, `Credit terms: ${c.creditDays} days · limit ${fmtMoney(c.creditLimit, c.currencyPref)}`,
    ];
  };
  const openStatement = (c: Client) => { setStatement(c); setSentId(null); };
  const send = async () => {
    if (!statement || sending || sentId) return; setSending(true);
    const r = await messaging.sendWhatsApp(statement.whatsapp, statementLines(statement).join('\n'), `Statement-${statement.name.split(' ')[0]}-${s.today}.pdf`);
    setSending(false); setSentId(r.id); toast({ kind: 'ok', title: `Statement sent to ${statement.contact}`, detail: `WhatsApp message ${r.id}` });
  };

  /* Headline numbers */
  const awaitingUsd = awaiting.reduce((t, o) => t + usdOf(s, o), 0);
  const recvTotal = exportClients.reduce((t, r) => t + r.balance, 0); const lateRows = exportClients.filter(late); const lateTotal = lateRows.reduce((t, r) => t + r.balance, 0);
  const exportIds = new Set(exportClients.map((r) => r.client.id));
  const balanceOn = (day: string) => s.invoices.filter((i) => i.issuedAt.slice(0, 10) <= day && exportIds.has(s.orders.find((o) => o.id === i.orderId)?.clientId ?? '')).reduce((t, i) => t + i.total, 0) - s.payments.filter((p) => p.at.slice(0, 10) <= day && exportIds.has(p.clientId)).reduce((t, p) => t + p.amount, 0);
  const trend = Array.from({ length: 14 }, (_, i) => balanceOn(addDays(s.today, i - 13)));
  const top = [...exportClients].sort((a, b) => used(b) - used(a))[0];
  const limitTotal = exportClients.reduce((t, r) => t + r.client.creditLimit, 0);

  const markets = [...new Set(exportClients.map((r) => r.client.country))].sort();
  const rows = exportClients.filter((r) => (market === 'all' || r.client.country === market) && (filter === 'all' || (filter === 'balance' ? r.balance > 0 : late(r))) && (!q.trim() || `${r.client.name} ${r.client.contact} ${r.client.country} ${r.client.whatsapp}`.toLowerCase().includes(q.trim().toLowerCase())));
  const exportCsv = () => downloadCsv(`export-receivables-${s.today}.csv`, ['Client', 'Country', 'Contact', 'WhatsApp', 'Currency', 'Balance', 'Credit limit', 'Used %', 'Oldest invoice days', 'Terms days', 'Open invoices', 'Last payment'], rows.map((r) => [r.client.name, r.client.country, r.client.contact, r.client.whatsapp, r.client.currencyPref, r.balance, r.client.creditLimit, Math.round(used(r)), r.openInvoices.length ? r.ageDays : '', r.client.creditDays, r.openInvoices.length, r.lastPayment ? r.lastPayment.at.slice(0, 10) : '']));

  const cols: Column<Recv>[] = [
    { key: 'client', header: 'Client', sort: (r) => r.client.name, cell: (r) => <div className="flex items-center gap-2.5 py-0.5"><Avatar name={r.client.name} size={26} /><div className="min-w-0"><div className="font-medium">{r.client.name}</div><div className="t-sm text-[var(--text-3)]">{r.client.contact} · {r.client.whatsapp}</div></div></div> },
    { key: 'country', header: 'Country', sort: (r) => r.client.country, cell: (r) => <span className="inline-flex items-center gap-1.5"><CountryTag country={r.client.country} />{r.client.country}</span> },
    { key: 'bal', header: 'Balance', align: 'right', mono: true, sort: (r) => r.balance, cell: (r) => <span className="font-semibold">{fmtMoney(r.balance, r.client.currencyPref)}</span> },
    { key: 'used', header: 'Credit used', width: 170, sort: used, cell: (r) => (r.client.creditLimit ? <span className="flex items-center gap-2"><Bar value={r.balance} max={r.client.creditLimit} tone={used(r) > 100 ? 'bad' : used(r) > 80 ? 'warn' : 'series'} className="w-[84px]" /><span className="num w-[38px] text-right font-medium">{Math.round(used(r))}%</span><span className="num t-sm text-[var(--text-3)] max-xl:hidden">of {compact(r.client.creditLimit)}</span></span> : <span className="text-[var(--text-4)]">no limit</span>) },
    { key: 'age', header: 'Ageing', sort: (r) => (r.openInvoices.length ? r.ageDays : -1), cell: (r) => (!r.openInvoices.length ? <span className="text-[var(--text-4)]">none open</span> : late(r) ? <Badge tone="bad" dot>{r.ageDays} d · {r.ageDays - r.client.creditDays} over terms</Badge> : <Badge tone="neutral">{r.ageDays} d of {r.client.creditDays}</Badge>) },
    { key: 'open', header: 'Open invoices', align: 'right', mono: true, sort: (r) => r.openInvoices.length, cell: (r) => fmtNum(r.openInvoices.length) },
    { key: 'last', header: 'Last payment', sort: (r) => r.lastPayment?.at ?? '', cell: (r) => (r.lastPayment ? <span className="num">{fmtMoney(r.lastPayment.amount, r.lastPayment.currency)} <span className="text-[var(--text-3)]">· {fmtDayShort(r.lastPayment.at.slice(0, 10))}</span></span> : <span className="text-[var(--text-4)]">never</span>) },
    { key: 'act', header: '', align: 'right', cell: (r) => <Button size="sm" icon={MessageSquareText} onClick={(e) => { e.stopPropagation(); openStatement(r.client); }}>Send statement</Button> },
  ];

  /* Selected order */
  const c = selected ? clientOf(selected) : undefined; const b = c ? clientBalance(s, c.id) : undefined; const total = selected ? orderTotal(selected) : 0;
  const after = (b?.balance ?? 0) + total; const afterPct = c?.creditLimit ? (after / c.creditLimit) * 100 : 0;

  const queueRow = (o: Order) => {
    const cl = clientOf(o); const bal = clientBalance(s, cl.id); const t = orderTotal(o); const pct = cl.creditLimit ? Math.round(((bal.balance + t) / cl.creditLimit) * 100) : 0; const on = o.id === selected?.id;
    return (
      <button key={o.id} aria-current={on} onClick={() => select(o.id)} className={cn('w-full flex items-center gap-2.5 px-[var(--pad)] py-2 touch:py-2.5 text-left border-b border-[var(--line)] hover:bg-[var(--hover)]', on && 'bg-[var(--selected)] hover:bg-[var(--selected)] shadow-[inset_2px_0_0_var(--focus)]')}>
        <Avatar name={cl.name} size={28} />
        <span className="min-w-0 flex-1"><span className="block t-base font-medium truncate">{cl.name}</span><span className="block t-sm text-[var(--text-3)] truncate"><span className="code">{o.number}</span> · {o.status === 'awaiting_approval' ? agoLabel(o.createdAt, s.today) : o.status === 'held' ? 'on hold' : 'approved'}</span></span>
        <span className="shrink-0 flex flex-col items-end gap-0.5"><span className="num t-base font-semibold">{fmtMoney(t, o.currency)}</span>{o.status === 'awaiting_approval' ? <Badge tone={pct > 100 ? 'bad' : pct > 80 ? 'warn' : 'neutral'}>{pct}% after</Badge> : <Badge tone={o.status === 'held' ? 'warn' : 'ok'} dot>{o.status === 'held' ? 'Held' : 'Approved'}</Badge>}</span>
      </button>
    );
  };

  return (
    <div>
      <PageHeader eyebrow="Head Office" title="Credit desk" meta={<Badge tone={awaiting.length ? 'warn' : 'ok'} dot>{awaiting.length} awaiting approval</Badge>}
        subtitle="Export orders wait here until a CEO approves. Local orders never do: they are cash before delivery." />

      <div className="flex flex-col gap-[var(--gap)]">
      <KpiStrip>
        <Stat label="To approve" icon={Hourglass} accent="var(--accent)" value={<>$<CountUp value={awaitingUsd} /></>} sub={<Wrap>{awaiting.length ? `${plural(awaiting.length, 'order')} · oldest ${agoLabel(awaiting[0].createdAt, s.today)}` : 'No export order is waiting'}</Wrap>} />
        <Stat label="Total receivables" icon={Landmark} accent="var(--series-1)" value={<>$<CountUp value={recvTotal} /></>} delta={<Delta value={pctChange(recvTotal, trend[6])} goodWhen="down" label="against a week ago" />} spark={trend} sub={<Wrap>{plural(exportClients.filter((r) => r.balance > 0).length, 'client')} · {plural(exportClients.reduce((t, r) => t + r.openInvoices.length, 0), 'invoice')} open</Wrap>} />
        <Stat label="Overdue" icon={ClockAlert} accent={lateRows.length ? 'var(--bad)' : 'var(--ok)'} tone={lateRows.length ? 'bad' : 'neutral'} value={<>$<CountUp value={lateTotal} /></>} sub={<Wrap>{lateRows.length ? `${plural(lateRows.length, 'client')} past terms · oldest ${Math.max(...lateRows.map((r) => r.ageDays))} d` : 'Every balance is within terms'}</Wrap>} />
        <Stat label="Top exposure" icon={Gauge} accent="var(--series-7)" tone={top && used(top) > 100 ? 'bad' : top && used(top) > 80 ? 'warn' : 'neutral'} value={top ? <><CountUp value={used(top)} /><span className="text-[var(--text-3)] font-medium">%</span></> : '—'} sub={<Wrap>{top ? `${top.client.name} · $${compact(top.balance)} of ${compact(top.client.creditLimit)}` : 'No export client yet'}</Wrap>} />
        <Stat className="max-xl:hidden" label="Credit lines used" icon={ShieldCheck} accent="var(--series-3)" value={<><CountUp value={limitTotal ? (recvTotal / limitTotal) * 100 : 0} /><span className="text-[var(--text-3)] font-medium">%</span></>} sub={<Wrap>${compact(recvTotal)} of ${compact(limitTotal)} · {plural(exportClients.length, 'client')}</Wrap>} />
      </KpiStrip>

      {/* Approval queue: orders on the left, the credit picture and the decision on the right */}
      <Panel pad={false} icon={Hourglass} title="Approval queue" sub={awaiting.length ? `${plural(awaiting.length, 'order')} · ${fmtUSD(Math.round(awaitingUsd))}` : 'clear'}
        actions={<span className="touch:hidden inline-flex items-center gap-1 t-xs text-[var(--text-3)] pr-1.5"><Kbd keys="arrowup" /><Kbd keys="arrowdown" />move</span>}>
        {queue.length === 0 || !selected || !c || !b ? <div className="p-[var(--pad)]"><Empty icon={Landmark} title="No export orders waiting" hint="Sales raises an export order; it lands here with the client's balance and ageing." /></div> : (
          <div className="grid lg:grid-cols-[300px_minmax(0,1fr)]">
            <div ref={listRef} className="lg:border-r border-[var(--line)] max-lg:border-b min-w-0">
              <div className="flex items-center gap-1.5 px-[var(--pad)] h-7 touch:h-8 bg-[var(--surface-2)] border-b border-[var(--line)] t-label">Awaiting approval<span className="num font-medium text-[var(--text-4)]">{awaiting.length}</span></div>
              {awaiting.length === 0 ? <div className="px-[var(--pad)] py-3 t-sm text-[var(--text-3)] border-b border-[var(--line)]">Nothing is waiting. New export orders land here.</div> : awaiting.map(queueRow)}
              {decided.length > 0 && <><div className="flex items-center gap-1.5 px-[var(--pad)] h-7 touch:h-8 bg-[var(--surface-2)] border-b border-[var(--line)] t-label">Decided, not yet shipped<span className="num font-medium text-[var(--text-4)]">{decided.length}</span></div>{decided.map(queueRow)}</>}
            </div>

            <div className="min-w-0 flex flex-col">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-[var(--pad)] py-3 border-b border-[var(--line)]">
                <Avatar name={c.name} size={36} />
                <div className="min-w-0 flex-1 basis-[200px]"><div className="t-lg font-semibold truncate">{c.name}</div><div className="t-sm text-[var(--text-3)] flex items-center gap-1.5 flex-wrap"><CountryTag country={c.country} /><span>{c.country} · {c.contact} · {c.creditDays}-day terms · {c.whatsapp}</span></div></div>
                <div className="flex items-center gap-1.5"><span className="code t-base font-semibold">{selected.number}</span><SiteBadge site={selected.siteId} /><Badge tone={pending ? 'warn' : selected.status === 'held' ? 'warn' : 'ok'} dot>{pending ? 'Awaiting approval' : selected.status === 'held' ? 'On hold' : 'Approved'}</Badge></div>
              </div>
              <div className="grid xl:grid-cols-2 gap-x-6 gap-y-4 p-[var(--pad)]">
                <section className="min-w-0">
                  <h3 className="t-label mb-1.5">Order lines · raised {fmtDateTime(selected.createdAt)}</h3>
                  <DataGrid dense className="shadow-none" rows={selected.lines.map((l, i) => ({ ...l, i }))} rowKey={(l) => String(l.i)} columns={[
                    { key: 'p', header: 'Product', cell: (l) => { const p = productOf(l.productId); return <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] shrink-0" style={{ background: p?.colour ?? 'var(--text-4)' }} />{p?.internalName ?? l.productId}</span>; } },
                    { key: 'b', header: 'Bundles', align: 'right', mono: true, cell: (l) => fmtNum(l.bundles) },
                    ...(wide ? [{ key: 'u', header: 'Unit price', align: 'right' as const, mono: true, cell: (l: { unitPrice: number }) => fmtMoney(l.unitPrice, selected.currency) }] : []),
                    { key: 't', header: 'Line total', align: 'right', mono: true, cell: (l) => <span className="font-medium">{fmtMoney(l.bundles * l.unitPrice, selected.currency)}</span> },
                  ]} footer={<tr><td>Order total</td><td className="text-right num">{fmtNum(selected.lines.reduce((t, l) => t + l.bundles, 0))}</td>{wide && <td />}<td className="text-right num">{fmtMoney(total, selected.currency)}</td></tr>} />
                  {selected.notes && <Note tone={afterPct > 100 ? 'warn' : 'neutral'} className="mt-2">{selected.notes}</Note>}
                  <div className="surface-2 px-3 py-1 mt-2">
                    <KV k="Ageing" v={b.openInvoices.length ? <Badge tone={b.ageDays > c.creditDays ? 'bad' : 'neutral'} dot={b.ageDays > c.creditDays}>oldest invoice {b.ageDays} d · terms {c.creditDays} d</Badge> : 'no open invoice'} />
                    <KV k="Last payment" v={b.lastPayment ? `${fmtMoney(b.lastPayment.amount, b.lastPayment.currency)} on ${fmtDayShort(b.lastPayment.at.slice(0, 10))}` : 'none on record'} />
                    <KV k="Open invoices" v={b.openInvoices.length ? `${b.openInvoices.length} · ${fmtMoney(b.openInvoices.reduce((t, i) => t + i.total, 0), c.currencyPref)}` : 'none'} />
                  </div>
                </section>
                <section className="min-w-0">
                  <h3 className="t-label mb-1.5">Credit picture</h3>
                  <CreditMeter limit={c.creditLimit} balance={b.balance} order={total} currency={c.currencyPref} />
                  <div className="surface-2 px-3 py-1 mt-3">
                    <KV k="Credit limit" v={fmtMoney(c.creditLimit, c.currencyPref)} />
                    <KV k="Balance now" v={<>{fmtMoney(b.balance, c.currencyPref)}<span className="text-[var(--text-3)] font-normal"> · {c.creditLimit ? Math.round((b.balance / c.creditLimit) * 100) : 0}%</span></>} />
                    <KV k="This order" v={fmtMoney(total, selected.currency)} />
                    <KV k="After this order" v={<span className={cn('font-semibold', afterPct > 100 && 'text-[var(--bad)]')}>{fmtMoney(after, c.currencyPref)} · {Math.round(afterPct)}%</span>} />
                  </div>
                  <Button className="mt-2" size="sm" variant="ghost" icon={MessageSquareText} onClick={() => openStatement(c)}>Send {c.contact} a statement</Button>
                </section>
              </div>
              <div className="mt-auto px-[var(--pad)] py-2.5 border-t border-[var(--line)] bg-[var(--surface-2)] lg:rounded-br-[9px] max-lg:rounded-b-[9px]">
                {pending ? <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input ref={reasonRef} value={reason} onChange={(e) => setReason(e.target.value)} className="flex-1 min-w-[200px]" aria-label="Reason"
                      placeholder={armed === 'held' ? 'What has to happen before this order can go' : armed === 'approved' ? 'Reason (optional)' : 'Reason. Sales sees it on the order; it is also kept in the audit feed'}
                      onKeyDown={(e) => { if (e.key === 'Enter' && armed) { e.preventDefault(); confirm(); } else if (e.key === 'Escape' && armed) { e.stopPropagation(); disarm(); } }} />
                    {armed ? <>
                      <Button variant="ghost" onClick={disarm}>Cancel</Button>
                      <Button variant={armed === 'approved' ? 'ok' : 'primary'} icon={armed === 'approved' ? Check : Pause} hotkey="mod+enter" onClick={confirm}>{armed === 'approved' ? `Confirm approve ${selected.number}` : `Put ${selected.number} on hold`}</Button>
                    </> : <>
                      <Button variant="ok" icon={Check} hotkey="a" hotkeyLabel="Approve the selected order" onClick={() => arm('approved')}>Approve</Button>
                      <Button variant="secondary" icon={Pause} hotkey="h" hotkeyLabel="Hold the selected order" onClick={() => arm('held')}>Hold</Button>
                    </>}
                  </div>
                  <div className="t-xs text-[var(--text-3)] mt-1.5">{armed ? <>Press <Kbd keys="enter" /> to confirm or <Kbd keys="escape" /> to go back. </> : null}{armed === 'held' ? 'Say why you are holding it: sales sees this reason on the order.' : 'Approving releases the order to the store for picking.'}</div>
                </> : (
                  <div className="t-sm text-[var(--text-2)] flex items-center gap-2 flex-wrap"><Badge tone={selected.status === 'held' ? 'warn' : 'ok'} dot>{selected.status === 'held' ? 'On hold' : 'Approved'}</Badge>{selected.approvedAt && <span>{fmtDateTime(selected.approvedAt)}</span>}{selected.approvedBy && <span className="inline-flex items-center gap-1.5"><Avatar name={s.users.find((u) => u.id === selected.approvedBy)?.name ?? '?'} size={18} />{s.users.find((u) => u.id === selected.approvedBy)?.name}</span>}{selected.status === 'held' && selected.notes && <span className="text-[var(--text-3)]">“{selected.notes}”</span>}</div>
                )}
              </div>
            </div>
          </div>
        )}
      </Panel>

      {/* Receivables ledger */}
      <Panel pad={false} icon={Landmark} title="Export receivables" sub="every export client" actions={<Button size="sm" variant="ghost" icon={Download} hotkey="e" hotkeyLabel="Export receivables as CSV" onClick={exportCsv}>Export</Button>}>
        <Toolbar className="px-[var(--pad)] pt-2.5" right={<span className="t-sm text-[var(--text-3)] num">{rows.length} of {exportClients.length}</span>}>
          <SearchInput value={q} onChange={setQ} placeholder="Search clients" />
          <Tabs value={filter} onChange={setFilter} tabs={[{ value: 'all', label: 'All', count: exportClients.length }, { value: 'balance', label: 'With a balance', count: exportClients.filter((r) => r.balance > 0).length }, { value: 'late', label: 'Past terms', count: lateRows.length }]} />
          {markets.length > 1 && <Tabs value={market} onChange={setMarket} tabs={[{ value: 'all', label: 'All markets' }, ...markets.map((m) => ({ value: m, label: m, count: exportClients.filter((r) => r.client.country === m).length }))]} />}
        </Toolbar>
        <DataGrid bare rows={rows} columns={cols} rowKey={(r) => r.client.id} onRowClick={(r) => openStatement(r.client)} selectedKey={statement?.id} empty="No client matches. Clear the search or the filter."
          footer={<tr><td colSpan={2}>Total outstanding</td><td className="text-right num">{fmtUSD(rows.reduce((t, r) => t + r.balance, 0))}</td><td colSpan={5} className="font-normal t-sm text-[var(--text-3)]">{plural(rows.filter(late).length, 'client')} past terms · select a row to preview its statement</td></tr>} />
      </Panel>
      </div>

      <Sheet open={!!statement} onClose={() => setStatement(null)} title={statement ? `Statement · ${statement.name}` : ''} sub={statement ? `${statement.whatsapp} · sent as ${user?.name ?? 'Tanaad'}` : undefined}
        footer={statement && <Button variant="ok" icon={Send} disabled={sending || !!sentId} hotkey="mod+enter" hotkeyLabel="Send the statement on WhatsApp" onClick={send}>{sentId ? `Sent · ${sentId}` : sending ? 'Sending…' : `Send to ${statement.contact} on WhatsApp`}</Button>}>
        {statement && (() => { const sb = clientBalance(s, statement.id); return (
          <div className="flex flex-col gap-3">
            <div className="surface-2 px-3 py-1">
              <KV k="Balance due" v={<span className="font-semibold">{fmtMoney(sb.balance, statement.currencyPref)}</span>} />
              <KV k="Credit limit" v={`${fmtMoney(statement.creditLimit, statement.currencyPref)} · ${statement.creditDays}-day terms`} />
              <KV k="Oldest open invoice" v={sb.openInvoices.length ? <Badge tone={sb.ageDays > statement.creditDays ? 'bad' : 'neutral'}>{sb.ageDays} days</Badge> : 'none open'} />
            </div>
            <WhatsAppPreview className="mx-auto w-full" to={`${statement.contact} · ${statement.name}`} lines={statementLines(statement)} attachment={`Statement-${statement.name.split(' ')[0]}-${s.today}.pdf`} sent={!!sentId} />
            <p className="t-xs text-[var(--text-3)]">The PDF statement is attached to the message. The text is built from the invoices and payments on record for this client.</p>
          </div>
        ); })()}
      </Sheet>
    </div>
  );
}
