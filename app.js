const $ = (sel) => document.querySelector(sel);

// Console icon path (icons/ folder) and box color. Add your icon files: gamecube.png, wii.png, ps1.png, ps2.png
const CONSOLE_CONFIG = {
  GameCube:    { icon: "gamecube.png", color: "#6d28d9" },   // purple
  Wii:         { icon: "wii.png",       color: "#f8fafc" },  // white
  "PlayStation 1": { icon: "ps1.png",   color: "#9ca3af" },  // gray
  "PlayStation 2": { icon: "ps2.png",   color: "#1a2930" },   // dark gray
  PS2:         { icon: "ps2.png",       color: "#374151" },
  PS1:         { icon: "ps1.png",       color: "#9ca3af" },
};

const els = {
  search: $("#search"),
  consoleFilter: $("#consoleFilter"),
  onlyStartsWith: $("#onlyStartsWith"),
  list: $("#list"),
  status: $("#status"),
};

let allGames = [];
let consoles = [];

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

function renderList(items) {
  els.list.innerHTML = "";
  for (const g of items) {
    const style = getConsoleStyle(g.console);

    const card = document.createElement("div");
    card.className = "card";

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

    const displayText = g.display || `${g.title} [${g.serial}]`;

    const titleBox = document.createElement("div");
    titleBox.className = "card-title-box";
    titleBox.style.backgroundColor = style.color;
    if (style.textDark) titleBox.classList.add("text-dark");

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = displayText;
    titleBox.appendChild(title);

    const btn = document.createElement("button");
    btn.className = "copy";
    btn.type = "button";
    btn.textContent = "Copy";
    btn.addEventListener("click", () => copyText(displayText));

    card.appendChild(iconWrap);
    card.appendChild(titleBox);
    card.appendChild(btn);
    els.list.appendChild(card);
  }
}

function applyFilters() {
  const q = norm(els.search.value);
  const c = els.consoleFilter.value;
  const startsWith = els.onlyStartsWith.checked;

  let items = allGames;

  if (c) items = items.filter(g => g.console === c);

  if (q) {
    items = items.filter(g => {
      const t = norm(g.title);
      return startsWith ? t.startsWith(q) : t.includes(q);
    });
  }

  els.status.textContent = `${items.length.toLocaleString()} / ${allGames.length.toLocaleString()} shown`;
  renderList(items);
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
  els.onlyStartsWith.addEventListener("change", applyFilters);

  applyFilters();
}

init().catch(err => {
  console.error(err);
  els.status.textContent = "Failed to load games.json";
});
