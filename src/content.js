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

const PROMOTED_ROAST_MESSAGES = [
  "LinkedIn thought your attention was for sale. It's not.",
  "This ad has been intercepted before it could waste your time.",
  "Sponsored content neutralized. Your feed is ad-free... for now.",
  "Someone paid money for you to see this. You're welcome for not seeing it.",
  "This post's only qualification is a marketing budget.",
  "Another corporation trying to disguise ads as organic content.",
  "Pay-to-play content detected. Access denied.",
  "This ad was so targeted it got target practice instead.",
  "Promoted into oblivion. As all ads should be.",
  "Your eyeballs: not for sale. This ad: blocked.",
  "Somebody's ad budget just went to waste. Beautiful.",
  "This sponsored post has been unsponsored from your feed.",
  "LinkedIn ads: because regular spam wasn't enough.",
  "Corporate has entered the chat. Corporate has been removed from the chat.",
  "This ad thought it could sneak past. It thought wrong.",
];

const PROMOTED_BANNER_IMAGES = [
  "icons/banners/promoted/money-shredder.png",
  "icons/banners/promoted/ad-blocker.png",
  "icons/banners/promoted/corporate-megaphone.png",
  "icons/banners/promoted/spam-filter.png",
  "icons/banners/promoted/wallet-trap.png",
];

function getRandomRoast(type) {
  const pool = type === "promoted" ? PROMOTED_ROAST_MESSAGES : ROAST_MESSAGES;
  return pool[Math.floor(Math.random() * pool.length)];
}

function isContextValid() {
  try { return !!chrome.runtime.id; } catch { return false; }
}

function getRandomBannerImage(type) {
  const pool = type === "promoted" ? PROMOTED_BANNER_IMAGES : BANNER_IMAGES;
  const path = pool[Math.floor(Math.random() * pool.length)];
  return chrome.runtime.getURL(path);
}

// --- Config (declared first — used by recordBlocked and render) ---

const escapeHtml = LinkedInDetox.escapeHtml;
const SENSITIVITY_THRESHOLDS = LinkedInDetox.SENSITIVITY_THRESHOLDS;
const DEFAULT_CONFIG = LinkedInDetox.DEFAULT_CONFIG;

function log(...args) {
  if (currentConfig.debugLogging) console.log(...args);
}

let currentConfig = { ...DEFAULT_CONFIG };

function loadConfig() {
  return LinkedInDetox.loadConfig().then((items) => {
    currentConfig = { ...items, _blocked: 0 };
    return currentConfig;
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
  // Re-convert deleted-builtin arrays to Sets (storage always returns plain arrays)
  if (changes.deletedBuiltinWords) {
    currentConfig.deletedBuiltinWords = new Set(currentConfig.deletedBuiltinWords || []);
  }
  if (changes.deletedBuiltinCoocLabels) {
    currentConfig.deletedBuiltinCoocLabels = new Set(currentConfig.deletedBuiltinCoocLabels || []);
  }
  if (changes.sensitivity) {
    currentConfig.threshold = SENSITIVITY_THRESHOLDS[currentConfig.sensitivity] || 25;
  }
  // Theme-only change: re-render banners with new class, no reload needed
  if (Object.keys(changes).length === 1 && changes.theme) {
    liveBanners.forEach((s) => s.banner.remove());
    liveBanners.clear();
    render();
    return;
  }
  window.location.reload();
});

// --- State ---

const blockedSet = new Map();
const analyzedHashes = new Set();
const dismissedPosts = new WeakSet();   // Post elements the user dismissed — skip on rescan
const ANALYZED_HASHES_MAX = 2000;
let globalPostIndex = 0;

function hashText(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return String(h);
}

function recordBlocked(hash, result, type = "slop") {
  currentConfig._blocked = (currentConfig._blocked || 0) + 1;
  chrome.storage.local.set({ blockedCount: currentConfig._blocked });
  bannersDirty = true;
  blockedSet.set(hash, {
    result,
    type,
    roastMessage: getRandomRoast(type),
    bannerImage: getRandomBannerImage(type),
  });
}

// --- Overlay ---

const FEED_SELECTOR = "[componentkey='container-update-list_mainFeed-lazy-container']";
const POST_SELECTOR = `${FEED_SELECTOR} > div[data-display-contents="true"] > div`;

let overlayEl = null;
const liveBanners = new Map();
let bannersDirty = false;  // Set true when blockedSet changes; forces full rescan in render()
let lastSlowPathTime = 0;  // Throttle periodic slow-path runs

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
      blockedSet.delete(hash);
      const state = liveBanners.get(hash);
      if (state) {
        if (state.postRef) dismissedPosts.add(state.postRef);
        state.banner.remove();
        liveBanners.delete(hash);
      }
    }
  });
  document.body.appendChild(overlayEl);
  return overlayEl;
}

