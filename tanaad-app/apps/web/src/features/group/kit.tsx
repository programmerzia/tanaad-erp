import { useEffect, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { EngagementType, SiteCode } from '@tanaad/domain';
import { registerHotkey } from '@/app/hotkeys';
import { Kbd, cn, type Tone } from '@/components/ui';
import { SITES } from '@/config/sites';
import { SITE_COLOR, SITE_ICON } from '@/config/siteIdentity';

/* Local helpers for the group finance, people, assistant and settings screens. */

export type SiteOrGroup = SiteCode | 'group';
export const siteLabel = (site: SiteOrGroup) => (site === 'group' ? 'Group' : SITES[site].shortName);
export const usd0 = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
export const signed = (n: number, f: (n: number) => string) => `${n < 0 ? '−' : ''}${f(Math.abs(n))}`;

/** Engagement types wear the same three series colours on every people chart. */
export const ENGAGEMENT: Record<EngagementType, { label: string; basis: string; color: string }> = {
  permanent: { label: 'Permanent', basis: 'monthly', color: 'var(--series-1)' },
  contract: { label: 'Fixed-term contract', basis: 'per shift', color: 'var(--series-3)' },
  casual: { label: 'Casual', basis: 'per day', color: 'var(--series-4)' },
};
export const ENGAGEMENT_TYPES: EngagementType[] = ['permanent', 'contract', 'casual'];

/** Build a CSV and hand it to the browser as a download. */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Icon in a tinted square: the house way to put a colour on a row. */
export function IconChip({ icon: Icon, color = 'var(--text-3)', size = 'md', solid, className }: { icon: LucideIcon; color?: string; size?: 'sm' | 'md' | 'lg'; solid?: boolean; className?: string }) {
  const box = size === 'sm' ? 'size-5 rounded-[5px]' : size === 'lg' ? 'size-9 rounded-lg' : 'size-7 rounded-md';
  const ico = size === 'sm' ? 'size-3' : size === 'lg' ? 'size-[18px]' : 'size-4';
  return <span className={cn('grid place-items-center shrink-0', box, className)} style={solid ? { background: color, color: '#fff' } : { background: `color-mix(in srgb, ${color} 13%, transparent)`, color }}><Icon className={ico} strokeWidth={2} /></span>;
}

/** A site's icon in its identity colour. */
export function SiteMark({ site, size = 'md', solid }: { site: SiteOrGroup; size?: 'sm' | 'md' | 'lg'; solid?: boolean }) {
  return <IconChip icon={SITE_ICON[site]} color={SITE_COLOR[site]} size={size} solid={solid} />;
}
/** Site icon and short name on one line, for table cells. */
export function SiteTag({ site, className }: { site: SiteOrGroup; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}><SiteMark site={site} size="sm" />{siteLabel(site)}</span>;
}

/** The dark band at the top of a monitor screen: identity on the left, a strip of state in the middle, actions on the right. */
export function Hero({ icon: Icon, color = SITE_COLOR.group, eyebrow, title, sub, children, actions }: { icon: LucideIcon; color?: string; eyebrow: ReactNode; title: ReactNode; sub?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <section className="hero relative overflow-hidden px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-4">
      <div className="flex items-center gap-3.5 min-w-0">
        <span className="size-12 rounded-xl grid place-items-center shrink-0 shadow-[inset_0_1px_0_rgb(255_255_255/.25)]" style={{ background: color }}><Icon className="size-6" /></span>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-white/55">{eyebrow}</div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] leading-tight">{title}</h1>
          {sub && <div className="text-[12.5px] text-white/60">{sub}</div>}
        </div>
      </div>
      {children && <div className="flex-1 min-w-[260px] max-w-[560px]">{children}</div>}
      {actions && <div className="flex flex-wrap items-center gap-2 ml-auto">{actions}</div>}
    </section>
  );
}

/** Re-skins the light controls inside it (Tabs, Kbd) for the dark hero band. */
export function OnHero({ children, className }: { children: ReactNode; className?: string }) {
  const vars = { '--surface-3': 'rgb(255 255 255 / .1)', '--surface': 'rgb(255 255 255 / .2)', '--text': '#fff', '--text-2': 'rgb(255 255 255 / .66)', '--line': 'rgb(255 255 255 / .22)' } as CSSProperties;
  return <div className={className} style={vars}>{children}</div>;
}

/** Thin share bar in any identity colour, with the percentage beside it. */
export function ShareBar({ pct, color, label, className }: { pct: number; color: string; label?: ReactNode; className?: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <span className={cn('flex items-center gap-1.5', className)}>
      <span className="flex-1 h-1 rounded-[2px] bg-[var(--surface-3)] overflow-hidden"><span className="block h-full rounded-[2px]" style={{ width: `${p}%`, background: color }} /></span>
      <span className="num t-xs text-[var(--text-3)] shrink-0 min-w-[28px] text-right">{label ?? `${Math.round(pct)}%`}</span>
    </span>
  );
}

/** Bar that grows right of the centre line for a gain and left of it for a loss. */
export function DivergingBar({ value, max = 100, tone, width = 88 }: { value: number; max?: number; tone: Tone; width?: number }) {
  const pct = Math.min(1, Math.abs(value) / (max || 1)) * 50;
  const bg = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'bad' ? 'var(--bad)' : 'var(--text-3)';
  return (
    <span className="relative inline-block h-2 rounded-[2px] bg-[var(--surface-3)] align-middle" style={{ width }} aria-hidden>
      <span className="absolute inset-y-0 rounded-[2px]" style={value >= 0 ? { left: '50%', width: `${pct}%`, background: bg } : { right: '50%', width: `${pct}%`, background: bg }} />
      <span className="absolute -top-0.5 -bottom-0.5 left-1/2 w-px bg-[var(--text-3)]" />
    </span>
  );
}

/** Label and value on one ruled line, for inspectors and config cards. */
export function Fact({ k, v, className }: { k: ReactNode; v: ReactNode; className?: string }) {
  return <div className={cn('flex items-baseline justify-between gap-3 py-1.5 border-b border-[var(--line)] last:border-b-0 t-sm', className)}><span className="text-[var(--text-2)] shrink-0">{k}</span><span className="num font-medium text-right min-w-0">{v}</span></div>;
}

/** Background for a heat-shaded cell: one hue, stronger with the value. */
export const heat = (v: number, min: number, max: number, color = 'var(--series-1)') => `color-mix(in srgb, ${color} ${Math.round(6 + (max > min ? (v - min) / (max - min) : 0.5) * 40)}%, transparent)`;

/* ───────────────────────────── Section navigation ───────────────────────────── */
export interface NavSection<T extends string> { value: T; label: string; icon: LucideIcon; hint?: string }
/**
 * Section list for a settings-style page: a vertical rail on a wide screen, a scrolling strip on a narrow one.
 * Keyboard: arrows move, Home/End jump, digits 1–9 open the nth section from anywhere on the page.
 */
export function SectionNav<T extends string>({ sections, value, onChange, label }: { sections: NavSection<T>[]; value: T; onChange: (v: T) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const pick = useRef(onChange); pick.current = onChange;
  const signature = sections.map((x) => x.value).join('|');
  useEffect(() => {
    const offs = sections.slice(0, 9).map((x, i) => registerHotkey({ keys: String(i + 1), label: `Open ${x.label}`, group: 'This page', run: () => { pick.current(x.value); refs.current[i]?.focus(); } }));
    return () => offs.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  const onKey = (e: ReactKeyboardEvent, i: number) => {
    const n = sections.length;
    const next = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault(); refs.current[next]?.focus(); onChange(sections[next].value);
  };
  return (
    <nav role="tablist" aria-label={label} aria-orientation="vertical" className="surface p-1.5 flex gap-0.5 overflow-x-auto no-scrollbar lg:flex-col lg:overflow-visible">
      {sections.map((x, i) => {
        const on = x.value === value;
        return (
          <button key={x.value} ref={(el) => { refs.current[i] = el; }} role="tab" type="button" aria-selected={on} tabIndex={on ? 0 : -1} onClick={() => onChange(x.value)} onKeyDown={(e) => onKey(e, i)}
            className={cn('relative shrink-0 flex items-center gap-2.5 rounded-md px-2 py-1.5 touch:py-2.5 text-left transition-colors', on ? 'bg-[var(--selected)] text-[var(--text)]' : 'text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-[var(--text)]')}>
            {on && <span className="hidden lg:block absolute left-0 top-2 bottom-2 w-[3px] rounded-[2px] bg-[var(--accent)]" />}
            <IconChip icon={x.icon} color={on ? 'var(--accent-strong)' : 'var(--text-3)'} className="lg:ml-1" />
            <span className="min-w-0 lg:flex-1">
              <span className="block t-base font-medium whitespace-nowrap lg:truncate">{x.label}</span>
              {x.hint && <span className="hidden lg:block t-xs text-[var(--text-3)] truncate">{x.hint}</span>}
            </span>
            <span className="hidden lg:inline-flex"><Kbd keys={String(i + 1)} /></span>
          </button>
        );
      })}
    </nav>
  );
}
