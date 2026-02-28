"""
organize-card-art.py
====================
Reorganizes images/card_art/ folders:

1. Reads CARDS.json to find dual-sided card pairs (two cardNames sharing one art folder).
2. Splits dual-sided folders into two separate folders, each getting the shared image as "art.png".
3. Renames all folders to a clean slug: lowercase, no punctuation, spaces/hyphens → underscores.
4. Renames the image inside each folder to "art.png".

Run with --dry-run (default) to preview, then --execute to apply.

Usage:
    python archive/tools/organize-card-art.py              # dry-run (preview only)
    python archive/tools/organize-card-art.py --execute    # actually move files
"""

import json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CARD_ART_DIR = os.path.join(ROOT, "images", "card_art")
CARDS_JSON = os.path.join(ROOT, "CARDS.json")

DRY_RUN = "--execute" not in sys.argv


# ── helpers ──────────────────────────────────────────────────────────────────

def slugify(name: str) -> str:
    """
    Convert a card name to a clean folder slug.
    "Legion's Landing" → "legions_landing"
    "Clavileño, First of the Blessed" → "clavileno_first_of_the_blessed"
    "Glass-Cast Heart" → "glass_cast_heart"
    "Sidequest: Catch a Fish" → "sidequest_catch_a_fish"
    "Agadeem, the Undercrypt" → "agadeem_the_undercrypt"
    """
    s = name
    # Remove apostrophes / curly quotes
    s = re.sub(r"[''`]", "", s)
    # Replace accented chars (ñ→n, etc.)
    s = s.replace("ñ", "n").replace("é", "e").replace("á", "a").replace("ó", "o").replace("ú", "u").replace("í", "i")
    # Replace hyphens, commas, colons, periods, slashes, and other separators with underscore
    s = re.sub(r"[-,;:./\\()!?&\"]+", "_", s)
    # Replace spaces with underscores
    s = s.replace(" ", "_")
    # Remove any remaining non-alphanumeric/underscore characters
    s = re.sub(r"[^a-zA-Z0-9_]", "", s)
    # Collapse multiple underscores
    s = re.sub(r"_+", "_", s)
    # Strip leading/trailing underscores
    s = s.strip("_")
    # Lowercase
    s = s.lower()
    return s


def find_image_files(folder_path: str) -> list:
    """Return list of image filenames in a folder."""
    if not os.path.isdir(folder_path):
        return []
    return [f for f in os.listdir(folder_path)
            if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".gif"))]


# ── load CARDS.json to build dual-side mappings ──────────────────────────────

with open(CARDS_JSON, "r", encoding="utf-8") as f:
    cards_data = json.load(f)

# Build: art_folder_name → [cardName, cardName, ...]
# art path looks like "images/card_art/Fell_the_Profane_Fell_Mire/something.png"
art_folder_to_cards = {}
card_to_art_folder = {}
card_to_art_file = {}

for section in cards_data["sections"]:
    for item in section["items"]:
        card_name = item["cardName"]
        art = item.get("art", "")
        if not art:
            continue
        # Extract the folder name from the art path
        parts = art.replace("\\", "/").split("/")
        # e.g. ["images", "card_art", "Fell_the_Profane_Fell_Mire", "filename.png"]
        if len(parts) >= 4 and parts[1] == "card_art":
            folder_name = parts[2]
            file_name = parts[3]
        else:
            continue

        if folder_name not in art_folder_to_cards:
            art_folder_to_cards[folder_name] = []
        if card_name not in art_folder_to_cards[folder_name]:
            art_folder_to_cards[folder_name].append(card_name)

        card_to_art_folder[card_name] = folder_name
        card_to_art_file[card_name] = file_name

# Identify dual-sided: folders referenced by exactly 2 distinct card names
dual_sided_folders = {folder: names for folder, names in art_folder_to_cards.items()
                      if len(names) == 2}

# Single-card folders (referenced by 1 card, or folders on disk not in JSON)
single_folders = {folder: names for folder, names in art_folder_to_cards.items()
                  if len(names) == 1}

# Also catch folders on disk that have no JSON reference
all_disk_folders = set(os.listdir(CARD_ART_DIR)) if os.path.isdir(CARD_ART_DIR) else set()
orphan_folders = all_disk_folders - set(art_folder_to_cards.keys())


# ── plan operations ──────────────────────────────────────────────────────────

operations = []  # list of (action, details_dict)

print("=" * 70)
print("CARD ART FOLDER REORGANIZATION")
print("=" * 70)
print(f"Mode: {'DRY RUN (preview only)' if DRY_RUN else '🔴 EXECUTING'}")
print(f"Card art directory: {CARD_ART_DIR}")
print(f"Total folders on disk: {len(all_disk_folders)}")
print(f"Dual-sided pairs (from JSON): {len(dual_sided_folders)}")
print(f"Single-card folders (from JSON): {len(single_folders)}")
print(f"Orphan folders (on disk, no JSON ref): {len(orphan_folders)}")
print()

# ── 1. DUAL-SIDED: split into two folders ────────────────────────────────────

print("-" * 70)
print("DUAL-SIDED CARDS — split into separate folders")
print("-" * 70)

