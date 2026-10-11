import { useMemo, useState } from 'react';
import { ArrowRightLeft, Boxes, ClipboardList, History, Layers, LayoutGrid, PackagePlus, PieChart, Scale, Tag, TrendingUp, Truck } from 'lucide-react';
import type { Label, Product } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite, useGo } from '@/app/hooks';
import { Badge, Bar, Button, DataGrid, Empty, KpiStrip, Meter, Note, Panel, SearchInput, Sheet, Stat, Tabs, type Column } from '@/components/ui';
import { CountUp, Donut, LineChart } from '@/components/charts';
import { dailySeries, lastWorkingDays, stockByProduct } from '@/data/selectors';
import { fmtDayShort, fmtKg, fmtMoney, fmtNum } from '@/data/format';
import { SITE_COLOR } from '@/config/siteIdentity';
import { setPresetZone } from './shared';
import { Fact, KV, ProductName, Swatch, matches, plural, unitWords, useSearch, zoneColor } from './kit';

type Kind = 'all' | Product['kind'];
const KIND_LABEL: Record<Product['kind'], string> = { mat: 'Mats', bag_pack: 'Packs', roll: 'Rolls', pellet: 'Pellets', material: 'Materials' };
type StockRow = ReturnType<typeof stockByProduct>[number];

