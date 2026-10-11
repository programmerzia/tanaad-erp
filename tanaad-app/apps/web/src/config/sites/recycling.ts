import type { Site } from '@tanaad/domain';

export const recycling: Site = {
  id: 'recycling',
  name: 'Recycling Plant',
  legalName: 'Tanaad · Recycling plant',
  shortName: 'Recycling',
  tagline: 'HDPE recycling · new · 14 t/day',
  currencyPrimary: 'UGX',
  shifts: [
    { kind: 'day', starts: '07:00', ends: '19:00' },
    { kind: 'night', starts: '19:00', ends: '07:00' },
  ],
  closedDays: [0],
  sectors: ['Intake', 'Sorting', 'Washing', 'Pelletising', 'Bagging', 'Maintenance', 'Office'],
  machineWallTitle: 'Line Wall',
  stages: [
    { code: 'intake', name: 'Collector intake', sequence: 1, inputUnit: 'kg', outputUnit: 'kg' },
    { code: 'wash', name: 'Sorting & washing', sequence: 2, inputUnit: 'kg', outputUnit: 'kg' },
    { code: 'pelletise', name: 'Pelletising', sequence: 3, inputUnit: 'kg', outputUnit: 'sacks', producesLabel: 'sack' },
    { code: 'store', name: 'Pellet store', sequence: 4, inputUnit: 'kg', outputUnit: 'sacks' },
  ],
  expenseSubcategories: {
    spares: ['Screens', 'Blades', 'Bearings', 'Heater bands', 'Pump parts'],
    utilities: ['Electricity', 'Water', 'Generator fuel'],
  },
  downtimeReasons: ['Power', 'Mechanical', 'No feedstock', 'Water supply', 'Operator absent', 'Other'],
  thresholds: { gateTolerancePct: 2, massGapPct: 12, cashVariance: 20_000, benchmarkPct: 80 }, // wash and melt loss of 8–12% is the process norm; to be confirmed
  deliveryNoteSeriesStart: 1,
  toBeConfirmed: 'Intake deduction rule, process stages and sack size to be confirmed with the plant.',
};
