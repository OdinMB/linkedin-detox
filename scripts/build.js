#!/usr/bin/env node
/**
 * Build browser-ready packages of LinkedIn Detox.
 *
 * Usage:
 *   node scripts/build.js              # All browsers (Chrome + Firefox + Safari)
 *   node scripts/build.js --chrome     # Chrome only
 *   node scripts/build.js --firefox    # Firefox only
 *   node scripts/build.js --safari     # Safari only
 *   node scripts/build.js --chrome --firefox  # Multiple specific browsers
 *
 * Output:
 *   dist/linkedin-detox-<version>.zip            (Chrome)
 *   dist/linkedin-detox-<version>-firefox.zip    (Firefox)
 *   dist/linkedin-detox-<version>-safari/        (Safari — directory for xcrun converter)
 *
 * Includes only the files each browser needs to run the extension.
 * Excludes tests, docs, config, node_modules, scripts, etc.
 *
 * Requires: Node.js 14+ (no extra dependencies).
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");

// --- Determine which browsers to build ---

const args = process.argv.slice(2);
const explicit = args.filter((a) => ["--chrome", "--firefox", "--safari"].includes(a));
const browsers = explicit.length > 0
  ? explicit.map((a) => a.replace("--", ""))
  : ["chrome", "firefox", "safari"];

// --- Browser config ---

const BROWSER_CONFIG = {
  chrome: { manifest: "manifest.json", suffix: "-chrome", label: "Chrome" },
  firefox: { manifest: "manifest.firefox.json", suffix: "-firefox", label: "Firefox" },
  safari: { manifest: "manifest.safari.json", suffix: "-safari", label: "Safari" },
};

// --- Shared include/exclude ---

const include = [
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "icons/banners",
  "src",
];

const baseExclude = [/\.test\.[jt]s$/, /test-setup-globals\.js$/];

function getExcludes(browser) {
  const patterns = [...baseExclude];
  if (browser === "chrome") {
    patterns.push(/^src\/background-portable\.js$/);
  } else {
    patterns.push(/^src\/offscreen\.(js|html)$/);
    patterns.push(/^src\/background\.js$/);
  }
  return patterns;
}

function collectFiles(basePath, relBase, excludes) {
  const files = [];
  for (const entry of fs.readdirSync(basePath, { withFileTypes: true })) {
    const fullPath = path.join(basePath, entry.name);
    const relPath = path.join(relBase, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, relPath, excludes));
    } else if (!excludes.some((p) => p.test(relPath))) {
      files.push(relPath);
    }
  }
  return files;
}

function gatherFiles(browser) {
  const excludes = getExcludes(browser);
  const files = [];
  for (const item of include) {
    const fullPath = path.join(ROOT, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectFiles(fullPath, item, excludes));
    } else {
      files.push(item);
    }
  }
  files.unshift("manifest.json");
  return files;
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

// --- Build one browser ---

function buildBrowser(browser) {
  const config = BROWSER_CONFIG[browser];
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, config.manifest), "utf8"));
  const version = manifest.version;
  const files = gatherFiles(browser);

  function readFileData(relPath) {
    if (relPath === "manifest.json") {
      return fs.readFileSync(path.join(ROOT, config.manifest));
    }
    return fs.readFileSync(path.join(ROOT, relPath));
  }

  if (browser === "safari") {
    const safariDir = path.join(outDir, `linkedin-detox-${version}-safari`);
    fs.mkdirSync(safariDir, { recursive: true });
    for (const file of files) {
      const dest = path.join(safariDir, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, readFileData(file));
    }
    console.log(`  ${config.label}: dist/linkedin-detox-${version}-safari/ (${files.length} files)`);
  } else {
    const zipName = `linkedin-detox-${version}${config.suffix}.zip`;
    const entries = files.map((file) => ({ name: file, data: readFileData(file) }));
    const zipBuffer = buildZip(entries);
    fs.writeFileSync(path.join(outDir, zipName), zipBuffer);
    const sizeMB = (zipBuffer.length / 1024 / 1024).toFixed(1);
    console.log(`  ${config.label}: dist/${zipName} (${sizeMB} MB, ${files.length} files)`);
  }
}

// --- Run ---

const outDir = path.join(ROOT, "dist");
if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

console.log("");
console.log(`Building ${browsers.length} target${browsers.length > 1 ? "s" : ""}:`);
for (const browser of browsers) {
  buildBrowser(browser);
}

if (browsers.includes("safari")) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, BROWSER_CONFIG.safari.manifest), "utf8"));
  console.log("");
  console.log("Safari next step:");
  console.log(`  xcrun safari-web-extension-converter dist/linkedin-detox-${manifest.version}-safari`);
}
