# Duetto mühendislik denetimi

Tarih: 2026-10-28. Kapsam: Chrome MV3 uzantısı `duetto-udemy-extension` 2.18.1. Kaynak değiştirilmedi.

Kalibrasyon: doğrulanmış çökme, uzaktan anahtar çalma veya `npm audit` açığı yok. Puan bandı **75–89** (çalışır, orta borç). Canlı Udemy oturumunda oynatılmadı; bu yüzden arayüz yerleşimi “kırık” diye yazılmadı.

## Bölüm 1: Proje Bağlamı, Tehdit Modeli ve Mühendislik Karnesi

**Bağlam.** İstemci tarafı Chrome uzantısı. Popup ayar, content script Udemy oynatıcısına biner, service worker VTT proxy ve Gemini çağrısı yapar. Operatör sunucusu yok.

**Kritik varlık.** Gemini API anahtarı (`duetto_secret`), not + JPEG kare, ders transkripti (`duetto_tx_*`).

**Yüzey.** `https://*.udemy.com/*` content script; caption URL allowlist; `generativelanguage.googleapis.com`. `externally_connectable` yok. Content script anahtarı okuyamaz (`wiki/Security.md` ile kod uyumlu, `storage.check.ts` bunu doğrular).

**En kötü gerçekçi senaryo.** Çift altyazı açık ve anahtar kayıtlıyken uzun ders, kullanıcı fark etmeden onlarca Gemini isteği üretir (kota / fatura) ve ders metni Google’a gider. Uzak saldırganın uzantı deposunu okuması bu modelde yok.

| Kriter | Puan | Gerekçe |
|---|---:|---|
| Mimari ve kod kalitesi | 80 | Ayrım var (VTT, storage, Gemini). Çekirdek akış tek 1107 satırlık sınıfta. |
| İş mantığı ve kararlılık | 78 | `tsc` ve `npm run check` temiz. Çeviri iptal/yeniden deneme ve sınırsız artçı çeviri kodda duruyor. Udemy runtime yok. |
| Güvenlik ve tedarik zinciri | 82 | `npm audit` 0, gitleaks 0, anahtar content’e inmiyor. Anahtar düz `chrome.storage.local`. CI’da audit kapısı yok. |
| Performans ve kaynak | 76 | Çeviri pencereli ve sıralı. Observer, player yokken tüm `document.body` alt ağacında. Ölçüm yok. |
| UX | 78 | Hata metni, kaynak chip, popup uyarı var. Artçı çevirinin ilerleyişi ve kotası görünmez. Hover duraklatma varsayılan açık. |
| Test ve üretime hazırlık | 70 | Ayrıştırıcılar testli. `SubtitleManager` state makinesi ve Udemy e2e yok. |

**Genel: 77 / 100.**

## Bölüm 2: Bozuk Akışlar, İş Mantığı Hataları ve Eşzamanlılık

**[Önem: ORTA]** — **[Güven: Doğrulandı]** — `src/content/subtitleManager.ts:894-899`

```ts
    if (this.liveQueued && !this.swTranslatePending) {
      this.liveQueued = false;
      void this.ensureLive(this.activeVideo?.currentTime ?? now);
      return;
    }
    void this.ensureRest(this.activeVideo?.currentTime ?? now);
```

* **Sorun & Tetiklenme Yolu:** Çift altyazı açık, anahtar var, canlı pencere dolunca `ensureRest` kalan satırları 12’lik dilimlerle kendine zincirler. Durma koşulu hata, sıfır ilerleme veya ders değişimi. Üst sınır yok.
* **Etki:** Uzun derste arka arkaya Gemini çağrısı. Kota veya fatura, kullanıcı o anki satır çevrilmişken de sürer.
* **Mühendislik Çözümü:** Ayar: “yalnızca ekrandaki satır” / “dersi doldur”. Doldur modunda batch tavanı ve popup’ta “kalan satır / tahmini istek”.

**[Önem: ORTA]** — **[Güven: Doğrulandı]** — `src/content/subtitleManager.ts:968-970` ve `src/background/index.ts:259-260` (2 nokta)

```ts
        this.swTranslatePending = false;
        this.liveQueued = true;
        finish({ success: true, aborted: true });
```

