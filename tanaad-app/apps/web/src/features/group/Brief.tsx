import { useMemo, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { SITE_LIST } from '@/config/sites';
import { useStore } from '@/data/store';
import {
  cashDayFor,
  cashInSafe,
  cashSummary,
  headcount,
  massBalanceDay,
  openExceptions,
  outputToday,
} from '@/data/selectors';
import { compact, fmtDayLong, fmtNum, fmtTime, fmtUGX } from '@/data/format';
import { WhatsAppPreview } from '@/components/WhatsAppPreview';
import { messaging } from '@/devices';
import { en } from '@/i18n/en';
import {
  PaperSheet,
  SavedBanner,
  useSavedBanner,
} from '@/components/simple';
import { unitName } from './shared';

export function Brief() {
  const s = useStore();
  const { saved, showSaved, clearSaved } = useSavedBanner();
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(null);

  const ceos = s.users.filter((u) => u.roles.some((r) => r.role === 'ceo'));

  const sites = useMemo(
    () =>
      SITE_LIST.map((site) => {
        const hc = headcount(s, site.id, s.today);
        const o = outputToday(s, site.id, s.today);
        const units = o.reduce((t, x) => t + x.units, 0);
        const target = o.reduce((t, x) => t + x.target, 0);
        const cd = cashDayFor(s, site.id, s.today);
        const cash = cd
          ? cashSummary(s, cd.id).expectedClosing
          : cashInSafe(s, site.id);
        const dsp = s.dispatches.filter(
          (d) => d.siteId === site.id && d.createdAt.startsWith(s.today),
        ).length;
        const ex = openExceptions(s, site.id);
        return {
          site,
          hc: hc.total,
          units,
          target,
          cash,
          dsp,
          ex: ex.length,
          critical: ex.filter((e) => e.severity === 'critical').length,
        };
      }),
    [s],
  );

  const needs = useMemo(
    () => [
      ...openExceptions(s)
        .filter((e) => e.severity === 'critical' || e.ownerRole === 'ceo')
        .map((e) => e.title),
      ...SITE_LIST.map((site) => ({
        site,
        ...massBalanceDay(s, site.id, s.today),
      }))
        .filter((m) => m.state === 'missing')
        .map(
          (m) =>
            `${m.site.shortName}: ${fmtNum(m.gapKg)} kg unaccounted today`,
        ),
    ],
    [s],
  );

  const lines = useMemo(() => {
    const out: string[] = [`*Tanaad Group · ${fmtDayLong(s.today)}*`, ''];
    for (const x of sites) {
      out.push(
        `*${x.site.name}*`,
        `• ${x.hc} people came today`,
        `• ${fmtNum(x.units)} ${unitName(x.site.id)}${
          x.target
            ? ` of ${fmtNum(x.target)} target (${Math.round(
                (x.units / x.target) * 100,
              )}%)`
            : ''
        }`,
        `• Cash in safe: UGX ${compact(x.cash)}`,
        `• ${x.dsp} lorr${x.dsp === 1 ? 'y' : 'ies'} out`,
        `• ${x.ex} item${x.ex === 1 ? '' : 's'} waiting${
          x.critical ? ` (${x.critical} urgent)` : ''
        }`,
        '',
      );
    }
    if (needs.length) {
      out.push('*Waiting for your decision:*');
      for (const n of needs) out.push(`→ ${n}`);
    } else {
      out.push('Nothing is waiting for your decision right now.');
    }
    return out;
  }, [s.today, sites, needs]);

  const handleSend = async () => {
    if (sending) return;
    setSending(true);
    for (const c of ceos) {
      await messaging.sendWhatsApp(c.name, lines.join('\n'));
    }
    const now = new Date().toISOString();
    setSending(false);
    setSentAt(now);
    showSaved(
      `Morning message sent on WhatsApp to ${ceos
        .map((c) => c.name)
        .join(' and ')}`,
    );
  };

  return (
    <div className="space-y-6">
      <SavedBanner info={saved} onDismiss={clearSaved} />

      <PaperSheet
        title={en.ceo.briefTitle}
        subtitle={en.ceo.briefSubtitle}
        badge={
          sentAt ? (
            <span className="px-3 py-1 rounded-[6px] bg-[var(--ok-bg)] text-[var(--ok)] font-bold text-[14px]">
              ✓ Sent at {fmtTime(sentAt)}
            </span>
          ) : undefined
        }
      >
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-[10px] border border-[var(--line-2)] bg-[var(--surface-2)]">
            <div>
              <div className="text-[17px] font-bold text-[var(--text)]">
                Recipients: {ceos.map((c) => c.name).join(' · ')}
              </div>
              <div className="text-[15px] text-[var(--text-2)]">
                Five numbers for each factory today, plus anything waiting for your decision.
              </div>
            </div>

            <button
              type="button"
              disabled={sending}
              onClick={handleSend}
              className="min-h-[56px] px-7 rounded-[8px] bg-[var(--ok)] text-white font-bold text-[18px] flex items-center gap-2.5 cursor-pointer disabled:opacity-50"
            >
              {sentAt ? (
                <MessageCircle className="size-6" />
              ) : (
                <Send className="size-6" />
              )}
              <span>
                {sending
                  ? 'Sending on WhatsApp…'
                  : sentAt
                    ? 'Sent · Send again on WhatsApp'
                    : en.ceo.sendBrief}
              </span>
            </button>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 items-start">
            {ceos.map((c) => (
              <div key={c.id} className="space-y-2">
                <div className="text-[15px] font-bold text-[var(--text-2)]">
                  WhatsApp message to {c.name} (CEO)
                </div>
                <WhatsAppPreview
                  className="w-full"
                  to={c.name}
                  lines={lines}
                  sent={!!sentAt}
                />
              </div>
            ))}
          </div>

          {/* Plain summary table of where the 5 numbers come from */}
          <div className="pt-4 border-t border-[var(--line)]">
            <div className="text-[16px] font-bold text-[var(--text)] mb-3">
              The five numbers per factory in this message
            </div>
            <div className="overflow-x-auto border border-[var(--line-2)] rounded-[10px]">
              <table className="w-full border-collapse text-[16px]">
                <thead>
                  <tr className="bg-[var(--surface-2)] border-b border-[var(--line-2)] text-left">
                    <th className="py-3 px-4 font-bold">Factory</th>
                    <th className="py-3 px-4 font-bold text-right">1. People</th>
                    <th className="py-3 px-4 font-bold text-right">2. Made today</th>
                    <th className="py-3 px-4 font-bold text-right">3. Cash in safe</th>
                    <th className="py-3 px-4 font-bold text-right">4. Lorries out</th>
                    <th className="py-3 px-4 font-bold text-right">5. Waiting</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {sites.map((x) => (
                    <tr key={x.site.id}>
                      <td className="py-3 px-4 font-bold">{x.site.name}</td>
                      <td className="py-3 px-4 text-right num">{fmtNum(x.hc)}</td>
                      <td className="py-3 px-4 text-right num">
                        {fmtNum(x.units)} {unitName(x.site.id)}
                      </td>
                      <td className="py-3 px-4 text-right num font-semibold">
                        {fmtUGX(x.cash)}
                      </td>
                      <td className="py-3 px-4 text-right num">{fmtNum(x.dsp)}</td>
                      <td className="py-3 px-4 text-right num font-bold">
                        {x.ex}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </PaperSheet>
    </div>
  );
}
