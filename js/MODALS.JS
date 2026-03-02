// ═════════════════════════════════════════════════════════════════
//  GLOBALS FROM DATA.JS  —  fetchCSV(), modalState
//  (DATA.JS is loaded before MODALS.JS)
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
  // Use the open-stack to find the topmost modal (z-index authoritative)
  if (_openStack.length === 0) return;
  var topModal = _openStack[_openStack.length - 1].el;
  var focusable = topModal.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])');
  if (focusable.length === 0) return;
  var first = focusable[0];
  var last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}
document.addEventListener("keydown", _trapFocus);

// ═════════════════════════════════════════════════════════════════
//  MODAL REGISTRY — one function to rule them all
//
//  registerModal(id, { onOpen, onClose })
//    → auto-wires: close-button click, backdrop click, Escape key
//    → returns { open(...args), close() }
//    → every registered modal participates in closeTopmostModal()
// ═════════════════════════════════════════════════════════════════
const _modalRegistry = [];   // all registered entries (for lookup)
const _openStack     = [];   // currently-open entries, ordered by open-time (last = topmost)
const _Z_BASE        = 200;  // base z-index for the first modal
const _Z_STEP        = 10;   // increment per stacked modal

/** Recompute z-index for every open modal based on stack order. */
function _reindex() {
  for (var i = 0; i < _openStack.length; i++) {
    _openStack[i].el.style.zIndex = _Z_BASE + (i + 1) * _Z_STEP;
  }
}

/**
 * Register a modal overlay by its DOM id.
 * @param {string} id          — the id of the .modal-overlay element
 * @param {object} [opts]
 * @param {function} [opts.onOpen]   — called AFTER toggleModal(el, true); receives forwarded args
 * @param {function} [opts.onClose]  — called BEFORE toggleModal(el, false)
 * @returns {{ open: Function, close: Function, el: Element }}
 */
function registerModal(id, opts) {
  opts = opts || {};
  var el = document.getElementById(id);
  if (!el) {
    var noop = function() {};
    return { open: noop, close: noop, el: null };
  }

  var entry = { el: el, close: close };

  function close() {
    if (!el.classList.contains("open")) return;
    if (opts.onClose) opts.onClose();
    toggleModal(el, false);
    // Remove from open stack and reindex survivors
    var idx = _openStack.indexOf(entry);
    if (idx !== -1) _openStack.splice(idx, 1);
    el.style.zIndex = "";
    _reindex();
  }

  function open() {
    // If already open, just promote to top of stack
    var idx = _openStack.indexOf(entry);
    if (idx !== -1) _openStack.splice(idx, 1);
    _openStack.push(entry);
    _reindex();

    if (!el.classList.contains("open")) {
      toggleModal(el, true);
    }
    if (opts.onOpen) opts.onOpen.apply(null, arguments);
    var card = el.querySelector(".modal-card");
    if (card) card.scrollTop = 0;
  }

  // Auto-wire close button (first .modal-close inside the overlay)
  var closeBtn = el.querySelector(".modal-close");
  if (closeBtn) closeBtn.addEventListener("click", close);

  // Backdrop click
  el.addEventListener("click", function (e) { if (e.target === el) close(); });

  _modalRegistry.push(entry);
  return { open: open, close: close, el: el };
}

// ── Escape key: close the topmost open modal ─────────────────
document.addEventListener("keydown", function (e) {
  if (e.key !== "Escape" || _openStack.length === 0) return;
  _openStack[_openStack.length - 1].close();
});

// ═══════════════════════════════════════════════════════════════
//  MODAL SYSTEM  (modalState provided by DATA.JS)
// ═══════════════════════════════════════════════════════════════
const modal = document.getElementById("modal");
const modalClose = document.getElementById("modalClose");

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

function _fadeOutGlow() {
  if (_glowingTile) {
    _glowingTile.classList.remove('tile-glow');
    _glowingTile.classList.add('tile-glow-fade');
    const el = _glowingTile;
    _glowingTile = null;
    setTimeout(() => el.classList.remove('tile-glow-fade'), 500);
  }
}

