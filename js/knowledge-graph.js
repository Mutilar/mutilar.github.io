// ═══════════════════════════════════════════════════════════════
//  GRAPH OF KNOWLEDGE — 2D pannable/zoomable node canvas modal
//
//  Shows the user's experience as an interconnected node graph
//  radiating outward from a central identity node. Directional
//  quadrants: North=Robotics, South=Software, West=Games, East=Research.
//  Oldest items nearest the center; newest at the edges.
// ═══════════════════════════════════════════════════════════════
(() => {
  const graphModal = document.getElementById("knowledge-modal");
  const graphModalClose = document.getElementById("knowledgeModalClose");
  if (!graphModal || !graphModalClose) return;

  /* ── Thematic config (mirrors timeline.js) ────────────────── */
  const themeConfig = {
    robotics:  { color: "242,80,34",   icon: "fa-cogs",           label: "Robotics",  emoji: "🤖" },
    games:     { color: "127,186,0",   icon: "fa-gamepad",        label: "Games",      emoji: "🎮" },
    software:  { color: "0,164,239",   icon: "fa-code",           label: "Software",   emoji: "💻" },
    research:  { color: "255,185,0",   icon: "fa-flask",          label: "Research",   emoji: "🔬" },
    education: { color: "0,120,212",   icon: "fa-graduation-cap", label: "Education",  emoji: "🎓" },
  };

  const themeMap = {
    marp: "robotics", sriracha: "robotics", smartank: "robotics",
    blindsight: "robotics", amaxesd: "robotics", redtierobotics: "robotics",
    alamorobotics: "robotics", motorskills: "robotics", "home-iot": "robotics",
    bitnaughts: "games", graviton: "games", spaceninjas: "games",
    voodoo: "games", galconq: "games", popvuj: "games",
    seerauber: "games", summerofgamedesign: "games", iterate: "games",
    microsoft: "software", azuremlops: "software", ventana: "software",
    citris: "software", hackmerced: "software", motleymoves: "software",
    breeze: "software", dogpark: "software",
    ozone: "software", gasleek: "software", chemistry: "software",
    gist: "software", digestquest: "software",
    vicelab: "research", andeslab: "research", maces: "research",
    firmi: "research", learnbeat: "research", acm: "research",
    cse180: "education", cse165: "education", cse160: "education",
    cse120: "education", cse111: "education", cse100: "education",
    cse031: "education", cse030: "education", cse015: "education",
    ropgamedesign: "education", roparchitecture: "education", apjava: "education",
  };

  /** Map education items to a directional quadrant theme */
  const eduQuadrantMap = {
    cse180: "robotics",   // ROS → Robotics/North
    cse165: "software",   // OOP → Software/South
    cse160: "software",   // Networks → Software/South
    cse120: "software",   // Software Engineering → Software/South
    cse111: "software",   // SQL/Databases → Software/South
    cse100: "research",   // Algorithms/BigO → Research/East
    cse031: "robotics",   // Computer Org/MIPS → Robotics/North
    cse030: "software",   // Data Structures/C++ → Software/South
    cse015: "research",   // Discrete Math/Proofs → Research/East
    ropgamedesign: "games",      // Game Design → Games/West
    roparchitecture: "robotics", // Architecture/CAD → Robotics/North
    apjava: "software",         // AP CS A/Java → Software/South
  };

  /** Quadrant direction vectors (unit) */
  const quadrantDir = {
    robotics:  { x: 0, y: -1 },  // North (up)
    software:  { x: 0, y:  1 },  // South (down)
    games:     { x: -1, y: 0 },  // West (left)
    research:  { x:  1, y: 0 },  // East (right)
  };

  /** Whisper labels for nodes (compact accomplishments).
   *  Each value is an array — if multiple entries exist,
   *  they crossfade based on zoom level. */
  const whisperLabels = {
    "microsoft":       ["🌐 8B+<sup>INF/DAY</sup>", "🔒 Champ<sup>SEC</sup>", "🎯 Champ<sup>DRI</sup>", "☁️ 50+<sup>DCs</sup>", "🚀 GA", "📡 Envoy", "🧠 A.I.<sup>U.X.</sup>", "⚡ MLOps"],
    "bitnaughts":      ["🎮 Code<sup>Gamified</sup>", "👁️ See<sup>CODE</sup>", "🔄 Try<sup>CODE</sup>", "🎓 Learn<sup>CODE</sup>", "💻 4<sup>Hacks</sup>", "🌍 Play<sup>It</sup>"],
    "marp":            ["🤖 Robot"],
    "iterate":         ["🏆 $5,000"],
    "ventana":         ["🔬 A.I."],
    "home-iot":        ["🎛️ Tactility"],
    "azuremlops":      ["⚡ CI/CD"],
    "chemistry":       ["🧪 A.R."],
    "firmi":           ["🧊 Fermi"],
    "hackmerced":      ["🧑‍💻 350+"],
    "motleymoves":     ["🏃 Running"],
    "andeslab":        ["🏭 HVAC"],
    "breeze":          ["💨 Aux<sup>Air</sup>"],
    "dogpark":         ["🥈 2<sup>ND</sup>"],
    "vicelab":         ["🛰️ Ag<sup>A.I.</sup>"],
    "maces":           ["🚀 NASA"],
    "citris":          ["🏙️ Cyber<sup>Aware</sup>", "🏙️ Git<sup>Ops</sup>"],
    "amaxesd":         ["⚡ ESD"],
    "summerofgamedesign": ["👨‍🏫 50+<sup>Students</sup>", "💰 $25K+<sup>Budget</sup>"],
    "alamorobotics":   ["🤖 Mindstorm"],
    "acm":             ["💻 Outreach"],
    "learnbeat":       ["📚 Learn<sup>STEM</sup>"],
    "redtierobotics":  ["⚡ AMAX", "🔌 CAD", "💰 $18K+<sup>Budget</sup>"],
    "cse180":          ["🤖 ROS"],
    "cse165":          ["📦 OOP"],
    "cse160":          ["🌐 TCP"],
    "cse120":          ["💻 SWE"],
    "cse111":          ["🗃️ SQL"],
    "cse100":          ["📊 BigO"],
    "cse031":          ["⚙️ MIPS"],
    "cse030":          ["📚 C<sup>++</sup>"],
    "cse015":          ["🔢 Proofs"],
    "ropgamedesign":   ["🕹️ Unity"],
    "roparchitecture": ["🏗️ CAD"],
    "apjava":          ["☕ Java"],
    "gasleek":         ["🥇 1<sup>ST</sup>"],
    "sriracha":        ["🥉 3<sup>RD</sup>"],
    "smartank":        ["🥇 Hardware"],
    "spaceninjas":     ["🥷 Platformer"],
    "graviton":        ["🌸 Tower<sup>Def</sup>"],
    "galconq":         ["🌌 4<sup>X</sup>"],
    "seerauber":       ["🥈 2<sup>ND</sup>"],
    "ozone":           ["🥈 2<sup>ND</sup>"],
    "blindsight":      ["🥉 3<sup>RD</sup>"],
    "motorskills":     ["🥇 GCP"],
    "gist":            ["🥇 Environment"],
    "digestquest":     ["🥇 Design"],
    "voodoo":          ["🎨 Pixel<sup>Art</sup>"],
    "popvuj":          ["🌄 Myth"],
  };

  function getTheme(item) { return themeMap[item.ID] || "software"; }

  /* ── Date parsing (simplified from timeline.js) ───────────── */
  const monthLookup = {
    jan:0,january:0,feb:1,february:1,mar:2,march:2,
    apr:3,april:3,may:4,jun:5,june:5,jul:6,july:6,
    aug:7,august:7,sep:8,september:8,oct:9,october:9,
    nov:10,november:10,dec:11,december:11,
    spring:2,summer:5,fall:8,winter:11
  };

  /** Parse a single date token → absolute month value */
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

  /** Return the earliest start date from a DATE field.
   *  Handles comma-separated disjoint ranges and dash-separated spans.
   *  e.g. "Summer 2019, Spring 2020 - Fall 2025" → Summer 2019 */
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

  /** Return the latest end date from a DATE field.
   *  For ranges like "Spring 2020 - Fall 2025" returns Fall 2025.
   *  For single dates like "Spring 2018" returns that same date.
   *  For comma-separated ranges, returns the latest end across all. */
  function parseDateEnd(dateStr) {
    if (!dateStr || !dateStr.trim()) return null;
    const segments = dateStr.trim().split(/\s*,\s*/);
    let latest = -Infinity;
    segments.forEach(seg => {
      const rangeParts = seg.split(/\s*[-–]\s*/);
      // The end is the last part of the range (or the only part)
      const end = _parseSingle(rangeParts[rangeParts.length - 1]);
      if (end !== null && end > latest) latest = end;
    });
    return latest === -Infinity ? null : latest;
  }

  /* ── State ────────────────────────────────────────────────── */
  let graphBuilt = false;
  let activeFilters = new Set(["robotics", "games", "software", "research", "education"]);
  const allThemes = ["robotics", "games", "software", "research", "education"];

  let _nodes = [];       // { el, edgeEl, theme, quadrant, item, category, absMonth, dist }
  let _hoveredNode = null; // currently hovered node (for whisper on hover)
  let _transform = { x: 0, y: 0, scale: 1 };
  let _graphWorld = null; // the transform container
  let _edgeSVG = null;    // the SVG for edges

  /* ── Open / close ─────────────────────────────────────────── */
  function openKnowledgeModal() {
    toggleModal(graphModal, true);
    if (!graphBuilt) buildGraph();
    else updateTransform();
    // Animate entrance
    requestAnimationFrame(() => animateEntrance());
  }

  function closeKnowledgeModal() {
    toggleModal(graphModal, false);
  }

  window.openKnowledgeModal  = openKnowledgeModal;
  window.closeKnowledgeModal = closeKnowledgeModal;

  graphModalClose.addEventListener("click", closeKnowledgeModal);
  graphModal.addEventListener("click", e => { if (e.target === graphModal) closeKnowledgeModal(); });

  // ── Escape key ──────────────────────────────────────────────
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && graphModal.classList.contains("open")) closeKnowledgeModal();
  });

  /* ── Filter buttons ───────────────────────────────────────── */
  const allBtn = graphModal.querySelector('.kg-filter[data-filter="all"]');
  const themeBtns = graphModal.querySelectorAll('.kg-filter:not([data-filter="all"])');

  function syncFilterUI() {
    const allActive = activeFilters.size === allThemes.length;
    if (allBtn) {
      allBtn.classList.toggle("active", allActive);
      const indicator = allBtn.querySelector(".all-indicator");
      if (indicator) {
        const isLight = document.documentElement.classList.contains("light-mode");
        indicator.textContent = allActive
          ? (isLight ? "\u2b1b" : "\u2b1c")
          : (isLight ? "\u2b1c" : "\u2b1b");
      }
    }
    themeBtns.forEach(b => b.classList.toggle("active", activeFilters.has(b.dataset.filter)));
  }
  syncFilterUI();
  window.addEventListener("theme-changed", () => syncFilterUI());

  if (allBtn) {
    allBtn.addEventListener("click", () => {
      if (activeFilters.size === allThemes.length) {
        allBtn.classList.remove("filter-pulse");
        void allBtn.offsetWidth;
        allBtn.classList.add("filter-pulse");
        setTimeout(() => allBtn.classList.remove("filter-pulse"), 100);
        return;
      }
      allThemes.forEach(t => activeFilters.add(t));
      syncFilterUI();
      applyFilter();
    });
  }

  themeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const f = btn.dataset.filter;
      if (activeFilters.size === allThemes.length) {
        activeFilters.clear();
        activeFilters.add(f);
      } else if (activeFilters.has(f) && activeFilters.size === 1) {
        allThemes.forEach(t => activeFilters.add(t));
      } else if (activeFilters.has(f)) {
        activeFilters.delete(f);
      } else {
        activeFilters.add(f);
      }
      syncFilterUI();
      applyFilter();
    });
  });

  function applyFilter() {
    _nodes.forEach(n => {
      // Education nodes live in quadrant slots but have theme "education".
      // For education nodes: visible if education filter is active AND
      //   (its quadrant filter is also active OR no quadrant filters are on).
      // For non-education nodes: visible if its quadrant filter is active.
      const quadrantOn = activeFilters.has(n.quadrant);
      const isEdu = n.theme === "education";
      const eduOn = activeFilters.has("education");
      const anyQuadrantOn = ["robotics", "games", "software", "research"].some(q => activeFilters.has(q));
      let hide;
      if (isEdu) {
        hide = !eduOn || (anyQuadrantOn && !quadrantOn);
      } else {
        hide = !quadrantOn;
      }
      n.el.classList.toggle("kg-hidden", hide);
      if (n.edgeEl) n.edgeEl.classList.toggle("kg-edge-hidden", hide);
    });
    updateProximityGlow();
  }

  /* ── Pan & Zoom ───────────────────────────────────────────── */
  const MIN_SCALE = 1;
  const MAX_SCALE = 4;

  /** Compute the allowed pan range so the graph content stays mostly visible.
   *  Returns { minX, maxX, minY, maxY } for _transform.x/y. */
  function getPanBounds() {
    const viewport = graphModal.querySelector(".kg-viewport");
    if (!viewport || _nodes.length === 0) return null;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    // Find world-space extent of all nodes
    let wMinX = Infinity, wMaxX = -Infinity, wMinY = Infinity, wMaxY = -Infinity;
    _nodes.forEach(n => {
      if (n.targetX < wMinX) wMinX = n.targetX;
      if (n.targetX > wMaxX) wMaxX = n.targetX;
      if (n.targetY < wMinY) wMinY = n.targetY;
      if (n.targetY > wMaxY) wMaxY = n.targetY;
    });
    // Add margin for node sizes
    const margin = 80;
    wMinX -= margin; wMaxX += margin;
    wMinY -= margin; wMaxY += margin;
    // In screen space, node at worldX appears at: worldX * scale + transform.x
    // We want at least 15% of viewport to still show content:
    // => wMaxX * scale + tx >= vw * 0.15   → tx >= vw*0.15 - wMaxX*scale
    // => wMinX * scale + tx <= vw * 0.85   → tx <= vw*0.85 - wMinX*scale
    const s = _transform.scale;
    const pad = 0.15;
    return {
      minX: vw * pad - wMaxX * s,
      maxX: vw * (1 - pad) - wMinX * s,
      minY: vh * pad - wMaxY * s,
      maxY: vh * (1 - pad) - wMinY * s,
    };
  }

  /** Check if current pan is out of bounds and spring back if so. */
  let _panBounceTimer = null;
  function bounceBackIfNeeded() {
    const bounds = getPanBounds();
    if (!bounds) return;
    let tx = _transform.x, ty = _transform.y;
    let clamped = false;
    if (tx < bounds.minX) { tx = bounds.minX; clamped = true; }
    if (tx > bounds.maxX) { tx = bounds.maxX; clamped = true; }
    if (ty < bounds.minY) { ty = bounds.minY; clamped = true; }
    if (ty > bounds.maxY) { ty = bounds.maxY; clamped = true; }
    if (clamped) {
      _transform.x = tx;
      _transform.y = ty;
      _graphWorld.style.transition = "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)";
      updateTransform();
      if (_panBounceTimer) clearTimeout(_panBounceTimer);
      _panBounceTimer = setTimeout(() => { _graphWorld.style.transition = ""; }, 380);
    }
  }

  function updateTransform() {
    if (!_graphWorld) return;
    _graphWorld.style.transform = `translate(${_transform.x}px, ${_transform.y}px) scale(${_transform.scale})`;
    updateProximityGlow();
  }

  /** Toggle glow on nodes whose center falls within the center 25% of the viewport */
  let _glowRAF = 0;
  function updateProximityGlow() {
    cancelAnimationFrame(_glowRAF);
    _glowRAF = requestAnimationFrame(() => {
      const viewport = graphModal.querySelector(".kg-viewport");
      if (!viewport || _nodes.length === 0) return;
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      // Center 25% rectangle
      const margin = 0.375; // (1 - 0.25) / 2
      const left   = vw * margin;
      const right  = vw * (1 - margin);
      const top    = vh * margin;
      const bottom = vh * (1 - margin);

      // Map zoom level to whisper index: evenly divide the zoom range
      const zoomT = Math.max(0, Math.min(1, (_transform.scale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE)));

      _nodes.forEach(n => {
        // Node world-space position → screen-space
        const sx = n.targetX * _transform.scale + _transform.x;
        const sy = n.targetY * _transform.scale + _transform.y;
        const inCenter = sx >= left && sx <= right && sy >= top && sy <= bottom;
        const hovered = n === _hoveredNode;
        const focused = (inCenter || hovered) && !n.el.classList.contains("kg-hidden");
        n.el.classList.toggle("kg-in-focus", focused);

        if (!n.nameLayer || !n.whisperLayers || n.whisperLayers.length < 2) return;

        if (focused && n.whispers.length) {
          // Hide name, ensure a whisper layer is visible
          n.nameLayer.classList.remove("kg-name-show");

          // Pick which whisper based on zoom
          const idx = Math.min(n.whispers.length - 1, Math.floor(zoomT * n.whispers.length));

          if (!n.wasFocused) {
            // First frame of focus: immediately show the correct whisper
            const cur = n.whisperLayers[n.activeWhisper];
            cur.innerHTML = n.whispers[idx];
            fitTextToCircle(cur, parseFloat(n.el.style.getPropertyValue('--kg-size')) || 70, (parseFloat(n.el.style.getPropertyValue('--kg-size')) || 70) * 0.35);
            cur.classList.add("kg-name-show");
            n.lastWhisperIdx = idx;
          } else if (idx !== n.lastWhisperIdx) {
            // Crossfade: write new text into the hidden layer, swap
            const outLayer = n.whisperLayers[n.activeWhisper];
            const inIdx    = 1 - n.activeWhisper;
            const inLayer  = n.whisperLayers[inIdx];
            inLayer.innerHTML = n.whispers[idx];
            fitTextToCircle(inLayer, parseFloat(n.el.style.getPropertyValue('--kg-size')) || 70, (parseFloat(n.el.style.getPropertyValue('--kg-size')) || 70) * 0.35);
            inLayer.classList.add("kg-name-show");
            outLayer.classList.remove("kg-name-show");
            n.activeWhisper = inIdx;
            n.lastWhisperIdx = idx;
          }
          n.wasFocused = true;
        } else {
          // Show name, hide both whisper layers
          n.nameLayer.classList.add("kg-name-show");
          n.whisperLayers[0].classList.remove("kg-name-show");
          n.whisperLayers[1].classList.remove("kg-name-show");
          n.wasFocused = false;
        }
      });
    });
  }

  function initPanZoom() {
    const viewport = graphModal.querySelector(".kg-viewport");
    if (!viewport) return;

    let isPanning = false;
    let startX = 0, startY = 0;
    let startTX = 0, startTY = 0;

    viewport.addEventListener("pointerdown", e => {
      if (e.target.closest(".kg-node")) return; // let node clicks through
      isPanning = true;
      startX = e.clientX;
      startY = e.clientY;
      startTX = _transform.x;
      startTY = _transform.y;
      viewport.style.cursor = "grabbing";
      viewport.setPointerCapture(e.pointerId);
    });

    viewport.addEventListener("pointermove", e => {
      if (!isPanning) return;
      _transform.x = startTX + (e.clientX - startX);
      _transform.y = startTY + (e.clientY - startY);
      updateTransform();
    });

    viewport.addEventListener("pointerup", () => {
      isPanning = false;
      viewport.style.cursor = "grab";
      bounceBackIfNeeded();
    });

    viewport.addEventListener("pointercancel", () => {
      isPanning = false;
      viewport.style.cursor = "grab";
      bounceBackIfNeeded();
    });

    // Zoom with scroll wheel
    let _bounceTimer = null;
    viewport.addEventListener("wheel", e => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const prevScale = _transform.scale;
      const raw = _transform.scale * (e.deltaY > 0 ? 0.9 : 1.1);
      const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, raw));
      const atLimit = raw !== clamped;

      _transform.scale = clamped;

      // Zoom toward cursor position
      const ratio = _transform.scale / prevScale;
      _transform.x = mx - ratio * (mx - _transform.x);
      _transform.y = my - ratio * (my - _transform.y);

      updateTransform();

      // Bounce if hitting a limit
      if (atLimit) {
        if (_bounceTimer) clearTimeout(_bounceTimer);
        const overshoot = raw < MIN_SCALE ? MIN_SCALE * 0.92 : MAX_SCALE * 1.06;
        _transform.scale = overshoot;
        const oRatio = _transform.scale / clamped;
        _transform.x = mx - oRatio * (mx - _transform.x);
        _transform.y = my - oRatio * (my - _transform.y);
        _graphWorld.style.transition = "transform 0.08s ease-out";
        updateTransform();

        _bounceTimer = setTimeout(() => {
          _transform.scale = clamped;
          const bRatio = clamped / overshoot;
          _transform.x = mx - bRatio * (mx - _transform.x);
          _transform.y = my - bRatio * (my - _transform.y);
          _graphWorld.style.transition = "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)";
          updateTransform();
          setTimeout(() => { _graphWorld.style.transition = ""; bounceBackIfNeeded(); }, 320);
        }, 80);
      } else {
        bounceBackIfNeeded();
      }
    }, { passive: false });

    // Touch pinch zoom
    let lastTouchDist = 0;
    let lastTouchCenter = null;

    viewport.addEventListener("touchstart", e => {
      if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        lastTouchDist = Math.sqrt(dx * dx + dy * dy);
        lastTouchCenter = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        };
      }
    }, { passive: true });

    viewport.addEventListener("touchmove", e => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (lastTouchDist > 0) {
          const rect = viewport.getBoundingClientRect();
          const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
          const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

          const prevScale = _transform.scale;
          _transform.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, _transform.scale * (dist / lastTouchDist)));
          const ratio = _transform.scale / prevScale;
          _transform.x = cx - ratio * (cx - _transform.x);
          _transform.y = cy - ratio * (cy - _transform.y);
          updateTransform();
        }
        lastTouchDist = dist;
      }
    }, { passive: false });
  }

  /* ── Build Graph ──────────────────────────────────────────── */
  function buildGraph() {
    const datasets = ["work", "education", "projects", "hackathons", "games"];
    if (!datasets.every(d => modalState[d])) { setTimeout(buildGraph, 200); return; }

    // Collect all items with their themes and dates
    const items = [];
    datasets.forEach(cat => {
      (modalState[cat] || []).forEach(item => {
        const theme = getTheme(item);
        const startMo = parseDateStart(item.DATE);
        const endMo   = parseDateEnd(item.DATE);
        if (startMo === null) return;

        // Duration in months (minimum 3 for point-events like hackathons)
        const duration = Math.max(3, (endMo || startMo) - startMo);

        // Determine quadrant: education items use their mapped quadrant
        let quadrant = theme;
        if (theme === "education") {
          quadrant = eduQuadrantMap[item.ID] || "software";
        }

        items.push({ item, category: cat, theme, quadrant, absMonth: startMo, endMonth: endMo || startMo, duration });
      });
    });

    if (items.length === 0) return;

    // Group by quadrant
    const quadrants = { robotics: [], games: [], software: [], research: [] };
    items.forEach(it => {
      if (quadrants[it.quadrant]) quadrants[it.quadrant].push(it);
    });

    // Sort each quadrant independently: oldest first (closest to center)
    Object.values(quadrants).forEach(group => {
      group.sort((a, b) => a.absMonth - b.absMonth);
    });

    // Get DOM containers
    _graphWorld = graphModal.querySelector(".kg-world");
    _edgeSVG = graphModal.querySelector(".kg-edges");
    if (!_graphWorld || !_edgeSVG) return;

    _graphWorld.querySelectorAll(".kg-node").forEach(n => n.remove());
    _edgeSVG.innerHTML = "";
    _nodes = [];

    // ── Create center node ────────────────────────────────────
    const centerNode = document.createElement("div");
    centerNode.className = "kg-node kg-node-center";
    centerNode.innerHTML = `<div class="kg-node-icon">🐧</div>`;
    centerNode.style.left = "0px";
    centerNode.style.top = "0px";
    centerNode.style.cursor = "pointer";
    centerNode.addEventListener("click", e => {
      e.stopPropagation();
      openQuiltModal();
    });
    _graphWorld.appendChild(centerNode);

    // ── Temporal layout constants ─────────────────────────────
    // Compute global date range across ALL items
    const globalMin = Math.min(...items.map(it => it.absMonth));
    const globalMax = Math.max(...items.map(it => it.absMonth));
    const dateRange = Math.max(1, globalMax - globalMin);

    const MIN_DIST     = 80;    // px — minimum distance from center
    const MAX_DIST     = 400;   // px — maximum distance from center
    const SPREAD_ANGLE = Math.PI / 2.5; // angular spread per quadrant (~72°)

    // Duration → circle size mapping
    const globalMinDur = Math.min(...items.map(it => it.duration));
    const globalMaxDur = Math.max(...items.map(it => it.duration));
    const MIN_SIZE = 52;   // px — smallest circle (short events)
    const MAX_SIZE = 120;  // px — largest circle (multi-year items)

    function durationToSize(dur) {
      if (globalMaxDur <= globalMinDur) return (MIN_SIZE + MAX_SIZE) / 2;
      const t = (dur - globalMinDur) / (globalMaxDur - globalMinDur);
      // Use sqrt for a gentler curve so small items aren't tiny
      return MIN_SIZE + Math.sqrt(t) * (MAX_SIZE - MIN_SIZE);
    }

    // ── Layout nodes per quadrant ─────────────────────────────
    // First pass: compute "suggestion" positions from temporal data
    const allPlaced = []; // { x, y, r } — for collision resolution
    const CENTER_R = 50;  // center node collision radius
    allPlaced.push({ x: 0, y: 0, r: CENTER_R, fixed: true });

    Object.keys(quadrants).forEach(qKey => {
      const group = quadrants[qKey];
      if (group.length === 0) return;
      const dir = quadrantDir[qKey];
      const baseAngle = Math.atan2(dir.y, dir.x);

      // Assign distance proportional to actual date
      group.forEach((it, idx) => {
        const t = dateRange > 0 ? (it.absMonth - globalMin) / dateRange : 0.5;
        const dist = MIN_DIST + t * (MAX_DIST - MIN_DIST);

        // Spread items angularly within the quadrant
        let angle;
        if (group.length === 1) {
          angle = baseAngle;
        } else {
          const at = idx / (group.length - 1);  // 0..1
          angle = baseAngle + SPREAD_ANGLE * (at - 0.5);
        }

        // Controlled jitter for organic feel (deterministic per item)
        const seed1 = Math.sin(idx * 7.3 + baseAngle * 13.7);
        const seed2 = Math.sin(idx * 11.1 + baseAngle * 5.3);
        const jitterDist  = dist * (1 + seed1 * 0.06);
        const jitterAngle = angle + seed2 * 0.06;

        it.x = Math.cos(jitterAngle) * jitterDist;
        it.y = Math.sin(jitterAngle) * jitterDist;
        it.dist = dist;
        it.size = durationToSize(it.duration);
        it.r = it.size / 2;  // collision radius
      });
    });

    // ── Collision resolution (hydrophobic spheres) ────────────
    // Collect all movable items
    const movable = [];
    Object.values(quadrants).forEach(group => {
      group.forEach(it => movable.push(it));
    });

    const PADDING = 2; // px gap between circles (tight, nearly touching)
    const ITERATIONS = 60;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      let anyMoved = false;

      // Check movable vs all (center + other movable)
      for (let i = 0; i < movable.length; i++) {
        const a = movable[i];

        // vs center node (fixed)
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

        // vs other movable nodes
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

    // Update dist after collision resolution
    movable.forEach(it => {
      it.dist = Math.sqrt(it.x * it.x + it.y * it.y);
    });

    // ── Create edges and node elements ────────────────────────
    Object.keys(quadrants).forEach(qKey => {
      const group = quadrants[qKey];
      if (group.length === 0) return;

      // Create edge lines and node elements
      group.forEach((it, idx) => {
        // Edge: connect to previous node in same quadrant, or center
        const parentX = idx > 0 ? group[idx - 1].x : 0;
        const parentY = idx > 0 ? group[idx - 1].y : 0;

        const edgeCfg = it.theme === "education" ? themeConfig.education : (themeConfig[it.quadrant] || themeConfig.software);
        const edgeLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        edgeLine.setAttribute("x1", parentX);
        edgeLine.setAttribute("y1", parentY);
        edgeLine.setAttribute("x2", it.x);
        edgeLine.setAttribute("y2", it.y);
        edgeLine.setAttribute("stroke", `rgba(${edgeCfg.color}, 0.25)`);
        edgeLine.setAttribute("stroke-width", "1.5");
        edgeLine.classList.add("kg-edge");
        edgeLine.dataset.quadrant = it.quadrant;
        _edgeSVG.appendChild(edgeLine);

        // Node element (pass size for duration-based circle)
        const el = buildNodeElement(it);
        el.style.left = it.x + "px";
        el.style.top = it.y + "px";
        _graphWorld.appendChild(el);

        // Whisper crossfade state
        const wList = whisperLabels[it.item.ID] || [];
        const nameLayer = el.querySelector(".kg-name-layer:first-child");
        const whisperLayers = Array.from(el.querySelectorAll(".kg-name-whisper"));

        // Hover tracking for whisper-on-hover
        el.addEventListener("mouseenter", () => {
          const node = _nodes.find(nd => nd.el === el);
          if (node) { _hoveredNode = node; updateProximityGlow(); }
        });
        el.addEventListener("mouseleave", () => {
          if (_hoveredNode && _hoveredNode.el === el) { _hoveredNode = null; updateProximityGlow(); }
        });

        _nodes.push({
          el,
          edgeEl: edgeLine,
          theme: it.theme,
          quadrant: it.quadrant,
          item: it.item,
          category: it.category,
          absMonth: it.absMonth,
          dist: it.dist,
          targetX: it.x,
          targetY: it.y,
          whispers: wList,
          nameLayer,
          whisperLayers,
          activeWhisper: 0,    // which of the two whisper spans is currently shown
          lastWhisperIdx: -1,  // last whisper data index
          wasFocused: false,
        });
      });
    });

    // ── Center the view (zoomed in) ────────────────────────────
    const viewport = graphModal.querySelector(".kg-viewport");
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

    initPanZoom();
    graphBuilt = true;
  }

  /** Fit a text layer's font-size so its content fills the circle's width.
   *  Uses a binary search with a shared offscreen canvas for measuring.
   *  Accounts for <sup> content rendering at ~65% of base font size. */
  const _fitCanvas = document.createElement("canvas").getContext("2d");
  function fitTextToCircle(layer, circleSize, maxFont) {
    if (!layer) return;
    // Usable width ≈ chord at ~70% of radius (text sits near center of circle)
    const usable = circleSize * 0.82 - 12; // subtract padding
    if (usable <= 0) return;
    // Parse HTML into segments: { text, isSup } per line (split on <br>)
    const html = layer.innerHTML || "";
    const withBreaks = html.replace(/<br\s*\/?>/gi, "\n");
    // Split into lines, then parse each line for sup vs normal segments
    const lines = withBreaks.split(/\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    // For each line, extract segments
    const SUP_SCALE = 0.65;
    const parsed = lines.map(line => {
      const segs = [];
      let rest = line;
      const supRe = /<sup[^>]*>(.*?)<\/sup>/gi;
      let lastIdx = 0, m;
      while ((m = supRe.exec(line)) !== null) {
        if (m.index > lastIdx) segs.push({ text: line.slice(lastIdx, m.index).replace(/<[^>]+>/g, ""), isSup: false });
        segs.push({ text: m[1].replace(/<[^>]+>/g, ""), isSup: true });
        lastIdx = supRe.lastIndex;
      }
      if (lastIdx < line.length) segs.push({ text: line.slice(lastIdx).replace(/<[^>]+>/g, ""), isSup: false });
      return segs;
    });
    // Binary search: scale UP to fill, or DOWN to fit the widest line
    let lo = 5, hi = maxFont;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      const maxW = Math.max(...parsed.map(segs => {
        let w = 0;
        segs.forEach(s => {
          _fitCanvas.font = `700 ${s.isSup ? mid * SUP_SCALE : mid}px sans-serif`;
          w += _fitCanvas.measureText(s.text).width;
        });
        return w;
      }));
      if (maxW > usable) hi = mid;
      else lo = mid;
    }
    layer.style.fontSize = Math.max(5, Math.floor(lo)) + "px";
  }

  /** Build a single node DOM element (circular, sized by duration) */
  function buildNodeElement(it) {
    const { item, category, theme, quadrant } = it;
    // Education nodes use education color (deeper blue) regardless of quadrant placement
    const cfg = theme === "education" ? themeConfig.education : (themeConfig[quadrant] || themeConfig.software);
    const themeCfg = themeConfig[theme] || themeConfig.software;
    const size = it.size || 60;

    const el = document.createElement("div");
    el.className = "kg-node";
    el.dataset.theme = theme;
    el.dataset.quadrant = quadrant;
    el.style.setProperty("--tc", cfg.color);
    el.style.setProperty("--kg-size", size + "px");
    // Scale font sizes proportionally to circle size
    const fontScale = Math.max(0.75, size / 80);
    el.style.setProperty("--kg-font", Math.round(8 * fontScale) + "px");
    el.style.setProperty("--kg-whisper", Math.round(7 * fontScale) + "px");
    el.style.borderColor = `rgba(${cfg.color}, 0.45)`;

    const cleanName = (item.NAME || "")
      .replace(/<br\s*\/?>/gi, "\n")           // preserve <br> as newline
      .replace(/<[^>]+>/g, " ")                // strip other HTML tags
      .replace(/[ \t]+/g, " ")                 // collapse horizontal whitespace
      .replace(/ ?\n ?/g, "\n")                // clean whitespace around newlines
      .trim()
      .replace(/\n/g, "<br>");                 // convert back to <br> for rendering
    const whispers = whisperLabels[item.ID] || [];

    el.innerHTML =
      `<div class="kg-node-accent" style="background:radial-gradient(circle at 30% 30%, rgba(${cfg.color},0.15) 0%, transparent 70%);"></div>` +
      `<div class="kg-node-name">` +
        `<span class="kg-name-layer kg-name-show">${cleanName}</span>` +
        `<span class="kg-name-layer kg-name-whisper">${whispers[0] || cleanName}</span>` +
        `<span class="kg-name-layer kg-name-whisper"></span>` +
      `</div>`;

    el.addEventListener("click", e => {
      e.stopPropagation();
      openModal(category, item.ID);
    });

    // Fit text to circle after DOM is ready
    const baseFont = Math.round(8 * fontScale);
    const nameLayer = el.querySelector(".kg-name-layer:first-child");
    const whisperLayers = el.querySelectorAll(".kg-name-whisper");
    requestAnimationFrame(() => {
      fitTextToCircle(nameLayer, size, size * 0.35);
      whisperLayers.forEach(wl => fitTextToCircle(wl, size, size * 0.35));
    });

    return el;
  }

  /* ── Entrance animation (expand from center) ──────────────── */
  function animateEntrance() {
    // Reset all nodes to center
    _nodes.forEach(n => {
      n.el.style.left = "0px";
      n.el.style.top = "0px";
      n.el.style.opacity = "0";
      n.el.style.transform = "translate(-50%, -50%) scale(0.3)";
      if (n.edgeEl) {
        n.edgeEl.setAttribute("x1", "0");
        n.edgeEl.setAttribute("y1", "0");
        n.edgeEl.setAttribute("x2", "0");
        n.edgeEl.setAttribute("y2", "0");
        n.edgeEl.style.opacity = "0";
      }
    });

    // Stagger nodes outward by distance from center (temporal order)
    const maxDist = Math.max(1, ..._nodes.map(n => n.dist || 100));
    const MAX_DELAY = 600; // ms — total stagger range

    _nodes.forEach((n, i) => {
      const distFrac = (n.dist || 100) / maxDist;
      const delay = distFrac * MAX_DELAY + i * 8;
      setTimeout(() => {
        n.el.style.transition = "left 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)";
        n.el.style.left = n.targetX + "px";
        n.el.style.top = n.targetY + "px";
        n.el.style.opacity = "";
        n.el.style.transform = "translate(-50%, -50%) scale(1)";

        if (n.edgeEl) {
          n.edgeEl.style.transition = "opacity 0.4s ease";
          n.edgeEl.style.opacity = "";
          // Find parent coordinates
          const sameQuadrant = _nodes.filter(m => m.quadrant === n.quadrant);
          const qIdx = sameQuadrant.indexOf(n);
          const parentNode = qIdx > 0 ? sameQuadrant[qIdx - 1] : null;
          n.edgeEl.setAttribute("x1", parentNode ? parentNode.targetX : 0);
          n.edgeEl.setAttribute("y1", parentNode ? parentNode.targetY : 0);
          n.edgeEl.setAttribute("x2", n.targetX);
          n.edgeEl.setAttribute("y2", n.targetY);
        }

        // Clear transition after animation
        setTimeout(() => {
          n.el.style.transition = "";
          if (n.edgeEl) n.edgeEl.style.transition = "";
        }, 700);
      }, delay);
    });

    // Center the view with animation (zoomed in)
    const viewport = graphModal.querySelector(".kg-viewport");
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

    // Re-check glow after entrance animation settles
    const totalAnimTime = MAX_DELAY + _nodes.length * 8 + 700;
    setTimeout(() => updateProximityGlow(), totalAnimTime);
  }
})();
