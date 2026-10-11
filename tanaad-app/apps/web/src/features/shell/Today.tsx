import { useEffect } from 'react';
import { Activity, AlertCircle, AlertTriangle, Boxes, CheckCircle2, Circle, CircleDot, Scale, Users, Wallet } from 'lucide-react';
import type { Role } from '@tanaad/domain';
import { contractState } from '@tanaad/domain';
import { useStore, type AppState } from '@/data/store';
import { useSite, useGo } from '@/app/hooks';
import { registerHotkey } from '@/app/hotkeys';
import { ROLE_TABS, visibleSiteNav } from '@/app/nav';
import { ActionTile, Avatar, Bar, Button, Empty, Kbd, KpiStrip, Note, Panel, Stat, cn } from '@/components/ui';
import { CountUp, Donut, TimeTrack } from '@/components/charts';
import { SITE_COLOR } from '@/config/siteIdentity';
import { attendanceFor, cashDayFor, cashSummary, currentShiftKind, dailySeries, DEMO_HOUR, headcount, lastWorkingDays, intakeToday, lowStockParts, machineWall, machinesDown, openExceptions, receivables, rosterFor, shiftId, stockByProduct } from '@/data/selectors';
import { compact, fmtNum, fmtUGX } from '@/data/format';
import { roleLabel } from '@/config/roles';
import type { Site } from '@tanaad/domain';

type TaskState = 'done' | 'todo' | 'attention' | 'info';
interface Task { id: string; title: string; detail: string; state: TaskState; progress?: [number, number]; to: string; cta: string }

