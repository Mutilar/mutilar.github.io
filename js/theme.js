// ═══════════════════════════════════════════════════════════════
//  THEME TOGGLE — light / dark mode
//  Default: dark. Persisted in localStorage. Toggle button
//  shows in hero, swaps to brand label when scrolled past.
// ═══════════════════════════════════════════════════════════════
(() => {
  "use strict";

  const STORAGE_KEY = "theme-mode";
  const LIGHT_CLASS = "light-mode";
  const SUN  = "☀️";   // shown when IN light mode
  const MOON = "🌙";   // shown when IN dark mode

  // ── Restore saved preference (default = dark) ─────────────
  const saved = localStorage.getItem(STORAGE_KEY);
  const isLight = saved === "light";
  if (isLight) document.documentElement.classList.add(LIGHT_CLASS);

  // ── Wait for DOM ──────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    const toggleNav   = document.getElementById("themeToggle");
    const toggleRadio = document.getElementById("themeToggleRadio");
    const iconNav     = document.getElementById("themeIcon");
    const navBrand    = document.getElementById("navBrand");
    const radioBrand  = document.getElementById("radioBrand");
    const hero        = document.getElementById("home");

    const allToggles = [toggleNav, toggleRadio].filter(Boolean);
    const allIcons   = allToggles.map(t => t.querySelector(".theme-toggle-icon"));
    const allLabels  = allToggles.map(t => t.querySelector(".theme-toggle-label"));

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

    // ── Bind click handlers ─────────────────────────────────
    allToggles.forEach(t => t.addEventListener("click", toggle));

    // ── Scroll-aware visibility ─────────────────────────────
    // On hero: show toggle, hide brand
    // Past hero: hide toggle, show brand
    function updateToggleVisibility() {
      if (!hero) return;
      const pastHome = window.scrollY > hero.offsetTop + hero.offsetHeight - 80;

      // Desktop toggle in nav
      if (toggleNav) toggleNav.classList.toggle("hidden", pastHome);

      // Mobile toggle in radio bar
      if (toggleRadio) toggleRadio.classList.toggle("hidden", pastHome);

      // Brand labels are handled by scroll.js — they show when pastHome
    }

    window.addEventListener("scroll", updateToggleVisibility, { passive: true });
    updateToggleVisibility();

    // ── Initial icon sync ───────────────────────────────
    syncIcons();
  });
})();
