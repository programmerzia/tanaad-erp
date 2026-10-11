import { useEffect, useMemo, useState } from 'react';
import { Boxes, Check, CheckCircle2, Printer, ScanLine, Scissors, Scroll, Tag } from 'lucide-react';
import type { Label } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useGo, useRefList, useSiteSettings } from '@/app/hooks';
import { machinesOf } from '@/data/selectors';
import { Badge, Bar, Button, ChipGroup, Combobox, DataGrid, FormRow, Input, Meter, Note, NumberPad, PageHeader, Panel, Stat, cn, type Column } from '@/components/ui';
import { CountUp } from '@/components/charts';
import { Sticker } from '@/components/Sticker';
import { fmtDayShort, fmtKg, fmtNum, fmtPct } from '@/data/format';
import { addProduction, BarCell, Calc, dash, FormSection, PrintRun, SettingsEmpty, shortCode, Swatch, useFirstField, useShift, WIDE, Workbench } from './kit';

/** Labels animated on screen per run; the rest print in the background. */
const MAX_PRINT = 12;
const ALL = '__all';

/** B3 · Conversion: rolls consumed by scan, packs produced by size, colour and brand, one label per pack. Process to be confirmed. */
export function Conversion() {
  const s = useStore(); const go = useGo(); const { today, site, kindLabel, shift } = useShift();
  const converters = machinesOf(s, 'bags', 'convert');
  const [converterId, setConverterId] = useState<string | null>(null); const [selected, setSelected] = useState<string[]>([]); const [code, setCode] = useState('');
  const sizes = useRefList('bag_size'); const colours = useRefList('bag_colour'); const brands = useRefList('brand'); const rules = useSiteSettings();
  const [sizeId, setSizeId] = useState(ALL); const [colourId, setColourId] = useState(ALL); const [productId, setProductId] = useState<string | null>(null); const [brandId, setBrandId] = useState<string | null>(null);
  useEffect(() => { if (!brands.some((b) => b.id === brandId)) setBrandId(brands[0]?.id ?? null); }, [brands, brandId]);
  /** Pack products are store data (Settings → Products). The size and colour chips only narrow the list; they never make up a product. */
  const packProducts = useMemo(() => s.products.filter((p) => p.siteId === 'bags' && p.kind === 'bag_pack' && p.active !== false), [s.products]);
  const size = sizes.find((x) => x.id === sizeId); const colour = colours.find((x) => x.id === colourId); const brand = brands.find((b) => b.id === brandId)?.label;
  const matches = useMemo(() => { const has = (name: string, label: string) => ` ${name.toLowerCase()} `.includes(` ${label.toLowerCase()} `); return packProducts.filter((p) => (!size || has(p.internalName, size.label)) && (!colour || has(p.internalName, colour.label) || (!!colour.color && p.colour?.toLowerCase() === colour.color.toLowerCase()))); }, [packProducts, size, colour]);
  useEffect(() => { if (matches.length === 1) setProductId(matches[0].id); else if (productId && !matches.some((p) => p.id === productId)) setProductId(null); }, [matches]); // eslint-disable-line react-hooks/exhaustive-deps
  const [packs, setPacks] = useState(''); const [rejects, setRejects] = useState('');
  const [run, setRun] = useState<Label[]>([]); const [printing, setPrinting] = useState(false); const [lastYield, setLastYield] = useState<{ inKg: number; outKg: number } | null>(null);
  const [formRef, focusFirst] = useFirstField<HTMLDivElement>();

  const rolls = useMemo(() => s.labels.filter((l) => l.siteId === 'bags' && l.kind === 'roll' && l.status === 'in_stock').sort((a, b) => a.day.localeCompare(b.day) || a.code.localeCompare(b.code)), [s.labels]);
  const product = packProducts.find((p) => p.id === productId); const packPieces = product?.bundlePieces ?? 0; const unit = product?.unit ?? 'pack';
  const extruders = machinesOf(s, 'bags', 'extrude');
  const nPacks = parseInt(packs || '0', 10) || 0; const nRejects = parseInt(rejects || '0', 10) || 0;
  const inKg = rolls.filter((r) => selected.includes(r.id)).reduce((t, r) => t + r.qtyKg, 0); const outKg = product ? Math.round(nPacks * product.stdBundleWeightKg * 10) / 10 : 0;
  const lossPct = inKg ? ((inKg - outKg) / inKg) * 100 : 0; const hasYield = inKg > 0 && nPacks > 0 && !!product; const overLoss = lossPct > rules.massGapPct;
  const converter = converters.find((m) => m.id === converterId);
  const ready = !!converter && !!product && nPacks > 0 && !printing;
  const missing = [!converter && 'a converter', !product && 'a product', nPacks <= 0 && 'the number of packs'].filter((x): x is string => !!x);
  const preview: Label = useMemo(() => ({ id: 'preview', code: 'BAG-PAC-······', siteId: 'bags', kind: 'pack', productId: product?.id, stageCode: 'convert', machineId: converterId ?? undefined, shiftId: shift, day: today, qtyUnits: packPieces, qtyKg: product?.stdBundleWeightKg ?? 0, status: 'created', zoneId: 'z_bags_b', parentIds: [], grade: brand }), [product, converterId, shift, today, brand]);

  const rollName = (r: Label) => s.products.find((p) => p.id === r.productId)?.internalName ?? '—';
  const toggle = (id: string) => setSelected((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const scanned = (r: Label) => { setSelected((x) => [...x, r.id]); useStore.getState().toast({ kind: 'info', title: `Scanned ${r.code}`, detail: `${s.products.find((p) => p.id === r.productId)?.internalName} · ${fmtKg(r.qtyKg)}` }); };
  const scanNext = () => { const next = rolls.find((r) => !selected.includes(r.id)); if (next) scanned(next); };
  /** Enter in the scan box: an empty box takes the next oldest roll (what the scanner gun does in the demo); a typed code looks that roll up. */
  const scanCode = () => {
    const t = code.trim().toLowerCase(); if (!t) return scanNext();
    const hit = rolls.find((r) => r.code.toLowerCase() === t) ?? rolls.find((r) => r.code.toLowerCase().endsWith(t));
    if (!hit) useStore.getState().toast({ kind: 'warn', title: 'No roll in the roll store with that code', detail: code.trim() });
    else if (selected.includes(hit.id)) useStore.getState().toast({ kind: 'info', title: `${hit.code} is already on this run` });
    else scanned(hit);
    setCode('');
  };
  const todayOut = useMemo(() => { const m = new Map<string, { packs: number; rejects: number; kg: number }>(); for (const e of s.production.filter((p) => p.siteId === 'bags' && p.day === today && p.stageCode === 'convert' && p.productId)) { const cur = m.get(e.productId!) ?? { packs: 0, rejects: 0, kg: 0 }; cur.packs += e.goodUnits; cur.rejects += e.rejectUnits; cur.kg += e.outputKg; m.set(e.productId!, cur); } return [...m.entries()].map(([pid, v]) => ({ product: s.products.find((p) => p.id === pid)!, ...v })).filter((r) => r.product).sort((a, b) => b.packs - a.packs); }, [s.production, s.products, today]);
  const perConverter = converters.map((m) => { const es = s.production.filter((p) => p.machineId === m.id && p.day === today && p.stageCode === 'convert'); const lastEntry = es[es.length - 1]; return { machine: m, packs: es.reduce((t, e) => t + e.goodUnits, 0), product: s.products.find((p) => p.id === lastEntry?.productId) }; });
  const maxConv = Math.max(1, ...perConverter.map((c) => c.packs));
  const outPacks = todayOut.reduce((t, r) => t + r.packs, 0); const outBags = todayOut.reduce((t, r) => t + r.packs * r.product.bundlePieces, 0); const maxPacks = Math.max(1, ...todayOut.map((r) => r.packs));

  const record = () => {
    if (!ready || !converter || !product) return;
    for (const id of selected) s.consumeLabel(id);
    const labels: Label[] = [];
    for (let i = 0; i < Math.min(nPacks, MAX_PRINT); i++) labels.push(s.createLabel({ siteId: 'bags', kind: 'pack', productId: product.id, stageCode: 'convert', machineId: converter.id, shiftId: shift, day: today, qtyUnits: product.bundlePieces, qtyKg: product.stdBundleWeightKg, zoneId: 'z_bags_b', parentIds: selected, grade: brand }));
    addProduction({ siteId: 'bags', stageCode: 'convert', machineId: converter.id, shiftId: shift, day: today, productId: product.id, goodUnits: nPacks, rejectUnits: nRejects, inputKg: inKg, outputKg: outKg });
    setLastYield({ inKg, outKg }); setRun(labels); setPrinting(true); setSelected([]); setPacks(''); setRejects(''); focusFirst();
  };
  const onPrinted = () => { setPrinting(false); useStore.getState().toast({ kind: 'ok', title: `${run.length} pack label${run.length === 1 ? '' : 's'} printed`, detail: [run[0] && s.products.find((p) => p.id === run[0].productId)?.internalName, run[0]?.grade, s.machines.find((m) => m.id === run[0]?.machineId)?.code].filter(Boolean).join(' · ') }); };

  const rollCols: Column<Label>[] = [
    { key: 'on', header: '', width: 34, cell: (r) => { const on = selected.includes(r.id); return <span role="checkbox" aria-checked={on} aria-label={`Consume ${r.code}`} className={cn('size-4 touch:size-6 rounded-sm border grid place-items-center', on ? 'bg-[var(--brand)] border-[var(--brand)] text-[var(--brand-contrast)]' : 'border-[var(--line-2)] bg-[var(--surface)]')}>{on && <Check className="size-3 touch:size-4" strokeWidth={3} />}</span>; } },
    { key: 'c', header: 'Roll', cell: (r) => <span className="code font-medium">{r.code}</span> },
    { key: 't', header: 'Type', cell: rollName },
    { key: 'm', header: 'Extruder', cell: (r) => { const m = s.machines.find((x) => x.id === r.machineId); return m ? shortCode(m.code, extruders) : '—'; } },
    { key: 'd', header: 'Made', cell: (r) => (r.day === today ? 'Today' : fmtDayShort(r.day)) },
    { key: 'kg', header: 'Kg', align: 'right', mono: true, cell: (r) => <span className="font-medium">{fmtNum(r.qtyKg)}</span> },
  ];
  const outCols: Column<(typeof todayOut)[number]>[] = [
    { key: 'p', header: 'Product', truncate: 170, sort: (r) => r.product.internalName, cell: (r) => <span className="inline-flex items-center gap-1.5"><Swatch colour={r.product.colour} /><span className="font-medium">{r.product.internalName}</span><span className="text-[var(--text-3)]">{r.product.commercialName}</span></span> },
    { key: 'pk', header: 'Packs', align: 'right', sort: (r) => r.packs, cell: (r) => <BarCell value={r.packs} max={maxPacks} display={fmtNum(r.packs)} width={44} /> },
    { key: 'rj', header: 'Rejects', align: 'right', mono: true, sort: (r) => r.rejects, cell: (r) => (r.rejects ? fmtNum(r.rejects) : dash) },
    { key: 'kg', header: 'Kg', align: 'right', mono: true, sort: (r) => r.kg, cell: (r) => fmtNum(r.kg) },
  ];

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <div className="-mb-[var(--gap)]">
        <PageHeader eyebrow={`${site.name} · Conversion`} title="Cutting, sealing and packing" meta={<><Badge tone="neutral" dot>{rolls.length} rolls in store</Badge><Badge tone="neutral">{kindLabel} shift</Badge></>}
          subtitle="Scan the rolls going in, count the packs coming out. The loss between them is the number nobody has today." />
      </div>
      {site.toBeConfirmed && <Note tone="warn">{site.toBeConfirmed}</Note>}

      <Workbench asideWidth={440} aside={<>
        <div className={`grid grid-cols-2 gap-[var(--gap)] ${WIDE}`}>
          <Stat label="Rolls waiting" icon={Scroll} accent="var(--series-4)" value={<CountUp value={rolls.length} />} sub={`${fmtKg(rolls.reduce((t, r) => t + r.qtyKg, 0))} in the roll store`} onClick={() => go.site('production/rolls')} />
          <Stat label="Packs today" icon={Boxes} accent="var(--series-3)" value={<CountUp value={outPacks} />} sub={`${fmtNum(outBags)} bags · ${todayOut.length} product${todayOut.length === 1 ? '' : 's'}`} />
        </div>
        <Panel icon={Tag} title="Pack label" sub="one per pack" actions={<Badge tone="neutral">Live preview</Badge>} footer={<span className="num">{product ? <>{fmtNum(packPieces)} bags per {unit} · standard weight {fmtKg(product.stdBundleWeightKg)}{product.weightStatus === 'to_be_measured' ? ' (to be measured)' : ''}</> : 'Select a product to see its label.'}</span>}>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-4 grid place-items-center overflow-x-auto"><Sticker label={preview} product={product} machine={converter} site={site} shiftKind={kindLabel} /></div>
        </Panel>
        <Panel icon={Boxes} title="Today's output" sub="packs by product" pad={false} footer={todayOut.length ? <span className="num">{fmtNum(outPacks)} packs · {fmtNum(outBags)} bags · {fmtNum(todayOut.reduce((t, r) => t + r.rejects, 0))} rejected</span> : undefined}>
          <DataGrid bare dense rows={todayOut} rowKey={(r) => r.product.id} columns={outCols} selectedKey={product?.id} empty="No packs recorded today."
            footer={todayOut.length ? <tr><td>Total</td><td className="text-right num">{fmtNum(outPacks)}</td><td className="text-right num">{fmtNum(todayOut.reduce((t, r) => t + r.rejects, 0))}</td><td className="text-right num">{fmtNum(todayOut.reduce((t, r) => t + r.kg, 0))}</td></tr> : undefined} />
        </Panel>
        <Panel icon={Scissors} title="Packs per converter" sub={`today · ${kindLabel} shift`}>
          {perConverter.map((c) => <Meter key={c.machine.id} tone={c.machine.id === converterId ? 'series' : 'neutral'} label={<span className="font-medium">{c.machine.code}</span>} sub={c.product ? `${c.product.internalName} ${c.product.commercialName ?? ''}`.trim() : 'nothing recorded yet'} value={c.packs} max={maxConv} display={<>{fmtNum(c.packs)}<span className="text-[var(--text-3)] font-normal"> packs</span></>} />)}
        </Panel>
      </>}>
        <Panel icon={Scissors} title="Conversion run" sub={`${kindLabel} shift · ${fmtDayShort(today)}`} pad={false}
          footer={<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><span className="min-w-0 truncate">{missing.length ? `Still needed: ${missing.join(', ')}.` : <span className="text-[var(--text)]">{product?.internalName}{brand ? ` · ${brand}` : ''} · {fmtNum(nPacks)} packs · {converter?.code}{selected.length ? '' : ' · no rolls scanned'}</span>}</span><Button variant="primary" icon={Printer} disabled={!ready} onClick={record} hotkey="mod+enter" hotkeyLabel="Record and print pack labels">{printing ? 'Printing…' : nPacks > 0 ? `Record and print ${Math.min(nPacks, MAX_PRINT)} pack label${nPacks === 1 ? '' : 's'}${nPacks > MAX_PRINT ? ` (first ${MAX_PRINT})` : ''}` : 'Record and print pack labels'}</Button></div>}>
          <div ref={formRef}>
            <FormSection n={1} done={selected.length > 0} title="Rolls consumed" hint="oldest first"
              right={<><Input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); scanCode(); } }} placeholder="Scan or type a roll code" aria-label="Scan or type a roll code" className="code w-[210px] max-sm:w-full" /><Button icon={ScanLine} onClick={scanNext} disabled={selected.length >= rolls.length} hotkey="s" hotkeyLabel="Scan the next roll">Scan next</Button></>}>
              <div className="rounded-lg border border-[var(--line)] overflow-hidden">
                <DataGrid bare dense rows={rolls} rowKey={(r) => r.id} columns={rollCols} onRowClick={(r) => toggle(r.id)} maxHeight={232} rowClassName={(r) => (selected.includes(r.id) ? 'bg-[var(--selected)]' : undefined)}
                  empty="No rolls in the roll store. Rolls appear here when extrusion prints a roll sticker." />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-2 t-sm text-[var(--text-2)]">
                <span>{selected.length} roll{selected.length === 1 ? '' : 's'} on this run{selected.length > 0 && <button type="button" onClick={() => setSelected([])} className="ml-2 underline underline-offset-2 text-[var(--text-3)] hover:text-[var(--text)]">Clear</button>}</span>
                <span className="t-xs text-[var(--text-3)] touch:hidden">Enter in the scan box takes the next roll. In the list: arrows move, Enter ticks.</span>
                <span className="num t-base font-semibold text-[var(--text)]">{fmtKg(inKg)} in</span>
              </div>
            </FormSection>
            <FormSection n={2} done={!!converter && !!product} title="Output" hint={product ? `${product.internalName}${brand ? ` · ${brand}` : ''}` : 'converter, product and brand'}>
              <FormRow label="Converter">{converters.length === 0 ? <SettingsEmpty what="converters" where="Machines" icon={Scissors} /> : <ChipGroup ariaLabel="Converter" options={converters.map((m) => ({ value: m.id, label: m.code, disabled: m.status === 'down' }))} value={converterId} onChange={setConverterId} />}</FormRow>
              {packProducts.length === 0 ? <SettingsEmpty className="my-1.5" what="pack products" where="Products (kind: bag pack)" icon={Boxes} /> : <>
                <FormRow label="Size" hint={sizes.length ? undefined : 'No bag sizes yet. Add them in Settings → Master data to narrow the product list.'}>
                  {sizes.length > 0 && <ChipGroup ariaLabel="Size" options={[{ value: ALL, label: 'Any' }, ...sizes.map((x) => ({ value: x.id, label: x.label }))]} value={sizeId} onChange={setSizeId} />}
                </FormRow>
                <FormRow label="Colour" hint={colours.length ? undefined : 'No bag colours yet. Add them in Settings → Master data to narrow the product list.'}>
                  {colours.length > 0 && <ChipGroup ariaLabel="Colour" options={[{ value: ALL, label: 'Any' }, ...colours.map((x) => ({ value: x.id, label: <><Swatch colour={x.color} />{x.label}</> }))]} value={colourId} onChange={setColourId} />}
                </FormRow>
                <FormRow label="Product" required hint={matches.length === 0 ? 'No product has this size and colour. Change the chips or add the product in Settings → Products.' : `${matches.length} of ${packProducts.length} products match · products are set up in Settings`}>
                  <Combobox options={matches.map((p) => ({ value: p.id, label: p.internalName, sub: [p.commercialName, `${fmtNum(p.bundlePieces)} per ${p.unit ?? 'pack'}`, fmtKg(p.stdBundleWeightKg)].filter(Boolean).join(' · '), left: <Swatch colour={p.colour} /> }))} value={productId} onChange={setProductId} placeholder="Search products" emptyText="No product matches" clearable className="max-w-[460px]" />
                </FormRow>
              </>}
              <FormRow label="Brand">{brands.length === 0 ? <SettingsEmpty what="brands" icon={Tag} /> : <ChipGroup ariaLabel="Brand" options={brands.map((b) => ({ value: b.id, label: <>{b.label}{b.example && <Badge tone="neutral">example</Badge>}</> }))} value={brandId} onChange={setBrandId} />}</FormRow>
            </FormSection>
            <FormSection n={3} done={nPacks > 0} title="Count" hint={product ? `${fmtNum(packPieces)} bags per ${unit}` : undefined}>
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 max-w-[640px]">
                <NumberPad value={packs} onChange={setPacks} label="Packs" suffix="packs" max={999} />
                <NumberPad value={rejects} onChange={setRejects} label="Rejected bags" suffix="bags" max={9999} />
              </div>
              <div className="t-xs text-[var(--text-3)] mt-1.5 num">{product ? `${fmtNum(nPacks * packPieces)} good bags` : 'Select a product to count the bags'}{nRejects ? ` · ${fmtNum(nRejects)} rejected` : ''}</div>
            </FormSection>
            <FormSection n={4} done={hasYield && !overLoss} title="Yield" hint="kg in against kg out"
              right={hasYield ? <Badge tone={overLoss ? 'bad' : 'ok'} dot>{overLoss ? 'Above' : 'Within'} the {rules.massGapPct}% loss threshold</Badge> : <Badge tone="neutral">{!inKg ? 'Scan the rolls going in' : !product ? 'Select the product' : 'Enter the packs'}</Badge>}>
              <Calc terms={[
                { label: `Kg in · ${selected.length} roll${selected.length === 1 ? '' : 's'}`, value: fmtNum(inKg), unit: 'kg' },
                { op: '−', label: `Kg out · ${fmtNum(nPacks)} pack${nPacks === 1 ? '' : 's'}`, value: fmtNum(outKg), unit: 'kg' },
                { op: '=', label: 'Loss', value: hasYield ? fmtPct(lossPct) : '—', sub: hasYield ? `${fmtKg(Math.round((inKg - outKg) * 10) / 10)}` : undefined, result: true, tone: hasYield ? (overLoss ? 'bad' : 'ok') : undefined },
              ]} />
              {hasYield && <Bar value={outKg} max={inKg} tone={overLoss ? 'bad' : 'ok'} className="mt-2" />}
              {product?.weightStatus === 'to_be_measured' && <p className="t-xs text-[var(--text-3)] mt-1.5">Kg out uses the standard pack weight {fmtKg(product.stdBundleWeightKg)} (to be measured).</p>}
            </FormSection>
          </div>
        </Panel>
        {run.length > 0 && (
          <Panel icon={printing ? Printer : CheckCircle2} title={printing ? 'Printing pack labels' : 'Pack labels printed'} sub={`${run.length} label${run.length === 1 ? '' : 's'}`}
            actions={lastYield && <Badge tone={lastYield.inKg ? 'neutral' : 'warn'}>{lastYield.inKg ? `${fmtKg(lastYield.inKg)} in → ${fmtKg(lastYield.outKg)} out` : 'No rolls scanned'}</Badge>}>
            <PrintRun labels={run} site={site} product={s.products.find((p) => p.id === run[0].productId)} machine={s.machines.find((m) => m.id === run[0].machineId)} shiftKind={kindLabel} onDone={onPrinted} />
          </Panel>
        )}
      </Workbench>
    </div>
  );
}