let cachedNavBottom = 0;
let navCacheTime = 0;

function findNavBottom() {
  // Cache for 2 seconds — nav height doesn't change during scroll
  const now = performance.now();
  if (now - navCacheTime < 2000) return cachedNavBottom;

  const logo = document.getElementById("linkedin-bug-blue-medium");
  if (!logo) { cachedNavBottom = 0; return 0; }
  let best = 0;
  let current = logo.parentElement;
  while (current && current !== document.body && current !== document.documentElement) {
    const rect = current.getBoundingClientRect();
    if (rect.width > window.innerWidth * 0.5 && rect.height < 200 && rect.height > 20) {
      best = rect.bottom;
    }
    current = current.parentElement;
  }
  // Only cache if we found the nav; retry quickly otherwise
  if (best > 0) navCacheTime = now;
  cachedNavBottom = best;
  return best;
}

function clipBannerToNav(banner, rect, navBottom) {
  if (navBottom > 0 && rect.top < navBottom) {
    if (rect.bottom <= navBottom) {
      banner.style.display = "none";
    } else {
      banner.style.display = "";
      banner.style.clipPath = `inset(${navBottom - rect.top}px 0 0 0)`;
    }
  } else {
    banner.style.display = "";
    banner.style.clipPath = "";
  }
}

