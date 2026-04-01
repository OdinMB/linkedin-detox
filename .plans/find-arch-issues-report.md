# Architectural Issues — LinkedIn Detox

**Date:** 2026-03-28
**Scope:** Full codebase — src/, scripts/, manifest.json. Skipped node_modules, src/lib/transformers.min.js (vendored bundle), src/models/ (bundled ML model).

---

## Critical

### content.js is a monolith doing five distinct jobs

- **Cluster:** `src/content.js` (529 lines) — owns: (1) config loading and live-sync from `chrome.storage`, (2) feed scanning and post hashing, (3) the two-pass detection pipeline (calling `analyzePost` + `getSemanticScore`), (4) an overlay/banner rendering engine (DOM positioning, clip-path, nav avoidance), and (5) the MutationObserver + scroll event loop.
- **Coupling:** All five responsibilities share mutable global state (`currentConfig`, `blockedSet`, `analyzedHashes`, `liveBanners`, `bannersDirty`, `overlayEl`, etc.). Functions reach freely into each other's state — `recordBlocked` sets `bannersDirty`, `render` reads `blockedSet`, `scanFeed` calls `render`, the config listener calls `render` directly. There is no internal interface between concerns.
- **Dependency category:** In-process — all logic is in-memory DOM manipulation with no I/O other than `chrome.storage`.
- **Test impact:** `content.js` has zero tests. The tightly-wound shared state prevents testing any single concern in isolation. Separating the config layer, the scan/detection pipeline, and the banner renderer would make each independently testable — replacing the current absence of tests with boundary tests against observable outputs (e.g., "given these blockedSet entries and post rects, render() produces these banner positions").
- **Description:** The `render()` function alone reads from `currentConfig`, `blockedSet`, `liveBanners`, `bannersDirty`, `overlayEl`, and calls `findNavBottom()`, `clipBannerToNav()`, `getOverlay()`, `getRandomRoast()`, and `getRandomBannerImage()`. Any change to one concern risks breaking the others in non-obvious ways. This is the highest-friction file in the codebase and most likely to regress.

---

## Important

### Config schema is duplicated and silently diverges across three files

- **Cluster:** `src/content.js` (`DEFAULT_CONFIG`, `SENSITIVITY_THRESHOLDS`, `loadConfig`), `src/popup/popup.js` (`SENSITIVITY_THRESHOLDS`, `save`, `loadState`), `src/options/options.js` (`loadState`, `saveToggles`)
- **Coupling:** No shared config module exists. Each file independently defines default values for keys like `enabled`, `mode`, `sensitivity`, `semanticEnabled`, `blockPromoted`, `theme`, `debugLogging`, `testMode`. `SENSITIVITY_THRESHOLDS` (`{ chill: 50, suspicious: 25, unhinged: 1 }`) is copy-pasted verbatim into both `content.js` and `popup.js`. The `escapeHtml` utility is duplicated across `content.js` and `options.js`. The in-progress `editable-builtins` work adds three more keys (`deletedBuiltinWords`, `deletedBuiltinCoocLabels`, `deletedBuiltinPhrases`) that must now be threaded through all three files manually.
- **Dependency category:** In-process — all three files run in the same Chrome extension context and read from the same `chrome.storage.sync` namespace.
- **Test impact:** No storage interaction logic is currently tested. A single config module with a typed schema would become a testable boundary: tests assert `loadConfig()` applies defaults correctly, that `SENSITIVITY_THRESHOLDS` maps correctly, and that the content script, popup, and options page agree on defaults.
- **Description:** Divergence has already occurred: `showBadge` appears in `options.js` and `background.js` but is absent from content.js's `DEFAULT_CONFIG`. Any future config addition requires touching three files with no mechanism to detect mismatches.

### The embedding IPC call is independently re-implemented in options.js

- **Cluster:** `src/semantic-bridge.js` (`_embedSentences`, `getSemanticScore`), `src/options/options.js` (`embedPhrase`)
- **Coupling:** `semantic-bridge.js` provides `getSemanticScore()` for the content script. But `options.js` independently re-implements `chrome.runtime.sendMessage({ type: "embed", sentences })` with its own identical 30-second timeout and its own error handling, to embed a single user-added phrase. Both implementations share no code but must stay in sync on message format, timeout value, and response shape.
- **Dependency category:** Ports & Adapters — the boundary is the `chrome.runtime.sendMessage` IPC to the background service worker. The content script and the options page are different execution contexts both sending to the same port.
- **Test impact:** The IPC call in `options.js` is untested. Extracting a shared `embedSentences(sentences)` adapter importable by both contexts would make the IPC layer testable with a mock transport, replacing the current end-to-end dependency on the running model.
- **Description:** If the message protocol changes (e.g., adding a `version` field, renaming `embeddings`), both call sites must be updated independently. The duplicate 30s timeout constant is a small but concrete signal of drift risk.

---

## Moderate

### splitSentences is implemented twice with different behavior

- **Cluster:** `src/detector.js` (`splitSentences`), `src/semantic-bridge.js` (`_splitIntoSentences`)
- **Coupling:** Both functions split post text into sentences before processing. `detector.js` splits on `/[.!?]+/` with no minimum length. `semantic-bridge.js` splits on `/[.!?\n]+/` (adds newline) and filters out sentences shorter than 10 characters. Since the heuristic and semantic pipelines analyze the same post, divergent sentence boundaries mean a sentence the cooccurrence scorer sees may not be the same unit the semantic scorer embeds.
- **Dependency category:** In-process — pure functions, no I/O.
- **Test impact:** The behavioral difference (minimum length, newline splitting) is currently untested. A single `splitSentences(text, options)` in a shared location would be testable directly and make the difference explicit rather than accidental.
- **Description:** Low risk today because the two scorers are independent, but it makes reasoning about "what does the extension see in this post" harder — you have to check two implementations.

### Banner content data is entangled inside the render loop

- **Cluster:** `src/content.js` — `ROAST_MESSAGES`, `PROMOTED_ROAST_MESSAGES`, `BANNER_IMAGES`, `PROMOTED_BANNER_IMAGES` arrays, `getRandomRoast`, `getRandomBannerImage`, and the banner HTML template inside `render()`
- **Coupling:** `render()` both performs layout geometry work (getBoundingClientRect, clipPath, translate transforms) and assembles banner HTML (picking roast messages, image URLs, mode-specific class names, HTML template). The banner content data is conceptually separable from the rendering geometry but lives in the same function.
- **Dependency category:** In-process — no I/O, all in-memory DOM.
- **Test impact:** No tests exist for banner creation. Extracting `buildBanner(entry, mode, isDark)` from the layout loop would make the HTML structure testable independently of the scroll/position machinery.
- **Description:** Moderate friction. The render function is already complex due to the read/write phase split and the slow-path rescan logic. Mixing banner content assembly into the same function increases cognitive load when debugging layout issues.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| Important | 2 |
| Moderate | 2 |
| **Total** | **5** |
