import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BarChart3, CheckCircle2, Clock, Factory, History, ListChecks, Printer, ScanLine, Scale, Scroll, Tag, Weight } from 'lucide-react';
import type { Label, Machine } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useGo } from '@/app/hooks';
import { lastWorkingDays, machinesOf } from '@/data/selectors';
import { Avatar, Badge, Button, ChipGroup, Combobox, DataGrid, FormRow, KpiStrip, NumberPad, PageHeader, Panel, Stat, Tabs, type Column } from '@/components/ui';
import { ColumnChart, CountUp } from '@/components/charts';
import { PersonPicker } from '@/components/PersonPicker';
import { ScaleWidget } from '@/components/ScaleWidget';
import { Sticker } from '@/components/Sticker';
import { printer } from '@/devices';
import { fmtDayShort, fmtKg, fmtNum } from '@/data/format';
import { addProduction, BarCell, dash, ScaleBay, SettingsEmpty, shortCode, Step, useFirstField, useScaleKey, useScaleTitle, useShift } from './kit';

/** The six fields of the paper sticker, in the order they are written on it. */
const FIELDS = ['DATE', 'OPERATOR', 'SHIFT', 'MACHINE', 'KG', 'ROLL'] as const;
const GAINS = [
  { icon: ScanLine, title: 'Scannable', text: 'Conversion scans the roll in. Nobody copies a number.' },
  { icon: Weight, title: 'Weighed, not written', text: 'Kg comes straight from the roll scale.' },
  { icon: ListChecks, title: 'Counted on print', text: 'Rolls and kg per machine add up by themselves.' },
];
/** A plausible reading for the simulated scale: the roll type's standard weight, within its tolerance. */
const simulatedKg = (std: number, tolPct: number) => Math.max(1, Math.round(std * (1 + ((Math.random() * 2 - 1) * tolPct) / 100)));
/** d/m/yy, the way the date is written by hand on the floor. */
const handDate = (day: string) => `${+day.slice(8, 10)}/${+day.slice(5, 7)}/${day.slice(2, 4)}`;

/** The same roll as it would be written by hand on today's paper sticker: the six fields, nothing else. Blank lines are fields not filled in yet. */
function PaperSticker({ values }: { values: Record<(typeof FIELDS)[number], string> }) {
  return (
    <div className="relative w-[200px] -rotate-1 rounded-xs bg-[#fdfbf2] text-[#1d2b6b] border border-[#e6e0c8] shadow-[var(--shadow-raise)] px-3.5 pt-4 pb-3" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 27px, rgba(29,43,107,.16) 28px)', backgroundPosition: '0 14px' }}>
      <span aria-hidden className="absolute -top-2 left-1/2 -translate-x-1/2 w-14 h-4 bg-[rgba(255,230,120,.8)] rotate-2" />
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 leading-[28px]" style={{ fontFamily: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive' }}>
        {FIELDS.map((k) => <div key={k} className="contents"><span className="uppercase text-[10px] tracking-wider text-[#6b7399] self-end">{k}</span><span className="font-bold text-[16px] truncate h-[28px]">{values[k]}</span></div>)}
      </div>
    </div>
  );
}

interface MachineRow { machine: Machine; rolls: number; byType: Record<string, number>; kg: number; operators: string[] }

