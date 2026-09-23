"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { requestJson } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";
import { AuthShell, Field, buttonClassName, inputClassName } from "./auth-shell";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const missingToken = token.length < 32;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Parolalar eşleşmiyor.");
      return;
    }
    setPending(true);
    const result = await requestJson("/api/auth/password/reset", { body: { token, password } });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    toast.success("Parolan güncellendi. Yeni parolanla giriş yapabilirsin.");
    router.push("/login");
    router.refresh();
  }

  return (
    <AuthShell
      title="Yeni parola belirle"
      subtitle="Bağlantının süresi dolduysa yeni bir tane iste."
      footer={
        <Link href="/forgot-password" className="text-accent-400 transition hover:text-accent-300">
          Yeni bağlantı iste
        </Link>
      }
    >
      {missingToken ? (
        <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
          Bağlantı geçersiz veya eksik. E-postadaki bağlantıyı aynen kullan.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Yeni parola" htmlFor="password" hint="En az 10 karakter">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={200}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClassName}
            />
          </Field>
          <Field label="Yeni parola (tekrar)" htmlFor="confirm">
            <input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={200}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClassName}
            />
          </Field>
          {error ? (
            <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={pending} className={buttonClassName}>
            {pending ? "Kaydediliyor…" : "Parolayı güncelle"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
