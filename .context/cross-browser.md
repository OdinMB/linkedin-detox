# Cross-Browser Build Differences

The extension targets Chrome, Firefox, and Safari from one codebase. The core (content scripts, popup, options, storage) is identical across all three. The only divergence is how the ML embedding model runs in the background context.

## Build matrix

| | Chrome | Firefox | Safari |
|---|---|---|---|
| **Manifest** | `manifest.json` | `manifest.firefox.json` | `manifest.safari.json` |
| **Background script** | `background.js` (classic) | `background-portable.js` (ES module) | `background-portable.js` (ES module) |
| **Model host** | Offscreen document (`offscreen.js` + `offscreen.html`) | Background script directly | Background script directly |
| **Model loader** | `model-loader.js` (imported by `offscreen.js`) | `model-loader.js` (imported by `background-portable.js`) | `model-loader.js` (imported by `background-portable.js`) |
| **`offscreen` permission** | Yes | No | No |
| **Gecko settings** | No | Yes (`browser_specific_settings.gecko`) | No |
| **Min version** | Chrome MV3 (88+) | Firefox 128+ (ES module backgrounds) | Safari 16.4+ (WebExtensions MV3) |
| **Output format** | `.zip` | `.zip` | Directory (for `xcrun safari-web-extension-converter`) |

## Why the split?

Chrome's MV3 service workers lack WASM support. The workaround is an **offscreen document** — a hidden page with full browser APIs that the service worker relays messages to. The `chrome.offscreen` API is Chrome-only.

Firefox and Safari support WASM natively in their background contexts, so the model runs directly in `background-portable.js` with no relay. This is simpler and faster (one fewer message hop).

## Shared model loader

`src/model-loader.js` configures the transformers.js environment (single-thread WASM, local models, no remote downloads) and exports `ensureModel()` + `getPipeline()`. Both `offscreen.js` and `background-portable.js` import it — the WASM config is identical regardless of where the model runs.

Model status reporting (success/error to `chrome.storage.local`) is handled by each caller, not by model-loader itself, because `chrome.runtime.sendMessage` doesn't loop back to the sender's own `onMessage` listener.

## Badge/count duplication

`background.js` and `background-portable.js` each contain ~50 lines of badge/count logic (badge text, blocked count debounce, storage listener). This is intentionally duplicated rather than extracted, because Chrome's `background.js` is a classic script that can't use ES `import`. Converting it to a module would change Chrome's working setup for no functional gain.

## Content scripts

All content scripts, popup, and options page code is 100% shared. The manifest `content_scripts` array is identical across all three browsers. The `chrome.*` namespace works in Firefox MV3 and Safari MV3.
