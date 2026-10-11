import { useRef, useState } from 'react';
import { AlertTriangle, Check, RotateCcw, Trash2 } from 'lucide-react';
import type { Order } from '@tanaad/domain';
import { expectedCargoKg } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite } from '@/app/hooks';
import { clientBalance } from '@/data/selectors';
import { fmtKg, fmtMoney, fmtNum } from '@/data/format';
import { Avatar, Badge, Button, Combobox, Empty, IconButton, Input, Meter, Note, NumberPad, Sheet, cn, useIsTouch } from '@/components/ui';
import { ComboEscGuard, FigureRow, StepTitle, Swatch, clientsForSite, fxLine, marketOf, plural, priceFor, termsOf } from './shared';

interface Line { key: number; productId: string | null; bundles: string; price: string | null }
let seq = 1;
const blank = (): Line => ({ key: seq++, productId: null, bundles: '', price: null });
const GRID = 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_var(--ctl-h)] sm:grid-cols-[minmax(0,1fr)_84px_132px_128px_var(--ctl-h)] gap-x-2 gap-y-1.5 items-center';
const cellBtn = 'ctl w-full rounded-md border border-[var(--line-2)] bg-[var(--surface)] px-2.5 t-base num text-right disabled:bg-[var(--surface-2)] disabled:text-[var(--text-3)]';

/**
 * New order as one sheet: client, an editable table of lines, the check, then create.
 * Keyboard path: pick the client, Enter, pick a product, Enter, type bundles, Enter, next line. Ctrl+Enter creates.
 */
