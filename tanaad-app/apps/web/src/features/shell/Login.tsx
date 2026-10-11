import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Eye, EyeOff, Fingerprint, KeyRound, Lock, Mail, ShieldCheck } from 'lucide-react';
import type { SiteCode, User } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { SITE_LIST, SITES } from '@/config/sites';
import { roleLabel } from '@/config/roles';
import { Avatar, Button, ChipGroup, Field, Input, Kbd, Note, PinPad, Tabs, cn } from '@/components/ui';
import { BrandPanel, Logo } from './BrandPanel';

export const emailOf = (u: User) => `${u.name.toLowerCase().replace(/[^a-z ]/g, '').trim().split(/\s+/).join('.')}@tanaad.co.ug`;
const DEMO_PIN = '1234';
const whereOf = (u: User) => { const sites = [...new Set(u.roles.map((r) => r.siteId).filter(Boolean))] as SiteCode[]; return sites.length ? sites.map((x) => SITES[x].shortName).join(' + ') : 'Head Office'; };

/**
 * Sign-in. Two ways in, matching how the sites work:
 *  - Password, for people with their own device (office staff, the CEOs).
 *  - PIN on a shared floor tablet: pick your name, type four digits.
 * The demo accepts any password and the PIN 1234; real authentication arrives with the API.
 */
