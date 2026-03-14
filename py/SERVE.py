"""
╔══════════════════════════════════════════════════════════════╗
║  SERVE.py — Dual dev server with cyberpunk TUI animations  ║
║  mutilar.github.io on :8000  ·  bootfile.dev on :8080      ║
╚══════════════════════════════════════════════════════════════╝
"""
import http.server, functools, threading, os, subprocess, sys, time, random, math
from TUI import *  # noqa: F403 — includes strip_html, sanitize_emoji, etc.

# ─────────────────────────────────────────────────────────────
#  Server constants
# ─────────────────────────────────────────────────────────────

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(ROOT)

PORT_PORTFOLIO  = 8000
PORT_LANDING    = 8080
STALE_TIMEOUT   = 300
WATCHDOG_INTERVAL = 60
BOOT_DURATION   = 2.0

# ─────────────────────────────────────────────────────────────
#  SETTINGS-derived display values
# ─────────────────────────────────────────────────────────────

_id   = SETTINGS.get('identity', {})
_con  = SETTINGS.get('console', {})

SITE_NAME  = strip_html(_id.get('name', 'Dev Server'))
SITE_EMOJI = sanitize_emoji(_id.get('emoji', '🖥'))
SITE_TITLE = _id.get('jobTitle', '')
SITE_ORG   = _id.get('organization', '')
GREETING   = sanitize_emoji(_con.get('greeting', f'{SITE_EMOJI} Hello, World'))

# ─────────────────────────────────────────────────────────────
#  Boot art
# ─────────────────────────────────────────────────────────────

def _logo_row_color(row, total):
    """Interpolate MSFT_GRADIENT for logo row index [0..total-1]."""
    return lerp_gradient(MSFT_GRADIENT, row / max(total - 1, 1))

_BOOT_GLYPHS = [
    "██████   ██████   ██████  ████████",
    "██   ██ ██    ██ ██    ██    ██  ",
    "██████  ██    ██ ██    ██    ██  ",
    "██   ██ ██    ██ ██    ██    ██  ",
    "██████   ██████   ██████     ██  ",
]
_FILE_GLYPHS = [
    "██████  ██  ██      ██████  ██████",
    "██      ██  ██      ██      ██    ",
    "█████   ██  ██      █████   ██████",
    "██      ██  ██      ██          ██",
    "██      ██  ██████  ██████  ██████",
]

