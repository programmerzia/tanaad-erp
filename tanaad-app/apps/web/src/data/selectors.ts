import type { AppState } from './store';
import type { Attendance, CashEntry, Label, Machine, Product, ProductionEntry, RefItem, RefList, Site, SiteCode, ShiftKind } from '@tanaad/domain';
import { contractState, massBalance } from '@tanaad/domain';
import { SITES } from '@/config/sites';

export const addDays = (day: string, n: number) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dow = (day: string) => new Date(day + 'T00:00:00Z').getUTCDay();
export const lastWorkingDays = (site: SiteCode, today: string, n: number) => { const out: string[] = []; let d = today; while (out.length < n) { if (!SITES[site].closedDays.includes(dow(d))) out.push(d); d = addDays(d, -1); } return out.reverse(); };

export const shiftId = (site: SiteCode, day: string, kind: ShiftKind) => `sh_${site}_${day}_${kind}`;
/** Demo clock: the seed describes 10 Oct 2026 at ~13:20, day shift in progress. Production derives this from the device clock and the site's shift table. */
export const DEMO_HOUR = 13;
/** Fraction of a 12 h shift elapsed. 1 for any shift that is not the one in progress today. */
export const shiftProgress = (today: string, day: string, kind: ShiftKind) => (day === today && kind === currentShiftKind() ? Math.max(0.1, Math.min(1, (DEMO_HOUR - (kind === 'day' ? 7 : 19)) / 12)) : 1);
export const currentShiftKind = (): ShiftKind => (DEMO_HOUR >= 7 && DEMO_HOUR < 19 ? 'day' : 'night');

export const sitePeople = (s: AppState, site: SiteCode, includeShared = true) => s.people.filter((p) => p.homeSiteId === site || (includeShared && p.sharedSites.includes(site)));
export const activeEngagement = (s: AppState, personId: string) => s.engagements.find((e) => e.personId === personId && e.status === 'active') ?? s.engagements.find((e) => e.personId === personId);

export function rosterFor(s: AppState, site: SiteCode) {
  return sitePeople(s, site).map((p) => { const eng = activeEngagement(s, p.id); const cstate = eng?.type === 'contract' ? contractState(eng.endDate, s.today, s.siteSettings?.[site]?.contractWarningDays) : 'open'; return { person: p, engagement: eng, contractState: cstate, isShared: p.homeSiteId !== site }; })
    .filter((r) => r.person.status === 'active' && !(r.engagement?.status === 'expired' && r.contractState === 'expired' && r.person.homeSiteId !== site));
}

export const attendanceFor = (s: AppState, shift: string) => s.attendance.filter((a) => a.shiftId === shift);
export function headcount(s: AppState, site: SiteCode, day: string, kind?: ShiftKind) {
  const ids = s.shifts.filter((sh) => sh.siteId === site && sh.day === day && (!kind || sh.kind === kind)).map((sh) => sh.id);
  const rows = s.attendance.filter((a) => ids.includes(a.shiftId) && a.status !== 'absent');
  return { present: rows.filter((a) => a.status === 'present').length, half: rows.filter((a) => a.status === 'half').length, total: rows.length, overtimeHours: rows.reduce((t, a) => t + a.overtimeHours, 0) };
}
export function headcountBySector(s: AppState, site: SiteCode, day: string) {
  const ids = s.shifts.filter((sh) => sh.siteId === site && sh.day === day).map((sh) => sh.id);
  const rows = s.attendance.filter((a) => ids.includes(a.shiftId) && a.status !== 'absent');
  const m = new Map<string, number>();
  for (const a of rows) { const p = s.people.find((x) => x.id === a.personId); if (p) m.set(p.sector, (m.get(p.sector) ?? 0) + 1); }
  return [...m.entries()].map(([sector, count]) => ({ sector, count })).sort((a, b) => b.count - a.count);
}

