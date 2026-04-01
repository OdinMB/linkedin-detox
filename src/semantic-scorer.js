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

// Similarity thresholds and score interpolation anchors
const COSINE_LOW_THRESHOLD = 0.60;   // Below this → score 0
const COSINE_HIGH_THRESHOLD = 0.75;  // Above this → score 80+
const SCORE_AT_LOW = 50;             // Score when similarity = COSINE_LOW_THRESHOLD
const SCORE_AT_HIGH = 80;            // Score when similarity = COSINE_HIGH_THRESHOLD
const SCORE_AT_MAX = 100;            // Score when similarity = 1.0

/**
 * Convert a max cosine similarity value to a score (0-100).
 * - similarity >= HIGH → score 80+
 * - similarity >= LOW  → score 50+
 * - similarity < LOW   → score 0
 *
 * @param {number} similarity
 * @returns {number}
 */
function scoreFromSimilarity(similarity) {
  if (similarity < COSINE_LOW_THRESHOLD) return 0;
  if (similarity < COSINE_HIGH_THRESHOLD) {
    const range = COSINE_HIGH_THRESHOLD - COSINE_LOW_THRESHOLD;
    return Math.round(SCORE_AT_LOW + ((similarity - COSINE_LOW_THRESHOLD) / range) * (SCORE_AT_HIGH - SCORE_AT_LOW));
  }
  const range = 1.0 - COSINE_HIGH_THRESHOLD;
  return Math.min(SCORE_AT_MAX, Math.round(SCORE_AT_HIGH + ((similarity - COSINE_HIGH_THRESHOLD) / range) * (SCORE_AT_MAX - SCORE_AT_HIGH)));
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
      if (sim >= COSINE_LOW_THRESHOLD) {
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
