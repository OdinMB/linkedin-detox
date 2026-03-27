# Promoted Post Blocker

- **Date**: 2026-03-27
- **Status**: completed
- **Type**: feature

## Problem
Users want to optionally block LinkedIn "Promoted" (sponsored/ad) posts in addition to AI slop. This needs its own toggle (off by default), its own set of banner images and roast messages, and UI controls in both the popup and settings page.

## Approach
Follow the existing patterns exactly: add a `blockPromoted` setting to `chrome.storage.sync`, a toggle in the popup and options Settings tab, a separate set of promoted-specific roast messages and banner image paths in `content.js`, and detection logic in `scanFeed` that checks post text for the word "Promoted" before heuristic analysis runs.

Promoted posts are detected by checking if the post's text contains the word "Promoted" (which LinkedIn adds to sponsored posts). This is a simple string check, not a scored analysis — promoted posts are either blocked or not, no threshold needed.

When a promoted post is blocked in roast mode, it uses a distinct set of banner images and messages (ad/money-themed) so the user can tell at a glance whether a post was blocked for slop or for being an ad.

## Changes

| File | Change |
|------|--------|
| `src/content.js` | Add `PROMOTED_ROAST_MESSAGES` array, `PROMOTED_BANNER_IMAGES` array, and promoted detection in `scanFeed()` — check for "Promoted" text before heuristic scoring. In `recordBlocked`, accept an optional type parameter to store whether it's a promoted or slop block, and use the appropriate messages/images. |
| `src/popup/popup.html` | Add a "Block promoted posts" toggle row after the "Semantic detection" toggle, following the same HTML pattern. |
| `src/popup/popup.js` | Wire up the new toggle: load `blockPromoted` from storage (default `false`), save on change. Add to `els`, `save()`, and `loadState()`. |
| `src/options/options.html` | Add a "Block promoted posts" toggle in the Settings tab, under a new "Filters" section before "Appearance". |
| `src/options/options.js` | Wire up the new toggle: load/save `blockPromoted` in `saveToggles()` and `loadState()`. Add to `els`. |
| `src/content.css` | Add `.ld-banner--promoted` modifier class with a distinct visual style (e.g., blue/corporate accent instead of yellow caution tape) so promoted banners look different from slop banners. |
| `icons/banners/promoted/` | ~5 AI-generated ad-themed banner images matching the existing art style, created via OpenAI image generation. |

## Storage

New key in `chrome.storage.sync`:
- `blockPromoted`: `boolean`, default `false`

Added to `DEFAULT_CONFIG` in `content.js`.

## Detection Logic

Targeted check: look for "Promoted" only in the **header area** of the post (the first ~200 chars, before the main post body). LinkedIn adds "Promoted" as a label near the author name/headline area. This avoids false positives on posts that simply mention "promoted" or "I got promoted" in their content.

**No threshold involved.** Promoted detection is a binary yes/no — if the check matches, the post is blocked immediately. No score, no sensitivity slider. If a post is detected as promoted, it is **not** run through the AI slop pipeline at all (early return).

In `scanFeed()`, as the **first check** before any heuristic analysis:
```
if (config.blockPromoted) {
  const header = text.slice(0, 200);
  if (/\bPromoted\b/.test(header)) {
    recordBlocked(hash, { blocked: true, score: 100, matches: ["Promoted"] }, "promoted");
    return;  // skip slop detection entirely
  }
}
```

The `recordBlocked` function gets a third parameter `type` (default `"slop"`) that determines which message/image pool to draw from.

## Banner Differentiation

- **Title**: "AD BLOCKED" instead of "QUARANTINED"
- **Messages**: Ad/money-themed roast messages (e.g., "LinkedIn thought your attention was for sale. It's not.")
- **Images**: Separate set of promoted-themed banner images in `icons/banners/promoted/`
- **CSS**: `.ld-banner--promoted` class with a blue/corporate color accent on the caution tape borders to visually distinguish from slop banners

## Tests
Add test cases in the existing vitest suite for:
- Promoted detection: text containing "Promoted" is blocked when `blockPromoted: true`
- Promoted detection: text containing "Promoted" is NOT blocked when `blockPromoted: false`
- Slop detection still works independently of promoted setting

## Out of Scope
- Detecting promoted posts by DOM structure (e.g., LinkedIn's specific ad container classes)
- Sensitivity/threshold for promoted detection (it's binary yes/no)
- Analytics or separate counters for promoted vs slop blocks
