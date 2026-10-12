import { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, Minus, Plus } from 'lucide-react';
import type { Product } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite } from '@/app/hooks';
import { stockByProduct } from '@/data/selectors';
import { fmtDayShort, fmtNum } from '@/data/format';
import { cn } from '@/components/ui';
import {
  ChoiceButton,
  PaperSheet,
  SavedBanner,
  StatusNotice,
  useSavedBanner,
} from '@/components/simple';
import { en } from '@/i18n/en';
import { takePresetZone } from './shared';
import { unitWords } from './kit';

interface CountLine {
  product: Product;
  system: number;
}

/**
 * Storekeeper · Count the store:
 * Pick a store room, count what is on the floor, and save.
 */
export function StockCount() {
  const s = useStore();
  const site = useSite();
  const { saved, showSaved, clearSaved } = useSavedBanner();

  const zones = s.zones.filter((z) => z.siteId === site.id);
  const [zoneId, setZoneId] = useState<string>(zones[0]?.id ?? '');
  const [counted, setCounted] = useState<Record<string, number>>({});

  useEffect(() => {
    const z = takePresetZone();
    if (z) setZoneId(z);
  }, []);

  const words = unitWords(site.id);
  const unit = words.many;

  const stock = stockByProduct(s, site.id);
  const lines: CountLine[] = useMemo(() => {
    return stock
      .map((r) => ({
        product: r.product,
        system: r.zones.get(zoneId) ?? 0,
      }))
      .filter((x) => x.system > 0)
      .sort((a, b) => b.system - a.system);
  }, [stock, zoneId]);

  // Initialize counted values to expected system numbers when switching zones so user can adjust with -/+
  useEffect(() => {
    const next: Record<string, number> = {};
    for (const l of lines) {
      next[l.product.id] = l.system;
    }
    setCounted(next);
  }, [zoneId, lines.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const zone = zones.find((z) => z.id === zoneId);
  const systemInZone = (zid: string) =>
    stock.reduce((sum, r) => sum + (r.zones.get(zid) ?? 0), 0);

  const setLineCount = (pid: string, val: number) => {
    setCounted((prev) => ({
      ...prev,
      [pid]: Math.max(0, Math.min(99999, val)),
    }));
  };

  const handleSaveCount = () => {
    if (!zoneId || lines.length === 0) return;
    let diffs = 0;
    for (const line of lines) {
      const c = counted[line.product.id] ?? line.system;
      if (c !== line.system) diffs++;
      s.recordStockCount({
        siteId: site.id,
        zoneId,
        day: s.today,
        productId: line.product.id,
        countedBundles: c,
        systemBundles: line.system,
      });
    }
    showSaved(
      diffs === 0
        ? `Store count saved for ${zone?.name ?? 'Store'} — all items match`
        : `Store count saved for ${zone?.name ?? 'Store'} (${diffs} difference${diffs === 1 ? '' : 's'} flagged)`,
      {
        detail: `${lines.length} products counted and recorded permanently.`,
      },
    );
  };

  const history = s.stockCounts
    .filter((c) => c.siteId === site.id)
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="flex flex-col gap-5 max-w-[860px] mx-auto">
      <SavedBanner info={saved} onDismiss={clearSaved} />

      <div className="paper-sheet p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="t-sm font-semibold text-[var(--text-2)]">
            {site.name} · Storekeeper
          </div>
          <h1 className="t-title text-[var(--text)] mt-0.5">
            {en.stock.countTitle}
          </h1>
          <p className="t-base text-[var(--text-2)] mt-0.5">
            {en.stock.countSubtitle}
          </p>
        </div>
      </div>

      {/* Step 1: Pick store room */}
      <PaperSheet
        title={`1. ${en.stock.pickZone}`}
        subtitle="Tap the store room you are counting right now."
      >
        <div className="grid gap-2.5 sm:grid-cols-3">
          {zones.map((z) => (
            <ChoiceButton
              key={z.id}
              selected={z.id === zoneId}
              title={z.name}
              subtitle={`${fmtNum(systemInZone(z.id))} ${unit} expected`}
              onClick={() => setZoneId(z.id)}
            />
          ))}
        </div>
      </PaperSheet>

      {/* Step 2: Count each product on the paper sheet */}
      <PaperSheet
        title={`2. Count each product in ${zone?.name ?? 'this store room'}`}
        subtitle={`Tap − or + if the floor count is different from what should be there.`}
        pad={false}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="t-base text-[var(--text-2)]">
              {lines.length} products in {zone?.name ?? 'this room'}
            </span>
            <button
              type="button"
              disabled={lines.length === 0}
              onClick={handleSaveCount}
              className="ctl-lg px-6 rounded-[8px] bg-[var(--ok)] hover:opacity-95 disabled:opacity-45 text-white font-bold t-lg inline-flex items-center gap-2.5 shadow-[var(--shadow-card)]"
            >
              <CheckCircle2 className="size-5" />
              <span>{en.stock.saveCount}</span>
            </button>
          </div>
        }
      >
        {lines.length === 0 ? (
          <div className="p-5">
            <StatusNotice tone="info" title="No stock expected in this room">
              Pick another store room above to count its stock.
            </StatusNotice>
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {lines.map((line) => {
              const cVal = counted[line.product.id] ?? line.system;
              const diff = cVal - line.system;
              return (
                <div
                  key={line.product.id}
                  className="px-4 sm:px-5 py-4 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-[200px] flex-1">
                    <span
                      className="size-6 rounded-[6px] border border-black/15 shrink-0"
                      style={{ background: line.product.colour ?? '#888' }}
                    />
                    <div>
                      <div className="t-lg font-bold text-[var(--text)]">
                        {line.product.internalName}
                      </div>
                      <div className="t-sm text-[var(--text-2)] num">
                        Expected in store: <b>{fmtNum(line.system)}</b> {unit}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      aria-label={`Decrease count for ${line.product.internalName}`}
                      onClick={() => setLineCount(line.product.id, cVal - 1)}
                      className="size-12 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface-2)] hover:bg-[var(--hover)] grid place-items-center text-[var(--text)] font-bold"
                    >
                      <Minus className="size-5" />
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label={`Counted ${line.product.internalName}`}
                      value={cVal}
                      onChange={(e) =>
                        setLineCount(
                          line.product.id,
                          Number(e.target.value.replace(/\D/g, '')) || 0,
                        )
                      }
                      className="w-[88px] h-12 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] text-center t-lg font-bold num"
                    />
                    <button
                      type="button"
                      aria-label={`Increase count for ${line.product.internalName}`}
                      onClick={() => setLineCount(line.product.id, cVal + 1)}
                      className="size-12 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface-2)] hover:bg-[var(--hover)] grid place-items-center text-[var(--text)] font-bold"
                    >
                      <Plus className="size-5" />
                    </button>
                  </div>

                  <div className="min-w-[120px] text-right">
                    {diff === 0 ? (
                      <span className="px-3 py-1.5 rounded-[8px] bg-[var(--ok-bg)] text-[var(--ok)] t-sm font-bold inline-flex items-center gap-1">
                        <Check className="size-4 stroke-[3]" /> Matches
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'px-3 py-1.5 rounded-[8px] t-sm font-bold num inline-block',
                          diff < 0
                            ? 'bg-[var(--bad-bg)] text-[var(--bad)]'
                            : 'bg-[var(--warn-bg)] text-[var(--warn)]',
                        )}
                      >
                        {diff > 0 ? `+${diff} over` : `${diff} short`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PaperSheet>

      {/* Past counts kept forever */}
      {history.length > 0 && (
        <PaperSheet
          title="Recent store counts"
          subtitle="Every count is kept permanently with the storekeeper's name."
          pad={false}
        >
          <div className="divide-y divide-[var(--line)]">
            {history.slice(0, 6).map((c) => {
              const prod = s.products.find((p) => p.id === c.productId);
              const z = zones.find((x) => x.id === c.zoneId);
              const d = c.countedBundles - c.systemBundles;
              return (
                <div
                  key={c.id}
                  className="px-5 py-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="t-base font-bold">
                      {prod?.internalName ?? 'Product'} ·{' '}
                      <span className="font-normal text-[var(--text-2)]">
                        {z?.name}
                      </span>
                    </div>
                    <div className="t-xs text-[var(--text-3)] num">
                      {fmtDayShort(c.day)} · Counted {c.countedBundles} vs{' '}
                      {c.systemBundles} expected
                    </div>
                  </div>
                  <span
                    className={cn(
                      'px-2.5 py-1 rounded-[6px] t-xs font-bold num',
                      d === 0
                        ? 'bg-[var(--ok-bg)] text-[var(--ok)]'
                        : 'bg-[var(--bad-bg)] text-[var(--bad)]',
                    )}
                  >
                    {d === 0 ? 'Matched ✓' : `${d > 0 ? '+' : ''}${d}`}
                  </span>
                </div>
              );
            })}
          </div>
        </PaperSheet>
      )}
    </div>
  );
}
