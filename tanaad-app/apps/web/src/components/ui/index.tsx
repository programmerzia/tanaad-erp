import { clsx } from 'clsx';
import { forwardRef, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, KeyboardEvent as ReactKeyboardEvent, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronRight, Info, Search, X, XCircle, type LucideIcon } from 'lucide-react';
import { initials as initialsOf } from '@/data/format';
import { keyCaps, useHotkey } from '@/app/hotkeys';
import { useIsTouch } from '@/app/prefs';
import { Sparkline } from '@/components/charts';

export const cn = clsx;
export { useHotkey } from '@/app/hotkeys';
export { useDensity, useIsTouch } from '@/app/prefs';

export type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'brand' | 'accent' | 'info';
const toneVar: Record<Tone, string> = { neutral: 'var(--text-2)', ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', brand: 'var(--brand)', accent: 'var(--accent)', info: 'var(--info)' };

/* ───────────────────────────── Kbd ───────────────────────────── */
/** Shortcut hint. Hidden in touch density, where there is no keyboard. */
export function Kbd({ keys, className }: { keys: string; className?: string }) {
  return (
    <span className={cn('touch:hidden inline-flex items-center gap-0.5 select-none', className)} aria-hidden>
      {keyCaps(keys).map((k, i) => (
        <kbd key={i} className="min-w-[18px] h-[18px] px-1 grid place-items-center rounded-[3px] border border-[var(--line-2)] bg-[var(--surface-2)] text-[10.5px] font-medium font-sans text-[var(--text-3)] leading-none">{k}</kbd>
      ))}
    </span>
  );
}

/* ───────────────────────────── Button ───────────────────────────── */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ok' | 'accent' | 'inverse';
type Size = 'sm' | 'md' | 'lg' | 'xl';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  block?: boolean;
  /** Registers this shortcut for as long as the button is mounted and shows the hint. e.g. "n", "mod+enter", "g d". */
  hotkey?: string;
  /** Name shown in the shortcut help. Defaults to the button text. */
  hotkeyLabel?: string;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', icon: Icon, className, children, block, hotkey, hotkeyLabel, disabled, ...rest }, ref) {
  const inner = useRef<HTMLButtonElement | null>(null);
  useHotkey(hotkey, () => inner.current?.click(), { label: hotkeyLabel ?? (typeof children === 'string' ? children : 'Action'), enabled: !disabled, allowInInput: !!hotkey && hotkey.includes('enter') });
  const v: Record<Variant, string> = {
    primary: 'bg-[var(--brand)] text-[var(--brand-contrast)] hover:bg-[var(--brand-hover)] border border-transparent shadow-[inset_0_1px_0_rgb(255_255_255/.14),0_1px_2px_rgb(16_24_40/.22)]',
    accent: 'bg-[var(--accent)] text-white hover:brightness-95 border border-transparent shadow-[inset_0_1px_0_rgb(255_255_255/.22),0_1px_2px_rgb(16_24_40/.2)]',
    secondary: 'bg-[var(--surface)] text-[var(--text)] border border-[var(--line-2)] hover:bg-[var(--hover)] shadow-[0_1px_1px_rgb(16_24_40/.04)]',
    ghost: 'bg-transparent text-[var(--text-2)] border border-transparent hover:bg-[var(--hover)] hover:text-[var(--text)]',
    danger: 'bg-[var(--bad)] text-white hover:brightness-95 border border-transparent',
    ok: 'bg-[var(--ok)] text-white hover:brightness-95 border border-transparent',
    /** For buttons that sit on the dark hero band. */
    inverse: 'bg-white/10 text-white border border-white/20 hover:bg-white/20 backdrop-blur-sm',
  };
  const s: Record<Size, string> = {
    sm: 'ctl-sm px-2 t-sm gap-1.5',
    md: 'ctl px-3 t-base gap-1.5',
    lg: 'ctl-lg px-3.5 t-base gap-2',
    xl: 'ctl-lg px-4 t-lg gap-2 touch:px-5',
  };
  return (
    <button ref={(el) => { inner.current = el; if (typeof ref === 'function') ref(el); else if (ref) ref.current = el; }} disabled={disabled}
      className={cn('inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap select-none transition-colors disabled:opacity-45 disabled:pointer-events-none', v[variant], s[size], block && 'w-full', className)} {...rest}>
      {Icon && <Icon className={cn('shrink-0', size === 'sm' ? 'size-3.5' : 'size-4 touch:size-5')} strokeWidth={2} />}
      {children}
    </button>
  );
});

