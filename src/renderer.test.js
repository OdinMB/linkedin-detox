import { describe, it, expect, vi, beforeEach } from "vitest";

// The test-setup-globals.js runs before this file, establishing:
// - globalThis.window = globalThis
// - globalThis.chrome (basic stubs)
// - globalThis.LinkedInDetox namespace
// - globalThis.performance

// Override chrome.runtime.getURL with a vi.fn for assertions
globalThis.chrome.runtime.getURL = vi.fn((path) => `chrome-extension://fakeid/${path}`);

// Set escapeHtml on the namespace (normally loaded from utils.js before renderer.js)
globalThis.LinkedInDetox.escapeHtml = (str) =>
  str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Set cross-module functions renderer.js uses from scanner.js
globalThis.LinkedInDetox.unblock = vi.fn();
globalThis.LinkedInDetox.POST_SELECTOR = "div.fake-selector";
globalThis.LinkedInDetox.hasPendingBanners = () => false;
globalThis.LinkedInDetox.decrementPendingBanners = vi.fn();

// DOM stubs for renderer.js IIFE
if (!globalThis.document) {
  globalThis.document = {};
}
globalThis.document.body = {
  contains: vi.fn(() => false),
  appendChild: vi.fn(),
};
globalThis.document.createElement = vi.fn((tag) => ({
  tagName: tag.toUpperCase(),
  id: "",
  className: "",
  style: {},
  innerHTML: "",
  children: [],
  addEventListener: vi.fn(),
  appendChild: vi.fn(),
  remove: vi.fn(),
  classList: {
    toggle: vi.fn(),
  },
}));
globalThis.document.getElementById = vi.fn(() => null);
globalThis.document.querySelectorAll = vi.fn(() => []);

import {
  getRandomRoast,
  getRandomBannerImage,
  clipBannerToNav,
  ROAST_MESSAGES,
  PROMOTED_ROAST_MESSAGES,
  BANNER_IMAGES,
  PROMOTED_BANNER_IMAGES,
  escapeHtml,
} from "./renderer.js";

// --- Banner content arrays ---

