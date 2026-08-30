# Architecture

Chrome **Manifest V3** extension. No backend server — settings, notes, and transcript cache live in `chrome.storage.local`.

## Stack

| Layer | Tech |
|-------|------|
| UI (popup) | React 19, Tailwind 3 |
| Build | Vite 6, `@crxjs/vite-plugin`, TypeScript 5 |
| Content overlay | Closed Shadow DOM, vanilla CSS |
| Translation | Google Generative Language API (Gemini) |

## Runtime components

```
┌─────────────────────────────────────────────────────────┐
│  Popup (extension page)                                  │
│  App.tsx → tabs: Subtitles | Player | Gemini | Notes    │
└───────────────────────────┬─────────────────────────────┘
                            │ chrome.storage / messages
┌───────────────────────────▼─────────────────────────────┐
│  Service worker (background/index.ts)                    │
│  • GET_SETTINGS, TEST_GEMINI, TRANSLATE_*               │
│  • Reads duetto_secret; content never gets raw key       │
└───────────────────────────┬─────────────────────────────┘
                            │ sendMessage
┌───────────────────────────▼─────────────────────────────┐
│  Content script (udemy.com)                              │
│  • subtitleManager — VTT fetch, cue sync, translate queue│
│  • shadowRoot + uiRenderer — overlay captions, toolbar   │
│  • videoDock — below-video dock, frame-matched band      │
│  • playerHook — speed, PiP, silence skip, seek           │
└─────────────────────────────────────────────────────────┘
```

## Source layout

| Path | Role |
|------|------|
| `src/background/` | Service worker, translation routing |
| `src/content/` | Udemy injection, overlay, shortcuts |
| `src/popup/` | Settings UI |
| `src/services/` | Storage, VTT parser, Gemini, notes, DB |
| `public/fonts/` | Bundled caption fonts (OFL) |
| `public/icons/` | `duetto-icon-light.svg` + PNGs |

## Translation pipeline

1. Content selects the source-language `TextTrack`, preferring Udemy’s currently showing track and never using an unrelated first-track fallback.
2. Cues load from that track or its matching `<track>` URL; unrelated performance-resource VTT files are not trusted.
3. **Live window** (up to 12 cues around playhead) translates only while video is playing and dual subtitles are enabled.
4. Identical live windows in multiple tabs share one service-worker Gemini job.
5. Partial results return as `TRANSLATE_PARTIAL` patches keyed by cue id, lecture id, and request id.
6. Translation stops on quota exhaustion for a cooldown period; it does not retry 429 responses.
7. Term-lock + custom protected terms skip glossary rewrites for technical words.

## Storage keys

| Key | Contents | Who reads secret |
|-----|----------|------------------|
| `duetto_settings` | Public settings (no API key blob) | All contexts |
| `duetto_secret` | `{ geminiApiKey }` | Popup + SW only |
| `duetto_notes` | Lecture notes | Popup |
| `duetto_tx_*` | Transcript cache per lecture/lang pair plus source/model fingerprints | Content + popup |

Content uses `getPageSettings()` → SW `GET_SETTINGS` so `geminiKeyConfigured` is accurate without exposing the key.
Active caption cache requires matching source and translation fingerprints. Records without provenance remain available to Notes search but are not loaded as active captions.

## Overlay modes

- **Overlay** — captions on video (glass box, CEA-708 edges).
- **Below (dock)** — video shrinks; captions in bottom band with optional ambient color from slide bottom sampling.

## Permissions (manifest)

- `storage`, `unlimitedStorage`, `activeTab`
- Hosts: `https://*.udemy.com/*`, `https://generativelanguage.googleapis.com/*`

## Audit reference

Static codebase audit (2026-08-15): [docs/codebase-audit](https://github.com/batu3384/duetto/tree/main/docs/codebase-audit). Open reliability items tracked on [Roadmap](Roadmap).
