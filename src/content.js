/**
 * LinkedIn Detox — Content Script
 *
 * Watches the LinkedIn feed for new posts, runs them through the detector,
 * and either hides them or replaces them with a roast banner.
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

function getRandomRoast() {
  return ROAST_MESSAGES[Math.floor(Math.random() * ROAST_MESSAGES.length)];
}

function createRoastBanner(result, originalText) {
  const banner = document.createElement("div");
  banner.className = "ld-roast-banner";
  banner.setAttribute("data-ld-processed", "true");

  const matchList =
    result.matches.length > 0
      ? `Triggered by: "${result.matches.join('", "')}"`
      : "";

  banner.innerHTML = `
    <div class="ld-roast-banner__title">
      LinkedIn Detox
      <span class="ld-roast-banner__score">Slop Score: ${result.score}%</span>
    </div>
    <div class="ld-roast-banner__message">${getRandomRoast()}</div>
    ${matchList ? `<div class="ld-roast-banner__matches">${matchList}</div>` : ""}
    <button class="ld-roast-banner__peek">Show original</button>
    <div class="ld-roast-banner__original">${originalText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
  `;

  const btn = banner.querySelector(".ld-roast-banner__peek");
  const original = banner.querySelector(".ld-roast-banner__original");
  btn.addEventListener("click", () => {
    const visible = original.classList.toggle(
      "ld-roast-banner__original--visible"
    );
    btn.textContent = visible ? "Hide original" : "Show original";
  });

  return banner;
}

function getPostText(postElement) {
  // LinkedIn wraps post text in various containers
  const textEl =
    postElement.querySelector(".feed-shared-update-v2__description") ||
    postElement.querySelector(".update-components-text") ||
    postElement.querySelector('[data-test-id="main-feed-activity-content"]') ||
    postElement.querySelector(".break-words");
  return textEl ? textEl.innerText.trim() : "";
}

function processPost(postElement, config) {
  if (postElement.getAttribute("data-ld-processed")) return;
  postElement.setAttribute("data-ld-processed", "true");

  const text = getPostText(postElement);
  if (!text) return;

  // analyzePost is defined in detector.js, loaded before this script
  const result = analyzePost(text, config);
  if (!result.blocked) return;

  // Track stats
  config._blocked = (config._blocked || 0) + 1;
  chrome.storage.local.set({ blockedCount: config._blocked });

  if (config.mode === "hide") {
    postElement.classList.add("ld-hidden");
  } else {
    // Roast mode: replace content with banner
    const banner = createRoastBanner(result, text);
    postElement.innerHTML = "";
    postElement.appendChild(banner);
  }
}

function findPosts() {
  return document.querySelectorAll(
    '.feed-shared-update-v2:not([data-ld-processed]), [data-urn^="urn:li:activity"]:not([data-ld-processed])'
  );
}

function scanFeed(config) {
  if (!config.enabled) return;
  const posts = findPosts();
  posts.forEach((post) => processPost(post, config));
}

// Load config and start observing
const DEFAULT_CONFIG = {
  enabled: true,
  mode: "roast", // "hide" or "roast"
  phrases: null, // null = use DEFAULT_PHRASES from detector.js
  threshold: 30,
};

let currentConfig = { ...DEFAULT_CONFIG };

function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_CONFIG, (items) => {
      currentConfig = { ...items, _blocked: 0 };
      resolve(currentConfig);
    });
  });
}

// Listen for config changes from popup
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  for (const [key, { newValue }] of Object.entries(changes)) {
    currentConfig[key] = newValue;
  }
  // Re-process on config change: remove old banners and re-scan
  document
    .querySelectorAll("[data-ld-processed]")
    .forEach((el) => el.removeAttribute("data-ld-processed"));
  document
    .querySelectorAll(".ld-roast-banner")
    .forEach((el) => el.remove());
  document
    .querySelectorAll(".ld-hidden")
    .forEach((el) => el.classList.remove("ld-hidden"));
  scanFeed(currentConfig);
});

// Main
loadConfig().then((config) => {
  // Initial scan
  scanFeed(config);

  // Watch for new posts loaded via infinite scroll
  const observer = new MutationObserver(() => scanFeed(currentConfig));
  const feed =
    document.querySelector(".scaffold-finite-scroll__content") ||
    document.querySelector("main") ||
    document.body;
  observer.observe(feed, { childList: true, subtree: true });
});
