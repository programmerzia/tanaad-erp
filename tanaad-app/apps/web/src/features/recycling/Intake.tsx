import { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, BarChart3, Camera, CheckCircle2, ClipboardList, MessageCircle, Receipt, Scale, UserPlus, Wallet, X } from 'lucide-react';
import type { CollectorDelivery } from '@tanaad/domain';
import { intakeNet } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useGo, useRefList } from '@/app/hooks';
import { intakeToday, lastWorkingDays } from '@/data/selectors';
import { Avatar, Badge, Button, ChipGroup, Combobox, DataGrid, Empty, FormRow, IconButton, Input, Kbd, Note, NumberPad, PageHeader, Panel, Sheet, Stat, cn, useHotkey, type Column, type ComboOption } from '@/components/ui';
import { ColumnChart, CountUp } from '@/components/charts';
import { ScaleWidget } from '@/components/ScaleWidget';
import { QR } from '@/components/Sticker';
import { WhatsAppPreview } from '@/components/WhatsAppPreview';
import { messaging } from '@/devices';
import { compact, fmtDayLong, fmtDayShort, fmtKg, fmtNum, fmtUGX } from '@/data/format';
import { amountOf, Calc, FormSection, ScaleBay, SettingsEmpty, useFirstField, useScaleKey, useScaleTitle, useShift, voucherNo, WIDE, Workbench } from './kit';
import { fmtTime } from './kit';

const kg1 = (n: number) => n.toLocaleString('en-UG', { maximumFractionDigits: 1 });
const NEW = '__new'; const CUSTOM = '__custom';
/** Demo scale only: a plausible lorry or sack load for the simulated reading. */
const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

/** The voucher as the collector will hold it: number, who, when, the weights, the sum. Shown as a draft while the lorry is on the scale. */
function VoucherDoc({ issuer, no, collector, when, gross, tare, dedPct, net, price, amount, status, photo }: { issuer: string; no: string; collector: string; when: string; gross: number; tare: number; dedPct: number; net: number; price: number; amount: number; status: 'draft' | 'unpaid' | 'paid'; photo: boolean }) {
  const dedKg = Math.max(0, Math.round((Math.max(0, gross - tare) - net) * 10) / 10);
  const line = 'flex items-baseline justify-between gap-3 h-6 t-base';
  return (
    <div className="rounded-lg border border-[var(--line-2)] bg-[var(--surface)] overflow-hidden">
      <div className="px-3.5 pt-3 pb-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="t-label truncate">{issuer}</div>
          <div className="t-lg font-semibold">Weigh-in voucher</div>
          <div className="code t-sm text-[var(--text-2)] mt-0.5">{no}</div>
        </div>
        {status === 'draft'
          ? <div className="size-[60px] rounded-md border border-dashed border-[var(--line-2)] grid place-items-center text-center t-xs text-[var(--text-3)] leading-tight shrink-0">Code on issue</div>
          : <div className="p-1 rounded-sm bg-white shrink-0"><QR value={no} size={52} /></div>}
      </div>
      <div className="px-3.5 py-2 border-t border-dashed border-[var(--line-2)] flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="t-xs text-[var(--text-3)]">Collector</div><div className="t-base font-semibold truncate">{collector || <span className="font-normal text-[var(--text-4)]">Not selected</span>}</div></div>
        <div className="text-right shrink-0"><div className="t-xs text-[var(--text-3)]">Weighed</div><div className="t-base num">{when}</div></div>
      </div>
      <div className="px-3.5 py-2 border-t border-dashed border-[var(--line-2)]">
        <div className={line}><span className="text-[var(--text-2)]">Gross on the scale</span><span className="num">{fmtKg(gross)}</span></div>
        <div className={line}><span className="text-[var(--text-2)]">Tare</span><span className="num">− {fmtKg(tare)}</span></div>
        <div className={line}><span className="text-[var(--text-2)]">Deduction {dedPct}%</span><span className="num">− {fmtKg(dedKg)}</span></div>
        <div className={cn(line, 'border-t border-[var(--line)] mt-1 pt-1 h-7 font-semibold')}><span>Net weight</span><span className="num">{fmtKg(net)}</span></div>
        <div className={line}><span className="text-[var(--text-2)]">Price</span><span className="num">× {fmtUGX(price)} per kg</span></div>
      </div>
      <div className="px-3.5 py-2.5 border-t border-[var(--line-2)] bg-[var(--surface-2)] flex items-end justify-between gap-3">
        <div className="min-w-0"><div className="t-label">Amount payable</div><div className="t-xs text-[var(--text-3)] flex items-center gap-1">{photo && <Camera className="size-3 shrink-0" />}{status === 'paid' ? 'Paid in cash' : status === 'unpaid' ? 'Payable at the plant office' : 'Not issued yet'}{photo ? ' · scale photo on file' : ''}</div></div>
        <div className="num t-kpi whitespace-nowrap">{fmtUGX(amount)}</div>
      </div>
    </div>
  );
}

