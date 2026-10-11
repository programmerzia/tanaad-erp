import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MutableRefObject, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, ClipboardList, KeyRound, PackageCheck, Repeat, RotateCcw, ScanLine, Send, Share2, ShieldAlert, ShieldCheck, Siren, Undo2, Weight, XCircle, Zap } from 'lucide-react';
import type { Dispatch, Order, Product } from '@tanaad/domain';
import { gateDecision } from '@tanaad/domain';
import { useStore, type AppState } from '@/data/store';
import { useSite, useSiteSettings } from '@/app/hooks';
import { usePrefs } from '@/app/prefs';
import { Badge, Bar, Button, DataGrid, Dialog, Field, Gauge, IconButton, Input, Kbd, Note, Panel, PinPad, Sheet, cn, useHotkey, useIsTouch, useMedia, type Column } from '@/components/ui';
import { ScaleWidget } from '@/components/ScaleWidget';
import { WhatsAppPreview } from '@/components/WhatsAppPreview';
import { messaging } from '@/devices';
import { fmtDayShort, fmtKg, fmtNum, fmtPct, fmtTime } from '@/data/format';
import { CaptureTile, Fact, IconChip, ProductName, gatePassNo, pressUseReading, useBeep } from './shared';

/* ------------------------------------------------------------------ manifest */
export interface ManifestLine { product: Product; ordered: number; scanned: number; remaining: number; std: number; expectedKg: number; inStock: number }
export function manifestLines(s: AppState, order: Order, dispatch?: Dispatch): ManifestLine[] {
  const scanned = new Set(dispatch?.scannedLabelIds ?? []);
  return order.lines.map((l) => {
    const product = s.products.find((p) => p.id === l.productId)!;
    let have = 0, inStock = 0;
    for (const lab of s.labels) { if (lab.productId !== l.productId) continue; if (scanned.has(lab.id)) have++; if (lab.siteId === order.siteId && lab.status === 'in_stock') inStock++; }
    return { product, ordered: l.bundles, scanned: have, remaining: Math.max(0, l.bundles - have), std: product.stdBundleWeightKg, expectedKg: l.bundles * product.stdBundleWeightKg, inStock };
  });
}

/** One row per order line. "plan" shows what the store holds before loading starts; "load" shows scanning progress. */
export function ManifestTable({ lines, mode, locked, onScan }: { lines: ManifestLine[]; mode: 'plan' | 'load'; locked?: boolean; onScan?: (productId: string) => void }) {
  const narrow = useMedia('(max-width: 639px)');
  const ordered = lines.reduce((t, l) => t + l.ordered, 0); const scanned = lines.reduce((t, l) => t + l.scanned, 0); const expected = lines.reduce((t, l) => t + l.expectedKg, 0);
  const progress = (l: { scanned: number; ordered: number }, wide = true) => (
    <span className="inline-flex items-center gap-2 justify-end">
      {wide && <Bar value={l.scanned} max={l.ordered} tone={l.scanned >= l.ordered ? 'ok' : 'series'} className="w-[72px] xl:w-[96px]" />}
      <span className={cn('num font-semibold min-w-[30px] text-right', l.scanned >= l.ordered ? 'text-[var(--ok)]' : l.scanned === 0 && 'text-[var(--text-3)]')}>{l.scanned}</span>
    </span>
  );
  const stock = (l: ManifestLine) => <span className="inline-flex items-center gap-1.5 justify-end"><span className="num">{fmtNum(l.inStock)}</span>{l.inStock < l.ordered && <Badge tone="bad">short by {l.ordered - l.inStock}</Badge>}</span>;
  const weight = (l: ManifestLine) => <span className="inline-flex items-center gap-1.5 justify-end"><span className="num">{fmtKg(l.std)}</span>{l.product.weightStatus === 'to_be_measured' && <Badge tone="warn">to be measured</Badge>}</span>;
  const scanBtn = (l: ManifestLine) => <IconButton icon={ScanLine} label={`Scan one ${l.product.internalName}`} disabled={locked || l.remaining === 0} onClick={() => onScan?.(l.product.id)} className="compact:ctl-sm" />;
  const columns: Column<ManifestLine>[] = narrow
    ? [
      { key: 'p', header: 'Product', wrap: true, cell: (l) => <div className="py-1"><ProductName product={l.product} /><div className="t-sm text-[var(--text-3)]">{fmtKg(l.std)} a bundle{l.product.weightStatus === 'to_be_measured' ? ', to be measured' : ''} · {fmtNum(Math.round(l.expectedKg))} kg</div></div> },
      mode === 'load'
        ? { key: 's', header: 'Scanned', align: 'right', cell: (l) => <div><span className={cn('num font-semibold', l.scanned >= l.ordered && 'text-[var(--ok)]')}>{l.scanned}</span><span className="num text-[var(--text-3)]"> / {l.ordered}</span><Bar value={l.scanned} max={l.ordered} tone={l.scanned >= l.ordered ? 'ok' : 'series'} height={4} className="mt-1 min-w-[72px]" /></div> }
        : { key: 's', header: 'Ordered / in stock', align: 'right', cell: (l) => <span className="num"><span className="font-semibold">{l.ordered}</span><span className={l.inStock < l.ordered ? 'text-[var(--bad)]' : 'text-[var(--text-3)]'}> / {fmtNum(l.inStock)}</span></span> },
      ...(mode === 'load' ? [{ key: 'a', header: '', align: 'right' as const, width: 48, cell: scanBtn }] : []),
    ]
    : [
      { key: 'p', header: 'Product', cell: (l) => <ProductName product={l.product} sub={`×${l.product.bundlePieces} pcs`} /> },
      { key: 'o', header: 'Ordered', align: 'right', mono: true, cell: (l) => l.ordered },
      mode === 'load' ? { key: 's', header: 'Scanned', align: 'right', cell: (l) => progress(l) } : { key: 's', header: 'In stock', align: 'right', cell: stock },
      { key: 'w', header: 'Bundle weight', align: 'right', cell: weight },
      { key: 'e', header: 'Expected kg', align: 'right', mono: true, cell: (l) => fmtNum(Math.round(l.expectedKg)) },
      ...(mode === 'load' ? [{ key: 'a', header: '', align: 'right' as const, width: 44, cell: scanBtn }] : []),
    ];
  const footer = narrow
    ? <tr><td>Total · <span className="num">{fmtNum(Math.round(expected))} kg</span></td><td className="text-right num">{mode === 'load' ? `${scanned} / ${ordered}` : ordered}</td>{mode === 'load' && <td />}</tr>
    : <tr><td>Total</td><td className="text-right num">{ordered}</td><td className="text-right">{mode === 'load' ? progress({ scanned, ordered }) : <span className="num">{fmtNum(lines.reduce((t, l) => t + l.inStock, 0))}</span>}</td><td /><td className="text-right num">{fmtNum(Math.round(expected))}</td>{mode === 'load' && <td />}</tr>;
  return <DataGrid bare rows={lines} columns={columns} rowKey={(l) => l.product.id} footer={footer} />;
}

