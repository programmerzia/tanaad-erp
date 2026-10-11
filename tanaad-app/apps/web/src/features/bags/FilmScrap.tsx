import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeftRight, BarChart3, CheckCircle2, Factory, Printer, Recycle, Scale, Tag, Truck, Warehouse } from 'lucide-react';
import type { Label } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useRefList } from '@/app/hooks';
import { SITES } from '@/config/sites';
import { lastWorkingDays } from '@/data/selectors';
import { Badge, Button, ChipGroup, DataGrid, FormRow, KpiStrip, Note, PageHeader, Panel, StackedBar, Stat, type Column } from '@/components/ui';
import { ColumnChart, CountUp } from '@/components/charts';
import { ScaleWidget } from '@/components/ScaleWidget';
import { Sticker } from '@/components/Sticker';
import { printer } from '@/devices';
import { fmtDayShort, fmtKg, fmtNum } from '@/data/format';
import { ScaleBay, SettingsEmpty, Step, useFirstField, useScaleKey, useScaleTitle, useShift, Workbench } from './kit';

type Dest = 'onsite' | 'recycling';
const PLANT = SITES.recycling.name;
const DESTS: { value: Dest; label: ReactNode }[] = [{ value: 'onsite', label: <><Factory className="size-4" />Re-pelletise on site</> }, { value: 'recycling', label: <><Truck className="size-4" />Send to {PLANT}</> }];
/** Demo scale only: a plausible sack weight for the simulated reading. A real scale reports what is on it. */
const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

