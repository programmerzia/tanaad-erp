import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { AlertTriangle, Banknote, CheckCircle2, CircleDashed, Eraser, Lock, Minus, PenLine, Plus, Settings, XCircle } from 'lucide-react';
import { useGo, useRefList } from '@/app/hooks';
import { Badge, Button, Empty, IconButton, Input, Sheet, cn } from '@/components/ui';
import { fmtNum, fmtUGX } from '@/data/format';

export type Denoms = Record<string, number>;
export const countedTotal = (d: Denoms, values: number[]) => values.reduce((t, n) => t + n * (d[String(n)] ?? 0), 0);

/** Tone for a variance against the site tolerance: exact = ok, within tolerance = warn, beyond = bad. */
export const varianceTone = (variance: number, threshold: number): 'ok' | 'warn' | 'bad' => (variance === 0 ? 'ok' : Math.abs(variance) <= threshold ? 'warn' : 'bad');

const TH = 'px-2.5 h-8 touch:h-10 t-xs font-semibold text-[var(--text-3)] uppercase tracking-[0.04em] whitespace-nowrap border-b border-[var(--line)] bg-[var(--surface-2)]';

/**
 * Close-day sheet: type the count per denomination down one column, watch the variance, sign, confirm.
 * Keyboard: Tab, Enter or the arrow keys move down the quantity column; Ctrl+Enter signs off.
 */
