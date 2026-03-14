graph TD
    subgraph "TerminalUIManager Use Cases"
        User((User))

        subgraph "Bootstrap (Awake)"
            B1[ResolveFont]
            B2[EnsureEventSystem]
            B3[EnsureCanvas]
            B4[EnsureStatusBar]
            B5[EnsureTerminals x4]
            B6[Wire SimulationTime → StatusBar]
        end

        subgraph "State Machine"
            S_Main[UIState.Main<br/>ShipTerminal visible]
            S_Crew[UIState.Crew<br/>CrewTerminal visible]
            S_Nav[UIState.Nav<br/>NavTerminal visible]
            S_Code[UIState.Code<br/>CodeTerminal visible]
        end

        subgraph "Public API"
            API1[ShowProgram name, source]
        end

        User -- "C key" --> S_Crew
        User -- "N key" --> S_Nav
        User -- "ESC key" --> S_Main
        S_Crew -- "ESC" --> S_Main
        S_Nav -- "ESC" --> S_Main
        S_Code -- "ESC" --> S_Main

        API1 -- "LoadProgram + SetState" --> S_Code

        S_Main -- "Start()" --> S_Main
    end

    style S_Main fill:#0a3,stroke:#fff,color:#fff
    style S_Crew fill:#05a,stroke:#fff,color:#fff
    style S_Nav fill:#05a,stroke:#fff,color:#fff
    style S_Code fill:#05a,stroke:#fff,color:#fff