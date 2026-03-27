---
name: linkedin-detox-style
description: >
  Visual identity and style guide for LinkedIn Detox. Consult this skill BEFORE
  creating any visual or communication assets — images, UI designs, social media
  content, presentations, banners, icons, or marketing materials for this project.
type: user-invocable
---

# LinkedIn Detox — Style Kit

## Overview

LinkedIn Detox is a satirical Chrome extension that detects AI-generated "slop" on LinkedIn
and replaces it with snarky roast banners. The visual identity is **Hazmat Lab** — dark
industrial containment aesthetics that treat AI-generated posts as toxic waste requiring
official quarantine. The humor is deadpan and bureaucratic, never mean-spirited.

**Audience:** Tech-savvy LinkedIn users who are irony-literate and tired of AI-generated
content flooding their feed.

**Where assets appear:** Chrome extension popup, options page, overlay banners on LinkedIn
posts, Chrome Web Store listing, README screenshots, social media promotion.

---

## Dual-Mode Color System

The extension operates on LinkedIn, which has both light and dark modes. All colors are
defined in two matched palettes that share a common caution yellow.

### Shared Colors (both modes)

| Role | Hex | Name |
|------|-----|------|
| Caution / Warning | `#f5c518` | Caution Yellow |
| Caution Dark | `#d4a017` | Hazard Gold |
| Danger | varies by mode | see below |

### Dark Mode (Radioactive)

For LinkedIn dark mode. Toxic green as the primary radiation signal.

| Role | Hex | Name |
|------|-----|------|
| Background Primary | `#0d0d0d` | Void Black |
| Background Surface | `#1a1a1a` | Chamber Dark |
| Background Elevated | `#252525` | Surface |
| Signal Primary | `#39ff14` | Toxic Green |
| Signal Dim | `#1a8a0a` | Dim Isotope |
| Danger Primary | `#ff3333` | Meltdown Red |
| Danger Dark | `#cc0000` | Core Breach |
| Text Primary | `#e0e0e0` | Primary Text |
| Text Secondary | `#9e9e9e` | Secondary |
| Text Muted | `#666666` | Muted |

**Usage:**
- Toxic Green (`#39ff14`) for header titles, meta readouts, active indicators
- Caution Yellow (`#f5c518`) for warning stripes and caution tape patterns
- Meltdown Red (`#ff3333`) for danger states, critical severity, close-button hover

### Light Mode (Quarantine Notice)

For LinkedIn's default light mode. Gold/amber accents on white/cream.

| Role | Hex | Name |
|------|-----|------|
| Background Primary | `#ffffff` | Clean White |
| Background Surface | `#fafafa` | Lab Surface |
| Background Warm | `#f5f3ee` | Notice Paper |
| Header Surface | `#f0ece1` | Form Header |
| Accent Primary | `#7a6210` | Dark Gold |
| Accent Secondary | `#9a7b10` | Stamp Gold |
| Danger Primary | `#c0392b` | Alert Red |
| Danger Dark | `#922b21` | Critical |
| Text Primary | `#1a1a1a` | Print Black |
| Text Secondary | `#555555` | Body |
| Text Muted | `#888888` | Fine Print |

**Usage:**
- Dark Gold (`#7a6210`) for header titles, icon accents
- Caution Yellow (`#f5c518`) for warning stripes (same as dark mode)
- Alert Red (`#c0392b`) for danger states

### Caution Tape Pattern

Both modes use the same diagonal stripe pattern for top/bottom banner borders:

```
repeating-linear-gradient(
  -45deg,
  #f5c518 0px, #f5c518 8px,
  <background-black> 8px, <background-black> 16px
)
```

Where `<background-black>` is `#1a1a1a` (dark) or `#1a1a1a` (light — black stripes on
both modes for maximum contrast with the yellow).

---

## Typography

System fonts only — no external font loading. Same stack for both modes.

| Role | Family | Weight | Size | Style |
|------|--------|--------|------|-------|
| Header Title | `Impact, 'Arial Black', sans-serif` | 900 | 13px | `uppercase`, `letter-spacing: 2px` |
| Roast Message | `'Segoe UI', system-ui, sans-serif` | 400 | 18px | `italic` |
| Detection Meta | `'Courier New', monospace` | 400 | 10px | `uppercase`, `letter-spacing: 1px` |
| Popup Labels | `'Segoe UI', system-ui, sans-serif` | 600 | 13px | `uppercase`, `letter-spacing: 0.5px` |
| Body Text | `'Segoe UI', system-ui, sans-serif` | 400 | 14-15px | normal |

**Hierarchy:**
- Impact for short, stencil-like labels (banner header, section titles)
- Courier New monospace for anything that should look like a readout or data (scores, triggers, specimen IDs)
- Segoe UI for everything a human reads at length (roast messages, descriptions, settings)

---

## Tone & Voice

