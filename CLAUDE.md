# LinkedIn Detox

Cross-browser extension (Chrome, Firefox, Safari) that detects AI-generated slop on LinkedIn and either hides it or replaces it with snarky roast banners. Also blocks promoted/sponsored posts. Built for laughs, not production.

## Tech Stack

- Browser Extension (Manifest V3) — Chrome, Firefox 128+, Safari 16.4+
- Vanilla JavaScript (no build step, no framework)
- chrome.storage.sync for settings persistence
- MutationObserver for feed watching

## Project Layout

```
├── manifest.json           # Chrome extension manifest (MV3)
├── manifest.firefox.json   # Firefox manifest (background.scripts + gecko settings)
├── manifest.safari.json    # Safari manifest (for xcrun converter)
├── icons/                  # Extension icons (16/48/128)
├── src/
│   ├── detector.js         # Detection engine — analyzePost(text, config) + analyzePostAsync + isPromotedPost
│   ├── semantic-scorer.js  # Cosine similarity scoring against phrase embeddings
│   ├── semantic-bridge.js  # Content script — bridges to background for embedding
│   ├── model-loader.js     # ES module — ML model env config + lazy init (shared by offscreen + portable)
│   ├── background.js       # Chrome service worker — relays to offscreen document
│   ├── background-portable.js # Firefox/Safari background — loads model directly (ES module)
│   ├── offscreen.html      # Offscreen document shell (Chrome only)
│   ├── offscreen.js        # Chrome offscreen doc — imports model-loader, handles embed messages
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
│   └── build.js            # Package builder — all browsers or --chrome/--firefox/--safari
├── .eslintrc.json          # ESLint config (browser env, basic rules)
├── vitest.config.js        # Vitest config with coverage settings
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

### Browser packages

`scripts/build.js` packages the extension for each browser:

- **`npm run build`** — All browsers at once (Chrome + Firefox + Safari)
- **`npm run build:chrome`** — Chrome zip only (`dist/linkedin-detox-<version>.zip`)
- **`npm run build:firefox`** — Firefox zip only (`dist/linkedin-detox-<version>-firefox.zip`)
- **`npm run build:safari`** — Safari directory only (`dist/linkedin-detox-<version>-safari/`) for `xcrun safari-web-extension-converter`

Each build includes only runtime files and swaps in the browser-specific manifest and background script. Firefox/Safari use `background-portable.js` + `model-loader.js` (direct model loading); Chrome uses `background.js` + offscreen document relay.

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

### Semantic Scorer — Model Architecture

The embedding model configuration (WASM env, pipeline init) lives in `src/model-loader.js`, shared by both browser paths:

**Chrome path (offscreen relay):** Chrome's MV3 service workers lack WASM support, so the model runs in an offscreen document:
- `src/semantic-bridge.js` (content script) sends `chrome.runtime.sendMessage({ type: "embed", sentences })`
- `src/background.js` (service worker) creates the offscreen document and relays the message
- `src/offscreen.js` imports `model-loader.js`, runs the model, returns embeddings

**Firefox/Safari path (direct):** These browsers support WASM in background scripts natively:
- `src/background-portable.js` imports `model-loader.js` and handles embed messages directly — no offscreen relay

In both paths, `src/semantic-scorer.js` computes cosine similarity against the phrase bank.

## Detection Posture

LinkedIn's ToS (Section 8.2) prohibits browser extensions that modify the service. We accept that risk. No adversarial evasion tactics — no fingerprint minimization, no detection-script blocking, no arms race. See `.context/linkedin-tos-risks.md` for the full ToS analysis.

## DOM Unobtrusiveness

We try to be as unobtrusive to LinkedIn's DOM and code as possible — avoid removing/replacing their nodes, avoid polluting their JS context, prefer CSS-only hiding. This is good engineering practice that happens to reduce footprint as a side effect.

## Context Files

- **[Semantic Scoring](.context/semantic-scoring.md)** — The semantic scorer uses a two-pass async architecture; changes to scoring, worker protocol, or phrase bank must respect this flow. Details on components, data flow, and key decisions.
- **[LinkedIn DOM Challenges](.context/linkedin-dom-challenges.md)** — LinkedIn virtualizes its feed; the extension uses text hashing instead of element refs. Details on the overlay approach.
- **[Permissions](.context/permissions.md)** — Why each manifest permission exists, what uses it, and what was removed.
- **[Cross-Browser](.context/cross-browser.md)** — Chrome uses offscreen relay, Firefox/Safari load the model directly; build script, manifest, and background file differ per browser. Details on the build matrix and shared model loader.

## Quality Checks

Before committing, run:

- **`npm test`** — vitest unit tests (170 tests across 6 files)
- **`npm run lint`** — ESLint with browser env, `no-unused-vars`, `no-undef`, `eqeqeq`
- **`npm run test:coverage`** — vitest with lcov coverage report (requires `@vitest/coverage-v8`)
- **`npm run build`** — verify all browser packages build cleanly

## Conventions

- No build tools — keep it loadable directly as an unpacked extension
- All state in `chrome.storage.sync` (syncs across devices)
- Session stats and large data in `chrome.storage.local` (doesn't sync, higher quota). Sync has 8KB per-item and 100KB total limits.
- Detector interface is stable: always return `{ blocked, score, matches }`
- Scoring constants are named (e.g., `EM_DASH_SCORE_MULTIPLIER`, `COSINE_LOW_THRESHOLD`) — don't use inline magic numbers in scoring formulas
- Tests use vitest (`npm test`) — detector.js exports via conditional `module.exports` for testing
- Shared code lives in `src/shared/` using the `window._ld` namespace pattern (IIFE + `window._ld = window._ld || {}`). Each shared file also has a `module.exports` guard for test compatibility. New shared utilities should follow this pattern.
- Background-context-only modules (ES `import`/`export`) live in `src/` rather than `src/shared/`, since they can't follow the IIFE/namespace pattern. Example: `model-loader.js`.
- When code is needed by multiple contexts (content script, popup, options), extract it to `src/shared/` rather than duplicating it
- Content script load order in manifest is a hard dependency: `config.js` → `utils.js` → `embed.js` → `detector.js` → `semantic-scorer.js` → `semantic-bridge.js` → `scanner.js` → `renderer.js` → `content.js`. Earlier scripts define globals that later scripts consume.
- Options page renders lists using DOM construction APIs (`createElement`/`textContent`), not `innerHTML` with string interpolation — this eliminates XSS surface
- Error logging uses `[LinkedIn Detox]` prefix (or `[LinkedIn Detox Offscreen]` for offscreen document) consistently across all files
