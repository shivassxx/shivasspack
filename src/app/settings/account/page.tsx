import type { Metadata } from "next";
import { getDatabase } from "@/db/client";
import { requireCurrentSession } from "@/lib/auth-context";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { PasswordForm } from "@/features/settings/password-form";

export const metadata: Metadata = {
  title: "Hesap ayarları",
  alternates: { canonical: "/settings/account" },
  robots: { index: false, follow: false },
};

export default async function AccountSettingsPage() {
  const { actor } = await requireCurrentSession();
  const [user] = await getDatabase()
    .db.select({ email: schema.users.email, emailVerifiedAt: schema.users.emailVerifiedAt })
    .from(schema.users)
    .where(eq(schema.users.id, actor.id!));

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-line bg-surface-900 p-4">
        <p className="text-sm text-zinc-500">E-posta</p>
        <p className="mt-1 break-all text-sm text-white">{user?.email ?? "-"}</p>
        <p className="mt-3 text-xs text-zinc-600">
          Rolün: <span className="font-mono text-zinc-400">{actor.roleKey}</span>
          {user?.emailVerifiedAt
            ? " · E-posta doğrulanmış"
            : " · E-posta doğrulanmadı (doğrulama akışı henüz açık değil)"}
        </p>
      </div>
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-white">Parolayı değiştir</h2>
          <p className="text-sm text-zinc-500">
            Değişiklik sonrası diğer tüm oturumların otomatik olarak kapatılır.
          </p>
        </div>
        <PasswordForm />
      </section>
    </div>
  );
}
