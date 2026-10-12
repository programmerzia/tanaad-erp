import { useMemo, useState } from 'react';
import {
  Check,
  FileText,
  Lock,
  Minus,
  Plus,
  ShoppingCart,
} from 'lucide-react';
import { expectedCargoKg } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useGo, useQueryParam, useSite } from '@/app/hooks';
import { clientBalance, orderTotal } from '@/data/selectors';
import { fmtDayShort, fmtKg, fmtMoney, fmtNum } from '@/data/format';
import { Avatar, cn } from '@/components/ui';
import {
  ChoiceButton,
  PaperSheet,
  SavedBanner,
  StatusNotice,
  StepWizard,
  useSavedBanner,
} from '@/components/simple';
import { en } from '@/i18n/en';
import { clientsForSite, dispatchOf, invoiceOf, priceFor } from './shared';

/**
 * Sales · New order:
 * - 3-step wizard: 1. Pick customer, 2. Pick products & bundles, 3. Check & save order
 * - Paper Customer Orders list below with 1-sentence lock explanations and 1-tap Issue Invoice
 */
export function Orders() {
  const s = useStore();
  const site = useSite();
  const go = useGo();
  const clientParam = useQueryParam('client');
  const { saved, showSaved, clearSaved } = useSavedBanner();

  const clients = useMemo(() => clientsForSite(s, site.id), [s, site.id]);
  const products = useMemo(
    () => s.products.filter((p) => p.siteId === site.id && p.prices.length > 0),
    [s.products, site.id],
  );

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [clientId, setClientId] = useState<string | null>(
    clientParam && clients.some((c) => c.id === clientParam)
      ? clientParam
      : (clients[0]?.id ?? null),
  );
  // Map of productId -> bundle count
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const first = products[0];
    return first ? { [first.id]: 20 } : {};
  });

  const chosenClient = clients.find((c) => c.id === clientId);
  const currency = chosenClient?.currencyPref ?? site.currencyPrimary;

  const lineItems = useMemo(() => {
    return products
      .map((p) => {
        const bundles = quantities[p.id] ?? 0;
        const lp = priceFor(
          p,
          chosenClient ?? {
            channel: 'local',
            currencyPref: site.currencyPrimary,
          },
          s.fx,
        );
        return {
          product: p,
          bundles,
          unitPrice: lp.perBundle,
          amount: bundles * lp.perBundle,
        };
      })
      .filter((x) => x.bundles > 0);
  }, [products, quantities, chosenClient, site.currencyPrimary, s.fx]);

  const totalBundles = lineItems.reduce((sum, l) => sum + l.bundles, 0);
  const totalAmount = lineItems.reduce((sum, l) => sum + l.amount, 0);
  const cargoKg = expectedCargoKg(
    lineItems.map((l) => ({
      bundles: l.bundles,
      stdBundleWeightKg: l.product.stdBundleWeightKg,
    })),
  );
  const hasUnconfirmedWeight = lineItems.some(
    (l) => l.product.weightStatus === 'to_be_measured',
  );

  const setProductBundles = (pid: string, nextBundles: number) => {
    setQuantities((prev) => ({
      ...prev,
      [pid]: Math.max(0, Math.min(9999, nextBundles)),
    }));
  };

  const handleCreateOrder = () => {
    if (!chosenClient || lineItems.length === 0) return;
    const status =
      chosenClient.channel === 'local' ? 'awaiting_cash' : 'awaiting_approval';
    const created = s.createOrder({
      siteId: site.id,
      clientId: chosenClient.id,
      status,
      currency,
      lines: lineItems.map((l) => ({
        productId: l.product.id,
        bundles: l.bundles,
        unitPrice: l.unitPrice,
      })),
    });

    showSaved(`Order ${created.number} saved for ${chosenClient.name}`, {
      detail:
        chosenClient.channel === 'local'
          ? `Total ${fmtMoney(totalAmount, currency)}. Waiting for Cashier to confirm cash before loading.`
          : `Total ${fmtMoney(totalAmount, currency)}. Sent to CEO to approve credit before loading.`,
    });

    setStep(1);
  };

  const handleIssueInvoice = (orderId: string) => {
    const inv = s.issueInvoice(orderId);
    if (inv) {
      showSaved(`Invoice ${inv.number} created`, {
        detail: 'Opening Send an invoice so you can share it on WhatsApp.',
      });
      go.site('sales/invoices');
    }
  };

  const siteOrders = useMemo(
    () =>
      s.orders
        .filter((o) => o.siteId === site.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [s.orders, site.id],
  );

  // Plain 1-sentence explanation of each order's state (Principle 9)
  const explainOrderStatus = (status: string) => {
    switch (status) {
      case 'awaiting_cash':
        return {
          badge: 'Locked · Waiting for cash',
          tone: 'warn' as const,
          sentence:
            'Locked at the store until the Cashier confirms cash on Money in.',
        };
      case 'awaiting_approval':
        return {
          badge: 'Locked · Waiting for CEO',
          tone: 'warn' as const,
          sentence:
            'Locked at the store until a CEO approves this export credit order.',
        };
      case 'approved':
      case 'picking':
        return {
          badge: 'Ready at store',
          tone: 'ok' as const,
          sentence: 'Unlocked. The Storekeeper can load this order onto a lorry.',
        };
      case 'dispatched':
      case 'delivered':
        return {
          badge: 'Passed gate · Ready to invoice',
          tone: 'ok' as const,
          sentence: 'Lorry passed the gate scale. Ready to send an invoice.',
        };
      case 'invoiced':
        return {
          badge: 'Invoiced · Waiting for payment',
          tone: 'warn' as const,
          sentence: 'Invoice sent. Waiting for customer payment.',
        };
      case 'paid':
        return {
          badge: 'Paid ✓',
          tone: 'ok' as const,
          sentence: 'Completed and paid in full.',
        };
      default:
        return {
          badge: status,
          tone: 'warn' as const,
          sentence: 'Order is on hold.',
        };
    }
  };

  return (
    <div className="flex flex-col gap-5 max-w-[860px] mx-auto">
      <SavedBanner info={saved} onDismiss={clearSaved} />

      <div className="paper-sheet p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="t-sm font-semibold text-[var(--text-2)]">
            {site.name} · Sales
          </div>
          <h1 className="t-title text-[var(--text)] mt-0.5">
            {en.sales.newOrderTitle}
          </h1>
          <p className="t-base text-[var(--text-2)] mt-0.5">
            {en.sales.newOrderSubtitle}
          </p>
        </div>
        <span className="px-3.5 py-1.5 rounded-[8px] bg-[var(--surface-2)] border border-[var(--line-2)] t-sm font-bold num">
          {siteOrders.length} orders on book
        </span>
      </div>

      {/* ====================================================================
       * STEP 1 OF 3: PICK CUSTOMER
       * ==================================================================== */}
      {step === 1 && (
        <StepWizard
          step={1}
          totalSteps={3}
          title="Who is buying?"
          subtitle="Tap the customer below."
          canNext={Boolean(chosenClient)}
          nextHint="Pick a customer first."
          onNext={() => setStep(2)}
        >
          <div className="grid gap-2.5 sm:grid-cols-2">
            {clients.map((c) => {
              const bal = clientBalance(s, c.id);
              return (
                <ChoiceButton
                  key={c.id}
                  selected={clientId === c.id}
                  avatarName={c.name}
                  title={c.name}
                  subtitle={`${c.country} · ${c.channel === 'export' ? `Credit (${c.creditDays} days)` : 'Cash before delivery'}`}
                  badge={
                    bal.balance > 0 ? (
                      <span className="px-2 py-0.5 rounded-[5px] bg-[var(--warn-bg)] text-[var(--warn)] t-xs font-bold num">
                        Owes {fmtMoney(bal.balance, c.currencyPref)}
                      </span>
                    ) : undefined
                  }
                  onClick={() => setClientId(c.id)}
                />
              );
            })}
          </div>
        </StepWizard>
      )}

      {/* ====================================================================
       * STEP 2 OF 3: PICK PRODUCTS & BUNDLE COUNTS
       * ==================================================================== */}
      {step === 2 && chosenClient && (
        <StepWizard
          step={2}
          totalSteps={3}
          title="What products and how many bundles?"
          subtitle="Use − and + or quick buttons to set the bundles for each product."
          summaryStrip={
            <span>
              Customer: <b>{chosenClient.name}</b> ({chosenClient.country}) ·
              Currency: <b>{currency}</b>
            </span>
          }
          canNext={totalBundles > 0}
          nextHint="Add at least 1 bundle to the order."
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        >
          <div className="flex flex-col gap-3">
            {products.map((p) => {
              const count = quantities[p.id] ?? 0;
              const lp = priceFor(p, chosenClient, s.fx);
              return (
                <div
                  key={p.id}
                  className={cn(
                    'rounded-[10px] border p-4 flex flex-wrap items-center justify-between gap-4',
                    count > 0
                      ? 'bg-[var(--ok-bg)]/35 border-[var(--ok)]'
                      : 'bg-[var(--surface)] border-[var(--line-2)]',
                  )}
                >
                  <div className="flex items-center gap-3 min-w-[200px] flex-1">
                    <span
                      className="size-6 rounded-[6px] border border-black/15 shrink-0"
                      style={{ background: p.colour ?? '#888' }}
                    />
                    <div>
                      <div className="t-lg font-bold text-[var(--text)]">
                        {p.internalName}
                      </div>
                      <div className="t-sm text-[var(--text-2)] num">
                        {fmtMoney(lp.perBundle, currency)} per bundle ({p.bundlePieces} pcs)
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setProductBundles(p.id, count - 5)}
                      className="size-11 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface-2)] hover:bg-[var(--hover)] grid place-items-center font-bold"
                    >
                      <Minus className="size-5" />
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label={`Bundles of ${p.internalName}`}
                      value={count}
                      onChange={(e) =>
                        setProductBundles(
                          p.id,
                          Number(e.target.value.replace(/\D/g, '')) || 0,
                        )
                      }
                      className="w-[76px] h-11 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] text-center t-lg font-bold num"
                    />
                    <button
                      type="button"
                      onClick={() => setProductBundles(p.id, count + 5)}
                      className="size-11 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface-2)] hover:bg-[var(--hover)] grid place-items-center font-bold"
                    >
                      <Plus className="size-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductBundles(p.id, count + 20)}
                      className="ctl-sm px-3 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] font-bold t-sm num"
                    >
                      +20
                    </button>
                  </div>

                  <div className="min-w-[130px] text-right num t-lg font-bold">
                    {fmtMoney(count * lp.perBundle, currency)}
                  </div>
                </div>
              );
            })}
          </div>
        </StepWizard>
      )}

      {/* ====================================================================
       * STEP 3 OF 3: CHECK ORDER & SAVE
       * ==================================================================== */}
      {step === 3 && chosenClient && (
        <StepWizard
          step={3}
          totalSteps={3}
          title="Check the order and save"
          subtitle="Confirm the items and total below."
          summaryStrip={
            <span>
              Customer: <b>{chosenClient.name}</b> · Total bundles:{' '}
              <b className="num">{fmtNum(totalBundles)}</b>
            </span>
          }
          canNext={lineItems.length > 0}
          nextLabel={en.sales.saveOrder}
          isFinalStep
          finalTone="ok"
          onBack={() => setStep(2)}
          onNext={handleCreateOrder}
        >
          <div className="flex flex-col gap-4">
            <div className="rounded-[10px] border border-[var(--line-2)] bg-[var(--surface-2)] p-4 divide-y divide-[var(--line)]">
              {lineItems.map((l) => (
                <div
                  key={l.product.id}
                  className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="t-base font-bold">{l.product.internalName}</div>
                    <div className="t-sm text-[var(--text-2)] num">
                      {l.bundles} bundles × {fmtMoney(l.unitPrice, currency)}
                    </div>
                  </div>
                  <span className="num t-lg font-bold">
                    {fmtMoney(l.amount, currency)}
                  </span>
                </div>
              ))}
              <div className="pt-3 flex items-baseline justify-between gap-3">
                <span className="t-base font-bold text-[var(--text-2)]">
                  Expected cargo weight:{' '}
                  <b className="num text-[var(--text)]">
                    {fmtKg(Math.round(cargoKg))}
                  </b>
                  {hasUnconfirmedWeight ? ' (bundle weights to be confirmed)' : ''}
                </span>
                <span className="text-[28px] font-bold num text-[var(--ok)]">
                  {fmtMoney(totalAmount, currency)}
                </span>
              </div>
            </div>

            <StatusNotice
              tone="warn"
              title={
                chosenClient.channel === 'local'
                  ? 'What happens next: Cashier confirms cash'
                  : 'What happens next: CEO approves credit'
              }
            >
              {chosenClient.channel === 'local'
                ? 'Because this is a local buyer, the store stays locked until the Cashier confirms the cash.'
                : 'Because this is an export credit buyer, the store stays locked until a CEO approves the order.'}
            </StatusNotice>
          </div>
        </StepWizard>
      )}

      {/* Paper Customer Orders Book */}
      <PaperSheet
        title="Customer Orders Book"
        subtitle="Shows every order and who can unlock or invoice it."
        pad={false}
      >
        <div className="divide-y divide-[var(--line)]">
          {siteOrders.slice(0, 10).map((ord) => {
            const c = s.clients.find((x) => x.id === ord.clientId);
            const total = orderTotal(ord);
            const inv = invoiceOf(s, ord.id);
            const dsp = dispatchOf(s, ord.id);
            const info = explainOrderStatus(ord.status);
            const canIssueInvoice =
              !inv &&
              (ord.status === 'dispatched' || ord.status === 'delivered');

            return (
              <div
                key={ord.id}
                className="px-5 py-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 min-w-[240px] flex-1">
                  <Avatar name={c?.name ?? '?'} size={38} />
                  <div>
                    <div className="t-base font-bold text-[var(--text)] flex flex-wrap items-center gap-2">
                      <span>{c?.name}</span>
                      <span className="code t-sm text-[var(--text-2)]">
                        {ord.number}
                      </span>
                      <span
                        className={cn(
                          'px-2.5 py-0.5 rounded-[5px] t-xs font-bold inline-flex items-center gap-1',
                          info.tone === 'ok'
                            ? 'bg-[var(--ok-bg)] text-[var(--ok)]'
                            : 'bg-[var(--warn-bg)] text-[var(--warn)]',
                        )}
                      >
                        {(ord.status === 'awaiting_cash' ||
                          ord.status === 'awaiting_approval') && (
                          <Lock className="size-3" />
                        )}
                        {info.badge}
                      </span>
                    </div>
                    <div className="t-sm text-[var(--text-2)] mt-0.5">
                      {info.sentence}
                    </div>
                    <div className="t-xs text-[var(--text-3)] num mt-0.5">
                      {fmtDayShort(ord.createdAt.slice(0, 10))}
                      {dsp ? ` · Delivery note ${dsp.deliveryNoteNo}` : ''}
                      {inv ? ` · Invoice ${inv.number}` : ''}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="num t-lg font-bold">
                    {fmtMoney(total, ord.currency)}
                  </span>
                  {canIssueInvoice && (
                    <button
                      type="button"
                      onClick={() => handleIssueInvoice(ord.id)}
                      className="ctl-sm px-4 rounded-[8px] bg-[var(--brand)] text-white font-bold t-sm inline-flex items-center gap-1.5"
                    >
                      <FileText className="size-4" /> Create invoice
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </PaperSheet>
    </div>
  );
}
