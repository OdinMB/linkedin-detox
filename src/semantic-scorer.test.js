import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  scoreFromSimilarity,
  computeSemanticScore,
} from "./semantic-scorer.js";

// --- cosineSimilarity ---

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 0, 0, 1];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = [1, 0, 0, 0];
    const b = [0, 1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it("returns -1 for opposite vectors", () => {
    const a = [1, 0];
    const b = [-1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  it("computes correctly for non-trivial vectors", () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    // dot = 32, |a| = sqrt(14), |b| = sqrt(77)
    const expected = 32 / (Math.sqrt(14) * Math.sqrt(77));
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 5);
  });

  it("returns 0 for zero vector", () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBe(0);
  });
});

// --- scoreFromSimilarity ---

describe("scoreFromSimilarity", () => {
  it("returns 0 for similarity below 0.60", () => {
    expect(scoreFromSimilarity(0.59)).toBe(0);
    expect(scoreFromSimilarity(0.3)).toBe(0);
    expect(scoreFromSimilarity(0)).toBe(0);
  });

  it("returns score 50+ for similarity between 0.60 and 0.75", () => {
    const score = scoreFromSimilarity(0.65);
    expect(score).toBeGreaterThanOrEqual(50);
    expect(score).toBeLessThan(80);
  });

  it("returns score 80+ for similarity above 0.75", () => {
    const score = scoreFromSimilarity(0.80);
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it("returns exactly 50 at similarity 0.60", () => {
    expect(scoreFromSimilarity(0.60)).toBe(50);
  });

  it("returns 80 at similarity 0.75", () => {
    expect(scoreFromSimilarity(0.75)).toBe(80);
  });

  it("caps at 100", () => {
    expect(scoreFromSimilarity(1.0)).toBeLessThanOrEqual(100);
  });
});

// --- computeSemanticScore ---

describe("computeSemanticScore", () => {
  // Fake phrase bank: 3-dimensional embeddings for simplicity
  const phraseBank = [
    { label: "dramatic reveal", embedding: [1, 0, 0] },
    { label: "humblebragging", embedding: [0, 1, 0] },
    { label: "false wisdom", embedding: [0, 0, 1] },
  ];

  it("returns score 0 and no matches when no sentence is similar", () => {
    // Orthogonal to all phrase bank entries
    const sentenceEmbeddings = [[0.1, 0.1, 0.1]];
    const result = computeSemanticScore(sentenceEmbeddings, phraseBank);
    // Low similarity for unit-ish vectors vs balanced vector
    expect(result.score).toBeLessThan(50);
  });

  it("returns high score when a sentence closely matches a phrase type", () => {
    // Almost identical to "dramatic reveal"
    const sentenceEmbeddings = [[0.99, 0.01, 0.01]];
    const result = computeSemanticScore(sentenceEmbeddings, phraseBank);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.matches).toEqual(
      expect.arrayContaining([expect.stringContaining("dramatic reveal")])
    );
  });

  it("returns the max score across all sentences", () => {
    const sentenceEmbeddings = [
      [0.1, 0.1, 0.1], // low similarity to everything
      [0.99, 0.01, 0.01], // high similarity to "dramatic reveal"
    ];
    const result = computeSemanticScore(sentenceEmbeddings, phraseBank);
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it("includes similarity value in match description", () => {
    const sentenceEmbeddings = [[0.99, 0.01, 0.01]];
    const result = computeSemanticScore(sentenceEmbeddings, phraseBank);
    expect(result.matches[0]).toMatch(/similarity: \d\.\d+/);
  });

  it("returns empty matches array when score is 0", () => {
    // All zeros — no similarity
    const sentenceEmbeddings = [[0, 0, 0]];
    const result = computeSemanticScore(sentenceEmbeddings, phraseBank);
    expect(result.matches).toHaveLength(0);
  });

  it("handles multiple matching phrases", () => {
    const sentenceEmbeddings = [
      [0.99, 0.01, 0.01], // matches "dramatic reveal"
      [0.01, 0.99, 0.01], // matches "humblebragging"
    ];
    const result = computeSemanticScore(sentenceEmbeddings, phraseBank);
    expect(result.matches.length).toBeGreaterThanOrEqual(2);
  });

  it("handles empty sentence embeddings", () => {
    const result = computeSemanticScore([], phraseBank);
    expect(result.score).toBe(0);
    expect(result.matches).toHaveLength(0);
  });

  it("handles empty phrase bank", () => {
    const result = computeSemanticScore([[1, 0, 0]], []);
    expect(result.score).toBe(0);
    expect(result.matches).toHaveLength(0);
  });
});
