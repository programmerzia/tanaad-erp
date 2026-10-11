import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import type { Client, Currency, Order, OrderStatus, Product, Site } from '@tanaad/domain';
import type { AppState } from '@/data/store';
import { useStore } from '@/data/store';
import { addDays } from '@/data/selectors';
import { compact, fmtDayShort, fmtMoney, fmtNum } from '@/data/format';
import { Avatar, Badge, Button, cn, type Tone } from '@/components/ui';
import { WhatsAppPreview } from '@/components/WhatsAppPreview';
import { messaging } from '@/devices';

/* ───────────────────────────── Order status and pipeline stages ───────────────────────────── */
export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone; next: string }> = {
  draft: { label: 'Draft', tone: 'neutral', next: 'Finish the order' },
  awaiting_cash: { label: 'Awaiting cash', tone: 'warn', next: 'Cashier confirms cash' },
  awaiting_approval: { label: 'Waiting for CEO', tone: 'warn', next: 'CEO approves credit' },
  approved: { label: 'Ready to pick', tone: 'accent', next: 'Storekeeper picks' },
  picking: { label: 'Picking', tone: 'accent', next: 'Load and weigh out' },
  dispatched: { label: 'Dispatched', tone: 'info', next: 'Issue invoice' },
  delivered: { label: 'Delivered', tone: 'info', next: 'Issue invoice' },
  invoiced: { label: 'Invoiced, unpaid', tone: 'neutral', next: 'Collect payment' },
  paid: { label: 'Paid', tone: 'ok', next: 'Complete' },
  held: { label: 'Held', tone: 'bad', next: 'CEO to release' },
};
export const StatusBadge = ({ status }: { status: OrderStatus }) => <Badge tone={ORDER_STATUS[status].tone} dot>{ORDER_STATUS[status].label}</Badge>;

export type StageKey = 'cash' | 'approval' | 'load' | 'toInvoice' | 'unpaid' | 'paid' | 'held';
/** The order pipeline, in the order work flows. Each stage keeps one series colour everywhere it is drawn. */
export const STAGES: { key: StageKey; label: string; short: string; tab: string; statuses: OrderStatus[]; color: string }[] = [
  { key: 'cash', label: 'Awaiting cash', short: 'Awaiting cash', tab: 'Awaiting cash', statuses: ['awaiting_cash'], color: 'var(--series-4)' },
  { key: 'approval', label: 'Awaiting CEO approval', short: 'CEO approval', tab: 'Awaiting approval', statuses: ['awaiting_approval'], color: 'var(--series-7)' },
  { key: 'load', label: 'Ready to load', short: 'To load', tab: 'To load', statuses: ['approved', 'picking'], color: 'var(--series-1)' },
  { key: 'toInvoice', label: 'Dispatched, not invoiced', short: 'To invoice', tab: 'To invoice', statuses: ['dispatched', 'delivered'], color: 'var(--series-5)' },
  { key: 'unpaid', label: 'Invoiced, unpaid', short: 'Unpaid', tab: 'Unpaid', statuses: ['invoiced'], color: 'var(--series-2)' },
  { key: 'paid', label: 'Paid', short: 'Paid', tab: 'Paid', statuses: ['paid'], color: 'var(--series-3)' },
  { key: 'held', label: 'Held', short: 'Held', tab: 'Held', statuses: ['held', 'draft'], color: 'var(--text-4)' },
];
export const stageOf = (status: OrderStatus) => STAGES.find((x) => x.statuses.includes(status))!;
/** How far along the seven-step shipment track an order is. */
export const STATUS_RANK: Record<OrderStatus, number> = { draft: 0, awaiting_cash: 0, awaiting_approval: 0, held: 0, approved: 1, picking: 2, dispatched: 3, delivered: 4, invoiced: 5, paid: 6 };
export const CASH_ROLES = ['cashier', 'site_manager', 'ceo', 'group_admin'];

