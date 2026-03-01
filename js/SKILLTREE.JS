// ═══════════════════════════════════════════════════════════════
//  SKILL TREE — Reusable radial node-graph visualization engine
//
//  Architecture:
//    1. createSkillTree(cfg) — global factory (reusable core)
//       Handles: modal open/close, multi-axis filter toggles,
//       collision resolution, pan/zoom, proximity glow,
//       entrance animation, edge SVG creation.
//
//    2. Portfolio instance (IIFE at bottom) — "Graph of Knowledge"
//       Passes portfolio-specific config: themes, dates, quadrants,
//       whispers, tour, threads, etc.
//
//  Any dataset can be visualized by calling createSkillTree() with
//  a different config object (e.g. the MTG instance at the bottom).
//
//  Depends on: VIZ.JS  (initPanZoom, createFilterSystem,
//                        createExploreHint, animateCameraFit,
//                        createLayoutToggle, createCrossfader)
//              MODALS.JS (toggleModal)
// ═══════════════════════════════════════════════════════════════


// ─────────────────────────────────────────────────────────────
//  createSkillTree(cfg) → controller
//
//  cfg fields:
//    modal            – DOM .modal-overlay element
//    closeBtn         – DOM close button
//    edgeSvgSelector  – CSS selector for SVG edge layer (default ".kg-edges")
//    filterBtnClass   – CSS class on filter buttons (default "mtg-filter")
//
//    filterAxes       – Array of {
//        key,           – string key used in node.filterKeys[key]
//        allValues,     – string[] of all possible values
//        allBtn,        – DOM element for "all" toggle (or null)
//        itemBtns       – NodeList of per-value toggle buttons
//      }
//
//    buildNodes       – fn(graphWorld, svgNS, helpers) → {
//        nodes:[], hubs:[], centerVirts:[]
//      }
//      Called once to create all DOM elements.
//      helpers = { addEdge(from,to,color,width), registerHover(el,nodeRef), glowFilterId }
//      Each node: { el, targetX, targetY, r, filterKeys:{axis→Set}, _hidden:false, … }
//      Each hub:  { el, targetX, targetY, r, _hidden:false, children:[] }
//      centerVirts: virtual center objects for collision (not pushed)
//
//    isNodeVisible    – fn(node, filterSets:{key→Set}) → bool
//    onClose          – fn() called when modal closes (optional)
//
//    minScale / maxScale / initialScale  – zoom limits (defaults 0.3/5/1)
//    collisionPadding / collisionIters   – physics (defaults 2/80)
//    ignoreSelector   – extra CSS selector to pass through clicks (optional)
//
//  Returns: { open, close, getNodes, getHubs, getTransform, applyFilters, updateGlow }
// ─────────────────────────────────────────────────────────────

/* ── Shared text helpers (used by both portfolio & MTG trees) ── */
const _emojiOnlyRe = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D\s]+$/u;

function fitTextToCircle(layer, circleSize, maxFont) {
  if (!layer) return;
  var text = (layer.textContent || "").trim();
  if (!text) return;
  var isEmoji = _emojiOnlyRe.test(text);
  if (isEmoji) {
    layer.style.fontSize = Math.min(maxFont, circleSize * 0.35) + "px";
    return;
  }
  /* Split on <br> to get the actual lines we control.
     Size so the longest word fits the circle width
     AND all lines fit the circle height. */
  var html = layer.innerHTML || "";
  var words = html.replace(/<br\s*\/?>/gi, "\n").split(/\n/).map(function (w) { return w.trim(); }).filter(Boolean);
  var nLines = words.length || 1;
  var longest = Math.max.apply(null, words.map(function (w) { return w.length; })) || 1;
  /* Width constraint: longest word must fit the circle width.
     Padding is minimal (2px each side); text may touch the border.
     Each uppercase char is roughly 0.62em wide. */
  var innerW = circleSize - 4;
  var widthFs = innerW / (longest * 0.67);
  /* Height constraint: all lines must stack within ~70% of circle */
  var heightFs = (circleSize * 0.70) / (nLines * 1.15);
  var fs = Math.min(widthFs, heightFs, maxFont, circleSize * 0.33);
  fs = Math.max(fs, 5);
  layer.style.fontSize = Math.floor(fs) + "px";
}

