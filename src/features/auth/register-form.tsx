"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { requestJson } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";
import { AuthShell, Field, buttonClassName, inputClassName } from "./auth-shell";

export function RegisterForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await requestJson("/api/auth/register", { body: { username, email, password } });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    toast.success("Hesabın oluşturuldu.");
    router.push("/");
    router.refresh();
  }

  return (
    <AuthShell
      title="Kayıt ol"
      subtitle="Topluluğa katılmak için ücretsiz bir hesap oluştur."
      footer={
        <>
          Zaten hesabın var mı?{" "}
          <Link href="/login" className="font-medium text-accent-400 hover:text-accent-300">
            Giriş yap
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Kullanıcı adı" htmlFor="username" hint="3-32 karakter; harf, rakam, - ve _">
          <input
            id="username"
            name="username"
            autoComplete="username"
            required
            minLength={3}
            maxLength={32}
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            className={inputClassName}
          />
        </Field>
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
        <Field label="Parola" htmlFor="password" hint="En az 10 karakter">
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
        {error ? (
          <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={pending} className={buttonClassName}>
          {pending ? "Hesap oluşturuluyor…" : "Kayıt ol"}
        </button>
        <p className="text-xs leading-relaxed text-zinc-600">
          Kayıt olarak topluluk kurallarını kabul etmiş olursun.
        </p>
      </form>
    </AuthShell>
  );
}
