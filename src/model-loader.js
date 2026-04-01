/**
 * LinkedIn Detox — Model Loader
 *
 * Configures the transformers.js environment and provides lazy model
 * initialization. Used by both offscreen.js (Chrome) and
 * background-portable.js (Firefox / Safari).
 *
 * Not a content script utility — lives in src/ rather than src/shared/
 * because it's an ES module imported only by background-context files.
 */

import { env, pipeline as createPipeline } from "./lib/transformers.min.js";

// Force single-threaded WASM — multi-threading spawns blob-URL workers
// that violate MV3 CSP.
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;

// Use bundled model files only — no network requests to HuggingFace.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = chrome.runtime.getURL("src/models/");

// Disable browser Cache API — chrome-extension:// URLs are unsupported
// schemes for Cache.put(), causing harmless but noisy errors.
env.useBrowserCache = false;

let pipelineInstance = null;
let initPromise = null;

async function initModel() {
  if (pipelineInstance) return;
  pipelineInstance = await createPipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2",
    { quantized: true }
  );
}

/**
 * Ensure model is initialized (lazy, deduped).
 * Resolves when the model is ready, rejects if loading fails.
 * @returns {Promise<void>}
 */
export function ensureModel() {
  if (pipelineInstance) return Promise.resolve();
  if (!initPromise) {
    initPromise = initModel().finally(() => {
      if (!pipelineInstance) initPromise = null;
    });
  }
  return initPromise;
}

/**
 * @returns {import("@xenova/transformers").Pipeline | null}
 */
export function getPipeline() {
  return pipelineInstance;
}