/* ------------------------------------------------------------------ small local pieces */
interface FeedItem { id: number; code: string; kind: 'ok' | 'bad' | 'undo'; msg: string; at: string }
/** The store's messages repeat the label code; the feed already shows it in its own column. */
const feedText = (code: string, msg: string) => (msg.startsWith(`${code} · `) ? msg.slice(code.length + 3) : msg.endsWith(code) ? msg.slice(0, -code.length).replace(/[:\s]+$/, '') : msg.startsWith(`${code} `) ? msg.slice(code.length + 1) : msg);

function CheckRow({ state, title, value }: { state: 'ok' | 'bad' | 'warn' | 'wait'; title: ReactNode; value: ReactNode }) {
  const color = state === 'ok' ? 'var(--ok)' : state === 'bad' ? 'var(--bad)' : state === 'warn' ? 'var(--warn)' : 'var(--text-3)';
  return (
    <div className="flex items-center gap-2.5 py-1.5 border-b border-[var(--line)] last:border-b-0">
      <IconChip size="sm" icon={state === 'ok' ? CheckCircle2 : state === 'bad' ? XCircle : state === 'warn' ? AlertTriangle : CircleDashed} color={color} />
      <span className="t-base flex-1 min-w-0">{title}</span>
      <span className="num t-sm font-medium whitespace-nowrap" style={{ color: state === 'wait' ? 'var(--text-3)' : color }}>{value}</span>
    </div>
  );
}

function OverrideForm({ dn, reason, setReason, onPin, error }: { dn: string; reason: string; setReason: (v: string) => void; onPin: (pin: string) => void; error: string | null }) {
  const input = useRef<HTMLInputElement>(null); const pinBox = useRef<HTMLDivElement>(null);
  // PinPad focuses itself on mount; the reason comes first, so take the focus back.
  useEffect(() => { input.current?.focus(); }, []);
  const toPin = () => pinBox.current?.querySelector<HTMLElement>('[tabindex]')?.focus();
  return (
    <div>
      <Note tone="bad" className="mb-3">{dn} failed the gate arithmetic. An override is permanent, carries your name and is visible to both CEOs. Use it only when the reason is clear.</Note>
      <Field label="Reason" required hint={<span className="touch:hidden">Enter moves on to the PIN.</span>}>
        <Input ref={input} value={reason} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && reason.trim()) { e.preventDefault(); toPin(); } }} placeholder="What was checked, and why the lorry may leave" />
      </Field>
      <div className="h-3" />
      <div ref={pinBox} className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] py-3"><PinPad onSubmit={onPin} title="Site Manager PIN" error={error} /></div>
    </div>
  );
}

