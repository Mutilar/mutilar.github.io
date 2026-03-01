# HANDOFF — Skill Tree "Traverse the Graph" Tour Animation

## Context

The portfolio site at `mutilar.github.io` has three interactive visualization modals:

| Modal | File | Has Tour Animation? |
|-------|------|-------------------|
| Architecture Diagram | `js/mermaid.js` | ✅ "Explore" glow sequence — walks through filter categories one at a time, fitting the camera to each subset |
| Timeline | `js/timeline.js` | ✅ Slow auto-scroll from top to bottom on hint click |
| **Knowledge Graph** | **`js/skill-tree.js`** | ❌ **MISSING — this is the task** |

The knowledge graph is a 2D pannable/zoomable circular-node canvas. It has **6 filter categories** split into two groups:

- **Quadrant filters** (directional — nodes radiate outward at 120° spacing):
  - `robotics` (North)
  - `games` (South-West)
  - `software` (South-East)

- **Overlay filters** (origin — thread color):
  - `education` (yellow threads)
  - `work` (blue threads)
  - `projects` (red threads)

The filter system uses `createFilterSystem()` from `js/viz.js` with custom `soloLogic` for the quadrant/overlay group behavior.

## Desired Animation Sequence

A "Traverse the Graph" button/hint (similar to mermaid's explore hint) should trigger a scripted walkthrough. The sequence builds the graph progressively, telling the story of the user's journey:

### Phase 1 — Software Quadrant (SE)
| Step | Delay | Active Filters | What appears |
|------|-------|---------------|-------------|
| 1 | 0s | `software` + `education` | CS courses fan out SE |
| 2 | +2s | `software` + `education` + `work` | Work items appear in SE (blue threads) |
| 3 | +2s | `software` + `education` + `work` + `projects` | Projects fill in SE (red threads) |

### Phase 2 — Add Robotics Quadrant (N)
| Step | Delay | Active Filters | What appears |
|------|-------|---------------|-------------|
| 4 | +2s | above + `robotics` + `education` | Robotics education nodes appear N |
| 5 | +2s | above + `robotics` + `work` | Robotics work items appear N |
| 6 | +2s | above + `robotics` + `projects` | Robotics projects fill in N |

### Phase 3 — Add Games Quadrant (SW)
| Step | Delay | Active Filters | What appears |
|------|-------|---------------|-------------|
| 7 | +2s | above + `games` + `education` | Games education nodes appear SW |
| 8 | +2s | above + `games` + `work` | Games work items appear SW |
| 9 | +2s | above + `games` + `projects` | Full graph — everything visible |

At step 9 all 6 filters are active = full graph.

### Camera Behavior

At **each step**, after updating filters:
1. Compute the bounding box of all **visible** (non-hidden) nodes
2. Smoothly animate `_transform` (x, y, scale) to fit that bounding box centered in the viewport with padding
3. Use a spring/slerp easing (match the feel of mermaid's `fitView()` — smooth ~500ms transition)

**Reference implementation:** In `mermaid.js`, the explore tour's `fitView()` function (search for `fitView` around line ~1280) computes target x/y/scale from node bounding boxes and animates via `state._update()`. The skill-tree needs an equivalent that:
- Iterates `_nodes.filter(n => !n._hidden)` to get world-space `targetX`/`targetY` bounds
- Computes scale to fit those bounds in the viewport (with ~20% padding)
- Clamps scale to `[_KG_MIN_SCALE, _KG_MAX_SCALE]`
- Animates `_transform` smoothly (CSS transition or JS spring) then calls `updateTransform()`

## Key Architecture Notes

### Filter System
The filter system lives in `viz.js` (`createFilterSystem()`), but the **actual filter application** is the local `applyFilter()` function in `skill-tree.js`. The tour needs to:
1. Directly mutate `activeFilters` (the `Set`)
2. Call `_filterSys.syncUI()` to update button visuals
3. Call `applyFilter()` to show/hide nodes and relayout

The tricky part: `applyFilter()` calls `relayoutAndAnimate()` which spring-animates nodes to new positions. The camera fit should happen **after** the relayout animation settles (~600ms based on `totalAnimTime`).

### Pan/Zoom System
Pan/zoom is handled by shared `initPanZoom()` from `viz.js`. The skill-tree stores its handle in `_pz`. To animate the camera:
- Set `_transform.x`, `_transform.y`, `_transform.scale` to target values
- Set `_graphWorld.style.transition = "transform 500ms cubic-bezier(0.25, 1, 0.5, 1)"`
- Call `_pz.update()` (or `updateTransform()`)
- Clear transition after animation completes

### Existing Code References
- `_nodes` array — each node has `targetX`, `targetY`, `_hidden` flag, `el` (DOM)
- `_transform = { x, y, scale }` — mutable state object
- `_graphWorld` — the CSS-transformed container
- `graphModal.querySelector(".kg-viewport")` — the viewport for clientWidth/clientHeight
- `updateTransform()` — applies transform + triggers `updateProximityGlow()`
- `bounceBackIfNeeded()` — clamps pan to bounds
- `animateEntrance()` — existing entrance animation (nodes expand from center)
- `relayoutAndAnimate()` — repositions visible nodes with spring physics

### UI Trigger
The mermaid viewer has a `.mm-explore-hint` button that starts its tour. The skill-tree should have an equivalent — perhaps a `.kg-explore-hint` element. Check `index.html` for the knowledge modal markup and `styles.css` for existing `.mm-explore-hint` styles to mirror.

### Files to Modify
1. **`js/skill-tree.js`** — Add `fitVisibleNodes()` camera function + tour sequence logic
2. **`index.html`** — Add tour trigger button to knowledge modal markup
3. **`css/styles.css`** — Style the tour trigger (can likely reuse `.mm-explore-hint` patterns)
4. **`architecture.md`** — No changes needed (viz.js edges already shown)

## Testing Checklist
- [ ] Tour plays through all 9 steps with correct filter states
- [ ] Camera smoothly fits to visible nodes at each step
- [ ] Tour can be interrupted (clicking a filter button or closing modal stops it)
- [ ] After tour completes, all filters are active (full graph)
- [ ] Filter buttons visually sync at each step (via `_filterSys.syncUI()`)
- [ ] `updateProximityGlow()` fires correctly during/after camera moves
- [ ] Tour button disappears during tour, reappears when done (or toggles to "Stop")
- [ ] Node entrance animations (`animateEntrance`) don't conflict with tour
- [ ] Touch/mobile: tour still works (no pointer-specific assumptions)
