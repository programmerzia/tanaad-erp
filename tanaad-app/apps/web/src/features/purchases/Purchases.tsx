import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, ClipboardList, Coins, Download, Flag, Package, PackageCheck, Pencil, PieChart, Plus, Scale, Settings2, Trash2, Truck, Wallet, type LucideIcon } from 'lucide-react';
import type { Currency, Purchase } from '@tanaad/domain';
import { landedCost } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useGo, useQueryParam, useRefList, useSite, useSiteSettings } from '@/app/hooks';
import { SITE_COLOR } from '@/config/siteIdentity';
import { Badge, Button, ChipGroup, Combobox, DataGrid, Empty, Field, IconButton, Input, KpiStrip, Meter, Note, PageHeader, Panel, SearchInput, Sheet, StackedBar, Stat, Tabs, Textarea, Toolbar, cn, useIsTouch, type Column, type Tone } from '@/components/ui';
import { CountUp, Donut, compactNum } from '@/components/charts';
import { compact, fmtDayShort, fmtKg, fmtMoney, fmtNum, fmtUGX } from '@/data/format';

type Status = Purchase['status'];
type Filter = 'all' | Status;
const STAGES: { value: Status; label: string; tone: Tone; icon: LucideIcon }[] = [
  { value: 'ordered', label: 'Ordered', tone: 'neutral', icon: ClipboardList },
  { value: 'in_transit', label: 'In transit', tone: 'info', icon: Truck },
  { value: 'at_border', label: 'At border', tone: 'warn', icon: Flag },
  { value: 'received', label: 'Received', tone: 'ok', icon: PackageCheck },
];
const stageOf = (st: Status) => STAGES.find((x) => x.value === st)!;
const CURRENCIES: { value: Currency; label: string }[] = [{ value: 'UGX', label: 'UGX' }, { value: 'USD', label: 'USD' }];
const SEGMENT = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-7)'];
const num = (v: string) => parseFloat(v.replace(/,/g, '')) || 0;
const clean = (v: string) => v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
const costOf = (p: Purchase) => landedCost({ qtyKg: p.qtyKg, unitPrice: p.unitPrice, currency: p.currency, fx: p.fxReference, costs: p.costs, receivedKg: p.receivedKg });
const toUgx = (amount: number, currency: Currency, fx: number) => (currency === 'USD' ? amount * fx : amount);

interface CostDraft { key: string; label: string; amount: string; currency: Currency }
interface Draft { id?: string; reference?: string; supplier: string; originCountry: string; material: string | null; qty: string; unitPrice: string; currency: Currency; fx: string; costs: CostDraft[]; note: string }
let seq = 0;
const newCost = (currency: Currency = 'UGX'): CostDraft => ({ key: `c${++seq}`, label: '', amount: '', currency });
const draftFrom = (p: Purchase | null, fx: number): Draft => (p
  ? { id: p.id, reference: p.reference, supplier: p.supplier, originCountry: p.originCountry, material: p.material, qty: String(p.qtyKg), unitPrice: String(p.unitPrice), currency: p.currency, fx: String(p.fxReference), costs: p.costs.map((c) => ({ key: `c${++seq}`, label: c.label, amount: String(c.amount), currency: c.currency })), note: p.note ?? '' }
  : { supplier: '', originCountry: '', material: null, qty: '', unitPrice: '', currency: 'USD', fx: String(fx), costs: [newCost()], note: '' });

/** Goods plus each extra cost as parts of the landed total, in UGX. More than five extras fold into "Other costs". */
function segmentsOf(goodsUgx: number, costs: { label: string; ugx: number }[]) {
  const extras = costs.filter((c) => c.ugx > 0); const head = extras.slice(0, extras.length > 5 ? 4 : 5); const tail = extras.slice(head.length);
  return [{ label: 'Goods', value: Math.round(goodsUgx), color: SEGMENT[0] }, ...head.map((c, i) => ({ label: c.label || `Extra cost ${i + 1}`, value: Math.round(c.ugx), color: SEGMENT[i + 1] })), ...(tail.length ? [{ label: 'Other costs', value: Math.round(tail.reduce((t, c) => t + c.ugx, 0)), color: SEGMENT[5] }] : [])].filter((x) => x.value > 0);
}

function StatusBadge({ status }: { status: Status }) { const st = stageOf(status); return <Badge tone={st.tone} dot>{st.label}</Badge>; }

