const $ = (sel) => document.querySelector(sel);

// Console icon path (icons/ folder) and box color. Add your icon files: gamecube.png, wii.png, ps1.png, ps2.png, n64.png, nes.png, snes.png
const CONSOLE_CONFIG = {
  GameCube:    { icon: "gamecube.png", color: "#695BAE" },   // purple
  Wii:         { icon: "wii.png",       color: "#f8fafc" },  // white
  N64:         { icon: "n64.png",       color: "#01942C" },
  NES:         { icon: "nes.png",       color: "#FF0000" },  // gray
  SNES:        { icon: "snes.png",      color: "#B0ACE1" },  // dark gray
  "PlayStation 1": { icon: "PS1.png",   color: "#9ca3af" },  // gray
  "PlayStation 2": { icon: "ps2.png",   color: "#1a2930" },   // dark gray
  PS2:         { icon: "ps2.png",       color: "#374151" },
  PS1:         { icon: "PS1.png",       color: "#9ca3af" },
};

const OVERSCAN = 8;
const GRID_OVERSCAN_ROWS = 4;

// View state and cover index
// Default to grid view
let viewMode = "grid"; // "list" | "grid"
let coverIndex = null;
let coverObserver = null;

function getRowHeight() {
  const px = getComputedStyle(document.documentElement).getPropertyValue("--row-height").trim();
  return px ? parseFloat(px) || 50 : 50;
}

function getGridTileWidth() {
  const px = getComputedStyle(document.documentElement).getPropertyValue("--grid-tile-width").trim();
  return px ? parseFloat(px) || 140 : 140;
}

function getSearchText() {
  return (els.search && els.search.value ? els.search.value : "").trim();
}

const els = {
  search: $("#search"),
  consoleFilter: $("#consoleFilter"),
  sortBy: $("#sortBy"),
  viewToggle: $("#viewToggle"),
  list: $("#list"),
  status: $("#status"),
  listScroll: $("#listScroll"),
  listInner: $("#listInner"),
  listWindow: $("#listWindow"),
  azJump: $("#azJump"),
};

let allGames = [];
let consoles = [];
let filteredItems = [];
let letterIndex = {};
let scrollRAF = null;
let gridItems = null; // derived array used only in grid view

// --- Helpers shared by list + grid views ---

function normalizeTitleForIndex(title) {
  let s = (title || "").toLowerCase();
  s = s.replace(/&/g, "and");
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/[^a-z0-9]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function getConsoleKey(consoleName) {
  const c = (consoleName || "").toLowerCase();
  // Covers for Wii and GameCube currently live under a shared "wii_gc" folder
  if (c === "wii" || c === "gamecube") return "wii_gc";
  if (c === "gamecube") return "gamecube";
  if (c === "wii") return "wii";
  if (c === "n64") return "n64";
  if (c === "nes") return "nes";
  if (c === "snes") return "snes";
  if (c === "ps2" || c === "playstation 2") return "ps2";
  if (c === "ps1" || c === "playstation 1") return "ps1";
  return null;
}

const SERIAL_FIRST_CONSOLES = new Set(["ps1", "ps2", "wii_gc"]);
const GENERIC_SERIALS = new Set(["NES", "N64", "SNES"]);
const MISSING_COVER_PATH = "icons/missing.webp";

function hasCover(g) {
  // If no index is loaded, assume covers are present so we don't hide everything.
  if (!coverIndex) return true;
  const url = getCoverUrl(g);
  return url && url !== MISSING_COVER_PATH;
}

function getCoverUrl(g) {
  if (!coverIndex) return MISSING_COVER_PATH;
  const key = getConsoleKey(g.console);
  if (!key) return MISSING_COVER_PATH;

  const bySerialForConsole =
    (coverIndex.bySerial && coverIndex.bySerial[key]) || {};
  const byTitleForConsole =
    (coverIndex.byTitle && coverIndex.byTitle[key]) || {};

  const rawSerial = (g.serial || "").toUpperCase().trim();
  const isSerialConsole = SERIAL_FIRST_CONSOLES.has(key);
  const isGenericSerial = GENERIC_SERIALS.has(rawSerial);

  // 1) Serial-first for certain consoles if serial is meaningful
  if (isSerialConsole && rawSerial && !isGenericSerial) {
    const byS = bySerialForConsole[rawSerial];
    if (byS) return byS;
  }

  // 2) Fallback to normalized title
  const normTitle = normalizeTitleForIndex(g.title || "");
  if (normTitle) {
    const byT = byTitleForConsole[normTitle];
    if (byT) return byT;
  }

  // 3) Placeholder
  return MISSING_COVER_PATH;
}

function setupCoverObserver() {
  if (coverObserver || !("IntersectionObserver" in window)) return;
  coverObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target;
        const src = img.dataset.src;
        if (src) {
          img.src = src;
          img.removeAttribute("data-src");
        }
        coverObserver.unobserve(img);
      }
    },
    {
      root: els.listScroll || null,
      rootMargin: "100px 0px",
      threshold: 0.01,
    }
  );
}

