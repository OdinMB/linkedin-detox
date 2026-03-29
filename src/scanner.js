/**
 * LinkedIn Detox -- Scanner
 *
 * Feed scanning and detection pipeline orchestration.
 * Owns blockedSet, analyzedHashes, dismissedPosts, and globalPostIndex.
 * Exports via window._ld namespace.
 */

(function () {
  const _global = typeof window !== "undefined" ? window : {};
  const ns = (_global._ld = _global._ld || {});

  // --- Selectors ---

  const FEED_SELECTOR = "[componentkey='container-update-list_mainFeed-lazy-container']";
  const POST_SELECTOR = `${FEED_SELECTOR} > div[data-display-contents="true"] > div`;

  // --- State ---

  const blockedSet = new Map();
  const analyzedHashes = new Set();
  const dismissedHashes = new Set();
  const dismissedElements = new WeakSet();
  const ANALYZED_HASHES_MAX = 2000;
  let totalPostsAnalyzed = 0;
  let pendingBanners = 0;
  let selectorWarned = false;

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
   * @param {string} authorName - extracted author name (may be empty)
   * @param {object} callbacks - { getRandomRoast, getRandomBannerImage, log }
   */
  function recordBlocked(hash, result, type, authorName, callbacks) {
    pendingBanners++;
    chrome.runtime.sendMessage({ type: "blocked" }).catch(() => {});
    ns.markDirty();
    blockedSet.set(hash, {
      result,
      type,
      authorName,
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

      // Element-based dismiss check: catches text changes within same element
      if (dismissedElements.has(post)) return;

      const text = post.innerText?.trim() || "";
      if (!text) return;
      const hash = hashText(text);
      // Hash-based dismiss check: catches element recreation after virtualization
      if (dismissedHashes.has(hash)) return;
      if (analyzedHashes.has(hash)) return;
      analyzedHashes.add(hash);
      // Evict oldest entries when set grows too large (long sessions)
      if (analyzedHashes.size > ANALYZED_HASHES_MAX) {
        const first = analyzedHashes.values().next().value;
        analyzedHashes.delete(first);
      }
      newCount++;

      // Extract author from first line for whitelist check
      const authorName = ns.extractAuthor(text);

      // Whitelist check -- skip all detection for trusted authors
      if (config.whitelistedAuthorsSet && ns.isWhitelistedAuthor(authorName, config.whitelistedAuthorsSet)) {
        callbacks.log(`[LinkedIn Detox] Whitelisted author skipped: ${authorName} (hash=${hash})`);
        return;
      }

      // Test mode: block the 3rd and 5th non-whitelisted posts in this scan batch
      const currentIndex = newCount - 1;
      if (config.testMode && (currentIndex === 2 || currentIndex === 4)) {
        recordBlocked(hash, { blocked: true, score: 99, matches: ["Test mode"] }, "slop", authorName, callbacks);
        callbacks.log(`[LinkedIn Detox] Test-blocked post #${currentIndex + 1} (hash=${hash})`);
        return;
      }

      // Promoted detection -- binary check, runs before slop analysis
      if (config.blockPromoted && isPromotedPost(text)) {
        recordBlocked(hash, { blocked: true, score: 100, matches: ["Promoted"] }, "promoted", authorName, callbacks);
        callbacks.log(`[LinkedIn Detox] Promoted post blocked (hash=${hash})`);
        return;
      }

      // Sync heuristic pass: block immediately if heuristics catch it.
      // This avoids the async loop delay for the common case.
      const syncResult = analyzePost(text, config);
      if (syncResult.blocked) {
        recordBlocked(hash, syncResult, "slop", authorName, callbacks);
      } else if (config.semanticEnabled && config.getSemanticScore) {
        // Heuristics missed it — queue for async semantic pass
        postsToAnalyze.push({ hash, text, authorName });
      }
    });

    // Render immediately after sync blocking so banners appear without
    // waiting for the async semantic loop below.
    if (postsToAnalyze.length > 0) {
      callbacks.render();
    }

    // Async semantic pass: only runs for posts heuristics didn't catch
    for (const { hash, text, authorName } of postsToAnalyze) {
      try {
        const result = await analyzePostAsync(text, config);
        if (result.blocked) {
          recordBlocked(hash, result, "slop", authorName, callbacks);
        }
      } catch (err) {
        console.error("[LinkedIn Detox] Analysis failed:", err);
      }
    }

    totalPostsAnalyzed += newCount;
    if (newCount > 0) {
      callbacks.log(`[LinkedIn Detox] Analyzed ${newCount} new posts (total: ${totalPostsAnalyzed}, blocked: ${blockedSet.size})`);
    }

    // Stale selector sentinel: warn once if the feed container exists but
    // the post selector matched nothing (suggests LinkedIn changed their DOM).
    // Skip the warning on non-feed pages (profile, messaging, etc.).
    if (posts.length === 0 && totalPostsAnalyzed === 0 && !selectorWarned
        && document.querySelector?.(FEED_SELECTOR)) {
      selectorWarned = true;
      console.warn("[LinkedIn Detox] POST_SELECTOR matched zero elements — LinkedIn may have changed their DOM. Selectors may need updating.");
    }

    callbacks.render();
  }

  // --- Public API ---

  ns.FEED_SELECTOR = FEED_SELECTOR;
  ns.POST_SELECTOR = POST_SELECTOR;
  ns.blockedSet = blockedSet;
  ns.analyzedHashes = analyzedHashes;
  ns.dismissedHashes = dismissedHashes;
  ns.dismissedElements = dismissedElements;
  ns.hashText = hashText;
  ns.unblock = unblock;
  ns.scanFeed = scanFeed;
  ns.decrementPendingBanners = function () {
    pendingBanners = Math.max(0, pendingBanners - 1);
  };
  ns.hasPendingBanners = function () {
    return pendingBanners > 0;
  };

  // Module exports for testing (no-op in browser)
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      hashText,
      recordBlocked,
      unblock,
      scanFeed,
      blockedSet,
      analyzedHashes,
      dismissedHashes,
      ANALYZED_HASHES_MAX,
      _getState: function () { return { pendingBanners, totalPostsAnalyzed }; },
      _resetState: function () { pendingBanners = 0; totalPostsAnalyzed = 0; analyzedHashes.clear(); blockedSet.clear(); dismissedHashes.clear(); },
    };
  }
})();
