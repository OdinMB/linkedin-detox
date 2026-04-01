# Decompose content.js Into Focused Modules

- **Date**: 2026-03-28
- **Status**: draft
- **Type**: refactor

## Problem

`src/content.js` (539 lines) handles five distinct responsibilities: config loading, feed scanning, detection pipeline orchestration, banner/overlay rendering, and the event loop. This makes it hard to reason about, modify, or test any single concern. After plan 01 extracts shared utilities, the remaining content.js is still a monolith that should be decomposed.

## Approach

Split content.js into three files loaded via the manifest `content_scripts` array. Each file attaches to `window.LinkedInDetox` (the namespace established in plan 01). The slim `content.js` becomes an orchestrator that wires the other modules together.

**Alternatives considered:**
- *Two files (renderer.js + content.js)* -- Keeps scanning+orchestration in content.js, which is still ~250 lines doing two jobs. Three files gives cleaner single-responsibility boundaries.
- *Four files (scanner.js + renderer.js + banner-content.js + content.js)* -- Separating banner content arrays (roasts, images) into their own file. Rejected: they're only consumed by the renderer, so extracting them adds a file and cross-file coordination for no practical benefit. They live at the top of renderer.js as constants.
- *Moving config loading to shared/config.js entirely* -- Plan 01 already extracts `DEFAULT_CONFIG`, `SENSITIVITY_THRESHOLDS`, and `loadConfig()` to shared. The `chrome.storage.onChanged` listener and `currentConfig` state are content-script-specific and stay in content.js.

## Changes

| File | Change |
|------|--------|
| `src/scanner.js` | **New.** Feed scanning + detection pipeline orchestration. Owns `blockedSet`, `analyzedHashes`, `dismissedPosts`, `globalPostIndex`, `ANALYZED_HASHES_MAX`. Exports via `LinkedInDetox`: `scanFeed(config, callbacks)`, `runSemanticPass(checks, config, callbacks)`, `hashText(text)`, `recordBlocked(hash, result, type)`, `blockedSet` (read access), `analyzedHashes` (read access), `dismissedPosts` (read access). The `callbacks` parameter provides `{ getRandomRoast, getRandomBannerImage, render }` -- injected by content.js to avoid scanner depending on renderer. |
| `src/renderer.js` | **New.** Banner/overlay rendering + all DOM manipulation for banners. Owns `liveBanners`, `bannersDirty`, `overlayEl`, `lastSlowPathTime`, nav caching state, and all banner content arrays (`ROAST_MESSAGES`, `BANNER_IMAGES`, `PROMOTED_ROAST_MESSAGES`, `PROMOTED_BANNER_IMAGES`). Exports via `LinkedInDetox`: `render(config, deps)`, `getRandomRoast(type)`, `getRandomBannerImage(type)`, `liveBanners` (read access), `clearAllBanners()`, `markDirty()`. The `deps` parameter provides `{ blockedSet, dismissedPosts, hashText, isContextValid }` -- injected by content.js. |
| `src/content.js` | **Shrink to ~100 lines.** Slim orchestrator: config state (`currentConfig`), `chrome.storage.onChanged` listener, `log()`, `isContextValid()`, MutationObserver, scroll/resize listeners, rAF render loop, initialization (loadConfig + delayed retries). Wires scanner and renderer together by passing the right callbacks/deps. |
| `manifest.json` | Update `content_scripts.js` array to load in order: `[..shared files.., "src/detector.js", "src/semantic-scorer.js", "src/semantic-bridge.js", "src/scanner.js", "src/renderer.js", "src/content.js"]`. Scanner and renderer must load before content.js. |

## Implementation Details

### Module structure

Each new file follows the IIFE + namespace pattern from plan 01:

```js
(function () {
  const ns = (window.LinkedInDetox = window.LinkedInDetox || {});

  // ... private state and functions ...

  // Public API
  ns.scanFeed = scanFeed;
  ns.hashText = hashText;
  // etc.
})();
```

### State ownership

Clear ownership prevents bugs from shared mutable state:

