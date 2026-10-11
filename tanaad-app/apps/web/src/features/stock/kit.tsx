import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Settings2, type LucideIcon } from 'lucide-react';
import type { Product, SiteCode } from '@tanaad/domain';
import { useGo, useQueryParam } from '@/app/hooks';
import { Badge, Button, Empty, NumberPad, cn, useIsTouch } from '@/components/ui';

/** Local helpers for the stock wall, count, tagging, spares and breakdown screens. */

/* ------------------------------------------------------------------ words */
export interface UnitWords { one: string; many: string; title: string }
/** What one sticker stands for on each site. */
export const unitWords = (site: SiteCode): UnitWords => (site === 'mats' ? { one: 'bundle', many: 'bundles', title: 'Bundles' } : site === 'bags' ? { one: 'unit', many: 'packs and rolls', title: 'Packs and rolls' } : { one: 'sack', many: 'sacks', title: 'Sacks' });
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-UG')} ${n === 1 ? one : many}`;
export const dayOf = (iso: string) => iso.slice(0, 10);

/* ------------------------------------------------------------------ identity */
/** Zones get a fixed series colour by their position in the site's zone list, so the same zone reads the same everywhere. */
export const ZONE_COLORS = ['var(--series-1)', 'var(--series-3)', 'var(--series-4)', 'var(--series-7)', 'var(--series-5)', 'var(--series-2)'];
export const zoneColor = (index: number) => ZONE_COLORS[index % ZONE_COLORS.length];

export function Swatch({ colour, className }: { colour?: string; className?: string }) {
  return <span aria-hidden className={cn('size-2.5 rounded-[3px] shrink-0 border border-[rgb(0_0_0/.12)]', className)} style={{ background: colour ?? 'var(--text-4)' }} />;
}
/** Swatch, internal name and (muted) commercial name on one line. */
export function ProductName({ product, className, strong = true }: { product?: Product; className?: string; strong?: boolean }) {
  if (!product) return <span className="text-[var(--text-4)]">—</span>;
  return (
    <span className={cn('inline-flex items-center gap-2 min-w-0', className)}>
      <Swatch colour={product.colour} />
      <span className={cn('truncate', strong && 'font-medium')}>{product.internalName}</span>
      {product.commercialName && <span className="t-sm text-[var(--text-3)] truncate">{product.commercialName}</span>}
    </span>
  );
}
/** The house icon chip: an icon in a tinted rounded square. */
export function IconChip({ icon: Icon, color = 'var(--text-3)', className }: { icon: LucideIcon; color?: string; className?: string }) {
  return <span className={cn('size-8 rounded-lg grid place-items-center shrink-0', className)} style={{ background: `color-mix(in srgb, ${color} 13%, transparent)`, color }}><Icon className="size-4" strokeWidth={2} /></span>;
}

