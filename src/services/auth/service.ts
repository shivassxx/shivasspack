import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@/db/connection";
import * as s from "@/db/schema";
import { AuthorizationError } from "@/services/rbac";
import { hashPassword, isAcceptablePassword, verifyPassword } from "./password";
import { createSession, revokeAllSessions, type SessionContext, type SessionPayload } from "./session";
import { generateToken, hashToken } from "./token";

export type AuthErrorCode =
  | "invalid_credentials"
  | "account_inactive"
  | "account_banned"
  | "registrations_disabled"
  | "username_taken"
  | "email_taken"
  | "password_invalid"
  | "rate_limited"
  | "bad_request"
  | "token_invalid";

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;
  constructor(code: AuthErrorCode, message: string, status = 400) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}

export type RegisterInput = {
  username: string;
  email: string;
  password: string;
  displayName?: string;
};

export type LoginInput = {
  identifier: string;
  password: string;
};

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,31}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_IDENTIFIER_LENGTH = 254;
// Valid fixed-cost hash used when the identifier does not exist. It contains no credential.
const DUMMY_PASSWORD_HASH =
  "scrypt$16384$8$1$0ONpspiRV5u3FYx9iJwJSA==$bUoBPONIW2LgA/+pHj5fZDjYwHuNEP+D9LtZBAweessN4omAbd1cZzNo8tQDFcnXCd6dWGLNDTTDh5GOcRLU2g==";

function normalizeIdentifier(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().slice(0, MAX_IDENTIFIER_LENGTH);
}

export function validateRegisterInput(input: RegisterInput): RegisterInput {
  const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
  const email = normalizeIdentifier(input.email);
  if (!USERNAME_PATTERN.test(username)) {
    throw new AuthError("bad_request", "Kullanıcı adı 3-32 karakter olmalı.", 400);
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new AuthError("bad_request", "Geçerli bir e-posta girin.", 400);
  }
  if (!isAcceptablePassword(input.password)) {
    throw new AuthError("password_invalid", "Parola en az 10 karakter olmalı.", 400);
  }
  const displayName =
    typeof input.displayName === "string" && input.displayName.trim().length > 0
      ? input.displayName.trim().slice(0, 64)
      : username;
  return { username, email, password: input.password, displayName };
}

async function isRegistrationEnabled(db: Database): Promise<boolean> {
  const [flag] = await db
    .select({ enabled: s.featureFlags.enabled })
    .from(s.featureFlags)
    .where(eq(s.featureFlags.key, "registrations_enabled"));
  // Fail closed: a missing flag means registration stays off.
  return flag?.enabled === true;
}

/**
 * PostgreSQL hataları drizzle tarafından `cause` altına sarılır.
 * Constraint adları yalnızca kök hata mesajında geçer.
 */
function rootMessages(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current; depth += 1) {
    if (current instanceof Error) messages.push(current.message);
    current = (current as { cause?: unknown }).cause;
  }
  return messages.join(" ");
}

export async function register(
  db: Database,
  input: RegisterInput,
  context: SessionContext,
  ttlDays: number,
): Promise<SessionPayload & { userId: string }> {
  const clean = validateRegisterInput(input);
  if (!(await isRegistrationEnabled(db))) {
    throw new AuthError("registrations_disabled", "Kayıt geçici olarak kapalı.", 403);
  }

  const passwordHash = await hashPassword(clean.password);
  const [memberRole] = await db.select().from(s.roles).where(eq(s.roles.key, "member"));
  if (!memberRole) throw new Error("member role missing; run db:seed");

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(s.users)
        .values({
          username: clean.username,
          email: clean.email,
          displayName: clean.displayName!,
          passwordHash,
          roleId: memberRole.id,
          emailVerifiedAt: null,
        })
        .returning({ id: s.users.id });
      if (!row) throw new Error("insert returned no row");
      const session = await createSession(tx as unknown as Database, row.id, ttlDays, context);
      return { ...session, userId: row.id };
    });
  } catch (error) {
    const detail = rootMessages(error);
    if (detail.includes("users_username_unique") || detail.includes("users_username_format")) {
      throw new AuthError("username_taken", "Bu kullanıcı adı kullanılamaz.", 409);
    }
    if (detail.includes("users_email_unique")) {
      throw new AuthError("email_taken", "Bu e-posta zaten kayıtlı.", 409);
    }
    throw error;
  }
}

/**
 * Identifier may be username or e-mail. The returned error is intentionally
 * identical for unknown users and wrong passwords to avoid user enumeration.
 */
