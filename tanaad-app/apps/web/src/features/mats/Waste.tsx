import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ClipboardList, History, LineChart as LineChartIcon, Recycle, Scissors, Tag, Warehouse } from 'lucide-react';
import type { Label } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { dailySeries, lastWorkingDays, massBalanceDay } from '@/data/selectors';
import { Badge, ChipGroup, DataGrid, Empty, FormRow, Kbd, KpiStrip, PageHeader, Panel, Select, Stat, cn, useHotkey, type Column } from '@/components/ui';
import { CountUp, Delta, LineChart } from '@/components/charts';
import { ScaleWidget } from '@/components/ScaleWidget';
import { Sticker } from '@/components/Sticker';
import { printer } from '@/devices';
import { fmtDayShort, fmtKg, fmtNum } from '@/data/format';
import { useRefList } from '@/app/hooks';
import { SetupHint } from '../production/parts';
import { addProduction, focusFirstField, pressScale, ScaleFrame, useShift } from './kit';

const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
type Flow = 'trim' | 'pellet';

/** What the last weighing produced: the sticker rolling out, and where the sack goes next. */
function Labelled({ label, printing, title, detail, next, children }: { label: Label | null; printing: boolean; title: string; detail?: string; next: string; children?: (l: Label) => ReactNode }) {
  if (!label) return <div className="rounded-md border border-dashed border-[var(--line-2)] px-3 py-2.5 t-sm text-[var(--text-3)] flex items-center gap-2"><Tag className="size-4 shrink-0" />The sack sticker prints here as soon as a reading is used.</div>;
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-3 flex flex-wrap items-center gap-4 anim-pop">
      {children?.(label)}
      <div className="min-w-0 flex-1 t-sm text-[var(--text-2)]">
        <div className="t-base font-semibold text-[var(--text)] flex items-center gap-1.5"><Check className="size-4 text-[var(--ok)]" />{printing ? 'Printing the sticker' : title}</div>
        <div className="code mt-0.5">{label.code}</div>
        {detail && <div className="num">{detail}</div>}
        <div className="t-xs text-[var(--text-3)] mt-1">{next}</div>
      </div>
    </div>
  );
}

