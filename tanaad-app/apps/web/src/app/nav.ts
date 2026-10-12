import type { Role, SiteCode } from '@tanaad/domain';
import { Users, Wallet, Factory, Boxes, ShoppingCart, LayoutDashboard, Home, Wrench, Truck, Tag, ClipboardList, BarChart3, Gauge, Bell, Landmark, Settings, MessageSquareText, Sparkles, ScrollText, Scale, Recycle, FlaskConical, Scissors, Package, type LucideIcon } from 'lucide-react';

export interface NavItem { to: string; label: string; icon: LucideIcon; roles?: Role[]; sites?: SiteCode[]; group?: string; /** "g x" style jump shortcut */ keys?: string; /** extra words the command palette matches on */ words?: string; /** the work area this page is a tab of */ hub?: string }

/** Site navigation. Paths are relative to /s/$site. */
export const SITE_NAV: NavItem[] = [
  { to: 'today', hub: 'today', keys: 'g t', label: 'Today & Workflow', icon: Home },
  { to: 'dashboard', hub: 'dashboard', keys: 'g d', label: 'Factory Dashboard', icon: LayoutDashboard },
  { to: 'people/attendance', hub: 'people', keys: 'g a', label: 'Attendance Sheet', icon: Users, group: 'People', roles: ['supervisor', 'site_manager', 'ceo', 'group_admin'] },
  { to: 'people/signup', hub: 'people', keys: 'g u', label: 'Casual Sign-up', icon: Users, group: 'People', roles: ['supervisor', 'site_manager'] },
  { to: 'people/registry', hub: 'people', keys: 'g p', label: 'Workers & Pay', icon: ClipboardList, group: 'People', roles: ['site_manager', 'supervisor', 'ceo', 'group_admin'] },
  { to: 'people/settlement', hub: 'people', keys: 'g l', label: 'Wage Settlement', icon: Wallet, group: 'People', roles: ['site_manager', 'cashier', 'ceo', 'group_admin'] },
  { to: 'cash', hub: 'cash', keys: 'g c', label: 'Cash Book & Close', icon: Wallet, group: 'Cash', roles: ['cashier', 'site_manager', 'ceo', 'group_admin'] },
  { to: 'cash/expense', hub: 'cash', keys: 'g e', label: 'Record Expense', icon: Wallet, group: 'Cash', roles: ['cashier', 'site_manager'] },
  { to: 'production/wall', hub: 'production', keys: 'g w', label: 'Machine Wall', icon: Factory, group: 'Production', roles: ['supervisor', 'site_manager', 'ceo', 'group_admin', 'mechanic'] },
  { to: 'production/mixer', hub: 'production', label: 'Mixer Batch', icon: FlaskConical, group: 'Production', sites: ['mats'], roles: ['supervisor', 'site_manager'] },
  { to: 'production/extruders', hub: 'production', label: 'Extruders & Racks', icon: Factory, group: 'Production', sites: ['mats'], roles: ['supervisor', 'site_manager'] },
  { to: 'production/finishing', hub: 'production', label: 'Finishing & Bundles', icon: Tag, group: 'Production', sites: ['mats'], roles: ['supervisor', 'site_manager'] },
  { to: 'production/waste', hub: 'production', label: 'Waste Loop', icon: Recycle, group: 'Production', sites: ['mats'], roles: ['supervisor', 'site_manager'] },
  { to: 'production/raw', hub: 'production', label: 'Raw Material Issue', icon: Package, group: 'Production', sites: ['bags'], roles: ['supervisor', 'site_manager'] },
  { to: 'production/rolls', hub: 'production', label: 'Roll Sticker', icon: Tag, group: 'Production', sites: ['bags'], roles: ['supervisor', 'site_manager'] },
  { to: 'production/convert', hub: 'production', label: 'Bag Conversion', icon: Scissors, group: 'Production', sites: ['bags'], roles: ['supervisor', 'site_manager'] },
  { to: 'production/scrap', hub: 'production', label: 'Film Scrap', icon: Recycle, group: 'Production', sites: ['bags'], roles: ['supervisor', 'site_manager'] },
  { to: 'production/intake', hub: 'production', label: 'Scrap Weigh-In', icon: Scale, group: 'Production', sites: ['recycling'], roles: ['supervisor', 'site_manager', 'gate', 'storekeeper', 'cashier'] },
  { to: 'production/collectors', hub: 'production', label: 'Collector Ledger', icon: ClipboardList, group: 'Production', sites: ['recycling'], roles: ['supervisor', 'site_manager', 'cashier', 'ceo'] },
  { to: 'production/sacks', hub: 'production', label: 'Pellet Sacks', icon: Tag, group: 'Production', sites: ['recycling'], roles: ['supervisor', 'site_manager'] },
  { to: 'production/sheet', hub: 'production', keys: 'g h', label: 'Shift Log Sheet', icon: ScrollText, group: 'Production', roles: ['supervisor', 'site_manager', 'ceo', 'group_admin'] },
  { to: 'production/labels', hub: 'production', keys: 'g j', label: 'Print Labels', icon: Tag, group: 'Production', roles: ['supervisor', 'site_manager', 'storekeeper'] },
  { to: 'production/scan', hub: 'production', keys: 'g f', label: 'Scan Barcode', icon: Sparkles, group: 'Production' },
  { to: 'stock', hub: 'stock', keys: 'g s', label: 'Stock Overview', icon: Boxes, group: 'Stock', roles: ['storekeeper', 'site_manager', 'ceo', 'group_admin', 'sales'] },
  { to: 'stock/count', hub: 'stock', keys: 'g n', label: 'Stock Count', icon: ClipboardList, group: 'Stock', roles: ['storekeeper', 'site_manager'] },
  { to: 'stock/tagging', hub: 'stock', label: 'Tagging Campaign', icon: Tag, group: 'Stock', roles: ['storekeeper', 'site_manager'] },
  { to: 'stock/receive', hub: 'stock', label: 'Receive at Gate', icon: Scale, group: 'Stock', roles: ['storekeeper', 'gate', 'site_manager'] },
  { to: 'purchases', hub: 'stock', keys: 'g y', label: 'Purchases & Imports', icon: Package, group: 'Stock', roles: ['site_manager', 'cashier', 'storekeeper', 'ceo', 'group_admin'], words: 'import resin landed cost supplier' },
  { to: 'stock/dispatch', hub: 'dispatch', keys: 'g x', label: 'Load Lorry & Gate', icon: Truck, group: 'Stock', roles: ['storekeeper', 'gate', 'site_manager', 'ceo', 'group_admin'] },
  { to: 'stock/deliveries', hub: 'dispatch', keys: 'g v', label: 'Deliveries & POD', icon: Truck, group: 'Stock', roles: ['storekeeper', 'sales', 'site_manager', 'driver', 'ceo'] },
  { to: 'stock/movements', hub: 'stock', label: 'Stock Movements', icon: Boxes, group: 'Stock', roles: ['storekeeper', 'site_manager'] },
  { to: 'stock/spares', hub: 'maintenance', keys: 'g r', label: 'Spares Store', icon: Wrench, group: 'Maintenance', roles: ['mechanic', 'storekeeper', 'site_manager', 'ceo', 'group_admin'] },
  { to: 'stock/maintenance', hub: 'maintenance', keys: 'g b', label: 'Machine Breakdowns', icon: Wrench, group: 'Maintenance', roles: ['mechanic', 'site_manager', 'supervisor', 'ceo'] },
  { to: 'sales/orders', hub: 'sales', keys: 'g o', label: 'Customer Orders', icon: ShoppingCart, group: 'Sales', roles: ['sales', 'site_manager', 'cashier', 'storekeeper', 'ceo', 'group_admin'] },
  { to: 'sales/clients', hub: 'sales', keys: 'g k', label: 'Clients & Credit', icon: Landmark, group: 'Sales', roles: ['sales', 'site_manager', 'ceo', 'group_admin'] },
  { to: 'sales/invoices', hub: 'sales', keys: 'g i', label: 'Invoices & Statements', icon: ScrollText, group: 'Sales', roles: ['sales', 'cashier', 'site_manager', 'ceo'] },
  { to: 'reports', hub: 'reports', keys: 'g m', label: 'Reports & Export', icon: BarChart3, group: 'Manage', roles: ['site_manager', 'ceo', 'group_admin'] },
  { to: 'settings', hub: 'settings', keys: 'g ,', label: 'Site Settings', icon: Settings, group: 'Manage', roles: ['site_manager', 'ceo', 'group_admin'], words: 'master data products machines sizes units categories configuration' },
];

