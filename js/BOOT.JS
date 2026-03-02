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
  // If the page has a <meta name="settings-path">, use that.
  // Otherwise default to "SETTINGS.json" (same directory).
  var metaPath = document.querySelector('meta[name="settings-path"]');
  var settingsUrl = metaPath ? metaPath.getAttribute("content") : "SETTINGS.json";

  fetch(settingsUrl + "?v=" + Date.now())
    .then(function (r) { return r.ok ? r.json() : Promise.reject("HTTP " + r.status); })
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

      // ── 3. Nav brand ───────────────────────────────────────
      var navBrand = document.getElementById("navBrand");
      if (navBrand && s.identity) {
        var icon = navBrand.querySelector(".brand-icon");
        if (icon) icon.textContent = s.identity.emoji || "";
        // Set brand text (after the icon span)
        var brandText = navBrand.childNodes;
        for (var i = 0; i < brandText.length; i++) {
          if (brandText[i].nodeType === 3 && brandText[i].textContent.trim()) {
            brandText[i].textContent = " " + s.identity.name;
            break;
          }
        }
      }

      // Radio brand (mutilar-specific, safe to skip if absent)
      var radioBrand = document.getElementById("radioBrand");
      if (radioBrand && s.identity) {
        var rIcon = radioBrand.querySelector(".brand-icon");
        if (rIcon) rIcon.textContent = s.identity.emoji || "";
      }

      // ── 4. Nav links ───────────────────────────────────────
      if (s.nav && Array.isArray(s.nav)) {
        var nav = document.getElementById("mainNav");
        if (nav) {
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
      }

      // ── 5. Hero identity ───────────────────────────────────
      if (s.identity) {
        var heroName = document.querySelector(".hero-name");
        if (heroName) heroName.innerHTML = s.identity.name;

        var heroTagline = document.querySelector(".hero-tagline");
        if (heroTagline && s.identity.tagline) heroTagline.innerHTML = s.identity.tagline;

        var heroPortrait = document.querySelector(".hero-portrait");
        if (heroPortrait && s.identity.portrait) {
          if (heroPortrait.tagName === "IMG") {
            heroPortrait.src = s.identity.portrait;
            heroPortrait.alt = s.identity.name;
          }
        }

        var penguinEmoji = document.querySelector(".hero-penguin-emoji");
        if (penguinEmoji) penguinEmoji.textContent = s.identity.emoji || "";
      }

      // ── 6. Hero social links ───────────────────────────────
      if (s.social) {
        var heroLinks = document.querySelector(".hero-links");
        if (heroLinks) {
          // Build from social config
          heroLinks.innerHTML = "";
          _addSocialLink(heroLinks, s.social.linkedin,  "LinkedIn",  "fa-brands fa-linkedin");
          _addSocialLink(heroLinks, s.social.github,    "GitHub",    "fa-brands fa-github");
          _addSocialLink(heroLinks, s.social.twitter,   "Twitter",   "fa-brands fa-twitter");
          _addSocialLink(heroLinks, s.social.email,     "Email",     "fa fa-envelope");
          _addSocialLink(heroLinks, s.social.blog,      "Blog",      "fa fa-bookmark");
          _addSocialLink(heroLinks, s.social.reference, "Reference", "fa fa-eye");
          _addSocialLink(heroLinks, s.social.spotify,   "Spotify",   "fa-brands fa-spotify");
        }
      }

      // ── 7. Hero portrait link target ───────────────────────
      var portraitLink = document.querySelector(".hero-portrait-link");
      if (portraitLink && s.social) {
        var target = s.social.github || s.social.linkedin || "#";
        // Only set href if it's a plain link (not onclick-driven)
        if (!portraitLink.getAttribute("onclick")) {
          portraitLink.href = target;
          portraitLink.target = "_blank";
          portraitLink.rel = "noopener";
        }
      }

      // ── 8. Hero penguin background cycle ───────────────────
      _initHeroCycle(s);

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

      // ── 12. Scroll hint ─────────────────────────────────────
      if (s.hero) {
        var scrollHint = document.querySelector(".scroll-hint");
        if (scrollHint) {
          if (s.hero.scrollHintTarget) scrollHint.href = s.hero.scrollHintTarget;
          var hintLabel = scrollHint.querySelector("strong");
          if (hintLabel && s.hero.scrollHintLabel) hintLabel.textContent = s.hero.scrollHintLabel;
        }
      }

      // ── 13. Viz tiles (shared between both sites) ──────────
      if (s.vizTiles && Array.isArray(s.vizTiles)) {
        var vizContainer = document.getElementById("viz-cards");
        if (vizContainer) _hydrateVizTiles(vizContainer, s.vizTiles);
      }

      // ── 14. Landing page hydration ─────────────────────────
      if (s.landing) _hydrateLanding(s);

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
  // Renders an array of vizTile config objects into a container
  // as glassmorphic video-card tiles with toggler badges.
  function _hydrateVizTiles(container, tiles) {
    container.innerHTML = tiles.map(function (t) {
      // Action: either data-action/data-open or onclick
      var actionAttrs = "";
      if (t.action && t.open) {
        actionAttrs = ' data-action="' + t.action + '" data-open="' + t.open + '"';
      } else if (t.onclick) {
        actionAttrs = ' onclick="' + t.onclick + '"';
      }

      // Toggler badges
      var togglerHtml = "";
      if (t.togglers && t.togglers.length) {
        togglerHtml = t.togglers.map(function (tog, i) {
          var cls = "card-action-badge " + (tog.badge || "badge-dive") + " badge-toggler" + (tog.active ? " active" : "");
          var dataSrc = tog.src ? ' data-src="' + tog.src + '"' : "";
          var dataClick = tog.click ? ' data-click="' + tog.click + '"' : ' data-click=""';
          var style = i === 0 ? ' style="margin-left:auto;"' : "";
          var ariaLabel = tog.click ? ' aria-label="' + tog.label + '"' : "";
          return '<span class="' + cls + '"' + dataSrc + dataClick + style + ariaLabel + ' role="button" tabindex="0">' +
            '<span class="toggler-dot">' + (tog.dot || "🔵") + "</span> " + tog.label + "</span>";
        }).join("");
      }

      // Image or placeholder
      var contentHtml;
      if (t.img) {
        contentHtml = '<img src="' + t.img + '" alt="' + (t.imgAlt || t.label) + '"' +
          ' style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity 0.4s ease;" loading="lazy">';
      } else {
        contentHtml = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
          'font-size:4rem;opacity:0.25;">' + (t.placeholder || t.emoji || "") + "</div>";
      }

      return '<div class="glass-tile video-card reveal" style="cursor:pointer;" role="button" tabindex="0"' +
        ' aria-label="' + (t.ariaLabel || t.label) + '"' + actionAttrs +
        " onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}\">" +
        '<div class="video-label">' + (t.emoji || "") + " " + t.label + togglerHtml + "</div>" +
        '<div class="video-wrap">' + contentHtml + "</div>" +
        "</div>";
    }).join("");
  }

  // ── Landing page hydration ──────────────────────────────────
  // Only runs when SETTINGS.json contains a "landing" block.
  // Populates structural containers in index.html from config.
  // Layout mirrors mutilar: opaque band header → parallax glass-tile content.
  function _hydrateLanding(s) {
    var L = s.landing;

    // ── Concept band header ──────────────────────────────────
    if (L.concept) {
      var conceptHeading = document.getElementById("concept-heading");
      if (conceptHeading) conceptHeading.textContent = L.concept.heading || "";

      // Concept intro glass-tile (inside parallax window)
      var conceptIntro = document.getElementById("concept-intro");
      if (conceptIntro) {
        conceptIntro.innerHTML =
          '<div class="section-blurb">' +
          '<p class="landing-body" style="margin-bottom:1.2rem;">' + (L.concept.body || "") + "</p>" +
          (L.concept.emphasis ? '<p class="landing-body landing-emphasis">' + L.concept.emphasis + "</p>" : "") +
          (L.concept.insight ? '<div class="landing-insight"><p>' + L.concept.insight + "</p></div>" : "") +
          "</div>";
      }
    }

    // ── Acts grid (inside parallax window, separate glass-tile) ─
    if (L.acts && Array.isArray(L.acts)) {
      var actsGrid = document.getElementById("acts");
      if (actsGrid) {
        actsGrid.innerHTML = L.acts.map(function (act, i) {
          var accentVar = act.accent ? "var(--accent-" + act.accent + ")" : "var(--accent-1)";
          return '<div class="landing-act">' +
            '<div class="act-number" style="--tc: ' + accentVar + ';">' + (i + 1) + "</div>" +
            "<h3>" + (act.title || "") + "</h3>" +
            "<p>" + (act.body || "") + "</p>" +
            (act.result ? '<p class="act-result">' + act.result + "</p>" : "") +
            "</div>";
        }).join("");
      }
    }

    // ── Reference band header ────────────────────────────────
    if (L.reference) {
      var refHeading = document.getElementById("reference-heading");
      if (refHeading) refHeading.textContent = L.reference.heading || "";

      // Reference intro glass-tile
      var refIntro = document.getElementById("reference-intro");
      if (refIntro) {
        var introHtml = '<div class="section-blurb">';
        introHtml += '<p class="landing-body">' + (L.reference.body || "") + "</p>";

        // Features grid inside the intro card
        if (L.reference.features && L.reference.features.length) {
          introHtml += '<div class="landing-features">';
          L.reference.features.forEach(function (f) {
            introHtml += '<div class="feature-item"><i class="' + f.icon + '"></i> ' + f.label + "</div>";
          });
          introHtml += "</div>";
        }
        introHtml += "</div>";
        refIntro.innerHTML = introHtml;
      }

      // Reference cards grid — uses shared vizTiles renderer
      var refCards = document.getElementById("reference-cards");
      if (refCards && s.vizTiles && s.vizTiles.length) {
        _hydrateVizTiles(refCards, s.vizTiles);
      }
    }

    // ── CTA band ─────────────────────────────────────────────
    if (L.cta) {
      var ctaTile = document.getElementById("landing-cta-tile");
      if (ctaTile) {
        var ctaHtml = '<h2 class="section-heading reveal" style="margin-bottom:0.5rem;">' + (L.cta.heading || "") + "</h2>";
        ctaHtml += '<p class="landing-body" style="margin-bottom:0;">' + (L.cta.body || "") + "</p>";
        if (L.cta.buttons && L.cta.buttons.length) {
          ctaHtml += '<div class="landing-cta-row" style="margin-top:1.5rem;">';
          L.cta.buttons.forEach(function (btn) {
            var cls = "landing-cta" + (btn.style === "secondary" ? " landing-cta-secondary" : "");
            ctaHtml += '<a href="' + btn.href + '" class="' + cls + '" target="_blank" rel="noopener">';
            ctaHtml += '<i class="' + btn.icon + '"></i> ' + btn.label + "</a>";
          });
          ctaHtml += "</div>";
        }
        ctaTile.innerHTML = ctaHtml;
      }
    }

    // ── Footer ───────────────────────────────────────────────
    if (L.footer) {
      var footerText = document.querySelector(".landing-footer-text");
      if (footerText) {
        var fHtml = L.footer.text || "";
        if (L.footer.author) {
          fHtml += ' — by <a href="' + (L.footer.author.url || "#") + '" target="_blank" rel="noopener" class="landing-link">' + L.footer.author.name + "</a>";
        }
        footerText.innerHTML = fHtml;
      }
    }
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

  // ── Hero penguin background cycle ──────────────────────────
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

    // Build glowMap + emojis from config
    var glowMap = {};
    var emojis  = [];
    for (var i = 0; i < hero.cycle.length; i++) {
      emojis.push(hero.cycle[i][0]);
      glowMap[hero.cycle[i][0]] = hero.cycle[i][1];
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
      var tmp = front;
      front = back;
      back = tmp;

      if (circle && glowMap[emojis[idx]]) {
        circle.style.setProperty("--glow", glowMap[emojis[idx]]);
      }

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
      idx = 0;
      front = a; back = b;
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

    // Also respond to programmatic .hover class toggle
    new MutationObserver(function () {
      if (link.classList.contains("hover")) start();
      else if (!link.matches(":hover")) stop();
    }).observe(link, { attributes: true, attributeFilter: ["class"] });
  }

})();
