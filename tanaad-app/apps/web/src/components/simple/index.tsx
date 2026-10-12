import { useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Delete,
  Info,
  Lock,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import { Avatar, cn } from '@/components/ui';
import { en } from '@/i18n/en';

/* ============================================================================
 * 1. PaperSheet — Mirrors a physical paper form or clipboard page
 * ========================================================================== */
export function PaperSheet({
  title,
  subtitle,
  badge,
  footer,
  children,
  className,
  pad = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={cn('paper-sheet overflow-hidden', className)}>
      {(title || subtitle || badge) && (
        <header className="px-5 py-4 border-b border-[var(--line)] bg-[var(--surface-2)] flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="t-lg font-bold text-[var(--text)] leading-snug">{title}</h2>}
            {subtitle && <p className="t-sm text-[var(--text-2)] mt-0.5">{subtitle}</p>}
          </div>
          {badge && <div className="shrink-0 flex items-center gap-2">{badge}</div>}
        </header>
      )}
      <div className={cn(pad && 'p-5')}>{children}</div>
      {footer && (
        <footer className="px-5 py-4 border-t border-[var(--line)] bg-[var(--surface-2)]">
          {footer}
        </footer>
      )}
    </section>
  );
}

/* ============================================================================
 * 2. TaskRow — Home screen to-do list item (plain sentence + done/not done)
 * ========================================================================== */
export type TaskState = 'done' | 'attention' | 'todo';

export function TaskRow({
  index,
  icon: Icon,
  title,
  description,
  statusText,
  state = 'todo',
  onClick,
}: {
  index?: number;
  icon?: LucideIcon;
  title: string;
  description: string;
  statusText: string;
  state?: TaskState;
  onClick: () => void;
}) {
  const isDone = state === 'done';
  const isWarn = state === 'attention';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-[10px] border px-5 py-4 min-h-[76px] flex items-center justify-between gap-4 transition-colors',
        'bg-[var(--surface)] hover:bg-[var(--hover)] active:bg-[var(--surface-2)] shadow-[var(--shadow-card)]',
        isDone
          ? 'border-[color-mix(in_srgb,var(--ok)_40%,var(--line))]'
          : isWarn
            ? 'border-[color-mix(in_srgb,var(--warn)_50%,var(--line))]'
            : 'border-[var(--line-2)]',
      )}
    >
      <div className="flex items-start gap-4 min-w-0 flex-1">
        <span
          className={cn(
            'size-12 rounded-[8px] grid place-items-center shrink-0 font-bold t-lg num border',
            isDone
              ? 'bg-[var(--ok-bg)] text-[var(--ok)] border-[color-mix(in_srgb,var(--ok)_30%,transparent)]'
              : isWarn
                ? 'bg-[var(--warn-bg)] text-[var(--warn)] border-[color-mix(in_srgb,var(--warn)_30%,transparent)]'
                : 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--line)]',
          )}
        >
          {isDone ? (
            <Check className="size-6 stroke-[2.5]" />
          ) : Icon ? (
            <Icon className="size-6" />
          ) : (
            index ?? '•'
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="t-lg font-bold text-[var(--text)] leading-snug">{title}</div>
          <div className="t-base text-[var(--text-2)] mt-0.5 leading-snug">{description}</div>
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-3">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] t-sm font-semibold whitespace-nowrap border',
            isDone
              ? 'bg-[var(--ok-bg)] text-[var(--ok)] border-[color-mix(in_srgb,var(--ok)_30%,transparent)]'
              : isWarn
                ? 'bg-[var(--warn-bg)] text-[var(--warn)] border-[color-mix(in_srgb,var(--warn)_35%,transparent)]'
                : 'bg-[var(--surface-2)] text-[var(--text-2)] border-[var(--line)]',
          )}
        >
          {isDone && <Check className="size-4 stroke-[2.5]" />}
          {statusText}
        </span>
        <span className="size-10 rounded-[8px] bg-[var(--surface-2)] border border-[var(--line)] grid place-items-center text-[var(--text)]">
          <ArrowRight className="size-5" />
        </span>
      </div>
    </button>
  );
}

