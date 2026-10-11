import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { clsx as cn } from 'clsx';

/**
 * Chart kit. Plain SVG, sized from the container, hover on by default.
 * House rules: one hue per single series; a legend whenever there are two or more series; text never wears the data colour;
 * status colours (ok/warn/bad) are for states only, series colours (--series-n, --cat-*, --site-*) for identity.
 */

/* ───────────────────────────── helpers ───────────────────────────── */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
export function niceScale(maxValue: number, count = 4): { max: number; ticks: number[] } {
  const m = Math.max(1, maxValue);
  const raw = m / count; const pow = Math.pow(10, Math.floor(Math.log10(raw))); const n = raw / pow;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
  const max = Math.ceil(m / step) * step;
  const ticks: number[] = []; for (let v = 0; v <= max + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { max, ticks };
}
export const compactNum = (n: number) => (Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M` : Math.abs(n) >= 1_000 ? `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K` : `${Math.round(n * 10) / 10}`);
const pathOf = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

function Tip({ x, y, children, width }: { x: number; y: number; children: ReactNode; width: number }) {
  const left = Math.max(4, Math.min(width - 164, x + 10));
  return <div className="absolute z-10 pointer-events-none w-[160px] rounded-md border border-[var(--line-2)] bg-[var(--surface)] shadow-[var(--shadow-pop)] px-2.5 py-2 t-sm" style={{ left, top: Math.max(0, y - 8) }}>{children}</div>;
}
export function Legend({ items, className }: { items: { label: string; color: string; value?: ReactNode; dashed?: boolean }[]; className?: string }) {
  return <div className={cn('flex flex-wrap gap-x-4 gap-y-1 t-sm text-[var(--text-2)]', className)}>{items.map((i) => <span key={i.label} className="inline-flex items-center gap-1.5"><span className={cn('shrink-0', i.dashed ? 'w-3 border-t-2 border-dashed' : 'size-2 rounded-[2px]')} style={i.dashed ? { borderColor: i.color } : { background: i.color }} />{i.label}{i.value !== undefined && <span className="num text-[var(--text)] font-medium">{i.value}</span>}</span>)}</div>;
}

/* ───────────────────────────── Delta chip ───────────────────────────── */
/** Change against a reference. Green when the change is good, red when bad; say which direction is good. */
export function Delta({ value, suffix = '%', goodWhen = 'up', label, className }: { value: number | null | undefined; suffix?: string; goodWhen?: 'up' | 'down' | 'none'; label?: string; className?: string }) {
  if (value === null || value === undefined || !isFinite(value)) return null;
  const flat = Math.abs(value) < 0.05;
  const good = goodWhen === 'none' || flat ? null : (value > 0) === (goodWhen === 'up');
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  const color = good === null ? 'var(--text-3)' : good ? 'var(--ok)' : 'var(--bad)';
  const bg = good === null ? 'var(--surface-3)' : good ? 'var(--ok-bg)' : 'var(--bad-bg)';
  return <span title={label} className={cn('inline-flex items-center gap-0.5 rounded-[5px] pl-1 pr-1.5 h-[20px] t-xs font-semibold num whitespace-nowrap', className)} style={{ color, background: bg }}><Icon className="size-3" strokeWidth={2.5} />{flat ? '0' : `${value > 0 ? '+' : ''}${Math.abs(value) >= 100 ? Math.round(value) : value.toFixed(1)}`}{suffix}</span>;
}
export const pctChange = (now: number, before: number) => (before ? ((now - before) / Math.abs(before)) * 100 : null);

/* ───────────────────────────── CountUp ───────────────────────────── */
/** Numbers ease up to their value on mount and when they change, so live screens feel alive. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString('en-UG'), duration = 600 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0); const first = useRef(true);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = first.current ? 0 : from.current; first.current = false;
    if (reduce || start === value) { setShown(value); from.current = value; return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => { const k = Math.min(1, (t - t0) / duration); const e = 1 - Math.pow(1 - k, 3); setShown(start + (value - start) * e); if (k < 1) raf = requestAnimationFrame(tick); else from.current = value; };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value, duration]);
  return <>{format(shown)}</>;
}

/* ───────────────────────────── Sparkline ───────────────────────────── */
export function Sparkline({ data, width = 88, height = 28, color = 'var(--series-1)', area = true, className, fluid }: { data: number[]; width?: number; height?: number; color?: string; area?: boolean; className?: string; /** Fill the container's width */ fluid?: boolean }) {
  const id = useId(); const [ref, measured] = useSize<HTMLDivElement>();
  const w = fluid ? measured : width;
  const draw = () => {
    if (data.length < 2 || w <= 0) return null;
    const min = Math.min(...data), max = Math.max(...data); const span = max - min || 1;
    const pts = data.map((v, i) => [3 + (i / (data.length - 1)) * (w - 7), 4 + (1 - (v - min) / span) * (height - 8)] as [number, number]);
    const last = pts[pts.length - 1];
    return (
      <svg width={w} height={height} className={cn('shrink-0 overflow-visible block', !fluid && className)} aria-hidden>
        <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".2" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {area && <path d={`${pathOf(pts)} L${last[0]},${height} L${pts[0][0]},${height} Z`} fill={`url(#${id})`} />}
        <path d={pathOf(pts)} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={last[0]} cy={last[1]} r="3" fill={color} stroke="var(--surface)" strokeWidth="1.5" />
      </svg>
    );
  };
  if (fluid) return <div ref={ref} className={cn('w-full', className)} style={{ height }}>{draw()}</div>;
  return draw();
}

