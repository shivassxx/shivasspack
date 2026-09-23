# SHIVASS PACK — Permission Model (V1)

Permission-based RBAC. **Never branch on role names in business logic.**

## Principles

1. Code asks: `can(actor, 'pack.publish')` — not `actor.role === 'admin'`.
2. Roles are just **permission bundles**, editable in `/admin/roles`.
3. Seed roles are system roles (`isSystem=true`): keys are stable, names localizable.
4. Guest is a real concept: unauthenticated actor resolves to the `guest` role so
   public reads flow through the same check.
5. Deny by default. Missing permission → `403`, never silent success.
6. Frontend gating mirrors permissions for UX only; **service layer re-checks**.

## Permission keys

Format: `<domain>.<action>`. Groups exist for admin UI display only.

### content

```
pack.view            (public — implicit for guests)
pack.submit          submit a community pack for review
pack.edit_own        edit own draft / changes_requested pack
pack.edit_any        edit any pack
pack.publish         approve / publish / archive any pack
pack.feature         feature, editor pick, trending override
pack.delete          soft-delete any pack
pack.manage          = pack.edit_any + publish + feature + delete (alias kept explicit)
category.manage      create/edit/delete categories
tag.manage           create/edit/delete tags
submission.review    approve / reject / request changes
```

### downloads & installer

```
download.use         download (public)
installer.manifest.edit   edit manifests & operations
installer.manage     publish versions, sign manifests
```

### forum & moderation

```
forum.read           (public — implicit)
forum.topic.create   open topics
forum.reply.create   reply
forum.edit_own       edit own topic/reply
forum.moderate       edit/lock/pin/delete any topic/reply
forum.category.manage
moderation.access    open moderation queue
moderation.resolve   resolve reports
user.ban             ban / temp ban / unban
user.manage          edit roles, reset password, inspect
user.delete
```

### news & ai

```
news.write           create/edit own drafts
news.manage          publish, edit, delete any article
ai.manage            sources, prompt, provider, auto-publish policy
```

### users & system

```
profile.edit_own
admin.dashboard      admin home metrics
admin.settings       site settings, feature flags, maintenance
homepage.manage      reorder/toggle homepage sections
audit.view           read audit log
role.manage          create roles, assign permissions
analytics.view
notification.manage
```

## Seed roles

| Role             | Key                | Grants (summary)                                                                                                                                                                |
| ---------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guest            | `guest`            | `pack.view`, `download.use`, `forum.read`                                                                                                                                       |
| Member           | `member`           | guest + `profile.edit_own`, `pack.submit`, `pack.edit_own`, `forum.topic.create`, `forum.reply.create`, `forum.edit_own`                                                        |
| Creator          | `creator`          | member + richer upload quota for `pack.submit`; quota model is defined in the database phase                                                                                    |
| Verified Creator | `verified_creator` | creator + `badge`, optional reduced moderation queue                                                                                                                            |
| Moderator        | `moderator`        | + `forum.moderate`, `moderation.*`, `submission.review`, `user.ban`, `pack.feature`                                                                                             |
| Admin            | `admin`            | + `news.manage`, `ai.manage`, `installer.*`, `user.manage`, `homepage.manage`, `admin.settings`, `category.manage`, `tag.manage`, `audit.view`, `role.manage`, `analytics.view` |
| Super Admin      | `super_admin`      | + `user.delete`, everything; only role that can edit `admin`/`super_admin` role assignment                                                                                      |

## Elevation rules

- A moderator cannot grant themselves `admin.*` — role edits require `role.manage`
  **and** the target role must be strictly below the actor's rank.
- Only `super_admin` may assign `admin` or `super_admin`.
- `super_admin` cannot be banned or deleted (service rejects).
- Every admin/mod mutation writes an `AuditLog` row in the same transaction.

## Enforcement points

| Layer             | Responsibility                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `src/proxy.ts`    | coarse `/settings/*`/`/admin/*` cookie redirect and cross-origin mutation rejection                |
| Admin layout RSC  | loads permissions, renders `403` panel early (UX)                                                  |
| **Service layer** | authoritative `requirePermission(actor, key)` before any write                                         |
| API handlers      | parse session → build actor → call service                                                         |
| DB                | no row-level security in V1 (single-tenant app); rely on service checks                            |

Phase 5 admin surfaces follow the same table: `/admin` layout does the early
UX check, and `category.manage` / `tag.manage` / `pack.manage` (plus the
separately checked `pack.publish`, `pack.feature`, `pack.delete`) are enforced in
`src/services/admin/*` before every write. Constraint collisions (duplicate slug,
FK-restricted delete) map to `409`; every successful mutation appends an
`audit_logs` row in the same transaction.

## Actor shape (used everywhere)

```ts
type Actor = {
  id: string | null;
  displayName: string | null;
  roleKey: string;
  permissions: ReadonlySet<PermissionKey>;
  status: "active" | "suspended" | "deleted";
  banUntil: Date | null;
};
```

`suspended`, `deleted`, or a future `banUntil` → all member actions rejected.
An expired `banUntil` does not itself block an otherwise active account.

Guest actors have `id: null`, `roleKey: 'guest'` and guest permissions. The Actor
type above describes authenticated actors; the implementation must model the guest
case explicitly. Phase 2 now defines `roles.rank` (0..100); seed ranks are
guest=0, member=10, creator=20, verified_creator=30, moderator=40, admin=50,
super_admin=60. Service enforcement is Phase 3. Seed quotas are total upload byte
budgets stored on roles; upload services will apply them in the content phase.
Initial moderator grants include `admin.dashboard`/`forum.category.manage`; admin
gets every explicit permission except `user.delete`, super_admin gets all.
Seed inserts grants only for newly created roles, preserving administrator edits
when run again. No administrator user or default login password is seeded.
