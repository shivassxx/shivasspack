"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { requestJson } from "@/lib/client-api";
import { safeNextPath } from "@/lib/session-cookie";
import { toast } from "@/components/ui/toaster";
import { AuthShell, Field, buttonClassName, inputClassName } from "./auth-shell";

function useNextTarget() {
  const params = useSearchParams();
  const raw = params.get("next");
  return safeNextPath(raw);
}

export function LoginForm() {
  const router = useRouter();
  const next = useNextTarget();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await requestJson<{ user: { id: string } }>("/api/auth/login", {
      body: { identifier, password },
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    toast.success("Giriş yapıldı.");
    router.push(next);
    router.refresh();
  }

  return (
    <AuthShell
      title="Giriş yap"
      subtitle="Hesabına erişmek için kullanıcı adı veya e-posta ile giriş yap."
      footer={
        <>
          Hesabın yok mu?{" "}
          <Link href="/register" className="font-medium text-accent-400 hover:text-accent-300">
            Kayıt ol
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Kullanıcı adı veya e-posta" htmlFor="identifier">
          <input
            id="identifier"
            name="identifier"
            autoComplete="username"
            required
            maxLength={254}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className={inputClassName}
          />
        </Field>
        <Field label="Parola" htmlFor="password">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
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
        <div className="flex items-center justify-between text-sm">
          <Link href="/forgot-password" className="text-zinc-500 transition hover:text-accent-400">
            Parolamı unuttum
          </Link>
        </div>
        <button type="submit" disabled={pending} className={buttonClassName}>
          {pending ? "Giriş yapılıyor…" : "Giriş yap"}
        </button>
      </form>
    </AuthShell>
  );
}
