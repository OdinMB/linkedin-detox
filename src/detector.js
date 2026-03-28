/**
 * LinkedIn Detox — Post Detector
 *
 * analyzePost(text, config) -> { blocked, score, matches }
 *
 * Three signal-based scorers: em dash frequency, word frequency, co-occurrence.
 * Final score = max of all scorers. One strong signal is enough.
 */

// --- Em dash frequency scorer ---

const EM_DASH_RE = /\u2014|---|--/g;
const ELLIPSIS_RE = /\.{3,}/g;

const splitSentences = (typeof LinkedInDetox !== "undefined" && LinkedInDetox.splitSentences)
  ? LinkedInDetox.splitSentences
  : function (text) { return text.split(/[.!?\n]+/).filter((s) => s.trim().length > 0); };

/**
 * Scores em dash and ellipsis density.
 * @param {string} text
 * @returns {{ score: number, matches: string[] }}
 */
function emDashScorer(text) {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return { score: 0, matches: [] };

  const dashCount = (text.match(EM_DASH_RE) || []).length;
  const ellipsisCount = (text.match(ELLIPSIS_RE) || []).length;
  const totalCount = dashCount + ellipsisCount;

  if (totalCount === 0) return { score: 0, matches: [] };

  const density = totalCount / sentences.length;
  // density of 1.0 = ~50 points, 2.0 = ~100 points
  const score = Math.min(100, Math.round(density * 50));

  const matches = [];
  if (dashCount > 0) {
    matches.push(`em dashes: ${dashCount} in ${sentences.length} sentences`);
  }
  if (ellipsisCount > 0) {
    matches.push(`ellipsis: ${ellipsisCount} in ${sentences.length} sentences`);
  }

  return { score, matches };
}

// --- Word frequency scorer ---

const SIGNAL_WORDS = [
  /\bleverag(e|ed|es|ing)\b/gi,
  /\bjourney(s)?\b/gi,
  /\bgame[-\s]?chang(e|er|ing)\b/gi,
  /\bmindset(s)?\b/gi,
  /\bsynerg(y|ies|istic)\b/gi,
  /\bunlock(s|ed|ing)?\b/gi,
  /\bscal(e|ed|es|ing|able)\b/gi,
  /\bdisrupt(s|ed|ing|ive|ion)?\b/gi,
  /\baction(s|able|ably)?\b/gi,
  /\bframework(s)?\b/gi,
  /\beco[-\s]?system(s)?\b/gi,
  /\bresonate[ds]?\b/gi,
  /\bimpactful\b/gi,
  /\btransformative\b/gi,
  /\bthought\s*leader(ship)?\b/gi,
  /\bdelv(e|ed|es|ing)\b/gi,
  /\btapestr(y|ies)\b/gi,
  /\brealm(s)?\b/gi,
  /\bbeacon(s)?\b/gi,
  /\bintricate(ly)?\b/gi,
  /\brobust(ly|ness)?\b/gi,
  /\bseamless(ly)?\b/gi,
  /\bpivotal(ly)?\b/gi,
  /\bfoster(s|ed|ing)?\b/gi,
  /\bharness(es|ed|ing)?\b/gi,
  /\bholistic(ally)?\b/gi,
  /\bvibrant(ly)?\b/gi,
  /\bembark(s|ed|ing)?\b/gi,
  /\bunprecedented\b/gi,
  /\bgroundbreaking\b/gi,
  /\btestament(s)?\b/gi,
  /\bnavigat(e|ed|es|ing)\b/gi,
  /\belevat(e|ed|es|ing)\b/gi,
  /\bempower(s|ed|ing|ment)?\b/gi,
  /\bcomprehensive(ly)?\b/gi,
  /\bcurat(e|ed|es|ing)\b/gi,
  /\bstreamlin(e|ed|es|ing)\b/gi,
  /\brevolutioniz(e|ed|es|ing)\b/gi,
  /\bcutting[-\s]?edge\b/gi,
  /\bspearhead(s|ed|ing)?\b/gi,
  /\blandscape(s)?\b/gi,
  /\bever[-\s]?evolving\b/gi,
];

const SIGNAL_WORD_LABELS = [
  "leverage", "journey", "game-changer", "mindset", "synergy",
  "unlock", "scale", "disrupt", "action/actionable", "framework",
  "ecosystem", "resonate", "impactful", "transformative", "thought leader",
  "delve", "tapestry", "realm", "beacon", "intricate",
  "robust", "seamless", "pivotal", "foster", "harness",
  "holistic", "vibrant", "embark", "unprecedented", "groundbreaking",
  "testament", "navigate", "elevate", "empower", "comprehensive",
  "curate", "streamline", "revolutionize", "cutting-edge", "spearhead",
  "landscape", "ever-evolving",
];

/**
 * Scores density of AI-typical signal words.
 * @param {string} text
 * @param {RegExp[]} [userWords] - Additional user-defined regex patterns
 * @param {Set<string>} [deletedBuiltinLabels] - Labels of built-in words to exclude
 * @returns {{ score: number, matches: string[] }}
 */
function wordFrequencyScorer(text, userWords, deletedBuiltinLabels) {
  let builtins = SIGNAL_WORDS;
  if (deletedBuiltinLabels && deletedBuiltinLabels.size > 0) {
    builtins = SIGNAL_WORDS.filter((_, i) => !deletedBuiltinLabels.has(SIGNAL_WORD_LABELS[i]));
  }
  const allPatterns = userWords ? [...builtins, ...userWords] : builtins;
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return { score: 0, matches: [] };

  const matches = [];
  let matchedWordCount = 0;

  for (const pattern of allPatterns) {
    pattern.lastIndex = 0;
    const found = text.match(pattern);
    if (found) {
      matchedWordCount += found.length;
      matches.push(...found.map((m) => m.toLowerCase()));
    }
  }

  if (matches.length === 0) return { score: 0, matches: [] };

  const density = matchedWordCount / words.length;
  // multiplier: density * 800, capped at 100
  const score = Math.min(100, Math.round(density * 800));
  // Deduplicate matches
  const unique = [...new Set(matches)];

  return { score, matches: unique };
}

