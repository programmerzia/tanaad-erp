import { Building2, Factory, Recycle, ShoppingBag, type LucideIcon } from 'lucide-react';
import type { SiteCode } from '@tanaad/domain';

/** Each portal has a colour and an icon. Use them wherever a site is named, so people learn them once. */
export const SITE_COLOR: Record<SiteCode | 'group', string> = { mats: 'var(--site-mats)', bags: 'var(--site-bags)', recycling: 'var(--site-recycling)', group: 'var(--site-group)' };
export const SITE_ICON: Record<SiteCode | 'group', LucideIcon> = { mats: Factory, bags: ShoppingBag, recycling: Recycle, group: Building2 };
