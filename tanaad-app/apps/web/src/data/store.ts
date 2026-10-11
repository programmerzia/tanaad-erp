import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Attendance, AttendanceStatus, AuditEvent, BusinessException, CashDay, CashEntry, CollectorDelivery, Dispatch, DomainEvent,
  Client, CompanyProfile, Engagement, Label, Machine, Purchase, Order, Product, RefItem, RefList, SiteSettings, Benchmark, PartIssue, Person, ProductionEntry, ProofOfDelivery, Role, SiteCode, StockCount, StockMovement, Breakdown, Payment, Invoice,
} from '@tanaad/domain';
import { cashClose, expectedCargoKg, gateDecision, intakeNet } from '@tanaad/domain';
import { buildSeed, TODAY, FX, type SeedData } from './seed/build';
import { buildMasterData } from './seed/masterData';
import { dexieStorage } from './persist';
import { uuid7, nowIso } from './ids';
import { SITES } from '@/config/sites';

export interface Session { userId: string; role: Role; siteId?: SiteCode; deviceId: string }

export interface AppState extends SeedData {
  /** Master data: every option list the business defines for itself. Managed in Settings. */
  refs: RefItem[];
  purchases: Purchase[];
  companyProfiles: Record<SiteCode, CompanyProfile>;
  siteSettings: Record<SiteCode, SiteSettings>;
  events: DomainEvent[];
  /** Who is signed in on this device. Set at login; the session below is the workspace they have open. */
  auth: { userId: string; method: 'password' | 'pin' | 'link'; at: string } | null;
  session: Session | null;
  online: boolean;
  today: string;
  fx: number;
  seedVersion: number;
  toasts: { id: string; kind: 'ok' | 'warn' | 'error' | 'info'; title: string; detail?: string }[];
  alerts: { id: string; title: string; detail: string; at: string; siteId?: SiteCode; read: boolean }[];
}

const SEED_VERSION = 18;

type Mut = (s: AppState) => void;

export interface Actions {
  // session & demo
  /** Authenticate a person on this device (login screen). */
  logIn: (userId: string, method?: 'password' | 'pin' | 'link') => void;
  /** Open a workspace as a role (portal screen). */
  signIn: (userId: string, role: Role, siteId?: SiteCode) => void;
  /** Leave the workspace and sign the person out of the device. */
  signOut: () => void;
  setOnline: (online: boolean) => void;
  flushOutbox: () => void;
  resetDemo: () => void;
  toast: (t: Omit<AppState['toasts'][number], 'id'>) => void;
  dismissToast: (id: string) => void;
  pushAlert: (a: Omit<AppState['alerts'][number], 'id' | 'at' | 'read'>) => void;
  markAlertsRead: () => void;
  // people
  registerCasual: (p: { siteId: SiteCode; fullName: string; phoneMomo: string; sector: string; rate: number; idNumber: string }) => Person;
  markAttendance: (p: { shiftId: string; personId: string; siteId: SiteCode; status: AttendanceStatus; overtimeHours?: number }) => void;
  renewContract: (engagementId: string, termDays: number) => void;
  archivePerson: (personId: string) => void;
  reactivatePerson: (personId: string) => void;
  // cash
  addCashEntry: (e: Omit<CashEntry, 'id' | 'cashDayId' | 'fxReference' | 'at' | 'by' | 'currency'> & { currency?: 'UGX' | 'USD' }) => void;
  closeCashDay: (cashDayId: string, counted: number, denominations: Record<string, number>) => { variance: number };
  reopenCashDay: (cashDayId: string, reason: string) => void;
  // production
  recordProduction: (e: Omit<ProductionEntry, 'id' | 'at'>) => void;
  createLabel: (l: Omit<Label, 'id' | 'code' | 'status'> & { status?: Label['status'] }) => Label;
  consumeLabel: (labelId: string) => void;
  // stock
  recordStockCount: (c: Omit<StockCount, 'id' | 'at' | 'by'>) => void;
  moveStock: (m: Omit<StockMovement, 'id' | 'at' | 'by'>) => void;
  // dispatch & gate
  startDispatch: (orderId: string, driver: string, vehicle: string) => Dispatch;
  scanBundle: (dispatchId: string, labelCode: string) => { ok: boolean; message: string };
  unscanLast: (dispatchId: string) => void;
  recordGateWeight: (dispatchId: string, kg: number) => { decision: 'pass' | 'hold'; variancePct: number; reasons: string[] };
  overrideGate: (dispatchId: string, pin: string, reason: string) => boolean;
  recordPod: (dispatchId: string, pod: ProofOfDelivery) => void;
  // orders
  createOrder: (o: Omit<Order, 'id' | 'number' | 'createdAt' | 'fxReference'>) => Order;
  confirmCash: (orderId: string) => void;
  decideOrder: (orderId: string, decision: 'approved' | 'held', reason?: string) => void;
  issueInvoice: (orderId: string) => Invoice;
  recordPayment: (p: Omit<Payment, 'id' | 'at'>) => void;
  // spares & maintenance
  issuePart: (p: Omit<PartIssue, 'id' | 'at'> & { pin: string }) => { ok: boolean; message: string };
  receivePart: (partId: string, qty: number) => void;
  reportBreakdown: (b: Omit<Breakdown, 'id' | 'startedAt' | 'resolvedAt' | 'sparesCost'>) => void;
  resolveBreakdown: (breakdownId: string) => void;
  // recycling
  recordIntake: (d: Omit<CollectorDelivery, 'id' | 'at' | 'netKg' | 'siteId' | 'currency' | 'paid'>) => CollectorDelivery;
  payCollector: (deliveryId: string) => void;
  // master data (Settings)
  addRef: (r: Omit<RefItem, 'id' | 'order' | 'active'> & { active?: boolean }) => RefItem;
  updateRef: (id: string, patch: Partial<Omit<RefItem, 'id' | 'list'>>) => void;
  moveRef: (id: string, dir: -1 | 1) => void;
  updateSiteSettings: (siteId: SiteCode, patch: Partial<SiteSettings>) => void;
  saveProduct: (p: Omit<Product, 'id'> & { id?: string }) => Product;
  saveMachine: (m: Omit<Machine, 'id'> & { id?: string }) => Machine;
  setBenchmark: (b: Benchmark) => void;
  saveZone: (z: { id?: string; siteId: SiteCode; name: string }) => void;
  setFx: (rate: number) => void;
  updateCompanyProfile: (siteId: SiteCode, patch: Partial<CompanyProfile>) => void;
  saveClient: (c: Omit<Client, 'id'> & { id?: string }) => Client;
  // purchases
  savePurchase: (p: Omit<Purchase, 'id' | 'reference' | 'fxReference'> & { id?: string; reference?: string; fxReference?: number }) => Purchase;
  receivePurchase: (id: string, receivedKg: number) => void;
  // exceptions
  decideException: (id: string, decision: 'approved' | 'held' | 'resolved', reason?: string) => void;
  raiseException: (e: Omit<BusinessException, 'id' | 'raisedAt' | 'status'>) => void;
}

