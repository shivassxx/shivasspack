# SHIVASS PACK

FiveM grafik, PvP, ReShade ve ENB içerikleri için geliştirilen Next.js platformu.

## Mevcut durum

Mevcut uygulama statik ana sayfa, header/footer, mobil menü, arama yönlendirmesi ve
toast altyapısını içerir. Drizzle ile 41 tablolu V1 schema, migration, seed,
kısıtlı DB rolü ve `/api/health` uygulanmıştır. Auth, paket liste/detay, ürün
API'leri, admin, forum ve installer henüz uygulanmadı. Bu sayfalara giden
bağlantılar henüz işlevsel değildir; tablo bulunması ürün özelliğinin bittiği anlamına gelmez.
V1 tasarımı `docs/` içindedir; dokümanlar tamamlanmış özellik listesi değildir.

## Gereksinimler

- Node.js **24.21.0** önerilir; desteklenen aralık **24.15+ / 24.x**.
- npm **11.x**; `.npmrc` uyumsuz Node/npm ile kurulumu reddeder.
- Database aşamasından itibaren PostgreSQL (yerel ortam 18.6, Compose 17).
- `next/font/google` fontları build sırasında indirdiği için ilk build'de ağ erişimi.

Windows'taki bu makinede Node 24 `C:\tools\nodejs` altında; varsayılan PATH eski
Node 18'e gidebilir. PowerShell oturumunda:

```powershell
$env:Path = 'C:\tools\nodejs;' + $env:Path
node -v
npm -v
npm ci --include=optional
npm run dev
```

Diğer ortamlarda `.nvmrc` / `.node-version` kullanarak Node sürümünü seçin ve aynı
`npm ci --include=optional` komutunu çalıştırın. Uygulama: <http://localhost:3000>.

## Environment

İlk yerel kurulumda `.env.example` dosyasını `.env` olarak kopyalayın. Mevcut bir
`.env` varsa üzerine yazmayın. Gerçek DB erişim bilgilerinizi yalnızca bu yerel
dosyada tutun. `SESSION_SECRET` için:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

- Public URL: **`NEXT_PUBLIC_SITE_URL`**. Build sırasında gömülür; değişince yeniden build gerekir.
- Server secret: **`SESSION_SECRET`**; en az 64 hex karakter, ortak fallback yok.
- PostgreSQL: **`DATABASE_URL`**; özel karakterleri URL-encode edin. Prisma'ya özgü `?schema=public` kullanılmaz.
- Opsiyonel entegrasyonlar: `REDIS_URL`, `S3_*`, `AI_PROVIDER`, `AI_API_KEY`,
  `INSTALLER_SIGNING_KEY`, `CRON_SECRET`. Boş alanlar `undefined` olarak kabul edilir.
