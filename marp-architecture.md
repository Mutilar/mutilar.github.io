
<!-- mermaid-output: assets/diagrams/high-level-wiring.png -->
```mermaid
---
title: 🤖 MARP WIRING
---
graph TD
    subgraph Legend["🎨 COLOR LEGEND"]
        direction LR
        subgraph LegendPower["⚡ CONTROL"]
            direction TB
            L1["🔋 BATTERY"]:::battery
            L2["⚡ POWER"]:::control
            L3["🔽 REGULATION"]:::converter
            L4["🔌 DRIVERS"]:::driver
            L5["⚙️ MOTORS"]:::motor
            L6["🧠 COMPUTE"]:::compute
            L7["↔️ I/O"]:::sensor
        end
    end


    subgraph FuseDistribution["⚡ DISTRIBUTION"]
        direction TB
        
        subgraph BatterySupply["🔋 POWER"]
            direction LR
            Battery["LI-ION\n<i>Aegis</i>\n240 Wh"]
            Meter["BATTERY METER\n<i>Aegis</i>\n0.5 W"]
            Switch["SWITCH\n<i>FRC</i>\n30 A"]
        end
        subgraph Fuses["🧯 PROTECTION"]
            direction LR
            FusePD["FUSE\n5.0 A"]
            FuseBuck5["FUSE\n5.0 A"]
            FuseStepper24["FUSE\n5.0 A"]
            FuseBuck12["FUSE\n5.0 A"]
        end
        subgraph PowerConversion["⚡ REGULATION"]
            direction LR
            subgraph UsbPd["🔃 20 V USB-C PD"]
                direction LR
                PDAdapter["ADAPTER\n<i>JacobsParts</i>\n2.2 A"]
            end
            subgraph 5Bucks["🔽 5.0 V BUCK"]
                direction LR
                Buck5["BUCK\n<i>TOBSUN</i>\n5 A"]
            end
            subgraph Boost["🔼 3.3 V BOOST"]
                direction LR
                LevelShifter["LEVEL SHIFTER\n<i>74AHCT125N</i>\nSPIO"]
            end
            subgraph 12Buck["🔽 12 V BUCK"]
                direction LR
                Buck12["BUCK\n<i>TOBSUN</i>\n10 A"]
            end
        end
    end

    subgraph Mobility["🦾 MOBILITY"]
        direction LR
        subgraph WheelDrive["⚙️ WHEELS"]
            direction LR
            subgraph WheelLeft["⬅️ LEFT DRIVER"]
                direction TB
                Stepper24Left["DRIVER\n<i>TB6600</i>\n24 V, 1 W"]
                LeftWheel["MOTOR\n<i>KH56</i>\n24 V, 60 W"]
            end
            subgraph WheelRight["➡️ RIGHT DRIVER"]
                direction TB
                Stepper24Right["DRIVER\n<i>TB6600</i>\n24 V, 1 W"]
                RightWheel["MOTOR\n<i>KH56</i>\n24 V, 60 W"]
            end
        end
        subgraph TurretDrive["🤖 TURRET"]
            direction LR
            subgraph TurretPan["🔄 PAN DRIVER"]
                direction TB
                Stepper12Pan["DRIVER\n<i>TB6600</i>\n12 V, 0.5 W"]
                HeadPan["MOTOR\n<i>M55</i>\n12 V, 12 W"]
            end
            subgraph TurretTilt["↕️ TILT DRIVER"]
                direction TB
                Stepper12Tilt["DRIVER\n<i>TB6600</i>\n12 V, 0.5 W"]
                HeadTilt["MOTOR\n<i>M55</i>\n12 V, 12 W"]
            end
        end
    end

    subgraph Turret["🤖 HEAD"]
        direction TB
        subgraph Output["📤 OUTPUT"]
            direction LR
            subgraph Display["📽️ DISPLAY"]
                direction LR
                Projector["PROJECTOR\n<i>NEBULA Capsule Air</i>\n20 V, 45 W"]
            end
            subgraph Brain["🧠 BRAIN"]
                direction LR
                Pi["COMPUTER\n<i>Raspberry Pi 5</i>\n5 V, 27 W"]
            end
            subgraph Ears["👂 EARS"]
                direction TB
                Microphone["MICROPHONE\n<i>Microphone</i>\n5 V, 0.1 W"]
            end
            subgraph Mouth["👄 MOUTH"]
                direction LR
                LEDs["LED STRIP\n<i>WS2815, 144px</i>\n12 V, 1.0 W"]
            end
        end
        subgraph Input["👁️ EYES"]
            direction LR
            subgraph Vision["📷 IRIS"]
                direction LR
                Camera["CAMERA\n<i>Arducam, IMX708 NoIR</i>\n5 V, 1 W"]
                IRLED["IR LIGHT\n<i>LEDGUHON</i>\n1.2 V, 3 W"]
            end
            subgraph Balls["🔮 PUPILS"]
                direction LR
                EyeLeft["LEFT\n<i>QUE-T, 13 mm</i>\n5 V, 0.2 W"]
                EyeRight["RIGHT\n<i>QUE-T, 13 mm</i>\n5 V, 0.2 W"]
            end    
        end
    end

    %% Power path (top to bottom)
    BatterySupply -->|"24 V"| FuseBuck5
    BatterySupply -->|"24 V"| FuseBuck12
    BatterySupply -->|"24 V"| FusePD
    BatterySupply -->|"24 V"| FuseStepper24
    FuseBuck5 -->|"24 V"| 5Bucks
    FuseBuck12 -->|"24 V"| 12Buck
    FusePD -->|"24 V"| UsbPd
    PDAdapter -->|"20 V"| Display 
    Buck5 -->|"5 V"| Brain 

    %% Converters to specific drivers / devices
    Buck12 -->|"1.0 A"| Mouth
    Buck12 -->|"1.1 A"| TurretPan
    Buck12 -->|"1.1 A"| TurretTilt
    FuseStepper24 -->|"1.1 A"| WheelRight
    FuseStepper24 -->|"1.1 A"| WheelLeft
    Pi -.->|"1.2 V\n1.5 Ω"| IRLED

    %% Pi control signals
    Pi -->|"STP\nDIR\nEND"| WheelLeft
    Pi -->|"STP\nDIR\nEND"| WheelRight
    Pi -->|"STP\nDIR\nEND"| TurretPan
    Pi -->|"STP\nDIR\nEND"| TurretTilt

    %% Pi to face/turret subsystems
    Pi -->|"CSI"| Vision
    Pi -->|"GPIO"| Balls
    Pi -->|"SPIO"| Boost
    Pi -.->|"I2C"| Microphone
    Pi -.->|"HDMI"| Projector

    %% Mobility to motors
    Stepper12Pan -->|"1.0 A"| HeadPan
    Stepper12Tilt -->|"1.0 A"| HeadTilt
    Stepper24Left -->|"1.0 A"| LeftWheel
    Stepper24Right -->|"1.0 A"| RightWheel

    %% Data output chain
    LevelShifter -->|"SPIO"| Mouth

    class Battery,Meter,Switch battery
    class FuseStepper24,FuseBuck12,FuseBuck5,FusePD control
    class Stepper24Left,Stepper24Right,Stepper12Pan,Stepper12Tilt driver
    class Buck12,Buck5,PDAdapter converter
    class Pi compute
    class Camera,Microphone,EyeLeft,EyeRight sensor
    class Projector compute
    class IRLED,LEDs sensor
    class LevelShifter converter
    class LeftWheel,RightWheel,HeadPan,HeadTilt motor

    classDef battery fill:#f7a799,stroke:#f25022,color:#5a1000,stroke-width:2px
    classDef control fill:#f7a799,stroke:#f25022,color:#5a1000,stroke-width:1.5px
    classDef driver fill:#c8e6a0,stroke:#7fba00,color:#2d4a00,stroke-width:1.5px
    classDef converter fill:#fff3c4,stroke:#ffb900,color:#4a3200,stroke-width:1.5px
    classDef compute fill:#c8e6a0,stroke:#7fba00,color:#2d4a00,stroke-width:1.5px
    classDef sensor fill:#e0f0ff,stroke:#0078d4,color:#002050,stroke-width:1.5px
    classDef motor fill:#f7a799,stroke:#f25022,color:#5a1000,stroke-width:2px

    style FuseDistribution fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Fuses fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style BatterySupply fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style PowerConversion fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Boosts fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Bucks fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style UsbPd fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Mobility fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Brain fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Display fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style TurretDrive fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style TurretPan fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style TurretTilt fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style WheelDrive fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style WheelLeft fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style WheelRight fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Balls fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Vision fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Ears fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Mouth fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Input fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Output fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Turret fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style Legend fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
    style LegendPower fill:#f5f5dc,stroke:#999,stroke-width:1px,color:#333
```