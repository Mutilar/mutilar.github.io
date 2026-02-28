"""
generate-cards-new.py
=====================
Transforms CARDS.json → CARDS_NEW.json with:
  - UPPERCASE keys (PORTFOLIO-style)
  - Emoji representations for TYPE, RARITY, COLOR
  - ID field = slugified cardName (matches card_art folder name)
  - Removed: cardText, art
  - WHISPER preserved as-is

Usage:
    python archive/tools/generate-cards-new.py
"""

import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CARDS_JSON = os.path.join(ROOT, "CARDS.json")
OUTPUT_JSON = os.path.join(ROOT, "CARDS_NEW.json")

# ── emoji maps ───────────────────────────────────────────────────────────────

TYPE_EMOJI = {
    "Creature":    "🧛",
    "Instant":     "⚡",
    "Sorcery":     "🔮",
    "Enchantment": "🌩️",
    "Artifact":    "✨",
    "Land":        "⛈️",
}

RARITY_EMOJI = {
    "mythic":   "🟠",
    "rare":     "🟡",
    "uncommon": "🔵",
    "common":   "⚪",
}

COLOR_EMOJI = {
    "Black":     "⚫",
    "White":     "⚪",
    "Red":       "🔴",
    "Blue":      "🔵",
    "Green":     "🟢",
    "Colorless": "💎",
}


# ── slugify (same as organize-card-art.py) ───────────────────────────────────

def slugify(name: str) -> str:
    s = name
    s = re.sub(r"[''`]", "", s)
    s = s.replace("ñ", "n").replace("é", "e").replace("á", "a").replace("ó", "o").replace("ú", "u").replace("í", "i")
    s = re.sub(r"[-,;:./\\()!?&\"]+", "_", s)
    s = s.replace(" ", "_")
    s = re.sub(r"[^a-zA-Z0-9_]", "", s)
    s = re.sub(r"_+", "_", s)
    s = s.strip("_")
    s = s.lower()
    return s


# ── convert types ────────────────────────────────────────────────────────────

def convert_type(types):
    if isinstance(types, list):
        return "".join(TYPE_EMOJI.get(t, t) for t in types)
    return TYPE_EMOJI.get(types, types)


# ── convert color ────────────────────────────────────────────────────────────

def convert_color(color):
    if color is None:
        return "💎"  # no color specified → colorless
    if isinstance(color, list):
        return "".join(COLOR_EMOJI.get(c, c) for c in color)
    return COLOR_EMOJI.get(color, color)


# ── transform a single card item ────────────────────────────────────────────

def transform_item(item: dict) -> dict:
    new = {}
    new["ID"]       = slugify(item["cardName"])
    new["NAME"]     = item["cardName"]
    new["WHISPER"]  = item.get("whisper", "")
    new["CATEGORY"] = item.get("category", "")
    new["SALT"]     = item.get("salt", 0)
    new["COLOR"]    = convert_color(item.get("color"))
    new["CMC"]      = item.get("cmc", 0)
    new["RARITY"]   = RARITY_EMOJI.get(item.get("rarity", ""), item.get("rarity", ""))
    new["TYPE"]     = convert_type(item.get("types", ""))
    new["PRICE"]    = item.get("price", 0)

    # Preserve secondaryCategories if present
    if "secondaryCategories" in item:
        new["SECONDARY_CATEGORIES"] = item["secondaryCategories"]

    return new


# ── main ─────────────────────────────────────────────────────────────────────

with open(CARDS_JSON, "r", encoding="utf-8") as f:
    data = json.load(f)

new_data = {"sections": []}

for section in data["sections"]:
    new_section = {
        "id": section["id"],
        "count": section.get("count", len(section["items"])),
        "items": [transform_item(item) for item in section["items"]]
    }
    new_data["sections"].append(new_section)

with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
    json.dump(new_data, f, indent=2, ensure_ascii=False)

# ── summary ──────────────────────────────────────────────────────────────────

total_cards = sum(len(s["items"]) for s in new_data["sections"])
print(f"✅ Generated {OUTPUT_JSON}")
print(f"   {len(new_data['sections'])} sections, {total_cards} total cards")
print()
print("Sample output (first card):")
first = new_data["sections"][0]["items"][0]
print(json.dumps(first, indent=4, ensure_ascii=False))
