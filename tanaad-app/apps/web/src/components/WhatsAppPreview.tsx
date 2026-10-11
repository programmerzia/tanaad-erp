import { Check, CheckCheck } from 'lucide-react';
import { cn } from './ui';

export function WhatsAppPreview({ to, lines, attachment, sent, className, time }: { to: string; lines: string[]; attachment?: string; sent?: boolean; className?: string; time?: string }) {
  return (
    <div className={cn('rounded-2xl overflow-hidden border border-[var(--line)] max-w-[380px]', className)} style={{ background: '#e5ddd5' }}>
      <div className="px-4 py-2.5 text-white text-sm font-semibold flex items-center gap-2" style={{ background: '#075e54' }}><span className="size-7 rounded-full bg-white/20 grid place-items-center text-[11px]">T</span>{to}</div>
      <div className="p-3 min-h-[120px]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,.05) 1px, transparent 0)', backgroundSize: '14px 14px' }}>
        <div className="ml-auto max-w-[92%] rounded-xl rounded-tr-sm px-3 py-2 text-[13.5px] text-neutral-900 shadow-sm whitespace-pre-wrap leading-snug" style={{ background: '#dcf8c6' }}>
          {attachment && <div className="mb-2 rounded-lg bg-white/70 px-2.5 py-2 text-[12px] font-semibold flex items-center gap-2"><span className="size-7 rounded bg-red-500 text-white grid place-items-center text-[9px] font-bold">PDF</span>{attachment}</div>}
          {lines.join('\n')}
          <div className="text-[10px] text-neutral-500 text-right mt-1 flex items-center justify-end gap-1">{time ?? ''} {sent ? <CheckCheck className="size-3.5 text-sky-500" /> : <Check className="size-3.5" />}</div>
        </div>
      </div>
    </div>
  );
}
