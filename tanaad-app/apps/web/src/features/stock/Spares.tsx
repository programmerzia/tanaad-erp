import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, Cog, Lock, PackagePlus, ShoppingCart, Wallet, Wrench } from 'lucide-react';
import type { Part, PartIssue } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite } from '@/app/hooks';
import { Avatar, Badge, Button, Combobox, DataGrid, Empty, Field, KpiStrip, Meter, MiniBars, Note, NumberPad, PageHeader, Panel, PinPad, SearchInput, Sheet, Stat, Tabs, cn, useIsTouch, useMedia, type Column } from '@/components/ui';
import { CountUp } from '@/components/charts';
import { PersonPicker } from '@/components/PersonPicker';
import { addDays, lowStockParts, machinesOf } from '@/data/selectors';
import { compact, fmtDateTime, fmtDayShort, fmtNum, fmtUGX } from '@/data/format';
import { useBeep } from './shared';
import { KV, dayOf, matches, plural, useSearch } from './kit';

type Tab = 'parts' | 'log' | 'low';

/** Stock level against the minimum: the fill is the quantity on hand, the tick is the minimum. */
function Level({ part }: { part: Part }) {
  const max = Math.max(part.minLevel * 2, part.onHand, 1); const below = part.onHand < part.minLevel;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative w-[76px] h-1.5 rounded-[3px] bg-[var(--surface-3)] shrink-0" role="img" aria-label={`${part.onHand} on hand, minimum ${part.minLevel}`}>
        <span className="absolute inset-y-0 left-0 rounded-[3px]" style={{ width: `${(part.onHand / max) * 100}%`, background: below ? 'var(--bad)' : 'var(--series-1)' }} />
        <span className="absolute -top-[3px] -bottom-[3px] w-[2px] rounded-[1px] bg-[var(--text-2)]" style={{ left: `calc(${(part.minLevel / max) * 100}% - 1px)` }} />
      </span>
      <span className={cn('num font-semibold w-6 text-right', below && 'text-[var(--bad)]')}>{fmtNum(part.onHand)}</span>
      <span className="t-sm text-[var(--text-3)]">of {part.minLevel} min</span>
    </span>
  );
}
const levelBadge = (p: Part) => (p.onHand === 0 ? <Badge tone="bad" dot>Out of stock</Badge> : p.onHand < p.minLevel ? <Badge tone="bad" dot>Below minimum</Badge> : p.onHand === p.minLevel ? <Badge tone="warn" dot>At minimum</Badge> : <Badge tone="ok" dot>In stock</Badge>);

