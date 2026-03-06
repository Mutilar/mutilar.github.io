// ═══════════════════════════════════════════════════════════════
//  JSON DATA LOADER — Universal schema-introspecting ingestion
//
//  Reads SETTINGS.json → data.path + data.sources to discover
//  every JSON file to load.  Each file is fetched, introspected,
//  and registered into the shared global maps consumed by VIZ.JS,
//  TIMELINE.JS, SKILLTREE.JS, MODALS.JS, and MAP.JS.
//
//  Adding a new dataset is zero-JS-change:
//    1. Drop FOO.json into the json/ folder.
//    2. Add "FOO.json" to SETTINGS.json → data.sources.
//    3. If FOO.json has sections[].items[] with DATE fields,
//       those items appear on the timeline automatically.
//    4. If items have domain/source/quadrant, they appear on
//       the knowledge graph automatically.
//    5. If a DOM element with id "{sectionId}-grid" exists,
//       entry cards are rendered there automatically.
//
//  Public API:
//    loadDataSource(name) → Promise<json>   (cached, single-fetch)
//    loadCardsJSON()      → alias for loadDataSource("CARDS")
//    modalState           → { sectionId: items[], … }
//    DATA_REGISTRY        → { sourceKey: rawJson, … }
// ═══════════════════════════════════════════════════════════════

// ── Data registry (key = lowercase source name sans .json) ───
const DATA_REGISTRY = {};
var _dataLoading = {};   // in-flight fetch promises

// ── Resolve the json/ base path from SETTINGS ────────────────
function _dataBasePath() {
  var s = window.__SETTINGS;
  return (s && s.data && s.data.path) || "";
}

/**
 * Load any JSON data source by name (cached, single-fetch).
 * @param {string} name  Source name, e.g. "CARDS" or "CARDS.json"
 * @returns {Promise<object|null>}
 */
function loadDataSource(name) {
  var key = name.replace(/\.json$/i, "").toLowerCase();
  if (DATA_REGISTRY[key]) return Promise.resolve(DATA_REGISTRY[key]);
  if (_dataLoading[key])  return _dataLoading[key];

  var file = name.endsWith(".json") ? name : name + ".json";
  var url  = _dataBasePath() + file + "?v=" + Date.now();

  _dataLoading[key] = fetch(url)
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " for " + file);
      return r.json();
    })
    .then(function (json) {
      DATA_REGISTRY[key] = json;
      return json;
    })
    .catch(function (err) {
      console.error("[loadDataSource:" + key + "]", err);
      return null;
    });
  return _dataLoading[key];
}

/** Backward-compatible alias consumed by MODALS.JS & SKILLTREE.JS */
function loadCardsJSON() { return loadDataSource("CARDS"); }

// ═══════════════════════════════════════════════════════════════
//  MODAL STATE  —  dynamic object, populated per-section at load
// ═══════════════════════════════════════════════════════════════
const modalState = {};

// ═══════════════════════════════════════════════════════════════
//  ENTRY CARD BUILDER  (unchanged — pure DOM factory)
// ═══════════════════════════════════════════════════════════════
function buildEntryCard(item, dataset, opts) {
  const hasGithub = item.GITHUB && item.GITHUB.trim() && item.GITHUB.trim() !== " ";
  const hasLocation = item.LOCATION && item.LOCATION.trim();
  const hasMotto = item.MOTTO && item.MOTTO.trim();
  const hasTitle = item.TITLE && item.TITLE.trim();
  const hasWin = item.WIN && item.WIN.trim();
  const hasPlay = item.PLAY && item.PLAY.trim();
  const imgExt = opts.imgExt || ".png";
  const modalImgExt = opts.modalImgExt || ".png";

  const card = document.createElement("div");
  card.className = "glass-tile glass-tile-clickable entry-card reveal";
  card.setAttribute("data-entry-id", item.ID);
  if (!item.DATE && !hasLocation) card.classList.add("entry-card-compact");

  card.innerHTML = `
    <div class="entry-header">
      <div class="entry-info">
        <div class="entry-name">${item.NAME}</div>
        <div class="entry-meta">
          ${item.DATE ? `<span><i class="fa fa-calendar"></i>${item.DATE}</span>` : ""}
          ${hasLocation ? `<span><i class="fa fa-map-marker"></i>${item.LOCATION}</span>` : ""}
        </div>
      </div>
      ${(hasTitle || hasWin || hasPlay) ? `<div class="entry-badges">
        ${hasWin ? `<div class="entry-win"><i class="fa fa-trophy"></i> ${item.WIN}</div>` : ""}
        ${hasPlay ? (item.PLAY.trim().startsWith('http') ? `<a href="${item.PLAY.trim()}" target="_blank" class="entry-play" onclick="event.stopPropagation();"><i class="fa fa-gamepad"></i> Play me!</a>` : `<a href="#" class="entry-play" onclick="event.preventDefault(); event.stopPropagation(); openModal('game', '${item.PLAY.trim()}', '${(item.NAME || '').replace(/'/g, "\\'")}', ${item.PLAY_W || 960}, ${item.PLAY_H || 600})"><i class="fa fa-gamepad"></i> Play me!</a>`) : ""}
        ${hasTitle ? item.TITLE.split(',').map(t => { const txt = t.trim(); const low = txt.toLowerCase(); const highlight = low.startsWith('senior') || txt.startsWith('🧛') || txt.startsWith('🧠') || txt.startsWith('🎮'); const cls = highlight ? 'entry-title entry-title-highlight' : 'entry-title'; const icon = low.startsWith('senior') ? '🧑‍💻 ' : ''; return `<div class="${cls}">${icon}${txt}</div>`; }).join('') : ""}
      </div>` : ""}
    </div>
    ${hasMotto ? `<div class="entry-motto">"${item.MOTTO}"</div>` : ""}
    ${hasGithub ? `<a href="${item.GITHUB}" target="_blank" class="entry-github" onclick="event.stopPropagation();"><i class="fa fa-github"></i> Open Source</a>` : ""}
  `;

  card.addEventListener("click", () => openModal('entry', dataset, item.ID, modalImgExt));
  if (window._revealObserver) window._revealObserver.observe(card);
  return card;
}

