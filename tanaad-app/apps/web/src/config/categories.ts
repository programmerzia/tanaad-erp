import { Banknote, Package, Wrench, Zap, Bike, Utensils, MoreHorizontal, type LucideIcon } from 'lucide-react';
import type { CashCategory, ExpenseCategory } from '@tanaad/domain';

/** The seven enforced expense categories, in fixed order (also the stacked-bar order; never re-sorted so colours stay stable). */
export const EXPENSE_CATEGORIES: ExpenseCategory[] = ['wages', 'materials', 'spares', 'utilities', 'transport', 'food', 'other'];

export const CATEGORY_META: Record<ExpenseCategory, { label: string; icon: LucideIcon; hint: string }> = {
  wages: { label: 'Wages', icon: Banknote, hint: 'Casual pay, advances' },
  materials: { label: 'Materials', icon: Package, hint: 'Raw material, masterbatch' },
  spares: { label: 'Spares', icon: Wrench, hint: 'Parts for a machine' },
  utilities: { label: 'Utilities', icon: Zap, hint: 'Power, water, fuel' },
  transport: { label: 'Transport', icon: Bike, hint: 'Boda, lorry, fuel' },
  food: { label: 'Food', icon: Utensils, hint: 'Staff lunch, water' },
  other: { label: 'Other', icon: MoreHorizontal, hint: 'Airtime, stationery' },
};

export const categoryLabel = (c: CashCategory) => (c in CATEGORY_META ? CATEGORY_META[c as ExpenseCategory].label : { sale: 'Cash sale', receipt: 'Receipt', advance: 'Advance', payout: 'Payout', opening: 'Opening' }[c as Exclude<CashCategory, ExpenseCategory>]);

/** Swatch colour for a category: --cat-* in design-system/tokens.css (light + dark steps, validated for CVD separation in this fixed order). */
export const categoryColor = (c: CashCategory) => `var(--cat-${c in CATEGORY_META ? c : 'other'})`;

/** Validated categorical palette, one hue per category, stepped separately for the dark surface. Mount once per page. */
/** @deprecated The palette now lives in design-system/tokens.css (--cat-*). Kept as an empty string so old <style> mounts are harmless. */
export const CATEGORY_PALETTE_CSS = '';

/** Denominations in circulation at the sites, largest first. */
export const DENOMINATIONS = [50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500] as const;

export const SITE_MANAGER_PIN = '2468';
export const APPROVAL_LIMIT = 500_000;
