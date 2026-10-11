import { create } from 'zustand';
import { registerSW } from 'virtual:pwa-register';

/** Chrome's deferred install prompt (not in lib.dom yet). */
interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

interface PwaState {
  canInstall: boolean;
  installed: boolean;
  offlineReady: boolean;
  updateReady: boolean;
  install: () => Promise<boolean>;
  applyUpdate: () => void;
}

let deferred: BeforeInstallPromptEvent | null = null;
let update: ((reload?: boolean) => Promise<void>) | null = null;

const standalone = () => typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: window-controls-overlay)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);

export const usePwa = create<PwaState>((set) => ({
  canInstall: false,
  installed: standalone(),
  offlineReady: false,
  updateReady: false,
  install: async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    set({ canInstall: false, installed: outcome === 'accepted' });
    return outcome === 'accepted';
  },
  applyUpdate: () => { void update?.(true); },
}));

export function initPwa(onOfflineReady: () => void, onUpdateReady: () => void) {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent; usePwa.setState({ canInstall: true }); });
  window.addEventListener('appinstalled', () => { deferred = null; usePwa.setState({ canInstall: false, installed: true }); });
  update = registerSW({
    immediate: true,
    onOfflineReady() { usePwa.setState({ offlineReady: true }); onOfflineReady(); },
    onNeedRefresh() { usePwa.setState({ updateReady: true }); onUpdateReady(); },
  });
  if ('serviceWorker' in navigator) void navigator.serviceWorker.ready.then(() => usePwa.setState({ offlineReady: true }));
}
