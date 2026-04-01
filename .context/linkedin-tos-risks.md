# LinkedIn Terms of Service — Extension Risk Analysis

Last reviewed: 2026-03-29

## Source Documents

- **LinkedIn User Agreement** — https://www.linkedin.com/legal/user-agreement (effective November 3, 2025)
- **LinkedIn Professional Community Policies** — https://www.linkedin.com/legal/professional-community-policies
- **LinkedIn API Terms of Use** — https://www.linkedin.com/legal/l/api-terms-of-use
- **LinkedIn Help: Prohibited Software** — https://www.linkedin.com/help/linkedin/answer/a1341387

## Most Relevant Clauses

### Section 8.2.2 — Browser Plugins / Scraping

> "Develop, support or use software, devices, scripts, robots or any other means or processes **(such as crawlers, browser plugins and add-ons or any other technology)** to scrape or copy the Services, including profiles and other data from the Services"

**Why it matters:** Explicitly names "browser plugins and add-ons" as prohibited means. The extension reads post content from the DOM to analyze it, which could be construed as "copying data from the Services."

### Section 8.2.15 — Overlay / Modify Appearance / Ad Obscuring

> "Overlay or otherwise modify the Services or their appearance **(such as by inserting elements into the Services or removing, covering, or obscuring an advertisement included on the Services)**"

**Why it matters:** The parenthetical examples describe the extension's core features with near-perfect precision:
- Replacing posts with roast banners = "inserting elements into the Services"
- Hiding posts = "modifying the appearance"
- Blocking promoted/sponsored posts = "removing, covering, or obscuring an advertisement"

### Section 8.2.9 — Reverse Engineering

> "Reverse engineer, decompile, disassemble, decipher or otherwise attempt to derive the source code for the Services or any related technology that is not open source"

**Why it matters:** Analyzing LinkedIn's DOM structure to identify post elements and detect promoted badges could be argued as reverse engineering the service's structure.

### Section 8.2.3 — Bypass Access Controls

> "Override any security feature or bypass or circumvent any access controls or use limits of the Services (such as search results, profiles, or videos)"

**Why it matters:** Could be stretched to argue that hiding sponsored posts circumvents LinkedIn's content delivery controls.

### Section 8.2.13 — Bots / Automated Methods

> "Use bots or other unauthorized automated methods to access the Services, add or download contacts, send or redirect messages, create, comment on, like, share, or re-share posts, or otherwise drive inauthentic engagement"

**Why it matters:** The extension uses automated content analysis (MutationObserver + ML model). However, it does not perform any of the specific listed actions — it only hides/labels content.

## Risk Summary by Feature

| Extension Feature | Clause | Risk |
|---|---|---|
| Hiding/replacing posts with banners | 8.2.15 | **High** — parenthetical examples describe this exactly |
| Blocking promoted/sponsored posts | 8.2.15 | **High** — "removing, covering, or obscuring an advertisement" is explicitly called out |
| Analyzing post content via DOM | 8.2.2 | **High** — "browser plugins" explicitly named |
| MutationObserver watching feed | 8.2.2 | Medium — automated monitoring of service content |
| ML-based content analysis | 8.2.2 + 8.2.9 | Medium — processing content through ML model |

## Consequences (per LinkedIn Help Article)

> "Violators face account restrictions, suspension, or permanent shutdown. Additionally, prohibited tools may become non-operational without notice as LinkedIn strengthens its defenses."

Section 8.2 survives account termination, meaning LinkedIn could pursue claims under these clauses even after account closure.

## Mitigating Context

- **Client-side only:** The extension makes no additional server requests and runs entirely in the user's browser. It does not scrape at scale or exfiltrate data.
- **User agency:** The user installs and controls the extension. It modifies *their* view, not anyone else's.
- **Industry precedent:** Ad blockers (uBlock Origin, AdBlock Plus) and feed-modifying extensions operate in a similar gray area. LinkedIn has not broadly enforced 8.2.15 against individual users running ad blockers.
- **hiQ v. LinkedIn (9th Circuit):** Addressed scraping of public data under the CFAA but focused on server-side scraping by a commercial entity, not client-side browser extensions used by individual account holders.
- **Enforceability:** ToS provisions that restrict what software a user may run on their own device face enforceability questions, particularly outside the US. EU consumer protection law and the right to modify one's own browsing experience may limit LinkedIn's ability to enforce some of these clauses.
- **No data exfiltration:** The extension does not transmit any LinkedIn data to external servers. All processing is local.

## Bottom Line

Clauses 8.2.2 and 8.2.15 technically prohibit the extension's core functionality. The practical risk is account-level enforcement (restriction/suspension/ban) rather than legal action. This is the same risk profile as any LinkedIn ad blocker or feed modifier. The extension should be transparent about this in its README/store listing — users should know they're accepting ToS risk.
