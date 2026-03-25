/**
 * LinkedIn Detox — Post Detector
 *
 * analyzePost(text, config) -> { blocked, score, matches }
 *
 * Phase 1: phrase-based matching.
 * Phase 2 (future): add heuristic scorers to SCORERS array.
 */

const DEFAULT_PHRASES = [
  "I'm humbled to announce",
  "I'm thrilled to share",
  "I'm excited to announce",
  "Here's why this matters",
  "Here's what I learned",
  "Let that sink in",
  "Let me be vulnerable for a moment",
  "I never thought I'd say this",
  "Read that again",
  "This changed my life",
  "This is the way",
  "Agree?",
  "Thoughts?",
  "10 lessons I learned",
  "5 things I wish I knew",
  "Most people don't realize",
  "Nobody talks about this",
  "Stop scrolling",
  "Unpopular opinion",
  "Hot take",
  "I used to think",
  "Here's the truth",
  "That's it. That's the post.",
  "If you're not doing this, you're falling behind",
  "Repost if you agree",
  "Share if this resonated",
  "Comment below",
  "Drop a",
  "I asked ChatGPT",
  "I asked AI",
  "AI won't replace you",
  "The future of work",
  "Personal branding is",
];

/**
 * Phrase-based scorer.
 * Returns { score: 0-100, matches: string[] }
 */
function phraseScorer(text, phrases) {
  const lower = text.toLowerCase();
  const matches = phrases.filter((p) => lower.includes(p.toLowerCase()));
  // Each match adds 30 points, capped at 100
  const score = Math.min(100, matches.length * 30);
  return { score, matches };
}

// --- Future scorers go here ---
// function emojiDensityScorer(text) { ... }
// function listPatternScorer(text) { ... }
// function buzzwordScorer(text) { ... }
//
// Add them to SCORERS and they'll be averaged into the final score.

const SCORERS = [
  // Each scorer returns { score: number, matches: string[] }
  // phraseScorer is called separately since it needs the phrase list
];

/**
 * Analyze a post for AI-generated slop.
 *
 * @param {string} text - The post text content
 * @param {object} config - { phrases: string[], threshold: number }
 * @returns {{ blocked: boolean, score: number, matches: string[] }}
 */
function analyzePost(text, config) {
  const phrases = config.phrases || DEFAULT_PHRASES;
  const threshold = config.threshold ?? 30;

  // Run phrase scorer
  const phraseResult = phraseScorer(text, phrases);

  // Run additional scorers and average everything
  const allResults = [phraseResult];
  for (const scorer of SCORERS) {
    allResults.push(scorer(text));
  }

  const avgScore = Math.round(
    allResults.reduce((sum, r) => sum + r.score, 0) / allResults.length
  );
  const allMatches = allResults.flatMap((r) => r.matches);

  return {
    blocked: avgScore >= threshold,
    score: avgScore,
    matches: allMatches,
  };
}