export function Login() {
  const nav = useNavigate(); const users = useStore((s) => s.users); const logIn = useStore((s) => s.logIn);
  const [mode, setMode] = useState<'password' | 'pin'>('password');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [show, setShow] = useState(false); const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabletSite, setTabletSite] = useState<SiteCode>('mats'); const [pinUser, setPinUser] = useState<User | null>(null); const [pinError, setPinError] = useState<string | null>(null);

  const enter = (u: User, method: 'password' | 'pin') => { logIn(u.id, method); nav({ to: '/portals' as never }); };
  const submit = () => {
    const u = users.find((x) => emailOf(x) === email.trim().toLowerCase());
    if (!email.trim()) return setError('Enter your work email.');
    if (!u) return setError('No account with that email. Pick a demo account below.');
    if (!password) return setError('Enter your password.');
    setError(null); enter(u, 'password');
  };
  const demo = useMemo(() => {
    const order = ['u_ceo1', 'u_sm_mats', 'u_sup_mats', 'u_cash_mats', 'u_store_mats', 'u_mech', 'u_sales_mats', 'u_sm_bags', 'u_sup_bags', 'u_sm_rec', 'u_sup_rec', 'u_admin'];
    return order.map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
  }, [users]);
  const floor = useMemo(() => users.filter((u) => u.roles.some((r) => r.siteId === tabletSite && ['supervisor', 'storekeeper', 'gate', 'mechanic', 'cashier'].includes(r.role))), [users, tabletSite]);

  return (
    <div className="h-dvh overflow-auto bg-[var(--bg)] grid lg:grid-cols-[minmax(420px,46%)_1fr]">
      <BrandPanel />
      <div className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-[440px]">
          <div className="lg:hidden mb-8"><Logo /></div>
          <h2 className="text-[24px] font-semibold tracking-[-0.02em]">Sign in</h2>
          <p className="t-base text-[var(--text-2)] mt-1 mb-5">Use your own account, or your PIN on a shared floor tablet.</p>

          <Tabs className="mb-4" value={mode} onChange={(m) => { setMode(m); setError(null); setPinUser(null); setPinError(null); }} tabs={[{ value: 'password', label: <span className="inline-flex items-center gap-1.5"><KeyRound className="size-3.5" />Password</span> }, { value: 'pin', label: <span className="inline-flex items-center gap-1.5"><Fingerprint className="size-3.5" />Shared tablet PIN</span> }]} />

          {mode === 'password' ? (
            <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="surface p-5">
              <Field label="Work email" className="mb-3">
                <div className="relative"><Mail className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" /><Input big autoFocus type="email" autoComplete="username" placeholder="name@tanaad.co.ug" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} className="pl-9" /></div>
              </Field>
              <Field label="Password" className="mb-3">
                <div className="relative"><Lock className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" /><Input big type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }} className="pl-9 pr-10" />
                  <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 size-7 grid place-items-center rounded-md text-[var(--text-3)] hover:bg-[var(--hover)]">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>
              </Field>
              <div className="flex items-center justify-between mb-4 t-sm">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-[var(--brand)]" />Keep me signed in on this device</label>
                <button type="button" className="text-[var(--accent-strong)] font-medium hover:underline" onClick={() => setError('Ask your Site Manager or the Group Admin to reset it.')}>Forgot password?</button>
              </div>
              {error && <Note tone="bad" className="mb-3">{error}</Note>}
              <Button type="submit" variant="primary" size="lg" block>Sign in<ArrowRight className="size-4" /></Button>
              <div className="flex items-center gap-1.5 justify-center mt-3 t-xs text-[var(--text-3)]"><ShieldCheck className="size-3.5" />CEOs and admins confirm with a passkey or one-time code</div>
            </form>
          ) : (
            <div className="surface p-5">
              {!pinUser ? <>
                <div className="t-sm font-medium text-[var(--text-2)] mb-1.5">This tablet belongs to</div>
                <ChipGroup className="mb-4" value={tabletSite} onChange={setTabletSite} options={SITE_LIST.map((x) => ({ value: x.id, label: x.name }))} />
                <div className="t-sm font-medium text-[var(--text-2)] mb-1.5">Who are you?</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {floor.map((u) => (
                    <button key={u.id} onClick={() => { setPinUser(u); setPinError(null); }} className="rounded-lg border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--hover)] p-3 flex flex-col items-center gap-1.5 text-center lift">
                      <Avatar name={u.name} seed={u.avatarSeed} size={44} />
                      <span className="t-base font-medium leading-tight">{u.name}</span>
                      <span className="t-xs text-[var(--text-3)]">{[...new Set(u.roles.filter((r) => r.siteId === tabletSite).map((r) => roleLabel(r.role)))].join(' · ')}</span>
                    </button>
                  ))}
                </div>
              </> : <>
                <div className="flex items-center gap-3 mb-4"><Avatar name={pinUser.name} seed={pinUser.avatarSeed} size={44} /><div className="flex-1"><div className="t-lg font-semibold">{pinUser.name}</div><div className="t-sm text-[var(--text-3)]">{SITES[tabletSite].name}</div></div><Button size="sm" variant="ghost" onClick={() => setPinUser(null)}>Not you?</Button></div>
                <PinPad title="Enter your 4-digit PIN" error={pinError} onSubmit={(pin) => { if (pin === DEMO_PIN) enter(pinUser, 'pin'); else setPinError('Wrong PIN. The demo PIN is 1234.'); }} />
              </>}
            </div>
          )}

          <div className="mt-6">
            <div className="flex items-center gap-3 mb-2"><span className="t-label">Demo accounts</span><span className="flex-1 border-t border-[var(--line)]" /><span className="t-xs text-[var(--text-3)]">any password · PIN 1234</span></div>
            <div className="surface overflow-hidden max-h-[236px] overflow-y-auto scrollbar-thin">
              {demo.map((u) => (
                <button key={u.id} type="button" onClick={() => enter(u, 'password')} onMouseEnter={() => { if (mode === 'password') { setEmail(emailOf(u)); setPassword('demo-password'); } }}
                  className={cn('group w-full flex items-center gap-2.5 px-3 py-2 text-left border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--hover)]')}>
                  <Avatar name={u.name} seed={u.avatarSeed} size={26} />
                  <span className="min-w-0 flex-1"><span className="block t-base font-medium truncate">{u.name}</span><span className="block t-xs text-[var(--text-3)] truncate">{[...new Set(u.roles.map((r) => roleLabel(r.role)))].join(' + ')} · {whereOf(u)}</span></span>
                  <ArrowRight className="size-4 text-[var(--text-4)] group-hover:text-[var(--text)] group-hover:translate-x-0.5 transition-all" />
                </button>
              ))}
            </div>
            <p className="t-xs text-[var(--text-3)] mt-2 touch:hidden">Select an account to sign in as that person. <Kbd keys="tab" /> moves through the list, <Kbd keys="enter" /> signs in.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
