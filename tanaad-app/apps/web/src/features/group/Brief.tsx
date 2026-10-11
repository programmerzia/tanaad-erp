import { useMemo, useState } from 'react';
import { ArrowRight, Bell, CheckCheck, Clock, CreditCard, Flame, Lock, MessageSquareText, Send, Settings2, Table2, Users, Wallet, type LucideIcon } from 'lucide-react';
import type { SiteSettings } from '@tanaad/domain';
import { useGo } from '@/app/hooks';
import { SITE_COLOR } from '@/config/siteIdentity';
import { roleLabel } from '@/config/roles';
import { useStore } from '@/data/store';
import { Avatar, Badge, Bar, Button, DataGrid, Kbd, PageHeader, Panel, Split, Tabs, cn, useHotkey, type Column } from '@/components/ui';
import { WhatsAppPreview } from '@/components/WhatsAppPreview';
import { messaging } from '@/devices';
import { SITE_LIST } from '@/config/sites';
import { cashDayFor, cashInSafe, cashSummary, headcount, massBalanceDay, openExceptions, outputToday } from '@/data/selectors';
import { compact, fmtDayLong, fmtNum, fmtTime, fmtUGX } from '@/data/format';
import { IconChip, KV, SiteBadge, SiteMark, Switch, plural, unitName } from './shared';

/** The four alert kinds the system raises. Their limits are the site rules kept in Settings; nothing is written here. */
interface Rule { id: string; icon: LucideIcon; title: string; detail: string; limit?: (st: SiteSettings) => string }
const RULES: Rule[] = [
  { id: 'gate', icon: Lock, title: 'Gate lock', detail: 'Scale weight outside the gate tolerance, or a bundle count mismatch.', limit: (st) => `±${st.gateTolerancePct}%` },
  { id: 'cash', icon: Wallet, title: 'Cash variance over threshold', detail: 'Counted closing differs from expected by more than the site threshold.', limit: (st) => fmtUGX(st.cashVariance) },
  { id: 'mass', icon: Flame, title: 'Mass gap', detail: 'Kilos in minus kilos out, work in progress and waste exceeds the allowed loss.', limit: (st) => `${st.massGapPct}%` },
  { id: 'credit', icon: CreditCard, title: 'Credit over limit', detail: 'An export order would take a client past the credit limit on its client record.' },
];

/** One alert rule with its switch. Digits 1–4 flip the rules from the keyboard. */
function RuleRow({ rule, index, on, onToggle }: { rule: Rule; index: number; on: boolean; onToggle: () => void }) {
  const settings = useStore((x) => x.siteSettings);
  useHotkey(String(index + 1), onToggle, { label: `Turn the "${rule.title}" alert on or off` });
  return (
    <div className="px-[var(--pad)] py-2.5 border-b border-[var(--line)] last:border-b-0">
      <div className="flex items-start gap-2.5">
        <IconChip icon={rule.icon} color={on ? 'var(--accent)' : 'var(--text-4)'} />
        <div className="min-w-0 flex-1"><div className={cn('t-base font-medium', !on && 'text-[var(--text-3)]')}>{rule.title}</div><div className="t-sm text-[var(--text-3)]">{rule.detail}</div></div>
        <div className="flex items-center gap-2 mt-0.5"><Kbd keys={String(index + 1)} /><Switch checked={on} onChange={onToggle} label={rule.title} /></div>
      </div>
      {rule.limit && <div className="flex flex-wrap gap-1.5 mt-2">{SITE_LIST.map((x) => <span key={x.id} className="inline-flex items-center gap-1.5 h-[20px] touch:h-[24px] pl-1.5 pr-1.5 rounded-[5px] bg-[var(--surface-2)] border border-[var(--line)] t-xs"><span className="size-1.5 rounded-[2px]" style={{ background: SITE_COLOR[x.id] }} /><span className="text-[var(--text-2)]">{x.shortName}</span><span className="num font-semibold">{rule.limit!(settings[x.id])}</span></span>)}</div>}
    </div>
  );
}

