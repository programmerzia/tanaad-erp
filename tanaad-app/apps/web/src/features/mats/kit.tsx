import { forwardRef, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Factory, FlaskConical, LayoutGrid, Package, Scissors, Warehouse, Wind, type LucideIcon } from 'lucide-react';
import type { Label, Machine, Person, Product, Site, SiteCode } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useGo, useRefList, useSite } from '@/app/hooks';
import { shiftId, currentShiftKind } from '@/data/selectors';
import { MiniBars, cn, useHotkey, type Tone } from '@/components/ui';
import { PersonPicker } from '@/components/PersonPicker';
import { Sticker } from '@/components/Sticker';
import { printer } from '@/devices';
import { fmtNum } from '@/data/format';

/* ───────────────────────────── Colours ───────────────────────────── */
/** The site's colours as set up in Settings → Master data: names in the user's order, and the swatch of each. */
export function useColours() {
  const items = useRefList('colour', { includeInactive: true });
  return useMemo(() => ({ names: items.filter((c) => c.active).map((c) => c.label), hex: Object.fromEntries(items.map((c) => [c.label, c.color])) as Record<string, string | undefined> }), [items]);
}
/** Small colour swatch. Always sits next to the colour's name. Takes a colour name from master data (or any CSS colour). */
export function ColourDot({ colour, size = 10, className }: { colour?: string; size?: number; className?: string }) {
  const { hex } = useColours();
  return <span aria-hidden className={cn('inline-block rounded-[3px] border border-black/15 dark:border-white/20 shrink-0', className)} style={{ width: size, height: size, background: colour ? hex[colour] ?? (/^(#|rgb|hsl|var\()/.test(colour) ? colour : 'var(--text-4)') : 'var(--surface-3)' }} />;
}
export const colourChip = (c: string): { value: string; label: ReactNode } => ({ value: c, label: <span className="inline-flex items-center gap-1.5"><ColourDot colour={c} />{c}</span> });

/* ───────────────────────────── Shift and production ───────────────────────────── */
/** Current shift context for a production screen. */
export function useShift() {
  const today = useStore((s) => s.today); const site = useSite(); const kind = currentShiftKind();
  return { today, site, kind, kindLabel: kind === 'day' ? 'Day' : 'Night', shift: shiftId(site.id, today, kind) };
}

/** Add to the shift's production entry for a machine and stage (the store upserts one entry per shift × machine × stage). */
export function addProduction(e: { siteId: SiteCode; stageCode: string; machineId: string; shiftId: string; day: string; operatorId?: string; productId?: string; goodUnits?: number; rejectUnits?: number; inputKg?: number; outputKg?: number }) {
  const s = useStore.getState();
  const ex = s.production.find((p) => p.shiftId === e.shiftId && p.machineId === e.machineId && p.stageCode === e.stageCode);
  s.recordProduction({
    siteId: e.siteId, stageCode: e.stageCode, machineId: e.machineId, shiftId: e.shiftId, day: e.day,
    operatorId: e.operatorId ?? ex?.operatorId, productId: e.productId ?? ex?.productId,
    goodUnits: (ex?.goodUnits ?? 0) + (e.goodUnits ?? 0), rejectUnits: (ex?.rejectUnits ?? 0) + (e.rejectUnits ?? 0),
    inputKg: (ex?.inputKg ?? 0) + (e.inputKg ?? 0), outputKg: (ex?.outputKg ?? 0) + (e.outputKg ?? 0),
    downtimeMin: ex?.downtimeMin ?? 0, downtimeReason: ex?.downtimeReason,
  });
}

/**
 * Worker picker for one sector of the current site.
 * Kept for the screens that still import it; it is now the shared PersonPicker (searchable, keyboard-driven) with the sector listed first.
 */
export function OperatorTiles({ sector, value, onChange }: { sector: string; value?: string | null; onChange: (id: string) => void; limit?: number }) {
  const site = useSite();
  return <PersonPicker siteId={site.id} sector={sector} value={value ?? null} onChange={(id) => { if (id) onChange(id); }} placeholder={`Search ${sector.toLowerCase()} worker by name`} />;
}

/* ───────────────────────────── Stickers ───────────────────────────── */
/** A label that does not exist yet, for the live sticker preview. The code is the next number the store will issue. */
export function draftLabel(issued: number, l: Omit<Label, 'id' | 'code' | 'status'>): Label {
  return { ...l, id: 'draft-next', status: 'in_stock', code: `${l.siteId.toUpperCase().slice(0, 3)}-${l.kind.toUpperCase().slice(0, 3)}-${String(issued + 1).padStart(6, '0')}` };
}

/** Where a sticker is shown: a quiet tray with the printer slot the sticker rolls out of. */
export function StickerStage({ children, caption, className }: { children: ReactNode; caption?: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 pb-3 flex flex-col items-center overflow-hidden', className)}>
      <div aria-hidden className="h-1.5 w-[86%] max-w-[324px] rounded-b-[4px] bg-[var(--text-3)] mb-3" />
      {children}
      {caption && <div className="t-xs text-[var(--text-3)] mt-2.5 text-center max-w-[300px]">{caption}</div>}
    </div>
  );
}

/** Sequential print animation: the first few stickers roll out of the printer one by one, the rest are counted. */
export function PrintRun({ labels, site, product, machine, operator, shiftKind, show = 3, onDone }: { labels: Label[]; site: Site; product?: Product; machine?: Machine; operator?: Person; shiftKind?: string; show?: number; onDone?: () => void }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true; setN(0);
    (async () => {
      for (let i = 0; i < labels.length; i++) {
        if (i < show) await printer.print({ code: labels[i].code, lines: [] }); else await new Promise((r) => setTimeout(r, 120));
        if (!alive) return; setN(i + 1);
      }
      if (alive) onDone?.();
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labels]);
  if (labels.length === 0) return null;
  const done = Math.min(n, labels.length);
  return (
    <div className="flex flex-wrap gap-3 items-stretch">
      {labels.slice(0, show).map((l, i) => i < n
        ? <Sticker key={l.id} label={l} product={product} machine={machine} operator={operator} site={site} shiftKind={shiftKind} compact printing />
        : <div key={l.id} className="w-[220px] min-h-[168px] rounded-md border border-dashed border-[var(--line-2)] grid place-items-center t-sm text-[var(--text-3)]">{i === n ? 'Printing…' : 'Queued'}</div>)}
      {labels.length > show && (
        <div className="self-center min-w-[120px]">
          <div className="t-base font-semibold">+{labels.length - show} more</div>
          <div className="num t-sm text-[var(--text-3)]">{done} of {labels.length} printed</div>
          <div className="mt-1.5 h-1 w-[120px] rounded-[2px] bg-[var(--surface-3)] overflow-hidden"><div className="h-full bg-[var(--series-1)] transition-[width] duration-200" style={{ width: `${(done / labels.length) * 100}%` }} /></div>
        </div>
      )}
    </div>
  );
}

/** Small column trend for day and week summaries. One hue; the current period is drawn lighter because it is still running. */
export function TrendBars({ points, format }: { points: { key: string; label: string; value: number; current?: boolean }[]; format?: (v: number) => string }) {
  return <MiniBars data={points.map((p) => ({ label: p.label, value: p.value, partial: p.current }))} format={format} height={88} />;
}

/* ───────────────────────────── The seven-stage flow ───────────────────────────── */
const STAGE_META: Record<string, { short: string; icon: LucideIcon; to?: string }> = {
  raw: { short: 'Raw', icon: Package },
  mixer: { short: 'Mixer', icon: FlaskConical, to: 'production/mixer' },
  extrude: { short: 'Extruders', icon: Factory, to: 'production/extruders' },
  dry: { short: 'Drying', icon: Wind, to: 'production/extruders' },
  weave: { short: 'Weaving', icon: LayoutGrid, to: 'production/wall' },
  finish: { short: 'Finishing', icon: Scissors, to: 'production/finishing' },
  store: { short: 'Store', icon: Warehouse },
};

/** Today's figure at every stage of the mats flow, so each workstation shows where the kilos are. */
function useFlowFigures(): Record<string, { value: string; unit: string; title: string }> {
  const production = useStore((s) => s.production); const labels = useStore((s) => s.labels); const today = useStore((s) => s.today);
  return useMemo(() => {
    const prod = production.filter((p) => p.siteId === 'mats' && p.day === today);
    const sum = (stage: string, f: (p: (typeof prod)[number]) => number) => Math.round(prod.filter((p) => p.stageCode === stage).reduce((t, p) => t + f(p), 0));
    const mine = labels.filter((l) => l.siteId === 'mats');
    return {
      raw: { value: fmtNum(sum('mixer', (p) => p.inputKg)), unit: 'kg', title: 'Pellets and masterbatch issued to the mixer today' },
      mixer: { value: fmtNum(mine.filter((l) => l.kind === 'batch' && l.day === today).length), unit: 'batches', title: 'Mixer batches labelled today' },
      extrude: { value: fmtNum(sum('extrude', (p) => p.outputKg)), unit: 'kg', title: 'String out of the extruders today' },
      dry: { value: fmtNum(mine.filter((l) => l.kind === 'rack' && l.status === 'in_stock').length), unit: 'racks', title: 'Drying racks waiting for weaving' },
      weave: { value: fmtNum(sum('weave', (p) => p.goodUnits)), unit: 'mats', title: 'Mats woven today' },
      finish: { value: fmtNum(mine.filter((l) => l.kind === 'bundle' && l.day === today).length), unit: 'bundles', title: 'Bundles labelled today' },
      store: { value: fmtNum(mine.filter((l) => l.kind === 'bundle' && l.status === 'in_stock').length), unit: 'bundles', title: 'Bundles in the store now' },
    };
  }, [production, labels, today]);
}

/**
 * The process strip: every stage of the site's flow with today's figure, the current stage marked.
 * Stages with their own screen are links; [ and ] step to the previous and next one.
 */
export function FlowStrip({ current, note }: { current: string | string[]; note?: ReactNode }) {
  const site = useSite(); const go = useGo(); const figures = useFlowFigures();
  const cur = Array.isArray(current) ? current : [current];
  const scroller = useRef<HTMLDivElement>(null);
  const stages = [...site.stages].sort((a, b) => a.sequence - b.sequence);
  const here = STAGE_META[cur[0]]?.to;
  const screens = stages.map((st) => ({ to: STAGE_META[st.code]?.to, name: STAGE_META[st.code]?.short ?? st.name })).filter((x, i, all): x is { to: string; name: string } => !!x.to && all.findIndex((y) => y.to === x.to) === i);
  const at = screens.findIndex((x) => x.to === here);
  const prev = at > 0 ? screens[at - 1] : undefined; const next = at >= 0 && at < screens.length - 1 ? screens[at + 1] : undefined;
  useHotkey(prev ? '[' : null, () => prev && go.site(prev.to), { label: `Previous stage${prev ? `: ${prev.name}` : ''}` });
  useHotkey(next ? ']' : null, () => next && go.site(next.to), { label: `Next stage${next ? `: ${next.name}` : ''}` });
  useEffect(() => {
    const box = scroller.current; const el = box?.querySelector<HTMLElement>('[aria-current="step"]');
    if (box && el) box.scrollLeft = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2;
  }, []);
  return (
    <section className="surface overflow-hidden" aria-label={`${site.name} process`}>
      <div ref={scroller} className="flex overflow-x-auto no-scrollbar">
        {stages.map((st, i) => {
          const meta = STAGE_META[st.code]; const Icon = meta?.icon ?? Package; const on = cur.includes(st.code); const fig = figures[st.code];
          const link = !!meta?.to && meta.to !== here;
          const body = (
            <>
              <span className="hidden xl:grid size-7 rounded-md place-items-center shrink-0" style={{ background: on ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'var(--surface-3)', color: on ? 'var(--accent-strong)' : 'var(--text-3)' }}><Icon className="size-4" strokeWidth={2} /></span>
              <span className="min-w-0">
                <span className={cn('block t-xs whitespace-nowrap', on ? 'font-semibold text-[var(--text)]' : 'text-[var(--text-3)]')}><span className="num">{i + 1}</span> · {meta?.short ?? st.name}</span>
                <span className="block t-base font-semibold num whitespace-nowrap leading-tight">{fig?.value ?? '—'}{fig && <span className="t-xs font-normal text-[var(--text-3)]"> {fig.unit}</span>}</span>
              </span>
              {on && <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-[var(--accent)]" />}
            </>
          );
          const cls = cn('relative flex-1 min-w-[104px] flex items-center gap-2.5 px-3 py-2 text-left border-r border-[var(--line)] last:border-r-0', on && 'bg-[var(--selected)]');
          return link
            ? <button key={st.code} type="button" title={fig?.title} onClick={() => go.site(meta!.to!)} className={cn(cls, 'hover:bg-[var(--hover)] outline-offset-[-2px]')}>{body}</button>
            : <div key={st.code} title={fig?.title} aria-current={on ? 'step' : undefined} className={cls}>{body}</div>;
        })}
      </div>
      {note && <div className="px-[var(--pad)] py-2 border-t border-[var(--line)] bg-[var(--surface-2)] t-sm text-[var(--text-2)]">{note}</div>}
    </section>
  );
}

/* ───────────────────────────── Workstation layout and form pieces ───────────────────────────── */
/** Form on the left, preview and "today so far" on the right. Stacks below 1240 px, where the side panels sit two abreast. */
export function Workbench({ children, aside, asideWidth = 360 }: { children: ReactNode; aside: ReactNode; asideWidth?: number }) {
  return (
    <div className="grid gap-[var(--gap)] items-start min-[1240px]:[grid-template-columns:minmax(0,1fr)_var(--aside)]" style={{ ['--aside' as string]: `${asideWidth}px` }}>
      <div className="min-w-0 flex flex-col gap-[var(--gap)]">{children}</div>
      <aside className="min-w-0 grid gap-[var(--gap)] items-start md:max-[1239px]:grid-cols-2">{aside}</aside>
    </div>
  );
}

/** A numbered section of a workstation form. */
export function FormSection({ n, title, hint, children }: { n: number; title: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="py-3 first:pt-0 last:pb-0 border-b border-[var(--line)] last:border-b-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="size-5 rounded-[5px] grid place-items-center bg-[var(--surface-3)] t-xs font-semibold num text-[var(--text-2)]">{n}</span>
        <h4 className="t-label">{title}</h4>
        {hint && <span className="t-xs text-[var(--text-3)] truncate">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** Stacked label + control for sheets. A div rather than a label, so a click between chips never selects the first one. */
export function FieldBlock({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return <div className={className}><div className="t-sm font-medium text-[var(--text-2)] mb-1">{label}</div>{children}{hint && <div className="t-xs text-[var(--text-3)] mt-1">{hint}</div>}</div>;
}

/** One figure of a computed breakdown: small label, number, optional line under it. */
export function Figure({ label, value, sub, tone = 'neutral', className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone; className?: string }) {
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'bad' ? 'var(--bad)' : 'var(--text)';
  return <div className={cn('min-w-0', className)}><div className="t-xs text-[var(--text-3)] truncate">{label}</div><div className="num t-kpi whitespace-nowrap" style={{ color }}>{value}</div>{sub && <div className="t-xs text-[var(--text-3)] truncate">{sub}</div>}</div>;
}

/** Focus the first control of a form: the selected chip of a chip group, or the first input. */
export function focusFirstField(root: HTMLElement | null) {
  root?.querySelector<HTMLElement>('[role="radio"][tabindex="0"], input:not([disabled]), textarea:not([disabled]), select:not([disabled])')?.focus();
}

/**
 * Ctrl/Cmd+Enter pressed inside a form. Handled here, before an open picker can read the Enter as "choose the highlighted option".
 * Put it on the element that wraps the fields: onKeyDownCapture={onModEnter(submit)}.
 */
export const onModEnter = (run: () => void) => (e: ReactKeyboardEvent) => {
  if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
  e.preventDefault(); e.stopPropagation(); run();
};

/**
 * Wraps a required picker so Tab goes from it straight to the next field: the picker's small clear button leaves the Tab order
 * (it stays clickable, and choosing another option replaces the value).
 */
export function TabThrough({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const fix = () => el.querySelectorAll<HTMLElement>('button[aria-label="Clear"]').forEach((b) => { b.tabIndex = -1; });
    fix();
    const mo = new MutationObserver(fix); mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}

/** Arrow-key navigation for a grid of tiles that behaves like a list: one tab stop, arrows move, Home/End jump, Enter opens (native on buttons). */
export function useRovingGrid(count: number) {
  const ref = useRef<HTMLDivElement>(null); const [active, setActive] = useState(0);
  const index = Math.max(0, Math.min(count - 1, active));
  const onKeyDown = (e: ReactKeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[data-roving]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement); if (i < 0) return;
    const cols = Math.max(1, items.filter((el) => el.offsetTop === items[0].offsetTop).length); const last = items.length - 1;
    let n = i;
    if (e.key === 'ArrowRight') n = Math.min(last, i + 1);
    else if (e.key === 'ArrowLeft') n = Math.max(0, i - 1);
    else if (e.key === 'ArrowDown') n = i + cols <= last ? i + cols : i;
    else if (e.key === 'ArrowUp') n = i - cols >= 0 ? i - cols : i;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = last;
    else return;
    e.preventDefault(); setActive(n); items[n]?.focus();
  };
  return { ref, onKeyDown, index, setActive, tabIndex: (i: number) => (i === index ? 0 : -1) };
}

/* ───────────────────────────── Scale ───────────────────────────── */
/**
 * Seats the shared ScaleWidget inside a Panel: drops its own card so there is no card in a card,
 * and brings its reading box to the house radius and the 40 px cap for a hero numeral.
 */
export const ScaleFrame = forwardRef<HTMLDivElement, { children: ReactNode; className?: string }>(function ScaleFrame({ children, className }, ref) {
  return <div ref={ref} className={cn('[&>.surface]:border-0 [&>.surface]:shadow-none [&>.surface]:bg-transparent [&>.surface]:p-0 [&>.surface]:rounded-none [&_.rounded-2xl]:rounded-lg [&_.num.rounded-2xl]:h-24 [&_.num.rounded-2xl]:text-[40px] [&_.num.rounded-2xl]:font-semibold', className)}>{children}</div>;
});

/** Keyboard step for a ScaleWidget: uses the stable reading if there is one, otherwise starts a reading. Returns what it did. */
export function pressScale(root: HTMLElement | null): 'used' | 'reading' | null {
  const buttons = [...(root?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])];
  const use = buttons.find((b) => /^Use\b/.test(b.textContent ?? '')); if (use) { use.click(); return 'used'; }
  const read = buttons.find((b) => /^Read\b/.test(b.textContent ?? '')); if (read) { read.click(); return 'reading'; }
  return null;
}
