# CSS Design System Audit

> Extracted motifs, tokens, and aesthetic principles from `styles.css` (6,054 lines).

---

## 1. Glassmorphism: The Load-Bearing Aesthetic

Every surface in this system is a pane of frosted glass floating over a parallax cosmos. The signature recipe appears in at least six distinct surface classes:

| Surface | `background` | `backdrop-filter` | `border` |
|---|---|---|---|
| `.opaque-band` | `rgba(0,0,0,0.4)` | `blur(24px) saturate(1.4)` | `1px solid rgba(255,255,255,0.33)` |
| `.glass-nav` | `rgba(0,0,0,0.4)` | `blur(24px) saturate(1.4)` | `1px solid rgba(255,255,255,0.33)` |
| `.glass-tile` | `rgba(0,0,0,0.33)` | `blur(20px) saturate(1.3)` | `1px solid rgba(255,255,255,0.33)` |
| `.footer-pane` | `rgba(0,0,0,0.4)` | `blur(24px) saturate(1.4)` | `1px solid rgba(255,255,255,0.33)` |
| `.mm-node` | `rgba(15,15,20,0.75)` | `blur(12px) saturate(1.2)` | `1px solid rgba(255,255,255,0.2)` |
| `.dev-toast-line` | `rgba(0,0,0,0.33)` | `blur(20px) saturate(1.3)` | `1px solid rgba(255,255,255,0.33)` |

**Pattern:** Semi-transparent black fill (0.33-0.4 alpha) + heavy Gaussian blur (12-24px) + slight saturation boost (1.2-1.4) + thin white hairline border at 0.33 alpha. The nav, bands, footer, and tiles all share *identical* blur/saturate values. Nodes and toasts dial it down slightly for subtlety at smaller scale.

Inside `.opaque-band`, tiles deliberately *drop* their backdrop-filter (`backdrop-filter: none`) and switch to a subtler `rgba(255,255,255,0.04)` fill. Glass-on-glass would double-blur; the system avoids this by flattening nested panes.

---

## 2. Color Palette

Every accent color is derived from one of the four Microsoft brand quadrant colors. Shades (darker/lighter/alpha variants) are used freely; the base hue is always one of these four:

| Quadrant | Hex | RGB | Role |
|---|---|---|---|
| 🔴 Red | `#F25022` | `242, 80, 34` | Errors, close buttons, destructive actions |
| 🟢 Green | `#7FBA00` | `127, 186, 0` | Success, log-level toasts, play-pulse |
| 🔵 Blue | `#00A4EF` | `0, 164, 239` | Links, navigation accents, selection, penguin glow, dive badges, footer icons, figures, bio symbol blocks |
| 🟡 Yellow | `#FFB900` | `255, 185, 0` | Wins, achievement badges, play buttons, bio headings, highlight emphasis, warning toasts |

### Dark Mode (default)

- **Background:** `#1B1F2B` (deep blue-grey)
- **Text primary:** `#fff`
- **Text secondary:** `rgba(255,255,255,0.65-0.75)`
- **Text tertiary:** `rgba(255,255,255,0.45-0.55)`
- **Text muted:** `rgba(255,255,255,0.3-0.35)`
- **Accent blue:** `rgba(0,164,239)` / MSFT Blue (links, GitHub badges, dive badges, footer icons)
- **Accent yellow:** `rgba(255,185,0)` / MSFT Yellow (wins, play buttons, bio headings, highlight badges)
- **Accent red:** `rgba(242,80,34)` / MSFT Red (close buttons, error toasts)
- **Accent green:** `rgba(127,186,0)` / MSFT Green (success toasts, log-level indicators)
- **Selection:** `rgba(0,164,239,0.35)` (MSFT Blue)
- **Penguin glow:** `rgb(0,164,239)` (MSFT Blue)

### Light Mode (`html.light-mode`)

