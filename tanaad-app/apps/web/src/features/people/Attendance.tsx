import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Archive, CalendarCheck, CalendarClock, CheckCircle2, Clock, Download, EyeOff, ListChecks, Lock, Phone, RotateCcw, ShieldAlert, TrendingUp, UserX, Users } from 'lucide-react';
import type { Attendance as AttendanceRec, AttendanceStatus, Engagement, Person, ShiftKind } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useGo, useSite } from '@/app/hooks';
import { Avatar, Badge, Bar, Button, ChipGroup, DataGrid, Dialog, Empty, Kbd, Meter, Note, NumberPad, Panel, SearchInput, Select, Tabs, cn, useHotkey, useIsTouch, type Column } from '@/components/ui';
import { CountUp, Donut, LineChart } from '@/components/charts';
import { currentShiftKind, dailySeries, lastWorkingDays, rosterFor, shiftId } from '@/data/selectors';
import { fmtDay, fmtDayLong, fmtDayShort } from '@/data/format';
import { SITES } from '@/config/sites';
import { SITE_COLOR } from '@/config/siteIdentity';
import { ContractNote, EngTag, IconChip, MARK, MARKS, MarkDot, MasterEmpty, RenewDialog, STANDARD_DAY_HOURS, contractStateFor, dayValue, downloadCsv, useContractTerms, usePeopleRules } from './kit';

type RosterRow = ReturnType<typeof rosterFor>[number];
const CYCLE: Record<AttendanceStatus, AttendanceStatus> = { present: 'half', half: 'absent', absent: 'present' };
/** Status tints that read on the dark hero band. */
const ON_DARK = { present: '#4cc088', half: '#e9b04e', absent: '#ee7b6a', unmarked: 'rgb(255 255 255 / .24)' };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const say = (t: { kind: 'ok' | 'warn' | 'error' | 'info'; title: string; detail?: string }) => useStore.getState().toast(t);