export const cashDayFor = (s: AppState, site: SiteCode, day: string) => s.cashDays.find((c) => c.siteId === site && c.day === day);
export function cashSummary(s: AppState, cashDayId: string) {
  const cd = s.cashDays.find((c) => c.id === cashDayId); const entries = s.cashEntries.filter((e) => e.cashDayId === cashDayId).sort((a, b) => a.at.localeCompare(b.at));
  const sum = (f: (e: CashEntry) => boolean) => entries.filter(f).reduce((t, e) => t + e.amount, 0);
  const sales = sum((e) => e.category === 'sale'); const receipts = sum((e) => e.direction === 'in' && e.category !== 'sale');
  const wages = sum((e) => e.category === 'wages' || e.category === 'payout'); const expenses = sum((e) => e.direction === 'out' && e.category !== 'wages' && e.category !== 'payout');
  const expectedClosing = (cd?.opening ?? 0) + sales + receipts - expenses - wages;
  const byCategory = new Map<string, number>(); for (const e of entries.filter((x) => x.direction === 'out')) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  return { cd, entries, sales, receipts, wages, expenses, expectedClosing, variance: cd?.countedClosing !== undefined ? cd.countedClosing - expectedClosing : undefined, byCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount) };
}
export function cashInSafe(s: AppState, site: SiteCode) { const open = s.cashDays.filter((c) => c.siteId === site).sort((a, b) => b.day.localeCompare(a.day))[0]; return open ? cashSummary(s, open.id).expectedClosing : 0; }

export const machinesOf = (s: AppState, site: SiteCode, stage?: string) => s.machines.filter((m) => m.siteId === site && (!stage || m.stageCode === stage));
export const benchmarkFor = (s: AppState, machineId: string, productId?: string) => (productId ? s.benchmarks.find((b) => b.machineId === machineId && b.productId === productId)?.unitsPerShift : undefined);
export function machineWall(s: AppState, site: SiteCode, day: string, kind: ShiftKind) {
  const sh = shiftId(site, day, kind); const wallStage = site === 'mats' ? 'weave' : site === 'bags' ? 'extrude' : 'pelletise';
  return machinesOf(s, site, wallStage).map((m) => {
    const entry = s.production.find((p) => p.machineId === m.id && p.shiftId === sh);
    const product = entry?.productId ? s.products.find((p) => p.id === entry.productId) : undefined;
    const bench = entry ? benchmarkFor(s, m.id, entry.productId) : undefined;
    const operator = entry?.operatorId ? s.people.find((p) => p.id === entry.operatorId) : undefined;
    const progress = shiftProgress(s.today, day, kind);
    const expectedSoFar = bench ? Math.round(bench * progress) : undefined;
    const pct = expectedSoFar && entry ? Math.round((entry.goodUnits / expectedSoFar) * 100) : undefined;
    const state: 'arriving' | 'down' | 'not_logged' | 'below' | 'ok' | 'logged' = m.status === 'arriving' ? 'arriving' : m.status === 'down' ? 'down' : !entry ? 'not_logged' : pct !== undefined && pct < (s.siteSettings?.[site]?.benchmarkPct ?? SITES[site].thresholds.benchmarkPct) && !entry.downtimeReason ? 'below' : pct !== undefined ? 'ok' : 'logged';
    return { machine: m, entry, product, benchmark: bench, expectedSoFar, progress, operator, pct, state };
  });
}
export function massBalanceDay(s: AppState, site: SiteCode, day: string) {
  const entries = s.production.filter((p) => p.siteId === site && p.day === day);
  const firstStage = site === 'mats' ? 'mixer' : site === 'bags' ? 'extrude' : 'pelletise';
  const kgIn = entries.filter((e) => e.stageCode === firstStage).reduce((t, e) => t + e.inputKg, 0);
  // Mats: mixer in → woven out. Bags: resin into extruders → rolls out (conversion is a second balance on rolls). Recycling: scrap into the lines → pellets out.
  const lastStage = site === 'mats' ? 'weave' : site === 'bags' ? 'extrude' : 'pelletise';
  const kgOut = entries.filter((e) => e.stageCode === lastStage).reduce((t, e) => t + e.outputKg, 0);
  const wasteKg = site === 'mats' ? entries.filter((e) => e.stageCode === 'store').reduce((t, e) => t + e.outputKg, 0) : s.labels.filter((l) => l.siteId === site && l.kind === 'sack' && l.day === day && !l.productId).reduce((t, l) => t + l.qtyKg, 0);
  const wipDeltaKg = site === 'mats' ? s.labels.filter((l) => l.siteId === site && l.kind === 'rack' && l.day === day && l.status === 'in_stock').reduce((t, l) => t + l.qtyKg, 0) : 0;
  return { kgIn, kgOut, wasteKg, wipDeltaKg, ...massBalance({ kgIn, kgOut, wipDeltaKg, wasteKg, allowedLossPct: s.siteSettings?.[site]?.massGapPct ?? SITES[site].thresholds.massGapPct }) };
}
export function outputToday(s: AppState, site: SiteCode, day: string) {
  const wallStage = site === 'mats' ? 'weave' : site === 'bags' ? 'convert' : 'pelletise';
  const entries = s.production.filter((p) => p.siteId === site && p.day === day && p.stageCode === wallStage);
  const by = new Map<string, { product?: Product; units: number; kg: number; target: number }>();
  for (const e of entries) { const key = e.productId ?? 'all'; const cur = by.get(key) ?? { product: s.products.find((p) => p.id === e.productId), units: 0, kg: 0, target: 0 }; cur.units += e.goodUnits; cur.kg += e.outputKg; cur.target += benchmarkFor(s, e.machineId, e.productId) ?? 0; by.set(key, cur); }
  return [...by.values()].sort((a, b) => b.units - a.units);
}

