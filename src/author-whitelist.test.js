import { describe, it, expect } from "vitest";
import { extractAuthor, isWhitelistedAuthor, normalizeText } from "./shared/utils.js";

describe("extractAuthor", () => {
  it("returns the first line of text, trimmed", () => {
    expect(extractAuthor("Jane Doe\nSome post content here")).toBe("Jane Doe");
  });

  it("trims whitespace from the first line", () => {
    expect(extractAuthor("  John Smith  \nPost body")).toBe("John Smith");
  });

  it("returns the whole text if no newline (single line)", () => {
    expect(extractAuthor("Jane Doe")).toBe("Jane Doe");
  });

  it("returns empty string for empty input", () => {
    expect(extractAuthor("")).toBe("");
  });

  it("returns empty string if first line is too long (> 120 chars)", () => {
    const longName = "A".repeat(121);
    expect(extractAuthor(longName + "\nBody")).toBe("");
  });

  it("returns the name when first line is exactly 120 chars", () => {
    const name = "A".repeat(120);
    expect(extractAuthor(name + "\nBody")).toBe(name);
  });

  it("handles names with pronouns and credentials", () => {
    expect(extractAuthor("Jane Doe (She/Her)\nPost body")).toBe("Jane Doe (She/Her)");
  });

  it("handles names with emoji", () => {
    expect(extractAuthor("John Smith \u{1F680}\nPost body")).toBe("John Smith \u{1F680}");
  });

  it("normalizes non-breaking spaces from LinkedIn", () => {
    expect(extractAuthor("Jane\u00A0Doe\nPost body")).toBe("Jane Doe");
  });

  it("strips zero-width characters from LinkedIn", () => {
    expect(extractAuthor("Jane\u200BDoe\nPost body")).toBe("JaneDoe");
  });

  it("normalizes en-dashes to hyphens", () => {
    expect(extractAuthor("Goodwin\u2013Helgerson\nPost body")).toBe("Goodwin-Helgerson");
  });
});

describe("normalizeText", () => {
  it("replaces non-breaking space with regular space", () => {
    expect(normalizeText("hello\u00A0world")).toBe("hello world");
  });

  it("removes zero-width characters", () => {
    expect(normalizeText("hel\u200Blo")).toBe("hello");
  });

  it("normalizes various dashes to ASCII hyphen", () => {
    expect(normalizeText("a\u2013b\u2014c")).toBe("a-b-c");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeText("a   b")).toBe("a b");
  });

  it("trims whitespace", () => {
    expect(normalizeText("  hello  ")).toBe("hello");
  });
});

describe("isWhitelistedAuthor", () => {
  it("returns false for empty author line", () => {
    const whitelist = new Set(["jane doe"]);
    expect(isWhitelistedAuthor("", whitelist)).toBe(false);
  });

  it("returns false for empty whitelist", () => {
    expect(isWhitelistedAuthor("Jane Doe", new Set())).toBe(false);
  });

  it("matches case-insensitively", () => {
    const whitelist = new Set(["jane doe"]);
    expect(isWhitelistedAuthor("Jane Doe", whitelist)).toBe(true);
  });

  it("matches as substring (handles pronouns/credentials)", () => {
    const whitelist = new Set(["jane doe"]);
    expect(isWhitelistedAuthor("Jane Doe (She/Her)", whitelist)).toBe(true);
  });

  it("matches when author line has extra decorations", () => {
    const whitelist = new Set(["john smith"]);
    expect(isWhitelistedAuthor("John Smith, MBA \u2022 2nd", whitelist)).toBe(true);
  });

  it("returns false when no match", () => {
    const whitelist = new Set(["jane doe"]);
    expect(isWhitelistedAuthor("Bob Jones", whitelist)).toBe(false);
  });

  it("matches any entry in the whitelist", () => {
    const whitelist = new Set(["jane doe", "bob jones"]);
    expect(isWhitelistedAuthor("Bob Jones (He/Him)", whitelist)).toBe(true);
  });

  it("returns false for null/undefined author", () => {
    const whitelist = new Set(["jane doe"]);
    expect(isWhitelistedAuthor(null, whitelist)).toBe(false);
    expect(isWhitelistedAuthor(undefined, whitelist)).toBe(false);
  });

  it("matches despite non-breaking spaces in author line", () => {
    const whitelist = new Set(["jane doe"]);
    expect(isWhitelistedAuthor("Jane\u00A0Doe (She/Her)", whitelist)).toBe(true);
  });

  it("matches despite en-dash vs hyphen difference", () => {
    const whitelist = new Set(["goodwin-helgerson"]);
    expect(isWhitelistedAuthor("Jill Goodwin\u2013Helgerson", whitelist)).toBe(true);
  });
});
