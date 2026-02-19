// ═══════════════════════════════════════════════════════════════
//  MODAL SYSTEM
// ═══════════════════════════════════════════════════════════════
const modalState = { work: null, education: null, projects: null, hackathons: null, games: null };
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
  modalImg.src = "images/" + id + (imgExt || ".jpg");
  modalImg.alt = item.NAME || "";

  document.getElementById("modal-name").textContent = (item.NAME || "").replace(/<br\s*\/?>/gi, " ");

  const titleStr = item.TITLE || item.MOTTO || "";
  const titleBadges = titleStr.split(',').map(t => t.trim()).filter(Boolean)
    .map(t => `<span class="modal-badge">${t}</span>`).join('');
  const winBadge = item.WIN && item.WIN.trim()
    ? `<span class="modal-win-badge"><i class="fa fa-trophy"></i> ${item.WIN}</span>`
    : '';
  document.getElementById("modal-title").innerHTML = titleBadges + winBadge;

  document.getElementById("modal-biography").innerHTML = item.TEXT && item.TEXT !== "tbd"
    ? item.TEXT
    : "<p style='color:rgba(255,255,255,0.5);font-style:italic;'>Details coming soon…</p>";

  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal.classList.remove("open");
  document.body.style.overflow = "";
}

modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(); closePdfModal(); } });

// ═══════════════════════════════════════════════════════════════
//  PDF VIEWER MODAL
// ═══════════════════════════════════════════════════════════════
const pdfModal = document.getElementById("pdf-modal");
const pdfModalClose = document.getElementById("pdfModalClose");
const pdfIframe = document.getElementById("pdf-iframe");

function openPdfModal() {
  pdfIframe.src = "pdfviewer.html?file=bible.pdf";
  pdfModal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closePdfModal() {
  pdfModal.classList.remove("open");
  pdfIframe.src = "";
  document.body.style.overflow = "";
}

pdfModalClose.addEventListener("click", closePdfModal);
pdfModal.addEventListener("click", e => { if (e.target === pdfModal) closePdfModal(); });

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
  let deckCache = {};

  function closeDeckModal() {
    deckModal.classList.remove("open");
    document.body.style.overflow = "";
  }

  deckModalClose.addEventListener("click", closeDeckModal);
  deckModal.addEventListener("click", function (e) { if (e.target === deckModal) closeDeckModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDeckModal(); });

  window.openDeckModal = function (item) {
    const deckFile = item.DECK.trim();
    if (deckCache[deckFile]) {
      renderDeckModal(item, deckCache[deckFile]);
    } else {
      $.get(deckFile + "?v=" + Date.now()).then(function (csvText) {
        const cards = $.csv.toObjects(csvText);
        deckCache[deckFile] = cards;
        renderDeckModal(item, cards);
      });
    }
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

    document.getElementById("deck-hero-name").textContent = (item.NAME || "").replace(/<br\s*\/?>/gi, " ");
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

    deckModal.classList.add("open");
    document.body.style.overflow = "hidden";
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
