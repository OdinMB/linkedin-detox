# Heuristic Scoring Engine

- **Date**: 2026-03-26
- **Status**: draft
- **Type**: feature

## Problem
The current phrase matcher requires exact substring matches, which almost never trigger on real LinkedIn posts. AI-generated content comes in many forms — we need signal-based detection that catches patterns, not specific strings.

## Approach
Replace the single `phraseScorer` with three signal-based scorers in `detector.js`. No exact phrase matching anywhere. Keep the existing `SCORERS` array architecture but switch from averaging to **max-of-all-scorers** — one strong signal is enough to flag a post.

Three scorers, each returning `{ score: 0-100, matches: string[] }`:

### 1. Em dash frequency scorer
Em dashes (`--`, `---`, `\u2014`) are one of AI's most overused punctuation marks. Count occurrences, score by density (em dashes per sentence). A post with 4 em dashes in 3 sentences is a strong signal. Also flag excessive ellipsis (`...`).

### 2. Word frequency scorer
Measures density of AI-typical words using regex patterns that capture morphological variants. Each entry is a regex that catches the word family:

```js
/\bleverag(e|ed|es|ing)\b/gi       // leverage, leveraged, leveraging
/\bjourney(s)?\b/gi                 // journey, journeys
/\bgame[-\s]?chang(e|er|ing)\b/gi  // game-changer, gamechanging, game changer
/\bmindset(s)?\b/gi
/\bsynerg(y|ies|istic)\b/gi
/\bunlock(s|ed|ing)?\b/gi
/\bscal(e|ed|es|ing|able)\b/gi
/\bdisrupt(s|ed|ing|ive|ion)?\b/gi
/\baction(s|able|ably)?\b/gi
/\bframework(s)?\b/gi
/\beco[-\s]?system(s)?\b/gi
/\bresonate[ds]?\b/gi
/\bimpactful\b/gi
/\btransformative\b/gi
/\bthought\s*leader(ship)?\b/gi
```

Score = `(matched_words / total_words) * multiplier`, capped at 100. Density-based so a long thoughtful post with one "journey" scores low, but 3 sentences stuffed with buzzwords scores high.

### 3. Co-occurrence pattern scorer
Detects thought leader sentence templates by checking if signal words from different groups appear in the same sentence:

```js
// "this is where it gets interesting" / "but here's the interesting thing"
{ groups: [["interesting", "fascinating", "intriguing"], ["here", "thing", "part", "where", "what"]], label: "interesting thing" }

// "I'm humbled/thrilled to share/announce"
{ groups: [["humbled", "thrilled", "excited", "honored"], ["share", "announce", "reveal"]], label: "humbled to share" }

// "it's not about X, it's about Y"
{ groups: [["not about"], ["it's about", "its about"]], label: "false dichotomy" }

// "if you're not X, you're Y"
{ groups: [["if you're not", "if you are not"], ["you're", "you are"]], label: "if you're not" }

// "nobody is talking about" / "what most people miss"
{ groups: [["nobody", "no one", "most people"], ["talking", "miss", "realize", "understand"]], label: "nobody talks about" }
```

A sentence matches when it contains at least one word from each group. Each match adds points, multiple matches compound.

### Scoring combination
`finalScore = max(allScores)`. The threshold slider in the popup still controls sensitivity.

### User-defined patterns in popup
Users can add their own patterns for scorers 2 and 3:
- **Signal words**: user types a word — a regex is auto-generated to capture its variants (e.g., typing "leverage" creates `/\bleverag(e|ed|es|ing)\b/gi`). For common suffixes we auto-expand; for unusual words the user can type their own regex.
- **Co-occurrence patterns**: two text inputs for "Group A words" and "Group B words" (comma-separated). Stored in `chrome.storage.sync`.

Built-in patterns are shown read-only so users can see what's already covered.

## Changes

| File | Change |
|------|--------|
| `src/detector.js` | Remove `phraseScorer` and `DEFAULT_PHRASES`. Add three scorers: `emDashScorer`, `wordFrequencyScorer`, `cooccurrenceScorer`. Add all to `SCORERS`. Change `analyzePost` from averaging to max-score. Accept user-defined words and co-occurrence patterns from config. |
| `src/content.js` | No changes — it already calls `analyzePost(text, config)` and uses the result. |
| `src/popup/popup.html` | Replace "Blocked Phrases" with "Custom Patterns" section containing: "Signal words" input and "Word pattern" (group A / group B) inputs. Add read-only collapsible list of built-in patterns. Remove old phrase list UI. |
| `src/popup/popup.js` | Wire up new UI. Store user patterns as `{ type: "word", value: "..." }` or `{ type: "cooccurrence", groups: [["..."], ["..."]] }` in `chrome.storage.sync`. Remove `POPUP_DEFAULT_PHRASES`. |
| `CLAUDE.md` | Update Architecture section to describe the three scorers and max-score combination. |

## Tests
Manual with test mode disabled:
- Browse LinkedIn feed — posts should get flagged
- Check roast banners show match descriptions (e.g., "em dashes: 4 in 3 sentences", "words: leverage, synergy (density: 8%)", "pattern: interesting + here's")
- Adjust threshold slider — at 80+ almost nothing blocked, at 20 most AI-looking posts caught
- Add a custom signal word in popup — confirm it triggers
- Add a custom co-occurrence pattern — confirm it triggers

## Out of Scope
- ML model / transformers.js (see semantic-scoring plan)
- External API calls
- Exact phrase matching (not needed — word frequency and co-occurrence cover this)
- Per-scorer weight configuration in the UI
