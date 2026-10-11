import { useEffect, useState } from 'react';
import { AlertOctagon, CheckCircle2, Download, FileText, Lock, PackageCheck, Route, Truck } from 'lucide-react';
import type { Dispatch } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite, useGo, useQueryParam, useSiteSettings } from '@/app/hooks';
import { nowIso } from '@/data/ids';
import { addDays } from '@/data/selectors';
import { Avatar, Button, DataGrid, FormRow, Input, KpiStrip, Note, PageHeader, Badge, SearchInput, Sheet, Stat, Tabs, Toolbar, cn, useIsTouch, useMedia, type Column } from '@/components/ui';
import { CountUp } from '@/components/charts';
import { fmtDateTime, fmtKg, fmtNum } from '@/data/format';
import { QtyPad } from './kit';
import { CaptureTile, DeliveryNoteCard, IconChip, STATUS_META, ShipmentStepper, StatusBadge, VarianceBadge, deliveryStatus, downloadCsv, type DeliveryStatus } from './shared';

type Filter = 'all' | 'open' | DeliveryStatus;
interface RowT { d: Dispatch; status: DeliveryStatus; client: string; country: string; order: string }
const onRoad = (st: DeliveryStatus) => st === 'gate_pass' || st === 'in_transit';

/** Deliveries and proof of delivery: what left the gate, what the receiver counted, and where each shipment is on its way to being paid. */
export function Deliveries() {
  const s = useStore(); const site = useSite(); const go = useGo(); const touch = useIsTouch(); const wide = useMedia('(min-width: 1280px)'); const q0 = useQueryParam('q');
  const recordPod = useStore((x) => x.recordPod); const toast = useStore((x) => x.toast);
  const [filter, setFilter] = useState<Filter>('all'); const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState(q0 ?? ''); useEffect(() => { if (q0 !== undefined) setQ(q0); }, [q0]);
  const [receiver, setReceiver] = useState(''); const [counted, setCounted] = useState(''); const [signed, setSigned] = useState(false);
  const [result, setResult] = useState<{ counted: number; expected: number } | null>(null);
  const tol = useSiteSettings()?.gateTolerancePct ?? site.thresholds.gateTolerancePct;

  const all: RowT[] = s.dispatches.filter((d) => d.siteId === site.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((d) => { const o = s.orders.find((x) => x.id === d.orderId); const c = s.clients.find((x) => x.id === o?.clientId); return { d, status: deliveryStatus(d), client: c?.name ?? '—', country: c?.country ?? '', order: o?.number ?? '' }; });
  const t = q.trim().toLowerCase();
  const searched = t ? all.filter((r) => `${r.d.deliveryNoteNo} ${r.order} ${r.client} ${r.country} ${r.d.driver} ${r.d.vehicle} ${r.d.pod?.receiverName ?? ''}`.toLowerCase().includes(t)) : all;
  const match = (r: RowT, f: Filter) => f === 'all' || (f === 'open' ? onRoad(r.status) : r.status === f);
  const rows = searched.filter((r) => match(r, filter));
  const n = (f: Filter) => searched.filter((r) => match(r, f)).length;

  const road = all.filter((r) => onRoad(r.status)); const delivered = all.filter((r) => r.status === 'delivered'); const short = all.filter((r) => r.status === 'discrepancy'); const held = all.filter((r) => r.status === 'held');
  const missing = short.reduce((x, r) => x + (r.d.pod!.bundlesExpected - r.d.pod!.bundlesCounted), 0);
  const weekly = Array.from({ length: 8 }, (_, i) => { const end = addDays(s.today, -7 * (7 - i)); const start = addDays(end, -6); return all.filter((r) => r.d.pod && r.d.pod.deliveredAt.slice(0, 10) >= start && r.d.pod.deliveredAt.slice(0, 10) <= end).length; });

  const open = s.dispatches.find((d) => d.id === openId); const order = s.orders.find((o) => o.id === open?.orderId); const client = s.clients.find((c) => c.id === order?.clientId);
  const expected = open?.scannedLabelIds.length ?? 0;
  const canPod = !!open && !open.pod && (open.gateStatus === 'pass' || open.gateStatus === 'overridden');
  useEffect(() => { if (open) { setReceiver(client?.contact ?? ''); setCounted(String(open.scannedLabelIds.length)); setSigned(false); setResult(null); } }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps
  const countedN = parseInt(counted || '0', 10);

  const confirm = () => {
    if (!open || !canPod || !receiver.trim() || !counted) return;
    recordPod(open.id, { receiverName: receiver.trim() || 'Receiver', bundlesCounted: countedN, bundlesExpected: expected, deliveredAt: nowIso(), hasSignature: signed });
    setResult({ counted: countedN, expected });
    toast(countedN === expected ? { kind: 'ok', title: `${open.deliveryNoteNo} delivered`, detail: `${countedN} bundles confirmed by ${receiver}.` } : { kind: 'error', title: `${open.deliveryNoteNo}: ${expected - countedN} bundles missing`, detail: 'Exception raised for the CEO.' });
  };
  const exportCsv = () => downloadCsv(`deliveries-${site.id}-${s.today}.csv`, [['Delivery note', 'Opened', 'Order', 'Client', 'Country', 'Bundles', 'Expected kg', 'Gate kg', 'Variance %', 'Driver', 'Vehicle', 'Status', 'Received by', 'Bundles counted'], ...rows.map((r) => [r.d.deliveryNoteNo, r.d.createdAt, r.order, r.client, r.country, r.d.scannedLabelIds.length, Math.round(r.d.expectedKg), r.d.gateKg, r.d.variancePct, r.d.driver, r.d.vehicle, STATUS_META[r.status].label, r.d.pod?.receiverName, r.d.pod?.bundlesCounted])]);

  const columns: Column<RowT>[] = wide ? [
    { key: 'dn', header: 'Delivery note', sort: (r) => r.d.deliveryNoteNo, cell: (r) => <span className="code font-medium">{r.d.deliveryNoteNo}</span> },
    { key: 'at', header: 'Opened', sort: (r) => r.d.createdAt, cell: (r) => <span className="num text-[var(--text-2)]">{fmtDateTime(r.d.createdAt)}</span> },
    { key: 'c', header: 'Client', truncate: 250, sort: (r) => r.client, cell: (r) => <span className="inline-flex items-center gap-1.5"><Avatar name={r.client} size={20} />{r.client}<span className="t-sm text-[var(--text-3)]">{r.country}</span></span> },
    { key: 'b', header: 'Bundles', align: 'right', mono: true, sort: (r) => r.d.scannedLabelIds.length, cell: (r) => fmtNum(r.d.scannedLabelIds.length) },
    { key: 'e', header: 'Expected kg', align: 'right', mono: true, sort: (r) => r.d.expectedKg, cell: (r) => fmtNum(Math.round(r.d.expectedKg)) },
    { key: 'g', header: 'Gate kg', align: 'right', mono: true, sort: (r) => r.d.gateKg ?? -1, cell: (r) => (r.d.gateKg !== undefined ? <span className="font-medium">{fmtNum(r.d.gateKg)}</span> : <span className="text-[var(--text-4)]">—</span>) },
    { key: 'v', header: 'Variance', align: 'right', sort: (r) => r.d.variancePct ?? -99, cell: (r) => <VarianceBadge pct={r.d.variancePct} tolerancePct={tol} /> },
    { key: 'r', header: 'Receiver count', truncate: 190, cell: (r) => (r.d.pod ? <span><span className={cn('num font-medium', r.d.pod.bundlesCounted !== r.d.pod.bundlesExpected && 'text-[var(--bad)]')}>{r.d.pod.bundlesCounted} / {r.d.pod.bundlesExpected}</span><span className="t-sm text-[var(--text-3)]"> · {r.d.pod.receiverName}</span></span> : <span className="text-[var(--text-4)]">{onRoad(r.status) ? 'waiting for proof' : '—'}</span>) },
    { key: 's', header: 'Status', sort: (r) => STATUS_META[r.status].label, cell: (r) => <StatusBadge status={r.status} /> },
  ] : [
    { key: 'dn', header: 'Delivery note', wrap: true, cell: (r) => <div className="py-1 min-w-0"><div className="code font-medium">{r.d.deliveryNoteNo}</div><div className="t-sm text-[var(--text-3)]">{r.client}</div></div> },
    { key: 'b', header: 'Bundles · kg', align: 'right', cell: (r) => <div className="num"><div className="font-medium">{fmtNum(r.d.scannedLabelIds.length)}</div><div className="t-sm text-[var(--text-3)]">{r.d.gateKg !== undefined ? fmtNum(r.d.gateKg) : fmtNum(Math.round(r.d.expectedKg))} kg</div></div> },
    { key: 's', header: 'Status', align: 'right', cell: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader eyebrow={`${site.name} · Stock`} title="Deliveries and proof of delivery" subtitle="Every lorry that passed the gate, until the receiver counts it and the invoice is paid."
        meta={<><Badge tone="neutral">{all.length} delivery notes</Badge>{held.length > 0 && <Badge tone="bad" dot>{held.length} held at the gate</Badge>}</>}
        actions={<><Button icon={Download} hotkey="e" hotkeyLabel="Export deliveries as CSV" onClick={exportCsv} disabled={rows.length === 0}>Export</Button><Button variant="primary" icon={Truck} hotkey="n" hotkeyLabel="Load an order (dispatch and gate)" onClick={() => go.site('stock/dispatch')}>Load an order</Button></>} />

      <KpiStrip className="mb-[var(--gap)] md:grid-cols-4!">
        <Stat label="On the road" icon={Truck} accent="var(--series-1)" value={<CountUp value={road.length} />} sub={road.length ? `${fmtNum(road.reduce((x, r) => x + r.d.scannedLabelIds.length, 0))} bundles · ${fmtKg(road.reduce((x, r) => x + (r.d.gateKg ?? 0), 0))} waiting for a receiver count` : 'No lorry is out without proof of delivery'} onClick={() => setFilter('open')} />
        <Stat label="Delivered in full" icon={PackageCheck} accent="var(--series-3)" value={<CountUp value={delivered.length} />} spark={weekly} sparkColor="var(--series-3)" sub="deliveries per week · last 8 weeks" onClick={() => setFilter('delivered')} />
        <Stat label="Discrepancies" icon={AlertOctagon} accent="var(--series-8)" tone={short.length ? 'bad' : 'neutral'} value={<CountUp value={short.length} />} sub={short.length ? `${missing} bundle${missing === 1 ? '' : 's'} short at the receiver · CEO to decide` : 'Every receiver count matched the gate'} onClick={() => setFilter('discrepancy')} />
        <Stat label="Held at the gate" icon={Lock} accent="var(--series-4)" tone={held.length ? 'bad' : 'neutral'} value={<CountUp value={held.length} />} sub={held.length ? 'Lorry inside until a recount or an override' : 'No lorry is held'} onClick={() => setFilter('held')} />
      </KpiStrip>

      <Toolbar right={<span className="t-sm text-[var(--text-3)] num">{rows.length === all.length ? `${all.length} deliveries` : `${rows.length} of ${all.length}`}</span>}>
        <SearchInput value={q} onChange={setQ} placeholder="Delivery note, client, driver, receiver" />
        <Tabs value={filter} onChange={setFilter} tabs={[{ value: 'all' as Filter, label: 'All', count: n('all') }, { value: 'loading' as Filter, label: 'Loading', count: n('loading') }, { value: 'open' as Filter, label: 'On the road', count: n('open') }, { value: 'delivered' as Filter, label: 'Delivered', count: n('delivered') }, { value: 'discrepancy' as Filter, label: 'Discrepancy', count: n('discrepancy') }, { value: 'held' as Filter, label: 'Held', count: n('held') }]} />
      </Toolbar>

      <DataGrid rows={rows} columns={columns} rowKey={(r) => r.d.id} onRowClick={(r) => setOpenId(r.d.id)} selectedKey={openId} maxHeight={wide ? 'max(320px, calc(100dvh - 392px))' : undefined}
        empty={t ? `No delivery matches “${q.trim()}”${filter !== 'all' ? ' with this status' : ''}.` : filter === 'all' ? 'No deliveries yet. A delivery note appears as soon as a lorry starts loading.' : `No delivery is ${filter === 'open' ? 'on the road' : STATUS_META[filter].label.toLowerCase()} right now.`}
        footer={rows.length > 0 ? (wide
          ? <tr><td colSpan={3}>{rows.length} deliver{rows.length === 1 ? 'y' : 'ies'}</td><td className="text-right num">{fmtNum(rows.reduce((x, r) => x + r.d.scannedLabelIds.length, 0))}</td><td className="text-right num">{fmtNum(Math.round(rows.reduce((x, r) => x + r.d.expectedKg, 0)))}</td><td className="text-right num">{fmtNum(rows.reduce((x, r) => x + (r.d.gateKg ?? 0), 0))}</td><td colSpan={3} /></tr>
          : <tr><td>{rows.length} deliver{rows.length === 1 ? 'y' : 'ies'}</td><td className="text-right num">{fmtNum(rows.reduce((x, r) => x + r.d.scannedLabelIds.length, 0))}</td><td /></tr>) : undefined} />

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open ? <span className="flex items-center gap-2"><span className="code">{open.deliveryNoteNo}</span><StatusBadge status={deliveryStatus(open)} /></span> : ''} sub={open ? `${client?.name} · ${order?.number} · ${open.driver}, ${open.vehicle}` : undefined} width={520}
        footer={canPod && !result ? <><span className="t-sm text-[var(--text-3)] mr-auto touch:hidden">Counted {countedN} of {expected}</span><Button variant="primary" icon={PackageCheck} hotkey="mod+enter" disabled={!receiver.trim() || !counted} onClick={confirm}>Confirm delivery</Button></> : undefined}>
        {open && (
          <div className="flex flex-col gap-4">
            {result ? (
              <div className="rounded-lg border overflow-hidden anim-pop" style={{ borderColor: `color-mix(in srgb, ${result.counted === result.expected ? 'var(--ok)' : 'var(--bad)'} 45%, var(--line))` }}>
                <div className="flex items-center gap-3 px-3 py-2.5" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${result.counted === result.expected ? 'var(--ok)' : 'var(--bad)'} 14%, var(--surface)), var(--surface) 85%)` }}>
                  <IconChip size="lg" solid icon={result.counted === result.expected ? CheckCircle2 : AlertOctagon} color={result.counted === result.expected ? 'var(--ok)' : 'var(--bad)'} />
                  <div className="min-w-0"><div className="t-lg font-semibold">{result.counted === result.expected ? 'Delivered in full' : `${result.expected - result.counted} bundle${result.expected - result.counted === 1 ? '' : 's'} short`}</div><div className="t-sm text-[var(--text-2)]">{result.counted} of {result.expected} bundles counted by {receiver}{signed ? ', signed' : ', not signed'}.</div></div>
                </div>
                {result.counted !== result.expected && <div className="px-3 py-2 border-t border-[var(--line)] t-sm">Gate weight matched the manifest, so the bundles left the factory. An exception went to the CEO with the driver, vehicle and receiver on it.</div>}
              </div>
            ) : canPod ? (
              <section>
                <div className="t-label mb-1 flex items-center gap-1.5"><PackageCheck className="size-3.5" />Proof of delivery</div>
                <FormRow label="Receiver" required><Input value={receiver} onChange={(e) => setReceiver(e.target.value)} placeholder="Who signed for it" autoFocus={!touch} data-autofocus="" /></FormRow>
                <FormRow label="Bundles counted" required hint={countedN === expected ? `Matches the ${expected} bundles that passed the gate.` : undefined}>
                  <QtyPad value={counted} onChange={setCounted} unit="bundles" max={9999} />
                  {counted !== '' && countedN !== expected && <Note tone="bad" className="mt-2">{expected - countedN > 0 ? `${expected - countedN} bundle${expected - countedN === 1 ? '' : 's'} short of the ${expected} that passed the gate.` : `${countedN - expected} more than the ${expected} that passed the gate.`} Confirming raises an exception for the CEO.</Note>}
                </FormRow>
                <FormRow label="Signature"><CaptureTile kind="signature" done={signed} onDone={() => setSigned(true)} label={`Receiver signature · ${receiver || 'receiver'}`} /></FormRow>
              </section>
            ) : open.pod ? (
              <Note tone={open.pod.bundlesCounted === open.pod.bundlesExpected ? 'ok' : 'bad'}>Received by <b>{open.pod.receiverName}</b> on {fmtDateTime(open.pod.deliveredAt)} · {open.pod.bundlesCounted} of {open.pod.bundlesExpected} bundles{open.pod.hasSignature ? ' · signed' : ''}.</Note>
            ) : <Note tone={open.gateStatus === 'hold' ? 'bad' : 'warn'}>{open.gateStatus === 'hold' ? 'This lorry is held at the gate. Proof of delivery opens once it passes or is overridden.' : 'Still loading. Proof of delivery opens after the gate pass.'}</Note>}
            <section><div className="t-label mb-2 flex items-center gap-1.5"><Route className="size-3.5" />Shipment</div><ShipmentStepper dispatch={open} vertical /></section>
            <section><div className="t-label mb-2 flex items-center gap-1.5"><FileText className="size-3.5" />Delivery note</div><DeliveryNoteCard dispatch={open} /></section>
          </div>
        )}
      </Sheet>
    </div>
  );
}