// ═══════════════════════════════════════════════════════════════
//  UNIVERSAL JSON INGESTION — schema-introspecting pipeline
//
//  For each loaded source, introspects top-level shape:
//    • sections[]       → populate modalState, render grids, build VIZ maps
//    • techCategories   → VIZ_TECH_CATEGORIES (MAP.JS)
//    • techTags         → VIZ_TECH_TAGS       (MAP.JS)
//    • timeline         → VIZ_TIMELINE.*      (TIMELINE.JS)
//    • categories       → stored in registry for SKILLTREE.JS
// ═══════════════════════════════════════════════════════════════

function _ingestSource(key, data) {
  // ── Sections: items[], modal state, VIZ maps, grid cards ──
  if (data.sections && Array.isArray(data.sections)) {
    data.sections.forEach(function (section) {
      var sectionId = section.id;
      if (!sectionId || !Array.isArray(section.items)) return;

      // Register in modalState for MODALS.JS
      modalState[sectionId] = section.items;

      // Build VIZ maps from item fields
      section.items.forEach(function (item) {
        if (!item.ID) return;
        if (item.domain)    VIZ_DOMAIN_MAP[item.ID]    = item.domain;
        VIZ_SOURCE_MAP[item.ID] = item.source || section.id;
        if (item.quadrant)  VIZ_QUADRANT_MAP[item.ID]  = item.quadrant;
        if (item.whisper)   VIZ_WHISPER_MAP[item.ID]   = item.whisper;
        if (item.shortname) VIZ_SHORTNAME_MAP[item.ID] = item.shortname;
      });

      // Render entry cards into matching grid (convention: "{sectionId}-grid")
      var g = document.getElementById(sectionId + "-grid");
      if (!g) return;
      var cfg = { imgExt: ".png", modalImgExt: ".png" };

      if (!section.items.length) {
        g.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-style:italic;padding:16px;">No items.</p>';
        return;
      }

      section.items.forEach(function (item) {
        // Items with a DECK field get deck-modal click override (data-driven, not section-name-driven)
        if (item.DECK && item.DECK.trim()) {
          var deckCard = buildEntryCard(item, sectionId, cfg);
          var clone = deckCard.cloneNode(true);
          if (window._revealObserver) window._revealObserver.observe(clone);
          clone.addEventListener("click", function () { openModal('deck', item); });
          g.appendChild(clone);
        } else {
          g.appendChild(buildEntryCard(item, sectionId, cfg));
        }
      });
    });
  }

  // ── Tech taxonomy for MAP.JS ──────────────────────────────
  if (data.techCategories) window.VIZ_TECH_CATEGORIES = data.techCategories;
  if (data.techTags)       window.VIZ_TECH_TAGS       = data.techTags;

  // ── Timeline metadata ─────────────────────────────────────
  if (data.timeline) {
    Object.assign(VIZ_TIMELINE.whispers,       data.timeline.whispers       || {});
    Object.assign(VIZ_TIMELINE.nameOverrides,  data.timeline.nameOverrides  || {});
    Object.assign(VIZ_TIMELINE.titleOverrides, data.timeline.titleOverrides || {});
  }
}

// ═══════════════════════════════════════════════════════════════
//  HERO RENDERER — builds #home parallax-window from hero{}
//
//  Reads SETTINGS for identity / social / cycle / accents.
//  HERO.json supplies only structural layout metadata.
// ═══════════════════════════════════════════════════════════════