export const GROUP_NAV: NavItem[] = [
  { to: 'cockpit', hub: 'cockpit', keys: 'g c', label: 'Group Cockpit', icon: Gauge },
  { to: 'approvals', hub: 'decisions', keys: 'g a', label: 'Approvals & Decisions', icon: Bell },
  { to: 'credit', hub: 'decisions', keys: 'g r', label: 'Credit Desk', icon: Landmark },
  { to: 'brief', hub: 'records', keys: 'g b', label: 'Morning Brief', icon: MessageSquareText },
  { to: 'audit', hub: 'records', keys: 'g u', label: 'Audit Feed', icon: ScrollText },
  { to: 'people', hub: 'finance', keys: 'g p', label: 'Group People', icon: Users },
  { to: 'pnl', hub: 'finance', keys: 'g l', label: 'P&L & Unit Costs', icon: BarChart3 },
  { to: 'ask', hub: 'ask', keys: 'g k', label: 'Ask the Business', icon: Sparkles },
  { to: 'settings', hub: 'settings', keys: 'g ,', label: 'Group Settings', icon: Settings },
];

export const visibleSiteNav = (role: Role, site: SiteCode) => SITE_NAV.filter((n) => (!n.roles || n.roles.includes(role)) && (!n.sites || n.sites.includes(site)));

