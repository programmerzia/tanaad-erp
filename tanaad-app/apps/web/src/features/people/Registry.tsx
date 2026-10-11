import { useEffect, useMemo, useState } from 'react';
import { Archive, ArrowDownLeft, ArrowLeftRight, CalendarClock, CreditCard, Download, PieChart, RotateCcw, ScanFace, UserPlus, Users } from 'lucide-react';
import type { AttendanceStatus, Engagement, EngagementType, Person } from '@tanaad/domain';
import { contractDaysRemaining } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useGo, useQueryParam, useSite } from '@/app/hooks';
import { Avatar, Badge, Bar, Button, ChipGroup, DataGrid, Empty, KpiStrip, PageHeader, SearchInput, Select, Sheet, Stat, Status, Tabs, Toolbar, cn, type Column } from '@/components/ui';
import { CountUp, Donut, TimeTrack } from '@/components/charts';
import { activeEngagement, addDays, currentShiftKind, dailySeries, headcount, lastWorkingDays, shiftId, sitePeople } from '@/data/selectors';
import { fmtDay, fmtDayShort, fmtNum, fmtUGX } from '@/data/format';
import { SITES } from '@/config/sites';
import { BASIS, ContractNote, ENG, ENG_TYPES, EngTag, MarkDot, MasterEmpty, PhotoFrame, RenewDialog, contractStateFor, downloadCsv, useContractTerms, usePeopleRules, type ContractState } from './kit';

interface RegRow { person: Person; eng?: Engagement; daysLeft?: number; cstate: ContractState; isShared: boolean; marks: (AttendanceStatus | undefined)[]; worked: number }
type StatusFilter = 'active' | 'ending' | 'archived' | 'all';
const say = (t: { kind: 'ok' | 'warn' | 'error' | 'info'; title: string; detail?: string }) => useStore.getState().toast(t);
const elapsedOf = (e: Engagement, today: string) => { if (!e.endDate) return 0; const span = contractDaysRemaining(e.endDate, e.startDate) || 1; return Math.max(0, Math.min(1, contractDaysRemaining(today, e.startDate) / span)); };

