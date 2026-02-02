import json
import re
from pathlib import Path

# Matches either:
#  - [SLUS-20265] / [SCUS-94677] etc
#  - [RMCE01] / [GMSE01] etc (6-char disc IDs)
#  - [N64] / [NES] etc (short console codes, 2–5 chars)
SERIAL_RE = re.compile(r"\[((?:[A-Z]{3,5}-\d{3,6})|(?:[A-Z0-9]{6})|(?:[A-Z0-9]{2,5}))\]", re.I)


def parse_file(txt_path: Path):
    console = txt_path.stem  # "PS2" from PS2.txt, etc.
    lines = txt_path.read_text(encoding="utf-8", errors="ignore").splitlines()

    games = []
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        # ignore divider lines like ----- if they exist
        if set(line) <= set("-=_*"):
            continue

        m = SERIAL_RE.search(line)
        serial = m.group(1) if m else None

        title = SERIAL_RE.sub("", line).strip()
        title = re.sub(r"\s{2,}", " ", title).strip()

        if not title:
            continue

        games.append({
            "title": title,
            "console": console,
            "serial": serial,
            "display": line
        })
    return games

def dedupe(games):
    """Remove duplicates by (console, serial, title) so games sharing a serial (e.g. [N64]) all stay."""
    seen = set()
    out = []
    for g in games:
        key = (g["console"], g["serial"] or "", g["title"].lower())
        if key in seen:
            continue
        seen.add(key)
        out.append(g)
    return out

def main():
    here = Path(__file__).resolve().parent
    txt_files = sorted(here.glob("*.txt"))

    if not txt_files:
        print(f"No .txt files found in: {here}")
        print("Put GameCube.txt / PS2.txt / Wii.txt in the same folder as this script.")
        return

    all_games = []
    for f in txt_files:
        parsed = parse_file(f)
        print(f"Parsed {len(parsed)} from {f.name}")
        all_games.extend(parsed)

    all_games = dedupe(all_games)
    all_games.sort(key=lambda g: (g["console"], g["title"].lower()))

    # Write to project root so the website loads it
    out_path = here.parent / "games.json"
    out_path.write_text(json.dumps(all_games, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\nWrote {len(all_games)} total -> {out_path}")

if __name__ == "__main__":
    main()