function setViewMode(mode) {
  if (viewMode === mode) return;
  viewMode = mode;

  // Adjust default sort per mode
  if (els.sortBy) {
    if (viewMode === "grid" && els.sortBy.value !== "random") {
      els.sortBy.value = "random";
    } else if (viewMode === "list" && els.sortBy.value === "random") {
      els.sortBy.value = "title";
    }
  }

  updateViewModeUI();
  // Re-run filters to apply new sort + view mode
  applyFilters();
}

function updateViewModeUI() {
  if (els.viewToggle) {
    els.viewToggle.textContent = viewMode === "grid" ? "List view" : "Grid view";
  }
  if (els.list) {
    els.list.classList.toggle("grid-view", viewMode === "grid");
  }
  document.body.classList.toggle("grid-mode", viewMode === "grid");
}

function norm(s) {
  return (s || "").toLowerCase().trim();
}

function unique(arr) {
  return Array.from(new Set(arr)).sort((a,b) => a.localeCompare(b));
}

function showToast(text) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 900);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied!");
  } catch {
    // Fallback for older browsers or non-https contexts (Pages is https, so usually fine)
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    showToast("Copied!");
  }
}

function renderConsoles() {
  els.consoleFilter.innerHTML = `<option value="">All consoles</option>`;
  for (const c of consoles) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    els.consoleFilter.appendChild(opt);
  }
}

function getConsoleStyle(consoleName) {
  const c = CONSOLE_CONFIG[consoleName];
  if (!c) return { icon: null, color: "var(--panel)", textDark: false };
  const isLight = c.color === "#f8fafc" || c.color.toLowerCase().startsWith("#f");
  return {
    icon: "icons/" + c.icon,
    color: c.color,
    textDark: isLight,
  };
}

const displayText = (g) => g.display || `${g.title} [${g.serial}]`;

function createCard(g) {
  const style = getConsoleStyle(g.console);
  const li = document.createElement("li");
  li.className = "card";
  li.style.borderLeftColor = style.color;

  const iconWrap = document.createElement("div");
  iconWrap.className = "card-icon";
  if (style.icon) {
    const img = document.createElement("img");
    img.src = style.icon;
    img.alt = g.console;
    img.loading = "lazy";
    img.onerror = () => { img.remove(); iconWrap.classList.add("no-icon"); };
    iconWrap.appendChild(img);
  } else {
    iconWrap.classList.add("no-icon");
  }

  const titleBox = document.createElement("div");
  titleBox.className = "card-title-box";
  titleBox.style.backgroundColor = style.color;
  if (style.textDark) titleBox.classList.add("text-dark");

  const titleSpan = document.createElement("span");
  titleSpan.className = "card-title";
  titleSpan.textContent = g.title;
  const serialSpan = document.createElement("span");
  serialSpan.className = "card-serial";
  serialSpan.textContent = ` [${g.serial}]`;
  titleBox.appendChild(titleSpan);
  titleBox.appendChild(serialSpan);

  const btn = document.createElement("button");
  btn.className = "copy";
  btn.type = "button";
  btn.textContent = "Copy";
  btn.addEventListener("click", () => copyText(displayText(g)));

  li.appendChild(iconWrap);
  li.appendChild(titleBox);
  li.appendChild(btn);
  return li;
}

function createGridTile(g) {
  const li = document.createElement("li");
  li.className = "grid-tile";

  const img = document.createElement("img");
  img.className = "grid-cover-img";
  img.alt = g.title || "";
  img.loading = "lazy";

  const coverUrl = getCoverUrl(g);
  img.dataset.src = coverUrl;

  const consoleKey = getConsoleKey(g.console);
  // For PS2 (and optionally PS1 / Wii+GC shared set), use contain so the full cover shows.
  if (consoleKey === "ps2" || consoleKey === "ps1" || consoleKey === "wii_gc") {
    img.classList.add("fit-contain");
  }

  if (coverUrl === MISSING_COVER_PATH) {
    li.classList.add("missing-cover");
  }
  // Immediately set src for visible tiles so images stay present while scrolling
  // IntersectionObserver will still manage lazy loading behavior for future tiles.
  img.src = coverUrl;

  const overlay = document.createElement("div");
  overlay.className = "grid-overlay";
  const text = document.createElement("span");
  text.className = "grid-overlay-text";
  text.textContent = displayText(g);
  overlay.appendChild(text);

  li.title = displayText(g);
  li.appendChild(img);
  li.appendChild(overlay);

  li.addEventListener("click", () => copyText(displayText(g)));

  if (coverObserver) {
    coverObserver.observe(img);
  } else {
    img.src = coverUrl;
  }

  return li;
}

