import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Factory, Lock } from 'lucide-react';
import { useStore } from '@/data/store';
import { Avatar, PinPad } from '@/components/ui';
import { ChoiceButton, PaperSheet, StatusNotice } from '@/components/simple';
import { COMPANY } from '@/config/company';
import { roleLabel } from '@/config/roles';
import { SITES } from '@/config/sites';
import { en } from '@/i18n/en';

export function Login() {
  const users = useStore((s) => s.users);
  const logIn = useStore((s) => s.logIn);
  const navigate = useNavigate();

  const [pickedId, setPickedId] = useState<string | null>(null);
  const [wrongPin, setWrongPin] = useState(false);

  const picked = users.find((u) => u.id === pickedId);

  const submitPin = (pin: string) => {
    if (!picked) return;
    if (pin !== '1234') {
      setWrongPin(true);
      return;
    }
    logIn(picked.id, 'pin');
    navigate({ to: '/portals' as never });
  };

  return (
    <div className="min-h-dvh bg-[var(--bg)] flex flex-col justify-between p-4 sm:p-6">
      <div className="w-full max-w-[680px] mx-auto my-auto py-4">
        {/* Brand header */}
        <div className="flex items-center gap-3.5 mb-5">
          <span className="size-12 rounded-[10px] bg-[var(--brand)] text-white grid place-items-center shrink-0">
            <Factory className="size-6" />
          </span>
          <div>
            <div className="t-sm font-semibold text-[var(--text-2)]">{COMPANY.groupName} · Kampala</div>
            <h1 className="t-title text-[var(--text)]">{en.login.title}</h1>
          </div>
        </div>

        {!picked ? (
          <PaperSheet
            title={en.login.pickPerson}
            subtitle={en.login.subtitle}
          >
            <div className="grid gap-2.5 sm:grid-cols-2">
              {users.map((u) => {
                const primary = u.roles[0];
                const roleText = primary
                  ? `${roleLabel(primary.role)}${primary.siteId ? ` · ${SITES[primary.siteId].shortName}` : ' · Group'}`
                  : '';
                return (
                  <ChoiceButton
                    key={u.id}
                    avatarName={u.name}
                    avatarSeed={u.avatarSeed}
                    title={u.name}
                    subtitle={roleText}
                    onClick={() => {
                      setPickedId(u.id);
                      setWrongPin(false);
                    }}
                  />
                );
              })}
            </div>
          </PaperSheet>
        ) : (
          <PaperSheet
            title={en.login.enterPin}
            subtitle={`Signing in as ${picked.name}`}
            badge={
              <button
                type="button"
                onClick={() => {
                  setPickedId(null);
                  setWrongPin(false);
                }}
                className="ctl-sm px-3.5 rounded-[8px] border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] t-sm font-semibold inline-flex items-center gap-1.5"
              >
                <ArrowLeft className="size-4" />
                <span>{en.login.changePerson}</span>
              </button>
            }
          >
            <div className="flex flex-col items-center py-2">
              <div className="flex items-center gap-3 mb-4 px-4 py-2.5 rounded-[8px] bg-[var(--surface-2)] border border-[var(--line)]">
                <Avatar name={picked.name} seed={picked.avatarSeed} size={44} />
                <div>
                  <div className="t-lg font-bold">{picked.name}</div>
                  <div className="t-sm text-[var(--text-2)] flex items-center gap-1.5">
                    <Lock className="size-3.5" />
                    <span>{en.login.demoHint}</span>
                  </div>
                </div>
              </div>

              {wrongPin && (
                <StatusNotice tone="warn" className="mb-4 w-full max-w-[360px]">
                  {en.login.wrongPin}
                </StatusNotice>
              )}

              <PinPad
                key={picked.id}
                onSubmit={submitPin}
                title="Tap 4 digits (1 2 3 4)"
              />
            </div>
          </PaperSheet>
        )}
      </div>

      <footer className="text-center t-sm text-[var(--text-3)] py-2">
        {COMPANY.groupName} · Offline-ready factory tablet system
      </footer>
    </div>
  );
}
