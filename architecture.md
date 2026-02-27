```mermaid
---
title: 🏗️ MUTILAR.GITHUB.IO
---
graph TD
    subgraph Legend["🗺️ LEGEND"]
        direction TB
        subgraph LegendRow[" "]
            L1["🌐 Hosting"]:::hosting
            L2["🔧 Config"]:::config
            L4["🎨 Style"]:::styling
            L6["📦 Assets"]:::asset
            L5["⚙️ Script"]:::script
            L7["📊 Data"]:::data
        end
        L8["🧠 Output"]:::output
    end

    subgraph Hosting["☁️ HOSTING"]
        direction LR
        GitHub["PROVIDER\n<i>GitHub Pages</i>\nmutilar.github.io"]
        CNAME["DNS\n<i>Route 53<\i>\nbrianhungerman.com"]
    end

    subgraph Shell["<idk?> ROOT"]
        direction TB
        subgraph <IDK>["🌐 <IDK>"]
            direction LR
            CNAMEFile["CNAME\n<i>🌐 DNS Record</i>"]
            IndexHTML["index.html\n<i>📄 927 LOC</i>"]
            LicenseTxt["LICENSE.txt\n<i>📜 MIT License</i>"]
        end
        subgraph CDN["📦 CDN"]
            direction LR
            StylesCSS["styles.css\n<i>🎨 Glassmorphism</i>"]
            PapaParse["PapaParse\n<i>🗂️ CSV Parser</i>"]
            PDFjs["PDF.js\n<i>📕 PDF Reader</i>"]
        end
    end

    subgraph Assets["🎨 ASSETS"]
        direction TB
        subgraph AssetFiles["📄 FILES"]
            direction LR
            ReadmeMD["README.md\n<i>📄</i>"]
            ArchMD["architecture.md\n<i>🧜‍♀️</i>"]
            MarpArchMD["marp-architecture.md\n<i>🧜‍♀️</i>"]
        end
        
        subgraph AssetFolders["📁 FOLDERS"]
            direction LR
            Images["images/\n<i>*.png, *.gif</i>"]
            CSVFiles["csv/\n<i>*.csv</i>"]
            AudioFiles["radio/\n<i>*.mp3</i>"]
            GameBuilds["games/\n<i>*.webgl</i>"]
            PDFs["pdf/\n<i>*.pdf</i>"]
        end
        subgraph Hobbies["🎯 HOBBIES"]
            direction LR
            MarpCSV["marp.csv\n<i>🤖 MARP</i>"]
            BNCSV["bitnaughts.csv\n<i>☄️ BitNaughts</i>"]
            MtgCSV["mtg.csv\n<i>🔮 MTG</i>"]
            NoblesCSV["nobles.csv\n<i>👑 Nobles</i>"]
            DemonsCSV["demons.csv\n<i>👹 Demons</i>"]
        end
    end

    subgraph Scripts["⚙️ *.JS"]
        direction TB
        subgraph Core["🧠 CORE"]
            direction LR
            ModalsJS["modals.js\n<i>Pop-outs</i>"]
            DataJS["data.js\n<i>CSV Reader</i>"]
            ScrollJS["scroll.js\n<i>Observer</i>"]
            ThemeJS["theme.js\n<i>Light/Dark</i>"]
            ConsoleJS["console.js\n<i>Debugger</i>"]
            VizJS["viz.js\n<i><idk something about graphic abstraction something layer something but short and sweet not like this example></i>"]
        end
        subgraph Render["🎬 RENDER"]
            direction LR
            ParallaxJS["parallax.js\n<i>Orbs & Glint</i>"]
            RadioJS["radio.js\n<i>Web Audio</i>"]
            PdfViewerJS["pdfviewer.js\n<i>PDF Reader</i>"]
            MermaidViewJS["mermaid-view.js\n<i>Diagram Viewer</i>"]
            SkillTreeJS["skill-tree.js\n<i>Knowledge Graph</i>"]
            TimelineJS["timeline.js\n<i>Swimlane Layout</i>"]
        end
    end



    subgraph View["🧠 USER EXPERIENCE"]
        direction TB
        subgraph Layers["👁️ Elements"]
            direction LR
            subgraph Canvas["🌀 Canvas"]
                direction TB
                ParallaxBG["Parallax\n<i>🌌 Glowing Background</i>"]
            end
            subgraph Chrome["🔲 Chrome"]
                direction TB
                NavBar["Nav\n<i>🧭 Glass Toolbar</i>"]
                Player["Radio\n<i>🎵 Equalizer</i>"]
                Toast["Toast\n<i>🖥️ Console Overlay</i>"]
            end
            subgraph Content["📜 Content"]
                direction TB
                Bands["Bands\n<i>🧊 Frosted Headers</i>"]
                Tiles["Tiles\n<i>💎 Glassy Cards</i>"]
                ScrollHints["Hints\n<i>👆 Scroll Guides</i>"]
            end
        end
        subgraph Modals["🪟 MODALS"]
            direction TB
            subgraph Viz["📊 Viz"]
                direction LR
                ArchModal["Architecture\n<i>🏗️ Mermaid Diagram</i>"]
                KnowledgeModal["Knowledge\n<i>🌳 Skill Graph</i>"]
                TimelineModal["Timeline\n<i>📅 Swimlane</i>"]
                MarpModal["MARP\n<i>🤖 Wiring Diagram</i>"]
            end
            subgraph Play["🕹️ Play"]
                direction LR
                PdfModal["PDF\n<i>📕 Dusk Rose Codex</i>"]
                DeckModal["Deck\n<i>🃏 MTG Card Gallery</i>"]
                GameModal["Game\n<i>🎮 Unity WebGL</i>"]
            end
        end
    end

    %% ── TB FLOW ──

    %% 1. Hosting → Shell
    GitHub -->|"HTTPS"| IndexHTML
    IndexHTML -->|"DNS"| CNAME

    %% 2. Shell → CDN (index.html loads each CDN library)
    IndexHTML -.->|"script defer"| PapaParse

    %% 3. Shell → Assets (stylesheet + arch diagram)
    IndexHTML -->|"link"| StylesCSS

    %% 4. Shell → Scripts (deferred script tags)
    IndexHTML -->|"script defer"| Scripts

    %% 4b. VizJS shared utilities → render consumers
    VizJS -.->|"initPanZoom()"| MermaidViewJS
    VizJS -.->|"initPanZoom()\ncreateFilterSystem()"| SkillTreeJS
    VizJS -.->|"createFilterSystem()"| TimelineJS

    %% 5. CDN libs feed into the Scripts that consume them
    PapaParse -.->|"Papa.parse()"| DataJS
    IndexHTML -->|"module"| PDFjs
    PDFjs -.->|"pdfjsLib"| PdfViewerJS

    %% 6. Scripts read data & assets
    DataJS -->|"fetch()"| Hobbies
    DataJS -.->|"url()"| Images
    PdfViewerJS -.->|"fetch()"| PDFs
    RadioJS -.->|"fetch()"| AudioFiles
    ModalsJS -.->|"fetch()"| GameBuilds
    MermaidViewJS -.->|"fetch()"| ArchMD
    MermaidViewJS -.->|"fetch()"| MarpArchMD

    %% 7. Scripts → View elements
    ThemeJS -->|"toggle()"| Layers
    ParallaxJS -->|"render()"| ParallaxBG
    ScrollJS -->|"onScroll()"| Layers
    ScrollJS -->|"fadeHint()"| ScrollHints
    ScrollJS -->|"highlight()"| NavBar
    ConsoleJS -->|"intercept()"| Toast
    DataJS -->|"onClick()"| Tiles
    PdfViewerJS -.->|"getDocument()"| PdfModal
    ModalsJS -->|"toggleModal()"| Modals
    RadioJS -.->|"createAnalyser()"| Player
    MermaidViewJS -.->|"createDiagram()"| ArchModal
    SkillTreeJS -.->|"buildGraph()"| KnowledgeModal
    TimelineJS -.->|"buildTimeline()"| TimelineModal

    class GitHub,IndexHTML,LicenseTxt hosting
    class Route53,CNAME,CNAMEFile config
    class StylesCSS styling
    class PapaParse,PDFjs script
    class ModalsJS,DataJS,ScrollJS,ThemeJS,ConsoleJS,VizJS,ParallaxJS,RadioJS,PdfViewerJS,MermaidViewJS,SkillTreeJS,TimelineJS script
    class WorkCSV,EduCSV,ProjectsCSV,HacksCSV,GamesCSV,MarpCSV,BNCSV,MtgCSV,NoblesCSV,DemonsCSV data
    class ReadmeMD,ArchMD,MarpArchMD,Images,CardArt,CSVFiles,AudioFiles,GameBuilds,PDFs asset
    class ParallaxBG,NavBar,Bands,Tiles,ScrollHints,Player,Toast,DetailModal,DeckModal,PdfModal,GameModal,MarpModal,ArchModal,KnowledgeModal,TimelineModal output

    classDef hosting fill:#f7a799,stroke:#f25022,color:#5a1000,stroke-width:2px
    classDef config fill:#ffe49a,stroke:#ffb900,color:#4a3200,stroke-width:1.5px
    classDef styling fill:#f7a799,stroke:#f25022,color:#5a1000,stroke-width:1.5px
    classDef script fill:#c8e6a0,stroke:#7fba00,color:#2d4a00,stroke-width:1.5px
    classDef data fill:#a0cfff,stroke:#0078d4,color:#002050,stroke-width:1.5px
    classDef asset fill:#d0e8ff,stroke:#0078d4,color:#002050,stroke-width:1.5px
    classDef output fill:#ffe49a,stroke:#ffb900,color:#4a3200,stroke-width:2px

    style Hosting fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Shell fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style CDN fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Scripts fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Core fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Render fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Experience fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Hobbies fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Assets fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style AssetFiles fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style AssetFolders fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style View fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Layers fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Canvas fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Chrome fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Content fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Modals fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Viz fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Reader fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Play fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Legend fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style LegendRow fill:none,stroke:none
    style LegendInfra fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style LegendApp fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style LegendData fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
```