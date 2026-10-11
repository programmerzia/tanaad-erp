import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Check, Settings2, type LucideIcon } from 'lucide-react';
import { Bar, Button, Empty, Kbd, cn, useHotkey, useIsTouch, useMedia, type Tone } from '@/components/ui';
import { useGo } from '@/app/hooks';

/** Production helpers shared with the mats screens (one implementation of the shift context, the production upsert and the print run). */
export { PrintRun, addProduction, useShift } from '../mats/kit';

/**
 * Shown where a master-data list or a product kind has nothing in it yet: says what is missing and where the client adds it.
 * Screens never fall back to a built-in list.
 */
export function SettingsEmpty({ what, where = 'Master data', icon = Settings2, className }: { what: string; where?: string; icon?: LucideIcon; className?: string }) {
  const go = useGo();
  return <div className={className}><Empty icon={icon} title={`No ${what} yet`} hint={`Add ${what} in Settings → ${where}. They appear here straight away.`} action={<Button size="sm" icon={Settings2} onClick={() => go.site('settings')}>Open Settings</Button>} /></div>;
}
/** Short machine name for chips and stickers: drops the first word when every machine of the group shares it ("Extruder A" → "A"). */
export function shortCode(code: string, all: { code: string }[]) {
  const first = code.split(' ')[0];
  return all.length > 1 && code.includes(' ') && all.every((m) => m.code.split(' ')[0] === first) ? code.slice(first.length + 1) : code;
}

/* ───────────────────────────── Workstation layout ───────────────────────────── */
/**
 * Form on the left, live preview and today's log on the right. Same idea as <Split>, but it only goes side by side from 1280 px:
 * a 1024 px floor tablet keeps the sidebar, which leaves too little room for a form next to a preview.
 * Below that the aside drops under the form and flows in two columns.
 */
export function Workbench({ children, aside, asideWidth = 400 }: { children: ReactNode; aside: ReactNode; asideWidth?: number }) {
  return (
    <div className="grid gap-[var(--gap)] items-start xl:[grid-template-columns:minmax(0,1fr)_var(--aside)]" style={{ ['--aside' as string]: `${asideWidth}px` }}>
      <div className="min-w-0 flex flex-col gap-[var(--gap)]">{children}</div>
      <aside className="min-w-0 grid gap-[var(--gap)] items-start md:grid-cols-2 xl:grid-cols-1">{aside}</aside>
    </div>
  );
}
/** Put on an aside block that should keep the full width when the aside flows in two columns. */
export const WIDE = 'md:col-span-2 xl:col-span-1';

/* ───────────────────────────── Numbered form parts ───────────────────────────── */
/** Step marker: the number of the field, or a tick once it is filled in. */
export function StepDot({ n, done }: { n: number; done?: boolean }) {
  return (
    <span aria-hidden className={cn('size-5 rounded-md grid place-items-center t-xs font-semibold num shrink-0 transition-colors', done ? 'bg-[var(--ok-bg)] text-[var(--ok)]' : 'bg-[var(--surface-3)] text-[var(--text-2)]')}>
      {done ? <Check className="size-3" strokeWidth={3} /> : n}
    </span>
  );
}
/** Label for a numbered <FormRow>. */
export function Step({ n, done, children }: { n: number; done?: boolean; children: ReactNode }) {
  return <span className="inline-flex items-center gap-2"><StepDot n={n} done={done} />{children}</span>;
}
/** A numbered section of a workstation form: header with step, title, hint and tools, then the fields. */
export function FormSection({ n, done, title, hint, right, children, className }: { n: number; done?: boolean; title: ReactNode; hint?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('px-[var(--pad)] py-3 border-b border-[var(--line)] last:border-b-0', className)}>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mb-2 min-h-[var(--ctl-h-sm)]">
        <StepDot n={n} done={done} />
        <h4 className="t-base font-semibold whitespace-nowrap">{title}</h4>
        {hint && <span className="t-sm text-[var(--text-3)] min-w-0 truncate">{hint}</span>}
        {right && <div className="ml-auto flex items-center gap-1.5 min-w-0">{right}</div>}
      </header>
      {children}
    </section>
  );
}

