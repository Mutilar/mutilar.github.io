# Hero Portrait Hand-Off

## Scope

This handoff covers the hero portrait rendered into `#hero`: the portrait image or emoji fallback, the hover overlay, the animated background emoji cycle, the foreground identity emoji, and the CSS/JS contracts that keep those pieces synchronized.

## Source Files

- `.engine/js/DATA.js`: renders the hero markup in `_renderHero(heroData)` and starts the emoji cycle in `_initHeroCycle(s)`.
- `.engine/css/STYLE.css`: owns portrait sizing, overlay layering, opacity transitions, glow styling, foreground bounce animation, light-mode overrides, and responsive portrait sizes.
- `.engine/js/CONSOLE.js`: can toggle `.hero-portrait-link.hover` from the console bio prompt, reusing the same CSS/JS hover path as pointer hover.
- `json/SETTINGS.json`: provides `identity`, `accents`, and `hero.cycle`.
- `json/HERO.json`: provides the hero shell metadata, including `portraitAction`, `portraitType`, and `portraitBackground` if used.

## Data Contract

`SETTINGS.json` drives the visual content:

- `identity.name`: used for portrait `alt` or `aria-label`.
- `identity.portrait`: image source when the portrait is an `<img>`.
- `identity.emoji`: foreground glyph rendered above the animated background cycle.
- `accents`: array of RGB strings. Cycle entries can reference these by numeric index.
- `hero.cycle`: ordered array of `[emoji, color]` pairs. The emoji is the background glyph for that step. The color is either an index into `accents` or a raw CSS RGB string.

`HERO.json` drives the shell:

- `hero.portraitAction`: inline click handler attached to the portrait link. Current value opens the biography modal.
- `hero.portraitType === "emoji"`: renders a text-based portrait instead of `identity.portrait`.
- `hero.portraitBackground`: optional image URL used as an inline background when `portraitType` is `emoji`.

If `hero.cycle` is missing or has fewer than two entries, `_initHeroCycle` exits and the overlay still fades in on hover, but no timed background cycling is installed.

## Generated Markup

`_renderHero(heroData)` builds this portrait subtree:

```html
<a class="hero-portrait-link" href="javascript:void(0)" onclick="...">
  <img class="hero-portrait" src="..." alt="...">
  <!-- or: <span class="hero-portrait emoji-portrait" aria-label="...">...</span> -->

  <span class="hero-portrait-emoji" aria-hidden="true">
    <span class="hero-emoji-bg" id="heroEmojiBgA">...</span>
    <span class="hero-emoji-bg hero-emoji-bg-b" id="heroEmojiBgB"></span>
    <span class="hero-emoji-glyph">...</span>
  </span>
</a>
```

Layering is intentional:

- `.hero-portrait`: the normal visible portrait layer.
- `.hero-portrait-emoji`: the circular overlay that fades in on hover or `.hover`.
- `#heroEmojiBgA` and `#heroEmojiBgB`: double-buffered background emoji layers.
- `.hero-emoji-glyph`: foreground identity emoji above the background cycle.

The first background emoji is seeded from `SETTINGS.hero.cycle[0][0]`, with a globe fallback if the data is absent.

## Animation Flow

1. `_renderHero` writes the DOM into `#hero`, then calls `_initHeroCycle(window.__SETTINGS)`.
2. `_initHeroCycle` finds `.hero-portrait-link`, `#heroEmojiBgA`, `#heroEmojiBgB`, `.hero-emoji-glyph`, and `.hero-portrait-emoji`.
3. It flattens `hero.cycle` into:
   - `emojis`: the ordered background emoji sequence.
   - `glowMap`: background emoji to RGB glow color.
4. On pointer `mouseenter`, `start()` runs:
   - resets the index to `0`;
   - shows buffer A at opacity `0.35`;
   - hides buffer B;
   - restores foreground glyph opacity and transition;
   - sets `--glow` on `.hero-portrait-emoji` using the first cycle color;
   - starts `setInterval(step, 1000)`.
5. Every second, `step()` advances to the next emoji:
   - writes the next emoji into the hidden buffer;
   - fades that buffer to opacity `0.35`;
   - fades the old buffer to opacity `0`;
   - swaps the buffer references;
   - updates `--glow` for the active emoji.
6. On pointer `mouseleave`, `stop()` clears the interval, hides both background buffers, and restores the foreground glyph opacity and transition.

The two background spans are a simple crossfade buffer. JS only changes `textContent`, `opacity`, and `--glow`; CSS handles the visible fade via transitions.

## Foreground Emoji Behavior

`.hero-emoji-glyph` renders `identity.emoji` above the cycling background. CSS gives it `position: relative` and `z-index: 2`, while the background buffers sit at `z-index: 1`.

On hover or `.hover`, `.hero-emoji-glyph` receives `animation: kg-emoji-bounce 1s ease infinite`. The keyframes are shared with knowledge graph node emoji animation.

