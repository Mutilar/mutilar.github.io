#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  CSV → JSON Migration Tool
//
//  Reads all CSV files + hardcoded maps from the old codebase,
//  and outputs PORTFOLIO.json with the new unified schema.
//
//  Usage:  node tools/csv-to-json.js
// ═══════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// ── Lightweight CSV parser (no PapaParse needed) ─────────────
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
  if (lines.length < 2) return [];

  const headers = splitRow(lines[0]);
  const result = [];
  for (let r = 1; r < lines.length; r++) {
    if (!lines[r].trim()) continue;
    const vals = splitRow(lines[r]);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || "").trim(); });
    result.push(obj);
  }
  return result;
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

// ── Hardcoded maps (copied from the old codebase) ────────────

const VIZ_DOMAIN_MAP = {
  marp: "robotics", sriracha: "robotics", smartank: "robotics",
  blindsight: "robotics", amaxesd: "robotics", redtierobotics: "robotics",
  alamorobotics: "robotics", motorskills: "robotics", "home-iot": "robotics",
  bitnaughts: "games", graviton: "games", spaceninjas: "games",
  voodoo: "games", galconq: "games", popvuj: "games",
  seerauber: "games", summerofgamedesign: "games", iterate: "games",
  "the-nobles": "games", "the-demons": "games",
  microsoft: "software", azuremlops: "software", ventana: "software",
  duskrosecodex: "software",
  citris: "software", hackmerced: "software", motleymoves: "software",
  breeze: "software", dogpark: "software",
  ozone: "software", gasleek: "software", chemistry: "software",
  gist: "software", digestquest: "software",
  vicelab: "research", andeslab: "research", maces: "research",
  firmi: "research", learnbeat: "research", acm: "research",
  cse180: "education", cse165: "education", cse160: "education",
  cse120: "education", cse111: "education", cse100: "education",
  cse031: "education", cse030: "education", cse015: "education",
  ropgamedesign: "education", roparchitecture: "education", apjava: "education",
};

const VIZ_SOURCE_MAP = {
  marp: "projects", amaxesd: "projects", redtierobotics: "education",
  alamorobotics: "work", "home-iot": "projects",
  bitnaughts: "projects", voodoo: "projects", galconq: "projects", popvuj: "projects",
  "the-nobles": "projects", "the-demons": "projects", duskrosecodex: "projects",
  graviton: "projects", spaceninjas: "work",
  summerofgamedesign: "work", iterate: "projects",
  microsoft: "work", ventana: "work",
  citris: "work", hackmerced: "work",
  vicelab: "work", andeslab: "work", maces: "work",
  learnbeat: "work", acm: "work",
  azuremlops: "projects", motleymoves: "projects",
  breeze: "projects", dogpark: "projects",
  ozone: "projects", firmi: "projects",
  sriracha: "projects", smartank: "projects", blindsight: "projects",
  motorskills: "projects", seerauber: "projects",
  gasleek: "projects", chemistry: "projects", gist: "projects", digestquest: "projects",
  cse180: "education", cse165: "education", cse160: "education",
  cse120: "education", cse111: "education", cse100: "education",
  cse031: "education", cse030: "education", cse015: "education",
  ropgamedesign: "education", roparchitecture: "education", apjava: "education",
};

// Quadrant maps (from skill-tree.js) — merged into one
const QUADRANT_MAP = {
  // Education items
  cse180: "robotics", cse031: "robotics",
  ropgamedesign: "games", roparchitecture: "robotics",
  redtierobotics: "robotics",
  // cse165, cse160, cse120, cse111, cse100, cse030, cse015, apjava all → "software" (default)
  // Work items
  alamorobotics: "robotics",
  summerofgamedesign: "games", spaceninjas: "games",
  // microsoft, ventana, citris, hackmerced, vicelab, andeslab, maces, learnbeat, acm all → "software" (default)
  // Projects
  marp: "robotics", amaxesd: "robotics", "home-iot": "robotics",
  iterate: "games", bitnaughts: "games", voodoo: "games",
  galconq: "games", popvuj: "games",
  "the-nobles": "games", "the-demons": "games", duskrosecodex: "games",
  // azuremlops, motleymoves, dogpark, ozone, breeze, firmi all → "software" (default)
  // Hackathons
  motorskills: "robotics", sriracha: "robotics", smartank: "robotics", blindsight: "robotics",
  seerauber: "games", graviton: "games",
  // gasleek, chemistry, gist, digestquest all → "software" (default)
};

