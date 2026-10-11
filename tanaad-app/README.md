# Tanaad Management System — application repository

One product for Tanaad Packages Limited: three sites (Mats, Bags, HDPE Recycling) plus a head-office layer for the two CEOs. This repository holds the React frontend (demo today, product tomorrow), the shared domain package, and the contracts folder. The Laravel API (`apps/api`) is added in the foundation phase per `docs/adr/ADR-001-technology-stack.md`.

## Run it

```bash
pnpm install          # Node 22+ (Node 24 LTS recommended)
pnpm demo             # production build + preview on http://localhost:4173  ← use this to present
pnpm dev              # development server with hot reload on http://localhost:5173
pnpm test             # domain arithmetic against contracts/fixtures
pnpm typecheck
```

If `pnpm` crashes on start with a V8 fatal error under corepack, prefix commands with `NODE_DISABLE_COMPILE_CACHE=1`.

`pnpm demo` is the real thing: an installable PWA with a service worker, so it opens and reloads with the network off. `pnpm dev` also serves the manifest and a service worker (the browser offers "Install"), but offline reloads only work in the built app, because the dev server ships unbundled modules.

The demo runs entirely in the browser on a deterministic seed (August 2026 site-visit figures). State persists in IndexedDB; **Reset demo data** in the command palette or presenter panel restores the seed.

## Install as an app

Open `http://localhost:4173` in Chrome or Edge and use **Install app** (status bar, account menu, or the browser's address-bar icon). Installed on a desktop it runs in its own window and draws its title bar (breadcrumbs, search) into the window frame; on Android it installs to the home screen with app shortcuts (Cockpit, Attendance, Dispatch, Cash). iOS: Share → Add to Home Screen.

## Flow

**Sign in** (password, or PIN on a shared floor tablet; demo accounts are listed, any password, PIN 1234) → **Portals** (one card per workspace the person may open; others are shown locked) → **workspace** (Group HQ or a site).

## Keyboard

| Keys | Does |
|---|---|
| `Ctrl/⌘ K` | Command palette: screens, actions, workers, orders, clients, products, labels, delivery notes |
| `G` then a letter | Jump to a screen (`G D` dashboard, `G A` attendance, `G C` cash, `G W` machine wall, `G X` dispatch …) |
| `Alt 1/2/3`, `Alt 0`, `Alt P` | Mats / Bags / Recycling, Group HQ, all portals |
| `?` | Every shortcut available on the current screen |
| `/` | Search the current list |
| `N`, `Ctrl/⌘ Enter` | New record, save/submit (per screen) |
| `↑ ↓ J K Enter` | Move through and open table rows |
| `Ctrl/⌘ B` | Collapse the sidebar |
| `Ctrl/⌘ .` | Presenter panel (reset, offline, alert, storyline jumps) |

Demo PINs: sign-in 1234, Site Manager override 2468, Mechanic 1357.

## Two densities, one layout

Desktop with mouse and keyboard gets the **compact** workbench; coarse pointers and narrow windows get the **touch** layout (48–56 px targets, on-screen keypads). Same screens, same code: sizes come from CSS variables. Switch manually from the status bar.

## Layout

```
apps/web/src
  app/            router, navigation, hotkeys, preferences (theme, density), PWA install
  config/sites/   mats.ts bags.ts recycling.ts — site configuration drives screens
  config/         roles, expense categories, site identity (colour + icon)
  data/           store (auth, event ledger, outbox, actions), selectors, seed, persistence, format
  design-system/  tokens.css (Tailwind v4 theme, light/dark, compact/touch)
  components/     ui library, charts, PersonPicker, Sticker, ScaleWidget, WhatsAppPreview
  devices/        scale, printer, messaging interfaces + simulators
  features/       shell (frame, login, portals, home, dashboard), group, people, cash, production, mats, bags, recycling, stock, sales, reports
  demo/           presenter panel
packages/domain   types + business arithmetic (shared with the server via fixtures)
contracts/        fixtures/arithmetic.json (openapi.yaml arrives with the API)
docs/             DESIGN_SPEC.md (read before touching UI), ARCHITECTURE.md, KNOWN_GAPS.md, ADRs, screenshots
tools/shot.mjs    headless screenshots, including keyboard-driven states
```
