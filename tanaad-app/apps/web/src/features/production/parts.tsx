import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Settings2, type LucideIcon } from 'lucide-react';
import { Badge, Button, Empty, FormRow, NumberPad, Tabs, cn, useIsTouch, type Tone } from '@/components/ui';
import { useGo } from '@/app/hooks';
import { Donut } from '@/components/charts';
import type { MachineTile, massBalanceDay } from '@/data/selectors';
import { fmtKg, fmtNum } from '@/data/format';

/** How each machine state reads everywhere in production: one label, one tone, one colour. */
export const STATE: Record<MachineTile['state'], { label: string; tone: Tone; color: string }> = {
  ok: { label: 'On target', tone: 'ok', color: 'var(--ok)' },
  logged: { label: 'Logged', tone: 'ok', color: 'var(--ok)' },
  below: { label: 'Below target', tone: 'bad', color: 'var(--bad)' },
  not_logged: { label: 'Not logged', tone: 'warn', color: 'var(--warn)' },
  down: { label: 'Down', tone: 'bad', color: 'var(--bad)' },
  arriving: { label: 'Arriving', tone: 'neutral', color: 'var(--text-4)' },
};

/** Product colour swatch. */
export function Swatch({ colour, className }: { colour?: string; className?: string }) {
  return <span className={cn('size-2 rounded-[2px] shrink-0 inline-block', className)} style={{ background: colour ?? 'var(--text-4)' }} />;
}

/** Icon in a tinted square: the house way to add colour to a row. */
export function IconChip({ icon: Icon, color = 'var(--text-3)', className }: { icon: LucideIcon; color?: string; className?: string }) {
  return <span className={cn('size-7 rounded-md grid place-items-center shrink-0', className)} style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}><Icon className="size-4" strokeWidth={2} /></span>;
}

/** A one-line "all clear" for side panels, where a full empty state would only push useful panels down. */
export function Quiet({ icon, title, hint, flush }: { icon: LucideIcon; title: ReactNode; hint?: ReactNode; flush?: boolean }) {
  return <div className={cn('flex items-center gap-2.5', !flush && 'px-[var(--pad)] py-2.5')}><IconChip icon={icon} color="var(--ok)" /><div className="min-w-0"><div className="t-base font-medium leading-snug">{title}</div>{hint && <div className="t-sm text-[var(--text-3)] leading-snug">{hint}</div>}</div></div>;
}

/**
 * Shown where a choice comes from master data and the list is still empty: says what is missing and opens Settings.
 * `inline` is the one-line form for a form row; the default is a full empty state for a panel.
 */
export function SetupHint({ what, where = 'Master data', inline, icon }: { what: string; where?: string; inline?: boolean; icon?: LucideIcon }) {
  const go = useGo(); const open = () => go.site('settings');
  if (inline) return <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-dashed border-[var(--line-2)] px-3 py-1.5 t-sm text-[var(--text-2)]"><span className="min-w-0 flex-1">No {what} yet. Add them in Settings → {where}.</span><Button size="sm" icon={Settings2} onClick={open}>Open Settings</Button></div>;
  return <Empty icon={icon ?? Settings2} title={`No ${what} yet`} hint={`Add ${what} in Settings → ${where}.`} action={<Button size="sm" icon={Settings2} onClick={open}>Open Settings</Button>} />;
}

/* ───────────────────────────── Number fields ───────────────────────────── */
export interface NumField<K extends string> { key: K; label: string; suffix: string; allowDecimal?: boolean; hint?: ReactNode; required?: boolean; max?: number }

/**
 * A group of number fields. On a desk every field is a typed row (Enter moves to the next one);
 * in touch density the fields share one keypad, picked with the tabs above it.
 */
