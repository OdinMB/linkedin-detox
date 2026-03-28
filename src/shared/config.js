/**
 * LinkedIn Detox — Shared Config
 *
 * Exports DEFAULT_CONFIG, SENSITIVITY_THRESHOLDS, and loadConfig()
 * via the window.LinkedInDetox namespace.
 */

(function () {
  const ns = (window.LinkedInDetox = window.LinkedInDetox || {});

  const SENSITIVITY_THRESHOLDS = { chill: 50, suspicious: 25, unhinged: 1 };

  const DEFAULT_CONFIG = {
    enabled: true,
    mode: "roast",
    sensitivity: "suspicious",
    threshold: 25,
    testMode: false,
    semanticEnabled: false,
    blockPromoted: false,
    debugLogging: false,
    theme: "light",
    userSignalWords: [],
    userCooccurrencePatterns: [],
    deletedBuiltinWords: [],
    deletedBuiltinCoocLabels: [],
    whitelistedAuthors: [],
  };

  /**
   * Load config from chrome.storage.sync with defaults, compute threshold,
   * convert userSignalWords to RegExp, and convert deleted-builtin arrays to Sets.
   * @returns {Promise<object>} The resolved config object.
   */
  function loadConfig() {
    return new Promise(function (resolve) {
      chrome.storage.sync.get(DEFAULT_CONFIG, function (items) {
        items.threshold = SENSITIVITY_THRESHOLDS[items.sensitivity] || 25;
        if (items.userSignalWords && items.userSignalWords.length > 0) {
          items.userSignalWords = items.userSignalWords.map(function (w) {
            var escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            return new RegExp("\\b" + escaped + "(s|ed|ing|er|ly|tion|ment)?\\b", "gi");
          });
        }
        items.deletedBuiltinWords = new Set(items.deletedBuiltinWords || []);
        items.deletedBuiltinCoocLabels = new Set(items.deletedBuiltinCoocLabels || []);
        var normalize = ns.normalizeText || function (s) { return s.trim(); };
        items.whitelistedAuthorsSet = new Set(
          (items.whitelistedAuthors || []).map(function (n) { return normalize(n).toLowerCase(); })
        );
        resolve(items);
      });
    });
  }

  ns.SENSITIVITY_THRESHOLDS = SENSITIVITY_THRESHOLDS;
  ns.DEFAULT_CONFIG = DEFAULT_CONFIG;
  ns.loadConfig = loadConfig;

  // Node.js / test compatibility
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { SENSITIVITY_THRESHOLDS, DEFAULT_CONFIG, loadConfig };
  }
})();
