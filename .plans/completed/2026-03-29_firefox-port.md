# Firefox + Safari Cross-Browser Port

- **Date**: 2026-03-29
- **Status**: completed
- **Type**: feature

## Problem
The extension only works in Chrome. Firefox MV3 (since 109) and Safari WebExtensions (since 16.4) both support the same core APIs — the only real incompatibility is the offscreen document architecture for the ML model, which is Chrome-only.

## Approach
Firefox and Safari both support WASM natively in background scripts, so they share one "portable" background module that loads the model directly — no offscreen relay. Chrome keeps its existing classic-script background unchanged.

The model initialization code (~20 lines: env config, pipeline creation, error reporting) is extracted into `src/shared/model-loader.js` so both `offscreen.js` and `background-portable.js` import it without duplication. The badge/count logic (~50 lines) stays duplicated in each background file — it's small, stable, and extracting it would mean converting Chrome's background to a module.

**Safari path:** Safari extensions are WebExtensions wrapped in an Xcode project via `xcrun safari-web-extension-converter`. The extension code is identical to Firefox (no offscreen, portable background). The build script produces a directory that the converter consumes directly.

**Alternative considered:** Single module background with `"type": "module"` for all browsers + conditional offscreen. Rejected — changes Chrome's working setup for no gain, and dynamic `import()` of an 877KB WASM library in a service worker is fragile.

## Changes

| File | Change |
|------|--------|
| `src/shared/model-loader.js` | New. Extract model init from `offscreen.js`: env config, `initModel()`, `ensureModel()`, `getPipeline()`. ES module, ~30 lines. |
| `src/offscreen.js` | Slim down — import `initModel`/`ensureModel`/`getPipeline` from `shared/model-loader.js` instead of defining them inline. Message handler stays. |
| `src/background-portable.js` | New. ES module for Firefox + Safari. Imports model-loader, handles "embed" messages directly (no offscreen relay). Badge/count logic duplicated from `background.js` (~50 lines). |
| `manifest.firefox.json` | New. Same as `manifest.json` but: `background.scripts` + `"type": "module"`, no `offscreen` permission, `browser_specific_settings.gecko` |
| `manifest.safari.json` | New. Same as Firefox manifest minus `browser_specific_settings` |
| `scripts/build-zip.js` | Accept `--firefox` / `--safari` flags. Swap manifest, swap background file, exclude offscreen files. Safari flag produces an unzipped directory for the Xcode converter. |
| `package.json` | Add `build:firefox` and `build:safari` scripts |

## Details

### model-loader.js
Extracted from `offscreen.js` lines 9–57:
```js
import { env, pipeline as createPipeline } from "../lib/transformers.min.js";

env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = chrome.runtime.getURL("src/models/");
env.useBrowserCache = false;

let pipelineInstance = null;
let initPromise = null;

export async function initModel(onSuccess, onError) { /* create pipeline, call callbacks */ }
export function ensureModel(onSuccess, onError) { /* lazy init guard */ }
export function getPipeline() { return pipelineInstance; }
```

`offscreen.js` becomes:
```js
import { ensureModel, getPipeline } from "./shared/model-loader.js";
// message handler only (~25 lines)
```

### background-portable.js
```js
import { ensureModel, getPipeline } from "./shared/model-loader.js";

// --- Badge/count logic (same as background.js) ---
// ~50 lines: updateBadge, storage listener, blocked count debounce

// --- Message handler ---
// "embed" → ensureModel, run pipeline directly, sendResponse
// "blocked" → increment count
// "modelError" / "modelLoaded" → store in chrome.storage.local
```

### manifest.firefox.json
```json
{
  "manifest_version": 3,
  "name": "LinkedIn Detox",
  "version": "0.3.0",
  "permissions": ["storage"],
  "background": {
    "scripts": ["src/background-portable.js"],
    "type": "module"
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "linkedin-detox@example.com",
      "strict_min_version": "109.0"
    }
  }
}
```
Everything else (host_permissions, content_scripts, action, icons, web_accessible_resources, CSP) identical to Chrome.

### manifest.safari.json
Same as Firefox manifest minus `browser_specific_settings`. Safari's metadata lives in the Xcode project, not the manifest.

### build-zip.js changes
- Parse `--firefox` / `--safari` from `process.argv`
- Portable builds: read browser-specific manifest → write as `manifest.json`, include `src/background-portable.js` + `src/shared/model-loader.js`, exclude `src/background.js` + `src/offscreen.js` + `src/offscreen.html`
- Firefox: output `dist/linkedin-detox-<ver>-firefox.zip`
- Safari: output `dist/linkedin-detox-<ver>-safari/` (unzipped directory for `xcrun safari-web-extension-converter`)
- Chrome (default): unchanged

### Content script load order
`model-loader.js` is only imported by background/offscreen modules — it's never in the content script injection chain, so the manifest `content_scripts` array is unchanged.

## Tests
- Unit tests: none needed — model-loader is a thin extraction, no new logic
- Verify `offscreen.js` still works after refactor: enable semantic scoring in Chrome, confirm model loads
- `npm run build:zip` → verify Chrome zip unchanged
- `npm run build:firefox` → verify zip has correct manifest, `background-portable.js`, `model-loader.js`, no offscreen files
- `npm run build:safari` → verify output directory structure
- Load Firefox zip → verify popup, options, heuristic + semantic detection
- Safari: run converter on output dir, build in Xcode, verify in Safari

## Out of Scope
- Store submissions (Firefox Add-ons, Safari App Store)
- Final gecko ID (placeholder `linkedin-detox@example.com`)
- Other browsers (Edge uses Chrome zip as-is)
- Converting Chrome's `background.js` to a module
- Abstracting badge/count logic into shared module
