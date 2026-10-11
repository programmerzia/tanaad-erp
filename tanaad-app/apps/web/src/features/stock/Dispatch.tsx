import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowRight, ClipboardList, ExternalLink, FileText, History, Lock, MapPin, Play, Route, Scale, ShoppingCart, Truck } from 'lucide-react';
import type { Dispatch as DispatchRec, Order } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite, useGo, useQueryParam, useRefList, useSiteSettings } from '@/app/hooks';
import { Avatar, Badge, Button, ChipGroup, Combobox, DataGrid, Empty, FormRow, Input, Panel, SearchInput, Sheet, StackedBar, Tabs, Toolbar, cn, useHotkey, useIsTouch, useMedia, type Column } from '@/components/ui';
import { CountUp } from '@/components/charts';
import { SITE_COLOR } from '@/config/siteIdentity';
import { fmtDateTime, fmtKg, fmtNum, fmtPct, fmtTime } from '@/data/format';
import { CargoBuilder, ManifestTable, manifestLines, type CargoActions } from './CargoBuilder';
import { SetupHint } from './kit';
import { DeliveryNoteCard, FlowSteps, GATE_META, GateBadge, HeroStat, IconChip, ProductName, ShipmentStepper, StockStyles, VarianceBadge, gatePassNo, nextDeliveryNoteNo, type FlowStep } from './shared';

const WAITING: Partial<Record<Order['status'], string>> = { awaiting_cash: 'Awaiting cash', awaiting_approval: 'Waiting for CEO' };
type GateFilter = 'all' | DispatchRec['gateStatus'];

