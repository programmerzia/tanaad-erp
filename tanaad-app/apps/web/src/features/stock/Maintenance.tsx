import { useRef, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, CheckCircle2, Clock, Cog, PieChart, ScrollText, Siren, Timer, Wallet, Wrench } from 'lucide-react';
import type { Breakdown } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite, useGo, useRefList } from '@/app/hooks';
import { Badge, Bar, Button, ChipGroup, Combobox, DataGrid, Empty, Field, Input, KpiStrip, Meter, PageHeader, Panel, SearchInput, Sheet, Stat, Tabs, useIsTouch, useNow, type Column } from '@/components/ui';
import { ColumnChart, CountUp, Donut } from '@/components/charts';
import { addDays, machinesOf } from '@/data/selectors';
import { compact, fmtDateTime, fmtDayShort, fmtNum, fmtUGX } from '@/data/format';
import { fmtHours, hoursBetween, useBeep } from './shared';
import { Fact, KV, SetupHint, dayOf, matches, plural, useSearch } from './kit';

const ms = (iso: string) => new Date(iso).getTime();
const dayStart = (day: string) => ms(`${day}T00:00:00+03:00`);

/** Breakdowns: who is down now and for how long, plus the ledger that prices downtime per machine. */
export function Maintenance() {
  const s = useStore(); const site = useSite(); const go = useGo(); const now = useNow(15000); const beep = useBeep(); const touch = useIsTouch();
  const reportBreakdown = useStore((x) => x.reportBreakdown); const resolveBreakdown = useStore((x) => x.resolveBreakdown); const toast = useStore((x) => x.toast);
  const causes = useRefList('breakdown_cause');
  const [q, setQ] = useSearch();
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const causeBox = useRef<HTMLDivElement>(null);
  const [machineId, setMachineId] = useState<string | null>(null); const [cause, setCause] = useState<string | null>(null); const [other, setOther] = useState('');

  const machines = machinesOf(s, site.id).filter((m) => m.status === 'active' || m.status === 'down');
  const codeOf = (id: string) => s.machines.find((m) => m.id === id)?.code ?? id;
  const breakdowns = s.breakdowns.filter((b) => b.siteId === site.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const openNow = breakdowns.filter((b) => !b.resolvedAt); const resolved = breakdowns.filter((b) => b.resolvedAt);
  const endOf = (b: Breakdown) => (b.resolvedAt ? ms(b.resolvedAt) : now.getTime());
  const hoursOf = (b: Breakdown) => hoursBetween(b.startedAt, b.resolvedAt ?? now);
  const partsFor = (b: Breakdown) => s.partIssues.filter((i) => i.machineId === b.machineId && ms(i.at) >= ms(b.startedAt) && ms(i.at) <= endOf(b));
  const sparesFor = (b: Breakdown) => partsFor(b).reduce((t, i) => t + i.qty * (s.parts.find((p) => p.id === i.partId)?.unitCost ?? 0), 0) || b.sparesCost;
  const overlap = (b: Breakdown, from: number, to: number) => Math.max(0, Math.min(endOf(b), to) - Math.max(ms(b.startedAt), from)) / 3_600_000;

  // Downtime per calendar day for the last 15 days, and the 7-day window the KPIs talk about.
  const days = Array.from({ length: 15 }, (_, k) => addDays(s.today, k - 14));
  const perDay = days.map((day) => ({ day, hours: breakdowns.reduce((t, b) => t + overlap(b, dayStart(day), dayStart(addDays(day, 1))), 0) }));
  const weekFrom = dayStart(addDays(s.today, -6)); const weekSpan = Math.max(1, (now.getTime() - weekFrom) / 3_600_000);
  const weekHours = breakdowns.reduce((t, b) => t + overlap(b, weekFrom, now.getTime()), 0);
  const weekStarted = breakdowns.filter((b) => ms(b.startedAt) >= weekFrom).length;
  const weekIssues = s.partIssues.filter((i) => i.siteId === site.id && ms(i.at) >= weekFrom);
  const issueCost = (list: typeof weekIssues) => list.reduce((t, i) => t + i.qty * (s.parts.find((p) => p.id === i.partId)?.unitCost ?? 0), 0);
  const weekCost = issueCost(weekIssues);
  const mttr = resolved.length ? resolved.reduce((t, b) => t + hoursOf(b), 0) / resolved.length : 0;
  const longest = resolved.reduce((m, b) => Math.max(m, hoursOf(b)), 0);
  const week = perDay.slice(-7);
  const downAtEnd = week.map(({ day }) => { const at = day === s.today ? now.getTime() : dayStart(addDays(day, 1)) - 1; return breakdowns.filter((b) => ms(b.startedAt) <= at && endOf(b) >= at).length; });
  const costPerDay = week.map(({ day }) => issueCost(weekIssues.filter((i) => dayOf(i.at) === day)));
  const repairRun = [...resolved].reverse().map(hoursOf);
  const availability = machines.length ? Math.max(0, 100 - (weekHours / (machines.length * weekSpan)) * 100) : 100;

  const perMachine = [...breakdowns.reduce((m, b) => { const cur = m.get(b.machineId) ?? { hours: 0, cost: 0, n: 0 }; m.set(b.machineId, { hours: cur.hours + hoursOf(b), cost: cur.cost + sparesFor(b), n: cur.n + 1 }); return m; }, new Map<string, { hours: number; cost: number; n: number }>()).entries()].map(([mid, v]) => ({ id: mid, code: codeOf(mid), ...v })).sort((a, b) => b.hours - a.hours);
  const totalHours = perMachine.reduce((t, r) => t + r.hours, 0); const totalCost = perMachine.reduce((t, r) => t + r.cost, 0);
  const causeRows = [...breakdowns.reduce((m, b) => m.set(b.cause, (m.get(b.cause) ?? 0) + 1), new Map<string, number>()).entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const causeSegs = (causeRows.length > 6 ? [...causeRows.slice(0, 5), { label: 'Other causes', value: causeRows.slice(5).reduce((t, x) => t + x.value, 0) }] : causeRows).map((c, i) => ({ ...c, color: c.label === 'Other causes' ? 'var(--text-4)' : `var(--series-${i + 1})` }));

  const openReport = () => { setMachineId(null); setCause(null); setOther(''); setReporting(true); };
  const report = () => {
    const c = other.trim() || cause; if (!machineId || !c) return;
    reportBreakdown({ siteId: site.id, machineId, cause: c }); beep('bad');
    toast({ kind: 'warn', title: `${codeOf(machineId)} reported down`, detail: `${c}. The clock is running.` }); setMachineId(null); setCause(null); setOther(''); setReporting(false);
  };
  const resolve = (id: string) => { const b = breakdowns.find((x) => x.id === id)!; resolveBreakdown(id); beep('ok'); toast({ kind: 'ok', title: `${codeOf(b.machineId)} back in production`, detail: `Down ${fmtHours(hoursBetween(b.startedAt, now))}.` }); };

  const shown = breakdowns.filter((b) => (filter === 'all' || (filter === 'open') === !b.resolvedAt) && matches(q, codeOf(b.machineId), b.cause));
  const maxHours = Math.max(1, ...shown.map(hoursOf));
  const sel = breakdowns.find((b) => b.id === openId);
  const cols: Column<Breakdown>[] = [
    { key: 'm', header: 'Machine', sort: (b) => codeOf(b.machineId), cell: (b) => <span className="font-medium">{codeOf(b.machineId)}</span> },
    { key: 'c', header: 'Cause', sort: (b) => b.cause, truncate: 180, cell: (b) => b.cause },
    { key: 's', header: 'Started', sort: (b) => ms(b.startedAt), cell: (b) => <span className="num text-[var(--text-2)]">{fmtDateTime(b.startedAt)}</span> },
    { key: 'r', header: 'Resolved', sort: (b) => (b.resolvedAt ? ms(b.resolvedAt) : Number.MAX_SAFE_INTEGER), cell: (b) => (b.resolvedAt ? <span className="num text-[var(--text-2)]">{fmtDateTime(b.resolvedAt)}</span> : <Badge tone="bad" dot>Still down</Badge>) },
    { key: 'd', header: 'Downtime', sort: hoursOf, cell: (b) => <span className="flex items-center gap-2"><span className="w-[56px] shrink-0"><Bar value={hoursOf(b)} max={maxHours} tone={b.resolvedAt ? 'series' : 'bad'} /></span><span className="num font-medium">{fmtHours(hoursOf(b))}</span></span> },
    { key: 'sp', header: 'Spares, UGX', align: 'right', mono: true, sort: sparesFor, cell: (b) => fmtNum(sparesFor(b)) },
  ];

  return (
    <div>
      <PageHeader eyebrow={`${site.name} · Maintenance`} title="Breakdowns" meta={openNow.length ? <Badge tone="bad" dot>{plural(openNow.length, 'machine')} down now</Badge> : <Badge tone="ok" dot>All machines running</Badge>}
        subtitle="Report it the minute it stops. Downtime hours and spares cost land on the machine, not in a notebook."
        actions={<><Button icon={Wrench} onClick={() => go.site('stock/spares')}>Spares store</Button><Button variant="primary" icon={AlertTriangle} hotkey={reporting || sel ? undefined : 'n'} hotkeyLabel="Report breakdown" onClick={openReport}>Report breakdown</Button></>} />

      <div className="flex flex-col gap-[var(--gap)]">
        <KpiStrip>
          <Stat label="Down now" icon={Siren} tone={openNow.length ? 'bad' : 'neutral'} accent={openNow.length ? undefined : 'var(--series-3)'} value={<CountUp value={openNow.length} />} spark={downAtEnd} sparkColor={openNow.length ? 'var(--bad)' : 'var(--series-3)'} sub={openNow[0] ? `${codeOf(openNow[0].machineId)} · ${openNow[0].cause}` : `All ${machines.length} machines running`} />
          <Stat label="Downtime, last 7 days" icon={Clock} accent="var(--series-2)" value={fmtHours(weekHours)} spark={week.map((d) => d.hours)} sparkColor="var(--series-2)" sub={`${plural(weekStarted, 'breakdown')} started`} />
          <Stat label="Spares cost, last 7 days" icon={Wallet} accent="var(--series-4)" value={<CountUp value={weekCost} format={compact} />} spark={costPerDay} sub={`UGX · ${plural(weekIssues.reduce((t, i) => t + i.qty, 0), 'part')} issued`} onClick={() => go.site('stock/spares')} />
          <Stat label="Mean time to repair" icon={Timer} accent="var(--series-7)" value={resolved.length ? fmtHours(mttr) : '—'} spark={repairRun} sub={resolved.length ? `${plural(resolved.length, 'repair')} · longest ${fmtHours(longest)}` : 'No repair on record yet'} />
          <Stat label="Machines available" icon={Activity} accent="var(--series-3)" value={<><CountUp value={availability} format={(v) => v.toFixed(1)} /><span className="text-[var(--text-3)] font-medium">%</span></>} spark={week.map((d) => (machines.length ? 100 - (d.hours / (machines.length * 24)) * 100 : 100))} sub={`${machines.length} machines · 24 h basis`} />
        </KpiStrip>

        <div className="grid gap-[var(--gap)] xl:grid-cols-[minmax(0,1fr)_350px] items-start">
          <div className="flex flex-col gap-[var(--gap)] min-w-0">
            <div className="grid gap-[var(--gap)] lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] items-start">
              <Panel icon={Siren} title="Down now" sub={openNow.length ? 'the clock is running' : undefined} bodyClassName="flex flex-col gap-2">
                {openNow.length === 0 ? <Empty icon={CheckCircle2} title="Every machine is running" hint="Report a breakdown the moment one stops. The clock starts when you do." action={<Button size="sm" icon={AlertTriangle} onClick={openReport}>Report breakdown</Button>} /> : openNow.map((b) => (
                  <div key={b.id} className="relative rounded-lg border border-[var(--line)] overflow-hidden pl-3.5 pr-3 py-2.5" style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--bad) 9%, var(--surface)), var(--surface) 72%)' }}>
                    <span className="absolute left-0 inset-y-0 w-[3px] bg-[var(--bad)]" />
                    <div className="flex items-center justify-between gap-2">
                      <button className="t-lg font-semibold hover:underline underline-offset-2 text-left truncate" onClick={() => setOpenId(b.id)}>{codeOf(b.machineId)}</button>
                      <Badge tone="bad"><span className="size-1.5 rounded-full bg-current anim-live" />Down</Badge>
                    </div>
                    <div className="t-sm text-[var(--text-2)] truncate">{b.cause} · since {fmtDateTime(b.startedAt)}</div>
                    <div className="flex items-end justify-between gap-3 mt-2">
                      <div><div className="t-hero num text-[var(--bad)]">{fmtHours(hoursOf(b))}</div><div className="t-xs text-[var(--text-3)] mt-0.5">down so far</div></div>
                      <div className="text-right"><div className="num t-base font-medium">{fmtUGX(sparesFor(b))}</div><div className="t-xs text-[var(--text-3)]">spares so far · {plural(partsFor(b).reduce((t, i) => t + i.qty, 0), 'part')}</div></div>
                    </div>
                    <Button variant="ok" block className="mt-2.5" icon={CheckCircle2} onClick={() => resolve(b.id)}>Resolve · back in production</Button>
                  </div>
                ))}
              </Panel>
              <Panel icon={BarChart3} title="Downtime per day" sub="machine hours · 15 days">
                <ColumnChart height={openNow.length ? 196 : 176} data={perDay.map((d) => ({ label: fmtDayShort(d.day), values: [Math.round(d.hours * 10) / 10], partial: d.day === s.today }))} format={(v) => `${Math.round(v * 10) / 10} h`} />
                <div className="t-xs text-[var(--text-3)] mt-1">Hours are added across machines, so two machines down all day read 48 h. Today is lighter because it is still running.</div>
              </Panel>
            </div>

            <Panel icon={ScrollText} title="Breakdown ledger" sub={`${plural(breakdowns.length, 'breakdown')} on record`} pad={false}>
              <div className="flex flex-wrap items-center gap-2 px-[var(--pad)] py-2 border-b border-[var(--line)]">
                <SearchInput value={q} onChange={setQ} placeholder="Search machine or cause" />
                <Tabs value={filter} onChange={setFilter} tabs={[{ value: 'all', label: 'All', count: breakdowns.length }, { value: 'open', label: 'Down now', count: openNow.length }, { value: 'resolved', label: 'Resolved', count: resolved.length }]} />
              </div>
              {breakdowns.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={Wrench} title="No breakdowns yet" hint="The first one you report starts the ledger." /></div> : (
                <DataGrid bare rows={shown} columns={cols} rowKey={(b) => b.id} onRowClick={(b) => setOpenId(b.id)} selectedKey={openId} maxHeight={440} empty="No breakdown matches."
                  footer={<tr><td colSpan={4}>Total · {plural(shown.length, 'breakdown')}</td><td className="num">{fmtHours(shown.reduce((t, b) => t + hoursOf(b), 0))}</td><td className="text-right num">{fmtNum(shown.reduce((t, b) => t + sparesFor(b), 0))}</td></tr>} />
              )}
            </Panel>
          </div>

          <div className="grid gap-[var(--gap)] items-start md:grid-cols-2 xl:grid-cols-1 min-w-0">
            <Panel icon={Cog} title="Downtime by machine" sub="hours · all on record" footer={perMachine.length ? <div className="flex justify-between gap-3"><span>{fmtHours(totalHours)} in all</span><span className="num">{fmtUGX(totalCost)} of spares</span></div> : undefined}>
              {perMachine.length === 0 ? <Empty icon={Cog} title="No breakdowns recorded" /> : perMachine.slice(0, 8).map((r) => <Meter key={r.id} label={r.code} sub={`${plural(r.n, 'breakdown')} · UGX ${compact(r.cost)}`} value={r.hours} max={perMachine[0].hours} display={fmtHours(r.hours)} />)}
            </Panel>
            <Panel icon={PieChart} title="What stops the machines" sub="by cause">
              {causeSegs.length === 0 ? <Empty icon={PieChart} title="Nothing to chart yet" /> : (
                <div className="flex items-center gap-4">
                  <Donut segments={causeSegs} size={108} thickness={14} center={breakdowns.length} sub="breakdowns" />
                  <div className="flex-1 min-w-0">{causeSegs.map((c) => <KV key={c.label} label={c.label} dot={c.color}>{c.value}</KV>)}</div>
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>

      {/* Report a breakdown */}
      <Sheet open={reporting} onClose={() => setReporting(false)} width={440} title="Report breakdown" sub="The clock starts the moment you report"
        footer={<><Button onClick={() => setReporting(false)}>Cancel</Button><Button variant="danger" icon={AlertTriangle} hotkey="mod+enter" hotkeyLabel="Report machine down" disabled={!machineId || !(cause || other.trim())} onClick={report}>Report {machineId ? codeOf(machineId) : 'machine'} down</Button></>}>
        <div className="flex flex-col gap-3.5">
          <Field label="Machine" required>
            <Combobox autoFocus={!touch} value={machineId} onChange={(v) => { setMachineId(v); if (v && !touch) setTimeout(() => causeBox.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus(), 30); }} placeholder="Search machine" emptyText="No machine with that name"
              options={machines.map((m) => ({ value: m.id, label: m.code, sub: m.kind, disabled: m.status === 'down', right: m.status === 'down' ? <Badge tone="bad" dot>already down</Badge> : undefined }))} />
          </Field>
          <div ref={causeBox}>
            <div className="t-sm font-medium text-[var(--text-2)] mb-1">Cause<span className="text-[var(--bad)]"> *</span>{causes.length > 0 && causes.length <= 8 && <span className="font-normal text-[var(--text-3)] touch:hidden"> · arrows or 1 to {causes.length}</span>}</div>
            {causes.length === 0 ? <SetupHint inline what="breakdown causes" />
              : causes.length > 8 ? <Combobox value={other.trim() ? null : cause} onChange={(v) => { setCause(v); setOther(''); }} placeholder="Search cause" options={causes.map((c) => ({ value: c.label, label: c.label }))} />
                : <ChipGroup ariaLabel="Cause" columns={2} value={other.trim() ? null : cause} onChange={(v) => { setCause(v); setOther(''); }} options={causes.map((c) => ({ value: c.label, label: c.label }))} />}
          </div>
          <Field label="Something else" hint="Type it when no cause on the list fits. The list is kept in Settings → Master data."><Input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Short description of what happened" /></Field>
          {machineId && <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 grid grid-cols-2 gap-3">
            <Fact label={`Breakdowns on ${codeOf(machineId)}`}>{breakdowns.filter((b) => b.machineId === machineId).length}</Fact>
            <Fact label="Downtime on record">{perMachine.find((r) => r.id === machineId) ? fmtHours(perMachine.find((r) => r.id === machineId)!.hours) : 'None'}</Fact>
          </div>}
        </div>
      </Sheet>

      {/* Inspect one breakdown */}
      <Sheet open={!!sel} onClose={() => setOpenId(null)} width={460} title={sel ? `${codeOf(sel.machineId)} · ${sel.cause}` : ''} sub={sel ? `Reported ${fmtDateTime(sel.startedAt)}` : undefined}
        footer={sel && (sel.resolvedAt ? <Button onClick={() => setOpenId(null)}>Close</Button> : <><Button onClick={() => setOpenId(null)}>Close</Button><Button variant="ok" icon={CheckCircle2} hotkey="mod+enter" hotkeyLabel="Resolve breakdown" onClick={() => { resolve(sel.id); setOpenId(null); }}>Resolve · back in production</Button></>)}>
        {sel && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">{sel.resolvedAt ? <Badge tone="ok" dot>Resolved</Badge> : <Badge tone="bad" dot>Still down</Badge>}<span className="t-sm text-[var(--text-3)]">{sel.resolvedAt ? `back in production ${fmtDateTime(sel.resolvedAt)}` : 'the clock is running'}</span></div>
            <div className="grid grid-cols-3 gap-3">
              <Fact label="Downtime">{fmtHours(hoursOf(sel))}</Fact>
              <Fact label="Spares cost">{fmtUGX(sparesFor(sel))}</Fact>
              <Fact label="Started">{fmtDayShort(dayOf(sel.startedAt))}</Fact>
            </div>
            <div>
              <div className="t-label mb-1">Parts issued during this breakdown</div>
              {partsFor(sel).length === 0 ? <div className="t-sm text-[var(--text-3)] rounded-md border border-dashed border-[var(--line-2)] px-3 py-3">No part was issued to {codeOf(sel.machineId)} in this window{sel.sparesCost ? `. ${fmtUGX(sel.sparesCost)} of spares was entered by hand.` : '.'}</div>
                : partsFor(sel).map((i) => { const p = s.parts.find((x) => x.id === i.partId); return <KV key={i.id} label={<>{p?.name ?? 'Part'} ×{i.qty}<span className="text-[var(--text-3)]"> · {fmtDateTime(i.at)}</span></>}>{fmtUGX(i.qty * (p?.unitCost ?? 0))}</KV>; })}
            </div>
            <div>
              <div className="t-label mb-1">Same machine, on record</div>
              <KV label="Breakdowns">{breakdowns.filter((b) => b.machineId === sel.machineId).length}</KV>
              <KV label="Downtime">{fmtHours(perMachine.find((r) => r.id === sel.machineId)?.hours ?? 0)}</KV>
              <KV label="Spares">{fmtUGX(perMachine.find((r) => r.id === sel.machineId)?.cost ?? 0)}</KV>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
