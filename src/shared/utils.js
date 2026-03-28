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
   * Extract the author name from a post's innerText.
   * LinkedIn puts the author name on the first line (before the first newline).
   * Returns empty string if the first line is too long (> 120 chars, probably not a name).
   * @param {string} text
   * @returns {string}
   */
  function extractAuthor(text) {
    var firstLine = (text.split("\n")[0] || "").trim();
    return firstLine.length <= 120 ? firstLine : "";
  }

  /**
   * Check if an author line matches any entry in the whitelist Set.
   * The Set stores lowercased names. Matching is case-insensitive substring:
   * "Jane Doe" in the Set matches "Jane Doe (She/Her)" as the author line.
   * @param {string|null|undefined} authorLine
   * @param {Set<string>} whitelistSet - Set of lowercased whitelisted names
   * @returns {boolean}
   */
  function isWhitelistedAuthor(authorLine, whitelistSet) {
    if (!authorLine || whitelistSet.size === 0) return false;
    var lower = authorLine.toLowerCase();
    for (var name of whitelistSet) {
      if (lower.includes(name)) return true;
    }
    return false;
  }

  ns.escapeHtml = escapeHtml;
  ns.splitSentences = splitSentences;
  ns.extractAuthor = extractAuthor;
  ns.isWhitelistedAuthor = isWhitelistedAuthor;

  // Node.js / test compatibility
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { escapeHtml, splitSentences, extractAuthor, isWhitelistedAuthor };
  }
})();
