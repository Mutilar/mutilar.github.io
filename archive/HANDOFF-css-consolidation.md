# 🎨 HANDOFF — CSS Consolidation Review

## Context

The site has three visualization modals that evolved independently but now share nearly identical styling under different class prefixes:

| Prefix | Modal | Owner JS |
|---|---|---|
| `.mm-*` | Mermaid diagram viewer (Architecture, MARP) | `mermaid-view.js` |
| `.kg-*` | Knowledge Graph / Skill Tree | `skill-tree.js` |
| `.timeline-*` | Timeline swimlane | `timeline.js` |

Shared utilities already live in `viz.js` (`VIZ_THEMES`, `initPanZoom`, `createFilterSystem`, `animateCameraFit`, `createLayoutToggle`, `createCrossfader`). The CSS was never unified.

---

## 1 · FILTER BUTTONS — ~100 lines

`.mm-filter`, `.kg-filter`, `.timeline-filter` are near-identical across **base · :hover · .active · .active:hover · light-mode** states.

| State | Lines (mm / kg / tl) | Diff |
|---|---|---|
| Base | 3346 / 4487 / 4038 | mm slightly smaller (`11px`, `5px 12px`) + adds `appearance:none`, `outline:none`, `white-space:nowrap`. kg & tl identical. |
| `:hover` | 3369 / 4505 / 4056 | **Identical.** |
| `.active` | 3377 / 4513 / 4064 | mm has 2-layer shadow; kg & tl have richer 5-layer. Decide which to keep. |
| `.active:hover` | 3386 / 4524 / 4075 | **Identical.** |
| Light base | 3415 / 4796 / 2978 | mm uses `245,245,245, 0.8`; others `240,240,245, 0.75`. |
| Light `.active` | 3427 / 4808 / 2992 | mm simpler shadow; kg & tl match with `--tc-light` fallback. |

**Proposal → `.viz-filter`** with shared base. Keep mm's `white-space: nowrap` and reset props on the shared class. Adopt the richer 5-layer active shadow everywhere.

---

## 2 · DOT INDICATORS — ~15 lines

`.mm-dot` (L3392) and `.timeline-dot` (L4100) are **byte-for-byte identical** (8px circle, inline-block, flex-shrink:0, transparent border). KG buttons already use `.timeline-dot`.

**Proposal → `.viz-dot`**. One class, three consumers.

---

## 3 · FILTER GROUP / ROW CONTAINERS — ~35 lines

| Class | Lines | Layout |
|---|---|---|
| `.mm-filter-group` | 3320 | flex column, centered |
| `.kg-filter-group` | 4469 | flex column, centered |
| `.timeline-filter-group` | 4028 | flex row, wrap, justify-center |
| `.mm-filter-row` | 3330 | flex-wrap, justify flex-end |
| `.kg-filter-row` | 4478 | flex-wrap, justify center |

mm & kg groups identical. Timeline intentionally row-based (flat bar, no nested row).

**Proposal → `.viz-filter-group`** (shared column base) + `.viz-filter-group--flat` modifier for timeline's row variant. **`.viz-filter-row`** for mm/kg inner row (tiny justify diff to reconcile).

---

## 4 · MODAL CARD SIZING — ~20 lines

`.mm-modal-card` (L3292) and `.kg-modal-card` (L4445) are **identical**: `max-width:960px`, `width/max-height:100%/90vh`, `overflow:hidden`, `flex column`, `padding:0!important`, `user-select:none`.

`.timeline-modal-card` (L4007) is intentionally different — scrollable, no fixed height.

**Proposal → `.viz-modal-card`** for mm & kg. Timeline keeps its own.

---

## 5 · VIEWPORT / WORLD — ~20 lines

`.mm-viewport` (L3459) and `.kg-viewport` (L4552) are near-identical (flex:1, overflow:hidden, relative, touch-action:none, user-select:none). mm adds `cursor:grab` and `border-radius:20px` in CSS; kg sets cursor inline.

`.mm-world` (L3535) and `.kg-world` (L4562) are near-identical (absolute, top/left 0, transform-origin 0 0). kg adds explicit `right:0; bottom:0`.

**Proposal → `.viz-viewport` + `.viz-world`**. Timeline has no viewport (scroll-based).

