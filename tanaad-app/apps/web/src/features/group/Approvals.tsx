import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronUp, CircleCheck, ExternalLink, History, Inbox, Pause, ShieldCheck } from 'lucide-react';
import type { BusinessException, ExceptionKind, SiteCode } from '@tanaad/domain';
import { useStore, type AppState } from '@/data/store';
import { useGo, useQueryParam } from '@/app/hooks';
import { Avatar, Badge, Button, DataGrid, Empty, IconButton, Input, Kbd, Meter, MiniBars, PageHeader, Panel, SearchInput, Sheet, Split, StackedBar, Tabs, Toolbar, cn, useIsTouch, useMedia, type Column, type Tone } from '@/components/ui';
import { SITES, SITE_LIST } from '@/config/sites';
import { SITE_COLOR } from '@/config/siteIdentity';
import { roleLabel } from '@/config/roles';
import { activeEngagement, cashSummary, clientBalance, currentShiftKind, lastWorkingDays, liveSite, machineWall, massBalanceDay, openExceptions, orderTotal } from '@/data/selectors';
import { fmtDateTime, fmtDay, fmtDayShort, fmtKg, fmtMoney, fmtNum, fmtTime, fmtUGX } from '@/data/format';
import { IconChip, KIND_META, KV, catLabel, ReasonQuote, SEVERITIES, SEVERITY_ICON, SiteBadge, agoLabel, plural, setPresetSelection, severityColor, severityLabel, severityTone, takePresetSelection, useListKeys } from './shared';

type Decision = 'approved' | 'held' | 'resolved';
const DECISION: Record<Decision, { verb: string; doing: string; done: string; tone: Tone; variant: 'ok' | 'secondary' | 'primary'; hint: string }> = {
  approved: { verb: 'Approve', doing: 'Confirm approve', done: 'Approved', tone: 'ok', variant: 'ok', hint: 'Why you are approving it (optional)' },
  held: { verb: 'Hold', doing: 'Confirm hold', done: 'On hold', tone: 'warn', variant: 'secondary', hint: 'What has to happen before this can move' },
  resolved: { verb: 'Resolve', doing: 'Confirm resolve', done: 'Resolved', tone: 'accent', variant: 'primary', hint: 'What was done to settle it' },
};

/** What the records say about an exception: the numbers, one comparison, a short trend and the lines behind it. */
interface Insight { facts: [string, ReactNode][]; meter?: { label: string; value: number; max: number; display: ReactNode; tone: Tone | 'series' }; trend?: { title: string; data: { label: string; value: number; partial?: boolean }[]; unit: string }; records?: { title: string; rows: { key: string; title: ReactNode; sub?: ReactNode; right?: ReactNode }[] }; link?: { label: string; to: 'credit'; id: string } }

