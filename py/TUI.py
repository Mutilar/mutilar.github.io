"""
╔═══════════════════════════════════════════════════════════╗
║  TUI.py — Shared terminal UI primitives                  ║
║  Constants, colors, gradients, box drawing, animations   ║
╚═══════════════════════════════════════════════════════════╝
Zero dependencies beyond the Python standard library.
"""
import sys, os, shutil, re, json

# ─────────────────────────────────────────────────────────────
#  Windows console: enable ANSI VT100 + UTF-8
# ─────────────────────────────────────────────────────────────

def enable_win_ansi():
    """Enable ANSI escape sequences and UTF-8 on Windows consoles."""
    if sys.platform != "win32":
        return
    if sys.stdout.encoding != 'utf-8':
        sys.stdout.reconfigure(encoding='utf-8')
    if sys.stderr.encoding != 'utf-8':
        sys.stderr.reconfigure(encoding='utf-8')
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetStdHandle(-11)
        mode = ctypes.c_ulong()
        kernel32.GetConsoleMode(handle, ctypes.byref(mode))
        kernel32.SetConsoleMode(handle, mode.value | 0x0004)
    except Exception:
        pass

enable_win_ansi()

# ─────────────────────────────────────────────────────────────
#  ANSI colors
# ─────────────────────────────────────────────────────────────

class C:
    RST   = '\033[0m'
    BOLD  = '\033[1m'
    DIM   = '\033[2m'
    CYAN  = '\033[36m'
    GREEN = '\033[32m'
    YLOW  = '\033[33m'
    RED   = '\033[31m'
    MAG   = '\033[35m'
    BWHT  = '\033[97m'
    BCYN  = '\033[96m'
    BGRN  = '\033[92m'
    BYLW  = '\033[93m'
    BMAG  = '\033[95m'

def fg(r, g, b):
    """ANSI 24-bit foreground escape."""
    return f'\033[38;2;{r};{g};{b}m'

# ─────────────────────────────────────────────────────────────
#  Box drawing characters
# ─────────────────────────────────────────────────────────────

BOX_H   = '─';  BOX_V   = '│'
BOX_TL  = '┌';  BOX_TR  = '┐'
BOX_BL  = '└';  BOX_BR  = '┘'
BOX_TEE_R = '├'; BOX_TEE_L = '┤'
BOX_DBL_H  = '═'; BOX_DBL_V  = '║'
BOX_DBL_TL = '╔'; BOX_DBL_TR = '╗'
BOX_DBL_BL = '╚'; BOX_DBL_BR = '╝'

# ─────────────────────────────────────────────────────────────
#  Block elements
# ─────────────────────────────────────────────────────────────

BLOCK_FULL   = '█'; BLOCK_LIGHT  = '░'
BLOCK_MEDIUM = '▒'; BLOCK_DARK   = '▓'
BLOCK_EIGHTHS = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█']

# ─────────────────────────────────────────────────────────────
#  Geometric shapes
# ─────────────────────────────────────────────────────────────

DIAMOND_EMPTY  = '◇'; DIAMOND_FILLED = '◆'; DIAMOND_DOT = '◈'
CIRCLE_EMPTY   = '○'; CIRCLE_FILLED  = '●'; CIRCLE_DOT  = '◉'

# ─────────────────────────────────────────────────────────────
#  Status indicators & arrows
# ─────────────────────────────────────────────────────────────

CHECK  = '✓'; CROSS = '✗'; WARN = '⚠'; INFO = 'ⓘ'
ARROW_R = '→'; ARROW_L = '←'; ARROW_U = '↑'; ARROW_D = '↓'

# ─────────────────────────────────────────────────────────────
#  Spinner frames
# ─────────────────────────────────────────────────────────────

BRAILLE_SPIN  = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']
BLOCK_SPIN    = ['▖','▘','▝','▗']
PULSE_BOX     = ['·','▪','■','▪']
PULSE_DIAMOND = ['·','◇','◈','◆','◈','◇']
PULSE_CIRCLE  = ['·','○','◉','●','◉','○']
RADAR_SWEEP   = ['◜','◝','◞','◟']

# ─────────────────────────────────────────────────────────────
#  Scramble charset
# ─────────────────────────────────────────────────────────────

SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*<>░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬"

# ─────────────────────────────────────────────────────────────
#  SETTINGS.json loader
# ─────────────────────────────────────────────────────────────

SETTINGS = {}

def _parse_rgb(csv_str):
    """Parse "r, g, b" CSS triplet string → (r, g, b) tuple."""
    parts = [int(x.strip()) for x in csv_str.split(',')]
    return tuple(parts[:3])

