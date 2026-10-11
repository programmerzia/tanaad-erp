import { useEffect, useRef, useState } from 'react';
import { Bluetooth, Camera, Scale as ScaleIcon } from 'lucide-react';
import { scale } from '@/devices';
import { Button, cn, NumberPad, Tabs } from './ui';

/** Reads from the (simulated) connected scale, or falls back to manual entry + mandatory photo. */
export function ScaleWidget({ targetKg, onReading, disabled, autoStart, title = 'Scale', model = 'Scale connected' }: { targetKg: number; onReading: (kg: number, source: 'bluetooth' | 'manual') => void; disabled?: boolean; autoStart?: boolean; title?: string; model?: string }) {
  const [mode, setMode] = useState<'scale' | 'manual'>('scale');
  const [kg, setKg] = useState<number | null>(null); const [stable, setStable] = useState(false); const [reading, setReading] = useState(false);
  const [manual, setManual] = useState(''); const [photo, setPhoto] = useState(false);
  const stop = useRef<() => void>(() => {});
  const start = () => { setReading(true); setStable(false); setKg(0); stop.current = scale.read(targetKg, (r) => { setKg(r.kg); if (r.stable) { setStable(true); setReading(false); } }); };
  useEffect(() => () => stop.current(), []);
  useEffect(() => { if (autoStart) start(); /* eslint-disable-next-line */ }, [autoStart, targetKg]);
  return (
    <div className="surface p-4">
      <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2 font-semibold"><ScaleIcon className="size-5" />{title}</div><Tabs tabs={[{ value: 'scale', label: <span className="flex items-center gap-1"><Bluetooth className="size-3.5" />Connected</span> }, { value: 'manual', label: 'Manual + photo' }]} value={mode} onChange={setMode} /></div>
      {mode === 'scale' ? (
        <div>
          <div className={cn('num rounded-lg border h-20 touch:h-28 grid place-items-center text-[36px] touch:text-[44px] font-semibold tracking-tight transition-colors', stable ? 'border-[var(--ok)] bg-[var(--ok-bg)]' : reading ? 'border-[var(--accent)]' : 'border-[var(--line)] bg-[var(--surface-2)]')}>{kg === null ? <span className="text-[var(--text-3)] t-base font-normal">Place the load on the scale</span> : <span>{kg.toLocaleString()}<span className="t-lg text-[var(--text-3)] ml-2 font-normal">kg</span></span>}</div>
          <div className="flex items-center justify-between mt-3"><div className="text-[13px] text-[var(--text-2)]">{stable ? 'Stable reading' : reading ? 'Settling…' : model}</div><div className="flex gap-2"><Button onClick={start} disabled={disabled || reading}>{kg === null ? 'Read scale' : 'Read again'}</Button><Button variant="primary" disabled={!stable || disabled} onClick={() => onReading(kg!, 'bluetooth')}>Use {kg?.toLocaleString()} kg</Button></div></div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <NumberPad value={manual} onChange={setManual} allowDecimal suffix="kg" label="Scale display" />
          <div className="flex flex-col gap-3">
            <button onClick={() => setPhoto(true)} className={cn('flex-1 min-h-[120px] rounded-lg border border-dashed grid place-items-center text-center p-4', photo ? 'border-[var(--ok)] bg-[var(--ok-bg)]' : 'border-[var(--line)]')}><div><Camera className="size-5 mx-auto mb-1.5 text-[var(--text-3)]" /><div className="font-semibold">{photo ? 'Photo of scale display captured' : 'Photo of the scale display'}</div><div className="text-[12px] text-[var(--text-2)]">Mandatory on the manual path</div></div></button>
            <Button variant="primary" size="lg" disabled={!manual || !photo || disabled} onClick={() => onReading(parseFloat(manual), 'manual')}>Use {manual || '0'} kg</Button>
          </div>
        </div>
      )}
    </div>
  );
}
