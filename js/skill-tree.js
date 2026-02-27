// ═══════════════════════════════════════════════════════════════
//  GRAPH OF KNOWLEDGE — 2D pannable/zoomable node canvas modal
//
//  Shows the user's experience as an interconnected node graph
//  radiating outward from a central identity node. Three directional
//  quadrants at 120° spacing: North=Robotics, SW=Games, SE=Software.
//  Oldest items nearest the center; newest at the edges.
// ═══════════════════════════════════════════════════════════════
(() => {
  const graphModal = document.getElementById("knowledge-modal");
  const graphModalClose = document.getElementById("knowledgeModalClose");
  if (!graphModal || !graphModalClose) return;

  /* ── Thematic config (from viz.js) ──────────────────────────── */
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

  /** Map education items to a directional quadrant theme */
  const eduQuadrantMap = {
    cse180: "robotics",   // ROS → Robotics
    cse165: "software",   // OOP → Software
    cse160: "software",   // Networks → Software
    cse120: "software",   // Software Engineering → Software
    cse111: "software",   // SQL/Databases → Software
    cse100: "software",   // Algorithms/BigO → Software
    cse031: "robotics",   // Computer Org/MIPS → Robotics
    cse030: "software",   // Data Structures/C++ → Software
    cse015: "software",   // Discrete Math/Proofs → Software
    ropgamedesign: "games",      // Game Design → Games
    roparchitecture: "robotics", // Architecture/CAD → Robotics
    apjava: "software",         // AP CS A/Java → Software
    redtierobotics: "robotics", // FRC 1458 → Robotics
  };

  /** Map work items to a directional quadrant theme */
  const workQuadrantMap = {
    microsoft:        "software",   // SWE → Software
    ventana:          "software",   // SWE Intern → Software
    citris:           "software",   // Web Dev → Software
    hackmerced:       "software",   // Director → Software
    vicelab:          "software",   // Geospatial RA → Software
    andeslab:         "software",   // Computational RA → Software
    maces:            "software",   // NASA MUREP RA → Software
    learnbeat:        "software",   // STEM Instructor → Software
    acm:              "software",   // Outreach → Software
    alamorobotics:    "robotics",   // Lego Mindstorm → Robotics
    summerofgamedesign: "games",    // Game Design Camp → Games
    spaceninjas:      "games",      // Teaching boilerplate → Games
  };

  /** Map project + hackathon items to a directional quadrant theme */
  const projectsQuadrantMap = {
    // Projects
    marp:         "robotics",   // Robot platform → Robotics
    amaxesd:      "robotics",   // ESD hardware → Robotics
    "home-iot":   "robotics",   // IoT hardware → Robotics
    iterate:      "games",      // Mobile code editor/game → Games
    bitnaughts:   "games",      // Code-gamified project → Games
    voodoo:       "games",      // Pixel art auto-battler → Games
    galconq:      "games",      // Procedural space strategy → Games
    popvuj:       "games",      // God-sim city builder → Games
    "the-nobles": "games",      // MTG Commander deck → Games
    "the-demons": "games",      // MTG Commander deck → Games
    duskrosecodex: "games",     // MTG lore compendium → Games
    azuremlops:   "software",   // CI/CD pipeline → Software
    motleymoves:  "software",   // Web app → Software
    dogpark:      "software",   // Mobile app → Software
    ozone:        "software",   // React web app → Software
    breeze:       "software",   // IoT air quality sensing → Software
    firmi:        "software",   // Physics modeling → Software
    // Hackathons
    motorskills:  "robotics",   // IoT ML hardware → Robotics
    sriracha:     "robotics",   // RC tank robot → Robotics
    smartank:     "robotics",   // Autonomous robot → Robotics
    blindsight:   "robotics",   // Haptic wearable → Robotics
    seerauber:    "games",      // Pirate strategy game → Games
    graviton:     "games",      // Tower defense game → Games
    gasleek:      "software",   // ML linear regression → Software
    chemistry:    "software",   // AR science education → Software
    gist:         "software",   // AR Unity app → Software
    digestquest:  "software",   // OCR web app → Software
  };

  /** Quadrant direction vectors (unit) — 3-way 120° triangle */
  const quadrantDir = {
    robotics:  { x: 0,    y: -1    },  // North (up, 270°)
    games:     { x: -0.866, y: 0.5 },  // South-West (210°)
    software:  { x:  0.866, y: 0.5 },  // South-East (330°)
  };

  /** Whisper labels for nodes (compact accomplishments).
   *  Each value is an array — if multiple entries exist,
   *  they crossfade based on zoom level. */
  const whisperLabels = {
    "microsoft":       ["🧠"],
    "bitnaughts":      ["☄️"],
    "marp":            ["🤖"],
    "iterate":         ["🏆"],
    "ventana":         ["🧬"],
    "home-iot":        ["📡"],
    "azuremlops":      ["⚡"],
    "chemistry":       ["🧪"],
    "firmi":           ["⚛️"],
    "hackmerced":      ["🧑‍💻"],
    "motleymoves":     ["🏃"],
    "andeslab":        ["🏭"],
    "breeze":          ["💨"],
    "dogpark":         ["🥈"],
    "vicelab":         ["🌾"],
    "maces":           ["🚀"],
    "citris":          ["🏙️"],
    "amaxesd":         ["⚡"],
    "summerofgamedesign": ["🧑‍🏫"],
    "alamorobotics":   ["🧑‍🏫"],
    "acm":             ["🤝"],
    "learnbeat":       ["🌱"],
    "redtierobotics":  ["⚙️"],
    "cse180":          ["🤖"],
    "cse165":          ["📦"],
    "cse160":          ["🌐"],
    "cse120":          ["🛠️"],
    "cse111":          ["🗃️"],
    "cse100":          ["📈"],
    "cse031":          ["⚙️"],
    "cse030":          ["📚"],
    "cse015":          ["🔢"],
    "ropgamedesign":   ["⚙️"],
    "roparchitecture": ["🛠️"],
    "apjava":          ["♨️"],
    "gasleek":         ["🏆"],
    "sriracha":        ["🥉"],
    "smartank":        ["🥇"],
    "spaceninjas":     ["🥷"],
    "graviton":        ["🌸"],
    "galconq":         ["🌌"],
    "seerauber":       ["🥈"],
    "ozone":           ["🥈"],
    "blindsight":      ["🥉"],
    "motorskills":     ["🥇"],
    "gist":            ["🥇"],
    "digestquest":     ["🥇"],
    "voodoo":          ["🎨"],
    "popvuj":          ["⛪"],
    "the-nobles":      ["👑"],
    "the-demons":      ["👹"],
    "duskrosecodex":   ["📜"],
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
  let activeFilters = new Set(["robotics", "games", "software", "education", "work", "projects"]);
  const allThemes = ["robotics", "games", "software", "education", "work", "projects"];

  let _nodes = [];       // { el, theme, quadrant, item, category, absMonth, dist }
  let _hoveredNode = null; // currently hovered node (for whisper on hover)
  let _threads = [];     // { theme, quadrant, segments[], nodes[] } — theme×quadrant thread lines
  let _staticPositions = true; // when true, nodes keep original positions on filter
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

  /* ── Filter buttons (via viz.js shared filter system) ─────── */
  const allBtn = graphModal.querySelector('.kg-filter[data-filter="all"]');
  const themeBtns = graphModal.querySelectorAll('.kg-filter:not([data-filter="all"])');

  const quadrantFilters = ["robotics", "games", "software"];
  const overlayFilters  = ["education", "work", "projects"];

  /* ── Layout toggle (Static / Dynamic) ─────────────────────── */
  const layoutToggleBtn = document.getElementById("kgLayoutToggle");
  if (layoutToggleBtn) {
    layoutToggleBtn.addEventListener("click", function () {
      _staticPositions = !_staticPositions;
      layoutToggleBtn.classList.toggle("dynamic", !_staticPositions);
      layoutToggleBtn.textContent = _staticPositions ? "📌 Static" : "🔀 Dynamic";
      // If switching to dynamic, immediately relayout visible nodes
      if (!_staticPositions && graphBuilt) {
        relayoutAndAnimate();
      }
    });
  }

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
        // All on → solo within this group, keep the other group intact
        sameGroup.forEach(function (t) { activeFilters.delete(t); });
        activeFilters.add(f);
      } else if (activeFilters.has(f) && activeFilters.size === 1) {
        // Last filter standing → restore all
        allThemes.forEach(function (t) { activeFilters.add(t); });
      } else if (activeFilters.has(f)) {
        // Check if it's the last one in its group
        var siblingsOn = sameGroup.filter(function (t) { return t !== f && activeFilters.has(t); });
        if (siblingsOn.length === 0) {
          // Last in group → restore entire group
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
    // Determine which nodes are visible
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

    // Detect single-overlay mode: exactly one of education/work/projects is active
    const activeOverlays = overlayFilters.filter(f => activeFilters.has(f));
    const singleOverlay = activeOverlays.length === 1;

    // Update thread visibility: a theme×quadrant thread is visible when
    // both its theme filter AND its quadrant filter are active
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

      // Recolor threads: single overlay → use quadrant colors; otherwise → overlay theme color
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

    // Re-layout visible nodes and animate them into new positions
    // Always relayout during tour; otherwise respect the toggle
    if (!_staticPositions || _touring) {
      relayoutAndAnimate();
    }
    updateProximityGlow();
  }

  /** Re-run the positioning algorithm for visible nodes only,
   *  then spring-animate them from current to new positions. */
  function relayoutAndAnimate() {
    const visible = _nodes.filter(n => !n._hidden);
    if (visible.length === 0) return;

    // Group visible nodes by quadrant
    const quadrants = { robotics: [], games: [], software: [] };
    visible.forEach(n => {
      if (quadrants[n.quadrant]) quadrants[n.quadrant].push(n);
    });

    // Sort each quadrant by date (oldest first, closest to center)
    Object.values(quadrants).forEach(group => {
      group.sort((a, b) => a.absMonth - b.absMonth);
    });

    // Use global date range across ALL nodes (not just visible) so filtered
    // views maintain the same spatial scale as the full view
    const allMonths = _nodes.map(n => n.absMonth);
    const globalMin = Math.min(...allMonths);
    const globalMax = Math.max(...allMonths);
    const dateRange = Math.max(1, globalMax - globalMin);

    const MIN_DIST     = 50;
    const MAX_DIST     = 300;
    const SPREAD_ANGLE = Math.PI / 2.5;
    const CENTER_R     = 50;
    const PADDING      = 2;
    const ITERATIONS   = 60;

    // First pass: compute ideal positions from temporal data
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

    // Collision resolution
    for (let iter = 0; iter < ITERATIONS; iter++) {
      let anyMoved = false;

      for (let i = 0; i < movable.length; i++) {
        const a = movable[i];
        // vs center node
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
        // vs other movable nodes
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

    // Animate nodes to new positions with spring easing
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

        // Clear node transition after animation
        setTimeout(() => {
          n.el.style.transition = "";
        }, 600);
      }, delay);
    });

    // ── Animate thread curves to new node positions (radius-aware) ──
    _threads.forEach(th => {
      const themeOn    = activeFilters.has(th.theme);
      const quadrantOn = activeFilters.has(th.quadrant);
      if (!themeOn || !quadrantOn) return;

      th.segments.forEach((seg, i) => {
        // Segment i connects th.nodes[i] → th.nodes[i+1]
        const fromNode = th.nodes[i];
        const toNode   = th.nodes[i + 1];
        if (!fromNode || !toNode) return;
        if (fromNode._hidden || toNode._hidden) return;

        let nx1 = fromNode._newX;
        let ny1 = fromNode._newY;
        let nx2 = toNode._newX;
        let ny2 = toNode._newY;

        // Shorten endpoints by node radii
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

        // Previous curve coords
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

        // Store final coords
        seg._cx1 = nx1; seg._cy1 = ny1;
        seg._ccx = ncp.x; seg._ccy = ncp.y;
        seg._cx2 = nx2; seg._cy2 = ny2;
      });
    });

    // Re-check glow after animations settle
    const totalAnimTime = MAX_DELAY + visible.length * 4 + 600;
    setTimeout(() => updateProximityGlow(), totalAnimTime);
  }

  /* ── Pan & Zoom (delegates to shared initPanZoom from viz.js) ── */
  const _KG_MIN_SCALE = 1;
  const _KG_MAX_SCALE = 4;

  /** Shared pan/zoom handle — set by _initPanZoom(). */
  let _pz = null;

  /** Toggle glow on nodes whose center falls within the center 30% of the viewport */
  let _glowRAF = 0;
  function updateProximityGlow() {
    cancelAnimationFrame(_glowRAF);
    _glowRAF = requestAnimationFrame(() => {
      const viewport = graphModal.querySelector(".kg-viewport");
      if (!viewport || _nodes.length === 0) return;
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      // Center 30% rectangle
      const margin = 0.35; // (1 - 0.30) / 2
      const left   = vw * margin;
      const right  = vw * (1 - margin);
      const top    = vh * margin;
      const bottom = vh * (1 - margin);

      // Map zoom level to whisper index: evenly divide the zoom range
      const zoomT = Math.max(0, Math.min(1, (_transform.scale - _KG_MIN_SCALE) / (_KG_MAX_SCALE - _KG_MIN_SCALE)));

      _nodes.forEach(n => {
        // Node world-space position → screen-space
        const sx = n.targetX * _transform.scale + _transform.x;
        const sy = n.targetY * _transform.scale + _transform.y;
        const inCenter = sx >= left && sx <= right && sy >= top && sy <= bottom;
        const hovered = n === _hoveredNode;
        // During tour, all visible nodes glow
        const tourFocus = _touring && !n._hidden;
        const focused = (inCenter || hovered || tourFocus) && !n.el.classList.contains("kg-hidden");
        n.el.classList.toggle("kg-in-focus", focused);

        if (!n.nameLayer || !n.whisperLayers || n.whisperLayers.length < 2) return;

        if (focused && n.whispers.length) {
          // During tour name phase: show title, hide whispers, keep glow
          if (_touring && _tourShowNames) {
            n.nameLayer.classList.add("kg-name-show");
            n.whisperLayers[0].classList.remove("kg-name-show");
            n.whisperLayers[1].classList.remove("kg-name-show");
            n.wasFocused = false;
            return;
          }
          // Hide name, ensure a whisper layer is visible
          n.nameLayer.classList.remove("kg-name-show");

          // Pick which whisper based on zoom
          const idx = Math.min(n.whispers.length - 1, Math.floor(zoomT * n.whispers.length));

          if (!n.wasFocused) {
            // First frame of focus: immediately show the correct whisper
            const cur = n.whisperLayers[n.activeWhisper];
            cur.innerHTML = n.whispers[idx];
            fitTextToCircle(cur, parseFloat(n.el.style.getPropertyValue('--kg-size')) || 70, (parseFloat(n.el.style.getPropertyValue('--kg-size')) || 70) * 0.50);
            cur.classList.add("kg-name-show");
            n.lastWhisperIdx = idx;
          } else if (idx !== n.lastWhisperIdx) {
            // Crossfade: write new text into the hidden layer, swap
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
          // Show name, hide both whisper layers
          n.nameLayer.classList.add("kg-name-show");
          n.whisperLayers[0].classList.remove("kg-name-show");
          n.whisperLayers[1].classList.remove("kg-name-show");
          n.wasFocused = false;
        }
      });
    });
  }

  /** Apply the current _transform to the world element + trigger proximity glow.
   *  Called from many places outside pan/zoom (entrance animations, filter relayout, etc.) */
  function updateTransform() {
    if (!_graphWorld) return;
    if (_pz) { _pz.update(); return; }
    // Fallback before _pz is initialised (first render)
    _graphWorld.style.transform = `translate(${_transform.x}px, ${_transform.y}px) scale(${_transform.scale})`;
    updateProximityGlow();
  }

  /** Convenience wrapper so call-sites don't need to null-check _pz. */
  function bounceBackIfNeeded() {
    if (_pz) _pz.bounceBackIfNeeded();
  }

  /** Wire up pointer/wheel/pinch interaction via shared initPanZoom. */
  function _initPanZoom() {
    const viewport = graphModal.querySelector(".kg-viewport");
    if (!viewport) return;
    _pz = initPanZoom(viewport, _graphWorld, _transform, {
      minScale:       _KG_MIN_SCALE,
      maxScale:       _KG_MAX_SCALE,
      zoomStep:       [0.9, 1.1],
      bounceCurve:    "cubic-bezier(0.34, 1.56, 0.64, 1)",
      bounceDuration: 380,
      rubberBandDrag: false,
      ignoreSelector: ".kg-node, .kg-explore-hint",
      onUpdate:       () => updateProximityGlow(),
      getBounds:      () => {
        const vp = graphModal.querySelector(".kg-viewport");
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

  /* ── Bézier curve helpers (used by thread build + animations) ── */
  /** Compute a quadratic Bézier control point offset perpendicular to the
   *  line from (x1,y1)→(x2,y2).  The `idx` parameter alternates the sign
   *  so consecutive segments arc in opposite directions for a spline feel. */
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

  /** Build an SVG quadratic Bézier path `d` attribute. */
  function _curveD(x1, y1, cx, cy, x2, y2) {
    return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
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

        // Determine quadrant: education & work items use their mapped quadrant
        let quadrant = theme;
        if (theme === "education") {
          quadrant = eduQuadrantMap[item.ID] || "software";
        } else if (theme === "work") {
          quadrant = workQuadrantMap[item.ID] || "software";
        } else if (theme === "projects") {
          quadrant = projectsQuadrantMap[item.ID] || "software";
        }

        items.push({ item, category: cat, theme, quadrant, absMonth: startMo, endMonth: endMo || startMo, duration });
      });
    });

    if (items.length === 0) return;

    // Group by quadrant
    const quadrants = { robotics: [], games: [], software: [] };
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
    const centerSize = 90; // px — center node diameter
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

    // ── Temporal layout constants ─────────────────────────────
    // Compute global date range across ALL items
    const globalMin = Math.min(...items.map(it => it.absMonth));
    const globalMax = Math.max(...items.map(it => it.absMonth));
    const dateRange = Math.max(1, globalMax - globalMin);

    const MIN_DIST     = 50;    // px — minimum distance from center
    const MAX_DIST     = 300;   // px — maximum distance from center
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

      // Create node elements
      group.forEach((it, idx) => {
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
          activeWhisper: 0,    // which of the two whisper spans is currently shown
          lastWhisperIdx: -1,  // last whisper data index
          wasFocused: false,
        });
      });
    });

    // ── Create theme×quadrant threads (individual line segments with arrows) ──
    _threads = [];
    const svgNS = "http://www.w3.org/2000/svg";

    // Add a <defs> for arrowhead markers (one per overlay theme)
    let defs = _edgeSVG.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS(svgNS, "defs");
      _edgeSVG.prepend(defs);
    }

    const overlayThemes = ["work", "education", "projects"];
    const quadrantKeys  = ["robotics", "games", "software"];

    // SVG glow filter for neon thread effect
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

    // Create one arrowhead marker per overlay theme (fixed size)
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

    // Create one arrowhead marker per quadrant theme (for single-overlay coloring)
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

    // Virtual center node used as the origin for every thread's stem segment.
    // Carries the same shape as real node objects so all animation paths work.
    const _centerVirtual = {
      targetX: 0, targetY: 0,
      _newX: 0,   _newY: 0,
      r: centerSize / 2,      // 45 px
      _hidden: false,
    };

    // Create threads for each (overlayTheme, quadrant) pair with ≥2 nodes
    overlayThemes.forEach(theme => {
      const cfg = threadConfig[theme];
      if (!cfg) return;

      quadrantKeys.forEach(quadrant => {
        const threadNodes = _nodes.filter(n => n.theme === theme && n.quadrant === quadrant);
        if (threadNodes.length < 1) return;

        // Sort by end-date (oldest completion first)
        threadNodes.sort((a, b) => a.endMonth - b.endMonth);

        // Prepend center virtual node so the first segment is center → oldest node
        const nodesWithCenter = [_centerVirtual, ...threadNodes];

        // Create one line segment per consecutive pair (including center stem)
        const segments = [];
        for (let i = 1; i < nodesWithCenter.length; i++) {
          const fromNode = nodesWithCenter[i - 1];
          const toNode   = nodesWithCenter[i];

          let fromX = fromNode.targetX;
          let fromY = fromNode.targetY;
          let toX   = toNode.targetX;
          let toY   = toNode.targetY;

          // Shorten endpoints by node radii so arrows terminate at circle edge
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

          // Quadratic Bézier control point
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

          // Store current curve coords for animation interpolation
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
          nodes: nodesWithCenter,   // [center, node0, node1, …]
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

    _initPanZoom();
    _createExploreHint();
    graphBuilt = true;
  }

  /** Fit a text layer's font-size so its content fills the circle's width.
   *  Uses a binary search with a shared offscreen canvas for measuring.
   *  Emoji-only lines (line 1) are excluded from width calculation so
   *  the label text drives the font size. */
  const _fitCanvas = document.createElement("canvas").getContext("2d");
  const _emojiOnlyRe = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D\s]+$/u;
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
    // For each line, extract segments and flag emoji-only lines
    const SUP_SCALE = 0.65;
    const parsed = lines.map(line => {
      const plainText = line.replace(/<[^>]+>/g, "");
      const isEmoji = _emojiOnlyRe.test(plainText);
      const segs = [];
      const supRe = /<sup[^>]*>(.*?)<\/sup>/gi;
      let lastIdx = 0, m;
      while ((m = supRe.exec(line)) !== null) {
        if (m.index > lastIdx) segs.push({ text: line.slice(lastIdx, m.index).replace(/<[^>]+>/g, ""), isSup: false });
        segs.push({ text: m[1].replace(/<[^>]+>/g, ""), isSup: true });
        lastIdx = supRe.lastIndex;
      }
      if (lastIdx < line.length) segs.push({ text: line.slice(lastIdx).replace(/<[^>]+>/g, ""), isSup: false });
      return { segs, isEmoji };
    });
    // Only measure non-emoji lines for width fitting
    const measurable = parsed.filter(p => !p.isEmoji);
    if (measurable.length === 0) {
      // All emoji — just use maxFont
      layer.style.fontSize = Math.max(5, Math.floor(maxFont)) + "px";
      return;
    }

    // Measure the widest line at a reference font size to get a width-based
    // "effective character count" — this handles narrow glyphs (dots, "I")
    // vs wide glyphs ("W", "M") fairly, so "A.I." and "HVAC" get similar
    // visual weight despite both being 4 raw characters.
    const REF_SIZE = 20; // reference font size for measurement
    const refWidths = measurable.map(({ segs }) => {
      let w = 0;
      segs.forEach(s => {
        _fitCanvas.font = `700 ${s.isSup ? REF_SIZE * SUP_SCALE : REF_SIZE}px sans-serif`;
        w += _fitCanvas.measureText(s.text).width;
      });
      return w;
    });
    const maxRefWidth = Math.max(...refWidths);
    // Average character width at reference size ≈ 12px for bold sans-serif
    const avgCharWidth = 12;
    const effectiveChars = maxRefWidth / avgCharWidth;

    // Target fill ratio: short effective widths target well under the chord
    // so they don't balloon; long effective widths are allowed to exceed
    // the chord (>100%) to push the font size up for uniform visual weight.
    const fillRatio = effectiveChars <= 2 ? 0.50
                    : effectiveChars >= 9 ? 1.18
                    : 0.50 + (effectiveChars - 2) / 7 * (1.18 - 0.50);
    const targetWidth = usable * fillRatio;

    // Binary search: fit the widest line to targetWidth
    let lo = 5, hi = circleSize * 0.5;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      const maxW = Math.max(...measurable.map(({ segs }) => {
        let w = 0;
        segs.forEach(s => {
          _fitCanvas.font = `700 ${s.isSup ? mid * SUP_SCALE : mid}px sans-serif`;
          w += _fitCanvas.measureText(s.text).width;
        });
        return w;
      }));
      if (maxW > targetWidth) hi = mid;
      else lo = mid;
    }
    layer.style.fontSize = Math.max(5, Math.floor(lo)) + "px";
  }

  /** Break a plain-text label into <br>-separated lines for circle display.
   *  Handles camelCase, parenthesized groups, &, and spaces.
   *
   *  "BitNaughts"              → "Bit<br>Naughts"
   *  "MACES (NASA MUREP)"      → "MACES<br>(NASA<br>MUREP)"
   *  "CITRIS & Banatao Institute" → "CITRIS &<br>Banatao<br>Institute"
   *  "MotleyMoves"             → "Motley<br>Moves"
   *  "CSE 180"                 → "CSE<br>180"
   *  "Dog_Park"               → "Dog Park"                (underscore = non-breaking space)
   *  "AzureMLOps"              → "Azure<br>MLOps"
   *  "DigestQuest"             → "Digest<br>Quest"
   *  "GasLeek"                 → "Gas<br>Leek"               (camelCase)
   *  "Red_Tie Robotics (FRC 1458)" → "Red Tie<br>Robotics<br>(FRC 1458)"
   *  "Summer_of Game_Design"   → "Summer of<br>Game Design"
   */
  function _graphBreakText(text) {
    if (!text) return "";

    // ── Explicit overrides: plain-text name → exact circle display ──
    // When auto-breaking produces too many lines, add the name here.
    const nameBreaks = {
      "Red Tie Robotics":             "Red Tie<br>Robotics",
      "Summer of Game Design":        "Summer of<br>Game Design",
      "CITRIS & Banatao Institute":   "CITRIS",
      "VICE Lab":                     "VICE<br>Lab",
      "ANDES Lab":                    "ANDES<br>Lab",
      "Alamo Robotics":               "Alamo<br>Robotics",
      "Dog Park":                     "Dog<br>Park",
      "IoT Panel":                    "IoT<br>Panel",
      "AMAX ESD":                     "AMAX<br>ESD",
      "CSE 180":                     "CSE<br>180",
      "CSE 165":                     "CSE<br>165",
      "CSE 160":                     "CSE<br>160",
      "CSE 120":                     "CSE<br>120",
      "CSE 111":                     "CSE<br>111",
      "CSE 100":                     "CSE<br>100",
      "CSE 31":                      "CSE<br>31",
      "CSE 30":                      "CSE<br>30",
      "CSE 15":                      "CSE<br>15",
      "AP Java":                     "AP<br>Java",
      "ROP Game Design":             "ROP<br>Game<br>Design",
      "ROP Architecture":            "ROP<br>Archi-<br>tecture",
      "SRIRACHA":                   "SRIR-<br>ACHA",
      "ChemisTRY":                   "Chem-<br>isTRY",
      "VooDoo":                       "Voo-<br>Doo",
      "SeeRäuber":                    "Sea-<br>Räuber",
      "AzureMLOps":                   "Azure<br>MLOps",
      "BitNaughts":                   "BitNaughts",
      "GISt":                         "GISt",
      "SpaceNinjas":                  "Space<br>Ninjas",
      "SMARTank":                     "SMART<br>Tank",
      "The Nobles":                   "Nobles",
      "The Demons":                   "Demons",
    };
    if (nameBreaks[text]) return nameBreaks[text];

    // Step 1: Insert soft markers at camelCase boundaries (skip short ≤4 words)
    //   lowerUpper:  "LearnBEAT" → "Learn|BEAT"
    //   upperUpperLower: "ChemisTRY" → stays (≤8, no match)
    let s = text.replace(/\S+/g, w => w.length <= 4 ? w
      : w.replace(/([a-z])([A-Z])/g, "$1\x00$2")
          .replace(/([A-Z]+)([A-Z][a-z])/g, "$1\x00$2")
    );

    // Step 2: Insert soft markers at spaces, but keep "&" glued to the word before it
    //   "CITRIS & Banatao" → "CITRIS &|Banatao"
    s = s.replace(/\s*&\s*/g, " &\x00");
    s = s.replace(/\s+/g, "\x00");

    // Step 3: Break before opening parens
    //   "(NASA" stays together, but gets its own line
    s = s.replace(/\x00?\(/g, "\x00(");

    // Step 4: Split on markers, rejoin with <br>
    const tokens = s.split("\x00").filter(Boolean);
    return tokens.join("<br>");
  }

  /** Build a single node DOM element (circular, sized by duration) */
  function buildNodeElement(it) {
    const { item, category, theme, quadrant } = it;
    // Items from games.csv always use green; education keeps yellow; others use overlay theme color.
    const cfg = category === "games" ? themeConfig.games : theme === "education" ? themeConfig.education : theme === "work" ? themeConfig.work : theme === "projects" ? themeConfig.projects : (themeConfig[quadrant] || themeConfig.software);
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
    // border-color handled by CSS states (resting / in-focus / hover)

    // ── Build graph-friendly multi-line name from clean CSV source ──
    // Rules applied in order:
    //   1. Strip all HTML tags (including <br>, <i>, etc.)
    //   2. Split leading emoji onto its own line
    //   3. Break at camelCase boundaries (e.g. BitNaughts → Bit Naughts)
    //   4. Break before opening parens: "MACES (NASA MUREP)" → "MACES|(NASA|MUREP)"
    //   5. Break at spaces, "&", and remaining word boundaries
    const rawName = (item.NAME || "")
      .replace(/<[^>]+>/g, " ")                    // strip ALL HTML tags
      .replace(/[ \t]+/g, " ")                     // collapse whitespace
      .trim();
    // Split leading emoji(s) from the rest of the text
    const emojiRe = /^([\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]+(?:\s*[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]+)*)\s*/u;
    const emojiMatch = rawName.match(emojiRe);
    const emojiPrefix = emojiMatch ? emojiMatch[1] : "";
    const textPart = emojiMatch ? rawName.slice(emojiMatch[0].length) : rawName;

    // Break text into tokens for circle display
    const graphName = _graphBreakText(textPart);
    const cleanName = emojiPrefix
      ? emojiPrefix + "<br>" + graphName
      : graphName;
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
      fitTextToCircle(nameLayer, size, size * 0.50);
      whisperLayers.forEach(wl => fitTextToCircle(wl, size, size * 0.50));
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
    });

    // Reset threads to invisible for entrance
    _threads.forEach(th => {
      th.segments.forEach(seg => {
        seg.style.opacity = "0";
      });
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

        // Clear transition after animation
        setTimeout(() => {
          n.el.style.transition = "";
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

    // Fade in threads alongside nodes using JS-driven opacity
    const fadeDur = 500;
    const fadeStart = performance.now() + 250; // delay so nodes appear first
    function fadeThreads(now) {
      let t = (now - fadeStart) / fadeDur;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      // Smooth ease-in-out (cubic)
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

  /* ═════════════════════════════════════════════════════════════
     CAMERA FIT — Smooth animated fit to visible nodes
     Uses shared animateCameraFit() from viz.js
     ═════════════════════════════════════════════════════════════ */
  let _cameraHandle = null;  // current animateCameraFit handle

  /** Compute bounding box of all visible (non-hidden) nodes, then
   *  smoothly animate the camera to fit them in the viewport. */
  function fitVisibleNodes(animate) {
    const viewport = graphModal.querySelector(".kg-viewport");
    if (!viewport || _nodes.length === 0) return;
    const visible = _nodes.filter(n => !n._hidden);
    if (visible.length === 0) return;

    // Compute world-space bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    visible.forEach(n => {
      const r = n.r || 30;
      if (n.targetX - r < minX) minX = n.targetX - r;
      if (n.targetX + r > maxX) maxX = n.targetX + r;
      if (n.targetY - r < minY) minY = n.targetY - r;
      if (n.targetY + r > maxY) maxY = n.targetY + r;
    });
    // Include center node
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

  /* ═════════════════════════════════════════════════════════════
     "TRAVERSE THE GRAPH" — Scripted tour animation
     Progressively builds the graph by activating filters one
     at a time, fitting the camera at each step.
     ═════════════════════════════════════════════════════════════ */
  let _tourTimers = [];
  let _touring = false;
  let _tourShowNames = false; // when true during tour, show titles instead of whispers
  let _tourGen = 0;  // generation counter to invalidate stale timers

  const TOUR_DEFAULT = '<strong>Traverse</strong><span class="scroll-arrow">\uD83D\uDD2D</span>';

  // Tour step definitions: [quadrantFilters..., overlayFilters...]
  // Each step adds one filter. The order tells the story:
  // Software education → +work → +projects → Robotics edu → +work → +projects → Games edu → +work → +projects
  const TOUR_STEPS = [
    { add: ["software", "education"],  label: "💻🎓" },
    { add: ["work"],                   label: "💻💼" },
    { add: ["projects"],               label: "💻🚀" },
    { add: ["robotics"],               label: "🤖🎓" },
    { add: ["work"],                   label: "🤖💼" },
    { add: ["projects"],               label: "🤖🚀" },
    { add: ["games"],                  label: "🎮🎓" },
    { add: ["work"],                   label: "🎮💼" },
    { add: ["projects"],               label: "🎮🚀" },
  ];

  var _hintCF = createCrossfader();

  function setHintLabelKG(label) {
    var hint = graphModal.querySelector(".kg-explore-hint");
    if (!hint) return;
    var html = '<span class="scroll-arrow">' + label + '</span>';
    _hintCF.fade(hint, html);
  }

  /** Glow the filter pills that match the current tour step's active filters */
  function glowFilterPills() {
    // Remove prior glow from all pills
    graphModal.querySelectorAll(".kg-filter-glow").forEach(function (el) {
      el.classList.remove("kg-filter-glow");
    });
    // Add glow to each active filter's pill
    activeFilters.forEach(function (f) {
      var pill = graphModal.querySelector('.kg-filter[data-filter="' + f + '"]');
      if (pill) {
        // Force animation restart by re-adding class on next frame
        void pill.offsetWidth;
        pill.classList.add("kg-filter-glow");
      }
    });
  }

  function resetHintLabelKG() {
    var hint = graphModal.querySelector(".kg-explore-hint");
    if (!hint) return;
    if (_touring) {
      _hintCF.fade(hint, TOUR_DEFAULT, function () { hint.classList.remove("exploring"); });
    } else {
      hint.innerHTML = TOUR_DEFAULT;
      hint.classList.remove("exploring");
    }
  }

  function stopTour() {
    _tourGen++;
    _tourTimers.forEach(t => clearTimeout(t));
    _tourTimers = [];
    _touring = false;
    _tourShowNames = false;
    if (_cameraHandle) { _cameraHandle.cancel(); _cameraHandle = null; }
    // Remove filter pill glow
    graphModal.querySelectorAll(".kg-filter-glow").forEach(function (el) { el.classList.remove("kg-filter-glow"); });
    // Restore all filters
    allThemes.forEach(t => activeFilters.add(t));
    _filterSys.syncUI();
    applyFilter();
    resetHintLabelKG();
  }

  function startTour() {
    if (!graphBuilt) return;

    // If already touring, cancel and reset
    if (_touring) {
      stopTour();
      return;
    }

    _tourGen++;
    var gen = _tourGen;
    _touring = true;

    var hint = graphModal.querySelector(".kg-explore-hint");
    if (hint) {
      hint.innerHTML = "";
      hint.classList.add("exploring");
    }

    // Step timing
    var STEP_DELAY = 6000;    // ms between steps (4s titles + 1s crossfade + 1s whispers)
    var RELAYOUT_SETTLE = 700; // ms for relayout spring animation to settle
    var cumulative = 0;

    // Start: show only the first step's state (software + education)
    // Avoid clearing all filters (impossible UI state). Instead, set exact state.
    allThemes.forEach(function (t) { activeFilters.delete(t); });
    activeFilters.add("software");
    activeFilters.add("education");
    _filterSys.syncUI();
    applyFilter();

    // Execute step 0 immediately after a brief pause for entrance to clear
    var initialDelay = 300;

    TOUR_STEPS.forEach(function (step, idx) {
      var delay = initialDelay + idx * STEP_DELAY;

      _tourTimers.push(setTimeout(function () {
        if (!_touring || gen !== _tourGen) return;

        // Set exact filter state for this step (no clear → always valid UI state):
        // Remove all first, then add only what this step needs.
        allThemes.forEach(function (t) { activeFilters.delete(t); });

        // Determine which quadrant is active (only one at a time)
        if (idx < 3)       activeFilters.add("software");
        else if (idx < 6)  activeFilters.add("robotics");
        else               activeFilters.add("games");

        // Overlay: one at a time per step within each phase
        var phaseStep = idx % 3;
        if (phaseStep === 0) activeFilters.add("education");
        else if (phaseStep === 1) activeFilters.add("work");
        else activeFilters.add("projects");

        _tourShowNames = true;
        _filterSys.syncUI();
        applyFilter();
        glowFilterPills();

        // Update hint label
        setHintLabelKG(step.label);

        // After relayout settles, fit camera to visible nodes
        _tourTimers.push(setTimeout(function () {
          if (!_touring || gen !== _tourGen) return;
          fitVisibleNodes(true);
        }, RELAYOUT_SETTLE));

        // At 4s: crossfade from titles to whispers (1s transition, then 1s whisper display)
        _tourTimers.push(setTimeout(function () {
          if (!_touring || gen !== _tourGen) return;
          _tourShowNames = false;
          updateProximityGlow();
        }, 4000));

      }, delay));
    });

    // Final step: after all steps complete, mark tour as done
    var totalDuration = initialDelay + TOUR_STEPS.length * STEP_DELAY + RELAYOUT_SETTLE + 800;
    _tourTimers.push(setTimeout(function () {
      if (!_touring || gen !== _tourGen) return;
      _touring = false;
      _tourShowNames = false;
      // Remove filter pill glow
      graphModal.querySelectorAll(".kg-filter-glow").forEach(function (el) { el.classList.remove("kg-filter-glow"); });
      // Restore all filters after tour completes
      allThemes.forEach(function (t) { activeFilters.add(t); });
      _filterSys.syncUI();
      applyFilter();
      resetHintLabelKG();
      // Smooth camera pull-back to show the full graph
      setTimeout(function () { fitVisibleNodes(true); }, 400);
    }, totalDuration));
  }

  /* ── Create explore hint button (dynamically, matching mermaid-view pattern) ── */
  function _createExploreHint() {
    const viewport = graphModal.querySelector(".kg-viewport");
    if (!viewport) return;

    const hint = document.createElement("div");
    hint.className = "kg-explore-hint scroll-hint";
    hint.innerHTML = TOUR_DEFAULT;
    hint.style.cursor = "pointer";
    hint.addEventListener("click", function (e) {
      e.preventDefault();
      startTour();
    });

    // Stop tour on user pan/zoom interaction
    viewport.addEventListener("pointerdown", function (e) {
      if (_touring && !e.target.closest(".kg-explore-hint")) stopTour();
    });
    viewport.addEventListener("wheel", function () {
      if (_touring) stopTour();
    }, { passive: true });

    viewport.appendChild(hint);
  }

  // Stop tour on modal close
  const _origClose = closeKnowledgeModal;
  window.closeKnowledgeModal = function () {
    if (_touring) stopTour();
    _origClose();
  };

  // Stop tour on filter button click (via user interaction, not syncUI)
  themeBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (_touring) stopTour();
    });
  });
  if (allBtn) {
    allBtn.addEventListener("click", function () {
      if (_touring) stopTour();
    });
  }
})();
