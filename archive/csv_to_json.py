"""
csv_to_json.py — Convert CARDS.csv to CARDS.json
Mirrors PORTFOLIO.json's section/items schema so the site can
load deck data from JSON instead of CSV.

Usage:
    python csv_to_json.py                  # reads CARDS.csv, writes CARDS.json
    python csv_to_json.py -i input.csv     # custom input
    python csv_to_json.py -o output.json   # custom output
"""

import csv
import json
import argparse
from pathlib import Path
from collections import OrderedDict


# ── Column map: CSV header → JSON key ──────────────────────────
COLUMN_MAP = OrderedDict([
    ("deck",                 "deck"),
    ("card name",            "cardName"),
    ("category",             "category"),
    ("secondary categories", "secondaryCategories"),
    ("label",                "label"),
    ("modifier",             "modifier"),
    ("salt",                 "salt"),
    ("color",                "color"),
    ("cmc",                  "cmc"),
    ("rarity",               "rarity"),
    ("types",                "types"),
    ("price",                "price"),
    ("card text",            "cardText"),
    ("art",                  "art"),
])

# Fields that should be stored as numbers
NUMERIC_FIELDS = {"salt", "cmc", "price"}


def parse_value(key: str, raw: str):
    """Convert a raw CSV string to its typed JSON value."""
    stripped = raw.strip()
    if not stripped:
        return None
    if key in NUMERIC_FIELDS:
        # handle "null" string from CSV
        if stripped.lower() == "null":
            return None
        try:
            return int(stripped) if "." not in stripped else float(stripped)
        except ValueError:
            return stripped
    # "types" and "color" are comma-separated lists
    if key in ("types", "color", "secondaryCategories"):
        parts = [p.strip() for p in stripped.split(",") if p.strip()]
        return parts if len(parts) > 1 else (parts[0] if parts else None)
    return stripped


def build_card(row: dict) -> dict:
    """Turn one CSV row into a card object."""
    card = {}
    for csv_col, json_key in COLUMN_MAP.items():
        raw = row.get(csv_col, "")
        val = parse_value(json_key, raw)
        if val is not None:
            card[json_key] = val
    return card


def csv_to_json(csv_path: Path) -> dict:
    """
    Read CARDS.csv and produce a dict shaped like PORTFOLIO.json:
    {
      "sections": [
        {
          "id": "<deck-id>",
          "count": <n>,
          "items": [ { card }, ... ]
        },
        ...
      ]
    }
    Cards are grouped by deck ID and ordered as they appear in the CSV.
    """
    decks: OrderedDict[str, list] = OrderedDict()

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            card = build_card(row)
            deck_id = card.pop("deck", "unknown")
            decks.setdefault(deck_id, []).append(card)

    sections = []
    for deck_id, cards in decks.items():
        sections.append({
            "id": deck_id,
            "count": len(cards),
            "items": cards,
        })

    return {"sections": sections}


def main():
    parser = argparse.ArgumentParser(
        description="Convert CARDS.csv → CARDS.json (PORTFOLIO.json schema)"
    )
    parser.add_argument(
        "-i", "--input",
        default="CARDS.csv",
        help="Path to input CSV (default: CARDS.csv)",
    )
    parser.add_argument(
        "-o", "--output",
        default="CARDS.json",
        help="Path to output JSON (default: CARDS.json)",
    )
    parser.add_argument(
        "--indent",
        type=int,
        default=2,
        help="JSON indentation (default: 2, use 0 for compact)",
    )
    args = parser.parse_args()

    csv_path = Path(args.input)
    if not csv_path.exists():
        raise FileNotFoundError(f"Input file not found: {csv_path}")

    data = csv_to_json(csv_path)

    indent = args.indent if args.indent > 0 else None
    out_path = Path(args.output)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=indent, ensure_ascii=False)

    # Summary
    total = sum(s["count"] for s in data["sections"])
    deck_names = [s["id"] for s in data["sections"]]
    print(f"✓ Wrote {out_path}  —  {total} cards across {len(deck_names)} deck(s): {', '.join(deck_names)}")


if __name__ == "__main__":
    main()