/* ============================================================================
 * 3. StepWizard — One step at a time with "Step X of Y", "Back" and "Next"
 * ========================================================================== */
export function StepWizard({
  step,
  totalSteps,
  title,
  subtitle,
  canNext = true,
  nextHint,
  nextLabel,
  onBack,
  onNext,
  isFinalStep = false,
  finalTone = 'primary',
  summaryStrip,
  children,
}: {
  step: number;
  totalSteps: number;
  title: ReactNode;
  subtitle?: ReactNode;
  canNext?: boolean;
  /** Plain sentence explaining what to pick before Next unlocks (Principle 8) */
  nextHint?: string;
  nextLabel?: string;
  onBack?: () => void;
  onNext?: () => void;
  isFinalStep?: boolean;
  finalTone?: 'primary' | 'ok' | 'danger' | 'bad';
  /** Optional summary of previous steps shown calmly at the top */
  summaryStrip?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="paper-sheet overflow-hidden">
      {/* Step progress header */}
      <div className="px-5 py-4 bg-[var(--surface-2)] border-b border-[var(--line)]">
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="inline-flex items-center px-3 py-1 rounded-[6px] bg-[var(--brand)] text-white t-sm font-bold num">
            {en.app.stepOf(step, totalSteps)}
          </span>
          <div className="flex items-center gap-1.5 flex-1 max-w-[240px]">
            {Array.from({ length: totalSteps }, (_, i) => (
              <span
                key={i}
                className={cn(
                  'h-2.5 flex-1 rounded-full transition-colors',
                  i + 1 < step
                    ? 'bg-[var(--ok)]'
                    : i + 1 === step
                      ? 'bg-[var(--brand)]'
                      : 'bg-[var(--line-2)]',
                )}
              />
            ))}
          </div>
        </div>
        <h2 className="t-title text-[var(--text)] mt-1">{title}</h2>
        {subtitle && <p className="t-base text-[var(--text-2)] mt-1">{subtitle}</p>}
        {summaryStrip && (
          <div className="mt-3 pt-3 border-t border-[var(--line)] flex flex-wrap items-center gap-2 t-sm text-[var(--text-2)]">
            {summaryStrip}
          </div>
        )}
      </div>

      {/* Step body */}
      <div className="p-5">{children}</div>

      {/* Step footer: forgiving guidance + Back / Next */}
      <div className="px-5 py-4 bg-[var(--surface-2)] border-t border-[var(--line)] flex flex-col gap-3">
        {!canNext && nextHint && (
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-[8px] bg-[var(--warn-bg)] border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] text-[var(--warn)] t-base font-medium">
            <Info className="size-5 shrink-0" />
            <span>{nextHint}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          {step > 1 && onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="ctl-lg px-5 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] text-[var(--text)] font-semibold t-base inline-flex items-center gap-2"
            >
              <ArrowLeft className="size-5" />
              <span>{en.app.back}</span>
            </button>
          ) : (
            <div />
          )}

          {onNext && (
            <button
              type="button"
              disabled={!canNext}
              onClick={onNext}
              className={cn(
                'ctl-lg px-6 rounded-[8px] font-bold t-lg inline-flex items-center justify-center gap-2.5 transition-colors min-w-[200px]',
                !canNext
                  ? 'bg-[var(--surface-3)] text-[var(--text-4)] border border-[var(--line)] cursor-not-allowed'
                  : isFinalStep && finalTone === 'ok'
                    ? 'bg-[var(--ok)] text-white hover:opacity-95 shadow-[var(--shadow-card)]'
                    : isFinalStep && (finalTone === 'danger' || finalTone === 'bad')
                      ? 'bg-[var(--bad)] text-white hover:opacity-95 shadow-[var(--shadow-card)]'
                      : 'bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] shadow-[var(--shadow-card)]',
              )}
            >
              {isFinalStep ? (
                <>
                  <Check className="size-5 stroke-[2.5]" />
                  <span>{nextLabel ?? en.common.save}</span>
                </>
              ) : (
                <>
                  <span>{nextLabel ?? en.app.next}</span>
                  <ArrowRight className="size-5" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 4. ChoiceButton & ChoiceGrid — Pick, do not type (photo, colour, label)
 * ========================================================================== */
export function ChoiceButton({
  selected,
  onClick,
  disabled,
  title,
  subtitle,
  right,
  badge,
  avatarName,
  avatarSeed,
  colourSwatch,
  icon: Icon,
  tone = 'default',
  className,
}: {
  selected?: boolean;
  onClick: () => void;
  disabled?: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  badge?: ReactNode;
  avatarName?: string;
  avatarSeed?: string;
  colourSwatch?: string;
  icon?: LucideIcon | ReactNode;
  tone?: 'default' | 'ok' | 'warn' | 'bad';
  className?: string;
}) {
  const renderIcon = () => {
    if (!Icon) return null;
    if (typeof Icon === 'function') {
      const IconComp = Icon as LucideIcon;
      return <IconComp className="size-5" />;
    }
    return Icon;
  };

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-[8px] border px-4 py-3 min-h-[58px] flex items-center justify-between gap-3 transition-colors',
        disabled && 'opacity-45 cursor-not-allowed bg-[var(--surface-2)]',
        selected
          ? tone === 'bad'
            ? 'bg-[var(--bad-bg)] border-[var(--bad)] text-[var(--bad)] ring-2 ring-[var(--bad)]/25'
            : tone === 'warn'
              ? 'bg-[var(--warn-bg)] border-[var(--warn)] text-[var(--warn)] ring-2 ring-[var(--warn)]/25'
              : 'bg-[var(--ok-bg)] border-[var(--ok)] text-[var(--text)] ring-2 ring-[var(--ok)]/25'
          : 'bg-[var(--surface)] border-[var(--line-2)] hover:bg-[var(--hover)] text-[var(--text)]',
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {avatarName && (
          <Avatar name={avatarName} seed={avatarSeed} size={40} ring={selected ? 'ok' : undefined} />
        )}
        {colourSwatch && (
          <span
            className="size-7 rounded-[6px] border border-black/15 shrink-0"
            style={{ background: colourSwatch }}
          />
        )}
        {Icon && (
          <span
            className={cn(
              'size-10 rounded-[8px] grid place-items-center shrink-0',
              selected ? 'bg-[var(--ok)] text-white' : 'bg-[var(--surface-2)] text-[var(--text-2)]',
            )}
          >
            {renderIcon()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="t-base font-bold leading-snug truncate">{title}</div>
          {subtitle && <div className="t-sm text-[var(--text-2)] mt-0.5 truncate">{subtitle}</div>}
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2">
        {badge}
        {right}
        <span
          className={cn(
            'size-7 rounded-full border grid place-items-center shrink-0',
            selected
              ? tone === 'bad'
                ? 'bg-[var(--bad)] border-[var(--bad)] text-white'
                : tone === 'warn'
                  ? 'bg-[var(--warn)] border-[var(--warn)] text-white'
                  : 'bg-[var(--ok)] border-[var(--ok)] text-white'
              : 'border-[var(--line-2)] bg-[var(--surface-2)] text-transparent',
          )}
        >
          <Check className="size-4 stroke-[3]" />
        </span>
      </div>
    </button>
  );
}

/* ============================================================================
 * 5. LargeKeypad — Touch-first number entry with preset chips
 * ========================================================================== */
export function LargeKeypad({
  value,
  onChange,
  unit,
  label,
  presets,
  allowDecimal = false,
  max = 999999999,
}: {
  value: string;
  onChange: (next: string) => void;
  unit?: string;
  label?: string;
  presets?: { label: string; value: number }[];
  allowDecimal?: boolean;
  max?: number;
}) {
  const push = (digit: string) => {
    if (digit === '.' && (!allowDecimal || value.includes('.'))) return;
    const raw = value === '0' && digit !== '.' ? digit : value + digit;
    const num = Number(raw);
    if (!Number.isNaN(num) && num <= max) onChange(raw);
  };
  const back = () => onChange(value.slice(0, -1));
  const clear = () => onChange('');

  const displayNum = value
    ? allowDecimal && value.endsWith('.')
      ? `${Number(value.slice(0, -1)).toLocaleString('en-UG')}.`
      : Number(value).toLocaleString('en-UG')
    : '0';

  return (
    <div className="rounded-[10px] border border-[var(--line-2)] bg-[var(--surface)] p-4 max-w-[440px]">
      {label && <div className="t-sm font-semibold text-[var(--text-2)] mb-1.5">{label}</div>}
      {/* Number readout */}
      <div className="rounded-[8px] border border-[var(--line-2)] bg-[var(--surface-2)] px-4 py-3 mb-3 flex items-baseline justify-between gap-3">
        <span
          className={cn(
            't-hero num tracking-tight',
            value ? 'text-[var(--text)]' : 'text-[var(--text-4)]',
          )}
        >
          {displayNum}
        </span>
        {unit && <span className="t-lg font-semibold text-[var(--text-2)]">{unit}</span>}
      </div>

      {/* Optional quick presets from master data */}
      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {presets.map((p) => (
            <button
              key={p.label + p.value}
              type="button"
              onClick={() => onChange(String(p.value))}
              className={cn(
                'ctl-sm px-3.5 rounded-[8px] border t-sm font-semibold num transition-colors',
                Number(value) === p.value && value !== ''
                  ? 'bg-[var(--ok-bg)] border-[var(--ok)] text-[var(--ok)]'
                  : 'bg-[var(--surface-2)] border-[var(--line-2)] text-[var(--text)] hover:bg-[var(--hover)]',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* 3x4 large keypad buttons */}
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => push(d)}
            className="h-[56px] rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] active:bg-[var(--surface-2)] t-title num font-bold text-[var(--text)]"
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={allowDecimal ? () => push('.') : clear}
          className="h-[56px] rounded-[8px] border border-[var(--line-2)] bg-[var(--surface-2)] hover:bg-[var(--hover)] t-base font-semibold text-[var(--text-2)]"
        >
          {allowDecimal ? '.' : 'Clear'}
        </button>
        <button
          type="button"
          onClick={() => push('0')}
          className="h-[56px] rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] active:bg-[var(--surface-2)] t-title num font-bold text-[var(--text)]"
        >
          0
        </button>
        <button
          type="button"
          onClick={back}
          aria-label="Backspace"
          className="h-[56px] rounded-[8px] border border-[var(--line-2)] bg-[var(--surface-2)] hover:bg-[var(--hover)] grid place-items-center text-[var(--text)]"
        >
          <Delete className="size-6" />
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
 * 6. SavedBanner & useSavedBanner — Clear "Saved" with a tick + visible Undo
 * ========================================================================== */
export interface SavedInfo {
  message: string;
  detail?: string;
  onUndo?: () => void;
}

export function useSavedBanner() {
  const [saved, setSaved] = useState<SavedInfo | null>(null);
  const showSaved = (message: string, opts?: { detail?: string; onUndo?: () => void }) => {
    setSaved({ message, detail: opts?.detail, onUndo: opts?.onUndo });
  };
  const clearSaved = () => setSaved(null);
  return { saved, showSaved, clearSaved };
}

export function SavedBanner({
  info,
  onUndoDone,
  onDismiss,
  className,
}: {
  info: SavedInfo | null;
  onUndoDone?: () => void;
  onDismiss?: () => void;
  className?: string;
}) {
  const [undone, setUndone] = useState(false);
  if (!info) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'anim-up rounded-[10px] border-2 border-[var(--ok)] bg-[var(--ok-bg)] px-4 py-3 flex flex-wrap items-center justify-between gap-3',
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="size-9 rounded-full bg-[var(--ok)] text-white grid place-items-center shrink-0">
          <CheckCircle2 className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="t-base font-bold text-[var(--ok)]">
            {undone ? en.app.undone : `${en.app.saved} · ${info.message}`}
          </div>
          {!undone && info.detail && (
            <div className="t-sm text-[var(--text-2)]">{info.detail}</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {!undone && info.onUndo && (
          <button
            type="button"
            onClick={() => {
              info.onUndo?.();
              setUndone(true);
              onUndoDone?.();
            }}
            className="ctl-sm px-4 rounded-[8px] border border-[var(--ok)] bg-[var(--surface)] hover:bg-[var(--hover)] text-[var(--ok)] font-bold t-sm inline-flex items-center gap-2"
          >
            <RotateCcw className="size-4" />
            <span>{en.app.undo}</span>
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={() => {
              setUndone(false);
              onDismiss();
            }}
            className="ctl-sm px-3 rounded-[8px] text-[var(--text-2)] hover:bg-black/5 t-sm font-medium"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
 * 7. StatusNotice — Forgiving guidance (Principle 8) & 1-sentence block (Principle 9)
 * ========================================================================== */
export function StatusNotice({
  tone = 'guide',
  title,
  children,
  action,
  className,
}: {
  tone?: 'guide' | 'ok' | 'warn' | 'block' | 'info' | 'bad';
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon =
    tone === 'block' || tone === 'bad'
      ? Lock
      : tone === 'warn'
        ? AlertTriangle
        : tone === 'ok'
          ? CheckCircle2
          : Info;

  return (
    <div
      className={cn(
        'rounded-[10px] border px-4 py-3.5 flex flex-wrap items-center justify-between gap-3',
        tone === 'block' || tone === 'bad'
          ? 'bg-[var(--bad-bg)] border-[color-mix(in_srgb,var(--bad)_45%,transparent)] text-[var(--bad)]'
          : tone === 'warn'
            ? 'bg-[var(--warn-bg)] border-[color-mix(in_srgb,var(--warn)_45%,transparent)] text-[var(--warn)]'
            : tone === 'ok'
              ? 'bg-[var(--ok-bg)] border-[color-mix(in_srgb,var(--ok)_45%,transparent)] text-[var(--ok)]'
              : 'bg-[var(--surface-2)] border-[var(--line-2)] text-[var(--text)]',
        className,
      )}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <Icon className="size-5 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          {title && <div className="t-base font-bold leading-snug">{title}</div>}
          <div className={cn('t-base leading-snug', title && 'mt-0.5 text-[var(--text)]')}>
            {children}
          </div>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ============================================================================
 * SummaryCard — Plain number with one short sentence under it (Site Manager & CEO)
 * ========================================================================== */
export function SummaryCard({
  label,
  value,
  sentence,
  tone = 'neutral',
  onClick,
}: {
  label: string;
  value: ReactNode;
  sentence: ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'bad';
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'paper-sheet p-4 text-left flex flex-col justify-between gap-1.5 min-h-[112px]',
        onClick && 'hover:bg-[var(--hover)] transition-colors cursor-pointer',
        tone === 'bad' && 'border-[var(--bad)] bg-[var(--bad-bg)]/40',
        tone === 'warn' && 'border-[var(--warn)] bg-[var(--warn-bg)]/40',
        tone === 'ok' && 'border-[color-mix(in_srgb,var(--ok)_40%,var(--line))]',
      )}
    >
      <div className="t-sm font-semibold text-[var(--text-2)]">{label}</div>
      <div
        className={cn(
          't-kpi num',
          tone === 'bad'
            ? 'text-[var(--bad)]'
            : tone === 'warn'
              ? 'text-[var(--warn)]'
              : tone === 'ok'
                ? 'text-[var(--ok)]'
                : 'text-[var(--text)]',
        )}
      >
        {value}
      </div>
      <div className="t-sm text-[var(--text-2)] leading-snug">{sentence}</div>
    </Tag>
  );
}
