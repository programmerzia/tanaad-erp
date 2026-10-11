import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Boxes, CalendarDays, Factory, GitBranch, Hash, History, Layers, MapPin, PackageCheck, Printer, Route, ScanLine, Shuffle, Tag, Trash2, Truck, User, Weight, XCircle, type LucideIcon } from 'lucide-react';
import type { Label, LabelStatus } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite, useQueryParam } from '@/app/hooks';
import { Avatar, Badge, Button, DataGrid, Empty, Input, Kbd, Note, PageHeader, Panel, Row, Split, StackedBar, cn, useHotkey, type Column, type Tone } from '@/components/ui';
import { Sticker } from '@/components/Sticker';
import { labelHistory } from '@/data/selectors';
import { fmtDayLong, fmtDayShort, fmtDateTime, fmtKg, fmtNum, fmtTime } from '@/data/format';
import { cap } from './shared';
import { IconChip, Swatch } from './parts';

const STATUS_TONE: Record<LabelStatus, Tone> = { created: 'neutral', in_stock: 'ok', consumed: 'neutral', dispatched: 'info', scrapped: 'bad' };
const STATUS_TEXT: Record<LabelStatus, string> = { created: 'Created', in_stock: 'In stock', consumed: 'Consumed', dispatched: 'Dispatched', scrapped: 'Scrapped' };
// Identity colours for the part-to-whole of labels by status (series colours, not state colours).
const STATUS_SERIES: Record<LabelStatus, string> = { in_stock: 'var(--series-3)', dispatched: 'var(--series-1)', consumed: 'var(--series-7)', created: 'var(--series-4)', scrapped: 'var(--series-8)' };
const toneColor: Record<string, string> = { ok: 'var(--ok)', bad: 'var(--bad)', warn: 'var(--warn)', info: 'var(--info)', neutral: 'var(--text-3)' };

interface TrailEvent { at: string; title: string; detail?: string; tone: Tone; icon: LucideIcon; approx?: boolean }