var _dataModal = registerModal("modal", {
  onClose: _fadeOutGlow
});

function openModal(dataset, id, imgExt) {
  const data = modalState[dataset];
  if (!data) return;
  const item = data.find(d => d.ID === id);
  if (!item) return;

  const modalImg = document.getElementById("modal-image");
  modalImg.style.display = "none";
  modalImg.onload = function () { this.style.display = ""; };
  modalImg.onerror = function () { this.style.display = "none"; };
  modalImg.src = "png/" + id + (imgExt || ".png");
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

  _dataModal.open();
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

function closeModal() { _dataModal.close(); }

// ── Footer year (safe alternative to document.write) ──
const footerYear = document.getElementById("footer-year");
if (footerYear) footerYear.textContent = new Date().getFullYear();

// ── Video-card event delegation (replaces inline onclick/onkeydown) ──
const _modalOpeners = {
  marpModal: function() { window.openMarpModal(); },
  pdfModal: function() { openPdfModal(); },
  bitnaughtsIphoneModal: function() { openBitnaughtsIphoneModal(); },
  archModal: function() { window.openArchModal(); },
  tentimesModal: function() { window.openTentimesModal && window.openTentimesModal(); },
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

// Arch / Marp / Tentimes modals — registered by MERMAID.JS via registerModal()

// ═══════════════════════════════════════════════════════════════
// QUILTING MODAL (Easter Egg)
// ═══════════════════════════════════════════════════════════════
var _stopBioTour = null;
var _quiltModal = registerModal("quilt-modal", {
  onOpen:  function () { if (typeof _dismissBioToast === "function") _dismissBioToast(); },
  onClose: function () { if (_stopBioTour) _stopBioTour(); }
});
var quiltModal = document.getElementById("quilt-modal");

function openQuiltModal()  { _quiltModal.open(); }
function closeQuiltModal() { _quiltModal.close(); }

// ── Overscroll bounce ────────────────────────────────────────
var _bioTourScrolling = false;   // set by bio tour to suppress bounce
(function () {
  var card = quiltModal.querySelector(".modal-card");
  var bouncing = false;
  card.addEventListener("scroll", function () {
    if (bouncing || _bioTourScrolling) return;
    var st = card.scrollTop;
    var maxScroll = card.scrollHeight - card.clientHeight;
    if (st <= 0 || st >= maxScroll) {
      bouncing = true;
      var dir = st <= 0 ? 1 : -1;
      card.style.transition = "transform 0.15s ease-out";
      card.style.transform = "translateY(" + (dir * 12) + "px)";
      setTimeout(function () {
        card.style.transition = "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)";
        card.style.transform = "";
        setTimeout(function () {
          card.style.transition = "";
          bouncing = false;
        }, 300);
      }, 150);
    }
  }, { passive: true });
})();

// ── Bio image + quote viewer crossfade ───────────────────────
(function () {
  // For each bio-stat-row that has tiles with data-bio-img,
  // find the sibling bio-img-viewer and bio-quote-viewer above it
  // and wire up hover crossfade for both.
  var rows = quiltModal.querySelectorAll(".bio-stat-row");
  rows.forEach(function (row) {
    var tiles = row.querySelectorAll("[data-bio-img]");
    if (!tiles.length) return;

    // Walk backwards for img-viewer, forwards for quote-viewer
    var viewer = null, quoteViewer = null;
    var sib = row.previousElementSibling;
    while (sib) {
      if (!viewer && sib.classList.contains("bio-img-viewer")) { viewer = sib; break; }
      sib = sib.previousElementSibling;
    }
    sib = row.nextElementSibling;
    while (sib) {
      if (sib.classList.contains("bio-quote-viewer")) { quoteViewer = sib; break; }
      if (sib.classList.contains("bio-symbol-block") || sib.classList.contains("bio-principle-block") || sib.tagName === "H3" || sib.tagName === "HR") break;
      sib = sib.nextElementSibling;
    }

    var layers = viewer ? viewer.querySelectorAll(".bio-img-layer") : [];
    var quotes = quoteViewer ? quoteViewer.querySelectorAll(".bio-quote-layer") : [];

    // Apply per-tile --bio-glow from data-bio-color
    tiles.forEach(function (tile) {
      var c = tile.dataset.bioColor;
      if (c) tile.style.setProperty("--bio-glow", c);
    });

    // Set initial viewer glow from the first active tile
    var firstActive = row.querySelector(".bio-stat-active");
    if (firstActive && firstActive.dataset.bioColor && viewer) {
      viewer.style.setProperty("--bio-viewer-glow", firstActive.dataset.bioColor);
    }

    function activate(tile) {
      var idx = parseInt(tile.dataset.bioImg, 10);
      if (isNaN(idx)) return;

      // Remove active from all tiles in this row
      tiles.forEach(function (t) { t.classList.remove("bio-stat-active"); });
      tile.classList.add("bio-stat-active");

      // Crossfade images
      if (layers.length) {
        layers.forEach(function (l) { l.classList.remove("bio-img-active"); });
        if (layers[idx]) layers[idx].classList.add("bio-img-active");
      }

      // Crossfade quotes
      if (quotes.length) {
        quotes.forEach(function (q) { q.classList.remove("bio-quote-active"); });
        if (quotes[idx]) quotes[idx].classList.add("bio-quote-active");
      }

      // Push glow color to viewer
      var c = tile.dataset.bioColor;
      if (c && viewer) viewer.style.setProperty("--bio-viewer-glow", c);
    }

    tiles.forEach(function (tile) {
      tile.addEventListener("mouseenter", function () { activate(tile); });
      tile.addEventListener("focus", function () { activate(tile); });
    });

    // Make image viewer clickable — triggers the active tile's action
    if (viewer) {
      viewer.style.cursor = "pointer";
      viewer.addEventListener("click", function () {
        var active = row.querySelector(".bio-stat-active[data-action]");
        if (active) active.click();
      });
    }
  });
})();

// ── Hero penguin background cycle ────────────────────────────
(function () {
  var a = document.getElementById("heroPenguinBgA");
  var b = document.getElementById("heroPenguinBgB");
  var link = document.querySelector(".hero-portrait-link");
  var penguin = link && link.querySelector(".hero-penguin-emoji");
  if (!a || !b || !link || !penguin) return;
  var emojis = ["🌎","🌍","🌏", "🏙️","🌁","🌇","🌆","🌃","🌌", "🌠"];
  var SHOOTING_STAR = "🌠";
  var idx = 0;
  var front = a;
  var back = b;
  var timer = null;

  // Emoji → glow color (r, g, b)
  var glowMap = {
    "🌎": "0, 164, 239",     // MSFT blue
    "🌍": "0, 164, 239",     // MSFT blue
    "🌏": "0, 164, 239",     // MSFT blue
    "🏙️": "127, 186, 0",     // MSFT green
    "🌁": "127, 186, 0",     // MSFT green
    "🌇": "242, 80, 34",     // MSFT red
    "🌆": "242, 80, 34",     // MSFT red
    "🌃": "242, 80, 34",     // MSFT red
    "🌌": "255, 185, 0",     // MSFT yellow
    "🌠": "255, 185, 0"      // MSFT yellow
  };
  var circle = link.querySelector(".hero-portrait-penguin");

  function step() {
    idx = (idx + 1) % emojis.length;
    back.textContent = emojis[idx];
    back.style.opacity = "0.35";
    front.style.opacity = "0";
    var tmp = front;
    front = back;
    back = tmp;

    // Update glow color
    if (circle && glowMap[emojis[idx]]) {
      circle.style.setProperty("--glow", glowMap[emojis[idx]]);
    }

    // Hide penguin on shooting star, bring it back otherwise
    if (emojis[idx] === SHOOTING_STAR) {
      penguin.style.transition = "opacity 0.8s ease";
      penguin.style.opacity = "0";
    } else if (penguin.style.opacity === "0") {
      penguin.style.transition = "opacity 0.8s ease";
      penguin.style.opacity = "1";
    }
  }

  function start() {
    if (timer) return;
    idx = 0;
    front = a; back = b;
    a.textContent = emojis[0];
    a.style.opacity = "0.35";
    b.style.opacity = "0";
    penguin.style.opacity = "";
    penguin.style.transition = "";
    if (circle) circle.style.setProperty("--glow", glowMap[emojis[0]]);
    timer = setInterval(step, 1000);
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    a.style.opacity = "0";
    b.style.opacity = "0";
    penguin.style.opacity = "";
    penguin.style.transition = "";
  }

  link.addEventListener("mouseenter", start);
  link.addEventListener("mouseleave", stop);

  // Also respond to programmatic .hover class toggle
  new MutationObserver(function () {
    if (link.classList.contains("hover")) start();
    else if (!link.matches(":hover")) stop();
  }).observe(link, { attributes: true, attributeFilter: ["class"] });
})();

// ── Bio Tour ─────────────────────────────────────────────────
(function () {
  var hint = document.getElementById("bioExploreHint");
  var card = quiltModal.querySelector(".modal-card");
  if (!hint || !card) return;

  var HINT_DEFAULT = '<strong>Traverse</strong><span class="scroll-arrow">🔭</span>';
  var _cf = createCrossfader();
  var _raf = null;
  var _scrolling = false;

  // Tour stops for crossfading the hint label as we scroll past them
  function getStops() {
    return Array.from(card.querySelectorAll("[data-bio-tour]")).map(function (el) {
      // Find the bio-stat-row associated with this tour stop's section
      var tiles = [];
      var sib = el.nextElementSibling;
      while (sib) {
        if (sib.classList.contains("bio-stat-row")) {
          tiles = Array.from(sib.querySelectorAll("[data-bio-img]"));
          break;
        }
        // Stop if we hit the next section
        if (sib.hasAttribute("data-bio-tour") || sib.tagName === "H3") break;
        sib = sib.nextElementSibling;
      }
      return { el: el, label: el.getAttribute("data-bio-tour"), tiles: tiles };
    });
  }

  // ── Tile activation + tour label engine ──
  var _cachedStops = null;

  // Resolve which stop + tile is active at current scroll position
  function resolveScrollStop(stops) {
    var maxS = card.scrollHeight - card.clientHeight;
    var scrollMid = card.scrollTop + card.clientHeight * 0.4 + 100;
    for (var i = stops.length - 1; i >= 0; i--) {
      if (stops[i].el.offsetTop <= scrollMid) {
        // Activate tiles progressively within this section's scroll range
        var stop = stops[i];
        if (stop.tiles.length > 1) {
          var sectionTop = stop.el.offsetTop;
          var sectionBot = (i + 1 < stops.length) ? stops[i + 1].el.offsetTop : maxS + card.clientHeight;
          var sectionRange = sectionBot - sectionTop;
          if (sectionRange > 0) {
            var localProgress = (scrollMid - sectionTop) / sectionRange;
            localProgress = Math.max(0, Math.min(1, localProgress));
            var tileIdx = Math.min(Math.floor(localProgress * stop.tiles.length), stop.tiles.length - 1);
            var activeTile = stop.tiles[tileIdx];
            if (activeTile && !activeTile.classList.contains("bio-stat-active")) {
              activeTile.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
            }
          }
        }
        return i;
      }
    }
    return -1;
  }

  // Tour-mode: update hint label + activate tiles
  function syncScrollState(stops, lastStopIdxRef) {
    var i = resolveScrollStop(stops);
    if (i >= 0 && i !== lastStopIdxRef.v) {
      lastStopIdxRef.v = i;
      var label = stops[i].label;
      var m = label.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)\s*/u);
      var emoji = m ? m[1] : '🐧';
      var text = m ? label.slice(m[0].length) : label;
      _cf.fade(hint, '<strong>' + text + '</strong><span class="scroll-arrow">' + emoji + '</span>');
    }
  }

  // ── Passive scroll: activate tiles only (label stays "Traverse") ──
  card.addEventListener("scroll", function () {
    if (_scrolling) return;
    if (!_cachedStops) _cachedStops = getStops();
    resolveScrollStop(_cachedStops);
  }, { passive: true });

  // Invalidate cached stops when modal opens (DOM may have changed)
  quiltModal.addEventListener("transitionend", function () {
    if (quiltModal.classList.contains("open")) {
      _cachedStops = null;
    }
  });

  var _tourCleanup = null;
  function stopScroll() {
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
    if (!_scrolling) return;
    _scrolling = false;
    _bioTourScrolling = false;
    if (_tourCleanup) { _tourCleanup(); _tourCleanup = null; }
    hint.classList.remove("exploring");
    _cf.fade(hint, HINT_DEFAULT);
    hint.style.pointerEvents = '';
  }

  function startScroll() {
    var maxS = card.scrollHeight - card.clientHeight;
    if (card.scrollTop >= maxS - 1) {
      card.scrollTo({ top: 0, behavior: "smooth" });
      _cf.fade(hint, HINT_DEFAULT);
      return;
    }

    _scrolling = true;
    _bioTourScrolling = true;
    hint.classList.add("exploring");

    var SPEED_MAX = 75;  // px/s cruising speed
    var RAMP_DUR = 0.5;  // seconds to lerp from 0 → SPEED_MAX
    var elapsed = 0;
    var lastT = null;
    var scrollPos = card.scrollTop; // float accumulator: avoids integer rounding stutter
    var interrupted = false;
    var stops = getStops();
    var tourStopRef = { v: -1 };

    function onUser() { interrupted = true; }
    function hintSwallow(e) { e.stopPropagation(); }
    hint.addEventListener("pointerdown", hintSwallow);
    card.addEventListener("wheel", onUser, { once: true, passive: true });
    card.addEventListener("touchstart", onUser, { once: true, passive: true });
    card.addEventListener("pointerdown", onUser, { once: true });

    function step(ts) {
      if (interrupted) { cleanup(); return; }
      if (!lastT) { lastT = ts; _raf = requestAnimationFrame(step); return; } // skip first frame (dt=0)
      var dt = (ts - lastT) / 1000;
      lastT = ts;
      elapsed += dt;

      var speed = elapsed >= RAMP_DUR ? SPEED_MAX : SPEED_MAX * (elapsed / RAMP_DUR);
      var maxS = card.scrollHeight - card.clientHeight;

      scrollPos += speed * dt;
      card.scrollTop = scrollPos;

      syncScrollState(stops, tourStopRef);

      if (card.scrollTop >= maxS - 1) { cleanup(); return; }
      _raf = requestAnimationFrame(step);
    }

    _tourCleanup = function () {
      hint.removeEventListener("pointerdown", hintSwallow);
      card.removeEventListener("wheel", onUser);
      card.removeEventListener("touchstart", onUser);
      card.removeEventListener("pointerdown", onUser);
    };

    function cleanup() {
      stopScroll();
      _cachedStops = stops;
    }

    _raf = requestAnimationFrame(step);
  }

  hint.addEventListener("click", function (e) {
    e.preventDefault();
    if (_scrolling) { stopScroll(); return; }
    startScroll();
  });

  _stopBioTour = stopScroll;
})();