/** B4 · Film scrap sacks: exactly what they already do, weighed and labelled. A sack to the recycling plant is a transfer with a destination site. */
export function FilmScrap() {
  const s = useStore(); const { today, site, kindLabel, shift } = useShift();
  const sources = useRefList('waste_source'); const [sourceId, setSourceId] = useState<string | null>(null);
  useEffect(() => { if (!sources.some((x) => x.id === sourceId)) setSourceId(sources[0]?.id ?? null); }, [sources, sourceId]);
  const source = sources.find((x) => x.id === sourceId)?.label;
  const [dest, setDest] = useState<Dest>('onsite'); const [target, setTarget] = useState(() => rnd(20, 45)); const [round, setRound] = useState(0); const [kg, setKg] = useState<number | null>(null);
  const [last, setLast] = useState<Label | null>(null); const [printing, setPrinting] = useState(false); const [sent, setSent] = useState<Record<string, true>>({});
  const [formRef, focusFirst] = useFirstField<HTMLDivElement>(); const scaleRef = useRef<HTMLDivElement>(null);
  useScaleKey(scaleRef); const scaleTitle = useScaleTitle('Scrap scale');

  const sacks = useMemo(() => s.labels.filter((l) => l.siteId === 'bags' && l.kind === 'sack' && !l.productId), [s.labels]);
  const todays = sacks.filter((l) => l.day === today).reverse(); const todayKg = todays.reduce((t, l) => t + l.qtyKg, 0);
  const weekDays = lastWorkingDays('bags', today, 6); const week = sacks.filter((l) => weekDays.includes(l.day)); const weekKg = week.reduce((t, l) => t + l.qtyKg, 0);
  const trend = weekDays.map((d) => ({ day: d, kg: sacks.filter((l) => l.day === d).reduce((t, l) => t + l.qtyKg, 0) }));
  const moves = s.events.filter((e) => e.type === 'StockMoved' && e.siteId === 'bags' && (e.payload as { toSiteId?: string }).toSiteId === 'recycling');
  const transfers = moves.length; const transferKg = moves.reduce((t, e) => t + ((e.payload as { qtyKg?: number }).qtyKg ?? 0), 0);
  const inStore = sacks.filter((l) => l.status === 'in_stock');
  const preview: Label = useMemo(() => ({ id: 'preview', code: 'BAG-SAC-······', siteId: 'bags', kind: 'sack', stageCode: 'store', shiftId: shift, day: today, qtyUnits: 1, qtyKg: kg ?? 0, grade: source, status: 'created', zoneId: 'z_bags_raw', parentIds: [] }), [shift, today, kg, source]);
  const ready = !!kg && kg > 0 && !!source && !printing;

  const weigh = async () => {
    if (!ready || !kg || !source) return;
    const label = s.createLabel({ siteId: 'bags', kind: 'sack', stageCode: 'store', shiftId: shift, day: today, qtyUnits: 1, qtyKg: kg, grade: source, zoneId: 'z_bags_raw', parentIds: [] });
    if (dest === 'recycling') { s.moveStock({ siteId: 'bags', kind: 'transfer', labelId: label.id, fromZoneId: 'z_bags_raw', toSiteId: 'recycling', qtyUnits: 1, qtyKg: kg, reason: `${source} to ${PLANT}` }); setSent((m) => ({ ...m, [label.id]: true })); }
    setLast(label); setPrinting(true); await printer.print({ code: label.code, lines: [source.toUpperCase(), `${kg} kg`] }); setPrinting(false);
    useStore.getState().toast({ kind: 'ok', title: `${source} sack ${fmtKg(kg)} labelled`, detail: dest === 'recycling' ? `Transfer to ${PLANT} recorded` : 'In the resin store for re-pelletising' });
    setKg(null); setTarget(rnd(20, 45)); setRound((r) => r + 1); focusFirst();
  };

  const cols: Column<Label>[] = [
    { key: 'c', header: 'Sack', cell: (l) => <span className="code font-medium">{l.code}</span> },
    { key: 'd', header: 'Destination', truncate: 200, cell: (l) => (sent[l.id] ? <span className="inline-flex items-center gap-1.5"><ArrowLeftRight className="size-3.5 text-[var(--text-3)]" />Transfer to {PLANT}</span> : <span className="inline-flex items-center gap-1.5"><Warehouse className="size-3.5 text-[var(--text-3)]" />{s.zones.find((z) => z.id === l.zoneId)?.name ?? '—'}</span>) },
    { key: 'k', header: 'Kg', align: 'right', mono: true, cell: (l) => <span className="font-medium">{fmtNum(l.qtyKg)}</span> },
  ];

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <div className="-mb-[var(--gap)]">
        <PageHeader eyebrow={`${site.name} · Scrap`} title="Film scrap sacks" meta={<><Badge tone="neutral" dot>{todays.length} sack{todays.length === 1 ? '' : 's'} today</Badge><Badge tone="neutral">{kindLabel} shift</Badge></>}
          subtitle="Weigh the sack, print the sticker. Same as today, with a number that adds up." />
      </div>

      <KpiStrip className="md:!grid-cols-2 xl:!grid-cols-none">
        <Stat label="Scrap today" icon={Recycle} accent="var(--series-4)" value={<><CountUp value={todayKg} /><span className="t-base text-[var(--text-3)] font-medium"> kg</span></>} sub={`${todays.length} sack${todays.length === 1 ? '' : 's'} weighed`} />
        <Stat label="This week" icon={BarChart3} accent="var(--series-1)" value={<><CountUp value={weekKg} /><span className="t-base text-[var(--text-3)] font-medium"> kg</span></>} spark={trend.map((d) => d.kg)} sub={`${week.length} sacks · ${weekDays.length} working days`} />
        <Stat label="In the resin store" icon={Warehouse} accent="var(--series-3)" value={<CountUp value={inStore.length} />} sub={`sacks waiting · ${fmtKg(inStore.reduce((t, l) => t + l.qtyKg, 0))}`} />
        <Stat label="Sent to Recycling" icon={Truck} accent="var(--site-recycling)" value={<CountUp value={transfers} />} sub={transfers ? `${fmtKg(transferKg)} · transfers this session` : 'No transfer this session'} />
      </KpiStrip>

      <Workbench asideWidth={440} aside={<>
        <Panel icon={Tag} title="Sack sticker" sub={last && !kg ? 'last printed' : 'live preview'} actions={<Badge tone={dest === 'recycling' ? 'info' : 'neutral'}>{dest === 'recycling' ? `To ${PLANT}` : 'Resin store'}</Badge>}
          footer={last ? <span className="flex items-center gap-1.5 min-w-0">{printing ? <Printer className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 text-[var(--ok)] shrink-0" />}<span className="truncate">{printing ? 'Printing' : 'Last labelled'} <span className="code text-[var(--text)]">{last.code}</span> · {fmtKg(last.qtyKg)} · {sent[last.id] ? `to ${PLANT}` : 'resin store'}</span></span> : 'The code is assigned when the sticker prints.'}>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-4 grid place-items-center overflow-x-auto"><Sticker label={last && (printing || !kg) ? last : preview} site={site} shiftKind={kindLabel} printing={printing} /></div>
        </Panel>
        <Panel icon={Recycle} title="Today's sacks" sub={`${kindLabel} shift`} pad={false}>
          <DataGrid bare dense rows={todays} rowKey={(l) => l.id} columns={cols} selectedKey={last?.id} empty="No sacks weighed yet today."
            footer={todays.length ? <tr><td colSpan={2}>{todays.length} sack{todays.length === 1 ? '' : 's'}</td><td className="text-right num">{fmtNum(todayKg)}</td></tr> : undefined} />
        </Panel>
      </>}>
        <Panel icon={Scale} title="Weigh a sack" sub={`${kindLabel} shift · ${fmtDayShort(today)}`}
          footer={<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><span className="min-w-0 truncate">{kg ? <span className="text-[var(--text)]"><span className="num font-medium">{fmtKg(kg)}</span> · {dest === 'recycling' ? `transfer to ${PLANT}` : 'resin store, to re-pelletise'}</span> : `Still needed: ${[!source && 'a scrap type', 'the weight'].filter(Boolean).join(', ')}.`}</span><Button variant="primary" icon={Printer} disabled={!ready} onClick={weigh} hotkey="mod+enter" hotkeyLabel="Label the sack">{printing ? 'Printing…' : kg ? `Label sack · ${fmtKg(kg)}` : 'Label sack'}</Button></div>}>
          <div ref={formRef}>
            <FormRow label={<Step n={1} done={!!source}>Scrap type</Step>} hint={sources.length ? 'Scrap types come from Settings → Master data (waste sources).' : undefined}>
              {sources.length === 0 ? <SettingsEmpty what="waste sources" icon={Recycle} /> : <ChipGroup ariaLabel="Scrap type" options={sources.map((x) => ({ value: x.id, label: <>{x.label}{x.example && <Badge tone="neutral">example</Badge>}</> }))} value={sourceId} onChange={setSourceId} />}
            </FormRow>
            <FormRow label={<Step n={2} done>Destination</Step>}>
              <ChipGroup ariaLabel="Destination" options={DESTS} value={dest} onChange={setDest} />
              <Note tone={dest === 'recycling' ? 'info' : 'neutral'} className="mt-2">An inter-company transfer is just a transfer with a destination site. The sack keeps its sticker; the {PLANT} receives it by scanning the same code.</Note>
            </FormRow>
            <FormRow label={<Step n={3} done={!!kg}>Weight</Step>}>
              <ScaleBay innerRef={scaleRef} note={kg ? <span className="inline-flex items-center gap-1 text-[var(--text-2)]"><CheckCircle2 className="size-3.5 text-[var(--ok)]" />{fmtKg(kg)} taken from the scale</span> : 'Put the sack on the scale.'}><ScaleWidget key={round} title={scaleTitle} targetKg={target} onReading={(v) => setKg(v)} disabled={printing} /></ScaleBay>
            </FormRow>
          </div>
        </Panel>
      </Workbench>

      <div className="grid gap-[var(--gap)] items-start xl:grid-cols-[minmax(0,1fr)_440px]">
        <Panel icon={BarChart3} title="Film scrap per day" sub="kg · last 6 working days">
          <ColumnChart height={170} data={trend.map((d) => ({ label: fmtDayShort(d.day), values: [d.kg], partial: d.day === today }))} />
        </Panel>
        <Panel icon={ArrowLeftRight} title="Where this week's scrap went" sub="kg">
          <StackedBar format={(n) => fmtKg(n)} segments={[{ label: 'Re-pelletise on site', value: Math.max(0, weekKg - transferKg), color: 'var(--series-1)' }, { label: `Sent to ${PLANT}`, value: transferKg, color: 'var(--series-2)' }]} />
          <p className="t-xs text-[var(--text-3)] mt-2">Sacks sent to the {PLANT} leave this site's stock as a transfer and arrive there under the same code.</p>
        </Panel>
      </div>
    </div>
  );
}
