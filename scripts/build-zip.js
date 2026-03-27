#!/usr/bin/env node
/**
 * Build a Chrome Web Store-ready zip of LinkedIn Detox.
 *
 * Usage:
 *   node scripts/build-zip.js
 *
 * Output:
 *   dist/linkedin-detox-<version>.zip
 *
 * Includes only the files Chrome needs to run the extension.
 * Excludes tests, docs, config, node_modules, scripts, etc.
 *
 * Requires: Node.js 14+ (no extra dependencies).
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const version = manifest.version;
const outDir = path.join(ROOT, "dist");
const zipName = `linkedin-detox-${version}.zip`;
const zipPath = path.join(outDir, zipName);

// Files and directories to include (relative to ROOT)
const include = [
  "manifest.json",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "icons/banners",
  "src",
];

// Patterns to exclude (matched against relative paths)
const exclude = [/\.test\.[jt]s$/];

function shouldExclude(relPath) {
  return exclude.some((pattern) => pattern.test(relPath));
}

function collectFiles(basePath, relBase) {
  const files = [];
  for (const entry of fs.readdirSync(basePath, { withFileTypes: true })) {
    const fullPath = path.join(basePath, entry.name);
    const relPath = path.join(relBase, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, relPath));
    } else if (!shouldExclude(relPath)) {
      files.push(relPath);
    }
  }
  return files;
}

// Gather all files to include
const files = [];
for (const item of include) {
  const fullPath = path.join(ROOT, item);
  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    files.push(...collectFiles(fullPath, item));
  } else {
    files.push(item);
  }
}

// Build zip using tar (available in Git Bash) piped through PowerShell,
// or just use PowerShell Compress-Archive via a temp directory.
// Simplest cross-platform: copy files to a temp dir, then zip it.

const tmpDir = path.join(outDir, "_tmp_extension");

// Clean
if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });

// Copy files preserving directory structure
for (const file of files) {
  const src = path.join(ROOT, file);
  const dest = path.join(tmpDir, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// Create zip
const isWindows = process.platform === "win32";
if (isWindows) {
  // PowerShell's Compress-Archive
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${tmpDir}\\*' -DestinationPath '${zipPath}' -Force"`,
    { stdio: "inherit" }
  );
} else {
  execSync(`cd "${tmpDir}" && zip -r "${zipPath}" .`, { stdio: "inherit" });
}

// Clean up temp dir
fs.rmSync(tmpDir, { recursive: true });

// Report
const stat = fs.statSync(zipPath);
const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
console.log("");
console.log(`Created: dist/${zipName} (${sizeMB} MB)`);
console.log("");
console.log(`Files (${files.length}):`);
for (const f of files) {
  console.log(`  ${f}`);
}
