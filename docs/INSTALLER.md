# SHIVASS PACK — Installer Architecture (V1)

Browser cannot touch FiveM files. The web platform therefore speaks to a small,
strictly validated desktop app: **SHIVASS PACK Installer** (Windows, later cross-platform).

## 1. Components

```
Browser (pack page)                     SHIVASS PACK Installer (Windows)
  │  [AUTO INSTALL]                        │
  ├─► shivasspack://install/{pkg}@{ver} ──►│  registers protocol (HKCU)
  │                                        │
  │                              GET /api/installer/manifest/{pkg}
  │                                        │  ← signed manifest + ops + checksums
  │                                        │
  │                                        ├─ download files (HTTPS, resume)
  │                                        ├─ verify sha256 per file
  │                                        ├─ verify manifest signature (Ed25519)
  │                                        ├─ backup affected files → %LOCALAPPDATA%
  │                                        ├─ apply WHITELISTED operations
  │                                        ├─ verify result
  │                                        └─ POST /api/installer/report (opt-in)
```

Fallback when the protocol handler does not answer in 3s: web shows
"Installer not detected" + `MANUAL DOWNLOAD` + download-the-installer CTA.

## 2. Manifest (served by API)

```jsonc
{
  "schemaVersion": 1,
  "packageId": "natural-vision",
  "version": "1.2.0",
  "game": "fivem",
  "name": "Natural Vision Enhanced",
  "publisher": "Razed",
  "sourceUrl": "https://…",
  "distributionPermission": "metadata_only",   // legal guard
  "files": [
    { "url": "https://cdn…/pack-1.2.0.zip", "sha256": "…", "sizeBytes": 104857600 }
  ],
  "operations": [
    { "op": "backup",   "targetPath": "mods/nve" },
    { "op": "extract",  "file": 0, "into": "mods/nve" },
    { "op": "copy_file","from": "mods/nve/stream/nve.ivft", "to": "mods/nve/stream/nve.ivft" },
    { "op": "verify",   "targetPath": "mods/nve/stream/nve.ivft", "sha256": "…" }
  ],
  "backup": true,
  "dependencies": [],
  "signature": "base64(ed25519(bodyWithoutSignature))",
  "issuedAt": "2026-09-22T00:00:00Z"
}
```

### Allowed operations (closed set)

`download`, `extract`, `copy_file`, `move_file`, `delete_file`, `ensure_dir`,
`backup`, `verify`, `write_text_file` (allow-listed target dirs only), `launch_hint`.

**There is no `exec`/`shell`/`script` operation.** Adding one requires a client
release, not a server change — that is the security boundary.

## 3. Safety requirements (non-negotiable)

| Control | Implementation |
|---|---|
| Transport | HTTPS only, certificate pinning optional in v2 |
| Manifest authenticity | Ed25519 signature, public key pinned in client |
| File integrity | sha256 per file; mismatch ⇒ abort + re-download once ⇒ fail |
| Path validation | resolve → must stay under allow-listed roots (FiveM app-data, pack dir); reject `..`, absolute paths, UNC, drive letters |
| Backup | before first mutation, copy originals to `%LOCALAPPDATA%\SHIVASS PACK\backup\{pkg}\{ts}\` |
| Rollback | restore from newest backup, transactional: journal written before each op |
| Logs | `%LOCALAPPDATA%\SHIVASS PACK\logs\install-*.log` (append, rotated) |
| Version control | client refuses manifest with `schemaVersion` it does not know |
| Corrupted download | size + sha256 check, resume support, retry with backoff |
| Least privilege | no admin rights required unless target path demands it |
| Concurrency | single-instance mutex per machine |

## 4. Client surfaces

- **Install**: browse / deep-link → progress per operation → success summary.
- **Installed Packs**: list from local journal (+ server sync when logged in).
  Actions: `REMOVE`, `REINSTALL`, `UPDATE`, `RESTORE BACKUP`.
- **Settings**: game path, bandwidth limit, auto-update check, logs folder, telemetry opt-in.
- **Trust**: show publisher, license, source URL, checksum before installing;
  `metadata_only` packs install nothing and link to official source instead.

## 5. Protocol

```
shivasspack://install/{packageId}            latest published version
shivasspack://install/{packageId}@1.2.0      pinned
shivasspack://uninstall/{packageId}
shivasspack://open                           open app
```
Windows: `HKCU\Software\Classes\shivasspack` (per-user, no elevation).

## 6. Server side

- `GET /api/installer/manifest/[packageId]` → published manifest, signed, cacheable 5 min.
- `POST /api/installer/report` → `{packageId, version, action, success, machineHash}`
  machineHash = salted hash of machine id (rotates monthly), rate-limited, opt-in.
- Admin UI (`/admin/installer`): edit operations with schema validation + preview,
  simulate (dry-run lint: path traversal, unknown op, missing checksum), publish,
  sign (signing key in env/secret store, never in repo), version history, rollback.

## 7. Threat model notes

- Server compromise ⇒ attacker could ship malicious manifest ⇒ **signing key
  separation + audit log + admin 2FA (v2)**; client pins key so a rogue server build
  is required to swap it.
- Malicious pack upload ⇒ never auto-installable: community submissions default to
  `metadata_only` and require admin approval + explicit manifest creation.
- Replay of old manifest ⇒ manifest carries `issuedAt` + version monotonicity check.
