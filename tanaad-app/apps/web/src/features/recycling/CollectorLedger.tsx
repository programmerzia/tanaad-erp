import { useEffect, useMemo, useState } from 'react';
import { Banknote, BarChart3, CheckCircle2, Download, Percent, PieChart, Scale, Users, Wallet } from 'lucide-react';
import type { CollectorDelivery } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useGo, useQueryParam, useRefList } from '@/app/hooks';
import { lastWorkingDays } from '@/data/selectors';
import { Avatar, Badge, Button, DataGrid, Empty, KpiStrip, MiniBars, PageHeader, Panel, SearchInput, Sheet, Stat, Tabs, Toolbar, type Column } from '@/components/ui';
import { ColumnChart, CountUp, Donut } from '@/components/charts';
import { compact, fmtDayShort, fmtKg, fmtNum, fmtUGX } from '@/data/format';
import { amountOf, BarCell, collectorColours, useShift, voucherNo } from './kit';
import { fmtTime } from './kit';

interface LedgerRow { collector: string; deliveries: CollectorDelivery[]; n: number; gross: number; net: number; avgDed: number; amount: number; paid: number; unpaid: number; unpaidCount: number; last: string }
type StatusFilter = 'all' | 'unpaid' | 'paid';

/** R2 · Collector ledger: per collector, what was weighed, what was deducted, what was paid, what is still owed. */
export function CollectorLedger() {
  const s = useStore(); const go = useGo(); const { today, site } = useShift();
  const q0 = useQueryParam('q'); const [q, setQ] = useState(q0 ?? ''); const [status, setStatus] = useState<StatusFilter>('all'); const [openRow, setOpenRow] = useState<string | null>(null);
  useEffect(() => { if (q0 !== undefined) setQ(q0); }, [q0]);
  const all = s.collectorDeliveries; const dedOptions = useRefList('deduction_option');
  const rows = useMemo<LedgerRow[]>(() => { const m = new Map<string, CollectorDelivery[]>(); for (const d of all) m.set(d.collector, [...(m.get(d.collector) ?? []), d]); return [...m.entries()].map(([collector, ds]) => { const gross = ds.reduce((t, d) => t + d.grossKg, 0); const net = ds.reduce((t, d) => t + d.netKg, 0); const amount = ds.reduce((t, d) => t + amountOf(d), 0); const paid = ds.filter((d) => d.paid).reduce((t, d) => t + amountOf(d), 0); const deliveries = [...ds].sort((a, b) => b.at.localeCompare(a.at)); return { collector, deliveries, n: ds.length, gross, net, avgDed: Math.round((ds.reduce((t, d) => t + d.deductionPct, 0) / ds.length) * 10) / 10, amount, paid, unpaid: amount - paid, unpaidCount: ds.filter((d) => !d.paid).length, last: deliveries[0].at }; }).sort((a, b) => b.net - a.net); }, [all]);
  const shown = rows.filter((r) => r.collector.toLowerCase().includes(q.trim().toLowerCase()) && (status === 'all' || (status === 'unpaid' ? r.unpaid > 0 : r.unpaid === 0)));
  const names = new Set(shown.map((r) => r.collector)); const colourOf = useMemo(() => collectorColours(rows.map((r) => r.collector)), [rows]);
  const days = lastWorkingDays('recycling', today, 10);
  const byDay = days.map((d) => { const ds = all.filter((x) => x.day === d && names.has(x.collector)); return { day: d, net: Math.round(ds.reduce((t, x) => t + x.netKg, 0)), ded: ds.length ? ds.reduce((t, x) => t + x.deductionPct, 0) / ds.length : 0 }; });
  const tot = { n: shown.reduce((t, r) => t + r.n, 0), gross: shown.reduce((t, r) => t + r.gross, 0), net: shown.reduce((t, r) => t + r.net, 0), amount: shown.reduce((t, r) => t + r.amount, 0), paid: shown.reduce((t, r) => t + r.paid, 0), unpaid: shown.reduce((t, r) => t + r.unpaid, 0), unpaidCount: shown.reduce((t, r) => t + r.unpaidCount, 0) };
  const avgDed = tot.n ? shown.reduce((t, r) => t + r.avgDed * r.n, 0) / tot.n : 0;
  const maxNet = Math.max(1, ...shown.map((r) => r.net)); const maxDed = Math.max(1, ...dedOptions.map((o) => o.value ?? 0), ...shown.map((r) => r.avgDed));
  const open = rows.find((r) => r.collector === openRow) ?? null;
  const filtered = q.trim() !== '' || status !== 'all';

  const exportCsv = (which: LedgerRow[], tag: string) => {
    const head = ['Voucher', 'Day', 'Time', 'Collector', 'Gross kg', 'Tare kg', 'Deduction %', 'Net kg', 'Price UGX/kg', 'Amount UGX', 'Paid'];
    const lines = which.flatMap((r) => r.deliveries.map((d) => [voucherNo(d, all), d.day, fmtTime(d.at), d.collector, d.grossKg, d.tareKg, d.deductionPct, d.netKg, d.pricePerKg, amountOf(d), d.paid ? 'yes' : 'no']));
    const csv = [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = `collector-ledger-${tag.replace(/\s+/g, '-').toLowerCase()}-${today}.csv`; a.click(); URL.revokeObjectURL(url);
    useStore.getState().toast({ kind: 'ok', title: `CSV exported · ${lines.length} deliveries` });
  };
  const pay = (d: CollectorDelivery) => { s.payCollector(d.id); useStore.getState().toast({ kind: 'ok', title: `${fmtUGX(amountOf(d))} paid to ${d.collector}`, detail: 'Posted to today’s cash book' }); };

  const cols: Column<LedgerRow>[] = [
    { key: 'c', header: 'Collector', sort: (r) => r.collector, cell: (r) => <span className="inline-flex items-center gap-2"><Avatar name={r.collector} size={22} /><span className="font-medium">{r.collector}</span></span> },
    { key: 'l', header: 'Last delivery', sort: (r) => r.last, cell: (r) => <span className="num text-[var(--text-2)]">{r.last.slice(0, 10) === today ? `Today ${fmtTime(r.last)}` : fmtDayShort(r.last.slice(0, 10))}</span> },
    { key: 'n', header: 'Deliveries', align: 'right', mono: true, sort: (r) => r.n, cell: (r) => r.n },
    { key: 'g', header: 'Gross kg', align: 'right', mono: true, sort: (r) => r.gross, cell: (r) => fmtNum(r.gross) },
    { key: 'net', header: 'Net kg', align: 'right', sort: (r) => r.net, cell: (r) => <BarCell value={r.net} max={maxNet} display={fmtNum(Math.round(r.net))} width={72} /> },
    { key: 'd', header: 'Avg deduction', align: 'right', sort: (r) => r.avgDed, cell: (r) => <BarCell value={r.avgDed} max={maxDed} tone="neutral" display={`${r.avgDed.toFixed(1)}%`} width={56} /> },
    { key: 'a', header: 'Amount UGX', align: 'right', mono: true, sort: (r) => r.amount, cell: (r) => <span className="font-medium">{fmtNum(r.amount)}</span> },
    { key: 'p', header: 'Paid UGX', align: 'right', mono: true, sort: (r) => r.paid, cell: (r) => fmtNum(r.paid) },
    { key: 'u', header: 'Status', sort: (r) => r.unpaid, cell: (r) => (r.unpaid ? <Badge tone="warn" dot>{fmtNum(r.unpaid)} unpaid</Badge> : <Badge tone="ok" dot>Paid</Badge>) },
  ];
  const deliveryCols: Column<CollectorDelivery>[] = [
    { key: 'v', header: 'Voucher', cell: (d) => <span className="code font-medium">{voucherNo(d, all)}</span> },
    { key: 'd', header: 'Weighed', sort: (d) => d.at, cell: (d) => <span className="num">{fmtDayShort(d.day)} {fmtTime(d.at)}</span> },
    { key: 'g', header: 'Gross', align: 'right', mono: true, cell: (d) => fmtNum(d.grossKg) },
    { key: 'ta', header: 'Tare', align: 'right', mono: true, cell: (d) => fmtNum(d.tareKg) },
    { key: 'de', header: 'Ded.', align: 'right', mono: true, sort: (d) => d.deductionPct, cell: (d) => `${d.deductionPct}%` },
    { key: 'n', header: 'Net kg', align: 'right', mono: true, sort: (d) => d.netKg, cell: (d) => <span className="font-medium">{fmtNum(d.netKg)}</span> },
    { key: 'pr', header: 'UGX / kg', align: 'right', mono: true, cell: (d) => fmtNum(d.pricePerKg) },
    { key: 'a', header: 'Amount', align: 'right', mono: true, sort: (d) => amountOf(d), cell: (d) => <span className="font-medium">{fmtNum(amountOf(d))}</span> },
    { key: 'p', header: 'Paid', align: 'right', cell: (d) => (d.paid ? <Badge tone="ok" dot>Paid</Badge> : <Button size="sm" variant="primary" onClick={() => pay(d)}>Pay</Button>) },
  ];

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <div className="-mb-[var(--gap)]">
        <PageHeader eyebrow={`${site.name} · Collectors`} title="Collector ledger" meta={<><Badge tone="neutral">Last 10 days</Badge>{tot.unpaidCount > 0 && <Badge tone="warn" dot>{tot.unpaidCount} voucher{tot.unpaidCount === 1 ? '' : 's'} unpaid</Badge>}</>}
          subtitle="Every delivery, deduction and payment per collector. The deduction average is the number to discuss with them."
          actions={<><Button variant="ghost" icon={Scale} className="max-sm:hidden" onClick={() => go.site('production/intake')}>Weigh in</Button><Button icon={Download} onClick={() => exportCsv(shown, filtered ? (shown.length === 1 ? shown[0].collector : 'filtered') : 'all')} disabled={shown.length === 0} hotkey="e" hotkeyLabel="Export the ledger as CSV">Export CSV</Button></>} />
      </div>

      <KpiStrip>
        <Stat label="Collectors" icon={Users} accent="var(--series-1)" value={<CountUp value={shown.length} />} sub={`${tot.n} deliveries${filtered ? ' · filtered' : ''}`} />
        <Stat label="Net kg, 10 days" icon={Scale} accent="var(--series-5)" value={<CountUp value={Math.round(tot.net)} />} spark={byDay.map((d) => d.net)} sparkColor="var(--series-5)" sub={`gross ${fmtKg(tot.gross)}`} />
        <Stat label="Average deduction" icon={Percent} accent="var(--series-4)" value={<><CountUp value={avgDed} format={(n) => n.toFixed(1)} /><span className="text-[var(--text-3)] font-medium">%</span></>} spark={byDay.map((d) => d.ded)} sparkColor="var(--series-4)" sub={`${fmtKg(Math.round(tot.gross - tot.net))} taken off gross`} />
        <Stat label="Paid" icon={Banknote} accent="var(--series-3)" value={<CountUp value={tot.paid} format={compact} />} sub={`UGX · of ${compact(tot.amount)} weighed in`} />
        <Stat label="Unpaid" icon={Wallet} accent="var(--series-2)" tone={tot.unpaid ? 'warn' : 'ok'} value={<CountUp value={tot.unpaid} format={compact} />} sub={tot.unpaid ? `UGX · ${tot.unpaidCount} voucher${tot.unpaidCount === 1 ? '' : 's'}` : 'UGX · everyone is paid'} onClick={() => setStatus(status === 'unpaid' ? 'all' : 'unpaid')} />
      </KpiStrip>

      <div className="grid gap-[var(--gap)] xl:grid-cols-[minmax(0,1fr)_400px]">
        <Panel icon={BarChart3} title="Net kg received" sub={`per day · last 10 working days${filtered ? ' · filtered' : ''}`}>
          <ColumnChart height={176} data={byDay.map((d) => ({ label: fmtDayShort(d.day), values: [d.net], partial: d.day === today }))} />
        </Panel>
        <Panel icon={PieChart} title="Share by collector" sub="net kg · 10 days">
          {shown.length === 0 ? <Empty title="No collector matches" /> : (
            <div className="flex items-center gap-4">
              <Donut size={124} thickness={16} center={compact(Math.round(tot.net))} sub="kg net" segments={shown.slice(0, 6).map((r) => ({ label: r.collector, value: Math.round(r.net), color: colourOf(r.collector) }))} />
              <div className="flex-1 min-w-0">{shown.slice(0, 6).map((r) => <div key={r.collector} className="flex items-center gap-2 h-6 t-sm"><span className="size-2 rounded-[2px] shrink-0" style={{ background: colourOf(r.collector) }} /><span className="text-[var(--text-2)] truncate flex-1">{r.collector}</span><span className="num font-medium">{Math.round((r.net / (tot.net || 1)) * 100)}%</span></div>)}</div>
            </div>
          )}
        </Panel>
      </div>

      <div>
        <Toolbar right={<span className="t-sm text-[var(--text-3)] num whitespace-nowrap">{shown.length} of {rows.length} collectors</span>}>
          <SearchInput value={q} onChange={setQ} placeholder="Search collectors" />
          <Tabs value={status} onChange={setStatus} tabs={[{ value: 'all', label: 'All', count: rows.length }, { value: 'unpaid', label: 'Unpaid', count: rows.filter((r) => r.unpaid > 0).length }, { value: 'paid', label: 'Paid up', count: rows.filter((r) => r.unpaid === 0).length }]} />
        </Toolbar>
        <DataGrid rows={shown} rowKey={(r) => r.collector} columns={cols} onRowClick={(r) => setOpenRow(r.collector)} selectedKey={openRow}
          empty={rows.length === 0 ? 'No deliveries recorded. Weigh-ins from Intake appear here per collector.' : 'No collector matches this search.'}
          footer={shown.length ? <tr><td colSpan={2}>{shown.length} collector{shown.length === 1 ? '' : 's'}</td><td className="text-right num">{tot.n}</td><td className="text-right num">{fmtNum(tot.gross)}</td><td className="text-right num">{fmtNum(Math.round(tot.net))}</td><td className="text-right num">{avgDed.toFixed(1)}%</td><td className="text-right num">{fmtNum(tot.amount)}</td><td className="text-right num">{fmtNum(tot.paid)}</td><td className="num">{tot.unpaid ? `${fmtNum(tot.unpaid)} unpaid` : 'All paid'}</td></tr> : undefined} />
      </div>

      <Sheet open={!!open} onClose={() => setOpenRow(null)} width={860} title={open ? <span className="inline-flex items-center gap-2"><Avatar name={open.collector} size={22} />{open.collector}</span> : ''}
        footer={open && <><span className="mr-auto t-sm text-[var(--text-3)]">{open.unpaidCount ? `${open.unpaidCount} voucher${open.unpaidCount === 1 ? '' : 's'} to pay · ${fmtUGX(open.unpaid)}` : 'Nothing owed'}</span><Button icon={Download} onClick={() => exportCsv([open], open.collector)}>Export this collector</Button></>}>
        {open && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 rounded-lg border border-[var(--line)] divide-x divide-[var(--line)] overflow-hidden">
              {([['Deliveries', String(open.n), `gross ${fmtKg(open.gross)}`], ['Net kg', fmtNum(Math.round(open.net)), `${Math.round((open.net / (rows.reduce((t, r) => t + r.net, 0) || 1)) * 100)}% of all intake`], ['Avg deduction', `${open.avgDed.toFixed(1)}%`, `all collectors ${(rows.reduce((t, r) => t + r.avgDed * r.n, 0) / (rows.reduce((t, r) => t + r.n, 0) || 1)).toFixed(1)}%`], ['Amount', compact(open.amount), open.unpaid ? `UGX · ${compact(open.unpaid)} unpaid` : 'UGX · paid in full']] as const).map(([k, v, sub]) => (
                <div key={k} className="px-3 py-2 min-w-0 max-sm:[&:nth-child(n+3)]:border-t max-sm:[&:nth-child(n+3)]:border-[var(--line)]"><div className="t-xs text-[var(--text-3)]">{k}</div><div className="num t-lg font-semibold">{v}</div><div className="t-xs text-[var(--text-3)] truncate">{sub}</div></div>
              ))}
            </div>
            <div className="rounded-lg border border-[var(--line)] px-3 py-2.5">
              <div className="t-label mb-1">Net kg per day</div>
              <MiniBars height={64} format={(n) => fmtKg(n)} data={days.map((d) => ({ label: fmtDayShort(d), value: Math.round(open.deliveries.filter((x) => x.day === d).reduce((t, x) => t + x.netKg, 0)), partial: d === today }))} />
            </div>
            <div className="rounded-lg border border-[var(--line)] overflow-hidden">
              <DataGrid bare dense rows={open.deliveries} rowKey={(d) => d.id} columns={deliveryCols} maxHeight={360} />
            </div>
            {open.unpaidCount === 0 && <div className="flex items-center gap-1.5 t-sm text-[var(--text-2)]"><CheckCircle2 className="size-4 text-[var(--ok)]" />Every voucher for this collector is paid.</div>}
          </div>
        )}
      </Sheet>
    </div>
  );
}
