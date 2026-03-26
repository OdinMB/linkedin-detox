/**
 * LinkedIn Detox — Content Script
 *
 * Strategy: LinkedIn virtualizes its feed — element references don't persist.
 * So we identify posts by a hash of their text content. On every render pass:
 * 1. Find all posts currently in DOM
 * 2. Hash their text
 * 3. If hash is in blockedSet → overlay a banner
 * No element refs stored. Banners are recreated each frame.
 */

const ROAST_MESSAGES = [
  "This post was mass-produced in the LinkedIn Cringe Factory.",
  "Somewhere, a ChatGPT prompt just shed a tear of pride.",
  "This post has been humanely removed from your feed.",
  "AI slop detected. Your brain cells have been spared.",
  "Another day, another thought leader who let AI do the thinking.",
  "This post tested positive for chronic LinkedIn syndrome.",
  "Content so generic it could be a LinkedIn template. Oh wait.",
  "Removed for your sanity. You're welcome.",
  "This post was 100% organic, free-range AI output.",
  "The algorithm thought you'd love this. The algorithm was wrong.",
];

const BANNER_IMAGES = [
  "icons/banners/robot-writer.png",
  "icons/banners/slop-factory.png",
  "icons/banners/thought-leader.png",
  "icons/banners/recycled-content.png",
];

function getRandomRoast() {
  return ROAST_MESSAGES[Math.floor(Math.random() * ROAST_MESSAGES.length)];
}