/* ------------------------------------------------------------------ the builder */
export interface CargoActions { weigh?: () => void }

/** The Cargo Builder: scan every bundle, weigh the lorry, let the arithmetic decide. */
export function CargoBuilder({ dispatch, order, onLoadNext, actions }: { dispatch: Dispatch; order: Order; onLoadNext: () => void; actions?: MutableRefObject<CargoActions> }) {
  const s = useStore(); const site = useSite(); const beep = useBeep(); const touch = useIsTouch();
  const scanBundle = useStore((x) => x.scanBundle); const unscanLast = useStore((x) => x.unscanLast); const recordGateWeight = useStore((x) => x.recordGateWeight); const overrideGate = useStore((x) => x.overrideGate); const toast = useStore((x) => x.toast);
  const client = s.clients.find((c) => c.id === order.clientId);
  const ceos = s.users.filter((u) => u.roles.some((r) => r.role === 'ceo')).map((u) => u.name.split(' ')[0]);
  const locked = dispatch.gateStatus === 'pass' || dispatch.gateStatus === 'overridden';
  const tol = useSiteSettings()?.gateTolerancePct ?? site.thresholds.gateTolerancePct;

  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null); const flashT = useRef<number | undefined>(undefined);
  const [feed, setFeed] = useState<FeedItem[]>([]); const feedSeq = useRef(0);
  const [typed, setTyped] = useState(''); const [focused, setFocused] = useState(false);
  const [missing10, setMissing10] = useState(false);
  const [recounting, setRecounting] = useState(false);
  const [scaleRun, setScaleRun] = useState(0);
  const [overrideOpen, setOverrideOpen] = useState(false); const [overrideReason, setOverrideReason] = useState(''); const [pinError, setPinError] = useState<string | null>(null);
  const [waOpen, setWaOpen] = useState(false); const [waSent, setWaSent] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null); const gateRef = useRef<HTMLDivElement>(null); const verdictRef = useRef<HTMLElement>(null);

  const labelById = useMemo(() => new Map(s.labels.map((l) => [l.id, l])), [s.labels]);
  const scannedLabels = dispatch.scannedLabelIds.map((id) => labelById.get(id)).filter((l): l is NonNullable<typeof l> => !!l);
  const lines = manifestLines(s, order, dispatch);
  const ordered = lines.reduce((t, l) => t + l.ordered, 0); const scanned = scannedLabels.length;
  const scannedKg = scannedLabels.reduce((t, l) => t + l.qtyKg, 0);
  const lightest = Math.min(...lines.map((l) => l.std));
  const complete = scanned === ordered && ordered > 0;

  // Simulated lorry: the real weight of what is on it (±0.6 % scale noise), minus 10 bundles if the presenter toggles the fraud case.
  const noise = useMemo(() => 1 + (Math.random() * 1.2 - 0.6) / 100, [scanned, missing10]); // eslint-disable-line react-hooks/exhaustive-deps
  const targetKg = Math.max(0, Math.round((scannedKg - (missing10 ? 10 * lightest : 0)) * noise));

  /** The scan field owns the keyboard on a desk: a hardware scanner types into it and presses Enter. */
  const refocus = useCallback(() => { if (!touch) scanRef.current?.focus({ preventScroll: true }); }, [touch]);
  useEffect(() => { if (!locked && dispatch.gateStatus !== 'hold') refocus(); }, [dispatch.id, locked, refocus]); // eslint-disable-line react-hooks/exhaustive-deps

  const pulse = useCallback((kind: 'ok' | 'bad') => { setFlash(null); window.clearTimeout(flashT.current); requestAnimationFrame(() => { setFlash(kind); flashT.current = window.setTimeout(() => setFlash(null), kind === 'ok' ? 600 : 500); }); beep(kind); }, [beep]);
  useEffect(() => () => window.clearTimeout(flashT.current), []);
  const push = (code: string, kind: FeedItem['kind'], msg: string) => setFeed((f) => [{ id: ++feedSeq.current, code, kind, msg, at: new Date().toISOString() }, ...f].slice(0, 200));

  const doScan = useCallback((code: string) => {
    const r = scanBundle(dispatch.id, code); push(code, r.ok ? 'ok' : 'bad', r.message); pulse(r.ok ? 'ok' : 'bad');
    if (!r.ok) toast({ kind: 'error', title: 'Scan rejected', detail: r.message });
    return r.ok;
  }, [dispatch.id, scanBundle, pulse, toast]);

  /** Next bundle physically in stock for a product still short on the manifest (simulates pointing the scanner at the pile). */
  const nextCode = (productId?: string) => {
    const st = useStore.getState(); const d = st.dispatches.find((x) => x.id === dispatch.id)!; const taken = new Set(d.scannedLabelIds);
    for (const l of order.lines) {
      if (productId && l.productId !== productId) continue;
      const have = d.scannedLabelIds.filter((id) => st.labels.find((x) => x.id === id)?.productId === l.productId).length; if (have >= l.bundles) continue;
      const lab = st.labels.find((x) => x.siteId === site.id && x.productId === l.productId && x.status === 'in_stock' && !taken.has(x.id)); if (lab) return lab.code;
    }
    return undefined;
  };
  const scanNext = (productId?: string) => { refocus(); const code = nextCode(productId); if (!code) { const d = useStore.getState().dispatches.find((x) => x.id === dispatch.id)!; toast({ kind: 'warn', title: d.scannedLabelIds.length >= ordered ? 'Manifest complete' : 'No more bundles in stock for this order' }); pulse('bad'); return false; } return doScan(code); };
  const scanTen = () => { let i = 0; const tick = () => { if (i++ >= 10) return; if (scanNext()) window.setTimeout(tick, 70); }; tick(); };
  const scanSameAgain = () => { refocus(); const last = scannedLabels.at(-1); if (!last) { toast({ kind: 'warn', title: 'Nothing scanned yet' }); return; } doScan(last.code); };
  const undo = () => { refocus(); const last = scannedLabels.at(-1); if (!last) return; unscanLast(dispatch.id); push(last.code, 'undo', 'Removed from manifest'); toast({ kind: 'info', title: `${last.code} removed` }); };
  const submitTyped = () => { const c = typed.trim().toUpperCase(); if (!c) return; doScan(c); setTyped(''); };

  const onReading = (kg: number) => { const r = recordGateWeight(dispatch.id, kg); setRecounting(false); setScaleRun(0); beep(r.decision === 'pass' ? 'ok' : 'bad'); toast(r.decision === 'pass' ? { kind: 'ok', title: `Gate pass issued · ${dispatch.deliveryNoteNo}`, detail: `${fmtKg(kg)} on the scale, ${fmtPct(r.variancePct, true)} vs expected` } : { kind: 'error', title: 'Gate held', detail: r.reasons[0] }); };
  const verdict = !recounting && dispatch.gateStatus !== 'pending' && dispatch.gateKg !== undefined ? gateDecision({ expectedKg: dispatch.expectedKg, actualKg: dispatch.gateKg, tolerancePct: tol, scannedBundles: scanned, orderedBundles: ordered }) : null;
  const gateOpen = !verdict && !locked;

  const weigh = () => {
    if (!gateOpen) return;
    if (scanned === 0) { toast({ kind: 'warn', title: 'Nothing on the lorry yet', detail: 'Scan at least one bundle before weighing.' }); return; }
    setScaleRun((n) => n + 1); gateRef.current?.scrollIntoView({ block: 'nearest' });
  };
  useEffect(() => { if (!actions) return; actions.current.weigh = weigh; return () => { actions.current.weigh = undefined; }; });
  useHotkey('mod+enter', () => { if (!pressUseReading(gateRef.current)) toast({ kind: 'warn', title: 'No stable reading yet', detail: 'Read the gate scale first, then use the reading.' }); }, { label: 'Use the gate scale reading', enabled: gateOpen && scanned > 0 && !overrideOpen });
  // When the verdict lands, bring it into view and hand the keyboard back to the page so R, O, M and N work.
  const hadVerdict = useRef(!!verdict);
  useEffect(() => { if (verdict && !hadVerdict.current) { scanRef.current?.blur(); verdictRef.current?.scrollIntoView({ block: 'nearest' }); } hadVerdict.current = !!verdict; }, [!!verdict]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMissing = () => setMissing10((v) => !v);
  const recount = () => { setRecounting(true); setMissing10(false); setScaleRun(0); refocus(); };
  const openOverride = () => { setOverrideOpen(true); setPinError(null); };
  const submitPin = useCallback((pin: string) => {
    if (!overrideReason.trim()) { setPinError('Write the reason first, then enter the PIN.'); beep('bad'); return; }
    const ok = overrideGate(dispatch.id, pin, overrideReason.trim());
    if (!ok) { setPinError('Wrong PIN. Only the Site Manager can release a held lorry.'); beep('bad'); toast({ kind: 'error', title: 'Wrong PIN' }); return; }
    setPinError(null); setOverrideOpen(false); beep('ok'); toast({ kind: 'warn', title: `Override recorded for ${dispatch.deliveryNoteNo}`, detail: 'Logged in the audit feed with your name and reason.' });
  }, [overrideReason, overrideGate, dispatch.id, dispatch.deliveryNoteNo, beep, toast]);
  const waLines = [`Delivery note ${dispatch.deliveryNoteNo} for ${order.number}`, ...lines.map((l) => `• ${l.product.internalName}: ${l.scanned} bundles (${fmtNum(l.scanned * l.product.bundlePieces)} pcs)`), `Gate weight ${dispatch.gateKg !== undefined ? fmtKg(dispatch.gateKg) : '—'} · expected ${fmtKg(dispatch.expectedKg)}`, `Driver ${dispatch.driver} · ${dispatch.vehicle}`, dispatch.gatePassedAt ? `Left ${site.shortName} at ${fmtTime(dispatch.gatePassedAt)}` : ''].filter(Boolean);
  const sendWa = async () => { await messaging.sendWhatsApp(client?.whatsapp ?? '', waLines.join('\n'), `${dispatch.deliveryNoteNo}.pdf`); setWaSent(true); toast({ kind: 'ok', title: `Delivery note sent to ${client?.name}` }); };

  /** While the field is empty, single keys act as shortcuts. Label codes start with the site prefix, so a scanner never collides with them. */
  const onScanKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); submitTyped(); return; }
    if (e.key === 'Escape') { if (typed) setTyped(''); else e.currentTarget.blur(); return; }
    if (typed || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const run = k === 's' ? (e.shiftKey ? scanTen : () => { scanNext(); }) : k === 'd' ? scanSameAgain : k === 'z' ? undo : k === 'w' ? weigh : k === 'x' ? toggleMissing : k === '?' ? () => usePrefs.getState().setHelp(true) : null;
    if (run) { e.preventDefault(); run(); }
  };

  const okCount = feed.filter((f) => f.kind === 'ok').length; const badCount = feed.filter((f) => f.kind === 'bad').length;
  const hold = dispatch.gateStatus === 'hold'; const pass = dispatch.gateStatus === 'pass';
  const tone = hold ? 'var(--bad)' : pass ? 'var(--ok)' : 'var(--warn)';

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      {/* ---------------- manifest */}
      <Panel icon={ClipboardList} title="Manifest" sub={`${dispatch.deliveryNoteNo} · ${client?.name}`} pad={false}
        actions={<Badge tone={complete ? 'ok' : 'neutral'} dot className="mr-1.5">{complete ? 'Manifest complete' : `${ordered - scanned} bundles to go`}</Badge>}
        footer={<span>Expected cargo weight <b className="num font-semibold text-[var(--text)]">{fmtKg(Math.round(dispatch.expectedKg))}</b> = bundles × standard weight · gate tolerance ±{tol}% · standard weights are illustrative until measured.</span>}>
        <ManifestTable lines={lines} mode="load" locked={locked} onScan={(pid) => scanNext(pid)} />
      </Panel>

      {/* ---------------- scanning */}
      {!locked && (
        <Panel icon={ScanLine} title="Scan" sub="every bundle onto the lorry">
          <div className="grid gap-[var(--gap)] md:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
            <div className="min-w-0">
              <div className={cn('relative rounded-lg border bg-[var(--surface)] transition-colors', focused ? 'border-[var(--focus)]' : 'border-[var(--line-2)]', flash === 'ok' && 'tn-flash-ok', flash === 'bad' && 'tn-shake')}>
                <ScanLine className={cn('size-4 touch:size-5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none', focused ? 'text-[var(--focus)]' : 'text-[var(--text-3)]')} />
                <input ref={scanRef} value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={onScanKey} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} aria-label="Scan or type a label code"
                  placeholder="Scan a sticker, or type its code" autoCapitalize="characters" autoComplete="off" spellCheck={false}
                  className="w-full ctl-lg bg-transparent outline-none pl-9 touch:pl-10 pr-[124px] rounded-lg code t-lg uppercase placeholder:normal-case placeholder:font-sans placeholder:tracking-normal placeholder:text-[var(--text-4)]" />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 t-xs text-[var(--text-3)] pointer-events-none">
                  {typed ? <>Enter<Kbd keys="enter" /></> : focused ? <><span className="size-1.5 rounded-full bg-[var(--ok)] anim-live" />Scanner ready</> : 'Select to scan'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                <Button variant="primary" icon={ScanLine} hotkey="s" hotkeyLabel="Scan the next bundle" onClick={() => scanNext()} disabled={complete}>Scan next</Button>
                <Button icon={Zap} hotkey="shift+s" hotkeyLabel="Scan ten bundles" onClick={scanTen} disabled={complete}>Scan 10</Button>
                <Button icon={Repeat} hotkey="d" hotkeyLabel="Scan the last sticker again (duplicate test)" onClick={scanSameAgain} disabled={scanned === 0} title="Scans the last sticker again to show the duplicate rejection">Duplicate test</Button>
                <Button icon={Undo2} hotkey="z" hotkeyLabel="Undo the last scan" onClick={undo} disabled={scanned === 0}>Undo last</Button>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline justify-between gap-3 mb-1 t-sm"><span className="text-[var(--text-2)]"><span className="num font-semibold text-[var(--text)]">{scanned}</span> of <span className="num">{ordered}</span> bundles on the lorry</span><span className="num text-[var(--text-3)]">{fmtKg(Math.round(scannedKg))} of {fmtKg(Math.round(dispatch.expectedKg))}</span></div>
                <Bar value={scanned} max={ordered} tone={complete ? 'ok' : 'series'} />
              </div>
              <p className="t-xs text-[var(--text-3)] mt-2">The same sticker twice, a sticker from another product, or more bundles than ordered is rejected on the spot.</p>
            </div>
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] flex flex-col min-h-[150px] max-h-[212px] touch:max-h-[300px] min-w-0">
              <div className="flex items-center justify-between gap-2 px-2.5 h-8 touch:h-10 border-b border-[var(--line)] shrink-0"><span className="t-label">Scanned · newest first</span><span className="t-xs num text-[var(--text-3)]">{feed.length ? `${okCount} ok${badCount ? ` · ${badCount} rejected` : ''}` : `${scanned} on the manifest`}</span></div>
              <div className="overflow-y-auto scrollbar-thin flex-1 py-1" aria-live="polite">
                {feed.length === 0 && scannedLabels.length === 0 && <div className="px-2.5 py-2 t-sm text-[var(--text-3)]">Nothing scanned yet. Each accepted or rejected sticker lands here.</div>}
                {feed.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 px-2.5 min-h-[26px] touch:min-h-9 t-sm anim-up">
                    {f.kind === 'ok' ? <CheckCircle2 className="size-3.5 shrink-0 text-[var(--ok)]" /> : f.kind === 'bad' ? <XCircle className="size-3.5 shrink-0 text-[var(--bad)]" /> : <Undo2 className="size-3.5 shrink-0 text-[var(--text-3)]" />}
                    <span className={cn('code font-medium whitespace-nowrap', f.kind === 'undo' && 'line-through text-[var(--text-3)]')}>{f.code}</span>
                    <span className={cn('truncate min-w-0', f.kind === 'bad' ? 'text-[var(--bad)] font-medium' : 'text-[var(--text-3)]')}>{feedText(f.code, f.msg)}</span>
                    <span className="ml-auto num t-xs text-[var(--text-4)] shrink-0">{fmtTime(f.at)}</span>
                  </div>
                ))}
                {feed.length === 0 && scannedLabels.length > 0 && [...scannedLabels].reverse().map((l) => (
                  <div key={l.id} className="flex items-center gap-2 px-2.5 min-h-[26px] touch:min-h-9 t-sm"><CheckCircle2 className="size-3.5 shrink-0 text-[var(--ok)]" /><span className="code font-medium whitespace-nowrap">{l.code}</span><span className="truncate text-[var(--text-3)]">{s.products.find((p) => p.id === l.productId)?.internalName}</span></div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* ---------------- gate */}
      {gateOpen && (
        <div ref={gateRef} className="grid gap-[var(--gap)] compact:lg:grid-cols-2 items-start scroll-mb-4">
          <ScaleWidget key={scaleRun} autoStart={scaleRun > 0} targetKg={targetKg} onReading={onReading} disabled={scanned === 0} title="Gate scale" model={scanned === 0 ? 'Scan a bundle first' : 'Lorry on the scale, then read'} />
          <Panel icon={ShieldCheck} title="Gate check" sub="a pass needs both"
            footer={<div className="flex flex-wrap items-center justify-between gap-2"><span>Presenter drill</span><Button size="sm" variant={missing10 ? 'danger' : 'secondary'} icon={Weight} hotkey="x" hotkeyLabel="Simulate 10 bundles missing from the lorry" onClick={toggleMissing} aria-pressed={missing10} title="Presenter: the lorry really carries 10 bundles fewer than scanned">{missing10 ? 'Simulating 10 bundles missing' : 'Simulate 10 bundles missing'}</Button></div>}>
            <CheckRow state={complete ? 'ok' : scanned ? 'warn' : 'wait'} title="Every ordered bundle is scanned" value={`${scanned} / ${ordered}`} />
            <CheckRow state="wait" title={<>Scale within ±{tol}% of <span className="num">{fmtKg(Math.round(dispatch.expectedKg))}</span></>} value="not weighed" />
            <div className="mt-3"><Gauge variancePct={undefined} tolerancePct={tol} width={520} /></div>
            <div className="touch:hidden flex flex-wrap items-center gap-x-1.5 gap-y-1 t-xs text-[var(--text-3)] mt-2.5"><Kbd keys="w" />reads the scale<Kbd keys="mod+enter" className="ml-2" />uses the stable reading</div>
            {!complete && scanned > 0 && <Note tone="warn" className="mt-3">Short load: {scanned} of {ordered} bundles scanned. The gate will hold this lorry until the manifest is complete or the Site Manager overrides.</Note>}
            {missing10 && <Note tone="bad" className="mt-3">Presenter mode: every sticker was scanned, but ten bundles never made it onto the lorry. Only the scale can catch this.</Note>}
          </Panel>
        </div>
      )}

      {/* ---------------- verdict */}
      {verdict && (
        <section ref={verdictRef} className="surface overflow-hidden anim-pop scroll-mb-4" style={{ borderColor: `color-mix(in srgb, ${tone} 45%, var(--line))` }}>
          <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-[var(--pad)] py-3 border-b border-[var(--line)]" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${tone} 14%, var(--surface)), var(--surface) 80%)` }}>
            <IconChip size="lg" solid icon={hold ? Siren : pass ? ShieldCheck : ShieldAlert} color={tone} className={hold ? 'anim-alarm' : undefined} />
            <div className="min-w-0 flex-1 basis-[240px]">
              <div className="flex items-center gap-2 flex-wrap"><h3 className="t-title">{hold ? 'Held at the gate' : pass ? 'Gate pass issued' : 'Released on override'}</h3><Badge tone={hold ? 'bad' : pass ? 'ok' : 'warn'} dot>{hold ? 'Hold' : pass ? 'Pass' : 'Override'}</Badge></div>
              <div className="t-sm text-[var(--text-2)]">{hold ? `The lorry stays inside. The gate is locked for ${dispatch.deliveryNoteNo}.` : pass ? `${dispatch.vehicle} may leave with ${dispatch.deliveryNoteNo}${dispatch.gatePassedAt ? ` · passed at ${fmtTime(dispatch.gatePassedAt)}` : ''}.` : `Site Manager override for ${dispatch.deliveryNoteNo}: “${dispatch.overrideReason}”`}</div>
            </div>
            {hold ? <Badge tone="bad" dot>CEOs alerted · {ceos.join(' & ')}</Badge>
              : <div className="text-right shrink-0"><div className="t-label">Gate pass no.</div><div className="code t-lg font-semibold">{gatePassNo(dispatch)}</div></div>}
          </header>
          <div className="p-[var(--pad)] grid gap-x-6 gap-y-4 md:grid-cols-2">
            <div className="min-w-0">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                <Fact label="Gate scale">{fmtKg(dispatch.gateKg!)}</Fact>
                <Fact label="Expected">{fmtKg(Math.round(dispatch.expectedKg))}</Fact>
                <Fact label={`Variance (band ±${tol}%)`}><span style={{ color: Math.abs(verdict.variancePct) <= tol ? 'var(--ok)' : 'var(--bad)' }}>{fmtPct(verdict.variancePct, true)}</span></Fact>
                <Fact label="Bundles scanned / ordered"><span style={{ color: complete ? undefined : 'var(--bad)' }}>{scanned} / {ordered}</span></Fact>
              </div>
              <div className="mt-3.5"><Gauge variancePct={verdict.variancePct} tolerancePct={tol} width={520} /></div>
            </div>
            <div className="min-w-0">
              {hold ? <>
                <div className="t-label mb-1.5">Why the gate is locked</div>
                <ul className="flex flex-col gap-1.5">{verdict.reasons.map((r) => <li key={r} className="flex items-start gap-2 t-base font-medium"><XCircle className="size-4 shrink-0 mt-0.5 text-[var(--bad)]" />{r}</li>)}</ul>
                <Note tone="bad" className="mt-3">{ceos.join(' and ')} got an alert, and an exception is open on the dashboard. Recount and weigh again, or the Site Manager releases the lorry with a PIN and a reason.</Note>
              </> : <>
                <div className="t-label mb-1.5">Captured at the gate</div>
                <div className="flex flex-col gap-1.5"><CaptureTile kind="signature" done={dispatch.hasDriverSignature} label={`Driver signature · ${dispatch.driver}`} /><CaptureTile kind="photo" done={dispatch.hasLorryPhoto} label={`Lorry photo · ${dispatch.vehicle}`} /></div>
                {!pass && <Note tone="warn" className="mt-3">Recorded in the audit feed with the Site Manager's name and reason. Both CEOs can see it.</Note>}
                <p className="t-sm text-[var(--text-3)] mt-2.5">{waSent ? `Delivery note sent to ${client?.name} on WhatsApp.` : `Share the delivery note with ${client?.name}: the client, the driver and the CEOs receive the same PDF.`}</p>
              </>}
            </div>
          </div>
          <footer className="px-[var(--pad)] py-2.5 border-t border-[var(--line)] bg-[var(--surface-2)] flex flex-wrap items-center justify-end gap-2">
            {hold ? <>
              <Button icon={RotateCcw} hotkey="r" hotkeyLabel="Recount and weigh again" onClick={recount}>Recount</Button>
              <Button variant="danger" icon={KeyRound} hotkey="o" hotkeyLabel="Site Manager override" onClick={openOverride}>Site Manager override</Button>
            </> : <>
              <Button icon={Share2} hotkey="m" hotkeyLabel="Share the delivery note on WhatsApp" onClick={() => setWaOpen(true)}>Share delivery note on WhatsApp</Button>
              <Button variant="primary" icon={PackageCheck} hotkey="n" hotkeyLabel="Load the next order" onClick={onLoadNext}>Load next order</Button>
            </>}
          </footer>
        </section>
      )}

      {/* ---------------- once the lorry is released: exactly which stickers left */}
      {locked && (
        <Panel icon={PackageCheck} title="On the lorry" sub={`${fmtNum(scanned)} stickers · ${fmtKg(Math.round(scannedKg))} by sticker weight`} pad={false}
          footer="Each sticker is now marked dispatched and cannot be scanned onto another lorry.">
          <DataGrid bare dense rows={scannedLabels} rowKey={(l) => l.id} maxHeight={272}
            columns={[
              { key: 'c', header: 'Sticker', cell: (l) => <span className="code">{l.code}</span> },
              { key: 'p', header: 'Product', cell: (l) => <ProductName product={s.products.find((p) => p.id === l.productId)} /> },
              { key: 'z', header: 'Picked from', truncate: 160, cell: (l) => <span className="text-[var(--text-2)]">{s.zones.find((z) => z.id === l.zoneId)?.name ?? '—'}</span> },
              { key: 'd', header: 'Made', cell: (l) => <span className="num text-[var(--text-2)]">{fmtDayShort(l.day)}</span> },
              { key: 'q', header: 'Pieces', align: 'right', mono: true, cell: (l) => fmtNum(l.qtyUnits) },
              { key: 'kg', header: 'Kg', align: 'right', mono: true, cell: (l) => fmtNum(l.qtyKg) },
            ]}
            footer={<tr><td colSpan={4}>{fmtNum(scanned)} of {fmtNum(ordered)} ordered</td><td className="text-right num">{fmtNum(scannedLabels.reduce((t, l) => t + l.qtyUnits, 0))}</td><td className="text-right num">{fmtNum(Math.round(scannedKg))}</td></tr>} />
        </Panel>
      )}

      {/* ---------------- override */}
      <Dialog open={overrideOpen} onClose={() => setOverrideOpen(false)} title="Site Manager override" width={480} footer={<Button variant="ghost" onClick={() => setOverrideOpen(false)}>Cancel</Button>}>
        <OverrideForm dn={dispatch.deliveryNoteNo} reason={overrideReason} setReason={(v) => { setOverrideReason(v); setPinError(null); }} onPin={submitPin} error={pinError} />
      </Dialog>

      {/* ---------------- whatsapp */}
      <Sheet open={waOpen} onClose={() => setWaOpen(false)} title="Share delivery note" sub={`${dispatch.deliveryNoteNo} · ${client?.name}`} footer={<Button variant="primary" icon={Send} hotkey="mod+enter" onClick={sendWa} disabled={waSent}>{waSent ? 'Sent' : `Send to ${client?.whatsapp}`}</Button>}>
        <WhatsAppPreview to={client?.name ?? ''} lines={waLines} attachment={`${dispatch.deliveryNoteNo}.pdf`} sent={waSent} className="mx-auto" />
        <p className="t-sm text-[var(--text-3)] mt-3 text-center">The client, the driver and the CEOs receive the same PDF.</p>
      </Sheet>
    </div>
  );
}
