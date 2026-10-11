// Business arithmetic shared by client and (as fixtures) the server.
// Every function here has a fixture in contracts/fixtures and a Vitest test.

export interface CargoLine { bundles: number; stdBundleWeightKg: number }

/** Expected cargo weight = Σ bundles × standard bundle weight. */
export function expectedCargoKg(lines: CargoLine[]): number {
  return round3(lines.reduce((sum, l) => sum + l.bundles * l.stdBundleWeightKg, 0));
}

/** Signed variance percentage of actual vs expected. */
export function variancePct(expectedKg: number, actualKg: number): number {
  if (expectedKg <= 0) return 0;
  return round2(((actualKg - expectedKg) / expectedKg) * 100);
}

export type GateDecision = 'pass' | 'hold';

/** Gate passes only if |variance| ≤ tolerance AND scanned bundles equal ordered bundles. */
export function gateDecision(args: {
  expectedKg: number; actualKg: number; tolerancePct: number;
  scannedBundles: number; orderedBundles: number;
}): { decision: GateDecision; variancePct: number; reasons: string[] } {
  const v = variancePct(args.expectedKg, args.actualKg);
  const reasons: string[] = [];
  if (Math.abs(v) > args.tolerancePct) reasons.push(`Weight variance ${v > 0 ? '+' : ''}${v}% exceeds ±${args.tolerancePct}%`);
  if (args.scannedBundles !== args.orderedBundles) reasons.push(`Scanned ${args.scannedBundles} bundles, order has ${args.orderedBundles}`);
  return { decision: reasons.length ? 'hold' : 'pass', variancePct: v, reasons };
}

/** Mass balance per site per day. gap > 0 means kilos are missing. */
export function massBalance(args: {
  kgIn: number; kgOut: number; wipDeltaKg: number; wasteKg: number; allowedLossPct: number;
}): { allowedLossKg: number; gapKg: number; gapPct: number; state: 'balanced' | 'explainable' | 'missing' } {
  const allowedLossKg = round3(args.kgIn * (args.allowedLossPct / 100));
  const accounted = args.kgOut + args.wipDeltaKg + args.wasteKg + allowedLossKg;
  const gapKg = round3(args.kgIn - accounted);
  const gapPct = args.kgIn > 0 ? round2((gapKg / args.kgIn) * 100) : 0;
  const state = gapKg <= 0 ? 'balanced' : gapPct <= args.allowedLossPct ? 'explainable' : 'missing';
  return { allowedLossKg, gapKg, gapPct, state };
}

/** Settlement for one engagement over a period. */
export function settlementNet(args: {
  rateBasis: 'month' | 'shift' | 'day' | 'piece';
  rate: number;
  unitsWorked: number;       // days, shifts or pieces; for month: fraction of month worked (0..1)
  overtimeHours?: number;
  overtimeRatePerHour?: number;
  bonus?: number;
  advances?: number;
}): { gross: number; overtime: number; bonus: number; advances: number; net: number } {
  const gross = round2(args.rate * args.unitsWorked);
  const overtime = round2((args.overtimeHours ?? 0) * (args.overtimeRatePerHour ?? 0));
  const bonus = round2(args.bonus ?? 0);
  const advances = round2(args.advances ?? 0);
  return { gross, overtime, bonus, advances, net: round2(gross + overtime + bonus - advances) };
}

/** Cash close: expected closing from the page, and the variance against the counted cash. */
export function cashClose(args: {
  opening: number; sales: number; receipts: number; expenses: number; wages: number; counted: number;
}): { expectedClosing: number; variance: number } {
  const expectedClosing = round2(args.opening + args.sales + args.receipts - args.expenses - args.wages);
  return { expectedClosing, variance: round2(args.counted - expectedClosing) };
}

/** Days remaining on a fixed-term contract; negative means expired. */
export function contractDaysRemaining(endDate: string, today: string): number {
  const end = Date.UTC(+endDate.slice(0, 4), +endDate.slice(5, 7) - 1, +endDate.slice(8, 10));
  const now = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  return Math.round((end - now) / 86_400_000);
}

export function contractState(endDate: string | undefined, today: string, warningDays = 3): 'open' | 'expiring' | 'expired' {
  if (!endDate) return 'open';
  const d = contractDaysRemaining(endDate, today);
  if (d < 0) return 'expired';
  if (d <= warningDays) return 'expiring';
  return 'open';
}

/** Recycling yield per line. */
export function yieldPct(inputKg: number, outputKg: number): number {
  return inputKg > 0 ? round2((outputKg / inputKg) * 100) : 0;
}

/** Collector intake: net payable kg and amount after deduction. */
export function intakeNet(args: { grossKg: number; tareKg: number; deductionPct: number; pricePerKg: number }) {
  const clean = Math.max(0, args.grossKg - args.tareKg);
  const netKg = round3(clean * (1 - args.deductionPct / 100));
  return { netKg, amount: round2(netKg * args.pricePerKg) };
}

export function bundlesFromPieces(pieces: number, bundlePieces: number): { bundles: number; loosePieces: number } {
  return { bundles: Math.floor(pieces / bundlePieces), loosePieces: pieces % bundlePieces };
}

export function round2(n: number) { return Math.round(n * 100) / 100; }
export function round3(n: number) { return Math.round(n * 1000) / 1000; }

/** Landed cost per kg in UGX: goods plus every extra cost, converted at the purchase's exchange reference, over the kilos actually received. */
export function landedCost(args: { qtyKg: number; unitPrice: number; currency: 'UGX' | 'USD'; fx: number; costs: { amount: number; currency: 'UGX' | 'USD' }[]; receivedKg?: number }) {
  const toUgx = (amount: number, currency: 'UGX' | 'USD') => (currency === 'USD' ? amount * args.fx : amount);
  const goodsUgx = toUgx(args.qtyKg * args.unitPrice, args.currency);
  const extrasUgx = args.costs.reduce((t, c) => t + toUgx(c.amount, c.currency), 0);
  const kg = args.receivedKg && args.receivedKg > 0 ? args.receivedKg : args.qtyKg;
  const totalUgx = goodsUgx + extrasUgx;
  return { goodsUgx: round2(goodsUgx), extrasUgx: round2(extrasUgx), totalUgx: round2(totalUgx), perKgUgx: kg > 0 ? round2(totalUgx / kg) : 0, upliftPct: goodsUgx > 0 ? round2((extrasUgx / goodsUgx) * 100) : 0 };
}
