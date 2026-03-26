# Dedicated Config Page

- **Date**: 2026-03-26
- **Status**: draft
- **Type**: feature

## Problem
The popup is cramped — pattern configs (signal words, co-occurrence), test mode, and semantic scoring settings all live in a small popup that should just show quick controls. Users also can't add custom phrases for the semantic scorer, and there's no way to toggle extension logging.

## Approach
Create an `options_page` (full-tab config page) and slim the popup down to essentials. The config page gets three sections: **Heuristic Patterns** (moved from popup), **Semantic Detection** (toggle + custom phrase management), and **Debug** (test banners, logging toggle). The popup keeps: enabled, mode, sensitivity, stats, and a link to the config page. Info note contrast in the popup gets bumped.

For custom semantic phrases: the offscreen document already has the embedding model loaded. The config page sends phrases to it for embedding via the same message relay, then stores `{ label, sentence, embedding }` in `chrome.storage.local`. The semantic bridge loads both the built-in phrase bank and user phrases at runtime.

## Changes

| File | Change |
|------|--------|
| `src/options/options.html` | **New.** Full-tab config page with three sections: (1) Heuristic Patterns — signal words + co-occurrence pattern management (moved from popup), (2) Semantic Detection — toggle + custom phrase list with add/remove (phrase text + label, embedded on save), (3) Debug — "Test Banner overlays" toggle with explanation, "Show browser logs" toggle. Same dark theme as popup. |
| `src/options/options.js` | **New.** Handles all config page logic: load/save from `chrome.storage.sync`/`local`, render pattern lists, embed user phrases via `chrome.runtime.sendMessage({ type: "embed" })`, store embeddings in `chrome.storage.local`. |
| `manifest.json` | Add `"options_page": "src/options/options.html"`. |
| `src/popup/popup.html` | Remove Custom Patterns section (signal words + co-occurrence), test mode toggle, and semantic toggle. Add a "Settings" link/button that opens the config page via `chrome.runtime.openOptionsPage()`. Bump `.subtitle`, `.sensitivity-desc`, `.semantic-desc` color from `#666` to `#999` for better contrast. |
| `src/popup/popup.js` | Remove pattern rendering code, built-in lists, collapsible sections, and test mode handling. Add click handler for the settings link. Remove `userSignalWords`, `userCooccurrencePatterns`, `testMode`, `semanticEnabled` from the save/load cycle (they're managed by the config page now). |
| `src/content.js` | Add `debugLogging` to `DEFAULT_CONFIG`. Wrap all `console.log`/`console.warn` calls in a helper `function log(...args)` that checks `currentConfig.debugLogging`. |
| `src/semantic-bridge.js` | In `_loadPhraseBank()`, after loading built-in embeddings, also load user phrases from `chrome.storage.local` and merge them into the phrase bank. |
| `src/background.js` | No changes needed — it already relays `embed` messages to the offscreen document, which the config page will reuse. |

## Tests
- Existing detector tests (`npm test`) should still pass — detector.js is untouched.
- Manual: open config page via right-click extension icon > Options, verify all pattern management works, add a custom semantic phrase and verify it persists across page reloads.
- Manual: toggle "Test Banner overlays" on config page, verify banners appear on LinkedIn.
- Manual: toggle "Show browser logs" off, verify console is quiet.

## Out of Scope
- Bundler or build step changes — stays vanilla JS.
- Changing the detection algorithms themselves.
- Migrating existing `chrome.storage.sync` data (both pages read/write the same keys — backward compatible).
- Styling the config page responsively for mobile (it's a desktop Chrome extension).
