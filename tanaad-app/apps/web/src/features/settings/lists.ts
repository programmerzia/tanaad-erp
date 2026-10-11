import type { RefList } from '@tanaad/domain';

export interface ListMeta { key: RefList; title: string; help: string; scope: 'site' | 'group'; value?: { label: string; unit?: string }; color?: boolean; parent?: RefList; group: string; adminOnly?: boolean }

/** Every option list a user can manage. Adding a list here is all it takes to make it editable. */
export const LISTS: ListMeta[] = [
  { key: 'sector', title: 'Sectors', help: 'Where people work. Used on attendance, sign-up and headcount.', scope: 'site', group: 'People' },
  { key: 'contract_term', title: 'Contract terms', help: 'Lengths offered for fixed-term contracts.', scope: 'site', value: { label: 'Days', unit: 'days' }, group: 'People' },
  { key: 'daily_rate', title: 'Daily rates', help: 'Rates offered when registering a casual worker.', scope: 'site', value: { label: 'UGX per day', unit: 'UGX/day' }, group: 'People' },
  { key: 'expense_category', title: 'Expense categories', help: 'The enforced set. Every cash-out line must carry one. Rename and reorder only.', scope: 'group', color: true, group: 'Cash', adminOnly: true },
  { key: 'expense_subcategory', title: 'Expense sub-categories', help: 'Optional detail under a category, per site.', scope: 'site', parent: 'expense_category', group: 'Cash' },
  { key: 'quick_expense', title: 'Quick expenses', help: 'One-press shortcuts on the expense voucher.', scope: 'site', parent: 'expense_category', group: 'Cash' },
  { key: 'denomination', title: 'Cash denominations', help: 'Notes and coins counted at the daily close.', scope: 'group', value: { label: 'Value', unit: 'UGX' }, group: 'Cash', adminOnly: true },
  { key: 'material', title: 'Raw materials', help: 'What the site buys and issues. The value is the standard pack weight.', scope: 'site', value: { label: 'Standard weight', unit: 'kg' }, group: 'Production' },
  { key: 'colour', title: 'Colours', help: 'Colours of batches, string and racks.', scope: 'site', color: true, group: 'Production' },
  { key: 'pellet_source', title: 'Pellet sources', help: 'Where a mixer batch draws its pellets from.', scope: 'site', group: 'Production' },
  { key: 'bag_size', title: 'Bag sizes', help: 'Sizes the bags factory makes.', scope: 'site', group: 'Production' },
  { key: 'bag_colour', title: 'Bag colours', help: 'Colours the bags factory makes.', scope: 'site', color: true, group: 'Production' },
  { key: 'brand', title: 'Brands', help: 'Own brands goods are packed under.', scope: 'site', group: 'Production' },
  { key: 'pellet_grade', title: 'Pellet grades', help: 'Grades of recycled pellet.', scope: 'site', group: 'Production' },
  { key: 'waste_source', title: 'Waste sources', help: 'Where weighed waste comes from.', scope: 'site', group: 'Production' },
  { key: 'downtime_reason', title: 'Downtime reasons', help: 'Asked for when a machine is below target.', scope: 'site', group: 'Production' },
  { key: 'breakdown_cause', title: 'Breakdown causes', help: 'Offered when a machine is reported down.', scope: 'site', group: 'Maintenance' },
  { key: 'deduction_option', title: 'Intake deductions', help: 'Deductions for moisture and contamination offered at weigh-in.', scope: 'site', value: { label: 'Percent', unit: '%' }, group: 'Buying' },
  { key: 'price_option', title: 'Intake prices', help: 'Prices per kilogram offered at weigh-in.', scope: 'site', value: { label: 'UGX per kg', unit: 'UGX/kg' }, group: 'Buying' },
  { key: 'market', title: 'Markets', help: 'Countries you sell into. Offered when registering a client.', scope: 'group', group: 'Selling', adminOnly: true },
  { key: 'payment_method', title: 'Payment methods', help: 'How money is received and paid out.', scope: 'group', group: 'Selling', adminOnly: true },
  { key: 'credit_term', title: 'Credit terms', help: 'Credit periods offered to export clients.', scope: 'group', value: { label: 'Days', unit: 'days' }, group: 'Selling', adminOnly: true },
  { key: 'vehicle', title: 'Vehicles', help: 'Lorries used for dispatch.', scope: 'site', group: 'Dispatch' },
  { key: 'unit', title: 'Units of measure', help: 'Units products and materials are counted in.', scope: 'group', group: 'General', adminOnly: true },
];
