import { describe, it, expect } from 'vitest';
import { landedCost, expectedCargoKg, gateDecision, massBalance, settlementNet, cashClose, contractDaysRemaining, contractState, intakeNet, yieldPct, bundlesFromPieces } from './arithmetic';
import fixtures from '../../../contracts/fixtures/arithmetic.json';

describe('cargo and gate', () => {
  it('computes expected cargo weight', () => {
    expect(expectedCargoKg([{ bundles: 100, stdBundleWeightKg: 38 }, { bundles: 50, stdBundleWeightKg: 25.2 }])).toBe(5060);
  });
  it('passes within tolerance and full scan', () => {
    const r = gateDecision({ expectedKg: 5060, actualKg: 5010, tolerancePct: 2, scannedBundles: 150, orderedBundles: 150 });
    expect(r.decision).toBe('pass');
  });
  it('holds when 10 bundles are missing (the Rwanda case)', () => {
    const r = gateDecision({ expectedKg: 5060, actualKg: 4420, tolerancePct: 2, scannedBundles: 140, orderedBundles: 150 });
    expect(r.decision).toBe('hold');
    expect(r.reasons.length).toBe(2);
  });
  for (const f of fixtures.gate) {
    it(`fixture: ${f.name}`, () => { expect(gateDecision(f.input).decision).toBe(f.expected); });
  }
});

describe('mass balance', () => {
  it('flags missing kilos', () => {
    const r = massBalance({ kgIn: 2500, kgOut: 2100, wipDeltaKg: 0, wasteKg: 50, allowedLossPct: 2 });
    expect(r.gapKg).toBe(300);
    expect(r.state).toBe('missing');
  });
  for (const f of fixtures.massBalance) {
    it(`fixture: ${f.name}`, () => { expect(massBalance(f.input).state).toBe(f.expected); });
  }
});

describe('settlement and cash', () => {
  it('weekly casual', () => {
    expect(settlementNet({ rateBasis: 'day', rate: 15000, unitsWorked: 6, advances: 20000 }).net).toBe(70000);
  });
  it('cash close variance', () => {
    const r = cashClose({ opening: 1_200_000, sales: 4_500_000, receipts: 0, expenses: 2_382_000, wages: 1_068_000, counted: 2_240_000 });
    expect(r.expectedClosing).toBe(2_250_000);
    expect(r.variance).toBe(-10_000);
  });
  for (const f of fixtures.cashClose) {
    it(`fixture: ${f.name}`, () => { expect(cashClose(f.input).variance).toBe(f.expected); });
  }
});

describe('contracts, intake, yield, bundles', () => {
  it('contract days', () => {
    expect(contractDaysRemaining('2026-10-13', '2026-10-10')).toBe(3);
    expect(contractState('2026-10-13', '2026-10-10')).toBe('expiring');
    expect(contractState('2026-10-09', '2026-10-10')).toBe('expired');
  });
  it('intake', () => { expect(intakeNet({ grossKg: 1200, tareKg: 40, deductionPct: 8, pricePerKg: 900 }).netKg).toBe(1067.2); });
  it('yield', () => { expect(yieldPct(10000, 9100)).toBe(91); });
  it('bundles', () => { expect(bundlesFromPieces(127, 6)).toEqual({ bundles: 21, loosePieces: 1 }); });
});

describe('landed cost', () => {
  it('spreads freight and clearing over the kilos received', () => {
    const r = landedCost({ qtyKg: 25500, unitPrice: 1.1, currency: 'USD', fx: 3700, costs: [{ amount: 2400, currency: 'USD' }, { amount: 3_500_000, currency: 'UGX' }] });
    expect(r.goodsUgx).toBe(103_785_000);
    expect(r.extrasUgx).toBe(12_380_000);
    expect(r.perKgUgx).toBe(4555.49);
  });
});
