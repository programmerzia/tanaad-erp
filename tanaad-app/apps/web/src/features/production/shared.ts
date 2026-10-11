import type { Label, Product, RefItem, ShiftKind, Site, SiteCode } from '@tanaad/domain';
import type { AppState } from '@/data/store';
import { DEMO_HOUR, benchmarkFor, currentShiftKind, shiftId, type MachineTile } from '@/data/selectors';

/** Per-site configuration of the machine wall: which stage, which sector of workers, which products. */
export interface WallConfig { stage: string; sector: string; productKind: Product['kind']; unit: string; unitOne: string; kgMode: 'estimate' | 'entered' | 'in_out' }
export const wallConfig = (site: SiteCode): WallConfig => ({
  mats: { stage: 'weave', sector: 'Weaving', productKind: 'mat' as const, unit: 'mats', unitOne: 'mat', kgMode: 'estimate' as const },
  bags: { stage: 'extrude', sector: 'Extrusion', productKind: 'roll' as const, unit: 'rolls', unitOne: 'roll', kgMode: 'entered' as const },
  recycling: { stage: 'pelletise', sector: 'Pelletising', productKind: 'pellet' as const, unit: 'sacks', unitOne: 'sack', kgMode: 'in_out' as const },
})[site];

/**
 * Kilos for a count of pieces, from the product's own standard weight (bundle weight ÷ pieces per bundle).
 * Used where a stage counts pieces and has no scale: the estimate follows the product as it is set up in Settings.
 */
export const kgPerPiece = (p?: Product) => (p && p.bundlePieces > 0 ? p.stdBundleWeightKg / p.bundlePieces : 0);
/**
 * Material items that carry a weight per pack, by what the pack is: `perUnit(materials, 'bag')` finds every "kg/bag" material.
 * The pack is read from the item's unit in master data, so a new bag or sack size needs no code.
 */
export const perUnit = (items: RefItem[], pack: string) => items.filter((r) => (r.value ?? 0) > 0 && (r.unit ?? '').toLowerCase().endsWith(`/${pack}`));
/** A long stop needs a reason. There is no site setting for this limit yet, so it lives here, in one place. */
export const REASON_AFTER_MIN = 60;

/** Sort key that keeps "Loom 2" before "Loom 10". */
export const codeKey = (code: string) => code.replace(/\d+/, (n) => n.padStart(3, '0'));
export const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/** Which sector operates each stage, for operator pickers. */
export const sectorForStage = (site: Site, stageCode: string): string => {
  const map: Record<string, string> = { mixer: 'Mixer', extrude: 'Extrusion', dry: 'Extrusion', weave: 'Weaving', finish: 'Finishing', store: 'Store', raw: 'Store', convert: 'Conversion', intake: 'Intake', wash: 'Washing', pelletise: 'Pelletising' };
  const sector = map[stageCode];
  return sector && site.sectors.includes(sector) ? sector : site.sectors[0];
};

/** Which product kinds a label kind carries. Batches and racks are coloured material, not a product. */
export const productKindsForLabel = (site: SiteCode, kind: Label['kind']): Product['kind'][] => {
  if (kind === 'bundle') return ['mat'];
  if (kind === 'roll') return ['roll'];
  if (kind === 'pack') return ['bag_pack'];
  if (kind === 'sack') return site === 'recycling' ? ['pellet'] : ['pellet', 'material'];
  return [];
};

/** Hour-of-day (0–24, fractional) from an ISO timestamp, as written (local site time). */
export const hourOf = (iso: string) => { const m = iso.match(/T(\d{2}):(\d{2})/); return m ? +m[1] + +m[2] / 60 : 0; };
/** Shift start hour as a number from "07:00". */
export const startHour = (site: Site, kind: 'day' | 'night') => +(site.shifts.find((x) => x.kind === kind)?.starts ?? '07:00').slice(0, 2);

/** The demo clock reads 13:20; every "now" on these screens comes from here, never from the device clock. */
export const NOW_MIN = 20;
export const NOW_LABEL = `${DEMO_HOUR}:${String(NOW_MIN).padStart(2, '0')}`;