```ts
  detachTabFromTranslationJob(abortKey);
  const job: TranslationJob = {
```

* **Sorun & Tetiklenme Yolu:** Gemini 90 sn’yi geçerse content isteği yerel olarak bırakır ve `liveQueued` ile yenisini ister. SW, sekmedeki önceki işi `detachTabFromTranslationJob` ile abort eder. `priority: 'live' | 'rest'` payload’da gider (`subtitleManager.ts:989`) ama SW bu alanı okumaz. Ayrı yol: `loadSubtitlesForVideo` yerel bayrağı indirir (`subtitleManager.ts:353`) fakat o anda SW’ye iptal gitmez; iptal bir sonraki `TRANSLATE_CUES` ile olur.
* **Etki:** Yavaş yanıt çöpe gider, ikinci istek açılır. Ders değişiminde kısa süre iki iş üst üste binebilir.
* **Mühendislik Çözümü:** 90 sn’de otomatik ikinci istek açma; “Çeviri gecikti” deyip tek retry bırak. `priority` ya SW’de canlı işi abort etmesin ya da alandan silinsin. Ders değişince açık işe açık abort.

**[Önem: DÜŞÜK]** — **[Güven: Doğrulandı]** — `src/background/index.ts:83-84` (aynı “neden yok” deseni caption fetch’te)

```ts
  } catch {
    sendResponse({ success: false });
```

* **Sorun & Tetiklenme Yolu:** VTT proxy zaman aşımı veya ağ hatası `success: false`. Content bunu boş kaynak sanıp aramaya devam eder veya “kaynak yok”a düşer.
* **Etki:** Kullanıcı ağı, 404’ü ve zaman aşımını ayıramaz.
* **Mühendislik Çözümü:** `{ success: false, reason: 'timeout' | 'http' | 'type' }` ve kaynak chip’te kısa neden.

Düşük öncelik özeti:

| Konu | Güven | Not |
|---|---|---|
| Native cue `endTime` yerinde uzatma | Muhtemel | Yalnız native yedek yolda. VTT yolu bunu kullanmaz. |
| Seek sırasında artçı işin iptali | Doğrulandı | Bölüm 2’deki abort ile aynı mekanizma. Ayrı bulgu değil. |

## Bölüm 3: Yarım Kalan Özellikler, Kopuk Uçlar ve Ölü Kodlar

**[Önem: DÜŞÜK]** — **[Güven: Doğrulandı]** — `package.json:15-19` (2 paket)

```json
    "clsx": "^2.1.1",
    "lucide-react": "^1.16.0",
    "tailwind-merge": "^3.0.2"
```

* **Sorun & Tetiklenme Yolu:** `src/` altında `clsx` ve `tailwind-merge` importu yok. `lucide-react` kullanılıyor.
* **Etki:** Kilit dosyasında gereksiz üretim bağımlılığı. Çalışan özelliği bozmaz.
* **Mühendislik Çözümü:** İkisini `dependencies` dışına al. `npm ci` sonrası popup build’in ikonları koruduğunu gör.

**[Önem: DÜŞÜK]** — **[Güven: Doğrulandı]** — `src/content/subtitleManager.ts:987-989`

```ts
              requestId,
              priority,
              sourceLang,
```

* **Sorun & Tetiklenme Yolu:** `priority` gönderilir. `src/background/index.ts` içinde `priority` okunmaz (arama boş). Canlı ve artçı iş aynı abort kuralına girer.
* **Etki:** “Artçı iş canlıyı kesmez” sözleşmesi kodda yok. Bugün content tek iş beklediği için fark çoğu zaman gizli.
* **Mühendislik Çözümü:** Alanı sil veya SW’de `rest` varken canlı işi abort etme.

`src/` içinde `TODO` / `FIXME` yok. `orderCuesForLiveTranslation` Gemini batch’inde duruyor; ölü değil.

Düşük öncelik özeti:

| Konu | Güven | Not |
|---|---|---|
| Popup “Gemini testi” altyazı cümlesi kurmaz | Doğrulandı | Test ping + kelime (`translator/index.ts:90-93`). Cümle, başarıdan sonra `TRIGGER_TRANSLATE` ile yenileme vaadi. Ayrı test borcu Bölüm 7. |

