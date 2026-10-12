import type { Role, SiteCode } from '@tanaad/domain';
import { Users, Wallet, Factory, Truck, Home, Gauge, Bell, ScrollText, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[];
  sites?: SiteCode[];
  group?: string;
  /** "g x" style jump shortcut */
  keys?: string;
  /** extra words the command palette matches on */
  words?: string;
  /** the work area this page is a tab of */
  hub?: string;
}

/**
 * v3 Streamlined Site navigation:
 * Exactly the 5 essential destinations needed for non-technical factory operators and site managers.
 */
export const SITE_NAV: NavItem[] = [
  { to: 'today', hub: 'today', keys: 'g t', label: "Today's Actions", icon: Home },
  { to: 'reports/production', hub: 'production', keys: 'g p', label: 'Production Report', icon: Factory, roles: ['supervisor', 'site_manager', 'ceo', 'group_admin', 'mechanic', 'storekeeper'] },
  { to: 'reports/attendance', hub: 'attendance', keys: 'g a', label: 'Attendance & Wages', icon: Users, roles: ['supervisor', 'site_manager', 'cashier', 'ceo', 'group_admin'] },
  { to: 'reports/cash', hub: 'cash', keys: 'g c', label: 'Cash & Expenses', icon: Wallet, roles: ['cashier', 'site_manager', 'ceo', 'group_admin', 'sales'] },
  { to: 'reports/dispatch', hub: 'dispatch', keys: 'g d', label: 'Dispatch & Gate', icon: Truck, roles: ['storekeeper', 'gate', 'site_manager', 'ceo', 'group_admin', 'sales', 'driver'] },
];

/**
 * v3 Streamlined Group navigation:
 * Exactly the essential 3-site overview and pending decisions for the CEOs.
 */
export const GROUP_NAV: NavItem[] = [
  { to: 'cockpit', hub: 'cockpit', keys: 'g c', label: 'CEO 3-Site Overview', icon: Gauge },
  { to: 'approvals', hub: 'decisions', keys: 'g a', label: 'Decisions & Approvals', icon: Bell },
  { to: 'brief', hub: 'records', keys: 'g b', label: 'Morning Brief & Audit', icon: ScrollText },
];

export const visibleSiteNav = (role: Role, site: SiteCode) =>
  SITE_NAV.filter((n) => (!n.roles || n.roles.includes(role)) && (!n.sites || n.sites.includes(site)));

/** The core tabs each role lands in on mobile/tablet. */
export const ROLE_TABS: Record<Role, string[]> = {
  supervisor: ['today', 'reports/production', 'reports/attendance'],
  cashier: ['today', 'reports/cash', 'reports/attendance'],
  storekeeper: ['today', 'reports/dispatch', 'reports/production'],
  gate: ['today', 'reports/dispatch'],
  mechanic: ['today', 'reports/production'],
  sales: ['today', 'reports/dispatch', 'reports/cash'],
  site_manager: ['today', 'reports/production', 'reports/attendance', 'reports/cash', 'reports/dispatch'],
  driver: ['today', 'reports/dispatch'],
  ceo: ['cockpit', 'approvals', 'brief'],
  group_admin: ['cockpit', 'approvals', 'brief'],
};

/**
 * Work areas (Hubs) for v3:
 * One entry per job, with zero nested clutter.
 */
export interface Hub {
  key: string;
  label: string;
  icon: LucideIcon;
}

export const SITE_HUBS: Hub[] = [
  { key: 'today', label: "Today's Actions", icon: Home },
  { key: 'production', label: 'Production Report', icon: Factory },
  { key: 'attendance', label: 'Attendance & Wages', icon: Users },
  { key: 'cash', label: 'Cash & Expenses', icon: Wallet },
  { key: 'dispatch', label: 'Dispatch & Gate', icon: Truck },
];

export const GROUP_HUBS: Hub[] = [
  { key: 'cockpit', label: 'CEO 3-Site Overview', icon: Gauge },
  { key: 'decisions', label: 'Decisions & Approvals', icon: Bell },
  { key: 'records', label: 'Morning Brief & Audit', icon: ScrollText },
];
