import { useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Camera, Check, PenLine, X, type LucideIcon } from 'lucide-react';
import type { Dispatch, Product, SiteCode } from '@tanaad/domain';
import { useStore, type AppState } from '@/data/store';
import { SITES } from '@/config/sites';
import { Badge, cn, type Tone } from '@/components/ui';
import { QR } from '@/components/Sticker';
import { fmtDateTime, fmtDayLong, fmtKg, fmtMoney, fmtNum, fmtPct } from '@/data/format';

/* ------------------------------------------------------------------ small CSS the stock screens need (scan feedback) */
export function StockStyles() {
  return (
    <style>{`
      @keyframes tn-shake { 0%,100% { transform: translateX(0) } 20% { transform: translateX(-5px) } 40% { transform: translateX(5px) } 60% { transform: translateX(-3px) } 80% { transform: translateX(3px) } }
      @keyframes tn-flash-ok { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ok) 60%, transparent) } 100% { box-shadow: 0 0 0 10px transparent } }
      .tn-shake { animation: tn-shake .4s ease-in-out both; border-color: var(--bad) !important }
      .tn-flash-ok { animation: tn-flash-ok .5s ease-out both; border-color: var(--ok) !important }
    `}</style>
  );
}

/* ------------------------------------------------------------------ WebAudio beep */
export function useBeep() {
  const ctx = useRef<AudioContext | null>(null);
  return useCallback((kind: 'ok' | 'bad' = 'ok') => {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx.current ??= new AC();
      const c = ctx.current; if (c.state === 'suspended') void c.resume();
      const o = c.createOscillator(); const g = c.createGain();
      o.type = kind === 'ok' ? 'sine' : 'square'; o.frequency.value = kind === 'ok' ? 1320 : 220;
      g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(kind === 'ok' ? 0.25 : 0.18, c.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + (kind === 'ok' ? 0.11 : 0.3));
      o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + (kind === 'ok' ? 0.12 : 0.32));
    } catch { /* audio is optional */ }
  }, []);
}

/* ------------------------------------------------------------------ zone preset handed from Stock wall → Stock count */
let presetZone: string | undefined;
export const setPresetZone = (z: string | undefined) => { presetZone = z; };
export const takePresetZone = () => { const z = presetZone; presetZone = undefined; return z; };

/* ------------------------------------------------------------------ status helpers */
export type DeliveryStatus = 'loading' | 'held' | 'gate_pass' | 'in_transit' | 'delivered' | 'discrepancy';
export function deliveryStatus(d: Dispatch): DeliveryStatus {
  if (d.pod) return d.pod.bundlesCounted === d.pod.bundlesExpected ? 'delivered' : 'discrepancy';
  if (d.gateStatus === 'hold') return 'held';
  if (d.gateStatus === 'pending') return 'loading';
  const ageH = (Date.now() - new Date(d.gatePassedAt ?? d.createdAt).getTime()) / 3_600_000;
  return ageH > 2 ? 'in_transit' : 'gate_pass';
}
export const STATUS_META: Record<DeliveryStatus, { label: string; tone: Tone }> = {
  loading: { label: 'Loading', tone: 'neutral' }, held: { label: 'Held at gate', tone: 'bad' }, gate_pass: { label: 'Gate pass', tone: 'ok' },
  in_transit: { label: 'In transit', tone: 'accent' }, delivered: { label: 'Delivered', tone: 'ok' }, discrepancy: { label: 'Discrepancy', tone: 'bad' },
};
export const GATE_META: Record<Dispatch['gateStatus'], { label: string; tone: Tone }> = { pending: { label: 'Loading', tone: 'neutral' }, pass: { label: 'Gate pass', tone: 'ok' }, hold: { label: 'Held', tone: 'bad' }, overridden: { label: 'Override', tone: 'warn' } };
export function GateBadge({ status }: { status: Dispatch['gateStatus'] }) { return <Badge tone={GATE_META[status].tone} dot>{GATE_META[status].label}</Badge>; }
export function StatusBadge({ status }: { status: DeliveryStatus }) { return <Badge tone={STATUS_META[status].tone} dot>{STATUS_META[status].label}</Badge>; }

