/**
 * LinkedIn Detox — Offscreen Document (Chrome only)
 *
 * Runs the embedding model in a full page context (supports WebAssembly,
 * URL.createObjectURL, Atomics — things Chrome service workers lack).
 * Background service worker relays messages here.
 */

import { ensureModel, getPipeline } from "./model-loader.js";

let modelStatusReported = false;

function reportModelStatus(success, err) {
  if (modelStatusReported) return;
  modelStatusReported = true;
  if (success) {
    console.log("[LinkedIn Detox Offscreen] Model loaded");
    chrome.runtime.sendMessage({ type: "modelLoaded" }).catch(() => {});
  } else {
    console.error("[LinkedIn Detox Offscreen] Model load failed:", err);
    chrome.runtime.sendMessage({
      type: "modelError",
      error: (err && err.message) || "Unknown model load error",
    }).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen") return;

  if (message.type === "embed") {
    (async () => {
      try {
        await ensureModel();
      } catch (err) {
        reportModelStatus(false, err);
        sendResponse({ embeddings: [], error: "Model not loaded" });
        return;
      }

      reportModelStatus(true);

      const pipeline = getPipeline();
      if (!pipeline) {
        sendResponse({ embeddings: [], error: "Model not loaded" });
        return;
      }

      try {
        const output = await pipeline(message.sentences, {
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