| Trait | This | Not This |
|-------|------|----------|
| **Deadpan Authority** | Official-sounding warnings delivered with a straight face | Winking or self-aware about the joke |
| **Bureaucratic Absurdity** | Treating LinkedIn posts like regulated hazardous materials requiring official containment | Actually mean-spirited or personal attacks on users |
| **Dry Humor** | Comedy from the contrast between serious hazmat framing and trivial LinkedIn posts | LOL-random internet humor, memes, or pop culture references |
| **Anti-Corporate Satire** | Mocking the system (AI slop, hustle culture, thought leadership) not individuals | Punching down at regular people or making fun of someone's career |

**Roast message style:**
- Short (one sentence), punchy, italicized
- Written as if by a bored government inspector filling out forms
- Target the content pattern, not the person: "This post was mass-produced in the LinkedIn Cringe Factory" not "This person is dumb"

---

## Imagery & Art Direction

### Banner Illustrations

Flat, graphic illustrations in a limited palette. Each banner represents a type of AI slop
(robot writer, slop factory, thought leader, etc.).

**Style rules:**
- Flat vector illustration, no gradients, no 3D
- Limited palette per image: 3-4 colors max from the active mode's palette
- Bold, clean outlines
- Geometric simplification — warning-sign pictograms scaled to illustration size
- Industrial/containment imagery: robots, factories, conveyor belts, containment chambers
- No photorealistic elements

### Icons

- Hazard-symbol-inspired: biohazard, radiation, warning triangle
- Monochrome or two-color (signal color + background)
- Sharp geometric shapes, no rounded corners
- Stencil weight

### UI Components (Popup / Options)

- Utilitarian, functional, no decorative elements
- Dark mode: dark surfaces with green/yellow accents
- Light mode: white/cream surfaces with gold/amber accents
- Toggle switches use signal colors (green in dark, gold in light)
- Industrial feel — like a monitoring station interface

---

## Themes & Motifs

- Caution tape stripes (diagonal yellow `#f5c518` / black)
- Biohazard and radiation symbols
- Specimen tags and inspection stamps
- Containment / quarantine language ("QUARANTINED", "SPECIMEN #", "THREAT LEVEL")
- Warning triangles and hazard diamonds
- Thick industrial borders
- Monospace detection readouts
- Official-looking form fields and report layouts

---

## AI Image Generation

### Prompt Fragments

Use these as building blocks when generating images for LinkedIn Detox:

**Base style (dark mode):** "flat vector illustration, limited palette of void black (#0d0d0d),
toxic green (#39ff14), caution yellow (#f5c518), and white, bold clean outlines, geometric
simplification, industrial hazmat aesthetic, no gradients, no 3D rendering"

**Base style (light mode):** "flat vector illustration, limited palette of black, dark gold
(#7a6210), caution yellow (#f5c518), and cream white (#f5f3ee), bold clean outlines, geometric
simplification, official inspection report aesthetic, no gradients, no 3D rendering"

**For banner illustrations:** "[base style], centered composition, single scene depicting
[subject] in a containment/industrial setting, humorous but deadpan tone, warning-sign
pictogram scaled to full illustration"

**For store listing / promo:** "[base style], wide cinematic composition, showcase the
extension's detection interface with hazmat overlay on a stylized LinkedIn post"

**For social media graphics:** "[base style], square format 1080x1080, large readable text
area, caution tape border at top and bottom"

### Avoid in Prompts

- Photorealistic or 3D rendered imagery
- Gradients (keep fills flat)
- More than 4 colors per image
- Rounded, friendly, or "cute" aesthetics
- Generic tech imagery (circuit boards, binary code, neural networks)
- Neon colors besides Toxic Green — no pinks, purples, or blues as accents
- LinkedIn's own blue (#0077b5) as an accent
- Comic Sans or handwritten fonts

### Size Conventions

| Context | Size | Format |
|---------|------|--------|
| Banner overlay | 600x300px | PNG, transparent bg |
| Extension icon | 16, 48, 128px | PNG |
| Store listing | 1280x800px | PNG |
| Social media | 1080x1080px | PNG |
| README screenshot | native resolution | PNG |

---

## What to Avoid

- **Photorealism** — everything should be flat, graphic, illustrative
- **Friendly/playful aesthetics** — this is industrial containment, not consumer app UX
- **LinkedIn's brand colors** — don't use `#0077b5` or LinkedIn's official palette
- **Self-deprecation** — the extension is confident and authoritative, not apologetic
- **Personal attacks** — mock the content pattern, never the person posting
- **Pop culture references** — stay in the hazmat/containment metaphor
- **Decorative elements** — every visual element should serve the "official inspection" narrative
- **Rounded/soft shapes in UI** — prefer sharp corners, thick borders, stencil aesthetics

---

## Reference Assets

### Mood Image (Dark Mode)

**File:** `assets/style-reference-dark.png`

Flat vector hazmat containment scene — a suited inspector processes LinkedIn posts into
quarantine tubes on a conveyor belt. Biohazard and radiation symbols on the walls, caution
tape borders at top and bottom. Strict 4-color palette (void black, toxic green, caution
yellow, white). Use this as a **reference image** (`-i` flag) when generating new assets
to maintain visual consistency.

### Still needed:

1. ~~A **mood image** — flat hazmat containment scene in the dark mode palette~~ Done
2. A **banner sample** — example roast banner as it would appear over a LinkedIn post
3. A **UI sample** — popup or options page in the new style
