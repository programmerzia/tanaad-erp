import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Boxes, ClipboardCheck, ClipboardList, Eraser, History, Lock, Plus, Save } from 'lucide-react';
import type { Product, StockCount as StockCountRec } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite, useGo } from '@/app/hooks';
import { Avatar, Badge, Button, ChipGroup, Combobox, DataGrid, Empty, Input, Note, NumberPad, PageHeader, Panel, Ring, Sheet, Tabs, useIsTouch, useMedia, type Column } from '@/components/ui';
import { stockByProduct } from '@/data/selectors';
import { fmtDay, fmtDayShort, fmtNum, fmtTime } from '@/data/format';
import { takePresetZone } from './shared';
import { Bench, KV, ProductName, Step, Swatch, Variance, plural, signed, unitWords } from './kit';

interface Line { product: Product; system: number; extra?: boolean }
interface Result { zone: string; rows: { product: Product; counted: number; system: number }[] }

/** Stock count by zone: a count sheet typed like a spreadsheet. Counted against system, variance kept forever as an event with an owner. */
export function StockCount() {
  const s = useStore(); const site = useSite(); const go = useGo(); const touch = useIsTouch();
  const recordStockCount = useStore((x) => x.recordStockCount); const toast = useStore((x) => x.toast);
  const zones = s.zones.filter((z) => z.siteId === site.id);
  const [zoneId, setZoneId] = useState<string>(zones[0]?.id ?? '');
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null); const [pad, setPad] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [scope, setScope] = useState<'all' | 'zone'>('all');
  const sheet = useRef<HTMLDivElement>(null); const phone = useMedia('(max-width: 639px)');
  const words = unitWords(site.id); const unit = words.many;

  // "Count this zone" on the stock wall hands the zone over.
  useEffect(() => { const z = takePresetZone(); if (z) setZoneId(z); }, []);

  const stock = stockByProduct(s, site.id);
  const lines: Line[] = useMemo(() => {
    const expected = stock.map((r) => ({ product: r.product, system: r.zones.get(zoneId) ?? 0 })).filter((x) => x.system > 0).sort((a, b) => b.system - a.system);
    const found = extra.filter((id) => !expected.some((x) => x.product.id === id)).map((id) => ({ product: s.products.find((p) => p.id === id)!, system: 0, extra: true })).filter((x) => x.product);
    return [...expected, ...found];
  }, [stock, zoneId, extra, s.products]);
  const valueOf = (pid: string) => { const c = counted[pid]; return c === undefined || c === '' ? undefined : parseInt(c, 10); };
  const entered = lines.filter((x) => valueOf(x.product.id) !== undefined);
  const diffs = entered.map((x) => valueOf(x.product.id)! - x.system);
  const short = diffs.filter((v) => v < 0); const over = diffs.filter((v) => v > 0); const match = diffs.filter((v) => v === 0).length;
  const net = diffs.reduce((t, v) => t + v, 0);
  const zone = zones.find((z) => z.id === zoneId); const zoneName = zone?.name ?? '';
  const systemIn = (zid: string) => stock.reduce((t, r) => t + (r.zones.get(zid) ?? 0), 0);
  const history = s.stockCounts.filter((c) => c.siteId === site.id).sort((a, b) => b.at.localeCompare(a.at));
  const shownHistory = scope === 'zone' ? history.filter((c) => c.zoneId === zoneId) : history;
  const lastFor = (pid: string) => history.find((c) => c.zoneId === zoneId && c.productId === pid);
  const byUser = (id: string) => s.users.find((u) => u.id === id)?.name ?? s.people.find((p) => p.id === id)?.fullName ?? 'Storekeeper';
  const addable = s.products.filter((p) => p.siteId === site.id && p.kind !== 'material' && !lines.some((x) => x.product.id === p.id));

  const cells = () => [...(sheet.current?.querySelectorAll<HTMLInputElement>('input[data-count]') ?? [])];
  const focusCell = (i: number) => { const el = cells()[i]; if (el) { el.focus(); el.select(); } return !!el; };
  // Desktop: the first cell is ready to type as soon as a zone is on screen.
  useEffect(() => { if (!touch) { const t = setTimeout(() => focusCell(0), 40); return () => clearTimeout(t); } }, [zoneId, touch]);

  const changeZone = (z: string) => { setZoneId(z); setCounted({}); setExtra([]); };
  const onCellKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const all = cells(); const i = all.indexOf(e.currentTarget);
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); if (!focusCell(i + 1) && e.key === 'Enter') sheet.current?.closest('section')?.querySelector<HTMLButtonElement>('[data-record]')?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusCell(i - 1); }
  };
  const openPad = (pid: string) => { setEditing(pid); setPad(counted[pid] ?? ''); };
  const savePad = () => {
    if (!editing) return;
    const next = { ...counted, [editing]: pad }; setCounted(next);
    const todo = lines.find((x) => x.product.id !== editing && (next[x.product.id] === undefined || next[x.product.id] === ''));
    if (todo) { setEditing(todo.product.id); setPad(''); } else setEditing(null);
  };
  const record = () => {
    if (!zoneId || entered.length === 0) return;
    const rows = entered.map((x) => ({ product: x.product, counted: valueOf(x.product.id)!, system: x.system }));
    for (const r of rows) recordStockCount({ siteId: site.id, zoneId, day: s.today, productId: r.product.id, countedBundles: r.counted, systemBundles: r.system });
    const varRows = rows.filter((o) => o.counted !== o.system).length;
    toast(varRows ? { kind: 'warn', title: `Count recorded · ${varRows} variance${varRows > 1 ? 's' : ''}`, detail: 'Flagged in the audit feed for the Site Manager.' } : { kind: 'ok', title: 'Count recorded · everything matches' });
    setResult({ zone: zoneName, rows }); setCounted({}); setExtra([]);
    if (!touch) setTimeout(() => focusCell(0), 60);
  };
  const nextZone = zones.length > 1 ? zones[(zones.findIndex((z) => z.id === zoneId) + 1) % zones.length] : undefined;
  const editingLine = lines.find((x) => x.product.id === editing);

  const sheetCols: Column<Line>[] = [
    { key: 'p', header: 'Product', cell: (x) => <span className="inline-flex items-center gap-2 min-w-0"><ProductName product={x.product} />{x.extra && <Badge tone="info">Added</Badge>}</span> },
    { key: 'sys', header: 'System', align: 'right', mono: true, width: 84, cell: (x) => <span className="text-[var(--text-2)]">{fmtNum(x.system)}</span> },
    { key: 'cnt', header: 'Counted', align: 'right', width: 116, cell: (x) => touch
      ? <Button size="sm" variant={valueOf(x.product.id) === undefined ? 'secondary' : 'ghost'} className="num min-w-[72px] justify-end font-semibold" onClick={() => openPad(x.product.id)}>{valueOf(x.product.id) === undefined ? 'Enter' : fmtNum(valueOf(x.product.id)!)}</Button>
      : <div className="w-[92px] ml-auto"><Input data-count="" inputMode="numeric" aria-label={`Counted ${x.product.internalName}`} placeholder="—" value={counted[x.product.id] ?? ''} onChange={(e) => setCounted((c) => ({ ...c, [x.product.id]: e.target.value.replace(/\D/g, '').slice(0, 5) }))} onKeyDown={onCellKey} onFocus={(e) => e.currentTarget.select()} className="text-right num font-semibold" /></div> },
    { key: 'var', header: 'Variance', width: 124, cell: (x) => { const n = valueOf(x.product.id); return <Variance v={n === undefined ? undefined : n - x.system} />; } },
    { key: 'last', header: 'Last count here', cell: (x) => { const c = lastFor(x.product.id); return c ? <span className="t-sm text-[var(--text-3)]"><span className="num">{fmtDayShort(c.day)}</span> · {c.countedBundles === c.systemBundles ? 'matched' : `${signed(c.countedBundles - c.systemBundles)} vs system`}</span> : <span className="t-sm text-[var(--text-4)]">Never counted</span>; } },
  ];
  const historyCols: Column<StockCountRec>[] = [
    { key: 'at', header: 'When', sort: (c) => c.at, cell: (c) => <span className="num text-[var(--text-2)]" title={fmtTime(c.at)}>{fmtDayShort(c.day)}</span> },
    { key: 'p', header: 'Product · zone', truncate: 160, sort: (c) => s.products.find((p) => p.id === c.productId)?.internalName ?? '', cell: (c) => { const p = s.products.find((x) => x.id === c.productId); return <span className="inline-flex items-center gap-1.5 min-w-0"><Swatch colour={p?.colour} className="size-2" /><span className="truncate">{p?.internalName}</span><span className="t-sm text-[var(--text-3)] truncate">{zones.find((z) => z.id === c.zoneId)?.name}</span></span>; } },
    { key: 'n', header: 'Counted', align: 'right', mono: true, cell: (c) => <span>{fmtNum(c.countedBundles)}<span className="text-[var(--text-3)]"> / {fmtNum(c.systemBundles)}</span></span> },
    { key: 'v', header: 'Variance', sort: (c) => c.countedBundles - c.systemBundles, cell: (c) => <Variance v={c.countedBundles - c.systemBundles} /> },
    { key: 'by', header: 'By', cell: (c) => <span title={`${byUser(c.by)} · ${fmtTime(c.at)}`} className="inline-flex"><Avatar name={byUser(c.by)} size={18} /></span> },
  ];

  return (
    <div>
      <PageHeader eyebrow={`${site.name} · Stock`} title="Stock count" meta={<><Badge tone="neutral"><Lock className="size-3" />Variance kept forever</Badge><Badge tone="neutral">{fmtDay(s.today)}</Badge></>}
        subtitle="Pick a zone, count what is there, type the number. The system keeps the difference, permanently."
        actions={<Button icon={Boxes} onClick={() => go.site('stock')}>Stock wall</Button>} />

      <Bench asideWidth={440} aside={<>
        {result && (
          <Panel icon={ClipboardCheck} title="Just recorded" sub={result.zone} actions={<Badge tone={result.rows.some((r) => r.counted !== r.system) ? 'bad' : 'ok'} dot>{result.rows.some((r) => r.counted !== r.system) ? `${result.rows.filter((r) => r.counted !== r.system).length} with a difference` : 'Everything matches'}</Badge>}
            footer="Nothing was silently changed: the system figure stays, the counted figure stays, and the difference is in the audit feed with your name.">
            <div className="t-sm font-medium mb-1">Variance recorded permanently · {plural(result.rows.length, 'product')}</div>
            {result.rows.map((r) => <div key={r.product.id} className="flex items-center gap-2 min-h-7 touch:min-h-10 border-b border-[var(--line)] last:border-b-0 t-sm"><ProductName product={r.product} className="flex-1" strong={false} /><span className="num text-[var(--text-3)]">{fmtNum(r.counted)} / {fmtNum(r.system)}</span><Variance v={r.counted - r.system} /></div>)}
          </Panel>
        )}
        <Panel icon={ClipboardList} title="This count" sub={zoneName}>
          <div className="flex items-center gap-4">
            <Ring value={lines.length ? (entered.length / lines.length) * 100 : 0} size={84} stroke={9} tone={lines.length > 0 && entered.length === lines.length ? 'ok' : 'brand'} label={`${entered.length}/${lines.length}`} sub="counted" />
            <div className="flex-1 min-w-0">
              <KV label="Matches the system" dot="var(--ok)">{match}</KV>
              <KV label="Short" dot="var(--bad)">{short.length ? `${plural(short.length, 'product')} · ${signed(short.reduce((t, v) => t + v, 0))}` : '0'}</KV>
              <KV label="Over" dot="var(--warn)">{over.length ? `${plural(over.length, 'product')} · ${signed(over.reduce((t, v) => t + v, 0))}` : '0'}</KV>
              <KV label={`Net variance, ${unit}`}>{entered.length ? signed(net) : '—'}</KV>
            </div>
          </div>
          <Note tone="neutral" className="mt-3">Counting {unit}, not kilos. The gate scale checks kilos.</Note>
        </Panel>
        <Panel icon={History} title="Past counts" pad={false} actions={<Badge tone="neutral"><Lock className="size-3" />Kept forever · never deletable</Badge>}
          footer="Every count is an event with an owner. There is no delete here, by design: a wrong count is corrected by counting again.">
          <div className="flex items-center justify-between gap-2 px-[var(--pad)] py-2 border-b border-[var(--line)]">
            <Tabs value={scope} onChange={setScope} tabs={[{ value: 'all', label: 'All zones', count: history.length }, { value: 'zone', label: 'This zone', count: history.filter((c) => c.zoneId === zoneId).length }]} />
          </div>
          {shownHistory.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={History} title="No counts yet" hint={scope === 'zone' ? `${zoneName} has never been counted.` : 'The first count you record shows up here.'} /></div>
            : <DataGrid bare dense rows={shownHistory} columns={historyCols} rowKey={(c) => c.id} maxHeight={330} />}
        </Panel>
      </>}>
        <Panel icon={ClipboardList} title="Count sheet" sub={zone ? `${zoneName} · system says ${fmtNum(systemIn(zoneId))} ${words.many}` : undefined} pad={false}
          actions={<Button size="sm" variant="ghost" icon={Eraser} disabled={entered.length === 0 && extra.length === 0} onClick={() => { setCounted({}); setExtra([]); if (!touch) focusCell(0); }}>Clear</Button>}
          footer={<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span><span className="num font-medium text-[var(--text)]">{entered.length} of {lines.length}</span> counted · {short.length + over.length} with a difference. Only the products you enter are recorded.</span>
            <Button data-record="" variant="primary" icon={Save} hotkey="mod+enter" hotkeyLabel="Record count" disabled={entered.length === 0} onClick={record}>Record count</Button>
          </div>}>
          <Step n={1} title="Zone" hint="labelled units the system expects">
            <ChipGroup ariaLabel="Zone" value={zoneId} onChange={changeZone} options={zones.map((z) => ({ value: z.id, label: <>{z.name}<span className="num t-sm font-normal opacity-70">{fmtNum(systemIn(z.id))}</span></> }))} />
          </Step>
          <Step n={2} title={`Count each product in ${zoneName || 'the zone'}`} hint={touch ? undefined : 'Enter or ↓ moves down the column'}>
            <div ref={sheet}>
              {lines.length === 0
                ? <Empty icon={ClipboardList} title="Nothing expected here" hint="The system has no stickers in this zone. If there is stock, tag it first or add the product below." action={<Button onClick={() => go.site('stock/tagging')}>Open tagging</Button>} />
                : <DataGrid rows={lines} columns={phone ? [{ key: 'p', header: 'Product', wrap: true, cell: (x: Line) => <div className="py-0.5 min-w-0"><ProductName product={x.product} />{x.extra && <Badge tone="info" className="ml-1.5">Added</Badge>}<div className="t-sm text-[var(--text-3)] num">system {fmtNum(x.system)}</div></div> }, ...sheetCols.filter((c) => c.key === 'cnt' || c.key === 'var').map((c) => ({ ...c, width: undefined }))] : sheetCols} rowKey={(x) => x.product.id} className="shadow-none" rowClassName={(x) => (x.product.id === editing ? 'bg-[var(--selected)]' : undefined)}
                    footer={<tr><td>Total{phone && <span className="font-normal text-[var(--text-3)] num"> · system {fmtNum(lines.reduce((t, x) => t + x.system, 0))}</span>}</td>{!phone && <td className="text-right num">{fmtNum(lines.reduce((t, x) => t + x.system, 0))}</td>}<td className="text-right num pr-[22px]">{entered.length ? fmtNum(entered.reduce((t, x) => t + valueOf(x.product.id)!, 0)) : '—'}</td><td className="num">{entered.length ? <span className={net === 0 ? 'text-[var(--ok)]' : 'text-[var(--bad)]'}>{net === 0 ? 'No net variance' : `${signed(net)} net`}</span> : ''}</td>{!phone && <td />}</tr>} />}
            </div>
            {addable.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                <span className="t-sm text-[var(--text-2)] inline-flex items-center gap-1.5"><Plus className="size-3.5 text-[var(--text-3)]" />Found something that is not on the sheet?</span>
                <Combobox className="max-w-[280px]" placeholder="Add a product to this count" value={null} onChange={(v) => { if (v) setExtra((x) => [...x, v]); }} options={addable.map((p) => ({ value: p.id, label: p.internalName, sub: p.commercialName, left: <Swatch colour={p.colour} /> }))} />
              </div>
            )}
          </Step>
          {result && nextZone && nextZone.id !== zoneId && entered.length === 0 && (
            <div className="px-[var(--pad)] py-2.5 flex flex-wrap items-center justify-between gap-2 bg-[var(--surface-2)]">
              <span className="t-sm text-[var(--text-2)]">{result.zone} is on the record. Carry on with the next zone, or count this one again.</span>
              <Button size="sm" icon={ClipboardList} onClick={() => changeZone(nextZone.id)}>Count {nextZone.name}</Button>
            </div>
          )}
        </Panel>
      </Bench>

      <Sheet open={touch && !!editingLine} onClose={() => setEditing(null)} title={editingLine ? `${editingLine.product.internalName} · counted` : ''} sub={editingLine ? `System says ${fmtNum(editingLine.system)} ${unit} in ${zoneName}` : undefined} width={420}>
        {editingLine && <NumberPad key={editingLine.product.id} value={pad} onChange={setPad} onDone={savePad} suffix={unit} doneLabel="Save and next" max={99999} />}
      </Sheet>
    </div>
  );
}
