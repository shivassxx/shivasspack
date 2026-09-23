export default function SettingsLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Ayarlar yükleniyor">
      <div className="skeleton h-5 w-40 rounded" />
      <div className="skeleton h-10 w-full max-w-lg rounded-md" />
      <div className="skeleton h-24 w-full max-w-lg rounded-md" />
      <span className="sr-only">Ayarlar yükleniyor…</span>
    </div>
  );
}
