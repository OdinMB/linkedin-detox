# Banner Redesign — Images, Layout, and Dismiss Fix

- **Date**: 2026-03-26
- **Status**: done
- **Type**: feature

## Problem
The roast banners are functional but plain — dark gradient box with text. The dismiss mechanism says "Click to dismiss" but makes the entire banner clickable, which is unintuitive. The user wants visually appealing banners with generated artwork, and a proper close button (×) in the top-right corner that reveals the original post.

## Approach

Three parts:

1. **Generate banner images** — Use `/openai-imagegen` to create 3-4 stylistically consistent illustrations (snarky/satirical tone matching the extension's personality). Save as PNGs in `icons/banners/`. Declare them in `manifest.json` as `web_accessible_resources` so the content script can reference them via `chrome.runtime.getURL()`.

2. **Redesign banner layout** — Update the HTML structure in `content.js` and styles in `content.css`. New layout: image on the left, text content (headline, score badge, roast quote, trigger matches) on the right, × close button in the top-right corner. The banner should feel polished — card-style with subtle shadow and better typography.

3. **Fix dismiss** — Replace the "Click to dismiss" hint with a small × button positioned `top-right`. Only the × button triggers dismiss (not the whole banner). Clicking it sets `entry.dismissed = true` and calls `render()` to remove the banner.

## Changes

| File | Change |
|------|--------|
| `icons/banners/*.png` | New: 3-4 generated banner images (~200x200 or similar) |
| `manifest.json` | Add `icons/banners/*` to `web_accessible_resources` |
| `src/content.js` | Rework banner HTML: add image element (random from set), restructure layout with close button, remove whole-banner click handler, add × click handler |
| `src/content.css` | Redesign banner styles: flexbox layout with image + text, × button positioning, improved typography and spacing |

## Tests
Manual testing only (no test framework in project). Load extension, enable test mode, verify:
- Banner shows image + headline + score + roast + triggers
- × button appears top-right and dismisses the banner
- Different banners show different images (random selection)
- Hide mode still works (plain background, no banner content)

## Out of Scope
- Animated banners or transitions
- User-configurable banner images
- Changes to the popup or detector logic
