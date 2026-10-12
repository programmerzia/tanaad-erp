import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, Lock, PackageCheck, Plus, Receipt, ShieldCheck, Wallet, Workflow } from 'lucide-react';
import type { Order } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useQueryParam, useSite } from '@/app/hooks';
import { orderTotal } from '@/data/selectors';
import { fmtDateTime, fmtMoney, fmtNum } from '@/data/format';
import { Badge, Button, DataGrid, Kbd, KpiStrip, MiniBars, PageHeader, Panel, SearchInput, StackedBar, Stat, Tabs, Toolbar, cn, useMedia, type Column } from '@/components/ui';
import { CountUp } from '@/components/charts';
import { CASH_ROLES, ClientCell, ORDER_STATUS, StackedMoney, STAGES, STATUS_RANK, StatusBadge, Swatch, ageDays, alsoMoney, bothMoney, clientOf, dispatchOf, downloadCsv, fxLine, invoiceOf, lastWeeks, leadCur, linesSummary, matches, orderBundles, plural, productOf, shortMoney, stageOf, sumByCur, toUsd, weekOf, type StageKey } from './shared';
import { OrderInspector } from './OrderInspector';
import { NewOrderSheet } from './NewOrder';

type Filter = StageKey | 'all';

/** Order flow for one site: cash-before-delivery lock for local buyers, CEO approval for export credit, then pick → gate → deliver → invoice → pay. */
export function Orders() {
  const s = useStore(); const site = useSite(); const role = s.session?.role ?? ''; const wide = useMedia('(min-width: 900px)'); const roomy = useMedia('(min-width: 1360px)');
  const q0 = useQueryParam('q'); const clientParam = useQueryParam('client');
  const [q, setQ] = useState(q0 ?? ''); const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null); const [creating, setCreating] = useState<{ clientId?: string } | null>(null);
  useEffect(() => { if (q0 !== undefined) { setQ(q0); setFilter('all'); } }, [q0]);
  useEffect(() => { if (clientParam) setCreating({ clientId: clientParam }); }, [clientParam]);

  const all = useMemo(() => s.orders.filter((o) => o.siteId === site.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((o) => {
    const client = clientOf(s, o.clientId); const inv = invoiceOf(s, o.id); const dsp = dispatchOf(s, o.id);
    return { o, client, inv, dsp, total: orderTotal(o), bundles: orderBundles(o), stage: stageOf(o.status) };
  }), [s, site.id]);
  type R = (typeof all)[number];
  const inStage = (k: StageKey) => all.filter((r) => r.stage.key === k);
  const searched = q.trim() ? all.filter((r) => matches(q, r.o.number, r.client?.name, r.client?.country, r.client?.contact, r.inv?.number, r.dsp?.deliveryNoteNo, linesSummary(s, r.o), ORDER_STATUS[r.o.status].label)) : all;
  const rows = filter === 'all' ? searched : searched.filter((r) => r.stage.key === filter);
  const open = all.find((r) => r.o.id === openId)?.o; const overlay = !!open || !!creating;
  const toggle = (k: StageKey) => setFilter((f) => (f === k ? 'all' : k));
  const money = (list: R[]) => sumByCur(list, (r) => r.total, (r) => r.o.currency);

  // KPI figures
  const cash = inStage('cash'); const approval = inStage('approval'); const load = inStage('load'); const toInvoice = inStage('toInvoice'); const unpaid = inStage('unpaid');
  const cashBy = money(cash); const apprBy = money(approval); const toInvBy = money(toInvoice);
  const unpaidBy = sumByCur(unpaid, (r) => (r.inv?.total ?? r.total) - s.payments.filter((p) => r.inv && p.invoiceId === r.inv.id).reduce((t, p) => t + p.amount, 0), (r) => r.o.currency);
  const oldestUnpaid = Math.max(0, ...unpaid.map((r) => (r.inv ? ageDays(s.today, r.inv.issuedAt) : 0)));
  const overdue = unpaid.filter((r) => r.inv && r.client && ageDays(s.today, r.inv.issuedAt) > r.client.creditDays).length;
  const cCash = leadCur(cashBy, site.currencyPrimary); const cAppr = leadCur(apprBy, 'USD'); const cUnpaid = leadCur(unpaidBy, 'USD');
  const active = (k: StageKey) => (filter === k ? '!border-[var(--brand)] !bg-[var(--selected)]' : undefined);

  // Bundles ordered per week
  const weeks = lastWeeks(s.today, 8);
  const weekly = weeks.map((w, i) => ({ label: w.label, partial: w.partial, value: all.filter((r) => weekOf(weeks, r.o.createdAt) === i).reduce((t, r) => t + r.bundles, 0) }));

  const cols: Column<R>[] = wide ? [
    { key: 'no', header: 'Order', sort: (r) => r.o.number, cell: (r) => <span className="code font-medium">{r.o.number}</span> },
    { key: 'client', header: 'Client', sort: (r) => r.client?.name ?? '', cell: (r) => <ClientCell name={r.client?.name ?? '?'} width={roomy ? 230 : 190} /> },
    ...(roomy ? [{ key: 'market', header: 'Market', sort: (r: R) => `${r.client?.channel}${r.client?.country}`, cell: (r: R) => <span>{r.client?.country}<span className="text-[var(--text-3)]"> · {r.client?.channel === 'export' ? 'export' : 'local'}</span></span> } as Column<R>] : []),
    { key: 'lines', header: 'Lines', truncate: 230, cell: (r) => <span className="inline-flex items-center gap-1.5"><span className="inline-flex gap-0.5">{r.o.lines.slice(0, 4).map((l, i) => <Swatch key={i} colour={productOf(s, l.productId)?.colour} className="!size-2" />)}</span><span className="text-[var(--text-2)]" title={linesSummary(s, r.o)}>{linesSummary(s, r.o)}</span></span> },
    { key: 'bundles', header: 'Bundles', align: 'right', mono: true, sort: (r) => r.bundles, cell: (r) => fmtNum(r.bundles) },
    { key: 'total', header: 'Total', align: 'right', mono: true, sort: (r) => toUsd(r.total, r.o.currency, r.o.fxReference), cell: (r) => <span className="font-medium">{fmtMoney(r.total, r.o.currency)}</span> },
    { key: 'created', header: 'Created', mono: true, sort: (r) => r.o.createdAt, cell: (r) => <span className="text-[var(--text-2)]">{fmtDateTime(r.o.createdAt)}</span> },
    { key: 'status', header: 'Status', sort: (r) => STATUS_RANK[r.o.status] * 10 + STAGES.indexOf(r.stage), cell: (r) => (r.o.status === 'awaiting_cash' ? <Badge tone="warn"><Lock className="size-3" />Awaiting cashier</Badge> : <StatusBadge status={r.o.status} />) },
  ] : [
    { key: 'no', header: 'Order', wrap: true, cell: (r) => <div className="min-w-0 py-1"><div className="flex items-center gap-1.5"><span className="code font-medium">{r.o.number}</span>{r.o.status === 'awaiting_cash' && <Lock className="size-3.5 text-[var(--warn)]" aria-label="Awaiting cashier" />}</div><div className="t-sm text-[var(--text-2)] truncate max-w-[42vw]">{r.client?.name}</div></div> },
    { key: 'total', header: 'Total', align: 'right', wrap: true, cell: (r) => <div className="flex flex-col items-end gap-1 py-1"><span className="num font-medium whitespace-nowrap">{fmtMoney(r.total, r.o.currency)}</span><StatusBadge status={r.o.status} /></div> },
  ];
  const shownBy = money(rows);
  const exportCsv = () => downloadCsv(`orders-${site.id}-${s.today}.csv`, ['Order', 'Client', 'Country', 'Channel', 'Lines', 'Bundles', 'Total', 'Currency', 'Created', 'Status', 'Invoice', 'Delivery note'],
    rows.map((r) => [r.o.number, r.client?.name ?? '', r.client?.country ?? '', r.client?.channel ?? '', linesSummary(s, r.o), r.bundles, r.total, r.o.currency, r.o.createdAt, ORDER_STATUS[r.o.status].label, r.inv?.number ?? '', r.dsp?.deliveryNoteNo ?? '']));

  return (
    <div>
      <PageHeader eyebrow={`Sales · ${site.name}`} title="Orders"
        meta={<><Badge tone="neutral">{plural(all.length, 'order')}</Badge><Badge tone="neutral" className="num">{fxLine(s.fx)}</Badge></>}
        subtitle="Local orders unlock for dispatch on cash, export orders on CEO approval."
        actions={<>
          <Button icon={Download} onClick={exportCsv} hotkey={overlay ? undefined : 'e'} hotkeyLabel="Export orders to CSV">Export</Button>
          <Button variant="primary" icon={Plus} onClick={() => setCreating({})} hotkey={overlay ? undefined : 'n'}>New order</Button>
        </>} />

      <KpiStrip className="mb-[var(--gap)]">
        <Stat label="Awaiting cash" icon={Lock} accent={STAGES[0].color} className={active('cash')} onClick={() => toggle('cash')}
          value={<CountUp value={cashBy[cCash]} format={(n) => shortMoney(n, cCash)} />}
          sub={cash.length ? `${plural(cash.length, 'order')} · warehouse locked ${alsoMoney(cashBy, cCash)}` : 'No order is waiting for cash'} />
        <Stat label="Awaiting CEO approval" icon={ShieldCheck} accent={STAGES[1].color} className={active('approval')} onClick={() => toggle('approval')}
          value={<CountUp value={apprBy[cAppr]} format={(n) => shortMoney(n, cAppr)} />}
          sub={approval.length ? `${plural(approval.length, 'export order')} · credit desk ${alsoMoney(apprBy, cAppr)}` : 'None at the credit desk'} />
        <Stat label="Ready to load" icon={PackageCheck} accent={STAGES[2].color} className={active('load')} onClick={() => toggle('load')}
          value={<><CountUp value={load.length} /><span className="t-base font-medium text-[var(--text-3)]"> {load.length === 1 ? 'order' : 'orders'}</span></>}
          sub={load.length ? `${plural(load.reduce((t, r) => t + r.bundles, 0), 'bundle')} · ${load.filter((r) => r.o.status === 'picking').length} being picked` : 'Nothing waiting at the store'} />
        <Stat label="Dispatched, not invoiced" icon={Receipt} accent={STAGES[3].color} tone={toInvoice.length ? 'warn' : 'neutral'} className={active('toInvoice')} onClick={() => toggle('toInvoice')}
          value={<><CountUp value={toInvoice.length} /><span className="t-base font-medium text-[var(--text-3)]"> {toInvoice.length === 1 ? 'order' : 'orders'}</span></>}
          sub={toInvoice.length ? `${bothMoney(toInvBy)} to invoice` : 'All dispatches invoiced'} />
        <Stat label="Invoiced, unpaid" icon={Wallet} accent={STAGES[4].color} tone={overdue ? 'bad' : 'neutral'} className={active('unpaid')} onClick={() => toggle('unpaid')}
          value={<CountUp value={unpaidBy[cUnpaid]} format={(n) => shortMoney(n, cUnpaid)} />}
          sub={unpaid.length ? `${plural(unpaid.length, 'invoice')} · oldest ${oldestUnpaid} days${overdue ? ` · ${overdue} past terms` : ''} ${alsoMoney(unpaidBy, cUnpaid)}` : 'Nothing outstanding'} />
      </KpiStrip>

      <div className="grid gap-[var(--gap)] lg:grid-cols-[minmax(0,1fr)_340px] mb-[var(--gap)]">
        <Panel icon={Workflow} title="Order pipeline" sub={`${plural(all.length, 'order')} by stage`}>
          <StackedBar height={12} legend={false} segments={STAGES.map((st) => ({ label: st.label, value: inStage(st.key).length, color: st.color }))} />
          <div className="@container"><div className="mt-2 grid gap-x-2 gap-y-1 grid-cols-2 @md:grid-cols-4 @2xl:grid-cols-7 items-stretch">
            {STAGES.map((st) => { const list = inStage(st.key); return (
              <button key={st.key} type="button" onClick={() => toggle(st.key)} aria-pressed={filter === st.key} title={`Show ${st.label.toLowerCase()}`} className={cn('flex flex-col items-stretch justify-start text-left min-w-0 rounded-md px-2 py-1 hover:bg-[var(--hover)]', filter === st.key && 'bg-[var(--selected)]')}>
                <span className="flex items-center gap-1.5 t-xs text-[var(--text-2)]"><span className="size-2 rounded-[2px] shrink-0" style={{ background: st.color }} /><span className="truncate">{st.short}</span></span>
                <span className={cn('block num t-lg font-semibold', !list.length && 'text-[var(--text-4)]')}>{list.length}</span>
                {(['USD', 'UGX'] as const).filter((c) => money(list)[c] > 0).map((c) => <span key={c} className="block num t-xs text-[var(--text-3)] truncate">{shortMoney(money(list)[c], c)}</span>)}
              </button>
            ); })}
          </div></div>
        </Panel>
        <Panel icon={BarChart3} title="Bundles ordered" sub="per week · last 8 weeks">
          <MiniBars height={44} data={weekly} format={(n) => `${fmtNum(n)} bundles`} />
        </Panel>
      </div>

      <Toolbar right={<span className="t-sm text-[var(--text-3)] num">{rows.length === all.length ? plural(all.length, 'order') : `${rows.length} of ${all.length}`}</span>}>
        <SearchInput value={q} onChange={setQ} placeholder="Search order, client, product…" />
        <Tabs value={filter} onChange={setFilter} tabs={[{ value: 'all' as Filter, label: 'All', count: searched.length }, ...STAGES.map((st) => ({ value: st.key as Filter, label: st.tab, count: searched.filter((r) => r.stage.key === st.key).length }))]} />
      </Toolbar>

      <DataGrid rows={rows} columns={cols} rowKey={(r) => r.o.id} onRowClick={(r) => setOpenId(r.o.id)} selectedKey={openId} maxHeight={wide ? 520 : undefined}
        rowClassName={(r) => (r.o.status === 'held' ? 'text-[var(--text-3)]' : undefined)}
        empty={q.trim() ? `No order matches “${q.trim()}”${filter !== 'all' ? ' in this stage' : ''}.` : filter === 'cash' ? 'No order is waiting for cash. New local orders appear here until the cashier records it.' : filter === 'approval' ? 'No export order is waiting for the CEO.' : filter === 'held' ? 'No orders are held.' : 'No orders in this stage. They move here automatically as they progress.'}
        footer={rows.length > 0 ? (wide
          ? <tr><td colSpan={roomy ? 4 : 3}>{plural(rows.length, 'order')}</td><td className="text-right num">{fmtNum(rows.reduce((t, r) => t + r.bundles, 0))}</td><td className="text-right py-1"><StackedMoney by={shownBy} /></td><td colSpan={2} /></tr>
          : <tr><td>{plural(rows.length, 'order')}</td><td className="text-right py-1"><StackedMoney by={shownBy} /></td></tr>) : undefined} />
      {CASH_ROLES.includes(role) && cash.length > 0 && <p className="t-xs text-[var(--text-3)] mt-2 touch:hidden">Open an order that is awaiting cash with <Kbd keys="enter" /> then press <Kbd keys="mod+enter" /> to record it.</p>}

      {open && <OrderInspector key={open.id} order={open} onClose={() => setOpenId(null)} />}
      {creating && <NewOrderSheet initialClientId={creating.clientId} onClose={() => setCreating(null)} onCreated={(o: Order) => { setCreating(null); setFilter('all'); setQ(''); setOpenId(o.id); }} />}
    </div>
  );
}
