# Improvement Opportunities — LinkedIn Detox

**Date:** 2026-03-27
**Scope:** Full codebase (src/, scripts/, manifest.json, tests) — node_modules excluded
**Automated tool findings:** All 54 tests pass. 0 npm vulnerabilities. No linter configured (no ESLint/Prettier). No type checker (vanilla JS).

---

## Critical

### Hash collisions silently misidentify posts
**Location:** `src/content.js:140-146`
**Category:** Error Handling / Architecture
**Description:** `hashText()` uses a 32-bit djb2 hash. With a large feed and repeated browsing, two different posts can produce the same hash integer. When that happens, the wrong post gets a banner (or a genuinely-sloppy post is invisible to detection). The hash is used as a Map key, a dataset attribute on buttons, and as a lookup key in `blockedSet`. There is no collision detection or fallback.
**Suggestion:** Upgrade to a longer hash (FNV-1a with BigInt or a short UUID on first seen), or append a sequential counter as a tiebreaker. At minimum, document the known collision probability.

---

## Important

### `storage.onChanged` triggers full page reload for nearly every setting change
**Location:** `src/content.js:115-132`
**Category:** Performance / UX
**Description:** Any `sync` storage change (enabling semantic scoring, changing sensitivity, etc.) calls `window.location.reload()`. This is jarring for users who make quick adjustments in the popup, and reloads lose all in-page state. The only carve-out is for theme changes. Changes that don't affect detection (e.g., `showBadge`, `debugLogging`) still trigger a reload unnecessarily.
**Suggestion:** Instead of reloading, update `currentConfig` in place and re-run `scanFeed`. Reserve reload only for config changes that truly need it (e.g., `semanticEnabled` toggling the offscreen document). Apply `showBadge` and `debugLogging` changes without any reload.

### Blocked post count is not reset between sessions
**Location:** `src/content.js:148-157`, `src/background.js:29-42`
**Category:** UX / Bug
**Description:** `currentConfig._blocked` and `chrome.storage.local` `blockedCount` are never reset when the user starts a new browsing session. The badge and popup counter reflect a cumulative all-time count, not a per-session count. The CLAUDE.md says these are "session stats," but nothing resets them. A user who blocked 200 posts last week still sees 200 in the badge today.
**Suggestion:** Reset `blockedCount` to 0 in `chrome.storage.local` at extension startup (via `chrome.runtime.onInstalled` or `chrome.runtime.onStartup` in `background.js`), making it genuinely session-scoped.

### `chrome.storage.sync` quota not checked when saving user patterns
**Location:** `src/options/options.js:202-207`
**Category:** Error Handling
**Description:** `savePatterns()` writes `userSignalWords` and `userCooccurrencePatterns` to `chrome.storage.sync` without checking quota. `chrome.storage.sync` has a 8KB per-item limit and a 100KB total limit. Users who add many custom words or patterns could silently fail to save, with no error surfaced in the UI. The callback from `chrome.storage.sync.set()` is not inspected for `chrome.runtime.lastError`.
**Suggestion:** Add a callback to `chrome.storage.sync.set()` that checks `chrome.runtime.lastError` and surfaces a warning (e.g., update `embed-status` or show an inline message) if quota is exceeded.

### `analyzePostAsync` skips semantic scoring for already-caught posts but doesn't document this in a testable way
**Location:** `src/detector.js:243-260`, `src/content.js:295-341`
**Category:** Architecture / Test Coverage
**Description:** `analyzePostAsync` in `detector.js` always calls `getSemanticScore` when `semanticEnabled` is true, even if the sync score already exceeds the threshold. The actual "skip semantic if already blocked" optimization is in `content.js:scanFeed` (line 327: `if (result.blocked) return; ... pendingSemanticChecks.push(...)`). But `analyzePostAsync` itself re-runs semantic even when blocked, which could lead to the optimization being bypassed if callers use `analyzePostAsync` directly. There's a mismatch between the documented two-pass design and the actual contract of the function.
**Suggestion:** Either add a fast-path guard in `analyzePostAsync` (`if (syncResult.blocked) return syncResult`), or document clearly in the function's JSDoc that the skip-if-already-blocked optimization is a caller responsibility, and add a test for the fast-path case.

