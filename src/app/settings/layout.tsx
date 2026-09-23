import { redirect } from "next/navigation";
import { requireCurrentSession, type CurrentSession } from "@/lib/auth-context";
import { SettingsNav } from "@/features/settings/settings-nav";

async function resolveSession(): Promise<CurrentSession> {
  try {
    return await requireCurrentSession();
  } catch {
    redirect("/login?next=/settings");
  }
}

/**
 * Tüm `/settings/*` sayfaları için gerçek oturum doğrulaması.
 * Middleware yalnızca çerez varlığına bakar; burası DB üzerinden doğrular.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await resolveSession();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Ayarlar</h1>
        <p className="text-sm text-zinc-500">
          {session.actor.roleKey === "guest" ? "Misafir" : session.actor.roleKey} olarak giriş yaptın.
        </p>
      </div>
      <SettingsNav />
      {children}
    </div>
  );
}
