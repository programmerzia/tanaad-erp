import { COMPANY } from '@/config/company';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { Bell, Building2, ChevronRight, ChevronsUpDown, Cloud, CloudOff, Contrast, Download, Factory, HelpCircle, Keyboard, LayoutGrid, LogOut, Menu as MenuIcon, MonitorSmartphone, Moon, MoreHorizontal, PanelLeft, Recycle, RefreshCw, Search, ShoppingBag, Sun, X, type LucideIcon } from 'lucide-react';
import type { Role, SiteCode } from '@tanaad/domain';
import { useStore, pendingCount } from '@/data/store';
import { useSite } from '@/app/hooks';
import { GROUP_HUBS, GROUP_NAV, ROLE_TABS, SITE_HUBS, visibleSiteNav, type NavItem } from '@/app/nav';
import { registerHotkey, useHotkey } from '@/app/hotkeys';
import { usePrefs } from '@/app/prefs';
import { usePwa } from '@/app/pwa';
import { SITE_LIST } from '@/config/sites';
import { roleLabel } from '@/config/roles';
import { SITE_COLOR, SITE_ICON } from '@/config/siteIdentity';
import { Avatar, cn, IconButton, Kbd, Menu, useMedia, type MenuItem } from '@/components/ui';
import { fmtDayLong, fmtDateTime } from '@/data/format';
import { cashDayFor, currentShiftKind, openExceptions, portalsFor } from '@/data/selectors';
import { PresenterPanel } from '@/demo/PresenterPanel';
import { Toasts } from './Toasts';
import { CommandPalette } from './CommandPalette';
import { ShortcutHelp } from './ShortcutHelp';

type Item = NavItem & { href: string };
/** Remember the tab last used in each work area, so the sidebar returns you to where you were. */
const hubMemory: Record<string, string> = (() => { try { return JSON.parse(sessionStorage.getItem('tanaad-hubs') ?? '{}'); } catch { return {}; } })();
const rememberHub = (scopeKey: string, hub: string, href: string) => { hubMemory[`${scopeKey}:${hub}`] = href; try { sessionStorage.setItem('tanaad-hubs', JSON.stringify(hubMemory)); } catch { /* private mode */ } };
const isOn = (pathname: string, items: Item[], n: Item) => [...items].sort((a, b) => b.href.length - a.href.length).find((x) => pathname === x.href || pathname.startsWith(`${x.href}/`))?.href === n.href;

/** The pages of the current work area as tabs. "," and "." step through them. */
function HubTabs({ tabs, pathname }: { tabs: Item[]; pathname: string }) {
  const nav = useNavigate(); const idx = tabs.findIndex((t) => isOn(pathname, tabs, t));
  const step = (d: number) => { if (tabs.length < 2) return; const n = tabs[(Math.max(0, idx) + d + tabs.length) % tabs.length]; nav({ to: n.href as never }); };
  useHotkey(',', () => step(-1), { label: 'Previous tab in this area', group: 'Global', enabled: tabs.length > 1 });
  useHotkey('.', () => step(1), { label: 'Next tab in this area', group: 'Global', enabled: tabs.length > 1 });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [pathname]);
  if (tabs.length < 2) return null;
  return (
    <div ref={ref} className="shrink-0 bg-[var(--chrome)] border-b border-[var(--line)] px-[var(--page-x)] flex items-center gap-1 overflow-x-auto no-scrollbar no-print" role="tablist" aria-label="Pages in this area">
      {tabs.map((t) => { const on = isOn(pathname, tabs, t); return (
        <Link key={t.href} to={t.href as never} role="tab" aria-selected={on} aria-current={on ? 'page' : undefined}
          className={cn('relative shrink-0 inline-flex items-center gap-1.5 h-10 touch:h-12 px-2.5 t-base whitespace-nowrap border-b-2 -mb-px transition-colors', on ? 'border-[var(--accent)] text-[var(--text)] font-semibold' : 'border-transparent text-[var(--text-3)] hover:text-[var(--text)] font-medium')}>
          <t.icon className={cn('size-4', on ? 'text-[var(--accent-strong)]' : 'opacity-70')} strokeWidth={2} />{t.label}
        </Link>
      ); })}
      <span className="ml-auto pl-3 shrink-0 hidden xl:inline-flex items-center gap-1 t-xs text-[var(--text-4)]"><Kbd keys="," /><Kbd keys="." />switch tab</span>
    </div>
  );
}

