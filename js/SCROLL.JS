// ═══════════════════════════════════════════════════════════════
//  SCROLL REVEAL
// ═══════════════════════════════════════════════════════════════
(() => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReducedMotion) {
    // Skip scroll-reveal transitions — show everything immediately
    document.querySelectorAll(".reveal").forEach(el => el.classList.add("visible"));
    window._revealObserver = null;
    return;
  }

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add("visible");
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });

  document.querySelectorAll(".reveal").forEach(el => revealObserver.observe(el));
  window._revealObserver = revealObserver;

  // Re-observe any .reveal elements injected after settings hydrate
  window.addEventListener("settingsReady", function () {
    document.querySelectorAll(".reveal:not(.visible)").forEach(function (el) {
      revealObserver.observe(el);
    });
  });
})();

// ═══════════════════════════════════════════════════════════════
//  SCROLL-HINT FADE-OUT
//  Each hint fades out as its parent parallax-window scrolls up
//  so the hint is no longer near the viewport bottom.
// ═══════════════════════════════════════════════════════════════
(() => {
  let hints = document.querySelectorAll(".scroll-hint");

  function updateHints() {
    const vh = window.innerHeight;
    hints.forEach(hint => {
      const parent = hint.closest(".parallax-window");
      if (!parent) return;
      // Distance from the bottom of the parent to the bottom of the viewport
      const parentBottom = parent.getBoundingClientRect().bottom;
      // Fade zone: fully visible when parentBottom >= vh (hint at/below viewport bottom)
      // fully hidden when parentBottom <= 0 (scrolled entirely past)
      const fadeStart = vh;
      const fadeEnd   = 0;
      const t = Math.max(0, Math.min(1, (parentBottom - fadeEnd) / (fadeStart - fadeEnd)));
      hint.style.opacity = t;
      hint.style.pointerEvents = t < 0.1 ? "none" : "auto";
    });
  }

  window.addEventListener("scroll", updateHints, { passive: true });
  window.addEventListener("settingsReady", function () {
    hints = document.querySelectorAll(".scroll-hint");
    updateHints();
  });
  updateHints();
})();

// ═══════════════════════════════════════════════════════════════
//  BRAND LABEL — show after scrolling past Home
// ═══════════════════════════════════════════════════════════════
(() => {
  const navBrand = document.getElementById("navBrand");
  const radioBrand = document.getElementById("radioBrand");
  const hero = document.getElementById("home");
  if (!hero) return;

  function updateBrand() {
    const pastHome = window.scrollY > hero.offsetTop + hero.offsetHeight - 80;
    if (navBrand) navBrand.classList.toggle("visible", pastHome);
    if (radioBrand) radioBrand.classList.toggle("visible", pastHome);
  }

  window.addEventListener("scroll", updateBrand, { passive: true });
  updateBrand();
})();

// ═══════════════════════════════════════════════════════════════
//  ACTIVE NAV HIGHLIGHT
// ═══════════════════════════════════════════════════════════════
(() => {
  let navLinks = document.querySelectorAll(".glass-nav a");
  let sectionIds = Array.from(navLinks).map(a => a.getAttribute("href").substring(1));
  let sections = sectionIds.map(id => document.getElementById(id)).filter(Boolean);

  let prevActive = null;

  function rescanSections() {
    navLinks = document.querySelectorAll(".glass-nav a");
    sectionIds = Array.from(navLinks).map(a => a.getAttribute("href").substring(1));
    sections = sectionIds.map(id => document.getElementById(id)).filter(Boolean);
  }

  // Expose for DATA.JS to call after dynamic nav rebuild
  window._cacheSections = rescanSections;

  function updateActive() {
    let current = sectionIds[0];
    const navEl = document.querySelector(".glass-nav");
    const offset = navEl ? navEl.offsetHeight : 60;
    const scrollY = window.scrollY + offset;

    sections.forEach(el => {
      if (el.offsetTop <= scrollY) current = el.id;
    });

    navLinks.forEach(a => {
      const href = a.getAttribute("href").substring(1);
      const isActive = href === current;
      a.classList.toggle("active", isActive);
      if (isActive && current !== prevActive) {
        a.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    });
    prevActive = current;
  }

  window.addEventListener("scroll", updateActive, { passive: true });
  window.addEventListener("settingsReady", function () {
    rescanSections();
    updateActive();
  });
  updateActive();
})();

// ═══════════════════════════════════════════════════════════════
//  DEFERRED HASH NAVIGATION
//  The browser's native #hash scroll fires before CSV grids
//  populate, so the target offset is wrong. We suppress the
//  premature scroll, then re-scroll once layout has settled.
// ═══════════════════════════════════════════════════════════════
(() => {
  const hash = window.location.hash;
  if (!hash) return;

  // Immediately kill the premature scroll the browser already started
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);

  function scrollToHash() {
    const id = hash.substring(1);
    const el = document.getElementById(id);
    if (!el) return;
    // Use a small offset so the band header isn't hidden behind the sticky nav
    const navHeight = document.querySelector(".glass-nav")?.offsetHeight || 0;
    const top = el.getBoundingClientRect().top + window.scrollY - navHeight;
    window.scrollTo({ top, behavior: "smooth" });
  }

  // Wait for full page load (images, scripts, CSV grids), then
  // add an extra delay for any remaining async layout shifts.
  window.addEventListener("load", () => {
    setTimeout(scrollToHash, 350);
  });
})();