/* ───────────────────────────── Live arithmetic ───────────────────────────── */
export interface CalcTerm { op?: '+' | '−' | '×' | '='; label: ReactNode; value: ReactNode; unit?: ReactNode; sub?: ReactNode; result?: boolean; tone?: Tone }
const toneText: Partial<Record<Tone, string>> = { ok: 'text-[var(--ok)]', warn: 'text-[var(--warn)]', bad: 'text-[var(--bad)]' };
/** A sum laid out as a sum: terms joined by their operators, the result set apart on the right. Wraps on narrow screens. */
export function Calc({ terms, className }: { terms: CalcTerm[]; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-[var(--line)] bg-[var(--surface-2)] flex flex-wrap items-stretch overflow-hidden', className)} role="group" aria-label="Calculation">
      {terms.map((t, i) => (
        <div key={i} className={cn('flex items-center min-w-0', t.result && 'flex-1 justify-between bg-[var(--surface)] border-l border-[var(--line)]')}>
          {t.op && <span aria-hidden className="w-5 text-center t-title font-normal text-[var(--text-3)] select-none shrink-0">{t.op}</span>}
          <div className={cn('py-2 min-w-0', t.op ? 'pl-1.5 pr-3' : 'px-3', t.result && 'text-right ml-auto')}>
            <div className="t-xs text-[var(--text-3)] whitespace-nowrap">{t.label}</div>
            <div className={cn('num whitespace-nowrap font-semibold', t.result ? 't-kpi' : 't-lg', t.tone && toneText[t.tone])}>{t.value}{t.unit && <span className="t-sm font-medium text-[var(--text-3)] ml-1">{t.unit}</span>}</div>
            {t.sub && <div className="t-xs text-[var(--text-3)] whitespace-nowrap">{t.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────────── Table marks ───────────────────────────── */
/** Right-aligned number with a thin bar in front of it: the house way to compare rows in a column. */
export function BarCell({ value, max, display, tone = 'series', width = 64 }: { value: number; max: number; display: ReactNode; tone?: Tone | 'series'; width?: number }) {
  return <span className="inline-flex items-center justify-end gap-2 align-middle"><span className="shrink-0" style={{ width }}><Bar value={value} max={max || 1} tone={tone} height={5} /></span><span className="num font-medium text-right shrink-0" style={{ minWidth: 44 }}>{display}</span></span>;
}
export function Swatch({ colour, className }: { colour?: string; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-2.5 rounded-[3px] border border-black/10 shrink-0', className)} style={{ background: colour ?? 'var(--text-4)' }} />;
}
export const dash = <span className="text-[var(--text-4)]">—</span>;

/* ───────────────────────────── Keyboard helpers ───────────────────────────── */
/** Focus the first field of a form: on arrival (desktop only) and again after each save. */
export function useFirstField<T extends HTMLElement>() {
  const ref = useRef<T>(null); const touch = useIsTouch();
  const focus = useCallback(() => { requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"],input:not([disabled])')?.focus()); }, []);
  useEffect(() => { if (!touch) focus(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return [ref, focus] as const;
}
/**
 * Drives the shared ScaleWidget from the keyboard without changing it: W reads the scale, W again takes the stable reading.
 * Wrap the widget in <ScaleBay innerRef={ref}>.
 */
export function useScaleKey(ref: RefObject<HTMLElement | null>, enabled = true) {
  useHotkey('w', () => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])].filter((b) => !b.disabled);
    (buttons.find((b) => /^Use\b/.test(b.textContent ?? '')) ?? buttons.find((b) => /^Read\b/.test(b.textContent ?? '')))?.click();
  }, { label: 'Read the scale, then take the reading', enabled });
}
/** The widget's header is tight on a phone: use the short title there. */
export function useScaleTitle(full: string) { return useMedia('(max-width: 480px)') ? 'Scale' : full; }
/** Seats the scale widget inside a form panel (no second shadow) and shows the keyboard hint under it. */
export function ScaleBay({ innerRef, children, note }: { innerRef: RefObject<HTMLDivElement | null>; children: ReactNode; note?: ReactNode }) {
  return (
    <div ref={innerRef} className="[&>.surface]:shadow-none max-sm:[&>.surface]:border-0 max-sm:[&>.surface]:p-0">
      {children}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-1.5 t-xs text-[var(--text-3)]">
        <span className="min-w-0">{note}</span>
        <span className="touch:hidden inline-flex items-center gap-1 whitespace-nowrap"><Kbd keys="w" /> read the scale, <Kbd keys="w" /> again to take the reading</span>
      </div>
    </div>
  );
}