- **Background:** `#e8ecf1`
- **Text primary:** `#1a1a2e`
- **Accent blue:** darker shades of MSFT Blue (e.g. `rgba(0,120,175)`) for contrast on light backgrounds
- **Accent yellow:** darker shades of MSFT Yellow (e.g. `rgba(185,135,0)`) for contrast on light backgrounds
- **Accent red:** darker shades of MSFT Red for error text on light backgrounds
- **Accent green:** darker shades of MSFT Green for log text on light backgrounds
- **Glass surfaces:** flip to `rgba(255,255,255,0.55-0.65)` fills with `rgba(0,0,0,0.08-0.12)` borders

The four-color accent system maps 1:1 to the MSFT brand quadrant. Category colors in visualizations use CSS custom property `--tc` (theme color) as RGB triplets, consumed via `rgba(var(--tc), alpha)`. Light mode variants use `--tc-light` where the hue needs to shift darker for contrast.

---

## 3. Glow System

Glow is the primary interactive feedback mechanism. Three tiers:

### Resting Glow
Soft `box-shadow` on glass tiles at rest:
```
0 0 15px rgba(255,255,255,0.07),
0 0 40px rgba(255,255,255,0.03)
```

### Hover Glow
Intensified on interaction; three-layer radial bloom:
```
0 0 20px rgba(255,255,255,0.15),
0 0 50px rgba(255,255,255,0.08),
0 0 100px rgba(255,255,255,0.04)
```
This triple-layer pattern (tight/medium/wide) recurs on the hero portrait, section images, footer icons, and `.radio-btn-play` in playing state.

### Pulsing Glow
Animated `box-shadow` cycles for attention-drawing elements:
- `win-pulse`: MSFT Yellow glow on trophy badges, 2s cycle
- `tl-glow-pulse`: dark ambient glow on whisper HUD, 3s cycle
- `bio-tour-pulse`: MSFT Yellow glow on bio tour targets, 1.5s cycle
- `kg-center-pulse`: white glow on center node, 4s cycle
- `tile-glow-pulse`: white/MSFT Blue glow on navigated tiles, 1.2s cycle
- `toast-error-glow`: MSFT Red (`242,80,34`) glow, 2.4s cycle
- `toast-warn-glow`: MSFT Yellow (`255,185,0`) glow, 2.4s cycle
- `toast-log-glow`: MSFT Green (`127,186,0`) glow, 2.4s cycle
- `badgePulse` / `badgePulseDive`: MSFT Yellow / MSFT Blue glow on action badges, 2.5s cycle

Every pulsing animation uses `ease-in-out` and oscillates between two shadow states. No hard cuts.

---

## 4. Border Radius Scale

Consistent radius vocabulary:

| Token | Radius | Used On |
|---|---|---|
| Pill | `14-20px` | Badges, filter pills, nav links, section badges |
| Card | `20px` | `.glass-tile`, `.modal-card`, `.viz-viewport` |
| Button | `8-12px` | Radio buttons, hero links, close buttons, footer icons |
| Circle | `50%` | Hero portrait, KG nodes, volume knob, carousel nav |
| Inset | `6px` | Timeline slivers, scrollbar thumbs, outline pills |
| Node | `10px` | Mermaid nodes |

The `20px` card radius is the signature. Modal cards, glass tiles, and viewport containers all lock to it.

---

## 5. Typography

- **System font stack:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`
- **Monospace (toasts/code):** `'SF Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace`
- **Base size:** `16px`, `line-height: 1.6`
- **Heading hierarchy:** 42px (hero name) → 32px (section heading) → 26px (modal title) → 18px (entry name) → 14-15px (body text) → 11-12px (badges/labels)
- **Weight scale:** 300 (hero surname) / 500 (body, nav links) / 600 (badges, meta) / 700 (headings, node titles) / 800 (hero name, modal title, stat values, whisper HUD)
- **Letter spacing:** Negative for large headings (-0.3 to -1px), positive for small caps/labels (0.3-1.5px)
- **Hero name gradient text:** `linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.7) 100%)` clipped to text

