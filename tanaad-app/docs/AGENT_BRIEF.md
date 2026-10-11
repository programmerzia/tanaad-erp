# Screen-building brief (read fully before writing code)

You are building screens for the Tanaad Management System demo, which is also the first version of the production React frontend. Work ONLY inside the feature folder(s) you were assigned. Do not edit files outside them (no changes to store, components, router, nav, seed). If you genuinely need a store action or selector that does not exist, implement the logic locally inside your screen using existing actions, and note it in your final report.

## Read these first
- `apps/web/src/data/store.ts` — the Zustand store: all data collections (seeded) and all write actions. Use `useStore()` (whole state) or selectors `useStore(s => s.x)`. Writes: call actions from the store, e.g. `const mark = useStore(s => s.markAttendance)`.
- `apps/web/src/data/selectors.ts` — derived data helpers (headcount, machineWall, cashSummary, stockByProduct, massBalanceDay, clientBalance, …). Prefer these over recomputing.
- `apps/web/src/data/format.ts` — formatters (fmtUGX, fmtUSD, fmtMoney, fmtKg, fmtNum, fmtDay, fmtTime…). Never hand-format money or dates.
- `apps/web/src/components/ui/index.tsx` — the component library: Button, Card, PageHeader, SectionTitle, Badge, Stat, ActionTile, Avatar, ChipGroup, Field, Input, Select, NumberPad, Sheet, Empty, Row, DataGrid, Bar, Ring, Gauge, Tabs, PinPad, Note, hooks (useMedia, useTimer, useNow). USE THESE. Do not invent parallel components for things that exist.
- `apps/web/src/components/Sticker.tsx` (Sticker, QR), `ScaleWidget.tsx`, `WhatsAppPreview.tsx`.
- `apps/web/src/devices/index.ts` — scale/printer/messaging simulators. Use `printer.print()` for print animations; never import seed data directly.
- `apps/web/src/app/hooks.ts` — `useSite()` (current Site config), `useSession()`, `useGo()` for navigation (`go.site('stock/dispatch')`, `go.group('cockpit')`).
- `apps/web/src/config/sites/*.ts` — site configuration (stages, sectors, downtime reasons, thresholds, machineWallTitle, toBeConfirmed note). Screens must be driven by this config, never hard-code "loom" or "Rihlaat" in shared screens.
- `packages/domain/src/types.ts` and `arithmetic.ts` — domain types and business arithmetic (gateDecision, massBalance, settlementNet, cashClose, contractState, intakeNet, bundlesFromPieces, yieldPct). Use the arithmetic functions; never re-implement.
- `apps/web/src/features/shell/SiteDashboard.tsx` and `Today.tsx` — reference screens showing the expected style, density and how to use store + selectors.
- Root docs for context: `../TANAAD_DEMO_BUILD_BRIEF.md` (scope per screen, §2) and `../TANAAD_SOLUTION_PROPOSAL.md` (feature behaviour).

## Conventions
- Each screen is a named export matching its file (e.g. `export function Attendance()` in `features/people/Attendance.tsx`). The router already imports it lazily; keep the export name exactly.
- Tailwind v4 utilities + CSS variables from `design-system/tokens.css`: colours via `bg-[var(--surface)]`, `text-[var(--text-2)]`, `var(--ok)`, `var(--warn)`, `var(--bad)`, `var(--accent)`, `var(--brand)`. Semantic green/amber/red ONLY for arithmetic states (balanced/explainable/missing, pass/hold, present/absent). Never for decoration.
- Numbers use class `num` (monospace, tabular). Large numerals on tiles.
- Floor screens (supervisor/storekeeper/gate/mechanic): 56px min touch targets (Button size lg/xl, h-14), one task per screen, no nested modals, input hierarchy scan > tap tile > chip > NumberPad > typing. Back-office screens can be denser.
- Must work at 375px phone width, 1024px tablet and 1440px desktop. Both themes (tokens handle it; avoid hard-coded colours except product colour swatches).
- Every write gives feedback: call `useStore.getState().toast({ kind: 'ok', title: '…' })`.
- Every list/empty case designed (`<Empty/>`). No lorem ipsum, no TODO text, no console errors.
- Anything the briefing does not confirm (bags stages, recycling deduction rule, bundle standard weights) shows a visible `<Note tone="warn">` "to be confirmed" (site.toBeConfirmed exists for bags and recycling; products have weightStatus 'to_be_measured').
- "today" is `useStore(s => s.today)` (2026-10-10), NOT `new Date()`. Current shift via `currentShiftKind()` from selectors. Shift ids: `shiftId(site, day, kind)`.
- PINs in the demo: Site Manager override 2468, Mechanic 1357.
- TypeScript strict. Run `pnpm --filter @tanaad/web typecheck` from `tanaad-app/` (prefix with `NODE_DISABLE_COMPILE_CACHE=1`) and fix every error in your files before finishing. Do not run `pnpm build` or `pnpm dev` (another process may own the port); typecheck is enough.
- Keep each screen in one file unless it exceeds ~400 lines; then split into sibling files inside your folder.

## Quality bar
Market-leading, zero-training UX. Think: what would make a supervisor who has never used software complete this task in under a minute? Big, obvious, forgiving. Design states: loading not needed (data is local), empty, error, locked, offline-agnostic. Celebrate completion (tick, toast, printed sticker). Keep copy short and concrete, in plain English, no jargon.

Report at the end: files created, what works interactively, anything simulated, any store/selector gap you worked around.
