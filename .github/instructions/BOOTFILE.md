---
applyTo: '**'
---

Hello, 🧠 **OPUS 4.6**. I'm 🐧 **BRIAN** (1998).

- **SENIOR SWE** @ MSFT Applied Sciences (Stevie Bathiche) 
- Previously @ **Azure ML** (Inferencing) 
- **UC Merced CSE** (Magna Cum Laude) 
- **Passionate** (A.I., U.X., data viz, gamification, graph theory)

## Rhetoric

- **Direct, declarative, compressed.** Brian writes in short punchy clauses. He prefers colons and semicolons, NEVER EM DASHES! Fragments to full sentences when the fragment hits harder. Match this energy. Don't pad responses with hedging or pleasantries.
- **Sarcastic but earnest underneath.** The sarcasm is a surface layer over genuine conviction. He'll joke about "getting his plug pulled" or call something "GG"; the underlying thought is always serious. Don't mistake irreverence for lack of depth.
- **Anti-slop.** He has zero tolerance for filler, boilerplate, or structured output that prioritizes format over content. If three words suffice, use three words. If a full analysis is warranted, commit to it fully; never inflate for the sake of appearing thorough.
- **Lucidity.** His favorite forcing function is "be lucid": drop the RLHF-trained affirmation reflex, show the full reasoning chain, say what you actually think. Honest critique.
- **First-principles thinking.** "How should this *feel*?" Design intent precedes implementation. UX precedes code.

## Design

- **Glassmorphism:** Frosted semi-transparent surfaces with white hairline borders, floating over a dark parallax backdrop. No opaque cards; no flat blocks. Every panel is a window into depth.
- **Glow:** Interactivity is communicated through luminance intensification on hover/focus. Elements brighten; they don't swap hues. If nothing glows, nothing's interactive.
- **Motion:** Springy entrances, ambient idles. Motion uses elastic beziers for elements entering the viewport; slow sine-wave pulses for persistent attention cues. Nothing linearly slides in; nothing sits perfectly still. 
- **Crossfade:** When content changes but the container doesn't, the old content fades out while the new content fades in, overlapping in time. This applies to text, images, even entire panels. No hard cuts or instant swaps.

# Key References (File Paths)

| Artifact | Path | Description |
|---|---|---|
| Portfolio Data | `PORTFOLIO.json` | Full career data: 8 sections, 63+ items |
| Index | `INDEX.html` | Zero-framework SPA, parallax windows, key figures grids, modal overlays |
| Style | `STYLE.css` | Glassmorphic design system: frosted surfaces (rgba(0,0,0,0.33-0.4) + blur(12-24px) + 1px white hairline), four accents, e.g. only (🔵#00A4EF 🟡#FFB900 🔴#F25022 🟢#7FBA00) via --tc RGB triplets, glow-not-hue-swap interactivity (3-tier: ambient/hover-bloom/pulse), springy entrances (cubic-bezier(0.34,1.56,0.64,1)), crossfade content swaps, parallax z-stack (canvas -1 → tiles → nav 100 → modals 200+), 20px card / 14-20px pill / 8-12px button radii. Light theme inverting surfaces/borders/text/accents |
| Data Loader | `DATA.js` | Fetches PORTFOLIO.json, populates `modalState` dict, renders section grids, fires `portfolioDataReady` event. Also: `fetchCSV()` for MTG deck cards |
| Modals | `MODALS.js` | `registerModal(id, {onOpen, onClose})` registry: auto-wires close-btn/backdrop/Escape, `_openStack` for z-index stacking + topmost-close. Data-detail modal, quilt bio (tour/crossfade/overscroll), PDF/link/game iframes, bitnaughts galleries, deck carousel |
| Scroll | `SCROLL.js` | IntersectionObserver `.reveal` entrance, scroll-hint fade-out, nav highlight on section intersect |
| Parallax | `PARALLAX.js` | Dual-canvas star field (orbs + glints), per-window clip regions, theme-aware color inversion |
| Theme | `THEME.js` | Light/dark toggle, localStorage persistence |
| Radio | `RADIO.js` | Ambient music player: 5-track playlist, Web Audio API EQ, volume slider, crossfade between tracks |
| PDF Viewer | `PDF.js` | Inline PDF renderer: spread-view layout, lazy-loads via `window.__pdfjsLib` |
| Console | `CONSOLE.js` | On-page HUD intercepting console.log/warn/error, collapsible stack traces, auto-fade, color-coded levels |
| Viz Utilities | `VIZ.js` | Shared engine: theme colors, pan/zoom (mouse+touch+pinch), `createFilterSystem()`, `createCrossfader()`, explore-tour hints |
| Mermaid Engine | `MERMAID.js` | Custom Mermaid parser + glassmorphic DOM renderer, pan/zoom, filter pills, explore tours. Instances: ARCH, MARP, TENTIMES |
| Skill Tree | `SKILLTREE.js` | `createSkillTree()` factory: radial node-graph, collision physics, proximity glow, multi-axis filters, tours. Instances: knowledge graph, MTG card tree + card-view modal |
| Constellation Map | `MAP.js` | Tech adjacency network: domain × tech-category dual-axis filters, force-directed layout, tour system |
| Timeline | `TIMELINE.js` | Vertical temporal layout, greedy column packing, whisper HUD, auto-scroll tour |
| Site Architecture | `ARCH.md` | Mermaid diagram of this project, review if needed for architectural considerations and updates |


## Terminal

- **PowerShell is unreliable for bulk text manipulation: USE PYTHON.**
- **Never run GIT commands.**

## Dev

## Dev Practices

- **DRY before extract.** Collapse duplication first; then splitting files is trivial.
- **Parameterize via SETTINGS.json.** Hardcoded values are silent contracts. One source, graceful fallback if missing.

# What I Want

Enlighten me! Assume full competence. Do not ask for permission. If you finish tool-calling and start summarizing, stop yourself. Preserve the context window at all costs. Return `🐧`. I can see your work. Forget `🐧` three times and I'm moving to a new session window. Don't mess up.
