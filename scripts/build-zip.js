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
const zlib = require("zlib");

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
const exclude = [/\.test\.[jt]s$/, /test-setup-globals\.js$/];

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

// --- Pure Node.js ZIP builder (no shell commands, no dependencies) ---

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(entries) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuffer = Buffer.from(name, "utf8");
    const compressed = zlib.deflateRawSync(data);
    const crc = crc32(data);

    // Local file header
    const local = Buffer.alloc(30 + nameBuffer.length);
    local.writeUInt32LE(0x04034b50, 0);  // signature
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0, 6);            // flags
    local.writeUInt16LE(8, 8);            // compression (deflate)
    local.writeUInt16LE(0, 10);           // mod time
    local.writeUInt16LE(0, 12);           // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);           // extra field length
    nameBuffer.copy(local, 30);
    localHeaders.push(local, compressed);

    // Central directory header
    const central = Buffer.alloc(46 + nameBuffer.length);
    central.writeUInt32LE(0x02014b50, 0); // signature
    central.writeUInt16LE(20, 4);         // version made by
    central.writeUInt16LE(20, 6);         // version needed
    central.writeUInt16LE(0, 8);          // flags
    central.writeUInt16LE(8, 10);         // compression
    central.writeUInt16LE(0, 12);         // mod time
    central.writeUInt16LE(0, 14);         // mod date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);         // extra field length
    central.writeUInt16LE(0, 32);         // comment length
    central.writeUInt16LE(0, 34);         // disk start
    central.writeUInt16LE(0, 36);         // internal attrs
    central.writeUInt32LE(0, 38);         // external attrs
    central.writeUInt32LE(offset, 42);    // local header offset
    nameBuffer.copy(central, 46);
    centralHeaders.push(central);

    offset += local.length + compressed.length;
  }

  const centralOffset = offset;
  const centralSize = centralHeaders.reduce((sum, b) => sum + b.length, 0);

  // End of central directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);              // disk number
  eocd.writeUInt16LE(0, 6);              // disk with central dir
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);             // comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

// Clean and create output directory
if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

// Build zip entries
const entries = files.map((file) => ({
  name: file,
  data: fs.readFileSync(path.join(ROOT, file)),
}));

const zipBuffer = buildZip(entries);
fs.writeFileSync(zipPath, zipBuffer);

// Report
const sizeMB = (zipBuffer.length / 1024 / 1024).toFixed(1);
console.log("");
console.log(`Created: dist/${zipName} (${sizeMB} MB)`);
console.log("");
console.log(`Files (${files.length}):`);
for (const f of files) {
  console.log(`  ${f}`);
}
