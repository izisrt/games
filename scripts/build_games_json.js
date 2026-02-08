const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const INDEXS_ROOT = path.join(ROOT, "lists", "Indexs");
const OUTPUT_FILE = path.join(ROOT, "games.json");

function normalizeTitle(title) {
  let s = (title || "").toLowerCase();
  s = s.replace(/&/g, "and");
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/[^a-z0-9]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function stripTrailingBracketSerial(s) {
  return String(s || "").replace(/\s*\[[^\]]+\]\s*$/, "").trim();
}

function stripParenGroups(s) {
  // Remove region/language/etc suffixes like "(USA)", "(En,Ja)", "(Rev 1)".
  // This also removes any parentheses anywhere in the title.
  let out = String(s || "");
  out = out.replace(/\s*\([^)]*\)\s*/g, " ");
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

function consoleDisplayName(metaSystem, folderName) {
  const sys = String(metaSystem || "").trim();
  const folder = String(folderName || "").toLowerCase();

  if (sys.toLowerCase() === "nds" || folder.startsWith("ds")) return "DS";
  if (sys.toLowerCase() === "gc" || folder.startsWith("gc")) return "GameCube";
  if (sys.toLowerCase() === "wii" || folder.startsWith("wii")) return "Wii";
  if (sys.toLowerCase() === "ps2" || folder.startsWith("ps2")) return "PS2";
  if (sys.toLowerCase() === "ps1" || folder.startsWith("ps1")) return "PS1";
  if (sys.toLowerCase() === "n64" || folder.startsWith("n64")) return "N64";
  if (sys.toLowerCase() === "nes" || folder.startsWith("nes")) return "NES";
  if (sys.toLowerCase() === "snes" || folder.startsWith("snes")) return "SNES";
  if (sys.toLowerCase() === "gba" || folder.startsWith("gba")) return "GBA";
  if (sys.toLowerCase() === "gb" || folder.startsWith("gb")) return "GB";
  if (sys.toLowerCase() === "atari 2600" || folder.startsWith("atari_2600")) return "Atari 2600";

  // Fall back to system string as-is if present
  if (sys) return sys;
  return null;
}

function isRealSerialSystem(metaIdType) {
  const t = String(metaIdType || "").toLowerCase();
  // PS1/PS2: serial; Wii/GC: game_id
  return t === "serial" || t === "game_id";
}

function consoleTag(metaSystem, fallback) {
  const sys = String(metaSystem || "").trim();
  // Prefer the short console tag shown in brackets. (Index meta.system sometimes uses longer names.)
  if (sys.toLowerCase() === "nds") return "DS";
  if (sys.toLowerCase() === "atari 2600") return "2600";
  return sys || String(fallback || "").trim() || null;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function main() {
  if (!fs.existsSync(INDEXS_ROOT)) {
    console.error(`Indexs folder not found: ${INDEXS_ROOT}`);
    console.error("Expected: lists/Indexs/<system>_Index/*_index.json");
    process.exitCode = 1;
    return;
  }

  const systems = fs
    .readdirSync(INDEXS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const out = [];
  const seen = new Set();

  for (const sysFolder of systems) {
    const sysPath = path.join(INDEXS_ROOT, sysFolder);
    const indexFiles = fs
      .readdirSync(sysPath, { withFileTypes: true })
      .filter((f) => f.isFile() && f.name.toLowerCase().endsWith("_index.json"))
      .map((f) => f.name);

    for (const fname of indexFiles) {
      const abs = path.join(sysPath, fname);
      let json;
      try {
        json = readJson(abs);
      } catch (e) {
        console.warn(`Skipping invalid JSON: ${abs}`, e.message || e);
        continue;
      }

      const meta = json.meta || {};
      const displayConsole = consoleDisplayName(meta.system, sysFolder);
      if (!displayConsole) continue;
      const tag = consoleTag(meta.system, displayConsole);
      if (!tag) continue;

      const games = Array.isArray(json.games) ? json.games : [];
      const realSerials = isRealSerialSystem(meta.id_type);

      for (const g of games) {
        if (!g) continue;

        const rawTitle =
          (g.displayTitle && String(g.displayTitle).trim()) ||
          stripTrailingBracketSerial(g.datTitle || "") ||
          (g.datTitle && String(g.datTitle).trim()) ||
          "";
        const title = stripParenGroups(rawTitle);
        if (!title) continue;

        const rawId = g.id ? String(g.id).toUpperCase().trim() : "";
        const hasId = Boolean(rawId);

        // Deduping:
        // - For real serial systems, key by (console, serial)
        // - For crc/title systems, key by (console, normalized title)
        const key =
          realSerials && hasId
            ? `${displayConsole}|${rawId}`
            : `${displayConsole}|${normalizeTitle(title)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const entry = {
          title,
          console: displayConsole,
          // What the UI shows in brackets + what gets copied:
          serial: tag,
          display: `${title} [${tag}]`,
        };

        // Keep the real ID/serial for cover lookup (PS1/PS2/Wii/GC) without showing it.
        if (realSerials && hasId) entry.id = rawId;

        out.push(entry);
      }
    }
  }

  out.sort((a, b) => {
    const cc = String(a.console).localeCompare(String(b.console));
    if (cc !== 0) return cc;
    return String(a.title).localeCompare(String(b.title));
  });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`Wrote ${out.length.toLocaleString()} games -> ${OUTPUT_FILE}`);
}

if (require.main === module) {
  main();
}

