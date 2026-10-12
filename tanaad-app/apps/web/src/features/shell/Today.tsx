import { useEffect } from 'react';
import { Activity, AlertCircle, AlertTriangle, ArrowRight, Boxes, CheckCircle2, Circle, CircleDot, Factory, LayoutDashboard, Scale, Users, Wallet } from 'lucide-react';
import type { Role } from '@tanaad/domain';
import { contractState } from '@tanaad/domain';
import { useStore, type AppState } from '@/data/store';
import { useSite, useGo } from '@/app/hooks';
import { registerHotkey } from '@/app/hotkeys';
import { ROLE_TABS, visibleSiteNav } from '@/app/nav';
import { ActionTile, Avatar, Badge, Bar, Button, Empty, KpiStrip, Note, Panel, Stat, cn } from '@/components/ui';
import { CountUp, Donut, TimeTrack } from '@/components/charts';
import { SITE_COLOR } from '@/config/siteIdentity';
import { attendanceFor, cashDayFor, cashSummary, currentShiftKind, dailySeries, DEMO_HOUR, headcount, lastWorkingDays, intakeToday, lowStockParts, machineWall, machinesDown, openExceptions, receivables, rosterFor, shiftId, stockByProduct } from '@/data/selectors';
import { compact, fmtUGX } from '@/data/format';
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
    attendance: { id: 'attendance', title: 'Mark today’s attendance', detail: marked >= roster.length ? `All ${roster.length} workers marked for the ${kind} shift` : `${roster.length - marked} of ${roster.length} workers still need to be marked Present, Half day or Absent`, state: marked >= roster.length ? 'done' : 'todo', progress: [Math.min(marked, roster.length), roster.length], to: 'people/attendance', cta: marked >= roster.length ? 'Review attendance' : 'Mark attendance' },
    machines: { id: 'machines', title: `Log machine output on the ${wallName}`, detail: logged >= active.length ? (below ? `${below} machine below benchmark with no reason given` : 'Every running machine has its shift output recorded') : `${active.length - logged} machine${active.length - logged === 1 ? '' : 's'} still waiting for shift output${below ? ` · ${below} below benchmark` : ''}`, state: logged >= active.length ? (below ? 'attention' : 'done') : 'attention', progress: [logged, active.length], to: 'production/wall', cta: logged >= active.length ? `Review ${wallName}` : 'Log machines' },
    signup: { id: 'signup', title: 'Register a new casual worker', detail: signedUpToday ? `${signedUpToday} new casual worker registered today` : 'Capture ID photo, face photo, daily rate and zone in under 1 minute', state: 'info', to: 'people/signup', cta: 'Register casual' },
    contracts: { id: 'contracts', title: 'Review worker contracts & roster', detail: expiring ? `${expiring} contract${expiring === 1 ? '' : 's'} ending within 3 days or already ended` : 'All active contracts are in good standing', state: expiring ? 'attention' : 'done', to: 'people/registry', cta: 'Open workers' },
    expense: { id: 'expense', title: 'Record cash expenses with a category', detail: cash ? `${cash.entries.filter((e) => e.direction === 'out').length} entries today · ${fmtUGX(cash.expenses + cash.wages)} paid out` : 'Record money paid out with a category and payee', state: 'info', to: 'cash/expense', cta: 'Record expense' },
    confirmCash: { id: 'confirmCash', title: 'Confirm cash received for local orders', detail: awaitingCash ? `${awaitingCash} local order${awaitingCash === 1 ? '' : 's'} waiting for cashier confirmation before loading` : 'All local orders have cash confirmed', state: awaitingCash ? 'todo' : 'done', to: 'sales/orders', cta: 'Confirm cash' },
    closeDay: { id: 'closeDay', title: 'Count notes, sign and close the cash day', detail: cd?.status === 'closed' ? 'Cash day closed and signed. Balance carried forward.' : cash ? `Expected closing balance: ${fmtUGX(cash.expectedClosing)}` : 'Open cash book to count notes and reconcile', state: cd?.status === 'closed' ? 'done' : DEMO_HOUR >= 17 ? 'attention' : 'todo', to: 'cash', cta: 'Open cash book' },
    settlement: { id: 'settlement', title: 'Pay due worker wage settlements', detail: 'Settle weekly casuals, ended contracts, and monthly staff', state: 'info', to: 'people/settlement', cta: 'Open settlements' },
    load: { id: 'load', title: 'Load lorry, scan bundles & weigh at gate', detail: held ? `${held} lorry held at the gate due to weight mismatch` : toLoad ? `${toLoad} approved order${toLoad === 1 ? '' : 's'} ready to load and scan` : 'No lorries waiting to load right now', state: held ? 'attention' : toLoad ? 'todo' : 'done', to: 'stock/dispatch', cta: 'Load & weigh lorry' },
    receive: { id: 'receive', title: 'Weigh in incoming deliveries at the gate', detail: site.id === 'recycling' ? `${intakeToday(s, s.today).length} collector deliveries today · ${unpaidIntake} vouchers unpaid` : 'Weigh every incoming supplier delivery on the gate scale', state: site.id === 'recycling' && unpaidIntake ? 'todo' : 'info', to: site.id === 'recycling' ? 'production/intake' : 'stock/receive', cta: 'Weigh delivery' },
    count: { id: 'count', title: 'Count physical stock in a warehouse zone', detail: countAge === undefined ? 'No stock count on record yet' : `Last warehouse count was ${countAge} day${countAge === 1 ? '' : 's'} ago`, state: countAge === undefined || countAge > 7 ? 'todo' : 'done', to: 'stock/count', cta: 'Count stock' },
    spares: { id: 'spares', title: 'Issue spare parts & check minimum stock', detail: low ? `${low} spare part${low === 1 ? '' : 's'} below minimum reorder level` : 'All spare parts are above minimum stock', state: low ? 'attention' : 'done', to: 'stock/spares', cta: 'Open spares store' },
    breakdowns: { id: 'breakdowns', title: 'Resolve open machine breakdowns', detail: down ? `${down} machine${down === 1 ? '' : 's'} currently down for repair` : 'All machines are running normally', state: down ? 'attention' : 'done', to: 'stock/maintenance', cta: 'Open breakdowns' },
    approval: { id: 'approval', title: 'Track export orders awaiting CEO credit approval', detail: awaitingApproval ? `${awaitingApproval} export order${awaitingApproval === 1 ? '' : 's'} waiting for CEO decision` : 'No export orders waiting for credit approval', state: awaitingApproval ? 'info' : 'done', to: 'sales/orders', cta: 'View orders' },
    invoice: { id: 'invoice', title: 'Send invoices for dispatched orders', detail: toInvoice ? `${toInvoice} dispatched order${toInvoice === 1 ? '' : 's'} ready to invoice` : 'Every dispatched order has been invoiced', state: toInvoice ? 'todo' : 'done', to: 'sales/invoices', cta: 'Send invoices' },
    overdue: { id: 'overdue', title: 'Follow up on overdue client balances', detail: overdue ? `${overdue} client${overdue === 1 ? '' : 's'} past agreed credit terms` : 'No clients are past credit terms', state: overdue ? 'attention' : 'done', to: 'sales/clients', cta: 'Review clients' },
    exceptions: { id: 'exceptions', title: 'Review & decide open factory exceptions', detail: ex.length ? `${ex.length} open item${ex.length === 1 ? '' : 's'} · ${ex.filter((e) => e.severity === 'critical').length} critical` : 'No open exceptions waiting for a decision', state: ex.some((e) => e.severity === 'critical') ? 'attention' : ex.length ? 'todo' : 'done', to: 'dashboard', cta: 'Open dashboard' },
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

