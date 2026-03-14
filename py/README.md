```
╔═════════════════════════════════════════════════════════════════════╗
║  ████████ ██    ██ ██      ██████  ██       █████  ███████ ███████  ║
║     ██    ██    ██ ██      ██      ██      ██   ██ ██      ██       ║
║     ██    ██    ██ ██      ██ ███  ██      ███████ ███████ ███████  ║
║     ██    ██    ██ ██      ██   ██ ██      ██   ██      ██      ██  ║
║     ██     ██████  ██      ██████  ██████  ██   ██ ███████ ███████  ║
╚═════════════════════════════════════════════════════════════════════╝
```

---

## § Module Graph

```
  SETTINGS.json ─────────────────────────────────────┐
  (accents, identity, console)                       │
                                                     ▼
  ┌──────────────────────────────────────────────────────┐
  │  TUI.py  — zero-dep primitives                       │
  │  ┌────────────┐ ┌────────────┐ ┌──────────────────┐  │
  │  │  C (ANSI)  │ │  Glyphs    │ │  SETTINGS loader │  │
  │  │  fg(r,g,b) │ │  BOX_*     │ │  _parse_rgb()    │  │
  │  │  strip_*   │ │  BLOCK_*   │ │  MSFT_GRADIENT   │  │
  │  │  truncate  │ │  SPIN_*    │ │  identity_name() │  │
  │  └────────────┘ └────────────┘ └──────────────────┘  │
  │  ┌────────────────────────────────────────────────┐  │
  │  │  Composites: box() progress_bar() divider()    │  │
  │  │  gradient_rgb() lerp_gradient() scramble_text()│  │
  │  │  spinner_frame() header_line() fmt_idle()      │  │
  │  └────────────────────────────────────────────────┘  │
  └──────────────────────┬───────────────────────────────┘
                         │ from TUI import *
            ┌────────────┴────────────┐
            ▼                         ▼
  ┌───────────────────┐    ┌───────────────────┐
  │  SERVE.py         │    │  TEST.py          │
  │  State machine    │    │  Unit tests       │
  │  Animation engine │    │  demo_showcase()  │
  │  HTTP freeze/thaw │    │  Visual proof     │
  └───────────────────┘    └───────────────────┘
```

---

## § Constants

### Gradient (from `SETTINGS.json` → `accents[]`)

```
  Index │ RGB Tuple     │ Feel
  ──────┼───────────────┼────────
    0   │ (0, 255, 198) │ Cyan
    1   │ (255, 220, 0) │ Yellow
    2   │ (255, 0, 110) │ Pink
    3   │ (120, 0, 255) │ Purple
```

Fallback (if SETTINGS.json absent):
```
    [(0,164,239), (127,186,0), (255,185,0), (242,80,34)]
```

### Unicode Glyph Table

```
  ┌─────────────────────────────────────────────────────────────┐
  │ BOX DRAWING                                                 │
  │   Single: ─ │ ┌ ┐ └ ┘ ├ ┤                                   │
  │   Double: ═ ║ ╔ ╗ ╚ ╝                                       │
  ├─────────────────────────────────────────────────────────────┤
  │ BLOCKS                                                      │
  │   Full: █   Light: ░   Medium: ▒   Dark: ▓                  │
  │   Eighths: [' ','▏','▎','▍','▌','▋','▊','▉','█']       │
  │            idx 0-8 → 8× sub-char precision per cell         │
  ├─────────────────────────────────────────────────────────────┤
  │ GEOMETRY                                                    │
  │   ◇ ◆ ◈  (diamond: empty, filled, dot)                    │
  │   ○ ● ◉  (circle:  empty, filled, dot)                     │
  ├─────────────────────────────────────────────────────────────┤
  │ STATUS                                                      │
  │   ✓ ✗ ⚠ ⓘ  (check, cross, warn, info)                     │
  │   → ← ↑ ↓  (arrows)                                         │
  └─────────────────────────────────────────────────────────────┘
```

### Spinner Frame Sets