const DARK_KBD = '[&_kbd]:bg-white/10 [&_kbd]:border-white/15 [&_kbd]:text-white/60';

export function AppShell({ scope }: { scope: 'group' | 'site' }) {
  const session = useStore((s) => s.session);
  const site = useSite(); const nav = useNavigate(); const loc = useLocation();
  const desktop = useMedia('(min-width: 1024px)');
  const collapsed = usePrefs((s) => s.sidebarCollapsed); const toggleSidebar = usePrefs((s) => s.toggleSidebar);
  const [drawer, setDrawer] = useState(false);
  const main = useRef<HTMLElement>(null);
  const role: Role = session?.role ?? 'supervisor';
  const canGroup = role === 'ceo' || role === 'group_admin';

  const items = useMemo<Item[]>(() => (scope === 'group' ? GROUP_NAV.map((n) => ({ ...n, href: `/g/${n.to}` })) : visibleSiteNav(role, site.id).map((n) => ({ ...n, href: `/s/${site.id}/${n.to}` }))), [scope, role, site.id]);
  const current = useMemo(() => [...items].sort((a, b) => b.href.length - a.href.length).find((n) => loc.pathname === n.href || loc.pathname.startsWith(`${n.href}/`)), [items, loc.pathname]);

  const hubs = scope === 'group' ? GROUP_HUBS : SITE_HUBS; const scopeKey = scope === 'group' ? 'g' : site.id;
  const hubTabs = useMemo(() => (current?.hub ? items.filter((n) => n.hub === current.hub) : []), [items, current]);
  const hub = hubs.find((h) => h.key === current?.hub);
  useEffect(() => { if (current?.hub) rememberHub(scopeKey, current.hub, current.href); }, [current, scopeKey]);
  useEffect(() => { setDrawer(false); main.current?.scrollTo({ top: 0 }); }, [loc.pathname]);
  useEffect(() => { document.title = `${current?.label ?? 'Tanaad'} · ${scope === 'group' ? 'Head Office' : site.name}`; }, [current, scope, site.name]);

  // "g x" jumps and Alt+digit portal switching. Registered imperatively because the list varies by role.
  useEffect(() => {
    const st = useStore.getState(); const access = portalsFor(st, st.session?.userId ?? '');
    const offs = items.filter((n) => n.keys).map((n) => registerHotkey({ keys: n.keys!, label: n.label, group: 'Go to', run: () => nav({ to: n.href as never }) }));
    access.sites.forEach((p, i) => { if (!p.roles.length) return; offs.push(registerHotkey({ keys: `alt+${i + 1}`, label: SITE_LIST[i].name, group: 'Portals', run: () => { if (!canGroup) st.signIn(st.session!.userId, p.roles[0], p.id); nav({ to: `/s/${p.id}/${canGroup ? 'dashboard' : 'today'}` as never }); } })); });
    if (canGroup) offs.push(registerHotkey({ keys: 'alt+0', label: 'Head Office', group: 'Portals', run: () => nav({ to: '/g/cockpit' as never }) }));
    offs.push(registerHotkey({ keys: 'alt+p', label: 'All portals', group: 'Portals', run: () => nav({ to: '/portals' as never }) }));
    return () => offs.forEach((f) => f());
  }, [items, nav, canGroup]);
  useHotkey('mod+b', toggleSidebar, { label: 'Collapse or expand the sidebar', group: 'Global' });

  return (
    <div className="h-dvh flex bg-[var(--bg)] text-[var(--text)]">
      {desktop && <Sidebar scope={scope} items={items} pathname={loc.pathname} collapsed={collapsed} canGroup={canGroup} />}
      <div className="flex-1 min-w-0 flex flex-col">
        <TitleBar scope={scope} current={current} hubLabel={hub && hubTabs.length > 1 ? hub.label : undefined} desktop={desktop} onMenu={() => (desktop ? toggleSidebar() : setDrawer(true))} />
        <HubTabs tabs={hubTabs} pathname={loc.pathname} />
        <main ref={main} id="main" className="flex-1 min-h-0 overflow-auto scrollbar-thin">
          <div className="px-[var(--page-x)] py-[var(--page-y)] max-w-[1720px] mx-auto pb-12"><Outlet /></div>
        </main>
        {desktop ? <StatusBar scope={scope} /> : <BottomNav items={items} pathname={loc.pathname} role={role} onMore={() => setDrawer(true)} />}
      </div>
      {!desktop && drawer && (
        <div className="fixed inset-0 z-[60] flex" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-[rgb(8_14_17/.5)] anim-fade" />
          <div onClick={(e) => e.stopPropagation()} className="relative h-full w-[288px] max-w-[86vw] flex flex-col anim-fade">
            <Sidebar scope={scope} items={items} pathname={loc.pathname} collapsed={false} canGroup={canGroup} embedded onClose={() => setDrawer(false)} />
          </div>
        </div>
      )}
      <CommandPalette scope={scope} site={site.id} />
      <ShortcutHelp />
      <Toasts />
      <PresenterPanel />
    </div>
  );
}

