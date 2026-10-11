import { useMemo, useState } from 'react';
import { BarChart3, Check, CloudOff, Database, Download, History, Lock, MonitorSmartphone, Pencil, RotateCcw, Scale, ShieldAlert, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import type { AuditEvent, SiteCode } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useQueryParam } from '@/app/hooks';
import { Avatar, Badge, Bar, Button, Empty, Kbd, KpiStrip, Meter, Note, PageHeader, Panel, SearchInput, Sheet, Split, StackedBar, Stat, Tabs, Toolbar, cn, useHotkey, type Tone } from '@/components/ui';
import { CountUp } from '@/components/charts';
import { SITES, SITE_LIST } from '@/config/sites';
import { SITE_COLOR } from '@/config/siteIdentity';
import { addDays } from '@/data/selectors';
import { fmtDateTime, fmtDayLong, fmtNum, fmtTime } from '@/data/format';
import { IconChip, KV, ReasonQuote, SiteBadge, Wrap, downloadCsv, plural, rovingKeys } from './shared';

type Flag = NonNullable<AuditEvent['flag']>;
type FlagFilter = Flag | 'all' | 'corrections';
const FLAGS: { value: Flag; label: string; tone: Tone; color: string; icon: LucideIcon }[] = [
  { value: 'edit', label: 'Edit', tone: 'warn', color: 'var(--warn)', icon: Pencil },
  { value: 'reopen', label: 'Reopening', tone: 'bad', color: 'var(--bad)', icon: RotateCcw },
  { value: 'override', label: 'Override', tone: 'bad', color: 'var(--bad)', icon: ShieldAlert },
  { value: 'variance', label: 'Variance', tone: 'accent', color: 'var(--accent)', icon: Scale },
  { value: 'normal', label: 'Normal', tone: 'neutral', color: 'var(--text-3)', icon: Check },
];
const flagMeta = (f?: Flag) => FLAGS.find((x) => x.value === (f ?? 'normal'))!;
/** "CashDayReopened" → "Cash day reopened" */
const humanKind = (k: string) => { const t = k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase(); return t[0].toUpperCase() + t.slice(1); };

