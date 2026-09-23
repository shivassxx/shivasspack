"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/client-api";
import { toast } from "@/components/ui/toaster";
import { Field, inputClassName } from "@/features/auth/auth-shell";

type Profile = { displayName: string; bio: string | null };

export function ProfileForm({ initial }: { initial: Profile }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [bio, setBio] = useState(initial.bio ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await requestJson<{ profile: Profile }>("/api/profile", {
      method: "PATCH",
      body: { displayName, bio },
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    toast.success("Profil güncellendi.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-4" noValidate>
      <Field label="Görünen ad" htmlFor="displayName">
        <input
          id="displayName"
          name="displayName"
          required
          minLength={2}
          maxLength={64}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className={inputClassName}
        />
      </Field>
      <Field label="Biyografi" htmlFor="bio" hint={`${bio.length}/500 karakter`}>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          maxLength={500}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className={`${inputClassName} resize-y`}
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
        {pending ? "Kaydediliyor…" : "Kaydet"}
      </button>
    </form>
  );
}
