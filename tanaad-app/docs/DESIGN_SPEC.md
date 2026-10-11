# Tanaad design spec (v2): a rich professional workbench

Read this fully before touching a screen. It replaces the visual conventions in `AGENT_BRIEF.md` (the data and store parts of that brief still apply).

The first version of the app was judged "childish": oversized bubbly tiles, giant numerals, chips for everything, no keyboard model, no desktop feel. A too-plain rewrite (bare tables on white) was also rejected as "too simple". The target sits between them: **a dense, keyboard-first operations console that is visually rich** — think Linear, Stripe Dashboard, Attio, a trading or control-room UI. Dense, confident, layered, data-forward, with colour used on purpose.

**Reference screens (open them, copy their patterns):**
- `features/shell/SiteDashboard.tsx` — hero band, KPI cards with deltas and sparklines, machine map, charts, activity feed.
- `features/shell/Today.tsx` — hero greeting, checklist panel with status chips and progress, quick links.
- `features/shell/Portals.tsx`, `Login.tsx` — the dark branded surfaces.
- `features/shell/AppShell.tsx` — the frame (do not edit).

## 1. The frame you live inside
The app shell already gives every screen: a dark branded sidebar, a title bar with breadcrumbs and Ctrl+K, a status bar, toasts, the command palette and the shortcut help (`?`). The page scrolls inside `<main>`; the body never scrolls. Your screen renders only its content. Do not add your own page chrome, back links or site headers.

## 2. Density: one layout, two sizes
`html[data-density]` is `compact` (mouse + keyboard, default on desktop) or `touch` (floor tablets, phones). Everything is sized through CSS variables, so the same markup is 32 px controls on a desk and 48–56 px on a tablet.
- Sizes: `ctl` / `ctl-sm` / `ctl-lg` (control heights), `row-h`, `p-[var(--pad)]`, `gap-[var(--gap)]`.
- Type scale utilities: `t-xs`, `t-sm`, `t-base`, `t-lg`, `t-title`, `t-kpi`, `t-hero`, `t-label`. **Never write `text-[NNpx]` for body UI.** Only fixed sizes allowed: inside the dark hero band, and a single hero numeral when the number *is* the task (a scale reading, a count being typed) capped at `text-[40px]`.
- Variants: `touch:` and `compact:` for the rare difference (e.g. `touch:hidden`, `touch:grid-cols-1`). `useIsTouch()` only for behaviour (e.g. `autoFocus={!touch}`).
- **Never** hard-code `h-14`, `h-16`, `min-h-[140px]`, 56 px targets and the like. `NumberPad`, `PinPad`, `Button`, `ChipGroup`, `Input` already grow in touch density.
- Check every screen at 1440×900 compact, 1024×768 touch and 390×844 touch.

## 3. Visual language
- **Surfaces:** canvas `var(--bg)`; cards are `surface` (white, 1 px line, 10 px radius, soft shadow). Use `<Panel>` (header with icon + title + sub + actions, body, optional footer) for every grouped block. `Card` only for small unlabelled blocks. Interactive cards add `lift`.
- **Hero band:** class `hero` (ink gradient with an amber glow). Use it once at the top of monitor/dashboard-type screens and of the main workstation screens (machine wall, dispatch, cash page, cockpit) to carry identity, the one-line state of the screen, a `TimeTrack` or headline numbers, and the primary actions (`Button variant="accent"` for the primary, `variant="inverse"` for secondary). List and form screens use `<PageHeader>` instead. Do not put a hero on every screen.
- **Radii** are fixed by the theme (6–12 px). Never `rounded-3xl`/`rounded-[20px]`. `rounded-full` only for avatars, dots and the live pill.
- **Colour:** neutral surfaces; `--brand` (ink) for primary buttons; `--accent` (amber) for the active indicator, focus accents, and the single most important CTA on a hero. Status colours `--ok/--warn/--bad/--info` are **reserved for states** and always come with a label or icon. Identity colours: sites via `SITE_COLOR`/`SITE_ICON` (`config/siteIdentity`), expense categories via `categoryColor()` (`config/categories`), chart series via `var(--series-1..8)` in fixed order, product swatches via `product.colour`.
- **Icon chips:** an icon in a tinted rounded square (`size-7/8/9 rounded-md|lg`, background `color-mix(in srgb, <colour> 12%, transparent)`) is the house way to add colour to a row, KPI or empty state. Use lucide icons only, no emoji.
- **Depth and life:** `CountUp` on headline numbers, `anim-live` dot for live data, `lift` on clickable cards, `Sparkline` in KPI cards, `Delta` chips for change. No decorative animation.
- **Text:** sentence case, short, concrete. Labels above values use `t-sm font-medium text-[var(--text-2)]` or `t-label` (small caps) for section labels. Numbers use class `num` (tabular); codes and IDs use class `code` (monospace). Right-align numeric columns.