function updateVirtualList() {
  if (!els.listScroll || !els.listInner || !els.listWindow) return;

  if (!filteredItems.length) {
    els.listInner.style.height = "0";
    els.list.innerHTML = "";
    return;
  }

  if (viewMode === "grid") {
    const listStyle = getComputedStyle(els.list);
    const gapPx =
      parseFloat(listStyle.columnGap || listStyle.gap || "0") || 0;

    const tileW = getGridTileWidth();
    const tileH = tileW * (736 / 512); // PS2 ratio (H = W * 736/512)
    const rowH = tileH + gapPx;

    const items = gridItems || filteredItems;
    const totalItems = items.length;
    const scrollTop = els.listScroll.scrollTop;
    const containerHeight = els.listScroll.clientHeight;
    const containerWidth = els.listScroll.clientWidth || 1;

    const cols = Math.max(
      1,
      Math.floor((containerWidth + gapPx) / (tileW + gapPx))
    );
    const totalRows = Math.ceil(totalItems / cols);

    const startRow = Math.max(
      0,
      Math.floor(scrollTop / rowH) - GRID_OVERSCAN_ROWS
    );
    const endRow = Math.min(
      totalRows,
      Math.ceil((scrollTop + containerHeight) / rowH) + GRID_OVERSCAN_ROWS
    );

    els.listInner.style.height = `${totalRows * rowH}px`;
    els.listWindow.style.top = `${startRow * rowH}px`;
    els.listWindow.style.height = `${(endRow - startRow) * rowH}px`;

    const startIndex = startRow * cols;
    const endIndex = Math.min(totalItems, endRow * cols);

    els.list.innerHTML = "";
    for (let i = startIndex; i < endIndex; i++) {
      const g = items[i];
      if (!g) continue;
      els.list.appendChild(createGridTile(g));
    }
    // No A–Z highlight in grid mode
    return;
  }

  // List mode (existing behavior)
  const rowH = getRowHeight();
  const total = filteredItems.length;
  const scrollTop = els.listScroll.scrollTop;
  const containerHeight = els.listScroll.clientHeight;
  const start = Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN);
  const end = Math.min(
    total,
    Math.ceil((scrollTop + containerHeight) / rowH) + OVERSCAN
  );

  els.listInner.style.height = `${total * rowH}px`;
  els.listWindow.style.top = `${start * rowH}px`;
  els.listWindow.style.height = `${(end - start) * rowH}px`;

  els.list.innerHTML = "";
  for (let i = start; i < end; i++) {
    els.list.appendChild(createCard(filteredItems[i]));
  }

  if (els.sortBy.value === "title" && els.azJump && !els.azJump.hidden) {
    const display = (g) => (g.display || g.title || "").toLowerCase();
    const firstCh = (display(filteredItems[start])[0] || "").toUpperCase();
    let currentLetter = null;
    if (/\d/.test(firstCh)) currentLetter = "#";
    else {
      for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
        if (letterIndex[letter] !== undefined && letterIndex[letter] <= start)
          currentLetter = letter;
      }
    }
    els.azJump.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("current", btn.dataset.letter === currentLetter);
    });
  }
}

function buildLetterIndex() {
  letterIndex = {};
  const display = (g) => (g.display || g.title || "").toLowerCase();
  for (let i = 0; i < filteredItems.length; i++) {
    const ch = (display(filteredItems[i])[0] || "").toUpperCase();
    if (/\d/.test(ch)) {
      if (letterIndex["#"] === undefined) letterIndex["#"] = i;
    } else if (/[A-Z]/.test(ch) && letterIndex[ch] === undefined) {
      letterIndex[ch] = i;
    }
  }
}

function renderAzJump() {
  els.azJump.innerHTML = "";
  if (viewMode === "grid" || els.sortBy.value !== "title" || filteredItems.length === 0) {
    els.azJump.hidden = true;
    return;
  }
  els.azJump.hidden = false;
  const addBtn = (key, label) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.dataset.letter = key;
    btn.disabled = letterIndex[key] === undefined;
    btn.addEventListener("click", () => {
      const idx = letterIndex[key];
      if (idx != null) els.listScroll.scrollTop = idx * getRowHeight();
    });
    els.azJump.appendChild(btn);
  };
  addBtn("#", "#");
  for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") addBtn(letter, letter);
}

