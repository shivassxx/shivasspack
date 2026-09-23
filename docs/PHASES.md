# SHIVASS PACK — Development Phases (V1)

Rule: **every phase ends with `typecheck` + `lint` + `build` green and a working
feature.** No placeholder buttons, no fake screens. If a UI exists, the backend behind it
exists.

| #   | Phase                           | Deliverable (definition of done)                                                                                                                 |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0   | **Foundation**                  | repo, Next.js + TS strict + Tailwind + shadcn, ESLint/Prettier, docker compose (app/pg/redis), `.env.example`, README skeleton, CI-ready scripts |
| 1   | **Database**                    | full Drizzle schema (all V1 tables), migration runs clean, seed with demo data marked `demo`                                                     |
| 2   | **Auth**                        | register/login/logout, scrypt hashing, DB sessions, rate limit, `Actor` loader, `proxy.ts` guard                                                 |
| 3   | **Design system**               | tokens, primitives, domain components, dark theme, responsive shell, skeletons, toasts, ⌘K palette                                               |
| 4   | **Public layout**               | navbar, footer, search modal, category routes, error/404/403 pages                                                                               |
| 5   | **Homepage**                    | all sections driven by `HomepageSection` + real queries; empty states; Discord widget                                                            |
| 6   | **Pack system**                 | listing w/ filters+sort+pagination, category pages, admin CRUD, tags/categories admin                                                            |
| 7   | **Content detail**              | detail page, versions, gallery, SEO/JSON-LD, performance block, install guide, related packs, view tracking                                      |
| 8   | **Download system**             | mirrors, signed/external resolution, counters, rate limit, analytics events                                                                      |
| 9   | **Forum**                       | categories, topics, replies, likes, edit/lock/pin, moderation actions, guest read-only                                                           |
| 10  | **User profiles**               | public profile, settings pages, bookmarks, downloads history                                                                                     |
| 11  | **Ratings / likes / bookmarks** | APIs + optimistic UI, denormalized counters                                                                                                      |
| 12  | **News**                        | listing/detail, admin CMS, SEO                                                                                                                   |
| 13  | **Admin panel**                 | dashboard metrics, users/roles, submissions queue, homepage builder, site settings, feature flags, audit log                                     |
| 14  | **AI news**                     | source CRUD, job runner, provider abstraction (OpenAI/Anthropic/Gemini), draft→review→publish, config UI                                         |
| 15  | **Installer API**               | manifest schema, signing, `/api/installer/manifest`, admin manifest editor with dry-run lint, protocol landing page                              |
| 16  | **Analytics + notifications**   | event ingestion, dashboard aggregates, in-app notifications                                                                                      |
| 17  | **Testing**                     | vitest for services (auth, rbac, rating, download, installer manifest, forum), API integration tests                                             |
| 18  | **Optimization & hardening**    | Lighthouse pass, bundle audit, caching, indexes, headers/CSP, final README                                                                       |

## Phase discipline

- Work in order; do not start phase N+1 with phase N red.
- At phase end run: `npm run typecheck && npm run lint && npm run build && npm test`
  and fix everything before moving on.
- Commit per logical unit (`feat(packs): …`, `fix(forum): …`).
- Docs (`docs/*`) updated when a decision changes — docs are part of Done.

## Environment note (this machine)

- Docker unavailable → compose files still provided for portable dev/prod;
  local dev uses native PostgreSQL 18 (portable) + optional Redis later.
- Node 24 LTS via `C:\tools\nodejs`.

## Approved recovery plan (current work)

The table above is the original V1 feature breakdown, not a completion checklist.
The approved audit reorganizes the remaining work into the following phases:

1. **Working foundation**: Node 24/npm 11, native dependencies, consistent env,
   standalone Docker configuration, README, CI and configuration contract tests.
2. **Database**: Drizzle schema, SQL migrations, demo seed, restricted DB role, health.
3. **Auth/RBAC**: sessions, credentials, password reset, rate limits, permissions.
4. **Shared UI/public navigation**: accessibility, states, static pages, i18n.
5. **Packs/basic admin**: listing/detail/search, uploads, categories/tags, CRUD.
6. **Dynamic homepage/settings**: section builder, real queries, feature flags.
7. **Downloads/interactions**: mirrors, counters, ratings/likes/bookmarks/comments.
8. **Profiles/submissions**: settings, history, moderation/review flow.
9. **Forum/moderation**: topics/replies, reports, bans, audit.
10. **News/AI**: CMS, providers, jobs, publication policy.
11. **Installer**: manifests, signatures, versions, API, admin and protocol fallback.
12. **Admin completion/analytics/notifications**.
13. **V1 acceptance/performance/deployment**.

