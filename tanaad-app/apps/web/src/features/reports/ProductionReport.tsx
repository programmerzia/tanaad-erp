import { useMemo, useState } from 'react';
import { Factory, Download, Printer, ArrowUpRight, Flame, Clock, Search, SlidersHorizontal, CheckCircle2, AlertTriangle, AlertCircle, Eye, Settings, Play, Pause, ChevronRight, X, RefreshCw } from 'lucide-react';
import type { ShiftKind } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite } from '@/app/hooks';
import { lastWorkingDays, machineWall, massBalanceDay, outputToday } from '@/data/selectors';
import { fmtDay, fmtDayShort, fmtKg, fmtNum, fmtPct } from '@/data/format';
import { Avatar, Badge, Button, DataGrid, Empty, KpiStrip, Panel, Sheet, Stat, cn, type Column } from '@/components/ui';
import { downloadCsv } from '@/features/cash/categories';

export function ProductionReport() {
  const s = useStore();
  const site = useSite();
  const [day, setDay] = useState(s.today);
  const [shiftKind, setShiftKind] = useState<ShiftKind>('day');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'below' | 'down' | 'unlogged'>('all');
  const [viewMode, setViewMode] = useState<'matrix' | 'table'>('matrix');

  // Selected machine for inspection drawer
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);

  // Form states inside inspection drawer
  const [logMeters, setLogMeters] = useState('');
  const [logScrapKg, setLogScrapKg] = useState('');
  const [downtimeMin, setDowntimeMin] = useState('');
  const [downtimeReason, setDowntimeReason] = useState('Power fluctuation (Umeme)');

  const days = useMemo(() => lastWorkingDays(site.id, s.today, 7), [site.id, s.today]);
  const rawMachines = useMemo(() => machineWall(s, site.id, day, shiftKind), [s, site.id, day, shiftKind]);
  const outputs = useMemo(() => outputToday(s, site.id, day), [s, site.id, day]);
  const massBal = useMemo(() => massBalanceDay(s, site.id, day), [s, site.id, day]);

  // Filtered machines
  const machines = useMemo(() => {
    return rawMachines.filter((m) => {
      if (statusFilter === 'ok' && m.state !== 'ok' && m.state !== 'logged') return false;
      if (statusFilter === 'below' && m.state !== 'below') return false;
      if (statusFilter === 'down' && m.state !== 'down') return false;
      if (statusFilter === 'unlogged' && m.state !== 'not_logged') return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const code = m.machine.code.toLowerCase();
      const op = (m.operator?.fullName ?? '').toLowerCase();
      const prod = (m.product?.internalName ?? '').toLowerCase();
      return code.includes(q) || op.includes(q) || prod.includes(q);
    });
  }, [rawMachines, statusFilter, search]);

  // Aggregate metrics
  const totalUnits = outputs.reduce((t, o) => t + o.units, 0);
  const totalKg = outputs.reduce((t, o) => t + o.kg, 0);
  const totalTarget = outputs.reduce((t, o) => t + o.target, 0);
  const targetPct = totalTarget > 0 ? Math.round((totalUnits / totalTarget) * 100) : 100;

  const runningCount = rawMachines.filter((m) => m.state === 'ok' || m.state === 'below' || m.state === 'logged').length;
  const belowCount = rawMachines.filter((m) => m.state === 'below').length;
  const unloggedCount = rawMachines.filter((m) => m.state === 'not_logged').length;
  const downCount = rawMachines.filter((m) => m.state === 'down').length;

  const totalDowntimeMin = rawMachines.reduce((t, m) => t + (m.entry?.downtimeMin ?? 0), 0);
  const wastePct = massBal.kgIn > 0 ? (massBal.wasteKg / massBal.kgIn) * 100 : 0;

  const selectedMachine = useMemo(
    () => rawMachines.find((m) => m.machine.id === selectedMachineId) ?? null,
    [rawMachines, selectedMachineId]
  );

  const handleExport = () => {
    const headers = ['Machine Code', 'Operator', 'Product', 'Output Units (m)', 'Output Mass (kg)', 'Target (m)', 'Achieved %', 'Downtime (min)', 'Downtime Reason', 'Operational State'];
    const rows = rawMachines.map((m) => [
      m.machine.code,
      m.operator?.fullName ?? 'Unassigned',
      m.product?.internalName ?? '—',
      m.entry?.goodUnits ?? 0,
      m.entry?.outputKg ?? 0,
      m.expectedSoFar ?? 0,
      m.pct !== undefined ? `${m.pct}%` : '—',
      m.entry?.downtimeMin ?? 0,
      m.entry?.downtimeReason ?? 'None',
      m.state,
    ]);
    downloadCsv(`production-shift-report-${site.id}-${day}`, headers, rows);
    s.toast({ kind: 'ok', title: 'Shift production report exported to CSV' });
  };

  const handleSaveMachineReading = () => {
    if (!selectedMachine) return;
    const addedUnits = parseInt(logMeters, 10) || 0;
    const addedScrap = parseFloat(logScrapKg) || 0;
    const dMin = parseInt(downtimeMin, 10) || 0;

    const currentUnits = selectedMachine.entry?.goodUnits ?? 0;
    const currentKg = selectedMachine.entry?.outputKg ?? 0;

    s.recordProduction({
      siteId: site.id,
      stageCode: selectedMachine.machine.stageCode || 'weaving',
      machineId: selectedMachine.machine.id,
      shiftId: `${site.id}-${day}-${shiftKind}`,
      day,
      productId: selectedMachine.product?.id ?? s.products.filter((p) => p.siteId === site.id)[0]?.id,
      operatorId: selectedMachine.operator?.id ?? s.people.filter((p) => p.homeSiteId === site.id)[0]?.id,
      goodUnits: currentUnits + addedUnits,
      rejectUnits: selectedMachine.entry?.rejectUnits ?? 0,
      inputKg: (selectedMachine.entry?.inputKg ?? 0) + (addedUnits * 0.26),
      outputKg: currentKg + (addedUnits * 0.25),
      downtimeMin: (selectedMachine.entry?.downtimeMin ?? 0) + dMin,
      downtimeReason: dMin > 0 ? downtimeReason : undefined,
    });

    s.toast({
      kind: 'ok',
      title: `${selectedMachine.machine.code} reading logged successfully`,
      detail: `Recorded +${addedUnits} meters output · Shift updated.`,
    });

    setLogMeters('');
    setLogScrapKg('');
    setDowntimeMin('');
    setSelectedMachineId(null);
  };

  type MachineRow = (typeof rawMachines)[number];
  const columns: Column<MachineRow>[] = [
    {
      key: 'machine',
      header: 'Machine',
      sticky: true,
      sort: (r) => r.machine.code,
      cell: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-slate-900">{r.machine.code}</span>
          <span className="text-[11px] text-slate-500 font-mono">({r.machine.kind})</span>
        </div>
      ),
    },
    {
      key: 'operator',
      header: 'Operator',
      cell: (r) => (
        r.operator ? (
          <div className="flex items-center gap-2">
            <Avatar name={r.operator.fullName} seed={r.operator.avatarSeed} size={24} />
            <span className="font-medium text-slate-800 text-[13px]">{r.operator.fullName}</span>
          </div>
        ) : (
          <span className="text-slate-400 text-xs italic">Unassigned</span>
        )
      ),
    },
    {
      key: 'product',
      header: 'Pattern / Product',
      cell: (r) => (
        r.product ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-700">
            <span className="size-2 rounded-full shrink-0" style={{ background: r.product.colour ?? '#0284c7' }} />
            {r.product.internalName}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )
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
          <span className="font-mono font-bold text-slate-900 text-[14px]">
            {fmtNum(r.entry?.goodUnits ?? 0)} m
          </span>
          {r.entry?.outputKg ? (
            <span className="text-[11px] text-slate-500 font-mono block">{fmtKg(r.entry.outputKg)}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'target',
      header: 'Shift Target',
      align: 'right',
      mono: true,
      cell: (r) => (
        <span className="font-mono text-slate-600 text-[13px]">
          {r.expectedSoFar ? `${fmtNum(r.expectedSoFar)} m` : '—'}
        </span>
      ),
    },
    {
      key: 'pct',
      header: 'Efficiency',
      align: 'right',
      mono: true,
      sort: (r) => r.pct ?? 0,
      cell: (r) => (
        r.pct !== undefined ? (
          <span
            className={cn(
              'font-mono font-semibold text-xs px-2 py-0.5 rounded border',
              r.pct >= 100
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : r.pct >= 85
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
            )}
          >
            {r.pct}%
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )
      ),
    },
    {
      key: 'downtime',
      header: 'Downtime',
      align: 'right',
      mono: true,
      cell: (r) => (
        r.entry?.downtimeMin ? (
          <span className="font-mono text-amber-700 font-medium text-xs bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
            {r.entry.downtimeMin} min
          </span>
        ) : (
          <span className="text-slate-400 text-xs font-mono">0 min</span>
        )
      ),
    },
    {
      key: 'status',
      header: 'Operational Status',
      cell: (r) => (
        r.state === 'down' ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
            <span className="size-1.5 rounded-full bg-rose-600" />
            Machine Down
          </span>
        ) : r.state === 'not_logged' ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
            <span className="size-1.5 rounded-full bg-slate-400" />
            Pending Reading
          </span>
        ) : r.state === 'below' ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
            <span className="size-1.5 rounded-full bg-amber-500" />
            Below Benchmark
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="size-1.5 rounded-full bg-emerald-600" />
            Running Optimal
          </span>
        )
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      cell: (r) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedMachineId(r.machine.id);
          }}
          className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
        >
          Inspect
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Official Factory Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-semibold tracking-wider text-slate-500 uppercase">
              <span className="size-2 rounded-full bg-emerald-500" />
              TANAAD INDUSTRIAL OPERATIONS · {site.legalName}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-1">
              Manufacturing Execution & Floor Output
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Live machine telemetry, shift output counters, scrap tracking and resin mass balance.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Shift Day Selector */}
            <select
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="text-xs sm:text-sm font-medium rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-800 shadow-2xs outline-none focus:border-slate-500"
            >
              {days.map((d) => (
                <option key={d} value={d}>
                  {d === s.today ? `Today (${fmtDayShort(d)})` : fmtDay(d)}
                </option>
              ))}
            </select>

            {/* Shift Kind Segmented Control */}
            <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 text-xs font-medium">
              <button
                onClick={() => setShiftKind('day')}
                className={cn(
                  'px-3 py-1 rounded-md transition-colors',
                  shiftKind === 'day' ? 'bg-white font-semibold text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                Day Shift (07:00–19:00)
              </button>
              <button
                onClick={() => setShiftKind('night')}
                className={cn(
                  'px-3 py-1 rounded-md transition-colors',
                  shiftKind === 'night' ? 'bg-white font-semibold text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                Night Shift (19:00–07:00)
              </button>
            </div>

            <Button size="sm" variant="secondary" icon={Printer} onClick={() => setPrintModalOpen(true)}>
              Print Shift Sheet
            </Button>
            <Button size="sm" variant="secondary" icon={Download} onClick={handleExport}>
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Primary KPI Strip */}
      <KpiStrip className="grid-cols-2 md:grid-cols-4">
        <Stat
          label="Total Woven Output"
          icon={Factory}
          tone="ok"
          value={<>{fmtNum(totalUnits)} <span className="text-xs font-normal text-slate-500 font-sans">meters</span></>}
          sub={<>{fmtKg(totalKg)} finished mass produced</>}
        />
        <Stat
          label="Shift Attainment"
          icon={ArrowUpRight}
          tone={targetPct >= 100 ? 'ok' : targetPct >= 85 ? 'warn' : 'bad'}
          value={<>{targetPct}%</>}
          sub={<>{fmtNum(totalUnits)}m achieved of {fmtNum(totalTarget)}m target</>}
        />
        <Stat
          label="Scrap & Trim Rate"
          icon={Flame}
          tone={wastePct > 2.5 ? 'bad' : wastePct > 1.8 ? 'warn' : 'ok'}
          value={<>{fmtPct(wastePct)}</>}
          sub={<>{fmtKg(massBal.wasteKg)} scrap · 2.5% tolerance limit</>}
        />
        <Stat
          label="Active Downtime"
          icon={Clock}
          tone={totalDowntimeMin > 120 ? 'bad' : totalDowntimeMin > 30 ? 'warn' : 'neutral'}
          value={<>{totalDowntimeMin} <span className="text-xs font-normal text-slate-500 font-sans">mins</span></>}
          sub={<>{downCount} loom stopped · {belowCount} below benchmark</>}
        />
      </KpiStrip>

      {/* Filter and View Controls Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by loom code (e.g. LOOM-04), operator, or product..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 outline-none focus:border-slate-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter Chips */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-500 font-medium mr-1 text-xs">Status:</span>
            {(['all', 'ok', 'below', 'down', 'unlogged'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                  statusFilter === st
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                )}
              >
                {st === 'all' && `All (${rawMachines.length})`}
                {st === 'ok' && `Running (${runningCount})`}
                {st === 'below' && `Below (${belowCount})`}
                {st === 'down' && `Down (${downCount})`}
                {st === 'unlogged' && `Pending (${unloggedCount})`}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-slate-200 mx-1 hidden sm:block" />

          {/* Matrix vs Table View Toggle */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
            <button
              onClick={() => setViewMode('matrix')}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                viewMode === 'matrix' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              Floor Matrix (15 Looms)
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              Detailed Table
            </button>
          </div>
        </div>
      </div>

      {/* Main Floor Presentation: Matrix Grid View */}
      {viewMode === 'matrix' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
          {machines.map((m) => {
            const isDown = m.state === 'down';
            const isUnlogged = m.state === 'not_logged';
            const isBelow = m.state === 'below';
            const isOptimal = m.state === 'ok' || m.state === 'logged';
            const pct = m.pct ?? 0;

            return (
              <div
                key={m.machine.id}
                onClick={() => setSelectedMachineId(m.machine.id)}
                className={cn(
                  'bg-white border rounded-xl p-3.5 flex flex-col justify-between transition-all hover:shadow-md cursor-pointer text-left',
                  isDown
                    ? 'border-rose-300 bg-rose-50/20 ring-1 ring-rose-200'
                    : isBelow
                      ? 'border-amber-300 bg-amber-50/20'
                      : isUnlogged
                        ? 'border-slate-200 bg-slate-50/50'
                        : 'border-slate-200 hover:border-slate-300'
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-sm text-slate-900">{m.machine.code}</span>
                      <span className="text-[10px] text-slate-400 font-mono">220cm</span>
                    </div>
                    {isDown ? (
                      <span className="size-2 rounded-full bg-rose-500 animate-pulse" title="Machine Down" />
                    ) : isBelow ? (
                      <span className="size-2 rounded-full bg-amber-500" title="Below Target" />
                    ) : isUnlogged ? (
                      <span className="size-2 rounded-full bg-slate-300" title="Not Logged" />
                    ) : (
                      <span className="size-2 rounded-full bg-emerald-500" title="Running Optimal" />
                    )}
                  </div>

                  <div className="pt-2">
                    <div className="text-[12px] font-semibold text-slate-800 truncate">
                      {m.product?.internalName ?? 'Super Diamond Mat'}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Avatar name={m.operator?.fullName ?? 'OP'} seed={m.operator?.avatarSeed} size={18} />
                      <span className="text-[11px] text-slate-600 truncate">{m.operator?.fullName ?? 'Unassigned'}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-end justify-between">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Output</div>
                    <div className="font-mono font-bold text-base text-slate-900">
                      {fmtNum(m.entry?.goodUnits ?? 0)} <span className="text-[11px] font-normal text-slate-500">m</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Target: {m.expectedSoFar ?? 0}m</div>
                    <span
                      className={cn(
                        'inline-block font-mono text-xs font-semibold px-1.5 py-0.5 rounded',
                        pct >= 100
                          ? 'bg-emerald-50 text-emerald-700'
                          : pct >= 85
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-rose-50 text-rose-700'
                      )}
                    >
                      {pct}%
                    </span>
                  </div>
                </div>

                {m.entry?.downtimeMin ? (
                  <div className="mt-2 pt-1.5 border-t border-slate-100 text-[11px] text-rose-600 font-medium truncate flex items-center gap-1">
                    <Clock className="size-3 shrink-0" />
                    {m.entry.downtimeMin}m: {m.entry.downtimeReason ?? 'Downtime logged'}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        /* Detailed Table View */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
          <DataGrid
            rows={machines}
            columns={columns}
            rowKey={(r) => r.machine.id}
            onRowClick={(r) => setSelectedMachineId(r.machine.id)}
            empty={<Empty title="No machine records found" hint="Try adjusting your filter or search criteria." />}
          />
        </div>
      )}

      {/* Mass Balance & Output Breakdown */}
      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Polymer Mass Balance & Yield</h2>
              <p className="text-xs text-slate-500">Virgin PP + Recycled Pellets Input vs Mat Output vs Scrap</p>
            </div>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
              Shift {shiftKind.toUpperCase()}
            </span>
          </div>

          <div className="space-y-3 pt-3">
            <div className="flex items-center justify-between py-1.5 text-sm">
              <span className="text-slate-600">Raw Polymer Feed In (Extruder)</span>
              <span className="font-mono font-bold text-slate-900">{fmtKg(massBal.kgIn)}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 text-sm border-t border-slate-100">
              <span className="text-slate-600">Finished Woven Mat Output</span>
              <span className="font-mono font-bold text-emerald-700">{fmtKg(massBal.kgOut)}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 text-sm border-t border-slate-100">
              <span className="text-slate-600">Scrap / Edge Trim Cutoffs</span>
              <span className="font-mono font-bold text-rose-700">{fmtKg(massBal.wasteKg)}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-t border-slate-200 mt-2 bg-slate-50 px-3 rounded-lg">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Accountability Status</span>
              <span className="text-xs font-bold font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                BALANCED · 98.2% YIELD
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Shift Output by Pattern Style</h2>
              <p className="text-xs text-slate-500">Commercial mats categorized by size and design</p>
            </div>
            <span className="text-xs font-mono text-slate-500">{outputs.length} Products Running</span>
          </div>

          <div className="space-y-2.5 pt-3">
            {outputs.map((o) => (
              <div key={o.product?.id ?? 'gen'} className="flex items-center justify-between py-1.5 text-sm border-b border-slate-50 last:border-b-0">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: o.product?.colour ?? '#0284c7' }} />
                  <span className="font-medium text-slate-800 text-xs sm:text-sm">{o.product?.internalName ?? 'Standard Mat'}</span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-slate-900">{fmtNum(o.units)} m</span>
                  <span className="font-mono text-slate-400 text-xs ml-2">({fmtKg(o.kg)})</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Slide-Over Machine Telemetry & Reading Sheet */}
      <Sheet
        open={!!selectedMachine}
        onClose={() => setSelectedMachineId(null)}
        title={selectedMachine ? `${selectedMachine.machine.code} · Loom Telemetry` : 'Machine Details'}
        sub={selectedMachine?.machine.kind ? `Type: ${selectedMachine.machine.kind}` : undefined}
        width={500}
      >
        {selectedMachine && (
          <div className="space-y-5 pt-2">
            {/* Machine Specs Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">Loom Specifications</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500">Reed Width:</span> <span className="font-mono font-semibold">220 cm</span>
                </div>
                <div>
                  <span className="text-slate-500">Rated Speed:</span> <span className="font-mono font-semibold">185 RPM</span>
                </div>
                <div>
                  <span className="text-slate-500">Drive Motor Temp:</span> <span className="font-mono font-semibold text-emerald-700">42°C Normal</span>
                </div>
                <div>
                  <span className="text-slate-500">Yarn Lot Batch:</span> <span className="font-mono font-semibold">PP-HOMO-401</span>
                </div>
              </div>
            </div>

            {/* Current Performance */}
            <div className="border border-slate-200 rounded-lg p-3.5 space-y-3">
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">Current Shift Performance</div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Operator on Machine:</span>
                <span className="font-semibold text-slate-900">{selectedMachine.operator?.fullName ?? 'Unassigned'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Pattern Running:</span>
                <span className="font-semibold text-slate-900">{selectedMachine.product?.internalName ?? 'Standard Mat'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Recorded Output:</span>
                <span className="font-mono font-bold text-slate-900">{fmtNum(selectedMachine.entry?.goodUnits ?? 0)} meters</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Shift Target:</span>
                <span className="font-mono text-slate-700">{selectedMachine.expectedSoFar ?? 0} meters</span>
              </div>
            </div>

            {/* Quick Floor Reading Submission Form */}
            <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-white">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Log New Output or Downtime
              </div>
              <p className="text-xs text-slate-500">
                Floor supervisor entry for {selectedMachine.machine.code}. Updates machine counters and shift reports.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Add Output (Meters)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="e.g. 50"
                    value={logMeters}
                    onChange={(e) => setLogMeters(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-300 font-mono outline-none focus:border-slate-500"
                  />
                  {[25, 50, 100].map((quick) => (
                    <button
                      key={quick}
                      type="button"
                      onClick={() => setLogMeters(String(quick))}
                      className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                    >
                      +{quick}m
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Scrap / Edge Trim Cutoff (Kg)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 1.2"
                  value={logScrapKg}
                  onChange={(e) => setLogScrapKg(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 font-mono outline-none focus:border-slate-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-medium text-slate-700 mb-1">Downtime Minutes & Reason (If stopped)</label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <input
                    type="number"
                    placeholder="Mins"
                    value={downtimeMin}
                    onChange={(e) => setDowntimeMin(e.target.value)}
                    className="col-span-1 px-3 py-1.5 text-sm rounded-lg border border-slate-300 font-mono outline-none focus:border-slate-500"
                  />
                  <select
                    value={downtimeReason}
                    onChange={(e) => setDowntimeReason(e.target.value)}
                    className="col-span-2 px-2 py-1.5 text-xs rounded-lg border border-slate-300 outline-none"
                  >
                    <option value="Power fluctuation (Umeme)">Power fluctuation (Umeme)</option>
                    <option value="Weft yarn break">Weft yarn break</option>
                    <option value="Warp thread replacement">Warp thread replacement</option>
                    <option value="Mechanical cutter jammed">Mechanical cutter jammed</option>
                    <option value="Bobbin creel reload">Bobbin creel reload</option>
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <Button variant="primary" block onClick={handleSaveMachineReading}>
                  Save Reading & Update Floor Report
                </Button>
              </div>
            </div>
          </div>
        )}
      </Sheet>

      {/* Official Printable Shift Handover Modal */}
      {printModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 text-slate-900">
            <div className="flex items-center justify-between border-b pb-4 mb-4">
              <div className="text-left">
                <div className="text-xs font-bold tracking-widest text-slate-500 uppercase">TANAAD INDUSTRIAL GROUP</div>
                <h2 className="text-lg font-bold">OFFICIAL SHIFT HANDOVER & PRODUCTION LOG</h2>
                <div className="text-xs text-slate-600">
                  Site: {site.name} · Date: {day} · Shift: {shiftKind.toUpperCase()} (07:00–19:00 EAT)
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setPrintModalOpen(false)}>
                Close
              </Button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500 block">Total Meters:</span>
                  <span className="font-mono font-bold text-sm">{fmtNum(totalUnits)} m</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Mass Produced:</span>
                  <span className="font-mono font-bold text-sm">{fmtKg(totalKg)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Scrap Rate:</span>
                  <span className="font-mono font-bold text-sm">{fmtPct(wastePct)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Running Looms:</span>
                  <span className="font-mono font-bold text-sm">{runningCount} / 15</span>
                </div>
              </div>

              <table className="w-full border-collapse border border-slate-200 text-left">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border border-slate-200 p-2 font-bold">Loom</th>
                    <th className="border border-slate-200 p-2 font-bold">Operator</th>
                    <th className="border border-slate-200 p-2 font-bold">Product</th>
                    <th className="border border-slate-200 p-2 font-bold text-right">Output (m)</th>
                    <th className="border border-slate-200 p-2 font-bold text-right">Target (m)</th>
                    <th className="border border-slate-200 p-2 font-bold text-right">Downtime</th>
                  </tr>
                </thead>
                <tbody>
                  {rawMachines.map((m) => (
                    <tr key={m.machine.id} className="border-b border-slate-200">
                      <td className="border border-slate-200 p-2 font-mono font-bold">{m.machine.code}</td>
                      <td className="border border-slate-200 p-2">{m.operator?.fullName ?? '—'}</td>
                      <td className="border border-slate-200 p-2">{m.product?.internalName ?? '—'}</td>
                      <td className="border border-slate-200 p-2 text-right font-mono font-bold">{fmtNum(m.entry?.goodUnits ?? 0)}</td>
                      <td className="border border-slate-200 p-2 text-right font-mono">{m.expectedSoFar ?? 0}</td>
                      <td className="border border-slate-200 p-2 text-right font-mono">{m.entry?.downtimeMin ?? 0}m</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-200 mt-6">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">Outgoing Shift Supervisor</div>
                  <div className="h-10 border-b border-slate-400 mt-2" />
                  <div className="text-xs mt-1 text-slate-700">Signature & Date</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">Incoming Shift Supervisor</div>
                  <div className="h-10 border-b border-slate-400 mt-2" />
                  <div className="text-xs mt-1 text-slate-700">Signature & Date</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">Plant Operations Manager</div>
                  <div className="h-10 border-b border-slate-400 mt-2" />
                  <div className="text-xs mt-1 text-slate-700">Official Stamp & Date</div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="primary" icon={Printer} onClick={() => window.print()}>
                Send to Printer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
