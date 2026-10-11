// ---------------------------------------------------------------------------
// Tanaad domain model. Single source of truth for client, seed data and (later)
// the generated API client. Keep in sync with contracts/openapi.yaml.
// ---------------------------------------------------------------------------

export type SiteCode = 'mats' | 'bags' | 'recycling';
export type Currency = 'UGX' | 'USD';
export type Role =
  | 'ceo' | 'group_admin' | 'site_manager' | 'supervisor' | 'cashier'
  | 'storekeeper' | 'gate' | 'mechanic' | 'sales' | 'driver';

export type ShiftKind = 'day' | 'night';
export type EngagementType = 'permanent' | 'contract' | 'casual';
export type RateBasis = 'month' | 'shift' | 'day' | 'piece';
export type SettlementCycle = 'weekly' | 'end_of_term' | 'monthly';
export type AttendanceStatus = 'present' | 'half' | 'absent';

export type ExpenseCategory =
  | 'wages' | 'materials' | 'spares' | 'utilities' | 'transport' | 'food' | 'other';
export type CashCategory = ExpenseCategory | 'sale' | 'receipt' | 'advance' | 'payout' | 'opening';

export type LabelKind = 'roll' | 'rack' | 'bundle' | 'sack' | 'bag' | 'batch' | 'pack';
export type LabelStatus = 'created' | 'in_stock' | 'consumed' | 'dispatched' | 'scrapped';

export type OrderStatus =
  | 'draft' | 'awaiting_cash' | 'awaiting_approval' | 'approved' | 'picking'
  | 'dispatched' | 'delivered' | 'invoiced' | 'paid' | 'held';

export type GateStatus = 'pending' | 'pass' | 'hold' | 'overridden';

export type ExceptionKind =
  | 'gate_variance' | 'mass_gap' | 'cash_variance' | 'below_benchmark' | 'pod_discrepancy'
  | 'credit_over_limit' | 'ghost_worker' | 'contract_expiring' | 'low_stock' | 'not_logged';
export type ExceptionStatus = 'open' | 'approved' | 'held' | 'resolved';

export interface Site {
  id: SiteCode;
  name: string;
  legalName: string;
  shortName: string;
  tagline: string;
  currencyPrimary: Currency;
  shifts: { kind: ShiftKind; starts: string; ends: string }[];
  closedDays: number[]; // 0 = Sunday
  sectors: string[];
  machineWallTitle: string; // Loom Wall, Extruder Wall, Line Wall
  stages: Stage[];
  expenseSubcategories: Partial<Record<ExpenseCategory, string[]>>;
  downtimeReasons: string[];
  thresholds: { gateTolerancePct: number; massGapPct: number; cashVariance: number; benchmarkPct: number };
  deliveryNoteSeriesStart: number;
  toBeConfirmed?: string; // note shown on production screens when the process is unconfirmed
}

export interface Stage {
  code: string;
  name: string;
  sequence: number;
  inputUnit: 'kg' | 'units' | 'bags';
  outputUnit: 'kg' | 'units' | 'bundles' | 'sacks' | 'rolls' | 'packs';
  producesLabel?: LabelKind;
}

export interface Machine {
  id: string;
  siteId: SiteCode;
  code: string;      // "Loom 11", "Extruder F", "Line 10T"
  kind: string;      // loom | extruder | mixer | line | converter | crusher
  stageCode: string;
  status: 'active' | 'arriving' | 'down' | 'retired';
  commissioned?: string;
  /** Rated capacity in kg per day, where the machine has one (recycling lines). */
  capacityKgPerDay?: number;
}

export interface Product {
  id: string;
  siteId: SiteCode;
  internalName: string;
  commercialName?: string;
  kind: 'mat' | 'bag_pack' | 'pellet' | 'material' | 'roll';
  bundlePieces: number;            // pieces per bundle / pack
  stdBundleWeightKg: number;       // measured (illustrative in demo)
  weightTolerancePct: number;
  weightStatus: 'measured' | 'to_be_measured';
  prices: Price[];
  colour?: string;
  /** Unit the product is counted in (a master-data unit label, e.g. "bundle", "pack", "sack"). */
  unit?: string;
  /** Film thickness in microns, for bags. Carrier bags under 30 microns are banned in Uganda. */
  thicknessMicron?: number;
  active?: boolean;
}

export interface Price {
  channel: 'local' | 'export';
  currency: Currency;
  amount: number;
  effectiveFrom: string;
}

export interface Benchmark { machineId: string; productId: string; unitsPerShift: number }

export interface Person {
  id: string;
  homeSiteId: SiteCode;
  fullName: string;
  idNumber: string;
  phoneMomo: string;
  sector: string;
  shared: boolean;
  sharedSites: SiteCode[];
  avatarSeed: string;      // deterministic avatar colour/initials
  status: 'active' | 'archived';
  joinedOn: string;
}

