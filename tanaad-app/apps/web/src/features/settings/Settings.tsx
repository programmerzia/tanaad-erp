import { useMemo, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { Boxes, Cog, Factory, Landmark, ListChecks, MapPin, Plus, Ruler, ShieldCheck, Users } from 'lucide-react';
import type { SiteCode, SiteSettings } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { SITE_LIST, SITES } from '@/config/sites';
import { ROLES, roleLabel } from '@/config/roles';
import { SITE_COLOR } from '@/config/siteIdentity';
import { Avatar, Badge, Button, ChipGroup, DataGrid, Field, Input, Note, PageHeader, Panel, cn, useHotkey } from '@/components/ui';
import { LISTS } from './lists';
import { RefEditor } from './RefEditor';
import { MachinesEditor, ProductsEditor } from './Catalog';

type Section = 'lists' | 'company' | 'products' | 'machines' | 'zones' | 'rules' | 'access' | 'sites';
const SECTIONS: { key: Section; label: string; icon: typeof Cog; hint: string }[] = [
  { key: 'lists', label: 'Master data', icon: ListChecks, hint: 'Every option list used on the screens' },
  { key: 'company', label: 'Company details', icon: Landmark, hint: 'What prints on invoices and notes' },
  { key: 'products', label: 'Products and prices', icon: Boxes, hint: 'Names, units, weights, microns, prices' },
  { key: 'machines', label: 'Machines and benchmarks', icon: Factory, hint: 'What runs and what it should make' },
  { key: 'zones', label: 'Store zones', icon: MapPin, hint: 'Where stock is kept and counted' },
  { key: 'rules', label: 'Rules and limits', icon: Ruler, hint: 'Tolerances, approval limits, exchange reference' },
  { key: 'access', label: 'People and roles', icon: Users, hint: 'Who can open which portal' },
  { key: 'sites', label: 'Sites and process', icon: Landmark, hint: 'Shifts and process stages' },
];
const RULES: { key: keyof SiteSettings; label: string; unit: string; help: string }[] = [
  { key: 'gateTolerancePct', label: 'Gate weight tolerance', unit: '± %', help: 'A load outside this band holds the gate pass.' },
  { key: 'massGapPct', label: 'Allowed process loss', unit: '%', help: 'Kilos in minus kilos accounted for, before the day is flagged.' },
  { key: 'cashVariance', label: 'Cash close variance', unit: 'UGX', help: 'A larger difference between expected and counted cash raises an exception.' },
  { key: 'benchmarkPct', label: 'Benchmark floor', unit: '% of benchmark', help: 'Below this a downtime reason is required.' },
  { key: 'expenseApprovalLimit', label: 'Expense approval limit', unit: 'UGX', help: 'A single expense above this needs the Site Manager.' },
  { key: 'archiveAfterAbsentDays', label: 'Archive casuals after', unit: 'absent days', help: 'Wage history is always kept.' },
  { key: 'contractWarningDays', label: 'Warn before a contract ends', unit: 'days', help: 'Shown on the supervisor’s home screen.' },
];

/**
 * Settings. Everything the business defines for itself lives here, not in code:
 * option lists, products, units, machines, benchmarks, zones, rules. Changes apply on every screen at once and are recorded in the audit feed.
 */
export function Settings() {
  const s = useStore(); const params = useParams({ strict: false }) as { site?: SiteCode };
  const role = s.session?.role ?? 'site_manager'; const admin = role === 'group_admin' || role === 'ceo';
  const [section, setSection] = useState<Section>('lists'); const [site, setSite] = useState<SiteCode>(params.site ?? s.session?.siteId ?? 'mats');
  const lockedSite = !admin; const canEdit = admin || role === 'site_manager';
  const [listKey, setListKey] = useState(LISTS[0].key); const [zone, setZone] = useState(''); const [fx, setFx] = useState(String(s.fx));
  const groups = useMemo(() => { const m = new Map<string, typeof LISTS>(); for (const l of LISTS) m.set(l.group, [...(m.get(l.group) ?? []), l]); return [...m.entries()]; }, []);
  const meta = LISTS.find((l) => l.key === listKey)!;
  const counts = (key: string, scope: 'site' | 'group') => s.refs.filter((r) => r.list === key && r.active && r.siteId === (scope === 'site' ? site : undefined)).length;
  const examples = s.refs.filter((r) => r.example && r.active && (r.siteId === site || !r.siteId)).length + s.products.filter((p) => p.siteId === site && p.weightStatus === 'to_be_measured').length;
  SECTIONS.forEach((sec, i) => useHotkey(String(i + 1), () => setSection(sec.key), { label: sec.label, group: 'This page' })); // eslint-disable-line react-hooks/rules-of-hooks
  const settings = s.siteSettings[site];

  return (
    <div>
      <PageHeader title="Settings" subtitle="Everything the business defines for itself. Nothing here needs a developer: add a size, a unit, a machine or a category and every screen uses it at once."
        meta={examples > 0 ? <Badge tone="warn">{examples} example values to confirm for {SITES[site].shortName}</Badge> : <Badge tone="ok" dot>All values confirmed</Badge>}
        actions={<div className="flex items-center gap-2"><span className="t-sm text-[var(--text-3)]">Site</span><ChipGroup size="sm" value={site} onChange={(v) => !lockedSite && setSite(v)} options={SITE_LIST.map((x) => ({ value: x.id, label: <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ background: SITE_COLOR[x.id] }} />{x.shortName}</span>, disabled: lockedSite && x.id !== site }))} /></div>} />
      <div className="grid gap-[var(--gap)] lg:grid-cols-[230px_minmax(0,1fr)] items-start">
        <nav className="surface p-1.5 lg:sticky lg:top-0" aria-label="Settings sections">
          {SECTIONS.map((sec, i) => (
            <button key={sec.key} onClick={() => setSection(sec.key)} className={cn('w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left', section === sec.key ? 'bg-[var(--selected)]' : 'hover:bg-[var(--hover)]')}>
              <sec.icon className={cn('size-4 shrink-0', section === sec.key ? 'text-[var(--accent-strong)]' : 'text-[var(--text-3)]')} />
              <span className="min-w-0 flex-1"><span className="block t-base font-medium">{sec.label}</span><span className="block t-xs text-[var(--text-3)] truncate">{sec.hint}</span></span>
              <span className="t-xs text-[var(--text-4)] num touch:hidden">{i + 1}</span>
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          {section === 'lists' && (
            <div className="grid gap-[var(--gap)] xl:grid-cols-[250px_minmax(0,1fr)] items-start">
              <div className="surface p-1.5">
                {groups.map(([g, lists]) => (
                  <div key={g} className="mb-1.5 last:mb-0"><div className="px-2.5 pt-1.5 pb-1 t-label">{g}</div>
                    {lists.map((l) => <button key={l.key} onClick={() => setListKey(l.key)} className={cn('w-full flex items-center justify-between gap-2 px-2.5 ctl rounded-md t-base text-left', listKey === l.key ? 'bg-[var(--selected)] font-medium' : 'hover:bg-[var(--hover)]')}><span className="truncate">{l.title}</span><span className="num t-xs text-[var(--text-3)]">{counts(l.key, l.scope)}</span></button>)}
                  </div>
                ))}
              </div>
              <div className="grid gap-[var(--gap)]">
                <RefEditor key={meta.key + site} meta={meta} site={site} canEdit={canEdit && (!meta.adminOnly || admin)} />
                <Note tone="neutral">{meta.scope === 'group' ? 'This list is shared by the whole group. Only a Group Admin can change it.' : `This list belongs to ${SITES[site].name}. Other sites keep their own.`} Deactivated options disappear from the screens but stay on every record that used them.</Note>
              </div>
            </div>
          )}
          {section === 'company' && (() => { const cp = s.companyProfiles[site]; const missing = (['address', 'tin', 'phone', 'bankDetails'] as const).filter((k) => !cp[k]).length; const F = ({ k, label, hint, wide }: { k: 'address' | 'phone' | 'email' | 'tin' | 'bankDetails' | 'mobileMoney'; label: string; hint?: string; wide?: boolean }) => <Field label={label} hint={hint} className={wide ? 'sm:col-span-2' : ''}><Input key={site + k} disabled={!canEdit} defaultValue={cp[k]} placeholder="Not provided yet" onBlur={(e) => { const v = e.target.value.trim(); if (v !== cp[k]) { s.updateCompanyProfile(site, { [k]: v }); s.toast({ kind: 'ok', title: `${label} saved` }); } }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></Field>; return (
            <div className="grid gap-[var(--gap)] xl:grid-cols-[minmax(0,1fr)_340px] items-start">
              <Panel title="Company details" sub={SITES[site].legalName} icon={Landmark}>
                {missing > 0 && <Note tone="warn" className="mb-3">{missing} detail{missing === 1 ? ' is' : 's are'} still blank. Documents print "to be provided" in their place until they are filled in.</Note>}
                <div className="grid sm:grid-cols-2 gap-3">
                  <F k="address" label="Registered address" wide /><F k="phone" label="Phone" /><F k="email" label="Email" />
                  <F k="tin" label="TIN" hint="Uganda Revenue Authority taxpayer number." /><F k="mobileMoney" label="Mobile money merchant" />
                  <F k="bankDetails" label="Bank details for invoices" wide />
                  <Field label="VAT rate (%)" hint="Leave at 0 if this company does not charge VAT."><Input key={site + 'vat'} disabled={!canEdit} className="num max-w-[140px]" inputMode="decimal" defaultValue={cp.vatRatePct} onBlur={(e) => { const v = Number(e.target.value.replace(/[^0-9.]/g, '')) || 0; if (v !== cp.vatRatePct) { s.updateCompanyProfile(site, { vatRatePct: v }); s.toast({ kind: 'ok', title: `VAT rate set to ${v}%` }); } }} /></Field>
                </div>
              </Panel>
              <Panel title="URA EFRIS" sub="fiscal invoicing"><div className="flex items-center gap-2 mb-2"><Badge tone={cp.efrisConnected ? 'ok' : 'warn'} dot>{cp.efrisConnected ? 'Connected' : 'Not connected'}</Badge></div><p className="t-sm text-[var(--text-2)]">Once the URA integration is configured for this company, every invoice is sent to EFRIS when it is issued and comes back with its Fiscal Document Number and verification code. Until then invoices show the fiscal block as pending.</p></Panel>
            </div>); })()}
          {section === 'products' && <ProductsEditor site={site} canEdit={canEdit} />}
          {section === 'machines' && <MachinesEditor site={site} canEdit={canEdit} />}
          {section === 'zones' && (
            <Panel title="Store zones" sub={SITES[site].name} pad={false}>
              {canEdit && <form onSubmit={(e) => { e.preventDefault(); if (!zone.trim()) return; s.saveZone({ siteId: site, name: zone.trim() }); s.toast({ kind: 'ok', title: `${zone.trim()} added` }); setZone(''); }} className="flex gap-2 px-[var(--pad)] py-2.5 border-b border-[var(--line)] bg-[var(--surface-2)]"><Input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="New zone, e.g. a room, a bay or a rack" className="max-w-[320px]" /><Button type="submit" variant="primary" icon={Plus} disabled={!zone.trim()}>Add</Button></form>}
              {s.zones.filter((z) => z.siteId === site).map((z) => <div key={z.id} className="flex items-center gap-3 px-[var(--pad)] min-h-[var(--row-h)] border-b border-[var(--line)] last:border-b-0"><MapPin className="size-4 text-[var(--text-3)]" /><input disabled={!canEdit} defaultValue={z.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== z.name) { s.saveZone({ id: z.id, siteId: site, name: v }); s.toast({ kind: 'ok', title: 'Zone renamed' }); } }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="flex-1 h-7 px-2 -mx-2 rounded border border-transparent hover:border-[var(--line-2)] focus:border-[var(--focus)] bg-transparent outline-none t-base font-medium" /><span className="num t-sm text-[var(--text-3)]">{s.labels.filter((l) => l.zoneId === z.id && l.status === 'in_stock').length} in stock</span></div>)}
            </Panel>
          )}
          {section === 'rules' && (
            <div className="grid gap-[var(--gap)] xl:grid-cols-2 items-start">
              <Panel title="Rules and limits" sub={SITES[site].name} icon={ShieldCheck} pad={false}>
                {RULES.map((r) => (
                  <div key={r.key} className="flex items-center gap-3 px-[var(--pad)] py-2 border-b border-[var(--line)] last:border-b-0">
                    <div className="min-w-0 flex-1"><div className="t-base font-medium">{r.label}</div><div className="t-xs text-[var(--text-3)]">{r.help}</div></div>
                    <div className="relative w-[190px] shrink-0"><Input key={site + r.key} disabled={!canEdit} className="num pr-[92px] text-right" inputMode="decimal" defaultValue={settings[r.key]} onBlur={(e) => { const v = Number(e.target.value.replace(/[^0-9.]/g, '')); if (!isNaN(v) && v !== settings[r.key]) { s.updateSiteSettings(site, { [r.key]: v }); s.toast({ kind: 'ok', title: `${r.label} set to ${v.toLocaleString()}` }); } }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /><span className="absolute right-2.5 top-1/2 -translate-y-1/2 t-xs text-[var(--text-3)] pointer-events-none">{r.unit}</span></div>
                  </div>
                ))}
              </Panel>
              <Panel title="Exchange reference" sub="group-wide" icon={Landmark}>
                <Field label="UGX per 1 USD" hint="Stamped on every transaction made after you change it. Earlier records keep the rate they were made at.">
                  <div className="flex gap-2"><Input disabled={!admin} className="num max-w-[180px]" inputMode="decimal" value={fx} onChange={(e) => setFx(e.target.value.replace(/[^0-9.]/g, ''))} /><Button variant="primary" disabled={!admin || !fx || Number(fx) === s.fx} onClick={() => { s.setFx(Number(fx)); s.toast({ kind: 'ok', title: `Exchange reference set to UGX ${Number(fx).toLocaleString()}` }); }}>Set</Button></div>
                </Field>
                {!admin && <Note tone="neutral" className="mt-3">Only a Group Admin can change the exchange reference.</Note>}
              </Panel>
            </div>
          )}
          {section === 'access' && (
            <div className="grid gap-[var(--gap)] xl:grid-cols-2 items-start">
              <DataGrid rows={s.users} rowKey={(u) => u.id} columns={[
                { key: 'n', header: 'Person', cell: (u) => <span className="inline-flex items-center gap-2"><Avatar name={u.name} seed={u.avatarSeed} size={22} /><span className="font-medium">{u.name}</span></span> },
                { key: 'r', header: 'Roles and portals', wrap: true, cell: (u) => <span className="flex flex-wrap gap-1">{u.roles.map((r, i) => <Badge key={i} tone={r.siteId ? 'neutral' : 'accent'}>{roleLabel(r.role)}{r.siteId ? ` · ${SITES[r.siteId].shortName}` : ' · Group'}</Badge>)}</span> },
              ]} />
              <Panel title="Roles" sub="what each role is for" pad={false}>{ROLES.map((r) => <div key={r.role} className="flex items-center gap-3 px-[var(--pad)] min-h-[var(--row-h)] border-b border-[var(--line)] last:border-b-0"><span className="t-base font-medium w-[120px]">{r.label}</span><span className="t-sm text-[var(--text-3)] flex-1 truncate">{r.description}</span><Badge tone="neutral">{r.scope}</Badge></div>)}
                <div className="p-[var(--pad)]"><Note tone="info">User accounts, passwords and PINs are created here once the server is connected. In this build the accounts are the demo set.</Note></div>
              </Panel>
            </div>
          )}
          {section === 'sites' && (
            <div className="grid gap-[var(--gap)] xl:grid-cols-2 items-start">
              <Panel title="Process stages" sub={SITES[site].name} pad={false}>{SITES[site].stages.map((st) => <div key={st.code} className="flex items-center gap-3 px-[var(--pad)] min-h-[var(--row-h)] border-b border-[var(--line)] last:border-b-0"><span className="size-6 rounded-md bg-[var(--surface-3)] grid place-items-center num t-xs font-semibold">{st.sequence}</span><span className="t-base font-medium flex-1">{st.name}</span><span className="t-sm text-[var(--text-3)]">{st.inputUnit} in · {st.outputUnit} out</span>{st.producesLabel && <Badge tone="accent">prints {st.producesLabel} label</Badge>}</div>)}
                {SITES[site].toBeConfirmed && <div className="p-[var(--pad)]"><Note tone="warn">{SITES[site].toBeConfirmed}</Note></div>}
              </Panel>
              <Panel title="Shifts" sub={SITES[site].name}>
                {SITES[site].shifts.map((sh) => <div key={sh.kind} className="flex justify-between h-8 items-center border-b border-[var(--line)] last:border-b-0 t-base"><span className="capitalize font-medium">{sh.kind} shift</span><span className="num">{sh.starts} to {sh.ends}</span></div>)}
                <Note tone="info" className="mt-3">Stages and shifts shape the screens themselves, so they are set up with Vivacom when a site is commissioned. Adding a fourth site is configuration of this kind, not a rebuild.</Note>
              </Panel>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
