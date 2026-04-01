/**
 * LinkedIn Detox — Portable Background Script (Firefox + Safari)
 *
 * ES module that loads the ML embedding model directly in the background
 * context. Firefox and Safari support WASM in background scripts natively,
 * so no offscreen document relay is needed.
 */

import { ensureModel, getPipeline } from "./model-loader.js";

// --- Extension icon badge ---

function updateBadge() {
  chrome.storage.sync.get({ showBadge: true }, (syncItems) => {
    if (!syncItems.showBadge) {
      chrome.action.setBadgeText({ text: "" });
      return;
    }
    chrome.storage.local.get({ blockedCount: 0 }, (localItems) => {
      const count = localItems.blockedCount || 0;
      chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
      chrome.action.setBadgeBackgroundColor({ color: "#f5c518" });
      chrome.action.setBadgeTextColor({ color: "#1a1a1a" });
    });
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.blockedCount) updateBadge();
  if (area === "sync" && changes.showBadge) updateBadge();
});

// Reset blocked count on startup (session reset)
chrome.storage.local.set({ blockedCount: 0 });
updateBadge();

// --- Blocked count debounce ---

let pendingBlockedIncrements = 0;
let blockedFlushTimer = null;

function flushBlockedCount() {
  blockedFlushTimer = null;
  const increment = pendingBlockedIncrements;
  pendingBlockedIncrements = 0;
  if (increment <= 0) return;
  chrome.storage.local.get({ blockedCount: 0 }, (items) => {
    const newCount = (items.blockedCount || 0) + increment;
    chrome.storage.local.set({ blockedCount: newCount });
  });
}

// --- Model status tracking ---

let modelStatusReported = false;

function reportModelStatus(success, err) {
  if (modelStatusReported) return;
  modelStatusReported = true;
  if (success) {
    console.log("[LinkedIn Detox] Model loaded");
    chrome.storage.local.remove("semanticModelError");
  } else {
    console.error("[LinkedIn Detox] Model load failed:", err);
    chrome.storage.local.set({
      semanticModelError: (err && err.message) || "Model failed to load",
    });
  }
}

// --- Message handler ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "blocked") {
    pendingBlockedIncrements++;
    if (!blockedFlushTimer) {
      blockedFlushTimer = setTimeout(flushBlockedCount, 500);
    }
    return;
  }

  if (message.type !== "embed") return;

  // Run model directly — no offscreen relay needed
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
});
