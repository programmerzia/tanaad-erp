import { useRef } from 'react';
import {
  AlertTriangle,
  Building2,
  MessageSquareText,
} from 'lucide-react';
import { COMPANY } from '@/config/company';
import { SITE_LIST } from '@/config/sites';
import { useStore } from '@/data/store';
import { useGo } from '@/app/hooks';
import {
  cashDayFor,
  cashInSafe,
  cashSummary,
  currentShiftKind,
  dailySeries,
  headcount,
  lastWorkingDays,
  liveSite,
  machineWall,
  openExceptions,
} from '@/data/selectors';
import { fmtDayLong, fmtNum, fmtUGX } from '@/data/format';
import { en } from '@/i18n/en';
import {
  PaperSheet,
  SummaryCard,
  TaskRow,
} from '@/components/simple';

export function Cockpit() {
  const s = useStore();
  const go = useGo();
  const kind = currentShiftKind();
  const sitesRef = useRef<HTMLDivElement>(null);

  const user = s.users.find((u) => u.id === s.session?.userId);
  const awaitingOrders = s.orders.filter((o) => o.status === 'awaiting_approval');
  const openEx = openExceptions(s);
  const totalWaiting = awaitingOrders.length + openEx.length;

  const siteSummaries = SITE_LIST.map((rawSite) => {
    const site = liveSite(s, rawSite);
    const days = lastWorkingDays(site.id, s.today, 7);
    const series = dailySeries(s, site.id, days);
    const todayStats = series[series.length - 1];
    const yesterdayStats = series[series.length - 2];

    const hcToday = headcount(s, site.id, s.today).total;
    const hcYesterday = yesterdayStats
      ? headcount(s, site.id, yesterdayStats.day).total
      : 0;

    const wall = machineWall(s, site.id, s.today, kind);
    const activeMachines = wall.filter((t) => t.state !== 'arriving');
    const loggedMachines = activeMachines.filter(
      (t) => t.state !== 'not_logged' && t.state !== 'down',
    );
    const downCount = activeMachines.filter((t) => t.state === 'down').length;

    const cd = cashDayFor(s, site.id, s.today);
    const cs = cd ? cashSummary(s, cd.id) : undefined;
    const cashExpected = cs?.expectedClosing ?? cashInSafe(s, site.id);

    const dispatchesToday = s.dispatches.filter(
      (d) => d.siteId === site.id && d.createdAt.startsWith(s.today),
    );
    const heldCount = dispatchesToday.filter((d) => d.gateStatus === 'hold').length;
    const siteExceptions = openExceptions(s, site.id);

    const unit =
      site.id === 'mats' ? 'mats' : site.id === 'bags' ? 'packs' : 'sacks';

    return {
      site,
      unit,
      hcToday,
      hcYesterday,
      loggedCount: loggedMachines.length,
      totalMachines: activeMachines.length,
      downCount,
      unitsToday: todayStats?.units ?? 0,
      targetToday: todayStats?.target ?? 0,
      unitsYesterday: yesterdayStats?.units ?? 0,
      cashExpected,
      cashIn: todayStats?.cashIn ?? 0,
      cashOut: todayStats?.cashOut ?? 0,
      dispatchesCount: dispatchesToday.length,
      heldCount,
      exceptionsCount: siteExceptions.length,
    };
  });

  return (
    <div className="space-y-6">
      {/* CEO Home To-Do List (Section 5: The three sites today · Things waiting for my decision · Morning message) */}
      <div className="paper-sheet p-5">
        <div className="text-[14px] font-bold uppercase tracking-wider text-[var(--text-2)]">
          {COMPANY.groupName} · CEO · {fmtDayLong(s.today)}
          {user ? ` · ${user.name}` : ''}
        </div>
        <h1 className="text-[24px] font-bold text-[var(--text)] mt-0.5">
          {en.home.title}
        </h1>
        <p className="text-[16px] text-[var(--text-2)] mt-1">
          {en.home.ceoSub}
        </p>

        <div className="flex flex-col gap-3 mt-4" role="list" aria-label="CEO tasks">
          <TaskRow
            index={1}
            icon={Building2}
            title={en.home.tasks.threeSitesToday}
            description={en.home.tasks.threeSitesTodayDesc}
            statusText="3 sites below"
            state="done"
            onClick={() =>
              sitesRef.current?.scrollIntoView({ behavior: 'smooth' })
            }
          />
          <TaskRow
            index={2}
            icon={AlertTriangle}
            title={en.home.tasks.thingsWaitingCeo}
            description={en.home.tasks.thingsWaitingCeoDesc}
            statusText={
              totalWaiting > 0
                ? `${totalWaiting} waiting for your decision`
                : 'Done · nothing waiting'
            }
            state={totalWaiting > 0 ? 'attention' : 'done'}
            onClick={() => go.group('approvals')}
          />
          <TaskRow
            index={3}
            icon={MessageSquareText}
            title={en.home.tasks.morningMessage}
            description={en.home.tasks.morningMessageDesc}
            statusText="Ready to send on WhatsApp"
            state="todo"
            onClick={() => go.group('brief')}
          />
        </div>
      </div>

      {/* The three sites today (five numbers each, with a short sentence under each) */}
      <div ref={sitesRef} className="space-y-5">
        <div>
          <h2 className="text-[21px] font-bold text-[var(--text)]">
            {en.ceo.sitesTitle}
          </h2>
          <p className="text-[16px] text-[var(--text-2)]">
            {en.ceo.sitesSubtitle}
          </p>
        </div>

        {siteSummaries.map((st) => (
          <PaperSheet
            key={st.site.id}
            title={`${st.site.name} (${st.site.legalName})`}
            subtitle={st.site.tagline}
            badge={
              <button
                type="button"
                onClick={() => go.site('dashboard', st.site.id)}
                className="min-h-[44px] px-4 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] font-semibold text-[15px] hover:bg-[var(--surface-2)] cursor-pointer"
              >
                Open {st.site.shortName} factory
              </button>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {/* Number 1: People */}
              <SummaryCard
                label="1. Who came today"
                value={`${fmtNum(st.hcToday)} people`}
                sentence={`${fmtNum(st.hcToday)} people came today. Yesterday it was ${fmtNum(st.hcYesterday)}.`}
                tone={st.hcToday > 0 ? 'ok' : 'warn'}
                onClick={() => go.site('people/attendance', st.site.id)}
              />

              {/* Number 2: Output */}
              <SummaryCard
                label={`2. Made today (${st.unit})`}
                value={`${fmtNum(st.unitsToday)} ${st.unit}`}
                sentence={
                  st.targetToday > 0
                    ? `Full-shift target is ${fmtNum(st.targetToday)} ${st.unit}. Yesterday was ${fmtNum(st.unitsYesterday)}.`
                    : `Yesterday the factory made ${fmtNum(st.unitsYesterday)} ${st.unit}.`
                }
                tone="neutral"
                onClick={() => go.site('production/wall', st.site.id)}
              />

              {/* Number 3: Machines */}
              <SummaryCard
                label="3. Machines written down"
                value={`${st.loggedCount} of ${st.totalMachines}`}
                sentence={
                  st.downCount > 0
                    ? `${st.loggedCount} of ${st.totalMachines} written down. ${st.downCount} machine broken.`
                    : `${st.loggedCount} of ${st.totalMachines} machines written down today.`
                }
                tone={
                  st.downCount > 0
                    ? 'bad'
                    : st.loggedCount === st.totalMachines
                      ? 'ok'
                      : 'warn'
                }
                onClick={() => go.site('production/wall', st.site.id)}
              />

              {/* Number 4: Cash in safe */}
              <SummaryCard
                label="4. Cash in the safe"
                value={fmtUGX(st.cashExpected)}
                sentence={`Money in: ${fmtUGX(st.cashIn)}. Money out: ${fmtUGX(st.cashOut)}.`}
                tone="neutral"
                onClick={() => go.site('cash', st.site.id)}
              />

              {/* Number 5: Lorries & alerts */}
              <SummaryCard
                label="5. Lorries & decisions"
                value={
                  st.exceptionsCount > 0
                    ? `${st.exceptionsCount} waiting`
                    : `${st.dispatchesCount} lorr${st.dispatchesCount === 1 ? 'y' : 'ies'}`
                }
                sentence={`${st.dispatchesCount} lorr${
                  st.dispatchesCount === 1 ? 'y' : 'ies'
                } weighed today${
                  st.heldCount > 0 ? ` (${st.heldCount} held at gate)` : ''
                }. ${st.exceptionsCount} item${
                  st.exceptionsCount === 1 ? '' : 's'
                } waiting for decision.`}
                tone={
                  st.heldCount > 0
                    ? 'bad'
                    : st.exceptionsCount > 0
                      ? 'warn'
                      : 'ok'
                }
                onClick={() => go.group('approvals')}
              />
            </div>
          </PaperSheet>
        ))}
      </div>
    </div>
  );
}