---

## 6. Motion & Animation

### Transitions
Default transition timing: `0.3s ease` for most hover states. Longer `0.4s ease` for box-shadow and border-color on glass surfaces. Quick `0.2s ease` for button presses.

### Entrance Animations
- **Scroll reveal:** `translateY(30px)` → `translateY(0)` over `0.7s cubic-bezier(0.4, 0, 0.2, 1)`
- **Modal in:** `translateY(30px) scale(0.97)` → identity, `0.35s` same bezier
- **Modal out:** reverse of in, `0.25s`
- **Explore pop (Mermaid/KG):** `scale(0.88)` → overshoot to `scale(1.04)` → `scale(1)`, `0.5s cubic-bezier(0.34, 1.56, 0.64, 1)` (elastic)
- **Toast in:** `translateY(8px) scale(0.96)` → identity, same elastic bezier
- **Filter pill glow:** `scale(0.92)` → `scale(1.08)` → `scale(1)`, elastic

### Perpetual Animations
- `bounce-y` / `bounce-y-hero`: scroll hint bobbing, `1.8s ease-in-out infinite`
- `thread-pulse`: KG edge width oscillation, `3s ease-in-out infinite`
- `mm-thread-pulse`: Mermaid edge width oscillation, `3s ease-in-out infinite`

### Reduced Motion
Full `prefers-reduced-motion: reduce` support: all animations squashed to `0.01ms`, scroll behavior set to `auto`, reveal elements shown immediately.

---

## 7. Interactive States

### Hover Pattern
Glass tiles: brighter `box-shadow` + `border-color` bump from `0.33` → `0.45` alpha. This is the universal "I'm interactive" signal.

### Active/Selected
Nav links: `background: rgba(255,255,255,0.18)` + `text-shadow` glow + elevated `box-shadow`. Filter pills: background becomes `rgba(var(--tc), 0.14)` with colored border at `0.55` alpha and a five-layer compound shadow mixing black depth with colored glow.

### Focus
Keyboard: skip-to-content link at z-index 100000, MSFT Blue `#00A4EF` background.

### Hover Dimming (Visualizations)
When hovering a Mermaid node or KG node, all non-connected elements dim to `opacity: 0.3`. Connected elements get `.mm-highlight` / `.kg-highlight` class and remain at full opacity with elevated glow. This focus-by-dimming pattern appears identically in all three viz systems (Mermaid, KG, Constellation Map).

---

## 8. Layered Composition

The page is a deliberate sandwich of transparency and opacity:

1. **Fixed parallax canvas** (`z-index: -1`): star field or background art
2. **Parallax windows** (`background: transparent`): transparent gaps where the canvas shows through
3. **Opaque bands** (glassmorphic): frosted panes that occlude the canvas
4. **Glass tiles**: cards floating within bands or windows
5. **Fixed nav** (`z-index: 100`): always-visible glassmorphic bar
6. **Modals** (`z-index: 200-250`): glassmorphic overlays with blurred backdrop

This parallax-window/opaque-band alternation is the site's structural rhythm. Content is never placed directly on the parallax canvas; it's either in a frosted band or in a glass tile floating over the transparent window.

---

## 9. Dual-Theme Architecture

Light mode is not an afterthought. It's a comprehensive 600+ line override block covering every component. The approach:

- **Surface inversion:** `rgba(0,0,0,x)` backgrounds become `rgba(255,255,255,x)` and vice versa
- **Border inversion:** white hairlines become dark hairlines
- **Text inversion:** white text becomes `#1a1a2e`
- **Accent preservation:** blue and gold accents survive but shift to darker, more saturated variants for contrast on light backgrounds
- **Glow adaptation:** each pulsing animation has a `-light` variant with adjusted shadow colors (e.g., `win-pulse-light`, `tl-glow-pulse-light`, `bio-tour-pulse-light`, `badgePulse-light`)
- **No `@media (prefers-color-scheme)`:** theme is toggled via `html.light-mode` class, giving user explicit control