/** The factory attendance sheet, digitised: six working days across, roster down, today editable from the keyboard. */
export function Attendance() {
  const s = useStore(); const site = useSite(); const go = useGo(); const touch = useIsTouch();
  const rules = usePeopleRules(); const terms = useContractTerms();
  const [kind, setKind] = useState<ShiftKind>(() => currentShiftKind());
  const [sector, setSector] = useState<string>('all');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'sheet' | 'archived'>('sheet');
  const [roll, setRoll] = useState(false);
  const [renewId, setRenewId] = useState<string | null>(null);
  const [otId, setOtId] = useState<string | null>(null);
  const [cur, setCur] = useState({ r: 0, c: 5 });
  const grid = useRef<HTMLDivElement>(null);

  const days = useMemo(() => lastWorkingDays(site.id, s.today, 6), [site.id, s.today]);
  const todayCol = days.indexOf(s.today);
  const todayShift = shiftId(site.id, s.today, kind);
  const att = useMemo(() => { const m = new Map<string, AttendanceRec>(); for (const a of s.attendance) m.set(`${a.shiftId}|${a.personId}`, a); return m; }, [s.attendance]);
  const recOf = (personId: string, day: string) => att.get(`${shiftId(site.id, day, kind)}|${personId}`);

  const all = useMemo(() => { const order = (x: string) => { const i = site.sectors.indexOf(x); return i < 0 ? 99 : i; }; return rosterFor(s, site.id).map((r) => ({ ...r, contractState: r.engagement?.type === 'contract' ? contractStateFor(r.engagement.endDate, s.today, rules.warningDays) : ('open' as const) })).sort((a, b) => order(a.person.sector) - order(b.person.sector) || a.person.fullName.localeCompare(b.person.fullName)); }, [s, site, rules.warningDays]);
  const roster = useMemo(() => all.filter((r) => sector === 'all' || r.person.sector === sector), [all, sector]);
  const needle = q.trim().toLowerCase();
  const rows = useMemo(() => (needle ? roster.filter((r) => r.person.fullName.toLowerCase().includes(needle)) : roster), [roster, needle]);
  const archived = s.people.filter((p) => p.homeSiteId === site.id && p.status === 'archived' && (!needle || p.fullName.toLowerCase().includes(needle)));
  const archivedTotal = s.people.filter((p) => p.homeSiteId === site.id && p.status === 'archived').length;

  const counts = useMemo(() => { const c = { present: 0, half: 0, absent: 0, unmarked: 0 }; for (const r of roster) { const st = recOf(r.person.id, s.today)?.status; if (st) c[st] += 1; else c.unmarked += 1; } return c; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [roster, att, kind, s.today]);
  const marked = roster.length - counts.unmarked;
  const unmarked = roster.filter((r) => r.contractState !== 'expired' && !recOf(r.person.id, s.today));
  const ending = all.filter((r) => r.engagement?.type === 'contract' && r.contractState !== 'open').sort((a, b) => (a.engagement?.endDate ?? '').localeCompare(b.engagement?.endDate ?? ''));
  const bySector = site.sectors.map((x) => { const g = all.filter((r) => r.person.sector === x); return { sector: x, total: g.length, on: g.filter((r) => { const st = recOf(r.person.id, s.today)?.status; return st === 'present' || st === 'half'; }).length }; }).filter((x) => x.total > 0);
  const dayTotals = days.map((d) => rows.reduce((t, r) => { const st = recOf(r.person.id, d)?.status; return t + (st === 'present' || st === 'half' ? 1 : 0); }, 0));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const trend = useMemo(() => dailySeries(s, site.id, lastWorkingDays(site.id, s.today, 7)), [s.attendance, site.id, s.today]);

  // Ghost-worker guard: one phone number on two active workers, or an active casual not seen for the site's absence limit (Settings → Rules).
  const ghosts = useMemo(() => {
    const active = s.people.filter((p) => p.status === 'active' && (p.homeSiteId === site.id || p.sharedSites.includes(site.id)));
    const byPhone = new Map<string, Person[]>(); for (const p of active) byPhone.set(p.phoneMomo, [...(byPhone.get(p.phoneMomo) ?? []), p]);
    const dupes = [...byPhone.values()].filter((g) => g.length > 1);
    const recent = lastWorkingDays(site.id, s.today, rules.absentDays); const recentShifts = new Set(s.shifts.filter((sh) => sh.siteId === site.id && recent.includes(sh.day)).map((sh) => sh.id));
    const seen = new Set(s.attendance.filter((a) => recentShifts.has(a.shiftId) && a.status !== 'absent').map((a) => a.personId));
    const unseen = rosterFor(s, site.id).filter((r) => r.engagement?.type === 'casual' && !r.isShared && r.person.joinedOn < recent[0] && !seen.has(r.person.id)).map((r) => r.person);
    return { dupes, unseen };
  }, [s, site.id, rules.absentDays]);

  /* ── marking ── */
  const mark = (row: RosterRow, status: AttendanceStatus, announce = true) => {
    if (row.contractState === 'expired') { say({ kind: 'warn', title: 'Contract has ended', detail: `Renew ${row.person.fullName.split(' ')[0]}'s contract before marking.` }); return false; }
    const prev = recOf(row.person.id, s.today);
    s.markAttendance({ shiftId: todayShift, personId: row.person.id, siteId: site.id, status, overtimeHours: status === 'absent' ? 0 : prev?.overtimeHours ?? 0 });
    if (announce) say({ kind: 'ok', title: `${row.person.fullName.split(' ')[0]}: ${MARK[status].label.toLowerCase()}`, detail: `${kind} shift, ${fmtDayShort(s.today)}` });
    return true;
  };
  const cycle = (row: RosterRow) => { const st = recOf(row.person.id, s.today)?.status; mark(row, st ? CYCLE[st] : 'present'); };
  const lockedTap = () => say({ kind: 'info', title: 'Past days are locked', detail: 'Ask the Site Manager to correct a past shift.' });
  const doRenew = (eng: Engagement, term: number) => { const name = s.people.find((p) => p.id === eng.personId)?.fullName; s.renewContract(eng.id, term); setRenewId(null); say({ kind: 'ok', title: `Contract renewed for ${term} days`, detail: name }); };
  const saveOt = (row: RosterRow, hours: number) => {
    const prev = recOf(row.person.id, s.today);
    s.markAttendance({ shiftId: todayShift, personId: row.person.id, siteId: site.id, status: !prev || prev.status === 'absent' ? 'present' : prev.status, overtimeHours: hours });
    setOtId(null); say({ kind: 'ok', title: hours ? `${hours} h overtime for ${row.person.fullName.split(' ')[0]}` : `Overtime cleared for ${row.person.fullName.split(' ')[0]}`, detail: `${kind} shift, ${fmtDayShort(s.today)}` });
  };

  /* ── keyboard cursor ── */
  const reveal = (r: number) => requestAnimationFrame(() => grid.current?.querySelector(`[data-r="${r}"]`)?.scrollIntoView({ block: 'nearest' }));
  const moveTo = (r: number, c: number = cur.c) => { const nr = clamp(r, 0, Math.max(0, rows.length - 1)); setCur({ r: nr, c: clamp(c, 0, days.length - 1) }); reveal(nr); };
  const curRow: RosterRow | undefined = rows[clamp(cur.r, 0, Math.max(0, rows.length - 1))];
  useEffect(() => { const i = rows.findIndex((r) => r.contractState !== 'expired' && !recOf(r.person.id, s.today)); setCur({ r: Math.max(0, i), c: todayCol >= 0 ? todayCol : days.length - 1 }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kind, sector, site.id, needle]);
  useEffect(() => { if (!touch) grid.current?.focus({ preventScroll: true }); }, [touch]);
  const keyMark = (status: AttendanceStatus) => { if (!curRow || todayCol < 0) return; if (mark(curRow, status, false)) moveTo(cur.r + 1, todayCol); };
  const activate = () => { if (!curRow) return; if (cur.c === todayCol) cycle(curRow); else lockedTap(); };
  const onGridKey = (e: ReactKeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input,select,textarea')) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'j') { e.preventDefault(); moveTo(cur.r + 1); }
    else if (k === 'ArrowUp' || k === 'k') { e.preventDefault(); moveTo(cur.r - 1); }
    else if (k === 'ArrowLeft') { e.preventDefault(); moveTo(cur.r, cur.c - 1); }
    else if (k === 'ArrowRight') { e.preventDefault(); moveTo(cur.r, cur.c + 1); }
    else if (k === 'Home') { e.preventDefault(); moveTo(0); }
    else if (k === 'End') { e.preventDefault(); moveTo(rows.length - 1); }
    else if ((k === 'Enter' || k === ' ') && !(e.target as HTMLElement).closest('button,a')) { e.preventDefault(); activate(); }
  };
  const jumpTo = (personId: string) => {
    setTab('sheet');
    const i = rows.findIndex((r) => r.person.id === personId);
    if (i >= 0) { moveTo(i, todayCol >= 0 ? todayCol : cur.c); grid.current?.focus({ preventScroll: true }); return; }
    setSector('all'); setQ('');
    setTimeout(() => { const j = all.findIndex((r) => r.person.id === personId); if (j >= 0) { setCur({ r: j, c: todayCol >= 0 ? todayCol : 0 }); reveal(j); grid.current?.focus({ preventScroll: true }); } }, 60);
  };
  const keysOn = tab === 'sheet' && !roll && !renewId && !otId;
  useHotkey('p', () => keyMark('present'), { label: 'Mark the active row present', enabled: keysOn });
  useHotkey('h', () => keyMark('half'), { label: 'Mark the active row half day', enabled: keysOn });
  useHotkey('a', () => keyMark('absent'), { label: 'Mark the active row absent', enabled: keysOn });
  useHotkey('o', () => { if (!curRow) return; if (curRow.contractState === 'expired') say({ kind: 'warn', title: 'Contract has ended', detail: 'Renew before adding overtime.' }); else setOtId(curRow.person.id); }, { label: 'Overtime hours for the active row', enabled: keysOn });

  const exportCsv = () => {
    const head = ['No', 'Name', 'ID number', 'Phone', 'Sector', 'Engagement', ...days.map((d) => fmtDay(d)), 'Days worked', 'OT hours today'];
    const body = rows.map((r, i) => [i + 1, r.person.fullName, r.person.idNumber, r.person.phoneMomo, r.person.sector, r.engagement?.type ?? '', ...days.map((d) => { const st = recOf(r.person.id, d)?.status; return st ? (st === 'half' ? '0.5' : MARK[st].short) : ''; }), days.reduce((t, d) => t + dayValue(recOf(r.person.id, d)?.status), 0), recOf(r.person.id, s.today)?.overtimeHours ?? 0]);
    const name = `${site.id}-attendance-${kind}-${s.today}.csv`;
    downloadCsv(name, [head, ...body, ['', 'On shift', '', '', '', '', ...dayTotals, '', '']]);
    say({ kind: 'ok', title: 'CSV downloaded', detail: name });
  };

  const renewRow = all.find((r) => r.person.id === renewId);
  const otRow = all.find((r) => r.person.id === otId);
  const shift = site.shifts.find((x) => x.kind === kind);
  const pct = roster.length ? Math.round((marked / roster.length) * 100) : 0;
  // Overtime cannot exceed what is left of the day after the shift itself (shift hours come from the site's shift table).
  const shiftHours = shift ? (((parseInt(shift.ends, 10) - parseInt(shift.starts, 10)) + 24) % 24 || 24) : 0;
  const maxOt = Math.max(1, 24 - shiftHours);
  const dayCls = (c: number) => (c < days.length - 3 ? 'max-sm:hidden' : 'max-sm:!w-10');

  const archivedCols: Column<Person>[] = [
    { key: 'n', header: 'Worker', sort: (p) => p.fullName, cell: (p) => <span className="inline-flex items-center gap-2"><Avatar name={p.fullName} seed={p.avatarSeed} size={22} className="opacity-60" /><span className="font-medium">{p.fullName}</span></span> },
    { key: 's', header: 'Sector', sort: (p) => p.sector, cell: (p) => p.sector },
    { key: 'j', header: 'Joined', sort: (p) => p.joinedOn, mono: true, cell: (p) => fmtDayShort(p.joinedOn) },
    { key: 'p', header: 'Phone', mono: true, cell: (p) => p.phoneMomo },
    { key: 'id', header: 'ID number', cell: (p) => <span className="code text-[var(--text-2)]">{p.idNumber}</span> },
    { key: 'a', header: '', align: 'right', cell: (p) => <Button size="sm" icon={RotateCcw} onClick={(e) => { e.stopPropagation(); s.reactivatePerson(p.id); say({ kind: 'ok', title: `${p.fullName} is back on the roster` }); }}>Reactivate</Button> },
  ];

  let lastSector = '';
  return (
    <div className="flex flex-col gap-[var(--gap)]">
      {/* Shift, date, live counts, primary actions */}
      <section className="hero @container relative overflow-hidden px-5 py-4 flex flex-wrap items-center gap-x-7 gap-y-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <span className="size-12 rounded-xl grid place-items-center shrink-0 shadow-[inset_0_1px_0_rgb(255_255_255/.25)]" style={{ background: SITE_COLOR[site.id] }}><CalendarCheck className="size-6" /></span>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-white/55">{site.name}</div>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] leading-tight">Attendance</h1>
            <div className="text-[12.5px] text-white/60 truncate">{fmtDayLong(s.today)}</div>
          </div>
        </div>
        <div className="min-w-[200px] max-sm:w-full">
          <div className="flex items-center gap-2.5" style={{ ['--surface-3' as string]: 'rgb(255 255 255 / .1)', ['--surface' as string]: 'rgb(255 255 255 / .2)', ['--text' as string]: '#fff', ['--text-2' as string]: 'rgb(255 255 255 / .68)', ['--text-3' as string]: 'rgb(255 255 255 / .6)', ['--line' as string]: 'transparent' }}>
            <Tabs value={kind} onChange={setKind} tabs={site.shifts.map((sh) => ({ value: sh.kind, label: <>{sh.kind === 'day' ? 'Day' : 'Night'}<span className="num font-normal opacity-70 @min-[900px]:@max-[1056px]:hidden">{sh.starts}–{sh.ends}</span></> }))} />
          </div>
          <div className="mt-2.5 flex items-center gap-2.5 text-[12px] text-white/60">
            <div className="h-1.5 flex-1 rounded-full bg-white/15 overflow-hidden"><div className="h-full rounded-full bg-[var(--color-amber-400)] transition-[width] duration-300" style={{ width: `${pct}%` }} /></div>
            <span className="num whitespace-nowrap"><span className="text-white font-medium">{marked}</span> of {roster.length} marked{sector !== 'all' ? ` · ${sector}` : ''}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="[&_circle:first-child]:stroke-white/10"><Donut size={58} thickness={7} center={<span className="text-white text-[13px]">{pct}%</span>} segments={[{ label: 'Present', value: counts.present, color: ON_DARK.present }, { label: 'Half day', value: counts.half, color: ON_DARK.half }, { label: 'Absent', value: counts.absent, color: ON_DARK.absent }, { label: 'Not marked', value: counts.unmarked, color: ON_DARK.unmarked }]} /></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3.5 gap-y-2.5">
            {([['Present', counts.present, ON_DARK.present], ['Half day', counts.half, ON_DARK.half], ['Absent', counts.absent, ON_DARK.absent], ['Not marked', counts.unmarked, ON_DARK.unmarked]] as const).map(([label, value, color]) => (
              <div key={label} className="min-w-0">
                <div className="num text-[22px] font-semibold leading-none"><CountUp value={value} /></div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-white/60 whitespace-nowrap"><span className="size-2 rounded-[2px] shrink-0" style={{ background: color }} />{label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {unmarked.length > 0 && (
            <Button variant="inverse" icon={CheckCircle2} onClick={() => {
              unmarked.forEach((r) => mark(r, 'present', false));
              say({ kind: 'ok', title: `Marked ${unmarked.length} workers Present`, detail: `${kind} shift · ${fmtDayShort(s.today)}` });
            }}>
              Mark {unmarked.length} unmarked Present
            </Button>
          )}
          <Button variant="inverse" icon={Users} onClick={() => go.site('people/signup')}>+ Register casual</Button>
          <Button variant="accent" icon={ListChecks} hotkey="r" hotkeyLabel="Start roll call" onClick={() => { setTab('sheet'); setRoll(true); }} disabled={roster.length === 0 || roll}>Guided Roll Call</Button>
        </div>
      </section>

      <div className="flex items-end justify-between gap-3 border-b border-[var(--line)] -mb-1">
        <Tabs variant="underline" value={tab} onChange={setTab} tabs={[{ value: 'sheet', label: 'Attendance Sheet', count: roster.length }, { value: 'archived', label: 'Archived Workers', count: archivedTotal }]} />
        <div className="pb-1.5 min-w-0 flex-1 flex items-center justify-end gap-2" onKeyDown={(e) => { if (e.key === 'Enter' && tab === 'sheet') { e.preventDefault(); grid.current?.focus({ preventScroll: true }); } }}>
          <Button icon={Download} hotkey="e" hotkeyLabel="Export the sheet as CSV" onClick={exportCsv} disabled={rows.length === 0 || tab !== 'sheet'} aria-label="Export"><span className="max-sm:hidden">Export CSV</span></Button>
          <SearchInput value={q} onChange={setQ} placeholder="Find worker by name…" className="max-w-[240px]" />
        </div>
      </div>

      <div className="grid gap-[var(--gap)] items-start min-[1240px]:grid-cols-[minmax(0,1fr)_336px]">
        <div className="min-w-0 min-[1240px]:order-1">
        {tab === 'archived' ? (
          <Panel icon={Archive} title="Archived workers" sub="off the roster, kept on file" pad={false}>
            <DataGrid bare rows={archived} columns={archivedCols} rowKey={(p) => p.id} onRowClick={(p) => go.site('people/registry', undefined, p.fullName)} maxHeight="max(340px, calc(100dvh - 371px))"
              empty={<Empty icon={Archive} title={needle ? 'No archived worker matches' : 'No archived workers'} hint="Casuals you archive from the registry appear here, ready to reactivate." />} />
          </Panel>
        ) : (
          <div className="flex flex-col gap-[var(--gap)]">
            <Panel pad={false}
              footer={<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">{MARKS.map((m) => <span key={m} className="inline-flex items-center gap-1.5"><MarkDot status={m} className="!size-[18px]" />{MARK[m].label}{m === 'half' ? ' (0.5)' : ''}</span>)}<span className="inline-flex items-center gap-1"><Lock className="size-3" />Past days locked</span></span>
                <span className="text-[var(--text-3)]">Click <b>Present</b>, <b>Half</b> or <b>Absent</b> in the Today column to mark each worker.</span>
              </div>}>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-[var(--pad)] py-2 border-b border-[var(--line)]">
                {site.sectors.length === 0 && <div className="w-full"><MasterEmpty compact title="No sectors set up" hint="Add sectors in Settings → Master data to group the sheet." /></div>}
                <ChipGroup className={cn('max-sm:hidden', site.sectors.length === 0 && 'hidden')} ariaLabel="Sector" size="sm" options={[{ value: 'all', label: 'All sectors' }, ...site.sectors.map((x) => ({ value: x, label: x }))]} value={sector} onChange={setSector} />
                <Select aria-label="Sector" className={cn('sm:hidden !w-auto', site.sectors.length === 0 && 'hidden')} value={sector} onChange={(e) => setSector(e.target.value)}><option value="all">All sectors</option>{site.sectors.map((x) => <option key={x} value={x}>{x}</option>)}</Select>
                {needle && <span className="t-sm text-[var(--text-3)] num whitespace-nowrap ml-auto">{rows.length} matching “{q.trim()}”</span>}
              </div>
              {rows.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={Users} title={needle ? 'No worker matches' : 'Nobody on the roster'} hint={needle ? 'Check the spelling, or clear the search.' : sector === 'all' ? 'Sign up a casual worker to start the sheet.' : `No active workers in ${sector}.`} action={needle ? <Button size="sm" onClick={() => setQ('')}>Clear search</Button> : <Button size="sm" onClick={() => go.site('people/signup')}>Casual sign-up</Button>} /></div> : (
                <div ref={grid} tabIndex={0} onKeyDown={onGridKey} role="grid" aria-label="Attendance sheet" className="overflow-auto scrollbar-thin outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus)] compact:max-h-[max(340px,calc(100dvh-387px))] touch:max-h-[74dvh]">
                  <table className="w-full border-separate border-spacing-0 t-base">
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <th className={cn(TH, 'sticky left-0 z-20 text-left')}>Worker</th>
                        <th className={cn(TH, 'text-left hidden xl:table-cell')}>Engagement</th>
                        {days.map((d, i) => i === todayCol ? null : <th key={d} className={cn(TH, 'text-center !px-0 w-[42px] touch:w-[52px]', dayCls(i))} title={`${fmtDay(d)} · locked`}><div className="leading-tight"><div className="text-[var(--text-4)]">{fmtDay(d).split(' ')[0]}</div><div className="num text-[var(--text-2)] normal-case tracking-normal">{fmtDayShort(d).split(' ')[0]}<span className="max-sm:hidden"> {fmtDayShort(d).split(' ')[1]}</span></div></div></th>)}
                        <th className={cn(TH, 'text-right hidden sm:table-cell w-11')} title="Days worked in these six days">Days</th>
                        {todayCol >= 0 && <th className={cn(TH, 'sticky right-0 z-20 text-right border-l !bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface-2))] shadow-[inset_0_2px_0_var(--accent)]')}><div className="leading-tight"><div className="text-[var(--accent-strong)]">Today · Mark Status</div><div className="num text-[var(--text-2)] normal-case tracking-normal">{fmtDay(s.today)}</div></div></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const expired = r.contractState === 'expired'; const active = !touch && i === cur.r;
                        const today = recOf(r.person.id, s.today); const st = today?.status;
                        const total = days.reduce((t, d) => t + dayValue(recOf(r.person.id, d)?.status), 0);
                        const head = r.person.sector !== lastSector; lastSector = r.person.sector;
                        const g = head ? rows.filter((x) => x.person.sector === r.person.sector) : [];
                        const bg = active ? 'bg-[var(--hover)]' : 'bg-[var(--surface)] group-hover:bg-[var(--hover)]';
                        const ring = (c: number) => active && cur.c === c && 'outline outline-2 -outline-offset-2 outline-[var(--focus)]';
                        return [
                          head && (
                            <tr key={`h-${r.person.sector}`}>
                              <td className="sticky left-0 z-[1] bg-[var(--surface-2)] border-b border-[var(--line)] px-2.5 h-7 touch:h-9 whitespace-nowrap"><span className="t-label text-[var(--text-2)]">{r.person.sector}</span><span className="t-xs text-[var(--text-3)] num ml-2">{g.filter((x) => { const v = recOf(x.person.id, s.today)?.status; return v === 'present' || v === 'half'; }).length} of {g.length} on shift</span></td>
                              <td colSpan={days.length + 2} className="bg-[var(--surface-2)] border-b border-[var(--line)]" />
                            </tr>
                          ),
                          <tr key={r.person.id} data-r={i} aria-selected={active} onMouseDown={() => setCur((c) => ({ r: i, c: c.c }))} className={cn('group scroll-mt-10 scroll-mb-9', expired && 'text-[var(--text-3)]')}>
                            <td className={cn(TD, 'sticky left-0 z-[1]', bg)}>
                              {active && <span className="absolute left-0 inset-y-0 w-[2px] bg-[var(--focus)]" />}
                              <div className="flex items-center gap-2 w-[122px] sm:w-[180px]">
                                <Avatar name={r.person.fullName} seed={r.person.avatarSeed} size={24} className={cn(expired && 'opacity-60')} />
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium truncate leading-tight">{r.person.fullName}</div>
                                  <div className="xl:hidden t-xs text-[var(--text-3)] truncate leading-tight">{r.engagement ? r.engagement.type : ''}{expired ? ' · ended' : r.contractState === 'expiring' ? ' · ending' : ''}</div>
                                </div>
                                {r.isShared && <Badge tone="accent" className="hidden sm:inline-flex">from {SITES[r.person.homeSiteId].shortName}</Badge>}
                              </div>
                            </td>
                            <td className={cn(TD, 'hidden xl:table-cell', bg)}><div className="flex items-center gap-2 t-sm text-[var(--text-2)]"><EngTag type={r.engagement?.type} />{r.engagement?.type === 'contract' && <ContractNote endDate={r.engagement.endDate} state={r.contractState} today={s.today} />}</div></td>
                            {days.map((d, c) => c === todayCol ? null : (
                              <td key={d} onClick={() => { setCur({ r: i, c }); lockedTap(); }} className={cn(TD, 'text-center !px-0', bg, ring(c), dayCls(c))}><MarkDot status={recOf(r.person.id, d)?.status} title={`${fmtDay(d)} · ${recOf(r.person.id, d)?.status ?? 'not marked'} · locked`} /></td>
                            ))}
                            <td className={cn(TD, 'hidden sm:table-cell text-right num', bg, total === 0 && 'text-[var(--text-4)]')}>{total}</td>
                            {todayCol >= 0 && (
                              <td onMouseDown={() => setCur({ r: i, c: todayCol })} className={cn(TD, 'sticky right-0 z-[1] border-l !px-2 max-sm:!px-1.5', active ? 'bg-[color-mix(in_srgb,var(--accent)_12%,var(--hover))]' : 'bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))]', ring(todayCol))}>
                                <div className="flex items-center justify-end gap-1.5 max-sm:gap-0.5">
                                  {expired ? <Button size="sm" tabIndex={-1} onClick={() => setRenewId(r.person.id)}>Renew</Button> : <>
                                    <div role="radiogroup" aria-label={`${r.person.fullName} today`} className="hidden sm:inline-flex rounded-md border border-[var(--line-2)] bg-[var(--surface)] overflow-hidden">
                                      {MARKS.map((m) => (
                                        <button key={m} type="button" tabIndex={-1} role="radio" aria-checked={st === m} title={MARK[m].label} onClick={() => mark(r, m)}
                                          className={cn('px-2 h-[26px] touch:px-2.5 touch:h-9 grid place-items-center t-xs font-semibold border-r border-[var(--line-2)] last:border-r-0 transition-colors', st === m ? MARK[m].solid : 'text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-[var(--text)]')}>
                                          {m === 'present' ? 'Present' : m === 'half' ? 'Half' : 'Absent'}
                                        </button>
                                      ))}
                                    </div>
                                    <button type="button" tabIndex={-1} onClick={() => cycle(r)} aria-label={`${r.person.fullName}: ${st ?? 'not marked'}. Press to change.`} className={cn('sm:hidden px-2.5 h-9 rounded-md border grid place-items-center t-xs font-semibold', st ? MARK[st].solid : 'border-dashed border-[var(--line-2)] text-[var(--text-2)] bg-[var(--surface)]')}>{st ? (st === 'present' ? 'Present' : st === 'half' ? 'Half' : 'Absent') : 'Mark'}</button>
                                    <button type="button" tabIndex={-1} onClick={() => setOtId(r.person.id)} title="Overtime hours" aria-label={`Overtime for ${r.person.fullName}`} className={cn('w-8 h-[26px] touch:w-10 touch:h-9 rounded-md grid place-items-center t-xs num font-semibold', today?.overtimeHours ? 'bg-[var(--info-bg)] text-[var(--info)]' : 'text-[var(--text-4)] hover:bg-[var(--hover)] hover:text-[var(--text-2)]')}>{today?.overtimeHours ? `+${today.overtimeHours}h` : <Clock className="size-3.5" />}</button>
                                  </>}
                                </div>
                              </td>
                            )}
                          </tr>,
                        ];
                      })}
                    </tbody>
                    <tfoot className="sticky bottom-0 z-10">
                      <tr>
                        <td className={cn(TF, 'sticky left-0 z-20')}>On shift</td>
                        <td className={cn(TF, 'hidden xl:table-cell font-normal text-[var(--text-3)]')}>present or half day</td>
                        {days.map((d, c) => c === todayCol ? null : <td key={d} className={cn(TF, 'text-center num !px-0', dayCls(c))}>{dayTotals[c]}</td>)}
                        <td className={cn(TF, 'hidden sm:table-cell')} />
                        {todayCol >= 0 && <td className={cn(TF, 'sticky right-0 z-20 border-l text-right num')}>{dayTotals[todayCol]} <span className="font-normal text-[var(--text-3)]">of {rows.length}</span></td>}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Panel>

            <div className="grid gap-[var(--gap)] md:grid-cols-2">
              <Panel icon={Users} title="On shift by sector" sub={`${kind} shift · of roster`}>
                {bySector.length === 0 ? <Empty title="Nobody on the roster" /> : <div className="grid gap-x-5 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">{bySector.map((x) => <Meter key={x.sector} label={x.sector} value={x.on} max={x.total} display={<>{x.on}<span className="text-[var(--text-3)] font-normal"> / {x.total}</span></>} />)}</div>}
              </Panel>
              <Panel icon={TrendingUp} title="Headcount" sub="workers on shift per day · 7 working days">
                <LineChart height={168} labels={trend.map((d) => fmtDayShort(d.day))} partialLast series={[{ name: 'On shift', data: trend.map((d) => d.headcount) }]} />
                <div className="t-xs text-[var(--text-3)] mt-1">Day and night shifts together. Today is dashed because the night shift has not been marked.</div>
              </Panel>
            </div>
          </div>
        )}
        </div>
        <aside className="min-w-0 grid gap-[var(--gap)] items-start md:max-[1239px]:grid-cols-2 min-[1240px]:order-2">
        <Panel icon={UserX} title="Not marked yet" sub={unmarked.length ? `${unmarked.length} on the ${kind} shift` : undefined} pad={false}
          footer={unmarked.length > 6 ? <div className="flex items-center justify-between gap-2"><span>and {unmarked.length - 6} more</span><button className="font-medium text-[var(--text)] hover:underline inline-flex items-center gap-1.5" onClick={() => setRoll(true)}>Start guided roll call</button></div> : undefined}>
          {unmarked.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={CheckCircle2} title="Everyone is marked" hint={`All ${roster.length} workers have a mark for the ${kind} shift.`} /></div> : unmarked.slice(0, 6).map((r) => (
            <div key={r.person.id} className="w-full flex items-center gap-2 px-[var(--pad)] h-[var(--row-h)] border-b border-[var(--line)] last:border-b-0">
              <button onClick={() => jumpTo(r.person.id)} className="flex items-center gap-2 min-w-0 flex-1 text-left hover:underline">
                <Avatar name={r.person.fullName} seed={r.person.avatarSeed} size={22} />
                <span className="t-base font-medium truncate">{r.person.fullName}</span>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => mark(r, 'present')} className="px-2 h-6 rounded bg-[var(--ok-bg)] text-[var(--ok)] t-xs font-semibold hover:brightness-95">Present</button>
                <button type="button" onClick={() => mark(r, 'absent')} className="px-2 h-6 rounded bg-[var(--bad-bg)] text-[var(--bad)] t-xs font-semibold hover:brightness-95">Absent</button>
              </div>
            </div>
          ))}
        </Panel>

        <Panel icon={CalendarClock} title="Contracts ending" sub={`within ${rules.warningDays} day${rules.warningDays === 1 ? '' : 's'}`} pad={false} actions={ending.length ? <Badge tone="warn">{ending.length}</Badge> : undefined}>
          {ending.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={CalendarClock} title={`No contract ends in the next ${rules.warningDays} day${rules.warningDays === 1 ? '' : 's'}`} /></div> : ending.map((r) => (
            <div key={r.person.id} className="flex items-center gap-2.5 px-[var(--pad)] py-2 border-b border-[var(--line)] last:border-b-0">
              <Avatar name={r.person.fullName} seed={r.person.avatarSeed} size={26} ring={r.contractState === 'expired' ? 'bad' : 'warn'} />
              <div className="min-w-0 flex-1"><div className="t-base font-medium truncate">{r.person.fullName}</div><div className="mt-0.5 flex items-center gap-1.5 t-sm text-[var(--text-3)]"><ContractNote endDate={r.engagement?.endDate} state={r.contractState} today={s.today} /><span className="truncate">{r.person.sector}</span></div></div>
              <Button size="sm" onClick={() => setRenewId(r.person.id)}>Renew</Button>
            </div>
          ))}
        </Panel>

        <Panel icon={ShieldAlert} title="Ghost-worker guard" pad={false} actions={<Badge tone={ghosts.dupes.length + ghosts.unseen.length ? 'warn' : 'ok'} dot>{ghosts.dupes.length + ghosts.unseen.length ? `${ghosts.dupes.length + ghosts.unseen.length} to check` : 'Clear'}</Badge>} footer={<span>Casuals unseen for {rules.absentDays} working day{rules.absentDays === 1 ? '' : 's'} are flagged. Change the limit in Settings → Rules.</span>}>
          {ghosts.dupes.length + ghosts.unseen.length === 0 ? <div className="px-[var(--pad)] py-3 t-sm text-[var(--text-2)]">No phone number is shared by two workers, and every casual has been seen in the last {rules.absentDays} working day{rules.absentDays === 1 ? '' : 's'}.</div> : <>
            {ghosts.dupes.map((g) => (
              <div key={g[0].phoneMomo} className="flex items-start gap-2.5 px-[var(--pad)] py-2 border-b border-[var(--line)] last:border-b-0">
                <IconChip icon={Phone} color="var(--warn)" className="size-7 rounded-md mt-0.5" />
                <div className="min-w-0 flex-1"><div className="t-base font-medium leading-snug">One phone, {g.length} workers</div><div className="t-sm text-[var(--text-3)]"><span className="num">{g[0].phoneMomo}</span> is registered to {g.map((p) => p.fullName).join(' and ')}.</div></div>
              </div>
            ))}
            {ghosts.unseen.map((p) => (
              <button key={p.id} onClick={() => jumpTo(p.id)} className="w-full text-left flex items-start gap-2.5 px-[var(--pad)] py-2 border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--hover)]">
                <IconChip icon={EyeOff} color="var(--warn)" className="size-7 rounded-md mt-0.5" />
                <div className="min-w-0 flex-1"><div className="t-base font-medium leading-snug">{p.fullName}</div><div className="t-sm text-[var(--text-3)]">Casual, {p.sector}. Not seen in {rules.absentDays} working day{rules.absentDays === 1 ? '' : 's'}.</div></div>
              </button>
            ))}
          </>}
        </Panel>
        </aside>
      </div>

      <RollCall open={roll} onClose={() => setRoll(false)} roster={roster} days={days} kind={kind} today={s.today} shiftLabel={shift ? `${shift.starts}–${shift.ends}` : ''} recOf={recOf} terms={terms} onMark={(row, st) => mark(row, st, false)} onRenew={doRenew} />
      <RenewDialog target={renewRow?.engagement ? { person: renewRow.person, engagement: renewRow.engagement } : null} today={s.today} onClose={() => setRenewId(null)} onRenew={doRenew} />
      <OvertimeDialog row={otRow} maxHours={maxOt} current={otRow ? recOf(otRow.person.id, s.today) : undefined} onClose={() => setOtId(null)} onSave={saveOt} />
    </div>
  );
}

const TH = 'px-2.5 h-10 touch:h-11 t-xs font-semibold text-[var(--text-3)] uppercase tracking-[0.04em] whitespace-nowrap border-b border-[var(--line)] bg-[var(--surface-2)]';
const TD = 'relative px-2.5 h-[var(--row-h)] py-1 align-middle whitespace-nowrap border-b border-[var(--line)]';
const TF = 'px-2.5 h-8 touch:h-10 t-sm font-semibold whitespace-nowrap border-t border-[var(--line-2)] bg-[var(--surface-2)]';

/** Overtime for one worker on today's shift. */
function OvertimeDialog({ row, current, maxHours, onClose, onSave }: { row?: RosterRow; current?: AttendanceRec; maxHours: number; onClose: () => void; onSave: (row: RosterRow, hours: number) => void }) {
  const [v, setV] = useState('');
  const id = row?.person.id;
  useEffect(() => { setV(current?.overtimeHours ? String(current.overtimeHours) : ''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
  const hours = parseFloat(v || '0') || 0;
  const save = () => row && onSave(row, hours);
  return (
    <Dialog open={!!row} onClose={onClose} title="Overtime hours" width={400}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={Clock} hotkey="mod+enter" hotkeyLabel="Save overtime" onClick={save}>{hours ? `Save ${hours} h` : 'Save no overtime'}</Button></>}>
      {row && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <Avatar name={row.person.fullName} seed={row.person.avatarSeed} size={36} />
            <div className="min-w-0 flex-1"><div className="t-base font-semibold truncate">{row.person.fullName}</div><div className="t-sm text-[var(--text-3)]">{row.person.sector} · today {current ? MARK[current.status].label.toLowerCase() : 'not marked'}</div></div>
          </div>
          <div onKeyDown={(e) => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); save(); } }}><NumberPad autoFocus value={v} onChange={setV} allowDecimal max={maxHours} suffix="h" label="Hours beyond the shift" /></div>
          {(!current || current.status === 'absent') && <Note tone="info" className="mt-3">{current ? 'Marked absent today.' : 'Not marked yet.'} Saving overtime marks {row.person.fullName.split(' ')[0]} present.</Note>}
          <div className="t-xs text-[var(--text-3)] mt-2.5">Up to {maxHours} h. The settlement run pays overtime at the daily rate ÷ {STANDARD_DAY_HOURS} per hour (rule to be confirmed).</div>
        </div>
      )}
    </Dialog>
  );
}

