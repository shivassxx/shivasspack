import Link from "next/link";
import { PageState, primaryActionClass, secondaryActionClass } from "@/components/ui/page-state";

export default function NotFound() {
  return (
    <PageState
      code="404"
      title="Bu sayfa bulunamadı"
      description="Bağlantı değişmiş, içerik kaldırılmış veya adres yanlış yazılmış olabilir."
    >
      <Link href="/" className={primaryActionClass}>Ana sayfaya dön</Link>
      <Link href="/guidelines" className={secondaryActionClass}>Topluluk kuralları</Link>
    </PageState>
  );
}
