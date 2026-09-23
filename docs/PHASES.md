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
Each enabled pack section also has an independently configurable 1-12 card limit;
older API clients that omit it preserve the existing limit.
The update is validated, permission-checked and audited in one DB transaction.
Unimplemented Forum/News navigation links and the inactive installation-guide
CTA have been removed/replaced with working destinations.
The desktop/mobile category links now follow enabled categories from the same
public query; disabling a category removes its menu link on the next request.

`npm run check` passed TypeScript, lint, 99 unit tests and production build;
`npm run db:test` passed 22 real-DB tests. Production HTTP E2E confirmed API
401/403/400, section ordering/visibility on the public homepage, admin UI,
audit insertion and restoration of the original section settings. The user
`shivass` was assigned the seeded `super_admin` role (36/36 grants) in the local
database with a `user.role.assign` audit row. The first real feature-flag editor,
`/admin/settings`, now controls `registrations_enabled` with `admin.settings`,
transactional audit and a matching `/register` closed state. Production HTTP
checks confirmed 401/403/400, live form/closed-state switching, audit and
restoration of the original flag; the temporary user/session were removed.
`site_name` is also editable at `/admin/settings`: it updates live metadata,
header, footer and homepage on the next request and writes a transactional audit
record. HTTP checks covered 401/403/400, live brand/metadata updates, restored
the original name and removed the temporary user/session. The unimplemented
AI/installer flags and sections without real data (news/forum/Discord) are not
exposed in the editor; Phase 6 remains open for further supported settings and
the dependent content phases.

## Permission administration checkpoint (2026-09-23)

`/admin/roles` now groups the 36 seeded permission keys with descriptions,
search, per-group selection, editable lower-role grants and custom role creation.
`/admin/users` searches/paginates real accounts and assigns lower-ranked roles
when the actor holds both `user.manage` and `role.manage`. Self/equal/higher-rank
edits and granting permissions the actor does not hold are rejected in the
service layer. Guest's fixed public grant bundle and the top role cannot be
edited; permission changes are reflected on the next request without session
reissue. Successful mutations append `audit_logs` in their transaction.
The DB suite has 22 real PostgreSQL tests, including modification of the seeded
admin grant bundle inside a rollback transaction and immediate actor reload.
Standalone production HTTP verified guest/member rejections, role CRUD,
duplicate/unauthorized/hierarchy errors, user role assignment, live grant
changes on an existing session, admin HTML pages and audit actions. Temporary
test accounts, sessions, audit records and custom role were removed.
The homepage card-limit API and editor also passed a standalone HTTP contract
check (`1-12`, invalid input `400`) without changing the operator's sections.

### Homepage content editor (2026-09-23)

The hero eyebrow, headline suffix (the live site name remains automatic),
description and labels for the two working links are editable in
`/admin/homepage`. The three pack-section headings are editable as well.
Content is validated with length/control-character bounds, stored in each
section's existing JSON config, and audited alongside visibility/order changes.
Existing config and clients omitting the new fields retain current content;
the links still target `/packs` and `/guidelines`. No migration or seed rewrite
is required. Local verification: 100 unit tests and 22 PostgreSQL tests.
Standalone production HTTP verified 401/400 responses, the editor HTML,
live hero/headline display and real CTA link, and the audit row. The original
section config/order/visibility and test account/session/audit were restored.

### Site description setting (2026-09-23)

`/admin/settings` also manages `site_description` (20-320 characters). It is
reflected on the next request in the default/Open Graph/Twitter description,
footer and inherited homepage hero copy. A separately customized hero
description stays independent. The setting is seeded idempotently, existing
database deployments fall back to the original description until seeded, and
the mutation uses `admin.settings` with same-transaction audit. Local database
seed completed without altering edited section configuration; 23 PostgreSQL
tests cover permissions, input validation, audit and inherited/custom hero copy.
`npm run check` passed typecheck, lint, 100 unit tests and production build.
Standalone HTTP verified guest/member rejection, invalid input, live metadata
(including Open Graph/Twitter), footer and inherited hero, independent custom
hero text and transactional audit. Temporary users, sessions and audit rows were
removed; the original setting and hero configuration were restored.

## Phase 7 checkpoint (downloads/interactions, in progress)

