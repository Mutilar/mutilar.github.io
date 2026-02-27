// ═════════════════════════════════════════════════════════════════
//  GLOBALS FROM DATA.JS  —  fetchCSV(), modalState
//  (data.js is loaded before modals.js)
// ═════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════
//  MODAL TOGGLE HELPER (with stack counter)
// ═════════════════════════════════════════════════════════════════
let _modalOpenCount = 0;

function toggleModal(el, open) {
  if (open) {
    el.classList.remove("closing");
    el.classList.add("open");
    _modalOpenCount++;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    // Move focus into the modal
    const focusTarget = el.querySelector(".modal-close, button, [tabindex]");
    if (focusTarget) requestAnimationFrame(() => focusTarget.focus());
  } else {
    if (!el.classList.contains("open")) return;
    el.classList.add("closing");
    el.classList.remove("open");
    _modalOpenCount = Math.max(0, _modalOpenCount - 1);

    const onEnd = () => {
      el.classList.remove("closing");
      if (_modalOpenCount === 0) {
        document.body.style.overflow = "";
        document.documentElement.style.overflow = "";
      }
    };
    const card = el.querySelector(".modal-card");
    if (card) {
      card.addEventListener("animationend", onEnd, { once: true });
    } else {
      setTimeout(onEnd, 250);
    }
  }
}

// ── Focus trap: keep Tab cycling inside the topmost open modal ──
function _trapFocus(e) {
  if (e.key !== "Tab") return;
  // Find the topmost open modal overlay
  const openModals = document.querySelectorAll(".modal-overlay.open");
  if (openModals.length === 0) return;
  const topModal = openModals[openModals.length - 1];
  const focusable = topModal.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])');
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}
document.addEventListener("keydown", _trapFocus);

// ═══════════════════════════════════════════════════════════════
//  MODAL SYSTEM  (modalState provided by data.js)
// ═══════════════════════════════════════════════════════════════
const modal = document.getElementById("modal");
const modalClose = document.getElementById("modalClose");

function openModal(dataset, id, imgExt) {
  const data = modalState[dataset];
  if (!data) return;
  const item = data.find(d => d.ID === id);
  if (!item) return;

  const modalImg = document.getElementById("modal-image");
  modalImg.style.display = "none";
  modalImg.onload = function () { this.style.display = ""; };
  modalImg.onerror = function () { this.style.display = "none"; };
  modalImg.src = "images/" + id + (imgExt || ".png");
  modalImg.alt = item.NAME || "";

  document.getElementById("modal-name").innerHTML = (item.NAME || "").replace(/<br\s*\/?>/gi, " ");

  const titleStr = item.TITLE || item.MOTTO || "";
  const titleBadges = titleStr.split(',').map(t => t.trim()).filter(Boolean)
    .map(t => `<span class="modal-badge">${t}</span>`).join('');
  const winBadge = item.WIN && item.WIN.trim()
    ? `<span class="modal-win-badge"><i class="fa fa-trophy"></i> ${item.WIN}</span>`
    : '';

  const hasPlay = item.PLAY && item.PLAY.trim();
  const isExternal = hasPlay && item.PLAY.trim().startsWith('http');
  const playBadge = hasPlay
    ? (isExternal
      ? `<a href="${item.PLAY.trim()}" target="_blank" class="modal-play-badge" onclick="event.stopPropagation();"><i class="fa fa-gamepad"></i> Play me!</a>`
      : `<a href="#" class="modal-play-badge" onclick="event.preventDefault(); event.stopPropagation(); closeModal(); openGameModal('${item.PLAY.trim()}', '${(item.NAME || '').replace(/'/g, "\\'")}', ${item.PLAY_W || 960}, ${item.PLAY_H || 600})"><i class="fa fa-gamepad"></i> Play me!</a>`)
    : '';
  document.getElementById("modal-title").innerHTML = playBadge + titleBadges + winBadge;

  document.getElementById("modal-biography").innerHTML = item.TEXT && item.TEXT !== "tbd"
    ? item.TEXT
    : "<p style='color:rgba(255,255,255,0.5);font-style:italic;'>Details coming soon…</p>";

  // Glow the source tile
  _applyGlow(dataset, id);

  toggleModal(modal, true);
  const card = modal.querySelector(".modal-card");
  if (card) card.scrollTop = 0;
}

// Track the currently-glowing tile so we can fade it out later
let _glowingTile = null;