// Skill-tree circle labels (from nameBreaks in skill-tree.js)
// Keyed by ITEM ID for reliable lookup (not by display name)
const SHORTNAMES = {
  redtierobotics:    "RED TIE<br>ROBOTICS",
  summerofgamedesign:"SUMMER OF<br>GAME DESIGN",
  citris:            "CITRIS",
  vicelab:           "VICE<br>LAB",
  andeslab:          "ANDES<br>LAB",
  alamorobotics:     "ALAMO<br>ROBOTICS",
  dogpark:           "DOG<br>PARK",
  "home-iot":        "IOT<br>PANEL",
  amaxesd:           "AMAX<br>ESD",
  cse180:            "CSE<br>180",
  cse165:            "CSE<br>165",
  cse160:            "CSE<br>160",
  cse120:            "CSE<br>120",
  cse111:            "CSE<br>111",
  cse100:            "CSE<br>100",
  cse031:            "CSE<br>31",
  cse030:            "CSE<br>30",
  cse015:            "CSE<br>15",
  apjava:            "AP<br>JAVA",
  ropgamedesign:     "ROP<br>GAME<br>DESIGN",
  roparchitecture:   "ROP<br>ARCHI<br>TECTURE",
  sriracha:          "SRIR<br>ACHA",
  chemistry:         "CHEMIS<br>TRY",
  voodoo:            "VOO<br>DOO",
  seerauber:         "SEA<br>RÄUBER",
  azuremlops:        "AZURE<br>MLOPS",
  bitnaughts:        "BIT<br>NAUGHTS",
  microsoft:         "MICRO<br>SOFT",
  gist:              "GIST",
  spaceninjas:       "SPACE<br>NINJAS",
  smartank:          "SMAR<br>TANK",
  "the-nobles":      "NOBLES",
  "the-demons":      "DEMONS",
};

// Skill-tree whisper emoji — single badge per item on hover
const WHISPER_EMOJI = {
  microsoft:         "🧠",
  bitnaughts:        "☄️",
  marp:              "🤖",
  iterate:           "🏆",
  ventana:           "🧬",
  "home-iot":        "📡",
  azuremlops:        "⚡",
  chemistry:         "🧪",
  firmi:             "⚛️",
  hackmerced:        "🧑‍💻",
  motleymoves:       "🏃",
  andeslab:          "🏭",
  breeze:            "💨",
  dogpark:           "🥈",
  vicelab:           "🌾",
  maces:             "🚀",
  citris:            "🏙️",
  amaxesd:           "⚡",
  summerofgamedesign:"🧑‍🏫",
  alamorobotics:     "🧑‍🏫",
  acm:               "🤝",
  learnbeat:         "🌱",
  redtierobotics:    "🛠️",
  cse180:            "🤖",
  cse165:            "📦",
  cse160:            "🌐",
  cse120:            "🛠️",
  cse111:            "🗃️",
  cse100:            "📈",
  cse031:            "⚙️",
  cse030:            "⚙️",
  cse015:            "🔢",
  ropgamedesign:     "⚙️",
  roparchitecture:   "📐",
  apjava:            "♨️",
  gasleek:           "🏆",
  sriracha:          "🥉",
  smartank:          "🥇",
  spaceninjas:       "🥷",
  graviton:          "🌸",
  galconq:           "🌌",
  seerauber:         "🥈",
  ozone:             "🥈",
  blindsight:        "🥉",
  motorskills:       "🥇",
  gist:              "🥇",
  digestquest:       "🥇",
  voodoo:            "🎨",
  popvuj:            "⛪",
  "the-nobles":      "👑",
  "the-demons":      "👹",
  duskrosecodex:     "📜",
};

