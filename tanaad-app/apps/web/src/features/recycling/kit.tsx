import type { CollectorDelivery } from '@tanaad/domain';

/** Workstation helpers shared with the bags screens (layout, numbered sections, live arithmetic, scale keys); production helpers come from the mats kit through them. */
export { BarCell, Calc, FormSection, PrintRun, ScaleBay, SettingsEmpty, Step, StepDot, Swatch, WIDE, Workbench, addProduction, dash, useFirstField, useScaleKey, useScaleTitle, useShift } from '../bags/kit';

/** Voucher number derived from the delivery: RV-yymmdd-nn, nn = position among that day's deliveries by time. */
export function voucherNo(d: CollectorDelivery, all: CollectorDelivery[]) {
  const sameDay = all.filter((x) => x.day === d.day).sort((a, b) => a.at.localeCompare(b.at));
  return `RV-${d.day.slice(2).replace(/-/g, '')}-${String(sameDay.findIndex((x) => x.id === d.id) + 1).padStart(2, '0')}`;
}
export const amountOf = (d: CollectorDelivery) => Math.round(d.netKg * d.pricePerKg);

/** Collectors keep one chart colour each, by name, so a collector is the same colour on every chart. */
const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-7)'];
export function collectorColours(names: string[]) {
  const sorted = [...new Set(names)].sort();
  return (name: string) => { const i = sorted.indexOf(name); return i >= 0 && i < SERIES.length ? SERIES[i] : 'var(--text-4)'; };
}

/** Time of day from an ISO stamp, tolerant of a single-digit hour. */
export const fmtTime = (iso: string) => { const m = iso.match(/T(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : iso; };