function _renderHero(heroData) {
  var container = document.getElementById("hero");
  if (!container) return;

  var s = window.__SETTINGS || {};
  var h = heroData.hero || {};
  var identity = s.identity || {};
  var social   = s.social   || {};
  var accents  = s.accents  || [];

  // Resolve accent-order → data-colors for PARALLAX.JS
  var colorsAttr = "";
  if (h.accentOrder) {
    var colors = h.accentOrder.split(",").map(function (n) {
      var idx = parseInt(n.trim(), 10) - 1;
      return accents[idx] || "0,0,0";
    }).join("; ");
    colorsAttr = ' data-colors="' + colors + '"';
  }

  var firstEmoji = (s.hero && s.hero.cycle && s.hero.cycle[0])
    ? s.hero.cycle[0][0] : "🌎";

  var html = '<div class="parallax-window parallax-window-hero" id="' + (h.id || "home") + '"';
  if (h.attention != null) html += ' data-attention="' + h.attention + '"';
  html += colorsAttr + '>';

  html += '<div class="glass-tile hero-card reveal">';

  // Portrait link
  html += '<a class="hero-portrait-link" href="javascript:void(0)"';
  if (h.portraitAction) html += ' onclick="' + h.portraitAction + '"';
  html += '>';

  if (h.portraitType === "emoji") {
    html += '<span class="hero-portrait emoji-portrait" aria-label="' + (identity.name || "") + '">' + (identity.emoji || "") + '</span>';
  } else {
    html += '<img class="hero-portrait" src="' + (identity.portrait || "") + '" alt="' + (identity.name || "") + '">';
  }

  html += '<span class="hero-portrait-penguin" aria-hidden="true">';
  html += '<span class="hero-penguin-bg" id="heroPenguinBgA">' + firstEmoji + '</span>';
  html += '<span class="hero-penguin-bg hero-penguin-bg-b" id="heroPenguinBgB"></span>';
  html += '<span class="hero-penguin-emoji">' + (identity.emoji || "🐧") + '</span>';
  html += '</span></a>';

  // Hero text
  html += '<div class="hero-text">';
  html += '<h1 class="hero-name">' + (identity.name || "") + '</h1>';
  html += '<p class="hero-tagline">' + (identity.tagline || "") + '</p>';

  // Auth slot (populated by AUTH.JS if present)
  html += '<div class="auth-hero-slot" id="authHeroSlot"></div>';

  // Social links (same order used elsewhere)
  html += '<div class="hero-links">';
  var socialDefs = [
    { key: "linkedin",  icon: "fa-brands fa-linkedin",  title: "LinkedIn" },
    { key: "github",    icon: "fa-brands fa-github",    title: "GitHub" },
    { key: "twitter",   icon: "fa-brands fa-twitter",   title: "Twitter" },
    { key: "email",     icon: "fa fa-envelope",          title: "Email" },
    { key: "blog",      icon: "fa fa-bookmark",          title: "Blog" },
    { key: "reference", icon: "fa fa-eye",               title: "Reference" },
    { key: "spotify",   icon: "fa-brands fa-spotify",    title: "Spotify" }
  ];
  socialDefs.forEach(function (def) {
    if (social[def.key])
      html += '<a target="_blank" href="' + social[def.key] + '" title="' + def.title + '"><i class="' + def.icon + '"></i></a>';
  });
  html += '</div></div></div>';

  // Scroll hint
  var hint = h.scrollHint || {};
  if (hint.target) {
    html += '<a href="' + hint.target + '" class="scroll-hint">';
    html += '<strong>' + (hint.label || "") + '</strong>';
    html += '<span class="scroll-arrow">' + (hint.arrow || "") + '</span></a>';
  }

  html += '</div>'; // close parallax-window
  container.innerHTML = html;

  // Observe .reveal
  if (window._revealObserver)
    container.querySelectorAll(".reveal").forEach(function (el) {
      window._revealObserver.observe(el);
    });

  // Init hero cycle + tagline cycle + rescan parallax
  _initHeroCycle(s);
  _initTaglineCycle();
  if (window._rescanParallaxWindows) window._rescanParallaxWindows();
}

// ── Tagline scramble-decode cycle ────────────────────────────
var _SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*<>░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬";

