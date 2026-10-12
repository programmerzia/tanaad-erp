import { useMemo, useState } from 'react';
import { Users, Download, Printer, UserCheck, UserX, Wallet } from 'lucide-react';
import type { ShiftKind } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite } from '@/app/hooks';
import { attendanceFor, headcount, headcountBySector, lastWorkingDays, rosterFor, shiftId } from '@/data/selectors';
import { fmtDay, fmtDayShort, fmtUGX } from '@/data/format';
import { Avatar, Badge, Button, DataGrid, Empty, KpiStrip, Panel, Stat, cn, type Column } from '@/components/ui';
import { downloadCsv } from '@/features/cash/categories';

export function AttendanceReport() {
  const s = useStore();
  const site = useSite();
  const [day, setDay] = useState(s.today);
  const [shiftKind, setShiftKind] = useState<ShiftKind>('day');

  const days = useMemo(() => lastWorkingDays(site.id, s.today, 7), [site.id, s.today]);
  const currentShId = shiftId(site.id, day, shiftKind);
  const attList = useMemo(() => attendanceFor(s, currentShId), [s, currentShId]);
  const roster = useMemo(() => rosterFor(s, site.id), [s, site.id]);
  const sectors = useMemo(() => headcountBySector(s, site.id, day), [s, site.id, day]);

  // Combine roster and attendance
  const rows = useMemo(() => {
    return roster.map((r) => {
      const att = attList.find((a) => a.personId === r.person.id);
      const isCasual = r.engagement?.type === 'casual';
      const dailyWage = r.engagement?.rate ?? (isCasual ? 15000 : 25000);
      const status = att ? att.status : 'unmarked';
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
    }).sort((a, b) => a.sector.localeCompare(b.sector) || a.person.fullName.localeCompare(b.person.fullName));
  }, [roster, attList]);

  const presentCount = rows.filter((r) => r.status === 'present').length;
  const halfCount = rows.filter((r) => r.status === 'half').length;
  const absentCount = rows.filter((r) => r.status === 'absent').length;
  const unmarkedCount = rows.filter((r) => r.status === 'unmarked').length;

  const casualRows = rows.filter((r) => r.isCasual);
  const casualPresent = casualRows.filter((r) => r.status === 'present' || r.status === 'half').length;
  const totalCasualWagesDue = casualRows.reduce((t, r) => t + r.wageDue, 0);

  const handleExport = () => {
    const headers = ['Worker Name', 'Sector', 'Engagement', 'Status Today', 'Overtime (hrs)', 'Daily Rate (UGX)', 'Wage Due (UGX)'];
    const exportRows = rows.map((r) => [
      r.person.fullName,
      r.sector,
      r.engagement?.type ?? 'permanent',
      r.status,
      r.overtime,
      r.dailyWage,
      r.wageDue,
    ]);
    downloadCsv(`attendance-report-${site.id}-${day}`, headers, exportRows);
    s.toast({ kind: 'ok', title: 'Attendance report exported as CSV' });
  };

  type WorkerRow = (typeof rows)[number];
  const columns: Column<WorkerRow>[] = [
    {
      key: 'name',
      header: 'Worker Name',
      sticky: true,
      sort: (r) => r.person.fullName,
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={r.person.fullName} seed={r.person.avatarSeed} size={32} />
          <div>
            <div className="font-semibold text-[14px] leading-tight">{r.person.fullName}</div>
            <div className="t-xs text-[var(--text-3)]">{r.person.phoneMomo || 'No phone'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'sector',
      header: 'Department',
      sort: (r) => r.sector,
      cell: (r) => <span className="font-medium text-[var(--text-2)]">{r.sector}</span>,
    },
    {
      key: 'type',
      header: 'Engagement',
      cell: (r) => (
        <Badge tone={r.isCasual ? 'warn' : 'neutral'}>
          {r.isCasual ? 'Casual worker' : 'Permanent staff'}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Shift Status',
      sort: (r) => r.status,
      cell: (r) => {
        if (r.status === 'present') return <Badge tone="ok" dot>Present (Full day)</Badge>;
        if (r.status === 'half') return <Badge tone="warn" dot>Half day</Badge>;
        if (r.status === 'absent') return <Badge tone="bad" dot>Absent</Badge>;
        return <Badge tone="neutral">Not marked yet</Badge>;
      },
    },
    {
      key: 'overtime',
      header: 'Overtime',
      align: 'right',
      mono: true,
      cell: (r) => (r.overtime > 0 ? <span className="text-[var(--warn)] font-medium">+{r.overtime} hrs</span> : <span className="text-[var(--text-4)]">—</span>),
    },
    {
      key: 'wage',
      header: 'Daily Pay Due',
      align: 'right',
      mono: true,
      cell: (r) => (
        r.isCasual ? (
          <div>
            <span className="font-bold text-[14px]">{fmtUGX(r.wageDue)}</span>
            <span className="t-xs text-[var(--text-3)] block">rate: {fmtUGX(r.dailyWage)}</span>
          </div>
        ) : (
          <span className="t-xs text-[var(--text-3)]">Monthly payroll</span>
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
            <Users className="size-3.5 text-[var(--brand)]" />
            {site.name} · Workforce & Payroll Register
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)] mt-0.5">
            Worker Attendance & Daily Payroll Report
          </h1>
          <p className="t-sm text-[var(--text-2)] mt-0.5">
            Shift roll-call attendance, department coverage and casual wage settlement.
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
          label="Present On Shift"
          icon={UserCheck}
          tone="ok"
          value={<>{presentCount} <span className="t-sm font-normal text-[var(--text-2)]">workers</span></>}
          sub={<>{halfCount} on half day · {unmarkedCount} pending</>}
        />
        <Stat
          label="Absent Workers"
          icon={UserX}
          tone={absentCount > 5 ? 'bad' : absentCount > 0 ? 'warn' : 'ok'}
          value={<>{absentCount} <span className="t-sm font-normal text-[var(--text-2)]">absent</span></>}
          sub={`Out of ${rows.length} total staff`}
        />
        <Stat
          label="Casual Labor Today"
          icon={Users}
          tone="neutral"
          value={<>{casualPresent} <span className="t-sm font-normal text-[var(--text-2)]">on floor</span></>}
          sub={`${casualRows.length} total casuals registered`}
        />
        <Stat
          label="Casual Payroll Due"
          icon={Wallet}
          tone="neutral"
          value={<>{fmtUGX(totalCasualWagesDue)}</>}
          sub="For cash settlement at end of day"
        />
      </KpiStrip>

      {/* Sector Breakdown */}
      <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-3">
        {sectors.map((sec) => (
          <div key={sec.sector} className="surface p-3 rounded-lg border border-[var(--line)] flex items-center justify-between">
            <div>
              <div className="t-xs text-[var(--text-3)] font-medium">{sec.sector}</div>
              <div className="text-lg font-bold mt-0.5">{sec.count} <span className="t-xs font-normal text-[var(--text-2)]">present</span></div>
            </div>
            <div className="size-2 rounded-full bg-[var(--brand)]" />
          </div>
        ))}
      </div>

      {/* Roll Call Table */}
      <Panel
        title={`Workforce Roll-Call Register · ${rows.length} Workers`}
        sub={`${presentCount} present · ${halfCount} half-day · ${absentCount} absent`}
      >
        <DataGrid
          rows={rows}
          columns={columns}
          rowKey={(r) => r.person.id}
          empty={<Empty title="No worker records" hint="No workers found for this site." />}
        />
      </Panel>
    </div>
  );
}