/* ───────────────────────────── Sidebar: the branded frame ───────────────────────────── */
function Sidebar({ scope, items, pathname, collapsed, canGroup, embedded, onClose }: { scope: 'group' | 'site'; items: Item[]; pathname: string; collapsed: boolean; canGroup: boolean; embedded?: boolean; onClose?: () => void }) {
  const site = useSite(); const nav = useNavigate(); const s = useStore(); const prefs = usePrefs(); const pwa = usePwa();
  const user = s.users.find((u) => u.id === s.session?.userId); const role = s.session?.role ?? 'supervisor';
  const access = useMemo(() => portalsFor(s, s.session?.userId ?? ''), [s.users, s.session?.userId]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => { const m: { group: string; list: Item[] }[] = []; for (const i of items) { const g = i.group ?? ''; const last = m[m.length - 1]; if (last && last.group === g) last.list.push(i); else m.push({ group: g, list: [i] }); } return m; }, [items]);
  const active = useMemo(() => [...items].sort((a, b) => b.href.length - a.href.length).find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))?.href, [items, pathname]);
  const key: SiteCode | 'group' = scope === 'group' ? 'group' : site.id; const WsIcon = SITE_ICON[key];
  const scopeKey = scope === 'group' ? 'g' : site.id;
  const hubList = useMemo(() => (scope === 'group' ? GROUP_HUBS : SITE_HUBS).map((h) => ({ ...h, pages: items.filter((n) => n.hub === h.key) })).filter((h) => h.pages.length > 0), [scope, items]);
  const exCount = scope === 'site' ? openExceptions(s, site.id).length : openExceptions(s).length;

  const wsItems: MenuItem[] = [
    ...access.sites.filter((p) => p.roles.length).map((p) => ({ label: SITE_LIST.find((x) => x.id === p.id)!.name, hint: canGroup ? undefined : roleLabel(p.roles[0]), keys: `alt+${['mats', 'bags', 'recycling'].indexOf(p.id) + 1}`, checked: scope === 'site' && p.id === site.id, onSelect: () => { if (!canGroup) s.signIn(s.session!.userId, p.roles[0], p.id); nav({ to: `/s/${p.id}/${canGroup ? 'dashboard' : 'today'}` as never }); } })),
    ...(canGroup ? [{ label: 'Head Office', keys: 'alt+0', checked: scope === 'group', onSelect: () => nav({ to: '/g/cockpit' as never }) }] : []),
    { label: 'All portals', icon: LayoutGrid, keys: 'alt+p', divider: true, onSelect: () => nav({ to: '/portals' as never }) },
  ];
  const userItems: MenuItem[] = [
    { label: 'All portals', icon: LayoutGrid, keys: 'alt+p', onSelect: () => nav({ to: '/portals' as never }) },
    { label: prefs.theme === 'dark' ? 'Light theme' : 'Dark theme', icon: Contrast, onSelect: prefs.toggleTheme, divider: true },
    { label: prefs.density === 'compact' ? 'Touch layout' : 'Compact layout', icon: MonitorSmartphone, onSelect: prefs.toggleDensity },
    { label: 'Keyboard shortcuts', icon: Keyboard, keys: '?', onSelect: () => prefs.setHelp(true) },
    ...(pwa.canInstall ? [{ label: 'Install app', icon: Download, onSelect: () => void pwa.install() }] : []),
    { label: 'Sign out', icon: LogOut, divider: true, onSelect: () => { s.signOut(); nav({ to: '/' }); } },
  ];

  return (
    <aside className={cn('shrink-0 flex flex-col min-h-0 no-print text-[var(--side-text)]', !embedded && 'transition-[width] duration-150', embedded && 'flex-1')}
      style={{ width: embedded ? undefined : collapsed ? 56 : 'var(--sidebar-w)', background: 'linear-gradient(180deg, var(--side-bg), var(--side-bg-2))' }}>
      {/* Workspace */}
      <div className={cn('app-drag shrink-0 h-[var(--titlebar-h)] flex items-center border-b border-[var(--side-line)]', collapsed ? 'justify-center px-0' : 'px-2.5 gap-1')} style={{ paddingLeft: collapsed ? undefined : 'max(10px, env(titlebar-area-x, 0px))' }}>
        <Menu items={wsItems} width={236} className="flex-1 min-w-0" trigger={({ toggle }) => (
          <button onClick={toggle} title={collapsed ? (scope === 'group' ? 'Head Office' : site.name) : undefined} className={cn('w-full flex items-center gap-2.5 rounded-lg hover:bg-[var(--side-hover)] text-left', collapsed ? 'justify-center h-9' : 'px-1.5 h-10')}>
            <span className="size-7 rounded-lg grid place-items-center shrink-0 text-white" style={{ background: SITE_COLOR[key] }}><WsIcon className="size-4" strokeWidth={2.25} /></span>
            {!collapsed && <><span className="min-w-0 flex-1 leading-tight"><span className="block text-[13.5px] font-semibold text-[var(--side-text-strong)] truncate">{scope === 'group' ? 'Head Office' : site.name}</span><span className="block text-[11px] text-[var(--side-text-dim)] truncate">{scope === 'group' ? COMPANY.name : site.legalName}</span></span><ChevronsUpDown className="size-3.5 text-[var(--side-text-dim)] shrink-0" /></>}
          </button>
        )} />
        {embedded && <button onClick={onClose} aria-label="Close menu" className="size-9 grid place-items-center rounded-lg hover:bg-[var(--side-hover)]"><X className="size-4" /></button>}
      </div>

      {/* Navigation: one entry per work area */}
      <nav className={cn('flex-1 overflow-y-auto no-scrollbar py-2.5', collapsed ? 'px-2' : 'px-2.5')} aria-label="Main">
        {hubList.map((h) => {
          const on = h.pages.some((n) => n.href === active);
          const target = hubMemory[`${scopeKey}:${h.key}`] && h.pages.some((n) => n.href === hubMemory[`${scopeKey}:${h.key}`]) ? hubMemory[`${scopeKey}:${h.key}`] : h.pages[0].href;
          const label = h.pages.length === 1 ? h.pages[0].label : h.label;
          const badge = h.key === 'dashboard' || h.key === 'decisions' ? exCount : 0;
          return (
            <Link key={h.key} to={target as never} title={collapsed ? label : undefined} aria-current={on ? 'page' : undefined}
              className={cn('group relative flex items-center gap-2.5 h-9 touch:h-12 mb-0.5 rounded-lg t-base outline-offset-0', collapsed ? 'justify-center px-0' : 'px-2.5', on ? 'bg-[var(--side-active)] text-[var(--side-text-strong)] font-medium' : 'hover:bg-[var(--side-hover)] hover:text-[var(--side-text-strong)]')}>
              {on && <span className="absolute -left-2.5 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-[var(--accent)]" />}
              <h.icon className={cn('size-[18px] touch:size-5 shrink-0', on ? 'text-[var(--color-amber-400)]' : 'opacity-80')} strokeWidth={2} />
              {!collapsed && <span className="truncate flex-1">{label}</span>}
              {!collapsed && badge > 0 && <span className="num min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--accent)] text-white text-[10.5px] font-semibold grid place-items-center">{badge}</span>}
              {!collapsed && !badge && h.pages.length > 1 && <span className="num text-[10.5px] text-[var(--side-text-dim)]">{h.pages.length}</span>}
              {collapsed && badge > 0 && <span className="absolute top-1 right-1.5 size-2 rounded-full bg-[var(--accent)]" />}
            </Link>
          );
        })}
        {!collapsed && <button onClick={() => prefs.setPalette(true)} className={cn('mt-3 w-full flex items-center gap-2 h-9 px-2.5 rounded-lg border border-[var(--side-line)] text-[12.5px] text-[var(--side-text-dim)] hover:bg-[var(--side-hover)] hover:text-[var(--side-text)] touch:hidden', DARK_KBD)}><Search className="size-3.5" /><span className="flex-1 text-left">Find anything</span><Kbd keys="mod+k" /></button>}
      </nav>

      {/* Person */}
      <div className={cn('shrink-0 border-t border-[var(--side-line)]', collapsed ? 'p-2' : 'p-2.5')}>
        <Menu items={userItems} placement="top" width={228} trigger={({ toggle }) => (
          <button onClick={toggle} className={cn('w-full flex items-center gap-2.5 rounded-lg hover:bg-[var(--side-hover)] text-left', collapsed ? 'justify-center h-9' : 'px-1.5 h-11')} aria-label="Account">
            <Avatar name={user?.name ?? '?'} seed={user?.avatarSeed} size={28} />
            {!collapsed && <><span className="min-w-0 flex-1 leading-tight"><span className="block text-[13px] font-medium text-[var(--side-text-strong)] truncate">{user?.name}</span><span className="block text-[11px] text-[var(--side-text-dim)] truncate">{roleLabel(role)}</span></span><MoreHorizontal className="size-4 text-[var(--side-text-dim)] shrink-0" /></>}
          </button>
        )} />
      </div>
    </aside>
  );
}

