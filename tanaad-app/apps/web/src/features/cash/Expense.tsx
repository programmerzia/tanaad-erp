import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BarChart3, Camera, Check, CheckCircle2, FileText, History, PieChart, Receipt, Settings, ShieldAlert, Wallet, type LucideIcon } from 'lucide-react';
import type { CashEntry, ExpenseCategory } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite, useGo, useRefList, useSiteSettings } from '@/app/hooks';
import { Badge, Button, ChipGroup, Combobox, DataGrid, Empty, FormRow, Input, Kbd, NumberPad, PageHeader, Panel, PinPad, Sheet, Note, cn, useHotkey, useIsTouch, useMedia, type Column } from '@/components/ui';
import { ColumnChart, Donut } from '@/components/charts';
import { cashDayFor, cashSummary, lastWorkingDays } from '@/data/selectors';
import { compact, fmtDay, fmtDayShort, fmtNum, fmtUGX } from '@/data/format';
import { CATEGORY_META, SITE_MANAGER_PIN, categoryColor, donutSlices, moneyOutSplit, stampOf, timeOf, useExpenseCategories } from './categories';

/** A quick expense from Settings → Master data (`quick_expense`): a name and the category it books under. */
type Quick = { key: string; hotkey?: string; label: string; icon: LucideIcon; category: ExpenseCategory; subcategory?: string };

/** A numbered field label that ticks itself when that part of the voucher is complete. */
function Step({ n, done, children }: { n: number; done: boolean; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cn('size-[18px] rounded-[5px] grid place-items-center t-xs font-semibold num shrink-0', done ? 'bg-[var(--ok-bg)] text-[var(--ok)]' : 'bg-[var(--surface-3)] text-[var(--text-2)]')} aria-label={done ? 'Done' : undefined}>{done ? <Check className="size-3" strokeWidth={3} /> : n}</span>{children}</span>;
}

