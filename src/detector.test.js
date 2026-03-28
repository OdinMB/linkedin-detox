import { describe, it, expect } from "vitest";
import {
  emDashScorer,
  wordFrequencyScorer,
  cooccurrenceScorer,
  analyzePost,
  isPromotedPost,
  SIGNAL_WORDS,
  SIGNAL_WORD_LABELS,
  COOCCURRENCE_PATTERNS,
} from "./detector.js";

// --- emDashScorer ---

describe("emDashScorer", () => {
  it("returns 0 for text with no em dashes", () => {
    const result = emDashScorer("This is a normal sentence. Here is another one.");
    expect(result.score).toBe(0);
    expect(result.matches).toHaveLength(0);
  });

  it("detects unicode em dashes", () => {
    const result = emDashScorer("Leadership \u2014 in my experience \u2014 is about trust. Growth \u2014 the real kind \u2014 takes time.");
    expect(result.score).toBeGreaterThan(0);
    expect(result.matches[0]).toMatch(/em dashes/i);
  });

  it("detects double-hyphen em dashes", () => {
    const result = emDashScorer("Leadership -- in my view -- is everything.");
    expect(result.score).toBeGreaterThan(0);
  });

  it("detects triple-hyphen em dashes", () => {
    const result = emDashScorer("The key --- I think --- is consistency.");
    expect(result.score).toBeGreaterThan(0);
  });

  it("scores higher with more em dashes per sentence", () => {
    const low = emDashScorer("One em dash \u2014 here. And another sentence without.");
    const high = emDashScorer("One \u2014 two \u2014 three \u2014 four. Short.");
    expect(high.score).toBeGreaterThan(low.score);
  });

  it("detects excessive ellipsis", () => {
    const result = emDashScorer("Thinking... about leadership... and growth... you know...");
    expect(result.score).toBeGreaterThan(0);
    expect(result.matches[0]).toMatch(/ellips/i);
  });

  it("caps at 100", () => {
    const dashes = Array(20).fill("word \u2014 word").join(". ");
    const result = emDashScorer(dashes);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

// --- wordFrequencyScorer ---

describe("wordFrequencyScorer", () => {
  it("returns 0 for text with no signal words", () => {
    const result = wordFrequencyScorer("The cat sat on the mat.");
    expect(result.score).toBe(0);
    expect(result.matches).toHaveLength(0);
  });

  it("detects signal words", () => {
    const result = wordFrequencyScorer("We need to leverage synergy to unlock scalable growth.");
    expect(result.score).toBeGreaterThan(0);
    expect(result.matches).toEqual(expect.arrayContaining(["leverage"]));
    expect(result.matches).toEqual(expect.arrayContaining(["synergy"]));
    expect(result.matches).toEqual(expect.arrayContaining(["unlock"]));
    expect(result.matches).toEqual(expect.arrayContaining(["scalable"]));
  });

  it("catches morphological variants", () => {
    const result = wordFrequencyScorer("She leveraged the disrupting framework to resonate with the ecosystem.");
    expect(result.matches).toEqual(expect.arrayContaining(["leveraged"]));
    expect(result.matches).toEqual(expect.arrayContaining(["disrupting"]));
    expect(result.matches).toEqual(expect.arrayContaining(["framework"]));
    expect(result.matches).toEqual(expect.arrayContaining(["resonate"]));
    expect(result.matches).toEqual(expect.arrayContaining(["ecosystem"]));
  });

  it("scores by density — long post with one word scores low", () => {
    const filler = Array(50).fill("the quick brown fox jumps over the lazy dog").join(" ");
    const result = wordFrequencyScorer(filler + " leverage");
    expect(result.score).toBeLessThan(20);
  });

  it("scores high for dense buzzword content", () => {
    const result = wordFrequencyScorer("Leverage synergy to unlock scalable, disruptive, impactful, transformative frameworks.");
    expect(result.score).toBeGreaterThan(50);
  });

  it("accepts user-defined signal words", () => {
    const userWords = [/\bfoobar(s)?\b/gi];
    const result = wordFrequencyScorer("Check out this foobar thing I built.", userWords);
    expect(result.matches).toEqual(expect.arrayContaining(["foobar"]));
  });

  it("caps at 100", () => {
    const result = wordFrequencyScorer("leverage synergy unlock scale disrupt framework ecosystem resonate impactful transformative");
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

// --- cooccurrenceScorer ---

describe("cooccurrenceScorer", () => {
  it("returns 0 for text with no pattern matches", () => {
    const result = cooccurrenceScorer("The cat sat on the mat.");
    expect(result.score).toBe(0);
    expect(result.matches).toHaveLength(0);
  });

  it("detects 'interesting thing' pattern", () => {
    const result = cooccurrenceScorer("But here's the interesting thing about leadership.");
    expect(result.score).toBeGreaterThan(0);
    expect(result.matches).toEqual(expect.arrayContaining(["interesting thing"]));
  });

  it("detects 'humbled to share' pattern", () => {
    const result = cooccurrenceScorer("I'm humbled to share that we just raised our Series A.");
    expect(result.score).toBeGreaterThan(0);
    expect(result.matches).toEqual(expect.arrayContaining(["humbled to share"]));
  });

  it("detects 'false dichotomy' pattern", () => {
    const result = cooccurrenceScorer("It's not about the money, it's about the impact.");
    expect(result.score).toBeGreaterThan(0);
    expect(result.matches).toEqual(expect.arrayContaining(["false dichotomy"]));
  });

  it("detects 'if you're not' pattern", () => {
    const result = cooccurrenceScorer("If you're not learning every day, you're falling behind.");
    expect(result.score).toBeGreaterThan(0);
    expect(result.matches).toEqual(expect.arrayContaining(["if you're not"]));
  });

  it("detects 'nobody talks about' pattern", () => {
    const result = cooccurrenceScorer("Nobody is talking about this crucial trend in AI.");
    expect(result.score).toBeGreaterThan(0);
    expect(result.matches).toEqual(expect.arrayContaining(["nobody talks about"]));
  });

  it("compounds score for multiple pattern matches", () => {
    const single = cooccurrenceScorer("Here's the interesting thing about growth.");
    const multi = cooccurrenceScorer(
      "Here's the interesting thing. I'm humbled to share. Nobody is talking about this."
    );
    expect(multi.score).toBeGreaterThan(single.score);
  });

  it("requires both groups in same sentence", () => {
    // "interesting" and "here" in different sentences should NOT match
    const result = cooccurrenceScorer("That's interesting. Come over here.");
    expect(result.matches).not.toEqual(expect.arrayContaining(["interesting thing"]));
  });

  it("accepts user-defined co-occurrence patterns", () => {
    const userPatterns = [
      { groups: [["amazing"], ["opportunity"]], label: "amazing opportunity" },
    ];
    const result = cooccurrenceScorer("What an amazing opportunity this is.", userPatterns);
    expect(result.matches).toEqual(expect.arrayContaining(["amazing opportunity"]));
  });

  it("caps at 100", () => {
    const result = cooccurrenceScorer(
      "Here's the interesting thing. I'm humbled to share. " +
      "It's not about X, it's about Y. If you're not learning, you're dying. " +
      "Nobody is talking about this. Here's what's fascinating about this part. " +
      "I'm thrilled to announce. Most people don't realize."
    );
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

// --- isPromotedPost ---

describe("isPromotedPost", () => {
  it("detects 'Promoted' in the header area", () => {
    expect(isPromotedPost("Company Name\nPromoted\nCheck out our amazing product!")).toBe(true);
  });

  it("detects 'Promoted' as the first word", () => {
    expect(isPromotedPost("Promoted\nSome ad content here")).toBe(true);
  });

  it("ignores 'Promoted' appearing after the first 200 characters", () => {
    const longHeader = "A".repeat(201);
    expect(isPromotedPost(longHeader + " Promoted post content")).toBe(false);
  });

  it("ignores lowercase 'promoted' even in header position", () => {
    expect(isPromotedPost("promoted content here in first 200 chars")).toBe(false);
  });

  it("ignores lowercase 'promoted' in natural sentences", () => {
    expect(isPromotedPost("I just got promoted to senior engineer! So excited.")).toBe(false);
  });

  it("returns false for normal posts without 'Promoted'", () => {
    expect(isPromotedPost("Just sharing some thoughts on leadership.")).toBe(false);
  });

  it("matches 'Promoted' as a standalone word only", () => {
    // "Promoted" embedded in another word should not match
    expect(isPromotedPost("SelfPromoted content here")).toBe(false);
  });
});

// --- analyzePost (integration) ---

describe("analyzePost", () => {
  it("returns { blocked, score, matches }", () => {
    const result = analyzePost("Hello world", { threshold: 30 });
    expect(result).toHaveProperty("blocked");
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("matches");
  });

  it("uses max-of-all-scorers, not average", () => {
    // A post that triggers one scorer strongly should get that scorer's score
    const result = analyzePost(
      "Leverage synergy to unlock scalable disruptive impactful transformative frameworks.",
      { threshold: 30 }
    );
    // If max is used, score should be the highest scorer's value, not averaged down
    expect(result.score).toBeGreaterThan(50);
    expect(result.blocked).toBe(true);
  });

  it("blocks when score >= threshold", () => {
    const result = analyzePost(
      "I'm humbled to share \u2014 truly humbled \u2014 that we leveraged our synergy.",
      { threshold: 20 }
    );
    expect(result.blocked).toBe(true);
  });

  it("does not block clean text", () => {
    const result = analyzePost(
      "Had a great meeting with the team today. Looking forward to the project kickoff.",
      { threshold: 30 }
    );
    expect(result.blocked).toBe(false);
    expect(result.score).toBeLessThan(30);
  });

  it("merges user-defined signal words into scoring", () => {
    const result = analyzePost("This is about foobar stuff and foobar things.", {
      threshold: 10,
      userSignalWords: [/\bfoobar(s)?\b/gi],
    });
    expect(result.matches).toEqual(expect.arrayContaining(["foobar"]));
  });

  it("merges user-defined co-occurrence patterns", () => {
    const result = analyzePost("An amazing opportunity awaits.", {
      threshold: 10,
      userCooccurrencePatterns: [
        { groups: [["amazing"], ["opportunity"]], label: "amazing opportunity" },
      ],
    });
    expect(result.matches).toEqual(expect.arrayContaining(["amazing opportunity"]));
  });
});

// --- SIGNAL_WORD_LABELS ---

describe("SIGNAL_WORD_LABELS", () => {
  it("has same length as SIGNAL_WORDS", () => {
    expect(SIGNAL_WORD_LABELS.length).toBe(SIGNAL_WORDS.length);
  });
});

// --- wordFrequencyScorer with deletedBuiltinLabels ---

describe("wordFrequencyScorer with deletedBuiltinLabels", () => {
  it("excludes deleted built-in words from scoring", () => {
    const result = wordFrequencyScorer("We need to leverage our assets.", undefined, new Set(["leverage"]));
    expect(result.score).toBe(0);
    expect(result.matches).toHaveLength(0);
  });

  it("still detects non-deleted built-in words", () => {
    const result = wordFrequencyScorer("We need to leverage synergy.", undefined, new Set(["leverage"]));
    expect(result.matches).toEqual(expect.arrayContaining(["synergy"]));
    expect(result.matches).not.toEqual(expect.arrayContaining(["leverage"]));
  });

  it("works with empty deletedBuiltinLabels", () => {
    const result = wordFrequencyScorer("We need to leverage our assets.", undefined, new Set());
    expect(result.matches).toEqual(expect.arrayContaining(["leverage"]));
  });

  it("works with undefined deletedBuiltinLabels (backward compat)", () => {
    const result = wordFrequencyScorer("We need to leverage our assets.");
    expect(result.matches).toEqual(expect.arrayContaining(["leverage"]));
  });

  it("still includes user words even when built-ins are deleted", () => {
    const userWords = [/\bfoobar(s)?\b/gi];
    const result = wordFrequencyScorer("Check foobar leverage.", userWords, new Set(["leverage"]));
    expect(result.matches).toEqual(expect.arrayContaining(["foobar"]));
    expect(result.matches).not.toEqual(expect.arrayContaining(["leverage"]));
  });
});

// --- cooccurrenceScorer with deletedBuiltinLabels ---

describe("cooccurrenceScorer with deletedBuiltinLabels", () => {
  it("excludes deleted built-in patterns from scoring", () => {
    const result = cooccurrenceScorer(
      "I'm humbled to share that we just raised our Series A.",
      undefined,
      new Set(["humbled to share"])
    );
    expect(result.score).toBe(0);
    expect(result.matches).toHaveLength(0);
  });

  it("still detects non-deleted built-in patterns", () => {
    const result = cooccurrenceScorer(
      "I'm humbled to share. Here's the interesting thing.",
      undefined,
      new Set(["humbled to share"])
    );
    expect(result.matches).toEqual(expect.arrayContaining(["interesting thing"]));
    expect(result.matches).not.toEqual(expect.arrayContaining(["humbled to share"]));
  });

  it("works with undefined deletedBuiltinLabels (backward compat)", () => {
    const result = cooccurrenceScorer("I'm humbled to share that we raised.");
    expect(result.matches).toEqual(expect.arrayContaining(["humbled to share"]));
  });

  it("still includes user patterns when built-ins are deleted", () => {
    const userPatterns = [
      { groups: [["amazing"], ["opportunity"]], label: "amazing opportunity" },
    ];
    const result = cooccurrenceScorer(
      "I'm humbled to share. An amazing opportunity.",
      userPatterns,
      new Set(["humbled to share"])
    );
    expect(result.matches).toEqual(expect.arrayContaining(["amazing opportunity"]));
    expect(result.matches).not.toEqual(expect.arrayContaining(["humbled to share"]));
  });
});

// --- analyzePost with deleted builtins ---

describe("analyzePost with deleted builtins", () => {
  it("respects deletedBuiltinWords in config", () => {
    const result = analyzePost("We leverage synergy to unlock growth.", {
      threshold: 10,
      deletedBuiltinWords: new Set(["leverage", "synergy", "unlock"]),
    });
    expect(result.matches).not.toEqual(expect.arrayContaining(["leverage"]));
    expect(result.matches).not.toEqual(expect.arrayContaining(["synergy"]));
    expect(result.matches).not.toEqual(expect.arrayContaining(["unlock"]));
  });

  it("respects deletedBuiltinCoocLabels in config", () => {
    const result = analyzePost("I'm humbled to share this.", {
      threshold: 10,
      deletedBuiltinCoocLabels: new Set(["humbled to share"]),
    });
    expect(result.matches).not.toEqual(expect.arrayContaining(["humbled to share"]));
  });
});
