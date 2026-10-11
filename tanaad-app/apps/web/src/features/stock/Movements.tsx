import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowRightLeft, Building2, Download, Eraser, FileText, PackageOpen, ScrollText, Send, SlidersHorizontal, Trash2, type LucideIcon } from 'lucide-react';
import type { DomainEvent, SiteCode, StockMovement } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite, useGo } from '@/app/hooks';
import { SITE_LIST } from '@/config/sites';
import { Avatar, Badge, Bar, Button, ChipGroup, Combobox, DataGrid, FormRow, Input, KpiStrip, Note, PageHeader, Panel, SearchInput, Stat, Tabs, useIsTouch, type Column, type Tone } from '@/components/ui';
import { CountUp } from '@/components/charts';
import { fmtDateTime, fmtKg, fmtNum } from '@/data/format';
import { downloadCsv, useBeep } from './shared';
import { Bench, IconChip, KV, ProductName, QtyPad, SetupHint, Step, Swatch, dayOf, matches, plural, unitWords, useSearch } from './kit';

type Kind = 'transfer' | 'site' | 'adjust' | 'scrap';
/** The four vouchers a storekeeper can write. Receipts and dispatches write their own movements from their own screens. */
const KINDS: Record<Kind, { label: string; short: string; icon: LucideIcon; hint: string; color: string }> = {
  transfer: { label: 'Between zones', short: 'Zone transfer', icon: ArrowRightLeft, hint: 'Same site, different zone. Nothing leaves the books.', color: 'var(--series-1)' },
  site: { label: 'To another site', short: 'Inter-site', icon: Building2, hint: 'Inter-company transfer. The receiving site books it in on its own receive screen.', color: 'var(--series-7)' },
  adjust: { label: 'Adjustment', short: 'Adjustment', icon: SlidersHorizontal, hint: 'Changes the system figure. A reason is required and it is flagged in the audit feed.', color: 'var(--series-4)' },
  scrap: { label: 'Scrap', short: 'Scrap', icon: Trash2, hint: 'Damaged or unsellable. A reason is required.', color: 'var(--series-8)' },
};
type Ledger = 'all' | 'transfer' | 'site' | 'receive' | 'adjust' | 'scrap' | 'other';
const ledgerKind = (m: StockMovement): Exclude<Ledger, 'all'> => (m.toSiteId ? 'site' : m.kind === 'transfer' || m.kind === 'receive' || m.kind === 'adjust' || m.kind === 'scrap' ? m.kind : 'other');
const LEDGER: Record<Exclude<Ledger, 'all'>, { label: string; tone: Tone }> = { transfer: { label: 'Zone transfer', tone: 'neutral' }, site: { label: 'Inter-site', tone: 'info' }, receive: { label: 'Receipt', tone: 'ok' }, adjust: { label: 'Adjustment', tone: 'warn' }, scrap: { label: 'Scrap', tone: 'bad' }, other: { label: 'Production', tone: 'neutral' } };
type Ev = DomainEvent<StockMovement>;

