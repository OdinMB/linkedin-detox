# Fix Hash Collision Risk in Post Hashing

- **Date**: 2026-03-28
- **Status**: draft
- **Type**: bugfix

## Problem

`hashText` returns a 32-bit DJB2 integer (~4 billion values) as the sole key for `blockedSet` (Map) and `analyzedHashes` (Set). In long browsing sessions with thousands of posts, collisions can cause: (a) wrong posts receiving banners, (b) dismissed posts reappearing because a different post shares the same hash, or (c) `blockedSet` entries being silently overwritten.

## Approach

Append the text length as a discriminator to the hash string: `String(h) + ":" + text.length`. This eliminates nearly all practical collisions because two posts would need both the same DJB2 hash AND the same character count. The change is one line in one function, stays synchronous, and requires no changes to any consumer (they all treat the hash as an opaque string key).

**Alternatives considered:**
- *64-bit FNV-1a with BigInt* -- More mathematically robust, but BigInt arithmetic is slower in hot loops and adds implementation complexity for negligible practical benefit over the length-discriminated approach. Two LinkedIn posts colliding on both DJB2 and length is astronomically unlikely.
- *Web Crypto SHA-256* -- Most robust but async, which would require refactoring the synchronous `scanFeed` hot path. The complexity cost far exceeds the marginal safety gain.

## Changes

| File | Change |
|------|--------|
| `src/scanner.js` | Change `hashText` return from `String(h)` to `` `${h}:${text.length}` ``. Single line change. |
| `tests/scanner.test.js` | If tests exist for `hashText`, update expected values to include the length suffix. If no tests exist yet, add 2-3 basic assertions: determinism, different texts produce different hashes, and output format includes the colon separator. |

## Tests

- Existing detector tests (61) are unaffected -- they never call `hashText`.
- Add minimal `hashText` tests if none exist:
  - Same input returns same output (deterministic).
  - Two different short strings return different hashes.
  - Output matches `/-?\d+:\d+/` format (integer, colon, length).
- Manual verification: load extension, confirm posts are detected, banners appear, dismiss works, and dismissed posts stay dismissed after scrolling.

## Out of Scope

- Changing the hash algorithm itself (DJB2 is fine with the length discriminator).
- Adding collision detection or fallback logic.
- Changing how `blockedSet` or `analyzedHashes` store or evict entries.
- Performance optimization of the hash function.