function render() {
  if (!isContextValid()) return;
  const overlay = getOverlay();
  const navBottom = findNavBottom();

  if (!currentConfig.enabled) {
    liveBanners.forEach((s) => s.banner.remove());
    liveBanners.clear();
    return;
  }

  const mode = currentConfig.mode || "roast";
  const isDark = currentConfig.theme === "dark";
  const activeHashes = new Set();

  // --- Read phase: collect all layout reads before any writes ---
  let detectStale = false;
  const bannerRects = new Map();
  liveBanners.forEach((state, hash) => {
    const el = state.postRef;
    if (!el) { detectStale = true; return; }
    const rect = el.getBoundingClientRect();
    // Detached elements return a zero rect — no need for contains() tree walk
    if (rect.width === 0 && rect.height === 0) {
      detectStale = true;
      return;
    }
    bannerRects.set(hash, rect);
  });

  // --- Write phase: apply all position updates (compositor-only transforms) ---
  bannerRects.forEach((rect, hash) => {
    const state = liveBanners.get(hash);
    activeHashes.add(hash);
    state.banner.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
    state.banner.style.width = `${rect.width}px`;
    state.banner.style.height = `${rect.height}px`;
    state.banner.classList.toggle("ld-banner--dark", isDark);
    clipBannerToNav(state.banner, rect, navBottom);
  });

  // Expensive path: rescan visible posts via innerText to create/re-link banners.
  // Runs when: new blocks (bannersDirty), stale refs (detectStale), or periodically
  // when blocked posts may have scrolled into view (throttled to 500ms).
  const now = performance.now();
  const needsPeriodicScan = blockedSet.size > liveBanners.size && now - lastSlowPathTime > 200;
  if (detectStale || bannersDirty || needsPeriodicScan) {
    bannersDirty = false;
    lastSlowPathTime = now;
    const posts = document.querySelectorAll(POST_SELECTOR);
    posts.forEach((post) => {
      const rect = post.getBoundingClientRect();
      if (rect.height < 10) return;
      if (rect.bottom < -100 || rect.top > window.innerHeight + 100) return;

      const text = post.innerText?.trim() || "";
      if (!text) return;
      const hash = hashText(text);

      const entry = blockedSet.get(hash);
      if (!entry) return;
      activeHashes.add(hash);

      const existing = liveBanners.get(hash);
      if (existing) {
        // Re-link stale element ref and reposition
        existing.postRef = post;
        existing.banner.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
        existing.banner.style.width = `${rect.width}px`;
        existing.banner.style.height = `${rect.height}px`;
        existing.banner.classList.toggle("ld-banner--dark", isDark);
        clipBannerToNav(existing.banner, rect, navBottom);
        return;
      }

      // Create new banner
      const isPromoted = entry.type === "promoted";
      const banner = document.createElement("div");
      banner.className = "ld-banner"
        + (isDark ? " ld-banner--dark" : "")
        + (isPromoted ? " ld-banner--promoted" : "");
      banner.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
      banner.style.width = `${rect.width}px`;
      banner.style.height = `${rect.height}px`;

      if (mode === "hide") {
        banner.style.background = isPromoted
          ? (isDark ? "#0d1b2a" : "#e8f0fe")
          : (isDark ? "#1a1a1a" : "#f3f2f0");
        banner.style.border = "none";
      } else {
        const bannerTitle = isPromoted ? "Ad Blocked" : "Quarantined";
        const triggers = entry.result.matches.length > 0
          ? entry.result.matches.join(", ")
          : "";
        const metaLabel = isPromoted ? "Type" : "Slop Score";
        const metaLine = isPromoted
          ? `${metaLabel}: Sponsored Content`
          : `${metaLabel}: ${entry.result.score}%`
            + (triggers ? ` // Triggered by: ${triggers}` : "");
        banner.innerHTML = `
          <div class="ld-banner__header">
            <span class="ld-banner__title">${escapeHtml(bannerTitle)}</span>
            <button class="ld-banner__close" data-hash="${escapeHtml(hash)}" aria-label="Dismiss">&#x2715;</button>
          </div>
          <div class="ld-banner__body">
            <img class="ld-banner__img" src="${escapeHtml(entry.bannerImage)}" alt="" />
            <div class="ld-banner__meta">${escapeHtml(metaLine)}</div>
            <div class="ld-banner__message">${escapeHtml(entry.roastMessage)}</div>
          </div>
        `;
      }

      clipBannerToNav(banner, rect, navBottom);
      overlay.appendChild(banner);
      liveBanners.set(hash, { banner, postRef: post });
    });
  }

  liveBanners.forEach((state, hash) => {
    if (!activeHashes.has(hash)) {
      state.banner.remove();
      liveBanners.delete(hash);
      bannersDirty = true;  // Force rescan next render so re-entering posts get banners
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

    if (dismissedPosts.has(post)) return;
    const text = post.innerText?.trim() || "";
    if (!text) return;
    const hash = hashText(text);
    if (analyzedHashes.has(hash)) return;
    analyzedHashes.add(hash);
    // Evict oldest entries when set grows too large (long sessions)
    if (analyzedHashes.size > ANALYZED_HASHES_MAX) {
      const first = analyzedHashes.values().next().value;
      analyzedHashes.delete(first);
    }
    newCount++;

    const currentIndex = globalPostIndex++;

    if (config.testMode && (currentIndex === 2 || currentIndex === 4)) {
      recordBlocked(hash, { blocked: true, score: 99, matches: ["Test mode"] });
      log(`[LinkedIn Detox] Test-blocked post #${currentIndex + 1} (hash=${hash})`);
      return;
    }

    // Promoted detection — binary check, runs before slop analysis
    if (config.blockPromoted && isPromotedPost(text)) {
      recordBlocked(hash, { blocked: true, score: 100, matches: ["Promoted"] }, "promoted");
      log(`[LinkedIn Detox] Promoted post blocked (hash=${hash})`);
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
    const ov = overlayEl;
    const dominated = ov && mutations.every(
      (m) => ov === m.target || ov.contains(m.target)
    );
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
