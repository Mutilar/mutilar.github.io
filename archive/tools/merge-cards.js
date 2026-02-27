#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  Merge nobles.csv + demons.csv (new Scryfall schema) with
//  art paths from the old CSVs → unified CARDS.csv at root.
// ═══════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ARCHIVE = path.join(ROOT, "archive", "csv");

// ── Lightweight CSV parser ───────────────────────────────────
function parseCSV(text) {
  const lines = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { inQuote = !inQuote; cur += ch; }
    else if (ch === '\n' && !inQuote) { lines.push(cur); cur = ""; }
    else if (ch === '\r' && !inQuote) { /* skip */ }
    else { cur += ch; }
  }
  if (cur.trim()) lines.push(cur);
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = splitRow(lines[0]);
  const rows = [];
  for (let r = 1; r < lines.length; r++) {
    if (!lines[r].trim()) continue;
    const vals = splitRow(lines[r]);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || ""); });
    rows.push(obj);
  }
  return { headers, rows };
}

function splitRow(line) {
  const fields = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === ',' && !inQuote) {
      fields.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function csvEscape(val) {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ── Load old CSVs for art paths ──────────────────────────────
// Old schema: card name,types,art
function loadOldArt(filename) {
  const p = path.join(ARCHIVE, filename);
  if (!fs.existsSync(p)) { console.warn(`⚠ Old CSV not found: ${p}`); return {}; }
  const { rows } = parseCSV(fs.readFileSync(p, "utf-8"));
  const map = {};
  rows.forEach(r => {
    const name = (r["card name"] || "").trim();
    const art = (r["art"] || "").trim();
    if (name && art) map[name] = art;
  });
  return map;
}

// We need the OLD versions of nobles/demons for art.
// The user updated the new ones in-place, but the old ones had an "art" column.
// Let's check if art column exists in the new ones first.
const newNobles = parseCSV(fs.readFileSync(path.join(ARCHIVE, "nobles.csv"), "utf-8"));
const hasArtColumn = newNobles.headers.includes("art");

let artMap = {};
if (!hasArtColumn) {
  // Art column was removed in new schema — we need to reconstruct from git history
  // For now, let's try loading from any backup or construct art paths from card names
  console.log("Art column not in new CSVs. Will derive art paths from card_art directory.");
  
  // Scan images/card_art/ for actual directories
  const cardArtDir = path.join(ROOT, "images", "card_art");
  if (fs.existsSync(cardArtDir)) {
    const dirs = fs.readdirSync(cardArtDir);
    dirs.forEach(dir => {
      const full = path.join(cardArtDir, dir);
      if (!fs.statSync(full).isDirectory()) return;
      const files = fs.readdirSync(full).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
      if (files.length > 0) {
        // Map the directory name back to a card name
        // Directory names use underscores for spaces and special chars
        const artPath = `images/card_art/${dir}/${files[0]}`;
        artMap[dir] = artPath;
      }
    });
  }
}

// ── Load new Scryfall CSVs ───────────────────────────────────
const nobles = parseCSV(fs.readFileSync(path.join(ARCHIVE, "nobles.csv"), "utf-8"));
const demons = parseCSV(fs.readFileSync(path.join(ARCHIVE, "demons.csv"), "utf-8"));

// ── Output schema ────────────────────────────────────────────
const OUT_HEADERS = [
  "deck",
  "card name",
  "category",
  "secondary categories",
  "label",
  "modifier",
  "salt",
  "color",
  "cmc",
  "rarity",
  "types",
  "price",
  "card text",
  "art",
];

function findArt(cardName) {
  if (hasArtColumn) return ""; // shouldn't happen
  // Convert card name to directory-style lookup
  // "Edgar Markov" → "Edgar_Markov"
  // "Aclazotz, Deepest Betrayal // Temple of the Dead" → "Aclazotz,_Deepest_Betrayal_Temple_of_the_Dead"
  const dirName = cardName
    .replace(/ \/\/ /g, "_")
    .replace(/:/g, "")
    .replace(/ /g, "_");
  
  // Direct lookup
  if (artMap[dirName]) return artMap[dirName];
  
  // Try without commas in lookup key (some dirs keep commas, some don't)
  for (const [key, val] of Object.entries(artMap)) {
    if (key.replace(/,/g, "").toLowerCase() === dirName.replace(/,/g, "").toLowerCase()) {
      return val;
    }
  }
  
  // Fuzzy: check if any dir starts with the first word
  const firstWord = cardName.split(/[, ]/)[0];
  const candidates = Object.entries(artMap).filter(([k]) => 
    k.startsWith(firstWord) && k.toLowerCase().includes(dirName.split("_")[1]?.toLowerCase() || "NOMATCH")
  );
  if (candidates.length === 1) return candidates[0][1];
  
  return "";
}

function buildRow(deckId, row) {
  const name = (row["card name"] || "").trim();
  const art = hasArtColumn ? (row["art"] || "") : findArt(name);
  
  return OUT_HEADERS.map(h => {
    if (h === "deck") return csvEscape(deckId);
    if (h === "art") return csvEscape(art);
    return csvEscape(row[h] || "");
  }).join(",");
}

// ── Build output ─────────────────────────────────────────────
const lines = [OUT_HEADERS.join(",")];

nobles.rows.forEach(r => lines.push(buildRow("the-nobles", r)));
demons.rows.forEach(r => lines.push(buildRow("the-demons", r)));

const outPath = path.join(ROOT, "CARDS.csv");
fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf-8");

const stats = fs.statSync(outPath);
console.log(`✅ Wrote ${outPath}`);
console.log(`   ${nobles.rows.length} nobles + ${demons.rows.length} demons = ${nobles.rows.length + demons.rows.length} cards`);
console.log(`   ${(stats.size / 1024).toFixed(1)} KB`);

// Report any cards missing art
const missing = [];
lines.slice(1).forEach(line => {
  const vals = splitRow(line);
  const name = vals[1];
  const art = vals[vals.length - 1];
  if (!art) missing.push(name);
});
if (missing.length) {
  console.log(`\n⚠ ${missing.length} cards missing art:`);
  missing.forEach(n => console.log(`   - ${n}`));
}
