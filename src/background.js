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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
