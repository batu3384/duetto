# FAQ

## Is Duetto on the Chrome Web Store?

Not yet. Install from source — see [Getting Started](Getting-Started).

## Does Duetto work without a Gemini API key?

You can use dual-caption **layout** and styling, but **translation lines require your own Gemini key**. There is no built-in Google Translate fallback.

## Where is my API key stored?

In extension **local storage** under `duetto_secret`. It is never injected into the Udemy page DOM. Only the popup and service worker read the raw key; the content script sees a `geminiKeyConfigured` flag only.

## Does Duetto send data to your servers?

No. Translation goes **directly** from the extension service worker to `generativelanguage.googleapis.com`. Notes and transcripts stay in `chrome.storage.local` on your device.

## Which Udemy pages are supported?

Any `https://*.udemy.com/*` lecture page with a `<video>` element and caption tracks. Course marketing pages without the player are out of scope.

## Can I use languages other than English → Turkish?

Yes. **Altyazı** tab lists supported language codes; source and target are swappable.

## What happened to Dualis / Lingoflow names?

Rebranded to **Duetto** in v2.17. Storage keys migrate from `dualis_*` / legacy names automatically.

## Why two caption lines?

Top/bottom order is configurable (**Mod ve sıra**). Typical use: original English + translated line for note-taking and term-lock on technical vocabulary.

## Notes: what gets saved?

Press `S` on Udemy: timestamp, optional video frame snapshot, source caption line, and translation if present. Export Markdown from **Notlar** tab.

## Is transcript search local?

Yes. Cached per lecture + language pair in `duetto_tx_*`. Search in popup **Notlar** tab jumps to cue time on click.

## Open source?

MIT — [LICENSE](https://github.com/batu3384/duetto/blob/main/LICENSE).