function applyFilters() {
  const q = norm(els.search.value);
  const c = els.consoleFilter.value;
  const sort = els.sortBy.value;
  const searchText = getSearchText();

  let items = allGames;

  if (c) items = items.filter(g => g.console === c);

  if (q) items = items.filter(g => norm(g.title).includes(q));

  let sorted = [...items];
  let effectiveSort = sort;

  // In grid view, switch to alphabetical when searching, back to random when cleared.
  if (viewMode === "grid" && els.sortBy) {
    if (searchText.length > 0 && effectiveSort === "random") {
      effectiveSort = "title";
      els.sortBy.value = "title";
    } else if (searchText.length === 0 && effectiveSort === "title") {
      effectiveSort = "random";
      els.sortBy.value = "random";
    }
  }

  if (effectiveSort === "title") {
    sorted.sort((a, b) => {
      const da = (a.display || `${a.title} [${a.serial}]`).toLowerCase();
      const db = (b.display || `${b.title} [${b.serial}]`).toLowerCase();
      return da.localeCompare(db);
    });
  } else if (effectiveSort === "console") {
    sorted.sort((a, b) => {
      const cc = (a.console || "").localeCompare(b.console || "");
      if (cc !== 0) return cc;
      const da = (a.display || a.title).toLowerCase();
      const db = (b.display || b.title).toLowerCase();
      return da.localeCompare(db);
    });
  } else if (effectiveSort === "random") {
    // Fisher–Yates shuffle for random but deterministic within this call
    for (let i = sorted.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    }
  }

  items = sorted;
  filteredItems = items;

  // For grid view, optionally hide missing covers unless the user is searching
  if (viewMode === "grid") {
    const searchText = getSearchText();
    const showMissing = searchText.length >= 2;
    if (showMissing) {
      gridItems = filteredItems;
      els.status.textContent = `${filteredItems.length.toLocaleString()} / ${allGames.length.toLocaleString()}`;
    } else {
      gridItems = filteredItems.filter(hasCover);
      const visible = gridItems.length;
      els.status.textContent =
        `${visible.toLocaleString()} / ${filteredItems.length.toLocaleString()} (missing covers hidden; type 2+ letters to include)`;
    }
  } else {
    gridItems = null;
    els.status.textContent = `${items.length.toLocaleString()} / ${allGames.length.toLocaleString()}`;
  }

  if (els.listScroll) els.listScroll.scrollTop = 0;
  if (els.sortBy.value === "title") buildLetterIndex();
  renderAzJump();
  updateVirtualList();
}

async function loadJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

async function init() {
  // Load config (if missing, default to "show all")
  let config = { visibleConsoles: [] };
  try {
    config = await loadJson("./config.json");
  } catch (e) {
    console.warn("No config.json found; showing all consoles.");
  }

  allGames = await loadJson("./games.json");

  // Keep only games that have a real serial
  allGames = allGames.filter(g => typeof g.serial === "string" && g.serial.trim().length > 0);

  // Apply console visibility: config.consoles = { "GameCube": true, "PS2": false, ... }
  const cons = config.consoles;
  if (cons && typeof cons === "object") {
    allGames = allGames.filter(g => cons[g.console] === true);
  }

  consoles = unique(allGames.map(g => g.console).filter(Boolean));
  renderConsoles();

  // Try to load cover index (optional)
  try {
    coverIndex = await loadJson("./docs/coverIndex.json");
  } catch (e) {
    console.warn("No coverIndex.json found; covers will use placeholder.", e);
  }

  els.search.addEventListener("input", applyFilters);
  els.consoleFilter.addEventListener("change", applyFilters);
  els.sortBy.addEventListener("change", applyFilters);
  if (els.viewToggle) {
    els.viewToggle.addEventListener("click", () => {
      setViewMode(viewMode === "list" ? "grid" : "list");
    });
  }

  if (els.listScroll) {
    setupCoverObserver();
    els.listScroll.addEventListener("scroll", () => {
      if (scrollRAF) cancelAnimationFrame(scrollRAF);
      scrollRAF = requestAnimationFrame(() => {
        updateVirtualList();
        scrollRAF = null;
      });
    }, { passive: true });
    window.addEventListener("resize", () => {
      if (scrollRAF) cancelAnimationFrame(scrollRAF);
      scrollRAF = requestAnimationFrame(() => {
        updateVirtualList();
        scrollRAF = null;
      });
    });
  }

  updateViewModeUI();

  // Initial sort defaults per view mode
  if (els.sortBy) {
    els.sortBy.value = viewMode === "grid" ? "random" : "title";
  }

  applyFilters();

  // Global wheel handler: scroll the virtualized list when wheel events
  // happen outside the listScroll container (but not when interacting with inputs).
  window.addEventListener(
    "wheel",
    (event) => {
      if (!els.listScroll) return;

      const target = event.target;
      const tag = target && target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") {
        return;
      }

      // If the wheel event originated inside the scroll container, let it behave normally
      if (els.listScroll.contains(target)) {
        return;
      }

      // Forward the scroll to the virtualized list container
      event.preventDefault();
      els.listScroll.scrollTop += event.deltaY;
    },
    { passive: false }
  );
}

init().catch(err => {
  console.error(err);
  els.status.textContent = "Failed to load games.json";
});
