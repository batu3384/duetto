# Troubleshooting

## Extension context invalidated

**Symptom:** Console error `Extension context invalidated` in `storage-*.js` on Udemy.

**Cause:** Extension was **Reload**ed in `chrome://extensions` while the Udemy tab stayed open. Old content script loses its Chrome API connection.

**Fix:**

1. Reload extension (if you just built).
2. **Refresh the Udemy tab** (F5).
3. If a bottom banner appears (“Duetto güncellendi — sayfayı yenileyin”), refresh once.

Since v2.17+ the extension shows that banner instead of spamming uncaught promise errors.

---

## Translation never appears (yellow line missing)

1. **Gemini** tab → API key saved → run **Gemini çevirisini test et**.
2. Header toggle **Çift Altyazı** ON.
3. Udemy player **CC** enabled for the lecture.
4. Check target language in **Altyazı** tab.
5. Reload extension + refresh Udemy after key changes.

---

## Duetto English caption differs from Udemy

Duetto selects the matching source-language track, preferring the track Udemy currently shows. It does not guess with an unrelated track when language metadata is missing.

1. Open **Oynatıcı** → **Altyazıyı yenile**.
2. Check the toolbar source label (`English`, `English (auto-generated)`, etc.).
3. Ensure Udemy’s native CC language matches Duetto’s **Kaynak** language.
4. Refresh the page if the source label says **Kaynak yok**.

Old transcript records without a source fingerprint are ignored for active captions, so stale English cache cannot silently replace the current track.

---

## Only source line, no translation

- Key not configured → amber banner in **Altyazı** tab.
- Gemini quota / invalid key → red result on test button; check [Google AI Studio](https://aistudio.google.com/).
- Translation starts only during playback and only for current live window. Move playback forward to translate later cues.

---

## Dock color wrong or opacity ignored

- **Video altında** mode: try **Videodan kuyu** toggle.
- **Kuyu perdesi** 0% = match slide band; 100% = solid preset color.
- Some slide decks have heavy title bars — bottom-band sampling ignores top red/green title rows by design.

---

## Glass blur disabled

Message: *Sistem saydamlığı kapalı — cam kapalı.*

OS **Reduce transparency** is on. Glass uses solid fill fallback; not a Duetto bug.

---

## Native Udemy captions still visible

Enable **Çift Altyazı**. Duetto injects CSS to hide Udemy’s native cue layer while dual mode is on.

---

## Shortcuts not working

- Focus must not be in an input/textarea.
- **Oynatıcı** tab → **Klavye kısayolları** toggle ON.
- Udemy SPA must be the active tab.

---

## Build / check failures

```bash
npm run check   # fix failing *.check.ts assertions first
npm run build   # tsc errors before vite
```

Node 20+ recommended for `--experimental-strip-types` in check scripts.

---

## Still stuck?

Open an [issue](https://github.com/batu3384/duetto/issues/new) with:

- Chrome version
- Duetto version (`manifest.json` or popup header)
- Steps + screenshot of popup **Gemini** test result
- Console errors (redact API keys)
