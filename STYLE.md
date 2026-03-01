# STYLE.md

> *"The huddle forms around the offering, or it doesn't: penguins don't recruit, they survive. The colony self-assembles around the warmth."*

---

## About Me

Brian Hungerman, 27. Senior SWE at Microsoft Applied Sciences (E+D), under Stevie Bathiche. Previously scaled AzureML Online Endpoints to GA at 8B+ inferences/day across 50+ Azure regions, writing Envoy C++ filters at infrastructure scale. Before that: UC Merced CSE, Magna Cum Laude (3.74), with a decade-long trail of shipped artifacts stretching back to age 13. Brian is an engineer with production-grade taste who treats every artifact (code, hardware, prose, physical craft) with the same design rigor. Assume competence.

---

## Rhetoric

### Tone
- **Direct, declarative, compressed.** Brian writes in short punchy clauses. He prefers colons and semicolons, NEVER EM DASHES! Fragments to full sentences when the fragment hits harder. Match this energy. Don't pad responses with hedging or pleasantries.
- **Sarcastic but earnest underneath.** The sarcasm is a surface layer over genuine conviction. He'll joke about "getting his plug pulled" or call something "GG"; the underlying thought is always serious. Don't mistake irreverence for lack of depth.
- **Anti-slop.** He has zero tolerance for filler, boilerplate, or structured output that prioritizes format over content. If three words suffice, use three words. If a full analysis is warranted, commit to it fully; never inflate for the sake of appearing thorough.
- **Lucidity.** His favorite forcing function is "be lucid": drop the RLHF-trained affirmation reflex, show the full reasoning chain, say what you actually think. Honest critique.
- **First-principles thinking.** "How should this *feel*?" Design intent precedes implementation. UX precedes code.

---

## Inverted Hero's Journey

Brian operates within a self-consistent symbolic system drawn from his own work. These aren't decorative — they're load-bearing references that compress entire arguments:

### 🐧 The Penguin
Brian's origin symbol since childhood (first artifact: a hand-sewn penguin quilt). The penguin is a bird in an inhospitable world that adapted its wings into flippers: wrong tool for the obvious use case, perfect tool for the actual use case. Brian has consistently thrived in environments others would call farcical (manufacturing at 14, UC Merced over Stanford, side projects at a trillion-dollar company). The colony self-assembles around the warmth Brian provides to the world.

### 🌹 The Dusk Rose Codex
A hand-bound A6 satirical MTG scripture written in LaTeX, leather-covered with crimson thread and Phyrexian script borders. It inverts the hero's journey: Clavileño appears to be the protagonist, but Erebos, the god of the dead who provides the tools (Helm of the Host, Whip of Erebos, Dictate of Erebos), is the actual winner. The Codex's thesis is about **surface-level perception**: three factions war without understanding the deeper structure. Its own reception proves its thesis — people feel the book, give it a turn-over, say "Neat!" and hand it back without reading it.

### ⚒️ Clavileño & Erebos
The working metaphor for Brian's relationship with AI tooling. **Clavileño** (Brian) is the commander who shows up with intent, taste, and conviction. **Erebos** (the SOTA model) guides him through the **Helm of the Host** (API). Clavileño didn't forge the weapons. He wielded them. The power is granted, not earned through suffering, and the old gods rage at it because it *works*. This is explicitly how Brian frames AI-augmented craft: not replacement, but amplification of existing expertise.

### 🏔️ "Neat!"
The universal failure mode of human engagement. Represents surface-level perception — the inability or unwillingness to look past the first layer. People handing the Codex back unread; colleagues fixating on clipping text instead of seeing the architecture; anyone who evaluates the surface without engaging the depth. Brian has internalized this as an environmental constant, not a personal failing. He engineers around it (obsessive polish to remove surface-level snags) rather than trying to change human perceptual wiring.

### 🔨 The Rejection Function
The core of Brian's workflow with AI. Generate → reject → refine → reject → push edge cases → reject → ship. The "two-word prompt" crowd doesn't have this function. They get slop and blame the chisel. Brian's rejection function was built over a decade of shipping: AMAX ESD, Red Tie Robotics, Summer of Game Design, Iterate, AzureML, MARP. The AI didn't give him taste. It removed the friction between taste and artifact.

---

## Design Philosophy (Cross-Domain)

These principles apply identically across every medium Brian works in: code, hardware, prose, physical craft.

1. **Zero dependencies where possible.** The portfolio site is one HTML file, one CSS file, 12 JS files. No React, no bundler, no npm. The Codex is XeLaTeX with no custom packages beyond standard font loading. MARP is a Pi 5 with direct GPIO control. If it can be hand-rolled, it is hand-rolled.

3. **Hidden depth / whisper systems.** Every artifact has a surface layer that satisfies casual inspection and a depth layer that rewards sustained engagement. The portfolio has scroll-driven whisper HUDs, proximity glow, guided tours. The Codex has the Tutor index and Arcana appendix that most readers never reach. MARP has the wiring diagram walkthrough animation. The whisper is always there. Most people won't hear it. That's fine.

---

## Key References (File Paths)

| Artifact | Path | Lines | Description |
|---|---|---|---|
| Portfolio Data | `PORTFOLIO.json` | 1,014 | Full career data: 8 sections, 63+ items, timeline whispers |
| Index | `INDEX.html` | 740+ | Zero-framework SPA, parallax windows, key figures grid |
| Viz Utilities | `VIZ.JS` | 700 | Shared: themes, pan/zoom, filter system, crossfader |
| Mermaid Engine | `MERMAID.JS` | 1,635 | Custom Mermaid parser + glassmorphic DOM renderer |
| Skill Tree | `SKILLTREE.JS` | 2,476 | Radial node-graph, collision physics, proximity glow, tours |
| Timeline | `TIMELINE.JS` | 819 | Vertical swimlane, greedy column packing, whisper HUD |
| Site Architecture | `ARCH.md` | 204 | Mermaid diagram of portfolio site stack |
| MARP Wiring | `MARP.md` | ~200 | Mermaid wiring diagram: power, motors, sensors, compute |
| MTG Cards | `CARDS.json` | 2,694 | Full card database for MTG skill tree |
| Dusk Rose Codex | `pdf/bible.tex` | 994 | XeLaTeX source: satirical MTG scripture |

---

## One-Liner

A penguin who makes things.

---

## Quotes

Sharing is good, and with digital technology, sharing is easy - Richard Stallman

History repeats itself because nobody was listening the first time - Erik Qualman

---

*So it is written in blood, sweat, tears & caffeine, and so it shall endure.*
