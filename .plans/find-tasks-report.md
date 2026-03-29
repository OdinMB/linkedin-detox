# Improvement Opportunities — LinkedIn Detox

**Date:** 2026-03-28
**Scope:** Full codebase (src/, scripts/, manifest.json, .context/). Excluded: node_modules, src/lib/transformers.min.js (vendored), src/models/ (binary model files).
**Automated tool findings:** 61 tests pass (3 test files). `npm audit` — 0 vulnerabilities. No linter configured.

---

## Critical

### Hash collision risk causes wrong post to be blocked or dismissed
**Location:** `src/content.js:174-180`
**Category:** Error Handling / Security
**Description:** `hashText` uses a 32-bit DJB2 variant. JavaScript coerces the result to a signed 32-bit integer, giving roughly 4 billion possible values. With thousands of posts across long sessions, collisions will occasionally occur. A collision causes the wrong post to receive a roast banner (false positive) or, worse, dismissing one post will also dismiss another post that shares the same hash, potentially hiding posts the user wanted to see. The `blockedSet` Map is keyed on `String(h)`, so a collision silently overwrites the entry.
**Suggestion:** Use a 64-bit hash (e.g. FNV-1a with a BigInt accumulator) or a short SHA-256 snippet via the Web Crypto API (`crypto.subtle.digest` is available in content scripts). Alternatively, append the post's character count to the hash string as a cheap disambiguation — `String(h) + ":" + text.length` — which eliminates nearly all false collisions with zero CPU cost.

---

## Important

### `SENSITIVITY_THRESHOLDS` constant duplicated across two files
**Location:** `src/content.js:106`, `src/popup/popup.js:8`
**Category:** Duplication
**Description:** The object `{ chill: 50, suspicious: 25, unhinged: 1 }` is copy-pasted verbatim in both files. If a new sensitivity level is added, or an existing threshold value is adjusted, it must be changed in two places. The popup already writes the resolved `threshold` value to `chrome.storage.sync`, so `content.js` could trust that value and remove its own copy of the map — but the current code re-derives it from the `sensitivity` string anyway in `loadConfig` and in the `onChanged` listener.
**Suggestion:** Remove `SENSITIVITY_THRESHOLDS` from `content.js`. `loadConfig` should use the stored `threshold` value directly (the popup writes it). The `onChanged` listener can do the same: when `sensitivity` changes, the popup simultaneously writes the derived `threshold`; `content.js` just needs to pick up `changes.threshold.newValue`. This eliminates the duplication and makes `content.js` agnostic about what the numeric threshold levels are.

### `escapeHtml` utility duplicated in `content.js` and `options.js`
**Location:** `src/content.js:100-102`, `src/options/options.js:104-106`
**Category:** Duplication
**Description:** The identical four-replacement HTML-escaping function is defined twice. Any future need to escape additional characters (e.g. single quotes for attribute safety) requires updating both copies.
**Suggestion:** Because the project has no build step, a shared module approach is not straightforward. The simplest option is to use the browser's built-in escaping: `document.createTextNode(str).textContent` for text nodes, or `element.textContent = str` for element content. For HTML attributes, use `element.setAttribute(name, value)` instead of string interpolation. This eliminates the need for the function entirely in both places and is safer (no risk of missing an escape case).

### `blockedCount` session stat is reset on page reload, not persisted across tabs
**Location:** `src/content.js:138`, `src/content.js:183-184`
**Category:** Error Handling / Architecture
**Description:** `currentConfig._blocked` is initialized to `0` on every `loadConfig()` call, then incremented and written to `chrome.storage.local.blockedCount`. This means each tab starts its counter from zero but overwrites the shared `blockedCount` in storage — so opening LinkedIn in two tabs causes them to race and overwrite each other's counts. The badge count displayed to the user becomes meaningless or fluctuates unexpectedly.
**Suggestion:** Instead of storing a local mirror of the count in `currentConfig._blocked` and setting the absolute value, read the current `blockedCount` from `chrome.storage.local` first and increment from there, or use a dedicated increment-and-get helper. Better yet, the badge count update is inherently a background concern — route the increment through a message to `background.js` which owns the badge, avoiding the multi-tab race entirely.

