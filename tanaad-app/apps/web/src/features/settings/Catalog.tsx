import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Currency, Machine, Price, Product, SiteCode } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { refList } from '@/data/selectors';
import { SITES } from '@/config/sites';
import { Badge, Button, ChipGroup, DataGrid, Field, Input, Note, Panel, SearchInput, Select, Sheet, Status, Toolbar, type Column } from '@/components/ui';
import { fmtMoney } from '@/data/format';

const KINDS: { value: Product['kind']; label: string }[] = [{ value: 'mat', label: 'Mat' }, { value: 'bag_pack', label: 'Bag pack' }, { value: 'roll', label: 'Film roll' }, { value: 'pellet', label: 'Pellet' }, { value: 'material', label: 'Material' }];
const num = (v: string) => (v === '' ? 0 : Number(v.replace(/[^0-9.]/g, '')) || 0);

/** Products: name, unit, pack size, standard weight, thickness, prices per channel and currency. All of it the client's to define. */
export function ProductsEditor({ site, canEdit }: { site: SiteCode; canEdit: boolean }) {
  const s = useStore(); const [q, setQ] = useState(''); const [edit, setEdit] = useState<Partial<Product> | null>(null);
  const units = refList(s, 'unit', site);
  const rows = s.products.filter((p) => p.siteId === site && p.internalName.toLowerCase().includes(q.toLowerCase()));
  const cols: Column<Product>[] = [
    { key: 'n', header: 'Product', sort: (p) => p.internalName, cell: (p) => <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-[3px]" style={{ background: p.colour ?? 'var(--text-4)' }} /><span className="font-medium">{p.internalName}</span>{p.commercialName && <span className="text-[var(--text-3)]">· {p.commercialName}</span>}</span> },
    { key: 'k', header: 'Type', cell: (p) => KINDS.find((k) => k.value === p.kind)?.label },
    { key: 'u', header: 'Sold by', cell: (p) => `${p.unit ?? '—'} of ${p.bundlePieces}` },
    { key: 'w', header: 'Std weight', align: 'right', mono: true, sort: (p) => p.stdBundleWeightKg, cell: (p) => <span className="inline-flex items-center gap-1.5">{p.stdBundleWeightKg} kg{p.weightStatus === 'to_be_measured' && <Badge tone="warn">to measure</Badge>}</span> },
    { key: 't', header: 'Tolerance', align: 'right', mono: true, cell: (p) => `±${p.weightTolerancePct}%` },
    { key: 'm', header: 'Microns', align: 'right', mono: true, cell: (p) => (p.thicknessMicron ? <span className={p.thicknessMicron < 30 ? 'text-[var(--bad)] font-medium' : ''}>{p.thicknessMicron}</span> : <span className="text-[var(--text-4)]">—</span>) },
    { key: 'pl', header: 'Local price', align: 'right', mono: true, cell: (p) => { const x = p.prices.find((r) => r.channel === 'local'); return x ? fmtMoney(x.amount, x.currency) : '—'; } },
    { key: 'pe', header: 'Export price', align: 'right', mono: true, cell: (p) => { const x = p.prices.find((r) => r.channel === 'export'); return x ? fmtMoney(x.amount, x.currency) : '—'; } },
    { key: 'a', header: 'Status', cell: (p) => <Status tone={p.active === false ? 'neutral' : 'ok'}>{p.active === false ? 'Inactive' : 'Active'}</Status> },
  ];
  const price = (ch: Price['channel']) => edit?.prices?.find((p) => p.channel === ch);
  const setPrice = (ch: Price['channel'], patch: Partial<Price>) => setEdit((e) => { const others = (e?.prices ?? []).filter((p) => p.channel !== ch); const cur = (e?.prices ?? []).find((p) => p.channel === ch) ?? { channel: ch, currency: (ch === 'export' ? 'USD' : 'UGX') as Currency, amount: 0, effectiveFrom: s.today }; return { ...e, prices: [...others, { ...cur, ...patch }] }; });
  const save = () => {
    if (!edit?.internalName?.trim()) return;
    s.saveProduct({ siteId: site, internalName: edit.internalName.trim(), commercialName: edit.commercialName?.trim() || undefined, kind: edit.kind ?? 'mat', bundlePieces: edit.bundlePieces || 1, stdBundleWeightKg: edit.stdBundleWeightKg ?? 0, weightTolerancePct: edit.weightTolerancePct ?? 2, weightStatus: edit.weightStatus ?? 'to_be_measured', prices: (edit.prices ?? []).filter((p) => p.amount > 0), colour: edit.colour, unit: edit.unit, thicknessMicron: edit.thicknessMicron || undefined, active: edit.active ?? true, id: edit.id });
    s.toast({ kind: 'ok', title: `${edit.internalName} saved` }); setEdit(null);
  };
  return (
    <div>
      <Toolbar right={canEdit ? <Button variant="primary" icon={Plus} hotkey="n" hotkeyLabel="New product" onClick={() => setEdit({ kind: site === 'mats' ? 'mat' : site === 'bags' ? 'bag_pack' : 'pellet', bundlePieces: 1, weightTolerancePct: 2, weightStatus: 'to_be_measured', prices: [], active: true, unit: units[0]?.label })}>New product</Button> : undefined}>
        <SearchInput value={q} onChange={setQ} placeholder="Search products" /><span className="t-sm text-[var(--text-3)]">{rows.length} products at {SITES[site].name}</span>
      </Toolbar>
      <DataGrid rows={rows} columns={cols} rowKey={(p) => p.id} onRowClick={canEdit ? (p) => setEdit({ ...p }) : undefined} empty="No products yet. Add the first one." />
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit product' : 'New product'} sub={SITES[site].name} width={520}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" hotkey="mod+enter" hotkeyLabel="Save product" onClick={save} disabled={!edit?.internalName?.trim()}>Save</Button></>}>
        {edit && <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Factory name" required><Input autoFocus data-autofocus="" value={edit.internalName ?? ''} onChange={(e) => setEdit({ ...edit, internalName: e.target.value })} placeholder="The name used on the floor" /></Field>
            <Field label="Commercial name" hint="Optional. Shown on invoices."><Input value={edit.commercialName ?? ''} onChange={(e) => setEdit({ ...edit, commercialName: e.target.value })} /></Field>
          </div>
          <Field label="Type"><ChipGroup size="sm" value={edit.kind} onChange={(kind) => setEdit({ ...edit, kind })} options={KINDS} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Sold by" hint="Units are managed under Master data."><Select value={edit.unit ?? ''} onChange={(e) => setEdit({ ...edit, unit: e.target.value })}>{units.map((u) => <option key={u.id} value={u.label}>{u.label}</option>)}</Select></Field>
            <Field label="Pieces per unit"><Input className="num" inputMode="numeric" value={edit.bundlePieces ?? ''} onChange={(e) => setEdit({ ...edit, bundlePieces: num(e.target.value) })} /></Field>
            <Field label="Colour swatch"><input type="color" value={edit.colour ?? '#7a8890'} onChange={(e) => setEdit({ ...edit, colour: e.target.value })} className="ctl w-full rounded-md border border-[var(--line-2)] bg-[var(--surface)] p-0.5 cursor-pointer" /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Standard weight (kg)"><Input className="num" inputMode="decimal" value={edit.stdBundleWeightKg ?? ''} onChange={(e) => setEdit({ ...edit, stdBundleWeightKg: num(e.target.value) })} /></Field>
            <Field label="Gate tolerance (%)"><Input className="num" inputMode="decimal" value={edit.weightTolerancePct ?? ''} onChange={(e) => setEdit({ ...edit, weightTolerancePct: num(e.target.value) })} /></Field>
            <Field label="Weight is"><Select value={edit.weightStatus} onChange={(e) => setEdit({ ...edit, weightStatus: e.target.value as Product['weightStatus'] })}><option value="to_be_measured">Still to be measured</option><option value="measured">Measured on a scale</option></Select></Field>
          </div>
          {(edit.kind === 'bag_pack' || edit.kind === 'roll') && <>
            <Field label="Film thickness (microns)" hint="Carrier bags under 30 microns may not be made or sold in Uganda."><Input className="num max-w-[160px]" inputMode="numeric" value={edit.thicknessMicron ?? ''} onChange={(e) => setEdit({ ...edit, thicknessMicron: num(e.target.value) })} /></Field>
            {!!edit.thicknessMicron && edit.thicknessMicron < 30 && <Note tone="bad">Below the 30 micron legal minimum for carrier bags.</Note>}
          </>}
          <div className="t-label mt-1">Prices</div>
          {(['local', 'export'] as const).map((ch) => (
            <div key={ch} className="grid grid-cols-[90px_1fr_110px] gap-2 items-center">
              <span className="t-sm font-medium capitalize text-[var(--text-2)]">{ch}</span>
              <Input className="num" inputMode="decimal" placeholder="Not sold on this channel" value={price(ch)?.amount || ''} onChange={(e) => setPrice(ch, { amount: num(e.target.value) })} />
              <Select value={price(ch)?.currency ?? (ch === 'export' ? 'USD' : 'UGX')} onChange={(e) => setPrice(ch, { currency: e.target.value as Currency })}><option>UGX</option><option>USD</option></Select>
            </div>
          ))}
          <label className="inline-flex items-center gap-2 t-base mt-1"><input type="checkbox" className="size-4 accent-[var(--brand)]" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />Active (can be produced and sold)</label>
        </div>}
      </Sheet>
    </div>
  );
}

/** Machines and their benchmarks. Six new looms is a few rows here. */
export function MachinesEditor({ site, canEdit }: { site: SiteCode; canEdit: boolean }) {
  const s = useStore(); const base = SITES[site]; const [edit, setEdit] = useState<Partial<Machine> | null>(null);
  const rows = s.machines.filter((m) => m.siteId === site);
  const wallStage = site === 'mats' ? 'weave' : site === 'bags' ? 'extrude' : 'pelletise';
  const benchMachines = rows.filter((m) => m.stageCode === wallStage); const prodKind = site === 'mats' ? 'mat' : site === 'bags' ? 'roll' : 'pellet';
  const prods = s.products.filter((p) => p.siteId === site && p.kind === prodKind && p.active !== false);
  const cols: Column<Machine>[] = [
    { key: 'c', header: 'Machine', sort: (m) => m.code.replace(/\d+/, (n) => n.padStart(3, '0')), cell: (m) => <span className="font-medium">{m.code}</span> },
    { key: 'k', header: 'Kind', cell: (m) => m.kind },
    { key: 's', header: 'Stage', cell: (m) => base.stages.find((x) => x.code === m.stageCode)?.name ?? m.stageCode },
    { key: 'st', header: 'Status', sort: (m) => m.status, cell: (m) => <Status tone={m.status === 'active' ? 'ok' : m.status === 'down' ? 'bad' : 'neutral'}>{m.status}</Status> },
  ];
  const save = () => { if (!edit?.code?.trim()) return; s.saveMachine({ siteId: site, code: edit.code.trim(), kind: edit.kind?.trim() || 'machine', stageCode: edit.stageCode ?? base.stages[0].code, status: edit.status ?? 'active', capacityKgPerDay: edit.capacityKgPerDay || undefined, id: edit.id }); s.toast({ kind: 'ok', title: `${edit.code} saved`, detail: 'It is on the machine wall now.' }); setEdit(null); };
  return (
    <div className="grid gap-[var(--gap)]">
      <div>
        <Toolbar right={canEdit ? <Button variant="primary" icon={Plus} hotkey="n" hotkeyLabel="New machine" onClick={() => setEdit({ status: 'active', stageCode: wallStage, kind: benchMachines[0]?.kind })}>New machine</Button> : undefined}><span className="t-sm text-[var(--text-3)]">{rows.length} machines · {rows.filter((m) => m.status === 'arriving').length} arriving</span></Toolbar>
        <DataGrid rows={rows} columns={cols} rowKey={(m) => m.id} onRowClick={canEdit ? (m) => setEdit({ ...m }) : undefined} maxHeight={360} dense />
      </div>
      <Panel title="Benchmarks" sub={`units per shift, ${base.machineWallTitle.toLowerCase()} machines by product`} pad={false}>
        {prods.length === 0 || benchMachines.length === 0 ? <div className="p-[var(--pad)] t-sm text-[var(--text-3)]">Add machines and products to set benchmarks.</div> : (
          <div className="overflow-auto max-h-[420px]">
            <table className="w-full border-collapse t-base">
              <thead className="sticky top-0 z-10"><tr className="bg-[var(--surface-2)]"><th className="px-2.5 h-8 text-left t-xs font-semibold uppercase tracking-[0.04em] text-[var(--text-3)] border-b border-[var(--line)]">Machine</th>{prods.map((p) => <th key={p.id} className="px-2.5 h-8 text-right t-xs font-semibold uppercase tracking-[0.04em] text-[var(--text-3)] border-b border-[var(--line)] whitespace-nowrap">{p.internalName}</th>)}</tr></thead>
              <tbody>{benchMachines.map((m) => <tr key={m.id} className="border-b border-[var(--line)] last:border-b-0"><td className="px-2.5 h-9 font-medium whitespace-nowrap">{m.code}{m.status === 'arriving' && <span className="t-xs text-[var(--text-3)]"> · arriving</span>}</td>{prods.map((p) => { const b = s.benchmarks.find((x) => x.machineId === m.id && x.productId === p.id); return <td key={p.id} className="px-1.5 text-right"><input disabled={!canEdit} inputMode="numeric" defaultValue={b?.unitsPerShift ?? ''} placeholder="—" onBlur={(e) => { const v = num(e.target.value); if (v !== (b?.unitsPerShift ?? 0)) s.setBenchmark({ machineId: m.id, productId: p.id, unitsPerShift: v }); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="num w-[72px] h-7 px-2 text-right rounded border border-transparent hover:border-[var(--line-2)] focus:border-[var(--focus)] bg-transparent outline-none" /></td>; })}</tr>)}</tbody>
            </table>
          </div>
        )}
      </Panel>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit machine' : 'New machine'} sub={base.name} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" hotkey="mod+enter" hotkeyLabel="Save machine" onClick={save} disabled={!edit?.code?.trim()}>Save</Button></>}>
        {edit && <div className="grid gap-3">
          <Field label="Name or number" required><Input autoFocus data-autofocus="" value={edit.code ?? ''} onChange={(e) => setEdit({ ...edit, code: e.target.value })} placeholder="As it is known on the floor" /></Field>
          <Field label="Kind"><Input value={edit.kind ?? ''} onChange={(e) => setEdit({ ...edit, kind: e.target.value })} placeholder="loom, extruder, line…" /></Field>
          <Field label="Process stage"><Select value={edit.stageCode} onChange={(e) => setEdit({ ...edit, stageCode: e.target.value })}>{base.stages.map((x) => <option key={x.code} value={x.code}>{x.sequence}. {x.name}</option>)}</Select></Field>
          <Field label="Rated capacity (kg per day)" hint="Optional. Used for capacity bars."><Input className="num max-w-[180px]" inputMode="numeric" value={edit.capacityKgPerDay ?? ''} onChange={(e) => setEdit({ ...edit, capacityKgPerDay: num(e.target.value) })} /></Field>
          <Field label="Status"><ChipGroup size="sm" value={edit.status} onChange={(status) => setEdit({ ...edit, status })} options={[{ value: 'active', label: 'Active' }, { value: 'arriving', label: 'Arriving' }, { value: 'down', label: 'Down' }, { value: 'retired', label: 'Retired' }]} /></Field>
        </div>}
      </Sheet>
    </div>
  );
}
