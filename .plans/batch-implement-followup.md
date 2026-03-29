# Batch Implement Follow-Up

## Controversial Decisions

- **Options page `.switch` override**: The options page had `flex-shrink: 0` on `.switch` that the popup did not. Rather than adding it to shared.css (which could affect popup layout), I kept it as a local override in options.html. This is the conservative choice.
- **`.switch--debug` kept local**: The `.switch--debug` variant only exists in options.html, so it stays there rather than polluting the shared file.
- **Test setup file added globally**: Added `src/test-setup-globals.js` as a vitest `setupFiles` entry in `vitest.config.js`. This runs before ALL test files and sets `globalThis.window = globalThis`, `globalThis.chrome`, and `globalThis.LinkedInDetox`. Existing tests continue to pass. This was necessary because ESM `import` hoisting means globals must be established before module evaluation.
- **renderer.js modified for test compatibility**: Changed `window.LinkedInDetox` to use the `typeof window` guard pattern (matching scanner.js) and added an inline `escapeHtml` fallback. Also added `module.exports`. Minimal changes, no runtime behavior change.
- **scanner.js module.exports expanded with test helpers**: Added `_getState` and `_resetState` test-only accessors for `pendingBanners`/`globalPostIndex`, plus `recordBlocked`, `unblock`, `scanFeed`, `blockedSet`, `analyzedHashes`, `ANALYZED_HASHES_MAX` to existing exports.

## Skipped Items

None.

## User Input Needed

None.

## Files to Delete

None.

## Implementation Issues

None.

## Borderline Insights

- The IIFE + `typeof window` guard pattern makes testing harder because ESM `import` hoisting means globals must be established before module evaluation. The vitest `setupFiles` entry is the cleanest solution. This pattern should be documented if more modules need test coverage.

## Suggested Follow-Up Work

- The `.toggle-row`, `.toggle-row span`, and `.toggle-desc` styles are similar between popup and options but differ in font-size/margin values. A future pass could unify these with size modifiers if desired.
- The `.caution-tape` component is identical in both files and could also be extracted to shared.css.
- **Suppress expected console.error in scanner error-handling test**: The "handles analyzePostAsync errors gracefully" test produces stderr from `console.error`. Could be suppressed with `vi.spyOn(console, "error")` if cleaner output is desired.
- **Test `render()` function in renderer.js**: The main `render()` function has complex DOM logic. A jsdom or happy-dom vitest environment would make testing it more practical.