The first member interaction is a real bookmark flow: `/packs/[slug]` offers a
save/remove action, `/bookmarks` lists only currently public saved packs with
pagination, and the account menu links to that list. PUT and DELETE on
`/api/packs/[slug]/bookmark` are idempotent; service-level active-account and
`pack.view` checks, public-visibility rules and transactional pack-row locking
keep per-user bookmarks and the denormalized counter consistent. Hidden/draft
packs cannot be bookmarked or displayed as saved. Real PostgreSQL coverage
passes 24 tests, including repeat writes, two accounts, visibility and rollback.
`npm run check` passed typecheck, lint, 100 unit tests and production build.
Standalone HTTP confirmed guest 401/login redirect, repeated PUT/DELETE without
counter drift, owner-only saved listing, the saved state on the detail page and
archived-pack 404. Temporary users, sessions, category and pack were removed.

The second interaction adds package likes with the same public-visibility and
active-member rules. `PUT/DELETE /api/packs/[slug]/like` sets/unsets a user's
pack like idempotently, maintains `like_count` in the same locked transaction,
and the detail page shows the user's state. The polymorphic `likes` table is
filtered to `target_type=pack`, leaving other target kinds untouched. The real
PostgreSQL suite now has 25 tests, including two users and repeated requests.
`npm run check` passed typecheck, lint, 100 unit tests and production build.
Standalone HTTP confirmed guest 401, unknown/archived pack 404, two-user
idempotent counts and the detail button's live pressed state. Temporary users,
sessions, category, pack and likes were removed.

Package ratings are now a third interaction. Signed-in members can select
1-5, update their existing vote or remove it on `/packs/[slug]`. PUT/DELETE on
`/api/packs/[slug]/rate` validate input and recalculate the one-decimal average
and vote count inside the same serialized DB transaction. Only approved,
non-demo packs in enabled categories are eligible; server-side checks enforce
active sessions and `pack.view`. PostgreSQL integration coverage now has 26
tests, including two voters, invalid values, repeat writes, updates and a full
reset to zero.
`npm run check` passed typecheck, lint, 100 unit tests and production build;
the real PostgreSQL suite passed all 26 tests. Standalone HTTP confirmed
guest/invalid/not-found/archive responses, two-member average and update,
idempotent removal, reset to zero and the detail control. Temporary users,
sessions, category, pack and ratings were removed.

The fourth interaction is a public comment thread on each published pack.
`GET /api/packs/[slug]/comments` and the detail page paginate only visible,
non-demo comments. Active members with `pack.view` may post 3-2000 character
comments; creation and `comment_count` increment share a locked DB transaction.
POST is limited to five attempts per five minutes per member through the
existing database rate limiter; failed validation/visibility attempts also
consume that bucket. Out-of-range page numbers clamp to the last valid page.
Hidden categories, drafts and archived packs return 404. The unit suite now
has 101 tests and the real PostgreSQL suite has 27, including input,
permissions, hidden/demo exclusion, pagination and count. Standalone HTTP
confirmed guest 401, validation 400, two-member posting, hidden exclusion,
the per-member 429 bucket, page clamping and disabled-category 404; temporary
users, sessions, category, pack, comments and rate rows were removed.

Pack view tracking is a public POST beacon fired once per detail-page mount.
`recordPackView` only accepts approved, non-demo packs in enabled categories;
identity is the member id or guest IP + user agent, hashed through the shared
rate limiter so each identity counts at most once per pack per 30 minutes.
The increment is one atomic UPDATE and the visible counter refreshes only
when a view was actually recorded. PostgreSQL coverage is now 28 tests,
covering guest/member identities, repeats, two visitors, bad slugs, disabled
categories and archived packs.

Downloads close the Phase 7 interaction set. `GET /api/packs/[slug]/download`
resolves the latest version's primary URL or an explicit/first-priority
enabled mirror (safe http(s) parsing, no open redirect) and answers 302 with
`no-store`. Permission `download.use` is enforced server-side; identity is the
member id or guest IP + user agent, capped at 10 attempts per hour (429 with
Retry-After) and counted at most once per 30 minutes. Each counted event writes
one `downloads` row (IP stored only as SHA-256, kind `manual`, mirror label)
and bumps `download_count` in the same transaction. The detail page renders
the Indir button and mirror links only when a source exists, and members get a
paginated `/downloads` history (own rows only, archived packs included) plus a
user-menu link. PostgreSQL coverage is now 29 tests: permissions, suspension,
dedupe, mirror selection/order, no-target 404, the abuse ceiling, row/counter
consistency, visibility gates and history isolation. Standalone HTTP confirmed
404 paths, guest/member dedupe, mirror selection, hashed+attributed rows, the
10/hour 429 with Retry-After, detail CTAs, the member history page and the
archive freeze; temporary rows were removed through the migrator role because
`downloads` is append-only for the app role, leaving zero residue.

