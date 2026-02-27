// ═══════════════════════════════════════════════════════════════
//  CSV DATA LOADING
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

// ── Section data loaders ─────────────────────────────────────
const sectionConfigs = [
  { csv: "csv/marp.csv",       dataset: "marp",       gridId: "marp-grid",       imgExt: ".png", modalImgExt: ".png" },
  { csv: "csv/bitnaughts.csv", dataset: "bitnaughts", gridId: "bitnaughts-grid", imgExt: ".png", modalImgExt: ".png" },
  { csv: "csv/work.csv",       dataset: "work",       gridId: "work-grid",       imgExt: ".png", modalImgExt: ".png" },
  { csv: "csv/education.csv",  dataset: "education",  gridId: "education-grid",  imgExt: ".png", modalImgExt: ".png" },
  { csv: "csv/projects.csv",   dataset: "projects",   gridId: "projects-grid",   imgExt: ".png", modalImgExt: ".png" },
  { csv: "csv/hackathons.csv", dataset: "hackathons", gridId: "hackathons-grid", imgExt: ".png", modalImgExt: ".png" },
  { csv: "csv/games.csv",      dataset: "games",      gridId: "games-grid",      imgExt: ".png", modalImgExt: ".png" },
];

sectionConfigs.forEach(({ csv, dataset, gridId, imgExt, modalImgExt }) => {
  fetchCSV(csv + "?v=" + Date.now()).then(d => {
    if (!d.length) {
      const g = document.getElementById(gridId);
      if (g) g.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-style:italic;padding:16px;">Failed to load data. Please refresh.</p>';
      return;
    }
    modalState[dataset] = d;
    const g = document.getElementById(gridId);
    d.forEach(i => g.appendChild(buildEntryCard(i, dataset, { imgExt, modalImgExt })));
    buildAboutGrid();   // attempt after each CSV loads
  });
});

// ── About Me grid (cherry-picked cards from multiple CSVs) ──
const aboutPicks = [
  { dataset: "work",     id: "microsoft" },
  { dataset: "projects", id: "azuremlops" },
  { dataset: "work",     id: "redtierobotics" },
  { dataset: "projects", id: "amaxesd" },
];
let aboutBuilt = false;
function buildAboutGrid() {
  if (aboutBuilt) return;
  // Wait until every needed dataset is loaded
  if (!aboutPicks.every(p => modalState[p.dataset])) return;
  const g = document.getElementById("about-grid");
  if (!g) return;
  aboutPicks.forEach(({ dataset, id }) => {
    const item = modalState[dataset].find(d => d.ID === id);
    if (!item) return;
    g.appendChild(buildEntryCard(item, dataset, { imgExt: ".png", modalImgExt: ".png" }));
  });
  aboutBuilt = true;
}

// ── MTG (special: deck modal override) ───────────────────────
fetchCSV("csv/mtg.csv?v=" + Date.now()).then(d => {
  modalState.mtg = d;
  const g = document.getElementById("mtg-grid");
  d.forEach(function (i) {
    const card = buildEntryCard(i, "mtg", { imgExt: ".png", modalImgExt: ".png" });
    if (i.DECK && i.DECK.trim()) {
      const newCard = card.cloneNode(true);
      if (window._revealObserver) window._revealObserver.observe(newCard);
      newCard.addEventListener("click", function () { openDeckModal(i); });
      g.appendChild(newCard);
    } else {
      g.appendChild(card);
    }
  });
});

// ── MARP BOM (Bill of Materials) — deferred until modal opens ──
let _bomLoaded = false;
const _origOpenMarpModal = window.openMarpModal || openMarpModal;
window.openMarpModal = function() {
  _origOpenMarpModal();
  if (_bomLoaded) return;
  _bomLoaded = true;
  const container = document.getElementById("marp-bom");
  if (!container) return;
  container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-style:italic;">Loading BOM…</p>';
  fetch("csv/marp-bom.json?v=" + Date.now()).then(r => {
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
