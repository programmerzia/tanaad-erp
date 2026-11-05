import { useMemo, useState } from 'react';
import { Truck, Download, Printer, Scale, Package, AlertTriangle, Search, CheckCircle2, ShieldAlert, ShieldCheck, FileText, X, Check, KeyRound } from 'lucide-react';
import { useStore } from '@/data/store';
import { useSite } from '@/app/hooks';
import { lastWorkingDays } from '@/data/selectors';
import { fmtDay, fmtDayShort, fmtKg, fmtNum } from '@/data/format';
import { Badge, Button, DataGrid, Empty, KpiStrip, Panel, Sheet, Stat, cn, type Column } from '@/components/ui';
import { downloadCsv } from '@/features/cash/categories';

export function DispatchReport() {
  const s = useStore();
  const site = useSite();
  const [range, setRange] = useState<'all' | 'last7' | 'today'>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pass' | 'hold'>('all');
  const [destinationFilter, setDestinationFilter] = useState<string>('all');

  // Selected Dispatch for Weighbridge Gate Pass Modal
  const [selectedDispatch, setSelectedDispatch] = useState<any | null>(null);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [managerPin, setManagerPin] = useState('');
  const [overrideReason, setOverrideReason] = useState('Wet heavy canvas tarpaulin after rain');

  const days7 = useMemo(() => lastWorkingDays(site.id, s.today, 7), [site.id, s.today]);

  const allDispatches = useMemo(() => {
    return s.dispatches
      .filter((d) => {
        if (d.siteId !== site.id) return false;
        const dDate = d.createdAt.slice(0, 10);
        if (range === 'today') return dDate === s.today;
        if (range === 'last7') return days7.includes(dDate);
        return true;
      })
      .map((d) => {
        const order = s.orders.find((o) => o.id === d.orderId);
        const client = s.clients.find((c) => c.id === order?.clientId);
        const bundlesCount = d.scannedLabelIds.length;
        const totalBundlesOrdered = order?.lines.reduce((t, l) => t + l.bundles, 0) ?? bundlesCount;
        const gateKg = d.gateKg;
        const expectedKg = d.expectedKg;
        const varianceKg = gateKg ? gateKg - expectedKg : null;
        const variancePct = gateKg && expectedKg > 0 ? ((gateKg - expectedKg) / expectedKg) * 100 : null;
        return {
          d,
          order,
          clientName: client?.name ?? 'Direct Commercial Order',
          destination: client?.country ?? 'Uganda',
          bundlesCount,
          totalBundlesOrdered,
          expectedKg,
          gateKg,
          varianceKg,
          variancePct,
          gateStatus: d.gateStatus,
        };
      })
      .sort((a, b) => b.d.createdAt.localeCompare(a.d.createdAt));
  }, [s, site.id, range, days7]);

  // Filtered dispatches
  const dispatches = useMemo(() => {
    return allDispatches.filter((r) => {
      if (statusFilter === 'pass' && r.gateStatus !== 'pass' && r.gateStatus !== 'overridden') return false;
      if (statusFilter === 'hold' && r.gateStatus !== 'hold') return false;
      if (destinationFilter !== 'all' && r.destination !== destinationFilter) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const dn = r.d.deliveryNoteNo.toLowerCase();
      const client = r.clientName.toLowerCase();
      const plate = (r.d.vehicle ?? '').toLowerCase();
      const driver = (r.d.driver ?? '').toLowerCase();
      return dn.includes(q) || client.includes(q) || plate.includes(q) || driver.includes(q);
    });
  }, [allDispatches, statusFilter, destinationFilter, search]);

  const destinationsList = useMemo(() => {
    const set = new Set(allDispatches.map((r) => r.destination));
    return Array.from(set).sort();
  }, [allDispatches]);

  const totalLoads = allDispatches.length;
  const totalBundles = allDispatches.reduce((t, d) => t + d.bundlesCount, 0);
  const totalWeightKg = allDispatches.reduce((t, d) => t + (d.gateKg ?? d.expectedKg), 0);
  const holdsCount = allDispatches.filter((d) => d.gateStatus === 'hold').length;
  const clearedCount = allDispatches.filter((d) => d.gateStatus === 'pass' || d.gateStatus === 'overridden').length;

  const handleExport = () => {
    const headers = ['Delivery Note', 'Client', 'Destination Country', 'Vehicle Plate', 'Driver Name', 'Bundles Scanned', 'Bundles Ordered', 'Expected Mass (kg)', 'Gate Scale Mass (kg)', 'Variance %', 'Gate Status'];
    const exportRows = allDispatches.map((r) => [
      r.d.deliveryNoteNo,
      r.clientName,
      r.destination,
      r.d.vehicle,
      r.d.driver,
      r.bundlesCount,
      r.totalBundlesOrdered,
      r.expectedKg,
      r.gateKg ?? 'Unweighed',
      r.variancePct !== null ? `${r.variancePct.toFixed(2)}%` : '—',
      r.gateStatus,
    ]);
    downloadCsv(`weighbridge-dispatch-log-${site.id}-${range}`, headers, exportRows);
    s.toast({ kind: 'ok', title: 'Weighbridge dispatch log exported to CSV' });
  };

  const handleAuthorizeOverride = () => {
    if (managerPin !== '1234') {
      s.toast({ kind: 'warn', title: 'Invalid Manager PIN. Default demo PIN is 1234.' });
      return;
    }

    if (!selectedDispatch) return;

    s.overrideGate(selectedDispatch.d.id, managerPin, overrideReason);
    s.toast({
      kind: 'ok',
      title: 'Gate barrier cleared via Manager Override',
      detail: `${selectedDispatch.d.vehicle} authorized to depart compound.`,
    });

    setOverrideModalOpen(false);
    setSelectedDispatch((prev: any) => prev ? { ...prev, gateStatus: 'overridden' } : null);
  };

  type DispatchRow = (typeof allDispatches)[number];
  const columns: Column<DispatchRow>[] = [
    {
      key: 'dn',
      header: 'Delivery Note #',
      sticky: true,
      cell: (r) => (
        <div>
          <span className="font-mono font-bold text-[13px] text-slate-900">{r.d.deliveryNoteNo}</span>
          <span className="text-[11px] text-slate-400 font-mono block">
            {r.d.createdAt.slice(0, 10)} · {r.d.createdAt.slice(11, 16)}
          </span>
        </div>
      ),
    },
    {
      key: 'client',
      header: 'Consignee / Client',
      cell: (r) => (
        <div>
          <div className="font-semibold text-xs sm:text-sm text-slate-900 leading-tight">{r.clientName}</div>
          <div className="text-[11px] text-slate-500 font-medium mt-0.5">{r.destination}</div>
        </div>
      ),
    },
    {
      key: 'lorry',
      header: 'Vehicle & Driver',
      cell: (r) => (
        <div>
          <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">
            {r.d.vehicle || 'UBD 412X'}
          </span>
          <span className="text-[11px] text-slate-500 block mt-0.5">{r.d.driver || 'Moses Kigozi'}</span>
        </div>
      ),
    },
    {
      key: 'bundles',
      header: 'Physical Bundles',
      align: 'right',
      mono: true,
      cell: (r) => (
        <div>
          <span className="font-mono font-bold text-slate-900 text-xs sm:text-sm">
            {fmtNum(r.bundlesCount)}
          </span>
          <span className="text-[11px] text-slate-400 block font-mono">of {fmtNum(r.totalBundlesOrdered)} bdl</span>
        </div>
      ),
    },
    {
      key: 'expected',
      header: 'Expected Mass',
      align: 'right',
      mono: true,
      cell: (r) => <span className="font-mono text-slate-600 text-xs">{fmtKg(r.expectedKg)}</span>,
    },
    {
      key: 'gateKg',
      header: 'Weighbridge Net',
      align: 'right',
      mono: true,
      cell: (r) => (
        <span className="font-mono font-bold text-slate-900 text-xs sm:text-sm">
          {r.gateKg ? fmtKg(r.gateKg) : <span className="text-slate-400 font-normal">Unweighed</span>}
        </span>
      ),
    },
    {
      key: 'variance',
      header: 'Scale Variance',
      align: 'right',
      mono: true,
      cell: (r) => {
        if (r.variancePct === null) return <span className="text-slate-400">—</span>;
        const isSafe = Math.abs(r.variancePct) <= 1.0;
        return (
          <span
            className={cn(
              'font-mono text-xs font-semibold px-2 py-0.5 rounded border',
              isSafe
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            )}
          >
            {r.variancePct >= 0 ? `+${r.variancePct.toFixed(2)}%` : `${r.variancePct.toFixed(2)}%`}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Gate Clearance',
      cell: (r) => {
        if (r.gateStatus === 'hold') {
          return (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
              <ShieldAlert className="size-3 text-rose-600" />
              HELD · RISK
            </span>
          );
        }
        if (r.gateStatus === 'overridden') {
          return (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
              <ShieldCheck className="size-3 text-amber-600" />
              OVERRIDE
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="size-3 text-emerald-600" />
            CLEARED
          </span>
        );
      },
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      cell: (r) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedDispatch(r);
          }}
          className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
        >
          Gate Pass
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Official Factory Gate Security Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-semibold tracking-wider text-slate-500 uppercase">
              <span className="size-2 rounded-full bg-emerald-500" />
              TANAAD LOGISTICS & GATE SECURITY · {site.legalName}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-1">
              Weighbridge Scale & Gate Security Clearance
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Anti-theft scale integration, barcode bundle verification, and cross-border export clearance.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 text-xs font-medium">
              <button
                onClick={() => setRange('today')}
                className={cn('px-2.5 py-1 rounded-md transition-colors', range === 'today' ? 'bg-white font-semibold text-slate-900 shadow-2xs' : 'text-slate-600')}
              >
                Today
              </button>
              <button
                onClick={() => setRange('last7')}
                className={cn('px-2.5 py-1 rounded-md transition-colors', range === 'last7' ? 'bg-white font-semibold text-slate-900 shadow-2xs' : 'text-slate-600')}
              >
                Last 7 Days
              </button>
              <button
                onClick={() => setRange('all')}
                className={cn('px-2.5 py-1 rounded-md transition-colors', range === 'all' ? 'bg-white font-semibold text-slate-900 shadow-2xs' : 'text-slate-600')}
              >
                All Dispatches
              </button>
            </div>

            <Button size="sm" variant="secondary" icon={Download} onClick={handleExport}>
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Logistics KPI Strip */}
      <KpiStrip className="grid-cols-2 md:grid-cols-4">
        <Stat
          label="Total Lorries Dispatched"
          icon={Truck}
          tone="ok"
          value={<>{totalLoads} <span className="text-xs font-normal text-slate-500 font-sans">loads</span></>}
          sub="Kampala, Gulu, Kigali & Juba shipments"
        />
        <Stat
          label="Bundles / Sacks Cleared"
          icon={Package}
          tone="neutral"
          value={<>{fmtNum(totalBundles)} <span className="text-xs font-normal text-slate-500 font-sans">bundles</span></>}
          sub="100% physically scanned at loading bay"
        />
        <Stat
          label="Weighbridge Net Mass"
          icon={Scale}
          tone="neutral"
          value={<>{fmtKg(totalWeightKg)}</>}
          sub="Gross minus empty tare verification"
        />
        <Stat
          label="Gate Security Clearance"
          icon={ShieldCheck}
          tone={holdsCount > 0 ? 'bad' : 'ok'}
          value={<>{clearedCount} <span className="text-xs font-normal text-slate-500 font-sans">cleared</span></>}
          sub={holdsCount > 0 ? `${holdsCount} lorry on security hold (>1% mismatch)` : 'Zero active security holds'}
        />
      </KpiStrip>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search delivery note, client, vehicle plate (e.g. UBD...), or driver..."
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
          {/* Status Filter */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                statusFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600'
              )}
            >
              All Status ({allDispatches.length})
            </button>
            <button
              onClick={() => setStatusFilter('pass')}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                statusFilter === 'pass' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600'
              )}
            >
              Cleared ({clearedCount})
            </button>
            <button
              onClick={() => setStatusFilter('hold')}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                statusFilter === 'hold' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600'
              )}
            >
              Held ({holdsCount})
            </button>
          </div>

          {/* Destination Filter */}
          <select
            value={destinationFilter}
            onChange={(e) => setDestinationFilter(e.target.value)}
            className="text-xs font-medium rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 outline-none"
          >
            <option value="all">All Destinations ({destinationsList.length})</option>
            {destinationsList.map((dest) => (
              <option key={dest} value={dest}>{dest}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Weighbridge Dispatches Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <DataGrid
          rows={dispatches}
          columns={columns}
          rowKey={(r) => r.d.id}
          onRowClick={(r) => setSelectedDispatch(r)}
          empty={<Empty title="No dispatches found" hint="Try adjusting your date range or filter." />}
        />
      </div>

      {/* Official Factory Gate Pass & Weighbridge Certificate Modal */}
      {selectedDispatch && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full p-6 text-slate-900">
            <div className="border-b pb-3 mb-4 flex items-start justify-between">
              <div>
                <div className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">TANAAD INDUSTRIAL GROUP</div>
                <h2 className="text-base font-bold text-slate-900">FACTORY GATE PASS & WEIGHBRIDGE CERTIFICATE</h2>
                <div className="text-xs text-slate-600 font-mono mt-0.5">
                  Delivery Note: {selectedDispatch.d.deliveryNoteNo} · Date: {selectedDispatch.d.createdAt.slice(0, 10)}
                </div>
              </div>
              <button onClick={() => setSelectedDispatch(null)} className="text-slate-400 hover:text-slate-600">
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500 block">Vehicle Registration:</span>
                  <span className="font-mono font-bold text-sm text-slate-900">{selectedDispatch.d.vehicle || 'UBD 412X'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Driver Name:</span>
                  <span className="font-semibold text-sm text-slate-900">{selectedDispatch.d.driver || 'Moses Kigozi'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Consignee:</span>
                  <span className="font-semibold text-slate-800">{selectedDispatch.clientName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Destination:</span>
                  <span className="font-semibold text-slate-800">{selectedDispatch.destination}</span>
                </div>
              </div>

              {/* Weight Breakdown */}
              <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="text-xs font-bold text-slate-700 uppercase">Weighbridge Scale Readings</div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Calculated Expected Net:</span>
                  <span className="font-mono font-semibold">{fmtKg(selectedDispatch.expectedKg)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Gate Scale Measured Net:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {selectedDispatch.gateKg ? fmtKg(selectedDispatch.gateKg) : 'Not weighed on scale'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 bg-slate-50 px-2 rounded">
                  <span className="font-semibold">Variance %:</span>
                  <span
                    className={cn(
                      'font-mono font-bold',
                      selectedDispatch.variancePct !== null && Math.abs(selectedDispatch.variancePct) <= 1.0
                        ? 'text-emerald-700'
                        : 'text-rose-700'
                    )}
                  >
                    {selectedDispatch.variancePct !== null
                      ? `${selectedDispatch.variancePct.toFixed(2)}%`
                      : '—'}
                  </span>
                </div>
              </div>

              {/* Clearance Status Stamp */}
              <div
                className={cn(
                  'p-3.5 rounded-lg border text-center font-bold tracking-wider text-xs uppercase',
                  selectedDispatch.gateStatus === 'hold'
                    ? 'bg-rose-50 border-rose-300 text-rose-800'
                    : selectedDispatch.gateStatus === 'overridden'
                      ? 'bg-amber-50 border-amber-300 text-amber-800'
                      : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                )}
              >
                {selectedDispatch.gateStatus === 'hold'
                  ? 'SECURITY GATE HOLD — LORRY PROHIBITED FROM LEAVING COMPOUND'
                  : selectedDispatch.gateStatus === 'overridden'
                    ? 'SECURITY OVERRIDE AUTHORIZED BY PLANT MANAGER'
                    : 'OFFICIAL GATE CLEARANCE APPROVED — PROCEED TO EXIT'}
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Weighbridge Operator</div>
                  <div className="h-8 border-b border-slate-300 mt-1" />
                  <div className="text-[10px] text-slate-600 mt-0.5">Signature & Stamp</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Gate Security Guard</div>
                  <div className="h-8 border-b border-slate-300 mt-1" />
                  <div className="text-[10px] text-slate-600 mt-0.5">Physical Count Verified</div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              {selectedDispatch.gateStatus === 'hold' && (
                <Button
                  size="sm"
                  variant="primary"
                  icon={KeyRound}
                  onClick={() => setOverrideModalOpen(true)}
                >
                  Manager PIN Override
                </Button>
              )}
              <Button size="sm" variant="secondary" icon={Printer} onClick={() => window.print()}>
                Print Gate Pass
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Manager Override PIN Dialog */}
      {overrideModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5 text-slate-900">
            <h3 className="text-base font-bold text-slate-900">Manager Security Override</h3>
            <p className="text-xs text-slate-500 mt-1">
              Authorizes vehicle release despite weight variance. Action is permanently logged on the CEO Audit Feed.
            </p>

            <div className="space-y-3 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Enter Manager PIN (Demo: 1234)</label>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="PIN"
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value)}
                  className="w-full text-center text-lg font-mono font-bold tracking-widest px-3 py-1.5 rounded-lg border border-slate-300 outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Reason for Override</label>
                <select
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs"
                >
                  <option value="Wet heavy canvas tarpaulin after rain">Wet heavy canvas tarpaulin after rain</option>
                  <option value="Customer authorized additional sample bundles">Customer authorized additional sample bundles</option>
                  <option value="Scale recalibration difference">Scale recalibration difference</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setOverrideModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={handleAuthorizeOverride}>
                Confirm Release
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