export function stockByProduct(s: AppState, site: SiteCode) {
  const inStock = s.labels.filter((l) => l.siteId === site && l.status === 'in_stock' && l.productId);
  const by = new Map<string, { product: Product; bundles: number; pieces: number; kg: number; zones: Map<string, number> }>();
  for (const l of inStock) { const p = s.products.find((x) => x.id === l.productId)!; const cur = by.get(p.id) ?? { product: p, bundles: 0, pieces: 0, kg: 0, zones: new Map() }; cur.bundles += 1; cur.pieces += l.qtyUnits; cur.kg += l.qtyKg; if (l.zoneId) cur.zones.set(l.zoneId, (cur.zones.get(l.zoneId) ?? 0) + 1); by.set(p.id, cur); }
  return [...by.values()].sort((a, b) => b.bundles - a.bundles);
}
export const labelHistory = (s: AppState, label: Label) => ({ label, product: s.products.find((p) => p.id === label.productId), machine: s.machines.find((m) => m.id === label.machineId), operator: s.people.find((p) => p.id === label.operatorId), parents: s.labels.filter((l) => label.parentIds.includes(l.id)), dispatch: s.dispatches.find((d) => d.scannedLabelIds.includes(label.id)) });

export function clientBalance(s: AppState, clientId: string) {
  const invoiced = s.invoices.filter((i) => s.orders.find((o) => o.id === i.orderId)?.clientId === clientId).reduce((t, i) => t + i.total, 0);
  const paid = s.payments.filter((p) => p.clientId === clientId).reduce((t, p) => t + p.amount, 0);
  const openInvoices = s.invoices.filter((i) => { const o = s.orders.find((x) => x.id === i.orderId); return o?.clientId === clientId && o.status !== 'paid'; });
  const oldest = openInvoices.sort((a, b) => a.issuedAt.localeCompare(b.issuedAt))[0];
  const ageDays = oldest ? Math.round((new Date(s.today).getTime() - new Date(oldest.issuedAt.slice(0, 10)).getTime()) / 86400000) : 0;
  const lastPayment = s.payments.filter((p) => p.clientId === clientId).sort((a, b) => b.at.localeCompare(a.at))[0];
  return { invoiced, paid, balance: invoiced - paid, openInvoices, ageDays, lastPayment };
}
export const orderTotal = (o: { lines: { bundles: number; unitPrice: number }[] }) => o.lines.reduce((t, l) => t + l.bundles * l.unitPrice, 0);
export const receivables = (s: AppState, site?: SiteCode) => s.clients.filter((c) => c.channel === 'export').map((c) => ({ client: c, ...clientBalance(s, c.id) })).filter((r) => r.balance > 0 && (!site || s.orders.some((o) => o.clientId === r.client.id && o.siteId === site)));