### Semantic pass does not call `analyzePostAsync` from `detector.js` — bypasses the tested abstraction
**Location:** `src/content.js:399-417`
**Category:** Architecture / Convention Compliance
**Description:** `content.js` has its own `runSemanticPass` function that directly calls `getSemanticScore` (from `semantic-bridge.js`) and handles threshold comparisons inline. Meanwhile, `detector.js` exports `analyzePostAsync` which encapsulates exactly this two-pass logic (sync heuristics + optional semantic pass, merged with max-of-scores). The `analyzePostAsync` interface even accepts a `getSemanticScore` callback for injection. The result is that the architectural seam in `analyzePostAsync` is tested but the code path actually used in production (`runSemanticPass`) is not tested.
**Suggestion:** Replace `runSemanticPass` with a call to `analyzePostAsync`, passing `getSemanticScore` as `config.getSemanticScore`. This routes the live code through the tested function, removes ~20 lines of duplicate logic, and closes the gap between what the tests verify and what actually runs.

### `_blocked` count stored as a mutable property on `currentConfig` object
**Location:** `src/content.js:138`, `src/content.js:183`
**Category:** Code Structure / Conventions
**Description:** Session state (`_blocked`) is stored as a private underscore-prefixed property directly on the `currentConfig` object that mirrors `chrome.storage.sync` settings. This conflates two different concerns: persisted user settings and ephemeral runtime counters. The `chrome.storage.onChanged` listener iterates all changed keys and writes them to `currentConfig` — if `_blocked` ever ends up in a storage change event, it would be overwritten silently. The convention (underscore prefix) to signal "private" is weak documentation.
**Suggestion:** Extract `blockedCount` into its own module-level variable (e.g., `let sessionBlockedCount = 0`) instead of attaching it to `currentConfig`. This separates runtime state from configuration state and makes the code easier to reason about.

