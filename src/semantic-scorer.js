/**
 * LinkedIn Detox — Semantic Scorer
 *
 * Computes cosine similarity between sentence embeddings and a bank of
 * canonical AI-slop phrase types. Returns { score, matches } like the
 * heuristic scorers.
 *
 * The actual embedding (transformers.js) runs in a Web Worker.
 * This module handles the scoring math given pre-computed embeddings.
 */

/**
 * Cosine similarity between two vectors.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} similarity in [-1, 1]
 */
function cosineSimilarity(a, b) {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Convert a max cosine similarity value to a score (0-100).
 * - similarity >= 0.75 → score 80+
 * - similarity >= 0.60 → score 50+
 * - similarity < 0.60  → score 0
 *
 * @param {number} similarity
 * @returns {number}
 */
function scoreFromSimilarity(similarity) {
  if (similarity < 0.60) return 0;
  if (similarity < 0.75) {
    // Linear interpolation: 0.60 → 50, 0.75 → 80
    return Math.round(50 + ((similarity - 0.60) / 0.15) * 30);
  }
  // Linear interpolation: 0.75 → 80, 1.0 → 100
  return Math.min(100, Math.round(80 + ((similarity - 0.75) / 0.25) * 20));
}

/**
 * Compute semantic score given pre-embedded sentences and phrase bank.
 *
 * @param {number[][]} sentenceEmbeddings - Embeddings for each sentence in the post
 * @param {Array<{label: string, embedding: number[]}>} phraseBank - Canonical phrase type embeddings
 * @returns {{ score: number, matches: string[] }}
 */
function computeSemanticScore(sentenceEmbeddings, phraseBank) {
  if (sentenceEmbeddings.length === 0 || phraseBank.length === 0) {
    return { score: 0, matches: [] };
  }

  // Track best similarity per phrase label to deduplicate
  const bestByLabel = new Map();
  let maxScore = 0;

  for (const sentenceEmb of sentenceEmbeddings) {
    for (const phrase of phraseBank) {
      const sim = cosineSimilarity(sentenceEmb, phrase.embedding);
      if (sim >= 0.60) {
        const score = scoreFromSimilarity(sim);
        if (score > maxScore) maxScore = score;
        const prev = bestByLabel.get(phrase.label);
        if (!prev || sim > prev) {
          bestByLabel.set(phrase.label, sim);
        }
      }
    }
  }

  const matches = Array.from(bestByLabel.entries()).map(
    ([label, sim]) => `Similar to: '${label}' (similarity: ${sim.toFixed(2)})`
  );

  return { score: maxScore, matches };
}

// Module exports for testing (no-op in browser)
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    cosineSimilarity,
    scoreFromSimilarity,
    computeSemanticScore,
  };
}