function _applyGlow(dataset, id) {
  // Clear any previous glow
  if (_glowingTile) {
    _glowingTile.classList.remove('tile-glow', 'tile-glow-fade');
    _glowingTile = null;
  }
  // Find the tile in its native section grid first, fall back to any match
  const gridId = dataset + '-grid';
  const grid = document.getElementById(gridId);
  const tile = grid
    ? grid.querySelector(`[data-entry-id="${id}"]`)
    : document.querySelector(`[data-entry-id="${id}"]`);
  if (tile) {
    tile.classList.add('tile-glow');
    _glowingTile = tile;
  }
}

function navigateToModal(dataset, id, imgExt) {
  // Clear any existing glow without the fade-out animation
  if (_glowingTile) {
    _glowingTile.classList.remove('tile-glow', 'tile-glow-fade');
    _glowingTile = null;
  }

  // If the modal is already open, just swap content in-place
  // (skip the close/open cycle so the overlay stays visible)
  if (modal.classList.contains("open")) {
    openModal(dataset, id, imgExt);
    return;
  }

  // Otherwise open fresh
  openModal(dataset, id, imgExt);
}

function _fadeOutGlow() {
  if (_glowingTile) {
    _glowingTile.classList.remove('tile-glow');
    _glowingTile.classList.add('tile-glow-fade');
    const el = _glowingTile;
    _glowingTile = null;
    setTimeout(() => el.classList.remove('tile-glow-fade'), 500);
  }
}

function closeModal() {
  toggleModal(modal, false);
  _fadeOutGlow();
}

modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });

// Safe no-ops for modal close functions that may not be defined yet
window.closeDeckModal = window.closeDeckModal || function() {};

// Safe no-op for timeline modal close until timeline.js loads
window.closeTimelineModal = window.closeTimelineModal || function() {};
window.closeKnowledgeModal = window.closeKnowledgeModal || function() {};

document.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(); closePdfModal(); closeResumePdfModal(); closeLinkModal(); closeGameModal(); window.closeMarpModal(); window.closeArchModal(); closeBitnaughtsModal(); closeBitnaughtsIphoneModal(); window.closeDeckModal(); window.closeTimelineModal(); window.closeKnowledgeModal(); } });

// ── Footer year (safe alternative to document.write) ──
const footerYear = document.getElementById("footer-year");
if (footerYear) footerYear.textContent = new Date().getFullYear();

// ── Video-card event delegation (replaces inline onclick/onkeydown) ──
const _modalOpeners = {
  marpModal: function() { window.openMarpModal(); },
  pdfModal: function() { openPdfModal(); },
  bitnaughtsIphoneModal: function() { openBitnaughtsIphoneModal(); },
  archModal: function() { window.openArchModal(); },
  timelineModal: function() { window.openTimelineModal && window.openTimelineModal(); },
  knowledgeModal: function() { window.openKnowledgeModal && window.openKnowledgeModal(); },
  mtgTreeModal: function() { window.openMtgTreeModal && window.openMtgTreeModal(); },
};

document.addEventListener("click", function(e) {
  const card = e.target.closest("[data-action]");
  if (!card) return;
  const action = card.dataset.action;
  const scrollTo = card.dataset.scrollTo;
  if (scrollTo) {
    const el = document.getElementById(scrollTo);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }
  if (action === "open" || action === "scroll-open") {
    const opener = _modalOpeners[card.dataset.open];
    if (opener) opener();
  } else if (action === "scroll-navigate" || action === "navigate") {
    navigateToModal(card.dataset.navigateDataset, card.dataset.navigateId);
  } else if (action === "scroll-modal" || action === "modal") {
    openModal(card.dataset.modalDataset, card.dataset.modalId);
  }
});

document.addEventListener("keydown", function(e) {
  if (e.key === "Enter" || e.key === " ") {
    const card = e.target.closest("[data-action]");
    if (card) { e.preventDefault(); card.click(); }
  }
});

// ═══════════════════════════════════════════════════════════════
//  SITE ARCHITECTURE MODAL — handled by mermaid-view.js
// ═══════════════════════════════════════════════════════════════
// openArchModal / closeArchModal are defined in mermaid-view.js
window.openArchModal  = window.openArchModal  || function() {};
window.closeArchModal = window.closeArchModal || function() {};