for old_folder, card_names in sorted(dual_sided_folders.items()):
    old_path = os.path.join(CARD_ART_DIR, old_folder)
    images = find_image_files(old_path)
    slug_a = slugify(card_names[0])
    slug_b = slugify(card_names[1])

    print(f"\n  📂 {old_folder}/")
    print(f"     Side A: \"{card_names[0]}\" → {slug_a}/art.png")
    print(f"     Side B: \"{card_names[1]}\" → {slug_b}/art.png")
    if images:
        print(f"     Source images: {images}")
    else:
        print(f"     ⚠️  No images found in folder!")

    operations.append(("split", {
        "old_folder": old_folder,
        "old_path": old_path,
        "card_a": card_names[0],
        "card_b": card_names[1],
        "slug_a": slug_a,
        "slug_b": slug_b,
        "images": images,
    }))

# ── 2. SINGLE-CARD: rename folder + image ───────────────────────────────────

print()
print("-" * 70)
print("SINGLE-CARD FOLDERS — rename to clean slug")
print("-" * 70)

for old_folder, card_names in sorted(single_folders.items()):
    card_name = card_names[0]
    slug = slugify(card_name)
    old_path = os.path.join(CARD_ART_DIR, old_folder)
    images = find_image_files(old_path)

    changed = (old_folder != slug)
    if changed or images:
        symbol = "🔄" if changed else "✅"
        print(f"\n  {symbol} {old_folder}/ → {slug}/")
        if images:
            for img in images:
                print(f"     {img} → art.png")
        if not changed:
            print(f"     (folder name already clean, just renaming image)")

    operations.append(("rename", {
        "old_folder": old_folder,
        "old_path": old_path,
        "card_name": card_name,
        "slug": slug,
        "images": images,
        "changed": changed,
    }))

# ── 3. ORPHAN FOLDERS — rename to clean slug (best-effort from folder name) ─

if orphan_folders:
    print()
    print("-" * 70)
    print("ORPHAN FOLDERS — no JSON reference, rename from folder name")
    print("-" * 70)

    for old_folder in sorted(orphan_folders):
        # Derive a slug from the folder name itself
        slug = slugify(old_folder.replace("_", " "))
        old_path = os.path.join(CARD_ART_DIR, old_folder)
        images = find_image_files(old_path)

        changed = (old_folder != slug)
        symbol = "🔄" if changed else "✅"
        print(f"\n  {symbol} {old_folder}/ → {slug}/")
        if images:
            for img in images:
                print(f"     {img} → art.png")

        operations.append(("rename_orphan", {
            "old_folder": old_folder,
            "old_path": old_path,
            "slug": slug,
            "images": images,
            "changed": changed,
        }))


# ── slug collision check ─────────────────────────────────────────────────────

all_target_slugs = []
for op_type, details in operations:
    if op_type == "split":
        all_target_slugs.append(details["slug_a"])
        all_target_slugs.append(details["slug_b"])
    else:
        all_target_slugs.append(details["slug"])

seen = {}
collisions = []
for slug in all_target_slugs:
    if slug in seen:
        collisions.append((slug, seen[slug]))
    seen[slug] = slug

if collisions:
    print()
    print("⚠️  SLUG COLLISIONS DETECTED:")
    for slug, _ in collisions:
        print(f"   {slug}")
    print("   Resolve these before executing!")

# ── summary ──────────────────────────────────────────────────────────────────

print()
print("=" * 70)
total_new_folders = sum(2 if op[0] == "split" else 1 for op in operations)
print(f"SUMMARY: {len(operations)} operations → {total_new_folders} resulting folders")
print("=" * 70)

if DRY_RUN:
    print()
    print("This was a DRY RUN. No files were moved.")
    print("Run with --execute to apply these changes.")
    print()
    sys.exit(0)


# ── execute ──────────────────────────────────────────────────────────────────

print()
print("Executing...")

success = 0
errors = 0

for op_type, details in operations:
    try:
        if op_type == "split":
            old_path = details["old_path"]
            images = details["images"]

            for side_key in ("a", "b"):
                slug = details[f"slug_{side_key}"]
                new_path = os.path.join(CARD_ART_DIR, slug)
                os.makedirs(new_path, exist_ok=True)

                if images:
                    # Copy the first image as art.png into the new folder
                    src = os.path.join(old_path, images[0])
                    dst = os.path.join(new_path, "art.png")
                    shutil.copy2(src, dst)

            # Remove the old combined folder
            if os.path.isdir(old_path):
                shutil.rmtree(old_path)

            success += 1
            print(f"  ✅ Split: {details['old_folder']} → {details['slug_a']}/ + {details['slug_b']}/")

        elif op_type in ("rename", "rename_orphan"):
            old_path = details["old_path"]
            slug = details["slug"]
            images = details["images"]
            new_path = os.path.join(CARD_ART_DIR, slug)

            if old_path != new_path:
                # Use a temp name to avoid case-insensitive collision on Windows
                temp_path = old_path + "__temp__"
                os.rename(old_path, temp_path)
                os.rename(temp_path, new_path)
            
            # Rename images to art.png
            if images:
                current_images = find_image_files(new_path)
                if current_images:
                    # If multiple images, keep the first and rename to art.png
                    first_img = current_images[0]
                    src = os.path.join(new_path, first_img)
                    dst = os.path.join(new_path, "art.png")
                    if first_img != "art.png":
                        if os.path.exists(dst):
                            os.remove(dst)
                        os.rename(src, dst)
                    # Remove any extra images
                    for extra in current_images[1:]:
                        extra_path = os.path.join(new_path, extra)
                        if os.path.basename(extra_path) != "art.png":
                            os.remove(extra_path)

            success += 1
            print(f"  ✅ Rename: {details['old_folder']} → {slug}/")

    except Exception as e:
        errors += 1
        print(f"  ❌ Error ({op_type} {details.get('old_folder', '???')}): {e}")

print()
print(f"Done! {success} succeeded, {errors} errors.")
