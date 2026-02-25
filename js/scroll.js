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
})();

// ═══════════════════════════════════════════════════════════════
//  SCROLL-HINT FADE-OUT
//  Each hint fades out as its parent parallax-window scrolls up
//  so the hint is no longer near the viewport bottom.
// ═══════════════════════════════════════════════════════════════
(() => {
  const hints = document.querySelectorAll(".scroll-hint");
  if (!hints.length) return;

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
  const navLinks = document.querySelectorAll(".glass-nav a");
  const sectionIds = Array.from(navLinks).map(a => a.getAttribute("href").substring(1));
  const sections = sectionIds.map(id => document.getElementById(id)).filter(Boolean);

  let prevActive = null;

  function updateActive() {
    let current = sectionIds[0];
    const scrollY = window.scrollY + 150;
    const footerPane = document.getElementById("footer-pane");
    const inFooter = footerPane && footerPane.offsetTop <= scrollY;

    if (!inFooter) {
      sections.forEach(el => {
        if (el.offsetTop <= scrollY) current = el.id;
      });
    } else {
      current = null;
    }

    navLinks.forEach(a => {
      const href = a.getAttribute("href").substring(1);
      const isActive = !inFooter && href === current;
      a.classList.toggle("active", isActive);
      if (isActive && current !== prevActive) {
        a.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    });
    prevActive = current;
  }

  window.addEventListener("scroll", updateActive, { passive: true });
  updateActive();
})();
