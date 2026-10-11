import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Check, Factory, History, PackageOpen } from 'lucide-react';
import type { Machine } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useRefList } from '@/app/hooks';
import { dailySeries, lastWorkingDays, machinesOf } from '@/data/selectors';
import { Badge, Button, ChipGroup, DataGrid, Empty, FormRow, Note, NumberPad, PageHeader, Panel, Stat, type Column } from '@/components/ui';
import { ColumnChart, CountUp } from '@/components/charts';
import { fmtDayShort, fmtKg, fmtNum, fmtTime } from '@/data/format';
import { addProduction, BarCell, Calc, dash, SettingsEmpty, shortCode, Step, useFirstField, useShift, WIDE, Workbench } from './kit';

interface Issue { id: string; machineId: string; material: string; bags: number; bagKg: number; kg: number; at: string }
interface Row { machine: Machine; bags: number; kg: number; filmKg: number; materials: string }

/** B1 · Resin and masterbatch issued per extruder per shift. Bags are counted, kilos are computed, nothing else is typed. */
export function RawIssue() {
  const s = useStore(); const { today, site, kindLabel, shift } = useShift();
  const extruders = machinesOf(s, 'bags', 'extrude');
  const materials = useRefList('material');
  const [machineId, setMachineId] = useState<string | null>(null); const [materialId, setMaterialId] = useState<string | null>(null); const [bags, setBags] = useState('');
  useEffect(() => { if (!materials.some((m) => m.id === materialId)) setMaterialId(materials[0]?.id ?? null); }, [materials, materialId]);
  const mat = materials.find((m) => m.id === materialId); const material = mat?.label ?? ''; const bagKg = mat?.value ?? 0; const anyExample = materials.some((m) => m.example);
  const [log, setLog] = useState<Issue[]>([]);
  const [formRef, focusFirst] = useFirstField<HTMLDivElement>();
  const nBags = parseInt(bags || '0', 10) || 0; const kg = Math.round(nBags * bagKg * 10) / 10; const machine = extruders.find((m) => m.id === machineId);
  const rows = useMemo<Row[]>(() => extruders.map((m) => {
    const e = s.production.find((p) => p.shiftId === shift && p.machineId === m.id && p.stageCode === 'raw'); const film = s.production.find((p) => p.shiftId === shift && p.machineId === m.id && p.stageCode === 'extrude');
    const mine = log.filter((l) => l.machineId === m.id);
    return { machine: m, bags: e?.goodUnits ?? 0, kg: e?.inputKg ?? 0, filmKg: film?.outputKg ?? 0, materials: [...new Set(mine.map((l) => l.material))].join(', ') };
  }), [extruders, s.production, shift, log]);
  const totalKg = rows.reduce((t, r) => t + r.kg, 0); const totalBags = rows.reduce((t, r) => t + r.bags, 0); const totalFilm = rows.reduce((t, r) => t + r.filmKg, 0);
  const served = rows.filter((r) => r.kg > 0); const maxKg = Math.max(1, ...rows.map((r) => Math.max(r.kg, r.filmKg)));
  const days = lastWorkingDays('bags', today, 7); const series = dailySeries(s, 'bags', days);
  const ready = !!machine && !!mat && bagKg > 0 && nBags > 0;
  const missing = [!machine && 'an extruder', !mat && 'a material', !!mat && bagKg <= 0 && 'the pack weight of this material', nBags <= 0 && 'the number of bags'].filter((x): x is string => !!x);

  const issue = () => {
    if (!ready || !machine) return;
    addProduction({ siteId: 'bags', stageCode: 'raw', machineId: machine.id, shiftId: shift, day: today, goodUnits: nBags, inputKg: kg, outputKg: kg });
    setLog((l) => [{ id: `${Date.now()}`, machineId: machine.id, material, bags: nBags, bagKg, kg, at: new Date().toISOString() }, ...l]);
    useStore.getState().toast({ kind: 'ok', title: `${nBags} bags ${material} issued to ${machine.code}`, detail: `${fmtKg(kg)} · ${kindLabel} shift` });
    setBags(''); focusFirst();
  };

  const cols: Column<Row>[] = [
    { key: 'm', header: 'Extruder', sort: (r) => r.machine.code, cell: (r) => <span className="inline-flex items-center gap-1.5 font-medium">{r.machine.code}{r.machine.status === 'down' && <Badge tone="bad" dot>Down</Badge>}</span> },
    { key: 'mat', header: 'Material', truncate: 120, cell: (r) => r.materials || dash },
    { key: 'b', header: 'Bags', align: 'right', mono: true, sort: (r) => r.bags, cell: (r) => (r.bags ? fmtNum(r.bags) : dash) },
    { key: 'kg', header: 'Issued kg', align: 'right', sort: (r) => r.kg, cell: (r) => (r.kg ? <BarCell value={r.kg} max={maxKg} display={fmtNum(r.kg)} width={52} /> : dash) },
    { key: 'f', header: 'Film out kg', align: 'right', mono: true, sort: (r) => r.filmKg, cell: (r) => (r.filmKg ? fmtNum(r.filmKg) : dash) },
  ];

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <div className="-mb-[var(--gap)]">
        <PageHeader eyebrow={`${site.name} · Raw material`} title="Raw material issue" meta={<Badge tone="neutral" dot>{fmtKg(totalKg)} issued this shift</Badge>}
          subtitle="Bags issued per extruder, by material. Bags are counted, kilos are computed; the kilos in start the mass balance." />
      </div>
      {site.toBeConfirmed && <Note tone="warn">{site.toBeConfirmed}{anyExample ? ' Materials marked “example” are placeholders until the store confirms them.' : ''}</Note>}

      <Workbench asideWidth={480} aside={<>
        <div className={`grid grid-cols-2 gap-[var(--gap)] ${WIDE}`}>
          <Stat label="Issued this shift" icon={PackageOpen} accent="var(--series-1)" value={<><CountUp value={totalKg} /><span className="t-base text-[var(--text-3)] font-medium"> kg</span></>} sub={`${fmtNum(totalBags)} bag${totalBags === 1 ? '' : 's'} counted`} />
          <Stat label="Extruders served" icon={Factory} accent="var(--series-7)" value={<>{served.length}<span className="text-[var(--text-3)] font-medium">/{extruders.length}</span></>} sub={served.length ? `Last: ${log[0] ? extruders.find((m) => m.id === log[0].machineId)?.code : served[served.length - 1].machine.code}` : 'None yet this shift'} />
        </div>
        <Panel className={WIDE} icon={Factory} title="Issued per extruder" sub={`${kindLabel} shift`} pad={false}
          footer={totalKg === 0 ? 'Nothing issued yet this shift. Select an extruder, count the bags, press Issue.' : `${fmtKg(totalKg)} issued against ${fmtKg(totalFilm)} of film weighed so far.`}>
          <DataGrid bare dense rows={rows} rowKey={(r) => r.machine.id} columns={cols} selectedKey={machineId}
            footer={<tr><td colSpan={2}>Total</td><td className="text-right num">{totalBags ? fmtNum(totalBags) : '—'}</td><td className="text-right num">{totalKg ? fmtNum(totalKg) : '—'}</td><td className="text-right num">{fmtNum(totalFilm)}</td></tr>} />
        </Panel>
        <Panel className={WIDE} icon={History} title="Recent issues" sub="on this device" pad={log.length === 0}>
          {log.length === 0 ? <Empty icon={History} title="No issue recorded here yet" hint="Each issue lands here with its time, extruder and material." /> : log.slice(0, 6).map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-[var(--pad)] row-h border-b border-[var(--line)] last:border-b-0">
              <span className="num t-sm text-[var(--text-3)] w-10 shrink-0">{fmtTime(l.at)}</span>
              <span className="min-w-0 flex-1 truncate"><span className="font-medium">{extruders.find((m) => m.id === l.machineId)?.code}</span><span className="text-[var(--text-3)]"> · {l.material}</span></span>
              <span className="num t-sm text-[var(--text-3)] whitespace-nowrap">{l.bags} × {fmtNum(l.bagKg)}</span>
              <span className="num font-medium whitespace-nowrap w-[64px] text-right">{fmtKg(l.kg)}</span>
            </div>
          ))}
        </Panel>
      </>}>
        <Panel icon={PackageOpen} title="Issue to an extruder" sub={`${kindLabel} shift · ${fmtDayShort(today)}`}
          footer={<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><span className="min-w-0 truncate">{ready ? <span className="text-[var(--text)]">{nBags} bags {material} to {machine?.code}</span> : `Still needed: ${missing.join(', ')}.`}</span><Button variant="primary" icon={Check} disabled={!ready} onClick={issue} hotkey="mod+enter" hotkeyLabel="Issue material">{ready ? `Issue ${fmtKg(kg)} to ${machine?.code}` : 'Issue'}</Button></div>}>
          <div ref={formRef}>
            <FormRow label={<Step n={1} done={!!machine}>Extruder</Step>}><ChipGroup ariaLabel="Extruder" options={extruders.map((m) => ({ value: m.id, label: shortCode(m.code, extruders), disabled: m.status === 'down' }))} value={machineId} onChange={setMachineId} columns={Math.min(8, Math.max(1, extruders.length))} /></FormRow>
            <FormRow label={<Step n={2} done={!!mat}>Material</Step>} hint={materials.length ? (mat && bagKg <= 0 ? 'This material has no pack weight. Set it in Settings → Master data.' : anyExample ? 'Names and pack weights come from Settings → Master data. Those marked “example” are still to be confirmed.' : 'Names and pack weights come from Settings → Master data.') : undefined}>
              {materials.length === 0 ? <SettingsEmpty what="materials" icon={PackageOpen} /> : <ChipGroup ariaLabel="Material" options={materials.map((m) => ({ value: m.id, label: <>{m.label}{m.value ? <span className="num font-normal opacity-70">{fmtNum(m.value)} kg</span> : null}</> }))} value={materialId} onChange={setMaterialId} />}
            </FormRow>
            <FormRow label={<Step n={3} done={nBags > 0}>Bags</Step>}><div className="max-w-[320px]"><NumberPad value={bags} onChange={setBags} suffix="bags" max={200} /></div></FormRow>
            <FormRow label="Kilos issued">
              <Calc terms={[{ label: 'Bags counted', value: fmtNum(nBags) }, { op: '×', label: mat ? `Per bag · ${mat.label}` : 'Per bag', value: bagKg ? fmtNum(bagKg) : '—', unit: 'kg' }, { op: '=', label: machine ? `Into ${machine.code}` : 'Kilos issued', value: fmtNum(kg), unit: 'kg', result: true }]} />
            </FormRow>
          </div>
        </Panel>
        <Panel icon={BarChart3} title="Material into extrusion" sub="kg per day · last 7 working days">
          <ColumnChart height={170} data={series.map((d) => ({ label: fmtDayShort(d.day), values: [d.kgIn], partial: d.partial }))} />
          <p className="t-xs text-[var(--text-3)] mt-1">Kilos fed to the extruders according to the shift entries. Today is drawn lighter: the shift is still running.</p>
        </Panel>
      </Workbench>
    </div>
  );
}