// --- Co-occurrence pattern scorer ---

const COOCCURRENCE_PATTERNS = [
  {
    groups: [
      ["interesting", "fascinating", "intriguing"],
      ["here", "thing", "part", "where", "what"],
    ],
    label: "interesting thing",
  },
  {
    groups: [
      ["humbled", "thrilled", "excited", "honored"],
      ["share", "announce", "reveal"],
    ],
    label: "humbled to share",
  },
  {
    groups: [["not about"], ["it's about", "its about"]],
    label: "false dichotomy",
  },
  {
    groups: [
      ["if you're not", "if you are not"],
      ["you're", "you are"],
    ],
    label: "if you're not",
  },
  {
    groups: [
      ["nobody", "no one", "most people"],
      ["talking", "miss", "realize", "understand"],
    ],
    label: "nobody talks about",
  },
];

/**
 * Detects thought leader sentence templates via co-occurrence.
 * @param {string} text
 * @param {Array} [userPatterns] - Additional user-defined patterns
 * @param {Set<string>} [deletedBuiltinLabels] - Labels of built-in patterns to exclude
 * @returns {{ score: number, matches: string[] }}
 */
function cooccurrenceScorer(text, userPatterns, deletedBuiltinLabels) {
  let builtins = COOCCURRENCE_PATTERNS;
  if (deletedBuiltinLabels && deletedBuiltinLabels.size > 0) {
    builtins = COOCCURRENCE_PATTERNS.filter((p) => !deletedBuiltinLabels.has(p.label));
  }
  const allPatterns = userPatterns
    ? [...builtins, ...userPatterns]
    : builtins;
  const sentences = splitSentences(text);
  const matches = [];

  for (const pattern of allPatterns) {
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      const allGroupsMatch = pattern.groups.every((group) =>
        group.some((word) => lower.includes(word.toLowerCase()))
      );
      if (allGroupsMatch) {
        if (!matches.includes(pattern.label)) {
          matches.push(pattern.label);
        }
        break;
      }
    }
  }

  if (matches.length === 0) return { score: 0, matches: [] };

  // Each match adds 25 points, capped at 100
  const score = Math.min(100, matches.length * 25);
  return { score, matches };
}

// --- Promoted post detection ---

/**
 * Check whether a post is a promoted/sponsored post.
 * Looks for "Promoted" as a standalone word in the first ~200 characters
 * (the header area) to avoid false positives on posts that mention
 * "promoted" in their body text (e.g., "I got promoted").
 *
 * @param {string} text - The full post text content
 * @returns {boolean}
 */
function isPromotedPost(text) {
  const header = text.slice(0, 200);
  return /\bPromoted\b/.test(header);
}

// --- Main ---

/**
 * Analyze a post for AI-generated slop (synchronous — heuristic scorers only).
 *
 * @param {string} text - The post text content
 * @param {object} config - { threshold: number, userSignalWords?: RegExp[], userCooccurrencePatterns?: Array }
 * @returns {{ blocked: boolean, score: number, matches: string[] }}
 */
function analyzePost(text, config) {
  const threshold = config.threshold ?? 30;

  const allResults = [
    emDashScorer(text),
    wordFrequencyScorer(text, config.userSignalWords, config.deletedBuiltinWords),
    cooccurrenceScorer(text, config.userCooccurrencePatterns, config.deletedBuiltinCoocLabels),
  ];

  const maxScore = Math.max(...allResults.map((r) => r.score));
  const allMatches = allResults.flatMap((r) => r.matches);

  return {
    blocked: maxScore >= threshold,
    score: maxScore,
    matches: allMatches,
  };
}

/**
 * Two-pass analysis: sync heuristics first, then optional async semantic scoring.
 *
 * Pass 1: run heuristic scorers synchronously.
 * Pass 2: if config.semanticEnabled and config.getSemanticScore is provided,
 *          run the semantic scorer and merge results (max score wins).
 *
 * @param {string} text
 * @param {object} config - Same as analyzePost, plus:
 *   - semanticEnabled?: boolean
 *   - getSemanticScore?: (text: string) => Promise<{ score: number, matches: string[] }>
 * @returns {Promise<{ blocked: boolean, score: number, matches: string[] }>}
 */
async function analyzePostAsync(text, config) {
  const syncResult = analyzePost(text, config);

  if (!config.semanticEnabled || !config.getSemanticScore) {
    return syncResult;
  }

  const semanticResult = await config.getSemanticScore(text);
  const maxScore = Math.max(syncResult.score, semanticResult.score);
  const allMatches = [...syncResult.matches, ...semanticResult.matches];
  const threshold = config.threshold ?? 30;

  return {
    blocked: maxScore >= threshold,
    score: maxScore,
    matches: allMatches,
  };
}

// Module exports for testing (no-op in browser)
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    emDashScorer,
    wordFrequencyScorer,
    cooccurrenceScorer,
    analyzePost,
    analyzePostAsync,
    isPromotedPost,
    SIGNAL_WORDS,
    SIGNAL_WORD_LABELS,
    COOCCURRENCE_PATTERNS,
  };
}
