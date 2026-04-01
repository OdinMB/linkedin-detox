# Consolidate Semantic Pass Into analyzePostAsync

- **Date**: 2026-03-28
- **Status**: draft
- **Type**: refactor

## Problem

After plan 02, `scanner.js` has its own `runSemanticPass` function (~20 lines) that directly calls `getSemanticScore` and handles threshold comparisons inline. Meanwhile, `detector.js` exports `analyzePostAsync` which encapsulates the same two-pass logic (sync heuristics + optional semantic) with dependency injection for `getSemanticScore`. The tested abstraction (`analyzePostAsync`, covered by 5 vitest tests) is unused in production; the untested `runSemanticPass` is the actual code path.

## Approach

Replace `runSemanticPass` and the separate sync `analyzePost` call in `scanFeed` with a single `analyzePostAsync` call per post, passing `getSemanticScore` via `config.getSemanticScore`. Add a short-circuit to `analyzePostAsync` so it skips semantic scoring when heuristics already blocked the post (preserving the two-pass optimization). Remove `runSemanticPass` entirely.

**Alternatives considered:**
- *Keep `runSemanticPass` and just test it separately* -- Adds test coverage but preserves duplication. The whole point of `analyzePostAsync` was to be the single entry point; having two paths defeats that.
- *Call `analyzePostAsync` only for posts that heuristics missed (keep call-site filtering, no change to `analyzePostAsync`)* -- This means scanFeed still calls `analyzePost` synchronously for all posts first, then calls `analyzePostAsync` only for unblocked ones. But `analyzePostAsync` internally re-runs `analyzePost`, so heuristics run twice for those posts. Wasteful and confusing. The chosen approach (short-circuit inside `analyzePostAsync`) is cleaner: one call, no redundant work, self-documenting two-pass behavior.

## Changes

| File | Change |
|------|--------|
| `src/detector.js` | In `analyzePostAsync`: add early return after sync pass when `syncResult.blocked` is true (skip semantic scoring for already-blocked posts). This is a 3-line addition. Currently `analyzePostAsync` always runs semantic scoring regardless of sync result, which contradicts the documented two-pass optimization. |
| `src/scanner.js` | **Remove** `runSemanticPass` function entirely (~18 lines). **Rewrite** `scanFeed` to call `analyzePostAsync` for each new post instead of `analyzePost`. Pass `getSemanticScore` via the config object when semantic is enabled. The promoted-post and test-mode checks remain as early exits before `analyzePostAsync`. Handle the async result: if blocked, call `recordBlocked`; the re-render after async completion replaces the `render()` call that was at the end of `runSemanticPass`. |
| `src/content.js` | Update the callbacks/config wiring: when calling `scanFeed`, include `getSemanticScore` in the config if `semanticEnabled` is true. This replaces the direct `getSemanticScore` reference that `runSemanticPass` used. |
| `src/detector-async.test.js` | Add one test: verify `analyzePostAsync` does NOT call `getSemanticScore` when sync heuristics already blocked the post. This tests the new short-circuit. |

## Implementation Details

### analyzePostAsync short-circuit

```js
async function analyzePostAsync(text, config) {
  const syncResult = analyzePost(text, config);

  // Two-pass optimization: skip expensive semantic scoring for posts
  // heuristics already caught.
  if (syncResult.blocked) return syncResult;

  if (!config.semanticEnabled || !config.getSemanticScore) {
    return syncResult;
  }

  const semanticResult = await config.getSemanticScore(text);
  // ... merge logic unchanged ...
}
```

### scanFeed rewrite (scanner.js)

The current flow is:
1. Sync loop: `analyzePost` each post, collect unblocked ones for semantic
2. After loop: fire-and-forget `runSemanticPass` for collected posts

The new flow:
1. Loop: promoted/test-mode early exits (unchanged)
2. Call `analyzePostAsync` for each post (it handles both sync and async internally)
3. Since `analyzePostAsync` is async, `scanFeed` becomes async. Posts are processed sequentially within a single scan (same as current `runSemanticPass` which iterates sequentially). A `render()` call after all posts complete replaces the one at the end of `runSemanticPass`.

The scan-level structure becomes:

```js
async function scanFeed(config, callbacks) {
  // ... existing early exit, post collection ...
  const postsToAnalyze = []; // collected during DOM traversal

  // DOM traversal loop (sync — no awaits here)
  posts.forEach((post) => {
    // ... hash, dedup, test-mode, promoted checks (unchanged) ...
    postsToAnalyze.push({ hash, text });
  });

  // Analysis loop (may be async if semantic is enabled)
  for (const { hash, text } of postsToAnalyze) {
    try {
      const result = await analyzePostAsync(text, config);
      if (result.blocked) {
        recordBlocked(hash, result);
      }
    } catch (err) {
      console.error("[LinkedIn Detox] Analysis failed:", err);
    }
  }

  callbacks.render();
}
```

Note: `scanFeed` is already called fire-and-forget (from `scheduleScan`/`requestAnimationFrame`), so making it async requires no caller changes.

### getSemanticScore injection

In content.js, when building the config for scanFeed:

```js
const scanConfig = { ...currentConfig };
if (scanConfig.semanticEnabled) {
  scanConfig.getSemanticScore = LinkedInDetox.getSemanticScore || getSemanticScore;
}
LinkedInDetox.scanFeed(scanConfig, callbacks);
```

`getSemanticScore` is a global function from `semantic-bridge.js` (loaded before scanner.js in the manifest). After plan 01's namespace migration, it may be `LinkedInDetox.getSemanticScore`. The injection happens in content.js either way.

## Tests

- Existing 5 tests in `detector-async.test.js` pass unchanged (the short-circuit doesn't affect any existing test scenarios -- none test a text that heuristics block with semantic also enabled).
- Add 1 new test: `analyzePostAsync` with `semanticEnabled: true` and text that heuristics block -- verify `getSemanticScore` callback is never called.
- All 61 existing tests pass (detector.js interface unchanged).
- Manual verification: load extension, confirm semantic scoring still triggers for posts heuristics miss, confirm heuristic-blocked posts don't trigger semantic calls (check debug logs).

## Out of Scope

- Changing the semantic scoring model, phrase bank, or threshold logic.
- Making `analyzePostAsync` skip the semantic call based on score proximity to threshold (potential optimization but different concern).
- Adding unit tests for scanner.js beyond the indirect coverage via detector tests.
- Refactoring `scanFeed`'s DOM traversal or post-collection logic.