export function IconButton({ icon: Icon, label, className, active, hotkey, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; active?: boolean; hotkey?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  useHotkey(hotkey, () => ref.current?.click(), { label, enabled: !rest.disabled });
  return (
    <button ref={ref} aria-label={label} title={hotkey ? `${label} (${keyCaps(hotkey).join(' ')})` : label}
      className={cn('ctl aspect-square grid place-items-center rounded-md text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:opacity-40', active && 'bg-[var(--selected)] text-[var(--text)]', className)} {...rest}>
      <Icon className="size-4 touch:size-5" strokeWidth={2} />
    </button>
  );
}

/* ───────────────────────────── Surfaces ───────────────────────────── */
export function Card({ className, children, pad = true, ...rest }: HTMLAttributes<HTMLDivElement> & { pad?: boolean }) {
  return <div className={cn('surface', pad && 'p-[var(--pad)]', className)} {...rest}>{children}</div>;
}

/** The standard container: header row with title and actions, body, optional footer. Prefer this over Card + SectionTitle. */
export function Panel({ title, sub, actions, footer, children, className, bodyClassName, pad = true, fill, icon: Icon }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; pad?: boolean; fill?: boolean; icon?: LucideIcon }) {
  return (
    <section className={cn('surface flex flex-col min-w-0', fill && 'h-full min-h-0', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 pl-[var(--pad)] pr-2 min-h-[44px] touch:min-h-[52px] border-b border-[var(--line)] shrink-0">
          <div className="min-w-0 flex items-center gap-2">
            {Icon && <Icon className="size-4 text-[var(--text-3)] shrink-0" strokeWidth={2} />}
            <h3 className="t-lg font-semibold whitespace-nowrap">{title}</h3>
            {sub && <span className="t-sm text-[var(--text-3)] truncate min-w-0">{sub}</span>}
          </div>
          {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cn('min-w-0', pad && 'p-[var(--pad)]', fill && 'flex-1 min-h-0 overflow-auto', bodyClassName)}>{children}</div>
      {footer && <footer className="px-[var(--pad)] py-2 border-t border-[var(--line)] bg-[var(--surface-2)] rounded-b-[9px] t-sm text-[var(--text-2)] shrink-0">{footer}</footer>}
    </section>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return <div className={cn('flex items-center justify-between gap-3 mb-2', className)}><h3 className="t-label">{children}</h3>{action}</div>;
}

/** Page header. Breadcrumbs live in the title bar on desktop, so the eyebrow only shows in touch density. */
export function PageHeader({ title, subtitle, eyebrow, actions, back, tabs, meta }: { title: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; back?: ReactNode; tabs?: ReactNode; meta?: ReactNode }) {
  return (
    <header className="mb-[var(--gap)]">
      {back}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {eyebrow && <div className="hidden touch:block t-label mb-0.5">{eyebrow}</div>}
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="t-title text-[var(--text)]">{title}</h1>
            {meta}
          </div>
          {subtitle && <p className="t-sm text-[var(--text-2)] mt-0.5 max-w-[80ch]">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-1.5 items-center">{actions}</div>}
      </div>
      {tabs && <div className="mt-3 border-b border-[var(--line)]">{tabs}</div>}
    </header>
  );
}

/** Filter / action bar that sits above a table or a pane. */
export function Toolbar({ children, className, right }: { children?: ReactNode; className?: string; right?: ReactNode }) {
  return <div className={cn('flex flex-wrap items-center gap-2 mb-2', className)}><div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">{children}</div>{right && <div className="flex items-center gap-1.5 shrink-0">{right}</div>}</div>;
}

/** Master-detail layout: list on the left, sticky detail on the right. Stacks on narrow screens. */
export function Split({ children, aside, asideWidth = 360, className }: { children: ReactNode; aside: ReactNode; asideWidth?: number; className?: string }) {
  return (
    <div className={cn('grid gap-[var(--gap)] items-start lg:[grid-template-columns:minmax(0,1fr)_var(--aside)]', className)} style={{ ['--aside' as string]: `${asideWidth}px` }}>
      <div className="min-w-0">{children}</div>
      <aside className="min-w-0 lg:sticky lg:top-0 flex flex-col gap-[var(--gap)]">{aside}</aside>
    </div>
  );
}

/* ───────────────────────────── Badge ───────────────────────────── */
export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  const t: Record<Tone, string> = {
    neutral: 'bg-[var(--surface-3)] text-[var(--text-2)]',
    ok: 'bg-[var(--ok-bg)] text-[var(--ok)]',
    warn: 'bg-[var(--warn-bg)] text-[var(--warn)]',
    bad: 'bg-[var(--bad-bg)] text-[var(--bad)]',
    info: 'bg-[var(--info-bg)] text-[var(--info)]',
    brand: 'bg-[var(--brand)] text-[var(--brand-contrast)]',
    accent: 'bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent-strong)]',
  };
  return <span className={cn('inline-flex items-center gap-1 rounded-[5px] px-1.5 h-[20px] touch:h-[24px] t-xs font-semibold leading-none whitespace-nowrap', t[tone], className)}>{dot && <span className="size-1.5 rounded-full bg-current" />}{children}</span>;
}

/** Small status dot with a text label. Use in tables instead of a coloured badge when rows are dense. */
export function Status({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className="size-2 rounded-full shrink-0" style={{ background: toneVar[tone] }} />{children}</span>;
}

/* ───────────────────────────── KPIs ───────────────────────────── */
/**
 * KPI card. Give it an icon, a delta against a reference (<Delta/>) and a 7-point spark series when you have them:
 * a bare number is a missed chance to show direction.
 */
export function Stat({ label, value, sub, tone = 'neutral', icon: Icon, onClick, className, big, delta, spark, accent, sparkColor }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: LucideIcon; onClick?: () => void; className?: string; big?: boolean; delta?: ReactNode; spark?: number[]; accent?: string; sparkColor?: string }) {
  const Comp: 'button' | 'div' = onClick ? 'button' : 'div';
  const color = tone === 'neutral' || tone === 'brand' ? 'var(--text)' : toneVar[tone];
  const chip = accent ?? (tone === 'neutral' || tone === 'brand' ? 'var(--text-3)' : toneVar[tone]);
  return (
    <Comp onClick={onClick} className={cn('surface px-3.5 py-3 text-left flex flex-col gap-1.5 min-w-0', onClick && 'lift', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="t-sm font-medium text-[var(--text-2)] truncate">{label}</span>
        {Icon && <span className="size-7 rounded-md grid place-items-center shrink-0" style={{ background: `color-mix(in srgb, ${chip} 13%, transparent)`, color: chip }}><Icon className="size-4" strokeWidth={2} /></span>}
      </div>
      <div className="flex items-center gap-2 min-w-0 flex-wrap"><span className={cn('num whitespace-nowrap', big ? 't-hero' : 't-kpi')} style={{ color }}>{value}</span>{delta}</div>
      {spark && spark.length > 1 && <Sparkline fluid height={26} data={spark} color={sparkColor ?? accent ?? 'var(--series-1)'} className="-mx-0.5" />}
      {sub && <div className="t-sm text-[var(--text-3)] truncate">{sub}</div>}
    </Comp>
  );
}

/** The standard top row of a dashboard: up to six KPI cards that share the width. */
export function KpiStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-[var(--gap)] grid-cols-2 md:grid-cols-3 xl:grid-flow-col xl:auto-cols-fr xl:grid-cols-none', className)}>{children}</div>;
}

/* ───────────────────────────── Action row (role home, quick actions) ───────────────────────────── */
export function ActionTile({ icon: Icon, title, hint, onClick, tone = 'neutral', badge, hotkey }: { icon: LucideIcon; title: string; hint?: string; onClick: () => void; tone?: 'brand' | 'accent' | 'neutral'; badge?: ReactNode; hotkey?: string }) {
  useHotkey(hotkey, onClick, { label: title, group: 'Quick actions' });
  const chip = tone === 'brand' ? 'bg-[var(--brand)] text-[var(--brand-contrast)]' : tone === 'accent' ? 'bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent-strong)]' : 'bg-[var(--surface-3)] text-[var(--text-2)]';
  return (
    <button onClick={onClick} className="surface lift group w-full flex items-center gap-3 px-3 py-2.5 touch:py-3 text-left min-h-[56px] touch:min-h-[72px]">
      <span className={cn('size-9 touch:size-11 rounded-lg grid place-items-center shrink-0', chip)}><Icon className="size-4 touch:size-6" strokeWidth={2} /></span>
      <span className="min-w-0 flex-1"><span className="block t-base font-semibold truncate">{title}</span>{hint && <span className="block t-sm text-[var(--text-2)] truncate">{hint}</span>}</span>
      {badge}
      <ChevronRight className="size-4 text-[var(--text-4)] group-hover:text-[var(--text-2)] shrink-0" />
    </button>
  );
}

/* ───────────────────────────── Avatar ───────────────────────────── */
const PALETTE = ['#3b6d7e', '#5b7a52', '#8a6a3a', '#6f5a86', '#a0602a', '#4f6b8a', '#86505f', '#4a7a78'];
export function Avatar({ name, seed, size = 28, className, ring }: { name: string; seed?: string; size?: number; className?: string; ring?: 'ok' | 'bad' | 'warn' | 'none' }) {
  const text = seed ?? initialsOf(name);
  const color = PALETTE[(text.charCodeAt(0) + (text.charCodeAt(1) || 0)) % PALETTE.length];
  const ringCls = ring === 'ok' ? 'ring-2 ring-[var(--ok)]' : ring === 'bad' ? 'ring-2 ring-[var(--bad)]' : ring === 'warn' ? 'ring-2 ring-[var(--warn)]' : '';
  return <div aria-hidden className={cn('rounded-full grid place-items-center font-semibold text-white shrink-0 select-none', ringCls, className)} style={{ width: size, height: size, background: color, fontSize: Math.max(9, size * 0.38) }}>{text}</div>;
}

/* ───────────────────────────── Choice controls ───────────────────────────── */
/**
 * Single-choice segmented control. Keyboard: Tab into the group, arrows move, Space/Enter selects, digits 1–9 pick the nth option.
 * Use for 2–8 short options. For longer lists use <Select> (desktop) or a searchable list.
 */
export function ChipGroup<T extends string>({ options, value, onChange, size = 'md', className, columns, ariaLabel }: { options: { value: T; label: ReactNode; tone?: Tone; disabled?: boolean }[]; value?: T | null; onChange: (v: T) => void; size?: 'sm' | 'md' | 'lg'; className?: string; columns?: number; ariaLabel?: string }) {
  const sz = size === 'sm' ? 'ctl-sm px-2 t-sm' : size === 'lg' ? 'ctl-lg px-3.5 t-base' : 'ctl px-3 t-base';
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIdx = Math.max(0, options.findIndex((o) => o.value === value));
  const onKey = (e: ReactKeyboardEvent, i: number) => {
    const enabled = options.map((o, idx) => (o.disabled ? -1 : idx)).filter((x) => x >= 0);
    const pos = enabled.indexOf(i);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = enabled[(pos + 1) % enabled.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (/^[1-9]$/.test(e.key) && +e.key <= options.length && !options[+e.key - 1].disabled) next = +e.key - 1;
    if (next >= 0) { e.preventDefault(); refs.current[next]?.focus(); onChange(options[next].value); }
  };
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn(columns ? 'grid gap-1.5' : 'flex flex-wrap gap-1.5', className)} style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` } : undefined}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button key={o.value} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={active} disabled={o.disabled} tabIndex={i === activeIdx ? 0 : -1}
            onClick={() => onChange(o.value)} onKeyDown={(e) => onKey(e, i)}
            className={cn('rounded-md border font-medium transition-colors whitespace-nowrap inline-flex items-center justify-center gap-1.5 disabled:opacity-40', sz,
              active ? 'border-[var(--brand)] bg-[var(--selected)] text-[var(--text)] shadow-[inset_0_0_0_1px_var(--brand)] touch:bg-[var(--brand)] touch:text-[var(--brand-contrast)]' : 'border-[var(--line-2)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-[var(--text)]')}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className, variant = 'segmented' }: { tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string; variant?: 'segmented' | 'underline' }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: ReactKeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + tabs.length) % tabs.length;
    refs.current[n]?.focus();
    onChange(tabs[n].value);
  };
  if (variant === 'underline') {
    return (
      <div role="tablist" className={cn('flex gap-4 overflow-x-auto no-scrollbar -mb-px', className)}>
        {tabs.map((t, i) => (
          <button key={t.value} ref={(el) => { refs.current[i] = el; }} role="tab" aria-selected={t.value === value} tabIndex={t.value === value ? 0 : -1} onClick={() => onChange(t.value)} onKeyDown={(e) => onKey(e, i)}
            className={cn('ctl touch:h-11 t-base font-medium whitespace-nowrap border-b-2 inline-flex items-center gap-1.5 px-0.5', t.value === value ? 'border-[var(--brand)] text-[var(--text)]' : 'border-transparent text-[var(--text-3)] hover:text-[var(--text)]')}>
            {t.label}{t.count !== undefined && <span className="num t-xs px-1 rounded-[3px] bg-[var(--surface-3)] text-[var(--text-2)]">{t.count}</span>}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div role="tablist" className={cn('inline-flex p-0.5 rounded-md bg-[var(--surface-3)] gap-0.5 max-w-full overflow-x-auto no-scrollbar', className)}>
      {tabs.map((t, i) => (
        <button key={t.value} ref={(el) => { refs.current[i] = el; }} role="tab" aria-selected={t.value === value} tabIndex={t.value === value ? 0 : -1} onClick={() => onChange(t.value)} onKeyDown={(e) => onKey(e, i)}
          className={cn('h-[calc(var(--ctl-h)-4px)] px-2.5 rounded-[4px] t-sm font-medium whitespace-nowrap transition-colors inline-flex items-center gap-1.5', t.value === value ? 'bg-[var(--surface)] text-[var(--text)] shadow-[0_0_0_1px_var(--line)]' : 'text-[var(--text-2)] hover:text-[var(--text)]')}>
          {t.label}{t.count !== undefined && <span className="num t-xs text-[var(--text-3)]">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ───────────────────────────── Form fields ───────────────────────────── */
export function Field({ label, hint, children, className, required }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; required?: boolean }) {
  return <label className={cn('block', className)}><div className="t-sm font-medium text-[var(--text-2)] mb-1">{label}{required && <span className="text-[var(--bad)]"> *</span>}</div>{children}{hint && <div className="t-xs text-[var(--text-3)] mt-1">{hint}</div>}</label>;
}
/** Label-left form row on desktop, stacked in touch density. Use inside a Panel for back-office forms. */
export function FormRow({ label, hint, children, required }: { label: ReactNode; hint?: ReactNode; children: ReactNode; required?: boolean }) {
  return (
    <div className="grid gap-x-4 gap-y-1 items-start py-1.5 compact:sm:grid-cols-[150px_minmax(0,1fr)]">
      <div className="t-sm font-medium text-[var(--text-2)] compact:sm:pt-[7px]">{label}{required && <span className="text-[var(--bad)]"> *</span>}</div>
      <div className="min-w-0">{children}{hint && <div className="t-xs text-[var(--text-3)] mt-1">{hint}</div>}</div>
    </div>
  );
}
const fieldCls = 'w-full rounded-md border border-[var(--line-2)] bg-[var(--surface)] px-2.5 t-base outline-none placeholder:text-[var(--text-4)] hover:border-[var(--text-4)] focus:border-[var(--focus)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--focus)_22%,transparent)] disabled:bg-[var(--surface-2)] disabled:text-[var(--text-3)]';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { big?: boolean }>(function Input({ className, big, ...rest }, ref) {
  return <input ref={ref} className={cn(fieldCls, big ? 'ctl-lg t-lg' : 'ctl', className)} {...rest} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(fieldCls, 'py-1.5 min-h-[72px] resize-y', className)} {...rest} />;
});
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return <select ref={ref} className={cn(fieldCls, 'ctl pr-7', className)} {...rest}>{children}</select>;
});
/** Search box. Press "/" anywhere on the page to focus it (pass hotkey={null} to opt out). */
export function SearchInput({ value, onChange, placeholder = 'Search', className, hotkey = '/', autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; hotkey?: string | null; autoFocus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useHotkey(hotkey, () => { ref.current?.focus(); ref.current?.select(); }, { label: 'Search this page' });
  return (
    <div className={cn('relative w-full max-w-[280px]', className)}>
      <Search className="size-3.5 touch:size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3)] pointer-events-none" />
      <input ref={ref} value={value} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { if (value) onChange(''); else ref.current?.blur(); e.stopPropagation(); } }} placeholder={placeholder} className={cn(fieldCls, 'ctl pl-8 pr-8')} />
      {value ? <button type="button" onClick={() => onChange('')} aria-label="Clear" className="absolute right-1.5 top-1/2 -translate-y-1/2 size-5 grid place-items-center rounded text-[var(--text-3)] hover:bg-[var(--hover)]"><X className="size-3.5" /></button> : hotkey ? <Kbd keys={hotkey} className="absolute right-2 top-1/2 -translate-y-1/2" /> : null}
    </div>
  );
}


/* ───────────────────────────── Combobox ───────────────────────────── */
export interface ComboOption<T extends string = string> { value: T; label: string; sub?: string; left?: ReactNode; right?: ReactNode; disabled?: boolean; words?: string }
/**
 * Searchable single-select. Type to filter, ↑/↓ to move, Enter to choose, Esc to close.
 * Use for anything with more than ~8 options: people, machines, products, clients, parts.
 */
export function Combobox<T extends string>({ options, value, onChange, placeholder = 'Select…', autoFocus, className, clearable, emptyText = 'No match', big }: { options: ComboOption<T>[]; value?: T | null; onChange: (v: T | null) => void; placeholder?: string; autoFocus?: boolean; className?: string; clearable?: boolean; emptyText?: string; big?: boolean }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [idx, setIdx] = useState(0);
  const wrap = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null); const list = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => { const t = q.trim().toLowerCase(); return t ? options.filter((o) => `${o.label} ${o.sub ?? ''} ${o.words ?? ''}`.toLowerCase().includes(t)) : options; }, [options, q]);
  useEffect(() => { if (!open) return; const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) { setOpen(false); setQ(''); } }; window.addEventListener('mousedown', away); return () => window.removeEventListener('mousedown', away); }, [open]);
  useEffect(() => { setIdx(0); }, [q, open]);
  useEffect(() => { list.current?.querySelector(`[data-i="${idx}"]`)?.scrollIntoView({ block: 'nearest' }); }, [idx]);
  const pick = (o?: ComboOption<T>) => { if (!o || o.disabled) return; onChange(o.value); setOpen(false); setQ(''); };
  return (
    <div ref={wrap} className={cn('relative w-full', className)}>
      <div className="relative">
        {selected?.left && !open && <span className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">{selected.left}</span>}
        <input ref={input} role="combobox" aria-expanded={open} autoFocus={autoFocus} data-autofocus={autoFocus ? '' : undefined}
          value={open ? q : selected?.label ?? ''} placeholder={selected ? selected.label : placeholder}
          onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setIdx((i) => Math.min(filtered.length - 1, i + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
            else if (e.key === 'Enter' && open) { e.preventDefault(); pick(filtered[idx]); }
            else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); setQ(''); }
            else if (e.key === 'Tab') { setOpen(false); setQ(''); }
          }}
          className={cn(fieldCls, big ? 'ctl-lg' : 'ctl', 'pr-8', selected?.left && !open && 'pl-9')} />
        {clearable && selected && !open ? <button type="button" aria-label="Clear" onClick={() => { onChange(null); input.current?.focus(); }} className="absolute right-1.5 top-1/2 -translate-y-1/2 size-5 grid place-items-center rounded text-[var(--text-3)] hover:bg-[var(--hover)]"><X className="size-3.5" /></button>
          : <ChevronRight className="size-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 text-[var(--text-3)] pointer-events-none" />}
      </div>
      {open && (
        <div ref={list} role="listbox" className="absolute z-40 left-0 right-0 top-[calc(100%+3px)] max-h-[264px] touch:max-h-[320px] overflow-auto py-1 bg-[var(--surface)] border border-[var(--line-2)] rounded-md shadow-[var(--shadow-pop)] anim-pop">
          {filtered.length === 0 && <div className="px-3 py-3 t-sm text-[var(--text-3)]">{emptyText}</div>}
          {filtered.map((o, i) => (
            <button key={o.value} type="button" role="option" aria-selected={o.value === value} data-i={i} disabled={o.disabled} onMouseMove={() => setIdx(i)} onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              className={cn('w-full flex items-center gap-2 px-2.5 min-h-[var(--ctl-h)] touch:min-h-12 text-left t-base disabled:opacity-40', i === idx && 'bg-[var(--selected)]', o.value === value && 'font-medium')}>
              {o.left}
              <span className="min-w-0 flex-1 truncate">{o.label}{o.sub && <span className="t-sm text-[var(--text-3)]"> · {o.sub}</span>}</span>
              {o.right}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── Number entry ───────────────────────────── */
const cleanNumber = (raw: string, allowDecimal?: boolean) => {
  let v = raw.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, '');
  if (allowDecimal) { const i = v.indexOf('.'); if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, ''); }
  return v.replace(/^0+(?=\d)/, '');
};
/**
 * Number entry that fits the device: a typed field on desktop (Enter confirms), an on-screen keypad in touch density.
 * Same props either way, so screens never branch on device.
 */
export function NumberPad({ value, onChange, onDone, allowDecimal, label, suffix, doneLabel = 'Done', max, autoFocus }: { value: string; onChange: (v: string) => void; onDone?: () => void; allowDecimal?: boolean; label?: ReactNode; suffix?: ReactNode; doneLabel?: string; max?: number; autoFocus?: boolean }) {
  const touch = useIsTouch();
  const set = (next: string) => { if (max !== undefined && next !== '' && parseFloat(next) > max) return; onChange(next); };
  const press = (k: string) => {
    if (k === '⌫') return onChange(value.slice(0, -1));
    if (k === 'C') return onChange('');
    if (k === '.' && (!allowDecimal || value.includes('.'))) return;
    set(value === '0' && k !== '.' ? k : value + k);
  };
  const pretty = (v: string) => { if (!v) return ''; const [a, b] = v.split('.'); return Number(a || '0').toLocaleString('en-UG') + (b !== undefined ? `.${b}` : ''); };
  if (!touch) {
    return (
      <div className="w-full">
        {label && <div className="t-sm font-medium text-[var(--text-2)] mb-1">{label}</div>}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input data-autofocus={autoFocus ? '' : undefined} autoFocus={autoFocus} inputMode={allowDecimal ? 'decimal' : 'numeric'} value={pretty(value)} placeholder="0"
              onChange={(e) => set(cleanNumber(e.target.value, allowDecimal))} onKeyDown={(e) => { if (e.key === 'Enter' && onDone && value) { e.preventDefault(); onDone(); } }}
              className={cn(fieldCls, 'ctl-lg num t-lg font-semibold text-right', suffix ? 'pr-12' : 'pr-3')} />
            {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 t-sm text-[var(--text-3)] pointer-events-none">{suffix}</span>}
          </div>
          {onDone && <Button variant="primary" size="lg" onClick={onDone} disabled={!value}>{doneLabel}<Kbd keys="enter" className="ml-1 [&_kbd]:bg-transparent [&_kbd]:border-current [&_kbd]:text-current [&_kbd]:opacity-60" /></Button>}
        </div>
      </div>
    );
  }
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', allowDecimal ? '.' : 'C', '0', '⌫'];
  return (
    <div className="w-full outline-none" tabIndex={-1} onKeyDown={(e) => { if (/^[0-9.]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('⌫'); else if (e.key === 'Enter' && onDone && value) onDone(); }}>
      {label && <div className="t-sm font-medium text-[var(--text-2)] mb-1">{label}</div>}
      <div className="num h-14 rounded-md border border-[var(--line-2)] bg-[var(--surface)] px-4 flex items-center justify-end text-[28px] font-semibold tracking-tight mb-2 overflow-hidden">{pretty(value) || <span className="text-[var(--text-4)]">0</span>}{suffix && <span className="t-base text-[var(--text-3)] ml-2 font-normal">{suffix}</span>}</div>
      <div className="grid grid-cols-3 gap-1.5">
        {keys.map((k) => <button key={k} type="button" onClick={() => press(k)} className={cn('h-14 rounded-md text-[20px] font-medium border border-[var(--line-2)] bg-[var(--surface)] active:bg-[var(--surface-3)] select-none', (k === '⌫' || k === 'C') && 'text-[var(--text-2)] text-[16px]')}>{k}</button>)}
      </div>
      {onDone && <Button variant="primary" size="lg" block className="mt-2" onClick={onDone} disabled={!value}>{doneLabel}</Button>}
    </div>
  );
}

/** PIN prompt: type digits on a keyboard, or tap the keypad in touch density. Submits at full length. */
export function PinPad({ onSubmit, length = 4, title = 'Enter PIN', error }: { onSubmit: (pin: string) => void; length?: number; title?: ReactNode; error?: ReactNode }) {
  const [pin, setPin] = useState('');
  const touch = useIsTouch();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (pin.length === length) { onSubmit(pin); setPin(''); } }, [pin, length, onSubmit]);
  useEffect(() => { ref.current?.focus(); }, []);
  const press = (k: string) => setPin((p) => (k === '⌫' ? p.slice(0, -1) : p.length < length ? p + k : p));
  return (
    <div ref={ref} tabIndex={0} data-autofocus="" className="max-w-[260px] mx-auto text-center outline-none group" onKeyDown={(e) => { if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); } else if (e.key === 'Backspace') press('⌫'); }}>
      <div className="t-base font-medium mb-2">{title}</div>
      <div className="flex justify-center gap-2 mb-2">
        {Array.from({ length }).map((_, i) => <div key={i} className={cn('size-9 rounded-md border grid place-items-center text-[18px] leading-none group-focus:border-[var(--focus)]', i < pin.length ? 'border-[var(--brand)] bg-[var(--selected)]' : 'border-[var(--line-2)] bg-[var(--surface)]')}>{i < pin.length ? '•' : ''}</div>)}
      </div>
      {error ? <div className="t-sm text-[var(--bad)] mb-2">{error}</div> : <div className="t-xs text-[var(--text-3)] mb-2 touch:hidden">Type the {length} digits</div>}
      {touch && <div className="grid grid-cols-3 gap-1.5">{['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => <button key={i} type="button" disabled={!k} onClick={() => press(k)} className="h-14 rounded-md text-[20px] font-medium border border-[var(--line-2)] bg-[var(--surface)] disabled:opacity-0 active:bg-[var(--surface-3)]">{k}</button>)}</div>}
    </div>
  );
}

/* ───────────────────────────── Overlays ───────────────────────────── */
function useOverlay(open: boolean, onClose: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const f = ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', h, true);
    const t = setTimeout(() => {
      const el = ref.current; if (!el || el.contains(document.activeElement)) return;
      (el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('input:not([disabled]),textarea,select') ?? el).focus();
    }, 30);
    return () => { window.removeEventListener('keydown', h, true); clearTimeout(t); prev?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

/** Inspector panel: slides in from the right on desktop, from the bottom in touch density. Esc closes, focus is trapped. */
export function Sheet({ open, onClose, title, children, side = 'auto', width = 460, footer, sub }: { open: boolean; onClose: () => void; title?: ReactNode; sub?: ReactNode; children: ReactNode; side?: 'auto' | 'bottom' | 'right'; width?: number; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const touch = useIsTouch();
  useOverlay(open, onClose, ref);
  if (!open) return null;
  const right = side === 'right' || (side === 'auto' && !(touch && typeof window !== 'undefined' && window.innerWidth < 900));
  return (
    <div className="fixed inset-0 z-50 flex" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal>
      <div className="absolute inset-0 bg-[rgb(11_19_23/.38)] anim-fade pointer-events-none" />
      <div ref={ref} tabIndex={-1} className={cn('relative bg-[var(--surface)] shadow-[var(--shadow-float)] flex flex-col outline-none', right ? 'ml-auto h-full border-l border-[var(--line)] anim-left' : 'mt-auto w-full max-h-[92dvh] rounded-t-xl anim-up')} style={right ? { width: Math.min(width, typeof window !== 'undefined' ? window.innerWidth : width) } : undefined}>
        <div className="flex items-center justify-between gap-3 pl-4 pr-2 min-h-[44px] touch:min-h-[56px] border-b border-[var(--line)] shrink-0">
          <div className="min-w-0"><div className="t-lg font-semibold truncate">{title}</div>{sub && <div className="t-sm text-[var(--text-3)] truncate">{sub}</div>}</div>
          <button onClick={onClose} aria-label="Close" className="ctl px-2 inline-flex items-center gap-1.5 rounded-md text-[var(--text-3)] hover:bg-[var(--hover)] hover:text-[var(--text)]"><Kbd keys="escape" /><X className="size-4" /></button>
        </div>
        <div className="overflow-y-auto px-4 py-3 flex-1 min-h-0">{children}</div>
        {footer && <div className="px-4 py-2.5 border-t border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-end gap-2 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

/** Centered dialog for confirmations and short forms. */
export function Dialog({ open, onClose, title, children, footer, width = 440 }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useOverlay(open, onClose, ref);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal>
      <div className="absolute inset-0 bg-[rgb(11_19_23/.38)] anim-fade pointer-events-none" />
      <div ref={ref} tabIndex={-1} className="relative w-full bg-[var(--surface)] border border-[var(--line)] rounded-lg shadow-[var(--shadow-float)] anim-pop outline-none max-h-[88dvh] flex flex-col" style={{ maxWidth: width }}>
        {title && <div className="px-4 pt-3.5 pb-2 t-lg font-semibold">{title}</div>}
        <div className="px-4 pb-3 overflow-y-auto">{children}</div>
        {footer && <div className="px-4 py-2.5 border-t border-[var(--line)] bg-[var(--surface-2)] rounded-b-lg flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* ───────────────────────────── Feedback ───────────────────────────── */
export function Empty({ icon: Icon, title, hint, action }: { icon?: LucideIcon; title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-[var(--line-2)] px-6 py-7 text-center flex flex-col items-center gap-1.5">{Icon && <span className="size-9 rounded-full bg-[var(--surface-3)] grid place-items-center mb-1"><Icon className="size-4 text-[var(--text-3)]" /></span>}<div className="t-base font-medium">{title}</div>{hint && <div className="t-sm text-[var(--text-3)] max-w-sm">{hint}</div>}{action && <div className="mt-2">{action}</div>}</div>;
}

export function Note({ tone = 'warn', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: LucideIcon | false }) {
  const t: Record<Tone, string> = {
    neutral: 'bg-[var(--surface-2)] border-[var(--line)]',
    info: 'bg-[var(--info-bg)] border-[color-mix(in_srgb,var(--info)_30%,transparent)]',
    ok: 'bg-[var(--ok-bg)] border-[color-mix(in_srgb,var(--ok)_30%,transparent)]',
    warn: 'bg-[var(--warn-bg)] border-[color-mix(in_srgb,var(--warn)_30%,transparent)]',
    bad: 'bg-[var(--bad-bg)] border-[color-mix(in_srgb,var(--bad)_35%,transparent)]',
    brand: 'bg-[var(--selected)] border-[var(--line-2)]',
    accent: 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color-mix(in_srgb,var(--accent)_35%,transparent)]',
  };
  const Icon = icon === false ? null : icon ?? (tone === 'ok' ? CheckCircle2 : tone === 'bad' ? XCircle : tone === 'warn' ? AlertTriangle : Info);
  return (
    <div className={cn('rounded-md border px-3 py-2 t-sm text-[var(--text)] flex items-start gap-2', t[tone], className)}>
      {Icon && <Icon className="size-4 shrink-0 mt-px" style={{ color: tone === 'neutral' || tone === 'brand' ? 'var(--text-3)' : toneVar[tone] }} />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/* ───────────────────────────── Lists and tables ───────────────────────────── */
export function Row({ left, title, sub, right, onClick, className, chevron, selected }: { left?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void; className?: string; chevron?: boolean; selected?: boolean }) {
  const Comp: 'button' | 'div' = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={cn('w-full flex items-center gap-2.5 py-1.5 px-1 text-left border-b border-[var(--line)] last:border-b-0 row-h', onClick && 'hover:bg-[var(--hover)]', selected && 'bg-[var(--selected)]', className)}>
      {left}
      <div className="min-w-0 flex-1"><div className="t-base font-medium truncate">{title}</div>{sub && <div className="t-sm text-[var(--text-3)] truncate">{sub}</div>}</div>
      {right && <div className="shrink-0 text-right t-sm">{right}</div>}
      {chevron && <ChevronRight className="size-4 text-[var(--text-4)] shrink-0" />}
    </Comp>
  );
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  sticky?: boolean;
  mono?: boolean;
  /** Return a comparable value to make the column sortable by clicking its header. */
  sort?: (row: T) => number | string;
  /** Cells are single-line by default (dense tables). Set to let this column wrap. */
  wrap?: boolean;
  /** Truncate with an ellipsis at this max width (px). */
  truncate?: number;
}
/**
 * The workhorse table. Sticky header, sortable columns, and full keyboard control when rows are clickable:
 * click or Tab into the table, ↑/↓ or J/K to move, Enter to open, Home/End to jump.
 */
export function DataGrid<T>({ rows, columns, rowKey, dense, className, onRowClick, footer, maxHeight, zebra = false, selectedKey, empty, rowClassName, bare }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; dense?: boolean; className?: string; onRowClick?: (r: T) => void; footer?: ReactNode; maxHeight?: number | string; zebra?: boolean; selectedKey?: string | null; empty?: ReactNode; rowClassName?: (r: T) => string | undefined; bare?: boolean }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [active, setActive] = useState(-1);
  const body = useRef<HTMLTableSectionElement>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const f = col.sort;
    return [...rows].sort((a, b) => { const x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [rows, sort, columns]);
  useEffect(() => { if (active >= sorted.length) setActive(sorted.length - 1); }, [sorted.length, active]);
  const move = (i: number) => {
    const n = Math.max(0, Math.min(sorted.length - 1, i));
    setActive(n);
    body.current?.children[n]?.scrollIntoView({ block: 'nearest' });
  };
  const onKey = (e: ReactKeyboardEvent) => {
    if (!onRowClick || (e.target as HTMLElement).closest('input,select,textarea')) return;
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); move(active + 1); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); move(active - 1); }
    else if (e.key === 'Home') { e.preventDefault(); move(0); }
    else if (e.key === 'End') { e.preventDefault(); move(sorted.length - 1); }
    else if (e.key === 'Enter' && active >= 0 && sorted[active] && !(e.target as HTMLElement).closest('button,a')) { e.preventDefault(); onRowClick(sorted[active]); }
  };
  return (
    <div className={cn(!bare && 'surface', 'overflow-hidden', className)}>
      <div className="overflow-auto scrollbar-thin outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus)]" style={{ maxHeight }} tabIndex={onRowClick ? 0 : undefined} onKeyDown={onKey} onFocus={() => { if (onRowClick && active < 0 && sorted.length) setActive(0); }}>
        <table className="w-full border-collapse t-base">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[var(--surface-2)]">
              {columns.map((c) => {
                const is = sort?.key === c.key;
                return (
                  <th key={c.key} style={{ width: c.width, textAlign: c.align ?? 'left' }} aria-sort={is ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined}
                    className={cn('px-2.5 h-8 touch:h-10 t-xs font-semibold text-[var(--text-3)] uppercase tracking-[0.04em] whitespace-nowrap border-b border-[var(--line)] bg-[var(--surface-2)]', c.sticky && 'sticky left-0 z-20')}>
                    {c.sort ? (
                      <button type="button" onClick={() => setSort(is ? (sort!.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 })} className={cn('inline-flex items-center gap-1 uppercase tracking-[0.04em] font-semibold hover:text-[var(--text)]', is && 'text-[var(--text)]')}>
                        {c.header}{is && (sort!.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody ref={body}>
            {sorted.map((r, i) => {
              const key = rowKey(r);
              const isSel = selectedKey === key;
              const isActive = onRowClick && active === i;
              return (
                <tr key={key} onClick={onRowClick ? () => { setActive(i); onRowClick(r); } : undefined}
                  className={cn('border-b border-[var(--line)] last:border-b-0', zebra && i % 2 === 1 && 'bg-[var(--surface-2)]', onRowClick && 'cursor-pointer hover:bg-[var(--hover)]', isSel && 'bg-[var(--selected)] hover:bg-[var(--selected)]', isActive && 'shadow-[inset_2px_0_0_var(--focus)] bg-[var(--hover)]', rowClassName?.(r))}>
                  {columns.map((c) => <td key={c.key} style={{ textAlign: c.align ?? 'left', maxWidth: c.truncate }} className={cn('px-2.5 align-middle', !c.wrap && 'whitespace-nowrap', c.truncate && 'overflow-hidden text-ellipsis', dense ? 'h-[28px] touch:h-10 py-0.5' : 'h-[var(--row-h)] py-1', c.mono && 'num', c.sticky && 'sticky left-0 z-[1] bg-[var(--surface)]')}>{c.cell(r)}</td>)}
                </tr>
              );
            })}
            {sorted.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-8 text-center t-sm text-[var(--text-3)]">{empty ?? 'Nothing to show.'}</td></tr>}
          </tbody>
          {footer && <tfoot className="sticky bottom-0 bg-[var(--surface-2)] font-semibold [&_td]:px-2.5 [&_td]:h-8 [&_td]:border-t [&_td]:border-[var(--line-2)]">{footer}</tfoot>}
        </table>
      </div>
    </div>
  );
}

/* ───────────────────────────── Data marks ───────────────────────────── */
const fill = (tone: Tone | 'series') => (tone === 'series' ? 'var(--series-1)' : tone === 'neutral' ? 'var(--text-3)' : tone === 'brand' ? 'var(--brand)' : toneVar[tone]);

export function Bar({ value, max, tone = 'brand', className, height = 6 }: { value: number; max: number; tone?: Tone | 'series'; className?: string; height?: number }) {
  const pct = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  return <div className={cn('w-full rounded-[3px] bg-[var(--surface-3)] overflow-hidden', className)} style={{ height }}><div className="h-full rounded-[3px] transition-[width] duration-300" style={{ width: `${pct}%`, background: fill(tone) }} /></div>;
}

/** Label, value and a thin bar on one line. The standard way to show "x of y" in a list. */
export function Meter({ label, value, max, display, tone = 'series', sub }: { label: ReactNode; value: number; max: number; display?: ReactNode; tone?: Tone | 'series'; sub?: ReactNode }) {
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-3 mb-1"><span className="t-base truncate">{label}{sub && <span className="t-sm text-[var(--text-3)]"> · {sub}</span>}</span><span className="num t-base font-medium shrink-0">{display ?? value.toLocaleString()}</span></div>
      <Bar value={value} max={max} tone={tone} />
    </div>
  );
}

/** Part-to-whole in one row: 2px surface gaps between segments, legend below. Colours follow the entity, never rank. */
export function StackedBar({ segments, height = 10, legend = true, format }: { segments: { label: string; value: number; color: string }[]; height?: number; legend?: boolean; format?: (n: number) => string }) {
  const total = segments.reduce((t, s) => t + s.value, 0) || 1;
  const vis = segments.filter((s) => s.value > 0);
  return (
    <div>
      <div className="flex w-full gap-[2px] rounded-[3px] overflow-hidden" style={{ height }} role="img" aria-label={vis.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(', ')}>
        {vis.map((s) => <div key={s.label} title={`${s.label}: ${format ? format(s.value) : s.value.toLocaleString()} (${Math.round((s.value / total) * 100)}%)`} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} className="h-full min-w-[2px] hover:opacity-80" />)}
      </div>
      {legend && (
        <div className="mt-2 grid gap-x-4 gap-y-1 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
          {vis.map((s) => <div key={s.label} className="flex items-center gap-1.5 t-sm min-w-0"><span className="size-2 rounded-[2px] shrink-0" style={{ background: s.color }} /><span className="truncate text-[var(--text-2)]">{s.label}</span><span className="num ml-auto text-[var(--text)]">{format ? format(s.value) : s.value.toLocaleString()}</span></div>)}
        </div>
      )}
    </div>
  );
}

/** Small column chart for a short time series. One series, one colour; the partial period is drawn lighter. Hover shows the value. */
export function MiniBars({ data, height = 96, format, tone = 'series' }: { data: { label: string; value: number; partial?: boolean }[]; height?: number; format?: (n: number) => string; tone?: Tone | 'series' }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const [hover, setHover] = useState<number | null>(null);
  const f = format ?? ((n: number) => n.toLocaleString());
  const shown = hover ?? data.length - 1;
  return (
    <div>
      <div className="flex items-baseline justify-between t-sm mb-1.5"><span className="text-[var(--text-3)]">{data[shown]?.label}{data[shown]?.partial ? ' · so far' : ''}</span><span className="num font-medium">{data[shown] ? f(data[shown].value) : ''}</span></div>
      <div className="flex items-end gap-[3px] border-b border-[var(--chart-grid)]" style={{ height }} onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 h-full flex items-end justify-center" onMouseEnter={() => setHover(i)}>
            <div className="w-full max-w-[24px] rounded-t-[4px] transition-opacity" style={{ height: `${Math.max(2, (d.value / max) * 100)}%`, background: fill(tone), opacity: d.partial ? 0.45 : hover !== null && hover !== i ? 0.55 : 1 }} />
          </div>
        ))}
      </div>
      <div className="flex gap-[3px] mt-1">{data.map((d, i) => <div key={i} className={cn('flex-1 text-center t-xs truncate', i === shown ? 'text-[var(--text)]' : 'text-[var(--text-4)]')}>{d.label.split(' ')[0]}</div>)}</div>
    </div>
  );
}

export function Ring({ value, size = 72, stroke = 8, tone = 'brand', label, sub }: { value: number; size?: number; stroke?: number; tone?: Tone; label?: ReactNode; sub?: ReactNode }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r; const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative grid place-items-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={fill(tone)} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} style={{ transition: 'stroke-dashoffset .5s ease' }} /></svg>
      <div className="absolute inset-0 grid place-items-center text-center"><div><div className="num font-semibold leading-none" style={{ fontSize: Math.max(11, size * 0.2) }}>{label ?? `${Math.round(pct)}%`}</div>{sub && <div className="text-[9.5px] text-[var(--text-3)] mt-0.5 font-medium uppercase tracking-wide">{sub}</div>}</div></div>
    </div>
  );
}

/** Tolerance gauge: where the measured value sits against expected, with the ± tolerance band. */
export function Gauge({ variancePct, tolerancePct, width = 320 }: { variancePct: number | undefined; tolerancePct: number; width?: number }) {
  const range = Math.max(tolerancePct * 4, 8); const x = (v: number) => ((Math.max(-range, Math.min(range, v)) + range) / (2 * range)) * 100;
  const pass = variancePct !== undefined && Math.abs(variancePct) <= tolerancePct;
  return (
    <div style={{ maxWidth: width }} className="w-full">
      <div className="relative h-3 rounded-[3px] bg-[var(--surface-3)]">
        <div className="absolute top-0 bottom-0 bg-[var(--ok-bg)] border-x border-[var(--ok)]" style={{ left: `${x(-tolerancePct)}%`, width: `${x(tolerancePct) - x(-tolerancePct)}%` }} />
        <div className="absolute top-0 bottom-0 w-px bg-[var(--text-3)]" style={{ left: '50%' }} />
        {variancePct !== undefined && <div className={cn('absolute -top-1 w-1 h-5 rounded-[2px] transition-[left] duration-500', pass ? 'bg-[var(--ok)]' : 'bg-[var(--bad)]')} style={{ left: `calc(${x(variancePct)}% - 2px)` }} />}
      </div>
      <div className="flex justify-between t-xs text-[var(--text-3)] mt-1 num"><span>−{range}%</span><span>−{tolerancePct}%</span><span>0</span><span>+{tolerancePct}%</span><span>+{range}%</span></div>
    </div>
  );
}

/* ───────────────────────────── Menu ───────────────────────────── */
export interface MenuItem { label: ReactNode; icon?: LucideIcon; onSelect: () => void; hint?: ReactNode; keys?: string; danger?: boolean; checked?: boolean; divider?: boolean }
export function Menu({ trigger, items, align = 'left', width = 220, placement = 'bottom', className }: { trigger: (p: { open: boolean; toggle: () => void }) => ReactNode; items: MenuItem[]; align?: 'left' | 'right'; width?: number; placement?: 'bottom' | 'top'; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const els = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
      const i = els.indexOf(document.activeElement as HTMLElement);
      els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus();
    };
    window.addEventListener('mousedown', away); window.addEventListener('keydown', key, true);
    setTimeout(() => ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(), 10);
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', key, true); };
  }, [open]);
  return (
    <div ref={ref} className={cn('relative app-no-drag', className)}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div id={id} role="menu" className={cn('absolute z-50 py-1 bg-[var(--surface)] text-[var(--text)] border border-[var(--line-2)] rounded-lg shadow-[var(--shadow-pop)] anim-pop', placement === 'top' ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+4px)]', align === 'right' ? 'right-0' : 'left-0')} style={{ width }}>
          {items.map((it, i) => (
            <div key={i}>
              {it.divider && <div className="my-1 border-t border-[var(--line)]" />}
              <button role="menuitem" onClick={() => { setOpen(false); it.onSelect(); }} className={cn('w-full flex items-center gap-2 px-2.5 ctl touch:h-11 t-base text-left hover:bg-[var(--hover)] focus:bg-[var(--hover)] outline-none', it.danger && 'text-[var(--bad)]')}>
                {it.icon ? <it.icon className="size-4 text-[var(--text-3)] shrink-0" /> : <span className="w-4 shrink-0 grid place-items-center">{it.checked && <span className="size-1.5 rounded-full bg-[var(--brand)]" />}</span>}
                <span className="flex-1 min-w-0 truncate">{it.label}</span>
                {it.hint && <span className="t-sm text-[var(--text-3)]">{it.hint}</span>}
                {it.keys && <Kbd keys={it.keys} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── Hooks ───────────────────────────── */
export function useMedia(q: string) { const [m, setM] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(q).matches : false)); useEffect(() => { const mm = window.matchMedia(q); const h = () => setM(mm.matches); mm.addEventListener('change', h); return () => mm.removeEventListener('change', h); }, [q]); return m; }
export function useNow(ms = 30000) { const [n, setN] = useState(() => new Date()); useEffect(() => { const t = setInterval(() => setN(new Date()), ms); return () => clearInterval(t); }, [ms]); return n; }
export function useTimer(running: boolean) { const [s, setS] = useState(0); useEffect(() => { if (!running) return; const start = Date.now(); const t = setInterval(() => setS((Date.now() - start) / 1000), 100); return () => clearInterval(t); }, [running]); return s; }
export const useStable = <T,>(v: T) => useMemo(() => v, [v]);