// Strip HTML tags to get visible text for the scramble animation
function _stripHtml(html) {
  var tmp = document.createElement("span");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

function _initTaglineCycle() {
  var el = document.querySelector(".hero-tagline");
  if (!el) return;

  var raw = el.innerHTML;
  var phrases = raw.split(/<br\s*\/?>/i);
  if (phrases.length <= 1) return;

  // Pre-compute plain-text versions for the scramble animation
  var plainPhrases = phrases.map(_stripHtml);

  // Show first phrase immediately (as rendered HTML)
  el.innerHTML = phrases[0];
  var current = 0;
  var cycleTimer = null;
  var animFrame  = null;

  function scheduleNext() {
    cycleTimer = setTimeout(function () {
      current = (current + 1) % phrases.length;
      transitionTo(current);
    }, 2000);
  }

  function transitionTo(index) {
    var targetPlain = plainPhrases[index];
    var targetHtml  = phrases[index];
    var start   = performance.now();
    var dur     = 500;
    var charMs  = dur / (targetPlain.length || 1);

    function tick(now) {
      var age = now - start;
      if (age >= dur) {
        // Animation done — set full HTML so links/bold render
        el.innerHTML = targetHtml;
        scheduleNext();
        return;
      }
      var resolved = Math.floor(age / charMs);
      var result   = targetPlain.substring(0, resolved);
      var stepT    = Math.floor(age / 30);
      for (var i = resolved; i < targetPlain.length; i++) {
        if (targetPlain[i] === " ") { result += " "; }
        else {
          var idx = (i + stepT * 13 + targetPlain.charCodeAt(i) * 7) % _SCRAMBLE_CHARS.length;
          result += _SCRAMBLE_CHARS[Math.abs(idx)];
        }
      }
      el.textContent = result;
      animFrame = requestAnimationFrame(tick);
    }
    animFrame = requestAnimationFrame(tick);
  }

  scheduleNext();

  // Expose stop/restart for AUTH.JS takeover
  window._stopTaglineCycle = function () {
    clearTimeout(cycleTimer);  cycleTimer = null;
    cancelAnimationFrame(animFrame); animFrame = null;
  };
  window._restartTaglineCycle = function () {
    if (cycleTimer || animFrame) return;      // already running
    current = 0;
    el.innerHTML = phrases[0];
    scheduleNext();
  };
}

// ── Hero penguin background cycle ────────────────────────────
function _initHeroCycle(s) {
  var link = document.querySelector(".hero-portrait-link");
  if (!link) return;

  var hero = s && s.hero;
  if (!hero || !Array.isArray(hero.cycle) || hero.cycle.length < 2) return;

  var a       = document.getElementById("heroPenguinBgA");
  var b       = document.getElementById("heroPenguinBgB");
  var penguin = link.querySelector(".hero-penguin-emoji");
  var circle  = link.querySelector(".hero-portrait-penguin");
  if (!a || !b || !penguin) return;

  var accents = Array.isArray(s.accents) ? s.accents : [];
  var glowMap = {};
  var emojis  = [];
  for (var i = 0; i < hero.cycle.length; i++) {
    emojis.push(hero.cycle[i][0]);
    var c = hero.cycle[i][1];
    glowMap[hero.cycle[i][0]] = (typeof c === 'number' && accents[c])
      ? accents[c].replace(/\s/g, '') : String(c || '');
  }

  var HIDING_EMOJI = emojis[emojis.length - 1];
  var idx   = 0;
  var front = a;
  var back  = b;
  var timer = null;

  function step() {
    idx = (idx + 1) % emojis.length;
    back.textContent = emojis[idx];
    back.style.opacity = "0.35";
    front.style.opacity = "0";
    var tmp = front; front = back; back = tmp;
    if (circle && glowMap[emojis[idx]])
      circle.style.setProperty("--glow", glowMap[emojis[idx]]);
    if (emojis[idx] === HIDING_EMOJI) {
      penguin.style.transition = "opacity 0.8s ease";
      penguin.style.opacity = "0";
    } else if (penguin.style.opacity === "0") {
      penguin.style.transition = "opacity 0.8s ease";
      penguin.style.opacity = "1";
    }
  }

  function start() {
    if (timer) return;
    idx = 0; front = a; back = b;
    a.textContent = emojis[0];
    a.style.opacity = "0.35";
    b.style.opacity = "0";
    penguin.style.opacity = "";
    penguin.style.transition = "";
    if (circle) circle.style.setProperty("--glow", glowMap[emojis[0]]);
    timer = setInterval(step, 1000);
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    a.style.opacity = "0";
    b.style.opacity = "0";
    penguin.style.opacity = "";
    penguin.style.transition = "";
  }

  link.addEventListener("mouseenter", start);
  link.addEventListener("mouseleave", stop);

  new MutationObserver(function () {
    if (link.classList.contains("hover")) start();
    else if (!link.matches(":hover")) stop();
  }).observe(link, { attributes: true, attributeFilter: ["class"] });
}

// ═══════════════════════════════════════════════════════════════
//  SECTION RENDERER — builds band + parallax-window from header{}
//
//  Each per-section JSON can include a "header" block that defines
//  the opaque band (heading, badges) and parallax window (intro
//  blurb, video cards, grid placeholder, scroll hint).
//  This removes all hardcoded section HTML from index.html,
//  making the page entirely data-driven.
// ═══════════════════════════════════════════════════════════════

function _buildBadgeHtml(b) {
  var tag = b.static ? "span" : "a";
  var cls = "section-badge"
    + (b.glow ? " section-badge-glow" : "")
    + (b.desktopOnly ? " badge-desktop" : "");
  var attrs = ' class="' + cls + '"';

  if (!b.static) {
    attrs += ' href="' + (b.href || "#") + '"';
    if (b.external) attrs += ' target="_blank"';
    if (b.action === "modal")
      attrs += " onclick=\"event.preventDefault(); openModal('" + b.target + "');\"";
    else if (b.action === "link-modal")
      attrs += " onclick=\"event.preventDefault(); openModal('link', '" + (b.actionTarget || b.href) + "', '" + (b.title || "") + "');\"";
  }

  var inner = "";
  if (b.icon) inner += '<i class="' + b.icon + '"></i> ';
  if (b.shortLabel)
    inner += '<span class="badge-long">' + b.label + '</span><span class="badge-short">' + b.shortLabel + '</span>';
  else
    inner += b.label;
  if (b.emphasis) inner = "<em>" + inner + "</em>";

  return "<" + tag + attrs + ">" + inner + "</" + tag + ">";
}

function _buildYoutubeSrcdoc(id, title) {
  return "<style>*{padding:0;margin:0;overflow:hidden}html,body{height:100%}"
    + "img,span{position:absolute;width:100%;top:0;bottom:0;margin:auto}"
    + "span{height:1.5em;text-align:center;font:48px/1.5 sans-serif;color:#fff;"
    + "text-shadow:0 0 .5em #000}</style><a href='https://www.youtube.com/embed/"
    + id + "?autoplay=1' title='Play video: " + title + "'><img src='https://img.youtube.com/vi/"
    + id + "/hqdefault.jpg' alt='" + title + " video thumbnail'>"
    + "<span aria-hidden='true'>&#x25BA;</span></a>";
}

function _buildVideoCardHtml(v) {
  var cls = "glass-tile video-card reveal";
  var tag = v.href ? "a" : "div";
  var styles = [];
  var attrs = "";

  if (v.href) {
    attrs += ' href="' + v.href + '"';
    if (v.external) attrs += ' target="_blank"';
    styles.push("cursor:pointer", "text-decoration:none", "color:inherit");
    attrs += ' role="link"';
    attrs += ' aria-label="' + (v.ariaLabel || v.label.replace(/<[^>]*>/g, "")) + '"';
  } else if (v.action) {
    styles.push("cursor:pointer");
    attrs += ' role="button" tabindex="0"';
    attrs += ' aria-label="' + (v.ariaLabel || v.label.replace(/<[^>]*>/g, "")) + '"';
    if (v.action === "mermaid") {
      attrs += " onclick=\"window.openMermaidModal && window.openMermaidModal('" + v.actionTarget + "')\"";
      attrs += " onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}\"";
    } else if (v.action === "bootfile") {
      attrs += " onclick=\"openModal('bootfile')\"";
      attrs += " onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}\"";
    } else if (v.action === "open") {
      attrs += ' data-action="open" data-open="' + v.actionTarget + '"';
    } else if (v.action === "scroll-modal") {
      attrs += ' data-action="scroll-modal"';
      attrs += ' data-scroll-to="' + v.scrollTo + '"';
      attrs += ' data-modal-dataset="' + v.modalDataset + '"';
      attrs += ' data-modal-id="' + v.modalId + '"';
    }
  }

  // Label
  var labelHtml = v.label;
  if (v.actionBadge) {
    if (v.actionBadgeStatic)
      labelHtml += '<span class="card-action-badge badge-static">' + v.actionBadge + "</span>";
    else
      labelHtml += '<span class="card-action-badge" style="--ba:var(--accent-1)">' + v.actionBadge + "</span>";
  }
  if (v.year)
    labelHtml += '<span class="year-badge">' + v.year + "</span>";

  // Content — varies by card type
  var contentHtml;
  if (v.type === "youtube") {
    var srcdoc = _buildYoutubeSrcdoc(v.youtubeId, v.title || v.label);
    contentHtml = '<div class="video-wrap"><iframe src="https://www.youtube.com/embed/' + v.youtubeId + '"'
      + ' srcdoc="' + srcdoc.replace(/"/g, "&quot;") + '"'
      + ' title="' + (v.title || v.label) + '"'
      + ' frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media;'
      + ' gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>';
  } else if (v.type === "detail") {
    contentHtml = '<div class="footer-detail-list" style="padding:0 14px 14px;">';
    if (v.details) {
      v.details.forEach(function (d) {
        contentHtml += '<div class="footer-detail-item">'
          + '<span class="footer-detail-icon"><i class="' + d.icon + '"></i></span>'
          + '<div><strong>' + d.title + '</strong>';
        if (d.desc) contentHtml += '<span class="footer-detail-desc">' + d.desc + '</span>';
        contentHtml += '</div></div>';
      });
    }
    if (v.detailRow) {
      contentHtml += '<div class="footer-detail-row">';
      v.detailRow.forEach(function (d) {
        contentHtml += '<div class="footer-detail-item">'
          + '<span class="footer-detail-icon"><i class="' + d.icon + '"></i></span>'
          + '<div><strong>' + d.title + '</strong></div></div>';
      });
      contentHtml += '</div>';
    }
    contentHtml += '</div>';
  } else if (v.type === "icon") {
    contentHtml = '<div class="video-wrap" style="display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);">'
      + '<span style="font-size:4rem;filter:drop-shadow(0 0 12px rgba(var(--accent-1),0.5));">' + v.emoji + '</span></div>';
  } else {
    contentHtml = '<div class="video-wrap"><img src="' + v.src + '" alt="' + (v.alt || v.label) + '"'
      + ' style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" loading="lazy"></div>';
  }

  var styleAttr = styles.length ? ' style="' + styles.join(";") + ';"' : "";
  return '<' + tag + ' class="' + cls + '"' + attrs + styleAttr + '>'
    + '<div class="video-label">' + labelHtml + "</div>"
    + contentHtml + '</' + tag + '>';
}

/**
 * Render all section headers into #sections.
 * Called before _ingestSource so that grid placeholder elements exist
 * when entry cards are appended.
 */
function _renderSections(headerEntries) {
  var container = document.getElementById("sections");
  if (!container || !headerEntries.length) return;

  var accents = (window.__SETTINGS && window.__SETTINGS.accents) || [];
  var html = "";
  var _pendingViz = [];

  headerEntries.forEach(function (entry) {
    var h = entry.header;
    if (!h || !h.id) return;

    // ── 1. Opaque Band ──
    html += '<div class="opaque-band" id="' + h.id + '">'
      + '<div class="band-content band-header">'
      + '<h2 class="section-heading reveal" style="margin-bottom:0;">' + h.heading + "</h2>";
    if (h.badges && h.badges.length) {
      if (h.badges.length === 1) {
        html += _buildBadgeHtml(h.badges[0]);
      } else {
        html += '<div class="section-badge-group">';
        h.badges.forEach(function (b) { html += _buildBadgeHtml(b); });
        html += "</div>";
      }
    }
    html += "</div></div>";

    // ── 2. Parallax Window ──
    var windowCls = "parallax-window";
    if (h.frosted)          windowCls += " footer-pane";
    else if (h.windowClass) windowCls += " " + h.windowClass;
    else                    windowCls += " parallax-section-padding";

    html += '<div class="' + windowCls + '"';
    if (h.frosted) html += ' id="footer-pane"';
    if (h.attention != null) html += ' data-attention="' + h.attention + '"';
    if (h.windowStyle) html += ' style="' + h.windowStyle + '"';
    // Resolve accent-order indices → RGB data-colors for PARALLAX.JS
    if (h.accentOrder) {
      var colors = h.accentOrder.split(",").map(function (n) {
        var idx = parseInt(n.trim(), 10) - 1;
        return accents[idx] || "0,0,0";
      }).join("; ");
      html += ' data-colors="' + colors + '"';
    }
    html += '>';

    // ── Wrapper ──
    var hasWrapper = !h.noWrapper;
    if (hasWrapper) {
      if (h.frosted) html += '<div class="footer-pane-inner">';
      else           html += '<div style="max-width:1100px;margin:0 auto;">';
    }

    // ── 2a. Connect block (reads heading/subtitle from SETTINGS.connect) ──
    if (h.connect) {
      var conn = (window.__SETTINGS && window.__SETTINGS.connect) || {};
      var connTitle = conn.heading || "";
      var connSub   = conn.subtitle || "";
      html += '<div class="glass-tile reveal" style="text-align:center; max-width:560px; width:100%; margin:0 24px;">';
      if (connTitle) html += '<h2 style="font-size:26px; font-weight:700; margin-bottom:12px;">' + connTitle + '</h2>';
      if (connSub)   html += '<p class="connect-subtitle" style="font-size:15px; margin-bottom:24px;">' + connSub + '</p>';
      if (h.connect.social) {
        var soc = (window.__SETTINGS && window.__SETTINGS.social) || {};
        html += '<div class="hero-links" style="justify-content:center;">';
        var socials = [
          { key: "linkedin", icon: "fa-linkedin",  title: "LinkedIn" },
          { key: "github",   icon: "fa-github",    title: "GitHub" },
          { key: "twitter",  icon: "fa-twitter",   title: "Twitter" },
          { key: "email",    icon: "fa-envelope",   title: "Email" },
          { key: "blog",     icon: "fa-bookmark",   title: "Blog" },
          { key: "spotify",  icon: "fa-spotify",    title: "Spotify" }
        ];
        socials.forEach(function (s) {
          if (soc[s.key]) html += '<a target="_blank" href="' + soc[s.key] + '" title="' + s.title + '"><i class="fa ' + s.icon + '"></i></a>';
        });
        html += '</div>';
      }
      html += '</div>';
    }

    // ── 2b. Section Intro ──
    if (h.intro) {
      var introCls = "glass-tile reveal section-intro" + (h.frosted ? " footer-intro" : "");
      html += '<div class="' + introCls + '" style="margin-bottom:32px;">';
      if (h.intro.img)
        html += '<img class="section-intro-img" src="' + h.intro.img
          + '" alt="' + (h.intro.alt || "") + '" loading="lazy">';
      html += '<div class="section-blurb">';
      var alignCls = { left: "step-left", center: "step-center", right: "step-right" };
      if (h.intro.steps) {
        h.intro.steps.forEach(function (step) {
          html += '<div class="step ' + (alignCls[step.align] || "step-left") + '">'
            + step.html + "</div>";
        });
      }
      if (h.intro.summary)
        html += '<div class="step-summary">' + h.intro.summary + "</div>";
      html += "</div></div>";
    }

    // ── 2c. Header Items (unified: videos, grid, viz, extras) ──
    // Backward compat: normalize legacy videos/extras/grid into headerItems
    if (!h.headerItems) {
      var _hi = [];
      if (h.videos && h.videos.length) _hi = _hi.concat(h.videos);
      if (!h.noGrid) _hi.push({ type: "grid", id: h.gridId || (h.id + "-grid"), wide: !!h.gridWide, style: h.gridStyle || "" });
      if (h.extras && h.extras.length) _hi = _hi.concat(h.extras);
      if (_hi.length) h.headerItems = _hi;
    }
    if (h.headerItems && h.headerItems.length) {
      // Single unified container for all item types
      var gridCls = "card-grid card-grid-wide";
      var gridStyle = "margin-bottom:32px;";
      html += '<div class="' + gridCls + '" style="' + gridStyle + '">';
      h.headerItems.forEach(function (item) {
        if (item.type === "grid") {
          html += '<div style="display:contents;" id="' + (item.id || h.id + "-grid") + '"'
            + "></div>";
        } else if (item.type === "viz") {
          var vizId = item.id || (h.id + "-viz");
          html += '<div style="display:contents;" id="' + vizId + '"'
            + "></div>";
          _pendingViz.push({ id: vizId, tiles: item.tiles });
        } else {
          html += _buildVideoCardHtml(item);
        }
      });
      html += "</div>";
    }

    // ── 2f. Copyright footer ──
    if (h.copyrightFooter) {
      html += '<footer class="glass-footer"><p>';
      h.copyrightFooter.links.forEach(function (link, i) {
        if (i > 0) html += '<br>';
        html += '<strong><a href="#" onclick="event.preventDefault(); ';
        if (link.action === "link-modal")
          html += "openModal('link', '" + link.href + "', '" + link.title + "');";
        else if (link.action === "modal")
          html += "openModal('" + link.target + "');";
        html += '" style="text-decoration:none;';
        if (link.action === "modal") html += 'cursor:pointer;';
        html += '">';
        if (link.emoji) html += link.emoji + ' ';
        if (link.icon)  html += '<i class="' + link.icon + '"></i> ';
        if (link.spanId) html += '<span id="' + link.spanId + '"></span>';
        if (link.label)  html += link.label;
        html += '</a></strong>';
      });
      html += '</p></footer>';
    }

    if (hasWrapper) html += "</div>"; // close wrapper

    // ── 2g. Scroll Hint ──
    if (h.scrollHint) {
      html += '<a href="' + h.scrollHint.target + '" class="scroll-hint">'
        + "<strong>" + h.scrollHint.label + "</strong>"
        + '<span class="scroll-arrow">' + h.scrollHint.arrow + "</span></a>";
    }

    html += "</div>"; // close parallax-window
  });

  container.innerHTML = html;

  // Observe .reveal elements now that they're in the DOM
  if (window._revealObserver)
    container.querySelectorAll(".reveal").forEach(function (el) {
      window._revealObserver.observe(el);
    });

  // Hydrate any viz containers declared via { type: "viz" } headerItems
  _pendingViz.forEach(function (pv) {
    var vizEl = document.getElementById(pv.id);
    if (vizEl && !vizEl.children.length && pv.tiles && pv.tiles.length && window._hydrateVizTiles) {
      window._hydrateVizTiles(vizEl, pv.tiles);
      if (window._revealObserver)
        vizEl.querySelectorAll(".reveal").forEach(function (el) {
          window._revealObserver.observe(el);
        });
    }
  });

  // Backward compat: hydrate viz-cards from SETTINGS.vizTiles if not already filled
  var vizEl = document.getElementById("viz-cards");
  var settings = window.__SETTINGS;
  if (vizEl && !vizEl.children.length && settings && settings.vizTiles && window._hydrateVizTiles) {
    window._hydrateVizTiles(vizEl, settings.vizTiles);
    if (window._revealObserver)
      vizEl.querySelectorAll(".reveal").forEach(function (el) {
        window._revealObserver.observe(el);
      });
  }

  // Set footer year (element created dynamically, BOOT.JS already ran)
  var fy = document.getElementById("footer-year");
  if (fy && !fy.textContent) fy.textContent = new Date().getFullYear();

  // Rescan parallax windows & scroll hints
  if (window._rescanParallaxWindows) window._rescanParallaxWindows();
}

// ── Boot: fetch all sources declared in SETTINGS.json ────────
(async () => {
  try {
    var cfg = (window.__SETTINGS && window.__SETTINGS.data) || {};
    var basePath = cfg.path || "";
    var sources  = cfg.sources || [];

    // Fetch all data sources in parallel
    var results = await Promise.all(sources.map(function (src) {
      var url = basePath + src + "?v=" + Date.now();
      return fetch(url)
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status + " for " + src);
          return r.json();
        })
        .then(function (json) {
          var key = src.replace(/\.json$/i, "").toLowerCase();
          DATA_REGISTRY[key] = json;
          return { key: key, data: json };
        })
        .catch(function (err) {
          console.error("[DATA] " + src + ":", err);
          return null;
        });
    }));

    // ── Render hero from HERO.json ────────────────────────
    results.forEach(function (r) {
      if (r && r.data && r.data.hero) _renderHero(r.data);
    });

    // ── Render section headers from per-section JSON ────────
    // Collect sources that declare a header{} block, sort by index,
    // and inject band + parallax-window DOM before _ingestSource
    // so that grid placeholder elements exist for entry cards.
    var headerEntries = [];
    results.forEach(function (r) {
      if (r && r.data && r.data.header) {
        headerEntries.push({ index: r.data.index || 0, header: r.data.header });
      }
    });
    if (headerEntries.length) {
      headerEntries.sort(function (a, b) { return a.index - b.index; });
      _renderSections(headerEntries);
    }

    // Ingest each source (order-independent — maps merge)
    results.forEach(function (r) {
      if (r) _ingestSource(r.key, r.data);
    });

    // ── Nav generation from per-section JSONs ──────────────
    // Each source with "index" + "nav" contributes a nav entry.
    // Sorted by index → replaces static nav from SETTINGS.json.
    var navEntries = [];
    results.forEach(function (r) {
      if (r && r.data && r.data.nav && typeof r.data.index === "number") {
        navEntries.push({ index: r.data.index, nav: r.data.nav });
      }
    });

    if (navEntries.length) {
      navEntries.sort(function (a, b) { return a.index - b.index; });
      var navEl = document.getElementById("mainNav");
      if (navEl) {
        var existing = navEl.querySelectorAll("a:not(.nav-brand)");
        existing.forEach(function (a) { a.remove(); });
        navEntries.forEach(function (entry, idx) {
          var a = document.createElement("a");
          a.href = entry.nav.href;
          a.textContent = entry.nav.label;
          if (idx === 0) a.className = "active";
          navEl.appendChild(a);
        });
      }
      // Re-cache sections for SCROLL.JS highlight
      if (window._cacheSections) window._cacheSections();
    }

    // Signal that all data is loaded
    window.dispatchEvent(new Event("portfolioDataReady"));

  } catch (err) {
    console.error("[DATA]", err);
  }
})();

