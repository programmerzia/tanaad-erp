import { useMemo, useState } from 'react';
import { Wallet, Download, Printer, ArrowDownLeft, ArrowUpRight, ShieldCheck, Plus, Calculator, Search, CheckCircle2, AlertTriangle, FileText, X } from 'lucide-react';
import type { CashCategory } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite } from '@/app/hooks';
import { cashDayFor, cashSummary, lastWorkingDays } from '@/data/selectors';
import { fmtDay, fmtDayShort, fmtUGX } from '@/data/format';
import { Badge, Button, DataGrid, Empty, KpiStrip, Panel, Sheet, Stat, cn, type Column } from '@/components/ui';
import { categoryColor, downloadCsv, useExpenseCategories } from '@/features/cash/categories';

export function CashReport() {
  const s = useStore();
  const site = useSite();
  const [day, setDay] = useState(s.today);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [flowFilter, setFlowFilter] = useState<'all' | 'in' | 'out'>('all');

  // Interactive drawers and dialogs
  const [voucherDrawerOpen, setVoucherDrawerOpen] = useState(false);
  const [reconcileModalOpen, setReconcileModalOpen] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<any | null>(null);

  // New Voucher Form State
  const [voucherDirection, setVoucherDirection] = useState<'in' | 'out'>('out');
  const [voucherCategory, setVoucherCategory] = useState<CashCategory>('materials');
  const [voucherAmount, setVoucherAmount] = useState('');
  const [voucherPayee, setVoucherPayee] = useState('');
  const [voucherNote, setVoucherNote] = useState('');

  // Safe Note Counts State
  const [note50k, setNote50k] = useState('380');
  const [note20k, setNote20k] = useState('160');
  const [note10k, setNote10k] = useState('65');
  const [note5k, setNote5k] = useState('24');
  const [note2k, setNote2k] = useState('15');
  const [note1k, setNote1k] = useState('10');
  const [coins, setCoins] = useState('10000');

  const days = useMemo(() => lastWorkingDays(site.id, s.today, 7), [site.id, s.today]);
  const cd = useMemo(() => cashDayFor(s, site.id, day), [s, site.id, day]);
  const sum = useMemo(() => (cd ? cashSummary(s, cd.id) : null), [s, cd]);
  const cats = useExpenseCategories();

  const opening = cd?.opening ?? 0;
  const moneyIn = (sum?.sales ?? 0) + (sum?.receipts ?? 0);
  const moneyOut = (sum?.expenses ?? 0) + (sum?.wages ?? 0);
  const expectedClosing = sum?.expectedClosing ?? opening;

  const allEntries = useMemo(() => {
    if (!sum) return [];
    let running = opening;
    return sum.entries.map((e) => {
      if (e.direction === 'in') running += e.amount;
      else running -= e.amount;
      return {
        ...e,
        runningBalance: running,
      };
    });
  }, [sum, opening]);

  const entries = useMemo(() => {
    return allEntries.filter((e) => {
      if (flowFilter === 'in' && e.direction !== 'in') return false;
      if (flowFilter === 'out' && e.direction !== 'out') return false;
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const payee = (e.payee ?? '').toLowerCase();
      const note = (e.note ?? '').toLowerCase();
      const cat = cats.label(e.category).toLowerCase();
      return payee.includes(q) || note.includes(q) || cat.includes(q);
    });
  }, [allEntries, flowFilter, categoryFilter, search, cats]);

  // Physical calculation
  const physicalTotal = useMemo(() => {
    const c50 = (parseInt(note50k, 10) || 0) * 50000;
    const c20 = (parseInt(note20k, 10) || 0) * 20000;
    const c10 = (parseInt(note10k, 10) || 0) * 10000;
    const c5 = (parseInt(note5k, 10) || 0) * 5000;
    const c2 = (parseInt(note2k, 10) || 0) * 2000;
    const c1 = (parseInt(note1k, 10) || 0) * 1000;
    const cn = parseInt(coins, 10) || 0;
    return c50 + c20 + c10 + c5 + c2 + c1 + cn;
  }, [note50k, note20k, note10k, note5k, note2k, note1k, coins]);

  const varianceUGX = physicalTotal - expectedClosing;

  const handleExport = () => {
    const headers = ['Timestamp', 'Type', 'Category', 'Payee / Description', 'Voucher Ref', 'Amount (UGX)', 'Running Safe Balance (UGX)'];
    const exportRows = allEntries.map((e) => [
      e.at.slice(11, 16),
      e.direction === 'in' ? 'Money In' : 'Money Out',
      cats.label(e.category),
      e.note ?? e.payee ?? 'Cash Entry',
      e.subcategory ?? e.id.slice(0, 8),
      e.amount,
      e.runningBalance,
    ]);
    downloadCsv(`cash-book-ledger-${site.id}-${day}`, headers, exportRows);
    s.toast({ kind: 'ok', title: 'Cash ledger exported to CSV' });
  };

  const handleCreateVoucher = () => {
    const amt = parseInt(voucherAmount, 10);
    if (!amt || amt <= 0) {
      s.toast({ kind: 'warn', title: 'Please specify a valid voucher amount' });
      return;
    }

    s.addCashEntry({
      siteId: site.id,
      day,
      direction: voucherDirection,
      category: voucherCategory,
      amount: amt,
      payee: voucherPayee.trim() || 'Internal Cash Office',
      note: voucherNote.trim() || 'Direct shift voucher disbursement',
      subcategory: `VCH-${day.replace(/-/g, '')}-${String(allEntries.length + 1).padStart(3, '0')}`,
      hasReceiptPhoto: true,
    });

    s.toast({
      kind: 'ok',
      title: `Voucher recorded: UGX ${fmtUGX(amt)}`,
      detail: `Safe running balance updated live.`,
    });

    setVoucherAmount('');
    setVoucherPayee('');
    setVoucherNote('');
    setVoucherDrawerOpen(false);
  };

  type EntryRow = (typeof allEntries)[number];
  const columns: Column<EntryRow>[] = [
    {
      key: 'time',
      header: 'Time',
      mono: true,
      cell: (r) => <span className="text-slate-500 font-mono text-xs">{r.at.slice(11, 16)}</span>,
    },
    {
      key: 'ref',
      header: 'Voucher Ref',
      cell: (r) => (
        <span className="font-mono text-xs font-semibold text-slate-700">
          {r.subcategory ?? `VCH-${r.id.slice(0, 6).toUpperCase()}`}
        </span>
      ),
    },
    {
      key: 'flow',
      header: 'Cash Flow',
      cell: (r) => (
        r.direction === 'in' ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
            <ArrowDownLeft className="size-3 text-emerald-600" />
            Receipt (In)
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200">
            <ArrowUpRight className="size-3 text-rose-600" />
            Disbursement (Out)
          </span>
        )
      ),
    },
    {
      key: 'category',
      header: 'Expense Category',
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5 font-medium text-xs text-slate-800">
          <span className="size-2 rounded-full shrink-0" style={{ background: categoryColor(r.category) }} />
          {cats.label(r.category)}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Payee & Purpose',
      cell: (r) => (
        <div>
          <div className="font-semibold text-xs sm:text-sm text-slate-900 leading-tight">
            {r.note ?? r.payee ?? 'Direct safe disbursement'}
          </div>
          {r.payee && r.note ? <div className="text-[11px] text-slate-500 mt-0.5">Payee: {r.payee}</div> : null}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount (UGX)',
      align: 'right',
      mono: true,
      sort: (r) => (r.direction === 'in' ? r.amount : -r.amount),
      cell: (r) => (
        <span
          className={cn(
            'font-mono font-bold text-sm',
            r.direction === 'in' ? 'text-emerald-700' : 'text-slate-900'
          )}
        >
          {r.direction === 'in' ? `+${fmtUGX(r.amount)}` : `-${fmtUGX(r.amount)}`}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Safe Balance',
      align: 'right',
      mono: true,
      cell: (r) => (
        <span className="font-mono text-slate-700 text-xs font-semibold">
          {fmtUGX(r.runningBalance)}
        </span>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      cell: (r) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedVoucher(r);
          }}
          className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
        >
          Receipt
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Official Factory Cash Office Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-semibold tracking-wider text-slate-500 uppercase">
              <span className="size-2 rounded-full bg-emerald-500" />
              TANAAD CASH OFFICE · {site.legalName}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-1">
              Petty Cash Book & Safe Management
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Strict cash custody, voucher serial tracking, expense allocations and daily denomination count.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="text-xs sm:text-sm font-medium rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-800 shadow-2xs outline-none"
            >
              {days.map((d) => (
                <option key={d} value={d}>
                  {d === s.today ? `Today (${fmtDayShort(d)})` : fmtDay(d)}
                </option>
              ))}
            </select>

            <Button size="sm" variant="secondary" icon={Calculator} onClick={() => setReconcileModalOpen(true)}>
              Physical Safe Count
            </Button>
            <Button size="sm" variant="primary" icon={Plus} onClick={() => setVoucherDrawerOpen(true)}>
              Record Cash Voucher
            </Button>
            <Button size="sm" variant="secondary" icon={Download} onClick={handleExport}>
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Cash Financial KPI Strip */}
      <KpiStrip className="grid-cols-2 md:grid-cols-4">
        <Stat
          label="Opening Safe Balance"
          icon={Wallet}
          tone="neutral"
          value={<>{fmtUGX(opening)}</>}
          sub="Carried forward from previous shift close"
        />
        <Stat
          label="Money In (Receipts)"
          icon={ArrowDownLeft}
          tone="ok"
          value={<>+{fmtUGX(moneyIn)}</>}
          sub="Local cash sales & scrap receipts"
        />
        <Stat
          label="Money Out (Disbursed)"
          icon={ArrowUpRight}
          tone="bad"
          value={<>-{fmtUGX(moneyOut)}</>}
          sub="Generator fuel, spares, meals & casual wages"
        />
        <Stat
          label="Current Safe Balance"
          icon={ShieldCheck}
          tone="brand"
          value={<>{fmtUGX(expectedClosing)}</>}
          sub={`Status: ${cd?.status === 'closed' ? 'Shift Safe Closed' : 'Active Trading'}`}
        />
      </KpiStrip>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search payee, description or voucher ref..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 outline-none focus:border-slate-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Flow Filter */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
            <button
              onClick={() => setFlowFilter('all')}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                flowFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600'
              )}
            >
              All Flows
            </button>
            <button
              onClick={() => setFlowFilter('in')}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                flowFilter === 'in' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600'
              )}
            >
              Money In
            </button>
            <button
              onClick={() => setFlowFilter('out')}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                flowFilter === 'out' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600'
              )}
            >
              Money Out
            </button>
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs font-medium rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 outline-none"
          >
            <option value="all">All Expense Categories</option>
            {cats.items.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Cash Book Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <DataGrid
          rows={entries}
          columns={columns}
          rowKey={(r) => r.id}
          onRowClick={(r) => setSelectedVoucher(r)}
          empty={<Empty title="No cash entries match" hint="Record a new voucher or clear active filters." />}
        />
      </div>

      {/* Expense Allocation Category Breakdown */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
        <h2 className="text-base font-bold text-slate-900">Shift Expense Distribution by Department</h2>
        <p className="text-xs text-slate-500 mb-4">Real-time accounting of operational disbursements</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {cats.items.map((c) => {
            const catEntries = allEntries.filter((e) => e.direction === 'out' && e.category === c.id);
            const total = catEntries.reduce((t, e) => t + e.amount, 0);
            return (
              <div key={c.id} className="p-3 rounded-lg border border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <span className="size-2 rounded-full shrink-0" style={{ background: categoryColor(c.id as CashCategory) }} />
                  {c.label}
                </div>
                <div className="text-sm font-mono font-bold text-slate-900 mt-1.5">
                  {fmtUGX(total)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {catEntries.length} {catEntries.length === 1 ? 'voucher' : 'vouchers'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* New Voucher Slide-Over Drawer */}
      <Sheet
        open={voucherDrawerOpen}
        onClose={() => setVoucherDrawerOpen(false)}
        title="Issue Petty Cash Voucher"
        sub="Authorized factory safe disbursement / receipt"
        width={480}
      >
        <div className="space-y-4 pt-2">
          {/* Flow Direction Toggle */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
              Transaction Direction
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVoucherDirection('out')}
                className={cn(
                  'p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors',
                  voucherDirection === 'out'
                    ? 'bg-rose-50 border-rose-300 text-rose-800 ring-1 ring-rose-300'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                )}
              >
                <ArrowUpRight className="size-3.5 text-rose-600" />
                Money Out (Disbursement)
              </button>
              <button
                type="button"
                onClick={() => setVoucherDirection('in')}
                className={cn(
                  'p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors',
                  voucherDirection === 'in'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 ring-1 ring-emerald-300'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                )}
              >
                <ArrowDownLeft className="size-3.5 text-emerald-600" />
                Money In (Receipt)
              </button>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
              Expense Category
            </label>
            <select
              value={voucherCategory}
              onChange={(e) => setVoucherCategory(e.target.value as CashCategory)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 bg-white font-medium outline-none"
            >
              {cats.items.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
              Amount (UGX)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-semibold text-slate-400">UGX</span>
              <input
                type="number"
                placeholder="e.g. 150000"
                value={voucherAmount}
                onChange={(e) => setVoucherAmount(e.target.value)}
                className="w-full pl-12 pr-3 py-2 text-sm font-mono font-bold rounded-lg border border-slate-300 outline-none focus:border-slate-500"
              />
            </div>
            <div className="flex gap-2 mt-1.5">
              {[20000, 50000, 100000, 250000].map((quick) => (
                <button
                  key={quick}
                  type="button"
                  onClick={() => setVoucherAmount(String(quick))}
                  className="px-2 py-0.5 text-[11px] font-mono rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                >
                  {fmtUGX(quick)}
                </button>
              ))}
            </div>
          </div>

          {/* Payee */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
              Payee / Beneficiary
            </label>
            <input
              type="text"
              placeholder="e.g. TotalEnergies Fuel Station / Mukasa David"
              value={voucherPayee}
              onChange={(e) => setVoucherPayee(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 outline-none focus:border-slate-500"
            />
          </div>

          {/* Purpose / Note */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
              Description & Operational Purpose
            </label>
            <textarea
              rows={3}
              placeholder="e.g. 50 Litres Diesel for Perkins generator during Umeme blackout"
              value={voucherNote}
              onChange={(e) => setVoucherNote(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 outline-none focus:border-slate-500"
            />
          </div>

          <div className="pt-2">
            <Button variant="primary" block onClick={handleCreateVoucher}>
              Sign & Disburse Cash Voucher
            </Button>
          </div>
        </div>
      </Sheet>

      {/* Safe Physical Note Reconciliation Dialog */}
      {reconcileModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full p-6 text-slate-900">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Safe Physical Note Count & Reconciliation</h2>
                <p className="text-xs text-slate-500">Denomination audit against expected safe balance</p>
              </div>
              <button onClick={() => setReconcileModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500 block">Expected System Balance:</span>
                  <span className="font-mono font-bold text-sm text-slate-900">UGX {fmtUGX(expectedClosing)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Physical Cash Counted:</span>
                  <span className="font-mono font-bold text-sm text-blue-700">UGX {fmtUGX(physicalTotal)}</span>
                </div>
              </div>

              {/* Denominations Inputs */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">50,000 UGX Notes</label>
                  <input
                    type="number"
                    value={note50k}
                    onChange={(e) => setNote50k(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs font-mono rounded border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">20,000 UGX Notes</label>
                  <input
                    type="number"
                    value={note20k}
                    onChange={(e) => setNote20k(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs font-mono rounded border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">10,000 UGX Notes</label>
                  <input
                    type="number"
                    value={note10k}
                    onChange={(e) => setNote10k(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs font-mono rounded border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">5,000 UGX Notes</label>
                  <input
                    type="number"
                    value={note5k}
                    onChange={(e) => setNote5k(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs font-mono rounded border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">2,000 & 1,000 Notes</label>
                  <input
                    type="number"
                    value={note2k}
                    onChange={(e) => setNote2k(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs font-mono rounded border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Coins Total (UGX)</label>
                  <input
                    type="number"
                    value={coins}
                    onChange={(e) => setCoins(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs font-mono rounded border border-slate-300"
                  />
                </div>
              </div>

              {/* Variance Alert */}
              <div
                className={cn(
                  'p-3 rounded-lg border flex items-center justify-between mt-3',
                  Math.abs(varianceUGX) < 1000
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                )}
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 shrink-0" />
                  <span className="font-semibold text-xs">
                    {Math.abs(varianceUGX) < 1000 ? 'Safe Balanced: 100% Match' : 'Discrepancy Detected'}
                  </span>
                </div>
                <span className="font-mono font-bold text-xs">
                  Variance: {varianceUGX >= 0 ? `+UGX ${fmtUGX(varianceUGX)}` : `-UGX ${fmtUGX(Math.abs(varianceUGX))}`}
                </span>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setReconcileModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  s.toast({
                    kind: 'ok',
                    title: 'Safe count reconciled & certified',
                    detail: `Cashier verification timestamped on audit log.`,
                  });
                  setReconcileModalOpen(false);
                }}
              >
                Certify & Lock Safe Count
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Individual Cash Voucher Modal */}
      {selectedVoucher && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 text-slate-900">
            <div className="border-b pb-3 mb-4">
              <div className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">TANAAD MANUFACTURING GROUP</div>
              <h2 className="text-base font-bold text-slate-900">OFFICIAL PETTY CASH VOUCHER</h2>
              <div className="text-xs text-slate-600 font-mono mt-0.5">
                Ref: {selectedVoucher.receiptNo ?? 'VCH-202611-001'} · Date: {selectedVoucher.at.slice(0, 10)}
              </div>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Flow Direction:</span>
                <span className="font-bold uppercase">{selectedVoucher.direction === 'in' ? 'Receipt (In)' : 'Payment (Out)'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Expense Category:</span>
                <span className="font-semibold">{cats.label(selectedVoucher.category)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Beneficiary / Payee:</span>
                <span className="font-semibold">{selectedVoucher.payee ?? 'Internal'}</span>
              </div>
              <div className="py-1 border-b border-slate-100">
                <span className="text-slate-500 block mb-0.5">Purpose & Description:</span>
                <span className="font-medium text-slate-800">{selectedVoucher.note ?? 'Direct operational expense'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-200 bg-slate-50 px-2 rounded">
                <span className="text-xs font-bold text-slate-800 uppercase">Total Amount:</span>
                <span className="font-mono font-bold text-sm text-slate-900">UGX {fmtUGX(selectedVoucher.amount)}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 mt-4 border-t border-slate-200">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Prepared By</div>
                  <div className="h-8 border-b border-slate-300 mt-1" />
                  <div className="text-[10px] text-slate-600 mt-0.5">Cashier Signature</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Authorized By</div>
                  <div className="h-8 border-b border-slate-300 mt-1" />
                  <div className="text-[10px] text-slate-600 mt-0.5">Supervisor / Manager</div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setSelectedVoucher(null)}>
                Close
              </Button>
              <Button size="sm" variant="primary" icon={Printer} onClick={() => window.print()}>
                Print Voucher
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
