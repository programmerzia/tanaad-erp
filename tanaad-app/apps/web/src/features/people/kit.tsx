import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CalendarClock, Settings2, type LucideIcon } from 'lucide-react';
import type { AttendanceStatus, Engagement, EngagementType, Person } from '@tanaad/domain';
import { contractDaysRemaining } from '@tanaad/domain';
import { Avatar, Badge, Button, ChipGroup, Dialog, Empty, cn, type Tone } from '@/components/ui';
import { useGo, useRefList, useSiteSettings } from '@/app/hooks';
import { addDays } from '@/data/selectors';
import { fmtDayShort } from '@/data/format';

/** Engagement types are identities, so they wear the chart series colours (same order as the dashboard donut). */
export const ENG: Record<EngagementType, { label: string; long: string; color: string }> = {
  permanent: { label: 'Permanent', long: 'Permanent', color: 'var(--series-1)' },
  contract: { label: 'Contract', long: 'Fixed-term contract', color: 'var(--series-3)' },
  casual: { label: 'Casual', long: 'Casual', color: 'var(--series-4)' },
};
export const ENG_TYPES: EngagementType[] = ['permanent', 'contract', 'casual'];

/**
 * Pay rules that have no setting yet. They are kept in one place and shown as "to be confirmed" wherever they are used;
 * they belong in Settings → Rules once the client confirms them.
 */
export const STANDARD_DAY_HOURS = 8;
export const MONTH_WORKING_DAYS = 26;

export type ContractState = 'open' | 'expiring' | 'expired';
/** Contract state against the site's own warning window (Settings → Rules), not a fixed number of days. */
export const contractStateFor = (endDate: string | undefined, today: string, warningDays: number): ContractState => {
  if (!endDate) return 'open';
  const d = contractDaysRemaining(endDate, today);
  return d < 0 ? 'expired' : d <= warningDays ? 'expiring' : 'open';
};
/** The people rules of the current site, read from Settings. */
export function usePeopleRules() {
  const st = useSiteSettings();
  return { warningDays: Math.max(0, st?.contractWarningDays ?? 0), absentDays: Math.max(1, st?.archiveAfterAbsentDays ?? 1) };
}
/** Contract lengths the site offers (master data list `contract_term`, value = days). */
export function useContractTerms() {
  const list = useRefList('contract_term');
  return useMemo(() => list.filter((t) => (t.value ?? 0) > 0).map((t) => ({ id: t.id, days: t.value as number, label: t.label })), [list]);
}
/** Empty state for a master-data list nobody has filled in yet: says where to add it and takes you there. */
export function MasterEmpty({ title, hint, icon = Settings2, compact }: { title: ReactNode; hint: ReactNode; icon?: LucideIcon; compact?: boolean }) {
  const go = useGo();
  const action = <Button size="sm" icon={Settings2} onClick={() => go.site('settings')}>Open Settings</Button>;
  if (compact) return <div className="rounded-md border border-dashed border-[var(--line-2)] px-3 py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5"><div className="min-w-0"><div className="t-base font-medium">{title}</div><div className="t-sm text-[var(--text-3)]">{hint}</div></div>{action}</div>;
  return <Empty icon={icon} title={title} hint={hint} action={action} />;
}
export const BASIS: Record<Engagement['rateBasis'], string> = { month: 'month', shift: 'shift', day: 'day', piece: 'piece' };

export function EngTag({ type, className }: { type?: EngagementType; className?: string }) {
  if (!type) return <span className="text-[var(--text-4)]">—</span>;
  return <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}><span className="size-2 rounded-[2px] shrink-0" style={{ background: ENG[type].color }} />{ENG[type].label}</span>;
}

/** Attendance marks: a state, so they wear status colours and always carry a letter. */
export const MARK: Record<AttendanceStatus, { short: string; label: string; tone: Tone; soft: string; solid: string }> = {
  present: { short: 'P', label: 'Present', tone: 'ok', soft: 'bg-[var(--ok-bg)] text-[var(--ok)]', solid: 'bg-[var(--ok)] text-white border-[var(--ok)]' },
  half: { short: '½', label: 'Half day', tone: 'warn', soft: 'bg-[var(--warn-bg)] text-[var(--warn)]', solid: 'bg-[var(--warn)] text-white border-[var(--warn)]' },
  absent: { short: 'A', label: 'Absent', tone: 'bad', soft: 'bg-[var(--bad-bg)] text-[var(--bad)]', solid: 'bg-[var(--bad)] text-white border-[var(--bad)]' },
};
export const MARKS: AttendanceStatus[] = ['present', 'half', 'absent'];
export const dayValue = (st?: AttendanceStatus) => (st === 'present' ? 1 : st === 'half' ? 0.5 : 0);

