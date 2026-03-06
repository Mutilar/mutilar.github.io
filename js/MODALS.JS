// ═════════════════════════════════════════════════════════════════
//  GLOBALS FROM DATA.JS  —  loadCardsJSON(), modalState
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
    window.dispatchEvent(new CustomEvent("modal-count-changed", { detail: { count: _modalOpenCount } }));
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
    window.dispatchEvent(new CustomEvent("modal-count-changed", { detail: { count: _modalOpenCount } }));

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
const _modalByKey    = {};   // key → entry (for openModal(key) lookup)
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
    el = document.createElement('div');
    el.className = 'modal-overlay';
    el.id = id;
    el.setAttribute('role', opts.role || 'dialog');
    if (opts.ariaLabel) el.setAttribute('aria-label', opts.ariaLabel);
    document.body.appendChild(el);
  }

  var entry = { el: el, close: close, open: open };

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

  if (opts.key) _modalByKey[opts.key] = entry;
  _modalRegistry.push(entry);
  return { open: open, close: close, el: el };
}

// ── Escape key: close the topmost open modal ─────────────────
document.addEventListener("keydown", function (e) {
  if (e.key !== "Escape" || _openStack.length === 0) return;
  _openStack[_openStack.length - 1].close();
});

// ═══════════════════════════════════════════════════════════════
//  UNIFIED MODAL API — openModal(key), closeModal(key)
//
//  Resolves a content key against:
//    1. Keyed registry  (registerModal with opts.key)
//    2. __SETTINGS.modals[key].elementId
//    3. Element-ID convention: key  or  key + "-modal"
//  Works across biography, fragment, viz — any registered modal.
// ═══════════════════════════════════════════════════════════════
function _resolveModal(key) {
  if (_modalByKey[key]) return _modalByKey[key];
  var elId = null;
  var s = window.__SETTINGS;
  if (s && s.modals && s.modals[key]) {
    elId = s.modals[key].elementId || (key + '-modal');
  }
  if (!elId) elId = document.getElementById(key) ? key : (key + '-modal');
  for (var i = 0; i < _modalRegistry.length; i++) {
    if (_modalRegistry[i].el && _modalRegistry[i].el.id === elId) {
      _modalByKey[key] = _modalRegistry[i];
      return _modalRegistry[i];
    }
  }
  return null;
}

window.openModal = function (key) {
  var entry = _resolveModal(key);
  if (entry) { entry.open.apply(null, Array.prototype.slice.call(arguments, 1)); return; }
  console.warn('[openModal] unknown key:', key);
};

window.closeModal = function (key) {
  if (!key && _openStack.length) { _openStack[_openStack.length - 1].close(); return; }
  var entry = _resolveModal(key);
  if (entry) { entry.close(); return; }
  console.warn('[closeModal] unknown key:', key);
};

// ═══════════════════════════════════════════════════════════════
//  MODAL SYSTEM  (modalState provided by DATA.JS)
//  Each modal auto-creates its overlay if absent (via _ensureOverlay).
//  Every modal is registered with a key → openModal(key, ...args).
// ═══════════════════════════════════════════════════════════════
function _ensureOverlay(id) {
  var el = document.getElementById(id);
  if (!el) { el = document.createElement('div'); el.className = 'modal-overlay'; el.id = id; document.body.appendChild(el); }
  return el;
}

var modal = _ensureOverlay("modal");
// ── Entry modal shell (replaces MODAL.HTML fragment) ──
modal.innerHTML =
  '<div class="glass-tile modal-card" style="position:relative;">' +
    '<div class="modal-sticky-bar"><div class="modal-sticky-group tl-glow">' +
      '<p class="modal-subtitle" id="modal-title"></p>' +
      '<button class="modal-close" id="modalClose" aria-label="Close modal">&times;</button>' +
    '</div></div>' +
    '<img class="modal-img" id="modal-image" src="" alt="" />' +
    '<div class="modal-header-row"><h2 class="modal-title" id="modal-name"></h2></div>' +
    '<div class="modal-body" id="modal-biography"></div>' +
  '</div>';

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
  key: "entry",
  onClose: _fadeOutGlow
});

function _populateEntry(dataset, id, imgExt) {
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
      : `<a href="#" class="modal-play-badge" onclick="event.preventDefault(); event.stopPropagation(); closeModal('entry'); openModal('game', '${item.PLAY.trim()}', '${(item.NAME || '').replace(/'/g, "\\'")}', ${item.PLAY_W || 960}, ${item.PLAY_H || 600})"><i class="fa fa-gamepad"></i> Play me!</a>`)
    : '';
  document.getElementById("modal-title").innerHTML = playBadge + titleBadges + winBadge;

  document.getElementById("modal-biography").innerHTML = item.TEXT && item.TEXT !== "tbd"
    ? item.TEXT
    : "<p style='color:rgba(255,255,255,0.5);font-style:italic;'>Details coming soon…</p>";

  // Glow the source tile
  _applyGlow(dataset, id);
}

// Override registry entry so openModal('entry', ...) does setup then opens
_modalByKey["entry"] = {
  el: _dataModal.el,
  open: function(dataset, id, imgExt) {
    _populateEntry(dataset, id, imgExt);
    _dataModal.open();
  },
  close: _dataModal.close
};