/** Dispatch and gate: pick an order, build the cargo by scanning, weigh out, let the arithmetic issue (or refuse) the gate pass. */
export function Dispatch() {
  const s = useStore(); const site = useSite(); const go = useGo(); const touch = useIsTouch(); const q0 = useQueryParam('q');
  const startDispatch = useStore((x) => x.startDispatch); const toast = useStore((x) => x.toast);
  const [tab, setTab] = useState<'build' | 'history'>(q0 ? 'history' : 'build');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [dispatchId, setDispatchId] = useState<string | null>(null);
  const wide = useMedia('(min-width: 1280px)'); const phone = useMedia('(max-width: 639px)');
  const vehicles = useRefList('vehicle'); const settings = useSiteSettings();
  const [driver, setDriver] = useState(''); const [vehicle, setVehicle] = useState<string | null>(null);
  const driverRef = useRef<HTMLInputElement>(null); const vehicleBox = useRef<HTMLDivElement>(null);
  const [noteOf, setNoteOf] = useState<DispatchRec | null>(null);
  const [q, setQ] = useState(q0 ?? ''); const [gate, setGate] = useState<GateFilter>('all');
  const actions = useRef<CargoActions>({}); const listRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => { if (q0 !== undefined) { setQ(q0); if (q0) setTab('history'); } }, [q0]);

  const orders = s.orders.filter((o) => o.siteId === site.id && (o.status === 'approved' || o.status === 'picking')).sort((a, b) => (a.status === 'picking' ? -1 : 1) - (b.status === 'picking' ? -1 : 1) || b.createdAt.localeCompare(a.createdAt));
  const waiting = s.orders.filter((o) => o.siteId === site.id && WAITING[o.status]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const openDispatchFor = (oid: string) => s.dispatches.find((d) => d.orderId === oid && (d.gateStatus === 'pending' || d.gateStatus === 'hold'));
  useEffect(() => { if (!orderId && orders[0]) { setOrderId(orders[0].id); setDispatchId(openDispatchFor(orders[0].id)?.id ?? null); } }, [orders.length, orderId]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (oid: string) => { setOrderId(oid); setDispatchId(openDispatchFor(oid)?.id ?? null); };
  const order = s.orders.find((o) => o.id === orderId); const dispatch = s.dispatches.find((d) => d.id === dispatchId);
  const client = s.clients.find((c) => c.id === order?.clientId);
  const history = s.dispatches.filter((d) => d.siteId === site.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const nextNo = nextDeliveryNoteNo(s, site.id, site.deliveryNoteSeriesStart);
  const tol = settings?.gateTolerancePct ?? site.thresholds.gateTolerancePct;
  // Drivers who have carried a load from this site before: suggestions only, nothing is prefilled.
  const pastDrivers = [...new Set(history.map((d) => d.driver).filter(Boolean))].slice(0, 12);
  const lorryReady = !!driver.trim() && !!vehicle && vehicles.some((v) => v.label === vehicle);
  // The order that just left stays on the list until the next one is picked.
  const listed = order && !orders.some((o) => o.id === order.id) ? [order, ...orders] : orders;

  const start = () => {
    if (!order || dispatch) return;
    if (!driver.trim()) { toast({ kind: 'warn', title: 'Who is driving?', detail: 'Enter the driver before loading starts. The name prints on the delivery note.' }); driverRef.current?.focus(); return; }
    if (!vehicle || !lorryReady) { toast({ kind: 'warn', title: 'Which vehicle?', detail: vehicles.length ? 'Choose the vehicle for this load.' : 'Add the site vehicles in Settings → Master data first.' }); vehicleBox.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"], input')?.focus(); return; }
    const d = startDispatch(order.id, driver.trim(), vehicle); setDispatchId(d.id); toast({ kind: 'ok', title: `${d.deliveryNoteNo} opened`, detail: `Pick list for ${client?.name}. Start scanning.` });
  };
  const loadNext = () => { setDispatchId(null); setOrderId(null); setDriver(''); setVehicle(null); setTab('build'); };
  useHotkey('h', () => setTab((t) => (t === 'history' ? 'build' : 'history')), { label: 'Switch between the cargo builder and history' });

  /* ---- numbers for the hero */
  const lines = order ? manifestLines(s, order, dispatch) : [];
  const ordered = lines.reduce((t, l) => t + l.ordered, 0); const scanned = dispatch?.scannedLabelIds.length ?? 0;
  const expectedKg = dispatch?.expectedKg ?? lines.reduce((t, l) => t + l.expectedKg, 0);
  const st = dispatch?.gateStatus; const weighed = !!dispatch && dispatch.gateKg !== undefined && st !== 'pending';
  const complete = ordered > 0 && scanned === ordered; const released = st === 'pass' || st === 'overridden';
  const inBand = dispatch?.variancePct !== undefined && Math.abs(dispatch.variancePct) <= tol;
  const steps: FlowStep[] = [
    { label: 'Load and scan', state: !order ? 'todo' : !dispatch ? 'current' : complete ? 'done' : weighed ? 'warn' : 'current', detail: !order ? 'Every bundle, by sticker' : !dispatch ? 'Not started' : complete ? `${ordered} bundles on the lorry` : `${scanned} of ${ordered} bundles${weighed ? ' · short load' : ''}` },
    { label: 'Weigh at the gate', state: weighed ? 'done' : dispatch && complete ? 'current' : 'todo', detail: weighed ? `${fmtKg(dispatch!.gateKg!)} · ${fmtPct(dispatch!.variancePct ?? 0, true)}` : dispatch && complete ? 'Lorry onto the gate scale' : order ? `Expecting ${fmtKg(Math.round(expectedKg))} ±${tol}%` : `Scale within ±${tol}% of the manifest` },
    { label: 'Gate pass', state: released ? 'done' : st === 'hold' ? 'bad' : 'todo', detail: st === 'pass' ? `${gatePassNo(dispatch!)} issued` : st === 'overridden' ? 'Released on override' : st === 'hold' ? 'Held · CEOs alerted' : 'No pass, no exit' },
  ];
  const pill = !order ? null
    : st === 'hold' ? { text: 'Held at the gate', cls: 'bg-[rgb(239_122_105/.22)] text-[#ffb3a7]', icon: Lock }
      : st === 'pass' ? { text: `Gate pass ${gatePassNo(dispatch!)}`, cls: 'bg-[rgb(76_192_136/.2)] text-[#8fe0b5]', icon: Truck }
        : st === 'overridden' ? { text: 'Released on override', cls: 'bg-[rgb(240_160_75/.2)] text-[var(--color-amber-400)]', icon: Truck }
          : dispatch ? { text: complete ? 'Ready for the gate' : `Loading · ${ordered - scanned} to go`, cls: 'bg-white/10 text-white/85', icon: null }
            : { text: 'Ready to load', cls: 'bg-white/10 text-white/85', icon: null };

  /* ---- order list keyboard: arrows move, Enter opens */
  const onListKey = (e: ReactKeyboardEvent, i: number) => {
    const n = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? listed.length - 1 : -1;
    if (n < 0 || n >= listed.length) return;
    e.preventDefault(); listRefs.current[n]?.focus();
  };
  // The lorry form is the first thing to fill in; once it is complete the order list takes the keyboard.
  useEffect(() => { if (touch || tab !== 'build' || !order || dispatch) return; if (!driver.trim()) driverRef.current?.focus({ preventScroll: true }); else listRefs.current[Math.max(0, listed.findIndex((o) => o.id === order.id))]?.focus({ preventScroll: true }); }, [orderId, dispatchId, tab, touch]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- history */
  const t = q.trim().toLowerCase();
  const rows = history.filter((d) => (gate === 'all' || d.gateStatus === gate) && (!t || (() => { const o = s.orders.find((x) => x.id === d.orderId); const c = s.clients.find((x) => x.id === o?.clientId); return `${d.deliveryNoteNo} ${o?.number} ${c?.name} ${c?.country} ${d.driver} ${d.vehicle}`.toLowerCase().includes(t); })()));
  const columns: Column<DispatchRec>[] = [
    { key: 'dn', header: 'Delivery note', sort: (d) => d.deliveryNoteNo, cell: (d) => <span className="code font-medium">{d.deliveryNoteNo}</span> },
    { key: 'at', header: 'Opened', sort: (d) => d.createdAt, cell: (d) => <span className="num text-[var(--text-2)]">{fmtDateTime(d.createdAt)}</span> },
    { key: 'c', header: 'Client', truncate: 230, sort: (d) => s.clients.find((c) => c.id === s.orders.find((o) => o.id === d.orderId)?.clientId)?.name ?? '', cell: (d) => { const c = s.clients.find((x) => x.id === s.orders.find((o) => o.id === d.orderId)?.clientId); return <span className="inline-flex items-center gap-1.5"><Avatar name={c?.name ?? '?'} size={20} />{c?.name}<span className="t-sm text-[var(--text-3)]">{c?.country}</span></span>; } },
    { key: 'o', header: 'Order', cell: (d) => <span className="code text-[var(--text-2)]">{s.orders.find((o) => o.id === d.orderId)?.number}</span> },
    { key: 'b', header: 'Bundles', align: 'right', sort: (d) => d.scannedLabelIds.length, cell: (d) => fmtNum(d.scannedLabelIds.length), mono: true },
    { key: 'e', header: 'Expected kg', align: 'right', mono: true, sort: (d) => d.expectedKg, cell: (d) => fmtNum(Math.round(d.expectedKg)) },
    { key: 'g', header: 'Gate kg', align: 'right', mono: true, sort: (d) => d.gateKg ?? -1, cell: (d) => (d.gateKg !== undefined ? <span className="font-medium">{fmtNum(d.gateKg)}</span> : <span className="text-[var(--text-4)]">—</span>) },
    { key: 'v', header: 'Variance', align: 'right', sort: (d) => d.variancePct ?? -99, cell: (d) => <VarianceBadge pct={d.variancePct} tolerancePct={tol} /> },
    { key: 'l', header: 'Lorry', truncate: 200, cell: (d) => <span className="text-[var(--text-2)]">{d.driver} · <span className="code">{d.vehicle}</span></span> },
    { key: 's', header: 'Gate', sort: (d) => d.gateStatus, cell: (d) => <GateBadge status={d.gateStatus} /> },
  ];
  const count = (g: GateFilter) => history.filter((d) => g === 'all' || d.gateStatus === g).length;
  const pickCols = (keys: string[]) => columns.filter((c) => keys.includes(c.key)).map((c) => ({ ...c, sort: undefined }));

  /* ---- before loading starts: where the bundles are, and how this client's earlier loads went */
  const zones = s.zones.filter((z) => z.siteId === site.id);
  const pickFrom = (pid: string) => {
    const inStock = s.labels.filter((l) => l.siteId === site.id && l.productId === pid && l.status === 'in_stock');
    const segs = zones.map((z, i) => ({ label: z.name, value: inStock.filter((l) => l.zoneId === z.id).length, color: `var(--series-${(i % 8) + 1})` }));
    const loose = inStock.filter((l) => !zones.some((z) => z.id === l.zoneId)).length;
    return loose ? [...segs, { label: 'No zone recorded', value: loose, color: 'var(--text-4)' }] : segs;
  };
  const clientLoads = order ? history.filter((d) => d.id !== dispatch?.id && s.orders.find((o) => o.id === d.orderId)?.clientId === order.clientId).slice(0, 5) : [];

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <StockStyles />

      {/* ---------------- hero: the shipment, its three steps, its numbers */}
      <section className="hero relative overflow-hidden px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex items-center gap-3.5 min-w-0 flex-1 basis-[340px]">
            <span className="size-12 rounded-xl grid place-items-center shrink-0 shadow-[inset_0_1px_0_rgb(255_255_255/.25)]" style={{ background: SITE_COLOR[site.id] }}><Truck className="size-6" /></span>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-white/55">Dispatch and gate · {site.name}</div>
              {order ? <>
                <h1 className="text-[22px] font-semibold tracking-[-0.02em] leading-tight truncate"><span className="code">{order.number}</span><ArrowRight className="inline size-4 mx-2 -mt-0.5 text-white/45" />{client?.name}</h1>
                <div className="text-[12.5px] text-white/60 truncate">Delivery note <span className="code text-white/90 font-medium">{dispatch?.deliveryNoteNo ?? nextNo}</span>{dispatch ? <> · <span className="code">{dispatch.vehicle}</span>, {dispatch.driver} · to {client?.country}</> : <> (next in the series) · to {client?.country}{order.notes ? ` · ${order.notes.replace(/\.$/, '')}` : ''}</>}</div>
              </> : <>
                <h1 className="text-[22px] font-semibold tracking-[-0.02em] leading-tight">No order is waiting to load</h1>
                <div className="text-[12.5px] text-white/60">Scan every bundle onto the lorry, weigh out, and the arithmetic issues the gate pass. No pass, no exit.</div>
              </>}
            </div>
          </div>
          {order && (
            <div className="grid grid-cols-4 gap-x-4 sm:gap-x-7 gap-y-3 max-sm:w-full sm:shrink-0">
              <HeroStat label="Scanned" value={<><CountUp value={scanned} duration={300} /><span className="text-white/45 font-medium"><span className="max-sm:hidden"> </span>/<span className="max-sm:hidden"> </span>{ordered}</span></>} sub="bundles" />
              <HeroStat label="Expected" value={<>{fmtNum(Math.round(expectedKg))}<span className="text-[13px] text-white/50 font-medium"> kg</span></>} sub={`tolerance ±${tol}%`} />
              <HeroStat label="Gate scale" value={weighed ? <>{fmtNum(dispatch!.gateKg!)}<span className="text-[13px] text-white/50 font-medium"> kg</span></> : <span className="text-white/35">—</span>} sub={weighed ? (dispatch!.gatePassedAt ? `passed ${fmtTime(dispatch!.gatePassedAt)}` : 'on the scale') : 'not weighed'} />
              <HeroStat label="Variance" value={weighed && dispatch!.variancePct !== undefined ? <span style={{ color: inBand ? '#8fe0b5' : '#ffb3a7' }}>{fmtPct(dispatch!.variancePct, true)}</span> : <span className="text-white/35">—</span>} sub={weighed ? (inBand ? 'inside the band' : `outside ±${tol}%`) : 'scale vs expected'} />
            </div>
          )}
        </div>
        <div className="mt-3.5 pt-3.5 border-t border-white/10 flex flex-wrap items-center gap-x-6 gap-y-3">
          <FlowSteps steps={steps} className="flex-1 basis-[600px]" />
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {pill && <span className={cn('items-center gap-1.5 h-8 px-3 rounded-lg text-[12.5px] font-medium whitespace-nowrap', tab === 'build' && (!dispatch || st === 'pending') ? 'hidden xl:inline-flex' : 'inline-flex', pill.cls)}>{pill.icon ? <pill.icon className="size-3.5" /> : <span className="size-1.5 rounded-full bg-[var(--color-amber-400)] anim-live" />}{pill.text}</span>}
            {!order && <Button variant="inverse" icon={ShoppingCart} onClick={() => go.site('sales/orders')}>Open orders</Button>}
            {order && !dispatch && tab === 'build' && <Button variant="accent" icon={Play} hotkey="mod+enter" hotkeyLabel="Start loading" onClick={start}>Start loading</Button>}
            {dispatch && st === 'pending' && tab === 'build' && <Button variant="accent" icon={Scale} hotkey="w" hotkeyLabel="Weigh at the gate (read the scale)" onClick={() => actions.current.weigh?.()}>Weigh at the gate</Button>}
          </div>
        </div>
      </section>

      <div className="border-b border-[var(--line)] flex items-end justify-between gap-4 -mt-1">
        <Tabs variant="underline" value={tab} onChange={setTab} tabs={[{ value: 'build', label: 'Cargo builder', count: orders.length }, { value: 'history', label: 'History', count: history.length }]} />
        <div className="hidden md:block t-sm text-[var(--text-3)] pb-2 whitespace-nowrap">Gate tolerance ±{tol}% · next delivery note <span className="code text-[var(--text-2)]">{nextNo}</span></div>
      </div>

      {tab === 'history' ? (
        <div>
          <Toolbar right={<span className="t-sm text-[var(--text-3)] num">{rows.length} of {history.length}</span>}>
            <SearchInput value={q} onChange={setQ} placeholder="Delivery note, client, driver, plate" />
            <Tabs value={gate} onChange={setGate} tabs={[{ value: 'all' as GateFilter, label: 'All', count: count('all') }, ...(['pass', 'hold', 'overridden', 'pending'] as const).map((g) => ({ value: g as GateFilter, label: GATE_META[g].label, count: count(g) }))]} />
          </Toolbar>
          <DataGrid rows={rows} columns={wide ? columns : columns.filter((c) => (phone ? ['dn', 'b', 's'] : ['dn', 'c', 'b', 'g', 'v', 's']).includes(c.key))} rowKey={(d) => d.id} onRowClick={setNoteOf} selectedKey={noteOf?.id} maxHeight={wide ? 'max(360px, calc(100dvh - 420px))' : undefined}
            empty={history.length === 0 ? 'No dispatches yet. The first delivery note starts the site series.' : 'No dispatch matches this filter.'}
            footer={!wide ? <tr><td colSpan={phone ? 1 : 2}>{rows.length} dispatch{rows.length === 1 ? '' : 'es'}</td><td className="text-right num">{fmtNum(rows.reduce((x, d) => x + d.scannedLabelIds.length, 0))}</td>{!phone && <td className="text-right num">{fmtNum(rows.reduce((x, d) => x + (d.gateKg ?? 0), 0))}</td>}<td colSpan={phone ? 1 : 2} /></tr> : <tr><td colSpan={4}>{rows.length} dispatch{rows.length === 1 ? '' : 'es'} from {site.shortName}</td><td className="text-right num">{fmtNum(rows.reduce((x, d) => x + d.scannedLabelIds.length, 0))}</td><td className="text-right num">{fmtNum(Math.round(rows.reduce((x, d) => x + d.expectedKg, 0)))}</td><td className="text-right num">{fmtNum(rows.reduce((x, d) => x + (d.gateKg ?? 0), 0))}</td><td colSpan={3} /></tr>} />
        </div>
      ) : (
        <div className="grid gap-[var(--gap)] items-start xl:grid-cols-[minmax(0,1fr)_340px] xl:grid-rows-[auto_1fr]">
          {/* orders ready to load */}
          <Panel icon={ShoppingCart} title="Ready to load" sub={`${orders.length} order${orders.length === 1 ? '' : 's'}`} pad={false} className={cn('xl:col-start-2 xl:row-start-1', dispatch && 'max-xl:order-2')}
            actions={<Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => go.site('sales/orders')}>Orders</Button>}
            footer={<span className="touch:hidden">↑ ↓ to move, Enter to open. An order appears here once cash is confirmed or a CEO approves it.</span>}>
            {listed.length === 0 ? <div className="px-[var(--pad)] py-3 t-sm text-[var(--text-3)]">No approved order is waiting at the store.</div> : (
              <div role="listbox" aria-label="Orders ready to load">
                {listed.map((o, i) => {
                  const c = s.clients.find((x) => x.id === o.clientId); const d = openDispatchFor(o.id) ?? (o.id === order?.id ? dispatch : undefined); const active = o.id === orderId;
                  const bundles = o.lines.reduce((x, l) => x + l.bundles, 0); const kg = o.lines.reduce((x, l) => x + l.bundles * (s.products.find((p) => p.id === l.productId)?.stdBundleWeightKg ?? 0), 0);
                  return (
                    <button key={o.id} ref={(el) => { listRefs.current[i] = el; }} type="button" role="option" aria-selected={active} tabIndex={active || (!orderId && i === 0) ? 0 : -1} onClick={() => pick(o.id)} onKeyDown={(e) => onListKey(e, i)}
                      className={cn('relative w-full flex items-center gap-2.5 px-[var(--pad)] py-2 touch:py-3 text-left border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus)]', active && 'bg-[var(--selected)] hover:bg-[var(--selected)]')}>
                      {active && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--accent)]" />}
                      <Avatar name={c?.name ?? '?'} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 min-w-0"><span className="code font-medium whitespace-nowrap shrink-0">{o.number}</span><span className="t-base truncate">{c?.name}</span></span>
                        <span className="block t-sm text-[var(--text-3)] truncate">{o.lines.map((l) => `${l.bundles} ${s.products.find((p) => p.id === l.productId)?.internalName}`).join(' + ')}</span>
                        <span className="block t-xs text-[var(--text-3)] num truncate">{c?.country} · {bundles} bundles · {fmtKg(Math.round(kg))}{d ? ` · ${d.deliveryNoteNo}` : ''}</span>
                      </span>
                      {d ? <GateBadge status={d.gateStatus} /> : <Badge tone="accent" dot>{o.status === 'picking' ? 'Picking' : 'Approved'}</Badge>}
                    </button>
                  );
                })}
              </div>
            )}
            {waiting.length > 0 && (
              <div className="border-t border-[var(--line)] hidden xl:block">
                <div className="t-label px-[var(--pad)] pt-2.5 pb-1">Not released to the store yet</div>
                {waiting.slice(0, 4).map((o) => { const c = s.clients.find((x) => x.id === o.clientId); return (
                  <div key={o.id} className="flex items-center gap-2.5 px-[var(--pad)] py-1.5 text-[var(--text-3)]">
                    <IconChip size="sm" icon={Lock} />
                    <span className="min-w-0 flex-1 truncate t-sm"><span className="code">{o.number}</span> · {c?.name}</span>
                    <Badge tone="warn">{WAITING[o.status]}</Badge>
                  </div>
                ); })}
                <div className="h-1.5" />
              </div>
            )}
          </Panel>

          {/* the work */}
          <div className={cn('min-w-0 xl:col-start-1 xl:row-start-1 xl:row-span-2', dispatch && 'max-xl:order-1')}>
            {!order ? (
              <div className="flex flex-col gap-[var(--gap)]">
                <Panel icon={ClipboardList} title="Cargo builder"><Empty icon={ShoppingCart} title="Nothing to load right now" hint="Approved orders appear in the list. The cargo builder opens as soon as loading starts." action={<Button onClick={() => go.site('sales/orders')} icon={ExternalLink}>Open orders</Button>} /></Panel>
                <Panel icon={History} title="Latest dispatches" sub={`${site.shortName} delivery note series`} pad={false} actions={<Button size="sm" variant="ghost" onClick={() => setTab('history')}>All history</Button>}>
                  <DataGrid bare dense rows={history.slice(0, 8)} columns={pickCols(['dn', 'at', 'c', 'b', 'g', 'v', 's'])} rowKey={(d) => d.id} onRowClick={setNoteOf} selectedKey={noteOf?.id} empty="No dispatches yet. The first delivery note starts the site series." />
                </Panel>
              </div>
            ) : !dispatch ? (<>
                <Panel icon={ClipboardList} title="Load plan" sub={`${order.number} · ${ordered} bundles · ${fmtKg(Math.round(expectedKg))}`} pad={false} actions={<Badge tone="accent" dot className="mr-1.5">Not started</Badge>}
                  footer={<span>Delivery note <span className="code text-[var(--text)]">{nextNo}</span> continues the {site.shortName} series. Standard bundle weights are illustrative until measured.</span>}>
                  <ManifestTable lines={lines} mode="plan" />
                  <div className="px-[var(--pad)] py-2.5 border-t border-[var(--line)]">
                    <div className="t-label mb-1">Lorry for this load</div>
                    <FormRow label="Driver" required hint={pastDrivers.length ? <span className="touch:hidden">Start typing for drivers who have loaded here before.</span> : undefined}>
                      <Input ref={driverRef} value={driver} onChange={(e) => setDriver(e.target.value)} placeholder="Name on the driving permit" className="max-w-[320px]" list="tn-drivers" autoComplete="off" />
                      <datalist id="tn-drivers">{pastDrivers.map((d) => <option key={d} value={d} />)}</datalist>
                    </FormRow>
                    <FormRow label="Vehicle" required>
                      <div ref={vehicleBox}>
                        {vehicles.length === 0 ? <SetupHint inline what="vehicles" />
                          : vehicles.length > 8 ? <Combobox className="max-w-[320px]" value={vehicle} onChange={setVehicle} placeholder="Search number plate" options={vehicles.map((v) => ({ value: v.label, label: v.label }))} />
                            : <ChipGroup ariaLabel="Vehicle" options={vehicles.map((v) => ({ value: v.label, label: <span className="code">{v.label}</span> }))} value={vehicle} onChange={setVehicle} />}
                      </div>
                    </FormRow>
                    <FormRow label="Destination"><div className="t-base compact:sm:pt-[7px]">{client?.name}, {client?.country}<span className="text-[var(--text-3)]"> · {order.notes ?? 'No notes on the order'}</span></div></FormRow>
                    <Button variant="primary" size="lg" block icon={Play} onClick={start} className="compact:hidden mt-2">Start loading · {nextNo}</Button>
                    {!lorryReady && <div className="touch:hidden t-xs text-[var(--text-3)] mt-1">Driver and vehicle print on the delivery note, so loading starts once both are in.</div>}
                  </div>
                </Panel>
                <div className="grid gap-[var(--gap)] md:grid-cols-2 mt-[var(--gap)] items-start">
                  <Panel icon={MapPin} title="Where to pick" sub="bundles in stock by zone">
                    {lines.map((l) => (
                      <div key={l.product.id} className="py-2.5 first:pt-0 last:pb-0 border-b border-[var(--line)] last:border-b-0">
                        <div className="flex items-baseline justify-between gap-3 mb-1.5"><ProductName product={l.product} /><span className="t-sm num text-[var(--text-3)] whitespace-nowrap">need {l.ordered} · {fmtNum(l.inStock)} in stock</span></div>
                        {l.inStock ? <StackedBar segments={pickFrom(l.product.id)} /> : <div className="t-sm text-[var(--bad)]">None in stock at {site.shortName}.</div>}
                      </div>
                    ))}
                  </Panel>
                  <Panel icon={History} title="Earlier loads" sub={client?.name} pad={false}>
                    <DataGrid bare dense rows={clientLoads} columns={pickCols(['dn', 'at', 'b', 'g', 'v'])} rowKey={(d) => d.id} onRowClick={setNoteOf} selectedKey={noteOf?.id} empty="This is the first load for this client." />
                  </Panel>
                </div>
              </>) : <CargoBuilder key={dispatch.id} dispatch={dispatch} order={order} onLoadNext={loadNext} actions={actions} />}
          </div>

          {/* the paper and where the shipment stands */}
          {order && (
            <div className="min-w-0 flex flex-col gap-[var(--gap)] xl:col-start-2 xl:row-start-2 max-xl:order-3">
              <Panel icon={FileText} title="Delivery note" sub={dispatch ? 'updates as you scan' : 'preview'} bodyClassName="bg-[var(--surface-2)] rounded-b-[9px]">
                <DeliveryNoteCard dispatch={dispatch} serialPreview={{ no: nextNo, orderId: order.id, driver: driver.trim(), vehicle: vehicle ?? '' }} />
              </Panel>
              {dispatch && <Panel icon={Route} title="Shipment" sub="from the store to paid"><ShipmentStepper dispatch={dispatch} vertical /></Panel>}
            </div>
          )}
        </div>
      )}

      <Sheet open={!!noteOf} onClose={() => setNoteOf(null)} title={noteOf ? <span className="code">{noteOf.deliveryNoteNo}</span> : ''} sub={noteOf ? `${s.clients.find((c) => c.id === s.orders.find((o) => o.id === noteOf.orderId)?.clientId)?.name} · opened ${fmtDateTime(noteOf.createdAt)}` : undefined} width={500}
        footer={noteOf && <Button icon={Truck} onClick={() => go.site('stock/deliveries', undefined, noteOf.deliveryNoteNo)}>Open in deliveries</Button>}>
        {noteOf && <div className="flex flex-col gap-4"><div><div className="t-label mb-2">Shipment</div><ShipmentStepper dispatch={noteOf} vertical /></div><div><div className="t-label mb-2">Delivery note</div><DeliveryNoteCard dispatch={noteOf} /></div></div>}
      </Sheet>
    </div>
  );
}
