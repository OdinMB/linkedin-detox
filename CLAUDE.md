# LinkedIn Detox

Chrome extension that detects AI-generated slop on LinkedIn and either hides it or replaces it with snarky roast banners. Also blocks promoted/sponsored posts. Built for laughs, not production.

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
│   ├── detector.js         # Detection engine — analyzePost(text, config) + analyzePostAsync + isPromotedPost
│   ├── semantic-scorer.js  # Cosine similarity scoring against phrase embeddings
│   ├── semantic-bridge.js  # Content script — bridges to background for embedding
│   ├── background.js       # Service worker — relays to offscreen document
│   ├── offscreen.html      # Offscreen document shell
│   ├── offscreen.js        # Loads transformers.js + MiniLM model
│   ├── phrase-embeddings.json # Precomputed embeddings for ~50 canonical AI-slop phrase types
│   ├── models/                 # Bundled ML model (checked in — no runtime downloads)
│   │   └── Xenova/all-MiniLM-L6-v2/  # Quantized MiniLM for semantic scoring
│   ├── lib/                    # Vendored libraries (checked in)
│   │   └── transformers.min.js # @xenova/transformers CJS bundle (~877KB)
│   ├── shared/
│   │   ├── config.js       # DEFAULT_CONFIG, SENSITIVITY_THRESHOLDS, loadConfig()
│   │   ├── utils.js        # escapeHtml(), splitSentences(), extractAuthor(), isWhitelistedAuthor()
│   │   └── embed.js        # embedSentences(), embedPhrase()
│   ├── scanner.js          # Feed scanning + detection pipeline orchestration
│   ├── renderer.js         # Banner/overlay rendering + DOM manipulation
│   ├── content.js          # Slim orchestrator — wires scanner + renderer, owns config/observers
│   ├── content.css         # Injected styles for banners and hidden posts
│   ├── popup/
│   │   ├── popup.html      # Quick-controls popup (enabled, mode, sensitivity)
│   │   └── popup.js        # Popup logic — opens options page for full config
│   └── options/
│       ├── options.html    # Full config page (patterns, semantic, debug)
│       └── options.js      # Options logic — pattern management, phrase embedding
├── scripts/
│   ├── build-embeddings.js # Node script to regenerate phrase-embeddings.json
│   └── build-zip.js        # Node script to build Chrome Web Store zip
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

### Bundled assets

All runtime assets are checked into git (no setup required to run the extension). Three assets may need regeneration:

- **`src/phrase-embeddings.json`** — re-run `node scripts/build-embeddings.js` after editing canonical phrases
- **`src/lib/transformers.min.js`** — copy from `node_modules/@xenova/transformers/dist/` after bumping the npm version
- **`src/models/Xenova/all-MiniLM-L6-v2/`** — copy from `node_modules/@xenova/transformers/.cache/` after changing model version

See README > Development > "Updating bundled assets" for full commands.

### Chrome Web Store zip

`npm run build:zip` creates `dist/linkedin-detox-<version>.zip` with only runtime files (no tests, docs, or dev config). The script lives at `scripts/build-zip.js`.

## Architecture — Detection

The detection pipeline lives in `src/detector.js` with two entry points:

```js
analyzePost(text, config) -> { blocked, score, matches }       // sync heuristics only
analyzePostAsync(text, config) -> Promise<{ blocked, score, matches }>  // unified two-pass
```

`scanner.js` calls `analyzePostAsync` for every post. It handles two-pass scoring internally:

Three synchronous heuristic scorers, each returning `{ score: 0-100, matches: string[] }`:

1. **`emDashScorer`** — Counts em dashes (`--`, `---`, `\u2014`) and ellipsis (`...`) per sentence. High density = AI signal.
2. **`wordFrequencyScorer`** — Measures density of AI-typical words (leverage, synergy, unlock, etc.) using regex patterns that capture morphological variants. Accepts optional user-defined patterns.
3. **`cooccurrenceScorer`** — Detects thought-leader sentence templates by checking if signal words from different groups appear in the same sentence (e.g., "humbled" + "share"). Accepts optional user-defined patterns.

