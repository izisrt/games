const $ = (sel) => document.querySelector(sel);

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

function renderList(items) {
  els.list.innerHTML = "";
  for (const g of items) {
    const card = document.createElement("div");
    card.className = "card";

    const left = document.createElement("div");
    const title = document.createElement("p");
    title.className = "title";
    title.textContent = g.title;

    const meta = document.createElement("div");
    meta.className = "meta";

    // If you ever want multiple consoles per game, make console an array and map here.
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = g.console;
    meta.appendChild(tag);

    left.appendChild(title);
    left.appendChild(meta);

    const btn = document.createElement("button");
    btn.className = "copy";
    btn.type = "button";
    btn.textContent = "Copy";
    btn.addEventListener("click", () => copyText(g.title));

    card.appendChild(left);
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

async function init() {
  const res = await fetch("./games.json", { cache: "no-store" });
  allGames = await res.json();

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