const STATE_META: Record<TaskState, { icon: typeof Circle; color: string; label: string; badgeTone: 'ok' | 'warn' | 'bad' | 'info' }> = {
  done: { icon: CheckCircle2, color: 'var(--ok)', label: 'Completed', badgeTone: 'ok' },
  todo: { icon: Circle, color: 'var(--warn)', label: 'To do today', badgeTone: 'warn' },
  attention: { icon: AlertCircle, color: 'var(--bad)', label: 'Needs action', badgeTone: 'bad' },
  info: { icon: CircleDot, color: 'var(--info)', label: 'Quick action', badgeTone: 'info' },
};

/** Role home: the shift's work as a guided step-by-step workflow, live numbers above it, shortcuts beside it. */
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
  const nextTask = tasks.find((t) => t.state === 'attention' || t.state === 'todo') ?? tasks[0];

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
            <div className="text-[12.5px] text-white/70">{nextTask && nextTask.state !== 'done' ? `Next step: ${nextTask.title}` : 'All main shift steps are up to date'}</div>
          </div>
        </div>
        <div className="flex-1 min-w-[240px] max-w-[460px]">
          <div className="flex items-center justify-between mb-2 text-[12.5px]"><span className="inline-flex items-center gap-1.5 font-medium"><span className="size-1.5 rounded-full bg-[var(--color-amber-400)] anim-live" />{kind === 'day' ? 'Day' : 'Night'} shift</span><span className="text-white/60">{DEMO_HOUR - 7} h in · {19 - DEMO_HOUR} h left</span></div>
          <TimeTrack progress={progress} startLabel={shift?.starts ?? '07:00'} endLabel={shift?.ends ?? '19:00'} nowLabel={`${DEMO_HOUR}:20 now`} onDark />
        </div>
        <div className="flex flex-wrap items-center gap-2.5 ml-auto">
          {countable > 0 && <div className="flex items-center gap-2.5 mr-1 [&_circle:first-child]:stroke-white/15"><Donut size={52} thickness={6} center={<span className="text-white text-[13px]">{done}/{countable}</span>} segments={[{ label: 'Done', value: done, color: 'var(--color-amber-400)' }, { label: 'Open', value: Math.max(0, countable - done), color: 'rgb(255 255 255 / .18)' }]} /><div className="leading-tight"><div className="text-[13px] font-medium">Shift steps</div><div className="text-[11.5px] text-white/55">{done === countable ? 'all done' : `${countable - done} remaining`}</div></div></div>}
          <Button variant="inverse" icon={Factory} onClick={() => go.site('reports/production')}>Production Report</Button>
          {nextTask && <Button variant="accent" onClick={() => go.site(nextTask.to)}>{nextTask.cta}</Button>}
        </div>
      </section>
      {site.toBeConfirmed && (role === 'supervisor' || role === 'site_manager') && <Note tone="warn">{site.toBeConfirmed}</Note>}

      <KpiStrip>
        <Stat label={`On ${kind} shift`} icon={Users} accent="var(--series-1)" value={<CountUp value={hc.total} />} sub={`${hc.present} full · ${hc.half} half day`} spark={past.map((d) => d.headcount)} onClick={() => go.site('reports/attendance')} />
        <Stat label="Machines not logged" icon={Activity} accent="var(--series-7)" value={<CountUp value={notLogged} />} tone={notLogged ? 'bad' : 'neutral'} sub={below ? `${below} below benchmark` : 'Benchmarks met so far'} spark={past.map((d) => d.units)} sparkColor="var(--series-7)" onClick={() => go.site('reports/production')} />
        <Stat label="Cash expected" icon={Wallet} accent="var(--series-2)" value={cash ? <CountUp value={cash.expectedClosing} format={compact} /> : '—'} sub={cash ? `UGX · day ${cd?.status}` : 'No cash day'} spark={past.map((d) => d.closing)} onClick={() => go.site('reports/cash')} />
        {site.id === 'recycling'
          ? <Stat label="Intake today" icon={Scale} accent="var(--series-5)" value={<><CountUp value={Math.round(intakeToday(s, s.today).reduce((t, d) => t + d.netKg, 0))} /><span className="t-base text-[var(--text-3)] font-medium"> kg</span></>} sub={`${intakeToday(s, s.today).length} deliveries`} onClick={() => go.site('reports/production')} />
          : <Stat label="In stock" icon={Boxes} accent="var(--series-5)" value={<CountUp value={stock.reduce((t, r) => t + r.bundles, 0)} />} sub={`${site.id === 'bags' ? 'packs and rolls' : 'bundles'} · ${stock.length} products`} onClick={() => go.site('reports/dispatch')} />}
        <Stat label="Open exceptions" icon={AlertTriangle} accent="var(--series-8)" value={<CountUp value={ex.length} />} tone={ex.some((e) => e.severity === 'critical') ? 'bad' : ex.length ? 'warn' : 'neutral'} sub={ex.length ? `${ex.filter((e) => e.severity === 'critical').length} critical` : 'Nothing to decide'} onClick={() => go.site('reports/production')} />
      </KpiStrip>

      <div className="grid gap-[var(--gap)] min-[1240px]:grid-cols-[minmax(0,1fr)_340px] items-start">
        <Panel icon={CheckCircle2} title="Your Guided Shift Workflow" sub="Follow each step in order — click the button on the right to complete it" pad={false}>
          {tasks.map((t, i) => {
            const st = STATE_META[t.state]; const Icon = st.icon;
            return (
              <div key={t.id} onClick={() => go.site(t.to)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go.site(t.to); } }}
                className="group w-full flex flex-wrap sm:flex-nowrap items-center gap-3.5 px-[var(--pad)] py-3.5 touch:py-4 text-left border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--hover)] cursor-pointer transition-colors">
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className={cn('size-8 touch:size-10 rounded-lg grid place-items-center font-bold num t-base shrink-0', t.state === 'done' ? 'bg-[var(--ok-bg)] text-[var(--ok)]' : t.state === 'attention' ? 'bg-[var(--bad-bg)] text-[var(--bad)]' : 'bg-[var(--surface-3)] text-[var(--text)]')}>
                    {t.state === 'done' ? <Icon className="size-5" /> : i + 1}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="t-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">Step {i + 1}</span>
                    <Badge tone={st.badgeTone}>{st.label}</Badge>
                  </div>
                  <div className={cn('t-base font-semibold mt-0.5', t.state === 'done' && 'text-[var(--text-2)]')}>{t.title}</div>
                  <div className={cn('t-sm mt-0.5', t.state === 'attention' ? 'text-[var(--bad)] font-medium' : 'text-[var(--text-2)]')}>{t.detail}</div>
                </div>
                {t.progress && (
                  <div className="hidden md:flex flex-col gap-1 w-[150px] shrink-0">
                    <div className="flex items-center justify-between t-xs text-[var(--text-2)]">
                      <span>Progress</span>
                      <span className="num font-semibold">{t.progress[0]} / {t.progress[1]}</span>
                    </div>
                    <Bar value={t.progress[0]} max={t.progress[1] || 1} tone={t.progress[0] >= t.progress[1] ? 'ok' : 'series'} />
                  </div>
                )}
                <span className={cn('inline-flex items-center gap-1.5 px-3 h-8 touch:h-10 rounded-md t-sm font-semibold shrink-0 transition-colors ml-auto',
                  t.state === 'done'
                    ? 'bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--line-2)] group-hover:bg-[var(--surface)] group-hover:text-[var(--text)]'
                    : t.state === 'attention'
                      ? 'bg-[var(--accent)] text-white shadow-xs'
                      : 'bg-[var(--brand)] text-[var(--brand-contrast)] shadow-xs')}>
                  {t.cta}
                  <ArrowRight className="size-3.5" />
                </span>
              </div>
            );
          })}
        </Panel>

        <div className="flex flex-col gap-[var(--gap)]">
          <Panel icon={AlertTriangle} title="Needs attention" sub={ex.length ? `${ex.length} open` : undefined} pad={false}>
            {ex.length === 0 ? <div className="p-[var(--pad)]"><Empty title="Nothing open" hint="Exceptions raised by the gate, the cash close or the machine wall show up here." /></div> : ex.slice(0, 5).map((e) => (
              <div key={e.id} className="flex items-start gap-2.5 px-[var(--pad)] py-2.5 border-b border-[var(--line)] last:border-b-0">
                <span className="mt-[5px] size-2 rounded-full shrink-0" style={{ background: e.severity === 'critical' ? 'var(--bad)' : e.severity === 'warning' ? 'var(--warn)' : 'var(--text-4)' }} />
                <div className="min-w-0 flex-1"><div className="t-base font-medium leading-snug">{e.title}</div><div className="t-sm text-[var(--text-3)]">{roleLabel(e.ownerRole)} to decide</div></div>
              </div>
            ))}
          </Panel>
          {quick.length > 0 && (
            <div>
              <div className="t-label mb-1.5">Quick shortcuts</div>
              <div className="flex flex-col gap-1.5">{quick.map((n) => <ActionTile key={n.to} icon={n.icon} title={n.label} hint={n.group} onClick={() => go.site(n.to)} />)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
