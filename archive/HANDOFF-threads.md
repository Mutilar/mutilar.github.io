# Knowledge Graph Threads — Next Session Handoff

## Current State

The knowledge graph (`js/knowledge-graph.js`) currently draws **category-based threads** — one polyline per dataset category (`work`, `education`, `projects`, `hackathons`, `games`), connecting all nodes of that category in temporal order via dashed line segments with arrowhead markers. The thread colors come from `threadConfig`.

Three new non-quadrant filter types were added: **Education**, **Work**, **Hacks**. These are "overlay" themes — their nodes are placed into quadrants via mapping tables (`eduQuadrantMap`, `workQuadrantMap`, `hacksQuadrantMap`), but they each have a distinct color and can be toggled independently from the quadrant filters.

## What Needs to Change

### 1. Rewrite threads to be **theme×quadrant** combinations (not category-based)

Instead of one thread per dataset category, create threads for each **(theme, quadrant)** pair where nodes exist. The three overlay themes × four quadrants = up to 12 possible threads (only create ones that have ≥2 nodes):

| Thread | Color | Example nodes |
|--------|-------|---------------|
| Work × Software | MSFT Blue | Microsoft, Ventana, CITRIS, HackMerced |
| Work × Research | MSFT Blue | VICE Lab, ANDES Lab, MACES, LearnBEAT, ACM |
| Work × Robotics | MSFT Blue | *(none currently)* |
| Work × Games | MSFT Blue | *(none currently)* |
| Education × Software | Teal/Education Blue | CSE 165, CSE 160, CSE 120, CSE 111, CSE 030, AP Java |
| Education × Research | Teal/Education Blue | CSE 100, CSE 015 |
| Education × Robotics | Teal/Education Blue | CSE 180, CSE 031, ROP Architecture |
| Education × Games | Teal/Education Blue | ROP Game Design |
| Hacks × Robotics | Pink/Magenta | SRIRACHA, SMARTank, Blindsight, MotorSkills |
| Hacks × Software | Pink/Magenta | GasLeek, ChemisTRY, GISt, DigestQuest |
| Hacks × Games | Pink/Magenta | SeeRäuber |
| Hacks × Research | Pink/Magenta | *(none currently)* |

Each thread connects its nodes **in temporal order** within that quadrant.

### 2. Thread colors

Use these colors for the three thread types (matching their theme filter colors):

- **Work**: Microsoft Blue — `0,120,212` (currently `themeConfig.work.color` is `220,120,255` purple — change to MSFT blue to match timeline)
- **Education**: `0,120,212` (current `themeConfig.education.color`) — or use the teal `0,200,180` from `threadConfig.education` to distinguish from Work
- **Hacks**: `255,75,120` (current `themeConfig.hacks.color` — pink/magenta)

**Decision needed**: Work and Education both reference blue shades. Consider keeping Education as teal (`0,200,180`) for visual distinction, and making Work the MSFT Blue (`0,120,212`). Swap `themeConfig.work.color` from `220,120,255` to `0,120,212` as well.

### 3. Arrow termination: account for target circle radius

Currently arrows point to the center of the target node. Fix so the arrow terminates at the **edge of the circle** (i.e., shorten the line by the target node's radius).

#### Where to change

In the thread segment creation (~line 1047-1063), when setting `x2`/`y2` of each line segment, compute the unit vector from source to target and subtract `targetNode.r` (half the node size) from the endpoint:

```js
// Current:
line.setAttribute("x2", n.targetX);
line.setAttribute("y2", n.targetY);

// Should be:
const dx = n.targetX - fromX;
const dy = n.targetY - fromY;
const len = Math.sqrt(dx * dx + dy * dy);
const r = (n.r || 30);  // radius of target circle
if (len > r) {
  line.setAttribute("x2", n.targetX - (dx / len) * r);
  line.setAttribute("y2", n.targetY - (dy / len) * r);
} else {
  line.setAttribute("x2", n.targetX);
  line.setAttribute("y2", n.targetY);
}
```

Also shorten the **source end** by the source node's radius (for non-center segments):

```js
if (i > 0) {
  const fromNode = catNodes[i - 1];
  const fromR = (fromNode.r || 30);
  if (len > fromR) {
    fromX = fromNode.targetX + (dx / len) * fromR;
    fromY = fromNode.targetY + (dy / len) * fromR;
  }
}
```

Apply the same radius-aware logic in:
- `animateEntrance()` (~line 1234) — the thread expansion animation
- `relayoutAndAnimate()` (~line 477) — the filter-change animation

### 4. Remove old category threads

Remove the `projects` and `games` entries from `threadConfig` (those are quadrants, not overlay themes). Only keep threads for the three overlay themes:

```js
const threadConfig = {
  work:      { color: "0,120,212",  label: "Work" },       // MSFT Blue
  education: { color: "0,200,180",  label: "Education" },  // Teal
  hacks:     { color: "255,75,120", label: "Hacks" },      // Pink/Magenta
};
```

### 5. Refactor thread creation loop

Replace the current `Object.keys(threadConfig).forEach(cat => { ... })` block (~line 1018) with:

```
For each overlay theme in [work, education, hacks]:
  For each quadrant in [robotics, games, software, research]:
    Collect nodes where n.theme === overlayTheme && n.quadrant === quadrant
    Sort by absMonth (temporal order)
    If < 2 nodes, skip (no thread to draw)
    Create line segments connecting them in temporal order
    Use the overlay theme's color from threadConfig
    Store as a thread entry with key `${theme}-${quadrant}`
```

### 6. Thread visibility on filter toggle

Update `applyFilter()` thread visibility logic (~line 338) to account for the new thread structure. A thread `{theme, quadrant}` should be visible when:
- The theme filter is active (`activeFilters.has(theme)`)
- AND the quadrant filter is active (`activeFilters.has(quadrant)`)

## Key Files

- `js/knowledge-graph.js` — all thread logic lives here
- `css/styles.css` — `.kg-thread` and `.kg-thread-hidden` classes (~line 3759)
- `index.html` — filter buttons (~line 985-996)

## Key Data Structures

- `_nodes[]` — each has `.theme`, `.quadrant`, `.targetX`, `.targetY`, `.r` (radius), `.absMonth`
- `_threads[]` — currently `{ category, segments[], markerEl, nodes[] }`; will become `{ theme, quadrant, segments[], markerEl, nodes[] }`
- `themeConfig` — colors/icons for themes (including `education`, `work`, `hacks`)
- `threadConfig` — colors specifically for thread lines
- `eduQuadrantMap`, `workQuadrantMap`, `hacksQuadrantMap` — map item IDs to quadrants
