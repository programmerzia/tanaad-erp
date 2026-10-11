import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import '@/design-system/tokens.css';
import '@/app/prefs';
import { router } from '@/app/router';
import { initPwa } from '@/app/pwa';
import { useStore } from '@/data/store';

initPwa(
  () => useStore.getState().toast({ kind: 'ok', title: 'Ready to work offline', detail: 'The app is cached on this device.' }),
  () => useStore.getState().toast({ kind: 'info', title: 'A new version is ready', detail: 'Reload from the status bar when convenient.' }),
);

// Wait for the local store (IndexedDB) before the first route resolves. Otherwise a reload or an app-shortcut launch
// would briefly see "no session" and bounce to sign-in, and late hydration could overwrite a fresh sign-in.
const root = ReactDOM.createRoot(document.getElementById('root')!);
let started = false;
const start = () => { if (started) return; started = true; root.render(<React.StrictMode><RouterProvider router={router} /></React.StrictMode>); };
if (useStore.persist.hasHydrated()) start();
else { useStore.persist.onFinishHydration(start); setTimeout(start, 2500); }
