/**
 * LinkedIn Detox -- Scanner
 *
 * Feed scanning and detection pipeline orchestration.
 * Owns blockedSet, analyzedHashes, dismissedPosts, and globalPostIndex.
 * Exports via window.LinkedInDetox namespace.
 */

(function () {
  const _global = typeof window !== "undefined" ? window : {};
  const ns = (_global.LinkedInDetox = _global.LinkedInDetox || {});

  // --- Selectors ---

  const FEED_SELECTOR = "[componentkey='container-update-list_mainFeed-lazy-container']";
  const POST_SELECTOR = `${FEED_SELECTOR} > div[data-display-contents="true"] > div`;

  // --- State ---

  const blockedSet = new Map();
  const analyzedHashes = new Set();
  const dismissedPosts = new WeakSet();
  const ANALYZED_HASHES_MAX = 2000;
  let globalPostIndex = 0;

  // --- Helpers ---

  function hashText(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
      h = ((h << 5) - h + text.charCodeAt(i)) | 0;
    }
    return `${h}:${text.length}`;
  }

  /**
   * Record a post as blocked.
   * @param {string} hash
   * @param {object} result - { blocked, score, matches }
   * @param {string} type - "slop" or "promoted"
   * @param {object} callbacks - { getRandomRoast, getRandomBannerImage, log }
   * @param {object} configRef - currentConfig reference for _blocked counter
   */
  function recordBlocked(hash, result, type, callbacks, configRef) {
    configRef._blocked = (configRef._blocked || 0) + 1;
    chrome.storage.local.set({ blockedCount: configRef._blocked });
    ns.markDirty();
    blockedSet.set(hash, {
      result,
      type,
      roastMessage: callbacks.getRandomRoast(type),
      bannerImage: callbacks.getRandomBannerImage(type),
    });
  }

  /**
   * Remove a hash from blockedSet (used by renderer dismiss handler).
   * @param {string} hash
   */
  function unblock(hash) {
    blockedSet.delete(hash);
  }

  // --- Scanning ---

  /**
   * Scan the feed for new posts and run detection.
   * Uses analyzePostAsync for unified two-pass scoring (sync heuristics +
   * optional async semantic). analyzePostAsync internally short-circuits
   * semantic scoring for posts heuristics already caught.
   *
   * @param {object} config - currentConfig (includes getSemanticScore when semantic is enabled)
   * @param {object} callbacks - { getRandomRoast, getRandomBannerImage, render, log, isContextValid }
   */
  async function scanFeed(config, callbacks) {
    if (!config.enabled || !callbacks.isContextValid()) return;

    const posts = document.querySelectorAll(POST_SELECTOR);
    const postsToAnalyze = [];
    let newCount = 0;

    // DOM traversal loop (sync -- no awaits here)
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
        recordBlocked(hash, { blocked: true, score: 99, matches: ["Test mode"] }, "slop", callbacks, config);
        callbacks.log(`[LinkedIn Detox] Test-blocked post #${currentIndex + 1} (hash=${hash})`);
        return;
      }

      // Promoted detection -- binary check, runs before slop analysis
      if (config.blockPromoted && isPromotedPost(text)) {
        recordBlocked(hash, { blocked: true, score: 100, matches: ["Promoted"] }, "promoted", callbacks, config);
        callbacks.log(`[LinkedIn Detox] Promoted post blocked (hash=${hash})`);
        return;
      }

      postsToAnalyze.push({ hash, text });
    });

    // Analysis loop (may be async if semantic scoring is enabled)
    for (const { hash, text } of postsToAnalyze) {
      try {
        const result = await analyzePostAsync(text, config);
        if (result.blocked) {
          recordBlocked(hash, result, "slop", callbacks, config);
        }
      } catch (err) {
        console.error("[LinkedIn Detox] Analysis failed:", err);
      }
    }

    if (newCount > 0) {
      callbacks.log(`[LinkedIn Detox] Analyzed ${newCount} new posts (total: ${globalPostIndex}, blocked: ${blockedSet.size})`);
    }

    callbacks.render();
  }

  // --- Public API ---

  ns.FEED_SELECTOR = FEED_SELECTOR;
  ns.POST_SELECTOR = POST_SELECTOR;
  ns.blockedSet = blockedSet;
  ns.analyzedHashes = analyzedHashes;
  ns.dismissedPosts = dismissedPosts;
  ns.hashText = hashText;
  ns.unblock = unblock;
  ns.scanFeed = scanFeed;

  // Module exports for testing (no-op in browser)
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { hashText };
  }
})();
