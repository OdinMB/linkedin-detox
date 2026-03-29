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
  const ns = (window._ld = window._ld || {});

  const SENSITIVITY_THRESHOLDS = ns.SENSITIVITY_THRESHOLDS;
  const DEFAULT_CONFIG = ns.DEFAULT_CONFIG;

  // Retry delays for initial feed scans (LinkedIn renders async via React)
  const RETRY_SCAN_DELAYS_MS = [1000, 3000, 6000];

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
    }).catch((err) => {
      console.error("[LinkedIn Detox] Failed to load config:", err);
      currentConfig = { ...DEFAULT_CONFIG };
      return currentConfig;
    });
  }

  // --- Dependency wiring ---

  function renderWithDeps() {
    ns.render(currentConfig, {
      blockedSet: ns.blockedSet,
      dismissedHashes: ns.dismissedHashes,
      dismissedElements: ns.dismissedElements,
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

  /**
   * Reset scan state so all posts get re-evaluated with current config.
   * Clears caches and banners, then triggers a fresh scan.
   */
  function resetAndRescan() {
    ns.analyzedHashes.clear();
    ns.blockedSet.clear();
    // Note: dismissedHashes/dismissedElements are NOT cleared — user dismissals
    // should persist across config changes so dismissed posts stay dismissed.
    ns.clearAllBanners();
    scanWithDeps();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.userSemanticPhrases) {
      _resetPhraseBank();
      return;
    }
    if (area !== "sync") return;

    // Apply all changed values to currentConfig
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

    // Re-convert userSignalWords strings to RegExp (storage returns plain strings)
    if (changes.userSignalWords) {
      const words = currentConfig.userSignalWords || [];
      if (Array.isArray(words) && words.length > 0 && typeof words[0] === "string") {
        currentConfig.userSignalWords = words.map((w) => {
          const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp("\\b" + escaped + "(s|ed|ing|er|ly|tion|ment)?\\b", "gi");
        });
      }
    }

    // Whitelist change: rebuild Set and un-block matching authors
    if (changes.whitelistedAuthors) {
      const normalize = ns.normalizeText || ((s) => s.trim());
      currentConfig.whitelistedAuthorsSet = new Set(
        (currentConfig.whitelistedAuthors || []).map((n) => normalize(n).toLowerCase())
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
    }

    // Determine if a full rescan is needed or just a re-render
    const changedKeys = Object.keys(changes);
    const renderOnlyKeys = new Set(["theme", "whitelistedAuthors", "showBadge", "debugLogging"]);
    const needsRescan = changedKeys.some((k) => !renderOnlyKeys.has(k));

    if (needsRescan) {
      // Detection-affecting change: clear caches and rescan everything
      resetAndRescan();
    } else if (changes.theme) {
      // Theme change: rebuild banners with new class
      ns.clearAllBanners();
      renderWithDeps();
    } else {
      // Whitelist-only, showBadge, debugLogging: just re-render
      renderWithDeps();
    }
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
    RETRY_SCAN_DELAYS_MS.forEach((delay) => {
      setTimeout(() => { log(`[LinkedIn Detox] Retry scan ${delay}ms`); scanWithDeps(); }, delay);
    });

    let rafPending = false;
    let lastScrollScanTime = 0;
    const SCROLL_SCAN_INTERVAL_MS = 300;

    function onScroll() {
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          renderWithDeps();
          rafPending = false;
        });
      }
      // Throttled scan on scroll: catch posts that enter the viewport
      // without triggering a MutationObserver event
      const now = performance.now();
      if (now - lastScrollScanTime > SCROLL_SCAN_INTERVAL_MS) {
        lastScrollScanTime = now;
        scheduleScan();
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll, { passive: true });

    log("[LinkedIn Detox] Ready");
  });
})();
