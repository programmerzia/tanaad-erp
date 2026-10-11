import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, History, Save, SkipForward } from 'lucide-react';
import type { Product, ShiftKind } from '@tanaad/domain';
import { yieldPct } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useRefList, useSite } from '@/app/hooks';
import { Avatar, Badge, Button, ChipGroup, Combobox, FormRow, Meter, Note, Sheet, cn, useIsTouch } from '@/components/ui';
import { PersonPicker } from '@/components/PersonPicker';
import { benchmarkFor, shiftId, shiftProgress, type MachineTile } from '@/data/selectors';
import { fmtDayLong, fmtKg, fmtNum, fmtTime } from '@/data/format';
import { REASON_AFTER_MIN, cap, kgPerPiece, perUnit, wallConfig } from './shared';
import { NumberFields, STATE, SetupHint, Swatch, type NumField } from './parts';

type FieldKey = 'good' | 'rejects' | 'kg' | 'inKg' | 'outKg' | 'downtime';
export interface ShiftEntryProps {
  tile: MachineTile | null; kind: ShiftKind; day: string; onClose: () => void;
  /** Digits typed on the wall before the sheet opened: they start the count. */
  typed?: string;
  /** Called after a save. `next` asks the caller to open the next unlogged machine. Without it the sheet just closes. */
  onSaved?: (machineId: string, next: boolean) => void;
  /** Another machine is still waiting for an entry, so "Save and next" makes sense. */
  hasNext?: boolean;
}

/**
 * Shift entry for one machine: who, what, the numbers, and a reason when the numbers need one. One sheet, no nested modals.
 * Give it a fresh `key` each time it opens so the form starts from the machine's own entry.
 */
export function ShiftEntrySheet(props: ShiftEntryProps) {
  return props.tile ? <EntrySheet {...props} tile={props.tile} /> : null;
}

