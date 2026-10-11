import { useMemo, useState } from 'react';
import { Banknote, CalendarClock, Download, UserPlus, Layers, LineChart as LineIcon, RefreshCw, Share2, UserCheck, Users } from 'lucide-react';
import type { EngagementType, SiteCode } from '@tanaad/domain';
import { contractDaysRemaining } from '@tanaad/domain';
import { useGo, useRefList } from '@/app/hooks';
import { useStore } from '@/data/store';
import { Avatar, Badge, Bar, Button, ChipGroup, DataGrid, Empty, KpiStrip, Meter, Panel, Sheet, StackedBar, Stat, type Column } from '@/components/ui';
import { CountUp, Delta, Donut, Legend, LineChart, pctChange } from '@/components/charts';
import { SITE_LIST, SITES } from '@/config/sites';
import { SITE_COLOR } from '@/config/siteIdentity';
import { addDays, currentShiftKind, dailySeries, headcount, headcountBySector, lastWorkingDays, rosterFor } from '@/data/selectors';
import { compact, fmtDayShort, fmtNum, fmtUGX } from '@/data/format';
import { ENGAGEMENT, ENGAGEMENT_TYPES, Fact, Hero, SiteMark, SiteTag, downloadCsv, usd0 } from './kit';
import { Wrap } from './shared';

const plural2 = (n: number) => `${n} site${n === 1 ? '' : 's'}`;
const SHORT: Record<EngagementType, string> = { permanent: 'Permanent', contract: 'Contract', casual: 'Casual' };
const TREND_DAYS = 12;
/** Calendar constant: average weeks in a month. */
const WEEKS_A_MONTH = 52 / 12;