/** Append-only feed of who changed what, where, from which device, and why. */
export function AuditFeed() {
  const s = useStore();
  const q0 = useQueryParam('q'); const [q, setQ] = useState(q0 ?? '');
  const [site, setSite] = useState<SiteCode | 'all'>('all');
  const [flag, setFlag] = useState<FlagFilter>('all');
  const [limit, setLimit] = useState(40);
  const [inspect, setInspect] = useState<AuditEvent | null>(null);

  const sorted = useMemo(() => [...s.audit].sort((a, b) => b.at.localeCompare(a.at)), [s.audit]);
  const hasFlag = (a: AuditEvent, f: FlagFilter) => f === 'all' || (f === 'corrections' ? a.flag === 'edit' || a.flag === 'reopen' : (a.flag ?? 'normal') === f);
  const inSite = (a: AuditEvent) => site === 'all' || a.siteId === site;
  const rows = useMemo(() => { const t = q.trim().toLowerCase(); return sorted.filter((a) => inSite(a) && hasFlag(a, flag) && (!t || `${a.summary} ${a.actorName} ${a.kind} ${humanKind(a.kind)} ${a.reason ?? ''} ${a.deviceId}`.toLowerCase().includes(t))); }, [sorted, site, flag, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = rows.slice(0, limit);
  const byDay = useMemo(() => { const m = new Map<string, AuditEvent[]>(); for (const a of shown) { const d = a.at.slice(0, 10); m.set(d, [...(m.get(d) ?? []), a]); } return [...m.entries()]; }, [shown]);

  const pending = s.events.filter((e) => !e.synced).length;
  const counts = useMemo(() => Object.fromEntries(FLAGS.map((f) => [f.value, s.audit.filter((a) => (a.flag ?? 'normal') === f.value).length])) as Record<Flag, number>, [s.audit]);
  const tally = <T,>(items: T[], key: (x: T) => string) => { const m = new Map<string, number>(); for (const x of items) m.set(key(x), (m.get(key(x)) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const byKind = tally(rows, (a) => a.kind).slice(0, 7); const byActor = tally(rows, (a) => a.actorName).slice(0, 5); const bySession = tally(s.events, (e) => e.type).slice(0, 6);
  const perDay = Array.from({ length: 10 }, (_, i) => { const d = addDays(s.today, i - 9); return s.audit.filter((a) => a.at.startsWith(d)).length; });
  const flagPerDay = (f: Flag) => Array.from({ length: 10 }, (_, i) => { const d = addDays(s.today, i - 9); return s.audit.filter((a) => a.at.startsWith(d) && a.flag === f).length; });
  const siteSegments = [...SITE_LIST.map((x) => ({ label: x.name, value: rows.filter((a) => a.siteId === x.id).length, color: SITE_COLOR[x.id] })), { label: 'Head Office', value: rows.filter((a) => !a.siteId).length, color: SITE_COLOR.group }];
  const event = inspect ? s.events.find((e) => e.type === inspect.kind && e.occurredAt === inspect.at) : undefined;

  const exportCsv = () => downloadCsv(`audit-feed-${s.today}.csv`, ['When', 'Site', 'Kind', 'Flag', 'Summary', 'Reason', 'Who', 'Actor id', 'Device', 'Line id'], rows.map((a) => [a.at, a.siteId ? SITES[a.siteId].name : 'Head Office', a.kind, a.flag ?? 'normal', a.summary, a.reason, a.actorName, a.actorId, a.deviceId, a.id]));
  useHotkey('c', () => setFlag((f) => (f === 'corrections' ? 'all' : 'corrections')), { label: 'Show edits and reopenings only' });

  return (
    <div>
      <PageHeader eyebrow="Head Office" title="Audit feed" meta={<Badge tone="ok"><Lock className="size-3" />Append-only</Badge>}
        subtitle="Who changed what, where, from which device, and why. Nothing in this feed can be deleted: a correction adds a new line, it never erases the old one."
        actions={<Button icon={Download} hotkey="e" hotkeyLabel="Export the feed as CSV" onClick={exportCsv}>Export</Button>} />

      <div className="flex flex-col gap-[var(--gap)]">
        <KpiStrip>
          <Stat label="Session events" icon={Database} accent="var(--series-1)" value={<CountUp value={s.events.length} />} spark={perDay} sub={<Wrap>{fmtNum(s.audit.length)} audit lines on record</Wrap>} onClick={() => setFlag('all')} />
          <Stat label="Pending sync" icon={CloudOff} accent={pending ? 'var(--warn)' : 'var(--series-3)'} tone={pending ? 'warn' : 'neutral'} value={<CountUp value={pending} />} sub={<Wrap>{s.online ? 'Online · outbox clear' : 'Offline · will sync when back'}</Wrap>} />
          <Stat label="Edits" icon={Pencil} accent="var(--warn)" value={<CountUp value={counts.edit} />} spark={flagPerDay('edit')} sparkColor="var(--text-4)" sub={<Wrap>A saved record was changed</Wrap>} onClick={() => setFlag('edit')} />
          <Stat label="Reopenings" icon={RotateCcw} accent="var(--bad)" value={<CountUp value={counts.reopen} />} spark={flagPerDay('reopen')} sparkColor="var(--text-4)" sub={<Wrap>A closed day was opened again</Wrap>} onClick={() => setFlag('reopen')} />
          <Stat label="Overrides" icon={ShieldAlert} accent="var(--bad)" value={<CountUp value={counts.override} />} spark={flagPerDay('override')} sparkColor="var(--text-4)" sub={<Wrap>A lock was lifted with a PIN</Wrap>} onClick={() => setFlag('override')} />
        </KpiStrip>

        <Split asideWidth={340} aside={<>
          <Note tone="ok" icon={ShieldCheck}><span className="font-medium">Append-only by design.</span> Every line is written once with the person, the device and the time. Corrections are new lines that point at the old one; there is no delete, for anyone.</Note>
          <Panel icon={BarChart3} title="By event type" sub="lines in view">
            {byKind.length === 0 ? <div className="t-sm text-[var(--text-3)]">Nothing in view.</div> : byKind.map(([k, n]) => <Meter key={k} label={humanKind(k)} value={n} max={byKind[0][1]} display={fmtNum(n)} />)}
          </Panel>
          <Panel icon={History} title="By site" sub="lines in view">
            <StackedBar segments={siteSegments} />
          </Panel>
          <Panel icon={Users} title="Who wrote them" sub="lines in view" pad={false}>
            {byActor.length === 0 ? <div className="p-[var(--pad)] t-sm text-[var(--text-3)]">Nothing in view.</div> : byActor.map(([name, n]) => (
              <div key={name} className="flex items-center gap-2.5 px-[var(--pad)] h-[var(--row-h)] border-b border-[var(--line)] last:border-b-0"><Avatar name={name} size={22} /><span className="t-base truncate flex-1 min-w-0">{name}</span><span className="w-[64px] shrink-0"><Bar value={n} max={byActor[0][1]} tone="series" /></span><span className="num t-base font-medium w-6 text-right">{n}</span></div>
            ))}
          </Panel>
          <Panel icon={Database} title="This session" sub={`${plural(s.events.length, 'event')} · ${pending} to sync`}>
            {bySession.length === 0 ? <div className="t-sm text-[var(--text-3)]">No events written yet this session. Every action on a site screen appends one, online or offline.</div> : bySession.map(([t, n]) => <Meter key={t} label={humanKind(t)} value={n} max={bySession[0][1]} display={fmtNum(n)} tone="neutral" />)}
          </Panel>
        </>}>
          <Toolbar>
            <SearchInput value={q} onChange={setQ} placeholder="Search the feed" />
            <Tabs value={site} onChange={setSite} tabs={[{ value: 'all' as const, label: 'All sites' }, ...SITE_LIST.map((x) => ({ value: x.id, label: <><span className="size-2 rounded-[2px]" style={{ background: SITE_COLOR[x.id] }} />{x.shortName}</> }))]} />
            <Tabs value={flag} onChange={(v) => { setFlag(v); setLimit(40); }} tabs={[{ value: 'all' as const, label: 'All' }, { value: 'corrections' as const, label: <>Edits and reopenings<Kbd keys="c" /></>, count: counts.edit + counts.reopen }, ...FLAGS.map((f) => ({ value: f.value, label: f.label, count: counts[f.value] }))]} />
          </Toolbar>

          <Panel pad={false} icon={History} title="Timeline" sub={`${rows.length} of ${s.audit.length} · newest first`}
            actions={<span className="touch:hidden inline-flex items-center gap-1 t-xs text-[var(--text-3)] pr-1.5"><Kbd keys="arrowup" /><Kbd keys="arrowdown" />move<Kbd keys="enter" />open</span>}
            footer={rows.length > limit ? <div className="flex items-center justify-between gap-3"><span>Showing {limit} of {rows.length}</span><Button size="sm" onClick={() => setLimit((l) => l + 40)}>Show {Math.min(40, rows.length - limit)} more</Button></div> : rows.length ? <span>End of the feed for these filters. The first line on record is {fmtDateTime(sorted[sorted.length - 1].at)}.</span> : undefined}>
            {rows.length === 0 ? <div className="p-[var(--pad)]"><Empty icon={ShieldCheck} title="Nothing matches" hint="Change the filters. Edits, reopenings and overrides are rare by design." /></div> : (
              <div onKeyDown={rovingKeys}>
                {byDay.map(([day, items], di) => (
                  <section key={day}>
                    <div className="flex items-center justify-between gap-3 px-[var(--pad)] h-7 touch:h-8 bg-[var(--surface-2)] border-b border-[var(--line)] t-label"><span>{fmtDayLong(day)}{day === s.today ? ' · today' : ''}</span><span className="num font-medium text-[var(--text-4)]">{items.length}</span></div>
                    <div className="relative">
                      <span className="absolute top-0 bottom-0 w-px bg-[var(--line)] left-[calc(var(--pad)+13.5px)] touch:left-[calc(var(--pad)+15.5px)]" aria-hidden />
                      {items.map((a, i) => {
                        const m = flagMeta(a.flag); const serious = a.flag === 'reopen' || a.flag === 'override';
                        return (
                          <button key={a.id} data-roving tabIndex={di === 0 && i === 0 ? 0 : -1} onClick={() => setInspect(a)}
                            className={cn('relative w-full flex items-start gap-3 px-[var(--pad)] py-2.5 text-left border-b border-[var(--line)] hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:bg-[var(--selected)] focus-visible:shadow-[inset_2px_0_0_var(--focus)]', serious && 'bg-[color-mix(in_srgb,var(--bad)_5%,transparent)]', inspect?.id === a.id && 'bg-[var(--selected)]')}>
                            <span className="relative rounded-md bg-[var(--surface)] shrink-0"><IconChip icon={m.icon} color={m.color} title={m.label} /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block t-base font-medium leading-snug">{a.summary}</span>
                              {a.reason && <ReasonQuote className="mt-1">{a.reason}</ReasonQuote>}
                              <span className="flex items-center gap-x-2.5 gap-y-1 flex-wrap mt-1.5 t-sm text-[var(--text-3)]">
                                <SiteBadge site={a.siteId} />
                                {a.flag && a.flag !== 'normal' && <Badge tone={m.tone} dot>{m.label}</Badge>}
                                <span className="inline-flex items-center gap-1.5 text-[var(--text-2)]"><Avatar name={a.actorName} size={16} />{a.actorName}</span>
                                <span className="inline-flex items-center gap-1"><MonitorSmartphone className="size-3.5" /><span className="code">{a.deviceId}</span></span>
                                <span className="code max-sm:hidden">{a.kind}</span>
                              </span>
                            </span>
                            <span className="num t-sm text-[var(--text-3)] whitespace-nowrap mt-0.5">{fmtTime(a.at)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </Panel>
        </Split>
      </div>

      <Sheet open={!!inspect} onClose={() => setInspect(null)} title="Audit line" sub={inspect ? `${humanKind(inspect.kind)} · ${fmtDateTime(inspect.at)}` : undefined}>
        {inspect && (() => { const m = flagMeta(inspect.flag); return (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3"><IconChip icon={m.icon} color={m.color} size="lg" /><div className="min-w-0"><div className="flex items-center gap-1.5 flex-wrap mb-1"><SiteBadge site={inspect.siteId} /><Badge tone={m.tone} dot>{m.label}</Badge></div><div className="t-lg font-semibold leading-snug">{inspect.summary}</div></div></div>
            {inspect.reason ? <ReasonQuote>{inspect.reason}</ReasonQuote> : <p className="t-sm text-[var(--text-3)]">No reason was needed for this kind of line.</p>}
            <div className="surface-2 px-3 py-1">
              <KV k="When" v={fmtDateTime(inspect.at)} />
              <KV k="Who" v={<span className="inline-flex items-center gap-1.5"><Avatar name={inspect.actorName} size={18} />{inspect.actorName}</span>} />
              <KV k="Actor id" v={<span className="code">{inspect.actorId}</span>} />
              <KV k="Device" v={<span className="code">{inspect.deviceId}</span>} />
              <KV k="Where" v={inspect.siteId ? SITES[inspect.siteId].name : 'Head Office'} />
              <KV k="Event type" v={<span className="code">{inspect.kind}</span>} />
              <KV k="Line id" v={<span className="code">{inspect.id}</span>} />
              <KV k="Sync" v={event ? <Badge tone={event.synced ? 'ok' : 'warn'} dot>{event.synced ? 'Synced' : 'Waiting in the outbox'}</Badge> : <Badge tone="ok" dot>Synced</Badge>} />
            </div>
            {event !== undefined && event.payload !== undefined && <div><div className="t-label mb-1">Event payload</div><pre className="code t-xs surface-2 p-2.5 overflow-auto max-h-[220px] whitespace-pre-wrap break-all m-0">{JSON.stringify(event.payload, null, 2).slice(0, 1200)}</pre></div>}
            <Note tone="neutral" icon={Lock}>This line cannot be edited or deleted. To correct it, change the record on its site screen: that writes a new line with your name and reason.</Note>
          </div>
        ); })()}
      </Sheet>
    </div>
  );
}
