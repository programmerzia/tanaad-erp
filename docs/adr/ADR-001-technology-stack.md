# ADR-001: Technology stack for the Tanaad Management System

**Status:** Proposed, revised 2026-10-10 after team assessment (Laravel-strong team) and version research
**Date:** 2026-10-10
**Context documents:** `TANAAD_SOLUTION_PROPOSAL.md`, `TANAAD_DEMO_BUILD_BRIEF.md`

## Context

The system is a multi-site operational application (three factories plus a group layer) with these hard constraints from the proposal:

1. Offline-first shop-floor screens that keep working through power and network loss in Kampala, with later sync.
2. Append-only, tamper-evident records (events), with projections for stock, cash, headcount and costing.
3. Access to physical devices: scales (Bluetooth / USB / serial), thermal label printers, cameras, signatures.
4. Live views (machine walls, CEO cockpit) and outbound messaging (WhatsApp, SMS), PDF documents.
5. One product with per-site configuration; the demo prototype becomes the production frontend.
6. Multi-currency, multi-language, role and site scoped permissions.

## Decision

| Concern | Decision |
|---|---|
| Languages | TypeScript on the client, PHP 8.4 (upgrade to 8.5 within Laravel 13's supported range) on the server, joined by a committed OpenAPI specification and shared JSON test fixtures |
| Frontend | React 19.2 + Vite (current major), TanStack Router + TanStack Query (TanStack DB for reactive local collections), Zustand for UI state, CSS with design tokens (CSS variables) and a utility layer; built as an installable PWA with a service worker; Node 24 LTS toolchain (move to Node 26 LTS when it becomes active in late October 2026) |
| Floor devices | Capacitor (current major) wrapper of the same web app for Android tablets: `@capacitor-community/bluetooth-le` for BLE scales, a small native plugin wrapping ESCPOS-ThermalPrinter-Android (Bluetooth/USB/TCP) for labels, camera, background sync, kiosk mode. Scales are purchased only with a documented BLE or RS-232 protocol. Phones and desktops use the PWA directly |
| Local data | Write path: event outbox in IndexedDB (Dexie), all writes are events with client-generated UUIDv7 IDs. Read path: projection snapshots pulled by delta (default); PowerSync (self-hosted, Postgres → client SQLite) evaluated in the foundation phase as a drop-in for the read path if delta sync proves costly to maintain |
| Backend | Laravel 13 (released March 2026; bug fixes to Q3 2027, security to Q1 2028), **API-only** (no Blade, no Inertia), modular monolith organised by module (people, cash, production, stock, orders, costing, group, devices, messaging); `spatie/laravel-event-sourcing` for aggregates, the event store and projectors; Pest for tests |
| API | REST with a committed OpenAPI 3.1 contract: Scramble generates the spec from the Laravel code, CI commits it to `contracts/openapi.yaml`, runs an OpenAPI diff to block breaking changes, and generates the TypeScript client from it; websockets via Laravel Reverb for live updates; event ingestion endpoint idempotent by event ID |
| Database | PostgreSQL 18: append-only `events` table partitioned by site and month, native `uuidv7()`; projection tables rebuilt from events; JSONB for site configuration; row-level security keyed by site |
| Background work | Laravel Queues on Redis with Horizon: projection rebuilds, costing, morning briefs, PDFs, messaging, retries and failed-job handling |
| Files | S3-compatible object storage (photos, PDFs); signed, expiring URLs |
| Documents | PDF rendered by headless Chromium (Browsershot) from the same React components served as print routes |
| Messaging | WhatsApp Business Cloud API; SMS gateway fallback |
| Labels | ZPL/TSPL generated client-side; printed over Bluetooth from the tablet, or via a small LAN print agent |
| Auth | Laravel Sanctum tokens; passkeys/OTP for CEOs and admins; device-bound tokens with per-user PIN for shared floor tablets; RBAC scoped by site (e.g. spatie/laravel-permission with a site dimension) |
| Repository | One monorepo: `apps/api` (Laravel), `apps/web` (React), `apps/mobile` (Capacitor shell), `packages/domain` (TS types generated from OpenAPI, event schemas, client-side arithmetic), `packages/ui` (design system), `packages/site-config`, `contracts/` (OpenAPI spec, JSON schemas, shared arithmetic fixtures) |
| Testing | Pest (server) and Vitest (client) both run the shared arithmetic fixtures in `contracts/fixtures`; Playwright for the storyline end to end; contract tests that the API matches the OpenAPI spec |
| Hosting | Docker Compose for dev; PHP-FPM behind nginx (Octane optional later) in containers. Region chosen with the client under Uganda's Data Protection and Privacy Act (cross-border transfer restrictions, PDPO registration): in-country hosting where a suitable provider exists, otherwise a nearby region (af-south-1) with contractual safeguards; daily encrypted backups with restore drills; optional on-site edge server per factory later |
| Observability | Structured logs, error tracking, uptime checks, sync-lag metric per device |

## Alternatives considered

- **Node.js + NestJS (TypeScript end to end):** the original draft. One language and a single domain model shared by client and server. Rejected because the team is Laravel-strong; team fluency outweighs shared types for a system of this size. Laravel also has the more mature queue tooling (Horizon), which this system uses heavily.
- **Symfony:** more ceremony than Laravel with no advantage here. Rejected.
- **Laravel with Inertia or Blade for the UI:** rejected. The floor client must be a standalone offline PWA; the server stays API-only.
- **Next.js for the frontend:** server rendering and file routing bring nothing to an offline, role-based tool and complicate the service worker. Rejected for the app; fine for a future public website.
- **Generic sync engines for the write path (PowerSync, ElectricSQL, Replicache):** the event-outbox model fits the append-only ledger and keeps conflicts explicit, so none replaces it. PowerSync remains a candidate for the **read path** only (syncing projection tables to the client); decided by a spike in the foundation phase.
- **MongoDB / Firebase:** weaker fit for ledger semantics, multi-site scoping and reporting. Rejected.

## Version notes (verified October 2026)

- Laravel 13 released 17 March 2026; requires PHP 8.3+; Laravel 12 bug fixes end August 2026, so new work starts on 13.
- PostgreSQL 18 released September 2025 with native `uuidv7()`, asynchronous I/O and OAuth 2.0 authentication.
- React 19.2 is the current line; no React 20. Vite's current major is used; Node 24 is Active LTS until 20 October 2026, Node 26 becomes LTS on 28 October 2026.
- WhatsApp Business Platform charges per delivered template message by category and country; utility templates are the right category for briefs, alerts and documents; Meta has announced a move to per-message pricing for service messages from 1 October 2026, so the messaging budget is reviewed at go-live.
- MTN MoMo Open API offers Collections and Disbursements with a sandbox; Airtel Money has a separate developer portal; production credentials are country-specific. Phase 1 records references only; disbursement integration is a later phase.

## Consequences

- Two implementations of the domain exist (TypeScript client, PHP server). The OpenAPI contract in `contracts/` is the single source of truth; the TypeScript client and types are generated in CI and never hand-edited.
- Business arithmetic (expected cargo weight and tolerance, mass balance, settlement, cash close, contract expiry) is implemented on both sides and verified against the same fixtures. A fixture change without both suites passing fails CI.
- The first engineering slice is the event outbox on the client, the idempotent ingestion endpoint, one projection and one Horizon job, before any feature screen.
- Capacitor adds an Android build pipeline; worth it for scale and printer reliability.
- The frontend brief (`TANAAD_DEMO_BUILD_BRIEF.md`) is unchanged: the demo is built as the real React client against a mock adapter, then pointed at the Laravel API.