/** Every worker who touches this site: who they are, how they are engaged, what they are owed per unit. */
export function Registry() {
  const s = useStore(); const site = useSite(); const go = useGo();
  const rules = usePeopleRules(); const warn = rules.warningDays; const within = `within ${warn} day${warn === 1 ? '' : 's'}`;
  const kind = currentShiftKind();
  const qp = useQueryParam('q');
  const [q, setQ] = useState(qp ?? '');
  const [type, setType] = useState<'all' | EngagementType>('all');
  const [sector, setSector] = useState('all');
  const [status, setStatus] = useState<StatusFilter>(qp ? 'all' : 'active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renewId, setRenewId] = useState<string | null>(null);
  useEffect(() => { if (qp !== undefined) { setQ(qp); if (qp) setStatus('all'); } }, [qp]);

  const days = useMemo(() => lastWorkingDays(site.id, s.today, 6), [site.id, s.today]);
  const rows = useMemo<RegRow[]>(() => {
    // Best mark per person per day over both shifts of the last six working days.
    const rank: Record<AttendanceStatus, number> = { present: 3, half: 2, absent: 1 };
    const dayOf = new Map<string, number>(); days.forEach((d, i) => { for (const sh of site.shifts) dayOf.set(shiftId(site.id, d, sh.kind), i); });
    const marks = new Map<string, (AttendanceStatus | undefined)[]>();
    for (const a of s.attendance) { const i = dayOf.get(a.shiftId); if (i === undefined) continue; const m = marks.get(a.personId) ?? Array<AttendanceStatus | undefined>(days.length).fill(undefined); const cur = m[i]; if (!cur || rank[a.status] > rank[cur]) m[i] = a.status; marks.set(a.personId, m); }
    return sitePeople(s, site.id).map((p) => { const eng = activeEngagement(s, p.id); const cstate = eng?.type === 'contract' ? contractStateFor(eng.endDate, s.today, warn) : 'open'; const m = marks.get(p.id) ?? Array<AttendanceStatus | undefined>(days.length).fill(undefined); return { person: p, eng, daysLeft: eng?.endDate ? contractDaysRemaining(eng.endDate, s.today) : undefined, cstate, isShared: p.homeSiteId !== site.id, marks: m, worked: m.reduce((t, x) => t + (x === 'present' ? 1 : x === 'half' ? 0.5 : 0), 0) }; });
  }, [s, site, warn, days]);
  const active = rows.filter((r) => r.person.status === 'active');
  const isEnding = (r: RegRow) => r.person.status === 'active' && r.cstate !== 'open' && !r.isShared;
  const inScope = useMemo(() => { const needle = q.trim().toLowerCase(); return rows.filter((r) => (status === 'all' || (status === 'ending' ? isEnding(r) : r.person.status === status)) && (sector === 'all' || r.person.sector === sector) && (!needle || r.person.fullName.toLowerCase().includes(needle) || r.person.idNumber.toLowerCase().includes(needle) || r.person.phoneMomo.includes(needle))).sort((a, b) => a.person.fullName.localeCompare(b.person.fullName)); }, [rows, q, sector, status]);
  const filtered = type === 'all' ? inScope : inScope.filter((r) => r.eng?.type === type);
  const expiring = active.filter((r) => r.cstate === 'expiring' && !r.isShared);
  const expired = active.filter((r) => r.cstate === 'expired' && !r.isShared);
  const byType = ENG_TYPES.map((t) => ({ type: t, n: active.filter((r) => r.eng?.type === t).length }));
  const sharedIn = active.filter((r) => r.isShared).length; const lentOut = active.filter((r) => !r.isShared && r.person.sharedSites.length > 0).length;
  const archived = rows.filter((r) => r.person.status === 'archived').length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const trend = useMemo(() => dailySeries(s, site.id, lastWorkingDays(site.id, s.today, 7)).map((d) => d.headcount), [s.attendance, site.id, s.today]);
  const onShift = headcount(s, site.id, s.today, kind).total;
  const dailyBill = filtered.filter((r) => r.person.status === 'active' && r.eng && (r.eng.rateBasis === 'day' || r.eng.rateBasis === 'shift')).reduce((t, r) => t + (r.eng?.rate ?? 0), 0);
  const selected = rows.find((r) => r.person.id === selectedId);
  const renewRow = rows.find((r) => r.person.id === renewId);

  const renew = (eng: Engagement, term: number) => { const name = s.people.find((p) => p.id === eng.personId)?.fullName ?? 'Worker'; s.renewContract(eng.id, term); setRenewId(null); say({ kind: 'ok', title: `${name}: ${term}-day contract renewed`, detail: `Starts today, ends ${fmtDayShort(addDays(s.today, term))}` }); };
  const clear = () => { setQ(''); setType('all'); setSector('all'); setStatus('active'); };
  const exportCsv = () => {
    const name = `${site.id}-workers-${s.today}.csv`;
    downloadCsv(name, [['Name', 'ID number', 'Phone', 'Sector', 'Engagement', 'Start', 'End', 'Term days', 'Rate', 'Basis', 'Days left', 'Home site', 'Status'], ...filtered.map((r) => [r.person.fullName, r.person.idNumber, r.person.phoneMomo, r.person.sector, r.eng?.type ?? '', r.eng?.startDate ?? '', r.eng?.endDate ?? '', r.eng?.termDays ?? '', r.eng?.rate ?? '', r.eng?.rateBasis ?? '', r.daysLeft ?? '', SITES[r.person.homeSiteId].shortName, r.person.status])]);
    say({ kind: 'ok', title: 'CSV downloaded', detail: name });
  };

  const columns: Column<RegRow>[] = [
    { key: 'name', header: 'Worker', sticky: true, sort: (r) => r.person.fullName, cell: (r) => (
      <span className="inline-flex items-center gap-2"><Avatar name={r.person.fullName} seed={r.person.avatarSeed} size={24} className={cn(r.person.status === 'archived' && 'opacity-50')} /><span className={cn('font-medium', r.person.status === 'archived' && 'text-[var(--text-3)]')}>{r.person.fullName}</span>
        {r.isShared ? <Badge tone="accent">from {SITES[r.person.homeSiteId].shortName}</Badge> : r.person.sharedSites.length > 0 ? <span title={`Also works at ${r.person.sharedSites.map((x) => SITES[x].shortName).join(', ')}`}><Badge>shared</Badge></span> : null}</span>
    ) },
    { key: 'phone', header: 'Mobile money', mono: true, cell: (r) => <span title={`ID ${r.person.idNumber}`}>{r.person.phoneMomo}</span> },
    { key: 'sector', header: 'Sector', sort: (r) => r.person.sector, cell: (r) => r.person.sector },
    ...(status === 'ending' ? [] : [{ key: 'type', header: 'Engagement', sort: (r: RegRow) => r.eng?.type ?? '', cell: (r: RegRow) => <EngTag type={r.eng?.type} /> }]),
    { key: 'term', header: 'Term', sort: (r) => r.eng?.startDate ?? '', cell: (r) => {
      if (!r.eng) return <span className="text-[var(--text-4)]">—</span>;
      if (r.eng.type !== 'contract' || !r.eng.endDate) return <span className="num text-[var(--text-2)]">since {fmtDayShort(r.eng.startDate)}</span>;
      return <span className="flex items-center gap-2"><Bar value={elapsedOf(r.eng, s.today)} max={1} tone={r.cstate === 'expired' ? 'bad' : r.cstate === 'expiring' ? 'warn' : 'series'} className="!w-[44px] shrink-0" height={5} /><span className="num" title={r.eng.termDays ? `${r.eng.termDays}-day term` : undefined}>{fmtDayShort(r.eng.startDate)} → {fmtDayShort(r.eng.endDate)}</span></span>;
    } },
    { key: 'last', header: <span title={`${fmtDay(days[0])} to ${fmtDay(days[days.length - 1])}, best mark of the day`}>Last {days.length} days</span>, sort: (r) => r.worked, cell: (r) => <span className="inline-flex items-center gap-2"><span className="inline-flex gap-[3px]">{r.marks.map((m, i) => <MarkDot key={i} status={m} title={`${fmtDay(days[i])} · ${m ?? 'not marked'}`} className={cn('!size-[17px] touch:!size-6', !m && 'bg-[var(--surface-2)]')} />)}</span><span className={cn('num t-sm w-[22px] text-right', r.worked ? 'text-[var(--text-2)]' : 'text-[var(--text-4)]')}>{r.worked}</span></span> },
    { key: 'rate', header: 'Rate', align: 'right', sort: (r) => r.eng?.rate ?? 0, cell: (r) => (r.eng ? <span className="num">{fmtNum(r.eng.rate)}<span className="t-sm text-[var(--text-3)]"> /{BASIS[r.eng.rateBasis]}</span></span> : '—') },
    { key: 'left', header: 'Days left', align: 'right', sort: (r) => (r.eng?.type === 'contract' ? r.daysLeft ?? 9999 : 9999), cell: (r) => (r.eng?.type === 'contract' && r.eng.endDate ? <ContractNote endDate={r.eng.endDate} state={r.cstate} today={s.today} plain /> : <span className="text-[var(--text-4)]">—</span>) },
    ...(status === 'all' || status === 'archived' ? [{ key: 'status', header: 'Status', sort: (r: RegRow) => r.person.status, cell: (r: RegRow) => <Status tone={r.person.status === 'active' ? 'ok' : 'neutral'}>{r.person.status === 'active' ? 'Active' : 'Archived'}</Status> }] : []),
    ...(status === 'ending' ? [{ key: 'act', header: '', align: 'right' as const, cell: (r: RegRow) => (isEnding(r) && r.eng ? <Button size="sm" icon={CalendarClock} onClick={(e) => { e.stopPropagation(); setRenewId(r.person.id); }}>Renew</Button> : null) }] : []),
  ];

  return (
    <div>
      <PageHeader eyebrow={`People · ${site.name}`} title="Workers" meta={<><Badge>{active.length} active</Badge>{expiring.length + expired.length > 0 && <Badge tone="warn" dot>{expiring.length + expired.length} contract{expiring.length + expired.length === 1 ? '' : 's'} ending</Badge>}</>}
        subtitle="Everyone who works at this site, how they are engaged and what they are paid per unit."
        actions={<><Button icon={Download} hotkey="e" hotkeyLabel="Export workers as CSV" onClick={exportCsv} disabled={filtered.length === 0}>Export</Button><Button variant="primary" icon={UserPlus} hotkey="n" hotkeyLabel="Sign up a casual worker" onClick={() => go.site('people/signup')}>Sign up casual</Button></>} />

      <KpiStrip className="mb-[var(--gap)]">
        <Stat label="Active workers" icon={Users} accent="var(--series-1)" value={<CountUp value={active.length} />} spark={trend} sub={`${onShift} on shift now`} onClick={() => { setStatus('active'); setType('all'); }} />
        <div className="surface px-3.5 py-3 flex flex-col gap-1.5 min-w-0 max-md:order-first max-xl:col-span-2">
          <div className="flex items-center justify-between gap-2"><span className="t-sm font-medium text-[var(--text-2)] truncate">By engagement</span><span className="size-7 rounded-md grid place-items-center shrink-0 bg-[color-mix(in_srgb,var(--series-3)_13%,transparent)] text-[var(--series-3)]"><PieChart className="size-4" /></span></div>
          <div className="flex items-center gap-3.5 flex-1">
            <Donut size={64} thickness={9} center={active.length} segments={byType.map((b) => ({ label: ENG[b.type].long, value: b.n, color: ENG[b.type].color }))} />
            <div className="flex-1 min-w-0">{byType.map((b) => <button key={b.type} onClick={() => { setType(b.type); setStatus('active'); }} className="w-full flex items-center gap-2 h-[22px] t-sm hover:bg-[var(--hover)] rounded-[4px] px-1 -mx-1"><span className="size-2 rounded-[2px] shrink-0" style={{ background: ENG[b.type].color }} /><span className="text-[var(--text-2)] flex-1 text-left truncate">{ENG[b.type].label}</span><span className="num font-medium">{b.n}</span></button>)}</div>
          </div>
        </div>
        <Stat label="Contracts ending" icon={CalendarClock} accent="var(--series-4)" tone={expiring.length + expired.length ? 'warn' : 'neutral'} value={<CountUp value={expiring.length + expired.length} />} sub={expiring.length + expired.length ? `${expired.length} ended · ${expiring.length} ${within}` : `None ${within}`} onClick={() => { setStatus('ending'); setType('all'); }} />
        <Stat label="Shared workers" icon={ArrowLeftRight} accent="var(--series-7)" value={<CountUp value={sharedIn + lentOut} />} sub={`${sharedIn} shared in · ${lentOut} lent out`} />
        <Stat label="Archived" icon={Archive} accent="var(--text-3)" value={<CountUp value={archived} />} sub="Kept on file" onClick={() => { setStatus('archived'); setType('all'); }} />
      </KpiStrip>

      <Toolbar right={<><span className="t-sm text-[var(--text-3)] num whitespace-nowrap">{filtered.length} of {rows.length}</span></>}>
        <SearchInput value={q} onChange={setQ} placeholder="Search name, ID number or phone" className="max-w-[260px]" />
        <Tabs value={type} onChange={setType} tabs={[{ value: 'all', label: 'All', count: inScope.length }, ...ENG_TYPES.map((t) => ({ value: t, label: ENG[t].label, count: inScope.filter((r) => r.eng?.type === t).length }))]} />
        <Select aria-label="Sector" value={sector} onChange={(e) => setSector(e.target.value)} className="!w-auto"><option value="all">All sectors</option>{site.sectors.map((x) => <option key={x} value={x}>{x}</option>)}</Select>
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="!w-auto"><option value="active">Active</option><option value="ending">Ending {within}</option><option value="archived">Archived</option><option value="all">Active and archived</option></Select>
        {(q || type !== 'all' || sector !== 'all' || status !== 'active') && <Button variant="ghost" size="sm" onClick={clear}>Clear filters</Button>}
      </Toolbar>

      <DataGrid rows={filtered} columns={columns} rowKey={(r) => r.person.id} onRowClick={(r) => setSelectedId(r.person.id)} selectedKey={selectedId} maxHeight="max(340px, calc(100dvh - 397px))" className="[&_tfoot]:z-[5]"
        empty={<Empty icon={Users} title="No workers match" hint="Try another name, clear the filters, or sign up a new casual." action={<Button size="sm" onClick={clear}>Clear filters</Button>} />}
        footer={filtered.length ? <tr><td colSpan={columns.length}><div className="flex flex-wrap items-center gap-x-5 gap-y-1 t-sm font-normal text-[var(--text-2)]"><span className="font-semibold text-[var(--text)] num">{filtered.length} worker{filtered.length === 1 ? '' : 's'}</span>{ENG_TYPES.map((t) => <span key={t} className="inline-flex items-center gap-1.5"><EngTag type={t} /><span className="num text-[var(--text)]">{filtered.filter((r) => r.eng?.type === t).length}</span></span>)}<span className="ml-auto num">Daily and shift rates add up to <span className="font-semibold text-[var(--text)]">{fmtUGX(dailyBill)}</span> for a full day</span></div></td></tr> : undefined} />

      <Sheet open={!!selected} onClose={() => setSelectedId(null)} title={selected?.person.fullName ?? ''} sub={selected ? `${selected.person.sector} · ${SITES[selected.person.homeSiteId].name}` : undefined} width={520}
        footer={selected && <ProfileActions r={selected} onClose={() => setSelectedId(null)} />}>
        {selected && <Profile key={selected.person.id} r={selected} onRenew={(t) => selected.eng && renew(selected.eng, t)} />}
      </Sheet>
      <RenewDialog target={renewRow?.eng ? { person: renewRow.person, engagement: renewRow.eng } : null} today={s.today} onClose={() => setRenewId(null)} onRenew={renew} />
    </div>
  );
}

function ProfileActions({ r, onClose }: { r: RegRow; onClose: () => void }) {
  const s = useStore(); const isArchived = r.person.status === 'archived';
  const toggle = () => { if (isArchived) { s.reactivatePerson(r.person.id); say({ kind: 'ok', title: `${r.person.fullName} reactivated` }); } else { s.archivePerson(r.person.id); say({ kind: 'ok', title: `${r.person.fullName} archived`, detail: 'Reactivate any time from Attendance → Archived.' }); onClose(); } };
  return <><span className="mr-auto t-sm text-[var(--text-3)]">{r.isShared ? 'Shared workers are archived from their home site.' : isArchived ? 'Off the roster, record kept.' : 'Archiving keeps the record and history.'}</span><Button variant={isArchived ? 'primary' : 'secondary'} icon={isArchived ? RotateCcw : Archive} onClick={toggle} disabled={r.isShared}>{isArchived ? 'Reactivate' : 'Archive worker'}</Button></>;
}

const RANK: Record<AttendanceStatus, number> = { present: 3, half: 2, absent: 1 };

/** Inspector: identity, current engagement with its term, 14-day attendance strip, engagement history. */
function Profile({ r, onRenew }: { r: RegRow; onRenew: (term: number) => void }) {
  const s = useStore(); const site = useSite();
  const terms = useContractTerms();
  const [term, setTerm] = useState<string | null>(() => { const t = terms.find((x) => x.days === r.eng?.termDays) ?? terms[0]; return t ? String(t.days) : null; });
  const money = s.cashEntries.filter((c) => c.payee === r.person.fullName && (c.category === 'advance' || c.category === 'payout' || c.category === 'wages')).sort((a, b) => b.at.localeCompare(a.at));
  const paidOut = money.reduce((t, c) => t + c.amount, 0);
  const history = s.engagements.filter((e) => e.personId === r.person.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const days = lastWorkingDays(site.id, s.today, 14);
  const shiftDay = new Map(s.shifts.filter((sh) => sh.siteId === site.id && days.includes(sh.day)).map((sh) => [sh.id, sh.day]));
  const att = s.attendance.filter((a) => a.personId === r.person.id && shiftDay.has(a.shiftId));
  const sum = { present: att.filter((a) => a.status === 'present').length, half: att.filter((a) => a.status === 'half').length, absent: att.filter((a) => a.status === 'absent').length, ot: att.reduce((t, a) => t + a.overtimeHours, 0) };
  const bestOf = (day: string) => att.filter((a) => shiftDay.get(a.shiftId) === day).sort((a, b) => RANK[b.status] - RANK[a.status])[0]?.status;
  const isArchived = r.person.status === 'archived';
  const e = r.eng; const total = e?.endDate ? contractDaysRemaining(e.endDate, e.startDate) : 0; const dayNo = e ? Math.max(0, contractDaysRemaining(s.today, e.startDate)) : 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3.5">
        <Avatar name={r.person.fullName} seed={r.person.avatarSeed} size={52} ring={r.cstate === 'expired' ? 'bad' : r.cstate === 'expiring' ? 'warn' : 'none'} className={cn(isArchived && 'opacity-60')} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 t-sm"><EngTag type={e?.type} /><Status tone={isArchived ? 'neutral' : 'ok'}>{isArchived ? 'Archived' : 'Active'}</Status>{r.isShared ? <Badge tone="accent">from {SITES[r.person.homeSiteId].shortName}</Badge> : r.person.sharedSites.length > 0 ? <Badge>also {r.person.sharedSites.map((x) => SITES[x].shortName).join(', ')}</Badge> : null}{e?.type === 'contract' && r.cstate !== 'open' && <ContractNote endDate={e.endDate} state={r.cstate} today={s.today} />}</div>
          <div className="t-sm text-[var(--text-2)] mt-1">Joined {fmtDayShort(r.person.joinedOn)} · <span className="num">{r.person.phoneMomo}</span></div>
          <div className="t-sm text-[var(--text-3)]">ID <span className="code text-[var(--text-2)]">{r.person.idNumber}</span></div>
        </div>
        <div className="flex gap-1.5 shrink-0 max-sm:hidden"><PhotoFrame icon={CreditCard} label="ID card" className="w-[80px] h-[72px]" /><PhotoFrame icon={ScanFace} label="Face" round className="w-[64px] h-[72px]" /></div>
      </div>

      {e && (
        <section>
          <div className="t-label mb-1.5">Current engagement</div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3">
            <div className="flex items-end justify-between gap-3">
              <div><div className="num t-kpi">{fmtUGX(e.rate)}<span className="t-base font-normal text-[var(--text-2)]"> per {BASIS[e.rateBasis]}</span></div><div className="t-sm text-[var(--text-3)] mt-0.5">{e.settlementCycle === 'end_of_term' ? 'Paid at the end of the term' : e.settlementCycle === 'weekly' ? 'Paid weekly' : 'Paid monthly'} · {SITES[e.siteId].shortName}</div></div>
              {e.type === 'contract' && e.endDate ? <ContractNote endDate={e.endDate} state={r.cstate} today={s.today} /> : <span className="t-sm text-[var(--text-3)]">since {fmtDayShort(e.startDate)}</span>}
            </div>
            {e.type === 'contract' && e.endDate && <div className="mt-3"><TimeTrack progress={total ? dayNo / total : 1} startLabel={fmtDayShort(e.startDate)} endLabel={fmtDayShort(e.endDate)} nowLabel={r.cstate === 'expired' ? 'term over' : `day ${Math.min(dayNo, total)} of ${total}`} color={r.cstate === 'expired' ? 'var(--bad)' : r.cstate === 'expiring' ? 'var(--warn)' : 'var(--series-3)'} /></div>}
            {e.type === 'contract' && !isArchived && (
              <div className="mt-3 pt-3 border-t border-[var(--line)] flex flex-wrap items-center gap-2">
                {terms.length === 0 ? <div className="w-full"><MasterEmpty compact title="No contract terms set up" hint="Add contract terms in Settings → Master data." /></div> : <>
                  <span className="t-sm font-medium text-[var(--text-2)] mr-1">Renew from today</span>
                  <ChipGroup ariaLabel="Renewal term" size="sm" options={terms.map((t) => ({ value: String(t.days), label: t.label }))} value={term} onChange={setTerm} />
                  <Button size="sm" variant="primary" icon={CalendarClock} hotkey="mod+enter" hotkeyLabel="Renew contract" className="ml-auto" onClick={() => term && onRenew(parseInt(term, 10))} disabled={!term}>Renew</Button>
                </>}
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between mb-1.5"><span className="t-label">Attendance, last 14 working days</span><span className="t-xs text-[var(--text-3)]">{site.shortName}</span></div>
        <div className="rounded-lg border border-[var(--line)] p-3">
          <div className="flex justify-between gap-0.5">{days.map((d) => <span key={d} className="flex flex-col items-center gap-1 min-w-0"><MarkDot status={bestOf(d)} title={`${fmtDayShort(d)} · ${bestOf(d) ?? 'not marked'}`} className={cn(!bestOf(d) && 'bg-[var(--surface-2)]')} /><span className={cn('t-xs num', d === s.today ? 'text-[var(--text)] font-semibold' : 'text-[var(--text-4)]')}>{fmtDayShort(d).split(' ')[0]}</span></span>)}</div>
          <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-[var(--line)]">
            {([['Present', sum.present, 'var(--ok)'], ['Half day', sum.half, 'var(--warn)'], ['Absent', sum.absent, 'var(--bad)'], ['Overtime h', sum.ot, 'var(--info)']] as const).map(([l, v, c]) => <div key={l}><div className="flex items-center gap-1.5 t-xs text-[var(--text-3)]"><span className="size-2 rounded-[2px]" style={{ background: c }} />{l}</div><div className="num t-lg font-semibold mt-0.5">{v}</div></div>)}
          </div>
        </div>
        {att.length === 0 && <div className="t-sm text-[var(--text-3)] mt-1.5">No attendance recorded at {site.shortName} in this period.</div>}
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-1.5"><span className="t-label">Paid from the cash book</span>{money.length > 0 && <span className="t-xs text-[var(--text-3)] num">{money.length} entr{money.length === 1 ? 'y' : 'ies'} · {fmtUGX(paidOut)}</span>}</div>
        {money.length === 0 ? <div className="rounded-lg border border-dashed border-[var(--line-2)] px-3 py-2.5 t-sm text-[var(--text-3)]">No advance or payout is recorded against this name.</div> : (
          <div className="rounded-lg border border-[var(--line)] overflow-hidden">
            {money.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center gap-2.5 px-3 h-[var(--row-h)] border-b border-[var(--line)] last:border-b-0 t-base">
                <ArrowDownLeft className="size-3.5 text-[var(--text-3)] shrink-0" />
                <span className="num text-[var(--text-2)] w-[52px] shrink-0">{fmtDayShort(c.day)}</span>
                <Badge tone={c.category === 'advance' ? 'warn' : 'neutral'}>{c.category === 'advance' ? 'Advance' : c.category === 'payout' ? 'Payout' : 'Wages'}</Badge>
                <span className="t-sm text-[var(--text-3)] truncate flex-1 min-w-0">{c.note ?? ''}</span>
                <span className="num font-medium shrink-0">{fmtNum(c.amount)}</span>
              </div>
            ))}
            {money.length > 5 && <div className="px-3 py-1.5 t-sm text-[var(--text-3)] bg-[var(--surface-2)]">and {money.length - 5} earlier</div>}
          </div>
        )}
      </section>

      <section>
        <div className="t-label mb-1.5">Engagement history</div>
        {history.length === 0 ? <div className="t-sm text-[var(--text-3)]">No engagements on file.</div> : (
          <ol className="m-0 p-0 list-none">
            {history.map((h, i) => (
              <li key={h.id} className="relative flex gap-3 pb-3 last:pb-0">
                {i < history.length - 1 && <span className="absolute left-[5px] top-4 bottom-0 w-px bg-[var(--line-2)]" />}
                <span className="relative mt-1 size-[11px] rounded-full border-2 shrink-0" style={{ borderColor: ENG[h.type].color, background: h.status === 'active' ? ENG[h.type].color : 'var(--surface)' }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2"><span className="t-base font-medium">{ENG[h.type].long}{h.termDays ? ` · ${h.termDays} days` : ''}<span className="font-normal text-[var(--text-3)]"> · {SITES[h.siteId].shortName}</span></span><Badge tone={h.status === 'active' ? 'ok' : h.status === 'expired' ? 'bad' : 'neutral'}>{h.status}</Badge></div>
                  <div className="t-sm text-[var(--text-2)] num">{fmtDayShort(h.startDate)} → {h.endDate ? fmtDayShort(h.endDate) : 'open'} · {fmtUGX(h.rate)} per {BASIS[h.rateBasis]}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
