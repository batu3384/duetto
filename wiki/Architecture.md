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

1. Content loads VTT cues from Udemy track URLs.
2. **Live window** (~12 cues around playhead) translates first; user sees updates quickly.
3. **Rest queue** batches remaining cues via service worker → Gemini.
4. Partial results return as `TRANSLATE_PARTIAL` patches keyed by cue id.
5. Term-lock + custom protected terms skip glossary rewrites for technical words.

## Storage keys

| Key | Contents | Who reads secret |
|-----|----------|------------------|
| `duetto_settings` | Public settings (no API key blob) | All contexts |
| `duetto_secret` | `{ geminiApiKey }` | Popup + SW only |
| `duetto_notes` | Lecture notes | Popup |
| `duetto_tx_*` | Transcript cache per lecture/lang pair | Content + popup |

Content uses `getPageSettings()` → SW `GET_SETTINGS` so `geminiKeyConfigured` is accurate without exposing the key.

## Overlay modes

- **Overlay** — captions on video (glass box, CEA-708 edges).
- **Below (dock)** — video shrinks; captions in bottom band with optional ambient color from slide bottom sampling.

## Permissions (manifest)

- `storage`, `unlimitedStorage`, `activeTab`
- Hosts: `https://*.udemy.com/*`, `https://generativelanguage.googleapis.com/*`

## Audit reference

Static codebase audit (2026-08-15): [docs/codebase-audit](https://github.com/batu3384/duetto/tree/main/docs/codebase-audit). Open reliability items tracked on [Roadmap](Roadmap).
