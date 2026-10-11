import { useMemo, useState } from 'react';
import { Banknote, CalendarDays, Camera, Check, CheckCircle2, Download, HandCoins, Lock, PenLine, Receipt, Send, Users, Wallet } from 'lucide-react';
import type { AttendanceStatus, Engagement, Person, SettlementCycle } from '@tanaad/domain';
import { settlementNet } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useRefList, useSite } from '@/app/hooks';
import { Avatar, Badge, Bar, Button, ChipGroup, DataGrid, Empty, Input, KpiStrip, Note, PageHeader, Panel, SearchInput, Sheet, Stat, Tabs, Toolbar, cn, type Column } from '@/components/ui';
import { CountUp } from '@/components/charts';
import { activeEngagement, addDays, dow, lastWorkingDays, sitePeople } from '@/data/selectors';
import { fmtDay, fmtDayShort, fmtNum, fmtTime, fmtUGX } from '@/data/format';
import { BASIS, EngTag, MONTH_WORKING_DAYS, MarkDot, MasterEmpty, STANDARD_DAY_HOURS, downloadCsv } from './kit';

interface Line { no: number; person: Person; eng: Engagement; from: string; units: number; unitLabel: string; otHours: number; marks: { day: string; status?: AttendanceStatus }[]; gross: number; overtime: number; advances: number; net: number; periodNote?: string }
/** A run looks one calendar week ahead for contracts that are about to end. */
const WEEK_DAYS = 7;
/** Cash needs no transaction proof; every other method does. Master data has no flag for this yet, so the label decides. */
const isCash = (label: string) => /cash/i.test(label);
type PayFilter = 'all' | 'unpaid' | 'paid';
const CYCLE_LABEL: Record<SettlementCycle, string> = { weekly: 'weekly', end_of_term: 'end of term', monthly: 'monthly' };
const say = (t: { kind: 'ok' | 'warn' | 'error' | 'info'; title: string; detail?: string }) => useStore.getState().toast(t);
const dash = <span className="text-[var(--text-4)]">–</span>;

