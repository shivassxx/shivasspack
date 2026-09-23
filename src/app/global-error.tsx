"use client";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="tr">
      <body style={{ margin: 0, background: "#09090b", color: "#e7e7ea", fontFamily: "system-ui, sans-serif" }}>
        <title>Beklenmeyen hata · SHIVASS PACK</title>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px", textAlign: "center" }}>
          <div style={{ maxWidth: "480px" }}>
            <p style={{ color: "#fb923c", fontSize: "12px", fontWeight: 700, letterSpacing: "0.2em" }}>KRİTİK HATA</p>
            <h1 style={{ color: "white", fontSize: "32px", margin: "12px 0" }}>Sayfa yüklenemedi</h1>
            <p style={{ color: "#a1a1aa", lineHeight: 1.6 }}>Uygulama kabuğu başlatılamadı. Yeniden deneyebilir veya ana sayfayı tekrar açabilirsin.</p>
            <button
              type="button"
              onClick={() => retry()}
              style={{ marginTop: "24px", border: 0, borderRadius: "6px", background: "#ea580c", color: "white", padding: "10px 16px", fontWeight: 600, cursor: "pointer" }}
            >
              Tekrar dene
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