/** What this role has to get done this shift, worked out from live data. */
function tasksFor(role: Role, s: AppState, site: Site): Task[] {
  const kind = currentShiftKind(); const sh = shiftId(site.id, s.today, kind);
  const roster = rosterFor(s, site.id).filter((r) => r.contractState !== 'expired');
  const marked = attendanceFor(s, sh).length;
  const wall = machineWall(s, site.id, s.today, kind); const active = wall.filter((t) => t.state !== 'arriving' && t.state !== 'down');
  const logged = active.filter((t) => t.state !== 'not_logged').length; const below = wall.filter((t) => t.state === 'below').length;
  const expiring = rosterFor(s, site.id).filter((r) => r.engagement?.type === 'contract' && contractState(r.engagement.endDate, s.today) !== 'open').length;
  const cd = cashDayFor(s, site.id, s.today); const cash = cd ? cashSummary(s, cd.id) : undefined;
  const orders = s.orders.filter((o) => o.siteId === site.id);
  const awaitingCash = orders.filter((o) => o.status === 'awaiting_cash').length; const awaitingApproval = orders.filter((o) => o.status === 'awaiting_approval').length;
  const toLoad = orders.filter((o) => o.status === 'approved' || o.status === 'picking').length;
  const toInvoice = orders.filter((o) => (o.status === 'dispatched' || o.status === 'delivered') && !s.invoices.some((i) => i.orderId === o.id)).length;
  const low = lowStockParts(s, site.id).length; const down = machinesDown(s, site.id).length; const ex = openExceptions(s, site.id);
  const held = s.dispatches.filter((d) => d.siteId === site.id && d.gateStatus === 'hold').length;
  const lastCount = s.stockCounts.filter((c) => c.siteId === site.id).map((c) => c.day).sort().pop();
  const countAge = lastCount ? Math.round((new Date(s.today).getTime() - new Date(lastCount).getTime()) / 86400000) : undefined;
  const unpaidIntake = s.collectorDeliveries.filter((d) => !d.paid).length;
  const overdue = receivables(s, site.id).filter((r) => r.ageDays > r.client.creditDays).length;
  const signedUpToday = s.people.filter((p) => p.homeSiteId === site.id && p.joinedOn === s.today).length;
  const wallName = site.machineWallTitle;

  const t: Record<string, Task> = {
    attendance: { id: 'attendance', title: 'Mark attendance', detail: marked >= roster.length ? `All ${roster.length} workers marked for the ${kind} shift` : `${roster.length - marked} of ${roster.length} workers not marked yet`, state: marked >= roster.length ? 'done' : 'todo', progress: [Math.min(marked, roster.length), roster.length], to: 'people/attendance', cta: 'Open grid' },
    machines: { id: 'machines', title: `Log every machine on the ${wallName}`, detail: logged >= active.length ? (below ? `${below} below benchmark with no reason given` : 'Every running machine has an entry') : `${active.length - logged} machine${active.length - logged === 1 ? '' : 's'} with no entry this shift${below ? ` · ${below} below benchmark without a reason` : ''}`, state: logged >= active.length ? (below ? 'attention' : 'done') : 'attention', progress: [logged, active.length], to: 'production/wall', cta: `Open ${wallName}` },
    signup: { id: 'signup', title: 'Register new casual workers', detail: signedUpToday ? `${signedUpToday} registered today` : 'Nobody registered today. Takes under a minute each.', state: 'info', to: 'people/signup', cta: 'Sign up' },
    contracts: { id: 'contracts', title: 'Renew or end expiring contracts', detail: expiring ? `${expiring} contract${expiring === 1 ? '' : 's'} ending within 3 days or already ended` : 'No contract ends in the next 3 days', state: expiring ? 'attention' : 'done', to: 'people/registry', cta: 'Review' },
    expense: { id: 'expense', title: 'Record every expense with a category', detail: cash ? `${cash.entries.filter((e) => e.direction === 'out').length} lines today · ${fmtUGX(cash.expenses + cash.wages)} out · 0 uncategorised` : 'No lines yet today', state: 'info', to: 'cash/expense', cta: 'New expense' },
    confirmCash: { id: 'confirmCash', title: 'Confirm cash for local orders', detail: awaitingCash ? `${awaitingCash} order${awaitingCash === 1 ? '' : 's'} locked at the warehouse until you confirm` : 'No order is waiting for cash', state: awaitingCash ? 'todo' : 'done', to: 'sales/orders', cta: 'Open orders' },
    closeDay: { id: 'closeDay', title: 'Count, sign and close the cash day', detail: cd?.status === 'closed' ? 'Closed and signed. Balance carried forward.' : cash ? `Expected closing ${fmtUGX(cash.expectedClosing)}` : 'Cash day not opened', state: cd?.status === 'closed' ? 'done' : DEMO_HOUR >= 17 ? 'attention' : 'todo', to: 'cash', cta: 'Cash page' },
    settlement: { id: 'settlement', title: 'Pay settlements that are due', detail: 'Weekly casuals, contracts at end of term, monthly staff', state: 'info', to: 'people/settlement', cta: 'Settlement' },
    load: { id: 'load', title: 'Load and weigh out orders', detail: held ? `${held} lorry held at the gate` : toLoad ? `${toLoad} order${toLoad === 1 ? '' : 's'} approved and ready to load` : 'Nothing waiting to load', state: held ? 'attention' : toLoad ? 'todo' : 'done', to: 'stock/dispatch', cta: 'Dispatch' },
    receive: { id: 'receive', title: 'Weigh in supplier deliveries', detail: site.id === 'recycling' ? `${intakeToday(s, s.today).length} collector deliveries today · ${unpaidIntake} vouchers unpaid` : 'Every delivery over the gate scale before it is accepted', state: site.id === 'recycling' && unpaidIntake ? 'todo' : 'info', to: site.id === 'recycling' ? 'production/intake' : 'stock/receive', cta: 'Weigh in' },
    count: { id: 'count', title: 'Count a zone', detail: countAge === undefined ? 'No count on record yet' : `Last count ${countAge} day${countAge === 1 ? '' : 's'} ago`, state: countAge === undefined || countAge > 7 ? 'todo' : 'done', to: 'stock/count', cta: 'Count' },
    spares: { id: 'spares', title: 'Keep spares above minimum', detail: low ? `${low} part${low === 1 ? '' : 's'} below minimum` : 'Every part is above its minimum', state: low ? 'attention' : 'done', to: 'stock/spares', cta: 'Spares store' },
    breakdowns: { id: 'breakdowns', title: 'Clear machine breakdowns', detail: down ? `${down} machine${down === 1 ? '' : 's'} down now` : 'All machines running', state: down ? 'attention' : 'done', to: 'stock/maintenance', cta: 'Breakdowns' },
    approval: { id: 'approval', title: 'Export orders with the CEOs', detail: awaitingApproval ? `${awaitingApproval} waiting for credit approval` : 'None waiting for approval', state: awaitingApproval ? 'info' : 'done', to: 'sales/orders', cta: 'Open orders' },
    invoice: { id: 'invoice', title: 'Invoice delivered orders', detail: toInvoice ? `${toInvoice} dispatched without an invoice` : 'Everything dispatched is invoiced', state: toInvoice ? 'todo' : 'done', to: 'sales/invoices', cta: 'Invoices' },
    overdue: { id: 'overdue', title: 'Chase overdue export balances', detail: overdue ? `${overdue} client${overdue === 1 ? '' : 's'} past credit terms` : 'No client is past terms', state: overdue ? 'attention' : 'done', to: 'sales/clients', cta: 'Clients' },
    exceptions: { id: 'exceptions', title: 'Decide open exceptions', detail: ex.length ? `${ex.length} open · ${ex.filter((e) => e.severity === 'critical').length} critical` : 'Nothing needs a decision', state: ex.some((e) => e.severity === 'critical') ? 'attention' : ex.length ? 'todo' : 'done', to: 'dashboard', cta: 'Dashboard' },
  };
  const byRole: Record<Role, string[]> = {
    supervisor: ['attendance', 'machines', 'contracts', 'signup'],
    cashier: ['confirmCash', 'expense', 'settlement', 'closeDay'],
    storekeeper: ['load', 'receive', 'count', 'spares'],
    gate: ['load', 'receive'],
    mechanic: ['breakdowns', 'spares', 'machines'],
    sales: ['confirmCash', 'approval', 'invoice', 'overdue'],
    site_manager: ['exceptions', 'machines', 'attendance', 'contracts', 'closeDay', 'spares'],
    driver: ['load'],
    ceo: ['exceptions'],
    group_admin: ['exceptions'],
  };
  return (byRole[role] ?? byRole.site_manager).map((k) => t[k]);
}

