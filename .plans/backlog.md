# Backlog

Unified backlog for LinkedIn Detox. Last updated: 2026-03-29.

---

## Features

### Inline Score Badge
Show a small color-coded badge (green/amber/red) on every post with its slop score, independent of roast/hide mode. Lets users calibrate sensitivity and use a "monitor but don't block" mode. Every competing extension has this.
- **Where**: `src/renderer.js`, `src/content.css`, `src/scanner.js`, `src/shared/config.js`
- **Effort**: small

### Engagement Bait Closer Detection
Detect formulaic closers ("Agree?", "Thoughts?", "Repost if...", "Tag someone who...") in the last 2 sentences. Low score alone, high score when combined with other signals. Add as a fourth heuristic scorer or extend cooccurrenceScorer.
- **Where**: `src/detector.js`, `src/shared/config.js`
- **Effort**: small

### Language Detection — Skip Non-English Posts
Use Chrome 138 Language Detector API to skip non-English posts before scoring. All heuristic scorers are English-centric and produce false positives on other languages. Feature-detect with `self.translation?.canDetect?.()`.
- **Where**: `src/scanner.js`, `src/shared/config.js`
- **Effort**: small

### Export / Import Configuration
Export all settings + custom patterns to JSON file, import with validation. Enables backup, sharing, and cross-machine transfer. Foundation for community pattern packs.
- **Where**: `src/options/options.html`, `src/options/options.js`
- **Effort**: small

### Keyboard Shortcuts
Escape to dismiss topmost banner, Shift+Escape to dismiss all, `chrome.commands` for toggle on/off. Quick win for power users and accessibility.
- **Where**: `manifest.json`, `src/content.js`, `src/background.js`
- **Effort**: small

### Comment Detection
Extend slop detection to LinkedIn comments ("Great insight! This resonates deeply..."). Detection engine already works on any text — only needs DOM targeting and a smaller banner format. Add `detectComments` toggle.
- **Where**: `src/scanner.js`, `src/renderer.js`, `src/content.css`, `src/popup/popup.html`
- **Effort**: medium

### Session Statistics Dashboard
Replace single blocked count with richer stats: posts scanned, blocked (slop vs promoted), top triggered patterns, average score. Show in popup (collapsible) and optionally options page.
- **Where**: `src/scanner.js`, `src/popup/popup.html`, `src/popup/popup.js`, `src/options/`
- **Effort**: medium

### Blocked Post History Log
Rolling log of last 100 blocked posts in `chrome.storage.local` (timestamp, author, text snippet, score, triggers). New "History" tab on options page with search/filter, "Unblock" and "This was wrong" actions.
- **Where**: `src/scanner.js`, `src/shared/config.js`, `src/options/`
- **Effort**: medium

### Firefox / Cross-Browser Port
Create `manifest.firefox.json`, conditional in `background.js` to skip offscreen (Firefox supports WASM in service workers natively), `build:firefox` script. Codebase is 90% portable.
- **Where**: `manifest.firefox.json`, `src/background.js`, `scripts/build-zip.js`, `package.json`
- **Effort**: large

---

## Quality — Important (completed 2026-03-29)

All 3 important quality items were implemented. See git history for details.

---

## Dismissed

Items considered and explicitly passed on:

- **Structural Analysis Scorer (broetry, burstiness, contraction avoidance)** — interesting research signals but high false-positive risk on legitimate short-form LinkedIn writing. Not worth the calibration effort for a satire extension.
- **Chrome Gemini Nano / Prompt API integration** — promising but requires 22GB+ disk space for model, Chrome 138+, and introduces hard dependency on Chrome's AI availability. MiniLM semantic scorer is good enough for the comedy use case.
- **Trust Author: settings-page-only flow** — the banner checkmark button works fine after the author-in-header change; removing it reduces discoverability for no clear gain.

---

## Completed (2026-03-29)

Quality batch — 9 moderate + 7 nice-to-have items:

- `dismissedPosts` WeakSet → hash-based `Set` (survives DOM virtualization)
- `web_accessible_resources` narrowed from `src/lib/*` to specific file
- `options.js` innerHTML → DOM construction APIs (eliminates XSS surface)
- Signal word input `maxlength="80"`
- Co-occurrence input validation (red borders, duplicate label check)
- `chrome.runtime.lastError` check in config load and pattern save
- Retry scan delays extracted to `RETRY_SCAN_DELAYS_MS` constant
- `globalPostIndex` → per-scan counter (test mode works on long sessions)
- Stale selector sentinel warning
- ESLint config (`.eslintrc.json`)
- Vitest coverage config + `test:coverage` script
- Scoring magic numbers → named constants (`EM_DASH_SCORE_MULTIPLIER`, `COSINE_LOW_THRESHOLD`, etc.)
- Shuffle-draw for roasts and banner images (no consecutive repeats)
- Offscreen model load failure surfaced to popup
- `build-zip.js` rewritten as pure Node.js (no PowerShell/shell dependency)
- Focus-visible styles on toggle switches