def _build_boot_art():
    """Generate BOOTFILE_ART centered to current terminal width."""
    w = term_width()
    art = []
    for ri, row in enumerate(_BOOT_GLYPHS):
        pad = max(0, (w - len(row)) // 2)
        art.append(f"{' ' * pad}{_gradient_colorize(row)}")
    return art

# ─────────────────────────────────────────────────────────────
#  Animated sequences
# ─────────────────────────────────────────────────────────────

def animate_scramble_reveal(text, duration=1.0, rate=0.02):
    """Print a line with scramble-reveal animation."""
    start = time.time()
    while True:
        age = time.time() - start
        revealed = scramble_text(text, age, char_rate=rate)
        clear_line()
        sys.stdout.write(f"\r  {C.BCYN}{revealed}{C.RST}")
        sys.stdout.flush()
        if age / rate >= len(text):
            break
        time.sleep(0.03)
    sys.stdout.write('\n')

# Pre-compute per-row scramble colors for the logo
_BOOT_ROW_COLORS = []
for _ri in range(len(_BOOT_GLYPHS)):
    _r, _g, _b = _logo_row_color(_ri, len(_BOOT_GLYPHS))
    _BOOT_ROW_COLORS.append(fg(_r, _g, _b))

# ─────────────────────────────────────────────────────────────
#  Animation helpers (style guide: TEST.py --visual)
# ─────────────────────────────────────────────────────────────

def _ease(t):
    """Smoothstep ease-in-out, clamped to [0,1]."""
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def _gradient_colorize(text):
    """Per-character horizontal MSFT_GRADIENT (cyan→yellow→pink→purple).
    Whitespace passes through uncolored. Matches box() border style."""
    n = len(text)
    if n == 0:
        return text
    parts = []
    for i, ch in enumerate(text):
        if ch in (' ', '\t', '\n'):
            parts.append(ch)
        else:
            t = i / max(n - 1, 1)
            r, g, b = gradient_rgb(t)
            parts.append(f"{fg(r, g, b)}{ch}")
    parts.append(C.RST)
    return ''.join(parts)


def _center(text, card_w):
    """Center a line of text within card inner width (card_w - 4)."""
    usable = max(0, card_w - 4)
    vis = len(strip_ansi(text))
    pad = max(0, (usable - vis) // 2)
    return f"{' ' * pad}{text}"


def _time_clr(seconds):
    """Color by magnitude using MSFT_GRADIENT: s=0, m=1, h=2, d+=3."""
    s = int(seconds)
    if s < 60:
        idx = 0
    elif s < 3600:
        idx = 1
    elif s < 86400:
        idx = 2
    else:
        idx = 3
    r, g, b = MSFT_GRADIENT[min(idx, len(MSFT_GRADIENT) - 1)]
    return fg(r, g, b)


def _fmt_uptime(seconds):
    """Human-readable uptime: 45s, 1m 4s, 5h 2m 16s, 2d 3h 15m."""
    s = int(seconds)
    if s < 60:
        return f"{s}s"
    m, s = divmod(s, 60)
    if m < 60:
        return f"{m}m {s}s"
    h, m = divmod(m, 60)
    if h < 24:
        return f"{h}h {m}m {s}s"
    d, h = divmod(h, 24)
    return f"{d}d {h}h {m}m"


def _decode_rows(final_lines, phase_age, decode_s, row_delay=0.08):
    """Rows enter top-to-bottom with scramble-decode.
    Returns (visible_lines, all_resolved)."""
    plains = [strip_ansi(ln) for ln in final_lines]
    n = len(final_lines)
    longest = max((len(p) for p in plains if p.strip()), default=1)
    char_rate = max(0.005, decode_s / max(longest, 1))
    visible_n = min(n, int(phase_age / row_delay) + 1) if row_delay > 0 else n
    all_resolved = True
    content = []
    for ri in range(visible_n):
        plain = plains[ri]
        row_age = max(0.0, phase_age - ri * row_delay)
        if not plain.strip():
            content.append(final_lines[ri])
        elif row_age / char_rate >= len(plain):
            content.append(final_lines[ri])
        else:
            all_resolved = False
            revealed = scramble_text(plain, row_age, char_rate=char_rate)
            content.append(_gradient_colorize(revealed))
    return content, all_resolved


def _fadeout_rows(final_lines, phase_age, fadeout_s, row_delay=None):
    """Rows retract bottom-to-top, re-scrambling into noise."""
    plains = [strip_ansi(ln) for ln in final_lines]
    n = len(final_lines)
    longest = max((len(p) for p in plains if p.strip()), default=1)
    if row_delay is None:
        row_delay = fadeout_s * 0.35 / max(n - 1, 1)
    scramble_time = fadeout_s * 0.65
    char_rate = max(0.005, scramble_time / max(longest, 1))
    content = []
    for ri in range(n):
        plain = plains[ri]
        row_start = (n - 1 - ri) * row_delay
        row_age = max(0.0, phase_age - row_start)
        if not plain.strip():
            if row_age < scramble_time * 0.5:
                content.append(final_lines[ri])
            continue
        full_time = len(plain) * char_rate
        virtual_age = full_time - row_age
        if virtual_age <= 0:
            continue
        elif virtual_age >= full_time:
            content.append(final_lines[ri])
        else:
            revealed = scramble_text(plain, virtual_age, char_rate=char_rate)
            content.append(_gradient_colorize(revealed))
    return content


def _shutdown_animation(prev_total, card_w, slots, last_content=None):
    """Fadeout current card → shrink to sliver → decode 'Shutting down' with animated dots → vanish."""
    tw = term_width()
    start_w = min(card_w, tw)
    base_label = "Shutting down"
    dot_counts = [3, 2, 1, 0]   # start at 3 dots, shrink to 0
    DOT_STR = ' . '

    def _dot_label(n):
        if n == 0:
            return base_label
        ldots = DOT_STR * n
        rdots = DOT_STR * n
        return f"{ldots}  {base_label}  {rdots}"

    def _dot_w(n):
        return len(_dot_label(n)) + 10

    # Stop servers in background while animating
    for slot in slots:
        slot.stop()

    # ── Phase 1 (0.45s): Fadeout current card content bottom-to-top ──
    # Separate bar from rest of content for distinct drain animation
    if last_content:
        FADEOUT_S = 0.45
        t0 = time.time()
        while True:
            sa = time.time() - t0
            if sa >= FADEOUT_S:
                break
            faded = _fadeout_rows(last_content, sa, FADEOUT_S)
            prev_total = _render_frame_centered(faded, start_w, prev_total)
            time.sleep(0.025)
        # Show empty card briefly
        prev_total = _render_frame_centered([''], start_w, prev_total)
        time.sleep(0.05)

    # ── Phase 1b (0.25s): Progress bar drains 100% → 0% ──
    bar_len = max(len(r) for r in _FILE_GLYPHS)
    DRAIN_S = 0.25
    t0 = time.time()
    while True:
        sa = time.time() - t0
        if sa >= DRAIN_S:
            break
        prog = 1.0 - _ease(sa / DRAIN_S)
        bar = progress_bar(prog, length=bar_len, show_pct=False)
        bar_line = _center(bar, start_w)
        prev_total = _render_frame_centered([bar_line], start_w, prev_total)
        time.sleep(0.025)
    prev_total = _render_frame_centered([''], start_w, prev_total)
    time.sleep(0.05)

    # ── Phase 2 (0.4s): Shrink width to full-dots sliver ──
    full_label = _dot_label(3)
    full_w = _dot_w(3)
    MORPH_S = 0.4
    t0 = time.time()
    while True:
        sa = time.time() - t0
        if sa >= MORPH_S:
            break
        t = _ease(sa / MORPH_S)
        cur_w = max(full_w, int(start_w + (full_w - start_w) * t))
        prev_total = _render_frame_centered([''], cur_w, prev_total)
        time.sleep(0.025)

    # ── Phase 3 (0.5s): Decode full label with scramble-reveal ──
    DECODE_S = 0.5
    final_line = [_center(_gradient_colorize(full_label), full_w)]
    t0 = time.time()
    while True:
        sa = time.time() - t0
        if sa >= DECODE_S:
            break
        decoded, _ = _decode_rows(final_line, sa, DECODE_S)
        prev_total = _render_frame_centered(decoded, full_w, prev_total)
        time.sleep(0.025)
    # Show resolved full label
    prev_total = _render_frame_centered(final_line, full_w, prev_total)
    time.sleep(0.2)

    # ── Phase 4: Smooth per-char dot retraction ──
    full_side = DOT_STR * 3       # 15 chars per side
    n_total = len(full_side)
    RETRACT_S = 0.75              # total retraction time
    char_rate = RETRACT_S / n_total
    t0 = time.time()
    while True:
        sa = time.time() - t0
        if sa >= RETRACT_S:
            break
        n_gone = min(n_total, int(sa / char_rate))
        n_remain = n_total - n_gone
        ldots = full_side[:n_remain]
        rdots = full_side[n_gone:]
        if n_remain > 0:
            label = f"{ldots}  {base_label}  {rdots}"
        else:
            label = base_label
        lw = len(label) + 10
        line = [_center(_gradient_colorize(label), lw)]
        prev_total = _render_frame_centered(line, lw, prev_total)
        time.sleep(0.025)

    # Brief hold on final state
    time.sleep(0.15)

    # ── Phase 5 (0.4s): Decode-out the remaining label ──
    final_label = base_label
    final_w = _dot_w(0)
    final_line = [_center(_gradient_colorize(final_label), final_w)]
    DECODEOUT_S = 0.4
    t0 = time.time()
    while True:
        sa = time.time() - t0
        if sa >= DECODEOUT_S:
            break
        # Reverse decode: start resolved, scramble away
        inv = DECODEOUT_S - sa
        decoded, _ = _decode_rows(final_line, inv, DECODEOUT_S)
        prev_total = _render_frame_centered(decoded, final_w, prev_total)
        time.sleep(0.025)
    # Clear to empty before vanish
    prev_total = _render_frame_centered([''], final_w, prev_total)
    time.sleep(0.05)

    # ── Phase 6: Vanish — erase all lines ──
    old_top, old_bottom = _prev_frame_range
    if old_top > 0:
        for r in range(old_top, old_bottom + 1):
            sys.stdout.write(f'\033[{r};1H\033[K')
        sys.stdout.flush()
    _prev_frame_range[:] = [0, 0]


def animate_boot_logo():
    """Render the BOOT logo with line-by-line fade-in (standalone, no progress bar).
    Height-aware: truncates logo lines to fit terminal; skips animation if height <= 2."""
    BOOTFILE_ART = _build_boot_art()
    h = term_height()
    # Reserve 2 lines for surrounding blanks; clamp art to what fits
    max_art = max(0, h - 2)
    art = BOOTFILE_ART[:max_art]
    if not art:
        return
    print()
    for i, line in enumerate(art):
        start = time.time()
        plain = strip_ansi(line)
        while True:
            age = time.time() - start
            revealed = scramble_text(plain, age, char_rate=0.012)
            clear_line()
            sys.stdout.write(f"\r{_gradient_colorize(revealed)}")
            sys.stdout.flush()
            if age / 0.012 >= len(plain):
                break
            time.sleep(0.025)
        clear_line()
        sys.stdout.write(f"\r{line}\n")
        sys.stdout.flush()
    print()


def _render_frame(content_lines, width, prev_lines):
    """Render content inside a gradient box with cursor-up control.
    Returns total lines rendered (for subsequent calls)."""
    frame_str = box(content_lines, width=width)
    frame_lines = frame_str.split('\n')
    new_total = len(frame_lines)
    ERASE = '\033[K'
    if prev_lines > 0:
        sys.stdout.write(f'\033[{prev_lines}A')
    for line in frame_lines:
        sys.stdout.write(f'\r{line}{ERASE}\n')
    if new_total < prev_lines:
        for _ in range(prev_lines - new_total):
            sys.stdout.write(f'{ERASE}\n')
        sys.stdout.write(f'\033[{prev_lines - new_total}A')
    sys.stdout.flush()
    return new_total


_prev_frame_range = [0, 0]  # [top_row, bottom_row] 1-based absolute

def _render_frame_centered(content_lines, card_width, prev_lines):
    """Render a gradient box centered horizontally and vertically.
    Uses absolute cursor positioning — no scrollback pollution."""
    frame_str = box(content_lines, width=card_width)
    frame_lines = frame_str.split('\n')
    new_total = len(frame_lines)
    w = term_width()
    h = term_height()
    hpad = ' ' * max(0, (w - card_width) // 2)
    ERASE = '\033[K'

    # Vertical center (1-based row)
    top_row = max(1, (h - new_total) // 2 + 1)
    new_bottom = top_row + new_total - 1

    # Clear stale rows from previous frame that new frame won't cover
    old_top, old_bottom = _prev_frame_range
    if old_top > 0:
        for r in range(old_top, min(top_row, old_bottom + 1)):
            sys.stdout.write(f'\033[{r};1H{ERASE}')
        for r in range(max(new_bottom + 1, old_top), old_bottom + 1):
            sys.stdout.write(f'\033[{r};1H{ERASE}')

    # Render at absolute positions
    for i, line in enumerate(frame_lines):
        sys.stdout.write(f'\033[{top_row + i};1H{hpad}{line}{ERASE}')

    _prev_frame_range[:] = [top_row, new_bottom]
    sys.stdout.flush()
    return new_total


def animate_boot_sequence(git_result, target_duration=2.0):
    """Glassmorphic boot with fade-in/fade-out transitions (style: TEST.py).

    States: dots → morph → progress+logo → hold → fadeout

    Progress bar drives ASCII logo decode. After git sync completes,
    holds briefly then fades out bottom-to-top.
    Height-aware: at h <= 4, runs minimal single-line mode (no box).
    Returns (prev_lines, card_w) for caller's post-boot transitions.
    """
    S1_W         = 22      # dots card
    BOOT_W       = 52      # logo + progress card
    MORPH_S      = 0.45    # width morph duration
    DOT_INTERVAL = 0.45

    # Pre-compute logo layout at BOOT_W
    usable   = max(0, BOOT_W - 4)
    glyph_w  = max(len(r) for r in _BOOT_GLYPHS)
    logo_pad = max(0, (usable - glyph_w) // 2)
    N_G      = len(_BOOT_GLYPHS)
    bar_len  = glyph_w  # match logo width

    boot_start     = time.time()
    sync_snap_time = None
    prev_total     = 0
    state          = 'decode_boot'
    state_start    = boot_start
    resolved_boot  = None
    last_dots_w    = S1_W

    while True:
        now        = time.time()
        age        = now - boot_start
        sa         = now - state_start
        sync_done  = git_result[0] is not None
        step_label = git_result[1] or 'Git sync'

        if sync_done and sync_snap_time is None:
            sync_snap_time = age

        w = term_width()
        h = term_height()

        # ── Minimal mode: terminal too short for multi-line ──────────
        if h <= 4:
            if sync_done and sync_snap_time is not None and (age - sync_snap_time) >= 0.4:
                if git_result[0]:
                    line1 = f'  {C.BGRN}{CHECK}{C.RST} Git sync complete'
                else:
                    failed = [s for s, ok in git_result[2] if not ok]
                    fail_str = ', '.join(failed) if failed else 'unknown'
                    line1 = f'  {C.BYLW}{WARN}{C.RST} Sync partial {C.DIM}({fail_str}){C.RST}'
            elif sync_done:
                bar = progress_bar(1.0, length=12)
                line1 = f'  {C.BGRN}{CHECK}{C.RST} {bar}'
            else:
                spin = spinner_frame(age)
                if age < 1.0:
                    raw = 0.90 * (1 - math.exp(-age * 5))
                else:
                    raw = 0.90 + 0.09 * min(1.0, (age - 1.0) / 2.0)
                bar = progress_bar(min(raw, 0.99), length=12)
                line1 = f'  {C.BMAG}{spin}{C.RST} {C.DIM}{step_label}{C.RST} {bar}'
            clear_line()
            sys.stdout.write(f'\r{line1}')
            sys.stdout.flush()
            if sync_done and sync_snap_time is not None and (age - sync_snap_time) >= 0.4:
                sys.stdout.write('\n')
                sys.stdout.flush()
                break
            time.sleep(0.03)
            continue

        # ── State machine ─────────────────────────────────────────
        if state == 'decode_boot':
            # Decode-reveal the plain "BOOT" label before dots start
            DECODE_BOOT_S = 0.4
            if sa >= DECODE_BOOT_S:
                state, state_start = 'dots', now
                continue
            boot_label = "BOOT"
            boot_label_w = len(boot_label) + 10
            line = [_center(_gradient_colorize(boot_label), boot_label_w)]
            decoded, _ = _decode_rows(line, sa, DECODE_BOOT_S)
            prev_total = _render_frame_centered(decoded, min(boot_label_w, w), prev_total)

        elif state == 'dots':
            if sa >= target_duration:
                state, state_start = 'morph', now
                continue
            # Smooth per-char expansion: 5 dots × 5 chars = 25 sub-steps per side
            DOT_STR = ' . '
            MAX_DOTS = 5
            full_side = DOT_STR * MAX_DOTS       # 25 chars total per side
            n_total = len(full_side)
            char_rate = DOT_INTERVAL / len(DOT_STR)  # time per char
            n_chars = min(n_total, int(sa / char_rate))
            ldots = full_side[n_total - n_chars:] if n_chars else ''
            rdots = full_side[:n_chars] if n_chars else ''
            label = f"{ldots}  BOOT  {rdots}"
            last_dots_w = len(label) + 10   # padding so each stage has distinct width
            content = [_center(_gradient_colorize(label), last_dots_w)]
            prev_total = _render_frame_centered(content, min(last_dots_w, w), prev_total)

        elif state == 'morph':
            if sa >= MORPH_S:
                state, state_start = 'progress_wait', now
                continue
            t = _ease(sa / MORPH_S)
            cur_w = max(16, min(w, int(last_dots_w + (BOOT_W - last_dots_w) * t)))
            prev_total = _render_frame_centered([''], cur_w, prev_total)

        elif state == 'progress_wait':
            card_w = min(BOOT_W, w)
            if sync_done:
                prog = 1.0
            else:
                if sa < 1.0:
                    raw = 0.90 * (1 - math.exp(-sa * 5))
                else:
                    raw = 0.90 + 0.09 * min(1.0, (sa - 1.0) / 2.0)
                prog = min(raw, 0.99)

            bar = progress_bar(prog, length=bar_len, show_pct=False)
            spin = spinner_frame(age)
            pct = f"{int(prog * 100)}%"
            status = f"{C.BCYN}{spin}{C.RST} {C.DIM}{step_label}{C.RST}  {C.BWHT}{pct}{C.RST}"
            content = [_center(bar, BOOT_W), _center(status, BOOT_W)]
            prev_total = _render_frame_centered(content, card_w, prev_total)

            if sync_done and sync_snap_time is not None and (age - sync_snap_time) >= 0.2:
                state, state_start = 'progress_drain', now
                continue

        elif state == 'progress_drain':
            DRAIN_S = 0.25
            if sa >= DRAIN_S:
                state, state_start = 'decode_logo', now
                continue
            card_w = min(BOOT_W, w)
            prog = 1.0 - _ease(sa / DRAIN_S)
            bar = progress_bar(prog, length=bar_len, show_pct=False)
            content = [_center(bar, BOOT_W)]
            prev_total = _render_frame_centered(content, card_w, prev_total)

        elif state == 'decode_logo':
            DECODE_LOGO_S = 0.5
            card_w = min(BOOT_W, w)
            if sa >= DECODE_LOGO_S:
                resolved_boot = []
                for li in range(N_G):
                    resolved_boot.append(
                        f"{' ' * logo_pad}{_gradient_colorize(_BOOT_GLYPHS[li])}"
                    )
                state, state_start = 'hold_logo', now
                continue
            row_delay = 0.08
            longest = max(len(g) for g in _BOOT_GLYPHS)
            char_rate = max(0.005, (DECODE_LOGO_S - N_G * row_delay) / max(longest, 1))
            n_visible = min(N_G, int(sa / row_delay) + 1)
            content = []
            for li in range(n_visible):
                plain = _BOOT_GLYPHS[li]
                row_age = max(0.0, sa - li * row_delay)
                if row_age / char_rate >= len(plain):
                    content.append(f"{' ' * logo_pad}{_gradient_colorize(plain)}")
                else:
                    revealed = scramble_text(plain, row_age, char_rate=char_rate)
                    content.append(f"{' ' * logo_pad}{_gradient_colorize(revealed)}")
            prev_total = _render_frame_centered(content, card_w, prev_total)

        elif state == 'hold_logo':
            HOLD_LOGO_S = 1.0
            if sa >= HOLD_LOGO_S:
                state, state_start = 'crossfade', now
                continue
            prev_total = _render_frame_centered(resolved_boot, min(BOOT_W, w), prev_total)

        elif state == 'crossfade':
            XFADE_S = 0.5
            if sa >= XFADE_S:
                break
            card_w = min(BOOT_W, w)
            content = []
            row_stagger = 0.06
            avail = max(0.1, XFADE_S - (N_G - 1) * row_stagger)
            for li in range(N_G):
                boot_plain = _BOOT_GLYPHS[li]
                file_plain = _FILE_GLYPHS[li]
                row_t = max(0.0, min(1.0, (sa - li * row_stagger) / avail))
                if row_t < 0.5:
                    # BOOT scrambles out
                    virtual_age = (1.0 - row_t * 2) * len(boot_plain) * 0.012
                    revealed = scramble_text(boot_plain, virtual_age, char_rate=0.012)
                else:
                    # FILES scrambles in
                    virtual_age = (row_t - 0.5) * 2 * len(file_plain) * 0.012
                    revealed = scramble_text(file_plain, virtual_age, char_rate=0.012)
                content.append(f"{' ' * logo_pad}{_gradient_colorize(revealed)}")
            prev_total = _render_frame_centered(content, card_w, prev_total)

        time.sleep(0.025)

    return prev_total, BOOT_W

def animate_progress(label, duration=1.2, width=24):
    """Animated progress bar with braille spinner."""
    start = time.time()
    while True:
        age = time.time() - start
        prog = min(1.0, age / duration)
        spin = spinner_frame(age)
        bar = progress_bar(prog, length=width)
        clear_line()
        sys.stdout.write(f"\r  {C.BMAG}{spin}{C.RST} {C.DIM}{label}{C.RST}  {bar}")
        sys.stdout.flush()
        if prog >= 1.0:
            break
        time.sleep(0.04)
    clear_line()
    sys.stdout.write(f"\r  {C.BGRN}{CHECK}{C.RST} {label}  {C.DIM}done{C.RST}\n")
    sys.stdout.flush()

def animate_step(label, ok=True):
    """Quick step indicator with radar sweep."""
    frames = 12
    for i in range(frames):
        spin = RADAR_SWEEP[i % len(RADAR_SWEEP)]
        clear_line()
        sys.stdout.write(f"\r  {C.BYLW}{spin}{C.RST} {C.DIM}{label}{C.RST}")
        sys.stdout.flush()
        time.sleep(0.06)
    clear_line()
    mark = f"{C.BGRN}{CHECK}" if ok else f"{C.RED}{CROSS}"
    sys.stdout.write(f"\r  {mark}{C.RST} {label}\n")
    sys.stdout.flush()

# ─────────────────────────────────────────────────────────────
#  Core server logic — freeze/thaw serverless model
# ─────────────────────────────────────────────────────────────

# After STALE_TIMEOUT seconds with no requests, the server freezes:
# the socket stays bound (no connection refused), but the handler
# becomes a lightweight sentinel. On the next request the sentinel
# thaws the real file-serving handler inline and serves the response.
# Zero downtime. Zero port gaps.


class _ThawMixin:
    """Mixin injected into both frozen and live handlers.
    Touches the slot's last_request timestamp on every request."""

    def _touch(self):
        slot = getattr(self.server, '_slot', None)
        if slot:
            slot.last_request = time.time()
            # If we were frozen, thaw now (swap handler class on the server)
            if slot.frozen:
                slot.thaw()


class FrozenHandler(http.server.BaseHTTPRequestHandler, _ThawMixin):
    """Sentinel handler while the server is cold.
    Accepts the TCP connection (no refused), thaws the slot,
    then serves the request as if nothing happened."""

    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        self._touch()
        try:
            http.server.SimpleHTTPRequestHandler(
                self.request, self.client_address, self.server,
                directory=self.server._slot.directory,
            )
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass

    def do_HEAD(self):
        self._touch()
        try:
            http.server.SimpleHTTPRequestHandler(
                self.request, self.client_address, self.server,
                directory=self.server._slot.directory,
            )
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass


class LiveHandler(http.server.SimpleHTTPRequestHandler, _ThawMixin):
    """Normal file-serving handler. Tracks activity."""

    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        self._touch()
        try:
            return super().do_GET()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass  # client hung up mid-response; normal browser behavior

    def do_HEAD(self):
        self._touch()
        try:
            return super().do_HEAD()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass


class ServerSlot:
    """Manages one HTTP server with freeze/thaw lifecycle.

    - LIVE:   LiveHandler serves files normally.
    - FROZEN: FrozenHandler holds the socket open but does no work.
              First request thaws back to LIVE inline (zero latency).

    The socket is *never* unbound. No connection refused, ever.
    """

    def __init__(self, directory, port, label):
        self.directory = directory
        self.port = port
        self.label = label
        self.last_request = time.time()
        self.freezes = 0
        self._server = None
        self._thread = None
        self._lock = threading.Lock()
        self.alive = False
        self.frozen = False

    # ── lifecycle ──────────────────────────────────────────

    def start(self):
        """Bind, listen, serve with LiveHandler."""
        with self._lock:
            handler = functools.partial(LiveHandler, directory=self.directory)
            srv = http.server.HTTPServer(("", self.port), handler)
            srv._slot = self
            self._server = srv
            t = threading.Thread(target=srv.serve_forever, daemon=True)
            t.start()
            self._thread = t
            self.alive = True
            self.frozen = False

    def stop(self):
        """Non-blocking shutdown: signal serve_forever to exit,
        close the socket, join with a short timeout. Safe to call
        during KeyboardInterrupt cleanup."""
        with self._lock:
            if self._server:
                # Signal the serve_forever poll loop to stop
                self._server._BaseServer__shutdown_request = True
                try:
                    self._server.server_close()
                except Exception:
                    pass
                self._server = None
            if self._thread:
                self._thread.join(timeout=1)
                self._thread = None
            self.alive = False
            self.frozen = False

    def freeze(self):
        """Swap to FrozenHandler. Socket stays bound."""
        with self._lock:
            if self._server and not self.frozen:
                self._server.RequestHandlerClass = FrozenHandler
                self.frozen = True
                self.freezes += 1

    def thaw(self):
        """Swap back to LiveHandler. Called inline by FrozenHandler."""
        with self._lock:
            if self._server and self.frozen:
                self._server.RequestHandlerClass = functools.partial(
                    LiveHandler, directory=self.directory
                )
                self.frozen = False

    # ── staleness ──────────────────────────────────────────

    def idle_seconds(self):
        return time.time() - self.last_request

    def is_stale(self):
        return self.alive and not self.frozen and self.idle_seconds() >= STALE_TIMEOUT


_GIT_FLAGS = 0x08000000 if sys.platform == "win32" else 0

def _git(*args):
    """Run a git command in REPO_ROOT. Returns (ok, stdout, stderr)."""
    try:
        r = subprocess.run(
            ["git"] + list(args),
            cwd=REPO_ROOT, capture_output=True, text=True,
            creationflags=_GIT_FLAGS,
        )
        return (r.returncode == 0, r.stdout.strip(), r.stderr.strip())
    except Exception as e:
        return (False, '', str(e))

def git_sync(result_box):
    """Full git sync: init submodules, fetch, pull (no push).

    result_box protocol:
      [0] = None while running; True/False when done (overall success)
      [1] = current step label (str) for animation display
      [2] = list of (label, ok) tuples for completed steps
    """
    steps = []
    all_ok = True

    def step(label, *git_args):
        nonlocal all_ok
        result_box[1] = label
        ok, _out, _err = _git(*git_args)
        steps.append((label, ok))
        if not ok:
            all_ok = False
        return ok

    # 1. Init submodules (idempotent if already initialized)
    step('Initializing submodules', 'submodule', 'init')

    # 2. Update submodules with remote tracking
    step('Updating submodules', 'submodule', 'update', '--init', '--remote', '--merge')

    # 3. Fetch all remotes
    step('Fetching remotes', 'fetch', '--all', '--prune')

    # 4. Pull with fast-forward only (safe; fails if diverged)
    step('Pulling latest', 'pull', '--ff-only')

    result_box[2] = steps
    result_box[0] = all_ok

# ─────────────────────────────────────────────────────────────
#  Watchdog — freezes stale servers
# ─────────────────────────────────────────────────────────────

def watchdog(slots):
    """Daemon thread: checks every WATCHDOG_INTERVAL seconds.
    If a server has had no requests for STALE_TIMEOUT seconds,
    it gets frozen. The socket stays open; the next request thaws it."""
    while True:
        time.sleep(WATCHDOG_INTERVAL)
        for slot in slots:
            if slot.is_stale():
                slot.freeze()

# ─────────────────────────────────────────────────────────────
#  Idle pulse — heartbeat while servers run
# ─────────────────────────────────────────────────────────────

# fmt_idle imported from TUI

def idle_pulse(slots):
    """Show a living heartbeat with per-server staleness.
    Adapts layout to terminal width each frame.

    When ALL servers are frozen, drops to a static '❄ frozen' line
    and sleeps 5s between redraws instead of 0.5s. Resumes normal
    cadence the moment any slot thaws (i.e. gets a request).
    """
    start = time.time()
    ACTIVE_INTERVAL = 1.0
    FROZEN_INTERVAL = 5.0
    was_all_frozen = False
    prev_w, prev_h = term_width(), term_height()
    try:
        while True:
            w = term_width()
            h = term_height()
            size_changed = (w != prev_w or h != prev_h)
            prev_w, prev_h = w, h
            age = time.time() - start
            all_frozen = all(sl.frozen for sl in slots)

            if all_frozen:
                # ── Static frozen line: no spinner, no uptime counter ──
                total_frz = sum(sl.freezes for sl in slots)
                frz_tag = f"  {C.DIM}({total_frz} cycles){C.RST}" if total_frz else ""
                if w >= 50:
                    line = (
                        f"\r  {C.BCYN}❄{C.RST}"
                        f"  {C.DIM}frozen{C.RST}{frz_tag}"
                        f"  {C.DIM}{BOX_V}{C.RST}"
                        f"  {C.DIM}thaws on request{C.RST}"
                        f"  {C.DIM}{BOX_V}{C.RST}"
                        f"  {C.DIM}Ctrl+C{C.RST}\n"
                    )
                else:
                    line = f"\r  {C.BCYN}❄{C.RST}  {C.DIM}frozen{frz_tag}  {BOX_V}  Ctrl+C{C.RST}"

                # Repaint on state transition OR terminal resize
                if not was_all_frozen or size_changed:
                    clear_line()
                    sys.stdout.write(line)
                    sys.stdout.flush()
                was_all_frozen = True
                # Poll for resize during frozen sleep (don't block 5s)
                deadline = time.time() + FROZEN_INTERVAL
                while time.time() < deadline:
                    time.sleep(0.25)
                    if term_width() != prev_w or term_height() != prev_h:
                        break
                continue

            # ── Active: at least one slot is live ──
            # If we just left frozen state, clear the stale frozen line
            if was_all_frozen:
                clear_line()
            was_all_frozen = False

            pulse = PULSE_DIAMOND[int(age / ACTIVE_INTERVAL) % len(PULSE_DIAMOND)]
            ts = _fmt_uptime(age)
            uclr = _time_clr(age)

            # Per-server idle + freeze count
            parts = []
            for sl in slots:
                idle = sl.idle_seconds()
                frz_tag = f" {C.DIM}f{sl.freezes}{C.RST}" if sl.freezes else ""
                if sl.frozen:
                    state = f"{C.BCYN}❄{C.RST}"
                    clr = C.BCYN
                else:
                    state = f"{C.BGRN}{CIRCLE_FILLED}{C.RST}"
                    clr = _time_clr(idle)

                if w >= 70:
                    # Full: icon :port idle fN
                    tag = f":{sl.port}"
                    parts.append(
                        f"{state} {C.BWHT}{tag}{C.RST}"
                        f" {clr}{fmt_idle(idle)}{C.RST}{frz_tag}"
                    )
                else:
                    # Compact: icon idle (drop port label)
                    parts.append(
                        f"{state} {clr}{fmt_idle(idle)}{C.RST}{frz_tag}"
                    )

            sep = f"  {C.DIM}{BOX_V}{C.RST}  "
            status = sep.join(parts)

            if w >= 60:
                line = (
                    f"\r  {C.BCYN}{pulse}{C.RST}"
                    f"  {uclr}uptime({ts}){C.RST}"
                    f"  {C.DIM}{BOX_V}{C.RST}  {status}"
                    f"  {C.DIM}{BOX_V}{C.RST}"
                    f"  {C.DIM}Ctrl+C{C.RST}"
                )
            elif w >= 40:
                line = (
                    f"\r {C.BCYN}{pulse}{C.RST}"
                    f" {uclr}{ts}{C.RST}"
                    f" {C.DIM}{BOX_V}{C.RST} {status}"
                )
            else:
                line = f"\r {C.BCYN}{pulse}{C.RST} {uclr}{ts}{C.RST} {status}"

            clear_line()
            # Truncate visible chars to terminal width to prevent wrap
            if len(strip_ansi(line)) > w:
                # Keep leading \r, truncate the rest
                line = '\r' + truncate_ansi(line.lstrip('\r'), w - 1, ellipsis='')

            sys.stdout.write(line)
            sys.stdout.flush()
            time.sleep(ACTIVE_INTERVAL)
    except KeyboardInterrupt:
        raise


def idle_pulse_boxed(slots, prev_total, card_w=52, skip_decode=False):
    """Idle heartbeat in a centered gradient card (style: TEST.py).
    Shows logo, tagline, server info with decode-in entrance.
    When ALL servers are frozen, switches to static frozen display.
    """
    start = time.time()
    ACTIVE_INTERVAL = 1.0
    FROZEN_INTERVAL = 5.0
    DECODE_S = 0.6        # row-by-row decode intro
    was_all_frozen = False
    decoded_done = skip_decode

    def _build_static(tw, h, cw, usable):
        """Build the static portions: logo + bar.
        Returns (content, fat) where fat ∈ [0,2] = padding slots filled."""
        N_GLYPH = len(_FILE_GLYPHS)
        glyph_w = max(len(r) for r in _FILE_GLYPHS)
        max_glyphs = max(0, h - 10)
        N = min(N_GLYPH, max_glyphs)
        logo_pad = max(0, (usable - glyph_w) // 2)

        # Baby-fat budget: 2 optional blank lines (bar↔info, bottom)
        base = N + (1 if N > 0 else 0) + 1 + 3
        fat = min(2, max(0, h - base - 2))

        content = []
        for li in range(N):
            content.append(f"{' ' * logo_pad}{_gradient_colorize(_FILE_GLYPHS[li])}")
        if N > 0:
            content.append("")
        bar = progress_bar(1.0, length=glyph_w, show_pct=False)
        content.append(_center(bar, cw))
        if fat >= 1:
            content.append("")  # padding: bar ↔ info rows
        return content, fat

    def _build_info_lines(age):
        """Build the live info rows (server status + uptime).
        Text after status icon is gradient-colorized to match logo."""
        all_frozen = all(sl.frozen for sl in slots)
        info_raw = []
        for sl in slots:
            idle = sl.idle_seconds()
            idle_str = fmt_idle(idle)
            ftag = f" f{sl.freezes}" if sl.freezes else ""
            if sl.frozen:
                st = f"{C.BCYN}\u2744{C.RST}"
            else:
                st = f"{C.BGRN}{CIRCLE_FILLED}{C.RST}"
            plain = f":{sl.port}  {idle_str}{ftag}  {ARROW_R}  {sl.label}"
            info_raw.append(f"{st}  {_gradient_colorize(plain)}")

        if all_frozen:
            total_frz = sum(sl.freezes for sl in slots)
            frz_tag = f" ({total_frz} cycles)" if total_frz else ""
            plain = f"frozen{frz_tag}  {ARROW_R}  Ctrl+C"
            info_raw.append(f"{C.BCYN}\u2744{C.RST}  {_gradient_colorize(plain)}")
        else:
            pulse = PULSE_DIAMOND[int(age / ACTIVE_INTERVAL) % len(PULSE_DIAMOND)]
            ts = _fmt_uptime(age)
            plain = f"uptime({ts})  {ARROW_R}  Ctrl+C"
            info_raw.append(f"{C.BCYN}{pulse}{C.RST}  {_gradient_colorize(plain)}")
        return info_raw, all_frozen

    try:
        while True:
            tw = term_width()
            h  = term_height()
            age = time.time() - start
            cw = min(card_w, tw)
            usable = max(0, cw - 4)

            content, fat = _build_static(tw, h, cw, usable)
            info_raw, all_frozen = _build_info_lines(age)

            # Pad info block to center
            blk_w = max(len(strip_ansi(l)) for l in info_raw)
            blk_pad = max(0, (usable - blk_w) // 2)
            info_padded = [f"{' ' * blk_pad}{il}" for il in info_raw]

            if not decoded_done and age < DECODE_S:
                # Decode-in: rows enter top-to-bottom with scramble
                decoded, resolved = _decode_rows(info_padded, age, DECODE_S)
                content.extend(decoded)
                if fat >= 2:
                    content.append("")  # padding: info ↔ bottom border
                interval = 0.03
            else:
                decoded_done = True
                content.extend(info_padded)
                if fat >= 2:
                    content.append("")  # padding: info ↔ bottom border
                if all_frozen:
                    interval = FROZEN_INTERVAL if was_all_frozen else ACTIVE_INTERVAL
                    was_all_frozen = True
                else:
                    was_all_frozen = False
                    interval = ACTIVE_INTERVAL

            prev_total = _render_frame_centered(content, cw, prev_total)
            # Poll for resize during sleep (frozen=5s would block responsiveness)
            deadline = time.time() + interval
            while time.time() < deadline:
                time.sleep(min(0.25, max(0, deadline - time.time())))
                if term_width() != tw or term_height() != h:
                    break  # resize detected — re-enter loop immediately
    except KeyboardInterrupt:
        _shutdown_animation(prev_total, cw, slots, last_content=content)


# ─────────────────────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    slots = [
        ServerSlot(
            directory=os.path.join(REPO_ROOT, "mutilar.github.io"),
            port=PORT_PORTFOLIO,
            label="mutilar.github.io",
        ),
        ServerSlot(
            directory=REPO_ROOT,
            port=PORT_LANDING,
            label="bootfile.dev",
        ),
    ]

    try:
        enter_alt_screen()
        hide_cursor()

        # ── Kick off git sync in background ──
        git_result = [None, '', []]  # [done, step_label, completed_steps]
        git_thread = threading.Thread(
            target=git_sync, args=(git_result,), daemon=True
        )
        git_thread.start()

        # ── Boot animation ──
        boot_prev, boot_w = animate_boot_sequence(git_result, target_duration=BOOT_DURATION)

        # ── Post-boot: morph → decode server info → idle ──
        INFO_W = 52
        if boot_prev > 0:
            # Start servers immediately
            for slot in slots:
                slot.start()

            tw = term_width()
            cw = min(INFO_W, tw)
            usable = max(0, cw - 4)

            # Build FILES rows (already visible from crossfade)
            N_GLYPH = len(_FILE_GLYPHS)
            glyph_w = max(len(r) for r in _FILE_GLYPHS)
            h = term_height()
            max_glyphs = max(0, h - 10)
            N = min(N_GLYPH, max_glyphs)
            logo_pad = max(0, (usable - glyph_w) // 2)

            logo_rows = []
            for li in range(N):
                logo_rows.append(f"{' ' * logo_pad}{_gradient_colorize(_FILE_GLYPHS[li])}")
            if N > 0:
                logo_rows.append('')

            # Baby-fat padding budget (2 slots: bar↔info, bottom)
            base = N + (1 if N > 0 else 0) + 1 + 3
            fat = min(2, max(0, h - base - 2))
            pad_bar_info = [''] if fat >= 1 else []
            pad_bottom   = [''] if fat >= 2 else []

            # Morph width: boot_w → INFO_W (FILES visible during morph)
            MORPH_S = 0.45
            morph_start = time.time()
            while True:
                sa = time.time() - morph_start
                if sa >= MORPH_S:
                    break
                t = _ease(sa / MORPH_S)
                cur_w = max(16, min(tw, int(boot_w + (cw - boot_w) * t)))
                boot_prev = _render_frame_centered(logo_rows, cur_w, boot_prev)
                time.sleep(0.025)
            boot_prev = _render_frame_centered(logo_rows, cw, boot_prev)

            # Progress bar fills in (0.25s)
            bar_len = glyph_w
            FILL_BAR_S = 0.25
            db_start = time.time()
            while True:
                sa = time.time() - db_start
                if sa >= FILL_BAR_S:
                    break
                prog = _ease(sa / FILL_BAR_S)
                bar = progress_bar(prog, length=bar_len, show_pct=False)
                bar_line = _center(bar, cw)
                boot_prev = _render_frame_centered(logo_rows + [bar_line], cw, boot_prev)
                time.sleep(0.025)
            bar = progress_bar(1.0, length=bar_len, show_pct=False)
            bar_line = _center(bar, cw)
            boot_prev = _render_frame_centered(logo_rows + [bar_line], cw, boot_prev)

            header = logo_rows + [bar_line] + pad_bar_info

            # Build info rows (server status + uptime)
            info_raw = []
            for sl in slots:
                plain = f":{sl.port}  {fmt_idle(0)}  {ARROW_R}  {sl.label}"
                info_raw.append(f"{C.BGRN}{CIRCLE_FILLED}{C.RST}  {_gradient_colorize(plain)}")
            plain = f"uptime(0s)  {ARROW_R}  Ctrl+C"
            info_raw.append(f"{C.BCYN}{PULSE_DIAMOND[0]}{C.RST}  {_gradient_colorize(plain)}")
            blk_w = max(len(strip_ansi(l)) for l in info_raw)
            blk_pad = max(0, (usable - blk_w) // 2)
            info_padded = [f"{' ' * blk_pad}{il}" for il in info_raw]

            # Decode info rows in (row-by-row, 0.6s)
            DECODE_I = 0.6
            di_start = time.time()
            while True:
                sa = time.time() - di_start
                if sa >= DECODE_I:
                    break
                decoded, _ = _decode_rows(info_padded, sa, DECODE_I)
                boot_prev = _render_frame_centered(header + decoded + pad_bottom, cw, boot_prev)
                time.sleep(0.025)

            # Show final resolved info
            boot_prev = _render_frame_centered(header + info_padded + pad_bottom, cw, boot_prev)
        else:
            # Minimal mode fallback — no box
            for slot in slots:
                slot.start()
            time.sleep(0.15)
            print(f"  {C.BGRN}{CHECK}{C.RST} Servers started")

        # ── Start watchdog ──
        threading.Thread(
            target=watchdog, args=(slots,), daemon=True
        ).start()

        # ── Idle heartbeat ──
        if boot_prev > 0:
            idle_pulse_boxed(slots, boot_prev, card_w=min(INFO_W, term_width()), skip_decode=True)
        else:
            print()
            idle_pulse(slots)

    except KeyboardInterrupt:
        pass
    finally:
        try:
            show_cursor()
            leave_alt_screen()
            # Servers already stopped by _shutdown_animation;
            # ensure they're down for minimal-mode path too.
            for slot in slots:
                slot.stop()
        except (KeyboardInterrupt, Exception):
            pass