/** Next delivery-note serial in this site's series (mirrors the store's rule). */
export function nextDeliveryNoteNo(s: AppState, siteId: SiteCode, seriesStart: number) {
  const prev = s.dispatches.filter((d) => d.siteId === siteId).map((d) => parseInt(d.deliveryNoteNo.replace(/\D/g, ''), 10)).filter((n) => !isNaN(n));
  const next = Math.max(seriesStart - 1, ...prev) + 1;
  return siteId === 'bags' ? `DN-${next}` : `DN-${String(next).padStart(5, '0')}`;
}
/** The gate pass carries the delivery note's serial, so the two papers can never drift apart. */
export const gatePassNo = (d: Pick<Dispatch, 'deliveryNoteNo'>) => d.deliveryNoteNo.replace(/^DN/, 'GP');

/* ------------------------------------------------------------------ small data marks shared by the stock screens */
/** Product colour swatch and name on one line. */
export function ProductName({ product, sub, className }: { product?: Pick<Product, 'internalName' | 'colour'>; sub?: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1.5 min-w-0', className)}><span className="size-2.5 rounded-[3px] shrink-0" style={{ background: product?.colour ?? 'var(--text-4)' }} /><span className="font-medium truncate">{product?.internalName ?? '—'}</span>{sub && <span className="t-sm text-[var(--text-3)] whitespace-nowrap">{sub}</span>}</span>;
}
/** Scale variance against the gate tolerance: green inside the band, red outside. */
export function VarianceBadge({ pct, tolerancePct }: { pct?: number; tolerancePct: number }) {
  if (pct === undefined) return <span className="text-[var(--text-4)]">—</span>;
  return <Badge tone={Math.abs(pct) <= tolerancePct ? 'ok' : 'bad'} className="num">{fmtPct(pct, true)}</Badge>;
}
/** An icon in a tinted square: the house way to add colour to a row. */
export function IconChip({ icon: Icon, color = 'var(--text-3)', size = 'md', className, solid }: { icon: LucideIcon; color?: string; size?: 'sm' | 'md' | 'lg'; className?: string; solid?: boolean }) {
  const sz = size === 'sm' ? 'size-6 rounded-md' : size === 'lg' ? 'size-10 rounded-lg' : 'size-8 rounded-md';
  return <span className={cn('grid place-items-center shrink-0', sz, className)} style={solid ? { background: color, color: '#fff' } : { background: `color-mix(in srgb, ${color} 13%, transparent)`, color }}><Icon className={size === 'sm' ? 'size-3.5' : size === 'lg' ? 'size-5' : 'size-4'} strokeWidth={2} /></span>;
}
/** Label over value, for the fact rows inside result blocks and inspectors. */
export function Fact({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return <div className={cn('min-w-0', className)}><div className="t-xs text-[var(--text-3)] font-medium truncate">{label}</div><div className="t-lg font-semibold num truncate">{children}</div></div>;
}

/* ------------------------------------------------------------------ Hero pieces (dark band; fixed sizes are allowed there) */
export function HeroStat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-[10.5px] uppercase tracking-[0.1em] font-semibold text-white/50 whitespace-nowrap">{label}</div>
      <div className="num text-[18px] sm:text-[22px] font-semibold tracking-[-0.01em] leading-[1.2] whitespace-nowrap">{value}</div>
      {sub && <div className="hidden sm:block text-[11.5px] text-white/55 whitespace-nowrap">{sub}</div>}
    </div>
  );
}
export interface FlowStep { label: string; detail?: ReactNode; state: 'done' | 'current' | 'todo' | 'bad' | 'warn' }
/** Numbered workflow steps for the hero band: done, current, to do, or failed. A row with connectors; on a phone, three columns with the label under each number. */
export function FlowSteps({ steps, className }: { steps: FlowStep[]; className?: string }) {
  const dot = (st: FlowStep, i: number) => (
    <span className={cn('relative z-[1] size-7 rounded-full grid place-items-center shrink-0 text-[12px] font-semibold num border',
      st.state === 'done' ? 'bg-white text-[var(--color-ink-900)] border-white' : st.state === 'current' ? 'bg-[var(--color-amber-500)] border-[var(--color-amber-400)] text-white shadow-[0_0_0_3px_rgb(240_160_75/.22)]'
        : st.state === 'bad' ? 'bg-[#d5513e] border-[#ef7a69] text-white' : st.state === 'warn' ? 'bg-[var(--hero-b)] border-[var(--color-amber-400)] text-[var(--color-amber-400)]' : 'bg-[var(--hero-b)] border-white/25 text-white/50')}>
      {st.state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : st.state === 'bad' ? <X className="size-3.5" strokeWidth={3} /> : st.state === 'warn' ? <AlertTriangle className="size-3.5" strokeWidth={2.5} /> : i + 1}
    </span>
  );
  const labelCls = (st: FlowStep) => (st.state === 'todo' ? 'text-white/55' : 'text-white');
  const detailCls = (st: FlowStep) => (st.state === 'bad' ? 'text-[#ffb3a7]' : st.state === 'current' || st.state === 'warn' ? 'text-[var(--color-amber-400)]' : 'text-white/50');
  return (
    <div className={cn('min-w-0', className)}>
      <ol className="flex items-start sm:hidden">
        {steps.map((st, i) => (
          <li key={st.label} className="relative flex-1 min-w-0 flex flex-col items-center text-center px-1" aria-current={st.state === 'current' ? 'step' : undefined}>
            {i > 0 && <span className={cn('absolute top-3.5 right-1/2 w-full h-px', steps[i - 1].state === 'done' ? 'bg-white/45' : 'bg-white/15')} />}
            {dot(st, i)}
            <span className={cn('mt-1 text-[12px] font-medium leading-tight', labelCls(st))}>{st.label}</span>
            {st.detail && st.state !== 'todo' && <span className={cn('text-[11px] leading-tight mt-0.5', detailCls(st))}>{st.detail}</span>}
          </li>
        ))}
      </ol>
      <ol className="hidden sm:flex items-center min-w-0">
        {steps.map((st, i) => (
          <li key={st.label} className={cn('flex items-center gap-2.5 min-w-0', i < steps.length - 1 && 'flex-1')} aria-current={st.state === 'current' ? 'step' : undefined}>
            {dot(st, i)}
            <span className="min-w-0">
              <span className={cn('block text-[13px] font-medium leading-tight truncate', labelCls(st))}>{st.label}</span>
              {st.detail && <span className={cn('block text-[11.5px] leading-tight mt-0.5 truncate', detailCls(st))}>{st.detail}</span>}
            </span>
            {i < steps.length - 1 && <span className={cn('flex-1 h-px min-w-5 mx-3 shrink-0', st.state === 'done' ? 'bg-white/45' : 'bg-white/15')} />}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ Delivery note (paper twin) */
export function DeliveryNoteCard({ dispatch, serialPreview, className, compact }: { dispatch?: Dispatch; serialPreview?: { no: string; orderId: string; driver: string; vehicle: string }; className?: string; compact?: boolean }) {
  const s = useStore();
  const orderId = dispatch?.orderId ?? serialPreview?.orderId; const o = s.orders.find((x) => x.id === orderId); const client = s.clients.find((c) => c.id === o?.clientId);
  if (!o) return null;
  const site = SITES[o.siteId]; const no = dispatch?.deliveryNoteNo ?? serialPreview?.no ?? '';
  // Letterhead comes from Settings → Company. A blank prints as a visible gap, never as an invented value.
  const co = s.companyProfiles?.[o.siteId]; const blank = <span className="italic text-neutral-400">to be provided by Tanaad</span>;
  const head: [string, string | undefined][] = [['Address', co?.address], ['Tel', co?.phone], ['Email', co?.email], ['TIN', co?.tin]];
  const scannedBy = (pid: string) => (dispatch ? dispatch.scannedLabelIds.filter((id) => s.labels.find((l) => l.id === id)?.productId === pid).length : 0);
  const expected = dispatch?.expectedKg ?? o.lines.reduce((t, l) => t + l.bundles * (s.products.find((p) => p.id === l.productId)?.stdBundleWeightKg ?? 0), 0);
  const ordered = o.lines.reduce((t, l) => t + l.bundles, 0);
  const stamp = !dispatch ? { text: 'Preview', cls: 'border-neutral-400 text-neutral-500' }
    : dispatch.gateStatus === 'pass' ? { text: `Gate pass${dispatch.gatePassedAt ? ` · ${fmtDateTime(dispatch.gatePassedAt)}` : ''}`, cls: 'border-emerald-700 text-emerald-700' }
      : dispatch.gateStatus === 'overridden' ? { text: 'Released on override', cls: 'border-amber-700 text-amber-700' }
        : dispatch.gateStatus === 'hold' ? { text: 'Held at gate', cls: 'border-red-700 text-red-700' } : { text: 'Loading', cls: 'border-neutral-400 text-neutral-500' };
  const V = ({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) => <div className="flex justify-between gap-3 py-[3px] border-b border-dashed border-neutral-300 last:border-0"><span className="text-neutral-500 font-sans">{k}</span><span className={cn('text-right', strong && 'font-bold')}>{v}</span></div>;
  const L = ({ children }: { children: ReactNode }) => <div className="font-sans uppercase tracking-[0.08em] text-neutral-500 text-[0.82em] font-medium">{children}</div>;
  return (
    <div className={cn('bg-white text-neutral-900 rounded-md border border-neutral-300 shadow-[var(--shadow-raise)] font-mono t-sm leading-snug', compact ? 'p-3' : 'p-4', className)}>
      <div className="flex items-start justify-between gap-3 pb-2.5 border-b-2 border-neutral-800">
        <div className="min-w-0">
          <div className="font-sans font-black tracking-[0.18em] italic leading-none t-lg">TANAAD</div>
          <div className="font-sans text-neutral-600 t-xs mt-0.5 truncate font-medium">{site.legalName}</div>
          <div className="font-sans text-neutral-500 t-xs leading-snug mt-0.5">{head.filter(([k]) => !compact || k === 'Address' || k === 'TIN').map(([k, v]) => <div key={k} className="truncate">{k} {v?.trim() ? <span className="text-neutral-700">{v}</span> : blank}</div>)}</div>
          <div className="mt-2"><L>Delivery note</L><div className="font-bold t-lg leading-tight">{no}</div></div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {!compact && <QR value={`${no}|${o.number}`} size={52} />}
          <span className={cn('font-sans font-semibold t-xs border rounded-[3px] px-1.5 py-px -rotate-2 whitespace-nowrap', stamp.cls)}>{stamp.text}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 py-2.5">
        <div className="min-w-0"><L>Deliver to</L><div className="font-bold truncate">{client?.name}</div><div className="text-neutral-600 truncate">{client?.country} · {client?.contact}</div></div>
        <div className="min-w-0 text-right"><L>Order</L><div className="font-bold">{o.number}</div><div className="text-neutral-600 truncate">{fmtDayLong((dispatch?.createdAt ?? o.createdAt).slice(0, 10))}</div></div>
      </div>
      <table className="w-full mb-2">
        <thead><tr className="border-y border-neutral-400"><th className="text-left py-1 font-normal"><L>Item</L></th><th className="text-right font-normal"><L>Ordered</L></th><th className="text-right font-normal pl-2"><L>Loaded</L></th><th className="text-right font-normal pl-2"><L>Kg</L></th></tr></thead>
        <tbody>{o.lines.map((l) => { const p = s.products.find((x) => x.id === l.productId)!; return <tr key={l.productId} className="border-b border-dashed border-neutral-300"><td className="py-1">{p.commercialName ? `${p.commercialName} ${p.internalName}` : p.internalName}<span className="text-neutral-500"> ×{p.bundlePieces}</span></td><td className="text-right">{l.bundles}</td><td className="text-right font-bold">{dispatch ? scannedBy(l.productId) : '—'}</td><td className="text-right">{fmtNum(Math.round(l.bundles * p.stdBundleWeightKg))}</td></tr>; })}</tbody>
        <tfoot><tr className="font-bold border-b border-neutral-400"><td className="py-1">Total</td><td className="text-right">{ordered}</td><td className="text-right">{dispatch ? dispatch.scannedLabelIds.length : '—'}</td><td className="text-right">{fmtNum(Math.round(expected))}</td></tr></tfoot>
      </table>
      <V k="Expected weight" v={fmtKg(expected)} />
      <V k="Gate scale" v={dispatch?.gateKg !== undefined ? fmtKg(dispatch.gateKg) : 'not weighed'} strong={dispatch?.gateKg !== undefined} />
      <V k="Variance" v={dispatch?.variancePct !== undefined ? fmtPct(dispatch.variancePct, true) : '—'} />
      <V k="Driver" v={(dispatch?.driver ?? serialPreview?.driver) || <span className="text-neutral-400">not entered</span>} />
      <V k="Vehicle" v={(dispatch?.vehicle ?? serialPreview?.vehicle) || <span className="text-neutral-400">not chosen</span>} />
      {dispatch?.gateStatus === 'overridden' && <V k="Override reason" v={dispatch.overrideReason ?? '—'} />}
      {dispatch?.pod && <V k="Received by" v={`${dispatch.pod.receiverName} · ${dispatch.pod.bundlesCounted}/${dispatch.pod.bundlesExpected} bundles`} />}
      {!compact && (
        <div className="grid grid-cols-2 gap-3 mt-4 font-sans t-xs text-neutral-500">
          <div className="border-t border-neutral-500 pt-1 flex items-center gap-1">{dispatch?.hasDriverSignature && <Check className="size-3 text-emerald-700" strokeWidth={3} />}{dispatch?.hasDriverSignature ? 'Driver signed' : 'Driver signature'}</div>
          <div className="border-t border-neutral-500 pt-1 flex items-center gap-1">{dispatch?.pod?.hasSignature && <Check className="size-3 text-emerald-700" strokeWidth={3} />}{dispatch?.pod?.hasSignature ? 'Receiver signed' : 'Receiver signature'}</div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Shipment stepper: loaded → gate → delivered → invoiced → paid */
export function ShipmentStepper({ dispatch, className, vertical }: { dispatch: Dispatch; className?: string; /** Timeline with one line of detail per step; use in narrow side panels. */ vertical?: boolean }) {
  const s = useStore(); const o = s.orders.find((x) => x.id === dispatch.orderId);
  const inv = s.invoices.find((i) => i.orderId === dispatch.orderId); const paid = o?.status === 'paid' || (inv ? s.payments.some((p) => p.invoiceId === inv.id) : false);
  const short = !!dispatch.pod && dispatch.pod.bundlesCounted !== dispatch.pod.bundlesExpected;
  const steps: { label: string; done: boolean; bad?: boolean; detail: string }[] = [
    { label: 'Loaded', done: dispatch.scannedLabelIds.length > 0, detail: dispatch.scannedLabelIds.length ? `${dispatch.scannedLabelIds.length} bundles scanned · ${dispatch.driver}, ${dispatch.vehicle}` : 'No bundle scanned yet' },
    { label: dispatch.gateStatus === 'hold' ? 'Held at gate' : dispatch.gateStatus === 'overridden' ? 'Released on override' : 'Gate passed', done: dispatch.gateStatus === 'pass' || dispatch.gateStatus === 'overridden', bad: dispatch.gateStatus === 'hold',
      detail: dispatch.gateKg === undefined ? 'Not weighed yet' : `${fmtKg(dispatch.gateKg)} on the scale${dispatch.variancePct !== undefined ? ` · ${fmtPct(dispatch.variancePct, true)}` : ''}${dispatch.gatePassedAt ? ` · ${fmtDateTime(dispatch.gatePassedAt)}` : ''}` },
    { label: short ? 'Delivered short' : 'Delivered', done: !!dispatch.pod, bad: short, detail: dispatch.pod ? `${dispatch.pod.receiverName} counted ${dispatch.pod.bundlesCounted} of ${dispatch.pod.bundlesExpected} · ${fmtDateTime(dispatch.pod.deliveredAt)}` : 'Waiting for proof of delivery' },
    { label: 'Invoiced', done: !!inv, detail: inv ? `${inv.number} · ${fmtMoney(inv.total, inv.currency)}` : 'No invoice yet' },
    { label: 'Paid', done: paid, detail: paid ? 'Payment received' : inv ? 'Balance outstanding' : 'After the invoice' },
  ];
  const current = steps.findIndex((x) => !x.done);
  const dot = (st: (typeof steps)[number], i: number) => (
    <span className={cn('relative z-[1] size-6 rounded-full grid place-items-center t-xs font-semibold num border-2 shrink-0', st.bad ? 'bg-[var(--bad)] border-[var(--bad)] text-white' : st.done ? 'bg-[var(--ok)] border-[var(--ok)] text-white' : i === current ? 'bg-[var(--surface)] border-[var(--accent)] text-[var(--accent-strong)]' : 'bg-[var(--surface)] border-[var(--line-2)] text-[var(--text-3)]')}>
      {st.bad ? <X className="size-3.5" strokeWidth={3} /> : st.done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
    </span>
  );
  if (vertical) {
    return (
      <ol className={cn('flex flex-col', className)}>
        {steps.map((st, i) => (
          <li key={st.label} className="relative flex gap-2.5 pb-3 last:pb-0">
            {i < steps.length - 1 && <span className={cn('absolute left-[11px] top-6 bottom-0 w-0.5', st.done && !st.bad ? 'bg-[var(--ok)]' : 'bg-[var(--line)]')} />}
            {dot(st, i)}
            <div className="min-w-0 pt-px">
              <div className={cn('t-base font-medium leading-snug', st.bad ? 'text-[var(--bad)]' : st.done || i === current ? 'text-[var(--text)]' : 'text-[var(--text-3)]')}>{st.label}</div>
              <div className="t-sm text-[var(--text-3)] leading-snug">{st.detail}</div>
            </div>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className={cn('flex items-start w-full', className)}>
      {steps.map((st, i) => <li key={st.label} className="flex-1 min-w-0 flex flex-col items-center text-center relative" title={st.detail}>
        {i > 0 && <span className={cn('absolute top-[11px] right-1/2 w-full h-0.5', steps[i - 1].done && !steps[i - 1].bad ? 'bg-[var(--ok)]' : 'bg-[var(--line)]')} />}
        {dot(st, i)}
        <span className={cn('mt-1 t-xs font-medium leading-tight px-0.5', st.bad ? 'text-[var(--bad)]' : st.done || i === current ? 'text-[var(--text)]' : 'text-[var(--text-3)]')}>{st.label}</span>
      </li>)}
    </ol>
  );
}

/* ------------------------------------------------------------------ Capture tiles (signature / photo) */
export function CaptureTile({ kind, done, onDone, label, className }: { kind: 'signature' | 'photo'; done: boolean; onDone?: () => void; label?: string; className?: string }) {
  const Icon = kind === 'signature' ? PenLine : Camera;
  const text = label ?? (kind === 'signature' ? 'Signature' : 'Lorry photo');
  const noun = kind === 'signature' ? 'Signature' : 'Photo';
  return (
    <button type="button" onClick={onDone} disabled={!onDone || done} aria-pressed={done}
      className={cn('w-full flex items-center gap-2.5 rounded-lg border px-2.5 py-2 touch:py-3 text-left transition-colors disabled:cursor-default', done ? 'border-[color-mix(in_srgb,var(--ok)_40%,transparent)] bg-[var(--ok-bg)]' : 'border-dashed border-[var(--line-2)] bg-[var(--surface)]', onDone && !done && 'hover:border-[var(--text-3)] hover:bg-[var(--hover)]', className)}>
      <IconChip icon={done ? Check : Icon} color={done ? 'var(--ok)' : 'var(--text-3)'} />
      <span className="min-w-0 flex-1">
        <span className="block t-base font-medium truncate">{done ? `${noun} captured` : onDone ? (kind === 'signature' ? 'Select to sign' : 'Select to take the photo') : `${noun} not captured`}</span>
        <span className="block t-sm text-[var(--text-3)] truncate">{text}</span>
      </span>
      {done && kind === 'signature' && <svg viewBox="0 0 72 24" className="h-6 w-[72px] shrink-0 text-[var(--text-2)]" aria-hidden><path d="M2 18c6-9 9-14 12-13s-3 14 1 14 6-11 9-10-1 9 2 9 5-8 8-8 0 7 3 7 6-9 10-9-2 9 2 9 8-4 16-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      {done && kind === 'photo' && <span className="h-7 w-10 rounded-[4px] shrink-0 border border-[var(--line-2)] bg-[linear-gradient(160deg,var(--surface-3),var(--line-2))] grid place-items-center"><Camera className="size-3.5 text-[var(--text-3)]" /></span>}
    </button>
  );
}

/* ------------------------------------------------------------------ ScaleWidget keyboard bridge */
/**
 * ScaleWidget has no keyboard API, so a page hotkey presses its "Use … kg" button for the user.
 * Returns false when there is no stable reading to use yet.
 */
export function pressUseReading(container: HTMLElement | null): boolean {
  const btn = [...(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])].reverse().find((b) => !b.disabled && /^Use\b.*\bkg\b/.test((b.textContent ?? '').trim()));
  btn?.click();
  return !!btn;
}

/* ------------------------------------------------------------------ CSV export for the ledgers */
export function downloadCsv(filename: string, rows: (string | number | undefined | null)[][]) {
  const esc = (v: string | number | undefined | null) => { const t = v === undefined || v === null ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ Hours between an ISO and now */
export const hoursBetween = (fromIso: string, to: Date | string) => Math.max(0, (new Date(to).getTime() - new Date(fromIso).getTime()) / 3_600_000);
export const fmtHours = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toLocaleString('en-UG', { maximumFractionDigits: 1 })} h`);
