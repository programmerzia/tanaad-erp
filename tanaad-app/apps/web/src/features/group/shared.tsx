import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { Scale, Flame, Wallet, Gauge, PackageCheck, CreditCard, UserX, CalendarClock, Boxes, FileWarning, OctagonAlert, AlertTriangle, Info, type LucideIcon } from 'lucide-react';
import type { BusinessException, CashCategory, Client, ExceptionKind, RefItem, SiteCode } from '@tanaad/domain';
import { categoryLabel } from '@/config/categories';
import { cn, useHotkey, type Tone } from '@/components/ui';
import { SITES } from '@/config/sites';
import { SITE_COLOR, SITE_ICON } from '@/config/siteIdentity';
import { DEMO_HOUR } from '@/data/selectors';

/* ───────────────────────────── Site identity ───────────────────────────── */
/** Small site tag used across every group screen: the site's icon in its colour on a tint of it. */
export function SiteBadge({ site, className }: { site?: SiteCode; className?: string }) {
  const id = site ?? 'group'; const Icon = SITE_ICON[id]; const color = SITE_COLOR[id];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-[5px] pl-1 pr-1.5 h-[20px] touch:h-[24px] t-xs font-semibold leading-none whitespace-nowrap text-[var(--text)]', className)} style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      <Icon className="size-3 shrink-0" style={{ color }} strokeWidth={2.25} />{site ? SITES[site].shortName : 'Group'}
    </span>
  );
}

/** The site's solid mark: white icon on the site colour. Use it once per card or row that belongs to a site. */
export function SiteMark({ site, size = 28, className }: { site: SiteCode | 'group'; size?: number; className?: string }) {
  const Icon = SITE_ICON[site];
  return <span className={cn('rounded-md grid place-items-center shrink-0 text-white', className)} style={{ width: size, height: size, background: SITE_COLOR[site] }}><Icon style={{ width: size * 0.55, height: size * 0.55 }} strokeWidth={2} /></span>;
}

/** An icon in a tinted square: the house way to give a row, KPI or empty state a colour. */
export function IconChip({ icon: Icon, color = 'var(--text-3)', size = 'md', className, title }: { icon: LucideIcon; color?: string; size?: 'sm' | 'md' | 'lg'; className?: string; title?: string }) {
  const box = size === 'sm' ? 'size-6 rounded-md' : size === 'lg' ? 'size-9 touch:size-10 rounded-lg' : 'size-7 touch:size-8 rounded-md';
  const glyph = size === 'sm' ? 'size-3.5' : size === 'lg' ? 'size-[18px] touch:size-5' : 'size-4';
  return <span title={title} className={cn('grid place-items-center shrink-0', box, className)} style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}><Icon className={glyph} strokeWidth={2} /></span>;
}

/* ───────────────────────────── Clients ───────────────────────────── */
/** Two-letter tag for a market, worked out from its name so a market added in Settings needs no code: "South Sudan" → SS, "Rwanda" → RW. */
export const marketCode = (market: string) => { const w = market.trim().split(/\s+/).filter(Boolean); return (w.length > 1 ? w.map((x) => x[0]).join('') : (w[0] ?? '').slice(0, 2)).slice(0, 3).toUpperCase(); };
export function CountryTag({ country, className }: { country: Client['country']; className?: string }) {
  return <span title={country} className={cn('code inline-grid place-items-center h-[18px] min-w-[24px] px-1 rounded-[4px] border border-[var(--line-2)] bg-[var(--surface-2)] t-xs font-semibold text-[var(--text-2)] leading-none', className)}>{marketCode(country)}</span>;
}

/* ───────────────────────────── Master data ───────────────────────────── */
/** Label of a cash category as the client named it in Settings (list `expense_category`); system categories such as a sale keep their fixed name. */
export const catLabel = (refs: RefItem[], c: CashCategory) => refs.find((r) => r.list === 'expense_category' && r.id === c)?.label ?? categoryLabel(c) ?? cap(c);
/** A Stat sub-line that may wrap to two lines instead of being cut. */
export function Wrap({ children }: { children: ReactNode }) { return <span className="block whitespace-normal leading-snug line-clamp-2">{children}</span>; }

/* ───────────────────────────── Exceptions ───────────────────────────── */
export const KIND_META: Record<ExceptionKind, { label: string; icon: LucideIcon }> = {
  gate_variance: { label: 'Gate variance', icon: Scale },
  mass_gap: { label: 'Mass gap', icon: Flame },
  cash_variance: { label: 'Cash variance', icon: Wallet },
  below_benchmark: { label: 'Below benchmark', icon: Gauge },
  pod_discrepancy: { label: 'Delivery short', icon: PackageCheck },
  credit_over_limit: { label: 'Credit over limit', icon: CreditCard },
  ghost_worker: { label: 'Ghost worker', icon: UserX },
  contract_expiring: { label: 'Contract expiring', icon: CalendarClock },
  low_stock: { label: 'Low stock', icon: Boxes },
  not_logged: { label: 'Not logged', icon: FileWarning },
};