/** One read-only mark in a day column or a history strip. */
export function MarkDot({ status, className, title }: { status?: AttendanceStatus; className?: string; title?: string }) {
  return <span title={title} className={cn('inline-grid place-items-center size-[22px] touch:size-8 rounded-[5px] t-xs font-semibold leading-none select-none', status ? MARK[status].soft : 'text-[var(--text-4)]', className)}>{status ? MARK[status].short : '·'}</span>;
}

/** "Ends in 2 days" / "Ended 9 Oct" / "23 days left" for a contract. Nothing for open-ended engagements. */
export function ContractNote({ endDate, state, today, plain }: { endDate?: string; state: ContractState; today: string; plain?: boolean }) {
  if (!endDate) return null;
  const d = contractDaysRemaining(endDate, today);
  if (state === 'expired') return <Badge tone="bad" dot>Ended {fmtDayShort(endDate)}</Badge>;
  if (state === 'expiring') return <Badge tone="warn" dot>{d === 0 ? 'Ends today' : `Ends in ${d} day${d === 1 ? '' : 's'}`}</Badge>;
  return <span className={cn('num whitespace-nowrap', plain ? '' : 't-sm text-[var(--text-3)]')}>{d} days left</span>;
}

/** Icon in a tinted square: the house way to colour a row or an empty state. */
export function IconChip({ icon: Icon, color = 'var(--text-3)', className }: { icon: LucideIcon; color?: string; className?: string }) {
  return <span className={cn('size-8 rounded-lg grid place-items-center shrink-0', className)} style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}><Icon className="size-4" strokeWidth={2} /></span>;
}

/** Renew a fixed-term contract from today. Digits pick the term, Ctrl+Enter confirms. Terms come from Settings. */
export function RenewDialog({ target, today, onClose, onRenew }: { target: { person: Person; engagement: Engagement } | null; today: string; onClose: () => void; onRenew: (engagement: Engagement, termDays: number) => void }) {
  const terms = useContractTerms();
  const [term, setTerm] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const id = target?.engagement.id;
  useEffect(() => {
    if (!target) return;
    const same = terms.find((t) => t.days === target.engagement.termDays) ?? terms[0];
    setTerm(same ? String(same.days) : null);
    const t = setTimeout(() => wrap.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus(), 70);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const e = target?.engagement; const n = term ? parseInt(term, 10) : 0;
  return (
    <Dialog open={!!target} onClose={onClose} title="Renew contract" width={420}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={CalendarClock} hotkey="mod+enter" hotkeyLabel="Renew contract" disabled={!n} onClick={() => e && n && onRenew(e, n)}>{n ? `Renew ${n} days` : 'Renew'}</Button></>}>
      {target && e && (
        <div ref={wrap}>
          <div className="flex items-center gap-3 mb-3">
            <Avatar name={target.person.fullName} seed={target.person.avatarSeed} size={36} />
            <div className="min-w-0"><div className="t-base font-semibold truncate">{target.person.fullName}</div><div className="t-sm text-[var(--text-3)]">{target.person.sector} · last term {e.termDays ?? '—'} days · {e.endDate ? (e.endDate < today ? `ended ${fmtDayShort(e.endDate)}` : `ends ${fmtDayShort(e.endDate)}`) : 'open'}</div></div>
          </div>
          {terms.length === 0 ? <MasterEmpty title="No contract terms set up" hint="Add contract terms in Settings → Master data." /> : <>
            <div className="t-sm font-medium text-[var(--text-2)] mb-1">New term, starting today</div>
            <ChipGroup ariaLabel="Term" columns={Math.min(terms.length, 4)} options={terms.map((t) => ({ value: String(t.days), label: t.label }))} value={term} onChange={setTerm} />
            {n > 0 && <div className="mt-3 flex items-center justify-between rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 t-sm"><span className="text-[var(--text-2)]">New contract</span><span className="num font-medium">{fmtDayShort(today)} → {fmtDayShort(addDays(today, n))}</span></div>}
          </>}
        </div>
      )}
    </Dialog>
  );
}

/** Download rows as a CSV file. */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

/** Simulated photo frame (ID card or face) used in the profile and on the sign-up card. */
export function PhotoFrame({ icon: Icon, label, round, captured = true, className }: { icon: LucideIcon; label: string; round?: boolean; captured?: boolean; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-[var(--line)] bg-[var(--surface-2)] flex flex-col items-center justify-center gap-1 px-2 py-1.5', className)}>
      <div className={cn('grid place-items-center', round ? 'size-10 rounded-full' : 'w-[58px] h-10 rounded-md', captured ? 'bg-[linear-gradient(135deg,var(--color-ink-600),var(--color-ink-900))] text-white/75' : 'border border-dashed border-[var(--line-2)] text-[var(--text-4)]')}><Icon className="size-5" strokeWidth={1.5} /></div>
      <span className="t-xs font-medium text-[var(--text-3)] leading-none">{label}</span>
    </div>
  );
}
