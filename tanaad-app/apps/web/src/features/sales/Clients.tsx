import { useMemo, useState } from 'react';
import { Check, HandCoins, Plus, UserPlus, Wallet } from 'lucide-react';
import type { Currency } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useRefList, useSite } from '@/app/hooks';
import { clientBalance } from '@/data/selectors';
import { fmtDayShort, fmtMoney, fmtNum } from '@/data/format';
import { en } from '@/i18n/en';
import {
  ChoiceButton,
  LargeKeypad,
  PaperSheet,
  SavedBanner,
  StatusNotice,
  useSavedBanner,
} from '@/components/simple';
import { ageDays, clientsForSite } from './shared';

export function Clients() {
  const s = useStore();
  const site = useSite();
  const { saved, showSaved, clearSaved } = useSavedBanner();

  const paymentMethods = useRefList('payment_method');
  const markets = useRefList('market');
  const creditTerms = useRefList('credit_term');

  const [mode, setMode] = useState<'balances' | 'pay' | 'new'>('balances');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<string>('');
  const [payRef, setPayRef] = useState('');

  // New customer form state
  const [newName, setNewName] = useState('');
  const [newContact, setNewContact] = useState('');
  const [newWhatsapp, setNewWhatsapp] = useState('');
  const [newChannel, setNewChannel] = useState<'local' | 'export'>('local');
  const [newCountry, setNewCountry] = useState<string>('');
  const [newCurrency, setNewCurrency] = useState<Currency>('UGX');
  const [newLimit, setNewLimit] = useState('25000');
  const [newDays, setNewDays] = useState<number>(30);

  const rows = useMemo(() => {
    return clientsForSite(s, site.id)
      .map((c) => {
        const bal = clientBalance(s, c.id);
        const overdue =
          c.channel === 'export' &&
          bal.openInvoices.length > 0 &&
          bal.ageDays > c.creditDays;
        return { client: c, bal, overdue };
      })
      .sort(
        (a, b) =>
          b.bal.balance - a.bal.balance ||
          a.client.name.localeCompare(b.client.name),
      );
  }, [s, site.id]);

  const owingRows = rows.filter((r) => r.bal.balance > 0);
  const settledRows = rows.filter((r) => r.bal.balance <= 0);

  const activeRow =
    rows.find((r) => r.client.id === selectedClientId) ??
    owingRows[0] ??
    rows[0];

  const openRecordPayment = (clientId: string) => {
    const r = rows.find((x) => x.client.id === clientId);
    if (!r) return;
    setSelectedClientId(clientId);
    const firstInv = r.bal.openInvoices[0];
    setSelectedInvoiceId(firstInv?.id ?? null);
    if (firstInv) {
      const paidSoFar = s.payments
        .filter((p) => p.invoiceId === firstInv.id)
        .reduce((t, p) => t + p.amount, 0);
      setPayAmount(String(Math.max(0, firstInv.total - paidSoFar)));
    } else {
      setPayAmount(r.bal.balance > 0 ? String(r.bal.balance) : '');
    }
    setPayMethod(paymentMethods[0]?.label ?? 'Bank transfer');
    setPayRef(`PAY-${s.today.replace(/-/g, '').slice(2)}`);
    setMode('pay');
  };

  const handleSavePayment = () => {
    if (!activeRow) return;
    const amt = Number(payAmount);
    if (!amt || amt <= 0) return;
    const method = payMethod || paymentMethods[0]?.label || 'Cash';
    s.recordPayment({
      clientId: activeRow.client.id,
      invoiceId: selectedInvoiceId ?? undefined,
      amount: amt,
      currency: activeRow.client.currencyPref,
      method,
      reference: payRef.trim() || `PAY-${s.today}`,
    });
    showSaved(
      `Payment of ${fmtMoney(amt, activeRow.client.currencyPref)} recorded from ${activeRow.client.name}`,
    );
    setMode('balances');
  };

  const handleSaveNewClient = () => {
    if (newName.trim().length < 2) return;
    const country = newCountry || markets[0]?.label || 'Uganda';
    const created = s.saveClient({
      name: newName.trim(),
      contact: newContact.trim() || 'Manager',
      whatsapp: newWhatsapp.trim() || '+256 700 000000',
      country,
      channel: newChannel,
      currencyPref: newCurrency,
      creditLimit: newChannel === 'export' ? Number(newLimit) || 25000 : 0,
      creditDays: newChannel === 'export' ? newDays : 0,
    });
    showSaved(`New customer saved: ${created.name}`);
    setNewName('');
    setNewContact('');
    setNewWhatsapp('');
    setMode('balances');
  };

  return (
    <div className="space-y-5">
      <SavedBanner info={saved} onDismiss={clearSaved} />

      {/* Top mode switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode('balances')}
            className={`min-h-[48px] px-4 rounded-[8px] border font-semibold text-[16px] flex items-center gap-2 transition-colors cursor-pointer ${
              mode === 'balances'
                ? 'bg-[var(--brand)] text-[var(--brand-contrast)] border-[var(--brand)]'
                : 'bg-[var(--surface)] text-[var(--text)] border-[var(--line-2)] hover:bg-[var(--surface-2)]'
            }`}
          >
            <Wallet className="size-5" />
            <span>Who owes us ({owingRows.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setNewCountry(markets[0]?.label ?? 'Uganda');
              const firstTerm = creditTerms.find(
                (t) => typeof t.value === 'number' && t.value > 0,
              );
              if (firstTerm && typeof firstTerm.value === 'number') {
                setNewDays(firstTerm.value);
              }
              setMode('new');
            }}
            className={`min-h-[48px] px-4 rounded-[8px] border font-semibold text-[16px] flex items-center gap-2 transition-colors cursor-pointer ${
              mode === 'new'
                ? 'bg-[var(--brand)] text-[var(--brand-contrast)] border-[var(--brand)]'
                : 'bg-[var(--surface)] text-[var(--text)] border-[var(--line-2)] hover:bg-[var(--surface-2)]'
            }`}
          >
            <UserPlus className="size-5" />
            <span>Add new customer</span>
          </button>
        </div>
      </div>

      {mode === 'pay' && activeRow ? (
        <PaperSheet
          title={`Record payment from ${activeRow.client.name}`}
          subtitle={`Current balance owed: ${fmtMoney(activeRow.bal.balance, activeRow.client.currencyPref)}`}
        >
          <div className="space-y-6">
            {activeRow.bal.openInvoices.length > 0 && (
              <div className="space-y-2">
                <label className="block text-[16px] font-bold text-[var(--text)]">
                  1. Which invoice is this payment for?
                </label>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {activeRow.bal.openInvoices.map((inv) => {
                    const paidOnInv = s.payments
                      .filter((p) => p.invoiceId === inv.id)
                      .reduce((t, p) => t + p.amount, 0);
                    const rem = Math.max(0, inv.total - paidOnInv);
                    const age = ageDays(s.today, inv.issuedAt);
                    return (
                      <ChoiceButton
                        key={inv.id}
                        selected={selectedInvoiceId === inv.id}
                        onClick={() => {
                          setSelectedInvoiceId(inv.id);
                          setPayAmount(String(rem));
                        }}
                        title={`${inv.number} · ${fmtMoney(rem, inv.currency)}`}
                        subtitle={`Issued ${fmtDayShort(inv.issuedAt.slice(0, 10))} (${age} days old)`}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-[16px] font-bold text-[var(--text)]">
                2. How did they pay?
              </label>
              <div className="grid gap-2.5 sm:grid-cols-3">
                {paymentMethods.map((pm) => (
                  <ChoiceButton
                    key={pm.id}
                    selected={payMethod === pm.label}
                    onClick={() => setPayMethod(pm.label)}
                    title={pm.label}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 items-start">
              <div className="space-y-4">
                <div>
                  <label className="block text-[16px] font-bold text-[var(--text)] mb-1.5">
                    3. Amount received ({activeRow.client.currencyPref})
                  </label>
                  <div className="p-4 rounded-[8px] border-2 border-[var(--brand)] bg-[var(--surface-2)] text-[26px] font-bold num">
                    {payAmount
                      ? fmtMoney(
                          Number(payAmount),
                          activeRow.client.currencyPref,
                        )
                      : '0'}
                  </div>
                </div>

                <div>
                  <label className="block text-[16px] font-bold text-[var(--text)] mb-1.5">
                    Bank or receipt reference
                  </label>
                  <input
                    type="text"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="e.g. EFT-88210"
                    className="w-full min-h-[52px] px-4 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] text-[17px]"
                  />
                </div>
              </div>

              <LargeKeypad
                value={payAmount}
                onChange={setPayAmount}
                unit={activeRow.client.currencyPref}
                allowDecimal={activeRow.client.currencyPref === 'USD'}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[var(--line)]">
              <button
                type="button"
                onClick={() => setMode('balances')}
                className="min-h-[52px] px-5 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] font-semibold text-[16px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!(Number(payAmount) > 0)}
                onClick={handleSavePayment}
                className="min-h-[56px] px-7 rounded-[8px] bg-[var(--ok)] text-white font-bold text-[18px] flex items-center gap-2.5 disabled:opacity-40 cursor-pointer"
              >
                <Check className="size-6" />
                <span>{en.sales.recordPayment}</span>
              </button>
            </div>
          </div>
        </PaperSheet>
      ) : mode === 'new' ? (
        <PaperSheet
          title="Add a new customer"
          subtitle="Local customers pay cash before the lorry loads. Export customers buy on credit approved by the CEO."
        >
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-[16px] font-bold text-[var(--text)] mb-1.5">
                  Customer or business name *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Mukwano Traders Ltd"
                  className="w-full min-h-[52px] px-4 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] text-[17px]"
                />
              </div>
              <div>
                <label className="block text-[16px] font-bold text-[var(--text)] mb-1.5">
                  Contact person
                </label>
                <input
                  type="text"
                  value={newContact}
                  onChange={(e) => setNewContact(e.target.value)}
                  placeholder="Who receives WhatsApp messages"
                  className="w-full min-h-[52px] px-4 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] text-[17px]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[16px] font-bold text-[var(--text)] mb-1.5">
                WhatsApp phone number *
              </label>
              <input
                type="tel"
                value={newWhatsapp}
                onChange={(e) => setNewWhatsapp(e.target.value)}
                placeholder="+256 772 000000"
                className="w-full min-h-[52px] px-4 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] text-[17px] num"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[16px] font-bold text-[var(--text)]">
                How does this customer buy?
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <ChoiceButton
                  selected={newChannel === 'local'}
                  onClick={() => {
                    setNewChannel('local');
                    setNewCurrency('UGX');
                  }}
                  title="Local · Cash before loading"
                  subtitle="Cashier must confirm cash before the storekeeper loads the lorry"
                />
                <ChoiceButton
                  selected={newChannel === 'export'}
                  onClick={() => {
                    setNewChannel('export');
                    setNewCurrency('USD');
                  }}
                  title="Export · Buys on credit"
                  subtitle="Credit limit and days approved by the CEO"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[16px] font-bold text-[var(--text)]">
                Country / Market
              </label>
              <div className="grid gap-2.5 sm:grid-cols-3">
                {markets.map((m) => (
                  <ChoiceButton
                    key={m.id}
                    selected={(newCountry || markets[0]?.label) === m.label}
                    onClick={() => setNewCountry(m.label)}
                    title={m.label}
                  />
                ))}
              </div>
            </div>

            {newChannel === 'export' && (
              <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-[var(--line)]">
                <div>
                  <label className="block text-[16px] font-bold text-[var(--text)] mb-1.5">
                    Credit limit ({newCurrency})
                  </label>
                  <input
                    type="number"
                    value={newLimit}
                    onChange={(e) => setNewLimit(e.target.value)}
                    className="w-full min-h-[52px] px-4 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] text-[18px] font-bold num"
                  />
                </div>
                <div>
                  <label className="block text-[16px] font-bold text-[var(--text)] mb-1.5">
                    Credit days allowed
                  </label>
                  <div className="grid gap-2 grid-cols-2">
                    {creditTerms
                      .filter((t) => typeof t.value === 'number' && t.value > 0)
                      .map((t) => (
                        <ChoiceButton
                          key={t.id}
                          selected={newDays === Number(t.value)}
                          onClick={() => setNewDays(Number(t.value))}
                          title={t.label}
                        />
                      ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[var(--line)]">
              <button
                type="button"
                onClick={() => setMode('balances')}
                className="min-h-[52px] px-5 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] font-semibold text-[16px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={newName.trim().length < 2}
                onClick={handleSaveNewClient}
                className="min-h-[56px] px-7 rounded-[8px] bg-[var(--ok)] text-white font-bold text-[18px] flex items-center gap-2.5 disabled:opacity-40 cursor-pointer"
              >
                <Plus className="size-6" />
                <span>Save new customer</span>
              </button>
            </div>
          </div>
        </PaperSheet>
      ) : (
        <PaperSheet
          title={en.sales.whoOwesUsTitle}
          subtitle={en.sales.whoOwesUsSubtitle}
          badge={
            <span className="text-[15px] font-semibold text-[var(--text-2)]">
              {owingRows.length} customer{owingRows.length === 1 ? '' : 's'} with open balance
            </span>
          }
        >
          <div className="space-y-6">
            {owingRows.length === 0 ? (
              <StatusNotice tone="ok" title="Every customer is settled">
                No customer has an unpaid invoice at this factory right now.
              </StatusNotice>
            ) : (
              <div className="space-y-3">
                <div className="text-[15px] font-bold uppercase tracking-wider text-[var(--text-2)]">
                  Customers who owe us money ({owingRows.length})
                </div>
                <div className="divide-y divide-[var(--line)] border border-[var(--line-2)] rounded-[10px] bg-[var(--surface)] overflow-hidden">
                  {owingRows.map((r) => {
                    const c = r.client;
                    const overLimit =
                      c.creditLimit > 0 && r.bal.balance > c.creditLimit;
                    return (
                      <div
                        key={c.id}
                        className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-[var(--surface-2)]"
                      >
                        <div className="min-w-[220px] flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[18px] font-bold text-[var(--text)]">
                              {c.name}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-[6px] text-[13px] font-semibold bg-[var(--surface-3)] text-[var(--text-2)]">
                              {c.country} ·{' '}
                              {c.channel === 'export'
                                ? `${c.creditDays} days credit`
                                : 'Cash before loading'}
                            </span>
                            {r.overdue && (
                              <span className="px-2.5 py-0.5 rounded-[6px] text-[13px] font-bold bg-[var(--bad-bg)] text-[var(--bad)] border border-[var(--bad)]">
                                Late · {r.bal.ageDays} days old
                              </span>
                            )}
                            {overLimit && (
                              <span className="px-2.5 py-0.5 rounded-[6px] text-[13px] font-bold bg-[var(--warn-bg)] text-[var(--warn)] border border-[var(--warn)]">
                                Above credit limit
                              </span>
                            )}
                          </div>
                          <div className="text-[15px] text-[var(--text-2)] mt-1">
                            Contact: {c.contact} ({c.whatsapp}) ·{' '}
                            {r.bal.openInvoices.length} open invoice
                            {r.bal.openInvoices.length === 1 ? '' : 's'}
                            {c.creditLimit > 0
                              ? ` · Credit limit ${fmtMoney(
                                  c.creditLimit,
                                  c.currencyPref,
                                )}`
                              : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-[13px] text-[var(--text-3)] uppercase font-semibold">
                              Owes us
                            </div>
                            <div
                              className={`text-[22px] font-bold num ${
                                r.overdue
                                  ? 'text-[var(--bad)]'
                                  : 'text-[var(--text)]'
                              }`}
                            >
                              {fmtMoney(r.bal.balance, c.currencyPref)}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => openRecordPayment(c.id)}
                            className="min-h-[48px] px-4 rounded-[8px] bg-[var(--brand)] text-[var(--brand-contrast)] font-semibold text-[16px] flex items-center gap-2 cursor-pointer"
                          >
                            <HandCoins className="size-5" />
                            <span>Record payment</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Settled customers */}
            {settledRows.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="text-[15px] font-bold uppercase tracking-wider text-[var(--text-3)]">
                  Settled customers ({fmtNum(settledRows.length)} with 0 balance)
                </div>
                <div className="divide-y divide-[var(--line)] border border-[var(--line)] rounded-[10px] bg-[var(--surface-2)]">
                  {settledRows.map((r) => (
                    <div
                      key={r.client.id}
                      className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <span className="text-[16px] font-semibold text-[var(--text)]">
                          {r.client.name}
                        </span>
                        <span className="text-[14px] text-[var(--text-2)] ml-2">
                          {r.client.country} ·{' '}
                          {r.client.channel === 'export'
                            ? `${r.client.creditDays} days credit`
                            : 'Cash buyer'}
                        </span>
                      </div>
                      <span className="text-[15px] font-semibold text-[var(--ok)]">
                        ✓ Settled ({fmtMoney(0, r.client.currencyPref)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </PaperSheet>
      )}
    </div>
  );
}