/* ───────────────────────────── Lookups ───────────────────────────── */
export const productOf = (s: AppState, id: string | undefined) => s.products.find((p) => p.id === id);
export const clientOf = (s: AppState, id: string | undefined) => s.clients.find((c) => c.id === id);
export const orderBundles = (o: Order) => o.lines.reduce((t, l) => t + l.bundles, 0);
export const linesSummary = (s: AppState, o: Order) => o.lines.map((l) => `${fmtNum(l.bundles)}× ${productOf(s, l.productId)?.internalName ?? '?'}`).join(' · ');
export const dispatchOf = (s: AppState, orderId: string) => s.dispatches.filter((d) => d.orderId === orderId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
export const invoiceOf = (s: AppState, orderId: string) => s.invoices.find((i) => i.orderId === orderId);
export const ageDays = (today: string, iso: string) => Math.max(0, Math.round((new Date(today + 'T00:00:00Z').getTime() - new Date(iso.slice(0, 10) + 'T00:00:00Z').getTime()) / 86_400_000));
export const fxLine = (fx: number) => `1 USD = UGX ${fmtNum(fx)}`;
export const termsOf = (c: Pick<Client, 'channel' | 'creditDays'>) => (c.channel === 'export' ? `${c.creditDays} days credit` : 'Cash before delivery');
export const marketOf = (c: Pick<Client, 'channel' | 'country'>) => `${c.channel === 'export' ? 'Export' : 'Local'} · ${c.country}`;
export const plural = (n: number, one: string, many = `${one}s`) => `${fmtNum(n)} ${n === 1 ? one : many}`;
/** Case-insensitive match of every search word against the given fields. */
export const matches = (q: string, ...fields: (string | undefined)[]) => { const hay = fields.filter(Boolean).join(' ').toLowerCase(); return q.trim().toLowerCase().split(/\s+/).every((w) => hay.includes(w)); };

/** Clients relevant to a site: anyone with an order here; the Mats site (the group's sales desk) also sees clients with no orders yet. */
export const clientsForSite = (s: AppState, siteId: Site['id']) => s.clients.filter((c) => { const mine = s.orders.filter((o) => o.clientId === c.id); return mine.some((o) => o.siteId === siteId) || (siteId === 'mats' && mine.length === 0); });

/** List price for a client: price list by channel, converted to the client's currency at the daily reference. Returns per-piece and per-bundle. */
export function priceFor(product: Product, client: Pick<Client, 'channel' | 'currencyPref'>, fx: number) {
  const pr = product.prices.find((x) => x.channel === client.channel) ?? product.prices[0];
  if (!pr) return { unit: 0, perBundle: 0, currency: client.currencyPref as Currency, listed: false, converted: false };
  const unit = pr.currency === client.currencyPref ? pr.amount : pr.currency === 'USD' ? pr.amount * fx : pr.amount / fx;
  const rounded = client.currencyPref === 'USD' ? Math.round(unit * 100) / 100 : Math.round(unit);
  return { unit: rounded, perBundle: rounded * product.bundlePieces, currency: client.currencyPref, listed: true, converted: pr.currency !== client.currencyPref };
}

/* ───────────────────────────── Money in two currencies ───────────────────────────── */
export type ByCur = Record<Currency, number>;
export const sumByCur = <T,>(rows: T[], amount: (r: T) => number, cur: (r: T) => Currency): ByCur => rows.reduce<ByCur>((t, r) => { t[cur(r)] += amount(r); return t; }, { UGX: 0, USD: 0 });
/** Headline form for KPI cards: whole dollars, compact shillings. Full precision stays in tables and documents. */
export const shortMoney = (n: number, c: Currency) => (c === 'USD' ? `$${fmtNum(Math.round(n))}` : `UGX ${compact(n)}`);
/** Which currency leads a KPI: the one that has money in it, the site's own when both or neither do. */
export const leadCur = (by: ByCur, fallback: Currency): Currency => (by.USD > 0 && by.UGX <= 0 ? 'USD' : by.UGX > 0 && by.USD <= 0 ? 'UGX' : fallback);
export const otherCur = (c: Currency): Currency => (c === 'USD' ? 'UGX' : 'USD');
/** "UGX 4.20M" style tail for the second currency, empty when there is none. */
export const alsoMoney = (by: ByCur, lead: Currency) => (by[otherCur(lead)] > 0 ? `+ ${shortMoney(by[otherCur(lead)], otherCur(lead))}` : '');
export const toUsd = (n: number, c: Currency, fx: number) => (c === 'USD' ? n : n / fx);
export const shortBoth = (by: ByCur) => (['USD', 'UGX'] as Currency[]).filter((c) => by[c] > 0).map((c) => shortMoney(by[c], c)).join(' + ') || '—';
export const bothMoney = (by: ByCur) => (['USD', 'UGX'] as Currency[]).filter((c) => by[c] > 0).map((c) => fmtMoney(by[c], c)).join(' + ') || '—';

/* ───────────────────────────── Fiscalisation (Uganda EFRIS) ───────────────────────────── */
/** Company facts the client has not supplied yet (TIN, address, payment details) print as this, never as an invented value. */
export const TO_BE_PROVIDED = 'to be provided by Tanaad';
/**
 * Ugandan manufacturers issue fiscal invoices through URA's EFRIS. The integration is not connected yet, so no
 * Fiscal Document Number or verification code exists for any invoice: every screen says so instead of showing a made-up one.
 */
export const EFRIS_PENDING = 'Pending · EFRIS not yet connected';
/** Connected but no number stored on the invoice yet: still nothing to show, and still nothing made up. */
export const EFRIS_AWAITING = 'Awaiting number from URA';
export const efrisText = (connected: boolean | undefined) => (connected ? EFRIS_AWAITING : EFRIS_PENDING);
export const EfrisBadge = ({ connected }: { connected?: boolean }) => <Badge tone={connected ? 'info' : 'neutral'} dot>{connected ? 'Awaiting URA' : 'Pending'}</Badge>;
/** A company-profile field as it prints: the value when filled, the placeholder when blank. */
export const orTbp = (v: string | undefined) => (v && v.trim() ? v.trim() : TO_BE_PROVIDED);

/* ───────────────────────────── Weeks (for trends) ───────────────────────────── */
/** The last n seven-day windows ending today, oldest first. The last one is the week in progress. */
export function lastWeeks(today: string, n: number) {
  return Array.from({ length: n }, (_, i) => { const end = addDays(today, -7 * (n - 1 - i)); const start = addDays(end, -6); return { start, end, label: fmtDayShort(start), partial: i === n - 1 }; });
}
export const weekOf = (weeks: { start: string; end: string }[], iso: string) => { const d = iso.slice(0, 10); return weeks.findIndex((w) => d >= w.start && d <= w.end); };

/* ───────────────────────────── CSV export ───────────────────────────── */
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => { const t = String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const blob = new Blob([[header, ...rows].map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ───────────────────────────── Small layout pieces used by the inspectors ───────────────────────────── */
/** Numbered section heading inside a form sheet. */
export function StepTitle({ n, children, hint }: { n: number; children: ReactNode; hint?: ReactNode }) {
  return <div className="flex items-center gap-2 mb-2"><span className="size-5 rounded-md grid place-items-center t-xs font-semibold num bg-[var(--surface-3)] text-[var(--text-2)]">{n}</span><h3 className="t-label">{children}</h3>{hint && <span className="t-xs text-[var(--text-3)] ml-auto">{hint}</span>}</div>;
}
/** Label left, value right, one line. For facts in an inspector panel. */
export function Fact({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return <div className={cn('flex items-center justify-between gap-4 min-h-[30px] touch:min-h-[40px] px-[var(--pad)] border-b border-[var(--line)] last:border-b-0 t-base', className)}><span className="text-[var(--text-2)] shrink-0">{label}</span><span className="min-w-0 text-right truncate">{children}</span></div>;
}
/** A row of small labelled figures that share one surface. */
export function FigureRow({ items, className }: { items: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'bad' | 'warn' | 'ok' }[]; className?: string }) {
  return (
    <div className={cn('surface grid divide-x divide-[var(--line)]', className)} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it) => (
        <div key={it.label} className="px-3 py-2 min-w-0">
          <div className="t-xs font-medium text-[var(--text-3)] truncate">{it.label}</div>
          <div className={cn('num t-lg font-semibold truncate', it.tone === 'bad' && 'text-[var(--bad)]', it.tone === 'warn' && 'text-[var(--warn)]', it.tone === 'ok' && 'text-[var(--ok)]')}>{it.value}</div>
          {it.sub && <div className="t-xs text-[var(--text-3)] truncate">{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}
/** Avatar and name on one line for a table cell; the name truncates with an ellipsis at `width`. */
export const ClientCell = ({ name, width = 220 }: { name: string; width?: number }) => <span className="flex items-center gap-2 min-w-0" style={{ maxWidth: width }} title={name}><Avatar name={name} size={22} /><span className="font-medium truncate">{name}</span></span>;
/** Totals in each currency, one per line, for a table footer cell. */
export const StackedMoney = ({ by }: { by: ByCur }) => { const cs = (['USD', 'UGX'] as Currency[]).filter((c) => by[c] > 0); return cs.length ? <>{cs.map((c) => <span key={c} className="block num whitespace-nowrap leading-tight">{fmtMoney(by[c], c)}</span>)}</> : <>—</>; };
/** Product colour swatch. */
export const Swatch = ({ colour, className }: { colour?: string; className?: string }) => <span className={cn('size-2.5 rounded-[3px] shrink-0 inline-block', className)} style={{ background: colour ?? 'var(--text-4)' }} />;

/**
 * Esc inside an open Combobox list closes just that list instead of the whole Sheet around it.
 * Render it as a sibling before the <Sheet> so its listener is registered first.
 */
export function ComboEscGuard() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const el = document.activeElement as HTMLElement | null;
      if (el?.getAttribute('role') !== 'combobox' || el.getAttribute('aria-expanded') !== 'true') return;
      e.stopImmediatePropagation(); e.preventDefault();
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, []);
  return null;
}

/* ───────────────────────────── WhatsApp share panel ───────────────────────────── */
export function WhatsAppSend({ client, lines, attachment, successTitle, onBack, backLabel }: { client: Client; lines: string[]; attachment?: string; successTitle: string; onBack?: () => void; backLabel?: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle'); const toast = useStore((s) => s.toast);
  const send = async () => { setState('sending'); await messaging.sendWhatsApp(client.whatsapp, lines.join('\n'), attachment); setState('sent'); toast({ kind: 'ok', title: successTitle, detail: `Sent to ${client.contact} on WhatsApp ${client.whatsapp}` }); };
  return (
    <div className="flex flex-col items-start gap-3">
      {onBack && <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={onBack}>{backLabel ?? 'Back'}</Button>}
      <WhatsAppPreview to={`${client.name} · ${client.whatsapp}`} lines={lines} attachment={attachment} sent={state === 'sent'} />
      <div className="flex items-center gap-2 flex-wrap">
        {state === 'sent' ? <Badge tone="ok" dot>Delivered · two ticks</Badge> : <Button variant="ok" icon={Send} onClick={send} disabled={state === 'sending'} hotkey="mod+enter" hotkeyLabel="Send on WhatsApp">{state === 'sending' ? 'Sending…' : 'Send on WhatsApp'}</Button>}
        <span className="t-sm text-[var(--text-3)]">to {client.contact}</span>
      </div>
      <div className="t-xs text-[var(--text-3)] max-w-[380px]">Simulated in the demo. Production sends through the WhatsApp Business API with the PDF attached.</div>
    </div>
  );
}