function Fact({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="t-xs text-[var(--text-3)] flex items-center gap-1"><Icon className="size-3" />{label}</dt><dd className="t-base font-medium m-0 truncate flex items-center gap-1.5">{children}</dd></div>;
}

/** A scanner for any sticker: type or scan a code and see the lot's whole life. */
export function ScanAnything() {
  const s = useStore(); const site = useSite(); const qParam = useQueryParam('q');
  const [code, setCode] = useState('');
  const [current, setCurrent] = useState<string | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  // A hand scanner types into whatever has focus, so the field takes it back after every result.
  useEffect(() => { input.current?.focus(); }, [current, unknown]);
  const label = useMemo(() => s.labels.find((l) => l.id === current), [s.labels, current]);
  const h = label ? labelHistory(s, label) : undefined;

  const lookup = (raw: string) => {
    const q = raw.trim().toUpperCase(); if (!q) return;
    const found = s.labels.find((l) => l.code.toUpperCase() === q || l.id.toUpperCase() === q);
    if (found) { setCurrent(found.id); setUnknown(null); setRecent((r) => [found.id, ...r.filter((x) => x !== found.id)].slice(0, 10)); }
    else { setUnknown(q); setCurrent(null); }
    setCode('');
  };
  // The command palette deep-links here with ?q=<code>.
  useEffect(() => { if (qParam) lookup(qParam); }, [qParam]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = (e: FormEvent) => { e.preventDefault(); lookup(code); };
  const simulate = (status?: LabelStatus) => { const pool = s.labels.filter((l) => l.siteId === site.id && (status ? l.status === status : true)); if (!pool.length) { useStore.getState().toast({ kind: 'warn', title: 'Nothing to scan', detail: `No ${status ? STATUS_TEXT[status].toLowerCase() : ''} labels on this site.` }); return; } lookup(pool[Math.floor(Math.random() * pool.length)].code); };
  // Function keys, because the cursor always sits in the scan field.
  useHotkey('f2', () => simulate('in_stock'), { label: 'Simulate a scan: in stock', allowInInput: true });
  useHotkey('f4', () => simulate('dispatched'), { label: 'Simulate a scan: dispatched', allowInInput: true });
  useHotkey('f8', () => simulate('consumed'), { label: 'Simulate a scan: consumed', allowInInput: true });
  useHotkey('f9', () => simulate(), { label: 'Simulate a scan: any label', allowInInput: true });
  const sims: { keys: string; text: string; status?: LabelStatus }[] = [{ keys: 'f2', text: 'In stock', status: 'in_stock' }, { keys: 'f4', text: 'Dispatched', status: 'dispatched' }, { keys: 'f8', text: 'Consumed', status: 'consumed' }, { keys: 'f9', text: 'Any label' }];

  // Event trail: real store events when this session created them, otherwise the seed's shift times.
  const trail = useMemo(() => {
    if (!label) return [];
    const ev = s.events.filter((e) => { const p = e.payload as { id?: string; labelId?: string } | undefined; return p?.id === label.id || p?.labelId === label.id; });
    const created = ev.find((e) => e.type === 'LabelCreated')?.occurredAt ?? `${label.day}T${label.shiftId?.endsWith('night') ? '22:40' : '14:20'}:00+03:00`;
    const out: TrailEvent[] = [{ at: created, title: 'Created and printed', detail: `${h?.machine?.code ?? 'No machine'}${h?.operator ? ` · ${h.operator.fullName}` : ''}`, tone: 'neutral', icon: Printer, approx: !ev.length }];
    if (label.status !== 'created') out.push({ at: ev.find((e) => e.type === 'StockMoved')?.occurredAt ?? created, title: 'Into stock', detail: s.zones.find((z) => z.id === label.zoneId)?.name ?? 'Zone not recorded', tone: 'ok', icon: Boxes, approx: !ev.length });
    const dsp = h?.dispatch;
    if (dsp) {
      out.push({ at: ev.find((e) => e.type === 'BundleScannedForDispatch')?.occurredAt ?? dsp.createdAt, title: 'Scanned for dispatch', detail: dsp.deliveryNoteNo, tone: 'info', icon: ScanLine });
      if (dsp.gatePassedAt) out.push({ at: dsp.gatePassedAt, title: dsp.gateStatus === 'overridden' ? 'Left the gate (override)' : 'Left the gate', detail: `${dsp.vehicle} · ${dsp.driver}${dsp.gateKg ? ` · ${fmtKg(dsp.gateKg)} on the scale` : ''}`, tone: dsp.gateStatus === 'overridden' ? 'warn' : 'info', icon: Truck });
      if (dsp.pod) out.push({ at: dsp.pod.deliveredAt, title: 'Delivered', detail: `Received by ${dsp.pod.receiverName} · ${dsp.pod.bundlesCounted} of ${dsp.pod.bundlesExpected} counted`, tone: dsp.pod.bundlesCounted === dsp.pod.bundlesExpected ? 'ok' : 'bad', icon: PackageCheck });
    }
    if (label.status === 'consumed') { const child = s.labels.find((l) => l.parentIds.includes(label.id)); out.push({ at: ev.find((e) => e.type === 'LabelConsumed')?.occurredAt ?? `${label.day}T19:05:00+03:00`, title: 'Consumed by the next stage', detail: child ? `Became part of ${child.code}` : 'Used in production', tone: 'neutral', icon: GitBranch, approx: !ev.length }); }
    if (label.status === 'scrapped') out.push({ at: ev.find((e) => e.type === 'StockMoved')?.occurredAt ?? created, title: 'Scrapped', tone: 'bad', icon: Trash2 });
    return out.sort((a, b) => a.at.localeCompare(b.at));
  }, [label, s.events, s.zones, s.labels, h]);

  const order = h?.dispatch ? s.orders.find((o) => o.id === h.dispatch!.orderId) : undefined; const client = order ? s.clients.find((c) => c.id === order.clientId) : undefined;
  const mine = useMemo(() => s.labels.filter((l) => l.siteId === site.id), [s.labels, site.id]);
  const inStock = mine.filter((l) => l.status === 'in_stock').length;
  const byStatus = (['in_stock', 'dispatched', 'consumed', 'created', 'scrapped'] as LabelStatus[]).map((st) => ({ label: STATUS_TEXT[st], value: mine.filter((l) => l.status === st).length, color: STATUS_SERIES[st] }));
  const latest = useMemo(() => [...mine].reverse().slice(0, 10), [mine]);
  const children = label ? s.labels.filter((l) => l.parentIds.includes(label.id)) : [];
  const lot = (l: Label) => s.products.find((x) => x.id === l.productId)?.internalName ?? l.colour ?? l.grade ?? cap(l.kind);
  const latestCols: Column<Label>[] = [
    { key: 'code', header: 'Code', cell: (l) => <span className="code font-medium">{l.code}</span> },
    { key: 'kind', header: 'Kind', cell: (l) => cap(l.kind) },
    { key: 'lot', header: 'Lot', truncate: 180, cell: (l) => { const p = s.products.find((x) => x.id === l.productId); return <span className="inline-flex items-center gap-1.5">{p && <Swatch colour={p.colour} />}{lot(l)}</span>; } },
    { key: 'kg', header: 'Kg', align: 'right', mono: true, cell: (l) => fmtNum(l.qtyKg) },
    { key: 'day', header: 'Made', cell: (l) => <span className="text-[var(--text-2)]">{fmtDayShort(l.day)}</span> },
    { key: 'st', header: 'Status', cell: (l) => <Badge tone={STATUS_TONE[l.status]} dot>{STATUS_TEXT[l.status]}</Badge> },
  ];
  const chip = 'code t-sm font-medium h-6 px-2 rounded-md border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] inline-flex items-center';
  const shiftOf = label?.shiftId?.split('_').pop();

  return (
    <div>
      <PageHeader eyebrow={`${site.name} · Production`} title="Scan anything" subtitle="Point the scanner at any Tanaad sticker, or type its code." meta={<Badge tone="neutral">{fmtNum(inStock)} labels in stock here</Badge>} />
      <Split asideWidth={340} aside={<>
        <Panel icon={History} title="Recent scans" sub={recent.length ? `${recent.length} this session` : 'this session'} pad={false}>
          {recent.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={ScanLine} title="Nothing scanned yet" hint="Each sticker you look up is kept here so you can go back to it." /></div> : <div className="px-2">{recent.map((id) => { const l = s.labels.find((x) => x.id === id); if (!l) return null; return <Row key={id} selected={id === current} onClick={() => lookup(l.code)} left={<IconChip icon={Tag} color={id === current ? 'var(--accent)' : 'var(--text-3)'} />} title={<span className="code">{l.code}</span>} sub={`${lot(l)} · ${fmtKg(l.qtyKg)}`} right={<Badge tone={STATUS_TONE[l.status]}>{STATUS_TEXT[l.status]}</Badge>} />; })}</div>}
        </Panel>
        <Panel icon={Layers} title="Labels on this site" sub={`${fmtNum(mine.length)} printed so far`}>
          {mine.length === 0 ? <Empty title="No labels printed yet" /> : <StackedBar segments={byStatus} format={fmtNum} />}
        </Panel>
      </>}>
        <div className="flex flex-col gap-[var(--gap)]">
          <Panel>
            <form onSubmit={submit}>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <ScanLine className="size-5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--accent-strong)] pointer-events-none" />
                  <Input ref={input} big value={code} onChange={(e) => setCode(e.target.value)} placeholder={`Scan or type a label code, e.g. ${mine[0]?.code ?? 'MAT-BUN-000120'}`} autoFocus autoComplete="off" spellCheck={false} aria-label="Label code" className="pl-10 code uppercase placeholder:normal-case placeholder:font-sans" />
                </div>
                <Button type="submit" variant="primary" size="lg" disabled={!code.trim()}>Look up<Kbd keys="enter" className="ml-1 [&_kbd]:bg-transparent [&_kbd]:border-current [&_kbd]:text-current [&_kbd]:opacity-60" /></Button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5 items-center">
                <span className="t-sm text-[var(--text-3)] mr-1">No scanner on this device? Simulate a scan:</span>
                {sims.map((b) => <Button key={b.keys} size="sm" icon={Shuffle} type="button" onClick={() => simulate(b.status)}>{b.text}<Kbd keys={b.keys} className="ml-0.5" /></Button>)}
              </div>
            </form>
          </Panel>

          {unknown && <Note tone="bad" icon={XCircle}><div className="font-semibold">Unknown code <span className="code">{unknown}</span></div><div className="text-[var(--text-2)] mt-0.5">This is not a Tanaad label on any site. Check the sticker is not damaged, or type the code printed under the QR.</div></Note>}

          {!label && (
            <Panel icon={Tag} title="Latest stickers on this site" sub={unknown ? 'select one to see its history' : 'waiting for a scan · select one to see its history'} pad={false}>
              <DataGrid bare dense rows={latest} columns={latestCols} rowKey={(l) => l.id} onRowClick={(l) => lookup(l.code)} empty="No labels printed on this site yet." />
            </Panel>
          )}

          {label && h && (
            <Panel key={label.id} className="anim-up" icon={Tag} title={<span className="code">{label.code}</span>} sub={`${cap(label.kind)} · ${site.stages.find((st) => st.code === label.stageCode)?.name ?? label.stageCode}`}
              actions={<div className="flex items-center gap-1.5 pr-1.5">{label.siteId !== site.id && <Badge tone="warn">From another site</Badge>}<Badge tone={STATUS_TONE[label.status]} dot>{STATUS_TEXT[label.status]}</Badge></div>}>
              <div className="flex flex-col min-[1240px]:flex-row gap-5">
                <div className="shrink-0 self-center min-[1240px]:self-start"><Sticker label={label} product={h.product} machine={h.machine} operator={h.operator} site={site} shiftKind={shiftOf} compact /></div>
                <div className="min-w-0 flex-1">
                  <dl className="grid grid-cols-2 sm:max-lg:grid-cols-3 min-[1240px]:grid-cols-3 gap-x-4 gap-y-3 m-0">
                    <Fact icon={Tag} label="Product">{h.product ? <><Swatch colour={h.product.colour} /><span className="truncate">{h.product.internalName}</span></> : label.colour ? `${label.colour} ${label.kind}` : label.grade ?? cap(label.kind)}</Fact>
                    <Fact icon={Weight} label="Quantity"><span className="num">{label.qtyUnits > 1 ? `${fmtNum(label.qtyUnits)} pcs · ` : ''}{fmtKg(label.qtyKg)}</span></Fact>
                    <Fact icon={Factory} label="Machine">{h.machine?.code ?? '—'}</Fact>
                    <Fact icon={User} label="Operator">{h.operator ? <><Avatar name={h.operator.fullName} seed={h.operator.avatarSeed} size={18} /><span className="truncate">{h.operator.fullName}</span></> : '—'}</Fact>
                    <Fact icon={CalendarDays} label="Shift">{fmtDayLong(label.day)}{shiftOf ? ` · ${shiftOf}` : ''}</Fact>
                    <Fact icon={MapPin} label="Zone">{s.zones.find((z) => z.id === label.zoneId)?.name ?? '—'}</Fact>
                    <Fact icon={Route} label="Stage">{site.stages.find((st) => st.code === label.stageCode)?.name ?? label.stageCode}</Fact>
                    {label.grade && <Fact icon={Hash} label="Grade">{label.grade}</Fact>}
                  </dl>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="t-label mb-1">Made from</div>
                      {h.parents.length === 0 ? <span className="t-sm text-[var(--text-3)]">No parent labels linked{label.kind === 'bundle' || label.kind === 'pack' ? '. Racks and rolls are consumed by stage, not by lot, in the demo' : ''}.</span> : <div className="flex flex-wrap gap-1.5">{h.parents.map((p) => <button key={p.id} type="button" onClick={() => lookup(p.code)} className={chip}>{p.code}</button>)}</div>}
                    </div>
                    <div>
                      <div className="t-label mb-1">Went into</div>
                      {children.length === 0 ? <span className="t-sm text-[var(--text-3)]">{label.status === 'consumed' ? 'Used in production, no child label linked.' : 'Not consumed by a later stage.'}</span> : <div className="flex flex-wrap gap-1.5">{children.map((p) => <button key={p.id} type="button" onClick={() => lookup(p.code)} className={chip}>{p.code}</button>)}</div>}
                    </div>
                  </div>
                  {h.dispatch && (
                    <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 flex items-center gap-3">
                      <IconChip icon={Truck} color="var(--info)" />
                      <div className="min-w-0 flex-1"><div className="t-base font-medium truncate"><span className="code">{h.dispatch.deliveryNoteNo}</span> · {client?.name ?? 'Client'}</div><div className="t-sm text-[var(--text-3)] truncate">{order?.number} · {h.dispatch.vehicle} · gate {h.dispatch.gateStatus}{h.dispatch.gatePassedAt ? ` ${fmtDateTime(h.dispatch.gatePassedAt)}` : ''}</div></div>
                      <Badge tone={h.dispatch.gateStatus === 'pass' ? 'ok' : h.dispatch.gateStatus === 'hold' ? 'bad' : h.dispatch.gateStatus === 'overridden' ? 'warn' : 'neutral'} dot>{cap(h.dispatch.gateStatus)}</Badge>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--line)]">
                <div className="t-label mb-2">Event trail</div>
                <ol className="m-0 p-0 list-none">
                  {trail.map((e, i) => (
                    <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
                      {i < trail.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-[var(--line-2)]" />}
                      <IconChip icon={e.icon} color={toneColor[e.tone] ?? 'var(--text-3)'} />
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="t-base font-medium">{e.title}</span><span className="num t-sm text-[var(--text-3)] whitespace-nowrap">{fmtDayShort(e.at.slice(0, 10))} {fmtTime(e.at)}{e.approx ? ' ≈' : ''}</span></div>
                        {e.detail && <div className="t-sm text-[var(--text-2)]">{e.detail}</div>}
                      </div>
                    </li>
                  ))}
                </ol>
                {trail.some((e) => e.approx) && <div className="t-xs text-[var(--text-3)] mt-3">≈ times for seeded labels are the shift's typical print time; labels printed in this session show exact times.</div>}
              </div>
            </Panel>
          )}
        </div>
      </Split>
    </div>
  );
}
