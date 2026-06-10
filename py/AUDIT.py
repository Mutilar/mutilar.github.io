#!/usr/bin/env python3
"""Audit JSON data files for missing fields on section items."""

import json
import os
import sys

REQUIRED = ["DOMAIN", "SOURCE", "QUADRANT", "TECH", "SHORTNAME"]
JSON_DIR = os.path.join(os.path.dirname(__file__), "..", "json")
TARGETS = ["EDUCATION", "GAMES", "HACKATHONS", "PROJECTS", "WORK"]

def load(name):
    path = os.path.join(JSON_DIR, name + ".json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def audit():
    total_items = 0
    total_gaps = 0

    for name in TARGETS:
        data = load(name)
        sections = data.get("sections", [])
        for section in sections:
            items = section.get("items", [])
            for item in items:
                item_id = item.get("ID", "???")
                item_name = (item.get("NAME") or "").replace("<br>", " ")
                missing = [f for f in REQUIRED if not item.get(f)]
                total_items += 1
                if missing:
                    total_gaps += 1
                    print(f"  {name}/{section.get('id','?')}/{item_id}  ({item_name})")
                    for f in missing:
                        print(f"    ❌ {f}")

    print(f"\n{'─'*50}")
    print(f"  {total_items} items, {total_gaps} with gaps, {total_items - total_gaps} complete")

if __name__ == "__main__":
    audit()