```
  Name         │ Frames                       │ Typical speed
  ─────────────┼──────────────────────────────┼──────────────
  BRAILLE_SPIN │ ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏      │ 0.08s
  BLOCK_SPIN   │ ▖ ▘ ▝ ▗                   │ 0.08s
  PULSE_BOX    │ · ▪ ■ ▪                      │ 0.08s
  PULSE_DIAMOND│ · ◇ ◈ ◆ ◈ ◇               │ 1.0s (idle)
  PULSE_CIRCLE │ · ○ ◉ ● ◉ ○                 │ 0.08s
  RADAR_SWEEP  │ ◜ ◝ ◞ ◟                    │ 0.06s

  spinner_frame(age, frames, speed) → frames[int(age/speed) % len(frames)]
```

### Scramble Charset

```
ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*<>░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬
```
82 characters. Mixed alphanumeric + box-drawing noise. Gives "decryption" feel.

---

## § Core Algorithms

### 1. Gradient Interpolation

```
lerp_gradient(stops, t):
    t ∈ [0,1] clamped
    seg = t × (len(stops) - 1)
    i   = floor(seg), clamped to len-2
    f   = seg - i                          // fractional position within segment
    return (
        a[0] + (b[0]-a[0])×f,             // per-channel linear interp
        a[1] + (b[1]-a[1])×f,
        a[2] + (b[2]-a[2])×f,
    )

gradient_rgb(t) → lerp_gradient(MSFT_GRADIENT, t)
```

### 2. ANSI String Math

```
strip_ansi(text):
    regex: \033\[[0-9;]*m → ''

truncate_ansi(text, max_vis, ellipsis='…'):
    Walk char-by-char. ANSI sequences pass through free.
    Visible chars decrement budget. When budget near exhaustion
    and remaining visible > remaining budget → append DIM+ellipsis+RST.
    Return accumulated string.
```

### 3. Scramble-Decode

```
scramble_text(target, age, char_rate=0.02, scramble_rate=0.05):
    resolved = floor(age / char_rate)      // chars locked left-to-right
    if resolved >= len(target): return target
    result = target[:resolved]             // locked portion
    step_t = floor(age / scramble_rate)    // scramble animation frame
    for i in [resolved..len-1]:
        if whitespace: passthrough
        else: idx = (i + step_t×13 + ord(target[i])×7) % 82
              result += SCRAMBLE_CHARS[abs(idx)]
    return result
```

Key: `char_rate` controls decode speed. `scramble_rate` controls noise cycling speed.

### 4. Smoothstep Easing

```
_ease(t):
    t = clamp(t, 0, 1)
    return t² × (3 - 2t)                  // Hermite interpolation
```

Used for: width morphs, progress bar drain, all non-linear transitions.

### 5. Per-Character Gradient Colorize

```
_gradient_colorize(text):
    for each char at index i:
        if whitespace: passthrough
        else: t = i / (len-1)
              color = fg(*gradient_rgb(t))
              emit color + char
    emit RST
```

---

## § Composite Widgets

### progress_bar(progress, length=20, show_pct=True)

```
  Example at 67%:
  [████████████████▓▒░░      ]  67%
```

### box(lines, width)

```
  ╔══════════════════════════════════════════════╗  ← top: gradient sweeps L→R
  ║ content line 1                               ║
  ║ content line 2 (truncated if > inner-2)      ║  ← sides: gradient continues
  ║ content line 3                               ║     clockwise around perimeter
  ╚══════════════════════════════════════════════╝  ← bottom: gradient sweeps R→L

  Perimeter length = 2×inner + 2×n_lines
  Each border char at position idx gets:
      lerp_gradient(GRADIENT + [GRADIENT[0]], idx / perimeter)
  Creates a continuous color loop around the box.

  Inner content: padded to uniform width.
  Long lines truncated via truncate_ansi(ln, inner-2).
  All output rows have exactly `width` visible chars.
```

---

## § Animation Patterns

### Decode-In (content materializes top→bottom)