---

## 10. Responsive Breakpoints

Four breakpoints, mobile-down:

| Breakpoint | Target |
|---|---|
| `900px` | Radio player compression |
| `768px` | Mobile radio bar (bottom-fixed), nav mask, grid collapse to 1-col, card padding reduction |
| `600px` | Modal full-viewport, viz filter pill shrink, font size reductions |
| `420px` | Aggressive space reclamation: hero portrait → 96px, tile padding → 14px, heading → 22px |

The radio player migrates from top-right fixed to bottom full-width bar at 768px. Nav gets a horizontal scroll mask with fade edges. Grid columns collapse from `repeat(auto-fill, minmax(320px, 1fr))` to `1fr`.

---

## 11. Recurring CSS Patterns

### The Pill
`display: inline-flex; align-items: center; gap: 5-7px; padding: 4-6px 10-14px; border-radius: 14-20px; font-size: 11-12px; font-weight: 600-700; letter-spacing: 0.3px; white-space: nowrap;`

Used for: `.entry-title`, `.entry-win`, `.entry-play`, `.section-badge`, `.year-badge`, `.modal-badge`, `.modal-win-badge`, `.card-action-badge`, `.viz-filter`, `.mtg-filter`, `.modal-sticky-link`, `.nav-brand`.

### The Three-Layer Glow Shadow
```css
box-shadow:
  0 0 Npx rgba(color, high),
  0 0 2.5Npx rgba(color, medium),
  0 0 5Npx rgba(color, low);
```
Tight/medium/wide bloom. Appears on hero portrait, footer icons, KG nodes, active nav links, playing radio button, and Mermaid highlight nodes.

### The Color-Accent Left Border
`border-left: 3px solid rgba(color, 0.3-0.4)` paired with a subtle `linear-gradient(135deg, rgba(color, 0.04-0.06) 0%, rgba(255,255,255,0.01-0.02) 100%)` background. Used on blockquotes (MSFT Yellow), figures (MSFT Blue), bio symbol blocks (MSFT Blue), bio principle blocks (MSFT Blue), and timeline slivers.

### CSS Custom Property `--tc`
Every category-colored element (filter pills, timeline slivers, KG/Mermaid nodes, constellation map nodes) reads its theme color from `--tc` as an RGB triplet. This enables `rgba(var(--tc), alpha)` composition throughout the system. Light mode variants use `--tc-light` where the hue needs to be darker for contrast.

---

## 12. Accessibility

- Skip-to-content link with focus-reveal
- `prefers-reduced-motion: reduce` kills all animations and transitions
- `-webkit-font-smoothing: antialiased` for text rendering
- Scrollbar styling (thin, translucent thumbs) that degrades gracefully
- `::-webkit-scrollbar` hiding on nav for clean horizontal overflow
- `touch-action: none` and `-webkit-overflow-scrolling: touch` where appropriate for touch devices
- Selection color customized per theme

---

## Summary

The system is glassmorphism, consistently applied: frosted semi-transparent surfaces with white hairline borders, floating over a dark parallax backdrop. Interactivity is communicated through glow intensification, not color shifts. Four accent colors locked to the Microsoft brand quadrant (🔵 Blue `#00A4EF`, 🟡 Yellow `#FFB900`, 🔴 Red `#F25022`, 🟢 Green `#7FBA00`) carry all semantic meaning; every non-neutral color in the stylesheet is a shade of one of these four. Motion is springy (elastic beziers for entrances) and ambient (slow sine-wave pulses for attention). The dual-theme system is a full parallel implementation, not a filter inversion. Every component inherits from the same small set of visual tokens: the glass fill, the three-layer glow, the pill shape, the `--tc` color variable, and the 20px card radius.
