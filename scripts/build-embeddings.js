/**
 * Build Embeddings Script
 *
 * Generates src/phrase-embeddings.json by running the MiniLM model on
 * canonical AI-slop phrase types. Run once when phrases change:
 *
 *   node scripts/build-embeddings.js
 *
 * Requires: npm install @xenova/transformers (dev dependency)
 */

const CANONICAL_PHRASES = [
  // Humblebragging announcements
  { label: "humblebragging announcement", sentence: "I'm humbled to announce that I've been recognized as a top voice in leadership." },
  { label: "thrilled to share", sentence: "Thrilled to share that our startup just closed a record-breaking Series B round." },
  { label: "honored recognition", sentence: "Honored to be named among the 30 under 30 most innovative leaders this year." },
  { label: "grateful milestone", sentence: "So grateful for this incredible milestone in my professional journey." },

  // Dramatic reveals
  { label: "dramatic reveal", sentence: "Here's something nobody tells you about building a successful company." },
  { label: "controversial take", sentence: "I'm going to say something that might get me canceled, but it needs to be said." },
  { label: "hard truth", sentence: "The hard truth that most entrepreneurs refuse to accept about scaling." },
  { label: "unpopular opinion", sentence: "Unpopular opinion: the hustle culture is destroying an entire generation of leaders." },

  // False dichotomy wisdom
  { label: "false dichotomy wisdom", sentence: "It's not about the money. It's about the impact you create in the world." },
  { label: "reframing cliche", sentence: "Success isn't about working harder. It's about working smarter and with purpose." },
  { label: "not X but Y", sentence: "Leadership is not about having all the answers. It's about asking the right questions." },

  // Thought leader templates
  { label: "numbered list wisdom", sentence: "Five lessons I learned after ten years of building companies from scratch." },
  { label: "story time opener", sentence: "Let me tell you a story that completely changed how I think about leadership." },
  { label: "counterintuitive insight", sentence: "Let me share a counterintuitive insight that transformed my approach to business." },
  { label: "pattern interrupt", sentence: "Stop scrolling. This might be the most important thing you read today." },

  // Nobody talks about
  { label: "nobody talks about", sentence: "Nobody is talking about this massive shift happening in the tech industry right now." },
  { label: "most people miss", sentence: "Most people completely miss this obvious pattern that predicts startup success." },
  { label: "secret knowledge", sentence: "What they don't teach you in business school about real-world negotiations." },

  // Motivational fluff
  { label: "motivational fluff", sentence: "Every setback is a setup for an even greater comeback. Keep pushing forward." },
  { label: "generic inspiration", sentence: "Your potential is unlimited. The only ceiling is the one you put on yourself." },
  { label: "morning routine wisdom", sentence: "I wake up at 4 AM every day and it completely transformed my productivity." },
  { label: "failure celebration", sentence: "I failed spectacularly and here's why that was the best thing that ever happened to me." },

  // Engagement bait
  { label: "engagement bait question", sentence: "What's the one piece of advice you wish you'd received earlier in your career?" },
  { label: "agree or disagree", sentence: "Agree or disagree: remote work is the future and offices are becoming obsolete." },
  { label: "hot take poll", sentence: "Hot take: most meetings could be replaced by a simple email. Am I wrong?" },

  // Corporate jargon overload
  { label: "corporate jargon overload", sentence: "We need to leverage synergies across our ecosystem to unlock transformative growth." },
  { label: "buzzword salad", sentence: "Our holistic approach to scalable, cutting-edge innovation disrupts the entire landscape." },
  { label: "framework worship", sentence: "I developed a proprietary framework that revolutionized how we think about strategy." },

  // Fake vulnerability
  { label: "fake vulnerability", sentence: "I cried in the office bathroom today and it taught me everything about leadership." },
  { label: "carefully crafted struggle", sentence: "Last year I almost lost everything. Today I'm sharing what I learned from rock bottom." },
  { label: "imposter syndrome humble", sentence: "Even after twenty years, I still feel like an imposter. And that's okay." },

  // LinkedIn-specific formats
  { label: "line break poem", sentence: "Leadership.\nIs not a title.\nIt's a choice.\nEvery. Single. Day." },
  { label: "one sentence paragraphs", sentence: "I got fired.\n\nBest thing that ever happened.\n\nHere's why." },
  { label: "emoji-heavy post", sentence: "Big news! After years of hard work, we finally did it! So proud of this amazing team!" },

  // Networking virtue signaling
  { label: "networking virtue signal", sentence: "I always make time to help junior professionals because someone once helped me." },
  { label: "mentorship flex", sentence: "A mentee just got promoted to VP and it made me realize what truly matters." },
  { label: "giving back narrative", sentence: "The best investment I ever made was investing in people, not products." },

  // Tech thought leadership
  { label: "AI will change everything", sentence: "AI is going to fundamentally transform every industry within the next five years." },
  { label: "future of work", sentence: "The future of work is here and most companies are completely unprepared for it." },
  { label: "digital transformation", sentence: "Digital transformation isn't about technology. It's about reimagining your entire business." },

  // Recruiting/hiring posts
  { label: "we're hiring flex", sentence: "We're not just hiring. We're building a world-class team that will define the future." },
  { label: "culture flex", sentence: "Our culture isn't just about perks. It's about purpose, growth, and making an impact." },

  // Event/conference humblebrags
  { label: "speaking engagement flex", sentence: "Just stepped off stage at the global leadership summit. What an incredible experience." },
  { label: "conference takeaway", sentence: "Three mind-blowing takeaways from this year's innovation conference that changed my perspective." },

  // Pseudo-scientific claims
  { label: "pseudo-scientific leadership", sentence: "Science proves that the most successful leaders share these five neurological traits." },
  { label: "data-backed claim", sentence: "Research shows that companies with this one habit outperform competitors by 300 percent." },

  // Vague profundity
  { label: "vague profundity", sentence: "In the end, it all comes down to one simple truth that we keep forgetting." },
  { label: "zen business wisdom", sentence: "Sometimes the best strategy is to do nothing and let the market come to you." },
  { label: "paradox wisdom", sentence: "The more you try to control outcomes, the less control you actually have." },
];

async function main() {
  let pipeline;
  try {
    const { pipeline: createPipeline } = await import("@xenova/transformers");
    pipeline = await createPipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      quantized: true,
    });
  } catch (err) {
    console.error("Failed to load model. Install: npm install -D @xenova/transformers");
    console.error(err);
    process.exit(1);
  }

  console.log(`Embedding ${CANONICAL_PHRASES.length} phrases...`);

  const results = [];
  for (const phrase of CANONICAL_PHRASES) {
    const output = await pipeline(phrase.sentence, { pooling: "mean", normalize: true });
    results.push({
      label: phrase.label,
      embedding: Array.from(output.data),
    });
    process.stdout.write(".");
  }
  console.log("\nDone!");

  const { writeFileSync } = await import("fs");
  const { resolve, dirname } = await import("path");
  const { fileURLToPath } = await import("url");

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(__dirname, "..", "src", "phrase-embeddings.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Wrote ${results.length} embeddings to ${outPath}`);
}

main();