## 4. Page archetypes (pick one per screen)
**A. Monitor** (dashboards, walls, cockpit, reports): hero → `<KpiStrip>` of `<Stat>` cards (icon, accent, `CountUp`, `Delta`, `spark`) → main `Panel` (map/grid/table with a `Tabs` view switch) beside a 340–360 px column of side panels → rows of chart panels.
**B. Ledger / list** (registry, orders, clients, invoices, ledgers, audit, movements, deliveries): `PageHeader` (title, meta badges, primary `Button hotkey="n"`) → optional `KpiStrip` (3–5 cards) → `Toolbar` (`SearchInput`, filter `Tabs`/`ChipGroup size="sm"`, count, export/print on the right) → `DataGrid` (sortable columns, avatars, badges, inline bars; `onRowClick` opens a `Sheet` inspector; pass `selectedKey`) with a totals footer.
**C. Workstation** (data entry: sign-up, expense, mixer, roll sticker, intake, finishing, count, spares issue, receive…): `PageHeader` or hero → `<Split aside={…}>`: left = one `Panel` holding the whole form, fields visible together in numbered sections (use `FormRow` label-left rows on desktop; never a multi-page wizard unless a camera/scan step truly gates the next), sticky `Panel` footer with the primary `Button hotkey="mod+enter"`; right aside = live preview (sticker, voucher, totals, gauge) and "today so far" log (`DataGrid dense`). After save: toast, reset, focus back to the first field.

