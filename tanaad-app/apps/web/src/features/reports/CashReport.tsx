import { useMemo, useState } from 'react';
import { Wallet, Download, Printer, ArrowDownLeft, ArrowUpRight, ShieldCheck } from 'lucide-react';
import type { CashCategory } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite } from '@/app/hooks';
import { cashDayFor, cashSummary, lastWorkingDays } from '@/data/selectors';
import { fmtDay, fmtDayShort, fmtUGX } from '@/data/format';
import { Badge, Button, DataGrid, Empty, KpiStrip, Panel, Stat, type Column } from '@/components/ui';
import { categoryColor, downloadCsv, useExpenseCategories } from '@/features/cash/categories';

export function CashReport() {
  const s = useStore();
  const site = useSite();
  const [day, setDay] = useState(s.today);

  const days = useMemo(() => lastWorkingDays(site.id, s.today, 7), [site.id, s.today]);
  const cd = useMemo(() => cashDayFor(s, site.id, day), [s, site.id, day]);
  const sum = useMemo(() => (cd ? cashSummary(s, cd.id) : null), [s, cd]);
  const cats = useExpenseCategories();

  const opening = cd?.opening ?? 0;
  const moneyIn = (sum?.sales ?? 0) + (sum?.receipts ?? 0);
  const moneyOut = (sum?.expenses ?? 0) + (sum?.wages ?? 0);
  const expectedClosing = sum?.expectedClosing ?? opening;
  const isClosed = cd?.status === 'closed';
  const variance = sum?.variance;

  const entries = useMemo(() => {
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

  const handleExport = () => {
    const headers = ['Time', 'Flow', 'Category', 'Description / Payee', 'Amount (UGX)', 'Running Balance (UGX)'];
    const exportRows = entries.map((e) => [
      e.at.slice(11, 16),
      e.direction === 'in' ? 'Money In' : 'Money Out',
      cats.label(e.category),
      e.note ?? e.payee ?? '—',
      e.amount,
      e.runningBalance,
    ]);
    downloadCsv(`cash-report-${site.id}-${day}`, headers, exportRows);
    s.toast({ kind: 'ok', title: 'Cash report exported as CSV' });
  };

  type EntryRow = (typeof entries)[number];
  const columns: Column<EntryRow>[] = [
    {
      key: 'time',
      header: 'Time',
      mono: true,
      cell: (r) => <span className="text-[var(--text-3)]">{r.at.slice(11, 16)}</span>,
    },
    {
      key: 'flow',
      header: 'Type',
      cell: (r) => (
        r.direction === 'in' ? (
          <Badge tone="ok" dot>Money In (Receipt)</Badge>
        ) : (
          <Badge tone="warn" dot>Money Out (Expense)</Badge>
        )
      ),
    },
    {
      key: 'category',
      header: 'Category',
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5 font-medium">
          <span className="size-2 rounded-full" style={{ background: categoryColor(r.category) }} />
          {cats.label(r.category)}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Payee / Description',
      cell: (r) => (
        <div>
          <span className="font-semibold text-[14px]">{r.note ?? r.payee ?? 'Direct cash entry'}</span>
          {r.payee && r.note ? <span className="t-xs text-[var(--text-3)] block">{r.payee}</span> : null}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      mono: true,
      sort: (r) => (r.direction === 'in' ? r.amount : -r.amount),
      cell: (r) => (
        <span className={r.direction === 'in' ? 'text-[var(--ok)] font-bold text-[15px]' : 'text-[var(--text)] font-semibold'}>
          {r.direction === 'in' ? `+ ${fmtUGX(r.amount)}` : `- ${fmtUGX(r.amount)}`}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Running Drawer Balance',
      align: 'right',
      mono: true,
      cell: (r) => <span className="font-bold text-[var(--text)]">{fmtUGX(r.runningBalance)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
        <div>
          <div className="flex items-center gap-2 t-xs font-semibold uppercase tracking-wider text-[var(--text-3)]">
            <Wallet className="size-3.5 text-[var(--brand)]" />
            {site.name} · Cash Register & Daily Reconciliation
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)] mt-0.5">
            Daily Cash & Expenses Summary
          </h1>
          <p className="t-sm text-[var(--text-2)] mt-0.5">
            Cash receipts, categorized vouchers, and end-of-day drawer reconciliation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Day Selector */}
          <select
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="ctl text-sm font-medium rounded-lg border border-[var(--line-2)] bg-[var(--surface)] px-3 py-1.5"
          >
            {days.map((d) => (
              <option key={d} value={d}>
                {d === s.today ? `Today (${fmtDayShort(d)})` : fmtDay(d)}
              </option>
            ))}
          </select>

          <Button size="sm" variant="ghost" icon={Printer} onClick={() => window.print()} className="no-print">
            Print
          </Button>
          <Button size="sm" variant="ghost" icon={Download} onClick={handleExport} className="no-print">
            CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <KpiStrip className="grid-cols-2 md:grid-cols-4">
        <Stat
          label="Opening Drawer Balance"
          icon={Wallet}
          tone="neutral"
          value={<>{fmtUGX(opening)}</>}
          sub="Carried forward from last close"
        />
        <Stat
          label="Total Money In"
          icon={ArrowDownLeft}
          tone="ok"
          value={<>{fmtUGX(moneyIn)}</>}
          sub={`${entries.filter((e) => e.direction === 'in').length} sales receipts`}
        />
        <Stat
          label="Total Money Out"
          icon={ArrowUpRight}
          tone="warn"
          value={<>{fmtUGX(moneyOut)}</>}
          sub={`${entries.filter((e) => e.direction === 'out').length} expense vouchers`}
        />
        <Stat
          label="Expected Closing Balance"
          icon={ShieldCheck}
          tone="ok"
          value={<>{fmtUGX(expectedClosing)}</>}
          sub={
            isClosed
              ? variance === 0
                ? 'Balanced & signed by cashier ✓'
                : `Variance: ${fmtUGX(variance ?? 0)}`
              : 'Drawer currently open'
          }
        />
      </KpiStrip>

      {/* Expense by Category */}
      {sum && sum.byCategory.length > 0 && (
        <Panel title="Where Money Went Today" sub="Categorized factory floor expenditures">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
            {sum.byCategory.map((cat) => (
              <div key={cat.category} className="surface p-3 rounded-lg border border-[var(--line)] flex items-center justify-between">
                <div>
                  <div className="t-xs text-[var(--text-3)] font-medium flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: categoryColor(cat.category as CashCategory) }} />
                    {cats.label(cat.category as CashCategory)}
                  </div>
                  <div className="text-base font-bold mt-1 mono">{fmtUGX(cat.amount)}</div>
                </div>
                <span className="t-xs text-[var(--text-3)] mono">
                  {moneyOut > 0 ? Math.round((cat.amount / moneyOut) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Full Transactions Ledger */}
      <Panel
        title={`Cash Ledger Transactions · ${entries.length} Lines`}
        sub={`Opening balance: ${fmtUGX(opening)}`}
      >
        <DataGrid
          rows={entries}
          columns={columns}
          rowKey={(r) => r.id}
          empty={<Empty title="No cash entries" hint="No cash transactions recorded for this day." />}
        />
      </Panel>
    </div>
  );
}