export const severityTone = (sev: BusinessException['severity']): Tone => (sev === 'critical' ? 'bad' : sev === 'warning' ? 'warn' : 'neutral');
export const severityLabel: Record<BusinessException['severity'], string> = { critical: 'Critical', warning: 'Warning', info: 'Info' };
export const severityColor = (sev: BusinessException['severity']) => (sev === 'critical' ? 'var(--bad)' : sev === 'warning' ? 'var(--warn)' : 'var(--text-3)');
export const SEVERITY_ICON: Record<BusinessException['severity'], LucideIcon> = { critical: OctagonAlert, warning: AlertTriangle, info: Info };
export const SEVERITIES: BusinessException['severity'][] = ['critical', 'warning', 'info'];

/* ───────────────────────────── Small formatters ───────────────────────────── */
/** Unit name for a site's output number. */
export const unitName = (site: SiteCode) => (site === 'mats' ? 'mats' : site === 'bags' ? 'packs' : 'sacks');
export const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Monday of the week containing `day` (ISO weeks start Monday). */
export const weekStart = (day: string) => { const d = new Date(day + 'T00:00:00Z'); const diff = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - diff); return d.toISOString().slice(0, 10); };

/** "3 h ago", "2 d ago": how long before the demo clock (today at DEMO_HOUR:20) something happened. */
export function agoLabel(iso: string, today: string) {
  const now = new Date(`${today}T${String(DEMO_HOUR).padStart(2, '0')}:20:00Z`).getTime();
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/); if (!m) return '';
  const then = new Date(`${m[1]}T${m[2]}:${m[3]}:00Z`).getTime();
  const min = Math.round((now - then) / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} d ago`;
}

/* ───────────────────────────── Small parts ───────────────────────────── */
/** Tight label/value pair used in sheets and cards. */
export function KV({ k, v, className }: { k: ReactNode; v: ReactNode; className?: string }) {
  return <div className={cn('flex items-baseline justify-between gap-3 py-1.5 border-b border-[var(--line)] last:border-b-0 t-base', className)}><span className="text-[var(--text-2)] min-w-0">{k}</span><span className="num font-medium text-right">{v}</span></div>;
}

/** On/off switch for a setting. Space or Enter toggles it. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn('relative shrink-0 w-8 h-[18px] touch:w-11 touch:h-6 rounded-full transition-colors disabled:opacity-45', checked ? 'bg-[var(--brand)]' : 'bg-[var(--line-2)]')}>
      <span className={cn('absolute top-0.5 left-0.5 size-[14px] touch:size-5 rounded-full transition-transform', checked ? 'bg-[var(--brand-contrast)] translate-x-[14px] touch:translate-x-5' : 'bg-[var(--surface)]')} />
    </button>
  );
}

/** Quoted reason, as written by the person who made the change. */
export function ReasonQuote({ children, className }: { children: ReactNode; className?: string }) {
  return <blockquote className={cn('m-0 border-l-2 border-[var(--accent)] pl-2.5 t-sm text-[var(--text-2)]', className)}>“{children}”</blockquote>;
}

/* ───────────────────────────── Keyboard helpers ───────────────────────────── */
const inWidget = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('table,[role="dialog"],[role="menu"],[role="listbox"],[role="tablist"],[role="radiogroup"]');

/**
 * Page-level list selection for master-detail screens: ↑/↓ or J/K move, Home/End jump.
 * Stays out of the way while focus is inside a table, a tab strip, a menu or an open sheet.
 */
export function useListKeys(count: number, index: number, onIndex: (i: number) => void, opts: { enabled?: boolean; noun?: string } = {}) {
  const enabled = (opts.enabled ?? true) && count > 0; const noun = opts.noun ?? 'item';
  const to = (i: number) => onIndex(Math.max(0, Math.min(count - 1, i)));
  useHotkey(['arrowdown', 'j'], (e) => { if (!inWidget(e.target)) to(index + 1); }, { label: `Next ${noun}`, enabled });
  useHotkey(['arrowup', 'k'], (e) => { if (!inWidget(e.target)) to(index - 1); }, { label: `Previous ${noun}`, enabled });
  useHotkey('home', (e) => { if (!inWidget(e.target)) to(0); }, { label: `First ${noun}`, enabled, hidden: true });
  useHotkey('end', (e) => { if (!inWidget(e.target)) to(count - 1); }, { label: `Last ${noun}`, enabled, hidden: true });
}

/**
 * Roving focus for a vertical list of buttons. Put onKeyDown={rovingKeys} on the container and data-roving on each item:
 * ↑/↓ or J/K move focus, Home/End jump. Enter and Space stay with the focused button.
 */
export function rovingKeys(e: ReactKeyboardEvent<HTMLElement>) {
  if (!['ArrowDown', 'ArrowUp', 'j', 'k', 'Home', 'End'].includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-roving]')]; if (!items.length) return;
  const i = items.indexOf(document.activeElement as HTMLElement);
  const n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' || e.key === 'j' ? 1 : -1)));
  e.preventDefault(); e.stopPropagation(); items[n]?.focus();
}

/** Hand a selection to the next group screen (cockpit → approvals / credit desk) without a URL parameter. */
let presetSelection: string | null = null;
export const setPresetSelection = (id: string) => { presetSelection = id; };
export const takePresetSelection = () => { const v = presetSelection; presetSelection = null; return v; };

/** Save rows as a CSV file (opens in Excel). Used by the export buttons on the group ledgers. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | undefined)[][]) {
  const esc = (v: string | number | undefined) => { const t = v === undefined ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const blob = new Blob([[header, ...rows].map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
