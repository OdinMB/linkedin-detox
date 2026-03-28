/**
 * LinkedIn Detox -- Renderer
 *
 * Banner/overlay rendering and all DOM manipulation for banners.
 * Owns liveBanners, bannersDirty, overlayEl, nav caching state,
 * and all banner content arrays.
 * Exports via window.LinkedInDetox namespace.
 */

(function () {
  const _global = typeof window !== "undefined" ? window : {};
  const ns = (_global.LinkedInDetox = _global.LinkedInDetox || {});

  const escapeHtml = (typeof ns.escapeHtml === "function")
    ? ns.escapeHtml
    : function (str) { return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };

  // --- Banner Content ---

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
    "Agree? Thoughts? Neither \u2014 this post has been vaporized.",
    "I'm humbled and honored to announce this post has been nuked.",
    "Plot twist: the real journey was the slop we skipped along the way.",
    "This post had more buzzwords than a LinkedIn recruiter's DMs.",
    "Delighted to share that this post will not be shared with you.",
    "Fun fact: no humans were involved in the making of this post.",
    "Another groundbreaking insight copy-pasted from the void.",
    "This post leveraged synergy to unlock exactly nothing.",
    "Hot take so lukewarm it needed to be put out of its misery.",
    "Transformative leadership content has been transformed into silence.",
    "I wake up at 4am to write posts like this. Just kidding \u2014 AI never sleeps.",
    "This post was brought to you by the LinkedIn Storytelling Formula\u2122.",
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

  // --- Random content selectors ---

  function getRandomRoast(type) {
    const pool = type === "promoted" ? PROMOTED_ROAST_MESSAGES : ROAST_MESSAGES;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function getRandomBannerImage(type) {
    const pool = type === "promoted" ? PROMOTED_BANNER_IMAGES : BANNER_IMAGES;
    const path = pool[Math.floor(Math.random() * pool.length)];
    return chrome.runtime.getURL(path);
  }

  // --- Overlay state ---

  let overlayEl = null;
  const liveBanners = new Map();
  let bannersDirty = false;
  let lastSlowPathTime = 0;

  // Nav caching
  let cachedNavBottom = 0;
  let navCacheTime = 0;

  function getOverlay(deps) {
    if (overlayEl && document.body.contains(overlayEl)) return overlayEl;
    // Overlay was removed (LinkedIn's React can replace body children).
    // Clear banner cache -- they were children of the old overlay.
    liveBanners.clear();
    overlayEl = document.createElement("div");
    overlayEl.id = "ld-overlay";
    overlayEl.addEventListener("mousedown", (e) => {
      // Handle "Trust Author" button
      const trustBtn = e.target.closest(".ld-banner__trust");
      if (trustBtn) {
        const hash = trustBtn.dataset.hash;
        const entry = deps.blockedSet.get(hash);
        if (entry && entry.authorName) {
          // Add author to whitelist in storage
          chrome.storage.sync.get({ whitelistedAuthors: [] }, (items) => {
            const list = items.whitelistedAuthors || [];
            if (!list.some((n) => n.toLowerCase() === entry.authorName.toLowerCase())) {
              list.push(entry.authorName);
              chrome.storage.sync.set({ whitelistedAuthors: list });
            }
          });
          // Remove banner (same as dismiss)
          ns.unblock(hash);
          deps.analyzedHashes.delete(hash);
          const state = liveBanners.get(hash);
          if (state) {
            state.banner.remove();
            liveBanners.delete(hash);
          }
        }
        return;
      }

      const btn = e.target.closest(".ld-banner__close");
      if (!btn) return;
      const hash = btn.dataset.hash;
      const entry = deps.blockedSet.get(hash);
      if (entry) {
        ns.unblock(hash);
        const state = liveBanners.get(hash);
        if (state) {
          if (state.postRef) deps.dismissedPosts.add(state.postRef);
          state.banner.remove();
          liveBanners.delete(hash);
        }
      }
    });
    document.body.appendChild(overlayEl);
    return overlayEl;
  }

  function findNavBottom() {
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

  // --- Main render function ---

  /**
   * Render/reposition banners over blocked posts.
   * @param {object} config - { enabled, mode, theme }
   * @param {object} deps - { blockedSet, dismissedPosts, hashText, isContextValid }
   */
  function render(config, deps) {
    if (!deps.isContextValid()) return;
    const overlay = getOverlay(deps);
    const navBottom = findNavBottom();

    if (!config.enabled) {
      liveBanners.forEach((s) => s.banner.remove());
      liveBanners.clear();
      return;
    }

    const mode = config.mode || "roast";
    const isDark = config.theme === "dark";
    const activeHashes = new Set();

    // --- Read phase: collect all layout reads before any writes ---
    let detectStale = false;
    const bannerRects = new Map();
    liveBanners.forEach((state, hash) => {
      const el = state.postRef;
      if (!el) { detectStale = true; return; }
      const rect = el.getBoundingClientRect();
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
    // Throttled to 1000ms. Only fires when there are pending banners that haven't
    // been created yet, or when other triggers (detectStale, bannersDirty) are set.
    const now = performance.now();
    const needsPeriodicScan = ns.hasPendingBanners() && now - lastSlowPathTime > 1000;
    if (detectStale || bannersDirty || needsPeriodicScan) {
      bannersDirty = false;
      lastSlowPathTime = now;
      const posts = document.querySelectorAll(ns.POST_SELECTOR);
      posts.forEach((post) => {
        const rect = post.getBoundingClientRect();
        if (rect.height < 10) return;
        if (rect.bottom < -100 || rect.top > window.innerHeight + 100) return;

        const text = post.innerText?.trim() || "";
        if (!text) return;
        const hash = deps.hashText(text);

        const entry = deps.blockedSet.get(hash);
        if (!entry) return;
        activeHashes.add(hash);

        const existing = liveBanners.get(hash);
        if (existing) {
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
          const authorLine = entry.authorName
            ? `<div class="ld-banner__author"><span class="ld-banner__author-name">${escapeHtml(entry.authorName)}</span>`
              + (!isPromoted ? `<button class="ld-banner__trust" data-hash="${escapeHtml(hash)}" aria-label="Trust this author" title="Trust this author">&#x2713;</button>` : "")
              + `</div>`
            : "";
          banner.innerHTML = `
            <div class="ld-banner__header">
              <span class="ld-banner__title">${escapeHtml(bannerTitle)}</span>
              <button class="ld-banner__close" data-hash="${escapeHtml(hash)}" aria-label="Dismiss">&#x2715;</button>
            </div>
            <div class="ld-banner__body">
              <img class="ld-banner__img" src="${escapeHtml(entry.bannerImage)}" alt="" />
              <div class="ld-banner__meta">${escapeHtml(metaLine)}</div>
              ${authorLine}
              <div class="ld-banner__message">${escapeHtml(entry.roastMessage)}</div>
            </div>
          `;
        }

        clipBannerToNav(banner, rect, navBottom);
        overlay.appendChild(banner);
        liveBanners.set(hash, { banner, postRef: post });
        ns.decrementPendingBanners();
      });
    }

    liveBanners.forEach((state, hash) => {
      if (!activeHashes.has(hash)) {
        state.banner.remove();
        liveBanners.delete(hash);
        bannersDirty = true;
      }
    });
  }

  // --- Public API ---

  ns.liveBanners = liveBanners;
  ns.getRandomRoast = getRandomRoast;
  ns.getRandomBannerImage = getRandomBannerImage;
  ns.render = render;
  ns.clearAllBanners = function () {
    liveBanners.forEach((s) => s.banner.remove());
    liveBanners.clear();
  };
  ns.markDirty = function () {
    bannersDirty = true;
  };
  ns.getOverlayEl = function () {
    return overlayEl;
  };

  // Module exports for testing (no-op in browser)
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      getRandomRoast,
      getRandomBannerImage,
      clipBannerToNav,
      ROAST_MESSAGES,
      PROMOTED_ROAST_MESSAGES,
      BANNER_IMAGES,
      PROMOTED_BANNER_IMAGES,
      escapeHtml,
    };
  }
})();
