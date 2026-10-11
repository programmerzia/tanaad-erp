import type { CSSProperties, ReactNode } from 'react';
import type { Client, CompanyProfile, Dispatch, Invoice, Order, Site } from '@tanaad/domain';
import type { AppState } from '@/data/store';
import { clientBalance, orderTotal } from '@/data/selectors';
import { fmtDateTime, fmtDayLong, fmtDayShort, fmtKg, fmtMoney, fmtNum } from '@/data/format';
import { addDays } from '@/data/selectors';
import { cn } from '@/components/ui';
import { QrCode, Settings } from 'lucide-react';
import { useStore } from '@/data/store';
import { useGo } from '@/app/hooks';
import { efrisText, orTbp, ageDays, fxLine, productOf, termsOf } from './shared';

/* ───────────────────────────── Printing ───────────────────────────── */
/** Scoped print: only the element marked `.print-area` reaches paper. */
export const PRINT_CSS = `@media print { body * { visibility: hidden !important; } .print-area, .print-area * { visibility: visible !important; } .print-area { position: absolute !important; left: 0; top: 0; width: 100%; background: white; color: black; box-shadow: none !important; border: 0 !important; } * { overflow: visible !important; } }`;
export const PrintStyles = () => <style>{PRINT_CSS}</style>;

/**
 * A sheet of paper. Documents stay ink-on-white in both themes, the way a PDF viewer shows them,
 * so the tokens they use are pinned to their light values here.
 */
const PAPER: CSSProperties = {
  ['--surface' as string]: '#ffffff', ['--surface-2' as string]: '#f8f9fa', ['--surface-3' as string]: '#eef0f3',
  ['--text' as string]: '#111c21', ['--text-2' as string]: '#46565e', ['--text-3' as string]: '#7a8890', ['--text-4' as string]: '#a3aeb4',
  ['--line' as string]: '#e1e5e9', ['--line-2' as string]: '#cbd2d8', ['--brand' as string]: '#14333d', ['--brand-contrast' as string]: '#ffffff', ['--accent' as string]: '#d97e22',
  ['--ok' as string]: '#1f8a55', ['--ok-bg' as string]: '#e3f3ea', ['--warn' as string]: '#a96a12', ['--warn-bg' as string]: '#fbf0d9', ['--bad' as string]: '#c2412f', ['--bad-bg' as string]: '#fbe6e2',
  colorScheme: 'light',
};
function Paper({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div style={PAPER} className={cn('print-area @container relative bg-[var(--surface)] text-[var(--text)] border border-[var(--line)] rounded-md shadow-[var(--shadow-raise)] overflow-hidden', className)}>
      <div className="h-1.5 flex"><span className="flex-1 bg-[var(--brand)]" /><span className="w-16 bg-[var(--accent)]" /></div>
      <div className="px-5 py-5 @xl:px-8 @xl:py-7">{children}</div>
    </div>
  );
}

function Letterhead({ site, co, kind, number, lines, stamp }: { site: Site; co?: CompanyProfile; kind: string; number: string; lines: ReactNode[]; stamp?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 pb-4 border-b border-[var(--line-2)]">
      <div className="flex items-start gap-3 min-w-0">
        <span className="size-10 rounded-lg grid place-items-center t-title font-bold shrink-0 bg-[var(--brand)] text-[var(--brand-contrast)]">{site.legalName.slice(0, 1)}</span>
        <div className="min-w-0">
          <div className="t-lg font-bold leading-tight">{site.legalName}</div>
          <div className="t-sm font-medium text-[var(--text-2)]">{site.name}</div>
          <div className="t-xs text-[var(--text-3)]">Address: {orTbp(co?.address)}</div>
          {(co?.phone || co?.email) && <div className="t-xs text-[var(--text-3)]">{[co.phone, co.email].filter(Boolean).join(' · ')}</div>}
          <div className="t-xs text-[var(--text-3)]">TIN: <span className={co?.tin ? 'code' : undefined}>{orTbp(co?.tin)}</span></div>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="t-label">{kind}</div>
        <div className="code t-title leading-tight">{number}</div>
        {lines.map((l, i) => <div key={i} className="t-xs text-[var(--text-2)]">{l}</div>)}
        {stamp && <div className="mt-1.5 flex justify-end">{stamp}</div>}
      </div>
    </div>
  );
}

