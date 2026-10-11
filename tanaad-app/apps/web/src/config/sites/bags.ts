import type { Site } from '@tanaad/domain';
import { COMPANY } from '@/config/company';

export const bags: Site = {
  id: 'bags',
  name: 'Bags Factory',
  legalName: COMPANY.name,
  shortName: 'Bags',
  tagline: 'Carrier bags · oldest site · best records',
  currencyPrimary: 'UGX',
  shifts: [
    { kind: 'day', starts: '07:00', ends: '19:00' },
    { kind: 'night', starts: '19:00', ends: '07:00' },
  ],
  closedDays: [0],
  sectors: ['Extrusion', 'Conversion', 'Packing', 'Store', 'Maintenance', 'Office'],
  machineWallTitle: 'Extruder Wall',
  stages: [
    { code: 'raw', name: 'Raw material issue', sequence: 1, inputUnit: 'bags', outputUnit: 'kg' },
    { code: 'extrude', name: 'Film extrusion', sequence: 2, inputUnit: 'kg', outputUnit: 'rolls', producesLabel: 'roll' },
    { code: 'convert', name: 'Cutting, sealing & packing', sequence: 3, inputUnit: 'kg', outputUnit: 'packs', producesLabel: 'pack' },
    { code: 'store', name: 'Store & dispatch', sequence: 4, inputUnit: 'units', outputUnit: 'packs' },
  ],
  expenseSubcategories: {
    spares: ['Heater bands', 'Screens', 'Blades', 'Sealing wire', 'Electrical'],
    transport: ['Boda', 'Lorry hire', 'Fuel'],
  },
  downtimeReasons: ['Power', 'Mechanical', 'No resin', 'Operator absent', 'Changeover', 'Other'],
  thresholds: { gateTolerancePct: 2, massGapPct: 2, cashVariance: 20_000, benchmarkPct: 80 },
  deliveryNoteSeriesStart: 4817,
  toBeConfirmed: 'Process after extrusion to be confirmed with the bags factory. The roll sticker is confirmed and exact.',
};