The Phase 7 content block adds real detail-page substance without fake data.
Migration `0001` adds nullable `packs.install_guide` with a 10-50000 character
check; both the admin pack form and `updateAdminPack` validate it (empty clears
it) and the DB guard rejects short direct writes. `getPublishedPack` now
returns the full non-demo version history (latest first with size, checksum,
changelog and date) plus the guide, and the page renders a Kurulum section, a
Sürümler list, and an Ilgili paketler grid from `getRelatedPacks`: approved
non-demo packs in the same enabled category, excluding the current pack, most
downloaded first, at most four. A schema.org SoftwareApplication JSON-LD block
carries title, canonical URL, creator, dates, version and aggregate rating;
every `<` is escaped so user text can never break out of the script element.
Gallery screenshots stay deferred with the S3/file-upload phase. The unit
suite is now 103 tests and the real PostgreSQL suite has 30, covering guide
validation/clearing, permission gates, version demo exclusion and ordering,
related-pack visibility and ordering, and the DB length check.

## Phase 8 checkpoint (profiles/submissions, in progress)

Public profiles are live at `/u/[username]`. `getPublicProfile` accepts only
active, non-demo members whose username matches the DB format and returns the
display name, bio, join date and a count of currently visible packs;
suspended, deleted, demo, unknown or malformed names render a true 404. The
page adds canonical/Open Graph metadata and a script-safe ProfilePage JSON-LD
block, then lists the member's packs through a new validated `creatorId`
filter on the shared public query, so drafts, disabled categories and other
members' packs never appear; out-of-range pages return no rows and the
pagination links stay on `/u/[username]?page=`. The pack detail byline and
every pack card now link to the author's profile. Unit coverage is 104 tests
(a serializer escaping case) and the real PostgreSQL suite has 31 tests
covering identity visibility, pack visibility, totals, unknown creators,
out-of-range pages and malformed usernames. Standalone HTTP confirmed the
header/bio, visible-only listing, JSON-LD and canonical URL,
suspended/unknown/malformed 404s and the byline/card links; temporary users,
packs and categories were removed, leaving zero residue.

The submission flow closes the review half of Phase 8. Migration `0002` adds
nullable `packs.review_note` with a 3-1000 character check, and the pure rules
live in `src/lib/submission-state.ts` so the server and client forms share
them: authors edit and (re)submit only `draft/changes_requested/rejected`,
withdrawing and reviewing only `pending`, negative decisions require a 3-1000
character note, and approvals never store one. `src/services/submissions.ts`
validates fields and references (enabled non-demo categories, non-demo tags),
builds collision-free slugs, enforces owner-only reads and writes, blocks
self-review, publishes on approval with `publishedAt`, and writes
`submission.create/update/submit/withdraw/review` audit rows inside the same
transaction. Pages: `/submit` (create form plus the author's own list with
status chips and notes), `/submit/[id]` (locked editor, review note banner,
submit/withdraw actions), `/admin/submissions` (FIFO queue card with note box
and approve/changes/reject buttons) with an admin-nav entry and a user-menu
"Gönderilerim" link when `pack.submit` is granted. APIs: `GET/POST
/api/submissions`, `PATCH /api/submissions/[id]`,
`POST /api/submissions/[id]/status`, `GET /api/admin/submissions` and
`PATCH /api/admin/submissions/[id]`. The unit suite is now 108 tests (the
submission state machine) and the PostgreSQL suite has 32 (full flow:
validation, ownership, transitions, queue membership, permission/self-review
gates, note rules, publish, audit trail and form options); the downloads
history fixture became deterministic with explicitly inserted timestamps
because one transaction shares `now()` and the table is append-only for the
app role. Standalone HTTP verified guest redirect/401 gates, validation
rejections, the draft page, queue membership around submit and withdraw,
pending locks, the note round-trip to the author, the moderator queue card
versus the author's 403, resubmit clearing, approval with a live public
detail, closed re-review and 409 locks on approved rows; temporary users,
packs, categories, tags, sessions and audit rows were removed, leaving zero
residue.