const Stamp = ({ tone, children }: { tone: 'ok' | 'warn' | 'bad'; children: ReactNode }) => <span className="inline-flex items-center h-[22px] px-2 rounded-[5px] border t-xs font-semibold uppercase tracking-[0.06em] whitespace-nowrap" style={{ color: `var(--${tone})`, borderColor: `var(--${tone})`, background: `var(--${tone}-bg)` }}>{children}</span>;
const Block = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => <div className={cn('min-w-0', className)}><div className="t-label mb-1">{label}</div><div className="t-sm leading-snug">{children}</div></div>;

/** How to pay, from the company profile; each part prints when filled. */
function PaymentDetails({ co }: { co?: CompanyProfile }) {
  return <><div><span className="text-[var(--text-3)]">Bank</span> {orTbp(co?.bankDetails)}</div><div><span className="text-[var(--text-3)]">Mobile Money</span> {orTbp(co?.mobileMoney)}</div></>;
}
/** Which company details are still blank for a site. */
export const missingCompanyFields = (co: CompanyProfile | undefined) => ([['address', 'address'], ['tin', 'TIN'], ['bankDetails', 'bank details'], ['mobileMoney', 'Mobile Money']] as const).filter(([k]) => !co?.[k]?.trim()).map(([, label]) => label);
/** Shown beside a document (never on the paper) while the letterhead still has blanks. */
export function CompanyDetailsHint({ siteId }: { siteId: Site['id'] }) {
  const co = useStore((x) => x.companyProfiles?.[siteId]); const go = useGo(); const missing = missingCompanyFields(co);
  if (!missing.length) return null;
  return <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-2 t-sm text-[var(--text-2)]"><span>Still blank on this document: {missing.join(', ')}.</span><button type="button" onClick={() => go.site('settings')} className="inline-flex items-center gap-1.5 font-medium underline underline-offset-2 hover:text-[var(--text)]"><Settings className="size-3.5" />Complete company details in Settings</button></div>;
}

/** URA EFRIS block. Nothing here is generated locally: the number and the QR only ever come from URA. */
function FiscalBlock({ co }: { co?: CompanyProfile }) {
  const connected = !!co?.efrisConnected; const pending = efrisText(connected);
  const row = 'flex flex-wrap items-baseline justify-between gap-x-4 py-1 border-b border-[var(--line)] last:border-b-0';
  return (
    <div className="mt-4 rounded-md border border-[var(--line-2)] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-1.5 bg-[var(--surface-2)] border-b border-[var(--line-2)]">
        <span className="t-label">Fiscal details · URA EFRIS</span><Stamp tone="warn">{connected ? 'Awaiting URA' : 'Not fiscalised yet'}</Stamp>
      </div>
      <div className="flex items-stretch gap-3 px-3 py-2">
        <div className="flex-1 min-w-0 t-sm">
          <div className={row}><span className="text-[var(--text-2)]">Fiscal Document Number</span><span className="font-medium">{pending}</span></div>
          <div className={row}><span className="text-[var(--text-2)]">Verification code / QR</span><span className="font-medium">{pending}</span></div>
          <div className={row}><span className="text-[var(--text-2)]">Seller TIN</span><span className="font-medium">{orTbp(co?.tin)}</span></div>
        </div>
        <div className="hidden @md:grid w-[76px] shrink-0 place-items-center rounded-md border border-dashed border-[var(--line-2)] text-[var(--text-4)]" aria-label="Verification QR pending"><div className="grid place-items-center gap-0.5"><QrCode className="size-6" /><span className="t-xs">QR pending</span></div></div>
      </div>
      <div className="px-3 py-1.5 border-t border-[var(--line)] t-xs text-[var(--text-3)]">This document becomes a fiscal invoice only when URA EFRIS issues the number and code above. Tax lines follow the EFRIS setup.</div>
    </div>
  );
}
const th = 'py-1.5 t-xs font-semibold uppercase tracking-[0.04em] text-[var(--text-3)]';