// Marp + Tentimes modals — registered by MERMAID.JS via registerModal()

// ═══════════════════════════════════════════════════════════════
//  BITNAUGHTS GALLERY MODALS
// ═══════════════════════════════════════════════════════════════
var _bnModal       = registerModal("bitnaughts-modal");
var _bnIphoneModal = registerModal("bitnaughts-iphone-modal");

function openBitnaughtsModal()        { _bnModal.open(); }
function closeBitnaughtsModal()       { _bnModal.close(); }
function openBitnaughtsIphoneModal()  { _bnIphoneModal.open(); }
function closeBitnaughtsIphoneModal() { _bnIphoneModal.close(); }

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
//  PDF VIEWER MODALS
// ═══════════════════════════════════════════════════════════════
var _pdfModal = registerModal("pdf-modal", {
  onOpen:  function () { renderPdfInline("pdf/bible.pdf"); },
  onClose: function () { clearpdf(); }
});
function openPdfModal()  { _pdfModal.open(); }
function closePdfModal() { _pdfModal.close(); }

var _resumePdfModal = registerModal("resume-pdf-modal", {
  onOpen:  function () { renderPdfInline("pdf/resume.pdf", { viewerId: "resume-pdf-viewer", loadingId: "resume-pdf-loading", singlePage: true }); },
  onClose: function () { clearpdf("resume-pdf-viewer"); }
});
function openResumePdfModal()  { _resumePdfModal.open(); }
function closeResumePdfModal() { _resumePdfModal.close(); }