function navigateToModal(dataset, id, imgExt) {
  // Clear any existing glow without the fade-out animation
  if (_glowingTile) {
    _glowingTile.classList.remove('tile-glow', 'tile-glow-fade');
    _glowingTile = null;
  }
  openModal('entry', dataset, id, imgExt);
}

window.openEntry       = function(dataset, id, imgExt) { openModal('entry', dataset, id, imgExt); };
window.closeEntry      = function() { closeModal('entry'); };
window.navigateToModal = navigateToModal;

// ── Footer year (safe alternative to document.write) ──
const footerYear = document.getElementById("footer-year");
if (footerYear) footerYear.textContent = new Date().getFullYear();

// Mermaid modals — lazily created by openMermaidModal() in MERMAID.JS

// ═══════════════════════════════════════════════════════════════
//  BITNAUGHTS GALLERY MODALS
// ═══════════════════════════════════════════════════════════════
function _buildGalleryShell(el, cfg) {
  if (!el) return;
  var items = '';
  cfg.items.forEach(function(item) {
    items += '<div class="bitnaughts-gallery-item">' +
      '<div class="bitnaughts-gallery-label">' + item.label + '</div>' +
      '<img src="' + item.src + '" alt="' + item.alt + '" loading="lazy">' +
    '</div>';
  });
  el.innerHTML =
    '<div class="glass-tile modal-card bitnaughts-modal-card" style="position:relative;">' +
      '<div class="modal-sticky-bar"><div class="modal-sticky-group tl-glow">' +
        '<h2 class="modal-sticky-title">' + cfg.title + '</h2>' +
        '<a class="modal-sticky-link" href="' + cfg.linkHref + '" target="_blank"><i class="fa fa-github"></i> ' + cfg.linkText + '</a>' +
        '<button class="modal-close" aria-label="Close modal">&times;</button>' +
      '</div></div>' +
      '<div class="bitnaughts-gallery">' + items + '</div>' +
    '</div>';
}

_buildGalleryShell(_ensureOverlay("bitnaughts-modal"), {
  title: '\u2604 BitNaughts: Early Iterations',
  linkHref: 'https://github.com/bitnaughts',
  linkText: 'bitnaughts',
  items: [
    { label: '\uD83C\uDFA8 3D Ship Design', src: 'png/bn-3d.gif', alt: 'BitNaughts 3D Ship' },
    { label: '\uD83D\uDDA5\uFE0F UI Prototype', src: 'png/bn-ui.gif', alt: 'BitNaughts UI' },
    { label: '\uD83C\uDFAD Color Palette Exploration', src: 'png/bn-colors.gif', alt: 'BitNaughts Colors' }
  ]
});

_buildGalleryShell(_ensureOverlay("bitnaughts-iphone-modal"), {
  title: '\u2604 BitNaughts: U.X. Design',
  linkHref: 'https://github.com/bitnaughts',
  linkText: 'bitnaughts',
  items: [
    { label: '\uD83D\uDCF1 Ship Overview', src: 'png/bitnaughtsiphone.png', alt: 'BitNaughts iPhone Ship Overview' },
    { label: '\uD83D\uDCF1 Navigation U.X.', src: 'png/bitnaughtsiphone2.png', alt: 'BitNaughts iPhone Navigation' },
    { label: '\uD83D\uDCF1 Terminal U.X.', src: 'png/bitnaughtsiphone3.png', alt: 'BitNaughts iPhone Terminal' },
    { label: '\uD83D\uDCF1 Inventory U.X.', src: 'png/bitnaughtsiphone4.png', alt: 'BitNaughts iPhone Inventory' }
  ]
});

var _bnModal       = registerModal("bitnaughts-modal", { key: "bitnaughts" });
var _bnIphoneModal = registerModal("bitnaughts-iphone-modal", { key: "bitnaughtsIphone" });

window.openBitnaughtsModal       = function() { openModal('bitnaughts'); };
window.openBitnaughtsIphoneModal = function() { openModal('bitnaughtsIphone'); };

// Close modal when clicking an in-page anchor link (e.g. #games)
// but NOT if the link navigates to another modal via navigateToModal
modal.addEventListener("click", function (e) {
  const link = e.target.closest("a[href^='#']");
  if (!link) return;
  const onclickAttr = link.getAttribute("onclick") || "";
  if (onclickAttr.indexOf("navigateToModal") !== -1) return;
  closeModal('entry');
});

// ═══════════════════════════════════════════════════════════════
//  PDF VIEWER MODAL (single reusable overlay)
//  openModal('pdf') / openModal('resume') — or any key registered
//  below.  Config drives the PDF path, layout, and element IDs.
// ═══════════════════════════════════════════════════════════════
var _pdfOverlay = _ensureOverlay("pdf-modal");
var _pdfCurrentCfg = null;

var _pdfConfigs = {
  pdf:    { src: "pdf/bible.pdf",  singlePage: false, title: "Dusk Rose Codex" },
  resume: { src: "pdf/resume.pdf", singlePage: true,  title: "Resume" }
};

