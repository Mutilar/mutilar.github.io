// ═══════════════════════════════════════════════════════════════
//  PARALLAX RENDERER — PER-WINDOW ATTENTION VIA CLIP REGIONS
// ═══════════════════════════════════════════════════════════════
(() => {
  "use strict";

  const MS_RED    = [242, 80, 34];
  const MS_GREEN  = [127, 186, 0];
  const MS_BLUE   = [0, 164, 239];
  const MS_YELLOW = [255, 185, 0];
  const DEFAULT_PALETTE = [MS_RED, MS_GREEN, MS_BLUE, MS_YELLOW];
  const BASE_BG_DARK  = [27, 31, 43];
  const BASE_BG_LIGHT = [232, 236, 241];
  let BASE_BG = document.documentElement.classList.contains("light-mode") ? BASE_BG_LIGHT : BASE_BG_DARK;

  // Listen for theme changes from THEME.JS
  window.addEventListener("theme-changed", (e) => {
    BASE_BG = e.detail.light ? BASE_BG_LIGHT : BASE_BG_DARK;
  });

  /** Parse a data-colors attribute into four [r,g,b] arrays.
   *  Accepted format: "r,g,b; r,g,b; r,g,b; r,g,b"
   *  Falls back to DEFAULT_PALETTE for any missing/invalid entries. */
  function parsePalette(raw) {
    if (!raw) return DEFAULT_PALETTE;
    const parts = raw.split(";").map(s => {
      const nums = s.trim().split(",").map(Number);
      return nums.length === 3 && nums.every(n => !isNaN(n)) ? nums : null;
    });
    return [
      parts[0] || DEFAULT_PALETTE[0],
      parts[1] || DEFAULT_PALETTE[1],
      parts[2] || DEFAULT_PALETTE[2],
      parts[3] || DEFAULT_PALETTE[3],
    ];
  }

  // ── Canvas setup ───────────────────────────────────────────
  const cOrb   = document.getElementById("orbCanvas");
  const cGlint = document.getElementById("glintCanvas");
  const ctxOrb   = cOrb.getContext("2d");
  const ctxGlint = cGlint.getContext("2d");
  const allCanvases = [cOrb, cGlint];

  const parallaxWindows = [...document.querySelectorAll(".parallax-window")].map(el => ({
    el,
    attention: parseFloat(el.dataset.attention || "0"),
    colors: parsePalette(el.dataset.colors)
  }));

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    for (const c of allCanvases) {
      c.width  = window.innerWidth  * dpr;
      c.height = window.innerHeight * dpr;
      c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  window.addEventListener("resize", resize);
  resize();

  // ── Math helpers ───────────────────────────────────────────
  function easeInOutSine(t) {
    return 0.5 - 0.5 * Math.cos(Math.PI * t);
  }

  function oscillate(timeMs, periodMs, from, to) {
    const phase = (timeMs % (periodMs * 2)) / periodMs;
    const t = phase <= 1 ? phase : 2 - phase;
    return from + (to - from) * easeInOutSine(t);
  }

  function sweep(timeMs, periodMs, from, to) {
    const t = (timeMs % periodMs) / periodMs;
    return from + (to - from) * easeInOutSine(t);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function isBlack(c) { return c[0] === 0 && c[1] === 0 && c[2] === 0; }

  /** Invert an [r,g,b] color (255 - channel). */
  function invertColor(c) { return [255 - c[0], 255 - c[1], 255 - c[2]]; }

  /** Return display color: inverted when light mode, original when dark. */
  function themeColor(c) {
    return document.documentElement.classList.contains("light-mode") ? invertColor(c) : c;
  }

  function drawRadialOrb(ctx, cx, cy, radius, color, alphaStops) {
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    alphaStops.forEach(([stop, alpha]) => {
      grad.addColorStop(stop, `rgba(${color[0]},${color[1]},${color[2]},${alpha})`);
    });
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function attentionX(natural, att) {
    const focused = 0.125 + natural * 0.75;
    return natural + (focused - natural) * att;
  }

  function confineY(natural, conf, att) {
    const confined = 0.50 + natural * 0.45;
    const afterConfine = natural + (confined - natural) * conf;
    const focused = 0.125 + afterConfine * 0.75;
    return afterConfine + (focused - afterConfine) * att;
  }

  // ── Generic orb drawer (parameterized by attention level & colors) ──
  function drawOrbs(orbCtx, now, att, scrollOff, palette) {
    palette = palette || DEFAULT_PALETTE;
    const c1 = palette[0], c2 = palette[1], c3 = palette[2], c4 = palette[3];
    const w = window.innerWidth;
    const h = window.innerHeight;
    const conf = 0;

    // Slow oscillators (rest)
    const dX1S = oscillate(now, 11000, 0, 1);
    const dX2S = oscillate(now, 13000, 1, 0);
    const dX3S = oscillate(now, 17000, 0.2, 0.8);
    const dX4S = oscillate(now, 19000, 0.7, 0.3);
    const dY1S = oscillate(now, 14000, 0, 1);
    const dY2S = oscillate(now, 16000, 1, 0);
    const dY3S = oscillate(now, 21000, 0.3, 0.7);
    const dY4S = oscillate(now, 23000, 0.6, 0.4);

    // Fast oscillators (attention)
    const dX1F = oscillate(now, 5500, 0, 1);
    const dX2F = oscillate(now, 6500, 1, 0);
    const dX3F = oscillate(now, 8500, 0.2, 0.8);
    const dX4F = oscillate(now, 9500, 0.7, 0.3);
    const dY1F = oscillate(now, 7000, 0, 1);
    const dY2F = oscillate(now, 8000, 1, 0);
    const dY3F = oscillate(now, 10500, 0.3, 0.7);
    const dY4F = oscillate(now, 11500, 0.6, 0.4);

    const dX1 = lerp(dX1S, dX1F, att);
    const dX2 = lerp(dX2S, dX2F, att);
    const dX3 = lerp(dX3S, dX3F, att);
    const dX4 = lerp(dX4S, dX4F, att);
    const dY1 = lerp(dY1S, dY1F, att);
    const dY2 = lerp(dY2S, dY2F, att);
    const dY3 = lerp(dY3S, dY3F, att);
    const dY4 = lerp(dY4S, dY4F, att);

    // Breathing oscillators
    const b1S = oscillate(now, 6000, 0, 1);
    const b2S = oscillate(now, 7000, 1, 0);
    const b3S = oscillate(now, 8000, 0.3, 0.7);
    const b4S = oscillate(now, 5000, 0.7, 0.3);
    const b1F = oscillate(now, 3000, 0, 1);
    const b2F = oscillate(now, 3500, 1, 0);
    const b3F = oscillate(now, 4000, 0.3, 0.7);
    const b4F = oscillate(now, 2500, 0.7, 0.3);
    const b1 = lerp(b1S, b1F, att);
    const b2 = lerp(b2S, b2F, att);
    const b3 = lerp(b3S, b3F, att);
    const b4 = lerp(b4S, b4F, att);

    // Orb centers
    const cRedX = w * attentionX(0.15 + dX1 * 0.20, att);
    const cRedY = h * confineY(0.12 + dY1 * 0.18, conf, att) - scrollOff * 0.02;
    const cGrnX = w * attentionX(0.65 + dX2 * 0.20, att);
    const cGrnY = h * confineY(0.15 + dY2 * 0.18, conf, att) - scrollOff * 0.03;
    const cBluX = w * attentionX(0.15 + dX3 * 0.22, att);
    const cBluY = h * confineY(0.62 + dY3 * 0.20, conf, att) - scrollOff * 0.015;
    const cYelX = w * attentionX(0.60 + dX4 * 0.22, att);
    const cYelY = h * confineY(0.55 + dY4 * 0.20, conf, att) - scrollOff * 0.025;

    const radiusScale = (1 - conf * 0.15) * (1 - att * 0.20);
    const alphaBright = 1 + att * 1;

    const radRed = w * (0.66 + b1 * 0.08) * radiusScale;
    const radGrn = w * (0.60 + b2 * 0.08) * radiusScale;
    const radBlu = w * (0.62 + b3 * 0.08) * radiusScale;
    const radYel = w * (0.56 + b4 * 0.08) * radiusScale;

    orbCtx.clearRect(0, 0, w, h);
    orbCtx.fillStyle = `rgb(${BASE_BG[0]},${BASE_BG[1]},${BASE_BG[2]})`;
    orbCtx.fillRect(0, 0, w, h);

    if (!isBlack(c1))
    drawRadialOrb(orbCtx, cRedX, cRedY, radRed, themeColor(c1), [
      [0, clamp01(0.42 * alphaBright)], [0.33, clamp01(0.22 * alphaBright)], [0.66, clamp01(0.07 * alphaBright)], [1, 0]]);
    if (!isBlack(c2))
    drawRadialOrb(orbCtx, cGrnX, cGrnY, radGrn, themeColor(c2), [
      [0, clamp01(0.38 * alphaBright)], [0.33, clamp01(0.18 * alphaBright)], [0.66, clamp01(0.06 * alphaBright)], [1, 0]]);
    if (!isBlack(c3))
    drawRadialOrb(orbCtx, cBluX, cBluY, radBlu, themeColor(c3), [
      [0, clamp01(0.40 * alphaBright)], [0.33, clamp01(0.20 * alphaBright)], [0.66, clamp01(0.06 * alphaBright)], [1, 0]]);
    if (!isBlack(c4))
    drawRadialOrb(orbCtx, cYelX, cYelY, radYel, themeColor(c4), [
      [0, clamp01(0.38 * alphaBright)], [0.33, clamp01(0.17 * alphaBright)], [0.66, clamp01(0.05 * alphaBright)], [1, 0]]);

    // Center bloom
    const bloomX = w * attentionX(0.5, att);
    const bloomY = h * confineY(0.42, conf, att);
    const bloomR = w * 0.45 * radiusScale;
    drawRadialOrb(orbCtx, bloomX, bloomY, bloomR, themeColor([255, 255, 255]), [
      [0, clamp01(0.07 * alphaBright)], [0.5, clamp01(0.02 * alphaBright)], [1, 0]]);
  }

  // ── Generic glint drawer ───────────────────────────────────
  function drawGlints(glintCtx, now) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const diag = Math.sqrt(w * w + h * h);

    const sw2 = sweep(now, 23750, -0.4, 1.4);
    const sw3 = sweep(now, 21250, -0.4, 1.4);
    const sw4 = sweep(now, 16250, 1.4, -0.4);
    const sw5 = sweep(now, 13750, 1.4, -0.4);

    const a2 = oscillate(now, 11250, 0.015, 0.04);
    const a3 = oscillate(now, 13750, 0.01, 0.035);
    const a4 = oscillate(now, 16250, 0.015, 0.04);
    const a5 = oscillate(now, 20000, 0.01, 0.03);

    function sweepToX(p) { return -diag * 0.4 + p * (w + diag * 0.8); }

    function drawSoftBand(ctx, cx, hw, peak, angle) {
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(angle * Math.PI / 180);
      ctx.translate(-w / 2, -h / 2);
      const l = cx - hw, r = cx + hw;
      const g = ctx.createLinearGradient(l, 0, r, 0);
      g.addColorStop(0,    `rgba(255,255,255,0)`);
      g.addColorStop(0.15, `rgba(255,255,255,${peak * 0.05})`);
      g.addColorStop(0.30, `rgba(255,255,255,${peak * 0.25})`);
      g.addColorStop(0.42, `rgba(255,255,255,${peak * 0.6})`);
      g.addColorStop(0.50, `rgba(255,255,255,${peak})`);
      g.addColorStop(0.58, `rgba(255,255,255,${peak * 0.6})`);
      g.addColorStop(0.70, `rgba(255,255,255,${peak * 0.25})`);
      g.addColorStop(0.85, `rgba(255,255,255,${peak * 0.05})`);
      g.addColorStop(1,    `rgba(255,255,255,0)`);
      ctx.fillStyle = g;
      ctx.fillRect(l, -diag * 0.5, hw * 2, diag * 2);
      ctx.restore();
    }

    glintCtx.clearRect(0, 0, w, h);
    drawSoftBand(glintCtx, sweepToX(sw2), w * 0.12, a2 * 0.7, -25);
    drawSoftBand(glintCtx, sweepToX(sw3), w * 0.08, a3 * 0.5, -25);
    drawSoftBand(glintCtx, sweepToX(sw4), w * 0.18, a4 * 0.6, -17);
    drawSoftBand(glintCtx, sweepToX(sw5), w * 0.10, a5 * 0.4, -17);
  }

  // ── Compute visible window bands in screen-space ──────────
  function getVisibleWindows() {
    const vh = window.innerHeight;
    const bands = [];
    for (const pw of parallaxWindows) {
      const rect = pw.el.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= vh) continue;
      const top = Math.max(0, rect.top);
      const bottom = Math.min(vh, rect.bottom);
      if (bottom - top < 1) continue;
      bands.push({ top, bottom, attention: pw.attention, colors: pw.colors });
    }
    return bands;
  }

  // ── Reduced-motion preference ─────────────────────────────
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let prefersReducedMotion = reducedMotionQuery.matches;

  reducedMotionQuery.addEventListener("change", (e) => {
    prefersReducedMotion = e.matches;
    if (!prefersReducedMotion) requestAnimationFrame(frame);
  });

  // ── Animation loop ─────────────────────────────────────────
  function frame(timestamp) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const scrollOff = window.scrollY * 0.3;

    // When reduced motion is preferred, freeze at a fixed timestamp
    const t = prefersReducedMotion ? 0 : timestamp;

    // Pass 1: Draw rest state (attention=0) as the base layer
    drawOrbs(ctxOrb, t, 0, scrollOff, DEFAULT_PALETTE);
    drawGlints(ctxGlint, t);

    // Pass 2: For each visible attention window, clip & overdraw
    const bands = getVisibleWindows();
    for (const band of bands) {
      if (band.attention <= 0 && band.colors === DEFAULT_PALETTE) continue;

      ctxOrb.save();
      ctxOrb.beginPath();
      ctxOrb.rect(0, band.top, w, band.bottom - band.top);
      ctxOrb.clip();
      drawOrbs(ctxOrb, t, band.attention, scrollOff * 0.5, band.colors);
      ctxOrb.restore();

      ctxGlint.save();
      ctxGlint.beginPath();
      ctxGlint.rect(0, band.top, w, band.bottom - band.top);
      ctxGlint.clip();
      drawGlints(ctxGlint, t);
      ctxGlint.restore();
    }

    // Stop the loop when reduced motion is preferred (static frame)
    if (prefersReducedMotion) return;
    if (!document.hidden) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  // Resume animation when tab becomes visible again
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !prefersReducedMotion) requestAnimationFrame(frame);
  });
})();
