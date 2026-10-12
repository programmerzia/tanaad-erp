import { useState } from 'react';
import {
  Check,
  Landmark,
  Pause,
  ShieldCheck,
} from 'lucide-react';
import { SITES } from '@/config/sites';
import { useStore } from '@/data/store';
import { clientBalance, openExceptions, orderTotal } from '@/data/selectors';
import { fmtMoney, fmtNum, fmtTime } from '@/data/format';
import {
  PaperSheet,
  SavedBanner,
  StatusNotice,
  useSavedBanner,
} from '@/components/simple';

export function Approvals() {
  const s = useStore();
  const { saved, showSaved, clearSaved } = useSavedBanner();
  const [noteByItem, setNoteByItem] = useState<Record<string, string>>({});

  const awaitingOrders = s.orders.filter(
    (o) => o.status === 'awaiting_approval',
  );
  const openEx = openExceptions(s);
  const decidedToday = s.exceptions
    .filter((e) => e.status !== 'open' && e.decidedAt?.startsWith(s.today))
    .sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''));

  const handleOrderDecision = (
    orderId: string,
    orderNo: string,
    decision: 'approved' | 'held',
  ) => {
    const note =
      noteByItem[orderId]?.trim() ||
      (decision === 'approved'
        ? 'Credit approved by CEO'
        : 'Held by CEO pending payment');
    s.decideOrder(orderId, decision, note);
    showSaved(
      decision === 'approved'
        ? `Order ${orderNo} approved. Storekeeper can now load the lorry.`
        : `Order ${orderNo} placed on hold.`,
    );
  };

  const handleExceptionDecision = (
    exId: string,
    title: string,
    decision: 'approved' | 'held' | 'resolved',
  ) => {
    const note =
      noteByItem[exId]?.trim() ||
      (decision === 'held' ? 'Held by CEO' : 'Resolved by CEO');
    s.decideException(exId, decision, note);
    showSaved(`${decision === 'held' ? 'Held' : 'Resolved'}: ${title}`);
  };

  return (
    <div className="space-y-6">
      <SavedBanner info={saved} onDismiss={clearSaved} />

      {/* 1. Export credit orders waiting for CEO approval */}
      <PaperSheet
        title="1. Customer credit orders waiting for your approval"
        subtitle="Export orders that exceed the customer's credit limit or have an overdue invoice are locked until you approve them."
        badge={
          <span className="text-[15px] font-bold text-[var(--text-2)]">
            {awaitingOrders.length} waiting
          </span>
        }
      >
        {awaitingOrders.length === 0 ? (
          <StatusNotice tone="ok" title="No customer credit orders waiting">
            All current customer orders are within credit limits or already approved.
          </StatusNotice>
        ) : (
          <div className="space-y-4">
            {awaitingOrders.map((o) => {
              const client = s.clients.find((c) => c.id === o.clientId);
              const bal = client ? clientBalance(s, client.id) : undefined;
              const total = orderTotal(o);
              const afterOrder = (bal?.balance ?? 0) + total;
              const limit = client?.creditLimit ?? 0;

              return (
                <div
                  key={o.id}
                  className="p-5 rounded-[10px] border-2 border-[var(--warn)] bg-[var(--warn-bg)] space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Landmark className="size-5 text-[var(--warn)]" />
                        <span className="text-[19px] font-bold text-[var(--text)]">
                          {client?.name ?? 'Customer'} ({client?.country}) · Order{' '}
                          {o.number}
                        </span>
                      </div>
                      <div className="text-[15px] text-[var(--text-2)] mt-1">
                        Factory: <strong>{SITES[o.siteId].name}</strong> ·{' '}
                        {o.lines
                          .map(
                            (l) =>
                              `${fmtNum(l.bundles)} bundles ${
                                s.products.find((p) => p.id === l.productId)
                                  ?.internalName ?? ''
                              }`,
                          )
                          .join(', ')}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[13px] font-bold uppercase text-[var(--text-2)]">
                        This order
                      </div>
                      <div className="text-[24px] font-bold num text-[var(--text)]">
                        {fmtMoney(total, o.currency)}
                      </div>
                    </div>
                  </div>

                  {client && bal && (
                    <div className="p-3.5 rounded-[8px] bg-[var(--surface)] border border-[var(--line)] grid gap-3 sm:grid-cols-3 text-[15px]">
                      <div>
                        <span className="text-[var(--text-3)] block text-[13px]">
                          Current balance owed
                        </span>
                        <strong className="num text-[17px]">
                          {fmtMoney(bal.balance, client.currencyPref)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[var(--text-3)] block text-[13px]">
                          Credit limit ({client.creditDays} days)
                        </span>
                        <strong className="num text-[17px]">
                          {fmtMoney(limit, client.currencyPref)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[var(--text-3)] block text-[13px]">
                          Balance after this order
                        </span>
                        <strong className="num text-[17px] text-[var(--bad)]">
                          {fmtMoney(afterOrder, client.currencyPref)}
                        </strong>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <input
                      type="text"
                      value={noteByItem[o.id] ?? ''}
                      onChange={(e) =>
                        setNoteByItem((prev) => ({
                          ...prev,
                          [o.id]: e.target.value,
                        }))
                      }
                      placeholder="Optional note for the sales desk…"
                      className="flex-1 min-w-[220px] min-h-[48px] px-4 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] text-[16px]"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleOrderDecision(o.id, o.number, 'held')}
                        className="min-h-[52px] px-5 rounded-[8px] border-2 border-[var(--line-2)] bg-[var(--surface)] text-[var(--text)] font-bold text-[16px] flex items-center gap-2 cursor-pointer"
                      >
                        <Pause className="size-5" />
                        <span>Hold order</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleOrderDecision(o.id, o.number, 'approved')
                        }
                        className="min-h-[52px] px-6 rounded-[8px] bg-[var(--ok)] text-white font-bold text-[16px] flex items-center gap-2 cursor-pointer"
                      >
                        <Check className="size-5" />
                        <span>Approve credit order</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PaperSheet>

      {/* 2. Factory exceptions waiting for CEO decision */}
      <PaperSheet
        title="2. Factory problems waiting for your decision"
        subtitle="Gate holds, cash differences, material gaps, and floor alerts across all three factories."
        badge={
          <span className="text-[15px] font-bold text-[var(--text-2)]">
            {openEx.length} open
          </span>
        }
      >
        {openEx.length === 0 ? (
          <StatusNotice tone="ok" title="All factory problems are resolved">
            Nothing is waiting for your decision across the three sites.
          </StatusNotice>
        ) : (
          <div className="divide-y divide-[var(--line)] border border-[var(--line-2)] rounded-[10px] bg-[var(--surface)] overflow-hidden">
            {openEx.map((ex) => {
              const isCrit = ex.severity === 'critical';
              return (
                <div
                  key={ex.id}
                  className="p-4 flex flex-col gap-3 hover:bg-[var(--surface-2)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-[240px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-[6px] text-[13px] font-bold ${
                            isCrit
                              ? 'bg-[var(--bad-bg)] text-[var(--bad)] border border-[var(--bad)]'
                              : 'bg-[var(--warn-bg)] text-[var(--warn)] border border-[var(--warn)]'
                          }`}
                        >
                          {SITES[ex.siteId].shortName} ·{' '}
                          {isCrit ? 'Urgent' : 'Needs attention'}
                        </span>
                        <span className="text-[18px] font-bold text-[var(--text)]">
                          {ex.title}
                        </span>
                      </div>
                      <p className="text-[16px] text-[var(--text-2)] mt-1">
                        {ex.detail}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          handleExceptionDecision(ex.id, ex.title, 'held')
                        }
                        className="min-h-[48px] px-4 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] text-[var(--text)] font-semibold text-[15px] flex items-center gap-1.5 cursor-pointer"
                      >
                        <Pause className="size-4" />
                        <span>Hold</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleExceptionDecision(ex.id, ex.title, 'approved')
                        }
                        className="min-h-[48px] px-5 rounded-[8px] bg-[var(--ok)] text-white font-bold text-[15px] flex items-center gap-2 cursor-pointer"
                      >
                        <Check className="size-5" />
                        <span>Approve & resolve</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PaperSheet>

      {/* 3. Decisions made today */}
      {decidedToday.length > 0 && (
        <PaperSheet
          title={`Decisions recorded today (${decidedToday.length})`}
          subtitle="Every decision is saved permanently in the group record."
        >
          <div className="divide-y divide-[var(--line)] border border-[var(--line)] rounded-[8px] bg-[var(--surface-2)]">
            {decidedToday.map((d) => (
              <div
                key={d.id}
                className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-[15px]"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-5 text-[var(--ok)] shrink-0" />
                  <span className="font-semibold text-[var(--text)]">
                    {SITES[d.siteId].shortName}: {d.title}
                  </span>
                </div>
                <span className="text-[var(--text-2)]">
                  {d.status === 'held' ? 'Held' : 'Approved'} at{' '}
                  {d.decidedAt ? fmtTime(d.decidedAt) : 'today'}
                </span>
              </div>
            ))}
          </div>
        </PaperSheet>
      )}
    </div>
  );
}
