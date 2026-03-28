import { describe, it, expect, vi, beforeEach } from "vitest";

// The test-setup-globals.js runs before this file, establishing:
// - globalThis.window = globalThis
// - globalThis.chrome (basic stubs)
// - globalThis.LinkedInDetox namespace
//
// scanner.js IIFE sees `typeof window !== "undefined"` and uses the shared namespace.

// Override chrome.runtime.sendMessage with a vi.fn so we can assert on it
globalThis.chrome.runtime.sendMessage = vi.fn(() => Promise.resolve());

// Import scanner.js — the IIFE runs and populates ns (= globalThis.LinkedInDetox)
import {
  hashText,
  recordBlocked,
  unblock,
  blockedSet,
  analyzedHashes,
  ANALYZED_HASHES_MAX,
  _getState,
  _resetState,
  scanFeed,
} from "./scanner.js";

// After import, set cross-module functions on the shared namespace.
// In the browser, these come from utils.js and renderer.js loaded before scanner.js.
const ns = globalThis.LinkedInDetox;
ns.markDirty = vi.fn();
ns.extractAuthor = (text) => {
  const firstLine = (text.split("\n")[0] || "").trim();
  return firstLine.length <= 120 ? firstLine : "";
};
ns.isWhitelistedAuthor = (authorLine, whitelistSet) => {
  if (!authorLine || whitelistSet.size === 0) return false;
  const lower = authorLine.toLowerCase();
  for (const name of whitelistSet) {
    if (lower.includes(name)) return true;
  }
  return false;
};
ns.hasPendingBanners = () => false;
ns.decrementPendingBanners = vi.fn();

// Mock global functions from detector.js used by scanFeed
globalThis.isPromotedPost = vi.fn(() => false);
globalThis.analyzePostAsync = vi.fn(async () => ({
  blocked: false,
  score: 0,
  matches: [],
}));

// --- hashText ---

describe("hashText", () => {
  it("returns the same hash for the same input (deterministic)", () => {
    const text = "This is a test post about leadership and innovation.";
    expect(hashText(text)).toBe(hashText(text));
  });

  it("returns different hashes for different inputs", () => {
    const hash1 = hashText("First post about leadership");
    const hash2 = hashText("Second post about innovation");
    expect(hash1).not.toBe(hash2);
  });

  it("output format includes integer, colon, and length", () => {
    const text = "Hello world";
    const hash = hashText(text);
    expect(hash).toMatch(/^-?\d+:\d+$/);
    const parts = hash.split(":");
    expect(Number(parts[1])).toBe(text.length);
  });

  it("texts with same DJB2 hash but different lengths produce different keys", () => {
    const hash1 = hashText("abc");
    const hash2 = hashText("abcdef");
    const len1 = hash1.split(":")[1];
    const len2 = hash2.split(":")[1];
    expect(len1).not.toBe(len2);
    expect(hash1).not.toBe(hash2);
  });

  it("handles empty string", () => {
    const hash = hashText("");
    expect(hash).toBe("0:0");
  });

  it("handles single character", () => {
    const hash = hashText("a");
    expect(hash).toMatch(/^-?\d+:1$/);
  });

  it("handles unicode characters", () => {
    const hash = hashText("Hello \u2014 world");
    expect(hash).toMatch(/^-?\d+:\d+$/);
    expect(hashText("Hello \u2014 world")).toBe(hash);
  });
});

// --- recordBlocked ---

