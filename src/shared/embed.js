/**
 * LinkedIn Detox — Shared Embed Adapter
 *
 * Exports embedSentences() and embedPhrase() via the window._ld namespace.
 * Wraps chrome.runtime.sendMessage({ type: "embed" }) with timeout handling.
 */

(function () {
  var ns = (window._ld = window._ld || {});

  var EMBED_TIMEOUT_MS = 30000;

  /**
   * Embed multiple sentences via the background service worker.
   * Returns an array of embeddings. Resolves to [] on error (safe for content script use).
   * @param {string[]} sentences
   * @returns {Promise<number[][]>}
   */
  function embedSentences(sentences) {
    return new Promise(function (resolve) {
      var timer = setTimeout(function () {
        console.warn("[LinkedIn Detox] Embed request timed out");
        resolve([]);
      }, EMBED_TIMEOUT_MS);

      chrome.runtime.sendMessage({ type: "embed", sentences: sentences }, function (response) {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          console.warn("[LinkedIn Detox] Message error:", chrome.runtime.lastError.message);
          resolve([]);
          return;
        }
        if (response && response.error) {
          console.warn("[LinkedIn Detox] Worker error:", response.error);
        }
        resolve(response ? response.embeddings || [] : []);
      });
    });
  }

  /**
   * Embed a single phrase via the background service worker.
   * Rejects on error (suitable for options page where errors should surface to the user).
   * @param {string} sentence
   * @returns {Promise<number[]>}
   */
  function embedPhrase(sentence) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject(new Error("Embedding timed out"));
      }, EMBED_TIMEOUT_MS);

      chrome.runtime.sendMessage({ type: "embed", sentences: [sentence] }, function (response) {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || !response.embeddings || response.embeddings.length === 0) {
          reject(new Error(response && response.error ? response.error : "No embedding returned"));
          return;
        }
        resolve(response.embeddings[0]);
      });
    });
  }

  ns.embedSentences = embedSentences;
  ns.embedPhrase = embedPhrase;

  // Node.js / test compatibility
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { embedSentences, embedPhrase };
  }
})();