The last entry in `hero.cycle` is treated as `HIDING_EMOJI`. When that background emoji becomes active, `step()` fades the foreground glyph out with `opacity 0.8s ease`. On any later non-hiding emoji, the foreground glyph fades back in. This makes the final background state briefly own the circle without the identity emoji layered above it.

## CSS Contract

Core selectors in `.engine/css/STYLE.css`:

- `.hero-portrait`: size, circular crop, border, shadow, and opacity transition for the normal portrait layer.
- `.hero-portrait-link`: relative-positioned circular container. The overlay is absolutely positioned against this element.
- `.hero-portrait-emoji`: absolute overlay, circular clip, hidden by default, glow border/shadow driven by `--glow`, and `pointer-events: none` so the link remains clickable.
- `.hero-portrait-link:hover .hero-portrait`, `.hero-portrait-link.hover .hero-portrait`: fade the normal portrait out.
- `.hero-portrait-link:hover .hero-portrait-emoji`, `.hero-portrait-link.hover .hero-portrait-emoji`: fade the overlay in.
- `.hero-emoji-bg`: large centered background emoji, opacity transition, no pointer events.
- `.hero-emoji-bg-b`: starts hidden so the JS double-buffer can crossfade.
- `.hero-emoji-glyph`: foreground identity emoji layer.
- `html.light-mode .hero-portrait-emoji`: light-mode glow/background override.
- responsive media queries: shrink `.hero-portrait` at tablet/mobile breakpoints. The overlay inherits the link/portrait footprint because it is `inset: 0`.

Important invariant: `.hero-portrait-link` must remain `position: relative`, and `.hero-portrait-emoji` must remain `position: absolute; inset: 0;`. Breaking that relationship detaches the overlay from the portrait.

## Programmatic Hover

`CONSOLE.js` adds hover behavior to the delayed bio prompt tile:

```js
tile.addEventListener("mouseenter", function () { heroLink.classList.add("hover"); });
tile.addEventListener("mouseleave", function () { heroLink.classList.remove("hover"); });
```

`_initHeroCycle` installs a `MutationObserver` on `.hero-portrait-link` and watches the `class` attribute. When `.hover` appears, it calls `start()`. When `.hover` is removed and the pointer is not actually hovering the portrait, it calls `stop()`.

This means manual CSS hover and scripted `.hover` use the same animation implementation. Keep both CSS selector forms when changing the hover styles.

## Safe Change Points

- Change portrait image: edit `identity.portrait` in `json/SETTINGS.json`.
- Change foreground emoji: edit `identity.emoji` in `json/SETTINGS.json`.
- Change background cycle: edit `hero.cycle` in `json/SETTINGS.json`.
- Change glow colors: edit `accents` or use raw RGB strings in `hero.cycle` entries.
- Change click target: edit `hero.portraitAction` in `json/HERO.json`.
- Switch to text portrait: set `hero.portraitType` to `emoji` and optionally set `hero.portraitBackground` in `json/HERO.json`.
- Change cycle speed: edit `setInterval(step, 1000)` in `_initHeroCycle`.
- Change crossfade timing: edit `.hero-emoji-bg { transition: opacity 0.8s ease; }`.
- Change overlay fade timing: edit `.hero-portrait-emoji` and `.hero-portrait` opacity transitions.
- Change bounce motion: edit `@keyframes kg-emoji-bounce`, but note it is shared with knowledge graph UI.

## Failure Modes

- Missing `#heroEmojiBgA`, `#heroEmojiBgB`, or `.hero-emoji-glyph`: `_initHeroCycle` exits early.
- `hero.cycle` length under two: no timed cycle is installed.
- Bad accent index: glow falls back to `String(c || "")`; if that is not an RGB triplet, `rgba(var(--glow), ...)` can fail visually.
- Removing `.hero-portrait-link.hover` CSS selectors breaks console-triggered animation while pointer hover still works.
- Removing the `MutationObserver` breaks programmatic hover from `CONSOLE.js`.
- Changing `@keyframes kg-emoji-bounce` affects both the hero foreground emoji and knowledge graph node hover animation.

## Verification Checklist

- Load the site and confirm the normal portrait is visible before hover.
- Hover the portrait and confirm the portrait fades out while the circular emoji overlay fades in.
- Keep hovering for several seconds and confirm background emojis crossfade once per second.
- Confirm the overlay glow changes color with the cycle.
- Confirm the foreground identity emoji bounces while hovering.
- Confirm the foreground identity emoji fades out when the final cycle emoji is active, then fades back in on the next cycle.
- Hover the delayed console bio prompt and confirm it triggers the same portrait animation through `.hover`.
- Toggle light mode and confirm the overlay glow remains visible.
- Check a narrow viewport and confirm the overlay stays aligned with the resized portrait.