import { publicEnv } from "./public-env";

export const siteConfig = {
  name: "SHIVASS PACK",
  tagline: "FiveM grafik, PvP ve performans paketleri",
  description:
    "FiveM için seçilmiş grafik paketleri, PvP ayarları, ReShade ve ENB preset'leri. Yayındaki paketlerin performans etkisini ve uyumluluk bilgilerini inceleyin.",
  url: publicEnv.siteUrl,
  links: {
    github: "https://github.com",
    discord: "https://discord.com",
  },
} as const;

export type SiteConfig = typeof siteConfig;
