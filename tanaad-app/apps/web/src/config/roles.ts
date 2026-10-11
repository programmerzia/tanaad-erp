import type { Role } from '@tanaad/domain';

export interface RoleMeta { role: Role; label: string; scope: 'group' | 'site'; description: string; device: string }

export const ROLES: RoleMeta[] = [
  { role: 'ceo', label: 'CEO', scope: 'group', description: 'Cockpit, approvals, brief, audit', device: 'Phone' },
  { role: 'site_manager', label: 'Site Manager', scope: 'site', description: 'Dashboard, people, settlement, reports', device: 'Desktop' },
  { role: 'supervisor', label: 'Supervisor', scope: 'site', description: 'Attendance, machine wall, labels', device: 'Tablet' },
  { role: 'cashier', label: 'Cashier', scope: 'site', description: 'Cash page, expenses, close day', device: 'Desktop' },
  { role: 'storekeeper', label: 'Storekeeper', scope: 'site', description: 'Stock, dispatch, spares', device: 'Tablet' },
  { role: 'gate', label: 'Gate', scope: 'site', description: 'Weigh in, weigh out', device: 'Tablet' },
  { role: 'mechanic', label: 'Mechanic', scope: 'site', description: 'Take part, breakdowns', device: 'Tablet' },
  { role: 'sales', label: 'Sales', scope: 'site', description: 'Clients, orders, invoices', device: 'Desktop' },
  { role: 'group_admin', label: 'Group Admin', scope: 'group', description: 'Settings and configuration', device: 'Desktop' },
];

export const roleLabel = (r: Role) => ROLES.find((x) => x.role === r)?.label ?? r;