/** Roll call: one worker at a time, driven by P / H / A and the arrow keys; three large buttons on touch. */
function RollCall({ open, onClose, roster, days, kind, today, shiftLabel, recOf, terms, onMark, onRenew }: { open: boolean; onClose: () => void; roster: RosterRow[]; days: string[]; kind: ShiftKind; today: string; shiftLabel: string; recOf: (personId: string, day: string) => AttendanceRec | undefined; terms: { id: string; days: number; label: string }[]; onMark: (row: RosterRow, st: AttendanceStatus) => boolean; onRenew: (eng: Engagement, term: number) => void }) {
  const [i, setI] = useState(0);
  useEffect(() => { if (open) setI(Math.max(0, roster.findIndex((r) => r.contractState !== 'expired' && !recOf(r.person.id, today)))); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]); // on open only: jump to the first unmarked worker
  const total = roster.length; const row = roster[i]; const finished = i >= total;
  const step = (d: number) => setI((x) => clamp(x + d, 0, total));
  const pick = (st: AttendanceStatus) => { if (!row) return; if (onMark(row, st)) setI((x) => x + 1); };
  const marked = roster.filter((r) => recOf(r.person.id, today)).length;
  const st = row ? recOf(row.person.id, today)?.status : undefined;
  const expired = row?.contractState === 'expired';
  const next = roster.slice(i + 1, i + 4);
  useHotkey(['1'], () => pick('present'), { label: 'Roll call: present', enabled: open && !finished, hidden: true });
  useHotkey(['2'], () => pick('half'), { label: 'Roll call: half day', enabled: open && !finished, hidden: true });
  useHotkey(['3'], () => pick('absent'), { label: 'Roll call: absent', enabled: open && !finished, hidden: true });
  return (
    <Dialog open={open} onClose={onClose} width={560}
      title={<div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 min-w-0"><ListChecks className="size-4 text-[var(--text-3)] shrink-0" />Roll call<span className="t-sm font-normal text-[var(--text-3)] truncate">{kind} shift <span className="max-sm:hidden">{shiftLabel}</span></span></span><span className="num t-sm font-medium text-[var(--text-2)]">{Math.min(i + 1, total)} of {total}</span></div>}
      footer={finished || !row ? <><Button onClick={() => step(-1)} disabled={total === 0} hotkey="arrowleft" hotkeyLabel="Roll call: previous worker">Back one</Button><Button variant="primary" onClick={onClose} data-autofocus="">Close</Button></> : (
        <div className="w-full flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => step(-1)} disabled={i === 0} hotkey="arrowleft" hotkeyLabel="Roll call: previous worker">Previous</Button>
          <span className="t-sm text-[var(--text-3)] num">{marked} of {total} marked</span>
          <Button variant="ghost" onClick={() => step(1)} hotkey="arrowright" hotkeyLabel="Roll call: skip worker">Skip</Button>
        </div>
      )}>
      <div className="w-[min(528px,calc(100vw-64px))] max-w-full">
      <Bar value={marked} max={total || 1} tone="ok" height={4} className="mb-4" />
      {finished || !row ? (
        <div className="py-6 flex flex-col items-center text-center anim-pop">
          <IconChip icon={CheckCircle2} color="var(--ok)" className="size-11 rounded-xl [&_svg]:size-6 mb-2.5" />
          <div className="t-title">Roll call done</div>
          <div className="t-base text-[var(--text-2)] mt-1">{marked} of {total} marked for the {kind} shift on {fmtDayShort(today)}.</div>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-4">
            <Avatar name={row.person.fullName} seed={row.person.avatarSeed} size={72} className="max-sm:hidden" ring={st === 'present' ? 'ok' : st === 'half' ? 'warn' : st === 'absent' ? 'bad' : 'none'} />
            <div className="min-w-0 flex-1">
              <div className="t-title truncate">{row.person.fullName}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 t-sm text-[var(--text-2)]"><span>{row.person.sector}</span><EngTag type={row.engagement?.type} />{row.engagement?.type === 'contract' && <ContractNote endDate={row.engagement.endDate} state={row.contractState} today={today} />}{row.isShared && <Badge tone="accent">from {SITES[row.person.homeSiteId].shortName}</Badge>}</div>
              <div className="mt-2 flex items-center gap-1.5">{days.filter((d) => d !== today).map((d) => <span key={d} className="flex flex-col items-center gap-0.5"><MarkDot status={recOf(row.person.id, d)?.status} /><span className="t-xs text-[var(--text-4)] num">{fmtDayShort(d).split(' ')[0]}</span></span>)}<span className="t-xs text-[var(--text-3)] ml-1.5 self-start mt-1 max-sm:hidden">last {days.length - 1} working days</span></div>
            </div>
          </div>
          {expired && row.engagement ? (
            <Note tone="bad" className="mt-4"><div className="font-medium">Contract ended {row.engagement.endDate ? fmtDayShort(row.engagement.endDate) : ''}. Renew before marking.</div>{terms.length === 0 ? <div className="mt-2"><MasterEmpty compact title="No contract terms set up" hint="Add contract terms in Settings → Master data." /></div> : <div className="mt-2 flex flex-wrap gap-1.5">{terms.map((t) => <Button key={t.id} size="sm" variant={t.days === row.engagement?.termDays ? 'primary' : 'secondary'} onClick={() => row.engagement && onRenew(row.engagement, t.days)}>Renew {t.label}</Button>)}</div>}</Note>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <Button variant="ok" size="xl" className="max-sm:!px-2" hotkey="p" hotkeyLabel="Roll call: present" onClick={() => pick('present')}>Present</Button>
                <Button size="xl" hotkey="h" hotkeyLabel="Roll call: half day" className="!border-[var(--warn)] !text-[var(--warn)] max-sm:!px-2" onClick={() => pick('half')}>Half day</Button>
                <Button variant="danger" size="xl" className="max-sm:!px-2" hotkey="a" hotkeyLabel="Roll call: absent" onClick={() => pick('absent')}>Absent</Button>
              </div>
              <div className="t-sm text-[var(--text-3)] mt-2 min-h-[1.4em]">{st ? <>Already marked <b className="text-[var(--text-2)]">{MARK[st].label.toLowerCase()}</b>. Press a key to change it, or skip.</> : 'Each mark saves and moves to the next worker.'}</div>
            </>
          )}
          {next.length > 0 && <div className="mt-3 pt-3 border-t border-[var(--line)] flex items-center gap-2 t-sm text-[var(--text-3)] min-w-0"><span className="t-label shrink-0">Up next</span><span className="flex items-center gap-3 min-w-0 overflow-hidden">{next.map((n) => <span key={n.person.id} className="inline-flex items-center gap-1.5 whitespace-nowrap"><Avatar name={n.person.fullName} seed={n.person.avatarSeed} size={18} />{n.person.fullName}</span>)}</span></div>}
        </div>
      )}
      </div>
    </Dialog>
  );
}