// ═══════════════════════════════════════════════════════════════
// QUILTING MODAL (Easter Egg)
// ═══════════════════════════════════════════════════════════════
const quiltModal = document.getElementById("quilt-modal");
const quiltModalClose = document.getElementById("quiltModalClose");

function openQuiltModal() {
  toggleModal(quiltModal, true);
}

function closeQuiltModal() {
  toggleModal(quiltModal, false);
}

quiltModalClose.addEventListener("click", closeQuiltModal);
quiltModal.addEventListener("click", e => { if (e.target === quiltModal) closeQuiltModal(); });

// ═══════════════════════════════════════════════════════════════
//  MARP DIAGRAM MODAL — handled by mermaid-view.js
// ═══════════════════════════════════════════════════════════════
// openMarpModal / closeMarpModal are defined in mermaid-view.js
window.openMarpModal  = window.openMarpModal  || function() {};
window.closeMarpModal = window.closeMarpModal || function() {};

// ═══════════════════════════════════════════════════════════════
//  BITNAUGHTS GALLERY MODAL
// ═══════════════════════════════════════════════════════════════
const bitnaughtsModal = document.getElementById("bitnaughts-modal");
const bitnaughtsModalClose = document.getElementById("bitnaughtsModalClose");

function openBitnaughtsModal() {
  toggleModal(bitnaughtsModal, true);
}

function closeBitnaughtsModal() {
  toggleModal(bitnaughtsModal, false);
}

bitnaughtsModalClose.addEventListener("click", closeBitnaughtsModal);
bitnaughtsModal.addEventListener("click", e => { if (e.target === bitnaughtsModal) closeBitnaughtsModal(); });

// ═══════════════════════════════════════════════════════════════
//  BITNAUGHTS iPHONE GALLERY MODAL
// ═══════════════════════════════════════════════════════════════
const bitnaughtsIphoneModal = document.getElementById("bitnaughts-iphone-modal");
const bitnaughtsIphoneModalClose = document.getElementById("bitnaughtsIphoneModalClose");

function openBitnaughtsIphoneModal() {
  toggleModal(bitnaughtsIphoneModal, true);
}

function closeBitnaughtsIphoneModal() {
  toggleModal(bitnaughtsIphoneModal, false);
}

bitnaughtsIphoneModalClose.addEventListener("click", closeBitnaughtsIphoneModal);
bitnaughtsIphoneModal.addEventListener("click", e => { if (e.target === bitnaughtsIphoneModal) closeBitnaughtsIphoneModal(); });

// Close modal when clicking an in-page anchor link (e.g. #games)
// but NOT if the link navigates to another modal via navigateToModal
modal.addEventListener("click", function (e) {
  const link = e.target.closest("a[href^='#']");
  if (!link) return;
  const onclickAttr = link.getAttribute("onclick") || "";
  if (onclickAttr.indexOf("navigateToModal") !== -1) return;
  closeModal();
});

// ═══════════════════════════════════════════════════════════════
//  PDF VIEWER MODAL
// ═══════════════════════════════════════════════════════════════
const pdfModal = document.getElementById("pdf-modal");
const pdfModalClose = document.getElementById("pdfModalClose");

function openPdfModal() {
  toggleModal(pdfModal, true);
  renderPdfInline("pdf/bible.pdf");
}

function closePdfModal() {
  toggleModal(pdfModal, false);
  clearPdfViewer();
}

pdfModalClose.addEventListener("click", closePdfModal);
pdfModal.addEventListener("click", e => { if (e.target === pdfModal) closePdfModal(); });

// ═══════════════════════════════════════════════════════════════
//  RESUME PDF VIEWER MODAL
// ═══════════════════════════════════════════════════════════════
const resumePdfModal = document.getElementById("resume-pdf-modal");
const resumePdfModalClose = document.getElementById("resumePdfModalClose");

function openResumePdfModal() {
  toggleModal(resumePdfModal, true);
  renderPdfInline("pdf/resume.pdf", { viewerId: "resume-pdf-viewer", loadingId: "resume-pdf-loading", singlePage: true });
}

function closeResumePdfModal() {
  toggleModal(resumePdfModal, false);
  clearPdfViewer("resume-pdf-viewer");
}

resumePdfModalClose.addEventListener("click", closeResumePdfModal);
resumePdfModal.addEventListener("click", e => { if (e.target === resumePdfModal) closeResumePdfModal(); });

