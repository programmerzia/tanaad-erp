import { createRootRoute, createRoute, createRouter, Outlet, lazyRouteComponent, redirect } from '@tanstack/react-router';
import type { Role, SiteCode } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { AppShell } from '@/features/shell/AppShell';

const root = createRootRoute({ component: () => <Outlet /> });
/**
 * "/" is the sign-in screen. Two shortcuts through it:
 *  - /?as=<role>&site=<code>&go=<path>  (PWA app shortcuts, presenter jumps, screenshots) signs straight in;
 *  - an already signed-in person goes to their portals.
 */
const index = createRoute({
  getParentRoute: () => root, path: '/',
  beforeLoad: () => {
    const st = useStore.getState(); const q = new URLSearchParams(window.location.search); const as = q.get('as') as Role | null;
    if (as) {
      const sc = (q.get('site') as SiteCode | null) ?? undefined;
      const u = st.users.find((x) => x.roles.some((r) => r.role === as && (sc ? r.siteId === sc : !r.siteId))) ?? st.users.find((x) => x.roles.some((r) => r.role === as)) ?? st.users[0];
      st.signIn(u.id, as, sc);
      throw redirect({ to: (q.get('go') ?? (sc ? `/s/${sc}/today` : '/g/cockpit')) as never, replace: true });
    }
    if (st.auth) throw redirect({ to: '/portals' as never, replace: true });
  },
  component: lazyRouteComponent(() => import('@/features/shell/Login'), 'Login'),
});
const portals = createRoute({ getParentRoute: () => root, path: '/portals', beforeLoad: () => { const st = useStore.getState(); if (!st.auth && !st.session) throw redirect({ to: '/' }); }, component: lazyRouteComponent(() => import('@/features/shell/Portals'), 'Portals') });

const requireSession = () => { const st = useStore.getState(); if (!st.session) throw redirect({ to: st.auth ? ('/portals' as never) : '/' }); };

// ----- Group layer -----
const group = createRoute({ getParentRoute: () => root, path: '/g', beforeLoad: requireSession, component: () => <AppShell scope="group" /> });
const g = (path: string, mod: () => Promise<Record<string, unknown>>, name: string) => createRoute({ getParentRoute: () => group, path, component: lazyRouteComponent(mod as never, name as never) });
const groupRoutes = [
  g('cockpit', () => import('@/features/group/Cockpit'), 'Cockpit'),
  g('approvals', () => import('@/features/group/Approvals'), 'Approvals'),
  g('credit', () => import('@/features/group/CreditDesk'), 'CreditDesk'),
  g('brief', () => import('@/features/group/Brief'), 'Brief'),
  g('audit', () => import('@/features/group/AuditFeed'), 'AuditFeed'),
  g('people', () => import('@/features/group/GroupPeople'), 'GroupPeople'),
  g('pnl', () => import('@/features/group/Pnl'), 'Pnl'),
  g('ask', () => import('@/features/group/Ask'), 'Ask'),
  g('settings', () => import('@/features/settings/Settings'), 'Settings'),
];

// ----- Site layer -----
const site = createRoute({ getParentRoute: () => root, path: '/s/$site', beforeLoad: ({ params }) => { requireSession(); if (!['mats', 'bags', 'recycling'].includes(params.site)) throw redirect({ to: '/' }); }, component: () => <AppShell scope="site" /> });
const s = (path: string, mod: () => Promise<Record<string, unknown>>, name: string) => createRoute({ getParentRoute: () => site, path, component: lazyRouteComponent(mod as never, name as never) });
const siteRoutes = [
  s('today', () => import('@/features/shell/Today'), 'Today'),
  s('dashboard', () => import('@/features/shell/SiteDashboard'), 'SiteDashboard'),
  s('people/signup', () => import('@/features/people/Signup'), 'Signup'),
  s('people/registry', () => import('@/features/people/Registry'), 'Registry'),
  s('people/attendance', () => import('@/features/people/Attendance'), 'Attendance'),
  s('people/settlement', () => import('@/features/people/Settlement'), 'Settlement'),
  s('cash', () => import('@/features/cash/CashPage'), 'CashPage'),
  s('cash/expense', () => import('@/features/cash/Expense'), 'Expense'),
  s('production/wall', () => import('@/features/production/MachineWall'), 'MachineWall'),
  s('production/sheet', () => import('@/features/production/ShiftSheet'), 'ShiftSheet'),
  s('production/labels', () => import('@/features/production/PrintLabel'), 'PrintLabel'),
  s('production/scan', () => import('@/features/production/ScanAnything'), 'ScanAnything'),
  s('production/mixer', () => import('@/features/mats/Mixer'), 'Mixer'),
  s('production/extruders', () => import('@/features/mats/Extruders'), 'Extruders'),
  s('production/finishing', () => import('@/features/mats/Finishing'), 'Finishing'),
  s('production/waste', () => import('@/features/mats/Waste'), 'Waste'),
  s('production/raw', () => import('@/features/bags/RawIssue'), 'RawIssue'),
  s('production/rolls', () => import('@/features/bags/RollSticker'), 'RollSticker'),
  s('production/convert', () => import('@/features/bags/Conversion'), 'Conversion'),
  s('production/scrap', () => import('@/features/bags/FilmScrap'), 'FilmScrap'),
  s('production/intake', () => import('@/features/recycling/Intake'), 'Intake'),
  s('production/collectors', () => import('@/features/recycling/CollectorLedger'), 'CollectorLedger'),
  s('production/sacks', () => import('@/features/recycling/Sacks'), 'Sacks'),
  s('stock', () => import('@/features/stock/StockWall'), 'StockWall'),
  s('stock/count', () => import('@/features/stock/StockCount'), 'StockCount'),
  s('stock/tagging', () => import('@/features/stock/Tagging'), 'Tagging'),
  s('stock/receive', () => import('@/features/stock/Receive'), 'Receive'),
  s('stock/dispatch', () => import('@/features/stock/Dispatch'), 'Dispatch'),
  s('stock/deliveries', () => import('@/features/stock/Deliveries'), 'Deliveries'),
  s('stock/movements', () => import('@/features/stock/Movements'), 'Movements'),
  s('stock/spares', () => import('@/features/stock/Spares'), 'Spares'),
  s('stock/maintenance', () => import('@/features/stock/Maintenance'), 'Maintenance'),
  s('sales/clients', () => import('@/features/sales/Clients'), 'Clients'),
  s('sales/orders', () => import('@/features/sales/Orders'), 'Orders'),
  s('sales/invoices', () => import('@/features/sales/Invoices'), 'Invoices'),
  s('reports', () => import('@/features/reports/Reports'), 'Reports'),
  s('settings', () => import('@/features/settings/Settings'), 'Settings'),
  s('purchases', () => import('@/features/purchases/Purchases'), 'Purchases'),
];

const routeTree = root.addChildren([index, portals, group.addChildren(groupRoutes), site.addChildren(siteRoutes)]);
export const router = createRouter({ routeTree, defaultPreload: 'intent', scrollRestoration: true });
declare module '@tanstack/react-router' { interface Register { router: typeof router } }
export type { SiteCode };
