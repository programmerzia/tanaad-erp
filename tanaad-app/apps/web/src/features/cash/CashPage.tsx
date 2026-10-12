import { useMemo, useState } from 'react';
import {
  Banknote,
  Check,
  CheckCircle2,
  Minus,
  Plus,
  RotateCcw,
  Wallet,
} from 'lucide-react';
import { useStore } from '@/data/store';
import { useGo, useQueryParam, useRefList, useSite, useSiteSettings } from '@/app/hooks';
import { cashDayFor, cashSummary, orderTotal } from '@/data/selectors';
import { fmtMoney, fmtNum, fmtTime, fmtUGX } from '@/data/format';
import { Input, cn } from '@/components/ui';
import {
  LargeKeypad,
  PaperSheet,
  SavedBanner,
  StatusNotice,
  useSavedBanner,
} from '@/components/simple';
import { en } from '@/i18n/en';

type Mode = 'in' | 'close' | 'book';

/**
 * Cashier screens:
 *  - Money in (confirm customer cash orders or record cash received)
 *  - Count and close the day (Flow 5: count each note, the screen adds up, compare with what should be there, sign)
 *  - Today's Cash Book (paper mirror of opening, money in, money out, expected closing)
 */
export function CashPage() {
  const s = useStore();
  const site = useSite();
  const go = useGo();
  const settings = useSiteSettings();
  const modeParam = useQueryParam('mode') as Mode | undefined;
  const { saved, showSaved, clearSaved } = useSavedBanner();

  const [mode, setMode] = useState<Mode>(
    modeParam === 'close' ? 'close' : 'in',
  );

  const cd = cashDayFor(s, site.id, s.today);
  const cs = cd ? cashSummary(s, cd.id) : undefined;
  const categories = useRefList('expense_category');
  const denomRefs = useRefList('denomination');
  const denominations = useMemo(
    () =>
      denomRefs
        .map((r) => r.value ?? 0)
        .filter((v) => v > 0)
        .sort((a, b) => b - a),
    [denomRefs],
  );

  // Orders waiting for cash at this site
  const awaitingCashOrders = useMemo(
    () =>
      s.orders.filter(
        (o) => o.siteId === site.id && o.status === 'awaiting_cash',
      ),
    [s.orders, site.id],
  );

  // Other Money In state
  const [inAmountStr, setInAmountStr] = useState('');
  const [inPayer, setInPayer] = useState('');
  const [inNote, setInNote] = useState('Cash sale');

  // Flow 5: Note counting state (initialized near expected closing so cashier can adjust in 1-2 taps)
  const expectedClosing = cs?.expectedClosing ?? 0;
  const [noteCounts, setNoteCounts] = useState<Record<number, number>>(() => {
    const out: Record<number, number> = {};
    let rem = Math.max(0, Math.round(expectedClosing / 1000) * 1000);
    for (const d of [50000, 20000, 10000, 5000, 2000, 1000]) {
      const cnt = Math.floor(rem / d);
      out[d] = cnt;
      rem -= cnt * d;
    }
    return out;
  });

  const countedTotal = useMemo(
    () =>
      denominations.reduce(
        (sum, d) => sum + d * (noteCounts[d] ?? 0),
        0,
      ),
    [denominations, noteCounts],
  );

  const varianceThreshold =
    settings?.cashVariance ?? site.thresholds.cashVariance;
  const vCheck = {
    variance: countedTotal - expectedClosing,
    withinTolerance: Math.abs(countedTotal - expectedClosing) <= varianceThreshold,
  };

  const setNoteCount = (denom: number, nextCount: number) => {
    setNoteCounts((prev) => ({
      ...prev,
      [denom]: Math.max(0, Math.min(9999, nextCount)),
    }));
  };

  const matchExpectedExactly = () => {
    const out: Record<number, number> = {};
    let rem = Math.max(0, Math.round(expectedClosing / 1000) * 1000);
    for (const d of denominations) {
      const cnt = Math.floor(rem / d);
      out[d] = cnt;
      rem -= cnt * d;
    }
    setNoteCounts(out);
  };

  const handleConfirmOrderCash = (orderId: string) => {
    const ord = s.orders.find((o) => o.id === orderId);
    if (!ord) return;
    const client = s.clients.find((c) => c.id === ord.clientId);
    const total = orderTotal(ord);
    s.confirmCash(orderId);
    showSaved(`Cash received for order ${ord.number}`, {
      detail: `${client?.name ?? 'Customer'} · ${fmtMoney(total, ord.currency)} · Store can now load the lorry.`,
    });
  };

  const handleSaveOtherMoneyIn = () => {
    const amt = Number(inAmountStr) || 0;
    if (amt <= 0 || !inPayer.trim()) return;
    const payerName = inPayer.trim();
    s.addCashEntry({
      siteId: site.id,
      day: s.today,
      direction: 'in',
      amount: amt,
      category: 'sale',
      payee: payerName,
      note: inNote.trim() || 'Cash received',
      hasReceiptPhoto: true,
    });
    showSaved(`${fmtUGX(amt)} received from ${payerName}`, {
      detail: 'Added to today’s cash book',
      onUndo: () => {
        s.addCashEntry({
          siteId: site.id,
          day: s.today,
          direction: 'out',
          amount: amt,
          category: 'other',
          payee: payerName,
          note: `Undo money in (${payerName})`,
          hasReceiptPhoto: false,
        });
      },
    });
    setInAmountStr('');
    setInPayer('');
  };

  const handleSignAndClose = () => {
    if (!cd) return;
    const denomMap: Record<string, number> = {};
    for (const d of denominations) {
      denomMap[String(d)] = noteCounts[d] ?? 0;
    }
    s.closeCashDay(cd.id, countedTotal, denomMap);
    showSaved('Day counted, signed and closed', {
      detail: `Counted ${fmtUGX(countedTotal)} against ${fmtUGX(expectedClosing)} expected.`,
      onUndo: () => {
        s.reopenCashDay(cd.id, 'Reopened to recount');
      },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <SavedBanner info={saved} onDismiss={clearSaved} />

      {/* Top mode switcher: 3 clear choices */}
      <div className="paper-sheet p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="t-sm font-semibold text-[var(--text-2)]">
            {site.name} · Cashier
          </div>
          <h1 className="t-title text-[var(--text)] mt-0.5">
            {mode === 'in'
              ? en.cash.moneyInTitle
              : mode === 'close'
                ? en.cash.closeDayTitle
                : en.cash.title}
          </h1>
          <p className="t-base text-[var(--text-2)] mt-0.5">
            {mode === 'in'
              ? en.cash.moneyInSubtitle
              : mode === 'close'
                ? en.cash.closeDaySubtitle
                : 'Same columns as your paper cash-and-sales book.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMode('in')}
            className={cn(
              'ctl px-4 rounded-[8px] border font-bold t-base',
              mode === 'in'
                ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                : 'bg-[var(--surface)] border-[var(--line-2)] text-[var(--text)] hover:bg-[var(--hover)]',
            )}
          >
            1. Money in
          </button>
          <button
            type="button"
            onClick={() => go.site('cash/expense')}
            className="ctl px-4 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] text-[var(--text)] font-bold t-base"
          >
            2. Money out
          </button>
          <button
            type="button"
            onClick={() => setMode('close')}
            className={cn(
              'ctl px-4 rounded-[8px] border font-bold t-base',
              mode === 'close'
                ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                : 'bg-[var(--surface)] border-[var(--line-2)] text-[var(--text)] hover:bg-[var(--hover)]',
            )}
          >
            3. Count and close the day
          </button>
        </div>
      </div>

      {/* ====================================================================
       * MODE 1: MONEY IN
       * ==================================================================== */}
      {mode === 'in' && (
        <div className="flex flex-col gap-5">
          {/* Customer orders waiting for cash */}
          <PaperSheet
            title="Customer orders waiting for cash"
            subtitle="Local orders stay locked at the store until you confirm the cash here."
            badge={
              <span className="px-3 py-1 rounded-[6px] bg-[var(--surface)] border border-[var(--line-2)] t-sm font-bold num">
                {awaitingCashOrders.length} waiting
              </span>
            }
          >
            {awaitingCashOrders.length === 0 ? (
              <StatusNotice tone="ok" title="All customer orders confirmed">
                No customer order is waiting for cash right now.
              </StatusNotice>
            ) : (
              <div className="flex flex-col gap-3">
                {awaitingCashOrders.map((ord) => {
                  const client = s.clients.find((c) => c.id === ord.clientId);
                  const total = orderTotal(ord);
                  return (
                    <div
                      key={ord.id}
                      className="rounded-[10px] border-2 border-[var(--warn)] bg-[var(--warn-bg)]/40 p-4 flex flex-wrap items-center justify-between gap-4"
                    >
                      <div>
                        <div className="t-lg font-bold text-[var(--text)]">
                          {client?.name ?? 'Customer'} ·{' '}
                          <span className="code">{ord.number}</span>
                        </div>
                        <div className="t-base text-[var(--text-2)] mt-0.5">
                          {ord.lines
                            .map((l) => {
                              const p = s.products.find(
                                (x) => x.id === l.productId,
                              );
                              return `${l.bundles} bundles ${p?.internalName ?? ''}`;
                            })
                            .join(', ')}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="t-xs font-semibold text-[var(--text-2)]">
                            Cash to collect
                          </div>
                          <div className="t-kpi num">
                            {fmtMoney(total, ord.currency)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleConfirmOrderCash(ord.id)}
                          className="ctl-lg px-5 rounded-[8px] bg-[var(--ok)] hover:opacity-95 text-white font-bold t-base inline-flex items-center gap-2 shadow-[var(--shadow-card)]"
                        >
                          <Check className="size-5 stroke-[2.5]" />
                          <span>Confirm cash received</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </PaperSheet>

          {/* Write down other cash received */}
          <PaperSheet
            title="Write down other cash received"
            subtitle="For walk-in cash sales or cash brought to the safe."
            footer={
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="t-base text-[var(--text-2)]">
                  {Number(inAmountStr) > 0 && inPayer.trim()
                    ? `Ready: ${fmtUGX(Number(inAmountStr))} from ${inPayer.trim()}`
                    : 'Enter the amount and who paid above.'}
                </span>
                <button
                  type="button"
                  disabled={!(Number(inAmountStr) > 0 && inPayer.trim())}
                  onClick={handleSaveOtherMoneyIn}
                  className="ctl-lg px-6 rounded-[8px] bg-[var(--ok)] hover:opacity-95 disabled:opacity-45 text-white font-bold t-lg inline-flex items-center gap-2 shadow-[var(--shadow-card)]"
                >
                  <Check className="size-5 stroke-[2.5]" />
                  <span>{en.cash.saveMoneyIn}</span>
                </button>
              </div>
            }
          >
            <div className="grid gap-6 lg:grid-cols-2 items-start">
              <LargeKeypad
                value={inAmountStr}
                onChange={setInAmountStr}
                unit="UGX"
                label="Amount received (UGX)"
                presets={[
                  { label: '100,000', value: 100000 },
                  { label: '250,000', value: 250000 },
                  { label: '500,000', value: 500000 },
                  { label: '1,000,000', value: 1000000 },
                ]}
              />

              <div className="flex flex-col gap-4">
                <div>
                  <label className="block t-base font-bold text-[var(--text)] mb-1.5">
                    Who paid this money?
                  </label>
                  <Input
                    value={inPayer}
                    onChange={(e) => setInPayer(e.target.value)}
                    placeholder="Customer or person name"
                    className="!h-[52px] !text-[18px]"
                  />
                </div>
                <div>
                  <label className="block t-base font-bold text-[var(--text)] mb-1.5">
                    What was it for?
                  </label>
                  <Input
                    value={inNote}
                    onChange={(e) => setInNote(e.target.value)}
                    placeholder="e.g. Cash sale"
                    className="!h-[52px] !text-[18px]"
                  />
                </div>
              </div>
            </div>
          </PaperSheet>
        </div>
      )}

      {/* ====================================================================
       * MODE 2: FLOW 5 · COUNT AND CLOSE THE DAY
       * ==================================================================== */}
      {mode === 'close' && cd && cs && (
        <div className="flex flex-col gap-5">
          {cd.status === 'closed' && (
            <StatusNotice
              tone="ok"
              title="Today's cash book is closed and signed"
              action={
                <button
                  type="button"
                  onClick={() =>
                    s.reopenCashDay(cd.id, 'Reopened by cashier to recount')
                  }
                  className="ctl-sm px-4 rounded-[8px] border border-[var(--ok)] bg-[var(--surface)] text-[var(--ok)] font-bold t-sm inline-flex items-center gap-1.5"
                >
                  <RotateCcw className="size-4" /> Reopen to recount
                </button>
              }
            >
              You counted <b>{fmtUGX(cd.countedClosing ?? countedTotal)}</b> against{' '}
              <b>{fmtUGX(expectedClosing)}</b> expected.
            </StatusNotice>
          )}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
            {/* Note-by-note counting table */}
            <PaperSheet
              title="Step 1 · Count each note in the safe"
              subtitle="Tap − or + for each Uganda Shilling note. The screen adds up the total."
              badge={
                <button
                  type="button"
                  onClick={matchExpectedExactly}
                  className="ctl-sm px-3.5 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] t-sm font-semibold"
                >
                  Fill expected notes
                </button>
              }
              pad={false}
            >
              <div className="divide-y divide-[var(--line)]">
                {denominations.map((denom) => {
                  const count = noteCounts[denom] ?? 0;
                  const lineTotal = denom * count;
                  return (
                    <div
                      key={denom}
                      className="px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-[140px]">
                        <div className="t-lg font-bold num">
                          UGX {fmtNum(denom)}
                        </div>
                        <div className="t-sm text-[var(--text-2)]">note</div>
                      </div>

                      {/* Large - / count / + controls */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label={`Remove one ${denom} note`}
                          onClick={() => setNoteCount(denom, count - 1)}
                          className="size-12 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface-2)] hover:bg-[var(--hover)] grid place-items-center text-[var(--text)] font-bold"
                        >
                          <Minus className="size-5" />
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`Number of ${denom} notes`}
                          value={count}
                          onChange={(e) =>
                            setNoteCount(
                              denom,
                              Number(e.target.value.replace(/\D/g, '')) || 0,
                            )
                          }
                          className="w-[84px] h-12 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] text-center t-lg font-bold num"
                        />
                        <button
                          type="button"
                          aria-label={`Add one ${denom} note`}
                          onClick={() => setNoteCount(denom, count + 1)}
                          className="size-12 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface-2)] hover:bg-[var(--hover)] grid place-items-center text-[var(--text)] font-bold"
                        >
                          <Plus className="size-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setNoteCount(denom, count + 5)}
                          className="ctl-sm px-3 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] t-sm font-bold num"
                        >
                          +5
                        </button>
                      </div>

                      <div className="min-w-[140px] text-right num t-lg font-bold">
                        {fmtUGX(lineTotal)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </PaperSheet>

            {/* Step 2: Compare with what should be there & Sign */}
            <div className="lg:sticky lg:top-[84px] flex flex-col gap-4">
              <PaperSheet
                title="Step 2 · Check and sign"
                subtitle="Compare what you counted with what should be in the safe."
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-baseline justify-between py-2 border-b border-[var(--line)]">
                    <span className="t-base text-[var(--text-2)]">
                      {en.cash.opening}
                    </span>
                    <span className="num t-base font-semibold">
                      {fmtUGX(cd.opening)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between py-2 border-b border-[var(--line)]">
                    <span className="t-base text-[var(--text-2)]">
                      + Money in today
                    </span>
                    <span className="num t-base font-semibold text-[var(--ok)]">
                      + {fmtUGX(cs.sales + cs.receipts)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between py-2 border-b border-[var(--line)]">
                    <span className="t-base text-[var(--text-2)]">
                      − Money out today
                    </span>
                    <span className="num t-base font-semibold">
                      − {fmtUGX(cs.expenses + cs.wages)}
                    </span>
                  </div>

                  <div className="rounded-[8px] bg-[var(--surface-2)] border border-[var(--line-2)] p-3.5">
                    <div className="t-sm font-semibold text-[var(--text-2)]">
                      {en.cash.expected}
                    </div>
                    <div className="t-kpi num mt-0.5">
                      {fmtUGX(expectedClosing)}
                    </div>
                  </div>

                  <div className="rounded-[8px] bg-[var(--surface-2)] border border-[var(--line-2)] p-3.5">
                    <div className="t-sm font-semibold text-[var(--text-2)]">
                      {en.cash.counted}
                    </div>
                    <div className="t-kpi num mt-0.5">
                      {fmtUGX(countedTotal)}
                    </div>
                  </div>

                  {/* Comparison status */}
                  <div
                    className={cn(
                      'rounded-[8px] border-2 p-3.5',
                      vCheck.withinTolerance
                        ? 'bg-[var(--ok-bg)] border-[var(--ok)] text-[var(--ok)]'
                        : 'bg-[var(--bad-bg)] border-[var(--bad)] text-[var(--bad)]',
                    )}
                  >
                    <div className="t-base font-bold">
                      {vCheck.variance === 0
                        ? 'Matches to the shilling ✓'
                        : vCheck.withinTolerance
                          ? `Difference: ${vCheck.variance > 0 ? '+' : '−'}${fmtUGX(Math.abs(vCheck.variance))} (within limit)`
                          : `Short/over by ${fmtUGX(Math.abs(vCheck.variance))}`}
                    </div>
                    <div className="t-sm text-[var(--text-2)] mt-0.5">
                      {vCheck.withinTolerance
                        ? 'Ready to sign and close the day.'
                        : `Difference is above the ${fmtUGX(varianceThreshold)} limit. Closing will send an alert to the Site Manager and CEO.`}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={cd.status === 'closed'}
                    onClick={handleSignAndClose}
                    className="mt-2 w-full ctl-lg rounded-[8px] bg-[var(--ok)] hover:opacity-95 disabled:opacity-45 text-white font-bold t-lg inline-flex items-center justify-center gap-2.5 shadow-[var(--shadow-card)]"
                  >
                    <CheckCircle2 className="size-5" />
                    <span>
                      {cd.status === 'closed'
                        ? 'Day closed ✓'
                        : en.cash.signAndClose}
                    </span>
                  </button>
                </div>
              </PaperSheet>
            </div>
          </div>
        </div>
      )}

      {/* Paper Cash-and-Sales Page summary always visible at the bottom */}
      {cd && cs && (
        <PaperSheet
          title="Today's Cash-and-Sales Page"
          subtitle={`Opening ${fmtUGX(cd.opening)} · In +${fmtUGX(cs.sales + cs.receipts)} · Out −${fmtUGX(cs.expenses + cs.wages)} · Expected in safe ${fmtUGX(cs.expectedClosing)}`}
          pad={false}
        >
          {cs.entries.length === 0 ? (
            <div className="p-5 t-base text-[var(--text-2)]">
              No cash lines written down today yet.
            </div>
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {cs.entries.slice(0, 10).map((e) => {
                const isIn = e.direction === 'in';
                const catName =
                  categories.find((c) => c.id === e.category)?.label ??
                  e.category;
                return (
                  <div
                    key={e.id}
                    className="px-5 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isIn ? (
                        <Banknote className="size-4 text-[var(--ok)] shrink-0" />
                      ) : (
                        <Wallet className="size-4 text-[var(--text-3)] shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="t-base font-bold truncate">
                          {e.payee ?? e.note}
                        </div>
                        <div className="t-sm text-[var(--text-2)] truncate">
                          {isIn ? 'Money in' : `Money out · ${catName}`} ·{' '}
                          {fmtTime(e.at)}
                        </div>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'num t-base font-bold whitespace-nowrap',
                        isIn ? 'text-[var(--ok)]' : 'text-[var(--text)]',
                      )}
                    >
                      {isIn ? '+' : '−'} {fmtUGX(e.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </PaperSheet>
      )}
    </div>
  );
}
