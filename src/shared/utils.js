/**
 * LinkedIn Detox — Shared Utilities
 *
 * Exports escapeHtml() and splitSentences() via the window.LinkedInDetox namespace.
 */

(function () {
  var ns = (window.LinkedInDetox = window.LinkedInDetox || {});

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

  ns.escapeHtml = escapeHtml;
  ns.splitSentences = splitSentences;

  // Node.js / test compatibility
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { escapeHtml, splitSentences };
  }
})();
