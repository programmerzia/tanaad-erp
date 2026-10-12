import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  KeyRound,
  Lock,
  RotateCcw,
  Scale,
  ScanLine,
  Send,
  ShieldAlert,
  ShieldCheck,
  Truck,
  Undo2,
  Zap,
} from 'lucide-react';
import { gateDecision } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useGo, useRefList, useSite, useSiteSettings } from '@/app/hooks';
import { fmtKg, fmtNum, fmtPct, fmtTime } from '@/data/format';
import { Input, PinPad, Sheet, cn } from '@/components/ui';
import { ScaleWidget } from '@/components/ScaleWidget';
import { WhatsAppPreview } from '@/components/WhatsAppPreview';
import { messaging } from '@/devices';
import {
  ChoiceButton,
  PaperSheet,
  SavedBanner,
  StatusNotice,
  StepWizard,
  useSavedBanner,
} from '@/components/simple';
import { en } from '@/i18n/en';
import { manifestLines } from './CargoBuilder';
import {
  DeliveryNoteCard,
  StockStyles,
  gatePassNo,
  nextDeliveryNoteNo,
  useBeep,
} from './shared';

/**
 * Flow 6 · Load a lorry and weigh it (Centrepiece):
 * "scan each bundle, see the count grow, weigh at the gate. If the weight is short,
 *  the lorry is held and the screen says exactly why."
 */
