import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, ClipboardCheck, Eraser, FileText, PackageCheck, PackageOpen, Recycle, Scale, ScrollText, Truck, Weight } from 'lucide-react';
import type { DomainEvent, RefItem, StockMovement } from '@tanaad/domain';
import { variancePct } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite, useGo, useRefList, useSiteSettings } from '@/app/hooks';
import { Badge, Button, ChipGroup, Combobox, DataGrid, Empty, FormRow, Gauge, Input, KpiStrip, Note, PageHeader, Panel, Stat, useHotkey, useIsTouch, type Column } from '@/components/ui';
import { CountUp } from '@/components/charts';
import { ScaleWidget } from '@/components/ScaleWidget';
import { fmtDateTime, fmtKg, fmtNum, fmtPct, fmtTime } from '@/data/format';
import { VarianceBadge, pressUseReading, useBeep } from './shared';
import { Bench, KV, QtyPad, SetupHint, Step, dayOf, packWord, plural } from './kit';

type Receipt = DomainEvent<StockMovement>;
/** A receipt's reason line carries the paper facts in a fixed order, so the log can show them as columns. */
const SEP = ' · ';
const writeReason = (material: string, supplier: string, noteNo: string, remark: string) => [material, supplier, noteNo ? `note ${noteNo}` : '', remark].filter((x, i) => i < 2 || x).join(SEP);
const readReason = (reason?: string) => { const [material = '', supplier = '', ...rest] = (reason ?? '').split(SEP); return { material, supplier, rest: rest.join(SEP) }; };