function _graphBreakText(text) {
  if (!text) return "";
  let s = text.replace(/\S+/g, w => w.length <= 4 ? w
    : w.replace(/([a-z])([A-Z])/g, "$1\x00$2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1\x00$2")
  );
  s = s.replace(/\s*&\s*/g, " &\x00");
  s = s.replace(/\s+/g, "\x00");
  s = s.replace(/\x00?\(/g, "\x00(");
  const tokens = s.split("\x00").filter(Boolean);
  return tokens.join("<br>");
}

function createSkillTree(cfg) {
  var modal    = cfg.modal;
  var closeBtn = cfg.closeBtn;
  if (!modal || !closeBtn) return null;

  /* ── State ───────────────────────────────────────────────── */
  var built       = false;
  var _nodes      = [];
  var _hubs       = [];
  var _threads    = [];      // { el (SVG path), from, to }
  var _transform  = { x: 0, y: 0, scale: cfg.initialScale || 1 };
  var _graphWorld = null;
  var _edgeSVG    = null;
  var _pz         = null;
  var _hoveredNode = null;

  var MIN_SCALE = cfg.minScale || 0.3;
  var MAX_SCALE = cfg.maxScale || 5;

  /* ── Filter state: one Set per axis ─────────────────────── */
  var _filterSets = {};
  var _axes = cfg.filterAxes || [];
  _axes.forEach(function (ax) {
    _filterSets[ax.key] = new Set(ax.allValues);
  });

  /* ── Reset all filter axes to "all" ──────────────────── */
  function _resetFilters() {
    _axes.forEach(function (ax) {
      ax.allValues.forEach(function (v) { _filterSets[ax.key].add(v); });
      if (ax._syncUI) ax._syncUI();
    });
    if (built) _applyFilters();
  }

  /* ── Open / close ───────────────────────────────────────── */
  function open() {
    _resetFilters();
    toggleModal(modal, true);
    if (!built) {
      _build();
    } else {
      _updateTransform();
      requestAnimationFrame(function () { _animateEntrance(); });
    }
  }

  function close() {
    if (cfg.onClose) cfg.onClose();
    toggleModal(modal, false);
  }

  closeBtn.addEventListener("click", close);
  modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.classList.contains("open")) close();
  });

  /* ── Filter wiring ──────────────────────────────────────── */
  _axes.forEach(function (ax) {
    var active = _filterSets[ax.key];
    var all    = ax.allValues;

    function toggle(key) {
      if (key === "all") {
        all.forEach(function (k) { active.add(k); });
      } else if (active.has(key) && active.size === 1) {
        all.forEach(function (k) { active.add(k); });
      } else if (active.size === all.length) {
        active.clear(); active.add(key);
      } else if (active.has(key)) {
        active.delete(key);
      } else {
        active.add(key);
      }
    }

    function syncAxisUI() {
      if (ax.allBtn) ax.allBtn.classList.toggle("active", active.size === all.length);
      ax.itemBtns.forEach(function (b) {
        var val = b.dataset[ax.key] || b.dataset.filter;
        if (val && val !== "all") b.classList.toggle("active", active.has(val));
      });
    }

    if (ax.allBtn) ax.allBtn.addEventListener("click", function () {
      toggle("all"); syncAxisUI(); _applyFilters();
    });
    ax.itemBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var val = btn.dataset[ax.key] || btn.dataset.filter;
        toggle(val); syncAxisUI(); _applyFilters();
      });
    });

    ax._syncUI = syncAxisUI;
  });

  function _syncAllFilterUI() {
    _axes.forEach(function (ax) { if (ax._syncUI) ax._syncUI(); });
  }

  /* ── Apply filters ──────────────────────────────────────── */
  function _applyFilters() {
    var isVisible = cfg.isNodeVisible || _defaultVisible;
    _nodes.forEach(function (n) {
      var hide = !isVisible(n, _filterSets);
      n._hidden = hide;
      n.el.classList.toggle("kg-hidden", hide);
    });

    _hubs.forEach(function (h) {
      // Hide hub if its deck is filtered out
      var deckFilter = _filterSets.deck;
      if (h._deckId && deckFilter && !deckFilter.has(h._deckId)) {
        h._hidden = true;
        h.el.classList.add("kg-hidden");
        return;
      }
      if (!h.children || !h.children.length) return;
      var hasVis = h.children.some(function (c) { return !c._hidden; });
      h._hidden = !hasVis;
      h.el.classList.toggle("kg-hidden", !hasVis);
    });

    _threads.forEach(function (th) {
      var vis = !th.from._hidden && !th.to._hidden;
      th.el.classList.toggle("kg-thread-hidden", !vis);
      th.el.style.opacity = vis ? "1" : "";
    });

    _updateGlow();
    if (cfg.onFilterApplied) cfg.onFilterApplied();
  }

  function _defaultVisible(node, filterSets) {
    for (var key in filterSets) {
      var active = filterSets[key];
      var vals = node.filterKeys && node.filterKeys[key];
      if (!vals) continue;
      var arr = vals instanceof Set ? Array.from(vals) : (Array.isArray(vals) ? vals : [vals]);
      if (!arr.some(function (v) { return active.has(v); })) return false;
    }
    return true;
  }

  /* ── Proximity glow ─────────────────────────────────────── */
  var _glowRAF = 0;
  function _glowPass() {
    var vp = modal.querySelector(".viz-viewport");
    if (!vp) return;
    var vw = vp.clientWidth, vh = vp.clientHeight;
    var m = 0.40;
    var left = vw * m, right = vw * (1 - m), top = vh * m, bottom = vh * (1 - m);

    var all = _nodes.concat(_hubs);
    for (var i = 0; i < all.length; i++) {
      var n = all[i];
      var sx = (n.targetX || 0) * _transform.scale + _transform.x;
      var sy = (n.targetY || 0) * _transform.scale + _transform.y;
      var inCenter = sx >= left && sx <= right && sy >= top && sy <= bottom;
      var hovered = n === _hoveredNode;
      var tourFocus = cfg.isTouring && cfg.isTouring() && !n.el.classList.contains("kg-hidden");
      var focused = (inCenter || hovered || tourFocus) && !n.el.classList.contains("kg-hidden");
      n.el.classList.toggle("kg-in-focus", focused);
    }
  }
  function _updateGlow() {
    // During touring, run synchronously so kg-in-focus is set in the
    // same paint frame as kg-hidden removal — prevents title flash.
    if (cfg.isTouring && cfg.isTouring()) {
      cancelAnimationFrame(_glowRAF);
      _glowPass();
      return;
    }
    cancelAnimationFrame(_glowRAF);
    _glowRAF = requestAnimationFrame(_glowPass);
  }

  /* ── Transform ──────────────────────────────────────────── */
  function _updateTransform() {
    if (!_graphWorld) return;
    if (_pz) { _pz.update(); return; }
    _graphWorld.style.transform = "translate(" + _transform.x + "px," + _transform.y + "px) scale(" + _transform.scale + ")";
    _updateGlow();
  }

  /* ── Build ──────────────────────────────────────────────── */
  function _build() {
    _graphWorld = modal.querySelector(".viz-world");
    _edgeSVG    = modal.querySelector(cfg.edgeSvgSelector || ".kg-edges");
    if (!_graphWorld || !_edgeSVG) return;

    // Clear previous
    _graphWorld.querySelectorAll(".kg-node").forEach(function (n) { n.remove(); });
    _edgeSVG.innerHTML = "";

    var svgNS = "http://www.w3.org/2000/svg";

    // SVG glow filter (unique per modal to avoid ID collisions)
    var glowId = "st-glow-" + modal.id;
    var defs = document.createElementNS(svgNS, "defs");
    var glow = document.createElementNS(svgNS, "filter");
    glow.setAttribute("id", glowId);
    glow.setAttribute("x", "-50%"); glow.setAttribute("y", "-50%");
    glow.setAttribute("width", "200%"); glow.setAttribute("height", "200%");
    var blur = document.createElementNS(svgNS, "feGaussianBlur");
    blur.setAttribute("stdDeviation", "2"); blur.setAttribute("result", "blur");
    var merge = document.createElementNS(svgNS, "feMerge");
    var mn1 = document.createElementNS(svgNS, "feMergeNode"); mn1.setAttribute("in", "blur");
    var mn2 = document.createElementNS(svgNS, "feMergeNode"); mn2.setAttribute("in", "SourceGraphic");
    merge.appendChild(mn1); merge.appendChild(mn2);
    glow.appendChild(blur); glow.appendChild(merge);
    defs.appendChild(glow);
    _edgeSVG.appendChild(defs);

    // Helpers passed to buildNodes callback
    var helpers = {
      glowFilterId: glowId,
      addEdge: function (from, to, color, width) {
        return _addEdge(svgNS, glowId, from, to, color, width);
      },
      registerHover: function (el, nodeRef) {
        el.addEventListener("mouseenter", function () {
          if (cfg.isTouring && cfg.isTouring()) return;
          _hoveredNode = nodeRef;
          _updateGlow();
          // Highlight connected arrows (mirroring MERMAID.JS)
          if (_graphWorld) _graphWorld.classList.add("kg-hovering");
          if (_edgeSVG) _edgeSVG.classList.add("kg-hovering");
          nodeRef.el.classList.add("kg-highlight");
          _threads.forEach(function (th) {
            if (th.from === nodeRef || th.to === nodeRef) {
              th.el.classList.add("kg-highlight");
              var peer = th.from === nodeRef ? th.to : th.from;
              if (peer && peer.el) peer.el.classList.add("kg-highlight");
            }
          });
        });
        el.addEventListener("mouseleave", function () {
          if (cfg.isTouring && cfg.isTouring()) return;
          if (_hoveredNode === nodeRef) { _hoveredNode = null; _updateGlow(); }
          // Clear all highlights
          if (_graphWorld) _graphWorld.classList.remove("kg-hovering");
          if (_edgeSVG) _edgeSVG.classList.remove("kg-hovering");
          if (_graphWorld) _graphWorld.querySelectorAll(".kg-highlight").forEach(function (e) { e.classList.remove("kg-highlight"); });
          if (_edgeSVG) _edgeSVG.querySelectorAll(".kg-highlight").forEach(function (e) { e.classList.remove("kg-highlight"); });
        });
      },
    };

    var result = cfg.buildNodes(_graphWorld, svgNS, helpers);
    _nodes   = result.nodes   || [];
    _hubs    = result.hubs    || [];
    // Consumer may return pre-built threads (portfolio) or none (mtg)
    if (result.threads && result.threads.length) {
      _threads = _threads.concat(result.threads);
    }
    var centerVirts = result.centerVirts || [];

    /* ── Collision resolution ─────────────────────────────── */
    var PADDING = cfg.collisionPadding || 2;
    var ITERS   = cfg.collisionIters   || 80;
    var immovable = centerVirts.concat(_hubs.filter(function (h) { return h._fixed !== false; }));

    for (var iter = 0; iter < ITERS; iter++) {
      var moved = false;
      for (var i = 0; i < _nodes.length; i++) {
        var a = _nodes[i];
        for (var j = 0; j < immovable.length; j++) {
          var b = immovable[j];
          var dx = a.targetX - b.targetX, dy = a.targetY - b.targetY;
          var d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          var minD = a.r + b.r + PADDING;
          if (d < minD) {
            var p = (minD - d) / d;
            a.targetX += dx * p; a.targetY += dy * p;
            moved = true;
          }
        }
        for (var k = i + 1; k < _nodes.length; k++) {
          var c = _nodes[k];
          var dx2 = c.targetX - a.targetX, dy2 = c.targetY - a.targetY;
          var d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 0.01;
          var minD2 = a.r + c.r + PADDING;
          if (d2 < minD2) {
            var o = (minD2 - d2) / 2;
            var nx = dx2 / d2, ny = dy2 / d2;
            a.targetX -= nx * o; a.targetY -= ny * o;
            c.targetX += nx * o; c.targetY += ny * o;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }

    // Finalize positions
    _nodes.forEach(function (n) {
      n.el.style.left = n.targetX + "px";
      n.el.style.top  = n.targetY + "px";
    });

    // Re-draw edges to final positions
    _threads.forEach(function (th) {
      var f = th.from, t = th.to;
      var dx = t.targetX - f.targetX, dy = t.targetY - f.targetY;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        var ux = dx / len, uy = dy / len;
        var x1 = f.targetX + ux * f.r, y1 = f.targetY + uy * f.r;
        var x2 = t.targetX - ux * t.r, y2 = t.targetY - uy * t.r;
        th.el.setAttribute("d", "M" + x1 + "," + y1 + " L" + x2 + "," + y2);
      }
    });

    // Center view
    var viewport = modal.querySelector(".viz-viewport");
    if (viewport) {
      requestAnimationFrame(function () {
        _transform.x = viewport.clientWidth / 2;
        _transform.y = viewport.clientHeight / 2;
        _transform.scale = cfg.initialScale || 1.0;
        _updateTransform();
      });
    }

    _initPanZoom();
    _syncAllFilterUI();
    built = true;
    requestAnimationFrame(function () { _animateEntrance(); });
  }

  /* ── Edge helper ────────────────────────────────────────── */
  function _addEdge(svgNS, glowId, from, to, color, width) {
    var dx = to.targetX - from.targetX, dy = to.targetY - from.targetY;
    var len = Math.sqrt(dx * dx + dy * dy);
    var fx = from.targetX, fy = from.targetY, tx = to.targetX, ty = to.targetY;
    if (len > 0) {
      var ux = dx / len, uy = dy / len;
      if (len > from.r + to.r) {
        fx += ux * from.r; fy += uy * from.r;
        tx -= ux * to.r;   ty -= uy * to.r;
      }
    }
    var path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", "M" + fx + "," + fy + " L" + tx + "," + ty);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "rgba(" + color + ",0.45)");
    path.setAttribute("stroke-width", String(width || 1));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("filter", "url(#" + glowId + ")");
    path.classList.add("kg-thread");
    path.style.opacity = "0";
    _edgeSVG.appendChild(path);
    var thread = { el: path, from: from, to: to };
    _threads.push(thread);
    return thread;
  }

  /* ── Pan & zoom ─────────────────────────────────────────── */
  function _initPanZoom() {
    var vp = modal.querySelector(".viz-viewport");
    if (!vp) return;
    var ignore = ".kg-node, .viz-explore-hint";
    if (cfg.ignoreSelector) ignore += ", " + cfg.ignoreSelector;
    _pz = initPanZoom(vp, _graphWorld, _transform, {
      minScale: MIN_SCALE, maxScale: MAX_SCALE,
      zoomStep: [0.9, 1.1],
      bounceCurve: "cubic-bezier(0.34,1.56,0.64,1)",
      bounceDuration: 380,
      rubberBandDrag: false,
      ignoreSelector: ignore,
      onUpdate: function () { _updateGlow(); },
      getBounds: function () {
        var vp2 = modal.querySelector(".viz-viewport");
        if (!vp2) return null;
        var all = _nodes.concat(_hubs);
        if (!all.length) return null;
        var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        all.forEach(function (n) {
          if (n.targetX < x0) x0 = n.targetX;
          if (n.targetX > x1) x1 = n.targetX;
          if (n.targetY < y0) y0 = n.targetY;
          if (n.targetY > y1) y1 = n.targetY;
        });
        var m = 100; x0 -= m; x1 += m; y0 -= m; y1 += m;
        var s = _transform.scale, pad = 0.48;
        return {
          minX: vp2.clientWidth  * pad - x1 * s, maxX: vp2.clientWidth  * (1 - pad) - x0 * s,
          minY: vp2.clientHeight * pad - y1 * s, maxY: vp2.clientHeight * (1 - pad) - y0 * s,
        };
      },
    });
  }

  /* ── Entrance animation ─────────────────────────────────── */
  function _animateEntrance() {
    var all = _hubs.concat(_nodes);
    all.forEach(function (n) {
      n.el.style.left = "0px"; n.el.style.top = "0px";
      n.el.style.opacity = "0";
      n.el.style.transform = "translate(-50%,-50%) scale(0.3)";
    });
    _threads.forEach(function (th) { th.el.style.opacity = "0"; });

    var dists = all.map(function (n) { return Math.sqrt((n.targetX||0)*(n.targetX||0) + (n.targetY||0)*(n.targetY||0)); });
    var maxDist = Math.max.apply(null, [1].concat(dists));
    var MAX_DELAY = 700;

    all.forEach(function (n, i) {
      var frac = Math.sqrt((n.targetX||0)*(n.targetX||0) + (n.targetY||0)*(n.targetY||0)) / maxDist;
      var delay = frac * MAX_DELAY + i * 2;
      setTimeout(function () {
        n.el.style.transition = "left 0.6s cubic-bezier(0.34,1.56,0.64,1),top 0.6s cubic-bezier(0.34,1.56,0.64,1),opacity 0.4s ease,transform 0.5s cubic-bezier(0.34,1.56,0.64,1)";
        n.el.style.left    = n.targetX + "px";
        n.el.style.top     = n.targetY + "px";
        n.el.style.opacity = "";
        n.el.style.transform = "translate(-50%,-50%) scale(1)";
        setTimeout(function () { n.el.style.transition = ""; }, 700);
      }, delay);
    });

    // Fade threads
    var fadeDur = 500, fadeStart = performance.now() + 350;
    function fadeThreads(now) {
      var t = Math.max(0, Math.min(1, (now - fadeStart) / fadeDur));
      var o = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
      _threads.forEach(function (th) {
        if (!th.el.classList.contains("kg-thread-hidden")) th.el.style.opacity = String(o);
      });
      if (t < 1) requestAnimationFrame(fadeThreads);
    }
    requestAnimationFrame(fadeThreads);

    var vp = modal.querySelector(".viz-viewport");
    if (vp) requestAnimationFrame(function () {
      _transform.x = vp.clientWidth / 2;
      _transform.y = vp.clientHeight / 2;
      _transform.scale = cfg.initialScale || 1.0;
      _updateTransform();
    });

    setTimeout(function () { _updateGlow(); }, MAX_DELAY + all.length * 2 + 700);
  }

  /* ── Animate nodes to new targetX/Y positions ───────────── */
  function _animateToPositions(duration) {
    var dur = duration || 600;
    var ease = "cubic-bezier(0.34,1.56,0.64,1)";
    _nodes.concat(_hubs).forEach(function (n) {
      n.el.style.transition = "left " + dur + "ms " + ease + ",top " + dur + "ms " + ease;
      n.el.style.left = n.targetX + "px";
      n.el.style.top  = n.targetY + "px";
      setTimeout(function () { n.el.style.transition = ""; }, dur + 50);
    });
    // Redraw edges
    _threads.forEach(function (th) {
      var f = th.from, t = th.to;
      var dx = t.targetX - f.targetX, dy = t.targetY - f.targetY;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        var ux = dx / len, uy = dy / len;
        var x1 = f.targetX + ux * f.r, y1 = f.targetY + uy * f.r;
        var x2 = t.targetX - ux * t.r, y2 = t.targetY - uy * t.r;
        th.el.setAttribute("d", "M" + x1 + "," + y1 + " L" + x2 + "," + y2);
      }
    });
    setTimeout(function () { _updateGlow(); }, dur + 100);
  }

  /* ── Public API ─────────────────────────────────────────── */
  return {
    open:          open,
    close:         close,
    getNodes:      function () { return _nodes; },
    getHubs:       function () { return _hubs; },
    getThreads:    function () { return _threads; },
    getTransform:  function () { return _transform; },
    applyFilters:  _applyFilters,
    resetFilters:  _resetFilters,
    getFilterSets: function () { return _filterSets; },
    syncFilterUI:  _syncAllFilterUI,
    updateGlow:    _updateGlow,
    updateTransform: _updateTransform,
    animateToPositions: _animateToPositions,
  };
}


