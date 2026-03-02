<!-- mermaid-output: assets/diagrams/site-architecture.png -->
```mermaid
---
title: 🏗️ MUTILAR.GITHUB.IO
---
graph TD
    subgraph Legend["🎨 COLOR LEGEND"]
        direction LR
        subgraph LEGENDROW["🗺️ TYPES"]
            direction TB
            L1["🌐 HOST"]:::hosting
            L2["🔧 CDN"]:::config
            L3["🎨 STYLE"]:::style
            L4["📦 DATA"]:::data
            L5["🔩 ENGINE"]:::engine
            L6["🗺️ RENDER"]:::aes
            L7["🌌 U.I."]:::ui
            L8["🧠 U.X."]:::ux
            L9["👆 H.C.I."]:::hci
        end
    end

    subgraph CLOUD["☁️ CLOUD"]
        direction LR
        subgraph HOSTING["🖥️ HOSTING"]
            direction LR
            GITHUB["🐙 GITHUB PAGES"]
            CNAME["🌐 ROUTE 53"]
            CNAMEFILE["🔗 CNAME"]
        end
        subgraph CDN["📦 CDN"]
            direction LR
            PDFJS["📰 PDF.js"]
            FONTAWESOME["🔣 FontAwesome *.svg"]
        end
    end

    subgraph SHELL["🗂️ REPO"]
        direction TB
        subgraph ENTRY["🏠 ENTRY"]
            direction LR
            READMEMD["📎 README.md"]
            LICENSETXT["📜 LICENSE.txt"]
            INDEXHTML["📄 INDEX.html"]
            STYLESCSS["🎨 STYLE.css"]
        end
        subgraph ASSETS["📂 MEDIA"]
            direction TB
            subgraph DOCS["📎 DOCS"]
                direction LR
                PORTFOLIOJSON["📋 PORTFOLIO.json"]
                SETTINGSJSON["⚙️ SETTINGS.json"]
                CARDSCSV["🃏 CARDS.csv"]
                ARCHMD["🧜‍♀️ *.MD"]
                RESUME["📄 3 *.PDF"]
            end
            subgraph MEDIAFILES["🎞️ MEDIA"]
                direction LR
                PNGS["📸 350 *.png, *.gif"]
                GIFS["🎞️ 6 *.gif"]
                GAMEBUILDS["🎮 6 *.unityweb"]
                FRAGMENTS["🧩 16 *.html"]
                AUDIOFILES["🎵 5 *.mp3"]
            end
        end
        subgraph SCRIPTS["⚙️ SCRIPTS"]
            direction TB
            subgraph ENGINE["🔩 ENGINE"]
                direction LR
                CONSOLEJS["🔎 CONSOLE.js"]
                SCROLLJS["📜 SCROLL.js"]
                DATAJS["📊 DATA.js"]
                RADIOJS["🎵 RADIO.js"]
            end
            subgraph ENGINEUI["🌌 U.I."]
                direction LR
                THEMEJS["🌓 THEME.js"]
                PARALLAXJS["🫧 PARALLAX.js"]
                MODALSJS["🪟 MODAL.js"]
                VIZJS["📈 VIZ.js"]
                pdfJS["📕 PDF.js"]
            end
            subgraph ENGINEVIZ["🗺️ RENDER"]
                direction LR
                SKILLTREEJS["🧭 SKILLTREE.js"]
                MERMAIDVIEWJS["🧜 MERMAID.js"]
                TIMELINEJS["🕰️ TIMELINE.js"]
                MAPJS["🌌 MAP.js"]
            end
        end
    end
    

    subgraph UI["🧠 U.I."]
        subgraph UX["🧠 U.X."]
            direction LR
            TILES["💎 TILES"]
            LINK["🔗 LINK"]
            RADIO["🎵 RADIO"]
            VIEW["🧭 VIEW"]
        end

        subgraph HCI["👆 H.C.I."]
            direction LR
            HINT["👆 HINT"]
            MAP["📋 MAP"]
            EMB["🕹️ EMB"]
        end
    end
    

    %% ── 1. HOSTING → ENTRY ──────────────────────────────────

    GITHUB -->|"HTTPS"| INDEXHTML
    INDEXHTML -->|"DNS"| CNAME
    CNAMEFILE -.->|"ALIAS"| CNAME

    %% ── 2. INDEX → CDN (loads external libs) ────────────────

    INDEXHTML -->|"LINK"| STYLESCSS
    INDEXHTML -->|"LINK"| FONTAWESOME
    INDEXHTML -->|"MODULE"| PDFJS

    %% ── 3. INDEX → SCRIPTS (deferred script tags) ──────────

    INDEXHTML -->|"FETCH"| FRAGMENTS
    FRAGMENTS -->|"innerHTML"| MODALSJS
    INDEXHTML -->|"DEFER"| SCRIPTS

    %% ── 4. CDN → SCRIPTS (libs consumed by JS) ─────────────

    PDFJS -.->|"pdf()"| pdfJS

    %% ── 4b. DATA.JS → shared globals ───────────────────────

    DATAJS -->|"state"| MODALSJS
    DATAJS -->|"*"| VIZJS

    %% ── 5. VIZ.JS → RENDER (shared utilities + maps) ───────

    VIZJS -.->|"traverse()"| MERMAIDVIEWJS
    VIZJS -.->|"traverse()"| SKILLTREEJS
    VIZJS -.->|"traverse()"| TIMELINEJS
    VIZJS -.->|"traverse()"| MAPJS

    %% ── 6. SCRIPTS → DATA & ASSETS ─────────────────────────

    DATAJS -->|"fetch()"| PORTFOLIOJSON
    MODALSJS -->|"fetch()"| SETTINGSJSON
    MODALSJS -->|"fetchCSV()"| CARDSCSV
    pdfJS -.->|"fetch()"| RESUME
    RADIOJS -.->|"fetch()"| AUDIOFILES
    MERMAIDVIEWJS -.->|"fetch()"| ARCHMD

    %% ── 7. SCRIPTS → VIEW (render pipeline) ────────────────

    PARALLAXJS -->|"render()"| UX
    PARALLAXJS -->|"render()"| HCI
    SCROLLJS -->|"hint()"| HINT
    CONSOLEJS -->|"warn()"| HINT
    DATAJS -->|"card()"| TILES
    THEMEJS -->|"toggle()"| UX
    THEMEJS -->|"toggle()"| HCI
    RADIOJS -.->|"analyser()"| RADIO

    %% ── 8. SCRIPTS → MODALS ────────────────────────────────

    MERMAIDVIEWJS -.->|"diagram()"| MAP
    SKILLTREEJS -.->|"graph()"| MAP
    MAPJS -.->|"constellation()"| MAP
    TIMELINEJS -.->|"timeline()"| MAP
    pdfJS -.->|"getDocument()"| VIEW
    MODALSJS -.->|"open()"| EMB
    MODALSJS -.->|"open()"| VIEW
    MODALSJS -.->|"iframe()"| LINK

    %% ── NODE CLASSES ────────────────────────────────────────

    class GITHUB,INDEXHTML,READMEMD,LICENSETXT hosting
    class FRAGMENTS data
    class PDFJS,CNAME,CNAMEFILE config
    class STYLESCSS,FONTAWESOME style
    class CONSOLEJS,SCROLLJS,DATAJS,RADIOJS engine
    class VIZJS,pdfJS,PARALLAXJS,THEMEJS,MODALSJS ui
    class MERMAIDVIEWJS,SKILLTREEJS,TIMELINEJS,MAPJS aes
    class PORTFOLIOJSON,SETTINGSJSON,CARDSCSV data
    class ARCHMD data
    class PNGS data
    class RESUME,GIFS,GAMEBUILDS,AUDIOFILES data
    class TILES,RADIO,VIEW,LINK ux
    class MAP,HINT,EMB hci

    %% ── CLASS DEFINITIONS ───────────────────────────────────

    classDef hosting fill:#f7a799,stroke:#f25022,color:#5a1000,stroke-width:2px
    classDef config fill:#ffd6a0,stroke:#e87400,color:#5a2d00,stroke-width:1.5px
    classDef style fill:#e0f0ff,stroke:#0078d4,color:#002050,stroke-width:1.5px
    classDef data fill:#c4d4f5,stroke:#4052b5,color:#1a1a5e,stroke-width:1.5px
    classDef engine fill:#c8e6a0,stroke:#7fba00,color:#2d4a00,stroke-width:1.5px
    classDef aes fill:#a0e6d6,stroke:#00a884,color:#003d2e,stroke-width:1.5px
    classDef ui fill:#d6c4f5,stroke:#7b61ff,color:#2a1a5e,stroke-width:1.5px
    classDef ux fill:#fff3c4,stroke:#ffb900,color:#4a3200,stroke-width:2px
    classDef hci fill:#f5d0e0,stroke:#e3008c,color:#4a0028,stroke-width:2px

    %% ── SUBGRAPH STYLES ────────────────────────────────────

    style CLOUD fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style HOSTING fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style CDN fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333

    style SHELL fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style ENTRY fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style ASSETS fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style DOCS fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style MEDIAFILES fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333

    style SCRIPTS fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style ENGINE fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style ENGINEVIZ fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style ENGINEUI fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333

    style UI fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style UX fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style HCI fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333

    style LEGEND fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style LEGENDROW fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
```