// ═══════════════════════════════════════════════════════════════
//  VIZ.JS — Shared visualization utilities
//
//  Extracts common pan/zoom, filter-toggle, and theme-config
//  logic used by mermaid-view.js, skill-tree.js, and timeline.js.
//  Each consumer calls the factory functions with its own options.
// ═══════════════════════════════════════════════════════════════

// ── Thematic config (single source of truth) ─────────────────
// Maps category → { color (RGB string), icon (FA class), label, emoji }
// skill-tree.js and timeline.js both consume this.
//
// NOTE: timeline.js uses "0,164,239" for software; skill-tree uses "0,120,212".
// Each consumer picks the color it needs from this shared config.
// The `altColor` field holds the alternate where they differ.
const VIZ_THEMES = {
  robotics:  { color: "242,80,34",   icon: "fa-cogs",           label: "Robotics",  emoji: "🤖" },
  games:     { color: "127,186,0",   icon: "fa-gamepad",        label: "Games",      emoji: "🎮" },
  software:  { color: "0,120,212",   altColor: "0,164,239", icon: "fa-code", label: "Software", emoji: "💻" },
  research:  { color: "255,185,0",   icon: "fa-flask",          label: "Research",   emoji: "🔬" },
  education: { color: "255,185,0",   icon: "fa-graduation-cap", label: "Education",  emoji: "🎓" },
  work:      { color: "0,120,212",   icon: "fa-briefcase",      label: "Work",       emoji: "💼" },
  projects:  { color: "242,80,34",   icon: "fa-rocket",         label: "Projects",   emoji: "🚀" },
};

// ── Item → category mappings (single source of truth) ────────
//
// Two classification axes exist:
//
//  1. DOMAIN — what discipline an item belongs to (used by timeline.js)
//     Categories: robotics, games, software, research, education
//
//  2. SOURCE — where the item originated (used by skill-tree.js)
//     Categories: work, education, projects
//
// VIZ_DOMAIN_MAP is the primary map. VIZ_SOURCE_MAP provides the
// "origin" overlay used by the knowledge graph.

const VIZ_DOMAIN_MAP = {
  // Robotics — hardware builds, robots, IoT devices
  marp: "robotics", sriracha: "robotics", smartank: "robotics",
  blindsight: "robotics", amaxesd: "robotics", redtierobotics: "robotics",
  alamorobotics: "robotics", motorskills: "robotics",
  "home-iot": "robotics",
  // Games — game dev, game jams, game-adjacent coding tools
  bitnaughts: "games", graviton: "games", spaceninjas: "games",
  voodoo: "games", galconq: "games", popvuj: "games",
  seerauber: "games", summerofgamedesign: "games", iterate: "games",
  "the-nobles": "games", "the-demons": "games",
  // Software — professional SWE, cloud, web apps, devops
  microsoft: "software", azuremlops: "software", ventana: "software",
  duskrosecodex: "software",
  citris: "software", hackmerced: "software", motleymoves: "software",
  breeze: "software", dogpark: "software",
  ozone: "software", gasleek: "software", chemistry: "software",
  gist: "software", digestquest: "software",
  // Research — academic labs, science, data analysis
  vicelab: "research", andeslab: "research", maces: "research",
  firmi: "research",
  learnbeat: "research", acm: "research",
  // Education — university courses
  cse180: "education", cse165: "education", cse160: "education",
  cse120: "education", cse111: "education", cse100: "education",
  cse031: "education", cse030: "education", cse015: "education",
  // Education — high school
  ropgamedesign: "education", roparchitecture: "education", apjava: "education",
};

const VIZ_SOURCE_MAP = {
  marp: "projects", amaxesd: "projects", redtierobotics: "education",
  alamorobotics: "work", "home-iot": "projects",
  bitnaughts: "projects", voodoo: "projects", galconq: "projects", popvuj: "projects",
  "the-nobles": "projects", "the-demons": "projects", duskrosecodex: "projects",
  graviton: "projects", spaceninjas: "work",
  summerofgamedesign: "work", iterate: "projects",
  microsoft: "work", ventana: "work",
  citris: "work", hackmerced: "work",
  vicelab: "work", andeslab: "work", maces: "work",
  learnbeat: "work", acm: "work",
  azuremlops: "projects", motleymoves: "projects",
  breeze: "projects", dogpark: "projects",
  ozone: "projects",
  firmi: "projects",
  sriracha: "projects", smartank: "projects", blindsight: "projects",
  motorskills: "projects", seerauber: "projects",
  gasleek: "projects", chemistry: "projects", gist: "projects", digestquest: "projects",
  cse180: "education", cse165: "education", cse160: "education",
  cse120: "education", cse111: "education", cse100: "education",
  cse031: "education", cse030: "education", cse015: "education",
  ropgamedesign: "education", roparchitecture: "education", apjava: "education",
};