// Timeline whisper data — rich labels shown on timeline slivers
// Keys can be "itemId" or "itemId|titleOverride"
const TIMELINE_WHISPERS = {
  "microsoft|SWE I &amp; II": [
    "🌐 8B+<sup>INF/DAY</sup>",
    "🔒 Champ<sup>SEC</sup>",
    "🎯 Champ<sup>DRI</sup>",
    "☁️ 50+<sup>DCs</sup>",
    "🚀 GA",
    "📡 Envoy",
  ],
  bitnaughts: [
    "🎮 Code<sup>Gamified</sup>",
    "👁️ See<sup>CODE</sup>",
    "🔄 Try<sup>CODE</sup>",
    "🎓 Learn<sup>CODE</sup>",
    "💻 4<sup>Hacks</sup>",
    "🌍 Play<sup>It</sup>",
  ],
  "redtierobotics|Electrician": ["⚡ AMAX"],
  "redtierobotics|Electrical Lead": ["🔌 CAD"],
  "redtierobotics|Treasurer": ["💰 $18K+<sup>Budget</sup>"],
  voodoo: ["🎨 Pixel<sup>Art</sup>"],
  "the-nobles": ["👑 Mardu<sup>Vamps</sup>"],
  "the-demons": ["👹 Orzhov<sup>Aristo</sup>"],
  duskrosecodex: ["📖 Codex"],
  "microsoft|Senior SWE": ["🧠 A.I.<sup>U.X.</sup>"],
  "microsoft|SWE Intern": ["⚡ MLOps"],
  marp: ["🤖 Robot"],
  iterate: ["🏆 $5,000"],
  ventana: ["🔬 A.I."],
  "home-iot": ["🎛️ Control"],
  azuremlops: ["🏗️ CI/CD"],
  chemistry: ["🧪 A.R."],
  firmi: ["💎 Fermi"],
  hackmerced: ["🧑‍💻 350+"],
  motleymoves: ["🏃 Running"],
  andeslab: ["🏭 HVAC"],
  breeze: ["💨 Aux<sup>Air</sup>"],
  dogpark: ["🥈 2<sup>ND</sup>"],
  vicelab: ["🛰️ Ag<sup>A.I.</sup>"],
  maces: ["🚀 NASA"],
  "citris|Event Organizer": ["🏙️ Cyber<sup>Aware</sup>"],
  "citris|Web Developer": ["🏙️ Git<sup>Ops</sup>"],
  amaxesd: ["⚡ ESD"],
  "summerofgamedesign|Instructor": ["👨‍🏫 50+<sup>Students</sup>"],
  "summerofgamedesign|Founder": ["💰 $25K+<sup>Budget</sup>"],
  alamorobotics: ["🤖 Mindstorm"],
  acm: ["💻 Outreach"],
  learnbeat: ["📚 Learn<sup>STEM</sup>"],
  cse180: ["🤖 ROS"], cse165: ["📦 OOP"], cse160: ["🌐 TCP"],
  cse120: ["💻 SWE"], cse111: ["🗃️ SQL"], cse100: ["📊 BigO"],
  cse031: ["⚙️ MIPS"], cse030: ["📚 C<sup>++</sup>"], cse015: ["🔢 Proofs"],
  ropgamedesign: ["🕹️ Unity"], roparchitecture: ["🏗️ CAD"], apjava: ["♨️ Java"],
  gasleek: ["🥇 1<sup>st</sup>"], sriracha: ["🥉 3<sup>rd</sup>"],
  smartank: ["🥇 Hardware"], spaceninjas: ["🥷 Platformer"],
  graviton: ["🌸 Tower<sup>Def</sup>"], galconq: ["🌌 4<sup>x</sup>"],
  seerauber: ["🥈 2<sup>nd</sup>"], ozone: ["🥈 2<sup>nd</sup>"],
  blindsight: ["🥉 3<sup>rd</sup>"], motorskills: ["🥇 GCP"],
  gist: ["🥇 Environment"], digestquest: ["🥇 Design"],
};

// Timeline name/title overrides
const TIMELINE_NAME_OVERRIDES = {
  microsoft: { "Senior SWE": "🪟 Microsoft (E+D)", "__default": "🪟 Microsoft (AzureML)" }
};
const TIMELINE_TITLE_OVERRIDES = {
  marp: "Home Robot"
};

