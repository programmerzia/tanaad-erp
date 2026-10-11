import { useState } from 'react';
import { AlertTriangle, Check, ExternalLink, ListChecks, Lock, PackageCheck, Receipt, Route, ScrollText, Truck, Wallet } from 'lucide-react';
import type { Order } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useGo, useRefList, useSite } from '@/app/hooks';
import { orderTotal } from '@/data/selectors';
import { fmtDateTime, fmtKg, fmtMoney, fmtNum, fmtPct } from '@/data/format';
import { Avatar, Badge, Bar, Button, ChipGroup, DataGrid, Field, Gauge, Note, NumberPad, Panel, Sheet, cn, useHotkey, type Column } from '@/components/ui';
import { CASH_ROLES, Fact, ORDER_STATUS, STATUS_RANK, StatusBadge, Swatch, clientOf, dispatchOf, fxLine, invoiceOf, marketOf, orderBundles, plural, productOf, termsOf } from './shared';

interface Step { label: string; sub?: string; at?: string; done: boolean; bad?: boolean }

/** Vertical shipment track: order → cash or approval → picking → gate → delivered → invoiced → paid. */
function ShipmentTracker({ steps }: { steps: Step[] }) {
  const current = steps.findIndex((x) => !x.done);
  return (
    <ol className="px-[var(--pad)] py-3">
      {steps.map((st, i) => {
        const now = i === current; const last = i === steps.length - 1;
        return (
          <li key={st.label} className="flex gap-3">
            <div className="flex flex-col items-center shrink-0">
              <span className={cn('size-5 rounded-full grid place-items-center border-2 shrink-0', st.bad ? 'bg-[var(--bad)] border-[var(--bad)] text-white' : st.done ? 'bg-[var(--brand)] border-[var(--brand)] text-[var(--brand-contrast)]' : now ? 'border-[var(--accent)] bg-[var(--surface)]' : 'border-[var(--line-2)] bg-[var(--surface)]')}>
                {st.bad ? <AlertTriangle className="size-3" strokeWidth={2.5} /> : st.done ? <Check className="size-3" strokeWidth={3} /> : now ? <span className="size-1.5 rounded-full bg-[var(--accent)] anim-live" /> : null}
              </span>
              {!last && <span className={cn('w-0.5 flex-1 min-h-3 my-0.5 rounded-full', st.done && !st.bad ? 'bg-[var(--brand)]' : 'bg-[var(--line)]')} />}
            </div>
            <div className={cn('min-w-0 flex-1', !last && 'pb-2.5')}>
              <div className="flex items-center gap-2">
                <span className={cn('t-base font-medium', !st.done && !now && 'text-[var(--text-3)]', st.bad && 'text-[var(--bad)]')}>{st.label}</span>
                {now && <Badge tone="accent">Now</Badge>}
                {st.at && <span className="ml-auto num t-xs text-[var(--text-3)] whitespace-nowrap">{fmtDateTime(st.at)}</span>}
              </div>
              {st.sub && <div className={cn('t-sm', st.done || now ? 'text-[var(--text-2)]' : 'text-[var(--text-4)]')}>{st.sub}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Order inspector: who, what, where it is on the track, and the one action this stage allows. */
export function OrderInspector({ order, onClose }: { order: Order; onClose: () => void }) {
  const s = useStore(); const site = useSite(); const go = useGo(); const role = s.session?.role ?? '';
  const client = clientOf(s, order.clientId)!; const dsp = dispatchOf(s, order.id); const inv = invoiceOf(s, order.id);
  const total = orderTotal(order); const bundles = orderBundles(order); const rank = STATUS_RANK[order.status];
  const paidOnInv = inv ? s.payments.filter((p) => p.invoiceId === inv.id).reduce((t, p) => t + p.amount, 0) : 0;
  const [mode, setMode] = useState<'view' | 'cash' | 'pay'>('view'); const [amount, setAmount] = useState('');
  // Payment methods are master data (Settings → Master data: `payment_method`). Cash-before-delivery orders settle with the first one.
  const methods = useRefList('payment_method').map((m) => m.label);
  const [method, setMethod] = useState<string | null>((client.channel === 'export' ? methods[methods.length - 1] : methods[0]) ?? null);
  const toast = useStore.getState().toast; const canCash = CASH_ROLES.includes(role);

  const recordCash = () => {
    const amt = Number(amount); if (!amt) return;
    useStore.getState().addCashEntry({ siteId: site.id, day: s.today, direction: 'in', category: 'sale', amount: amt, currency: order.currency, payee: client.name, note: `${order.number} · cash before delivery`, hasReceiptPhoto: false });
    useStore.getState().confirmCash(order.id);
    toast({ kind: 'ok', title: 'Dispatch unlocked', detail: `${fmtMoney(amt, order.currency)} received from ${client.name} for ${order.number}` }); setMode('view');
  };
  const issue = () => {
    const i = useStore.getState().issueInvoice(order.id);
    if (order.cashConfirmedAt) { useStore.getState().recordPayment({ clientId: client.id, invoiceId: i.id, amount: i.total, currency: i.currency, method: methods[0] ?? 'Cash', reference: `${order.number} cash on order` }); toast({ kind: 'ok', title: `${i.number} issued and settled`, detail: 'Cash was confirmed before delivery.' }); }
    else toast({ kind: 'ok', title: `${i.number} issued`, detail: `${fmtMoney(i.total, i.currency)} · ${client.creditDays} days credit` });
  };
  const recordPay = () => {
    const amt = Number(amount); if (!amt || !inv || !method) return;
    useStore.getState().recordPayment({ clientId: client.id, invoiceId: inv.id, amount: amt, currency: inv.currency, method, reference: `${method.split(/\s+/).map((w) => w[0]).join('').toUpperCase()}-${String(Date.now()).slice(-6)}` });
    toast({ kind: 'ok', title: 'Payment recorded', detail: `${fmtMoney(amt, inv.currency)} from ${client.name} by ${method}` }); setMode('view');
  };
  const startCash = () => { setAmount(String(Math.round(total))); setMode('cash'); };
  const startPay = () => { if (!inv) return; setAmount(inv.currency === 'USD' ? String(Math.round((inv.total - paidOnInv) * 100) / 100) : String(Math.round(inv.total - paidOnInv))); setMode('pay'); };
  // The amount field confirms on Enter by itself; this covers Ctrl+Enter from anywhere else in the sheet.
  useHotkey('mod+enter', (e) => { if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return; if (mode === 'cash') recordCash(); else recordPay(); }, { label: mode === 'cash' ? 'Confirm cash' : 'Record payment', enabled: mode !== 'view', allowInInput: true });

  const steps: Step[] = [
    { label: 'Order created', sub: `${plural(order.lines.length, 'line')} · ${plural(bundles, 'bundle')} · ${fmtMoney(total, order.currency)}`, at: order.createdAt, done: true },
    client.channel === 'local'
      ? { label: 'Cash confirmed by cashier', sub: order.cashConfirmedAt ? 'Dispatch unlocked' : 'Warehouse locked until cash is in', at: order.cashConfirmedAt, done: rank >= 1 }
      : { label: 'CEO approval', sub: order.status === 'held' ? `Held${order.notes ? `: ${order.notes}` : ''}` : order.approvedAt ? `Approved by ${s.users.find((u) => u.id === order.approvedBy)?.name ?? 'the CEO'}` : 'Waiting at the group credit desk', at: order.approvedAt, done: rank >= 1, bad: order.status === 'held' },
    { label: 'Picking', sub: dsp ? `Delivery note ${dsp.deliveryNoteNo} · ${dsp.scannedLabelIds.length} of ${bundles} bundles scanned` : 'Storekeeper scans each bundle', at: dsp?.createdAt, done: rank >= 3 },
    { label: 'Gate passed', sub: dsp?.gateKg !== undefined ? `${fmtKg(dsp.gateKg)} at the gate against ${fmtKg(dsp.expectedKg)} expected · ${fmtPct(dsp.variancePct ?? 0, true)}${dsp.gateStatus === 'overridden' ? ' · override' : dsp.gateStatus === 'hold' ? ' · held at the gate' : ''}` : dsp ? `Expected ${fmtKg(dsp.expectedKg)}` : 'Weighbridge check against expected weight', at: dsp?.gatePassedAt, done: rank >= 3, bad: dsp?.gateStatus === 'hold' },
    { label: 'Delivered', sub: dsp?.pod ? `${dsp.pod.receiverName} counted ${dsp.pod.bundlesCounted} of ${dsp.pod.bundlesExpected}` : 'Receiver confirms the count', at: dsp?.pod?.deliveredAt, done: rank >= 4, bad: dsp?.pod ? dsp.pod.bundlesCounted !== dsp.pod.bundlesExpected : false },
    { label: 'Invoiced', sub: inv ? `${inv.number} · ${fmtMoney(inv.total, inv.currency)} · EFRIS pending` : 'Invoice PDF to WhatsApp · fiscalised through EFRIS once connected', at: inv?.issuedAt, done: rank >= 5 },
    { label: 'Paid', sub: rank >= 6 ? `${fmtMoney(paidOnInv || total, order.currency)} received` : inv ? `${fmtMoney(inv.total - paidOnInv, inv.currency)} outstanding` : undefined, done: rank >= 6 },
  ];
  const doneCount = steps.filter((x) => x.done).length; const currentStep = steps.find((x) => !x.done);

  type L = Order['lines'][number] & { i: number };
  const lineCols: Column<L>[] = [
    { key: 'p', header: 'Product', truncate: 200, cell: (l) => { const p = productOf(s, l.productId); return <span className="inline-flex items-center gap-2"><Swatch colour={p?.colour} /><span className="font-medium">{p?.internalName ?? l.productId}</span></span>; } },
    { key: 'b', header: 'Bundles', align: 'right', mono: true, cell: (l) => fmtNum(l.bundles) },
    { key: 'pc', header: 'Pieces', align: 'right', mono: true, cell: (l) => <span className="text-[var(--text-2)]">{fmtNum(l.bundles * (productOf(s, l.productId)?.bundlePieces ?? 1))}</span> },
    { key: 'u', header: 'Per bundle', align: 'right', mono: true, cell: (l) => fmtMoney(l.unitPrice, order.currency) },
    { key: 'a', header: 'Amount', align: 'right', mono: true, cell: (l) => <span className="font-medium">{fmtMoney(l.bundles * l.unitPrice, order.currency)}</span> },
  ];

  const primary = mode !== 'view' ? null
    : order.status === 'awaiting_cash' && canCash ? <Button variant="primary" icon={Wallet} onClick={startCash} hotkey="mod+enter">Record cash received</Button>
    : order.status === 'awaiting_approval' && role === 'ceo' ? <Button variant="primary" icon={ExternalLink} onClick={() => go.group('credit')} hotkey="mod+enter">Open credit desk</Button>
    : order.status === 'approved' || order.status === 'picking' ? <Button variant="primary" icon={Truck} onClick={() => go.site('stock/dispatch')} hotkey="mod+enter">Open dispatch</Button>
    : order.status === 'dispatched' || order.status === 'delivered' ? <Button variant="primary" icon={Receipt} onClick={issue} hotkey="mod+enter">Issue invoice</Button>
    : order.status === 'invoiced' && inv ? <Button variant="primary" icon={Wallet} onClick={startPay} hotkey="mod+enter">Record payment</Button>
    : null;

  return (
    <Sheet open onClose={onClose} width={580}
      title={<span className="flex items-center gap-2"><span className="code">{order.number}</span><StatusBadge status={order.status} /></span>}
      sub={`Created ${fmtDateTime(order.createdAt)} · ${fxLine(order.fxReference)}`}
      footer={<>
        {inv && mode === 'view' && <Button variant="ghost" icon={ScrollText} className="mr-auto" onClick={() => go.site('sales/invoices', undefined, inv.number)}>Invoice {inv.number}</Button>}
        {mode !== 'view' && <Button variant="ghost" onClick={() => setMode('view')}>Cancel</Button>}
        {mode === 'view' && <Button variant="secondary" onClick={onClose}>Close</Button>}
        {primary}
      </>}>
      <div className="flex flex-col gap-[var(--gap)]">
        {/* Who and how much */}
        <div className="flex items-center gap-3">
          <Avatar name={client.name} size={40} />
          <div className="min-w-0 flex-1">
            <div className="t-lg font-semibold truncate">{client.name}</div>
            <div className="t-sm text-[var(--text-2)] truncate">{marketOf(client)} · {termsOf(client)} · <span className="num">{client.whatsapp}</span></div>
          </div>
          <div className="text-right shrink-0">
            <div className="num t-kpi">{fmtMoney(total, order.currency)}</div>
            <div className="t-xs text-[var(--text-3)]">{plural(order.lines.length, 'line')} · {plural(bundles, 'bundle')}</div>
          </div>
        </div>

        {order.status === 'awaiting_cash' && mode === 'view' && <Note tone="warn" icon={Lock}><b>Awaiting cashier confirmation.</b> The warehouse cannot start picking until cash of {fmtMoney(total, order.currency)} is recorded.{!canCash && ' Ask the cashier to record the cash.'}</Note>}
        {order.status === 'awaiting_approval' && <Note tone="warn"><b>Waiting for the CEO.</b> Export credit is approved at the group credit desk; this order unlocks automatically. {order.notes && <span className="text-[var(--text-2)]">{order.notes}</span>}</Note>}
        {order.status === 'held' && <Note tone="bad"><b>Held by the CEO.</b> {order.notes ?? 'No reason recorded.'}</Note>}

        {mode === 'cash' && (
          <Panel icon={Wallet} title="Record cash received" sub={`from ${client.name}`}>
            <div className="max-w-[380px]">
              <NumberPad autoFocus label={`Amount received · order total ${fmtMoney(total, order.currency)}`} suffix={order.currency} value={amount} onChange={setAmount} onDone={recordCash} doneLabel="Confirm cash" />
              <div className="t-xs text-[var(--text-3)] mt-2">Confirming adds the cash to today's cash day and unlocks the order for dispatch.</div>
            </div>
          </Panel>
        )}
        {mode === 'pay' && inv && (
          <Panel icon={Wallet} title="Record payment" sub={`against ${inv.number}`}>
            <div className="max-w-[380px] flex flex-col gap-3">
              <Field label="Method">{methods.length ? <ChipGroup ariaLabel="Payment method" size="sm" options={methods.map((m) => ({ value: m, label: m }))} value={method} onChange={setMethod} /> : <span className="t-sm text-[var(--text-3)]">No payment methods set up. <button type="button" className="underline underline-offset-2 hover:text-[var(--text)]" onClick={() => go.site('settings')}>Add them in Settings → Master data</button></span>}</Field>
              <NumberPad autoFocus label={`Amount · ${fmtMoney(inv.total - paidOnInv, inv.currency)} outstanding`} suffix={inv.currency} value={amount} onChange={setAmount} onDone={recordPay} doneLabel="Record payment" allowDecimal={inv.currency === 'USD'} />
            </div>
          </Panel>
        )}

        <Panel icon={Route} title="Shipment tracker" sub={currentStep ? `Next: ${currentStep.label.toLowerCase()}` : 'Complete'} pad={false}
          actions={<span className="flex items-center gap-2 pr-2"><span className="w-16 block"><Bar value={doneCount} max={steps.length} tone={doneCount === steps.length ? 'ok' : 'series'} /></span><span className="num t-sm text-[var(--text-2)]">{doneCount}/{steps.length}</span></span>}>
          <ShipmentTracker steps={steps} />
        </Panel>

        <Panel icon={ListChecks} title="Lines" sub={`${plural(order.lines.length, 'product')} · ${ORDER_STATUS[order.status].next.toLowerCase()}`} pad={false}
          footer={<span className="num">Exchange reference on this order: {fxLine(order.fxReference)}</span>}>
          <DataGrid bare dense rows={order.lines.map((l, i) => ({ ...l, i }))} columns={lineCols} rowKey={(l) => String(l.i)}
            footer={<tr><td>Total</td><td className="text-right num">{fmtNum(bundles)}</td><td /><td /><td className="text-right num">{fmtMoney(total, order.currency)}</td></tr>} />
        </Panel>

        <Panel icon={PackageCheck} title="Delivery note and gate" sub={dsp ? undefined : 'not loaded yet'} pad={false}
          actions={dsp ? <span className="pr-2"><Badge tone={dsp.gateStatus === 'pass' ? 'ok' : dsp.gateStatus === 'hold' ? 'bad' : dsp.gateStatus === 'overridden' ? 'warn' : 'neutral'} dot>{dsp.gateStatus === 'pass' ? 'Gate passed' : dsp.gateStatus === 'hold' ? 'Held at the gate' : dsp.gateStatus === 'overridden' ? 'Passed on override' : 'Not weighed yet'}</Badge></span> : undefined}>
          {dsp ? <>
            <Fact label="Delivery note"><span className="code font-medium">{dsp.deliveryNoteNo}</span></Fact>
            <Fact label="Lorry and driver">{dsp.vehicle} · {dsp.driver}</Fact>
            <Fact label="Bundles scanned"><span className="num">{dsp.scannedLabelIds.length} of {bundles}</span></Fact>
            <Fact label="Expected weight"><span className="num">{fmtKg(dsp.expectedKg)}</span></Fact>
            <Fact label="Gate weight">{dsp.gateKg !== undefined ? <span className="num">{fmtKg(dsp.gateKg)}</span> : <span className="text-[var(--text-3)]">Not weighed yet</span>}</Fact>
            <div className="px-[var(--pad)] py-3">
              <div className="flex items-baseline justify-between mb-2"><span className="t-sm font-medium text-[var(--text-2)]">Gate variance</span><span className={cn('num t-base font-semibold', dsp.variancePct !== undefined && Math.abs(dsp.variancePct) > site.thresholds.gateTolerancePct && 'text-[var(--bad)]')}>{dsp.variancePct !== undefined ? fmtPct(dsp.variancePct, true) : '—'} <span className="font-normal text-[var(--text-3)]">· tolerance ±{site.thresholds.gateTolerancePct}%</span></span></div>
              <Gauge variancePct={dsp.variancePct} tolerancePct={site.thresholds.gateTolerancePct} width={520} />
              {dsp.overrideReason && <div className="t-sm text-[var(--text-2)] mt-2">Override: {dsp.overrideReason}</div>}
            </div>
          </> : <div className="px-[var(--pad)] py-3 t-sm text-[var(--text-3)]">The delivery note number is assigned when the storekeeper starts loading. The gate then weighs the lorry against the expected cargo weight (±{site.thresholds.gateTolerancePct}%).</div>}
        </Panel>

        {order.notes && order.status !== 'held' && order.status !== 'awaiting_approval' && <Note tone="neutral">{order.notes}</Note>}
      </div>
    </Sheet>
  );
}
