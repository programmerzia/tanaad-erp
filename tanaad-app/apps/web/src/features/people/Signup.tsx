import { useState } from 'react';
import { Camera, Check, UserPlus } from 'lucide-react';
import { useStore } from '@/data/store';
import { useGo, useRefList, useSite } from '@/app/hooks';
import { currentShiftKind } from '@/data/selectors';
import { fmtUGX } from '@/data/format';
import { Input, cn } from '@/components/ui';
import {
  ChoiceButton,
  LargeKeypad,
  SavedBanner,
  StepWizard,
  useSavedBanner,
} from '@/components/simple';
import { en } from '@/i18n/en';

/**
 * Flow 1 · New casual worker in under a minute:
 *  - Step 1 of 3: photo of ID, photo of face
 *  - Step 2 of 3: name, phone
 *  - Step 3 of 3: where they work, daily pay, done.
 */
export function Signup() {
  const s = useStore();
  const site = useSite();
  const go = useGo();
  const { saved, showSaved, clearSaved } = useSavedBanner();

  // Master data lists (Rule 1: Nothing the client can define is hard-coded)
  const sectors = useRefList('sector');
  const dailyRates = useRefList('daily_rate');

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [hasIdPhoto, setHasIdPhoto] = useState(false);
  const [hasFacePhoto, setHasFacePhoto] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phoneMomo, setPhoneMomo] = useState('');
  const [sector, setSector] = useState<string>(sectors[0]?.label ?? '');
  const [rateStr, setRateStr] = useState<string>(
    dailyRates[0]?.value ? String(dailyRates[0].value) : '15000',
  );
  const [showCustomPad, setShowCustomPad] = useState(false);

  const step1Ready = hasIdPhoto && hasFacePhoto;
  const step2Ready =
    fullName.trim().length >= 3 && phoneMomo.replace(/\D/g, '').length >= 9;
  const rateNum = Number(rateStr) || 0;
  const step3Ready = Boolean(sector) && rateNum > 0;

  const resetForm = () => {
    setStep(1);
    setHasIdPhoto(false);
    setHasFacePhoto(false);
    setFullName('');
    setPhoneMomo('');
    setSector(sectors[0]?.label ?? '');
    setRateStr(dailyRates[0]?.value ? String(dailyRates[0].value) : '15000');
    setShowCustomPad(false);
  };

  const handleSaveWorker = () => {
    if (!step1Ready || !step2Ready || !step3Ready) return;
    const shiftKind = currentShiftKind();
    const shiftRec = s.shifts.find(
      (sh) => sh.siteId === site.id && sh.day === s.today && sh.kind === shiftKind,
    );
    const shiftId = shiftRec?.id ?? `sh-${site.id}-${s.today}-${shiftKind}`;

    const person = s.registerCasual({
      siteId: site.id,
      fullName: fullName.trim(),
      phoneMomo: phoneMomo.trim(),
      sector,
      rate: rateNum,
      idNumber: `CF${Math.floor(10000000 + Math.random() * 89999999)}`,
    });

    // Mark them present on today's shift so they are on the attendance sheet right away
    s.markAttendance({
      shiftId,
      personId: person.id,
      siteId: site.id,
      status: 'present',
    });

    showSaved(`${person.fullName} added and marked Present today`, {
      detail: `${sector} · ${fmtUGX(rateNum)} per day`,
      onUndo: () => {
        s.archivePerson(person.id);
      },
    });
    resetForm();
  };

  return (
    <div className="flex flex-col gap-4 max-w-[720px] mx-auto">
      <SavedBanner info={saved} onDismiss={clearSaved} />

      <div className="paper-sheet p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="t-title text-[var(--text)]">{en.signup.title}</h1>
          <p className="t-base text-[var(--text-2)] mt-0.5">{en.signup.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => go.site('people/attendance')}
          className="ctl-sm px-4 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] font-semibold t-sm"
        >
          Open Who came today
        </button>
      </div>

      {/* Step 1 of 3: Photos */}
      {step === 1 && (
        <StepWizard
          step={1}
          totalSteps={3}
          title={en.signup.step1Title}
          subtitle="Tap each box below to take the photo with the tablet camera."
          canNext={step1Ready}
          nextHint={en.signup.guidePhotos}
          onNext={() => setStep(2)}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setHasIdPhoto((v) => !v)}
              className={cn(
                'rounded-[10px] border-2 p-6 min-h-[150px] flex flex-col items-center justify-center text-center gap-3 transition-colors',
                hasIdPhoto
                  ? 'border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok)]'
                  : 'border-dashed border-[var(--line-2)] bg-[var(--surface-2)] hover:bg-[var(--hover)] text-[var(--text)]',
              )}
            >
              <span
                className={cn(
                  'size-14 rounded-full grid place-items-center',
                  hasIdPhoto ? 'bg-[var(--ok)] text-white' : 'bg-[var(--surface)] text-[var(--text-2)]',
                )}
              >
                {hasIdPhoto ? <Check className="size-7 stroke-[2.5]" /> : <Camera className="size-7" />}
              </span>
              <div className="t-lg font-bold">
                {hasIdPhoto ? en.signup.idPhotoTaken : en.signup.takeIdPhoto}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setHasFacePhoto((v) => !v)}
              className={cn(
                'rounded-[10px] border-2 p-6 min-h-[150px] flex flex-col items-center justify-center text-center gap-3 transition-colors',
                hasFacePhoto
                  ? 'border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok)]'
                  : 'border-dashed border-[var(--line-2)] bg-[var(--surface-2)] hover:bg-[var(--hover)] text-[var(--text)]',
              )}
            >
              <span
                className={cn(
                  'size-14 rounded-full grid place-items-center',
                  hasFacePhoto ? 'bg-[var(--ok)] text-white' : 'bg-[var(--surface)] text-[var(--text-2)]',
                )}
              >
                {hasFacePhoto ? <Check className="size-7 stroke-[2.5]" /> : <Camera className="size-7" />}
              </span>
              <div className="t-lg font-bold">
                {hasFacePhoto ? en.signup.facePhotoTaken : en.signup.takeFacePhoto}
              </div>
            </button>
          </div>
        </StepWizard>
      )}

      {/* Step 2 of 3: Name and phone */}
      {step === 2 && (
        <StepWizard
          step={2}
          totalSteps={3}
          title={en.signup.step2Title}
          subtitle="Write the worker's full name and mobile money number."
          summaryStrip={<span>Photos taken: National ID ✓ · Worker face ✓</span>}
          canNext={step2Ready}
          nextHint={en.signup.guideNamePhone}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        >
          <div className="flex flex-col gap-4 max-w-[520px]">
            <div>
              <label className="block t-base font-bold text-[var(--text)] mb-1.5">
                {en.signup.fullName}
              </label>
              <Input
                autoFocus
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Ronald Mugisha"
                className="!h-[52px] !text-[18px]"
              />
            </div>

            <div>
              <label className="block t-base font-bold text-[var(--text)] mb-1.5">
                {en.signup.phoneMomo}
              </label>
              <Input
                inputMode="tel"
                value={phoneMomo}
                onChange={(e) => setPhoneMomo(e.target.value)}
                placeholder="e.g. 0772 123 456"
                className="!h-[52px] !text-[18px] num"
              />
            </div>

            {(!fullName || !phoneMomo) && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!fullName) setFullName('Ronald Mugisha');
                    if (!phoneMomo) setPhoneMomo('+256 774 812 390');
                  }}
                  className="ctl-sm px-3.5 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface-2)] hover:bg-[var(--hover)] t-sm font-medium text-[var(--text-2)] inline-flex items-center gap-1.5"
                >
                  <UserPlus className="size-4" />
                  <span>Fill example worker name and phone</span>
                </button>
              </div>
            )}
          </div>
        </StepWizard>
      )}

      {/* Step 3 of 3: Where they work and daily pay */}
      {step === 3 && (
        <StepWizard
          step={3}
          totalSteps={3}
          title={en.signup.step3Title}
          subtitle="Tap the section where they work, then tap their daily pay."
          summaryStrip={
            <span>
              Worker: <b>{fullName}</b> · Phone: <span className="num">{phoneMomo}</span>
            </span>
          }
          canNext={step3Ready}
          nextHint={en.signup.guideWorkPay}
          nextLabel={en.signup.saveWorker}
          isFinalStep
          finalTone="ok"
          onBack={() => setStep(2)}
          onNext={handleSaveWorker}
        >
          <div className="flex flex-col gap-5">
            <div>
              <div className="t-base font-bold text-[var(--text)] mb-2">
                {en.signup.whereTheyWork}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {sectors.map((sec) => (
                  <ChoiceButton
                    key={sec.id}
                    selected={sector === sec.label}
                    title={sec.label}
                    onClick={() => setSector(sec.label)}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="t-base font-bold text-[var(--text)] mb-2">
                {en.signup.dailyPay}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-3">
                {dailyRates.map((r) => {
                  const val = r.value ?? 0;
                  return (
                    <ChoiceButton
                      key={r.id}
                      selected={!showCustomPad && Number(rateStr) === val}
                      title={fmtUGX(val)}
                      subtitle="per day"
                      onClick={() => {
                        setShowCustomPad(false);
                        setRateStr(String(val));
                      }}
                    />
                  );
                })}
                <ChoiceButton
                  selected={showCustomPad}
                  title="Other amount"
                  subtitle="Use number pad"
                  onClick={() => setShowCustomPad(true)}
                />
              </div>

              {showCustomPad && (
                <div className="mt-3">
                  <LargeKeypad
                    value={rateStr}
                    onChange={setRateStr}
                    unit="UGX / day"
                    label="Enter daily pay in UGX"
                  />
                </div>
              )}
            </div>
          </div>
        </StepWizard>
      )}
    </div>
  );
}
