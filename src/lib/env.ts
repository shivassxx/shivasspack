import "server-only";
import { parseServerEnv, type ServerEnv } from "./env-schema";

export type { ServerEnv } from "./env-schema";

let cached: ServerEnv | null = null;

/** Sunucu tarafında ortam değişkenlerini doğrular ve önbelleğe alır. */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  cached = parseServerEnv(process.env);
  return cached;
}

export const isProd = process.env.NODE_ENV === "production";
export const isDev = process.env.NODE_ENV === "development";