```
  _decode_rows(final_lines, phase_age, decode_s, row_delay=0.08):

  Timeline:
  ────────────────────────────────────── decode_s ──────▶
  row 0: ░░▒▓█████████████████████████████ (resolved)
  row 1:    ░░▒▓██████████████████████████ (resolved)
  row 2:       ░░▒▓███████████████████████ (resolved)
  row 3:          ░░▒▓████████████████████ (still scrambling)
              ▲
              row_delay stagger

  visible_n = min(n, floor(phase_age / row_delay) + 1)
  char_rate = decode_s / longest_line_length
  Per row: row_age = phase_age - ri × row_delay
           if row_age/char_rate >= len(plain): show final colored line
           else: scramble_text(plain, row_age, char_rate) → gradient_colorize
```

### Fade-Out (content dissolves bottom→top)

```
  _fadeout_rows(final_lines, phase_age, fadeout_s):

  Timeline:
  ────────────────────────────────────── fadeout_s ──────▶
  row 0: ██████████████████████████▓▒░░   (last to go)
  row 1: █████████████████████▓▒░░        (middle)
  row 2: ████████████████▓▒░░             (early)
  row 3: ███████████▓▒░░                  (first to go)
              ▲
              bottom rows start first

  row_start = (n-1-ri) × row_delay        // bottom-first ordering
  virtual_age = full_time - (phase_age - row_start)
  if virtual_age <= 0: row is gone (omitted)
  if virtual_age >= full: show final line
  else: scramble_text at virtual_age → gradient_colorize
```

### Width Morph

```
  from_w ──── _ease(t) ────▶ to_w

  Render empty card [''] at interpolated width each frame.
  cur_w = max(16, min(term_w, int(from_w + (to_w - from_w) × ease(t))))
```

### Crossfade (glyph set A → glyph set B)

```
  Per row, staggered:
  row_t = clamp((sa - li × 0.06) / avail, 0, 1)

  if row_t < 0.5:
      // A scrambles out (virtual_age decreasing)
      virtual_age = (1 - row_t×2) × len(A) × 0.012
      scramble_text(A, virtual_age)
  else:
      // B scrambles in (virtual_age increasing)
      virtual_age = (row_t - 0.5) × 2 × len(B) × 0.012
      scramble_text(B, virtual_age)
```

---

## § Rendering Engine

### Frame Rewrite Protocol

```
_render_frame_centered(content_lines, card_width, prev_lines) → new_total:

    1. box(content_lines, card_width) → frame string
    2. Split into frame_lines
    3. Compute center padding: ' ' × ((term_width - card_width) / 2)
    4. If prev_lines > 0: cursor up prev_lines (\033[{n}A)
    5. For each frame_line: \r + pad + line + \033[K + \n
    6. If new_total < prev_lines: blank excess + cursor up
    7. Return new_total

  Key: cursor-up rewrite gives liquid in-place animation.
  No screen clear. No flicker. Frame count chain-passed between calls.
```

### Terminal Primitives

```
  term_width()  → shutil.get_terminal_size((60,24)).columns
  term_height() → shutil.get_terminal_size((60,24)).lines
  hide_cursor() → \033[?25l
  show_cursor() → \033[?25h
  clear_line()  → \r + ' '×(w-1) + \r
```

---

## § State Machine Template

```
  ┌────────────┐     ┌────────────┐     ┌────────────┐
  │decode_boot │───▶│   dots     │────▶│   morph    │
  │ 0.4s       │     │ 2.0s       │     │ 0.45s      │
  │ scramble   │     │ per-char   │     │ ease width │
  │ reveal     │     │ dot growth │     │ A → B      │
  └────────────┘     └────────────┘     └─────┬──────┘
                                              │
                     ┌────────────────────────▼──────────────────────┐
                     │           progress_wait                       │
                     │  bar fills (exponential approach to 90%,      │
                     │  then linear crawl 90→99% until sync_done)    │
                     │  spinner + step label + pct                   │
                     └─────────────────────┬─────────────────────────┘
                                           │ sync_done + 0.2s hold
                     ┌─────────────────────▼──────┐
                     │      progress_drain        │
                     │  bar 100% → 0% via ease    │
                     │  0.25s                     │
                     └─────────────────────┬──────┘
                                           │
                     ┌─────────────────────▼──────┐
                     │      decode_logo           │
                     │  _decode_rows(glyphs)      │
                     │  0.5s, row_delay=0.08      │
                     └─────────────────────┬──────┘
                                           │
                     ┌─────────────────────▼──────┐
                     │      hold_logo             │
                     │  static resolved glyphs    │
                     │  1.0s                      │
                     └─────────────────────┬──────┘
                                           │
                     ┌─────────────────────▼──────┐
                     │      crossfade             │
                     │  BOOT → FILES per-row      │
                     │  0.5s, stagger=0.06        │
                     └─────────────────────┬──────┘
                                           │
                                           ▼
                                       [break → idle_pulse_boxed]
```