export function CloseDaySheet({ open, onClose, expected, threshold, cashierName, dayLabel, onConfirm }: { open: boolean; onClose: () => void; expected: number; threshold: number; cashierName: string; dayLabel?: string; onConfirm: (counted: number, denominations: Denoms) => void }) {
  // Notes and coins in circulation come from Settings → Master data (the `denomination` list), in the order set there.
  const denomRefs = useRefList('denomination'); const go = useGo();
  const DENOMINATIONS = useMemo(() => denomRefs.map((r) => r.value).filter((v): v is number => typeof v === 'number' && v > 0), [denomRefs]);
  const [denoms, setDenoms] = useState<Denoms>({});
  const [signed, setSigned] = useState(false);
  const [touched, setTouched] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const signBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) { setDenoms({}); setSigned(false); setTouched(false); } }, [open]);

  const counted = useMemo(() => countedTotal(denoms, DENOMINATIONS), [denoms, DENOMINATIONS]);
  const pieces = DENOMINATIONS.reduce((t, n) => t + (denoms[String(n)] ?? 0), 0);
  const variance = counted - expected;
  const tone = varianceTone(variance, threshold);
  const toneText = tone === 'ok' ? 'text-[var(--ok)]' : tone === 'warn' ? 'text-[var(--warn)]' : 'text-[var(--bad)]';
  const toneBox = tone === 'ok' ? 'bg-[var(--ok-bg)] border-[color-mix(in_srgb,var(--ok)_30%,transparent)]' : tone === 'warn' ? 'bg-[var(--warn-bg)] border-[color-mix(in_srgb,var(--warn)_30%,transparent)]' : 'bg-[var(--bad-bg)] border-[color-mix(in_srgb,var(--bad)_35%,transparent)]';
  const ToneIcon = !touched ? CircleDashed : tone === 'ok' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : XCircle;
  const setQty = (n: number, q: number) => { setTouched(true); setDenoms((d) => ({ ...d, [String(n)]: Math.max(0, Math.min(9999, q)) })); };
  const focusRow = (i: number) => { const el = inputs.current[i]; if (el) { el.focus(); el.select(); } else if (i >= DENOMINATIONS.length) signBtn.current?.focus(); };
  const canConfirm = touched && signed;

  return (
    <Sheet open={open} onClose={onClose} title="Close the day" sub={dayLabel ? `${dayLabel} · count the drawer, then sign` : 'Count the drawer, then sign'} width={540}
      footer={<><span className="mr-auto t-sm text-[var(--text-3)]">{!touched ? 'Count the notes first' : !signed ? 'Sign to confirm the count' : 'Ready to close'}</span><Button onClick={onClose}>Cancel</Button><Button variant="primary" icon={Lock} disabled={!canConfirm} hotkey="mod+enter" hotkeyLabel="Confirm and sign off" onClick={() => onConfirm(counted, denoms)}>Confirm and sign off</Button></>}>
      <div className="flex flex-col gap-3.5">
        <div className="surface-2 grid grid-cols-2 divide-x divide-[var(--line)]">
          <div className="px-3 py-2"><div className="t-label">Expected in drawer</div><div className="num t-kpi mt-0.5">{fmtUGX(expected)}</div></div>
          <div className="px-3 py-2"><div className="t-label">Counted</div><div className={cn('num t-kpi mt-0.5', !touched && 'text-[var(--text-4)]')}>{fmtUGX(counted)}</div></div>
        </div>

        {DENOMINATIONS.length === 0 ? <Empty icon={Banknote} title="No denominations set up" hint="Add the notes and coins in use in Settings → Master data." action={<Button icon={Settings} onClick={() => go.site('settings')}>Open Settings</Button>} /> : (
        <div className="surface overflow-hidden">
          <table className="w-full border-collapse t-base">
            <thead><tr><th className={cn(TH, 'text-left')}>Denomination · UGX</th><th className={cn(TH, 'text-right')}>Quantity</th><th className={cn(TH, 'text-right w-[30%] sm:w-[34%]')}>Subtotal</th></tr></thead>
            <tbody>
              {DENOMINATIONS.map((n, i) => { const q = denoms[String(n)] ?? 0; return (
                <tr key={n} className="border-b border-[var(--line)] last:border-b-0">
                  <td className="px-2.5 py-1 whitespace-nowrap"><span className="t-sm text-[var(--text-3)] max-sm:hidden">UGX </span><span className="num font-semibold">{fmtNum(n)}</span></td>
                  <td className="px-2.5 py-1">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton icon={Minus} label={`One fewer ${fmtNum(n)}`} tabIndex={-1} disabled={q === 0} onClick={() => setQty(n, q - 1)} className="compact:hidden max-sm:hidden border border-[var(--line-2)]" />
                      <Input ref={(el) => { inputs.current[i] = el; }} data-autofocus={i === 0 ? '' : undefined} aria-label={`How many ${fmtNum(n)}`} inputMode="numeric" placeholder="0" value={q ? String(q) : ''}
                        onChange={(e) => setQty(n, parseInt(e.target.value.replace(/\D/g, '') || '0', 10))} onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); focusRow(i + 1); } else if (e.key === 'ArrowDown') { e.preventDefault(); focusRow(i + 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); focusRow(i - 1); } }}
                        className="num text-right font-medium w-[84px]! touch:sm:w-[96px]! max-sm:w-[72px]!" />
                      <IconButton icon={Plus} label={`One more ${fmtNum(n)}`} tabIndex={-1} onClick={() => setQty(n, q + 1)} className="compact:hidden max-sm:hidden border border-[var(--line-2)]" />
                    </div>
                  </td>
                  <td className={cn('px-2.5 py-1 text-right num', q ? 'font-medium' : 'text-[var(--text-4)]')}>{q ? fmtNum(n * q) : '—'}</td>
                </tr>
              ); })}
            </tbody>
            <tfoot><tr className="bg-[var(--surface-2)] font-semibold"><td className="px-2.5 h-9 border-t border-[var(--line-2)]">Counted<span className="max-sm:hidden"> total</span></td><td className="px-2.5 border-t border-[var(--line-2)] text-right num font-normal text-[var(--text-3)]">{fmtNum(pieces)} {pieces === 1 ? 'piece' : 'pieces'}</td><td className="px-2.5 border-t border-[var(--line-2)] text-right num whitespace-nowrap">{fmtNum(counted)}</td></tr></tfoot>
          </table>
        </div>
        )}

        <div className={cn('rounded-lg border px-3.5 py-3 flex items-center gap-3', touched ? toneBox : 'bg-[var(--surface-2)] border-[var(--line)]')} role="status">
          <ToneIcon className={cn('size-5 shrink-0', touched ? toneText : 'text-[var(--text-4)]')} />
          <div className="min-w-0 flex-1">
            <div className="t-base font-semibold">{!touched ? 'Variance against expected' : tone === 'ok' ? 'Balanced to the shilling' : `${variance < 0 ? 'Short' : 'Over'} ${tone === 'warn' ? 'but within tolerance' : 'beyond tolerance'}`}</div>
            <div className="t-sm text-[var(--text-2)]">{!touched ? 'Type the count to see it.' : tone === 'ok' ? 'Counted equals expected.' : tone === 'warn' ? `Inside the ${fmtUGX(threshold)} tolerance. Noted in the audit log.` : `Outside the ${fmtUGX(threshold)} tolerance. An exception goes to the Site Manager.`}</div>
          </div>
          <div className={cn('num t-hero', touched ? toneText : 'text-[var(--text-4)]')}>{touched ? `${variance > 0 ? '+' : variance < 0 ? '−' : ''}${fmtNum(Math.abs(variance))}` : '—'}</div>
        </div>

        <SignaturePad name={cashierName} signed={signed} onChange={setSigned} signRef={signBtn} />
      </div>
    </Sheet>
  );
}

