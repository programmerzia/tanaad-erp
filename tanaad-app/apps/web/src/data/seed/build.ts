import type {
  Attendance, AuditEvent, Benchmark, Breakdown, BusinessException, CashDay, CashEntry, Client, CollectorDelivery,
  Dispatch, Engagement, Invoice, Label, Machine, Order, Part, PartIssue, Payment, Person, Product, ProductionEntry,
  Shift, SiteCode, StockCount, User, Zone,
} from '@tanaad/domain';
import { expectedCargoKg } from '@tanaad/domain';
import { makeRng } from './rng';
import { FIRST, LAST, COLLECTORS } from './names';
import { SITE_LIST } from '@/config/sites';

export const TODAY = '2026-10-10'; // Saturday. Mats, bags and recycling are closed on Sundays.
export const FX = 3720; // UGX per USD reference for the day

export interface SeedData {
  users: User[]; machines: Machine[]; products: Product[]; benchmarks: Benchmark[]; people: Person[];
  engagements: Engagement[]; shifts: Shift[]; attendance: Attendance[]; cashDays: CashDay[]; cashEntries: CashEntry[];
  labels: Label[]; production: ProductionEntry[]; zones: Zone[]; stockCounts: StockCount[]; clients: Client[];
  orders: Order[]; dispatches: Dispatch[]; invoices: Invoice[]; payments: Payment[]; parts: Part[]; partIssues: PartIssue[];
  breakdowns: Breakdown[]; collectorDeliveries: CollectorDelivery[]; exceptions: BusinessException[]; audit: AuditEvent[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const at = (day: string, hm: string) => `${day}T${hm}:00+03:00`;
const dow = (day: string) => new Date(day + 'T00:00:00Z').getUTCDay();

export function buildSeed(): SeedData {
  const rng = makeRng();
  let seq = 1000;
  const id = (p: string) => `${p}_${(seq++).toString(36)}`;

  // ---------- users ----------
  const users: User[] = [
    { id: 'u_ceo1', name: 'Hassan Warsame', roles: [{ role: 'ceo' }], avatarSeed: 'HW' },
    { id: 'u_ceo2', name: 'Abdi Osman', roles: [{ role: 'ceo' }], avatarSeed: 'AO' },
    { id: 'u_admin', name: 'Yasir Osman', roles: [{ role: 'group_admin' }], avatarSeed: 'YO' },
    { id: 'u_sm_mats', name: 'Moses Tumusiime', roles: [{ role: 'site_manager', siteId: 'mats' }], avatarSeed: 'MT' },
    { id: 'u_sm_bags', name: 'Grace Nabirye', roles: [{ role: 'site_manager', siteId: 'bags' }], avatarSeed: 'GN' },
    { id: 'u_sm_rec', name: 'Ibrahim Farah', roles: [{ role: 'site_manager', siteId: 'recycling' }], avatarSeed: 'IF' },
    { id: 'u_sup_mats', name: 'Amina Nakato', roles: [{ role: 'supervisor', siteId: 'mats' }], avatarSeed: 'AN' },
    { id: 'u_sup_bags', name: 'Muzamir Ssentongo', roles: [{ role: 'supervisor', siteId: 'bags' }], avatarSeed: 'MS' },
    { id: 'u_sup_rec', name: 'Said Elmi', roles: [{ role: 'supervisor', siteId: 'recycling' }], avatarSeed: 'SE' },
    { id: 'u_cash_mats', name: 'Joseph Okello', roles: [{ role: 'cashier', siteId: 'mats' }], avatarSeed: 'JO' },
    { id: 'u_cash_bags', name: 'Esther Namuli', roles: [{ role: 'cashier', siteId: 'bags' }], avatarSeed: 'EN' },
    { id: 'u_cash_rec', name: 'Halima Jama', roles: [{ role: 'cashier', siteId: 'recycling' }], avatarSeed: 'HJ' },
    { id: 'u_store_mats', name: 'Peter Mukasa', roles: [{ role: 'storekeeper', siteId: 'mats' }, { role: 'gate', siteId: 'mats' }], avatarSeed: 'PM' },
    { id: 'u_store_bags', name: 'Ronald Kizza', roles: [{ role: 'storekeeper', siteId: 'bags' }, { role: 'gate', siteId: 'bags' }], avatarSeed: 'RK' },
    { id: 'u_store_rec', name: 'Omar Hersi', roles: [{ role: 'storekeeper', siteId: 'recycling' }, { role: 'gate', siteId: 'recycling' }], avatarSeed: 'OH' },
    { id: 'u_mech', name: 'Kato Mugisha', roles: [{ role: 'mechanic', siteId: 'mats' }, { role: 'mechanic', siteId: 'recycling' }], avatarSeed: 'KM' },
    { id: 'u_sales_mats', name: 'Fatuma Ali', roles: [{ role: 'sales', siteId: 'mats' }], avatarSeed: 'FA' },
    { id: 'u_sales_bags', name: 'Brian Lubega', roles: [{ role: 'sales', siteId: 'bags' }], avatarSeed: 'BL' },
    { id: 'u_sales_rec', name: 'Nasra Mohamed', roles: [{ role: 'sales', siteId: 'recycling' }], avatarSeed: 'NM' },
  ];

  // ---------- machines ----------
  const machines: Machine[] = [];
  machines.push({ id: 'm_mixer', siteId: 'mats', code: 'Mixer', kind: 'mixer', stageCode: 'mixer', status: 'active' });
  for (let i = 1; i <= 14; i++) machines.push({ id: `m_ext${i}`, siteId: 'mats', code: `Extruder ${i}`, kind: 'extruder', stageCode: 'extrude', status: 'active' });
  for (let i = 1; i <= 21; i++) machines.push({ id: `m_loom${i}`, siteId: 'mats', code: `Loom ${i}`, kind: 'loom', stageCode: 'weave', status: i <= 15 ? 'active' : 'arriving' });
  machines.push({ id: 'm_crusher', siteId: 'mats', code: 'Crusher', kind: 'crusher', stageCode: 'store', status: 'active' });
  for (const l of 'ABCDEFGH') machines.push({ id: `m_bext${l}`, siteId: 'bags', code: `Extruder ${l}`, kind: 'extruder', stageCode: 'extrude', status: 'active' });
  for (let i = 1; i <= 4; i++) machines.push({ id: `m_conv${i}`, siteId: 'bags', code: `Converter ${i}`, kind: 'converter', stageCode: 'convert', status: 'active' });
  machines.push({ id: 'm_line10', siteId: 'recycling', code: 'Line 10T', kind: 'line', stageCode: 'pelletise', status: 'active', capacityKgPerDay: 10000 });
  machines.push({ id: 'm_line4', siteId: 'recycling', code: 'Line 4T', kind: 'line', stageCode: 'pelletise', status: 'active', capacityKgPerDay: 4000 });
  machines.push({ id: 'm_wash', siteId: 'recycling', code: 'Wash line', kind: 'washer', stageCode: 'wash', status: 'active' });

  // ---------- products ----------
  // Standard bundle weights are ILLUSTRATIVE and flagged "to be measured" (briefing only gives a 3.2 kg input average).
  const products: Product[] = [
    { id: 'p_rihlaat', siteId: 'mats', internalName: 'Rihlaat', unit: 'bundle', kind: 'mat', bundlePieces: 20, stdBundleWeightKg: 38.0, weightTolerancePct: 2, weightStatus: 'to_be_measured', colour: '#2F6B8A',
      prices: [{ channel: 'export', currency: 'USD', amount: 3.5, effectiveFrom: '2026-01-01' }, { channel: 'local', currency: 'UGX', amount: 15000, effectiveFrom: '2026-01-01' }] },
    { id: 'p_sajaada_l', siteId: 'mats', internalName: 'Sajaada light', unit: 'bundle', kind: 'mat', bundlePieces: 10, stdBundleWeightKg: 27.0, weightTolerancePct: 2, weightStatus: 'to_be_measured', colour: '#5B8C5A',
      prices: [{ channel: 'export', currency: 'USD', amount: 5.5, effectiveFrom: '2026-01-01' }, { channel: 'local', currency: 'UGX', amount: 25000, effectiveFrom: '2026-01-01' }] },
    { id: 'p_sajaada_h', siteId: 'mats', internalName: 'Sajaada heavy', unit: 'bundle', kind: 'mat', bundlePieces: 10, stdBundleWeightKg: 34.0, weightTolerancePct: 2, weightStatus: 'to_be_measured', colour: '#8A5A2F',
      prices: [{ channel: 'export', currency: 'USD', amount: 7.0, effectiveFrom: '2026-01-01' }, { channel: 'local', currency: 'USD', amount: 7.5, effectiveFrom: '2026-01-01' }] },
    { id: 'p_domona', siteId: 'mats', internalName: 'Domona', unit: 'bundle', kind: 'mat', bundlePieces: 6, stdBundleWeightKg: 25.2, weightTolerancePct: 2, weightStatus: 'to_be_measured', colour: '#7A4F8A',
      prices: [{ channel: 'export', currency: 'USD', amount: 7.0, effectiveFrom: '2026-01-01' }, { channel: 'local', currency: 'USD', amount: 7.5, effectiveFrom: '2026-01-01' }] },
    { id: 'p_27m', siteId: 'mats', internalName: '2.7m', unit: 'bundle', kind: 'mat', bundlePieces: 3, stdBundleWeightKg: 24.0, weightTolerancePct: 2, weightStatus: 'to_be_measured', colour: '#B5631E',
      prices: [{ channel: 'export', currency: 'USD', amount: 16.0, effectiveFrom: '2026-01-01' }, { channel: 'local', currency: 'UGX', amount: 70000, effectiveFrom: '2026-01-01' }] },
    { id: 'p_black_pellet', siteId: 'mats', internalName: 'Recycled black pellet', kind: 'pellet', bundlePieces: 1, stdBundleWeightKg: 50, weightTolerancePct: 1, weightStatus: 'measured', prices: [{ channel: 'local', currency: 'UGX', amount: 2200, effectiveFrom: '2026-01-01' }] },
    // Bags: five sizes × black/white under house brands (names illustrative; sizes to be confirmed)
    // Five sizes in black and white are confirmed; the size names, weights and prices below are placeholders for the client to replace in Settings.
    ...(['Small', 'Medium', 'Large', 'X-Large', 'Jumbo'] as const).flatMap((size, i) => (['Black', 'White'] as const).map((col) => ({
      id: `p_bag_${size.toLowerCase().replace('-', '')}_${col.toLowerCase()}`, siteId: 'bags' as SiteCode, internalName: `Size ${i + 1} ${col}`, unit: 'pack', kind: 'bag_pack' as const,
      bundlePieces: 100, stdBundleWeightKg: [1.8, 2.6, 3.4, 4.5, 6.0][i], weightTolerancePct: 3, weightStatus: 'to_be_measured' as const, colour: col === 'Black' ? '#1d272b' : '#c9c4b8',
      prices: [{ channel: 'local' as const, currency: 'UGX' as const, amount: [9000, 13000, 17000, 23000, 32000][i], effectiveFrom: '2026-01-01' }],
    }))),
    { id: 'p_roll_faras', siteId: 'bags', internalName: 'Faras', unit: 'roll', kind: 'roll', bundlePieces: 1, stdBundleWeightKg: 60, weightTolerancePct: 10, weightStatus: 'measured', prices: [] },
    { id: 'p_roll_nuur', siteId: 'bags', internalName: 'Roll type 2 (example)', unit: 'roll', kind: 'roll', bundlePieces: 1, stdBundleWeightKg: 60, weightTolerancePct: 10, weightStatus: 'measured', prices: [] },
    // Recycling
    { id: 'p_hdpe_nat', siteId: 'recycling', internalName: 'HDPE pellet · natural', kind: 'pellet', bundlePieces: 1, stdBundleWeightKg: 25, weightTolerancePct: 1, weightStatus: 'to_be_measured', colour: '#d9d4cb', prices: [{ channel: 'local', currency: 'UGX', amount: 3800, effectiveFrom: '2026-01-01' }] },
    { id: 'p_hdpe_mixed', siteId: 'recycling', internalName: 'HDPE pellet · mixed colour', kind: 'pellet', bundlePieces: 1, stdBundleWeightKg: 25, weightTolerancePct: 1, weightStatus: 'to_be_measured', colour: '#6b7f86', prices: [{ channel: 'local', currency: 'UGX', amount: 3200, effectiveFrom: '2026-01-01' }] },
    { id: 'p_hdpe_black', siteId: 'recycling', internalName: 'HDPE pellet · black', kind: 'pellet', bundlePieces: 1, stdBundleWeightKg: 25, weightTolerancePct: 1, weightStatus: 'to_be_measured', colour: '#1d272b', prices: [{ channel: 'local', currency: 'UGX', amount: 2900, effectiveFrom: '2026-01-01' }] },
  ];
  const matProducts = products.filter((p) => p.siteId === 'mats' && p.kind === 'mat');

  // ---------- benchmarks ----------
  const benchmarks: Benchmark[] = [];
  const perShift: Record<string, number> = { p_rihlaat: 76, p_sajaada_l: 48, p_sajaada_h: 40, p_domona: 36, p_27m: 16 };
  for (const m of machines.filter((x) => x.kind === 'loom')) for (const p of matProducts) benchmarks.push({ machineId: m.id, productId: p.id, unitsPerShift: rng.jitter(perShift[p.id], 0.08) });

  // ---------- people & engagements ----------
  const people: Person[] = []; const engagements: Engagement[] = [];
  const mkPerson = (site: SiteCode, sector: string, type: 'permanent' | 'contract' | 'casual', opts: Partial<Person> = {}, eng: Partial<Engagement> = {}) => {
    const fn = rng.pick(FIRST), ln = rng.pick(LAST);
    const p: Person = { id: id('per'), homeSiteId: site, fullName: `${fn} ${ln}`, idNumber: `CM${rng.int(80, 99)}${rng.int(1000000, 9999999)}`, phoneMomo: `07${rng.pick(['7', '8', '5', '0'])}${rng.int(1000000, 9999999)}`, sector, shared: false, sharedSites: [], avatarSeed: `${fn[0]}${ln[0]}`, status: 'active', joinedOn: addDays(TODAY, -rng.int(5, 400)), ...opts };
    people.push(p);
    const base: Engagement = type === 'permanent'
      ? { id: id('eng'), personId: p.id, siteId: site, type, startDate: p.joinedOn, rateBasis: 'month', rate: rng.pick([450000, 520000, 600000, 750000, 900000]), currency: 'UGX', settlementCycle: 'monthly', status: 'active' }
      : type === 'contract'
        ? (() => { const term = rng.pick([7, 15, 30]); const start = addDays(TODAY, -rng.int(0, term - 1)); return { id: id('eng'), personId: p.id, siteId: site, type, startDate: start, endDate: addDays(start, term), termDays: term, rateBasis: 'shift' as const, rate: rng.pick([18000, 20000, 22000, 25000]), currency: 'UGX' as const, settlementCycle: 'end_of_term' as const, status: 'active' as const }; })()
        : { id: id('eng'), personId: p.id, siteId: site, type, startDate: p.joinedOn, rateBasis: 'day', rate: rng.pick([12000, 13000, 15000]), currency: 'UGX', settlementCycle: 'weekly', status: 'active' };
    engagements.push({ ...base, ...eng });
    return p;
  };
  // Mats ~60
  for (let i = 0; i < 8; i++) mkPerson('mats', rng.pick(['Weaving', 'Extrusion', 'Mixer', 'Office', 'Store']), 'permanent');
  for (let i = 0; i < 14; i++) mkPerson('mats', rng.pick(['Weaving', 'Extrusion']), 'contract');
  for (let i = 0; i < 34; i++) mkPerson('mats', rng.pick(['Finishing', 'Loading', 'Weaving', 'Finishing']), 'casual');
  // explicit story people
  const expiring = mkPerson('mats', 'Weaving', 'contract', { fullName: 'Isaac Byaruhanga', avatarSeed: 'IB' }, { startDate: addDays(TODAY, -12), endDate: addDays(TODAY, 3), termDays: 15 });
  const expired = mkPerson('mats', 'Weaving', 'contract', { fullName: 'Julius Kasozi', avatarSeed: 'JK' }, { startDate: addDays(TODAY, -8), endDate: addDays(TODAY, -1), termDays: 7, status: 'expired' });
  const ghost = mkPerson('mats', 'Finishing', 'casual', { fullName: 'Denis Walusimbi', avatarSeed: 'DW', joinedOn: addDays(TODAY, -9) });
  const mechanic = mkPerson('mats', 'Maintenance', 'permanent', { fullName: 'Kato Mugisha', avatarSeed: 'KM', shared: true, sharedSites: ['recycling'] }, { rate: 1100000 });
  const driver = mkPerson('mats', 'Loading', 'permanent', { fullName: 'Simon Katongole', avatarSeed: 'SK', shared: true, sharedSites: ['bags', 'recycling'] }, { rate: 800000 });
  // Bags ~70
  for (let i = 0; i < 22; i++) mkPerson('bags', rng.pick(['Extrusion', 'Conversion', 'Packing', 'Office', 'Store']), 'permanent');
  for (let i = 0; i < 18; i++) mkPerson('bags', rng.pick(['Extrusion', 'Conversion']), 'contract');
  for (let i = 0; i < 30; i++) mkPerson('bags', rng.pick(['Packing', 'Conversion', 'Store']), 'casual');
  // Recycling ~20
  for (let i = 0; i < 6; i++) mkPerson('recycling', rng.pick(['Pelletising', 'Office', 'Intake']), 'permanent');
  for (let i = 0; i < 5; i++) mkPerson('recycling', rng.pick(['Pelletising', 'Washing']), 'contract');
  for (let i = 0; i < 9; i++) mkPerson('recycling', rng.pick(['Sorting', 'Washing', 'Bagging']), 'casual');
  // archived casuals
  for (let i = 0; i < 12; i++) mkPerson('mats', 'Finishing', 'casual', { status: 'archived', joinedOn: addDays(TODAY, -rng.int(20, 120)) }, { status: 'ended' });

  // ---------- shifts & attendance (last 14 days) ----------
  const shifts: Shift[] = []; const attendance: Attendance[] = [];
  const days: string[] = []; for (let d = 13; d >= 0; d--) days.push(addDays(TODAY, -d));
  for (const site of SITE_LIST) for (const day of days) { if (site.closedDays.includes(dow(day))) continue; for (const sk of site.shifts) shifts.push({ id: `sh_${site.id}_${day}_${sk.kind}`, siteId: site.id, day, kind: sk.kind }); }
  const sup = (site: SiteCode) => users.find((u) => u.roles.some((r) => r.role === 'supervisor' && r.siteId === site))!.id;
  for (const sh of shifts) {
    const site = sh.siteId;
    const staff = people.filter((p) => p.status === 'active' && (p.homeSiteId === site || p.sharedSites.includes(site)));
    for (const p of staff) {
      const eng = engagements.find((e) => e.personId === p.id);
      if (!eng) continue;
      if (eng.endDate && eng.endDate < sh.day) continue;
      if (eng.startDate > sh.day) continue;
      if (p.homeSiteId !== site && !rng.chance(0.35)) continue; // shared staff appear sometimes
      if (p.id === ghost.id && sh.day >= addDays(TODAY, -5)) continue; // ghost: absent 5 days running
      if (sh.day === TODAY && sh.kind === 'night') continue; // tonight has not started
      const isNightWorker = p.sector === 'Weaving' || p.sector === 'Extrusion' || p.sector === 'Pelletising';
      if (sh.kind === 'night' && !isNightWorker) continue;
      if (sh.kind === 'day' && isNightWorker && rng.chance(0.5)) continue;
      const roll = rng.next();
      const status = roll < 0.86 ? 'present' : roll < 0.92 ? 'half' : 'absent';
      if (sh.day === TODAY && rng.chance(0.08)) continue; // not yet marked
      attendance.push({ id: id('att'), shiftId: sh.id, personId: p.id, workedSiteId: site, status, overtimeHours: status === 'present' && rng.chance(0.15) ? rng.pick([1, 2]) : 0, markedBy: sup(site), at: at(sh.day, sh.kind === 'day' ? '07:4' + rng.int(0, 9) : '19:3' + rng.int(0, 9)) });
    }
  }

  // ---------- cash ----------
  const cashDays: CashDay[] = []; const cashEntries: CashEntry[] = [];
  const cashier = (site: SiteCode) => users.find((u) => u.roles.some((r) => r.role === 'cashier' && r.siteId === site))!.id;
  const pushEntry = (cd: CashDay, e: Omit<CashEntry, 'id' | 'cashDayId' | 'siteId' | 'day' | 'currency' | 'fxReference' | 'by' | 'at'> & { at?: string }) =>
    cashEntries.push({ id: id('ce'), cashDayId: cd.id, siteId: cd.siteId, day: cd.day, currency: 'UGX', fxReference: FX, by: cashier(cd.siteId), at: e.at ?? at(cd.day, `${rng.int(8, 17)}:${rng.int(10, 59)}`), ...e });
  // The real 18 August page for Mats (categorised)
  const aug18: CashDay = { id: 'cd_mats_2026-08-18', siteId: 'mats', day: '2026-08-18', currency: 'UGX', opening: 1_200_000, status: 'closed', countedClosing: 2_250_000, signedBy: 'u_cash_mats', closedAt: at('2026-08-18', '18:40') };
  cashDays.push(aug18);
  pushEntry(aug18, { direction: 'in', category: 'sale', amount: 4_500_000, payee: 'Local buyers (cash before delivery)', hasReceiptPhoto: false, at: at('2026-08-18', '11:05') });
  pushEntry(aug18, { direction: 'out', category: 'wages', amount: 1_068_000, payee: 'Weekly casual wages · 71 workers', hasReceiptPhoto: true, at: at('2026-08-18', '16:00') });
  pushEntry(aug18, { direction: 'out', category: 'spares', subcategory: 'Compressor oil', amount: 800_000, machineId: 'm_ext3', payee: 'Kampala Industrial Supplies', hasReceiptPhoto: true, at: at('2026-08-18', '09:30') });
  pushEntry(aug18, { direction: 'out', category: 'food', amount: 268_000, payee: 'Staff lunch', hasReceiptPhoto: false, at: at('2026-08-18', '12:30') });
  pushEntry(aug18, { direction: 'out', category: 'transport', subcategory: 'Boda', amount: 54_000, payee: 'Boda rides · spares collection', hasReceiptPhoto: false, at: at('2026-08-18', '10:10') });
  pushEntry(aug18, { direction: 'out', category: 'utilities', subcategory: 'Generator fuel', amount: 410_000, payee: 'Total Energies Ntinda', hasReceiptPhoto: true, at: at('2026-08-18', '08:20') });
  pushEntry(aug18, { direction: 'out', category: 'materials', amount: 650_000, payee: 'Masterbatch · 5 kg × 10', hasReceiptPhoto: true, at: at('2026-08-18', '14:15') });
  pushEntry(aug18, { direction: 'out', category: 'other', amount: 200_000, payee: 'Airtime & stationery', hasReceiptPhoto: false, at: at('2026-08-18', '15:00') });
  // Recent days for every site: last 6 working days closed, today open
  for (const site of SITE_LIST) {
    let opening = site.id === 'mats' ? 2_250_000 : site.id === 'bags' ? 1_640_000 : 780_000;
    for (let d = 6; d >= 0; d--) {
      const day = addDays(TODAY, -d); if (site.closedDays.includes(dow(day))) continue;
      const cd: CashDay = { id: `cd_${site.id}_${day}`, siteId: site.id, day, currency: 'UGX', opening, status: d === 0 ? 'open' : 'closed' };
      cashDays.push(cd);
      const sales = site.id === 'mats' ? rng.int(2_800_000, 6_200_000) : site.id === 'bags' ? rng.int(1_900_000, 4_100_000) : rng.int(600_000, 2_400_000);
      pushEntry(cd, { direction: 'in', category: 'sale', amount: sales, payee: 'Cash sales', hasReceiptPhoto: false });
      const outs: [CashEntry['category'], number, string, string?][] = [
        ['food', rng.int(180_000, 300_000), 'Staff lunch'], ['transport', rng.int(20_000, 90_000), 'Boda rides', 'Boda'], ['utilities', rng.int(150_000, 500_000), 'Generator fuel', 'Generator fuel'],
      ];
      if (rng.chance(0.6)) outs.push(['spares', rng.int(60_000, 450_000), 'Spares', rng.pick(site.expenseSubcategories.spares ?? ['Spares'])]);
      if (rng.chance(0.5)) outs.push(['materials', rng.int(300_000, 1_200_000), site.id === 'recycling' ? 'Collector payments' : 'Raw material']);
      if (rng.chance(0.3)) outs.push(['other', rng.int(30_000, 150_000), 'Admin']);
      let total = 0;
      for (const [cat, amt, payee, sub] of outs) { total += amt; pushEntry(cd, { direction: 'out', category: cat, subcategory: sub, amount: amt, payee, machineId: cat === 'spares' ? rng.pick(machines.filter((m) => m.siteId === site.id)).id : undefined, hasReceiptPhoto: rng.chance(0.7) }); }
      let wages = 0;
      if (dow(day) === 6 && d !== 0) { wages = site.id === 'mats' ? 1_120_000 : site.id === 'bags' ? 740_000 : 310_000; pushEntry(cd, { direction: 'out', category: 'wages', amount: wages, payee: 'Weekly casual wages', hasReceiptPhoto: true }); }
      const expected = opening + sales - total - wages;
      if (d !== 0) { const variance = d === 2 && site.id === 'mats' ? -35_000 : 0; cd.countedClosing = expected + variance; cd.signedBy = cashier(site.id); cd.closedAt = at(day, '18:3' + rng.int(0, 9)); opening = cd.countedClosing; }
    }
  }

  // ---------- zones ----------
  const zones: Zone[] = [
    { id: 'z_mats_a', siteId: 'mats', name: 'Store A · front' }, { id: 'z_mats_b', siteId: 'mats', name: 'Store A · back' }, { id: 'z_mats_c', siteId: 'mats', name: 'Store B' }, { id: 'z_mats_raw', siteId: 'mats', name: 'Raw store' },
    { id: 'z_bags_a', siteId: 'bags', name: 'Roll store' }, { id: 'z_bags_b', siteId: 'bags', name: 'Finished packs' }, { id: 'z_bags_raw', siteId: 'bags', name: 'Resin store' },
    { id: 'z_rec_a', siteId: 'recycling', name: 'Pellet store' }, { id: 'z_rec_in', siteId: 'recycling', name: 'Intake yard' },
  ];

  // ---------- production & labels ----------
  const labels: Label[] = []; const production: ProductionEntry[] = [];
  let labelSeq = 1;
  const mkLabel = (l: Omit<Label, 'id' | 'code' | 'parentIds'> & { parentIds?: string[] }): Label => { const code = `${l.siteId.toUpperCase().slice(0, 3)}-${l.kind.toUpperCase().slice(0, 3)}-${String(labelSeq++).padStart(6, '0')}`; const lab: Label = { id: `lab_${code}`, code, parentIds: [], ...l }; labels.push(lab); return lab; };
  const workers = (site: SiteCode, sector: string) => people.filter((p) => p.homeSiteId === site && p.sector === sector && p.status === 'active');
  const prodDays = days.slice(-8);
  for (const day of prodDays) {
    if (dow(day) === 0) continue;
    for (const sh of shifts.filter((s) => s.day === day)) {
      if (sh.day === TODAY && sh.kind === 'night') continue;
      const isToday = sh.day === TODAY;
      if (sh.siteId === 'mats') {
        // mixer batches
        const batches = isToday ? 7 : rng.int(10, 13);
        for (let b = 0; b < batches; b++) mkLabel({ siteId: 'mats', kind: 'batch', stageCode: 'mixer', machineId: 'm_mixer', shiftId: sh.id, day, qtyUnits: 1, qtyKg: 205, status: 'consumed', colour: rng.pick(['Blue', 'Green', 'Red', 'Purple', 'Cream']) });
        production.push({ id: id('pe'), siteId: 'mats', stageCode: 'mixer', machineId: 'm_mixer', shiftId: sh.id, day, goodUnits: batches, rejectUnits: 0, inputKg: batches * 205, outputKg: batches * 205, downtimeMin: 0, at: at(day, isToday ? '11:40' : '12:00') });
        // extruders
        for (let i = 1; i <= 14; i++) { const kg = isToday ? rng.int(45, 70) : rng.int(80, 115); production.push({ id: id('pe'), siteId: 'mats', stageCode: 'extrude', machineId: `m_ext${i}`, shiftId: sh.id, day, operatorId: rng.pick(workers('mats', 'Extrusion'))?.id, goodUnits: 0, rejectUnits: 0, inputKg: kg + rng.int(1, 4), outputKg: kg, downtimeMin: rng.chance(0.15) ? rng.int(20, 90) : 0, downtimeReason: undefined, at: at(day, isToday ? '13:00' : '18:00') }); if (rng.chance(0.5)) mkLabel({ siteId: 'mats', kind: 'rack', stageCode: 'dry', machineId: `m_ext${i}`, shiftId: sh.id, day, qtyUnits: 1, qtyKg: kg, status: day >= addDays(TODAY, -1) ? 'in_stock' : 'consumed', colour: rng.pick(['Blue', 'Green', 'Red', 'Purple', 'Cream']) }); }
        // looms
        for (let i = 1; i <= 15; i++) {
          const prod = matProducts[(i + prodDays.indexOf(day)) % 5];
          const bench = benchmarks.find((b) => b.machineId === `m_loom${i}` && b.productId === prod.id)!.unitsPerShift;
          const notLogged = isToday && i === 9; // the deliberate gap
          if (notLogged) continue;
          const progress = isToday ? 0.55 : 1;
          const below = (!isToday && rng.chance(0.12)) || (isToday && i === 4);
          const good = Math.round(bench * progress * (below ? 0.55 : rng.next() * 0.2 + 0.88));
          const down = below ? rng.int(90, 240) : rng.chance(0.2) ? rng.int(10, 45) : 0;
          production.push({ id: id('pe'), siteId: 'mats', stageCode: 'weave', machineId: `m_loom${i}`, shiftId: sh.id, day, operatorId: workers('mats', 'Weaving')[i % Math.max(1, workers('mats', 'Weaving').length)]?.id, productId: prod.id, goodUnits: good, rejectUnits: rng.int(0, 3), inputKg: Math.round(good * 3.0), outputKg: Math.round(good * 2.95), downtimeMin: down, downtimeReason: down > 60 ? (isToday && i === 4 ? undefined : rng.pick(['Power', 'Mechanical', 'No string'])) : undefined, at: at(day, isToday ? '13:10' : '18:50') });
          // finishing → bundles
          if (!isToday || rng.chance(0.5)) { const bundles = Math.floor(good / prod.bundlePieces); for (let b = 0; b < bundles; b++) { const old = day < addDays(TODAY, -5); mkLabel({ siteId: 'mats', kind: 'bundle', productId: prod.id, stageCode: 'finish', machineId: `m_loom${i}`, operatorId: rng.pick(workers('mats', 'Finishing'))?.id, shiftId: sh.id, day, qtyUnits: prod.bundlePieces, qtyKg: prod.stdBundleWeightKg, status: old && rng.chance(0.7) ? 'dispatched' : 'in_stock', zoneId: rng.pick(['z_mats_a', 'z_mats_b', 'z_mats_c']) }); } }
        }
        // waste
        if (sh.kind === 'day') { const w0 = rng.int(60, 120); const w = isToday ? w0 : Math.round(w0 * 3.6); /* ~8% of a full day's input, the briefing's estimate */ mkLabel({ siteId: 'mats', kind: 'sack', productId: 'p_black_pellet', stageCode: 'store', machineId: 'm_crusher', shiftId: sh.id, day, qtyUnits: 1, qtyKg: w, status: 'in_stock', zoneId: 'z_mats_raw' }); production.push({ id: id('pe'), siteId: 'mats', stageCode: 'store', machineId: 'm_crusher', shiftId: sh.id, day, productId: 'p_black_pellet', goodUnits: 1, rejectUnits: 0, inputKg: w + 6, outputKg: w, downtimeMin: 0, at: at(day, isToday ? '12:50' : '17:30') }); }
      }
      if (sh.siteId === 'bags') {
        for (const l of 'ABCDEFGH') { const rolls = isToday ? rng.int(2, 4) : rng.int(5, 8); let kg = 0; for (let r = 0; r < rolls; r++) { const w = rng.int(52, 68); kg += w; mkLabel({ siteId: 'bags', kind: 'roll', productId: rng.chance(0.6) ? 'p_roll_faras' : 'p_roll_nuur', stageCode: 'extrude', machineId: `m_bext${l}`, operatorId: rng.pick(workers('bags', 'Extrusion'))?.id, shiftId: sh.id, day, qtyUnits: 1, qtyKg: w, status: day >= addDays(TODAY, -2) ? 'in_stock' : 'consumed', zoneId: 'z_bags_a' }); } production.push({ id: id('pe'), siteId: 'bags', stageCode: 'extrude', machineId: `m_bext${l}`, shiftId: sh.id, day, operatorId: rng.pick(workers('bags', 'Extrusion'))?.id, productId: 'p_roll_faras', goodUnits: rolls, rejectUnits: 0, inputKg: Math.round(kg * 1.03), outputKg: kg, downtimeMin: rng.chance(0.2) ? rng.int(15, 120) : 0, downtimeReason: undefined, at: at(day, isToday ? '13:30' : '18:30') }); }
        for (let c = 1; c <= 4; c++) { const prod = rng.pick(products.filter((p) => p.siteId === 'bags' && p.kind === 'bag_pack')); const packs = isToday ? rng.int(20, 40) : rng.int(60, 110); production.push({ id: id('pe'), siteId: 'bags', stageCode: 'convert', machineId: `m_conv${c}`, shiftId: sh.id, day, operatorId: rng.pick(workers('bags', 'Conversion'))?.id, productId: prod.id, goodUnits: packs, rejectUnits: rng.int(0, 4), inputKg: Math.round(packs * prod.stdBundleWeightKg * 1.04), outputKg: Math.round(packs * prod.stdBundleWeightKg), downtimeMin: 0, at: at(day, isToday ? '13:40' : '18:40') }); for (let k = 0; k < Math.min(packs, 12); k++) mkLabel({ siteId: 'bags', kind: 'pack', productId: prod.id, stageCode: 'convert', machineId: `m_conv${c}`, shiftId: sh.id, day, qtyUnits: 100, qtyKg: prod.stdBundleWeightKg, status: 'in_stock', zoneId: 'z_bags_b' }); }
        if (sh.kind === 'day') mkLabel({ siteId: 'bags', kind: 'sack', stageCode: 'store', shiftId: sh.id, day, qtyUnits: 1, qtyKg: rng.int(25, 45), status: 'in_stock', zoneId: 'z_bags_raw', grade: 'Film scrap' });
      }
      if (sh.siteId === 'recycling') {
        for (const [mid, cap] of [['m_line10', 5000], ['m_line4', 2000]] as const) { const inKg = Math.round(cap * (isToday ? 0.5 : rng.next() * 0.25 + 0.7)); const outKg = Math.round(inKg * (rng.next() * 0.05 + 0.88)); production.push({ id: id('pe'), siteId: 'recycling', stageCode: 'pelletise', machineId: mid, shiftId: sh.id, day, operatorId: rng.pick(workers('recycling', 'Pelletising'))?.id, productId: rng.pick(['p_hdpe_nat', 'p_hdpe_mixed', 'p_hdpe_black']), goodUnits: Math.floor(outKg / 25), rejectUnits: 0, inputKg: inKg, outputKg: outKg, downtimeMin: rng.chance(0.25) ? rng.int(30, 180) : 0, downtimeReason: undefined, at: at(day, isToday ? '13:20' : '18:20') }); for (let s = 0; s < Math.min(10, Math.floor(outKg / 25)); s++) mkLabel({ siteId: 'recycling', kind: 'sack', productId: rng.pick(['p_hdpe_nat', 'p_hdpe_mixed', 'p_hdpe_black']), stageCode: 'pelletise', machineId: mid, shiftId: sh.id, day, qtyUnits: 1, qtyKg: 25, status: 'in_stock', zoneId: 'z_rec_a', grade: mid === 'm_line10' ? 'A' : 'B' }); }
      }
    }
  }
  // fill in downtime reasons where missing but downtime > 60
  for (const pe of production) if (pe.downtimeMin > 60 && !pe.downtimeReason && !(pe.day === TODAY && pe.machineId === 'm_loom4')) pe.downtimeReason = rng.pick(['Power', 'Mechanical', 'No string']);

  // ---------- stock counts (last month) ----------
  const stockCounts: StockCount[] = [];
  for (const p of matProducts) { const sys = labels.filter((l) => l.productId === p.id && l.status === 'in_stock').length; stockCounts.push({ id: id('sc'), siteId: 'mats', zoneId: 'z_mats_a', day: addDays(TODAY, -9), productId: p.id, countedBundles: sys + rng.int(-3, 1), systemBundles: sys, by: 'u_store_mats', at: at(addDays(TODAY, -9), '16:00') }); }

  // ---------- clients, orders, dispatches ----------
  const clients: Client[] = [
    { id: 'c_kla1', name: 'Owino Market Traders', country: 'Uganda', channel: 'local', whatsapp: '+256 772 110 334', currencyPref: 'UGX', creditLimit: 0, creditDays: 0, contact: 'Mama Nalongo' },
    { id: 'c_kla2', name: 'Jinja Road Wholesalers', country: 'Uganda', channel: 'local', whatsapp: '+256 701 445 920', currencyPref: 'UGX', creditLimit: 0, creditDays: 0, contact: 'Mr. Ssekandi' },
    { id: 'c_kla3', name: 'Mbarara Home Supplies', country: 'Uganda', channel: 'local', whatsapp: '+256 782 330 118', currencyPref: 'UGX', creditLimit: 0, creditDays: 0, contact: 'Doreen K.' },
    { id: 'c_rw1', name: 'Kigali Home & Mat Traders', country: 'Rwanda', channel: 'export', whatsapp: '+250 788 402 115', currencyPref: 'USD', creditLimit: 40000, creditDays: 30, contact: 'Jean-Paul H.' },
    { id: 'c_rw2', name: 'Nyabugogo Distributors', country: 'Rwanda', channel: 'export', whatsapp: '+250 722 918 207', currencyPref: 'USD', creditLimit: 25000, creditDays: 30, contact: 'Claudine U.' },
    { id: 'c_ss1', name: 'Juba Konyo-Konyo Traders', country: 'South Sudan', channel: 'export', whatsapp: '+211 912 334 870', currencyPref: 'USD', creditLimit: 30000, creditDays: 45, contact: 'Deng M.' },
    { id: 'c_bag1', name: 'Nakasero Supermarkets', country: 'Uganda', channel: 'local', whatsapp: '+256 752 006 318', currencyPref: 'UGX', creditLimit: 0, creditDays: 0, contact: 'Procurement' },
    { id: 'c_rec1', name: 'East Africa Polymers Ltd', country: 'Uganda', channel: 'local', whatsapp: '+256 759 220 441', currencyPref: 'UGX', creditLimit: 0, creditDays: 0, contact: 'Plant buyer' },
  ];
  const priceOf = (p: Product, channel: 'local' | 'export') => p.prices.find((x) => x.channel === channel) ?? p.prices[0];
  const orders: Order[] = []; const dispatches: Dispatch[] = []; const invoices: Invoice[] = []; const payments: Payment[] = [];
  let dnMats = 1, dnBags = 4817, orderNo = 2310;
  const mkOrder = (site: SiteCode, clientId: string, lines: { productId: string; bundles: number }[], status: Order['status'], createdDay: string, extra: Partial<Order> = {}) => {
    const client = clients.find((c) => c.id === clientId)!;
    const o: Order = { id: id('ord'), number: `SO-${orderNo++}`, siteId: site, clientId, status, currency: client.currencyPref, fxReference: FX, createdAt: at(createdDay, '09:30'), lines: lines.map((l) => { const p = products.find((x) => x.id === l.productId)!; const pr = priceOf(p, client.channel); return { productId: l.productId, bundles: l.bundles, unitPrice: pr.currency === client.currencyPref ? pr.amount * p.bundlePieces : (pr.currency === 'USD' ? pr.amount * FX : pr.amount / FX) * p.bundlePieces }; }), ...extra };
    orders.push(o); return o;
  };
  const mkDispatch = (o: Order, opts: Partial<Dispatch> & { day: string; status: Dispatch['gateStatus']; short?: number }) => {
    const matLines = o.lines.map((l) => ({ bundles: l.bundles, stdBundleWeightKg: products.find((p) => p.id === l.productId)!.stdBundleWeightKg }));
    const expected = expectedCargoKg(matLines);
    const scanned: string[] = [];
    for (const l of o.lines) { const avail = labels.filter((x) => x.productId === l.productId && x.status === 'dispatched').slice(0, l.bundles - (opts.short ?? 0)); scanned.push(...avail.map((x) => x.id)); }
    const dn = o.siteId === 'bags' ? `DN-${dnBags++}` : `DN-${String(dnMats++).padStart(5, '0')}`;
    const d: Dispatch = { id: id('dsp'), orderId: o.id, siteId: o.siteId, deliveryNoteNo: dn, scannedLabelIds: scanned, expectedKg: expected, gateStatus: opts.status, driver: 'Simon Katongole', vehicle: rng.pick(['UBK 442X', 'UAX 918L', 'UBE 207T']), hasLorryPhoto: true, hasDriverSignature: true, createdAt: at(opts.day, '14:00'), ...opts };
    if (opts.status === 'pass') { d.gateKg = Math.round(expected * (1 + (rng.next() * 0.02 - 0.01))); d.variancePct = Math.round(((d.gateKg - expected) / expected) * 10000) / 100; d.gatePassedAt = at(opts.day, '15:10'); }
    dispatches.push(d); return d;
  };
  // History: local orders paid & delivered
  for (let i = 0; i < 9; i++) { const day = addDays(TODAY, -rng.int(2, 25)); const cl = rng.pick(['c_kla1', 'c_kla2', 'c_kla3']); const o = mkOrder('mats', cl, [{ productId: rng.pick(matProducts).id, bundles: rng.int(5, 30) }, { productId: rng.pick(matProducts).id, bundles: rng.int(5, 20) }], 'paid', day, { cashConfirmedAt: at(day, '10:00') }); const d = mkDispatch(o, { day, status: 'pass' }); d.pod = { receiverName: clients.find((c) => c.id === cl)!.contact, bundlesCounted: o.lines.reduce((s, l) => s + l.bundles, 0), bundlesExpected: o.lines.reduce((s, l) => s + l.bundles, 0), deliveredAt: at(day, '17:30'), hasSignature: true }; const total = o.lines.reduce((s, l) => s + l.bundles * l.unitPrice, 0); invoices.push({ id: id('inv'), orderId: o.id, number: `INV-${o.number.slice(3)}`, total, currency: 'UGX', issuedAt: at(day, '16:00') }); payments.push({ id: id('pay'), clientId: cl, invoiceId: invoices.at(-1)!.id, amount: total, currency: 'UGX', method: 'Cash', reference: `CASH-${rng.int(1000, 9999)}`, at: at(day, '10:00') }); }
  // Export history for Rwanda & Juba
  for (const [cl, n] of [['c_rw1', 4], ['c_rw2', 2], ['c_ss1', 3]] as const) for (let i = 0; i < n; i++) { const day = addDays(TODAY, -rng.int(10, 75)); const o = mkOrder('mats', cl, [{ productId: 'p_rihlaat', bundles: rng.int(60, 140) }, { productId: 'p_domona', bundles: rng.int(30, 80) }, { productId: 'p_27m', bundles: rng.int(10, 30) }], rng.chance(0.6) ? 'paid' : 'invoiced', day, { approvedBy: 'u_ceo1', approvedAt: at(day, '09:50') }); const d = mkDispatch(o, { day, status: 'pass' }); d.pod = { receiverName: clients.find((c) => c.id === cl)!.contact, bundlesCounted: o.lines.reduce((s, l) => s + l.bundles, 0), bundlesExpected: o.lines.reduce((s, l) => s + l.bundles, 0), deliveredAt: at(addDays(day, 1), '16:30'), hasSignature: true }; const total = o.lines.reduce((s, l) => s + l.bundles * l.unitPrice, 0); invoices.push({ id: id('inv'), orderId: o.id, number: `INV-${o.number.slice(3)}`, total, currency: 'USD', issuedAt: at(day, '16:00') }); if (o.status === 'paid') payments.push({ id: id('pay'), clientId: cl, invoiceId: invoices.at(-1)!.id, amount: total, currency: 'USD', method: 'Bank transfer', reference: `TT${rng.int(100000, 999999)}`, at: at(addDays(day, rng.int(5, 28)), '11:00') }); }
  // The Rwanda shipment in the story: approved, picking, ready for Cargo Builder
  const rwanda = mkOrder('mats', 'c_rw1', [{ productId: 'p_rihlaat', bundles: 100 }, { productId: 'p_domona', bundles: 50 }], 'picking', addDays(TODAY, -1), { approvedBy: 'u_ceo1', approvedAt: at(addDays(TODAY, -1), '10:20'), notes: 'Kigali, via Katuna. Driver Simon.' });
  void rwanda;
  // Awaiting approval (credit desk) and awaiting cash (local)
  const jubaOrder = mkOrder('mats', 'c_ss1', [{ productId: 'p_sajaada_h', bundles: 260 }, { productId: 'p_domona', bundles: 320 }], 'awaiting_approval', TODAY);
  mkOrder('mats', 'c_rw2', [{ productId: 'p_27m', bundles: 40 }], 'awaiting_approval', TODAY);
  mkOrder('mats', 'c_kla2', [{ productId: 'p_rihlaat', bundles: 12 }, { productId: 'p_sajaada_l', bundles: 8 }], 'awaiting_cash', TODAY);
  mkOrder('bags', 'c_bag1', [{ productId: 'p_bag_medium_black', bundles: 40 }, { productId: 'p_bag_large_white', bundles: 25 }], 'awaiting_cash', TODAY);
  { const o = mkOrder('bags', 'c_bag1', [{ productId: 'p_bag_small_black', bundles: 60 }], 'paid', addDays(TODAY, -3), { cashConfirmedAt: at(addDays(TODAY, -3), '10:00') }); mkDispatch(o, { day: addDays(TODAY, -3), status: 'pass' }); }
  { const o = mkOrder('recycling', 'c_rec1', [{ productId: 'p_hdpe_nat', bundles: 200 }], 'paid', addDays(TODAY, -2), { cashConfirmedAt: at(addDays(TODAY, -2), '09:00') }); mkDispatch(o, { day: addDays(TODAY, -2), status: 'pass' }); }
  mkOrder('recycling', 'c_rec1', [{ productId: 'p_hdpe_mixed', bundles: 160 }], 'awaiting_cash', TODAY);

  // ---------- spares ----------
  const parts: Part[] = [];
  const partSpec: [SiteCode, string, string, number, number, number][] = [
    ['mats', 'Loom drive belt B-52', 'pc', 4, 85000, 6], ['mats', 'Bearing 6205-2RS', 'pc', 10, 18000, 3], ['mats', 'Heater band 220V 1.2kW', 'pc', 6, 95000, 7], ['mats', 'Sewing needle pack', 'pack', 5, 12000, 14], ['mats', 'Compressor oil 20L', 'drum', 2, 400000, 1], ['mats', 'Extruder screen pack', 'pc', 8, 32000, 11], ['mats', 'Shuttle hook', 'pc', 6, 24000, 9],
    ['bags', 'Heater band 180mm', 'pc', 6, 88000, 9], ['bags', 'Sealing wire 2m', 'pc', 10, 15000, 4], ['bags', 'Cutting blade', 'pc', 8, 21000, 16], ['bags', 'Screen mesh 80', 'pc', 10, 9000, 30],
    ['recycling', 'Pelletiser blade set', 'set', 2, 650000, 3], ['recycling', 'Screen changer mesh', 'pc', 10, 14000, 22], ['recycling', 'Wash pump seal kit', 'kit', 2, 120000, 1], ['recycling', 'Bearing 6308', 'pc', 6, 42000, 8],
  ];
  for (const [site, name, unit, min, cost, onHand] of partSpec) parts.push({ id: id('part'), siteId: site, name, unit, minLevel: min, unitCost: cost, onHand });
  const partIssues: PartIssue[] = []; const breakdowns: Breakdown[] = [];
  for (let i = 0; i < 18; i++) { const day = addDays(TODAY, -rng.int(0, 20)); const site: SiteCode = rng.pick(['mats', 'mats', 'bags', 'recycling']); const part = rng.pick(parts.filter((p) => p.siteId === site)); const machine = rng.pick(machines.filter((m) => m.siteId === site && m.status === 'active')); partIssues.push({ id: id('pi'), siteId: site, partId: part.id, machineId: machine.id, mechanicId: mechanic.id, qty: rng.int(1, 2), at: at(day, `${rng.int(8, 17)}:${rng.int(10, 59)}`) }); }
  for (let i = 0; i < 9; i++) { const rolled = addDays(TODAY, -rng.int(0, 25)); const day = i === 0 ? TODAY : rolled; /* the one open breakdown started this morning */ const site: SiteCode = rng.pick(['mats', 'mats', 'bags', 'recycling']); const machine = rng.pick(machines.filter((m) => m.siteId === site && m.status === 'active' && m.kind !== 'mixer')); const resolved = !(i === 0); breakdowns.push({ id: id('bd'), siteId: site, machineId: machine.id, startedAt: at(day, '10:15'), resolvedAt: resolved ? at(day, `${rng.int(12, 18)}:30`) : undefined, cause: rng.pick(['Belt snapped', 'Bearing seized', 'Heater band failed', 'Power surge', 'Blockage']), sparesCost: rng.int(20000, 450000) }); }
  const downMachine = breakdowns.find((b) => !b.resolvedAt)!; machines.find((m) => m.id === downMachine.machineId)!.status = 'down';

  // ---------- collectors ----------
  const collectorDeliveries: CollectorDelivery[] = [];
  for (let d = 9; d >= 0; d--) { const day = addDays(TODAY, -d); if (dow(day) === 0) continue; const n = d === 0 ? 2 : rng.int(3, 6); for (let i = 0; i < n; i++) { const gross = rng.int(600, 2400), tare = rng.int(20, 60), ded = rng.pick([4, 6, 8, 10, 12]); const net = Math.round((gross - tare) * (1 - ded / 100) * 10) / 10; collectorDeliveries.push({ id: id('cdl'), siteId: 'recycling', collector: rng.pick(COLLECTORS), grossKg: gross, tareKg: tare, deductionPct: ded, netKg: net, pricePerKg: rng.pick([850, 900, 950]), currency: 'UGX', paid: d > 0, day, at: at(day, `${rng.int(7, 16)}:${rng.int(10, 59)}`), hasScalePhoto: true }); } }

  // ---------- exceptions & audit ----------
  const exceptions: BusinessException[] = [
    { id: 'ex_1', siteId: 'mats', kind: 'below_benchmark', severity: 'warning', title: 'Loom 4 at 55% of benchmark, no reason given', detail: 'Day shift today. Domona benchmark 36, logged 20 by 13:10 with 140 min downtime and no reason.', subjectRef: 'm_loom4', status: 'open', ownerRole: 'supervisor', raisedAt: at(TODAY, '13:12') },
    { id: 'ex_2', siteId: 'mats', kind: 'cash_variance', severity: 'warning', title: 'Cash close short by UGX 35,000', detail: `Counted closing on ${addDays(TODAY, -2)} was UGX 35,000 below expected.`, subjectRef: `cd_mats_${addDays(TODAY, -2)}`, status: 'open', ownerRole: 'site_manager', raisedAt: at(addDays(TODAY, -2), '18:41') },
    { id: 'ex_3', siteId: 'mats', kind: 'ghost_worker', severity: 'info', title: `${ghost.fullName} absent 5 days, archiving tonight`, detail: 'Casual worker, Finishing. Will move to the archived roster unless marked present today.', subjectRef: ghost.id, status: 'open', ownerRole: 'supervisor', raisedAt: at(TODAY, '07:00') },
    { id: 'ex_4', siteId: 'mats', kind: 'not_logged', severity: 'warning', title: 'Loom 9 has no entry this shift', detail: 'Day shift today, 6 hours in. Every other loom has an entry.', subjectRef: 'm_loom9', status: 'open', ownerRole: 'supervisor', raisedAt: at(TODAY, '13:00') },
    { id: 'ex_5', siteId: 'mats', kind: 'contract_expiring', severity: 'info', title: `${expiring.fullName}: contract ends in 3 days`, detail: '15-day contract, Weaving. Renew or let it end.', subjectRef: expiring.id, status: 'open', ownerRole: 'site_manager', raisedAt: at(TODAY, '07:00') },
    { id: 'ex_6', siteId: 'mats', kind: 'low_stock', severity: 'warning', title: 'Compressor oil below minimum (1 of 2)', detail: 'Reorder before the next service.', status: 'open', ownerRole: 'storekeeper', raisedAt: at(addDays(TODAY, -1), '16:00') },
    (() => { const cl = clients.find((c) => c.id === 'c_ss1')!; const inv = invoices.filter((i) => orders.find((o) => o.id === i.orderId)?.clientId === cl.id).reduce((t, i) => t + i.total, 0); const paid = payments.filter((x) => x.clientId === cl.id).reduce((t, x) => t + x.amount, 0); const total = jubaOrder.lines.reduce((t, l) => t + l.bundles * l.unitPrice, 0); const pct = Math.round(((inv - paid + total) / cl.creditLimit) * 100); return { id: 'ex_7', siteId: 'mats' as const, kind: 'credit_over_limit' as const, severity: 'critical' as const, title: `${cl.name} order exceeds credit limit`, detail: `Order ${jubaOrder.number} would take the client to ${pct}% of the USD ${cl.creditLimit.toLocaleString()} limit.`, subjectRef: jubaOrder.id, status: 'open' as const, ownerRole: 'ceo' as const, raisedAt: at(TODAY, '09:35') }; })(),
    { id: 'ex_8', siteId: 'recycling', kind: 'low_stock', severity: 'warning', title: 'Wash pump seal kit below minimum (1 of 2)', detail: 'Reorder before the next service.', status: 'open', ownerRole: 'storekeeper', raisedAt: at(addDays(TODAY, -2), '11:00') },
    { id: 'ex_9', siteId: 'bags', kind: 'below_benchmark', severity: 'info', title: 'Extruder C: 120 min downtime, Power', detail: 'Night shift yesterday. Reason recorded.', subjectRef: 'm_bextC', status: 'resolved', ownerRole: 'supervisor', raisedAt: at(addDays(TODAY, -1), '22:10'), decidedBy: 'u_sm_bags', decidedAt: at(TODAY, '08:00'), decisionReason: 'Generator fuel delivered late' },
  ];
  const audit: AuditEvent[] = [
    { id: 'au_1', siteId: 'mats', kind: 'CashDayReopened', summary: `Cash day ${addDays(TODAY, -4)} reopened to add a missed fuel receipt`, actorId: 'u_sm_mats', actorName: 'Moses Tumusiime', deviceId: 'desk-mats-01', at: at(addDays(TODAY, -3), '08:15'), reason: 'Fuel receipt UGX 180,000 found in the drawer', flag: 'reopen' },
    { id: 'au_2', siteId: 'mats', kind: 'AttendanceCorrected', summary: 'Attendance for Mariam Nalwanga changed Absent → Present', actorId: 'u_sm_mats', actorName: 'Moses Tumusiime', deviceId: 'desk-mats-01', at: at(addDays(TODAY, -2), '19:40'), reason: 'Supervisor marked the wrong row; worker was on night shift', flag: 'edit' },
    { id: 'au_3', siteId: 'mats', kind: 'StockCounted', summary: 'Store A · front counted: Domona 3 bundles below system', actorId: 'u_store_mats', actorName: 'Peter Mukasa', deviceId: 'tab-mats-store', at: at(addDays(TODAY, -9), '16:02'), flag: 'variance' },
    { id: 'au_4', siteId: 'bags', kind: 'ExceptionDecided', summary: 'Extruder C downtime resolved: generator fuel delivered late', actorId: 'u_sm_bags', actorName: 'Grace Nabirye', deviceId: 'desk-bags-01', at: at(TODAY, '08:00'), flag: 'normal' },
    { id: 'au_5', siteId: 'recycling', kind: 'PartIssued', summary: 'Pelletiser blade set issued to Line 4T by Kato Mugisha', actorId: 'u_mech', actorName: 'Kato Mugisha', deviceId: 'tab-rec-01', at: at(addDays(TODAY, -1), '14:22'), flag: 'normal' },
    { id: 'au_6', kind: 'OrderApproved', summary: 'Export order SO-2328 for Kigali Home & Mat Traders approved', actorId: 'u_ceo1', actorName: 'Hassan Warsame', deviceId: 'phone-ceo1', at: at(addDays(TODAY, -1), '10:20'), flag: 'normal' },
    { id: 'au_7', siteId: 'mats', kind: 'CashDayClosed', summary: `Cash day ${addDays(TODAY, -1)} closed and signed, variance 0`, actorId: 'u_cash_mats', actorName: 'Joseph Okello', deviceId: 'desk-mats-01', at: at(addDays(TODAY, -1), '18:36'), flag: 'normal' },
  ];
  void expired; void driver;

  return { users, machines, products, benchmarks, people, engagements, shifts, attendance, cashDays, cashEntries, labels, production, zones, stockCounts, clients, orders, dispatches, invoices, payments, parts, partIssues, breakdowns, collectorDeliveries, exceptions, audit };
}