def load_settings(path=None):
    """Load SETTINGS.json, populate SETTINGS dict and MSFT_GRADIENT.
    Falls back to hardcoded defaults if file is missing or malformed."""
    global SETTINGS, MSFT_GRADIENT
    if path is None:
        # py/ lives one level below repo root; SETTINGS.json is at json/
        _script_dir = os.path.dirname(os.path.abspath(__file__))
        path = os.path.join(os.path.dirname(_script_dir), 'json', 'SETTINGS.json')
    try:
        with open(path, 'r', encoding='utf-8') as f:
            SETTINGS = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        SETTINGS = {}
        return
    # Parse accents → gradient
    # Accents are a positional array: [rgb1, rgb2, rgb3, rgb4]
    acc = SETTINGS.get('accents', [])
    if isinstance(acc, list) and len(acc) >= 2:
        try:
            MSFT_GRADIENT = [_parse_rgb(a) for a in acc[:4]]
        except (ValueError, TypeError):
            pass  # keep hardcoded fallback

# ─────────────────────────────────────────────────────────────
#  MSFT brand gradient  (default; overwritten by load_settings)
# ─────────────────────────────────────────────────────────────

MSFT_GRADIENT = [
    (0, 164, 239),    # 🔵 Blue
    (127, 186, 0),    # 🟢 Green
    (255, 185, 0),    # 🟡 Yellow
    (242, 80, 34),    # 🔴 Red
]

# Auto-load on import (sibling SETTINGS.json)
load_settings()

# ─────────────────────────────────────────────────────────────
#  Emoji sanitization (for terminal-safe rendering)
# ─────────────────────────────────────────────────────────────

# Skin tone modifiers (🏻🏼🏽🏾🏿), variation selectors, ZWJ
_EMOJI_JUNK_RE = re.compile(
    '['
    '\U0001F3FB-\U0001F3FF'  # skin tone modifiers
    '\uFE0E\uFE0F'           # variation selectors
    '\u200D'                  # zero-width joiner
    ']'
)

def sanitize_emoji(text):
    """Strip skin tone modifiers, variation selectors, and ZWJ from text.
    Keeps base emoji intact for terminal-safe rendering."""
    return _EMOJI_JUNK_RE.sub('', text)

_HTML_TAG_RE = re.compile(r'<[^>]+>')

def strip_html(text):
    """Strip HTML tags for terminal-safe rendering."""
    return _HTML_TAG_RE.sub('', text) if text else text

def identity_name():
    """Return identity.name stripped of HTML for terminal use."""
    raw = SETTINGS.get('identity', {}).get('name', '')
    return strip_html(raw)

# ─────────────────────────────────────────────────────────────
#  ANSI string utilities
# ─────────────────────────────────────────────────────────────

_ANSI_RE = re.compile(r'\033\[[0-9;]*m')

def strip_ansi(text):
    """Strip all ANSI escape sequences (including 24-bit color)."""
    return _ANSI_RE.sub('', text)

def truncate_ansi(text, max_vis, ellipsis='…'):
    """Truncate an ANSI-colored string to max_vis visible characters.
    If truncated, appends ellipsis (counts toward max_vis)."""
    if max_vis <= 0:
        return ''
    out = []
    seen = 0
    i = 0
    ell_len = len(ellipsis)
    while i < len(text):
        if text[i] == '\033':
            j = i + 1
            while j < len(text) and text[j] != 'm':
                j += 1
            out.append(text[i:j+1])
            i = j + 1
        else:
            if seen >= max_vis - ell_len and seen < max_vis:
                remaining_vis = len(strip_ansi(text[i:]))
                if remaining_vis > max_vis - seen:
                    out.append(C.DIM + ellipsis + C.RST)
                    seen = max_vis
                    break
            if seen >= max_vis:
                break
            out.append(text[i])
            seen += 1
            i += 1
    return ''.join(out)

# ─────────────────────────────────────────────────────────────
#  Gradient interpolation
# ─────────────────────────────────────────────────────────────

def lerp_gradient(stops, t):
    """Interpolate an RGB gradient at position t ∈ [0,1].
    stops: list of (r,g,b) tuples. Returns (r,g,b)."""
    t = max(0.0, min(1.0, t))
    seg = t * (len(stops) - 1)
    i = min(int(seg), len(stops) - 2)
    f = seg - i
    a, b = stops[i], stops[i + 1]
    return (
        int(a[0] + (b[0] - a[0]) * f),
        int(a[1] + (b[1] - a[1]) * f),
        int(a[2] + (b[2] - a[2]) * f),
    )

def gradient_rgb(t):
    """Interpolate MSFT_GRADIENT at position t ∈ [0,1]. Returns (r,g,b)."""
    return lerp_gradient(MSFT_GRADIENT, t)

# ─────────────────────────────────────────────────────────────
#  Terminal primitives
# ─────────────────────────────────────────────────────────────

def term_width():
    return shutil.get_terminal_size((60, 24)).columns

def term_height():
    return shutil.get_terminal_size((60, 24)).lines

def hide_cursor():
    sys.stdout.write('\033[?25l'); sys.stdout.flush()

def show_cursor():
    sys.stdout.write('\033[?25h'); sys.stdout.flush()

def clear_line():
    w = term_width()
    sys.stdout.write(f'\r{" " * (w - 1)}\r'); sys.stdout.flush()

def clear_screen():
    """Clear entire screen and move cursor home."""
    sys.stdout.write('\033[2J\033[H'); sys.stdout.flush()

