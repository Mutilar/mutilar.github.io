// ═══════════════════════════════════════════════════════════════
//  CONSTELLATION MAP — Tech adjacency network visualization
//
//  A force-directed bipartite graph where:
//    • TECH nodes  = languages, frameworks, tools, platforms
//    • PROJECT nodes = portfolio items that use those techs
//    • EDGES connect projects to the techs they use
//
//  Two techs used together in a project become visually adjacent.
//  Clusters emerge organically: a Microsoft/Azure cluster, a
//  hardware/Arduino cluster, a Unity/C# game-dev cluster, etc.
//
//  Answers: "What can you build with?" — the question none of
//  the other three visualizations (timeline, skill tree, mermaid)
//  address.
//
//  Depends on: VIZ.JS  (initPanZoom, createFilterSystem,
//                        createExploreHint, animateCameraFit,
//                        createLayoutToggle, createCrossfader,
//                        createTourEngine,
//                        VIZ_THEMES, VIZ_DOMAIN_MAP)
//              MODALS.JS (toggleModal, openModal)
//              DATA.JS   (modalState, portfolioDataReady event)
// ═══════════════════════════════════════════════════════════════
(() => {
  /* ─── DOM refs ──────────────────────────────────────────── */
  const mapModal      = document.getElementById("map-modal");
  const mapModalClose = document.getElementById("mapModalClose");
  if (!mapModal || !mapModalClose) return;

  /* ─── Tech taxonomy ─────────────────────────────────────── */
  //
  // Each tech tag maps to a category for coloring & filtering.
  // Categories align with VIZ_THEMES where possible.
  //
  //   lang      → Languages         (color: software blue)
  //   framework → Frameworks & SDKs (color: research gold)
  //   platform  → Platforms & infra  (color: robotics red)
  //   tool      → Programs & tools   (color: games green)
  //
  const TECH_CATEGORIES = {
    lang:      { color: "0,120,212",  label: "Languages",  emoji: "📝" },
    tool:      { color: "127,186,0",  label: "Tools",      emoji: "🔧" },
    framework: { color: "255,185,0",  label: "Frameworks", emoji: "🧩" },
    platform:  { color: "242,80,34",  label: "Platforms",  emoji: "☁️" },
  };

  // Master tag registry: tag → { cat, label, emoji? }
  // Tags are matched case-insensitively against item TEXT fields.
  const TECH_TAGS = {
    // ── Languages ────────────────────────────────────────────
    "c":           { cat: "lang", label: "C",         whisper: "⚙️" },
    "c++":         { cat: "lang", label: "C++",       whisper: "🏎️" },
    "c#":          { cat: "lang", label: "C#",        whisper: "🎵" },
    "python":      { cat: "lang", label: "Python",    whisper: "🐍" },
    "javascript":  { cat: "lang", label: "JS",        whisper: "⚡" },
    "typescript":  { cat: "lang", label: "TS",        whisper: "🛡️" },
    "golang":      { cat: "lang", label: "Go",        whisper: "🐹" },
    "go":          { cat: "lang", label: "Go",        whisper: "🐹" },
    "rust":        { cat: "lang", label: "Rust",      whisper: "🦀" },
    "java":        { cat: "lang", label: "Java",      whisper: "♨️" },
    "kotlin":      { cat: "lang", label: "Kotlin",    whisper: "🟣" },
    "html":        { cat: "lang", label: "HTML",      whisper: "🌐" },
    "css":         { cat: "lang", label: "CSS",       whisper: "🎨" },
    "sql":         { cat: "lang", label: "SQL",       whisper: "🗄️" },
    "r":           { cat: "lang", label: "R",         whisper: "📊" },
    "fortran":     { cat: "lang", label: "Fortran",   whisper: "🧮" },
    "fortran90":   { cat: "lang", label: "Fortran",   whisper: "🧮" },
    "mips":        { cat: "lang", label: "MIPS",      whisper: "🔩" },
    "nesc":        { cat: "lang", label: "nesC",      whisper: "📡" },
    "shaderlab":   { cat: "lang", label: "ShaderLab", whisper: "🌈" },
    "hlsl":        { cat: "lang", label: "HLSL",      whisper: "💠" },
    "vb.net":      { cat: "lang", label: "VB.NET",    whisper: "🪟" },

    // ── Frameworks & SDKs ────────────────────────────────────
    ".net":        { cat: "framework", label: ".NET",        whisper: "🟦" },
    "react":       { cat: "framework", label: "React",       whisper: "⚛️" },
    "node.js":     { cat: "framework", label: "Node.js",     whisper: "💚" },
    "node":        { cat: "framework", label: "Node.js",     whisper: "💚" },
    "express":     { cat: "framework", label: "Express",     whisper: "🚂" },
    "jquery":      { cat: "framework", label: "jQuery",      whisper: "💲" },
    "ros":         { cat: "framework", label: "ROS",         whisper: "🤖" },
    "cmake":       { cat: "framework", label: "CMake",       whisper: "🏗️" },
    "bazel":       { cat: "framework", label: "Bazel",       whisper: "🧱" },
    "envoy":       { cat: "framework", label: "Envoy",       whisper: "📨" },
    "keras":       { cat: "framework", label: "Keras",       whisper: "🧠" },
    "tensorflow":  { cat: "framework", label: "TensorFlow",  whisper: "🔶" },
    "pixi.js":     { cat: "framework", label: "Pixi.JS",     whisper: "🧚" },
    "vuforia":     { cat: "framework", label: "Vuforia",     whisper: "👁️" },
    "ar.js":       { cat: "framework", label: "AR.JS",       whisper: "📱" },
    "mapbox":      { cat: "framework", label: "Mapbox",      whisper: "🗺️" },
    "chart.js":    { cat: "framework", label: "Chart.js",    whisper: "📈" },
    "chartist":    { cat: "framework", label: "Chartist",    whisper: "📉" },
    "jest":        { cat: "framework", label: "Jest",        whisper: "🃏" },
    "lgpio":       { cat: "framework", label: "lgpio",       whisper: "📌" },
    "libfreenect": { cat: "framework", label: "libfreenect",  whisper: "📷" },
    "tesseract":   { cat: "framework", label: "Tesseract",   whisper: "🔍" },
    "tortoise":    { cat: "framework", label: "TorToiSe",    whisper: "🐢" },
    "drupal":      { cat: "framework", label: "Drupal",      whisper: "💧" },
    "openscad":    { cat: "framework", label: "OpenSCAD",    whisper: "📐" },
    "mean":        { cat: "framework", label: "MEAN",        whisper: "🥞" },

    // ── Platforms & infra ────────────────────────────────────
    "azure":         { cat: "platform", label: "Azure",          whisper: "🔷" },
    "azure functions": { cat: "platform", label: "Azure Functions", whisper: "⛅" },
    "gcp":           { cat: "platform", label: "GCP",            whisper: "☁️" },
    "aws":           { cat: "platform", label: "AWS",            whisper: "🟠" },
    "github pages":  { cat: "platform", label: "GitHub Pages",   whisper: "🐙" },
    "mongodb":       { cat: "platform", label: "MongoDB",        whisper: "🍃" },
    "redis":         { cat: "platform", label: "Redis",          whisper: "🔴" },
    "docker":        { cat: "platform", label: "Docker",         whisper: "🐳" },
    "kubernetes":    { cat: "platform", label: "K8s",            whisper: "☸️" },
    "linux":         { cat: "platform", label: "Linux",          whisper: "🐧" },
    "raspberry pi":  { cat: "platform", label: "RPi",            whisper: "🍓" },
    "arduino":       { cat: "platform", label: "Arduino",        whisper: "🔌" },
    "bluetooth":     { cat: "platform", label: "Bluetooth",      whisper: "📶" },
    "sqlite":        { cat: "platform", label: "SQLite",         whisper: "🪶" },
    "influxdb":      { cat: "platform", label: "InfluxDB",       whisper: "⏱️" },
    "dynamodb":      { cat: "platform", label: "DynamoDB",       whisper: "🦕" },
    "alexa":         { cat: "platform", label: "Alexa",          whisper: "🗣️" },

    // ── Programs & tools ─────────────────────────────────────
    "unity":         { cat: "tool", label: "Unity",          whisper: "🎮" },
    "unity3d":       { cat: "tool", label: "Unity",          whisper: "🎮" },
    "grafana":       { cat: "tool", label: "Grafana",        whisper: "🔥" },
    "powerbi":       { cat: "tool", label: "PowerBI",        whisper: "📋" },
    "autocad":       { cat: "tool", label: "AutoCAD",        whisper: "📏" },
    "revit":         { cat: "tool", label: "Revit",          whisper: "🏛️" },
    "git":           { cat: "tool", label: "Git",            whisper: "🌿" },
    "android studio": { cat: "tool", label: "Android Studio", whisper: "📲" },
    "google earth engine": { cat: "tool", label: "GEE",      whisper: "🌍" },
    "jupyter":       { cat: "tool", label: "Jupyter",        whisper: "📓" },
    "webgl":         { cat: "tool", label: "WebGL",          whisper: "🔺" },
    "paint.net":     { cat: "tool", label: "Paint.NET",      whisper: "🖌️" },
    "audacity":      { cat: "tool", label: "Audacity",       whisper: "🎧" },
  };

  // Dedup: merge aliases that share the same label
  // e.g. "node.js" and "node" both → "Node.js"
  function _canonicalTag(tag) {
    var entry = TECH_TAGS[tag.toLowerCase()];
    return entry ? entry.label : null;
  }

  /* ─── Constants ─────────────────────────────────────────── */
  const TECH_R        = 28;   // tech node radius
  const PROJECT_R     = 18;   // project node radius
  const SIM_ITERS     = 400;  // force simulation iterations
  const SIM_CHUNK     = 50;   // iterations per rAF frame (avoids jank)
  const SIM_ALPHA     = 0.3;  // initial simulation temperature
  const LINK_DISTANCE = 180;  // ideal spring length
  const REPULSION     = 3000; // charge repulsion strength
  const CENTER_FORCE  = 0.006;// pull toward center
  const MIN_SCALE     = VIZ_MIN_SCALE;
  const MAX_SCALE     = 2;

  /* ─── State ─────────────────────────────────────────────── */
  let built = false;
  let _nodes = [];         // all nodes (tech + project)
  let _techNodes = [];     // tech nodes only
  let _projectNodes = [];  // project nodes only
  let _links = [];         // { source, target, el }
  let _transform = { x: 0, y: 0, scale: 1 };
  let _graphWorld = null;
  let _edgeSVG = null;
  let _pz = null;
  let _hoveredNode = null;
  let _layoutToggle = null;  // createLayoutToggle instance
  let _mapTour = null;       // createTourEngine instance
  let _tourShowNames = false; // false | "tech" | "domain"
  let _tourStepType  = null;  // "tech" | "domain" — current tour phase

  // Domain filter state (same axis as timeline: robotics/games/software/research/education)
  const DOMAIN_THEMES = ["robotics", "games", "software", "research", "education"];
  let activeFilters = new Set(DOMAIN_THEMES);
  let _filterSys = null;
  let _techFilterSys = null;

  // Tech category filter state
  const TECH_CAT_KEYS = Object.keys(TECH_CATEGORIES);
  let activeTechFilters = new Set(TECH_CAT_KEYS);

  /* ─── Open / close ──────────────────────────────────────── */
  function openMapModal() {
    if (_filterSys) _filterSys.setAll();
    if (_techFilterSys) _techFilterSys.setAll();
    toggleModal(mapModal, true);
    if (!built) {
      // Wait for data if not yet loaded
      if (!_hasData()) {
        window.addEventListener("portfolioDataReady", function once() {
          window.removeEventListener("portfolioDataReady", once);
          _build();
        });
      } else {
        _build();
      }
    } else {
      _applyFilters();
      _updateTransform();
    }
  }

  function closeMapModal() {
    if (_mapTour && _mapTour.isTouring()) _mapTour.stop();
    toggleModal(mapModal, false);
  }

  mapModalClose.addEventListener("click", closeMapModal);
  mapModal.addEventListener("click", e => { if (e.target === mapModal) closeMapModal(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && mapModal.classList.contains("open")) closeMapModal();
  });

  // Expose global open function (for onclick triggers in HTML)
  window.openMapModal = openMapModal;

  function _hasData() {
    return modalState && (
      (modalState.work && modalState.work.length) ||
      (modalState.projects && modalState.projects.length)
    );
  }

  /* ═════════════════════════════════════════════════════════
     TECH EXTRACTION — Parse TEXT field for tech mentions
     ═════════════════════════════════════════════════════════ */
  function _extractTechs(item) {
    var found = new Set();

    // 1) Explicit TECH emoji string (e.g. "🍃⚛️💚" → MongoDB, React, Node.js)
    if (item.TECH) {
      _parseTechEmojis(item.TECH).forEach(function (l) { found.add(l); });
    }

    // 2) Text-based extraction (scan TEXT/TITLE/MOTTO for tag mentions)
    var text = (item.TEXT || "") + " " + (item.TITLE || "") + " " + (item.MOTTO || "");
    // Strip HTML tags for cleaner matching
    text = text.replace(/<[^>]+>/g, " ");

    // Sort tags longest-first so "azure functions" matches before "azure"
    var sortedTags = Object.keys(TECH_TAGS).sort((a, b) => b.length - a.length);

    sortedTags.forEach(tag => {
      // Word-boundary-ish match (case insensitive)
      var escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      var re = new RegExp("(?:^|[\\s,;:(/])(" + escaped + ")(?=[\\s,;:)/.,!?]|$)", "i");
      if (re.test(text)) {
        var canonical = TECH_TAGS[tag].label;
        found.add(canonical);
      }
    });

    return Array.from(found);
  }

  // Reverse lookup: canonical label → TECH_TAGS entry
  function _techMeta(canonicalLabel) {
    for (var tag in TECH_TAGS) {
      if (TECH_TAGS[tag].label === canonicalLabel) return TECH_TAGS[tag];
    }
    return { cat: "tool", label: canonicalLabel };
  }

  // Reverse lookup: canonical label → whisper emoji
  function _techWhisper(canonicalLabel) {
    for (var tag in TECH_TAGS) {
      if (TECH_TAGS[tag].label === canonicalLabel) return TECH_TAGS[tag].whisper || null;
    }
    return null;
  }

  // Build reverse map: whisper emoji → canonical label
  // Used to decode item.TECH emoji strings from PORTFOLIO.json
  var _whisperToLabel = {};
  (function () {
    var seen = {};
    for (var tag in TECH_TAGS) {
      var entry = TECH_TAGS[tag];
      if (entry.whisper && !seen[entry.label]) {
        _whisperToLabel[entry.whisper] = entry.label;
        seen[entry.label] = true;
      }
    }
  })();

  // Parse an emoji string like "🍃⚛️💚" into canonical tech labels
  function _parseTechEmojis(emojiStr) {
    if (!emojiStr) return [];
    var labels = [];
    // Segment the string into individual emoji (emoji can be multi-codepoint)
    // Try matching against known whispers, longest-first
    var whispers = Object.keys(_whisperToLabel).sort(function (a, b) { return b.length - a.length; });
    var remaining = emojiStr;
    while (remaining.length > 0) {
      var matched = false;
      for (var i = 0; i < whispers.length; i++) {
        if (remaining.indexOf(whispers[i]) === 0) {
          labels.push(_whisperToLabel[whispers[i]]);
          remaining = remaining.slice(whispers[i].length);
          matched = true;
          break;
        }
      }
      if (!matched) {
        // Skip one character (possibly whitespace or unknown)
        remaining = remaining.slice(1);
      }
    }
    return labels;
  }

  /* ═════════════════════════════════════════════════════════
     BUILD — Construct the bipartite force-directed graph
     ═════════════════════════════════════════════════════════ */
  function _build() {
    _graphWorld = mapModal.querySelector(".viz-world");
    _edgeSVG    = mapModal.querySelector(".map-edges");
    if (!_graphWorld || !_edgeSVG) return;

    var svgNS = "http://www.w3.org/2000/svg";

    // ── Collect all portfolio items (skip mtg section) ────
    var items = [];
    var sections = ["marp", "bitnaughts", "work", "education", "projects", "hackathons", "games"];
    var seenIDs = new Set();
    sections.forEach(sec => {
      var arr = modalState[sec];
      if (!arr) return;
      arr.forEach(item => {
        if (seenIDs.has(item.ID)) return;
        seenIDs.add(item.ID);
        items.push(item);
      });
    });

    // ── Extract tech adjacency ───────────────────────────
    var techSet = {};      // canonical label → { count, cat, projects[] }
    var linkData = [];     // { techLabel, projectID }

    items.forEach(item => {
      var techs = _extractTechs(item);
      techs.forEach(t => {
        if (!techSet[t]) {
          var meta = _techMeta(t);
          techSet[t] = { count: 0, cat: meta.cat, projects: [] };
        }
        techSet[t].count++;
        techSet[t].projects.push(item.ID);
        linkData.push({ techLabel: t, projectID: item.ID });
      });
    });

    // ── Create SVG glow filter ───────────────────────────
    var glowId = "map-glow";
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

    // ── Count connections per project ───────────────────
    var projConnCount = {};
    linkData.forEach(l => {
      projConnCount[l.projectID] = (projConnCount[l.projectID] || 0) + 1;
    });

    // ── Create tech nodes ────────────────────────────────
    var techLabels = Object.keys(techSet);
    _techNodes = techLabels.map((label, i) => {
      var info = techSet[label];
      var catInfo = TECH_CATEGORIES[info.cat] || TECH_CATEGORIES.tool;
      var r = TECH_R + Math.min(info.count * 3, 22); // scale by # of connections

      var el = document.createElement("div");
      el.className = "kg-node map-node map-tech-node";
      el.style.setProperty("--tc", catInfo.color);
      el.style.setProperty("--kg-size", (r * 2) + "px");
      el.style.setProperty("--kg-font", Math.max(7, Math.min(11, r * 0.35)) + "px");
      var techWhisper = _techWhisper(label) || catInfo.emoji;
      el.innerHTML =
        '<div class="kg-node-accent"></div>' +
        '<div class="kg-node-name">' +
          '<span class="kg-name-layer map-face-default">' + techWhisper + '</span>' +
          '<span class="kg-name-layer map-face-alt">' + label + '</span>' +
        '</div>';
      el.title = label + " (" + info.count + " project" + (info.count !== 1 ? "s" : "") + ")";

      _graphWorld.appendChild(el);

      // Scatter initial positions — techs start near center
      var angle = (i / techLabels.length) * Math.PI * 2;
      var spread = 80 + Math.random() * 60;

      return {
        el: el,
        id: "tech:" + label,
        label: label,
        type: "tech",
        cat: info.cat,
        r: r,
        projectIDs: info.projects,
        x: Math.cos(angle) * spread,
        y: Math.sin(angle) * spread,
        vx: 0, vy: 0,
        targetX: 0, targetY: 0,
        _hidden: false,
        filterKeys: { domain: new Set(), techCat: new Set([info.cat]) },
      };
    });

    // Populate tech domain sets from connected projects
    _techNodes.forEach(tn => {
      tn.projectIDs.forEach(pid => {
        var domain = VIZ_DOMAIN_MAP[pid] || "software";
        tn.filterKeys.domain.add(domain);
      });
    });

    // ── Create project nodes ─────────────────────────────
    var projectsWithTechs = new Set(linkData.map(l => l.projectID));
    _projectNodes = items.filter(item => projectsWithTechs.has(item.ID)).map((item, i) => {
      var domain = VIZ_DOMAIN_MAP[item.ID] || "software";
      var themeInfo = VIZ_THEMES[domain] || VIZ_THEMES.software;
      var connCount = projConnCount[item.ID] || 1;
      var r = PROJECT_R + Math.min(connCount * 3, 18); // scale by # of connections
      var whisper = VIZ_WHISPER_MAP[item.ID] || "";

      var el = document.createElement("div");
      el.className = "kg-node map-node map-project-node";
      el.style.setProperty("--tc", themeInfo.color);
      el.style.setProperty("--kg-size", (r * 2) + "px");
      el.style.setProperty("--kg-font", Math.max(7, Math.min(11, r * 0.35)) + "px");
      var shortName = VIZ_SHORTNAME_MAP[item.ID] || item.NAME || item.ID;
      // Strip HTML from short name for node label
      shortName = shortName.replace(/<[^>]+>/g, "");
      // Extract leading emoji (first grapheme) for default face
      var rawName = (item.NAME || item.ID).replace(/<[^>]+>/g, "");
      var emojiMatch = rawName.match(/^(\p{Extended_Pictographic}(?:\uFE0F?\u200D\p{Extended_Pictographic})*)/u);
      var emoji = emojiMatch ? emojiMatch[1] : (whisper || shortName.charAt(0));
      el.innerHTML =
        '<div class="kg-node-accent"></div>' +
        '<div class="kg-node-name">' +
          '<span class="kg-name-layer map-face-default">' + emoji + '</span>' +
          '<span class="kg-name-layer map-face-alt">' + shortName + '</span>' +
        '</div>';
      el.title = (item.NAME || item.ID).replace(/<[^>]+>/g, "");

      _graphWorld.appendChild(el);

      // Scatter initial positions — projects start on outer ring
      var angle = (i / items.length) * Math.PI * 2;
      var spread = 300 + Math.random() * 150;

      return {
        el: el,
        id: "proj:" + item.ID,
        itemID: item.ID,
        type: "project",
        domain: domain,
        item: item,
        r: r,
        x: Math.cos(angle) * spread,
        y: Math.sin(angle) * spread,
        vx: 0, vy: 0,
        targetX: 0, targetY: 0,
        _hidden: false,
        filterKeys: { domain: new Set([domain]), techCat: new Set() },
      };
    });

    // Populate project techCat sets from connected techs
    var projMap = {};
    _projectNodes.forEach(pn => { projMap[pn.itemID] = pn; });
    var techMap = {};
    _techNodes.forEach(tn => { techMap[tn.label] = tn; });

    linkData.forEach(l => {
      var pn = projMap[l.projectID];
      var tn = techMap[l.techLabel];
      if (pn && tn) pn.filterKeys.techCat.add(tn.cat);
    });

    _nodes = _techNodes.concat(_projectNodes);

    // ── Create edges (SVG paths) ─────────────────────────
    _links = linkData.map(l => {
      var source = techMap[l.techLabel];
      var target = projMap[l.projectID];
      if (!source || !target) return null;

      var catInfo = TECH_CATEGORIES[source.cat] || TECH_CATEGORIES.tool;
      var path = document.createElementNS(svgNS, "path");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "rgba(" + catInfo.color + ",0.3)");
      path.setAttribute("stroke-width", "1");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("filter", "url(#" + glowId + ")");
      path.classList.add("kg-thread", "map-edge");
      _edgeSVG.appendChild(path);

      return { source: source, target: target, el: path };
    }).filter(Boolean);

    // ── Run force simulation (chunked across frames) ──────
    _runSimulation().then(function () {
      // ── Position nodes at final positions ──────────────
      _nodes.forEach(n => {
        n.targetX = n.x;
        n.targetY = n.y;
        n.el.style.left = n.x + "px";
        n.el.style.top  = n.y + "px";
      });

      // ── Draw edges ─────────────────────────────────────
      _updateEdgePositions();

      // ── Center camera ──────────────────────────────────
      var vp = mapModal.querySelector(".viz-viewport");
      if (vp) {
        requestAnimationFrame(() => {
          _fitCamera(false);
        });
      }

      // ── Entrance animation ─────────────────────────────
      _animateEntrance();
    });

    // ── Wire up pan/zoom ─────────────────────────────────
    _initPanZoom();

    // ── Wire up filters ──────────────────────────────────
    _initFilters();

    // ── Wire up hover interactions ───────────────────────
    _initHover();

    // ── Wire up layout toggle (static ↔ dynamic) ────────
    _layoutToggle = createLayoutToggle({
      btn: "mapLayoutToggle",
      onDynamic: function () { _reLayout(); },
      onStatic:  function () { /* keep positions as-is */ },
    });

    // ── Tour engine ──────────────────────────────────────
    _initTour();

    built = true;
  }

  /* ═════════════════════════════════════════════════════════
     FORCE SIMULATION — Chunked velocity Verlet
     Spreads O(n²) iterations across rAF frames to avoid jank.
     Returns a Promise that resolves when the sim is complete.
     ═════════════════════════════════════════════════════════ */
  function _runSimulation() {
    return new Promise(function (resolve) {
      var alpha = SIM_ALPHA;
      var decay = 1 - Math.pow(0.001, 1 / SIM_ITERS);
      var iter  = 0;

      function _step() {
        var end = Math.min(iter + SIM_CHUNK, SIM_ITERS);

        for (; iter < end; iter++) {
          // ── Repulsion (all pairs) ──────────────────────
          for (var i = 0; i < _nodes.length; i++) {
            for (var j = i + 1; j < _nodes.length; j++) {
              var a = _nodes[i], b = _nodes[j];
              var dx = b.x - a.x, dy = b.y - a.y;
              var d2 = dx * dx + dy * dy || 1;
              var d = Math.sqrt(d2);
              var force = (REPULSION * alpha) / d2;
              var fx = (dx / d) * force, fy = (dy / d) * force;
              a.vx -= fx; a.vy -= fy;
              b.vx += fx; b.vy += fy;
            }
          }

          // ── Link spring force ──────────────────────────
          _links.forEach(function (link) {
            var s = link.source, t = link.target;
            var dx = t.x - s.x, dy = t.y - s.y;
            var d = Math.sqrt(dx * dx + dy * dy) || 1;
            var force = (d - LINK_DISTANCE) * 0.05 * alpha;
            var fx = (dx / d) * force, fy = (dy / d) * force;
            s.vx += fx; s.vy += fy;
            t.vx -= fx; t.vy -= fy;
          });

          // ── Category clustering ────────────────────────
          var catCentroids = {};
          _techNodes.forEach(function (n) {
            if (n._hidden) return;
            var c = n.cat;
            if (!catCentroids[c]) catCentroids[c] = { sx: 0, sy: 0, count: 0 };
            catCentroids[c].sx += n.x;
            catCentroids[c].sy += n.y;
            catCentroids[c].count++;
          });
          var CLUSTER_STRENGTH = 0.15;
          _techNodes.forEach(function (n) {
            if (n._hidden) return;
            var cc = catCentroids[n.cat];
            if (!cc || cc.count < 2) return;
            var cx = cc.sx / cc.count;
            var cy = cc.sy / cc.count;
            n.vx += (cx - n.x) * CLUSTER_STRENGTH * alpha;
            n.vy += (cy - n.y) * CLUSTER_STRENGTH * alpha;
          });

          // ── Radial bias ────────────────────────────────
          _nodes.forEach(function (n) {
            var d = Math.sqrt(n.x * n.x + n.y * n.y) || 1;
            if (n.type === "tech") {
              n.vx -= n.x * CENTER_FORCE * 3 * alpha;
              n.vy -= n.y * CENTER_FORCE * 3 * alpha;
            } else {
              var targetR = LINK_DISTANCE * 1.6;
              var radialForce = (d - targetR) * 0.003 * alpha;
              n.vx -= (n.x / d) * radialForce;
              n.vy -= (n.y / d) * radialForce;
              n.vx -= n.x * CENTER_FORCE * 0.4 * alpha;
              n.vy -= n.y * CENTER_FORCE * 0.4 * alpha;
            }
          });

          // ── Integrate ──────────────────────────────────
          _nodes.forEach(function (n) {
            n.vx *= 0.6;
            n.vy *= 0.6;
            n.x += n.vx;
            n.y += n.vy;
          });

          alpha *= (1 - decay);
        }

        if (iter < SIM_ITERS) {
          requestAnimationFrame(_step);
        } else {
          _resolveCollisions();
          resolve();
        }
      }

      requestAnimationFrame(_step);
    });
  }

  /** Hard collision resolution (post-sim). */
  function _resolveCollisions() {
    var COLLISION_PADDING = 4;
    var COLLISION_ITERS   = 80;

    for (var ci = 0; ci < COLLISION_ITERS; ci++) {
      var anyMoved = false;

      for (var i = 0; i < _nodes.length; i++) {
        var a = _nodes[i];
        if (a._hidden) continue;

        for (var j = i + 1; j < _nodes.length; j++) {
          var b = _nodes[j];
          if (b._hidden) continue;

          var dx = b.x - a.x;
          var dy = b.y - a.y;
          var dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          var minDist = a.r + b.r + COLLISION_PADDING;

          if (dist < minDist) {
            var overlap = (minDist - dist) / 2;
            var nx = dx / dist;
            var ny = dy / dist;
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
  }

  /* ─── Re-layout: re-run force sim on visible nodes ─────── */
  function _reLayout() {
    // Reset positions — techs near center, projects on outer ring
    var visTech = _nodes.filter(n => !n._hidden && n.type === "tech");
    var visProj = _nodes.filter(n => !n._hidden && n.type === "project");
    visTech.forEach((n, i) => {
      var angle = (i / visTech.length) * Math.PI * 2;
      var spread = 80 + Math.random() * 60;
      n.x = Math.cos(angle) * spread;
      n.y = Math.sin(angle) * spread;
      n.vx = 0; n.vy = 0;
    });
    visProj.forEach((n, i) => {
      var angle = (i / visProj.length) * Math.PI * 2;
      var spread = 300 + Math.random() * 150;
      n.x = Math.cos(angle) * spread;
      n.y = Math.sin(angle) * spread;
      n.vx = 0; n.vy = 0;
    });

    _runSimulation().then(function () {
      // Animate nodes to new positions
      _nodes.forEach(n => {
        if (n._hidden) return;
        n.targetX = n.x;
        n.targetY = n.y;
        n.el.style.transition = "left 0.6s ease, top 0.6s ease";
        n.el.style.left = n.x + "px";
        n.el.style.top  = n.y + "px";
        setTimeout(() => { n.el.style.transition = ""; }, 650);
      });

      _updateEdgePositions();
      setTimeout(() => _fitCamera(true), 50);
    });
  }

  /* ─── Edge position update ──────────────────────────────── */
  function _updateEdgePositions() {
    _links.forEach(link => {
      var s = link.source, t = link.target;
      var dx = t.targetX - s.targetX, dy = t.targetY - s.targetY;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / d, uy = dy / d;
      var x1 = s.targetX + ux * s.r;
      var y1 = s.targetY + uy * s.r;
      var x2 = t.targetX - ux * t.r;
      var y2 = t.targetY - uy * t.r;
      link.el.setAttribute("d", "M" + x1 + "," + y1 + " L" + x2 + "," + y2);
    });
  }

  /* ═════════════════════════════════════════════════════════
     PAN & ZOOM — Reuse VIZ.JS initPanZoom
     ═════════════════════════════════════════════════════════ */
  function _initPanZoom() {
    var vp = mapModal.querySelector(".viz-viewport");
    if (!vp) return;
    _pz = initPanZoom(vp, _graphWorld, _transform, {
      minScale: MIN_SCALE, maxScale: MAX_SCALE,
      zoomStep: [0.9, 1.1],
      bounceCurve: "cubic-bezier(0.34,1.56,0.64,1)",
      bounceDuration: 380,
      rubberBandDrag: false,
      ignoreSelector: ".kg-node, .viz-explore-hint",
      onUpdate: function () { _updateGlow(); },
      getBounds: function () {
        var vp2 = mapModal.querySelector(".viz-viewport");
        if (!vp2 || !_nodes.length) return null;
        var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        _nodes.forEach(n => {
          if (n._hidden) return;
          if (n.targetX - n.r < x0) x0 = n.targetX - n.r;
          if (n.targetX + n.r > x1) x1 = n.targetX + n.r;
          if (n.targetY - n.r < y0) y0 = n.targetY - n.r;
          if (n.targetY + n.r > y1) y1 = n.targetY + n.r;
        });
        var m = 80;
        x0 -= m; x1 += m; y0 -= m; y1 += m;
        var s = _transform.scale, pad = 0.45;
        return {
          minX: vp2.clientWidth  * pad - x1 * s,
          maxX: vp2.clientWidth  * (1 - pad) - x0 * s,
          minY: vp2.clientHeight * pad - y1 * s,
          maxY: vp2.clientHeight * (1 - pad) - y0 * s,
        };
      },
    });
  }

  function _updateTransform() {
    if (!_graphWorld) return;
    if (_pz) { _pz.update(); return; }
    _graphWorld.style.transform =
      "translate(" + _transform.x + "px," + _transform.y + "px) scale(" + _transform.scale + ")";
  }

  /* ═════════════════════════════════════════════════════════
     CAMERA FIT — Reuse VIZ.JS animateCameraFit
     ═════════════════════════════════════════════════════════ */
  function _fitCamera(animate) {
    var vp = mapModal.querySelector(".viz-viewport");
    if (!vp) return;

    // Compute bounds of visible nodes
    var visible = _nodes.filter(n => !n._hidden);
    if (!visible.length) return;

    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    visible.forEach(n => {
      if (n.targetX - n.r < x0) x0 = n.targetX - n.r;
      if (n.targetX + n.r > x1) x1 = n.targetX + n.r;
      if (n.targetY - n.r < y0) y0 = n.targetY - n.r;
      if (n.targetY + n.r > y1) y1 = n.targetY + n.r;
    });

    animateCameraFit(_transform, _updateTransform, {
      vpWidth:  vp.clientWidth,
      vpHeight: vp.clientHeight,
      bounds:   { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
      minScale: MIN_SCALE,
      maxScale: MAX_SCALE,
      padding:  60,
      duration: 800,
      animate:  animate !== false,
    });
  }

  /* ═════════════════════════════════════════════════════════
     FILTERS — Reuse VIZ.JS createFilterSystem + tech cat toggles
     ═════════════════════════════════════════════════════════ */
  function _initFilters() {
    // Domain filter (same axis as timeline)
    var domainBtns = mapModal.querySelectorAll('.viz-filter[data-filter-group="domain"]');
    var allBtn = null;
    var themeBtns = [];
    domainBtns.forEach(b => {
      if (b.dataset.filter === "all") allBtn = b;
      else themeBtns.push(b);
    });

    _filterSys = createFilterSystem({
      allThemes: DOMAIN_THEMES,
      activeFilters: activeFilters,
      allBtn: allBtn,
      themeBtns: themeBtns,
      onFilter: _applyFilters,
    });

    // Tech category filter (second row) — reuse createFilterSystem
    var techAllBtn = mapModal.querySelector('.viz-filter[data-filter-group="tech"][data-filter="all"]');
    var techItemBtns = [];
    mapModal.querySelectorAll('.viz-filter[data-filter-group="tech"]').forEach(b => {
      if (b.dataset.filter !== "all") techItemBtns.push(b);
    });

    _techFilterSys = createFilterSystem({
      allThemes: TECH_CAT_KEYS,
      activeFilters: activeTechFilters,
      allBtn: techAllBtn,
      themeBtns: techItemBtns,
      onFilter: _applyFilters,
    });
  }

  /* ─── Apply filters ─────────────────────────────────────── */
  function _applyFilters() {
    // Tech nodes: visible if their category is active AND at least
    // one of their connected projects' domains is active
    _techNodes.forEach(tn => {
      var catVisible = activeTechFilters.has(tn.cat);
      var domainVisible = false;
      tn.filterKeys.domain.forEach(d => { if (activeFilters.has(d)) domainVisible = true; });
      var hide = !catVisible || !domainVisible;
      tn._hidden = hide;
      tn.el.classList.toggle("kg-hidden", hide);
    });

    // Project nodes: visible if their domain is active AND at least
    // one of their connected techs' categories is active
    _projectNodes.forEach(pn => {
      var domainVisible = activeFilters.has(pn.domain);
      var catVisible = false;
      pn.filterKeys.techCat.forEach(c => { if (activeTechFilters.has(c)) catVisible = true; });
      var hide = !domainVisible || !catVisible;
      pn._hidden = hide;
      pn.el.classList.toggle("kg-hidden", hide);
    });

    // Edges: visible only if both endpoints are visible
    _links.forEach(link => {
      var vis = !link.source._hidden && !link.target._hidden;
      link.el.classList.toggle("kg-thread-hidden", !vis);
    });

    // In dynamic mode, re-run the force sim on visible nodes
    if (_layoutToggle && !_layoutToggle.isStatic()) {
      _reLayout();
    }

    _updateGlow();
  }

  /* ═════════════════════════════════════════════════════════
     HOVER — Highlight connected nodes/edges on mouseenter
     (Reuses kg-highlight / kg-hovering classes from skilltree CSS)
     ═════════════════════════════════════════════════════════ */
  function _initHover() {
    _nodes.forEach(node => {
      node.el.addEventListener("mouseenter", () => {
        _hoveredNode = node;
        _graphWorld.classList.add("kg-hovering");
        _edgeSVG.classList.add("kg-hovering");
        node.el.classList.add("kg-highlight");

        // Highlight connected edges and peer nodes (skip hidden)
        _links.forEach(link => {
          var peer = null;
          if (link.source === node) peer = link.target;
          else if (link.target === node) peer = link.source;
          if (peer && !peer._hidden) {
            link.el.classList.add("kg-highlight");
            peer.el.classList.add("kg-highlight");
          }
        });

        _updateGlow();
      });

      node.el.addEventListener("mouseleave", () => {
        if (_hoveredNode === node) _hoveredNode = null;
        _graphWorld.classList.remove("kg-hovering");
        _edgeSVG.classList.remove("kg-hovering");
        _graphWorld.querySelectorAll(".kg-highlight").forEach(e => e.classList.remove("kg-highlight"));
        _edgeSVG.querySelectorAll(".kg-highlight").forEach(e => e.classList.remove("kg-highlight"));
        _updateGlow();
      });

      // Click: project nodes open detail modal; tech nodes solo-filter
      node.el.addEventListener("click", e => {
        e.stopPropagation();
        if (node.type === "project" && node.item) {
          // Find which section this item belongs to
          var sectionId = _findSection(node.itemID);
          if (sectionId) openModal(sectionId, node.itemID);
        } else if (node.type === "tech") {
          // Solo-filter to this tech's category
          if (_techFilterSys) _techFilterSys.setOnly(node.cat);
        }
      });
    });
  }

  function _findSection(itemID) {
    var sections = ["marp", "bitnaughts", "work", "education", "projects", "hackathons", "games"];
    for (var i = 0; i < sections.length; i++) {
      var arr = modalState[sections[i]];
      if (arr && arr.some(item => item.ID === itemID)) return sections[i];
    }
    return null;
  }

  /* ─── Proximity glow (reuses skilltree pattern) ────────── */
  var _glowRAF = 0;
  function _glowPass() {
    var vp = mapModal.querySelector(".viz-viewport");
    if (!vp) return;
    var vw = vp.clientWidth, vh = vp.clientHeight;
    var m = 0.35;
    var left = vw * m, right = vw * (1 - m), top2 = vh * m, bottom = vh * (1 - m);

    _nodes.forEach(n => {
      var sx = n.targetX * _transform.scale + _transform.x;
      var sy = n.targetY * _transform.scale + _transform.y;
      var inCenter = sx >= left && sx <= right && sy >= top2 && sy <= bottom;
      var hovered = n === _hoveredNode;

      // During tour: focus nodes whose names should be visible
      //   tech step  → tech nodes show names, projects keep emojis
      //   domain step → project nodes show names, techs keep emojis
      var tourFocus = false;
      if (_mapTour && _mapTour.isTouring() && _tourShowNames) {
        if (_tourShowNames === "tech"  && n.type === "tech")    tourFocus = true;
        if (_tourShowNames === "domain" && n.type === "project") tourFocus = true;
      }

      var focused = (inCenter || hovered || tourFocus) && !n._hidden;
      n.el.classList.toggle("kg-in-focus", focused);
    });
  }

  function _updateGlow() {
    cancelAnimationFrame(_glowRAF);
    _glowRAF = requestAnimationFrame(_glowPass);
  }

  /* ─── Tour engine (via shared createTourEngine) ─────────── */
  const MAP_TOUR_STEPS = [
    // Phase 1: Tech categories (all domains visible)
    { techCat: ["lang"],      label: "📝 Languages" },
    { techCat: ["tool"],      label: "🔧 Tools" },
    { techCat: ["framework"], label: "🧩 Frameworks" },
    { techCat: ["platform"],  label: "☁️ Platforms" },
    // Phase 2: Domains (all tech categories visible)
    { domain: ["education"],  label: "🎓 Education" },
    { domain: ["research"],   label: "🔬 Research" },
    { domain: ["software"],   label: "💻 Software" },
    { domain: ["robotics"],   label: "🤖 Robotics" },
    { domain: ["games"],      label: "🎮 Games" },
  ];

  function _initTour() {
    var vp = mapModal.querySelector(".viz-viewport");
    if (!vp) return;

    _mapTour = createTourEngine({
      modal:     mapModal,
      viewport:  vp,
      hintLabel: '<strong>Traverse</strong><span class="scroll-arrow">🔭</span>',
      steps:     MAP_TOUR_STEPS,
      stepDelay: 2500,

      applyStep: function (step) {
        _tourStepType = step.techCat ? "tech" : "domain";
        if (step.techCat) {
          // Tech category step: show all domains, solo the tech category
          DOMAIN_THEMES.forEach(function (t) { activeFilters.add(t); });
          if (_filterSys) _filterSys.syncUI();
          activeTechFilters.clear();
          step.techCat.forEach(function (c) { activeTechFilters.add(c); });
          if (_techFilterSys) _techFilterSys.syncUI();
        } else if (step.domain) {
          // Domain step: show all tech categories, solo the domain
          TECH_CAT_KEYS.forEach(function (k) { activeTechFilters.add(k); });
          if (_techFilterSys) _techFilterSys.syncUI();
          activeFilters.clear();
          step.domain.forEach(function (d) { activeFilters.add(d); });
          if (_filterSys) _filterSys.syncUI();
        }
        _applyFilters();
      },

      resetAll: function () {
        _tourStepType = null;
        DOMAIN_THEMES.forEach(function (t) { activeFilters.add(t); });
        TECH_CAT_KEYS.forEach(function (k) { activeTechFilters.add(k); });
        if (_filterSys) _filterSys.syncUI();
        if (_techFilterSys) _techFilterSys.syncUI();
        _applyFilters();
      },

      fitCamera: function () { _fitCamera(true); },

      setShowNames: function (show) {
        _tourShowNames = show ? _tourStepType : false;
        _updateGlow();
      },

      updateGlow: function () { _updateGlow(); },

      glowPills: function () {
        mapModal.querySelectorAll(".viz-filter-glow").forEach(function (el) {
          el.classList.remove("viz-filter-glow");
        });
        // Glow active tech-cat pills
        activeTechFilters.forEach(function (c) {
          var pill = mapModal.querySelector('.viz-filter[data-filter-group="tech"][data-filter="' + c + '"]');
          if (pill) {
            void pill.offsetWidth;
            pill.classList.add("viz-filter-glow");
          }
        });
        // Glow active domain pills
        activeFilters.forEach(function (d) {
          var pill = mapModal.querySelector('.viz-filter[data-filter-group="domain"][data-filter="' + d + '"]');
          if (pill) {
            void pill.offsetWidth;
            pill.classList.add("viz-filter-glow");
          }
        });
      },

      clearPillGlow: function () {
        mapModal.querySelectorAll(".viz-filter-glow").forEach(function (el) {
          el.classList.remove("viz-filter-glow");
        });
      },
    });

    _mapTour.createHint();

    // Stop tour on manual filter clicks
    mapModal.querySelectorAll(".viz-filter[data-filter-group]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (_mapTour && _mapTour.isTouring()) _mapTour.stop();
      });
    });
  }

  /* ─── Entrance animation ────────────────────────────────── */
  function _animateEntrance() {
    // Fade in nodes with staggered delay
    _nodes.forEach((n, i) => {
      n.el.style.opacity = "0";
      n.el.style.transform = "translate(-50%,-50%) scale(0.3)";
      n.el.style.transition = "none";

      requestAnimationFrame(() => {
        setTimeout(() => {
          n.el.style.transition = "opacity 0.5s ease, transform 0.5s ease";
          n.el.style.opacity = "";
          n.el.style.transform = "translate(-50%,-50%)";

          // Clean up inline transition after animation
          setTimeout(() => { n.el.style.transition = ""; }, 600);
        }, Math.min(i * 8, 400));
      });
    });

    // Fade in edges
    _links.forEach((link, i) => {
      link.el.style.opacity = "0";
      setTimeout(() => {
        link.el.style.transition = "opacity 0.8s ease";
        link.el.style.opacity = "";
        setTimeout(() => { link.el.style.transition = ""; }, 900);
      }, 300 + Math.min(i * 4, 500));
    });
  }

})();