/** Inbound at the gate: what the supplier's note says arrived against what the scale says arrived. */
export function Receive() {
  const s = useStore(); const site = useSite(); const go = useGo(); const beep = useBeep(); const touch = useIsTouch();
  const moveStock = useStore((x) => x.moveStock); const createLabel = useStore((x) => x.createLabel); const toast = useStore((x) => x.toast);
  const materials = useRefList('material'); const tol = useSiteSettings()?.gateTolerancePct ?? site.thresholds.gateTolerancePct;
  const zones = s.zones.filter((z) => z.siteId === site.id);
  const zoneName = (id?: string) => zones.find((z) => z.id === id)?.name ?? '—';

  /* ---- what has been received so far (events of this site) */
  const receipts = useMemo(() => (s.events.filter((e) => e.type === 'StockMoved' && e.siteId === site.id && (e.payload as StockMovement).kind === 'receive') as Receipt[]).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), [s.events, site.id]);
  const realToday = new Date().toISOString().slice(0, 10);
  const todays = receipts.filter((e) => dayOf(e.occurredAt) === realToday || dayOf(e.occurredAt) === s.today);
  const refFor = (label: string) => materials.find((m) => m.label === label);
  const declaredKg = (m: StockMovement) => { const ref = refFor(readReason(m.reason).material); return ref ? m.qtyUnits * (ref.value ?? 1) : undefined; };
  const varianceOf = (m: StockMovement) => { const d = declaredKg(m); return d ? variancePct(d, m.qtyKg) : undefined; };
  const isShort = (m: StockMovement) => { const v = varianceOf(m); return v !== undefined && v < -tol; };
  const pastSuppliers = [...new Set(receipts.map((e) => readReason(e.payload.reason).supplier).filter(Boolean))].slice(0, 12);
  const lastZone = receipts.find((e) => zones.some((z) => z.id === e.payload.toZoneId))?.payload.toZoneId;

  /* ---- the delivery being received */
  const [supplier, setSupplier] = useState(''); const [noteNo, setNoteNo] = useState('');
  const [materialId, setMaterialId] = useState<string | null>(null); const [zoneId, setZoneId] = useState<string | null>(null);
  const [qty, setQty] = useState(''); const [reading, setReading] = useState<number | null>(null); const [remark, setRemark] = useState('');
  const [scaleRun, setScaleRun] = useState(0); const [shortDrill, setShortDrill] = useState(false);
  const [last, setLast] = useState<{ code: string; material: string; kg: number; zone: string; short: boolean } | null>(null);
  const supplierRef = useRef<HTMLInputElement>(null); const scaleRef = useRef<HTMLDivElement>(null); const modDown = useRef(false);
  useEffect(() => { if (!zoneId && lastZone) setZoneId(lastZone); }, [lastZone]); // eslint-disable-line react-hooks/exhaustive-deps

  const material: RefItem | undefined = materials.find((m) => m.id === materialId);
  const pack = packWord(material?.unit); const perPack = material?.value;
  // A material with a pack weight is declared in packs; one without is declared straight in kilos.
  const byPack = !!material && !!perPack && !!pack;
  const n = parseFloat(qty || '0') || 0; const expectedKg = material ? (byPack ? n * perPack! : n) : 0;
  const unitWord = byPack ? (n === 1 ? pack! : `${pack}s`) : 'kg';
  // Simulated lorry: a real delivery lands a little under the paper weight; the drill makes it clearly short.
  const targetKg = useMemo(() => Math.round(expectedKg * (shortDrill ? 0.93 : 0.988 + Math.random() * 0.012)), [expectedKg, shortDrill]);
  const v = reading !== null && expectedKg > 0 ? variancePct(expectedKg, reading) : undefined;
  const short = v !== undefined && v < -tol; const over = v !== undefined && v > tol;
  const missing = [!supplier.trim() && 'supplier', !material && 'material', !zoneId && 'zone', !(expectedKg > 0) && 'declared quantity', reading === null && 'scale reading'].filter(Boolean) as string[];
  const ready = missing.length === 0;

  const changeQty = (x: string) => { setQty(x); setReading(null); setScaleRun(0); };
  const readScale = () => { if (!(expectedKg > 0)) { toast({ kind: 'warn', title: 'Nothing declared yet', detail: 'Enter what the supplier\'s note says before weighing.' }); return; } setReading(null); setScaleRun((k) => k + 1); scaleRef.current?.scrollIntoView({ block: 'nearest' }); };
  const onReading = (kg: number) => { setReading(kg); beep(kg < expectedKg * (1 - tol / 100) ? 'bad' : 'ok'); };
  const clear = (keepSupplier = false) => { if (!keepSupplier) { setSupplier(''); } setNoteNo(''); setQty(''); setReading(null); setRemark(''); setScaleRun(0); setShortDrill(false); if (!touch) setTimeout(() => supplierRef.current?.focus(), 40); };

  const accept = () => {
    if (!ready || !material || reading === null || !zoneId) return;
    const reason = writeReason(material.label, supplier.trim(), noteNo.trim(), remark.trim());
    moveStock({ siteId: site.id, kind: 'receive', qtyUnits: n, qtyKg: reading, toZoneId: zoneId, reason });
    const label = createLabel({ siteId: site.id, kind: 'bag', stageCode: 'raw', day: s.today, qtyUnits: n, qtyKg: reading, status: 'in_stock', zoneId, parentIds: [], colour: material.label });
    beep(short ? 'bad' : 'ok');
    toast(short ? { kind: 'warn', title: `Received short · ${label.code}`, detail: `${fmtKg(reading)} against ${fmtKg(expectedKg)} declared. Written on the lot.` } : { kind: 'ok', title: `Received · ${label.code}`, detail: `${material.label}, ${fmtKg(reading)} into ${zoneName(zoneId)}.` });
    setLast({ code: label.code, material: material.label, kg: reading, zone: zoneName(zoneId), short });
    setMaterialId(null); clear();
  };
  useHotkey('mod+enter', () => { if (!pressUseReading(scaleRef.current)) readScale(); }, { label: 'Read the scale, then use the stable reading', enabled: reading === null && expectedKg > 0, allowInInput: true });
  useHotkey('w', readScale, { label: 'Read the gate scale' });
  useHotkey('x', () => { setShortDrill((d) => !d); setReading(null); setScaleRun(0); }, { label: 'Presenter: simulate a short delivery' });

  if (site.id === 'recycling') return (
    <div>
      <PageHeader eyebrow={`${site.name} · Stock`} title="Receive at the gate" subtitle="Supplier deliveries are weighed before they are accepted." />
      <Panel icon={Recycle} title="Inbound here is collector scrap"><Empty icon={Scale} title="Weigh collectors on the intake screen" hint="At this site everything inbound is weighed, deducted and paid in one step on the collector intake screen." action={<Button variant="primary" icon={Scale} onClick={() => go.site('production/intake')}>Open collector intake</Button>} /></Panel>
    </div>
  );

  const kgToday = todays.reduce((t, e) => t + e.payload.qtyKg, 0); const shortToday = todays.filter((e) => isShort(e.payload));
  const lostToday = shortToday.reduce((t, e) => t + ((declaredKg(e.payload) ?? 0) - e.payload.qtyKg), 0);
  const cols: Column<Receipt>[] = [
    { key: 'at', header: 'Time', cell: (e) => <span className="num text-[var(--text-2)]">{dayOf(e.occurredAt) === realToday ? fmtTime(e.occurredAt) : fmtDateTime(e.occurredAt)}</span> },
    { key: 'm', header: 'Material · supplier', truncate: 170, cell: (e) => { const r = readReason(e.payload.reason); return <span title={e.payload.reason}><span className="font-medium">{r.material || 'Material'}</span><span className="t-sm text-[var(--text-3)]"> · {r.supplier || 'supplier not written'}</span></span>; } },
    { key: 'kg', header: 'Scale kg', align: 'right', mono: true, cell: (e) => <span className="font-medium">{fmtNum(e.payload.qtyKg)}</span> },
    { key: 'v', header: 'vs note', align: 'right', cell: (e) => <VarianceBadge pct={varianceOf(e.payload)} tolerancePct={tol} /> },
  ];

  return (
    <div>
      <PageHeader eyebrow={`${site.name} · Stock`} title="Receive at the gate" meta={<><Badge tone="neutral">Scale tolerance ±{tol}%</Badge>{shortToday.length > 0 && <Badge tone="bad" dot>{plural(shortToday.length, 'short delivery', 'short deliveries')} today</Badge>}</>}
        subtitle="Nothing is accepted on the paper alone: the supplier's note against the scale, every time."
        actions={<Button icon={ArrowRightLeft} onClick={() => go.site('stock/movements')}>Movements</Button>} />

      <KpiStrip className="mb-[var(--gap)] md:grid-cols-4!">
        <Stat label="Deliveries today" icon={Truck} accent="var(--series-1)" value={<CountUp value={todays.length} />} sub={todays[0] ? `Last at ${fmtTime(todays[0].occurredAt)} · ${readReason(todays[0].payload.reason).material}` : 'Nothing weighed in yet today'} />
        <Stat label="Kilos received today" icon={Scale} accent="var(--series-4)" value={<><CountUp value={Math.round(kgToday)} /><span className="t-base text-[var(--text-3)] font-medium"> kg</span></>} sub={todays.length ? `${plural(new Set(todays.map((e) => readReason(e.payload.reason).material)).size, 'material')} · scale weight` : 'Scale weight, not paper weight'} />
        <Stat label="Short against the note" icon={AlertTriangle} accent="var(--series-8)" tone={shortToday.length ? 'bad' : 'neutral'} value={<CountUp value={shortToday.length} />} sub={shortToday.length ? `${fmtKg(Math.round(lostToday))} less than the suppliers declared` : `No delivery outside −${tol}% today`} />
        <Stat label="Lots on record" icon={ScrollText} accent="var(--series-7)" value={<CountUp value={receipts.length} />} sub={`${plural(materials.length, 'material')} · ${plural(zones.length, 'zone')} set up`} onClick={() => go.site('stock/movements', undefined, 'receive')} />
      </KpiStrip>

      <Bench asideWidth={400} aside={<>
        <Panel icon={FileText} title="Goods received note" sub={ready ? 'ready' : 'fills in as you go'} actions={v !== undefined ? <Badge tone={short ? 'bad' : over ? 'warn' : 'ok'} dot className="mr-1.5">{short ? 'Short' : over ? 'Over the note' : 'Within tolerance'}</Badge> : undefined}>
          <KV label="Supplier">{supplier.trim() || <span className="text-[var(--text-4)] font-normal">not entered</span>}</KV>
          <KV label="Supplier's note no.">{noteNo.trim() || <span className="text-[var(--text-4)] font-normal">—</span>}</KV>
          <KV label="Material">{material?.label ?? <span className="text-[var(--text-4)] font-normal">not chosen</span>}</KV>
          <KV label="Declared on the note">{n > 0 && material ? (byPack ? `${fmtNum(n)} ${unitWord} · ${fmtKg(expectedKg)}` : fmtKg(expectedKg)) : <span className="text-[var(--text-4)] font-normal">—</span>}</KV>
          <KV label="Gate scale">{reading !== null ? fmtKg(reading) : <span className="text-[var(--text-4)] font-normal">not weighed</span>}</KV>
          <KV label="Scale against the note">{v !== undefined ? <span style={{ color: short ? 'var(--bad)' : over ? 'var(--warn)' : 'var(--ok)' }}>{fmtPct(v, true)} · {fmtKg(Math.round((reading! - expectedKg) * 10) / 10)}</span> : <span className="text-[var(--text-4)] font-normal">—</span>}</KV>
          <KV label="Into zone">{zoneId ? zoneName(zoneId) : <span className="text-[var(--text-4)] font-normal">not chosen</span>}</KV>
          <div className="mt-3"><Gauge variancePct={v} tolerancePct={tol} width={520} /></div>
          <div className="t-xs text-[var(--text-3)] mt-2">Inside the green band the delivery matches its paper. Left of it, kilos are missing and the lot is marked short.</div>
        </Panel>
        {last && (
          <Panel icon={ClipboardCheck} title="Just accepted" sub={<span className="code">{last.code}</span>} actions={<Badge tone={last.short ? 'bad' : 'ok'} dot className="mr-1.5">{last.short ? 'Marked short' : 'Accepted'}</Badge>}>
            <div className="t-base">{last.material} · <span className="num font-medium">{fmtKg(last.kg)}</span> into {last.zone}.</div>
            <div className="t-sm text-[var(--text-3)] mt-0.5">The lot code is on the stock wall and in the movements ledger with your name.</div>
          </Panel>
        )}
        <Panel icon={ScrollText} title="Received today" sub={plural(todays.length, 'delivery', 'deliveries')} pad={false} actions={<Button size="sm" variant="ghost" onClick={() => go.site('stock/movements', undefined, 'receive')}>All receipts</Button>}
          footer={todays.length ? <div className="flex justify-between gap-3"><span>Total on the scale</span><span className="num font-medium text-[var(--text)]">{fmtKg(Math.round(kgToday))}</span></div> : 'Raw material is issued to production on the production screens, so kilos in can be matched to kilos out.'}>
          <DataGrid bare dense rows={todays} columns={cols} rowKey={(e) => e.id} maxHeight={280} empty="Nothing received yet today. Accepted deliveries land here with their scale weight." />
        </Panel>
      </>}>
        <Panel icon={PackageOpen} title="Delivery at the gate" sub={material ? `${material.label}${supplier.trim() ? ` from ${supplier.trim()}` : ''}` : 'supplier, material, paper weight, scale weight'} pad={false}
          actions={<Button size="sm" variant="ghost" icon={Eraser} disabled={!supplier && !qty && !noteNo} onClick={() => clear()}>Clear</Button>}
          footer={<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span className="min-w-0">{ready ? (short ? <span className="text-[var(--bad)] font-medium">{fmtKg(Math.round((expectedKg - reading!) * 10) / 10)} missing against the note. Accepting writes the shortfall on the lot.</span> : `${fmtKg(reading!)} of ${material!.label} into ${zoneName(zoneId!)}.`) : `Still needed: ${missing.join(', ')}.`}</span>
            <Button variant={short ? 'danger' : 'primary'} icon={PackageCheck} hotkey="mod+enter" hotkeyLabel="Accept the delivery" disabled={!ready} onClick={accept}>{short ? 'Accept short' : 'Accept delivery'}</Button>
          </div>}>
          <Step n={1} title="Supplier" hint="as written on their delivery note">
            <FormRow label="Supplier" required>
              <Input ref={supplierRef} autoFocus={!touch} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Company or person delivering" className="max-w-[380px]" list="tn-suppliers" autoComplete="off" />
              <datalist id="tn-suppliers">{pastSuppliers.map((x) => <option key={x} value={x} />)}</datalist>
            </FormRow>
            <FormRow label="Their note no."><Input value={noteNo} onChange={(e) => setNoteNo(e.target.value)} placeholder="Optional" className="max-w-[200px] code" autoComplete="off" /></FormRow>
          </Step>
          <Step n={2} title="Material and zone" hint="pack weights come from Settings">
            <FormRow label="Material" required>
              {materials.length === 0 ? <SetupHint inline what="materials" />
                : materials.length > 8 ? <Combobox className="max-w-[380px]" value={materialId} onChange={(m) => { setMaterialId(m); changeQty(''); }} placeholder="Search material" options={materials.map((m) => ({ value: m.id, label: m.label, sub: m.value ? `${m.value} ${m.unit ?? ''}` : m.unit }))} />
                  : <ChipGroup ariaLabel="Material" value={materialId} onChange={(m) => { setMaterialId(m); changeQty(''); }} options={materials.map((m) => ({ value: m.id, label: <>{m.label}{(m.value || m.unit) && <span className="num t-sm font-normal opacity-70">{m.value ? `${m.value} ${m.unit ?? ''}` : m.unit}</span>}</> }))} />}
            </FormRow>
            <FormRow label="Into zone" required>
              {zones.length === 0 ? <SetupHint inline what="store zones" where="Store zones" /> : <ChipGroup ariaLabel="Zone" value={zoneId} onChange={setZoneId} options={zones.map((z) => ({ value: z.id, label: z.name }))} />}
            </FormRow>
          </Step>
          <Step n={3} title="Declared on the note" hint={material ? (byPack ? `${perPack} ${material.unit}` : 'declared in kilos') : 'choose the material first'}>
            <div className="grid gap-[var(--gap)] md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] items-start">
              {/* Ctrl+Enter belongs to the page (use the reading, accept); plain Enter in the field reads the scale. */}
              <div onKeyDownCapture={(e) => { modDown.current = e.ctrlKey || e.metaKey; }}><QtyPad key={materialId ?? 'none'} value={qty} onChange={changeQty} onDone={() => { if (!modDown.current) readScale(); }} doneLabel="Weigh" allowDecimal={!byPack} label={byPack ? `${pack![0].toUpperCase()}${pack!.slice(1)}s on the note` : 'Kilos on the note'} unit={byPack ? `${pack}s` : 'kg'} width={150} max={byPack ? 9999 : 99999} /></div>
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 min-w-0">
                <div className="t-sm font-medium text-[var(--text-2)]">Paper weight</div>
                <div className="t-kpi num">{fmtNum(Math.round(expectedKg * 10) / 10)}<span className="t-base text-[var(--text-3)] font-medium"> kg</span></div>
                <div className="t-sm text-[var(--text-3)] num truncate">{!material ? 'No material chosen' : byPack ? `${fmtNum(n)} × ${perPack} kg per ${pack}` : 'As declared by the supplier'} · passes from {fmtKg(Math.round(expectedKg * (1 - tol / 100)))}</div>
              </div>
            </div>
          </Step>
          <Step n={4} title="Weigh" hint="the scale decides, not the paper" right={<Button size="sm" variant={shortDrill ? 'danger' : 'ghost'} icon={Weight} aria-pressed={shortDrill} onClick={() => { setShortDrill((d) => !d); setReading(null); setScaleRun(0); }} title="Presenter: the lorry carries less than the note says">{shortDrill ? 'Simulating a short delivery' : 'Simulate short'}</Button>}>
            <div ref={scaleRef} className="scroll-mb-4">
              <ScaleWidget key={`${scaleRun}-${targetKg}`} autoStart={scaleRun > 0} targetKg={targetKg} disabled={!(expectedKg > 0)} onReading={onReading} title="Gate scale" model={expectedKg > 0 ? 'Load on the scale, then read' : 'Enter the declared quantity first'} />
            </div>
            {reading !== null && (
              <div className="mt-3 anim-up">
                {short ? <Note tone="bad"><span className="font-medium">Short delivery.</span> The scale reads {fmtKg(reading)}, {fmtKg(Math.round((expectedKg - reading) * 10) / 10)} less than the note ({fmtPct(v!, true)}, tolerance ±{tol}%). You can still accept it: the shortfall is written on the lot.
                  <Input className="mt-2" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Remark for the supplier's record (optional)" /></Note>
                  : over ? <Note tone="warn">The scale reads {fmtKg(reading)}, {fmtPct(v!, true)} over the note. Accepting books the scale weight.</Note>
                    : <Note tone="ok">The scale reads {fmtKg(reading)}, {fmtPct(v!, true)} against the note: inside ±{tol}%.</Note>}
              </div>
            )}
            <div className="touch:hidden t-xs text-[var(--text-3)] mt-2">Enter in the quantity field reads the scale. Ctrl+Enter uses the stable reading, then accepts.</div>
          </Step>
        </Panel>
      </Bench>
    </div>
  );
}