/* ------------------------------------------------------------------ states */
export const signed = (v: number) => (v === 0 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toLocaleString('en-UG')}`);
/** Counted minus system. Green only when it matches; any difference is a variance to explain. */
export function Variance({ v, className }: { v: number | undefined; className?: string }) {
  if (v === undefined) return <span className={cn('text-[var(--text-4)]', className)}>—</span>;
  return <Badge tone={v === 0 ? 'ok' : 'bad'} dot className={className}>{v === 0 ? 'Match' : `${signed(v)} ${v > 0 ? 'over' : 'short'}`}</Badge>;
}

/* ------------------------------------------------------------------ layout */
/** One numbered section of a workstation form. */
export function Step({ n, title, hint, right, children, className }: { n: number; title: ReactNode; hint?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('px-[var(--pad)] py-3 border-b border-[var(--line)] last:border-b-0', className)}>
      <div className="flex items-center gap-2 mb-2 min-w-0">
        <span className="size-5 touch:size-6 rounded-md grid place-items-center t-xs font-semibold num bg-[var(--surface-3)] text-[var(--text-2)] shrink-0">{n}</span>
        <h4 className="t-base font-semibold whitespace-nowrap">{title}</h4>
        {hint && <span className="t-sm text-[var(--text-3)] truncate min-w-0">{hint}</span>}
        {right && <span className="ml-auto shrink-0 flex items-center gap-1.5">{right}</span>}
      </div>
      {children}
    </section>
  );
}
/**
 * Workstation layout: the form on the left, live panels on the right. Unlike the shared Split it only goes side by side
 * from 1280 px, because these asides are wide; below that the panels sit under the form, two abreast on a tablet.
 */
export function Bench({ children, aside, asideWidth = 400 }: { children: ReactNode; aside: ReactNode; asideWidth?: number }) {
  return (
    <div className="grid gap-[var(--gap)] items-start xl:[grid-template-columns:minmax(0,1fr)_var(--aside)]" style={{ ['--aside' as string]: `${asideWidth}px` }}>
      <div className="min-w-0">{children}</div>
      <aside className="min-w-0 grid gap-[var(--gap)] items-start md:grid-cols-2 xl:grid-cols-1">{aside}</aside>
    </div>
  );
}
/** A label over a value, for definition lists in inspectors and summaries. */
export function Fact({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return <div className={cn('min-w-0', className)}><div className="t-xs text-[var(--text-3)] font-medium truncate">{label}</div><div className="t-base font-medium num truncate">{children}</div></div>;
}
/** A line in a key–value list: label left, value right, hairline between rows. */
export function KV({ label, children, dot }: { label: ReactNode; children: ReactNode; dot?: string }) {
  return <div className="flex items-center gap-2 min-h-7 touch:min-h-9 t-sm border-b border-[var(--line)] last:border-b-0">{dot && <span className="size-2 rounded-[2px] shrink-0" style={{ background: dot }} />}<span className="text-[var(--text-2)] truncate flex-1">{label}</span><span className="num font-medium text-[var(--text)] shrink-0">{children}</span></div>;
}

/* ------------------------------------------------------------------ quantity with a long unit */
/**
 * NumberPad with its unit. The shared field only has room for a two or three letter suffix inside it on a desk,
 * so longer unit words ("bundles", "batches") sit beside the field there; the touch keypad shows them itself.
 */
export function QtyPad({ unit, width = 180, ...pad }: Omit<Parameters<typeof NumberPad>[0], 'suffix'> & { unit?: string; width?: number }) {
  const touch = useIsTouch(); const short = !unit || unit.length <= 3;
  if (touch || short) return <NumberPad {...pad} suffix={unit} />;
  // With a confirm button beside the field the label has to name the unit; a word after the button reads as part of it.
  if (pad.onDone) return <NumberPad {...pad} />;
  return (
    <div>
      {pad.label && <div className="t-sm font-medium text-[var(--text-2)] mb-1">{pad.label}</div>}
      <div className="flex items-center gap-2.5"><div className="shrink-0" style={{ width }}><NumberPad {...pad} label={undefined} /></div><span className="t-base text-[var(--text-2)] truncate">{unit}</span></div>
    </div>
  );
}

/* ------------------------------------------------------------------ master data that is still empty */
/**
 * Shown where a choice comes from master data and the list is still empty: says what is missing and opens Settings.
 * `inline` is the one-line form for a form row; the default is a full empty state for a panel.
 */
export function SetupHint({ what, where = 'Master data', inline, icon }: { what: string; where?: string; inline?: boolean; icon?: LucideIcon }) {
  const go = useGo(); const open = () => go.site('settings');
  if (inline) return <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-dashed border-[var(--line-2)] px-3 py-1.5 t-sm text-[var(--text-2)]"><span className="min-w-0 flex-1">No {what} yet. Add them in Settings → {where}.</span><Button size="sm" icon={Settings2} onClick={open}>Open Settings</Button></div>;
  return <Empty icon={icon ?? Settings2} title={`No ${what} yet`} hint={`Add ${what} in Settings → ${where}.`} action={<Button size="sm" icon={Settings2} onClick={open}>Open Settings</Button>} />;
}
/** The word for one pack of a material, from its master-data unit ("kg/bag" → "bag"). Undefined when the material is declared in kilos. */
export const packWord = (unit?: string) => { const w = unit?.split('/')[1]?.trim(); return w || undefined; };

/* ------------------------------------------------------------------ search prefilled from ?q= */
/** Search text for a list screen. The command palette deep-links with ?q=, so the box starts from it. */
export function useSearch() {
  const fromUrl = useQueryParam('q');
  const [q, setQ] = useState(fromUrl ?? '');
  useEffect(() => { if (fromUrl !== undefined) setQ(fromUrl); }, [fromUrl]);
  return [q, setQ] as const;
}
export const matches = (q: string, ...fields: (string | undefined)[]) => { const t = q.trim().toLowerCase(); return !t || fields.some((f) => f?.toLowerCase().includes(t)); };
