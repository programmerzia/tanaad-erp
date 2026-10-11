import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, FlaskConical, Palette, Printer, Scale, Tag } from 'lucide-react';
import type { Label } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { dailySeries, lastWorkingDays } from '@/data/selectors';
import { useRefList } from '@/app/hooks';
import { perUnit, sectorForStage } from '../production/shared';
import { SetupHint } from '../production/parts';
import { Avatar, Badge, Button, ChipGroup, DataGrid, Empty, FormRow, Input, Meter, NumberPad, PageHeader, Panel, Stat, useIsTouch, type Column } from '@/components/ui';
import { CountUp } from '@/components/charts';
import { PersonPicker } from '@/components/PersonPicker';
import { Sticker } from '@/components/Sticker';
import { printer } from '@/devices';
import { fmtKg, fmtNum } from '@/data/format';
import { addProduction, useColours, ColourDot, colourChip, draftLabel, FlowStrip, focusFirstField, FormSection, onModEnter, StickerStage, TabThrough, useShift, Workbench } from './kit';

/** M1 · The mixer batch: bags of pellets plus the masterbatch, weights from master data. One batch, one sticker; the batch label is the first link in the mass balance. */
export function Mixer() {
  const s = useStore(); const { today, site, kind, kindLabel, shift } = useShift(); const touch = useIsTouch();
  // Everything the batch is made of comes from Settings → Master data: pellet sources, bagged materials (kg per bag), the masterbatch (kg per batch), colours.
  const sources = useRefList('pellet_source'); const materials = useRefList('material'); const colours = useColours();
  const bagged = perUnit(materials, 'bag'); const additives = perUnit(materials, 'batch');
  const mixer = s.machines.find((m) => m.siteId === site.id && m.stageCode === 'mixer' && m.status !== 'retired'); const sector = sectorForStage(site, 'mixer');
  const allBatches = useMemo(() => s.labels.filter((l) => l.siteId === site.id && l.kind === 'batch'), [s.labels, site.id]);
  const lastBatch = allBatches[allBatches.length - 1];
  const [sourceId, setSource] = useState<string | null>(null); const [pelletId, setPellet] = useState<string | null>(null); const [colour, setColour] = useState<string | null>(null);
  const source = sources.find((x) => x.id === sourceId) ?? sources[0]; const pellet = bagged.find((x) => x.id === pelletId) ?? bagged[0]; const masterbatch = additives[0];
  const bagKg = pellet?.value ?? 0; const masterbatchKg = masterbatch?.value ?? 0;
  /** The usual batch is whatever the last one was: bags = (its kilos − masterbatch) ÷ kg per bag. */
  const usualBags = lastBatch && bagKg ? Math.max(0, Math.round((lastBatch.qtyKg - masterbatchKg) / bagKg)) : 0; const usualKg = usualBags * bagKg + masterbatchKg;
  const [bagsTyped, setBags] = useState<string | null>(null); const bags = bagsTyped ?? (usualBags ? String(usualBags) : '');
  const [lot, setLot] = useState(''); const [operator, setOperator] = useState<string | null>(null);
  /** The sticker on show: the one just printed, or one picked from today's list. Null shows the live preview of the next batch. */
  const [shown, setShown] = useState<{ label: Label; fresh: boolean } | null>(null); const [printing, setPrinting] = useState(false); const [run, setRun] = useState(0);
  const form = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!touch) focusFirstField(form.current); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const nBags = parseInt(bags || '0', 10) || 0; const pelletKg = nBags * bagKg; const totalKg = pelletKg + masterbatchKg;
  const todays = useMemo(() => allBatches.filter((l) => l.day === today).reverse(), [allBatches, today]);
  const byColour = useMemo(() => { const m = new Map<string, { n: number; kg: number }>(); for (const l of todays) { const c = l.colour ?? '—'; const cur = m.get(c) ?? { n: 0, kg: 0 }; cur.n += 1; cur.kg += l.qtyKg; m.set(c, cur); } return [...m.entries()].sort((a, b) => b[1].kg - a[1].kg); }, [todays]);
  const kgIn = todays.reduce((t, l) => t + l.qtyKg, 0); const waiting = todays.filter((l) => l.status !== 'consumed').length;
  const days = lastWorkingDays(site.id, today, 7); const past = dailySeries(s, site.id, days).slice(0, -1);
  const pastBatches = days.slice(0, -1).map((d) => allBatches.filter((l) => l.day === d).length);
  const avgBatches = pastBatches.length ? Math.round(pastBatches.reduce((t, n) => t + n, 0) / pastBatches.length) : 0;
  const avgKg = past.length ? Math.round(past.reduce((t, d) => t + d.kgIn, 0) / past.length) : 0;
  const machine = mixer; const person = (id?: string) => s.people.find((p) => p.id === id);
  const sourceLabel = source?.label;
  const ready = !!mixer && !!pellet && nBags > 0 && !!colour && !!operator && !printing;
  const missing = [pellet ? null : 'a bagged material', nBags > 0 ? null : 'bags', colour ? null : 'colour', operator ? null : 'operator'].filter(Boolean);
  /** Any edit to the form brings the live preview back. */
  const edit = <T,>(set: (v: T) => void) => (v: T) => { setShown(null); set(v); };

  const weighAndLabel = async () => {
    if (!ready || !colour || !operator || !mixer) return;
    const label = s.createLabel({ siteId: site.id, kind: 'batch', stageCode: 'mixer', machineId: mixer.id, operatorId: operator, shiftId: shift, day: today, qtyUnits: 1, qtyKg: totalKg, colour, grade: [sourceLabel, lot ? `lot ${lot}` : ''].filter(Boolean).join(' · ') || undefined, parentIds: [] });
    addProduction({ siteId: site.id, stageCode: 'mixer', machineId: mixer.id, shiftId: shift, day: today, operatorId: operator, goodUnits: 1, inputKg: totalKg, outputKg: totalKg });
    setPrinting(true); setShown({ label, fresh: true }); setRun((r) => r + 1);
    await printer.print({ code: label.code, lines: [`BATCH ${colour}`, `${totalKg} kg`] });
    setPrinting(false);
    useStore.getState().toast({ kind: 'ok', title: `Batch ${label.code} labelled`, detail: `${colour} · ${fmtKg(totalKg)} · ${kindLabel} shift` });
    setBags(null); setLot('');
    if (!touch) focusFirstField(form.current);
  };
  const reprint = async () => {
    if (!shown || printing) return;
    setPrinting(true); setRun((r) => r + 1);
    await printer.print({ code: shown.label.code, lines: [`BATCH ${shown.label.colour ?? ''}`, `${shown.label.qtyKg} kg`] });
    setPrinting(false);
    useStore.getState().toast({ kind: 'info', title: `Sticker ${shown.label.code} printed again`, detail: `${shown.label.colour ?? 'Batch'} · ${fmtKg(shown.label.qtyKg)}` });
  };

  const preview = draftLabel(s.labels.length, { siteId: site.id, kind: 'batch', stageCode: 'mixer', machineId: mixer?.id, operatorId: operator ?? undefined, shiftId: shift, day: today, qtyUnits: 1, qtyKg: totalKg, colour: colour ?? undefined, parentIds: [] });
  const sticker = shown?.label ?? preview;

  const columns: Column<Label>[] = [
    { key: 'code', header: 'Sticker', sort: (l) => l.code, cell: (l) => <span className="code font-medium">{l.code}</span> },
    { key: 'colour', header: 'Colour', sort: (l) => l.colour ?? '', cell: (l) => <span className="inline-flex items-center gap-1.5"><ColourDot colour={l.colour} />{l.colour ?? '—'}</span> },
    { key: 'source', header: 'Pellet source', truncate: 220, cell: (l) => (l.grade ? <span className="text-[var(--text-2)]">{l.grade}</span> : <span className="text-[var(--text-4)]">—</span>) },
    { key: 'op', header: 'Operator', truncate: 150, cell: (l) => { const p = person(l.operatorId); return p ? <span className="inline-flex items-center gap-1.5"><Avatar name={p.fullName} seed={p.avatarSeed} size={18} />{p.fullName.split(' ')[0]}</span> : <span className="text-[var(--text-4)]">—</span>; } },
    { key: 'kg', header: 'Kg', align: 'right', mono: true, sort: (l) => l.qtyKg, cell: (l) => <span className="font-medium">{fmtNum(l.qtyKg)}</span> },
    { key: 'status', header: 'Status', sort: (l) => l.status, cell: (l) => <Badge tone={l.status === 'consumed' ? 'neutral' : 'accent'} dot>{l.status === 'consumed' ? 'At extruders' : 'Waiting'}</Badge> },
  ];

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <div className="-mb-[var(--gap)]">
        <PageHeader eyebrow={`${site.name} · Mixer`} title="Mixer batch" meta={<><Badge tone="neutral">{kindLabel} shift</Badge><Badge tone="neutral" dot>{todays.length} batches today</Badge></>}
          subtitle={usualKg ? `Every batch is weighed and gets a sticker before it goes to the extruders. The last batch was ${fmtKg(usualKg)}.` : 'Every batch is weighed and gets a sticker before it goes to the extruders.'} />
      </div>
      <FlowStrip current="mixer" note={<span><strong className="font-semibold text-[var(--text)]">The batch sticker is the first link in the mass balance.</strong> Every later stage weighs against it: string out, racks, bundles, waste, the lorry at the gate.</span>} />
      {!mixer && <SetupHint what="mixer registered for this site" where="Machines" />}

      <Workbench aside={<>
        <Panel icon={Tag} title="Batch sticker" sub={shown ? undefined : 'live preview'}
          actions={<>{printing ? <Badge tone="accent" dot>Printing</Badge> : shown ? <Badge tone={shown.fresh ? 'ok' : 'neutral'} dot>{shown.fresh ? 'Printed' : 'On file'}</Badge> : <Badge tone="neutral">Preview</Badge>}{shown && <Button size="sm" variant="ghost" icon={Printer} hotkey="p" hotkeyLabel="Print the shown sticker again" disabled={printing} onClick={reprint}>Reprint</Button>}</>}>
          <StickerStage caption={shown ? 'Stick it on the batch bag. The extruder operator picks this batch by colour.' : 'Fills in as you go. It prints when you weigh and label the batch.'}>
            <Sticker key={`${sticker.id}-${run}`} label={sticker} machine={machine} operator={person(sticker.operatorId)} site={site} shiftKind={kindLabel} printing={!!shown && printing} />
          </StickerStage>
        </Panel>
        <div className="grid grid-cols-2 gap-[var(--gap)]">
          <Stat label="Batches today" icon={FlaskConical} accent="var(--series-1)" value={<CountUp value={todays.length} />} spark={pastBatches} sub={`${waiting} waiting · avg ${avgBatches} a day`} />
          <Stat label="Kg in today" icon={Scale} accent="var(--series-3)" value={<CountUp value={kgIn} />} spark={past.map((d) => d.kgIn)} sub={`avg ${fmtNum(avgKg)} kg a day`} />
        </div>
        <Panel icon={Palette} title="Kg by colour" sub="today">
          {byColour.length === 0 ? <Empty icon={Palette} title="No batches yet" hint="Colours appear here with the first batch of the day." /> : byColour.map(([c, v]) => <Meter key={c} label={<span className="inline-flex items-center gap-1.5"><ColourDot colour={c} />{c}</span>} sub={`${v.n} batch${v.n === 1 ? '' : 'es'}`} value={v.kg} max={Math.max(1, byColour[0][1].kg)} display={fmtKg(v.kg)} />)}
        </Panel>
      </>}>
        <Panel icon={FlaskConical} title="New batch" sub="bags in, one sticker out" className="[&>footer]:sticky [&>footer]:bottom-0 [&>footer]:z-[5]"
          footer={<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span className="min-w-0">{printing ? 'Printing the sticker…' : missing.length ? <>Still needed: <span className="text-[var(--text)] font-medium">{missing.join(', ')}</span></> : <><span className="text-[var(--text)] font-medium">{colour} · {fmtKg(totalKg)}</span> · {person(operator ?? undefined)?.fullName.split(' ')[0]} · {kindLabel.toLowerCase()} shift</>}</span>
            <Button variant="primary" size="lg" icon={printing ? Printer : Scale} disabled={!ready} onClick={weighAndLabel} hotkey="mod+enter" hotkeyLabel="Weigh and label the batch">{printing ? 'Printing sticker' : 'Weigh and label'}</Button>
          </div>}>
          <div ref={form} onKeyDownCapture={onModEnter(weighAndLabel)}>
            <FormSection n={1} title="Material">
              <FormRow label="Pellet source">{sources.length === 0 ? <SetupHint inline what="pellet sources" /> : <ChipGroup ariaLabel="Pellet source" options={sources.map((x) => ({ value: x.id, label: x.label }))} value={source?.id ?? null} onChange={edit(setSource)} />}</FormRow>
              {bagged.length === 0 ? <FormRow label="Bagged material"><SetupHint inline what="materials with a weight per bag" /></FormRow> : <>
                {bagged.length > 1 && <FormRow label="Bagged material" hint="Sets the weight of one bag."><ChipGroup ariaLabel="Bagged material" options={bagged.map((x) => ({ value: x.id, label: <span>{x.label}<span className="num font-normal text-[var(--text-3)]"> · {x.value} kg</span></span> }))} value={pellet?.id ?? null} onChange={edit(setPellet)} /></FormRow>}
                <FormRow label={`Bags of ${bagKg} kg`} required>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)] items-start">
                    <NumberPad value={bags} onChange={edit(setBags)} suffix="bags" max={99} />
                    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 t-sm">
                      <div className="flex items-baseline justify-between gap-3"><span className="text-[var(--text-2)] truncate">{pellet?.label}</span><span className="num whitespace-nowrap"><span className="text-[var(--text-3)]">{nBags} × {bagKg} kg = </span>{fmtKg(pelletKg)}</span></div>
                      {masterbatch
                        ? <div className="flex items-baseline justify-between gap-3 mt-0.5"><span className="text-[var(--text-2)] truncate">{masterbatch.label} <span className="text-[var(--text-3)]">per batch</span></span><span className="num whitespace-nowrap">+ {fmtKg(masterbatchKg)}</span></div>
                        : <div className="mt-0.5 text-[var(--text-3)]">No per-batch material is set up, so nothing is added.</div>}
                      <div className="flex items-center justify-between gap-3 mt-1.5 pt-1.5 border-t border-[var(--line)]">
                        <span className="inline-flex items-center gap-2 font-medium text-[var(--text)] whitespace-nowrap">Batch total{nBags > 0 && usualKg > 0 && <Badge tone={totalKg === usualKg ? 'ok' : 'warn'} dot>{totalKg === usualKg ? 'Same as last batch' : 'Differs from last batch'}</Badge>}</span>
                        <span className="num t-kpi whitespace-nowrap">{fmtNum(totalKg)}<span className="t-sm font-normal text-[var(--text-3)]"> kg</span></span>
                      </div>
                      <div className="t-xs text-[var(--text-3)] mt-0.5 num">{nBags} × {bagKg} kg{masterbatch ? ` + ${masterbatchKg} kg` : ''} = {fmtNum(totalKg)} kg{usualKg > 0 && totalKg !== usualKg && nBags > 0 ? ` · the last batch was ${usualBags} bags, ${fmtNum(usualKg)} kg` : ''}</div>
                    </div>
                  </div>
                </FormRow>
              </>}
            </FormSection>
            <FormSection n={2} title="Batch">
              <FormRow label="Colour" required>{colours.names.length === 0 ? <SetupHint inline what="colours" /> : <ChipGroup ariaLabel="Colour" options={colours.names.map(colourChip)} value={colour} onChange={edit(setColour)} />}</FormRow>
              <FormRow label="Lot number" hint="Optional. The lot number written on the bags."><Input value={lot} onChange={(e) => edit(setLot)(e.target.value.toUpperCase())} placeholder="Lot number" className="code max-w-[260px]" /></FormRow>
            </FormSection>
            <FormSection n={3} title="Operator">
              <FormRow label="Mixer operator" required><TabThrough className="max-w-[380px]"><PersonPicker siteId={site.id} sector={sector} value={operator} onChange={(id) => edit(setOperator)(id)} /></TabThrough></FormRow>
            </FormSection>
          </div>
        </Panel>

        <Panel icon={ClipboardList} title="Today's batches" sub={`${kind === 'day' ? 'day' : 'day and night'} shift · select one to see its sticker`} pad={false}>
          <DataGrid bare dense rows={todays} columns={columns} rowKey={(l) => l.id} selectedKey={shown?.label.id ?? null} onRowClick={(l) => setShown({ label: l, fresh: false })} maxHeight={320}
            empty={<Empty icon={FlaskConical} title="No batches today" hint="The first batch you weigh will appear here with its sticker code." />}
            footer={todays.length ? <tr><td colSpan={4}>{todays.length} batches · {waiting} waiting for the extruders</td><td className="num text-right">{fmtNum(kgIn)}</td><td className="font-normal text-[var(--text-3)]">kg in</td></tr> : undefined} />
        </Panel>
      </Workbench>
    </div>
  );
}
