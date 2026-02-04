# Game Library

Static game list with search, filter by console, sort, and copy (title + serial).

## View locally

From the project folder, start an HTTP server so the site loads correctly (fetching `games.json` requires HTTP).

**Option A – Python (if you have Python):**
```bash
cd C:\Users\izidore\Desktop\CODING\GamesList
python -m http.server 8080
```
Then open: **http://localhost:8080**

**Option B – Node (if you have Node/npm):**
```bash
cd C:\Users\izidore\Desktop\CODING\GamesList
npx serve -l 8080
```
Then open: **http://localhost:8080**

Stop the server with **Ctrl+C** in the terminal.

---

## Adding more systems and games

### 1. Add a list file for each system

In the **`lists/`** folder, create one **`.txt`** file per console. The **filename (without .txt)** is the console name shown in the app.

- Existing: `GameCube.txt`, `Wii.txt`, `PS2.txt`
- Example for a new system: `N64.txt` or `PS1.txt`

### 2. Format of each line

Each line = one game. Include the **serial in brackets** so the script can parse it.

**Supported serial formats:**
- `[SLUS-20265]` / `[SCUS-94677]` (PlayStation-style)
- `[GW7E69]` / `[RMCE01]` (6-character disc IDs)

**Examples:**
```
007 - Agent Under Fire [GW7E69]
Super Mario 64 [NUS-006]
```

Lines without a matching serial are still added but will have no serial (and may be filtered out by the site if it only shows entries with serials). You can use blank lines or lines of `-----` as separators; they’re ignored.

### 3. Rebuild `games.json`

From the **project root** (the folder that contains `lists/`):

```bash
python lists/make_games_json.py
```

This reads all `*.txt` files in `lists/`, merges and dedupes them, and writes **`games.json`** in the project root (so the website loads it).

### 4. (Optional) Show the new console in the app

- **Filter dropdown:** The new console appears automatically in “All consoles” and the filter once it’s in `games.json`.
- **Icons and colors:** In **`app.js`**, add an entry to **`CONSOLE_CONFIG`** for the new console name (same as the `.txt` filename without `.txt`), e.g.:
  ```js
  N64: { icon: "n64.png", color: "#333333" },
  ```
  Then add the image (e.g. `n64.png`) in the **`icons/`** folder.
- **Config filter:** If you use **`config.json`** with `visibleConsoles`, add the new console name there if you want it included when that filter is used, e.g.:
  ```json
  "visibleConsoles": ["PS2", "GameCube", "N64"]
  ```

After that, refresh the site (or restart the local server) to see the new systems and games.

---

## Cover index for box art (grid view)

Game cover images live under the **`Covers/`** folder, grouped by console, e.g.:

- `Covers/gamecube/...`
- `Covers/ps2/...`
- `Covers/wii/...`

Filenames can be serial-based, title-based, or `Title [Serial]`. To avoid guessing at runtime, a small index file is built ahead of time.

### Build the cover index

From the project root:

```bash
npm run build:index
```

This scans `Covers/**` for image files (`.webp`, `.png`, `.jpg`, `.jpeg`) and writes a JSON index to:

- `docs/coverIndex.json`

The site loads this file at runtime to map each game (by console + serial/title) to a cover image without doing lots of network 404 probes.

Run `npm run build:index` any time you add, remove, or rename cover images before committing or deploying.
