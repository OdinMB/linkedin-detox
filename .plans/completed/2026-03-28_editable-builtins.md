# Editable Built-in Detection Lists

- **Date**: 2026-03-28
- **Status**: approved
- **Type**: feature

## Problem
Users can only add custom detection patterns — they can't edit or remove the built-in signal words, co-occurrence patterns, or semantic phrases. If a built-in causes false positives, the only workaround is lowering sensitivity globally.

## Approach
Track deleted built-in items by label in storage (`deletedBuiltinWords`, `deletedBuiltinCoocLabels`, `deletedBuiltinPhrases`). The detector and semantic bridge filter these out at runtime. "Restore defaults" clears the deleted sets without touching user-added items. Editing a built-in = delete original + add as user entry.

This avoids migrating existing data or changing the storage schema for user patterns. Built-in definitions stay in source code — only the "what's been removed" delta is persisted.

### Alternatives considered
- **Store full merged list in storage**: Requires one-time migration, `hasInitializedDefaults` flag, and breaks if we update built-ins in a new version. More complex for less benefit.
- **Replace built-in arrays entirely via config**: Over-engineers the interface — most users won't touch defaults at all.

## Changes

| File | Change |
|------|--------|
| `src/detector.js` | Add `SIGNAL_WORD_LABELS` array (parallel to `SIGNAL_WORDS`). Modify `wordFrequencyScorer` and `cooccurrenceScorer` to accept optional `deletedBuiltinLabels` Set param and filter built-ins. Export labels. |
| `src/content.js` | Load `deletedBuiltinWords` and `deletedBuiltinCoocLabels` from storage in `loadConfig()`. Convert to Sets and pass as `config.deletedBuiltinWords` / `config.deletedBuiltinCoocLabels`. Update `analyzePost` call to pass them through. |
| `src/semantic-bridge.js` | In `_loadPhraseBank()`, load `deletedBuiltinPhrases` from storage and filter out matching labels from the built-in bank before merging user phrases. |
| `src/options/options.js` | Load deleted sets from storage. Render built-in items with delete (×) buttons (reuse existing `.pattern-item` style). Add inline edit for signal words and co-occurrence (click to edit, save moves to user list + marks original deleted). Add "Restore defaults" button per section, visible only when deletions exist. Remove the separate `BUILTIN_SIGNAL_WORDS` / `BUILTIN_COOC_PATTERNS` / `BUILTIN_SEMANTIC_PHRASES` constants — import from detector.js globals (`SIGNAL_WORD_LABELS`, `COOCCURRENCE_PATTERNS`) and keep semantic phrases as-is. |
| `src/options/options.html` | Add restore button elements in each subsection. No structural changes needed — built-in sections already exist as collapsible divs. |
| `src/detector.test.js` | Add tests for deleted-builtin filtering in `wordFrequencyScorer` and `cooccurrenceScorer`. |

## Detail: Signal word labels

`SIGNAL_WORD_LABELS` will be a string array matching the existing `BUILTIN_SIGNAL_WORDS` display list, at the same indices as `SIGNAL_WORDS`:
```js
const SIGNAL_WORD_LABELS = [
  "leverage", "journey", "game-changer", "mindset", "synergy", ...
];
```

## Detail: Scorer filtering

```js
// wordFrequencyScorer(text, userWords, deletedBuiltinLabels)
function wordFrequencyScorer(text, userWords, deletedBuiltinLabels) {
  let builtins = SIGNAL_WORDS;
  if (deletedBuiltinLabels && deletedBuiltinLabels.size > 0) {
    builtins = SIGNAL_WORDS.filter((_, i) => !deletedBuiltinLabels.has(SIGNAL_WORD_LABELS[i]));
  }
  const allPatterns = userWords ? [...builtins, ...userWords] : builtins;
  // ... rest unchanged
}
```

Same pattern for `cooccurrenceScorer` — filter by `pattern.label`.

## Detail: analyzePost config passthrough

```js
// In analyzePost:
wordFrequencyScorer(text, config.userSignalWords, config.deletedBuiltinWords),
cooccurrenceScorer(text, config.userCooccurrencePatterns, config.deletedBuiltinCoocLabels),
```

## Detail: Options page UX

Built-in sections change from static grids to interactive lists:
- Each built-in item gets a × delete button and a pencil edit button
- Deleted items disappear from the list
- Edit pre-fills the "add new" inputs with the item's values and deletes the original from built-ins. User can tweak before saving. Reuses existing add flow.
- "Restore defaults" button appears below each section when any defaults are deleted. Clicking it clears the deleted set for that section
- Semantic phrases: delete only (editing requires re-embedding, covered by existing "add phrase" UX)

## Tests
- `wordFrequencyScorer` with `deletedBuiltinLabels` set — verify deleted words don't score
- `cooccurrenceScorer` with `deletedBuiltinLabels` set — verify deleted patterns don't match
- Both scorers with empty/undefined deleted sets — verify backward compatibility
- `SIGNAL_WORD_LABELS` length matches `SIGNAL_WORDS` length

## Out of Scope
- Editing semantic phrase sentences (requires re-embedding — use delete + add new instead)
- Reordering patterns
- Import/export of custom configurations
- Editing em dash / ellipsis scoring (no configurable list exists)