export async function login(
  db: Database,
  input: LoginInput,
  context: SessionContext,
  ttlDays: number,
): Promise<SessionPayload & { userId: string }> {
  const identifier = normalizeIdentifier(input.identifier);
  if (!identifier || typeof input.password !== "string" || input.password.length === 0) {
    throw new AuthError("invalid_credentials", "Kullanıcı adı veya parola hatalı.", 401);
  }

  const [user] = await db
    .select({
      id: s.users.id,
      passwordHash: s.users.passwordHash,
      status: s.users.status,
      banUntil: s.users.banUntil,
      roleKey: s.roles.key,
    })
    .from(s.users)
    .innerJoin(s.roles, eq(s.users.roleId, s.roles.id))
    .where(
      identifier.includes("@")
        ? eq(s.users.email, identifier)
        : eq(s.users.username, identifier),
    );

  // Always run a hash so timing does not reveal whether the account exists.
  const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !valid) {
    throw new AuthError("invalid_credentials", "Kullanıcı adı veya parola hatalı.", 401);
  }
  if (user.status !== "active") {
    throw new AuthError("account_inactive", "Hesap etkin değil.", 403);
  }
  if (user.banUntil && user.banUntil.getTime() > Date.now()) {
    throw new AuthError("account_banned", "Hesap askıya alındı.", 403);
  }

  return db.transaction(async (tx) => {
    const session = await createSession(tx as unknown as Database, user.id, ttlDays, context);
    await tx.update(s.users).set({ lastLoginAt: new Date() }).where(eq(s.users.id, user.id));
    return { ...session, userId: user.id };
  });
}

export async function changePassword(
  db: Database,
  userId: string,
  currentPassword: string,
  newPassword: string,
  options: { revokeOtherSessions?: boolean; currentSessionId?: string } = {},
): Promise<void> {
  const [user] = await db
    .select({ id: s.users.id, passwordHash: s.users.passwordHash, status: s.users.status })
    .from(s.users)
    .where(eq(s.users.id, userId));
  if (!user || user.status !== "active") {
    throw new AuthError("account_inactive", "Hesap etkin değil.", 403);
  }
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AuthError("invalid_credentials", "Mevcut parola hatalı.", 401);
  }
  if (!isAcceptablePassword(newPassword)) {
    throw new AuthError("password_invalid", "Yeni parola en az 10 karakter olmalı.", 400);
  }
  const hash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx.update(s.users).set({ passwordHash: hash }).where(eq(s.users.id, userId));
    // Password change invalidates every other device by default.
    if (options.revokeOtherSessions !== false) {
      await revokeAllSessions(tx as unknown as Database, userId, options.currentSessionId);
    }
  });
}

const RESET_TTL_MINUTES = 15;

/**
 * Always resolves without revealing whether the address exists. When the user
 * exists a single-use, hashed token row is created.
 */
export async function requestPasswordReset(
  db: Database,
  email: string,
): Promise<{ token: string | null }> {
  const normalized = normalizeIdentifier(email);
  if (!EMAIL_PATTERN.test(normalized)) return { token: null };

  const [user] = await db
    .select({ id: s.users.id, status: s.users.status })
    .from(s.users)
    .where(and(eq(s.users.email, normalized), isNull(s.users.banUntil)));
  if (!user || user.status !== "active") return { token: null };

  const token = generateToken();
  await db.transaction(async (tx) => {
    // Invalidate outstanding tokens so only the newest link works.
    await tx
      .update(s.passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(s.passwordResetTokens.userId, user.id), isNull(s.passwordResetTokens.usedAt)));
    await tx.insert(s.passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
    });
  });
  return { token };
}

/** Single-use consumption; the row is claimed in one transaction. */
export async function resetPasswordWithToken(
  db: Database,
  token: string,
  newPassword: string,
): Promise<void> {
  if (!token || token.length < 32) throw new AuthError("token_invalid", "Bağlantı geçersiz.", 400);
  if (!isAcceptablePassword(newPassword)) {
    throw new AuthError("password_invalid", "Parola en az 10 karakter olmalı.", 400);
  }
  const hash = hashToken(token);
  const passwordHash = await hashPassword(newPassword);

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: s.passwordResetTokens.id,
        userId: s.passwordResetTokens.userId,
        expiresAt: s.passwordResetTokens.expiresAt,
        usedAt: s.passwordResetTokens.usedAt,
        status: s.users.status,
      })
      .from(s.passwordResetTokens)
      .innerJoin(s.users, eq(s.users.id, s.passwordResetTokens.userId))
      .where(eq(s.passwordResetTokens.tokenHash, hash));
    if (!row) throw new AuthError("token_invalid", "Bağlantı geçersiz.", 400);
    if (row.usedAt) throw new AuthError("token_invalid", "Bağlantı kullanılmış.", 400);
    if (row.expiresAt.getTime() <= Date.now()) throw new AuthError("token_invalid", "Bağlantının süresi doldu.", 400);
    if (row.status !== "active") throw new AuthError("account_inactive", "Hesap etkin değil.", 403);

    const claimed = await tx
      .update(s.passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(s.passwordResetTokens.id, row.id), isNull(s.passwordResetTokens.usedAt)))
      .returning({ id: s.passwordResetTokens.id });
    if (claimed.length !== 1) throw new AuthError("token_invalid", "Bağlantı kullanılmış.", 400);

    await tx.update(s.users).set({ passwordHash }).where(eq(s.users.id, row.userId));
    // A reset always terminates existing sessions.
    await revokeAllSessions(tx as unknown as Database, row.userId);
  });
}

export function assertOwner(actorId: string | null, ownerId: string): void {
  if (actorId === null) throw new AuthorizationError("Sign in required.", 401, "unauthenticated");
  if (actorId !== ownerId) throw new AuthorizationError("Not your resource.");
}

export async function countActiveSessions(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(s.sessions)
    .where(and(eq(s.sessions.userId, userId), isNull(s.sessions.revokedAt), sql`${s.sessions.expiresAt} > now()`));
  return row?.value ?? 0;
}