def enter_alt_screen():
    """Switch to alternate screen buffer (preserves main scrollback)."""
    sys.stdout.write('\033[?1049h'); sys.stdout.flush()

def leave_alt_screen():
    """Return to main screen buffer."""
    sys.stdout.write('\033[?1049l'); sys.stdout.flush()

# ─────────────────────────────────────────────────────────────
#  Text effects
# ─────────────────────────────────────────────────────────────

def scramble_text(target, age, char_rate=0.02, scramble_rate=0.05):
    """Scramble-reveal: characters resolve left-to-right over time."""
    length = len(target)
    resolved = int(age / char_rate)
    if resolved >= length:
        return target
    result = list(target[:resolved])
    step_t = int(age / scramble_rate)
    for i in range(resolved, length):
        if target[i] in (' ', '\n', '\t'):
            result.append(target[i])
        else:
            idx = (i + step_t * 13 + ord(target[i]) * 7) % len(SCRAMBLE_CHARS)
            result.append(SCRAMBLE_CHARS[abs(idx)])
    return ''.join(result)

# ─────────────────────────────────────────────────────────────
#  Composite widgets
# ─────────────────────────────────────────────────────────────

def progress_bar(progress, length=20, show_pct=True):
    """Smooth sub-character precision using Unicode eighths.
    Filled portion is colored along the MSFT brand gradient."""
    progress = max(0.0, min(1.0, progress))
    filled_exact = progress * length
    filled_full = int(filled_exact)
    frac = filled_exact - filled_full
    eighth = int(frac * 8)
    bar = []
    for i in range(length):
        t = i / max(length - 1, 1)
        r, g, b = gradient_rgb(t)
        color = fg(r, g, b)
        if i < filled_full:
            bar.append(f"{color}{BLOCK_FULL}")
        elif i == filled_full and eighth > 0:
            bar.append(f"{color}{BLOCK_EIGHTHS[eighth]}")
        else:
            bar.append(f"{C.DIM}{BLOCK_LIGHT}")
    s = ''.join(bar)
    if show_pct:
        return f"{C.DIM}[{C.RST}{s}{C.RST}{C.DIM}]{C.RST} {int(progress*100):3d}%"
    return f"{C.DIM}[{C.RST}{s}{C.RST}{C.DIM}]{C.RST}"

def spinner_frame(age, frames=BRAILLE_SPIN, speed=0.08):
    return frames[int(age / speed) % len(frames)]

def divider(length=None, left=BOX_TEE_R, mid=BOX_H, right=BOX_TEE_L):
    length = length or term_width()
    if length <= 2:
        return mid * length
    return f"{C.DIM}{left}{mid * (length - 2)}{right}{C.RST}"

def header_line(text, width=None, corner=DIAMOND_FILLED):
    width = width or term_width()
    pad = max(0, (width - len(text) - 4) // 2)
    lp = BOX_H * pad
    rp = BOX_H * (width - len(text) - 4 - pad)
    return f"{C.BCYN}{corner}{lp}{C.RST} {C.BOLD}{C.BWHT}{text}{C.RST} {C.BCYN}{rp}{corner}{C.RST}"

def box(lines, width=None, color=C.BCYN):
    """Draw a box with MSFT gradient border sweeping around the perimeter."""
    width = width or term_width()
    inner = width - 2
    n_lines = len(lines)
    perim = inner + n_lines + inner + n_lines
    _loop_grad = MSFT_GRADIENT + [MSFT_GRADIENT[0]]

    def _border_char(idx, ch):
        r, g, b = lerp_gradient(_loop_grad, idx / max(perim, 1))
        return f"{fg(r, g, b)}{ch}{C.RST}"

    top = ''.join(_border_char(i, BOX_DBL_H) for i in range(inner))
    out = [f"{_border_char(0, BOX_DBL_TL)}{top}{_border_char(inner - 1, BOX_DBL_TR)}"]

    usable = max(0, inner - 2)
    for row_i, ln in enumerate(lines):
        vis = len(strip_ansi(ln))
        if vis > usable:
            ln = truncate_ansi(ln, usable)
            vis = len(strip_ansi(ln))
        rpad = max(0, inner - vis - 1)
        right_idx = inner + row_i
        left_idx = perim - 1 - row_i
        left_v = _border_char(left_idx, BOX_DBL_V)
        right_v = _border_char(right_idx, BOX_DBL_V)
        out.append(f"{left_v} {ln}{' ' * rpad}{right_v}")

    bot_start = inner + n_lines
    bot = ''.join(_border_char(bot_start + (inner - 1 - j), BOX_DBL_H) for j in range(inner))
    out.append(f"{_border_char(bot_start + inner - 1, BOX_DBL_BL)}{bot}{_border_char(bot_start, BOX_DBL_BR)}")

    return '\n'.join(out)

def fmt_idle(seconds):
    """Human-readable idle duration."""
    if seconds < 60:
        return f"{int(seconds)}s"
    m, s = divmod(int(seconds), 60)
    if m < 60:
        return f"{m}m {s:02d}s"
    h, m = divmod(m, 60)
    return f"{h}h {m:02d}m"