function EntrySheet({ tile, kind, day, onClose, typed, onSaved, hasNext }: ShiftEntryProps & { tile: MachineTile }) {
  const s = useStore(); const site = useSite(); const cfg = wallConfig(site.id); const touch = useIsTouch();
  const record = useStore((x) => x.recordProduction);
  const entry = tile.entry; const main: FieldKey = cfg.kgMode === 'in_out' ? 'inKg' : 'good';
  const [operatorId, setOperatorId] = useState<string | null>(entry?.operatorId ?? null);
  const [productId, setProductId] = useState<string | null>(entry?.productId ?? null);
  const [reason, setReason] = useState<string | undefined>(entry?.downtimeReason);
  const [tried, setTried] = useState(false);
  const [vals, setVals] = useState<Record<FieldKey, string>>(() => {
    const e = entry; const v = (n?: number) => (n ? String(n) : '');
    const init = { good: v(e?.goodUnits), rejects: v(e?.rejectUnits), kg: v(e?.outputKg), inKg: v(e?.inputKg), outKg: v(e?.outputKg), downtime: v(e?.downtimeMin) };
    return typed ? { ...init, [main]: typed } : init;
  });

  const products: Product[] = useMemo(() => s.products.filter((p) => p.siteId === site.id && p.kind === cfg.productKind && (p.active !== false || p.id === entry?.productId)), [s.products, site.id, cfg.productKind]);
  const sh = shiftId(site.id, day, kind);
  // The last time this machine was logged: one press brings back the same operator and product.
  const last = useMemo(() => (entry ? undefined : [...s.production].filter((p) => p.machineId === tile.machine.id && p.stageCode === cfg.stage && p.shiftId !== sh && p.day <= day).sort((a, b) => b.day.localeCompare(a.day) || b.at.localeCompare(a.at))[0]), [s.production, tile.machine.id, cfg.stage, sh, day, entry]);
  const lastOperator = last ? s.people.find((p) => p.id === last.operatorId) : undefined; const lastProduct = last ? s.products.find((p) => p.id === last.productId) : undefined;

  const n = (k: FieldKey) => parseFloat(vals[k]) || 0;
  // Sack weight comes from the site's materials (the item priced per sack); without one the sacks are simply not counted.
  const sack = perUnit(useRefList('material'), 'sack')[0]; const sackKg = sack?.value ?? 0;
  const picked = products.find((p) => p.id === productId); const pieceKg = kgPerPiece(picked);
  const good = cfg.kgMode === 'in_out' ? (sackKg ? Math.floor(n('outKg') / sackKg) : 0) : n('good');
  // No scale at this stage: kilos are the count × the product's standard weight per piece. Rejects used material too.
  const inputKg = cfg.kgMode === 'estimate' ? Math.round((good + n('rejects')) * pieceKg) : cfg.kgMode === 'entered' ? n('kg') : n('inKg');
  const outputKg = cfg.kgMode === 'estimate' ? Math.round(good * pieceKg) : cfg.kgMode === 'entered' ? n('kg') : n('outKg');
  // Yield is watched against the site's allowed loss (Settings → rules).
  const yieldFloor = 100 - site.thresholds.massGapPct;
  const downtime = n('downtime');
  // Same arithmetic as the wall: the benchmark scaled to how much of the shift has run.
  const bench = benchmarkFor(s, tile.machine.id, productId ?? undefined);
  const due = bench ? Math.round(bench * shiftProgress(s.today, day, kind)) : undefined;
  const pct = due ? Math.round((good / due) * 100) : undefined;
  const floor = due ? Math.ceil((due * site.thresholds.benchmarkPct) / 100) : undefined;
  const belowBench = pct !== undefined && pct < site.thresholds.benchmarkPct;
  const needsReason = belowBench || downtime > REASON_AFTER_MIN;
  const hasNumbers = cfg.kgMode === 'in_out' ? n('inKg') > 0 && n('outKg') > 0 : n('good') > 0 || downtime > 0;
  const yieldNow = cfg.kgMode === 'in_out' && n('inKg') > 0 ? Math.round(yieldPct(n('inKg'), n('outKg')) * 10) / 10 : undefined;
  const missing: string[] = [];
  if (!operatorId) missing.push('operator'); if (!productId) missing.push(cfg.kgMode === 'in_out' ? 'grade' : 'product'); if (!hasNumbers) missing.push(cfg.kgMode === 'in_out' ? 'input and output kg' : `good ${cfg.unit}`); if (needsReason && !reason) missing.push('downtime reason');
  const canSave = missing.length === 0;

  const save = (next: boolean) => {
    setTried(true);
    if (!canSave) { useStore.getState().toast({ kind: 'warn', title: 'Not saved yet', detail: `Still needed: ${missing.join(', ')}` }); return; }
    record({ siteId: site.id, stageCode: cfg.stage, machineId: tile.machine.id, shiftId: sh, day, operatorId: operatorId ?? undefined, productId: productId ?? undefined, goodUnits: good, rejectUnits: cfg.kgMode === 'in_out' ? 0 : n('rejects'), inputKg, outputKg, downtimeMin: downtime, downtimeReason: reason });
    const prod = products.find((p) => p.id === productId);
    useStore.getState().toast({ kind: 'ok', title: `${tile.machine.code} logged`, detail: cfg.kgMode === 'in_out' ? `${fmtKg(inputKg)} in → ${fmtKg(outputKg)} out · ${yieldNow ?? 0}% yield` : `${fmtNum(good)} ${cfg.unit}${prod ? ` · ${prod.internalName}` : ''}${pct !== undefined ? ` · ${pct}% of what is due by now` : ''}` });
    if (onSaved) onSaved(tile.machine.id, next); else onClose();
  };

  const dueHint = due !== undefined ? <><span className="num text-[var(--text-2)]">{fmtNum(due)}</span> due by now · <span className="num">{fmtNum(bench ?? 0)}</span> for the full shift</> : productId ? 'No benchmark for this machine and product' : undefined;
  const downHint = downtime > REASON_AFTER_MIN ? <span className="text-[var(--warn)]">Over {REASON_AFTER_MIN} min: a reason is required</span> : 'Minutes the machine stood still';
  const fields: NumField<FieldKey>[] = cfg.kgMode === 'in_out'
    ? [{ key: 'inKg', label: 'Input', suffix: 'kg', required: true, hint: 'Washed scrap fed to the line' }, { key: 'outKg', label: 'Output', suffix: 'kg', required: true, hint: n('outKg') > 0 && sack ? <><span className="num text-[var(--text-2)]">{fmtNum(good)}</span> sacks of {sackKg} kg</> : 'Pellets bagged off the line' }, { key: 'downtime', label: 'Downtime', suffix: 'min', hint: downHint }]
    : cfg.kgMode === 'entered'
      ? [{ key: 'good', label: `Good ${cfg.unit}`, suffix: cfg.unit, required: true, hint: dueHint }, { key: 'rejects', label: 'Rejects', suffix: cfg.unit }, { key: 'kg', label: 'Film weight', suffix: 'kg', hint: 'Total weight of the rolls' }, { key: 'downtime', label: 'Downtime', suffix: 'min', hint: downHint }]
      : [{ key: 'good', label: `Good ${cfg.unit}`, suffix: cfg.unit, required: true, hint: dueHint }, { key: 'rejects', label: 'Rejects', suffix: cfg.unit, hint: good + n('rejects') > 0 ? <><span className="num">{(Math.round((n('rejects') / (good + n('rejects'))) * 1000) / 10).toFixed(1)}%</span> of pieces made</> : undefined }, { key: 'downtime', label: 'Downtime', suffix: 'min', hint: downHint }];

  const focusOperator = !touch && !typed && !entry;
  const st = STATE[tile.state];
  const swatch = (p: Product) => <span className="inline-flex items-center gap-1.5"><Swatch colour={p.colour} />{p.internalName}</span>;
  return (
    <Sheet open onClose={onClose} width={520} title={<span className="flex items-center gap-2">Shift entry<span className="text-[var(--text-3)] font-normal">·</span>{tile.machine.code}</span>} sub={`${cap(kind)} shift · ${fmtDayLong(day)} · ${cfg.sector}`}
      footer={<div className="w-full flex flex-wrap items-center justify-end gap-x-2 gap-y-1.5">
        <div className="flex-1 min-w-[150px] t-sm whitespace-nowrap">{canSave ? <span className="text-[var(--ok)] font-medium inline-flex items-center gap-1.5"><CheckCircle2 className="size-4" />Ready to save</span> : <span className={cn('block truncate', tried ? 'text-[var(--bad)] font-medium' : 'text-[var(--text-3)]')}>Still needed: {missing.join(', ')}</span>}</div>
        {hasNext && <Button icon={SkipForward} onClick={() => save(true)} hotkey="mod+shift+enter" hotkeyLabel="Save and open the next unlogged machine">Save and next</Button>}
        <Button variant="primary" icon={Save} onClick={() => save(false)} hotkey="mod+enter" hotkeyLabel="Save the shift entry">{entry ? 'Update entry' : 'Save entry'}</Button>
      </div>}>
      <div className="flex flex-col gap-3 pb-1">
        {/* Where this machine stands right now */}
        {/* On a tablet the sheet opens on this line, not inside the worker search, so the keypad is not covered by a list. */}
        <div tabIndex={touch ? -1 : undefined} data-autofocus={touch ? '' : undefined} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 t-sm text-[var(--text-2)] outline-none">
          <Badge tone={st.tone} dot>{st.label}</Badge>
          {entry ? <span>Logged at <span className="num">{fmtTime(entry.at)}</span>. Saving again replaces that entry.</span> : tile.state === 'down' ? <span>Reported to the mechanic. Log what ran before it stopped.</span> : <span>No entry yet for this shift.</span>}
        </div>
        {last && (lastOperator || lastProduct) && (
          <div className="flex items-center gap-2.5 rounded-md border border-[var(--line)] bg-[var(--surface-2)] pl-2.5 pr-1.5 py-1.5">
            <History className="size-4 text-[var(--text-3)] shrink-0" />
            <div className="min-w-0 flex-1 t-sm leading-snug">
              <div className="text-[var(--text-3)]">Last logged {fmtDayLong(last.day).split(',')[0]} {last.shiftId.endsWith('night') ? 'night' : 'day'}</div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-medium">{lastOperator && <span className="inline-flex items-center gap-1.5"><Avatar name={lastOperator.fullName} seed={lastOperator.avatarSeed} size={16} />{lastOperator.fullName}</span>}{lastProduct && <span className="inline-flex items-center gap-1.5"><Swatch colour={lastProduct.colour} />{lastProduct.internalName}</span>}</div>
            </div>
            <Button size="sm" onClick={() => { if (lastOperator) setOperatorId(lastOperator.id); if (lastProduct && products.some((p) => p.id === lastProduct.id)) setProductId(lastProduct.id); }}>Use same</Button>
          </div>
        )}

        <section>
          <div className="t-label mb-0.5">1 · Who and what</div>
          <FormRow label="Operator" required hint={`${cfg.sector} workers are listed first`}>
            <PersonPicker siteId={site.id} sector={cfg.sector} value={operatorId} onChange={(id) => setOperatorId(id)} autoFocus={focusOperator} />
          </FormRow>
          <FormRow label={cfg.kgMode === 'in_out' ? 'Grade' : 'Product'} required>
            {products.length === 0 ? <SetupHint inline what={cfg.kgMode === 'in_out' ? 'pellet grades' : 'products'} where="Products" />
              : products.length <= 6 ? <ChipGroup ariaLabel="Product" value={productId} onChange={setProductId} options={products.map((p) => ({ value: p.id, label: swatch(p) }))} />
                : <Combobox value={productId} onChange={setProductId} placeholder="Search product" options={products.map((p) => ({ value: p.id, label: p.internalName, left: <Swatch colour={p.colour} /> }))} />}
          </FormRow>
        </section>

        <section>
          <div className="t-label mb-0.5">2 · The numbers</div>
          <NumberFields fields={fields} values={vals} onChange={(k, v) => setVals((x) => ({ ...x, [k]: v }))} activeKey={main} autoFocusKey={touch || focusOperator ? null : main} />
        </section>

        {/* Live check: the same arithmetic the wall will show after saving */}
        <section className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
          {cfg.kgMode === 'in_out' ? (
            <div className="flex items-center gap-4">
              <div className="shrink-0 w-[92px]"><div className={cn('num t-kpi', yieldNow === undefined ? 'text-[var(--text-4)]' : yieldNow < yieldFloor ? 'text-[var(--warn)]' : 'text-[var(--ok)]')}>{yieldNow !== undefined ? `${yieldNow}%` : '—'}</div><div className="t-xs text-[var(--text-3)]">yield</div></div>
              <div className="flex-1 min-w-0">
                <Meter label="Output of input" value={n('outKg')} max={Math.max(n('inKg'), n('outKg'), 1)} tone={yieldNow !== undefined && yieldNow < yieldFloor ? 'warn' : 'ok'} display={<>{fmtNum(n('outKg'))}<span className="text-[var(--text-3)] font-normal"> / {fmtNum(n('inKg'))} kg</span></>} />
                <div className="t-xs text-[var(--text-3)]">{n('inKg') > 0 && n('outKg') > 0 ? <>Process loss <span className="num">{fmtKg(Math.max(0, Math.round(n('inKg') - n('outKg'))))}</span> · {yieldNow !== undefined && yieldNow < yieldFloor ? `below ${yieldFloor}%, the floor set by the allowed loss` : `within the allowed loss of ${site.thresholds.massGapPct}%`}</> : 'Yield is output divided by input.'}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="shrink-0 w-[92px]"><div className={cn('num t-kpi', pct === undefined ? 'text-[var(--text-4)]' : belowBench ? 'text-[var(--bad)]' : 'text-[var(--ok)]')}>{pct !== undefined ? `${pct}%` : '—'}</div><div className="t-xs text-[var(--text-3)]">of due by now</div></div>
              <div className="flex-1 min-w-0">
                {due !== undefined
                  ? <Meter label={`Good ${cfg.unit}`} value={good} max={Math.max(due, good, 1)} tone={belowBench ? 'bad' : 'ok'} display={<>{fmtNum(good)}<span className="text-[var(--text-3)] font-normal"> / {fmtNum(due)} due</span></>} />
                  : <div className="t-sm text-[var(--text-2)] py-1">{productId ? 'No benchmark is set for this machine and product, so the entry is recorded without a target.' : 'Pick the product to see what is due by now.'}</div>}
                <div className="t-xs text-[var(--text-3)]">{floor !== undefined && <>Minimum {site.thresholds.benchmarkPct}% is <span className="num">{fmtNum(floor)}</span> · </>}{cfg.kgMode === 'estimate' ? (picked ? <>Estimated at <span className="num">{(Math.round(pieceKg * 100) / 100).toLocaleString()}</span> kg a piece: </> : 'Estimated ') : 'Film '}<span className="num">{fmtNum(inputKg)}</span> kg in → <span className="num">{fmtNum(outputKg)}</span> kg out</div>
              </div>
            </div>
          )}
        </section>

        {(needsReason || downtime > 0) && (
          <section>
            <div className="t-label mb-0.5 flex items-center gap-1.5">3 · Why{needsReason && <AlertTriangle className="size-3.5 text-[var(--warn)]" />}</div>
            {needsReason && <Note tone={tried && !reason ? 'bad' : 'warn'} className="mb-1">{belowBench && <>Below {site.thresholds.benchmarkPct}% of what is due by now. </>}{downtime > REASON_AFTER_MIN && <>More than {REASON_AFTER_MIN} minutes of downtime. </>}The entry cannot be saved without a reason.</Note>}
            <FormRow label="Downtime reason" required={needsReason} hint={needsReason ? undefined : `Optional up to ${REASON_AFTER_MIN} minutes`}>
              {site.downtimeReasons.length === 0 ? <SetupHint inline what="downtime reasons" />
                : site.downtimeReasons.length <= 8 ? <ChipGroup ariaLabel="Downtime reason" value={reason ?? null} onChange={setReason} options={site.downtimeReasons.map((r) => ({ value: r, label: r }))} />
                  : <Combobox value={reason ?? null} onChange={(v) => setReason(v ?? undefined)} placeholder="Search reason" clearable options={site.downtimeReasons.map((r) => ({ value: r, label: r }))} />}
            </FormRow>
          </section>
        )}
      </div>
    </Sheet>
  );
}
