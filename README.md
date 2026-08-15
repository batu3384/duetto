# Duetto

Chrome extension for **Udemy** — dual captions (source + translation), Gemini-powered translation, inline glossary, lecture notes, and precision playback controls.

**Stack:** Chrome MV3 · React 19 · TypeScript · Vite · `@crxjs/vite-plugin` · Tailwind CSS

## Features

- **Dual captions** — original line + target language; term-lock keeps technical terms in English when needed
- **Subtitle styling** — CEA-708 edges, glass box, dock placement under the video with frame-matched background
- **Translation** — bring your own [Gemini API key](https://aistudio.google.com/apikey); live window + background batching
- **Glossary** — hover / click words for quick translation
- **Notes** — capture timestamp, frame, and both caption lines; export Markdown from the popup
- **Transcript cache** — search prior lectures; jump to a cue timestamp
- **Player** — speed steps, silence skip, PiP, seek shortcuts

## Install (development)

```bash
npm install
npm run build
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `dist` folder

Dev server: `npm run dev` (reload the extension after builds).

Quality checks: `npm run check`

Regenerate toolbar PNGs from SVG: `node generate-icons.js`

## Keyboard shortcuts (Udemy tab)

| Key | Action |
|-----|--------|
| `D` | Toggle dual captions |
| `S` | Save note + snapshot |
| `J` / `L` | −5s / +5s |
| `[` / `]` | Decrease / increase speed |
| `P` | Picture-in-Picture |

Disabled while focus is in an input field. Shortcuts can be turned off in settings.

## Privacy & API keys

- Gemini API keys are stored in **extension local storage** (`duetto_secret`), not in page context on Udemy
- Translation requests go to Google’s Generative Language API from the extension service worker
- No backend server; transcript and note data stay on your device

## Project layout

```
src/
  background/     # Service worker, translation routing
  content/        # Udemy overlay, subtitles, player hook
  popup/          # Settings UI
  services/       # Storage, VTT, Gemini, notes
public/
  icons/          # duetto-icon-light.svg + generated PNGs
  fonts/          # Bundled caption fonts (OFL)
```

## License

MIT — see [LICENSE](LICENSE).
