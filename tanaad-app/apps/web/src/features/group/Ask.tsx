import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ChevronDown, ChevronUp, CornerDownLeft, FileSearch, History, Landmark, ListChecks, Lock, MessageSquareText, Send, ShieldCheck, Sparkles, Trash2, Truck, Users, Wallet, type LucideIcon } from 'lucide-react';
import { useStore, type AppState } from '@/data/store';
import { Avatar, Badge, Button, DataGrid, Empty, Input, Kbd, PageHeader, Panel, Status, cn, useHotkey, useIsTouch, type Column, type Tone } from '@/components/ui';
import { SITES, SITE_LIST } from '@/config/sites';
import { headcount, headcountBySector, addDays, dow, cashDayFor, cashSummary, cashInSafe, receivables } from '@/data/selectors';
import { compact, fmtUGX, fmtUSD, fmtNum, fmtDay, fmtDayShort, fmtDateTime, fmtMoney } from '@/data/format';
import { catLabel, weekStart } from './shared';
import { IconChip } from './kit';

interface Rec { title: string; sub?: string; right?: string; tone?: 'ok' | 'warn' | 'bad' }
interface Figure { value: string; unit: string; caption: string }
interface Answer { headline: string; detail?: string; records: Rec[]; recordsLabel: string; figure?: Figure; topic?: TopicId }
interface Msg { id: number; who: 'you' | 'tanaad'; text: string; answer?: Answer }
type TopicId = 'dispatch' | 'people' | 'machines' | 'cash' | 'clients';

const TOPICS: { id: TopicId; label: string; hint: string; icon: LucideIcon; color: string }[] = [
  { id: 'dispatch', label: 'Dispatches and export sales', hint: 'What left the gate, to whom, and whether it was paid', icon: Truck, color: 'var(--series-1)' },
  { id: 'people', label: 'Headcount and attendance', hint: 'Who worked at a site on a day, by shift and sector', icon: Users, color: 'var(--series-3)' },
  { id: 'machines', label: 'Machines and downtime', hint: 'Which machine stopped longest, and the reasons given', icon: Activity, color: 'var(--series-7)' },
  { id: 'cash', label: 'Cash in the safes', hint: 'Expected closing per site, from today\'s cash pages', icon: Wallet, color: 'var(--series-2)' },
  { id: 'clients', label: 'Clients and receivables', hint: 'Who owes what, and how far past terms', icon: Landmark, color: 'var(--series-5)' },
];
const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2000, i, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' }));
const passed = (d: AppState['dispatches'][number]) => d.gateStatus === 'pass' || d.gateStatus === 'overridden';

/** Export dispatches in a month, one row per order line, with the client and product looked up. */
function exportLines(s: AppState, month: string) {
  return s.dispatches.filter((d) => passed(d) && d.createdAt.startsWith(month)).flatMap((d) => {
    const o = s.orders.find((x) => x.id === d.orderId); const c = s.clients.find((x) => x.id === o?.clientId);
    if (!o || !c || c.channel !== 'export') return [];
    return o.lines.map((l) => ({ d, o, c, line: l, product: s.products.find((p) => p.id === l.productId) }));
  });
}
/** One example question per area, written from what is in the ledger: the names in them are records, not text in this file. */
function suggestionsFor(s: AppState): { topic: TopicId; text: string }[] {
  const lastMonth = addDays(`${s.today.slice(0, 8)}01`, -1).slice(0, 7);
  const tally = new Map<string, { product: string; market: string; bundles: number }>();
  for (const r of exportLines(s, lastMonth)) { if (!r.product) continue; const k = `${r.product.id}|${r.c.country}`; const cur = tally.get(k) ?? { product: r.product.internalName, market: r.c.country, bundles: 0 }; cur.bundles += r.line.bundles; tally.set(k, cur); }
  const top = [...tally.values()].sort((a, b) => b.bundles - a.bundles)[0];
  const first = SITE_LIST[0];
  return [
    ...(top ? [{ topic: 'dispatch' as const, text: `How many ${top.product} went to ${top.market} in ${MONTH_NAMES[+lastMonth.slice(5, 7) - 1]} and were they paid?` }] : []),
    ...(first ? [{ topic: 'people' as const, text: `What was the ${first.shortName} headcount yesterday?` }] : []),
    { topic: 'machines', text: 'Which machine has the most downtime this week?' },
    { topic: 'cash', text: `How much cash is in the ${SITE_LIST.length} safes right now?` },
    { topic: 'clients', text: 'Which export client is most overdue?' },
  ];
}

