import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Mail teslim katmanı.
 *
 * Üç taşıyıcı:
 * - `smtp`  : nodemailer ile gerçek gönderim
 * - `file`  : yerel geliştirme; `.mail/` altına `.eml` benzeri dosya yazar
 * - `none`  : teslimat kapalı (varsayılan production)
 *
 * `next/*` içermez; yapılandırmayı çağıran verir.
 */

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type MailConfig = {
  transport: "none" | "file" | "smtp";
  from: string;
  outboxDir: string;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    pass?: string;
  };
};

export class MailDeliveryError extends Error {
  readonly code = "MAIL_DELIVERY_FAILED";
}

/** Erişilebilirlik: dosya taşıyıcısı yerelde, SMTP production'da. */
export function resolveMailConfig(env: {
  NODE_ENV: string;
  MAIL_TRANSPORT?: string;
  MAIL_FROM?: string;
  MAIL_OUTBOX_DIR?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_SECURE?: boolean;
  SMTP_USER?: string;
  SMTP_PASS?: string;
}): MailConfig {
  const transport =
    env.MAIL_TRANSPORT === "smtp" || env.MAIL_TRANSPORT === "file" || env.MAIL_TRANSPORT === "none"
      ? env.MAIL_TRANSPORT
      : env.NODE_ENV === "production"
        ? "none"
        : "file";

  const config: MailConfig = {
    transport,
    from: env.MAIL_FROM?.trim() || "SHIVASS PACK <noreply@localhost>",
    outboxDir: env.MAIL_OUTBOX_DIR?.trim() || ".mail",
  };

  if (transport === "smtp") {
    if (!env.SMTP_HOST) throw new MailDeliveryError("SMTP_HOST is required when MAIL_TRANSPORT=smtp.");
    const port = env.SMTP_PORT && Number.isInteger(env.SMTP_PORT) ? env.SMTP_PORT : 587;
    config.smtp = {
      host: env.SMTP_HOST,
      port,
      // Port 465 varsayılan olarak implicit TLS kullanır.
      secure: env.SMTP_SECURE ?? port === 465,
      user: env.SMTP_USER || undefined,
      pass: env.SMTP_PASS || undefined,
    };
  }
  return config;
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._@-]+/g, "_").slice(0, 80);
}

/** Başarıda `undefined`, başarısızlıkta `MailDeliveryError` fırlatır. */
export async function deliverMail(config: MailConfig, message: MailMessage): Promise<void> {
  if (!message.to || !message.to.includes("@")) throw new MailDeliveryError("Recipient address is invalid.");
  if (message.text.length > 200_000) throw new MailDeliveryError("Message body is too large.");

  if (config.transport === "none") {
    throw new MailDeliveryError("Mail delivery is disabled (MAIL_TRANSPORT=none).");
  }

  if (config.transport === "file") {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${stamp}_${sanitizeFilePart(message.subject)}_${sanitizeFilePart(message.to)}.txt`;
    const header = [
      `From: ${config.from}`,
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      `Date: ${new Date().toUTCString()}`,
      "",
      "",
    ].join("\n");
    await mkdir(config.outboxDir, { recursive: true });
    await writeFile(path.join(config.outboxDir, fileName), header + message.text, { encoding: "utf8", mode: 0o600 });
    return;
  }

  const smtp = config.smtp;
  if (!smtp) throw new MailDeliveryError("SMTP configuration is missing.");
  try {
    // Ağırlık taşıyan bağımlılığı yalnızca gerçekten gönderirken yükle.
    const { default: nodemailer } = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });
    await transport.sendMail({ from: config.from, to: message.to, subject: message.subject, text: message.text });
  } catch (error) {
    if (error instanceof MailDeliveryError) throw error;
    // Nodemailer hataları sunucu/IP/credentials içerebilir: yalnızca türünü yay.
    throw new MailDeliveryError("SMTP delivery failed.");
  }
}

export function passwordResetMail(siteUrl: string, token: string): Omit<MailMessage, "to"> {
  return {
    subject: "SHIVASS PACK parola sıfırlama",
    text: [
      "Parolanızı sıfırlamak istediniz.",
      "",
      `Bağlantı: ${siteUrl}/reset-password?token=${encodeURIComponent(token)}`,
      "Bağlantı 15 dakika geçerlidir ve tek kullanımlıktır.",
      "Bu isteği siz yapmadıysanız bu e-postayı yok sayın; parolanız değişmedi.",
    ].join("\n"),
  };
}
