import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import type { Label } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite } from '@/app/hooks';
import { currentShiftKind, machinesOf } from '@/data/selectors';
import { fmtKg } from '@/data/format';
import { printer } from '@/devices';
import { Sticker } from '@/components/Sticker';
import { RollSticker } from '@/features/bags/RollSticker';
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
 * Print a sticker:
 *  - At the Bags factory, shows the 6-field Roll Sticker screen.
 *  - At Mats or Recycling, prints a Bundle or Pellet Sack sticker with product, weight and store zone.
 */
export function PrintLabel() {
  const s = useStore();
  const site = useSite();
  const { saved, showSaved, clearSaved } = useSavedBanner();

  const products = useMemo(
    () => s.products.filter((p) => p.siteId === site.id && p.kind !== 'material'),
    [s.products, site.id],
  );
  const zones = useMemo(
    () => s.zones.filter((z) => z.siteId === site.id),
    [s.zones, site.id],
  );
  const machines = useMemo(
    () => machinesOf(s, site.id).filter((m) => m.status === 'active'),
    [s, site.id],
  );

  const [productId, setProductId] = useState<string>(products[0]?.id ?? '');
  const [zoneId, setZoneId] = useState<string>(zones[0]?.id ?? '');
  const [machineId] = useState<string>(machines[0]?.id ?? '');
  const product = products.find((p) => p.id === productId);
  const [kgStr, setKgStr] = useState<string>(
    product?.stdBundleWeightKg ? String(product.stdBundleWeightKg) : '18',
  );

  if (site.id === 'bags') {
    return <RollSticker />;
  }

  const weightKg = Number(kgStr) || 0;
  const zone = zones.find((z) => z.id === zoneId);
  const machine = machines.find((m) => m.id === machineId);
  const shiftKind = currentShiftKind();
  const ready = Boolean(product) && Boolean(zone) && weightKg > 0;

  const previewLabel: Label = {
    id: 'preview-bundle',
    code: `${site.id.toUpperCase().slice(0, 3)}-BUN-${String(s.labels.length + 1).padStart(6, '0')}`,
    siteId: site.id,
    kind: site.id === 'recycling' ? 'sack' : 'bundle',
    stageCode: site.id === 'recycling' ? 'pelletise' : 'finish',
    productId: product?.id,
    machineId: machine?.id,
    day: s.today,
    qtyUnits: product?.bundlePieces ?? 1,
    qtyKg: weightKg,
    colour: product?.colour,
    status: 'in_stock',
    zoneId: zone?.id,
    parentIds: [],
  };

  const handlePrint = async () => {
    if (!ready || !product || !zone) return;
    const label = s.createLabel({
      siteId: site.id,
      kind: site.id === 'recycling' ? 'sack' : 'bundle',
      stageCode: site.id === 'recycling' ? 'pelletise' : 'finish',
      productId: product.id,
      machineId: machine?.id,
      day: s.today,
      qtyUnits: product.bundlePieces,
      qtyKg: weightKg,
      colour: product.colour,
      status: 'in_stock',
      zoneId: zone.id,
      parentIds: [],
    });
    await printer.print({
      code: label.code,
      lines: [
        `PRODUCT: ${product.internalName}`,
        `KG: ${weightKg}`,
        `ZONE: ${zone.name}`,
      ],
    });
    showSaved(`Sticker ${label.code} saved and printed`, {
      detail: `${product.internalName} · ${fmtKg(weightKg)} · ${zone.name}`,
      onUndo: () => {
        s.consumeLabel(label.id);
      },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <SavedBanner info={saved} onDismiss={clearSaved} />

      <div className="paper-sheet p-5">
        <div className="t-sm font-semibold text-[var(--text-2)]">{site.name}</div>
        <h1 className="t-title text-[var(--text)] mt-0.5">{en.sticker.bundleTitle}</h1>
        <p className="t-base text-[var(--text-2)] mt-1">{en.sticker.bundleSubtitle}</p>
      </div>

      {product?.weightStatus === 'to_be_measured' && (
        <StatusNotice tone="warn" title={en.app.toBeConfirmed}>
          Standard bundle weight for {product.internalName} ({product.stdBundleWeightKg} kg) is
          still to be confirmed on the factory scale.
        </StatusNotice>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <PaperSheet
          title="Sticker details"
          subtitle="Pick the product, store room and weight, then print."
        >
          <div className="flex flex-col gap-5">
            <div>
              <div className="t-base font-bold text-[var(--text)] mb-2">1. Product</div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {products.map((p) => (
                  <ChoiceButton
                    key={p.id}
                    selected={productId === p.id}
                    colourSwatch={p.colour ?? '#666'}
                    title={p.internalName}
                    subtitle={`${p.bundlePieces} pieces · ${p.stdBundleWeightKg} kg${p.weightStatus === 'to_be_measured' ? ' (to be confirmed)' : ''}`}
                    onClick={() => {
                      setProductId(p.id);
                      if (p.stdBundleWeightKg) setKgStr(String(p.stdBundleWeightKg));
                    }}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="t-base font-bold text-[var(--text)] mb-2">2. Store room</div>
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

            <div>
              <div className="t-base font-bold text-[var(--text)] mb-2">3. Weight (kg)</div>
              <LargeKeypad
                value={kgStr}
                onChange={setKgStr}
                allowDecimal
                unit="kg"
              />
            </div>
          </div>
        </PaperSheet>

        <div className="lg:sticky lg:top-[84px]">
          <PaperSheet title="Sticker preview" subtitle="Printed with barcode and QR code">
            <div className="flex justify-center py-2">
              <Sticker
                label={previewLabel}
                product={product}
                machine={machine}
                site={site}
                shiftKind={shiftKind.toUpperCase()}
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