// ═══════════════════════════════════════════════════════════════
//  EXTERNAL LINK IFRAME MODAL
// ═══════════════════════════════════════════════════════════════
const linkModal = document.getElementById("link-modal");
const linkModalClose = document.getElementById("linkModalClose");
const linkIframe = document.getElementById("link-iframe");

function openLinkModal(url, title) {
  document.getElementById("link-modal-title").innerHTML = '<i class="fa fa-globe"></i> ' + (title || 'Link');
  document.getElementById("link-modal-link").href = url;

  toggleModal(linkModal, true);

  // Load src after modal opens
  linkIframe.src = url;
}

function closeLinkModal() {
  toggleModal(linkModal, false);
  linkIframe.src = "";
}

linkModalClose.addEventListener("click", closeLinkModal);
linkModal.addEventListener("click", e => { if (e.target === linkModal) closeLinkModal(); });

// ═══════════════════════════════════════════════════════════════
//  GAME PLAYER MODAL
// ═══════════════════════════════════════════════════════════════
const gameModal = document.getElementById("game-modal");
const gameModalClose = document.getElementById("gameModalClose");
const gameIframe = document.getElementById("game-iframe");

let gameResizeHandler = null;

function openGameModal(url, title, nativeW, nativeH) {
  nativeW = nativeW || 960;
  nativeH = nativeH || 600;

  document.getElementById("game-modal-title").innerHTML = '<i class="fa fa-gamepad"></i> ' + (title || 'Play');
  document.getElementById("game-modal-link").href = url;

  // Set iframe to native game resolution
  gameIframe.style.width = nativeW + 'px';
  gameIframe.style.height = nativeH + 'px';

  toggleModal(gameModal, true);

  function fitIframe() {
    const wrap = document.querySelector('.game-embed-wrap');
    if (!wrap) return;
    const wrapW = wrap.clientWidth;
    const wrapH = wrap.clientHeight;
    const sx = wrapW / nativeW;
    const sy = wrapH / nativeH;
    const s = Math.min(sx, sy);
    gameIframe.style.transformOrigin = '0 0';
    gameIframe.style.transform = 'scale(' + s + ')';
    // Center within the wrap
    const scaledW = nativeW * s;
    const scaledH = nativeH * s;
    gameIframe.style.left = ((wrapW - scaledW) / 2) + 'px';
    gameIframe.style.top = ((wrapH - scaledH) / 2) + 'px';
  }

  // Fit after modal opens and layout settles
  requestAnimationFrame(() => { fitIframe(); });
  setTimeout(fitIframe, 50);

  if (gameResizeHandler) window.removeEventListener('resize', gameResizeHandler);
  gameResizeHandler = fitIframe;
  window.addEventListener('resize', fitIframe);

  // Load src after layout is computed
  gameIframe.src = url;
}

function closeGameModal() {
  toggleModal(gameModal, false);
  gameIframe.src = "";
  gameIframe.style.transform = '';
  gameIframe.style.width = '';
  gameIframe.style.height = '';
  gameIframe.style.left = '';
  gameIframe.style.top = '';
  if (gameResizeHandler) { window.removeEventListener('resize', gameResizeHandler); gameResizeHandler = null; }
}

gameModalClose.addEventListener("click", closeGameModal);
gameModal.addEventListener("click", e => { if (e.target === gameModal) closeGameModal(); });

