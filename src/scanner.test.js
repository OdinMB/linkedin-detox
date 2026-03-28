import { describe, it, expect } from "vitest";
import { hashText } from "./scanner.js";

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
    // Length part should match actual text length
    const parts = hash.split(":");
    expect(Number(parts[1])).toBe(text.length);
  });

  it("texts with same DJB2 hash but different lengths produce different keys", () => {
    // Even if two texts had the same DJB2 value, different lengths discriminate them
    const hash1 = hashText("abc");
    const hash2 = hashText("abcdef");
    // They definitely differ in length suffix
    const len1 = hash1.split(":")[1];
    const len2 = hash2.split(":")[1];
    expect(len1).not.toBe(len2);
    expect(hash1).not.toBe(hash2);
  });
});
