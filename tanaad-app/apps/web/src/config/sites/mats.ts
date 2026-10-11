import type { Site } from '@tanaad/domain';

export const mats: Site = {
  id: 'mats',
  name: 'Mats Factory',
  legalName: 'Tanaad · Mats factory',
  shortName: 'Mats',
  tagline: 'Woven mats · est. 2024 · largest site',
  currencyPrimary: 'UGX',
  shifts: [
    { kind: 'day', starts: '07:00', ends: '19:00' },
    { kind: 'night', starts: '19:00', ends: '07:00' },
  ],
  closedDays: [0],
  sectors: ['Mixer', 'Extrusion', 'Weaving', 'Finishing', 'Loading', 'Store', 'Maintenance', 'Office'],
  machineWallTitle: 'Loom Wall',
  stages: [
    { code: 'raw', name: 'Raw materials', sequence: 1, inputUnit: 'bags', outputUnit: 'kg' },
    { code: 'mixer', name: 'Mixer', sequence: 2, inputUnit: 'kg', outputUnit: 'kg', producesLabel: 'batch' },
    { code: 'extrude', name: 'Extruders', sequence: 3, inputUnit: 'kg', outputUnit: 'kg', producesLabel: 'rack' },
    { code: 'dry', name: 'Drying racks', sequence: 4, inputUnit: 'kg', outputUnit: 'kg' },
    { code: 'weave', name: 'Weaving', sequence: 5, inputUnit: 'kg', outputUnit: 'units' },
    { code: 'finish', name: 'Hand finishing', sequence: 6, inputUnit: 'units', outputUnit: 'bundles', producesLabel: 'bundle' },
    { code: 'store', name: 'Store & dispatch', sequence: 7, inputUnit: 'units', outputUnit: 'bundles' },
  ],
  expenseSubcategories: {
    spares: ['Belts', 'Bearings', 'Heater bands', 'Needles', 'Compressor oil', 'Electrical'],
    transport: ['Boda', 'Lorry hire', 'Fuel'],
    utilities: ['Electricity', 'Water', 'Generator fuel'],
  },
  downtimeReasons: ['Power', 'Mechanical', 'No string', 'Operator absent', 'Changeover', 'Other'],
  thresholds: { gateTolerancePct: 2, massGapPct: 2, cashVariance: 20_000, benchmarkPct: 80 },
  deliveryNoteSeriesStart: 1,
};
