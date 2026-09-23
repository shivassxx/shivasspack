import { z } from "zod";
import { DEFAULT_SESSION_COOKIE_NAME } from "./session-cookie";

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.url().optional(),
);
/** Boş şablon değerlerini (`KEY=`) `undefined` kabul eden isteğe bağlı enum. */
const optionalBlankEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.enum(values).optional(),
  );

export const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // No shared fallback: an auth deployment must supply its own secret.
  SESSION_SECRET: z
    .string()
    .min(64)
    .regex(/^[a-f0-9]+$/i, "64+ hexadecimal characters required"),
  SESSION_COOKIE_NAME: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .default(DEFAULT_SESSION_COOKIE_NAME),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  REDIS_URL: optionalUrl,
  S3_ENDPOINT: optionalUrl,
  S3_REGION: z.string().min(1).default("auto"),
  S3_BUCKET: optionalText,
  S3_ACCESS_KEY: optionalText,
  S3_SECRET_KEY: optionalText,
  S3_PUBLIC_URL: optionalUrl,
  AI_PROVIDER: z.enum(["none", "openai", "anthropic", "gemini", "local"]).default("none"),
  AI_API_KEY: optionalText,
  INSTALLER_SIGNING_KEY: optionalText,
  CRON_SECRET: optionalText,
  // Mail: production'da açıkça yapılandırılana kadar teslim kapalı kalır
  // (resolveMailConfig `none` varsayımını uygular).
  MAIL_TRANSPORT: optionalBlankEnum(["none", "file", "smtp"]),
  MAIL_FROM: optionalText,
  MAIL_OUTBOX_DIR: optionalText,
  SMTP_HOST: optionalText,
  SMTP_PORT: z.preprocess(
    (value) => (value === "" || value === undefined || value === null ? undefined : value),
    z.coerce.number().int().min(1).max(65535).optional(),
  ),
  SMTP_SECURE: z
    .preprocess((value) => (value === "" || value === undefined ? undefined : value), z.enum(["true", "false"]).optional())
    .transform((value) => (value === undefined ? undefined : value === "true")),
  SMTP_USER: optionalText,
  SMTP_PASS: optionalText,
});

export type ServerEnv = z.infer<typeof serverSchema>;

export function parseServerEnv(input: Record<string, unknown>): ServerEnv {
  const parsed = serverSchema.safeParse(input);
  if (!parsed.success) {
    // Never print environment values (URLs can contain credentials).
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Geçersiz ortam değişkenleri:\n${issues}`);
  }
  return parsed.data;
}