const nextLabelCode = (s: AppState, siteId: SiteCode, kind: Label['kind']) => `${siteId.toUpperCase().slice(0, 3)}-${kind.toUpperCase().slice(0, 3)}-${String(s.labels.length + 1).padStart(6, '0')}`;

export const useStore = create<AppState & Actions>()(
  persist(
    (set, get) => {
      const mutate = (fn: Mut) => set((s) => { const draft = { ...s } as AppState; fn(draft); return draft; });
      const actor = () => { const s = get(); const u = s.users.find((x) => x.id === s.session?.userId); return { id: s.session?.userId ?? 'anonymous', name: u?.name ?? 'Unknown', deviceId: s.session?.deviceId ?? 'browser' }; };
      /** Append an event. Offline events wait in the outbox (synced=false). */
      const emit = (type: string, siteId: SiteCode | undefined, payload: unknown, opts: { reason?: string; audit?: { summary: string; flag?: AuditEvent['flag'] } } = {}) => {
        const a = actor(); const s = get();
        const ev: DomainEvent = { id: uuid7(), siteId, type, actorId: a.id, deviceId: a.deviceId, occurredAt: nowIso(), payload, reason: opts.reason, synced: s.online };
        mutate((d) => {
          d.events = [...d.events, ev];
          if (opts.audit) d.audit = [{ id: uuid7(), siteId, kind: type, summary: opts.audit.summary, actorId: a.id, actorName: a.name, deviceId: a.deviceId, at: ev.occurredAt, reason: opts.reason, flag: opts.audit.flag ?? 'normal' }, ...d.audit];
        });
        return ev;
      };
      const seed = buildSeed(); const master = buildMasterData();
      const cfg = (siteId: SiteCode) => get().siteSettings?.[siteId] ?? master.siteSettings[siteId];
      return {
        ...seed, ...master,
        events: [], auth: null, session: null, online: true, today: TODAY, fx: FX, seedVersion: SEED_VERSION, toasts: [], alerts: [],

        logIn: (userId, method = 'password') => set({ auth: { userId, method, at: nowIso() }, session: null }),
        signIn: (userId, role, siteId) => set((st) => ({ auth: st.auth?.userId === userId ? st.auth : { userId, method: 'link', at: nowIso() }, session: { userId, role, siteId, deviceId: `${siteId ?? 'group'}-${role}-01` } })),
        signOut: () => set({ session: null, auth: null }),
        setOnline: (online) => { set({ online }); if (online) get().flushOutbox(); },
        flushOutbox: () => { mutate((d) => { d.events = d.events.map((e) => ({ ...e, synced: true })); }); },
        resetDemo: () => { const fresh = { ...buildSeed(), ...buildMasterData() }; set({ ...fresh, events: [], online: true, toasts: [], alerts: [], seedVersion: SEED_VERSION }); },
        toast: (t) => { const id = uuid7(); set((s) => ({ toasts: [...s.toasts, { id, ...t }] })); setTimeout(() => get().dismissToast(id), 3200); },
        dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
        pushAlert: (a) => set((s) => ({ alerts: [{ id: uuid7(), at: nowIso(), read: false, ...a }, ...s.alerts] })),
        markAlertsRead: () => set((s) => ({ alerts: s.alerts.map((a) => ({ ...a, read: true })) })),

        registerCasual: (p) => {
          const person: Person = { id: uuid7(), homeSiteId: p.siteId, fullName: p.fullName, idNumber: p.idNumber, phoneMomo: p.phoneMomo, sector: p.sector, shared: false, sharedSites: [], avatarSeed: p.fullName.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase(), status: 'active', joinedOn: get().today };
          const eng: Engagement = { id: uuid7(), personId: person.id, siteId: p.siteId, type: 'casual', startDate: get().today, rateBasis: 'day', rate: p.rate, currency: 'UGX', settlementCycle: 'weekly', status: 'active' };
          mutate((d) => { d.people = [person, ...d.people]; d.engagements = [eng, ...d.engagements]; });
          emit('PersonRegistered', p.siteId, { person, eng }, { audit: { summary: `${person.fullName} registered as casual (${p.sector})` } });
          return person;
        },
        markAttendance: ({ shiftId, personId, siteId, status, overtimeHours = 0 }) => {
          const a = actor(); const s = get();
          const existing = s.attendance.find((x) => x.shiftId === shiftId && x.personId === personId);
          const rec: Attendance = { id: existing?.id ?? uuid7(), shiftId, personId, workedSiteId: siteId, status, overtimeHours, markedBy: a.id, at: nowIso() };
          mutate((d) => { d.attendance = existing ? d.attendance.map((x) => (x.id === existing.id ? rec : x)) : [...d.attendance, rec]; });
          emit(existing ? 'AttendanceCorrected' : 'AttendanceMarked', siteId, rec, existing ? { audit: { summary: `Attendance changed to ${status} for ${s.people.find((p) => p.id === personId)?.fullName}`, flag: 'edit' } } : {});
        },
        renewContract: (engagementId, termDays) => {
          const s = get(); const old = s.engagements.find((e) => e.id === engagementId); if (!old) return;
          const start = s.today; const end = new Date(start + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() + termDays);
          const fresh: Engagement = { ...old, id: uuid7(), startDate: start, endDate: end.toISOString().slice(0, 10), termDays, status: 'active' };
          mutate((d) => { d.engagements = [fresh, ...d.engagements.map((e) => (e.id === engagementId ? { ...e, status: 'renewed' as const } : e))]; });
          emit('EngagementRenewed', old.siteId, fresh, { audit: { summary: `${s.people.find((p) => p.id === old.personId)?.fullName}: ${termDays}-day contract renewed` } });
        },
        archivePerson: (personId) => { mutate((d) => { d.people = d.people.map((p) => (p.id === personId ? { ...p, status: 'archived' } : p)); }); emit('PersonArchived', get().people.find((p) => p.id === personId)?.homeSiteId, { personId }); },
        reactivatePerson: (personId) => { mutate((d) => { d.people = d.people.map((p) => (p.id === personId ? { ...p, status: 'active' } : p)); }); emit('PersonReactivated', get().people.find((p) => p.id === personId)?.homeSiteId, { personId }); },

        addCashEntry: (e) => {
          const s = get(); const a = actor();
          const cd = s.cashDays.find((c) => c.siteId === e.siteId && c.day === e.day) ?? (() => { const prev = s.cashDays.filter((c) => c.siteId === e.siteId && c.day < e.day).sort((x, y) => (x.day < y.day ? 1 : -1))[0]; const n: CashDay = { id: `cd_${e.siteId}_${e.day}`, siteId: e.siteId, day: e.day, currency: 'UGX', opening: prev?.countedClosing ?? 0, status: 'open' }; mutate((d) => { d.cashDays = [...d.cashDays, n]; }); return n; })();
          const entry: CashEntry = { id: uuid7(), cashDayId: cd.id, fxReference: s.fx, at: nowIso(), by: a.id, currency: e.currency ?? 'UGX', ...e };
          mutate((d) => { d.cashEntries = [...d.cashEntries, entry]; });
          emit('CashEntryRecorded', e.siteId, entry);
        },
        closeCashDay: (cashDayId, counted, denominations) => {
          const s = get(); const cd = s.cashDays.find((c) => c.id === cashDayId)!; const a = actor();
          const entries = s.cashEntries.filter((e) => e.cashDayId === cashDayId);
          const sum = (f: (e: CashEntry) => boolean) => entries.filter(f).reduce((t, e) => t + e.amount, 0);
          const r = cashClose({ opening: cd.opening, sales: sum((e) => e.category === 'sale'), receipts: sum((e) => e.direction === 'in' && e.category !== 'sale'), expenses: sum((e) => e.direction === 'out' && e.category !== 'wages' && e.category !== 'payout'), wages: sum((e) => e.category === 'wages' || e.category === 'payout'), counted });
          mutate((d) => { d.cashDays = d.cashDays.map((c) => (c.id === cashDayId ? { ...c, status: 'closed', countedClosing: counted, signedBy: a.id, closedAt: nowIso(), denominations } : c)); });
          emit('CashDayClosed', cd.siteId, { cashDayId, counted, variance: r.variance }, { audit: { summary: `Cash day ${cd.day} closed and signed, variance ${r.variance.toLocaleString()}`, flag: r.variance !== 0 ? 'variance' : 'normal' } });
          if (Math.abs(r.variance) > cfg(cd.siteId).cashVariance) get().raiseException({ siteId: cd.siteId, kind: 'cash_variance', severity: 'warning', title: `Cash close ${r.variance < 0 ? 'short' : 'over'} by UGX ${Math.abs(r.variance).toLocaleString()}`, detail: `Counted closing on ${cd.day} differs from expected.`, subjectRef: cashDayId, ownerRole: 'site_manager' });
          return { variance: r.variance };
        },
        reopenCashDay: (cashDayId, reason) => { const cd = get().cashDays.find((c) => c.id === cashDayId)!; mutate((d) => { d.cashDays = d.cashDays.map((c) => (c.id === cashDayId ? { ...c, status: 'reopened' } : c)); }); emit('CashDayReopened', cd.siteId, { cashDayId }, { reason, audit: { summary: `Cash day ${cd.day} reopened`, flag: 'reopen' } }); },

        recordProduction: (e) => {
          const s = get(); const entry: ProductionEntry = { id: uuid7(), at: nowIso(), ...e };
          const existing = s.production.find((p) => p.shiftId === e.shiftId && p.machineId === e.machineId && p.stageCode === e.stageCode);
          mutate((d) => { d.production = existing ? d.production.map((p) => (p.id === existing.id ? { ...entry, id: existing.id } : p)) : [...d.production, entry]; d.exceptions = d.exceptions.map((x) => (x.subjectRef === e.machineId && (x.kind === 'not_logged' || (x.kind === 'below_benchmark' && e.downtimeReason)) && x.status === 'open' ? { ...x, status: 'resolved', decidedAt: nowIso(), decisionReason: 'Entry recorded' } : x)); });
          emit('ProductionEntryRecorded', e.siteId, entry);
        },
        createLabel: (l) => { const s = get(); const label: Label = { id: uuid7(), code: nextLabelCode(s, l.siteId, l.kind), status: l.status ?? 'in_stock', ...l }; mutate((d) => { d.labels = [...d.labels, label]; }); emit('LabelCreated', l.siteId, label); return label; },
        consumeLabel: (labelId) => { mutate((d) => { d.labels = d.labels.map((l) => (l.id === labelId ? { ...l, status: 'consumed' } : l)); }); emit('LabelConsumed', get().labels.find((l) => l.id === labelId)?.siteId, { labelId }); },

        recordStockCount: (c) => { const a = actor(); const rec: StockCount = { id: uuid7(), at: nowIso(), by: a.id, ...c }; mutate((d) => { d.stockCounts = [...d.stockCounts, rec]; }); const v = c.countedBundles - c.systemBundles; emit('StockCounted', c.siteId, rec, { audit: { summary: `Stock count ${get().zones.find((z) => z.id === c.zoneId)?.name}: ${get().products.find((p) => p.id === c.productId)?.internalName} ${v === 0 ? 'matches' : `${v > 0 ? '+' : ''}${v} bundles vs system`}`, flag: v === 0 ? 'normal' : 'variance' } }); },
        moveStock: (m) => { const a = actor(); const rec: StockMovement = { id: uuid7(), at: nowIso(), by: a.id, ...m }; mutate((d) => { if (m.labelId) d.labels = d.labels.map((l) => (l.id === m.labelId ? { ...l, zoneId: m.toZoneId ?? l.zoneId, status: m.kind === 'scrap' ? 'scrapped' : l.status } : l)); }); emit('StockMoved', m.siteId, rec, m.kind === 'adjust' ? { reason: m.reason, audit: { summary: `Stock adjusted: ${m.qtyUnits} units (${m.reason})`, flag: 'edit' } } : {}); },

        startDispatch: (orderId, driver, vehicle) => {
          const s = get(); const o = s.orders.find((x) => x.id === orderId)!;
          const existing = s.dispatches.find((d) => d.orderId === orderId && d.gateStatus !== 'pass' && d.gateStatus !== 'overridden'); if (existing) return existing;
          const expected = expectedCargoKg(o.lines.map((l) => ({ bundles: l.bundles, stdBundleWeightKg: s.products.find((p) => p.id === l.productId)!.stdBundleWeightKg })));
          const site = SITES[o.siteId]; const prevNos = s.dispatches.filter((d) => d.siteId === o.siteId).map((d) => parseInt(d.deliveryNoteNo.replace(/\D/g, ''), 10)).filter((n) => !isNaN(n)); const next = Math.max(site.deliveryNoteSeriesStart - 1, ...prevNos) + 1;
          const dsp: Dispatch = { id: uuid7(), orderId, siteId: o.siteId, deliveryNoteNo: o.siteId === 'bags' ? `DN-${next}` : `DN-${String(next).padStart(5, '0')}`, scannedLabelIds: [], expectedKg: expected, gateStatus: 'pending', driver, vehicle, hasLorryPhoto: false, hasDriverSignature: false, createdAt: nowIso() };
          mutate((d) => { d.dispatches = [...d.dispatches, dsp]; d.orders = d.orders.map((x) => (x.id === orderId ? { ...x, status: 'picking' } : x)); });
          emit('PickListCreated', o.siteId, dsp);
          return dsp;
        },
        scanBundle: (dispatchId, labelCode) => {
          const s = get(); const dsp = s.dispatches.find((d) => d.id === dispatchId)!; const o = s.orders.find((x) => x.id === dsp.orderId)!;
          const label = s.labels.find((l) => l.code === labelCode);
          if (!label) return { ok: false, message: `Unknown label ${labelCode}` };
          if (dsp.scannedLabelIds.includes(label.id)) return { ok: false, message: `Already scanned: ${label.code}` };
          if (label.status !== 'in_stock') return { ok: false, message: `${label.code} is ${label.status}, not in stock` };
          const line = o.lines.find((l) => l.productId === label.productId);
          if (!line) return { ok: false, message: `${s.products.find((p) => p.id === label.productId)?.internalName} is not on this order` };
          const already = dsp.scannedLabelIds.filter((id) => s.labels.find((l) => l.id === id)?.productId === label.productId).length;
          if (already >= line.bundles) return { ok: false, message: `Order has only ${line.bundles} bundles of ${s.products.find((p) => p.id === label.productId)?.internalName}` };
          mutate((d) => { d.dispatches = d.dispatches.map((x) => (x.id === dispatchId ? { ...x, scannedLabelIds: [...x.scannedLabelIds, label.id] } : x)); });
          emit('BundleScannedForDispatch', dsp.siteId, { dispatchId, labelId: label.id });
          return { ok: true, message: `${label.code} · ${s.products.find((p) => p.id === label.productId)?.internalName}` };
        },
        unscanLast: (dispatchId) => { mutate((d) => { d.dispatches = d.dispatches.map((x) => (x.id === dispatchId ? { ...x, scannedLabelIds: x.scannedLabelIds.slice(0, -1) } : x)); }); },
        recordGateWeight: (dispatchId, kg) => {
          const s = get(); const dsp = s.dispatches.find((d) => d.id === dispatchId)!; const o = s.orders.find((x) => x.id === dsp.orderId)!; const site = SITES[dsp.siteId];
          const ordered = o.lines.reduce((t, l) => t + l.bundles, 0);
          const r = gateDecision({ expectedKg: dsp.expectedKg, actualKg: kg, tolerancePct: cfg(dsp.siteId).gateTolerancePct, scannedBundles: dsp.scannedLabelIds.length, orderedBundles: ordered });
          mutate((d) => {
            d.dispatches = d.dispatches.map((x) => (x.id === dispatchId ? { ...x, gateKg: kg, variancePct: r.variancePct, gateStatus: r.decision, gatePassedAt: r.decision === 'pass' ? nowIso() : undefined, hasLorryPhoto: true, hasDriverSignature: r.decision === 'pass' } : x));
            if (r.decision === 'pass') { d.labels = d.labels.map((l) => (dsp.scannedLabelIds.includes(l.id) ? { ...l, status: 'dispatched' } : l)); d.orders = d.orders.map((x) => (x.id === o.id ? { ...x, status: 'dispatched' } : x)); }
          });
          emit('GateWeightRecorded', dsp.siteId, { dispatchId, kg, ...r });
          if (r.decision === 'pass') emit('GatePassIssued', dsp.siteId, { dispatchId }, { audit: { summary: `Gate pass ${dsp.deliveryNoteNo} issued: ${kg.toLocaleString()} kg vs ${dsp.expectedKg.toLocaleString()} kg expected (${r.variancePct > 0 ? '+' : ''}${r.variancePct}%)` } });
          else {
            emit('GateHeld', dsp.siteId, { dispatchId, reasons: r.reasons }, { audit: { summary: `Gate HELD for ${dsp.deliveryNoteNo}: ${r.reasons.join('; ')}`, flag: 'variance' } });
            get().raiseException({ siteId: dsp.siteId, kind: 'gate_variance', severity: 'critical', title: `Gate held: ${dsp.deliveryNoteNo} to ${s.clients.find((c) => c.id === o.clientId)?.name}`, detail: r.reasons.join('. ') + `. Expected ${dsp.expectedKg.toLocaleString()} kg, scale read ${kg.toLocaleString()} kg.`, subjectRef: dispatchId, ownerRole: 'ceo' });
            get().pushAlert({ title: `Gate locked at ${site.shortName}`, detail: `${dsp.deliveryNoteNo}: ${r.reasons[0]}`, siteId: dsp.siteId });
          }
          return r;
        },
        overrideGate: (dispatchId, pin, reason) => {
          if (pin !== '2468') return false;
          const s = get(); const dsp = s.dispatches.find((d) => d.id === dispatchId)!; const a = actor();
          mutate((d) => { d.dispatches = d.dispatches.map((x) => (x.id === dispatchId ? { ...x, gateStatus: 'overridden', overrideBy: a.id, overrideReason: reason, gatePassedAt: nowIso() } : x)); d.labels = d.labels.map((l) => (dsp.scannedLabelIds.includes(l.id) ? { ...l, status: 'dispatched' } : l)); d.orders = d.orders.map((x) => (x.id === dsp.orderId ? { ...x, status: 'dispatched' } : x)); d.exceptions = d.exceptions.map((x) => (x.subjectRef === dispatchId ? { ...x, status: 'approved', decidedBy: a.id, decidedAt: nowIso(), decisionReason: reason } : x)); });
          emit('GateOverridden', dsp.siteId, { dispatchId }, { reason, audit: { summary: `Gate override for ${dsp.deliveryNoteNo} by ${a.name}`, flag: 'override' } });
          return true;
        },
        recordPod: (dispatchId, pod) => { const dsp = get().dispatches.find((d) => d.id === dispatchId)!; mutate((d) => { d.dispatches = d.dispatches.map((x) => (x.id === dispatchId ? { ...x, pod } : x)); d.orders = d.orders.map((x) => (x.id === dsp.orderId ? { ...x, status: 'delivered' } : x)); }); emit('DeliveryConfirmed', dsp.siteId, { dispatchId, pod }); if (pod.bundlesCounted !== pod.bundlesExpected) get().raiseException({ siteId: dsp.siteId, kind: 'pod_discrepancy', severity: 'critical', title: `Delivery ${dsp.deliveryNoteNo}: receiver counted ${pod.bundlesCounted} of ${pod.bundlesExpected}`, detail: `Receiver ${pod.receiverName}.`, subjectRef: dispatchId, ownerRole: 'ceo' }); },

        createOrder: (o) => { const s = get(); const n = 2300 + s.orders.length + 1; const order: Order = { id: uuid7(), number: `SO-${n}`, createdAt: nowIso(), fxReference: s.fx, ...o }; mutate((d) => { d.orders = [order, ...d.orders]; }); emit('OrderCreated', o.siteId, order); return order; },
        confirmCash: (orderId) => { const o = get().orders.find((x) => x.id === orderId)!; mutate((d) => { d.orders = d.orders.map((x) => (x.id === orderId ? { ...x, status: 'approved', cashConfirmedAt: nowIso() } : x)); }); emit('OrderCashConfirmed', o.siteId, { orderId }); },
        decideOrder: (orderId, decision, reason) => { const s = get(); const o = s.orders.find((x) => x.id === orderId)!; const a = actor(); mutate((d) => { d.orders = d.orders.map((x) => (x.id === orderId ? { ...x, status: decision, approvedBy: decision === 'approved' ? a.id : undefined, approvedAt: nowIso(), notes: reason ?? x.notes } : x)); d.exceptions = d.exceptions.map((x) => (x.kind === 'credit_over_limit' && x.detail.includes(o.number) ? { ...x, status: decision === 'approved' ? 'approved' : 'held', decidedBy: a.id, decidedAt: nowIso(), decisionReason: reason } : x)); }); emit(decision === 'approved' ? 'OrderApproved' : 'OrderHeld', o.siteId, { orderId }, { reason, audit: { summary: `Export order ${o.number} for ${s.clients.find((c) => c.id === o.clientId)?.name} ${decision}` } }); },
        issueInvoice: (orderId) => { const s = get(); const o = s.orders.find((x) => x.id === orderId)!; const existing = s.invoices.find((i) => i.orderId === orderId); if (existing) return existing; const inv: Invoice = { id: uuid7(), orderId, number: `INV-${o.number.slice(3)}`, total: o.lines.reduce((t, l) => t + l.bundles * l.unitPrice, 0), currency: o.currency, issuedAt: nowIso() }; mutate((d) => { d.invoices = [...d.invoices, inv]; d.orders = d.orders.map((x) => (x.id === orderId && (x.status === 'delivered' || x.status === 'dispatched') ? { ...x, status: 'invoiced' } : x)); }); emit('InvoiceIssued', o.siteId, inv); return inv; },
        recordPayment: (p) => { const pay: Payment = { id: uuid7(), at: nowIso(), ...p }; mutate((d) => { d.payments = [...d.payments, pay]; if (p.invoiceId) { const inv = d.invoices.find((i) => i.id === p.invoiceId); if (inv) d.orders = d.orders.map((x) => (x.id === inv.orderId ? { ...x, status: 'paid' } : x)); } }); emit('PaymentRecorded', undefined, pay, { audit: { summary: `Payment ${p.currency} ${p.amount.toLocaleString()} from ${get().clients.find((c) => c.id === p.clientId)?.name} (${p.method} ${p.reference})` } }); },

        issuePart: ({ pin, ...p }) => {
          if (pin !== '1357') return { ok: false, message: 'Wrong PIN' };
          const s = get(); const part = s.parts.find((x) => x.id === p.partId)!; if (part.onHand < p.qty) return { ok: false, message: `Only ${part.onHand} ${part.unit} on hand` };
          const rec: PartIssue = { id: uuid7(), at: nowIso(), ...p };
          mutate((d) => { d.partIssues = [rec, ...d.partIssues]; d.parts = d.parts.map((x) => (x.id === p.partId ? { ...x, onHand: x.onHand - p.qty } : x)); });
          emit('PartIssued', p.siteId, rec, { audit: { summary: `${part.name} ×${p.qty} issued to ${s.machines.find((m) => m.id === p.machineId)?.code} by ${s.people.find((x) => x.id === p.mechanicId)?.fullName}` } });
          const after = part.onHand - p.qty; if (after < part.minLevel) get().raiseException({ siteId: p.siteId, kind: 'low_stock', severity: 'warning', title: `${part.name} below minimum (${after} of ${part.minLevel})`, detail: 'Reorder before stock reaches zero.', subjectRef: part.id, ownerRole: 'storekeeper' });
          return { ok: true, message: `${part.name} ×${p.qty} issued` };
        },
        receivePart: (partId, qty) => { mutate((d) => { d.parts = d.parts.map((x) => (x.id === partId ? { ...x, onHand: x.onHand + qty } : x)); }); emit('PartReceived', get().parts.find((p) => p.id === partId)?.siteId, { partId, qty }); },
        reportBreakdown: (b) => { const rec: Breakdown = { id: uuid7(), startedAt: nowIso(), sparesCost: 0, ...b }; mutate((d) => { d.breakdowns = [rec, ...d.breakdowns]; d.machines = d.machines.map((m) => (m.id === b.machineId ? { ...m, status: 'down' } : m)); }); emit('BreakdownReported', b.siteId, rec, { audit: { summary: `${get().machines.find((m) => m.id === b.machineId)?.code} reported down: ${b.cause}` } }); },
        resolveBreakdown: (breakdownId) => { const b = get().breakdowns.find((x) => x.id === breakdownId)!; mutate((d) => { d.breakdowns = d.breakdowns.map((x) => (x.id === breakdownId ? { ...x, resolvedAt: nowIso() } : x)); d.machines = d.machines.map((m) => (m.id === b.machineId ? { ...m, status: 'active' } : m)); }); emit('BreakdownResolved', b.siteId, { breakdownId }); },

        recordIntake: (d0) => { const r = intakeNet({ grossKg: d0.grossKg, tareKg: d0.tareKg, deductionPct: d0.deductionPct, pricePerKg: d0.pricePerKg }); const rec: CollectorDelivery = { id: uuid7(), siteId: 'recycling', at: nowIso(), currency: 'UGX', paid: false, netKg: r.netKg, ...d0 }; mutate((d) => { d.collectorDeliveries = [rec, ...d.collectorDeliveries]; }); emit('CollectorDeliveryWeighed', 'recycling', rec, { audit: { summary: `${d0.collector}: ${d0.grossKg} kg gross → ${r.netKg} kg net (−${d0.deductionPct}%)` } }); return rec; },
        payCollector: (deliveryId) => { const s = get(); const dl = s.collectorDeliveries.find((x) => x.id === deliveryId)!; mutate((d) => { d.collectorDeliveries = d.collectorDeliveries.map((x) => (x.id === deliveryId ? { ...x, paid: true } : x)); }); get().addCashEntry({ siteId: 'recycling', day: s.today, direction: 'out', category: 'materials', amount: Math.round(dl.netKg * dl.pricePerKg), payee: dl.collector, note: `Scrap ${dl.netKg} kg @ ${dl.pricePerKg}`, hasReceiptPhoto: true }); emit('CollectorPaid', 'recycling', { deliveryId }); },

        addRef: (r) => { const s0 = get(); const item: RefItem = { id: uuid7(), active: true, order: s0.refs.filter((x) => x.list === r.list && x.siteId === r.siteId).length, ...r }; mutate((d) => { d.refs = [...d.refs, item]; }); emit('ConfigChanged', r.siteId, { added: item }, { audit: { summary: `Master data: added "${item.label}" to ${r.list.replace(/_/g, ' ')}`, flag: 'edit' } }); return item; },
        updateRef: (id, patch) => { const before = get().refs.find((x) => x.id === id); if (!before) return; if (before.system && patch.active === false) return; mutate((d) => { d.refs = d.refs.map((x) => (x.id === id ? { ...x, ...patch, example: patch.example ?? false } : x)); }); emit('ConfigChanged', before.siteId, { id, patch }, { audit: { summary: `Master data: "${before.label}" ${patch.active === false ? 'deactivated' : patch.active === true && !before.active ? 'reactivated' : 'changed'}`, flag: 'edit' } }); },
        moveRef: (id, dir) => { const s0 = get(); const it = s0.refs.find((x) => x.id === id); if (!it) return; const sibs = s0.refs.filter((x) => x.list === it.list && x.siteId === it.siteId && x.parentId === it.parentId).sort((a, b) => a.order - b.order); const i = sibs.findIndex((x) => x.id === id); const j = i + dir; if (j < 0 || j >= sibs.length) return; const a = sibs[i], b = sibs[j]; mutate((d) => { d.refs = d.refs.map((x) => (x.id === a.id ? { ...x, order: b.order } : x.id === b.id ? { ...x, order: a.order } : x)); }); },
        updateSiteSettings: (siteId, patch) => { mutate((d) => { d.siteSettings = { ...d.siteSettings, [siteId]: { ...d.siteSettings[siteId], ...patch } }; }); emit('ConfigChanged', siteId, { settings: patch }, { audit: { summary: `Rules changed: ${Object.entries(patch).map(([k, v]) => `${k} = ${v}`).join(', ')}`, flag: 'edit' } }); },
        saveProduct: (p) => { const prod: Product = { ...p, id: p.id ?? uuid7() } as Product; mutate((d) => { d.products = p.id ? d.products.map((x) => (x.id === p.id ? prod : x)) : [...d.products, prod]; }); emit('ConfigChanged', p.siteId, { product: prod }, { audit: { summary: `Product ${p.id ? 'changed' : 'added'}: ${prod.internalName}`, flag: 'edit' } }); return prod; },
        saveMachine: (m) => { const mac: Machine = { ...m, id: m.id ?? uuid7() } as Machine; mutate((d) => { d.machines = m.id ? d.machines.map((x) => (x.id === m.id ? mac : x)) : [...d.machines, mac]; }); emit('ConfigChanged', m.siteId, { machine: mac }, { audit: { summary: `Machine ${m.id ? 'changed' : 'added'}: ${mac.code}`, flag: 'edit' } }); return mac; },
        setBenchmark: (b) => { mutate((d) => { const has = d.benchmarks.some((x) => x.machineId === b.machineId && x.productId === b.productId); d.benchmarks = has ? d.benchmarks.map((x) => (x.machineId === b.machineId && x.productId === b.productId ? b : x)) : [...d.benchmarks, b]; }); emit('ConfigChanged', undefined, { benchmark: b }); },
        saveZone: (z) => { mutate((d) => { d.zones = z.id ? d.zones.map((x) => (x.id === z.id ? { ...x, name: z.name } : x)) : [...d.zones, { id: uuid7(), siteId: z.siteId, name: z.name }]; }); emit('ConfigChanged', z.siteId, { zone: z }, { audit: { summary: `Store zone ${z.id ? 'renamed' : 'added'}: ${z.name}`, flag: 'edit' } }); },
        setFx: (rate) => { set({ fx: rate }); emit('ConfigChanged', undefined, { fx: rate }, { audit: { summary: `Exchange reference set to UGX ${rate.toLocaleString()} per USD`, flag: 'edit' } }); },

        updateCompanyProfile: (siteId, patch) => { mutate((d) => { d.companyProfiles = { ...d.companyProfiles, [siteId]: { ...d.companyProfiles[siteId], ...patch } }; }); emit('ConfigChanged', siteId, { company: Object.keys(patch) }, { audit: { summary: `Company details changed: ${Object.keys(patch).join(', ')}`, flag: 'edit' } }); },
        saveClient: (c) => { const rec: Client = { ...c, id: c.id ?? uuid7() } as Client; mutate((d) => { d.clients = c.id ? d.clients.map((x) => (x.id === c.id ? rec : x)) : [...d.clients, rec]; }); emit(c.id ? 'ClientChanged' : 'ClientRegistered', undefined, rec, { audit: { summary: `Client ${c.id ? 'changed' : 'registered'}: ${rec.name}` } }); return rec; },
        savePurchase: (p) => { const s0 = get(); const existing = p.id ? s0.purchases.find((x) => x.id === p.id) : undefined; const rec: Purchase = { ...existing, ...p, id: p.id ?? uuid7(), reference: p.reference ?? existing?.reference ?? `PO-${String(s0.purchases.length + 1).padStart(4, '0')}`, fxReference: p.fxReference ?? existing?.fxReference ?? s0.fx, example: false } as Purchase; mutate((d) => { d.purchases = existing ? d.purchases.map((x) => (x.id === rec.id ? rec : x)) : [rec, ...d.purchases]; }); emit('PurchaseSaved', p.siteId, rec, { audit: { summary: `Purchase ${rec.reference} ${existing ? 'changed' : 'recorded'}: ${rec.material} from ${rec.supplier}` } }); return rec; },
        receivePurchase: (id, receivedKg) => { const s0 = get(); const p = s0.purchases.find((x) => x.id === id); if (!p) return; mutate((d) => { d.purchases = d.purchases.map((x) => (x.id === id ? { ...x, status: 'received', receivedOn: s0.today, receivedKg } : x)); }); emit('PurchaseReceived', p.siteId, { id, receivedKg }, { audit: { summary: `Purchase ${p.reference} received: ${receivedKg.toLocaleString()} kg of ${p.qtyKg.toLocaleString()} kg ordered`, flag: receivedKg < p.qtyKg * 0.995 ? 'variance' : 'normal' } }); },

        decideException: (eid, decision, reason) => { const a = actor(); const ex = get().exceptions.find((x) => x.id === eid)!; mutate((d) => { d.exceptions = d.exceptions.map((x) => (x.id === eid ? { ...x, status: decision, decidedBy: a.id, decidedAt: nowIso(), decisionReason: reason } : x)); }); emit('ExceptionDecided', ex.siteId, { id: eid, decision }, { reason, audit: { summary: `Exception "${ex.title}" ${decision}${reason ? `: ${reason}` : ''}` } }); },
        raiseException: (e) => { const ex: BusinessException = { id: uuid7(), raisedAt: nowIso(), status: 'open', ...e }; mutate((d) => { d.exceptions = [ex, ...d.exceptions]; }); emit('ExceptionRaised', e.siteId, ex); },
      };
    },
    {
      name: 'tanaad-demo-state',
      version: SEED_VERSION,
      storage: createJSONStorage(() => dexieStorage),
      partialize: (s) => { const { toasts, ...rest } = s as AppState & Actions; void toasts; return rest as unknown as AppState & Actions; },
      migrate: (persisted, version) => (version === SEED_VERSION ? persisted : undefined) as AppState & Actions,
      merge: (persisted, current) => { const p = persisted as Partial<AppState> | undefined; if (!p || p.seedVersion !== SEED_VERSION) return current; return { ...current, ...p, toasts: [] }; },
    },
  ),
);

export const pendingCount = (s: AppState) => s.events.filter((e) => !e.synced).length;
