import { useMemo, useState } from 'react';
import { Check, CheckCheck, UserPlus, Users } from 'lucide-react';
import type { Attendance as AttendanceRec, AttendanceStatus, Person } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { useGo, useSite } from '@/app/hooks';
import { currentShiftKind, headcount, rosterFor } from '@/data/selectors';
import { fmtMoney } from '@/data/format';
import { Avatar, cn } from '@/components/ui';
import {
  PaperSheet,
  SavedBanner,
  StatusNotice,
  useSavedBanner,
} from '@/components/simple';
import { en } from '@/i18n/en';

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: en.attendance.present,
  half: en.attendance.half,
  absent: en.attendance.absent,
};

/**
 * Flow 2 · Who came today
 * Mirrors the paper attendance sheet:
 *  - A list of faces and names; tap Present, Half day or Absent.
 *  - Shows "Saved" with a tick and a visible "Undo last action" button.
 */
export function Attendance() {
  const s = useStore();
  const site = useSite();
  const go = useGo();
  const { saved, showSaved, clearSaved } = useSavedBanner();

  const shiftKind = currentShiftKind();
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [onlyUnmarked, setOnlyUnmarked] = useState(false);

  const shiftRec = useMemo(
    () =>
      s.shifts.find(
        (sh) => sh.siteId === site.id && sh.day === s.today && sh.kind === shiftKind,
      ),
    [s.shifts, site.id, s.today, shiftKind],
  );
  const shiftId = shiftRec?.id ?? `sh-${site.id}-${s.today}-${shiftKind}`;

  const roster = useMemo(() => rosterFor(s, site.id), [s, site.id]);

  const marksByPerson = useMemo(() => {
    const map = new Map<string, AttendanceRec>();
    for (const a of s.attendance) {
      if (a.shiftId === shiftId) map.set(a.personId, a);
    }
    return map;
  }, [s.attendance, shiftId]);

  // Sectors from actual roster (master data driven)
  const sectors = useMemo(
    () => [...new Set(roster.map((r) => r.person.sector))],
    [roster],
  );

  const unmarkedCount = roster.filter((r) => !marksByPerson.has(r.person.id)).length;
  const markedCount = roster.length - unmarkedCount;
  const hc = headcount(s, site.id, s.today, shiftKind);

  const filteredRows = useMemo(() => {
    return roster.filter((r) => {
      if (sectorFilter !== 'all' && r.person.sector !== sectorFilter) return false;
      if (onlyUnmarked && marksByPerson.has(r.person.id)) return false;
      return true;
    });
  }, [roster, sectorFilter, onlyUnmarked, marksByPerson]);

  const handleMark = (person: Person, status: AttendanceStatus) => {
    const prev = marksByPerson.get(person.id)?.status;
    s.markAttendance({
      shiftId,
      personId: person.id,
      siteId: site.id,
      status,
    });
    showSaved(en.attendance.savedMark(person.fullName, STATUS_LABEL[status]), {
      detail: `${markedCount + (prev ? 0 : 1)} of ${roster.length} workers marked today`,
      onUndo: prev
        ? () => {
            s.markAttendance({
              shiftId,
              personId: person.id,
              siteId: site.id,
              status: prev,
            });
          }
        : () => {
            s.markAttendance({
              shiftId,
              personId: person.id,
              siteId: site.id,
              status: status === 'present' ? 'absent' : 'present',
            });
          },
    });
  };

  const handleMarkRestPresent = () => {
    const unmarked = roster.filter((r) => !marksByPerson.has(r.person.id));
    if (unmarked.length === 0) return;
    for (const r of unmarked) {
      s.markAttendance({
        shiftId,
        personId: r.person.id,
        siteId: site.id,
        status: 'present',
      });
    }
    showSaved(`${unmarked.length} workers marked Present`, {
      detail: `All ${roster.length} workers are now marked for today.`,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Saved + Undo banner (Principle 7) */}
      <SavedBanner info={saved} onDismiss={clearSaved} />

      {/* Top status bar: plain sentence */}
      <div className="paper-sheet p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="t-title text-[var(--text)]">{en.attendance.title}</h1>
          <p className="t-base text-[var(--text-2)] mt-0.5">
            {unmarkedCount === 0
              ? `Done — all ${roster.length} workers are marked (${hc.present} Present, ${hc.half} Half day).`
              : `You have ${unmarkedCount} of ${roster.length} workers left to mark today.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {unmarkedCount > 0 && (
            <button
              type="button"
              onClick={handleMarkRestPresent}
              className="ctl px-4 rounded-[8px] bg-[var(--ok)] hover:opacity-95 text-white font-bold t-base inline-flex items-center gap-2 shadow-[var(--shadow-card)]"
            >
              <CheckCheck className="size-5" />
              <span>
                {en.attendance.markRestPresent} ({unmarkedCount})
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => go.site('people/signup')}
            className="ctl px-4 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] font-semibold t-base inline-flex items-center gap-2"
          >
            <UserPlus className="size-5" />
            <span>{en.home.tasks.addNewWorker}</span>
          </button>
        </div>
      </div>

      {/* Simple filter pills (at most 4-5 choices) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSectorFilter('all')}
            className={cn(
              'ctl-sm px-4 rounded-[8px] border font-semibold t-sm',
              sectorFilter === 'all'
                ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                : 'bg-[var(--surface)] text-[var(--text)] border-[var(--line-2)] hover:bg-[var(--hover)]',
            )}
          >
            All sections ({roster.length})
          </button>
          {sectors.slice(0, 4).map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => setSectorFilter(sec)}
              className={cn(
                'ctl-sm px-4 rounded-[8px] border font-semibold t-sm',
                sectorFilter === sec
                  ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                  : 'bg-[var(--surface)] text-[var(--text)] border-[var(--line-2)] hover:bg-[var(--hover)]',
              )}
            >
              {sec} ({roster.filter((r) => r.person.sector === sec).length})
            </button>
          ))}
        </div>

        {unmarkedCount > 0 && unmarkedCount < roster.length && (
          <button
            type="button"
            onClick={() => setOnlyUnmarked((v) => !v)}
            className={cn(
              'ctl-sm px-4 rounded-[8px] border font-semibold t-sm',
              onlyUnmarked
                ? 'bg-[var(--warn-bg)] border-[var(--warn)] text-[var(--warn)]'
                : 'bg-[var(--surface)] border-[var(--line-2)] text-[var(--text-2)]',
            )}
          >
            {onlyUnmarked
              ? `Showing ${unmarkedCount} not marked yet`
              : `Show only ${unmarkedCount} not marked`}
          </button>
        )}
      </div>

      {/* Paper Attendance Sheet */}
      <PaperSheet
        title={`Attendance Sheet · ${shiftKind === 'day' ? 'Day Shift' : 'Night Shift'}`}
        subtitle={en.attendance.subtitle}
        badge={
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[6px] bg-[var(--surface)] border border-[var(--line-2)] t-sm font-bold num">
            <Users className="size-4 text-[var(--text-2)]" />
            <span>
              {markedCount} / {roster.length} marked
            </span>
          </span>
        }
        pad={false}
      >
        {filteredRows.length === 0 ? (
          <div className="p-6">
            <StatusNotice tone="ok" title={en.attendance.allMarked}>
              Every worker in this view has been marked for today.
            </StatusNotice>
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {filteredRows.map(({ person, engagement }) => {
              const mark = marksByPerson.get(person.id);
              const cur = mark?.status;
              return (
                <div
                  key={person.id}
                  className={cn(
                    'px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 transition-colors',
                    !cur && 'bg-[var(--warn-bg)]/30',
                  )}
                >
                  {/* Worker photo and name */}
                  <div className="flex items-center gap-3.5 min-w-[220px] flex-1">
                    <Avatar
                      name={person.fullName}
                      seed={person.avatarSeed}
                      size={44}
                      ring={
                        cur === 'present'
                          ? 'ok'
                          : cur === 'half'
                            ? 'warn'
                            : cur === 'absent'
                              ? 'bad'
                              : undefined
                      }
                    />
                    <div className="min-w-0">
                      <div className="t-lg font-bold text-[var(--text)] truncate">
                        {person.fullName}
                      </div>
                      <div className="t-sm text-[var(--text-2)] truncate">
                        {person.sector}
                        {engagement
                          ? ` · ${engagement.type} (${fmtMoney(engagement.rate, engagement.currency)}/${engagement.rateBasis})`
                          : ''}
                      </div>
                    </div>
                  </div>

                  {/* Three large choice buttons: Present, Half day, Absent */}
                  <div
                    className="grid grid-cols-3 gap-2 w-full sm:w-auto sm:min-w-[340px]"
                    role="group"
                    aria-label={`Mark attendance for ${person.fullName}`}
                  >
                    <button
                      type="button"
                      aria-pressed={cur === 'present'}
                      onClick={() => handleMark(person, 'present')}
                      className={cn(
                        'ctl px-3.5 rounded-[8px] border font-bold t-base inline-flex items-center justify-center gap-1.5 transition-colors',
                        cur === 'present'
                          ? 'bg-[var(--ok)] border-[var(--ok)] text-white shadow-[var(--shadow-card)]'
                          : 'bg-[var(--surface)] border-[var(--line-2)] text-[var(--text)] hover:bg-[var(--ok-bg)]',
                      )}
                    >
                      {cur === 'present' && <Check className="size-4 stroke-[3]" />}
                      <span>{en.attendance.present}</span>
                    </button>

                    <button
                      type="button"
                      aria-pressed={cur === 'half'}
                      onClick={() => handleMark(person, 'half')}
                      className={cn(
                        'ctl px-3.5 rounded-[8px] border font-bold t-base inline-flex items-center justify-center gap-1.5 transition-colors',
                        cur === 'half'
                          ? 'bg-[var(--warn)] border-[var(--warn)] text-white shadow-[var(--shadow-card)]'
                          : 'bg-[var(--surface)] border-[var(--line-2)] text-[var(--text)] hover:bg-[var(--warn-bg)]',
                      )}
                    >
                      {cur === 'half' && <Check className="size-4 stroke-[3]" />}
                      <span>{en.attendance.half}</span>
                    </button>

                    <button
                      type="button"
                      aria-pressed={cur === 'absent'}
                      onClick={() => handleMark(person, 'absent')}
                      className={cn(
                        'ctl px-3.5 rounded-[8px] border font-bold t-base inline-flex items-center justify-center gap-1.5 transition-colors',
                        cur === 'absent'
                          ? 'bg-[var(--bad)] border-[var(--bad)] text-white shadow-[var(--shadow-card)]'
                          : 'bg-[var(--surface)] border-[var(--line-2)] text-[var(--text)] hover:bg-[var(--bad-bg)]',
                      )}
                    >
                      {cur === 'absent' && <Check className="size-4 stroke-[3]" />}
                      <span>{en.attendance.absent}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PaperSheet>
    </div>
  );
}