| State | Owner | Accessed by |
|-------|-------|-------------|
| `blockedSet` (Map) | scanner.js | renderer.js (via deps injection) |
| `analyzedHashes` (Set) | scanner.js | -- |
| `dismissedPosts` (WeakSet) | scanner.js | renderer.js (via deps injection) |
| `globalPostIndex` | scanner.js | -- |
| `liveBanners` (Map) | renderer.js | content.js (for theme-change clear) |
| `bannersDirty` | renderer.js | scanner.js (via `markDirty()`) |
| `overlayEl` | renderer.js | content.js (for mutation filter) |
| `currentConfig` | content.js | -- (passed as arg to scanFeed/render) |

### Dependency injection pattern

Scanner and renderer need each other's functions but must not import each other directly (circular dependency). Content.js resolves this by passing callbacks:

**Scanner receives from content.js:**
```js
LinkedInDetox.scanFeed(currentConfig, {
  getRandomRoast: LinkedInDetox.getRandomRoast,
  getRandomBannerImage: LinkedInDetox.getRandomBannerImage,
  render: () => renderWithDeps(),
  log: log,
});
```

**Renderer receives from content.js:**
```js
function renderWithDeps() {
  LinkedInDetox.render(currentConfig, {
    blockedSet: LinkedInDetox.blockedSet,
    dismissedPosts: LinkedInDetox.dismissedPosts,
    hashText: LinkedInDetox.hashText,
    isContextValid: isContextValid,
  });
}
```

This keeps scanner and renderer fully independent. Content.js is the only file that knows about both.

### recordBlocked refactor

`recordBlocked` currently mixes concerns: it updates `blockedSet` (scanner state), calls `getRandomRoast`/`getRandomBannerImage` (renderer functions), sets `bannersDirty` (renderer state), and updates `chrome.storage.local` (side effect). After refactor:

- `recordBlocked` stays in scanner.js
- It receives `getRandomRoast` and `getRandomBannerImage` via the callbacks object
- It calls `LinkedInDetox.markDirty()` (renderer export) to set `bannersDirty = true`
- It updates `chrome.storage.local` directly (scanner owns blocked count tracking)

### Selectors

`FEED_SELECTOR` and `POST_SELECTOR` are used by both scanner (to find posts) and renderer (slow-path rescan). They move to scanner.js since scanning is their primary use. Renderer accesses them via `LinkedInDetox.POST_SELECTOR`.

### render() signature change

Current `render()` reads from module-level globals (`currentConfig`, `blockedSet`, etc.). After refactor, it takes explicit parameters so renderer.js has no hidden dependencies:

```js
function render(config, deps) {
  // config: { enabled, mode, theme }
  // deps: { blockedSet, dismissedPosts, hashText, isContextValid }
}
```

The read/write phase split and slow-path rescan logic are preserved exactly as-is inside renderer.js.

### Overlay mousedown handler

The dismiss handler in `getOverlay()` currently accesses `blockedSet` and `liveBanners` directly. After refactor, `blockedSet` comes from the `deps` object cached from the last `render()` call (renderer stores deps reference). `liveBanners` and `dismissedPosts` are already owned by their respective modules. The dismiss handler calls `LinkedInDetox.blockedSet.delete(hash)` -- since blockedSet is a Map reference, deleting from it in renderer affects scanner's state (same object). This is intentional and preserves current behavior.

Actually, to keep ownership clean: the dismiss handler in renderer.js will call a `LinkedInDetox.unblock(hash)` function exported by scanner.js, which handles deleting from blockedSet. Renderer handles its own cleanup (removing banner, deleting from liveBanners, adding to dismissedPosts).

### MutationObserver overlay filter

The MutationObserver in content.js filters out mutations from the overlay element (`overlayEl`). After refactor, content.js accesses this via `LinkedInDetox.getOverlayEl()` (a simple getter exported by renderer.js that returns the current overlay reference without creating it).

## Tests

- All 61 existing tests pass unchanged. Tests cover detector.js and semantic-scorer.js, neither of which is modified.
- No new test files needed -- this is a pure structural refactor of content.js, which has no tests today.
- Manual verification: load unpacked extension, verify slop detection, banner rendering, dismiss button, promoted post blocking, theme switching, scroll repositioning, and semantic scoring all work.

## Out of Scope

- Adding tests for content.js / scanner.js / renderer.js (valuable but separate effort).
- Changing the rendering strategy (read/write phase split, rAF loop, etc.).
- Modifying detector.js, semantic-scorer.js, or semantic-bridge.js.
- Changing popup.js or options.js.
- Performance optimizations beyond what the decomposition naturally enables.
