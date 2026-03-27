/**
 * LinkedIn Detox — Content Script
 *
 * Strategy: LinkedIn virtualizes its feed — element references don't persist.
 * So we identify posts by a hash of their text content. On every render pass:
 * 1. Find all posts currently in DOM
 * 2. Hash their text
 * 3. If hash is in blockedSet → overlay a banner
 * No element refs stored. Banners persist and are repositioned each frame.
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
  "Agree? Thoughts? Neither — this post has been vaporized.",
  "I'm humbled and honored to announce this post has been nuked.",
  "Plot twist: the real journey was the slop we skipped along the way.",
  "This post had more buzzwords than a LinkedIn recruiter's DMs.",
  "Delighted to share that this post will not be shared with you.",
  "Fun fact: no humans were involved in the making of this post.",
  "Another groundbreaking insight copy-pasted from the void.",
  "This post leveraged synergy to unlock exactly nothing.",
  "Hot take so lukewarm it needed to be put out of its misery.",
  "Transformative leadership content has been transformed into silence.",
  "I wake up at 4am to write posts like this. Just kidding — AI never sleeps.",
  "This post was brought to you by the LinkedIn Storytelling Formula™.",
  "Warning: exposure to this content may cause involuntary eye-rolling.",
  "Nobody asked. AI answered anyway.",
  "This post contains 47 line breaks and zero original thoughts.",
  "Engagement bait neutralized. Your dopamine is safe.",
  "Filed under: things that didn't need to be a LinkedIn post.",
  "This post's only skill endorsement is 'Copy + Paste.'",
  "Inspirational story fabrication detected. Moving on.",
  "The real unpopular opinion is that this post should exist.",
];

const BANNER_IMAGES = [
  "icons/banners/robot-writer.png",
  "icons/banners/slop-factory.png",
  "icons/banners/thought-leader.png",
  "icons/banners/recycled-content.png",
  "icons/banners/buzzword-bingo.png",
  "icons/banners/copy-paste.png",
  "icons/banners/humble-brag.png",
  "icons/banners/echo-chamber.png",
  "icons/banners/engagement-bait.png",
  "icons/banners/story-formula.png",
  "icons/banners/emoji-flood.png",
];

function getRandomRoast() {
  return ROAST_MESSAGES[Math.floor(Math.random() * ROAST_MESSAGES.length)];
}

function isContextValid() {
  try { return !!chrome.runtime.id; } catch { return false; }
}

function getRandomBannerImage() {
  const path = BANNER_IMAGES[Math.floor(Math.random() * BANNER_IMAGES.length)];
  return chrome.runtime.getURL(path);
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// --- Config (declared first — used by recordBlocked and render) ---

const SENSITIVITY_THRESHOLDS = { chill: 50, suspicious: 25, unhinged: 1 };

const DEFAULT_CONFIG = {
  enabled: true,
  mode: "roast",
  sensitivity: "suspicious",
  threshold: 25,
  testMode: false,
  semanticEnabled: false,
  debugLogging: false,
  theme: "light",
  userSignalWords: [],
  userCooccurrencePatterns: [],
};

function log(...args) {
  if (currentConfig.debugLogging) console.log(...args);
}

let currentConfig = { ...DEFAULT_CONFIG };

function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_CONFIG, (items) => {
      items.threshold = SENSITIVITY_THRESHOLDS[items.sensitivity] || 25;
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
  if (area === "local" && changes.userSemanticPhrases) {
    _resetPhraseBank();
    return;
  }
  if (area !== "sync") return;
  for (const [key, { newValue }] of Object.entries(changes)) {
    currentConfig[key] = newValue;
  }
  // Theme-only change: re-render banners with new class, no reload needed
  if (Object.keys(changes).length === 1 && changes.theme) {
    liveBanners.forEach((el) => el.remove());
    liveBanners.clear();
    render();
    return;
  }
  window.location.reload();
});

// --- State ---

const blockedSet = new Map();
const analyzedHashes = new Set();
let globalPostIndex = 0;

function hashText(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return String(h);
}

function recordBlocked(hash, result) {
  currentConfig._blocked = (currentConfig._blocked || 0) + 1;
  chrome.storage.local.set({ blockedCount: currentConfig._blocked });
  blockedSet.set(hash, {
    result,
    roastMessage: getRandomRoast(),
    bannerImage: getRandomBannerImage(),
    dismissed: false,
  });
}

// --- Overlay ---

const FEED_SELECTOR = "[componentkey='container-update-list_mainFeed-lazy-container']";
const POST_SELECTOR = `${FEED_SELECTOR} > div[data-display-contents="true"] > div`;

let overlayEl = null;
const liveBanners = new Map();

function getOverlay() {
  if (overlayEl && document.body.contains(overlayEl)) return overlayEl;
  // Overlay was removed (LinkedIn's React can replace body children).
  // Clear banner cache — they were children of the old overlay.
  liveBanners.clear();
  overlayEl = document.createElement("div");
  overlayEl.id = "ld-overlay";
  overlayEl.addEventListener("mousedown", (e) => {
    const btn = e.target.closest(".ld-banner__close");
    if (!btn) return;
    const hash = btn.dataset.hash;
    const entry = blockedSet.get(hash);
    if (entry) {
      entry.dismissed = true;
      const banner = liveBanners.get(hash);
      if (banner) {
        banner.remove();
        liveBanners.delete(hash);
      }
    }
  });
  document.body.appendChild(overlayEl);
  return overlayEl;
}

function render() {
  if (!isContextValid()) return;
  const overlay = getOverlay();

  if (!currentConfig.enabled) {
    liveBanners.forEach((el) => el.remove());
    liveBanners.clear();
    return;
  }

  const mode = currentConfig.mode || "roast";
  const activeHashes = new Set();

  const posts = document.querySelectorAll(POST_SELECTOR);
  posts.forEach((post) => {
    const rect = post.getBoundingClientRect();
    if (rect.height < 10) return;
    if (rect.bottom < -100 || rect.top > window.innerHeight + 100) return;

    const text = post.innerText?.trim() || "";
    if (!text) return;
    const hash = hashText(text);

    const entry = blockedSet.get(hash);
    if (!entry || entry.dismissed) return;

    activeHashes.add(hash);

    const isDark = currentConfig.theme === "dark";

    let banner = liveBanners.get(hash);
    if (banner) {
      banner.style.top = `${rect.top}px`;
      banner.style.left = `${rect.left}px`;
      banner.style.width = `${rect.width}px`;
      banner.style.height = `${rect.height}px`;
      banner.classList.toggle("ld-banner--dark", isDark);
      return;
    }

    banner = document.createElement("div");
    banner.className = "ld-banner" + (isDark ? " ld-banner--dark" : "");
    banner.style.top = `${rect.top}px`;
    banner.style.left = `${rect.left}px`;
    banner.style.width = `${rect.width}px`;
    banner.style.height = `${rect.height}px`;

    if (mode === "hide") {
      banner.style.background = isDark ? "#1a1a1a" : "#f3f2f0";
      banner.style.border = "none";
    } else {
      const triggers = entry.result.matches.length > 0
        ? entry.result.matches.join(", ")
        : "";
      const metaLine = `Slop Score: ${entry.result.score}%`
        + (triggers ? ` // Triggered by: ${escapeHtml(triggers)}` : "");
      banner.innerHTML = `
        <div class="ld-banner__header">
          <span class="ld-banner__title">Quarantined</span>
          <button class="ld-banner__close" data-hash="${escapeHtml(hash)}" aria-label="Dismiss">&#x2715;</button>
        </div>
        <div class="ld-banner__body">
          <img class="ld-banner__img" src="${escapeHtml(entry.bannerImage)}" alt="" />
          <div class="ld-banner__meta">${escapeHtml(metaLine)}</div>
          <div class="ld-banner__message">${escapeHtml(entry.roastMessage)}</div>
        </div>
      `;
    }

    overlay.appendChild(banner);
    liveBanners.set(hash, banner);
  });

  liveBanners.forEach((el, hash) => {
    if (!activeHashes.has(hash)) {
      el.remove();
      liveBanners.delete(hash);
    }
  });
}

// --- Scanning ---

async function runSemanticPass(checks, config) {
  const threshold = config.threshold ?? 30;
  for (const { hash, text } of checks) {
    if (blockedSet.has(hash)) continue;
    try {
      const semanticResult = await getSemanticScore(text);
      if (semanticResult.score >= threshold) {
        recordBlocked(hash, {
          blocked: true,
          score: semanticResult.score,
          matches: semanticResult.matches,
        });
      }
    } catch (err) {
      console.error("[LinkedIn Detox] Semantic scoring failed:", err);
    }
  }
  render();
}

function scanFeed(config) {
  if (!config.enabled || !isContextValid()) return;

  const posts = document.querySelectorAll(POST_SELECTOR);
  const pendingSemanticChecks = [];
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

    if (config.testMode && (currentIndex === 2 || currentIndex === 4)) {
      recordBlocked(hash, { blocked: true, score: 99, matches: ["Test mode"] });
      log(`[LinkedIn Detox] Test-blocked post #${currentIndex + 1} (hash=${hash})`);
      return;
    }

    const result = analyzePost(text, config);
    if (result.blocked) {
      recordBlocked(hash, result);
      return;
    }

    if (config.semanticEnabled) {
      pendingSemanticChecks.push({ hash, text, syncResult: result });
    }
  });

  if (newCount > 0) {
    log(`[LinkedIn Detox] Analyzed ${newCount} new posts (total: ${globalPostIndex}, blocked: ${blockedSet.size})`);
  }

  render();

  if (pendingSemanticChecks.length > 0) {
    runSemanticPass(pendingSemanticChecks, config);
  }
}

// --- Main ---

loadConfig().then((config) => {
  log("[LinkedIn Detox] Content script loaded");
  log("[LinkedIn Detox] Config:", JSON.stringify(config));

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

  const observer = new MutationObserver((mutations) => {
    const dominated = mutations.every((m) => {
      const overlay = document.getElementById("ld-overlay");
      return overlay && (overlay === m.target || overlay.contains(m.target));
    });
    if (dominated) return;
    mutationCount++;
    if (mutationCount <= 3) log(`[LinkedIn Detox] Mutation #${mutationCount}`);
    scheduleScan();
  });

  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  scanFeed(config);
  setTimeout(() => { log("[LinkedIn Detox] Retry scan 1s"); scanFeed(currentConfig); }, 1000);
  setTimeout(() => { log("[LinkedIn Detox] Retry scan 3s"); scanFeed(currentConfig); }, 3000);
  setTimeout(() => { log("[LinkedIn Detox] Retry scan 6s"); scanFeed(currentConfig); }, 6000);

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

  log("[LinkedIn Detox] Ready");
});