// ═══════════════════════════════════════════════════════════════
//  PAN & ZOOM — Shared factory for pointer/wheel/pinch interaction
//
//  Usage:
//    const pz = initPanZoom(viewport, world, transform, {
//      minScale, maxScale,
//      getBounds,         // () => { minX, maxX, minY, maxY } | null
//      onUpdate,          // (transform) => void  — called after each change
//      ignoreSelector,    // CSS selector to let clicks through (e.g. ".node")
//      rubberBandDrag,    // bool — enable rubber-band resistance during drag
//      zoomStep,          // [zoomOut, zoomIn]  e.g. [0.92, 1.08]
//      bounceCurve,       // CSS cubic-bezier string for pan bounce-back
//      bounceDuration,    // ms for bounce-back transition
//    });
//
//  `transform` is a mutable { x, y, scale } object owned by the caller.
//  Returns { bounceBackIfNeeded, update } for external use.
// ═══════════════════════════════════════════════════════════════
function initPanZoom(viewport, world, transform, opts) {
  opts = opts || {};
  var minScale       = opts.minScale       || 0.5;
  var maxScale       = opts.maxScale       || 2;
  var getBounds      = opts.getBounds      || function () { return null; };
  var onUpdate       = opts.onUpdate       || function () {};
  var ignoreSelector = opts.ignoreSelector || null;
  var rubberBandDrag = opts.rubberBandDrag !== undefined ? opts.rubberBandDrag : false;
  var zoomStep       = opts.zoomStep       || [0.92, 1.08];
  var bounceCurve    = opts.bounceCurve    || "cubic-bezier(0.25, 1, 0.5, 1)";
  var bounceDuration = opts.bounceDuration || 340;

  var isPanning = false, startX = 0, startY = 0, startTX = 0, startTY = 0;

  function update() {
    world.style.transform = "translate(" + transform.x + "px, " + transform.y + "px) scale(" + transform.scale + ")";
    onUpdate(transform);
  }

  // Rubber-band: the further past bounds, the harder it resists
  function rubberBand(val, min, max) {
    if (val >= min && val <= max) return val;
    var limit = 60;
    var over = val < min ? min - val : val - max;
    var damped = limit * (1 - Math.exp(-over / limit));
    return val < min ? min - damped : max + damped;
  }

  var _panBounceTimer = null;
  function bounceBackIfNeeded() {
    var bounds = getBounds();
    if (!bounds) return;
    var tx = transform.x, ty = transform.y, clamped = false;
    if (tx < bounds.minX) { tx = bounds.minX; clamped = true; }
    if (tx > bounds.maxX) { tx = bounds.maxX; clamped = true; }
    if (ty < bounds.minY) { ty = bounds.minY; clamped = true; }
    if (ty > bounds.maxY) { ty = bounds.maxY; clamped = true; }
    if (clamped) {
      transform.x = tx; transform.y = ty;
      world.style.transition = "transform " + bounceDuration + "ms " + bounceCurve;
      update();
      if (_panBounceTimer) clearTimeout(_panBounceTimer);
      _panBounceTimer = setTimeout(function () { world.style.transition = ""; }, bounceDuration + 40);
    }
  }

  // ── Pointer (mouse / single-touch) pan ─────────────────────
  viewport.addEventListener("pointerdown", function (e) {
    if (ignoreSelector && e.target.closest(ignoreSelector)) return;
    isPanning = true;
    startX = e.clientX; startY = e.clientY;
    startTX = transform.x; startTY = transform.y;
    viewport.style.cursor = "grabbing";
    viewport.setPointerCapture(e.pointerId);
  });

  viewport.addEventListener("pointermove", function (e) {
    if (!isPanning) return;
    var nx = startTX + (e.clientX - startX);
    var ny = startTY + (e.clientY - startY);
    if (rubberBandDrag) {
      var bounds = getBounds();
      if (bounds) {
        nx = rubberBand(nx, bounds.minX, bounds.maxX);
        ny = rubberBand(ny, bounds.minY, bounds.maxY);
      }
    }
    transform.x = nx; transform.y = ny;
    update();
  });

  viewport.addEventListener("pointerup", function () {
    isPanning = false;
    viewport.style.cursor = "grab";
    bounceBackIfNeeded();
  });

  viewport.addEventListener("pointercancel", function () {
    isPanning = false;
    viewport.style.cursor = "grab";
    bounceBackIfNeeded();
  });

  // ── Mouse wheel zoom ──────────────────────────────────────
  var _zoomBounceTimer = null;
  viewport.addEventListener("wheel", function (e) {
    e.preventDefault();
    var rect = viewport.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    var prev = transform.scale;
    var raw = transform.scale * (e.deltaY > 0 ? zoomStep[0] : zoomStep[1]);
    var clamped = Math.max(minScale, Math.min(maxScale, raw));
    var atLimit = raw !== clamped;
    transform.scale = clamped;
    var ratio = transform.scale / prev;
    transform.x = mx - ratio * (mx - transform.x);
    transform.y = my - ratio * (my - transform.y);
    update();

    if (atLimit) {
      // Elastic overshoot then spring back
      if (_zoomBounceTimer) clearTimeout(_zoomBounceTimer);
      var overshoot = raw < minScale ? minScale * 0.92 : maxScale * 1.06;
      transform.scale = overshoot;
      var oRatio = transform.scale / clamped;
      transform.x = mx - oRatio * (mx - transform.x);
      transform.y = my - oRatio * (my - transform.y);
      world.style.transition = "transform 0.08s ease-out";
      update();
      _zoomBounceTimer = setTimeout(function () {
        transform.scale = clamped;
        var bRatio = clamped / overshoot;
        transform.x = mx - bRatio * (mx - transform.x);
        transform.y = my - bRatio * (my - transform.y);
        world.style.transition = "transform 0.3s " + bounceCurve;
        update();
        setTimeout(function () { world.style.transition = ""; bounceBackIfNeeded(); }, 320);
      }, 80);
    } else {
      bounceBackIfNeeded();
    }
  }, { passive: false });

  // ── Touch pinch zoom ──────────────────────────────────────
  var lastDist = 0;
  viewport.addEventListener("touchstart", function (e) {
    if (e.touches.length === 2) {
      var dx = e.touches[1].clientX - e.touches[0].clientX;
      var dy = e.touches[1].clientY - e.touches[0].clientY;
      lastDist = Math.sqrt(dx * dx + dy * dy);
    }
  }, { passive: true });

  viewport.addEventListener("touchmove", function (e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      var dx = e.touches[1].clientX - e.touches[0].clientX;
      var dy = e.touches[1].clientY - e.touches[0].clientY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (lastDist > 0) {
        var rect = viewport.getBoundingClientRect();
        var cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        var cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        var prev = transform.scale;
        transform.scale = Math.max(minScale, Math.min(maxScale, transform.scale * (dist / lastDist)));
        var ratio = transform.scale / prev;
        transform.x = cx - ratio * (cx - transform.x);
        transform.y = cy - ratio * (cy - transform.y);
        update();
      }
      lastDist = dist;
    }
  }, { passive: false });

  viewport.addEventListener("touchend", function () { bounceBackIfNeeded(); }, { passive: true });

  return { update: update, bounceBackIfNeeded: bounceBackIfNeeded };
}

