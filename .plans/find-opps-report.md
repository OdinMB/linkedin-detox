# New Capabilities Identified — LinkedIn Detox

**Date:** 2026-03-29
**Scope:** Feature opportunities, integrations, DX, extension points
**Lenses:** Underserved use cases, missing extension points, integration opportunities, developer experience, emerging patterns, capability gaps

---

## Previously Identified (Still Open)

These items from the 2026-03-28 report remain valid and unimplemented:

- **Export / Import Configuration** (small) — backup/share custom patterns as JSON
- **Comment Detection** (medium) — extend slop detection to LinkedIn comments
- **Session Statistics Dashboard** (medium) — per-pattern hit counts, scan/block ratio
- **Firefox / Cross-Browser Port** (large) — `manifest.firefox.json` + offscreen shim
- **Keyboard Shortcuts** (small) — Escape to dismiss, `chrome.commands` for toggle

---

## New Capabilities Identified

### 1. Structural Analysis Scorer — Broetry & Uniformity Detection

- **What**: Add a new `structureScorer` that detects AI writing *structure* rather than vocabulary. Three signals: (a) **broetry** — single-sentence paragraphs separated by blank lines (the "one line per paragraph" LinkedIn format), scored by ratio of single-line paragraphs to total; (b) **sentence length uniformity** — AI text has unnaturally consistent sentence lengths (low burstiness), measured as 1 minus the coefficient of variation of sentence lengths; (c) **contraction avoidance** — AI writes "do not" / "I am" / "it is" where humans contract, measured as ratio of expandable phrases to opportunities.
- **Where**: New file `src/structure-scorer.js` following the existing scorer contract `{ score: 0-100, matches: string[] }`. Wire into `detector.js` `analyzePost` alongside the three existing scorers. Add to manifest content script list.
- **Why**: All three competing extensions (LAID, LinkedIn AI Post Detector, LinkedLens) detect structural signals that LinkedIn Detox currently misses. Research in *Science Advances* and *Nature Human Behaviour* identifies burstiness and contraction rate as the highest-signal AI indicators — stronger than vocabulary. These signals catch posts that use no buzzwords but still "feel" AI-generated. 53.7% of long LinkedIn posts are now AI-generated (Originality.ai 2025 study); vocabulary-only detection misses the ones that avoid clichés.
- **Effort**: medium
- **Lens**: capability gap / emerging pattern

---

### 2. Chrome Built-in AI (Gemini Nano) Integration

- **What**: Replace or supplement the MiniLM semantic scorer with Chrome's Prompt API, which runs Gemini Nano locally in the browser with zero API cost and no network requests. Send a classification prompt like "Is this LinkedIn post AI-generated? Reply YES or NO with a confidence 0-100" to `chrome.aiOriginTrial.languageModel.create()`. Use as a third scoring pass: heuristics → MiniLM semantic → Gemini Nano (only for borderline posts that scored 15-threshold).
- **Where**: New file `src/gemini-scorer.js`. Integrate into `scanner.js` as an optional third pass (config toggle `geminiEnabled`). Add to popup as "AI Deep Scan (experimental)" toggle. Chrome 138+ required — feature-detect with `self.ai?.languageModel`.
- **Why**: The Prompt API is now stable for extensions in Chrome 138 (March 2026). It provides dramatically better detection than cosine similarity — it understands *context*, not just phrase matching. The 22GB disk space requirement noted in the previous report has been relaxed; Chrome now manages model downloads transparently. LAID already offers optional LLM analysis (via cloud APIs); this achieves the same quality with zero cost and full privacy. The three-pass architecture (heuristics → embedding → LLM) means the expensive model only runs on the ~5% of posts that are genuinely ambiguous.
- **Effort**: medium
- **Lens**: emerging pattern / integration opportunity

---

### 3. Inline Score Badge (Non-Blocking Indicator)

- **What**: Add an optional small color-coded badge (green/amber/red) to every post showing its slop score, without blocking or hiding the post. Badge appears as a floating pill in the post's top-right corner showing the numeric score. This runs independently of the roast/hide mode — users can see scores on posts that fall below the blocking threshold. Toggle in popup: "Show score badges".
- **Where**: `src/renderer.js` (new `renderBadge(postEl, score, matches)` function), `src/content.css` (badge styles — small pill with `position: absolute`, color based on score ranges), `src/scanner.js` (call `renderBadge` for all analyzed posts, not just blocked ones), `src/shared/config.js` (add `showBadges: false` to DEFAULT_CONFIG).
- **Why**: Every competing extension shows per-post score indicators. Currently LinkedIn Detox is binary: a post is either blocked or invisible to the user. Users have no way to calibrate their sensitivity setting because they can't see scores on unblocked posts. Badges solve this: "I see this post scored 18 but my threshold is 25 — maybe I should lower it." This also makes the extension useful in a "monitor but don't block" mode for users who want awareness without censorship.
- **Effort**: small
- **Lens**: capability gap / underserved use case

---

### 4. Language Detection — Skip Non-English Posts

- **What**: Use Chrome 138's Language Detector API (`chrome.ai.languageDetector`) to detect the language of each post before scoring. Skip detection entirely for non-English posts (or posts below a confidence threshold for English). Add an "English only" toggle (default on) and an optional "Languages to scan" multi-select for users who want to detect AI slop in other languages.
- **Where**: `src/scanner.js` (add language check before `analyzePostAsync` call), `src/shared/config.js` (add `skipNonEnglish: true` to DEFAULT_CONFIG). Feature-detect the API with `self.translation?.canDetect?.()`.
- **Why**: All heuristic scorers are English-only — signal words, co-occurrence patterns, and even em dash conventions are English-centric. Non-English posts produce false positives (e.g., German compound words triggering word frequency, French em dash conventions). LinkedIn is a global platform; users with multilingual feeds report high false-positive rates. The Language Detector API is stable in Chrome 138, runs locally, and returns results in <1ms.
- **Effort**: small
- **Lens**: capability gap / integration opportunity

