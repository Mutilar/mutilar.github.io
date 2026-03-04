// ═══════════════════════════════════════════════════════════════
//  BOOT.JS — Settings-driven initialization
//
//  Fetches SETTINGS.json and hydrates the shared shell:
//    • <head> meta/title/OG/Twitter tags
//    • <nav> brand + links
//    • Hero identity, social links, tagline, portrait
//    • Hero penguin background cycle
//    • Footer text
//    • Console greeting
//
//  Fires `settingsReady` on window with the parsed settings
//  so downstream scripts can consume them without re-fetching.
//
//  Both bootfile.dev and mutilar.github.io load this first.
// ═══════════════════════════════════════════════════════════════

(function () {
  "use strict";

  // ── Resolve SETTINGS.json path ─────────────────────────────
  // If the bootstrap already loaded settings into __SETTINGS, use those.
  // Otherwise fetch via <meta name="settings-path"> or default path.
  var metaPath = document.querySelector('meta[name="settings-path"]');
  var settingsUrl = metaPath ? metaPath.getAttribute("content") : "json/SETTINGS.json";

  var _settingsPromise = window.__SETTINGS
    ? Promise.resolve(window.__SETTINGS)
    : fetch(settingsUrl + "?v=" + Date.now())
        .then(function (r) { return r.ok ? r.json() : Promise.reject("HTTP " + r.status); });

  _settingsPromise
    .then(function (s) {
      window.__SETTINGS = s;

      // ── 0. Accent palette injection ────────────────────────
      // Reads accents array from settings, sets --accent-1..4
      // on :root, plus generates dot-pulse keyframes and
      // hides radio player if no playlist.
      _injectAccents(s);
      _injectDotPulse(s);
      if (!s.media || !s.media.playlist || !s.media.playlist.length) {
        document.body.classList.add("radio-hidden");
      }

      // ── 1. Document title ──────────────────────────────────
      if (s.seo && s.seo.title) {
        document.title = s.seo.title;
      }

      // ── 2. Meta tags ───────────────────────────────────────
      if (s.seo) {
        _setMeta("description",         s.seo.description);
        _setMeta("author",              s.identity && s.identity.organization);
        _setMetaProp("og:title",        s.seo.ogTitle);
        _setMetaProp("og:description",  s.seo.ogDescription);
        _setMetaProp("og:image",        s.seo.ogImage);
        _setMetaProp("og:url",          s.seo.ogUrl);
        _setMeta("twitter:title",       s.seo.ogTitle,       "name");
        _setMeta("twitter:description", s.seo.ogDescription, "name");
        _setMeta("twitter:image",       s.seo.ogImage,       "name");
        if (s.seo.twitterSite) _setMeta("twitter:site", s.seo.twitterSite, "name");

        // Favicons
        if (s.seo.favicon)   _setLink("icon", s.seo.favicon, "image/x-icon");
        if (s.seo.favicon32) _setLink("icon", s.seo.favicon32, "image/png", "32x32");
        if (s.seo.favicon16) _setLink("icon", s.seo.favicon16, "image/png", "16x16");
        if (s.seo.touchIcon) _setLink("apple-touch-icon", s.seo.touchIcon, "image/png");
      }

      // ── 3. Nav brand (inject if absent, then hydrate) ──────
      var nav = document.getElementById("mainNav");
      if (nav && s.identity) {
        var navBrand = document.getElementById("navBrand");
        if (!navBrand) {
          navBrand = document.createElement("a");
          navBrand.href = "#home";
          navBrand.className = "nav-brand";
          navBrand.id = "navBrand";
          nav.prepend(navBrand);
        }
        navBrand.innerHTML = '<span class="brand-icon">' +
          (s.identity.emoji || '') + '</span> ' + (s.identity.name || '');
      }

      // Auth nav slot (shell for AUTH.JS — only when auth config present)
      if (nav && s.auth && !document.getElementById("authNavSlot")) {
        var authSlot = document.createElement("span");
        authSlot.id = "authNavSlot";
        authSlot.className = "auth-nav-slot";
        nav.appendChild(authSlot);
      }

      // ── 4. Nav links ───────────────────────────────────────
      if (s.nav && Array.isArray(s.nav) && nav) {
          // Remove existing nav links (keep brand + theme toggle)
          var existing = nav.querySelectorAll("a:not(.nav-brand)");
          existing.forEach(function (a) { a.remove(); });

          s.nav.forEach(function (item, idx) {
            var a = document.createElement("a");
            a.href = item.href;
            a.textContent = item.label;
            if (idx === 0) a.className = "active";
            nav.appendChild(a);
          });
      }

      // ── 5–8. Hero (identity, social, portrait, cycle)
      // Now rendered by DATA.JS from HERO.json

      // ── 9. Footer year ─────────────────────────────────────
      var footerYear = document.getElementById("footer-year");
      if (footerYear) footerYear.textContent = new Date().getFullYear();

      // ── 10. Console greeting ───────────────────────────────
      if (s.console && s.console.greeting) {
        console.log(s.console.greeting);
      }

      // ── 11. Connect section (mutilar) ──────────────────────
      if (s.connect) {
        var connectH2 = document.querySelector(".parallax-window-gap h2");
        if (connectH2 && s.connect.heading) connectH2.innerHTML = s.connect.heading;
        var connectSub = document.querySelector(".connect-subtitle");
        if (connectSub && s.connect.subtitle) connectSub.innerHTML = s.connect.subtitle;

        // Duplicate social links in connect section
        var connectLinks = document.querySelector(".parallax-window-gap .hero-links");
        if (connectLinks && s.social) {
          connectLinks.innerHTML = "";
          _addSocialLink(connectLinks, s.social.linkedin, "LinkedIn",  "fa-brands fa-linkedin");
          _addSocialLink(connectLinks, s.social.github,   "GitHub",    "fa-brands fa-github");
          _addSocialLink(connectLinks, s.social.twitter,  "Twitter",   "fa-brands fa-twitter");
          _addSocialLink(connectLinks, s.social.email,    "Email",     "fa fa-envelope");
          _addSocialLink(connectLinks, s.social.blog,     "Blog",      "fa fa-bookmark");
          _addSocialLink(connectLinks, s.social.spotify,  "Spotify",   "fa-brands fa-spotify");
        }
      }

      // ── 12. Scroll hint — now rendered by DATA.JS from HERO.json

      // ── 13. Viz tiles (mutilar-specific top-level) ────────
      if (s.vizTiles && Array.isArray(s.vizTiles)) {
        var vizContainer = document.getElementById("viz-cards");
        if (vizContainer) _hydrateVizTiles(vizContainer, s.vizTiles);
      }

      // ── 14. Sections (generates band+parallax from array) ──
      if (s.sections && Array.isArray(s.sections)) _hydrateSections(s);

      // ── 15. Footer (page-level) ───────────────────────────
      if (s.footer) _hydrateFooter(s.footer);

      // ── Legacy: landing block (deprecated, backward compat) ─
      if (s.landing && !s.sections) _hydrateLandingLegacy(s);

      // ── Fire event ─────────────────────────────────────────
      window.dispatchEvent(new CustomEvent("settingsReady", { detail: s }));
    })
    .catch(function (err) { console.warn("[BOOT] SETTINGS.json:", err); });

  // ── Helper: set <meta> tag ─────────────────────────────────
  function _setMeta(name, value, attr) {
    if (!value) return;
    attr = attr || "name";
    var el = document.querySelector("meta[" + attr + '="' + name + '"]');
    if (el) {
      el.setAttribute("content", value);
    } else {
      el = document.createElement("meta");
      el.setAttribute(attr, name);
      el.setAttribute("content", value);
      document.head.appendChild(el);
    }
  }

  function _setMetaProp(prop, value) {
    if (!value) return;
    var el = document.querySelector('meta[property="' + prop + '"]');
    if (el) {
      el.setAttribute("content", value);
    } else {
      el = document.createElement("meta");
      el.setAttribute("property", prop);
      el.setAttribute("content", value);
      document.head.appendChild(el);
    }
  }

  // ── Helper: set/create <link> tag ──────────────────────────
  function _setLink(rel, href, type, sizes) {
    if (!href) return;
    var selector = 'link[rel="' + rel + '"]';
    if (sizes) selector += '[sizes="' + sizes + '"]';
    var el = document.querySelector(selector);
    if (!el) {
      el = document.createElement("link");
      el.rel = rel;
      if (type) el.type = type;
      if (sizes) el.setAttribute("sizes", sizes);
      document.head.appendChild(el);
    }
    el.href = href;
  }

  // ── Accent injection ───────────────────────────────────────
  // Reads accents array [rgb1, rgb2, rgb3, rgb4] from settings
  // and sets --accent-1..4 on :root, overriding CSS defaults.
  function _injectAccents(s) {
    if (!s.accents || !Array.isArray(s.accents)) return;
    var root = document.documentElement;
    for (var i = 0; i < s.accents.length && i < 4; i++) {
      root.style.setProperty("--accent-" + (i + 1), s.accents[i]);
    }
    // Inject data-colors onto parallax windows that declare data-accent-order
    // instead of hardcoding RGB. Format: "1,3,2,4" = accent indices (1-based).
    // Keeps explicit data-colors untouched (mutilar's per-window palettes).
    var windows = document.querySelectorAll(".parallax-window[data-accent-order]");
    for (var w = 0; w < windows.length; w++) {
      var el = windows[w];
      var order = el.getAttribute("data-accent-order").split(",");
      var colors = [];
      for (var j = 0; j < order.length; j++) {
        var idx = parseInt(order[j].trim(), 10) - 1;
        colors.push(s.accents[idx] || "0,0,0");
      }
      el.setAttribute("data-colors", colors.join("; "));
    }
  }

  // ── Dot-pulse keyframes (generated from accent palette) ────
  // Creates @keyframes dot-pulse that cycles through all 4 accents
  // and applies the animation to .logo-dot and .glass-nav .brand-icon.
  function _injectDotPulse(s) {
    if (!s.accents || !Array.isArray(s.accents) || s.accents.length < 2) return;
    var a = s.accents;
    var n = Math.min(a.length, 4);
    var steps = [];
    for (var i = 0; i < n; i++) {
      var pct = Math.round((i / n) * 100);
      var rgb = a[i];
      steps.push(pct + "% { color: rgb(" + rgb + "); text-shadow: 0 0 20px rgba(" + rgb + ", 0.6), 0 0 40px rgba(" + rgb + ", 0.3); }");
    }
    // Close the loop
    steps.push("100% { color: rgb(" + a[0] + "); text-shadow: 0 0 20px rgba(" + a[0] + ", 0.6), 0 0 40px rgba(" + a[0] + ", 0.3); }");

    var css = "@keyframes dot-pulse { " + steps.join(" ") + " }\n" +
      ".logo-dot { animation: dot-pulse " + (n * 1.5) + "s ease-in-out infinite; }\n" +
      ".glass-nav .nav-brand .brand-icon { animation: dot-pulse " + (n * 1.5) + "s ease-in-out infinite; }";

    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── Viz tiles renderer (shared by both sites) ───────────────
  // Renders vizTile configs as glassmorphic cards with radio-style
  // toggler badges. Selecting a toggler swaps the preview image and
  // controls which modal opens when the tile itself is clicked.
  //
  // If a tile has "mds": [...] instead of "togglers", auto-expand
  // the md file paths into togglers. Label = filename stem, accent
  // cycles 1-4, open = mermaidModal.  After render, async-fetch each
  // md's title: line and hot-swap the dot emoji on the badge.
  function _hydrateVizTiles(container, tiles) {
    // ── Auto-expand mds[] → togglers[] ──
    tiles.forEach(function (t) {
      if (t.mds && Array.isArray(t.mds) && t.mds.length) {
        t.togglers = t.mds.map(function (md, i) {
          var stem = md.replace(/.*\//, "").replace(/\.md$/i, "");
          return {
            label: stem,
            dot: "📄",
            accent: (i % 4) + 1,
            open: "mermaidModal",
            openArg: md,
            active: i === 0
          };
        });
      }
    });

    container.innerHTML = tiles.map(function (t) {
      // Determine initial open target from the active toggler
      var activeToggler = (t.togglers || []).filter(function (g) { return g.active; })[0] || (t.togglers || [])[0];
      var initialOpen    = activeToggler ? (activeToggler.open || "") : (t.open || "");
      var initialOpenArg = activeToggler ? (activeToggler.openArg || "") : "";

      // Toggler badges (radio buttons)
      var togglerHtml = "";
      if (t.togglers && t.togglers.length) {
        togglerHtml = t.togglers.map(function (tog, i) {
          var cls = "card-action-badge badge-toggler" + (tog.active ? " active" : "");
          var accentVar = "--ba:var(--accent-" + (tog.accent || 1) + ")";
          var dataSrc = tog.src ? ' data-src="' + tog.src + '"' : "";
          var dataOpen = tog.open ? ' data-open="' + tog.open + '"' : "";
          var dataOpenArg = tog.openArg ? ' data-open-arg="' + tog.openArg + '"' : "";
          var inlineStyle = accentVar + (i === 0 ? ";margin-left:auto" : "");
          return '<span class="' + cls + '"' + dataSrc + dataOpen + dataOpenArg +
            ' style="' + inlineStyle + '"' +
            ' aria-label="' + tog.label + '" role="radio" aria-checked="' + (tog.active ? "true" : "false") + '" tabindex="0">' +
            '<span class="toggler-dot">' + (tog.dot || "🔵") + "</span> " + tog.label + "</span>";
        }).join("");
      }

      // Image or placeholder
      var contentHtml;
      if (t.img) {
        contentHtml = '<img class="viz-tile-img" src="' + t.img + '" alt="' + (t.imgAlt || t.label) + '"' +
          ' style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity 0.4s ease;" loading="lazy">';
      } else {
        contentHtml = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
          'font-size:4rem;opacity:0.25;">' + (t.placeholder || t.emoji || "") + "</div>";
      }

      return '<div class="glass-tile video-card reveal" style="cursor:pointer;" role="button" tabindex="0"' +
        ' aria-label="' + (t.ariaLabel || t.label) + '"' +
        ' data-action="' + (t.action || "open") + '"' +
        ' data-open="' + initialOpen + '"' +
        (initialOpenArg ? ' data-open-arg="' + initialOpenArg + '"' : '') +
        " onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}\">" +
        '<div class="video-label">' + (t.emoji || "") + " " + t.label + togglerHtml + "</div>" +
        '<div class="video-wrap">' + contentHtml + "</div>" +
        "</div>";
    }).join("");

    // Wire toggler radio behavior via event delegation on the container
    container.addEventListener("click", function (e) {
      var toggler = e.target.closest(".badge-toggler");
      if (!toggler) return;
      e.stopPropagation();

      var tile = toggler.closest(".video-card");
      if (!tile) return;

      // Radio: deactivate siblings, activate this one
      tile.querySelectorAll(".badge-toggler").forEach(function (t) {
        t.classList.remove("active");
        t.setAttribute("aria-checked", "false");
      });
      toggler.classList.add("active");
      toggler.setAttribute("aria-checked", "true");

      // Swap preview image
      var newSrc = toggler.dataset.src;
      if (newSrc) {
        var img = tile.querySelector(".viz-tile-img");
        if (img) {
          img.style.opacity = "0";
          setTimeout(function () {
            img.src = newSrc;
            img.onload = function () { img.style.opacity = "1"; };
          }, 200);
        }
      }

      // Update the tile's open target
      var newOpen = toggler.dataset.open || "";
      tile.dataset.open = newOpen;
      if (toggler.dataset.openArg) {
        tile.dataset.openArg = toggler.dataset.openArg;
      } else {
        delete tile.dataset.openArg;
      }
    });

    // ── Async dot-emoji enrichment from mermaid title: lines ──
    // After initial render, fetch each md file's first few hundred
    // bytes, parse the `title: EMOJI TEXT` line, and hot-swap the
    // placeholder dot on the rendered badge with the real emoji.
    tiles.forEach(function (t) {
      if (!t.mds || !t.mds.length) return;
      t.mds.forEach(function (md) {
        fetch(md + "?v=" + Date.now())
          .then(function (r) { return r.ok ? r.text() : ""; })
          .then(function (text) {
            if (!text) return;
            var m = text.match(/title:\s*(.+)/);
            if (!m) return;
            var titleLine = m[1].trim();
            // Extract leading emoji(s) from title
            var emojiMatch = titleLine.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)/u);
            if (!emojiMatch) return;
            var emoji = emojiMatch[1];
            // Find the badge whose data-open-arg matches this md path
            var badge = container.querySelector('.badge-toggler[data-open-arg="' + md + '"] .toggler-dot');
            if (badge) badge.textContent = emoji;
          })
          .catch(function () {});
      });
    });
  }

  // Expose for DATA.JS to re-hydrate after dynamic section creation
  window._hydrateVizTiles = _hydrateVizTiles;

  // ── Sections renderer ────────────────────────────────────────
  // Generates mutilar-identical layout from settings.sections[]:
  //   opaque band header → parallax window with section-intro
  //   (optional img + blurb steps) + card-grid viz tiles.
  // Inserts into #sections container.
  function _hydrateSections(s) {
    var container = document.getElementById("sections");
    if (!container) return;

    var html = "";
    var accents = s.accents || [];

    s.sections.forEach(function (sec) {
      // ── Opaque band header ──
      html += '<div class="opaque-band" id="' + sec.id + '">';
      html += '<div class="band-content band-header">';
      html += '<h2 class="section-heading reveal" style="margin-bottom:0;">' + (sec.heading || "") + '</h2>';
      if (sec.body) {
        html += '<p class="landing-body" style="margin-bottom:0;">' + sec.body + '</p>';
      }
      if (sec.buttons && sec.buttons.length) {
        html += '<div class="landing-cta-row" style="margin-top:1.5rem;">';
        sec.buttons.forEach(function (btn) {
          var cls = "landing-cta" + (btn.style === "secondary" ? " landing-cta-secondary" : "");
          html += '<a href="' + btn.href + '" class="' + cls + '" target="_blank" rel="noopener">';
          html += '<i class="' + btn.icon + '"></i> ' + btn.label + '</a>';
        });
        html += '</div>';
      }
      if (sec.badge) {
        html += '<a class="section-badge" href="' + (sec.badge.href || "#") + '"' +
          (sec.badge.href && sec.badge.href !== "#" ? ' target="_blank"' : '') +
          '><i class="' + (sec.badge.icon || "fa fa-link") + '"></i> ' + (sec.badge.label || "") + '</a>';
      }
      html += '</div></div>';

      // ── Parallax window ──
      var accentOrder = sec.accentOrder || "1,2,3,4";
      // Resolve accent-order to data-colors
      var colors = accentOrder.split(",").map(function (n) {
        var idx = parseInt(n.trim(), 10) - 1;
        return accents[idx] || "0,0,0";
      }).join("; ");

      html += '<div class="parallax-window parallax-section-padding"' +
        ' data-attention="' + (sec.attention != null ? sec.attention : 0) + '"' +
        ' data-colors="' + colors + '">';
      html += '<div style="max-width:1100px;margin:0 auto;">';

      // ── Section intro (img + blurb steps) ──
      if (sec.blurb) {
        html += '<div class="glass-tile reveal section-intro" style="margin-bottom:32px;">';

        // Optional image
        if (sec.img) {
          html += '<img class="section-intro-img" src="' + sec.img + '"' +
            ' alt="' + (sec.heading || "").replace(/<[^>]*>/g, "") + '" loading="lazy">';
        }

        html += '<div class="section-blurb">';
        if (sec.blurb.left)    html += '<div class="step step-left">'   + sec.blurb.left    + '</div>';
        if (sec.blurb.center)  html += '<div class="step step-center">' + sec.blurb.center  + '</div>';
        if (sec.blurb.right)   html += '<div class="step step-right">'  + sec.blurb.right   + '</div>';
        if (sec.blurb.summary) html += '<div class="step-summary">'     + sec.blurb.summary + '</div>';
        html += '</div></div>';
      }

      // ── Viz tiles grid ──
      // vizTiles can be: an inline array, or true to inherit top-level s.vizTiles
      var secViz = Array.isArray(sec.vizTiles) ? sec.vizTiles
                 : (sec.vizTiles === true && s.vizTiles) ? s.vizTiles
                 : null;
      if (secViz && secViz.length) {
        html += '<div class="card-grid card-grid-wide" style="margin-bottom:32px;" id="' + sec.id + '-cards"></div>';
      }

      html += '</div>'; // close max-width wrapper

      // ── Scroll hint ──
      if (sec.scrollHint) {
        html += '<a href="' + (sec.scrollHint.target || "#") + '" class="scroll-hint">';
        html += '<strong>' + (sec.scrollHint.label || "") + '</strong>';
        html += '<span class="scroll-arrow">' + (sec.scrollHint.emoji || '<i class="fa fa-chevron-down"></i>') + '</span>';
        html += '</a>';
      }

      html += '</div>'; // close parallax-window
    });

    container.innerHTML = html;

    // Hydrate viz tile grids after DOM insertion
    s.sections.forEach(function (sec) {
      var secViz = Array.isArray(sec.vizTiles) ? sec.vizTiles
                 : (sec.vizTiles === true && s.vizTiles) ? s.vizTiles
                 : null;
      if (secViz && secViz.length) {
        var grid = document.getElementById(sec.id + "-cards");
        if (grid) _hydrateVizTiles(grid, secViz);
      }
    });
  }

  // ── Footer hydration (page-level) ──────────────────────────
  function _hydrateFooter(footer) {
    var footerText = document.querySelector(".landing-footer-text");
    if (!footerText) return;
    var fHtml = footer.text || "";
    if (footer.author) {
      fHtml += ' — by <a href="' + (footer.author.url || "#") + '" target="_blank" rel="noopener" class="landing-link">' + footer.author.name + "</a>";
    }
    footerText.innerHTML = fHtml;
  }

  // ── Legacy landing hydration (backward compat) ─────────────
  // Only runs if settings has "landing" but no "sections".
  function _hydrateLandingLegacy(s) {
    var L = s.landing;
    if (L.footer) _hydrateFooter(L.footer);
  }

  // ── Helper: add social link ────────────────────────────────
  function _addSocialLink(container, url, title, iconClass) {
    if (!url) return;
    var a = document.createElement("a");
    a.href = url;
    a.title = title;
    a.target = "_blank";
    a.rel = "noopener";
    var i = document.createElement("i");
    i.className = iconClass;
    a.appendChild(i);
    container.appendChild(a);
  }

  // ── Hero cycle — moved to DATA.JS (_initHeroCycle) ────────

})();