export function NewOrderSheet({ initialClientId, onClose, onCreated }: { initialClientId?: string; onClose: () => void; onCreated: (o: Order) => void }) {
  const s = useStore(); const site = useSite(); const touch = useIsTouch(); const root = useRef<HTMLDivElement>(null);
  const clients = clientsForSite(s, site.id); const products = s.products.filter((p) => p.siteId === site.id && p.prices.length > 0);
  const [clientId, setClientId] = useState<string | null>(initialClientId && clients.some((c) => c.id === initialClientId) ? initialClientId : null);
  const [lines, setLines] = useState<Line[]>(() => [blank()]); const [padFor, setPadFor] = useState<number | null>(null);
  const client = clients.find((c) => c.id === clientId); const cur = client?.currencyPref ?? site.currencyPrimary;
  const listPrice = (p: (typeof products)[number]) => priceFor(p, client ?? { channel: 'local', currencyPref: site.currencyPrimary }, s.fx);

  const rows = lines.map((l) => {
    const p = products.find((x) => x.id === l.productId); const lp = p ? listPrice(p) : undefined;
    const price = l.price !== null ? Number(l.price) || 0 : lp?.perBundle ?? 0; const bundles = Number(l.bundles) || 0;
    return { l, p, lp, price, bundles, below: !!lp && price < lp.perBundle, above: !!lp && price > lp.perBundle, amount: bundles * price };
  });
  const active = rows.filter((r) => r.p && r.bundles > 0);
  const total = active.reduce((t, r) => t + r.amount, 0); const totalBundles = active.reduce((t, r) => t + r.bundles, 0); const pieces = active.reduce((t, r) => t + r.bundles * r.p!.bundlePieces, 0);
  const cargoKg = expectedCargoKg(active.map((r) => ({ bundles: r.bundles, stdBundleWeightKg: r.p!.stdBundleWeightKg }))); const unmeasured = active.some((r) => r.p!.weightStatus === 'to_be_measured');
  const anyBelow = active.some((r) => r.below);
  const bal = client ? clientBalance(s, client.id) : undefined;
  const overLimit = client?.channel === 'export' && bal ? bal.balance + total > client.creditLimit : false;
  const limitPct = client?.channel === 'export' && client.creditLimit && bal ? Math.round(((bal.balance + total) / client.creditLimit) * 100) : 0;

  const focusCell = (kind: 'product' | 'bundles', key: number) => setTimeout(() => root.current?.querySelector<HTMLElement>(`[data-cell="${kind}-${key}"] input, input[data-cell="${kind}-${key}"], button[data-cell="${kind}-${key}"]`)?.focus(), 0);
  const patch = (key: number, p: Partial<Line>) => setLines((ls) => { const next = ls.map((l) => (l.key === key ? { ...l, ...p } : l)); return next[next.length - 1].productId ? [...next, blank()] : next; });
  const remove = (key: number) => setLines((ls) => { const next = ls.filter((l) => l.key !== key); return next.length && !next[next.length - 1].productId ? next : [...next, blank()]; });
  const pickClient = (id: string | null) => { setClientId(id); setLines((ls) => ls.map((l) => ({ ...l, price: null }))); if (id) focusCell('product', lines[0].key); };
  const nextLine = (key: number) => { const i = lines.findIndex((l) => l.key === key); const n = lines[i + 1]; if (n) focusCell('product', n.key); };

  const create = () => {
    if (!client || !active.length) return;
    const o = useStore.getState().createOrder({ siteId: site.id, clientId: client.id, status: client.channel === 'local' ? 'awaiting_cash' : 'awaiting_approval', currency: cur, lines: active.map((r) => ({ productId: r.p!.id, bundles: r.bundles, unitPrice: r.price })), notes: anyBelow ? `Price below list on ${active.filter((r) => r.below).map((r) => r.p!.internalName).join(', ')}; needs approval.` : overLimit ? `Order takes the client to ${limitPct}% of the ${fmtMoney(client.creditLimit, cur)} limit.` : undefined });
    useStore.getState().toast({ kind: 'ok', title: `${o.number} created`, detail: client.channel === 'local' ? 'Waiting for the cashier to confirm cash.' : 'Sent to the CEO credit desk for approval.' });
    onCreated(o);
  };

  return (
    <>
      <ComboEscGuard />
      <Sheet open onClose={onClose} title="New order" sub={`${site.name} · prices from the ${client?.channel ?? 'local'} list in ${cur} · ${fxLine(s.fx)}`} width={760}
        footer={<>
          <div className="mr-auto min-w-0"><div className="t-xs text-[var(--text-3)]">Order total</div><div className="num t-lg font-semibold leading-tight truncate">{fmtMoney(total, cur)}</div></div>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Check} disabled={!client || !active.length} onClick={create} hotkey="mod+enter">Create order</Button>
        </>}>
        <div ref={root} className="flex flex-col gap-5">
          {/* 1. Client */}
          <section>
            <StepTitle n={1} hint={client ? undefined : 'Type a name or country'}>Client</StepTitle>
            {clients.length === 0 ? <Empty title="No clients for this site" hint="Add one on the Clients screen first." /> : (
              <Combobox autoFocus={!client && !touch} clearable placeholder="Search clients…" value={clientId} onChange={pickClient}
                options={clients.map((c) => ({ value: c.id, label: c.name, sub: marketOf(c), words: `${c.contact} ${c.whatsapp}`, left: <Avatar name={c.name} size={20} />, right: <span className="t-xs text-[var(--text-3)] whitespace-nowrap">{c.channel === 'export' ? 'credit via CEO' : 'cash before delivery'}</span> }))} />
            )}
            {client && (
              <div className="mt-2 rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 t-sm">
                  <Badge tone={client.channel === 'export' ? 'accent' : 'neutral'}>{marketOf(client)}</Badge>
                  <span className="text-[var(--text-2)]">{termsOf(client)}</span>
                  <span className="text-[var(--text-2)]">{client.contact} · <span className="num">{client.whatsapp}</span></span>
                  <span className="ml-auto text-[var(--text-3)]">Invoiced in <b className="text-[var(--text)]">{cur}</b></span>
                </div>
                {client.channel === 'export' && bal && <Meter label="Credit after this order" sub={`${fmtMoney(bal.balance, cur)} owed today`} value={bal.balance + total} max={client.creditLimit || 1} tone={limitPct > 100 ? 'bad' : limitPct > 80 ? 'warn' : 'series'} display={<>{fmtMoney(bal.balance + total, cur)}<span className="text-[var(--text-3)] font-normal"> of {fmtMoney(client.creditLimit, cur)} · {limitPct}%</span></>} />}
              </div>
            )}
          </section>

          {/* 2. Lines */}
          <section>
            <StepTitle n={2} hint={<span className="touch:hidden">Enter moves to the next cell</span>}>Line items</StepTitle>
            {products.length === 0 ? <Empty title="No priced products at this site" hint="Add prices in Settings to sell from here." /> : (
              <div className="surface">
                <div className={cn(GRID, 'hidden sm:grid px-3 h-8 border-b border-[var(--line)] bg-[var(--surface-2)] rounded-t-[9px] t-xs font-semibold uppercase tracking-[0.04em] text-[var(--text-3)]')}>
                  <span>Product</span><span className="text-right">Bundles</span><span className="text-right">Per bundle ({cur})</span><span className="text-right">Amount</span><span />
                </div>
                {rows.map((r, i) => (
                  <div key={r.l.key} className={cn('px-3 py-2 border-b border-[var(--line)] last:border-b-0', !r.p && 'bg-[var(--surface-2)] rounded-b-[9px]')}>
                    <div className={GRID}>
                      <div data-cell={`product-${r.l.key}`} className="col-span-3 sm:col-span-1 min-w-0">
                        <Combobox autoFocus={!!client && i === 0 && !touch} placeholder={i === 0 ? 'Choose a product…' : 'Add a product…'} value={r.l.productId}
                          onChange={(v) => { if (!v) return; patch(r.l.key, { productId: v, price: null }); focusCell('bundles', r.l.key); if (touch) setPadFor(r.l.key); }}
                          options={products.map((p) => { const lp = listPrice(p); const taken = lines.some((l) => l.productId === p.id && l.key !== r.l.key); return { value: p.id, label: p.internalName, sub: `${p.bundlePieces} per bundle`, words: p.commercialName, disabled: taken, left: <Swatch colour={p.colour} />, right: <span className="num t-sm text-[var(--text-2)] whitespace-nowrap">{taken ? 'added' : fmtMoney(lp.perBundle, cur)}</span> }; })} />
                      </div>
                      {touch
                        ? <button type="button" data-cell={`bundles-${r.l.key}`} disabled={!r.p} onClick={() => setPadFor(padFor === r.l.key ? null : r.l.key)} aria-label="Bundles" className={cn(cellBtn, padFor === r.l.key && 'border-[var(--focus)]', !r.l.bundles && 'text-[var(--text-4)]')}>{r.l.bundles ? fmtNum(Number(r.l.bundles)) : '0'}</button>
                        : <Input data-cell={`bundles-${r.l.key}`} aria-label="Bundles" inputMode="numeric" placeholder="0" disabled={!r.p} className="num text-right" value={r.l.bundles}
                            onChange={(e) => patch(r.l.key, { bundles: e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '') })} onKeyDown={(e) => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); nextLine(r.l.key); } }} />}
                      <Input aria-label="Price per bundle" inputMode="decimal" disabled={!r.p} className={cn('num text-right', r.below && 'border-[var(--warn)]')} value={r.p ? r.l.price ?? String(r.lp!.perBundle) : ''} placeholder="—"
                        onChange={(e) => patch(r.l.key, { price: e.target.value.replace(/[^0-9.]/g, '') })} onKeyDown={(e) => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); nextLine(r.l.key); } }} />
                      <div className="hidden sm:block text-right num font-medium truncate">{r.p ? fmtMoney(r.amount, cur) : <span className="text-[var(--text-4)]">—</span>}</div>
                      {r.p ? <IconButton icon={Trash2} label={`Remove ${r.p.internalName}`} onClick={() => remove(r.l.key)} /> : <span />}
                    </div>
                    {touch && padFor === r.l.key && r.p && <div className="mt-2 max-w-[320px] ml-auto"><NumberPad label={`Bundles of ${r.p.internalName}`} suffix="bundles" value={r.l.bundles} onChange={(v) => patch(r.l.key, { bundles: v })} onDone={() => setPadFor(null)} doneLabel="Set bundles" /></div>}
                    {r.p && r.lp && (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 t-xs text-[var(--text-3)]">
                        <span className="num">{r.p.bundlePieces} × {fmtMoney(r.lp.unit, cur)} · list {fmtMoney(r.lp.perBundle, cur)}{r.lp.converted ? ' · converted at reference' : ''}{r.bundles ? ` · ${fmtNum(r.bundles * r.p.bundlePieces)} pieces` : ''}</span>
                        {r.below && <span className="inline-flex items-center gap-1 font-medium text-[var(--warn)]"><AlertTriangle className="size-3" />Below list · needs approval</span>}
                        {r.above && <span className="font-medium text-[var(--text-2)]">Above list</span>}
                        {r.l.price !== null && r.price !== r.lp.perBundle && <button type="button" onClick={() => patch(r.l.key, { price: null })} className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-[var(--text)]"><RotateCcw className="size-3" />Use list price</button>}
                        <span className="sm:hidden ml-auto num t-sm font-medium text-[var(--text)]">{fmtMoney(r.amount, cur)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 3. Check */}
          <section>
            <StepTitle n={3}>Check and create</StepTitle>
            <FigureRow items={[
              { label: 'Lines', value: fmtNum(active.length) },
              { label: 'Bundles', value: fmtNum(totalBundles), sub: `${fmtNum(pieces)} pieces` },
              { label: 'Expected cargo', value: fmtKg(Math.round(cargoKg)), sub: unmeasured ? 'weights to be measured' : 'at standard weights' },
              { label: `Total (${cur})`, value: fmtMoney(total, cur), sub: client ? (cur === 'USD' ? `≈ ${fmtMoney(total * s.fx, 'UGX')}` : `≈ ${fmtMoney(total / s.fx, 'USD')}`) : undefined },
            ]} className="max-sm:!grid-cols-2 max-sm:[&>div:nth-child(n+3)]:border-t max-sm:[&>div:nth-child(n+3)]:border-[var(--line)]" />
            <div className="flex flex-col gap-2 mt-2">
              {anyBelow && <Note tone="warn">One or more lines are priced below the list. The order will carry a note and needs approval before dispatch.</Note>}
              {overLimit && client && <Note tone="warn"><b>Over credit limit.</b> This order takes {client.name} to {limitPct}% of {fmtMoney(client.creditLimit, cur)}. The CEO will see it at the credit desk.</Note>}
              {unmeasured && <Note tone="warn">Standard bundle weights for some products are still to be measured, so the expected cargo weight is indicative.</Note>}
              <Note tone="neutral">{!client ? 'Choose a client to see the price list and what happens next.' : client.channel === 'local' ? <><b>Next: cashier.</b> The order is created as awaiting cash. The warehouse stays locked until the cashier confirms {active.length ? fmtMoney(total, cur) : 'the cash'}.</> : <><b>Next: CEO credit desk.</b> Export orders are approved by the CEO before the warehouse can pick. {plural(active.length, 'line')} so far.</>}</Note>
            </div>
          </section>
        </div>
      </Sheet>
    </>
  );
}