- Eski `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `STORAGE_*` adları kullanılmaz.

Statik ana sayfanın build'i DB bağlantısı veya server secret gerektirmez.
`src/lib/env.ts` server-only sınırıyla korunur; `getServerEnv()` çağrıldığında
server ayarlarını doğrular. DB bağlantı katmanı bu giriş noktasını kullanır.
Public ayarlar ayrı `src/lib/public-env.ts` modülündedir.
Opsiyonel entegrasyonların kendi kimlik bilgisi gereksinimleri ilgili fazda doğrulanacaktır.

## Kontroller

```sh
npm run check
```

Sırasıyla route tiplerini üretir, TypeScript, ESLint, Vitest ve production build
çalıştırır. `npm test` environment ve health HTTP sözleşmesini DB gerektirmeden test eder.
`npm run db:test` gerçek PostgreSQL üzerinde kısıtları, yetkileri, seed tekrarını
ve FTS'yi doğrular. Test kayıtları ve ayar değişiklikleri transaction sonunda geri alınır.
`npm run format:check` ayrı biçim kontrolüdür; eski dosyalarda mevcut biçim farkları
bulunabilir. `npm run format` bütün projeyi değiştireceği için kontrollü kullanın.

CI temel kontrolleri Ubuntu ve Windows üzerinde; DB kontrollerini ayrıca
PostgreSQL 17 service container ile Ubuntu üzerinde çalıştırır. GitHub'da workflow'un
çalışması için projenin bir Git deposuna eklenip gönderilmesi gerekir.

### Eksik native dependency hatası

Tailwind Oxide veya Rolldown binding hatası alırsanız önce Node sürümünü doğrulayın,
dev/build süreçlerini durdurun, ardından **lock dosyasını koruyarak**:

```sh
npm ci --include=optional
```

Bu komut `node_modules` kurulumunu lock dosyasından yeniden oluşturur. Farklı
işletim sistemlerinden `node_modules` kopyalamayın. Windows'a özel paketleri
uygulamanın doğrudan bağımlılıklarına eklemek gerekmez.

## Production / Docker

Normal yerel production kontrolü:

```sh
npm run build
npm run start
```

`npm start`, `.env` ve varsa `.env.local` dosyalarını yükler, statik dosyaları
standalone dizinine kopyalar ve standalone sunucusunu başlatır. Shell environment
değerleri önceliklidir. Port/adres için `PORT` ve `HOSTNAME` kullanın.
Docker image Next.js **standalone** çıktısını `node server.js` ile çalıştırır.
Docker build public URL'yi build argument olarak alır; server sırları build'e verilmez.

Compose için `.env` içinde `SESSION_SECRET`, bootstrap `POSTGRES_PASSWORD` ve
uygulama rolüne ait `POSTGRES_APP_PASSWORD` gerekir. Hepsi ayrı rastgele değerler
olmalıdır; URL içinde kullanılacak parolalar için hex üretin.
Önce DB'yi başlatıp aşağıdaki database adımlarını host üzerinden uygulayın:

```sh
docker compose up -d db
# db:provision, db:migrate, db:seed adımlarını tamamlayın
docker compose up --build
```

Host'taki admin URL, Compose bootstrap kullanıcısı `shivass` ile 127.0.0.1:5432'ye
bağlanır. Host `.env` içindeki `DATABASE_URL` yine 127.0.0.1 kullanır. App container
aynı `shivass_app` parolasını `POSTGRES_APP_PASSWORD` üzerinden `db:5432` için kullanır.
Migration/admin erişim bilgileri app container'a verilmez. Healthcheck readiness
endpoint'ini sorgular; migration yapılmamış DB ile uygulama sağlıklı sayılmaz.

Redis opsiyoneldir. Kullanılacağı aşamada `.env` içine `REDIS_URL=redis://redis:6379`
yazıp `docker compose --profile redis up --build` çalıştırın. Redis entegrasyonu
henüz uygulamada yoktur. Mevcut yerel PostgreSQL 5432 portunu kullanıyorsa Compose
DB host portunu değiştirin veya yerel sunucuyu durdurun.

Mevcut Docker volume'un parolasını `.env` değiştirmek tek başına değiştirmez.
Bu makinede Docker bulunmadığından container build/runtime ayrıca doğrulanmalıdır.

## Database kurulumu ve migration

Üç ayrı erişim düzeyi vardır:

| Erişim                                        | Nerede tutulur                                | Kullanım                                                                            |
| --------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `DATABASE_URL` / `shivass_app`                | `.env` veya runtime secret                    | SELECT/INSERT/UPDATE/DELETE; DDL yok; audit/event geçmişinde yalnızca SELECT/INSERT |
| `DATABASE_MIGRATION_URL` / `shivass_migrator` | `.env.migrations` veya CI secret              | Schema sahibi; migration ve seed; superuser değil                                   |
| `DATABASE_ADMIN_URL` / operatör rolü          | Yalnızca provisioning komutunun environment'ı | Var olan DB'de deployment rollerini oluşturma; uygulamaya aktarılmaz                |

1. PostgreSQL'de uygulamaya ayrılmış `shivasspack` veritabanını oluşturun. Bu makinede zaten var.
2. `.env.example` → `.env`, `.env.migrations.example` → `.env.migrations` kopyalayın;
   mevcut dosyaların üzerine yazmayın. İki role ayrı rastgele en az 32 karakterlik
   parola ve uygulamaya ayrı `SESSION_SECRET` üretin. Parolaları URL-encode edin.
3. Aynı DB'yi hedefleyen admin URL'yi yalnızca o terminal oturumuna verin:

```powershell
$env:DATABASE_ADMIN_URL = 'postgresql://postgres:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5432/shivasspack'
npm run db:provision
Remove-Item Env:DATABASE_ADMIN_URL
npm run db:migrate
npm run db:seed
# Yalnızca geliştirme için isteğe bağlı:
npm run db:seed -- --demo
npm run db:test
```

Provisioning mevcut rol parolalarını değiştirmez; ayrıcalıklı veya başka role üye
mevcut deployment rollerini reddeder. `public` schema üzerinde PUBLIC CREATE
kaldırılır; bunun için paylaşılan değil uygulamaya ayrılmış DB kullanın.
Migration komutu advisory lock kullanır, Drizzle journal ile tekrar uygulanmayı
önler ve sonunda app grant'lerini transaction içinde düzenler. `drizzle-kit push`
ve doğrudan `drizzle-kit migrate` yerine `npm run db:migrate` kullanın.
Migration dosyaları/snapshot'ları `drizzle/` altında sürüm kontrolüne alınmalıdır.
Yeni schema değişikliği: `npm run db:generate -- --name=change_name`, SQL'i incele,
sonra `npm run db:migrate`. Uygulanmış migration dosyasını düzenlemeyin.
`npm run db:studio` migration rolünün yetkileriyle açılır; yalnızca geliştirme/operasyon içindir.