function _buildPdfShell(cfg) {
  return '<div class="glass-tile modal-card pdf-modal-card" style="position:relative;">' +
    '<div class="modal-sticky-bar"><div class="modal-sticky-group tl-glow">' +
      '<a class="modal-sticky-link" href="' + cfg.src + '" target="_blank"><i class="fa fa-external-link"></i> Open in new tab</a>' +
      '<button class="modal-close" aria-label="Close modal">&times;</button>' +
    '</div></div>' +
    '<div class="pdf-embed-wrap">' +
      '<div id="pdf-loading" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#aaa;font-family:system-ui,sans-serif;font-size:15px;z-index:10;">Loading PDF…</div>' +
      '<div id="pdf-viewer"></div>' +
    '</div></div>';
}

var _pdfReg = registerModal("pdf-modal", {
  key: "pdf",
  onOpen: function () {
    var cfg = _pdfCurrentCfg || _pdfConfigs.pdf;
    _pdfOverlay.innerHTML = _buildPdfShell(cfg);
    // Re-wire close button after innerHTML swap
    var btn = _pdfOverlay.querySelector(".modal-close");
    if (btn) btn.addEventListener("click", function () { _pdfReg.close(); });
    renderPdfInline(cfg.src, { viewerId: "pdf-viewer", loadingId: "pdf-loading", singlePage: cfg.singlePage });
  },
  onClose: function () { clearpdf("pdf-viewer"); _pdfCurrentCfg = null; }
});

// Register additional keys that target the same overlay
_modalByKey["resume"] = {
  el: _pdfReg.el,
  open: function () { _pdfCurrentCfg = _pdfConfigs.resume; _pdfReg.open(); },
  close: _pdfReg.close
};

// ═══════════════════════════════════════════════════════════════
//  VIZ SHELL BUILDER — shared by knowledge-graph & mtg-tree
//
//  buildVizShell(modalEl, cfg) → { closeBtn, layoutToggle, filterRefs, viewport, svgEl }
//
//  cfg: {
//    cardClass   – extra CSS class on .modal-card (e.g. "kg-modal-card")
//    closeId     – id for close button
//    toggleId    – id for layout toggle button
//    toggleIcon  – emoji for toggle (default "📌")
//    toggleTc    – --tc color for toggle (default "0,120,212")
//    toggleTitle – tooltip (optional)
//    svgClass    – CSS class on edge SVG (e.g. "kg-edges")
//    filterGroups – [{
//        btnClass   – CSS class for buttons in this group ("viz-filter")
//        dataAttr   – data attribute name ("filter", "type", "color", "deck")
//        separator  – bool: prepend a "|" separator before this group
//        items      – [{
//          value, tc, tcLight?, emoji, dot?, ariaLabel?,
//          allIndicator? (for "all" buttons)
//        }]
//    }]
//    accessibility – { role?, ariaRoledescription?, ariaLabel?, srDescriptions?:string[] }
//  }
// ═══════════════════════════════════════════════════════════════
function buildVizShell(modalEl, cfg) {
  var cardCls = "glass-tile modal-card viz-modal-card" + (cfg.cardClass ? " " + cfg.cardClass : "");

  // ── Filter toolbar buttons ──
  var filterHTML = "";
  (cfg.filterGroups || []).forEach(function (group) {
    if (group.separator) {
      var sepCls = group.separatorClass || "viz-filter-sep";
      filterHTML += '<span class="' + sepCls + '" aria-hidden="true">│</span>';
    }
    group.items.forEach(function (item) {
      var cls = group.btnClass || "viz-filter";
      var active = item.active ? " active" : "";
      var dataStr = ' data-' + group.dataAttr + '="' + item.value + '"';
      if (group.filterGroup) dataStr += ' data-filter-group="' + group.filterGroup + '"';
      var style = ' style="--tc:' + item.tc;
      if (item.tcLight) style += ';--tc-light:' + item.tcLight;
      style += '"';
      var ariaP = item.ariaPressed != null ? ' aria-pressed="' + item.ariaPressed + '"' : '';
      var ariaL = item.ariaLabel ? ' aria-label="' + item.ariaLabel + '"' : '';
      var titleAttr = item.title ? ' title="' + item.title + '"' : '';
      var dot = "";
      if (item.allIndicator) {
        dot = '<span class="all-indicator">' + item.allIndicator + '</span>';
      } else if (item.dot) {
        dot = '<span class="viz-dot" style="background:rgba(' + item.dot + ',0.9);"></span> ';
      }
      var label = item.trailingLabel || "";
      filterHTML += '<button class="' + cls + active + '"' + dataStr + style + ariaP + ariaL + titleAttr + '>' +
        dot + item.emoji + (label ? " " + label : "") + '</button>';
    });
  });

  // ── Toggle button ──
  var _toggleAccents = (window.__SETTINGS && window.__SETTINGS.accents) || [];
  var toggleTc = cfg.toggleTc || (_toggleAccents[0] || "0,164,239").replace(/\s/g, '');
  var toggleIcon = cfg.toggleIcon || "📌";
  var toggleTitle = cfg.toggleTitle || "Static: nodes keep their positions when filtering. Dynamic: nodes reflow into new positions.";
  var toggleAria = ' aria-label="Toggle static or dynamic layout"';
  var toggleHTML = '<button class="viz-layout-toggle" id="' + cfg.toggleId + '" style="--tc:' + toggleTc + '"' +
    ' title="' + toggleTitle + '"' + toggleAria + '>' + toggleIcon + '</button>';

  // ── Close button ──
  var closeHTML = '<button class="modal-close" id="' + cfg.closeId + '" aria-label="Close modal">&times;</button>';

  // ── Accessibility ──
  var acc = cfg.accessibility || {};
  var vpRole = acc.role ? ' role="' + acc.role + '"' : '';
  var vpRD   = acc.ariaRoledescription ? ' aria-roledescription="' + acc.ariaRoledescription + '"' : '';
  var vpAL   = acc.ariaLabel ? ' aria-label="' + acc.ariaLabel + '"' : '';
  var srHTML  = "";
  if (acc.liveRegionId) {
    srHTML += '<div class="sr-only" id="' + acc.liveRegionId + '" aria-live="polite" aria-atomic="true"></div>';
  }
  if (acc.srDescriptions) {
    acc.srDescriptions.forEach(function (desc) {
      srHTML += '<div class="sr-only">' + desc + '</div>';
    });
  }

  // ── Toolbar a11y ──
  var tbRole  = acc.toolbarLabel ? ' role="toolbar" aria-label="' + acc.toolbarLabel + '"' : '';

  // ── Assemble HTML ──
  modalEl.innerHTML =
    '<div class="' + cardCls + '" style="position:relative;">' +
      '<div class="modal-sticky-bar">' +
        '<div class="viz-filter-group tl-glow"' + tbRole + '>' +
          '<div class="viz-filter-row">' +
            toggleHTML + filterHTML + closeHTML +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="viz-viewport" style="cursor:grab;"' + vpRole + vpRD + vpAL + '>' +
        srHTML +
        '<div class="viz-world">' +
          '<svg class="' + (cfg.svgClass || "kg-edges") + '" xmlns="http://www.w3.org/2000/svg" viewBox="-2000 -2000 4000 4000" aria-hidden="true"></svg>' +
        '</div>' +
      '</div>' +
    '</div>';

  // ── Return DOM refs ──
  return {
    closeBtn: document.getElementById(cfg.closeId),
    layoutToggle: document.getElementById(cfg.toggleId),
    viewport: modalEl.querySelector(".viz-viewport"),
    svgEl: modalEl.querySelector("." + (cfg.svgClass || "kg-edges")),
    world: modalEl.querySelector(".viz-world"),
  };
}
window.buildVizShell = buildVizShell;

