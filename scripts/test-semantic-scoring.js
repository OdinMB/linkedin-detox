/**
 * Integration test: run real LinkedIn post text through the semantic scorer.
 *
 * Usage: node scripts/test-semantic-scoring.js
 *
 * Tests against the three sensitivity thresholds:
 *   chill (50), suspicious (25), unhinged (1)
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load phrase bank
const phraseBankPath = resolve(__dirname, "..", "src", "phrase-embeddings.json");
const phraseBank = JSON.parse(readFileSync(phraseBankPath, "utf-8")).filter(
  (p) => p.embedding && p.embedding.length > 0
);
console.log(`Loaded ${phraseBank.length} phrase embeddings\n`);

// Import scoring functions
import { pathToFileURL } from "url";
const { cosineSimilarity, scoreFromSimilarity, computeSemanticScore } = await import(
  pathToFileURL(resolve(__dirname, "..", "src", "semantic-scorer.js")).href
);

// Load model
let pipeline;
try {
  const { pipeline: createPipeline } = await import("@xenova/transformers");
  pipeline = await createPipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
    quantized: true,
  });
} catch (err) {
  console.error("Failed to load model:", err.message);
  process.exit(1);
}

// --- Test posts ---

const SLOP_POSTS = [
  {
    label: "Classic humblebragging",
    text: "I'm truly humbled and honored to announce that I've been recognized as one of the top 50 innovators in our industry. This journey has been incredible.",
  },
  {
    label: "Dramatic reveal / nobody talks about",
    text: "Here's what nobody tells you about building a startup. The real secret isn't hustle — it's knowing when to stop.",
  },
  {
    label: "False dichotomy wisdom",
    text: "It's not about working harder. It's about working smarter. The most successful people I know understood this early.",
  },
  {
    label: "Motivational fluff",
    text: "Every setback is just a setup for your greatest comeback. Don't give up. Your potential is limitless.",
  },
  {
    label: "Engagement bait",
    text: "What's the one piece of career advice you wish someone told you ten years ago? Drop it below.",
  },
  {
    label: "Novel phrasing (no signal words)",
    text: "Let me share a counterintuitive insight that changed how I think about growing a business from scratch.",
  },
  {
    label: "Corporate jargon reworded",
    text: "We built an integrated approach that combines multiple disciplines to drive outcomes across our entire organization.",
  },
  {
    label: "Fake vulnerability",
    text: "I broke down crying in my car after a board meeting last year. That moment taught me everything about what real leadership means.",
  },
  {
    label: "Line break poem style",
    text: "Success.\nIs not a destination.\nIt's a mindset.\nEvery. Single. Day.\nRemember that.",
  },
  {
    label: "AI will change everything",
    text: "Artificial intelligence is going to reshape every single industry within the next decade. Most companies are not ready.",
  },
];

const CLEAN_POSTS = [
  {
    label: "Normal job update",
    text: "Started a new role at Acme Corp last week. The team has been welcoming and I'm looking forward to contributing to the data pipeline work.",
  },
  {
    label: "Technical discussion",
    text: "We migrated our database from PostgreSQL to CockroachDB last quarter. The multi-region latency improvements have been significant for our APAC users.",
  },
  {
    label: "Event mention",
    text: "Had a good time at the React conf yesterday. The talk on server components was particularly interesting from an architecture perspective.",
  },
  {
    label: "Hiring post (straightforward)",
    text: "My team is hiring a senior backend engineer. We work on payment processing systems. Reach out if interested.",
  },
  {
    label: "Personal news",
    text: "Taking a few weeks off to recharge after a long project. Planning to catch up on reading and spend time with family.",
  },
];

const THRESHOLDS = { chill: 50, suspicious: 25, unhinged: 1 };

// --- Run tests ---

async function embedText(text) {
  const sentences = text.split(/[.!?\n]+/).filter((s) => s.trim().length > 10);
  if (sentences.length === 0) return [];
  const output = await pipeline(sentences, { pooling: "mean", normalize: true });
  return output.tolist();
}

async function testPost(post) {
  const embeddings = await embedText(post.text);
  if (embeddings.length === 0) return { score: 0, matches: [] };
  return computeSemanticScore(embeddings, phraseBank);
}

console.log("=== SLOP POSTS (should be caught) ===\n");
for (const post of SLOP_POSTS) {
  const result = await testPost(post);
  const blocked = {};
  for (const [level, thresh] of Object.entries(THRESHOLDS)) {
    blocked[level] = result.score >= thresh ? "BLOCKED" : "missed";
  }
  console.log(`[${post.label}]`);
  console.log(`  Score: ${result.score}`);
  console.log(`  Chill: ${blocked.chill} | Suspicious: ${blocked.suspicious} | Unhinged: ${blocked.unhinged}`);
  if (result.matches.length > 0) {
    console.log(`  Top match: ${result.matches[0]}`);
  }
  console.log();
}

console.log("=== CLEAN POSTS (should NOT be caught) ===\n");
for (const post of CLEAN_POSTS) {
  const result = await testPost(post);
  const blocked = {};
  for (const [level, thresh] of Object.entries(THRESHOLDS)) {
    blocked[level] = result.score >= thresh ? "FALSE POS" : "ok";
  }
  console.log(`[${post.label}]`);
  console.log(`  Score: ${result.score}`);
  console.log(`  Chill: ${blocked.chill} | Suspicious: ${blocked.suspicious} | Unhinged: ${blocked.unhinged}`);
  if (result.matches.length > 0) {
    console.log(`  Top match: ${result.matches[0]}`);
  }
  console.log();
}