Seed varsayılan olarak 7 rol, permission'lar, 7 paket kategorisi ve başlangıç
ayarlarını ekler. **Admin kullanıcı/parolası oluşturmaz.** Tekrar çalıştırma mevcut
kayıtları, özelleştirilmiş rol izinlerini ve ayarları ezmez. `--demo` dört taslak
paket, sürümleri, gizli forum örneği ve taslak haber ekler; `is_demo=true` ve
`[DEMO]` metniyle işaretlidir. Demo kullanıcı suspended ve parolasızdır; indirilebilir
dosya yoktur. `NODE_ENV=production` ortamında `--demo` reddedilir.

### Health

- `GET /api/health` veya `?mode=ready`: uygulama DB rolüyle tablo okuması başarılıysa
  `200 {"status":"ok","database":"up"}`, aksi halde `503`.
- `GET /api/health?mode=live`: DB'ye bağlanmadan `200`.
- Bilinmeyen mode `400`; yanıtlar `Cache-Control: no-store` taşır, hata/credential ayrıntısı içermez.
- Readiness `roles` tablosunu kontrol eder; tüm ürün modüllerinin hazır olduğu anlamına gelmez.

## Kimlik ve parola sıfırlama postaları

Kayıt, giriş, çıkış, profil/hesap ayarları ve cihaz oturumları DB servislerine bağlıdır.
Seed `registrations_enabled` bayrağını kapalı oluşturur; yerel doğrulama ortamında
bu bayrak açık tutulmuştur. Parola sıfırlama bağlantısı 15 dakika geçerli ve tek
kullanımlıktır; başarılı sıfırlama mevcut oturumları iptal eder.

Yerel geliştirme için `.env`:

```dotenv
MAIL_TRANSPORT=file
MAIL_OUTBOX_DIR=.mail
```

`npm start`, göreli outbox yolunu standalone sunucu çalışma dizinini değiştirmeden
önce mutlak yola çevirir. Böylece varsayılan posta konumu proje kökündeki `.mail/`
olur. `npm run dev` de proje köküne yazar. Dosya taşıyıcısı gerçek posta kutusuna
göndermez. Outbox Git/Docker kapsamı dışındadır; sıfırlama bağlantıları içerir.

Gerçek gönderim için `MAIL_TRANSPORT=smtp`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`
ve gerekiyorsa `SMTP_USER`/`SMTP_PASS` tanımlayın. Port 465 için varsayılan TLS açık,
587 için STARTTLS kullanılabilir; `SMTP_SECURE=true/false` açıkça ayarlanabilir.
Bağlantının site adresi `NEXT_PUBLIC_SITE_URL` değeridir (build sırasında gömülür).
Docker'da SMTP değişkenleri ayrıca runtime environment'a aktarılmalıdır; dosya
taşıyıcısı kullanılıyorsa mutlak ve kalıcı bir outbox dizini verin.

Taşıyıcı belirtilmezse development'ta `file`, production'da `none` kullanılır.
Forgot endpoint'i hesap varlığını açığa çıkarmamak için teslimat hatasında da aynı
yanıtı verir; gerçek teslimat server log/outbox üzerinden izlenir. Yerel dosya
teslimi ve bağlantının kullanımı doğrulandı; gerçek SMTP teslimi henüz doğrulanmadı.

## Yapı ve kararlar

- `src/app`: Next.js App Router.
- `src/features/layout`: mevcut site kabuğu.
- `src/components/ui`: ortak UI (şu anda toaster).
- `src/lib`: environment, site config, yardımcılar.
- `src/db`: 41 tablolu schema, bağlantı, migration, seed ve DB entegrasyon testleri.
- `src/services`: Next.js'ten bağımsız health, auth/session, RBAC, rate-limit ve mail servisleri.
- `drizzle`: SQL migration ve snapshot/journal.
- `src/styles`: Tailwind tema/stiller.
- `docs`: V1 mimari ve sözleşmeleri.

ORM **Drizzle + postgres.js**. Yerel kurulum PostgreSQL 18.6 üzerinde doğrulandı.
Eski PostgreSQL operatör hesabının parolası değiştirilmedi; uygulama artık ayrı,
kısıtlı `shivass_app` rolüne bağlanır. `.env` ve `.env.migrations` Git/Docker
build context dışında tutulur; bu dosyalar sır içerir.

Geliştirme sırası ve Phase 1 kararları: [docs/PHASES.md](docs/PHASES.md).