function insightFor(s: AppState, e: BusinessException): Insight {
  const site = liveSite(s, SITES[e.siteId]); const person = (id?: string) => s.people.find((p) => p.id === id);
  const machine = s.machines.find((m) => m.id === e.subjectRef);
  if (machine) {
    const tile = machineWall(s, e.siteId, s.today, currentShiftKind()).find((t) => t.machine.id === machine.id);
    const entries = s.production.filter((p) => p.machineId === machine.id).sort((a, b) => b.at.localeCompare(a.at));
    const days = lastWorkingDays(e.siteId, s.today, 7);
    return {
      facts: [['Machine', machine.code], ['Operator', tile?.operator?.fullName ?? 'Nobody logged'], ['Product', tile?.product?.internalName ?? '—'], ['Logged this shift', tile?.entry ? fmtNum(tile.entry.goodUnits) : 'No entry'], ['Due by now', tile?.expectedSoFar !== undefined ? fmtNum(tile.expectedSoFar) : 'No benchmark'], ['Downtime', tile?.entry?.downtimeMin ? `${tile.entry.downtimeMin} min · ${tile.entry.downtimeReason ?? 'no reason given'}` : 'None recorded']],
      meter: tile?.pct !== undefined && tile.expectedSoFar ? { label: 'Against the benchmark due by now', value: tile.entry?.goodUnits ?? 0, max: Math.max(tile.expectedSoFar, tile.entry?.goodUnits ?? 0), display: `${tile.pct}%`, tone: tile.pct < site.thresholds.benchmarkPct ? 'bad' : 'ok' } : undefined,
      trend: { title: `${machine.code}, output per day`, unit: 'units', data: days.map((d) => ({ label: fmtDayShort(d), value: entries.filter((p) => p.day === d).reduce((t, p) => t + p.goodUnits, 0), partial: d === s.today })) },
      records: { title: 'Latest entries on this machine', rows: entries.slice(0, 4).map((p) => ({ key: p.id, title: `${fmtDay(p.day)} · ${p.shiftId.endsWith('night') ? 'night' : 'day'} shift`, sub: `${person(p.operatorId)?.fullName ?? 'No operator'}${p.downtimeMin ? ` · ${p.downtimeMin} min down${p.downtimeReason ? ` (${p.downtimeReason})` : ''}` : ''}`, right: <span className="num font-medium">{fmtNum(p.goodUnits)}</span> })) },
    };
  }
  const cd = e.kind === 'cash_variance' ? s.cashDays.find((c) => c.id === e.subjectRef) : undefined;
  if (cd) {
    const c = cashSummary(s, cd.id); const out = c.entries.filter((x) => x.direction === 'out').sort((a, b) => b.amount - a.amount);
    return {
      facts: [['Cash day', fmtDay(cd.day)], ['Opening', fmtUGX(cd.opening)], ['Cash in', fmtUGX(c.sales + c.receipts)], ['Cash out', fmtUGX(c.expenses + c.wages)], ['Expected closing', fmtUGX(c.expectedClosing)], ['Counted closing', cd.countedClosing !== undefined ? fmtUGX(cd.countedClosing) : 'Not counted'], ['Variance', c.variance !== undefined ? <span className={cn(Math.abs(c.variance) > site.thresholds.cashVariance && 'text-[var(--bad)]')}>{c.variance > 0 ? '+' : c.variance < 0 ? '−' : ''}{fmtUGX(Math.abs(c.variance))}</span> : '—'], ['Site threshold', fmtUGX(site.thresholds.cashVariance)]],
      meter: c.variance !== undefined ? { label: 'Variance against the threshold', value: Math.abs(c.variance), max: Math.max(Math.abs(c.variance), site.thresholds.cashVariance), display: `${Math.round((Math.abs(c.variance) / site.thresholds.cashVariance) * 100)}% of threshold`, tone: Math.abs(c.variance) > site.thresholds.cashVariance ? 'bad' : 'ok' } : undefined,
      records: { title: 'Largest payments that day', rows: out.slice(0, 4).map((x) => ({ key: x.id, title: `${catLabel(s.refs, x.category)}${x.subcategory ? ` · ${x.subcategory}` : ''}`, sub: `${x.payee ?? 'No payee'} · ${fmtTime(x.at)}${x.hasReceiptPhoto ? ' · receipt' : ' · no receipt'}`, right: <span className="num font-medium">{fmtNum(x.amount)}</span> })) },
    };
  }
  const worker = e.kind === 'ghost_worker' || e.kind === 'contract_expiring' ? person(e.subjectRef) : undefined;
  if (worker) {
    const eng = activeEngagement(s, worker.id); const days = lastWorkingDays(e.siteId, s.today, 7);
    const marks = days.map((d) => { const ids = s.shifts.filter((sh) => sh.day === d).map((sh) => sh.id); return { d, a: s.attendance.find((x) => x.personId === worker.id && ids.includes(x.shiftId)) }; });
    return {
      facts: [['Worker', worker.fullName], ['Sector', worker.sector], ['Engagement', eng ? `${eng.type}, paid per ${eng.rateBasis}` : '—'], ['Rate', eng ? fmtMoney(eng.rate, eng.currency) : '—'], ['Started', eng ? fmtDay(eng.startDate) : fmtDay(worker.joinedOn)], ['Ends', eng?.endDate ? fmtDay(eng.endDate) : 'Open-ended'], ['Mobile money', worker.phoneMomo], ['Days present, last 7', `${marks.filter((m) => m.a && m.a.status !== 'absent').length} of ${days.length}`]],
      records: { title: 'Attendance, last 7 working days', rows: [...marks].reverse().map((m) => ({ key: m.d, title: fmtDay(m.d), sub: m.a ? `${m.a.shiftId.endsWith('night') ? 'night' : 'day'} shift · marked ${fmtTime(m.a.at)}` : 'not on any shift sheet', right: <Badge tone={!m.a || m.a.status === 'absent' ? 'bad' : m.a.status === 'half' ? 'warn' : 'ok'}>{m.a?.status ?? 'not marked'}</Badge> })) },
    };
  }
  if (e.kind === 'low_stock') {
    const part = s.parts.find((p) => p.id === e.subjectRef) ?? s.parts.find((p) => p.siteId === e.siteId && e.title.startsWith(p.name));
    if (part) {
      const issues = s.partIssues.filter((i) => i.partId === part.id).sort((a, b) => b.at.localeCompare(a.at));
      return {
        facts: [['Part', part.name], ['On hand', `${part.onHand} ${part.unit}`], ['Minimum', `${part.minLevel} ${part.unit}`], ['Unit cost', fmtUGX(part.unitCost)], ['To reach minimum', `${Math.max(0, part.minLevel - part.onHand)} ${part.unit} · ${fmtUGX(Math.max(0, part.minLevel - part.onHand) * part.unitCost)}`], ['Issued so far', plural(issues.reduce((t, i) => t + i.qty, 0), part.unit, part.unit)]],
        meter: { label: 'On hand against the minimum', value: part.onHand, max: Math.max(part.minLevel, part.onHand), display: `${part.onHand} of ${part.minLevel}`, tone: part.onHand < part.minLevel ? 'bad' : 'ok' },
        records: issues.length ? { title: 'Latest issues from the spares store', rows: issues.slice(0, 4).map((i) => ({ key: i.id, title: s.machines.find((m) => m.id === i.machineId)?.code ?? i.machineId, sub: `${s.users.find((u) => u.id === i.mechanicId)?.name ?? person(i.mechanicId)?.fullName ?? 'Mechanic'} · ${fmtDateTime(i.at)}`, right: <span className="num font-medium">{i.qty} {part.unit}</span> })) } : undefined,
      };
    }
  }
  if (e.kind === 'credit_over_limit') {
    // The order must belong to the client the exception names; otherwise fall back to that client's order still waiting.
    const named = (o: (typeof s.orders)[number]) => { const c = s.clients.find((x) => x.id === o.clientId); return !!c && e.title.includes(c.name); };
    const order = s.orders.find((o) => e.detail.includes(o.number) && named(o)) ?? s.orders.find((o) => o.status === 'awaiting_approval' && named(o));
    const client = s.clients.find((c) => c.id === order?.clientId);
    if (order && client) {
      const b = clientBalance(s, client.id); const total = orderTotal(order); const after = b.balance + total; const pct = client.creditLimit ? Math.round((after / client.creditLimit) * 100) : 0;
      return {
        facts: [['Client', client.name], ['Order', <span className="code">{order.number}</span>], ['Order total', fmtMoney(total, order.currency)], ['Balance now', fmtMoney(b.balance, client.currencyPref)], ['Credit limit', fmtMoney(client.creditLimit, client.currencyPref)], ['After this order', fmtMoney(after, client.currencyPref)], ['Oldest open invoice', b.openInvoices.length ? `${b.ageDays} days · terms ${client.creditDays}` : 'None open'], ['Last payment', b.lastPayment ? `${fmtMoney(b.lastPayment.amount, b.lastPayment.currency)} · ${fmtDayShort(b.lastPayment.at.slice(0, 10))}` : 'None on record']],
        meter: { label: 'Credit used after this order', value: Math.min(after, client.creditLimit || after), max: client.creditLimit || after || 1, display: `${pct}% of limit`, tone: pct > 100 ? 'bad' : pct > 80 ? 'warn' : 'ok' },
        records: b.openInvoices.length ? { title: 'Open invoices', rows: b.openInvoices.map((i) => ({ key: i.id, title: <span className="code">{i.number}</span>, sub: `issued ${fmtDateTime(i.issuedAt)}`, right: <span className="num font-medium">{fmtMoney(i.total, i.currency)}</span> })) } : undefined,
        link: order.status === 'awaiting_approval' ? { label: 'Open the order in the credit desk', to: 'credit', id: order.id } : undefined,
      };
    }
  }
  const dsp = s.dispatches.find((d) => d.id === e.subjectRef);
  if (dsp) {
    const order = s.orders.find((o) => o.id === dsp.orderId); const client = s.clients.find((c) => c.id === order?.clientId);
    return {
      facts: [['Delivery note', <span className="code">{dsp.deliveryNoteNo}</span>], ['Client', client?.name ?? '—'], ['Bundles scanned', fmtNum(dsp.scannedLabelIds.length)], ['Expected weight', fmtKg(dsp.expectedKg)], ['Gate scale', dsp.gateKg !== undefined ? fmtKg(dsp.gateKg) : 'Not weighed'], ['Variance', dsp.variancePct !== undefined ? `${dsp.variancePct > 0 ? '+' : ''}${dsp.variancePct.toFixed(1)}% · tolerance ±${site.thresholds.gateTolerancePct}%` : '—'], ['Driver', `${dsp.driver} · ${dsp.vehicle}`], ['Gate status', <Badge tone={dsp.gateStatus === 'pass' ? 'ok' : dsp.gateStatus === 'hold' ? 'bad' : dsp.gateStatus === 'overridden' ? 'warn' : 'neutral'} dot>{dsp.gateStatus}</Badge>], ...(dsp.pod ? [['Receiver counted', `${dsp.pod.bundlesCounted} of ${dsp.pod.bundlesExpected} · ${dsp.pod.receiverName}`] as [string, ReactNode]] : [])],
      meter: dsp.gateKg !== undefined ? { label: 'Scale reading against expected weight', value: dsp.gateKg, max: Math.max(dsp.expectedKg, dsp.gateKg), display: `${fmtKg(dsp.gateKg)} of ${fmtKg(dsp.expectedKg)}`, tone: dsp.gateStatus === 'hold' ? 'bad' : 'ok' } : undefined,
    };
  }
  if (e.kind === 'mass_gap' || e.kind === 'gate_variance') {
    const mb = massBalanceDay(s, e.siteId, s.today);
    return { facts: e.kind === 'mass_gap' ? [['Kilos in today', fmtKg(Math.round(mb.kgIn))], ['Kilos out', fmtKg(Math.round(mb.kgOut))], ['Weighed waste', fmtKg(Math.round(mb.wasteKg))], ['Allowed loss', `${fmtKg(Math.round(mb.allowedLossKg))} · ${site.thresholds.massGapPct}%`], ['Unaccounted', fmtKg(Math.max(0, Math.round(mb.gapKg)))]] : [['Gate tolerance', `±${site.thresholds.gateTolerancePct}% of expected weight`], ['Rule', 'The gate stays locked until a Site Manager overrides with a PIN and a reason']] };
  }
  return { facts: [] };
}

