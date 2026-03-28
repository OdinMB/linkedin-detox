/**
 * LinkedIn Detox — Semantic Bridge
 *
 * Bridges content.js to the background service worker for semantic scoring.
 * The model runs in the background (extension context) because content scripts
 * can't create Workers with extension URLs.
 *
 * Loaded as a content script between semantic-scorer.js and content.js.
 */

const _EMBED_TIMEOUT_MS = 30000;

function _embedSentences(sentences) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn("[LinkedIn Detox] Embed request timed out");
      resolve([]);
    }, _EMBED_TIMEOUT_MS);

    chrome.runtime.sendMessage({ type: "embed", sentences }, (response) => {
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

let _phraseBank = null;

function _resetPhraseBank() { _phraseBank = null; }

async function _loadPhraseBank() {
  if (_phraseBank) return _phraseBank;
  try {
    const url = chrome.runtime.getURL("src/phrase-embeddings.json");
    const resp = await fetch(url);
    _phraseBank = await resp.json();
    _phraseBank = _phraseBank.filter((p) => p.embedding && p.embedding.length > 0);
  } catch (err) {
    console.error("[LinkedIn Detox] Failed to load phrase embeddings:", err);
    _phraseBank = [];
  }
  // Filter out deleted built-in phrases
  try {
    const syncItems = await new Promise((resolve) =>
      chrome.storage.sync.get({ deletedBuiltinPhrases: [] }, resolve)
    );
    const deletedPhrases = new Set(syncItems.deletedBuiltinPhrases || []);
    if (deletedPhrases.size > 0) {
      _phraseBank = _phraseBank.filter((p) => !deletedPhrases.has(p.label));
    }
  } catch (err) {
    console.error("[LinkedIn Detox] Failed to load deleted phrase settings:", err);
  }
  // Merge user-defined semantic phrases from storage
  try {
    const items = await new Promise((resolve) =>
      chrome.storage.local.get({ userSemanticPhrases: [] }, resolve)
    );
    const userPhrases = (items.userSemanticPhrases || [])
      .filter((p) => p.embedding && p.embedding.length > 0);
    _phraseBank = _phraseBank.concat(userPhrases);
  } catch (err) {
    console.error("[LinkedIn Detox] Failed to load user semantic phrases:", err);
  }
  return _phraseBank;
}

function _splitIntoSentences(text) {
  return text.split(/[.!?\n]+/).filter((s) => s.trim().length > 10);
}

/**
 * Get semantic score for a post's text.
 * Called by content.js when semanticEnabled is true.
 *
 * @param {string} text
 * @returns {Promise<{ score: number, matches: string[] }>}
 */
async function getSemanticScore(text) {
  const bank = await _loadPhraseBank();
  if (bank.length === 0) return { score: 0, matches: [] };

  const sentences = _splitIntoSentences(text);
  if (sentences.length === 0) return { score: 0, matches: [] };

  const embeddings = await _embedSentences(sentences);
  if (embeddings.length === 0) return { score: 0, matches: [] };

  return computeSemanticScore(embeddings, bank);
}
