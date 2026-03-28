/**
 * LinkedIn Detox — Shared Utilities
 *
 * Exports escapeHtml(), splitSentences(), extractAuthor(), and isWhitelistedAuthor()
 * via the window.LinkedInDetox namespace.
 */

(function () {
  var _global = typeof window !== "undefined" ? window : {};
  var ns = (_global.LinkedInDetox = _global.LinkedInDetox || {});

  /**
   * Escape HTML special characters to prevent XSS in innerHTML assignments.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Split text into sentences.
   * @param {string} text
   * @param {object} [opts]
   * @param {number} [opts.minLength=0] - Minimum trimmed length for a sentence to be included.
   * @returns {string[]}
   */
  function splitSentences(text, opts) {
    var minLength = (opts && opts.minLength) || 0;
    return text.split(/[.!?\n]+/).filter(function (s) {
      return s.trim().length > minLength;
    });
  }

  /**
   * Normalize Unicode noise that LinkedIn injects into rendered text.
   * Collapses non-breaking spaces, zero-width chars, and normalizes
   * various dash/hyphen characters to ASCII equivalents.
   * @param {string} str
   * @returns {string}
   */
  function normalizeText(str) {
    return str
      .replace(/[\u00A0\u202F\u2007\u2060]/g, " ")   // non-breaking / figure / word-joiner -> space
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")     // zero-width chars -> remove
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-") // various dashes -> ASCII hyphen
      .replace(/ {2,}/g, " ")                          // collapse multiple spaces
      .trim();
  }

  // Lines LinkedIn puts before the actual author name in post innerText
  var SKIP_LINES = /^(feed post|suggested|promoted|sponsored|reposted|following|follow)$/i;

  /**
   * Extract the author name from a post's innerText.
   * LinkedIn prepends accessibility labels ("Feed post", "Suggested", etc.)
   * before the author name. We skip those and return the first real line.
   * Returns empty string if no suitable line is found within the first 5 lines
   * or if the candidate line is too long (> 120 chars, probably not a name).
   * @param {string} text
   * @returns {string}
   */
  function extractAuthor(text) {
    var lines = text.split("\n");
    var limit = Math.min(lines.length, 5);
    for (var i = 0; i < limit; i++) {
      var line = normalizeText(lines[i]);
      if (!line || SKIP_LINES.test(line)) continue;
      return line.length <= 120 ? line : "";
    }
    return "";
  }

  /**
   * Check if an author line matches any entry in the whitelist Set.
   * The Set stores lowercased, normalized names. Matching is case-insensitive
   * substring with normalization: "Jane Doe" in the Set matches
   * "Jane\u00a0Doe (She/Her)" as the author line.
   * @param {string|null|undefined} authorLine
   * @param {Set<string>} whitelistSet - Set of lowercased whitelisted names
   * @returns {boolean}
   */
  function isWhitelistedAuthor(authorLine, whitelistSet) {
    if (!authorLine || whitelistSet.size === 0) return false;
    var lower = normalizeText(authorLine).toLowerCase();
    for (var name of whitelistSet) {
      if (lower.includes(name)) return true;
    }
    return false;
  }

  ns.escapeHtml = escapeHtml;
  ns.splitSentences = splitSentences;
  ns.normalizeText = normalizeText;
  ns.extractAuthor = extractAuthor;
  ns.isWhitelistedAuthor = isWhitelistedAuthor;

  // Node.js / test compatibility
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { escapeHtml, splitSentences, normalizeText, extractAuthor, isWhitelistedAuthor };
  }
})();
