// ═══════════════════════════════════════════════════════════════
//  SKILL TREE ENGINE — Reusable radial node-graph visualization
//
//  A configurable factory that builds an interactive, pannable,
//  zoomable node tree inside a modal overlay.  Any dataset can
//  be rendered by providing a configuration object.
//
//  Usage:
//    const tree = createSkillTree({
//      modal, closeBtn, edgeSvgSelector,
//      filterAxes, buildNodes, onNodeClick,
//      minScale, maxScale, centerEmoji, centerSize, …
//    });
//    tree.open();
//
//  Depends on: viz.js (initPanZoom, animateCameraFit)
//              modals.js (toggleModal)
// ═══════════════════════════════════════════════════════════════

/**
 * createSkillTree(cfg) → controller
 *
 * @param {Object} cfg
 *   modal            – DOM element: the .modal-overlay
 *   closeBtn         – DOM element: the close button
 *   edgeSvgSelector  – CSS selector for the SVG edge layer (inside modal)
 *   centerEmoji      – string (default "⚔️")
 *   centerSize       – number in px (default 80)
 *
 *   filterAxes       – Array of { key, allBtn, itemBtns, allValues }
 *                      Each axis is an independent toggle-filter dimension.
 *                      `key` is used in node.filterKeys[key] to test membership.
 *                      `allBtn` / `itemBtns` are DOM elements for the toggle bar.
 *
 *   buildNodes       – fn(graphWorld, svgNS) → { nodes:[], hubs:[], threads:[] }
 *                      Called once to create all DOM nodes and edges.
 *                      Each node: { el, filterKeys:{axisKey→Set<string>}, targetX, targetY, r, data? }
 *                      Each hub:  { el, targetX, targetY, r, children?:[] }
 *                      Each thread: { el(SVGPath), from, to }
 *
 *   isNodeVisible    – fn(node, activeFilterSets:{key→Set}) → bool
 *                      Determine if a node passes all filter axes.
 *
 *   onNodeClick      – fn(node, el) → void   (optional — tooltip, modal, etc.)
 *
 *   minScale         – number (default 0.3)
 *   maxScale         – number (default 5)
 *   initialScale     – number (default 1.0)
 *
 *   collisionPadding – number px (default 2)
 *   collisionIters   – number (default 80)
 *
 * @returns {{ open, close }}
 */
