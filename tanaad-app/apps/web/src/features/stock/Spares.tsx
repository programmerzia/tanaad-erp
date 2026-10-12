import { useMemo, useState } from 'react';
import { PackagePlus, Wrench } from 'lucide-react';
import { useStore } from '@/data/store';
import { useSite } from '@/app/hooks';
import { machinesOf } from '@/data/selectors';
import { fmtDateTime, fmtNum, fmtUGX } from '@/data/format';
import { Avatar, PinPad, cn } from '@/components/ui';
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
 * Flow 7 · Take a spare part:
 * "which part, how many, for which machine, who is taking it, PIN."
 */
export function Spares() {
  const s = useStore();
  const site = useSite();
  const role = s.session?.role;
  const { saved, showSaved, clearSaved } = useSavedBanner();

  const [mode, setMode] = useState<'take' | 'receive'>('take');
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const parts = useMemo(
    () => s.parts.filter((p) => p.siteId === site.id),
    [s.parts, site.id],
  );
  const machines = useMemo(
    () =>
      machinesOf(s, site.id).filter(
        (m) => m.status !== 'retired' && m.status !== 'arriving',
      ),
    [s, site.id],
  );
  const mechanics = useMemo(
    () =>
      s.people.filter(
        (p) =>
          p.status === 'active' &&
          p.sector === 'Maintenance' &&
          (p.homeSiteId === site.id ||
            p.sharedSites.includes(site.id) ||
            p.shared),
      ),
    [s.people, site.id],
  );

  // Flow 7 state
  const [partId, setPartId] = useState<string | null>(
    parts.find((p) => p.onHand > 0)?.id ?? parts[0]?.id ?? null,
  );
  const [qtyStr, setQtyStr] = useState<string>('1');
  const [machineId, setMachineId] = useState<string | null>(
    machines.find((m) => m.status === 'down')?.id ?? machines[0]?.id ?? null,
  );
  const [mechanicId, setMechanicId] = useState<string | null>(
    mechanics[0]?.id ?? null,
  );
  const [pinError, setPinError] = useState<string | null>(null);

  // Receive new parts state (for Storekeeper)
  const [recPartId, setRecPartId] = useState<string | null>(
    parts[0]?.id ?? null,
  );
  const [recQtyStr, setRecQtyStr] = useState<string>('5');

  const chosenPart = parts.find((p) => p.id === partId);
  const qty = Math.max(0, Number(qtyStr) || 0);
  const chosenMachine = machines.find((m) => m.id === machineId);
  const chosenMechanic = mechanics.find((m) => m.id === mechanicId);

  const handlePinSubmit = (pin: string) => {
    if (!chosenPart || !chosenMachine || !chosenMechanic || qty <= 0) return;
    const res = s.issuePart({
      pin,
      siteId: site.id,
      partId: chosenPart.id,
      machineId: chosenMachine.id,
      mechanicId: chosenMechanic.id,
      qty,
    });
    if (!res.ok) {
      setPinError(
        `${res.message} (Demo Mechanic PIN is 1357)`,
      );
      return;
    }
    setPinError(null);
    const issuedPartId = chosenPart.id;
    const issuedPartName = chosenPart.name;
    const issuedQty = qty;
    showSaved(
      `Unlocked: ${issuedQty} × ${issuedPartName} for ${chosenMachine.code}`,
      {
        detail: `Taken by ${chosenMechanic.fullName}. ${chosenPart.onHand - issuedQty} ${chosenPart.unit} left in store.`,
        onUndo: () => {
          s.receivePart(issuedPartId, issuedQty);
        },
      },
    );
    setStep(1);
    setQtyStr('1');
  };

  const handleReceivePart = () => {
    const p = parts.find((x) => x.id === recPartId);
    const rQty = Math.max(0, Number(recQtyStr) || 0);
    if (!p || rQty <= 0) return;
    s.receivePart(p.id, rQty);
    showSaved(`Added ${rQty} ${p.unit} of ${p.name} into the store`, {
      detail: `Now ${p.onHand + rQty} ${p.unit} in stock.`,
    });
    setRecQtyStr('5');
  };

  const issues = useMemo(
    () =>
      s.partIssues
        .filter((i) => i.siteId === site.id)
        .sort((a, b) => b.at.localeCompare(a.at)),
    [s.partIssues, site.id],
  );

  return (
    <div className="flex flex-col gap-5 max-w-[820px] mx-auto">
      <SavedBanner info={saved} onDismiss={clearSaved} />

      {/* Top header */}
      <div className="paper-sheet p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="t-sm font-semibold text-[var(--text-2)]">
            {site.name} · {role === 'storekeeper' ? 'Storekeeper' : 'Mechanic'}
          </div>
          <h1 className="t-title text-[var(--text)] mt-0.5">
            {en.spares.title}
          </h1>
          <p className="t-base text-[var(--text-2)] mt-0.5">
            {en.spares.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode('take')}
            className={cn(
              'ctl-sm px-4 rounded-[8px] border font-bold t-sm inline-flex items-center gap-1.5',
              mode === 'take'
                ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                : 'bg-[var(--surface)] border-[var(--line-2)] text-[var(--text)]',
            )}
          >
            <Wrench className="size-4" /> Take a spare part
          </button>
          <button
            type="button"
            onClick={() => setMode('receive')}
            className={cn(
              'ctl-sm px-4 rounded-[8px] border font-bold t-sm inline-flex items-center gap-1.5',
              mode === 'receive'
                ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                : 'bg-[var(--surface)] border-[var(--line-2)] text-[var(--text)]',
            )}
          >
            <PackagePlus className="size-4" /> Put new parts in store
          </button>
        </div>
      </div>

      {mode === 'receive' ? (
        <PaperSheet
          title="Put new spare parts into the store"
          subtitle="Pick the spare part that arrived and enter how many you are putting on the shelf."
          footer={
            <div className="flex items-center justify-end">
              <button
                type="button"
                disabled={!recPartId || !(Number(recQtyStr) > 0)}
                onClick={handleReceivePart}
                className="ctl-lg px-6 rounded-[8px] bg-[var(--ok)] text-white font-bold t-lg inline-flex items-center gap-2"
              >
                <PackagePlus className="size-5" />
                <span>Save new parts into store</span>
              </button>
            </div>
          }
        >
          <div className="grid gap-6 lg:grid-cols-2 items-start">
            <div className="flex flex-col gap-2">
              <div className="t-base font-bold text-[var(--text)] mb-1">
                1. Which part arrived?
              </div>
              {parts.map((p) => (
                <ChoiceButton
                  key={p.id}
                  selected={recPartId === p.id}
                  title={p.name}
                  subtitle={`${p.onHand} ${p.unit} in store right now`}
                  onClick={() => setRecPartId(p.id)}
                />
              ))}
            </div>
            <LargeKeypad
              value={recQtyStr}
              onChange={setRecQtyStr}
              label="2. How many arrived?"
              presets={[
                { label: '2', value: 2 },
                { label: '5', value: 5 },
                { label: '10', value: 10 },
                { label: '20', value: 20 },
              ]}
            />
          </div>
        </PaperSheet>
      ) : (
        <>
          {/* ================================================================
           * STEP 1 OF 3: WHICH PART & HOW MANY?
           * ================================================================ */}
          {step === 1 && (
            <StepWizard
              step={1}
              totalSteps={3}
              title={`1. ${en.spares.whichPart} & ${en.spares.howMany}`}
              subtitle="Tap the spare part you need and pick how many."
              canNext={
                Boolean(chosenPart) &&
                qty > 0 &&
                qty <= (chosenPart?.onHand ?? 0)
              }
              nextHint={
                chosenPart && qty > chosenPart.onHand
                  ? `Only ${chosenPart.onHand} ${chosenPart.unit} available in the store.`
                  : 'Pick a spare part with stock on hand and enter how many.'
              }
              onNext={() => setStep(2)}
            >
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
                <div>
                  <div className="t-base font-bold text-[var(--text)] mb-2">
                    {en.spares.whichPart}
                  </div>
                  <div className="flex flex-col gap-2">
                    {parts.map((p) => {
                      const low = p.onHand < p.minLevel;
                      return (
                        <ChoiceButton
                          key={p.id}
                          selected={partId === p.id}
                          disabled={p.onHand === 0}
                          title={p.name}
                          subtitle={`${p.onHand} ${p.unit} in store · ${fmtUGX(p.unitCost)} each`}
                          badge={
                            p.onHand === 0 ? (
                              <span className="px-2.5 py-1 rounded-[6px] bg-[var(--bad-bg)] text-[var(--bad)] t-xs font-bold">
                                Empty
                              </span>
                            ) : low ? (
                              <span className="px-2.5 py-1 rounded-[6px] bg-[var(--warn-bg)] text-[var(--warn)] t-xs font-bold">
                                Low stock
                              </span>
                            ) : undefined
                          }
                          onClick={() => setPartId(p.id)}
                        />
                      );
                    })}
                  </div>
                </div>

                <div>
                  <LargeKeypad
                    value={qtyStr}
                    onChange={setQtyStr}
                    unit={chosenPart?.unit ?? 'pcs'}
                    label={en.spares.howMany}
                    presets={[
                      { label: '1', value: 1 },
                      { label: '2', value: 2 },
                      { label: '3', value: 3 },
                      { label: '4', value: 4 },
                    ]}
                  />
                </div>
              </div>
            </StepWizard>
          )}

          {/* ================================================================
           * STEP 2 OF 3: FOR WHICH MACHINE & WHO IS TAKING IT?
           * ================================================================ */}
          {step === 2 && chosenPart && (
            <StepWizard
              step={2}
              totalSteps={3}
              title={`2. ${en.spares.forWhichMachine} & ${en.spares.whoIsTaking}`}
              subtitle="Pick the machine this part will fix and the mechanic taking it."
              summaryStrip={
                <span>
                  Part: <b>{chosenPart.name}</b> · Quantity:{' '}
                  <b className="num">
                    {qty} {chosenPart.unit}
                  </b>
                </span>
              }
              canNext={Boolean(chosenMachine && chosenMechanic)}
              nextHint="Pick both the machine and the mechanic."
              onBack={() => setStep(1)}
              onNext={() => {
                setPinError(null);
                setStep(3);
              }}
            >
              <div className="grid gap-6 lg:grid-cols-2 items-start">
                <div>
                  <div className="t-base font-bold text-[var(--text)] mb-2">
                    {en.spares.forWhichMachine}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {machines.map((m) => (
                      <ChoiceButton
                        key={m.id}
                        selected={machineId === m.id}
                        title={m.code}
                        subtitle={m.kind}
                        badge={
                          m.status === 'down' ? (
                            <span className="px-2 py-0.5 rounded-[5px] bg-[var(--bad-bg)] text-[var(--bad)] t-xs font-bold">
                              Broken
                            </span>
                          ) : undefined
                        }
                        onClick={() => setMachineId(m.id)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="t-base font-bold text-[var(--text)] mb-2">
                    {en.spares.whoIsTaking}
                  </div>
                  <div className="flex flex-col gap-2">
                    {mechanics.map((mech) => (
                      <ChoiceButton
                        key={mech.id}
                        selected={mechanicId === mech.id}
                        avatarName={mech.fullName}
                        avatarSeed={mech.avatarSeed}
                        title={mech.fullName}
                        subtitle="Maintenance Mechanic"
                        onClick={() => setMechanicId(mech.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </StepWizard>
          )}

          {/* ================================================================
           * STEP 3 OF 3: MECHANIC PIN TO UNLOCK THE SPARE PART
           * ================================================================ */}
          {step === 3 && chosenPart && chosenMachine && chosenMechanic && (
            <StepWizard
              step={3}
              totalSteps={3}
              title={`3. ${en.spares.mechanicPin}`}
              subtitle="Enter your 4-digit Mechanic PIN to unlock the store and record the part."
              summaryStrip={
                <span>
                  Part:{' '}
                  <b>
                    {qty} × {chosenPart.name}
                  </b>{' '}
                  · Machine: <b>{chosenMachine.code}</b> · Mechanic:{' '}
                  <b>{chosenMechanic.fullName}</b>
                </span>
              }
              canNext={false}
              onBack={() => setStep(2)}
            >
              <div className="flex flex-col gap-4 max-w-[440px] mx-auto">
                <StatusNotice tone="info" title="Why a PIN is needed">
                  The spare parts room is locked. Only a Mechanic can unlock a
                  part with their 4-digit PIN (demo PIN:{' '}
                  <b className="code">1357</b>).
                </StatusNotice>

                <div className="rounded-[10px] border border-[var(--line-2)] bg-[var(--surface-2)] p-4">
                  <PinPad
                    onSubmit={handlePinSubmit}
                    title={`${chosenMechanic.fullName} · Enter PIN (1357)`}
                    error={pinError}
                  />
                </div>
              </div>
            </StepWizard>
          )}
        </>
      )}

      {/* Paper Spare Parts Log */}
      <PaperSheet
        title="Spare Parts Book (Recent Parts Taken)"
        subtitle="Every spare part taken is written down against a machine and a mechanic."
        pad={false}
      >
        {issues.length === 0 ? (
          <div className="p-5 t-base text-[var(--text-2)]">
            No spare parts taken yet.
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {issues.slice(0, 8).map((iss) => {
              const p = s.parts.find((x) => x.id === iss.partId);
              const m = s.machines.find((x) => x.id === iss.machineId);
              const who = s.people.find((x) => x.id === iss.mechanicId);
              return (
                <div
                  key={iss.id}
                  className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      name={who?.fullName ?? 'Mechanic'}
                      seed={who?.avatarSeed}
                      size={36}
                    />
                    <div>
                      <div className="t-base font-bold text-[var(--text)]">
                        {iss.qty} × {p?.name ?? 'Part'} →{' '}
                        <span className="text-[var(--brand)]">
                          {m?.code ?? 'Machine'}
                        </span>
                      </div>
                      <div className="t-xs text-[var(--text-2)] num">
                        Taken by {who?.fullName ?? 'Mechanic'} ·{' '}
                        {fmtDateTime(iss.at)}
                      </div>
                    </div>
                  </div>
                  <span className="num t-base font-bold text-[var(--text-2)]">
                    {fmtUGX(iss.qty * (p?.unitCost ?? 0))}
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
