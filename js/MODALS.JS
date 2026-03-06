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
//  MODAL CONSTRUCT SYSTEM
//  JSON schemas in SETTINGS.json → `_constructs[type]` builders
//  → `_hydrateModals(settings)` boot loop.
//
//  To add a new modal type, add a JSON block in SETTINGS.json
//  under "modals" and (if needed) a new construct function below.
//  No hardcoded HTML. No IIFEs. Pure schema → DOM hydration.
// ═══════════════════════════════════════════════════════════════
function _ensureOverlay(id) {
  var el = document.getElementById(id);
  if (!el) { el = document.createElement('div'); el.className = 'modal-overlay'; el.id = id; document.body.appendChild(el); }
  return el;
}

// ─── Universal shell: every modal gets the same outer frame ──
function _buildModalShell(schema) {
  var el = _ensureOverlay(schema.elementId);
  var cardClass = "glass-tile modal-card" + (schema.cardClass ? " " + schema.cardClass : "");
  var bar = schema.stickyBar || {};

  // Title element
  var titleTag = bar.titleTag || "h2";
  var titleClass = bar.titleClass || "modal-sticky-title";
  var titleId = bar.titleId ? ' id="' + bar.titleId + '"' : '';
  var titleIcon = bar.icon ? '<i class="' + bar.icon + '"></i> ' : '';
  var titleContent = titleIcon + (bar.title || '');
  var titleHTML = '<' + titleTag + ' class="' + titleClass + '"' + titleId + '>' + titleContent + '</' + titleTag + '>';

  // Links
  var linksHTML = '';
  (bar.links || []).forEach(function(link) {
    var href = link.href || '#';
    var id = link.id ? ' id="' + link.id + '"' : '';
    var target = ' target="_blank"';
    linksHTML += '<a class="modal-sticky-link"' + id + ' href="' + href + '"' + target + '><i class="' + link.icon + '"></i> ' + (link.label || '') + '</a>';
  });

  // Close button
  var closeHTML = '<button class="modal-close" aria-label="Close modal">&times;</button>';

  el.innerHTML =
    '<div class="' + cardClass + '" style="position:relative;">' +
      '<div class="modal-sticky-bar"><div class="modal-sticky-group tl-glow">' +
        titleHTML + linksHTML + closeHTML +
      '</div></div>' +
      '<div class="modal-content"></div>' +
    '</div>';

  return { el: el, content: el.querySelector('.modal-content') };
}

// ─── Construct registry: type → builder(shell, schema, key) → { onOpen, onClose } ──
var _constructs = {};
var _fallbackText = "Details coming soon\u2026";

// ┌─────────────────────────────────────────────────────────────┐
// │  CONSTRUCT: entry — portfolio item detail modal             │
// └─────────────────────────────────────────────────────────────┘
var _glowingTile = null;

function _applyGlow(dataset, id) {
  if (_glowingTile) { _glowingTile.classList.remove('tile-glow', 'tile-glow-fade'); _glowingTile = null; }
  var gridId = dataset + '-grid';
  var grid = document.getElementById(gridId);
  var tile = grid
    ? grid.querySelector('[data-entry-id="' + id + '"]')
    : document.querySelector('[data-entry-id="' + id + '"]');
  if (tile) { tile.classList.add('tile-glow'); _glowingTile = tile; }
}

function _fadeOutGlow() {
  if (_glowingTile) {
    _glowingTile.classList.remove('tile-glow');
    _glowingTile.classList.add('tile-glow-fade');
    var el = _glowingTile;
    _glowingTile = null;
    setTimeout(function() { el.classList.remove('tile-glow-fade'); }, 500);
  }
}