The version slice closes Phase 8. `src/lib/pack-version.ts` validates a new
version payload: a numeric semver-ish identifier with optional pre-release
suffix, a mandatory http(s) download target (downloads resolve through the
latest version, so the field cannot be empty), an optional 0-1 TiB byte size,
an optional lowercase 64-hex SHA-256 checksum and a 5000-character changelog.
`createPackVersion` in `src/services/submissions.ts` gates it behind
`pack.edit_own`, an owner-scoped pack lookup (foreign/unknown packs answer
404) and an `approved`-only status check (drafts answer 409). Inside one
transaction it demotes every existing `is_latest`, inserts the new row as the
single latest (the partial unique index backstops concurrent writers), writes
a `pack.version_add` audit row and maps the `pack_version_number` duplicate to
409 — reading the code from the drizzle `cause` chain, a fix the shared slug
mapper learned too (its direct `.code` check never matched wrapped errors).
Page `/submit/new` lists only the author's approved packs, accepts a `?pack=`
deep link that falls back safely and shows an empty state without an approved
pack; the `/submit` list and `/submit/[id]` header gained "Yeni sürüm" links
for approved rows. API: `POST /api/submissions/[id]/versions` (201). The unit
suite is now 112 tests (the version validators) and the PostgreSQL suite has
33 (normalization, single moving latest, download flip, duplicates,
validation, ownership/status/permission gates and the audit count).
Standalone HTTP verified guest redirect/401 gates, the picker contents and
deep-link fallback, the 404-before/302-after download switch, version one and
two with `latestVersion` updates on the public API, every 400/404/409
rejection, the list/editor links and the audit rows; temporary users, packs,
versions, downloads and audit rows were removed, leaving zero residue.

The list editor closes the author's loop on review decisions.
`listSubmissions` now returns full detail rows (excerpt, description,
category, source and license plus tag ids gathered with one `inArray` query)
so the client can repopulate a form without a second fetch; the payload stays
owner-scoped behind `pack.submit`. `/submit` moved its cards into a client
`SubmissionList` component: `changes_requested` and `rejected` items gain a
"Düzenle ve tekrar gönder" toggle that opens the shared field editor inline
and uses `POST /api/submissions/[id]/resubmit` to save and return to review
atomically, collapsing on success and refreshing state. A failed save keeps
the review note intact; success clears it and moves the row to `pending`. Drafts
keep the link-only treatment; approved rows keep their public and version
links. The unit suite stays at 112 tests; the PostgreSQL suite asserts the
enriched list payload (detail fields and tag ids) inside the existing
submission flow test. Standalone HTTP verified the affordance renders only
for decision states (draft has none), the note banner and status chip on the
card, the edit-and-resubmit round trip reflected in the API list as pending
with a cleared note and edited fields, the affordance disappearing once
pending, the audit row and the 409 on a duplicate submit;
temporary users, packs, categories and audit rows were removed, leaving zero
residue.

GPT-6 review (2026-09-23): corrected two author-path gaps. The version picker
uses an approved-pack query gated by `pack.edit_own`; `listSubmissions` also
requires `pack.submit` and broke for custom roles. Version insertion locks the
owner-scoped pack inside the transaction before checking approval. The inline
edit-and-resend endpoint locks the owner row and validates fields/references,
updates fields and tags, clears the note, transitions to `pending` and inserts
one `submission.resubmit` audit row in the same transaction. Invalid edits
leave both fields and review decision untouched; the inline control is shown
only when `pack.edit_own` is granted. Submission create/edit/resubmit JSON
requests allow 256 KiB so the forms' supported 50,000-character descriptions
can actually be saved; other API requests keep their default 16 KiB cap unless
their content contract sets a specific limit.

## Phase 9 checkpoint (forum/moderation, in progress)

The first forum slice provides real guest read / member create: three
insert-only reference categories (general, pack discussion, help) were seeded
with stable IDs; `/forum`, `/forum/[category]` and `/forum/topic/[slug]` render
only enabled non-demo categories and visible non-demo topics. The navbar links
to `/forum`. `/forum/new` and `POST /api/forum/topics` check an active session
and `forum.topic.create`; `GET /api/forum/topics` supports category and page
filters. Topic creation validates title/body, serializes same-base slug
selection, locks the category, inserts the topic, increments category topic
and post counters and the author's post count, and writes
`forum.topic.create` audit in the same transaction. Listing returns a bounded
page ordered by pin/activity; category/detail have canonical metadata and 404
for closed/hidden/demo records. No reply or moderation controls are shown yet.
The topic POST accepts up to 64 KiB for its 10,000-character text field.
The PostgreSQL integration suite (34 tests total) covers permissions, category
visibility, validation, duplicate-title slug allocation, counters, audit and
hidden/closed topic exclusion. Production seed ran insert-only on the live
database. The standalone HTTP flow verified guest/public reads, guest POST
rejection and login redirect, member form + creation, repeated titles, topic
detail/visibility gates, counter/audit updates and the API filter; all test
fixtures were removed. External `/forum` and `/api/health` respond 200 on
`0.0.0.0:3000`. Visual browser automation remains unavailable in this session.

