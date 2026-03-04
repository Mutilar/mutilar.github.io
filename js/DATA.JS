// ═══════════════════════════════════════════════════════════════
//  JSON DATA LOADER — Universal schema-introspecting ingestion
//
//  Reads SETTINGS.json → data.path + data.sources to discover
//  every JSON file to load.  Each file is fetched, introspected,
//  and registered into the shared global maps consumed by VIZ.JS,
//  TIMELINE.JS, SKILLTREE.JS, MODALS.JS, and MAP.JS.
//
//  Adding a new dataset is zero-JS-change:
//    1. Drop FOO.json into the json/ folder.
//    2. Add "FOO.json" to SETTINGS.json → data.sources.
//    3. If FOO.json has sections[].items[] with DATE fields,
//       those items appear on the timeline automatically.
//    4. If items have domain/source/quadrant, they appear on
//       the knowledge graph automatically.
//    5. If a DOM element with id "{sectionId}-grid" exists,
//       entry cards are rendered there automatically.
//
//  Public API:
//    loadDataSource(name) → Promise<json>   (cached, single-fetch)
//    loadCardsJSON()      → alias for loadDataSource("CARDS")
//    modalState           → { sectionId: items[], … }
//    DATA_REGISTRY        → { sourceKey: rawJson, … }
// ═══════════════════════════════════════════════════════════════

// ── Data registry (key = lowercase source name sans .json) ───
const DATA_REGISTRY = {};
var _dataLoading = {};   // in-flight fetch promises

// ── Resolve the json/ base path from SETTINGS ────────────────
function _dataBasePath() {
  var s = window.__SETTINGS;
  return (s && s.data && s.data.path) || "";
}

/**
 * Load any JSON data source by name (cached, single-fetch).
 * @param {string} name  Source name, e.g. "CARDS" or "CARDS.json"
 * @returns {Promise<object|null>}
 */
function loadDataSource(name) {
  var key = name.replace(/\.json$/i, "").toLowerCase();
  if (DATA_REGISTRY[key]) return Promise.resolve(DATA_REGISTRY[key]);
  if (_dataLoading[key])  return _dataLoading[key];

  var file = name.endsWith(".json") ? name : name + ".json";
  var url  = _dataBasePath() + file + "?v=" + Date.now();

  _dataLoading[key] = fetch(url)
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " for " + file);
      return r.json();
    })
    .then(function (json) {
      DATA_REGISTRY[key] = json;
      return json;
    })
    .catch(function (err) {
      console.error("[loadDataSource:" + key + "]", err);
      return null;
    });
  return _dataLoading[key];
}

/** Backward-compatible alias consumed by MODALS.JS & SKILLTREE.JS */
function loadCardsJSON() { return loadDataSource("CARDS"); }

// ═══════════════════════════════════════════════════════════════
//  MODAL STATE  —  dynamic object, populated per-section at load
// ═══════════════════════════════════════════════════════════════
const modalState = {};