/** The handful of destinations each role lives in. Drives the phone tab bar and the first palette results. */
export const ROLE_TABS: Record<Role, string[]> = {
  supervisor: ['today', 'people/attendance', 'production/wall', 'production/labels'],
  cashier: ['today', 'cash', 'cash/expense', 'sales/orders'],
  storekeeper: ['today', 'stock', 'stock/dispatch', 'stock/spares'],
  gate: ['today', 'stock/receive', 'stock/dispatch', 'production/scan'],
  mechanic: ['today', 'stock/spares', 'stock/maintenance', 'production/wall'],
  sales: ['today', 'sales/orders', 'sales/clients', 'sales/invoices'],
  site_manager: ['today', 'dashboard', 'people/registry', 'reports'],
  driver: ['today', 'stock/deliveries', 'production/scan', 'stock/dispatch'],
  ceo: ['cockpit', 'approvals', 'credit', 'brief'],
  group_admin: ['cockpit', 'settings', 'people', 'audit'],
};

/**
 * Work areas. The sidebar lists these, not pages: one entry per job, with the related pages as tabs inside it.
 * A hub with a single visible page shows as that page.
 */
export interface Hub { key: string; label: string; icon: LucideIcon }
export const SITE_HUBS: Hub[] = [
  { key: 'today', label: 'Today & Workflow', icon: Home },
  { key: 'dashboard', label: 'Factory Dashboard', icon: LayoutDashboard },
  { key: 'people', label: 'People & Attendance', icon: Users },
  { key: 'cash', label: 'Cash & Expenses', icon: Wallet },
  { key: 'production', label: 'Production', icon: Factory },
  { key: 'stock', label: 'Stock & Receiving', icon: Boxes },
  { key: 'dispatch', label: 'Dispatch & Gate', icon: Truck },
  { key: 'maintenance', label: 'Spares & Repairs', icon: Wrench },
  { key: 'sales', label: 'Sales & Orders', icon: ShoppingCart },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'settings', label: 'Settings', icon: Settings },
];
export const GROUP_HUBS: Hub[] = [
  { key: 'cockpit', label: 'Group Cockpit', icon: Gauge },
  { key: 'decisions', label: 'Decisions & Approvals', icon: Bell },
  { key: 'finance', label: 'Finance & People', icon: BarChart3 },
  { key: 'records', label: 'Brief & Audit Log', icon: ScrollText },
  { key: 'ask', label: 'Ask the Business', icon: Sparkles },
  { key: 'settings', label: 'Settings', icon: Settings },
];
