import { useMemo, useState } from 'react';
import { CheckCircle2, PackageCheck, Truck } from 'lucide-react';
import type { DomainEvent, StockMovement } from '@tanaad/domain';
import { variancePct } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useRefList, useSite, useSiteSettings } from '@/app/hooks';
import { fmtKg, fmtNum, fmtPct, fmtTime } from '@/data/format';
import { Input, cn } from '@/components/ui';
import { ScaleWidget } from '@/components/ScaleWidget';
import {
  ChoiceButton,
  LargeKeypad,
  PaperSheet,
  SavedBanner,
  StatusNotice,
  StepWizard,
  useSavedBanner,
} from '@/components/simple';
import { en } from '@/i18n/en';
import { Intake } from '@/features/recycling/Intake';
import { dayOf, packWord } from './kit';

type Receipt = DomainEvent<StockMovement>;
const SEP = ' · ';
const writeReason = (material: string, supplier: string, noteNo: string) =>
  [material, supplier, noteNo ? `note ${noteNo}` : '']
    .filter((x, i) => i < 2 || x)
    .join(SEP);
const readReason = (reason?: string) => {
  const [material = '', supplier = ''] = (reason ?? '').split(SEP);
  return { material, supplier };
};

/**
 * Receive goods / Weigh a delivery in:
 * - At Recycling, renders Flow 9 (Weigh in scrap) directly.
 * - At Mats and Bags, guides the Storekeeper / Gate through 3 steps:
 *   1. Material, store room & supplier
 *   2. Quantity on supplier's paper note
 *   3. Scale weight & accept
 */
export function Receive() {
  const site = useSite();
  if (site.id === 'recycling') {
    return <Intake />;
  }
  return <SupplierReceive />;
}