export function NumberFields<K extends string>({ fields, values, onChange, activeKey, resetOn, autoFocusKey }: { fields: NumField<K>[]; values: Record<K, string>; onChange: (key: K, value: string) => void; /** Field the shared keypad starts on (touch). */ activeKey?: K; /** Change this to send the keypad back to `activeKey`. */ resetOn?: unknown; /** Field that takes the keyboard when the form opens (desktop). */ autoFocusKey?: K | null }) {
  const touch = useIsTouch();
  const [active, setActive] = useState<K>(activeKey ?? fields[0].key);
  useEffect(() => { setActive(activeKey ?? fields[0].key); }, [activeKey, resetOn]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = fields.find((f) => f.key === active) ?? fields[0];
  if (touch) {
    return (
      <div>
        <Tabs className="mb-2" value={cur.key} onChange={setActive} tabs={fields.map((f) => ({ value: f.key, label: <span>{f.label} <b className="num text-[var(--text)]">{values[f.key] || '0'}</b></span> }))} />
        <NumberPad value={values[cur.key]} onChange={(v) => onChange(cur.key, v)} allowDecimal={cur.allowDecimal} suffix={cur.suffix} max={cur.max ?? 99999} />
        {cur.hint && <div className="t-xs text-[var(--text-3)] mt-1.5">{cur.hint}</div>}
      </div>
    );
  }
  const next = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || !(e.target instanceof HTMLInputElement)) return;
    const inputs = [...e.currentTarget.querySelectorAll('input')]; const i = inputs.indexOf(e.target);
    if (i >= 0 && i < inputs.length - 1) { e.preventDefault(); inputs[i + 1].focus(); inputs[i + 1].select(); }
  };
  return (
    <div onKeyDown={next}>
      {fields.map((f) => (
        <FormRow key={f.key} label={f.label} required={f.required}>
          <div className="flex items-center gap-3">
            <div className="w-[164px] shrink-0"><NumberPad value={values[f.key]} onChange={(v) => onChange(f.key, v)} allowDecimal={f.allowDecimal} suffix={f.suffix} max={f.max ?? 99999} autoFocus={f.key === autoFocusKey} /></div>
            {f.hint && <div className="t-sm text-[var(--text-3)] min-w-0 leading-snug">{f.hint}</div>}
          </div>
        </FormRow>
      ))}
    </div>
  );
}

/* ───────────────────────────── Mass balance ───────────────────────────── */
type MassDay = ReturnType<typeof massBalanceDay>;

export function massSegments(mb: MassDay) {
  return [
    { label: 'Output', value: Math.round(mb.kgOut), color: 'var(--series-1)' },
    { label: 'Work in progress', value: Math.round(mb.wipDeltaKg), color: 'var(--series-3)' },
    { label: 'Weighed waste', value: Math.round(mb.wasteKg), color: 'var(--series-4)' },
    { label: 'Allowed loss', value: Math.round(Math.min(mb.allowedLossKg, Math.max(0, mb.kgIn - mb.kgOut - mb.wipDeltaKg - mb.wasteKg))), color: 'var(--text-4)' },
    { label: 'Unaccounted', value: Math.max(0, Math.round(mb.gapKg)), color: 'var(--bad)' },
  ].filter((x) => x.value > 0);
}

export function MassBadge({ mb }: { mb: MassDay }) {
  if (mb.kgIn <= 0) return <Badge tone="neutral">No input yet</Badge>;
  return <Badge tone={mb.state === 'balanced' ? 'ok' : mb.state === 'explainable' ? 'warn' : 'bad'} dot>{mb.state === 'balanced' ? 'Balanced' : mb.state === 'explainable' ? 'Within allowed loss' : `${fmtKg(Math.round(mb.gapKg))} unaccounted`}</Badge>;
}

/** Where the day's kilos went: a donut of the parts with the values beside it. */
export function MassBalance({ mb, size = 112 }: { mb: MassDay; size?: number }) {
  const parts = massSegments(mb);
  if (mb.kgIn <= 0) return <Empty title="No material issued yet" hint="The balance fills in as the first stage logs its input." />;
  return (
    <div className="flex items-center gap-4">
      <Donut segments={parts} size={size} thickness={Math.round(size / 8)} center={fmtNum(Math.round(mb.kgIn))} sub="kg in" />
      <div className="flex-1 min-w-0">{parts.map((b) => <div key={b.label} className="flex items-center gap-2 h-6 t-sm"><span className="size-2 rounded-[2px] shrink-0" style={{ background: b.color }} /><span className="text-[var(--text-2)] truncate flex-1">{b.label}</span><span className="num font-medium whitespace-nowrap">{fmtNum(b.value)} kg</span></div>)}</div>
    </div>
  );
}
