import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, Camera, CameraOff } from 'lucide-react';
import type { CashEntry } from '@tanaad/domain';
import { Avatar, Badge, Button, Sheet, cn } from '@/components/ui';
import { fmtNum, fmtUGX, fmtUSD } from '@/data/format';
import { categoryColor, timeOf, useExpenseCategories } from './categories';
import { varianceTone } from './CloseDaySheet';

export interface LedgerRow { e: CashEntry; balance: number }
export interface LedgerGroup { key: string; title: string; sign: 1 | -1; total: number; none: string; rows: LedgerRow[] }

const TH = 'px-2.5 h-8 touch:h-10 t-xs font-semibold text-[var(--text-3)] uppercase tracking-[0.04em] whitespace-nowrap border-b border-[var(--line)] bg-[var(--surface-2)]';
/** Columns that only exist when the table is wide enough (container width, so the sidebar and the aside are accounted for). */
const WIDE = 'hidden compact:@2xl:table-cell touch:@4xl:table-cell';
const NARROW = 'compact:@2xl:hidden touch:@4xl:hidden';
const money = (e: CashEntry) => (e.currency === 'USD' ? fmtUSD(e.amount) : fmtNum(e.amount));
type LabelOf = (c: CashEntry['category']) => string;
const title = (e: CashEntry, label: LabelOf) => e.payee ?? e.note ?? label(e.category);

function CategoryTag({ e, categoryLabel }: { e: CashEntry; categoryLabel: LabelOf }) {
  if (e.direction === 'in') return <span className="text-[var(--text-2)]">{categoryLabel(e.category)}</span>;
  return <Badge tone="neutral" className="max-w-full"><span className="size-2 rounded-[2px] shrink-0" style={{ background: categoryColor(e.category) }} />{categoryLabel(e.category)}{e.subcategory && <span className="font-normal text-[var(--text-3)] truncate">· {e.subcategory}</span>}</Badge>;
}

/**
 * The day's page as a ledger: opening balance, then sales, receipts, expenses and wages, each with its subtotal,
 * a running balance down the right-hand side and the expected closing at the foot.
 * Click or Tab into it, ↑/↓ or J/K to move between lines, Enter to open one.
 */
