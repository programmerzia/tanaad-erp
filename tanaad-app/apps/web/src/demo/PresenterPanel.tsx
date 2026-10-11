import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { RotateCcw, WifiOff, Siren, X, Play } from 'lucide-react';
import { useStore } from '@/data/store';
import { wipeStorage } from '@/data/persist';
import { Button, cn, useHotkey } from '@/components/ui';

/** Hidden presenter controls. Toggle with Ctrl+. (period). Excluded from production builds. */
const ACTS: { title: string; steps: { label: string; to: string; role: string; site?: 'mats' | 'bags' | 'recycling' }[] }[] = [
  { title: 'Act 1 · Group', steps: [{ label: 'Sign in', to: '/', role: '__logout' }, { label: 'Portals', to: '/portals', role: 'ceo' }, { label: 'CEO cockpit', to: '/g/cockpit', role: 'ceo' }, { label: 'Morning brief', to: '/g/brief', role: 'ceo' }] },
  { title: 'Act 2 · Mats', steps: [{ label: 'Site dashboard', to: '/s/mats/dashboard', role: 'site_manager', site: 'mats' }, { label: 'Casual sign-up', to: '/s/mats/people/signup', role: 'supervisor', site: 'mats' }, { label: 'Attendance grid', to: '/s/mats/people/attendance', role: 'supervisor', site: 'mats' }, { label: 'Cash page', to: '/s/mats/cash', role: 'cashier', site: 'mats' }, { label: 'Mixer batch', to: '/s/mats/production/mixer', role: 'supervisor', site: 'mats' }, { label: 'Loom Wall', to: '/s/mats/production/wall', role: 'supervisor', site: 'mats' }, { label: 'Finishing & sticker', to: '/s/mats/production/finishing', role: 'supervisor', site: 'mats' }, { label: 'Waste loop', to: '/s/mats/production/waste', role: 'supervisor', site: 'mats' }, { label: 'Cargo Builder', to: '/s/mats/stock/dispatch', role: 'storekeeper', site: 'mats' }, { label: 'Spares store', to: '/s/mats/stock/spares', role: 'mechanic', site: 'mats' }] },
  { title: 'Act 3 · Bags', steps: [{ label: 'Bags dashboard', to: '/s/bags/dashboard', role: 'site_manager', site: 'bags' }, { label: 'Roll sticker', to: '/s/bags/production/rolls', role: 'supervisor', site: 'bags' }, { label: 'Conversion', to: '/s/bags/production/convert', role: 'supervisor', site: 'bags' }, { label: 'Settlement', to: '/s/bags/people/settlement', role: 'site_manager', site: 'bags' }] },
  { title: 'Act 4 · Recycling', steps: [{ label: 'Recycling dashboard', to: '/s/recycling/dashboard', role: 'site_manager', site: 'recycling' }, { label: 'Collector intake', to: '/s/recycling/production/intake', role: 'gate', site: 'recycling' }, { label: 'Line Wall', to: '/s/recycling/production/wall', role: 'supervisor', site: 'recycling' }, { label: 'Pellet stock', to: '/s/recycling/stock', role: 'storekeeper', site: 'recycling' }] },
  { title: 'Act 5 · Close', steps: [{ label: 'Credit desk', to: '/g/credit', role: 'ceo' }, { label: 'Audit feed', to: '/g/audit', role: 'ceo' }, { label: 'P&L & unit costs', to: '/g/pnl', role: 'ceo' }, { label: 'Settings', to: '/g/settings', role: 'group_admin' }] },
];

export function PresenterPanel() {
  const [open, setOpen] = useState(false); const nav = useNavigate();
  const online = useStore((s) => s.online); const setOnline = useStore((s) => s.setOnline); const reset = useStore((s) => s.resetDemo); const signIn = useStore((s) => s.signIn); const users = useStore((s) => s.users); const pushAlert = useStore((s) => s.pushAlert); const raise = useStore((s) => s.raiseException);
  useHotkey('mod+.', () => setOpen((v) => !v), { label: 'Presenter panel', group: 'Global' });
  if (import.meta.env.PROD && !import.meta.env.VITE_DEMO) return null;
  const logOut = useStore((s) => s.signOut);
  const jump = (st: (typeof ACTS)[number]['steps'][number]) => {
    if (st.role === '__logout') { logOut(); nav({ to: '/' }); return; } const u = users.find((x) => x.roles.some((r) => r.role === st.role && (!st.site || r.siteId === st.site || !r.siteId))) ?? users[0]; signIn(u.id, st.role as never, st.site); nav({ to: st.to as never }); };
  return (
    <>
      <button onClick={() => setOpen((v) => !v)} title="Presenter panel (Ctrl+.)" className="fixed bottom-[calc(var(--statusbar-h)+8px)] left-2 z-[70] size-6 rounded-md bg-[var(--surface)] border border-[var(--line-2)] text-[var(--text-3)] grid place-items-center opacity-40 hover:opacity-100 touch:bottom-[72px] no-print"><Play className="size-3" /></button>
      {open && (
        <div className={cn('fixed bottom-14 left-2 z-[70] w-[340px] max-w-[calc(100vw-24px)] max-h-[80dvh] overflow-y-auto surface p-3 anim-pop')}>
          <div className="flex items-center justify-between mb-2"><div className="font-bold">Presenter</div><button onClick={() => setOpen(false)}><X className="size-4" /></button></div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <Button size="sm" icon={RotateCcw} onClick={async () => { reset(); await wipeStorage(); location.href = '/'; }}>Reset</Button>
            <Button size="sm" icon={WifiOff} variant={online ? 'secondary' : 'danger'} onClick={() => setOnline(!online)}>{online ? 'Go offline' : 'Reconnect'}</Button>
            <Button size="sm" icon={Siren} onClick={() => { raise({ siteId: 'mats', kind: 'gate_variance', severity: 'critical', title: 'Gate held: DN-00001 to Kigali Home & Mat Traders', detail: 'Weight variance −12.6% exceeds ±2%. Scanned 140 bundles, order has 150.', ownerRole: 'ceo' }); pushAlert({ title: 'Gate locked at Mats', detail: 'DN-00001: weight 640 kg short', siteId: 'mats' }); }}>Alert</Button>
          </div>
          {ACTS.map((a) => <div key={a.title} className="mb-2"><div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-3)] mb-1">{a.title}</div><div className="flex flex-wrap gap-1.5">{a.steps.map((s) => <button key={s.to} onClick={() => jump(s)} className="h-8 px-2.5 rounded-lg border border-[var(--line)] text-[12.5px] font-medium hover:bg-[var(--surface-2)]">{s.label}</button>)}</div></div>)}
          <div className="text-[11px] text-[var(--text-3)] mt-2">Ctrl+. toggles · Site Manager PIN 2468 · Mechanic PIN 1357</div>
        </div>
      )}
    </>
  );
}