/** Stock voucher and ledger. Every movement is an event; adjustments and scrap carry a reason and an owner. */
export function Movements() {
  const s = useStore(); const site = useSite(); const go = useGo(); const beep = useBeep(); const touch = useIsTouch();
  const moveStock = useStore((x) => x.moveStock); const toast = useStore((x) => x.toast);
  const zones = s.zones.filter((z) => z.siteId === site.id);
  const products = s.products.filter((p) => p.siteId === site.id && p.kind !== 'material' && p.active !== false);
  const otherSites = SITE_LIST.filter((x) => x.id !== site.id);
  const words = unitWords(site.id);
  const zoneName = (id?: string) => zones.find((z) => z.id === id)?.name ?? (id ? 'Zone removed' : '—');
  const siteName = (id?: SiteCode) => SITE_LIST.find((x) => x.id === id)?.name ?? '—';

  /* ---- the voucher */
  const [kind, setKind] = useState<Kind>('transfer'); const [productId, setProductId] = useState<string | null>(null); const [qty, setQty] = useState('');
  const [from, setFrom] = useState<string | null>(null); const [to, setTo] = useState<string | null>(null); const [toSite, setToSite] = useState<SiteCode | null>(null); const [reason, setReason] = useState('');
  const form = useRef<HTMLDivElement>(null);
  const product = products.find((p) => p.id === productId); const n = parseInt(qty || '0', 10);
  const inStock = useMemo(() => { const m = new Map<string, number>(); for (const l of s.labels) if (l.siteId === site.id && l.status === 'in_stock' && l.productId && l.zoneId) m.set(`${l.productId}|${l.zoneId}`, (m.get(`${l.productId}|${l.zoneId}`) ?? 0) + 1); return m; }, [s.labels, site.id]);
  const inZone = (zid: string | null, pid = product?.id) => (pid && zid ? inStock.get(`${pid}|${zid}`) ?? 0 : 0);
  const totalOf = (pid: string) => zones.reduce((t, z) => t + inZone(z.id, pid), 0);
  const unitOne = product?.unit ?? words.one; const unitMany = product?.unit ? `${product.unit}s` : words.many; const unit = n === 1 ? unitOne : unitMany;
  const kg = product ? Math.round(n * product.stdBundleWeightKg * 10) / 10 : 0;
  const needsReason = kind === 'adjust' || kind === 'scrap';
  const missing = [!product && 'product', !from && 'from zone', kind === 'transfer' && (!to || to === from) && 'to zone', kind === 'site' && !toSite && 'destination site', !(n > 0) && 'quantity', needsReason && reason.trim().length < 3 && 'reason'].filter(Boolean) as string[];
  const ready = missing.length === 0;
  const have = inZone(from); const overdraw = !!product && !!from && n > have && kind !== 'adjust';
  const destination = kind === 'transfer' ? (to ? zoneName(to) : undefined) : kind === 'site' ? (toSite ? siteName(toSite) : undefined) : kind === 'scrap' ? 'Scrap' : 'Adjustment';

  // The kind of move is the first field: on a desk it takes the keyboard, so 1 to 4 picks the kind and Tab moves on.
  useEffect(() => { if (!touch) form.current?.querySelector<HTMLElement>('[role="radiogroup"] [tabindex="0"]')?.focus({ preventScroll: true }); }, [touch]);
  const focusFirst = () => { if (!touch) setTimeout(() => form.current?.querySelector<HTMLElement>('[data-f="product"] input')?.focus(), 40); };
  const clear = () => { setProductId(null); setQty(''); setFrom(null); setTo(null); setToSite(null); setReason(''); focusFirst(); };
  const submit = () => {
    if (!ready || !product) return;
    moveStock({ siteId: site.id, kind: kind === 'site' ? 'transfer' : kind, productId: product.id, fromZoneId: from ?? undefined, toZoneId: kind === 'transfer' ? to ?? undefined : undefined, toSiteId: kind === 'site' ? toSite ?? undefined : undefined, qtyUnits: n, qtyKg: kg, reason: reason.trim() || (kind === 'site' ? `Inter-company transfer to ${siteName(toSite ?? undefined)}` : undefined) });
    beep('ok');
    toast({ kind: kind === 'adjust' ? 'warn' : 'ok', title: `${KINDS[kind].short}: ${fmtNum(n)} ${unit} of ${product.internalName}`, detail: kind === 'adjust' ? 'Flagged in the audit feed with your name and reason.' : `${zoneName(from ?? undefined)} to ${destination}. Recorded as an event.` });
    // Same product, next voucher: the quantity is the field that changes.
    setQty(''); setReason(''); if (!touch) setTimeout(() => form.current?.querySelector<HTMLElement>('[data-f="qty"] input')?.focus(), 40);
  };

  /* ---- the ledger */
  const [q, setQ] = useSearch(); const [filter, setFilter] = useState<Ledger>('all');
  const events = useMemo(() => (s.events.filter((e) => e.type === 'StockMoved' && e.siteId === site.id) as Ev[]).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), [s.events, site.id]);
  const who = (id: string) => s.users.find((u) => u.id === id)?.name ?? s.people.find((p) => p.id === id)?.fullName ?? 'Unknown user';
  const productOf = (id?: string) => s.products.find((p) => p.id === id);
  const whatOf = (m: StockMovement) => productOf(m.productId)?.internalName ?? m.reason?.split(' · ')[0] ?? 'Material';
  const routeOf = (m: StockMovement) => ({ from: m.kind === 'receive' ? 'Supplier' : zoneName(m.fromZoneId), to: m.toSiteId ? siteName(m.toSiteId) : m.kind === 'scrap' ? 'Scrap' : m.kind === 'adjust' ? 'Adjustment' : zoneName(m.toZoneId) });
  const searched = events.filter((e) => { const m = e.payload; const r = routeOf(m); return matches(q, whatOf(m), m.reason, r.from, r.to, who(e.actorId), LEDGER[ledgerKind(m)].label, m.kind); });
  const rows = searched.filter((e) => filter === 'all' || ledgerKind(e.payload) === filter);
  const count = (f: Ledger) => searched.filter((e) => f === 'all' || ledgerKind(e.payload) === f).length;
  const realToday = new Date().toISOString().slice(0, 10);
  const todays = events.filter((e) => dayOf(e.occurredAt) === realToday || dayOf(e.occurredAt) === s.today);
  const sumKg = (list: Ev[]) => list.reduce((t, e) => t + e.payload.qtyKg, 0);
  const of = (k: Ledger) => events.filter((e) => ledgerKind(e.payload) === k);
  const exportCsv = () => downloadCsv(`movements-${site.id}-${s.today}.csv`, [['When', 'Kind', 'Item', 'Units', 'Kg', 'From', 'To', 'Reason', 'By'], ...rows.map((e) => { const m = e.payload; const r = routeOf(m); return [e.occurredAt, LEDGER[ledgerKind(m)].label, whatOf(m), m.qtyUnits, m.qtyKg, r.from, r.to, m.reason, who(e.actorId)]; })]);

  const columns: Column<Ev>[] = [
    { key: 'at', header: 'When', sort: (e) => e.occurredAt, cell: (e) => <span className="num text-[var(--text-2)]">{fmtDateTime(e.occurredAt)}</span> },
    { key: 'k', header: 'Kind', sort: (e) => ledgerKind(e.payload), cell: (e) => { const k = LEDGER[ledgerKind(e.payload)]; return <Badge tone={k.tone} dot>{k.label}</Badge>; } },
    { key: 'p', header: 'Item', truncate: 200, sort: (e) => whatOf(e.payload), cell: (e) => { const p = productOf(e.payload.productId); return p ? <ProductName product={p} /> : <span className="font-medium">{whatOf(e.payload)}</span>; } },
    { key: 'q', header: 'Units', align: 'right', mono: true, sort: (e) => e.payload.qtyUnits, cell: (e) => fmtNum(e.payload.qtyUnits) },
    { key: 'kg', header: 'Kg', align: 'right', mono: true, sort: (e) => e.payload.qtyKg, cell: (e) => fmtNum(e.payload.qtyKg) },
    { key: 'ft', header: 'From → to', truncate: 260, cell: (e) => { const r = routeOf(e.payload); return <span className="inline-flex items-center gap-1.5"><span className="text-[var(--text-2)]">{r.from}</span><ArrowRight className="size-3 text-[var(--text-4)] shrink-0" /><span className="font-medium">{r.to}</span></span>; } },
    { key: 'r', header: 'Reason', truncate: 260, cell: (e) => (e.payload.reason ? <span className="text-[var(--text-2)]" title={e.payload.reason}>{e.payload.reason}</span> : <span className="text-[var(--text-4)]">—</span>) },
    { key: 'by', header: 'By', truncate: 150, cell: (e) => <span className="inline-flex items-center gap-1.5"><Avatar name={who(e.actorId)} size={18} />{who(e.actorId)}</span> },
  ];

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <div className="-mb-[var(--gap)]">
        <PageHeader eyebrow={`${site.name} · Stock`} title="Movements and transfers" meta={<Badge tone="neutral">{plural(events.length, 'movement')} on record</Badge>}
          subtitle="One voucher for every move. Nothing is overwritten: every line is an event with an owner."
          actions={<><Button icon={Download} hotkey="e" hotkeyLabel="Export movements as CSV" disabled={rows.length === 0} onClick={exportCsv}>Export</Button><Button icon={PackageOpen} onClick={() => go.site('stock/receive')}>Receive at the gate</Button></>} />
      </div>

      <KpiStrip className="md:grid-cols-4!">
        <Stat label="Movements today" icon={ScrollText} accent="var(--series-1)" value={<CountUp value={todays.length} />} sub={todays.length ? `${fmtKg(Math.round(sumKg(todays)))} moved or booked` : 'No voucher written yet today'} />
        <Stat label="Transfers" icon={ArrowRightLeft} accent="var(--series-7)" value={<CountUp value={of('transfer').length + of('site').length} />} sub={`${of('site').length} to another site · ${of('transfer').length} between zones`} onClick={() => setFilter('transfer')} />
        <Stat label="Adjustments" icon={SlidersHorizontal} accent="var(--series-4)" tone={of('adjust').length ? 'warn' : 'neutral'} value={<CountUp value={of('adjust').length} />} sub={of('adjust').length ? `${fmtNum(of('adjust').reduce((t, e) => t + e.payload.qtyUnits, 0))} units · flagged in the audit feed` : 'No figure changed by hand'} onClick={() => setFilter('adjust')} />
        <Stat label="Scrapped" icon={Trash2} accent="var(--series-8)" tone={of('scrap').length ? 'bad' : 'neutral'} value={<><CountUp value={Math.round(sumKg(of('scrap')))} /><span className="t-base text-[var(--text-3)] font-medium"> kg</span></>} sub={of('scrap').length ? `${plural(of('scrap').length, 'voucher')} · ${fmtNum(of('scrap').reduce((t, e) => t + e.payload.qtyUnits, 0))} units` : 'Nothing written off'} onClick={() => setFilter('scrap')} />
      </KpiStrip>

      <Bench asideWidth={400} aside={<>
        <Panel icon={FileText} title="Voucher" sub={ready ? 'ready to record' : 'fills in as you go'} actions={<Badge tone={kind === 'adjust' ? 'warn' : kind === 'scrap' ? 'bad' : 'neutral'} dot className="mr-1.5">{KINDS[kind].short}</Badge>}>
          <div className="flex items-stretch gap-2">
            <div className="flex-1 min-w-0 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-2"><div className="t-xs text-[var(--text-3)] font-medium">From</div><div className="t-base font-semibold truncate">{from ? zoneName(from) : <span className="text-[var(--text-4)] font-normal">not chosen</span>}</div><div className="t-xs text-[var(--text-3)] num truncate">{product && from ? `${fmtNum(have)} ${unitMany} booked` : site.shortName}</div></div>
            <div className="grid place-items-center shrink-0"><IconChip icon={KINDS[kind].icon} color={KINDS[kind].color} /></div>
            <div className="flex-1 min-w-0 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-2"><div className="t-xs text-[var(--text-3)] font-medium">To</div><div className="t-base font-semibold truncate">{destination ?? <span className="text-[var(--text-4)] font-normal">not chosen</span>}</div><div className="t-xs text-[var(--text-3)] num truncate">{kind === 'transfer' && product && to ? `${fmtNum(inZone(to))} ${unitMany} booked` : kind === 'site' ? 'inter-company' : kind === 'scrap' ? 'written off' : kind === 'adjust' ? 'system figure' : site.shortName}</div></div>
          </div>
          <div className="mt-2.5">
            <KV label="Product">{product ? <ProductName product={product} /> : <span className="text-[var(--text-4)] font-normal">not chosen</span>}</KV>
            <KV label="Quantity">{n > 0 ? `${fmtNum(n)} ${unit}` : <span className="text-[var(--text-4)] font-normal">—</span>}</KV>
            <KV label="At standard weight">{product && n > 0 ? fmtKg(kg) : <span className="text-[var(--text-4)] font-normal">—</span>}</KV>
            <KV label="Reason">{reason.trim() ? <span className="font-sans max-w-[220px] truncate inline-block align-bottom">{reason.trim()}</span> : <span className="text-[var(--text-4)] font-normal">{needsReason ? 'required' : 'none'}</span>}</KV>
          </div>
          {product && from && kind !== 'adjust' && (
            <div className="mt-3">
              <div className="flex items-baseline justify-between gap-3 t-sm mb-1"><span className="text-[var(--text-2)]">{zoneName(from)} after this voucher</span><span className="num font-medium" style={{ color: overdraw ? 'var(--bad)' : undefined }}>{fmtNum(Math.max(0, have - n))} of {fmtNum(have)}</span></div>
              <Bar value={Math.max(0, have - n)} max={Math.max(1, have)} tone={overdraw ? 'bad' : 'series'} />
            </div>
          )}
          {product?.weightStatus === 'to_be_measured' && n > 0 && <div className="t-xs text-[var(--text-3)] mt-2">Kilos use the standard weight of {fmtKg(product.stdBundleWeightKg)} per {unitOne}, which is still to be measured.</div>}
        </Panel>
        <Panel icon={ScrollText} title="Written today" sub={plural(todays.length, 'voucher')} pad={false}>
          <DataGrid bare dense rows={todays.slice(0, 8)} columns={columns.filter((c) => ['k', 'p', 'q'].includes(c.key)).map((c) => ({ ...c, sort: undefined, truncate: c.key === 'p' ? 150 : c.truncate }))} rowKey={(e) => e.id} empty="No voucher yet today. Receipts, transfers, adjustments and scrap land here as they are recorded." />
        </Panel>
      </>}>
        <Panel icon={ArrowRightLeft} title="Stock voucher" sub={KINDS[kind].hint} pad={false}
          actions={<Button size="sm" variant="ghost" icon={Eraser} disabled={!productId && !qty && !from && !reason} onClick={clear}>Clear</Button>}
          footer={<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span className="min-w-0">{ready ? `${fmtNum(n)} ${unit} of ${product!.internalName}, ${zoneName(from!)} to ${destination}.` : `Still needed: ${missing.join(', ')}.`}</span>
            <Button variant={kind === 'adjust' || kind === 'scrap' ? 'danger' : 'primary'} icon={Send} hotkey="mod+enter" hotkeyLabel="Record the movement" disabled={!ready} onClick={submit}>Record movement</Button>
          </div>}>
          <div ref={form}>
            <Step n={1} title="Kind of move" hint={touch ? undefined : 'arrows or 1 to 4'}>
              <ChipGroup ariaLabel="Kind of move" value={kind} onChange={(k) => { setKind(k); setTo(null); setToSite(null); }} options={(Object.keys(KINDS) as Kind[]).map((k) => { const K = KINDS[k]; return { value: k, label: <><K.icon className="size-3.5" />{K.label}</> }; })} />
            </Step>
            <Step n={2} title="Product" hint={product ? `${fmtNum(totalOf(product.id))} ${unitMany} in stock at ${site.shortName}` : 'what is moving'}>
              <div data-f="product">
                {products.length === 0 ? <SetupHint inline what="products" where="Products" />
                  : <Combobox className="max-w-[420px]" value={productId} onChange={setProductId} clearable placeholder="Search product" emptyText="No product with that name"
                      options={products.map((p) => ({ value: p.id, label: p.internalName, sub: p.commercialName, left: <Swatch colour={p.colour} />, right: <span className="num t-sm text-[var(--text-3)]">{fmtNum(totalOf(p.id))}</span> }))} />}
              </div>
            </Step>
            <Step n={3} title={kind === 'transfer' ? 'From and to' : kind === 'site' ? 'From and destination' : 'From'} hint={product ? `numbers are ${unitMany} booked in each zone` : undefined}>
              {zones.length === 0 ? <SetupHint inline what="store zones" where="Store zones" /> : <>
                <FormRow label="From zone" required><ChipGroup ariaLabel="From zone" value={from} onChange={(z) => { setFrom(z); if (z === to) setTo(null); }} options={zones.map((z) => ({ value: z.id, label: <>{z.name}{product && <span className="num t-sm font-normal opacity-70">{fmtNum(inZone(z.id))}</span>}</> }))} /></FormRow>
                {kind === 'transfer' && <FormRow label="To zone" required><ChipGroup ariaLabel="To zone" value={to} onChange={setTo} options={zones.filter((z) => z.id !== from).map((z) => ({ value: z.id, label: z.name }))} /></FormRow>}
                {kind === 'site' && <FormRow label="Destination site" required><ChipGroup ariaLabel="Destination site" value={toSite} onChange={setToSite} options={otherSites.map((x) => ({ value: x.id, label: x.name }))} /></FormRow>}
              </>}
            </Step>
            <Step n={4} title="Quantity and reason" hint={needsReason ? 'a reason is required for this kind' : 'the reason is optional'}>
              <FormRow label="Quantity" required>
                <div data-f="qty" className="max-w-[340px]"><QtyPad value={qty} onChange={setQty} unit={unitMany} max={99999} /></div>
                {product && n > 0 && <div className="t-sm text-[var(--text-3)] mt-1 num">{fmtKg(kg)} at the standard weight of {fmtKg(product.stdBundleWeightKg)} per {unitOne}</div>}
                {overdraw && <Note tone="warn" className="mt-2">Only {fmtNum(have)} {unitMany} of {product?.internalName} are booked in {zoneName(from!)}. Recording {fmtNum(n)} will show up in the next count.</Note>}
              </FormRow>
              <FormRow label="Reason" required={needsReason} hint={kind === 'adjust' ? 'Adjustments never overwrite history. They add an event with your name; the Site Manager sees it in the audit feed.' : undefined}>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === 'adjust' ? 'Why does the system figure change?' : kind === 'scrap' ? 'What happened to it?' : 'Optional note'} />
              </FormRow>
            </Step>
          </div>
        </Panel>
      </Bench>

      <Panel icon={ScrollText} title="Movement ledger" sub={`${site.shortName} · newest first`} pad={false}>
        <div className="flex flex-wrap items-center gap-2 px-[var(--pad)] py-2 border-b border-[var(--line)]">
          <SearchInput value={q} onChange={setQ} placeholder="Product, zone, reason, person" />
          <Tabs value={filter} onChange={setFilter} tabs={[{ value: 'all' as Ledger, label: 'All', count: count('all') }, ...(['transfer', 'site', 'receive', 'adjust', 'scrap'] as const).map((k) => ({ value: k as Ledger, label: LEDGER[k].label, count: count(k) }))]} />
          <span className="t-sm text-[var(--text-3)] ml-auto num">{rows.length} of {events.length}</span>
        </div>
        <DataGrid bare rows={rows} columns={columns} rowKey={(e) => e.id} maxHeight={420}
          empty={events.length === 0 ? 'No movement on record yet. Receipts, transfers, adjustments and scrap appear here as events, each with its owner.' : 'No movement matches this search.'}
          footer={rows.length ? <tr><td colSpan={3}>{plural(rows.length, 'movement')}</td><td className="text-right num">{fmtNum(rows.reduce((t, e) => t + e.payload.qtyUnits, 0))}</td><td className="text-right num">{fmtNum(Math.round(sumKg(rows)))}</td><td colSpan={3} /></tr> : undefined} />
      </Panel>
    </div>
  );
}
