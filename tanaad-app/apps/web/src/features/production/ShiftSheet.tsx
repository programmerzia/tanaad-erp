import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Factory, PackageCheck, Printer, Scale, ScrollText, Timer } from 'lucide-react';
import type { ShiftKind } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite, useGo, useSession, useQueryParam } from '@/app/hooks';
import { Avatar, Badge, Button, ChipGroup, DataGrid, Empty, KpiStrip, Meter, Note, PageHeader, Panel, SearchInput, Stat, Tabs, Toolbar, cn, type Column } from '@/components/ui';
import { CountUp, Delta } from '@/components/charts';
import { currentShiftKind, lastWorkingDays, machineWall, massBalanceDay, type MachineTile } from '@/data/selectors';
import { fmtDay, fmtDayLong, fmtDayShort, fmtKg, fmtNum, fmtTime } from '@/data/format';
import { ShiftEntrySheet } from './ShiftEntrySheet';
import { REASON_AFTER_MIN, byProduct, cap, codeKey, downloadCsv, downtimeByReason, shiftHistory, shiftWindow, wallConfig, wallTotals } from './shared';
import { MassBadge, MassBalance, STATE, SetupHint, Swatch } from './parts';

const dash = <span className="text-[var(--text-4)]">—</span>;

/** The shift book as a ledger: one row per machine, totals in the footer, a place to sign, print and CSV out. */
export function ShiftSheet() {
  const s = useStore(); const site = useSite(); const go = useGo(); const session = useSession(); const cfg = wallConfig(site.id); const kgIO = cfg.kgMode === 'in_out';
  const days = useMemo(() => lastWorkingDays(site.id, s.today, 7), [site.id, s.today]);
  const [day, setDay] = useState(s.today);
  const [kind, setKind] = useState<ShiftKind>(() => currentShiftKind());
  const qParam = useQueryParam('q'); const [q, setQ] = useState(qParam ?? '');
  useEffect(() => { if (qParam !== undefined) setQ(qParam); }, [qParam]);
  const [open, setOpen] = useState<{ id: string; nonce: number } | null>(null);
  const readOnly = session?.role === 'ceo' || session?.role === 'group_admin';
  const editable = !readOnly && day === s.today;

  const wall = useMemo(() => machineWall(s, site.id, day, kind), [s, site.id, day, kind]);
  const other = useMemo(() => machineWall(s, site.id, day, kind === 'day' ? 'night' : 'day'), [s, site.id, day, kind]);
  const rows = wall.filter((t) => t.state !== 'arriving');
  const term = q.trim().toLowerCase();
  const shown = term ? rows.filter((t) => `${t.machine.code} ${t.operator?.fullName ?? ''} ${t.product?.internalName ?? ''} ${t.entry?.downtimeReason ?? ''} ${STATE[t.state].label}`.toLowerCase().includes(term)) : rows;
  const tot = wallTotals(rows); const shownTot = wallTotals(shown); const notLogged = rows.length - tot.logged;
  const mb = massBalanceDay(s, site.id, day); const win = shiftWindow(site, s.today, day, kind);
  const yieldFloor = 100 - site.thresholds.massGapPct;
  const products = byProduct(rows); const reasons = downtimeByReason(rows);
  const hist = useMemo(() => shiftHistory(s, site.id, cfg.stage, kind, days), [s, site.id, cfg.stage, kind, days]);
  const spark = <K extends 'units' | 'rejects' | 'downtime' | 'inKg' | 'outKg'>(k: K) => hist.filter((d) => d.entries > 0).map((d) => d[k]);
  const countOf = (w: MachineTile[]) => w.filter((t) => t.entry).length;
  const yieldOf = (t: MachineTile) => (t.entry?.inputKg ? Math.round((t.entry.outputKg / t.entry.inputKg) * 1000) / 10 : 0);

  const columns: Column<MachineTile>[] = [
    { key: 'code', header: 'Machine', sort: (t) => codeKey(t.machine.code), cell: (t) => <span className="font-medium">{t.machine.code}</span> },
    { key: 'op', header: 'Operator', truncate: 170, sort: (t) => t.operator?.fullName ?? '~', cell: (t) => (t.entry ? (t.operator ? <span className="inline-flex items-center gap-1.5"><Avatar name={t.operator.fullName} seed={t.operator.avatarSeed} size={20} />{t.operator.fullName}</span> : dash) : <Badge tone={t.state === 'down' ? 'bad' : 'warn'} dot>{t.state === 'down' ? 'Down, not logged' : 'Not logged'}</Badge>) },
    { key: 'prod', header: kgIO ? 'Grade' : 'Product', truncate: 150, sort: (t) => t.product?.internalName ?? '~', cell: (t) => (t.product ? <span className="inline-flex items-center gap-1.5"><Swatch colour={t.product.colour} />{t.product.internalName}</span> : dash) },
    { key: 'good', header: `Good ${cfg.unit}`, align: 'right', mono: true, sort: (t) => t.entry?.goodUnits ?? -1, cell: (t) => (t.entry ? <><span className="font-medium">{fmtNum(t.entry.goodUnits)}</span>{t.expectedSoFar ? <span className="text-[var(--text-3)]"> / {fmtNum(t.expectedSoFar)}</span> : null}</> : dash) },
    kgIO
      ? { key: 'pct', header: 'Yield', align: 'right', mono: true, sort: (t) => (t.entry ? yieldOf(t) : -1), cell: (t) => (t.entry ? <span className={cn('font-medium', yieldOf(t) < yieldFloor && 'text-[var(--warn)]')}>{yieldOf(t)}%</span> : dash) }
      : { key: 'pct', header: 'Of due', align: 'right', mono: true, sort: (t) => t.pct ?? -1, cell: (t) => (t.pct !== undefined ? <span className={cn('font-medium', t.state === 'below' ? 'text-[var(--bad)]' : t.pct >= 100 && 'text-[var(--ok)]')}>{t.pct}%</span> : dash) },
    ...(kgIO ? [] : [{ key: 'rej', header: 'Rejects', align: 'right' as const, mono: true, sort: (t: MachineTile) => t.entry?.rejectUnits ?? -1, cell: (t: MachineTile) => (t.entry ? fmtNum(t.entry.rejectUnits) : dash) }]),
    { key: 'kg', header: 'Kg in → out', align: 'right', mono: true, width: 112, sort: (t) => t.entry?.outputKg ?? -1, cell: (t) => (t.entry ? <>{fmtNum(Math.round(t.entry.inputKg))}<span className="text-[var(--text-4)]"> → </span><span className="font-medium">{fmtNum(Math.round(t.entry.outputKg))}</span></> : dash) },
    { key: 'down', header: 'Downtime', sort: (t) => t.entry?.downtimeMin ?? -1, cell: (t) => (t.entry ? (t.entry.downtimeMin ? <span><span className={cn('num', t.entry.downtimeMin > REASON_AFTER_MIN && 'text-[var(--warn)] font-medium')}>{t.entry.downtimeMin} min</span>{t.entry.downtimeReason ? <span className="text-[var(--text-3)]"> · {t.entry.downtimeReason}</span> : t.state === 'below' ? <span className="text-[var(--bad)]"> · no reason</span> : null}</span> : <span className="text-[var(--text-3)]">None</span>) : dash) },
    { key: 'at', header: 'Logged', align: 'right', mono: true, sort: (t) => t.entry?.at ?? '', cell: (t) => (t.entry ? fmtTime(t.entry.at) : dash) },
  ];

  const exportCsv = () => {
    downloadCsv(`${site.shortName}-shift-${day}-${kind}.csv`, ['Machine', 'Status', 'Operator', 'Product', `Good ${cfg.unit}`, 'Benchmark', 'Rejects', 'Input kg', 'Output kg', 'Downtime min', 'Reason', 'Logged at'],
      rows.map((t) => [t.machine.code, t.entry ? t.state : 'not logged', t.operator?.fullName ?? '', t.product?.internalName ?? '', t.entry?.goodUnits ?? '', t.benchmark ?? '', t.entry?.rejectUnits ?? '', t.entry?.inputKg ?? '', t.entry?.outputKg ?? '', t.entry?.downtimeMin ?? '', t.entry?.downtimeReason ?? '', t.entry ? fmtTime(t.entry.at) : '']));
    useStore.getState().toast({ kind: 'ok', title: 'CSV downloaded', detail: `${rows.length} rows · ${fmtDayShort(day)} ${kind} shift` });
  };
  const print = () => { window.print(); useStore.getState().toast({ kind: 'info', title: 'Sent to printer', detail: `${site.machineWallTitle} sheet · ${fmtDayShort(day)} ${kind}` }); };
  const close = () => { setOpen(null); setTimeout(() => document.querySelector<HTMLElement>('#shift-sheet-print [tabindex="0"]')?.focus(), 0); };
  const openTile = open ? wall.find((t) => t.machine.id === open.id) ?? null : null;

  return (
    <div>
      <style>{`@media print { body * { visibility: hidden !important; } #shift-sheet-print, #shift-sheet-print * { visibility: visible !important; } #shift-sheet-print { position: absolute; left: 0; top: 0; width: 100%; } #shift-sheet-print .surface { box-shadow: none; } }`}</style>
      <PageHeader eyebrow={`${site.name} · Production`} title="Shift sheet"
        meta={<><Badge tone="neutral">{site.machineWallTitle}</Badge><Badge tone={rows.length && notLogged === 0 ? 'ok' : win.phase === 'upcoming' ? 'neutral' : 'warn'} dot>{tot.logged} of {rows.length} logged</Badge></>}
        subtitle={<>{fmtDayLong(day)} · {kind} shift {win.starts}–{win.ends}{win.phase === 'running' ? ' · in progress' : win.phase === 'upcoming' ? ' · not started' : ''}</>}
        actions={<Button icon={Factory} onClick={() => go.site('production/wall')} hotkey={open ? undefined : 'w'} hotkeyLabel={`Open the ${site.machineWallTitle}`}>{site.machineWallTitle}</Button>}
        tabs={<Tabs variant="underline" value={kind} onChange={setKind} tabs={[{ value: 'day', label: 'Day shift', count: countOf(kind === 'day' ? wall : other) }, { value: 'night', label: 'Night shift', count: countOf(kind === 'night' ? wall : other) }]} />} />

      <KpiStrip className="md:grid-cols-4 mb-[var(--gap)]">
        <Stat label={`Good ${cfg.unit}`} icon={PackageCheck} accent="var(--series-3)" value={<CountUp value={tot.good} />} delta={tot.due ? <Delta value={(tot.good / tot.due) * 100 - 100} label={win.phase === 'running' ? 'against what is due by now' : 'against the benchmark'} /> : undefined} spark={spark('units')} sub={tot.due ? `${fmtNum(tot.due)} ${win.phase === 'running' ? 'due by now' : 'benchmark'}` : `${tot.logged} of ${rows.length} machines logged`} />
        {kgIO
          ? <Stat label="Yield" icon={Scale} accent="var(--series-1)" value={<><CountUp value={tot.inKg ? (tot.outKg / tot.inKg) * 100 : 0} format={(n) => n.toFixed(1)} /><span className="text-[var(--text-3)] font-medium">%</span></>} spark={hist.filter((d) => d.entries > 0).map((d) => d.yieldPct)} sub={`${fmtKg(Math.round(Math.max(0, tot.inKg - tot.outKg)))} wash and melt loss`} />
          : <Stat label="Rejects" icon={AlertTriangle} accent="var(--series-8)" value={<CountUp value={tot.rejects} />} spark={spark('rejects')} sparkColor="var(--series-8)" sub={tot.good + tot.rejects ? `${((tot.rejects / (tot.good + tot.rejects)) * 100).toFixed(1)}% of pieces made` : 'Nothing made yet'} />}
        <Stat label="Kg in → out" icon={Scale} accent="var(--series-4)" value={<><CountUp value={Math.round(tot.inKg)} /><span className="text-[var(--text-4)] font-medium"> → </span><CountUp value={Math.round(tot.outKg)} /></>} spark={spark('outKg')} sparkColor="var(--series-4)" sub={cfg.kgMode === 'estimate' ? 'Estimated from the mat count' : tot.inKg ? `${(((tot.inKg - tot.outKg) / tot.inKg) * 100).toFixed(1)}% process loss` : 'No weight logged yet'} />
        <Stat label="Downtime" icon={Timer} accent="var(--series-7)" tone={reasons.some((r) => r.missing) ? 'warn' : 'neutral'} value={<><CountUp value={tot.down} /><span className="t-base text-[var(--text-3)] font-medium"> min</span></>} spark={spark('downtime')} sparkColor="var(--series-7)" sub={reasons.length ? `Most: ${reasons[0].reason.toLowerCase()} · ${fmtNum(reasons[0].min)} min` : 'No machine stood still'} />
      </KpiStrip>

      <Toolbar right={<>
        <Button icon={Download} onClick={exportCsv} disabled={rows.length === 0} hotkey={open ? undefined : 'e'} hotkeyLabel="Export the shift sheet as CSV">CSV</Button>
        <Button icon={Printer} variant="primary" onClick={print} disabled={rows.length === 0} hotkey={open ? undefined : 'p'} hotkeyLabel="Print the shift sheet">Print</Button>
      </>}>
        <SearchInput value={q} onChange={setQ} placeholder="Search machine, operator, product" hotkey={open ? null : '/'} className="max-w-[260px]" />
        <ChipGroup size="sm" ariaLabel="Day" value={day} onChange={setDay} options={days.map((d) => ({ value: d, label: d === s.today ? `Today · ${fmtDayShort(d)}` : fmtDay(d) }))} />
        <span className="t-sm text-[var(--text-3)] whitespace-nowrap">{shown.length === rows.length ? `${rows.length} machines` : `${shown.length} of ${rows.length} machines`}</span>
      </Toolbar>
      {notLogged > 0 && win.phase !== 'upcoming' && <Note tone="warn" className="mb-2">{notLogged} of {rows.length} machines have no entry for this shift. Rows marked "Not logged" are still open in the book.</Note>}
      {win.phase === 'upcoming' && <Note tone="info" className="mb-2">The {kind} shift starts at {win.starts}. The sheet fills in as machines are logged.</Note>}
      {site.toBeConfirmed && <Note tone="warn" className="mb-2">{site.toBeConfirmed}</Note>}

      {rows.length === 0 ? <SetupHint icon={Factory} what="machines on this wall" where="Machines" /> : (
        <div className="grid gap-[var(--gap)] items-start min-[1500px]:grid-cols-[minmax(0,1fr)_320px]">
          <div id="shift-sheet-print" className="min-w-0">
            <div className="hidden print:block mb-3"><div className="font-black tracking-[0.18em] italic">TANAAD</div><div className="t-base">{site.legalName} · {site.machineWallTitle} · {fmtDayLong(day)} · {kind} shift</div></div>
            <Panel icon={ScrollText} title={`${site.machineWallTitle} book`} sub={`${fmtDay(day)} · ${kind} shift${editable ? ' · Enter on a row opens its entry' : ''}`} pad={false}
              footer={<div className="grid grid-cols-2 gap-x-8 pt-5 pb-1">{['Supervisor signature', 'Site manager signature'].map((l) => <div key={l}><div className="border-b border-[var(--text-3)]" /><div className="t-xs text-[var(--text-3)] mt-1">{l}</div></div>)}</div>}>
              <DataGrid bare rows={shown} columns={columns} rowKey={(t) => t.machine.id} dense empty="No machine matches the search."
                onRowClick={editable ? (t) => setOpen({ id: t.machine.id, nonce: Date.now() }) : undefined} selectedKey={open?.id}
                rowClassName={(t) => (!t.entry ? 'bg-[color-mix(in_srgb,var(--warn)_7%,transparent)]' : undefined)}
                footer={<tr>
                  <td colSpan={3}>{term ? 'Totals of the rows shown' : 'Totals'} · {shownTot.logged} of {shown.length} logged</td>
                  <td className="text-right num">{fmtNum(shownTot.good)}{shownTot.due ? <span className="text-[var(--text-3)] font-normal"> / {fmtNum(shownTot.due)}</span> : null}</td>
                  <td className="text-right num">{kgIO ? (shownTot.inKg ? `${((shownTot.outKg / shownTot.inKg) * 100).toFixed(1)}%` : '') : shownTot.due ? `${Math.round((shownTot.good / shownTot.due) * 100)}%` : ''}</td>
                  {!kgIO && <td className="text-right num">{fmtNum(shownTot.rejects)}</td>}
                  <td className="text-right num whitespace-nowrap">{fmtNum(Math.round(shownTot.inKg))}<span className="text-[var(--text-4)] font-normal"> → </span>{fmtNum(Math.round(shownTot.outKg))}</td>
                  <td className="num">{fmtNum(shownTot.down)} min</td>
                  <td />
                </tr>} />
            </Panel>
          </div>

          <aside className="grid gap-[var(--gap)] md:grid-cols-2 lg:grid-cols-3 min-[1500px]:grid-cols-1 min-w-0 items-start">
            <Panel icon={PackageCheck} title={kgIO ? 'By grade' : 'By product'} sub="this shift">
              {products.length === 0 ? <Empty title="Nothing logged yet" /> : products.map((p) => (
                <Meter key={p.id} tone={p.due && p.units / p.due < site.thresholds.benchmarkPct / 100 ? 'warn' : 'series'} label={<span className="inline-flex items-center gap-1.5"><Swatch colour={p.colour} />{p.name}</span>} sub={fmtKg(Math.round(p.kg))} value={p.units} max={Math.max(p.due, p.units) || 1} display={<>{fmtNum(p.units)}{p.due ? <span className="text-[var(--text-3)] font-normal"> / {fmtNum(p.due)}</span> : null}</>} />
              ))}
            </Panel>
            <Panel icon={Scale} title="Mass balance" sub={`${fmtDayShort(day)}, both shifts`} actions={<MassBadge mb={mb} />} footer={mb.kgIn > 0 ? <>Allowed loss {site.thresholds.massGapPct}% is <span className="num">{fmtKg(Math.round(mb.allowedLossKg * 10) / 10)}</span></> : undefined}>
              <MassBalance mb={mb} size={96} />
            </Panel>
            <Panel icon={Timer} title="Downtime by reason" sub={tot.down ? `${fmtNum(tot.down)} min` : undefined}>
              {reasons.length === 0 ? <Empty icon={CheckCircle2} title="No downtime recorded" /> : reasons.map((r) => <Meter key={r.reason} tone={r.missing ? 'bad' : 'series'} label={r.reason} sub={`${r.machines} machine${r.machines === 1 ? '' : 's'}`} value={r.min} max={reasons[0].min} display={`${fmtNum(r.min)} min`} />)}
            </Panel>
          </aside>
        </div>
      )}

      <ShiftEntrySheet key={open?.nonce ?? 0} tile={editable ? openTile : null} kind={kind} day={day} onClose={close} />
    </div>
  );
}
