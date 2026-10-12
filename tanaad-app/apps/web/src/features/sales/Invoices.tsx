import { useMemo, useState } from 'react';
import { FileCheck2, MessageCircle, Printer, ShieldAlert } from 'lucide-react';
import { useStore } from '@/data/store';
import { useSite } from '@/app/hooks';
import { orderTotal } from '@/data/selectors';
import { fmtDayShort, fmtMoney, fmtNum } from '@/data/format';
import { messaging } from '@/devices';
import { WhatsAppPreview } from '@/components/WhatsAppPreview';
import { en } from '@/i18n/en';
import {
  ChoiceButton,
  PaperSheet,
  SavedBanner,
  StatusNotice,
  useSavedBanner,
} from '@/components/simple';
import { InvoiceDocument, PrintStyles } from './documents';
import { ageDays, clientOf, dispatchOf, fxLine } from './shared';

export function Invoices() {
  const s = useStore();
  const site = useSite();
  const { saved, showSaved, clearSaved } = useSavedBanner();

  const siteOrders = useMemo(
    () => s.orders.filter((o) => o.siteId === site.id),
    [s.orders, site.id],
  );

  // Orders that passed the gate (dispatched/delivered) and still need an invoice
  const readyToInvoice = useMemo(
    () =>
      siteOrders.filter(
        (o) =>
          (o.status === 'dispatched' || o.status === 'delivered') &&
          !s.invoices.some((i) => i.orderId === o.id),
      ),
    [siteOrders, s.invoices],
  );

  const invoices = useMemo(
    () =>
      s.invoices
        .filter((i) => siteOrders.some((o) => o.id === i.orderId))
        .map((i) => {
          const order = siteOrders.find((x) => x.id === i.orderId)!;
          const client = clientOf(s, order.clientId)!;
          const paid = order.status === 'paid';
          const age = ageDays(s.today, i.issuedAt);
          const received = s.payments
            .filter((p) => p.invoiceId === i.id)
            .reduce((t, p) => t + p.amount, 0);
          return {
            inv: i,
            order,
            client,
            paid,
            age,
            overdue:
              !paid &&
              client.channel === 'export' &&
              age > client.creditDays,
            balance: paid ? 0 : Math.max(0, i.total - received),
          };
        })
        .sort((a, b) => b.inv.issuedAt.localeCompare(a.inv.issuedAt)),
    [s, siteOrders],
  );

  const [selectedInvId, setSelectedInvId] = useState<string | null>(null);
  const [sendingWa, setSendingWa] = useState(false);
  const [sentWaForId, setSentWaForId] = useState<string | null>(null);

  const activeInv =
    invoices.find((r) => r.inv.id === selectedInvId) ?? invoices[0] ?? null;

  const handleIssueInvoice = (orderId: string) => {
    const inv = s.issueInvoice(orderId);
    setSelectedInvId(inv.id);
    showSaved(`Invoice ${inv.number} created and ready to send`);
  };

  const whatsappLines = useMemo(() => {
    if (!activeInv) return [];
    const dsp = dispatchOf(s, activeInv.order.id);
    return [
      `*${site.legalName}* · Invoice ${activeInv.inv.number}`,
      `Dear ${activeInv.client.contact},`,
      `Here is invoice ${activeInv.inv.number} for order ${activeInv.order.number}.`,
      ...activeInv.order.lines.map(
        (l) =>
          `• ${fmtNum(l.bundles)} bundles ${
            s.products.find((x) => x.id === l.productId)?.internalName ?? ''
          }`,
      ),
      `*Total: ${fmtMoney(activeInv.inv.total, activeInv.inv.currency)}*${
        activeInv.inv.currency === 'USD'
          ? ` (${fxLine(activeInv.order.fxReference)})`
          : ''
      }`,
      dsp ? `Delivery note: ${dsp.deliveryNoteNo}` : '',
      activeInv.client.channel === 'export'
        ? `Payment due within ${activeInv.client.creditDays} days.`
        : 'Paid in cash before delivery. Thank you.',
      '— Tanaad Group',
    ].filter(Boolean);
  }, [activeInv, s.products, site.legalName]);

  const handleSendWhatsApp = async () => {
    if (!activeInv) return;
    setSendingWa(true);
    await messaging.sendWhatsApp(
      activeInv.client.whatsapp,
      whatsappLines.join('\n'),
      `${activeInv.inv.number}.pdf`,
    );
    setSendingWa(false);
    setSentWaForId(activeInv.inv.id);
    showSaved(
      `Invoice ${activeInv.inv.number} sent on WhatsApp to ${activeInv.client.contact} (${activeInv.client.whatsapp})`,
    );
  };

  return (
    <div className="space-y-5">
      <PrintStyles />

      <SavedBanner info={saved} onDismiss={clearSaved} />

      {/* EFRIS notice — Rule 7: Uganda tax invoicing shown as pending, not yet connected */}
      <div className="p-4 rounded-[10px] border border-[var(--line-2)] bg-[var(--surface-2)] flex items-start gap-3">
        <ShieldAlert className="size-5 text-[var(--warn)] shrink-0 mt-0.5" />
        <div className="text-[15px] text-[var(--text-2)]">
          <strong className="text-[var(--text)]">
            Uganda tax invoicing (URA EFRIS): pending, not yet connected.
          </strong>{' '}
          No fiscal document number or QR code is generated until URA EFRIS is connected. Company details not yet supplied show as &ldquo;to be provided by Tanaad&rdquo;.
        </div>
      </div>

      {/* Dispatched orders waiting for an invoice */}
      {readyToInvoice.length > 0 && (
        <PaperSheet
          title="Loaded lorries ready for an invoice"
          subtitle="Tap to create the customer invoice now."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {readyToInvoice.map((o) => {
              const c = clientOf(s, o.clientId);
              return (
                <div
                  key={o.id}
                  className="p-4 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface-2)] flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-[17px] font-bold text-[var(--text)]">
                      {o.number} · {c?.name}
                    </div>
                    <div className="text-[15px] text-[var(--text-2)] num">
                      {fmtMoney(orderTotal(o), o.currency)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleIssueInvoice(o.id)}
                    className="min-h-[48px] px-4 rounded-[8px] bg-[var(--brand)] text-[var(--brand-contrast)] font-semibold text-[15px] flex items-center gap-2 cursor-pointer"
                  >
                    <FileCheck2 className="size-5" />
                    <span>Create invoice</span>
                  </button>
                </div>
              );
            })}
          </div>
        </PaperSheet>
      )}

      <PaperSheet
        title={en.sales.sendInvoiceTitle}
        subtitle={en.sales.sendInvoiceSubtitle}
      >
        {invoices.length === 0 ? (
          <StatusNotice tone="info" title="No invoices issued yet">
            Once a lorry passes the gate, create its invoice above to send it on WhatsApp or print it.
          </StatusNotice>
        ) : (
          <div className="space-y-6">
            {/* Step 1: Pick the invoice */}
            <div className="space-y-2">
              <div className="text-[16px] font-bold text-[var(--text)]">
                1. Pick which invoice to send ({invoices.length})
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {invoices.slice(0, 9).map((r) => (
                  <ChoiceButton
                    key={r.inv.id}
                    selected={activeInv?.inv.id === r.inv.id}
                    onClick={() => setSelectedInvId(r.inv.id)}
                    title={`${r.inv.number} · ${r.client.name}`}
                    subtitle={`${fmtMoney(r.inv.total, r.inv.currency)} · ${
                      r.paid
                        ? 'Paid'
                        : r.overdue
                          ? `Late (${r.age} days)`
                          : `Unpaid (${fmtDayShort(r.inv.issuedAt.slice(0, 10))})`
                    }`}
                    badge={
                      <span className="px-2 py-0.5 rounded-[5px] text-[12px] font-bold bg-[var(--surface-2)] border border-[var(--line)]">
                        {r.paid ? 'Paid' : r.overdue ? 'Late' : 'Unpaid'}
                      </span>
                    }
                  />
                ))}
              </div>
            </div>

            {/* Step 2: Action buttons + WhatsApp preview + Paper Invoice */}
            {activeInv && (
              <div className="space-y-5 pt-4 border-t border-[var(--line)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[18px] font-bold text-[var(--text)]">
                      2. Send or print {activeInv.inv.number} for {activeInv.client.name}
                    </div>
                    <div className="text-[15px] text-[var(--text-2)]">
                      WhatsApp recipient: {activeInv.client.contact} ({activeInv.client.whatsapp})
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="min-h-[52px] px-5 rounded-[8px] border-2 border-[var(--line-2)] bg-[var(--surface)] text-[var(--text)] font-bold text-[16px] flex items-center gap-2 cursor-pointer hover:bg-[var(--surface-2)]"
                    >
                      <Printer className="size-5" />
                      <span>Print / Save PDF</span>
                    </button>
                    <button
                      type="button"
                      disabled={sendingWa}
                      onClick={handleSendWhatsApp}
                      className="min-h-[56px] px-6 rounded-[8px] bg-[var(--ok)] text-white font-bold text-[17px] flex items-center gap-2.5 cursor-pointer disabled:opacity-50"
                    >
                      <MessageCircle className="size-5" />
                      <span>
                        {sendingWa
                          ? 'Sending on WhatsApp…'
                          : sentWaForId === activeInv.inv.id
                            ? 'Sent on WhatsApp · Send again'
                            : en.common.shareWhatsApp}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[1fr_340px] items-start">
                  <InvoiceDocument
                    s={s}
                    site={site}
                    invoice={activeInv.inv}
                    order={activeInv.order}
                    client={activeInv.client}
                    dispatch={dispatchOf(s, activeInv.order.id)}
                  />

                  <div className="space-y-2">
                    <div className="text-[14px] font-bold uppercase tracking-wider text-[var(--text-2)]">
                      WhatsApp message preview
                    </div>
                    <WhatsAppPreview
                      to={`${activeInv.client.name} · ${activeInv.client.whatsapp}`}
                      lines={whatsappLines}
                      attachment={`${activeInv.inv.number}.pdf`}
                      sent={sentWaForId === activeInv.inv.id}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </PaperSheet>
    </div>
  );
}
