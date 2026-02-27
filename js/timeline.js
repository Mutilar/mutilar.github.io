// ═══════════════════════════════════════════════════════════════
//  TIMELINE MODAL — Vertical month-resolution swimlane layout
//
//  Y-axis = time (month granularity, newest at top).
//  Each entry is a sliver whose height ∝ duration in months
//  (min 1 month). Concurrent entries share horizontal width.
// ═══════════════════════════════════════════════════════════════
(() => {
  const timelineModal = document.getElementById("timeline-modal");
  const timelineModalClose = document.getElementById("timelineModalClose");

  const MONTH_H   = 48;   // px per month
  const MIN_SPAN  = 1;    // minimum 1-month height for point events
  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const GAP = 3;          // px gap between side-by-side slivers

  let _tlAutoScrollRAF = null;
  function _tlStopAutoScroll() { if (_tlAutoScrollRAF) { cancelAnimationFrame(_tlAutoScrollRAF); _tlAutoScrollRAF = null; } }
  const CALENDAR_PAD = 0; // px buffer top & bottom of timeline

  /* ── Thematic work-stream categories (from viz.js) ────────── */
  // timeline uses VIZ_THEMES with altColor for software
  const themeConfig = {};
  ["robotics", "games", "software", "research", "education"].forEach(function (k) {
    var src = VIZ_THEMES[k];
    themeConfig[k] = { color: (k === "software" ? src.altColor : src.color) || src.color, icon: src.icon, label: src.label };
  });

  const themeMap = VIZ_DOMAIN_MAP;

  function getTheme(item) {
    return themeMap[item.ID] || "software";
  }

  let timelineBuilt = false;
  let activeFilters = new Set(["robotics", "games", "software", "research", "education"]);

  // ── Open / close ───────────────────────────────────────────
  function openTimelineModal() {
    toggleModal(timelineModal, true);
    if (!timelineBuilt) buildTimeline();
    // Re-activate whisper HUD (hidden on close)
    const hud = document.getElementById("tl-whisper-hud");
    if (hud) hud.classList.add("tl-whisper-active");
    // Start scrolled 5% down
    requestAnimationFrame(() => {
      const card = timelineModal.querySelector(".timeline-modal-card");
      if (card) {
        const target = Math.round(card.scrollHeight * 0.005);
        card.scrollTop = target;
      }
    });
  }
  function closeTimelineModal() {
    _tlStopAutoScroll();
    toggleModal(timelineModal, false);
    const hud = document.getElementById("tl-whisper-hud");
    if (hud) hud.classList.remove("tl-whisper-active");
  }

  window.openTimelineModal  = openTimelineModal;
  window.closeTimelineModal = closeTimelineModal;

  timelineModalClose.addEventListener("click", closeTimelineModal);
  timelineModal.addEventListener("click", e => { if (e.target === timelineModal) closeTimelineModal(); });

  // ── Filter buttons (via viz.js shared filter system) ────────
  const allThemes = ["robotics", "games", "software", "research", "education"];
  const allBtn = timelineModal.querySelector('.timeline-filter[data-filter="all"]');
  const themeBtns = timelineModal.querySelectorAll('.timeline-filter:not([data-filter="all"])');

  const _filterSys = createFilterSystem({
    allThemes: allThemes,
    activeFilters: activeFilters,
    allBtn: allBtn,
    themeBtns: themeBtns,
    onFilter: applyFilter,
  });

  /** All layout data is stored here after first build */
  let _allSlivers = [];   // { el, startOff, endOff, theme, category }
  let _container   = null;
  let _globalMin   = 0;
  let _globalMax   = 0;

  function applyFilter() {
    // hide/show slivers by theme (multi-select)
    _allSlivers.forEach(s => {
      const hide = activeFilters.size === 0 || !activeFilters.has(s.theme);
      s.el.classList.toggle("tl-hidden", hide);
    });
    // rebuild ruler + repack to constrain to visible range
    rebuildRuler();
    repackSlivers();
  }

  // ── Date parsing ───────────────────────────────────────────
  const monthMap = {
    jan:0,january:0,feb:1,february:1,mar:2,march:2,
    apr:3,april:3,may:4,jun:5,june:5,jul:6,july:6,
    aug:7,august:7,sep:8,september:8,oct:9,october:9,
    nov:10,november:10,dec:11,december:11,
    spring:2,summer:5,fall:8,winter:11
  };

  // Season spans: keyword → { start month, end month }
  const seasonSpan = {
    spring: { sm: 2, em: 4 },   // Mar – May
    summer: { sm: 5, em: 7 },   // Jun – Aug
    fall:   { sm: 8, em: 10 },  // Sep – Nov
    winter: { sm: 11, em: 1 }   // Dec – Feb (crosses year boundary)
  };

  function parseSingleDate(str, fallbackYear) {
    if (!str) return null;
    const s = str.trim();
    if (/^present$/i.test(s)) return { year: 2026, month: 1 };
    let m;
    if ((m = s.match(/^'(\d{2})$/)))            return { year: +m[1]+2000, month: 0 };
    if ((m = s.match(/^(\d{4})$/)))              return { year: +m[1], month: 6 };
    if ((m = s.match(/^(\w+)\s+(\d{4})$/))) {
      const key = m[1].toLowerCase();
      const mo = monthMap[key];
      if (mo !== undefined) {
        const result = { year: +m[2], month: mo };
        if (seasonSpan[key]) result.season = key;
        return result;
      }
    }
    if ((m = s.match(/(\d{4})/)))                return { year: +m[1], month: 6 };
    if ((m = s.match(/'(\d{2})/)))               return { year: +m[1]+2000, month: 0 };
    return fallbackYear ? { year: fallbackYear, month: 6 } : null;
  }

  function parseDateRange(dateStr) {
    if (!dateStr || !dateStr.trim()) return null;
    const cleaned = dateStr.trim();
    const parts = cleaned.split(/\s*[-–]\s*/);
    const sd = parseSingleDate(parts[0]);
    if (!sd) return null;
    let ed = parts.length > 1 ? parseSingleDate(parts.slice(1).join("-"), sd.year) : null;
    // If the end date is a season, resolve to the season's last month
    if (ed && ed.season && seasonSpan[ed.season]) {
      const span = seasonSpan[ed.season];
      const endYear = span.em < span.sm ? ed.year + 1 : ed.year;
      ed = { year: endYear, month: span.em };
    }
    // If no explicit end and the start is a season, expand to 3 months
    if (!ed && sd.season && seasonSpan[sd.season]) {
      const span = seasonSpan[sd.season];
      // Handle year-crossing (winter: Dec–Feb)
      const endYear = span.em < span.sm ? sd.year + 1 : sd.year;
      ed = { year: endYear, month: span.em };
    }
    if (!ed) ed = { ...sd };
    if (ed.year < sd.year || (ed.year === sd.year && ed.month < sd.month)) ed = { ...sd };
    return { sy: sd.year, sm: sd.month, ey: ed.year, em: ed.month, display: cleaned };
  }

  /** Parse a DATE field that may contain comma-separated disjoint ranges.
   *  e.g. "Summer 2015, Summer 2016" → two separate range objects. */
  function parseDateRanges(dateStr) {
    if (!dateStr || !dateStr.trim()) return [];
    return dateStr.split(/\s*,\s*/)
      .map(seg => parseDateRange(seg))
      .filter(Boolean);
  }

  /** Convert {year,month} to an absolute month index (0 = Jan of year 0) */
  function absMonth(y, m) { return y * 12 + m; }

  // ── Build ──────────────────────────────────────────────────
  function buildTimeline() {
    const datasets = ["work", "education", "projects", "hackathons", "games"];
    if (!datasets.every(d => modalState[d])) { setTimeout(buildTimeline, 200); return; }

    const entries = [];
    datasets.forEach(cat => {
      (modalState[cat] || []).forEach(item => {
        const ranges = parseDateRanges(item.DATE);
        if (ranges.length === 0) return;

        const theme = getTheme(item);

        // Title-splitting only applies to work entries
        if (cat === "work") {
          const titles = item.TITLE
            ? item.TITLE.split(/\s*,\s*/).map(t => t.trim()).filter(Boolean).reverse()
            : [];

          if (titles.length > 1 && titles.length === ranges.length) {
            // 1:1 pairing — e.g. "SWE Intern, SWE, Senior SWE" with 3 date ranges
            // Custom name overrides per title (e.g. Microsoft → team-specific names)
            const nameOverrides = {
              microsoft: { "Senior SWE": "🪟 Microsoft (E+D)", "__default": "🪟 Microsoft (AzureML)" }
            };
            const nameMap = nameOverrides[item.ID] || {};
            titles.forEach((t, i) => {
              const nameOverride = nameMap[t] || nameMap["__default"] || null;
              entries.push({ item, category: cat, theme, r: ranges[i], titleOverride: t, nameOverride });
            });
            return;
          } else if (titles.length > 1 && ranges.length === 1) {
            // More titles than ranges — split the single range evenly
            const r = ranges[0];
            const totalMonths = absMonth(r.ey, r.em) - absMonth(r.sy, r.sm) + 1;
            const perTitle = Math.max(1, Math.floor(totalMonths / titles.length));
            const startAbs = absMonth(r.sy, r.sm);
            titles.forEach((t, i) => {
              const sAbs = startAbs + i * perTitle;
              const eAbs = (i === titles.length - 1)
                ? absMonth(r.ey, r.em)
                : sAbs + perTitle - 1;
              const sy = Math.floor(sAbs / 12), sm = sAbs % 12;
              const ey = Math.floor(eAbs / 12), em = eAbs % 12;
              const dStr = `${MONTH_LABELS[sm]} ${sy} – ${MONTH_LABELS[em]} ${ey}`;
              entries.push({ item, category: cat, theme, r: { sy, sm, ey, em, display: dStr }, titleOverride: t });
            });
            return;
          }
        }

        // Per-item title overrides for the timeline (keeps CSV data intact)
        const titleOverrides = { marp: "Home Robot" };

        // Default: one sliver per range
        const tOver = titleOverrides[item.ID] || null;
        ranges.forEach(r => entries.push({ item, category: cat, theme, r, ...(tOver && { titleOverride: tOver }) }));
      });
    });
    if (entries.length === 0) return;

    // Global month range
    _globalMin = Infinity; _globalMax = -Infinity;
    entries.forEach(e => {
      const s = absMonth(e.r.sy, e.r.sm);
      const f = absMonth(e.r.ey, e.r.em);
      if (s < _globalMin) _globalMin = s;
      if (f > _globalMax) _globalMax = f;
    });

    // Container setup
    _container = document.getElementById("timeline-entries");
    _container.innerHTML = "";
    _container.style.position = "relative";

    // ── Convert entries to sliver descriptors ────────────────
    const slivers = entries.map(e => {
      const startOff = absMonth(e.r.sy, e.r.sm);
      const endOff   = absMonth(e.r.ey, e.r.em);
      const spanMonths = Math.max(MIN_SPAN, endOff - startOff + 1);
      return { ...e, startOff, endOff: startOff + spanMonths - 1 };
    });

    // ── Horizontal packing (column assignment) ───────────────
    // Sort by start ascending, then longer first
    slivers.sort((a, b) => a.startOff - b.startOff || (b.endOff - b.startOff) - (a.endOff - a.startOff));

    // Assign each sliver to a column using a greedy interval approach
    // colEnds[c] = the endOff of the last sliver placed in column c
    // We group slivers into "lanes" where they don't overlap vertically
    // Then figure out max concurrent at each point for width calc
    assignColumns(slivers);

    // ── Render ───────────────────────────────────────────────
    _allSlivers = [];
    slivers.forEach(s => {
      const el = buildSliver(s);
      _container.appendChild(el);
      const wk = getWhisperKey(s.item, s.titleOverride);
      _allSlivers.push({ el, startOff: s.startOff, endOff: s.endOff, category: s.category, theme: s.theme, col: s.col, whisperKey: wk });
    });

    rebuildRuler();
    repackSlivers();

    // ── Scroll-down hint ─────────────────────────────────────
    let scrollHint = document.getElementById("tl-scroll-hint");
    if (!scrollHint) {
      scrollHint = document.createElement("div");
      scrollHint.id = "tl-scroll-hint";
      scrollHint.className = "scroll-hint tl-scroll-hint";
      scrollHint.innerHTML = '<strong>Take A Stroll</strong><span class="scroll-arrow">🚶</span>';
      scrollHint.style.cursor = "pointer";
      const tlContainer = document.getElementById("timeline-container");
      tlContainer.appendChild(scrollHint);
    }

    // ── Slow auto-scroll on hint click, interruptible by user ──
    let _autoScrolling = false;

    scrollHint.onclick = function (e) {
      e.preventDefault();
      _tlStopAutoScroll();
      const maxScroll = modalCard.scrollHeight - modalCard.clientHeight;
      if (modalCard.scrollTop >= maxScroll - 1) return; // already at bottom

      const FAST = 400;        // px/s at top
      const SLOW = 100;         // px/s at bottom

      let lastT = null;
      let userInterrupted = false;
      _autoScrolling = true;

      // Hide hint while auto-scrolling
      scrollHint.style.opacity = 0;
      scrollHint.style.pointerEvents = 'none';

      function onUserScroll() { userInterrupted = true; }
      modalCard.addEventListener("wheel", onUserScroll, { once: true, passive: true });
      modalCard.addEventListener("touchstart", onUserScroll, { once: true, passive: true });

      function step(ts) {
        if (userInterrupted) { cleanup(); return; }
        if (!lastT) { lastT = ts; }
        const dt = (ts - lastT) / 1000;
        lastT = ts;

        // Linear deceleration from FAST → SLOW over the full scroll range
        const maxS = modalCard.scrollHeight - modalCard.clientHeight;
        const progress = maxS > 0 ? modalCard.scrollTop / maxS : 1;
        const speed = FAST + (SLOW - FAST) * progress;

        const dist = speed * dt;
        modalCard.scrollTop += dist;
        if (modalCard.scrollTop >= maxS - 1) { cleanup(); return; }
        _tlAutoScrollRAF = requestAnimationFrame(step);
      }

      function cleanup() {
        _tlStopAutoScroll();
        _autoScrolling = false;
        modalCard.removeEventListener("wheel", onUserScroll);
        modalCard.removeEventListener("touchstart", onUserScroll);
        // Re-show hint if not at bottom
        const maxS = modalCard.scrollHeight - modalCard.clientHeight;
        if (modalCard.scrollTop < maxS - 1) {
          scrollHint.style.opacity = 1;
          scrollHint.style.pointerEvents = '';
        }
      }

      _tlAutoScrollRAF = requestAnimationFrame(step);
    };

    // ── Whisper HUD overlay ──────────────────────────────────
    const modalCard = timelineModal.querySelector(".timeline-modal-card");
    let whisperHUD = document.getElementById("tl-whisper-hud");
    if (!whisperHUD) {
      whisperHUD = document.createElement("div");
      whisperHUD.id = "tl-whisper-hud";
      whisperHUD.className = "tl-whisper-hud";
      document.body.appendChild(whisperHUD);
    }
    whisperHUD.innerHTML = "";
    whisperHUD.classList.add("tl-whisper-active");

    /* Dynamic whisper slot pool — one slot per unique whisper key,
       each positioned exactly over its sliver via inline styles. */
    const _slots = {};  // key → { el, layers, activeIdx, lastText }

    function getOrCreateSlot(key) {
      if (_slots[key]) return _slots[key];
      const el = document.createElement("div");
      el.className = "tl-whisper-col";
      const l0 = document.createElement("span");
      l0.className = "tl-whisper-layer";
      const l1 = document.createElement("span");
      l1.className = "tl-whisper-layer";
      el.appendChild(l0);
      el.appendChild(l1);
      whisperHUD.appendChild(el);
      const slot = { el, layers: [l0, l1], activeIdx: 0, lastText: "" };
      _slots[key] = slot;
      return slot;
    }

    function crossfade(layers, activeIdx, html) {
      const outLayer = layers[activeIdx];
      const inLayer  = layers[1 - activeIdx];
      inLayer.innerHTML = html;
      inLayer.classList.add("tl-whisper-show");
      outLayer.classList.remove("tl-whisper-show");
      return 1 - activeIdx;
    }

    function fadeOut(layers, activeIdx) {
      layers[activeIdx].classList.remove("tl-whisper-show");
    }

    function updateWhispers() {
      const rect = modalCard.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;

      /* ── Align HUD to timeline-entries (same basis as sliver %) ── */
      const entriesRect = _container.getBoundingClientRect();
      whisperHUD.style.left  = entriesRect.left + 'px';
      whisperHUD.style.width = entriesRect.width + 'px';
      whisperHUD.style.opacity = 1;

      const glowingSlivers = new Set();
      const activeKeys = new Set();   // track which slots are active this frame

      _allSlivers.forEach(s => {
        if (!s.whisperKey || s.el.classList.contains("tl-hidden")) return;
        const list = whisperData[s.whisperKey];
        if (!list || !list.length) return;

        const sr = s.el.getBoundingClientRect();
        // Fade zone: 25px at each edge for smooth fade in/out
        const FADE = 25;
        if (centerY < sr.top || centerY > sr.bottom) return;

        // Compute opacity: ramp up in first 25px, full in middle, ramp down in last 25px
        let fadeFactor = 1;
        if (centerY < sr.top + FADE) {
          fadeFactor = (centerY - sr.top) / FADE;
        } else if (centerY > sr.bottom - FADE) {
          fadeFactor = (sr.bottom - centerY) / FADE;
        }

        let idx = 0;
        if (list.length > 1) {
          const progress = Math.max(0, Math.min(1, (centerY - sr.top) / sr.height));
          idx = Math.min(list.length - 1, Math.floor(progress * list.length));
        }

        if (fadeFactor > 0) glowingSlivers.add(s);

        const text = list[idx];
        const slot = getOrCreateSlot(s.whisperKey);
        activeKeys.add(s.whisperKey);

        // Position slot exactly over the sliver (relative to HUD)
        slot.el.style.left   = (sr.left - entriesRect.left) + 'px';
        slot.el.style.width  = sr.width + 'px';
        slot.el.style.opacity = fadeFactor;

        if (text !== slot.lastText) {
          slot.lastText = text;
          if (text) {
            slot.activeIdx = crossfade(slot.layers, slot.activeIdx, text.replace(/\n/g, '<br>'));
          } else {
            fadeOut(slot.layers, slot.activeIdx);
          }
        }
      });

      // Hide slots that are no longer active
      for (const key in _slots) {
        if (!activeKeys.has(key)) {
          const slot = _slots[key];
          if (slot.lastText !== "") {
            slot.lastText = "";
            fadeOut(slot.layers, slot.activeIdx);
          }
          slot.el.style.opacity = 0;
        }
      }

      // Glow tiles with active whispers
      _allSlivers.forEach(s => {
        s.el.classList.toggle("tl-whisper-glow", glowingSlivers.has(s));
      });
    }

    function updateScrollHint() {
      if (!scrollHint) return;
      // Don't touch hint while auto-scrolling (it's hidden by the auto-scroller)
      if (_autoScrolling) return;
      const st = modalCard.scrollTop;
      const maxS = modalCard.scrollHeight - modalCard.clientHeight;
      // Show hint whenever there's more to scroll, hide at bottom
      const opacity = (st >= maxS - 1) ? 0 : 1;
      scrollHint.style.opacity = opacity;
      scrollHint.style.pointerEvents = opacity < 0.1 ? 'none' : '';
    }

    // ── Overscroll bounce ────────────────────────────────────
    let _bouncing = false;
    function checkOverscrollBounce() {
      if (_bouncing) return;
      const st = modalCard.scrollTop;
      const maxScroll = modalCard.scrollHeight - modalCard.clientHeight;
      if (st <= 0 || st >= maxScroll) {
        _bouncing = true;
        const dir = st <= 0 ? 1 : -1;  // 1 = bounce down, -1 = bounce up
        modalCard.style.transition = 'transform 0.15s ease-out';
        modalCard.style.transform = `translateY(${dir * 12}px)`;
        setTimeout(() => {
          modalCard.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
          modalCard.style.transform = '';
          setTimeout(() => {
            modalCard.style.transition = '';
            _bouncing = false;
          }, 300);
        }, 150);
      }
    }

    modalCard.addEventListener("scroll", () => { updateWhispers(); updateScrollHint(); checkOverscrollBounce(); }, { passive: true });

    timelineBuilt = true;
  }

  /** Rebuild ruler marks and gridlines for the current visible range */
  function rebuildRuler() {
    // Remove old ruler elements
    _container.querySelectorAll(".tl-ruler-year, .tl-ruler-month, .tl-gridline").forEach(e => e.remove());

    // Compute visible range
    const visible = _allSlivers.filter(s => !s.el.classList.contains("tl-hidden"));
    if (visible.length === 0) { _container.style.height = "0px"; return; }

    let visMin = Infinity, visMax = -Infinity;
    visible.forEach(s => {
      if (s.startOff < visMin) visMin = s.startOff;
      if (s.endOff   > visMax) visMax = s.endOff;
    });
    // Extra seasons above & below for visual breathing room
    visMin -= 6;
    visMax += 9;

    const totalH = (visMax - visMin + 1) * MONTH_H + CALENDAR_PAD * 2;
    _container.style.height = totalH + "px";

    const SEASON_MONTHS = { 2: "Spring", 5: "Summer", 8: "Fall", 11: "Winter" };

    for (let am = visMax; am >= visMin; am--) {
      const y = Math.floor(am / 12);
      const m = am - y * 12;
      const top = CALENDAR_PAD + (visMax - am) * MONTH_H;

      if (m === 0) {
        const yl = document.createElement("div");
        yl.className = "tl-ruler-year";
        yl.style.top = top + "px";
        yl.textContent = y;
        _container.appendChild(yl);
      }

      if (SEASON_MONTHS[m] !== undefined) {
        const tick = document.createElement("div");
        tick.className = "tl-ruler-month";
        tick.style.top = top + "px";
        tick.style.height = (MONTH_H * 3) + "px";
        tick.innerHTML = `<span>${SEASON_MONTHS[m]}</span>`;
        _container.appendChild(tick);
      }

      // Gridlines only at year and season boundaries
      if (m === 0) {
        const line = document.createElement("div");
        line.className = "tl-gridline tl-gridline-year";
        line.style.top = top + "px";
        _container.appendChild(line);
      } else if (SEASON_MONTHS[m] !== undefined) {
        const line = document.createElement("div");
        line.className = "tl-gridline tl-gridline-season";
        line.style.top = top + "px";
        _container.appendChild(line);
      }
    }
  }

  /** Greedy column assignment: place each sliver in the leftmost column
   *  where it doesn't overlap an existing sliver. */
  function assignColumns(slivers) {
    const colEnds = []; // colEnds[i] = last endOff in that column
    slivers.forEach(s => {
      let placed = false;
      for (let c = 0; c < colEnds.length; c++) {
        if (s.startOff > colEnds[c]) { // no overlap
          s.col = c;
          colEnds[c] = s.endOff;
          placed = true;
          break;
        }
      }
      if (!placed) {
        s.col = colEnds.length;
        colEnds.push(s.endOff);
      }
    });
  }

  /** Compute width + left for each visible sliver.
   *  Event-based sweep: build START/END events, sort by month, sweep once
   *  maintaining an active set. Each sliver remembers the peak concurrency
   *  it experienced and its column index at that peak. O(N log N) sort +
   *  O(E) sweep where E = 2N events — no per-month iteration over the
   *  full calendar range. */
  function repackSlivers() {
    const visible = _allSlivers.filter(s => !s.el.classList.contains("tl-hidden"));
    if (visible.length === 0) return;

    // Compute visible range for dynamic top/height
    let visMin = Infinity, visMax = -Infinity;
    visible.forEach(s => {
      if (s.startOff < visMin) visMin = s.startOff;
      if (s.endOff   > visMax) visMax = s.endOff;
    });
    // Extra seasons to match ruler
    visMin -= 6;
    visMax += 9;

    /* ---- 1. Build events ---- */
    const START = 0, END = 1;
    const events = [];
    visible.forEach(s => {
      events.push({ mo: s.startOff,     type: START, sliver: s });
      events.push({ mo: s.endOff + 0.5, type: END,   sliver: s });
    });
    events.sort((a, b) => a.mo - b.mo || a.type - b.type);

    /* ---- 2. Sweep ---- */
    const active  = new Set();
    const col     = new Map();
    const peakN   = new Map();
    const peakCol = new Map();

    for (const ev of events) {
      if (ev.type === START) {
        const usedCols = new Set();
        active.forEach(s => usedCols.add(col.get(s)));
        let c = 0;
        while (usedCols.has(c)) c++;
        col.set(ev.sliver, c);
        active.add(ev.sliver);

        const n = active.size;
        active.forEach(s => {
          if (n > (peakN.get(s) || 0)) {
            peakN.set(s, n);
            peakCol.set(s, col.get(s));
          }
        });
      } else {
        active.delete(ev.sliver);
      }
    }

    /* ---- 3. Position (top/height computed from visible range) ---- */
    const LEFT_MARGIN = 54;
    visible.forEach(s => {
      const spanMonths = s.endOff - s.startOff + 1;
      const top    = CALENDAR_PAD + (visMax - s.endOff) * MONTH_H;
      const height = spanMonths * MONTH_H;
      const cols = peakN.get(s) || 1;
      const idx  = peakCol.get(s) || 0;
      const pct  = 100 / cols;
      const gapTotal = (cols - 1) * GAP;
      s.el.style.position = "absolute";
      s.el.style.top    = top + "px";
      s.el.style.height = height + "px";
      s.el.style.left   = `calc(${LEFT_MARGIN}px + ${idx * pct}% - ${idx * LEFT_MARGIN / cols}px + ${idx * GAP / cols}px)`;
      s.el.style.width  = `calc(${pct}% - ${LEFT_MARGIN / cols}px - ${gapTotal / cols}px)`;
    });
  }

  /* ── Whisper accomplishments for tall slivers ───────────── */
  const whisperData = {
    /* ── Multi-whisper (tall slivers) ── */
    "microsoft|SWE I &amp; II": [
      "🌐 8B+<sup>INF/DAY</sup>",
      "🔒 Champ<sup>SEC</sup>",
      "🎯 Champ<sup>DRI</sup>",
      "☁️ 50+<sup>DCs</sup>",
      "🚀 GA",
      "📡 Envoy",
    ],
    "bitnaughts": [
      "🎮 Code<sup>Gamified</sup>",
      "👁️ See<sup>CODE</sup>",
      "🔄 Try<sup>CODE</sup>",
      "🎓 Learn<sup>CODE</sup>",
      "💻 4<sup>Hacks</sup>",
      "🌍 Play<sup>It</sup>",
    ],
    "redtierobotics|Electrician": [
      "⚡ AMAX",
    ],
    "redtierobotics|Electrical Lead": [
      "🔌 CAD",
    ],
    "redtierobotics|Treasurer": [
      "💰 $18K+<sup>Budget</sup>",
    ],
    "voodoo": [
      "🎨 Pixel<sup>Art</sup>",
    ],
    "the-nobles": [
      "👑 Mardu<sup>Vamps</sup>",
    ],
    "the-demons": [
      "👹 Orzhov<sup>Aristo</sup>",
    ],
    "duskrosecodex": [
      "📖 Codex",
    ],

    /* ── Single-whisper (coSlumn) ── */
    "microsoft|Senior SWE": [
      "🧠 A.I.<sup>U.X.</sup>",
    ],
    "microsoft|SWE Intern": [
      "⚡ MLOps",
    ],
    "marp": [
      "🤖 Robot",
    ],
    "iterate": [
      "🏆 $5,000",
    ],
    "ventana": [
      "🔬 A.I.",
    ],
    "home-iot": [
      "🎛️ Control",
    ],
    "azuremlops": [
      "🏗️ CI/CD",
    ],
    "chemistry": [
      "🧪 A.R.",
    ],
    "firmi": [
      "💎 Fermi",
    ],
    "hackmerced": [
      "🧑‍💻 350+",
    ],
    "motleymoves": [
      "🏃 Running",
    ],
    "andeslab": [
      "🏭 HVAC",
    ],
    "breeze": [
      "💨 Aux<sup>Air</sup>",
    ],
    "dogpark": [
      "🥈 2<sup>ND</sup>",
    ],
    "vicelab": [
      "🛰️ Ag<sup>A.I.</sup>",
    ],
    "maces": [
      "🚀 NASA",
    ],
    "citris|Event Organizer": [
      "🏙️ Cyber<sup>Aware</sup>",
    ],
    "citris|Web Developer": [
      "🏙️ Git<sup>Ops</sup>",
    ],
    "amaxesd": [
      "⚡ ESD",
    ],
    "summerofgamedesign|Instructor": [
      "👨‍🏫 50+<sup>Students</sup>",
    ],
    "summerofgamedesign|Founder": [
      "💰 $25K+<sup>Budget</sup>",
    ],
    "alamorobotics": [
      "🤖 Mindstorm",
    ],
    "acm": [
      "💻 Outreach",
    ],
    "learnbeat": [
      "📚 Learn<sup>STEM</sup>",
    ],

    /* ── Education single-whispers ── */
    "cse180": [
      "🤖 ROS",
    ],
    "cse165": [
      "📦 OOP",
    ],
    "cse160": [
      "🌐 TCP",
    ],
    "cse120": [
      "💻 SWE",
    ],
    "cse111": [
      "🗃️ SQL",
    ],
    "cse100": [
      "📊 BigO",
    ],
    "cse031": [
      "⚙️ MIPS",
    ],
    "cse030": [
      "📚 C<sup>++</sup>",
    ],
    "cse015": [
      "🔢 Proofs",
    ],
    "ropgamedesign": [
      "🕹️ Unity",
    ],
    "roparchitecture": [
      "🏗️ CAD",
    ],
    "apjava": [
      "☕ Java",
    ],

    /* ── Hackathon single-whispers ── */
    "gasleek": [
      "🥇 1<sup>st</sup>",
    ],
    "sriracha": [
      "🥉 3<sup>rd</sup>",
    ],
    "smartank": [
      "🥇 Hardware",
    ],
    "spaceninjas": [
      "🥷 Platformer",
    ],
    "graviton": [
      "🌸 Tower<sup>Def</sup>",
    ],
    "galconq": [
      "🌌 4<sup>x</sup>",
    ],
    "seerauber": [
      "🥈 2<sup>nd</sup>",
    ],
    "ozone": [
      "🥈 2<sup>nd</sup>",
    ],
    "blindsight": [
      "🥉 3<sup>rd</sup>",
    ],
    "motorskills": [
      "🥇 GCP",
    ],
    "gist": [
      "🥇 Environment",
    ],
    "digestquest": [
      "🥇 Design",
    ],
  };

  function getWhisperKey(item, titleOverride) {
    const key1 = titleOverride ? `${item.ID}|${titleOverride}` : item.ID;
    if (whisperData[key1]) return key1;
    return whisperData[item.ID] ? item.ID : null;
  }

  /** Build a single sliver DOM element */
  function buildSliver(s) {
    const { item, category, theme, r, titleOverride, nameOverride } = s;
    const cfg = themeConfig[theme] || themeConfig.software;

    const el = document.createElement("div");
    el.className = "tl-sliver";
    el.dataset.theme = theme;
    el.style.cursor = "pointer";
    el.style.borderLeftColor = `rgba(${cfg.color}, 0.8)`;
    el.style.setProperty("--tc", cfg.color);

    const cleanName = (nameOverride || item.NAME || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const winHtml = item.WIN && item.WIN.trim()
      ? `<span class="tl-win" title="${item.WIN}"><i class="fa fa-trophy"></i></span>` : "";
    const titleStr = titleOverride || item.TITLE || item.MOTTO || "";

    el.innerHTML =
      `<div class="tl-sliver-accent" style="background:linear-gradient(180deg, rgba(${cfg.color},0.12) 0%, transparent 40%);"></div>` +
      `<div class="tl-sliver-header">` +
        `<span class="tl-sliver-name">${cleanName}</span>` +
        winHtml +
      `</div>` +
      (titleStr ? `<div class="tl-sliver-title">${titleStr}</div>` : "") +
      `<div class="tl-sliver-meta">` +
        `<span><i class="fa fa-calendar"></i> ${r.display}</span>` +
        (item.LOCATION ? `<span><i class="fa fa-map-marker"></i> ${item.LOCATION}</span>` : "") +
      `</div>`;

    el.addEventListener("click", () => {
      openModal(category, item.ID);
    });

    return el;
  }
})();