/** The enforced expense voucher: amount, category, machine when it is a spare, payee, photo. Nothing saves half-done. */
export function Expense() {
  const s = useStore(); const site = useSite(); const go = useGo(); const touch = useIsTouch();
  const addCashEntry = useStore((x) => x.addCashEntry); const toast = useStore((x) => x.toast);
  const roomy = useMedia('(min-width: 640px)');

  // Master data: categories, kinds, quick expenses and the approval limit are all set in Settings.
  const cats = useExpenseCategories(); const categoryLabel = cats.label;
  const allSubs = useRefList('expense_subcategory'); const quickRefs = useRefList('quick_expense');
  const APPROVAL_LIMIT = useSiteSettings().expenseApprovalLimit;

  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [machineId, setMachineId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [payee, setPayee] = useState('');
  const [photo, setPhoto] = useState(false);
  const [pinOpen, setPinOpen] = useState(false); const [pinWrong, setPinWrong] = useState(false);
  const [flash, setFlash] = useState(false);
  const amountBox = useRef<HTMLDivElement>(null); const categoryBox = useRef<HTMLDivElement>(null);
  const focusAmount = (select?: boolean) => setTimeout(() => { const el = amountBox.current?.querySelector('input'); if (el) { el.focus(); if (select) el.select(); } }, 40);

  const siteOut = useMemo(() => s.cashEntries.filter((e) => e.siteId === site.id && e.direction === 'out').sort((a, b) => stampOf(b.at).localeCompare(stampOf(a.at))), [s.cashEntries, site.id]);
  const payees = useMemo(() => { const out: string[] = []; for (const e of siteOut) { const p = e.payee?.trim(); if (p && !out.includes(p)) out.push(p); if (out.length === 8) break; } return out; }, [siteOut]);
  const QUICK = useMemo(() => {
    const taken = new Set<string>(['g', 'n', 'e', 'p']); // g is the navigation prefix; n, e and p mean new, export and print everywhere
    return quickRefs.filter((r) => r.parentId && r.parentId in CATEGORY_META).map((r): Quick => {
      const category = r.parentId as ExpenseCategory;
      const name = r.label.toLowerCase(); // word initials first, then any letter of the name
      const hotkey = [...name.split(/\s+/).map((w) => w[0] ?? ''), ...name].find((ch) => /[a-z]/.test(ch) && !taken.has(ch)); if (hotkey) taken.add(hotkey);
      return { key: r.id, hotkey, label: r.label, icon: CATEGORY_META[category].icon, category, subcategory: allSubs.find((x) => x.parentId === category && x.label.toLowerCase() === r.label.toLowerCase())?.label };
    });
  }, [quickRefs, allSubs]);
  /** What was last paid for this quick expense: matched on its kind or name, else nothing (no amount is assumed). */
  const lastAmount = (q: Quick) => siteOut.find((e) => e.category === q.category && (e.subcategory === q.subcategory && !!q.subcategory || e.payee?.toLowerCase().startsWith(q.label.toLowerCase())))?.amount;
  const machines = useMemo(() => s.machines.filter((m) => m.siteId === site.id && m.status !== 'arriving'), [s.machines, site.id]);
  const todays = useMemo(() => siteOut.filter((e) => e.day === s.today), [siteOut, s.today]);
  const todayTotal = todays.reduce((t, e) => t + e.amount, 0);
  const cd = cashDayFor(s, site.id, s.today); const cash = cd ? cashSummary(s, cd.id) : undefined;

  const subs = useMemo(() => (category ? allSubs.filter((x) => x.parentId === category).map((x) => x.label) : undefined), [allSubs, category]);
  const n = parseInt(amount || '0', 10);
  const needsMachine = category === 'spares';
  const needsApproval = n > APPROVAL_LIMIT;
  const machine = machineId ? machines.find((m) => m.id === machineId) : undefined;
  const missing: string[] = [];
  if (!(n > 0)) missing.push('Enter the amount');
  if (!category) missing.push('Pick a category');
  if (subs?.length && !subcategory) missing.push(`Pick a ${categoryLabel(category!).toLowerCase()} type`);
  if (needsMachine && !machineId) missing.push('Pick the machine the spare is for');
  if (!payee.trim()) missing.push('Who was paid?');
  const valid = missing.length === 0;
  const categoryDone = !!category && (!subs?.length || !!subcategory) && (!needsMachine || !!machineId);

  const pickCategory = (c: ExpenseCategory) => { setCategory(c); setSubcategory(null); if (c !== 'spares') setMachineId(null); };
  const applyQuick = (q: Quick) => { setCategory(q.category); setSubcategory(q.subcategory ?? null); setMachineId(null); { const last = lastAmount(q); setAmount(last ? String(last) : ''); } setPayee(q.label); if (!touch) focusAmount(true); };
  const reset = () => { setCategory(null); setSubcategory(null); setMachineId(null); setAmount(''); setPayee(''); setPhoto(false); };

  const commit = useCallback(() => {
    if (!category || !(n > 0)) return;
    addCashEntry({ siteId: site.id, day: s.today, direction: 'out', category, subcategory: subcategory ?? undefined, machineId: machineId ?? undefined, amount: n, payee: payee.trim(), hasReceiptPhoto: photo, note: needsApproval ? 'Approved by Site Manager PIN' : undefined });
    toast({ kind: 'ok', title: `Recorded under ${categoryLabel(category)}`, detail: `${fmtUGX(n)} · ${payee.trim()}${subcategory ? ` · ${subcategory}` : ''}` });
    setFlash(true); setTimeout(() => setFlash(false), 1800);
    reset(); setPinOpen(false); setPinWrong(false);
    if (!touch) focusAmount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addCashEntry, category, n, site.id, s.today, subcategory, machineId, payee, photo, needsApproval, toast, touch]);
  const save = () => { if (!valid) { toast({ kind: 'warn', title: 'Voucher is not complete', detail: missing[0] }); return; } if (needsApproval) { setPinWrong(false); setPinOpen(true); } else commit(); };
  const onPin = useCallback((pin: string) => { if (pin === SITE_MANAGER_PIN) commit(); else { setPinWrong(true); toast({ kind: 'error', title: 'Wrong PIN', detail: 'Ask the Site Manager to enter the approval PIN.' }); } }, [commit, toast]);

  // Page shortcuts. Digits pick a category unless a chip group has the focus (it handles its own digits).
  useHotkey('mod+enter', save, { label: 'Save expense', allowInInput: true, enabled: !pinOpen });
  useHotkey(['1', '2', '3', '4', '5', '6', '7'], (e) => { if ((e.target as HTMLElement | null)?.closest?.('[role="radiogroup"]')) return; const c = cats.items[+e.key - 1]; if (c) pickCategory(c.id); }, { label: 'Pick a category by its number', enabled: !pinOpen });

  const split = moneyOutSplit(todays, cats.items); const slices = donutSlices(split);
  // Seven working days of money out, stacked by category in the fixed order.
  const week = useMemo(() => {
    const days = lastWorkingDays(site.id, s.today, 7); const perDay = days.map((d) => moneyOutSplit(siteOut.filter((e) => e.day === d), cats.items));
    const used = [...new Set(perDay.flatMap((p) => p.map((x) => x.category)))].sort((a, b) => { const ia = cats.items.findIndex((c) => c.id === a), ib = cats.items.findIndex((c) => c.id === b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    return { cats: used, data: days.map((d, i) => ({ label: fmtDayShort(d), values: used.map((c) => perDay[i].find((x) => x.category === c)?.value ?? 0), partial: d === s.today })) };
  }, [siteOut, site.id, s.today, cats.items]);
  const running = useMemo(() => { const m = new Map<string, number>(); let t = 0; for (const e of [...todays].reverse()) { t += e.amount; m.set(e.id, t); } return m; }, [todays]);
  const logCols: Column<CashEntry>[] = [
    { key: 't', header: 'Time', width: 50, cell: (e) => <span className="num t-sm text-[var(--text-3)]">{timeOf(e.at)}</span> },
    { key: 'p', header: 'Paid to', truncate: 132, cell: (e) => <span className="inline-flex items-center gap-1.5 max-w-full" title={`${categoryLabel(e.category)}${e.subcategory ? ` · ${e.subcategory}` : ''}`}><span className="size-2 rounded-[2px] shrink-0" style={{ background: categoryColor(e.category) }} /><span className="truncate">{e.payee ?? categoryLabel(e.category)}</span></span> },
    { key: 'a', header: 'Amount', align: 'right', mono: true, cell: (e) => <span className="font-medium">{fmtNum(e.amount)}</span> },
    { key: 'r', header: 'Running', align: 'right', mono: true, cell: (e) => <span className="text-[var(--text-3)]">{compact(running.get(e.id) ?? 0)}</span> },
  ];

  const amountRow = (i: number) => (
    <FormRow key="amount" required label={<Step n={i} done={n > 0}>Amount</Step>} hint={needsApproval ? undefined : `Above ${fmtUGX(APPROVAL_LIMIT)} the Site Manager approves with a PIN before it saves.`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div ref={amountBox} className="w-full max-w-[300px] touch:max-w-[420px]"
          onKeyDown={(e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            // Letters mean nothing in a number field, so the quick-fill keys work from here too.
            const q = QUICK.find((x) => x.hotkey && x.hotkey === e.key.toLowerCase());
            if (q) { e.preventDefault(); applyQuick(q); }
            else if (e.key === 'Enter' && n > 0) { e.preventDefault(); categoryBox.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus(); }
          }}>
          <NumberPad value={amount} onChange={setAmount} suffix="UGX" max={999_999_999} autoFocus={!touch} />
        </div>
        {needsApproval && <Badge tone="warn"><ShieldAlert className="size-3" />Needs Site Manager approval</Badge>}
      </div>
      {needsApproval && <div className="t-xs text-[var(--warn)] mt-1">Above {fmtUGX(APPROVAL_LIMIT)}: the Site Manager PIN is asked before saving.</div>}
    </FormRow>
  );
  const categoryRows = (i: number) => [
    <FormRow key="category" required label={<Step n={i} done={categoryDone}>Category</Step>}>
      <div ref={categoryBox}>
        <ChipGroup<ExpenseCategory> ariaLabel="Category" columns={roomy ? 4 : 2} value={category} onChange={pickCategory}
          options={cats.items.map((c, k) => { const Icon = c.icon; return { value: c.id, label: <span className="inline-flex items-center gap-1.5 w-full"><Icon className="size-4 touch:size-5 shrink-0" style={{ color: c.color }} /><span className="truncate">{c.label}</span><Kbd keys={String(k + 1)} className="ml-auto" /></span> }; })} />
        {cats.items.length === 0 && <Empty icon={Settings} title="No expense categories are active" hint="Switch them on in Settings → Master data." action={<Button icon={Settings} onClick={() => go.site('settings')}>Open Settings</Button>} />}
      </div>
    </FormRow>,
    subs && subs.length > 0 ? <FormRow key="kind" required label={`Which ${category === 'spares' ? 'part' : 'kind'}?`}><ChipGroup ariaLabel="Kind" value={subcategory} onChange={setSubcategory} options={subs.map((x) => ({ value: x, label: x }))} /></FormRow> : null,
    needsMachine ? (
      <FormRow key="machine" required label="For which machine?" hint="Spares are always booked against a machine, so its repair cost adds up.">
        {machines.length ? <Combobox className="max-w-[340px]" value={machineId} onChange={setMachineId} clearable placeholder="Search machine" emptyText="No machine by that name"
          options={machines.map((m) => ({ value: m.id, label: m.code, sub: site.stages.find((st) => st.code === m.stageCode)?.name ?? m.stageCode, right: m.status === 'down' ? <Badge tone="bad" dot>Down</Badge> : undefined, words: m.kind }))} />
          : <Empty title="No machines on this site" hint="Spares can only be recorded against a machine." />}
      </FormRow>
    ) : null,
  ];

  return (
    <div>
      <PageHeader eyebrow={`Cash · ${site.name}`} title="New expense" subtitle="Every shilling out gets a category. No category, no voucher."
        meta={<><Badge tone="neutral">{fmtDay(s.today)}</Badge>{cd && <Badge tone={cd.status === 'closed' ? 'ok' : cd.status === 'reopened' ? 'warn' : 'accent'} dot>Page {cd.status}</Badge>}</>}
        actions={<Button icon={Wallet} onClick={() => go.site('cash')}>Cash page</Button>} />

      <div className="grid gap-[var(--gap)] xl:grid-cols-[minmax(0,1fr)_360px] items-start">
        <div className="flex flex-col gap-[var(--gap)] min-w-0">
        <Panel icon={Receipt} title="Expense voucher" sub={`no. ${todays.length + 1} today`} className="[&>footer]:sticky [&>footer]:bottom-0 [&>footer]:z-10"
          actions={<span className="pr-1.5">{needsApproval ? <Badge tone="warn"><ShieldAlert className="size-3" />PIN approval</Badge> : valid ? <Badge tone="ok" dot>Ready to save</Badge> : <Badge tone="neutral">{missing.length} to fill</Badge>}</span>}
          footer={
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex-1 min-w-0 sm:min-w-[200px] max-sm:truncate t-base text-[var(--text)]">
                {valid ? <><span className="num font-semibold">{fmtUGX(n)}</span> to <span className="font-semibold">{payee.trim()}</span> under <span className="inline-flex items-center gap-1.5 font-semibold"><span className="size-2.5 rounded-[3px]" style={{ background: categoryColor(category!) }} />{categoryLabel(category!)}{subcategory ? ` · ${subcategory}` : ''}</span>{machine && <> for {machine.code}</>}</>
                  : <span className="t-sm text-[var(--text-2)]">{missing[0]}{missing.length > 1 && <span className="text-[var(--text-3)]"> · {missing.length - 1} more</span>}</span>}
              </div>
              <Button variant="ghost" className="max-sm:hidden" onClick={() => { reset(); if (!touch) focusAmount(); }} disabled={!category && !amount && !payee && !photo}>Clear</Button>
              <Button variant={needsApproval ? 'accent' : 'primary'} icon={needsApproval ? ShieldAlert : Check} disabled={!valid} onClick={save}>{needsApproval ? 'Approve and save' : 'Save expense'}<Kbd keys="mod+enter" className="ml-1 [&_kbd]:bg-transparent [&_kbd]:border-current [&_kbd]:text-current [&_kbd]:opacity-60" /></Button>
            </div>
          }>
          <div className="flex flex-wrap items-center gap-1.5 pb-3 mb-1.5 border-b border-[var(--line)]">
            <span className="t-label mr-1.5" title="Fills the voucher with the last amount paid">Quick fill · last paid</span>
            {QUICK.map((q) => { const last = lastAmount(q); return <Button key={q.key} icon={q.icon} hotkey={pinOpen ? undefined : q.hotkey} hotkeyLabel={`Quick fill: ${q.label}`} title={last ? `Fill the voucher with the last ${q.label.toLowerCase()} paid` : `Fill the category and payee for ${q.label.toLowerCase()}`} onClick={() => applyQuick(q)}>{q.label}{last !== undefined && <span className="num font-normal text-[var(--text-3)]">{compact(last)}</span>}</Button>; })}
            {QUICK.length === 0 && <span className="t-sm text-[var(--text-3)]">None set up. <button type="button" className="underline underline-offset-2 hover:text-[var(--text)]" onClick={() => go.site('settings')}>Add quick expenses in Settings → Master data</button></span>}
          </div>

          {touch ? [...categoryRows(1), amountRow(2)] : [amountRow(1), ...categoryRows(2)]}

          <FormRow required label={<Step n={3} done={!!payee.trim()}>Paid to</Step>}>
            <Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Name of person or supplier" className="max-w-[420px]" />
            {payees.length > 0 && <ChipGroup ariaLabel="Recent payees" size="sm" className="mt-1.5" value={payees.includes(payee) ? payee : null} onChange={setPayee} options={payees.map((p) => ({ value: p, label: p }))} />}
          </FormRow>

          <FormRow label={<Step n={4} done={photo}>Receipt photo</Step>}>
            <button type="button" aria-pressed={photo} onClick={() => setPhoto((p) => !p)} className={cn('w-full max-w-[420px] rounded-lg border border-dashed px-3 py-2 flex items-center gap-3 text-left transition-colors', photo ? 'border-[var(--ok)] bg-[var(--ok-bg)]' : 'border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)]')}>
              <span className="size-8 touch:size-10 rounded-md grid place-items-center shrink-0" style={{ background: `color-mix(in srgb, ${photo ? 'var(--ok)' : 'var(--text-3)'} 13%, transparent)`, color: photo ? 'var(--ok)' : 'var(--text-3)' }}>{photo ? <Check className="size-4" /> : <Camera className="size-4" />}</span>
              <span className="min-w-0 flex-1"><span className="block t-base font-medium">{photo ? 'Photo attached' : 'Take a photo of the receipt'}</span><span className="block t-sm text-[var(--text-3)]">{photo ? 'Select to retake' : 'Optional, but it saves arguments later'}</span></span>
            </button>
          </FormRow>
        </Panel>

        <Panel icon={BarChart3} title="Money out per day" sub="by category · last 7 working days · UGX">
          {week.cats.length ? <ColumnChart height={168} data={week.data} series={week.cats.map((c) => ({ name: categoryLabel(c), color: categoryColor(c) }))} /> : <Empty icon={BarChart3} title="Nothing paid out in the last 7 working days" />}
        </Panel>
        </div>

        <aside className="grid gap-[var(--gap)] md:grid-cols-2 xl:grid-cols-1 min-w-0 xl:sticky xl:top-0">
          <Panel icon={FileText} title="Voucher preview" sub="as it will be recorded" bodyClassName="py-1.5!">
            <dl className="t-sm">
              {([
                ['Amount', n > 0 ? <span className="num t-lg font-semibold text-[var(--text)]">{fmtUGX(n)}</span> : null],
                ['Category', category ? <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: categoryColor(category) }} />{categoryLabel(category)}{subcategory ? ` · ${subcategory}` : ''}</span> : null],
                ...(needsMachine ? [['Machine', machine?.code ?? null] as [string, ReactNode]] : []),
                ['Paid to', payee.trim() || null],
                ['Receipt', photo ? 'Photo attached' : <span className="text-[var(--text-3)]">No photo</span>],
                ['Approval', needsApproval ? <Badge tone="warn">Site Manager PIN</Badge> : <span className="text-[var(--text-3)]">Not needed</span>],
              ] as [string, ReactNode][]).map(([k, v]) => <div key={k} className="flex items-center justify-between gap-3 min-h-[28px] touch:min-h-9 border-b border-[var(--line)]"><dt className="text-[var(--text-2)]">{k}</dt><dd className="font-medium text-right min-w-0 truncate">{v ?? <span className="text-[var(--text-4)] font-normal">—</span>}</dd></div>)}
              <div className="flex items-center justify-between gap-3 min-h-[28px] touch:min-h-9"><dt className="text-[var(--text-2)]">Drawer after this voucher</dt><dd className="num font-medium">{cash ? fmtUGX(cash.expectedClosing - n) : '—'}</dd></div>
            </dl>
          </Panel>

          <Panel icon={History} title="Today so far" sub={`${todays.length} ${todays.length === 1 ? 'voucher' : 'vouchers'}`} pad={false} actions={<span className="pr-1.5 num t-sm font-semibold">{fmtUGX(todayTotal)}</span>}>
            {todays.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={Receipt} title="Nothing paid out yet" hint="The first voucher of the day will show here." /></div>
              : <DataGrid bare dense rows={todays} columns={logCols} rowKey={(e) => e.id} maxHeight={212} rowClassName={(e) => (flash && todays[0]?.id === e.id ? 'bg-[var(--ok-bg)]' : undefined)}
                footer={<tr><td colSpan={2}>Total out</td><td className="text-right num">{fmtNum(todayTotal)}</td><td /></tr>} />}
          </Panel>

          <Panel icon={PieChart} title="Today by category" sub="UGX out" className="md:col-span-2 xl:col-span-1"
            footer={<span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-[var(--ok)]" />Uncategorised today: <span className="num font-semibold text-[var(--text)]">0</span></span>}>
            {slices.length ? (
              <div className="flex items-center gap-4">
                <Donut segments={slices} size={104} thickness={14} center={compact(todayTotal)} sub="UGX out" />
                <div className="flex-1 min-w-0">{slices.map((c) => <div key={c.label} className="flex items-center gap-2 h-6 t-sm"><span className="size-2 rounded-[2px] shrink-0" style={{ background: c.color }} /><span className="text-[var(--text-2)] truncate flex-1">{c.label}</span><span className="num font-medium">{compact(c.value)}</span></div>)}</div>
              </div>
            ) : <Empty icon={PieChart} title="No spending to split yet" />}
          </Panel>
        </aside>
      </div>

      <Sheet open={pinOpen} onClose={() => setPinOpen(false)} title="Site Manager approval" sub={`Above the ${fmtUGX(APPROVAL_LIMIT)} limit`} width={420}>
        <Note tone="warn" className="mb-4"><strong>{fmtUGX(n)}</strong> to {payee.trim()} is above the {fmtUGX(APPROVAL_LIMIT)} limit. The Site Manager enters the PIN to approve it.</Note>
        <PinPad title="Site Manager PIN" error={pinWrong ? 'Wrong PIN. Try again.' : undefined} onSubmit={onPin} />
      </Sheet>
    </div>
  );
}
