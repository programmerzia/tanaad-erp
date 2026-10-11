import { useParams, useNavigate, useRouterState } from '@tanstack/react-router';
import type { SiteCode } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { SITES } from '@/config/sites';
import { useMemo } from 'react';
import type { RefList } from '@tanaad/domain';
import { liveSite, refList } from '@/data/selectors';

/** Current site from the URL (site routes) or the session. */
export function useSite() {
  const params = useParams({ strict: false }) as { site?: SiteCode };
  const session = useStore((s) => s.session);
  const code = (params.site ?? session?.siteId ?? 'mats') as SiteCode;
  const refs = useStore((s) => s.refs); const settings = useStore((s) => s.siteSettings);
  // Sectors, downtime reasons, sub-categories and thresholds come from master data, so Settings changes show up everywhere at once.
  return useMemo(() => liveSite(useStore.getState(), SITES[code]), [code, refs, settings]); // eslint-disable-line react-hooks/exhaustive-deps
}
/** Options of a master-data list for the current (or a given) site. Use this instead of writing options into a screen. */
export function useRefList(list: RefList, opts: { site?: SiteCode; parentId?: string; includeInactive?: boolean } = {}) {
  const current = useSite(); const refs = useStore((s) => s.refs);
  return useMemo(() => refList(useStore.getState(), list, opts.site ?? current.id, opts), [refs, list, opts.site, current.id, opts.parentId, opts.includeInactive]); // eslint-disable-line react-hooks/exhaustive-deps
}
/** A site's tunable rules (tolerances, limits). */
export function useSiteSettings(site?: SiteCode) { const current = useSite(); return useStore((s) => s.siteSettings[site ?? current.id]); }
export function useSession() { return useStore((s) => s.session); }
export function useGo() {
  const nav = useNavigate(); const site = useSite();
  return { site: (path: string, siteCode?: SiteCode, q?: string) => nav({ to: `/s/${siteCode ?? site.id}/${path}` as never, search: (q ? { q } : {}) as never }), group: (path: string) => nav({ to: `/g/${path}` as never }), home: () => nav({ to: '/' }) };
}

/** Read a query-string value such as ?q=…. The command palette deep-links into list screens with it. */
export function useQueryParam(name: string): string | undefined {
  return useRouterState({ select: (st) => { const v = (st.location.search as Record<string, unknown>)[name]; return v === undefined || v === null ? undefined : String(v); } });
}
