import type { Metadata } from "next";
import { ProsePage, type ProseSection } from "@/components/ui/prose-page";

export const metadata: Metadata = {
  title: "Topluluk kuralları",
  description: "SHIVASS PACK topluluğunda güvenli ve yapıcı katılım için temel kurallar.",
  alternates: { canonical: "/guidelines" },
};

const sections: readonly ProseSection[] = [
  {
    title: "Saygılı iletişim",
    items: [
      "Hakaret, tehdit, taciz, nefret söylemi ve kişisel bilgi paylaşımı yasaktır.",
      "Eleştiriyi kişiye değil içeriğe yöneltin; spam ve tartışma sabote etmeye izin verilmez.",
      "Yardım isterken donanım, oyun sürümü ve uyguladığınız adımları açıkça belirtin.",
    ],
  },
  {
    title: "Güvenli içerik",
    items: [
      "Zararlı yazılım, gizlenmiş çalıştırılabilir dosya, kimlik bilgisi hırsızlığı veya yanıltıcı bağlantı paylaşmayın.",
      "Paket açıklamasında gereksinimleri, olası FPS etkisini ve kurulum/kaldırma adımlarını doğru yazın.",
      "Başkasına ait içeriği izin ve kaynak bilgisi olmadan yeniden dağıtmayın.",
    ],
  },
  {
    title: "Adil değerlendirme",
    paragraphs: [
      "Oy, yorum ve beğenileri manipüle etmeyin. Bir sorun bildirirken tekrar üretilebilir ayrıntı verin; kanıtsız suçlama veya toplu saldırı başlatmayın.",
    ],
  },
  {
    title: "Uygulama",
    paragraphs: [
      "İhlalin niteliğine göre içerik düzenlenebilir veya kaldırılabilir; hesap geçici ya da kalıcı olarak kısıtlanabilir. Ciddi güvenlik ve telif ihlallerinde önceden uyarı zorunlu değildir.",
    ],
  },
];

export default function GuidelinesPage() {
  return (
    <ProsePage
      eyebrow="Topluluk"
      title="Topluluk kuralları"
      description="Herkes için güvenli, yararlı ve şeffaf bir FiveM içerik topluluğu oluşturmak için."
      updatedAt="22 Eylül 2026"
      sections={sections}
    />
  );
}
