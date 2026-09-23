# SHIVASS PACK — Route Map (V1)

`RSC` = server component (default), `CA` = server action, `API` = route handler.

## Public

| Route                                  | Type   | Access | Notes                                                                          |
| -------------------------------------- | ------ | ------ | ------------------------------------------------------------------------------ |
| `/`                                    | RSC    | public | homepage, section-driven by `HomepageSection`                                  |
| `/packs/category/graphics`             | RSC    | public | category landing (`kind=graphics`)                                             |
| `/packs/category/pvp`                  | RSC    | public | category landing (`kind=pvp`)                                                  |
| `/packs/category/reshade`              | RSC    | public | category landing (`kind=reshade`)                                              |
| `/packs/category/enb`                  | RSC    | public | category landing (`kind=enb`)                                                  |
| `/packs`                               | RSC    | public | full listing + filters + sort; header quick search uses `?q=`                  |
| `/packs/[slug]`                        | RSC    | public | detail, SEO, gallery, guide, comments                                          |
| `/packs/[slug]#install`                | RSC    | public | manual install guide anchor                                                    |
| `/news`                                | RSC    | public | article listing                                                                |
| `/news/[slug]`                         | RSC    | public | article + schema.org NewsArticle                                               |
| `/search`                              | RSC    | public | global search results (q, type filters)                                        |
| `/u/[username]`                        | RSC    | public | public profile                                                                 |
| `/login`                               | RSC+CA | guest  | credentials form                                                               |
| `/register`                            | RSC+CA | guest  | respects `registrations_enabled` flag                                          |
| `/forgot-password` / `/reset-password` | RSC+CA | guest  | token single-use, 15 min                                                       |
| `/connect`                             | RSC    | public | SHIVASS installer help/fallback page (no external OpenCode service dependency) |

## Authenticated (member+)

| Route                | Type   | Access        | Notes                                |
| -------------------- | ------ | ------------- | ------------------------------------ |
| `/settings/profile`  | RSC+CA | owner         | avatar, bio, display name            |
| `/settings/account`  | RSC+CA | owner         | email, password, sessions            |
| `/settings/sessions` | RSC+CA | owner         | revoke devices                       |
| `/bookmarks`         | RSC    | member        | saved packs                          |
| `/downloads`         | RSC    | member        | personal download history            |
| `/notifications`     | RSC+CA | member        | mark read                            |
| `/submit`            | RSC+CA | `pack.submit` | community pack submission wizard     |
| `/submit/[id]`       | RSC+CA | author        | edit while `draft/changes_requested` |
| `/submit/new`        | RSC+CA | author        | new version for own pack             |

## Forum (public read, member write)

| Route                        | Type   | Access                     |
| ---------------------------- | ------ | -------------------------- |
| `/forum`                     | RSC    | public                     |
| `/forum/[category]`          | RSC    | public                     |
| `/forum/topic/[slug]`        | RSC    | public                     |
| `/forum/new`                 | RSC+CA | `forum.topic.create`       |
| `/forum/topic/[slug]/edit`   | RSC+CA | author or `forum.moderate` |
| `/forum/topic/[slug]/reply`  | CA     | `forum.reply.create`       |
| `/forum/topic/[slug]/report` | CA     | member                     |

## Admin (`/admin`, `admin.*` permission + server-side check)

| Route                           | Type   | Permission                  |
| ------------------------------- | ------ | --------------------------- |
| `/admin`                        | RSC    | `admin.dashboard`           |
| `/admin/packs` (+ `[id]`)       | RSC+CA | `pack.manage`               |
| `/admin/categories`             | RSC+CA | `category.manage`           |
| `/admin/tags`                   | RSC+CA | `tag.manage`                |
| `/admin/submissions`            | RSC+CA | `submission.review`         |
| `/admin/users` (+ `[id]`)       | RSC+CA | `user.manage`               |
| `/admin/roles`                  | RSC+CA | `role.manage`               |
| `/admin/forum`                  | RSC+CA | `forum.moderate`            |
| `/admin/moderation`             | RSC+CA | `moderation.access` (queue) |
| `/admin/news` (+ `new`, `[id]`) | RSC+CA | `news.manage`               |
| `/admin/ai-news`                | RSC+CA | `ai.manage`                 |
| `/admin/installer`              | RSC+CA | `installer.manage`          |
| `/admin/homepage`               | RSC+CA | `homepage.manage`           |
| `/admin/settings`               | RSC+CA | `admin.settings`            |
| `/admin/analytics`              | RSC+CA | `admin.dashboard`           |
| `/admin/audit`                  | RSC+CA | `audit.view` (read-only)    |