/* ───────────────────────────── Title bar ───────────────────────────── */
function TitleBar({ scope, current, hubLabel, desktop, onMenu }: { scope: 'group' | 'site'; current?: Item; hubLabel?: string; desktop: boolean; onMenu: () => void }) {
  const site = useSite(); const nav = useNavigate(); const wide = useMedia('(min-width: 1200px)');
  const session = useStore((s) => s.session); const users = useStore((s) => s.users); const signOut = useStore((s) => s.signOut);
  const alerts = useStore((s) => s.alerts); const markAlertsRead = useStore((s) => s.markAlertsRead);
  const online = useStore((s) => s.online); const pending = useStore(pendingCount);
  const prefs = usePrefs();
  const [alertsOpen, setAlertsOpen] = useState(false);
  const bell = useRef<HTMLDivElement>(null);
  const user = users.find((u) => u.id === session?.userId);
  const unread = alerts.filter((a) => !a.read).length;
  useEffect(() => { if (!alertsOpen) return; const away = (e: MouseEvent) => { if (!bell.current?.contains(e.target as Node)) setAlertsOpen(false); }; window.addEventListener('mousedown', away); return () => window.removeEventListener('mousedown', away); }, [alertsOpen]);
  const key: SiteCode | 'group' = scope === 'group' ? 'group' : site.id;

  return (
    <header className="app-drag shrink-0 h-[var(--titlebar-h)] bg-[var(--chrome)] border-b border-[var(--line)] flex items-center gap-1.5 pl-2 no-print"
      style={{ paddingRight: 'max(10px, calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw) + 10px))' }}>
      <IconButton icon={desktop ? PanelLeft : MenuIcon} label={desktop ? 'Toggle sidebar' : 'Menu'} onClick={onMenu} className="app-no-drag" />
      <nav className="app-no-drag flex items-center gap-1.5 min-w-0 t-base pl-1" aria-label="Breadcrumb">
        <span className="size-2 rounded-[3px] shrink-0" style={{ background: SITE_COLOR[key] }} />
        <span className={cn('whitespace-nowrap', current ? 'text-[var(--text-3)] hidden md:inline' : 'font-semibold')}>{scope === 'group' ? 'Head Office' : site.name}</span>
        {current && desktop && hubLabel && <><ChevronRight className="size-3.5 text-[var(--text-4)] shrink-0" /><span className="text-[var(--text-3)] whitespace-nowrap">{hubLabel}</span></>}
        {current && <><ChevronRight className="size-3.5 text-[var(--text-4)] shrink-0 hidden md:block" /><span className="font-semibold whitespace-nowrap">{current.label}</span></>}
      </nav>
      <div className="flex-1 min-w-2" />
      {wide ? (
        <button onClick={() => prefs.setPalette(true)} className="app-no-drag ctl w-[min(400px,30vw)] px-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-2)] hover:bg-[var(--surface)] flex items-center gap-2 text-[var(--text-3)] t-base transition-colors">
          <Search className="size-3.5" /><span className="flex-1 text-left truncate">Search or jump to…</span><Kbd keys="mod+k" />
        </button>
      ) : <IconButton icon={Search} label="Search" onClick={() => prefs.setPalette(true)} className="app-no-drag" />}
      <div className="flex-1 min-w-2 hidden lg:block" />
      <div className={cn('app-no-drag hidden sm:flex items-center gap-1.5 px-2.5 h-7 rounded-full t-sm font-medium border', !online ? 'bg-[var(--bad-bg)] text-[var(--bad)] border-transparent' : pending ? 'bg-[var(--warn-bg)] text-[var(--warn)] border-transparent' : 'text-[var(--text-2)] border-[var(--line)]')} title={online ? 'All changes are saved on this device and synced' : 'Working offline. Changes are saved on this device and will sync.'}>
        {!online ? <CloudOff className="size-3.5" /> : pending ? <RefreshCw className="size-3.5 animate-spin" /> : <span className="size-1.5 rounded-full bg-[var(--ok)] anim-live" />}
        <span>{!online ? `Offline · ${pending} queued` : pending ? `Syncing ${pending}` : 'Live'}</span>
      </div>
      <div ref={bell} className="relative app-no-drag">
        <IconButton icon={Bell} label="Alerts" active={alertsOpen} onClick={() => { setAlertsOpen((v) => !v); markAlertsRead(); }} />
        {unread > 0 && <span className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-[var(--bad)] text-white text-[10px] font-semibold grid place-items-center pointer-events-none anim-alarm">{unread}</span>}
        {alertsOpen && (
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[360px] max-w-[calc(100vw-16px)] bg-[var(--surface)] border border-[var(--line-2)] rounded-lg shadow-[var(--shadow-pop)] anim-pop overflow-hidden">
            <div className="px-3 h-10 flex items-center justify-between border-b border-[var(--line)]"><span className="t-base font-semibold">Alerts</span><span className="t-xs text-[var(--text-3)]">Critical ones also reach the CEOs on WhatsApp</span></div>
            {alerts.length === 0 ? <div className="px-3 py-7 text-center t-sm text-[var(--text-3)]">No alerts.</div> : alerts.slice(0, 8).map((a) => (
              <div key={a.id} className="px-3 py-2 border-b border-[var(--line)] last:border-b-0 flex gap-2.5"><span className="mt-1.5 size-2 rounded-full bg-[var(--bad)] shrink-0" /><div className="min-w-0"><div className="flex items-baseline justify-between gap-2"><span className="t-base font-medium">{a.title}</span><span className="t-xs text-[var(--text-3)] shrink-0">{fmtDateTime(a.at)}</span></div><div className="t-sm text-[var(--text-2)]">{a.detail}</div></div></div>
            ))}
          </div>
        )}
      </div>
      <IconButton icon={prefs.theme === 'dark' ? Sun : Moon} label={prefs.theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={prefs.toggleTheme} className="app-no-drag hidden sm:grid" />
      <IconButton icon={HelpCircle} label="Keyboard shortcuts" onClick={() => prefs.setHelp(true)} className="app-no-drag hidden sm:grid" />
      {!desktop && <Menu align="right" items={[{ label: 'All portals', icon: LayoutGrid, onSelect: () => nav({ to: '/portals' as never }) }, { label: prefs.theme === 'dark' ? 'Light theme' : 'Dark theme', icon: Contrast, onSelect: prefs.toggleTheme }, { label: 'Sign out', icon: LogOut, divider: true, onSelect: () => { signOut(); nav({ to: '/' }); } }]} trigger={({ toggle }) => <button onClick={toggle} className="ml-0.5" aria-label="Account"><Avatar name={user?.name ?? '?'} seed={user?.avatarSeed} size={30} /></button>} />}
    </header>
  );
}

/* ───────────────────────────── Status bar (desktop) ───────────────────────────── */
function StatusBar({ scope }: { scope: 'group' | 'site' }) {
  const site = useSite(); const s = useStore(); const prefs = usePrefs(); const pwa = usePwa();
  const pending = pendingCount(s); const kind = currentShiftKind();
  const shift = site.shifts.find((x) => x.kind === kind);
  const cd = scope === 'site' ? cashDayFor(s, site.id, s.today) : undefined;
  const Seg = ({ children, onClick, title }: { children: React.ReactNode; onClick?: () => void; title?: string }) => onClick
    ? <button onClick={onClick} title={title} className="h-full px-2.5 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 hover:bg-white/10 hover:text-white">{children}</button>
    : <span title={title} className="h-full px-2.5 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">{children}</span>;
  const offline = !s.online;
  return (
    <footer className={cn('shrink-0 h-[var(--statusbar-h)] flex items-stretch overflow-hidden text-[11px] select-none no-print transition-colors', DARK_KBD, offline ? 'bg-[var(--color-bad-500)] text-white' : 'bg-[var(--side-bg)] text-[var(--side-text)]')}>
      {scope === 'site' ? <>
        <Seg><span className="size-1.5 rounded-full" style={{ background: SITE_COLOR[site.id] }} />{site.legalName}</Seg>
        <Seg>{kind === 'day' ? 'Day' : 'Night'} shift {shift?.starts}–{shift?.ends}</Seg>
        <Seg>{fmtDayLong(s.today)}</Seg>
        <Seg title="Today's cash page">{cd ? `Cash day ${cd.status}` : 'No cash day'}</Seg>
      </> : <><Seg><Building2 className="size-3" />{COMPANY.name}</Seg><Seg>{fmtDayLong(s.today)}</Seg><Seg>USD 1 = UGX {s.fx.toLocaleString()}</Seg></>}
      <span className="flex-1" />
      {pwa.canInstall && <Seg onClick={() => void pwa.install()} title="Install as a desktop app"><Download className="size-3" />Install app</Seg>}
      {pwa.updateReady && <Seg onClick={pwa.applyUpdate}><RefreshCw className="size-3" />Update ready</Seg>}
      <Seg title={pwa.offlineReady ? 'The app is cached on this device. It opens without a network.' : 'Preparing the offline cache'}>{pwa.offlineReady ? 'Offline ready' : 'Caching…'}</Seg>
      <Seg onClick={() => s.setOnline(!s.online)} title="Click to simulate losing or regaining the connection">{s.online ? <Cloud className="size-3" /> : <CloudOff className="size-3" />}{s.online ? (pending ? `${pending} syncing` : 'Synced') : `Offline · ${pending} queued on this device`}</Seg>
      <Seg onClick={prefs.toggleDensity} title="Switch between compact (keyboard and mouse) and touch layout"><MonitorSmartphone className="size-3" />{prefs.density === 'compact' ? 'Compact' : 'Touch'}</Seg>
      <Seg onClick={() => prefs.setHelp(true)}><Keyboard className="size-3" />Shortcuts <Kbd keys="?" /></Seg>
      <Seg>v0.2</Seg>
    </footer>
  );
}

/* ───────────────────────────── Tab bar (phones, small tablets) ───────────────────────────── */
function BottomNav({ items, pathname, role, onMore }: { items: Item[]; pathname: string; role: Role; onMore: () => void }) {
  const tabs = (ROLE_TABS[role] ?? []).map((to) => items.find((i) => i.to === to)).filter((x): x is Item => !!x).slice(0, 4);
  const list = tabs.length >= 2 ? tabs : items.slice(0, 4);
  return (
    <nav className="shrink-0 bg-[var(--surface)] border-t border-[var(--line)] grid no-print" style={{ gridTemplateColumns: `repeat(${list.length + 1}, minmax(0,1fr))`, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} aria-label="Primary">
      {list.map((n) => { const on = pathname === n.href || pathname.startsWith(`${n.href}/`); return (
        <Link key={n.href} to={n.href as never} className={cn('relative h-14 flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium', on ? 'text-[var(--text)]' : 'text-[var(--text-3)]')}>
          {on && <span className="absolute top-0 h-[2px] w-8 rounded-b-full bg-[var(--accent)]" />}
          <n.icon className="size-5" strokeWidth={on ? 2.25 : 2} /><span className="truncate max-w-full px-1">{n.label}</span>
        </Link>
      ); })}
      <button onClick={onMore} className="h-14 flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium text-[var(--text-3)]"><MoreHorizontal className="size-5" /><span>More</span></button>
    </nav>
  );
}
