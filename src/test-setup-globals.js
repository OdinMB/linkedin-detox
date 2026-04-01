/**
 * Vitest setup file — establishes globals that the IIFE modules expect.
 * Runs before any test file imports, so the IIFEs see `window`, `chrome`, etc.
 */

// Make `typeof window` resolve to an object so IIFE modules use the shared namespace
globalThis.window = globalThis;

// Chrome extension API stubs
globalThis.chrome = {
  runtime: {
    sendMessage: () => Promise.resolve(),
    getURL: (path) => `chrome-extension://fakeid/${path}`,
  },
  storage: {
    sync: {
      get: () => {},
      set: () => {},
    },
  },
};

// Shared namespace
globalThis._ld = globalThis._ld || {};

// performance.now stub
if (typeof performance === "undefined") {
  globalThis.performance = { now: () => 0 };
}