Rich does not mean decorated: every card must carry information. Fill space with the *next most useful data* (today's log, a 7-day trend, the related records), never with bigger type or bigger padding.

## 5. Components (all from `@/components/ui` unless noted)
`Button` (`hotkey`, variants primary/secondary/ghost/accent/inverse/danger/ok, sizes sm/md/lg), `IconButton`, `Panel`, `Card`, `PageHeader`, `Toolbar`, `Split`, `SectionTitle`, `Badge` (`dot`), `Status`, `Stat`, `KpiStrip`, `ActionTile`, `Avatar`, `ChipGroup` (2–8 short options; arrows and digits work), `Combobox` (anything longer: machines, products, clients, parts), `Tabs` (`variant="underline"` for page-level), `Field`, `FormRow`, `Input`, `Textarea`, `Select`, `SearchInput`, `NumberPad` (typed field on desktop, keypad on touch — never build your own keypad), `PinPad`, `Sheet` (right inspector / bottom sheet), `Dialog`, `Menu`, `Empty`, `Note`, `Row`, `DataGrid`, `Bar`, `Meter`, `StackedBar`, `MiniBars`, `Ring`, `Gauge`, `Kbd`.
`@/components/charts`: `Sparkline`, `LineChart`, `ColumnChart`, `Donut`, `Delta`, `pctChange`, `CountUp`, `TimeTrack`, `Legend`, `compactNum`.
`@/components/PersonPicker` — the only way to pick a worker (replaces every hand-rolled operator grid). `Sticker`, `ScaleWidget` (pass `title`), `WhatsAppPreview` as before.
Selectors worth knowing: `dailySeries(s, site, days)` for every trend/sparkline, `lastWorkingDays`, `portalsFor`, plus the existing ones. `useQueryParam('q')` (from `@/app/hooks`) — list screens must prefill their search from it (the command palette deep-links with `?q=`).
If a shared helper in your folder (`kit.tsx`, `shared.tsx`) duplicates one of these, delete the duplicate and use the shared component.

## 6. Keyboard-first (required on every screen)
- One primary action with a hotkey: `n` new, `mod+enter` save/submit, `p` print, `e` export, `/` search (free with `SearchInput`). Use `<Button hotkey="…">`; it registers the shortcut and shows the hint. Extra page shortcuts via `useHotkey(keys, fn, { label })`. Do not use `g`-prefixed keys or `alt+digit` (taken by navigation), nor browser keys (Ctrl+S/P/F/W/T/N/R).
- Lists: `DataGrid` with `onRowClick` gives ↑/↓/J/K/Enter for free. Card grids that act like lists (machine tiles) need roving `tabIndex` + arrow keys + Enter.
- Forms: first field focused on desktop (`autoFocus={!touch}`), logical Tab order, Enter confirms numbers, `mod+enter` submits from anywhere, Esc closes sheets (built in). Choice groups are `ChipGroup`/`Combobox` (keyboard built in), not rows of ad-hoc buttons.
- Every shortcut you add appears automatically in the `?` overlay; give it a clear `label`.

## 7. Data visualisation rules
Choose the form by the job: one number → `Stat`; change over time → `LineChart`/`ColumnChart`/`Sparkline`; part-to-whole (≤6 parts) → `Donut` or `StackedBar` with a value list beside it; x of y → `Meter`. One hue for a single series; a legend whenever there are ≥2 series (the charts add it); never colour text with the series colour; never use status colours for series; no dual axes; mark partial periods (`partial`/`partialLast`) for today. Every chart panel has a title that says what is plotted and a sub that says the unit or period.

## 8. Kill list (search your files for these and remove them)
`text-[NNpx]` on body UI · `h-14`/`h-16`/fixed tall tiles · `rounded-2xl|3xl` · `shadow-[…]` you invented · gradient or solid-colour big tiles · full-width coloured banners that only say one word · Card + SectionTitle pairs (→ Panel) · custom keypads, custom operator grids, custom modals · ALL-CAPS sentences · emoji · "Tap" in copy (use "Select"/"Press") · empty white space where a log or trend should be · bare unlabelled numbers.

## 9. Ground rules
Keep every behaviour that exists today (store actions, validations, demo flows, "to be confirmed" notes). Stay inside your folder(s); do not edit `components/`, `data/`, `app/`, `config/`, `features/shell/`. If you need something shared, build it locally and say so in your report. TypeScript must be clean: `NODE_DISABLE_COMPILE_CACHE=1 pnpm --filter @tanaad/web typecheck` from `tanaad-app/`.

## 10. Look at your work
You must view your screens before reporting. From `tanaad-app/apps/web`:
```
PWA_DEV=0 NODE_DISABLE_COMPILE_CACHE=1 nohup pnpm exec vite --port <YOUR_PORT> --strictPort > /tmp/vite-<YOUR_PORT>.log 2>&1 &
```
Write a spec JSON (array of `{ "name", "url", "w", "h", "touch"?, "dark"?, "keys"?, "clicks"?, "full"? }`; sign in through the URL `?as=<role>&site=<mats|bags|recycling>&go=/s/<site>/<path>` or `?as=ceo&go=/g/<path>`), then from `tanaad-app/`:
```
BASE=http://localhost:<YOUR_PORT>/ node tools/shot.mjs <outDir> <spec.json>
```
and Read the PNGs. `keys` accepts e.g. `"n"`, `"Control+k"`, `"type:hello"`, `"Enter"`, `"ArrowDown"`; `clicks` takes CSS selectors. Capture each screen at 1440×900 (compact), 1024×768 (`"touch": true`) and 390×844 (`"touch": true`), plus one dark shot and at least one keyboard-driven state per screen (a sheet opened with its hotkey). Fix what looks wrong (overlap, truncation, wrapping, dead space, weak hierarchy) and re-shoot. Kill your dev server when done (`pkill -f "vite --port <YOUR_PORT>"`). The script prints page errors: there must be none.

Report: files changed, the archetype chosen per screen, hotkeys added, anything you could not do.

## 11. Master data: nothing the client can define is written into a screen
The client must be able to create and change every size, unit, colour, brand, material, category, reason, rate, term, tolerance, product and machine themselves in **Settings** (`features/settings/`). Screens only read.
- Option lists: `useRefList(list)` from `@/app/hooks` returns the active `RefItem[]` for the current site (`label`, `value`, `unit`, `color`, `parentId`, `example`). Lists: `unit, sector, expense_category, expense_subcategory, quick_expense, downtime_reason, breakdown_cause, colour, bag_size, bag_colour, brand, material, pellet_grade, deduction_option, price_option, contract_term, daily_rate, denomination, vehicle, waste_source, pellet_source`. Also `payment_method`, `market`, `credit_term` (group-wide). Company letterhead data: `useStore(s => s.companyProfiles[site.id])` (`address, phone, email, tin, bankDetails, mobileMoney, vatRatePct, efrisConnected`; blank means print "to be provided"). New clients persist with `saveClient`. Pass `{ parentId }` for children (sub-categories of a category).
- `useSite()` already overlays sectors, downtime reasons, sub-categories and thresholds from master data. Rules and limits: `useSiteSettings()` (`gateTolerancePct, massGapPct, cashVariance, benchmarkPct, expenseApprovalLimit, archiveAfterAbsentDays, contractWarningDays`).
- Products (`store.products`: `unit`, `bundlePieces`, `stdBundleWeightKg`, `thicknessMicron`, `prices`, `active`), machines, benchmarks and zones are store data edited in Settings. Never build a product id from strings or assume a fixed set of products; pick from `products.filter(p => p.siteId === site && p.kind === … && p.active !== false)`.
- **Forbidden in screens:** literal arrays of options (colours, sizes, causes, rates, percentages, prices, denominations, vehicles, materials, terms), literal weights such as 40/25/205/5 kg (read the `material` item's `value`), literal limits such as 500,000. If a list you need does not exist, say so in your report rather than hard-coding it.
- When a list is empty, show an `Empty` state that says where to add it ("Add bag sizes in Settings → Master data") with a button to `go.site('settings')`.
- Items with `example: true` are unconfirmed placeholders: show them normally; Settings flags them.
- **No invented company facts.** Do not write brand names, supplier names, customer names, recipes or process claims into a screen. Demo records come from the seed only.