## Bölüm 4: Uygulama Güvenliği, Tedarik Zinciri ve Veri Gizliliği

**[Önem: ORTA]** — **[Güven: Doğrulandı]** — `src/services/storage.ts:256`

```ts
  await writeChrome({ [SECRET_KEY]: { geminiApiKey: trimmed } });
```

* **Sorun & Tetiklenme Yolu:** Anahtar `chrome.storage.local` içinde düz JSON. Popup ve SW okur. Content `settingsForPage` ile boş string alır; bu `storage.check.ts` ile doğrulanır.
* **Etki:** Uzak XSS ile çalınma yolu bu depoda yok. Aynı OS kullanıcısı / profil yedeği anahtarı görür. Uzantı için olağan risk, KRİTİK değil.
* **Mühendislik Çözümü:** Dokümante et (wiki bunu yapıyor). İsteğe bağlı: `chrome.storage.session` veya OS anahtar zinciri. Zorunlu değil.

**[Önem: ORTA]** — **[Güven: Doğrulandı]** — `src/content/subtitleManager.ts:899` (Bölüm 2 zinciri; gizlilik etkisi burada)

```ts
    void this.ensureRest(this.activeVideo?.currentTime ?? now);
```

* **Sorun & Tetiklenme Yolu:** Wiki “seçilen altyazı metni” der (`wiki/Security.md`). Kod, canlı pencereden sonra dersin kalan çevrilmemiş satırlarını da Gemini’ye yollar. Satır 500 karaktere kırpılır (`clipCueText`).
* **Etki:** Ders metni üçüncü tarafa gider. Kullanıcı bunu yalnız “ekrandaki satır” sanabilir. KVKK/GDPR açısından işleyen, kullanıcının kendi anahtarı; yine de kapsam wiki cümlesinden geniş.
* **Mühendislik Çözümü:** Popup’ta açık cümle: “Dersi doldur açıksa tüm altyazı Google’a gider.” Varsayılanı ekran penceresi yap.

**[Önem: DÜŞÜK]** — **[Güven: Doğrulandı]** — `.github/workflows/check.yml:21-23`

```yaml
      - run: npm ci
      - run: npm run check
      - run: npm run build
```

* **Sorun & Tetiklenme Yolu:** CI audit, gitleaks veya OSV çalıştırmıyor. Bu denetimde `npm audit` 0 ve gitleaks 0. Süreç deliği, bugün bilinen CVE değil.
* **Etki:** Sonraki bağımlılık açığı main’e sessiz girer.
* **Mühendislik Çözümü:** Workflow’a `npm audit --audit-level=high` ve gitleaks. Kırılırsa build kırmızı.

Tedarik notu (bulgu değil): OSV, `postcss-selector-parser@6.1.4` için GHSA-rj75-hqrm-r3gf yazdı. Aynı çıktıdaki aralık `7.0.0`–`7.1.6`. Kurulu sürüm aralığın dışında, paket devDependency, `npm audit` 0. Açık diye işaretlenmedi.

Git geçmişi: gitleaks 13 commit, sızıntı yok. `AIza` geçen yerler test sabiti `AIzaSyDummyKeyForTestOnly`.

Düşük öncelik özeti:

| Konu | Güven | Not |
|---|---|---|
| `@crxjs/vite-plugin` beta | Şüpheli | Yalnız derleme aracı. Çalışma zamanı paketi değil. |
| Host `https://*.udemy.com/*` | Doğrulandı | Giriş sayfasında da content script var. Kısayol video yokken susuyor. |

## Bölüm 5: Yazılım Mimarisi, Performans ve Kaynak Yönetimi

**[Önem: ORTA]** — **[Güven: Doğrulandı]** — `src/content/subtitleManager.ts:1-15` (dosya 1107 satır)

```ts
import {
  parseVTT,
  primaryLang,
  cleanVttText,
```