// ── Sections to process ──────────────────────────────────────
const SECTIONS = [
  { id: "marp",       csv: "archive/csv/marp.csv" },
  { id: "bitnaughts", csv: "archive/csv/bitnaughts.csv" },
  { id: "work",       csv: "archive/csv/work.csv" },
  { id: "education",  csv: "archive/csv/education.csv" },
  { id: "projects",   csv: "archive/csv/projects.csv" },
  { id: "hackathons", csv: "archive/csv/hackathons.csv" },
  { id: "games",      csv: "archive/csv/games.csv" },
  { id: "mtg",        csv: "archive/csv/mtg.csv" },
];

// ── Build portfolio.json ─────────────────────────────────────
const portfolio = {
  sections: [],
  timeline: {
    whispers: TIMELINE_WHISPERS,
    nameOverrides: TIMELINE_NAME_OVERRIDES,
    titleOverrides: TIMELINE_TITLE_OVERRIDES,
  },
};

SECTIONS.forEach(({ id: sectionId, csv: csvPath }) => {
  const fullPath = path.join(ROOT, csvPath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`⚠ Skipping ${csvPath} — file not found`);
    return;
  }

  const raw = fs.readFileSync(fullPath, "utf-8");
  const rows = parseCSV(raw);

  const section = { id: sectionId, items: [] };

  rows.forEach(row => {
    const id = row.ID;
    if (!id) return;

    // Start with uppercase CSV fields (backwards compatible)
    const item = {};
    item.ID = id;
    item.NAME = row.NAME || "";

    // Optional fields — only include if present
    if (row.TITLE)    item.TITLE = row.TITLE;
    if (row.MOTTO)    item.MOTTO = row.MOTTO;
    if (row.DATE)     item.DATE = row.DATE;
    if (row.LOCATION) item.LOCATION = row.LOCATION;
    if (row.GITHUB && row.GITHUB.trim() && row.GITHUB.trim() !== " ")
      item.GITHUB = row.GITHUB.trim();
    if (row.WIN)      item.WIN = row.WIN;
    if (row.PLAY)     item.PLAY = row.PLAY;
    if (row.PLAY_W)   item.PLAY_W = parseInt(row.PLAY_W, 10) || undefined;
    if (row.PLAY_H)   item.PLAY_H = parseInt(row.PLAY_H, 10) || undefined;
    if (row.DECK)     item.DECK = row.DECK;
    if (row.TEXT && row.TEXT !== "tbd") item.TEXT = row.TEXT;

    // ── New fields from hardcoded maps ───────────────────────
    // domain: discipline flavor (robotics/games/software/research/education)
    if (VIZ_DOMAIN_MAP[id]) item.domain = VIZ_DOMAIN_MAP[id];

    // source: origin overlay for skill-tree thread color
    // Only include if it differs from the section id (otherwise it's redundant)
    const source = VIZ_SOURCE_MAP[id];
    if (source && source !== sectionId) item.source = source;

    // quadrant: spatial direction on skill-tree
    // Only include if it differs from domain (otherwise derivable)
    const quad = QUADRANT_MAP[id];
    if (quad) item.quadrant = quad;

    // shortname: pre-formatted skill-tree circle label (keyed by ID now)
    if (SHORTNAMES[id]) item.shortname = SHORTNAMES[id];

    // whisper: single emoji badge for skill-tree hover
    if (WHISPER_EMOJI[id]) item.whisper = WHISPER_EMOJI[id];

    section.items.push(item);
  });

  portfolio.sections.push(section);
});

// ── Write output ─────────────────────────────────────────────
const outPath = path.join(ROOT, "PORTFOLIO.json");
fs.writeFileSync(outPath, JSON.stringify(portfolio, null, 2), "utf-8");

const stats = fs.statSync(outPath);
console.log(`✅ Wrote ${outPath}`);
console.log(`   ${portfolio.sections.length} sections, ${portfolio.sections.reduce((n, s) => n + s.items.length, 0)} items`);
console.log(`   ${(stats.size / 1024).toFixed(1)} KB`);