/** Headcount and wage cost per site, shared workers with their cost split, expiring contracts across the group. */
export function GroupPeople() {
  const s = useStore(); const renew = useStore((x) => x.renewContract); const toast = useStore((x) => x.toast);
  const [renewing, setRenewing] = useState<{ engId: string; name: string } | null>(null); const [termId, setTermId] = useState<string | null>(null); const go = useGo();
  const [sharedOpen, setSharedOpen] = useState<string | null>(null);
  const kind = currentShiftKind();

  const perSite = useMemo(() => SITE_LIST.map((site) => {
    const workDays = 7 - site.closedDays.length;
    const roster = rosterFor(s, site.id); const ids = s.shifts.filter((sh) => sh.siteId === site.id && sh.day === s.today).map((sh) => sh.id);
    const onShift = new Set(s.attendance.filter((a) => ids.includes(a.shiftId) && a.status !== 'absent').map((a) => a.personId));
    const rows = ENGAGEMENT_TYPES.map((type) => { const r = roster.filter((x) => x.engagement?.type === type && x.engagement.status === 'active'); const sum = r.reduce((t, x) => t + x.engagement!.rate, 0); return { type, active: r.length, onShift: r.filter((x) => onShift.has(x.person.id)).length, weekly: type === 'permanent' ? sum / WEEKS_A_MONTH : sum * workDays, monthly: type === 'permanent' ? sum : sum * workDays * WEEKS_A_MONTH }; });
    return { site, rows, total: { active: rows.reduce((t, r) => t + r.active, 0), onShift: onShift.size, weekly: rows.reduce((t, r) => t + r.weekly, 0), monthly: rows.reduce((t, r) => t + r.monthly, 0) } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [s.people, s.engagements, s.shifts, s.attendance, s.today]);

  const trend = useMemo(() => SITE_LIST.map((site) => ({ site, series: dailySeries(s, site.id, lastWorkingDays(site.id, s.today, TREND_DAYS)) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.attendance, s.shifts, s.today]);

  const since = addDays(s.today, -13);
  const shared = useMemo(() => s.people.filter((p) => p.shared && p.status === 'active').map((p) => {
    const dayOf = new Map(s.shifts.map((sh) => [sh.id, sh.day]));
    const att = s.attendance.filter((a) => a.personId === p.id && a.status !== 'absent' && (dayOf.get(a.shiftId) ?? '') >= since);
    const days = new Map<SiteCode, Set<string>>();
    for (const a of att) { const day = dayOf.get(a.shiftId); if (!day) continue; if (!days.has(a.workedSiteId)) days.set(a.workedSiteId, new Set()); days.get(a.workedSiteId)!.add(day); }
    const per = [p.homeSiteId, ...p.sharedSites].map((site) => ({ site, days: days.get(site)?.size ?? 0 })); const total = per.reduce((t, x) => t + x.days, 0) || 1;
    const eng = s.engagements.find((e) => e.personId === p.id && e.status === 'active');
    return { person: p, eng, per: per.map((x) => ({ ...x, pct: Math.round((x.days / total) * 100) })), total };
  }), [s.people, s.shifts, s.attendance, s.engagements, since]);

  const stateOf = (site: SiteCode, endDate?: string) => { const days = endDate ? contractDaysRemaining(endDate, s.today) : 0; return { days, state: !endDate ? 'open' as const : days < 0 ? 'expired' as const : days <= s.siteSettings[site].contractWarningDays ? 'expiring' as const : 'open' as const }; };
  const contracts = useMemo(() => s.engagements.filter((e) => e.type === 'contract' && (e.status === 'active' || e.status === 'expired')).map((e) => ({ eng: e, person: s.people.find((p) => p.id === e.personId)!, ...stateOf(e.siteId, e.endDate) })).filter((r) => r.person?.status === 'active' && (r.state === 'expiring' || r.state === 'expired')).sort((a, b) => a.days - b.days), [s.engagements, s.people, s.today, s.siteSettings]); // eslint-disable-line react-hooks/exhaustive-deps
  const warnDays = [...new Set(SITE_LIST.map((x) => s.siteSettings[x.id].contractWarningDays))].sort((a, b) => a - b);
  const warnLabel = warnDays.length === 1 ? `${warnDays[0]} days` : `${warnDays[0]}–${warnDays[warnDays.length - 1]} days`;

  const sectors = useMemo(() => {
    const by = new Map<string, Record<SiteCode, number>>();
    for (const site of SITE_LIST) for (const x of headcountBySector(s, site.id, s.today)) { const cur = by.get(x.sector) ?? { mats: 0, bags: 0, recycling: 0 }; cur[site.id] += x.count; by.set(x.sector, cur); }
    return [...by.entries()].map(([sector, per]) => ({ sector, per, total: per.mats + per.bags + per.recycling })).sort((a, b) => b.total - a.total).slice(0, 9);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.attendance, s.shifts, s.people, s.today]);

  const doRenew = () => { if (!renewing || !term) return; renew(renewing.engId, term); toast({ kind: 'ok', title: `${renewing.name}: ${term}-day contract renewed`, detail: `Ends ${fmtDayShort(addDays(s.today, term))}` }); setRenewing(null); };

  const active = perSite.reduce((t, p) => t + p.total.active, 0); const onShift = perSite.reduce((t, p) => t + p.total.onShift, 0);
  const weekly = perSite.reduce((t, p) => t + p.total.weekly, 0); const monthly = perSite.reduce((t, p) => t + p.total.monthly, 0);
  const byType = ENGAGEMENT_TYPES.map((type) => ({ type, active: perSite.reduce((t, p) => t + p.rows.find((r) => r.type === type)!.active, 0), weekly: perSite.reduce((t, p) => t + p.rows.find((r) => r.type === type)!.weekly, 0) }));
  const nowShift = SITE_LIST.reduce((t, x) => t + headcount(s, x.id, s.today, kind).total, 0);
  const yesterdayShift = SITE_LIST.reduce((t, x) => { const y = lastWorkingDays(x.id, s.today, 2)[0]; return t + headcount(s, x.id, y, kind).total; }, 0);
  const labels = trend[0]?.series.map((x) => fmtDayShort(x.day)) ?? [];
  const groupTrend = labels.map((_, i) => trend.reduce((t, x) => t + (x.series[i]?.headcount ?? 0), 0));
  const joined = s.people.filter((p) => p.status === 'active' && p.joinedOn > addDays(s.today, -30) && p.joinedOn <= s.today);
  const joinedWeek = joined.filter((p) => p.joinedOn > addDays(s.today, -7)).length;
  const joinBuckets = Array.from({ length: 10 }, (_, i) => joined.filter((p) => p.joinedOn > addDays(s.today, -30 + i * 3) && p.joinedOn <= addDays(s.today, -27 + i * 3)).length);
  const expired = contracts.filter((c) => c.state === 'expired').length;
  const next = contracts[0]; const renewingRow = contracts.find((c) => c.eng.id === renewing?.engId);
  const sharedRow = shared.find((r) => r.person.id === sharedOpen);
  // Renewal terms are the site's own list in Settings (master data `contract_term`, value = days).
  const terms = useRefList('contract_term', { site: renewingRow?.eng.siteId }).filter((x) => (x.value ?? 0) > 0);
  const chosen = terms.find((x) => x.id === termId) ?? terms.find((x) => x.value === renewingRow?.eng.termDays) ?? terms[0];
  const term = chosen?.value ?? 0;

  const exportCsv = () => {
    downloadCsv(`tanaad-people-${s.today}.csv`, [
      ['Site', 'Engagement', 'Active', 'On shift today', 'Weekly wage bill UGX', 'Monthly estimate UGX'],
      ...perSite.flatMap((p) => [...p.rows.map((r) => [p.site.shortName, SHORT[r.type], r.active, r.onShift, Math.round(r.weekly), Math.round(r.monthly)]), [p.site.shortName, 'Total', p.total.active, p.total.onShift, Math.round(p.total.weekly), Math.round(p.total.monthly)]]),
      [], ['Shared worker', 'Home site', 'Days in 14', 'Cost split'], ...shared.map((r) => [r.person.fullName, SITES[r.person.homeSiteId].shortName, r.total, r.per.map((x) => `${SITES[x.site].shortName} ${x.pct}%`).join(' / ')]),
      [], ['Contract', 'Site', 'Term days', 'Ends', 'State'], ...contracts.map((c) => [c.person.fullName, SITES[c.eng.siteId].shortName, c.eng.termDays ?? '', c.eng.endDate ?? '', c.state]),
    ]);
    toast({ kind: 'ok', title: 'Workforce exported', detail: `${perSite.length} sites · ${shared.length} shared workers · ${contracts.length} contracts` });
  };

  const sharedCols: Column<(typeof shared)[number]>[] = [
    { key: 'p', header: 'Worker', sort: (r) => r.person.fullName, cell: (r) => <span className="flex items-center gap-2 py-0.5"><Avatar name={r.person.fullName} seed={r.person.avatarSeed} size={26} /><span className="min-w-0"><span className="block font-medium leading-tight">{r.person.fullName}</span><span className="block t-xs text-[var(--text-3)]">{r.person.sector} · home {SITES[r.person.homeSiteId].shortName}</span></span></span> },
    { key: 'r', header: 'Rate', align: 'right', sort: (r) => r.eng?.rate ?? 0, cell: (r) => (r.eng ? <span className="num">{compact(r.eng.rate)}<span className="t-xs text-[var(--text-3)]"> / {r.eng.rateBasis}</span></span> : <span className="text-[var(--text-4)]">—</span>) },
    { key: 'd', header: 'Days', align: 'right', mono: true, sort: (r) => r.total, cell: (r) => r.total },
    { key: 'split', header: 'Cost split by days worked', width: '42%', cell: (r) => (
      <span className="block min-w-[150px] py-0.5">
        <StackedBar legend={false} height={8} segments={r.per.map((x) => ({ label: SITES[x.site].shortName, value: x.days, color: SITE_COLOR[x.site] }))} />
        <span className="block t-xs text-[var(--text-3)] mt-1 num">{r.per.map((x) => `${SITES[x.site].shortName} ${x.pct}%`).join(' · ')}</span>
      </span>
    ) },
  ];
  const contractCols: Column<(typeof contracts)[number]>[] = [
    { key: 'p', header: 'Worker', sort: (r) => r.person.fullName, cell: (r) => <span className="flex items-center gap-2 py-0.5"><Avatar name={r.person.fullName} seed={r.person.avatarSeed} size={26} ring={r.state === 'expired' ? 'bad' : 'warn'} /><span className="min-w-0"><span className="block font-medium leading-tight">{r.person.fullName}</span><span className="flex items-center gap-1 t-xs text-[var(--text-3)]"><span className="size-1.5 rounded-[2px] shrink-0" style={{ background: SITE_COLOR[r.eng.siteId] }} />{SITES[r.eng.siteId].shortName} · {r.person.sector}</span></span></span> },
    { key: 't', header: 'Term', align: 'right', mono: true, sort: (r) => r.eng.termDays ?? 0, cell: (r) => `${r.eng.termDays} d` },
    { key: 'e', header: 'Ends', sort: (r) => r.days, cell: (r) => <Badge tone={r.state === 'expired' ? 'bad' : 'warn'} dot>{r.state === 'expired' ? `Expired ${-r.days} d ago` : r.days === 0 ? 'Ends today' : `In ${r.days} d · ${r.eng.endDate ? fmtDayShort(r.eng.endDate) : ''}`}</Badge> },
    { key: 'a', header: '', align: 'right', cell: (r) => <Button size="sm" icon={RefreshCw} onClick={(e) => { e.stopPropagation(); setRenewing({ engId: r.eng.id, name: r.person.fullName }); }}>Renew</Button> },
  ];

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <Hero icon={Users} eyebrow="Group HQ · people" title="Group people" sub="Who is on the books, what they cost, who works across sites"
        actions={<>
          <Button variant="inverse" icon={Download} hotkey="e" onClick={exportCsv}>Export CSV</Button>
          <Button variant="accent" icon={RefreshCw} hotkey="r" hotkeyLabel="Renew the most urgent contract" disabled={!next} onClick={() => next && setRenewing({ engId: next.eng.id, name: next.person.fullName })}>Renew next</Button>
        </>}>
        <div className="flex items-center justify-between mb-2 text-[12.5px]"><span className="inline-flex items-center gap-1.5 font-medium"><span className="size-1.5 rounded-full bg-[var(--color-amber-400)] anim-live" />{fmtNum(onShift)} of {fmtNum(active)} on shift today</span><span className="text-white/60">{active ? Math.round((onShift / active) * 100) : 0}% of the books</span></div>
        <div className="flex h-1.5 gap-[2px] rounded-full overflow-hidden bg-white/15">{perSite.map((p) => <div key={p.site.id} title={`${p.site.shortName}: ${p.total.onShift} on shift`} style={{ width: `${(p.total.onShift / (active || 1)) * 100}%`, background: SITE_COLOR[p.site.id] }} />)}</div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-[11.5px] text-white/60">{perSite.map((p) => <span key={p.site.id} className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-[2px]" style={{ background: SITE_COLOR[p.site.id] }} />{p.site.shortName} <span className="num text-white/85">{p.total.onShift}</span></span>)}</div>
      </Hero>

      <KpiStrip>
        <Stat label="Workforce" icon={Users} accent="var(--series-1)" value={<CountUp value={active} />} spark={groupTrend.slice(0, -1)} sub={<Wrap>{byType.map((t) => `${t.active} ${SHORT[t.type].toLowerCase()}`).join(' · ')}</Wrap>} />
        <Stat label="On shift now" icon={UserCheck} accent="var(--series-3)" value={<CountUp value={nowShift} />} delta={<Delta value={pctChange(nowShift, yesterdayShift)} label={`vs yesterday's ${kind} shift`} />} spark={groupTrend.slice(0, -1)} sparkColor="var(--series-3)" sub={<Wrap>{kind} shift · {fmtNum(yesterdayShift)} yesterday</Wrap>} />
        <Stat label="Weekly wage bill" icon={Banknote} accent="var(--series-2)" value={<><CountUp value={weekly} format={compact} /><span className="t-base text-[var(--text-3)] font-medium"> UGX</span></>} sub={<><span className="flex items-center h-[26px] mb-1.5"><span className="flex w-full h-2 gap-[2px] rounded-[2px] overflow-hidden">{perSite.map((p) => <span key={p.site.id} title={`${p.site.shortName} ${fmtUGX(p.total.weekly)}`} style={{ width: `${(p.total.weekly / (weekly || 1)) * 100}%`, background: SITE_COLOR[p.site.id] }} />)}</span></span><Wrap>{usd0(weekly / s.fx)} · {compact(monthly)} a month</Wrap></>} />
        <Stat label="Shared workers" icon={Share2} accent="var(--series-7)" value={<CountUp value={shared.length} />} sub={<><span className="flex items-center gap-1 h-[26px] mb-1.5">{shared.slice(0, 6).map((r) => <Avatar key={r.person.id} name={r.person.fullName} seed={r.person.avatarSeed} size={22} />)}</span><Wrap>{shared.length ? `across ${plural2(new Set(shared.flatMap((r) => r.per.filter((x) => x.days > 0).map((x) => x.site))).size)} · 14 days` : 'Nobody works across sites'}</Wrap></>} />
        <Stat label="To renew" icon={CalendarClock} accent="var(--series-8)" tone={expired ? 'bad' : contracts.length ? 'warn' : 'neutral'} value={<CountUp value={contracts.length} />} sub={<><span className="flex items-center h-[26px] mb-1.5"><span className="flex w-full h-2 gap-[2px] rounded-[2px] overflow-hidden bg-[var(--surface-3)]">{contracts.map((c) => <span key={c.eng.id} className="flex-1" style={{ background: c.state === 'expired' ? 'var(--bad)' : 'var(--warn)' }} />)}</span></span><Wrap>{contracts.length ? `${expired} expired · ${contracts.length - expired} ending soon` : `None ending in ${warnLabel}`}</Wrap></>} onClick={next ? () => setRenewing({ engId: next.eng.id, name: next.person.fullName }) : undefined} />
        <Stat label="New joiners" icon={UserPlus} accent="var(--series-5)" value={<CountUp value={joined.length} />}
          sub={<><span className="flex items-end gap-[3px] h-[26px] mb-1.5 border-b border-[var(--line)]">{joinBuckets.map((n, i) => <span key={i} title={`${n} joined`} className="flex-1 rounded-t-[2px]" style={{ height: `${Math.max(8, (n / Math.max(1, ...joinBuckets)) * 100)}%`, background: 'var(--series-5)', opacity: n ? 1 : 0.25 }} />)}</span><Wrap>{joinedWeek} this week · last 30 days</Wrap></>} />
      </KpiStrip>

      {/* The three sites side by side */}
      <div className="grid gap-[var(--gap)] xl:grid-cols-3">
        {perSite.map(({ site, rows, total }) => (
          <Panel key={site.id} title={<span className="inline-flex items-center gap-2"><SiteMark site={site.id} />{site.name}</span>} sub={site.legalName} actions={<Badge tone="neutral">{total.onShift} on shift</Badge>}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <Donut size={104} thickness={13} center={total.active} sub="active" segments={rows.map((r) => ({ label: ENGAGEMENT[r.type].label, value: r.active, color: ENGAGEMENT[r.type].color }))} />
              <table className="flex-1 min-w-[210px] t-sm border-collapse">
                <thead><tr className="t-xs text-[var(--text-3)]"><th className="text-left font-medium pb-1">Type</th><th className="text-right font-medium pb-1">Active</th><th className="text-right font-medium pb-1">Today</th><th className="text-right font-medium pb-1">Wage bill</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.type} className="border-t border-[var(--line)]">
                      <td className="py-1.5"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-[2px] shrink-0" style={{ background: ENGAGEMENT[r.type].color }} />{SHORT[r.type]}</span><div className="t-xs text-[var(--text-3)] pl-3.5">{ENGAGEMENT[r.type].basis}</div></td>
                      <td className="num text-right font-medium">{r.active}</td><td className="num text-right">{r.onShift}</td>
                      <td className="num text-right"><span className="font-medium">{compact(r.type === 'permanent' ? r.monthly : r.weekly)}</span><div className="t-xs text-[var(--text-3)]">{r.type === 'permanent' ? 'a month' : 'a week'}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 pt-1 border-t border-[var(--line)]">
              <Meter label="On shift today" sub={`of ${total.active} active`} value={total.onShift} max={total.active || 1} display={`${total.active ? Math.round((total.onShift / total.active) * 100) : 0}%`} />
              <Fact k="Weekly wage bill" v={fmtUGX(total.weekly)} />
              <Fact k="Monthly estimate" v={fmtUGX(total.monthly)} />
            </div>
          </Panel>
        ))}
      </div>

      <div className="grid gap-[var(--gap)] xl:grid-cols-[minmax(0,1fr)_360px] items-start">
        <Panel icon={LineIcon} title="Headcount per day" sub={`people marked present · ${TREND_DAYS} working days`}>
          <LineChart height={262} labels={labels} partialLast series={trend.map((x) => ({ name: x.site.shortName, color: SITE_COLOR[x.site.id], data: x.series.map((p) => p.headcount) }))} />
          <div className="t-xs text-[var(--text-3)] mt-1">Today is drawn dashed because the night shift has not been marked yet.</div>
        </Panel>
        <Panel icon={Banknote} title="Wage bill" sub="UGX a week · estimate" footer="Estimates from active rates in UGX. Weekly is the daily rate × the site's working days; a month is 4⅓ weeks.">
          <div className="t-label mb-1.5">By site</div>
          <StackedBar legend={false} height={12} format={fmtUGX} segments={perSite.map((p) => ({ label: p.site.shortName, value: p.total.weekly, color: SITE_COLOR[p.site.id] }))} />
          <div className="mt-1.5 mb-3">{perSite.map((p) => <div key={p.site.id} className="flex items-center gap-2 h-6 t-sm"><span className="size-2 rounded-[2px] shrink-0" style={{ background: SITE_COLOR[p.site.id] }} /><span className="text-[var(--text-2)] flex-1">{p.site.shortName}</span><span className="num text-[var(--text-3)]">{Math.round((p.total.weekly / (weekly || 1)) * 100)}%</span><span className="num font-medium w-[104px] text-right">{fmtUGX(p.total.weekly)}</span></div>)}</div>
          <div className="t-label mb-1.5">By engagement</div>
          <StackedBar legend={false} height={12} format={fmtUGX} segments={byType.map((t) => ({ label: ENGAGEMENT[t.type].label, value: t.weekly, color: ENGAGEMENT[t.type].color }))} />
          <div className="mt-1.5">{byType.map((t) => <div key={t.type} className="flex items-center gap-2 h-6 t-sm"><span className="size-2 rounded-[2px] shrink-0" style={{ background: ENGAGEMENT[t.type].color }} /><span className="text-[var(--text-2)] flex-1">{ENGAGEMENT[t.type].label}</span><span className="num text-[var(--text-3)]">{Math.round((t.weekly / (weekly || 1)) * 100)}%</span><span className="num font-medium w-[104px] text-right">{fmtUGX(t.weekly)}</span></div>)}</div>
        </Panel>
      </div>

      <div className="grid gap-[var(--gap)] xl:grid-cols-2 items-start">
        <div className="flex flex-col gap-[var(--gap)] min-w-0">
        <Panel icon={Share2} title="Shared workers" sub="last 14 days" pad={false} actions={<Badge tone="neutral">{shared.length}</Badge>} footer="Cost follows the days worked at each site. Open a row for the implied split of the rate.">
          <DataGrid bare rows={shared} columns={sharedCols} rowKey={(r) => r.person.id} onRowClick={(r) => setSharedOpen(r.person.id)} selectedKey={sharedOpen} empty="Nobody is shared across sites." />
        </Panel>
        <Panel icon={Layers} title="On shift today by sector" sub="all sites" footer={<Legend items={SITE_LIST.map((x) => ({ label: x.shortName, color: SITE_COLOR[x.id] }))} />}>
          {sectors.length === 0 ? <div className="t-sm text-[var(--text-3)]">Nobody has been marked present yet today.</div> : sectors.map((x) => (
            <div key={x.sector} className="flex items-center gap-2.5 h-7 touch:h-9 t-sm">
              <span className="w-[92px] shrink-0 truncate text-[var(--text-2)]">{x.sector}</span>
              <span className="flex-1 min-w-0"><span className="flex h-2 gap-[2px] rounded-[2px] overflow-hidden" style={{ width: `${Math.max(3, (x.total / sectors[0].total) * 100)}%` }}>{SITE_LIST.filter((st) => x.per[st.id] > 0).map((st) => <span key={st.id} title={`${st.shortName} ${x.per[st.id]}`} style={{ width: `${(x.per[st.id] / x.total) * 100}%`, background: SITE_COLOR[st.id] }} />)}</span></span>
              <span className="num font-medium w-7 text-right">{x.total}</span>
            </div>
          ))}
        </Panel>
        </div>
        <Panel icon={CalendarClock} title="Contracts ending" sub={`expired, or ending within ${warnLabel}`} pad={false} actions={<Badge tone={expired ? 'bad' : contracts.length ? 'warn' : 'ok'} dot>{contracts.length ? `${contracts.length} to renew` : 'Nothing due'}</Badge>} footer="Renewing starts a new term today. The old contract is kept as renewed; nothing is overwritten.">
          <DataGrid bare rows={contracts} columns={contractCols} rowKey={(r) => r.eng.id} onRowClick={(r) => setRenewing({ engId: r.eng.id, name: r.person.fullName })} selectedKey={renewing?.engId} maxHeight={420} empty={`No contracts ending in the next ${warnLabel}.`} />
        </Panel>
      </div>

      <Sheet open={!!renewing} onClose={() => setRenewing(null)} title={renewing ? `Renew ${renewing.name}` : ''} sub={renewingRow ? `${renewingRow.person.sector} · ${SITES[renewingRow.eng.siteId].name}` : undefined}
        footer={<><Button variant="ghost" onClick={() => setRenewing(null)}>Cancel</Button><Button variant="primary" icon={RefreshCw} hotkey="mod+enter" disabled={!term} onClick={doRenew}>{term ? `Renew for ${term} days` : 'Renew'}</Button></>}>
        <p className="t-base text-[var(--text-2)] mb-3">New term starts today, {fmtDayShort(s.today)}. The old contract is kept as renewed; nothing is overwritten.</p>
        {terms.length === 0 ? (
          <Empty icon={CalendarClock} title="No contract terms set for this site" hint="Add contract terms in Settings → Master data." action={<Button size="sm" onClick={() => { setRenewing(null); go.site('settings', renewingRow?.eng.siteId); }}>Open Settings</Button>} />
        ) : (
          <>
            <div className="t-sm font-medium text-[var(--text-2)] mb-1">Term</div>
            <ChipGroup ariaLabel="Term" columns={Math.min(4, terms.length)} value={chosen?.id} onChange={setTermId} options={terms.map((x) => ({ value: x.id, label: x.label }))} />
            <div className="mt-4">
              {renewingRow && <Fact k="Current contract" v={<>{renewingRow.eng.termDays} days · {renewingRow.state === 'expired' ? `expired ${-renewingRow.days} d ago` : renewingRow.days === 0 ? 'ends today' : `ends in ${renewingRow.days} d`}</>} />}
              {renewingRow && <Fact k="Rate" v={`${fmtUGX(renewingRow.eng.rate)} / ${renewingRow.eng.rateBasis}`} />}
              <Fact k="New term starts" v={fmtDayShort(s.today)} />
              <Fact k="New term ends" v={fmtDayShort(addDays(s.today, term))} />
              {renewingRow && renewingRow.eng.rateBasis === 'shift' && <Fact k="Cost of the term" v={`${fmtUGX(renewingRow.eng.rate * term)} at one shift a day`} />}
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={!!sharedRow} onClose={() => setSharedOpen(null)} title={sharedRow?.person.fullName} sub={sharedRow ? `${sharedRow.person.sector} · home ${SITES[sharedRow.person.homeSiteId].shortName} · also ${sharedRow.person.sharedSites.map((x) => SITES[x].shortName).join(', ')}` : undefined}>
        {sharedRow && (
          <>
            <div className="flex items-center gap-3 mb-3"><Avatar name={sharedRow.person.fullName} seed={sharedRow.person.avatarSeed} size={40} /><div className="min-w-0 flex-1"><div className="t-lg font-semibold">{sharedRow.total} days worked</div><div className="t-sm text-[var(--text-3)]">in the last 14 days{sharedRow.eng ? ` · ${fmtUGX(sharedRow.eng.rate)} / ${sharedRow.eng.rateBasis}` : ''}</div></div></div>
            <div className="t-label mb-1">Days and cost share by site</div>
            {sharedRow.per.map((x) => (
              <div key={x.site} className="py-2 border-b border-[var(--line)] last:border-b-0">
                <div className="flex items-center justify-between gap-3 mb-1.5 t-base"><span className="inline-flex items-center gap-2 font-medium"><SiteTag site={x.site} />{x.site === sharedRow.person.homeSiteId && <Badge tone="neutral">Home</Badge>}</span><span className="num t-sm text-[var(--text-2)]">{x.days} days · {x.pct}% of cost</span></div>
                <Bar value={x.days} max={sharedRow.total} tone="series" />
                {sharedRow.eng && <div className="t-sm text-[var(--text-3)] mt-1 num">Implied share of the rate: {fmtUGX(Math.round((sharedRow.eng.rate * x.pct) / 100))}</div>}
              </div>
            ))}
          </>
        )}
      </Sheet>
    </div>
  );
}