describe("banner content arrays", () => {
  it("ROAST_MESSAGES is a non-empty array of strings", () => {
    expect(Array.isArray(ROAST_MESSAGES)).toBe(true);
    expect(ROAST_MESSAGES.length).toBeGreaterThan(0);
    ROAST_MESSAGES.forEach((msg) => {
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    });
  });

  it("PROMOTED_ROAST_MESSAGES is a non-empty array of strings", () => {
    expect(Array.isArray(PROMOTED_ROAST_MESSAGES)).toBe(true);
    expect(PROMOTED_ROAST_MESSAGES.length).toBeGreaterThan(0);
    PROMOTED_ROAST_MESSAGES.forEach((msg) => {
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    });
  });

  it("BANNER_IMAGES is a non-empty array of paths", () => {
    expect(Array.isArray(BANNER_IMAGES)).toBe(true);
    expect(BANNER_IMAGES.length).toBeGreaterThan(0);
    BANNER_IMAGES.forEach((img) => {
      expect(img).toMatch(/^icons\/banners\//);
    });
  });

  it("PROMOTED_BANNER_IMAGES is a non-empty array of paths", () => {
    expect(Array.isArray(PROMOTED_BANNER_IMAGES)).toBe(true);
    expect(PROMOTED_BANNER_IMAGES.length).toBeGreaterThan(0);
    PROMOTED_BANNER_IMAGES.forEach((img) => {
      expect(img).toMatch(/^icons\/banners\/promoted\//);
    });
  });

  it("ROAST_MESSAGES and PROMOTED_ROAST_MESSAGES have no duplicates", () => {
    expect(new Set(ROAST_MESSAGES).size).toBe(ROAST_MESSAGES.length);
    expect(new Set(PROMOTED_ROAST_MESSAGES).size).toBe(PROMOTED_ROAST_MESSAGES.length);
  });
});

// --- getRandomRoast ---

describe("getRandomRoast", () => {
  it("returns a string from ROAST_MESSAGES for type slop", () => {
    const roast = getRandomRoast("slop");
    expect(typeof roast).toBe("string");
    expect(ROAST_MESSAGES).toContain(roast);
  });

  it("returns a string from PROMOTED_ROAST_MESSAGES for type promoted", () => {
    const roast = getRandomRoast("promoted");
    expect(typeof roast).toBe("string");
    expect(PROMOTED_ROAST_MESSAGES).toContain(roast);
  });

  it("uses ROAST_MESSAGES for unknown type (defaults to non-promoted)", () => {
    const roast = getRandomRoast("unknown");
    expect(ROAST_MESSAGES).toContain(roast);
  });

  it("returns a value from the correct pool consistently", () => {
    for (let i = 0; i < 20; i++) {
      expect(ROAST_MESSAGES).toContain(getRandomRoast("slop"));
      expect(PROMOTED_ROAST_MESSAGES).toContain(getRandomRoast("promoted"));
    }
  });
});

// --- getRandomBannerImage ---

describe("getRandomBannerImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chrome.runtime.getURL = vi.fn((path) => `chrome-extension://fakeid/${path}`);
  });

  it("returns a chrome-extension URL for slop type", () => {
    const url = getRandomBannerImage("slop");
    expect(url).toMatch(/^chrome-extension:\/\/fakeid\/icons\/banners\//);
    expect(chrome.runtime.getURL).toHaveBeenCalled();
  });

  it("returns a chrome-extension URL for promoted type", () => {
    const url = getRandomBannerImage("promoted");
    expect(url).toMatch(/^chrome-extension:\/\/fakeid\/icons\/banners\/promoted\//);
  });

  it("calls chrome.runtime.getURL with a path from the correct pool", () => {
    getRandomBannerImage("slop");
    const calledPath = chrome.runtime.getURL.mock.calls[0][0];
    expect(BANNER_IMAGES).toContain(calledPath);
  });

  it("calls chrome.runtime.getURL with a promoted path for promoted type", () => {
    getRandomBannerImage("promoted");
    const calledPath = chrome.runtime.getURL.mock.calls[0][0];
    expect(PROMOTED_BANNER_IMAGES).toContain(calledPath);
  });
});

// --- clipBannerToNav ---

describe("clipBannerToNav", () => {
  function makeBanner() {
    return {
      style: {
        display: "",
        clipPath: "",
      },
    };
  }

  it("does nothing when navBottom is 0", () => {
    const banner = makeBanner();
    clipBannerToNav(banner, { top: 50, bottom: 200 }, 0);
    expect(banner.style.display).toBe("");
    expect(banner.style.clipPath).toBe("");
  });

  it("hides banner when it is entirely above the nav", () => {
    const banner = makeBanner();
    clipBannerToNav(banner, { top: 10, bottom: 50 }, 60);
    expect(banner.style.display).toBe("none");
  });

  it("clips banner when it partially overlaps the nav", () => {
    const banner = makeBanner();
    clipBannerToNav(banner, { top: 40, bottom: 120 }, 60);
    expect(banner.style.display).toBe("");
    expect(banner.style.clipPath).toBe("inset(20px 0 0 0)");
  });

  it("shows banner fully when it is entirely below the nav", () => {
    const banner = makeBanner();
    clipBannerToNav(banner, { top: 100, bottom: 300 }, 60);
    expect(banner.style.display).toBe("");
    expect(banner.style.clipPath).toBe("");
  });

  it("hides banner when bottom equals navBottom (entirely under nav)", () => {
    const banner = makeBanner();
    clipBannerToNav(banner, { top: 20, bottom: 60 }, 60);
    expect(banner.style.display).toBe("none");
  });

  it("clips correctly when top is 1px below navBottom boundary", () => {
    const banner = makeBanner();
    clipBannerToNav(banner, { top: 59, bottom: 200 }, 60);
    expect(banner.style.display).toBe("");
    expect(banner.style.clipPath).toBe("inset(1px 0 0 0)");
  });

  it("no clip when top equals navBottom exactly", () => {
    const banner = makeBanner();
    clipBannerToNav(banner, { top: 60, bottom: 200 }, 60);
    expect(banner.style.display).toBe("");
    expect(banner.style.clipPath).toBe("");
  });

  it("handles negative navBottom gracefully", () => {
    const banner = makeBanner();
    clipBannerToNav(banner, { top: 50, bottom: 200 }, -10);
    // navBottom <= 0 means no nav clipping
    expect(banner.style.display).toBe("");
    expect(banner.style.clipPath).toBe("");
  });
});

// --- escapeHtml (renderer's local copy) ---

describe("escapeHtml (renderer)", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert('xss')&lt;/script&gt;",
    );
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('data-hash="test"')).toBe("data-hash=&quot;test&quot;");
  });

  it("returns unchanged string when no special chars", () => {
    expect(escapeHtml("hello world 123")).toBe("hello world 123");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("handles multiple special chars in sequence", () => {
    expect(escapeHtml('<>&"')).toBe("&lt;&gt;&amp;&quot;");
  });
});
