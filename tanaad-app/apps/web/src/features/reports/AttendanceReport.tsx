import { useMemo, useState } from 'react';
import { Users, Download, Printer, UserCheck, UserX, Wallet, Search, CheckCircle2, Clock, Phone, AlertCircle, X, ChevronRight, Check } from 'lucide-react';
import type { AttendanceStatus, ShiftKind } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite } from '@/app/hooks';
import { attendanceFor, headcount, headcountBySector, lastWorkingDays, rosterFor, shiftId } from '@/data/selectors';
import { fmtDay, fmtDayShort, fmtUGX } from '@/data/format';
import { Avatar, Badge, Button, DataGrid, Empty, KpiStrip, Panel, Sheet, Stat, cn, type Column } from '@/components/ui';
import { downloadCsv } from '@/features/cash/categories';

export function AttendanceReport() {
  const s = useStore();
  const site = useSite();
  const [day, setDay] = useState(s.today);
  const [shiftKind, setShiftKind] = useState<ShiftKind>('day');
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'half' | 'absent' | 'unmarked'>('all');
  const [engagementFilter, setEngagementFilter] = useState<'all' | 'casual' | 'permanent'>('all');

  // Modals & Drawers
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [payoutDrawerOpen, setPayoutDrawerOpen] = useState(false);
  const [printMusterOpen, setPrintMusterOpen] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<'cash' | 'momo'>('cash');

  const days = useMemo(() => lastWorkingDays(site.id, s.today, 7), [site.id, s.today]);
  const currentShId = shiftId(site.id, day, shiftKind);
  const attList = useMemo(() => attendanceFor(s, currentShId), [s, currentShId]);
  const roster = useMemo(() => rosterFor(s, site.id), [s, site.id]);

  // Combine roster and attendance
  const allRows = useMemo(() => {
    return roster.map((r) => {
      const att = attList.find((a) => a.personId === r.person.id);
      const isCasual = r.engagement?.type === 'casual';
      const dailyWage = r.engagement?.rate ?? (isCasual ? 12000 : 25000);
      const status: AttendanceStatus | 'unmarked' = att ? att.status : 'unmarked';
      const wageDue = status === 'present' ? dailyWage : status === 'half' ? Math.round(dailyWage / 2) : 0;
      return {
        person: r.person,
        engagement: r.engagement,
        sector: r.person.sector,
        isCasual,
        status,
        overtime: att?.overtimeHours ?? 0,
        dailyWage,
        wageDue,
      };
    });
  }, [roster, attList]);

  // Filtered rows
  const rows = useMemo(() => {
    return allRows.filter((r) => {
      if (sectorFilter !== 'all' && r.sector !== sectorFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (engagementFilter === 'casual' && !r.isCasual) return false;
      if (engagementFilter === 'permanent' && r.isCasual) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const name = r.person.fullName.toLowerCase();
      const phone = (r.person.phoneMomo ?? '').toLowerCase();
      const sec = r.sector.toLowerCase();
      return name.includes(q) || phone.includes(q) || sec.includes(q);
    });
  }, [allRows, sectorFilter, statusFilter, engagementFilter, search]);

  const sectorsList = useMemo(() => {
    const set = new Set(allRows.map((r) => r.sector));
    return Array.from(set).sort();
  }, [allRows]);

  const presentCount = allRows.filter((r) => r.status === 'present').length;
  const halfCount = allRows.filter((r) => r.status === 'half').length;
  const absentCount = allRows.filter((r) => r.status === 'absent').length;
  const unmarkedCount = allRows.filter((r) => r.status === 'unmarked').length;

  const casualRows = allRows.filter((r) => r.isCasual);
  const casualPresent = casualRows.filter((r) => r.status === 'present' || r.status === 'half').length;
  const totalCasualWagesDue = casualRows.reduce((t, r) => t + r.wageDue, 0);

  const selectedWorker = useMemo(
    () => allRows.find((r) => r.person.id === selectedWorkerId) ?? null,
    [allRows, selectedWorkerId]
  );

  const handleUpdateStatus = (personId: string, newStatus: AttendanceStatus) => {
    s.markAttendance({
      shiftId: currentShId,
      personId,
      siteId: site.id,
      status: newStatus,
    });
    s.toast({
      kind: 'ok',
      title: 'Attendance updated',
      detail: `Worker marked as ${newStatus.toUpperCase()}`,
    });
  };

  const handleExport = () => {
    const headers = ['Full Name', 'Department / Sector', 'Engagement Type', 'Phone (MoMo)', 'Status Today', 'Overtime (hrs)', 'Daily Rate (UGX)', 'Wage Due Today (UGX)'];
    const exportRows = allRows.map((r) => [
      r.person.fullName,
      r.sector,
      r.isCasual ? 'Casual' : 'Permanent',
      r.person.phoneMomo || 'None',
      r.status,
      r.overtime,
      r.dailyWage,
      r.wageDue,
    ]);
    downloadCsv(`attendance-muster-roll-${site.id}-${day}`, headers, exportRows);
    s.toast({ kind: 'ok', title: 'Muster roll exported as CSV' });
  };

  const handleConfirmDisbursement = () => {
    s.addCashEntry({
      siteId: site.id,
      day,
      direction: 'out',
      category: 'wages',
      amount: totalCasualWagesDue,
      payee: `Daily Casual Payroll (${casualPresent} workers)`,
      note: `Shift ${shiftKind.toUpperCase()} wage settlement via ${payoutMethod === 'cash' ? 'Cash Envelopes' : 'MTN/Airtel MoMo'}`,
      subcategory: `PAY-CASUAL-${day.replace(/-/g, '')}`,
      hasReceiptPhoto: false,
    });
    s.toast({
      kind: 'ok',
      title: 'Casual payroll disbursed & recorded in Cash Book',
      detail: `UGX ${fmtUGX(totalCasualWagesDue)} signed off.`,
    });
    setPayoutDrawerOpen(false);
  };

  type WorkerRow = (typeof allRows)[number];
  const columns: Column<WorkerRow>[] = [
    {
      key: 'name',
      header: 'Worker Profile',
      sticky: true,
      sort: (r) => r.person.fullName,
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r.person.fullName} seed={r.person.avatarSeed} size={30} />
          <div>
            <div className="font-semibold text-[13px] text-slate-900 leading-tight">{r.person.fullName}</div>
            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
              <Phone className="size-3 text-slate-400" />
              {r.person.phoneMomo || 'No registered mobile'}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'sector',
      header: 'Department / Line',
      sort: (r) => r.sector,
      cell: (r) => (
        <span className="text-xs font-medium text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
          {r.sector}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Engagement',
      cell: (r) => (
        <span
          className={cn(
            'text-[11px] font-semibold px-2 py-0.5 rounded border',
            r.isCasual
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-blue-50 text-blue-800 border-blue-200'
          )}
        >
          {r.isCasual ? 'Daily Casual' : 'Permanent Staff'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Today’s Attendance',
      cell: (r) => {
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleUpdateStatus(r.person.id, 'present');
              }}
              title="Mark Full Day Present"
              className={cn(
                'text-[11px] font-semibold px-2 py-0.5 rounded border transition-colors',
                r.status === 'present'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              )}
            >
              Present
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleUpdateStatus(r.person.id, 'half');
              }}
              title="Mark Half Day (4 hrs)"
              className={cn(
                'text-[11px] font-semibold px-2 py-0.5 rounded border transition-colors',
                r.status === 'half'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              )}
            >
              Half
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleUpdateStatus(r.person.id, 'absent');
              }}
              title="Mark Absent"
              className={cn(
                'text-[11px] font-semibold px-2 py-0.5 rounded border transition-colors',
                r.status === 'absent'
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              )}
            >
              Absent
            </button>
          </div>
        );
      },
    },
    {
      key: 'wage',
      header: 'Daily Rate',
      align: 'right',
      mono: true,
      cell: (r) => (
        <span className="font-mono text-slate-600 text-xs">
          {fmtUGX(r.dailyWage)}
        </span>
      ),
    },
    {
      key: 'due',
      header: 'Payable Today',
      align: 'right',
      mono: true,
      sort: (r) => r.wageDue,
      cell: (r) => (
        <div>
          <span
            className={cn(
              'font-mono font-bold text-[13px]',
              r.wageDue > 0 ? 'text-slate-900' : 'text-slate-400'
            )}
          >
            {fmtUGX(r.wageDue)}
          </span>
          {r.isCasual && r.wageDue > 0 ? (
            <span className="text-[10px] text-amber-700 block font-medium">Casual Payout</span>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Official Factory Labor Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-semibold tracking-wider text-slate-500 uppercase">
              <span className="size-2 rounded-full bg-blue-500" />
              TANAAD WORKFORCE AUDIT · {site.legalName}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-1">
              Factory Attendance & Daily Wage Settlement
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Automated labor muster roll, anti-ghost worker verification, and casual shift payroll.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
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

            <Button size="sm" variant="secondary" icon={Printer} onClick={() => setPrintMusterOpen(true)}>
              Print Muster Roll
            </Button>
            <Button size="sm" variant="secondary" icon={Download} onClick={handleExport}>
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Labor KPI Strip */}
      <KpiStrip className="grid-cols-2 md:grid-cols-4">
        <Stat
          label="Total On Duty Today"
          icon={UserCheck}
          tone="ok"
          value={<>{presentCount + halfCount} <span className="text-xs font-normal text-slate-500 font-sans">workers</span></>}
          sub={<>{presentCount} full shift · {halfCount} half shift</>}
        />
        <Stat
          label="Recorded Absences"
          icon={UserX}
          tone={absentCount > 4 ? 'bad' : absentCount > 0 ? 'warn' : 'neutral'}
          value={<>{absentCount} <span className="text-xs font-normal text-slate-500 font-sans">absent</span></>}
          sub={<>{unmarkedCount} awaiting morning roll-call</>}
        />
        <Stat
          label="Active Casual Workers"
          icon={Users}
          tone="neutral"
          value={<>{casualPresent} <span className="text-xs font-normal text-slate-500 font-sans">casuals</span></>}
          sub={<>{casualRows.length} registered on shift roster</>}
        />
        <Stat
          label="Casual Payroll Due"
          icon={Wallet}
          tone="warn"
          value={<>{fmtUGX(totalCasualWagesDue)}</>}
          sub={<>Automated calculation for {casualPresent} workers</>}
        />
      </KpiStrip>

      {/* Filter and Search Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search worker name or phone (e.g. Ronald, 077...)"
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
          {/* Department Filter */}
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="text-xs font-medium rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 outline-none"
          >
            <option value="all">All Departments ({sectorsList.length})</option>
            {sectorsList.map((sec) => (
              <option key={sec} value={sec}>{sec}</option>
            ))}
          </select>

          {/* Engagement Filter */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
            <button
              onClick={() => setEngagementFilter('all')}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                engagementFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600'
              )}
            >
              All Staff
            </button>
            <button
              onClick={() => setEngagementFilter('casual')}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                engagementFilter === 'casual' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600'
              )}
            >
              Casuals Only
            </button>
            <button
              onClick={() => setEngagementFilter('permanent')}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                engagementFilter === 'permanent' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600'
              )}
            >
              Permanent
            </button>
          </div>

          <div className="h-5 w-px bg-slate-200 mx-1 hidden sm:block" />

          {/* Settle Payroll Action Button */}
          <Button
            size="sm"
            variant="primary"
            icon={Wallet}
            onClick={() => setPayoutDrawerOpen(true)}
          >
            Settle Casual Wages
          </Button>
        </div>
      </div>

      {/* Main Roster DataGrid */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <DataGrid
          rows={rows}
          columns={columns}
          rowKey={(r) => r.person.id}
          onRowClick={(r) => setSelectedWorkerId(r.person.id)}
          empty={<Empty title="No workers match criteria" hint="Try clearing the search or department filter." />}
        />
      </div>

      {/* Casual Wage Disbursement Drawer */}
      <Sheet
        open={payoutDrawerOpen}
        onClose={() => setPayoutDrawerOpen(false)}
        title="Casual Wage Settlement Authorization"
        sub={`Daily sign-off for ${casualPresent} casual workers`}
        width={480}
      >
        <div className="space-y-4 pt-2">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="text-xs font-bold text-amber-800 uppercase tracking-wider">Payroll Summary</div>
            <div className="text-2xl font-mono font-bold text-slate-900 mt-1">
              UGX {fmtUGX(totalCasualWagesDue)}
            </div>
            <div className="text-xs text-amber-900 mt-0.5">
              Verified for {casualPresent} verified present workers today.
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
              Disbursement Channel
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPayoutMethod('cash')}
                className={cn(
                  'p-3 rounded-lg border text-left transition-colors',
                  payoutMethod === 'cash'
                    ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
                    : 'border-slate-200 hover:bg-slate-50'
                )}
              >
                <div className="font-semibold text-xs text-slate-900">Cash Envelopes</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Physical payout from cashier's safe</div>
              </button>
              <button
                type="button"
                onClick={() => setPayoutMethod('momo')}
                className={cn(
                  'p-3 rounded-lg border text-left transition-colors',
                  payoutMethod === 'momo'
                    ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
                    : 'border-slate-200 hover:bg-slate-50'
                )}
              >
                <div className="font-semibold text-xs text-slate-900">MTN / Airtel MoMo</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Export bulk list for telecom transfer</div>
              </button>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-3 space-y-2 max-h-56 overflow-y-auto">
            <div className="text-xs font-bold text-slate-700 uppercase">Payee Breakdown</div>
            {casualRows
              .filter((r) => r.wageDue > 0)
              .map((r) => (
                <div key={r.person.id} className="flex items-center justify-between py-1 text-xs border-b border-slate-100 last:border-b-0">
                  <span className="font-medium text-slate-800">{r.person.fullName}</span>
                  <span className="font-mono font-bold text-slate-900">{fmtUGX(r.wageDue)}</span>
                </div>
              ))}
          </div>

          <div className="pt-2">
            <Button variant="primary" block icon={Check} onClick={handleConfirmDisbursement}>
              Authorize Payout & Post to Cash Book
            </Button>
          </div>
        </div>
      </Sheet>

      {/* Official Printable Muster Roll */}
      {printMusterOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 text-slate-900">
            <div className="flex items-center justify-between border-b pb-4 mb-4">
              <div className="text-left">
                <div className="text-xs font-bold tracking-widest text-slate-500 uppercase">TANAAD INDUSTRIAL GROUP</div>
                <h2 className="text-lg font-bold">OFFICIAL DAILY LABOR MUSTER ROLL</h2>
                <div className="text-xs text-slate-600">
                  Facility: {site.name} · Date: {day} · Shift: {shiftKind.toUpperCase()}
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setPrintMusterOpen(false)}>
                Close
              </Button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500 block">Total Headcount:</span>
                  <span className="font-mono font-bold text-sm">{allRows.length} staff</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Present On Shift:</span>
                  <span className="font-mono font-bold text-sm text-emerald-700">{presentCount + halfCount}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Casuals On Shift:</span>
                  <span className="font-mono font-bold text-sm">{casualPresent}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Daily Payroll Due:</span>
                  <span className="font-mono font-bold text-sm text-amber-800">UGX {fmtUGX(totalCasualWagesDue)}</span>
                </div>
              </div>

              <table className="w-full border-collapse border border-slate-200 text-left">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border border-slate-200 p-2 font-bold">Name</th>
                    <th className="border border-slate-200 p-2 font-bold">Department</th>
                    <th className="border border-slate-200 p-2 font-bold">Type</th>
                    <th className="border border-slate-200 p-2 font-bold">Status</th>
                    <th className="border border-slate-200 p-2 font-bold text-right">Wage (UGX)</th>
                    <th className="border border-slate-200 p-2 font-bold text-center">Worker Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {allRows.map((r) => (
                    <tr key={r.person.id} className="border-b border-slate-200">
                      <td className="border border-slate-200 p-2 font-semibold">{r.person.fullName}</td>
                      <td className="border border-slate-200 p-2">{r.sector}</td>
                      <td className="border border-slate-200 p-2">{r.isCasual ? 'Casual' : 'Staff'}</td>
                      <td className="border border-slate-200 p-2 font-mono uppercase">{r.status}</td>
                      <td className="border border-slate-200 p-2 text-right font-mono font-bold">{fmtUGX(r.wageDue)}</td>
                      <td className="border border-slate-200 p-2 text-center text-slate-300">_________________</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-200 mt-6">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">Supervisor Handover Verification</div>
                  <div className="h-10 border-b border-slate-400 mt-2" />
                  <div className="text-xs mt-1 text-slate-700">Name & Signature</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">Factory Cashier Payout Stamp</div>
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
