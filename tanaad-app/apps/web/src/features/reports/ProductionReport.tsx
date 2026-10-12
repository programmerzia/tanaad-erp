import { useMemo, useState } from 'react';
import { Factory, Download, Printer, ArrowUpRight, Flame, Clock } from 'lucide-react';
import type { ShiftKind } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite } from '@/app/hooks';
import { lastWorkingDays, machineWall, massBalanceDay, outputToday } from '@/data/selectors';
import { fmtDay, fmtDayShort, fmtKg, fmtNum, fmtPct } from '@/data/format';
import { Badge, Button, DataGrid, Empty, KpiStrip, Panel, Stat, cn, type Column } from '@/components/ui';
import { downloadCsv } from '@/features/cash/categories';

export function ProductionReport() {
  const s = useStore();
  const site = useSite();
  const [day, setDay] = useState(s.today);
  const [shiftKind, setShiftKind] = useState<ShiftKind>('day');

  const days = useMemo(() => lastWorkingDays(site.id, s.today, 7), [site.id, s.today]);
  const machines = useMemo(() => machineWall(s, site.id, day, shiftKind), [s, site.id, day, shiftKind]);
  const outputs = useMemo(() => outputToday(s, site.id, day), [s, site.id, day]);
  const massBal = useMemo(() => massBalanceDay(s, site.id, day), [s, site.id, day]);

  // Aggregate stats
  const totalUnits = outputs.reduce((t, o) => t + o.units, 0);
  const totalKg = outputs.reduce((t, o) => t + o.kg, 0);
  const totalTarget = outputs.reduce((t, o) => t + o.target, 0);
  const targetPct = totalTarget > 0 ? Math.round((totalUnits / totalTarget) * 100) : 100;

  const runningCount = machines.filter((m) => m.state === 'ok' || m.state === 'below' || m.state === 'logged').length;
  const belowCount = machines.filter((m) => m.state === 'below').length;
  const unloggedCount = machines.filter((m) => m.state === 'not_logged').length;
  const downCount = machines.filter((m) => m.state === 'down').length;

  const totalDowntimeMin = machines.reduce((t, m) => t + (m.entry?.downtimeMin ?? 0), 0);
  const wastePct = massBal.kgIn > 0 ? (massBal.wasteKg / massBal.kgIn) * 100 : 0;

  const handleExport = () => {
    const headers = ['Machine', 'Operator', 'Product', 'Output Units', 'Output Kg', 'Target', 'Achieved %', 'Downtime (min)', 'Downtime Reason', 'Status'];
    const rows = machines.map((m) => [
      m.machine.code,
      m.operator?.fullName ?? '—',
      m.product?.internalName ?? '—',
      m.entry?.goodUnits ?? 0,
      m.entry?.outputKg ?? 0,
      m.expectedSoFar ?? 0,
      m.pct !== undefined ? `${m.pct}%` : '—',
      m.entry?.downtimeMin ?? 0,
      m.entry?.downtimeReason ?? '—',
      m.state,
    ]);
    downloadCsv(`production-report-${site.id}-${day}`, headers, rows);
    s.toast({ kind: 'ok', title: 'Production report exported as CSV' });
  };

  type MachineRow = (typeof machines)[number];
  const columns: Column<MachineRow>[] = [
    {
      key: 'machine',
      header: 'Machine',
      sticky: true,
      sort: (r) => r.machine.code,
      cell: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-semibold">{r.machine.code}</span>
        </div>
      ),
    },
    {
      key: 'operator',
      header: 'Operator',
      cell: (r) => <span className="font-medium">{r.operator?.fullName ?? <span className="text-[var(--text-4)]">Not assigned</span>}</span>,
    },
    {
      key: 'product',
      header: 'Product',
      cell: (r) => (
        r.product ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: r.product.colour ?? 'var(--brand)' }} />
            {r.product.internalName}
          </span>
        ) : <span className="text-[var(--text-4)]">—</span>
      ),
    },
    {
      key: 'output',
      header: 'Shift Output',
      align: 'right',
      mono: true,
      sort: (r) => r.entry?.goodUnits ?? 0,
      cell: (r) => (
        <div>
          <span className="font-bold text-[15px]">{fmtNum(r.entry?.goodUnits ?? 0)}</span>
          {r.entry?.outputKg ? <span className="t-xs text-[var(--text-3)] block">{fmtKg(r.entry.outputKg)}</span> : null}
        </div>
      ),
    },
    {
      key: 'target',
      header: 'Target due',
      align: 'right',
      mono: true,
      cell: (r) => <span className="text-[var(--text-2)]">{r.expectedSoFar ? fmtNum(r.expectedSoFar) : '—'}</span>,
    },
    {
      key: 'pct',
      header: 'Performance',
      align: 'right',
      mono: true,
      sort: (r) => r.pct ?? 0,
      cell: (r) => (
        r.pct !== undefined ? (
          <Badge tone={r.pct >= 100 ? 'ok' : r.pct >= 85 ? 'warn' : 'bad'}>
            {r.pct}%
          </Badge>
        ) : <span className="text-[var(--text-4)]">—</span>
      ),
    },
    {
      key: 'downtime',
      header: 'Downtime',
      align: 'right',
      mono: true,
      cell: (r) => (
        r.entry?.downtimeMin ? (
          <span className="text-[var(--warn)] font-medium">{r.entry.downtimeMin} min</span>
        ) : <span className="text-[var(--text-4)]">0 min</span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason / Status',
      cell: (r) => (
        r.entry?.downtimeReason ? (
          <span className="t-sm text-[var(--bad)] font-medium">{r.entry.downtimeReason}</span>
        ) : r.state === 'not_logged' ? (
          <Badge tone="warn" dot>Waiting for output</Badge>
        ) : r.state === 'below' ? (
          <Badge tone="bad" dot>Below benchmark</Badge>
        ) : (
          <Badge tone="ok" dot>Running smoothly</Badge>
        )
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
        <div>
          <div className="flex items-center gap-2 t-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">
            <Factory className="size-3.5 text-[var(--brand)]" />
            {site.name} · Daily Shift Reporting
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)] mt-0.5">
            Production & Machine Output Report
          </h1>
          <p className="t-sm text-[var(--text-2)] mt-0.5">
            Shift performance, machine counters, downtime analysis and material yield.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Day Selector */}
          <select
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="ctl text-sm font-medium rounded-lg border border-[var(--line-2)] bg-[var(--surface)] px-3 py-1.5"
          >
            {days.map((d) => (
              <option key={d} value={d}>
                {d === s.today ? `Today (${fmtDayShort(d)})` : fmtDay(d)}
              </option>
            ))}
          </select>

          {/* Shift Selector */}
          <div className="inline-flex rounded-lg border border-[var(--line-2)] bg-[var(--surface-2)] p-0.5 text-xs font-medium">
            <button
              onClick={() => setShiftKind('day')}
              className={cn('px-2.5 py-1 rounded-md transition-colors', shiftKind === 'day' ? 'bg-[var(--surface)] font-semibold shadow-xs' : 'text-[var(--text-3)]')}
            >
              Day shift
            </button>
            <button
              onClick={() => setShiftKind('night')}
              className={cn('px-2.5 py-1 rounded-md transition-colors', shiftKind === 'night' ? 'bg-[var(--surface)] font-semibold shadow-xs' : 'text-[var(--text-3)]')}
            >
              Night shift
            </button>
          </div>

          <Button size="sm" variant="ghost" icon={Printer} onClick={() => window.print()} className="no-print">
            Print
          </Button>
          <Button size="sm" variant="ghost" icon={Download} onClick={handleExport} className="no-print">
            CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <KpiStrip className="grid-cols-2 md:grid-cols-4">
        <Stat
          label="Total Output Produced"
          icon={Factory}
          tone="ok"
          value={<>{fmtNum(totalUnits)} <span className="t-sm font-normal text-[var(--text-2)]">units</span></>}
          sub={<>{fmtKg(totalKg)} total mass produced</>}
        />
        <Stat
          label="Target Attainment"
          icon={ArrowUpRight}
          tone={targetPct >= 100 ? 'ok' : targetPct >= 85 ? 'warn' : 'bad'}
          value={<>{targetPct}%</>}
          sub={<>{fmtNum(totalUnits)} made of {fmtNum(totalTarget)} due</>}
        />
        <Stat
          label="Scrap & Waste Rate"
          icon={Flame}
          tone={wastePct > 4 ? 'bad' : wastePct > 2 ? 'warn' : 'ok'}
          value={<>{fmtPct(wastePct)}</>}
          sub={<>{fmtKg(massBal.wasteKg)} measured waste</>}
        />
        <Stat
          label="Total Downtime"
          icon={Clock}
          tone={totalDowntimeMin > 180 ? 'bad' : totalDowntimeMin > 60 ? 'warn' : 'neutral'}
          value={<>{totalDowntimeMin} <span className="t-sm font-normal text-[var(--text-2)]">min</span></>}
          sub={<>{downCount} machine down · {belowCount} below rate</>}
        />
      </KpiStrip>

      {/* Machine Breakdown Table */}
      <Panel
        title={`Machine Floor Status · ${shiftKind === 'day' ? 'Day Shift (07:00–19:00)' : 'Night Shift (19:00–07:00)'}`}
        sub={`${runningCount} running · ${unloggedCount} awaiting log · ${belowCount} below benchmark`}
      >
        <DataGrid
          rows={machines}
          columns={columns}
          rowKey={(r) => r.machine.id}
          empty={<Empty title="No machine records" hint="No machine activity recorded for this shift." />}
        />
      </Panel>

      {/* Mass Balance & Material Summary */}
      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="Material Balance & Yield" sub="Input resin vs finished goods vs waste">
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between py-2 border-b border-[var(--line)]">
              <span className="t-sm text-[var(--text-2)]">Raw Material Input</span>
              <span className="font-semibold mono">{fmtKg(massBal.kgIn)}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[var(--line)]">
              <span className="t-sm text-[var(--text-2)]">Finished Goods Output</span>
              <span className="font-semibold text-[var(--ok)] mono">{fmtKg(massBal.kgOut)}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[var(--line)]">
              <span className="t-sm text-[var(--text-2)]">Measured Scrap / Waste</span>
              <span className="font-semibold text-[var(--bad)] mono">{fmtKg(massBal.wasteKg)}</span>
            </div>
            <div className="flex items-center justify-between pt-2">
              <span className="t-sm font-semibold">Yield Status</span>
              <Badge tone={massBal.state === 'balanced' ? 'ok' : massBal.state === 'explainable' ? 'warn' : 'bad'}>
                {massBal.state === 'balanced' ? 'Balanced (Within tolerance)' : massBal.state === 'explainable' ? 'Loss explainable' : 'Discrepancy detected'}
              </Badge>
            </div>
          </div>
        </Panel>

        <Panel title="Output by Product Type" sub="Breakdown of counted goods produced this shift">
          <div className="space-y-3 pt-1">
            {outputs.length === 0 ? (
              <div className="text-[var(--text-3)] t-sm py-4 text-center">No production recorded yet.</div>
            ) : (
              outputs.map((o) => (
                <div key={o.product?.id ?? 'misc'} className="flex items-center justify-between py-2 border-b border-[var(--line)] last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: o.product?.colour ?? 'var(--brand)' }} />
                    <span className="font-medium t-sm">{o.product?.internalName ?? 'General'}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold mono">{fmtNum(o.units)} units</span>
                    <span className="t-xs text-[var(--text-3)] block mono">{fmtKg(o.kg)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