function createSkillTree(cfg) {
  const modal    = cfg.modal;
  const closeBtn = cfg.closeBtn;
  if (!modal || !closeBtn) return null;

  /* ── State ──────────────────────────────────────────────── */
  let built      = false;
  let _nodes     = [];   // card-level nodes
  let _hubs      = [];   // intermediate hub nodes (deck, category, etc.)
  let _threads   = [];   // { el, from, to }
  let _transform = { x: 0, y: 0, scale: cfg.initialScale || 1 };
  let _graphWorld = null;
  let _edgeSVG    = null;
  let _pz         = null;
  let _hoveredNode = null;

  const MIN_SCALE = cfg.minScale || 0.3;
  const MAX_SCALE = cfg.maxScale || 5;

  /* ── Filter state: one Set per axis ────────────────────── */
  const _filterSets = {};  // { axisKey → Set<string> }
  const _axes = cfg.filterAxes || [];
  _axes.forEach(ax => {
    _filterSets[ax.key] = new Set(ax.allValues);
  });

  /* ── Open / close ──────────────────────────────────────── */
  function open() {
    toggleModal(modal, true);
    if (!built) {
      _build();
    } else {
      _updateTransform();
      requestAnimationFrame(() => _animateEntrance());
    }
  }

  function close() {
    if (cfg.onClose) cfg.onClose();
    toggleModal(modal, false);
  }

  closeBtn.addEventListener("click", close);
  modal.addEventListener("click", e => { if (e.target === modal) close(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && modal.classList.contains("open")) close();
  });

  /* ── Filter wiring ─────────────────────────────────────── */
  _axes.forEach(ax => {
    const active = _filterSets[ax.key];
    const all    = ax.allValues;

    function _toggle(key) {
      if (key === "all") {
        all.forEach(k => active.add(k));
      } else if (active.has(key) && active.size === 1) {
        all.forEach(k => active.add(k));
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
      ax.itemBtns.forEach(b => {
        const val = b.dataset[ax.key] || b.dataset.filter;
        if (val && val !== "all") b.classList.toggle("active", active.has(val));
      });
    }

    // Wire button clicks
    if (ax.allBtn) ax.allBtn.addEventListener("click", () => {
      _toggle("all"); syncAxisUI(); _applyFilters();
    });
    ax.itemBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const val = btn.dataset[ax.key] || btn.dataset.filter;
        _toggle(val); syncAxisUI(); _applyFilters();
      });
    });

    // Store syncUI for later
    ax._syncUI = syncAxisUI;
  });

  function _syncAllFilterUI() {
    _axes.forEach(ax => { if (ax._syncUI) ax._syncUI(); });
  }

  /* ── Apply filters ─────────────────────────────────────── */
  function _applyFilters() {
    const isVisible = cfg.isNodeVisible || _defaultNodeVisible;
    _nodes.forEach(n => {
      const hide = !isVisible(n, _filterSets);
      n._hidden = hide;
      n.el.classList.toggle("kg-hidden", hide);
    });

    // Hubs: visible if any child visible
    _hubs.forEach(h => {
      if (!h.children || !h.children.length) return;
      const hasVis = h.children.some(c => !c._hidden);
      h._hidden = !hasVis;
      h.el.classList.toggle("kg-hidden", !hasVis);
    });

    // Threads
    _threads.forEach(th => {
      const vis = !th.from._hidden && !th.to._hidden;
      th.el.classList.toggle("kg-thread-hidden", !vis);
      th.el.style.opacity = vis ? "1" : "";
    });

    _updateGlow();
  }

  function _defaultNodeVisible(node, filterSets) {
    // Every axis must pass: node's value(s) for that axis must intersect active set
    for (const key in filterSets) {
      const active = filterSets[key];
      const vals = node.filterKeys && node.filterKeys[key];
      if (!vals) continue;
      const arr = vals instanceof Set ? [...vals] : (Array.isArray(vals) ? vals : [vals]);
      if (!arr.some(v => active.has(v))) return false;
    }
    return true;
  }

  /* ── Proximity glow ────────────────────────────────────── */
  let _glowRAF = 0;
  function _updateGlow() {
    cancelAnimationFrame(_glowRAF);
    _glowRAF = requestAnimationFrame(() => {
      const vp = modal.querySelector(".viz-viewport");
      if (!vp) return;
      const vw = vp.clientWidth, vh = vp.clientHeight;
      const m = 0.30;
      const left = vw * m, right = vw * (1 - m), top = vh * m, bottom = vh * (1 - m);

      [..._nodes, ..._hubs].forEach(n => {
        const sx = (n.targetX || 0) * _transform.scale + _transform.x;
        const sy = (n.targetY || 0) * _transform.scale + _transform.y;
        const inCenter = sx >= left && sx <= right && sy >= top && sy <= bottom;
        const hovered = n === _hoveredNode;
        const focused = (inCenter || hovered) && !n.el.classList.contains("kg-hidden");
        n.el.classList.toggle("kg-in-focus", focused);
      });
    });
  }

  /* ── Transform ─────────────────────────────────────────── */
  function _updateTransform() {
    if (!_graphWorld) return;
    if (_pz) { _pz.update(); return; }
    _graphWorld.style.transform = `translate(${_transform.x}px,${_transform.y}px) scale(${_transform.scale})`;
    _updateGlow();
  }

  /* ── Build ─────────────────────────────────────────────── */
  function _build() {
    _graphWorld = modal.querySelector(".viz-world");
    _edgeSVG    = modal.querySelector(cfg.edgeSvgSelector || ".kg-edges");
    if (!_graphWorld || !_edgeSVG) return;

    // Clear previous
    _graphWorld.querySelectorAll(".kg-node").forEach(n => n.remove());
    _edgeSVG.innerHTML = "";

    const svgNS = "http://www.w3.org/2000/svg";

    // SVG glow filter
    const defs = document.createElementNS(svgNS, "defs");
    const glow = document.createElementNS(svgNS, "filter");
    glow.setAttribute("id", "st-glow-" + modal.id);
    glow.setAttribute("x", "-50%"); glow.setAttribute("y", "-50%");
    glow.setAttribute("width", "200%"); glow.setAttribute("height", "200%");
    const blur = document.createElementNS(svgNS, "feGaussianBlur");
    blur.setAttribute("stdDeviation", "2"); blur.setAttribute("result", "blur");
    const merge = document.createElementNS(svgNS, "feMerge");
    const mn1 = document.createElementNS(svgNS, "feMergeNode"); mn1.setAttribute("in", "blur");
    const mn2 = document.createElementNS(svgNS, "feMergeNode"); mn2.setAttribute("in", "SourceGraphic");
    merge.appendChild(mn1); merge.appendChild(mn2);
    glow.appendChild(blur); glow.appendChild(merge);
    defs.appendChild(glow);
    _edgeSVG.appendChild(defs);
    const glowId = "st-glow-" + modal.id;

    // Let the consumer build all nodes, hubs, threads
    const result = cfg.buildNodes(_graphWorld, svgNS, {
      glowFilterId: glowId,
      addEdge: (from, to, color, width) => _addEdge(svgNS, glowId, from, to, color, width),
      registerHover: (el, nodeRef) => {
        el.addEventListener("mouseenter", () => { _hoveredNode = nodeRef; _updateGlow(); });
        el.addEventListener("mouseleave", () => { if (_hoveredNode === nodeRef) { _hoveredNode = null; _updateGlow(); } });
      },
    });

    _nodes   = result.nodes   || [];
    _hubs    = result.hubs    || [];
    _threads = result.threads || [];

    // ── Collision resolution ──────────────────────────────
    const PADDING = cfg.collisionPadding || 2;
    const ITERS   = cfg.collisionIters   || 80;
    const fixed   = _hubs.filter(h => h._fixed !== false);
    const centerVirts = result.centerVirts || [];
    const immovable = [...centerVirts, ...fixed];

    for (let iter = 0; iter < ITERS; iter++) {
      let moved = false;
      for (let i = 0; i < _nodes.length; i++) {
        const a = _nodes[i];
        // vs immovable
        for (let j = 0; j < immovable.length; j++) {
          const b = immovable[j];
          const dx = a.targetX - b.targetX, dy = a.targetY - b.targetY;
          const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const minD = a.r + b.r + PADDING;
          if (d < minD) {
            const p = (minD - d) / d;
            a.targetX += dx * p; a.targetY += dy * p;
            moved = true;
          }
        }
        // vs other nodes
        for (let j = i + 1; j < _nodes.length; j++) {
          const b = _nodes[j];
          const dx = b.targetX - a.targetX, dy = b.targetY - a.targetY;
          const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const minD = a.r + b.r + PADDING;
          if (d < minD) {
            const o = (minD - d) / 2;
            const nx = dx / d, ny = dy / d;
            a.targetX -= nx * o; a.targetY -= ny * o;
            b.targetX += nx * o; b.targetY += ny * o;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }

    // Finalize positions
    _nodes.forEach(n => {
      n.el.style.left = n.targetX + "px";
      n.el.style.top  = n.targetY + "px";
    });

    // Re-draw edges to final positions
    _threads.forEach(th => {
      const f = th.from, t = th.to;
      const dx = t.targetX - f.targetX, dy = t.targetY - f.targetY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        const ux = dx / len, uy = dy / len;
        const x1 = f.targetX + ux * f.r, y1 = f.targetY + uy * f.r;
        const x2 = t.targetX - ux * t.r, y2 = t.targetY - uy * t.r;
        th.el.setAttribute("d", `M${x1},${y1} L${x2},${y2}`);
      }
    });

    // Center view
    const viewport = modal.querySelector(".viz-viewport");
    if (viewport) {
      requestAnimationFrame(() => {
        _transform.x = viewport.clientWidth / 2;
        _transform.y = viewport.clientHeight / 2;
        _transform.scale = cfg.initialScale || 1.0;
        _updateTransform();
      });
    }

    _initPanZoom();
    _syncAllFilterUI();
    built = true;
    requestAnimationFrame(() => _animateEntrance());
  }

  /* ── Edge helper ───────────────────────────────────────── */
  function _addEdge(svgNS, glowId, from, to, color, width) {
    const dx = to.targetX - from.targetX, dy = to.targetY - from.targetY;
    const len = Math.sqrt(dx * dx + dy * dy);
    let fx = from.targetX, fy = from.targetY, tx = to.targetX, ty = to.targetY;
    if (len > 0) {
      const ux = dx / len, uy = dy / len;
      if (len > from.r + to.r) {
        fx += ux * from.r; fy += uy * from.r;
        tx -= ux * to.r;   ty -= uy * to.r;
      }
    }
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", `M${fx},${fy} L${tx},${ty}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", `rgba(${color},0.45)`);
    path.setAttribute("stroke-width", String(width || 1));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("filter", `url(#${glowId})`);
    path.classList.add("kg-thread");
    path.style.opacity = "0";
    _edgeSVG.appendChild(path);
    const thread = { el: path, from, to };
    _threads.push(thread);
    return thread;
  }

  /* ── Pan & zoom ────────────────────────────────────────── */
  function _initPanZoom() {
    const vp = modal.querySelector(".viz-viewport");
    if (!vp) return;
    _pz = initPanZoom(vp, _graphWorld, _transform, {
      minScale: MIN_SCALE, maxScale: MAX_SCALE,
      zoomStep: [0.9, 1.1],
      bounceCurve: "cubic-bezier(0.34,1.56,0.64,1)",
      bounceDuration: 380,
      rubberBandDrag: false,
      ignoreSelector: ".kg-node, .mtg-card-tooltip, .viz-explore-hint",
      onUpdate: () => _updateGlow(),
      getBounds: () => {
        const vp2 = modal.querySelector(".viz-viewport");
        if (!vp2) return null;
        const all = [..._nodes, ..._hubs];
        if (!all.length) return null;
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        all.forEach(n => {
          if (n.targetX < x0) x0 = n.targetX;
          if (n.targetX > x1) x1 = n.targetX;
          if (n.targetY < y0) y0 = n.targetY;
          if (n.targetY > y1) y1 = n.targetY;
        });
        const m = 100; x0 -= m; x1 += m; y0 -= m; y1 += m;
        const s = _transform.scale, p = 0.48;
        return {
          minX: vp2.clientWidth  * p - x1 * s, maxX: vp2.clientWidth  * (1 - p) - x0 * s,
          minY: vp2.clientHeight * p - y1 * s, maxY: vp2.clientHeight * (1 - p) - y0 * s,
        };
      },
    });
  }

  /* ── Entrance animation ────────────────────────────────── */
  function _animateEntrance() {
    const all = [..._hubs, ..._nodes];
    all.forEach(n => {
      n.el.style.left = "0px"; n.el.style.top = "0px";
      n.el.style.opacity = "0";
      n.el.style.transform = "translate(-50%,-50%) scale(0.3)";
    });
    _threads.forEach(th => { th.el.style.opacity = "0"; });

    const maxDist = Math.max(1, ...all.map(n => Math.sqrt((n.targetX||0)**2 + (n.targetY||0)**2)));
    const MAX_DELAY = 700;
    all.forEach((n, i) => {
      const frac = Math.sqrt((n.targetX||0)**2 + (n.targetY||0)**2) / maxDist;
      const delay = frac * MAX_DELAY + i * 2;
      setTimeout(() => {
        n.el.style.transition = "left 0.6s cubic-bezier(0.34,1.56,0.64,1),top 0.6s cubic-bezier(0.34,1.56,0.64,1),opacity 0.4s ease,transform 0.5s cubic-bezier(0.34,1.56,0.64,1)";
        n.el.style.left    = n.targetX + "px";
        n.el.style.top     = n.targetY + "px";
        n.el.style.opacity = "";
        n.el.style.transform = "translate(-50%,-50%) scale(1)";
        setTimeout(() => { n.el.style.transition = ""; }, 700);
      }, delay);
    });

    // Fade threads
    const fadeDur = 500, fadeStart = performance.now() + 350;
    function fadeThreads(now) {
      let t = Math.max(0, Math.min(1, (now - fadeStart) / fadeDur));
      const o = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
      _threads.forEach(th => {
        if (!th.el.classList.contains("kg-thread-hidden")) th.el.style.opacity = String(o);
      });
      if (t < 1) requestAnimationFrame(fadeThreads);
    }
    requestAnimationFrame(fadeThreads);

    const vp = modal.querySelector(".viz-viewport");
    if (vp) requestAnimationFrame(() => {
      _transform.x = vp.clientWidth / 2;
      _transform.y = vp.clientHeight / 2;
      _transform.scale = cfg.initialScale || 1.0;
      _updateTransform();
    });

    setTimeout(() => _updateGlow(), MAX_DELAY + all.length * 2 + 700);
  }

  /* ── Public API ────────────────────────────────────────── */
  return {
    open:  open,
    close: close,
    getNodes:   () => _nodes,
    getHubs:    () => _hubs,
    getThreads: () => _threads,
    getTransform: () => _transform,
    applyFilters: _applyFilters,
    updateGlow:   _updateGlow,
  };
}
