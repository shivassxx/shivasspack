import type { Metadata } from "next";
import { RegisterForm } from "@/features/auth/register-form";
import Link from "next/link";
import { getDatabase } from "@/db/client";
import { registrationEnabled } from "@/services/admin/settings";

export const metadata: Metadata = {
  title: "Kayıt ol",
  alternates: { canonical: "/register" },
  robots: { index: false, follow: false },
};

export default async function RegisterPage() {
  if (!(await registrationEnabled(getDatabase().db))) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-white">Yeni üyelikler şu anda kapalı</h1>
        <p className="mt-4 text-sm text-zinc-400">Mevcut hesabınla giriş yapabilirsin. Kayıtlar açıldığında bu sayfa yeniden kullanılabilir olacak.</p>
        <Link href="/login" className="mt-6 inline-block rounded-md bg-accent-600 px-5 py-2.5 text-sm font-medium text-white">Giriş yap</Link>
      </div>
    );
  }
  return <RegisterForm />;
}