// ═══════════════════════════════════════════════════════════════
//  GRAPH OF KNOWLEDGE — Portfolio instance
//
//  Uses createSkillTree() but with extensive portfolio-specific
//  additions: quadrant layout, date-based positioning, whisper
//  crossfade, threads (Bézier work/education/projects paths),
//  dynamic relayout, and guided tour.
//
//  These features use the factory for open/close and pan/zoom
//  but keep their own custom buildGraph() since the portfolio's
//  node creation, thread system, and tour are too specialized
//  to generalize into the factory without over-engineering.
// ═══════════════════════════════════════════════════════════════
(() => {
  const graphModal = document.getElementById("knowledge-modal");
  const graphModalClose = document.getElementById("knowledgeModalClose");
  if (!graphModal || !graphModalClose) return;

  /* ── Thematic config (from VIZ.JS) ──────────────────────────── */
  const themeConfig = {};
  ["robotics", "games", "software", "education", "work", "projects"].forEach(function (k) {
    var src = VIZ_THEMES[k];
    themeConfig[k] = { color: src.color, icon: src.icon, label: src.label, emoji: src.emoji };
  });

  /* ── Thread (overlay-theme) colors — one thread per theme×quadrant pair ── */
  const threadConfig = {
    work:      { color: "0,120,212",  label: "Work" },       // MSFT Blue
    education: { color: "255,185,0",  label: "Education" },  // MSFT Yellow
    projects:  { color: "242,80,34",  label: "Projects" },   // MSFT Red
  };

  const themeMap = VIZ_SOURCE_MAP;

  /** Quadrant direction vectors (unit) — 3-way 120° triangle */
  const quadrantDir = {
    robotics:  { x: 0,    y: -1    },  // North (up, 270°)
    games:     { x: -0.866, y: 0.5 },  // South-West (210°)
    software:  { x:  0.866, y: 0.5 },  // South-East (330°)
  };

  function getTheme(item) { return themeMap[item.ID] || "software"; }

  /* ── Date parsing (simplified from TIMELINE.JS) ───────────── */
  const monthLookup = {
    jan:0,january:0,feb:1,february:1,mar:2,march:2,
    apr:3,april:3,may:4,jun:5,june:5,jul:6,july:6,
    aug:7,august:7,sep:8,september:8,oct:9,october:9,
    nov:10,november:10,dec:11,december:11,
    spring:2,summer:5,fall:8,winter:11
  };

  function _parseSingle(str) {
    if (!str) return null;
    const s = str.trim();
    if (!s) return null;
    if (/^present$/i.test(s)) return 2026 * 12 + 1;
    let m;
    if ((m = s.match(/^'(\d{2})$/)))            return (+m[1]+2000)*12;
    if ((m = s.match(/^(\d{4})$/)))              return +m[1]*12 + 6;
    if ((m = s.match(/^(\w+)\s+(\d{4})$/))) {
      const mo = monthLookup[m[1].toLowerCase()];
      if (mo !== undefined) return +m[2]*12 + mo;
    }
    if ((m = s.match(/(\d{4})/)))                return +m[1]*12 + 6;
    if ((m = s.match(/'(\d{2})/)))               return (+m[1]+2000)*12;
    return null;
  }

  function parseDateStart(dateStr) {
    if (!dateStr || !dateStr.trim()) return null;
    const segments = dateStr.trim().split(/\s*,\s*/);
    let earliest = Infinity;
    segments.forEach(seg => {
      const rangeParts = seg.split(/\s*[-–]\s*/);
      const start = _parseSingle(rangeParts[0]);
      if (start !== null && start < earliest) earliest = start;
    });
    return earliest === Infinity ? null : earliest;
  }

  function parseDateEnd(dateStr) {
    if (!dateStr || !dateStr.trim()) return null;
    const segments = dateStr.trim().split(/\s*,\s*/);
    let latest = -Infinity;
    segments.forEach(seg => {
      const rangeParts = seg.split(/\s*[-–]\s*/);
      const end = _parseSingle(rangeParts[rangeParts.length - 1]);
      if (end !== null && end > latest) latest = end;
    });
    return latest === -Infinity ? null : latest;
  }

  /* ── State ────────────────────────────────────────────────── */
  let graphBuilt = false;
  let activeFilters = new Set(["robotics", "games", "software", "education", "work", "projects"]);
  const allThemes = ["robotics", "games", "software", "education", "work", "projects"];

  let _nodes = [];
  let _hoveredNode = null;
  let _threads = [];
  let _transform = { x: 0, y: 0, scale: 1 };
  let _graphWorld = null;
  let _edgeSVG = null;

  /* ── Open / close ─────────────────────────────────────────── */
  function openKnowledgeModal() {
    _filterSys.setAll();
    toggleModal(graphModal, true);
    if (!graphBuilt) buildGraph();
    else updateTransform();
    requestAnimationFrame(() => animateEntrance());
  }

  function closeKnowledgeModal() {
    toggleModal(graphModal, false);
  }

  window.openKnowledgeModal  = openKnowledgeModal;
  window.closeKnowledgeModal = closeKnowledgeModal;

  graphModalClose.addEventListener("click", closeKnowledgeModal);
  graphModal.addEventListener("click", e => { if (e.target === graphModal) closeKnowledgeModal(); });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && graphModal.classList.contains("open")) closeKnowledgeModal();
  });

  /* ── Filter buttons (via VIZ.JS shared filter system) ─────── */
  const allBtn = graphModal.querySelector('.viz-filter[data-filter="all"]');
  const themeBtns = graphModal.querySelectorAll('.viz-filter:not([data-filter="all"])');

  const quadrantFilters = ["robotics", "games", "software"];
  const overlayFilters  = ["education", "work", "projects"];

  const _layoutToggle = createLayoutToggle({
    btn: "kgLayoutToggle",
    onDynamic: function () { if (graphBuilt) relayoutAndAnimate(); },
  });

  const _filterSys = createFilterSystem({
    allThemes: allThemes,
    activeFilters: activeFilters,
    allBtn: allBtn,
    themeBtns: themeBtns,
    onFilter: applyFilter,
    soloLogic: function (f, activeFilters, allThemes) {
      var isQuadrant = quadrantFilters.indexOf(f) !== -1;
      var sameGroup  = isQuadrant ? quadrantFilters : overlayFilters;

      if (activeFilters.size === allThemes.length) {
        sameGroup.forEach(function (t) { activeFilters.delete(t); });
        activeFilters.add(f);
      } else if (activeFilters.has(f) && activeFilters.size === 1) {
        allThemes.forEach(function (t) { activeFilters.add(t); });
      } else if (activeFilters.has(f)) {
        var siblingsOn = sameGroup.filter(function (t) { return t !== f && activeFilters.has(t); });
        if (siblingsOn.length === 0) {
          sameGroup.forEach(function (t) { activeFilters.add(t); });
        } else {
          activeFilters.delete(f);
        }
      } else {
        activeFilters.add(f);
      }
    },
  });

  function applyFilter() {
    const anyQuadrantOn = ["robotics", "games", "software"].some(q => activeFilters.has(q));
    _nodes.forEach(n => {
      const quadrantOn = activeFilters.has(n.quadrant);
      const isEdu = n.theme === "education";
      const eduOn = activeFilters.has("education");
      const isWork = n.theme === "work";
      const workOn = activeFilters.has("work");
      const isProjects = n.theme === "projects";
      const projectsOn = activeFilters.has("projects");
      let hide;
      if (isEdu) {
        hide = !eduOn || (anyQuadrantOn && !quadrantOn);
      } else if (isWork) {
        hide = !workOn || (anyQuadrantOn && !quadrantOn);
      } else if (isProjects) {
        hide = !projectsOn || (anyQuadrantOn && !quadrantOn);
      } else {
        hide = !quadrantOn;
      }
      n._hidden = hide;
      n.el.classList.toggle("kg-hidden", hide);
    });

    const activeOverlays = overlayFilters.filter(f => activeFilters.has(f));
    const singleOverlay = activeOverlays.length === 1;

    _threads.forEach(th => {
      const themeOn    = activeFilters.has(th.theme);
      const quadrantOn = activeFilters.has(th.quadrant);
      const visible    = themeOn && quadrantOn;
      th.segments.forEach(seg => {
        seg.classList.toggle("kg-thread-hidden", !visible);
        if (visible) {
          seg.style.opacity = "1";
        } else {
          seg.style.opacity = "";
        }
      });

      if (visible) {
        const useQuadrantColor = singleOverlay;
        const color = useQuadrantColor
          ? themeConfig[th.quadrant].color
          : threadConfig[th.theme].color;
        const markerRef = useQuadrantColor
          ? `url(#thread-arrow-${th.quadrant})`
          : `url(#thread-arrow-${th.theme})`;
        th.segments.forEach(seg => {
          seg.setAttribute("stroke", `rgb(${color})`);
          seg.setAttribute("marker-end", markerRef);
        });
      }
    });

    if (!_layoutToggle.isStatic()) {
      relayoutAndAnimate();
    }
    updateProximityGlow();

    // Smooth-ease the camera to fit visible nodes (like traverse mode)
    if (!_kgTour || !_kgTour.isTouring()) {
      var settleDelay = _layoutToggle.isStatic() ? 80 : 700;
      setTimeout(function () { fitVisibleNodes(true); }, settleDelay);
    }
  }

  function relayoutAndAnimate() {
    const visible = _nodes.filter(n => !n._hidden);
    if (visible.length === 0) return;

    const quadrants = { robotics: [], games: [], software: [] };
    visible.forEach(n => {
      if (quadrants[n.quadrant]) quadrants[n.quadrant].push(n);
    });

    Object.values(quadrants).forEach(group => {
      group.sort((a, b) => a.absMonth - b.absMonth);
    });

    const allMonths = _nodes.map(n => n.absMonth);
    const globalMin = Math.min(...allMonths);
    const globalMax = Math.max(...allMonths);
    const dateRange = Math.max(1, globalMax - globalMin);

    const MIN_DIST     = 100;
    const MAX_DIST     = 400;
    const SPREAD_ANGLE = Math.PI / 2.5;
    const CENTER_R     = 50;
    const PADDING      = 2;
    const ITERATIONS   = 60;

    const movable = [];
    Object.keys(quadrants).forEach(qKey => {
      const group = quadrants[qKey];
      if (group.length === 0) return;
      const dir = quadrantDir[qKey];
      const baseAngle = Math.atan2(dir.y, dir.x);

      group.forEach((n, idx) => {
        const t = dateRange > 0 ? (n.absMonth - globalMin) / dateRange : 0.5;
        const dist = MIN_DIST + Math.sqrt(t) * (MAX_DIST - MIN_DIST);
        let angle;
        if (group.length === 1) {
          angle = baseAngle;
        } else {
          const at = idx / (group.length - 1);
          angle = baseAngle + SPREAD_ANGLE * (at - 0.5);
        }
        const seed1 = Math.sin(idx * 7.3 + baseAngle * 13.7);
        const seed2 = Math.sin(idx * 11.1 + baseAngle * 5.3);
        const jitterDist  = dist * (1 + seed1 * 0.06);
        const jitterAngle = angle + seed2 * 0.06;

        n._newX = Math.cos(jitterAngle) * jitterDist;
        n._newY = Math.sin(jitterAngle) * jitterDist;
        movable.push(n);
      });
    });

    for (let iter = 0; iter < ITERATIONS; iter++) {
      let anyMoved = false;

      for (let i = 0; i < movable.length; i++) {
        const a = movable[i];
        const dcx = a._newX;
        const dcy = a._newY;
        const distC = Math.sqrt(dcx * dcx + dcy * dcy) || 0.01;
        const minDistC = a.r + CENTER_R + PADDING;
        if (distC < minDistC) {
          const push = (minDistC - distC) / distC;
          a._newX += dcx * push;
          a._newY += dcy * push;
          anyMoved = true;
        }
        for (let j = i + 1; j < movable.length; j++) {
          const b = movable[j];
          const dx = b._newX - a._newX;
          const dy = b._newY - a._newY;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const minDist = a.r + b.r + PADDING;
          if (dist < minDist) {
            const overlap = (minDist - dist) / 2;
            const nx = dx / dist;
            const ny = dy / dist;
            a._newX -= nx * overlap;
            a._newY -= ny * overlap;
            b._newX += nx * overlap;
            b._newY += ny * overlap;
            anyMoved = true;
          }
        }
      }
      if (!anyMoved) break;
    }

    const maxDist = Math.max(1, ...visible.map(n => Math.sqrt(n._newX * n._newX + n._newY * n._newY)));
    const MAX_DELAY = 200;

    visible.forEach((n, i) => {
      const distFrac = Math.sqrt(n._newX * n._newX + n._newY * n._newY) / maxDist;
      const delay = distFrac * MAX_DELAY + i * 4;

      setTimeout(() => {
        n.el.style.transition = "left 0.55s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)";
        n.el.style.left = n._newX + "px";
        n.el.style.top  = n._newY + "px";
        n.targetX = n._newX;
        n.targetY = n._newY;
        n.dist = Math.sqrt(n._newX * n._newX + n._newY * n._newY);

        setTimeout(() => {
          n.el.style.transition = "";
        }, 600);
      }, delay);
    });

    _threads.forEach(th => {
      const themeOn    = activeFilters.has(th.theme);
      const quadrantOn = activeFilters.has(th.quadrant);
      if (!themeOn || !quadrantOn) return;

      th.segments.forEach((seg, i) => {
        const fromNode = th.nodes[i];
        const toNode   = th.nodes[i + 1];
        if (!fromNode || !toNode) return;
        if (fromNode._hidden || toNode._hidden) return;

        let nx1 = fromNode._newX;
        let ny1 = fromNode._newY;
        let nx2 = toNode._newX;
        let ny2 = toNode._newY;

        const dx = nx2 - nx1;
        const dy = ny2 - ny1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
          const ux = dx / len, uy = dy / len;
          const fromR = fromNode.r || 30;
          const toR   = toNode.r || 30;
          if (len > fromR + toR) {
            nx1 += ux * fromR;
            ny1 += uy * fromR;
            nx2 -= ux * toR;
            ny2 -= uy * toR;
          }
        }

        const ncp = _bezierCtrl(nx1, ny1, nx2, ny2, i);

        const ox1 = seg._cx1 || 0, oy1 = seg._cy1 || 0;
        const ocx = seg._ccx || 0, ocy = seg._ccy || 0;
        const ox2 = seg._cx2 || 0, oy2 = seg._cy2 || 0;

        const dur = 550;
        const start = performance.now() + 50;
        function animSeg(now) {
          let t = Math.min(1, (now - start) / dur);
          if (t < 0) t = 0;
          const ease = t < 1 ? 1 - Math.pow(1 - t, 3) * (1 + 2.5 * (1 - t) * Math.sin(t * Math.PI)) : 1;
          const ax1 = ox1 + (nx1 - ox1) * ease;
          const ay1 = oy1 + (ny1 - oy1) * ease;
          const acx = ocx + (ncp.x - ocx) * ease;
          const acy = ocy + (ncp.y - ocy) * ease;
          const ax2 = ox2 + (nx2 - ox2) * ease;
          const ay2 = oy2 + (ny2 - oy2) * ease;
          seg.setAttribute("d", _curveD(ax1, ay1, acx, acy, ax2, ay2));
          if (t < 1) requestAnimationFrame(animSeg);
        }
        requestAnimationFrame(animSeg);

        seg._cx1 = nx1; seg._cy1 = ny1;
        seg._ccx = ncp.x; seg._ccy = ncp.y;
        seg._cx2 = nx2; seg._cy2 = ny2;
      });
    });

    const totalAnimTime = MAX_DELAY + visible.length * 4 + 600;
    setTimeout(() => updateProximityGlow(), totalAnimTime);
  }

  /* ── Pan & Zoom ───────────────────────────────────────────── */
  const _KG_MIN_SCALE = 1;
  const _KG_MAX_SCALE = 4;

  let _pz = null;

  let _glowRAF = 0;
  function updateProximityGlow() {
    cancelAnimationFrame(_glowRAF);
    _glowRAF = requestAnimationFrame(() => {
      const viewport = graphModal.querySelector(".viz-viewport");
      if (!viewport || _nodes.length === 0) return;
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const margin = 0.35;
      const left   = vw * margin;
      const right  = vw * (1 - margin);
      const top    = vh * margin;
      const bottom = vh * (1 - margin);

      const zoomT = Math.max(0, Math.min(1, (_transform.scale - _KG_MIN_SCALE) / (_KG_MAX_SCALE - _KG_MIN_SCALE)));

      _nodes.forEach(n => {
        const sx = n.targetX * _transform.scale + _transform.x;
        const sy = n.targetY * _transform.scale + _transform.y;
        const inCenter = sx >= left && sx <= right && sy >= top && sy <= bottom;
        const hovered = n === _hoveredNode;
        const tourFocus = _kgTour && _kgTour.isTouring() && !n._hidden;
        const focused = (inCenter || hovered || tourFocus) && !n.el.classList.contains("kg-hidden");
        n.el.classList.toggle("kg-in-focus", focused);

        if (!n.nameLayer || !n.whisperLayers || n.whisperLayers.length < 2) return;

        if (focused && n.whispers.length) {
          if (_kgTour && _kgTour.isTouring() && !_tourShowNames) {
            // Tour whisper phase: show whisper on all visible nodes
            // (CSS !important handles this, but keep kg-name-show in sync)
            n.nameLayer.classList.remove("kg-name-show");
            if (!n.wasFocused) {
              var cur = n.whisperLayers[n.activeWhisper];
              cur.innerHTML = n.whispers[0];
              fitTextToCircle(cur, parseFloat(n.el.style.getPropertyValue('--kg-size')) || 70, (parseFloat(n.el.style.getPropertyValue('--kg-size')) || 70) * 0.50);
              cur.classList.add("kg-name-show");
            }
            n.wasFocused = true;
            return;
          }
          // Focused (glow/hover or tour show-names): show name, hide whisper
          n.nameLayer.classList.add("kg-name-show");
          n.whisperLayers[0].classList.remove("kg-name-show");
          n.whisperLayers[1].classList.remove("kg-name-show");
          n.wasFocused = false;
          return;
        }

        // Not focused — show whisper (if available)
        if (n.whispers.length) {
          const idx = Math.min(n.whispers.length - 1, Math.floor(zoomT * n.whispers.length));

          if (!n.wasFocused) {
            n.nameLayer.classList.remove("kg-name-show");
            const cur = n.whisperLayers[n.activeWhisper];
            cur.innerHTML = n.whispers[idx];
            fitTextToCircle(cur, parseFloat(n.el.style.getPropertyValue('--kg-size')) || 70, (parseFloat(n.el.style.getPropertyValue('--kg-size')) || 70) * 0.50);
            cur.classList.add("kg-name-show");
            n.lastWhisperIdx = idx;
          } else if (idx !== n.lastWhisperIdx) {
            const outLayer = n.whisperLayers[n.activeWhisper];
            const inIdx    = 1 - n.activeWhisper;
            const inLayer  = n.whisperLayers[inIdx];
            inLayer.innerHTML = n.whispers[idx];
            fitTextToCircle(inLayer, parseFloat(n.el.style.getPropertyValue('--kg-size')) || 70, (parseFloat(n.el.style.getPropertyValue('--kg-size')) || 70) * 0.50);
            inLayer.classList.add("kg-name-show");
            outLayer.classList.remove("kg-name-show");
            n.activeWhisper = inIdx;
            n.lastWhisperIdx = idx;
          }
          n.wasFocused = true;
        } else {
          // No whispers: show name as usual
          n.nameLayer.classList.add("kg-name-show");
          n.whisperLayers[0].classList.remove("kg-name-show");
          n.whisperLayers[1].classList.remove("kg-name-show");
          n.wasFocused = false;
        }
      });
    });
  }

  function updateTransform() {
    if (!_graphWorld) return;
    if (_pz) { _pz.update(); return; }
    _graphWorld.style.transform = `translate(${_transform.x}px, ${_transform.y}px) scale(${_transform.scale})`;
    updateProximityGlow();
  }

  function bounceBackIfNeeded() {
    if (_pz) _pz.bounceBackIfNeeded();
  }

  function _initPanZoom() {
    const viewport = graphModal.querySelector(".viz-viewport");
    if (!viewport) return;
    _pz = initPanZoom(viewport, _graphWorld, _transform, {
      minScale:       _KG_MIN_SCALE,
      maxScale:       _KG_MAX_SCALE,
      zoomStep:       [0.9, 1.1],
      bounceCurve:    "cubic-bezier(0.34, 1.56, 0.64, 1)",
      bounceDuration: 380,
      rubberBandDrag: false,
      ignoreSelector: ".kg-node, .viz-explore-hint",
      onUpdate:       () => updateProximityGlow(),
      getBounds:      () => {
        const vp = graphModal.querySelector(".viz-viewport");
        if (!vp || _nodes.length === 0) return null;
        const vw = vp.clientWidth;
        const vh = vp.clientHeight;
        let wMinX = Infinity, wMaxX = -Infinity, wMinY = Infinity, wMaxY = -Infinity;
        _nodes.forEach(n => {
          if (n.targetX < wMinX) wMinX = n.targetX;
          if (n.targetX > wMaxX) wMaxX = n.targetX;
          if (n.targetY < wMinY) wMinY = n.targetY;
          if (n.targetY > wMaxY) wMaxY = n.targetY;
        });
        const m = 80;
        wMinX -= m; wMaxX += m; wMinY -= m; wMaxY += m;
        const s = _transform.scale;
        const pad = 0.48;
        return {
          minX: vw * pad - wMaxX * s,
          maxX: vw * (1 - pad) - wMinX * s,
          minY: vh * pad - wMaxY * s,
          maxY: vh * (1 - pad) - wMinY * s,
        };
      },
    });
  }

  /* ── Bézier curve helpers ─────────────────────────────────── */
  function _bezierCtrl(x1, y1, x2, y2, idx) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / len;
    const py =  dx / len;
    const sign = (idx % 2 === 0) ? 1 : -1;
    const offset = len * 0.18 * sign;
    return { x: mx + px * offset, y: my + py * offset };
  }

  function _curveD(x1, y1, cx, cy, x2, y2) {
    return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
  }



  /* ── Build Graph ──────────────────────────────────────────── */
  function buildGraph() {
    const datasets = ["work", "education", "projects", "hackathons", "games"];
    if (!datasets.every(d => modalState[d])) { setTimeout(buildGraph, 200); return; }

    const items = [];
    datasets.forEach(cat => {
      (modalState[cat] || []).forEach(item => {
        const theme = getTheme(item);
        const startMo = parseDateStart(item.DATE);
        const endMo   = parseDateEnd(item.DATE);
        if (startMo === null) return;

        const duration = Math.max(3, (endMo || startMo) - startMo);

        let quadrant = VIZ_QUADRANT_MAP[item.ID]
          || (theme === "robotics" || theme === "games" || theme === "software" ? theme : null)
          || "software";

        items.push({ item, category: cat, theme, quadrant, absMonth: startMo, endMonth: endMo || startMo, duration });
      });
    });

    if (items.length === 0) return;

    const quadrants = { robotics: [], games: [], software: [] };
    items.forEach(it => {
      if (quadrants[it.quadrant]) quadrants[it.quadrant].push(it);
    });

    Object.values(quadrants).forEach(group => {
      group.sort((a, b) => a.absMonth - b.absMonth);
    });

    _graphWorld = graphModal.querySelector(".viz-world");
    _edgeSVG = graphModal.querySelector(".kg-edges");
    if (!_graphWorld || !_edgeSVG) return;

    _graphWorld.querySelectorAll(".kg-node").forEach(n => n.remove());
    _edgeSVG.innerHTML = "";
    _nodes = [];

    const centerSize = 100;
    const centerNode = document.createElement("div");
    centerNode.className = "kg-node kg-node-center";
    centerNode.style.setProperty("--kg-size", centerSize + "px");
    centerNode.innerHTML = `<div class="kg-node-icon">🐧</div>`;
    centerNode.style.left = "0px";
    centerNode.style.top = "0px";
    centerNode.style.cursor = "pointer";
    centerNode.addEventListener("click", e => {
      e.stopPropagation();
      openQuiltModal();
    });
    _graphWorld.appendChild(centerNode);

    const globalMin = Math.min(...items.map(it => it.absMonth));
    const globalMax = Math.max(...items.map(it => it.absMonth));
    const dateRange = Math.max(1, globalMax - globalMin);

    const MIN_DIST     = 100;
    const MAX_DIST     = 400;
    const SPREAD_ANGLE = Math.PI / 2.5;

    const globalMinDur = Math.min(...items.map(it => it.duration));
    const globalMaxDur = Math.max(...items.map(it => it.duration));
    const MIN_SIZE = 52;
    const MAX_SIZE = 120;

    function durationToSize(dur) {
      if (globalMaxDur <= globalMinDur) return (MIN_SIZE + MAX_SIZE) / 2;
      const t = (dur - globalMinDur) / (globalMaxDur - globalMinDur);
      return MIN_SIZE + Math.sqrt(t) * (MAX_SIZE - MIN_SIZE);
    }

    const allPlaced = [];
    const CENTER_R = 50;
    allPlaced.push({ x: 0, y: 0, r: CENTER_R, fixed: true });

    Object.keys(quadrants).forEach(qKey => {
      const group = quadrants[qKey];
      if (group.length === 0) return;
      const dir = quadrantDir[qKey];
      const baseAngle = Math.atan2(dir.y, dir.x);

      group.forEach((it, idx) => {
        const t = dateRange > 0 ? (it.absMonth - globalMin) / dateRange : 0.5;
        const dist = MIN_DIST + t * (MAX_DIST - MIN_DIST);

        let angle;
        if (group.length === 1) {
          angle = baseAngle;
        } else {
          const at = idx / (group.length - 1);
          angle = baseAngle + SPREAD_ANGLE * (at - 0.5);
        }

        const seed1 = Math.sin(idx * 7.3 + baseAngle * 13.7);
        const seed2 = Math.sin(idx * 11.1 + baseAngle * 5.3);
        const jitterDist  = dist * (1 + seed1 * 0.06);
        const jitterAngle = angle + seed2 * 0.06;

        it.x = Math.cos(jitterAngle) * jitterDist;
        it.y = Math.sin(jitterAngle) * jitterDist;
        it.dist = dist;
        it.size = durationToSize(it.duration);
        it.r = it.size / 2;
      });
    });

    const movable = [];
    Object.values(quadrants).forEach(group => {
      group.forEach(it => movable.push(it));
    });

    const PADDING = 2;
    const ITERATIONS = 60;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      let anyMoved = false;

      for (let i = 0; i < movable.length; i++) {
        const a = movable[i];

        const dcx = a.x;
        const dcy = a.y;
        const distC = Math.sqrt(dcx * dcx + dcy * dcy) || 0.01;
        const minDistC = a.r + CENTER_R + PADDING;
        if (distC < minDistC) {
          const push = (minDistC - distC) / distC;
          a.x += dcx * push;
          a.y += dcy * push;
          anyMoved = true;
        }

        for (let j = i + 1; j < movable.length; j++) {
          const b = movable[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const minDist = a.r + b.r + PADDING;

          if (dist < minDist) {
            const overlap = (minDist - dist) / 2;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x -= nx * overlap;
            a.y -= ny * overlap;
            b.x += nx * overlap;
            b.y += ny * overlap;
            anyMoved = true;
          }
        }
      }

      if (!anyMoved) break;
    }

    movable.forEach(it => {
      it.dist = Math.sqrt(it.x * it.x + it.y * it.y);
    });

    Object.keys(quadrants).forEach(qKey => {
      const group = quadrants[qKey];
      if (group.length === 0) return;

      group.forEach((it, idx) => {
        const el = buildNodeElement(it);
        el.style.left = it.x + "px";
        el.style.top = it.y + "px";
        _graphWorld.appendChild(el);

        const wEmoji = VIZ_WHISPER_MAP[it.item.ID];
        const wList = wEmoji ? [wEmoji] : [];
        const nameLayer = el.querySelector(".kg-name-layer:not(.kg-name-whisper)");
        const whisperLayers = Array.from(el.querySelectorAll(".kg-name-whisper"));

        el.addEventListener("mouseenter", () => {
          const node = _nodes.find(nd => nd.el === el);
          if (node) { _hoveredNode = node; updateProximityGlow(); }
        });
        el.addEventListener("mouseleave", () => {
          if (_hoveredNode && _hoveredNode.el === el) { _hoveredNode = null; updateProximityGlow(); }
        });

        _nodes.push({
          el,
          theme: it.theme,
          quadrant: it.quadrant,
          item: it.item,
          category: it.category,
          absMonth: it.absMonth,
          endMonth: it.endMonth,
          dist: it.dist,
          r: it.r,
          targetX: it.x,
          targetY: it.y,
          whispers: wList,
          nameLayer,
          whisperLayers,
          activeWhisper: 0,
          lastWhisperIdx: -1,
          wasFocused: false,
        });
      });
    });

    _threads = [];
    const svgNS = "http://www.w3.org/2000/svg";

    let defs = _edgeSVG.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS(svgNS, "defs");
      _edgeSVG.prepend(defs);
    }

    const overlayThemes = ["work", "education", "projects"];
    const quadrantKeys  = ["robotics", "games", "software"];

    const glowFilter = document.createElementNS(svgNS, "filter");
    glowFilter.setAttribute("id", "thread-glow");
    glowFilter.setAttribute("x", "-50%");
    glowFilter.setAttribute("y", "-50%");
    glowFilter.setAttribute("width", "200%");
    glowFilter.setAttribute("height", "200%");
    const feBlur = document.createElementNS(svgNS, "feGaussianBlur");
    feBlur.setAttribute("stdDeviation", "2.5");
    feBlur.setAttribute("result", "blur");
    const feMerge = document.createElementNS(svgNS, "feMerge");
    const feMergeBlur = document.createElementNS(svgNS, "feMergeNode");
    feMergeBlur.setAttribute("in", "blur");
    const feMergeOrig = document.createElementNS(svgNS, "feMergeNode");
    feMergeOrig.setAttribute("in", "SourceGraphic");
    feMerge.appendChild(feMergeBlur);
    feMerge.appendChild(feMergeOrig);
    glowFilter.appendChild(feBlur);
    glowFilter.appendChild(feMerge);
    defs.appendChild(glowFilter);

    overlayThemes.forEach(theme => {
      const cfg = threadConfig[theme];
      if (!cfg) return;
      const markerId = `thread-arrow-${theme}`;
      const marker = document.createElementNS(svgNS, "marker");
      marker.setAttribute("id", markerId);
      marker.setAttribute("viewBox", "0 0 10 10");
      marker.setAttribute("refX", "10");
      marker.setAttribute("refY", "5");
      marker.setAttribute("markerWidth", "4");
      marker.setAttribute("markerHeight", "4");
      marker.setAttribute("orient", "auto-start-reverse");
      marker.setAttribute("markerUnits", "userSpaceOnUse");
      const arrowPath = document.createElementNS(svgNS, "path");
      arrowPath.setAttribute("d", "M 0 1 L 10 5 L 0 9 z");
      arrowPath.setAttribute("fill", `rgb(${cfg.color})`);
      marker.appendChild(arrowPath);
      defs.appendChild(marker);
    });

    quadrantKeys.forEach(qKey => {
      const cfg = themeConfig[qKey];
      if (!cfg) return;
      const markerId = `thread-arrow-${qKey}`;
      const marker = document.createElementNS(svgNS, "marker");
      marker.setAttribute("id", markerId);
      marker.setAttribute("viewBox", "0 0 10 10");
      marker.setAttribute("refX", "10");
      marker.setAttribute("refY", "5");
      marker.setAttribute("markerWidth", "4");
      marker.setAttribute("markerHeight", "4");
      marker.setAttribute("orient", "auto-start-reverse");
      marker.setAttribute("markerUnits", "userSpaceOnUse");
      const arrowPath = document.createElementNS(svgNS, "path");
      arrowPath.setAttribute("d", "M 0 1 L 10 5 L 0 9 z");
      arrowPath.setAttribute("fill", `rgb(${cfg.color})`);
      marker.appendChild(arrowPath);
      defs.appendChild(marker);
    });

    const _centerVirtual = {
      targetX: 0, targetY: 0,
      _newX: 0,   _newY: 0,
      r: centerSize / 2,
      _hidden: false,
    };

    overlayThemes.forEach(theme => {
      const cfg = threadConfig[theme];
      if (!cfg) return;

      quadrantKeys.forEach(quadrant => {
        const threadNodes = _nodes.filter(n => n.theme === theme && n.quadrant === quadrant);
        if (threadNodes.length < 1) return;

        threadNodes.sort((a, b) => a.endMonth - b.endMonth);

        const nodesWithCenter = [_centerVirtual, ...threadNodes];

        const segments = [];
        for (let i = 1; i < nodesWithCenter.length; i++) {
          const fromNode = nodesWithCenter[i - 1];
          const toNode   = nodesWithCenter[i];

          let fromX = fromNode.targetX;
          let fromY = fromNode.targetY;
          let toX   = toNode.targetX;
          let toY   = toNode.targetY;

          const dx  = toX - fromX;
          const dy  = toY - fromY;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 0) {
            const ux = dx / len, uy = dy / len;
            const fromR = fromNode.r || 30;
            const toR   = toNode.r || 30;
            if (len > fromR + toR) {
              fromX += ux * fromR;
              fromY += uy * fromR;
              toX   -= ux * toR;
              toY   -= uy * toR;
            }
          }

          const cp = _bezierCtrl(fromX, fromY, toX, toY, i);

          const path = document.createElementNS(svgNS, "path");
          path.setAttribute("d", _curveD(fromX, fromY, cp.x, cp.y, toX, toY));
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", `rgb(${cfg.color})`);
          path.setAttribute("stroke-width", "1");
          path.setAttribute("stroke-linecap", "round");
          path.setAttribute("filter", "url(#thread-glow)");
          path.setAttribute("marker-end", `url(#thread-arrow-${theme})`);
          path.classList.add("kg-thread");
          path.style.opacity = "0";
          path.dataset.theme    = theme;
          path.dataset.quadrant = quadrant;

          path._cx1 = fromX; path._cy1 = fromY;
          path._ccx = cp.x;  path._ccy = cp.y;
          path._cx2 = toX;   path._cy2 = toY;
          _edgeSVG.appendChild(path);
          segments.push(path);
        }

        _threads.push({
          theme,
          quadrant,
          segments,
          nodes: nodesWithCenter,
        });
      });
    });

    const viewport = graphModal.querySelector(".viz-viewport");
    if (viewport) {
      requestAnimationFrame(() => {
        const vw = viewport.clientWidth;
        const vh = viewport.clientHeight;
        _transform.x = vw / 2;
        _transform.y = vh / 2;
        _transform.scale = 1.4;
        updateTransform();
      });
    }

    _initPanZoom();
    _createExploreHint();
    graphBuilt = true;
  }

  /* fitTextToCircle & _graphBreakText are now top-level (shared) */

  /** Build a single node DOM element */
  function buildNodeElement(it) {
    const { item, category, theme, quadrant } = it;
    const cfg = category === "games" ? themeConfig.games : theme === "education" ? themeConfig.education : theme === "work" ? themeConfig.work : theme === "projects" ? themeConfig.projects : (themeConfig[quadrant] || themeConfig.software);
    const themeCfg = themeConfig[theme] || themeConfig.software;
    const size = it.size || 60;

    const el = document.createElement("div");
    el.className = "kg-node";
    el.dataset.theme = theme;
    el.dataset.quadrant = quadrant;
    el.style.setProperty("--tc", cfg.color);
    el.style.setProperty("--kg-size", size + "px");
    const fontScale = Math.max(0.75, size / 80);
    el.style.setProperty("--kg-font", Math.round(8 * fontScale) + "px");
    el.style.setProperty("--kg-whisper", Math.round(7 * fontScale) + "px");

    const rawName = (item.NAME || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
    const emojiRe = /^([\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]+(?:\s*[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]+)*)\s*/u;
    const emojiMatch = rawName.match(emojiRe);
    const emojiPrefix = emojiMatch ? emojiMatch[1] : "";
    const textPart = emojiMatch ? rawName.slice(emojiMatch[0].length) : rawName;

    const graphName = VIZ_SHORTNAME_MAP[item.ID] || _graphBreakText(textPart);
    const wEmoji = VIZ_WHISPER_MAP[item.ID];
    const whispers = wEmoji ? [wEmoji] : [];

    el.innerHTML =
      `<div class="kg-node-accent" style="background:radial-gradient(circle at 30% 30%, rgba(${cfg.color},0.15) 0%, transparent 70%);"></div>` +
      `<div class="kg-node-name">` +
        `<span class="kg-name-layer">${graphName}</span>` +
        `<span class="kg-name-layer kg-name-whisper kg-name-show">${whispers[0] || graphName}</span>` +
        `<span class="kg-name-layer kg-name-whisper"></span>` +
      `</div>`;

    el.addEventListener("click", e => {
      e.stopPropagation();
      openModal(category, item.ID);
    });

    const baseFont = Math.round(8 * fontScale);
    const nameLayer = el.querySelector(".kg-name-layer:not(.kg-name-whisper)");
    const whisperLayers = el.querySelectorAll(".kg-name-whisper");
    requestAnimationFrame(() => {
      fitTextToCircle(nameLayer, size, size * 0.50);
      whisperLayers.forEach(wl => fitTextToCircle(wl, size, size * 0.50));
    });

    return el;
  }

  /* ── Entrance animation ───────────────────────────────────── */
  function animateEntrance() {
    _nodes.forEach(n => {
      n.el.style.left = "0px";
      n.el.style.top = "0px";
      n.el.style.opacity = "0";
      n.el.style.transform = "translate(-50%, -50%) scale(0.3)";
    });

    _threads.forEach(th => {
      th.segments.forEach(seg => {
        seg.style.opacity = "0";
      });
    });

    const maxDist = Math.max(1, ..._nodes.map(n => n.dist || 100));
    const MAX_DELAY = 600;

    _nodes.forEach((n, i) => {
      const distFrac = (n.dist || 100) / maxDist;
      const delay = distFrac * MAX_DELAY + i * 8;
      setTimeout(() => {
        n.el.style.transition = "left 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)";
        n.el.style.left = n.targetX + "px";
        n.el.style.top = n.targetY + "px";
        n.el.style.opacity = "";
        n.el.style.transform = "translate(-50%, -50%) scale(1)";

        setTimeout(() => {
          n.el.style.transition = "";
        }, 700);
      }, delay);
    });

    const viewport = graphModal.querySelector(".viz-viewport");
    if (viewport) {
      requestAnimationFrame(() => {
        const vw = viewport.clientWidth;
        const vh = viewport.clientHeight;
        _transform.x = vw / 2;
        _transform.y = vh / 2;
        _transform.scale = 1.4;
        updateTransform();
      });
    }

    const fadeDur = 500;
    const fadeStart = performance.now() + 250;
    function fadeThreads(now) {
      let t = (now - fadeStart) / fadeDur;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      const opacity = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      _threads.forEach(th => {
        th.segments.forEach(seg => {
          if (!seg.classList.contains("kg-thread-hidden")) {
            seg.style.opacity = String(opacity);
          }
        });
      });
      if (t < 1) requestAnimationFrame(fadeThreads);
    }
    requestAnimationFrame(fadeThreads);
    const threadSettleTime = MAX_DELAY + _nodes.length * 8 + 600;
    setTimeout(() => updateProximityGlow(), threadSettleTime);
  }

  /* ── Camera fit ───────────────────────────────────────────── */
  let _cameraHandle = null;

  function fitVisibleNodes(animate) {
    const viewport = graphModal.querySelector(".viz-viewport");
    if (!viewport || _nodes.length === 0) return;
    const visible = _nodes.filter(n => !n._hidden);
    if (visible.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    visible.forEach(n => {
      const r = n.r || 30;
      if (n.targetX - r < minX) minX = n.targetX - r;
      if (n.targetX + r > maxX) maxX = n.targetX + r;
      if (n.targetY - r < minY) minY = n.targetY - r;
      if (n.targetY + r > maxY) maxY = n.targetY + r;
    });
    const cR = 45;
    if (-cR < minX) minX = -cR;
    if (cR > maxX)  maxX = cR;
    if (-cR < minY) minY = -cR;
    if (cR > maxY)  maxY = cR;

    if (_cameraHandle) { _cameraHandle.cancel(); _cameraHandle = null; }

    _cameraHandle = animateCameraFit(_transform, function () {
      updateTransform();
    }, {
      vpWidth:  viewport.clientWidth,
      vpHeight: viewport.clientHeight,
      bounds:   { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      minScale: _KG_MIN_SCALE,
      maxScale: _KG_MAX_SCALE,
      padding:  50,
      duration: animate !== false ? 500 : 0,
      animate:  animate !== false,
    });
  }

  /* ── Tour (via shared createTourEngine) ─────────────────── */
  let _tourShowNames = false;

  const TOUR_DEFAULT = '<strong>Traverse</strong><span class="scroll-arrow">\uD83D\uDD2D</span>';

  const TOUR_STEPS = [
    { filters: ["software", "education"],  label: "💻🎓" },
    { filters: ["software", "work"],       label: "💻💼" },
    { filters: ["software", "projects"],   label: "💻🚀" },
    { filters: ["robotics", "education"],  label: "🤖🎓" },
    { filters: ["robotics", "work"],       label: "🤖💼" },
    { filters: ["robotics", "projects"],   label: "🤖🚀" },
    { filters: ["games", "education"],     label: "🎮🎓" },
    { filters: ["games", "work"],          label: "🎮💼" },
    { filters: ["games", "projects"],      label: "🎮🚀" },
  ];

  var _kgTour = createTourEngine({
    modal:     graphModal,
    viewport:  graphModal.querySelector(".viz-viewport"),
    hintLabel: TOUR_DEFAULT,
    steps:     TOUR_STEPS,
    applyStep: function (step) {
      allThemes.forEach(function (t) { activeFilters.delete(t); });
      step.filters.forEach(function (f) { activeFilters.add(f); });
      _filterSys.syncUI();
      applyFilter();
    },
    resetAll: function () {
      allThemes.forEach(function (t) { activeFilters.add(t); });
      _filterSys.syncUI();
      applyFilter();
    },
    fitCamera: function () { fitVisibleNodes(true); },
    setShowNames: function (show) {
      _tourShowNames = show;
      var vp = graphModal.querySelector(".viz-viewport");
      if (vp) vp.classList.toggle("kg-tour-show-names", !!show);
      updateProximityGlow();
    },
    updateGlow: function () { updateProximityGlow(); },
    glowPills: function () {
      graphModal.querySelectorAll(".viz-filter-glow").forEach(function (el) {
        el.classList.remove("viz-filter-glow");
      });
      activeFilters.forEach(function (f) {
        var pill = graphModal.querySelector('.viz-filter[data-filter="' + f + '"]');
        if (pill) {
          void pill.offsetWidth;
          pill.classList.add("viz-filter-glow");
        }
      });
    },
    clearPillGlow: function () {
      graphModal.querySelectorAll(".viz-filter-glow").forEach(function (el) { el.classList.remove("viz-filter-glow"); });
    },
  });

  function _createExploreHint() {
    _kgTour.createHint();
  }

  const _origClose = closeKnowledgeModal;
  window.closeKnowledgeModal = function () {
    if (_kgTour.isTouring()) _kgTour.stop();
    _origClose();
  };

  themeBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (_kgTour.isTouring()) _kgTour.stop();
    });
  });
  if (allBtn) {
    allBtn.addEventListener("click", function () {
      if (_kgTour.isTouring()) _kgTour.stop();
    });
  }
})();


