import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    setupFiles: ["src/test-setup-globals.js"],
    coverage: {
      reporter: ["text", "lcov"],
      include: ["src/**/*.js"],
      exclude: [
        "src/**/*.test.js",
        "src/test-setup-globals.js",
        "src/lib/**",
        "src/models/**",
        "src/offscreen.js",
        "src/popup/popup.js",
        "src/options/options.js",
      ],
    },
  },
});