### `escapeHtml` is duplicated across `content.js` and `options/options.js`
**Location:** `src/content.js:72-74`, `src/options/options.js:102-104`
**Category:** Duplication
**Description:** The identical `escapeHtml` function is copy-pasted in both files. Any fix or improvement to one will not propagate to the other.
**Suggestion:** Extract to a shared `src/utils.js` file and import it in both places (or inline as a one-liner where only one escape type is needed). Since there's no build step, the simplest option is a shared module loaded as a content script if needed, or duplicate-but-document as a known duplication if sharing would complicate the manifest.

### Missing `aria-live` region for dynamically injected banners
**Location:** `src/content.js:232-263`, `src/content.css`
**Category:** Accessibility
**Description:** Roast banners are injected into a fixed overlay via JavaScript with no ARIA announcements. Screen reader users will not be told that a post was blocked or that a new banner has appeared. The close button has `aria-label="Dismiss"`, which is good, but the banner content itself is invisible to screen readers in the context of a live feed.
**Suggestion:** Add `role="status"` or `aria-live="polite"` to `#ld-overlay`, and add a visually-hidden but accessible heading or description that identifies the blocked post region. Consider adding `role="dialog"` or `role="alert"` to individual banners.

### `SENSITIVITY_THRESHOLDS` is defined twice with identical values
**Location:** `src/content.js:78`, `src/popup/popup.js:8`
**Category:** Duplication / Convention Violation
**Description:** The `{ chill: 50, suspicious: 25, unhinged: 1 }` object appears independently in both `content.js` and `popup.js`. The popup saves the threshold to storage; `content.js` re-derives it from the sensitivity string independently. If the thresholds diverge, behavior will silently differ.
**Suggestion:** Make the popup the single source of truth: it writes `threshold` to storage and `content.js` should read `threshold` directly from storage (which it already does via `loadConfig`). Remove the duplicate constant from `content.js` and delete the re-derivation in `loadConfig` (line 102: `items.threshold = SENSITIVITY_THRESHOLDS[items.sensitivity] || 25`). Trust the popup to have already converted sensitivity to threshold.

---

## Moderate

### `render()` is called on every scroll rAF frame even when nothing changed
**Location:** `src/content.js:379-388`
**Category:** Performance
**Description:** The scroll handler calls `render()` on every `requestAnimationFrame`, which calls `document.querySelectorAll(POST_SELECTOR)` and iterates all posts, even when no new posts appeared and no banners changed position meaningfully. On a long feed this could waste CPU on every scroll tick.
**Suggestion:** Only reposition banners when they are currently visible or when the set of visible posts actually changes. A cheap guard: compare the scroll position delta — if it's less than 5px, skip the re-render. Alternatively, only re-render when `blockedSet.size > 0`.

### No `vitest.config.js` — test coverage reporting is unavailable
**Location:** `package.json`
**Category:** Test Coverage
**Description:** There is no vitest configuration file and no `--coverage` flag in `npm test`. It's impossible to get a coverage report without manually adding one. The test suite is good but coverage for edge cases in `content.js`, `semantic-bridge.js`, and `offscreen.js` is entirely absent (those files are browser-only and untested).
**Suggestion:** Add a `vitest.config.js` with `coverage: { reporter: ["text", "lcov"] }` and a `test:coverage` script in `package.json`. Document which files are intentionally excluded (browser-only files that need Chrome APIs).

### `_splitIntoSentences` in `semantic-bridge.js` differs from `splitSentences` in `detector.js`
**Location:** `src/semantic-bridge.js:64-66`, `src/detector.js:15-17`
**Category:** Duplication / Convention Gap
**Description:** `detector.js` uses `/[.!?]+/` to split sentences; `semantic-bridge.js` uses `/[.!?\n]+/` and adds a minimum length filter (`> 10`). The different splitting strategies mean heuristic and semantic scorers analyze the same post with inconsistent sentence boundaries. A sentence that heuristics count as one unit may be counted as multiple units by the semantic scorer.
**Suggestion:** Consolidate into a single exported `splitSentences(text)` function (ideally in `semantic-scorer.js` or a shared utils module). The `length > 10` filter in the semantic version is a useful guard — consider adding it to the heuristic version too.