// ── MARP BOM (Bill of Materials) — deferred until modal opens ──
let _bomLoaded = false;
const _origOpenMermaidModal = window.openMermaidModal;
window.openMermaidModal = function(mdFile, opts) {
  if (_origOpenMermaidModal) _origOpenMermaidModal(mdFile, opts);
  if (mdFile !== 'MARP.md' || _bomLoaded) return;
  _bomLoaded = true;
  const container = document.getElementById("marp-bom");
  if (!container) return;
  container.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-style:italic;">Loading BOM…</p>';
  fetch("archive/csv/marp-bom.json?v=" + Date.now()).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }).then(bom => {
    container.innerHTML = "";
    _buildBom(bom, container);
  }).catch(err => {
    console.error("[BOM]", err);
    container.innerHTML = '<p style="color:rgba(255,200,200,0.7);font-style:italic;">Failed to load BOM. Please refresh.</p>';
  });
};

function _buildBom(bom, container) {
  function buildTable(columns, rows) {
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    columns.forEach(col => { const th = document.createElement("th"); th.textContent = col; headerRow.appendChild(th); });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.forEach(row => {
      const tr = document.createElement("tr");
      columns.forEach(col => {
        const td = document.createElement("td");
        td.innerHTML = row[col] || "";
        // Ensure any dynamically inserted images get loading="lazy"
        td.querySelectorAll("img").forEach(img => { img.loading = "lazy"; });
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  bom.sections.forEach(section => {
    if (section.subsections) {
      const h4 = document.createElement("h4");
      h4.textContent = section.icon + " " + section.title;
      container.appendChild(h4);

      section.subsections.forEach(sub => {
        const h5 = document.createElement("h5");
        h5.textContent = sub.icon + " " + sub.title;
        container.appendChild(h5);
        container.appendChild(buildTable(sub.columns, sub.rows));
      });
    } else {
      const h4 = document.createElement("h4");
      h4.textContent = section.icon + " " + section.title;
      container.appendChild(h4);
      container.appendChild(buildTable(section.columns, section.rows));
    }
  });
}
