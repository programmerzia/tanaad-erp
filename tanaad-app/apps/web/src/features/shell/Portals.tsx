import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, ChevronDown, ChevronUp, Factory, LogOut } from 'lucide-react';
import type { Role, SiteCode } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { Avatar } from '@/components/ui';
import { PaperSheet } from '@/components/simple';
import { COMPANY } from '@/config/company';
import { ROLES, roleLabel } from '@/config/roles';
import { SITE_LIST, SITES } from '@/config/sites';
import { SITE_COLOR } from '@/config/siteIdentity';
import { en } from '@/i18n/en';

interface RoleAssignment {
  role: Role;
  siteId?: SiteCode;
}

function landingFor(r: RoleAssignment): string {
  if (!r.siteId || r.role === 'ceo' || r.role === 'group_admin') return '/g/cockpit';
  return `/s/${r.siteId}/today`;
}

export function Portals() {
  const s = useStore();
  const navigate = useNavigate();
  const [showAllDemo, setShowAllDemo] = useState(false);

  const user = s.users.find((u) => u.id === (s.auth?.userId ?? s.session?.userId)) ?? s.users[0];

  const openRole = (r: RoleAssignment) => {
    const matchUser =
      s.users.find((u) =>
        u.roles.some((x) => x.role === r.role && (r.siteId ? x.siteId === r.siteId : !x.siteId)),
      ) ?? user;
    s.signIn(matchUser.id, r.role, r.siteId);
    navigate({ to: landingFor(r) as never });
  };

  const demoSiteRoles: Role[] = [
    'supervisor',
    'cashier',
    'storekeeper',
    'gate',
    'mechanic',
    'sales',
    'site_manager',
  ];

  return (
    <div className="min-h-dvh bg-[var(--bg)] p-4 sm:p-6">
      <div className="max-w-[760px] mx-auto flex flex-col gap-5">
        {/* Top user bar */}
        <header className="paper-sheet px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} seed={user.avatarSeed} size={44} />
            <div>
              <div className="t-sm text-[var(--text-2)]">{COMPANY.groupName}</div>
              <h1 className="t-title text-[var(--text)]">{user.name}</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              s.signOut();
              navigate({ to: '/' });
            }}
            className="ctl px-4 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] font-semibold t-base inline-flex items-center gap-2"
          >
            <LogOut className="size-4" />
            <span>{en.app.signOut}</span>
          </button>
        </header>

        {/* Assigned portals */}
        <PaperSheet title={en.portals.title} subtitle={en.portals.subtitle}>
          <div className="flex flex-col gap-3">
            {user.roles.map((r, idx) => {
              const info = ROLES.find((x) => x.role === r.role);
              const site = r.siteId ? SITES[r.siteId] : undefined;
              return (
                <button
                  key={`${r.role}-${r.siteId ?? 'group'}-${idx}`}
                  type="button"
                  onClick={() => openRole(r)}
                  className="w-full text-left rounded-[10px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] px-5 py-4 min-h-[72px] flex items-center justify-between gap-4 shadow-[var(--shadow-card)]"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span
                      className="size-12 rounded-[8px] grid place-items-center text-white shrink-0"
                      style={{ background: site ? SITE_COLOR[site.id] : 'var(--brand)' }}
                    >
                      <Factory className="size-6" />
                    </span>
                    <div className="min-w-0">
                      <div className="t-lg font-bold text-[var(--text)]">
                        {roleLabel(r.role)}
                        {site ? ` · ${site.name}` : ` · ${COMPANY.groupName}`}
                      </div>
                      <div className="t-base text-[var(--text-2)] mt-0.5">{info?.description}</div>
                    </div>
                  </div>
                  <span className="ctl px-4 rounded-[8px] bg-[var(--brand)] text-white font-semibold t-base inline-flex items-center gap-2 shrink-0">
                    <span>Open</span>
                    <ArrowRight className="size-5" />
                  </span>
                </button>
              );
            })}
          </div>
        </PaperSheet>

        {/* Demo role switcher */}
        <div className="paper-sheet overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAllDemo((v) => !v)}
            className="w-full px-5 py-3.5 bg-[var(--surface-2)] flex items-center justify-between gap-3 text-left t-base font-semibold text-[var(--text-2)] hover:bg-[var(--hover)]"
          >
            <span>{en.portals.demoSwitchTitle} — {en.portals.demoSwitchHint}</span>
            {showAllDemo ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
          </button>
          {showAllDemo && (
            <div className="p-5 flex flex-col gap-4 border-t border-[var(--line)]">
              <div>
                <div className="t-sm font-bold text-[var(--text-2)] mb-2">CEO / Group HQ</div>
                <div className="flex flex-wrap gap-2">
                  {ROLES.filter((r) => r.scope === 'group').map((r) => (
                    <button
                      key={r.role}
                      type="button"
                      onClick={() => openRole({ role: r.role })}
                      className="ctl px-4 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] font-semibold t-base"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              {SITE_LIST.map((site) => (
                <div key={site.id}>
                  <div className="t-sm font-bold text-[var(--text-2)] mb-2">{site.name}</div>
                  <div className="flex flex-wrap gap-2">
                    {demoSiteRoles.map((role) => (
                      <button
                        key={`${site.id}-${role}`}
                        type="button"
                        onClick={() => openRole({ role, siteId: site.id as SiteCode })}
                        className="ctl-sm px-3.5 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] font-medium t-sm"
                      >
                        {roleLabel(role)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
