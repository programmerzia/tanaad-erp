import { useMemo, useState } from 'react';
import { Activity, BarChart3, Check, Factory, FlaskConical, Layers, Plus, Printer, Spool, Wrench } from 'lucide-react';
import type { Label, Machine, Person, ProductionEntry } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { lastWorkingDays, machinesOf } from '@/data/selectors';
import { NOW_LABEL, REASON_AFTER_MIN, codeKey, sectorForStage, shiftWindow } from '../production/shared';
import { SetupHint } from '../production/parts';
import { Avatar, Badge, Bar, Button, ChipGroup, Combobox, DataGrid, Empty, KpiStrip, NumberPad, Panel, Sheet, StackedBar, Stat, Status, Tabs, cn, useIsTouch, type Column, type Tone } from '@/components/ui';
import { ColumnChart, CountUp, Legend, TimeTrack } from '@/components/charts';
import { PersonPicker } from '@/components/PersonPicker';
import { Sticker } from '@/components/Sticker';
import { SITE_COLOR } from '@/config/siteIdentity';
import { printer } from '@/devices';
import { fmtDayShort, fmtKg, fmtNum } from '@/data/format';
import { addProduction, useColours, ColourDot, colourChip, FieldBlock, Figure, FlowStrip, onModEnter, StickerStage, TabThrough, useRovingGrid, useShift } from './kit';

type State = 'logged' | 'not_logged' | 'down';
interface Tile { machine: Machine; entry?: ProductionEntry; operator?: Person; state: State }
interface RackRow { colour: string; racks: Label[]; kg: number; oldest: string }
const STATE: Record<State, { label: string; tone: Tone; color: string }> = {
  logged: { label: 'Logged', tone: 'ok', color: 'var(--ok)' },
  not_logged: { label: 'Not logged', tone: 'warn', color: 'var(--warn)' },
  down: { label: 'Down', tone: 'bad', color: 'var(--bad)' },
};