// ═══════════════════════════════════════════════════════════════
//  EXTERNAL LINK IFRAME MODAL
// ═══════════════════════════════════════════════════════════════
var _linkIframe = document.getElementById("link-iframe");
var _linkModal = registerModal("link-modal", {
  onClose: function () { _linkIframe.src = ""; }
});

function openLinkModal(url, title) {
  document.getElementById("link-modal-title").innerHTML = '<i class="fa fa-globe"></i> ' + (title || 'Link');
  document.getElementById("link-modal-link").href = url;
  _linkModal.open();
  _linkIframe.src = url;
}
function closeLinkModal() { _linkModal.close(); }

// ═══════════════════════════════════════════════════════════════
//  GAME PLAYER MODAL
// ═══════════════════════════════════════════════════════════════
var _gameIframe = document.getElementById("game-iframe");
var _gameResizeHandler = null;

var _gameModal = registerModal("game-modal", {
  onClose: function () {
    _gameIframe.src = "";
    _gameIframe.style.transform = '';
    _gameIframe.style.width = '';
    _gameIframe.style.height = '';
    _gameIframe.style.left = '';
    _gameIframe.style.top = '';
    if (_gameResizeHandler) { window.removeEventListener('resize', _gameResizeHandler); _gameResizeHandler = null; }
  }
});

