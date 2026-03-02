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
        // Only hydrate hero-name if it has no child elements (custom markup)
        if (heroName && !heroName.querySelector("*")) {
          heroName.innerHTML = s.identity.name;
        }

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