### Phase 1 decisions

Status (2026-09-22): local foundation checks passed. `npm run check` passed
type generation/TypeScript, ESLint, 11 environment-contract tests and production
build. The final ESM Vitest config passed the same 11 tests, and final tooling
passed lint. Local Chrome verified desktop/mobile rendering, search open/Escape,
mobile menu open/close and no runtime exceptions. The standalone `npm start`
entry point returned HTTP 200 for the homepage and CSS. Source UI was preserved.
Docker execution and remote CI execution remain unverified in this environment.

- Preserve the existing Next.js structure and UI. No new product routes in this phase.
- ORM: Drizzle + postgres.js; schema and migrations start in Phase 2.
- Category URLs: `/packs/category/{slug}` (matches existing UI).
- Header quick search: `/packs?q=...`; `/search` remains planned unified search.
- Auth menu placeholders `/profile` and `/ratings` must be resolved when real auth
  is connected; public profiles use `/u/[username]`.
- Submission permission: `pack.submit`. Forum likes use the shared `Like` table.
- Installer version syntax: `shivasspack://install/{packageId}@{version}`;
  the operation whitelist is shared between ERD and INSTALLER.
- Rate limit: planned DB-backed implementation; Redis is optional and not implemented.
- Server config: `SESSION_SECRET`, `S3_*`, `AI_API_KEY`; public URL:
  `NEXT_PUBLIC_SITE_URL`. Blank optional integrations are accepted. Server config
  is lazy so the current static build does not require database credentials.
- CI runs `npm run check` (typegen/typecheck, lint, tests, build) on Windows/Linux.
- Docker runtime verification is pending on a Docker-equipped machine.

## Phase 2 implementation

Status (2026-09-22): complete and locally verified on PostgreSQL 18.6. Initial
migration was applied to the inspected empty database, then rerun successfully.
Schema regeneration reports no drift. `npm run check` passed typecheck, lint,
16 unit/HTTP-contract tests and production build. `npm run db:test` passed 10
real-DB integration tests, including seed idempotence and preservation of edited
settings/grants. Live HTTP checks verified homepage 200, readiness 200, invalid
mode 400; an isolated server with an unavailable DB returned readiness 503 and
liveness 200. Docker and remote CI remain unexecuted on this machine.

- 41-table Drizzle schema and initial generated SQL migration in `drizzle/`.
- Explicit deployment roles: `shivass_migrator` owns tables; `shivass_app` cannot
  perform DDL or access the migration journal. Append-only history rejects UPDATE,
  DELETE and TRUNCATE for the app role. Admin provisioning is a separate command.
- Idempotent reference seed with 7 roles, 36 permission keys, 7 pack categories,
  default site/feature/AI/homepage settings. Optional `--demo` content is marked,
  unpublished and has no login credentials or downloadable files.
- Lazy server-only DB connection and `/api/health` readiness/liveness endpoint.
- Integration tests use real PostgreSQL and roll back test fixtures/settings.
- CI database job provisions a fresh PostgreSQL 17 service, migrates twice, seeds
  and runs integration tests. Local deployment targets PostgreSQL 18.6.
- Local secrets are in ignored `.env` / `.env.migrations`; application containers
  receive only application-role credentials. Existing operator passwords are unchanged.

## Phase 3 implementation checkpoint

Status (2026-09-22): **complete locally**. Auth pages/APIs, settings, DB sessions,
permission loading and password-reset mail are implemented. Latest local verification:
`npm run check` passed TypeScript, ESLint, 83 unit/HTTP tests and production build;
`npm run db:test` passed 15 real-DB
tests, including 16 concurrent rate-limit attempts with exactly 3 permitted.

Live standalone HTTP verification passed registration, project-root file outbox,
reset-link consumption, token replay rejection (400), old-password rejection,
new-password login, session invalidation, settings redirect, login with a stale
cookie, cross-origin mutation rejection and logout. The latest smoke-test user
and its mail were removed after testing.

- `npm start` resolves relative `MAIL_OUTBOX_DIR` before standalone changes cwd.
- A cookie's presence no longer redirects away from login; expired cookies must
  allow re-authentication. `/settings` redirects to `/settings/profile`.
- Rate-limit keys are serialized with a transaction advisory lock. Counter errors
  return 503; logout revocation errors also return 503 rather than false success.