* **Sorun & Tetiklenme Yolu:** Yükleme, native yedek, cache, canlı çeviri, artçı çeviri, timeout aynı sınıfta.
* **Etki:** Yeni bug düzeltmesi komşu yolu kırar. Bölüm 7’deki test boşluğu bunun bedeli.
* **Mühendislik Çözümü:** Zorunlu büyük bölme değil. Önce timeout + rest kararlarını saf fonksiyonda tutup `subtitleManager` orkestratör kalsın. Yeni dosya açmadan da `captionSearchState.ts` çizgisi işe yarar.

**[Önem: ORTA]** — **[Güven: Muhtemel]** — `src/content/index.ts:257-259` ve `268-269`

```ts
    playerObserver = new MutationObserver(schedule);
    playerObserver.observe(root, { childList: true, subtree: true });
```

```ts
    if (!video) {
      arm(document.body);
```

* **Sorun & Tetiklenme Yolu:** Video yokken kök `document.body`, `subtree: true`. Video bulununca observer player kabına iner. Maliyet ölçülmedi.
* **Etki:** Udemy’nin yoğun DOM’unda, player mount olmadan, gereksiz callback. Kasıtlı jank iddiası yok.
* **Mühendislik Çözümü:** Player yokken `childList` yalnız, veya `requestAnimationFrame` ile seyrek tarama.

Düşük öncelik özeti:

| Konu | Güven | Not |
|---|---|---|
| `SubtitlesTab.tsx` 831 satır | Doğrulandı | Popup stil paneli. Ayrı runtime riski değil. |
| `any` kaçağı | Doğrulandı | `src/` içinde `any` tipi yok. `AbortSignal.any` API çağrısı. |

## Bölüm 6: Arayüz, Kullanılabilirlik ve Durum Yönetimi

**[Önem: DÜŞÜK]** — **[Güven: Doğrulandı]** — `src/types/index.ts:150`

```ts
    pauseOnHover: true,
```

* **Sorun & Tetiklenme Yolu:** Kelime hover’ı videoyu durdurur. “Duraklatıldı” yazısı var. İlk kurulumda açık gelir.
* **Etki:** Altyazıya yaklaşan kullanıcı oynatmayı durmuş sanır. Ayar ile kapanır.
* **Mühendislik Çözümü:** Varsayılan `false`. Mevcut kullanıcıların kayıtlı `true` değeri korunur; yalnız yeni kurulum değişir.

**[Önem: DÜŞÜK]** — **[Güven: Şüpheli]** — `src/content/overlay/videoDock.ts:36-42`

```css
[${ATTR}="below"] [class*="control-bar"],
[${ATTR}="below"] [class*="video-controls"] {
  bottom: var(--duetto-dock-h, 96px) !important;
```

* **Sorun & Tetiklenme Yolu:** “Video altı” modu Udemy kontrol çubuğunu seçiciyle yukarı iter. Seçici bugünkü DOM’a uymazsa çubuk kuyunun altında kalır. Bu denetimde Udemy açılmadı.
* **Etki:** Yalnız bu yerleşimde kontrol tıklaması zorlaşabilir. Varsayılan yerleşim `overlay`.
* **Mühendislik Çözümü:** Bir ders kaydında CC açık/kapalı ve tam ekran dene. Uymazsa seçiciyi o DOM’a kilitle.

Yükleme, hata ve boş durum: kaynak chip (“Altyazı aranıyor…”, “Kaynak yok”), çeviri satırı (“Çeviriliyor…” / hata), popup sekme hatası (`sendToUdemyTab` + `role=alert`) kodda var. Eksik olan, artçı çevirinin kendi ilerleme durumu (Bölüm 2). Ayrı bulgu açılmadı.

Düşük öncelik özeti:

| Konu | Güven | Not |
|---|---|---|
| Kaynak duyurusu ayrı `aria-live` | Doğrulandı | Buton üstünden alınmış. İyi yön. |
| Toolbar gizliyken tıklanamaz | Doğrulandı | `pointer-events: none` ta ki hover/focus. |

## Bölüm 7: Dayanıklılık, Gözlemlenebilirlik, Test ve CI/CD

**[Önem: ORTA]** — **[Güven: Doğrulandı]** — `package.json:10` (check betiği) ve `src/content/subtitleManager.ts` (test dosyası yok)

