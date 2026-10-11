/**
 * Device services. The demo ships simulators; production replaces them with Capacitor BLE / native print plugins.
 * Screens must only ever import from here.
 */
export interface ScaleReading { kg: number; stable: boolean; source: 'bluetooth' | 'serial' | 'manual' }
export interface ScaleService { connected: () => boolean; read: (targetKg: number, onTick: (r: ScaleReading) => void) => () => void }
export interface PrinterService { print: (payload: { code: string; lines: string[] }) => Promise<void>; status: () => 'ready' | 'offline' }
export interface MessagingService { sendWhatsApp: (to: string, body: string, attachment?: string) => Promise<{ id: string }> }

/** Simulated scale: settles on the target with realistic noise over ~1.6 s. */
export const scale: ScaleService = {
  connected: () => true,
  read: (target, onTick) => {
    let t = 0; const start = Date.now();
    const id = setInterval(() => {
      t = (Date.now() - start) / 1600;
      if (t >= 1) { onTick({ kg: Math.round(target), stable: true, source: 'bluetooth' }); clearInterval(id); return; }
      const noise = (1 - t) * target * 0.05 * (Math.random() * 2 - 1);
      onTick({ kg: Math.max(0, Math.round(target * Math.min(1, t * 1.15) + noise)), stable: false, source: 'bluetooth' });
    }, 80);
    return () => clearInterval(id);
  },
};
export const printer: PrinterService = { print: async () => { await new Promise((r) => setTimeout(r, 900)); }, status: () => 'ready' };
export const messaging: MessagingService = { sendWhatsApp: async () => { await new Promise((r) => setTimeout(r, 600)); return { id: `wamid.${Math.random().toString(36).slice(2, 10)}` }; } };