/** M5 · The waste loop: trim and faulty string weighed in, crusher output weighed out. Waste becomes a measured number, read against its own recent average. */
export function Waste() {
  const s = useStore(); const { today, site, kindLabel, shift } = useShift();
  // What can be in a sack comes from Settings → Master data; where a sack can go is the site's own zones.
  const wasteSources = useRefList('waste_source'); const zones = useMemo(() => s.zones.filter((z) => z.siteId === site.id), [s.zones, site.id]);
  const pellet = s.products.find((p) => p.siteId === site.id && p.kind === 'pellet' && p.active !== false); const crusher = s.machines.find((m) => m.siteId === site.id && m.kind === 'crusher' && m.status !== 'retired');
  const sacks = useMemo(() => s.labels.filter((l) => l.siteId === site.id && l.kind === 'sack'), [s.labels, site.id]);
  /** The zone waste sacks are kept in: wherever most of them already are. */
  const homeZone = useMemo(() => { const n = new Map<string, number>(); for (const l of sacks) if (l.zoneId) n.set(l.zoneId, (n.get(l.zoneId) ?? 0) + 1); return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? zones[0]?.id ?? ''; }, [sacks, zones]);
  const [sourcePick, setSource] = useState<string | null>(null); const [destPick, setDest] = useState<string | null>(null);
  const source = wasteSources.find((x) => x.label === sourcePick)?.label ?? wasteSources[0]?.label ?? ''; const dest = zones.find((z) => z.id === destPick)?.id ?? homeZone;
  const [trimTarget, setTrimTarget] = useState(() => rnd(40, 90)); const [pelletTarget, setPelletTarget] = useState(() => rnd(50, 110));
  const [trimRound, setTrimRound] = useState(0); const [pelletRound, setPelletRound] = useState(0);
  const [lastTrim, setLastTrim] = useState<Label | null>(null); const [lastPellet, setLastPellet] = useState<Label | null>(null); const [printing, setPrinting] = useState<Flow | null>(null);
  const [sources, setSources] = useState<Record<string, string>>({});
  /** The side the keyboard is working on: Ctrl+Enter reads that scale, then uses the reading. */
  const [active, setActive] = useState<Flow>('trim');
  const trimBox = useRef<HTMLDivElement>(null); const pelletBox = useRef<HTMLDivElement>(null); const trimScale = useRef<HTMLDivElement>(null); const pelletScale = useRef<HTMLDivElement>(null);

  const mb = massBalanceDay(s, site.id, today); const wastePct = mb.kgIn ? (mb.wasteKg / mb.kgIn) * 100 : 0;
  const series = dailySeries(s, site.id, lastWorkingDays(site.id, today, 7));
  // The yardstick is the site's own record: the average waste share of the earlier days in the window.
  const earlier = series.slice(0, -1).filter((d) => d.kgIn > 0); const avgPct = earlier.length ? Math.round((earlier.reduce((t, d) => t + d.wastePct, 0) / earlier.length) * 10) / 10 : undefined;
  const rawSacks = sacks.filter((l) => l.status === 'in_stock' && l.zoneId === homeZone);
  const trimSacks = rawSacks.filter((l) => !l.productId); const pelletSacks = rawSacks.filter((l) => !!l.productId);
  const todaysSacks = sacks.filter((l) => l.day === today).reverse();
  const todaysTrim = todaysSacks.filter((l) => !l.productId); const todaysPellet = todaysSacks.filter((l) => !!l.productId);
  const trimKg = todaysTrim.reduce((t, l) => t + l.qtyKg, 0); const pelletKg = todaysPellet.reduce((t, l) => t + l.qtyKg, 0);
  const zoneName = (id?: string) => s.zones.find((z) => z.id === id)?.name ?? '—';

  const weighTrim = async (kg: number) => {
    if (!source) return;
    const label = s.createLabel({ siteId: site.id, kind: 'sack', stageCode: 'store', shiftId: shift, day: today, qtyUnits: 1, qtyKg: kg, grade: source, zoneId: homeZone || undefined, parentIds: [] });
    setSources((m) => ({ ...m, [label.id]: source })); setLastTrim(label); setPrinting('trim');
    await printer.print({ code: label.code, lines: [source, `${kg} kg`] }); setPrinting(null);
    useStore.getState().toast({ kind: 'ok', title: `${source} sack weighed: ${fmtKg(kg)}`, detail: `${label.code} · waiting for the crusher` });
    setTrimTarget(rnd(40, 90)); setTrimRound((r) => r + 1);
  };
  const weighPellet = async (kg: number) => {
    if (!pellet || !crusher) return;
    const label = s.createLabel({ siteId: site.id, kind: 'sack', productId: pellet.id, stageCode: 'store', machineId: crusher.id, shiftId: shift, day: today, qtyUnits: 1, qtyKg: kg, zoneId: dest || undefined, grade: pellet.internalName, parentIds: [] });
    addProduction({ siteId: site.id, stageCode: 'store', machineId: crusher.id, shiftId: shift, day: today, productId: pellet.id, goodUnits: 1, inputKg: kg, outputKg: kg });
    setLastPellet(label); setPrinting('pellet');
    await printer.print({ code: label.code, lines: [pellet.internalName.toUpperCase(), `${kg} kg`] }); setPrinting(null);
    useStore.getState().toast({ kind: 'ok', title: `Crusher output ${fmtKg(kg)} labelled`, detail: `${pellet.internalName} · to ${zoneName(dest)}` });
    setPelletTarget(rnd(50, 110)); setPelletRound((r) => r + 1);
  };

  const work = (f: Flow) => { setActive(f); focusFirstField((f === 'trim' ? trimBox : pelletBox).current); };
  useHotkey('t', () => work('trim'), { label: 'Work on trim in' });
  useHotkey('c', () => work('pellet'), { label: 'Work on crusher output' });
  useHotkey('mod+enter', () => { pressScale((active === 'trim' ? trimScale : pelletScale).current); }, { label: 'Read the scale, then use the reading', allowInInput: true });

  const hint = (f: Flow) => (
    <span className="touch:hidden inline-flex items-center gap-1.5">{active === f
      ? <><Kbd keys="mod+enter" />reads the scale; press again to use the reading</>
      : <><Kbd keys={f === 'trim' ? 't' : 'c'} />to work on this side</>}</span>
  );
  const flowHead = (f: Flow, n: number) => <>{active === f && <Badge tone="accent" dot className="touch:hidden">Keyboard here</Badge>}<Badge tone="neutral">{n} today</Badge></>;

  const sackCols: Column<Label>[] = [
    { key: 'code', header: 'Sticker', sort: (l) => l.code, cell: (l) => <span className="code font-medium">{l.code}</span> },
    { key: 'kind', header: 'Sack', sort: (l) => (l.productId ? 1 : 0), cell: (l) => <span className="inline-flex items-center gap-1.5">{l.productId ? <Recycle className="size-3.5 text-[var(--text-3)]" /> : <Scissors className="size-3.5 text-[var(--text-3)]" />}{l.productId ? 'Crusher output' : 'Trim in'}</span> },
    { key: 'what', header: 'Contents', truncate: 180, cell: (l) => <span className="text-[var(--text-2)]">{l.productId ? s.products.find((p) => p.id === l.productId)?.internalName ?? '—' : sources[l.id] ?? l.grade ?? 'Trim'}</span> },
    { key: 'zone', header: 'Goes to', truncate: 160, cell: (l) => <span className="text-[var(--text-2)]">{l.productId ? zoneName(l.zoneId) : `${zoneName(l.zoneId)}, then the crusher`}</span> },
    { key: 'kg', header: 'Kg', align: 'right', mono: true, sort: (l) => l.qtyKg, cell: (l) => <span className="font-medium">{fmtNum(l.qtyKg)}</span> },
  ];

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <div className="-mb-[var(--gap)]">
        <PageHeader eyebrow={`${site.name} · Waste`} title="Waste loop" meta={<><Badge tone="neutral">{kindLabel} shift</Badge><Badge tone={mb.state === 'balanced' ? 'ok' : mb.state === 'explainable' ? 'warn' : 'bad'} dot>{mb.state === 'balanced' ? 'Mass balance balanced' : mb.state === 'explainable' ? 'Mass balance within allowed loss' : `Mass balance: ${fmtKg(Math.round(mb.gapKg))} unaccounted`}</Badge></>}
          subtitle="Weigh trim in, weigh pellet out. Waste stops being an estimate." />
      </div>

      <KpiStrip>
        <Stat label="Waste today, measured" icon={Recycle} accent="var(--series-4)" value={<><CountUp value={wastePct} format={(n) => n.toFixed(1)} /><span className="text-[var(--text-3)] font-medium">%</span></>} delta={avgPct !== undefined ? <Delta value={wastePct - avgPct} suffix=" pt" goodWhen="down" label="against the average of the earlier days" /> : undefined} sub={`${fmtKg(mb.wasteKg)} of ${fmtKg(mb.kgIn)} in`} />
        <Stat label="Average of earlier days" icon={History} accent="var(--series-8)" value={avgPct !== undefined ? <>{avgPct.toFixed(1)}<span className="text-[var(--text-3)] font-medium">%</span></> : '—'} spark={earlier.map((d) => d.wastePct)} sparkColor="var(--series-8)" sub={earlier.length ? `measured over ${earlier.length} working days` : 'no earlier days measured yet'} />
        <Stat label="Trim weighed in today" icon={Scissors} accent="var(--series-2)" value={<><CountUp value={Math.round(trimKg)} /><span className="t-base text-[var(--text-3)] font-medium"> kg</span></>} sub={`${todaysTrim.length} sack${todaysTrim.length === 1 ? '' : 's'} · ${trimSacks.length} at the crusher queue`} />
        <Stat label="Crusher output today" icon={Recycle} accent="var(--series-3)" value={<><CountUp value={Math.round(pelletKg)} /><span className="t-base text-[var(--text-3)] font-medium"> kg</span></>} sub={`${todaysPellet.length} pellet sack${todaysPellet.length === 1 ? '' : 's'} labelled`} />
        <Stat label={`Sacks in ${zoneName(homeZone)}`} icon={Warehouse} accent="var(--series-1)" value={<CountUp value={rawSacks.length} />} sub={`${trimSacks.length} trim · ${fmtKg(trimSacks.reduce((t, l) => t + l.qtyKg, 0))} · ${pelletSacks.length} pellet · ${fmtKg(pelletSacks.reduce((t, l) => t + l.qtyKg, 0))}`} />
      </KpiStrip>

      <div className="grid gap-[var(--gap)] min-[1240px]:grid-cols-2 items-start">
        <Panel icon={Scissors} title="1 · Weigh trim in" sub="trim and faulty string" actions={flowHead('trim', todaysTrim.length)} className={cn(active === 'trim' && 'compact:[&>header]:border-[var(--accent)]')}
          footer={<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">{hint('trim')}<span className="num ml-auto">{fmtKg(trimKg)} in {todaysTrim.length} sack{todaysTrim.length === 1 ? '' : 's'} today</span></div>}>
          <div ref={trimBox} onFocusCapture={() => setActive('trim')} onPointerDownCapture={() => setActive('trim')} className="flex flex-col gap-3">
            <FormRow label="What is in the sack">{wasteSources.length === 0 ? <SetupHint inline what="waste sources" /> : <ChipGroup ariaLabel="What is in the sack" options={wasteSources.map((x) => ({ value: x.label, label: x.label }))} value={source} onChange={setSource} />}</FormRow>
            <ScaleFrame ref={trimScale}><ScaleWidget key={trimRound} title="Trim scale" targetKg={trimTarget} onReading={weighTrim} disabled={printing !== null || !source} /></ScaleFrame>
            <Labelled label={lastTrim} printing={printing === 'trim'} title="Sack labelled" detail={lastTrim ? `${sources[lastTrim.id] ?? 'Trim'} · ${fmtKg(lastTrim.qtyKg)}` : undefined} next={`Goes to ${zoneName(homeZone)} until the crusher takes it.`}>
              {(l) => <Sticker key={l.id} label={l} site={site} shiftKind={kindLabel} compact printing={printing === 'trim'} />}
            </Labelled>
          </div>
        </Panel>

        <Panel icon={Recycle} title="2 · Weigh crusher output" sub={pellet?.internalName.toLowerCase() ?? 'pellet'} actions={flowHead('pellet', todaysPellet.length)} className={cn(active === 'pellet' && 'compact:[&>header]:border-[var(--accent)]')}
          footer={<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">{hint('pellet')}<span className="num ml-auto">{fmtKg(pelletKg)} in {todaysPellet.length} sack{todaysPellet.length === 1 ? '' : 's'} today</span></div>}>
          <div ref={pelletBox} onFocusCapture={() => setActive('pellet')} onPointerDownCapture={() => setActive('pellet')} className="flex flex-col gap-3">
            <FormRow label="Where the pellet goes">{zones.length === 0 ? <SetupHint inline what="store zones" where="Zones" /> : zones.length <= 6 ? <ChipGroup ariaLabel="Where the pellet goes" options={zones.map((z) => ({ value: z.id, label: z.name }))} value={dest} onChange={setDest} /> : <Select aria-label="Where the pellet goes" value={dest} onChange={(e) => setDest(e.target.value)}>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</Select>}</FormRow>
            {(!pellet || !crusher) && <SetupHint inline what={!pellet ? 'pellet product for this site' : 'crusher registered for this site'} where={!pellet ? 'Products' : 'Machines'} />}
            <ScaleFrame ref={pelletScale}><ScaleWidget key={pelletRound} title="Crusher scale" targetKg={pelletTarget} onReading={weighPellet} disabled={printing !== null || !pellet || !crusher} /></ScaleFrame>
            <Labelled label={lastPellet} printing={printing === 'pellet'} title="Pellet sack labelled" detail={lastPellet ? `${fmtKg(lastPellet.qtyKg)} · ${zoneName(lastPellet.zoneId)}` : undefined} next="Counted as waste recovered in today's mass balance.">
              {(l) => <Sticker key={l.id} label={l} product={pellet} machine={crusher} site={site} shiftKind={kindLabel} compact printing={printing === 'pellet'} />}
            </Labelled>
          </div>
        </Panel>
      </div>

      <div className="grid gap-[var(--gap)] min-[1240px]:grid-cols-2 items-start">
        <Panel icon={LineChartIcon} title="Waste share per day" sub="% of mixer kg in · last 7 working days"
          footer={<>Waste = crusher output ÷ mixer kg in. Today {fmtNum(mb.wasteKg)} of {fmtNum(mb.kgIn)} kg{avgPct !== undefined ? <>, against an average of <span className="num">{avgPct.toFixed(1)}%</span> over the earlier days</> : null}.</>}>
          <LineChart height={200} labels={series.map((d) => fmtDayShort(d.day))} partialLast format={(n) => `${Math.round(n * 10) / 10}%`} series={[{ name: 'Waste share, measured', color: 'var(--series-4)', data: series.map((d) => d.wastePct), area: true }]} target={avgPct !== undefined ? { value: avgPct, label: 'Average of earlier days' } : undefined} />
        </Panel>
        <Panel icon={ClipboardList} title="Today's sacks" sub="trim in and crusher output" pad={false}>
          <DataGrid bare dense rows={todaysSacks} columns={sackCols} rowKey={(l) => l.id} maxHeight={268}
            empty={<Empty icon={Recycle} title="No sack weighed yet today" hint="Each trim sack and each crusher sack gets a sticker and feeds the waste figure." />}
            footer={todaysSacks.length ? <tr><td colSpan={4}>{todaysTrim.length} trim in · {todaysPellet.length} crusher output</td><td className="num text-right">{fmtNum(Math.round(trimKg + pelletKg))}</td></tr> : undefined} />
        </Panel>
      </div>
    </div>
  );
}