export const openExceptions = (s: AppState, site?: SiteCode) => s.exceptions.filter((e) => e.status === 'open' && (!site || e.siteId === site)).sort((a, b) => ({ critical: 0, warning: 1, info: 2 }[a.severity] - { critical: 0, warning: 1, info: 2 }[b.severity]) || b.raisedAt.localeCompare(a.raisedAt));
export const lowStockParts = (s: AppState, site: SiteCode) => s.parts.filter((p) => p.siteId === site && p.onHand < p.minLevel);
export const machinesDown = (s: AppState, site: SiteCode) => s.machines.filter((m) => m.siteId === site && m.status === 'down');

export function yieldByLine(s: AppState, day: string) {
  // Lines are whatever machines sit at the pelletising stage; capacity is the machine's own rated figure (Settings).
  return s.machines.filter((m) => m.siteId === 'recycling' && m.stageCode === 'pelletise' && m.status !== 'retired').map((machine) => { const es = s.production.filter((p) => p.machineId === machine.id && p.day === day); const inKg = es.reduce((t, e) => t + e.inputKg, 0); const outKg = es.reduce((t, e) => t + e.outputKg, 0); return { machine, inKg, outKg, yieldPct: inKg ? Math.round((outKg / inKg) * 1000) / 10 : 0, capacityKg: machine.capacityKgPerDay ?? 0 }; });
}
export const intakeToday = (s: AppState, day: string) => s.collectorDeliveries.filter((d) => d.day === day);

/**
 * Unit cost over a period. Costed per kilogram for pellets and per counted unit for everything else, so cost and price are on the same basis.
 * Material cost per kg is the weighted landed cost of received purchases when there are any, otherwise the site's "raw material cost" setting.
 * Returns null when the product was not made in the period: no output, no cost.
 */
export function unitCost(s: AppState, site: SiteCode, product: Product, days: string[]) {
  const prod = s.production.filter((p) => p.siteId === site && days.includes(p.day) && p.productId);
  const mine = prod.filter((p) => p.productId === product.id);
  const kgMine = mine.reduce((t, p) => t + p.outputKg, 0); const unitsMine = mine.reduce((t, p) => t + p.goodUnits, 0);
  const perKg = product.kind === 'pellet';
  const basis = perKg ? kgMine : unitsMine;
  if (basis <= 0 || kgMine <= 0) return null;
  const received = s.purchases.filter((p) => p.siteId === site && p.status === 'received' && !p.example);
  const landedKg = received.reduce((t, p) => t + (p.receivedKg ?? p.qtyKg), 0);
  const landedUgx = received.reduce((t, p) => t + (p.currency === 'USD' ? p.qtyKg * p.unitPrice * p.fxReference : p.qtyKg * p.unitPrice) + p.costs.reduce((c, x) => c + (x.currency === 'USD' ? x.amount * p.fxReference : x.amount), 0), 0);
  const materialPerKg = landedKg > 0 ? landedUgx / landedKg : s.siteSettings?.[site]?.materialCostPerKg ?? 0;
  const out = s.cashEntries.filter((e) => e.siteId === site && days.includes(e.day) && e.direction === 'out' && e.category !== 'materials');
  const overheadTotal = out.reduce((t, e) => t + e.amount, 0);
  const kgAll = prod.reduce((t, p) => t + p.outputKg, 0) || 1;
  const material = (kgMine * materialPerKg) / basis; const overhead = (overheadTotal * (kgMine / kgAll)) / basis;
  const price = product.prices.find((p) => p.channel === 'local') ?? product.prices[0];
  const priceUgx = price ? (price.currency === 'USD' ? price.amount * s.fx : price.amount) : 0;
  const total = material + overhead;
  return { basis: perKg ? 'kg' : 'unit', material: Math.round(material), overhead: Math.round(overhead), total: Math.round(total), priceUgx, marginPct: priceUgx ? Math.round(((priceUgx - total) / priceUgx) * 100) : 0, units: Math.round(basis), materialSource: landedKg > 0 ? 'purchases' : 'setting' } as const;
}