/* ───────────────────────────── Invoice ───────────────────────────── */
export function InvoiceDocument({ s, site, invoice, order, client, dispatch, className }: { s: AppState; site: Site; invoice?: Invoice; order: Order; client: Client; dispatch?: Dispatch; className?: string }) {
  const total = invoice?.total ?? orderTotal(order); const cur = invoice?.currency ?? order.currency;
  const co = s.companyProfiles?.[site.id]; const vat = co?.vatRatePct && co.vatRatePct > 0 ? co.vatRatePct : 0;
  const settled = order.status === 'paid';
  const received = s.payments.filter((p) => invoice && p.invoiceId === invoice.id).reduce((t, p) => t + p.amount, 0);
  const paid = settled ? Math.max(received, total) : received; const balance = Math.max(0, total - paid);
  const issued = (invoice?.issuedAt ?? order.createdAt).slice(0, 10); const due = addDays(issued, client.creditDays);
  const age = ageDays(s.today, issued); const overdue = !settled && client.channel === 'export' && age > client.creditDays;
  const other = cur === 'USD' ? fmtMoney(total * order.fxReference, 'UGX') : fmtMoney(total / order.fxReference, 'USD');
  return (
    <Paper className={className}>
      <Letterhead site={site} co={co} kind={invoice ? 'Invoice' : 'Pro-forma'} number={invoice?.number ?? order.number}
        lines={[`Issued ${fmtDayLong(issued)}`, client.channel === 'export' ? `Due ${fmtDayLong(due)}` : 'Due on order']}
        stamp={invoice ? (settled ? <Stamp tone="ok">Paid</Stamp> : overdue ? <Stamp tone="bad">Overdue · {age} days</Stamp> : <Stamp tone="warn">Unpaid · {age} days</Stamp>) : undefined} />

      <div className="grid grid-cols-2 @lg:grid-cols-3 gap-x-5 gap-y-3 py-4">
        <Block label="Bill to" className="col-span-2 @lg:col-span-1"><div className="t-base font-semibold">{client.name}</div><div className="text-[var(--text-2)]">{client.contact} · {client.country}</div><div className="num text-[var(--text-2)]">{client.whatsapp}</div></Block>
        <Block label="Order"><div className="code font-medium">{order.number}</div><div className="text-[var(--text-2)]">{termsOf(client)}</div>{order.cashConfirmedAt && <div className="text-[var(--text-2)]">Cash confirmed {fmtDateTime(order.cashConfirmedAt)}</div>}</Block>
        <Block label="Delivery note">{dispatch ? <><div className="code font-medium">{dispatch.deliveryNoteNo}</div><div className="text-[var(--text-2)]">{dispatch.vehicle} · {dispatch.driver}</div>{dispatch.gateKg !== undefined && <div className="num text-[var(--text-2)]">{fmtKg(dispatch.gateKg)} at the gate</div>}</> : <div className="text-[var(--text-3)]">Not yet dispatched</div>}</Block>
      </div>

      <table className="w-full border-collapse t-sm">
        <thead><tr className="border-y border-[var(--line-2)] bg-[var(--surface-2)]"><th className={cn(th, 'text-left pl-2')}>Product</th><th className={cn(th, 'text-right px-2')}>Bundles</th><th className={cn(th, 'text-right hidden @md:table-cell')}>Pieces</th><th className={cn(th, 'text-right hidden @md:table-cell')}>Per bundle</th><th className={cn(th, 'text-right pr-2')}>Amount</th></tr></thead>
        <tbody>{order.lines.map((l, i) => { const p = productOf(s, l.productId); return (
          <tr key={i} className="border-b border-[var(--line)]">
            <td className="py-1.5 pl-2 font-medium">{p?.commercialName ?? p?.internalName ?? l.productId}{p?.commercialName && p.commercialName !== p.internalName && <span className="block t-xs font-normal text-[var(--text-3)]">{p.internalName} · {p.bundlePieces} per bundle</span>}<span className="block @md:hidden t-xs font-normal text-[var(--text-3)] num">{fmtMoney(l.unitPrice, cur)} a bundle</span></td>
            <td className="py-1.5 px-2 text-right num">{fmtNum(l.bundles)}</td>
            <td className="py-1.5 text-right num hidden @md:table-cell">{fmtNum(l.bundles * (p?.bundlePieces ?? 1))}</td>
            <td className="py-1.5 text-right num hidden @md:table-cell">{fmtMoney(l.unitPrice, cur)}</td>
            <td className="py-1.5 pr-2 text-right num font-medium whitespace-nowrap">{fmtMoney(l.bundles * l.unitPrice, cur)}</td>
          </tr>
        ); })}</tbody>
      </table>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 pt-3">
        <div className="t-xs text-[var(--text-2)] leading-relaxed min-w-[150px] flex-1">
          <div><span className="text-[var(--text-3)]">Currency</span> {cur}</div>
          <div className="num"><span className="text-[var(--text-3)]">Exchange reference</span> {fxLine(order.fxReference)}</div>
          <div className="num"><span className="text-[var(--text-3)]">Equivalent</span> {other}</div>
          {order.notes && <div><span className="text-[var(--text-3)]">Notes</span> {order.notes}</div>}
          <PaymentDetails co={co} />
        </div>
        <div className="w-full @md:w-[250px] ml-auto t-sm">
          <div className="flex justify-between py-1"><span className="text-[var(--text-2)]">Total · {fmtNum(order.lines.reduce((t, l) => t + l.bundles, 0))} bundles</span><span className="num">{fmtMoney(total, cur)}</span></div>
          {vat > 0 && <div className="flex justify-between py-1"><span className="text-[var(--text-2)]">Includes VAT {vat}%</span><span className="num">{fmtMoney((total * vat) / (100 + vat), cur)}</span></div>}
          {paid > 0 && <div className="flex justify-between py-1"><span className="text-[var(--text-2)]">Paid</span><span className="num">− {fmtMoney(paid, cur)}</span></div>}
          <div className="flex justify-between items-baseline mt-1 px-2.5 py-2 rounded-md bg-[var(--brand)] text-[var(--brand-contrast)]"><span className="font-medium">{paid > 0 ? 'Balance due' : 'Total due'}</span><span className="num t-lg font-semibold">{fmtMoney(paid > 0 ? balance : total, cur)}</span></div>
        </div>
      </div>

      {invoice && <FiscalBlock co={co} />}
      <div className="mt-4 pt-3 border-t border-[var(--line)] flex justify-between gap-3 t-xs text-[var(--text-3)]"><span>Thank you for your business.</span><span className="num">{invoice?.number ?? order.number} · page 1 of 1</span></div>
    </Paper>
  );
}