// ═══════════════════════════════════════════════════════════════
//  MTG CARD TREE — Consumer of createSkillTree()
//
//  Cards organised into N "drants" (one per card type), each
//  fanning outward from a type-hub at an evenly-spaced angle.
//  Sized by CMC, filtered by card type & mana color.
//  Click a node → card-view modal overlay with full art.
// ═══════════════════════════════════════════════════════════════
(() => {
  const modal    = document.getElementById("mtg-tree-modal");
  const closeBtn = document.getElementById("mtgTreeModalClose");
  if (!modal || !closeBtn) return;

  /* ── Mana-color config (emoji-keyed) ─────────────────── */
  const MTG_COLORS = {
    "⚪": { rgb: "240,220,160", icon: "☀️" },
    "⚫": { rgb: "130,110,170", icon: "💀" },
    "🔴": { rgb: "210,80,60",   icon: "🔥" },
    "💎": { rgb: "160,160,170", icon: "◆"  },
  };
  const ALL_COLORS = Object.keys(MTG_COLORS);

  /* ── Type config (emoji-keyed) ──────────────────────────── */
  const TYPE_ICONS = {
    "🧛": "🧛", "✨": "✨", "🌩️": "🌩️",
    "⚡": "⚡", "🔮": "🔮", "⛈️":  "⛈️",
  };
  const TYPE_COLORS = {
    "🧛": "100,180,100", "✨": "160,160,180", "🌩️": "180,130,220",
    "⚡": "80,160,220",  "🔮": "200,100,100", "⛈️":  "140,120,90",
  };
  const ALL_TYPES = Object.keys(TYPE_COLORS);

  /* ── Drant directions — one per type, evenly around circle ─ */
  const DRANT_DIR = {};
  ALL_TYPES.forEach(function (type, i) {
    var angle = (2 * Math.PI * i / ALL_TYPES.length) - Math.PI / 2;
    DRANT_DIR[type] = {
      angle: angle,
      x: Math.cos(angle),
      y: Math.sin(angle),
      color: TYPE_COLORS[type] || "160,160,170",
      icon:  TYPE_ICONS[type]  || "?",
    };
  });

  /* ── Deck config (commander hubs at center) ─────────────── */
  const DECK_CFG = {
    "the-nobles": { label: "The Nobles", icon: "👑", angle: -Math.PI / 2, color: "240,200,80"  },
    "the-demons": { label: "The Demons", icon: "😈", angle:  Math.PI / 2, color: "180,60,60"   },
  };
  const ALL_DECKS = Object.keys(DECK_CFG);

  /* ── Color-emoji splitter (colors can be multi-emoji) ──── */
  var _COLOR_EMOJIS = Object.keys(MTG_COLORS);
  // Sort longest-first so multi-codepoint emojis match first
  _COLOR_EMOJIS.sort(function (a, b) { return b.length - a.length; });

  function splitColorEmojis(str) {
    var result = [];
    var rem = str;
    while (rem.length) {
      var matched = false;
      for (var i = 0; i < _COLOR_EMOJIS.length; i++) {
        if (rem.indexOf(_COLOR_EMOJIS[i]) === 0) {
          result.push(_COLOR_EMOJIS[i]);
          rem = rem.slice(_COLOR_EMOJIS[i].length);
          matched = true;
          break;
        }
      }
      if (!matched) rem = rem.slice(1);
    }
    return result;
  }

  /**
   * Normalize a CARDS item (UPPERCASE keys, emoji values)
   * into the lowercase-key shape the rest of the code expects.
   * TYPE is always a single emoji. COLOR may be multi-emoji.
   */
  function normalizeCard(item) {
    var id     = item.ID || "";
    var type   = item.TYPE  || "🧛";
    var colors = splitColorEmojis(item.COLOR || "💎");
    if (colors.length === 0) colors = ["💎"];

    var card = {
      cardName:  item.NAME     || "",
      whisper:   item.WHISPER  || "",
      category:  item.CATEGORY || "",
      salt:      item.SALT     || 0,
      color:     colors.length === 1 ? colors[0] : colors,
      cmc:       item.CMC      || 0,
      rarity:    item.RARITY   || "",
      types:     type,
      price:     item.PRICE    || 0,
      art:       "png/card_art/" + id + "/art.png",
    };
    if (item.SECONDARY_CATEGORIES) {
      card.secondaryCategories = item.SECONDARY_CATEGORIES;
    }
    return card;
  }

  /* ── Helpers ────────────────────────────────────────────── */
  function cmcToRGB(cmc) {
    var c = cmc || 0;
    if (c <= 1) return "0,120,212";    // MSFT Blue
    if (c <= 3) return "127,186,0";    // MSFT Green
    if (c <= 5) return "255,185,0";    // MSFT Yellow
    return "242,80,34";                // MSFT Red
  }

  function saltToSize(salt) {
    var MIN = 30, MAX = 80;
    var s = Math.max(0, Math.min(3, salt || 0));
    return MIN + (s / 3) * (MAX - MIN);
  }

  /* ── Card-view modal (overlay on top of skill tree) ───── */
  var cardModal    = document.getElementById("mtg-card-modal");
  var cardModalImg = document.getElementById("mtg-card-view-art");
  var cardBadges   = document.getElementById("mtg-card-badges");
  var cardModalClose = document.getElementById("mtgCardModalClose");

  if (cardModalClose) {
    cardModalClose.addEventListener("click", function () {
      toggleModal(cardModal, false);
    });
  }
  if (cardModal) {
    cardModal.addEventListener("click", function (e) {
      if (e.target === cardModal) toggleModal(cardModal, false);
    });
    // Escape closes card modal without also closing the skill tree
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && cardModal.classList.contains("open")) {
        e.stopImmediatePropagation();
        toggleModal(cardModal, false);
      }
    });
  }

  function openCardModal(card) {
    if (!cardModal) return;

    var badges = "";

    // Type badge (color-coded to match skill tree)
    var t   = card.types || "🧛";
    var rgb = TYPE_COLORS[t] || "160,160,170";
    badges += '<span class="mtg-badge" style="--bc:' + rgb + '">' + t + '</span>';

    // Mana color badges (color-coded to match skill tree)
    var colors = Array.isArray(card.color) ? card.color : [card.color || "💎"];
    colors.forEach(function (c) {
      var entry = MTG_COLORS[c];
      if (!entry) return;
      badges += '<span class="mtg-badge" style="--bc:' + entry.rgb + '">' + entry.icon + '</span>';
    });

    // Salt tier badge
    var salt = card.salt || 0;
    var saltIcon, saltTitle, saltRGB;
    if (salt < 0.15)      { saltIcon = "🧊"; saltTitle = "Zero salt";  saltRGB = "120,180,220"; }
    else if (salt < 0.40) { saltIcon = "🌿"; saltTitle = "Mild";       saltRGB = "100,180,100"; }
    else if (salt < 0.80) { saltIcon = "🌶️"; saltTitle = "Spicy";      saltRGB = "220,140,40";  }
    else if (salt < 1.20) { saltIcon = "🔥"; saltTitle = "Hot";        saltRGB = "220,80,40";   }
    else                  { saltIcon = "☠️"; saltTitle = "Toxic";      saltRGB = "180,50,180";  }
    badges += '<span class="mtg-badge" style="--bc:' + saltRGB + '" title="Salt ' + salt.toFixed(2) + ' — ' + saltTitle + '">' + saltIcon + '</span>';

    // Price tier badge
    var price = card.price || 0;
    var priceIcon, priceTitle, priceRGB;
    if (price < 1)        { priceIcon = "🪙"; priceTitle = "Penny";   priceRGB = "140,120,80";  }
    else if (price < 5)   { priceIcon = "💵"; priceTitle = "Budget";  priceRGB = "80,160,80";   }
    else if (price < 15)  { priceIcon = "💰"; priceTitle = "Mid";     priceRGB = "200,170,50";  }
    else if (price < 50)  { priceIcon = "💎"; priceTitle = "Premium"; priceRGB = "80,160,220";  }
    else if (price < 100) { priceIcon = "👑"; priceTitle = "Baller";  priceRGB = "220,180,50";  }
    else                  { priceIcon = "🏦"; priceTitle = "Vault";   priceRGB = "180,140,220"; }
    badges += '<span class="mtg-badge" style="--bc:' + priceRGB + '" title="$' + price.toFixed(2) + ' — ' + priceTitle + '">' + priceIcon + '</span>';

    cardBadges.innerHTML = badges;

    // Full card art
    cardModalImg.src = card.art || "";
    cardModalImg.alt = card.cardName || "";
    cardModalImg.style.display = card.art ? "" : "none";

    toggleModal(cardModal, true);
  }

  function closeCardModal() {
    if (cardModal) toggleModal(cardModal, false);
  }

  /* ── Data fetch ─────────────────────────────────────────── */
  var _cardsData = null;

  function ensureData(cb) {
    if (_cardsData) { cb(_cardsData); return; }
    fetch("CARDS.json")
      .then(function (r) { return r.json(); })
      .then(function (raw) {
        // Normalize CARDS uppercase-emoji format → lowercase-string format
        var data = { sections: [] };
        raw.sections.forEach(function (sec) {
          data.sections.push({
            id:    sec.id,
            count: sec.count,
            items: sec.items.map(normalizeCard),
          });
        });
        _cardsData = data;
        cb(data);
      })
      .catch(function (err) { console.error("[mtg-tree] fetch error", err); });
  }

  /* ── Filter axes (wired to HTML buttons) ────────────────── */
  var typeBtns   = modal.querySelectorAll(".mtg-filter[data-type]");
  var colorBtns  = modal.querySelectorAll(".mtg-filter[data-color]");
  var deckBtns   = modal.querySelectorAll(".mtg-filter[data-deck]");
  var typeAllBtn  = modal.querySelector('.mtg-filter[data-type="all"]');
  var colorAllBtn = modal.querySelector('.mtg-filter[data-color="all"]');
  var deckAllBtn  = modal.querySelector('.mtg-filter[data-deck="all"]');

  var filterAxes = [
    {
      key: "type",
      allValues: ALL_TYPES,
      allBtn: typeAllBtn,
      itemBtns: Array.from(typeBtns).filter(b => b.dataset.type !== "all"),
    },
    {
      key: "color",
      allValues: ALL_COLORS,
      allBtn: colorAllBtn,
      itemBtns: Array.from(colorBtns).filter(b => b.dataset.color !== "all"),
    },
    {
      key: "deck",
      allValues: ALL_DECKS,
      allBtn: deckAllBtn,
      itemBtns: Array.from(deckBtns).filter(b => b.dataset.deck !== "all"),
    },
  ];

  /* ── Layout toggle (static/dynamic) ─────────────────────── */
  var _mtgLayoutToggle = createLayoutToggle({
    btn: "mtgLayoutToggle",
    onDynamic: function () { if (_tree) relayoutMtg(); },
  });

  function relayoutMtg() {
    if (!_tree) return;
    var nodes = _tree.getNodes();
    var visible = nodes.filter(function (n) { return !n._hidden; });
    if (visible.length === 0) return;

    // Group visible nodes by drant (card type)
    var drants = {};
    ALL_TYPES.forEach(function (t) { drants[t] = []; });
    visible.forEach(function (n) {
      if (n.drant && drants[n.drant]) drants[n.drant].push(n);
    });

    var MIN_DIST   = 55;
    var MAX_DIST   = 400;
    var SPREAD     = 2 * Math.PI / ALL_TYPES.length * 0.75;
    var CENTER_R   = 90;
    var PADDING    = 3;
    var ITERATIONS = 50;

    var movable = [];
    Object.keys(drants).forEach(function (type) {
      var group = drants[type];
      if (group.length === 0) return;
      var dir = DRANT_DIR[type];
      var baseAngle = dir.angle;

      // Sort by price descending for relayout
      group.sort(function (a, b) { return (b._price || 0) - (a._price || 0); });

      group.forEach(function (n, idx) {
        var price = n._price || 0;
        var norm = price > 0 ? Math.min(1, Math.pow(price / 550, 0.3)) : 0;
        var dist = MIN_DIST + (1 - norm) * (MAX_DIST - MIN_DIST);
        var angle;
        if (group.length === 1) {
          angle = baseAngle;
        } else {
          var frac = idx / (group.length - 1);
          angle = baseAngle + SPREAD * (frac - 0.5);
        }
        var seed1 = Math.sin(idx * 7.3 + baseAngle * 13.7);
        var seed2 = Math.sin(idx * 11.1 + baseAngle * 5.3);
        dist *= (1 + seed1 * 0.06);
        angle += seed2 * 0.06;

        n._newX = Math.cos(angle) * dist;
        n._newY = Math.sin(angle) * dist;
        movable.push(n);
      });
    });

    // Collision resolution
    for (var iter = 0; iter < ITERATIONS; iter++) {
      var anyMoved = false;
      for (var i = 0; i < movable.length; i++) {
        var a = movable[i];
        var dcx = a._newX, dcy = a._newY;
        var distC = Math.sqrt(dcx * dcx + dcy * dcy) || 0.01;
        var minDistC = a.r + CENTER_R + PADDING;
        if (distC < minDistC) {
          var push = (minDistC - distC) / distC;
          a._newX += dcx * push; a._newY += dcy * push;
          anyMoved = true;
        }
        for (var j = i + 1; j < movable.length; j++) {
          var b = movable[j];
          var dx = b._newX - a._newX, dy = b._newY - a._newY;
          var d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          var minD = a.r + b.r + PADDING;
          if (d < minD) {
            var ov = (minD - d) / 2;
            var nx = dx / d, ny = dy / d;
            a._newX -= nx * ov; a._newY -= ny * ov;
            b._newX += nx * ov; b._newY += ny * ov;
            anyMoved = true;
          }
        }
      }
      if (!anyMoved) break;
    }

    movable.forEach(function (n) {
      n.targetX = n._newX;
      n.targetY = n._newY;
    });

    _tree.animateToPositions(600);
  }

  /* ── Create the tree instance ───────────────────────────── */
  var _tree = null;

  function buildMtgNodes(graphWorld, svgNS, helpers) {
    var nodes = [], hubs = [], centerVirts = [];

    var data = _cardsData;
    if (!data || !data.sections) return { nodes: nodes, hubs: hubs, centerVirts: centerVirts };

    /* ── Build deck hubs (commanders at center) ───────────── */
    var hubSize = 180;
    var hubGap  = 75;
    var hubRefs = {};

    var commanderCards = {};  // deckId → commander card data

    data.sections.forEach(function (section) {
      var deckId = section.id;
      var dcfg   = DECK_CFG[deckId];
      if (!dcfg) return;

      // Find commander card for this deck
      var cmdr = null;
      (section.items || []).forEach(function (card) {
        if (card.category === "Commander") cmdr = card;
      });
      if (cmdr) commanderCards[deckId] = cmdr;

      var hubX = Math.cos(dcfg.angle) * hubGap;
      var hubY = Math.sin(dcfg.angle) * hubGap;

      var hubEl = document.createElement("div");
      hubEl.className = "kg-node mtg-deck-hub";
      hubEl.style.setProperty("--kg-size", hubSize + "px");
      hubEl.style.setProperty("--tc", dcfg.color);
      hubEl.style.left = hubX + "px";
      hubEl.style.top  = hubY + "px";
      hubEl.innerHTML = '<div class="kg-node-icon">' + dcfg.icon + '</div>' +
        '<div class="kg-node-name"><span class="kg-name-layer kg-name-show" style="font-size:9px">' + dcfg.label + '</span></div>';

      // Click hub → open commander card modal
      if (cmdr) {
        hubEl.style.cursor = "pointer";
        hubEl.addEventListener("click", function (e) {
          e.stopPropagation();
          openCardModal(cmdr);
        });
      }

      graphWorld.appendChild(hubEl);

      var hubRef = { el: hubEl, targetX: hubX, targetY: hubY, r: hubSize / 2, _hidden: false, _fixed: true, _deckId: deckId, children: [] };
      hubs.push(hubRef);
      hubRefs[deckId] = hubRef;
    });

    /* ── Deduplicate cards & track deck membership ─────────── */
    var cardMap = {};  // cardName → { card, decks: Set }
    data.sections.forEach(function (section) {
      var deckId = section.id;
      (section.items || []).forEach(function (card) {
        if (card.category === "Commander") return;  // commanders live on hub nodes
        var key = card.cardName;
        if (!cardMap[key]) cardMap[key] = { card: card, decks: new Set() };
        cardMap[key].decks.add(deckId);
      });
    });

    /* ── Group cards by type (drant) for spatial layout ────── */
    var drants = {};
    ALL_TYPES.forEach(function (t) { drants[t] = []; });
    Object.keys(cardMap).forEach(function (k) {
      var entry = cardMap[k];
      var type = entry.card.types || "🧛";
      if (!drants[type]) drants[type] = [];
      entry._primaryType = type;            // cache for node creation
      drants[type].push(entry);
    });

    /* ── Layout constants ─────────────────────────────────── */
    var MIN_DIST = 55;
    var MAX_DIST = 400;
    var SPREAD   = 2 * Math.PI / ALL_TYPES.length * 0.75;

    /* ── Helper: create a card node ───────────────────────── */
    function makeCardNode(card, cx, cy, deckIds) {
      var size = saltToSize(card.salt);
      var rgb  = cmcToRGB(card.cmc);

      var el = document.createElement("div");
      el.className = "kg-node";
      el.style.setProperty("--kg-size", size + "px");
      el.style.setProperty("--tc", rgb);
      el.style.left = cx + "px";
      el.style.top  = cy + "px";

      // First grapheme of cardName is the main emoji → use as whisper
      var nameChars = Array.from(card.cardName);
      var firstChar = nameChars[0] || "";
      var restName  = nameChars.slice(1).join("").trim();
      var displayName = restName.replace(/\s+/g, "<br>") || card.cardName.replace(/\s+/g, "<br>");
      var whisperEmoji = firstChar;
      var hoverEmoji = whisperEmoji || card.types || "";

      var whisperContent = hoverEmoji || displayName;

      el.innerHTML =
        '<div class="kg-node-accent" style="background:radial-gradient(circle at 30% 30%, rgba(' + rgb + ',0.2) 0%, transparent 70%);"></div>' +
        '<div class="kg-node-name">' +
          '<span class="kg-name-layer">' + displayName + '</span>' +
          '<span class="kg-name-layer kg-name-whisper kg-name-show">' + whisperContent + '</span>' +
          '<span class="kg-name-layer kg-name-whisper"></span>' +
        '</div>';

      el.addEventListener("click", function (e) {
        e.stopPropagation();
        openCardModal(card);
      });

      graphWorld.appendChild(el);

      var nameLayer = el.querySelector(".kg-name-layer:not(.kg-name-whisper)");
      var whisperLayers = el.querySelectorAll(".kg-name-whisper");
      requestAnimationFrame(function () {
        fitTextToCircle(nameLayer, size, size * 0.45);
        whisperLayers.forEach(function (wl) { fitTextToCircle(wl, size, size * 0.45); });
      });

      var typeArr = [card.types || "🧛"];
      var colorArr = Array.isArray(card.color) ? card.color : [card.color || "💎"];
      var nodeRef = {
        el: el,
        targetX: cx,
        targetY: cy,
        r: size / 2,
        _hidden: false,
        _cmc: card.cmc || 0,
        _salt: card.salt || 0,
        _price: card.price || 0,
        drant: typeArr[0],
        filterKeys: {
          type:  new Set(typeArr),
          color: new Set(colorArr),
          deck:  new Set(deckIds),
        },
      };

      helpers.registerHover(el, nodeRef);
      return nodeRef;
    }

    /* ── Place cards in drant fans, edges to deck hubs ─────── */
    ALL_TYPES.forEach(function (type) {
      var group = drants[type];
      if (!group || group.length === 0) return;
      var dir = DRANT_DIR[type];
      var baseAngle = dir.angle;

      group.sort(function (a, b) {
        return (b.card.price || 0) - (a.card.price || 0);  // most expensive first (closest)
      });

      group.forEach(function (entry, idx) {
        var card = entry.card;
        // Distance from center: expensive cards close, cheap cards far
        var price = card.price || 0;
        // pow(0.3) compresses range — bunches cards closer to center
        var norm = price > 0 ? Math.min(1, Math.pow(price / 550, 0.3)) : 0;
        // Invert: high price → small dist (close to center)
        var dist = MIN_DIST + (1 - norm) * (MAX_DIST - MIN_DIST);
        var angle;
        if (group.length === 1) {
          angle = baseAngle;
        } else {
          var frac = idx / (group.length - 1);
          angle = baseAngle + SPREAD * (frac - 0.5);
        }

        var seed1 = Math.sin(idx * 7.3 + baseAngle * 13.7);
        var seed2 = Math.sin(idx * 11.1 + baseAngle * 5.3);
        dist *= (1 + seed1 * 0.06);
        angle += seed2 * 0.06;

        var cx = Math.cos(angle) * dist;
        var cy = Math.sin(angle) * dist;

        var nodeRef = makeCardNode(card, cx, cy, entry.decks);
        var edgeRGB = cmcToRGB(card.cmc);

        // Edge to each deck hub this card belongs to
        entry.decks.forEach(function (deckId) {
          var hub = hubRefs[deckId];
          if (hub) {
            helpers.addEdge(hub, nodeRef, edgeRGB, 0.7);
            hub.children.push(nodeRef);
          }
        });

        nodes.push(nodeRef);
      });
    });

    return { nodes: nodes, hubs: hubs, centerVirts: centerVirts };
  }

  /* ── Camera fit for MTG ──────────────────────────────────── */
  var _mtgCameraHandle = null;

  function fitMtgVisibleNodes(animate) {
    if (!_tree) return;
    var viewport = modal.querySelector(".viz-viewport");
    if (!viewport) return;
    var nodes = _tree.getNodes();
    var hubs  = _tree.getHubs();
    var visible = nodes.filter(function (n) { return !n._hidden; });
    if (visible.length === 0) return;

    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    visible.forEach(function (n) {
      var r = n.r || 30;
      if (n.targetX - r < minX) minX = n.targetX - r;
      if (n.targetX + r > maxX) maxX = n.targetX + r;
      if (n.targetY - r < minY) minY = n.targetY - r;
      if (n.targetY + r > maxY) maxY = n.targetY + r;
    });

    if (_mtgCameraHandle) { _mtgCameraHandle.cancel(); _mtgCameraHandle = null; }

    var transform = _tree.getTransform();
    _mtgCameraHandle = animateCameraFit(transform, function () {
      _tree.updateTransform();
    }, {
      vpWidth:  viewport.clientWidth,
      vpHeight: viewport.clientHeight,
      bounds:   { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      minScale: 0.3,
      maxScale: 4,
      padding:  50,
      duration: animate !== false ? 500 : 0,
      animate:  animate !== false,
    });
  }

  /* ── Tour (via shared createTourEngine) ────────────────── */
  var _mtgTour = null;   // created lazily after _tree exists

  var MTG_TOUR_LABEL = '<strong>Traverse</strong><span class="scroll-arrow">\uD83D\uDD2D</span>';

  var MTG_TOUR_STEPS = [
    { label: "👑",   filters: { deck: ["the-nobles"],                type: null,              color: null } },
    { label: "😈",   filters: { deck: ["the-demons"],                type: null,              color: null } },
    { label: "⛈️",   filters: { deck: null,                          type: ["⛈️"],            color: null } },
    { label: "🧛",   filters: { deck: null,                          type: ["🧛"],            color: null } },
    { label: "✨",   filters: { deck: null,                          type: ["✨"],            color: null } },
    { label: "🌩️",   filters: { deck: null,                          type: ["🌩️"],            color: null } },
    { label: "⚡",   filters: { deck: null,                          type: ["⚡"],            color: null } },
    { label: "🔮",   filters: { deck: null,                          type: ["🔮"],            color: null } },
  ];

  function _createMtgTour() {
    _mtgTour = createTourEngine({
      modal:     modal,
      viewport:  modal.querySelector(".viz-viewport"),
      hintLabel: MTG_TOUR_LABEL,
      steps:     MTG_TOUR_STEPS,
      stepDelay: 2000,
      applyStep: function (step, idx) {
        if (!_tree) return;
        var fs = _tree.getFilterSets();
        // For each axis: if step specifies values use them, else set to all
        ["type", "color", "deck"].forEach(function (axis) {
          var vals = step.filters[axis];
          var allVals = axis === "type" ? ALL_TYPES : axis === "color" ? ALL_COLORS : ALL_DECKS;
          fs[axis].clear();
          if (vals) {
            vals.forEach(function (v) { fs[axis].add(v); });
          } else {
            allVals.forEach(function (v) { fs[axis].add(v); });
          }
        });
        _tree.syncFilterUI();
        _tree.applyFilters();
      },
      resetAll: function () {
        if (!_tree) return;
        _tree.resetFilters();
      },
      fitCamera: function () { fitMtgVisibleNodes(true); },
      setShowNames: function (show) {
        var vp = modal.querySelector(".viz-viewport");
        if (vp) vp.classList.toggle("kg-tour-show-names", !!show);
        if (_tree) _tree.updateGlow();
      },
      updateGlow: function () { if (_tree) _tree.updateGlow(); },
      glowPills: function () {
        if (!_tree) return;
        var fs = _tree.getFilterSets();
        modal.querySelectorAll(".viz-filter-glow").forEach(function (el) {
          el.classList.remove("viz-filter-glow");
        });
        // Glow active filter buttons across all axes
        ["type", "color", "deck"].forEach(function (axis) {
          var allVals = axis === "type" ? ALL_TYPES : axis === "color" ? ALL_COLORS : ALL_DECKS;
          // Only glow if not all-active (i.e. axis is narrowed)
          if (fs[axis].size < allVals.length) {
            fs[axis].forEach(function (v) {
              var pill = modal.querySelector('.mtg-filter[data-' + axis + '="' + v + '"]');
              if (pill) {
                void pill.offsetWidth;
                pill.classList.add("viz-filter-glow");
              }
            });
          }
        });
      },
      clearPillGlow: function () {
        modal.querySelectorAll(".viz-filter-glow").forEach(function (el) { el.classList.remove("viz-filter-glow"); });
      },
    });

    _mtgTour.createHint();
  }

  function initMtgTree() {
    ensureData(function () {
      _tree = createSkillTree({
        modal:           modal,
        closeBtn:        closeBtn,
        edgeSvgSelector: ".mtg-edges",
        filterAxes:      filterAxes,
        buildNodes:      buildMtgNodes,
        isNodeVisible:   null,  // use default (multi-axis intersection)
        initialScale:    0.85,
        minScale:        0.3,
        maxScale:        4,
        collisionPadding: 3,
        collisionIters:   50,
        isTouring:       function () { return _mtgTour && _mtgTour.isTouring(); },
        onClose:         function () {
          closeCardModal();
          if (_mtgTour && _mtgTour.isTouring()) _mtgTour.stop();
        },
        onFilterApplied: function () {
          if (!_mtgLayoutToggle.isStatic()) relayoutMtg();
          // Smooth-ease camera to fit visible nodes
          if (!_mtgTour || !_mtgTour.isTouring()) {
            var settleDelay = _mtgLayoutToggle.isStatic() ? 80 : 700;
            setTimeout(function () { fitMtgVisibleNodes(true); }, settleDelay);
          }
        },
      });

      _createMtgTour();
      _tree.open();
    });
  }

  /* ── Global opener (wired from badge onclick) ───────────── */
  window.openMtgTreeModal = function () {
    if (_tree) {
      if (_mtgTour && _mtgTour.isTouring()) _mtgTour.stop();
      _tree.open();
    } else {
      initMtgTree();
    }
  };

  /* ── Stop tour on manual filter interaction ─────────────── */
  modal.querySelectorAll(".mtg-filter").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (_mtgTour && _mtgTour.isTouring()) _mtgTour.stop();
    });
  });
})();
