import type { ReactNode } from 'react';
import { Construction } from 'lucide-react';
import { PageHeader, Card, Badge, Note } from '@/components/ui';

/** Designed static page used until a screen is built. Never shows "coming soon" without substance. */
export function Placeholder({ title, eyebrow, phase, summary, numbers, toBeConfirmed, children }: { title: string; eyebrow?: string; phase: 1 | 2 | 3 | 4; summary: string; numbers?: { label: string; value: string }[]; toBeConfirmed?: string; children?: ReactNode }) {
  return (
    <div>
      <PageHeader eyebrow={eyebrow} title={title} subtitle={summary} actions={<Badge tone="accent">Phase {phase}</Badge>} />
      {toBeConfirmed && <Note tone="warn" className="mb-4"><strong>To be confirmed with the client.</strong> {toBeConfirmed}</Note>}
      {numbers && <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">{numbers.map((n) => <Card key={n.label}><div className="text-[12px] uppercase tracking-wider text-[var(--text-3)] font-semibold">{n.label}</div><div className="num text-[26px] font-semibold mt-1">{n.value}</div></Card>)}</div>}
      {children ?? <Card className="flex items-center gap-3 text-[var(--text-2)]"><Construction className="size-5" />Interactive version of this screen is in the build queue.</Card>}
    </div>
  );
}
