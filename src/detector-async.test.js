import { describe, it, expect } from "vitest";
import { analyzePost, analyzePostAsync } from "./detector.js";

describe("analyzePostAsync", () => {
  it("returns same result as analyzePost when semanticEnabled is false", async () => {
    const config = { threshold: 30, semanticEnabled: false };
    const text = "I'm humbled to share that we leveraged our synergy.";
    const syncResult = analyzePost(text, config);
    const asyncResult = await analyzePostAsync(text, config);
    expect(asyncResult).toEqual(syncResult);
  });

  it("returns sync result structure with blocked/score/matches", async () => {
    const config = { threshold: 30, semanticEnabled: false };
    const result = await analyzePostAsync("Hello world", config);
    expect(result).toHaveProperty("blocked");
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("matches");
  });

  it("includes semantic matches when semanticEnabled and getSemanticScore provided", async () => {
    const fakeGetSemanticScore = async (text) => ({
      score: 85,
      matches: ["Similar to: 'dramatic reveal' (similarity: 0.88)"],
    });

    const config = {
      threshold: 30,
      semanticEnabled: true,
      getSemanticScore: fakeGetSemanticScore,
    };

    // Clean text that heuristics won't catch
    const text = "Let me share a counterintuitive insight about the market.";
    const result = await analyzePostAsync(text, config);
    expect(result.score).toBe(85);
    expect(result.blocked).toBe(true);
    expect(result.matches).toEqual(
      expect.arrayContaining([expect.stringContaining("dramatic reveal")])
    );
  });

  it("uses max of heuristic and semantic scores", async () => {
    const fakeGetSemanticScore = async () => ({
      score: 40,
      matches: ["Similar to: 'thought leader' (similarity: 0.65)"],
    });

    const config = {
      threshold: 30,
      semanticEnabled: true,
      getSemanticScore: fakeGetSemanticScore,
    };

    // Text that heuristics will score highly
    const text = "Leverage synergy to unlock scalable disruptive impactful transformative frameworks.";
    const syncResult = analyzePost(text, config);
    const asyncResult = await analyzePostAsync(text, config);

    // Async score should be at least as high as sync (heuristic dominates here)
    expect(asyncResult.score).toBeGreaterThanOrEqual(syncResult.score);
  });

  it("skips semantic scoring when heuristics already blocked the post", async () => {
    let called = false;
    const fakeGetSemanticScore = async () => {
      called = true;
      return { score: 50, matches: ["semantic match"] };
    };

    const config = {
      threshold: 30,
      semanticEnabled: true,
      getSemanticScore: fakeGetSemanticScore,
    };

    // Text that heuristics will definitely block (high word frequency score)
    const text = "Leverage synergy to unlock scalable disruptive impactful transformative frameworks.";
    const syncResult = analyzePost(text, config);
    expect(syncResult.blocked).toBe(true); // precondition

    const asyncResult = await analyzePostAsync(text, config);
    expect(called).toBe(false);
    expect(asyncResult).toEqual(syncResult);
  });

  it("does not call getSemanticScore when semanticEnabled is false", async () => {
    let called = false;
    const fakeGetSemanticScore = async () => {
      called = true;
      return { score: 0, matches: [] };
    };

    const config = {
      threshold: 30,
      semanticEnabled: false,
      getSemanticScore: fakeGetSemanticScore,
    };

    await analyzePostAsync("Some text here.", config);
    expect(called).toBe(false);
  });
});
