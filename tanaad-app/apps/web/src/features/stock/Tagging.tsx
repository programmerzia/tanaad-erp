import { useState } from 'react';
import { Boxes, CheckCircle2, Flag, Grid3x3, Pencil, Printer, Tag, Target } from 'lucide-react';
import type { Label, Product } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useSite, useGo } from '@/app/hooks';
import { Badge, Button, ChipGroup, Combobox, DataGrid, Dialog, Empty, Kbd, Note, NumberPad, PageHeader, Panel, Ring, Sheet, useHotkey, type Column } from '@/components/ui';
import { CountUp, TimeTrack } from '@/components/charts';
import { Sticker } from '@/components/Sticker';
import { printer } from '@/devices';
import { currentShiftKind, lastWorkingDays, shiftId } from '@/data/selectors';
import { fmtDayShort, fmtKg, fmtNum } from '@/data/format';
import { useBeep } from './shared';
import { Bench, Fact, IconChip, KV, ProductName, SetupHint, Step, Swatch, plural, unitWords } from './kit';

/** The sticker a product gets follows what the product is, not which site it is on. */
const LABEL_KIND: Record<Product['kind'], Label['kind']> = { mat: 'bundle', bag_pack: 'pack', roll: 'roll', pellet: 'sack', material: 'bag' };
/**
 * The storekeeper's own estimate of how much standing stock there is to tag. There is no setting for it yet,
 * so it is kept on this device; without one the screen shows the count only.
 */
const estimateKey = (site: string) => `tanaad-tagging-estimate-${site}`;
const readEstimate = (site: string) => { try { const n = parseInt(localStorage.getItem(estimateKey(site)) ?? '', 10); return n > 0 ? n : undefined; } catch { return undefined; } };