export interface Engagement {
  id: string;
  personId: string;
  siteId: SiteCode;
  type: EngagementType;
  startDate: string;
  endDate?: string;
  termDays?: number;
  rateBasis: RateBasis;
  rate: number;
  currency: Currency;
  settlementCycle: SettlementCycle;
  status: 'active' | 'expired' | 'renewed' | 'ended';
}

export interface Shift { id: string; siteId: SiteCode; day: string; kind: ShiftKind }

export interface Attendance {
  id: string;
  shiftId: string;
  personId: string;
  workedSiteId: SiteCode;
  status: AttendanceStatus;
  overtimeHours: number;
  markedBy: string;
  at: string;
}

export interface CashDay {
  id: string;
  siteId: SiteCode;
  day: string;
  currency: Currency;
  opening: number;
  status: 'open' | 'closed' | 'reopened';
  countedClosing?: number;
  signedBy?: string;
  closedAt?: string;
  denominations?: Record<string, number>;
}

export interface CashEntry {
  id: string;
  cashDayId: string;
  siteId: SiteCode;
  day: string;
  direction: 'in' | 'out';
  category: CashCategory;
  subcategory?: string;
  amount: number;
  currency: Currency;
  fxReference: number;
  machineId?: string;
  productId?: string;
  payee?: string;
  note?: string;
  hasReceiptPhoto: boolean;
  at: string;
  by: string;
}

export interface Label {
  id: string;
  code: string;
  siteId: SiteCode;
  kind: LabelKind;
  productId?: string;
  stageCode: string;
  machineId?: string;
  operatorId?: string;
  shiftId?: string;
  day: string;
  qtyUnits: number;
  qtyKg: number;
  status: LabelStatus;
  zoneId?: string;
  parentIds: string[];
  colour?: string;
  grade?: string;
}

export interface ProductionEntry {
  id: string;
  siteId: SiteCode;
  stageCode: string;
  machineId: string;
  shiftId: string;
  day: string;
  operatorId?: string;
  productId?: string;
  goodUnits: number;
  rejectUnits: number;
  inputKg: number;
  outputKg: number;
  downtimeMin: number;
  downtimeReason?: string;
  at: string;
}

export interface Zone { id: string; siteId: SiteCode; name: string }

export interface StockMovement {
  id: string;
  siteId: SiteCode;
  kind: 'production_in' | 'dispatch_out' | 'adjust' | 'scrap' | 'transfer' | 'receive';
  labelId?: string;
  productId?: string;
  fromZoneId?: string;
  toZoneId?: string;
  toSiteId?: SiteCode;
  qtyUnits: number;
  qtyKg: number;
  reason?: string;
  at: string;
  by: string;
}

export interface StockCount {
  id: string;
  siteId: SiteCode;
  zoneId: string;
  day: string;
  productId: string;
  countedBundles: number;
  systemBundles: number;
  by: string;
  at: string;
}

export interface Client {
  id: string;
  name: string;
  /** A market from master data (list `market`). */
  country: string;
  channel: 'local' | 'export';
  whatsapp: string;
  currencyPref: Currency;
  creditLimit: number;
  creditDays: number;
  contact: string;
}

export interface Order {
  id: string;
  number: string;
  siteId: SiteCode;
  clientId: string;
  status: OrderStatus;
  currency: Currency;
  fxReference: number;
  lines: OrderLine[];
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  cashConfirmedAt?: string;
  notes?: string;
}

export interface OrderLine { productId: string; bundles: number; unitPrice: number }

export interface Dispatch {
  id: string;
  orderId: string;
  siteId: SiteCode;
  deliveryNoteNo: string;
  scannedLabelIds: string[];
  expectedKg: number;
  gateKg?: number;
  variancePct?: number;
  gateStatus: GateStatus;
  overrideBy?: string;
  overrideReason?: string;
  driver: string;
  vehicle: string;
  hasLorryPhoto: boolean;
  hasDriverSignature: boolean;
  createdAt: string;
  gatePassedAt?: string;
  pod?: ProofOfDelivery;
}

export interface ProofOfDelivery {
  receiverName: string;
  bundlesCounted: number;
  bundlesExpected: number;
  deliveredAt: string;
  hasSignature: boolean;
}

export interface Invoice { id: string; orderId: string; number: string; total: number; currency: Currency; issuedAt: string }
export interface Payment { id: string; clientId: string; invoiceId?: string; amount: number; currency: Currency; method: string; reference: string; at: string }

export interface Part {
  id: string;
  siteId: SiteCode;
  name: string;
  unit: string;
  minLevel: number;
  unitCost: number;
  onHand: number;
}

