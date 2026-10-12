import { useMemo, useState } from 'react';
import { Truck, Download, Printer, Scale, Package, AlertTriangle } from 'lucide-react';
import { useStore } from '@/data/store';
import { useSite } from '@/app/hooks';
import { lastWorkingDays } from '@/data/selectors';
import { fmtDay, fmtDayShort, fmtKg, fmtNum } from '@/data/format';
import { Badge, Button, DataGrid, Empty, KpiStrip, Panel, Stat, type Column } from '@/components/ui';
import { downloadCsv } from '@/features/cash/categories';

export function DispatchReport() {
  const s = useStore();
  const site = useSite();
  const [range, setRange] = useState<'all' | 'last7' | 'today'>('all');

  const days7 = useMemo(() => lastWorkingDays(site.id, s.today, 7), [site.id, s.today]);

  const dispatches = useMemo(() => {
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
          clientName: client?.name ?? 'Direct Dispatch',
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

  const totalLoads = dispatches.length;
  const totalBundles = dispatches.reduce((t, d) => t + d.bundlesCount, 0);
  const totalWeightKg = dispatches.reduce((t, d) => t + (d.gateKg ?? d.expectedKg), 0);
  const holdsCount = dispatches.filter((d) => d.gateStatus === 'hold').length;

  const handleExport = () => {
    const headers = ['Delivery Note', 'Client', 'Destination', 'Vehicle Plate', 'Driver', 'Bundles Scanned', 'Bundles Ordered', 'Expected Weight (kg)', 'Gate Scale (kg)', 'Variance %', 'Gate Status'];
    const exportRows = dispatches.map((r) => [
      r.d.deliveryNoteNo,
      r.clientName,
      r.destination,
      r.d.vehicle,
      r.d.driver,
      r.bundlesCount,
      r.totalBundlesOrdered,
      r.expectedKg,
      r.gateKg ?? 'Not weighed',
      r.variancePct !== null ? `${r.variancePct.toFixed(1)}%` : '—',
      r.gateStatus,
    ]);
    downloadCsv(`dispatch-report-${site.id}-${range}`, headers, exportRows);
    s.toast({ kind: 'ok', title: 'Dispatch report exported as CSV' });
  };

  type DispatchRow = (typeof dispatches)[number];
  const columns: Column<DispatchRow>[] = [
    {
      key: 'dn',
      header: 'Delivery Note',
      sticky: true,
      cell: (r) => (
        <div>
          <span className="font-bold text-[14px] mono">{r.d.deliveryNoteNo}</span>
          <span className="t-xs text-[var(--text-3)] block">{r.d.createdAt.slice(0, 10)} {r.d.createdAt.slice(11, 16)}</span>
        </div>
      ),
    },
    {
      key: 'client',
      header: 'Client & Destination',
      cell: (r) => (
        <div>
          <span className="font-semibold text-[14px]">{r.clientName}</span>
          <span className="t-xs text-[var(--text-3)] block">{r.destination}</span>
        </div>
      ),
    },
    {
      key: 'lorry',
      header: 'Vehicle & Driver',
      cell: (r) => (
        <div>
          <span className="font-mono font-medium">{r.d.vehicle}</span>
          <span className="t-xs text-[var(--text-3)] block">{r.d.driver}</span>
        </div>
      ),
    },
    {
      key: 'bundles',
      header: 'Bundles Loaded',
      align: 'right',
      mono: true,
      cell: (r) => (
        <div>
          <span className="font-bold">{r.bundlesCount} / {r.totalBundlesOrdered}</span>
          <span className="t-xs text-[var(--text-3)] block">bundles</span>
        </div>
      ),
    },
    {
      key: 'weight',
      header: 'Expected vs Gate Scale',
      align: 'right',
      mono: true,
      cell: (r) => (
        <div>
          <span className="font-bold">{r.gateKg ? fmtKg(r.gateKg) : 'Not weighed yet'}</span>
          <span className="t-xs text-[var(--text-3)] block">expected: {fmtKg(r.expectedKg)}</span>
        </div>
      ),
    },
    {
      key: 'variance',
      header: 'Weight Variance',
      align: 'right',
      mono: true,
      cell: (r) => {
        if (r.variancePct === null) return <span className="text-[var(--text-4)]">—</span>;
        const absVar = Math.abs(r.variancePct);
        const tone = absVar <= 2 ? 'text-[var(--ok)] font-medium' : 'text-[var(--bad)] font-bold';
        return (
          <span className={tone}>
            {r.variancePct > 0 ? `+${r.variancePct.toFixed(1)}%` : `${r.variancePct.toFixed(1)}%`}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Gate Clearance',
      cell: (r) => {
        if (r.gateStatus === 'pass') return <Badge tone="ok" dot>Cleared & Passed</Badge>;
        if (r.gateStatus === 'hold') return <Badge tone="bad" dot>Held at gate (Weight short)</Badge>;
        if (r.gateStatus === 'overridden') return <Badge tone="warn" dot>Manager override</Badge>;
        return <Badge tone="neutral">Loading in progress</Badge>;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
        <div>
          <div className="flex items-center gap-2 t-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">
            <Truck className="size-3.5 text-[var(--brand)]" />
            {site.name} · Logistics & Weighbridge Verification
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)] mt-0.5">
            Dispatch & Weighbridge Report
          </h1>
          <p className="t-sm text-[var(--text-2)] mt-0.5">
            Lorry loading logs, bundle counts, gate scale weights, and security holds.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Range Selector */}
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as 'all' | 'last7' | 'today')}
            className="ctl text-sm font-medium rounded-lg border border-[var(--line-2)] bg-[var(--surface)] px-3 py-1.5"
          >
            <option value="all">All recent loads ({s.dispatches.filter((d) => d.siteId === site.id).length})</option>
            <option value="last7">Last 7 working days</option>
            <option value="today">Today only</option>
          </select>

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
          label="Total Loads Dispatched"
          icon={Truck}
          tone="ok"
          value={<>{totalLoads} <span className="t-sm font-normal text-[var(--text-2)]">lorries</span></>}
          sub="Dispatches on record"
        />
        <Stat
          label="Total Bundles Loaded"
          icon={Package}
          tone="neutral"
          value={<>{fmtNum(totalBundles)} <span className="t-sm font-normal text-[var(--text-2)]">bundles</span></>}
          sub="Verified by barcode scanner"
        />
        <Stat
          label="Gross Scale Weight"
          icon={Scale}
          tone="neutral"
          value={<>{fmtKg(totalWeightKg)}</>}
          sub="Recorded on gate weighbridge"
        />
        <Stat
          label="Gate Holds & Alerts"
          icon={AlertTriangle}
          tone={holdsCount > 0 ? 'bad' : 'ok'}
          value={<>{holdsCount} <span className="t-sm font-normal text-[var(--text-2)]">held</span></>}
          sub={holdsCount > 0 ? 'Held due to weight discrepancy' : 'All lorries cleared without issue'}
        />
      </KpiStrip>

      {/* Dispatches Table */}
      <Panel
        title={`Lorry Loading & Weighbridge Log · ${dispatches.length} Dispatches`}
        sub="Scale weight must match expected bundles within ±2% tolerance before gate opens"
      >
        <DataGrid
          rows={dispatches}
          columns={columns}
          rowKey={(r) => r.d.id}
          empty={<Empty title="No dispatches" hint="No dispatches recorded for this date." />}
        />
      </Panel>
    </div>
  );
}