```json
    "check": "node --experimental-strip-types src/content/playerHook.check.ts && node --experimental-strip-types src/content/captionSearchState.check.ts &&
```

* **Sorun & Tetiklenme Yolu:** `npm run check` bu denetimde geçti. Örtülen yer: VTT seçimi, storage sırları, kısayol tuşu, popup URL, not cümlesi. `SubtitleManager` yükleme, poll, timeout, `ensureRest` zinciri için dosya yok.
* **Etki:** Bölüm 2’deki iptal ve kota hataları CI’dan geçebilir.
* **Mühendislik Çözümü:** Saf kararları (timeout sonrası ikinci istek var mı, rest tavanı) mevcut `*.check.ts` stiline ekle. Tarayıcı e2e şart koşma; Udemy login CI’ya girmez.

**[Önem: ORTA]** — **[Güven: Doğrulandı]** — `.github/workflows/check.yml:14-23`

```yaml
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
```

* **Sorun & Tetiklenme Yolu:** CI derler ve birim check çalıştırır. Sağlık ucu yok (uzantıda anlamsız). Log `console.warn` / `console.error`. Hata izleme servisi yok.
* **Etki:** Alan hatası yalnız kullanıcının DevTools’unda. Kabul edilebilir bir istemci ürünü için; destek yükü büyür.
* **Mühendislik Çözümü:** İsteğe bağlı yerel halka tamponu (son 50 uyarı, popup “tanı kopyala”). Üçüncü parti analytics ekleme.

**[Önem: DÜŞÜK]** — **[Güven: Doğrulandı]** — `src/services/translator/index.ts:90-93`

```ts
  await pingGemini(key, model);
  const phraseSrc = 'hook';
  const phraseTr = await translatePhrase(phraseSrc, settings, targetLang, { bypassCooldown: true });
```

* **Sorun & Tetiklenme Yolu:** “Gemini çevirisini test et” numaralı cue grubunu doğrulamaz. Yorum da bunu söylüyor.
* **Etki:** Anahtar çalışır, altyazı batch’i bozuk kalabilir. Kullanıcı testi yeşil sanır.
* **Mühendislik Çözümü:** Tek satırlık sahte cue ile `translateCues` (veya parse fonksiyonu) çağır. Ağ yoksa parse’ı birim testte bırak, popup metnini “kelime çevirisi çalıştı” yap.

Düşük öncelik özeti:

| Konu | Güven | Not |
|---|---|---|
| Sessiz `catch` sayısı | Doğrulandı | Ağ yollarında çok. En kritik örnek Bölüm 2 caption fetch. Hepsini tek tek yazmak gürültü. |
| README / wiki güvenlik modeli | Doğrulandı | Anahtar ayrımı doğru. “Seçilen metin” cümlesi artçı çeviriden dar (Bölüm 4). |

## Bölüm 8: Sektör Kıyaslaması ve Ürün Geliştirme Önerileri

Bu bölüm bulgu listesinden ayrı. Arama: Exa, 2026-10-28. Rakip sayıları mağaza veya üçüncü yazı iddiasıdır; bu depo onları ölçmedi.

| Ürün | Udemy | Bu depodan fark | Kaynak |
|---|---|---|---|
| Trancy | Evet, kurs siteleri listesinde | Çok platform, kelime defteri, konuşma koçu, mobil | https://chromewebstore.google.com/detail/trancy-ai-translator-dual/mjdbhokoopacimoekfgkcoogikbfgngb |
| Language Reactor | Karşılaştırma yazılarında hayır | Netflix/YouTube, Anki, PhrasePump | https://fluentai.pro/guides/language-reactor-vs-trancy (2026-08-31) |
| InterSub | Evet | Sözlük + Anki/Excel, hover’da cümle dilimi | https://intersub.cc/en/blog/dual-subtitle-extensions-compared (2026-10-21) |
| Lingosive karşılaştırması | Trancy lehine kurs sitesi | Netflix dışı izleyen için Trancy’yi öne çıkarır | https://www.lingosive.com/en/blog/best-dual-subtitles-chrome-extension (güncelleme 2026-10-16) |

Duetto’nun yeri: tek site (Udemy), kullanıcının kendi Gemini anahtarı, altyazı + not + oynatıcı. Geniş dil öğrenme paketi değil.

