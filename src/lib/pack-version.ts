import { SubmissionError } from "./submission-state";

/** Author-supplied fields for a new pack version row. */
export type PackVersionInput = {
  version?: unknown;
  downloadUrl?: unknown;
  fileSizeBytes?: unknown;
  checksumSha256?: unknown;
  changelog?: unknown;
};

export type PackVersionValues = {
  version: string;
  downloadUrl: string;
  fileSizeBytes: bigint | null;
  checksumSha256: string | null;
  changelog: string | null;
};

/** `1`, `1.2`, `1.2.3`, `1.2.3.4` with an optional `-pre.release` suffix. */
const VERSION_PATTERN = /^\d{1,6}(\.\d{1,6}){0,3}(-[0-9a-z][0-9a-z.-]{0,31})?$/;
const MAX_FILE_BYTES = 1_099_511_627_776n; // 1 TiB

function fail(message: string): never {
  throw new SubmissionError("validation", message, 400);
}

/**
 * Validates and normalizes one version payload.
 * Rejects malformed versions, non-http(s) targets, out-of-range sizes and
 * non-sha256 checksums before anything touches the database.
 */
export function validatePackVersion(input: PackVersionInput): PackVersionValues {
  const version = typeof input.version === "string" ? input.version.trim() : "";
  if (version.length > 40 || !VERSION_PATTERN.test(version)) {
    fail("Sürüm numarası biçim hatalı (örn. 1.0.0 veya 2.1.0-beta.1).");
  }

  const rawUrl = typeof input.downloadUrl === "string" ? input.downloadUrl.trim() : "";
  if (!rawUrl) fail("İndirme adresi zorunlu.");
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    fail("İndirme adresi http(s) olmalı.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    fail("İndirme adresi http(s) olmalı.");
  }
  const downloadUrl = parsed.href;
  if (downloadUrl.length > 2048) fail("İndirme adresi en fazla 2048 karakter olmalı.");

  let fileSizeBytes: bigint | null = null;
  const rawSize = input.fileSizeBytes;
  if (rawSize !== undefined && rawSize !== null && rawSize !== "") {
    let size: bigint;
    if (typeof rawSize === "bigint") {
      size = rawSize;
    } else if (typeof rawSize === "number") {
      if (!Number.isInteger(rawSize)) fail("Dosya boyutu 0 veya pozitif tam sayı olmalı.");
      size = BigInt(rawSize);
    } else if (typeof rawSize === "string") {
      try {
        size = BigInt(rawSize.trim());
      } catch {
        fail("Dosya boyutu 0 veya pozitif tam sayı olmalı.");
      }
    } else {
      fail("Dosya boyutu 0 veya pozitif tam sayı olmalı.");
    }
    if (size < 0n || size > MAX_FILE_BYTES) {
      fail("Dosya boyutu 0 ile 1 TiB arasında olmalı.");
    }
    fileSizeBytes = size;
  }

  const rawChecksum = typeof input.checksumSha256 === "string" ? input.checksumSha256.trim().toLowerCase() : "";
  const checksumSha256 = rawChecksum === "" ? null : rawChecksum;
  if (checksumSha256 !== null && !/^[a-f0-9]{64}$/.test(checksumSha256)) {
    fail("SHA-256 64 hexadecimal karakter olmalı.");
  }

  const rawLog = typeof input.changelog === "string" ? input.changelog.trim() : "";
  if (rawLog.length > 5000) fail("Değişiklik notu en fazla 5000 karakter olmalı.");

  return {
    version,
    downloadUrl,
    fileSizeBytes,
    checksumSha256,
    changelog: rawLog === "" ? null : rawLog,
  };
}
