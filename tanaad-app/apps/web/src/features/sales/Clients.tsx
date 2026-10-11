import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { AlarmClock, Download, Gauge as GaugeIcon, HandCoins, Landmark, PieChart, Plus, ShoppingCart, Wallet } from 'lucide-react';
import type { Client, Currency } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useGo, useQueryParam, useRefList, useSite } from '@/app/hooks';
import { addDays, clientBalance, orderTotal } from '@/data/selectors';
import { fmtDayShort, fmtMoney, fmtNum } from '@/data/format';
import { Avatar, Badge, Bar, Button, ChipGroup, DataGrid, FormRow, Input, KpiStrip, Note, NumberPad, PageHeader, Panel, SearchInput, Sheet, StackedBar, Stat, Tabs, Toolbar, useIsTouch, useMedia, type Column } from '@/components/ui';
import { CountUp } from '@/components/charts';
import { ClientCell, StackedMoney, StatusBadge, StepTitle, ageDays, alsoMoney, clientsForSite, downloadCsv, leadCur, matches, orderBundles, plural, shortMoney, sumByCur } from './shared';
import { ClientInspector } from './ClientInspector';

type Channel = 'local' | 'export';
type Country = string;
const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-7)', 'var(--series-6)', 'var(--series-8)'];

/** Client master for the site. Local buyers pay cash before delivery; export buyers run on credit approved by the CEO. */
export function Clients() {
  const s = useStore(); const site = useSite(); const nav = useNavigate(); const wide = useMedia('(min-width: 900px)'); const roomy = useMedia('(min-width: 1360px)'); const huge = useMedia('(min-width: 1560px)'); const go = useGo();
  const q0 = useQueryParam('q'); const [q, setQ] = useState(q0 ?? ''); const [tab, setTab] = useState<Channel | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null); const [adding, setAdding] = useState(false);
  useEffect(() => { if (q0 !== undefined) { setQ(q0); setTab('all'); } }, [q0]);
  const all = useMemo(() => clientsForSite(s, site.id).map((c, i) => {
    const bal = clientBalance(s, c.id); const orders = s.orders.filter((o) => o.clientId === c.id);
    const overdue = bal.openInvoices.filter((inv) => c.channel === 'export' && ageDays(s.today, inv.issuedAt) > c.creditDays).reduce((t, inv) => t + inv.total - s.payments.filter((p) => p.invoiceId === inv.id).reduce((x, p) => x + p.amount, 0), 0);
    return { client: c, bal, orders, overdue, used: c.creditLimit ? Math.round((bal.balance / c.creditLimit) * 100) : 0, bundles90: orders.filter((o) => o.createdAt.slice(0, 10) >= addDays(s.today, -90)).reduce((t, o) => t + orderBundles(o), 0), color: SERIES[i % SERIES.length] };
  }), [s, site.id]);
  type R = (typeof all)[number];
  const searched = q.trim() ? all.filter((r) => matches(q, r.client.name, r.client.contact, r.client.country, r.client.whatsapp, r.client.channel, r.client.currencyPref)) : all;
  const rows = (tab === 'all' ? searched : searched.filter((r) => r.client.channel === tab)).slice().sort((a, b) => b.bal.balance - a.bal.balance || a.client.name.localeCompare(b.client.name));
  const open = all.find((r) => r.client.id === openId)?.client; const overlay = !!open || adding;
  const newOrder = (clientId: string) => nav({ to: `/s/${site.id}/sales/orders`, search: { client: clientId } } as never);

  // KPI figures
  const exp = all.filter((r) => r.client.channel === 'export'); const owing = exp.filter((r) => r.bal.balance > 0);
  const receivable = owing.reduce((t, r) => t + r.bal.balance, 0); const limit = exp.reduce((t, r) => t + r.client.creditLimit, 0);
  const overdue = exp.reduce((t, r) => t + r.overdue, 0); const late = exp.filter((r) => r.overdue > 0);
  const usedPct = limit ? Math.round((receivable / limit) * 100) : 0;
  const ids = new Set(all.map((r) => r.client.id)); const recent = s.payments.filter((p) => ids.has(p.clientId) && p.at.slice(0, 10) >= addDays(s.today, -30));
  const collected = sumByCur(recent, (p) => p.amount, (p) => p.currency); const cCol = leadCur(collected, site.currencyPrimary);
  const latestOrders = s.orders.filter((o) => ids.has(o.clientId) && o.siteId === site.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const latestPayments = s.payments.filter((p) => ids.has(p.clientId)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  const buyers = all.filter((r) => r.bundles90 > 0).sort((a, b) => b.bundles90 - a.bundles90);
  const share = buyers.length > 6 ? [...buyers.slice(0, 5).map((r) => ({ label: r.client.name, value: r.bundles90, color: r.color })), { label: 'Everyone else', value: buyers.slice(5).reduce((t, r) => t + r.bundles90, 0), color: 'var(--text-4)' }] : buyers.map((r) => ({ label: r.client.name, value: r.bundles90, color: r.color }));

  const dash = <span className="text-[var(--text-4)]">—</span>;
  const cols: Column<R>[] = wide ? [
    { key: 'name', header: 'Client', sort: (r) => r.client.name, cell: (r) => <ClientCell name={r.client.name} width={230} /> },
    { key: 'country', header: 'Country', sort: (r) => `${r.client.country}${r.client.channel}`, cell: (r) => <span>{r.client.country}{huge && <span className="text-[var(--text-3)]"> · {r.client.channel}</span>}</span> },
    { key: 'contact', header: 'Contact', truncate: 120, sort: (r) => r.client.contact, cell: (r) => <span className="text-[var(--text-2)]">{r.client.contact}</span> },
    ...(roomy ? [{ key: 'wa', header: 'WhatsApp', mono: true, cell: (r: R) => <span className="text-[var(--text-2)]">{r.client.whatsapp}</span> } as Column<R>] : []),
    ...(huge ? [{ key: 'cur', header: 'Currency', cell: (r: R) => <Badge tone="neutral">{r.client.currencyPref}</Badge> } as Column<R>] : []),
    { key: 'limit', header: 'Limit', align: 'right', mono: true, sort: (r) => r.client.creditLimit, cell: (r) => (r.client.channel === 'export' ? shortMoney(r.client.creditLimit, r.client.currencyPref) : dash) },
    { key: 'bal', header: 'Balance', align: 'right', mono: true, sort: (r) => r.bal.balance, cell: (r) => <span className={r.bal.balance > 0 ? 'font-medium' : 'text-[var(--text-3)]'}>{fmtMoney(r.bal.balance, r.client.currencyPref)}</span> },
    { key: 'used', header: 'Credit used', sort: (r) => r.used, cell: (r) => (r.client.channel === 'export' ? <span className="flex items-center gap-2"><Bar value={r.bal.balance} max={r.client.creditLimit || 1} tone={r.used > 100 ? 'bad' : r.used > 80 ? 'warn' : 'series'} className="w-[56px]" /><span className={`num w-[36px] text-right ${r.used > 80 ? 'font-medium' : 'text-[var(--text-2)]'}`}>{r.used}%</span></span> : <span className="text-[var(--text-3)]">Cash only</span>) },
    { key: 'age', header: 'Oldest inv.', sort: (r) => (r.bal.openInvoices.length ? r.bal.ageDays : -1), cell: (r) => (r.bal.openInvoices.length ? <Badge tone={r.bal.ageDays > r.client.creditDays ? 'bad' : 'neutral'} dot={r.bal.ageDays > r.client.creditDays}>{r.bal.ageDays} days{r.bal.ageDays > r.client.creditDays ? ' · late' : ''}</Badge> : dash) },
    { key: 'last', header: 'Last payment', sort: (r) => r.bal.lastPayment?.at ?? '', cell: (r) => (r.bal.lastPayment ? <span><span className="num">{fmtDayShort(r.bal.lastPayment.at.slice(0, 10))}</span><span className="num text-[var(--text-3)]"> · {shortMoney(r.bal.lastPayment.amount, r.bal.lastPayment.currency)}</span></span> : <span className="text-[var(--text-3)]">None yet</span>) },
    { key: 'orders', header: 'Orders', align: 'right', mono: true, sort: (r) => r.orders.length, cell: (r) => fmtNum(r.orders.length) },
  ] : [
    { key: 'name', header: 'Client', wrap: true, cell: (r) => <div className="flex items-center gap-2.5 py-1 min-w-0"><Avatar name={r.client.name} size={32} /><div className="min-w-0"><div className="font-medium truncate max-w-[46vw]">{r.client.name}</div><div className="t-sm text-[var(--text-3)] truncate max-w-[46vw]">{r.client.country} · {r.client.channel}{r.bal.openInvoices.length ? ` · oldest ${r.bal.ageDays} d` : ''}</div></div></div> },
    { key: 'bal', header: 'Balance', align: 'right', wrap: true, cell: (r) => <div className="py-1"><div className={`num whitespace-nowrap ${r.bal.balance > 0 ? 'font-medium' : 'text-[var(--text-3)]'}`}>{fmtMoney(r.bal.balance, r.client.currencyPref)}</div><div className="t-sm text-[var(--text-3)]">{plural(r.orders.length, 'order')}</div></div> },
  ];
  const balBy = sumByCur(rows, (r) => r.bal.balance, (r) => r.client.currencyPref);
  const exportCsv = () => downloadCsv(`clients-${site.id}-${s.today}.csv`, ['Client', 'Country', 'Channel', 'Contact', 'WhatsApp', 'Currency', 'Credit limit', 'Credit days', 'Balance', 'Credit used %', 'Oldest invoice days', 'Orders'],
    rows.map((r) => [r.client.name, r.client.country, r.client.channel, r.client.contact, r.client.whatsapp, r.client.currencyPref, r.client.creditLimit, r.client.creditDays, r.bal.balance, r.used, r.bal.openInvoices.length ? r.bal.ageDays : '', r.orders.length]));

  return (
    <div>
      <PageHeader eyebrow={`Sales · ${site.name}`} title="Clients"
        meta={<><Badge tone="neutral">{plural(all.filter((r) => r.client.channel === 'local').length, 'local buyer')}</Badge><Badge tone="neutral">{plural(exp.length, 'export buyer')}</Badge></>}
        subtitle="Local buyers pay cash before delivery. Export buyers run on credit approved by the CEO."
        actions={<>
          <Button icon={Download} onClick={exportCsv} hotkey={overlay ? undefined : 'e'} hotkeyLabel="Export clients to CSV">Export</Button>
          <Button variant="primary" icon={Plus} onClick={() => setAdding(true)} hotkey={overlay ? undefined : 'n'}>New client</Button>
        </>} />

      <KpiStrip className="mb-[var(--gap)]">
        <Stat label="Clients" icon={Landmark} accent="var(--series-1)" value={<CountUp value={all.length} />} sub={`${all.filter((r) => r.bundles90 > 0).length} ordered in the last 90 days`} onClick={() => setTab('all')} />
        <Stat label="Export receivables" icon={Wallet} accent="var(--series-2)" value={<CountUp value={receivable} format={(n) => shortMoney(n, 'USD')} />} sub={owing.length ? `${plural(owing.reduce((t, r) => t + r.bal.openInvoices.length, 0), 'open invoice')} across ${plural(owing.length, 'client')}` : exp.length ? 'No export balance outstanding' : 'No export clients at this site'} onClick={() => setTab('export')} />
        <Stat label="Overdue" icon={AlarmClock} accent="var(--series-8)" tone={overdue > 0 ? 'bad' : 'neutral'} value={<CountUp value={overdue} format={(n) => shortMoney(n, 'USD')} />} sub={late.length ? `${plural(late.length, 'client')} past terms · oldest ${Math.max(...late.map((r) => r.bal.ageDays))} days` : 'No client is past terms'} onClick={() => setTab('export')} />
        <Stat label="Credit used" icon={GaugeIcon} accent="var(--series-7)" tone={usedPct > 100 ? 'bad' : usedPct > 80 ? 'warn' : 'neutral'} value={<><CountUp value={usedPct} /><span className="text-[var(--text-3)] font-medium">%</span></>} sub={limit ? `${shortMoney(receivable, 'USD')} of ${shortMoney(limit, 'USD')} in limits` : 'No credit limits set'} onClick={() => setTab('export')} />
        <Stat label="Collected, 30 days" icon={HandCoins} accent="var(--series-3)" value={<CountUp value={collected[cCol]} format={(n) => shortMoney(n, cCol)} />} sub={recent.length ? `${plural(recent.length, 'payment')} ${alsoMoney(collected, cCol)}` : 'No payment in the last 30 days'} />
      </KpiStrip>

      {share.length > 0 && (
        <Panel icon={PieChart} title="Who buys most" sub={`bundles ordered · last 90 days · ${fmtNum(buyers.reduce((t, r) => t + r.bundles90, 0))} in total`} className="mb-[var(--gap)]">
          <StackedBar height={12} legend={false} segments={share} format={(n) => `${fmtNum(n)} bundles`} />
          <div className="mt-2 grid gap-x-5 gap-y-1 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
            {share.map((x) => <div key={x.label} className="flex items-center gap-1.5 t-sm min-w-0"><span className="size-2 rounded-[2px] shrink-0" style={{ background: x.color }} /><span className="truncate text-[var(--text-2)] flex-1">{x.label}</span><span className="num font-medium">{fmtNum(x.value)}</span><span className="num text-[var(--text-3)] w-[34px] text-right">{Math.round((x.value / Math.max(1, buyers.reduce((t, r) => t + r.bundles90, 0))) * 100)}%</span></div>)}
          </div>
        </Panel>
      )}

      <Toolbar right={<span className="t-sm text-[var(--text-3)] num">{rows.length === all.length ? plural(all.length, 'client') : `${rows.length} of ${all.length}`}</span>}>
        <SearchInput value={q} onChange={setQ} placeholder="Search name, contact, country…" />
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All', count: searched.length }, { value: 'local', label: 'Local · cash', count: searched.filter((r) => r.client.channel === 'local').length }, { value: 'export', label: 'Export · credit', count: searched.filter((r) => r.client.channel === 'export').length }]} />
      </Toolbar>

      <DataGrid rows={rows} columns={cols} rowKey={(r) => r.client.id} onRowClick={(r) => setOpenId(r.client.id)} selectedKey={openId}
        empty={q.trim() ? `No client matches “${q.trim()}”.` : tab === 'export' ? (site.id !== 'mats' ? 'No export clients at this site. Export sales for the group are handled from the Mats sales desk.' : 'No export clients yet.') : 'No clients yet. Add the first one; it takes under a minute.'}
        footer={rows.length > 0 ? (wide
          ? <tr><td colSpan={4 + (roomy ? 1 : 0) + (huge ? 1 : 0)}>{plural(rows.length, 'client')}</td><td className="text-right py-1"><StackedMoney by={balBy} /></td><td colSpan={3} /><td className="text-right num">{fmtNum(rows.reduce((t, r) => t + r.orders.length, 0))}</td></tr>
          : <tr><td>{plural(rows.length, 'client')}</td><td className="text-right py-1"><StackedMoney by={balBy} /></td></tr>) : undefined} />

      <div className="grid gap-[var(--gap)] lg:grid-cols-2 mt-[var(--gap)]">
        <Panel icon={ShoppingCart} title="Latest orders" sub="across these clients" pad={false} actions={<Button size="sm" variant="ghost" onClick={() => go.site('sales/orders')}>All orders</Button>}>
          {latestOrders.length === 0 ? <div className="p-[var(--pad)] t-sm text-[var(--text-3)]">No orders yet.</div> : latestOrders.map((o) => { const c = all.find((r) => r.client.id === o.clientId)?.client; return (
            <button key={o.id} type="button" onClick={() => go.site('sales/orders', undefined, o.number)} className="w-full flex items-center gap-2.5 px-[var(--pad)] h-[var(--row-h)] border-b border-[var(--line)] last:border-b-0 text-left hover:bg-[var(--hover)]">
              <span className="code font-medium w-[62px] shrink-0">{o.number}</span><span className="t-base truncate flex-1">{c?.name}</span><span className="num t-sm text-[var(--text-3)] hidden sm:inline">{fmtDayShort(o.createdAt.slice(0, 10))}</span><span className="num t-base font-medium w-[112px] text-right whitespace-nowrap">{fmtMoney(orderTotal(o), o.currency)}</span><span className="w-[128px] hidden sm:block"><StatusBadge status={o.status} /></span>
            </button>
          ); })}
        </Panel>
        <Panel icon={HandCoins} title="Latest payments" sub="across these clients" pad={false} actions={<Button size="sm" variant="ghost" onClick={() => go.site('sales/invoices')}>Invoices</Button>}>
          {latestPayments.length === 0 ? <div className="p-[var(--pad)] t-sm text-[var(--text-3)]">No payments yet.</div> : latestPayments.map((p) => { const c = all.find((r) => r.client.id === p.clientId)?.client; return (
            <div key={p.id} className="flex items-center gap-2.5 px-[var(--pad)] h-[var(--row-h)] border-b border-[var(--line)] last:border-b-0">
              <Avatar name={c?.name ?? '?'} size={22} /><span className="t-base truncate flex-1">{c?.name}</span><span className="t-sm text-[var(--text-3)] hidden sm:inline">{p.method}</span><span className="num t-sm text-[var(--text-3)]">{fmtDayShort(p.at.slice(0, 10))}</span><span className="num t-base font-medium w-[112px] text-right whitespace-nowrap">{fmtMoney(p.amount, p.currency)}</span>
            </div>
          ); })}
        </Panel>
      </div>

      {open && <ClientInspector key={open.id} client={open} onClose={() => setOpenId(null)} onNewOrder={() => newOrder(open.id)} />}
      {adding && <NewClientSheet defaultChannel={tab === 'export' ? 'export' : 'local'} onClose={() => setAdding(false)} onSave={(draft) => { const c = useStore.getState().saveClient(draft); setTab('all'); setQ(''); setAdding(false); setOpenId(c.id); useStore.getState().toast({ kind: 'ok', title: `${c.name} added`, detail: c.channel === 'export' ? `Credit ${fmtMoney(c.creditLimit, c.currencyPref)} · ${c.creditDays} days` : 'Cash before delivery' }); }} />}
    </div>
  );
}

function NewClientSheet({ defaultChannel, onClose, onSave }: { defaultChannel: Channel; onClose: () => void; onSave: (c: Omit<Client, 'id'>) => void }) {
  const touch = useIsTouch();
  // Markets and credit terms are master data (Settings → Master data: `market`, `credit_term`).
  const go = useGo(); const clients = useStore((x) => x.clients);
  const markets = useRefList('market'); const terms = useRefList('credit_term');
  const countries = useMemo(() => markets.map((m) => m.label), [markets]);
  const most = <T,>(xs: T[]) => [...new Set(xs)].sort((a, b) => xs.filter((x) => x === b).length - xs.filter((x) => x === a).length)[0];
  // The home market is where the local buyers are; export defaults to the first other market.
  const home = most(clients.filter((c) => c.channel === 'local' && countries.includes(c.country)).map((c) => c.country)) ?? countries[0];
  const abroad = countries.find((c) => c !== home) ?? home;
  const termOptions = useMemo(() => terms.filter((t) => typeof t.value === 'number' && t.value > 0).map((t) => ({ days: t.value as number, label: t.label })), [terms]);
  const [name, setName] = useState(''); const [contact, setContact] = useState(''); const [country, setCountry] = useState<Country | undefined>(defaultChannel === 'export' ? abroad : home); const [channel, setChannel] = useState<Channel>(defaultChannel);
  const [whatsapp, setWhatsapp] = useState(''); const [currency, setCurrency] = useState<Currency>(defaultChannel === 'export' ? 'USD' : 'UGX'); const [limit, setLimit] = useState(''); const [days, setDays] = useState(termOptions[0] ? String(termOptions[0].days) : '');
  const pickChannel = (c: Channel) => { setChannel(c); setCurrency(c === 'export' ? 'USD' : 'UGX'); if (c === 'export' && country === home) setCountry(abroad); if (c === 'local') setCountry(home); };
  const missing = [name.trim().length < 2 && 'a business name', whatsapp.replace(/\D/g, '').length < 9 && 'a WhatsApp number', !country && 'a country', channel === 'export' && !(Number(limit) > 0) && 'a credit limit', channel === 'export' && !(Number(days) > 0) && 'credit days'].filter(Boolean) as string[];
  const valid = missing.length === 0;
  const save = () => { if (!valid || !country) return; onSave({ name: name.trim(), contact: contact.trim() || 'Owner', country, channel, whatsapp: whatsapp.trim(), currencyPref: currency, creditLimit: channel === 'export' ? Number(limit) : 0, creditDays: channel === 'export' ? Number(days) : 0 }); };
  return (
    <Sheet open onClose={onClose} title="New client" sub="Takes under a minute" width={540}
      footer={<>
        <span className="mr-auto t-sm text-[var(--text-3)] truncate">{valid ? 'Ready to save' : `Needs ${missing.join(', ')}`}</span>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!valid} onClick={save} hotkey="mod+enter">Save client</Button>
      </>}>
      <div className="flex flex-col gap-4">
        <section>
          <StepTitle n={1}>Business</StepTitle>
          <FormRow label="Business name" required><Input autoFocus={!touch} data-autofocus="" value={name} onChange={(e) => setName(e.target.value)} placeholder="Registered or trading name" /></FormRow>
          <FormRow label="Contact person" hint="Who answers the WhatsApp"><Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Name" /></FormRow>
          <FormRow label="WhatsApp number" required hint="Invoices and statements are sent here"><Input inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="Country code and number" className="num" /></FormRow>
        </section>
        <section>
          <StepTitle n={2}>Terms</StepTitle>
          <FormRow label="Channel"><ChipGroup ariaLabel="Channel" options={[{ value: 'local', label: 'Local · cash before delivery' }, { value: 'export', label: 'Export · credit' }]} value={channel} onChange={pickChannel} /></FormRow>
          <FormRow label="Country">{countries.length ? <ChipGroup ariaLabel="Country" options={countries.map((c) => ({ value: c, label: c }))} value={country} onChange={setCountry} /> : <span className="t-sm text-[var(--text-3)]">No markets set up. <button type="button" className="underline underline-offset-2 hover:text-[var(--text)]" onClick={() => go.site('settings')}>Add markets in Settings → Master data</button></span>}</FormRow>
          <FormRow label="Invoice currency"><ChipGroup ariaLabel="Invoice currency" options={[{ value: 'UGX', label: 'UGX' }, { value: 'USD', label: 'USD' }]} value={currency} onChange={setCurrency} /></FormRow>
          {channel === 'export' && <>
            <FormRow label="Credit limit" required hint="Orders above this go to the CEO"><div className="max-w-[260px]"><NumberPad value={limit} onChange={setLimit} suffix={currency} /></div></FormRow>
            <FormRow label="Credit days" required hint="Pick a term or type a custom number of days">
              <div className="flex flex-wrap items-center gap-2">
                <Input aria-label="Credit days" inputMode="numeric" className="num text-right w-[88px]!" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="0" /><span className="t-sm text-[var(--text-3)]">days</span>
                {termOptions.length > 0 && <ChipGroup ariaLabel="Credit terms" size="sm" options={termOptions.map((t) => ({ value: String(t.days), label: t.label }))} value={termOptions.some((t) => t.days === Number(days)) ? days : null} onChange={setDays} />}
              </div>
            </FormRow>
          </>}
        </section>
        {channel === 'local' && <Note tone="neutral">Local clients have no credit. Orders unlock for dispatch only after the cashier confirms cash.</Note>}
      </div>
    </Sheet>
  );
}