_constructs["entry"] = function(shell, schema, key) {
  var slot = shell.content;
  slot.innerHTML =
    '<img class="modal-img" id="modal-image" src="" alt="" />' +
    '<div class="modal-header-row"><h2 class="modal-title" id="modal-name"></h2></div>' +
    '<div class="modal-body" id="modal-biography"></div>';

  var reg = registerModal(schema.elementId, { key: key, onClose: _fadeOutGlow });

  function populate(dataset, id, imgExt) {
    var data = modalState[dataset];
    if (!data) return;
    var item = data.find(function(d) { return d.ID === id; });
    if (!item) return;

    var modalImg = document.getElementById("modal-image");
    modalImg.style.display = "none";
    modalImg.onload = function () { this.style.display = ""; };
    modalImg.onerror = function () { this.style.display = "none"; };
    modalImg.src = (schema.imgPathTemplate || "png/{ID}{EXT}").replace("{ID}", id).replace("{EXT}", imgExt || ".png");
    modalImg.alt = item.NAME || "";

    document.getElementById("modal-name").innerHTML = (item.NAME || "").replace(/<br\s*\/?>/gi, " ");

    var titleStr = item.TITLE || item.MOTTO || "";
    var titleBadges = titleStr.split(',').map(function(t) { return t.trim(); }).filter(Boolean)
      .map(function(t) { return '<span class="modal-badge">' + t + '</span>'; }).join('');
    var winBadge = item.WIN && item.WIN.trim()
      ? '<span class="modal-win-badge"><i class="fa fa-trophy"></i> ' + item.WIN + '</span>'
      : '';

    var hasPlay = item.PLAY && item.PLAY.trim();
    var isExternal = hasPlay && item.PLAY.trim().startsWith('http');
    var playBadge = '';
    if (hasPlay) {
      if (isExternal) {
        playBadge = '<a href="' + item.PLAY.trim() + '" target="_blank" class="modal-play-badge" onclick="event.stopPropagation();"><i class="fa fa-gamepad"></i> Play me!</a>';
      } else {
        playBadge = '<a href="#" class="modal-play-badge" onclick="event.preventDefault(); event.stopPropagation(); closeModal(\'entry\'); openModal(\'game\', \'' + item.PLAY.trim() + '\', \'' + (item.NAME || '').replace(/'/g, "\\'") + '\', ' + (item.PLAY_W || 960) + ', ' + (item.PLAY_H || 600) + ')"><i class="fa fa-gamepad"></i> Play me!</a>';
      }
    }
    document.getElementById("modal-title").innerHTML = playBadge + titleBadges + winBadge;

    document.getElementById("modal-biography").innerHTML = item.TEXT && item.TEXT !== "tbd"
      ? item.TEXT
      : "<p style='color:rgba(255,255,255,0.5);font-style:italic;'>" + _fallbackText + "</p>";

    _applyGlow(dataset, id);
  }

  _modalByKey[key] = {
    el: reg.el,
    open: function(dataset, id, imgExt) { populate(dataset, id, imgExt); reg.open(); },
    close: reg.close
  };

  // Close modal on in-page anchor clicks (but not navigateToModal links)
  shell.el.addEventListener("click", function (e) {
    var link = e.target.closest("a[href^='#']");
    if (!link) return;
    var onclickAttr = link.getAttribute("onclick") || "";
    if (onclickAttr.indexOf("navigateToModal") !== -1) return;
    closeModal('entry');
  });

  return { onOpen: null, onClose: null };
};

// ┌─────────────────────────────────────────────────────────────┐
// │  CONSTRUCT: iframe — link, game, bootfile, any iframe modal │
// └─────────────────────────────────────────────────────────────┘
_constructs["iframe"] = function(shell, schema, key) {
  var slot = shell.content;
  var wrapClass = schema.contentClass || "link-embed-wrap";
  var iframeId = schema.iframeId || (key + "-iframe");
  var iframeTitle = schema.iframeTitle || "External content";
  var scrolling = schema.iframeScrolling || "";
  var scrollAttr = scrolling ? ' scrolling="' + scrolling + '"' : '';

  slot.innerHTML = '<div class="' + wrapClass + '"><iframe id="' + iframeId + '" src="" title="' + iframeTitle + '" allowfullscreen' + scrollAttr + '></iframe></div>';

  var iframe = document.getElementById(iframeId);
  var resizeHandler = null;

  var reg = registerModal(schema.elementId, {
    key: key,
    onClose: function () {
      if (iframe) iframe.src = "";
      if (schema.fitToContainer) {
        iframe.style.transform = '';
        iframe.style.width = '';
        iframe.style.height = '';
        iframe.style.left = '';
        iframe.style.top = '';
        if (resizeHandler) { window.removeEventListener('resize', resizeHandler); resizeHandler = null; }
      }
    }
  });

  _modalByKey[key] = {
    el: reg.el,
    open: function(url, title, nativeW, nativeH) {
      // Update sticky bar title if present
      var bar = schema.stickyBar || {};
      if (bar.titleId) {
        var titleIcon = bar.icon ? '<i class="' + bar.icon + '"></i> ' : '';
        document.getElementById(bar.titleId).innerHTML = titleIcon + (title || bar.title || 'Link');
      }
      // Update sticky bar link href if present
      if (bar.links && bar.links.length && bar.links[0].id) {
        var linkEl = document.getElementById(bar.links[0].id);
        if (linkEl) linkEl.href = url || bar.links[0].href || '#';
      }

      if (schema.fitToContainer) {
        nativeW = nativeW || 960;
        nativeH = nativeH || 600;
        iframe.style.width = nativeW + 'px';
        iframe.style.height = nativeH + 'px';

        reg.open();

        var fitIframe = function() {
          var wrap = shell.el.querySelector('.' + wrapClass);
          if (!wrap) return;
          var wrapW = wrap.clientWidth;
          var wrapH = wrap.clientHeight;
          var sx = wrapW / nativeW;
          var sy = wrapH / nativeH;
          var s = Math.min(sx, sy);
          iframe.style.transformOrigin = '0 0';
          iframe.style.transform = 'scale(' + s + ')';
          var scaledW = nativeW * s;
          var scaledH = nativeH * s;
          iframe.style.left = ((wrapW - scaledW) / 2) + 'px';
          iframe.style.top = ((wrapH - scaledH) / 2) + 'px';
        };

        requestAnimationFrame(fitIframe);
        setTimeout(fitIframe, 50);
        if (resizeHandler) window.removeEventListener('resize', resizeHandler);
        resizeHandler = fitIframe;
        window.addEventListener('resize', fitIframe);
      } else {
        reg.open();
      }

      iframe.src = url || schema.iframeSrc || '';
    },
    close: reg.close
  };

  return { onOpen: null, onClose: null };
};

// ┌─────────────────────────────────────────────────────────────┐
// │  CONSTRUCT: gallery — image gallery modal                   │
// └─────────────────────────────────────────────────────────────┘
_constructs["gallery"] = function(shell, schema, key) {
  var slot = shell.content;
  var galleryClass = schema.galleryClass || "gallery";
  var itemClass = schema.itemClass || "gallery-item";
  var labelClass = schema.labelClass || "gallery-label";
  var items = schema.items || [];

  var html = '';
  items.forEach(function(item) {
    html += '<div class="' + itemClass + '">' +
      '<div class="' + labelClass + '">' + item.label + '</div>' +
      '<img src="' + item.src + '" alt="' + (item.alt || '') + '" loading="lazy">' +
    '</div>';
  });
  slot.innerHTML = '<div class="' + galleryClass + '">' + html + '</div>';

  registerModal(schema.elementId, { key: key });
  return { onOpen: null, onClose: null };
};

// ┌─────────────────────────────────────────────────────────────┐
// │  CONSTRUCT: pdf — PDF viewer modal                          │
// └─────────────────────────────────────────────────────────────┘
var _pdfSharedOverlay = null;  // reuse one overlay for pdf & resume

function _buildPdfViewerHTML(loadingText) {
  return '<div class="pdf-embed-wrap">' +
    '<div id="pdf-loading" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#aaa;font-family:system-ui,sans-serif;font-size:15px;z-index:10;">' + (loadingText || _fallbackText) + '</div>' +
    '<div id="pdf-viewer"></div>' +
  '</div>';
}

_constructs["pdf"] = function(shell, schema, key) {
  // Multiple pdf constructs share the same overlay element
  if (!_pdfSharedOverlay) _pdfSharedOverlay = shell;

  var reg = registerModal(schema.elementId, {
    key: key,
    onOpen: function () {
      var src = schema.src;
      // Update the sticky link href to point to this PDF
      var bar = schema.stickyBar || {};
      if (bar.links && bar.links.length) {
        var linkEl = shell.el.querySelector('.modal-sticky-link');
        if (linkEl) linkEl.href = src;
      }
      // Build pdf viewer content
      shell.content.innerHTML = _buildPdfViewerHTML(schema.loadingText);
      // Re-wire close button after innerHTML swap
      var btn = shell.el.querySelector(".modal-close");
      if (btn) btn.addEventListener("click", function () { reg.close(); });
      renderPdfInline(src, { viewerId: "pdf-viewer", loadingId: "pdf-loading", singlePage: !!schema.singlePage });
    },
    onClose: function () { clearpdf("pdf-viewer"); }
  });

  // For alias keys (e.g. "resume" pointing at same overlay as "pdf"),
  // override the registry entry to set schema before opening
  if (_pdfSharedOverlay && _pdfSharedOverlay !== shell) {
    _modalByKey[key] = {
      el: reg.el,
      open: function() {
        // Temporarily swap schema context for the shared overlay
        var origLinks = _pdfSharedOverlay.el.querySelector('.modal-sticky-link');
        if (origLinks) origLinks.href = schema.src;
        _pdfSharedOverlay.content.innerHTML = _buildPdfViewerHTML(schema.loadingText);
        var btn = _pdfSharedOverlay.el.querySelector(".modal-close");
        if (btn) btn.addEventListener("click", function () { reg.close(); });
        reg.open();
        renderPdfInline(schema.src, { viewerId: "pdf-viewer", loadingId: "pdf-loading", singlePage: !!schema.singlePage });
      },
      close: reg.close
    };
  }

  return { onOpen: null, onClose: null };
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

// ┌─────────────────────────────────────────────────────────────┐
// │  CONSTRUCT: deck — MTG deck carousel modal                  │
// └─────────────────────────────────────────────────────────────┘
_constructs["deck"] = function(shell, schema, key) {
  var slot = shell.content;
  slot.innerHTML =
    '<div class="deck-hero">' +
      '<img class="deck-hero-img" id="deck-hero-img" src="" alt="" />' +
      '<div class="deck-hero-info">' +
        '<h2 class="deck-hero-name" id="deck-hero-name"></h2>' +
        '<p class="deck-hero-motto" id="deck-hero-motto" style="display:none"></p>' +
        '<div class="modal-body deck-body" id="deck-body"></div>' +
      '</div>' +
    '</div>' +
    '<div id="deck-sections"></div>';

  var _deckReg = registerModal(schema.elementId, { key: key });

  // All deck display data lives in SETTINGS.json → modals.deck
  var typeIcons = schema.typeIcons || {};
  var typeOrder = schema.typeOrder || Object.keys(typeIcons);
  var plurals   = schema.plurals   || {};
  var artTemplate     = schema.artPathTemplate || "png/card_art/{ID}/art.png";
  var defaultTypeEmoji = schema.defaultType     || "🧛";
  var _typeEmojiToName = {};
  Object.keys(typeIcons).forEach(function (name) { _typeEmojiToName[typeIcons[name]] = name; });

  var sectionStates = [];
  var _allCards = null;
  var _cardsLoading = null;

  function _loadCards() {
    if (_allCards) return Promise.resolve(_allCards);
    if (_cardsLoading) return _cardsLoading;
    _cardsLoading = loadCardsJSON().then(function (raw) {
      if (!raw) return [];
      var cards = [];
      (raw.sections || []).forEach(function (sec) {
        (sec.items || []).forEach(function (item) {
          var typeEmoji = item.TYPE || defaultTypeEmoji;
          var typeName  = _typeEmojiToName[typeEmoji] || typeEmoji;
          cards.push({
            "card name": item.NAME  || "",
            types:       typeName,
            art:         artTemplate.replace("{ID}", item.ID || ""),
            deck:        sec.id,
          });
        });
      });
      _allCards = cards;
      return cards;
    });
    return _cardsLoading;
  }

  function pluralize(type) {
    return plurals[type] || (type + "s");
  }

  function getArtSrc(card) {
    return card.art && card.art.trim() ? card.art : "";
  }

  function getPos(index, focus) {
    var diff = index - focus;
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

  function renderSectionCarousel(state) {
    var container = state.carouselEl;
    container.innerHTML = "";
    if (state.prevBtn) state.prevBtn.style.visibility = state.index <= 0 ? "hidden" : "";
    if (state.nextBtn) state.nextBtn.style.visibility = state.index >= state.cards.length - 1 ? "hidden" : "";
    state.cards.forEach(function (card, i) {
      var el = document.createElement("div");
      el.className = "deck-card";
      el.setAttribute("data-pos", getPos(i, state.index));
      el.innerHTML = '<img src="' + getArtSrc(card) + '" alt="' + (card["card name"] || "") + '" loading="lazy" />' +
        '<div class="deck-card-name">' + (card["card name"] || "") + '</div>';
      (function (st, idx) {
        el.addEventListener("click", function () {
          var clickPos = getPos(idx, st.index);
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
    var cardEls = state.carouselEl.querySelectorAll(".deck-card");
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

  function renderDeckModal(item, cards) {
    var commanderName = (item.TITLE || "").replace(/:/g, ",");
    var commanderCard = cards.find(function (c) {
      var name = c["card name"] || "";
      return name.toLowerCase().includes(commanderName.toLowerCase()) ||
        commanderName.toLowerCase().includes(name.split(" // ")[0].toLowerCase());
    });

    var heroImg = document.getElementById("deck-hero-img");
    if (commanderCard && commanderCard.art && commanderCard.art.trim()) {
      heroImg.src = commanderCard.art;
    } else {
      heroImg.src = "";
    }

    var deckName = (item.NAME || "").replace(/<br\s*\/?>/gi, " ");
    document.getElementById("deck-hero-name").textContent = deckName;
    document.getElementById("deck-sticky-title").textContent = deckName;
    document.getElementById("deck-hero-motto").textContent = item.MOTTO || "";

    var heroLink = document.getElementById("deck-hero-link");
    if (heroLink) {
      if (item.GITHUB && item.GITHUB.trim()) {
        heroLink.href = item.GITHUB;
        heroLink.style.display = "";
      } else {
        heroLink.style.display = "none";
      }
    }

    var typeGroups = {};
    typeOrder.forEach(function (t) { typeGroups[t] = []; });
    cards.forEach(function (c) {
      if (c === commanderCard) return;
      var types = (c.types || "").split(",").map(function (t) { return t.trim(); }).filter(Boolean);
      var seen = {};
      types.forEach(function (t) {
        if (!seen[t] && typeGroups[t]) { seen[t] = true; typeGroups[t].push(c); }
      });
    });

    var sectionsEl = document.getElementById("deck-sections");
    sectionsEl.innerHTML = "";
    sectionStates = [];

    typeOrder.forEach(function (type) {
      var group = typeGroups[type];
      if (group.length === 0) return;
      group.sort(function (a, b) {
        var aHas = a.art && a.art.trim() ? 0 : 1;
        var bHas = b.art && b.art.trim() ? 0 : 1;
        if (aHas !== bHas) return aHas - bHas;
        return (a["card name"] || "").localeCompare(b["card name"] || "");
      });

      var section = document.createElement("div");
      section.className = "deck-section";
      section.innerHTML =
        '<div class="deck-section-heading">' +
        '<span class="deck-section-icon">' + (typeIcons[type] || "") + '</span>' +
        '<span class="deck-section-label">' + pluralize(type) + '</span>' +
        '</div>';

      var wrap = document.createElement("div");
      wrap.className = "deck-carousel-wrap";
      var prevBtn = document.createElement("button");
      prevBtn.className = "deck-carousel-btn deck-prev";
      prevBtn.textContent = "\u2039";
      var nextBtn = document.createElement("button");
      nextBtn.className = "deck-carousel-btn deck-next";
      nextBtn.textContent = "\u203A";
      var carousel = document.createElement("div");
      carousel.className = "deck-carousel";
      wrap.appendChild(prevBtn);
      wrap.appendChild(carousel);
      wrap.appendChild(nextBtn);
      section.appendChild(wrap);

      var counter = document.createElement("div");
      counter.className = "deck-carousel-counter";
      section.appendChild(counter);
      sectionsEl.appendChild(section);

      var state = { cards: group, index: 0, carouselEl: carousel, counterEl: counter, prevBtn: prevBtn, nextBtn: nextBtn };
      sectionStates.push(state);
      if (group.length <= 1) {
        prevBtn.style.display = "none";
        nextBtn.style.display = "none";
        counter.style.display = "none";
      }
      renderSectionCarousel(state);
      (function (st) {
        prevBtn.addEventListener("click", function () {
          if (st.index > 0) { st.index--; updateSectionPositions(st); }
        });
        nextBtn.addEventListener("click", function () {
          if (st.index < st.cards.length - 1) { st.index++; updateSectionPositions(st); }
        });
      })(state);
    });

    var bodyEl = document.getElementById("deck-body");
    bodyEl.innerHTML = item.TEXT && item.TEXT !== "tbd"
      ? item.TEXT
      : "<p style='color:rgba(255,255,255,0.5);font-style:italic;'>" + _fallbackText + "</p>";

    bodyEl.querySelectorAll("a[data-card-link]").forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        var target = link.getAttribute("data-card-link").toLowerCase();
        for (var si = 0; si < sectionStates.length; si++) {
          var st = sectionStates[si];
          for (var ci = 0; ci < st.cards.length; ci++) {
            var name = (st.cards[ci]["card name"] || "").toLowerCase();
            if (name === target || name.indexOf(target) !== -1 || target.indexOf(name.split(" // ")[0]) !== -1) {
              st.index = ci;
              updateSectionPositions(st);
              var sectionEl = st.carouselEl.closest(".deck-section");
              if (sectionEl) {
                var modalCard = sectionEl.closest(".deck-modal-card");
                var hero = modalCard.querySelector(".deck-hero");
                var headerHeight = hero ? hero.offsetHeight : 0;
                var sectionTop = sectionEl.offsetTop - headerHeight - 12;
                modalCard.scrollTo({ top: sectionTop, behavior: "smooth" });
              }
              var cardEls = st.carouselEl.querySelectorAll(".deck-card");
              var focusedCard = cardEls[ci];
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

  _modalByKey[key] = {
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

  return { onOpen: null, onClose: null };
};

// ═══════════════════════════════════════════════════════════════
//  MODAL HYDRATION BOOT LOOP
//  Reads SETTINGS.json → modals{} and builds each typed construct.
//  biography is handled separately (needs post-hydrate wiring).
// ═══════════════════════════════════════════════════════════════
function _hydrateModals(settings) {
  if (settings.fallbackText) _fallbackText = settings.fallbackText;
  var schemas = (settings && settings.modals) || {};
  Object.keys(schemas).forEach(function(key) {
    var schema = schemas[key];
    // biography is booted separately with _bootBiography
    if (schema.type === 'biography') return;
    var construct = _constructs[schema.type];
    if (!construct) return;
    var shell = _buildModalShell(schema);
    construct(shell, schema, key);
  });
}

// Boot modals from settings — immediate or deferred
if (window.__SETTINGS) {
  _hydrateModals(window.__SETTINGS);
} else {
  window.addEventListener('settingsReady', function (e) {
    _hydrateModals(e.detail);
  }, { once: true });
}

// ── Backward-compat thin wrappers ────────────────────────────
function navigateToModal(dataset, id, imgExt) {
  if (_glowingTile) { _glowingTile.classList.remove('tile-glow', 'tile-glow-fade'); _glowingTile = null; }
  openModal('entry', dataset, id, imgExt);
}
window.openEntry       = function(dataset, id, imgExt) { openModal('entry', dataset, id, imgExt); };
window.closeEntry      = function() { closeModal('entry'); };
window.navigateToModal = navigateToModal;
window.openGameModal   = function(url, title, nativeW, nativeH) { openModal('game', url, title, nativeW, nativeH); };
window.closeGameModal  = function() { closeModal('game'); };
window.openDeckModal   = function(item) { openModal('deck', item); };
window.closeDeckModal  = function() { closeModal('deck'); };
window.openLinkModal   = function(url, title) { openModal('link', url, title); };
window.closeLinkModal  = function() { closeModal('link'); };
window.openBitnaughtsModal       = function() { openModal('bitnaughts'); };
window.openBitnaughtsIphoneModal = function() { openModal('bitnaughtsIphone'); };
window.openBootfileModal  = function() { openModal('bootfile'); };
window.closeBootfileModal = function() { closeModal('bootfile'); };

// ── Footer year (safe alternative to document.write) ──
var footerYear = document.getElementById("footer-year");
if (footerYear) footerYear.textContent = new Date().getFullYear();

// Mermaid modals — lazily created by openMermaidModal() in MERMAID.JS
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
