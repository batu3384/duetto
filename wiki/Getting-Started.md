# Getting Started

## Requirements

- **Chrome** (or Chromium) with Manifest V3
- **Node.js** 20+ and npm
- Udemy course with English (or other) captions enabled
- Optional: [Gemini API key](https://aistudio.google.com/apikey) for translation

## Install (development)

```bash
git clone https://github.com/batu3384/duetto.git
cd duetto
npm install
npm run build
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `dist/` folder

After code changes: `npm run build`, then click **Reload** on the extension card.

## Dev server

```bash
npm run dev
```

Reload the extension after Vite rebuilds. Popup HMR works; content script changes usually need an extension reload + Udemy refresh.

## Quality checks

```bash
npm run check   # self-check scripts (VTT, storage, Gemini, subtitle look)
npm run build   # tsc + vite production build
```

## First run on Udemy

1. Open a lecture with captions (`CC` on in Udemy player).
2. Click the Duetto toolbar icon → **Gemini** tab → paste API key → **Test**.
3. **Altyazı** tab → pick source/target language, enable **Çift Altyazı** in the header.
4. Play the video; translation lines appear on the live window + background batches.

## Icons

Regenerate PNG toolbar icons from SVG:

```bash
npm run icons
# or: node generate-icons.js
```

## Legacy settings

Older installs (`dualis_*`, `lingoflow_*`) migrate automatically to `duetto_*` keys on first load.
