import type { ProseSection } from "@/components/ui/prose-page";

export type LegalDocument = {
  slug: "privacy" | "terms" | "dmca";
  title: string;
  description: string;
  sections: readonly ProseSection[];
};

export const legalDocuments: readonly LegalDocument[] = [
  {
    slug: "privacy",
    title: "Gizlilik bildirimi",
    description: "Platformun hangi verileri neden işlediğini ve hesap güvenliğinin nasıl sağlandığını açıklar.",
    sections: [
      {
        title: "Toplanan veriler",
        items: [
          "Hesap oluşturulduğunda kullanıcı adı, görünen ad ve e-posta adresi.",
          "Parolanın kendisi değil, scrypt ile üretilmiş tek yönlü parola özeti.",
          "Oturum güvenliği için sınırlı kullanıcı aracısı, IP adresi, başlangıç ve sona erme zamanı.",
          "Kullanıcı tarafından gönderilen profil, paket, forum ve etkileşim içerikleri.",
        ],
      },
      {
        title: "Kullanım amaçları",
        paragraphs: [
          "Veriler hesabı çalıştırmak, yetki ve oturum güvenliğini sağlamak, kötüye kullanımı sınırlamak ve kullanıcı tarafından istenen topluluk özelliklerini sunmak için işlenir.",
          "Rate-limit anahtarları veritabanına ham IP veya e-posta yerine SHA-256 özeti olarak yazılır. Parola sıfırlama tokenları da yalnızca özet halinde saklanır.",
        ],
      },
      {
        title: "Saklama ve paylaşım",
        paragraphs: [
          "Aktif hesap ve kullanıcı içerikleri hizmet sürdüğü müddetçe tutulabilir. Süresi dolan veya iptal edilen oturumlar operasyonel saklama süresi sonunda temizlenebilir.",
          "E-posta teslimi, dosya depolama veya altyapı sağlayıcısı yapılandırıldığında yalnızca hizmet için gerekli veriler ilgili sağlayıcıya aktarılır. Veriler reklam amacıyla satılmaz.",
        ],
      },
      {
        title: "Tercihler ve güvenlik",
        paragraphs: [
          "Kullanıcılar ayarlar bölümünden profil bilgilerini değiştirebilir, aktif cihazları görebilir ve oturumları kapatabilir. Hesapla ilgili erişim veya silme talepleri platform operatörünün yayımladığı iletişim kanalı üzerinden iletilebilir.",
        ],
      },
    ],
  },
  {
    slug: "terms",
    title: "Kullanım koşulları",
    description: "SHIVASS PACK topluluk platformunu kullanırken geçerli temel kuralları açıklar.",
    sections: [
      {
        title: "Hesap sorumluluğu",
        items: [
          "Doğru ve size ait bir e-posta adresi kullanın; hesabınızın güvenliğinden siz sorumlusunuz.",
          "Oturum veya hesap erişimini kötüye kullanmayın, otomatik saldırı ya da hizmet engelleme girişiminde bulunmayın.",
          "Askıya alma veya moderasyon önlemlerini yeni hesaplarla aşmaya çalışmayın.",
        ],
      },
      {
        title: "İçerik ve dağıtım hakları",
        paragraphs: [
          "Yalnızca paylaşma ve dağıtma hakkına sahip olduğunuz içerikleri gönderin. Üçüncü taraf çalışmalarında kaynak, lisans ve izin durumunu doğru belirtin.",
          "Platformda listelenmek, bir paket için sahiplik veya güvenlik garantisi oluşturmaz. İndirme ve kurulumdan önce açıklamaları, izin durumunu ve performans notlarını inceleyin.",
        ],
      },
      {
        title: "Moderasyon",
        paragraphs: [
          "Kuralları ihlal eden içerikler kaldırılabilir; hesaplar geçici veya kalıcı olarak kısıtlanabilir. Güvenlik, telif ve topluluk bütünlüğü için kayıtlar incelenebilir.",
        ],
      },
      {
        title: "Bağımsızlık ve sorumluluk",
        paragraphs: [
          "SHIVASS PACK; FiveM, Cfx.re veya Rockstar Games tarafından işletilmez ya da desteklenmez. Hizmet ve içerikler mevcut haliyle sunulur; üçüncü taraf yazılımlarından doğan kayıplar için garanti verilmez.",
        ],
      },
    ],
  },
  {
    slug: "dmca",
    title: "Telif ve kaldırma bildirimi",
    description: "Hak sahiplerinin izinsiz içerikleri bildirmesi ve içerik sahiplerinin yanıt vermesi için süreç.",
    sections: [
      {
        title: "Geçerli bildirim",
        items: [
          "Hak sahibinin veya yetkili temsilcisinin adı ve güvenli iletişim bilgisi.",
          "Korunan eserin ve ihlal ettiği düşünülen platform içeriğinin açık tanımı ile URL'si.",
          "Kullanımın hak sahibi, temsilci veya hukuk tarafından yetkilendirilmediğine dair iyi niyet beyanı.",
          "Bildirimdeki bilgilerin doğru olduğuna ve başvuranın yetkili olduğuna dair beyan.",
        ],
      },
      {
        title: "İnceleme süreci",
        paragraphs: [
          "Bildirim platform operatörünün yayımladığı iletişim kanalına gönderilir. Eksik bildirimler için ek bilgi istenebilir. Açık ve doğrulanabilir ihlaller incelenirken içerik geçici olarak erişimden kaldırılabilir.",
        ],
      },
      {
        title: "Karşı bildirim",
        paragraphs: [
          "İçerik sahibi kaldırmanın hata olduğunu düşünüyorsa izin veya lisans kanıtıyla karşı bildirim sunabilir. Tarafların haklarını belirleyen nihai merci platform değil, ilgili hukuk düzenidir.",
        ],
      },
      {
        title: "Kötüye kullanım",
        paragraphs: [
          "Yanıltıcı, sahte veya misilleme amacı taşıyan telif bildirimleri reddedilebilir ve hesap yaptırımıyla sonuçlanabilir.",
        ],
      },
    ],
  },
] as const;

export function getLegalDocument(slug: string): LegalDocument | undefined {
  return legalDocuments.find((document) => document.slug === slug);
}