/** Stock wall: what is on the floor, by product and by zone, counted from the stickers that are still in stock. */
export function StockWall() {
  const s = useStore(); const site = useSite(); const go = useGo();
  const [q, setQ] = useSearch();
  const [kind, setKind] = useState<Kind>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const unit = unitWords(site.id);

  const all = stockByProduct(s, site.id);
  const zones = s.zones.filter((z) => z.siteId === site.id);
  const zoneIndex = (id: string) => zones.findIndex((z) => z.id === id);
  const kinds = [...new Set(all.map((r) => r.product.kind))];
  const rows = all.filter((r) => (kind === 'all' || r.product.kind === kind) && matches(q, r.product.internalName, r.product.commercialName, KIND_LABEL[r.product.kind]));
  const sum = (list: StockRow[]) => ({ bundles: list.reduce((t, r) => t + r.bundles, 0), pieces: list.reduce((t, r) => t + r.pieces, 0), kg: list.reduce((t, r) => t + r.kg, 0) });
  const grand = sum(all); const totals = sum(rows);

  const siteLabels = useMemo(() => s.labels.filter((l) => l.siteId === site.id), [s.labels, site.id]);
  const lastDay = useMemo(() => { const m = new Map<string, string>(); for (const l of siteLabels) if (l.productId && l.day > (m.get(l.productId) ?? '')) m.set(l.productId, l.day); return m; }, [siteLabels]);
  const untagged = siteLabels.filter((l) => l.status === 'in_stock' && !l.productId);
  const scrapSacks = untagged.filter((l) => l.kind === 'sack');
  // Grades as they are written on the stickers in stock; nothing is assumed about which grades exist.
  const graded = siteLabels.filter((l) => l.status === 'in_stock' && l.grade);
  const gradeRows = [...new Set(graded.map((l) => l.grade!))].sort().map((g) => { const ls = graded.filter((l) => l.grade === g); return { grade: g, sacks: ls.length, kg: ls.reduce((t, l) => t + l.qtyKg, 0) }; });
  const toMeasure = all.filter((r) => r.product.weightStatus === 'to_be_measured');

  // Flow through the store: stickers printed (in) and units scanned onto lorries (out), per working day.
  const days = lastWorkingDays(site.id, s.today, 7); const series = dailySeries(s, site.id, days);
  const flow = days.map((day) => ({ day, made: siteLabels.filter((l) => l.day === day && l.productId).length, out: s.dispatches.filter((d) => d.siteId === site.id && d.createdAt.startsWith(day)).reduce((t, d) => t + d.scannedLabelIds.length, 0) }));
  const today = flow[flow.length - 1]; const past = flow.slice(0, -1);
  // Labelled stock at the end of each day, rebuilt from what is in stock now plus what has left on a lorry since.
  const level = useMemo(() => {
    const leftOn = new Map<string, string>(); for (const d of s.dispatches) if (d.siteId === site.id) for (const id of d.scannedLabelIds) leftOn.set(id, d.createdAt.slice(0, 10));
    return days.map((day) => { const there = siteLabels.filter((l) => l.productId && l.day <= day && (l.status === 'in_stock' || (leftOn.get(l.id) ?? '') > day)); return { units: there.length, pieces: there.reduce((t, l) => t + l.qtyUnits, 0), kg: there.reduce((t, l) => t + l.qtyKg, 0) }; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteLabels, s.dispatches, site.id, s.today]);
  const avgMade = past.length ? Math.round(past.reduce((t, d) => t + d.made, 0) / past.length) : 0;
  const lorriesToday = series[series.length - 1]?.dispatches ?? 0;
  const toLoad = s.orders.filter((o) => o.siteId === site.id && (o.status === 'approved' || o.status === 'picking')).length;
  const lastCount = s.stockCounts.filter((c) => c.siteId === site.id).map((c) => c.day).sort().pop();
  const countAge = lastCount ? Math.round((new Date(s.today).getTime() - new Date(lastCount).getTime()) / 86400000) : undefined;
  const newest = siteLabels.filter((l) => l.status === 'in_stock' && l.productId).sort((a, b) => b.day.localeCompare(a.day) || b.code.localeCompare(a.code)).slice(0, 8);
  const productOf = (id?: string) => s.products.find((p) => p.id === id);
  const zoneName = (id?: string) => zones.find((z) => z.id === id)?.name ?? '—';

  const share = all.map((r) => ({ label: r.product.internalName + (r.product.commercialName ? ` · ${r.product.commercialName}` : ''), value: r.bundles, color: r.product.colour ?? 'var(--text-3)' }));
  // Products share colours on some sites (black and white bags), so the donut uses the series palette in rank order when swatches repeat.
  const repeats = new Set(share.map((x) => x.color)).size < share.length;
  const ranked = share.map((x, i) => (repeats ? { ...x, color: `var(--series-${(i % 8) + 1})` } : x));
  const donut = ranked.length > 6 ? [...ranked.slice(0, 5), { label: `${ranked.length - 5} more products`, value: ranked.slice(5).reduce((t, x) => t + x.value, 0), color: 'var(--text-4)' }] : ranked;

  const countZone = (zoneId: string) => { setPresetZone(zoneId); go.site('stock/count'); };
  const open = all.find((r) => r.product.id === openId);

  const columns: Column<StockRow>[] = [
    { key: 'p', header: 'Product', sort: (r) => r.product.internalName, cell: (r) => <ProductName product={r.product} /> },
    { key: 'b', header: site.id === 'mats' ? 'Bundles' : 'Units', align: 'right', mono: true, sort: (r) => r.bundles, cell: (r) => <span className="font-semibold">{fmtNum(r.bundles)}</span> },
    { key: 'pc', header: 'Pieces', align: 'right', mono: true, sort: (r) => r.pieces, cell: (r) => fmtNum(r.pieces) },
    { key: 'kg', header: 'Kg', align: 'right', mono: true, sort: (r) => r.kg, cell: (r) => fmtNum(Math.round(r.kg)) },
    { key: 'sh', header: 'Share', sort: (r) => r.bundles, cell: (r) => <span className="flex items-center gap-2"><span className="w-[36px] shrink-0"><Bar value={r.bundles} max={all[0]?.bundles || 1} tone="series" /></span><span className="num t-sm text-[var(--text-2)] w-8 text-right">{grand.bundles ? Math.round((r.bundles / grand.bundles) * 100) : 0}%</span></span> },
    { key: 'w', header: 'Std weight, kg', sort: (r) => r.product.stdBundleWeightKg, cell: (r) => <span className="inline-flex items-center gap-2"><span className="num w-[34px] text-right">{fmtNum(r.product.stdBundleWeightKg)}</span><Badge tone={r.product.weightStatus === 'measured' ? 'ok' : 'warn'}>{r.product.weightStatus === 'measured' ? 'Measured' : 'To be measured'}</Badge></span> },
    { key: 'z', header: 'Zones', cell: (r) => { const zs = [...r.zones.entries()].sort((a, b) => zoneIndex(a[0]) - zoneIndex(b[0])); return (
      <span className="inline-flex items-center gap-2" title={zs.map(([z, n]) => `${zoneName(z)} ${n}`).join(' · ')}>
        <span className="flex w-[38px] h-1.5 gap-px rounded-[3px] overflow-hidden bg-[var(--surface-3)]">{zs.map(([z, n]) => <span key={z} style={{ width: `${(n / r.bundles) * 100}%`, background: zoneColor(zoneIndex(z)) }} />)}</span>
        <span className="num t-sm text-[var(--text-3)]">{zs.length}</span>
      </span>); } },
    { key: 'd', header: 'Last made', align: 'right', sort: (r) => lastDay.get(r.product.id) ?? '', cell: (r) => { const d = lastDay.get(r.product.id); return d ? (d === s.today ? <span className="font-medium">Today</span> : <span className="text-[var(--text-2)]">{fmtDayShort(d)}</span>) : '—'; } },
  ];
  const newestCols: Column<Label>[] = [
    { key: 'c', header: 'Sticker', cell: (l) => <span className="code">{l.code}</span> },
    { key: 'p', header: 'Product', truncate: 140, cell: (l) => <ProductName product={productOf(l.productId)} strong={false} /> },
    { key: 'z', header: 'Zone', truncate: 110, cell: (l) => <span className="text-[var(--text-2)]">{zoneName(l.zoneId)}</span> },
    { key: 'kg', header: 'Kg', align: 'right', mono: true, cell: (l) => fmtNum(l.qtyKg) },
    { key: 'd', header: 'Printed', align: 'right', cell: (l) => <span className="text-[var(--text-2)]">{l.day === s.today ? 'Today' : fmtDayShort(l.day)}</span> },
  ];

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      {/* Identity, the one-line state of the store, and the three things a storekeeper does from here */}
      <section className="hero relative overflow-hidden px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <span className="size-12 rounded-xl grid place-items-center shrink-0 shadow-[inset_0_1px_0_rgb(255_255_255/.25)]" style={{ background: SITE_COLOR[site.id] }}><Boxes className="size-6" /></span>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-white/55">{site.name} · Store</div>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] leading-tight">Stock wall</h1>
            <div className="text-[12.5px] text-white/60">Counted from the stickers still in stock</div>
          </div>
        </div>
        <div className="flex-1 min-w-[260px] max-w-[520px]">
          <div className="flex items-center justify-between gap-3 mb-2 text-[12.5px]"><span className="inline-flex items-center gap-1.5 font-medium"><span className="size-1.5 rounded-full bg-[var(--color-amber-400)] anim-live" /><span className="num">{fmtNum(grand.bundles)}</span> {unit.many} on the floor</span><span className="text-white/60 whitespace-nowrap">{plural(all.length, 'product')} · {plural(zones.length, 'zone')}</span></div>
          <div className="flex h-1.5 gap-[2px] rounded-full overflow-hidden bg-white/15" role="img" aria-label="Stock by zone">
            {zones.map((z, i) => { const n = all.reduce((t, r) => t + (r.zones.get(z.id) ?? 0), 0); return n ? <div key={z.id} style={{ width: `${(n / (grand.bundles || 1)) * 100}%`, background: zoneColor(i) }} /> : null; })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-[11.5px] text-white/60">
            {zones.map((z, i) => { const n = all.reduce((t, r) => t + (r.zones.get(z.id) ?? 0), 0); return <span key={z.id} className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className="size-1.5 rounded-[2px]" style={{ background: zoneColor(i) }} />{z.name}<span className="num text-white/85">{fmtNum(n)}</span></span>; })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <Button variant="inverse" icon={ArrowRightLeft} hotkey="m" hotkeyLabel="Move stock" onClick={() => go.site('stock/movements')}>Move</Button>
          <Button variant="inverse" icon={Tag} hotkey="t" hotkeyLabel="Tagging campaign" onClick={() => go.site('stock/tagging')}>Tag</Button>
          <Button variant="accent" icon={ClipboardList} hotkey="c" hotkeyLabel="Count a zone" onClick={() => go.site('stock/count')}>Count</Button>
        </div>
      </section>
      {site.toBeConfirmed && <Note tone="warn">{site.toBeConfirmed}</Note>}

      <KpiStrip>
        <Stat label={unit.title} icon={Boxes} accent="var(--series-1)" value={<CountUp value={grand.bundles} />} spark={level.map((d) => d.units)} sub={`${plural(all.length, 'product')} · ${plural(zones.length, 'zone')}`} />
        <Stat label="Pieces" icon={Layers} accent="var(--series-7)" value={<CountUp value={grand.pieces} />} spark={level.map((d) => d.pieces)} sub={site.id === 'recycling' ? 'One sack is one unit' : 'Across all stickers'} />
        <Stat label="Kilos" icon={Scale} accent="var(--series-4)" value={<><CountUp value={Math.round(grand.kg)} /><span className="t-base text-[var(--text-3)] font-medium"> kg</span></>} spark={level.map((d) => d.kg)} sub={toMeasure.length ? `${toMeasure.length} weights unmeasured` : 'Sum of sticker weights'} />
        <Stat label="Into store today" icon={PackagePlus} accent="var(--series-3)" value={<CountUp value={today?.made ?? 0} />} spark={past.map((d) => d.made)} sparkColor="var(--series-3)" sub={`Avg ${fmtNum(avgMade)} a day`} />
        <Stat label="Dispatched today" icon={Truck} accent="var(--series-2)" value={<CountUp value={today?.out ?? 0} />} spark={past.map((d) => d.out)} sparkColor="var(--series-2)" sub={`${plural(lorriesToday, 'lorry', 'lorries')} · ${toLoad} to load`} onClick={() => go.site('stock/dispatch')} />
        <Stat label="Last count" icon={History} accent="var(--series-5)" tone={countAge === undefined ? 'warn' : 'neutral'} value={countAge === undefined ? 'Never' : <>{countAge}<span className="t-base text-[var(--text-3)] font-medium"> {countAge === 1 ? 'day' : 'days'} ago</span></>} sub={lastCount ? `On ${fmtDayShort(lastCount)} · ${plural(s.stockCounts.filter((c) => c.siteId === site.id && c.day === lastCount).length, 'line')} counted` : 'No count on record'} onClick={() => go.site('stock/count')} />
      </KpiStrip>

      <div className="grid gap-[var(--gap)] xl:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="flex flex-col gap-[var(--gap)] min-w-0">
          <Panel icon={Boxes} title="Stock by product" sub={`${unit.many} in stock now`} pad={false}
            footer={<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1"><span>Select a row to see where it sits and its newest stickers.</span><span className="num">{plural(rows.length, 'product')} · {fmtNum(totals.bundles)} {unit.many} · {fmtKg(Math.round(totals.kg))}</span></div>}>
            <div className="flex flex-wrap items-center gap-2 px-[var(--pad)] py-2 border-b border-[var(--line)]">
              <SearchInput value={q} onChange={setQ} placeholder="Search product" />
              {kinds.length > 1 && <Tabs value={kind} onChange={setKind} tabs={[{ value: 'all' as Kind, label: 'All', count: all.length }, ...kinds.map((k) => ({ value: k as Kind, label: KIND_LABEL[k], count: all.filter((r) => r.product.kind === k).length }))]} />}
            </div>
            {rows.length === 0
              ? <div className="p-[var(--pad)]">{all.length === 0 ? <Empty icon={Boxes} title="Nothing in stock" hint="Stickers printed at the last production stage appear here until they are dispatched." /> : <Empty icon={Boxes} title="No product matches" hint="Clear the search or pick another kind." action={<Button size="sm" onClick={() => { setQ(''); setKind('all'); }}>Clear filters</Button>} />}</div>
              : <DataGrid bare rows={rows} columns={columns} rowKey={(r) => r.product.id} onRowClick={(r) => setOpenId(r.product.id)} selectedKey={openId} maxHeight={460}
                  footer={<tr><td>Total</td><td className="text-right num">{fmtNum(totals.bundles)}</td><td className="text-right num">{fmtNum(totals.pieces)}</td><td className="text-right num">{fmtNum(Math.round(totals.kg))}</td><td colSpan={4} className="t-sm font-normal text-[var(--text-3)]">{rows.length < all.length ? `of ${fmtNum(grand.bundles)} on the floor` : ''}</td></tr>} />}
          </Panel>

          <Panel icon={LayoutGrid} title="Store map" sub={plural(zones.length, 'zone')} bodyClassName="grid gap-2.5 sm:grid-cols-2">
            {zones.map((z, i) => {
              const inZone = all.map((r) => ({ product: r.product, n: r.zones.get(z.id) ?? 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
              const loose = untagged.filter((l) => l.zoneId === z.id); const total = inZone.reduce((t, x) => t + x.n, 0);
              return (
                <div key={z.id} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] overflow-hidden flex flex-col">
                  <div className="flex items-center gap-2 pl-2.5 pr-1 min-h-[var(--ctl-h)] bg-[var(--surface-2)] border-b border-[var(--line)]">
                    <span className="size-2 rounded-[2px] shrink-0" style={{ background: zoneColor(i) }} />
                    <span className="t-base font-semibold truncate flex-1">{z.name}</span>
                    <span className="num t-base font-semibold">{fmtNum(total)}</span><span className="num t-xs text-[var(--text-3)] w-8 text-right pr-1.5">{grand.bundles ? `${Math.round((total / grand.bundles) * 100)}%` : ''}</span>
                  </div>
                  <div className="px-2.5 py-1.5 flex-1">
                    {inZone.length === 0 && loose.length === 0 && <div className="t-sm text-[var(--text-3)] py-1">No labelled stock here.</div>}
                    {inZone.slice(0, 5).map((x) => <div key={x.product.id} className="flex items-center gap-2 h-6 touch:h-8 t-sm"><Swatch colour={x.product.colour} className="size-2" /><span className="truncate flex-1 text-[var(--text-2)]">{x.product.internalName}{x.product.commercialName ? ` · ${x.product.commercialName}` : ''}</span><span className="w-[96px] shrink-0"><Bar value={x.n} max={inZone[0].n} tone="neutral" height={4} /></span><span className="num font-medium w-8 text-right">{fmtNum(x.n)}</span></div>)}
                    {inZone.length > 5 && <div className="t-xs text-[var(--text-3)] h-5 flex items-center">and {inZone.length - 5} more product{inZone.length - 5 === 1 ? '' : 's'} · {fmtNum(inZone.slice(5).reduce((t, x) => t + x.n, 0))}</div>}
                    {loose.length > 0 && <div className="flex items-center justify-between gap-2 h-6 touch:h-8 t-sm text-[var(--text-2)]"><span className="truncate">{loose[0].kind === 'sack' ? 'Scrap sacks' : loose[0].kind === 'bag' ? 'Raw material bags' : 'Other labels'}</span><span className="num font-medium text-[var(--text)]">{loose.length} · {fmtKg(loose.reduce((t, l) => t + l.qtyKg, 0))}</span></div>}
                  </div>
                  <div className="flex items-center justify-between gap-2 pl-2.5 pr-1 pb-1">
                    <span className="t-xs text-[var(--text-3)] truncate">{plural(inZone.length, 'product')}</span>
                    <Button size="sm" variant="ghost" icon={ClipboardList} onClick={() => countZone(z.id)}>Count this zone</Button>
                  </div>
                </div>
              );
            })}
          </Panel>
        </div>

        <div className="grid gap-[var(--gap)] items-start md:grid-cols-2 xl:grid-cols-1 min-w-0">
          <Panel icon={PieChart} title="Share of stock" sub={`${unit.many} by product`}>
            {donut.length === 0 ? <Empty title="Nothing in stock" /> : (
              <div className="flex items-center gap-4">
                <Donut segments={donut} size={116} thickness={15} center={fmtNum(grand.bundles)} sub={unit.many} />
                <div className="flex-1 min-w-0">{donut.map((d) => <KV key={d.label} label={d.label} dot={d.color}>{fmtNum(d.value)}</KV>)}</div>
              </div>
            )}
          </Panel>

          <Panel icon={TrendingUp} title="In and out of the store" sub={`${unit.many} a day · 7 days`}>
              <LineChart height={188} labels={flow.map((d) => fmtDayShort(d.day))} partialLast series={[{ name: 'Stickers printed', color: 'var(--series-3)', data: flow.map((d) => d.made), area: true }, { name: 'Loaded on lorries', color: 'var(--series-2)', data: flow.map((d) => d.out) }]} />
              <div className="t-xs text-[var(--text-3)] mt-1">Today is drawn dotted because the shift is still running.</div>
            </Panel>
          <Panel icon={Tag} title="Newest stickers" sub="still in stock" pad={false} actions={<Button size="sm" variant="ghost" onClick={() => go.site('stock/movements')}>Movements</Button>}>
              <DataGrid bare dense rows={newest} columns={newestCols.filter((c) => c.key !== 'kg' && c.key !== 'z')} rowKey={(l) => l.id} empty="No sticker in stock yet." />
            </Panel>
          {gradeRows.length > 0 && (
            <Panel icon={Layers} title="Stock by grade" sub="graded stickers in stock">
              {gradeRows.map((g) => <Meter key={g.grade} label={/^[A-Za-z0-9]{1,2}$/.test(g.grade) ? `Grade ${g.grade}` : g.grade} value={g.sacks} max={Math.max(1, ...gradeRows.map((x) => x.sacks))} display={<>{fmtNum(g.sacks)}<span className="text-[var(--text-3)] font-normal"> · {fmtKg(g.kg)}</span></>} />)}
            </Panel>
          )}
          {toMeasure.length > 0 && <Note tone="warn"><span className="font-medium">{toMeasure.length} of {all.length} standard weights are to be measured.</span> They are illustrative until each product is weighed on the gate scale. Kilos on this wall move with them.</Note>}
          {scrapSacks.length > 0 && <Note tone="neutral">{plural(scrapSacks.length, 'sack')} without a product ({fmtKg(scrapSacks.reduce((t, l) => t + l.qtyKg, 0))}) sit in {[...new Set(scrapSacks.map((l) => zoneName(l.zoneId)))].join(', ')}. They are not sellable stock and are left out of the totals.</Note>}
          {<Note tone="neutral">Standing stock that predates the stickers is not on this wall until it is tagged. <button className="font-medium underline underline-offset-2 hover:text-[var(--accent-strong)]" onClick={() => go.site('stock/tagging')}>Open the tagging campaign</button></Note>}
        </div>
      </div>

      <Sheet open={!!open} onClose={() => setOpenId(null)} width={480} title={open ? <ProductName product={open.product} /> : ''} sub={open ? `${KIND_LABEL[open.product.kind]} · ${open.product.bundlePieces} ${open.product.bundlePieces === 1 ? 'piece' : 'pieces'} per ${unit.one}` : undefined}
        footer={open && <><Button icon={ArrowRightLeft} onClick={() => go.site('stock/movements')}>Move</Button><Button variant="primary" icon={ClipboardList} onClick={() => countZone([...open.zones.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? zones[0]?.id)}>Count its main zone</Button></>}>
        {open && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Fact label={`${unit.title} on hand`}>{fmtNum(open.bundles)}</Fact>
              <Fact label="Pieces">{fmtNum(open.pieces)}</Fact>
              <Fact label="Kilos">{fmtKg(Math.round(open.kg))}</Fact>
              <Fact label="Last produced">{lastDay.get(open.product.id) ? fmtDayShort(lastDay.get(open.product.id)!) : '—'}</Fact>
            </div>
            <div className="flex items-center gap-2 t-sm"><span className="text-[var(--text-2)]">Standard weight</span><span className="num font-medium">{fmtKg(open.product.stdBundleWeightKg)}</span><span className="text-[var(--text-3)]">± {open.product.weightTolerancePct}%</span><Badge tone={open.product.weightStatus === 'measured' ? 'ok' : 'warn'} dot>{open.product.weightStatus === 'measured' ? 'Measured' : 'To be measured'}</Badge></div>
            {open.product.weightStatus === 'to_be_measured' && <Note tone="warn">This weight is illustrative until the product is weighed on the gate scale. The gate tolerance uses it.</Note>}
            <div>
              <div className="t-label mb-1">Where it sits</div>
              {[...open.zones.entries()].sort((a, b) => b[1] - a[1]).map(([z, n]) => <Meter key={z} label={<span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ background: zoneColor(zoneIndex(z)) }} />{zoneName(z)}</span>} value={n} max={open.bundles} display={<>{fmtNum(n)}<span className="text-[var(--text-3)] font-normal"> · {Math.round((n / open.bundles) * 100)}%</span></>} />)}
            </div>
            {open.product.prices.length > 0 && (
              <div>
                <div className="t-label mb-1">Price list</div>
                {open.product.prices.map((p) => <KV key={p.channel + p.currency} label={`${p.channel === 'export' ? 'Export' : 'Local'} price`}>{fmtMoney(p.amount, p.currency)}</KV>)}
              </div>
            )}
            <div>
              <div className="t-label mb-1">Newest stickers in stock</div>
              <DataGrid dense rows={siteLabels.filter((l) => l.productId === open.product.id && l.status === 'in_stock').sort((a, b) => b.day.localeCompare(a.day) || b.code.localeCompare(a.code)).slice(0, 8)} columns={newestCols.filter((c) => c.key !== 'p')} rowKey={(l) => l.id} />
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
