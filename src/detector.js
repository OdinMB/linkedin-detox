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

function splitSentences(text) {
  return text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
}

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

/**
 * Scores density of AI-typical signal words.
 * @param {string} text
 * @param {RegExp[]} [userWords] - Additional user-defined regex patterns
 * @returns {{ score: number, matches: string[] }}
 */
function wordFrequencyScorer(text, userWords) {
  const allPatterns = userWords ? [...SIGNAL_WORDS, ...userWords] : SIGNAL_WORDS;
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
 * @returns {{ score: number, matches: string[] }}
 */
function cooccurrenceScorer(text, userPatterns) {
  const allPatterns = userPatterns
    ? [...COOCCURRENCE_PATTERNS, ...userPatterns]
    : COOCCURRENCE_PATTERNS;
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

// --- Main ---

/**
 * Analyze a post for AI-generated slop.
 *
 * @param {string} text - The post text content
 * @param {object} config - { threshold: number, userSignalWords?: RegExp[], userCooccurrencePatterns?: Array }
 * @returns {{ blocked: boolean, score: number, matches: string[] }}
 */
function analyzePost(text, config) {
  const threshold = config.threshold ?? 30;

  const allResults = [
    emDashScorer(text),
    wordFrequencyScorer(text, config.userSignalWords),
    cooccurrenceScorer(text, config.userCooccurrencePatterns),
  ];

  const maxScore = Math.max(...allResults.map((r) => r.score));
  const allMatches = allResults.flatMap((r) => r.matches);

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
    SIGNAL_WORDS,
    COOCCURRENCE_PATTERNS,
  };
}
