import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ClipboardList, Package, Printer, Scale, Scissors, Tag } from 'lucide-react';
import type { Label, Product } from '@tanaad/domain';
import { bundlesFromPieces } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { lastWorkingDays, machineWall, machinesOf } from '@/data/selectors';
import { Avatar, Badge, Button, ChipGroup, Combobox, DataGrid, Empty, FormRow, Gauge, Meter, Note, NumberPad, PageHeader, Panel, Stat, useIsTouch, type Column } from '@/components/ui';
import { CountUp } from '@/components/charts';
import { PersonPicker } from '@/components/PersonPicker';
import { ScaleWidget } from '@/components/ScaleWidget';
import { Sticker } from '@/components/Sticker';
import { fmtKg, fmtNum, fmtPct } from '@/data/format';
import { sectorForStage } from '../production/shared';
import { SetupHint } from '../production/parts';
import { addProduction, draftLabel, Figure, FlowStrip, focusFirstField, FormSection, onModEnter, PrintRun, ScaleFrame, StickerStage, TabThrough, useShift, Workbench } from './kit';

interface Sample { n: number; productId: string; kg: number; at: string }
interface LogRow { key: string; loom: string; product?: Product; finisher?: string; seed?: string; bundles: number; pieces: number; kg: number; zone: string }

const Swatch = ({ colour }: { colour?: string }) => <span aria-hidden className="size-2.5 rounded-[3px] shrink-0 border border-black/15 dark:border-white/20" style={{ background: colour ?? 'var(--text-4)' }} />;