// ═══════════════════════════════════════════════════════════════
//  ENTRY CARD BUILDER  (unchanged — pure DOM factory)
// ═══════════════════════════════════════════════════════════════
function buildEntryCard(item, dataset, opts) {
  const hasGithub = item.GITHUB && item.GITHUB.trim() && item.GITHUB.trim() !== " ";
  const hasLocation = item.LOCATION && item.LOCATION.trim();
  const hasMotto = item.MOTTO && item.MOTTO.trim();
  const hasTitle = item.TITLE && item.TITLE.trim();
  const hasWin = item.WIN && item.WIN.trim();
  const hasPlay = item.PLAY && item.PLAY.trim();
  const imgExt = opts.imgExt || ".png";
  const modalImgExt = opts.modalImgExt || ".png";

  const card = document.createElement("div");
  card.className = "glass-tile glass-tile-clickable entry-card reveal";
  card.setAttribute("data-entry-id", item.ID);
  if (!item.DATE && !hasLocation) card.classList.add("entry-card-compact");

  card.innerHTML = `
    <div class="entry-header">
      <div class="entry-info">
        <div class="entry-name">${item.NAME}</div>
        <div class="entry-meta">
          ${item.DATE ? `<span><i class="fa fa-calendar"></i>${item.DATE}</span>` : ""}
          ${hasLocation ? `<span><i class="fa fa-map-marker"></i>${item.LOCATION}</span>` : ""}
        </div>
      </div>
      ${(hasTitle || hasWin || hasPlay) ? `<div class="entry-badges">
        ${hasWin ? `<div class="entry-win"><i class="fa fa-trophy"></i> ${item.WIN}</div>` : ""}
        ${hasPlay ? (item.PLAY.trim().startsWith('http') ? `<a href="${item.PLAY.trim()}" target="_blank" class="entry-play" onclick="event.stopPropagation();"><i class="fa fa-gamepad"></i> Play me!</a>` : `<a href="#" class="entry-play" onclick="event.preventDefault(); event.stopPropagation(); openGameModal('${item.PLAY.trim()}', '${(item.NAME || '').replace(/'/g, "\\'")}', ${item.PLAY_W || 960}, ${item.PLAY_H || 600})"><i class="fa fa-gamepad"></i> Play me!</a>`) : ""}
        ${hasTitle ? item.TITLE.split(',').map(t => { const txt = t.trim(); const low = txt.toLowerCase(); const highlight = low.startsWith('senior') || txt.startsWith('🧛') || txt.startsWith('🧠') || txt.startsWith('🎮'); const cls = highlight ? 'entry-title entry-title-highlight' : 'entry-title'; const icon = low.startsWith('senior') ? '🧑‍💻 ' : ''; return `<div class="${cls}">${icon}${txt}</div>`; }).join('') : ""}
      </div>` : ""}
    </div>
    ${hasMotto ? `<div class="entry-motto">"${item.MOTTO}"</div>` : ""}
    ${hasGithub ? `<a href="${item.GITHUB}" target="_blank" class="entry-github" onclick="event.stopPropagation();"><i class="fa fa-github"></i> Open Source</a>` : ""}
  `;

  card.addEventListener("click", () => openEntry(dataset, item.ID, modalImgExt));
  if (window._revealObserver) window._revealObserver.observe(card);
  return card;
}

// ═══════════════════════════════════════════════════════════════
//  UNIVERSAL JSON INGESTION — schema-introspecting pipeline
//
//  For each loaded source, introspects top-level shape:
//    • sections[]       → populate modalState, render grids, build VIZ maps
//    • techCategories   → VIZ_TECH_CATEGORIES (MAP.JS)
//    • techTags         → VIZ_TECH_TAGS       (MAP.JS)
//    • timeline         → VIZ_TIMELINE.*      (TIMELINE.JS)
//    • categories       → stored in registry for SKILLTREE.JS
// ═══════════════════════════════════════════════════════════════

function _ingestSource(key, data) {
  // ── Sections: items[], modal state, VIZ maps, grid cards ──
  if (data.sections && Array.isArray(data.sections)) {
    data.sections.forEach(function (section) {
      var sectionId = section.id;
      if (!sectionId || !Array.isArray(section.items)) return;

      // Register in modalState for MODALS.JS
      modalState[sectionId] = section.items;

      // Build VIZ maps from item fields
      section.items.forEach(function (item) {
        if (!item.ID) return;
        if (item.domain)    VIZ_DOMAIN_MAP[item.ID]    = item.domain;
        VIZ_SOURCE_MAP[item.ID] = item.source || section.id;
        if (item.quadrant)  VIZ_QUADRANT_MAP[item.ID]  = item.quadrant;
        if (item.whisper)   VIZ_WHISPER_MAP[item.ID]   = item.whisper;
        if (item.shortname) VIZ_SHORTNAME_MAP[item.ID] = item.shortname;
      });

      // Render entry cards into matching grid (convention: "{sectionId}-grid")
      var g = document.getElementById(sectionId + "-grid");
      if (!g) return;
      var cfg = { imgExt: ".png", modalImgExt: ".png" };

      if (!section.items.length) {
        g.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-style:italic;padding:16px;">No items.</p>';
        return;
      }

      section.items.forEach(function (item) {
        // Items with a DECK field get deck-modal click override (data-driven, not section-name-driven)
        if (item.DECK && item.DECK.trim()) {
          var deckCard = buildEntryCard(item, sectionId, cfg);
          var clone = deckCard.cloneNode(true);
          if (window._revealObserver) window._revealObserver.observe(clone);
          clone.addEventListener("click", function () { openDeckModal(item); });
          g.appendChild(clone);
        } else {
          g.appendChild(buildEntryCard(item, sectionId, cfg));
        }
      });
    });
  }

  // ── Tech taxonomy for MAP.JS ──────────────────────────────
  if (data.techCategories) window.VIZ_TECH_CATEGORIES = data.techCategories;
  if (data.techTags)       window.VIZ_TECH_TAGS       = data.techTags;

  // ── Timeline metadata ─────────────────────────────────────
  if (data.timeline) {
    Object.assign(VIZ_TIMELINE.whispers,       data.timeline.whispers       || {});
    Object.assign(VIZ_TIMELINE.nameOverrides,  data.timeline.nameOverrides  || {});
    Object.assign(VIZ_TIMELINE.titleOverrides, data.timeline.titleOverrides || {});
  }
}

