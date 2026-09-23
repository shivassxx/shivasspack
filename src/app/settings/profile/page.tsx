import type { Metadata } from "next";
import { getDatabase } from "@/db/client";
import { requireCurrentSession } from "@/lib/auth-context";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { ProfileForm } from "@/features/settings/profile-form";

export const metadata: Metadata = {
  title: "Profil ayarları",
  alternates: { canonical: "/settings/profile" },
  robots: { index: false, follow: false },
};

export default async function ProfileSettingsPage() {
  const { actor } = await requireCurrentSession();
  const [user] = await getDatabase()
    .db.select({
      displayName: schema.users.displayName,
      username: schema.users.username,
      bio: schema.users.bio,
    })
    .from(schema.users)
    .where(eq(schema.users.id, actor.id!));

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-line bg-surface-900 p-4">
        <p className="text-sm text-zinc-500">Kullanıcı adı</p>
        <p className="mt-1 font-mono text-sm text-white">@{user?.username ?? "-"}</p>
        <p className="mt-3 text-xs text-zinc-600">
          Kullanıcı adı kalıcıdır ve profil adresini belirler; bu aşamada değiştirilemez.
        </p>
      </div>
      <ProfileForm initial={{ displayName: user?.displayName ?? "", bio: user?.bio ?? null }} />
    </div>
  );
}
