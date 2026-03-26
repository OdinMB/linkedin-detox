# LinkedIn DOM Challenges

## Problem
Injecting UI into LinkedIn's feed is hard because LinkedIn uses React with feed virtualization. This document tracks what we tried, what failed, and what finally worked.

## Working Solution (Approach 7)

**Content-hash identification + fixed overlay + ephemeral render loop.**

Posts are identified by a hash of their `innerText`, not by element reference. A `Map<hash, blockInfo>` tracks which posts are blocked. On every scroll and DOM mutation, all banners are cleared and recreated from scratch by finding posts in the DOM, hashing their text, and checking the map.

Key implementation details:
- **Overlay container**: `<div id="ld-overlay">` appended to `document.body`, `position: fixed`, `pointer-events: none`, `z-index: 9999`. Completely outside React's tree.
- **Banners**: `position: fixed` inside overlay, positioned via `getBoundingClientRect()` (viewport coords, no scroll offset needed).
- **Scroll tracking**: `window.addEventListener("scroll", ..., { passive: true, capture: true })` — `capture: true` is essential because LinkedIn scrolls inside a container, not the window. Without capture, scroll events never reach our listener.
- **MutationObserver**: observe `document.body` (not the feed container) with `{ childList: true, subtree: true, characterData: true }`. Observing only the feed container missed React's content rendering.
- **Delayed retries**: React populates post content asynchronously. The initial scan often finds empty wrappers (height=0, text=""). Retry scans at 1s/3s/6s after load to catch content once rendered.
- **Empty wrapper filtering**: Skip posts with `getBoundingClientRect().height < 10` — these are spacers/separators, not real posts.
- **Viewport culling**: Skip posts where `rect.bottom < -100 || rect.top > window.innerHeight + 100` to avoid rendering off-screen banners.

Trade-off: slight visual delay repositioning banners on scroll (one rAF frame behind). Acceptable for a joke extension.

## Selectors (confirmed working 2026-03)

- Feed container: `[componentkey='container-update-list_mainFeed-lazy-container']`
- Individual posts: `${FEED_SELECTOR} > div[data-display-contents="true"] > div`
- Source: [LinkOff extension](https://github.com/njelich/LinkOff) `src/constants.js`

**Important:** LinkedIn does NOT always use `www.` — manifest must match both `https://www.linkedin.com/*` and `https://linkedin.com/*`.

## Post element structure

- Container divs under `data-display-contents` include spacers (height=0, no text) mixed with real posts
- Real posts have obfuscated class names (e.g., `_4f8f032d _8e6232b6 ...`) — don't rely on class names
- `post.innerText` works for text extraction but is only populated after React renders asynchronously
- Post content is NOT available at `document_idle` — requires delayed scan or mutation-driven rescan

## Failed Approaches (for reference)

### 1. Replace innerHTML
`postElement.innerHTML = ""; postElement.appendChild(banner)` — React reconciliation immediately overwrites.

### 2. Insert sibling before post
`insertBefore(banner, post)` — visible for one frame, then React removes it.

### 3. Data attributes + CSS ::before
Set `data-ld-blocked` etc. — React strips all unknown attributes on re-render.

### 4. Absolute overlay (position: absolute)
Banners positioned with `scrollY` offset — LinkedIn's scroll container isn't `window`, so positions were wrong.

### 5. Fixed overlay with element refs
`position: fixed` with `capture: true` scroll — worked briefly, but feed virtualization destroys element refs. `document.body.contains(post)` returns false after scroll, banners cleaned up permanently.

### 6. Ephemeral render with WeakMap
WeakMap keyed by element ref — entries lost when React destroys/recreates elements during virtualization.

## Key Constraints

1. **No DOM injection into React's tree** — any nodes, attributes, classes, or inline styles added to React-managed elements will be stripped on next reconciliation
2. **No element reference persistence** — feed virtualization creates/destroys elements on scroll
3. **Content loads asynchronously** — post wrappers exist before text content is rendered by React
4. **Scroll events require capture phase** — LinkedIn uses an internal scroll container
5. **All UI must live outside React's tree** — `document.body` direct children are safe
