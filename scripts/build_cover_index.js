const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const COVERS_ROOT = path.join(ROOT, "Covers");
const INDEXS_ROOT = path.join(ROOT, "lists", "Indexs");
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

function consoleKeyFromIndexFolder(folderName) {
  // folder examples: "ps2_Index", "gc_Index", "wii_Index"
  const base = String(folderName || "").toLowerCase();
  if (base.startsWith("ps2")) return "ps2";
  if (base.startsWith("ps1")) return "ps1";
  if (base.startsWith("n64")) return "n64";
  if (base.startsWith("nes")) return "nes";
  if (base.startsWith("snes")) return "snes";
  if (base.startsWith("gba")) return "gba";
  // Wii + GC covers live under shared Covers/wii_gc, and runtime expects "wii_gc"
  if (base.startsWith("wii") || base.startsWith("gc")) return "wii_gc";
  return null;
}

function coverFolderFromMeta(meta) {
  // meta.art_dir usually points to ...\Covers\<folder>
  const artDir = meta && meta.art_dir ? String(meta.art_dir) : "";
  const parts = artDir.split(/[\\/]/).filter(Boolean);
  const last = parts.length ? parts[parts.length - 1] : "";
  return last ? last : null;
}

function stripTrailingBracketSerial(s) {
  return String(s || "").replace(/\s*\[[^\]]+\]\s*$/, "").trim();
}

function buildFromIndexs() {
  if (!fs.existsSync(INDEXS_ROOT)) return false;

  const systems = fs.readdirSync(INDEXS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let loadedAny = false;

  for (const sysFolder of systems) {
    const consoleKey = consoleKeyFromIndexFolder(sysFolder);
    const sysPath = path.join(INDEXS_ROOT, sysFolder);
    const files = fs.readdirSync(sysPath, { withFileTypes: true })
      .filter((f) => f.isFile() && f.name.toLowerCase().endsWith("_index.json"))
      .map((f) => f.name);

    for (const file of files) {
      const abs = path.join(sysPath, file);
      let json;
      try {
        json = JSON.parse(fs.readFileSync(abs, "utf8"));
      } catch (e) {
        console.warn(`Skipping invalid JSON: ${abs}`, e.message || e);
        continue;
      }

      const meta = json.meta || {};
      const coverFolder = coverFolderFromMeta(meta);
      const games = Array.isArray(json.games) ? json.games : [];
      if (!games.length) continue;

      loadedAny = true;

      for (const g of games) {
        if (!g) continue;
        const id = g.id ? String(g.id).toUpperCase().trim() : null;
        const coverFile = g.coverFile ? String(g.coverFile) : null;
        if (!coverFile) continue;

        // Prefer meta art folder only if it exists under our repo's Covers/.
        // (Some index files may point to external art_dir paths.)
        const metaFolderOk =
          coverFolder &&
          fs.existsSync(path.join(COVERS_ROOT, coverFolder)) &&
          fs.statSync(path.join(COVERS_ROOT, coverFolder)).isDirectory();

        const folder = metaFolderOk ? coverFolder : (consoleKey || "");
        const relCoverPath = `Covers/${folder}/${coverFile}`.replace(/\\/g, "/");

        const titleCandidate =
          g.displayTitle ||
          stripTrailingBracketSerial(g.datTitle || "");
        const normTitle = normalizeTitle(titleCandidate);

        addEntry(consoleKey || "", id, normTitle, relCoverPath);
      }
    }
  }

  return loadedAny;
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

  // Prefer your curated per-system index files if present
  const usedIndexs = buildFromIndexs();
  if (usedIndexs) {
    console.log(`Built cover index from: ${INDEXS_ROOT}`);
  } else {
    console.log(`Scanning covers under: ${COVERS_ROOT}`);
    walk(COVERS_ROOT);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const index = { bySerial, byTitle };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2), "utf8");
  console.log(`Wrote cover index -> ${OUTPUT_FILE}`);
}

if (require.main === module) {
  main();
}

