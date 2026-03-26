# Semantic Scoring — Local Embedding Model

- **Date**: 2026-03-26
- **Status**: draft
- **Type**: feature
- **Depends on**: heuristic-scoring

## Problem
The heuristic scorers (em dash, word frequency, co-occurrence) catch posts that use known signal words and sentence templates. But AI can produce the same type of thought leader phrase using words the heuristics have never seen. "Let me share a counterintuitive insight" means the same as "here's something nobody expects" but shares zero signal words. A small embedding model can detect phrase *types* regardless of exact wording.

## Approach
Add an optional **semantic scorer** that uses `transformers.js` with a quantized sentence embedding model to compare each sentence against a bank of canonical AI-slop phrase types via cosine similarity. Plugs into the existing `SCORERS` array as a fourth scorer.

**Disabled by default.** Users opt in via a toggle in the popup. This is important because:
- First activation downloads ~5MB of model weights (ONNX + WASM runtime)
- Adds 1-2s latency to first page scan while the model loads
- On older hardware, ongoing scoring adds noticeable delay per post
- The heuristic scorers should already catch 80%+ of slop — this is the "completionist" option

### Model choice
`Xenova/all-MiniLM-L6-v2` (quantized int8) via `@xenova/transformers`:
- ~5MB download, cached in IndexedDB after first load
- 384-dimensional embeddings, fast cosine similarity
- Runs in Web Worker to avoid blocking the main thread

### How it works
1. **Build time**: precompute embeddings for ~50 canonical phrase types and ship as a JSON file (~75KB). These represent the *categories* of AI slop — "humblebragging announcement", "false dichotomy wisdom", "dramatic reveal", etc.
2. **User-defined phrases**: when a user adds custom signal words or co-occurrence patterns in the popup (from the heuristic plan), representative example sentences are generated and embedded on-device via the worker. Cached in `chrome.storage.local`, computed once per pattern (~100ms each).
3. **Runtime**: split post into sentences, embed each, compute max cosine similarity against the combined phrase bank (built-in + user-derived).
4. **Scoring**: similarity > 0.75 = strong match (score 80+), > 0.60 = moderate (score 50+). Match description shows the closest canonical phrase type and similarity.

### Web Worker architecture
Model runs in a dedicated Web Worker (`src/semantic-worker.js`):
- Content script sends sentences via `postMessage`
- Worker loads model on first message (lazy init), returns embeddings
- Content script computes cosine similarity

### Async handling
Heuristic scorers are synchronous, semantic scorer is async. Use a **two-pass** approach:
- Pass 1: run heuristic scorers synchronously, block/roast immediately if threshold met
- Pass 2: run semantic scorer async, if it finds something the heuristics missed, update the post retroactively

This keeps the UI snappy — no delay for the common case.

## Changes

| File | Change |
|------|--------|
| `src/semantic-worker.js` | **New.** Web Worker: loads transformers.js + MiniLM model. `embed(sentences)` via postMessage. Lazy init. |
| `src/semantic-scorer.js` | **New.** Scorer function: sends sentences to worker, computes cosine similarity against phrase bank, returns `{ score, matches }`. |
| `src/phrase-embeddings.json` | **New.** Precomputed embeddings for ~50 canonical phrase types. |
| `src/detector.js` | Conditionally add `semanticScorer` to `SCORERS` when `config.semanticEnabled`. Handle async two-pass flow. |
| `src/content.js` | Pass `semanticEnabled` config flag. After sync scoring, kick off async semantic pass and update post if needed. |
| `src/popup/popup.html` | Add "AI Detection (beta)" toggle with description: "Uses a small AI model for deeper detection. Downloads ~5MB on first use. May be slower on older devices." Loading indicator when embedding user patterns. |
| `src/popup/popup.js` | Wire up `semanticEnabled` toggle. When user adds a custom pattern and semantic scoring is enabled, derive representative sentences, send to worker for embedding, cache in `chrome.storage.local`. |
| `manifest.json` | Add `web_accessible_resources` for worker file. |
| `scripts/build-embeddings.js` | **New.** Node script: runs MiniLM on canonical phrase list, outputs `phrase-embeddings.json`. Run once when phrases change. |
| `CLAUDE.md` | Document semantic scorer, worker architecture, how to rebuild embeddings. |

## Tests
Manual:
- Toggle semantic scoring on — confirm model downloads (DevTools network tab)
- Browse feed — posts flagged even with novel phrasing
- Banners show: "Similar to: 'dramatic reveal' (similarity: 0.82)"
- Toggle off — extension works normally, no model loaded
- Add custom co-occurrence pattern — confirm representative sentences get embedded
- Test on older hardware — feed doesn't freeze (worker keeps model off main thread)

## Out of Scope
- Fine-tuning or retraining the model
- Server-side model or API calls
- Automatic model updates
