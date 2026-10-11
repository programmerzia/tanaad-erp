import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Label, Product, Machine, Person, Site } from '@tanaad/domain';
import { cn } from './ui';
import { fmtDayShort } from '@/data/format';

export function QR({ value, size = 96 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState('');
  useEffect(() => { QRCode.toString(value, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).then(setSvg).catch(() => setSvg('')); }, [value]);
  return <div style={{ width: size, height: size }} className="[&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** The digital twin of the paper sticker. Monospace, printable, QR-coded. */
export function Sticker({ label, product, machine, operator, site, shiftKind, printing, className, compact }: { label: Label; product?: Product; machine?: Machine; operator?: Person; site: Site; shiftKind?: string; printing?: boolean; className?: string; compact?: boolean }) {
  const rows: [string, string][] = site.id === 'bags' && label.kind === 'roll'
    ? [['DATE', fmtDayShort(label.day) + ' ' + label.day.slice(0, 4).slice(2)], ['OPERATOR', operator?.fullName ?? '—'], ['SHIFT', shiftKind ?? '—'], ['MACHINE', machine?.code.replace('Extruder ', '') ?? '—'], ['KG', String(label.qtyKg)], ['ROLL', product?.internalName.replace(' film roll', '') ?? '—']]
    : label.kind === 'bundle' || label.kind === 'pack'
      ? [['PRODUCT', product?.internalName ?? '—'], ['PIECES', String(label.qtyUnits)], ['STD KG', `${label.qtyKg}${product?.weightStatus === 'to_be_measured' ? ' *' : ''}`], ['MACHINE', machine?.code ?? '—'], ['SHIFT', `${shiftKind ?? ''} ${fmtDayShort(label.day)}`.trim()], ['BY', operator?.fullName.split(' ')[0] ?? '—']]
      : label.kind === 'sack'
        ? [['MATERIAL', product?.internalName ?? label.grade ?? 'Scrap'], ['NET KG', String(label.qtyKg)], ['LINE', machine?.code ?? '—'], ['GRADE', label.grade ?? '—'], ['SHIFT', `${shiftKind ?? ''} ${fmtDayShort(label.day)}`.trim()]]
        : [['TYPE', label.kind.toUpperCase()], ['KG', String(label.qtyKg)], ['MACHINE', machine?.code ?? '—'], ['COLOUR', label.colour ?? '—'], ['DATE', fmtDayShort(label.day)]];
  return (
    <div className={cn('bg-white text-black rounded-md border border-neutral-300 shadow-[0_2px_8px_rgb(0_0_0/.15)] font-mono select-none', compact ? 'p-2.5 w-[220px]' : 'p-4 w-[300px]', printing && 'anim-print', className)} style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(0,0,0,.04) 24px)' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={cn('font-black tracking-[0.18em] italic leading-none', compact ? 'text-[13px]' : 'text-[17px]')}>TANAAD</div>
          <div className={cn('uppercase tracking-[0.12em] text-neutral-500', compact ? 'text-[8px]' : 'text-[9px]')}>{site.legalName}</div>
        </div>
        <QR value={label.code} size={compact ? 56 : 80} />
      </div>
      <div className={cn('mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5', compact ? 'text-[10px]' : 'text-[12px]')}>
        {rows.map(([k, v]) => (<div key={k} className="contents"><div className="text-neutral-500 tracking-wider">{k}</div><div className="font-bold truncate">{v}</div></div>))}
      </div>
      <div className={cn('mt-2 pt-1.5 border-t border-dashed border-neutral-400 flex justify-between items-center font-bold tracking-wider', compact ? 'text-[10px]' : 'text-[12px]')}><span>{label.code}</span><span className="text-neutral-500 font-normal">{label.id.slice(-4).toUpperCase()}</span></div>
    </div>
  );
}