// (Link modal moved outside if-modal guard — see below)

// ═══════════════════════════════════════════════════════════════
//  GAME PLAYER MODAL
// ═══════════════════════════════════════════════════════════════
// ── Game modal shell (replaces GAME-MODAL.HTML fragment) ──
(function() {
  var el = _ensureOverlay("game-modal");
  el.innerHTML =
    '<div class="glass-tile modal-card game-modal-card" style="position:relative;">' +
      '<div class="modal-sticky-bar"><div class="modal-sticky-group tl-glow">' +
        '<h2 class="modal-sticky-title" id="game-modal-title"><i class="fa fa-gamepad"></i> Play</h2>' +
        '<a class="modal-sticky-link" id="game-modal-link" href="#" target="_blank"><i class="fa fa-external-link"></i> Open in new tab</a>' +
        '<button class="modal-close" aria-label="Close modal">&times;</button>' +
      '</div></div>' +
      '<div class="game-embed-wrap"><iframe id="game-iframe" src="" title="Game" allowfullscreen scrolling="no"></iframe></div>' +
    '</div>';
})();
var _gameIframe = document.getElementById("game-iframe");
var _gameResizeHandler = null;

var _gameModal = registerModal("game-modal", {
  key: "game",
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

// Override registry entry so openModal('game', url, title, w, h) works
_modalByKey["game"] = {
  el: _gameModal.el,
  open: function(url, title, nativeW, nativeH) {
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
  },
  close: _gameModal.close
};

window.openGameModal  = function(url, title, nativeW, nativeH) { openModal('game', url, title, nativeW, nativeH); };
window.closeGameModal = function() { closeModal('game'); };

// ═══════════════════════════════════════════════════════════════
//  MTG DECK MODAL SYSTEM
// ═══════════════════════════════════════════════════════════════
(() => {
  var deckModal = _ensureOverlay("deck-modal");

  // ── Deck modal shell (replaces DECK-MODAL.HTML fragment) ──
  deckModal.innerHTML =
    '<div class="glass-tile modal-card deck-modal-card" style="position:relative;">' +
      '<div class="modal-sticky-bar"><div class="modal-sticky-group tl-glow">' +
        '<h2 class="modal-sticky-title" id="deck-sticky-title"></h2>' +
        '<a class="modal-sticky-link" id="deck-hero-link" href="#" target="_blank"><i class="fa fa-clone"></i> Archidekt</a>' +
        '<button class="modal-close" aria-label="Close modal">&times;</button>' +
      '</div></div>' +
      '<div class="deck-hero">' +
        '<img class="deck-hero-img" id="deck-hero-img" src="" alt="" />' +
        '<div class="deck-hero-info">' +
          '<h2 class="deck-hero-name" id="deck-hero-name"></h2>' +
          '<p class="deck-hero-motto" id="deck-hero-motto" style="display:none"></p>' +
          '<div class="modal-body deck-body" id="deck-body"></div>' +
        '</div>' +
      '</div>' +
      '<div id="deck-sections"></div>' +
    '</div>';

  var _deckReg = registerModal("deck-modal", { key: "deck" });

  // Override registry: openModal('deck', item) does async card load
  _modalByKey["deck"] = {
    el: _deckReg.el,
    open: function(item) {
      if (!item) return;
      var deckId = item.DECK.trim();
      _loadCards().then(function(allCards) {
        var cards = allCards.filter(function(c) { return c.deck === deckId; });
        renderDeckModal(item, cards);
      });
    },
    close: _deckReg.close
  };
  window.openDeckModal  = function(item) { openModal('deck', item); };
  window.closeDeckModal = function() { closeModal('deck'); };

  const typeIcons = {
    Planeswalker: "🌟", Creature: "🧛", Artifact: "✨",
    Enchantment: "🌩️", Instant: "⚡", Sorcery: "🔮",
    Land: "⛈️", Token: "🪙"
  };

  const typeOrder = ["Planeswalker", "Creature", "Artifact", "Enchantment", "Instant", "Sorcery", "Land", "Token"];

  // Reverse map: type emoji → human-readable name (for deck carousel grouping)
  const _typeEmojiToName = {};
  Object.keys(typeIcons).forEach(function (name) { _typeEmojiToName[typeIcons[name]] = name; });

  let sectionStates = [];
  let _allCards = null;   // loaded once from CARDS.json
  let _cardsLoading = null;

  /** Load CARDS.json once, flatten sections into a card list with deck ids.
   *  Normalizes UPPERCASE JSON keys → the lowercase shape renderDeckModal expects:
   *    { "card name", types (comma-sep names), art, deck }
   */
  function _loadCards() {
    if (_allCards) return Promise.resolve(_allCards);
    if (_cardsLoading) return _cardsLoading;
    _cardsLoading = loadCardsJSON().then(function (raw) {
      if (!raw) return [];
      var cards = [];
      (raw.sections || []).forEach(function (sec) {
        (sec.items || []).forEach(function (item) {
          var typeEmoji = item.TYPE || "🧛";
          var typeName  = _typeEmojiToName[typeEmoji] || typeEmoji;
          cards.push({
            "card name": item.NAME  || "",
            types:       typeName,
            art:         "png/card_art/" + (item.ID || "") + "/art.png",
            deck:        sec.id,
          });
        });
      });
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

// ═══════════════════════════════════════════════════════════════
//  EXTERNAL LINK IFRAME MODAL
// ═══════════════════════════════════════════════════════════════
(function() {
  // Ensure overlay element exists (create if absent)
  var el = document.getElementById("link-modal");
  if (!el) {
    el = document.createElement('div');
    el.className = 'modal-overlay';
    el.id = 'link-modal';
    document.body.appendChild(el);
  }
  // Inject shell HTML BEFORE registerModal so close-button auto-wires
  el.innerHTML =
    '<div class="glass-tile modal-card link-modal-card" style="position:relative;">' +
      '<div class="modal-sticky-bar"><div class="modal-sticky-group tl-glow">' +
        '<h2 class="modal-sticky-title" id="link-modal-title"><i class="fa fa-globe"></i> Link</h2>' +
        '<a class="modal-sticky-link" id="link-modal-link" href="#" target="_blank"><i class="fa fa-external-link"></i> Open in new tab</a>' +
        '<button class="modal-close" aria-label="Close modal">&times;</button>' +
      '</div></div>' +
      '<div class="link-embed-wrap"><iframe id="link-iframe" src="" title="External content" allowfullscreen></iframe></div>' +
    '</div>';
  var _linkIframe = document.getElementById("link-iframe");
  var _linkModal = registerModal("link-modal", {
    key: "link",
    onClose: function () { if (_linkIframe) _linkIframe.src = ""; }
  });
  // Override registry: openModal('link', url, title) sets up iframe
  _modalByKey["link"] = {
    el: _linkModal.el,
    open: function(url, title) {
      document.getElementById("link-modal-title").innerHTML = '<i class="fa fa-globe"></i> ' + (title || 'Link');
      document.getElementById("link-modal-link").href = url;
      _linkModal.open();
      document.getElementById("link-iframe").src = url;
    },
    close: _linkModal.close
  };
  window.openLinkModal = function(url, title) { openModal('link', url, title); };
  window.closeLinkModal = function() { closeModal('link'); };
})();

// ── Video-card event delegation (OUTSIDE if-modal guard) ─────
// Convention: data-open="key" → openModal(key)
// Fallback:   data-open="fooModal" → window.openFooModal() (legacy)
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
    var key = card.dataset.open;
    if (key) {
      var openArg = card.dataset.openArg || undefined;
      // Prefer unified openModal(key)
      var resolved = _resolveModal(key);
      if (resolved) { resolved.open(); return; }
      // Legacy fallback: openFooModal(arg)
      var fnName = "open" + key[0].toUpperCase() + key.slice(1);
      var fn = window[fnName];
      if (fn) fn(openArg);
    }
  } else if (action === "scroll-navigate" || action === "navigate") {
    openModal('entry', card.dataset.navigateDataset, card.dataset.navigateId);
  } else if (action === "scroll-modal" || action === "modal") {
    openModal('entry', card.dataset.modalDataset, card.dataset.modalId);
  }
});

document.addEventListener("keydown", function(e) {
  if (e.key === "Enter" || e.key === " ") {
    const card = e.target.closest("[data-action]");
    if (card) { e.preventDefault(); card.click(); }
  }
});

// ═══════════════════════════════════════════════════════════════
//  BIOGRAPHY HYDRATOR — builds bio DOM from SETTINGS.json schema
//  Shared by bootfile.dev (#biography-modal) and mutilar (#quilt-modal).
//  Called automatically when the bio element is empty; also
//  available as window.hydrateBiographyModalFromSettings().
// ═══════════════════════════════════════════════════════════════
function _escapeHtmlBio(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _actionAttrsFromTile(tile) {
  if (!tile || !tile.action || !tile.action.type) return '';
  var action = tile.action;
  if (action.type === 'navigate') {
    return ' data-action="navigate" data-navigate-dataset="' + _escapeHtmlBio(action.dataset || '') + '" data-navigate-id="' + _escapeHtmlBio(action.id || '') + '"';
  }
  if (action.type === 'open') {
    return ' data-action="open" data-open="' + _escapeHtmlBio(action.open || '') + '"';
  }
  if (action.type === 'scroll-open') {
    return ' data-action="scroll-open" data-open="' + _escapeHtmlBio(action.open || '') + '" data-scroll-to="' + _escapeHtmlBio(action.scrollTo || '') + '"';
  }
  if (action.type === 'onclick' && action.code) {
    return ' onclick="' + _escapeHtmlBio(action.code) + '"';
  }
  return '';
}

function _resolveAccentColor(tile, accents) {
  if (tile.color) return tile.color;
  if (typeof tile.accent === 'number' && Array.isArray(accents)) {
    var rgb = accents[tile.accent];
    return rgb ? rgb.replace(/\s/g, '') : '';
  }
  return '';
}

function hydrateBiographyModalFromSettings(settings) {
  var schema = settings && settings.modals && settings.modals.biography;
  var elId = (schema && schema.elementId) || 'biography-modal';
  var modal = document.getElementById(elId);
  if (!modal) {
    // Auto-create the overlay (same pattern as registerModal)
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = elId;
    modal.setAttribute('role', 'dialog');
    document.body.appendChild(modal);
  }
  if (!schema) return;
  if (!Array.isArray(schema.sections) || !schema.sections.length) return;

  // Build outer shell
  var shell = [];
  shell.push('<div class="glass-tile modal-card bio-modal-card" style="position:relative;">');
  shell.push('<div class="modal-sticky-bar"><div class="modal-sticky-group tl-glow"><button class="modal-close" id="biographyModalClose" aria-label="Close modal">&times;</button></div></div>');
  shell.push('<div class="modal-body"></div>');
  shell.push('</div>');
  modal.innerHTML = shell.join('');

  var body = modal.querySelector('.modal-body');
  if (!body) return;

  var html = [];

  (schema.sections || []).forEach(function (section) {
    if (!section || !section.heading) return;

    html.push('<h3 data-bio-tour="' + _escapeHtmlBio(section.tour || section.heading) + '">' + _escapeHtmlBio(section.heading) + '</h3>');
    html.push('<hr>');

    var blockClass = section.blockClass || 'bio-symbol-block';
    var steps = Array.isArray(section.steps) ? section.steps : [];
    html.push('<div class="' + _escapeHtmlBio(blockClass) + '">');
    html.push('<div class="step step-left">' + _escapeHtmlBio(steps[0] || '') + '</div>');
    html.push('<div class="step step-center">' + _escapeHtmlBio(steps[1] || '') + '</div>');
    html.push('<div class="step step-right">' + _escapeHtmlBio(steps[2] || '') + '</div>');
    html.push('</div>');

    var tiles = Array.isArray(section.tiles) ? section.tiles : [];
    var withImages = tiles.some(function (t) { return t && t.imageSrc; });
    if (withImages) {
      html.push('<div class="bio-img-viewer">');
      tiles.forEach(function (tile, tileIndex) {
        var imgCls = 'bio-img-layer' + (tileIndex === 0 ? ' bio-img-active' : '');
        html.push('<img class="' + imgCls + '" src="' + _escapeHtmlBio(tile.imageSrc || '') + '" alt="' + _escapeHtmlBio(tile.imageAlt || tile.label || '') + '" />');
      });
      html.push('</div>');
    }

    if (tiles.length) {
      html.push('<div class="bio-stat-row">');
      tiles.forEach(function (tile, tileIndex) {
        var cls = 'bio-stat bio-stat-link' + (tileIndex === 0 ? ' bio-stat-active' : '');
        var resolvedColor = _resolveAccentColor(tile, settings && settings.accents);
        var color = resolvedColor ? ' data-bio-color="' + _escapeHtmlBio(resolvedColor) + '"' : '';
        var imgIdx = ' data-bio-img="' + tileIndex + '"';
        var actionAttrs = _actionAttrsFromTile(tile);
        var icon = tile.icon ? '<i class="' + _escapeHtmlBio(tile.icon) + '"></i> ' : '';
        var value = icon + _escapeHtmlBio(tile.value || '');
        var label = _escapeHtmlBio(tile.label || '');

        if (tile.href) {
          html.push(
            '<a class="' + cls + '" tabindex="0" target="_blank" rel="noopener" href="' + _escapeHtmlBio(tile.href) + '"' + color + imgIdx + actionAttrs + '>' +
              '<span class="bio-stat-value">' + value + '</span>' +
              '<span class="bio-stat-label">' + label + '</span>' +
            '</a>'
          );
        } else {
          html.push(
            '<div class="' + cls + '" tabindex="0"' + color + imgIdx + actionAttrs + '>' +
              '<span class="bio-stat-value">' + value + '</span>' +
              '<span class="bio-stat-label">' + label + '</span>' +
            '</div>'
          );
        }
      });
      html.push('</div>');
    }

    var withQuotes = tiles.some(function (t) { return t && t.quoteText; });
    if (withQuotes) {
      html.push('<div class="bio-quote-viewer">');
      tiles.forEach(function (tile, tileIndex) {
        var qCls = 'bio-quote-layer' + (tileIndex === 0 ? ' bio-quote-active' : '');
        html.push(
          '<blockquote class="' + qCls + '">' +
            '<p>' + _escapeHtmlBio(tile.quoteText || '').replace(/\n/g, '<br>') + '</p>' +
            '<cite>' + _escapeHtmlBio(tile.quoteCite || '') + '</cite>' +
          '</blockquote>'
        );
      });
      html.push('</div>');
    }

    html.push('<hr>');
  });

  if (schema.title || schema.url) {
    var title = _escapeHtmlBio(schema.title || '');
    var url = _escapeHtmlBio(schema.url || '#');
    html.push('<footer class="glass-footer">');
    html.push('<p><strong><a href="#" onclick="event.preventDefault(); openModal(\'biography\');" style="text-decoration:none;cursor:pointer;">' + title + '</a></strong><br><strong><a href="' + url + '">' + url + '</a></strong></p>');
    html.push('</footer>');
    html.push('<hr>');
  }

  var explore = schema.explore || {};
  html.push('<div class="scroll-hint bio-explore-hint" id="bioExploreHint" style="cursor:pointer;"><strong>' + _escapeHtmlBio(explore.label || 'Traverse') + '</strong><span class="scroll-arrow">' + _escapeHtmlBio(explore.emoji || '🔭') + '</span></div>');

  body.innerHTML = html.join('');
}
window.hydrateBiographyModalFromSettings = hydrateBiographyModalFromSettings;

// ═══════════════════════════════════════════════════════════════
//  BIOGRAPHY MODAL — wiring
//  Runs on ANY page that has a #biography-modal or legacy #quilt-modal element.
//  Auto-hydrates from __SETTINGS if DOM is empty (no fragment).
// ═══════════════════════════════════════════════════════════════
var _stopBioTour = null;
var _bioTourScrolling = false;
var _bioLastTouch = 0;

// ═══════════════════════════════════════════════════════════════
//  Shared bio crossfade + tour wiring
//  Used by both biography modal (_initBioWiring) and bootfile
//  style-guide modal. Accepts the modal overlay element; finds
//  .modal-card, .bio-stat-row, .bio-explore-hint internally.
// ═══════════════════════════════════════════════════════════════
function _wireBioCrossfade(modalEl) {
  var rows = modalEl.querySelectorAll(".bio-stat-row");
  rows.forEach(function (row) {
    var tiles = row.querySelectorAll("[data-bio-img]");
    if (!tiles.length) return;

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

    tiles.forEach(function (tile) {
      var c = tile.dataset.bioColor;
      if (c) tile.style.setProperty("--bio-glow", c);
    });

    var firstActive = row.querySelector(".bio-stat-active");
    if (firstActive && firstActive.dataset.bioColor && viewer) {
      viewer.style.setProperty("--bio-viewer-glow", firstActive.dataset.bioColor);
    }

    function activate(tile) {
      var idx = parseInt(tile.dataset.bioImg, 10);
      if (isNaN(idx)) return;
      tiles.forEach(function (t) { t.classList.remove("bio-stat-active"); });
      tile.classList.add("bio-stat-active");
      if (layers.length) {
        layers.forEach(function (l) { l.classList.remove("bio-img-active"); });
        if (layers[idx]) layers[idx].classList.add("bio-img-active");
      }
      if (quotes.length) {
        quotes.forEach(function (q) { q.classList.remove("bio-quote-active"); });
        if (quotes[idx]) quotes[idx].classList.add("bio-quote-active");
      }
      var c = tile.dataset.bioColor;
      if (c && viewer) viewer.style.setProperty("--bio-viewer-glow", c);
    }

    tiles.forEach(function (tile) {
      tile.addEventListener("mouseenter", function () { activate(tile); });
      tile.addEventListener("focus", function () { activate(tile); });
      if (tile.dataset.action) {
        tile.addEventListener("click", function (e) {
          if (!e.isTrusted) return;
          if (Date.now() - _bioLastTouch > 800) return;
          e.stopPropagation();
          activate(tile);
        }, true);
      }
    });

    if (viewer) {
      viewer.style.cursor = "pointer";
      viewer.addEventListener("click", function () {
        var active = row.querySelector(".bio-stat-active[data-action]");
        if (active) active.click();
      });
    }
  });
}

/**
 * Wire explore-tour scroll on a bio modal. Finds .bio-explore-hint
 * and .modal-card inside modalEl. Returns the stopScroll function
 * (to call from onClose), or null if hint/card not found.
 */
function _wireBioTour(modalEl) {
  var hint = modalEl.querySelector(".bio-explore-hint");
  var card = modalEl.querySelector(".modal-card");
  if (!hint || !card) return null;

  var HINT_DEFAULT = '<strong>Traverse</strong><span class="scroll-arrow">🔭</span>';
  var _cf = typeof createCrossfader === "function" ? createCrossfader() : null;
  var _raf = null;
  var _scrolling = false;

  function getStops() {
    return Array.from(card.querySelectorAll("[data-bio-tour]")).map(function (el) {
      var tiles = [];
      var sib = el.nextElementSibling;
      while (sib) {
        if (sib.classList.contains("bio-stat-row")) {
          tiles = Array.from(sib.querySelectorAll("[data-bio-img]"));
          break;
        }
        if (sib.hasAttribute("data-bio-tour") || sib.tagName === "H3") break;
        sib = sib.nextElementSibling;
      }
      return { el: el, label: el.getAttribute("data-bio-tour"), tiles: tiles };
    });
  }

  var _cachedStops = null;

  function resolveScrollStop(stops) {
    var scrollMid = card.scrollTop + card.clientHeight * 0.4 + 100;
    for (var i = stops.length - 1; i >= 0; i--) {
      if (stops[i].el.offsetTop <= scrollMid) {
        var stop = stops[i];
        if (stop.tiles.length > 1) {
          var sectionTop = stop.el.offsetTop;
          var sectionBot = (i + 1 < stops.length) ? stops[i + 1].el.offsetTop : card.scrollHeight;
          var sectionRange = sectionBot - sectionTop;
          if (sectionRange > 0) {
            var localProgress = Math.max(0, Math.min(1, (scrollMid - sectionTop) / sectionRange));
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

  function syncScrollState(stops, lastStopIdxRef) {
    var i = resolveScrollStop(stops);
    if (i >= 0 && i !== lastStopIdxRef.v) {
      lastStopIdxRef.v = i;
      var label = stops[i].label;
      var m = label.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)\s*/u);
      var emoji = m ? m[1] : '🐧';
      var text = m ? label.slice(m[0].length) : label;
      if (_cf) _cf.fade(hint, '<strong>' + text + '</strong><span class="scroll-arrow">' + emoji + '</span>');
      else hint.innerHTML = '<strong>' + text + '</strong><span class="scroll-arrow">' + emoji + '</span>';
    }
  }

  card.addEventListener("scroll", function () {
    if (_scrolling) return;
    if (!_cachedStops) _cachedStops = getStops();
    resolveScrollStop(_cachedStops);
  }, { passive: true });

  modalEl.addEventListener("transitionend", function () {
    if (modalEl.classList.contains("open")) _cachedStops = null;
  });

  var _tourCleanup = null;
  function stopScroll() {
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
    if (!_scrolling) return;
    _scrolling = false;
    _bioTourScrolling = false;
    if (_tourCleanup) { _tourCleanup(); _tourCleanup = null; }
    hint.classList.remove("exploring");
    if (_cf) _cf.fade(hint, HINT_DEFAULT);
    else hint.innerHTML = HINT_DEFAULT;
    hint.style.pointerEvents = '';
  }

  function startScroll() {
    var maxS = card.scrollHeight - card.clientHeight;
    if (card.scrollTop >= maxS - 1) {
      card.scrollTo({ top: 0, behavior: "smooth" });
      if (_cf) _cf.fade(hint, HINT_DEFAULT);
      else hint.innerHTML = HINT_DEFAULT;
      return;
    }

    _scrolling = true;
    _bioTourScrolling = true;
    hint.classList.add("exploring");

    var SPEED_MAX = 75;
    var RAMP_DUR = 0.5;
    var elapsed = 0;
    var lastT = null;
    var scrollPos = card.scrollTop;
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
      if (!lastT) { lastT = ts; _raf = requestAnimationFrame(step); return; }
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

  return stopScroll;
}

function _initBioWiring(quiltModal, bioModalId) {

var _quiltModal = registerModal(bioModalId, {
  key: 'biography',
  onOpen:  function () { if (typeof _dismissBioToast === "function") _dismissBioToast(); },
  onClose: function () { if (_stopBioTour) _stopBioTour(); }
});

// ── Overscroll bounce ────────────────────────────────────────
(function () {
  document.addEventListener("touchstart", function () { _bioLastTouch = Date.now(); }, { passive: true });
})();
(function () {
  var card = quiltModal.querySelector(".modal-card");
  if (!card) return;
  if (typeof boostTouchScroll === "function") boostTouchScroll(card);
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

_wireBioCrossfade(quiltModal);
_stopBioTour = _wireBioTour(quiltModal);

} // end _initBioWiring

// ── Auto-hydrate + wire biography ────────────────────────────
// Derive modal ID from SETTINGS (no hardcoded DOM sniffing).
function _bootBiography(settings) {
  var schema = settings && settings.modals && settings.modals.biography;
  var id = (schema && schema.elementId) || 'biography-modal';
  hydrateBiographyModalFromSettings(settings);
  var el = document.getElementById(id);
  if (el) _initBioWiring(el, id);
}

if (window.__SETTINGS && window.__SETTINGS.modals && window.__SETTINGS.modals.biography) {
  _bootBiography(window.__SETTINGS);
} else {
  window.addEventListener('settingsReady', function (e) {
    _bootBiography(e.detail);
  }, { once: true });
}
