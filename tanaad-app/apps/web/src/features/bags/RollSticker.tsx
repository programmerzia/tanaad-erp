import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import type { Label, ShiftKind } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { currentShiftKind, machinesOf } from '@/data/selectors';
import { fmtKg } from '@/data/format';
import { printer } from '@/devices';
import { SITES } from '@/config/sites';
import { Sticker } from '@/components/Sticker';
import {
  ChoiceButton,
  LargeKeypad,
  PaperSheet,
  SavedBanner,
  StatusNotice,
  useSavedBanner,
} from '@/components/simple';
import { en } from '@/i18n/en';

/**
 * Flow 8 · Roll sticker (bags):
 * "the same six fields as their paper sticker (date, operator, shift, machine, kg, roll type), printed."
 * All options come from master data (products of kind 'roll', machines, operators).
 */
export function RollSticker() {
  const s = useStore();
  const site = SITES.bags;
  const { saved, showSaved, clearSaved } = useSavedBanner();

  const extruders = useMemo(
    () => machinesOf(s, 'bags', 'extrude').filter((m) => m.status === 'active'),
    [s],
  );
  const operators = useMemo(() => {
    const extOps = s.people.filter(
      (p) =>
        p.homeSiteId === 'bags' &&
        p.status === 'active' &&
        p.sector === 'Extrusion',
    );
    return extOps.length > 0
      ? extOps
      : s.people.filter((p) => p.homeSiteId === 'bags' && p.status === 'active');
  }, [s.people]);

  const rollProducts = useMemo(
    () => s.products.filter((p) => p.siteId === 'bags' && p.kind === 'roll'),
    [s.products],
  );
  const zones = useMemo(
    () => s.zones.filter((z) => z.siteId === 'bags'),
    [s.zones],
  );

  // The 6 paper sticker fields
  const [date, setDate] = useState<string>(s.today);
  const [operatorId, setOperatorId] = useState<string>(operators[0]?.id ?? '');
  const [shift, setShift] = useState<ShiftKind>(currentShiftKind());
  const [machineId, setMachineId] = useState<string>(extruders[0]?.id ?? '');
  const [kgStr, setKgStr] = useState<string>('46');
  const [productId, setProductId] = useState<string>(rollProducts[0]?.id ?? '');

  const operator = operators.find((o) => o.id === operatorId);
  const machine = extruders.find((m) => m.id === machineId);
  const rollProduct = rollProducts.find((p) => p.id === productId);
  const weightKg = Number(kgStr) || 0;

  const ready =
    Boolean(date) &&
    Boolean(operator) &&
    Boolean(machine) &&
    weightKg > 0 &&
    Boolean(rollProduct);

  const previewLabel: Label = {
    id: 'preview-roll',
    code: `BAG-ROL-${String(s.labels.length + 1).padStart(6, '0')}`,
    siteId: 'bags',
    kind: 'roll',
    stageCode: 'extrude',
    productId: rollProduct?.id,
    machineId: machine?.id,
    operatorId: operator?.id,
    day: date,
    qtyUnits: 1,
    qtyKg: weightKg,
    colour: rollProduct?.colour,
    status: 'in_stock',
    zoneId: zones[0]?.id,
    parentIds: [],
  };

  const handlePrint = async () => {
    if (!ready || !operator || !machine || !rollProduct) return;
    const label = s.createLabel({
      siteId: 'bags',
      kind: 'roll',
      stageCode: 'extrude',
      productId: rollProduct.id,
      machineId: machine.id,
      operatorId: operator.id,
      day: date,
      qtyUnits: 1,
      qtyKg: weightKg,
      colour: rollProduct.colour,
      status: 'in_stock',
      zoneId: zones[0]?.id,
      parentIds: [],
    });
    await printer.print({
      code: label.code,
      lines: [
        `DATE: ${date}`,
        `OPERATOR: ${operator.fullName}`,
        `SHIFT: ${shift.toUpperCase()}`,
        `MACHINE: ${machine.code}`,
        `KG: ${weightKg}`,
        `ROLL: ${rollProduct.internalName}`,
      ],
    });
    showSaved(`Sticker ${label.code} saved and printed`, {
      detail: `${operator.fullName} · ${machine.code} · ${fmtKg(weightKg)} · ${rollProduct.internalName}`,
      onUndo: () => {
        s.consumeLabel(label.id);
      },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <SavedBanner info={saved} onDismiss={clearSaved} />

      {/* Header */}
      <div className="paper-sheet p-5">
        <div className="t-sm font-semibold text-[var(--text-2)]">{site.legalName}</div>
        <h1 className="t-title text-[var(--text)] mt-0.5">{en.sticker.rollTitle}</h1>
        <p className="t-base text-[var(--text-2)] mt-1">{en.sticker.rollSubtitle}</p>
      </div>

      {/* Unconfirmed process note (Rule 7) */}
      {site.toBeConfirmed && (
        <StatusNotice tone="warn" title={en.app.toBeConfirmed}>
          {site.toBeConfirmed}
        </StatusNotice>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        {/* Left: The 6 numbered fields in exact paper sticker order */}
        <PaperSheet
          title="Fill the 6 sticker fields"
          subtitle="Pick each item below, then tap Save and print sticker."
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="t-base font-medium text-[var(--text-2)]">
                {ready
                  ? `Ready: ${machine?.code} · ${fmtKg(weightKg)} · ${rollProduct?.internalName}`
                  : 'Complete all 6 fields above to print.'}
              </div>
              <button
                type="button"
                disabled={!ready}
                onClick={handlePrint}
                className="ctl-lg px-6 rounded-[8px] bg-[var(--ok)] hover:opacity-95 disabled:opacity-45 text-white font-bold t-lg inline-flex items-center gap-2.5 shadow-[var(--shadow-card)]"
              >
                <Printer className="size-5" />
                <span>{en.sticker.saveAndPrint}</span>
              </button>
            </div>
          }
        >
          <div className="flex flex-col gap-6">
            {/* 1. Date */}
            <div>
              <div className="t-base font-bold text-[var(--text)] mb-2">
                {en.sticker.fieldDate}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 max-w-[420px]">
                <ChoiceButton
                  selected={date === s.today}
                  title={`Today (${s.today})`}
                  onClick={() => setDate(s.today)}
                />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="Sticker date"
                  className="ctl px-3.5 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] t-base num font-semibold"
                />
              </div>
            </div>

            {/* 2. Operator */}
            <div>
              <div className="t-base font-bold text-[var(--text)] mb-2">
                {en.sticker.fieldOperator}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {operators.slice(0, 6).map((op) => (
                  <ChoiceButton
                    key={op.id}
                    selected={operatorId === op.id}
                    avatarName={op.fullName}
                    avatarSeed={op.avatarSeed}
                    title={op.fullName}
                    subtitle={op.sector}
                    onClick={() => setOperatorId(op.id)}
                  />
                ))}
              </div>
            </div>

            {/* 3. Shift */}
            <div>
              <div className="t-base font-bold text-[var(--text)] mb-2">
                {en.sticker.fieldShift}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 max-w-[420px]">
                <ChoiceButton
                  selected={shift === 'day'}
                  title="Day shift"
                  subtitle="07:00 – 19:00"
                  onClick={() => setShift('day')}
                />
                <ChoiceButton
                  selected={shift === 'night'}
                  title="Night shift"
                  subtitle="19:00 – 07:00"
                  onClick={() => setShift('night')}
                />
              </div>
            </div>

            {/* 4. Machine */}
            <div>
              <div className="t-base font-bold text-[var(--text)] mb-2">
                {en.sticker.fieldMachine}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {extruders.map((m) => (
                  <ChoiceButton
                    key={m.id}
                    selected={machineId === m.id}
                    title={m.code}
                    subtitle={m.kind}
                    onClick={() => setMachineId(m.id)}
                  />
                ))}
              </div>
            </div>

            {/* 5. Weight (kg) */}
            <div>
              <div className="t-base font-bold text-[var(--text)] mb-2">
                {en.sticker.fieldKg}
              </div>
              <LargeKeypad
                value={kgStr}
                onChange={setKgStr}
                allowDecimal
                unit="kg"
                presets={[
                  { label: '42 kg', value: 42 },
                  { label: '45 kg', value: 45 },
                  { label: '48 kg', value: 48 },
                  { label: '50 kg', value: 50 },
                ]}
              />
            </div>

            {/* 6. Roll type (from master data roll products) */}
            <div>
              <div className="t-base font-bold text-[var(--text)] mb-2">
                {en.sticker.fieldRollType}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {rollProducts.map((rp) => (
                  <ChoiceButton
                    key={rp.id}
                    selected={productId === rp.id}
                    colourSwatch={rp.colour ?? '#888'}
                    title={rp.internalName.replace(' film roll', '')}
                    subtitle={`${rp.commercialName}${rp.thicknessMicron ? ` · ${rp.thicknessMicron} µm` : ''}`}
                    onClick={() => setProductId(rp.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </PaperSheet>

        {/* Right: Live Paper Roll Sticker Preview */}
        <div className="lg:sticky lg:top-[84px] flex flex-col gap-4">
          <PaperSheet
            title="Paper sticker preview"
            subtitle="Same 6 lines as the handwritten roll sticker, plus QR code"
          >
            <div className="flex justify-center py-2">
              <Sticker
                label={previewLabel}
                product={rollProduct}
                machine={machine}
                operator={operator}
                site={site}
                shiftKind={shift === 'day' ? 'DAY' : 'NIGHT'}
              />
            </div>
            <button
              type="button"
              disabled={!ready}
              onClick={handlePrint}
              className="mt-4 w-full ctl-lg rounded-[8px] bg-[var(--ok)] hover:opacity-95 disabled:opacity-45 text-white font-bold t-lg inline-flex items-center justify-center gap-2.5 shadow-[var(--shadow-card)]"
            >
              <Printer className="size-5" />
              <span>{en.sticker.saveAndPrint}</span>
            </button>
          </PaperSheet>
        </div>
      </div>
    </div>
  );
}
