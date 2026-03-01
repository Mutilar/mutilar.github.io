// ═══════════════════════════════════════════════════════════════
//  JSON DATA LOADER — replaces CSV + PapaParse
//
//  Loads PORTFOLIO.json, populates modalState for MODALS.JS,
//  builds VIZ_DOMAIN_MAP & VIZ_SOURCE_MAP for VIZ.JS consumers,
//  and renders entry-card grids.
// ═══════════════════════════════════════════════════════════════

// ── CSV helper — kept only for on-demand MTG deck card lists ──
function fetchCSV(url) {
  return fetch(url).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.text();
  }).then(text => {
    // Lightweight CSV parser (header row + data rows) — replaces PapaParse
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
    // Parse header
    const headers = _splitCSVRow(lines[0]);
    const result = [];
    for (let r = 1; r < lines.length; r++) {
      if (!lines[r].trim()) continue;
      const vals = _splitCSVRow(lines[r]);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || "").trim(); });
      result.push(obj);
    }
    return result;
  }).catch(err => {
    console.error("[fetchCSV]", err);
    return [];
  });
}

/** Split a single CSV row respecting quoted fields */
function _splitCSVRow(line) {
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

// ═══════════════════════════════════════════════════════════════
//  MODAL STATE  —  shared global written here, read by MODALS.JS
// ═══════════════════════════════════════════════════════════════
const modalState = { work: null, education: null, projects: null, hackathons: null, games: null, marp: null, bitnaughts: null, mtg: null };

// ═══════════════════════════════════════════════════════════════
//  ENTRY CARD BUILDER
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

  card.addEventListener("click", () => openModal(dataset, item.ID, modalImgExt));
  if (window._revealObserver) window._revealObserver.observe(card);
  return card;
}

// ═══════════════════════════════════════════════════════════════
//  JSON DATA LOADING  —  single fetch replaces 8 CSV fetches
// ═══════════════════════════════════════════════════════════════

// Grid configs — maps section id to its DOM grid element
const _gridConfigs = {
  marp:       { gridId: "marp-grid",       imgExt: ".png", modalImgExt: ".png" },
  bitnaughts: { gridId: "bitnaughts-grid", imgExt: ".png", modalImgExt: ".png" },
  work:       { gridId: "work-grid",       imgExt: ".png", modalImgExt: ".png" },
  education:  { gridId: "education-grid",  imgExt: ".png", modalImgExt: ".png" },
  projects:   { gridId: "projects-grid",   imgExt: ".png", modalImgExt: ".png" },
  hackathons: { gridId: "hackathons-grid", imgExt: ".png", modalImgExt: ".png" },
  games:      { gridId: "games-grid",      imgExt: ".png", modalImgExt: ".png" },
  mtg:        { gridId: "mtg-grid",        imgExt: ".png", modalImgExt: ".png" },
};

(async () => {
  try {
    const r = await fetch("PORTFOLIO.json?v=" + Date.now());
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new SyntaxError(e.message);
    }

    // Build VIZ maps from item fields
    // These globals are consumed by VIZ.JS, TIMELINE.JS, SKILLTREE.JS
    data.sections.forEach(section => {
      section.items.forEach(item => {
        if (item.domain)    VIZ_DOMAIN_MAP[item.ID] = item.domain;
        // source: explicit field, or fall back to section id
        VIZ_SOURCE_MAP[item.ID] = item.source || section.id;
        if (item.quadrant)  VIZ_QUADRANT_MAP[item.ID] = item.quadrant;
        if (item.whisper)   VIZ_WHISPER_MAP[item.ID] = item.whisper;
        if (item.shortname) VIZ_SHORTNAME_MAP[item.ID] = item.shortname;
      });
    });

    // Populate timeline metadata
    if (data.timeline) {
      Object.assign(VIZ_TIMELINE.whispers, data.timeline.whispers || {});
      Object.assign(VIZ_TIMELINE.nameOverrides, data.timeline.nameOverrides || {});
      Object.assign(VIZ_TIMELINE.titleOverrides, data.timeline.titleOverrides || {});
    }

    // Populate modalState and render grids
    data.sections.forEach(section => {
      const sectionId = section.id;
      const cfg = _gridConfigs[sectionId];
      if (!cfg) return;

      modalState[sectionId] = section.items;
      const g = document.getElementById(cfg.gridId);
      if (!g) return;

      if (!section.items.length) {
        g.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-style:italic;padding:16px;">Failed to load data. Please refresh.</p>';
        return;
      }

      // MTG section: deck items get deck modal click override
      if (sectionId === "mtg") {
        section.items.forEach(function (i) {
          const card = buildEntryCard(i, "mtg", cfg);
          if (i.DECK && i.DECK.trim()) {
            const newCard = card.cloneNode(true);
            if (window._revealObserver) window._revealObserver.observe(newCard);
            newCard.addEventListener("click", function () { openDeckModal(i); });
            g.appendChild(newCard);
          } else {
            g.appendChild(card);
          }
        });
      } else {
        section.items.forEach(i => g.appendChild(buildEntryCard(i, sectionId, cfg)));
      }
    });

    // Signal that data is loaded (for consumers that poll modalState)
    window.dispatchEvent(new Event("portfolioDataReady"));

  } catch (err) {
    console.error("[portfolio.json]", err);
    Object.values(_gridConfigs).forEach(cfg => {
      const g = document.getElementById(cfg.gridId);
      if (g && !g.children.length) {
        g.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-style:italic;padding:16px;">Failed to load data. Please refresh.</p>';
      }
    });
  }
})();

// ── MARP BOM (Bill of Materials) — deferred until modal opens ──
let _bomLoaded = false;
const _origOpenMarpModal = window.openMarpModal;
window.openMarpModal = function() {
  if (_origOpenMarpModal) _origOpenMarpModal();
  if (_bomLoaded) return;
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
