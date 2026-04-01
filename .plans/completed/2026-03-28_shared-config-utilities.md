# Extract Shared Modules (Config, Utilities, Embed Adapter)

- **Date**: 2026-03-28
- **Status**: completed
- **Type**: refactor

## Problem

Three categories of code are duplicated across content.js, popup.js, options.js, and semantic-bridge.js: config constants/loading, HTML escaping, sentence splitting, and the embedding IPC call. The duplicated `SENSITIVITY_THRESHOLDS` (content.js line 106, popup.js line 8) and `escapeHtml` (content.js line 100, options.js line 111) can drift independently. The `splitSentences` implementations already diverge: detector.js splits on `/[.!?]+/` with no minimum length, while semantic-bridge.js splits on `/[.!?\n]+/` with a 10-char minimum.

## Approach

Create three new files under `src/shared/` that expose functions via the global `window.LinkedInDetox` namespace. This is the standard pattern for no-build-step Chrome extensions where content scripts and HTML pages both need shared code. Each shared file attaches to `window.LinkedInDetox = window.LinkedInDetox || {}` so load order between shared files does not matter. Consumers read from `window.LinkedInDetox.*` (or just `LinkedInDetox.*`).

For test compatibility, each shared file uses the same `if (typeof module !== "undefined" && module.exports)` guard already used by detector.js and semantic-scorer.js.

**Alternatives considered:**
- *ES modules with `type: "module"`* -- Chrome MV3 content scripts don't support ES module imports. Popup/options could use `<script type="module">`, but content scripts can't, so we'd have two different import styles. Rejected for consistency.
- *Keep duplications as-is* -- The `splitSentences` divergence is already a real bug risk (newlines not handled in detector.js). The task explicitly calls for consolidation.

## Changes

