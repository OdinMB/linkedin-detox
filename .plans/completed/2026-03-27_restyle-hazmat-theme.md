# Restyle UI with Hazmat Theme + Light/Dark Mode

- **Date**: 2026-03-27
- **Status**: completed
- **Type**: feature

## Problem
The extension UI uses an old color scheme (#1a1a2e backgrounds, #e94560 accents, rounded corners) that doesn't match the Hazmat Lab style guide. The style guide defines a dual-mode color system (light "Quarantine Notice" / dark "Radioactive") with industrial typography and sharp-cornered UI. There's no theme toggle — users can't switch between modes.

## Approach
Use CSS custom properties (variables) on `:root` for all theme colors, toggled by a `data-theme="dark"` attribute on `<html>`. Default is light. Both popup and options define the same variable set inline. The content script banner CSS uses the same variables, with `content.js` adding the `data-theme` attribute to the banner container based on stored preference.

**Why CSS variables over separate stylesheets:** Single file per component, no new files, smaller diff, instant switching without stylesheet swaps. Follows the "no build step" convention.

**Why not a shared CSS file:** The extension has no shared CSS today — popup, options, and content each have independent styles. Introducing one would require manifest changes and a new pattern. Not worth it for this task.

## Changes

| File | Change |
|------|--------|
| `src/popup/popup.html` | Replace all inline CSS with CSS-variable-based theme system. Add caution tape header stripe, Impact typography for title, sharp corners, industrial toggle switches. Add theme toggle row. Light mode vars as default, dark mode vars under `[data-theme="dark"]`. |
| `src/popup/popup.js` | Add theme toggle element, load/save `theme` from `chrome.storage.sync` (default: `"light"`), apply `data-theme` attribute on `<html>`. Listen for storage changes to stay in sync with options page. |
| `src/options/options.html` | Same CSS variable system as popup. Restyle all elements: tabs, inputs, pattern lists, toggles, footer, privacy page. Add theme toggle row to Settings tab. Add caution tape top border. |
| `src/options/options.js` | Add theme toggle element, load/save `theme`, apply `data-theme` attribute, sync with popup. |
| `src/content.css` | Restyle banners: sharp corners, caution tape top/bottom borders, industrial typography (Impact title, Courier New meta, Segoe UI roast). CSS variables for light/dark, with class toggle. |
| `src/content.js` | Read `theme` from config, add theme class to banner elements. Listen for theme changes (re-render without page reload). Update `DEFAULT_CONFIG` to include `theme: "light"`. Update hide-mode background per theme. |