// ═══════════════════════════════════════════════════════════════
//  FILTER SYSTEM — Reusable multi-select toggle button bar
//
//  Usage:
//    const fs = createFilterSystem({
//      allThemes,        // ["robotics", "games", ...]
//      activeFilters,    // Set — mutated in place
//      allBtn,           // DOM element for the "All" button (or null)
//      themeBtns,        // NodeList of per-theme buttons
//      onFilter,         // () => void  — called when filters change
//      soloLogic,        // optional fn(filter, activeFilters, allThemes) → void
//                        //   for custom solo-toggle logic (skill-tree groups)
//    });
//    // Returns { syncUI }
// ═══════════════════════════════════════════════════════════════
function createFilterSystem(cfg) {
  var allThemes     = cfg.allThemes;
  var activeFilters = cfg.activeFilters;
  var allBtn        = cfg.allBtn;
  var themeBtns     = cfg.themeBtns;
  var onFilter      = cfg.onFilter || function () {};
  var soloLogic     = cfg.soloLogic || null;

  function syncUI() {
    var allActive = activeFilters.size === allThemes.length;
    if (allBtn) {
      allBtn.classList.toggle("active", allActive);
      var indicator = allBtn.querySelector(".all-indicator");
      if (indicator) {
        var isLight = document.documentElement.classList.contains("light-mode");
        indicator.textContent = allActive
          ? (isLight ? "\u2b1b" : "\u2b1c")
          : (isLight ? "\u2b1c" : "\u2b1b");
      }
    }
    themeBtns.forEach(function (b) {
      b.classList.toggle("active", activeFilters.has(b.dataset.filter));
    });
  }

  // Initial render
  syncUI();
  window.addEventListener("theme-changed", function () { syncUI(); });

  // All button
  if (allBtn) {
    allBtn.addEventListener("click", function () {
      if (activeFilters.size === allThemes.length) {
        // Already all-active → pulse
        allBtn.classList.remove("filter-pulse");
        void allBtn.offsetWidth;
        allBtn.classList.add("filter-pulse");
        setTimeout(function () { allBtn.classList.remove("filter-pulse"); }, 100);
        return;
      }
      allThemes.forEach(function (t) { activeFilters.add(t); });
      syncUI();
      onFilter();
    });
  }

  // Individual theme buttons
  themeBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var f = btn.dataset.filter;
      if (soloLogic) {
        soloLogic(f, activeFilters, allThemes);
      } else {
        // Default toggle logic (timeline-style)
        if (activeFilters.size === allThemes.length) {
          activeFilters.clear();
          activeFilters.add(f);
        } else if (activeFilters.has(f) && activeFilters.size === 1) {
          allThemes.forEach(function (t) { activeFilters.add(t); });
        } else if (activeFilters.has(f)) {
          activeFilters.delete(f);
        } else {
          activeFilters.add(f);
        }
      }
      syncUI();
      onFilter();
    });
  });

  return { syncUI: syncUI };
}

