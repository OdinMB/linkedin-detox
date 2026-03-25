# LinkedIn Detox

Chrome extension that detects AI-generated slop on LinkedIn and either hides it or replaces it with snarky roast banners. Built for laughs, not production.

## Tech Stack

- Chrome Extension (Manifest V3)
- Vanilla JavaScript (no build step, no framework)
- chrome.storage.sync for settings persistence
- MutationObserver for feed watching

## Project Layout

```
├── manifest.json           # Extension manifest (MV3)
├── icons/                  # Extension icons (16/48/128)
├── src/
│   ├── detector.js         # Detection engine — analyzePost(text, config)
│   ├── content.js          # Content script — feed observer + DOM manipulation
│   ├── content.css         # Injected styles for banners and hidden posts
│   └── popup/
│       ├── popup.html      # Settings popup UI
│       └── popup.js        # Popup logic — phrase management, mode toggle
├── .context/               # Architecture docs
├── .plans/                 # Task plans
│   └── completed/
└── CLAUDE.md               # This file
```

## Development

### Load the extension

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" and select this project root
4. Navigate to linkedin.com — the extension runs automatically

### After code changes

- Click the refresh icon on the extension card in `chrome://extensions/`
- Reload the LinkedIn tab

### No build step

Everything is vanilla JS loaded directly by Chrome. No bundler, no transpiler.

## Architecture — Detection

The detection pipeline lives in `src/detector.js` with a single entry point:

```js
analyzePost(text, config) -> { blocked: bool, score: number, matches: string[] }
```

**Phase 1 (current):** Phrase-based matching. Checks post text against a configurable blocklist.

**Phase 2 (future):** Add scorer functions to the `SCORERS` array in `detector.js`. Each scorer returns `{ score, matches }`. Scores are averaged across all scorers. This is the extension point for heuristic detection (emoji density, buzzword frequency, list patterns, etc.).

## Conventions

- No build tools — keep it loadable directly as an unpacked extension
- All state in `chrome.storage.sync` (syncs across devices)
- Session stats in `chrome.storage.local` (doesn't sync)
- Default phrases are duplicated in `detector.js` and `popup.js` — keep them in sync
- Detector interface is stable: always return `{ blocked, score, matches }`