// ── Boot: fetch all sources declared in SETTINGS.json ────────
(async () => {
  try {
    var cfg = (window.__SETTINGS && window.__SETTINGS.data) || {};
    var basePath = cfg.path || "";
    var sources  = cfg.sources || [];

    // Fetch all data sources in parallel
    var results = await Promise.all(sources.map(function (src) {
      var url = basePath + src + "?v=" + Date.now();
      return fetch(url)
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status + " for " + src);
          return r.json();
        })
        .then(function (json) {
          var key = src.replace(/\.json$/i, "").toLowerCase();
          DATA_REGISTRY[key] = json;
          return { key: key, data: json };
        })
        .catch(function (err) {
          console.error("[DATA] " + src + ":", err);
          return null;
        });
    }));

    // Ingest each source (order-independent — maps merge)
    results.forEach(function (r) {
      if (r) _ingestSource(r.key, r.data);
    });

    // ── Nav generation from per-section JSONs ──────────────
    // Each source with "index" + "nav" contributes a nav entry.
    // Sorted by index → replaces static nav from SETTINGS.json.
    var navEntries = [];
    results.forEach(function (r) {
      if (r && r.data && r.data.nav && typeof r.data.index === "number") {
        navEntries.push({ index: r.data.index, nav: r.data.nav });
      }
    });

    if (navEntries.length) {
      navEntries.sort(function (a, b) { return a.index - b.index; });
      var navEl = document.getElementById("mainNav");
      if (navEl) {
        var existing = navEl.querySelectorAll("a:not(.nav-brand)");
        existing.forEach(function (a) { a.remove(); });
        navEntries.forEach(function (entry, idx) {
          var a = document.createElement("a");
          a.href = entry.nav.href;
          a.textContent = entry.nav.label;
          if (idx === 0) a.className = "active";
          navEl.appendChild(a);
        });
      }
      // Re-cache sections for SCROLL.JS highlight
      if (window._cacheSections) window._cacheSections();
    }

    // Signal that all data is loaded
    window.dispatchEvent(new Event("portfolioDataReady"));

  } catch (err) {
    console.error("[DATA]", err);
  }
})();

// ── MARP BOM (Bill of Materials) — deferred until modal opens ──
let _bomLoaded = false;
const _origOpenMermaidModal = window.openMermaidModal;
window.openMermaidModal = function(mdFile, opts) {
  if (_origOpenMermaidModal) _origOpenMermaidModal(mdFile, opts);
  if (mdFile !== 'MARP.md' || _bomLoaded) return;
  _bomLoaded = true;
  const container = document.getElementById("marp-bom");
  if (!container) return;
  container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-style:italic;">Loading BOM…</p>';
  fetch("archive/csv/marp-bom.json?v=" + Date.now()).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }).then(bom => {
    container.innerHTML = "";
    _buildBom(bom, container);
  }).catch(err => {
    console.error("[BOM]", err);
    container.innerHTML = '<p style="color:rgba(255,200,200,0.7);font-style:italic;">Failed to load BOM. Please refresh.</p>';
  });
};

function _buildBom(bom, container) {
  function buildTable(columns, rows) {
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    columns.forEach(col => { const th = document.createElement("th"); th.textContent = col; headerRow.appendChild(th); });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.forEach(row => {
      const tr = document.createElement("tr");
      columns.forEach(col => {
        const td = document.createElement("td");
        td.innerHTML = row[col] || "";
        // Ensure any dynamically inserted images get loading="lazy"
        td.querySelectorAll("img").forEach(img => { img.loading = "lazy"; });
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  bom.sections.forEach(section => {
    if (section.subsections) {
      const h4 = document.createElement("h4");
      h4.textContent = section.icon + " " + section.title;
      container.appendChild(h4);

      section.subsections.forEach(sub => {
        const h5 = document.createElement("h5");
        h5.textContent = sub.icon + " " + sub.title;
        container.appendChild(h5);
        container.appendChild(buildTable(sub.columns, sub.rows));
      });
    } else {
      const h4 = document.createElement("h4");
      h4.textContent = section.icon + " " + section.title;
      container.appendChild(h4);
      container.appendChild(buildTable(section.columns, section.rows));
    }
  });
}