/** B2 · The roll sticker. Their paper sticker beside the same six fields, printed, with a code the next stage can scan. */
export function RollSticker() {
  const s = useStore(); const go = useGo(); const { today, site, kindLabel, shift } = useShift();
  const extruders = machinesOf(s, 'bags', 'extrude');
  const [machineId, setMachineId] = useState<string | null>(null); const [operator, setOperator] = useState<string | null>(null); const [productId, setProductId] = useState<string | null>(null);
  const [mode, setMode] = useState<'scale' | 'pad'>('scale'); const [pad, setPad] = useState(''); const [kg, setKg] = useState<number | null>(null);
  const [target, setTarget] = useState(0); const [round, setRound] = useState(0);
  const [printed, setPrinted] = useState<Label | null>(null); const [printing, setPrinting] = useState(false);
  const [formRef, focusFirst] = useFirstField<HTMLDivElement>(); const scaleRef = useRef<HTMLDivElement>(null);
  useScaleKey(scaleRef, mode === 'scale'); const scaleTitle = useScaleTitle('Roll scale');

  /** Roll types are products of kind "roll", managed in Settings → Products. */
  const rollTypes = useMemo(() => s.products.filter((p) => p.siteId === 'bags' && p.kind === 'roll' && p.active !== false), [s.products]);
  useEffect(() => { if (!rollTypes.some((p) => p.id === productId)) setProductId(rollTypes[0]?.id ?? null); }, [rollTypes, productId]);
  const machine = extruders.find((m) => m.id === machineId); const product = rollTypes.find((p) => p.id === productId); const op = s.people.find((p) => p.id === operator);
  useEffect(() => { if (product) setTarget(simulatedKg(product.stdBundleWeightKg, product.weightTolerancePct)); }, [product?.id, round]); // eslint-disable-line react-hooks/exhaustive-deps
  const rollName = (pid?: string) => s.products.find((p) => p.id === pid)?.internalName ?? '—';
  const stageName = site.stages.find((st) => st.code === 'extrude')?.name.toLowerCase() ?? '';
  const sector = site.sectors.filter((x) => stageName && (x.toLowerCase().includes(stageName) || stageName.includes(x.toLowerCase())));
  const liveKg = mode === 'scale' ? kg : parseFloat(pad || '0') || null;
  const preview: Label = useMemo(() => ({ id: 'preview', code: 'BAG-ROL-······', siteId: 'bags', kind: 'roll', productId: productId ?? undefined, stageCode: 'extrude', machineId: machineId ?? undefined, operatorId: operator ?? undefined, shiftId: shift, day: today, qtyUnits: 1, qtyKg: liveKg ?? 0, status: 'created', zoneId: 'z_bags_a', parentIds: [] }), [productId, machineId, operator, shift, today, liveKg]);
  const ready = !!machine && !!operator && !!product && !!liveKg && liveKg > 0 && !printing;
  const missing = [!machine && 'a machine', !operator && 'an operator', !product && 'a roll type', !(liveKg && liveKg > 0) && 'the weight'].filter((x): x is string => !!x);

  const rolls = useMemo(() => s.labels.filter((l) => l.siteId === 'bags' && l.kind === 'roll'), [s.labels]);
  const todaysRolls = useMemo(() => rolls.filter((l) => l.day === today), [rolls, today]);
  const waiting = rolls.filter((l) => l.status === 'in_stock');
  const todayKg = todaysRolls.reduce((t, l) => t + l.qtyKg, 0);
  const perMachine: MachineRow[] = extruders.map((m) => { const mine = todaysRolls.filter((l) => l.machineId === m.id); return { machine: m, rolls: mine.length, kg: mine.reduce((t, l) => t + l.qtyKg, 0), byType: Object.fromEntries(rollTypes.map((p) => [p.id, mine.filter((l) => l.productId === p.id).length])), operators: [...new Set(mine.map((l) => l.operatorId).filter((x): x is string => !!x))] }; });
  const maxKg = Math.max(1, ...perMachine.map((r) => r.kg)); const idle = perMachine.filter((r) => r.rolls === 0 && r.machine.status !== 'down');
  const days = lastWorkingDays('bags', today, 7);
  const perDay = useMemo(() => days.map((d) => { const mine = rolls.filter((l) => l.day === d); return { day: d, rolls: mine.length, kg: mine.reduce((t, l) => t + l.qtyKg, 0) }; }), [rolls, days.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const past = perDay.slice(0, -1);
  const latest = todaysRolls.slice(-6).reverse();
  const person = (id?: string) => s.people.find((p) => p.id === id);

  const print = async () => {
    if (!ready || !machine || !operator || !liveKg || !product) return;
    const label = s.createLabel({ siteId: 'bags', kind: 'roll', productId: product.id, stageCode: 'extrude', machineId: machine.id, operatorId: operator, shiftId: shift, day: today, qtyUnits: 1, qtyKg: liveKg, zoneId: 'z_bags_a', parentIds: [] });
    addProduction({ siteId: 'bags', stageCode: 'extrude', machineId: machine.id, shiftId: shift, day: today, operatorId: operator, productId: product.id, goodUnits: 1, inputKg: liveKg, outputKg: liveKg });
    setPrinted(label); setPrinting(true);
    await printer.print({ code: label.code, lines: [...FIELDS] }); setPrinting(false);
    useStore.getState().toast({ kind: 'ok', title: `Roll sticker printed · ${machine.code}`, detail: `${product.internalName} · ${fmtKg(liveKg)} · ${op?.fullName.split(' ')[0]} · ${kindLabel}` });
    setKg(null); setPad(''); setRound((r) => r + 1); focusFirst();
  };

  const typeCols = rollTypes.slice(0, 4); const countOf = (pid: string) => todaysRolls.filter((l) => l.productId === pid).length;
  const typeSplit = rollTypes.map((p) => `${countOf(p.id)} ${p.internalName}`).join(' · ');
  const paper = { DATE: handDate(today), OPERATOR: op?.fullName.split(' ')[0] ?? '', SHIFT: kindLabel, MACHINE: machine ? shortCode(machine.code, extruders) : '', KG: liveKg ? String(liveKg) : '', ROLL: product?.internalName ?? '' };
  const machineCols: Column<MachineRow>[] = [
    { key: 'm', header: 'Machine', sort: (r) => r.machine.code, cell: (r) => <span className="inline-flex items-center gap-2 font-medium">{r.machine.code}{r.machine.status === 'down' && <Badge tone="bad" dot>Down</Badge>}</span> },
    { key: 'op', header: 'Operators', cell: (r) => (r.operators.length ? <span className="inline-flex items-center gap-1.5"><span className="flex -space-x-1">{r.operators.slice(0, 3).map((id) => { const p = person(id); return p ? <Avatar key={id} name={p.fullName} seed={p.avatarSeed} size={20} className="ring-2 ring-[var(--surface)]" /> : null; })}</span><span className="text-[var(--text-2)] truncate">{r.operators.slice(0, 2).map((id) => person(id)?.fullName.split(' ')[0]).join(', ')}{r.operators.length > 2 ? ` +${r.operators.length - 2}` : ''}</span></span> : dash) },
    { key: 'r', header: 'Rolls', align: 'right', mono: true, sort: (r) => r.rolls, cell: (r) => (r.rolls ? <span className="font-medium">{r.rolls}</span> : dash) },
    ...typeCols.map((p): Column<MachineRow> => ({ key: `t_${p.id}`, header: p.internalName, align: 'right', mono: true, truncate: 150, sort: (r) => r.byType[p.id] ?? 0, cell: (r) => (r.rolls ? r.byType[p.id] ?? 0 : dash) })),
    { key: 'kg', header: 'Kg', align: 'right', sort: (r) => r.kg, cell: (r) => (r.kg ? <BarCell value={r.kg} max={maxKg} display={fmtNum(r.kg)} width={96} /> : dash) },
    { key: 'avg', header: 'Avg kg / roll', align: 'right', mono: true, sort: (r) => (r.rolls ? r.kg / r.rolls : 0), cell: (r) => (r.rolls ? fmtNum(Math.round(r.kg / r.rolls)) : dash) },
  ];

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <div className="-mb-[var(--gap)]">
        <PageHeader eyebrow={`${site.name} · Extrusion`} title="Roll sticker" meta={<Badge tone="ok" dot>Sticker format confirmed</Badge>}
          subtitle="The same six fields as the paper sticker, printed with a code the next stage can scan."
          actions={<Button variant="ghost" icon={Factory} className="max-sm:hidden" onClick={() => go.site('production/wall')}>{site.machineWallTitle}</Button>} />
      </div>

      <div className="grid gap-[var(--gap)] xl:grid-cols-[minmax(0,1fr)_520px]">
        <Panel className="h-full" bodyClassName="flex-1" icon={Tag} title="New roll" sub={`Extrusion · ${fmtDayShort(today)}`} actions={<Badge tone="neutral" dot>{kindLabel} shift</Badge>}
          footer={<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><span className="min-w-0 truncate">{missing.length ? `Still needed: ${missing.join(', ')}.` : <span className="text-[var(--text)]">{machine?.code} · {op?.fullName} · {product?.internalName} · <span className="num font-medium">{fmtKg(liveKg ?? 0)}</span></span>}</span><Button variant="primary" icon={Printer} disabled={!ready} onClick={print} hotkey="mod+enter" hotkeyLabel="Print sticker">{printing ? 'Printing…' : 'Print sticker'}</Button></div>}>
          <div ref={formRef}>
            <FormRow label={<Step n={1} done={!!machine}>Machine</Step>}><ChipGroup ariaLabel="Machine" options={extruders.map((m) => ({ value: m.id, label: shortCode(m.code, extruders), disabled: m.status === 'down' }))} value={machineId} onChange={setMachineId} columns={Math.min(8, Math.max(1, extruders.length))} /></FormRow>
            <FormRow label={<Step n={2} done={!!operator}>Operator</Step>}><PersonPicker siteId="bags" sector={sector} value={operator} onChange={(id) => setOperator(id)} placeholder="Search extrusion operators" /></FormRow>
            <FormRow label={<Step n={3} done={!!product}>Roll type</Step>} hint={product ? `Standard roll ${fmtKg(product.stdBundleWeightKg)} ± ${product.weightTolerancePct}% · roll types are products in Settings` : undefined}>
              {rollTypes.length === 0 ? <SettingsEmpty what="roll types" where="Products (kind: roll)" icon={Scroll} />
                : rollTypes.length <= 6 ? <ChipGroup ariaLabel="Roll type" options={rollTypes.map((p) => ({ value: p.id, label: p.internalName }))} value={productId} onChange={setProductId} />
                : <Combobox options={rollTypes.map((p) => ({ value: p.id, label: p.internalName, sub: fmtKg(p.stdBundleWeightKg) }))} value={productId} onChange={setProductId} placeholder="Search roll types" />}
            </FormRow>
            <FormRow label={<Step n={4} done={!!liveKg && liveKg > 0}>Weight</Step>}>
              <Tabs className="mb-2" tabs={[{ value: 'scale', label: 'Roll scale' }, { value: 'pad', label: 'Type it' }]} value={mode} onChange={setMode} />
              {mode === 'scale'
                ? <ScaleBay innerRef={scaleRef} note={kg !== null ? <span className="inline-flex items-center gap-1 text-[var(--text-2)]"><CheckCircle2 className="size-3.5 text-[var(--ok)]" />{fmtKg(kg)} taken from the roll scale</span> : 'Put the roll on the scale.'}><ScaleWidget key={round} title={scaleTitle} targetKg={target} onReading={(v) => setKg(v)} /></ScaleBay>
                : <div className="max-w-[320px]"><NumberPad value={pad} onChange={setPad} allowDecimal suffix="kg" max={200} /></div>}
            </FormRow>
          </div>
        </Panel>

        <Panel className="h-full" bodyClassName="flex-1 flex flex-col" icon={Scroll} title="From paper to print" sub="one roll, the same six fields" actions={<Badge tone="neutral">Live preview</Badge>}
          footer={printed && !printing ? <span className="flex items-center gap-1.5 min-w-0"><CheckCircle2 className="size-4 text-[var(--ok)] shrink-0" /><span className="truncate">Last printed <span className="code text-[var(--text)]">{printed.code}</span> · {fmtKg(printed.qtyKg)} · {extruders.find((m) => m.id === printed.machineId)?.code}</span></span> : printing ? <span className="flex items-center gap-1.5"><Printer className="size-4 shrink-0" />Printing {printed?.code}…</span> : <span>The code is assigned when the sticker prints.</span>}>
          <div className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-4 grid gap-x-2 gap-y-3 justify-items-center content-center items-start sm:grid-cols-[1fr_auto_1fr]">
            <figure className="m-0 flex flex-col items-center gap-3"><figcaption className="t-label">On paper today</figcaption><PaperSticker values={paper} /></figure>
            <span aria-hidden className="size-7 rounded-full grid place-items-center bg-[var(--surface)] border border-[var(--line-2)] text-[var(--text-2)] self-center rotate-90 sm:rotate-0 sm:mt-6"><ArrowRight className="size-4" /></span>
            <figure className="m-0 flex flex-col items-center gap-3"><figcaption className="t-label">Printed</figcaption><Sticker label={printed && printing ? printed : preview} product={product} machine={machine} operator={op} site={site} shiftKind={kindLabel} printing={printing} compact /></figure>
          </div>
          <div className="grid gap-x-3 gap-y-2 mt-3 sm:grid-cols-3">
            {GAINS.map((g) => (
              <div key={g.title} className="flex sm:flex-col items-start gap-2 min-w-0">
                <span className="size-7 rounded-md grid place-items-center shrink-0" style={{ background: 'color-mix(in srgb, var(--site-bags) 12%, transparent)', color: 'var(--site-bags)' }}><g.icon className="size-4" strokeWidth={2} /></span>
                <div className="min-w-0"><div className="t-base font-medium">{g.title}</div><div className="t-sm text-[var(--text-3)]">{g.text}</div></div>
              </div>
            ))}
          </div>
          <p className="t-xs text-[var(--text-3)] mt-3">Left: this roll as it would be written by hand on today's paper sticker. Right: the same six fields, printed, with a code.</p>
        </Panel>

        <Panel icon={History} title="Latest rolls" sub={`today · ${todaysRolls.length} printed`} pad={false}>
          <DataGrid bare dense rows={latest} rowKey={(l) => l.id} selectedKey={printed?.id} empty="No roll printed yet today."
            columns={[
              { key: 'c', header: 'Code', cell: (l) => <span className="code">{l.code}</span> },
              { key: 'm', header: 'Machine', cell: (l) => s.machines.find((m) => m.id === l.machineId)?.code ?? '—' },
              { key: 'r', header: 'Roll', cell: (l) => rollName(l.productId) },
              { key: 'o', header: 'Operator', truncate: 180, cell: (l) => { const p = person(l.operatorId); return p ? <span className="inline-flex items-center gap-1.5"><Avatar name={p.fullName} seed={p.avatarSeed} size={18} />{p.fullName}</span> : dash; } },
              { key: 'k', header: 'Kg', align: 'right', mono: true, cell: (l) => <span className="font-medium">{fmtNum(l.qtyKg)}</span> },
            ]} />
        </Panel>
        <Panel icon={BarChart3} title="Film extruded per day" sub="kg · last 7 working days">
          <ColumnChart height={150} data={perDay.map((d) => ({ label: fmtDayShort(d.day), values: [d.kg], partial: d.day === today }))} />
          <p className="t-xs text-[var(--text-3)] mt-1">Today is drawn lighter: the shift is still running.</p>
        </Panel>
      </div>

      <KpiStrip className="md:!grid-cols-2 xl:!grid-cols-none">
        <Stat label="Rolls today" icon={Scroll} accent="var(--series-1)" value={<CountUp value={todaysRolls.length} />} spark={past.map((d) => d.rolls)} sub={typeSplit || 'No roll types set up'} />
        <Stat label="Film extruded today" icon={Scale} accent="var(--series-3)" value={<><CountUp value={todayKg} /><span className="t-base text-[var(--text-3)] font-medium"> kg</span></>} spark={past.map((d) => d.kg)} sub={todaysRolls.length ? `${fmtNum(Math.round(todayKg / todaysRolls.length))} kg per roll on average` : 'No roll weighed yet'} />
        <Stat label="Waiting for conversion" icon={Clock} accent="var(--series-4)" value={<CountUp value={waiting.length} />} sub={`rolls · ${fmtKg(waiting.reduce((t, l) => t + l.qtyKg, 0))} in the roll store`} onClick={() => go.site('production/convert')} />
        <Stat label="Extruders with a roll" icon={Factory} accent="var(--series-7)" tone={idle.length ? 'warn' : 'neutral'} value={<>{perMachine.filter((r) => r.rolls > 0).length}<span className="text-[var(--text-3)] font-medium">/{extruders.length}</span></>} sub={idle.length ? `Nothing yet from ${idle.map((r) => shortCode(r.machine.code, extruders)).join(', ')}` : 'Every extruder has printed today'} onClick={() => go.site('production/wall')} />
      </KpiStrip>

      <Panel icon={Factory} title="Today's rolls per machine" sub={`${kindLabel} shift so far`} pad={false}>
        <DataGrid bare dense rows={perMachine} rowKey={(r) => r.machine.id} columns={machineCols} selectedKey={machineId}
          footer={<tr><td colSpan={2}>All extruders</td><td className="text-right num">{todaysRolls.length}</td>{typeCols.map((p) => <td key={p.id} className="text-right num">{countOf(p.id)}</td>)}<td className="text-right num">{fmtNum(todayKg)}</td><td className="text-right num">{todaysRolls.length ? fmtNum(Math.round(todayKg / todaysRolls.length)) : '—'}</td></tr>} />
      </Panel>
    </div>
  );
}
