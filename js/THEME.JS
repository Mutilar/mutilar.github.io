// ═══════════════════════════════════════════════════════════════
//  THEME TOGGLE — light / dark mode
//  Default: dark. Persisted in localStorage.
//
//  Self-injecting: creates toggle button in #mainNav after brand.
//  Exposes window._createThemeToggle(id, cls) and
//         window._registerThemeToggle(btn) for RADIO.JS to use.
// ═══════════════════════════════════════════════════════════════
(() => {
  "use strict";

  const STORAGE_KEY = "theme-mode";
  const LIGHT_CLASS = "light-mode";
  const SUN  = "☀️";   // shown when IN light mode
  const MOON = "🌙";   // shown when IN dark mode

  // ── Restore saved preference (default = dark) ─────────────
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light") document.documentElement.classList.add(LIGHT_CLASS);

  // ── State ─────────────────────────────────────────────────
  const allToggles = [];
  const allIcons   = [];
  const allLabels  = [];

  function isLightMode() {
    return document.documentElement.classList.contains(LIGHT_CLASS);
  }

  function syncIcons() {
    const icon  = isLightMode() ? SUN : MOON;
    const label = isLightMode() ? "Light Mode" : "Dark Mode";
    allIcons.forEach(el => { if (el) el.textContent = icon; });
    allLabels.forEach(el => { if (el) el.textContent = label; });
    allToggles.forEach(t => {
      t.setAttribute("aria-pressed", String(isLightMode()));
      t.title = isLightMode() ? "Switch to dark mode" : "Switch to light mode";
      t.setAttribute("aria-label", t.title);
    });
  }

  function toggle() {
    const html = document.documentElement;

    // Crossfade: fade out icon+label, swap, fade back in
    allIcons.concat(allLabels).forEach(el => {
      if (el) el.style.opacity = "0";
    });

    setTimeout(() => {
      html.classList.toggle(LIGHT_CLASS);
      localStorage.setItem(STORAGE_KEY, isLightMode() ? "light" : "dark");
      syncIcons();

      allIcons.concat(allLabels).forEach(el => {
        if (el) el.style.opacity = "1";
      });

      // Notify parallax renderer of theme change
      window.dispatchEvent(new CustomEvent("theme-changed", {
        detail: { light: isLightMode() }
      }));
    }, 250); // swap at midpoint of the 500ms crossfade
  }

  // ── Factory: build a toggle button ────────────────────────
  function _createToggle(id, extraClass) {
    var btn = document.createElement("button");
    btn.className = "theme-toggle" + (extraClass ? " " + extraClass : "");
    btn.id = id;
    btn.title = isLightMode() ? "Switch to dark mode" : "Switch to light mode";
    btn.setAttribute("aria-label", btn.title);
    btn.setAttribute("aria-pressed", String(isLightMode()));
    btn.innerHTML =
      '<span class="theme-toggle-icon">' + (isLightMode() ? SUN : MOON) + '</span>' +
      '<span class="theme-toggle-label">' + (isLightMode() ? "Light Mode" : "Dark Mode") + '</span>';
    return btn;
  }

  // ── Register a toggle (bind click, track for sync) ────────
  function _registerToggle(btn) {
    allToggles.push(btn);
    allIcons.push(btn.querySelector(".theme-toggle-icon"));
    allLabels.push(btn.querySelector(".theme-toggle-label"));
    btn.addEventListener("click", toggle);
  }

  // ── Public API consumed by RADIO.JS ───────────────────────
  window._createThemeToggle = _createToggle;
  window._registerThemeToggle = _registerToggle;

  // ── Inject nav toggle (after brand, created by BOOT.JS) ───
  var nav = document.getElementById("mainNav");
  if (nav) {
    var toggleNav = _createToggle("themeToggle", "");
    var brand = document.getElementById("navBrand");
    if (brand && brand.nextSibling) {
      nav.insertBefore(toggleNav, brand.nextSibling);
    } else {
      nav.appendChild(toggleNav);
    }
    _registerToggle(toggleNav);
  }

  // ── Scroll-aware visibility ─────────────────────────────
  // On hero: show toggle, hide brand
  // Past hero: hide toggle, show brand
  var hero = document.getElementById("home");
  function updateToggleVisibility() {
    if (!hero) return;
    var pastHome = window.scrollY > hero.offsetTop + hero.offsetHeight - 80;

    // Desktop toggle in nav
    var navToggle = document.getElementById("themeToggle");
    if (navToggle) navToggle.classList.toggle("hidden", pastHome);

    // Mobile toggle in radio bar (may not exist yet; RADIO.JS injects later)
    var radioToggle = document.getElementById("themeToggleRadio");
    if (radioToggle) radioToggle.classList.toggle("hidden", pastHome);
  }

  window.addEventListener("scroll", updateToggleVisibility, { passive: true });
  updateToggleVisibility();

  syncIcons();
})();
