# SHIVASS PACK — Architecture Plan (V1)

## 1. Product shape

SHIVASS PACK is not a download page. It is a **FiveM mod discovery + community + installer ecosystem**:

- Content platform (packs, presets, news, guides)
- Community layer (forum, profiles, ratings, likes, bookmarks, submissions)
- Desktop installer protocol (manifest-driven, signed, rollback-capable)
- Admin CMS (everything above manageable without touching code)

V1 must be usable by real users today, and must not make architectural decisions that
block: desktop launcher, server integrations, monetization, API access, mobile app.

## 2. Top-level architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Next.js App                             │
│  ┌───────────────┐  ┌────────────────┐  ┌─────────────────────┐  │
│  │  Public Web   │  │  Admin Panel   │  │  API (route handlers)│ │
│  │  (RSC first)  │  │  (guarded RSC) │  │  JSON + zod validated│ │
│  └───────┬───────┘  └───────┬────────┘  └──────────┬──────────┘  │
│          └─────────────┬────┴──────────────────────┘             │
│                ┌───────▼────────┐                                │
│                │  Service Layer │  ← no UI imports, no next/*    │
│                │  (per domain)  │                                │
│                └───────┬────────┘                                │
└────────────────────────┼─────────────────────────────────────────┘
        ┌────────────────┼───────────────────────┐
        ▼                ▼                       ▼
  PostgreSQL (Drizzle) Redis (opt-in)     Object Storage (S3/R2/MinIO)
   source of truth    cache/rate limit/    media + pack archives
                      queue, V1 lazy
```

### Layering rules

1. **UI never touches the DB.** Components call server actions, route handlers, or hooks.
2. **Service layer owns business logic.** Every domain (`packs`, `forum`, `ratings`, …)
   exposes functions that take plain inputs, validate with zod, check permissions, write
   via Drizzle, emit events. Services are pure TypeScript — no `next/*` imports — so they
   are testable without booting Next.
3. **Route handlers are thin.** Parse → call service → serialize. They never hold logic.
4. **Authorization is enforced server-side in the service layer**, never only in the UI.
5. **All writes that mutate user state go through explicit transaction boundaries.**

## 3. Domain map

| Domain          | Owns                                       | Key invariants                                       |
| --------------- | ------------------------------------------ | ---------------------------------------------------- |
| `auth`          | credentials, sessions, password reset      | one active session per device, hashed secrets only   |
| `users`         | profiles, roles, reputation                | username immutable after creation (slug = username)  |
| `rbac`          | roles, permissions, checks                 | permission-based, not role-name checks               |
| `content`       | packs, versions, categories, tags, media   | slug unique, versions immutable once published       |
| `downloads`     | mirrors, counters, signed URLs             | counter dedupe, rate limit, no hotlinking            |
| `installer`     | manifests, install versions, protocol      | manifest schema-validated, checksums mandatory       |
| `reviews`       | ratings, likes, bookmarks, comments        | 1 rating/user/pack, updatable, not deletable         |
| `forum`         | categories, topics, replies, likes         | guests read-only, authors edit own, mods edit any    |
| `news`          | articles, categories, AI drafts            | AI never publishes without policy check              |
| `ai`            | sources, jobs, provider abstraction        | provider-agnostic interface, key never leaves server |
| `notifications` | in-app notifications                       | fan-out on explicit events only                      |
| `analytics`     | events, aggregates                         | append-only, no PII beyond user id                   |
| `admin`         | site settings, homepage, audit, moderation | every mutation → AuditLog                            |
| `moderation`    | reports, queue, bans                       | report resolution requires actor id                  |

## 4. Data flow examples

**Download a pack**

```
GET /api/packs/[slug]/download?mirror=primary
  → rate limit (ip + user)
  → service: resolve PackVersion → pick mirror → increment Download (deduped 10 min)
  → emit analytics download_started
  → 302 to signed storage URL / external URL / GitHub release
  → client emits download_completed (beacon)
```

**Install via desktop client**

```
  shivasspack://install/{packageId}@1.2.0
  → OS opens SHIVASS PACK Installer
  → installer GET /api/installer/manifest/{packageId} (public, signed)
  → verifies Ed25519 signature + per-file sha256
  → backup → apply whitelist operations → verify → log
```

**AI news**

```
cron/interval → AIJob(source) → provider abstraction → candidate article
  → zod validate → confidence ≥ threshold?
      no  → DISCARDED
      yes → DRAFT (admin queue)  [AUTO PUBLISH only if source.trusted && policy on]
  → admin review → PUBLISH → NewsArticle
```

## 5. Cross-cutting decisions

| Concern               | V1 decision                                                                                                | Future path                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| ORM                   | **Drizzle + postgres.js** (SQL migrations, Studio, typed queries); implementation starts in database phase | stays                                         |
| Auth                  | **Own session auth**: DB `Session` table, httpOnly+SameSite cookie, scrypt password hash                   | OAuth/Discord link plugs into `Account` table |
| Validation            | zod everywhere (input + output boundaries)                                                                 | stays                                         |
| Server state (client) | TanStack Query                                                                                             | stays                                         |
| Forms                 | React Hook Form + zodResolver                                                                              | stays                                         |
| Cache                 | planned in-process caching for public reads; no cache adapter implemented yet                              | optional Redis adapter                        |
| Queue                 | synchronous in V1 + `Job` table; Redis/BullMQ adapter later                                                | same interface                                |
| Search                | Postgres full-text (`tsvector` + GIN) behind `SearchService`                                               | Meilisearch adapter                           |
| Storage               | `StorageProvider` interface (S3/R2/MinIO)                                                                  | add providers without touching callers        |
| Media                 | never in DB; upload → validate → storage → `Media` row                                                     | CDN signed URLs                               |
| Rate limiting         | DB-backed sliding window in V1 (no Redis needed)                                                           | Redis adapter                                 |
| i18n                  | Turkish + English strings centralized, V1 ships `tr` + `en`                                                | stays                                         |

## 6. Security model (summary)

- Zod validation on **every** inbound payload (server actions and API routes).
- RBAC: `Permission` checked in service layer; UI gating is cosmetic.
- IDOR: all object access resolves through `assertCanView/act(actor, resource)`.
- CSRF: same-site strict cookies + origin check on mutations.
- XSS: React escaping + strict CSP headers; rich text rendered through allow-list sanitizer.
- Uploads: extension + MIME + size + hash; stored out-of-root; served with
  `Content-Disposition` and no execution.
- Brute force: login rate limit + exponential lockout + audit log.
- Audit: admin/mod mutations append to append-only `AuditLog` (no delete API).
- Secrets: `.env` only, `.env.example` committed, provider keys server-side only.
- Installer manifests: signed, checksummed, whitelisted operations only —
  **never arbitrary shell**.

## 7. Non-goals for V1

- No microservices, no Kubernetes, no event bus. One Next.js app + Postgres + optional Redis.
- No GraphQL.
- No realtime websocket chat (polling for notifications is enough).
- No payment system.