- Mail delivery is currently local `file`; actual SMTP delivery is unverified.
- Email verification and admin screens are not implemented in this checkpoint.
- Docker/remote CI execution remains open because this machine has no Docker/Git checkout.

## Phase 4 implementation checkpoint

Shared navigation and public states are implemented. `npm run check` passes
TypeScript, ESLint, 88 unit/HTTP tests and the production build. Standalone HTTP
checks verified the homepage, community rules, three legal documents, canonical
metadata, skip navigation and true 404 status/content for known and unknown paths.

- Desktop/mobile navigation now exposes `aria-current`; mobile navigation traps
  focus, restores trigger focus and locks background scrolling while open.
- Header search closes on Escape/outside interaction and restores focus.
- Settings tabs expose their active state and `/settings` redirects to profile.
- Root and segment error states, global fatal fallback and settings skeleton exist.
- Privacy, terms, copyright/takedown and community rules are substantive routes.
- Root-level loading was intentionally omitted: Next.js streams `notFound()` as
  HTTP 200 when wrapped by that Suspense boundary. Segment loading remains.
- Desktop browser automation was unavailable in this session, so manual mobile
  focus/visual verification remains an acceptance follow-up.

## Phase 5 implementation checkpoint (packs + basic admin)

Status (2026-09-22): **complete locally**. Public pack listing/detail/search and
the basic admin catalog/pack surfaces are implemented. Latest verification:
`npm run check` passed TypeScript, ESLint, 94 unit/HTTP tests (including the new
admin error-mapping contract) and the production build; `npm run db:test` passed
18 real-DB tests (public query visibility/FTS/sort plus catalog and pack admin
permission gates with audit assertions).

Standalone production HTTP E2E passed end to end: guest `/admin` redirect and
API `401`; member without permissions gets API `403` and the HTML 403 panel;
after promotion to the admin role, category/tag/pack CRUD succeeded — draft was
hidden from `/api/packs` and `/packs/[slug]` returned 404, approving made it
live (`200` + public API hit), archiving removed it again; FK-guarded category
delete returned `409`; admin HTML pages listed the created/renamed rows; audit
rows contained `category.create/update`, `tag.create`, `pack.create/update/archive`;
all test rows (users, packs, categories, tags, audit rows) were removed.

- `/packs` supports `q`/`sort`/`known`/`page`, `/packs/category/[slug]` and
  `/packs/[slug]` with SEO/canonical and true 404s for unknown slugs.
- `/api/packs` and `/api/packs/[slug]` expose only `approved`, non-demo rows of
  enabled categories with `published_at <= now()`, with cache headers.
- Admin: `/admin`, `/admin/packs`, `/admin/categories`, `/admin/tags` behind the
  permission-aware layout; mutations re-checked in the service layer.
- `pack.publish`, `pack.feature` and `pack.delete` are checked separately from
  `pack.manage`; every mutation writes `audit_logs` in the same transaction.
- Pack deletion is an archive transition (no destructive delete); demo rows are
  excluded from the admin surface.
- Fixes found by E2E: optional category description treated `undefined` as
  invalid input (now equivalent to `null`); FK constraint mapping missed
  PostgreSQL's RESTRICT phrasing (`violates RESTRICT setting of foreign key
  constraint`) and returned 500 instead of 409.
- Uploads (S3/files) remain out of scope until the download phase; `docs/ROUTES.md`
  lists the implemented admin pages and endpoints.

## Phase 6 checkpoint (in progress)

Status (2026-09-23): the first dynamic homepage slice is live. `/` reads enabled
`homepage_sections` in DB order, draws real public featured/trending/known packs
and enabled categories, and shows an honest empty state for empty sections.
`/admin/homepage` and `GET/PUT /api/admin/homepage` let `homepage.manage` reorder
and toggle only the four implemented sections (hero, featured, trending, known).
The update is validated, permission-checked and audited in one DB transaction.
Unimplemented Forum/News navigation links and the inactive installation-guide
CTA have been removed/replaced with working destinations.

`npm run check` passed TypeScript, lint, 96 unit tests and production build;
`npm run db:test` passed 19 real-DB tests. Production HTTP E2E confirmed API
401/403/400, section ordering/visibility on the public homepage, admin UI,
audit insertion and restoration of the original section settings. The user
`shivass` was assigned the seeded `super_admin` role (36/36 grants) in the local
database with a `user.role.assign` audit row. No site-settings or feature-flags
editor has been implemented yet, so Phase 6 remains open.
