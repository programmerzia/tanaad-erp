import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Factory, Wrench } from 'lucide-react';
import { useStore } from '@/data/store';
import { useRefList, useSite, useSiteSettings } from '@/app/hooks';
import {
  currentShiftKind,
  machineWall,
  type MachineTile,
} from '@/data/selectors';
import { fmtNum } from '@/data/format';
import { Avatar, cn } from '@/components/ui';
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
 * Flow 3 · What each machine made
 *  - Step 1 of 4: Pick the machine
 *  - Step 2 of 4: Pick who ran it (by photo and name)
 *  - Step 3 of 4: Pick the product (by name and colour)
 *  - Step 4 of 4: Enter the count. If the count is low, ask why with a few choices.
 */
export function MachineWall() {
  const s = useStore();
  const site = useSite();
  const settings = useSiteSettings();
  const { saved, showSaved, clearSaved } = useSavedBanner();

  const shiftKind = currentShiftKind();
  const reasons = useRefList('downtime_reason');

  const shiftRec = useMemo(
    () =>
      s.shifts.find(
        (sh) => sh.siteId === site.id && sh.day === s.today && sh.kind === shiftKind,
      ),
    [s.shifts, site.id, s.today, shiftKind],
  );
  const shiftId = shiftRec?.id ?? `sh-${site.id}-${s.today}-${shiftKind}`;

  const wall = useMemo(
    () =>
      machineWall(s, site.id, s.today, shiftKind).filter(
        (t) => t.state !== 'arriving',
      ),
    [s, site.id, s.today, shiftKind],
  );

  // Active operators at this site
  const operators = useMemo(
    () =>
      s.people.filter(
        (p) =>
          p.status === 'active' &&
          (p.homeSiteId === site.id || p.sharedSites.includes(site.id)),
      ),
    [s.people, site.id],
  );

  // Finished/semi-finished products for this site
  const products = useMemo(
    () => s.products.filter((p) => p.siteId === site.id && p.kind !== 'material'),
    [s.products, site.id],
  );

  const unitWord =
    site.id === 'mats' ? 'mats' : site.id === 'bags' ? 'packs' : 'kg';

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [machineId, setMachineId] = useState<string | null>(null);
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [countStr, setCountStr] = useState<string>('');
  const [lowReason, setLowReason] = useState<string | null>(null);

  const selectedTile: MachineTile | undefined = wall.find(
    (t) => t.machine.id === machineId,
  );
  const selectedOperator = operators.find((p) => p.id === operatorId);
  const selectedProduct = products.find((p) => p.id === productId);

  const countNum = Number(countStr) || 0;
  const benchmark = selectedTile?.expectedSoFar ?? 100;
  const benchmarkFloorPct = settings?.benchmarkPct ?? site.thresholds.benchmarkPct;
  const lowThreshold = benchmark > 0 ? Math.round((benchmark * benchmarkFloorPct) / 100) : 0;
  const isLowCount = countNum > 0 && lowThreshold > 0 && countNum < lowThreshold;

  const loggedCount = wall.filter(
    (t) => t.state === 'ok' || t.state === 'logged' || t.state === 'below',
  ).length;
  const remainingCount = wall.filter((t) => t.state === 'not_logged').length;

  const pickMachine = (tile: MachineTile) => {
    if (tile.state === 'down') return;
    setMachineId(tile.machine.id);
    setOperatorId(tile.entry?.operatorId ?? operators[0]?.id ?? null);
    setProductId(tile.entry?.productId ?? products[0]?.id ?? null);
    setCountStr(tile.entry ? String(tile.entry.goodUnits) : '');
    setLowReason(tile.entry?.downtimeReason ?? null);
    setStep(2);
  };

  const handleSave = () => {
    if (!selectedTile || !operatorId || !productId || countNum <= 0) return;
    if (isLowCount && !lowReason) return;

    const prevEntry = selectedTile.entry;
    const stageCode =
      site.id === 'mats'
        ? 'weave'
        : site.id === 'bags'
          ? 'convert'
          : 'pelletise';
    const stdKg =
      selectedProduct && selectedProduct.bundlePieces > 0
        ? (countNum / selectedProduct.bundlePieces) *
          (selectedProduct.stdBundleWeightKg || 15)
        : countNum;

    s.recordProduction({
      siteId: site.id,
      shiftId,
      day: s.today,
      stageCode,
      machineId: selectedTile.machine.id,
      operatorId,
      productId,
      inputKg: Math.round(stdKg * 1.03),
      outputKg: Math.round(stdKg),
      goodUnits: countNum,
      rejectUnits: 0,
      downtimeMin: isLowCount ? 45 : 0,
      downtimeReason: isLowCount ? (lowReason ?? undefined) : undefined,
    });

    showSaved(
      `${selectedTile.machine.code} written down (${fmtNum(countNum)} ${unitWord})`,
      {
        detail: `${selectedOperator?.fullName ?? ''} · ${selectedProduct?.internalName ?? ''}${isLowCount && lowReason ? ` · Low reason: ${lowReason}` : ''}`,
        onUndo: prevEntry
          ? () => {
              s.recordProduction({
                siteId: site.id,
                shiftId: prevEntry.shiftId,
                day: s.today,
                stageCode: prevEntry.stageCode,
                machineId: prevEntry.machineId,
                operatorId: prevEntry.operatorId,
                productId: prevEntry.productId,
                inputKg: prevEntry.inputKg,
                outputKg: prevEntry.outputKg,
                goodUnits: prevEntry.goodUnits,
                rejectUnits: prevEntry.rejectUnits,
                downtimeMin: prevEntry.downtimeMin,
                downtimeReason: prevEntry.downtimeReason,
              });
            }
          : undefined,
      },
    );

    setStep(1);
    setMachineId(null);
    setCountStr('');
    setLowReason(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <SavedBanner info={saved} onDismiss={clearSaved} />

      {/* Plain-English header */}
      <div className="paper-sheet p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="t-title text-[var(--text)]">{en.production.title}</h1>
          <p className="t-base text-[var(--text-2)] mt-0.5">
            {remainingCount === 0
              ? `Done — all ${loggedCount} running machines are written down for this shift.`
              : `You have ${remainingCount} machine${remainingCount > 1 ? 's' : ''} left to write down (${loggedCount} of ${wall.length} done).`}
          </p>
        </div>
      </div>

      {/* STEP 1 OF 4: Pick the machine */}
      {step === 1 && (
        <StepWizard
          step={1}
          totalSteps={4}
          title={en.production.step1Machine}
          subtitle="Tap a machine below to write down or update what it made today."
          canNext={Boolean(machineId)}
          nextHint="Tap any machine card below to start."
          onNext={() => {
            if (machineId) setStep(2);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {wall.map((tile) => {
              const isDown = tile.state === 'down';
              const isLogged =
                tile.state === 'ok' ||
                tile.state === 'logged' ||
                tile.state === 'below';
              const isBelow = tile.state === 'below';

              return (
                <button
                  key={tile.machine.id}
                  type="button"
                  disabled={isDown}
                  onClick={() => pickMachine(tile)}
                  className={cn(
                    'text-left rounded-[10px] border p-4 min-h-[104px] flex flex-col justify-between gap-2 transition-colors',
                    isDown
                      ? 'bg-[var(--bad-bg)]/50 border-[var(--bad)] opacity-85 cursor-not-allowed'
                      : isBelow
                        ? 'bg-[var(--warn-bg)]/40 border-[var(--warn)] hover:bg-[var(--warn-bg)]'
                        : isLogged
                          ? 'bg-[var(--ok-bg)]/45 border-[color-mix(in_srgb,var(--ok)_45%,var(--line))] hover:bg-[var(--ok-bg)]'
                          : 'bg-[var(--surface)] border-[var(--line-2)] hover:bg-[var(--hover)] shadow-[var(--shadow-card)]',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="t-lg font-bold text-[var(--text)]">
                      {tile.machine.code}
                    </span>
                    {isDown ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[6px] bg-[var(--bad)] text-white t-xs font-bold">
                        <Wrench className="size-3.5" /> Broken
                      </span>
                    ) : isLogged ? (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[6px] t-xs font-bold',
                          isBelow
                            ? 'bg-[var(--warn)] text-white'
                            : 'bg-[var(--ok)] text-white',
                        )}
                      >
                        <Check className="size-3.5 stroke-[2.5]" />
                        {fmtNum(tile.entry?.goodUnits ?? 0)} {unitWord}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-[6px] bg-[var(--warn-bg)] text-[var(--warn)] border border-[var(--warn)]/30 t-xs font-bold">
                        Write down
                      </span>
                    )}
                  </div>

                  {isDown ? (
                    <div className="t-sm text-[var(--bad)] font-medium">
                      Locked: machine reported broken. A mechanic can mark it running again.
                    </div>
                  ) : isLogged ? (
                    <div className="flex items-center gap-2 t-sm text-[var(--text-2)]">
                      {tile.operator && (
                        <Avatar
                          name={tile.operator.fullName}
                          seed={tile.operator.avatarSeed}
                          size={22}
                        />
                      )}
                      <span className="truncate">
                        {tile.operator?.fullName ?? 'Operator'} ·{' '}
                        {tile.product?.internalName ?? ''}
                      </span>
                    </div>
                  ) : (
                    <div className="t-sm text-[var(--text-2)]">
                      Not written down yet · tap to enter
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </StepWizard>
      )}

      {/* STEP 2 OF 4: Pick who ran this machine */}
      {step === 2 && selectedTile && (
        <StepWizard
          step={2}
          totalSteps={4}
          title={`${en.production.step2Operator} (${selectedTile.machine.code})`}
          subtitle="Tap the person who worked on this machine today."
          summaryStrip={
            <span>
              Machine: <b>{selectedTile.machine.code}</b> ({selectedTile.machine.kind})
            </span>
          }
          canNext={Boolean(operatorId)}
          nextHint={en.production.chooseOperatorFirst}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        >
          <div className="grid gap-2.5 sm:grid-cols-2">
            {operators.slice(0, 12).map((person) => (
              <ChoiceButton
                key={person.id}
                selected={operatorId === person.id}
                avatarName={person.fullName}
                avatarSeed={person.avatarSeed}
                title={person.fullName}
                subtitle={person.sector}
                onClick={() => setOperatorId(person.id)}
              />
            ))}
          </div>
        </StepWizard>
      )}

      {/* STEP 3 OF 4: Pick the product */}
      {step === 3 && selectedTile && (
        <StepWizard
          step={3}
          totalSteps={4}
          title={en.production.step3Product}
          subtitle="Tap the product and colour made on this machine."
          summaryStrip={
            <span>
              Machine: <b>{selectedTile.machine.code}</b> · Operator:{' '}
              <b>{selectedOperator?.fullName}</b>
            </span>
          }
          canNext={Boolean(productId)}
          nextHint={en.production.chooseProductFirst}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        >
          <div className="grid gap-2.5 sm:grid-cols-2">
            {products.map((prod) => (
              <ChoiceButton
                key={prod.id}
                selected={productId === prod.id}
                colourSwatch={prod.colour ?? '#6E6960'}
                title={prod.internalName}
                subtitle={`${prod.commercialName}${prod.weightStatus === 'to_be_measured' ? ' · bundle weight to be confirmed' : ''}`}
                onClick={() => setProductId(prod.id)}
              />
            ))}
          </div>
        </StepWizard>
      )}

      {/* STEP 4 OF 4: Enter the count (and reason if low) */}
      {step === 4 && selectedTile && (
        <StepWizard
          step={4}
          totalSteps={4}
          title={`${en.production.step4Count} (${unitWord})`}
          subtitle={
            benchmark > 0
              ? `Usual target by now for ${selectedTile.machine.code} is ${fmtNum(benchmark)} ${unitWord}.`
              : `Enter the total ${unitWord} made on this shift.`
          }
          summaryStrip={
            <span>
              Machine: <b>{selectedTile.machine.code}</b> · Operator:{' '}
              <b>{selectedOperator?.fullName}</b> · Product:{' '}
              <b>{selectedProduct?.internalName}</b>
            </span>
          }
          canNext={countNum > 0 && (!isLowCount || Boolean(lowReason))}
          nextHint={
            countNum <= 0
              ? en.production.enterCountFirst
              : en.production.chooseLowReason
          }
          nextLabel={en.production.saveEntry}
          isFinalStep
          finalTone="ok"
          onBack={() => setStep(3)}
          onNext={handleSave}
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start">
            <LargeKeypad
              value={countStr}
              onChange={setCountStr}
              unit={unitWord}
              label={`Count made (${unitWord})`}
              presets={
                benchmark > 0
                  ? [
                      { label: `${Math.round(benchmark * 0.6)} (Low)`, value: Math.round(benchmark * 0.6) },
                      { label: `${Math.round(benchmark * 0.9)}`, value: Math.round(benchmark * 0.9) },
                      { label: `${benchmark} (Target)`, value: benchmark },
                    ]
                  : undefined
              }
            />

            <div className="flex flex-col gap-4">
              {countNum > 0 && !isLowCount && (
                <StatusNotice tone="ok" title="Good output — on target">
                  {fmtNum(countNum)} {unitWord} meets the shift target for{' '}
                  {selectedTile.machine.code}. Tap <b>{en.production.saveEntry}</b> below.
                </StatusNotice>
              )}

              {isLowCount && (
                <div className="rounded-[10px] border-2 border-[var(--warn)] bg-[var(--warn-bg)]/60 p-4 flex flex-col gap-3">
                  <div className="flex items-start gap-2.5 text-[var(--warn)]">
                    <AlertTriangle className="size-5 shrink-0 mt-0.5" />
                    <div>
                      <div className="t-base font-bold">{en.production.lowOutputTitle}</div>
                      <div className="t-sm text-[var(--text-2)]">
                        {fmtNum(countNum)} {unitWord} is below {benchmarkFloorPct}% of the{' '}
                        {fmtNum(benchmark)} target. Tap one reason below:
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {reasons.slice(0, 6).map((r) => (
                      <ChoiceButton
                        key={r.id}
                        tone="warn"
                        selected={lowReason === r.label}
                        title={r.label}
                        onClick={() => setLowReason(r.label)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </StepWizard>
      )}

      {/* Paper Shift Book Summary below Step 1 */}
      {step === 1 && (
        <PaperSheet
          title={`Today's Shift Book · ${shiftKind === 'day' ? 'Day Shift' : 'Night Shift'}`}
          subtitle="Same columns as your paper shift book. Tap any row to change it."
          pad={false}
        >
          <div className="divide-y divide-[var(--line)]">
            {wall.map((t) => (
              <button
                key={t.machine.id}
                type="button"
                disabled={t.state === 'down'}
                onClick={() => pickMachine(t)}
                className="w-full px-5 py-3 text-left flex flex-wrap items-center justify-between gap-3 hover:bg-[var(--hover)]"
              >
                <div className="flex items-center gap-3 min-w-[180px]">
                  <Factory className="size-4 text-[var(--text-3)]" />
                  <span className="t-base font-bold">{t.machine.code}</span>
                  <span className="t-sm text-[var(--text-2)]">
                    {t.operator?.fullName ?? 'Not written yet'}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="t-sm text-[var(--text-2)]">
                    {t.product?.internalName ?? '—'}
                  </span>
                  <span className="num t-base font-bold min-w-[90px] text-right">
                    {t.entry ? `${fmtNum(t.entry.goodUnits)} ${unitWord}` : '—'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </PaperSheet>
      )}
    </div>
  );
}
