"use client";

/**
 * İstemci tarafı API köprüsü.
 * Hata mesajını sunucudaki `error.message` alanından çeker; alan yoksa genel mesaj.
 */
export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string; message: string };

export async function requestJson<T = unknown>(
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      method: init.method ?? "POST",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
      cache: "no-store",
    });

    if (response.status === 204) return { ok: true, status: 204, data: undefined as T };

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const errorNode =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as { error?: unknown }).error
        : null;
    if (!response.ok) {
      const message =
        errorNode && typeof errorNode === "object" && "message" in errorNode
          ? String((errorNode as { message: unknown }).message)
          : "Bir şeyler ters gitti. Lütfen tekrar deneyin.";
      const code =
        errorNode && typeof errorNode === "object" && "code" in errorNode
          ? String((errorNode as { code: unknown }).code)
          : "error";
      return { ok: false, status: response.status, code, message };
    }
    return { ok: true, status: response.status, data: payload as T };
  } catch {
    return { ok: false, status: 0, code: "network", message: "Sunucuya ulaşılamadı." };
  }
}
