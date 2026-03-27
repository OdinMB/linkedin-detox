/**
 * LinkedIn Detox — Offscreen Document
 *
 * Runs the embedding model in a full page context (supports WebAssembly,
 * URL.createObjectURL, Atomics — things service workers lack).
 * Background service worker relays messages here.
 */

import { env, pipeline as createPipeline } from "./lib/transformers.min.js";

// Force single-threaded WASM — multi-threading spawns blob-URL workers
// that violate MV3 CSP. The offscreen doc is isolated so this is fine.
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
  try {
    pipelineInstance = await createPipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
      { quantized: true }
    );
    console.log("[LinkedIn Detox Offscreen] Model loaded");
  } catch (err) {
    console.error("[LinkedIn Detox Offscreen] Model load failed:", err);
    pipelineInstance = null;
  }
}

function ensureModel() {
  if (pipelineInstance) return Promise.resolve();
  if (!initPromise) {
    initPromise = initModel().finally(() => {
      if (!pipelineInstance) initPromise = null;
    });
  }
  return initPromise;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen") return;

  if (message.type === "embed") {
    (async () => {
      await ensureModel();

      if (!pipelineInstance) {
        sendResponse({ embeddings: [], error: "Model not loaded" });
        return;
      }

      try {
        const output = await pipelineInstance(message.sentences, {
          pooling: "mean",
          normalize: true,
        });
        sendResponse({ embeddings: output.tolist() });
      } catch (err) {
        sendResponse({ embeddings: [], error: err.message });
      }
    })();
    return true;
  }
});
