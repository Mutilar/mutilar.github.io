// ═══════════════════════════════════════════════════════════════
//  CONSOLE TOAST — Terminal-style overlay for console output
//
//  Intercepts console.log / .warn / .error and mirrors each
//  message into a sleek, translucent toast anchored to the
//  bottom-right.  Messages auto-fade after a few seconds.
//
//  Loaded before other scripts; defers DOM work until ready.
// ═══════════════════════════════════════════════════════════════
(() => {
  "use strict";

  /* ── Config ────────────────────────────────────────────────── */
  const MAX_LINES = 6;
  const FADE_MS   = 10000;

  /* ── Greeting ──────────────────────────────────────────────── */
  const GREETING = "\uD83D\uDC27 Hello, World \uD83D\uDC4B\uD83C\uDFFB";

  /* ── Stash originals ───────────────────────────────────────── */
  const _log   = console.log.bind(console);
  const _warn  = console.warn.bind(console);
  const _error = console.error.bind(console);

  /* ── State ─────────────────────────────────────────────────── */
  let container = null;
  let ready     = false;
  let inside    = false;          // re-entrancy guard
  const queue   = [];             // buffered before DOM ready

  /* ── Helpers ───────────────────────────────────────────────── */
  /** Smoothly collapse a tile's height then remove it */
  function collapseLine(el) {
    if (!el || !el.parentNode || el._collapsing) return;
    el._collapsing = true;

    // Freeze visual state into inline styles BEFORE touching classes
    var cs = getComputedStyle(el);
    el.style.transition    = "none";
    el.style.animation     = "none";
    el.style.opacity       = cs.opacity;
    el.style.transform     = cs.transform;
    el.style.pointerEvents = "none";
    void el.offsetHeight;

    // Now safe to strip classes — inline styles hold visual state
    el.classList.remove("dev-toast-show", "dev-toast-hide",
                        "dev-toast-swipe-left", "dev-toast-swipe-right",
                        "dev-toast-snap-back", "dev-toast-dragging");
    void el.offsetHeight;

    // Fade out only — no height collapse
    requestAnimationFrame(function () {
      el.style.transition = "opacity 0.35s ease";
      el.style.opacity    = "0";
    });

    // After fade, collapse height so siblings slide up smoothly
    setTimeout(function () {
      if (!el.parentNode) return;
      var h = el.offsetHeight;
      el.style.transition = "none";
      el.style.height = h + "px";
      el.style.marginBottom = getComputedStyle(el).marginBottom;
      el.style.overflow = "hidden";
      void el.offsetHeight;
      el.style.transition = "height 0.3s ease, margin-bottom 0.3s ease";
      el.style.height = "0px";
      el.style.marginBottom = "0px";
      setTimeout(function () { if (el.parentNode) el.remove(); }, 320);
    }, 380);
  }

  function stringify(args) {
    return Array.from(args).map(function (a) {
      if (typeof a === "string") return a;
      if (a instanceof Error) return a.toString();
      try { return JSON.stringify(a); } catch (e) { return String(a); }
    }).join(" ");
  }

  /**
   * Capture a cleaned-up stack trace, stripping the first N
   * frames that belong to our own console override plumbing.
   */
  function captureStack() {
    var stack = "";
    try { throw new Error(); } catch (e) { stack = e.stack || ""; }
    var lines = stack.split("\n").filter(function (l) { return l.trim(); });
    // Strip only: the "Error" header line and our own captureStack/addLine frames
    var cleaned = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (/^Error/.test(l)) continue;
      if (l.indexOf("captureStack") !== -1) continue;
      if (l.indexOf("addLine") !== -1) continue;
      if (l.indexOf("CONSOLE.JS") !== -1) continue;   // skip our own overrides
      cleaned.push(l);
    }
    return cleaned.join("\n");
  }

  /**
   * Scan console arguments for Error objects and extract
   * the richest .stack available (the thrown error's origin).
   */
  function extractErrorStack(args) {
    for (var i = 0; i < args.length; i++) {
      if (args[i] instanceof Error && args[i].stack) {
        return args[i].stack;
      }
    }
    return "";
  }

  /**
   * Parse a V8 stack frame line into { fn, file }.
   * Handles: "at functionName (file:line:col)"
   *          "at file:line:col"
   *          "at async functionName (file:line:col)"
   *          "functionName@file:line:col"  (Firefox)
   */
  function parseFrame(raw) {
    var line = raw.trim();
    // V8: "at fnName (http://…:line:col)"
    var m = line.match(/^at\s+(.+?)\s+\((.+)\)$/);
    if (m) return { fn: m[1], file: shortFile(m[2]) };
    // V8: "at http://…:line:col"  (anonymous)
    m = line.match(/^at\s+(.+)$/);
    if (m) return { fn: "(anonymous)", file: shortFile(m[1]) };
    // Firefox: "fnName@http://…:line:col"
    m = line.match(/^(.*)@(.+)$/);
    if (m) return { fn: m[1] || "(anonymous)", file: shortFile(m[2]) };
    // Fallback
    return { fn: line, file: "" };
  }

  /** Shorten a full URL to "filename.js:line:col" */
  function shortFile(url) {
    // Strip query strings
    var clean = url.split("?")[0];
    // Take last path segment
    var parts = clean.split("/");
    return parts[parts.length - 1] || clean;
  }

  /** Build a DOM container of DevTools-style stack frame rows */
  function buildStackDOM(stackStr) {
    var lines = stackStr.split("\n").filter(function (l) { return l.trim(); });
    var container = document.createElement("div");
    container.className = "dev-toast-stack";
    for (var i = 0; i < lines.length; i++) {
      var parsed = parseFrame(lines[i]);
      var row = document.createElement("div");
      row.className = "dev-toast-frame";

      var fnSpan = document.createElement("span");
      fnSpan.className = "dev-toast-frame-fn";
      fnSpan.textContent = parsed.fn;
      row.appendChild(fnSpan);

      if (parsed.file) {
        var at = document.createElement("span");
        at.className = "dev-toast-frame-at";
        at.textContent = "@";
        row.appendChild(at);

        var fileSpan = document.createElement("span");
        fileSpan.className = "dev-toast-frame-file";
        fileSpan.textContent = parsed.file;
        row.appendChild(fileSpan);
      }

      container.appendChild(row);
    }
    return container;
  }

  var SPINNER_R = 8;
  var SPINNER_C = 2 * Math.PI * SPINNER_R;  // circumference ≈ 50.27

  /** Build an SVG countdown ring */
  function buildSpinner(level) {
    var size = 22;

    var wrap = document.createElement("span");
    wrap.className = "dev-toast-spinner";

    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("viewBox", "0 0 " + size + " " + size);

    // Background track
    var track = document.createElementNS(ns, "circle");
    track.setAttribute("cx", size / 2);
    track.setAttribute("cy", size / 2);
    track.setAttribute("r", SPINNER_R);
    track.setAttribute("fill", "none");
    track.setAttribute("stroke", "rgba(255,255,255,0.08)");
    track.setAttribute("stroke-width", "2");
    svg.appendChild(track);

    // Countdown arc
    var arc = document.createElementNS(ns, "circle");
    arc.setAttribute("cx", size / 2);
    arc.setAttribute("cy", size / 2);
    arc.setAttribute("r", SPINNER_R);
    arc.setAttribute("fill", "none");
    arc.setAttribute("stroke-width", "2");
    arc.setAttribute("stroke-linecap", "round");
    arc.setAttribute("class", "dev-toast-countdown");
    arc.style.strokeDasharray  = SPINNER_C;
    arc.style.strokeDashoffset = "0";
    svg.appendChild(arc);

    wrap.appendChild(svg);
    return wrap;
  }

  /**
   * Start a rAF-driven countdown that depletes the spinner ring
   * over `duration` ms.  Returns a controller { pause, resume, reset }.
   */
  function startCountdown(arcEl, duration) {
    var start   = performance.now();
    var elapsed = 0;
    var paused  = false;
    var rafId   = null;

    function tick(now) {
      if (paused) return;
      var progress = Math.min((now - start) / duration, 1);
      arcEl.style.strokeDashoffset = (progress * SPINNER_C).toFixed(2);
      if (progress < 1) rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    return {
      pause: function () {
        if (paused) return;
        paused  = true;
        elapsed = performance.now() - start;
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      },
      resume: function () {
        if (!paused) return;
        paused = false;
        start  = performance.now() - elapsed;
        rafId  = requestAnimationFrame(tick);
      },
      reset: function () {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        elapsed = 0;
        start   = performance.now();
        arcEl.style.strokeDashoffset = "0";
        if (!paused) rafId = requestAnimationFrame(tick);
      }
    };
  }

  function addLine(text, level, source, stack) {
    if (inside) return;           // prevent infinite recursion
    inside = true;
    try {
      if (!ready) { queue.push({ text: text, level: level, source: source, stack: stack }); return; }

      var line = document.createElement("div");
      line.className = "dev-toast-line dev-toast-" + level;

      var prefix = document.createElement("span");
      prefix.className = "dev-toast-prefix";
      prefix.textContent = level === "error" ? "\u2716" : level === "warn" ? "\u26A0" : "\u203A";

      var msg = document.createElement("span");
      msg.className = "dev-toast-msg";
      msg.textContent = text;

      // If we have a stack trace, wrap the header inside a <details>/<summary>
      // so the message line itself is the clickable expander
      if (stack) {
        var stackLines = stack.split("\n").filter(function (l) { return l.trim(); });
        if (stackLines.length > 0) {
          var details = document.createElement("details");
          details.className = "dev-toast-details";

          var summary = document.createElement("summary");
          summary.className = "dev-toast-summary";
          summary.appendChild(prefix);
          summary.appendChild(msg);
          if (source) {
            var src = document.createElement("code");
            src.className = "dev-toast-source";
            src.textContent = source;
            summary.appendChild(src);
          }

          details.appendChild(summary);

          var stackDOM = buildStackDOM(stackLines.join("\n"));
          stackDOM.style.overflow = "hidden";
          details.appendChild(stackDOM);

          /** Smoothly animate the stack panel open/closed */
          line._animateStack = function animateStack(opening) {
            if (opening) {
              // Open: set details open first so content is measurable
              details.open = true;
              stackDOM.style.transition = "none";
              stackDOM.style.height = "0px";
              stackDOM.style.opacity = "0";
              void stackDOM.offsetHeight;
              var target = stackDOM.scrollHeight;
              stackDOM.style.transition = "height 0.3s ease, opacity 0.25s ease";
              stackDOM.style.height = target + "px";
              stackDOM.style.opacity = "1";
              // Clear fixed height after transition so content can reflow
              setTimeout(function () { stackDOM.style.height = "auto"; }, 320);
            } else {
              // Close: animate height to 0, then close details
              var h = stackDOM.offsetHeight;
              stackDOM.style.transition = "none";
              stackDOM.style.height = h + "px";
              stackDOM.style.opacity = "1";
              void stackDOM.offsetHeight;
              stackDOM.style.transition = "height 0.3s ease, opacity 0.25s ease";
              stackDOM.style.height = "0px";
              stackDOM.style.opacity = "0";
              setTimeout(function () { details.open = false; }, 320);
            }
          };

          line.appendChild(details);

          // Countdown ring (top-right) + dropdown arrow (bottom-right)
          var spinner = buildSpinner(level);
          line.appendChild(spinner);
          var arrowWrap = document.createElement("span");
          arrowWrap.className = "dev-toast-arrow";
          var arrowDown = document.createElement("span");
          arrowDown.className = "dev-toast-arrow-down";
          arrowDown.textContent = "\u25BC";
          var arrowUp = document.createElement("span");
          arrowUp.className = "dev-toast-arrow-up";
          arrowUp.textContent = "\u25B2";
          arrowWrap.appendChild(arrowDown);
          arrowWrap.appendChild(arrowUp);
          line.appendChild(arrowWrap);

          // Start JS-driven countdown
          var cd = line.querySelector(".dev-toast-countdown");
          var countdown = cd ? startCountdown(cd, FADE_MS) : null;
          line._countdown = countdown;

          // Toggle auto-fade on expand/collapse
          details.addEventListener("toggle", function () {
            if (details.open) {
              // Reset ring to full + pause
              if (line._fadeTimer) { clearTimeout(line._fadeTimer); line._fadeTimer = null; }
              if (countdown) { countdown.reset(); countdown.pause(); }
            } else {
              // Collapsed — resume from full TTL
              if (countdown) { countdown.reset(); countdown.resume(); }
              line._fadeTimer = setTimeout(function () {
                line._fadeTimer = null;
                line.classList.remove("dev-toast-show");
                line.classList.add("dev-toast-hide");
                setTimeout(function () { collapseLine(line); }, 500);
              }, FADE_MS);
            }
          });
        } else {
          // Stack was empty after filtering — render without dropdown
          line.appendChild(prefix);
          line.appendChild(msg);
          if (source) {
            var src2 = document.createElement("code");
            src2.className = "dev-toast-source";
            src2.textContent = source;
            line.appendChild(src2);
          }
          var spinner2 = buildSpinner(level);
          line.appendChild(spinner2);
          var cd2 = spinner2.querySelector(".dev-toast-countdown");
          if (cd2) line._countdown = startCountdown(cd2, FADE_MS);
        }
      } else {
        // No stack trace — plain line
        line.appendChild(prefix);
        line.appendChild(msg);
        if (source) {
          var src3 = document.createElement("code");
          src3.className = "dev-toast-source";
          src3.textContent = source;
          line.appendChild(src3);
        }
        var spinner3 = buildSpinner(level);
        line.appendChild(spinner3);
        var cd3 = spinner3.querySelector(".dev-toast-countdown");
        if (cd3) line._countdown = startCountdown(cd3, FADE_MS);
      }

      container.appendChild(line);

      // Two-phase entry:
      // 1) Expand the layout slot from 0 → natural height (pushes siblings smoothly)
      // 2) Fade/slide the content in (existing CSS transition)
      var naturalH = line.offsetHeight;
      var naturalMb = 6; // matches CSS margin-bottom

      line.style.transition = "none";
      line.style.overflow = "hidden";
      line.style.height = "0px";
      line.style.marginBottom = "0px";
      line.style.opacity = "0";
      void line.offsetHeight;

      // Phase 1: expand slot
      line.style.transition = "height 0.3s ease, margin-bottom 0.3s ease";
      line.style.height = naturalH + "px";
      line.style.marginBottom = naturalMb + "px";

      // Phase 2: fade/slide content in (slight delay so slot opens first)
      setTimeout(function () {
        line.style.opacity = "";
        line.style.transition = "";
        line.style.overflow = "";
        line.style.height = "";
        void line.offsetHeight;
        line.classList.add("dev-toast-show");
      }, 150);

      // Auto-fade
      line._fadeTimer = setTimeout(function () {
        line._fadeTimer = null;
        line.classList.remove("dev-toast-show");
        line.classList.add("dev-toast-hide");
        setTimeout(function () { collapseLine(line); }, 500);
      }, FADE_MS);

      // ── Unified tap / swipe gesture ────────────────────────────
      // Short tap (no significant drag) → toggle <details>
      // Drag past threshold             → swipe-dismiss
      // All inner clickables are inert; the tile is one surface.
      (function initGesture(el) {
        var THRESHOLD   = 0.35;      // 35% of element width to dismiss
        var DRAG_SLOP   = 6;         // px movement before we commit to drag
        var FADE_PX     = 300;       // px drag at which opacity reaches 0
        var startX      = 0;
        var startY      = 0;
        var currentX    = 0;
        var dragging    = false;     // committed to horizontal drag
        var pointerId   = null;
        var elW         = 0;
        var moved       = false;     // any significant movement at all

        var details = el.querySelector(".dev-toast-details");

        // Prevent native <summary> click — we handle toggle ourselves
        var summary = el.querySelector("summary");
        if (summary) {
          summary.addEventListener("click", function (e) { e.preventDefault(); });
        }

        function onDown(e) {
          if (pointerId !== null) return;   // already tracking
          pointerId = e.pointerId || 0;
          elW       = el.offsetWidth || 200;
          startX    = e.clientX;
          startY    = e.clientY;
          currentX  = startX;
          dragging  = false;
          moved     = false;

          el.classList.remove("dev-toast-snap-back");

          // Capture pointer so moves outside the element still track
          if (el.setPointerCapture) {
            try { el.setPointerCapture(pointerId); } catch (_) {}
          }
        }

        function onMove(e) {
          if ((e.pointerId || 0) !== pointerId) return;
          currentX = e.clientX;
          var dx = currentX - startX;
          var dy = e.clientY - startY;

          if (!dragging) {
            // Haven't committed yet — check slop
            if (Math.abs(dx) > DRAG_SLOP) {
              // Horizontal drag wins
              dragging = true;
              moved    = true;
              el.classList.add("dev-toast-dragging");
            } else if (Math.abs(dy) > DRAG_SLOP) {
              // Vertical scroll — bail entirely
              cancel();
              return;
            } else {
              return;   // still within slop
            }
          }

          var ratio   = Math.abs(dx) / elW;
          var rot     = Math.max(-5, Math.min(5, (dx / elW) * 5));
          var opacity = Math.max(1 - Math.abs(dx) / FADE_PX, 0);
          el.style.transform = "translateX(" + dx + "px) rotate(" + rot + "deg) scale(" + (1 - ratio * 0.05) + ")";
          el.style.opacity   = opacity;

          // Auto-dismiss when fully faded
          if (opacity <= 0) {
            release();
            if (el._fadeTimer) { clearTimeout(el._fadeTimer); el._fadeTimer = null; }
            collapseLine(el);
          }
        }

        function onUp(e) {
          if ((e.pointerId || 0) !== pointerId) return;
          var wasDragging = dragging;
          var dx    = currentX - startX;
          var ratio = Math.abs(dx) / elW;

          release();

          if (wasDragging && ratio >= THRESHOLD) {
            // ── Swipe dismiss ──
            el.style.transform = "";
            el.style.opacity   = "";
            el.classList.remove("dev-toast-show");
            el.classList.add(dx > 0 ? "dev-toast-swipe-right" : "dev-toast-swipe-left");
            if (el._fadeTimer) { clearTimeout(el._fadeTimer); el._fadeTimer = null; }
            setTimeout(function () { collapseLine(el); }, 350);
          } else if (wasDragging) {
            // ── Snap back ──
            el.classList.add("dev-toast-snap-back");
            el.style.transform = "";
            el.style.opacity   = "";
          } else if (!moved && details && el._animateStack) {
            // ── Short tap → toggle dropdown ──
            el._animateStack(!details.open);
          } else if (!moved && el._onTap) {
            // ── Short tap → custom action ──
            el._onTap();
          }
        }

        function cancel() { release(); }

        function release() {
          dragging  = false;
          pointerId = null;
          el.classList.remove("dev-toast-dragging");
          if (el.releasePointerCapture) {
            try { el.releasePointerCapture(pointerId); } catch (_) {}
          }
        }

        el.addEventListener("pointerdown",   onDown,  { passive: true });
        el.addEventListener("pointermove",   onMove,  { passive: true });
        el.addEventListener("pointerup",     onUp);
        el.addEventListener("pointercancel", function () { cancel(); el.classList.add("dev-toast-snap-back"); el.style.transform = ""; el.style.opacity = ""; });
      })(line);

      // Prune oldest — count only non-collapsing children
      var live = 0;
      for (var ci = 0; ci < container.children.length; ci++) {
        if (!container.children[ci]._collapsing) live++;
      }
      while (live > MAX_LINES) {
        for (var cj = 0; cj < container.children.length; cj++) {
          if (!container.children[cj]._collapsing) {
            collapseLine(container.children[cj]);
            live--;
            break;
          }
        }
      }
    } finally {
      inside = false;
    }
  }

  /* ── Override console methods ───────────────────────────────── */
  console.log = function () {
    _log.apply(console, arguments);
    addLine(stringify(arguments), "log", "", captureStack());
  };

  console.warn = function () {
    _warn.apply(console, arguments);
    var errStack = extractErrorStack(arguments);
    var callStack = captureStack();
    var combined = callStack;
    if (errStack) {
      var errLines = errStack.split("\n").filter(function (l) { return l.trim(); });
      var cleaned = [];
      for (var i = 0; i < errLines.length; i++) {
        var el = errLines[i].trim();
        if (/^[A-Z][A-Za-z]*Error:/.test(el) || /^Error/.test(el)) continue;
        if (callStack.indexOf(el) !== -1) continue;
        cleaned.push(el);
      }
      if (cleaned.length) combined = callStack + "\n" + cleaned.join("\n");
    }
    addLine(stringify(arguments), "warn", "", combined);
  };

  console.error = function () {
    _error.apply(console, arguments);
    var errStack = extractErrorStack(arguments);
    var callStack = captureStack();
    // Merge: call-site frames on top, then error's own origin frames (deduplicated)
    var combined = callStack;
    if (errStack) {
      var errLines = errStack.split("\n").filter(function (l) { return l.trim(); });
      var cleaned = [];
      for (var i = 0; i < errLines.length; i++) {
        var el = errLines[i].trim();
        // Skip error message header lines (e.g. "SyntaxError: …")
        if (/^[A-Z][A-Za-z]*Error:/.test(el) || /^Error/.test(el)) continue;
        // Skip frames already present in callStack to avoid duplication
        if (callStack.indexOf(el) !== -1) continue;
        cleaned.push(el);
      }
      if (cleaned.length) {
        combined = callStack + "\n" + cleaned.join("\n");
      }
    }
    addLine(stringify(arguments), "error", "", combined);
  };

  /* ── Catch unhandled errors ─────────────────────────────────── */
  window.addEventListener("error", function (e) {
    var src = "";
    if (e.filename) {
      var name = e.filename.split("/").pop().split("?")[0];
      src = name + (e.lineno ? ":" + e.lineno : "") + (e.colno ? ":" + e.colno : "");
    }
    var stack = (e.error && e.error.stack) ? e.error.stack : "";
    addLine(e.message || "Unknown error", "error", src, stack);
  });

  window.addEventListener("unhandledrejection", function (e) {
    var stack = (e.reason && e.reason.stack) ? e.reason.stack : "";
    addLine("Unhandled: " + (e.reason && e.reason.message || e.reason || "promise rejected"), "error", "", stack);
  });

  /* ── Boot once DOM is ready ─────────────────────────────────── */
  function boot() {
    if (ready) return;
    container = document.createElement("div");
    container.id = "dev-toast";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
    ready = true;

    // Flush queued messages
    queue.forEach(function (item) { addLine(item.text, item.level, item.source, item.stack); });
    queue.length = 0;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  /* ── Greeting ────────────────────────────────────────────── */
  _log(GREETING);
  addLine(GREETING, "log");
  if (container && container.lastElementChild) {
    var greetTile = container.lastElementChild;
    greetTile.style.cursor = "pointer";
    greetTile.classList.add("dev-toast-link");
    greetTile._onTap = function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  }

  /* ── Bio prompt (after 1 s) ─────────────────────────────── */
  var _bioTile = null;

  /** Dismiss the bio toast if it's still alive */
  window._dismissBioToast = function () {
    if (_bioTile && _bioTile.parentNode) {
      if (_bioTile._fadeTimer) { clearTimeout(_bioTile._fadeTimer); _bioTile._fadeTimer = null; }
      _bioTile.classList.remove("dev-toast-show");
      _bioTile.classList.add("dev-toast-hide");
      setTimeout(function () { collapseLine(_bioTile); }, 500);
      _bioTile = null;
    }
  };

  setTimeout(function () {
    var BIO_TEXT = "Check my bio?";
    _log(BIO_TEXT);
    addLine(BIO_TEXT, "log");
    // Make the last toast tile open the bio modal on tap
    if (container && container.lastElementChild) {
      var tile = container.lastElementChild;
      _bioTile = tile;
      tile.style.cursor = "pointer";
      tile.classList.add("dev-toast-link");
      tile._onTap = function () {
        if (typeof openQuiltModal === "function") openQuiltModal();
      };
      // Simulate hero portrait hover
      var heroLink = document.querySelector(".hero-portrait-link");
      if (heroLink) {
        tile.addEventListener("mouseenter", function () { heroLink.classList.add("hover"); });
        tile.addEventListener("mouseleave", function () { heroLink.classList.remove("hover"); });
      }
    }
  }, 2000);

  /* ── Section waypoints ──────────────────────────────────── */
  // Log a toast when the user scrolls past each section heading
  (function () {
    var headings = document.querySelectorAll(".section-heading");
    if (!headings.length) return;

    var fired = {};

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var label = el.textContent.trim();
        if (fired[label]) return;
        fired[label] = true;

        // Find the closest ancestor with an id for the anchor
        var anchor = el.closest("[id]");
        var anchorId = anchor ? anchor.id : null;

        _log(label);
        addLine(label, "log");

        // Make the toast tile clickable to scroll back to that section
        if (anchorId && container && container.lastElementChild) {
          var tile = container.lastElementChild;
          tile.style.cursor = "pointer";
          tile.classList.add("dev-toast-link");
          tile._onTap = (function (id) {
            return function () {
              var target = document.getElementById(id);
              if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
            };
          })(anchorId);
        }
      });
    }, { threshold: 0.5 });

    headings.forEach(function (h) { observer.observe(h); });
  })();

})();
