import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ClipboardCheck,
  Factory,
  LockOpen,
  Truck,
  Wrench,
} from 'lucide-react';
import { useStore } from '@/data/store';
import { useGo, useQueryParam, useSite } from '@/app/hooks';
import { ColumnChart } from '@/components/charts';
import {
  cashDayFor,
  cashSummary,
  currentShiftKind,
  dailySeries,
  headcount,
  intakeToday,
  lastWorkingDays,
  lowStockParts,
  machineWall,
  machinesDown,
  openExceptions,
  stockByProduct,
} from '@/data/selectors';
import { fmtDayShort, fmtKg, fmtNum, fmtUGX } from '@/data/format';
import { en } from '@/i18n/en';
import {
  PaperSheet,
  SavedBanner,
  StatusNotice,
  SummaryCard,
  useSavedBanner,
} from '@/components/simple';

export function SiteDashboard() {
  const s = useStore();
  const site = useSite();
  const go = useGo();
  const tabParam = useQueryParam('tab');
  const [tab, setTab] = useState<'summary' | 'waiting'>(
    tabParam === 'waiting' ? 'waiting' : 'summary',
  );
  const { saved, showSaved, clearSaved } = useSavedBanner();

  useEffect(() => {
    setTab(tabParam === 'waiting' ? 'waiting' : 'summary');
  }, [tabParam]);

  const kind = currentShiftKind();
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
  const downMachines = machinesDown(s, site.id);

  const cd = cashDayFor(s, site.id, s.today);
  const cash = cd ? cashSummary(s, cd.id) : undefined;

  const stock = stockByProduct(s, site.id);
  const totalBundles = stock.reduce((t, r) => t + r.bundles, 0);
  const totalStockKg = Math.round(stock.reduce((t, r) => t + r.kg, 0));
  const ordersToLoad = s.orders.filter(
    (o) =>
      o.siteId === site.id &&
      (o.status === 'approved' || o.status === 'picking'),
  ).length;

  const intakeList = intakeToday(s, s.today);
  const intakeKg = Math.round(intakeList.reduce((t, d) => t + d.netKg, 0));

  const unit =
    site.id === 'mats' ? 'mats' : site.id === 'bags' ? 'packs' : 'sacks';

  // Things waiting for the site manager
  const exceptions = openExceptions(s, site.id);
  const heldDispatches = s.dispatches.filter(
    (d) => d.siteId === site.id && d.gateStatus === 'hold',
  );
  const lowParts = lowStockParts(s, site.id);
  const totalWaiting =
    exceptions.length + heldDispatches.length + downMachines.length;

  // Gate override state
  const [overridePin, setOverridePin] = useState('2468');
  const [overrideReason, setOverrideReason] = useState(
    'Recounted bundles with supervisor and verified customer order',
  );

  const handleOverrideGate = (dispatchId: string, dnNo: string) => {
    const ok = s.overrideGate(
      dispatchId,
      overridePin.trim(),
      overrideReason.trim() || 'Approved by site manager',
    );
    if (ok) {
      showSaved(`Gate unlocked for ${dnNo}. Lorry may now leave.`);
    }
  };

  return (
    <div className="space-y-5">
      <SavedBanner info={saved} onDismiss={clearSaved} />

      {/* Top mode switcher: Today at my factory vs Things waiting for me */}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => setTab('summary')}
          className={`min-h-[48px] px-5 rounded-[8px] border font-bold text-[16px] flex items-center gap-2 transition-colors cursor-pointer ${
            tab === 'summary'
              ? 'bg-[var(--brand)] text-[var(--brand-contrast)] border-[var(--brand)]'
              : 'bg-[var(--surface)] text-[var(--text)] border-[var(--line-2)] hover:bg-[var(--surface-2)]'
          }`}
        >
          <Factory className="size-5" />
          <span>{en.manager.summaryTitle}</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('waiting')}
          className={`min-h-[48px] px-5 rounded-[8px] border font-bold text-[16px] flex items-center gap-2 transition-colors cursor-pointer ${
            tab === 'waiting'
              ? 'bg-[var(--brand)] text-[var(--brand-contrast)] border-[var(--brand)]'
              : 'bg-[var(--surface)] text-[var(--text)] border-[var(--line-2)] hover:bg-[var(--surface-2)]'
          }`}
        >
          <ClipboardCheck className="size-5" />
          <span>
            {en.manager.waitingTitle} ({totalWaiting})
          </span>
        </button>
      </div>

      {site.toBeConfirmed && (
        <StatusNotice
          tone="warn"
          title="Factory settings to be confirmed with Tanaad"
        >
          {site.toBeConfirmed}
        </StatusNotice>
      )}

      {tab === 'summary' ? (
        <div className="space-y-5">
          <PaperSheet
            title={`${en.manager.summaryTitle} · ${site.name}`}
            subtitle="Five plain numbers for your factory today, with one short sentence under each."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SummaryCard
                label="Who came to work today"
                value={`${fmtNum(hcToday)} people`}
                sentence={`${fmtNum(hcToday)} people came today. Yesterday it was ${fmtNum(hcYesterday)}.`}
                tone={hcToday > 0 ? 'ok' : 'warn'}
                onClick={() => go.site('people/attendance')}
              />

              <SummaryCard
                label="Machines written down"
                value={`${loggedMachines.length} of ${activeMachines.length}`}
                sentence={`${loggedMachines.length} of ${activeMachines.length} machines written down. ${
                  downMachines.length > 0
                    ? `${downMachines.length} machine broken.`
                    : 'No broken machines.'
                }`}
                tone={
                  downMachines.length > 0
                    ? 'bad'
                    : loggedMachines.length === activeMachines.length
                      ? 'ok'
                      : 'warn'
                }
                onClick={() => go.site('production/wall')}
              />

              <SummaryCard
                label="What the factory made today"
                value={`${fmtNum(todayStats?.units ?? 0)} ${unit}`}
                sentence={
                  todayStats?.target
                    ? `Full-shift target is ${fmtNum(todayStats.target)} ${unit}. Yesterday we made ${fmtNum(yesterdayStats?.units ?? 0)} ${unit}.`
                    : `Yesterday we made ${fmtNum(yesterdayStats?.units ?? 0)} ${unit}.`
                }
                tone="neutral"
                onClick={() => go.site('production/wall')}
              />

              <SummaryCard
                label="Cash expected in the safe"
                value={cash ? fmtUGX(cash.expectedClosing) : 'UGX 0'}
                sentence={
                  cash
                    ? `Money in today: ${fmtUGX(cash.sales + cash.receipts)}. Money out today: ${fmtUGX(cash.expenses + cash.wages)}.`
                    : 'Cash book has not been opened today.'
                }
                tone={cd?.status === 'closed' ? 'ok' : 'neutral'}
                onClick={() => go.site('cash')}
              />

              {site.id === 'recycling' ? (
                <SummaryCard
                  label="Scrap weighed in today"
                  value={fmtKg(intakeKg)}
                  sentence={`${intakeList.length} collector deliveries weighed at the gate today.`}
                  tone="ok"
                  onClick={() => go.site('production/intake')}
                />
              ) : (
                <SummaryCard
                  label="Finished goods in the store"
                  value={`${fmtNum(totalBundles)} bundles`}
                  sentence={`${fmtKg(totalStockKg)} on the floor. ${ordersToLoad} customer order${
                    ordersToLoad === 1 ? '' : 's'
                  } ready to load onto a lorry.`}
                  tone="neutral"
                  onClick={() => go.site('stock/count')}
                />
              )}

              <SummaryCard
                label="Things waiting for you"
                value={
                  totalWaiting === 0
                    ? 'Nothing waiting'
                    : `${totalWaiting} item${totalWaiting === 1 ? '' : 's'}`
                }
                sentence={
                  totalWaiting === 0
                    ? 'No held lorries, no open alerts, and no broken machines.'
                    : `${exceptions.length} alert${exceptions.length === 1 ? '' : 's'}, ${heldDispatches.length} held lorr${heldDispatches.length === 1 ? 'y' : 'ies'}, ${downMachines.length} broken machine${downMachines.length === 1 ? '' : 's'}. Tap to open.`
                }
                tone={
                  heldDispatches.length > 0 || downMachines.length > 0
                    ? 'bad'
                    : totalWaiting > 0
                      ? 'warn'
                      : 'ok'
                }
                onClick={() => setTab('waiting')}
              />
            </div>
          </PaperSheet>

          {/* Single calm chart for the Site Manager (Principle 10: at most one or two charts for managers) */}
          <PaperSheet
            title={`Daily output over the last 7 working days (${unit})`}
            subtitle="Bars show what the factory made each day. The dark line is the daily target."
          >
            <div className="pt-2">
              <ColumnChart
                height={190}
                data={series.map((d) => ({
                  label: fmtDayShort(d.day),
                  values: [d.units],
                  partial: d.partial,
                  target: d.target || undefined,
                }))}
              />
            </div>
          </PaperSheet>
        </div>
      ) : (
        <div className="space-y-5">
          {/* 1. Held lorries at the gate */}
          <PaperSheet
            title="Lorries held at the gate"
            subtitle="When a lorry weighs less than expected at the gate, it is locked until recounted or unlocked by the Site Manager (PIN 2468)."
          >
            {heldDispatches.length === 0 ? (
              <StatusNotice tone="ok" title="No lorry is held at the gate">
                All weighed lorries matched their expected bundle weight.
              </StatusNotice>
            ) : (
              <div className="space-y-4">
                {heldDispatches.map((d) => {
                  const ord = s.orders.find((o) => o.id === d.orderId);
                  const cli = s.clients.find((c) => c.id === ord?.clientId);
                  const diffKg = Math.round((d.gateKg ?? 0) - d.expectedKg);
                  return (
                    <div
                      key={d.id}
                      className="p-4 rounded-[10px] border-2 border-[var(--bad)] bg-[var(--bad-bg)] space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-[18px] font-bold text-[var(--bad)]">
                          <Truck className="size-5" />
                          <span>
                            {d.deliveryNoteNo} · Lorry {d.vehicle} (
                            {cli?.name ?? 'Customer'})
                          </span>
                        </div>
                        <span className="px-3 py-1 rounded-[6px] bg-[var(--bad)] text-white text-[14px] font-bold">
                          GATE LOCKED
                        </span>
                      </div>

                      <div className="text-[16px] text-[var(--text)]">
                        Expected cargo weight: <strong>{fmtKg(d.expectedKg)}</strong> · Gate scale read:{' '}
                        <strong>{fmtKg(d.gateKg ?? 0)}</strong> (difference:{' '}
                        <strong>{diffKg > 0 ? `+${diffKg}` : diffKg} kg</strong>).
                      </div>

                      <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto] items-end pt-2 border-t border-[var(--line)]">
                        <div>
                          <label className="block text-[14px] font-bold text-[var(--text)] mb-1">
                            Reason for unlocking the gate
                          </label>
                          <input
                            type="text"
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            className="w-full min-h-[48px] px-3 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] text-[16px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[14px] font-bold text-[var(--text)] mb-1">
                            Manager PIN
                          </label>
                          <input
                            type="password"
                            value={overridePin}
                            onChange={(e) => setOverridePin(e.target.value)}
                            placeholder="2468"
                            className="w-full min-h-[48px] px-3 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] text-[18px] font-bold num text-center"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleOverrideGate(d.id, d.deliveryNoteNo)
                          }
                          className="min-h-[48px] px-5 rounded-[8px] bg-[var(--brand)] text-white font-bold text-[16px] flex items-center gap-2 cursor-pointer"
                        >
                          <LockOpen className="size-5" />
                          <span>Unlock gate</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </PaperSheet>

          {/* 2. Open factory exceptions */}
          <PaperSheet
            title="Factory problems waiting for your decision"
            subtitle="Review each item below and tap Resolve once handled."
          >
            {exceptions.length === 0 ? (
              <StatusNotice tone="ok" title="No open factory alerts">
                Everything at this factory is up to date.
              </StatusNotice>
            ) : (
              <div className="divide-y divide-[var(--line)] border border-[var(--line-2)] rounded-[10px] bg-[var(--surface)] overflow-hidden">
                {exceptions.map((ex) => (
                  <div
                    key={ex.id}
                    className="p-4 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div className="min-w-[240px] flex-1">
                      <div className="flex items-center gap-2">
                        <AlertTriangle
                          className={`size-5 shrink-0 ${
                            ex.severity === 'critical'
                              ? 'text-[var(--bad)]'
                              : 'text-[var(--warn)]'
                          }`}
                        />
                        <span className="text-[17px] font-bold text-[var(--text)]">
                          {ex.title}
                        </span>
                      </div>
                      <div className="text-[15px] text-[var(--text-2)] mt-1">
                        {ex.detail}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          s.decideException(
                            ex.id,
                            'approved',
                            'Checked and resolved by site manager',
                          );
                          showSaved(`Resolved: ${ex.title}`);
                        }}
                        className="min-h-[48px] px-4 rounded-[8px] bg-[var(--ok)] text-white font-bold text-[15px] flex items-center gap-2 cursor-pointer"
                      >
                        <Check className="size-5" />
                        <span>Mark resolved</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PaperSheet>

          {/* 3. Broken machines & low spare parts */}
          {(downMachines.length > 0 || lowParts.length > 0) && (
            <PaperSheet
              title="Broken machines and spare parts low in stock"
              subtitle="Machines currently stopped or spare parts below minimum level."
            >
              <div className="space-y-3">
                {downMachines.map((m) => {
                  const brk = s.breakdowns.find(
                    (b) => b.machineId === m.id && !b.resolvedAt,
                  );
                  return (
                    <div
                      key={m.id}
                      className="p-4 rounded-[8px] border border-[var(--bad)] bg-[var(--bad-bg)] flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5">
                        <Wrench className="size-5 text-[var(--bad)]" />
                        <div>
                          <div className="text-[17px] font-bold text-[var(--text)]">
                            Machine {m.code} is stopped
                          </div>
                          <div className="text-[15px] text-[var(--text-2)]">
                            Reason: {brk?.cause ?? 'Reported down'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => go.site('stock/maintenance')}
                        className="min-h-[48px] px-4 rounded-[8px] bg-[var(--surface)] border border-[var(--line-2)] font-semibold text-[15px] cursor-pointer"
                      >
                        Open machine repairs
                      </button>
                    </div>
                  );
                })}

                {lowParts.map((p) => (
                  <div
                    key={p.id}
                    className="p-4 rounded-[8px] border border-[var(--warn)] bg-[var(--warn-bg)] flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-[17px] font-bold text-[var(--text)]">
                        Spare part low: {p.name}
                      </div>
                      <div className="text-[15px] text-[var(--text-2)]">
                        Only {p.onHand} {p.unit} left in store (minimum is{' '}
                        {p.minLevel} {p.unit}).
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => go.site('stock/spares')}
                      className="min-h-[48px] px-4 rounded-[8px] bg-[var(--surface)] border border-[var(--line-2)] font-semibold text-[15px] cursor-pointer"
                    >
                      Open spare parts book
                    </button>
                  </div>
                ))}
              </div>
            </PaperSheet>
          )}
        </div>
      )}
    </div>
  );
}
