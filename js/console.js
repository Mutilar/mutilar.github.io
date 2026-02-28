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
  const FADE_MS   = 4000;

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
  function stringify(args) {
    return Array.from(args).map(function (a) {
      if (typeof a === "string") return a;
      try { return JSON.stringify(a); } catch (e) { return String(a); }
    }).join(" ");
  }

  function addLine(text, level, source) {
    if (inside) return;           // prevent infinite recursion
    inside = true;
    try {
      if (!ready) { queue.push({ text: text, level: level, source: source }); return; }

      var line = document.createElement("div");
      line.className = "dev-toast-line dev-toast-" + level;

      var prefix = document.createElement("span");
      prefix.className = "dev-toast-prefix";
      prefix.textContent = level === "error" ? "\u2716" : level === "warn" ? "\u26A0" : "\u203A";

      var msg = document.createElement("span");
      msg.className = "dev-toast-msg";
      msg.textContent = text;

      line.appendChild(prefix);
      line.appendChild(msg);

      if (source) {
        var src = document.createElement("code");
        src.className = "dev-toast-source";
        src.textContent = source;
        line.appendChild(src);
      }

      container.appendChild(line);

      // Trigger reflow then animate in
      void line.offsetHeight;
      line.classList.add("dev-toast-show");

      // Auto-fade
      setTimeout(function () {
        line.classList.remove("dev-toast-show");
        line.classList.add("dev-toast-hide");
        setTimeout(function () { if (line.parentNode) line.remove(); }, 500);
      }, FADE_MS);

      // Prune oldest
      while (container.children.length > MAX_LINES) {
        container.firstChild.remove();
      }
    } finally {
      inside = false;
    }
  }

  /* ── Override console methods ───────────────────────────────── */
  console.log = function () {
    _log.apply(console, arguments);
    addLine(stringify(arguments), "log");
  };

  console.warn = function () {
    _warn.apply(console, arguments);
    addLine(stringify(arguments), "warn");
  };

  console.error = function () {
    _error.apply(console, arguments);
    addLine(stringify(arguments), "error");
  };

  /* ── Catch unhandled errors ─────────────────────────────────── */
  window.addEventListener("error", function (e) {
    var src = "";
    if (e.filename) {
      var name = e.filename.split("/").pop().split("?")[0];
      src = name + (e.lineno ? ":" + e.lineno : "") + (e.colno ? ":" + e.colno : "");
    }
    addLine(e.message || "Unknown error", "error", src);
  });

  window.addEventListener("unhandledrejection", function (e) {
    addLine("Unhandled: " + (e.reason && e.reason.message || e.reason || "promise rejected"), "error");
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
    queue.forEach(function (item) { addLine(item.text, item.level, item.source); });
    queue.length = 0;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  /* ── Greeting ──────────────────────────────────────────────── */
  _log(GREETING);
  addLine(GREETING, "log");

})();