describe("recordBlocked", () => {
  beforeEach(() => {
    _resetState();
    vi.clearAllMocks();
    ns.markDirty = vi.fn();
  });

  it("adds entry to blockedSet with correct structure", () => {
    const hash = "123:10";
    const result = { blocked: true, score: 85, matches: ["leverage"] };
    const callbacks = {
      getRandomRoast: vi.fn(() => "Some roast"),
      getRandomBannerImage: vi.fn(() => "img.png"),
      log: vi.fn(),
    };

    recordBlocked(hash, result, "slop", "Jane Doe", callbacks);

    expect(blockedSet.has(hash)).toBe(true);
    const entry = blockedSet.get(hash);
    expect(entry.result).toBe(result);
    expect(entry.type).toBe("slop");
    expect(entry.authorName).toBe("Jane Doe");
    expect(entry.roastMessage).toBe("Some roast");
    expect(entry.bannerImage).toBe("img.png");
  });

  it("calls getRandomRoast with the correct type", () => {
    const callbacks = {
      getRandomRoast: vi.fn(() => "roast"),
      getRandomBannerImage: vi.fn(() => "img.png"),
      log: vi.fn(),
    };

    recordBlocked("h1:5", { blocked: true, score: 100, matches: [] }, "promoted", "", callbacks);
    expect(callbacks.getRandomRoast).toHaveBeenCalledWith("promoted");

    recordBlocked("h2:5", { blocked: true, score: 80, matches: [] }, "slop", "", callbacks);
    expect(callbacks.getRandomRoast).toHaveBeenCalledWith("slop");
  });

  it("sends chrome.runtime.sendMessage with type blocked", () => {
    const callbacks = {
      getRandomRoast: vi.fn(() => "roast"),
      getRandomBannerImage: vi.fn(() => "img.png"),
      log: vi.fn(),
    };

    recordBlocked("h:5", { blocked: true, score: 50, matches: [] }, "slop", "", callbacks);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "blocked" });
  });

  it("calls ns.markDirty", () => {
    const callbacks = {
      getRandomRoast: vi.fn(() => "roast"),
      getRandomBannerImage: vi.fn(() => "img.png"),
      log: vi.fn(),
    };

    recordBlocked("h:5", { blocked: true, score: 50, matches: [] }, "slop", "", callbacks);
    expect(ns.markDirty).toHaveBeenCalled();
  });

  it("increments pendingBanners", () => {
    const callbacks = {
      getRandomRoast: vi.fn(() => "roast"),
      getRandomBannerImage: vi.fn(() => "img.png"),
      log: vi.fn(),
    };

    const before = _getState().pendingBanners;
    recordBlocked("h:5", { blocked: true, score: 50, matches: [] }, "slop", "", callbacks);
    expect(_getState().pendingBanners).toBe(before + 1);
  });

  it("stores multiple entries with different hashes", () => {
    const callbacks = {
      getRandomRoast: vi.fn(() => "roast"),
      getRandomBannerImage: vi.fn(() => "img.png"),
      log: vi.fn(),
    };

    recordBlocked("a:1", { blocked: true, score: 70, matches: [] }, "slop", "A", callbacks);
    recordBlocked("b:2", { blocked: true, score: 80, matches: [] }, "promoted", "B", callbacks);

    expect(blockedSet.size).toBe(2);
    expect(blockedSet.get("a:1").type).toBe("slop");
    expect(blockedSet.get("b:2").type).toBe("promoted");
  });
});

// --- unblock ---

describe("unblock", () => {
  beforeEach(() => {
    _resetState();
  });

  it("removes a hash from blockedSet", () => {
    blockedSet.set("test:5", { result: {}, type: "slop" });
    expect(blockedSet.has("test:5")).toBe(true);

    unblock("test:5");
    expect(blockedSet.has("test:5")).toBe(false);
  });

  it("is a no-op for non-existent hash", () => {
    unblock("nonexistent:0");
    expect(blockedSet.size).toBe(0);
  });

  it("only removes the specified hash, leaving others", () => {
    blockedSet.set("keep:3", { result: {}, type: "slop" });
    blockedSet.set("remove:4", { result: {}, type: "promoted" });

    unblock("remove:4");

    expect(blockedSet.has("keep:3")).toBe(true);
    expect(blockedSet.has("remove:4")).toBe(false);
  });
});

// --- analyzedHashes ---

describe("analyzedHashes", () => {
  beforeEach(() => {
    _resetState();
  });

  it("is a Set", () => {
    expect(analyzedHashes).toBeInstanceOf(Set);
  });

  it("ANALYZED_HASHES_MAX is 2000", () => {
    expect(ANALYZED_HASHES_MAX).toBe(2000);
  });
});

// --- scanFeed ---