/** One extruder on the map: string out this shift, who runs it, and whether it has been logged. */
function ExtruderCell({ t, max, tabIndex, selected, onOpen, onFocus }: { t: Tile; max: number; tabIndex: number; selected: boolean; onOpen: () => void; onFocus: () => void }) {
  const st = STATE[t.state]; const kg = t.entry?.outputKg ?? 0;
  return (
    <button data-roving type="button" tabIndex={tabIndex} onClick={onOpen} onFocus={onFocus} aria-label={`${t.machine.code}, ${st.label}${t.entry ? `, ${fmtKg(kg)} this shift` : ''}`}
      title={`${t.machine.code} · ${st.label}${t.operator ? ` · ${t.operator.fullName}` : ''}`}
      className={cn('relative text-left rounded-lg border px-2.5 py-2 min-h-[86px] flex flex-col justify-between gap-1.5 overflow-hidden transition-shadow hover:shadow-[var(--shadow-raise)] outline-offset-0', selected ? 'border-[var(--brand)]' : 'border-[var(--line)]')}
      style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${st.color} ${t.state === 'down' ? 16 : 7}%, var(--surface)), var(--surface) 70%)` }}>
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: st.color }} />
      <div className="flex items-center justify-between gap-1">
        <span className="t-xs font-semibold text-[var(--text-2)] leading-none whitespace-nowrap">{t.machine.code}</span>
        {t.state === 'down' ? <Wrench className="size-3.5 text-[var(--bad)]" /> : t.state === 'not_logged' ? <span className="size-2 rounded-full bg-[var(--warn)] anim-live" /> : <Check className="size-3.5 text-[var(--ok)]" strokeWidth={2.5} />}
      </div>
      {t.state === 'down' ? <div className="t-xs text-[var(--bad)] font-medium">Down</div> : !t.entry ? <div className="t-xs text-[var(--text-3)]">Not logged · press to log</div> : (
        <div>
          <div className="flex items-baseline justify-between gap-1"><span className="num t-lg font-semibold leading-none">{fmtNum(kg)}<span className="t-xs font-normal text-[var(--text-3)]"> kg</span></span>{t.entry.downtimeMin > 0 && <span className="num t-xs font-medium text-[var(--warn)]">{t.entry.downtimeMin} min</span>}</div>
          <Bar value={kg} max={max} tone="series" height={3} className="mt-1.5" />
          <div className="flex items-center gap-1 mt-1.5 min-w-0">{t.operator ? <><Avatar name={t.operator.fullName} seed={t.operator.avatarSeed} size={14} /><span className="t-xs text-[var(--text-3)] truncate">{t.operator.fullName.split(' ')[0]}</span></> : <span className="t-xs text-[var(--text-4)]">No operator</span>}</div>
        </div>
      )}
    </button>
  );
}

/** M2 · The extruders: string output per machine per shift, and the drying racks that make WIP countable by colour. */
export function Extruders() {
  const s = useStore(); const { today, site, kind, kindLabel, shift } = useShift();
  const extruders = machinesOf(s, site.id, 'extrude').filter((m) => m.status !== 'retired' && m.status !== 'arriving'); const colours = useColours();
  const [openId, setOpenId] = useState<string | null>(null); const [view, setView] = useState<'map' | 'table'>('map');
  const rove = useRovingGrid(extruders.length);
  const tiles: Tile[] = extruders.map((m) => { const entry = s.production.find((p) => p.shiftId === shift && p.machineId === m.id && p.stageCode === 'extrude'); return { machine: m, entry, operator: s.people.find((p) => p.id === entry?.operatorId), state: m.status === 'down' ? 'down' : entry ? 'logged' : 'not_logged' }; });
  const batches = useMemo(() => s.labels.filter((l) => l.siteId === site.id && l.kind === 'batch' && l.day === today).sort((a, b) => (a.status === 'in_stock' ? -1 : 1) - (b.status === 'in_stock' ? -1 : 1)), [s.labels, today, site.id]);
  const racks = useMemo(() => s.labels.filter((l) => l.siteId === site.id && l.kind === 'rack' && l.status === 'in_stock'), [s.labels, site.id]);
  const rackRows = useMemo<RackRow[]>(() => { const m = new Map<string, Label[]>(); for (const r of racks) { const c = r.colour ?? '—'; m.set(c, [...(m.get(c) ?? []), r]); } return [...m.entries()].map(([colour, list]) => ({ colour, racks: list, kg: list.reduce((t, r) => t + r.qtyKg, 0), oldest: list.map((r) => r.day).sort()[0] })).sort((a, b) => b.kg - a.kg); }, [racks]);
  const totalKg = tiles.reduce((t, x) => t + (x.entry?.outputKg ?? 0), 0); const maxKg = Math.max(1, ...tiles.map((x) => x.entry?.outputKg ?? 0));
  const logged = tiles.filter((x) => x.entry).length; const down = tiles.filter((x) => x.state === 'down').length; const notLogged = tiles.filter((x) => x.state === 'not_logged').length;
  const downtime = tiles.reduce((t, x) => t + (x.entry?.downtimeMin ?? 0), 0);
  const rackKg = racks.reduce((t, r) => t + r.qtyKg, 0); const waitingBatches = batches.filter((b) => b.status === 'in_stock');
  const days = lastWorkingDays(site.id, today, 7); const pastDays = days.slice(0, -1);
  const pastDowntime = pastDays.map((d) => -s.production.filter((p) => p.siteId === site.id && p.stageCode === 'extrude' && p.day === d).reduce((t, p) => t + p.downtimeMin, 0));
  const pastRackKg = pastDays.map((d) => s.labels.filter((l) => l.siteId === site.id && l.kind === 'rack' && l.day === d).reduce((t, l) => t + l.qtyKg, 0));
  const pastBatches = pastDays.map((d) => s.labels.filter((l) => l.siteId === site.id && l.kind === 'batch' && l.day === d).length);
  const stringByDay = days.map((d) => Math.round(s.production.filter((p) => p.siteId === site.id && p.stageCode === 'extrude' && p.day === d).reduce((t, p) => t + p.outputKg, 0)));
  const win = shiftWindow(site, today, today, kind); const hoursIn = Math.floor(win.nowH); const progress = Math.max(0.05, Math.min(1, hoursIn / win.span));
  const stageNo = (code: string) => [...site.stages].sort((a, b) => a.sequence - b.sequence).findIndex((st) => st.code === code) + 1;

  const consumeRack = (colour: string) => {
    const r = [...(rackRows.find((x) => x.colour === colour)?.racks ?? [])].sort((a, b) => a.day.localeCompare(b.day))[0]; if (!r) return;
    s.consumeLabel(r.id);
    useStore.getState().toast({ kind: 'ok', title: `Rack ${r.code} taken to the looms`, detail: `${colour} · ${fmtKg(r.qtyKg)} left WIP` });
  };
  const open = (id: string) => { rove.setActive(Math.max(0, tiles.findIndex((x) => x.machine.id === id))); setOpenId(id); };
  /** N opens the first extruder that still has no entry, or the one the arrow keys are on. */
  const logNext = () => { const t = tiles.find((x) => x.state === 'not_logged') ?? tiles[rove.index] ?? tiles[0]; if (t) open(t.machine.id); };
  /** Closing the sheet puts the keyboard back on the extruder it was opened for. */
  const close = () => { setOpenId(null); setTimeout(() => rove.ref.current?.querySelectorAll<HTMLElement>('[data-roving]')[rove.index]?.focus(), 40); };

  const machineCols: Column<Tile>[] = [
    { key: 'm', header: 'Extruder', sort: (t) => codeKey(t.machine.code), cell: (t) => <span className="font-medium">{t.machine.code}</span> },
    { key: 'op', header: 'Operator', truncate: 180, cell: (t) => (t.operator ? <span className="inline-flex items-center gap-1.5"><Avatar name={t.operator.fullName} seed={t.operator.avatarSeed} size={18} />{t.operator.fullName}</span> : <span className="text-[var(--text-4)]">—</span>) },
    { key: 'out', header: 'String out', sort: (t) => t.entry?.outputKg ?? -1, cell: (t) => (t.entry ? <span className="flex items-center gap-2"><Bar value={t.entry.outputKg} max={maxKg} tone="series" className="w-[72px]" /><span className="num font-medium">{fmtKg(t.entry.outputKg)}</span></span> : <span className="text-[var(--text-4)]">—</span>) },
    { key: 'in', header: 'Batch in', align: 'right', mono: true, sort: (t) => t.entry?.inputKg ?? -1, cell: (t) => (t.entry ? fmtKg(t.entry.inputKg) : '—') },
    { key: 'down', header: 'Downtime', align: 'right', mono: true, sort: (t) => t.entry?.downtimeMin ?? 0, cell: (t) => (t.entry?.downtimeMin ? <span className={t.entry.downtimeMin > REASON_AFTER_MIN ? 'text-[var(--warn)] font-medium' : undefined}>{t.entry.downtimeMin} min</span> : <span className="text-[var(--text-4)]">—</span>) },
    { key: 'st', header: 'Status', sort: (t) => t.state, cell: (t) => <Badge tone={STATE[t.state].tone} dot>{STATE[t.state].label}</Badge> },
  ];
  const rackCols: Column<RackRow>[] = [
    { key: 'c', header: 'Colour', cell: (r) => <span className="inline-flex items-center gap-1.5 font-medium"><ColourDot colour={r.colour} />{r.colour}</span> },
    { key: 'n', header: 'Racks', align: 'right', mono: true, cell: (r) => r.racks.length },
    { key: 'kg', header: 'String waiting', cell: (r) => <span className="flex items-center gap-2"><Bar value={r.kg} max={Math.max(1, rackRows[0]?.kg ?? 1)} tone="series" className="w-[52px] hidden sm:block" /><span className="num font-medium">{fmtKg(r.kg)}</span></span> },
    { key: 'a', header: '', align: 'right', cell: (r) => <Button size="sm" onClick={() => consumeRack(r.colour)} title={`Take the oldest ${r.colour} rack (${fmtDayShort(r.oldest)}) to the looms`}>Consume rack</Button> },
  ];
  const batchCols: Column<Label>[] = [
    { key: 'code', header: 'Batch', cell: (l) => <span className="code font-medium">{l.code}</span> },
    { key: 'colour', header: 'Colour', cell: (l) => <span className="inline-flex items-center gap-1.5"><ColourDot colour={l.colour} />{l.colour ?? '—'}</span> },
    { key: 'kg', header: 'Kg', align: 'right', mono: true, cell: (l) => fmtNum(l.qtyKg) },
    { key: 'st', header: 'Status', cell: (l) => <Badge tone={l.status === 'in_stock' ? 'accent' : 'neutral'} dot>{l.status === 'in_stock' ? 'Waiting' : 'At extruders'}</Badge> },
  ];

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <section className="hero relative overflow-hidden px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <span className="size-12 rounded-xl grid place-items-center shrink-0 shadow-[inset_0_1px_0_rgb(255_255_255/.25)]" style={{ background: SITE_COLOR[site.id] }}><Factory className="size-6" /></span>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-white/55">{site.name} · stages {stageNo('extrude')} and {stageNo('dry')}</div>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] leading-tight">Extruders and drying racks</h1>
            <div className="text-[12.5px] text-white/60">{logged} of {extruders.length} logged · {fmtKg(Math.round(totalKg))} of string out · {racks.length} racks drying</div>
          </div>
        </div>
        <div className="flex-1 min-w-[240px] max-w-[460px]">
          <div className="flex items-center justify-between mb-2 text-[12.5px]"><span className="inline-flex items-center gap-1.5 font-medium"><span className="size-1.5 rounded-full bg-[var(--color-amber-400)] anim-live" />{kindLabel} shift in progress</span><span className="text-white/60 num">{hoursIn} h in · {win.span - hoursIn} h left</span></div>
          <TimeTrack progress={progress} startLabel={win.starts} endLabel={win.ends} nowLabel={`${NOW_LABEL} now`} onDark />
        </div>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <span className={cn('inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12.5px] font-medium whitespace-nowrap', notLogged || down ? 'bg-[rgb(240_160_75/.2)] text-[var(--color-amber-400)]' : 'bg-white/10 text-white/80')}><Activity className="size-3.5" />{notLogged || down ? `${notLogged} not logged${down ? ` · ${down} down` : ''}` : 'Every extruder logged'}</span>
          <Button variant="accent" icon={Plus} onClick={logNext} disabled={extruders.length === 0} hotkey={openId ? undefined : 'n'} hotkeyLabel="Log string output">Log string output</Button>
        </div>
      </section>
      <FlowStrip current={['extrude', 'dry']} />

      <KpiStrip className="md:max-xl:grid-cols-2!">
        <Stat label="String out this shift" icon={Spool} accent="var(--series-1)" value={<><CountUp value={Math.round(totalKg)} /><span className="t-base text-[var(--text-3)] font-medium"> kg</span></>} spark={stringByDay.slice(0, -1)} sub={`${fmtKg(stringByDay[stringByDay.length - 1])} today across ${extruders.length} extruders`} />
        <Stat label="Extruders logged" icon={Activity} accent="var(--series-7)" tone={logged < extruders.length ? 'warn' : 'neutral'} value={<>{logged}<span className="text-[var(--text-3)] font-medium">/{extruders.length}</span></>} spark={pastDowntime} sparkColor="var(--series-7)" sub={`${notLogged} not logged · ${down} down · ${downtime} min downtime`} />
        <Stat label="Racks waiting for weaving" icon={Layers} accent="var(--series-4)" value={<CountUp value={racks.length} />} spark={pastRackKg} sub={`${fmtKg(Math.round(rackKg))} of string, counted as WIP`} />
        <Stat label="Mixer batches waiting" icon={FlaskConical} accent="var(--series-3)" value={<CountUp value={waitingBatches.length} />} spark={pastBatches} sub={waitingBatches.length ? `${fmtKg(waitingBatches.reduce((t, b) => t + b.qtyKg, 0))} ready to feed` : `All ${batches.length} of today's batches are in`} />
      </KpiStrip>

      <div className="grid gap-[var(--gap)] items-start min-[1240px]:grid-cols-[minmax(0,1fr)_400px]">
        <Panel icon={Factory} title="Extruders" sub={`${extruders.length} machines · ${kindLabel.toLowerCase()} shift`} pad={false}
          actions={<Tabs value={view} onChange={setView} tabs={[{ value: 'map', label: 'Map' }, { value: 'table', label: 'Table' }]} />}
          footer={<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1"><Legend items={[{ label: 'Logged', color: 'var(--ok)' }, { label: 'Not logged', color: 'var(--warn)' }, { label: 'Down', color: 'var(--bad)' }]} /><span className="touch:hidden">Arrow keys move between extruders, Enter opens one.</span></div>}>
          {extruders.length === 0 ? <div className="p-[var(--pad)]"><SetupHint icon={Factory} what="extruders registered for this site" where="Machines" /></div> : view === 'map'
            ? <div ref={rove.ref} onKeyDown={rove.onKeyDown} role="group" aria-label="Extruders" className="p-[var(--pad)] grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(96px,1fr))] sm:[grid-template-columns:repeat(auto-fill,minmax(124px,1fr))]">{tiles.map((t, i) => <ExtruderCell key={t.machine.id} t={t} max={maxKg} tabIndex={rove.tabIndex(i)} selected={openId === t.machine.id} onFocus={() => rove.setActive(i)} onOpen={() => open(t.machine.id)} />)}</div>
            : <DataGrid bare dense rows={tiles} columns={machineCols} rowKey={(t) => t.machine.id} selectedKey={openId} onRowClick={(t) => open(t.machine.id)} maxHeight={420} />}
        </Panel>

        <Panel icon={Layers} title="Drying racks" sub="waiting for weaving" pad={false} actions={<Badge tone="accent" dot>WIP, now countable</Badge>}
          footer="A loom operator presses Consume rack when they take one. The oldest rack of that colour leaves WIP and its kilos move to the loom.">
          {rackRows.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={Layers} title="No racks waiting" hint="Racks appear here when an extruder prints a rack label." /></div> : <>
            <div className="p-[var(--pad)] border-b border-[var(--line)]">
              <div className="flex items-end justify-between gap-3 mb-2.5"><Figure label="String in work in progress" value={<>{fmtNum(Math.round(rackKg))}<span className="t-sm font-normal text-[var(--text-3)]"> kg</span></>} /><span className="t-sm text-[var(--text-3)] num pb-0.5">{racks.length} racks · {rackRows.length} colours</span></div>
              <StackedBar legend={false} height={8} format={(n) => fmtKg(Math.round(n))} segments={rackRows.map((r) => ({ label: r.colour, value: r.kg, color: colours.hex[r.colour] ?? 'var(--text-4)' }))} />
            </div>
            <DataGrid bare dense rows={rackRows} columns={rackCols} rowKey={(r) => r.colour} />
          </>}
        </Panel>
      </div>

      <div className="grid gap-[var(--gap)] min-[1240px]:grid-cols-2 items-start">
        <Panel icon={BarChart3} title="String out per day" sub="kg · last 7 working days">
          <ColumnChart height={190} data={days.map((d, i) => ({ label: fmtDayShort(d), values: [stringByDay[i]], partial: d === today }))} />
          <div className="t-xs text-[var(--text-3)] mt-1">Today is drawn lighter because the shift is still running.</div>
        </Panel>
        <Panel icon={FlaskConical} title="Batches from the mixer" sub="today · waiting first" pad={false}>
          <DataGrid bare dense rows={batches} columns={batchCols} rowKey={(l) => l.id} maxHeight={236} empty={<Empty icon={FlaskConical} title="No batch labelled today" hint="The mixer prints one sticker per batch." />} />
        </Panel>
      </div>

      {openId && extruders.length > 0 && <ExtruderSheet key={openId} machineId={openId} extruders={extruders} batches={batches} onClose={close} />}
    </div>
  );
}