// ═══════════════════════════════════════════════════════════════
//  MTG DECK MODAL SYSTEM
// ═══════════════════════════════════════════════════════════════
(() => {
  const deckModal = document.getElementById("deck-modal");
  const deckModalClose = document.getElementById("deckModalClose");

  const typeIcons = {
    Planeswalker: "🌟", Creature: "🧛", Artifact: "⚙️",
    Enchantment: "✨", Instant: "⚡", Sorcery: "🔮",
    Land: "🏔️", Token: "🪙"
  };

  const typeOrder = ["Planeswalker", "Creature", "Artifact", "Enchantment", "Instant", "Sorcery", "Land", "Token"];

  let sectionStates = [];
  let _allCards = null;   // loaded once from CARDS.csv
  let _cardsLoading = null;

  function closeDeckModal() {
    toggleModal(deckModal, false);
  }
  window.closeDeckModal = closeDeckModal;

  deckModalClose.addEventListener("click", closeDeckModal);
  deckModal.addEventListener("click", function (e) { if (e.target === deckModal) closeDeckModal(); });
  // Note: Escape key handled by the global keydown listener above

  /** Load CARDS.csv once, return promise of all card rows */
  function _loadCards() {
    if (_allCards) return Promise.resolve(_allCards);
    if (_cardsLoading) return _cardsLoading;
    _cardsLoading = fetchCSV("CARDS.csv?v=" + Date.now()).then(function (cards) {
      _allCards = cards;
      return cards;
    });
    return _cardsLoading;
  }

  window.openDeckModal = function (item) {
    const deckId = item.DECK.trim();
    _loadCards().then(function (allCards) {
      var cards = allCards.filter(function (c) { return c.deck === deckId; });
      renderDeckModal(item, cards);
    });
  };

  function pluralize(type) {
    return type === "Sorcery" ? "Sorceries" : type + "s";
  }

  function getArtSrc(card) {
    return card.art && card.art.trim() ? card.art : "";
  }

  function getPos(index, focus) {
    const diff = index - focus;
    if (diff === 0) return "0";
    if (diff === 1) return "1";
    if (diff === 2) return "2";
    if (diff === 3) return "3";
    if (diff > 3) return "hidden";
    if (diff === -1) return "-1";
    if (diff === -2) return "-2";
    if (diff < -2) return "-hidden";
    return "hidden";
  }

  function renderDeckModal(item, cards) {
    // Commander image
    const commanderName = (item.TITLE || "").replace(/:/g, ",");
    const commanderCard = cards.find(function (c) {
      const name = c["card name"] || "";
      return name.toLowerCase().includes(commanderName.toLowerCase()) ||
        commanderName.toLowerCase().includes(name.split(" // ")[0].toLowerCase());
    });

    const heroImg = document.getElementById("deck-hero-img");
    if (commanderCard && commanderCard.art && commanderCard.art.trim()) {
      heroImg.src = commanderCard.art;
    } else {
      heroImg.src = "";
    }

    const deckName = (item.NAME || "").replace(/<br\s*\/?>/gi, " ");
    document.getElementById("deck-hero-name").textContent = deckName;
    document.getElementById("deck-sticky-title").textContent = deckName;
    document.getElementById("deck-hero-motto").textContent = item.MOTTO || "";

    const heroLink = document.getElementById("deck-hero-link");
    if (item.GITHUB && item.GITHUB.trim()) {
      heroLink.href = item.GITHUB;
      heroLink.style.display = "";
    } else {
      heroLink.style.display = "none";
    }

    // Group cards by type (excluding commander)
    const typeGroups = {};
    typeOrder.forEach(function (t) { typeGroups[t] = []; });
    cards.forEach(function (c) {
      if (c === commanderCard) return;
      const types = (c.types || "").split(",").map(function (t) { return t.trim(); }).filter(Boolean);
      const seen = {};
      types.forEach(function (t) {
        if (!seen[t] && typeGroups[t]) { seen[t] = true; typeGroups[t].push(c); }
      });
    });

    // Build per-type sections
    const sectionsEl = document.getElementById("deck-sections");
    sectionsEl.innerHTML = "";
    sectionStates = [];

    typeOrder.forEach(function (type) {
      const group = typeGroups[type];
      if (group.length === 0) return;

      // Sort: cards with art first, then alphabetical
      group.sort(function (a, b) {
        const aHas = a.art && a.art.trim() ? 0 : 1;
        const bHas = b.art && b.art.trim() ? 0 : 1;
        if (aHas !== bHas) return aHas - bHas;
        return (a["card name"] || "").localeCompare(b["card name"] || "");
      });

      const section = document.createElement("div");
      section.className = "deck-section";

      section.innerHTML =
        '<div class="deck-section-heading">' +
        '<span class="deck-section-icon">' + (typeIcons[type] || "") + '</span>' +
        '<span class="deck-section-label">' + pluralize(type) + '</span>' +
        '</div>';

      const wrap = document.createElement("div");
      wrap.className = "deck-carousel-wrap";

      const prevBtn = document.createElement("button");
      prevBtn.className = "deck-carousel-btn deck-prev";
      prevBtn.textContent = "\u2039";

      const nextBtn = document.createElement("button");
      nextBtn.className = "deck-carousel-btn deck-next";
      nextBtn.textContent = "\u203A";

      const carousel = document.createElement("div");
      carousel.className = "deck-carousel";

      wrap.appendChild(prevBtn);
      wrap.appendChild(carousel);
      wrap.appendChild(nextBtn);
      section.appendChild(wrap);

      const counter = document.createElement("div");
      counter.className = "deck-carousel-counter";
      section.appendChild(counter);

      sectionsEl.appendChild(section);

      const state = { cards: group, index: 0, carouselEl: carousel, counterEl: counter, prevBtn, nextBtn };
      sectionStates.push(state);

      if (group.length <= 1) {
        prevBtn.style.display = "none";
        nextBtn.style.display = "none";
        counter.style.display = "none";
      }

      renderSectionCarousel(state);

      // Wire prev/next
      (function (st) {
        prevBtn.addEventListener("click", function () {
          if (st.index > 0) { st.index--; updateSectionPositions(st); }
        });
        nextBtn.addEventListener("click", function () {
          if (st.index < st.cards.length - 1) { st.index++; updateSectionPositions(st); }
        });
      })(state);
    });

    // Body text
    const bodyEl = document.getElementById("deck-body");
    bodyEl.innerHTML = item.TEXT && item.TEXT !== "tbd"
      ? item.TEXT
      : "<p style='color:rgba(255,255,255,0.5);font-style:italic;'>Details coming soon…</p>";

    // Wire up card-name links to navigate carousel
    bodyEl.querySelectorAll("a[data-card-link]").forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        const target = link.getAttribute("data-card-link").toLowerCase();
        for (let si = 0; si < sectionStates.length; si++) {
          const st = sectionStates[si];
          for (let ci = 0; ci < st.cards.length; ci++) {
            const name = (st.cards[ci]["card name"] || "").toLowerCase();
            if (name === target || name.indexOf(target) !== -1 || target.indexOf(name.split(" // ")[0]) !== -1) {
              st.index = ci;
              updateSectionPositions(st);

              const sectionEl = st.carouselEl.closest(".deck-section");
              if (sectionEl) {
                const modalCard = sectionEl.closest(".deck-modal-card");
                const hero = modalCard.querySelector(".deck-hero");
                const headerHeight = hero ? hero.offsetHeight : 0;
                const sectionTop = sectionEl.offsetTop - headerHeight - 12;
                modalCard.scrollTo({ top: sectionTop, behavior: "smooth" });
              }

              const cardEls = st.carouselEl.querySelectorAll(".deck-card");
              const focusedCard = cardEls[ci];
              if (focusedCard) {
                focusedCard.classList.remove("card-anchored");
                void focusedCard.offsetWidth;
                focusedCard.classList.add("card-anchored");
                focusedCard.addEventListener("animationend", function () {
                  focusedCard.classList.remove("card-anchored");
                }, { once: true });
              }
              return;
            }
          }
        }
      });
    });

    toggleModal(deckModal, true);
  }

  function renderSectionCarousel(state) {
    const container = state.carouselEl;
    container.innerHTML = "";

    if (state.prevBtn) state.prevBtn.style.visibility = state.index <= 0 ? "hidden" : "";
    if (state.nextBtn) state.nextBtn.style.visibility = state.index >= state.cards.length - 1 ? "hidden" : "";

    state.cards.forEach(function (card, i) {
      const el = document.createElement("div");
      el.className = "deck-card";
      el.setAttribute("data-pos", getPos(i, state.index));

      el.innerHTML = '<img src="' + getArtSrc(card) + '" alt="' + (card["card name"] || "") + '" loading="lazy" />' +
        '<div class="deck-card-name">' + (card["card name"] || "") + '</div>';

      (function (st, idx) {
        el.addEventListener("click", function () {
          const clickPos = getPos(idx, st.index);
          if (clickPos !== "0" && clickPos !== "hidden" && clickPos !== "-hidden") {
            st.index = idx;
            updateSectionPositions(st);
          }
        });
      })(state, i);

      container.appendChild(el);
    });

    updateSectionCounter(state);
  }

  function updateSectionPositions(state) {
    const cardEls = state.carouselEl.querySelectorAll(".deck-card");
    cardEls.forEach(function (el, i) {
      el.setAttribute("data-pos", getPos(i, state.index));
    });
    if (state.prevBtn) state.prevBtn.style.visibility = state.index <= 0 ? "hidden" : "";
    if (state.nextBtn) state.nextBtn.style.visibility = state.index >= state.cards.length - 1 ? "hidden" : "";
    updateSectionCounter(state);
  }

  function updateSectionCounter(state) {
    state.counterEl.textContent = (state.index + 1) + " / " + state.cards.length;
  }
})();
