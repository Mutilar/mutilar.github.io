// ═══════════════════════════════════════════════════════════════
//  VIZ.JS — Shared visualization utilities
//
//  Extracts common pan/zoom, filter-toggle, and theme-config
//  logic used by MERMAID.JS, SKILLTREE.JS, TIMELINE.JS, and MAP.JS.
//  Each consumer calls the factory functions with its own options.
//
//  Shared date parsing:
//    VIZ_MONTH_MAP, VIZ_SEASON_SPAN,
//    VIZ_parseSingleAbs()       → absolute month number
//    VIZ_parseSingleDate()      → { year, month, season? }
//    VIZ_parseDateStart/End()   → absolute month (earliest/latest)
//    VIZ_parseDateRange()       → { sy, sm, ey, em, display }
//    VIZ_parseDateRanges()      → array of range objects
//    VIZ_absMonth()             → year*12 + month
// ═══════════════════════════════════════════════════════════════

// ── Thematic config (single source of truth) ─────────────────
// Maps category → { color (RGB string), icon (FA class), label, emoji }
// SKILLTREE.JS and TIMELINE.JS both consume this.
//
// NOTE: TIMELINE.JS uses "0,164,239" for software; skilltree uses "0,120,212".
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

// ── Item → category mappings ─────────────────────────────────
//
// Two classification axes exist:
//
//  1. DOMAIN — what discipline an item belongs to (used by TIMELINE.JS)
//     Categories: robotics, games, software, research, education
//
//  2. SOURCE — where the item originated (used by SKILLTREE.JS)
//     Categories: work, education, projects
//
//  3. QUADRANT — spatial direction on the knowledge graph
//     Categories: robotics, games, software
//     (Only needed when quadrant ≠ domain, e.g. education items
//      that lean toward robotics or games.)
//
// These maps are populated at runtime from PORTFOLIO.json
// by data.js. Items without an entry default to "software".

const VIZ_IS_MOBILE = window.matchMedia("(max-width: 768px)").matches;
const VIZ_MIN_SCALE = 0.3;
const VIZ_MAX_SCALE = 4;
const VIZ_DOMAIN_MAP = {};
const VIZ_SOURCE_MAP = {};
const VIZ_QUADRANT_MAP = {};
const VIZ_WHISPER_MAP = {};      // skilltree whisper emoji per item
const VIZ_SHORTNAME_MAP = {};    // skilltree circle label overrides
const VIZ_TIMELINE = {           // timeline whispers, name/title overrides
  whispers: {},
  nameOverrides: {},
  titleOverrides: {},
};

// ═══════════════════════════════════════════════════════════════
//  SHARED DATE PARSING
//  Consumed by SKILLTREE.JS and TIMELINE.JS.
// ═══════════════════════════════════════════════════════════════

const VIZ_MONTH_MAP = {
  jan:0,january:0,feb:1,february:1,mar:2,march:2,
  apr:3,april:3,may:4,jun:5,june:5,jul:6,july:6,
  aug:7,august:7,sep:8,september:8,oct:9,october:9,
  nov:10,november:10,dec:11,december:11,
  spring:2,summer:5,fall:8,winter:11
};

const VIZ_SEASON_SPAN = {
  spring: { sm: 2, em: 4 },   // Mar-May
  summer: { sm: 5, em: 7 },   // Jun-Aug
  fall:   { sm: 8, em: 10 },  // Sep-Nov
  winter: { sm: 11, em: 1 }   // Dec-Feb (crosses year boundary)
};

/** Convert {year,month} to an absolute month index (0 = Jan of year 0). */
function VIZ_absMonth(y, m) { return y * 12 + m; }

/**
 * Parse a single date token into an absolute month number.
 * Used by SKILLTREE.JS for timeline-position sorting.
 *   "Present" → 2026*12+1, "'22" → 2022*12, "2019" → 2019*12+6,
 *   "March 2020" → 2020*12+2, etc.
 * Returns null on failure.
 */