function ExtruderSheet({ machineId: initial, extruders, batches, onClose }: { machineId: string; extruders: Machine[]; batches: Label[]; onClose: () => void }) {
  const s = useStore(); const { today, site, kindLabel, shift } = useShift(); const touch = useIsTouch(); const colours = useColours();
  const entryOf = (id: string) => s.production.find((p) => p.shiftId === shift && p.machineId === id && p.stageCode === 'extrude');
  const [machineId, setMachineId] = useState(initial);
  const machine = extruders.find((m) => m.id === machineId) ?? extruders[0]; const existing = entryOf(machine.id);
  const [operator, setOperator] = useState<string | null>(existing?.operatorId ?? null); const [batchId, setBatchId] = useState<string | null>(null);
  const [kg, setKg] = useState(''); const [rack, setRack] = useState(true); const [colour, setColour] = useState<string | null>(null);
  const [printed, setPrinted] = useState<Label | null>(null); const [printing, setPrinting] = useState(false);
  /** Where the cursor starts: on the operator when nobody is set yet, otherwise straight on the kilos. */
  const [startOnOperator] = useState(!existing?.operatorId);
  const batch = batches.find((b) => b.id === batchId); const outKg = parseFloat(kg || '0') || 0; const rackColour = batch?.colour ?? colour;
  const ready = outKg > 0 && !!operator && (!rack || !!rackColour) && !printing;
  const missing = [operator ? null : 'operator', outKg > 0 ? null : 'kilos', !rack || rackColour ? null : 'rack colour'].filter(Boolean);
  const pickMachine = (id: string | null) => { if (!id) return; setMachineId(id); setOperator(entryOf(id)?.operatorId ?? null); };

  const save = async () => {
    if (!ready || !operator) return;
    addProduction({ siteId: site.id, stageCode: 'extrude', machineId: machine.id, shiftId: shift, day: today, operatorId: operator, inputKg: batch && batch.status === 'in_stock' ? batch.qtyKg : outKg, outputKg: outKg });
    if (batch && batch.status === 'in_stock') s.consumeLabel(batch.id);
    if (rack && rackColour) {
      const label = s.createLabel({ siteId: site.id, kind: 'rack', stageCode: 'dry', machineId: machine.id, operatorId: operator, shiftId: shift, day: today, qtyUnits: 1, qtyKg: outKg, colour: rackColour, parentIds: batch ? [batch.id] : [] });
      setPrinted(label); setPrinting(true); await printer.print({ code: label.code, lines: [`RACK ${rackColour}`, `${outKg} kg`] }); setPrinting(false);
      useStore.getState().toast({ kind: 'ok', title: `${machine.code}: ${fmtKg(outKg)} logged, rack label printed`, detail: `${rackColour} rack ${label.code} now waiting for weaving` });
    } else {
      useStore.getState().toast({ kind: 'ok', title: `${machine.code}: ${fmtKg(outKg)} logged`, detail: `${kindLabel} shift total ${fmtKg((existing?.outputKg ?? 0) + outKg)}` });
      onClose();
    }
  };

  return (
    <Sheet open onClose={onClose} title={`${machine.code} · ${kindLabel.toLowerCase()} shift`} sub={printed ? 'Rack label' : 'String output and rack label'} width={480}
      footer={printed
        ? <Button variant="primary" icon={Check} onClick={onClose} disabled={printing} hotkey="mod+enter" hotkeyLabel="Close the rack label">Done</Button>
        : <><span className="mr-auto min-w-0 t-xs leading-tight text-[var(--text-3)]">{missing.length ? `Still needed: ${missing.join(', ')}` : rack ? `Prints a ${rackColour} rack label` : 'Logs the kilos only'}</span><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={rack ? Printer : Check} disabled={!ready} onClick={save} hotkey="mod+enter" hotkeyLabel="Log the string output">{rack ? `Log ${fmtNum(outKg)} kg and print` : `Log ${fmtNum(outKg)} kg`}</Button></>}>
      {printed ? (
        <div className="py-1">
          <StickerStage caption="Hang the sticker on the rack. It is counted as WIP until a loom consumes it."><Sticker label={printed} machine={machine} operator={s.people.find((p) => p.id === printed.operatorId)} site={site} shiftKind={kindLabel} printing={printing} /></StickerStage>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5" onKeyDownCapture={onModEnter(save)}>
          <div tabIndex={-1} data-autofocus={touch ? '' : undefined} className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 grid grid-cols-3 gap-3 outline-none">
            <Figure label="Logged this shift" value={<>{fmtNum(existing?.outputKg ?? 0)}<span className="t-sm font-normal text-[var(--text-3)]"> kg</span></>} />
            <Figure label="This entry" value={<>+ {fmtNum(outKg)}<span className="t-sm font-normal text-[var(--text-3)]"> kg</span></>} />
            <Figure label="Shift total after" value={<>{fmtNum(Math.round(((existing?.outputKg ?? 0) + outKg) * 10) / 10)}<span className="t-sm font-normal text-[var(--text-3)]"> kg</span></>} />
          </div>
          <FieldBlock label="Extruder">
            <Combobox options={extruders.map((m) => { const e = entryOf(m.id); return { value: m.id, label: m.code, sub: m.status === 'down' ? 'down' : e ? `${fmtKg(e.outputKg)} so far` : 'not logged yet', left: <Status tone={m.status === 'down' ? 'bad' : e ? 'ok' : 'warn'}>{''}</Status> }; })} value={machine.id} onChange={pickMachine} />
          </FieldBlock>
          <FieldBlock label="Operator"><TabThrough><PersonPicker siteId={site.id} sector={sectorForStage(site, 'extrude')} value={operator} onChange={(id) => setOperator(id)} autoFocus={!touch && startOnOperator} /></TabThrough></FieldBlock>
          <FieldBlock label="Input batch" hint={batches.length ? 'Today’s mixer batches, waiting ones first. Optional.' : 'No batch labelled today; the mixer prints one per batch.'}>
            <Combobox clearable placeholder="No batch selected" emptyText="No batch labelled today" value={batchId} onChange={setBatchId}
              options={batches.map((b) => ({ value: b.id, label: `${b.colour ?? 'Batch'} · ${b.code}`, sub: `${fmtKg(b.qtyKg)} · ${b.status === 'in_stock' ? 'waiting' : 'already at the extruders'}`, left: <ColourDot colour={b.colour} />, words: b.code }))} />
          </FieldBlock>
          <NumberPad value={kg} onChange={setKg} allowDecimal suffix="kg" label="String output" max={99999} autoFocus={!touch && !startOnOperator} />
          <FieldBlock label="Rack label" hint="A sticker on the drying rack is what makes it count as WIP.">
            <ChipGroup ariaLabel="Rack label" options={[{ value: 'yes', label: 'Print a rack label' }, { value: 'no', label: 'Log the kilos only' }]} value={rack ? 'yes' : 'no'} onChange={(v) => setRack(v === 'yes')} />
          </FieldBlock>
          {rack && (batch
            ? <FieldBlock label="Rack colour"><div className="ctl inline-flex items-center gap-1.5 t-base"><ColourDot colour={batch.colour} />{batch.colour}<span className="t-sm text-[var(--text-3)]">· taken from the batch</span></div></FieldBlock>
            : <FieldBlock label="Rack colour" hint="Pick a batch above or choose the colour directly.">{colours.names.length === 0 ? <SetupHint inline what="colours" /> : <ChipGroup ariaLabel="Rack colour" options={colours.names.map(colourChip)} value={colour} onChange={setColour} />}</FieldBlock>)}
        </div>
      )}
    </Sheet>
  );
}
