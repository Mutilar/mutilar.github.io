#!/usr/bin/env python3
"""SCHEMA.py — Infer & print JSON schemas from data files.

Supports two roots: BOOTFILE (parent) and MUTILAR (submodule).
Reads json/ subfolder for both (following the data.path convention).

Usage:
    python py/SCHEMA.py                     # both files, depth=3
    python py/SCHEMA.py --depth 5           # deeper
    python py/SCHEMA.py --file settings     # just SETTINGS.json
    python py/SCHEMA.py --file portfolio    # just PORTFOLIO.json
    python py/SCHEMA.py --file cards        # just CARDS.json
    python py/SCHEMA.py --samples           # include 1 sample value per leaf
    python py/SCHEMA.py --diff              # diff BOOTFILE vs MUTILAR schemas
    python py/SCHEMA.py --diff --file settings --depth 4
"""

import json, sys, argparse
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent.parent
MUTILAR   = WORKSPACE / "mutilar.github.io"

ROOTS = {
    "bootfile": WORKSPACE / "json",
    "mutilar":  MUTILAR   / "json",
}

FILE_NAMES = {
    "settings":  "SETTINGS.json",
    "portfolio": "PORTFOLIO.json",
    "cards":     "CARDS.json",
    "quilt":     "QUILT.json",
}

def _resolve(root_key: str, file_key: str) -> Path:
    return ROOTS[root_key] / FILE_NAMES[file_key]

# ── schema inference ─────────────────────────────────────────

def infer(obj, depth, max_depth, samples=False):
    """Return a lightweight schema dict describing *obj*."""
    if depth >= max_depth:
        return _leaf(obj, samples)

    if isinstance(obj, dict):
        return {k: infer(v, depth + 1, max_depth, samples) for k, v in obj.items()}

    if isinstance(obj, list):
        if not obj:
            return "[]"
        # For arrays: infer schema of first element, note length
        elem = infer(obj[0], depth + 1, max_depth, samples)
        return {"[array]": len(obj), "element": elem}

    return _leaf(obj, samples)


def _leaf(v, samples):
    t = type(v).__name__
    if samples and v is not None:
        sample = repr(v) if not isinstance(v, str) else v
        if isinstance(sample, str) and len(sample) > 60:
            sample = sample[:57] + "..."
        return f"<{t}> {sample}"
    return f"<{t}>"


# ── pretty print ─────────────────────────────────────────────

def dump(label, path, depth, samples):
    if not path.exists():
        print(f"  ⚠  {path.name} not found at {path}")
        return
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    schema = infer(raw, 0, depth, samples)
    lines = json.dumps(schema, indent=2, ensure_ascii=False)
    size = path.stat().st_size
    print(f"\n{'═'*60}")
    print(f"  {label}  ({size:,} bytes, depth={depth})")
    print(f"{'═'*60}")
    print(lines)


# ── schema diff ──────────────────────────────────────────────

def _collect_keys(schema, prefix=""):
    """Flatten a schema dict into a set of dotted key paths."""
    keys = set()
    if isinstance(schema, dict):
        for k, v in schema.items():
            if k in ("[array]", "element"):
                # array descriptor — recurse into element
                if k == "element":
                    keys |= _collect_keys(v, prefix + "[]")
                continue
            path = f"{prefix}.{k}" if prefix else k
            keys.add(path)
            keys |= _collect_keys(v, path)
    return keys


def diff_schemas(file_key, depth, samples):
    """Print side-by-side key diff for a file across both roots."""
    pa = _resolve("bootfile", file_key)
    pb = _resolve("mutilar",  file_key)

    if not pa.exists():
        print(f"  ⚠  BOOTFILE {pa.name} not found")
        return
    if not pb.exists():
        print(f"  ⚠  MUTILAR  {pb.name} not found")
        return

    with open(pa, encoding="utf-8") as f:
        sa = infer(json.load(f), 0, depth, samples)
    with open(pb, encoding="utf-8") as f:
        sb = infer(json.load(f), 0, depth, samples)

    ka = _collect_keys(sa)
    kb = _collect_keys(sb)

    only_boot = sorted(ka - kb)
    only_muti = sorted(kb - ka)
    shared    = sorted(ka & kb)

    print(f"\n{'═'*60}")
    print(f"  DIFF: {file_key.upper()}.json  (depth={depth})")
    print(f"{'═'*60}")

    if only_muti:
        print(f"\n  🔴 MUTILAR only ({len(only_muti)} keys):")
        for k in only_muti:
            print(f"     - {k}")

    if only_boot:
        print(f"\n  🔵 BOOTFILE only ({len(only_boot)} keys):")
        for k in only_boot:
            print(f"     + {k}")

    print(f"\n  ✅ Shared: {len(shared)} keys")
    print()


# ── CLI ──────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Infer JSON schemas for data files")
    ap.add_argument("--depth", type=int, default=3, help="Max recursion depth (default 3)")
    ap.add_argument("--file", choices=list(FILE_NAMES.keys()), help="Limit to one file")
    ap.add_argument("--samples", action="store_true", help="Show one sample value per leaf")
    ap.add_argument("--diff", action="store_true", help="Diff BOOTFILE vs MUTILAR schemas")
    ap.add_argument("--root", choices=list(ROOTS.keys()), help="Limit to one root (default: mutilar for dump)")
    args = ap.parse_args()

    targets = [args.file] if args.file else list(FILE_NAMES.keys())

    if args.diff:
        for fk in targets:
            diff_schemas(fk, args.depth, args.samples)
        return

    root = args.root or "mutilar"
    for fk in targets:
        path = _resolve(root, fk)
        dump(f"{root.upper()} / {fk.upper()}", path, args.depth, args.samples)
    print()


if __name__ == "__main__":
    main()