| File | Change |
|------|--------|
| `src/shared/config.js` | **New.** Exports `DEFAULT_CONFIG`, `SENSITIVITY_THRESHOLDS`, and `loadConfig(callback)` via `window.LinkedInDetox`. The `loadConfig` function returns a Promise resolving to the config object with threshold computed and user words converted to RegExp. This is the exact logic currently in content.js lines 108-146, made reusable. |
| `src/shared/utils.js` | **New.** Exports `escapeHtml(str)` and `splitSentences(text, opts)` via `window.LinkedInDetox`. The `splitSentences` function unifies the two implementations: splits on `/[.!?\n]+/`, filters by `opts.minLength` (default 0, preserving detector.js behavior). Semantic-bridge.js will call it with `{ minLength: 10 }`. |
| `src/shared/embed.js` | **New.** Exports `embedSentences(sentences)` via `window.LinkedInDetox`. Wraps `chrome.runtime.sendMessage({ type: "embed", sentences })` with a 30-second timeout. Returns a Promise resolving to an array of embeddings (empty on error, matching semantic-bridge.js behavior). Also exports `embedPhrase(sentence)` that wraps the single-sentence case and rejects on error (matching options.js behavior). |
| `manifest.json` | Add the three shared files to `content_scripts.js` array *before* the existing entries: `["src/shared/config.js", "src/shared/utils.js", "src/shared/embed.js", "src/detector.js", "src/semantic-scorer.js", "src/semantic-bridge.js", "src/content.js"]`. |
| `src/popup/popup.html` | Add `<script src="../shared/config.js"></script>` before `<script src="popup.js"></script>`. Only config.js is needed (popup doesn't use escapeHtml or embed). |
| `src/options/options.html` | Add `<script src="../shared/utils.js"></script>` and `<script src="../shared/embed.js"></script>` before `<script src="options.js"></script>`. Options.js doesn't use loadConfig (it has its own partial load), so config.js is not needed here. |
| `src/content.js` | Remove `SENSITIVITY_THRESHOLDS`, `DEFAULT_CONFIG`, `loadConfig()`, and `escapeHtml()`. Replace with reads from `LinkedInDetox.SENSITIVITY_THRESHOLDS`, `LinkedInDetox.DEFAULT_CONFIG`, `LinkedInDetox.loadConfig`, `LinkedInDetox.escapeHtml`. The `chrome.storage.onChanged` listener stays in content.js since it contains content-script-specific logic (reload, re-render). |
| `src/popup/popup.js` | Remove `SENSITIVITY_THRESHOLDS` constant. Replace with `LinkedInDetox.SENSITIVITY_THRESHOLDS`. |
| `src/options/options.js` | Remove `escapeHtml()` function. Replace calls with `LinkedInDetox.escapeHtml`. Remove `embedPhrase()` function. Replace with `LinkedInDetox.embedPhrase`. |
| `src/detector.js` | Replace local `splitSentences` with `LinkedInDetox.splitSentences` (browser) or the module import (test). The conditional module export block needs to handle both: in browser, use the global; in Node/test, use a local fallback or import. Since detector.js is loaded *after* shared/utils.js in the content script, the global is available. For tests, add a local fallback: `const splitSentences = (typeof LinkedInDetox !== "undefined" && LinkedInDetox.splitSentences) || function(text) { return text.split(/[.!?\n]+/).filter(s => s.trim().length > 0); }`. |
| `src/semantic-bridge.js` | Remove `_embedSentences()` and `_splitIntoSentences()`. Replace with `LinkedInDetox.embedSentences` and `LinkedInDetox.splitSentences(text, { minLength: 10 })`. |

## Implementation Details

### Global namespace pattern

Each shared file follows this structure:

```js
(function() {
  const ns = (window.LinkedInDetox = window.LinkedInDetox || {});

  function escapeHtml(str) { /* ... */ }

  ns.escapeHtml = escapeHtml;

  // Node.js / test compatibility
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { escapeHtml };
  }
})();
```

The IIFE prevents polluting the global scope with local variables while still attaching the public API to the namespace.

### splitSentences unification

The unified signature: `splitSentences(text, opts)` where `opts` is optional with shape `{ minLength: number }`.

- Default behavior (no opts or `minLength: 0`): splits on `/[.!?\n]+/`, filters empty strings. This matches what detector.js needs (adding `\n` support is a minor improvement, not a behavior change for the heuristic scorers since LinkedIn posts rarely end sentences with newlines alone).
- With `{ minLength: 10 }`: same split, but filters to segments with `trim().length > minLength`. This is what semantic-bridge.js needs.

### detector.js test compatibility

The existing tests import `splitSentences` indirectly (they import `emDashScorer` etc. which call `splitSentences` internally). In the Node/vitest environment, `window.LinkedInDetox` won't exist. The solution is to keep a local `splitSentences` in detector.js that delegates to the shared one when available:

```js
const _splitSentences = (typeof LinkedInDetox !== "undefined")
  ? LinkedInDetox.splitSentences
  : function(text) { return text.split(/[.!?\n]+/).filter(s => s.trim().length > 0); };
```

This fallback is the same implementation as the shared module, just inlined for the test environment. Tests continue to pass unchanged.

### loadConfig scope

The shared `loadConfig` handles the common logic: reading from `chrome.storage.sync` with `DEFAULT_CONFIG` as defaults, computing `threshold` from `SENSITIVITY_THRESHOLDS`, converting `userSignalWords` to RegExp, converting deleted-builtin arrays to Sets. Content.js still owns the `currentConfig` variable and the `chrome.storage.onChanged` listener because those contain content-script-specific behavior (page reload, re-render calls, `_resetPhraseBank`).

## Tests

- All 73 existing tests (3 files) pass without modification. The key risk is detector.js's `splitSentences` -- the fallback-in-Node approach ensures tests work.
- No new test files needed. The shared modules are pure extractions with no new logic.
- Manual verification: load the unpacked extension, check that slop detection, popup controls, options page, and semantic embedding all still work.

## Out of Scope

- Deduplicating the `applyTheme()` function (trivially duplicated in popup.js and options.js -- only 2 call sites, 1 line of logic).
- Deduplicating the `loadState()` patterns across popup.js and options.js (they load different subsets of config for different UIs -- not truly the same code).
- Deduplicating CSS theme variables across popup.html and options.html.
- Extracting roast messages or banner image arrays into shared modules (only used by content.js).
- Adding new tests for the shared modules (they're pure extractions; existing tests cover the logic).