/** One-time tagging campaign: put a sticker on every bundle of the standing stock so it joins the system. */
export function Tagging() {
  const s = useStore(); const site = useSite(); const go = useGo(); const beep = useBeep();
  const createLabel = useStore((x) => x.createLabel); const toast = useStore((x) => x.toast);
  const words = unitWords(site.id); const unit = words.many;
  const zones = s.zones.filter((z) => z.siteId === site.id);
  const products = s.products.filter((p) => p.siteId === site.id && p.kind !== 'material' && p.active !== false);
  const [zoneId, setZoneId] = useState<string | null>(zones[0]?.id ?? null);
  const [productId, setProductId] = useState<string | null>(products[0]?.id ?? null);
  const [printing, setPrinting] = useState<Label | null>(null); const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<Record<string, number>>({}); // key zone|product
  const [summary, setSummary] = useState<{ zoneId: string; zone: string; rows: { name: string; colour?: string; n: number }[] } | null>(null);
  const [target, setTarget] = useState<number | undefined>(() => readEstimate(site.id)); const [estimating, setEstimating] = useState(false); const [draft, setDraft] = useState('');
  const saveEstimate = () => { const n = parseInt(draft || '0', 10); if (n <= 0) return; try { localStorage.setItem(estimateKey(site.id), String(n)); } catch { /* kept for this visit only */ } setTarget(n); setEstimating(false); };
  // Tagged = product stickers created in the store with no machine (campaign stickers), not production stickers.
  const tagged = s.labels.filter((l) => l.siteId === site.id && !!l.productId && !l.machineId && l.stageCode === 'store');
  const today = tagged.filter((l) => l.day === s.today).sort((a, b) => b.code.localeCompare(a.code));
  const pct = target ? Math.min(100, (tagged.length / target) * 100) : 0;
  const product = products.find((p) => p.id === productId); const zone = zones.find((z) => z.id === zoneId);
  const one = product?.unit ?? words.one;
  const key = (z: string, p: string) => `${z}|${p}`;
  const inZone = (z: string) => Object.entries(session).filter(([k]) => k.startsWith(z + '|')).reduce((t, [, n]) => t + n, 0);
  const sessionAll = Object.values(session).reduce((t, n) => t + n, 0);
  const sessionTotal = zoneId ? inZone(zoneId) : 0;
  const days = lastWorkingDays(site.id, s.today, 7); const perDay = days.map((d) => tagged.filter((l) => l.day === d).length);
  const activeDays = perDay.filter((n) => n > 0).length; const pace = activeDays ? Math.round(perDay.reduce((t, n) => t + n, 0) / activeDays) : 0;
  const left = target ? Math.max(0, target - tagged.length) : undefined;

  const tagOne = async () => {
    if (!product || !zoneId || busy) return;
    setBusy(true);
    const label = createLabel({ siteId: site.id, kind: LABEL_KIND[product.kind], productId: product.id, stageCode: 'store', shiftId: shiftId(site.id, s.today, currentShiftKind()), day: s.today, qtyUnits: product.bundlePieces, qtyKg: product.stdBundleWeightKg, status: 'in_stock', zoneId, parentIds: [] });
    setPrinting(label); beep('ok');
    await printer.print({ code: label.code, lines: [product.internalName, `${product.bundlePieces} pcs`] });
    setSession((m) => ({ ...m, [key(zoneId, product.id)]: (m[key(zoneId, product.id)] ?? 0) + 1 }));
    setBusy(false);
    toast({ kind: 'ok', title: `${label.code} printed`, detail: `${product.internalName} · ${zone?.name}. Stick it on the ${one}.` });
  };
  const finishZone = () => {
    if (!zoneId || sessionTotal === 0) return;
    const rows = products.map((p) => ({ name: p.internalName + (p.commercialName ? ` · ${p.commercialName}` : ''), colour: p.colour, n: session[key(zoneId, p.id)] ?? 0 })).filter((r) => r.n > 0);
    setSummary({ zoneId, zone: zone?.name ?? '', rows });
  };
  const nextZone = () => {
    if (!summary) return;
    const i = zones.findIndex((z) => z.id === summary.zoneId); const next = zones.length > 1 ? zones[(i + 1) % zones.length] : undefined;
    toast({ kind: 'ok', title: `${summary.zone} done`, detail: next ? `Move to ${next.name}.` : 'Move to the next zone.' });
    if (next) setZoneId(next.id);
    setSummary(null);
  };

  // One key prints. Space or Enter anywhere on the page, except on another button or link, which keeps its own action.
  useHotkey(['space', 'enter'], (e) => {
    const el = (e.target as HTMLElement | null)?.closest?.('button,a,[role="tab"]') as HTMLElement | null;
    if (el && el.getAttribute('role') !== 'radio' && !el.hasAttribute('data-print')) { el.click(); return; }
    if (document.querySelector('[role="dialog"]')) return;
    void tagOne();
  }, { label: 'Print and stick', enabled: !summary && !estimating });

  const todayCols: Column<Label>[] = [
    { key: 'c', header: 'Sticker', cell: (l) => <span className="code">{l.code}</span> },
    { key: 'p', header: 'Product', truncate: 130, cell: (l) => <ProductName product={s.products.find((p) => p.id === l.productId)} strong={false} /> },
    { key: 'z', header: 'Zone', truncate: 100, cell: (l) => <span className="text-[var(--text-2)]">{s.zones.find((z) => z.id === l.zoneId)?.name ?? '—'}</span> },
    { key: 'q', header: 'Pcs', align: 'right', mono: true, cell: (l) => fmtNum(l.qtyUnits) },
  ];
  const matrix = products.filter((p) => zones.some((z) => session[key(z.id, p.id)]));

  return (
    <div>
      <PageHeader eyebrow={`${site.name} · Stock`} title="Tagging campaign" meta={<>{target ? <Badge tone={pct >= 100 ? 'ok' : 'accent'} dot>{Math.round(pct)}% of the estimate</Badge> : <Badge tone="neutral">{plural(tagged.length, 'sticker')} so far</Badge>}<Badge tone="neutral">One-time pass</Badge></>}
        subtitle={`One pass through the store: count each ${one} once, print its sticker, stick it on. From then on the system knows it exists.`}
        actions={<Button icon={Boxes} onClick={() => go.site('stock')}>Stock wall</Button>} />

      {/* Campaign progress: labelled against the estimate of standing stock */}
      <section className="surface mb-[var(--gap)] px-[var(--pad)] py-3 flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="flex items-center gap-3 min-w-0">
          {target ? <Ring value={pct} size={60} stroke={7} tone={pct >= 100 ? 'ok' : 'accent'} /> : <IconChip icon={Tag} color="var(--accent)" className="size-11!" />}
          <div className="min-w-0">
            <div className="t-sm font-medium text-[var(--text-2)]">Campaign progress</div>
            <div className="t-kpi num whitespace-nowrap"><CountUp value={tagged.length} /><span className="t-base font-medium text-[var(--text-3)]">{target ? ` of ~${fmtNum(target)} ${unit}` : ` ${unit} labelled`}</span></div>
          </div>
        </div>
        <div className="flex-1 min-w-[240px]">
          {target ? <>
            <TimeTrack progress={tagged.length / target} startLabel="0" endLabel={`~${fmtNum(target)} estimated`} nowLabel={`${fmtNum(tagged.length)} labelled`} />
            <div className="t-xs text-[var(--text-3)] mt-1 flex flex-wrap items-center gap-x-2">The total is your own estimate of the standing stock. The campaign ends when the store has no untagged {unit}.<button type="button" className="inline-flex items-center gap-1 font-medium text-[var(--text-2)] hover:text-[var(--text)] underline underline-offset-2" onClick={() => { setDraft(String(target)); setEstimating(true); }}><Pencil className="size-3" />Change estimate</button></div>
          </> : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-dashed border-[var(--line-2)] px-3 py-2 t-sm text-[var(--text-2)]">
              <span className="min-w-0 flex-1">No estimate of the standing stock yet. Walk the store, enter a rough total, and this bar shows how far the campaign has come.</span>
              <Button size="sm" icon={Target} onClick={() => { setDraft(''); setEstimating(true); }}>Set estimate</Button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 shrink-0">
          <Fact label="Today">{fmtNum(today.length)}</Fact>
          <Fact label="This session">{fmtNum(sessionAll)}</Fact>
          <Fact label="Left to tag">{left === undefined ? '—' : `~${fmtNum(left)}`}</Fact>
          <Fact label="Average a day">{pace ? fmtNum(pace) : '—'}</Fact>
        </div>
      </section>

      <Bench asideWidth={380} aside={<>
        <Panel icon={Printer} title="Sticker" sub={printing ? printing.code : 'preview'} actions={<Badge tone={printer.status() === 'ready' ? 'ok' : 'bad'} dot>{printer.status() === 'ready' ? 'Printer ready' : 'Printer offline'}</Badge>}
          footer="Prints here and on the Zebra at the store door.">
          <div className="min-h-[186px] grid place-items-center">
            {printing ? <Sticker key={printing.id} label={printing} product={s.products.find((p) => p.id === printing.productId)} site={site} shiftKind={currentShiftKind()} printing compact />
              : <Empty icon={Tag} title="No sticker printed yet" hint={`Press Space and the first ${one} gets its code.`} />}
          </div>
        </Panel>
        <Panel icon={Tag} title="Tagged today" sub={plural(today.length, 'sticker')} pad={false} actions={<Button size="sm" variant="ghost" onClick={() => go.site('stock')}>Stock wall</Button>}
          footer={`Tagged stock joins the stock wall immediately and can be scanned onto a lorry like any other ${one}.`}>
          <DataGrid bare dense rows={today.slice(0, 60)} columns={todayCols} rowKey={(l) => l.id} maxHeight={300} empty="Nothing tagged yet today." />
        </Panel>
      </>}>
        <div className="flex flex-col gap-[var(--gap)]">
          <Panel icon={Tag} title="Tag standing stock" sub={zone && product ? `${product.internalName} into ${zone.name}` : undefined} pad={false}
            footer={<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <span>Each sticker is an event in the audit feed with your name.</span>
              <Button icon={Flag} hotkey="f" hotkeyLabel="Finish this zone" disabled={sessionTotal === 0} onClick={finishZone}>Finish {zone?.name ?? 'zone'}</Button>
            </div>}>
            <Step n={1} title="Zone" hint="where you are standing">
              {zones.length === 0 ? <SetupHint inline what="store zones" where="Store zones" /> : <ChipGroup ariaLabel="Zone" value={zoneId} onChange={setZoneId} options={zones.map((z) => ({ value: z.id, label: <>{z.name}{inZone(z.id) > 0 && <Badge tone="ok">{inZone(z.id)}</Badge>}</> }))} />}
            </Step>
            <Step n={2} title="Product" hint={product ? `${product.bundlePieces} ${product.bundlePieces === 1 ? 'piece' : 'pieces'} · ${fmtKg(product.stdBundleWeightKg)} per ${one}` : undefined}>
              {products.length === 0 ? <SetupHint inline what="products" where="Products" />
                : products.length > 8
                  ? <Combobox className="max-w-[360px]" value={productId} onChange={(v) => v && setProductId(v)} placeholder="Search product" options={products.map((p) => ({ value: p.id, label: p.internalName, sub: p.commercialName, left: <Swatch colour={p.colour} />, right: zoneId && session[key(zoneId, p.id)] ? <Badge tone="ok">{session[key(zoneId, p.id)]}</Badge> : undefined }))} />
                  : <ChipGroup ariaLabel="Product" value={productId} onChange={setProductId} options={products.map((p) => ({ value: p.id, label: <><Swatch colour={p.colour} />{p.internalName}{zoneId && session[key(zoneId, p.id)] ? <Badge tone="ok">{session[key(zoneId, p.id)]}</Badge> : null}</> }))} />}
              {product?.weightStatus === 'to_be_measured' && <Note tone="warn" className="mt-2.5">Standard weight {product.stdBundleWeightKg} kg per {one} is to be measured. The sticker carries it with a * until confirmed.</Note>}
            </Step>
            <Step n={3} title="Print and stick" hint="one key per sticker">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] items-center">
                <Button data-print="" variant="primary" size="xl" block icon={Printer} disabled={!product || !zoneId || busy} onClick={tagOne}>
                  {busy ? 'Printing…' : 'Print and stick'}
                  {!busy && <><Kbd keys="space" className="ml-1 [&_kbd]:bg-transparent [&_kbd]:border-current [&_kbd]:text-current [&_kbd]:opacity-60" /><Kbd keys="enter" className="[&_kbd]:bg-transparent [&_kbd]:border-current [&_kbd]:text-current [&_kbd]:opacity-60" /></>}
                </Button>
                <div className="grid grid-cols-2 gap-x-6">
                  <Fact label={`${zone?.name ?? 'Zone'} · ${product?.internalName ?? 'product'}`}>{zoneId && product ? session[key(zoneId, product.id)] ?? 0 : 0}</Fact>
                  <Fact label={`${zone?.name ?? 'Zone'} · all products`}>{sessionTotal}</Fact>
                </div>
              </div>
            </Step>
          </Panel>

          <Panel icon={Grid3x3} title="This session" sub={sessionAll ? `${plural(sessionAll, 'sticker')} printed` : 'stickers per product and zone'} pad={false}>
            <DataGrid bare dense rows={matrix} rowKey={(p) => p.id} empty="Nothing printed in this session yet. Counters per product and zone build up here, so a zone can be checked before you leave it."
                columns={[
                  { key: 'p', header: 'Product', cell: (p) => <ProductName product={p} strong={false} /> },
                  ...zones.map((z) => ({ key: z.id, header: z.name, align: 'right' as const, mono: true, cell: (p: (typeof matrix)[number]) => (session[key(z.id, p.id)] ? <span className={z.id === zoneId && p.id === productId ? 'font-semibold' : undefined}>{session[key(z.id, p.id)]}</span> : <span className="text-[var(--text-4)]">—</span>) })),
                  { key: 't', header: 'Total', align: 'right' as const, mono: true, cell: (p) => <span className="font-semibold">{zones.reduce((t, z) => t + (session[key(z.id, p.id)] ?? 0), 0)}</span> },
                ]}
                footer={matrix.length ? <tr><td>All products</td>{zones.map((z) => <td key={z.id} className="text-right num">{inZone(z.id) || '—'}</td>)}<td className="text-right num">{sessionAll}</td></tr> : undefined} />
          </Panel>
        </div>
      </Bench>

      <Dialog open={estimating} onClose={() => setEstimating(false)} title="Estimate of the standing stock" width={380}
        footer={<><Button variant="ghost" onClick={() => setEstimating(false)}>Cancel</Button><Button variant="primary" hotkey="mod+enter" hotkeyLabel="Save estimate" disabled={!draft || parseInt(draft, 10) <= 0} onClick={saveEstimate}>Save estimate</Button></>}>
        <p className="t-sm text-[var(--text-2)] mb-3">A rough count of the {unit} that were in the store before stickers. It only drives the progress bar on this device and can be changed at any time.</p>
        <NumberPad value={draft} onChange={setDraft} onDone={saveEstimate} doneLabel="Save" suffix={unit} max={999999} autoFocus />
      </Dialog>

      <Sheet open={!!summary} onClose={() => setSummary(null)} title={`${summary?.zone} · zone finished`} sub={`${fmtDayShort(s.today)} · this session`}
        footer={<><Button onClick={() => setSummary(null)}>Keep tagging here</Button><Button variant="primary" icon={CheckCircle2} hotkey="mod+enter" hotkeyLabel="Next zone" onClick={nextZone}>Next zone</Button></>}>
        {summary && <>
          <div className="flex items-center gap-3 mb-3">
            <span className="size-9 rounded-lg grid place-items-center shrink-0 bg-[var(--ok-bg)] text-[var(--ok)]"><CheckCircle2 className="size-5" /></span>
            <div><div className="t-kpi num">{summary.rows.reduce((t, r) => t + r.n, 0)}<span className="t-base font-medium text-[var(--text-3)]"> {unit} tagged this session</span></div><div className="t-sm text-[var(--text-3)]">{plural(summary.rows.length, 'product')} in {summary.zone}</div></div>
          </div>
          {summary.rows.map((r) => <KV key={r.name} label={r.name} dot={r.colour ?? 'var(--text-4)'}>{r.n}</KV>)}
          <Note tone="neutral" className="mt-3">Each sticker is already an event in the audit feed with your name.</Note>
        </>}
      </Sheet>
    </div>
  );
}
