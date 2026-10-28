# Duetto denetim notları (ham)

Tarih: 2026-10-28. Kaynak salt okundu. Yazılan yer: bu dosya ve `AUDIT_REPORT.md`.

## Geçiş 1 — Bağlam

- Tür: Chrome MV3 uzantısı (popup + content script + service worker). Sunucu yok.
- Kullanıcı: Udemy izleyen kişi. Çift altyazı, Gemini çevirisi, not, hız/sessizlik.
- Kritik varlıklar: Gemini API anahtarı (`duetto_secret`), not kareleri, ders transkripti.
- Yüzey: `https://*.udemy.com/*` content script, caption fetch proxy, Gemini `generateContent`.
- Tehdit: sayfa JS uzantı deposunu okuyamaz. Asıl risk yerel profil + kullanıcının kendi anahtarıyla ders metninin Google'a gitmesi.
- `wiki/Security.md` bu modeli yazıyor. `npm audit` 0. Gitleaks 13 commit, sızıntı yok.

## Geçiş 2 — Ham bulgular

1. `ensureRest` başarılı partiden sonra kendini çağırıyor (`subtitleManager.ts` ~899). Uzun derste kota sınırı yok.
2. 90 sn timeout `liveQueued` yapıp yeni istek açıyor (~969). SW `detachTabFromTranslationJob` (~259) önceki işi iptal eder. `priority` SW'de okunmuyor.
3. `loadSubtitlesForVideo` `swTranslatePending = false` (~353) ama SW abort mesajı yok. Sonraki `TRANSLATE_CUES` iptal eder.
4. `clsx`, `tailwind-merge` import yok.
5. `testGeminiPipeline` yalnız ping + kelime (`translator/index.ts` 90-93). `SubtitleManager` için test dosyası yok.
6. Anahtar `chrome.storage.local` düz metin (`storage.ts` 256). Content'e gitmiyor (`settingsForPage` testli).
7. `subtitleManager.ts` 1107 satır. `SubtitlesTab.tsx` 831.
8. Player gelene kadar `document.body` subtree observer (`index.ts` 259, 268).
9. Varsayılan `pauseOnHover: true` (`types/index.ts` 150).
10. Caption fetch `catch` nedeni yutuyor (`background/index.ts` 83-84).
11. CI: checkout, `npm ci`, `npm run check`, `npm run build`. Audit/gitleaks adımı yok.
12. OSV, `postcss-selector-parser@6.1.4` için GHSA-rj75-hqrm-r3gf gösterdi; aynı JSON aralığı `7.0.0`–`7.1.6`. `npm audit` 0. Bulguya yükseltilmedi.

## Geçiş 3 — Arama

Kanal: Exa (`mcporter` + `exa.web_search_exa`), 2026-10-28.

- Trancy CWS: Udemy dahil çok site, ~300k kullanıcı iddiası (mağaza metni).
- Lingosive karşılaştırma, güncelleme 2026-10-16: Language Reactor Netflix/YouTube; Trancy kurs siteleri.
- InterSub, 2026-10-21: Udemy + Anki/Excel.
- FluentAI rehberi, 2026-08-31: Language Reactor Udemy yok; Trancy var.

## Komutlar

- `npx tsc --noEmit` çıkış 0
- `npm run check` çıkış 0
- `npm audit --omit=dev` total 0
- `gitleaks detect` 13 commit, no leaks
- `osv-scanner --lockfile=package-lock.json` (yukarıdaki uyuşmazlık)
- `eslint`, `semgrep` yok