Katma değer, bu sırayla:

1. Artçı çeviri için görünür kota ve “yalnızca ekran” anahtarı (Bölüm 2 ve 4 ile aynı iş).
2. Kelime/cümle defteri dışa aktarma (CSV). Rakipte Anki bu işin standardı.
3. Altyazısız derste “AI altyazı” iddiası koyma. Rakipler koyuyor; bu depoda kaynak yoksa dürüst hata var. Onu bozmadan bırakmak doğru.
4. Firefox ancak Udemy DOM’u bir kez elde doğrulanırsa.

## Bölüm 9: Fazlandırılmış Mimari Eylem Planı

**Faz 1.** Veri kaybı veya uzaktan istismar doğrulanmadı. Acil yama yok. İlk iş yine de kota: artçı zincire tavan veya varsayılanı kapat (Bölüm 2 ilk bulgu, Bölüm 4 ikinci bulgu).

**Faz 2.** `priority` alanını bağla veya sil (Bölüm 3). `clsx` ve `tailwind-merge` kaldır (Bölüm 3). Caption fetch neden kodu (Bölüm 2 üçüncü bulgu). Popup test metnini kelime testiyle hizala (Bölüm 7).

**Faz 3.** 90 sn ikinci isteği ve ders değişiminde açık SW iptalini sadeleştir (Bölüm 2 ikinci bulgu). Observer’ı player yokken daralt (Bölüm 5). `pauseOnHover` varsayılanını kapat (Bölüm 6). Video-altı seçiciyi bir gerçek derste doğrula (Bölüm 6, şüpheli).

**Faz 4.** `ensureRest` / timeout kararları için `*.check.ts` (Bölüm 7). CI’ya `npm audit` + gitleaks (Bölüm 4). İsteğe bağlı yerel tanı kopyası. Bölüm 8’deki CSV defteri ancak Faz 1 kotası bittikten sonra.

## Bölüm 10: Denetim Kapsam Beyanı

**Tam okunan veya bu turda satır satır kullanılanlar.** `package.json`, `manifest.json`, `tsconfig.json`, `.github/workflows/check.yml`, `wiki/Security.md`, `src/background/index.ts` (caption fetch, translate job), `src/services/storage.ts` (secret yazımı), `src/services/translator/index.ts` (test boru hattı), `src/content/subtitleManager.ts` (yükleme bayrağı, ensureLive/Rest, timeout), `src/content/index.ts` (observer), `src/content/overlay/videoDock.ts` (kontrol CSS), `src/types/index.ts` (varsayılan hover), `src/popup/components/AiTab.tsx` (test metni), `package.json` bağımlılıkları.

**Kısmen.** `src/content/overlay/uiRenderer.ts`, `shadowRoot.ts`, `playerHook.ts`, `vttParser.ts`, `udemyCaptions.ts`, `SubtitlesTab.tsx`: önceki bakım ve bu turda grep/satır sayımı. Satır satır yeniden okunmadı. `docs/codebase-audit/2026-08-15*` eski rapor; bu denetimin girdisi değil. `dist/` üretilmiş, okunmadı. `package-lock.json` yalnız OSV/audit.

**Komutlar.**

| Komut | Sonuç |
|---|---|
| `npx tsc --noEmit` | çıkış 0 |
| `npm run check` | çıkış 0, tüm `*.check.ts` geçti |
| `npm audit --omit=dev` | 0 açık |
| `gitleaks detect` (rapor `/tmp`) | 13 commit, sızıntı yok |
| `osv-scanner --lockfile=package-lock.json` | 6.1.4 için 7.x uyarısı; bulgu sayılmadı |
| Exa `web_search_exa` | Bölüm 8 kaynakları |

**Çalışmayan.** `eslint`, `semgrep` kurulu değil. Udemy’ye login ve unpacked uzantı koşusu yok. `npm install` / `npm audit fix` çalıştırılmadı.

**Git.** `.gitignore` değişmedi. `audit/NOTES.md` ve `audit/AUDIT_REPORT.md` yeni dosya; ignore kuralı eklenmedi, commit atılmadı.