/** The selected exception: what happened, the numbers, who owns it and the records around it. */
function Detail({ e, onLink }: { e: BusinessException; onLink: (to: 'credit', id: string) => void }) {
  const s = useStore(); const ins = insightFor(s, e); const Sev = SEVERITY_ICON[e.severity];
  const owner = s.users.find((u) => u.roles.some((r) => r.role === e.ownerRole && (!r.siteId || r.siteId === e.siteId)));
  const sameSite = openExceptions(s, e.siteId).filter((x) => x.id !== e.id);
  const record = s.audit.filter((a) => a.siteId === e.siteId).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);
  return (
    <div data-autofocus="" tabIndex={-1} className="flex flex-col gap-4 outline-none">
      <div className="flex items-start gap-3">
        <IconChip icon={Sev} color={severityColor(e.severity)} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-1"><SiteBadge site={e.siteId} /><Badge tone={severityTone(e.severity)} dot>{severityLabel[e.severity]}</Badge><span className="t-sm text-[var(--text-3)]">{KIND_META[e.kind].label} · raised {fmtDateTime(e.raisedAt)} · {agoLabel(e.raisedAt, s.today)}</span></div>
          <h2 className="t-title leading-snug">{e.title}</h2>
          <p className="t-base text-[var(--text-2)] mt-1 max-w-[70ch]">{e.detail}</p>
        </div>
      </div>

      {(ins.facts.length > 0 || ins.meter) && (
        <section>
          <h3 className="t-label mb-1">The numbers</h3>
          {ins.facts.length > 0 && <div className="grid sm:grid-cols-2 gap-x-6">{ins.facts.map(([k, v]) => <KV key={k} k={k} v={v} />)}</div>}
          {ins.meter && <div className="mt-1.5"><Meter label={ins.meter.label} value={ins.meter.value} max={ins.meter.max} display={ins.meter.display} tone={ins.meter.tone} /></div>}
          {ins.link && <Button className="mt-2" size="sm" icon={ExternalLink} onClick={() => onLink(ins.link!.to, ins.link!.id)}>{ins.link.label}</Button>}
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="min-w-0">
          <h3 className="t-label mb-1.5">Who owns it</h3>
          <div className="flex items-center gap-2.5 surface-2 px-3 py-2">
            <Avatar name={owner?.name ?? roleLabel(e.ownerRole)} seed={owner?.avatarSeed} size={32} />
            <div className="min-w-0"><div className="t-base font-medium truncate">{owner?.name ?? roleLabel(e.ownerRole)}</div><div className="t-sm text-[var(--text-3)] truncate">{roleLabel(e.ownerRole)} · {SITES[e.siteId].name}</div></div>
          </div>
          <p className="t-xs text-[var(--text-3)] mt-1.5">Raised by the system from the records. A CEO can decide any exception; the owner is who acts on it at the site.</p>
        </section>
        {ins.trend && <section className="min-w-0"><h3 className="t-label mb-1.5">{ins.trend.title}</h3><MiniBars height={64} data={ins.trend.data} format={(n) => `${fmtNum(n)} ${ins.trend!.unit}`} /></section>}
        {!ins.trend && sameSite.length > 0 && (
          <section className="min-w-0">
            <h3 className="t-label mb-1.5">Also open at {SITES[e.siteId].shortName}</h3>
            {sameSite.slice(0, 3).map((x) => <div key={x.id} className="flex items-center gap-2 py-1 t-sm min-w-0"><span className="size-1.5 rounded-full shrink-0" style={{ background: severityColor(x.severity) }} /><span className="truncate">{x.title}</span></div>)}
            {sameSite.length > 3 && <div className="t-xs text-[var(--text-3)] mt-0.5">and {sameSite.length - 3} more</div>}
          </section>
        )}
      </div>

      {ins.records && ins.records.rows.length > 0 && (
        <section>
          <h3 className="t-label mb-1">{ins.records.title}</h3>
          <div className="surface-2 px-3">{ins.records.rows.map((r) => <div key={r.key} className="flex items-center gap-3 py-1.5 border-b border-[var(--line)] last:border-b-0"><div className="min-w-0 flex-1"><div className="t-base font-medium truncate">{r.title}</div>{r.sub && <div className="t-sm text-[var(--text-3)] truncate">{r.sub}</div>}</div>{r.right && <div className="shrink-0 t-base">{r.right}</div>}</div>)}</div>
        </section>
      )}

      {record.length > 0 && (
        <section>
          <h3 className="t-label mb-1 flex items-center gap-1.5"><History className="size-3" />Latest on the record at {SITES[e.siteId].shortName}</h3>
          {record.map((a) => <div key={a.id} className="flex items-start gap-2 py-1.5 border-b border-[var(--line)] last:border-b-0"><Avatar name={a.actorName} size={20} className="mt-0.5" /><div className="min-w-0 flex-1"><div className="t-sm leading-snug">{a.summary}</div><div className="t-xs text-[var(--text-3)]">{a.actorName} · {fmtDateTime(a.at)}</div></div></div>)}
        </section>
      )}
    </div>
  );
}

/** Every open exception across the three sites as an inbox: pick one, read the records, decide with one key and a reason. */
export function Approvals() {
  const s = useStore(); const decide = useStore((x) => x.decideException); const toast = useStore((x) => x.toast); const go = useGo();
  const touch = useIsTouch(); const split = useMedia('(min-width: 1024px)'); const roomy = useMedia('(min-width: 1500px)');
  const [tab, setTab] = useState<'open' | 'decided'>('open');
  const [site, setSite] = useState<SiteCode | 'all'>('all'); const [kind, setKind] = useState<ExceptionKind | 'all'>('all'); const q0 = useQueryParam('q'); const [q, setQ] = useState(q0 ?? '');
  const [selId, setSelId] = useState<string | null>(() => takePresetSelection());
  const [armed, setArmed] = useState<Decision | null>(null); const [reason, setReason] = useState('');
  const [sheet, setSheet] = useState(false); const [inspect, setInspect] = useState<BusinessException | null>(null);
  const reasonRef = useRef<HTMLInputElement>(null); const listRef = useRef<HTMLDivElement>(null);

  const allOpen = useMemo(() => openExceptions(s), [s]);
  const match = (e: BusinessException) => (site === 'all' || e.siteId === site) && (kind === 'all' || e.kind === kind) && (!q.trim() || `${e.title} ${e.detail} ${KIND_META[e.kind].label} ${SITES[e.siteId].name}`.toLowerCase().includes(q.trim().toLowerCase()));
  const open = allOpen.filter(match);
  const decidedAll = useMemo(() => s.exceptions.filter((e) => e.status !== 'open' && e.decidedAt?.startsWith(s.today)).sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? '')), [s]);
  const decided = decidedAll.filter(match);
  const kindsPresent = useMemo(() => [...new Set(s.exceptions.map((e) => e.kind))], [s.exceptions]);
  const bySite = (id: SiteCode | 'all') => (tab === 'open' ? allOpen : decidedAll).filter((e) => (id === 'all' || e.siteId === id) && (kind === 'all' || e.kind === kind)).length;
  const byKind = (k: ExceptionKind | 'all') => (tab === 'open' ? allOpen : decidedAll).filter((e) => (site === 'all' || e.siteId === site) && (k === 'all' || e.kind === k)).length;

  const selected = open.find((e) => e.id === selId) ?? open[0]; const index = selected ? open.indexOf(selected) : -1;
  const select = (id: string) => { setSelId(id); setArmed(null); setReason(''); };
  useListKeys(open.length, index, (i) => select(open[i].id), { enabled: tab === 'open', noun: 'exception' });
  useEffect(() => { listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' }); }, [selected?.id]);

  const arm = (d: Decision) => { setArmed(d); if (!split) setSheet(true); setTimeout(() => reasonRef.current?.focus(), 40); };
  const disarm = () => { setArmed(null); reasonRef.current?.blur(); };
  const confirm = () => {
    if (!selected || !armed) return;
    const next = open[index + 1] ?? open[index - 1];
    decide(selected.id, armed, reason.trim() || undefined);
    toast({ kind: 'ok', title: `${DECISION[armed].done}: ${selected.title}`, detail: reason.trim() || undefined });
    setArmed(null); setReason(''); setSelId(next?.id ?? null); setSheet(false); reasonRef.current?.blur();
  };
  const userName = (id?: string) => s.users.find((u) => u.id === id)?.name ?? 'System';
  const link = (to: 'credit', id: string) => { setPresetSelection(id); go.group(to); };

  const decisionBar = selected && (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Input ref={reasonRef} value={reason} onChange={(e) => setReason(e.target.value)} className="basis-full 2xl:basis-0 2xl:flex-1 2xl:min-w-[200px]" aria-label="Reason"
          placeholder={armed ? DECISION[armed].hint : 'Reason. Recommended for a hold, optional otherwise'}
          onKeyDown={(e) => { if (e.key === 'Enter' && armed) { e.preventDefault(); confirm(); } else if (e.key === 'Escape' && armed) { e.stopPropagation(); disarm(); } }} />
        {armed ? <>
          <Button variant="ghost" onClick={disarm}>Cancel</Button>
          <Button variant={DECISION[armed].variant} icon={armed === 'approved' ? Check : armed === 'held' ? Pause : CircleCheck} hotkey="mod+enter" onClick={confirm}>{DECISION[armed].doing}</Button>
        </> : <>
          <Button variant="ok" icon={Check} hotkey="a" hotkeyLabel="Approve the selected exception" onClick={() => arm('approved')}>Approve</Button>
          <Button variant="secondary" icon={Pause} hotkey="h" hotkeyLabel="Hold the selected exception" onClick={() => arm('held')}>Hold</Button>
          <Button variant="primary" icon={CircleCheck} hotkey="r" hotkeyLabel="Resolve the selected exception" onClick={() => arm('resolved')}>Resolve</Button>
        </>}
      </div>
      <div className="t-xs text-[var(--text-3)] mt-1.5">{armed ? <>Press <Kbd keys="enter" /> to confirm or <Kbd keys="escape" /> to go back. </> : null}The decision and its reason are kept in the audit feed with your name and device.</div>
    </div>
  );

  const decidedCols: Column<BusinessException>[] = [
    { key: 'at', header: 'Decided', width: 84, mono: true, sort: (e) => e.decidedAt ?? '', cell: (e) => (e.decidedAt ? fmtTime(e.decidedAt) : '—') },
    { key: 'site', header: 'Site', width: 110, sort: (e) => e.siteId, cell: (e) => <SiteBadge site={e.siteId} /> },
    { key: 'title', header: 'Exception', truncate: 420, sort: (e) => e.title, cell: (e) => <span className="inline-flex items-center gap-2 min-w-0"><IconChip icon={KIND_META[e.kind].icon} color={severityColor(e.severity)} size="sm" /><span className="font-medium truncate">{e.title}</span></span> },
    { key: 'kind', header: 'Kind', sort: (e) => KIND_META[e.kind].label, cell: (e) => <span className="text-[var(--text-2)]">{KIND_META[e.kind].label}</span> },
    { key: 'st', header: 'Decision', sort: (e) => e.status, cell: (e) => <Badge tone={DECISION[e.status as Decision]?.tone ?? 'neutral'} dot>{DECISION[e.status as Decision]?.done ?? e.status}</Badge> },
    { key: 'why', header: 'Reason', truncate: 280, cell: (e) => (e.decisionReason ? <span className="text-[var(--text-2)]">“{e.decisionReason}”</span> : <span className="text-[var(--text-4)]">none given</span>) },
    { key: 'by', header: 'Decided by', sort: (e) => userName(e.decidedBy), cell: (e) => <span className="inline-flex items-center gap-1.5"><Avatar name={userName(e.decidedBy)} size={20} />{userName(e.decidedBy)}</span> },
  ];

  const critical = allOpen.filter((e) => e.severity === 'critical').length;
  const sevSegments = SEVERITIES.map((sev) => ({ label: severityLabel[sev], value: open.filter((e) => e.severity === sev).length, color: severityColor(sev) }));
  const oldest = open.length ? [...open].sort((a, b) => a.raisedAt.localeCompare(b.raisedAt))[0] : undefined;

  const list = (
    <Panel pad={false} icon={Inbox} title="Open" sub={open.length === allOpen.length ? plural(open.length, 'exception') : `${open.length} of ${allOpen.length} shown`}
      actions={<span className="touch:hidden inline-flex items-center gap-1 t-xs text-[var(--text-3)] pr-1.5"><Kbd keys="arrowup" /><Kbd keys="arrowdown" />move</span>}
      footer={open.length > 0 ? <div><StackedBar height={6} legend={false} segments={sevSegments} /><div className="flex flex-wrap items-center justify-between gap-x-4 mt-1.5"><span>{sevSegments.filter((x) => x.value).map((x) => `${x.value} ${x.label.toLowerCase()}`).join(' · ')}</span>{oldest && <span>oldest raised {agoLabel(oldest.raisedAt, s.today)}</span>}</div></div> : undefined}>
      {open.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={allOpen.length ? Inbox : ShieldCheck} title={allOpen.length ? 'Nothing matches these filters' : 'Nothing waiting for you'} hint={allOpen.length ? 'Clear the search or pick another site or kind.' : 'New exceptions appear here the moment a site raises one: gate holds, cash variances, mass gaps, credit over limit.'} /></div> : (
        <div ref={listRef}>
          {SEVERITIES.map((sev) => {
            const rows = open.filter((e) => e.severity === sev); if (!rows.length) return null; const Sev = SEVERITY_ICON[sev];
            return (
              <div key={sev}>
                <div className="flex items-center gap-1.5 px-[var(--pad)] h-7 touch:h-8 bg-[var(--surface-2)] border-b border-[var(--line)] t-label"><Sev className="size-3.5" style={{ color: severityColor(sev) }} />{severityLabel[sev]}<span className="num font-medium text-[var(--text-4)]">{rows.length}</span></div>
                {rows.map((e) => {
                  const on = e.id === selected?.id;
                  return (
                    <button key={e.id} aria-current={on} onClick={() => { select(e.id); if (!split) setSheet(true); }}
                      className={cn('w-full flex items-start gap-2.5 px-[var(--pad)] py-2 touch:py-2.5 text-left border-b border-[var(--line)] hover:bg-[var(--hover)]', on && split && 'bg-[var(--selected)] hover:bg-[var(--selected)] shadow-[inset_2px_0_0_var(--focus)]')}>
                      <IconChip icon={KIND_META[e.kind].icon} color={severityColor(e.severity)} className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <span className="block t-base font-medium leading-snug">{e.title}</span>
                        <span className="flex items-center gap-1.5 mt-1 t-sm text-[var(--text-3)] min-w-0"><SiteBadge site={e.siteId} /><span className="truncate">{KIND_META[e.kind].label} · {roleLabel(e.ownerRole)}</span></span>
                      </span>
                      <span className="num t-xs text-[var(--text-3)] whitespace-nowrap mt-0.5">{agoLabel(e.raisedAt, s.today)}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );

  return (
    <div>
      <PageHeader eyebrow="Head Office" title="Approvals"
        meta={<><Badge tone={allOpen.length ? 'warn' : 'ok'} dot>{allOpen.length} open</Badge>{critical > 0 && <Badge tone="bad" dot>{critical} critical</Badge>}</>}
        subtitle="Every open exception across the three sites, one decision each. Decisions are written to the audit feed with your name and device."
        tabs={<Tabs variant="underline" value={tab} onChange={(v) => { setTab(v); setArmed(null); }} tabs={[{ value: 'open', label: 'Open', count: allOpen.length }, { value: 'decided', label: 'Decided today', count: decidedAll.length }]} />} />

      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Search exceptions" />
        <Tabs value={site} onChange={setSite} tabs={[{ value: 'all' as const, label: 'All sites', count: bySite('all') }, ...SITE_LIST.map((x) => ({ value: x.id, label: <><span className="size-2 rounded-[2px]" style={{ background: SITE_COLOR[x.id] }} />{x.shortName}</>, count: bySite(x.id) }))]} />
        <Tabs value={kind} onChange={setKind} tabs={[{ value: 'all' as const, label: 'All kinds' }, ...kindsPresent.map((k) => ({ value: k, label: KIND_META[k].label, count: byKind(k) }))]} />
      </Toolbar>

      {tab === 'open' ? (
        split && selected ? (
          <Split asideWidth={roomy ? 640 : 520} aside={
            <Panel icon={KIND_META[selected.kind].icon} title={KIND_META[selected.kind].label} sub={`${index + 1} of ${open.length}`} footer={decisionBar}
              actions={<><IconButton icon={ChevronUp} label="Previous exception" disabled={index <= 0} onClick={() => select(open[index - 1].id)} /><IconButton icon={ChevronDown} label="Next exception" disabled={index >= open.length - 1} onClick={() => select(open[index + 1].id)} /></>}>
              <Detail e={selected} onLink={link} />
            </Panel>
          }>{list}</Split>
        ) : list
      ) : (
        <DataGrid rows={decided} columns={decidedCols} rowKey={(e) => e.id} onRowClick={setInspect} selectedKey={inspect?.id}
          empty={decidedAll.length ? 'No decision today matches these filters.' : 'No decisions yet today. Decisions you make on the Open tab appear here with the reason you gave.'}
          footer={decided.length ? <tr><td colSpan={7} className="t-sm font-normal text-[var(--text-3)]">{plural(decided.length, 'decision')} today · {decided.filter((e) => e.decisionReason).length} with a reason · select a row to read it in full</td></tr> : undefined} />
      )}

      {/* Narrow screens: the detail opens as a sheet */}
      <Sheet open={!split && sheet && tab === 'open' && !!selected} onClose={() => { setSheet(false); setArmed(null); }} title={selected ? KIND_META[selected.kind].label : ''} sub={selected ? `${index + 1} of ${open.length} open` : undefined} footer={decisionBar}>
        {selected && <Detail e={selected} onLink={link} />}
      </Sheet>

      <Sheet open={!!inspect} onClose={() => setInspect(null)} title="Decision on the record" sub={inspect ? `${KIND_META[inspect.kind].label} · ${SITES[inspect.siteId].name}` : undefined} footer={<Button onClick={() => { setInspect(null); go.group('audit'); }}>Open the audit feed</Button>}>
        {inspect && (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3"><IconChip icon={KIND_META[inspect.kind].icon} color={severityColor(inspect.severity)} size="lg" /><div className="min-w-0"><div className="flex items-center gap-1.5 flex-wrap mb-1"><SiteBadge site={inspect.siteId} /><Badge tone={DECISION[inspect.status as Decision]?.tone ?? 'neutral'} dot>{DECISION[inspect.status as Decision]?.done ?? inspect.status}</Badge></div><div className="t-lg font-semibold leading-snug">{inspect.title}</div><p className="t-base text-[var(--text-2)] mt-1">{inspect.detail}</p></div></div>
            {inspect.decisionReason ? <ReasonQuote>{inspect.decisionReason}</ReasonQuote> : <p className="t-sm text-[var(--text-3)]">No reason was given with this decision.</p>}
            <div className="surface-2 px-3 py-1">
              <KV k="Decided by" v={<span className="inline-flex items-center gap-1.5"><Avatar name={userName(inspect.decidedBy)} size={18} />{userName(inspect.decidedBy)}</span>} />
              <KV k="Decided at" v={inspect.decidedAt ? fmtDateTime(inspect.decidedAt) : '—'} />
              <KV k="Raised" v={fmtDateTime(inspect.raisedAt)} />
              <KV k="Owner" v={roleLabel(inspect.ownerRole)} />
              <KV k="Severity" v={severityLabel[inspect.severity]} />
            </div>
          </div>
        )}
      </Sheet>
      {touch ? null : <p className="t-xs text-[var(--text-3)] mt-2">Press <Kbd keys="a" />, <Kbd keys="h" /> or <Kbd keys="r" /> to start a decision on the selected exception, type a reason if you have one, then <Kbd keys="enter" />.</p>}
    </div>
  );
}
