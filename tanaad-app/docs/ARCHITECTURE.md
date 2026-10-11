# Frontend architecture

## Principles
- **One product, three configurations.** `config/sites/*.ts` describes stages, sectors, machines' wall, downtime reasons, thresholds, label layouts and "to be confirmed" notes. Shared screens read the config; they never hard-code a site's vocabulary.
- **Every write is an event.** `data/store.ts` exposes domain actions (markAttendance, closeCashDay, recordGateWeight, …). Each appends a `DomainEvent` to the ledger (`events`), updates the local projections (the collections), and writes an `AuditEvent` when the change is an edit, reopen, override or variance. Offline, events stay `synced:false` in the outbox; reconnecting flushes them. In production the same outbox posts to `POST /events` and projections come from the API.
- **Arithmetic lives in `packages/domain`.** gateDecision, massBalance, settlementNet, cashClose, contractState, intakeNet. Fixtures in `contracts/fixtures` are shared with the Laravel test suite so client and server cannot drift.
- **Devices behind interfaces.** `devices/index.ts` defines scale, printer and messaging; the demo ships simulators, production swaps in Capacitor plugins.

## Data flow
Screen → store action → event appended → projection updated → screen re-renders (Zustand) → persisted to IndexedDB (Dexie). Selectors in `data/selectors.ts` derive headcount, machine walls, cash summaries, stock, receivables, mass balance.

## Adding a site
1. Add `config/sites/<code>.ts` and register it in `config/sites/index.ts`; add the code to `SiteCode` in `packages/domain`.
2. Seed machines, products, people in `data/seed/build.ts` (or load from the API).
3. Done: dashboard, Today, attendance, cash, machine wall, stock, dispatch, spares and sales all work from config.

## Adding a screen
1. Create `features/<module>/<Screen>.tsx` with a named export.
2. Register the path in `app/router.tsx` (lazy import) and a nav entry in `app/nav.ts` with roles/sites.
3. Use components from `components/ui`, selectors, and store actions. Floor screens follow the 56 px touch rule.

## Production swap-in
- `data/store.ts` actions become thin wrappers that enqueue events; `data/api/` adds the generated OpenAPI client and a projection sync (delta pull or PowerSync).
- `demo/` is excluded from production builds (`import.meta.env.PROD && !VITE_DEMO`).
- Auth: session comes from Sanctum tokens and device PIN sessions instead of the Switcher.
