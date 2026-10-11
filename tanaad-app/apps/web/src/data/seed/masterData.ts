import type { CompanyProfile, Purchase, RefItem, RefList, SiteCode, SiteSettings } from '@tanaad/domain';
import { SITE_LIST } from '@/config/sites';

/**
 * Starting master data. Everything here is editable in Settings → Master data.
 * `example: true` marks values the site visit did not confirm; they are placeholders for the client to replace.
 */
export function buildMasterData(): { refs: RefItem[]; siteSettings: Record<SiteCode, SiteSettings>; purchases: Purchase[]; companyProfiles: Record<SiteCode, CompanyProfile> } {
  const refs: RefItem[] = [];
  let n = 0;
  const add = (list: RefList, label: string, o: Partial<RefItem> = {}) => { const order = refs.filter((r) => r.list === list && r.siteId === o.siteId).length; refs.push({ id: o.id ?? `ref_${list}_${(n++).toString(36)}`, list, label, active: true, order, ...o }); };

  // Units of measure (group-wide)
  for (const [label, ex] of [['kg', false], ['tonne', false], ['piece', false], ['bundle', false], ['roll', false], ['pack', true], ['sack', true], ['bag', false], ['batch', false]] as const) add('unit', label, { example: ex });

  // The seven enforced expense categories: fixed set, labels and order editable by a Group Admin.
  const cats: [string, string][] = [['wages', 'Wages'], ['materials', 'Materials'], ['spares', 'Spares'], ['utilities', 'Utilities'], ['transport', 'Transport'], ['food', 'Food'], ['other', 'Other']];
  for (const [id, label] of cats) add('expense_category', label, { id, system: true, color: `var(--cat-${id})` });

  for (const site of SITE_LIST) {
    const siteId = site.id;
    site.sectors.forEach((x) => add('sector', x, { siteId }));
    site.downtimeReasons.forEach((x) => add('downtime_reason', x, { siteId, example: true }));
    for (const [cat, subs] of Object.entries(site.expenseSubcategories)) (subs ?? []).forEach((x) => add('expense_subcategory', x, { siteId, parentId: cat, example: true }));
    for (const x of ['Belt snapped', 'Bearing seized', 'Heater band failed', 'Power surge', 'Blockage']) add('breakdown_cause', x, { siteId, example: true });
    add('quick_expense', 'Boda', { siteId, parentId: 'transport' });
    add('quick_expense', 'Staff lunch', { siteId, parentId: 'food' });
    add('quick_expense', 'Generator fuel', { siteId, parentId: 'utilities', example: true });
    for (const d of [7, 15, 30]) add('contract_term', `${d} days`, { siteId, value: d, unit: 'days' });
    for (const r of [12000, 13000, 15000]) add('daily_rate', `UGX ${r.toLocaleString()}`, { siteId, value: r, unit: 'UGX/day', example: true });
    for (const v of ['UBK 442X', 'UAX 918L', 'UBE 207T']) add('vehicle', v, { siteId, example: true });
  }
  for (const d of [50000, 20000, 10000, 5000, 2000, 1000, 500]) add('denomination', `UGX ${d.toLocaleString()}`, { value: d, unit: 'UGX' });

  // Group-wide commercial lists. Markets and the cash/mobile-money split are from the briefing; bank transfer is an example.
  for (const m of ['Uganda', 'Rwanda', 'South Sudan']) add('market', m);
  add('payment_method', 'Cash'); add('payment_method', 'MTN Mobile Money'); add('payment_method', 'Airtel Money'); add('payment_method', 'Bank transfer', { example: true });
  for (const d of [30, 45]) add('credit_term', `${d} days`, { value: d, unit: 'days', example: true });

  // Mats (confirmed: local pellets in 40 kg bags, yarn from Egypt, 5 kg masterbatch, colours seen on site are not named in the briefing)
  add('material', 'Pellets, local', { siteId: 'mats', value: 40, unit: 'kg/bag' });
  add('material', 'Yarn (Egypt)', { siteId: 'mats', value: 25, unit: 'kg/bag', example: true });
  add('material', 'Colour masterbatch', { siteId: 'mats', value: 5, unit: 'kg/batch' });
  add('pellet_source', 'Local pellets, 40 kg bags', { siteId: 'mats' });
  add('pellet_source', 'Recycled black pellet', { siteId: 'mats', example: true });
  for (const [label, color] of [['Blue', '#2F6B8A'], ['Green', '#5B8C5A'], ['Red', '#8a2f4f'], ['Purple', '#7A4F8A'], ['Cream', '#c9b58a']]) add('colour', label, { siteId: 'mats', color, example: true });
  for (const x of ['Edge trim', 'Faulty string', 'Loom waste']) add('waste_source', x, { siteId: 'mats', example: x === 'Loom waste' });

  // Bags (confirmed: black and white, five sizes, several own brands; roll type "Faras" is on the sticker. Size names and other brands are not in the briefing.)
  for (const x of ['Size 1', 'Size 2', 'Size 3', 'Size 4', 'Size 5']) add('bag_size', x, { siteId: 'bags', example: true });
  add('bag_colour', 'Black', { siteId: 'bags', color: '#1d272b' });
  add('bag_colour', 'White', { siteId: 'bags', color: '#d9d4cb' });
  add('brand', 'Faras', { siteId: 'bags' });
  add('material', 'Resin', { siteId: 'bags', value: 25, unit: 'kg/bag', example: true });
  add('material', 'Black masterbatch', { siteId: 'bags', value: 25, unit: 'kg/bag', example: true });
  add('material', 'White masterbatch', { siteId: 'bags', value: 25, unit: 'kg/bag', example: true });
  add('waste_source', 'Film scrap', { siteId: 'bags' });

  // Recycling (nothing about intake rules, grades or sack size is confirmed)
  for (const x of ['Natural', 'Mixed colour', 'Black']) add('pellet_grade', x, { siteId: 'recycling', example: true });
  for (const d of [0, 4, 6, 8, 10, 12]) add('deduction_option', `${d}%`, { siteId: 'recycling', value: d, unit: '%', example: true });
  for (const p of [850, 900, 950]) add('price_option', `UGX ${p}/kg`, { siteId: 'recycling', value: p, unit: 'UGX/kg', example: true });
  add('material', 'HDPE scrap', { siteId: 'recycling', unit: 'kg' });
  add('material', 'Pellet sack', { siteId: 'recycling', value: 25, unit: 'kg/sack', example: true });

  const siteSettings = Object.fromEntries(SITE_LIST.map((x) => [x.id, { ...x.thresholds, expenseApprovalLimit: 500_000, archiveAfterAbsentDays: 5, contractWarningDays: 3, standardDayHours: 8, monthWorkingDays: 26, downtimeReasonAfterMin: 60, materialCostPerKg: x.id === 'mats' ? 3900 : x.id === 'bags' ? 5200 : 950 }])) as Record<SiteCode, SiteSettings>;
  // One example import so the screen is not empty. Shape follows public trade records (HDPE from Saudi Arabia, via Mombasa, in transit to Kampala);
  // supplier, prices and costs are placeholders and the record is marked as an example.
  const purchases: Purchase[] = [{ id: 'pur_example_1', siteId: 'bags', reference: 'PO-0001', supplier: 'Resin supplier (example)', originCountry: 'Saudi Arabia', material: 'Resin', qtyKg: 25500, unitPrice: 1.1, currency: 'USD', fxReference: 3720, costs: [{ label: 'Sea freight to Mombasa', amount: 2400, currency: 'USD' }, { label: 'Clearing and transit to Kampala', amount: 3_500_000, currency: 'UGX' }], status: 'in_transit', orderedOn: '2026-09-18', example: true }];
  const blank: CompanyProfile = { address: '', phone: '', email: '', tin: '', bankDetails: '', mobileMoney: '', vatRatePct: 0, efrisConnected: false };
  const companyProfiles = Object.fromEntries(SITE_LIST.map((x) => [x.id, { ...blank }])) as Record<SiteCode, CompanyProfile>;
  return { refs, siteSettings, purchases, companyProfiles };
}