function getRandomBannerImage() {
  const path = BANNER_IMAGES[Math.floor(Math.random() * BANNER_IMAGES.length)];
  return chrome.runtime.getURL(path);
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// --- State ---

// blockedSet: hash -> { result, roastMessage, dismissed }
const blockedSet = new Map();
// analyzedHashes: hashes we've already run through the detector
const analyzedHashes = new Set();
// Track post index for test mode
let globalPostIndex = 0;

function hashText(text) {
  // Simple fast hash — just needs to be unique per post, not cryptographic
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return String(h);
}

// --- Overlay ---

let overlayEl = null;

function getOverlay() {
  if (overlayEl && document.body.contains(overlayEl)) return overlayEl;
  overlayEl = document.createElement("div");
  overlayEl.id = "ld-overlay";
  document.body.appendChild(overlayEl);
  return overlayEl;
}

function render() {
  const overlay = getOverlay();
  overlay.innerHTML = "";

  if (!currentConfig.enabled) return;

  const posts = document.querySelectorAll(POST_SELECTOR);
  posts.forEach((post) => {
    const rect = post.getBoundingClientRect();
    if (rect.height < 10) return;
    // Skip posts not near viewport
    if (rect.bottom < -100 || rect.top > window.innerHeight + 100) return;

    const text = post.innerText?.trim() || "";
    if (!text) return;
    const hash = hashText(text);

    const entry = blockedSet.get(hash);
    if (!entry || entry.dismissed) return;

    const mode = currentConfig.mode || "roast";
    const banner = document.createElement("div");
    banner.className = "ld-banner";
    banner.style.top = `${rect.top}px`;
    banner.style.left = `${rect.left}px`;
    banner.style.width = `${rect.width}px`;
    banner.style.height = `${rect.height}px`;

    if (mode === "hide") {
      banner.style.background = "#f3f2f0";
      banner.style.border = "none";
    } else {
      const matchParts = [];
      matchParts.push(`Slop Score: ${entry.result.score}%`);
      if (entry.result.matches.length > 0) {
        matchParts.push(`Triggered by: ${escapeHtml(entry.result.matches.join(", "))}`);
      }
      banner.innerHTML = `
        <div class="ld-banner__header">
          <span class="ld-banner__title">LinkedIn Detox</span>
          <button class="ld-banner__close" aria-label="Dismiss">&times;</button>
        </div>
        <div class="ld-banner__body">
          <img class="ld-banner__img" src="${escapeHtml(entry.bannerImage)}" alt="" />
          <div class="ld-banner__meta">${escapeHtml(matchParts.join(" · "))}</div>
          <div class="ld-banner__message">${escapeHtml(entry.roastMessage)}</div>
        </div>
      `;
      banner.querySelector(".ld-banner__close").addEventListener("click", (e) => {
        e.stopPropagation();
        entry.dismissed = true;
        render();
      });
    }

    overlay.appendChild(banner);
  });
}

// --- Scanning ---

const FEED_SELECTOR = "[componentkey='container-update-list_mainFeed-lazy-container']";
const POST_SELECTOR = `${FEED_SELECTOR} > div[data-display-contents="true"] > div`;

function scanFeed(config) {
  if (!config.enabled) return;

  const posts = document.querySelectorAll(POST_SELECTOR);
  let newCount = 0;

  posts.forEach((post) => {
    const rect = post.getBoundingClientRect();
    if (rect.height < 10) return;

    const text = post.innerText?.trim() || "";
    if (!text) return;
    const hash = hashText(text);
    if (analyzedHashes.has(hash)) return;
    analyzedHashes.add(hash);
    newCount++;

    const currentIndex = globalPostIndex++;

    // Test mode: force-block 3rd and 5th posts
    if (config.testMode && (currentIndex === 2 || currentIndex === 4)) {
      blockedSet.set(hash, {
        result: { blocked: true, score: 99, matches: ["Test mode"] },
        roastMessage: getRandomRoast(),
        bannerImage: getRandomBannerImage(),
        dismissed: false,
      });
      console.log(`[LinkedIn Detox] Test-blocked post #${currentIndex + 1} (hash=${hash})`);
      return;
    }

    // Normal detection
    const result = analyzePost(text, config);
    if (!result.blocked) return;

    config._blocked = (config._blocked || 0) + 1;
    chrome.storage.local.set({ blockedCount: config._blocked });
    blockedSet.set(hash, {
      result,
      roastMessage: getRandomRoast(),
      bannerImage: getRandomBannerImage(),
      dismissed: false,
    });
  });

  if (newCount > 0) {
    console.log(`[LinkedIn Detox] Analyzed ${newCount} new posts (total: ${globalPostIndex}, blocked: ${blockedSet.size})`);
  }

  render();
}

// --- Config ---

const SENSITIVITY_THRESHOLDS = { chill: 50, suspicious: 25, unhinged: 1 };

const DEFAULT_CONFIG = {
  enabled: true,
  mode: "roast",
  sensitivity: "suspicious",
  threshold: 25,
  testMode: false,
  userSignalWords: [],
  userCooccurrencePatterns: [],
};

let currentConfig = { ...DEFAULT_CONFIG };

function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_CONFIG, (items) => {
      // Derive numeric threshold from sensitivity level
      items.threshold = SENSITIVITY_THRESHOLDS[items.sensitivity] || 25;
      // Convert stored signal word strings to RegExp patterns
      if (items.userSignalWords && items.userSignalWords.length > 0) {
        items.userSignalWords = items.userSignalWords.map((w) => {
          const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp(`\\b${escaped}(s|ed|ing|er|ly|tion|ment)?\\b`, "gi");
        });
      }
      currentConfig = { ...items, _blocked: 0 };
      resolve(currentConfig);
    });
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  for (const [key, { newValue }] of Object.entries(changes)) {
    currentConfig[key] = newValue;
  }
  window.location.reload();
});

// --- Main ---

console.log("[LinkedIn Detox] Content script loaded");
loadConfig().then((config) => {
  console.log("[LinkedIn Detox] Config:", JSON.stringify(config));

  // Set up observer FIRST so we catch React rendering content into posts
  let mutationCount = 0;
  let scanScheduled = false;
  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanFeed(currentConfig);
      scanScheduled = false;
    });
  }

  const observer = new MutationObserver(() => {
    mutationCount++;
    if (mutationCount <= 3) console.log(`[LinkedIn Detox] Mutation #${mutationCount}`);
    scheduleScan();
  });

  // Observe from document.body to catch everything, including React rendering
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  // Initial scan + retries (React populates content asynchronously)
  scanFeed(config);
  setTimeout(() => { console.log("[LinkedIn Detox] Retry scan 1s"); scanFeed(currentConfig); }, 1000);
  setTimeout(() => { console.log("[LinkedIn Detox] Retry scan 3s"); scanFeed(currentConfig); }, 3000);
  setTimeout(() => { console.log("[LinkedIn Detox] Retry scan 6s"); scanFeed(currentConfig); }, 6000);

  // Re-render on scroll
  let rafPending = false;
  function onScroll() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      render();
      rafPending = false;
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });
  window.addEventListener("resize", onScroll, { passive: true });

  console.log("[LinkedIn Detox] Ready");
});