Plus one optional async scorer:

4. **`semanticScorer`** (opt-in via popup toggle) — Uses a quantized MiniLM embedding model (`Xenova/all-MiniLM-L6-v2`) running in a Web Worker to compare post sentences against ~50 canonical AI-slop phrase types via cosine similarity. Catches novel phrasings that heuristics miss.

**Two-pass scoring (inside `analyzePostAsync`):** The semantic scorer is expensive (embeds every sentence via an ML model), so it only runs on posts the heuristics missed:
- **Pass 1 (sync):** Run the three heuristic scorers. If the post scores above threshold, return immediately — no semantic scoring needed.
- **Pass 2 (async, only uncaught posts):** If `config.semanticEnabled` and `config.getSemanticScore` are provided, run the semantic scorer and merge results (max score wins). `getSemanticScore` is injected by `content.js` from `semantic-bridge.js`.

This means the model is never invoked for posts that heuristics already catch, keeping the common case fast.

**Promoted post detection:** Before any scoring runs, `isPromotedPost(text)` checks for "Promoted" (case-sensitive, word-boundary) in the first 200 characters. If matched and `blockPromoted` is enabled, the post is blocked immediately with a distinct blue-themed banner — no slop scoring runs. This is a binary check with no threshold.

**Author whitelist:** Before any detection runs, `scanner.js` extracts the author name from the first line of the post's `innerText` and checks it against `whitelistedAuthorsSet` (a `Set` of lowercased names built from `config.whitelistedAuthors`). If matched (case-insensitive substring), the post is skipped entirely. Authors can be whitelisted from the options page ("Trusted Authors" section) or via the checkmark button on roast-mode banners. The whitelist is stored in `chrome.storage.sync` as `whitelistedAuthors` (array of display names). Changes take effect without page reload.

**Scoring combination:** `finalScore = max(allScores)`. One strong signal is enough to flag a post. The threshold slider in the popup controls sensitivity.

**User-defined patterns** are stored in `chrome.storage.sync` as `userSignalWords` (word strings, converted to RegExp by `content.js`) and `userCooccurrencePatterns` (group arrays with labels).

### Semantic Scorer — Offscreen Architecture

The embedding model needs full browser APIs (WebAssembly, Workers, Atomics) that MV3 service workers lack. The model runs in an **offscreen document**:
- `src/semantic-bridge.js` (content script) sends `chrome.runtime.sendMessage({ type: "embed", sentences })`
- `src/background.js` (service worker) creates the offscreen document and relays the message
- `src/offscreen.js` loads the model, embeds sentences, returns embeddings
- `src/semantic-scorer.js` computes cosine similarity against the phrase bank

**Setup:** See "Semantic scoring setup" in the Development section above.

## Context Files

- **[Semantic Scoring](.context/semantic-scoring.md)** — The semantic scorer uses a two-pass async architecture; changes to scoring, worker protocol, or phrase bank must respect this flow. Details on components, data flow, and key decisions.
- **[LinkedIn DOM Challenges](.context/linkedin-dom-challenges.md)** — LinkedIn virtualizes its feed; the extension uses text hashing instead of element refs. Details on the overlay approach.
- **[Permissions](.context/permissions.md)** — Why each manifest permission exists, what uses it, and what was removed.

## Conventions

- No build tools — keep it loadable directly as an unpacked extension
- All state in `chrome.storage.sync` (syncs across devices)
- Session stats in `chrome.storage.local` (doesn't sync)
- Detector interface is stable: always return `{ blocked, score, matches }`
- Tests use vitest (`npm test`) — detector.js exports via conditional `module.exports` for testing
- Shared code lives in `src/shared/` using the `window.LinkedInDetox` global namespace pattern (IIFE + `window.LinkedInDetox = window.LinkedInDetox || {}`). Each shared file also has a `module.exports` guard for test compatibility. New shared utilities should follow this pattern.
- When code is needed by multiple contexts (content script, popup, options), extract it to `src/shared/` rather than duplicating it
