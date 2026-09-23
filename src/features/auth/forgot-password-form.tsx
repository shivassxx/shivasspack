"use client";

import { useState } from "react";
import Link from "next/link";
import { requestJson } from "@/lib/client-api";
import { AuthShell, Field, buttonClassName, inputClassName } from "./auth-shell";

/**
 * Enumeration'a izin vermeyen akış: adres kayıtlı olmasa da aynı başarı mesajı gösterilir.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await requestJson("/api/auth/password/forgot", { body: { email } });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthShell title="E-posta gönderildi" subtitle="Kayıtlıysa parola sıfırlama bağlantısı yolda.">
        <p className="rounded-md border border-line bg-surface-950 px-3 py-2.5 text-sm text-zinc-400">
          Bağlantı 15 dakika geçerlidir ve tek kullanımlıktır. E-posta gelmez gereksiz klasörünü kontrol et.
        </p>
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => setSent(false)}
            className="text-zinc-500 transition hover:text-accent-400"
          >
            Tekrar dene
          </button>
          <Link href="/login" className="text-accent-400 transition hover:text-accent-300">
            Giriş sayfasına dön
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Parolanı sıfırla"
      subtitle="E-posta adresini gir; sana tek kullanımlık bir bağlantı gönderelim."
      footer={
        <Link href="/login" className="text-accent-400 transition hover:text-accent-300">
          Giriş sayfasına dön
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="E-posta" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClassName}
          />
        </Field>
        {error ? (
          <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={pending} className={buttonClassName}>
          {pending ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
        </button>
      </form>
    </AuthShell>
  );
}