/** The WhatsApp brief, rendered from live data, one message per CEO. */
export function Brief() {
  const s = useStore(); const toast = useStore((x) => x.toast); const go = useGo();
  const [on, setOn] = useState<Record<string, boolean>>({ gate: true, cash: true, mass: true, credit: true });
  const [sending, setSending] = useState(false); const [sentAt, setSentAt] = useState<string | null>(null); const [sentIds, setSentIds] = useState<string[]>([]);
  const ceos = s.users.filter((u) => u.roles.some((r) => r.role === 'ceo'));
  const managers = s.users.filter((u) => u.roles.some((r) => r.role === 'site_manager'));
  const [who, setWho] = useState(ceos[0]?.id ?? '');
  const toggle = (id: string) => setOn((o) => ({ ...o, [id]: !o[id] }));

  /* The five numbers per site, once: the message and the table below both read from this. */
  const sites = useMemo(() => SITE_LIST.map((site) => {
    const hc = headcount(s, site.id, s.today); const o = outputToday(s, site.id, s.today); const units = o.reduce((t, x) => t + x.units, 0); const target = o.reduce((t, x) => t + x.target, 0);
    const cd = cashDayFor(s, site.id, s.today); const cash = cd ? cashSummary(s, cd.id).expectedClosing : cashInSafe(s, site.id);
    const dsp = s.dispatches.filter((d) => d.siteId === site.id && d.createdAt.startsWith(s.today)).length; const ex = openExceptions(s, site.id);
    return { site, hc: hc.total, units, target, cash, dsp, ex: ex.length, critical: ex.filter((e) => e.severity === 'critical').length };
  }), [s]);
  type SiteLine = (typeof sites)[number];
  const needs = useMemo(() => [
    ...openExceptions(s).filter((e) => e.severity === 'critical' || e.ownerRole === 'ceo').map((e) => e.title),
    ...SITE_LIST.map((site) => ({ site, ...massBalanceDay(s, site.id, s.today) })).filter((m) => m.state === 'missing').map((m) => `${m.site.shortName}: ${fmtNum(m.gapKg)} kg unaccounted today`),
  ], [s]);

  const lines = useMemo(() => {
    const out: string[] = [`*Tanaad · ${fmtDayLong(s.today)}*`, ''];
    for (const x of sites) out.push(`*${x.site.name}*`, `• ${x.hc} on shift`, `• ${fmtNum(x.units)} ${unitName(x.site.id)}${x.target ? ` of ${fmtNum(x.target)} target (${Math.round((x.units / x.target) * 100)}%)` : ''}`, `• Cash UGX ${compact(x.cash)}`, `• ${x.dsp} dispatch${x.dsp === 1 ? '' : 'es'}`, `• ${x.ex} exception${x.ex === 1 ? '' : 's'} open${x.critical ? ` (${x.critical} critical)` : ''}`, '');
    if (needs.length) { out.push('*Needs you:*'); for (const n of needs) out.push(`→ ${n}`); } else out.push('Nothing needs you right now.');
    return out;
  }, [s.today, sites, needs]);

  const sendNow = async () => {
    if (sending) return;
    setSending(true);
    const ids: string[] = [];
    for (const c of ceos) { const r = await messaging.sendWhatsApp(c.name, lines.join('\n')); ids.push(r.id); }
    setSending(false); setSentAt(new Date().toISOString()); setSentIds(ids);
    toast({ kind: 'ok', title: `Brief sent to ${ceos.map((c) => c.name.split(' ')[0]).join(' and ')}`, detail: ids.join(' · ') });
  };

  const cols: Column<SiteLine>[] = [
    { key: 'site', header: 'Site', cell: (x) => <span className="inline-flex items-center gap-2 font-medium"><SiteMark site={x.site.id} size={20} />{x.site.name}</span> },
    { key: 'hc', header: 'On shift', align: 'right', mono: true, cell: (x) => fmtNum(x.hc) },
    { key: 'out', header: 'Output', align: 'right', mono: true, cell: (x) => <>{fmtNum(x.units)} <span className="text-[var(--text-3)]">{unitName(x.site.id)}</span></> },
    { key: 'tg', header: 'Of shift target', width: 150, cell: (x) => (x.target ? <span className="flex items-center gap-2"><Bar value={x.units} max={Math.max(x.target, x.units)} tone="series" className="w-[72px]" /><span className="num">{Math.round((x.units / x.target) * 100)}%</span></span> : <span className="text-[var(--text-4)]">no benchmark</span>) },
    { key: 'cash', header: 'Cash, UGX', align: 'right', mono: true, cell: (x) => <span className="font-medium">{compact(x.cash)}</span> },
    { key: 'dsp', header: 'Dispatches', align: 'right', mono: true, cell: (x) => fmtNum(x.dsp) },
    { key: 'ex', header: 'Exceptions', align: 'right', cell: (x) => (x.critical ? <Badge tone="bad" dot>{x.ex} · {x.critical} critical</Badge> : x.ex ? <Badge tone="warn">{x.ex} open</Badge> : <Badge tone="ok">clear</Badge>) },
  ];
  const active = Object.values(on).filter(Boolean).length;

  return (
    <div>
      <PageHeader eyebrow="Head Office" title="Morning brief"
        meta={sentAt ? <Badge tone="ok" dot>Sent {fmtTime(sentAt)} (simulated)</Badge> : <Badge tone="neutral" dot>Not sent today</Badge>}
        subtitle="Five numbers per site on WhatsApp, and what needs you. Rendered now from live data so you can see exactly what will go out."
        actions={<Button variant="primary" icon={Send} disabled={sending} onClick={sendNow} hotkey="mod+enter" hotkeyLabel="Send the brief now">{sending ? 'Sending…' : 'Send now'}</Button>} />

      <Split aside={<>
        <Panel icon={Clock} title="Schedule" sub={sentAt ? 'sent by hand today' : 'sent by hand'}
          footer={<div className="flex items-center justify-between gap-3"><span>The daily send time is not a stored setting yet.</span><Button size="sm" variant="ghost" icon={Settings2} onClick={() => go.group('settings')}>Settings</Button></div>}>
          <KV k="Daily send time" v={<Badge tone="warn" dot>To be set</Badge>} />
          <KV k="Sent by hand today" v={sentAt ? <span className="inline-flex items-center gap-1 text-[var(--ok)]"><CheckCheck className="size-3.5" />{fmtTime(sentAt)} · {plural(sentIds.length, 'message')}</span> : 'not yet'} />
          <KV k="Recipients" v={plural(ceos.length, 'person', 'people')} />
          <KV k="Message" v={`${plural(lines.filter((l) => l.startsWith('•')).length, 'number')} · ${plural(needs.length, 'item')} for you`} />
          <KV k="Alert rules on" v={`${active} of ${RULES.length}`} />
          {sentIds.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{sentIds.map((id) => <span key={id} className="code t-xs px-1.5 py-0.5 rounded-[4px] bg-[var(--surface-3)] text-[var(--text-2)]">{id}</span>)}</div>}
        </Panel>

        <Panel icon={Users} title="Recipients" sub={`${ceos.length} get the brief`} pad={false}>
          <div className="px-[var(--pad)] h-7 touch:h-8 flex items-center bg-[var(--surface-2)] border-b border-[var(--line)] t-label">Brief and alerts</div>
          {ceos.map((c) => (
            <div key={c.id} className="flex items-center gap-2.5 px-[var(--pad)] py-2 border-b border-[var(--line)]">
              <Avatar name={c.name} seed={c.avatarSeed} size={28} />
              <div className="min-w-0 flex-1"><div className="t-base font-medium truncate">{c.name}</div><div className="t-sm text-[var(--text-3)]">{roleLabel('ceo')}</div></div>
              <Badge tone={sentAt ? 'ok' : 'neutral'} dot>{sentAt ? 'Delivered' : 'Not sent'}</Badge>
            </div>
          ))}
          {managers.length > 0 && <div className="px-[var(--pad)] h-7 touch:h-8 flex items-center bg-[var(--surface-2)] border-b border-[var(--line)] t-label">Alerts for their site</div>}
          {managers.map((m) => (
            <div key={m.id} className="flex items-center gap-2.5 px-[var(--pad)] py-1.5 border-b border-[var(--line)] last:border-b-0">
              <Avatar name={m.name} seed={m.avatarSeed} size={24} />
              <div className="min-w-0 flex-1 t-base truncate">{m.name}<span className="t-sm text-[var(--text-3)]"> · {roleLabel('site_manager')}</span></div>
              <span className="flex gap-1">{m.roles.filter((r) => r.role === 'site_manager' && r.siteId).map((r) => <SiteBadge key={r.siteId} site={r.siteId} />)}</span>
            </div>
          ))}
        </Panel>

        <Panel icon={Bell} title="Instant alerts" sub={`${active} of ${RULES.length} on`} pad={false}
          footer={<>Limits are each site's rules in Settings. The switches apply to this session; they are not a stored setting yet.</>}>
          {RULES.map((r, i) => <RuleRow key={r.id} rule={r} index={i} on={on[r.id]} onToggle={() => toggle(r.id)} />)}
        </Panel>
      </>}>
        <div className="flex flex-col gap-[var(--gap)]">
          <Panel icon={MessageSquareText} title="Preview" sub={`${plural(ceos.length, 'message')}, composed now`} actions={<Tabs className="md:hidden" value={who} onChange={setWho} tabs={ceos.map((c) => ({ value: c.id, label: c.name.split(' ')[0] }))} />}
            footer={<span>{plural(lines.filter((l) => l.startsWith('•')).length, 'number')} and {plural(needs.length, 'item')} that need you. The text is rebuilt from the records every time this page opens, so it cannot drift from the screens.</span>}>
            <div className="grid gap-[var(--gap)] md:grid-cols-2">
              {ceos.map((c) => (
                <div key={c.id} className={cn('min-w-0', c.id !== who && 'max-md:hidden')}>
                  <div className="flex items-center gap-2 mb-2"><Avatar name={c.name} seed={c.avatarSeed} size={24} /><span className="t-base font-medium truncate">{c.name}</span><span className="t-sm text-[var(--text-3)]">{roleLabel('ceo')}</span><Badge className="ml-auto" tone={sentAt ? 'ok' : 'neutral'} dot>{sentAt ? 'Delivered' : 'Preview'}</Badge></div>
                  <WhatsAppPreview className="w-full" to={c.name} lines={lines} sent={!!sentAt} />
                </div>
              ))}
            </div>
          </Panel>

          <Panel icon={Table2} title="Where the numbers come from" sub="the same records the site screens show" pad={false}
            footer={<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 num"><span>Group: {fmtNum(sites.reduce((t, x) => t + x.hc, 0))} on shift · UGX {compact(sites.reduce((t, x) => t + x.cash, 0))} in three safes · {plural(sites.reduce((t, x) => t + x.dsp, 0), 'dispatch', 'dispatches')}</span><span>{plural(sites.reduce((t, x) => t + x.ex, 0), 'exception')} open</span></div>}>
            <DataGrid bare rows={sites} columns={cols} rowKey={(x) => x.site.id} />
            <div className="border-t border-[var(--line)] px-[var(--pad)] py-2.5">
              <div className="t-label mb-1">Needs you · {needs.length}</div>
              {needs.length === 0 ? <div className="t-sm text-[var(--text-3)]">Nothing needs you right now.</div> : needs.map((n) => <div key={n} className="flex items-start gap-2 py-1 t-base"><ArrowRight className="size-3.5 text-[var(--accent-strong)] mt-[3px] shrink-0" />{n}</div>)}
            </div>
          </Panel>
        </div>
      </Split>
    </div>
  );
}