### No linter configured — code style inconsistencies will accumulate
**Location:** `package.json`
**Category:** Convention Gaps / Tooling
**Description:** The project has no ESLint or Prettier configuration. Several minor inconsistencies are already visible: `content.js:91` uses a one-liner function body with `try/catch` on a single line, while the rest of the codebase uses standard multi-line formatting. There is no enforcement of `"use strict"` in content scripts (which matters for MV3's module-less content script context). Without a linter, style drift is inevitable as the codebase grows.
**Suggestion:** Add a minimal `.eslintrc.json` with the browser environment and a small rule set (`no-unused-vars`, `no-undef`, `eqeqeq`). If Prettier is undesirable, at minimum add an `.editorconfig`. Neither requires a build step — ESLint can run as a `npm run lint` script.

### `render()` slow path runs on every scroll when `blockedSet.size > liveBanners.size`
**Location:** `src/content.js:314`
**Category:** Performance
**Description:** The condition `blockedSet.size > liveBanners.size && now - lastSlowPathTime > 200` triggers the expensive DOM-scanning slow path on every scroll if the user has any dismissed posts (which remove entries from `liveBanners` but not `blockedSet`, so the size inequality is permanently true). The comment says "throttled to 500ms" but the actual throttle is `200ms`. This means `querySelectorAll(POST_SELECTOR)` and `innerText` reads run every 200ms during any scroll, even when all visible blocked posts already have banners.
**Suggestion:** Track dismissed hashes separately from `blockedSet` so that the size comparison reflects genuinely unrendered blocked posts. Alternatively, maintain a `pendingRenderCount` variable that decrements when a banner is created and increments when a new post is blocked, and use that instead of the size delta. Also correct the comment to match the actual 200ms throttle, or change the value to 500ms as documented.

---

## Moderate

### CSS design tokens duplicated between `popup.html` and `options.html`
**Location:** `src/popup/popup.html:6-43`, `src/options/options.html:7-43`
**Category:** Duplication
**Description:** The full set of CSS custom properties (`:root` and `[data-theme="dark"]` blocks) is copy-pasted identically in both HTML files. The toggle switch `.switch`, `.slider` component styles are also duplicated. Any theme colour change must be applied in two places.
**Suggestion:** Extract shared tokens and component styles into a `src/shared.css` file and reference it via `<link>` in both HTML files. This is a straightforward change that requires no build step. The manifest does not need updating because CSS in extension HTML pages loads normally.

### `dismissedPosts` uses a `WeakSet` but post elements are re-created by React virtualization
**Location:** `src/content.js:170`, `src/content.js:220`, `src/content.js:430`
**Category:** Architecture
**Description:** `dismissedPosts` is a `WeakSet` keyed by DOM element references. When LinkedIn's React virtualizer destroys and recreates a post element (which it does on scroll), the old element reference is garbage-collected and removed from the WeakSet. The newly created element for the same post will not be in the WeakSet — so the dismissed post will be re-scanned and (if it was previously blocked) `analyzedHashes` will prevent re-analysis, meaning it won't be re-blocked. However, if the hash was evicted from `analyzedHashes` (due to the 2000-entry cap), the post gets re-analyzed and re-blocked despite having been dismissed. The `WeakSet` approach works for a single tab session with few posts, but breaks down silently.
**Suggestion:** Store dismissed hashes (strings) in a `Set` (`dismissedHashes`) instead of element refs in a `WeakSet`. Check `dismissedHashes.has(hash)` after computing the hash in `scanFeed`, before proceeding with analysis. This is robust to element recreation and virtualization.

### `splitSentences` in `detector.js` and `_splitIntoSentences` in `semantic-bridge.js` do the same thing with slightly different implementations
**Location:** `src/detector.js:15-17`, `src/semantic-bridge.js:64-66`
**Category:** Duplication
**Description:** Both functions split text into sentences. `detector.js` uses `/[.!?]+/` and filters `s.trim().length > 0`; `semantic-bridge.js` uses `/[.!?\n]+/` and filters `s.trim().length > 10`. The semantic version also includes newlines and has a minimum length of 10 characters, which is reasonable for embedding (very short fragments aren't worth embedding). These diverge silently and there is no comment explaining why the minimum lengths differ.
**Suggestion:** Since `semantic-bridge.js` is a content script and `detector.js` exports a testable module, the shared logic can't easily move to a shared module without a build step. At minimum, add a comment in each explaining why they differ (or consolidate the filter threshold). If the 10-character minimum is intentional for the semantic path, consider exporting `splitSentences` from `detector.js` and reusing it in `semantic-bridge.js` with a wrapper that applies the minimum length filter.

### `web_accessible_resources` uses a wildcard that exposes all files in `src/lib/`
**Location:** `manifest.json:40-43`
**Category:** Security
**Description:** The declaration `"src/lib/*"` makes all files in `src/lib/` accessible from any LinkedIn page context. Currently only `transformers.min.js` lives there, but if additional files are added to `src/lib/` in the future (e.g., a utility module with internal logic), they will be unintentionally web-accessible. The LinkedIn host can load these files with `fetch` or `<script>` tags.
**Suggestion:** Change `"src/lib/*"` to the specific files that actually need web accessibility. `transformers.min.js` is loaded by `offscreen.js` (an extension page), not directly by the content script, so it may not need to be web-accessible at all — verify and remove if not needed.

### `options.js` renders list HTML via innerHTML string interpolation with `escapeHtml`
**Location:** `src/options/options.js:110-191`
**Category:** Security
**Description:** The render functions (`renderSignalWords`, `renderCoocPatterns`, `renderSemanticPhrases`) build HTML strings via template literals and set `innerHTML`. While user-supplied strings are passed through `escapeHtml`, the function only escapes `&`, `<`, `>`, and `"`. A value containing a single quote inside an attribute delimited by single quotes (not used here, but possible in future changes) would not be escaped. The broader concern is that innerHTML-based rendering is fragile — any future addition that forgets `escapeHtml` introduces XSS.
**Suggestion:** Use DOM construction APIs (`document.createElement`, `element.textContent = value`, `element.appendChild`) instead of innerHTML string building. This eliminates the XSS surface entirely and removes the dependency on a correctly-implemented escapeHtml. The render functions are short enough to convert without much effort.

### `content.js` hard-reload on settings change is too aggressive
**Location:** `src/content.js:163`
**Category:** Performance / User Experience
**Description:** Any change to `chrome.storage.sync` (except theme-only and `userSemanticPhrases`) triggers `window.location.reload()`. This means toggling "Block promoted posts" or "Semantic detection" reloads the LinkedIn tab, losing scroll position and the user's place in the feed. The reload is a blunt workaround for resetting extension state.
**Suggestion:** Instead of reloading, update `currentConfig` in place (already done for most keys in the `onChanged` listener) and reset only what needs resetting: clear `analyzedHashes`, `blockedSet`, `liveBanners`, and reset `globalPostIndex` to allow re-scanning with the new config, then call `scanFeed`. This would make settings changes instant and non-disruptive.

### `recordBlocked` writes to `chrome.storage.local` on every blocked post individually
**Location:** `src/content.js:183-184`
**Category:** Performance
**Description:** Each call to `recordBlocked` immediately calls `chrome.storage.local.set({ blockedCount: ... })`. On a feed with many blocked posts (especially with "unhinged" sensitivity), this fires a storage write for every post. `chrome.storage.local.set` is asynchronous but the return value is ignored — if many posts are blocked in quick succession (e.g., initial page load), this creates many concurrent storage writes.
**Suggestion:** Debounce the storage write: accumulate the count in memory and flush to storage after a short idle (e.g., 500ms debounce). Or batch the flush at the end of each `scanFeed` call rather than inside `recordBlocked`.

---

## Nice-to-Have

### Missing test for `isContextValid` and context-invalidation behavior
**Location:** `src/content.js:90-92`
**Category:** Test Coverage
**Description:** The `isContextValid()` function guards all render/scan entry points but is not tested. The behavior when a context becomes invalid (extension reload while tab is open) is an important edge case for an MV3 extension — the `chrome.runtime.id` check can throw in exactly this scenario.
**Suggestion:** Add a test that mocks `chrome.runtime.id` throwing and verifies that `isContextValid` returns `false` without propagating the exception. Since these are browser-context globals, a vitest mock setup file could provide minimal `chrome` stubs.

### No test coverage for `content.js` logic (scanFeed, render, recordBlocked)
**Location:** `src/content.js`
**Category:** Test Coverage
**Description:** `content.js` is the largest and most complex file in the project (529 lines) and has zero test coverage. The core logic — `scanFeed`, `render`, `hashText`, `recordBlocked`, and the `MutationObserver` setup — is entirely untested. This is understandable given the DOM dependency, but the pure-logic functions (`hashText`, threshold derivation, `loadConfig` parsing) could be extracted and unit tested without browser mocks.
**Suggestion:** Extract `hashText` and the RegExp construction in `loadConfig` into `detector.js` or a small shared utility, making them testable in Node/vitest. For `scanFeed` and `render`, consider a light integration test using `jsdom` (vitest's default environment) with a mocked `chrome` global — the overlay/banner creation logic is non-trivial enough to warrant basic smoke tests.

### `build-zip.js` uses `execSync` with shell string interpolation for file paths
**Location:** `scripts/build-zip.js:93-98`
**Category:** Security
**Description:** On Windows, `execSync` is called with a PowerShell command string that interpolates `tmpDir` and `zipPath` directly. These values are derived from `__dirname` and manifest version and are therefore not user-controlled — but the pattern is fragile: any path containing spaces or special characters would break the command. The Unix branch uses `cd && zip` which has the same issue.
**Suggestion:** Use Node's built-in `fs` and `zlib`/`archiver` APIs (or the `archiver` npm package) instead of shelling out to PowerShell/zip. Alternatively, validate that paths do not contain problematic characters before constructing the shell command, and wrap both paths in escaped quotes consistently.

### Magic numbers in scoring formulas lack named constants
**Location:** `src/detector.js:36`, `src/detector.js:123`, `src/detector.js:198`, `src/semantic-scorer.js:42-48`
**Category:** Hardcoded Values
**Description:** Several scoring coefficients are inline magic numbers: `* 50` in `emDashScorer`, `* 800` in `wordFrequencyScorer`, `* 25` in `cooccurrenceScorer`, and the `0.60`/`0.75`/`50`/`80` interpolation thresholds in `scoreFromSimilarity`. These are calibration values that may need tuning, but their intent is not immediately obvious from the code.
**Suggestion:** Extract these as named constants at the top of each file or function (e.g., `const EM_DASH_SCORE_MULTIPLIER = 50`, `const COSINE_LOW_THRESHOLD = 0.60`). This makes the calibration values easier to find and adjust, and the inline formulas self-documenting.

### `getRandomRoast` and `getRandomBannerImage` could produce the same value on consecutive blocked posts
**Location:** `src/content.js:85-98`
**Category:** Nice-to-Have
**Description:** Both functions use `Math.random()` with no deduplication, so it's possible (and with 11 banner images, fairly likely with a large blocked set) to see the same banner image or roast message on consecutive posts. For a "built for laughs" extension this is a minor polish item.
**Suggestion:** Use a simple shuffle-draw approach: maintain a shuffled copy of each array and draw sequentially, reshuffling when exhausted. This ensures every message and image is seen before any repeats.

### `offscreen.js` model load failure is silent to the user
**Location:** `src/offscreen.js:37-40`
**Category:** Error Handling
**Description:** If the bundled model fails to load (e.g., ONNX files corrupted or missing from the zip), `pipelineInstance` is set to `null` and subsequent embed requests return `{ embeddings: [], error: "Model not loaded" }`. The error is logged in `offscreen.js` and warned in `semantic-bridge.js`, but the user sees nothing — semantic detection silently stops working with no indication in the popup or options page.
**Suggestion:** Add a visual indicator in the popup when semantic scoring is enabled but the model failed to load. A message event from the offscreen document to the background service worker, surfaced via `chrome.storage.local`, could set a `semanticModelError: true` flag that the popup reads on open.

### `analyzedHashes` eviction uses `.values().next().value` — evicts insertion order, not LRU
**Location:** `src/content.js:437-439`
**Category:** Performance
**Description:** When `analyzedHashes` exceeds 2000 entries, the oldest-inserted entry is evicted. This is FIFO eviction using JavaScript `Set`'s insertion-order iteration. For a LinkedIn session where the user scrolls through hundreds of posts, the eviction strategy means early posts (which will never be re-encountered) occupy slots while more recently seen posts (which may scroll back into view) might be evicted first after wrap-around. In practice the 2000-entry cap is large enough that this is unlikely to matter, but it's worth noting.
**Suggestion:** The current behavior is acceptable. If memory becomes a concern, consider lowering the cap or switching to a Map-based LRU. No immediate action needed.

### `content.js` has a hardcoded LinkedIn DOM selector that may break on LinkedIn UI updates
**Location:** `src/content.js:196-197`
**Category:** Hardcoded Values
**Description:** `FEED_SELECTOR` and `POST_SELECTOR` are hardcoded CSS attribute selectors (`componentkey='container-update-list_mainFeed-lazy-container'` and `data-display-contents="true"`). LinkedIn has no versioned API contract on these selectors — they may change at any time. The `.context/linkedin-dom-challenges.md` file notes that these selectors were confirmed working in March 2026.
**Suggestion:** Add a sentinel check: if `document.querySelectorAll(POST_SELECTOR).length === 0` after the initial delayed scans, log a prominent warning to the console (even without `debugLogging`) indicating the selector may be stale. This makes breakage visible without requiring debug mode. Document the selector version date in `CLAUDE.md` or `.context/` for easier future identification.

---

## Convention Gap Recommendations

Patterns observed but not documented — consider adding to `.context/` or `CLAUDE.md`:

1. **Scorer return contract**: All heuristic scorers (including `computeSemanticScore`) return `{ score: number (0-100), matches: string[] }`. This contract is described in CLAUDE.md for the top-level `analyzePost` interface but not for the individual scorer functions. A brief `.context/scorer-contract.md` or addition to CLAUDE.md would clarify the expected shape for anyone adding a new scorer.

2. **Module export pattern for dual-environment files**: `detector.js` and `semantic-scorer.js` use `if (typeof module !== "undefined" && module.exports) { ... }` to export for testing while running as plain scripts in the browser. This pattern is used in exactly two files but should be documented as the canonical approach for any future testable modules, rather than being discovered by imitation.

3. **Content script load order dependency**: The manifest loads content scripts in a specific order: `detector.js` → `semantic-scorer.js` → `semantic-bridge.js` → `content.js`. This order is a hard dependency (`content.js` calls `analyzePost` and `getSemanticScore` which are defined in earlier files). This implicit ordering is not documented anywhere and would be easy to break when adding new content scripts. Document in CLAUDE.md.

4. **`chrome.storage.local` for large/ephemeral data vs `chrome.storage.sync` for settings**: The pattern of using `local` for embeddings (`userSemanticPhrases`, `blockedCount`) and `sync` for settings is followed consistently but only partially documented. The CLAUDE.md mentions it but not the size-quota motivation (sync has a 100KB per-item and 8KB per-item quota). Add a note explaining which storage to use for what, to guide future additions.

---

## Metrics Summary

| Lens | Critical | Important | Moderate | Nice-to-have |
|------|----------|-----------|----------|--------------|
| Security | 1 | 0 | 2 | 0 |
| Performance | 0 | 1 | 2 | 1 |
| Test Coverage | 0 | 1 | 0 | 2 |
| Convention Compliance | 0 | 0 | 0 | 0 |
| Convention Gaps | 0 | 0 | 0 | 4 |
| Duplication | 0 | 2 | 2 | 0 |
| Decomposition | 0 | 1 | 0 | 0 |
| Dead Code | 0 | 0 | 0 | 0 |
| Type Safety | 0 | 0 | 0 | 0 |
| Error Handling | 0 | 1 | 1 | 1 |
| Dependency Health | 0 | 0 | 0 | 0 |
| Hardcoded Values | 0 | 0 | 1 | 2 |
| Stale TODOs | 0 | 0 | 0 | 0 |
| Architecture | 0 | 2 | 2 | 0 |
| **Total** | **1** | **8** | **10** | **10** |
