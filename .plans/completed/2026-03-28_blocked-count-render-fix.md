# Fix Multi-Tab Blocked Count Race and Render Slow Path Performance

- **Date**: 2026-03-28
- **Status**: completed
- **Type**: bugfix

## Problem

Two related bugs in the blocked-count and render architecture:

1. **Multi-tab blockedCount race.** Each tab maintains a local `_blocked` counter starting at 0 and writes its absolute value to `chrome.storage.local.blockedCount`. Two tabs overwrite each other -- Tab A blocks 3, Tab B blocks 2, badge shows 2 instead of 5. The counter is also conflated with `currentConfig` (a persisted-settings object).

2. **render() slow path fires every 200ms during scroll.** The condition `blockedSet.size > liveBanners.size` triggers expensive DOM scanning (`querySelectorAll` + `innerText` reads). This condition is permanently true once any blocked post scrolls out of view (its banner is removed from `liveBanners` but hash stays in `blockedSet`). Result: the slow path runs every 200ms during scroll even when all visible blocked posts already have banners. The comment says "throttled to 500ms" but the actual value is 200ms.

## Approach

**Problem 1:** Route all blocked-count increments through `chrome.runtime.sendMessage` to background.js. Background.js owns the counter and badge atomically -- it reads the current value, increments, writes back, and updates the badge in one operation. Content scripts never write `blockedCount` directly. This eliminates the race entirely. Also extract `_blocked` from `currentConfig` since it's runtime state, not a config setting.

**Problem 2:** Replace the `blockedSet.size > liveBanners.size` heuristic with an explicit `pendingBanners` counter. This counter increments when a post is first blocked (in `recordBlocked`) and decrements when a banner is successfully created in the slow path. Off-screen banner cleanup does NOT increment it (those posts already had banners once; they'll get new ones via `detectStale` or `bannersDirty` when they re-enter the viewport). The periodic scan fires only when `pendingBanners > 0`, eliminating the permanent-true condition. Also increase the throttle from 200ms to 1000ms and fix the comment.

**Alternatives considered:**
- *Read-then-increment from chrome.storage.local* -- Still racy under concurrent writes from multiple tabs (read-modify-write is not atomic in chrome.storage). Rejected.
- *Just increase the throttle* -- Reduces frequency but doesn't fix the root cause (slow path still runs unnecessarily). The 200ms -> 1000ms change is included but combined with the proper fix.
- *Track dismissed hashes separately* -- The task description suggested this, but dismiss already deletes from `blockedSet` (content.js L228), so dismissed hashes are not the cause of the size mismatch. The real cause is off-screen blocked posts whose banners were cleaned up.

## Changes

These changes assume plans 01 and 02 are completed. File references use the post-decomposition structure (scanner.js, renderer.js, slim content.js). If implementing against the current monolithic content.js, all scanner.js changes apply to the scanning section and renderer.js changes apply to the rendering section of content.js.

| File | Change |
|------|--------|
| `src/background.js` | Add handler for `{ type: "blocked" }` messages. On receipt: read `blockedCount` from `chrome.storage.local`, increment by 1, write back, update badge. This is a new message type alongside the existing `"embed"` handler. |
| `src/scanner.js` (or scanning section of `content.js`) | In `recordBlocked`: remove `currentConfig._blocked` increment and `chrome.storage.local.set`. Instead, send `chrome.runtime.sendMessage({ type: "blocked" })` (fire-and-forget, no response needed). Increment a module-level `pendingBanners` counter. Export `pendingBanners` (or a getter) for renderer access. |
| `src/scanner.js` (or scanning section of `content.js`) | Remove `_blocked: 0` from the `currentConfig` initialization in `loadConfig`. It was conflating runtime state with config. |
| `src/renderer.js` (or rendering section of `content.js`) | Replace `blockedSet.size > liveBanners.size` with `pendingBanners > 0` (read from scanner's exported state). When creating a new banner in the slow path, decrement `pendingBanners`. Change throttle from 200ms to 1000ms. Fix comment "throttled to 500ms" to "throttled to 1000ms". |
| `src/popup/popup.js` | No change needed. It reads `blockedCount` from `chrome.storage.local` and listens to `chrome.storage.onChanged` -- both continue to work since background.js still writes to `chrome.storage.local`. |

## Implementation Details

### background.js message handler

```js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "blocked") {
    chrome.storage.local.get({ blockedCount: 0 }, (items) => {
      const newCount = (items.blockedCount || 0) + 1;
      chrome.storage.local.set({ blockedCount: newCount });
      // Badge update happens via the existing onChanged listener
    });
    return; // No response needed
  }
  if (message.type !== "embed") return;
  // ... existing embed handler ...
});
```

The existing `chrome.storage.onChanged` listener (L44-47) already updates the badge when `blockedCount` changes, so no additional badge code is needed.

### pendingBanners counter

In scanner.js (or the scanning section):
```js
let pendingBanners = 0;

function recordBlocked(hash, result, type = "slop") {
  pendingBanners++;
  chrome.runtime.sendMessage({ type: "blocked" }).catch(() => {});
  bannersDirty = true;
  blockedSet.set(hash, { result, type, roastMessage: ..., bannerImage: ... });
}
```

In renderer.js (or the rendering section), the periodic scan condition becomes:
```js
const needsPeriodicScan = pendingBanners > 0 && now - lastSlowPathTime > 1000;
```

And when a new banner is created (the `// Create new banner` block), add:
```js
pendingBanners = Math.max(0, pendingBanners - 1);
```

The `Math.max(0, ...)` guard handles edge cases where the counter could drift (e.g., a post is blocked, its banner is created via `bannersDirty` before the periodic scan decrements).

### Session reset

The badge currently shows cumulative count across the session. With the background.js approach, the counter persists in `chrome.storage.local` across tab reloads. To reset per-session, background.js should reset `blockedCount` to 0 on service worker startup (it already calls `updateBadge()` on startup at L49 -- add a `chrome.storage.local.set({ blockedCount: 0 })` before it). This matches the current behavior where each page load resets `_blocked` to 0 -- except now it's a global session reset rather than per-tab. This is actually better UX: the badge shows total blocks across all tabs for the current browser session.

### Interaction between pendingBanners and other slow-path triggers

The slow path has three triggers: `detectStale`, `bannersDirty`, and `needsPeriodicScan`. Only `needsPeriodicScan` changes. `detectStale` and `bannersDirty` continue to trigger the slow path regardless of `pendingBanners`, which is correct -- stale refs and new blocks need immediate handling.

## Tests

- Existing 61 tests pass unchanged (they test detector.js and semantic-scorer.js, not content/scanner/renderer).
- Manual test plan:
  1. Open two LinkedIn tabs. Block posts in both. Verify badge shows combined count.
  2. Scroll through feed with blocked posts. Verify banners appear when posts scroll into view.
  3. Dismiss a banner. Scroll away and back. Verify no unnecessary DOM scanning (check via Performance devtools -- no `querySelectorAll` storms during scroll).
  4. Verify promoted post blocking still works and increments badge.

## Out of Scope

- Adding automated tests for scanner.js or renderer.js (separate effort, noted in plan 02 follow-up).
- Changing the badge to show per-tab counts (the global session count is better UX).
- Refactoring the render loop beyond the slow-path fix.
- Changing the session reset strategy (e.g., resetting on tab close instead of service worker startup).