describe("scanFeed", () => {
  beforeEach(() => {
    _resetState();
    vi.clearAllMocks();
    ns.markDirty = vi.fn();
    globalThis.isPromotedPost = vi.fn(() => false);
    globalThis.analyzePostAsync = vi.fn(async () => ({
      blocked: false,
      score: 0,
      matches: [],
    }));
    globalThis.document = globalThis.document || {};
    globalThis.document.querySelectorAll = vi.fn(() => []);
  });

  it("does nothing when config.enabled is false", async () => {
    const callbacks = {
      isContextValid: vi.fn(() => true),
      render: vi.fn(),
      log: vi.fn(),
    };

    await scanFeed({ enabled: false }, callbacks);

    expect(document.querySelectorAll).not.toHaveBeenCalled();
    expect(callbacks.render).not.toHaveBeenCalled();
  });

  it("does nothing when isContextValid returns false", async () => {
    const callbacks = {
      isContextValid: vi.fn(() => false),
      render: vi.fn(),
      log: vi.fn(),
    };

    await scanFeed({ enabled: true }, callbacks);

    expect(document.querySelectorAll).not.toHaveBeenCalled();
    expect(callbacks.render).not.toHaveBeenCalled();
  });

  it("calls render even when there are no posts", async () => {
    const callbacks = {
      isContextValid: vi.fn(() => true),
      render: vi.fn(),
      log: vi.fn(),
    };

    await scanFeed({ enabled: true }, callbacks);

    expect(callbacks.render).toHaveBeenCalled();
  });

  it("skips posts with height < 10", async () => {
    const mockPost = {
      getBoundingClientRect: () => ({ height: 5, width: 100 }),
      innerText: "Some post text here for testing",
    };

    document.querySelectorAll = vi.fn(() => [mockPost]);

    const callbacks = {
      isContextValid: vi.fn(() => true),
      render: vi.fn(),
      log: vi.fn(),
      getRandomRoast: vi.fn(() => "roast"),
      getRandomBannerImage: vi.fn(() => "img.png"),
    };

    await scanFeed({ enabled: true, threshold: 30 }, callbacks);

    expect(globalThis.analyzePostAsync).not.toHaveBeenCalled();
  });

  it("skips posts with empty text", async () => {
    const mockPost = {
      getBoundingClientRect: () => ({ height: 100, width: 500 }),
      innerText: "   ",
    };

    document.querySelectorAll = vi.fn(() => [mockPost]);

    const callbacks = {
      isContextValid: vi.fn(() => true),
      render: vi.fn(),
      log: vi.fn(),
    };

    await scanFeed({ enabled: true, threshold: 30 }, callbacks);

    expect(globalThis.analyzePostAsync).not.toHaveBeenCalled();
  });

  it("skips already-analyzed hashes", async () => {
    const text = "Some unique post text for dedup test";
    analyzedHashes.add(hashText(text));

    const mockPost = {
      getBoundingClientRect: () => ({ height: 100, width: 500 }),
      innerText: text,
    };

    document.querySelectorAll = vi.fn(() => [mockPost]);

    const callbacks = {
      isContextValid: vi.fn(() => true),
      render: vi.fn(),
      log: vi.fn(),
    };

    await scanFeed({ enabled: true, threshold: 30 }, callbacks);

    expect(globalThis.analyzePostAsync).not.toHaveBeenCalled();
  });

  it("skips whitelisted authors", async () => {
    const text = "Jane Doe\nSome post content about things";

    const mockPost = {
      getBoundingClientRect: () => ({ height: 100, width: 500 }),
      innerText: text,
    };

    document.querySelectorAll = vi.fn(() => [mockPost]);

    const callbacks = {
      isContextValid: vi.fn(() => true),
      render: vi.fn(),
      log: vi.fn(),
      getRandomRoast: vi.fn(() => "roast"),
      getRandomBannerImage: vi.fn(() => "img.png"),
    };

    await scanFeed(
      { enabled: true, threshold: 30, whitelistedAuthorsSet: new Set(["jane doe"]) },
      callbacks,
    );

    expect(callbacks.log).toHaveBeenCalledWith(expect.stringContaining("Whitelisted author skipped"));
    expect(blockedSet.size).toBe(0);
  });

  it("blocks promoted posts when blockPromoted is enabled", async () => {
    const text = "Company Name\nPromoted\nBuy our amazing product!";

    const mockPost = {
      getBoundingClientRect: () => ({ height: 100, width: 500 }),
      innerText: text,
    };

    document.querySelectorAll = vi.fn(() => [mockPost]);
    globalThis.isPromotedPost = vi.fn(() => true);

    const callbacks = {
      isContextValid: vi.fn(() => true),
      render: vi.fn(),
      log: vi.fn(),
      getRandomRoast: vi.fn(() => "Ad blocked roast"),
      getRandomBannerImage: vi.fn(() => "promoted.png"),
    };

    await scanFeed({ enabled: true, threshold: 30, blockPromoted: true }, callbacks);

    expect(callbacks.log).toHaveBeenCalledWith(expect.stringContaining("Promoted post blocked"));
    expect(blockedSet.size).toBe(1);
    const entry = [...blockedSet.values()][0];
    expect(entry.type).toBe("promoted");
  });

  it("blocks posts in test mode at indices 2 and 4", async () => {
    const posts = [];
    for (let i = 0; i < 5; i++) {
      posts.push({
        getBoundingClientRect: () => ({ height: 100, width: 500 }),
        innerText: `Unique post number ${i} with distinct text content that is long enough`,
      });
    }

    document.querySelectorAll = vi.fn(() => posts);

    const callbacks = {
      isContextValid: vi.fn(() => true),
      render: vi.fn(),
      log: vi.fn(),
      getRandomRoast: vi.fn(() => "Test roast"),
      getRandomBannerImage: vi.fn(() => "test.png"),
    };

    await scanFeed({ enabled: true, threshold: 30, testMode: true }, callbacks);

    const blocked = [...blockedSet.values()];
    const testBlocked = blocked.filter(
      (e) => e.result.matches.includes("Test mode"),
    );
    expect(testBlocked.length).toBe(2);
  });

  it("runs analyzePostAsync for non-promoted, non-test posts", async () => {
    const text = "Author Name\nJust a normal post about my day at work.";

    const mockPost = {
      getBoundingClientRect: () => ({ height: 100, width: 500 }),
      innerText: text,
    };

    document.querySelectorAll = vi.fn(() => [mockPost]);
    globalThis.analyzePostAsync = vi.fn(async () => ({
      blocked: false,
      score: 15,
      matches: [],
    }));

    const callbacks = {
      isContextValid: vi.fn(() => true),
      render: vi.fn(),
      log: vi.fn(),
      getRandomRoast: vi.fn(() => "roast"),
      getRandomBannerImage: vi.fn(() => "img.png"),
    };

    await scanFeed({ enabled: true, threshold: 30 }, callbacks);

    expect(globalThis.analyzePostAsync).toHaveBeenCalled();
    expect(blockedSet.size).toBe(0);
  });

  it("blocks post when analyzePostAsync returns blocked", async () => {
    const text = "Author\nLeverage synergy to unlock scalable disruptive frameworks";

    const mockPost = {
      getBoundingClientRect: () => ({ height: 100, width: 500 }),
      innerText: text,
    };

    document.querySelectorAll = vi.fn(() => [mockPost]);
    globalThis.analyzePostAsync = vi.fn(async () => ({
      blocked: true,
      score: 85,
      matches: ["leverage", "synergy"],
    }));

    const callbacks = {
      isContextValid: vi.fn(() => true),
      render: vi.fn(),
      log: vi.fn(),
      getRandomRoast: vi.fn(() => "AI slop detected"),
      getRandomBannerImage: vi.fn(() => "slop.png"),
    };

    await scanFeed({ enabled: true, threshold: 30 }, callbacks);

    expect(blockedSet.size).toBe(1);
    const entry = [...blockedSet.values()][0];
    expect(entry.type).toBe("slop");
    expect(entry.result.score).toBe(85);
  });

  it("handles analyzePostAsync errors gracefully", async () => {
    const text = "Author\nSome post that causes analysis error";

    const mockPost = {
      getBoundingClientRect: () => ({ height: 100, width: 500 }),
      innerText: text,
    };

    document.querySelectorAll = vi.fn(() => [mockPost]);
    globalThis.analyzePostAsync = vi.fn(async () => {
      throw new Error("Analysis failed");
    });

    const callbacks = {
      isContextValid: vi.fn(() => true),
      render: vi.fn(),
      log: vi.fn(),
      getRandomRoast: vi.fn(() => "roast"),
      getRandomBannerImage: vi.fn(() => "img.png"),
    };

    // Should not throw
    await scanFeed({ enabled: true, threshold: 30 }, callbacks);

    expect(blockedSet.size).toBe(0);
    expect(callbacks.render).toHaveBeenCalled();
  });

  it("logs analysis summary when new posts found", async () => {
    const text = "Author\nA normal post for counting";

    const mockPost = {
      getBoundingClientRect: () => ({ height: 100, width: 500 }),
      innerText: text,
    };

    document.querySelectorAll = vi.fn(() => [mockPost]);

    const callbacks = {
      isContextValid: vi.fn(() => true),
      render: vi.fn(),
      log: vi.fn(),
      getRandomRoast: vi.fn(() => "roast"),
      getRandomBannerImage: vi.fn(() => "img.png"),
    };

    await scanFeed({ enabled: true, threshold: 30 }, callbacks);

    expect(callbacks.log).toHaveBeenCalledWith(expect.stringContaining("Analyzed 1 new posts"));
  });
});