/** A plain canvas you draw on with finger or mouse, plus a "Sign as …" button that writes the name in script (the keyboard path). */
export function SignaturePad({ name, signed, onChange, signRef }: { name: string; signed: boolean; onChange: (signed: boolean) => void; signRef?: RefObject<HTMLButtonElement | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const ctx = () => { const c = ref.current; if (!c) return null; const g = c.getContext('2d'); if (!g) return null; return { c, g }; };
  const resize = () => { const x = ctx(); if (!x) return; const r = x.c.getBoundingClientRect(); if (x.c.width !== Math.round(r.width * 2)) { x.c.width = Math.round(r.width * 2); x.c.height = Math.round(r.height * 2); } };
  useEffect(() => { resize(); }, []);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: (e.clientX - r.left) * 2, y: (e.clientY - r.top) * 2 }; };
  const ink = () => getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#16262c';
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => { resize(); const x = ctx(); if (!x) return; drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); const p = pos(e); x.g.strokeStyle = ink(); x.g.lineWidth = 4; x.g.lineCap = 'round'; x.g.lineJoin = 'round'; x.g.beginPath(); x.g.moveTo(p.x, p.y); };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const x = ctx(); if (!x) return; const p = pos(e); x.g.lineTo(p.x, p.y); x.g.stroke(); if (!signed) onChange(true); };
  const up = () => { drawing.current = false; };
  const clear = () => { const x = ctx(); if (x) x.g.clearRect(0, 0, x.c.width, x.c.height); onChange(false); };
  const signAs = () => { resize(); const x = ctx(); if (!x) return; x.g.clearRect(0, 0, x.c.width, x.c.height); x.g.fillStyle = ink(); x.g.font = `italic 600 ${Math.min(64, (x.c.width / Math.max(8, name.length)) * 1.5)}px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive`; x.g.textBaseline = 'middle'; x.g.fillText(name, 28, x.c.height / 2); onChange(true); };
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="t-sm font-medium text-[var(--text-2)]">Signature · {name}</div>
        <div className="flex items-center gap-1.5">{signed && <Badge tone="ok" dot>Signed</Badge>}<Button ref={signRef} size="sm" icon={PenLine} onClick={signAs}>Sign as {name.split(' ')[0]}</Button><Button size="sm" variant="ghost" icon={Eraser} onClick={clear} disabled={!signed}>Clear</Button></div>
      </div>
      <div className="relative">
        <canvas ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Signature" className="block w-full h-[92px] rounded-lg border border-dashed border-[var(--line-2)] bg-[var(--surface)] touch-none" style={{ touchAction: 'none' }} />
        {!signed && <div className="absolute inset-0 grid place-items-center pointer-events-none t-sm text-[var(--text-3)]">Draw your signature here, or press “Sign as {name.split(' ')[0]}”</div>}
      </div>
    </div>
  );
}
