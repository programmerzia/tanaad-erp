import { Outlet, useLocation, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Factory, Repeat, Wifi, WifiOff } from 'lucide-react';
import type { SiteCode } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { currentShiftKind } from '@/data/selectors';
import { fmtDayLong } from '@/data/format';
import { COMPANY } from '@/config/company';
import { roleLabel } from '@/config/roles';
import { SITES } from '@/config/sites';
import { SITE_COLOR } from '@/config/siteIdentity';
import { en } from '@/i18n/en';

/**
 * Simple, calm application frame for first-time users.
 *  - No dark sidebar or crowded menu bars.
 *  - Unmistakable "Back to home" button whenever on a task screen.
 *  - Plain offline banner when there is no internet connection (Principle 14).
 */
export function AppShell({ scope }: { scope: 'group' | 'site' }) {
  const s = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams({ strict: false }) as { site?: SiteCode };

  const siteId: SiteCode = params.site ?? s.session?.siteId ?? 'mats';
  const site = SITES[siteId];
  const role = s.session?.role ?? (scope === 'group' ? 'ceo' : 'supervisor');
  const user = s.users.find((u) => u.id === s.session?.userId);
  const shiftKind = currentShiftKind();

  const homePath = scope === 'group' ? '/g/cockpit' : `/s/${siteId}/today`;
  const isAtHome =
    scope === 'group'
      ? location.pathname === '/g/cockpit' && !location.searchStr
      : location.pathname === `/s/${siteId}/today`;

  const goHome = () => {
    navigate({ to: homePath as never });
  };

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--text)] flex flex-col">
      {/* Top header bar */}
      <header className="no-print bg-[var(--surface)] border-b border-[var(--line-2)] sticky top-0 z-30">
        <div className="max-w-[1040px] mx-auto px-4 sm:px-6 min-h-[64px] py-2 flex flex-wrap items-center justify-between gap-3">
          {/* Left: Back to home OR factory identity */}
          <div className="flex items-center gap-3 min-w-0">
            {!isAtHome ? (
              <button
                type="button"
                onClick={goHome}
                className="ctl px-4 rounded-[8px] bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white font-bold t-base inline-flex items-center gap-2 shrink-0 shadow-[var(--shadow-card)]"
              >
                <ArrowLeft className="size-5" />
                <span>{en.app.backToHome}</span>
              </button>
            ) : (
              <span
                className="size-11 rounded-[8px] grid place-items-center text-white shrink-0"
                style={{ background: scope === 'site' ? SITE_COLOR[siteId] : 'var(--brand)' }}
              >
                <Factory className="size-5" />
              </span>
            )}

            <div className="min-w-0">
              <div className="t-base font-bold leading-tight truncate">
                {scope === 'site' ? site.name : COMPANY.groupName}
              </div>
              <div className="t-sm text-[var(--text-2)] truncate">
                {fmtDayLong(s.today)} · {shiftKind === 'day' ? 'Day shift' : 'Night shift'}
              </div>
            </div>
          </div>

          {/* Right: Role badge, offline toggle, role switcher */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => s.setOnline(!s.online)}
              title="Toggle internet connection (demo)"
              className={
                s.online
                  ? 'ctl-sm px-3 rounded-[8px] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-2)] t-sm font-medium inline-flex items-center gap-1.5'
                  : 'ctl-sm px-3 rounded-[8px] border border-[var(--warn)] bg-[var(--warn-bg)] text-[var(--warn)] t-sm font-bold inline-flex items-center gap-1.5'
              }
            >
              {s.online ? <Wifi className="size-4 text-[var(--ok)]" /> : <WifiOff className="size-4" />}
              <span className="max-sm:hidden">{s.online ? 'Online' : 'Offline'}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate({ to: '/portals' as never })}
              className="ctl-sm px-3.5 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] text-[var(--text)] t-sm font-semibold inline-flex items-center gap-2"
            >
              <Repeat className="size-4 text-[var(--text-2)]" />
              <span>
                {roleLabel(role)}
                {user ? ` · ${user.name.split(' ')[0]}` : ''}
              </span>
            </button>
          </div>
        </div>

        {/* Principle 14: Plain offline notice */}
        {!s.online && (
          <div
            role="status"
            className="bg-[var(--warn-bg)] border-t border-[color-mix(in_srgb,var(--warn)_40%,transparent)] px-4 py-2.5 text-center t-base font-bold text-[var(--warn)]"
          >
            {en.app.offlineBanner}
          </div>
        )}
      </header>

      {/* Main single-job canvas */}
      <main className="flex-1 w-full max-w-[1040px] mx-auto px-4 sm:px-6 py-5">
        <Outlet />
      </main>
    </div>
  );
}
