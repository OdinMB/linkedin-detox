/**
 * LinkedIn Detox -- Content Script (Orchestrator)
 *
 * Slim orchestrator that wires scanner and renderer together.
 * Owns config state, storage listener, MutationObserver, scroll/resize
 * listeners, rAF render loop, and initialization.
 *
 * Strategy: LinkedIn virtualizes its feed -- element references don't persist.
 * So we identify posts by a hash of their text content. On every render pass:
 * 1. Find all posts currently in DOM
 * 2. Hash their text
 * 3. If hash is in blockedSet -> overlay a banner
 * No element refs stored. Banners persist and are repositioned each frame.
 */

(function () {
  const ns = (window.LinkedInDetox = window.LinkedInDetox || {});

  const SENSITIVITY_THRESHOLDS = ns.SENSITIVITY_THRESHOLDS;
  const DEFAULT_CONFIG = ns.DEFAULT_CONFIG;

  let currentConfig = { ...DEFAULT_CONFIG };

  function log(...args) {
    if (currentConfig.debugLogging) console.log(...args);
  }

  function isContextValid() {
    try { return !!chrome.runtime.id; } catch { return false; }
  }

  function loadConfig() {
    return ns.loadConfig().then((items) => {
      currentConfig = { ...items };
      return currentConfig;
    });
  }

  // --- Dependency wiring ---

  function renderWithDeps() {
    ns.render(currentConfig, {
      blockedSet: ns.blockedSet,
      dismissedPosts: ns.dismissedPosts,
      analyzedHashes: ns.analyzedHashes,
      hashText: ns.hashText,
      isContextValid: isContextValid,
    });
  }

  function scanWithDeps() {
    const scanConfig = { ...currentConfig };
    if (scanConfig.semanticEnabled) {
      scanConfig.getSemanticScore = typeof getSemanticScore === "function"
        ? getSemanticScore
        : (ns.getSemanticScore || null);
    }
    ns.scanFeed(scanConfig, {
      getRandomRoast: ns.getRandomRoast,
      getRandomBannerImage: ns.getRandomBannerImage,
      render: renderWithDeps,
      log: log,
      isContextValid: isContextValid,
    });
  }

  // --- Storage change listener ---

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
    // Whitelist change: rebuild Set and un-block matching authors (no reload needed)
    if (changes.whitelistedAuthors) {
      currentConfig.whitelistedAuthorsSet = new Set(
        (currentConfig.whitelistedAuthors || []).map((n) => n.toLowerCase())
      );
      // Un-block posts whose author now matches the whitelist
      ns.blockedSet.forEach((entry, hash) => {
        if (entry.authorName && ns.isWhitelistedAuthor(entry.authorName, currentConfig.whitelistedAuthorsSet)) {
          ns.unblock(hash);
          ns.analyzedHashes.delete(hash);
          const state = ns.liveBanners.get(hash);
          if (state) {
            state.banner.remove();
            ns.liveBanners.delete(hash);
          }
        }
      });
      // If only whitelistedAuthors changed, skip reload
      if (Object.keys(changes).length === 1) {
        renderWithDeps();
        return;
      }
    }
    // Theme-only change: re-render banners with new class, no reload needed
    if (Object.keys(changes).length === 1 && changes.theme) {
      ns.clearAllBanners();
      renderWithDeps();
      return;
    }
    window.location.reload();
  });

  // --- Initialization ---

  loadConfig().then((config) => {
    log("[LinkedIn Detox] Content script loaded");
    log("[LinkedIn Detox] Config:", JSON.stringify(config));

    let scanScheduled = false;
    let mutationCount = 0;

    function scheduleScan() {
      if (scanScheduled) return;
      scanScheduled = true;
      requestAnimationFrame(() => {
        scanWithDeps();
        scanScheduled = false;
      });
    }

    const observer = new MutationObserver((mutations) => {
      const ov = ns.getOverlayEl();
      const dominated = ov && mutations.every(
        (m) => ov === m.target || ov.contains(m.target)
      );
      if (dominated) return;
      mutationCount++;
      if (mutationCount <= 3) log(`[LinkedIn Detox] Mutation #${mutationCount}`);
      scheduleScan();
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    scanWithDeps();
    setTimeout(() => { log("[LinkedIn Detox] Retry scan 1s"); scanWithDeps(); }, 1000);
    setTimeout(() => { log("[LinkedIn Detox] Retry scan 3s"); scanWithDeps(); }, 3000);
    setTimeout(() => { log("[LinkedIn Detox] Retry scan 6s"); scanWithDeps(); }, 6000);

    let rafPending = false;
    function onScroll() {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        renderWithDeps();
        rafPending = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll, { passive: true });

    log("[LinkedIn Detox] Ready");
  });
})();
