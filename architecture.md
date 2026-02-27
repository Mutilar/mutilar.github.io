<!-- mermaid-output: assets/diagrams/site-architecture.png -->
```mermaid
---
title: 🏗️ MUTILAR.GITHUB.IO
---
graph TD
    subgraph Legend["🎨 COLOR LEGEND"]
        direction LR
        subgraph LegendRow["🗺️ TYPES"]
            direction TB
            L1["🌐 HOSTING"]:::hosting
            L2["🔧 CONFIG"]:::config
            L3["🎨 STYLE"]:::styling
            L4["📦 ASSET"]:::asset
            L6["📊 DATA"]:::data
            L5["⚙️ SCRIPT"]:::script
            L7["🧠 OUTPUT"]:::output
        end
    end

    subgraph Cloud["☁️ Cloud"]
        direction LR
        subgraph Hosting["☁️ HOSTING"]
            direction LR
            GitHub["🐙 GITHUB PAGES\n<i>mutilar.github.io</i>"]
            CNAME["🌐 ROUTE 53\n<i>brianhungerman.com</i>"]
            CNAMEFile["🔗 CNAME\n<i>DNS RECORD</i>"]
        end
        subgraph CDN["📦 CDN"]
            direction LR
            PapaParse["🕵️ PapaParse\n<i>*.CSV</i>"]
            PDFjs["📰 PDF.js\n<i>*.PDF</i>"]
        end
    end

    subgraph Shell["<SHELL ICO, NOT LITERALLY BUT TECH SHELL> SHELL"]
        direction LR
        subgraph Docs["📎 DOCS"]
            direction LR
            ReadmeMD["📖 README\n<i>README.md</i>"]
            ArchMD["🧜‍♀️ DIAGRAMS\n<i>*.md</i>"]
            Resume["📄 PRINT\n<i>*.pdf, *.tex</i>"]
        end
        subgraph <WHAT SHOULD WE CALL THIS?>["<ICON> <LABEL>"]
            direction LR
            IndexHTML["📄 INDEX.html\n<i>1K LOC</i>"]
            StylesCSS["🎨 STYLE.css\n<i>GLASSMORPHISM</i>"]
            LicenseTxt["📜 LICENSE.txt\n<i>MIT LICS.</i>"]
        end
    end
    subgraph Folders["<FOLDER ICO> FOLDERS (8)"]
        direction LR
        subgraph Media["🖼️ MEDIA (348)"]
            direction LR
            ImagePngs["📸 316 PICS\n<i>*.png, *.gif</i>"]
            GameBuilds["🎮 5 GAMES\n<i>*.unityweb</i>"]
            AudioFiles["🎵 5 SONGS\n<i>*.mp3</i>"]
        end
        subgraph CsvData["📊 ENTRIES (62)"]
            direction LR
            WorkCSV["💼 12 EXPERIENCES\n<i>work.csv</i>"]
            EduCSV["🎓 12 CLASSES\n<i>education.csv</i>"]
            ProjectsCSV["🚀 28 PROJECTS\n<i>*.csv</i>"]
        end
    end
    subgraph Scripts["⚙️ SCRIPTS"]
        direction TB
        subgraph THINGONE["🔩 ENGINE"]
            direction LR
            subgraph Core["🧠 CORE"]
                direction LR
                DataJS["📊 DATA\n<i>data.js</i>"]
                VizJS["📈 VIZ\n<i>viz.js</i>"]
                PdfViewerJS["📕 PDF\n<i>pdf.js</i>"]
            end
            subgraph DataViz["📊 VIZ"]
                direction LR
                MermaidViewJS["🧜 GRAPHS\n<i>mermaid.js</i>"]
                SkillTreeJS["🧭 SPECS\n<i>skilltree.js</i>"]
                TimelineJS["🕰️ EVENTS\n<i>timeline.js</i>"]
            end
        end
        subgraph THINGTWO["🎭 STAGE"]
            direction LR
            subgraph UI["🖥️ UI"]
                direction LR
                ScrollJS["📜 SCROLL\n<i>scroll.js</i>"]
                ModalsJS["🪟 MODAL\n<i>modal.js</i>"]
                ConsoleJS["🔎 DEBUG\n<i>console.js</i>"]
            end
            subgraph Ambient["🌌 AESTHETICS"]
                direction LR
                ThemeJS["🌓 THEME\n<i>theme.js</i>"]
                ParallaxJS["✨ PARALLAX\n<i>parallax.js</i>"]
                RadioJS["🎵 MUSIC\n<i>radio.js</i>"]
            end
        end
    end

    subgraph Layers["🧠 U.X."]
        direction TB            
        subgraph Interact["👆 INTERACTION"]
            direction LR
            subgraph Canvas["🌀 CANVAS"]
                direction LR
                OrbCanvas["🫧 ORBS"]
                GlintCanvas["💫 GLINT"]
                ScrollHints["👆 HINTS"]
            end
            subgraph Play["🕹️ PLAY"]
                direction LR
                GameModal["🎮 GAME\n<i>Unity WebGL</i>"]
            end
            subgraph Read["📖 READ"]
                direction LR
                PdfModal["📕 DUSK ROSE CODEX\n<i>Vorthos Scripture</i>"]
                DeckModal["🃏 GALLERY\n<i>Magic: The Gathering</i>"]
            end
        end
        subgraph Modals["🪟 VIEWS"]
            direction LR
            subgraph Content["📜 CONTENT"]
                direction LR
                Cards["💎 CARDS\n<i>Glassy Tiles</i>"]
                Overlays["🪟 MODALS\n<i>Overlays</i>"]
                Player["🎵 RADIO\n<i>Equalizer</i>"]
            end
            subgraph Viz["📊 VIZ"]
                direction LR
                ArchModal["🧜 MERMAID\n<i>Diagrams</i>"]
                KnowledgeModal["🌳 SKILLTREE\n<i>Life Arcs</i>"]
                TimelineModal["📅 TIMELINE\n<i>History</i>"]
            end
        end
    end
    

    %% ── 1. HOSTING → ENTRY ──────────────────────────────────

    GitHub -->|"HTTPS"| IndexHTML
    IndexHTML -->|"DNS"| CNAME
    CNAMEFile -.->|"ALIAS"| CNAME

    %% ── 2. INDEX → CDN (loads external libs) ────────────────

    IndexHTML -->|"LINK"| StylesCSS
    IndexHTML -.->|"DEFER"| PapaParse
    IndexHTML -->|"MODULE"| PDFjs

    %% ── 3. INDEX → SCRIPTS (deferred script tags) ──────────

    IndexHTML -->|"DEFER"| Scripts

    %% ── 4. CDN → SCRIPTS (libs consumed by JS) ─────────────

    PapaParse -.->|"Papa.parse()"| DataJS
    PDFjs -.->|"pdfjsLib"| PdfViewerJS

    %% ── 5. VIZ.JS → RENDER (shared utilities) ──────────────

    VizJS -.->|"initPanZoom()"| MermaidViewJS
    VizJS -.->|"initPanZoom()\ncreateFilterSystem()"| SkillTreeJS
    VizJS -.->|"createFilterSystem()"| TimelineJS

    %% ── 6. SCRIPTS → DATA & ASSETS ─────────────────────────

    DataJS -->|"fetch()"| CsvData
    DataJS -.->|"url()"| ImagePngs
    PdfViewerJS -.->|"fetch()"| Resume
    RadioJS -.->|"fetch()"| AudioFiles
    ModalsJS -.->|"fetch()"| GameBuilds
    MermaidViewJS -.->|"fetch()"| ArchMD

    %% ── 7. SCRIPTS → VIEW (render pipeline) ────────────────

    ThemeJS -->|"toggle()"| Layers
    ParallaxJS -->|"render()"| OrbCanvas
    ParallaxJS -->|"render()"| GlintCanvas
    ScrollJS -->|"fadeHint()"| ScrollHints
    DataJS -->|"buildCard()"| Cards
    ConsoleJS -->|"intercept()"| ScrollHints
    RadioJS -.->|"createAnalyser()"| Player

    %% ── 8. SCRIPTS → MODALS ────────────────────────────────

    ModalsJS -->|"toggleModal()"| Overlays
    MermaidViewJS -.->|"createDiagram()"| ArchModal
    SkillTreeJS -.->|"buildGraph()"| KnowledgeModal
    TimelineJS -.->|"buildTimeline()"| TimelineModal
    PdfViewerJS -.->|"getDocument()"| PdfModal
    DataJS -.->|"openDeckModal()"| DeckModal
    ModalsJS -.->|"openGameModal()"| GameModal

    %% ── NODE CLASSES ────────────────────────────────────────

    class GitHub,IndexHTML,LicenseTxt hosting
    class CNAME,CNAMEFile config
    class StylesCSS styling
    class PapaParse,PDFjs script
    class ModalsJS,DataJS,ScrollJS,ThemeJS,ConsoleJS,VizJS script
    class ParallaxJS,RadioJS,PdfViewerJS,MermaidViewJS,SkillTreeJS,TimelineJS script
    class WorkCSV,EduCSV,ProjectsCSV data
    class ReadmeMD,ArchMD asset
    class ImagePngs asset
    class Resume,GameBuilds,AudioFiles asset
    class OrbCanvas,GlintCanvas,ScrollHints,Cards,Overlays,Player,Toast output
    class ArchModal,KnowledgeModal,TimelineModal output
    class PdfModal,DeckModal,GameModal output

    %% ── CLASS DEFINITIONS ───────────────────────────────────

    classDef hosting fill:#f7a799,stroke:#f25022,color:#5a1000,stroke-width:2px
    classDef config fill:#ffe49a,stroke:#ffb900,color:#4a3200,stroke-width:1.5px
    classDef styling fill:#e8d0f0,stroke:#8b5cf6,color:#3b1470,stroke-width:1.5px
    classDef script fill:#c8e6a0,stroke:#7fba00,color:#2d4a00,stroke-width:1.5px
    classDef data fill:#a0cfff,stroke:#0078d4,color:#002050,stroke-width:1.5px
    classDef asset fill:#d0e8ff,stroke:#0078d4,color:#002050,stroke-width:1.5px
    classDef output fill:#ffe49a,stroke:#ffb900,color:#4a3200,stroke-width:2px

    %% ── SUBGRAPH STYLES ────────────────────────────────────

    style Hosting fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Shell fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Entry fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style CDN fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Assets fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style AssetFiles fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Media fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333

    style CsvData fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333

    style Scripts fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Core fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style UI fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Ambient fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style DataViz fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style View fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Layers fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Canvas fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Chrome fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Content fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Modals fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Viz fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Play fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Read fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Interact fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Legend fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style LegendRow fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
```