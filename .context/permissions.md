# Extension Permissions

## Declared Permissions

### `storage`
**Why:** Persists user preferences (enabled state, sensitivity threshold, display mode, custom signal words, custom co-occurrence patterns) via `chrome.storage.sync` so settings survive browser restarts and sync across signed-in Chrome instances. Session statistics (posts scanned/blocked) use `chrome.storage.local`.

**Used by:** `src/content.js`, `src/popup/popup.js`, `src/options/options.js`

### `offscreen`
**Why:** The semantic scorer needs WebAssembly, Web Workers, and SharedArrayBuffer to run the MiniLM embedding model. MV3 service workers lack these APIs. The offscreen document (`src/offscreen.html` + `src/offscreen.js`) provides a full browser context where `transformers.js` can load the ONNX runtime and run inference.

**Used by:** `src/background.js` (creates the offscreen document and relays embedding requests)

## Host Permissions

### `https://www.linkedin.com/*` and `https://linkedin.com/*`
**Why:** The content scripts need to read feed post text (for detection) and modify the DOM (to hide posts or inject roast banners). Also used for `web_accessible_resources` so banner images and phrase embeddings can be loaded from the extension into the LinkedIn page context.

**Used by:** `content_scripts` in `manifest.json`, `web_accessible_resources`

## Content Security Policy

### `script-src 'self' 'wasm-unsafe-eval'`
**Why:** The ONNX runtime inside `transformers.js` compiles WebAssembly modules at runtime. `wasm-unsafe-eval` is the MV3-era directive that permits this without opening the door to arbitrary `eval()`. Only applies to extension pages (the offscreen document), not to content scripts running on LinkedIn.

## Removed Permissions

### `activeTab` (removed 2026-03-27)
**Why removed:** Redundant. The extension already declares explicit `host_permissions` for linkedin.com and uses `content_scripts.matches` for injection. `activeTab` grants temporary host permission on click, which adds nothing when permanent host permissions are already declared. Removing it reduces Chrome Web Store review friction.
