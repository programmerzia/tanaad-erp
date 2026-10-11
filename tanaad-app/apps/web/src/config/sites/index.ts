import type { Site, SiteCode } from '@tanaad/domain';
import { mats } from './mats';
import { bags } from './bags';
import { recycling } from './recycling';

export const SITES: Record<SiteCode, Site> = { mats, bags, recycling };
export const SITE_LIST: Site[] = [mats, bags, recycling];
export const siteOf = (code: SiteCode) => SITES[code];
