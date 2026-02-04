const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const COVERS_ROOT = path.join(ROOT, "Covers");
const OUTPUT_DIR = path.join(ROOT, "docs");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "coverIndex.json");

function normalizeTitle(title) {
  let s = (title || "").toLowerCase();
  s = s.replace(/&/g, "and");
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/[^a-z0-9]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function ensureNested(obj, key) {
  if (!obj[key]) obj[key] = {};
  return obj[key];
}

const bySerial = {};
const byTitle = {};

function addEntry(consoleKey, serial, normTitle, relPath) {
  if (!consoleKey || !relPath) return;
  const serialBucket = ensureNested(bySerial, consoleKey);
  const titleBucket = ensureNested(byTitle, consoleKey);

  if (serial) {
    const sKey = String(serial).toUpperCase().trim();
    if (sKey && !serialBucket[sKey]) {
      serialBucket[sKey] = relPath;
    }
  }

  if (normTitle) {
    const tKey = normTitle;
    if (!titleBucket[tKey]) {
      titleBucket[tKey] = relPath;
    }
  }
}

function getConsoleKeyFromPath(absPath) {
  const rel = path.relative(COVERS_ROOT, absPath);
  const parts = rel.split(path.sep);
  const consoleDir = parts[0] || "";
  return consoleDir.toLowerCase();
}

function processFile(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  if (![".webp", ".png", ".jpg", ".jpeg"].includes(ext)) return;

  const consoleKey = getConsoleKeyFromPath(absPath);
  if (!consoleKey) return;

  const relFromRoot = path.relative(ROOT, absPath).replace(/\\/g, "/");
  const base = path.basename(absPath, ext);

  let serial = null;
  let titlePart = base;

  const m = base.match(/\[([^\]]+)\]$/);
  if (m) {
    serial = m[1].toUpperCase().trim();
    titlePart = base.slice(0, m.index).trim();
  } else {
    // Also handle filenames that are just a serial or contain a serial-like code
    // e.g. "SLUS-20265", "SCUS-97101", "RMCE01"
    const serialPattern1 = /([A-Z]{3,5}-\d{3,6})/i;
    const serialPattern2 = /([A-Z0-9]{6})/i;
    const m1 = base.match(serialPattern1);
    const m2 = base.match(serialPattern2);
    const sm = m1 || m2;
    if (sm) {
      serial = sm[1].toUpperCase().trim();
    }
  }

  const normTitle = normalizeTitle(titlePart);
  addEntry(consoleKey, serial, normTitle, relFromRoot);
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile()) {
      processFile(full);
    }
  }
}

function main() {
  if (!fs.existsSync(COVERS_ROOT)) {
    console.error(`Covers root not found: ${COVERS_ROOT}`);
    console.error("Expected structure: Covers/<console>/*.webp");
    process.exitCode = 1;
    return;
  }

  console.log(`Scanning covers under: ${COVERS_ROOT}`);
  walk(COVERS_ROOT);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const index = { bySerial, byTitle };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2), "utf8");
  console.log(`Wrote cover index -> ${OUTPUT_FILE}`);
}

if (require.main === module) {
  main();
}

