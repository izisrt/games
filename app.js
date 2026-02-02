const $ = (sel) => document.querySelector(sel);

// Console icon path (icons/ folder) and box color. Add your icon files: gamecube.png, wii.png, ps1.png, ps2.png, n64.png, nes.png, snes.png
const CONSOLE_CONFIG = {
  GameCube:    { icon: "gamecube.png", color: "#695BAE" },   // purple
  Wii:         { icon: "wii.png",       color: "#f8fafc" },  // white
  N64:         { icon: "n64.png",       color: "#01942C" },
  NES:         { icon: "nes.png",       color: "#FF0000" },  // gray
  SNES:        { icon: "snes.png",      color: "#B0ACE1" },  // dark gray
  "PlayStation 1": { icon: "ps1.png",   color: "#9ca3af" },  // gray
  "PlayStation 2": { icon: "ps2.png",   color: "#1a2930" },   // dark gray
  PS2:         { icon: "ps2.png",       color: "#374151" },
  PS1:         { icon: "ps1.png",       color: "#9ca3af" },
};

const OVERSCAN = 8;

function getRowHeight() {
  const px = getComputedStyle(document.documentElement).getPropertyValue("--row-height").trim();
  return px ? parseFloat(px) || 50 : 50;
}

const els = {
  search: $("#search"),
  consoleFilter: $("#consoleFilter"),
  sortBy: $("#sortBy"),
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

function updateVirtualList() {
  if (!els.listScroll || !els.listInner || !els.listWindow) return;
  if (!filteredItems.length) {
    els.listInner.style.height = "0";
    els.list.innerHTML = "";
    return;
  }
  const rowH = getRowHeight();
  const total = filteredItems.length;
  const scrollTop = els.listScroll.scrollTop;
  const containerHeight = els.listScroll.clientHeight;
  const start = Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN);
  const end = Math.min(total, Math.ceil((scrollTop + containerHeight) / rowH) + OVERSCAN);

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
        if (letterIndex[letter] !== undefined && letterIndex[letter] <= start) currentLetter = letter;
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
  if (els.sortBy.value !== "title" || filteredItems.length === 0) {
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

  let items = allGames;

  if (c) items = items.filter(g => g.console === c);

  if (q) items = items.filter(g => norm(g.title).includes(q));

  if (sort === "title") {
    items = [...items].sort((a, b) => {
      const da = (a.display || `${a.title} [${a.serial}]`).toLowerCase();
      const db = (b.display || `${b.title} [${b.serial}]`).toLowerCase();
      return da.localeCompare(db);
    });
  } else {
    items = [...items].sort((a, b) => {
      const cc = (a.console || "").localeCompare(b.console || "");
      if (cc !== 0) return cc;
      const da = (a.display || a.title).toLowerCase();
      const db = (b.display || b.title).toLowerCase();
      return da.localeCompare(db);
    });
  }

  filteredItems = items;
  els.status.textContent = `${items.length.toLocaleString()} / ${allGames.length.toLocaleString()}`;

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

  // Apply console visibility allowlist
  const allow = (config.visibleConsoles || []).map(s => s.trim()).filter(Boolean);
  if (allow.length > 0) {
    const allowSet = new Set(allow.map(s => s.toLowerCase()));
    allGames = allGames.filter(g => allowSet.has((g.console || "").toLowerCase()));
  }

  consoles = unique(allGames.map(g => g.console).filter(Boolean));
  renderConsoles();

  els.search.addEventListener("input", applyFilters);
  els.consoleFilter.addEventListener("change", applyFilters);
  els.sortBy.addEventListener("change", applyFilters);

  if (els.listScroll) {
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

  applyFilters();
}

init().catch(err => {
  console.error(err);
  els.status.textContent = "Failed to load games.json";
});
