import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { CashCategory, CashEntry, ExpenseCategory } from '@tanaad/domain';
import { useRefList } from '@/app/hooks';
import { CATEGORY_META, EXPENSE_CATEGORIES, SITE_MANAGER_PIN, categoryColor, categoryLabel } from '@/config/categories';

// Only identity (icon, colour) and the demo PIN come from config; labels, order, limits and denominations are master data.
export { CATEGORY_META, SITE_MANAGER_PIN, categoryColor };

export interface ExpenseCat { id: ExpenseCategory; label: string; icon: LucideIcon; hint: string; color: string }
const FALLBACK_CATS: Pick<ExpenseCat, 'id' | 'label'>[] = EXPENSE_CATEGORIES.map((id) => ({ id, label: CATEGORY_META[id].label }));

/**
 * The expense categories as configured in Settings → Master data: labels and order from the `expense_category` list,
 * icon and colour by id (the ids are the seven enforced keys).
 */
export function useExpenseCategories() {
  const refs = useRefList('expense_category');
  return useMemo(() => {
    const items: ExpenseCat[] = refs.filter((r) => r.id in CATEGORY_META).map((r) => { const id = r.id as ExpenseCategory; return { id, label: r.label, icon: CATEGORY_META[id].icon, hint: CATEGORY_META[id].hint, color: categoryColor(id) }; });
    const names = new Map<string, string>(items.map((c) => [c.id, c.label]));
    /** Label of any cash category: the configured name for an expense category, the built-in one for sales, receipts and the like. */
    const label = (c: CashCategory) => names.get(c) ?? categoryLabel(c);
    return { items, label };
  }, [refs]);
}

export interface CategorySlice { category: ExpenseCategory; label: string; value: number; color: string }

/** Payouts and advances are wages; anything else that is not one of the seven lands in Other, so the split always adds up to money out. */
const bucketOf = (c: CashEntry['category']): ExpenseCategory => (c in CATEGORY_META ? (c as ExpenseCategory) : c === 'payout' || c === 'advance' ? 'wages' : 'other');

/** Money out by category, in the fixed category order so a colour never changes place between two bars. */
export function moneyOutSplit(entries: CashEntry[], cats: Pick<ExpenseCat, 'id' | 'label'>[] = FALLBACK_CATS): CategorySlice[] {
  const by = new Map<ExpenseCategory, number>();
  for (const e of entries) if (e.direction === 'out') { const b = bucketOf(e.category); by.set(b, (by.get(b) ?? 0) + e.amount); }
  // A category switched off in Settings still shows its past spending, after the active ones.
  const order = [...cats, ...FALLBACK_CATS.filter((f) => !cats.some((c) => c.id === f.id))];
  return order.map((c) => ({ category: c.id, label: c.label, value: by.get(c.id) ?? 0, color: categoryColor(c.id) })).filter((x) => x.value > 0);
}

/** A donut reads up to six parts: largest first, the tail folded into one grey slice. */
export function donutSlices(split: { label: string; value: number; color: string }[]) {
  const sorted = [...split].sort((a, b) => b.value - a.value);
  return sorted.length > 6 ? [...sorted.slice(0, 5), { label: 'Everything else', value: sorted.slice(5).reduce((t, x) => t + x.value, 0), color: 'var(--text-4)' }] : sorted;
}

/** Clock time of an ISO stamp. Tolerates an unpadded hour ("T8:54"), which the shared formatter prints raw. */
export const timeOf = (iso: string) => { const m = iso.match(/T(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : iso; };

/** The stamp with a padded hour, so plain string order is time order. */
export const stampOf = (iso: string) => iso.replace(/T(\d):/, 'T0$1:');

/** "3–10 Oct" inside one month, "28 Sep – 3 Oct" across two. */
export const spanLabel = (from: string, to: string, short: (d: string) => string) => { const a = short(from), b = short(to); if (from === to) return b; const [da, ma] = a.split(' '), [, mb] = b.split(' '); return ma === mb ? `${da}–${b}` : `${a} – ${b}`; };

/** Save rows as a CSV file. */
export function downloadCsv(name: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => { const t = String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const blob = new Blob([[header, ...rows].map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

/** Print only the element marked .print-area (the shell stays off the paper). */
export const PRINT_CSS = `@media print { body * { visibility: hidden !important; } .print-area, .print-area * { visibility: visible !important; } .print-area { position: absolute !important; left: 0; top: 0; width: 100%; } * { overflow: visible !important; } .no-print, .no-print * { display: none !important; } }`;