function VIZ_parseSingleAbs(str) {
  if (!str) return null;
  var s = str.trim();
  if (!s) return null;
  if (/^present$/i.test(s)) return 2026 * 12 + 1;
  var m;
  if ((m = s.match(/^'(\d{2})$/)))            return (+m[1]+2000)*12;
  if ((m = s.match(/^(\d{4})$/)))              return +m[1]*12 + 6;
  if ((m = s.match(/^(\w+)\s+(\d{4})$/))) {
    var mo = VIZ_MONTH_MAP[m[1].toLowerCase()];
    if (mo !== undefined) return +m[2]*12 + mo;
  }
  if ((m = s.match(/(\d{4})/)))                return +m[1]*12 + 6;
  if ((m = s.match(/'(\d{2})/)))               return (+m[1]+2000)*12;
  return null;
}

/**
 * Parse a single date token into { year, month, season? }.
 * Used by TIMELINE.JS for structured range building.
 * @param {string} str         Date token, e.g. "Summer 2016"
 * @param {number} fallbackYear  Year to assume if only a keyword is found
 */
function VIZ_parseSingleDate(str, fallbackYear) {
  if (!str) return null;
  var s = str.trim();
  if (/^present$/i.test(s)) return { year: 2026, month: 1 };
  var m;
  if ((m = s.match(/^'(\d{2})$/)))            return { year: +m[1]+2000, month: 0 };
  if ((m = s.match(/^(\d{4})$/)))              return { year: +m[1], month: 6 };
  if ((m = s.match(/^(\w+)\s+(\d{4})$/))) {
    var key = m[1].toLowerCase();
    var mo = VIZ_MONTH_MAP[key];
    if (mo !== undefined) {
      var result = { year: +m[2], month: mo };
      if (VIZ_SEASON_SPAN[key]) result.season = key;
      return result;
    }
  }
  if ((m = s.match(/(\d{4})/)))                return { year: +m[1], month: 6 };
  if ((m = s.match(/'(\d{2})/)))               return { year: +m[1]+2000, month: 0 };
  return fallbackYear ? { year: fallbackYear, month: 6 } : null;
}

/** Earliest absolute month across comma-separated date ranges. */
function VIZ_parseDateStart(dateStr) {
  if (!dateStr || !dateStr.trim()) return null;
  var segments = dateStr.trim().split(/\s*,\s*/);
  var earliest = Infinity;
  segments.forEach(function (seg) {
    var rangeParts = seg.split(/\s*[-\u2013]\s*/);
    var start = VIZ_parseSingleAbs(rangeParts[0]);
    if (start !== null && start < earliest) earliest = start;
  });
  return earliest === Infinity ? null : earliest;
}

/** Latest absolute month across comma-separated date ranges. */
function VIZ_parseDateEnd(dateStr) {
  if (!dateStr || !dateStr.trim()) return null;
  var segments = dateStr.trim().split(/\s*,\s*/);
  var latest = -Infinity;
  segments.forEach(function (seg) {
    var rangeParts = seg.split(/\s*[-\u2013]\s*/);
    var end = VIZ_parseSingleAbs(rangeParts[rangeParts.length - 1]);
    if (end !== null && end > latest) latest = end;
  });
  return latest === -Infinity ? null : latest;
}

/** Parse "X - Y" into { sy, sm, ey, em, display }. */
function VIZ_parseDateRange(dateStr) {
  if (!dateStr || !dateStr.trim()) return null;
  var cleaned = dateStr.trim();
  var parts = cleaned.split(/\s*[-\u2013]\s*/);
  var sd = VIZ_parseSingleDate(parts[0]);
  if (!sd) return null;
  var ed = parts.length > 1 ? VIZ_parseSingleDate(parts.slice(1).join("-"), sd.year) : null;
  if (ed && ed.season && VIZ_SEASON_SPAN[ed.season]) {
    var span = VIZ_SEASON_SPAN[ed.season];
    var endYear = span.em < span.sm ? ed.year + 1 : ed.year;
    ed = { year: endYear, month: span.em };
  }
  if (!ed && sd.season && VIZ_SEASON_SPAN[sd.season]) {
    var span2 = VIZ_SEASON_SPAN[sd.season];
    var endYear2 = span2.em < span2.sm ? sd.year + 1 : sd.year;
    ed = { year: endYear2, month: span2.em };
  }
  if (!ed) ed = { year: sd.year, month: sd.month };
  if (ed.year < sd.year || (ed.year === sd.year && ed.month < sd.month))
    ed = { year: sd.year, month: sd.month };
  return { sy: sd.year, sm: sd.month, ey: ed.year, em: ed.month, display: cleaned };
}

/** Parse comma-separated disjoint ranges into array of range objects. */
function VIZ_parseDateRanges(dateStr) {
  if (!dateStr || !dateStr.trim()) return [];
  return dateStr.split(/\s*,\s*/)
    .map(function (seg) { return VIZ_parseDateRange(seg); })
    .filter(Boolean);
}

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
  var minScale       = opts.minScale       || VIZ_MIN_SCALE;
  var maxScale       = opts.maxScale       || VIZ_MAX_SCALE;
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
//                        //   for custom solo-toggle logic (skilltree groups)
//    });
//    // Returns { syncUI }
// ═══════════════════════════════════════════════════════════════
function createFilterSystem(cfg) {
  var allThemes      = cfg.allThemes;
  var activeFilters  = cfg.activeFilters;
  var allBtn         = cfg.allBtn;
  var themeBtns      = cfg.themeBtns;
  var onFilter       = cfg.onFilter || function () {};
  var soloLogic      = cfg.soloLogic || null;
  var onManualFilter = cfg.onManualFilter || null;

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

  // ── Programmatic API ────────────────────────────────────────
  function setOnly(cls) {
    activeFilters.clear();
    activeFilters.add(cls);
    syncUI();
    onFilter();
  }
  function addFilter(cls) {
    activeFilters.add(cls);
    syncUI();
    onFilter();
  }
  function setAll() {
    allThemes.forEach(function (t) { activeFilters.add(t); });
    syncUI();
    onFilter();
  }
  function setNone() {
    activeFilters.clear();
    syncUI();
    onFilter();
  }

  // Initial render
  syncUI();
  window.addEventListener("theme-changed", function () { syncUI(); });

  // All button
  if (allBtn) {
    allBtn.addEventListener("click", function () {
      if (onManualFilter) onManualFilter();
      if (activeFilters.size === allThemes.length) {
        // Already all-active → pulse
        allBtn.classList.remove("filter-pulse");
        void allBtn.offsetWidth;
        allBtn.classList.add("filter-pulse");
        setTimeout(function () { allBtn.classList.remove("filter-pulse"); }, 100);
        return;
      }
      setAll();
    });
  }

  // Individual theme buttons
  themeBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (onManualFilter) onManualFilter();
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

  return {
    syncUI: syncUI,
    setOnly: setOnly,
    addFilter: addFilter,
    setAll: setAll,
    setNone: setNone,
    allThemes: allThemes,
  };
}

// ═══════════════════════════════════════════════════════════════
//  EXPLORE HINT — Shared explore/traverse hint button + tour-
//  stop wiring (pointerdown + wheel on viewport cancel tour).
//
//  Usage:
//    createExploreHint({
//      viewport,              // DOM element — the .viz-viewport
//      label,                 // inner HTML, e.g. '<strong>Explore</strong>…'
//      onStart,               // () => void — called on hint click
//      isTouring,             // () => bool — returns whether a tour is active
//      onCancel,              // () => void — called when user cancels tour
//    });
// ═══════════════════════════════════════════════════════════════
function createExploreHint(cfg) {
  var viewport  = cfg.viewport;
  if (!viewport) return null;

  var hint = document.createElement("div");
  hint.className = "viz-explore-hint scroll-hint";
  hint.innerHTML = cfg.label || '<strong>Explore</strong><span class="scroll-arrow">\uD83D\uDD2D</span>';
  hint.style.cursor = "pointer";
  hint.addEventListener("click", function (e) {
    e.preventDefault();
    if (cfg.onStart) cfg.onStart();
  });

  // Stop tour on user pan/zoom interaction
  viewport.addEventListener("pointerdown", function (e) {
    if (cfg.isTouring() && !e.target.closest(".viz-explore-hint")) {
      if (cfg.onCancel) cfg.onCancel();
    }
  });
  viewport.addEventListener("wheel", function () {
    if (cfg.isTouring()) {
      if (cfg.onCancel) cfg.onCancel();
    }
  }, { passive: true });

  viewport.appendChild(hint);
  return hint;
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
  var minScale = opts.minScale || VIZ_MIN_SCALE;
  var maxScale = opts.maxScale || VIZ_MAX_SCALE;
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
//  LAYOUT TOGGLE — Shared static/dynamic positioning toggle
//
//  Usage:
//    var lt = createLayoutToggle({
//      btn,            // DOM button element (or id string)
//      onDynamic,      // () => void — called when switching TO dynamic
//      onStatic,       // () => void — called when switching TO static
//      staticLabel,    // optional (default "📌 Static")
//      dynamicLabel,   // optional (default "🔀 Dynamic")
//      startStatic,    // optional (default VIZ_IS_MOBILE)
//    });
//    // Returns { isStatic(), setStatic(bool) }
// ═══════════════════════════════════════════════════════════════
function createLayoutToggle(cfg) {
  var btn = typeof cfg.btn === "string" ? document.getElementById(cfg.btn) : cfg.btn;
  var onDynamic    = cfg.onDynamic    || function () {};
  var onStatic     = cfg.onStatic     || function () {};
  var staticLabel  = cfg.staticLabel  || "\uD83D\uDCCC";
  var dynamicLabel = cfg.dynamicLabel || "\uD83D\uDD00";
  var staticColor  = cfg.staticColor  || "0,120,212";   // MSFT Blue
  var dynamicColor = cfg.dynamicColor || "242,80,34";   // MSFT Red
  var _static      = cfg.startStatic !== undefined ? cfg.startStatic : VIZ_IS_MOBILE;

  function syncUI() {
    if (!btn) return;
    btn.classList.toggle("dynamic", !_static);
    btn.textContent = _static ? staticLabel : dynamicLabel;
    btn.style.setProperty("--tc", _static ? staticColor : dynamicColor);
  }

  syncUI();

  if (btn) {
    btn.addEventListener("click", function () {
      _static = !_static;
      syncUI();
      if (_static) onStatic(); else onDynamic();
    });
  }

  return {
    isStatic: function () { return _static; },
    setStatic: function (v) { _static = !!v; syncUI(); },
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

// ═══════════════════════════════════════════════════════════════
//  TOUR ENGINE — Shared traverse / guided-tour state machine
//
//  Drives a timed sequence of filter steps with smooth camera
//  transitions, pill glow, and an explore hint button.
//
//  Usage:
//    var tour = createTourEngine({
//      modal,             // DOM modal element
//      viewport,          // DOM .viz-viewport element
//      hintLabel,         // default hint HTML (e.g. '<strong>Traverse</strong>…')
//      steps,             // [{ label: "emoji" }]  — step metadata
//      applyStep,         // fn(step, idx) — set filters & call applyFilters
//      resetAll,          // fn() — restore all filters after tour ends
//      fitCamera,         // fn() — smooth camera fit to visible nodes
//      setShowNames,      // fn(bool) — toggle name/whisper display
//      updateGlow,        // fn() — proximity glow refresh
//      glowPills,         // fn() — highlight active filter buttons
//      clearPillGlow,     // fn() — remove all pill glow
//      stepDelay,         // ms between steps (default 6000)
//      settleDelay,       // ms before camera fit (default 700)
//      nameShowDuration,  // ms to show names before reverting (default 4000)
//    });
//    // Returns { start, stop, isTouring, createHint }
// ═══════════════════════════════════════════════════════════════
function createTourEngine(cfg) {
  var modal           = cfg.modal;
  var viewport        = cfg.viewport;
  var hintLabel       = cfg.hintLabel || '<strong>Traverse</strong><span class="scroll-arrow">\uD83D\uDD2D</span>';
  var steps           = cfg.steps || [];
  var applyStep       = cfg.applyStep;
  var resetAll        = cfg.resetAll;
  var fitCamera       = cfg.fitCamera;
  var setShowNames    = cfg.setShowNames   || function () {};
  var updateGlow      = cfg.updateGlow     || function () {};
  var glowPills       = cfg.glowPills      || function () {};
  var clearPillGlow   = cfg.clearPillGlow  || function () {};
  var STEP_DELAY      = cfg.stepDelay         || 2000;
  var SETTLE_DELAY    = cfg.settleDelay       || 500;
  var NAME_SHOW_DUR   = cfg.nameShowDuration  || 2000;

  var _timers  = [];
  var _gen     = 0;
  var _touring = false;
  var _crossfader = createCrossfader();

  function _setHintLabel(label) {
    var hint = modal.querySelector(".viz-explore-hint");
    if (!hint) return;
    var html = '<span class="scroll-arrow">' + label + '</span>';
    _crossfader.fade(hint, html);
  }

  function _resetHintLabel() {
    var hint = modal.querySelector(".viz-explore-hint");
    if (!hint) return;
    if (_touring) {
      _crossfader.fade(hint, hintLabel, function () { hint.classList.remove("exploring"); });
    } else {
      hint.innerHTML = hintLabel;
      hint.classList.remove("exploring");
    }
  }

  function stop() {
    _gen++;
    _timers.forEach(function (t) { clearTimeout(t); });
    _timers = [];
    _touring = false;
    if (viewport) viewport.classList.remove("kg-touring");
    setShowNames(false);
    clearPillGlow();
    resetAll();
    _resetHintLabel();
  }

  function start() {
    if (!steps.length) return;
    if (_touring) { stop(); return; }

    _gen++;
    var gen = _gen;
    _touring = true;

    if (viewport) viewport.classList.add("kg-touring");

    var hint = modal.querySelector(".viz-explore-hint");
    if (hint) { hint.innerHTML = ""; hint.classList.add("exploring"); }

    var initialDelay = 300;

    // Apply first step immediately
    applyStep(steps[0], 0);

    steps.forEach(function (step, idx) {
      var delay = initialDelay + idx * STEP_DELAY;

      _timers.push(setTimeout(function () {
        if (!_touring || gen !== _gen) return;

        applyStep(step, idx);
        setShowNames(true);
        glowPills();
        _setHintLabel(step.label);

        _timers.push(setTimeout(function () {
          if (!_touring || gen !== _gen) return;
          fitCamera();
        }, SETTLE_DELAY));

        _timers.push(setTimeout(function () {
          if (!_touring || gen !== _gen) return;
          setShowNames(false);
          updateGlow();
        }, NAME_SHOW_DUR));

      }, delay));
    });

    var totalDuration = initialDelay + steps.length * STEP_DELAY + SETTLE_DELAY + 800;
    _timers.push(setTimeout(function () {
      if (!_touring || gen !== _gen) return;
      _touring = false;
      if (viewport) viewport.classList.remove("kg-touring");
      setShowNames(false);
      clearPillGlow();
      resetAll();
      _resetHintLabel();
      setTimeout(function () { fitCamera(); }, 400);
    }, totalDuration));
  }

  function createHint() {
    if (!viewport) return null;
    return createExploreHint({
      viewport: viewport,
      label:    hintLabel,
      onStart:  start,
      isTouring: function () { return _touring; },
      onCancel:  stop,
    });
  }

  return {
    start:     start,
    stop:      stop,
    isTouring: function () { return _touring; },
    createHint: createHint,
  };
}