### `contenteditable`-style inputs for co-occurrence groups have poor UX
**Location:** `src/options/options.html:482-484`
**Category:** UX
**Description:** The co-occurrence pattern input uses two text inputs for Group A and Group B that accept comma-separated strings. There is no validation feedback when a user enters an empty string, a group with only whitespace, or a label that already exists. Users can silently add duplicate or broken patterns.
**Suggestion:** Add inline validation: highlight inputs in red when empty after a failed add attempt, show a count of how many words were parsed from the comma-separated input, and prevent duplicate labels.

### No keyboard shortcut or quick-dismiss for banners
**Location:** `src/content.js`, `src/content.css`
**Category:** UX
**Description:** The only way to dismiss a banner is to click the tiny close button. There's no keyboard shortcut (e.g., pressing Escape or a number key) and no way to dismiss all banners at once. Power users browsing with keyboard navigation will find this frustrating.
**Suggestion:** Add a keyboard listener in `content.js` for `Escape` that dismisses the topmost (most recently rendered) banner, and possibly a "Dismiss all" option.

### `globalPostIndex` is never reset, only increments
**Location:** `src/content.js:138`
**Category:** Bug / Dead Code
**Description:** `globalPostIndex` is incremented for every post scanned and is used only for test mode (forcing specific post indices to be blocked). It's module-level state that grows forever during a session. If LinkedIn loads 200+ posts during a long session, the index drifts far past what test mode checks for (indices 2 and 4), making test mode functionally unreachable on a well-loaded feed.
**Suggestion:** For test mode purposes, use a local counter per scan call, or reset `globalPostIndex` when appropriate. Alternatively, change test mode to block the 3rd and 5th posts *not already blocked* rather than using a global index.

### Hardcoded CSS color values in `content.css` diverge from CSS variables in popup/options
**Location:** `src/content.css:23-24,63-64,84-85`, etc.
**Category:** Hardcoded Values / Convention Gap
**Description:** `content.css` uses hardcoded hex values (`#ffffff`, `#d0c9b8`, `#7a6210`, `#0d0d0d`, `#333333`, `#39ff14`) instead of CSS variables. Meanwhile `popup.html` and `options.html` use CSS custom properties (`--bg-primary`, `--border`, `--accent`, etc.) with matching values. If the theme palette changes, `content.css` will need to be updated separately and manually, and it's easy for them to drift.
**Suggestion:** Move the color definitions into a shared CSS variable block. Since `content.css` is injected into the LinkedIn page (not an extension page), CSS variables from the extension page can't be inherited — but `content.js` could dynamically inject a `<style>` tag with the correct variable values based on the current theme, letting `content.css` reference those variables.

### `options.js` has no input length limits for custom signal words
**Location:** `src/options/options.js:285-293`
**Category:** Security / UX
**Description:** The signal word input accepts any string of any length. A user could accidentally paste a large blob of text, which would be stored in `chrome.storage.sync` and then compiled to a RegExp on every page load in `content.js` (line 104-107). A very long pattern could cause `new RegExp(...)` to hang or produce unexpected behavior.
**Suggestion:** Add `maxlength` attribute to `#new-signal-word` (e.g., 80 characters), and validate in the click handler that the input is a reasonable word (e.g., no whitespace, no regex special characters unless intentional).

### `chrome.runtime.lastError` not checked in `content.js` `loadConfig`
**Location:** `src/content.js:99-113`
**Category:** Error Handling
**Description:** The callback passed to `chrome.storage.sync.get()` in `loadConfig` does not check `chrome.runtime.lastError`. If storage is unavailable or the call fails, the callback will be invoked with the defaults silently and the error will go unnoticed.
**Suggestion:** Add `if (chrome.runtime.lastError) { console.error(...); }` at the start of the callback, similar to how `background.js` and other places handle it.

