# Chrome Web Store Listing

## Short Description (≤132 chars)

Hide AI slop and block promoted posts on LinkedIn. Replace them with something honest.

## Category

Social & Communication

## Detailed Description

Tired of LinkedIn posts that read like they were written by a motivational poster factory? LinkedIn Detox detects AI-generated slop in your feed and either hides it or replaces it with honest roast banners. It can also block promoted/sponsored posts — because ads disguised as content aren't any better than AI slop.

How it works:

- Scans posts in real time as you scroll your LinkedIn feed
- Detects AI-slop signals: buzzword density, thought-leader templates, em dash abuse, and more
- Optional ML-powered semantic scoring catches novel AI phrasings that keyword rules miss
- Flagged posts get replaced with satirical, AI-generated banners (the irony!)
- Optional promoted post blocker kills sponsored ads with a distinct blue banner

You control the experience:

- Roast mode: AI posts get replaced with snarky banners and a score breakdown
- Hide mode: AI posts silently disappear from your feed
- Adjustable paranoia level — from Chill (only blatant slop) to Unhinged (trust no one)
- Add your own signal words and co-occurrence patterns
- Full config page for fine-tuning detection thresholds

Privacy first:

- All processing happens locally in your browser — no data leaves your machine
- No accounts, no tracking, no analytics
- Open source (MIT license)

Works out of the box with zero configuration. Just install and scroll.

Heads up: LinkedIn's User Agreement (Section 8.2) prohibits browser extensions that modify the service's appearance or obscure advertisements. This extension does both. The practical risk is account restriction or suspension — the same risk profile as any ad blocker on LinkedIn. Use at your own discretion.

## Store Assets

| Asset                         | File                                   | Dimensions |
| ----------------------------- | -------------------------------------- | ---------- |
| Store icon                    | icons/icon128.png                      | 128x128    |
| Screenshot 1 — Feed view      | icons/store/screenshot-1-feed.png      | 1280x800   |
| Screenshot 2 — Popup          | icons/store/screenshot-2-popup.png     | 1280x800   |
| Screenshot 3 — Settings       | icons/store/screenshot-3-settings.png  | 1280x800   |
| Screenshot 4 — Roast close-up | icons/store/screenshot-4-roast.png     | 1280x800   |
| Screenshot 5 — Ad blocker     | icons/store/screenshot-linkedin-promoted.png | 1280x800   |
| Small promo tile              | icons/store/promo-tile-440x280.png     | 440x280    |
| Marquee promo tile            | icons/store/marquee-promo-1400x560.png | 1400x560   |
| Store icon                    | icons/store/store-icon-128x128.png     | 128x128    |

## Permission Justifications

### storage

Saves your preferences (enabled/disabled, sensitivity level, display mode, custom signal words) so they persist across browser restarts and sync across your signed-in Chrome devices. Also stores session statistics locally.

### offscreen

The optional ML-powered semantic scorer runs a quantized MiniLM embedding model using WebAssembly and Web Workers. These APIs are not available in Manifest V3 service workers, so the extension creates a hidden offscreen document to run model inference. No network requests are made. The model is bundled with the extension and all processing stays local.

### Host permissions (linkedin.com)

Content scripts need to read post text from the LinkedIn feed (for AI-slop detection) and modify the page DOM (to hide posts or inject roast banners). Also required so banner images and phrase embeddings can be loaded from the extension into the page context.