/** Rule-based answers over the live store. Read-only; every answer lists the records behind it. */
function answer(s: AppState, q: string): Answer {
  const t = q.toLowerCase();
  const product = s.products.filter((p) => p.active !== false).sort((a, b) => b.internalName.length - a.internalName.length).find((p) => t.includes(p.internalName.toLowerCase()));
  const market = [...new Set(s.clients.map((c) => c.country))].find((m) => t.includes(m.toLowerCase()));
  const monthIdx = MONTH_NAMES.findIndex((m) => t.includes(m.toLowerCase()));
  if ((product && (market || monthIdx >= 0 || /went|dispatch|sent|export|sold/.test(t))) || (market && /went|dispatch|sent|export|sold|how many/.test(t))) {
    const year = +s.today.slice(0, 4) - (monthIdx >= 0 && monthIdx + 1 > +s.today.slice(5, 7) ? 1 : 0);
    const month = monthIdx >= 0 ? `${year}-${String(monthIdx + 1).padStart(2, '0')}` : s.today.slice(0, 7); const monthName = MONTH_NAMES[+month.slice(5, 7) - 1];
    const rows = exportLines(s, month).filter((r) => (!product || r.line.productId === product.id) && (!market || r.c.country === market)).map((r) => ({ ...r, bundles: r.line.bundles }));
    const what = product?.internalName ?? 'export goods'; const where = market ?? 'export clients';
    const bundles = rows.reduce((a, r) => a + r.bundles, 0); const pieces = rows.reduce((a, r) => a + r.bundles * (r.product?.bundlePieces ?? 1), 0);
    const orders = [...new Map(rows.map((r) => [r.o.id, r])).values()];
    const invs = orders.map((r) => ({ r, inv: s.invoices.find((i) => i.orderId === r.o.id) })); const paid = invs.filter((x) => x.r.o.status === 'paid'); const open = invs.filter((x) => x.r.o.status !== 'paid');
    const openUsd = open.reduce((a, x) => a + (x.inv?.total ?? 0), 0);
    const records: Rec[] = [];
    for (const r of rows) records.push({ title: `${r.d.deliveryNoteNo} · ${r.c.name}`, sub: `${fmtDayShort(r.d.createdAt.slice(0, 10))} · order ${r.o.number} · ${r.product?.internalName ?? ''} · gate ${r.d.gateStatus}`, right: `${r.bundles} bundles` });
    for (const x of invs) if (x.inv) { const pay = s.payments.find((p) => p.invoiceId === x.inv!.id); records.push({ title: `${x.inv.number} · ${fmtMoney(x.inv.total, x.inv.currency)}`, sub: pay ? `Paid ${fmtDayShort(pay.at.slice(0, 10))} · ${pay.method} ${pay.reference}` : `Issued ${fmtDayShort(x.inv.issuedAt.slice(0, 10))} · not yet paid`, right: pay ? 'paid' : 'open', tone: pay ? 'ok' : 'warn' }); }
    const caption = `${what} to ${where}, ${monthName}`;
    return rows.length === 0 ? { topic: 'dispatch', figure: { value: '0', unit: 'bundles', caption }, headline: `No ${what} reached ${where} in ${monthName}.`, detail: `No gate-passed dispatch in ${monthName} matches.`, records: [], recordsLabel: 'records' } : { topic: 'dispatch', figure: { value: fmtNum(bundles), unit: 'bundles', caption: `${caption} · ${fmtNum(pieces)} pieces` }, headline: `${fmtNum(bundles)} bundles of ${what} (${fmtNum(pieces)} pieces) went to ${where} in ${monthName}, on ${orders.length} dispatch${orders.length === 1 ? '' : 'es'}.`, detail: `${paid.length} of ${invs.length} invoices paid. ${open.length ? `${fmtUSD(openUsd)} still open on ${open.map((x) => x.inv?.number).filter(Boolean).join(', ')}.` : 'All paid.'}`, records, recordsLabel: `${rows.length} dispatch lines · ${invs.length} invoices` };
  }
  if (/headcount|how many (people|workers)|on shift|attendance/.test(t)) {
    const site = SITE_LIST.find((x) => t.includes(x.shortName.toLowerCase()))?.id ?? SITE_LIST[0].id;
    const day = /today/.test(t) ? s.today : addDays(s.today, -1);
    if (SITES[site].closedDays.includes(dow(day))) return { topic: 'people', headline: `${SITES[site].shortName} was closed on ${fmtDay(day)}.`, records: [], recordsLabel: 'records' };
    const hc = headcount(s, site, day); const d = headcount(s, site, day, 'day'); const n = headcount(s, site, day, 'night'); const sectors = headcountBySector(s, site, day);
    const ids = s.shifts.filter((sh) => sh.siteId === site && sh.day === day).map((sh) => sh.id);
    const rows = s.attendance.filter((a) => ids.includes(a.shiftId) && a.status !== 'absent');
    return { topic: 'people', figure: { value: fmtNum(hc.total), unit: 'people', caption: `${SITES[site].name} · ${fmtDay(day)}` }, headline: `${hc.total} people worked at ${SITES[site].name} on ${fmtDay(day)}: ${d.total} day shift, ${n.total} night shift.`, detail: `${hc.present} full days, ${hc.half} half days, ${hc.overtimeHours} overtime hours. By sector: ${sectors.map((x) => `${x.sector} ${x.count}`).join(', ')}.`, records: rows.map((a) => { const p = s.people.find((x) => x.id === a.personId); return { title: p?.fullName ?? a.personId, sub: `${p?.sector ?? ''} · ${a.shiftId.endsWith('night') ? 'night' : 'day'} · marked ${fmtDateTime(a.at)}`, right: a.status, tone: a.status === 'present' ? 'ok' as const : 'warn' as const }; }), recordsLabel: `${rows.length} attendance rows` };
  }
  if (/loom|downtime|machine|stopped/.test(t)) {
    const from = weekStart(s.today);
    const named = SITE_LIST.find((x) => t.includes(x.shortName.toLowerCase()))?.id;
    const es = s.production.filter((p) => (!named || p.siteId === named) && p.day >= from && p.downtimeMin > 0);
    const by = new Map<string, number>(); for (const e of es) by.set(e.machineId, (by.get(e.machineId) ?? 0) + e.downtimeMin);
    const top = [...by.entries()].sort((a, b) => b[1] - a[1]);
    if (!top.length) return { topic: 'machines', figure: { value: '0', unit: 'min', caption: 'machine downtime this week' }, headline: 'No machine downtime logged this week.', records: [], recordsLabel: 'records' };
    const [mid, mins] = top[0]; const m = s.machines.find((x) => x.id === mid); const mine = es.filter((e) => e.machineId === mid).sort((a, b) => b.day.localeCompare(a.day));
    const reasons = new Map<string, number>(); for (const e of mine) reasons.set(e.downtimeReason ?? 'no reason', (reasons.get(e.downtimeReason ?? 'no reason') ?? 0) + e.downtimeMin);
    return { topic: 'machines', figure: { value: fmtNum(mins), unit: 'min', caption: `${m?.code ?? 'Machine'} down since ${fmtDay(from)}` }, headline: `${m?.code} has the most downtime this week: ${fmtNum(mins)} minutes (${(mins / 60).toFixed(1)} h) since ${fmtDay(from)}.`, detail: `Reasons: ${[...reasons.entries()].map(([r, n]) => `${r} ${n} min`).join(', ')}. Next: ${top.slice(1, 4).map(([id, n]) => `${s.machines.find((x) => x.id === id)?.code} ${n} min`).join(', ')}.`, records: mine.map((e) => ({ title: `${fmtDay(e.day)} · ${e.shiftId.endsWith('night') ? 'night' : 'day'} shift`, sub: `${s.products.find((p) => p.id === e.productId)?.internalName ?? ''} · ${fmtNum(e.goodUnits)} good · ${e.downtimeReason ?? 'no reason given'}`, right: `${e.downtimeMin} min`, tone: e.downtimeReason ? undefined : 'bad' as const })), recordsLabel: `${mine.length} shift entries` };
  }
  if (/cash|safe|money/.test(t)) {
    const per = SITE_LIST.map((site) => { const cd = cashDayFor(s, site.id, s.today); const c = cd ? cashSummary(s, cd.id) : undefined; return { site, cd, c, amount: c?.expectedClosing ?? cashInSafe(s, site.id) }; });
    const total = per.reduce((a, p) => a + p.amount, 0);
    const records: Rec[] = []; for (const p of per) { records.push({ title: `${p.site.name} · expected closing`, sub: p.cd ? `Opening ${fmtUGX(p.cd.opening)} + sales ${fmtUGX(p.c!.sales)} − out ${fmtUGX(p.c!.expenses + p.c!.wages)} · page ${p.cd.status}` : 'No page open today; last closed balance', right: fmtUGX(p.amount), tone: p.cd?.status === 'open' ? 'warn' : 'ok' }); for (const e of p.c?.entries ?? []) records.push({ title: `${p.site.shortName} · ${catLabel(s.refs, e.category)}${e.subcategory ? ` · ${e.subcategory}` : ''}`, sub: `${e.payee ?? ''} · ${fmtDateTime(e.at)}`, right: `${e.direction === 'in' ? '+' : '−'}${fmtNum(e.amount)}` }); }
    return { topic: 'cash', figure: { value: compact(total), unit: 'UGX', caption: `expected in ${per.length} safes · ${fmtUSD(Math.round(total / s.fx))}` }, headline: `${fmtUGX(total)} expected across the ${per.length} safes right now (${fmtUSD(Math.round(total / s.fx))}).`, detail: per.map((p) => `${p.site.shortName} ${fmtUGX(p.amount)}`).join(' · ') + '. Expected, not counted: the cashier counts and signs at close.', records, recordsLabel: `${per.length} cash pages · ${records.length - per.length} entries today` };
  }
  if (/overdue|client|owes|receivable|debt/.test(t)) {
    const rs = receivables(s).sort((a, b) => b.ageDays - a.ageDays);
    if (!rs.length) return { topic: 'clients', figure: { value: '0', unit: 'open', caption: 'export balances' }, headline: 'No export client owes anything.', records: [], recordsLabel: 'records' };
    const top = rs[0]; const over = top.ageDays - top.client.creditDays;
    return { topic: 'clients', figure: { value: String(top.ageDays), unit: 'days', caption: `oldest open invoice · ${top.client.name}` }, headline: `${top.client.name} (${top.client.country}) is most overdue: oldest open invoice is ${top.ageDays} days old against ${top.client.creditDays}-day terms${over > 0 ? `, ${over} days over` : ''}.`, detail: `Balance ${fmtMoney(top.balance, top.client.currencyPref)} on ${top.openInvoices.length} open invoice${top.openInvoices.length === 1 ? '' : 's'}. Last payment ${top.lastPayment ? `${fmtMoney(top.lastPayment.amount, top.lastPayment.currency)} on ${fmtDayShort(top.lastPayment.at.slice(0, 10))}` : 'never'}. Others: ${rs.slice(1).map((r) => `${r.client.name.split(' ')[0]} ${r.ageDays} d`).join(', ') || 'none'}.`, records: rs.flatMap((r) => r.openInvoices.map((i) => ({ title: `${i.number} · ${r.client.name}`, sub: `Issued ${fmtDayShort(i.issuedAt.slice(0, 10))} · ${Math.round((new Date(s.today).getTime() - new Date(i.issuedAt.slice(0, 10)).getTime()) / 86400000)} days`, right: fmtMoney(i.total, i.currency), tone: r.client.id === top.client.id ? 'bad' as const : undefined }))), recordsLabel: `${rs.reduce((a, r) => a + r.openInvoices.length, 0)} open invoices` };
  }
  return { headline: 'I can answer about headcount, output, cash, stock, dispatches and clients.', detail: 'Try one of the suggestions below, or name a site, a product, a market or a client. Every answer comes with the records it was counted from.', records: [], recordsLabel: 'records' };
}

