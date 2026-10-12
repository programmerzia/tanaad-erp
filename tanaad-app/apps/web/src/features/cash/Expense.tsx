import { useState } from 'react';
import { Banknote, Camera, Check, Sparkles, Wallet } from 'lucide-react';
import type { ExpenseCategory } from '@tanaad/domain';
import { settlementNet } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useGo, useRefList, useSite, useSiteSettings } from '@/app/hooks';
import { attendanceFor, cashDayFor, cashSummary, currentShiftKind, rosterFor, shiftId } from '@/data/selectors';
import { fmtUGX } from '@/data/format';
import { Avatar, Input, cn } from '@/components/ui';
import {
  ChoiceButton,
  LargeKeypad,
  PaperSheet,
  SavedBanner,
  StatusNotice,
  StepWizard,
  useSavedBanner,
} from '@/components/simple';
import { en } from '@/i18n/en';

/**
 * Flow 4 · Money out:
 * "amount, what it was for (a category is required), who was paid, done."
 * All categories and quick expenses come from master data (useRefList('expense_category'), useRefList('quick_expense')).
 */
export function Expense() {
  const s = useStore();
  const site = useSite();
  const go = useGo();
  const settings = useSiteSettings();
  const { saved, showSaved, clearSaved } = useSavedBanner();

  const categories = useRefList('expense_category');
  const subcategories = useRefList('expense_subcategory');
  const quickExpenses = useRefList('quick_expense');

  const cd = cashDayFor(s, site.id, s.today);
  const cs = cd ? cashSummary(s, cd.id) : undefined;
  const approvalLimit = settings?.expenseApprovalLimit ?? 250000;

  const [tab, setTab] = useState<'expense' | 'wages'>('expense');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [amountStr, setAmountStr] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string | null>(
    categories[0]?.id ?? null,
  );
  const [subcategoryLabel, setSubcategoryLabel] = useState<string>('');
  const [payee, setPayee] = useState<string>('');
  const [hasReceipt, setHasReceipt] = useState<boolean>(false);

  const amount = Number(amountStr) || 0;
  const chosenCat = categories.find((c) => c.id === categoryId);
  const subForCat = subcategories.filter((sc) => sc.parentId === categoryId);

  // Recent payees from today's cash entries so user can pick instead of typing
  const recentPayees = [
    ...new Set(
      (cs?.entries ?? [])
        .map((e) => e.payee)
        .filter((p): p is string => Boolean(p)),
    ),
  ].slice(0, 6);

  // Casual workers due wages today
  const shId = shiftId(site.id, s.today, currentShiftKind());
  const attToday = attendanceFor(s, shId);
  const casualDue = rosterFor(s, site.id)
    .filter((r) => r.engagement?.type === 'casual')
    .map((r) => {
      const a = attToday.find((x) => x.personId === r.person.id);
      const daysPresent = a?.status === 'present' ? 1 : a?.status === 'half' ? 0.5 : 0;
      const calc = settlementNet({
        rateBasis: r.engagement!.rateBasis,
        rate: r.engagement!.rate,
        unitsWorked: daysPresent,
        overtimeHours: a?.overtimeHours ?? 0,
      });
      return { person: r.person, engagement: r.engagement!, daysPresent, netPay: calc.net };
    })
    .filter((r) => r.netPay > 0);

  const applyQuick = (q: (typeof quickExpenses)[number]) => {
    const val = q.value ?? 20000;
    const cat =
      categories.find((c) => c.id === q.parentId) ?? categories[0];
    setAmountStr(String(val));
    if (cat) setCategoryId(cat.id);
    setSubcategoryLabel(q.label);
    setPayee(q.label);
    setStep(3);
  };

  const handleSaveExpense = () => {
    if (amount <= 0 || !categoryId || !payee.trim()) return;
    const catCode = categoryId as ExpenseCategory;
    const payeeTrimmed = payee.trim();

    s.addCashEntry({
      siteId: site.id,
      day: s.today,
      direction: 'out',
      amount,
      category: catCode,
      subcategory: subcategoryLabel || undefined,
      payee: payeeTrimmed,
      note: subcategoryLabel || chosenCat?.label || 'Expense',
      hasReceiptPhoto: hasReceipt,
    });

    showSaved(`${fmtUGX(amount)} paid to ${payeeTrimmed}`, {
      detail: `Category: ${chosenCat?.label ?? catCode}`,
      onUndo: () => {
        s.addCashEntry({
          siteId: site.id,
          day: s.today,
          direction: 'in',
          amount,
          category: 'receipt',
          payee: payeeTrimmed,
          note: `Undo money out (${payeeTrimmed})`,
          hasReceiptPhoto: false,
        });
      },
    });

    setStep(1);
    setAmountStr('');
    setPayee('');
    setSubcategoryLabel('');
    setHasReceipt(false);
  };

  const handlePayWorker = (name: string, netPay: number) => {
    s.addCashEntry({
      siteId: site.id,
      day: s.today,
      direction: 'out',
      amount: netPay,
      category: 'wages',
      subcategory: 'Casual wages',
      payee: name,
      note: `Casual wages · ${name}`,
      hasReceiptPhoto: true,
    });
    showSaved(`${fmtUGX(netPay)} paid to ${name}`, {
      detail: 'Category: Wages',
      onUndo: () => {
        s.addCashEntry({
          siteId: site.id,
          day: s.today,
          direction: 'in',
          amount: netPay,
          category: 'receipt',
          payee: name,
          note: `Undo casual wage (${name})`,
          hasReceiptPhoto: false,
        });
      },
    });
  };

  return (
    <div className="flex flex-col gap-4 max-w-[760px] mx-auto">
      <SavedBanner info={saved} onDismiss={clearSaved} />

      {/* Top header */}
      <div className="paper-sheet p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="t-title text-[var(--text)]">{en.cash.moneyOutTitle}</h1>
          <p className="t-base text-[var(--text-2)] mt-0.5">{en.cash.moneyOutSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('expense')}
            className={cn(
              'ctl-sm px-4 rounded-[8px] border font-bold t-sm',
              tab === 'expense'
                ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                : 'bg-[var(--surface)] border-[var(--line-2)] text-[var(--text)]',
            )}
          >
            New payment out
          </button>
          <button
            type="button"
            onClick={() => setTab('wages')}
            className={cn(
              'ctl-sm px-4 rounded-[8px] border font-bold t-sm',
              tab === 'wages'
                ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                : 'bg-[var(--surface)] border-[var(--line-2)] text-[var(--text)]',
            )}
          >
            Pay casual workers ({casualDue.length})
          </button>
          <button
            type="button"
            onClick={() => go.site('cash')}
            className="ctl-sm px-3.5 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface-2)] font-semibold t-sm"
          >
            Cash page
          </button>
        </div>
      </div>

      {tab === 'wages' ? (
        <PaperSheet
          title="Pay casual workers today"
          subtitle="Calculated from Who came today and each worker's daily pay."
          pad={false}
        >
          {casualDue.length === 0 ? (
            <div className="p-5">
              <StatusNotice tone="ok" title="No casual wages waiting">
                All casual workers marked today have been settled.
              </StatusNotice>
            </div>
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {casualDue.map((row) => {
                const alreadyPaid = (cs?.entries ?? []).some(
                  (e) =>
                    e.direction === 'out' &&
                    (e.category === 'wages' || e.category === 'payout') &&
                    e.payee === row.person.fullName,
                );
                return (
                  <div
                    key={row.person.id}
                    className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        name={row.person.fullName}
                        seed={row.person.avatarSeed}
                        size={40}
                      />
                      <div>
                        <div className="t-base font-bold">{row.person.fullName}</div>
                        <div className="t-sm text-[var(--text-2)]">
                          {row.person.sector} · {row.daysPresent} day
                          {row.daysPresent === 1 ? '' : 's'} worked
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="num t-lg font-bold">{fmtUGX(row.netPay)}</span>
                      <button
                        type="button"
                        disabled={alreadyPaid}
                        onClick={() =>
                          handlePayWorker(row.person.fullName, row.netPay)
                        }
                        className={cn(
                          'ctl px-4 rounded-[8px] font-bold t-base inline-flex items-center gap-2',
                          alreadyPaid
                            ? 'bg-[var(--ok-bg)] text-[var(--ok)] border border-[var(--ok)]/30'
                            : 'bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)]',
                        )}
                      >
                        {alreadyPaid ? (
                          <>
                            <Check className="size-4 stroke-[3]" /> Paid
                          </>
                        ) : (
                          <>
                            <Banknote className="size-4" /> Pay cash
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </PaperSheet>
      ) : (
        <>
          {/* STEP 1 OF 3: Amount (plus 1-tap quick expenses from master data) */}
          {step === 1 && (
            <StepWizard
              step={1}
              totalSteps={3}
              title="How much money went out?"
              subtitle="Tap a common payment or enter the UGX amount on the keypad."
              canNext={amount > 0}
              nextHint="Enter the amount in UGX first."
              onNext={() => setStep(2)}
            >
              <div className="grid gap-6 lg:grid-cols-2 items-start">
                <LargeKeypad
                  value={amountStr}
                  onChange={setAmountStr}
                  unit="UGX"
                  label="Amount paid out (UGX)"
                  presets={[
                    { label: '10,000', value: 10000 },
                    { label: '20,000', value: 20000 },
                    { label: '50,000', value: 50000 },
                    { label: '100,000', value: 100000 },
                  ]}
                />

                {quickExpenses.length > 0 && (
                  <div>
                    <div className="t-base font-bold text-[var(--text)] mb-2 flex items-center gap-1.5">
                      <Sparkles className="size-4 text-[var(--warn)]" />
                      <span>Common everyday payments (1 tap)</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {quickExpenses.slice(0, 5).map((q) => (
                        <ChoiceButton
                          key={q.id}
                          title={q.label}
                          subtitle={q.value ? fmtUGX(q.value) : undefined}
                          onClick={() => applyQuick(q)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </StepWizard>
          )}

          {/* STEP 2 OF 3: Category (required) */}
          {step === 2 && (
            <StepWizard
              step={2}
              totalSteps={3}
              title="What was this money for?"
              subtitle="Every payment must have a category. Tap one below."
              summaryStrip={
                <span>
                  Amount: <b className="num">{fmtUGX(amount)}</b>
                </span>
              }
              canNext={Boolean(categoryId)}
              nextHint="Tap what the money was for before moving to the next step."
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            >
              <div className="flex flex-col gap-4">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {categories.map((cat) => (
                    <ChoiceButton
                      key={cat.id}
                      selected={categoryId === cat.id}
                      colourSwatch={cat.color ?? '#555'}
                      title={cat.label}
                      onClick={() => {
                        setCategoryId(cat.id);
                        setSubcategoryLabel('');
                      }}
                    />
                  ))}
                </div>

                {subForCat.length > 0 && (
                  <div className="pt-2 border-t border-[var(--line)]">
                    <div className="t-sm font-bold text-[var(--text-2)] mb-2">
                      Specific item under {chosenCat?.label} (optional)
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {subForCat.slice(0, 6).map((sc) => (
                        <ChoiceButton
                          key={sc.id}
                          selected={subcategoryLabel === sc.label}
                          title={sc.label}
                          onClick={() => setSubcategoryLabel(sc.label)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </StepWizard>
          )}

          {/* STEP 3 OF 3: Who was paid */}
          {step === 3 && (
            <StepWizard
              step={3}
              totalSteps={3}
              title="Who was paid?"
              subtitle="Tap a person or supplier below, or write their name."
              summaryStrip={
                <span>
                  Amount: <b className="num">{fmtUGX(amount)}</b> · For:{' '}
                  <b>
                    {chosenCat?.label}
                    {subcategoryLabel ? ` (${subcategoryLabel})` : ''}
                  </b>
                </span>
              }
              canNext={payee.trim().length >= 2}
              nextHint="Pick or write who received the money."
              nextLabel={en.cash.saveMoneyOut}
              isFinalStep
              finalTone="ok"
              onBack={() => setStep(2)}
              onNext={handleSaveExpense}
            >
              <div className="flex flex-col gap-4">
                {amount > approvalLimit && (
                  <StatusNotice tone="warn" title="Above site limit">
                    This payment is above {fmtUGX(approvalLimit)}, so the Site Manager will
                    also see it on their waiting list.
                  </StatusNotice>
                )}

                {recentPayees.length > 0 && (
                  <div>
                    <div className="t-sm font-bold text-[var(--text-2)] mb-2">
                      Tap a recent person or supplier
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {recentPayees.map((p) => (
                        <ChoiceButton
                          key={p}
                          selected={payee === p}
                          title={p}
                          onClick={() => setPayee(p)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block t-base font-bold text-[var(--text)] mb-1.5">
                    Name of person or shop paid
                  </label>
                  <Input
                    autoFocus
                    value={payee}
                    onChange={(e) => setPayee(e.target.value)}
                    placeholder="e.g. Shell Ndeeba, Umeme, John Bosco"
                    className="!h-[52px] !text-[18px] max-w-[460px]"
                  />
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setHasReceipt((v) => !v)}
                    className={cn(
                      'ctl px-4 rounded-[8px] border font-semibold t-base inline-flex items-center gap-2',
                      hasReceipt
                        ? 'bg-[var(--ok-bg)] border-[var(--ok)] text-[var(--ok)]'
                        : 'bg-[var(--surface-2)] border-[var(--line-2)] text-[var(--text)]',
                    )}
                  >
                    <Camera className="size-5" />
                    <span>
                      {hasReceipt
                        ? 'Receipt photo attached ✓'
                        : 'Take photo of paper receipt (optional)'}
                    </span>
                  </button>
                </div>
              </div>
            </StepWizard>
          )}
        </>
      )}

      {/* Today's Money Out list (mirrors paper cash page) */}
      <PaperSheet
        title="Money out written down today"
        subtitle={
          cs
            ? `Total paid out today: ${fmtUGX(cs.expenses + cs.wages)}`
            : 'No cash page open'
        }
        pad={false}
      >
        {!cs || cs.entries.filter((e) => e.direction === 'out').length === 0 ? (
          <div className="p-5 t-base text-[var(--text-2)]">
            No payments written down yet today.
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {cs.entries
              .filter((e) => e.direction === 'out')
              .slice(0, 8)
              .map((e) => {
                const catName =
                  categories.find((c) => c.id === e.category)?.label ?? e.category;
                return (
                  <div
                    key={e.id}
                    className="px-5 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Wallet className="size-4 text-[var(--text-3)] shrink-0" />
                      <div className="min-w-0">
                        <div className="t-base font-bold truncate">
                          {e.payee ?? e.note}
                        </div>
                        <div className="t-sm text-[var(--text-2)] truncate">
                          {catName}
                          {e.subcategory ? ` · ${e.subcategory}` : ''}
                        </div>
                      </div>
                    </div>
                    <span className="num t-base font-bold text-[var(--text)]">
                      − {fmtUGX(e.amount)}
                    </span>
                  </div>
                );
              })}
          </div>
        )}
      </PaperSheet>
    </div>
  );
}