/** Settlement runs laid out like the salary sheet, with the arithmetic done by the domain and every payout posted to the cash book. */
export function Settlement() {
  const s = useStore(); const site = useSite();
  const [cycle, setCycle] = useState<SettlementCycle>('weekly');
  const [approved, setApproved] = useState<Partial<Record<SettlementCycle, { by: string; at: string; lines: Line[] }>>>({});
  const [payoutId, setPayoutId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [show, setShow] = useState<PayFilter>('all');
  const user = s.users.find((u) => u.id === s.session?.userId);

  // Period per cycle. Weekly: Mon–Sat of this week. End of term: the contract's own term. Monthly: the current month to date.
  const periodFor = (c: SettlementCycle) => {
    const monday = addDays(s.today, -((dow(s.today) + 6) % 7));
    if (c === 'weekly') return { from: monday, to: addDays(monday, 5), label: `${fmtDayShort(monday)} – ${fmtDayShort(addDays(monday, 5))}` };
    if (c === 'monthly') { const first = s.today.slice(0, 8) + '01'; return { from: first, to: s.today, label: `${fmtDayShort(first)} – ${fmtDayShort(s.today)} · ${MONTH_WORKING_DAYS} working days basis` }; }
    return { from: s.today, to: addDays(s.today, WEEK_DAYS), label: `contracts ending by ${fmtDayShort(addDays(s.today, WEEK_DAYS))}, or already ended` };
  };
  const period = periodFor(cycle);

  const allLines = useMemo<Record<SettlementCycle, Line[]>>(() => {
    const shiftsOf = (from: string, to: string) => new Set(s.shifts.filter((sh) => sh.siteId === site.id && sh.day >= from && sh.day <= to).map((sh) => sh.id));
    const dayOfShift = new Map(s.shifts.filter((sh) => sh.siteId === site.id).map((sh) => [sh.id, sh.day]));
    const rank: Record<AttendanceStatus, number> = { present: 3, half: 2, absent: 1 };
    const worked = (personId: string, ids: Set<string>) => {
      const rows = s.attendance.filter((a) => a.personId === personId && ids.has(a.shiftId));
      const best = new Map<string, AttendanceStatus>(); for (const a of rows) { const d = dayOfShift.get(a.shiftId); if (d && (!best.has(d) || rank[a.status] > rank[best.get(d) as AttendanceStatus])) best.set(d, a.status); }
      return { units: rows.reduce((t, a) => t + (a.status === 'present' ? 1 : a.status === 'half' ? 0.5 : 0), 0), ot: rows.reduce((t, a) => t + a.overtimeHours, 0), best };
    };
    // The working days a line covers, capped at the last 14 so the strip stays readable.
    const stripDays = (from: string, to: string) => lastWorkingDays(site.id, to > s.today ? s.today : to, 14).filter((d) => d >= from);
    const advancesFor = (name: string, from: string, to: string) => s.cashEntries.filter((e) => e.siteId === site.id && e.category === 'advance' && e.payee === name && e.day >= from && e.day <= to).reduce((t, e) => t + e.amount, 0);
    const people = sitePeople(s, site.id).filter((p) => p.status === 'active');
    const compute = (c: SettlementCycle): Line[] => {
      const p0 = periodFor(c); const out: Line[] = [];
      for (const p of people) {
        const eng = activeEngagement(s, p.id); if (!eng) continue;
        let from = p0.from, to = p0.to, note: string | undefined;
        if (c === 'weekly') { if (eng.type !== 'casual') continue; }
        else if (c === 'monthly') { if (eng.type !== 'permanent') continue; }
        else { if (eng.type !== 'contract' || !eng.endDate || eng.endDate > addDays(s.today, WEEK_DAYS) || (eng.status !== 'active' && eng.status !== 'expired')) continue; from = eng.startDate; to = eng.endDate; note = eng.endDate < s.today ? `ended ${fmtDayShort(eng.endDate)}` : eng.endDate === s.today ? 'ends today' : `ends ${fmtDayShort(eng.endDate)}`; }
        const w = worked(p.id, shiftsOf(from, to));
        const unitsWorked = eng.rateBasis === 'month' ? w.units / MONTH_WORKING_DAYS : w.units;
        const perHour = eng.rateBasis === 'month' ? eng.rate / MONTH_WORKING_DAYS / STANDARD_DAY_HOURS : eng.rate / STANDARD_DAY_HOURS;
        const adv = advancesFor(p.fullName, from, to);
        const r = settlementNet({ rateBasis: eng.rateBasis, rate: eng.rate, unitsWorked, overtimeHours: w.ot, overtimeRatePerHour: perHour, advances: adv });
        // Whole shillings only: the pro-rated monthly figures are rounded per line so the sheet, the payout and the cash book agree.
        const gross = Math.round(r.gross), overtime = Math.round(r.overtime);
        out.push({ no: 0, person: p, eng, from, units: w.units, unitLabel: eng.rateBasis === 'shift' ? 'shifts' : 'days', otHours: w.ot, marks: stripDays(from, to).map((d) => ({ day: d, status: w.best.get(d) })), gross, overtime, advances: r.advances, net: gross + overtime - r.advances, periodNote: note });
      }
      return out.sort((a, b) => a.person.sector.localeCompare(b.person.sector) || a.person.fullName.localeCompare(b.person.fullName)).map((l, i) => ({ ...l, no: i + 1 }));
    };
    return { weekly: compute('weekly'), end_of_term: compute('end_of_term'), monthly: compute('monthly') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, site.id]);
  const liveLines = allLines[cycle];

  const lock = approved[cycle];
  const lines = lock ? lock.lines : liveLines;
  // A line is paid when the cash book holds a payout to that worker for this kind of run, inside the line's own period.
  const paidEntry = (l: Line, c: SettlementCycle = cycle) => s.cashEntries.find((e) => e.siteId === site.id && e.category === 'payout' && e.payee === l.person.fullName && e.day >= l.from && !!e.note?.includes(`${CYCLE_LABEL[c]} settlement`));
  const isPaid = (l: Line) => !!paidEntry(l);
  const paidCount = lines.filter(isPaid).length;
  const totals = lines.reduce((t, l) => ({ units: t.units + l.units, ot: t.ot + l.otHours, gross: t.gross + l.gross, overtime: t.overtime + l.overtime, advances: t.advances + l.advances, net: t.net + l.net, paid: t.paid + (isPaid(l) ? l.net : 0) }), { units: 0, ot: 0, gross: 0, overtime: 0, advances: 0, net: 0, paid: 0 });
  const countFor = (c: SettlementCycle) => (approved[c]?.lines ?? allLines[c]).length;
  const needle = q.trim().toLowerCase();
  const shown = lines.filter((l) => (show === 'all' || (show === 'paid') === isPaid(l)) && (!needle || l.person.fullName.toLowerCase().includes(needle) || l.person.phoneMomo.includes(needle)));
  const payout = lines.find((l) => l.person.id === payoutId) ?? null;
  const unitName = cycle === 'end_of_term' ? 'Shifts' : 'Days';

  const approve = () => { if (lock || liveLines.length === 0) return; setApproved((a) => ({ ...a, [cycle]: { by: user?.name ?? 'Site Manager', at: new Date().toISOString(), lines: liveLines } })); say({ kind: 'ok', title: 'Run approved and locked', detail: `${liveLines.length} lines · ${fmtUGX(totals.net)}` }); };

  const confirmPayout = (line: Line, method: string, ref: string) => {
    s.addCashEntry({ siteId: site.id, day: s.today, direction: 'out', category: 'payout', amount: line.net, payee: line.person.fullName, note: `${method}${ref ? ` · ${ref}` : ''} · ${CYCLE_LABEL[cycle]} settlement`, hasReceiptPhoto: true });
    setPayoutId(null);
    say({ kind: 'ok', title: 'Paid, posted to cash book', detail: `${line.person.fullName} · ${fmtUGX(line.net)} · ${method}` });
  };

  const exportCsv = () => {
    const name = `${site.id}-settlement-${cycle}-${s.today}.csv`;
    downloadCsv(name, [
      ['No', 'Name', 'ID number', 'Phone', 'Sector', 'Engagement', 'Rate', 'Basis', 'Units worked', 'OT hours', 'Gross', 'Overtime', 'Advances', 'Net', 'Paid'],
      ...lines.map((l) => [l.no, l.person.fullName, l.person.idNumber, l.person.phoneMomo, l.person.sector, l.eng.type, l.eng.rate, l.eng.rateBasis, l.units, l.otHours, l.gross, l.overtime, l.advances, l.net, isPaid(l) ? 'yes' : 'no']),
      ['', 'TOTAL', '', '', '', '', '', '', totals.units, totals.ot, totals.gross, totals.overtime, totals.advances, totals.net, ''],
    ]);
    say({ kind: 'ok', title: 'CSV downloaded', detail: name });
  };

  const columns: Column<Line>[] = [
    { key: 'no', header: 'No.', mono: true, width: 44, sort: (l) => l.no, cell: (l) => <span className="text-[var(--text-3)]">{l.no}</span> },
    { key: 'name', header: 'Name', sticky: true, sort: (l) => l.person.fullName, cell: (l) => <span className="inline-flex items-center gap-2"><Avatar name={l.person.fullName} seed={l.person.avatarSeed} size={22} /><span className={cn('font-medium', isPaid(l) && 'text-[var(--text-2)]')}>{l.person.fullName}</span>{l.periodNote && <Badge tone={l.periodNote.startsWith('ended') ? 'bad' : 'warn'}>{l.periodNote}</Badge>}</span> },
    { key: 'sector', header: 'Sector', sort: (l) => l.person.sector, cell: (l) => <span className="text-[var(--text-2)]">{l.person.sector}</span> },
    { key: 'phone', header: 'Mobile money', mono: true, cell: (l) => <span className="text-[var(--text-2)]">{l.person.phoneMomo}</span> },
    { key: 'rate', header: 'Rate', align: 'right', mono: true, sort: (l) => l.eng.rate, cell: (l) => <>{fmtNum(l.eng.rate)}<span className="t-sm text-[var(--text-3)]"> /{BASIS[l.eng.rateBasis]}</span></> },
    { key: 'units', header: unitName, align: 'right', mono: true, sort: (l) => l.units, cell: (l) => fmtNum(l.units) },
    { key: 'ot', header: 'OT h', align: 'right', mono: true, sort: (l) => l.otHours, cell: (l) => (l.otHours ? l.otHours : dash) },
    { key: 'gross', header: 'Gross', align: 'right', mono: true, sort: (l) => l.gross, cell: (l) => fmtNum(l.gross) },
    { key: 'overtime', header: 'Overtime', align: 'right', mono: true, sort: (l) => l.overtime, cell: (l) => (l.overtime ? fmtNum(l.overtime) : dash) },
    { key: 'adv', header: 'Advances', align: 'right', mono: true, sort: (l) => l.advances, cell: (l) => (l.advances ? `−${fmtNum(l.advances)}` : dash) },
    { key: 'net', header: 'Net', align: 'right', mono: true, sort: (l) => l.net, cell: (l) => <span className="font-semibold">{fmtNum(l.net)}</span> },
    { key: 'pay', header: 'Payout', align: 'right', sort: (l) => (isPaid(l) ? 1 : 0), cell: (l) => { const e = paidEntry(l); return e ? <Badge tone="ok"><Check className="size-3" strokeWidth={3} />Paid · {e.note?.split(' · ')[0]}</Badge> : <Button size="sm" icon={Wallet} onClick={(ev) => { ev.stopPropagation(); setPayoutId(l.person.id); }} disabled={l.net <= 0}>Pay out</Button>; } },
  ];

  const pctPaid = totals.net > 0 ? Math.round((totals.paid / totals.net) * 100) : 0;
  return (
    <div>
      <PageHeader eyebrow={`People · ${site.name}`} title="Settlement" meta={lock ? <Badge tone="ok"><Lock className="size-3" />Approved and locked</Badge> : <Badge tone="neutral" dot>Draft run</Badge>}
        subtitle={`Period: ${period.label}. Totals in UGX.`}
        actions={<><Button icon={Download} hotkey="e" hotkeyLabel="Export the run as CSV" onClick={exportCsv} disabled={lines.length === 0}>Export CSV</Button><Button variant="primary" icon={lock ? Lock : PenLine} hotkey="shift+a" hotkeyLabel="Approve and lock the run" onClick={approve} disabled={!!lock || lines.length === 0}>{lock ? 'Approved' : 'Approve run'}</Button></>}
        tabs={<Tabs variant="underline" value={cycle} onChange={(c) => { setCycle(c); setPayoutId(null); setShow('all'); }} tabs={[{ value: 'weekly', label: 'Weekly casuals', count: countFor('weekly') }, { value: 'end_of_term', label: 'End-of-term contracts', count: countFor('end_of_term') }, { value: 'monthly', label: 'Monthly', count: countFor('monthly') }]} />} />

      <KpiStrip className="mb-[var(--gap)]">
        <Stat label="Workers" icon={Users} accent="var(--series-1)" value={<CountUp value={lines.length} />} sub={`${paidCount} paid · ${lines.length - paidCount} to pay`} />
        <Stat label={`${unitName} worked`} icon={CalendarDays} accent="var(--series-7)" value={<CountUp value={totals.units} format={(n) => fmtNum(Math.round(n * 2) / 2)} />} sub={`${totals.ot} overtime hours`} />
        <Stat label="Gross" icon={Banknote} accent="var(--series-3)" value={<CountUp value={totals.gross} />} sub={totals.overtime ? `plus ${fmtNum(totals.overtime)} overtime` : 'no overtime in this period'} />
        <Stat label="Advances" icon={HandCoins} accent="var(--series-2)" value={totals.advances ? <>−<CountUp value={totals.advances} /></> : '0'} sub="taken from the cash book" />
        <Stat label="Net payable" icon={Wallet} accent="var(--series-4)" value={<CountUp value={totals.net} />} sub={`UGX · ${lines.length} line${lines.length === 1 ? '' : 's'}`} />
        <Stat label="Paid so far" icon={CheckCircle2} accent="var(--ok)" tone={lines.length > 0 && paidCount === lines.length ? 'ok' : 'neutral'} value={<CountUp value={totals.paid} />} sub={<><Bar value={totals.paid} max={totals.net || 1} tone="ok" height={4} className="mb-1" /><span className="num">{pctPaid}% · {fmtNum(totals.net - totals.paid)} to go</span></>} />
      </KpiStrip>

      {lock && <Note tone="ok" className="mb-[var(--gap)]"><b>Locked.</b> Approved by {lock.by} at {fmtTime(lock.at)}. Attendance changes made after approval do not change these lines.</Note>}
      {cycle === 'monthly' && <Note tone="warn" className="mb-[var(--gap)]">Monthly pay is pro-rated on {MONTH_WORKING_DAYS} working days to date. The working-day basis and full-month rules (public holidays, leave) are to be confirmed with the client.</Note>}

      <Toolbar right={<span className="t-sm text-[var(--text-3)] num whitespace-nowrap">{shown.length} of {lines.length} lines</span>}>
        <SearchInput value={q} onChange={setQ} placeholder="Find a worker or number" className="max-w-[240px]" />
        <ChipGroup ariaLabel="Payout status" size="sm" value={show} onChange={setShow} options={[{ value: 'all', label: `All ${lines.length}` }, { value: 'unpaid', label: `To pay ${lines.length - paidCount}` }, { value: 'paid', label: `Paid ${paidCount}` }]} />
      </Toolbar>

      <DataGrid rows={shown} columns={columns} rowKey={(l) => l.person.id} dense onRowClick={(l) => setPayoutId(l.person.id)} selectedKey={payoutId} maxHeight="max(340px, calc(100dvh - 449px))" className="[&_tfoot]:z-[5]"
        empty={lines.length === 0
          ? <Empty icon={Wallet} title={cycle === 'end_of_term' ? 'No contracts ending this week' : cycle === 'weekly' ? 'No casual workers on the roster' : 'No permanent staff on the roster'} hint={cycle === 'end_of_term' ? 'Contracts appear here a week before their end date, and stay until renewed or paid out.' : 'Sign up workers and they appear here with their attendance.'} />
          : <Empty icon={Wallet} title="No line matches" hint="Clear the search or show all lines." action={<Button size="sm" onClick={() => { setQ(''); setShow('all'); }}>Show all</Button>} />}
        footer={lines.length ? <tr><td colSpan={5}>Total · {lines.length} worker{lines.length === 1 ? '' : 's'}</td><td className="text-right num">{fmtNum(totals.units)}</td><td className="text-right num">{totals.ot}</td><td className="text-right num">{fmtNum(totals.gross)}</td><td className="text-right num">{fmtNum(totals.overtime)}</td><td className="text-right num">{totals.advances ? `−${fmtNum(totals.advances)}` : '–'}</td><td className="text-right num">{fmtNum(totals.net)}</td><td className="text-right t-sm font-normal text-[var(--text-2)] num">{paidCount}/{lines.length} paid</td></tr> : undefined} />

      <Panel className="mt-[var(--gap)]" icon={PenLine} title="Sign-off" sub="prepared, approved, paid" pad={false} footer={`Overtime at rate ÷ ${STANDARD_DAY_HOURS} per hour (to be confirmed). Half day counts 0.5. Advances are cash-book entries in the period, category “advance”, matched by name.`}>
        <div className="grid md:grid-cols-3 md:divide-x divide-[var(--line)] max-md:divide-y">
          <div className="px-[var(--pad)] py-3"><div className="t-label">Prepared from attendance</div><div className="t-base font-medium mt-1">{lines.length} line{lines.length === 1 ? '' : 's'} · {fmtUGX(totals.net)}</div><div className="t-sm text-[var(--text-3)]">{fmtDay(s.today)} · {CYCLE_LABEL[cycle]} run</div></div>
          <div className="px-[var(--pad)] py-3"><div className="t-label">Approved by</div>
            {lock ? <><div className="mt-1 border-b border-[var(--text-3)] pb-0.5 max-w-[240px] font-serif italic t-lg">{lock.by}</div><div className="t-sm text-[var(--text-3)] mt-1 inline-flex items-center gap-1"><Lock className="size-3" />Signed {fmtTime(lock.at)} · run locked</div></>
              : <><div className="mt-1 border-b border-dashed border-[var(--line-2)] pb-0.5 max-w-[240px] t-lg text-[var(--text-4)]">Awaiting signature</div><div className="t-sm text-[var(--text-3)] mt-1">Approving freezes the lines against later attendance edits.</div></>}
          </div>
          <div className="px-[var(--pad)] py-3"><div className="t-label">Paid out</div><div className="t-base font-medium mt-1 num">{paidCount} of {lines.length} · {fmtUGX(totals.paid)}</div><div className="t-sm text-[var(--text-3)]">Every payout is a line in today's cash book.</div></div>
        </div>
      </Panel>

      <PayoutSheet key={payoutId ?? 'none'} line={payout} cycle={cycle} paid={payout ? paidEntry(payout) : undefined} onClose={() => setPayoutId(null)} onConfirm={confirmPayout} today={s.today} />
    </div>
  );
}

function PayoutSheet({ line, cycle, paid, onClose, onConfirm, today }: { line: Line | null; cycle: SettlementCycle; paid?: { note?: string; at: string; amount: number }; onClose: () => void; onConfirm: (l: Line, m: string, ref: string) => void; today: string }) {
  const methods = useRefList('payment_method');
  const [method, setMethod] = useState<string | null>(() => methods[0]?.label ?? null);
  const [ref, setRef] = useState('');
  const [shot, setShot] = useState(false);
  const proof = !!method && !isCash(method);
  const ready = !!line && !!method && line.net > 0 && (!proof || ref.trim().length >= 4 || shot);
  const confirm = () => { if (line && method && ready) onConfirm(line, method, shot && !ref ? 'screenshot' : ref.trim()); };
  const seen = line ? line.marks.filter((m) => m.status === 'present' || m.status === 'half').length : 0;
  return (
    <Sheet open={!!line} onClose={onClose} title={paid ? 'Payout recorded' : 'Record payout'} sub={line ? `${CYCLE_LABEL[cycle]} settlement · line ${line.no}` : undefined} width={460}
      footer={line && (paid ? <Button onClick={onClose}>Close</Button> : <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={Check} hotkey="mod+enter" hotkeyLabel="Confirm payout" disabled={!ready} onClick={confirm}>Confirm {fmtUGX(line.net)}</Button></>)}>
      {line && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={line.person.fullName} seed={line.person.avatarSeed} size={44} />
            <div className="min-w-0 flex-1"><div className="t-lg font-semibold truncate">{line.person.fullName}</div><div className="t-sm text-[var(--text-3)] flex flex-wrap items-center gap-x-2"><span>{line.person.sector}</span><EngTag type={line.eng.type} /><span className="num">{line.person.phoneMomo}</span></div></div>
            {line.periodNote && <Badge tone={line.periodNote.startsWith('ended') ? 'bad' : 'warn'} dot>{line.periodNote}</Badge>}
          </div>
          {line.marks.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between mb-1.5"><span className="t-label">Attendance in the period</span><span className="t-xs text-[var(--text-3)] num">{seen} of {line.marks.length} working days{line.otHours ? ` · ${line.otHours} h overtime` : ''}</span></div>
              <div className="rounded-lg border border-[var(--line)] p-2.5 flex flex-wrap gap-x-1 gap-y-2">{line.marks.map((m) => <span key={m.day} className="flex flex-col items-center gap-1 w-[26px] touch:w-9"><MarkDot status={m.status} title={`${fmtDay(m.day)} · ${m.status ?? 'not marked'}`} className={cn(!m.status && 'bg-[var(--surface-2)]')} /><span className={cn('t-xs num', m.day === today ? 'text-[var(--text)] font-semibold' : 'text-[var(--text-4)]')}>{fmtDayShort(m.day).split(' ')[0]}</span></span>)}</div>
            </section>
          )}
          <div className="rounded-lg border border-[var(--line)] overflow-hidden">
            {([[`${fmtNum(line.units)} ${line.unitLabel} at ${fmtNum(line.eng.rate)} per ${BASIS[line.eng.rateBasis]}`, fmtNum(line.gross)], [`Overtime, ${line.otHours} h`, line.overtime ? `+${fmtNum(line.overtime)}` : '0'], ['Advances already taken', line.advances ? `−${fmtNum(line.advances)}` : '0']] as const).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 px-3 h-[var(--row-h)] border-b border-[var(--line)] t-base"><span className="text-[var(--text-2)]">{k}</span><span className="num">{v}</span></div>
            ))}
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-[var(--surface-2)]"><span className="t-base font-medium">Net to pay</span><span className="num t-kpi">{fmtUGX(line.net)}</span></div>
          </div>
          {paid ? (
            <Note tone="ok"><b>Paid by {paid.note?.split(' · ')[0] ?? 'cash'}.</b> Posted to the cash book at {fmtTime(paid.at)} as a payout of {fmtUGX(paid.amount)}.{paid.note && paid.note.split(' · ').length > 2 ? <> Reference <span className="code">{paid.note.split(' · ')[1]}</span>.</> : null}</Note>
          ) : methods.length === 0 ? (
            <MasterEmpty icon={Wallet} title="No payment methods set up" hint="Add payment methods in Settings → Master data before recording a payout." />
          ) : (
            <>
              <div>
                <div className="t-sm font-medium text-[var(--text-2)] mb-1">Paid by</div>
                <ChipGroup ariaLabel="Payment method" columns={methods.length <= 4 ? 2 : 3} value={method} onChange={(m) => { setMethod(m); setShot(false); }} options={methods.map((m) => ({ value: m.label, label: <>{isCash(m.label) ? <Banknote className="size-4 shrink-0" /> : <Send className="size-4 shrink-0" />}<span className="truncate">{m.label}</span></> }))} />
              </div>
              {proof ? (
                <div className="flex flex-col gap-2.5">
                  <div className="t-sm text-[var(--text-2)]">Send to <b className="num text-[var(--text)]">{line.person.phoneMomo}</b>, then keep the proof: a transaction ID or the confirmation screenshot.</div>
                  <label className="block"><div className="t-sm font-medium text-[var(--text-2)] mb-1">{method} transaction ID</div><Input data-autofocus="" placeholder="Transaction ID from the confirmation message" value={ref} onChange={(e) => setRef(e.target.value)} className="code" autoComplete="off" /></label>
                  <button type="button" onClick={() => setShot(true)} className={cn('w-full rounded-lg border px-3 py-3 flex items-center gap-3 text-left transition-colors', shot ? 'border-[color-mix(in_srgb,var(--ok)_45%,transparent)] bg-[var(--ok-bg)]' : 'border-dashed border-[var(--line-2)] bg-[var(--surface-2)] hover:border-[var(--text-3)]')}>
                    <span className={cn('size-9 rounded-lg grid place-items-center shrink-0', shot ? 'bg-[var(--ok)] text-white' : 'bg-[var(--surface-3)] text-[var(--text-2)]')}>{shot ? <Check className="size-4" strokeWidth={3} /> : <Camera className="size-4" />}</span>
                    <span className="min-w-0"><span className="block t-base font-medium">{shot ? 'Screenshot captured' : 'Capture the confirmation screenshot'}</span><span className="block t-sm text-[var(--text-3)]">{shot ? 'Stored with the cash-book line as proof.' : 'Use this when there is no transaction ID to type.'}</span></span>
                  </button>
                </div>
              ) : (
                <Note tone="neutral" icon={Receipt}>Cash leaves the safe today ({fmtDay(today)}) and is posted to the cash book as a payout.</Note>
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
