
<!-- mermaid-output: assets/diagrams/high-level-wiring.png -->
```mermaid
---
title: 🤖 MARP WIRING DIAGRAM
---
graph TD
    subgraph Legend["🎨 COLOR LEGEND"]
        direction LR
        subgraph LegendPower["⚡ POWER"]
            direction TB
            L1["Battery"]:::battery
            L2["Control"]:::control
            L3["Converters"]:::converter
            L4["Drivers"]:::driver
        end
        subgraph LegendSystems["🤖 SYSTEMS"]
            direction TB
            L5["Compute"]:::compute
            L6["Sensors"]:::sensor
            L7["Lights"]:::light
            L8["Motors"]:::motor
        end
    end

    subgraph BatterySupply["🔋 POWER"]
        direction LR
        Battery["Li-ion Battery\n<i>Aegis, 240 Wh</i>\n24 V, 10 Ah"]
        Meter["Inline Battery Meter\n<i>Aegis</i>\n24 V, 1 W"]
        Switch["Safety Switch\n<i>FRC</i>\n24 V, 30 A"]
    end

    subgraph FuseDistribution["⚡ DISTRIBUTION"]
        direction TB
        FuseBlock["Fuse Block\n<i>Tutooper, 6 Slots</i>\n24 V, 30 A"]
        subgraph Fuses["🧯 FUSING"]
            direction LR
            FuseBuck5["Fuse\n24 V, 5 A"]
            FuseBuck12["Fuse\n24 V, 5 A"]
            FusePD["Fuse\n24 V, 5 A"]
            FuseStepper24["Fuse\n24 V, 5 A"]
        end
        subgraph PowerConversion["🔽 BUCKS"]
            direction LR
            Buck12["Buck Converter\n<i>TOBSUN</i>\n24 → 12 V, 10 A"]
            Buck5["Buck Converter\n<i>TOBSUN</i>\n24 → 5 V, 15 A"]
            PDAdapter["USB-C PD Adapter\n<i>JacobsParts</i>\n24 → 20 V, 2.3 A"]
        end
    end

    Projector["Projector\n<i>NEBULA Capsule Air</i>\n20 V, 45 W"]
    Pi["Computer\n<i>Raspberry Pi 5</i>\n5 V, 25 W"]

    subgraph Mobility["🦾 MOBILITY"]
        direction TB
        subgraph WheelDrive["⚙️ WHEELS"]
            direction LR
            subgraph WheelLeft["⬅️ LEFT"]
                direction TB
                Stepper24Left["Driver\n<i>TB6600</i>\n24 V, 1 W"]
                LeftWheel["Motor\n<i>KH56</i>\n24 V, 24 W"]
            end
            subgraph WheelRight["➡️ RIGHT"]
                direction TB
                Stepper24Right["Driver\n<i>TB6600</i>\n24 V, 1 W"]
                RightWheel["Motor\n<i>KH56</i>\n24 V, 24 W"]
            end
        end
        subgraph TurretDrive["🎯 TURRET"]
            direction LR
            subgraph TurretPan["🔄 PAN"]
                direction TB
                Stepper12Pan["Driver\n<i>TB6600</i>\n12 V, 0.5 W"]
                HeadPan["Motor\n<i>M55</i>\n12 V, 12 W"]
            end
            subgraph TurretTilt["↕️ TILT"]
                direction TB
                Stepper12Tilt["Driver\n<i>TB6600</i>\n12 V, 0.5 W"]
                HeadTilt["Motor\n<i>M55</i>\n12 V, 12 W"]
            end
        end
    end

    subgraph FaceLighting["🤖 TURRET"]
        direction TB
        subgraph Turret["📷 VISION"]
            direction TB
            Camera["Camera\n<i>Arducam, IMX708 NoIR</i>\n5 V, 1 W"]
            IRLED["IR Light\n<i>LEDGUHON</i>\n1.2 V, 3 W"]
        end
        subgraph Eyes["👁️ EYES"]
            direction LR
            EyeLeft["Left Eye\n<i>QUE-T, 13 mm</i>\n5 V, 0.2 W"]
            EyeRight["Right Eye\n<i>QUE-T, 13 mm</i>\n5 V, 0.2 W"]
        end
        subgraph DataOutput["👄 MOUTH"]
            direction TB
            LevelShifter["Level Shifter\n<i>74AHCT125N</i>\n3.3 → 5 V"]
            LEDs["LED Strip\n<i>WS2815, 144px</i>\n12 V, 20 W"]
        end
    end

    %% Power path (top to bottom)
    Battery -->|"24 V"| Meter
    Meter -->|"24 V"| Switch
    Switch -->|"24 V"| FuseBlock
    FuseBlock --> FuseBuck5
    FuseBlock --> FuseBuck12
    FuseBlock --> FusePD
    FuseBlock --> FuseStepper24
    FuseBuck5 --> Buck5
    FuseBuck12 --> Buck12
    FusePD --> PDAdapter
    PDAdapter -->|"20 V"| Projector

    %% Converters to specific drivers / devices
    Buck12 -->|"12 V"| Stepper12Pan
    Buck12 -->|"12 V"| Stepper12Tilt
    Buck12 -->|"12 V"| LEDs
    FuseStepper24 -->|"24 V"| Stepper24Left
    FuseStepper24 -->|"24 V"| Stepper24Right
    Buck5 -->|"5 V"| Pi

    %% Pi control signals
    Pi -.->|"Step\nDir\nEnable"| Stepper24Left
    Pi -.->|"Step\nDir\nEnable"| Stepper24Right
    Pi -.->|"Step\nDir\nEnable"| Stepper12Pan
    Pi -.->|"Step\nDir\nEnable"| Stepper12Tilt
    Pi -.->|"HDMI"| Projector

    %% Pi to face/turret subsystems
    Pi -->|"5 V"| Camera
    Pi -->|"5 V"| EyeLeft
    Pi -->|"5 V"| EyeRight
    Pi -.->|"CSI"| Camera
    Pi -.->|"GPIO"| LevelShifter

    %% Mobility to motors
    Stepper12Pan --> HeadPan
    Stepper12Tilt --> HeadTilt
    Stepper24Left --> LeftWheel
    Stepper24Right --> RightWheel

    %% Turret internal
    IRLED -.->|750 nm| Camera

    %% Data output chain
    LevelShifter -.->|SPIO| LEDs

    class Battery battery
    class Switch,Meter,FuseBlock,FuseStepper24,FuseBuck12,FuseBuck5,FusePD control
    class Stepper24Left,Stepper24Right,Stepper12Pan,Stepper12Tilt driver
    class Buck12,Buck5,PDAdapter converter
    class Pi compute
    class Camera sensor
    class Projector,IRLED,EyeLeft,EyeRight,LEDs light
    class LevelShifter converter
    class LeftWheel,RightWheel,HeadPan,HeadTilt motor

    classDef battery fill:#e74c3c,stroke:#c0392b,color:#67000d,stroke-width:2px
    classDef control fill:#f9a825,stroke:#f57f17,color:#4a3800,stroke-width:1.5px
    classDef driver fill:#88b3e1,stroke:#1f78b4,color:#08306b,stroke-width:1.5px
    classDef converter fill:#c2b5f4,stroke:#6a51a3,color:#3f007d,stroke-width:1.5px
    classDef compute fill:#8dd3c7,stroke:#238b45,color:#00441b,stroke-width:1.5px
    classDef sensor fill:#cde1f7,stroke:#1f78b4,color:#08306b,stroke-width:1.5px
    classDef light fill:#d98cb3,stroke:#a03060,color:#4a0028,stroke-width:1.5px
    classDef motor fill:#fdd835,stroke:#f9a825,color:#4a3800,stroke-width:2px

    style FuseDistribution fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Fuses fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style BatterySupply fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style PowerConversion fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Mobility fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style TurretDrive fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style TurretPan fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style TurretTilt fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style WheelDrive fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style WheelLeft fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style WheelRight fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style FaceLighting fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Turret fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Eyes fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style DataOutput fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Legend fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style LegendPower fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style LegendSystems fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
```