The reply slice adds visible, paginated replies to topic detail and `GET/POST
/api/forum/replies` (guest read, active `forum.reply.create` write). Creating
a reply locks the topic and enabled category, rejects hidden/demo/closed and
locked topics, then inserts a visible reply, increments the topic/category/user
post counters, records `lastReplyAt` and writes `forum.reply.create` audit in
the same transaction. The page shows the newest replies first, a real form for
permitted members, a login link for guests and a read-only locked notice.
The PostgreSQL suite has 35 tests (reply permissions, validation, visibility,
locks, counters, audit and category closure). Standalone HTTP verified guest
reads/401 writes, member reply form and POST, visible list/detail, 400 invalid
body, 404 unknown topic, 409 locked topic, hidden-reply exclusion and complete
fixture cleanup; external health remains available on port 3000.

The next forum slice adds `/forum/topic/[slug]/edit` (author with
`forum.edit_own`, or moderator) and `/admin/forum` topic controls. Topic title
and body changes keep the canonical slug stable. A moderator can lock/unlock,
pin/unpin and hide/show a real topic via `PATCH
/api/admin/forum/topics/[id]`; hidden topics remain visible to the moderation
list but not public readers. Changes lock the topic row, keep the category's
topic/post counters consistent on hide/show, including replies already counted
but subsequently hidden, and write one audit entry
per actual mutation. Locked topics cannot be edited by authors or replied to;
no-op moderator actions do not double-count or add audit entries. Permission,
ownership, validation and counter invariants are covered by 36 PostgreSQL tests.
Production build and standalone HTTP verified author edit, moderator permissions,
lock, pin, hide/show, public 404 and reinstatement, counter restoration, audit
idempotence and complete fixture cleanup. Forum API reads use `no-store` so
moderation changes are visible immediately.

Forum reporting: members with `forum.read` can submit a reason (and optional
detail) on visible topics or replies using the inline “Bildir” control.
`POST /api/forum/reports` validates target visibility including its category,
serializes duplicate submissions by member/target, permits only one open or
reviewing report for each, and inserts an audit record transactionally.
`/admin/moderation` shows the most recent 100 forum reports and their content
to `moderation.access`; `moderation.resolve` permits reviewing, resolving or
dismissing with a required decision note for final decisions. Resolution and
audit are atomic; closed reports cannot be decided twice. PostgreSQL covers
validation, visibility, permission boundaries, duplicates, transitions and
audits (37 tests total).

Ban control: `/admin/bans` allows moderators with `user.ban` to search
lower-ranked active users or view active bans. `PATCH /api/admin/bans/[id]`
requires a 1-365-day duration and 10-500-character reason for bans; unban
clears both date and reason. The service locks the target, verifies actual DB
role ranks, prevents self/equal-or-higher-role actions, and writes `user.ban`
or `user.unban` audit transactionally. Banned accounts are already rejected
by auth login and `assertActive` on member mutations. PostgreSQL now runs 38
tests, including ban permissions, rank isolation, dates, write denial and
unban restoration. `npm run check` passed typecheck, lint, 114 unit tests and
production build; all 38 PostgreSQL integration tests passed. Standalone HTTP
verified member reports, duplicate rejection, moderator queue, reviewing and
final resolution, rank-gated ban, blocked posting while banned, unban and
restored posting. Both live E2E users, topic, replies, report and audit data
were removed with zero fixture residue. The core Phase 9 forum/report/ban/audit
flow is complete; remaining route-map concepts outside this slice are not
presented as working links.

## Phase 10 checkpoint (news/AI, in progress)

The first news slice adds three insert-only reference categories; `/news`,
`/news/[slug]` and `GET /api/news` show only published non-demo articles, with
pagination, canonical/OG metadata and NewsArticle structured data. Drafts,
review items and archives remain hidden from public routes. `/admin/news`
supports category-based draft creation, author/manager editing and transitions
draft → review (`news.write`) → published → archived (`news.manage`). Every
mutation checks session permissions and writes an audit row in the same
transaction; duplicate titles receive unique, stable slugs. Article content
accepts 50,000 characters via a 256 KiB news-editor body budget. The author
may edit drafts and review items, while published/archived versions are locked.
The PostgreSQL integration suite includes authorization, validation, unique
slugs, public visibility, metadata fields, transition and audit checks (39
tests total). `npm run check` passed typecheck, lint, 114 unit tests and build.
Standalone HTTP verified custom writer vs editor grants, a 50,000-character
draft, duplicate slug allocation, draft/review 404s, editor publication with
public listing/NewsArticle SEO, locked published edits and archived 404. The
temporary authors, roles, articles, sessions and audit rows were removed.