### Retry scans at hardcoded 1s/3s/6s timeouts
**Location:** `src/content.js:374-376`
**Category:** Hardcoded Values
**Description:** Three `setTimeout` retry scans are hardcoded at 1000ms, 3000ms, and 6000ms. These are magic numbers with no named constants, making it hard to understand their intent or tune them.
**Suggestion:** Extract to named constants like `RETRY_DELAYS_MS = [1000, 3000, 6000]` and iterate over them. Add a brief comment explaining why three retries are needed (React async rendering).

---

## Nice-to-Have

### `ROAST_MESSAGES` array has no tests and could easily break silently
**Location:** `src/content.js:12-43`
**Category:** Test Coverage
**Description:** The 30 roast messages are never tested. If a message inadvertently contains HTML-unsafe characters, `escapeHtml` would catch it — but `escapeHtml` is only called on `entry.roastMessage` in the `metaLine` context, not on the message itself (line 257 uses `escapeHtml(entry.roastMessage)` — actually this is fine). However, there's no test that `getRandomRoast()` always returns a defined, non-empty string.
**Suggestion:** Add a simple test that `getRandomRoast()` (if exported) returns a non-empty string and that all messages are unique. Or leave as-is given the project's "built for laughs" scope.

### The `build-zip.js` script uses `execSync` with `powershell` hardcoded for Windows
**Location:** `scripts/build-zip.js:93-98`
**Category:** Convention / Portability
**Description:** The Windows branch calls PowerShell's `Compress-Archive`. This works on Windows but the path quoting could fail if the project root path contains spaces or special characters. The string is constructed via template literal interpolation without escaping.
**Suggestion:** Use the `archiver` npm package or the native `node:zlib` + `node:fs` approach for cross-platform zip creation without shelling out to PowerShell. Or at minimum add a note that paths with spaces may need escaping.

