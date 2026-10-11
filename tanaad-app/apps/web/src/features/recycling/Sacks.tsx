import { useEffect, useMemo, useState } from 'react';
import { Activity, Boxes, CheckCircle2, Package, Printer, Tag } from 'lucide-react';
import type { Label } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useGo, useRefList } from '@/app/hooks';
import { machinesOf, stockByProduct, yieldByLine } from '@/data/selectors';
import { Badge, Button, ChipGroup, Combobox, DataGrid, Empty, FormRow, Meter, Note, NumberPad, PageHeader, Panel, type Column } from '@/components/ui';
import { Donut } from '@/components/charts';
import { Sticker } from '@/components/Sticker';
import { fmtDayShort, fmtKg, fmtNum, fmtPct } from '@/data/format';
import { addProduction, BarCell, Calc, PrintRun, SettingsEmpty, Step, Swatch, dash, useFirstField, useShift, Workbench } from './kit';

const MAX_ANIM = 10;
const tonnes = (kg: number) => `${kg / 1000} t`;
interface SackRow { key: string; line: string; product: string; grade: string; colour?: string; n: number; kg: number }

/** R4 · Pellet sacks: one sticker per sack, output per line against capacity, pellet stock by grade. */
export function Sacks() {
  const s = useStore(); const go = useGo(); const { today, site, kindLabel, shift } = useShift();
  const lines = machinesOf(s, 'recycling', 'pelletise'); const grades = useRefList('pellet_grade');
  /** Pellet products are store data (Settings → Products). The grade chip narrows the list and is printed on the sticker. */
  const pellets = useMemo(() => s.products.filter((p) => p.siteId === 'recycling' && p.kind === 'pellet' && p.active !== false), [s.products]);
  const [lineId, setLineId] = useState<string | null>(null); const [gradeId, setGradeId] = useState<string | null>(null); const [productId, setProductId] = useState<string | null>(null); const [kg, setKg] = useState(''); const [count, setCount] = useState('');
  const [run, setRun] = useState<Label[]>([]); const [printing, setPrinting] = useState(false); const [printedInfo, setPrintedInfo] = useState<{ n: number; kg: number } | null>(null);
  const [formRef, focusFirst] = useFirstField<HTMLDivElement>();
  useEffect(() => { if (!lines.some((m) => m.id === lineId)) setLineId(lines.find((m) => m.status !== 'down')?.id ?? lines[0]?.id ?? null); }, [lines, lineId]);
  useEffect(() => { if (!grades.some((g) => g.id === gradeId)) setGradeId(grades[0]?.id ?? null); }, [grades, gradeId]);
  const grade = grades.find((g) => g.id === gradeId);
  const matches = useMemo(() => { const hit = grade ? pellets.filter((p) => p.internalName.toLowerCase().includes(grade.label.toLowerCase())) : []; return hit.length ? hit : pellets; }, [pellets, grade]);
  useEffect(() => { if (!matches.some((p) => p.id === productId)) setProductId(matches.length === 1 || !productId ? matches[0]?.id ?? null : null); }, [matches]); // eslint-disable-line react-hooks/exhaustive-deps
  const product = pellets.find((p) => p.id === productId); const line = lines.find((m) => m.id === lineId);
  useEffect(() => { if (product) setKg(String(product.stdBundleWeightKg)); }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const sackKg = parseFloat(kg || '0') || 0; const n = parseInt(count || '0', 10) || 0; const totalKg = Math.round(n * sackKg * 10) / 10;
  const todays = useMemo(() => s.labels.filter((l) => l.siteId === 'recycling' && l.kind === 'sack' && l.day === today && l.productId), [s.labels, today]);
  const rows = useMemo<SackRow[]>(() => { const m = new Map<string, SackRow>(); for (const l of todays) { const key = `${l.machineId}-${l.productId}-${l.grade ?? ''}`; const p = s.products.find((x) => x.id === l.productId); const cur = m.get(key) ?? { key, line: s.machines.find((x) => x.id === l.machineId)?.code ?? '—', product: p?.internalName ?? '—', grade: l.grade ?? '', colour: p?.colour, n: 0, kg: 0 }; cur.n += 1; cur.kg += l.qtyKg; m.set(key, cur); } return [...m.values()].sort((a, b) => a.line.localeCompare(b.line) || b.n - a.n); }, [todays, s.products, s.machines]);
  const maxN = Math.max(1, ...rows.map((r) => r.n)); const todayKg = todays.reduce((t, l) => t + l.qtyKg, 0);
  const yields = yieldByLine(s, today); const stock = stockByProduct(s, 'recycling'); const stockSacks = stock.reduce((t, r) => t + r.bundles, 0); const stockKg = stock.reduce((t, r) => t + r.kg, 0);
  const ready = !!line && !!product && n > 0 && sackKg > 0 && !printing;
  const missing = [!line && 'a line', !product && 'a product', n <= 0 && 'the number of sacks', sackKg <= 0 && 'the sack weight'].filter((x): x is string => !!x);
  const preview: Label = useMemo(() => ({ id: 'preview', code: 'REC-SAC-······', siteId: 'recycling', kind: 'sack', productId: productId ?? undefined, stageCode: 'pelletise', machineId: lineId ?? undefined, shiftId: shift, day: today, qtyUnits: 1, qtyKg: sackKg, status: 'created', zoneId: 'z_rec_a', grade: grade?.label, parentIds: [] }), [productId, lineId, shift, today, sackKg, grade?.label]);

  const bag = () => {
    if (!ready || !product || !line) return;
    const labels: Label[] = [];
    for (let i = 0; i < n; i++) labels.push(s.createLabel({ siteId: 'recycling', kind: 'sack', productId: product.id, stageCode: 'pelletise', machineId: line.id, shiftId: shift, day: today, qtyUnits: 1, qtyKg: sackKg, zoneId: 'z_rec_a', grade: grade?.label, parentIds: [] }));
    const ex = s.production.find((p) => p.shiftId === shift && p.machineId === line.id && p.stageCode === 'pelletise');
    addProduction({ siteId: 'recycling', stageCode: 'pelletise', machineId: line.id, shiftId: shift, day: today, productId: product.id, goodUnits: n, outputKg: totalKg, inputKg: ex ? 0 : totalKg });
    setPrintedInfo({ n, kg: totalKg }); setRun(labels.slice(0, MAX_ANIM)); setPrinting(true); setCount(''); focusFirst();
    if (n > MAX_ANIM) useStore.getState().toast({ kind: 'info', title: `${n} sack labels queued`, detail: `Showing the first ${MAX_ANIM}` });
  };
  const onPrinted = () => { setPrinting(false); const first = run[0]; useStore.getState().toast({ kind: 'ok', title: `${fmtNum(printedInfo?.n ?? run.length)} sack${(printedInfo?.n ?? run.length) === 1 ? '' : 's'} labelled · ${s.machines.find((m) => m.id === first?.machineId)?.code ?? ''}`, detail: `${s.products.find((p) => p.id === first?.productId)?.internalName ?? ''} · ${fmtKg(printedInfo?.kg ?? 0)}` }); };

  const cols: Column<SackRow>[] = [
    { key: 'l', header: 'Line', sort: (r) => r.line, cell: (r) => <span className="font-medium">{r.line}</span> },
    { key: 'p', header: 'Product', truncate: 240, sort: (r) => r.product, cell: (r) => <span className="inline-flex items-center gap-1.5"><Swatch colour={r.colour} />{r.product}</span> },
    { key: 'g', header: 'Grade', sort: (r) => r.grade, cell: (r) => r.grade || dash },
    { key: 'n', header: 'Sacks', align: 'right', sort: (r) => r.n, cell: (r) => <BarCell value={r.n} max={maxN} display={fmtNum(r.n)} width={120} /> },
    { key: 'k', header: 'Kg', align: 'right', mono: true, sort: (r) => r.kg, cell: (r) => fmtNum(r.kg) },
    { key: 'a', header: 'Kg per sack', align: 'right', mono: true, cell: (r) => fmtNum(Math.round((r.kg / r.n) * 10) / 10) },
  ];

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <div className="-mb-[var(--gap)]">
        <PageHeader eyebrow={`${site.name} · Bagging`} title="Pellet sacks" meta={<><Badge tone="neutral" dot>{todays.length} sacks today</Badge><Badge tone="neutral">{kindLabel} shift</Badge></>}
          subtitle="Every sack gets a sticker with line, product, grade and net kg. Output per line adds up against capacity." />
      </div>

      <Workbench asideWidth={420} aside={<>
        <Panel icon={Tag} title="Sack sticker" sub="one per sack" actions={<Badge tone="neutral">Live preview</Badge>} footer={<span className="num">{n > 0 ? `${fmtNum(n)} sticker${n === 1 ? '' : 's'} will print` : 'Enter the number of sacks to print'}{line ? ` · ${line.code}` : ''}{grade ? ` · grade ${grade.label}` : ''}</span>}>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-4 grid place-items-center overflow-x-auto"><Sticker label={preview} product={product} machine={line} site={site} shiftKind={kindLabel} /></div>
        </Panel>
        <Panel icon={Activity} title="Yield per line" sub="today · output against daily capacity">
          {yields.map((l) => (
            <div key={l.machine.id} className="[&:not(:last-child)]:mb-1.5">
              <Meter tone={l.machine.id === lineId ? 'series' : 'neutral'} label={<span className="font-medium">{l.machine.code}</span>} sub={`${fmtPct(l.yieldPct)} yield`} value={l.outKg} max={l.capacityKg} display={<>{fmtKg(Math.round(l.outKg))}<span className="text-[var(--text-3)] font-normal"> / {tonnes(l.capacityKg)}</span></>} />
              <div className="t-xs text-[var(--text-3)] num -mt-0.5">{fmtKg(Math.round(l.inKg))} in → {fmtKg(Math.round(l.outKg))} out · {Math.round((l.outKg / l.capacityKg) * 100)}% of capacity</div>
            </div>
          ))}
        </Panel>
      </>}>
        <Panel icon={Package} title="Bag and label" sub={`${kindLabel} shift · ${fmtDayShort(today)}`}
          footer={<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><span className="min-w-0 truncate">{missing.length === 0 ? <span className="text-[var(--text)]">{line?.code} · {product?.internalName} · <span className="num font-medium">{fmtKg(totalKg)}</span></span> : `Still needed: ${missing.join(', ')}.`}</span><Button variant="primary" icon={Printer} disabled={!ready} onClick={bag} hotkey="mod+enter" hotkeyLabel="Bag and label">{printing ? 'Printing…' : n > 0 ? `Bag and label ${fmtNum(n)} sack${n === 1 ? '' : 's'}` : 'Bag and label'}</Button></div>}>
          <div ref={formRef}>
            <FormRow label={<Step n={1} done={!!line}>Line</Step>}>{lines.length === 0 ? <SettingsEmpty what="pelletising lines" where="Machines" icon={Activity} /> : <ChipGroup ariaLabel="Line" options={lines.map((m) => ({ value: m.id, label: m.code, disabled: m.status === 'down' }))} value={lineId} onChange={setLineId} />}</FormRow>
            <FormRow label={<Step n={2} done={!!grade}>Grade</Step>} hint={grades.some((g) => g.example) ? 'Example grades; the plant names its own in Settings → Master data.' : undefined}>
              {grades.length === 0 ? <SettingsEmpty what="pellet grades" icon={Tag} /> : <ChipGroup ariaLabel="Grade" options={grades.map((g) => ({ value: g.id, label: g.label }))} value={gradeId} onChange={setGradeId} />}
            </FormRow>
            <FormRow label={<Step n={3} done={!!product}>Product</Step>} hint={pellets.length ? `${matches.length} of ${pellets.length} pellet products match this grade · products are set up in Settings` : undefined}>
              {pellets.length === 0 ? <SettingsEmpty what="pellet products" where="Products (kind: pellet)" icon={Package} />
                : <Combobox options={matches.map((p) => ({ value: p.id, label: p.internalName, sub: `${fmtKg(p.stdBundleWeightKg)} per ${p.unit ?? 'sack'}`, left: <Swatch colour={p.colour} /> }))} value={productId} onChange={setProductId} placeholder="Search pellet products" className="max-w-[460px]" />}
            </FormRow>
            <FormRow label={<Step n={4} done={n > 0 && sackKg > 0}>Sacks</Step>}>
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 max-w-[560px]">
                <NumberPad value={count} onChange={setCount} label="Number of sacks" suffix="sacks" max={400} />
                <NumberPad value={kg} onChange={setKg} allowDecimal label="Kg per sack" suffix="kg" />
              </div>
              {product?.weightStatus === 'to_be_measured' && <Note tone="warn" className="mt-2">Sack size {fmtKg(product.stdBundleWeightKg)} is a working assumption; to be confirmed with the plant, then set on the product in Settings.</Note>}
            </FormRow>
            <FormRow label="Output">
              <Calc terms={[{ label: 'Sacks', value: fmtNum(n) }, { op: '×', label: 'Per sack', value: fmtNum(sackKg), unit: 'kg' }, { op: '=', label: [line?.code, product?.internalName].filter(Boolean).join(' · ') || 'Output', value: fmtNum(totalKg), unit: 'kg', result: true }]} />
            </FormRow>
          </div>
        </Panel>
        {run.length > 0 && (
          <Panel icon={printing ? Printer : CheckCircle2} title={printing ? 'Printing sack labels' : 'Sack labels printed'} actions={<Badge tone="neutral">{run.length} shown</Badge>}>
            <PrintRun labels={run} site={site} product={s.products.find((p) => p.id === run[0].productId)} machine={s.machines.find((m) => m.id === run[0].machineId)} shiftKind={kindLabel} onDone={onPrinted} />
          </Panel>
        )}
        <Panel icon={Package} title="Today's sacks" sub="by line, product and grade" pad={false}>
          <DataGrid bare dense rows={rows} rowKey={(r) => r.key} columns={cols} empty="No sacks labelled today."
            footer={rows.length ? <tr><td colSpan={3}>All lines</td><td className="text-right num">{fmtNum(todays.length)}</td><td className="text-right num">{fmtNum(todayKg)}</td><td /></tr> : undefined} />
        </Panel>
      </Workbench>

      <Panel icon={Boxes} title="Pellet stock by grade" sub="in the pellet store now" actions={<Button size="sm" variant="ghost" onClick={() => go.site('stock')}>Stock</Button>}>
        {stock.length === 0 ? <Empty icon={Boxes} title="No pellet in stock" /> : (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <Donut size={124} thickness={16} center={fmtNum(stockSacks)} sub="sacks" segments={stock.slice(0, 6).map((r) => ({ label: r.product.internalName, value: r.kg, color: r.product.colour ?? 'var(--text-4)' }))} />
            <div className="flex-1 min-w-[260px]">
              {stock.map((r) => <Meter key={r.product.id} tone="neutral" label={<span className="inline-flex items-center gap-1.5"><Swatch colour={r.product.colour} />{r.product.internalName}</span>} sub={`${fmtNum(r.bundles)} sacks`} value={r.kg} max={stockKg} display={<>{fmtKg(r.kg)}<span className="text-[var(--text-3)] font-normal"> · {Math.round((r.kg / (stockKg || 1)) * 100)}%</span></>} />)}
              <div className="t-sm text-[var(--text-3)] mt-1 num">{fmtNum(stockSacks)} sacks · {fmtKg(stockKg)} in the pellet store</div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