/** Where a shift stands against the demo clock: hours in, and whether it is running, over or still to come. */
export function shiftWindow(site: Site, today: string, day: string, kind: ShiftKind) {
  const sh = site.shifts.find((x) => x.kind === kind); const start = startHour(site, kind);
  // Length of the shift from the site's own shift table (an overnight shift wraps past midnight).
  const endH = +(sh?.ends ?? '').slice(0, 2); const span = sh && !Number.isNaN(endH) ? ((endH - start + 24) % 24 || 24) : 12;
  const phase: 'running' | 'ended' | 'upcoming' = day < today ? 'ended' : day > today ? 'upcoming' : kind === currentShiftKind() ? 'running' : kind === 'night' || DEMO_HOUR < 7 ? 'upcoming' : 'ended';
  const nowH = phase === 'running' ? Math.max(0, Math.min(span, (DEMO_HOUR + NOW_MIN / 60 - start + 24) % 24)) : phase === 'ended' ? span : 0;
  return { start, span, phase, nowH, starts: sh?.starts ?? '07:00', ends: sh?.ends ?? '19:00' };
}

/** Totals of one wall for one shift. */
export function wallTotals(wall: MachineTile[]) {
  const logged = wall.filter((t) => t.entry); const sum = (f: (t: MachineTile) => number) => logged.reduce((a, t) => a + f(t), 0);
  return { logged: logged.length, good: sum((t) => t.entry!.goodUnits), rejects: sum((t) => t.entry!.rejectUnits), inKg: sum((t) => t.entry!.inputKg), outKg: sum((t) => t.entry!.outputKg), down: sum((t) => t.entry!.downtimeMin), due: sum((t) => t.expectedSoFar ?? 0), target: sum((t) => t.benchmark ?? 0) };
}

/** Good output per product for one wall and shift, largest first. */
export function byProduct(wall: MachineTile[]) {
  const m = new Map<string, { id: string; name: string; colour?: string; units: number; kg: number; due: number; target: number; machines: number }>();
  for (const t of wall) { if (!t.entry) continue; const id = t.product?.id ?? 'none'; const c = m.get(id) ?? { id, name: t.product?.internalName ?? 'No product', colour: t.product?.colour, units: 0, kg: 0, due: 0, target: 0, machines: 0 }; c.units += t.entry.goodUnits; c.kg += t.entry.outputKg; c.due += t.expectedSoFar ?? 0; c.target += t.benchmark ?? 0; c.machines += 1; m.set(id, c); }
  return [...m.values()].sort((a, b) => b.units - a.units || b.kg - a.kg);
}

/** Downtime minutes per reason for one wall and shift. Long stops without a reason are kept apart so they stand out; short stops do not need one. */
export function downtimeByReason(wall: MachineTile[]) {
  const m = new Map<string, { reason: string; min: number; machines: number; missing: boolean }>();
  for (const t of wall) { const e = t.entry; if (!e || !e.downtimeMin) continue; const missing = !e.downtimeReason && e.downtimeMin > REASON_AFTER_MIN; const reason = e.downtimeReason ?? (missing ? 'No reason given' : 'Short stops'); const c = m.get(reason) ?? { reason, min: 0, machines: 0, missing }; c.min += e.downtimeMin; c.machines += 1; m.set(reason, c); }
  return [...m.values()].sort((a, b) => b.min - a.min);
}

/** One point per day for the same shift on the same wall: output, benchmark, rejects, downtime and kilos. */
export function shiftHistory(s: AppState, site: SiteCode, stage: string, kind: ShiftKind, days: string[]) {
  return days.map((day) => {
    const sh = shiftId(site, day, kind); const es = s.production.filter((p) => p.shiftId === sh && p.stageCode === stage);
    const sum = (f: (e: (typeof es)[number]) => number) => es.reduce((a, e) => a + f(e), 0);
    const inKg = sum((e) => e.inputKg); const outKg = sum((e) => e.outputKg);
    return { day, entries: es.length, units: sum((e) => e.goodUnits), target: sum((e) => benchmarkFor(s, e.machineId, e.productId) ?? 0), rejects: sum((e) => e.rejectUnits), downtime: sum((e) => e.downtimeMin), inKg, outKg, yieldPct: inKg ? Math.round((outKg / inKg) * 1000) / 10 : 0, partial: day === s.today };
  });
}

/** Build a CSV string and trigger a download. */
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