/** The conversation survives a trip to another screen and back; it is cleared with the session, never written to the ledger. */
let memory: Msg[] = [];
let memorySeq = 0;

export function Ask() {
  const s = useStore(); const touch = useIsTouch(); const user = s.users.find((u) => u.id === s.session?.userId);
  const [msgs, setMsgs] = useState<Msg[]>(memory); const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null); const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { memory = msgs; }, [msgs]);
  const focus = () => { if (!touch) input.current?.focus(); };
  const ask = (text: string) => {
    const v = text.trim(); if (!v) return;
    const a = answer(s, v);
    setMsgs((m) => [...m, { id: ++memorySeq, who: 'you', text: v }, { id: ++memorySeq, who: 'tanaad', text: a.headline, answer: a }]);
    setQ(''); setOpenId(null); focus();
    setTimeout(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }), 50);
  };
  const clear = () => { setMsgs([]); setOpenId(null); focus(); };
  const suggestions = useMemo(() => suggestionsFor(s), [s.dispatches, s.orders, s.clients, s.products, s.today]); // eslint-disable-line react-hooks/exhaustive-deps
  const remaining = useMemo(() => suggestions.map((x) => x.text).filter((x) => !msgs.some((m) => m.who === 'you' && m.text === x)), [msgs, suggestions]);
  const lastAnswer = [...msgs].reverse().find((m) => m.who === 'tanaad' && m.answer?.records.length);
  const recent = useMemo(() => { const out: { q: Msg; a?: Msg }[] = []; for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].who === 'you' && !out.some((x) => x.q.text === msgs[i].text)) out.push({ q: msgs[i], a: msgs[i + 1] }); return out.slice(0, 6); }, [msgs]);
  const cited = msgs.reduce((t, m) => t + (m.answer?.records.length ?? 0), 0);

  // Digits pick a suggestion from anywhere; inside the question box they only do so while it is still empty.
  const pick = (i: number) => { if (remaining[i]) ask(remaining[i]); };
  useHotkey('1', () => pick(0), { label: 'Ask a suggestion (1 to 5)', enabled: remaining.length > 0 });
  useHotkey('2', () => pick(1), { label: 'Ask suggestion 2', enabled: remaining.length > 1, hidden: true });
  useHotkey('3', () => pick(2), { label: 'Ask suggestion 3', enabled: remaining.length > 2, hidden: true });
  useHotkey('4', () => pick(3), { label: 'Ask suggestion 4', enabled: remaining.length > 3, hidden: true });
  useHotkey('5', () => pick(4), { label: 'Ask suggestion 5', enabled: remaining.length > 4, hidden: true });
  useHotkey('/', () => input.current?.focus(), { label: 'Go to the question box' });
  useHotkey('alt+r', () => { if (lastAnswer) setOpenId((v) => (v === lastAnswer.id ? null : lastAnswer.id)); }, { label: 'Show or hide the records behind the last answer', enabled: !!lastAnswer });
  useHotkey('alt+x', clear, { label: 'Clear the conversation', enabled: msgs.length > 0 });

  return (
    <div>
      <PageHeader eyebrow="Head Office" title="Ask the business" subtitle="Plain questions, answered with a number and the records behind it."
        meta={<><Badge tone="info"><Lock className="size-3" />Read-only</Badge><Badge tone="neutral"><ShieldCheck className="size-3" />Cites records</Badge></>} />
      <div className="grid gap-[var(--gap)] items-start xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel icon={MessageSquareText} title="Conversation" sub={msgs.length ? `${msgs.length / 2} question${msgs.length === 2 ? '' : 's'} · ${fmtNum(cited)} records cited` : 'nothing asked yet'} pad={false}
          className="h-[calc(100dvh-var(--titlebar-h)-var(--statusbar-h)-130px)] max-lg:h-[calc(100dvh-var(--titlebar-h)-216px)] min-h-[440px]" bodyClassName="flex-1 min-h-0 flex flex-col"
          actions={<Button size="sm" variant="ghost" icon={Trash2} disabled={!msgs.length} onClick={clear}>Clear</Button>}>
          <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-[var(--pad)] py-[var(--pad)] flex flex-col gap-4">
            {msgs.length === 0 ? (
              <div className="m-auto w-full max-w-[620px]">
                <div className="flex items-center gap-3 mb-4">
                  <IconChip icon={Sparkles} color="var(--accent)" size="lg" />
                  <div><div className="t-lg font-semibold">What do you want to know?</div><div className="t-sm text-[var(--text-2)]">Answers are counted from the ledger on this device, never guessed, and never change anything.</div></div>
                </div>
                <div className="surface-flat overflow-hidden">
                  {suggestions.map(({ text: x, topic }, i) => { const t = TOPICS.find((tp) => tp.id === topic)!; return (
                    <button key={x} type="button" onClick={() => ask(x)} className="group w-full flex items-center gap-3 px-3 py-2.5 touch:py-3.5 text-left border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--hover)]">
                      <IconChip icon={t.icon} color={t.color} />
                      <span className="min-w-0 flex-1"><span className="block t-base font-medium">{x}</span><span className="block t-sm text-[var(--text-3)] truncate">{t.label}</span></span>
                      <Kbd keys={String(i + 1)} />
                    </button>
                  ); })}
                </div>
              </div>
            ) : msgs.map((m) => <Bubble key={m.id} m={m} name={user?.name ?? 'You'} seed={user?.avatarSeed} open={openId === m.id} onToggle={() => setOpenId((v) => (v === m.id ? null : m.id))} />)}
          </div>
          <div className="shrink-0 border-t border-[var(--line)] bg-[var(--surface-2)] rounded-b-[9px] px-[var(--pad)] pt-2.5 pb-2.5">
            {msgs.length > 0 && remaining.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar mb-2">
                <span className="t-label shrink-0 mr-0.5">Try</span>
                {remaining.map((x, i) => <button key={x} type="button" onClick={() => ask(x)} className="shrink-0 ctl-sm inline-flex items-center gap-1.5 px-2 rounded-md border border-[var(--line-2)] bg-[var(--surface)] t-sm font-medium text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-[var(--text)] whitespace-nowrap"><Kbd keys={String(i + 1)} />{x}</button>)}
              </div>
            )}
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
              <div className="relative flex-1 min-w-0">
                <Sparkles className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--accent)] pointer-events-none" />
                <Input ref={input} big autoFocus={!touch} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Your question" placeholder="Ask about headcount, output, cash, stock, dispatches or clients" className="pl-9"
                  onKeyDown={(e) => { if (!q && /^[1-5]$/.test(e.key) && remaining[+e.key - 1]) { e.preventDefault(); pick(+e.key - 1); } else if (e.key === 'Escape' && q) { e.stopPropagation(); setQ(''); } }} />
              </div>
              <Button type="submit" variant="primary" size="lg" icon={Send} className="shrink-0" disabled={!q.trim()}>Ask<Kbd keys="enter" className="ml-1 [&_kbd]:bg-transparent [&_kbd]:border-current [&_kbd]:text-current [&_kbd]:opacity-60" /></Button>
            </form>
            <div className="touch:hidden flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 t-xs text-[var(--text-3)]">
              <span className="inline-flex items-center gap-1"><Kbd keys="1" />–<Kbd keys={String(suggestions.length)} /> pick a suggestion while the box is empty</span>
              <span className="inline-flex items-center gap-1"><Kbd keys="alt+r" /> records behind the last answer</span>
              <span className="inline-flex items-center gap-1 ml-auto"><Lock className="size-3" />Read-only: nothing here writes to the ledger</span>
            </div>
          </div>
        </Panel>

        <aside className="flex flex-col gap-[var(--gap)] min-w-0">
          <Panel icon={ListChecks} title="What it can answer" sub={`${TOPICS.length} areas`} pad={false}>
            {TOPICS.map((t) => (
              <button key={t.id} type="button" disabled={!suggestions.some((x) => x.topic === t.id)} onClick={() => { const x = suggestions.find((y) => y.topic === t.id); if (x) ask(x.text); }} className="w-full flex items-center gap-2.5 px-[var(--pad)] py-2 touch:py-3 text-left border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--hover)]">
                <IconChip icon={t.icon} color={t.color} />
                <span className="min-w-0 flex-1"><span className="block t-base font-medium truncate">{t.label}</span><span className="block t-sm text-[var(--text-3)] truncate">{t.hint}</span></span>
                <CornerDownLeft className="size-3.5 text-[var(--text-4)] shrink-0" />
              </button>
            ))}
          </Panel>
          <Panel icon={History} title="Recent questions" sub={recent.length ? 'this session' : undefined} pad={false}>
            {recent.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={History} title="Nothing asked yet" hint="Questions from this session collect here so you can ask them again." /></div> : recent.map(({ q: x, a }) => (
              <button key={x.id} type="button" onClick={() => ask(x.text)} className="w-full flex items-center gap-2.5 px-[var(--pad)] py-2 touch:py-3 text-left border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--hover)]">
                <span className="min-w-0 flex-1 t-sm truncate">{x.text}</span>
                {a?.answer?.figure && <span className="num t-sm font-semibold shrink-0">{a.answer.figure.value}<span className="font-normal text-[var(--text-3)]"> {a.answer.figure.unit}</span></span>}
              </button>
            ))}
          </Panel>
          <Panel icon={ShieldCheck} title="How answers are made">
            {([[FileSearch, 'Counted, not guessed', 'Each figure is a count or a sum over records already in the ledger.'], [ShieldCheck, 'Cites its records', 'Open any answer to see the dispatches, entries or invoices behind it.'], [Lock, 'Read-only', 'A question never changes a record, a balance or an approval.']] as const).map(([Icon, title, text]) => (
              <div key={title} className="flex items-start gap-2.5 py-1.5"><IconChip icon={Icon} size="sm" className="mt-0.5" /><div className="min-w-0"><div className="t-base font-medium">{title}</div><div className="t-sm text-[var(--text-3)]">{text}</div></div></div>
            ))}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