export interface PartIssue {
  id: string;
  siteId: SiteCode;
  partId: string;
  machineId: string;
  mechanicId: string;
  qty: number;
  at: string;
}

export interface Breakdown {
  id: string;
  siteId: SiteCode;
  machineId: string;
  startedAt: string;
  resolvedAt?: string;
  cause: string;
  sparesCost: number;
}

export interface CollectorDelivery {
  id: string;
  siteId: 'recycling';
  collector: string;
  grossKg: number;
  tareKg: number;
  deductionPct: number;
  netKg: number;
  pricePerKg: number;
  currency: Currency;
  paid: boolean;
  day: string;
  at: string;
  hasScalePhoto: boolean;
}

export interface BusinessException {
  id: string;
  siteId: SiteCode;
  kind: ExceptionKind;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  subjectRef?: string;
  status: ExceptionStatus;
  ownerRole: Role;
  raisedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionReason?: string;
}

export interface AuditEvent {
  id: string;
  siteId?: SiteCode;
  kind: string;
  summary: string;
  actorId: string;
  actorName: string;
  deviceId: string;
  at: string;
  reason?: string;
  flag?: 'edit' | 'reopen' | 'override' | 'variance' | 'normal';
}

export interface User {
  id: string;
  name: string;
  roles: { role: Role; siteId?: SiteCode }[];
  personId?: string;
  avatarSeed: string;
}

/** The append-only event envelope. Every write in the system is one of these. */
export interface DomainEvent<T = unknown> {
  id: string;
  siteId?: SiteCode;
  type: string;
  actorId: string;
  deviceId: string;
  occurredAt: string;
  payload: T;
  correctsEventId?: string;
  reason?: string;
  synced: boolean;
}

/* ───────────── Master data: everything the business defines for itself ───────────── */
export type RefList =
  | 'unit' | 'sector' | 'expense_category' | 'expense_subcategory' | 'quick_expense'
  | 'downtime_reason' | 'breakdown_cause' | 'colour' | 'bag_size' | 'bag_colour' | 'brand'
  | 'material' | 'pellet_grade' | 'deduction_option' | 'price_option' | 'contract_term'
  | 'daily_rate' | 'denomination' | 'vehicle' | 'waste_source' | 'pellet_source'
  | 'payment_method' | 'market' | 'credit_term';

/** One user-managed option. Deactivated, never deleted, so history keeps its meaning. */
export interface RefItem {
  id: string;
  list: RefList;
  /** Undefined = applies to the whole group. */
  siteId?: SiteCode;
  label: string;
  /** Numeric payload where the option is a quantity: kg per bag, percent, days, UGX… */
  value?: number;
  /** Unit of `value`, shown beside it. */
  unit?: string;
  color?: string;
  /** e.g. the expense category a sub-category belongs to. */
  parentId?: string;
  active: boolean;
  order: number;
  /** System items can be renamed and reordered but not deactivated (the seven enforced expense categories). */
  system?: boolean;
  /** Seed value not confirmed by the client; shown with an "example" mark until someone edits it. */
  example?: boolean;
}

/** Numbers that tune a site's rules. Edited in Settings, never in code. */
export interface SiteSettings {
  gateTolerancePct: number;
  massGapPct: number;
  cashVariance: number;
  benchmarkPct: number;
  expenseApprovalLimit: number;
  archiveAfterAbsentDays: number;
  contractWarningDays: number;
  /** Hours in a standard day; overtime per hour = daily rate ÷ this. */
  standardDayHours: number;
  /** Working days a monthly salary is spread over when pro-rating. */
  monthWorkingDays: number;
  /** Downtime above this many minutes needs a reason. */
  downtimeReasonAfterMin: number;
  /** Raw material cost per kg in UGX used for unit costing until received purchases supply a landed cost. */
  materialCostPerKg: number;
}

/** A purchase of raw material, local or imported, with the extra costs that make up its landed cost. */
export interface PurchaseCost { label: string; amount: number; currency: Currency }
export interface Purchase {
  id: string;
  siteId: SiteCode;
  reference: string;
  supplier: string;
  originCountry: string;
  material: string;
  qtyKg: number;
  unitPrice: number;        // per kg, in `currency`
  currency: Currency;
  fxReference: number;
  costs: PurchaseCost[];    // freight, clearing, haulage, duties…
  status: 'ordered' | 'in_transit' | 'at_border' | 'received';
  orderedOn: string;
  receivedOn?: string;
  receivedKg?: number;
  note?: string;
  example?: boolean;
}

/** What prints on a site's documents. Blank until the client provides it; never invented. */
export interface CompanyProfile {
  address: string;
  phone: string;
  email: string;
  tin: string;
  bankDetails: string;
  mobileMoney: string;
  /** VAT rate in percent, 0 when the entity does not charge VAT. */
  vatRatePct: number;
  efrisConnected: boolean;
}
