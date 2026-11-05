import { useMemo, useState } from 'react';
import { Factory, Users, Wallet, Truck, AlertTriangle, CheckCircle2, Clock, ArrowRight, ShieldCheck, Scale, FileText, Check, Plus } from 'lucide-react';
import type { Role, ShiftKind, Site } from '@tanaad/domain';
import { useStore, type AppState } from '@/data/store';
import { useSite, useGo } from '@/app/hooks';
import { headcount, machineWall, cashDayFor, cashSummary, openExceptions, stockByProduct, intakeToday, lastWorkingDays, dailySeries } from '@/data/selectors';
import { fmtNum, fmtUGX, fmtKg } from '@/data/format';
import { Button, KpiStrip, Stat, Badge, cn } from '@/components/ui';

export function Today() {
  const s = useStore();
  const site = useSite();
  const go = useGo();
  const role: Role = s.session?.role ?? 'supervisor';
  const user = s.users.find((u) => u.id === s.session?.userId);

  const [quickLoomModal, setQuickLoomModal] = useState(false);
  const [selectedLoomCode, setSelectedLoomCode] = useState('LOOM-01');
  const [quickMeters, setQuickMeters] = useState('50');

  const shiftKind: ShiftKind = 'day';
  const hc = headcount(s, site.id, s.today, shiftKind);
  const wall = machineWall(s, site.id, s.today, shiftKind);
  const activeLooms = wall.filter((t) => t.state !== 'arriving' && t.state !== 'down');
  const loggedLooms = activeLooms.filter((t) => t.state !== 'not_logged').length;
  const downLooms = wall.filter((t) => t.state === 'down').length;

  const cd = cashDayFor(s, site.id, s.today);
  const cash = cd ? cashSummary(s, cd.id) : undefined;
  const safeBalance = cash ? cash.expectedClosing : 22990000;

  const ex = openExceptions(s, site.id);
  const heldLorries = s.dispatches.filter((d) => d.siteId === site.id && d.gateStatus === 'hold').length;
  const clearedLorries = s.dispatches.filter((d) => d.siteId === site.id && (d.gateStatus === 'pass' || d.gateStatus === 'overridden')).length;

  const handleQuickLog = () => {
    const targetLoom = wall.find((w) => w.machine.code === selectedLoomCode);
    if (!targetLoom) return;

    const meters = parseInt(quickMeters, 10) || 50;
    const currentUnits = targetLoom.entry?.goodUnits ?? 0;

    s.recordProduction({
      siteId: site.id,
      stageCode: targetLoom.machine.stageCode || 'weaving',
      machineId: targetLoom.machine.id,
      shiftId: `${site.id}-${s.today}-${shiftKind}`,
      day: s.today,
      productId: targetLoom.product?.id ?? s.products.filter((p) => p.siteId === site.id)[0]?.id,
      operatorId: targetLoom.operator?.id ?? s.people.filter((p) => p.homeSiteId === site.id)[0]?.id,
      goodUnits: currentUnits + meters,
      rejectUnits: targetLoom.entry?.rejectUnits ?? 0,
      inputKg: (targetLoom.entry?.inputKg ?? 0) + (meters * 0.26),
      outputKg: (targetLoom.entry?.outputKg ?? 0) + (meters * 0.25),
      downtimeMin: targetLoom.entry?.downtimeMin ?? 0,
    });

    s.toast({
      kind: 'ok',
      title: `${selectedLoomCode} output updated`,
      detail: `Added +${meters} meters to shift tally.`,
    });

    setQuickLoomModal(false);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Official Factory Shift Operations Header */}
      <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-semibold tracking-wider text-[var(--text-3)] uppercase">
              <span className="size-2 rounded-full bg-[var(--ok)]" />
              TANAAD INDUSTRIAL OPERATIONS · {site.legalName}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text)] mt-1">
              Shift Operational Dispatch Console
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-[var(--text-3)] mt-1 font-medium">
              <span>Shift: <strong className="text-[var(--text)]">Day (07:00–19:00 EAT)</strong></span>
              <span>•</span>
              <span>Supervisor: <strong className="text-[var(--text)]">{user?.name ?? 'Opio Ronald'}</strong></span>
              <span>•</span>
              <span>Plant Uptime: <strong className="text-[var(--ok)] font-mono">14 / 15 Looms Active (93.3%)</strong></span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setQuickLoomModal(true)}>
              Quick Loom Log
            </Button>
            <Button size="sm" variant="primary" icon={Factory} onClick={() => go.site('reports/production')}>
              Production Report
            </Button>
          </div>
        </div>
      </div>

      {/* Industrial Operational KPI Strip */}
      <KpiStrip className="grid-cols-2 md:grid-cols-4">
        <Stat
          label="On-Shift Labor Headcount"
          icon={Users}
          tone="ok"
          value={<>{hc.total} <span className="text-xs font-normal text-[var(--text-3)] font-sans">present</span></>}
          sub={`${hc.present} full shift · ${hc.half} half shift`}
          onClick={() => go.site('reports/attendance')}
        />
        <Stat
          label="Loom Output Status"
          icon={Factory}
          tone={downLooms > 0 ? 'warn' : 'ok'}
          value={<>{loggedLooms} / {activeLooms.length} <span className="text-xs font-normal text-[var(--text-3)] font-sans">logged</span></>}
          sub={downLooms > 0 ? `${downLooms} loom down for maintenance` : 'All 15 looms operating'}
          onClick={() => go.site('reports/production')}
        />
        <Stat
          label="Cash In Safe (Expected)"
          icon={Wallet}
          tone="brand"
          value={<>{fmtUGX(safeBalance)}</>}
          sub="Reconciled shift petty cash balance"
          onClick={() => go.site('reports/cash')}
        />
        <Stat
          label="Weighbridge Gate Status"
          icon={Truck}
          tone={heldLorries > 0 ? 'bad' : 'ok'}
          value={<>{clearedLorries} <span className="text-xs font-normal text-[var(--text-3)] font-sans">cleared</span></>}
          sub={heldLorries > 0 ? `${heldLorries} lorry held on weight discrepancy` : 'All lorries cleared without issue'}
          onClick={() => go.site('reports/dispatch')}
        />
      </KpiStrip>

      {/* Shift Timeline & Operational Handover Checklist */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[var(--surface)] border border-[var(--line)] rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--line)] mb-4">
            <div>
              <h2 className="text-base font-bold text-[var(--text)]">Shift Execution & Handover Protocol</h2>
              <p className="text-xs text-[var(--text-3)]">Chronological shift duties required before end-of-day sign-off</p>
            </div>
            <span className="text-xs font-mono font-bold text-[var(--ok)] bg-[var(--ok-bg)] border border-[var(--ok)]/20 px-2.5 py-1 rounded-md">
              4 of 5 Certified Complete
            </span>
          </div>

          <div className="space-y-3">
            {[
              {
                step: '07:00 – 07:30',
                title: 'Morning Roll-Call & Casual Worker Roster',
                desc: 'Verify physical presence, check safety boots & log 31 on-shift personnel.',
                status: 'done',
                actionLabel: 'View Roster',
                route: 'reports/attendance',
              },
              {
                step: '07:30 – 12:00',
                title: 'Extruder Polymer Feed & Mid-Shift Loom Counters',
                desc: 'Inspect virgin PP feed, verify reed speeds and log mid-shift meter counts.',
                status: 'done',
                actionLabel: 'Loom Matrix',
                route: 'reports/production',
              },
              {
                step: '12:00 – 14:00',
                title: 'Casual Lunch Allowance & Petty Cash Disbursement',
                desc: 'Disburse casual worker allowances and fuel receipts with voucher numbers.',
                status: 'done',
                actionLabel: 'Cash Book',
                route: 'reports/cash',
              },
              {
                step: '14:00 – 17:30',
                title: 'Outbound Weighbridge Scale & Gate Pass Clearance',
                desc: 'Weigh export lorries for Rwanda & South Sudan; verify <1% weight tolerance.',
                status: 'done',
                actionLabel: 'Gate Clearance',
                route: 'reports/dispatch',
              },
              {
                step: '18:00 – 19:00',
                title: 'Final Loom Reading & Outgoing Supervisor Sign-Off',
                desc: 'Count final mat meters, weigh scrap cutoffs, count safe cash and print handover log.',
                status: 'pending',
                actionLabel: 'Print Handover',
                route: 'reports/production',
              },
            ].map((st, idx) => (
              <div
                key={idx}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] hover:bg-[var(--hover)] transition-colors gap-3"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'size-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold',
                      st.status === 'done'
                        ? 'bg-[var(--ok)] text-white'
                        : 'bg-[var(--warn-bg)] text-[var(--warn)] border border-[var(--warn)]/30'
                    )}
                  >
                    {st.status === 'done' ? <Check className="size-3.5 stroke-[3]" /> : idx + 1}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[var(--text-3)]">{st.step}</span>
                      <span className="text-xs font-bold text-[var(--text)]">{st.title}</span>
                    </div>
                    <p className="text-xs text-[var(--text-3)] mt-0.5">{st.desc}</p>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => go.site(st.route)}
                  className="shrink-0 text-xs font-semibold"
                >
                  {st.actionLabel}
                  <ArrowRight className="size-3 ml-1" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Floor Notifications & Alerts */}
        <div className="space-y-4">
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-5 shadow-2xs">
            <h2 className="text-base font-bold text-[var(--text)] mb-1">Active Machine Alerts</h2>
            <p className="text-xs text-[var(--text-3)] mb-3">Live floor anomalies detected by sensors & supervisors</p>

            <div className="space-y-2.5">
              <div className="p-3 rounded-lg border border-[var(--warn)]/30 bg-[var(--warn-bg)] text-xs">
                <div className="flex items-center gap-1.5 font-bold text-[var(--warn)]">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  LOOM-12 · Umeme Grid Blackout
                </div>
                <p className="text-[var(--text-2)] mt-1">
                  Switched to Perkins 250kVA diesel generator. Output pace delayed by 35 mins.
                </p>
              </div>

              <div className="p-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] text-xs">
                <div className="flex items-center gap-1.5 font-bold text-[var(--text)]">
                  <ShieldCheck className="size-3.5 text-[var(--ok)] shrink-0" />
                  Weighbridge Scale Calibrated
                </div>
                <p className="text-[var(--text-2)] mt-1">
                  Avery Weigh-Tronix scale verified with 1,000kg test weights. Zero zero-drift.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-5 shadow-2xs">
            <h2 className="text-base font-bold text-[var(--text)] mb-1">Direct Operational Reports</h2>
            <p className="text-xs text-[var(--text-3)] mb-3">One-tap jump to official factory modules</p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => go.site('reports/production')}
                className="p-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] hover:bg-[var(--hover)] text-left font-semibold text-[var(--text)] transition-colors"
              >
                <Factory className="size-4 text-[var(--text-2)] mb-1" />
                Loom Production
              </button>
              <button
                onClick={() => go.site('reports/attendance')}
                className="p-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] hover:bg-[var(--hover)] text-left font-semibold text-[var(--text)] transition-colors"
              >
                <Users className="size-4 text-[var(--text-2)] mb-1" />
                Labor & Wages
              </button>
              <button
                onClick={() => go.site('reports/cash')}
                className="p-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] hover:bg-[var(--hover)] text-left font-semibold text-[var(--text)] transition-colors"
              >
                <Wallet className="size-4 text-[var(--text-2)] mb-1" />
                Cash & Expenses
              </button>
              <button
                onClick={() => go.site('reports/dispatch')}
                className="p-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] hover:bg-[var(--hover)] text-left font-semibold text-[var(--text)] transition-colors"
              >
                <Truck className="size-4 text-[var(--text-2)] mb-1" />
                Dispatch & Gate
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Loom Modal */}
      {quickLoomModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-2xl max-w-sm w-full p-5 text-[var(--text)]">
            <h3 className="text-base font-bold text-[var(--text)]">Quick Floor Loom Output</h3>
            <p className="text-xs text-[var(--text-3)] mt-0.5">Increment machine meter reading directly from tablet</p>

            <div className="space-y-3 mt-4 text-xs">
              <div>
                <label className="block font-semibold text-[var(--text-2)] mb-1">Select Machine</label>
                <select
                  value={selectedLoomCode}
                  onChange={(e) => setSelectedLoomCode(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] text-xs font-mono font-semibold"
                >
                  {wall.map((m) => (
                    <option key={m.machine.code} value={m.machine.code}>
                      {m.machine.code} — {m.operator?.fullName ?? 'Unassigned'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-2)] mb-1">Add Output Meters</label>
                <input
                  type="number"
                  value={quickMeters}
                  onChange={(e) => setQuickMeters(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] font-mono text-sm font-bold"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setQuickLoomModal(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={handleQuickLog}>
                Save Output
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
