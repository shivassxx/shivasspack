import { z } from "zod";

// Explicit NEXT_PUBLIC access is required for Next.js build-time substitution.
export const publicEnv = {
  siteUrl: z
    .url({ protocol: /^https?$/ })
    .parse(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
} as const;