/** Where the purchase is on its way from order to store. */
function Stepper({ status, orderedOn, receivedOn }: { status: Status; orderedOn: string; receivedOn?: string }) {
  const at = STAGES.findIndex((x) => x.value === status);
  return (
    <ol className="grid grid-cols-4 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-3" aria-label="Purchase status">
      {STAGES.map((st, i) => {
        const done = i < at || status === 'received'; const now = i === at && status !== 'received';
        return (
          <li key={st.value} className="relative flex flex-col items-center text-center gap-1.5 min-w-0" aria-current={i === at ? 'step' : undefined}>
            {i > 0 && <span aria-hidden className={cn('absolute top-[13px] right-1/2 w-full h-0.5 -z-0', i <= at ? 'bg-[var(--ok)]' : 'bg-[var(--line-2)]')} />}
            <span className={cn('relative z-[1] size-7 rounded-full grid place-items-center border-2', done ? 'bg-[var(--ok)] border-[var(--ok)] text-white' : now ? 'bg-[var(--surface)] border-[var(--accent)] text-[var(--accent-strong)]' : 'bg-[var(--surface)] border-[var(--line-2)] text-[var(--text-4)]')}>{done ? <Check className="size-3.5" strokeWidth={3} /> : <st.icon className="size-3.5" strokeWidth={2} />}</span>
            <span className={cn('t-sm leading-tight', i <= at ? 'font-semibold text-[var(--text)]' : 'text-[var(--text-3)]')}>{st.label}</span>
            <span className="t-xs text-[var(--text-3)] num h-4">{i === 0 ? fmtDayShort(orderedOn) : st.value === 'received' && receivedOn ? fmtDayShort(receivedOn) : now ? 'now' : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Goods, extras, total, per kg and uplift for a purchase or a draft. */
function Breakdown({ goodsUgx, extrasUgx, totalUgx, perKgUgx, upliftPct, kgLabel }: { goodsUgx: number; extrasUgx: number; totalUgx: number; perKgUgx: number; upliftPct: number; kgLabel: string }) {
  const cell = 'px-3 py-2 min-w-0';
  return (
    <div className="rounded-lg border border-[var(--line)] overflow-hidden">
      <div className="grid grid-cols-3 divide-x divide-[var(--line)] bg-[var(--surface-2)]">
        <div className={cell}><div className="t-xs text-[var(--text-3)]">Goods</div><div className="num t-base font-semibold truncate">{fmtUGX(goodsUgx)}</div></div>
        <div className={cell}><div className="t-xs text-[var(--text-3)]">Extra costs</div><div className="num t-base font-semibold truncate">{fmtUGX(extrasUgx)}</div></div>
        <div className={cell}><div className="t-xs text-[var(--text-3)]">Total landed</div><div className="num t-base font-semibold truncate">{fmtUGX(totalUgx)}</div></div>
      </div>
      <div className="flex items-end justify-between gap-3 px-3 py-2.5 border-t border-[var(--line)]">
        <div className="min-w-0"><div className="t-label">Landed cost per kg</div><div className="t-xs text-[var(--text-3)] truncate">{kgLabel}</div></div>
        <div className="text-right shrink-0"><div className="num t-kpi whitespace-nowrap">{perKgUgx ? fmtUGX(perKgUgx) : '—'}</div><div className="t-xs text-[var(--text-3)] num">{goodsUgx > 0 ? `extras add ${upliftPct.toFixed(1)}% to the goods price` : 'enter kilos and a unit price'}</div></div>
      </div>
    </div>
  );
}

/** Raw-material purchases, local and imported, with every extra cost, so each kilo carries its landed cost. */
export function Purchases() {
  const s = useStore(); const site = useSite(); const go = useGo(); const touch = useIsTouch(); const rules = useSiteSettings();
  const materials = useRefList('material');
  const q0 = useQueryParam('q'); const [q, setQ] = useState(q0 ?? ''); useEffect(() => { if (q0 !== undefined) setQ(q0); }, [q0]);
  const [filter, setFilter] = useState<Filter>('all'); const [openId, setOpenId] = useState<string | null>(null); const [draft, setDraft] = useState<Draft | null>(null); const [received, setReceived] = useState('');

  const mine = useMemo(() => s.purchases.filter((p) => p.siteId === site.id).map((p) => ({ p, c: costOf(p) })).sort((a, b) => b.p.orderedOn.localeCompare(a.p.orderedOn) || b.p.reference.localeCompare(a.p.reference)), [s.purchases, site.id]);
  type Row = (typeof mine)[number];
  const text = q.trim().toLowerCase();
  const shown = mine.filter(({ p }) => (filter === 'all' || p.status === filter) && (!text || `${p.reference} ${p.supplier} ${p.originCountry} ${p.material}`.toLowerCase().includes(text)));
  const openOnes = mine.filter((r) => r.p.status !== 'received'); const moving = mine.filter((r) => r.p.status === 'in_transit' || r.p.status === 'at_border');
  const kgOf = (r: Row) => r.p.receivedKg && r.p.receivedKg > 0 ? r.p.receivedKg : r.p.qtyKg;
  const allKg = mine.reduce((t, r) => t + kgOf(r), 0); const allTotal = mine.reduce((t, r) => t + r.c.totalUgx, 0); const avgLanded = allKg ? allTotal / allKg : 0;
  const allGoods = mine.reduce((t, r) => t + r.c.goodsUgx, 0); const allExtras = mine.reduce((t, r) => t + r.c.extrasUgx, 0);
  const tot = { kg: shown.reduce((t, r) => t + r.p.qtyKg, 0), extras: shown.reduce((t, r) => t + r.c.extrasUgx, 0), total: shown.reduce((t, r) => t + r.c.totalUgx, 0), landedKg: shown.reduce((t, r) => t + kgOf(r), 0) };
  const byMaterial = useMemo(() => { const m = new Map<string, { kg: number; total: number; n: number }>(); for (const r of mine) { const cur = m.get(r.p.material) ?? { kg: 0, total: 0, n: 0 }; cur.kg += kgOf(r); cur.total += r.c.totalUgx; cur.n += 1; m.set(r.p.material, cur); } return [...m.entries()].map(([material, v]) => ({ material, n: v.n, kg: v.kg, perKg: v.kg ? v.total / v.kg : 0 })).sort((a, b) => b.perKg - a.perKg); }, [mine]); // eslint-disable-line react-hooks/exhaustive-deps
  const costMix = useMemo(() => { const m = new Map<string, number>(); for (const r of mine) for (const c of r.p.costs) m.set(c.label, (m.get(c.label) ?? 0) + toUgx(c.amount, c.currency, r.p.fxReference)); return segmentsOf(allGoods, [...m.entries()].map(([label, ugx]) => ({ label, ugx })).sort((a, b) => b.ugx - a.ugx)); }, [mine, allGoods]);
  const open = mine.find((r) => r.p.id === openId) ?? null;
  const suppliers = useMemo(() => [...new Set(s.purchases.map((p) => p.supplier))].sort(), [s.purchases]); const origins = useMemo(() => [...new Set(s.purchases.map((p) => p.originCountry).filter(Boolean))].sort(), [s.purchases]); const costLabels = useMemo(() => [...new Set(s.purchases.flatMap((p) => p.costs.map((c) => c.label)))].sort(), [s.purchases]);

  /* ───── New / edit form ───── */
  const d = draft; const set = (patch: Partial<Draft>) => setDraft((x) => (x ? { ...x, ...patch } : x)); const setCost = (key: string, patch: Partial<CostDraft>) => setDraft((x) => (x ? { ...x, costs: x.costs.map((c) => (c.key === key ? { ...c, ...patch } : c)) } : x));
  const dFx = d ? num(d.fx) : 0; const dCosts = d ? d.costs.filter((c) => num(c.amount) > 0).map((c) => ({ label: c.label.trim(), amount: num(c.amount), currency: c.currency })) : [];
  const dCalc = landedCost({ qtyKg: d ? num(d.qty) : 0, unitPrice: d ? num(d.unitPrice) : 0, currency: d?.currency ?? 'UGX', fx: dFx, costs: dCosts });
  const needsFx = !!d && (d.currency === 'USD' || dCosts.some((c) => c.currency === 'USD'));
  const dMissing = d ? [!d.supplier.trim() && 'a supplier', !d.material && 'a material', num(d.qty) <= 0 && 'the kilos', num(d.unitPrice) <= 0 && 'the unit price', needsFx && dFx <= 0 && 'the exchange reference', dCosts.some((c) => !c.label) && 'a name for each extra cost'].filter((x): x is string => !!x) : [];
  const save = () => {
    if (!d || dMissing.length) return;
    const existing = d.id ? s.purchases.find((p) => p.id === d.id) : undefined;
    const rec = s.savePurchase({ id: d.id, reference: d.reference, siteId: site.id, supplier: d.supplier.trim(), originCountry: d.originCountry.trim(), material: d.material!, qtyKg: num(d.qty), unitPrice: num(d.unitPrice), currency: d.currency, fxReference: dFx > 0 ? dFx : s.fx, costs: dCosts, status: existing?.status ?? 'ordered', orderedOn: existing?.orderedOn ?? s.today, receivedOn: existing?.receivedOn, receivedKg: existing?.receivedKg, note: d.note.trim() || undefined });
    s.toast({ kind: 'ok', title: `Purchase ${rec.reference} ${existing ? 'updated' : 'recorded'}`, detail: `${fmtKg(rec.qtyKg)} ${rec.material} · landed ${fmtUGX(dCalc.perKgUgx)} per kg` });
    setDraft(null); setOpenId(rec.id); setFilter('all');
  };

  /* ───── Inspector actions ───── */
  useEffect(() => { setReceived(open && open.p.status !== 'received' ? String(open.p.qtyKg) : ''); }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = open ? STAGES[STAGES.findIndex((x) => x.value === open.p.status) + 1] : undefined;
  const advance = () => { if (!open || !next || next.value === 'received') return; s.savePurchase({ ...open.p, status: next.value }); s.toast({ kind: 'ok', title: `${open.p.reference} is ${next.label.toLowerCase()}` }); };
  const recKg = num(received); const shortKg = open ? Math.max(0, open.p.qtyKg - recKg) : 0; const shortPct = open && open.p.qtyKg ? (shortKg / open.p.qtyKg) * 100 : 0; const shortFlag = shortPct > rules.gateTolerancePct;
  const afterReceive = open ? landedCost({ qtyKg: open.p.qtyKg, unitPrice: open.p.unitPrice, currency: open.p.currency, fx: open.p.fxReference, costs: open.p.costs, receivedKg: recKg }) : null;
  const receive = () => {
    if (!open || recKg <= 0) return;
    s.receivePurchase(open.p.id, recKg);
    s.toast({ kind: shortFlag ? 'warn' : 'ok', title: `${open.p.reference} received · ${fmtKg(recKg)}`, detail: shortKg > 0 ? `${fmtKg(Math.round(shortKg * 10) / 10)} short of the ${fmtKg(open.p.qtyKg)} ordered (${shortPct.toFixed(1)}%)` : 'Full quantity received' });
  };
  const exportCsv = () => {
    const head = ['Reference', 'Ordered', 'Supplier', 'Origin', 'Material', 'Kg', 'Unit price', 'Currency', 'Exchange reference', 'Goods UGX', 'Extras UGX', 'Total UGX', 'Landed UGX/kg', 'Status', 'Received kg'];
    const lines = shown.map(({ p, c }) => [p.reference, p.orderedOn, p.supplier, p.originCountry, p.material, p.qtyKg, p.unitPrice, p.currency, p.fxReference, c.goodsUgx, c.extrasUgx, c.totalUgx, c.perKgUgx, stageOf(p.status).label, p.receivedKg ?? '']);
    const csv = [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = `purchases-${site.id}-${s.today}.csv`; a.click(); URL.revokeObjectURL(url);
    s.toast({ kind: 'ok', title: `CSV exported · ${lines.length} purchase${lines.length === 1 ? '' : 's'}` });
  };

  const cols: Column<Row>[] = [
    { key: 'ref', header: 'Reference', sort: (r) => r.p.reference, cell: ({ p }) => <span className="inline-flex items-center gap-1.5"><span className="code font-medium">{p.reference}</span>{p.example && <Badge tone="accent">example</Badge>}</span> },
    { key: 'sup', header: 'Supplier · origin', truncate: 250, sort: (r) => r.p.supplier, cell: ({ p }) => <span><span className="font-medium">{p.supplier}</span><span className="text-[var(--text-3)]"> · {p.originCountry || 'local'}</span></span> },
    { key: 'mat', header: 'Material', truncate: 160, sort: (r) => r.p.material, cell: ({ p }) => p.material },
    { key: 'kg', header: 'Kg', align: 'right', mono: true, sort: (r) => r.p.qtyKg, cell: ({ p }) => <span>{fmtNum(p.qtyKg)}{p.receivedKg !== undefined && p.receivedKg !== p.qtyKg && <span className="text-[var(--text-3)]"> · {fmtNum(p.receivedKg)} in</span>}</span> },
    { key: 'up', header: 'Unit price', align: 'right', mono: true, sort: (r) => toUgx(r.p.unitPrice, r.p.currency, r.p.fxReference), cell: ({ p }) => <span>{fmtNum(p.unitPrice)} <span className="text-[var(--text-3)]">{p.currency}/kg</span></span> },
    { key: 'ex', header: 'Extras', align: 'right', mono: true, sort: (r) => r.c.extrasUgx, cell: ({ p, c }) => (p.costs.length ? <span title={p.costs.map((x) => x.label).join(', ')}>{fmtNum(Math.round(c.extrasUgx))} <span className="text-[var(--text-3)]">· {p.costs.length}</span></span> : <span className="text-[var(--text-4)]">—</span>) },
    { key: 'lc', header: 'Landed / kg', align: 'right', mono: true, sort: (r) => r.c.perKgUgx, cell: ({ c }) => <span title={`Extras add ${c.upliftPct.toFixed(1)}% to the goods price`}><span className="font-semibold">{fmtNum(Math.round(c.perKgUgx))}</span> <span className="text-[var(--text-3)]">+{c.upliftPct.toFixed(1)}%</span></span> },
    { key: 'st', header: 'Status', sort: (r) => STAGES.findIndex((x) => x.value === r.p.status), cell: ({ p }) => <StatusBadge status={p.status} /> },
  ];
  const fact = (k: string, v: React.ReactNode) => <div className="px-3 py-2 min-w-0"><div className="t-xs text-[var(--text-3)]">{k}</div><div className="t-base font-medium truncate">{v}</div></div>;
  const openSegs = open ? segmentsOf(open.c.goodsUgx, open.p.costs.map((c) => ({ label: c.label, ugx: toUgx(c.amount, c.currency, open.p.fxReference) }))) : [];

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <div className="-mb-[var(--gap)]">
        <PageHeader eyebrow={`${site.name} · Purchases`} title="Purchases" meta={<><Badge tone="neutral" dot>{openOnes.length} open</Badge><Badge tone="neutral">UGX {fmtNum(s.fx)} per USD</Badge></>}
          subtitle="Raw material bought locally or imported. Freight, clearing, haulage and duties are added to the goods price, so every kilo carries its landed cost."
          actions={<><Button icon={Download} onClick={exportCsv} disabled={shown.length === 0} hotkey="e" hotkeyLabel="Export purchases as CSV">Export CSV</Button><Button variant="primary" icon={Plus} onClick={() => setDraft(draftFrom(null, s.fx))} hotkey="n" hotkeyLabel="New purchase">New purchase</Button></>} />
      </div>

      <KpiStrip className="md:!grid-cols-2 xl:!grid-cols-none">
        <Stat label="Open purchases" icon={ClipboardList} accent={SITE_COLOR[site.id]} value={<CountUp value={openOnes.length} />} sub={mine.length ? `${mine.length - openOnes.length} received · ${mine.length} in all` : 'None recorded yet'} onClick={() => setFilter('all')} />
        <Stat label="Kg in transit" icon={Truck} accent="var(--series-1)" value={<><CountUp value={moving.reduce((t, r) => t + r.p.qtyKg, 0)} /><span className="t-base text-[var(--text-3)] font-medium"> kg</span></>} sub={moving.length ? `${moving.length} shipment${moving.length === 1 ? '' : 's'} · ${moving.filter((r) => r.p.status === 'at_border').length} at the border` : 'Nothing on the road'} onClick={() => setFilter('in_transit')} />
        <Stat label="Value on order" icon={Wallet} accent="var(--series-4)" value={<CountUp value={openOnes.reduce((t, r) => t + r.c.totalUgx, 0)} format={compact} />} sub={`UGX landed · goods ${compact(openOnes.reduce((t, r) => t + r.c.goodsUgx, 0))} + extras ${compact(openOnes.reduce((t, r) => t + r.c.extrasUgx, 0))}`} />
        <Stat label="Average landed cost" icon={Coins} accent="var(--series-3)" value={avgLanded ? <><CountUp value={avgLanded} /><span className="t-base text-[var(--text-3)] font-medium"> UGX/kg</span></> : '—'} sub={allGoods ? `extras add ${((allExtras / allGoods) * 100).toFixed(1)}% to the goods price` : 'Appears with the first purchase'} />
      </KpiStrip>

      <div>
        <Toolbar right={<span className="t-sm text-[var(--text-3)] num whitespace-nowrap">{shown.length} of {mine.length}</span>}>
          <SearchInput value={q} onChange={setQ} placeholder="Search reference, supplier, material" />
          <Tabs value={filter} onChange={setFilter} tabs={[{ value: 'all' as Filter, label: 'All', count: mine.length }, ...STAGES.map((st) => ({ value: st.value as Filter, label: st.label, count: mine.filter((r) => r.p.status === st.value).length }))]} />
        </Toolbar>
        <DataGrid rows={shown} rowKey={(r) => r.p.id} columns={cols} onRowClick={(r) => setOpenId(r.p.id)} selectedKey={openId}
          empty={mine.length === 0 ? <span className="inline-flex flex-col items-center gap-2"><span>No purchases recorded for {site.name} yet.</span><Button size="sm" icon={Plus} onClick={() => setDraft(draftFrom(null, s.fx))}>New purchase</Button></span> : 'No purchase matches this search or status.'}
          footer={shown.length ? <tr><td colSpan={3}>{shown.length} purchase{shown.length === 1 ? '' : 's'}</td><td className="text-right num">{fmtNum(tot.kg)}</td><td /><td className="text-right num">{fmtNum(Math.round(tot.extras))}</td><td className="text-right num">{tot.landedKg ? fmtNum(Math.round(tot.total / tot.landedKg)) : '—'}{tot.total - tot.extras > 0 ? ` +${((tot.extras / (tot.total - tot.extras)) * 100).toFixed(1)}%` : ''}</td><td className="num">{compact(tot.total)}</td></tr> : undefined} />
        {mine.some((r) => r.p.example) && <p className="t-xs text-[var(--text-3)] mt-2">Records marked “example” are placeholders that show the shape of an import. They lose the mark as soon as someone edits them.</p>}
      </div>
      <div className="grid gap-[var(--gap)] items-start md:grid-cols-2">
        <Panel icon={PieChart} title="What the money buys" sub="UGX · all purchases">
          {costMix.length === 0 ? <Empty icon={PieChart} title="No cost recorded yet" hint="Goods and each extra cost show here as shares of the landed total." /> : <>
            <StackedBar height={12} segments={costMix} format={(n) => compact(n)} legend={false} />
            <div className="mt-2.5">{costMix.map((x) => <div key={x.label} className="flex items-center gap-2 h-6 t-sm"><span className="size-2 rounded-[2px] shrink-0" style={{ background: x.color }} /><span className="text-[var(--text-2)] truncate flex-1">{x.label}</span><span className="num text-[var(--text-3)]">{Math.round((x.value / (allTotal || 1)) * 100)}%</span><span className="num font-medium w-[84px] text-right">{fmtNum(x.value)}</span></div>)}</div>
          </>}
        </Panel>
        <Panel icon={Scale} title="Landed cost by material" sub="UGX per kg">
          {byMaterial.length === 0 ? <Empty icon={Scale} title="No material bought yet" /> : byMaterial.map((m) => <Meter key={m.material} label={m.material} sub={`${fmtKg(m.kg)} · ${m.n} purchase${m.n === 1 ? '' : 's'}`} value={m.perKg} max={Math.max(...byMaterial.map((x) => x.perKg))} display={fmtNum(Math.round(m.perKg))} />)}
        </Panel>
      </div>

      {/* ───── Inspector ───── */}
      <Sheet open={!!open && !draft} onClose={() => setOpenId(null)} width={540}
        title={open ? <span className="inline-flex items-center gap-2"><span className="code">{open.p.reference}</span><StatusBadge status={open.p.status} />{open.p.example && <Badge tone="accent">example</Badge>}</span> : ''}
        sub={open ? `${open.p.material} · ${open.p.supplier}` : undefined}
        footer={open && <>
          <Button className="mr-auto" variant="ghost" icon={Pencil} onClick={() => setDraft(draftFrom(open.p, s.fx))}>Edit</Button>
          {next && next.value !== 'received' && <Button icon={ArrowRight} onClick={advance} hotkey="a" hotkeyLabel="Move the purchase to its next stage">Mark {next.label.toLowerCase()}</Button>}
          {open.p.status !== 'received' && <Button variant="primary" icon={PackageCheck} disabled={recKg <= 0} onClick={receive} hotkey="mod+enter" hotkeyLabel="Receive the purchase">Receive {recKg > 0 ? fmtKg(recKg) : ''}</Button>}
        </>}>
        {open && (
          <div className="flex flex-col gap-3">
            <Stepper status={open.p.status} orderedOn={open.p.orderedOn} receivedOn={open.p.receivedOn} />
            <div className="grid grid-cols-2 sm:grid-cols-3 rounded-lg border border-[var(--line)] [&>*]:border-b [&>*]:border-r [&>*]:border-[var(--line)] overflow-hidden [&>*:nth-child(3n)]:sm:border-r-0 [&>*:nth-last-child(-n+3)]:sm:border-b-0">
              {fact('Supplier', open.p.supplier)}{fact('Origin', open.p.originCountry || '—')}{fact('Material', open.p.material)}
              {fact('Quantity', <span className="num">{fmtKg(open.p.qtyKg)}</span>)}{fact('Unit price', <span className="num">{fmtMoney(open.p.unitPrice, open.p.currency)} / kg</span>)}{fact('Exchange reference', <span className="num">UGX {fmtNum(open.p.fxReference)} / USD</span>)}
            </div>

            <div>
              <div className="t-label mb-1.5">Landed cost</div>
              <div className="rounded-lg border border-[var(--line)] p-3 flex flex-wrap items-center gap-x-5 gap-y-3">
                <Donut size={128} thickness={16} center={compactNum(open.c.totalUgx)} sub="UGX landed" segments={openSegs} />
                <div className="flex-1 min-w-[220px]">
                  {openSegs.map((x) => <div key={x.label} className="flex items-center gap-2 min-h-6 t-sm"><span className="size-2 rounded-[2px] shrink-0" style={{ background: x.color }} /><span className="text-[var(--text-2)] truncate flex-1">{x.label}</span><span className="num text-[var(--text-3)]">{Math.round((x.value / (open.c.totalUgx || 1)) * 100)}%</span><span className="num font-medium w-[92px] text-right">{fmtNum(x.value)}</span></div>)}
                  <div className="flex items-center gap-2 h-7 t-sm font-semibold border-t border-[var(--line)] mt-1 pt-1"><span className="flex-1">Total landed</span><span className="num">{fmtUGX(open.c.totalUgx)}</span></div>
                </div>
              </div>
            </div>
            <Breakdown {...open.c} kgLabel={open.p.receivedKg ? `over the ${fmtKg(open.p.receivedKg)} received` : `over the ${fmtKg(open.p.qtyKg)} ordered`} />
            {open.p.costs.some((c) => c.currency === 'USD') || open.p.currency === 'USD' ? <p className="t-xs text-[var(--text-3)] -mt-1">USD amounts are converted at this purchase's exchange reference, UGX {fmtNum(open.p.fxReference)} per USD.</p> : null}

            {open.p.status === 'received' ? (() => { const gap = open.p.qtyKg - (open.p.receivedKg ?? open.p.qtyKg); const pct = open.p.qtyKg ? (gap / open.p.qtyKg) * 100 : 0; return (
              <Note tone={gap > 0 && pct > rules.gateTolerancePct ? 'warn' : 'ok'}><strong>Received {open.p.receivedOn ? fmtDayShort(open.p.receivedOn) : ''}:</strong> <span className="num">{fmtKg(open.p.receivedKg ?? open.p.qtyKg)}</span> of <span className="num">{fmtKg(open.p.qtyKg)}</span> ordered. {gap > 0 ? `Short by ${fmtKg(Math.round(gap * 10) / 10)} (${pct.toFixed(1)}%); the landed cost is spread over the kilos that arrived.` : 'Nothing missing.'}</Note>
            ); })() : (
              <div>
                <div className="t-label mb-1.5">Receive into the store</div>
                <div className="rounded-lg border border-[var(--line)] p-3 grid gap-3 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)] items-start">
                  <Field label="Kg received on the scale"><div className="relative"><Input big className="num text-right pr-10 font-semibold" inputMode="decimal" value={received} onChange={(e) => setReceived(clean(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); receive(); } }} aria-label="Kg received" /><span className="absolute right-3 top-1/2 -translate-y-1/2 t-sm text-[var(--text-3)] pointer-events-none">kg</span></div></Field>
                  <div className="min-w-0">
                    {recKg <= 0 ? <Note tone="neutral">Enter the kilos weighed in. The landed cost per kg is recalculated over what actually arrived.</Note>
                      : shortKg > 0 ? <Note tone={shortFlag ? 'warn' : 'neutral'} icon={shortFlag ? AlertTriangle : undefined}><strong>Shortfall {fmtKg(Math.round(shortKg * 10) / 10)}</strong> ({shortPct.toFixed(1)}% of the order{shortFlag ? `, above the ${rules.gateTolerancePct}% weight tolerance` : ''}). Landed cost becomes <span className="num font-medium">{fmtUGX(afterReceive?.perKgUgx ?? 0)}</span> per kg.</Note>
                        : <Note tone="ok">Full quantity. Landed cost stays <span className="num font-medium">{fmtUGX(afterReceive?.perKgUgx ?? 0)}</span> per kg.</Note>}
                  </div>
                </div>
              </div>
            )}
            {open.p.note && <Note tone="neutral" icon={false}>{open.p.note}</Note>}
          </div>
        )}
      </Sheet>

      {/* ───── New / edit purchase ───── */}
      <Sheet open={!!d} onClose={() => setDraft(null)} width={600} title={d?.id ? `Edit ${d.reference ?? 'purchase'}` : 'New purchase'} sub={`${site.name} · ordered ${fmtDayShort(d?.id ? s.purchases.find((p) => p.id === d.id)?.orderedOn ?? s.today : s.today)}`}
        footer={d && <><span className="mr-auto t-sm text-[var(--text-3)] min-w-0 truncate">{dMissing.length ? `Still needed: ${dMissing.join(', ')}.` : <span className="text-[var(--text)] num">{fmtUGX(dCalc.perKgUgx)} per kg landed</span>}</span><Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button><Button variant="primary" icon={Check} disabled={dMissing.length > 0} onClick={save} hotkey="mod+enter" hotkeyLabel="Save the purchase">Save purchase</Button></>}>
        {d && (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Supplier" required><Input data-autofocus="" autoFocus={!touch} value={d.supplier} onChange={(e) => set({ supplier: e.target.value })} placeholder="Supplier name" list="purchase-suppliers" /></Field>
              <Field label="Origin country" hint="Leave empty for a local purchase"><Input value={d.originCountry} onChange={(e) => set({ originCountry: e.target.value })} placeholder="Country of origin" list="purchase-origins" /></Field>
            </div>
            <datalist id="purchase-suppliers">{suppliers.map((x) => <option key={x} value={x} />)}</datalist><datalist id="purchase-origins">{origins.map((x) => <option key={x} value={x} />)}</datalist><datalist id="purchase-cost-labels">{costLabels.map((x) => <option key={x} value={x} />)}</datalist>
            <Field label="Material" required hint={materials.length ? 'Materials come from Settings → Master data.' : undefined}>
              {materials.length === 0 ? <Empty icon={Package} title="No materials yet" hint="Add materials in Settings → Master data. They appear here straight away." action={<Button size="sm" icon={Settings2} onClick={() => go.site('settings')}>Open Settings</Button>} />
                : <Combobox options={[...materials.map((m) => ({ value: m.label, label: m.label, sub: m.value ? `${fmtNum(m.value)} ${m.unit ?? 'kg'}` : m.unit, right: m.example ? <Badge tone="neutral">example</Badge> : undefined })), ...(d.material && !materials.some((m) => m.label === d.material) ? [{ value: d.material, label: d.material, sub: 'not in the current list' }] : [])]} value={d.material} onChange={(v) => set({ material: v })} placeholder="Search materials" />}
            </Field>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <Field label="Quantity" required><div className="relative"><Input className="num text-right pr-9" inputMode="decimal" value={d.qty} onChange={(e) => set({ qty: clean(e.target.value) })} placeholder="0" /><span className="absolute right-2.5 top-1/2 -translate-y-1/2 t-sm text-[var(--text-3)] pointer-events-none">kg</span></div></Field>
              <Field label="Unit price per kg" required><Input className="num text-right" inputMode="decimal" value={d.unitPrice} onChange={(e) => set({ unitPrice: clean(e.target.value) })} placeholder="0" /></Field>
              <Field label="Currency" className="max-sm:col-span-2"><ChipGroup ariaLabel="Currency" options={CURRENCIES} value={d.currency} onChange={(v) => set({ currency: v })} /></Field>
            </div>
            <Field label="Exchange reference" hint={`Starts from the group reference (UGX ${fmtNum(s.fx)} per USD). Change it to the rate this purchase was paid at; it stays with the purchase.`}>
              <div className="relative max-w-[240px]"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 t-sm text-[var(--text-3)] pointer-events-none">UGX</span><Input className="num text-right pl-11 pr-[68px]" inputMode="decimal" value={d.fx} onChange={(e) => set({ fx: clean(e.target.value) })} /><span className="absolute right-2.5 top-1/2 -translate-y-1/2 t-sm text-[var(--text-3)] pointer-events-none">per USD</span></div>
            </Field>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1"><span className="t-sm font-medium text-[var(--text-2)]">Extra costs <span className="font-normal text-[var(--text-3)]">· freight, clearing, haulage, duties…</span></span><Button size="sm" icon={Plus} onClick={() => set({ costs: [...d.costs, newCost(d.costs.at(-1)?.currency)] })}>Add cost</Button></div>
              <div className="rounded-lg border border-[var(--line)] divide-y divide-[var(--line)]">
                {d.costs.length === 0 && <div className="px-3 py-3 t-sm text-[var(--text-3)]">No extra cost: the landed cost equals the goods price.</div>}
                {d.costs.map((c, i) => (
                  <div key={c.key} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_130px_auto_auto] gap-1.5 items-center p-1.5">
                    <Input className="max-sm:col-span-2" value={c.label} onChange={(e) => setCost(c.key, { label: e.target.value })} placeholder="What the cost is for" aria-label={`Extra cost ${i + 1} name`} list="purchase-cost-labels" />
                    <Input className="num text-right" inputMode="decimal" value={c.amount} onChange={(e) => setCost(c.key, { amount: clean(e.target.value) })} placeholder="Amount" aria-label={`Extra cost ${i + 1} amount`} />
                    <div className="flex items-center gap-1.5"><ChipGroup size="sm" ariaLabel={`Extra cost ${i + 1} currency`} options={CURRENCIES} value={c.currency} onChange={(v) => setCost(c.key, { currency: v })} />
                      <IconButton icon={Trash2} label={`Remove extra cost ${i + 1}`} onClick={() => set({ costs: d.costs.filter((x) => x.key !== c.key) })} /></div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="t-label mb-1.5">Landed cost, live</div>
              <Breakdown {...dCalc} kgLabel={num(d.qty) > 0 ? `over ${fmtKg(num(d.qty))} at UGX ${fmtNum(dFx)} per USD` : 'updates as you type'} />
              {dCalc.totalUgx > 0 && <div className="mt-2"><StackedBar height={10} format={(n) => fmtNum(n)} segments={segmentsOf(dCalc.goodsUgx, dCosts.map((c) => ({ label: c.label, ugx: toUgx(c.amount, c.currency, dFx) })))} /></div>}
            </div>
            <Field label="Note"><Textarea value={d.note} onChange={(e) => set({ note: e.target.value })} placeholder="Shipping line, container, payment terms…" /></Field>
          </div>
        )}
      </Sheet>
    </div>
  );
}
