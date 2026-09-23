import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deliverMail,
  MailDeliveryError,
  passwordResetMail,
  resolveMailConfig,
} from "./service";

const base = { NODE_ENV: "development", MAIL_FROM: "SHIVASS PACK <noreply@example.test>" };
const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("mail configuration", () => {
  it("defaults to the local file outbox outside production", () => {
    expect(resolveMailConfig(base).transport).toBe("file");
  });

  it("defaults to disabled in production so SMTP must be explicit", () => {
    expect(resolveMailConfig({ NODE_ENV: "production" }).transport).toBe("none");
    expect(() => resolveMailConfig({ NODE_ENV: "production", MAIL_TRANSPORT: "smtp" })).toThrowError(
      MailDeliveryError,
    );
  });

  it("enables SMTP when host is provided", () => {
    const config = resolveMailConfig({ ...base, MAIL_TRANSPORT: "smtp", SMTP_HOST: "mail.example.test" });
    expect(config.transport).toBe("smtp");
    expect(config.smtp?.port).toBe(587);
    expect(config.smtp?.secure).toBe(false);
    expect(resolveMailConfig({ ...base, MAIL_TRANSPORT: "smtp", SMTP_HOST: "h", SMTP_PORT: 465 }).smtp?.secure).toBe(
      true,
    );
  });
});

describe("mail delivery", () => {
  it("writes a message to the local outbox without the raw recipient in the body", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "shivass-mail-"));
    cleanup.push(dir);
    const config = resolveMailConfig({ ...base, MAIL_OUTBOX_DIR: dir });
    await deliverMail(config, { to: "user@example.test", subject: "Test konu", text: "İçerik" });
    const files = await import("node:fs/promises").then((fs) => fs.readdir(dir));
    expect(files).toHaveLength(1);
    const content = await readFile(path.join(dir, files[0]!), "utf8");
    expect(content).toContain("Subject: Test konu");
    expect(content).toContain("İçerik");
  });

  it("refuses delivery when transport is disabled", async () => {
    const config = resolveMailConfig({ NODE_ENV: "production" });
    await expect(
      deliverMail(config, { to: "user@example.test", subject: "x", text: "y" }),
    ).rejects.toBeInstanceOf(MailDeliveryError);
  });

  it("rejects invalid recipients and oversized bodies", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "shivass-mail-"));
    cleanup.push(dir);
    const config = resolveMailConfig({ ...base, MAIL_OUTBOX_DIR: dir });
    await expect(deliverMail(config, { to: "", subject: "x", text: "y" })).rejects.toBeInstanceOf(
      MailDeliveryError,
    );
    await expect(
      deliverMail(config, { to: "a@b.co", subject: "x", text: "y".repeat(300_000) }),
    ).rejects.toBeInstanceOf(MailDeliveryError);
  });

  it("builds a reset message with a same-origin absolute link and no secrets", () => {
    const mail = passwordResetMail("https://example.test", "token-value");
    expect(mail.subject).toContain("SHIVASS PACK");
    expect(mail.text).toContain("https://example.test/reset-password?token=token-value");
    expect(mail.text).toContain("15 dakika");
    expect(mail.text).not.toContain(SESSION_SECRET_PLACEHOLDER);
  });
});

// Paranın e-postaya asla girmemesi için sabit sahte değer.
const SESSION_SECRET_PLACEHOLDER = "should-not-appear";