function SupplierReceive() {
  const s = useStore();
  const site = useSite();
  const settings = useSiteSettings();
  const materials = useRefList('material');
  const { saved, showSaved, clearSaved } = useSavedBanner();

  const tol = settings?.gateTolerancePct ?? site.thresholds.gateTolerancePct;
  const zones = s.zones.filter((z) => z.siteId === site.id);

  const receipts = useMemo(
    () =>
      (
        s.events.filter(
          (e) =>
            e.type === 'StockMoved' &&
            e.siteId === site.id &&
            (e.payload as StockMovement).kind === 'receive',
        ) as Receipt[]
      ).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [s.events, site.id],
  );

  const pastSuppliers = useMemo(
    () =>
      [
        ...new Set(
          receipts
            .map((e) => readReason(e.payload.reason).supplier)
            .filter(Boolean),
        ),
      ].slice(0, 6),
    [receipts],
  );

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [materialId, setMaterialId] = useState<string | null>(
    materials[0]?.id ?? null,
  );
  const [zoneId, setZoneId] = useState<string | null>(zones[0]?.id ?? null);
  const [supplier, setSupplier] = useState<string>(
    pastSuppliers[0] ?? 'Kampala Polymer Supply',
  );
  const [noteNo, setNoteNo] = useState<string>('');
  const [qtyStr, setQtyStr] = useState<string>('40');
  const [readingKg, setReadingKg] = useState<number | null>(null);
  const [scaleRound, setScaleRound] = useState(0);

  const material = materials.find((m) => m.id === materialId);
  const pack = packWord(material?.unit);
  const perPack = material?.value;
  const byPack = Boolean(material && perPack && pack);
  const qtyNum = Number(qtyStr) || 0;
  const expectedKg = material ? (byPack ? qtyNum * perPack! : qtyNum) : 0;

  const targetScaleKg = Math.max(50, Math.round(expectedKg));
  const vPct =
    readingKg !== null && expectedKg > 0
      ? variancePct(expectedKg, readingKg)
      : undefined;
  const isShort = vPct !== undefined && vPct < -tol;

  const handleSaveReceipt = () => {
    if (!material || !zoneId || !supplier.trim() || !readingKg) return;
    const reason = writeReason(material.label, supplier.trim(), noteNo.trim());
    s.moveStock({
      siteId: site.id,
      kind: 'receive',
      qtyUnits: qtyNum,
      qtyKg: readingKg,
      toZoneId: zoneId,
      reason,
    });
    const label = s.createLabel({
      siteId: site.id,
      kind: 'bag',
      stageCode: 'raw',
      day: s.today,
      qtyUnits: qtyNum,
      qtyKg: readingKg,
      status: 'in_stock',
      zoneId,
      parentIds: [],
      colour: material.label,
    });
    const zoneName = zones.find((z) => z.id === zoneId)?.name ?? 'Store';
    showSaved(`Received ${fmtKg(readingKg)} of ${material.label} (${label.code})`, {
      detail: `Supplier: ${supplier.trim()} · Put into ${zoneName}`,
    });
    setReadingKg(null);
    setScaleRound((r) => r + 1);
    setStep(1);
  };

  return (
    <div className="flex flex-col gap-5 max-w-[820px] mx-auto">
      <SavedBanner info={saved} onDismiss={clearSaved} />

      <div className="paper-sheet p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="t-sm font-semibold text-[var(--text-2)]">
            {site.name} · Gate & Store
          </div>
          <h1 className="t-title text-[var(--text)] mt-0.5">
            {en.stock.receiveTitle}
          </h1>
          <p className="t-base text-[var(--text-2)] mt-0.5">
            {en.stock.receiveSubtitle}
          </p>
        </div>
        <span className="px-3.5 py-1.5 rounded-[8px] bg-[var(--surface-2)] border border-[var(--line-2)] t-sm font-bold">
          Gate tolerance ±{tol}%
        </span>
      </div>

      {/* STEP 1 OF 3: MATERIAL, STORE ROOM & SUPPLIER */}
      {step === 1 && (
        <StepWizard
          step={1}
          totalSteps={3}
          title="What arrived and who brought it?"
          subtitle="Pick the raw material, the store room, and the supplier."
          canNext={Boolean(material && zoneId && supplier.trim())}
          nextHint="Pick a material, store room, and supplier name."
          onNext={() => setStep(2)}
        >
          <div className="flex flex-col gap-5">
            <div>
              <div className="t-base font-bold text-[var(--text)] mb-2">
                1. Pick the material (from Settings)
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {materials.map((m) => (
                  <ChoiceButton
                    key={m.id}
                    selected={materialId === m.id}
                    title={m.label}
                    subtitle={
                      m.value ? `${m.value} ${m.unit ?? 'kg'}` : m.unit
                    }
                    onClick={() => setMaterialId(m.id)}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="t-base font-bold text-[var(--text)] mb-2">
                2. Which store room is it going into?
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {zones.map((z) => (
                  <ChoiceButton
                    key={z.id}
                    selected={zoneId === z.id}
                    title={z.name}
                    onClick={() => setZoneId(z.id)}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-[var(--line)]">
              <div>
                <label className="block t-base font-bold text-[var(--text)] mb-1.5">
                  3. Supplier name
                </label>
                <Input
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Supplier or company name"
                  className="!h-[50px] !text-[17px]"
                />
                {pastSuppliers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {pastSuppliers.map((sup) => (
                      <button
                        key={sup}
                        type="button"
                        onClick={() => setSupplier(sup)}
                        className={cn(
                          'ctl-sm px-3 rounded-[8px] border t-xs font-semibold',
                          supplier === sup
                            ? 'bg-[var(--selected)] border-[var(--brand)] font-bold'
                            : 'bg-[var(--surface)] border-[var(--line-2)]',
                        )}
                      >
                        {sup}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block t-base font-bold text-[var(--text)] mb-1.5">
                  Supplier delivery note no. (optional)
                </label>
                <Input
                  value={noteNo}
                  onChange={(e) => setNoteNo(e.target.value)}
                  placeholder="e.g. SUP-408"
                  className="!h-[50px] !text-[17px] code"
                />
              </div>
            </div>
          </div>
        </StepWizard>
      )}

      {/* STEP 2 OF 3: QUANTITY ON SUPPLIER'S PAPER NOTE */}
      {step === 2 && material && (
        <StepWizard
          step={2}
          totalSteps={3}
          title="How much does the supplier's paper note say?"
          subtitle="Enter the number of bags/packs or kilos written on their delivery note."
          summaryStrip={
            <span>
              Material: <b>{material.label}</b> · From: <b>{supplier}</b>
            </span>
          }
          canNext={expectedKg > 0}
          nextHint="Enter a quantity greater than zero."
          onBack={() => setStep(1)}
          onNext={() => {
            setReadingKg(null);
            setStep(3);
          }}
        >
          <div className="grid gap-6 lg:grid-cols-2 items-start">
            <LargeKeypad
              value={qtyStr}
              onChange={setQtyStr}
              unit={byPack ? `${pack}s` : 'kg'}
              label={
                byPack
                  ? `Number of ${pack}s (${perPack} kg each)`
                  : 'Declared weight (kg)'
              }
              presets={
                byPack
                  ? [
                      { label: `20 ${pack}s`, value: 20 },
                      { label: `40 ${pack}s`, value: 40 },
                      { label: `100 ${pack}s`, value: 100 },
                    ]
                  : [
                      { label: '500 kg', value: 500 },
                      { label: '1,000 kg', value: 1000 },
                      { label: '2,000 kg', value: 2000 },
                    ]
              }
            />

            <div className="rounded-[10px] border border-[var(--line-2)] bg-[var(--surface-2)] p-5">
              <div className="t-sm font-semibold text-[var(--text-2)]">
                Expected weight from paper note
              </div>
              <div className="text-[34px] font-bold num mt-1">
                {fmtKg(Math.round(expectedKg))}
              </div>
              {byPack && (
                <div className="t-base text-[var(--text-2)] mt-1 num">
                  {fmtNum(qtyNum)} {pack}s × {perPack} kg each
                </div>
              )}
            </div>
          </div>
        </StepWizard>
      )}

      {/* STEP 3 OF 3: WEIGH ON THE GATE SCALE & SAVE */}
      {step === 3 && material && (
        <StepWizard
          step={3}
          totalSteps={3}
          title="Weigh the delivery on the scale"
          subtitle="Read the gate scale to check that the real weight matches the supplier's note."
          summaryStrip={
            <span>
              Material: <b>{material.label}</b> · Paper note:{' '}
              <b className="num">{fmtKg(Math.round(expectedKg))}</b> · Supplier:{' '}
              <b>{supplier}</b>
            </span>
          }
          canNext={readingKg !== null && readingKg > 0}
          nextHint="Read the scale and tap 'Use … kg' below."
          nextLabel={en.stock.acceptDelivery}
          isFinalStep
          finalTone="ok"
          onBack={() => setStep(2)}
          onNext={handleSaveReceipt}
        >
          <div className="flex flex-col gap-4">
            <ScaleWidget
              key={scaleRound}
              targetKg={targetScaleKg}
              onReading={(kg) => setReadingKg(kg)}
              title="Gate Scale"
            />

            {readingKg !== null && vPct !== undefined && (
              <StatusNotice
                tone={isShort ? 'bad' : 'ok'}
                title={
                  isShort
                    ? `Short delivery: ${fmtKg(readingKg)} on scale vs ${fmtKg(expectedKg)} on paper`
                    : `Scale matches paper note: ${fmtKg(readingKg)} (${fmtPct(vPct, true)})`
                }
              >
                {isShort
                  ? 'You can still accept this delivery — the shortfall will be written on the lot sticker.'
                  : 'Within the allowed gate tolerance. Tap Save and accept delivery below.'}
              </StatusNotice>
            )}
          </div>
        </StepWizard>
      )}

      {/* Recent deliveries received */}
      <PaperSheet
        title="Recent deliveries weighed in"
        subtitle="Scale weight recorded for each delivery."
        pad={false}
      >
        {receipts.length === 0 ? (
          <div className="p-5 t-base text-[var(--text-2)]">
            No deliveries weighed in yet.
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {receipts.slice(0, 6).map((e) => {
              const info = readReason(e.payload.reason);
              return (
                <div
                  key={e.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Truck className="size-5 text-[var(--text-3)] shrink-0" />
                    <div>
                      <div className="t-base font-bold text-[var(--text)]">
                        {info.material || 'Material'} ·{' '}
                        <span className="font-normal text-[var(--text-2)]">
                          {info.supplier || 'Supplier'}
                        </span>
                      </div>
                      <div className="t-xs text-[var(--text-3)] num">
                        {dayOf(e.occurredAt)} · {fmtTime(e.occurredAt)}
                      </div>
                    </div>
                  </div>
                  <span className="num t-lg font-bold">
                    {fmtKg(e.payload.qtyKg)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </PaperSheet>
    </div>
  );
}