### Shutdown Mirror

```
  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
  │ fadeout card │──▶ │ drain bar   │──▶ │ shrink width │
  │ _fadeout_rows│    │ 100%→0%      │    │ ease → sliver│
  │ 0.45s        │    │ 0.25s        │    │ 0.4s         │
  └──────────────┘    └──────────────┘    └───────┬──────┘
                                                  │
  ┌──────────────┐    ┌──────────────┐    ┌───────▼──────┐
  │ vanish       │◀──│ decode-out   │◀── │ decode label │
  │ erase lines  │    │ reverse      │    │ scramble in  │
  │ cursor math  │    │ 0.4s         │    │ 0.5s         │
  └──────────────┘    └──────────────┘    └──────────────┘
                                          dot retraction
                                          per-char, 0.75s
```

---

## § Responsive Degradation

```
  ┌─────────────────────────────────────────────────────────┐
  │  HEIGHT TIERS                                           │
  │                                                         │
  │  h > 10 ─── full: logo + bar + padding + info + padding │
  │  h > 4  ─── compact: fewer logo rows, no baby-fat       │
  │  h ≤ 4  ─── minimal: single-line, no box, no logo       │
  │                                                         │
  │  Logo rows clamped: min(5, max(0, h - 10))              │
  │  Baby-fat slots: min(2, max(0, h - base - 2))           │
  │    slot 1: blank line between bar and info              │
  │    slot 2: blank line between info and bottom border    │
  ├─────────────────────────────────────────────────────────┤
  │  WIDTH TIERS                                            │
  │                                                         │
  │  w ≥ 70 ─── full: icon :port idle fN                    │
  │  w ≥ 60 ─── standard: uptime(ts) │ status │ Ctrl+C      │
  │  w ≥ 40 ─── compact: ts │ status (drop hints)           │
  │  w < 40 ─── minimal: ts + status (drop separators)      │
  │                                                         │
  │  All lines: if vis_len > w → truncate_ansi(line, w-1)   │
  │  Box width: min(card_w, term_width())                   │
  └─────────────────────────────────────────────────────────┘
```

---

## § Timing Constants

```
  Constant        │ Value   │ Where
  ────────────────┼─────────┼──────────────────────────
  Frame sleep     │ 0.025s  │ all animation loops (~40fps)
  MORPH_S         │ 0.45s   │ width transitions
  DECODE_S        │ 0.5s    │ row-by-row decode-in
  FADE_S          │ 0.5s    │ fadeout transitions
  HOLD_S          │ 1.0s    │ static content hold
  DRAIN_S         │ 0.25s   │ progress bar 100%→0%
  DOT_INTERVAL    │ 0.45s   │ dot expansion per set
  XFADE_STAGGER   │ 0.06s   │ per-row crossfade delay
  ROW_DELAY       │ 0.08s   │ decode-in row stagger
  ACTIVE_INTERVAL │ 1.0s    │ idle pulse repaint (live)
  FROZEN_INTERVAL │ 5.0s    │ idle pulse repaint (frozen)
  STALE_TIMEOUT   │ 300s    │ idle → freeze threshold
  WATCHDOG_POLL   │ 60s     │ freeze check interval
  char_rate       │ varies  │ decode_s / longest_line
  scramble_rate   │ 0.05s   │ noise frame cycling
```

---

## § ASCII Art: Data-Driven Logo Glyphs

