import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Wrench } from 'lucide-react';
import { useStore } from '@/data/store';
import { useRefList, useSite } from '@/app/hooks';
import { machinesOf } from '@/data/selectors';
import { fmtDateTime } from '@/data/format';
import { Input, useNow } from '@/components/ui';
import {
  ChoiceButton,
  PaperSheet,
  SavedBanner,
  StatusNotice,
  StepWizard,
  useSavedBanner,
} from '@/components/simple';
import { en } from '@/i18n/en';
import { fmtHours, hoursBetween } from './shared';

/**
 * Mechanic · Report a broken machine:
 * - Shows any machine currently stopped with a 1-tap "Fixed · mark machine running again" button
 * - 2-step wizard to report a broken machine (1. Which machine stopped? 2. What went wrong?)
 */
export function Maintenance() {
  const s = useStore();
  const site = useSite();
  const now = useNow(15000);
  const causes = useRefList('breakdown_cause');
  const { saved, showSaved, clearSaved } = useSavedBanner();

  const machines = useMemo(
    () =>
      machinesOf(s, site.id).filter(
        (m) => m.status === 'active' || m.status === 'down',
      ),
    [s, site.id],
  );

  const breakdowns = useMemo(
    () =>
      s.breakdowns
        .filter((b) => b.siteId === site.id)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [s.breakdowns, site.id],
  );
  const openNow = breakdowns.filter((b) => !b.resolvedAt);

  const [step, setStep] = useState<1 | 2>(1);
  const [machineId, setMachineId] = useState<string | null>(
    machines.find((m) => m.status === 'active')?.id ?? null,
  );
  const [causeLabel, setCauseLabel] = useState<string | null>(
    causes[0]?.label ?? null,
  );
  const [otherCause, setOtherCause] = useState('');

  const chosenMachine = machines.find((m) => m.id === machineId);
  const finalCause = otherCause.trim() || causeLabel || '';

  const handleReportDown = () => {
    if (!chosenMachine || !finalCause) return;
    s.reportBreakdown({
      siteId: site.id,
      machineId: chosenMachine.id,
      cause: finalCause,
    });
    showSaved(`${chosenMachine.code} reported broken`, {
      detail: `Cause: ${finalCause}. Downtime clock has started.`,
    });
    setStep(1);
    setOtherCause('');
  };

  const handleResolve = (breakdownId: string) => {
    const b = breakdowns.find((x) => x.id === breakdownId);
    if (!b) return;
    const code = s.machines.find((m) => m.id === b.machineId)?.code ?? 'Machine';
    s.resolveBreakdown(breakdownId);
    showSaved(`${code} marked fixed and running again ✓`, {
      detail: `Was down for ${fmtHours(hoursBetween(b.startedAt, now))}.`,
    });
  };

  return (
    <div className="flex flex-col gap-5 max-w-[820px] mx-auto">
      <SavedBanner info={saved} onDismiss={clearSaved} />

      <div className="paper-sheet p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="t-sm font-semibold text-[var(--text-2)]">
            {site.name} · Mechanic
          </div>
          <h1 className="t-title text-[var(--text)] mt-0.5">
            {en.maintenance.title}
          </h1>
          <p className="t-base text-[var(--text-2)] mt-0.5">
            {en.maintenance.subtitle}
          </p>
        </div>
        <span className="px-3.5 py-1.5 rounded-[8px] bg-[var(--surface-2)] border border-[var(--line-2)] t-sm font-bold">
          {openNow.length === 0
            ? 'All machines running ✓'
            : `${openNow.length} machine${openNow.length === 1 ? '' : 's'} broken right now`}
        </span>
      </div>

      {/* Machines currently stopped — 1 tap to mark fixed */}
      <PaperSheet
        title="Machines broken right now"
        subtitle="When a machine is repaired, tap the green button to mark it running again."
      >
        {openNow.length === 0 ? (
          <StatusNotice tone="ok" title="Every machine is running">
            No machine is broken right now at {site.name}.
          </StatusNotice>
        ) : (
          <div className="flex flex-col gap-3">
            {openNow.map((b) => {
              const code =
                s.machines.find((m) => m.id === b.machineId)?.code ??
                b.machineId;
              const hours = hoursBetween(b.startedAt, now);
              return (
                <div
                  key={b.id}
                  className="rounded-[10px] border-2 border-[var(--bad)] bg-[var(--bad-bg)]/45 p-4 flex flex-wrap items-center justify-between gap-4"
                >
                  <div>
                    <div className="t-lg font-bold text-[var(--bad)] flex items-center gap-2">
                      <AlertTriangle className="size-5 shrink-0" />
                      <span>{code} · Broken</span>
                    </div>
                    <div className="t-base font-semibold text-[var(--text)] mt-0.5">
                      Reason: {b.cause}
                    </div>
                    <div className="t-sm text-[var(--text-2)] num mt-0.5">
                      Stopped for <b>{fmtHours(hours)}</b> (since{' '}
                      {fmtDateTime(b.startedAt)})
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleResolve(b.id)}
                    className="ctl-lg px-5 rounded-[8px] bg-[var(--ok)] hover:opacity-95 text-white font-bold t-base inline-flex items-center gap-2 shadow-[var(--shadow-card)]"
                  >
                    <CheckCircle2 className="size-5" />
                    <span>{en.maintenance.resolveMachine}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </PaperSheet>

      {/* 2-Step Wizard to report a broken machine */}
      {step === 1 && (
        <StepWizard
          step={1}
          totalSteps={2}
          title={`1. ${en.maintenance.whichMachine}`}
          subtitle="Tap the machine that stopped working."
          canNext={Boolean(chosenMachine && chosenMachine.status !== 'down')}
          nextHint="Pick a running machine to report it broken."
          onNext={() => setStep(2)}
        >
          <div className="grid gap-2.5 sm:grid-cols-3">
            {machines.map((m) => (
              <ChoiceButton
                key={m.id}
                selected={machineId === m.id}
                disabled={m.status === 'down'}
                title={m.code}
                subtitle={m.kind}
                badge={
                  m.status === 'down' ? (
                    <span className="px-2 py-0.5 rounded-[5px] bg-[var(--bad-bg)] text-[var(--bad)] t-xs font-bold">
                      Already down
                    </span>
                  ) : undefined
                }
                onClick={() => setMachineId(m.id)}
              />
            ))}
          </div>
        </StepWizard>
      )}

      {step === 2 && chosenMachine && (
        <StepWizard
          step={2}
          totalSteps={2}
          title={`2. ${en.maintenance.whatWentWrong}`}
          subtitle="Tap what caused the machine to stop (from Settings)."
          summaryStrip={
            <span>
              Machine: <b>{chosenMachine.code}</b>
            </span>
          }
          canNext={finalCause.length > 0}
          nextHint="Tap a reason below."
          nextLabel={en.maintenance.reportDown}
          isFinalStep
          finalTone="bad"
          onBack={() => setStep(1)}
          onNext={handleReportDown}
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {causes.map((c) => (
                <ChoiceButton
                  key={c.id}
                  selected={!otherCause.trim() && causeLabel === c.label}
                  icon={<Wrench className="size-4" />}
                  title={c.label}
                  onClick={() => {
                    setCauseLabel(c.label);
                    setOtherCause('');
                  }}
                />
              ))}
            </div>

            <div className="pt-2 border-t border-[var(--line)]">
              <label className="block t-sm font-bold text-[var(--text-2)] mb-1.5">
                Or write another reason (optional)
              </label>
              <Input
                value={otherCause}
                onChange={(e) => setOtherCause(e.target.value)}
                placeholder="Write what happened..."
                className="!h-[48px] !text-[16px]"
              />
            </div>
          </div>
        </StepWizard>
      )}
    </div>
  );
}