---

## 6 · STICKY BAR — ~30 lines

| Class | Lines | Position |
|---|---|---|
| `.mm-modal-card .modal-sticky-bar` | 3305 | `absolute` (floats over viewport) |
| `.kg-modal-card .modal-sticky-bar` | 4458 | *(missing — relies on flex)* |
| `.timeline-modal-card .modal-sticky-bar` | 4016 | `sticky` (scrolls with content) |

Padding nearly identical (`12px 16px 8px`), timeline uses wider `12px 40px 8px`.

**Proposal →** Keep scoped. The positional differences are intentional per-modal behavior.

---

## 7 · EXPLORE HINTS — ~30 lines

`.mm-explore-hint` (L3471) and `.kg-explore-hint` (L3501) are **identical** (CSS comment says "mirrors mm-explore-hint"). Both: `absolute`, `bottom:16px`, `left:50%; translateX(-50%)`, `z-index:20`, same animations (`bounce-y-hero` + `tl-glow-pulse`), same `.exploring` state. `.tl-scroll-hint` (L4127) is structurally parallel but uses `sticky`.

**Proposal → `.viz-explore-hint`** for mm & kg. Timeline keeps `.tl-scroll-hint`.

---

## 8 · GLOW KEYFRAMES — ~10 lines

`@keyframes mm-pill-glow` (L3453) and `@keyframes kg-pill-glow` (L4546) are **exact duplicates**. The corresponding `.mm-filter.mm-filter-glow` (L3435) and `.kg-filter.kg-filter-glow` (L4535) are also near-identical (kg plays animation `2` times vs mm's `1`).

**Proposal → `@keyframes viz-pill-glow`** + `.viz-filter-glow`.

---

## 9 · LAYOUT TOGGLE — Naming

`.kg-layout-toggle` (L4642) is already shared across all three modals (timeline and mermaid both use this class). The `kg-` prefix is misleading.

**Proposal → `.viz-layout-toggle`** (rename only, no property changes).

---

## 10 · MOBILE / RESPONSIVE — ~10 lines

KG (L4904) and timeline (L4423) have identical mobile filter resizing (`padding:5px 10px`, `font-size:11px`, `gap:4px`). MM has no matching rule.

**Proposal →** Write once under `.viz-filter` media query, extend to mm.

---

## 11 · JS CONSOLIDATION (Bonus)

| # | What | Detail |
|---|---|---|
| J1 | `buildFilters()` in `mermaid-view.js` | Re-implements ~80% of `createFilterSystem()` from `viz.js`. Extend `createFilterSystem` with `setOnly()`, `addFilter()`, `setAll()`, `setNone()` API methods, then refactor mermaid-view to use it. |
| J2 | Explore hint creation | `skill-tree.js` (L1517-1537) and `mermaid-view.js` (L1648-1662) create nearly identical DOM structures. Extract into `viz.js`. |
| J3 | Tour stop wiring | Both register `pointerdown`+`wheel` on viewport to cancel explore tours. Extract into shared utility. |

---

## Intentional Differences (Do NOT Consolidate)

- **Timeline modal card** — scrollable, not pan-zoom. Different by design.
- **Timeline sticky bar** — uses `position: sticky`, not `absolute`. Correct.
- **mm filter sizing** — slightly smaller (`11px`/`5px 12px`) for denser mermaid legends. May be intentional or may want to unify.
- **Timeline has no explore-glow** — uses scroll-hint + whisper HUD instead.

---

## Estimated Impact

| Area | Lines saved | Risk |
|---|---|---|
| CSS filter buttons | ~100 | Low — property-identical |
| CSS containers | ~35 | Low |
| CSS viewport/world | ~20 | Low |
| CSS modal card | ~20 | Low |
| CSS explore hints | ~30 | Low |
| CSS keyframes + glow | ~25 | Low |
| CSS responsive | ~10 | Low |
| CSS dot indicator | ~15 | Low |
| **Total CSS** | **~255 lines** | — |
| JS buildFilters | ~80 | Medium — mermaid adds API methods |
| JS explore hint | ~40 | Low |

Migration path: Add new `.viz-*` classes → update HTML class attributes → update JS `createElement`/`querySelector` calls → delete old prefixed rules → verify all three modals.