---

### 5. Engagement Bait Closer Detection

- **What**: Add a new lightweight scorer (or extend `cooccurrenceScorer`) that specifically targets engagement-bait closers — the formulaic question or call-to-action that AI-generated posts append to drive comments. Patterns: "Agree?", "Thoughts?", "What do you think?", "Repost if you agree", "Share if this resonated", "Drop a 🔥 if...", "Comment below", "Tag someone who...". Score based on: (a) presence of a bait closer in the last 2 sentences, (b) combined with any other positive signal (bait closer alone = low score, bait closer + buzzwords = high score).
- **Where**: Extend `src/detector.js` — add `engagementBaitScorer` as a fourth heuristic scorer, or add bait patterns to `cooccurrenceScorer` with a new "engagement_bait" group. Add the pattern list to `src/shared/config.js` as a built-in list (editable via options page, following the existing editable-builtins pattern).
- **Why**: Engagement bait closers are the single most-complained-about LinkedIn AI pattern in 2025-2026 discussions. They're structurally distinct from the existing detectors: they appear at the *end* of posts (existing scorers weight all sentences equally), and they're a co-signal that dramatically increases confidence when combined with other triggers. The LAID extension already detects "engagement prompts" as one of its 14 signals.
- **Effort**: small
- **Lens**: underserved use case / capability gap

---

### 6. Blocked Post History Log

- **What**: Maintain a rolling log of the last 100 blocked posts in `chrome.storage.local`, storing: timestamp, author name, first 80 characters of text, final score, which scorers triggered, and whether the post was dismissed. Surface this in a new "History" tab on the options page as a searchable/filterable table. Include "Unblock" action (adds author to whitelist) and "This was wrong" action (stores as false positive for future calibration).
- **Where**: `src/scanner.js` (append to history log on block), `src/shared/config.js` (add history-related defaults), `src/options/options.html` + `src/options/options.js` (new "History" tab with table UI). Store in `chrome.storage.local` (not sync — too large for sync quota).
- **Why**: Users currently have zero visibility into what was blocked and why, beyond the live banner. If a user suspects the extension is hiding posts from someone they follow, they have no way to check. The history log also enables false-positive reporting — a foundation for future crowd-sourced calibration. This addresses the most common user complaint about content-blocking extensions: "what did you hide from me?"
- **Effort**: medium
- **Lens**: underserved use case / DX

---

## Suggested Follow-Up Work

Items where value is clear but approach needs investigation:

- **Chrome Summarizer API for roast generation**: Use Gemini Nano's Summarizer API to generate contextual roasts based on actual post content instead of random selection from a static bank. Would make roasts specific and funnier ("This post about 'disrupting the synergy ecosystem' was definitely written by someone who lets ChatGPT handle their personality too"). Blocked on: Writer API still in developer trial, unclear latency.

- **Crowd-sourced pattern packs**: With export/import config (item from previous report), users could share detection pattern sets. A GitHub repo of community-maintained pattern packs (e.g., "tech-bro detector", "recruiter spam filter", "hustle porn blocker") would extend value. Blocked on: export/import not yet built.

- **Side panel UI**: Chrome's Side Panel API could show a real-time detection dashboard alongside the LinkedIn feed — scores, pattern matches, and history visible without opening popup/options. More discoverable than the popup. Blocked on: significant UI effort.

---

## Already Tracked (Excluded)

- Export/Import config (previous opps report — still open)
- Comment detection (previous opps report — still open)
- Session statistics dashboard (previous opps report — still open)
- Firefox port (previous opps report — still open)
- Keyboard shortcuts (previous opps report — still open)
- Trust Author settings-only flow (backlog.md)
- Score calibration tool / "Test Lab" (previous report follow-up)
- Chrome Prompt API (previously noted as follow-up, now promoted to main item #2 due to API reaching stable)

---

## Sources

- [LAID - LinkedIn AI Detector (GitHub)](https://github.com/oldeucryptoboi/linkedin-ai-detector) — 14 weighted heuristic signals, optional LLM analysis
- [LinkedIn AI Post Detector (Chrome Web Store)](https://chromewebstore.google.com/detail/linkedin-ai-post-detector/ohmjkdfngejbaliilcdifkgllkdelacp) — inline score badges, pattern diversity tracking
- [Chrome Built-in AI APIs (stable Chrome 138)](https://developer.chrome.com/docs/ai/built-in-apis)
- [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api) — Gemini Nano for extensions
- [Chrome Language Detector API](https://developer.chrome.com/docs/ai/language-detection)
- [Originality.AI LinkedIn Study](https://originality.ai/blog/linkedin-ai-study-engagement) — 53.7% of long posts AI-generated
- [AI Comments on LinkedIn (annabyang.com)](https://blog.annabyang.com/ai-comments-on-linkedin/)
- [LinkedIn Algorithm 2026 (usevisuals.com)](https://usevisuals.com/blog/linkedin-algorithm-updates-for-2026)

---

```
New capabilities identified: 6
Previously open (carried forward): 5
Lenses covered: capability gap, emerging pattern, underserved use case, integration opportunity, DX
```
