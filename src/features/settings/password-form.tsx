"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";
import { Field, inputClassName } from "@/features/auth/auth-shell";

/** Parola değişimi sunucuda diğer tüm oturumları kapatır. */
export function PasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("Parolalar eşleşmiyor.");
      return;
    }
    setPending(true);
    const result = await requestJson("/api/auth/password/change", {
      body: { currentPassword, newPassword },
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    toast.success("Parola güncellendi; diğer oturumlar kapatıldı.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-4" noValidate>
      <Field label="Mevcut parola" htmlFor="currentPassword">
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          className={inputClassName}
        />
      </Field>
      <Field label="Yeni parola" htmlFor="newPassword" hint="En az 10 karakter">
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={200}
          value={newPassword}
          onChange={(e) => setNext(e.target.value)}
          className={inputClassName}
        />
      </Field>
      <Field label="Yeni parola (tekrar)" htmlFor="confirmPassword">
        <input
          id="confirmPassword"
          name="confirmPassword"
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
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Güncelleniyor…" : "Parolayı değiştir"}
      </button>
    </form>
  );
}