export function Dispatch() {
  const s = useStore();
  const site = useSite();
  const role = s.session?.role;
  const go = useGo();
  const beep = useBeep();
  const settings = useSiteSettings();
  const vehicles = useRefList('vehicle');
  const { saved, showSaved, clearSaved } = useSavedBanner();

  const tol = settings?.gateTolerancePct ?? site.thresholds.gateTolerancePct;
  const nextNo = nextDeliveryNoteNo(s, site.id, site.deliveryNoteSeriesStart);

  // Orders that are ready to load or currently picking
  const readyOrders = useMemo(
    () =>
      s.orders
        .filter(
          (o) =>
            o.siteId === site.id &&
            (o.status === 'approved' || o.status === 'picking'),
        )
        .sort((a, b) =>
          a.status === 'picking' && b.status !== 'picking'
            ? -1
            : b.createdAt.localeCompare(a.createdAt),
        ),
    [s.orders, site.id],
  );

  // Orders locked (awaiting cash or awaiting CEO credit approval)
  const lockedOrders = useMemo(
    () =>
      s.orders.filter(
        (o) =>
          o.siteId === site.id &&
          (o.status === 'awaiting_cash' || o.status === 'awaiting_approval'),
      ),
    [s.orders, site.id],
  );

  const openDispatchFor = (oid: string) =>
    s.dispatches.find(
      (d) =>
        d.orderId === oid &&
        (d.gateStatus === 'pending' || d.gateStatus === 'hold'),
    );

  const [orderId, setOrderId] = useState<string | null>(
    readyOrders[0]?.id ?? null,
  );
  const [dispatchId, setDispatchId] = useState<string | null>(() => {
    const first = readyOrders[0];
    return first ? (openDispatchFor(first.id)?.id ?? null) : null;
  });

  useEffect(() => {
    if (!orderId && readyOrders[0]) {
      setOrderId(readyOrders[0].id);
      setDispatchId(openDispatchFor(readyOrders[0].id)?.id ?? null);
    }
  }, [readyOrders, orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const order = s.orders.find((o) => o.id === orderId);
  const dispatch = s.dispatches.find((d) => d.id === dispatchId);
  const client = s.clients.find((c) => c.id === order?.clientId);

  // Step 1 inputs when starting a new dispatch
  const history = s.dispatches.filter((d) => d.siteId === site.id);
  const pastDrivers = useMemo(
    () => [...new Set(history.map((d) => d.driver).filter(Boolean))].slice(0, 6),
    [history],
  );
  const [driver, setDriver] = useState<string>(pastDrivers[0] ?? 'Musa K.');
  const [vehicle, setVehicle] = useState<string | null>(
    vehicles[0]?.label ?? null,
  );

  // Wizard step:
  // 1 = Pick order & lorry
  // 2 = Scan each bundle onto the lorry
  // 3 = Weigh the lorry at the gate
  const [step, setStep] = useState<1 | 2 | 3>(() => {
    if (role === 'gate' && dispatch) return 3;
    if (dispatch) return 2;
    return 1;
  });

  // Simulated short weight toggle for demo
  const [simulateShort, setSimulateShort] = useState(false);
  const [scaleRun, setScaleRun] = useState(0);

  // Site Manager Override state
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  // WhatsApp share state
  const [waOpen, setWaOpen] = useState(false);
  const [waSent, setWaSent] = useState(false);

  const lines = order ? manifestLines(s, order, dispatch) : [];
  const orderedBundles = lines.reduce((sum, l) => sum + l.ordered, 0);
  const scannedBundles = dispatch?.scannedLabelIds.length ?? 0;
  const expectedKg =
    dispatch?.expectedKg ??
    lines.reduce((sum, l) => sum + l.expectedKg, 0);

  const labelById = useMemo(
    () => new Map(s.labels.map((l) => [l.id, l])),
    [s.labels],
  );
  const scannedLabels = (dispatch?.scannedLabelIds ?? [])
    .map((id) => labelById.get(id))
    .filter((l): l is NonNullable<typeof l> => Boolean(l));
  const scannedKg = scannedLabels.reduce((sum, l) => sum + l.qtyKg, 0);
  const lightestBundleKg = Math.min(
    ...(lines.length ? lines.map((l) => l.std) : [30]),
  );

  const hasUnconfirmedWeights = lines.some(
    (l) => l.product.weightStatus === 'to_be_measured',
  );

  // Simulated lorry weight on the gate scale:
  // If simulateShort is true, 10 bundles (200 mats) are missing from the lorry!
  const targetScaleKg = useMemo(() => {
    const base = scannedKg > 0 ? scannedKg : expectedKg;
    if (simulateShort) {
      return Math.max(50, Math.round(base - 10 * lightestBundleKg));
    }
    return Math.round(base);
  }, [scannedKg, expectedKg, simulateShort, lightestBundleKg]);

  const selectOrder = (oid: string) => {
    setOrderId(oid);
    const existing = openDispatchFor(oid);
    setDispatchId(existing?.id ?? null);
  };

  // Start loading or move from Step 1 to Step 2
  const handleStep1Next = () => {
    if (!order) return;
    if (dispatch) {
      setStep(role === 'gate' ? 3 : 2);
      return;
    }
    if (!driver.trim() || !vehicle) return;
    const created = s.startDispatch(order.id, driver.trim(), vehicle);
    setDispatchId(created.id);
    showSaved(`Delivery note ${created.deliveryNoteNo} opened`, {
      detail: `Lorry ${vehicle} (${driver.trim()}) is ready for scanning.`,
    });
    setStep(2);
  };

  // Find next available in-stock bundle sticker for this order
  const findNextBundleCode = (productId?: string): string | undefined => {
    if (!dispatch || !order) return undefined;
    const st = useStore.getState();
    const curDispatch = st.dispatches.find((d) => d.id === dispatch.id);
    if (!curDispatch) return undefined;
    const taken = new Set(curDispatch.scannedLabelIds);

    for (const line of order.lines) {
      if (productId && line.productId !== productId) continue;
      const haveCount = curDispatch.scannedLabelIds.filter(
        (id) => st.labels.find((x) => x.id === id)?.productId === line.productId,
      ).length;
      if (haveCount >= line.bundles) continue;
      const candidate = st.labels.find(
        (x) =>
          x.siteId === site.id &&
          x.productId === line.productId &&
          x.status === 'in_stock' &&
          !taken.has(x.id),
      );
      if (candidate) return candidate.code;

      // If seed store has fewer pre-printed labels than a large export order, mint one in stock
      const prod = st.products.find((p) => p.id === line.productId);
      if (prod) {
        const created = s.createLabel({
          siteId: site.id,
          kind: 'bundle',
          stageCode: 'finish',
          productId: prod.id,
          day: st.today,
          qtyUnits: prod.bundlePieces,
          qtyKg: prod.stdBundleWeightKg || 25,
          colour: prod.colour,
          status: 'in_stock',
          parentIds: [],
        });
        return created.code;
      }
    }
    return undefined;
  };

  const handleScanOne = (productId?: string) => {
    if (!dispatch) return;
    const code = findNextBundleCode(productId);
    if (!code) {
      beep('bad');
      return;
    }
    const res = s.scanBundle(dispatch.id, code);
    if (res.ok) {
      beep('ok');
      const newCount =
        (useStore.getState().dispatches.find((d) => d.id === dispatch.id)
          ?.scannedLabelIds.length ?? scannedBundles + 1);
      showSaved(`Scanned bundle ${code} (${newCount} of ${orderedBundles})`, {
        detail: res.message,
        onUndo: () => {
          s.unscanLast(dispatch.id);
        },
      });
    } else {
      beep('bad');
    }
  };

  const handleScanAllRemaining = () => {
    if (!dispatch) return;
    let added = 0;
    while (added < 500) {
      const code = findNextBundleCode();
      if (!code) break;
      const r = s.scanBundle(dispatch.id, code);
      if (!r.ok) break;
      added++;
    }
    if (added > 0) {
      beep('ok');
      showSaved(`Scanned ${added} bundles onto the lorry`, {
        detail: `All ${orderedBundles} ordered bundles are now on the lorry.`,
        onUndo: () => {
          s.unscanLast(dispatch.id);
        },
      });
    }
  };

  const handleUndoLastScan = () => {
    if (!dispatch || scannedBundles === 0) return;
    const lastLabel = scannedLabels[scannedLabels.length - 1];
    s.unscanLast(dispatch.id);
    showSaved(`Removed ${lastLabel?.code ?? 'last bundle'} from lorry`);
  };

  const handleScaleReading = (kg: number) => {
    if (!dispatch) return;
    const res = s.recordGateWeight(dispatch.id, kg);
    setScaleRun(0);
    if (res.decision === 'pass') {
      beep('ok');
      showSaved(`Gate Pass issued · ${gatePassNo(dispatch)}`, {
        detail: `Scale read ${fmtKg(kg)} (expected ${fmtKg(Math.round(dispatch.expectedKg))}). Lorry may leave.`,
      });
    } else {
      beep('bad');
    }
  };

  const handleManagerOverride = (pin: string) => {
    if (!dispatch) return;
    if (!overrideReason.trim()) {
      setPinError('Write the reason above first, then enter the PIN.');
      beep('bad');
      return;
    }
    const ok = s.overrideGate(dispatch.id, pin, overrideReason.trim());
    if (!ok) {
      setPinError('Wrong PIN. Site Manager PIN is 2468 in this demo.');
      beep('bad');
      return;
    }
    setPinError(null);
    setOverrideOpen(false);
    beep('ok');
    showSaved(`Lorry unlocked by Site Manager · ${dispatch.deliveryNoteNo}`, {
      detail: `Reason recorded: "${overrideReason.trim()}"`,
    });
  };

  const verdict =
    dispatch &&
    dispatch.gateStatus !== 'pending' &&
    dispatch.gateKg !== undefined
      ? gateDecision({
          expectedKg: dispatch.expectedKg,
          actualKg: dispatch.gateKg,
          tolerancePct: tol,
          scannedBundles,
          orderedBundles,
        })
      : null;

  const missingKg =
    dispatch && dispatch.gateKg !== undefined
      ? Math.max(0, Math.round(dispatch.expectedKg - dispatch.gateKg))
      : 0;
  const approxMissingBundles =
    lightestBundleKg > 0 ? Math.round(missingKg / lightestBundleKg) : 0;
  const approxMissingPieces =
    approxMissingBundles * (lines[0]?.product.bundlePieces ?? 20);

  const waLines = dispatch && order
    ? [
        `Delivery note ${dispatch.deliveryNoteNo} for ${order.number}`,
        ...lines.map(
          (l) =>
            `• ${l.product.internalName}: ${l.scanned} bundles (${fmtNum(l.scanned * l.product.bundlePieces)} pcs)`,
        ),
        `Gate scale: ${dispatch.gateKg !== undefined ? fmtKg(dispatch.gateKg) : '—'} (expected ${fmtKg(Math.round(dispatch.expectedKg))})`,
        `Driver: ${dispatch.driver} · Lorry: ${dispatch.vehicle}`,
      ]
    : [];

  const handleSendWhatsApp = async () => {
    if (!dispatch) return;
    await messaging.sendWhatsApp(
      client?.whatsapp ?? '',
      waLines.join('\n'),
      `${dispatch.deliveryNoteNo}.pdf`,
    );
    setWaSent(true);
    showSaved(`Delivery note sent to ${client?.name ?? 'customer'} on WhatsApp`);
  };

  return (
    <div className="flex flex-col gap-5 max-w-[920px] mx-auto">
      <StockStyles />
      <SavedBanner info={saved} onDismiss={clearSaved} />

      {/* Top header + step tabs */}
      <div className="paper-sheet p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="t-sm font-semibold text-[var(--text-2)]">
            {site.name} · {role === 'gate' ? 'Gate' : 'Store & Gate'}
          </div>
          <h1 className="t-title text-[var(--text)] mt-0.5">
            {role === 'gate' ? en.stock.gateTitle : en.stock.dispatchTitle}
          </h1>
          <p className="t-base text-[var(--text-2)] mt-0.5">
            {role === 'gate' ? en.stock.gateSubtitle : en.stock.dispatchSubtitle}
          </p>
        </div>

        {/* Direct step switcher so Storekeeper or Gate can jump between loading and weighing */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={cn(
              'ctl-sm px-3.5 rounded-[8px] border font-bold t-sm',
              step === 1
                ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                : 'bg-[var(--surface)] border-[var(--line-2)] text-[var(--text)]',
            )}
          >
            1. Order & Lorry
          </button>
          <button
            type="button"
            disabled={!dispatch}
            onClick={() => setStep(2)}
            className={cn(
              'ctl-sm px-3.5 rounded-[8px] border font-bold t-sm disabled:opacity-40',
              step === 2
                ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                : 'bg-[var(--surface)] border-[var(--line-2)] text-[var(--text)]',
            )}
          >
            2. Scan bundles ({scannedBundles}/{orderedBundles})
          </button>
          <button
            type="button"
            disabled={!dispatch}
            onClick={() => setStep(3)}
            className={cn(
              'ctl-sm px-3.5 rounded-[8px] border font-bold t-sm disabled:opacity-40',
              step === 3
                ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                : 'bg-[var(--surface)] border-[var(--line-2)] text-[var(--text)]',
            )}
          >
            3. Weigh at gate
          </button>
        </div>
      </div>

      {hasUnconfirmedWeights && (
        <StatusNotice tone="warn" title="Bundle weights to be confirmed">
          Standard bundle weights are illustrative (to be confirmed by weighing sample
          bundles at the factory). Gate tolerance is ±{tol}%.
        </StatusNotice>
      )}

      {/* ====================================================================
       * STEP 1 OF 3: PICK ORDER AND LORRY
       * ==================================================================== */}
      {step === 1 && (
        <StepWizard
          step={1}
          totalSteps={3}
          title={en.stock.pickOrder}
          subtitle="Choose an approved order below and pick the lorry and driver."
          canNext={
            Boolean(order) &&
            (Boolean(dispatch) || ( Boolean(driver.trim()) && Boolean(vehicle) ))
          }
          nextHint="Pick an order, write the driver's name, and tap a lorry plate."
          nextLabel={
            dispatch ? 'Continue to bundle scanning' : 'Start loading lorry'
          }
          onNext={handleStep1Next}
        >
          <div className="flex flex-col gap-5">
            {readyOrders.length === 0 ? (
              <StatusNotice
                tone="warn"
                title="No order is ready to load right now"
                action={
                  <button
                    type="button"
                    onClick={() => go.site('sales/orders')}
                    className="ctl-sm px-4 rounded-[8px] bg-[var(--brand)] text-white font-bold t-sm"
                  >
                    Open customer orders
                  </button>
                }
              >
                An order appears here as soon as the Cashier confirms cash or the CEO
                approves credit.
              </StatusNotice>
            ) : (
              <div>
                <div className="t-base font-bold text-[var(--text)] mb-2">
                  Orders ready to load ({readyOrders.length})
                </div>
                <div className="flex flex-col gap-2.5">
                  {readyOrders.map((o) => {
                    const c = s.clients.find((x) => x.id === o.clientId);
                    const existing = openDispatchFor(o.id);
                    const totalBundles = o.lines.reduce(
                      (sum, l) => sum + l.bundles,
                      0,
                    );
                    const totalKg = o.lines.reduce(
                      (sum, l) =>
                        sum +
                        l.bundles *
                          (s.products.find((p) => p.id === l.productId)
                            ?.stdBundleWeightKg ?? 0),
                      0,
                    );
                    const summary = o.lines
                      .map((l) => {
                        const p = s.products.find((x) => x.id === l.productId);
                        return `${l.bundles} × ${p?.internalName ?? ''}`;
                      })
                      .join(' + ');

                    return (
                      <ChoiceButton
                        key={o.id}
                        selected={o.id === orderId}
                        title={`${c?.name ?? 'Customer'} · ${o.number}`}
                        subtitle={`${summary} · ${totalBundles} bundles · ${fmtKg(Math.round(totalKg))}`}
                        badge={
                          existing ? (
                            <span className="px-2.5 py-1 rounded-[6px] bg-[var(--warn-bg)] text-[var(--warn)] t-xs font-bold">
                              Loading ({existing.scannedLabelIds.length}/{totalBundles})
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-[6px] bg-[var(--ok-bg)] text-[var(--ok)] t-xs font-bold">
                              Ready to load
                            </span>
                          )
                        }
                        onClick={() => selectOrder(o.id)}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Locked orders explained in 1 plain sentence (Principle 9) */}
            {lockedOrders.length > 0 && (
              <div className="rounded-[8px] border border-[var(--line-2)] bg-[var(--surface-2)] p-4">
                <div className="t-sm font-bold text-[var(--text-2)] mb-2 flex items-center gap-1.5">
                  <Lock className="size-4 text-[var(--warn)]" />
                  <span>Orders locked and waiting before they can be loaded</span>
                </div>
                <div className="flex flex-col gap-2">
                  {lockedOrders.map((lo) => {
                    const c = s.clients.find((x) => x.id === lo.clientId);
                    const explanation =
                      lo.status === 'awaiting_cash'
                        ? 'Locked because cash has not been confirmed yet. The Cashier can unlock it on Money in.'
                        : 'Locked because this export credit order needs approval. Either CEO can unlock it.';
                    return (
                      <div
                        key={lo.id}
                        className="rounded-[8px] bg-[var(--surface)] border border-[var(--line)] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div>
                          <div className="t-base font-bold text-[var(--text)]">
                            {c?.name} · <span className="code">{lo.number}</span>
                          </div>
                          <div className="t-sm text-[var(--text-2)]">
                            {explanation}
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-[6px] bg-[var(--warn-bg)] text-[var(--warn)] t-xs font-bold">
                          Locked
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Lorry & driver picker (if dispatch not started yet) */}
            {order && !dispatch && (
              <div className="pt-4 border-t border-[var(--line)] grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="block t-base font-bold text-[var(--text)] mb-1.5">
                    {en.stock.pickVehicle} (next note: {nextNo})
                  </label>
                  <div className="grid gap-2">
                    {vehicles.map((v) => (
                      <ChoiceButton
                        key={v.id}
                        selected={vehicle === v.label}
                        icon={<Truck className="size-5" />}
                        title={v.label}
                        onClick={() => setVehicle(v.label)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block t-base font-bold text-[var(--text)] mb-1.5">
                    {en.stock.driverName}
                  </label>
                  <Input
                    value={driver}
                    onChange={(e) => setDriver(e.target.value)}
                    placeholder="Driver's full name"
                    className="!h-[52px] !text-[18px] mb-3"
                  />
                  {pastDrivers.length > 0 && (
                    <div>
                      <div className="t-xs font-semibold text-[var(--text-2)] mb-1.5">
                        Or tap a recent driver:
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {pastDrivers.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setDriver(d)}
                            className={cn(
                              'ctl-sm px-3 rounded-[8px] border t-sm font-semibold',
                              driver === d
                                ? 'bg-[var(--selected)] border-[var(--brand)] font-bold'
                                : 'bg-[var(--surface)] border-[var(--line-2)]',
                            )}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {order && dispatch && (
              <StatusNotice tone="ok" title={`Loading in progress · ${dispatch.deliveryNoteNo}`}>
                Lorry <b>{dispatch.vehicle}</b> driven by <b>{dispatch.driver}</b> currently
                has <b>{scannedBundles} of {orderedBundles}</b> bundles scanned. Tap Next
                below to keep scanning or weigh at the gate.
              </StatusNotice>
            )}
          </div>
        </StepWizard>
      )}

      {/* ====================================================================
       * STEP 2 OF 3: SCAN EACH BUNDLE ONTO THE LORRY
       * ==================================================================== */}
      {step === 2 && order && dispatch && (
        <StepWizard
          step={2}
          totalSteps={3}
          title={en.stock.scanBundles}
          subtitle="Tap to scan each bundle sticker as it goes onto the lorry. Watch the count grow."
          summaryStrip={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Order: <b>{order.number}</b> ({client?.name}) · Note:{' '}
                <b className="code">{dispatch.deliveryNoteNo}</b> · Lorry:{' '}
                <b className="code">{dispatch.vehicle}</b> ({dispatch.driver})
              </span>
              <span className="num font-bold">
                Expected weight: {fmtKg(Math.round(expectedKg))}
              </span>
            </div>
          }
          canNext={scannedBundles > 0}
          nextHint="Scan at least one bundle onto the lorry before moving to the gate scale."
          nextLabel="Go to gate scale"
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        >
          <div className="flex flex-col gap-5">
            {/* Giant live counter banner */}
            <div
              className={cn(
                'rounded-[10px] border-2 p-5 flex flex-wrap items-center justify-between gap-4',
                scannedBundles === orderedBundles && orderedBundles > 0
                  ? 'bg-[var(--ok-bg)] border-[var(--ok)]'
                  : 'bg-[var(--surface-2)] border-[var(--line-2)]',
              )}
            >
              <div>
                <div className="t-sm font-bold uppercase tracking-wider text-[var(--text-2)]">
                  Bundles on the lorry
                </div>
                <div className="text-[36px] font-bold num leading-tight mt-0.5">
                  {scannedBundles}{' '}
                  <span className="text-[22px] font-normal text-[var(--text-2)]">
                    of {orderedBundles} bundles
                  </span>
                </div>
                <div className="t-base text-[var(--text-2)] mt-1 num">
                  Weight on lorry so far: <b>{fmtKg(Math.round(scannedKg))}</b> of{' '}
                  <b>{fmtKg(Math.round(expectedKg))}</b> expected
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={scannedBundles >= orderedBundles}
                  onClick={() => handleScanOne()}
                  className="ctl-lg px-5 rounded-[8px] bg-[var(--brand)] hover:bg-[var(--brand-hover)] disabled:opacity-40 text-white font-bold t-base inline-flex items-center gap-2 shadow-[var(--shadow-card)]"
                >
                  <ScanLine className="size-5" />
                  <span>Scan 1 bundle</span>
                </button>

                {scannedBundles < orderedBundles && (
                  <button
                    type="button"
                    onClick={handleScanAllRemaining}
                    className="ctl px-4 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] text-[var(--text)] font-bold t-sm inline-flex items-center gap-1.5"
                  >
                    <Zap className="size-4 text-[var(--warn)]" />
                    <span>
                      Scan all {orderedBundles - scannedBundles} left (demo)
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={scannedBundles === 0}
                  onClick={handleUndoLastScan}
                  className="ctl px-4 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] disabled:opacity-40 text-[var(--text)] font-bold t-sm inline-flex items-center gap-1.5"
                >
                  <Undo2 className="size-4" />
                  <span>{en.stock.undoLastScan}</span>
                </button>
              </div>
            </div>

            {/* Product lines on the order */}
            <div className="flex flex-col gap-3">
              <div className="t-base font-bold text-[var(--text)]">
                Items on this delivery note
              </div>
              {lines.map((line) => {
                const doneLine = line.scanned >= line.ordered;
                return (
                  <div
                    key={line.product.id}
                    className={cn(
                      'rounded-[10px] border p-4 flex flex-wrap items-center justify-between gap-4',
                      doneLine
                        ? 'bg-[var(--ok-bg)]/40 border-[var(--ok)]/40'
                        : 'bg-[var(--surface)] border-[var(--line-2)]',
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="size-6 rounded-[6px] border border-black/15 shrink-0"
                        style={{ background: line.product.colour ?? '#888' }}
                      />
                      <div>
                        <div className="t-lg font-bold text-[var(--text)]">
                          {line.product.internalName}
                        </div>
                        <div className="t-sm text-[var(--text-2)] num">
                          {line.product.bundlePieces} pieces per bundle ·{' '}
                          {fmtKg(line.std)} each
                          {line.product.weightStatus === 'to_be_measured'
                            ? ' (weight to be confirmed)'
                            : ''}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right num">
                        <div className="t-lg font-bold">
                          {line.scanned} / {line.ordered} bundles
                        </div>
                        <div className="t-xs text-[var(--text-2)]">
                          {fmtKg(Math.round(line.scanned * line.std))} of{' '}
                          {fmtKg(Math.round(line.expectedKg))}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={doneLine}
                        onClick={() => handleScanOne(line.product.id)}
                        className={cn(
                          'ctl px-4 rounded-[8px] font-bold t-sm inline-flex items-center gap-1.5',
                          doneLine
                            ? 'bg-[var(--ok)] text-white'
                            : 'bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)]',
                        )}
                      >
                        {doneLine ? (
                          <>
                            <Check className="size-4 stroke-[3]" /> Done
                          </>
                        ) : (
                          <>
                            <ScanLine className="size-4" /> Scan +1
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </StepWizard>
      )}

      {/* ====================================================================
       * STEP 3 OF 3: WEIGH THE LORRY AT THE GATE
       * ==================================================================== */}
      {step === 3 && order && dispatch && (
        <div className="flex flex-col gap-5">
          <PaperSheet
            title={`Step 3 of 3 · ${en.stock.weighAtGate}`}
            subtitle={`Delivery note ${dispatch.deliveryNoteNo} · Lorry ${dispatch.vehicle} (${dispatch.driver}) · Customer: ${client?.name}`}
            badge={
              <button
                type="button"
                onClick={() => setStep(2)}
                className="ctl-sm px-3.5 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] font-semibold t-sm"
              >
                ← Back to bundles ({scannedBundles}/{orderedBundles})
              </button>
            }
          >
            <div className="flex flex-col gap-5">
              {/* Expected vs Scanned check bar */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[8px] bg-[var(--surface-2)] border border-[var(--line)] p-3.5">
                  <div className="t-xs font-semibold uppercase text-[var(--text-2)]">
                    Bundles scanned
                  </div>
                  <div className="t-kpi num mt-0.5">
                    {scannedBundles} / {orderedBundles}
                  </div>
                </div>
                <div className="rounded-[8px] bg-[var(--surface-2)] border border-[var(--line)] p-3.5">
                  <div className="t-xs font-semibold uppercase text-[var(--text-2)]">
                    Expected lorry cargo weight
                  </div>
                  <div className="t-kpi num mt-0.5">
                    {fmtKg(Math.round(expectedKg))}
                  </div>
                  <div className="t-xs text-[var(--text-2)] mt-0.5">
                    Allowed gate band: ±{tol}%
                  </div>
                </div>
                <div className="rounded-[8px] bg-[var(--surface-2)] border border-[var(--line)] p-3.5">
                  <div className="t-xs font-semibold uppercase text-[var(--text-2)]">
                    Gate scale reading
                  </div>
                  <div className="t-kpi num mt-0.5">
                    {dispatch.gateKg !== undefined
                      ? fmtKg(dispatch.gateKg)
                      : 'Not weighed yet'}
                  </div>
                </div>
              </div>

              {/* Demo toggle for the Rwanda 200-mats loss story */}
              <div className="rounded-[8px] border border-[var(--line-2)] bg-[var(--surface-2)] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="t-sm text-[var(--text-2)]">
                  <b>Demo test:</b> Test what happens when 10 bundles (200 mats) are
                  missing from the lorry even though every sticker was scanned.
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSimulateShort((v) => !v);
                    setScaleRun((n) => n + 1);
                  }}
                  className={cn(
                    'ctl-sm px-4 rounded-[8px] border font-bold t-sm inline-flex items-center gap-1.5',
                    simulateShort
                      ? 'bg-[var(--bad)] text-white border-[var(--bad)]'
                      : 'bg-[var(--surface)] text-[var(--text)] border-[var(--line-2)] hover:bg-[var(--hover)]',
                  )}
                >
                  <AlertTriangle className="size-4" />
                  <span>
                    {simulateShort
                      ? 'Simulating 200 mats missing (short weight ON)'
                      : 'Simulate 200 mats missing (short weight)'}
                  </span>
                </button>
              </div>

              {/* Gate Scale Widget */}
              <ScaleWidget
                key={`${scaleRun}-${simulateShort}-${targetScaleKg}`}
                autoStart={scaleRun > 0}
                targetKg={targetScaleKg}
                disabled={scannedBundles === 0}
                onReading={handleScaleReading}
                title="Gate Weighbridge Scale"
                model={
                  scannedBundles === 0
                    ? 'Scan bundles in Step 2 first'
                    : 'Drive lorry onto the scale, then tap Read scale and Use reading'
                }
              />

              {/* ============================================================
               * VERDICT 1: LORRY HELD AT THE GATE (RED)
               * ============================================================ */}
              {verdict && dispatch.gateStatus === 'hold' && (
                <div className="rounded-[10px] border-2 border-[var(--bad)] bg-[var(--bad-bg)] p-5 flex flex-col gap-4">
                  <div className="flex items-start gap-3.5">
                    <span className="size-12 rounded-full bg-[var(--bad)] text-white grid place-items-center shrink-0">
                      <ShieldAlert className="size-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="t-xs font-bold uppercase tracking-wider text-[var(--bad)]">
                        Do not open the gate
                      </div>
                      <h2 className="t-title text-[var(--bad)] mt-0.5">
                        {en.stock.gateHoldTitle}
                      </h2>
                      <p className="t-base font-semibold text-[var(--text)] mt-1">
                        Why this lorry is held:
                      </p>
                      <ul className="mt-2 space-y-1.5 t-base text-[var(--text)]">
                        {verdict.reasons.map((r) => (
                          <li key={r} className="flex items-start gap-2 font-bold">
                            <span className="text-[var(--bad)]">•</span>
                            <span>{r}</span>
                          </li>
                        ))}
                        {missingKg > 0 && (
                          <li className="flex items-start gap-2 font-bold text-[var(--bad)]">
                            <span>•</span>
                            <span>
                              The lorry is {fmtKg(missingKg)} lighter than expected —
                              about {approxMissingBundles} bundles ({approxMissingPieces}{' '}
                              mats) are missing!
                            </span>
                          </li>
                        )}
                      </ul>
                      <p className="t-sm text-[var(--text-2)] mt-3">
                        <b>Who can unlock this:</b> Recount the bundles on the lorry and
                        weigh again, or ask the <b>Site Manager</b> to unlock the gate
                        with their PIN and a written reason. Both CEOs have been alerted.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-[var(--bad)]/25">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="ctl px-4 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] font-bold t-base inline-flex items-center gap-2"
                    >
                      <RotateCcw className="size-4" />
                      <span>Go back and recount bundles</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOverrideOpen((v) => !v);
                        setPinError(null);
                      }}
                      className="ctl px-5 rounded-[8px] bg-[var(--bad)] hover:opacity-95 text-white font-bold t-base inline-flex items-center gap-2"
                    >
                      <KeyRound className="size-4" />
                      <span>Site Manager: Unlock with PIN</span>
                    </button>
                  </div>

                  {overrideOpen && (
                    <div className="rounded-[10px] bg-[var(--surface)] border border-[var(--line-2)] p-4 mt-2">
                      <div className="t-base font-bold text-[var(--text)] mb-1">
                        Site Manager Gate Override
                      </div>
                      <p className="t-sm text-[var(--text-2)] mb-3">
                        Write why this lorry is allowed to leave, then enter the Site
                        Manager PIN (demo PIN: <b className="code">2468</b>).
                      </p>
                      <Input
                        value={overrideReason}
                        onChange={(e) => {
                          setOverrideReason(e.target.value);
                          setPinError(null);
                        }}
                        placeholder="Reason (e.g. Recounted by hand with storekeeper, scale drift checked)"
                        className="!h-[50px] !text-[16px] mb-4"
                      />
                      <PinPad
                        onSubmit={handleManagerOverride}
                        title="Enter Site Manager PIN (2468)"
                        error={pinError}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* ============================================================
               * VERDICT 2: GATE PASS ISSUED (GREEN)
               * ============================================================ */}
              {verdict &&
                (dispatch.gateStatus === 'pass' ||
                  dispatch.gateStatus === 'overridden') && (
                  <div className="rounded-[10px] border-2 border-[var(--ok)] bg-[var(--ok-bg)] p-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <span className="size-12 rounded-full bg-[var(--ok)] text-white grid place-items-center shrink-0">
                        <ShieldCheck className="size-6" />
                      </span>
                      <div>
                        <div className="t-xs font-bold uppercase tracking-wider text-[var(--ok)]">
                          Gate Pass {gatePassNo(dispatch)}
                        </div>
                        <h2 className="t-title text-[var(--text)] mt-0.5">
                          {dispatch.gateStatus === 'overridden'
                            ? 'Lorry unlocked by Site Manager ✓'
                            : `${en.stock.gatePassTitle} ✓`}
                        </h2>
                        <p className="t-base text-[var(--text-2)] mt-0.5">
                          Scale weight <b>{fmtKg(dispatch.gateKg!)}</b> against{' '}
                          <b>{fmtKg(Math.round(dispatch.expectedKg))}</b> expected (
                          {fmtPct(verdict.variancePct, true)}). Lorry{' '}
                          <b className="code">{dispatch.vehicle}</b> may leave now.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setWaOpen(true)}
                        className="ctl px-4 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] font-bold t-base inline-flex items-center gap-2"
                      >
                        <Send className="size-4" />
                        <span>Send Delivery Note on WhatsApp</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDispatchId(null);
                          setOrderId(null);
                          setSimulateShort(false);
                          setStep(1);
                        }}
                        className="ctl px-5 rounded-[8px] bg-[var(--ok)] text-white font-bold t-base inline-flex items-center gap-2"
                      >
                        <CheckCircle2 className="size-5" />
                        <span>Done · Load next lorry</span>
                      </button>
                    </div>
                  </div>
                )}
            </div>
          </PaperSheet>

          {/* Paper Delivery Note twin */}
          <PaperSheet
            title="Paper Delivery Note"
            subtitle="Same columns and fields as your paper delivery note book."
          >
            <div className="max-w-[540px] mx-auto">
              <DeliveryNoteCard dispatch={dispatch} />
            </div>
          </PaperSheet>
        </div>
      )}

      <Sheet
        open={waOpen}
        onClose={() => setWaOpen(false)}
        title="Send Delivery Note on WhatsApp"
        sub={dispatch ? `${dispatch.deliveryNoteNo} · ${client?.name}` : undefined}
      >
        <div className="flex flex-col gap-4 items-center">
          <WhatsAppPreview
            to={client?.name ?? ''}
            lines={waLines}
            attachment={`${dispatch?.deliveryNoteNo ?? 'DN'}.pdf`}
            sent={waSent}
          />
          <button
            type="button"
            disabled={waSent}
            onClick={handleSendWhatsApp}
            className="w-full ctl-lg rounded-[8px] bg-[var(--ok)] text-white font-bold t-lg inline-flex items-center justify-center gap-2"
          >
            <Send className="size-5" />
            <span>{waSent ? 'Sent on WhatsApp ✓' : 'Send now on WhatsApp'}</span>
          </button>
        </div>
      </Sheet>
    </div>
  );
}