```
  _BOOT_GLYPHS (5 rows × 34 cols):
  ██████   ██████   ██████  ████████
  ██   ██ ██    ██ ██    ██    ██
  ██████  ██    ██ ██    ██    ██
  ██   ██ ██    ██ ██    ██    ██
  ██████   ██████   ██████     ██

  _FILE_GLYPHS (5 rows × 34 cols):
  ██████  ██  ██      ██████  ██████
  ██      ██  ██      ██      ██
  █████   ██  ██      █████    █████
  ██      ██  ██      ██          ██
  ██      ██  ██████  ██████  ██████

  Crossfade: BOOT ──scramble──▶ FILES
  Logo centering: pad = (usable - glyph_w) / 2
  Per-row gradient: _logo_row_color(ri, total) → lerp_gradient at ri/(total-1)
```

---

## § SETTINGS.json Contract (TUI-relevant subset)

```json
{
  "identity": {
    "name":     "HTML string → strip_html() for terminal",
    "emoji":    "Base emoji → sanitize_emoji() strips ZWJ/skin tones",
    "tagline":  "Plain text",
    "jobTitle": "Plain text | null",
    "organization": "Plain text"
  },
  "console": {
    "greeting": "Emoji + text → sanitize_emoji()"
  },
  "accents": [
    "r, g, b",    // → _parse_rgb() → (r,g,b) tuple
    "r, g, b",    // positional: [0]=primary [1]=secondary ...
    "r, g, b",    // min 2 required for gradient; up to 4 used
    "r, g, b"
  ]
}
```

---

## § Emoji Sanitization

```
  _EMOJI_JUNK_RE strips:
    \U0001F3FB-\U0001F3FF   skin tone modifiers (🏻🏼🏽🏾🏿)
    \uFE0E \uFE0F            variation selectors
    \u200D                    zero-width joiner

  sanitize_emoji(text):    strip junk, keep base emoji
  strip_html(text):        regex <[^>]+> → ''
  identity_name():         strip_html(SETTINGS.identity.name)
```

---

## § One-Shot Generation Checklist

```
  To build a new TUI Glassmorphism view:

  ☐ 1. Import TUI.py (gets: C, fg, glyphs, gradient, box, progress_bar,
       scramble_text, spinner_frame, strip_ansi, truncate_ansi,
       term_width, term_height, hide/show_cursor, clear_line,
       MSFT_GRADIENT, SETTINGS, fmt_idle, divider, header_line)

  ☐ 2. Define content builders:
       - Static lines (logo, labels, status)
       - Live lines (spinners, uptime, dynamic data)
       - Use _center(text, card_w) for horizontal centering
       - Use _gradient_colorize(text) for per-char gradient

  ☐ 3. Define state machine:
       - Each state: (label, handler, next_state, duration)
       - Track: state, state_start, prev_total, card_w
       - Transitions: decode → hold → fadeout → morph → next

  ☐ 4. Implement render loop:
       while True:
           sa = now - state_start
           if sa >= duration: transition to next state
           build content_lines for current state
           prev_total = _render_frame_centered(content, card_w, prev_total)
           time.sleep(0.025)

  ☐ 5. Responsive guards:
       - h ≤ 4: single-line fallback, no box
       - card_w = min(desired_w, term_width())
       - truncate any line > inner width

  ☐ 6. Lifecycle:
       - hide_cursor() at start
       - show_cursor() in finally block
       - Shutdown animation mirrors boot (reverse each phase)

  ☐ 7. Test:
       - box() row widths uniform at [120, 80, 50, 35, 25, 15, 10]
       - progress_bar clamps [-0.5, 1.5] → [0%, 100%]
       - strip_ansi round-trips correctly
       - All content ≤ term_width() visible chars
```

---

```
╔══════════════════════════════════════════════════════════╗
║  "The terminal is not a limitation. It's a viewport      ║
║   into a design space where every character is a pixel   ║
║   and every escape sequence is a shader."                ║
║                                                          ║
║   — TUI Glassmorphism spec v1 · 2026                     ║
╚══════════════════════════════════════════════════════════╝
```