### `phrase-embeddings.json` is ~530KB and loaded fresh on every page visit
**Location:** `src/semantic-bridge.js:39-61`
**Category:** Performance
**Description:** The phrase bank is fetched via `fetch()` on each new page visit (the `_phraseBank` cache is a module-level variable that survives within the content script's lifetime but is recreated each time a new tab opens LinkedIn). The 530KB JSON is parsed and filtered synchronously on the first semantic scoring request. This is an unavoidable one-time cost per tab, but it is not documented as such.
**Suggestion:** Document this as an intentional one-time cost in `.context/semantic-scoring.md`. Optionally compress the JSON or use a binary format for the embeddings to reduce parse time.

### `options.js` renders built-in word list without escaping
**Location:** `src/options/options.js:151-155`
**Category:** Security (Low Risk)
**Description:** `renderBuiltinWords()` inserts items from `BUILTIN_SIGNAL_WORDS` into innerHTML without calling `escapeHtml`. Since these are hardcoded constants in the source file, there is no user-controlled input path, so in practice this poses no real XSS risk. But the inconsistency is worth noting.
**Suggestion:** Either escape all innerHTML insertions for consistency, or use `textContent` for plain-text items to eliminate the inconsistency.

### `mutationCount` is logged only for the first 3 mutations, then silently discarded
**Location:** `src/content.js:366-368`
**Category:** Dead Code / Nice-to-have
**Description:** `mutationCount` accumulates forever but is only used for the first 3 log lines. After that, it's just incrementing a counter that's never read.
**Suggestion:** Remove `mutationCount` entirely, or replace the first-N guard with a proper debug throttle that doesn't require a persistent counter.

### `offscreen.js` logs model load success to console unconditionally
**Location:** `src/offscreen.js:36`
**Category:** Convention
**Description:** `console.log("[LinkedIn Detox Offscreen] Model loaded")` fires unconditionally regardless of the `debugLogging` setting. Users with DevTools open will see this message even with debug logging disabled.
**Suggestion:** Suppress this log in production builds, or gate it behind a configuration check (though offscreen can't read `currentConfig` without a message round-trip, so just removing it or converting to a verbose-only log is simplest).

### Popup sensitivity description in `popup.html` is hardcoded and out of sync with `popup.js`
**Location:** `src/popup/popup.html:334-335`, `src/popup/popup.js:9-13`
**Category:** Convention Gap / Duplication
**Description:** The `#sensitivity-desc` element has hardcoded initial text `"Catches most AI-generated slop (score > 25)."` in the HTML. The actual description is also in `SENSITIVITY_DESCS` in `popup.js`. On load, `updateSensitivityDesc` will overwrite the hardcoded text — but if JS fails or runs late, users briefly see the hardcoded version. It's minor but a small inconsistency.
**Suggestion:** Remove the hardcoded text from the HTML and let `popup.js` fill it in on init, making the HTML the authoritative source of structure and JS the source of content.

### `switch` toggles in popup and options have no `focus-visible` style
**Location:** `src/popup/popup.html:143-181`, `src/options/options.html:163-199`
**Category:** Accessibility
**Description:** The custom toggle switch uses a visually-hidden `<input type="checkbox">` overlaid by a styled `.slider`. When navigating by keyboard, focus styles are suppressed by `opacity: 0` on the input. There is no `:focus-visible` outline on the slider to indicate keyboard focus to users navigating via Tab.
**Suggestion:** Add `.switch input:focus-visible + .slider { outline: 2px solid var(--accent); outline-offset: 2px; }` to both popup.html and options.html CSS.

### No `README.md` — new contributors have no entry point
**Location:** Project root
**Category:** Documentation
**Description:** `CLAUDE.md` contains detailed architecture documentation for AI-assisted development, but there is no `README.md` for human contributors or users discovering the repo on GitHub. The privacy page mentions the GitHub repo (`github.com/OdinMB/linkedin-detox`) and invites code review.
**Suggestion:** Add a brief `README.md` covering: what it does, how to install, how to develop/test, and how to contribute. Reference CLAUDE.md for architecture detail.

---

## Convention Gap Recommendations

Patterns observed in the codebase but not documented in `.context/` or `CLAUDE.md`:

1. **Error logging convention**: Every console call prefixes with `[LinkedIn Detox]` or `[LinkedIn Detox Offscreen]`. This is consistent across all files but not written down anywhere. Document it in `CLAUDE.md` under Conventions so future additions follow the same pattern.

2. **`module.exports` conditional for testability**: `detector.js` and `semantic-scorer.js` use `if (typeof module !== "undefined" && module.exports)` to export in Node (for vitest) while remaining browser-compatible. This pattern should be documented so that any new testable module follows the same approach.

3. **HTML escaping responsibility**: `content.js` uses `escapeHtml` before inserting user-derived data (trigger words, hash values) into innerHTML. `options.js` uses `escapeHtml` for user-stored patterns. The rule "escape anything from storage before innerHTML" is implicit — making it explicit in `CLAUDE.md` would prevent regressions.

4. **rAF-debounced scan scheduling**: Both `scanFeed` scheduling and scroll handling use `requestAnimationFrame` with a pending-flag guard. This pattern is repeated but not documented as the preferred debounce strategy.

---

## Metrics Summary

| Lens | Critical | Important | Moderate | Nice-to-have |
|------|----------|-----------|----------|--------------|
| Security | 0 | 1 | 2 | 1 |
| Performance | 0 | 1 | 1 | 1 |
| Test Coverage | 0 | 0 | 1 | 1 |
| Convention Compliance | 0 | 1 | 0 | 1 |
| Convention Gaps | 0 | 0 | 1 | 4 |
| Duplication | 0 | 2 | 1 | 0 |
| Decomposition | 0 | 0 | 0 | 0 |
| Dead Code | 0 | 0 | 1 | 1 |
| Type Safety | 0 | 0 | 0 | 0 |
| Error Handling | 1 | 1 | 1 | 0 |
| Dependency Health | 0 | 0 | 0 | 0 |
| Hardcoded Values | 0 | 0 | 1 | 0 |
| Stale TODOs | 0 | 0 | 0 | 0 |
| Architecture | 0 | 1 | 1 | 0 |
| Accessibility | 0 | 1 | 0 | 1 |
| UX | 0 | 1 | 2 | 0 |
| **Total** | **1** | **10** | **12** | **10** |