const REC_TONE: Record<NonNullable<Rec['tone']>, Tone> = { ok: 'ok', warn: 'warn', bad: 'bad' };
const recCols: Column<Rec & { n: number }>[] = [
  { key: 'n', header: '#', width: 36, mono: true, cell: (r) => <span className="text-[var(--text-3)]">{r.n}</span> },
  { key: 't', header: 'Record', truncate: 210, sort: (r) => r.title, cell: (r) => <span className="font-medium">{r.title}</span> },
  { key: 's', header: 'Detail', truncate: 270, cell: (r) => <span className="text-[var(--text-2)]">{r.sub ?? ''}</span> },
  { key: 'r', header: 'Value', align: 'right', mono: true, cell: (r) => (r.right ? (r.tone ? <Status tone={REC_TONE[r.tone]}><span className="font-medium">{r.right}</span></Status> : <span className="font-medium">{r.right}</span>) : '') },
];

function Bubble({ m, name, seed, open, onToggle }: { m: Msg; name: string; seed?: string; open: boolean; onToggle: () => void }) {
  if (m.who === 'you') return <div className="flex justify-end items-start gap-2.5"><div className="max-w-[85%] rounded-lg rounded-tr-[3px] bg-[var(--brand)] text-[var(--brand-contrast)] px-3 py-2 t-base">{m.text}</div><Avatar name={name} seed={seed} size={28} /></div>;
  const a = m.answer!; const topic = TOPICS.find((t) => t.id === a.topic);
  return (
    <div className="flex gap-2.5 items-start">
      <IconChip icon={Sparkles} color="var(--accent)" solid />
      <div className="min-w-0 flex-1 max-w-[860px] surface-flat overflow-hidden">
        <div className={cn('flex flex-wrap gap-x-5 gap-y-2 px-3.5 py-3', a.figure && 'items-center')}>
          {a.figure && (
            <div className="shrink-0 pr-5 border-r border-[var(--line)] max-sm:border-r-0 max-sm:pr-0 max-sm:w-full">
              <div className="num t-kpi">{a.figure.value}<span className="t-base font-medium text-[var(--text-3)]"> {a.figure.unit}</span></div>
              <div className="t-xs text-[var(--text-3)] mt-1 max-w-[220px]">{a.figure.caption}</div>
            </div>
          )}
          <div className="min-w-0 flex-1 basis-[280px]">
            <div className="t-base font-semibold leading-snug">{a.headline}</div>
            {a.detail && <div className="t-sm text-[var(--text-2)] mt-1">{a.detail}</div>}
          </div>
        </div>
        <div className="border-t border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {a.records.length > 0
            ? <button type="button" onClick={onToggle} aria-expanded={open} className="ctl-sm inline-flex items-center gap-1.5 px-1.5 rounded-md t-sm font-medium text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-[var(--text)]">{open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}{open ? 'Hide' : 'Show'} the records · {a.recordsLabel}</button>
            : <span className="ctl-sm inline-flex items-center px-1.5 t-sm text-[var(--text-3)]">No records to cite</span>}
          <span className="ml-auto inline-flex items-center gap-2 pr-1.5">{topic && <Badge tone="neutral">{topic.label}</Badge>}<span className="inline-flex items-center gap-1 t-xs text-[var(--text-3)]"><Lock className="size-3" />read-only</span></span>
        </div>
        {open && a.records.length > 0 && <div className="border-t border-[var(--line)]"><DataGrid bare dense rows={a.records.map((r, i) => ({ ...r, n: i + 1 }))} columns={recCols} rowKey={(r) => String(r.n)} maxHeight={264} /></div>}
      </div>
    </div>
  );
}