// ═══════════════════════════════════════════════════════════════
//  CAMERA FIT — Shared animated camera-to-bounding-box utility
//
//  Usage:
//    animateCameraFit(transform, updateFn, {
//      vpWidth, vpHeight,     // viewport pixel dimensions
//      bounds,                // { x, y, w, h } world-space rect to fit
//      minScale, maxScale,    // optional scale clamps
//      padding,               // px padding inside viewport (default 40)
//      duration,              // ms (default 800)
//      animate,               // bool (default true)
//    });
//
//  `transform` is a mutable { x, y, scale } object.
//  `updateFn`  is called after each frame: updateFn(transform).
//  Returns { cancel } to abort an in-flight animation.
// ═══════════════════════════════════════════════════════════════
function animateCameraFit(transform, updateFn, opts) {
  opts = opts || {};
  var vpW      = opts.vpWidth  || 800;
  var vpH      = opts.vpHeight || 600;
  var bounds   = opts.bounds;  // { x, y, w, h }
  var minScale = opts.minScale || 0.1;
  var maxScale = opts.maxScale || 4;
  var pad      = opts.padding  !== undefined ? opts.padding : 40;
  var duration = opts.duration !== undefined ? opts.duration : 800;
  var doAnimate = opts.animate !== undefined ? opts.animate : true;

  if (!bounds || bounds.w <= 0 || bounds.h <= 0) return { cancel: function () {} };

  var sx = (vpW - pad * 2) / bounds.w;
  var sy = (vpH - pad * 2) / bounds.h;
  var fitScale = Math.max(minScale, Math.min(maxScale, Math.min(sx, sy)));
  var targetX = (vpW - bounds.w * fitScale) / 2 - bounds.x * fitScale;
  var targetY = (vpH - bounds.h * fitScale) / 2 - bounds.y * fitScale;
  var targetS = fitScale;

  if (!doAnimate) {
    transform.x = targetX;
    transform.y = targetY;
    transform.scale = targetS;
    updateFn(transform);
    return { cancel: function () {} };
  }

  var fromX = transform.x, fromY = transform.y, fromS = transform.scale;
  var startTime = performance.now();
  var rafId = null;
  var cancelled = false;

  function ease(t) {
    // Ease-out quint — fast start, long gentle deceleration ("slerpy")
    var t1 = 1 - t;
    return 1 - t1 * t1 * t1 * t1 * t1;
  }

  function tick(now) {
    if (cancelled) return;
    var elapsed = now - startTime;
    var raw = Math.min(elapsed / duration, 1);
    var t = ease(raw);
    transform.x     = fromX + (targetX - fromX) * t;
    transform.y     = fromY + (targetY - fromY) * t;
    transform.scale = fromS + (targetS - fromS) * t;
    updateFn(transform);
    if (raw < 1) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
    }
  }
  rafId = requestAnimationFrame(tick);

  return {
    cancel: function () {
      cancelled = true;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }
  };
}

// ═══════════════════════════════════════════════════════════════
//  CROSSFADE HINT — Shared fade-out → swap → fade-in for hint labels
//
//  Usage:
//    var cf = createCrossfader();
//    cf.fade(hintEl, newHTML, optionalCallback);
// ═══════════════════════════════════════════════════════════════
function createCrossfader() {
  var _pending = null;
  return {
    fade: function (hint, html, cb) {
      if (_pending) clearTimeout(_pending);
      hint.style.transition = "opacity 0.4s ease";
      hint.style.opacity = "0";
      _pending = setTimeout(function () {
        hint.innerHTML = html;
        if (cb) cb();
        void hint.offsetWidth;
        hint.style.opacity = "1";
        _pending = setTimeout(function () {
          hint.style.transition = "";
          hint.style.opacity = "";
          _pending = null;
        }, 420);
      }, 420);
    }
  };
}