const STATE_ICON: Record<TaskState, { icon: typeof Circle; color: string; label: string }> = {
  done: { icon: CheckCircle2, color: 'var(--ok)', label: 'Done' },
  todo: { icon: Circle, color: 'var(--text-4)', label: 'To do' },
  attention: { icon: AlertCircle, color: 'var(--bad)', label: 'Needs attention' },
  info: { icon: CircleDot, color: 'var(--info)', label: 'As needed' },
};

/** Role home: the shift's work as a short checklist, live numbers above it, shortcuts beside it. */
export function Today() {
  const s = useStore(); const site = useSite(); const go = useGo(); const role = s.session?.role ?? 'supervisor';
  const user = s.users.find((u) => u.id === s.session?.userId); const kind = currentShiftKind();
  const tasks = tasksFor(role, s, site);
  const hc = headcount(s, site.id, s.today, kind); const wall = machineWall(s, site.id, s.today, kind);
  const notLogged = wall.filter((t) => t.state === 'not_logged').length; const below = wall.filter((t) => t.state === 'below').length;
  const cd = cashDayFor(s, site.id, s.today); const cash = cd ? cashSummary(s, cd.id) : undefined;
  const ex = openExceptions(s, site.id); const stock = stockByProduct(s, site.id);
  const shift = site.shifts.find((x) => x.kind === kind);
  const greet = DEMO_HOUR < 12 ? 'Good morning' : DEMO_HOUR < 17 ? 'Good afternoon' : 'Good evening';
  const done = tasks.filter((t) => t.state === 'done').length; const countable = tasks.filter((t) => t.state !== 'info').length;
  const quick = (ROLE_TABS[role] ?? []).filter((to) => to !== 'today').map((to) => visibleSiteNav(role, site.id).find((n) => n.to === to)).filter((n): n is NonNullable<typeof n> => !!n);

  // Digits 1–9 open the nth task.
  useEffect(() => {
    const offs = tasks.slice(0, 9).map((t, i) => registerHotkey({ keys: String(i + 1), label: t.title, group: 'This page', run: () => go.site(t.to) }));
    return () => offs.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.map((t) => t.id + t.to).join('|'), site.id]);

  const past = dailySeries(s, site.id, lastWorkingDays(site.id, s.today, 7)).slice(0, -1);
  const progress = Math.max(0.05, Math.min(1, (DEMO_HOUR - 7) / 12));

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      {/* Greeting, shift clock, progress through the checklist */}
      <section className="hero relative overflow-hidden px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <Avatar name={user?.name ?? '?'} seed={user?.avatarSeed} size={48} className="ring-2 ring-white/25" />
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-white/55 flex items-center gap-1.5"><span className="size-1.5 rounded-[2px]" style={{ background: SITE_COLOR[site.id] }} />{roleLabel(role)} · {site.name}</div>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] leading-tight">{greet}, {user?.name.split(' ')[0]}</h1>
            <div className="text-[12.5px] text-white/60">{tasks.filter((t) => t.state === 'attention').length ? `${tasks.filter((t) => t.state === 'attention').length} thing${tasks.filter((t) => t.state === 'attention').length === 1 ? '' : 's'} need you now` : 'Nothing urgent right now'}</div>
          </div>
        </div>
        <div className="flex-1 min-w-[240px] max-w-[480px]">
          <div className="flex items-center justify-between mb-2 text-[12.5px]"><span className="inline-flex items-center gap-1.5 font-medium"><span className="size-1.5 rounded-full bg-[var(--color-amber-400)] anim-live" />{kind === 'day' ? 'Day' : 'Night'} shift</span><span className="text-white/60">{DEMO_HOUR - 7} h in · {19 - DEMO_HOUR} h left</span></div>
          <TimeTrack progress={progress} startLabel={shift?.starts ?? '07:00'} endLabel={shift?.ends ?? '19:00'} nowLabel={`${DEMO_HOUR}:20 now`} onDark />
        </div>
        <div className="flex flex-wrap items-center gap-4 ml-auto">
          {countable > 0 && <div className="flex items-center gap-2.5 [&_circle:first-child]:stroke-white/15"><Donut size={52} thickness={6} center={<span className="text-white text-[13px]">{done}/{countable}</span>} segments={[{ label: 'Done', value: done, color: 'var(--color-amber-400)' }, { label: 'Open', value: Math.max(0, countable - done), color: 'rgb(255 255 255 / .18)' }]} /><div className="leading-tight"><div className="text-[13px] font-medium">Checklist</div><div className="text-[11.5px] text-white/55">{done === countable ? 'all done' : `${countable - done} open`}</div></div></div>}
          {quick[0] && <Button variant="accent" icon={quick[0].icon} onClick={() => go.site(quick[0].to)}>{quick[0].label}</Button>}
        </div>
      </section>
      {site.toBeConfirmed && (role === 'supervisor' || role === 'site_manager') && <Note tone="warn">{site.toBeConfirmed}</Note>}

      <KpiStrip>
        <Stat label={`On ${kind} shift`} icon={Users} accent="var(--series-1)" value={<CountUp value={hc.total} />} sub={`${hc.present} full · ${hc.half} half day`} spark={past.map((d) => d.headcount)} onClick={() => go.site('people/attendance')} />
        <Stat label="Machines not logged" icon={Activity} accent="var(--series-7)" value={<CountUp value={notLogged} />} tone={notLogged ? 'bad' : 'neutral'} sub={below ? `${below} below benchmark` : 'Benchmarks met so far'} spark={past.map((d) => d.units)} sparkColor="var(--series-7)" onClick={() => go.site('production/wall')} />
        <Stat label="Cash expected" icon={Wallet} accent="var(--series-2)" value={cash ? <CountUp value={cash.expectedClosing} format={compact} /> : '—'} sub={cash ? `UGX · day ${cd?.status}` : 'No cash day'} spark={past.map((d) => d.closing)} onClick={() => go.site('cash')} />
        {site.id === 'recycling'
          ? <Stat label="Intake today" icon={Scale} accent="var(--series-5)" value={<><CountUp value={Math.round(intakeToday(s, s.today).reduce((t, d) => t + d.netKg, 0))} /><span className="t-base text-[var(--text-3)] font-medium"> kg</span></>} sub={`${intakeToday(s, s.today).length} deliveries`} onClick={() => go.site('production/intake')} />
          : <Stat label="In stock" icon={Boxes} accent="var(--series-5)" value={<CountUp value={stock.reduce((t, r) => t + r.bundles, 0)} />} sub={`${site.id === 'bags' ? 'packs and rolls' : 'bundles'} · ${stock.length} products`} onClick={() => go.site('stock')} />}
        <Stat label="Open exceptions" icon={AlertTriangle} accent="var(--series-8)" value={<CountUp value={ex.length} />} tone={ex.some((e) => e.severity === 'critical') ? 'bad' : ex.length ? 'warn' : 'neutral'} sub={ex.length ? `${ex.filter((e) => e.severity === 'critical').length} critical` : 'Nothing to decide'} onClick={() => go.site('dashboard')} />
      </KpiStrip>

      <div className="grid gap-[var(--gap)] min-[1240px]:grid-cols-[minmax(0,1fr)_340px] items-start">
        <Panel icon={CheckCircle2} title="This shift" sub={`${tasks.length} things to keep on top of`} pad={false}>
          {tasks.map((t, i) => {
            const st = STATE_ICON[t.state]; const Icon = st.icon;
            return (
              <button key={t.id} onClick={() => go.site(t.to)} className="group w-full flex items-center gap-3 px-[var(--pad)] py-2.5 touch:py-3.5 text-left border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--hover)]">
                <span className="size-8 touch:size-10 rounded-lg grid place-items-center shrink-0" style={{ background: `color-mix(in srgb, ${st.color} 12%, transparent)` }}><Icon className="size-[18px] touch:size-5" style={{ color: st.color }} aria-label={st.label} /></span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block t-base font-medium', t.state === 'done' && 'text-[var(--text-2)]')}>{t.title}</span>
                  <span className={cn('block t-sm truncate', t.state === 'attention' ? 'text-[var(--bad)]' : 'text-[var(--text-3)]')}>{t.detail}</span>
                </span>
                {t.progress && <span className="hidden md:flex items-center gap-2 w-[150px] shrink-0"><Bar value={t.progress[0]} max={t.progress[1] || 1} tone={t.progress[0] >= t.progress[1] ? 'ok' : 'series'} /><span className="num t-sm text-[var(--text-2)] w-[52px] text-right">{t.progress[0]}/{t.progress[1]}</span></span>}
                <span className="hidden xl:inline t-sm text-[var(--text-3)] group-hover:text-[var(--text)] whitespace-nowrap">{t.cta}</span>
                <Kbd keys={String(i + 1)} />
              </button>
            );
          })}
        </Panel>

        <div className="flex flex-col gap-[var(--gap)]">
          <Panel icon={AlertTriangle} title="Needs attention" sub={ex.length ? `${ex.length} open` : undefined} pad={false}>
            {ex.length === 0 ? <div className="p-[var(--pad)]"><Empty title="Nothing open" hint="Exceptions raised by the gate, the cash close or the machine wall show up here." /></div> : ex.slice(0, 5).map((e) => (
              <div key={e.id} className="flex items-start gap-2.5 px-[var(--pad)] py-2 border-b border-[var(--line)] last:border-b-0">
                <span className="mt-[5px] size-2 rounded-full shrink-0" style={{ background: e.severity === 'critical' ? 'var(--bad)' : e.severity === 'warning' ? 'var(--warn)' : 'var(--text-4)' }} />
                <div className="min-w-0 flex-1"><div className="t-base font-medium leading-snug">{e.title}</div><div className="t-sm text-[var(--text-3)]">{roleLabel(e.ownerRole)} to decide</div></div>
              </div>
            ))}
          </Panel>
          {quick.length > 0 && (
            <div>
              <div className="t-label mb-1.5">Go to</div>
              <div className="flex flex-col gap-1.5">{quick.map((n) => <ActionTile key={n.to} icon={n.icon} title={n.label} hint={n.group} onClick={() => go.site(n.to)} />)}</div>
              <p className="t-xs text-[var(--text-3)] mt-2 touch:hidden">Press <Kbd keys="mod+k" /> to jump anywhere, or <Kbd keys="?" /> for every shortcut on this screen.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