/** The locked spares store: part, quantity, machine, mechanic, PIN. Nothing leaves without all five. */
export function Spares() {
  const s = useStore(); const site = useSite(); const beep = useBeep(); const touch = useIsTouch();
  const issuePart = useStore((x) => x.issuePart); const receivePart = useStore((x) => x.receivePart); const toast = useStore((x) => x.toast);
  const [q, setQ] = useSearch(); const wide = useMedia('(min-width: 1280px)'); const phone = useMedia('(max-width: 639px)');
  const [tab, setTab] = useState<Tab>('parts');
  const parts = s.parts.filter((p) => p.siteId === site.id); const low = lowStockParts(s, site.id);
  const machines = machinesOf(s, site.id).filter((m) => m.status !== 'retired' && m.status !== 'arriving');
  // Mechanics who may draw parts here: the site's own maintenance crew, or the group mechanic who covers every plant.
  const crew = s.people.filter((p) => p.status === 'active' && p.sector === 'Maintenance' && (p.homeSiteId === site.id || p.sharedSites.includes(site.id)));
  const mechanics = s.people.filter((p) => p.status === 'active' && p.sector === 'Maintenance' && (p.homeSiteId === site.id || p.sharedSites.includes(site.id) || p.shared));
  const pickerSite = crew.length ? site.id : mechanics[0]?.homeSiteId ?? site.id;
  const partOf = (id: string) => s.parts.find((p) => p.id === id); const machineOf = (id: string) => s.machines.find((m) => m.id === id); const personOf = (id: string) => s.people.find((p) => p.id === id);
  const costOf = (i: PartIssue) => i.qty * (partOf(i.partId)?.unitCost ?? 0);
  const issues = s.partIssues.filter((i) => i.siteId === site.id).sort((a, b) => b.at.localeCompare(a.at));
  const realToday = new Date().toISOString().slice(0, 10);
  const issuesToday = issues.filter((i) => dayOf(i.at) === s.today || dayOf(i.at) === realToday);
  const valueOnHand = parts.reduce((t, p) => t + p.onHand * p.unitCost, 0);
  const week = Array.from({ length: 7 }, (_, k) => addDays(s.today, k - 6)).map((day) => { const list = day === s.today ? issuesToday : issues.filter((i) => dayOf(i.at) === day); return { day, n: list.length, cost: list.reduce((t, i) => t + costOf(i), 0) }; });
  const byMachine = (list: PartIssue[]) => [...list.reduce((m, i) => { const cur = m.get(i.machineId) ?? { qty: 0, cost: 0 }; m.set(i.machineId, { qty: cur.qty + i.qty, cost: cur.cost + costOf(i) }); return m; }, new Map<string, { qty: number; cost: number }>()).entries()].map(([mid, v]) => ({ id: mid, machine: machineOf(mid)?.code ?? mid, ...v })).sort((a, b) => b.cost - a.cost);
  const perMachine = byMachine(issues);
  const thisMonth = issues.filter((i) => i.at.slice(0, 7) === s.today.slice(0, 7) || i.at.slice(0, 7) === realToday.slice(0, 7)); const topMonth = byMachine(thisMonth)[0];
  // History for the KPI sparks: stock levels a few days back are today's level plus what has been issued since.
  const issuedAfter = (partId: string, day: string) => (day === s.today ? 0 : issues.filter((i) => i.partId === partId && dayOf(i.at) > day).reduce((t, i) => t + i.qty, 0));
  const hist = week.map(({ day }) => { const then = parts.map((p) => ({ p, onHand: p.onHand + issuedAfter(p.id, day) })); return { below: then.filter((x) => x.onHand < x.p.minLevel).length, value: then.reduce((t, x) => t + x.onHand * x.p.unitCost, 0) }; });
  const monthDays = Array.from({ length: parseInt(s.today.slice(8, 10), 10) }, (_, k) => `${s.today.slice(0, 8)}${String(k + 1).padStart(2, '0')}`);
  const topRun = topMonth ? monthDays.map((day) => thisMonth.filter((i) => i.machineId === topMonth.id && dayOf(i.at) <= day).reduce((t, i) => t + costOf(i), 0)) : [];
  const used30 = (partId: string) => issues.filter((i) => i.partId === partId && dayOf(i.at) >= addDays(s.today, -30)).reduce((t, i) => t + i.qty, 0);

  /* ---- issue form (one sheet) ---- */
  const [issueOpen, setIssueOpen] = useState(false);
  const [partId, setPartId] = useState<string | null>(null); const [qty, setQty] = useState(''); const [qtyDone, setQtyDone] = useState(false);
  const [machineId, setMachineId] = useState<string | null>(null); const [mechanicId, setMechanicId] = useState<string | null>(mechanics.length === 1 ? mechanics[0].id : null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string; part: string; qty: string; machine: string; mechanic: string; left: string; cost: number; below?: string } | null>(null);
  const form = useRef<HTMLDivElement>(null);
  const part = parts.find((p) => p.id === partId); const n = parseInt(qty || '0', 10);
  const complete = !!part && n > 0 && n <= part.onHand && !!machineId && !!mechanicId;
  const armed = complete && qtyDone;
  const focusField = (name: string) => setTimeout(() => form.current?.querySelector<HTMLElement>(`[data-f="${name}"] input, [data-f="${name}"] [tabindex]`)?.focus(), 30);
  const reset = () => { setPartId(null); setQty(''); setQtyDone(false); setMachineId(null); setPinError(null); setDone(null); setMechanicId(mechanics.length === 1 ? mechanics[0].id : null); };
  const openIssue = (preset?: string) => { reset(); if (preset) setPartId(preset); setIssueOpen(true); if (!touch) setTimeout(() => focusField(preset ? 'qty' : 'part'), 60); };
  const afterQty = () => { setQtyDone(true); if (!touch) focusField(!machineId ? 'machine' : !mechanicId ? 'mechanic' : 'pin'); };
  const submitPin = (pin: string) => {
    if (!part || !machineId || !mechanicId || n <= 0) return;
    const r = issuePart({ pin, siteId: site.id, partId: part.id, machineId, mechanicId, qty: n });
    if (!r.ok) { setPinError(r.message); beep('bad'); toast({ kind: 'error', title: r.message }); return; }
    const code = machineOf(machineId)?.code ?? '';
    setPinError(null); beep('ok'); toast({ kind: 'ok', title: r.message, detail: `For ${code}. ${part.onHand - n} ${part.unit} left.` });
    setDone({ message: r.message, part: part.name, qty: `${n} ${part.unit}`, machine: code, mechanic: personOf(mechanicId)?.fullName ?? '', left: `${part.onHand - n} ${part.unit}`, cost: n * part.unitCost, below: part.onHand - n < part.minLevel ? `${part.name} is now below its minimum (${part.onHand - n} of ${part.minLevel}). A reorder is flagged for the storekeeper.` : undefined });
  };
  useEffect(() => { if (done) document.querySelector<HTMLElement>('[data-again]')?.focus(); }, [done]);

  /* ---- receive form ---- */
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [rPart, setRPart] = useState<string | null>(null); const [rQty, setRQty] = useState('');
  const rForm = useRef<HTMLDivElement>(null);
  const rp = parts.find((x) => x.id === rPart);
  const receive = () => {
    const qn = parseInt(rQty || '0', 10); if (!rp || qn <= 0) return;
    receivePart(rp.id, qn); beep('ok'); toast({ kind: 'ok', title: `${rp.name} +${qn} ${rp.unit}`, detail: `${rp.onHand + qn} ${rp.unit} on hand.` }); setRQty('');
    if (!touch) setTimeout(() => rForm.current?.querySelector<HTMLElement>('[data-f="rpart"] input')?.focus(), 30);
  };
  const anySheet = issueOpen || receiveOpen;

  const shownParts = parts.filter((p) => matches(q, p.name, p.unit));
  const shownLow = low.filter((p) => matches(q, p.name));
  const shownIssues = issues.filter((i) => matches(q, partOf(i.partId)?.name, machineOf(i.machineId)?.code, personOf(i.mechanicId)?.fullName));
  const reorderQty = (p: Part) => Math.max(p.minLevel * 2 - p.onHand, 1);

  const partCols: Column<Part>[] = [
    { key: 'n', header: 'Part', sort: (p) => p.name, wrap: true, cell: (p) => <span><span className="font-medium">{p.name}</span><span className="t-sm text-[var(--text-3)] whitespace-nowrap"> · {p.unit}</span></span> },
    { key: 'l', header: 'On hand vs minimum', sort: (p) => p.onHand / Math.max(1, p.minLevel), cell: (p) => <Level part={p} /> },
    { key: 's', header: 'Status', sort: (p) => p.onHand - p.minLevel, cell: levelBadge },
    { key: 'u', header: 'Used, 30 d', align: 'right', mono: true, sort: (p) => used30(p.id), cell: (p) => (used30(p.id) ? fmtNum(used30(p.id)) : <span className="text-[var(--text-4)]">—</span>) },
    { key: 'c', header: 'Unit cost', align: 'right', mono: true, sort: (p) => p.unitCost, cell: (p) => <span className="text-[var(--text-2)]">{fmtNum(p.unitCost)}</span> },
    { key: 'v', header: 'Value, UGX', align: 'right', mono: true, sort: (p) => p.onHand * p.unitCost, cell: (p) => <span className="font-medium">{fmtNum(p.onHand * p.unitCost)}</span> },
  ];
  const lowCols: Column<Part>[] = [
    partCols[0], partCols[1],
    { key: 'sh', header: 'Short by', align: 'right', mono: true, sort: (p) => p.minLevel - p.onHand, cell: (p) => <span className="text-[var(--bad)] font-medium">{p.minLevel - p.onHand} {p.unit}</span> },
    { key: 'o', header: 'Order', align: 'right', mono: true, cell: (p) => `${reorderQty(p)} ${p.unit}` },
    { key: 'oc', header: 'Cost, UGX', align: 'right', mono: true, sort: (p) => reorderQty(p) * p.unitCost, cell: (p) => fmtNum(reorderQty(p) * p.unitCost) },
    { key: 'a', header: '', align: 'right', cell: (p) => <Button size="sm" icon={ShoppingCart} onClick={() => toast({ kind: 'ok', title: 'Purchase request sent', detail: `${p.name} · ${reorderQty(p)} ${p.unit} · ${fmtUGX(reorderQty(p) * p.unitCost)}` })}>Reorder</Button> },
  ];
  const logCols: Column<PartIssue>[] = [
    { key: 'at', header: 'When', sort: (i) => i.at, cell: (i) => <span className="num text-[var(--text-2)]">{fmtDateTime(i.at)}</span> },
    { key: 'p', header: 'Part', sort: (i) => partOf(i.partId)?.name ?? '', cell: (i) => <span className="font-medium">{partOf(i.partId)?.name ?? '—'}</span> },
    { key: 'q', header: 'Qty', align: 'right', mono: true, sort: (i) => i.qty, cell: (i) => i.qty },
    { key: 'm', header: 'Machine', sort: (i) => machineOf(i.machineId)?.code ?? '', cell: (i) => machineOf(i.machineId)?.code ?? '—' },
    { key: 'who', header: 'Mechanic', cell: (i) => { const p = personOf(i.mechanicId); return p ? <span className="inline-flex items-center gap-1.5"><Avatar name={p.fullName} seed={p.avatarSeed} size={20} />{p.fullName}</span> : '—'; } },
    { key: 'c', header: 'Cost, UGX', align: 'right', mono: true, sort: costOf, cell: (i) => fmtNum(costOf(i)) },
  ];

  return (
    <div>
      <PageHeader eyebrow={`${site.name} · Maintenance`} title="Spares store" meta={<><Badge tone="neutral"><Lock className="size-3" />Locked · PIN to issue</Badge>{low.length > 0 && <Badge tone="bad" dot>{plural(low.length, 'part')} below minimum</Badge>}</>}
        subtitle="A part leaves only against a machine, a mechanic and a PIN."
        actions={<><Button icon={PackagePlus} hotkey={anySheet ? undefined : 'r'} hotkeyLabel="Receive parts" onClick={() => { setRQty(''); setReceiveOpen(true); }}>Receive parts</Button><Button variant="primary" icon={Wrench} hotkey={anySheet ? undefined : 'n'} hotkeyLabel="Issue part" onClick={() => openIssue()}>Issue part</Button></>} />

      <div className="flex flex-col gap-[var(--gap)]">
      <KpiStrip className="md:grid-cols-4!">
        <Stat label="Parts below minimum" icon={AlertTriangle} tone={low.length ? 'bad' : 'neutral'} accent={low.length ? undefined : 'var(--series-3)'} value={<CountUp value={low.length} />} spark={hist.map((d) => d.below)} sparkColor={low.length ? 'var(--bad)' : 'var(--series-3)'} sub={low.length ? `${low[0].name}${low.length > 1 ? ` and ${low.length - 1} more` : ''}` : 'Every part is above its minimum'} onClick={() => setTab('low')} />
        <Stat label="Issued today" icon={Wrench} accent="var(--series-1)" value={<CountUp value={issuesToday.length} />} spark={week.map((d) => d.n)} sub={issuesToday.length ? `${fmtUGX(issuesToday.reduce((t, i) => t + costOf(i), 0))} of parts` : 'Nothing has left the store today'} onClick={() => setTab('log')} />
        <Stat label="Value on hand" icon={Wallet} accent="var(--series-4)" value={<CountUp value={valueOnHand} format={compact} />} spark={hist.map((d) => d.value)} sub={`UGX · ${plural(parts.length, 'part line')} · ${fmtNum(parts.reduce((t, p) => t + p.onHand, 0))} units`} />
        <Stat label="Costliest machine this month" icon={Cog} accent="var(--series-2)" value={topMonth?.machine ?? '—'} spark={topRun} sub={topMonth ? `${fmtUGX(topMonth.cost)} · ${plural(topMonth.qty, 'part')} issued` : 'No part issued this month'} onClick={topMonth ? () => { setTab('log'); setQ(topMonth.machine); } : undefined} />
      </KpiStrip>

      <div className="grid gap-[var(--gap)] xl:grid-cols-[minmax(0,1fr)_350px] items-start">
        <Panel pad={false} className="min-w-0">
          <div className="px-[var(--pad)] border-b border-[var(--line)]">
            <Tabs variant="underline" value={tab} onChange={setTab} tabs={[{ value: 'parts', label: 'Parts', count: parts.length }, { value: 'log', label: 'Issues log', count: issues.length }, { value: 'low', label: 'Low stock and reorder', count: low.length }]} />
          </div>
          <div className="flex flex-wrap items-center gap-2 px-[var(--pad)] py-2 border-b border-[var(--line)]">
            <SearchInput value={q} onChange={setQ} placeholder={tab === 'log' ? 'Search part, machine or mechanic' : 'Search part'} />
            <span className="t-sm text-[var(--text-3)] ml-auto num">{tab === 'parts' ? `${shownParts.length} of ${parts.length} parts` : tab === 'log' ? `${shownIssues.length} of ${plural(issues.length, 'issue')}` : `${plural(shownLow.length, 'part')} to reorder`}</span>
          </div>
          {tab === 'parts' && (parts.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={Wrench} title="No parts configured" /></div> : (
            <DataGrid bare rows={shownParts} columns={wide ? partCols : partCols.filter((c) => (phone ? ['n', 'l'] : ['n', 'l', 's', 'v']).includes(c.key))} rowKey={(p) => p.id} onRowClick={(p) => openIssue(p.id)} selectedKey={issueOpen ? partId : null} maxHeight={520} empty="No part matches the search."
              rowClassName={(p) => (p.onHand < p.minLevel ? 'bg-[color-mix(in_srgb,var(--bad)_4%,transparent)]' : undefined)}
              footer={wide ? <tr><td colSpan={3} className="t-sm font-normal text-[var(--text-3)]">Select a row, or press Enter on it, to issue that part.</td><td className="text-right num">{fmtNum(shownParts.reduce((t, p) => t + used30(p.id), 0))}</td><td className="text-right font-normal text-[var(--text-3)]">Total</td><td className="text-right num">{fmtNum(shownParts.reduce((t, p) => t + p.onHand * p.unitCost, 0))}</td></tr>
                : <tr><td colSpan={phone ? 1 : 3} className="t-sm font-normal text-[var(--text-3)]">Select a row to issue that part.</td><td className="text-right num">{phone ? `UGX ${compact(shownParts.reduce((t, p) => t + p.onHand * p.unitCost, 0))}` : fmtNum(shownParts.reduce((t, p) => t + p.onHand * p.unitCost, 0))}</td></tr>} />
          ))}
          {tab === 'log' && (issues.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={Wrench} title="No parts issued yet" hint="Every part that leaves the store is listed here with its machine and mechanic." /></div> : (
            <DataGrid bare dense rows={shownIssues} columns={logCols} rowKey={(i) => i.id} maxHeight={520} empty="No issue matches the search."
              footer={<tr><td colSpan={2}>Total</td><td className="text-right num">{fmtNum(shownIssues.reduce((t, i) => t + i.qty, 0))}</td><td colSpan={2} /><td className="text-right num">{fmtNum(shownIssues.reduce((t, i) => t + costOf(i), 0))}</td></tr>} />
          ))}
          {tab === 'low' && (low.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={CheckCircle2} title="Everything is above its minimum level" hint="A part shows up here the moment an issue takes it below minimum." /></div> : (
            <DataGrid bare rows={shownLow} columns={lowCols} rowKey={(p) => p.id} maxHeight={520} empty="No low part matches the search."
              footer={<tr><td colSpan={4} className="t-sm font-normal text-[var(--text-3)]">The suggested order brings each part back to twice its minimum.</td><td className="text-right num">{fmtNum(shownLow.reduce((t, p) => t + reorderQty(p) * p.unitCost, 0))}</td><td /></tr>} />
          ))}
        </Panel>

        <div className="grid gap-[var(--gap)] items-start md:grid-cols-2 xl:grid-cols-1 min-w-0">
          <Panel icon={Cog} title="Spares cost per machine" sub="UGX · all time">
            {perMachine.length === 0 ? <Empty icon={Cog} title="No issues yet" hint="Costs land on the machine as parts are issued." />
              : perMachine.slice(0, 8).map((r) => <Meter key={r.id} label={r.machine} sub={plural(r.qty, 'part')} value={r.cost} max={perMachine[0].cost} display={fmtNum(r.cost)} />)}
            {perMachine.length > 8 && <div className="t-xs text-[var(--text-3)] mt-1">and {perMachine.length - 8} more machines · {fmtUGX(perMachine.slice(8).reduce((t, r) => t + r.cost, 0))}</div>}
          </Panel>
          <Panel icon={BarChart3} title="Parts issued per day" sub="UGX · last 7 days">
            <MiniBars height={84} data={week.map((d) => ({ label: fmtDayShort(d.day), value: d.cost, partial: d.day === s.today }))} format={(v) => fmtUGX(v)} />
          </Panel>
        </div>
      </div>

      </div>

      {/* Issue: one form, five fields, the PIN last */}
      <Sheet open={issueOpen} onClose={() => setIssueOpen(false)} width={480} title="Issue part" sub="Nothing leaves without all five fields"
        footer={done ? <><Button onClick={() => setIssueOpen(false)}>Close</Button><Button data-again="" variant="primary" icon={Wrench} hotkey="mod+enter" hotkeyLabel="Issue another part" onClick={() => openIssue()}>Issue another part</Button></>
          : <><span className="t-sm text-[var(--text-3)] mr-auto">{complete ? `${part!.name} ×${n} for ${machineOf(machineId!)?.code}` : 'Fill in the four fields, then the PIN'}</span><Button variant="primary" icon={Lock} hotkey="mod+enter" hotkeyLabel="Confirm with PIN" disabled={!complete} onClick={() => { setQtyDone(true); focusField('pin'); }}>Confirm with PIN</Button></>}>
        <div ref={form}>
          {done ? (
            <div className="anim-pop">
              <div className="flex items-center gap-3 mb-3"><span className="size-9 rounded-lg grid place-items-center shrink-0 bg-[var(--ok-bg)] text-[var(--ok)]"><CheckCircle2 className="size-5" /></span><div className="min-w-0"><div className="t-lg font-semibold">{done.message}</div><div className="t-sm text-[var(--text-2)]">Logged against {done.machine} by {done.mechanic}. The door can open.</div></div></div>
              <KV label="Part">{done.part}</KV>
              <KV label="Quantity">{done.qty}</KV>
              <KV label="Machine">{done.machine}</KV>
              <KV label="Mechanic">{done.mechanic}</KV>
              <KV label="Cost booked to the machine">{fmtUGX(done.cost)}</KV>
              <KV label="Left on hand">{done.left}</KV>
              {done.below && <Note tone="warn" className="mt-3">{done.below}</Note>}
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              <Field label="1 · Part" required><div data-f="part">
                <Combobox value={partId} onChange={(v) => { setPartId(v); setPinError(null); if (v && !touch) focusField('qty'); }} placeholder="Search part by name" emptyText="No part with that name"
                  options={parts.map((p) => ({ value: p.id, label: p.name, sub: `${p.onHand} ${p.unit} on hand`, disabled: p.onHand === 0, right: p.onHand < p.minLevel ? <Badge tone="bad">low</Badge> : undefined }))} />
              </div></Field>
              <div data-f="qty" onBlur={() => { if (qty) setQtyDone(true); }}>
                <NumberPad value={qty} onChange={setQty} onDone={afterQty} doneLabel="Next" label={<>2 · Quantity<span className="text-[var(--bad)]"> *</span>{part && <span className="font-normal text-[var(--text-3)]"> · {part.onHand} {part.unit} on hand, minimum {part.minLevel}</span>}</>} suffix={part?.unit} max={999} />
                {part && n > part.onHand && <Note tone="bad" className="mt-2">Only {part.onHand} {part.unit} on hand.</Note>}
                {part && n > 0 && n <= part.onHand && part.onHand - n < part.minLevel && <Note tone="warn" className="mt-2">This takes {part.name} to {part.onHand - n}, below its minimum of {part.minLevel}. A reorder will be flagged.</Note>}
              </div>
              <Field label="3 · Machine" required><div data-f="machine">
                <Combobox value={machineId} onChange={(v) => { setMachineId(v); if (v && !mechanicId && !touch) focusField('mechanic'); }} placeholder="Search machine" emptyText="No machine with that name"
                  options={machines.map((m) => ({ value: m.id, label: m.code, sub: m.kind, right: m.status === 'down' ? <Badge tone="bad" dot>down</Badge> : undefined }))} />
              </div></Field>
              <Field label="4 · Mechanic" required hint={crew.length === 0 && mechanics.length > 0 ? 'No maintenance crew of its own here: the group mechanic draws the parts.' : undefined}><div data-f="mechanic">
                <PersonPicker siteId={pickerSite} sector="Maintenance" value={mechanicId} onChange={(v) => setMechanicId(v)} placeholder="Search mechanic by name" />
              </div></Field>
              <div data-f="pin" className={cn('rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-3', !armed && 'opacity-60')}>
                <div className="t-sm font-medium text-[var(--text-2)] mb-2 flex items-center gap-1.5"><Lock className="size-3.5" />5 · Mechanic PIN</div>
                {armed ? <PinPad onSubmit={submitPin} title={`Enter PIN to unlock ${part!.name} ×${n}`} error={pinError} />
                  : <div className="t-sm text-[var(--text-3)] text-center py-3">{complete ? 'Press Enter in the quantity field, or Confirm with PIN.' : 'Finish fields 1 to 4 first. The PIN pad unlocks when they are complete.'}</div>}
              </div>
            </div>
          )}
        </div>
      </Sheet>

      <Sheet open={receiveOpen} onClose={() => setReceiveOpen(false)} width={440} title="Receive parts" sub="Book a delivery into the locked store"
        footer={<><Button onClick={() => setReceiveOpen(false)}>Close</Button><Button variant="primary" icon={PackagePlus} hotkey="mod+enter" hotkeyLabel="Book in" disabled={!rp || !rQty || parseInt(rQty, 10) <= 0} onClick={receive}>Book in</Button></>}>
        <div ref={rForm} className="flex flex-col gap-3.5">
          <Field label="Part" required><div data-f="rpart">
            <Combobox autoFocus={!touch} value={rPart} onChange={(v) => { setRPart(v); if (v && !touch) setTimeout(() => rForm.current?.querySelector<HTMLElement>('[data-f="rqty"] input')?.focus(), 30); }} placeholder="Search part by name"
              options={parts.map((p) => ({ value: p.id, label: p.name, sub: `${p.onHand} ${p.unit} on hand`, right: p.onHand < p.minLevel ? <Badge tone="bad">low</Badge> : undefined }))} />
          </div></Field>
          <div data-f="rqty"><NumberPad value={rQty} onChange={setRQty} onDone={receive} doneLabel="Book in" label="Quantity received" suffix={rp?.unit} max={9999} /></div>
          {rp && (
            <div className="rounded-lg border border-[var(--line)] px-3 py-2.5">
              <div className="t-label mb-1.5">{rp.name}</div>
              <div className="flex items-center justify-between gap-3"><Level part={rp} />{levelBadge(rp)}</div>
              {rQty && parseInt(rQty, 10) > 0 && <div className="t-sm text-[var(--text-2)] mt-2">After booking in: <span className="num font-medium text-[var(--text)]">{rp.onHand + parseInt(rQty, 10)} {rp.unit}</span> on hand · {fmtUGX(parseInt(rQty, 10) * rp.unitCost)} at unit cost</div>}
            </div>
          )}
        </div>
      </Sheet>
    </div>
  );
}
