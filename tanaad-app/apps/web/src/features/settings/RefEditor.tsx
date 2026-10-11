import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Power, X } from 'lucide-react';
import type { RefItem, SiteCode } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { refList } from '@/data/selectors';
import { Badge, Button, Empty, IconButton, Input, Panel, Select, cn } from '@/components/ui';
import type { ListMeta } from './lists';

/** One editor for every option list: add, rename, set value and colour, reorder, deactivate. Nothing is ever deleted. */
export function RefEditor({ meta, site, canEdit }: { meta: ListMeta; site?: SiteCode; canEdit: boolean }) {
  const s = useStore(); const scopeSite = meta.scope === 'site' ? site : undefined;
  const items = s.refs.filter((r) => r.list === meta.key && r.siteId === scopeSite).sort((a, b) => a.order - b.order);
  const parents = meta.parent ? refList(s, meta.parent, site, { includeInactive: true }) : [];
  const [label, setLabel] = useState(''); const [value, setValue] = useState(''); const [color, setColor] = useState('#2a78d6'); const [parent, setParent] = useState('');
  const [editing, setEditing] = useState<string | null>(null); const [draft, setDraft] = useState<Partial<RefItem>>({});
  const first = useRef<HTMLInputElement>(null);
  const system = items.length > 0 && items.every((i) => i.system);
  const add = () => {
    const l = label.trim(); if (!l) return;
    if (items.some((i) => i.label.toLowerCase() === l.toLowerCase() && i.parentId === (parent || undefined))) { s.toast({ kind: 'warn', title: `"${l}" is already in this list` }); return; }
    if (meta.parent && !parent) { s.toast({ kind: 'warn', title: 'Choose what it belongs to first' }); return; }
    s.addRef({ list: meta.key, siteId: scopeSite, label: l, value: meta.value && value !== '' ? Number(value) : undefined, unit: meta.value?.unit, color: meta.color ? color : undefined, parentId: parent || undefined });
    s.toast({ kind: 'ok', title: `${l} added to ${meta.title.toLowerCase()}` }); setLabel(''); setValue(''); first.current?.focus();
  };
  const save = (id: string) => { if (!draft.label?.trim()) return; s.updateRef(id, { label: draft.label.trim(), value: draft.value, color: draft.color, parentId: draft.parentId }); setEditing(null); s.toast({ kind: 'ok', title: 'Saved' }); };
  return (
    <Panel title={meta.title} sub={meta.help} pad={false} actions={<><Badge tone="neutral">{items.filter((i) => i.active).length} active</Badge>{items.some((i) => i.example) && <Badge tone="warn">has examples to confirm</Badge>}</>}>
      {canEdit && !system && (
        <form onSubmit={(e) => { e.preventDefault(); add(); }} className="flex flex-wrap items-center gap-2 px-[var(--pad)] py-2.5 border-b border-[var(--line)] bg-[var(--surface-2)]">
          <Input ref={first} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`New ${meta.title.toLowerCase().replace(/s$/, '')}`} className="max-w-[260px]" aria-label="Name" />
          {meta.parent && <Select value={parent} onChange={(e) => setParent(e.target.value)} className="max-w-[190px]" aria-label="Belongs to"><option value="">Belongs to…</option>{parents.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>}
          {meta.value && <div className="relative max-w-[150px]"><Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))} placeholder={meta.value.label} className="pr-14 num" aria-label={meta.value.label} /><span className="absolute right-2.5 top-1/2 -translate-y-1/2 t-xs text-[var(--text-3)] pointer-events-none">{meta.value.unit}</span></div>}
          {meta.color && <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="ctl w-10 rounded-md border border-[var(--line-2)] bg-[var(--surface)] p-0.5 cursor-pointer" aria-label="Colour" />}
          <Button type="submit" variant="primary" icon={Plus} disabled={!label.trim()}>Add</Button>
        </form>
      )}
      {items.length === 0 ? <div className="p-[var(--pad)]"><Empty title={`No ${meta.title.toLowerCase()} yet`} hint={canEdit ? 'Add the first one above. It becomes available on every screen that uses this list straight away.' : 'A Site Manager or Group Admin can add them.'} /></div> : (
        <div>
          {items.map((it, i) => {
            const on = editing === it.id; const par = parents.find((p) => p.id === it.parentId);
            return (
              <div key={it.id} className={cn('flex items-center gap-2.5 px-[var(--pad)] min-h-[var(--row-h)] border-b border-[var(--line)] last:border-b-0', !it.active && 'opacity-55')}>
                <span className="num t-xs text-[var(--text-4)] w-5 text-right">{i + 1}</span>
                {meta.color && (on ? <input type="color" value={draft.color ?? it.color ?? '#888888'} onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))} className="size-6 rounded border border-[var(--line-2)] p-0 cursor-pointer" /> : <span className="size-3 rounded-[3px] shrink-0 border border-black/10" style={{ background: it.color ?? 'var(--text-4)' }} />)}
                {on ? <>
                  <Input autoFocus value={draft.label ?? ''} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') save(it.id); if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }} className="max-w-[260px]" />
                  {meta.parent && <Select value={draft.parentId ?? ''} onChange={(e) => setDraft((d) => ({ ...d, parentId: e.target.value }))} className="max-w-[180px]">{parents.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>}
                  {meta.value && <Input inputMode="decimal" value={draft.value ?? ''} onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value === '' ? undefined : Number(e.target.value.replace(/[^0-9.]/g, '')) }))} className="max-w-[110px] num" />}
                  <span className="flex-1" />
                  <IconButton icon={Check} label="Save" onClick={() => save(it.id)} /><IconButton icon={X} label="Cancel" onClick={() => setEditing(null)} />
                </> : <>
                  <span className="t-base font-medium truncate">{it.label}</span>
                  {par && <Badge tone="neutral">{par.label}</Badge>}
                  {meta.value && it.value !== undefined && <span className="num t-sm text-[var(--text-2)]">{it.value.toLocaleString()} {meta.value.unit}</span>}
                  {it.system && <Badge tone="brand">enforced</Badge>}
                  {it.example && <Badge tone="warn">example, confirm with site</Badge>}
                  {!it.active && <Badge tone="neutral">inactive</Badge>}
                  <span className="flex-1" />
                  {canEdit && <span className="flex items-center">
                    <IconButton icon={ArrowUp} label="Move up" disabled={i === 0} onClick={() => s.moveRef(it.id, -1)} />
                    <IconButton icon={ArrowDown} label="Move down" disabled={i === items.length - 1} onClick={() => s.moveRef(it.id, 1)} />
                    <IconButton icon={Pencil} label="Edit" onClick={() => { setEditing(it.id); setDraft({ label: it.label, value: it.value, color: it.color, parentId: it.parentId }); }} />
                    {!it.system && <IconButton icon={Power} label={it.active ? 'Deactivate' : 'Reactivate'} onClick={() => s.updateRef(it.id, { active: !it.active })} />}
                  </span>}
                </>}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
