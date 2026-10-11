import { Keyboard, ShieldCheck, WifiOff } from 'lucide-react';

/** Decorative woven pattern: a nod to the mats, drawn as crossing bands. Purely ornamental. */
export function WeavePattern({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="weave" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect x="0" y="4" width="20" height="12" rx="2" fill="currentColor" opacity=".9" />
          <rect x="20" y="24" width="20" height="12" rx="2" fill="currentColor" opacity=".9" />
          <rect x="24" y="0" width="12" height="20" rx="2" fill="currentColor" opacity=".45" />
          <rect x="4" y="20" width="12" height="20" rx="2" fill="currentColor" opacity=".45" />
        </pattern>
        <radialGradient id="fade" cx="70%" cy="20%" r="80%"><stop offset="0" stopColor="#fff" stopOpacity="1" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <mask id="m"><rect width="400" height="400" fill="url(#fade)" /></mask>
      </defs>
      <rect width="400" height="400" fill="url(#weave)" mask="url(#m)" />
    </svg>
  );
}

export function Logo({ onDark, size = 32 }: { onDark?: boolean; size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="rounded-lg grid place-items-center font-bold shrink-0" style={{ width: size, height: size, fontSize: size * 0.46, background: onDark ? '#fff' : 'var(--brand)', color: onDark ? 'var(--color-ink-900)' : 'var(--brand-contrast)' }}>T</span>
      <div className="leading-tight"><div className="font-semibold tracking-[0.01em]" style={{ fontSize: size * 0.47 }}>Tanaad</div><div className={onDark ? 'text-white/50' : 'text-[var(--text-3)]'} style={{ fontSize: Math.max(10.5, size * 0.34) }}>Management System</div></div>
    </div>
  );
}

/** Left half of the sign-in screen. */
export function BrandPanel() {
  return (
    <div className="hidden lg:flex relative overflow-hidden flex-col justify-between p-10 text-white" style={{ background: 'radial-gradient(900px 500px at 90% -10%, rgb(217 126 34 / .28), transparent 60%), linear-gradient(150deg, #0c1f26, #173a45 70%, #1d4451)' }}>
      <WeavePattern className="absolute inset-0 w-full h-full text-white/[0.055]" />
      <div className="relative"><Logo onDark size={36} /></div>
      <div className="relative">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 h-7 text-[12px] text-white/75 mb-5"><span className="size-1.5 rounded-full bg-[var(--color-amber-400)] anim-live" />Mats · Bags · Recycling · Group HQ</div>
        <h1 className="text-[38px] leading-[1.08] font-semibold tracking-[-0.025em] max-w-[15ch]">One group. Three operations. <span className="text-[var(--color-amber-400)]">One set of numbers.</span></h1>
        <p className="mt-4 text-[15px] leading-relaxed text-white/65 max-w-[44ch]">Every kilogram weighed twice, every shilling in a category, every change on record. Built for the factory floor and the owner's phone alike.</p>
        <div className="mt-9 grid gap-3 max-w-[420px]">
          {[
            { icon: WifiOff, title: 'Works through power and network cuts', text: 'Keeps recording on the device, syncs when the line is back.' },
            { icon: Keyboard, title: 'Keyboard-first at the desk, big targets on the floor', text: 'One app that fits the cashier, the supervisor and the CEO.' },
            { icon: ShieldCheck, title: 'Nothing disappears', text: 'Append-only ledger: edits, overrides and reopenings are all visible.' },
          ].map((f) => (
            <div key={f.title} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.045] px-3.5 py-3 backdrop-blur-sm">
              <span className="size-8 rounded-lg bg-[rgb(217_126_34/.18)] text-[var(--color-amber-400)] grid place-items-center shrink-0"><f.icon className="size-4" /></span>
              <div><div className="text-[13.5px] font-medium">{f.title}</div><div className="text-[12.5px] text-white/55">{f.text}</div></div>
            </div>
          ))}
        </div>
      </div>
      <div className="relative flex items-center justify-between text-[12px] text-white/40"><span>Tanaad Group · Kampala, Uganda</span><span>v0.2 demo · seeded from the August 2026 site visit</span></div>
    </div>
  );
}
