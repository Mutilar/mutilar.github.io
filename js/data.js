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
  const modalImgExt = opts.modalImgExt || ".jpg";

  const card = document.createElement("div");
  card.className = "glass-tile glass-tile-clickable entry-card reveal";
  if (!item.DATE && !hasLocation) card.classList.add("entry-card-compact");

  card.innerHTML = `
    <div class="entry-header">
      <img class="entry-logo" src="images/${item.ID}${imgExt}" alt="${item.NAME}" onerror="this.style.display='none'">
      <div class="entry-info">
        <div class="entry-name">${item.NAME}</div>
        <div class="entry-meta">
          ${item.DATE ? `<span><i class="fa fa-calendar"></i>${item.DATE}</span>` : ""}
          ${hasLocation ? `<span><i class="fa fa-map-marker"></i>${item.LOCATION}</span>` : ""}
        </div>
      </div>
      ${(hasTitle || hasWin || hasPlay) ? `<div class="entry-badges">
        ${hasPlay ? (item.PLAY.trim().startsWith('http') ? `<a href="${item.PLAY.trim()}" target="_blank" class="entry-play" onclick="event.stopPropagation();"><i class="fa fa-gamepad"></i> Play me!</a>` : `<a href="#" class="entry-play" onclick="event.preventDefault(); event.stopPropagation(); openGameModal('${item.PLAY.trim()}', '${(item.NAME || '').replace(/'/g, "\\'")}', ${item.PLAY_W || 960}, ${item.PLAY_H || 600})"><i class="fa fa-gamepad"></i> Play me!</a>`) : ""}
        ${hasTitle ? item.TITLE.split(',').map(t => { const txt = t.trim(); const cls = txt.toLowerCase().startsWith('senior') ? 'entry-title entry-title-highlight' : 'entry-title'; return `<div class="${cls}">${txt}</div>`; }).join('') : ""}
        ${hasWin ? `<div class="entry-win"><i class="fa fa-trophy"></i> ${item.WIN}</div>` : ""}
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
  { csv: "marp.csv",       dataset: "marp",       gridId: "marp-grid",       imgExt: ".png", modalImgExt: ".png" },
  { csv: "bitnaughts.csv", dataset: "bitnaughts", gridId: "bitnaughts-grid", imgExt: ".png", modalImgExt: ".png" },
  { csv: "work.csv",       dataset: "work",       gridId: "work-grid",       imgExt: ".png", modalImgExt: ".jpg" },
  { csv: "education.csv",  dataset: "education",  gridId: "education-grid",  imgExt: ".png", modalImgExt: ".png" },
  { csv: "projects.csv",   dataset: "projects",   gridId: "projects-grid",   imgExt: ".png", modalImgExt: ".jpg" },
  { csv: "hackathons.csv", dataset: "hackathons", gridId: "hackathons-grid", imgExt: ".png", modalImgExt: ".jpg" },
  { csv: "games.csv",      dataset: "games",      gridId: "games-grid",      imgExt: ".png", modalImgExt: ".png" },
];

sectionConfigs.forEach(({ csv, dataset, gridId, imgExt, modalImgExt }) => {
  $.get(csv + "?v=" + Date.now()).then(function (t) {
    const d = $.csv.toObjects(t);
    modalState[dataset] = d;
    const g = document.getElementById(gridId);
    d.forEach(i => g.appendChild(buildEntryCard(i, dataset, { imgExt, modalImgExt })));
  });
});

// ── MTG (special: deck modal override) ───────────────────────
$.get("mtg.csv?v=" + Date.now()).then(function (t) {
  const d = $.csv.toObjects(t);
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