/* ───────────────────────────── Line / area chart ───────────────────────────── */
export interface LineSeries { name: string; color?: string; data: (number | null)[]; dashed?: boolean; area?: boolean }
export function LineChart({ labels, series, height = 200, format = compactNum, target, partialLast, yMax }: { labels: string[]; series: LineSeries[]; height?: number; format?: (n: number) => string; target?: { value: number; label: string }; partialLast?: boolean; yMax?: number }) {
  const [ref, w] = useSize<HTMLDivElement>(); const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const colors = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-7)'];
  const all = series.flatMap((s) => s.data.filter((v): v is number => v !== null));
  const scale = useMemo(() => niceScale(Math.max(yMax ?? 0, target?.value ?? 0, ...all, 1)), [all.join(','), target?.value, yMax]);
  const m = { l: 40, r: 14, t: 10, b: 24 }; const iw = Math.max(10, w - m.l - m.r); const ih = height - m.t - m.b; const n = labels.length;
  const X = (i: number) => m.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw); const Y = (v: number) => m.t + (1 - v / scale.max) * ih;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 56))));
  return (
    <div>
      {series.length >= 2 && <Legend className="mb-2" items={[...series.map((s, i) => ({ label: s.name, color: s.color ?? colors[i % colors.length], dashed: s.dashed })), ...(target ? [{ label: target.label, color: 'var(--text-3)', dashed: true }] : [])]} />}
      <div ref={ref} className="relative" style={{ height }} onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.round(((e.clientX - r.left - m.l) / iw) * (n - 1)); setHover(Math.max(0, Math.min(n - 1, i))); }}>
        {w > 0 && (
          <svg width={w} height={height} role="img" aria-label={series.map((s) => s.name).join(', ')}>
            <defs>{series.map((s, si) => <linearGradient key={si} id={`${id}-${si}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={s.color ?? colors[si % colors.length]} stopOpacity=".18" /><stop offset="1" stopColor={s.color ?? colors[si % colors.length]} stopOpacity="0" /></linearGradient>)}</defs>
            {scale.ticks.map((t) => <g key={t}><line x1={m.l} x2={w - m.r} y1={Y(t)} y2={Y(t)} stroke="var(--chart-grid)" strokeWidth="1" /><text x={m.l - 8} y={Y(t) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--text-3)" className="num">{format(t)}</text></g>)}
            {labels.map((l, i) => (i % every === 0 || i === n - 1) && <text key={i} x={X(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="10.5" fill={hover === i ? 'var(--text)' : 'var(--text-3)'}>{l}</text>)}
            {target && <g><line x1={m.l} x2={w - m.r} y1={Y(target.value)} y2={Y(target.value)} stroke="var(--text-3)" strokeWidth="1.25" strokeDasharray="4 3" />{series.length < 2 && <text x={w - m.r} y={Y(target.value) - 5} textAnchor="end" fontSize="10.5" fill="var(--text-3)">{target.label} {format(target.value)}</text>}</g>}
            {series.map((s, si) => {
              const col = s.color ?? colors[si % colors.length];
              const pts = s.data.map((v, i) => (v === null ? null : ([X(i), Y(v)] as [number, number]))).filter((p): p is [number, number] => !!p);
              if (!pts.length) return null;
              const solid = partialLast && pts.length > 1 ? pts.slice(0, -1) : pts; const tail = partialLast && pts.length > 1 ? pts.slice(-2) : null;
              const last = pts[pts.length - 1];
              return (
                <g key={si}>
                  {(s.area ?? series.length === 1) && <path d={`${pathOf(pts)} L${last[0]},${m.t + ih} L${pts[0][0]},${m.t + ih} Z`} fill={`url(#${id}-${si})`} />}
                  <path d={pathOf(solid)} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '5 4' : undefined} />
                  {tail && <path d={pathOf(tail)} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeDasharray="2 4" />}
                  <circle cx={last[0]} cy={last[1]} r="4" fill={partialLast ? 'var(--surface)' : col} stroke={partialLast ? col : 'var(--surface)'} strokeWidth="2" />
                </g>
              );
            })}
            {hover !== null && <g><line x1={X(hover)} x2={X(hover)} y1={m.t} y2={m.t + ih} stroke="var(--text-4)" strokeWidth="1" />{series.map((s, si) => { const v = s.data[hover]; return v === null || v === undefined ? null : <circle key={si} cx={X(hover)} cy={Y(v)} r="4.5" fill={s.color ?? colors[si % colors.length]} stroke="var(--surface)" strokeWidth="2" />; })}</g>}
          </svg>
        )}
        {hover !== null && w > 0 && (
          <Tip x={X(hover)} y={m.t} width={w}>
            <div className="font-medium mb-1">{labels[hover]}{partialLast && hover === n - 1 ? ' · so far' : ''}</div>
            {series.map((s, si) => <div key={si} className="flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ background: s.color ?? colors[si % colors.length] }} /><span className="text-[var(--text-2)] truncate">{s.name}</span><span className="num ml-auto font-medium">{s.data[hover] === null || s.data[hover] === undefined ? '—' : format(s.data[hover] as number)}</span></div>)}
            {target && <div className="flex items-center gap-1.5 text-[var(--text-3)]"><span className="w-2 border-t border-dashed border-current" />{target.label}<span className="num ml-auto">{format(target.value)}</span></div>}
          </Tip>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────── Column chart (single or stacked) ───────────────────────────── */
export interface ColumnDatum { label: string; values: number[]; partial?: boolean; target?: number }
export function ColumnChart({ data, series, height = 200, format = compactNum, targetLine, highlightLast }: { data: ColumnDatum[]; series?: { name: string; color: string }[]; height?: number; format?: (n: number) => string; targetLine?: { value: number; label: string }; highlightLast?: boolean }) {
  const [ref, w] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const ser = series ?? [{ name: '', color: 'var(--series-1)' }];
  const totals = data.map((d) => d.values.reduce((t, v) => t + v, 0));
  const scale = useMemo(() => niceScale(Math.max(...totals, targetLine?.value ?? 0, ...data.map((d) => d.target ?? 0), 1)), [totals.join(','), targetLine?.value]);
  const m = { l: 40, r: 10, t: 10, b: 24 }; const iw = Math.max(10, w - m.l - m.r); const ih = height - m.t - m.b; const n = data.length;
  const band = iw / Math.max(1, n); const bw = Math.min(24, Math.max(4, band * 0.6));
  const Y = (v: number) => m.t + (1 - v / scale.max) * ih;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 44))));
  return (
    <div>
      {ser.length >= 2 && <Legend className="mb-2" items={ser.map((s) => ({ label: s.name, color: s.color }))} />}
      <div ref={ref} className="relative" style={{ height }} onMouseLeave={() => setHover(null)} onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.floor((e.clientX - r.left - m.l) / band); setHover(i >= 0 && i < n ? i : null); }}>
        {w > 0 && (
          <svg width={w} height={height} role="img">
            {scale.ticks.map((t) => <g key={t}><line x1={m.l} x2={w - m.r} y1={Y(t)} y2={Y(t)} stroke="var(--chart-grid)" strokeWidth="1" /><text x={m.l - 8} y={Y(t) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--text-3)" className="num">{format(t)}</text></g>)}
            {hover !== null && <rect x={m.l + hover * band} y={m.t} width={band} height={ih} fill="var(--hover)" />}
            {data.map((d, i) => {
              const cx = m.l + i * band + band / 2; let acc = 0;
              const dim = d.partial ? 0.45 : highlightLast && i !== n - 1 && hover === null ? 0.55 : 1;
              return (
                <g key={i} opacity={dim}>
                  {d.values.map((v, si) => {
                    if (v <= 0) return null;
                    const y1 = Y(acc + v), y0 = Y(acc); acc += v; const top = si === d.values.length - 1 || d.values.slice(si + 1).every((x) => x <= 0);
                    const h = Math.max(1, y0 - y1 - (si > 0 ? 2 : 0)); const r = top ? Math.min(4, h) : 0;
                    return <path key={si} d={`M${cx - bw / 2},${y1 + h} L${cx - bw / 2},${y1 + r} Q${cx - bw / 2},${y1} ${cx - bw / 2 + r},${y1} L${cx + bw / 2 - r},${y1} Q${cx + bw / 2},${y1} ${cx + bw / 2},${y1 + r} L${cx + bw / 2},${y1 + h} Z`} fill={ser[si]?.color ?? 'var(--series-1)'} />;
                  })}
                  {d.target !== undefined && <line x1={cx - bw / 2 - 3} x2={cx + bw / 2 + 3} y1={Y(d.target)} y2={Y(d.target)} stroke="var(--text)" strokeWidth="1.5" />}
                </g>
              );
            })}
            {targetLine && <g><line x1={m.l} x2={w - m.r} y1={Y(targetLine.value)} y2={Y(targetLine.value)} stroke="var(--text-3)" strokeWidth="1.25" strokeDasharray="4 3" /><text x={w - m.r} y={Y(targetLine.value) - 5} textAnchor="end" fontSize="10.5" fill="var(--text-3)">{targetLine.label} {format(targetLine.value)}</text></g>}
            {data.map((d, i) => (i % every === 0 || i === n - 1) && <text key={i} x={m.l + i * band + band / 2} y={height - 6} textAnchor="middle" fontSize="10.5" fill={hover === i ? 'var(--text)' : 'var(--text-3)'}>{d.label}</text>)}
          </svg>
        )}
        {hover !== null && w > 0 && (
          <Tip x={m.l + hover * band + band / 2} y={m.t} width={w}>
            <div className="font-medium mb-1">{data[hover].label}{data[hover].partial ? ' · so far' : ''}</div>
            {ser.length >= 2 ? ser.map((s, si) => <div key={si} className="flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ background: s.color }} /><span className="text-[var(--text-2)] truncate">{s.name}</span><span className="num ml-auto font-medium">{format(data[hover].values[si] ?? 0)}</span></div>) : <div className="num font-medium">{format(totals[hover])}</div>}
            {ser.length >= 2 && <div className="flex justify-between border-t border-[var(--line)] mt-1 pt-1"><span className="text-[var(--text-2)]">Total</span><span className="num font-medium">{format(totals[hover])}</span></div>}
            {data[hover].target !== undefined && <div className="flex justify-between text-[var(--text-3)]"><span>Target</span><span className="num">{format(data[hover].target!)}</span></div>}
          </Tip>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────── Donut ───────────────────────────── */
/** Part-to-whole at a glance. Six segments at most; fold the tail into "Other" before passing it in. */
export function Donut({ segments, size = 132, thickness = 16, center, sub }: { segments: { label: string; value: number; color: string }[]; size?: number; thickness?: number; center?: ReactNode; sub?: ReactNode }) {
  const [hover, setHover] = useState<number | null>(null);
  const vis = segments.filter((s) => s.value > 0); const total = vis.reduce((t, s) => t + s.value, 0) || 1;
  const r = (size - thickness) / 2; const c = 2 * Math.PI * r; const gap = vis.length > 1 ? 2.5 : 0;
  let acc = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} onMouseLeave={() => setHover(null)}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={vis.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(', ')}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
        {vis.map((s, i) => { const len = (s.value / total) * c; const off = acc; acc += len; return <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={hover === i ? thickness + 3 : thickness} strokeDasharray={`${Math.max(0, len - gap)} ${c - Math.max(0, len - gap)}`} strokeDashoffset={-off} onMouseEnter={() => setHover(i)} style={{ transition: 'stroke-width .12s' }} />; })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center pointer-events-none px-3">
        <div><div className="num font-semibold leading-none" style={{ fontSize: Math.max(13, size * 0.17) }}>{hover !== null ? `${Math.round((vis[hover].value / total) * 100)}%` : center}</div><div className="t-xs text-[var(--text-3)] mt-1 leading-tight">{hover !== null ? vis[hover].label : sub}</div></div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Progress track with a "now" marker ───────────────────────────── */
/** A span of time with a marker for now. Used for the shift, a contract term, a credit period. */
export function TimeTrack({ progress, startLabel, endLabel, nowLabel, color = 'var(--accent)', onDark }: { progress: number; startLabel: string; endLabel: string; nowLabel?: string; color?: string; onDark?: boolean }) {
  const p = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <div className="w-full">
      <div className={cn('relative h-1.5 rounded-full', onDark ? 'bg-white/15' : 'bg-[var(--surface-3)]')}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${p}%`, background: color }} />
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-3 rounded-full border-2" style={{ left: `${p}%`, background: color, borderColor: onDark ? 'var(--hero-b)' : 'var(--surface)' }} />
      </div>
      <div className={cn('flex justify-between t-xs mt-1.5 num', onDark ? 'text-white/55' : 'text-[var(--text-3)]')}><span>{startLabel}</span>{nowLabel && <span className={onDark ? 'text-white/85' : 'text-[var(--text)]'}>{nowLabel}</span>}<span>{endLabel}</span></div>
    </div>
  );
}
