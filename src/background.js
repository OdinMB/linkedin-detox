/**
 * LinkedIn Detox — Background Service Worker
 *
 * Thin relay: creates an offscreen document for the embedding model
 * and forwards messages between content script and offscreen doc.
 */

const OFFSCREEN_PATH = "src/offscreen.html";
let creatingOffscreen = null;

async function ensureOffscreen() {
  const existing = await chrome.offscreen.hasDocument();
  if (existing) return;
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }
  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["WORKERS"],
    justification: "Run ML embedding model for AI slop detection",
  });
  await creatingOffscreen;
  creatingOffscreen = null;
}

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

// Reset blocked count on service worker startup (session reset)
chrome.storage.local.set({ blockedCount: 0 });
updateBadge();

// --- Message relay ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "blocked") {
    chrome.storage.local.get({ blockedCount: 0 }, (items) => {
      const newCount = (items.blockedCount || 0) + 1;
      chrome.storage.local.set({ blockedCount: newCount });
    });
    return;
  }

  if (message.type !== "embed") return;

  (async () => {
    await ensureOffscreen();
    const response = await chrome.runtime.sendMessage({
      ...message,
      target: "offscreen",
    });
    sendResponse(response);
  })();
  return true;
});