function openGameModal(url, title, nativeW, nativeH) {
  nativeW = nativeW || 960;
  nativeH = nativeH || 600;

  document.getElementById("game-modal-title").innerHTML = '<i class="fa fa-gamepad"></i> ' + (title || 'Play');
  document.getElementById("game-modal-link").href = url;

  _gameIframe.style.width = nativeW + 'px';
  _gameIframe.style.height = nativeH + 'px';

  _gameModal.open();

  function fitIframe() {
    var wrap = document.querySelector('.game-embed-wrap');
    if (!wrap) return;
    var wrapW = wrap.clientWidth;
    var wrapH = wrap.clientHeight;
    var sx = wrapW / nativeW;
    var sy = wrapH / nativeH;
    var s = Math.min(sx, sy);
    _gameIframe.style.transformOrigin = '0 0';
    _gameIframe.style.transform = 'scale(' + s + ')';
    var scaledW = nativeW * s;
    var scaledH = nativeH * s;
    _gameIframe.style.left = ((wrapW - scaledW) / 2) + 'px';
    _gameIframe.style.top = ((wrapH - scaledH) / 2) + 'px';
  }

  requestAnimationFrame(fitIframe);
  setTimeout(fitIframe, 50);

  if (_gameResizeHandler) window.removeEventListener('resize', _gameResizeHandler);
  _gameResizeHandler = fitIframe;
  window.addEventListener('resize', fitIframe);

  _gameIframe.src = url;
}

function closeGameModal() { _gameModal.close(); }

// ═══════════════════════════════════════════════════════════════
//  MTG DECK MODAL SYSTEM
// ═══════════════════════════════════════════════════════════════
(() => {
  var _deckReg = registerModal("deck-modal");
  var deckModal = document.getElementById("deck-modal");
  window.closeDeckModal = _deckReg.close;

  const typeIcons = {
    Planeswalker: "🌟", Creature: "🧛", Artifact: "✨",
    Enchantment: "🌩️", Instant: "⚡", Sorcery: "🔮",
    Land: "⛈️", Token: "🪙"
  };

  const typeOrder = ["Planeswalker", "Creature", "Artifact", "Enchantment", "Instant", "Sorcery", "Land", "Token"];

  let sectionStates = [];
  let _allCards = null;   // loaded once from CARDS.csv
  let _cardsLoading = null;

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

    _deckReg.open();
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
