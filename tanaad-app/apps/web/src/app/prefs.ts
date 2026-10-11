import { create } from 'zustand';

export type Theme = 'light' | 'dark';
export type Density = 'compact' | 'touch';

const read = <T extends string>(key: string, allowed: readonly T[]): T | null => {
  try { const v = localStorage.getItem(key) as T | null; return v && allowed.includes(v) ? v : null; } catch { return null; }
};
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } };

/** Touch density when the primary pointer is coarse or the window is narrow; compact workbench otherwise. */
export const autoDensity = (): Density => (typeof window !== 'undefined' && (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900) ? 'touch' : 'compact');

interface Prefs {
  theme: Theme;
  density: Density;
  densityPinned: boolean;
  sidebarCollapsed: boolean;
  paletteOpen: boolean;
  helpOpen: boolean;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setDensity: (d: Density, pin?: boolean) => void;
  toggleDensity: () => void;
  toggleSidebar: () => void;
  setPalette: (open: boolean) => void;
  setHelp: (open: boolean) => void;
}

const apply = (theme: Theme, density: Density) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.density = density;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a1013' : '#eceef1');
};

const initialTheme: Theme = read('tanaad-theme', ['light', 'dark'] as const) ?? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const pinned = read('tanaad-density', ['compact', 'touch'] as const);
const initialDensity: Density = pinned ?? autoDensity();
apply(initialTheme, initialDensity);

export const usePrefs = create<Prefs>((set, get) => ({
  theme: initialTheme,
  density: initialDensity,
  densityPinned: !!pinned,
  sidebarCollapsed: read('tanaad-sidebar', ['1', '0'] as const) === '1',
  paletteOpen: false,
  helpOpen: false,
  setTheme: (theme) => { write('tanaad-theme', theme); apply(theme, get().density); set({ theme }); },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  setDensity: (density, pin = true) => { if (pin) write('tanaad-density', density); apply(get().theme, density); set({ density, densityPinned: pin || get().densityPinned }); },
  toggleDensity: () => get().setDensity(get().density === 'compact' ? 'touch' : 'compact'),
  toggleSidebar: () => { const v = !get().sidebarCollapsed; write('tanaad-sidebar', v ? '1' : '0'); set({ sidebarCollapsed: v }); },
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setHelp: (helpOpen) => set({ helpOpen }),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => { const p = usePrefs.getState(); if (!p.densityPinned) { const d = autoDensity(); if (d !== p.density) p.setDensity(d, false); } });
}

export const useDensity = () => usePrefs((s) => s.density);
export const useIsTouch = () => usePrefs((s) => s.density === 'touch');
