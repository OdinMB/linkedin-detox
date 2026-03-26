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

Three signal-based scorers, each returning `{ score: 0-100, matches: string[] }`:

1. **`emDashScorer`** — Counts em dashes (`--`, `---`, `\u2014`) and ellipsis (`...`) per sentence. High density = AI signal.
2. **`wordFrequencyScorer`** — Measures density of AI-typical words (leverage, synergy, unlock, etc.) using regex patterns that capture morphological variants. Accepts optional user-defined patterns.
3. **`cooccurrenceScorer`** — Detects thought-leader sentence templates by checking if signal words from different groups appear in the same sentence (e.g., "humbled" + "share"). Accepts optional user-defined patterns.

**Scoring combination:** `finalScore = max(allScores)`. One strong signal is enough to flag a post. The threshold slider in the popup controls sensitivity.

**User-defined patterns** are stored in `chrome.storage.sync` as `userSignalWords` (word strings, converted to RegExp by `content.js`) and `userCooccurrencePatterns` (group arrays with labels).

## Conventions

- No build tools — keep it loadable directly as an unpacked extension
- All state in `chrome.storage.sync` (syncs across devices)
- Session stats in `chrome.storage.local` (doesn't sync)
- Detector interface is stable: always return `{ blocked, score, matches }`
- Tests use vitest (`npm test`) — detector.js exports via conditional `module.exports` for testing