export function LedgerTable({ opening, groups, expected, counted, variance, threshold, machines, onOpen, selectedId, note }: { opening: number; groups: LedgerGroup[]; expected: number; counted?: number; variance?: number; threshold: number; machines: { id: string; code: string }[]; onOpen: (id: string) => void; selectedId?: string | null; /** A last footer line, e.g. the USD totals. */ note?: ReactNode }) {
  const categoryLabel = useExpenseCategories().label;
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const flat = groups.flatMap((g) => g.rows);
  const count = flat.length;
  useEffect(() => { if (active >= count) setActive(count - 1); }, [count, active]);
  const move = (i: number) => { const n = Math.max(0, Math.min(count - 1, i)); setActive(n); wrap.current?.querySelector(`[data-i="${n}"]`)?.scrollIntoView({ block: 'nearest' }); };
  const onKey = (e: KeyboardEvent) => {
    if (!count) return;
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); move(active + 1); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); move(active - 1); }
    else if (e.key === 'Home') { e.preventDefault(); move(0); }
    else if (e.key === 'End') { e.preventDefault(); move(count - 1); }
    else if (e.key === 'Enter' && active >= 0 && flat[active]) { e.preventDefault(); onOpen(flat[active].e.id); }
  };
  const totalIn = groups.filter((g) => g.sign === 1).reduce((t, g) => t + g.total, 0);
  const totalOut = groups.filter((g) => g.sign === -1).reduce((t, g) => t + g.total, 0);
  const vTone = variance === undefined ? 'ok' : varianceTone(variance, threshold);
  let i = -1;

  return (
    <div className="@container">
      <div ref={wrap} tabIndex={0} onKeyDown={onKey} onFocus={() => { if (active < 0 && count) setActive(0); }} className="overflow-x-auto outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus)]" aria-label="Ledger lines">
        <table className="w-full border-collapse t-base">
          <thead>
            <tr>
              <th className={cn(TH, 'text-left w-[58px]')}>Time</th>
              <th className={cn(TH, 'text-left')}>Paid to or from</th>
              <th className={cn(TH, WIDE, 'text-left')}>Category</th>
              <th className={cn(TH, WIDE, 'text-left')}>Machine</th>
              <th className={cn(TH, WIDE, 'text-center w-[36px]')} title="Receipt photo"><Camera className="size-3.5 inline" aria-label="Receipt photo" /></th>
              <th className={cn(TH, WIDE, 'text-right')}>In</th>
              <th className={cn(TH, WIDE, 'text-right')}>Out</th>
              <th className={cn(TH, WIDE, 'text-right')}>Balance</th>
              <th className={cn(TH, NARROW, 'text-right')}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[var(--line)]">
              <td className="px-2.5 h-[var(--row-h)] t-sm text-[var(--text-3)] num">Start</td>
              <td className="px-2.5" colSpan={1}><span className="font-semibold">Opening balance</span><span className={cn(NARROW, 'block t-xs text-[var(--text-3)]')}>Carried forward</span></td>
              <td className={cn(WIDE, 'px-2.5 text-[var(--text-3)] t-sm')} colSpan={5}>Carried forward from the last signed close</td>
              <td className={cn(WIDE, 'px-2.5 text-right num font-semibold')}>{fmtNum(opening)}</td>
              <td className={cn(NARROW, 'px-2.5 text-right num font-semibold')}>{fmtNum(opening)}</td>
            </tr>
            {groups.map((g) => {
              const Icon = g.sign === 1 ? ArrowDownLeft : ArrowUpRight;
              const label = <span className="inline-flex items-center gap-1.5"><Icon className="size-3.5 text-[var(--text-3)]" /><span className="t-label text-[var(--text-2)]">{g.title}</span><span className="num t-xs text-[var(--text-3)]">{g.rows.length ? `${g.rows.length} ${g.rows.length === 1 ? 'line' : 'lines'}` : g.none.toLowerCase()}</span></span>;
              const sub = g.total ? fmtNum(g.total) : <span className="text-[var(--text-4)] font-normal">—</span>;
              return [
                <tr key={g.key} className="bg-[var(--surface-2)] border-b border-[var(--line)]">
                  <td className={cn(WIDE, 'px-2.5 h-8 touch:h-10')} colSpan={5}>{label}</td>
                  <td className={cn(WIDE, 'px-2.5 text-right num font-semibold')}>{g.sign === 1 ? sub : null}</td>
                  <td className={cn(WIDE, 'px-2.5 text-right num font-semibold')}>{g.sign === -1 ? sub : null}</td>
                  <td className={cn(WIDE, 'px-2.5')} />
                  <td className={cn(NARROW, 'px-2.5 h-8 touch:h-10')} colSpan={2}>{label}</td>
                  <td className={cn(NARROW, 'px-2.5 text-right num font-semibold whitespace-nowrap')}>{g.total ? `${g.sign === 1 ? '+' : '−'} ${fmtNum(g.total)}` : sub}</td>
                </tr>,
                ...g.rows.map(({ e, balance }) => {
                  i += 1; const idx = i; const m = e.machineId ? machines.find((x) => x.id === e.machineId) : undefined;
                  return (
                    <tr key={e.id} data-i={idx} onClick={() => { setActive(idx); onOpen(e.id); }}
                      className={cn('border-b border-[var(--line)] cursor-pointer hover:bg-[var(--hover)]', selectedId === e.id && 'bg-[var(--selected)] hover:bg-[var(--selected)]', active === idx && 'shadow-[inset_2px_0_0_var(--focus)] bg-[var(--hover)]')}>
                      <td className="px-2.5 h-[var(--row-h)] py-1 num t-sm text-[var(--text-3)] whitespace-nowrap align-middle">{timeOf(e.at)}</td>
                      <td className="px-2.5 py-1 w-full max-w-0 align-middle">
                        <div className="truncate font-medium">{title(e, categoryLabel)}</div>
                        <div className={cn(NARROW, 'flex items-center gap-1.5 t-xs text-[var(--text-3)] min-w-0')}>
                          {e.direction === 'out' && <span className="size-2 rounded-[2px] shrink-0" style={{ background: categoryColor(e.category) }} />}
                          <span className="truncate">{categoryLabel(e.category)}{e.subcategory ? ` · ${e.subcategory}` : ''}{m ? ` · ${m.code}` : ''}</span>
                          {e.hasReceiptPhoto && <Camera className="size-3 shrink-0" aria-label="Receipt photo attached" />}
                        </div>
                      </td>
                      <td className={cn(WIDE, 'px-2.5 py-1 whitespace-nowrap align-middle')}><CategoryTag e={e} categoryLabel={categoryLabel} /></td>
                      <td className={cn(WIDE, 'px-2.5 py-1 whitespace-nowrap align-middle')}>{m ? <span className="font-medium">{m.code}</span> : <span className="text-[var(--text-4)]">—</span>}</td>
                      <td className={cn(WIDE, 'px-1 py-1 text-center align-middle')}>{e.hasReceiptPhoto ? <Camera className="size-3.5 inline text-[var(--text-2)]" aria-label="Receipt photo attached" /> : <span className="text-[var(--text-4)]" title="No receipt photo">·</span>}</td>
                      <td className={cn(WIDE, 'px-2.5 py-1 text-right num whitespace-nowrap align-middle')}>{e.direction === 'in' ? <span className="font-medium">{money(e)}</span> : null}</td>
                      <td className={cn(WIDE, 'px-2.5 py-1 text-right num whitespace-nowrap align-middle')}>{e.direction === 'out' ? <span className="font-medium">{money(e)}</span> : null}</td>
                      <td className={cn(WIDE, 'px-2.5 py-1 text-right num whitespace-nowrap align-middle text-[var(--text-2)]')}>{fmtNum(balance)}</td>
                      <td className={cn(NARROW, 'px-2.5 py-1 text-right num whitespace-nowrap align-middle')}><div className="font-medium">{e.direction === 'in' ? '+' : '−'} {money(e)}</div><div className="t-xs text-[var(--text-3)]">{fmtNum(balance)}</div></td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[var(--surface-2)]">
              <td className={cn(WIDE, 'px-2.5 py-2 border-t-2 border-[var(--line-2)]')} colSpan={5}><div className="t-lg font-semibold">Expected closing</div><div className="t-sm text-[var(--text-3)]">Opening + sales + receipts − expenses − wages</div></td>
              <td className={cn(WIDE, 'px-2.5 border-t-2 border-[var(--line-2)] text-right num font-semibold')}>{fmtNum(totalIn)}</td>
              <td className={cn(WIDE, 'px-2.5 border-t-2 border-[var(--line-2)] text-right num font-semibold')}>{fmtNum(totalOut)}</td>
              <td className={cn(WIDE, 'px-2.5 border-t-2 border-[var(--line-2)] text-right num t-lg font-bold whitespace-nowrap')}>{fmtNum(expected)}</td>
              <td className={cn(NARROW, 'px-2.5 py-2 border-t-2 border-[var(--line-2)]')} colSpan={2}><div className="t-lg font-semibold">Expected closing</div><div className="t-xs text-[var(--text-3)]">In {fmtNum(totalIn)} · out {fmtNum(totalOut)}</div></td>
              <td className={cn(NARROW, 'px-2.5 border-t-2 border-[var(--line-2)] text-right num t-lg font-bold whitespace-nowrap')}>{fmtNum(expected)}</td>
            </tr>
            {counted !== undefined && variance !== undefined && (
              <tr className="bg-[var(--surface-2)]">
                <td className={cn(WIDE, 'px-2.5 h-9 border-t border-[var(--line)] font-medium')} colSpan={5}>Counted at close</td>
                <td className={cn(WIDE, 'px-2.5 border-t border-[var(--line)] text-right')} colSpan={2}><Badge tone={vTone} dot>{variance === 0 ? 'Balanced' : `${variance > 0 ? 'Over' : 'Short'} ${fmtNum(Math.abs(variance))}`}</Badge></td>
                <td className={cn(WIDE, 'px-2.5 border-t border-[var(--line)] text-right num font-semibold whitespace-nowrap')}>{fmtNum(counted)}</td>
                <td className={cn(NARROW, 'px-2.5 h-9 border-t border-[var(--line)]')} colSpan={2}><span className="font-medium">Counted at close</span> <Badge tone={vTone} dot>{variance === 0 ? 'Balanced' : `${variance > 0 ? 'Over' : 'Short'} ${fmtNum(Math.abs(variance))}`}</Badge></td>
                <td className={cn(NARROW, 'px-2.5 border-t border-[var(--line)] text-right num font-semibold whitespace-nowrap')}>{fmtNum(counted)}</td>
              </tr>
            )}
            {note && <tr className="bg-[var(--surface-2)]"><td colSpan={8} className={cn(WIDE, 'px-2.5 h-8 border-t border-[var(--line)] t-sm text-[var(--text-2)] num')}>{note}</td><td colSpan={3} className={cn(NARROW, 'px-2.5 py-1.5 border-t border-[var(--line)] t-sm text-[var(--text-2)] num')}>{note}</td></tr>}
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** Inspector for one ledger line: everything recorded on the voucher. */
export function LineSheet({ row, onClose, machines, users, fx }: { row?: LedgerRow; onClose: () => void; machines: { id: string; code: string }[]; users: { id: string; name: string; avatarSeed?: string }[]; fx: number }) {
  const e = row?.e; const categoryLabel = useExpenseCategories().label;
  const by = e ? users.find((u) => u.id === e.by) : undefined;
  const m = e?.machineId ? machines.find((x) => x.id === e.machineId) : undefined;
  const Item = ({ label, children }: { label: string; children: ReactNode }) => <div className="flex items-center justify-between gap-4 row-h border-b border-[var(--line)] last:border-b-0"><dt className="t-sm font-medium text-[var(--text-2)] shrink-0">{label}</dt><dd className="t-base text-right min-w-0 truncate">{children}</dd></div>;
  return (
    <Sheet open={!!e} onClose={onClose} title={e ? title(e, categoryLabel) : ''} sub={e ? `${e.direction === 'in' ? 'Money in' : 'Money out'} · ${timeOf(e.at)}` : undefined} width={420} footer={<Button onClick={onClose}>Close</Button>}>
      {e && row && (
        <div className="flex flex-col gap-3">
          <div className="surface-2 px-3.5 py-3 flex items-end justify-between gap-3">
            <div><div className="t-label">{e.direction === 'in' ? 'Received' : 'Paid out'}</div><div className="num t-hero mt-1">{e.currency === 'USD' ? fmtUSD(e.amount) : fmtUGX(e.amount)}</div></div>
            <div className="text-right"><div className="t-label">Balance after</div><div className="num t-lg font-semibold mt-1">{fmtNum(row.balance)}</div></div>
          </div>
          <dl>
            <Item label="Category">{e.direction === 'out' ? <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: categoryColor(e.category) }} />{categoryLabel(e.category)}</span> : categoryLabel(e.category)}</Item>
            {e.subcategory && <Item label="Kind">{e.subcategory}</Item>}
            {m && <Item label="Machine">{m.code}</Item>}
            <Item label={e.direction === 'in' ? 'Received from' : 'Paid to'}>{e.payee ?? '—'}</Item>
            <Item label="Recorded by">{by ? <span className="inline-flex items-center gap-1.5"><Avatar name={by.name} seed={by.avatarSeed} size={20} />{by.name}</span> : e.by}</Item>
            <Item label="Receipt photo">{e.hasReceiptPhoto ? <Badge tone="ok"><Camera className="size-3" />Attached</Badge> : <Badge tone="neutral"><CameraOff className="size-3" />None</Badge>}</Item>
            {e.note && <Item label="Note">{e.note}</Item>}
            {e.currency === 'USD' && <Item label="Reference rate"><span className="num">{fmtNum(e.fxReference || fx)} UGX/USD</span></Item>}
          </dl>
        </div>
      )}
    </Sheet>
  );
}
