import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Eye, History, Layers, Printer, RotateCcw, Tag } from 'lucide-react';
import type { Label, LabelKind, Product, Stage } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useRefList, useSite, useSession } from '@/app/hooks';
import { Badge, Bar, Button, ChipGroup, Combobox, DataGrid, Empty, FormRow, IconButton, Note, PageHeader, Panel, Split, cn, useIsTouch, type Column } from '@/components/ui';
import { PersonPicker } from '@/components/PersonPicker';
import { Sticker } from '@/components/Sticker';
import { printer } from '@/devices';
import { currentShiftKind, shiftId } from '@/data/selectors';
import { fmtDayShort, fmtKg, fmtNum } from '@/data/format';
import { productKindsForLabel, sectorForStage } from './shared';
import { NumberFields, SetupHint, Swatch, type NumField } from './parts';

const KIND_NAME: Record<LabelKind, string> = { batch: 'Batch', rack: 'Rack', bundle: 'Bundle', roll: 'Roll', pack: 'Pack', sack: 'Sack', bag: 'Bag' };

/** Generic label printer: one form (kind, product or colour, quantity, machine, operator), a live sticker beside it, and what was printed last. */
export function PrintLabel() {
  const s = useStore(); const site = useSite(); const session = useSession(); const createLabel = useStore((x) => x.createLabel); const touch = useIsTouch();
  const stages = useMemo(() => site.stages.filter((st): st is Stage & { producesLabel: LabelKind } => !!st.producesLabel), [site.stages]);
  const [stageCode, setStageCode] = useState(stages[0]?.code ?? '');
  const stage = stages.find((st) => st.code === stageCode) ?? stages[0];
  const kind: LabelKind = stage?.producesLabel ?? 'bundle';
  const productKinds = productKindsForLabel(site.id, kind);
  const products: Product[] = useMemo(() => s.products.filter((p) => p.siteId === site.id && productKinds.includes(p.kind) && p.active !== false), [s.products, site.id, productKinds.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const colours = useRefList('colour'); const grades = useRefList('pellet_grade');
  const [productId, setProductId] = useState<string | null>(null);
  const [colour, setColour] = useState<string | undefined>();
  const [grade, setGrade] = useState<string | undefined>();
  const [qty, setQty] = useState<{ units: string; kg: string }>({ units: '1', kg: '' });
  const [machineId, setMachineId] = useState<string | null>(null);
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [tried, setTried] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const form = useRef<HTMLDivElement>(null);
  const product = products.find((p) => p.id === productId);
  const machines = useMemo(() => { const own = s.machines.filter((m) => m.siteId === site.id && m.status !== 'retired' && m.status !== 'arriving'); const atStage = own.filter((m) => m.stageCode === stageCode); if (atStage.length) return atStage; const prev = [...site.stages].filter((st) => st.sequence < (stage?.sequence ?? 0)).sort((a, b) => b.sequence - a.sequence); for (const p of prev) { const ms = own.filter((m) => m.stageCode === p.code); if (ms.length) return ms; } return own; }, [s.machines, site, stageCode, stage]);
  const sector = sectorForStage(site, stageCode);
  const hasProduct = productKinds.length > 0; const hasColour = kind === 'batch' || kind === 'rack'; const hasGrade = kind === 'sack' && grades.length > 0;
  const perLabel = kind === 'bundle' || kind === 'pack';
  const units = qty.units; const kg = qty.kg;

  // The last lot of this kind printed on the site: a batch starts from that weight, because batches repeat.
  const lastOfKind = useMemo(() => [...s.labels].reverse().find((l) => l.siteId === site.id && l.kind === kind), [s.labels, site.id, kind]);
  // Defaults when the kind or product changes.
  useEffect(() => { setProductId(null); setColour(undefined); setGrade(undefined); setQty({ units: perLabel ? '' : '1', kg: kind === 'batch' && lastOfKind ? String(lastOfKind.qtyKg) : '' }); setMachineId(null); setTried(false); }, [kind, perLabel]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!product) return; if (perLabel) setQty({ units: String(product.bundlePieces), kg: String(product.stdBundleWeightKg) }); else if (kind === 'sack') setQty((x) => ({ ...x, kg: String(product.stdBundleWeightKg) })); }, [product, perLabel, kind]);
  // Desktop: the keyboard starts on the first choice.
  useEffect(() => { if (!touch) form.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shiftKind = currentShiftKind(); const sid = shiftId(site.id, s.today, shiftKind);
  const draft: Label = { id: 'preview', code: `${site.id.toUpperCase().slice(0, 3)}-${kind.toUpperCase().slice(0, 3)}-${String(s.labels.length + 1).padStart(6, '0')}`, siteId: site.id, kind, productId: productId ?? undefined, stageCode, machineId: machineId ?? undefined, operatorId: operatorId ?? undefined, shiftId: sid, day: s.today, qtyUnits: parseFloat(units) || 0, qtyKg: parseFloat(kg) || 0, status: 'in_stock', parentIds: [], colour, grade };
  const machine = s.machines.find((m) => m.id === machineId); const operator = s.people.find((p) => p.id === operatorId);
  const missing: string[] = []; if (hasProduct && !productId) missing.push('product'); if (hasColour && !colour) missing.push('colour'); if (!(parseFloat(kg) > 0)) missing.push('kg'); if (perLabel && !(parseFloat(units) > 0)) missing.push('pieces'); if (machines.length && !machineId) missing.push('machine');
  const canPrint = missing.length === 0 && !printing;
  const zoneFor = () => { const z = s.zones.filter((zz) => zz.siteId === site.id); const re = kind === 'roll' ? /roll/i : kind === 'pack' ? /finished|pack/i : kind === 'sack' ? /pellet|raw/i : kind === 'bundle' ? /front|store/i : null; return re ? (z.find((zz) => re.test(zz.name)) ?? z[0])?.id : undefined; };
  const doPrint = async () => {
    if (printing) return;
    if (!canPrint) { setTried(true); useStore.getState().toast({ kind: 'warn', title: 'Nothing printed yet', detail: `Still needed: ${missing.join(', ')}` }); return; }
    const l = createLabel({ siteId: site.id, kind, productId: productId ?? undefined, stageCode, machineId: machineId ?? undefined, operatorId: operatorId ?? (session?.userId ? s.users.find((u) => u.id === session.userId)?.personId : undefined), shiftId: sid, day: s.today, qtyUnits: draft.qtyUnits, qtyKg: draft.qtyKg, zoneId: zoneFor(), parentIds: [], colour, grade });
    setPrinting(true); await printer.print({ code: l.code, lines: [product?.internalName ?? colour ?? kind, `${l.qtyKg} kg`] }); setPrinting(false); setTried(false);
    setRecent((r) => [l.id, ...r].slice(0, 12));
    useStore.getState().toast({ kind: 'ok', title: `${KIND_NAME[kind]} sticker printed`, detail: `${l.code} · ${product?.internalName ?? colour ?? grade ?? ''} · ${l.qtyKg} kg` });
    // The choices stay for the next lot; the keyboard goes back to the quantity.
    if (!touch) { const el = form.current?.querySelector<HTMLInputElement>('input[inputmode]'); el?.focus(); el?.select(); }
  };
  const reprint = async (l: Label) => { setPrinting(true); await printer.print({ code: l.code, lines: [] }); setPrinting(false); useStore.getState().toast({ kind: 'ok', title: 'Reprinted', detail: l.code }); };
  const recentLabels = useMemo(() => { const mine = s.labels.filter((l) => l.siteId === site.id); const fromSession = recent.map((id) => mine.find((l) => l.id === id)).filter((l): l is Label => !!l); const seedRecent = [...mine].reverse().filter((l) => !recent.includes(l.id)).slice(0, Math.max(0, 8 - fromSession.length)); return [...fromSession, ...seedRecent]; }, [s.labels, site.id, recent]);
  const todays = useMemo(() => s.labels.filter((l) => l.siteId === site.id && l.day === s.today), [s.labels, site.id, s.today]);

  if (stages.length === 0) return <div><PageHeader eyebrow={`${site.name} · Production`} title="Print label" /><Empty icon={Tag} title="No label stages configured" hint="No stage of this site prints a sticker. Stages are set up with the site in Settings." /></div>;

  const toMeasure = !!product && product.weightStatus === 'to_be_measured' && perLabel;
  const fields: NumField<'units' | 'kg'>[] = [
    ...(perLabel ? [{ key: 'units' as const, label: 'Pieces', suffix: 'pcs', required: true, hint: product ? <>Standard {kind} is <span className="num text-[var(--text-2)]">{fmtNum(product.bundlePieces)}</span> pieces</> : `Pieces in this ${kind}` }] : []),
    { key: 'kg', label: 'Weight', suffix: 'kg', allowDecimal: true, required: true, hint: toMeasure ? <span className="text-[var(--warn)]">Standard {product!.stdBundleWeightKg} kg, to be measured</span> : product && (perLabel || kind === 'sack') ? <>Standard <span className="num text-[var(--text-2)]">{product.stdBundleWeightKg} kg</span></> : kind === 'batch' && lastOfKind ? <>The last batch was <span className="num text-[var(--text-2)]">{fmtKg(lastOfKind.qtyKg)}</span></> : 'As read on the scale' },
  ];
  const what = (l: Label) => s.products.find((x) => x.id === l.productId)?.internalName ?? l.colour ?? l.grade ?? KIND_NAME[l.kind];
  // What has been printed today, by kind: fills the page with the day's picture instead of empty space.
  const byKind = useMemo(() => stages.map((st) => { const ls = todays.filter((l) => l.kind === st.producesLabel); return { code: st.code, kind: st.producesLabel, stage: st.name, n: ls.length, kg: ls.reduce((t, l) => t + l.qtyKg, 0), last: ls[ls.length - 1]?.code }; }), [stages, todays]);
  const maxN = Math.max(1, ...byKind.map((k) => k.n));
  const kindCols: Column<(typeof byKind)[number]>[] = [
    { key: 'k', header: 'Kind', cell: (k) => <span className="font-medium">{KIND_NAME[k.kind]}</span> },
    { key: 's', header: 'Stage', truncate: 160, cell: (k) => <span className="text-[var(--text-2)]">{k.stage}</span> },
    { key: 'n', header: 'Printed today', cell: (k) => <span className="flex items-center gap-2"><span className="w-[84px] shrink-0 hidden sm:block"><Bar value={k.n} max={maxN} tone="series" /></span><span className="num font-medium">{fmtNum(k.n)}</span></span> },
    { key: 'kg', header: 'Kg', align: 'right', mono: true, cell: (k) => (k.n ? fmtNum(Math.round(k.kg)) : <span className="text-[var(--text-4)]">—</span>) },
    { key: 'l', header: 'Last code', align: 'right', cell: (k) => (k.last ? <span className="code text-[var(--text-2)]">{k.last}</span> : <span className="text-[var(--text-4)]">—</span>) },
  ];
  const recentCols: Column<Label>[] = [
    { key: 'code', header: 'Code', cell: (l) => <span className={cn('code font-medium', recent.includes(l.id) && 'text-[var(--accent-strong)]')}>{l.code}</span> },
    { key: 'what', header: 'Lot', truncate: 96, cell: (l) => <span className="text-[var(--text-2)]">{what(l)}</span> },
    { key: 'kg', header: 'Kg', align: 'right', mono: true, cell: (l) => fmtNum(l.qtyKg) },
    { key: 're', header: '', width: 36, align: 'right', cell: (l) => <IconButton icon={RotateCcw} label={`Reprint ${l.code}`} onClick={() => reprint(l)} disabled={printing} className="ctl-sm!" /> },
  ];

  return (
    <div>
      <PageHeader eyebrow={`${site.name} · Production`} title="Print label" subtitle="A sticker on every lot. Pick, type the weight, print."
        meta={<><Badge tone={printer.status() === 'ready' ? 'ok' : 'bad'} dot>{printer.status() === 'ready' ? 'Printer ready' : 'Printer offline'}</Badge><Badge tone="neutral">{fmtNum(todays.length)} printed today</Badge></>} />
      {site.toBeConfirmed && <Note tone="warn" className="mb-[var(--gap)]">{site.toBeConfirmed}</Note>}
      <Split asideWidth={360} aside={<>
        <Panel icon={Eye} title="Preview" sub={`${fmtDayShort(s.today)} · ${shiftKind} shift · next code`}>
          <div className="flex flex-col items-center">
            <div className="overflow-hidden rounded-md max-w-full"><Sticker label={draft} product={product} machine={machine} operator={operator} site={site} shiftKind={shiftKind} printing={printing} /></div>
            <div className="t-xs text-[var(--text-3)] mt-2 text-center">{printing ? 'Printing…' : canPrint ? 'This is what comes out of the printer.' : `Fills in as you choose. Still needed: ${missing.join(', ')}.`}</div>
          </div>
        </Panel>
        <Panel icon={History} title="Recently printed" sub={`${fmtNum(todays.length)} today · ${fmtKg(Math.round(todays.reduce((t, l) => t + l.qtyKg, 0)))}`} pad={false}>
          <DataGrid bare dense rows={recentLabels} columns={recentCols} rowKey={(l) => l.id} empty="Nothing printed yet." />
        </Panel>
      </>}>
        <div ref={form}>
          <Panel icon={Tag} title="New sticker" sub={stage ? `${KIND_NAME[kind]} · ${stage.name}` : undefined} className="[&>footer]:sticky [&>footer]:bottom-0 [&>footer]:z-10"
            footer={<div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">{missing.length === 0 ? <span className="text-[var(--ok)] font-medium inline-flex items-center gap-1.5"><CheckCircle2 className="size-4" />Ready to print</span> : <span className={cn('block truncate', tried && 'text-[var(--bad)] font-medium')}>Still needed: {missing.join(', ')}</span>}</div>
              <Button variant="primary" icon={Printer} onClick={doPrint} disabled={printing} hotkey="mod+enter" hotkeyLabel="Print the sticker">{printing ? 'Printing…' : `Print ${KIND_NAME[kind].toLowerCase()} sticker`}</Button>
            </div>}>
            <div className="t-label mb-0.5">1 · What is it</div>
            <FormRow label="Label kind" required>
              <ChipGroup ariaLabel="Label kind" value={stageCode} onChange={setStageCode} options={stages.map((st) => ({ value: st.code, label: <span>{KIND_NAME[st.producesLabel]}<span className="font-normal text-[var(--text-3)]"> · {st.name}</span></span> }))} />
            </FormRow>
            {hasProduct && (
              <FormRow label="Product" required>
                {products.length === 0 ? <SetupHint inline what={`${KIND_NAME[kind].toLowerCase()} products`} where="Products" />
                  : products.length <= 6 ? <ChipGroup ariaLabel="Product" value={productId} onChange={setProductId} options={products.map((p) => ({ value: p.id, label: <span className="inline-flex items-center gap-1.5"><Swatch colour={p.colour} />{p.internalName}</span> }))} />
                    : <Combobox value={productId} onChange={setProductId} placeholder="Search product" options={products.map((p) => ({ value: p.id, label: p.internalName, left: <Swatch colour={p.colour} /> }))} />}
              </FormRow>
            )}
            {hasColour && <FormRow label="Colour" required>{colours.length === 0 ? <SetupHint inline what="colours" /> : <ChipGroup ariaLabel="Colour" value={colour ?? null} onChange={setColour} options={colours.map((c) => ({ value: c.label, label: <span className="inline-flex items-center gap-1.5"><Swatch colour={c.color} />{c.label}</span> }))} />}</FormRow>}
            {hasGrade && <FormRow label="Grade" hint="Optional"><ChipGroup ariaLabel="Grade" value={grade ?? null} onChange={setGrade} options={grades.map((g) => ({ value: g.label, label: g.label }))} /></FormRow>}
            {toMeasure && <Note tone="warn" className="my-1">Standard {kind} weight {product!.stdBundleWeightKg} kg is <b>to be measured</b> with the client. Printed as the standard until then.</Note>}

            <div className="t-label mt-3 mb-0.5">2 · How much</div>
            <NumberFields fields={fields} values={qty} onChange={(k, v) => setQty((x) => ({ ...x, [k]: v }))} activeKey={perLabel ? 'units' : 'kg'} resetOn={kind} />

            <div className="t-label mt-3 mb-0.5">3 · Where and who</div>
            {machines.length > 0 && (
              <FormRow label="Machine" required>
                <Combobox value={machineId} onChange={setMachineId} placeholder="Search machine" clearable options={machines.map((m) => ({ value: m.id, label: m.code, sub: m.status === 'down' ? 'down' : undefined, disabled: m.status === 'down' }))} />
              </FormRow>
            )}
            <FormRow label="Operator" hint={`Optional · ${sector} workers are listed first`}>
              <PersonPicker siteId={site.id} sector={sector} value={operatorId} onChange={(id) => setOperatorId(id)} />
            </FormRow>
          </Panel>
          <Panel icon={Layers} title="Printed today by kind" sub={`${fmtNum(todays.length)} stickers · ${fmtKg(Math.round(todays.reduce((t, l) => t + l.qtyKg, 0)))}`} pad={false} className="mt-[var(--gap)]">
            <DataGrid bare dense rows={byKind} columns={kindCols} rowKey={(k) => k.code} onRowClick={(k) => setStageCode(k.code)} selectedKey={stageCode} />
          </Panel>
        </div>
      </Split>
    </div>
  );
}