Admin layout renders its own sidebar; `proxy.ts` performs a coarse cookie-presence
redirect, the **real check happens in every admin service call** (defense in depth).
Implemented so far: `/admin` overview, `/admin/packs`, `/admin/categories`,
`/admin/tags`, `/admin/homepage` (section order, visibility and content), `/admin/settings`
(site name, description and registration switch), `/admin/roles` (grant editor/custom roles),
`/admin/users` (search and role assignment). Every mutation writes
an `audit_logs` row in the same transaction;
`pack.publish`, `pack.feature` and `pack.delete` are checked separately from
`pack.manage`, and `DELETE /api/admin/packs/[id]` performs an archive transition
instead of a destructive row delete.

## API

| Endpoint                              | Method           | Auth            | Purpose                           |
| ------------------------------------- | ---------------- | --------------- | --------------------------------- |
| `/api/auth/login`                     | POST             | guest           | rate-limited                      |
| `/api/auth/logout`                    | POST             | session         | revoke current                    |
| `/api/auth/register`                  | POST             | guest           | flag-gated                        |
| `/api/auth/session`                   | GET              | optional        | current actor/permissions         |
| `/api/auth/password/forgot`           | POST             | guest           | enumeration-safe reset request    |
| `/api/auth/password/reset`            | POST             | reset token     | single-use password reset         |
| `/api/auth/password/change`           | POST             | session         | rotate password, revoke others    |
| `/api/auth/sessions`                  | GET/DELETE       | session         | list/revoke own sessions          |
| `/api/profile`                        | PATCH            | `profile.edit_own` | update own display name/bio    |
| `/api/packs`                          | GET              | public          | listing (filters, sort, page)     |
| `/api/packs/[slug]`                   | GET              | public          | detail                            |
| `/api/admin/categories`               | GET/POST         | `category.manage` | list/create categories          |
| `/api/admin/categories/[id]`          | PATCH/DELETE     | `category.manage` | update/delete, FK-restricted   |
| `/api/admin/tags`                     | GET/POST         | `tag.manage`      | list/create tags                |
| `/api/admin/tags/[id]`                | PATCH/DELETE     | `tag.manage`      | update/delete                   |
| `/api/admin/packs`                    | GET/POST         | `pack.manage`     | list/create drafts              |
| `/api/admin/packs/[id]`               | PATCH/DELETE     | `pack.manage`+    | update; DELETE archives         |
| `/api/admin/homepage`                 | GET/PUT          | `homepage.manage` | order/toggle sections; hero copy/headings; 1-12 pack cards |
| `/api/admin/settings`                 | GET/PUT          | `admin.settings`   | site name/description + registrations_enabled |
| `/api/admin/roles`                    | GET/POST         | `role.manage`     | list grants/create lower custom role |
| `/api/admin/roles/[id]`               | PATCH            | `role.manage`     | edit lower role name/description/grants |
| `/api/admin/users`                    | GET              | `user.manage`     | search/page real users           |
| `/api/admin/users/[id]`               | PATCH            | `user.manage` + `role.manage` | assign lower role |
| `/api/packs/[slug]/download`          | GET              | public          | 302 to source, deduped count, 10/h abuse cap |
| `/api/packs/[slug]/view`              | POST             | public          | beacon, deduped per identity 30m |
| `/api/packs/[slug]/rate`              | PUT/DELETE       | member          | set 1..5 / remove, recompute avg  |
| `/api/packs/[slug]/like`              | PUT/DELETE       | member          | idempotent like/remove + count    |
| `/api/packs/[slug]/bookmark`          | PUT/DELETE       | member          | idempotent save/remove + count    |
| `/api/packs/[slug]/comments`          | GET/POST         | public/member   | visible paged read (clamped); limited write |
| `/api/search`                         | GET              | public          | unified FTS                       |
| `/api/forum/topics`                   | GET/POST         | public/member   | create needs auth                 |
| `/api/forum/topics/[id]`              | GET/PATCH/DELETE | public/member   | PATCH author/mod                  |
| `/api/forum/replies`                  | POST             | member          |                                   |
| `/api/notifications`                  | GET/PATCH        | member          |                                   |
| `/api/installer/manifest/[packageId]` | GET              | public          | signed manifest                   |
| `/api/installer/report`               | POST             | installer token | install telemetry (opt-in)        |
| `/api/upload`                         | POST             | member          | presigned PUT or proxy, validated |
| `/api/ai/check`                       | POST             | cron secret     | trigger source sweep              |
| `/api/health`                         | GET              | public          | liveness/readiness                |

## Custom protocol

```
shivasspack://install/{packageId}          → open installer, fetch manifest
shivasspack://install/{packageId}@{ver}    → pin version
shivasspack://uninstall/{packageId}
```

Registered by the desktop installer (HKCU). Web side renders a fallback panel when the
protocol does not respond (deep-link timeout → manual download CTA).

## URL rules

- lowercase, kebab-case slugs, no trailing slash, `?page=` cursor pagination
- every public page defines `metadata` + canonical; pack/news add JSON-LD