/** M4 · Hand finishing and bundling: sewn pieces become bundles of the product's own bundle size, each bundle gets a sticker. */
export function Finishing() {
  const s = useStore(); const { today, site, kind, kindLabel, shift } = useShift(); const touch = useIsTouch();
  const mats = s.products.filter((p) => p.siteId === site.id && p.kind === 'mat' && p.active !== false);
  const looms = machinesOf(s, site.id, 'weave').filter((m) => m.status !== 'arriving' && m.status !== 'retired');
  // Finished bundles go to any zone that already holds finished goods; a site with no history yet offers every zone.
  const zones = useMemo(() => { const all = s.zones.filter((z) => z.siteId === site.id); const used = new Set(s.labels.filter((l) => l.siteId === site.id && l.kind === 'bundle' && l.zoneId).map((l) => l.zoneId)); const fin = all.filter((z) => used.has(z.id)); return fin.length ? fin : all; }, [s.zones, s.labels, site.id]);
  const [productId, setProductId] = useState<string | null>(null); const [loomId, setLoomId] = useState<string | null>(null); const [finisher, setFinisher] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string>(zones[0]?.id ?? ''); const [pieces, setPieces] = useState('');
  const [run, setRun] = useState<Label[]>([]); const [printing, setPrinting] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]); const [scaleRound, setScaleRound] = useState(0);
  const [loose, setLoose] = useState<Record<string, number>>({});
  const form = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!touch) focusFirstField(form.current); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const product = mats.find((p) => p.id === productId); const nPieces = parseInt(pieces || '0', 10) || 0;
  const split = product ? bundlesFromPieces(nPieces, product.bundlePieces) : { bundles: 0, loosePieces: nPieces };
  const targetKg = useMemo(() => (product ? Math.round(product.stdBundleWeightKg * (0.97 + Math.random() * 0.06) * 10) / 10 : 0), [product, scaleRound]); // eslint-disable-line react-hooks/exhaustive-deps
  const todaysBundles = useMemo(() => s.labels.filter((l) => l.siteId === site.id && l.kind === 'bundle' && l.day === today), [s.labels, today, site.id]);
  const byProduct = mats.map((p) => ({ product: p, bundles: todaysBundles.filter((l) => l.productId === p.id).length, loose: loose[p.id] ?? 0 })).filter((r) => r.bundles || r.loose);
  const wall = useMemo(() => machineWall(s, site.id, today, kind), [s, site.id, today, kind]);
  const person = (id?: string | null) => s.people.find((p) => p.id === id);
  const zoneName = (id?: string) => s.zones.find((z) => z.id === id)?.name ?? '—';
  const ready = !!product && !!loomId && !!finisher && !!zoneId && split.bundles > 0 && !printing;
  const missing = [product ? null : 'product', loomId ? null : 'loom', finisher ? null : 'finisher', split.bundles > 0 ? null : product && nPieces > 0 ? `at least ${product.bundlePieces} pieces` : 'pieces'].filter(Boolean);
  const looseTotal = Object.values(loose).reduce((t, n) => t + n, 0);
  const days = lastWorkingDays(site.id, today, 7).slice(0, -1); const pastBundles = days.map((d) => s.labels.filter((l) => l.siteId === site.id && l.kind === 'bundle' && l.day === d).length);
  const piecesToday = todaysBundles.reduce((t, l) => t + l.qtyUnits, 0);

  /** Today's stickers rolled up by loom, product, finisher and zone: the log of what has been bundled so far. */
  const log = useMemo<LogRow[]>(() => {
    const m = new Map<string, LogRow>();
    for (const l of todaysBundles) {
      const key = `${l.machineId}|${l.productId}|${l.operatorId}|${l.zoneId}`; const op = s.people.find((p) => p.id === l.operatorId);
      const row = m.get(key) ?? { key, loom: s.machines.find((x) => x.id === l.machineId)?.code ?? '—', product: s.products.find((p) => p.id === l.productId), finisher: op?.fullName, seed: op?.avatarSeed, bundles: 0, pieces: 0, kg: 0, zone: s.zones.find((z) => z.id === l.zoneId)?.name ?? '—' };
      row.bundles += 1; row.pieces += l.qtyUnits; row.kg += l.qtyKg; m.set(key, row);
    }
    return [...m.values()].reverse();
  }, [todaysBundles, s.people, s.machines, s.products, s.zones]);

  const pickLoom = (id: string | null) => {
    setLoomId(id);
    const onLoom = wall.find((t) => t.machine.id === id)?.product;
    if (id && !productId && onLoom && mats.some((p) => p.id === onLoom.id)) setProductId(onLoom.id);
  };
  const bundleAndPrint = () => {
    if (!ready || !product || !loomId || !finisher) return;
    const labels: Label[] = [];
    for (let i = 0; i < split.bundles; i++) labels.push(s.createLabel({ siteId: site.id, kind: 'bundle', productId: product.id, stageCode: 'finish', machineId: loomId, operatorId: finisher, shiftId: shift, day: today, qtyUnits: product.bundlePieces, qtyKg: product.stdBundleWeightKg, zoneId, parentIds: [] }));
    addProduction({ siteId: site.id, stageCode: 'finish', machineId: loomId, shiftId: shift, day: today, operatorId: finisher, productId: product.id, goodUnits: split.bundles * product.bundlePieces, outputKg: split.bundles * product.stdBundleWeightKg });
    if (split.loosePieces) setLoose((m) => ({ ...m, [product.id]: (m[product.id] ?? 0) + split.loosePieces }));
    setRun(labels); setPrinting(true); setPieces('');
    if (!touch) focusFirstField(form.current);
  };
  const onPrinted = () => { setPrinting(false); useStore.getState().toast({ kind: 'ok', title: `${run.length} bundle sticker${run.length === 1 ? '' : 's'} printed`, detail: `${s.products.find((p) => p.id === run[0]?.productId)?.internalName} · ${zoneName(run[0]?.zoneId)}` }); };
  const onSample = (kg: number) => { if (!product) return; setSamples((x) => [{ n: x.filter((y) => y.productId === product.id).length + 1, productId: product.id, kg, at: new Date().toISOString() }, ...x]); setScaleRound((r) => r + 1); useStore.getState().toast({ kind: 'info', title: `Calibration sample ${fmtKg(kg)} recorded`, detail: `${product.internalName} · standard ${fmtKg(product.stdBundleWeightKg)}` }); };
  const mine = samples.filter((x) => x.productId === productId); const mean = mine.length ? mine.reduce((t, x) => t + x.kg, 0) / mine.length : 0;
  const variance = product && mine.length ? ((mean - product.stdBundleWeightKg) / product.stdBundleWeightKg) * 100 : undefined;

  const preview = draftLabel(s.labels.length, { siteId: site.id, kind: 'bundle', productId: product?.id, stageCode: 'finish', machineId: loomId ?? undefined, operatorId: finisher ?? undefined, shiftId: shift, day: today, qtyUnits: product?.bundlePieces ?? 0, qtyKg: product?.stdBundleWeightKg ?? 0, zoneId, parentIds: [] });
  const runProduct = s.products.find((p) => p.id === run[0]?.productId);

  const logCols: Column<LogRow>[] = [
    { key: 'loom', header: 'Loom', sort: (r) => r.loom.replace(/\d+/, (n) => n.padStart(3, '0')), cell: (r) => <span className="font-medium">{r.loom}</span> },
    { key: 'product', header: 'Product', sort: (r) => r.product?.internalName ?? '', cell: (r) => <span className="inline-flex items-center gap-1.5"><Swatch colour={r.product?.colour} />{r.product?.internalName ?? '—'}</span> },
    { key: 'by', header: 'Finisher', truncate: 170, cell: (r) => (r.finisher ? <span className="inline-flex items-center gap-1.5"><Avatar name={r.finisher} seed={r.seed} size={18} />{r.finisher}</span> : <span className="text-[var(--text-4)]">—</span>) },
    { key: 'bundles', header: 'Bundles', align: 'right', mono: true, sort: (r) => r.bundles, cell: (r) => <span className="font-medium">{fmtNum(r.bundles)}</span> },
    { key: 'pieces', header: 'Pieces', align: 'right', mono: true, sort: (r) => r.pieces, cell: (r) => fmtNum(r.pieces) },
    { key: 'kg', header: 'Std kg', align: 'right', mono: true, sort: (r) => r.kg, cell: (r) => fmtNum(Math.round(r.kg * 10) / 10) },
    { key: 'zone', header: 'Zone', truncate: 130, cell: (r) => <span className="text-[var(--text-2)]">{r.zone}</span> },
  ];
  const sampleCols: Column<Sample>[] = [
    { key: 'n', header: 'Sample', cell: (x) => <span className="text-[var(--text-2)]">#{x.n}</span> },
    { key: 'kg', header: 'Weighed', align: 'right', mono: true, cell: (x) => <span className="font-medium">{fmtKg(x.kg)}</span> },
    { key: 'v', header: 'vs standard', align: 'right', mono: true, cell: (x) => (product ? fmtPct(((x.kg - product.stdBundleWeightKg) / product.stdBundleWeightKg) * 100, true) : '—') },
  ];

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <div className="-mb-[var(--gap)]">
        <PageHeader eyebrow={`${site.name} · Finishing`} title="Finishing and bundling" meta={<><Badge tone="neutral">{kindLabel} shift</Badge><Badge tone="neutral" dot>{todaysBundles.length} bundles today</Badge></>}
          subtitle="Count the sewn pieces. The system makes the bundles and prints one sticker per bundle." />
      </div>
      <FlowStrip current="finish" />

      <Workbench aside={<>
        <Panel icon={Tag} title="Bundle sticker" sub="live preview" actions={<Badge tone="neutral">{split.bundles > 1 ? `1 of ${split.bundles}` : 'Preview'}</Badge>}>
          <StickerStage caption={product ? `One sticker for every bundle of ${product.bundlePieces}. Standard weight ${fmtKg(product.stdBundleWeightKg)}${product.weightStatus === 'to_be_measured' ? ', marked * until it is measured' : ''}.` : 'Choose a product and the sticker fills in.'}>
            <Sticker label={preview} product={product} machine={s.machines.find((m) => m.id === loomId)} operator={person(finisher)} site={site} shiftKind={kindLabel} />
          </StickerStage>
        </Panel>
        <div className="grid grid-cols-2 gap-[var(--gap)]">
          <Stat label="Bundles today" icon={Package} accent="var(--series-1)" value={<CountUp value={todaysBundles.length} />} spark={pastBundles} sub={`${fmtNum(piecesToday)} pieces bundled`} />
          <Stat label="Loose pieces" icon={Scissors} accent="var(--series-4)" value={<CountUp value={looseTotal} />} sub="on the table, this device" />
        </div>
        <Panel icon={Package} title="Bundles by product" sub="today" footer={<span className="inline-flex items-start gap-1.5"><Scissors className="size-3.5 mt-px shrink-0" />Loose pieces are counted on this device until they make a full bundle.</span>}>
          {byProduct.length === 0 ? <Empty icon={Package} title="No bundles yet today" hint="Bundles appear here as soon as the first stickers print." /> : byProduct.map((r) => <Meter key={r.product.id} label={<span className="inline-flex items-center gap-1.5"><Swatch colour={r.product.colour} />{r.product.internalName}</span>} sub={`${fmtNum(r.bundles * r.product.bundlePieces)} pcs${r.loose ? ` · ${r.loose} loose` : ''}`} value={r.bundles} max={Math.max(1, ...byProduct.map((x) => x.bundles))} display={`${fmtNum(r.bundles)} bundle${r.bundles === 1 ? '' : 's'}`} />)}
        </Panel>
      </>}>
        <Panel icon={Scissors} title="Bundle sewn mats" sub="pieces in, bundles and stickers out" className="[&>footer]:sticky [&>footer]:bottom-0 [&>footer]:z-[5]"
          footer={<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span className="min-w-0">{printing ? `Printing ${run.length} sticker${run.length === 1 ? '' : 's'}…` : missing.length ? <>Still needed: <span className="text-[var(--text)] font-medium">{missing.join(', ')}</span></> : <><span className="text-[var(--text)] font-medium">{split.bundles} × {product?.internalName}</span> · {fmtKg((product?.stdBundleWeightKg ?? 0) * split.bundles)} standard · to {zoneName(zoneId)}</>}</span>
            <Button variant="primary" size="lg" icon={Printer} disabled={!ready} onClick={bundleAndPrint} hotkey="mod+enter" hotkeyLabel="Bundle and print the stickers">{printing ? 'Printing' : split.bundles > 0 ? `Bundle and print ${split.bundles} sticker${split.bundles === 1 ? '' : 's'}` : 'Bundle and print stickers'}</Button>
          </div>}>
          <div ref={form} onKeyDownCapture={onModEnter(bundleAndPrint)}>
            <FormSection n={1} title="What was sewn">
              <FormRow label="Product" required>{mats.length === 0 ? <SetupHint inline what="mat products" where="Products" /> : mats.length <= 8
                ? <ChipGroup ariaLabel="Product" options={mats.map((p) => ({ value: p.id, label: <span className="inline-flex items-center gap-1.5"><Swatch colour={p.colour} />{p.internalName}<span className="num t-xs text-[var(--text-3)]">×{p.bundlePieces}</span></span> }))} value={productId} onChange={setProductId} />
                : <div className="max-w-[380px]"><Combobox placeholder="Search product" value={productId} onChange={setProductId} options={mats.map((p) => ({ value: p.id, label: p.internalName, sub: `bundle of ${p.bundlePieces}`, left: <Swatch colour={p.colour} /> }))} /></div>}</FormRow>
              <FormRow label="From loom" required>
                <div className="max-w-[380px]"><Combobox placeholder="Search loom" value={loomId} onChange={pickLoom}
                  options={looms.map((m) => { const t = wall.find((x) => x.machine.id === m.id); return { value: m.id, label: m.code, sub: t?.product ? `${t.product.internalName}${t.entry ? ` · ${fmtNum(t.entry.goodUnits)} woven` : ''}` : m.status === 'down' ? 'down' : 'not logged this shift', words: t?.product?.internalName }; })} /></div>
              </FormRow>
              <FormRow label="Finisher" required><TabThrough className="max-w-[380px]"><PersonPicker siteId={site.id} sector={sectorForStage(site, 'finish')} value={finisher} onChange={(id) => setFinisher(id)} /></TabThrough></FormRow>
            </FormSection>
            <FormSection n={2} title="Count">
              <FormRow label="Pieces sewn" required>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)] items-start">
                  <NumberPad value={pieces} onChange={setPieces} suffix="pcs" max={2000} />
                  <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
                    <div className="grid grid-cols-3 gap-3">
                      <Figure label={product ? `Bundles of ${product.bundlePieces}` : 'Bundles'} value={fmtNum(split.bundles)} sub={product ? `${fmtNum(nPieces)} ÷ ${product.bundlePieces}` : 'choose a product'} />
                      <Figure label="Loose pieces" value={fmtNum(split.loosePieces)} sub="stay on the table" tone={split.loosePieces && product ? 'warn' : 'neutral'} />
                      <Figure label="Standard weight" value={product ? <>{fmtNum(Math.round(split.bundles * product.stdBundleWeightKg * 10) / 10)}<span className="t-sm font-normal text-[var(--text-3)]"> kg</span></> : '—'} sub={product ? `${split.bundles} × ${fmtKg(product.stdBundleWeightKg)}` : undefined} />
                    </div>
                    {product?.weightStatus === 'to_be_measured' && <div className="mt-1.5 pt-1.5 border-t border-[var(--line)] flex items-center gap-2 t-xs text-[var(--text-3)]"><Badge tone="warn" dot>To be measured</Badge>Standard {fmtKg(product.stdBundleWeightKg)} per bundle is illustrative.</div>}
                  </div>
                </div>
              </FormRow>
            </FormSection>
            <FormSection n={3} title="Where it goes">
              <FormRow label="Store zone">{zones.length === 0 ? <SetupHint inline what="store zones" where="Zones" /> : <ChipGroup ariaLabel="Store zone" options={zones.map((z) => ({ value: z.id, label: z.name }))} value={zoneId} onChange={setZoneId} />}</FormRow>
            </FormSection>
          </div>
        </Panel>

        {run.length > 0 && (
          <Panel icon={Printer} title={printing ? 'Printing stickers' : 'Stickers printed'} sub={`${runProduct?.internalName ?? ''} · ${zoneName(run[0].zoneId)}`} className="anim-pop"
            actions={<Badge tone={printing ? 'accent' : 'ok'} dot>{printing ? 'Printing' : <><Check className="size-3" />{run.length} bundle{run.length === 1 ? '' : 's'}</>}</Badge>}>
            <PrintRun labels={run} site={site} product={runProduct} machine={s.machines.find((m) => m.id === run[0].machineId)} operator={person(run[0].operatorId)} shiftKind={kindLabel} onDone={onPrinted} />
          </Panel>
        )}

        <Panel icon={Scale} title="Calibration" sub="weigh a finished bundle" actions={product ? <Badge tone={product.weightStatus === 'to_be_measured' ? 'warn' : 'ok'} dot>{product.weightStatus === 'to_be_measured' ? 'To be measured' : 'Measured'}</Badge> : undefined}>
          {mats.some((p) => p.weightStatus === 'to_be_measured') && <Note tone="warn" className="mb-3"><strong>Standard bundle weights are to be measured.</strong> {mats.filter((p) => p.weightStatus === 'to_be_measured').length} of {mats.length} products still carry an illustrative weight. Every bundle weighed here tightens the standard the gate uses.</Note>}
          {!product ? <div className="rounded-md border border-dashed border-[var(--line-2)] px-3 py-2.5 t-sm text-[var(--text-3)] flex items-center gap-2"><Scale className="size-4 shrink-0" />Choose a product in the form above and the finishing scale opens for it.</div> : (
            <div className="grid gap-x-5 gap-y-3 min-[1240px]:grid-cols-[minmax(0,1fr)_minmax(0,270px)] items-start">
              <ScaleFrame><ScaleWidget key={scaleRound} title="Finishing scale" targetKg={targetKg} onReading={onSample} /></ScaleFrame>
              <div className="min-w-0 min-[1240px]:border-l min-[1240px]:border-[var(--line)] min-[1240px]:pl-5">
                <div className="t-label mb-1.5">{product.internalName} · mean vs standard</div>
                <div className="grid grid-cols-3 gap-2 mb-2.5">
                  <Figure label="Samples" value={mine.length} />
                  <Figure label="Mean" value={mine.length ? <>{fmtNum(Math.round(mean * 10) / 10)}<span className="t-sm font-normal text-[var(--text-3)]"> kg</span></> : '—'} sub={`std ${fmtKg(product.stdBundleWeightKg)}`} />
                  <Figure label="vs standard" value={variance === undefined ? '—' : fmtPct(variance, true)} tone={variance === undefined ? 'neutral' : Math.abs(variance) <= product.weightTolerancePct ? 'ok' : 'warn'} sub={`± ${product.weightTolerancePct}% allowed`} />
                </div>
                <Gauge variancePct={variance} tolerancePct={product.weightTolerancePct} width={420} />
                <DataGrid bare dense className="mt-2.5 rounded-md border border-[var(--line)]" rows={mine.slice(0, 8)} columns={sampleCols} rowKey={(x) => `${x.productId}-${x.n}`} maxHeight={150} empty="No sample weighed yet for this product." />
              </div>
            </div>
          )}
        </Panel>

        <Panel icon={ClipboardList} title="Bundled today" sub="by loom, product and finisher" pad={false}>
          <DataGrid bare dense rows={log} columns={logCols} rowKey={(r) => r.key} maxHeight={300}
            empty={<Empty icon={Package} title="No bundles yet today" hint="Each print run adds a line here." />}
            footer={log.length ? <tr><td colSpan={3}>{log.length} lines</td><td className="num text-right">{fmtNum(todaysBundles.length)}</td><td className="num text-right">{fmtNum(piecesToday)}</td><td className="num text-right">{fmtNum(Math.round(todaysBundles.reduce((t, l) => t + l.qtyKg, 0)))}</td><td /></tr> : undefined} />
        </Panel>
      </Workbench>
    </div>
  );
}
