# Author Whitelist

- **Date**: 2026-03-28
- **Status**: draft
- **Type**: feature

## Problem

Users have no way to exempt trusted authors from detection. Every post goes through the scoring pipeline, meaning posts from colleagues, friends, or authors the user genuinely follows get flagged if they happen to use AI-typical phrasing. Users need a per-author whitelist to skip detection entirely for trusted people.

## Approach

Add a `whitelistedAuthors` array to `chrome.storage.sync`. In `scanFeed`, extract the author name from the first line of `post.innerText` and skip all detection if the normalized name matches any whitelisted entry. The options page gets a new "Trusted Authors" section on the Settings tab (using the existing pattern-list UI pattern). Banners get a "Trust Author" button that extracts the author name and adds it to the whitelist.

**Author name extraction:** LinkedIn post `innerText` starts with the author name on the first line (before the first `\n`). The name may include suffixes like "(He/Him)", credentials, or emoji. We normalize by trimming whitespace and storing the raw first-line text. Matching uses case-insensitive substring comparison so "Jane Doe" matches "Jane Doe (She/Her)" and vice versa. The stored value is the display name as shown by LinkedIn.

**Alternatives considered:**
- *Extract from DOM structure (aria-labels, specific selectors)*: LinkedIn's DOM structure changes frequently and virtualizes elements. Using `innerText` first-line is resilient to DOM changes since the visual layout consistently puts the author name first.
- *Store LinkedIn profile URLs instead of names*: Would require finding and parsing `<a>` elements inside the post, which is fragile with LinkedIn's virtualized DOM. Names are simpler and sufficient since collisions are extremely rare on a personal feed.
- *Exact string matching*: Rejected because LinkedIn appends pronouns, credentials, connection degree ("2nd", "3rd+"), and other decorations to names inconsistently. Substring matching handles all variants.

## Changes

| File | Change |
|------|--------|
| `src/content.js` | Add `extractAuthor(text)` helper (returns first line before `\n`, trimmed). In `scanFeed`, after hash dedup check but before any detection, extract author and check against `whitelistedAuthorsSet` (a `Set` built from config). If matched, mark hash as analyzed and skip. Add `whitelistedAuthorsSet` to config loading. Add "Trust Author" button handler in `getOverlay`'s mousedown listener. Store author name in `blockedSet` entries so banners can show it. |
| `src/content.js` (config) | Add `whitelistedAuthors: []` to `DEFAULT_CONFIG`. In `loadConfig()`, convert to a normalized Set for O(1) lookup. In `storage.onChanged` listener, update the Set when `whitelistedAuthors` changes (no reload needed -- just update the Set and re-scan). |
| `src/content.js` (banner) | Add a "Trust Author" button to roast-mode banner HTML (next to the dismiss X button). On click: extract author from the entry, add to `whitelistedAuthors` in storage, remove the banner, and un-block the hash. |
| `src/options/options.html` | Add a "Trusted Authors" section to the Settings tab, after the "Filters" section. Uses the existing `pattern-list` + `add-row` pattern: a list of whitelisted names with remove buttons, and an input + "Add" button below. |
| `src/options/options.js` | Add `whitelistedAuthors` array, `renderWhitelistedAuthors()` function (follows `renderSignalWords` pattern), save/load logic, add/remove handlers, and Enter key support. Wire into `loadState` and `savePatterns` (or a dedicated `saveWhitelist` function). |

## Detail: Author extraction and matching

```js
function extractAuthor(text) {
  const firstLine = text.split('\n')[0]?.trim() || '';
  // LinkedIn first line is typically just the author name (possibly with decorations)
  // Return empty string if the line is too long (probably not a name)
  return firstLine.length <= 120 ? firstLine : '';
}

function isWhitelistedAuthor(authorLine, whitelistSet) {
  if (!authorLine || whitelistSet.size === 0) return false;
  const lower = authorLine.toLowerCase();
  for (const name of whitelistSet) {
    if (lower.includes(name)) return true;
  }
  return false;
}
```

The Set stores lowercased names. `isWhitelistedAuthor` does a linear scan over the Set (typically < 50 entries), checking if any whitelisted name is a substring of the extracted first line. This handles pronouns, credentials, and degree suffixes without any parsing.

**Performance note:** The whitelist check runs before any detection scoring, so whitelisted posts have near-zero cost. The linear scan over a small Set (< 50 entries) with simple string `includes` is negligible compared to the regex-heavy scorers it replaces.

## Detail: Banner "Trust Author" button

The banner already has a header with a close button. Add a second button with a person-check icon or "Trust" label. The handler:
1. Reads the `authorName` from the `blockedSet` entry (stored when the post was first analyzed).
2. Reads `whitelistedAuthors` from `chrome.storage.sync`, appends the new name, writes back.
3. The `storage.onChanged` listener picks up the change and updates the in-memory Set.
4. Removes the banner and deletes the hash from `blockedSet` (same as dismiss).
5. Removes the hash from `analyzedHashes` so the post gets re-scanned (and this time skipped).

For promoted posts, the "Trust Author" button is not shown (promoted posts are ads, not authored by individuals the user would whitelist).

## Detail: Storage change handling

When `whitelistedAuthors` changes in storage (from options page or from banner action):
- Update `currentConfig.whitelistedAuthors` and rebuild the normalized Set.
- Do NOT reload the page. Instead, iterate `blockedSet` entries: for any whose stored `authorName` matches the updated whitelist, remove from `blockedSet`, remove their banner from `liveBanners`, and remove from `analyzedHashes` (so they won't be re-flagged on next scan).
- This gives instant feedback when trusting an author from the banner.

## Tests

No existing tests for content.js (noted in follow-up file). The `extractAuthor` and `isWhitelistedAuthor` functions are pure and testable, but adding tests is out of scope for this plan (matches the current project state where content.js is untested).

Manual testing checklist:
- Add author via options page, verify their posts are not flagged.
- Click "Trust Author" on a banner, verify the banner disappears and doesn't return on re-scan.
- Remove an author from the options page whitelist, verify their posts get re-scanned on next feed load.
- Verify promoted post banners do NOT show the "Trust Author" button.
- Verify whitelist syncs across devices via `chrome.storage.sync`.

## Out of Scope

- **Blocklist / per-author blocking**: Users can block directly on LinkedIn. Not needed.
- **Author profile URL storage**: Name-based matching is sufficient for personal feeds.
- **Regex/pattern matching for author names**: Simple substring match covers all practical cases.
- **Unit tests for content.js functions**: No existing test infrastructure for content.js.
- **Popup UI changes**: The whitelist is managed in options only (popup is for quick toggles). The banner "Trust Author" button provides the quick-action path.
