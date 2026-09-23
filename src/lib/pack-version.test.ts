import { describe, expect, it } from "vitest";
import { validatePackVersion } from "./pack-version";

const base = { version: "1.0.0", downloadUrl: "https://files.example.invalid/pack.zip" };

describe("validatePackVersion", () => {
  it("accepts plain and pre-release versions and normalizes the rest", () => {
    expect(validatePackVersion(base)).toEqual({
      version: "1.0.0",
      downloadUrl: "https://files.example.invalid/pack.zip",
      fileSizeBytes: null,
      checksumSha256: null,
      changelog: null,
    });
    expect(validatePackVersion({ ...base, version: " 2.1.0-beta.1 " }).version).toBe("2.1.0-beta.1");
    expect(validatePackVersion({ ...base, version: "12" }).version).toBe("12");
    expect(validatePackVersion({ ...base, version: "1.2.3.4" }).version).toBe("1.2.3.4");
    expect(validatePackVersion({ ...base, fileSizeBytes: "2048" }).fileSizeBytes).toBe(2048n);
    expect(validatePackVersion({ ...base, fileSizeBytes: "" }).fileSizeBytes).toBeNull();
    expect(validatePackVersion({ ...base, fileSizeBytes: 1024 }).fileSizeBytes).toBe(1024n);
    expect(validatePackVersion({ ...base, checksumSha256: "A".repeat(64) }).checksumSha256).toBe("a".repeat(64));
    expect(validatePackVersion({ ...base, changelog: "  notes  " }).changelog).toBe("notes");
    expect(validatePackVersion({ ...base, changelog: "" }).changelog).toBeNull();
    expect(validatePackVersion({ ...base, downloadUrl: "HTTP://EXAMPLE.com/a.zip" }).downloadUrl)
      .toBe("http://example.com/a.zip");
  });

  it("rejects malformed versions", () => {
    for (const version of ["abc", "v1.0", "1.2.3.4.5", "1..0", "1.0.0-", "", "9999999999"]) {
      expect(() => validatePackVersion({ ...base, version })).toThrow(/biçim hatalı|en fazla 40/);
    }
    expect(validatePackVersion({ ...base, version: " 1.0.0 " }).version).toBe("1.0.0");
    expect(() => validatePackVersion({ downloadUrl: base.downloadUrl })).toThrow(/biçim hatalı/);
  });

  it("requires an http(s) download target", () => {
    expect(() => validatePackVersion({ ...base, downloadUrl: "" })).toThrow(/zorunlu/);
    expect(() => validatePackVersion({ ...base, downloadUrl: "ftp://x/y.zip" })).toThrow(/http/);
    expect(() => validatePackVersion({ ...base, downloadUrl: "not a url" })).toThrow(/http/);
    expect(() => validatePackVersion({ ...base, downloadUrl: "javascript:alert(1)" })).toThrow(/http/);
  });

  it("rejects out-of-range sizes and bad checksums", () => {
    expect(() => validatePackVersion({ ...base, fileSizeBytes: "-5" })).toThrow(/tam sayı|arasında/);
    expect(() => validatePackVersion({ ...base, fileSizeBytes: "1.5" })).toThrow(/tam sayı/);
    expect(() => validatePackVersion({ ...base, fileSizeBytes: "abc" })).toThrow(/tam sayı/);
    expect(() => validatePackVersion({ ...base, fileSizeBytes: (2n ** 41n).toString() })).toThrow(/arasında/);
    expect(() => validatePackVersion({ ...base, checksumSha256: "zz" })).toThrow(/64 hexadecimal/);
    expect(() => validatePackVersion({ ...base, checksumSha256: "a".repeat(63) })).toThrow(/64 hexadecimal/);
    expect(() => validatePackVersion({ ...base, changelog: "x".repeat(5001) })).toThrow(/5000/);
  });
});
