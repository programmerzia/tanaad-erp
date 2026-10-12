import { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Camera,
  Check,
  CheckCircle2,
  MessageCircle,
  Scale,
  UserPlus,
} from 'lucide-react';
import type { CollectorDelivery } from '@tanaad/domain';
import { intakeNet } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useRefList, useSite } from '@/app/hooks';
import { intakeToday } from '@/data/selectors';
import { fmtDayShort, fmtKg, fmtNum, fmtTime, fmtUGX } from '@/data/format';
import { Avatar, Input, Sheet, cn } from '@/components/ui';
import { ScaleWidget } from '@/components/ScaleWidget';
import { QR } from '@/components/Sticker';
import { WhatsAppPreview } from '@/components/WhatsAppPreview';
import { messaging } from '@/devices';
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
import { amountOf, voucherNo } from './kit';

/**
 * Flow 9 · Weigh in scrap (recycling):
 * "who delivered, weight on the scale, deductions, what we pay."
 * Recycling deduction rules are labelled "to be confirmed" per Section 7.
 */
export function Intake() {
  const s = useStore();
  const site = useSite();
  const today = s.today;
  const { saved, showSaved, clearSaved } = useSavedBanner();

  const dedOptions = useRefList('deduction_option');
  const priceOptions = useRefList('price_option');

  const collectors = useMemo(
    () => [...new Set(s.collectorDeliveries.map((d) => d.collector))].sort(),
    [s.collectorDeliveries],
  );

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [collector, setCollector] = useState<string | null>(
    collectors[0] ?? null,
  );
  const [addingNew, setAddingNew] = useState(false);
  const [newCollectorName, setNewCollectorName] = useState('');

  const [grossKg, setGrossKg] = useState<number | null>(null);
  const [scalePhoto, setScalePhoto] = useState(true);
  const [scaleRound, setScaleRound] = useState(0);
  const [targetKg, setTargetKg] = useState(1150);

  const [tareStr, setTareStr] = useState('20');
  const [dedId, setDedId] = useState<string | null>(
    dedOptions[0]?.id ?? null,
  );
  const [priceId, setPriceId] = useState<string | null>(
    priceOptions[0]?.id ?? null,
  );

  const [issuedVoucher, setIssuedVoucher] = useState<CollectorDelivery | null>(
    null,
  );
  const [waOpen, setWaOpen] = useState(false);
  const [waSent, setWaSent] = useState(false);

  useEffect(() => {
    if (!dedOptions.some((o) => o.id === dedId)) {
      setDedId(dedOptions[0]?.id ?? null);
    }
  }, [dedOptions, dedId]);

  useEffect(() => {
    if (!priceOptions.some((o) => o.id === priceId)) {
      setPriceId(priceOptions[0]?.id ?? null);
    }
  }, [priceOptions, priceId]);

  const who = addingNew ? newCollectorName.trim() : (collector ?? '');
  const tareKg = Math.max(0, Number(tareStr) || 0);
  const deductionPct = dedOptions.find((o) => o.id === dedId)?.value ?? 0;
  const pricePerKg = priceOptions.find((o) => o.id === priceId)?.value ?? 0;

  const liveCalc = intakeNet({
    grossKg: grossKg ?? 0,
    tareKg,
    deductionPct,
    pricePerKg,
  });
  const cleanKg = Math.max(0, (grossKg ?? 0) - tareKg);
  const deductedKg = Math.max(
    0,
    Math.round((cleanKg - liveCalc.netKg) * 10) / 10,
  );

  const todaysDeliveries = useMemo(
    () =>
      intakeToday(s, today).sort((a, b) => b.at.localeCompare(a.at)),
    [s, today],
  );

  const handlePickCollector = (name: string) => {
    setAddingNew(false);
    setCollector(name);
    const last = s.collectorDeliveries
      .filter((d) => d.collector === name)
      .sort((a, b) => b.at.localeCompare(a.at))[0];
    if (last) {
      setTareStr(String(last.tareKg));
      const dMatch = dedOptions.find((o) => o.value === last.deductionPct);
      if (dMatch) setDedId(dMatch.id);
      const pMatch = priceOptions.find((o) => o.value === last.pricePerKg);
      if (pMatch) setPriceId(pMatch.id);
    }
  };

  const handleSaveAndIssue = () => {
    if (!who || !grossKg || grossKg <= tareKg || pricePerKg <= 0) return;
    const rec = s.recordIntake({
      collector: who,
      grossKg,
      tareKg,
      deductionPct,
      pricePerKg,
      day: today,
      hasScalePhoto: scalePhoto,
    });
    const vNo = voucherNo(rec, useStore.getState().collectorDeliveries);
    setIssuedVoucher(rec);
    showSaved(`Weigh-in voucher ${vNo} saved`, {
      detail: `${who} · Net ${fmtKg(rec.netKg)} · What we pay: ${fmtUGX(amountOf(rec))}`,
    });
    if (addingNew) {
      setCollector(who);
      setAddingNew(false);
      setNewCollectorName('');
    }
    setGrossKg(null);
    setScaleRound((r) => r + 1);
    setTargetKg(950 + Math.floor(Math.random() * 800));
    setStep(1);
  };

  const handlePayCashNow = (d: CollectorDelivery) => {
    s.payCollector(d.id);
    const updated =
      useStore.getState().collectorDeliveries.find((x) => x.id === d.id) ?? d;
    setIssuedVoucher(updated);
    showSaved(`${fmtUGX(amountOf(d))} paid in cash to ${d.collector}`, {
      detail: 'Recorded in today’s cash book under Materials.',
    });
  };

  const activeVoucher = issuedVoucher
    ? (s.collectorDeliveries.find((d) => d.id === issuedVoucher.id) ??
      issuedVoucher)
    : null;

  const activeVoucherNo = activeVoucher
    ? voucherNo(activeVoucher, s.collectorDeliveries)
    : '';

  const waLines = activeVoucher
    ? [
        `${site.legalName} · Weigh-in Voucher ${activeVoucherNo}`,
        `Collector: ${activeVoucher.collector}`,
        `Gross ${fmtKg(activeVoucher.grossKg)} − Tare ${fmtKg(activeVoucher.tareKg)} − Deduction ${activeVoucher.deductionPct}% = Net ${fmtKg(activeVoucher.netKg)}`,
        `What we pay: ${fmtKg(activeVoucher.netKg)} × ${fmtUGX(activeVoucher.pricePerKg)} = ${fmtUGX(amountOf(activeVoucher))}`,
        activeVoucher.paid ? 'Status: Paid in cash ✓' : 'Status: Payable at cashier office',
      ]
    : [];

  const handleSendWhatsApp = async () => {
    if (!activeVoucher) return;
    await messaging.sendWhatsApp(
      activeVoucher.collector,
      waLines.join('\n'),
      `${activeVoucherNo}.pdf`,
    );
    setWaSent(true);
    showSaved(`Voucher ${activeVoucherNo} sent on WhatsApp`);
  };

  return (
    <div className="flex flex-col gap-5 max-w-[860px] mx-auto">
      <SavedBanner info={saved} onDismiss={clearSaved} />

      {/* Top header */}
      <div className="paper-sheet p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="t-sm font-semibold text-[var(--text-2)]">
            {site.name} · Scrap Weigh-In
          </div>
          <h1 className="t-title text-[var(--text)] mt-0.5">
            {en.recycling.intakeTitle}
          </h1>
          <p className="t-base text-[var(--text-2)] mt-0.5">
            {en.recycling.intakeSubtitle}
          </p>
        </div>
        <span className="px-3.5 py-1.5 rounded-[8px] bg-[var(--surface-2)] border border-[var(--line-2)] t-sm font-bold num">
          {todaysDeliveries.length} weighed today
        </span>
      </div>

      {/* Unconfirmed rule notice (Section 7) */}
      <StatusNotice tone="warn" title="Deduction rules to be confirmed">
        {en.recycling.deductionUnconfirmed}
      </StatusNotice>

      {/* Just-issued voucher card with 1-tap Pay Cash or Share on WhatsApp */}
      {activeVoucher && (
        <PaperSheet
          title={`Weigh-in Voucher Issued · ${activeVoucherNo}`}
          subtitle={`${activeVoucher.collector} · ${fmtDayShort(activeVoucher.day)}`}
          badge={
            <span
              className={cn(
                'px-3 py-1 rounded-[6px] t-xs font-bold',
                activeVoucher.paid
                  ? 'bg-[var(--ok-bg)] text-[var(--ok)]'
                  : 'bg-[var(--warn-bg)] text-[var(--warn)]',
              )}
            >
              {activeVoucher.paid ? 'Paid in cash ✓' : 'Unpaid · Ready to pay'}
            </span>
          }
        >
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] items-center">
            <div className="rounded-[8px] border border-[var(--line-2)] bg-[var(--surface-2)] p-4 flex flex-col gap-2">
              <div className="flex justify-between t-base">
                <span className="text-[var(--text-2)]">Gross weight on scale</span>
                <span className="num font-semibold">{fmtKg(activeVoucher.grossKg)}</span>
              </div>
              <div className="flex justify-between t-base">
                <span className="text-[var(--text-2)]">Minus tare</span>
                <span className="num">− {fmtKg(activeVoucher.tareKg)}</span>
              </div>
              <div className="flex justify-between t-base">
                <span className="text-[var(--text-2)]">
                  Minus deduction ({activeVoucher.deductionPct}%)
                </span>
                <span className="num">
                  −{' '}
                  {fmtKg(
                    Math.max(
                      0,
                      Math.round(
                        (activeVoucher.grossKg -
                          activeVoucher.tareKg -
                          activeVoucher.netKg) *
                          10,
                      ) / 10,
                    ),
                  )}
                </span>
              </div>
              <div className="flex justify-between t-base font-bold pt-2 border-t border-[var(--line)]">
                <span>Net weight paid for</span>
                <span className="num">{fmtKg(activeVoucher.netKg)}</span>
              </div>
              <div className="flex justify-between t-lg font-bold pt-2 border-t border-[var(--line-2)] text-[var(--ok)]">
                <span>{en.recycling.whatWePay}</span>
                <span className="num">{fmtUGX(amountOf(activeVoucher))}</span>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="p-2 rounded-[8px] bg-white border border-[var(--line)]">
                <QR value={activeVoucherNo} size={64} />
              </div>
              <button
                type="button"
                disabled={activeVoucher.paid}
                onClick={() => handlePayCashNow(activeVoucher)}
                className="w-full ctl px-5 rounded-[8px] bg-[var(--ok)] hover:opacity-95 disabled:opacity-50 text-white font-bold t-base inline-flex items-center justify-center gap-2"
              >
                <Banknote className="size-5" />
                <span>
                  {activeVoucher.paid ? 'Paid in cash ✓' : en.recycling.payNowCash}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setWaSent(false);
                  setWaOpen(true);
                }}
                className="w-full ctl-sm px-4 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] font-bold t-sm inline-flex items-center justify-center gap-2"
              >
                <MessageCircle className="size-4" />
                <span>Send on WhatsApp</span>
              </button>
            </div>
          </div>
        </PaperSheet>
      )}

      {/* ====================================================================
       * STEP 1 OF 3: WHO DELIVERED?
       * ==================================================================== */}
      {step === 1 && (
        <StepWizard
          step={1}
          totalSteps={3}
          title={en.recycling.whoDelivered}
          subtitle="Tap a collector from the list below, or add a new collector."
          canNext={who.length >= 2}
          nextHint="Pick who brought the scrap first."
          onNext={() => setStep(2)}
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {collectors.map((c) => {
                const count = s.collectorDeliveries.filter(
                  (d) => d.collector === c,
                ).length;
                return (
                  <ChoiceButton
                    key={c}
                    selected={!addingNew && collector === c}
                    avatarName={c}
                    title={c}
                    subtitle={`${count} past deliver${count === 1 ? 'y' : 'ies'}`}
                    onClick={() => handlePickCollector(c)}
                  />
                );
              })}

              <ChoiceButton
                selected={addingNew}
                icon={<UserPlus className="size-5" />}
                title="Add a new collector"
                subtitle="First time delivering here"
                onClick={() => {
                  setAddingNew(true);
                  setCollector(null);
                }}
              />
            </div>

            {addingNew && (
              <div className="pt-3 border-t border-[var(--line)]">
                <label className="block t-base font-bold text-[var(--text)] mb-1.5">
                  New collector's full name
                </label>
                <Input
                  value={newCollectorName}
                  onChange={(e) => setNewCollectorName(e.target.value)}
                  placeholder="e.g. Kasule Scrap Traders"
                  className="!h-[52px] !text-[18px]"
                  autoFocus
                />
              </div>
            )}
          </div>
        </StepWizard>
      )}

      {/* ====================================================================
       * STEP 2 OF 3: WEIGHT ON THE SCALE
       * ==================================================================== */}
      {step === 2 && (
        <StepWizard
          step={2}
          totalSteps={3}
          title={en.recycling.weightOnScale}
          subtitle="Put the sacks or lorry on the platform, read the scale, and use the reading."
          summaryStrip={
            <span>
              Collector: <b>{who}</b>
            </span>
          }
          canNext={grossKg !== null && grossKg > 0 && scalePhoto}
          nextHint="Tap 'Read scale' then 'Use … kg' on the scale below."
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        >
          <div className="flex flex-col gap-4">
            <ScaleWidget
              key={scaleRound}
              title="Scrap Intake Platform Scale"
              targetKg={targetKg}
              onReading={(kg) => setGrossKg(kg)}
            />

            {grossKg !== null && (
              <div className="rounded-[8px] bg-[var(--ok-bg)] border border-[var(--ok)] px-4 py-3 flex items-center justify-between">
                <span className="t-base font-bold text-[var(--ok)] flex items-center gap-2">
                  <CheckCircle2 className="size-5" />
                  Scale weight recorded: {fmtKg(grossKg)}
                </span>
                <span className="t-sm text-[var(--text-2)]">Ready for Step 3</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setScalePhoto((p) => !p)}
              className={cn(
                'w-full rounded-[10px] border-2 p-4 flex items-center gap-3.5 text-left transition-colors',
                scalePhoto
                  ? 'border-[var(--ok)] bg-[var(--ok-bg)]/50'
                  : 'border-dashed border-[var(--line-2)] bg-[var(--surface)]',
              )}
            >
              <span
                className={cn(
                  'size-11 rounded-[8px] grid place-items-center shrink-0',
                  scalePhoto
                    ? 'bg-[var(--ok)] text-white'
                    : 'bg-[var(--surface-2)] text-[var(--text-2)]',
                )}
              >
                {scalePhoto ? <Check className="size-5 stroke-[3]" /> : <Camera className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="t-base font-bold text-[var(--text)]">
                  {scalePhoto
                    ? 'Photo of scale display attached ✓'
                    : 'Tap to take photo of scale display'}
                </div>
                <div className="t-sm text-[var(--text-2)]">
                  Saved with the voucher so there is no argument about the scale reading.
                </div>
              </div>
            </button>
          </div>
        </StepWizard>
      )}

      {/* ====================================================================
       * STEP 3 OF 3: DEDUCTIONS & WHAT WE PAY
       * ==================================================================== */}
      {step === 3 && (
        <StepWizard
          step={3}
          totalSteps={3}
          title={`${en.recycling.deductions} & ${en.recycling.whatWePay}`}
          subtitle="Pick the deduction for moisture/dirt and price per kg. The screen works out what we pay."
          summaryStrip={
            <span>
              Collector: <b>{who}</b> · Scale weight:{' '}
              <b className="num">{fmtKg(grossKg ?? 0)}</b>
            </span>
          }
          canNext={Boolean(grossKg && grossKg > tareKg && pricePerKg > 0)}
          nextHint="Check that gross weight is greater than tare weight."
          nextLabel={en.recycling.saveAndIssueVoucher}
          isFinalStep
          finalTone="ok"
          onBack={() => setStep(2)}
          onNext={handleSaveAndIssue}
        >
          <div className="flex flex-col gap-5">
            {/* Deduction picker from master data */}
            <div>
              <div className="t-base font-bold text-[var(--text)] mb-1">
                1. {en.recycling.deductions} (moisture, sand or labels)
              </div>
              <div className="t-xs text-[var(--warn)] font-semibold mb-2">
                Note: {en.recycling.deductionUnconfirmed}
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                {dedOptions.map((d) => (
                  <ChoiceButton
                    key={d.id}
                    selected={dedId === d.id}
                    title={d.label}
                    subtitle={
                      d.value !== undefined
                        ? `−${Math.round(cleanKg * (d.value / 100))} kg`
                        : undefined
                    }
                    onClick={() => setDedId(d.id)}
                  />
                ))}
              </div>
            </div>

            {/* Price per kg from master data */}
            <div>
              <div className="t-base font-bold text-[var(--text)] mb-2">
                2. Price per kg (from Settings)
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {priceOptions.map((p) => (
                  <ChoiceButton
                    key={p.id}
                    selected={priceId === p.id}
                    title={p.value !== undefined ? `${fmtUGX(p.value)} / kg` : p.label}
                    subtitle={p.label}
                    onClick={() => setPriceId(p.id)}
                  />
                ))}
              </div>
            </div>

            {/* Tare weight */}
            <div className="grid gap-5 lg:grid-cols-2 items-start pt-2 border-t border-[var(--line)]">
              <LargeKeypad
                value={tareStr}
                onChange={setTareStr}
                unit="kg"
                label="3. Empty sacks / lorry tare weight (kg)"
                presets={[
                  { label: '0 kg', value: 0 },
                  { label: '10 kg', value: 10 },
                  { label: '20 kg', value: 20 },
                  { label: '50 kg', value: 50 },
                ]}
              />

              {/* Paper Voucher Arithmetic Box: What we pay */}
              <div className="rounded-[10px] border-2 border-[var(--ok)] bg-[var(--ok-bg)]/45 p-5 flex flex-col gap-2.5">
                <div className="t-sm font-bold uppercase tracking-wider text-[var(--ok)]">
                  Weigh-In Voucher Calculation
                </div>

                <div className="flex justify-between t-base py-1 border-b border-[var(--line)]">
                  <span className="text-[var(--text-2)]">Weight on the scale</span>
                  <span className="num font-bold">{fmtKg(grossKg ?? 0)}</span>
                </div>
                <div className="flex justify-between t-base py-1 border-b border-[var(--line)]">
                  <span className="text-[var(--text-2)]">Minus empty sacks / tare</span>
                  <span className="num">− {fmtKg(tareKg)}</span>
                </div>
                <div className="flex justify-between t-base py-1 border-b border-[var(--line)]">
                  <span className="text-[var(--text-2)]">
                    Minus deduction ({deductionPct}%)
                  </span>
                  <span className="num">− {fmtKg(deductedKg)}</span>
                </div>
                <div className="flex justify-between t-lg font-bold py-1.5 border-b border-[var(--line-2)]">
                  <span>{en.recycling.netWeight}</span>
                  <span className="num">{fmtKg(liveCalc.netKg)}</span>
                </div>
                <div className="flex justify-between t-base py-1">
                  <span className="text-[var(--text-2)]">Price per kg</span>
                  <span className="num">× {fmtUGX(pricePerKg)}</span>
                </div>

                <div className="mt-1 pt-3 border-t-2 border-[var(--ok)] flex items-baseline justify-between gap-3">
                  <span className="t-lg font-bold text-[var(--text)]">
                    {en.recycling.whatWePay}
                  </span>
                  <span className="text-[28px] font-bold num text-[var(--ok)]">
                    {fmtUGX(liveCalc.amount)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </StepWizard>
      )}

      {/* Today's scrap weigh-in log (paper mirror) */}
      <PaperSheet
        title="Scrap weighed in today"
        subtitle="Tap any line to view its voucher or pay the collector in cash."
        pad={false}
      >
        {todaysDeliveries.length === 0 ? (
          <div className="p-5 t-base text-[var(--text-2)]">
            No scrap deliveries weighed in today yet.
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {todaysDeliveries.map((d) => {
              const vNo = voucherNo(d, s.collectorDeliveries);
              const amt = amountOf(d);
              return (
                <div
                  key={d.id}
                  className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={d.collector} size={36} />
                    <div>
                      <div className="t-base font-bold text-[var(--text)]">
                        {d.collector} · <span className="code t-sm">{vNo}</span>
                      </div>
                      <div className="t-sm text-[var(--text-2)] num">
                        Gross {fmtKg(d.grossKg)} − {d.deductionPct}% ={' '}
                        <b>{fmtKg(d.netKg)} net</b> · {fmtTime(d.at)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="num t-lg font-bold">{fmtUGX(amt)}</span>
                    {d.paid ? (
                      <span className="px-3 py-1.5 rounded-[8px] bg-[var(--ok-bg)] text-[var(--ok)] t-sm font-bold inline-flex items-center gap-1">
                        <Check className="size-4 stroke-[3]" /> Paid
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handlePayCashNow(d)}
                        className="ctl-sm px-3.5 rounded-[8px] bg-[var(--brand)] text-white font-bold t-sm inline-flex items-center gap-1.5"
                      >
                        <Banknote className="size-4" /> Pay cash
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PaperSheet>

      <Sheet
        open={waOpen && Boolean(activeVoucher)}
        onClose={() => setWaOpen(false)}
        title="Send Weigh-In Voucher on WhatsApp"
        sub={
          activeVoucher
            ? `${activeVoucherNo} · ${activeVoucher.collector}`
            : undefined
        }
      >
        {activeVoucher && (
          <div className="flex flex-col gap-4 items-center">
            <WhatsAppPreview
              to={activeVoucher.collector}
              lines={waLines}
              attachment={`${activeVoucherNo}.pdf`}
              sent={waSent}
            />
            <button
              type="button"
              disabled={waSent}
              onClick={handleSendWhatsApp}
              className="w-full ctl-lg rounded-[8px] bg-[var(--ok)] text-white font-bold t-lg inline-flex items-center justify-center gap-2"
            >
              <MessageCircle className="size-5" />
              <span>{waSent ? 'Sent ✓' : 'Send on WhatsApp'}</span>
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
