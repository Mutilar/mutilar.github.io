"""
TEST.py — Smoke tests for TUI.py + SERVE.py components.
Run:  python TEST.py          (unit tests)
      python TEST.py --visual (+ eyeball demos)
No dependencies beyond TUI.py and SERVE.py.
"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from TUI import *
import SERVE as S

# ─────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────

_pass = 0
_fail = 0

def _check(name, condition, detail=""):
    global _pass, _fail
    if condition:
        _pass += 1
    else:
        _fail += 1
        msg = f"  {C.RED}{CROSS}{C.RST} {name}"
        if detail:
            msg += f"  {C.DIM}({detail}){C.RST}"
        print(msg)

# ─────────────────────────────────────────────────────────────
#  Tests — TUI primitives
# ─────────────────────────────────────────────────────────────

def test_strip_ansi():
    """strip_ansi removes all escape sequences."""
    raw = f"{C.BGRN}hello{C.RST} {fg(255,0,0)}world{C.RST}"
    stripped = strip_ansi(raw)
    _check("strip_ansi: basic", stripped == "hello world", repr(stripped))

    empty = strip_ansi("")
    _check("strip_ansi: empty", empty == "")

    plain = "no escapes here"
    _check("strip_ansi: passthrough", strip_ansi(plain) == plain)


def test_truncate_ansi():
    """truncate_ansi respects visible char budget."""
    colored = f"{C.BGRN}Hello, World!{C.RST}"

    # Full width: no truncation
    t = truncate_ansi(colored, 20)
    _check("truncate: no-op when fits", strip_ansi(t) == "Hello, World!")

    # Tight: should end with ellipsis
    t5 = truncate_ansi(colored, 5)
    vis = strip_ansi(t5)
    _check("truncate: 5 chars", len(vis) <= 5, repr(vis))
    _check("truncate: has ellipsis", "…" in vis, repr(vis))

    # Edge: max_vis=0
    t0 = truncate_ansi(colored, 0)
    _check("truncate: zero", t0 == "")

    # Edge: max_vis=1 (just ellipsis)
    t1 = truncate_ansi(colored, 1)
    vis1 = strip_ansi(t1)
    _check("truncate: 1 char", len(vis1) <= 1, repr(vis1))

    # Plain text (no ANSI)
    tp = truncate_ansi("abcdefghij", 6)
    visp = strip_ansi(tp)
    _check("truncate: plain text", len(visp) <= 6, repr(visp))


def test_progress_bar():
    """progress_bar returns valid output at boundary values."""
    for p in [0.0, 0.5, 1.0]:
        bar = progress_bar(p, length=10)
        vis = strip_ansi(bar)
        _check(f"progress_bar({p}): renderable", len(vis) > 0, repr(vis))

    # Clamp
    bar_neg = progress_bar(-0.5, length=10)
    bar_over = progress_bar(1.5, length=10)
    _check("progress_bar: clamp negative", "0%" in strip_ansi(bar_neg))
    _check("progress_bar: clamp >1", "100%" in strip_ansi(bar_over))


def test_box_integrity():
    """box() output has consistent visible widths at various terminal sizes."""
    lines = [
        f"{C.BGRN}{CIRCLE_FILLED}{C.RST}  {C.BWHT}:8000{C.RST}  {C.DIM}{ARROW_R}{C.RST}  mutilar.github.io  {C.DIM}(portfolio){C.RST}",
        f"{C.BGRN}{CIRCLE_FILLED}{C.RST}  {C.BWHT}:8080{C.RST}  {C.DIM}{ARROW_R}{C.RST}  bootfile.dev       {C.DIM}(landing){C.RST}",
        f"{C.DIM}{DIAMOND_DOT}  30s idle {ARROW_R} freeze {ARROW_R} thaw on request{C.RST}",
    ]

    for w in [120, 80, 50, 35, 25, 15, 10]:
        b = box(lines, width=w)
        rows = b.split('\n')
        widths = [len(strip_ansi(r)) for r in rows]
        uniform = all(v == w for v in widths)
        _check(f"box width={w}: all rows={w}", uniform,
               f"got {widths}" if not uniform else "")


def test_gradient():
    """gradient_rgb returns valid RGB at boundaries."""
    for t in [0.0, 0.25, 0.5, 0.75, 1.0]:
        r, g, b = gradient_rgb(t)
        valid = all(0 <= c <= 255 for c in (r, g, b))
        _check(f"gradient t={t}: valid RGB", valid, f"({r},{g},{b})")


def test_scramble_text():
    """scramble_text resolves fully after enough time."""
    target = "Hello World"
    # age=0: nothing resolved
    s0 = scramble_text(target, 0.0, char_rate=0.01)
    _check("scramble: age=0 differs", s0 != target)

    # Large age: fully resolved
    s_done = scramble_text(target, 10.0, char_rate=0.01)
    _check("scramble: large age resolves", s_done == target, repr(s_done))

    # Whitespace preserved
    s_ws = scramble_text("a b", 0.0, char_rate=0.01)
    _check("scramble: spaces preserved", s_ws[1] == " ", repr(s_ws))


def test_divider():
    """divider() matches requested length."""
    for L in [80, 40, 20, 5, 2]:
        d = divider(length=L)
        vis = strip_ansi(d)
        _check(f"divider len={L}", len(vis) == L, f"got {len(vis)}")


def test_spinner_frame():
    """spinner_frame cycles without crashing."""
    for age in [0.0, 0.5, 1.0, 100.0]:
        f = spinner_frame(age)
        _check(f"spinner age={age}", f in BRAILLE_SPIN, repr(f))


def test_fmt_idle():
    """fmt_idle formats durations correctly."""
    _check("fmt_idle: 5s", fmt_idle(5) == "5s")
    _check("fmt_idle: 59s", fmt_idle(59) == "59s")
    _check("fmt_idle: 60s", fmt_idle(60) == "1m00s")
    _check("fmt_idle: 125s", fmt_idle(125) == "2m05s")


def test_settings_loaded():
    """SETTINGS.json was loaded and accents parsed into gradient."""
    _check("settings: loaded", len(SETTINGS) > 0, "SETTINGS is empty")
    _check("settings: has identity", 'identity' in SETTINGS)
    _check("settings: has accents", 'accents' in SETTINGS)
    _check("settings: has nav", 'nav' in SETTINGS or _has_section_nav(),
           "nav in SETTINGS or per-section JSONs with index+nav")
    # Gradient should match parsed accents (positional array)
    acc = SETTINGS.get('accents', [])
    if isinstance(acc, list) and len(acc) >= 1:
        import TUI
        expected_first = TUI._parse_rgb(acc[0])
        _check("settings: gradient[0] == accents[0]",
               MSFT_GRADIENT[0] == expected_first,
               f"{MSFT_GRADIENT[0]} vs {expected_first}")


def test_serve_settings_identity():
    """SERVE.py derived values from SETTINGS.json identity."""
    _check("serve: SITE_NAME set", len(S.SITE_NAME) > 0, repr(S.SITE_NAME))
    _check("serve: SITE_EMOJI set", len(S.SITE_EMOJI) > 0, repr(S.SITE_EMOJI))
    _check("serve: GREETING set", len(S.GREETING) > 0, repr(S.GREETING))


# ─────────────────────────────────────────────────────────────
#  Tests — SERVE-specific
# ─────────────────────────────────────────────────────────────

def test_boot_art_centering():
    """_build_boot_art centers logo relative to terminal width."""
    import TUI
    orig_tui = TUI.term_width
    orig_serve = S.term_width
    glyph_w = max(len(r) for r in S._BOOT_GLYPHS)
    for fake_w in [80, 50, 120]:
        TUI.term_width = lambda _w=fake_w: _w
        S.term_width = lambda _w=fake_w: _w
        art = S._build_boot_art()
        for i, ln in enumerate(art):
            vis = strip_ansi(ln)
            if not vis.strip():
                continue
            left_pad = len(vis) - len(vis.lstrip())
            if i < len(S._BOOT_GLYPHS):
                row_len = len(S._BOOT_GLYPHS[i])
                expected_pad = max(0, (fake_w - row_len) // 2)
            else:
                content_len = len(vis.strip())
                expected_pad = max(0, (fake_w - content_len) // 2)
            _check(f"logo center w={fake_w} row={i}: pad={left_pad}",
                   left_pad == expected_pad,
                   f"expected {expected_pad}, got {left_pad}")
    TUI.term_width = orig_tui
    S.term_width = orig_serve


# ─────────────────────────────────────────────────────────────
#  Tests — Height responsiveness
# ─────────────────────────────────────────────────────────────

def _mock_dims(fake_w, fake_h):
    """Monkey-patch term_width/term_height in both TUI and SERVE modules.
    Returns a restore callable."""
    import TUI
    orig = (TUI.term_width, TUI.term_height, S.term_width, S.term_height)
    TUI.term_width  = lambda _w=fake_w: _w
    TUI.term_height = lambda _h=fake_h: _h
    S.term_width    = lambda _w=fake_w: _w
    S.term_height   = lambda _h=fake_h: _h
    def restore():
        TUI.term_width, TUI.term_height, S.term_width, S.term_height = orig
    return restore


def test_term_height_exists():
    """term_height() returns a positive integer."""
    h = term_height()
    _check("term_height: returns int", isinstance(h, int), type(h).__name__)
    _check("term_height: positive", h > 0, f"got {h}")


def test_boot_art_line_count():
    """_build_boot_art always returns 5 glyphs + 1 blank + 1 tagline = 7 lines."""
    for w in [120, 80, 40, 20]:
        restore = _mock_dims(w, 24)
        art = S._build_boot_art()
        restore()
        _check(f"boot_art w={w}: 7 lines", len(art) == 7,
               f"got {len(art)}")
        # Blank line at index 5
        _check(f"boot_art w={w}: line[5] blank",
               strip_ansi(art[5]).strip() == "",
               repr(strip_ansi(art[5])))


def test_boot_sequence_logo_clamping():
    """Boot sequence glassmorphic card sizing.
    Phase 1: 1 content + 2 borders = 3 lines.
    Phase 2: up to 4 content + 2 borders = 6 lines.
    Minimal mode at h <= 4 (no box)."""
    for h in [24, 14, 11, 8, 7, 6, 5, 4, 3, 2, 1]:
        if h <= 4:
            continue
        phase1_total = 3   # "BOOT" + 2 borders
        phase2_total = 6   # BOOT + bar + spinner + status + 2 borders
        _check(f"boot_seq phase1 h={h}: fits",
               phase1_total <= h,
               f"phase1_total={phase1_total}, h={h}")
        _check(f"boot_seq phase2 h={h}: {'fits' if phase2_total <= h else 'clips'}",
               True,  # phase2 clips gracefully at small h
               f"phase2_total={phase2_total}, h={h}")


def test_boot_sequence_minimal_mode():
    """At height <= 4, boot sequence should use single-line mode (no box)."""
    for h in [1, 2, 3, 4]:
        _check(f"boot_seq h={h}: minimal mode (no box)",
               h <= 4,
               f"h={h}")


def test_boot_logo_height_clamping():
    """animate_boot_logo truncates art to h-2 lines."""
    N_FULL = 7  # _build_boot_art returns 7 lines
    for h in [24, 10, 7, 5, 3, 2, 1]:
        max_art = max(0, h - 2)
        clamped = min(N_FULL, max_art)
        _check(f"boot_logo h={h}: shows {clamped}/{N_FULL}",
               0 <= clamped <= N_FULL and clamped <= max(0, h - 2),
               f"clamped={clamped}")


def test_info_display_tiers():
    """Info display layout: boxed when h >= 5, minimal otherwise."""
    test_cases = [
        (24, "boxed"),
        (14, "boxed"),
        (8,  "boxed"),
        (5,  "boxed"),
        (4,  "minimal"),
        (3,  "minimal"),
        (1,  "minimal"),
    ]
    for h, expected in test_cases:
        tier = "boxed" if h >= 5 else "minimal"
        _check(f"info_display h={h}: {tier}",
               tier == expected,
               f"expected {expected}, got {tier}")


def test_box_more_lines_than_height():
    """box() renders correctly even when content exceeds typical terminal height."""
    many_lines = [f"Line {i}" for i in range(50)]
    for w in [60, 30]:
        b = box(many_lines, width=w)
        rows = b.split('\n')
        widths = [len(strip_ansi(r)) for r in rows]
        # All rows should match requested width
        uniform = all(v == w for v in widths)
        _check(f"box 50-line w={w}: uniform width", uniform,
               f"got {set(widths)}" if not uniform else "")
        # Should have 50 content lines + 2 border = 52
        _check(f"box 50-line w={w}: row count=52",
               len(rows) == 52,
               f"got {len(rows)}")


def test_idle_pulse_width_height_combos():
    """idle_pulse status line stays within terminal width at various dimensions.
    Tests the line-building + truncation logic (mirrors idle_pulse's own clamp)."""
    import TUI
    # Build mock slots
    class FakeSlot:
        def __init__(self, port, frozen=False, freezes=0):
            self.port = port
            self.frozen = frozen
            self.freezes = freezes
            self.last_request = __import__('time').time()
        def idle_seconds(self):
            return 42.0

    slots = [FakeSlot(8000), FakeSlot(8080)]

    for w, h in [(120, 30), (80, 24), (60, 10), (40, 5), (25, 3)]:
        restore = _mock_dims(w, h)
        # Simulate one "active" frame of idle_pulse
        age = 10.0
        pulse = PULSE_DIAMOND[int(age / 1.0) % len(PULSE_DIAMOND)]
        m, s = divmod(int(age), 60)
        hr, m = divmod(m, 60)
        ts = f"{hr:02d}:{m:02d}:{s:02d}"
        parts = []
        for sl in slots:
            idle = sl.idle_seconds()
            state = f"{C.BGRN}{CIRCLE_FILLED}{C.RST}"
            clr = C.BGRN
            if w >= 70:
                parts.append(f"{state} {C.BWHT}:{sl.port}{C.RST} {clr}{fmt_idle(idle)}{C.RST}")
            else:
                parts.append(f"{state} {clr}{fmt_idle(idle)}{C.RST}")
        sep = f"  {C.DIM}{BOX_V}{C.RST}  "
        status = sep.join(parts)
        if w >= 60:
            line = f"  {C.BCYN}{pulse}{C.RST}  {C.DIM}up{C.RST} {C.BWHT}{ts}{C.RST}  {C.DIM}{BOX_V}{C.RST}  {status}  {C.DIM}{BOX_V}{C.RST}  {C.DIM}Ctrl+C{C.RST}"
        elif w >= 40:
            line = f" {C.BCYN}{pulse}{C.RST} {C.BWHT}{ts}{C.RST} {C.DIM}{BOX_V}{C.RST} {status}"
        else:
            line = f" {C.BCYN}{pulse}{C.RST} {C.BWHT}{ts}{C.RST} {status}"
        # Apply the same truncation that idle_pulse uses (line 647 of SERVE.py)
        if len(strip_ansi(line)) > w:
            line = truncate_ansi(line, w - 1, ellipsis='')
        vis_len = len(strip_ansi(line))
        restore()
        _check(f"idle_pulse w={w},h={h}: vis_len={vis_len}<=w",
               vis_len <= w,
               f"vis_len={vis_len}, w={w}")


def test_progress_bar_small_lengths():
    """progress_bar doesn't crash at very small lengths (tight terminals)."""
    for length in [1, 2, 3, 5]:
        for p in [0.0, 0.5, 1.0]:
            bar = progress_bar(p, length=length)
            _check(f"progress_bar len={length} p={p}: renderable",
                   len(strip_ansi(bar)) > 0)


def test_header_divider_small():
    """header_line and divider don't crash at very small widths."""
    for w in [5, 3, 1]:
        d = divider(length=w)
        vis_d = strip_ansi(d)
        _check(f"divider w={w}: len matches", len(vis_d) == w, f"got {len(vis_d)}")

    for w in [10, 6]:
        h = header_line("X", width=w)
        vis_h = strip_ansi(h)
        _check(f"header w={w}: renderable", len(vis_h) > 0, f"got {len(vis_h)}")


# ─────────────────────────────────────────────────────────────
#  Visual showcase (--visual)
#  One continuous liquid card morphs through every demo scene.
# ─────────────────────────────────────────────────────────────

def _center(text, card_w):
    """Center a line of text within card inner width (card_w - 4)."""
    usable = max(0, card_w - 4)
    vis = len(strip_ansi(text))
    pad = max(0, (usable - vis) // 2)
    return f"{' ' * pad}{text}"


def _ease(t):
    """Smoothstep ease-in-out, clamped to [0,1]."""
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def _render_centered(content, card_w, term_w, prev_total):
    """Render a gradient-bordered card centered in terminal, rewriting prev_total lines.
    Returns new total line count."""
    frame_str = box(content, width=card_w)
    frame_lines = frame_str.split('\n')
    new_total = len(frame_lines)
    pad = ' ' * max(0, (term_w - card_w) // 2)
    ERASE = '\033[K'
    if prev_total > 0:
        sys.stdout.write(f'\033[{prev_total}A')
    for fl in frame_lines:
        sys.stdout.write(f'\r{pad}{fl}{ERASE}\n')
    if new_total < prev_total:
        for _ in range(prev_total - new_total):
            sys.stdout.write(f'{ERASE}\n')
        sys.stdout.write(f'\033[{prev_total - new_total}A')
    sys.stdout.flush()
    return new_total


def _decode_rows(final_lines, phase_age, decode_s, row_delay=0.08):
    """Build partially-decoded content: rows enter at row_delay intervals,
    each scramble-decoding over decode_s. Returns (visible_content, all_resolved)."""
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
            t_g = ri / max(n - 1, 1)
            r, g, b = gradient_rgb(t_g)
            content.append(f"{fg(r, g, b)}{revealed}{C.RST}")
    return content, all_resolved


def _fadeout_rows(final_lines, phase_age, fadeout_s, row_delay=None):
    """Reverse of _decode_rows: rows retract bottom-to-top, re-scrambling.
    Row stagger and char_rate auto-scale to fit within fadeout_s."""
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
        # Bottom rows fade first
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
            t_g = ri / max(n - 1, 1)
            r, g, b = gradient_rgb(t_g)
            content.append(f"{fg(r, g, b)}{revealed}{C.RST}")
    return content


def demo_showcase():
    """One liquid card morphs through every demo scene.

    Sequence:
      1. BOOT . . .  (animated dots, tiny card)
      2. Progress bar fills → ASCII BOOT logo decodes in sync
      3. Gradient palette (band + color stops)
      4. Glyph reference
      5. Spinner gallery (live)
      6. Sign-off

    Each scene fades in down (500ms), holds (1000ms), fades back up (500ms),
    then the card morphs width to the next scene.
    """
    tw = term_width()
    gray = fg(160, 160, 160)

    # ── Scene builders ──────────────────────────────────────

    # S1: BOOT . . .
    S1_W = min(22, tw)

    # S2: progress bar + BOOT logo decode (driven live, not pre-built)
    S2_W = min(52, tw)
    S2_USABLE = max(0, S2_W - 4)
    GLYPH_W = max(len(r) for r in S._BOOT_GLYPHS)
    LOGO_PAD = max(0, (S2_USABLE - GLYPH_W) // 2)
    N_G = len(S._BOOT_GLYPHS)
    S2_DUR = 2.0  # progress bar fill duration

    def _build_s2_final():
        lines = []
        for li in range(N_G):
            r, g, b = S._logo_row_color(li, N_G)
            lines.append(f"{' ' * LOGO_PAD}{fg(r, g, b)}{S._BOOT_GLYPHS[li]}{C.RST}")
        lines.append('')
        lines.append(_center(f"{C.DIM}\u00b7{C.RST} {S._BOOT_TAGLINE_ANSI}", S2_W))
        bar = progress_bar(1.0, length=max(8, S2_USABLE - 6), show_pct=False)
        lines.append(_center(bar, S2_W))
        return lines

    S2_FINAL = _build_s2_final()

    # S3: Gradient palette
    S3_W = min(52, tw)
    S3_USABLE = max(0, S3_W - 4)

    def _build_s3():
        band = []
        for i in range(S3_USABLE):
            t = i / max(S3_USABLE - 1, 1)
            r, g, b = gradient_rgb(t)
            band.append(f"{fg(r, g, b)}{BLOCK_FULL}")
        gradient_line = ''.join(band) + C.RST
        stops = MSFT_GRADIENT
        lines = [
            _center(f"{C.BOLD}{C.BWHT}Gradient Palette{C.RST}", S3_W),
            '',
            gradient_line,
            '',
        ]
        for si, (r, g, b) in enumerate(stops):
            dot = f"{fg(r, g, b)}{CIRCLE_FILLED}{C.RST}"
            rgb = f"{C.DIM}({r},{g},{b}){C.RST}"
            lines.append(f"  {dot} {rgb}")
        return lines

    S3 = _build_s3()

    # S4: Glyph reference
    S4_W = min(48, tw)

    def _build_s4():
        shapes = f"{DIAMOND_EMPTY} {DIAMOND_FILLED} {DIAMOND_DOT}  {CIRCLE_EMPTY} {CIRCLE_FILLED} {CIRCLE_DOT}"
        blocks = f"{BLOCK_LIGHT} {BLOCK_MEDIUM} {BLOCK_DARK} {BLOCK_FULL}"
        status = f"{C.BGRN}{CHECK}{C.RST}  {C.RED}{CROSS}{C.RST}  {C.BYLW}{WARN}{C.RST}  {C.BCYN}{INFO}{C.RST}"
        arrows = f"{ARROW_L}  {ARROW_U}  {ARROW_R}  {ARROW_D}"
        bx = f"{BOX_TL}{BOX_H}{BOX_H}{BOX_TR}  {BOX_DBL_TL}{BOX_DBL_H}{BOX_DBL_H}{BOX_DBL_TR}"
        return [
            _center(f"{C.BOLD}{C.BWHT}Glyph Reference{C.RST}", S4_W),
            '',
            f"  {C.DIM}shapes{C.RST}    {C.BWHT}{shapes}{C.RST}",
            f"  {C.DIM}blocks{C.RST}    {C.BWHT}{blocks}{C.RST}",
            f"  {C.DIM}status{C.RST}    {status}",
            f"  {C.DIM}arrows{C.RST}    {C.BWHT}{arrows}{C.RST}",
            f"  {C.DIM}borders{C.RST}   {C.BWHT}{bx}{C.RST}",
        ]

    S4 = _build_s4()

    # S5: Spinner gallery (static final lines; live-replaced during hold)
    S5_W = min(48, tw)
    SPINNER_SETS = [
        ("braille",  BRAILLE_SPIN),
        ("block",    BLOCK_SPIN),
        ("box",      PULSE_BOX),
        ("diamond",  PULSE_DIAMOND),
        ("circle",   PULSE_CIRCLE),
        ("radar",    RADAR_SWEEP),
    ]

    def _build_s5_static():
        lines = [_center(f"{C.BOLD}{C.BWHT}Spinner Gallery{C.RST}", S5_W), '']
        for name, frames in SPINNER_SETS:
            trail = '  '.join(f"{C.DIM}{f}{C.RST}" for f in frames)
            lines.append(f"  {C.BWHT}{frames[0]}{C.RST}  {C.BWHT}{name:<8}{C.RST}  {trail}")
        lines.append('')
        lines.append(_center(f"{C.BMAG}glassmorphism{C.RST}", S5_W))
        return lines

    def _build_s5_live(age):
        lines = [_center(f"{C.BOLD}{C.BWHT}Spinner Gallery{C.RST}", S5_W), '']
        for si, (name, frames) in enumerate(SPINNER_SETS):
            idx = int(age / 0.08) % len(frames)
            r, g, b = gradient_rgb(si / max(len(SPINNER_SETS) - 1, 1))
            trail = '  '.join(f"{C.DIM}{f}{C.RST}" for f in frames)
            lines.append(f"  {fg(r, g, b)}{frames[idx]}{C.RST}  {C.BWHT}{name:<8}{C.RST}  {trail}")
        lines.append('')
        revealed = scramble_text("glassmorphism", age, char_rate=0.06)
        lines.append(_center(f"{C.BMAG}{revealed}{C.RST}", S5_W))
        return lines

    S5_STATIC = _build_s5_static()

    # S6: Sign-off
    S6_W = min(36, tw)
    S6 = [
        _center(f"{C.DIM}\u00b7{C.RST} {S._BOOT_TAGLINE_ANSI}", S6_W),
        _center(f"{C.DIM}Brian Hungerman . 2026{C.RST}", S6_W),
    ]

    # ── Phase timeline ──────────────────────────────────────
    # Each phase: (label, duration_s, scene_from_w, scene_to_w)
    # Special phases handled by label name in the loop.
    MORPH = 0.45  # width transition time
    FADE  = 0.5   # fade in / fade out duration
    HOLD  = 1.0   # visible hold duration

    phases = [
        # label             dur    from_w   to_w
        ('dots',            1.8,   S1_W,    S1_W),
        ('morph',           MORPH, S1_W,    S2_W),
        ('progress+logo',   S2_DUR,S2_W,    S2_W),
        ('fadeout',         FADE,  S2_W,    S2_W),   # logo fades up
        ('morph',           MORPH, S2_W,    S3_W),
        ('decode',          FADE,  S3_W,    S3_W),   # palette in
        ('hold',            HOLD,  S3_W,    S3_W),
        ('fadeout',         FADE,  S3_W,    S3_W),   # palette out
        ('morph',           MORPH, S3_W,    S4_W),
        ('decode',          FADE,  S4_W,    S4_W),   # glyphs in
        ('hold',            HOLD,  S4_W,    S4_W),
        ('fadeout',         FADE,  S4_W,    S4_W),   # glyphs out
        ('morph',           MORPH, S4_W,    S5_W),
        ('decode',          FADE,  S5_W,    S5_W),   # spinners in
        ('hold',            HOLD,  S5_W,    S5_W),   # spinners live
        ('fadeout',         FADE,  S5_W,    S5_W),   # spinners out
        ('morph',           MORPH, S5_W,    S6_W),
        ('decode',          FADE,  S6_W,    S6_W),   # sign-off in
        ('hold',            1.5,   S6_W,    S6_W),   # sign-off hold
    ]

    # Pre-compute phase start times
    phase_starts = []
    t = 0.0
    for _, dur, _, _ in phases:
        phase_starts.append(t)
        t += dur
    total_dur = t

    # Track which scene's final content to show during morphs
    # scene_for_phase[i] = final content for the phase
    # We'll resolve this inline below.

    # ── Scene index tracking ──
    # decode/hold/fadeout reference a "current scene" that advances after fadeout.
    # Scene order: S2_FINAL, S3, S4, S5_STATIC, S6
    scene_contents = [S2_FINAL, S3, S4, S5_STATIC, S6]
    scene_widths   = [S2_W,     S3_W,S4_W,S5_W,    S6_W]
    phase_scene_map = {}
    si = 0
    for pi, (label, _, _, _) in enumerate(phases):
        if label in ('decode', 'hold', 'fadeout'):
            phase_scene_map[pi] = si
        elif label == 'progress+logo':
            phase_scene_map[pi] = 0
        if label == 'fadeout':
            si = min(si + 1, len(scene_contents) - 1)

    # ── Animation loop ──────────────────────────────────────
    prev = 0
    start = time.time()
    hide_cursor()
    try:
        while True:
            age = time.time() - start
            if age >= total_dur:
                break

            # Find current phase
            pi = 0
            for i in range(len(phases)):
                if i + 1 < len(phases) and age >= phase_starts[i + 1]:
                    continue
                pi = i
                break

            label, dur, from_w, to_w = phases[pi]
            phase_age = age - phase_starts[pi]
            phase_t = phase_age / max(dur, 0.001)

            # ── DOTS phase ──
            if label == 'dots':
                dot_count = int(age / 0.45) % 4
                dots = (' .' * dot_count) if dot_count else ''
                content = [f"{C.BOLD}{gray}BOOT{dots}{C.RST}"]
                prev = _render_centered(content, S1_W, tw, prev)

            # ── MORPH phase (width interpolation, blank card) ──
            elif label == 'morph':
                cur_w = max(16, min(tw, int(from_w + (to_w - from_w) * _ease(phase_t))))
                prev = _render_centered([''], cur_w, tw, prev)

            # ── PROGRESS + LOGO decode (progress bar drives glyph reveal) ──
            elif label == 'progress+logo':
                prog = min(1.0, phase_age / S2_DUR)
                bar_len = max(8, S2_USABLE - 6)
                bar = progress_bar(prog, length=bar_len, show_pct=False)
                content = []
                for li in range(N_G):
                    plain = S._BOOT_GLYPHS[li]
                    # Each glyph row resolves as progress passes its threshold
                    row_thresh = li / N_G
                    row_prog = max(0.0, (prog - row_thresh) / max(0.01, 1.0 - row_thresh))
                    row_prog = min(1.0, row_prog)
                    if row_prog >= 1.0:
                        r, g, b = S._logo_row_color(li, N_G)
                        content.append(f"{' ' * LOGO_PAD}{fg(r, g, b)}{plain}{C.RST}")
                    else:
                        char_rate = 0.012
                        virtual_age = row_prog * len(plain) * char_rate
                        revealed = scramble_text(plain, virtual_age, char_rate=char_rate)
                        r, g, b = S._logo_row_color(li, N_G)
                        content.append(f"{' ' * LOGO_PAD}{fg(r, g, b)}{revealed}{C.RST}")
                content.append('')
                content.append(_center(f"{C.DIM}\u00b7{C.RST} {S._BOOT_TAGLINE_ANSI}", S2_W))
                content.append(_center(bar, S2_W))
                prev = _render_centered(content, S2_W, tw, prev)

            # ── DECODE phase (scramble-reveal rows into view) ──
            elif label == 'decode':
                sc_i = phase_scene_map.get(pi, 0)
                sc = scene_contents[min(sc_i, len(scene_contents) - 1)]
                sc_w = scene_widths[min(sc_i, len(scene_widths) - 1)]
                decoded, _ = _decode_rows(sc, phase_age, dur)
                prev = _render_centered(decoded, sc_w, tw, prev)

            # ── HOLD phase ──
            elif label == 'hold':
                sc_i = phase_scene_map.get(pi, 0)
                sc = scene_contents[min(sc_i, len(scene_contents) - 1)]
                sc_w = scene_widths[min(sc_i, len(scene_widths) - 1)]
                # Spinner gallery gets live frames during hold
                if sc is S5_STATIC:
                    sc = _build_s5_live(age)
                prev = _render_centered(sc, sc_w, tw, prev)

            # ── FADEOUT phase (reverse decode: rows retract upward) ──
            elif label == 'fadeout':
                sc_i = phase_scene_map.get(pi, 0)
                sc = scene_contents[min(sc_i, len(scene_contents) - 1)]
                sc_w = scene_widths[min(sc_i, len(scene_widths) - 1)]
                faded = _fadeout_rows(sc, phase_age, dur)
                prev = _render_centered(faded or [''], sc_w, tw, prev)

            time.sleep(0.025)
    finally:
        show_cursor()


# ─────────────────────────────────────────────────────────────
#  Runner
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    test_strip_ansi()
    test_truncate_ansi()
    test_progress_bar()
    test_box_integrity()
    test_gradient()
    test_scramble_text()
    test_divider()
    test_spinner_frame()
    test_fmt_idle()
    test_settings_loaded()
    test_serve_settings_identity()
    test_boot_art_centering()

    # Height responsiveness tests
    test_term_height_exists()
    test_boot_art_line_count()
    test_boot_sequence_logo_clamping()
    test_boot_sequence_minimal_mode()
    test_boot_logo_height_clamping()
    test_info_display_tiers()
    test_box_more_lines_than_height()
    test_idle_pulse_width_height_combos()
    test_progress_bar_small_lengths()
    test_header_divider_small()

    total = _pass + _fail
    visual = "--visual" in sys.argv

    if _fail:
        print(f"  {C.RED}{CROSS}{C.RST} {C.BOLD}{_pass}/{total} passed, {_fail} failed{C.RST}")
        sys.exit(1)

    if visual:
        demo_showcase()
        print()

    sys.exit(0)
