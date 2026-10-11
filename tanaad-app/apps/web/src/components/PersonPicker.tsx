import { useMemo } from 'react';
import type { Person, SiteCode } from '@tanaad/domain';
import { useStore } from '@/data/store';
import { Avatar, Combobox } from './ui';

/**
 * Pick a worker. Searchable by name; workers from the preferred sector are listed first.
 * One component for every "operator", "finisher", "mechanic" field in the app.
 */
export function PersonPicker({ siteId, sector, value, onChange, placeholder = 'Search worker by name', autoFocus, includeShared = true, big }: { siteId: SiteCode; sector?: string | string[]; value?: string | null; onChange: (personId: string | null, person?: Person) => void; placeholder?: string; autoFocus?: boolean; includeShared?: boolean; big?: boolean }) {
  const people = useStore((s) => s.people);
  const options = useMemo(() => {
    const prefer = sector ? (Array.isArray(sector) ? sector : [sector]) : [];
    const pool = people.filter((p) => p.status === 'active' && (p.homeSiteId === siteId || (includeShared && p.sharedSites.includes(siteId))));
    const rank = (p: Person) => (prefer.includes(p.sector) ? 0 : 1);
    return [...pool].sort((a, b) => rank(a) - rank(b) || a.fullName.localeCompare(b.fullName)).map((p) => ({ value: p.id, label: p.fullName, sub: p.homeSiteId === siteId ? p.sector : `${p.sector} · shared`, left: <Avatar name={p.fullName} seed={p.avatarSeed} size={18} />, words: p.sector }));
  }, [people, siteId, sector, includeShared]);
  return <Combobox options={options} value={value ?? null} onChange={(v) => onChange(v, people.find((p) => p.id === v))} placeholder={placeholder} autoFocus={autoFocus} clearable big={big} />;
}