/* ───────────────────────────── Statement of account ───────────────────────────── */
export function StatementDocument({ s, site, client, className }: { s: AppState; site: Site; client: Client; className?: string }) {
  const bal = clientBalance(s, client.id);
  const invoices = s.invoices.filter((i) => s.orders.find((o) => o.id === i.orderId)?.clientId === client.id).sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
  const payments = s.payments.filter((p) => p.clientId === client.id).sort((a, b) => a.at.localeCompare(b.at));
  const paidOn = (inv: Invoice) => payments.filter((p) => p.invoiceId === inv.id).reduce((t, p) => t + p.amount, 0);
  const late = bal.balance > 0 && bal.ageDays > client.creditDays; const co = s.companyProfiles?.[site.id];
  return (
    <Paper className={className}>
      <Letterhead site={site} co={co} kind="Statement of account" number={client.name.split(' ').map((w) => w[0]).join('').slice(0, 4).toUpperCase() + '-' + s.today.slice(2).replace(/-/g, '')}
        lines={[fmtDayLong(s.today), client.channel === 'export' ? `${client.creditDays}-day terms` : 'Cash terms']}
        stamp={bal.balance <= 0 ? <Stamp tone="ok">Settled</Stamp> : late ? <Stamp tone="bad">Past terms</Stamp> : <Stamp tone="warn">Balance open</Stamp>} />

      <div className="grid grid-cols-2 gap-x-5 gap-y-3 py-4">
        <Block label="Account"><div className="t-base font-semibold">{client.name}</div><div className="text-[var(--text-2)]">{client.contact} · {client.country}</div><div className="num text-[var(--text-2)]">{client.whatsapp}</div></Block>
        <div className="self-start t-sm">
          <div className="flex justify-between gap-3 py-0.5"><span className="text-[var(--text-2)]">Invoiced</span><span className="num font-medium whitespace-nowrap">{fmtMoney(bal.invoiced, client.currencyPref)}</span></div>
          <div className="flex justify-between gap-3 py-0.5"><span className="text-[var(--text-2)]">Paid</span><span className="num font-medium whitespace-nowrap">{fmtMoney(bal.paid, client.currencyPref)}</span></div>
          <div className="flex justify-between gap-3 py-0.5 border-t border-[var(--line)] mt-0.5 pt-1"><span className="font-medium">Balance due</span><span className={cn('num font-semibold whitespace-nowrap', late && 'text-[var(--bad)]')}>{fmtMoney(bal.balance, client.currencyPref)}</span></div>
        </div>
      </div>

      <table className="w-full border-collapse t-sm">
        <thead><tr className="border-y border-[var(--line-2)] bg-[var(--surface-2)]"><th className={cn(th, 'text-left pl-2')}>Invoice</th><th className={cn(th, 'text-left')}>Issued</th><th className={cn(th, 'text-right hidden @md:table-cell')}>Total</th><th className={cn(th, 'text-right hidden @md:table-cell')}>Paid</th><th className={cn(th, 'text-right')}>Balance</th><th className={cn(th, 'text-right pr-2')}>Age</th></tr></thead>
        <tbody>
          {invoices.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-[var(--text-3)]">No invoices yet.</td></tr>}
          {invoices.map((i) => { const o = s.orders.find((x) => x.id === i.orderId); const settled = o?.status === 'paid'; const p = paidOn(i); const rem = settled ? 0 : Math.max(0, i.total - p); const age = ageDays(s.today, i.issuedAt); return (
            <tr key={i.id} className="border-b border-[var(--line)]">
              <td className="py-1.5 pl-2 code font-medium">{i.number}</td>
              <td className="py-1.5 num">{fmtDayShort(i.issuedAt.slice(0, 10))}</td>
              <td className="py-1.5 text-right num hidden @md:table-cell">{fmtMoney(i.total, i.currency)}</td>
              <td className="py-1.5 text-right num hidden @md:table-cell">{fmtMoney(settled ? i.total : p, i.currency)}</td>
              <td className={cn('py-1.5 text-right num font-medium', !rem && 'text-[var(--text-3)]')}>{fmtMoney(rem, i.currency)}</td>
              <td className="py-1.5 pr-2 text-right num">{rem ? <span className={cn(age > client.creditDays && 'text-[var(--bad)] font-medium')}>{age} d</span> : <span className="text-[var(--ok)]">Paid</span>}</td>
            </tr>
          ); })}
        </tbody>
      </table>
      <div className="flex justify-end pt-2"><div className="w-full @md:w-[250px] flex justify-between items-baseline px-2.5 py-2 rounded-md bg-[var(--brand)] text-[var(--brand-contrast)] t-sm"><span className="font-medium">Balance due</span><span className="num t-lg font-semibold">{fmtMoney(bal.balance, client.currencyPref)}</span></div></div>

      <div className="mt-4">
        <div className="t-label mb-1">Payments received</div>
        {payments.length === 0 ? <div className="t-sm text-[var(--text-3)]">None yet.</div> : payments.slice(-8).map((p) => <div key={p.id} className="flex justify-between gap-3 py-1 border-b border-[var(--line)] last:border-b-0 t-sm"><span className="text-[var(--text-2)] truncate"><span className="num">{fmtDayShort(p.at.slice(0, 10))}</span> · {p.method} · <span className="code">{p.reference}</span></span><span className="num font-medium shrink-0">{fmtMoney(p.amount, p.currency)}</span></div>)}
      </div>

      <div className="mt-4 t-xs text-[var(--text-2)] leading-relaxed"><div className="t-label mb-0.5">How to pay</div><PaymentDetails co={co} /><div className="text-[var(--text-3)] mt-1">A statement is not a fiscal document; each invoice carries its own EFRIS details.</div></div>
      <div className="mt-4 pt-3 border-t border-[var(--line)] flex justify-between gap-3 t-xs text-[var(--text-3)]"><span>Thank you for your business.</span><span className="num">Statement at {fmtDayShort(s.today)} · page 1 of 1</span></div>
    </Paper>
  );
}