export type MachineTile = ReturnType<typeof machineWall>[number];
export type { Attendance, Machine, ProductionEntry };

/** One row per day for trend lines and sparklines. `days` usually comes from lastWorkingDays(). */
export function dailySeries(s: AppState, site: SiteCode, days: string[]) {
  const wallStage = site === 'mats' ? 'weave' : site === 'bags' ? 'extrude' : 'pelletise';
  return days.map((day) => {
    const cd = cashDayFor(s, site, day); const cs = cd ? cashSummary(s, cd.id) : undefined;
    const out = outputToday(s, site, day); const mb = massBalanceDay(s, site, day);
    const prod = s.production.filter((p) => p.siteId === site && p.day === day && p.stageCode === wallStage);
    return {
      day,
      headcount: headcount(s, site, day).total,
      units: out.reduce((t, o) => t + o.units, 0),
      target: out.reduce((t, o) => t + o.target, 0),
      kgOut: Math.round(mb.kgOut), kgIn: Math.round(mb.kgIn),
      wastePct: mb.kgIn ? Math.round((mb.wasteKg / mb.kgIn) * 1000) / 10 : 0,
      cashIn: (cs?.sales ?? 0) + (cs?.receipts ?? 0), sales: cs?.sales ?? 0,
      cashOut: (cs?.expenses ?? 0) + (cs?.wages ?? 0),
      closing: cs?.cd?.countedClosing ?? cs?.expectedClosing ?? 0,
      dispatches: s.dispatches.filter((d) => d.siteId === site && d.createdAt.startsWith(day)).length,
      downtimeMin: prod.reduce((t, p) => t + p.downtimeMin, 0),
      partial: day === s.today,
    };
  });
}
/** Portals a user may open: every site for group roles, otherwise the sites named in their roles. */
export function portalsFor(s: AppState, userId: string) {
  const u = s.users.find((x) => x.id === userId);
  const group = !!u?.roles.some((r) => r.role === 'ceo' || r.role === 'group_admin');
  const groupRole = u?.roles.find((r) => r.role === 'ceo' || r.role === 'group_admin')?.role;
  return {
    user: u, group, groupRole,
    sites: (['mats', 'bags', 'recycling'] as SiteCode[]).map((id) => ({ id, roles: group && groupRole ? [groupRole] : (u?.roles.filter((r) => r.siteId === id).map((r) => r.role) ?? []) })),
  };
}

/* ───────────── Master data ───────────── */
/** Active options of a list for a site (site-specific first, then group-wide), in the user's order. */
export function refList(s: AppState, list: RefList, site?: SiteCode, opts: { parentId?: string; includeInactive?: boolean } = {}): RefItem[] {
  return s.refs.filter((r) => r.list === list && (r.siteId === undefined || r.siteId === site) && (opts.includeInactive || r.active) && (opts.parentId === undefined || r.parentId === opts.parentId)).sort((a, b) => (a.siteId ? 0 : 1) - (b.siteId ? 0 : 1) || a.order - b.order);
}
export const refLabel = (s: AppState, id: string | undefined) => s.refs.find((r) => r.id === id)?.label ?? id ?? '';
/** The site as configured now: the static shape from config/sites with every user-managed list and rule overlaid from master data. */
export function liveSite(s: AppState, base: Site): Site {
  const subs: Site['expenseSubcategories'] = {};
  for (const r of refList(s, 'expense_subcategory', base.id)) { const k = r.parentId as keyof Site['expenseSubcategories']; if (k) subs[k] = [...(subs[k] ?? []), r.label]; }
  const st = s.siteSettings?.[base.id];
  return { ...base, sectors: refList(s, 'sector', base.id).map((r) => r.label), downtimeReasons: refList(s, 'downtime_reason', base.id).map((r) => r.label), expenseSubcategories: subs, thresholds: st ? { gateTolerancePct: st.gateTolerancePct, massGapPct: st.massGapPct, cashVariance: st.cashVariance, benchmarkPct: st.benchmarkPct } : base.thresholds };
}