/** R1 · Collector intake and weigh-in: gross, tare, deduction, net, price, voucher. The deduction rule is the client's to confirm. */
export function Intake() {
  const s = useStore(); const go = useGo(); const { today, site } = useShift();
  const collectors = useMemo(() => [...new Set(s.collectorDeliveries.map((d) => d.collector))].sort(), [s.collectorDeliveries]);
  const [collector, setCollector] = useState<string | null>(null); const [newName, setNewName] = useState(''); const [adding, setAdding] = useState(false);
  const [gross, setGross] = useState<number | null>(null); const [target, setTarget] = useState(() => rnd(600, 2400)); const [round, setRound] = useState(0);
  const dedOptions = useRefList('deduction_option'); const priceOptions = useRefList('price_option');
  const [tare, setTare] = useState('');
  const [dedId, setDedId] = useState<string | null>(null); const [customOn, setCustomOn] = useState(false); const [custom, setCustom] = useState(''); const [priceId, setPriceId] = useState<string | null>(null); const [photo, setPhoto] = useState(false);
  // The first option of each list (the order set in Settings) is the starting choice; a known collector starts from the terms of their last delivery.
  useEffect(() => { if (!dedOptions.some((o) => o.id === dedId)) setDedId(dedOptions[0]?.id ?? null); }, [dedOptions, dedId]);
  useEffect(() => { if (!priceOptions.some((o) => o.id === priceId)) setPriceId(priceOptions[0]?.id ?? null); }, [priceOptions, priceId]);
  const deduction = dedOptions.find((o) => o.id === dedId)?.value ?? 0; const price = priceOptions.find((o) => o.id === priceId)?.value ?? 0;
  const [voucher, setVoucher] = useState<CollectorDelivery | null>(null); const [share, setShare] = useState(false); const [sentId, setSentId] = useState<string | null>(null);
  const [formRef, focusFirst] = useFirstField<HTMLDivElement>(); const scaleRef = useRef<HTMLDivElement>(null);
  useScaleKey(scaleRef); const scaleTitle = useScaleTitle('Intake scale');

  const dedPct = customOn ? parseFloat(custom) || 0 : deduction; const tareKg = parseFloat(tare || '0') || 0;
  const live = intakeNet({ grossKg: gross ?? 0, tareKg, deductionPct: dedPct, pricePerKg: price });
  const clean = Math.max(0, (gross ?? 0) - tareKg); const dedKg = Math.max(0, Math.round((clean - live.netKg) * 10) / 10);
  const who = adding ? newName.trim() : collector;
  const ready = !!who && !!gross && gross > tareKg && price > 0 && photo;
  const missing = [!who && 'a collector', !gross && 'the gross weight', !!gross && gross <= tareKg && 'a gross above the tare', price <= 0 && 'a price per kg', !photo && 'the scale photo'].filter((x): x is string => !!x);
  const todays = intakeToday(s, today).sort((a, b) => b.at.localeCompare(a.at)); const unpaid = s.collectorDeliveries.filter((d) => !d.paid).sort((a, b) => a.at.localeCompare(b.at));
  const current = voucher ? s.collectorDeliveries.find((d) => d.id === voucher.id) ?? voucher : null;
  const days = lastWorkingDays('recycling', today, 10); const netByDay = days.map((d) => Math.round(s.collectorDeliveries.filter((x) => x.day === d).reduce((t, x) => t + x.netKg, 0)));
  const todayNet = todays.reduce((t, d) => t + d.netKg, 0); const todayAmount = todays.reduce((t, d) => t + amountOf(d), 0); const unpaidTotal = unpaid.reduce((t, d) => t + amountOf(d), 0);
  const history = collector && !adding ? s.collectorDeliveries.filter((d) => d.collector === collector) : [];
  const draftNo = `RV-${today.slice(2).replace(/-/g, '')}-${String(todays.length + 1).padStart(2, '0')}`;
  const no = (d: CollectorDelivery) => voucherNo(d, s.collectorDeliveries);

  const options = useMemo<ComboOption<string>[]>(() => [
    ...collectors.map((c) => { const n = s.collectorDeliveries.filter((d) => d.collector === c).length; return { value: c, label: c, sub: `${n} deliver${n === 1 ? 'y' : 'ies'}`, left: <Avatar name={c} size={18} /> }; }),
    { value: NEW, label: 'New collector…', left: <UserPlus className="size-4 text-[var(--text-3)]" />, words: 'add new' },
  ], [collectors, s.collectorDeliveries]);
  const pickCollector = (v: string | null) => {
    setVoucher(null); if (v === NEW) { setAdding(true); setCollector(null); return; }
    setAdding(false); setCollector(v);
    const lastOne = v ? s.collectorDeliveries.filter((d) => d.collector === v).sort((a, b) => b.at.localeCompare(a.at))[0] : undefined;
    if (lastOne) { const d = dedOptions.find((o) => o.value === lastOne.deductionPct); if (d) { setDedId(d.id); setCustomOn(false); setCustom(''); } const p = priceOptions.find((o) => o.value === lastOne.pricePerKg); if (p) setPriceId(p.id); setTare(String(lastOne.tareKg)); }
  };

  const weighIn = () => {
    if (!ready || !who || !gross) return;
    const rec = s.recordIntake({ collector: who, grossKg: gross, tareKg, deductionPct: dedPct, pricePerKg: price, day: today, hasScalePhoto: true });
    setVoucher(rec); useStore.getState().toast({ kind: 'ok', title: `Voucher ${voucherNo(rec, useStore.getState().collectorDeliveries)} issued`, detail: `${who} · ${fmtKg(rec.netKg)} net · ${fmtUGX(amountOf(rec))}` });
    setGross(null); setPhoto(false); setCustom(''); setCustomOn(false); setTarget(rnd(600, 2400)); setRound((r) => r + 1); if (adding) { setCollector(who); setAdding(false); setNewName(''); }
    focusFirst();
  };
  const pay = (d: CollectorDelivery) => { s.payCollector(d.id); useStore.getState().toast({ kind: 'ok', title: `${fmtUGX(amountOf(d))} paid to ${d.collector}`, detail: 'Posted to today’s cash book as materials' }); };
  const send = async (d: CollectorDelivery) => { await messaging.sendWhatsApp(d.collector, `Voucher ${no(d)}`); setSentId(d.id); useStore.getState().toast({ kind: 'ok', title: 'Voucher shared on WhatsApp', detail: d.collector }); };
  const voucherLines = (d: CollectorDelivery) => [`${site.legalName} · Voucher ${no(d)}`, `${d.collector} · ${fmtDayLong(d.day)} ${fmtTime(d.at)}`, `Gross ${fmtKg(d.grossKg)} − tare ${fmtKg(d.tareKg)} − ${d.deductionPct}% = net ${fmtKg(d.netKg)}`, `${fmtKg(d.netKg)} × ${fmtUGX(d.pricePerKg)} = ${fmtUGX(amountOf(d))}`, d.paid ? 'Paid in cash.' : 'Payable at the plant office.'];
  useHotkey('c', () => setPhoto((p) => !p), { label: 'Capture the scale photo' });

  const cols: Column<CollectorDelivery>[] = [
    { key: 't', header: 'Time', mono: true, sort: (d) => d.at, cell: (d) => fmtTime(d.at) },
    { key: 'v', header: 'Voucher', cell: (d) => <span className="code font-medium">{no(d)}</span> },
    { key: 'c', header: 'Collector', truncate: 240, sort: (d) => d.collector, cell: (d) => <span className="inline-flex items-center gap-1.5"><Avatar name={d.collector} size={20} />{d.collector}</span> },
    { key: 'g', header: 'Gross kg', align: 'right', mono: true, sort: (d) => d.grossKg, cell: (d) => fmtNum(d.grossKg) },
    { key: 'ta', header: 'Tare', align: 'right', mono: true, cell: (d) => fmtNum(d.tareKg) },
    { key: 'd', header: 'Deduction', align: 'right', mono: true, sort: (d) => d.deductionPct, cell: (d) => `${d.deductionPct}%` },
    { key: 'n', header: 'Net kg', align: 'right', mono: true, sort: (d) => d.netKg, cell: (d) => <span className="font-medium">{fmtNum(d.netKg)}</span> },
    { key: 'pr', header: 'UGX / kg', align: 'right', mono: true, cell: (d) => fmtNum(d.pricePerKg) },
    { key: 'a', header: 'Amount UGX', align: 'right', mono: true, sort: (d) => amountOf(d), cell: (d) => <span className="font-medium">{fmtNum(amountOf(d))}</span> },
    { key: 'p', header: 'Status', sort: (d) => (d.paid ? 1 : 0), cell: (d) => <Badge tone={d.paid ? 'ok' : 'warn'} dot>{d.paid ? 'Paid' : 'Unpaid'}</Badge> },
  ];

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <div className="-mb-[var(--gap)]">
        <PageHeader eyebrow={`${site.name} · Intake`} title="Collector intake" meta={<Badge tone="neutral" dot>{todays.length} deliver{todays.length === 1 ? 'y' : 'ies'} today</Badge>}
          subtitle="Gross on the scale, tare and deduction by rule, net and amount by arithmetic. One voucher per delivery."
          actions={<Button variant="ghost" icon={ClipboardList} className="max-sm:hidden" onClick={() => go.site('production/collectors')}>Collector ledger</Button>} />
      </div>
      {site.toBeConfirmed && <Note tone="warn">{site.toBeConfirmed}</Note>}

      <Workbench asideWidth={420} aside={<>
        <Panel className={WIDE} icon={Receipt} title={current ? 'Voucher' : 'Voucher preview'} sub={current ? 'issued' : 'updates as you weigh'}
          actions={<><Badge tone={current ? (current.paid ? 'ok' : 'warn') : 'neutral'} dot={!!current}>{current ? (current.paid ? 'Paid' : 'Unpaid') : 'Draft'}</Badge>{current && <IconButton icon={X} label="Back to the draft" onClick={() => setVoucher(null)} />}</>}
          footer={<div className="grid grid-cols-2 gap-2"><Button variant="primary" icon={Banknote} disabled={!current || current.paid} onClick={() => current && pay(current)} hotkey="y" hotkeyLabel="Pay the voucher in cash">{current?.paid ? 'Paid' : 'Pay now (cash)'}</Button><Button icon={MessageCircle} disabled={!current} onClick={() => setShare(true)} hotkey="s" hotkeyLabel="Share the voucher on WhatsApp">Share on WhatsApp</Button></div>}>
          {current
            ? <VoucherDoc issuer={site.legalName} no={no(current)} collector={current.collector} when={`${fmtDayShort(current.day)} · ${fmtTime(current.at)}`} gross={current.grossKg} tare={current.tareKg} dedPct={current.deductionPct} net={current.netKg} price={current.pricePerKg} amount={amountOf(current)} status={current.paid ? 'paid' : 'unpaid'} photo={current.hasScalePhoto} />
            : <VoucherDoc issuer={site.legalName} no={draftNo} collector={who ?? ''} when={fmtDayShort(today)} gross={gross ?? 0} tare={tareKg} dedPct={dedPct} net={live.netKg} price={price} amount={live.amount} status="draft" photo={photo} />}
        </Panel>
        <div className={`grid grid-cols-2 gap-[var(--gap)] ${WIDE}`}>
          <Stat label="Net kg today" icon={Scale} accent="var(--series-5)" value={<CountUp value={Math.round(todayNet)} />} spark={netByDay.slice(0, -1)} sparkColor="var(--series-5)" sub={`${todays.length} deliver${todays.length === 1 ? 'y' : 'ies'}`} />
          <Stat label="Payable today" icon={Wallet} accent="var(--series-2)" value={<CountUp value={todayAmount} format={compact} />} sub={`UGX · ${todays.filter((d) => !d.paid).length} unpaid`} />
        </div>
        <Panel className={WIDE} icon={Banknote} title="Unpaid vouchers" sub={unpaid.length ? `${unpaid.length} · ${fmtUGX(unpaidTotal)}` : undefined} pad={unpaid.length === 0} actions={<Button size="sm" variant="ghost" onClick={() => go.site('production/collectors')}>Ledger</Button>}>
          {unpaid.length === 0 ? <Empty icon={CheckCircle2} title="Every collector has been paid" /> : unpaid.slice(0, 6).map((d) => (
            <div key={d.id} className={cn('flex items-center gap-2.5 px-[var(--pad)] py-1.5 row-h border-b border-[var(--line)] last:border-b-0', current?.id === d.id && 'bg-[var(--selected)]')}>
              <Avatar name={d.collector} size={24} />
              <button type="button" onClick={() => setVoucher(d)} className="min-w-0 flex-1 text-left"><span className="block t-base font-medium truncate">{d.collector}</span><span className="block t-sm text-[var(--text-3)] truncate"><span className="code">{no(d)}</span> · {fmtKg(d.netKg)} net</span></button>
              <span className="num t-base font-medium whitespace-nowrap">{fmtNum(amountOf(d))}</span>
              <Button size="sm" variant="secondary" onClick={() => pay(d)}>Pay</Button>
            </div>
          ))}
        </Panel>
        <Panel className={WIDE} icon={BarChart3} title="Net kg received" sub="per day · last 10 working days">
          <ColumnChart height={150} data={days.map((d, i) => ({ label: fmtDayShort(d), values: [netByDay[i]], partial: d === today }))} />
        </Panel>
      </>}>
        <Panel icon={Scale} title="Weigh in" sub={`gate scale · ${fmtDayShort(today)}`} pad={false}
          footer={<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><span className="min-w-0 truncate">{missing.length ? `Still needed: ${missing.join(', ')}.` : <span className="text-[var(--text)]">{who} · <span className="num">{fmtKg(live.netKg)}</span> net · <span className="num font-medium">{fmtUGX(live.amount)}</span></span>}</span><Button variant="primary" icon={Receipt} disabled={!ready} onClick={weighIn} hotkey="mod+enter" hotkeyLabel="Weigh in and issue the voucher">Weigh in and issue voucher</Button></div>}>
          <div ref={formRef}>
            <FormSection n={1} done={!!who} title="Collector" hint={history.length ? `${history.length} deliveries on record · average deduction ${(history.reduce((t, d) => t + d.deductionPct, 0) / history.length).toFixed(1)}%` : adding ? 'first delivery' : undefined}>
              <div className="grid gap-2 sm:grid-cols-2 max-w-[680px]">
                <Combobox options={options} value={adding ? NEW : collector} onChange={pickCollector} placeholder="Search collectors" clearable />
                {adding && <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Collector or firm name" aria-label="New collector name" autoFocus />}
              </div>
            </FormSection>
            <FormSection n={2} done={gross !== null} title="Gross weight" hint="everything on the platform">
              <ScaleBay innerRef={scaleRef} note={gross !== null ? <span className="inline-flex items-center gap-1 text-[var(--text-2)]"><CheckCircle2 className="size-3.5 text-[var(--ok)]" />Gross {fmtKg(gross)} taken from the scale</span> : 'Lorry or sacks on the platform, then read the scale.'}>
                <ScaleWidget key={round} title={scaleTitle} targetKg={target} onReading={(kg) => { setGross(kg); setVoucher(null); }} />
              </ScaleBay>
            </FormSection>
            <FormSection n={3} done={gross !== null && gross > tareKg} title="Tare, deduction and price">
              <FormRow label="Tare" hint="Empty lorry, sacks or pallet. Starts from this collector's last tare when there is one."><div className="max-w-[260px]"><NumberPad value={tare} onChange={setTare} allowDecimal suffix="kg" /></div></FormRow>
              <FormRow label="Deduction">
                {dedOptions.length === 0 && <SettingsEmpty className="mb-2" what="deduction options" />}
                <ChipGroup ariaLabel="Deduction" options={[...dedOptions.map((d) => ({ value: d.id, label: d.label })), { value: CUSTOM, label: 'Custom' }]} value={customOn ? CUSTOM : dedId} onChange={(v) => { if (v === CUSTOM) setCustomOn(true); else { setDedId(v); setCustomOn(false); setCustom(''); } }} />
                {customOn && <div className="max-w-[260px] mt-2"><NumberPad value={custom} onChange={setCustom} allowDecimal suffix="%" max={100} autoFocus /></div>}
                <Note tone="warn" className="mt-2"><strong>Deduction rule to be confirmed with the plant:</strong> who decides the percentage, and on what evidence (moisture, contamination, sample sort). Until then every deduction is recorded with the person who applied it.</Note>
              </FormRow>
              <FormRow label="Price per kg" hint={priceOptions.some((o) => o.example) ? 'Example prices; the plant sets its own in Settings → Master data.' : undefined}>
                {priceOptions.length === 0 ? <SettingsEmpty what="price options" /> : <ChipGroup ariaLabel="Price per kg" options={priceOptions.map((o) => ({ value: o.id, label: o.value !== undefined ? fmtUGX(o.value) : o.label }))} value={priceId} onChange={setPriceId} />}
              </FormRow>
            </FormSection>
            <FormSection n={4} done={photo} title="Scale photo" hint="mandatory">
              <button type="button" onClick={() => setPhoto(!photo)} aria-pressed={photo} className={cn('w-full max-w-[680px] flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors', photo ? 'border-[color-mix(in_srgb,var(--ok)_45%,transparent)] bg-[var(--ok-bg)]' : 'border-dashed border-[var(--line-2)] hover:bg-[var(--hover)]')}>
                <span className="size-9 rounded-md grid place-items-center shrink-0" style={{ background: photo ? 'color-mix(in srgb, var(--ok) 16%, transparent)' : 'var(--surface-3)', color: photo ? 'var(--ok)' : 'var(--text-2)' }}>{photo ? <CheckCircle2 className="size-5" /> : <Camera className="size-5" />}</span>
                <span className="min-w-0 flex-1"><span className="block t-base font-medium">{photo ? 'Scale photo captured' : 'Photograph the scale display'}</span><span className="block t-sm text-[var(--text-3)]">{photo ? 'Attached to the voucher. Select again to retake.' : 'The voucher cannot be issued without it.'}</span></span>
                <Kbd keys="c" />
              </button>
            </FormSection>
            <FormSection n={5} done={ready} title="Voucher arithmetic" hint="nothing here is typed">
              <div className="grid gap-2">
                <Calc terms={[{ label: 'Gross', value: fmtNum(gross ?? 0), unit: 'kg' }, { op: '−', label: 'Tare', value: fmtNum(tareKg), unit: 'kg' }, { op: '−', label: `Deduction ${dedPct}%`, value: fmtNum(dedKg), unit: 'kg' }, { op: '=', label: 'Net weight', value: kg1(live.netKg), unit: 'kg', result: true }]} />
                <Calc terms={[{ label: 'Net weight', value: kg1(live.netKg), unit: 'kg' }, { op: '×', label: 'Price per kg', value: fmtUGX(price) }, { op: '=', label: 'Amount payable', value: fmtUGX(live.amount), result: true }]} />
              </div>
            </FormSection>
          </div>
        </Panel>
      </Workbench>

      <Panel icon={Scale} title="Today's intake" sub={`${fmtDayLong(today)} · select a row to open its voucher`} pad={false}>
        <DataGrid bare dense rows={todays} rowKey={(d) => d.id} columns={cols} onRowClick={(d) => setVoucher(d)} selectedKey={current?.id} empty="No deliveries yet today. The first weigh-in appears here with its voucher."
          footer={todays.length ? <tr><td colSpan={3}>{todays.length} deliver{todays.length === 1 ? 'y' : 'ies'}</td><td className="text-right num">{fmtNum(todays.reduce((t, d) => t + d.grossKg, 0))}</td><td className="text-right num">{fmtNum(todays.reduce((t, d) => t + d.tareKg, 0))}</td><td /><td className="text-right num">{fmtNum(Math.round(todayNet * 10) / 10)}</td><td /><td className="text-right num">{fmtNum(todayAmount)}</td><td /></tr> : undefined} />
      </Panel>

      <Sheet open={share && !!current} onClose={() => setShare(false)} title="Share voucher on WhatsApp" sub={current ? `${no(current)} · ${current.collector}` : undefined}
        footer={current && <Button variant="primary" icon={MessageCircle} disabled={sentId === current.id} onClick={() => send(current)} hotkey="mod+enter" hotkeyLabel="Send the voucher">{sentId === current.id ? 'Sent' : 'Send'}</Button>}>
        {current && <div className="flex justify-center py-2"><WhatsAppPreview to={current.collector} lines={voucherLines(current)} attachment={`${no(current)}.pdf`} sent={sentId === current.id} /></div>}
      </Sheet>
    </div>
  );
}
