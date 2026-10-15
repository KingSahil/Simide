# Data Flow & Execution Lifecycles

This document traces the complete step-by-step lifecycle flows of **VS Code Debug Mentor**. Each flow is illustrated with a sequence diagram and accompanied by an easy-to-follow explanation.

---

## 1. Session Launch Lifecycle (Clicking [ Visualize ])

This flow begins when the user clicks the primary **[ Visualize ]** button in the sidebar or runs the `debug-mentor.visualize` command.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Webview as Webview (app.ts)
    participant Provider as LinkedListViewProvider
    participant Compiler as CppCompiler
    participant SessionMgr as DebugSessionManager
    participant VSCodeDAP as VS Code Debug Host
    participant GDB as Native GDB / LLDB
    participant Tracker as DebugTrackerFactory
    participant Extractor as StateExtractor
    participant Explainer as ExplanationGenerator
    participant Snapshots as SnapshotManager

    User->>Webview: Clicks [ Visualize ]
    Webview->>Provider: postMessage({ command: 'visualize' })
    Provider->>Webview: postMessage({ command: 'status', text: 'Compiling source...' })
    Provider->>Compiler: compile(sourcePath)
    Compiler->>Compiler: g++ -g -O0 -std=c++17 -o .debug-mentor/binary.exe
    Compiler-->>Provider: CompileResult (executablePath)

    Provider->>Webview: postMessage({ command: 'status', text: 'Starting debugger...' })
    Provider->>SessionMgr: startDebugging(executablePath, sourcePath)
    SessionMgr->>VSCodeDAP: vscode.debug.startDebugging(config)
    VSCodeDAP->>GDB: Spawns GDB with MI mode & stopAtEntry: true
    GDB-->>VSCodeDAP: Pauses at entry point (main)
    VSCodeDAP->>Tracker: DAP event "stopped"
    Tracker->>Provider: onStopped({ session, threadId: 1, reason: 'entry' })

    Provider->>Extractor: extractState(session, threadId, stepNum: 1)
    Extractor->>Extractor: Scan source AST for pointer declarations & init lines
    Extractor->>VSCodeDAP: DAP stackTrace, scopes, variables
    VSCodeDAP->>GDB: Query local variables
    GDB-->>VSCodeDAP: Program at entry of main
    VSCodeDAP-->>Extractor: Locals
    Extractor->>Explainer: generate([], null, undefined, hasHead: false)
    Explainer-->>Extractor: "Program paused at main(). Click Next to execute: Node* head = nullptr;"
    Extractor-->>Provider: LinkedListSnapshot (step 1)

    Provider->>Snapshots: addSnapshot(snapshot)
    Provider->>Webview: postMessage({ command: 'updateState', snapshot, ... })
    Webview->>Webview: Render clean empty canvas with initial prompt
    Webview-->>User: Displays Screen 3 (Debugger Paused, Initial State)
```

---

## 2. Stepping Forward (Clicking [ Next ])

When the user wants to advance execution to see the next line of C++ execute:

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Webview as Webview (app.ts)
    participant Provider as LinkedListViewProvider
    participant Snapshots as SnapshotManager
    participant ExecCtrl as ExecutionController
    participant VSCodeDAP as VS Code Debug Host
    participant GDB as Native GDB / LLDB
    participant Tracker as DebugTrackerFactory
    participant Extractor as StateExtractor
    participant WebviewPhysics as Webview Physics & SVG

    User->>Webview: Clicks [ Next ]
    Webview->>Provider: postMessage({ command: 'next' })
    Provider->>Snapshots: canGoNextHistory()?
    alt Browsing Past History
        Snapshots-->>Provider: true (historical snapshots exist ahead)
        Provider->>Snapshots: nextHistory()
        Snapshots-->>Provider: snapshot
        Provider->>Webview: postMessage({ command: 'updateState', snapshot })
    else Live Debugging
        Snapshots-->>Provider: false (already at latest live step)
        Provider->>ExecCtrl: next()
        ExecCtrl->>VSCodeDAP: customRequest('next', { threadId: 1 })
        VSCodeDAP->>GDB: -exec-next
        GDB-->>GDB: Advances 1 line in C++ program
        GDB-->>VSCodeDAP: DAP event "stopped" (reason: "step")
        VSCodeDAP->>Tracker: onDidSendMessage({ event: "stopped" })
        Tracker->>Provider: onStopped({ session, threadId: 1 })

        Provider->>Extractor: extractState(session, threadId, stepNum)
        Extractor->>Extractor: Check declaration line thresholds & active pointers
        Extractor->>VSCodeDAP: Query locals & dereference pointers
        VSCodeDAP-->>Extractor: Evaluated node values & addresses
        Extractor-->>Provider: New LinkedListSnapshot

        Provider->>Snapshots: addSnapshot(newSnapshot)
        Provider->>Webview: postMessage({ command: 'updateState', newSnapshot })
        Webview->>WebviewPhysics: registerPhysicsBody & update springLinks
        WebviewPhysics->>WebviewPhysics: Run physics tick (damping, springs, repulsion)
        WebviewPhysics->>WebviewPhysics: Update SVG arrow paths
        WebviewPhysics-->>User: Smooth visual update with spring animation
    end
```

---

## 3. Webview Physics & Camera Loop

Inside the Webview (`webview/app.ts`), an autonomous animation and interaction loop handles node positioning and camera panning:

```mermaid
flowchart TD
    UpdateMsg["Incoming 'updateState' Message"] --> SetupBodies["Register Physics Bodies for Nodes & Badges"]
    SetupBodies --> SpringConfig["Configure Hookean Spring Links (restLength: 150, stiffness: 0.05)"]
    SpringConfig --> AnimLoop["wakePhysics() & requestAnimationFrame"]

    subgraph PhysicsTick ["Physics Simulation Step (16ms)"]
        ForceRepel["Compute Node-to-Node Repulsion"] --> ForceSpring["Compute Spring Attraction/Repulsion along Pointers"]
        ForceSpring --> DragConstraint["Apply Mouse Drag Constraints (if dragging)"]
        DragConstraint --> VelocityDamp["Apply Velocity Damping (friction: 0.82)"]
        VelocityDamp --> UpdateDOM["Update DOM (x, y) & Redraw SVG Arrow Paths"]
    end

    AnimLoop --> PhysicsTick
    PhysicsTick --> EnergyCheck{"Kinetic Energy > Threshold?"}
    EnergyCheck -- Yes --> AnimLoop
    EnergyCheck -- No --> SleepPhysics["Sleep Physics (Save CPU)"]

    subgraph CameraControls ["Pan & Zoom Camera"]
        RightClick["Right-Click / Middle / Space Drag"] --> UpdatePan["Update cameraPanX, cameraPanY"]
        Wheel["Mouse Wheel"] --> UpdateZoom["Zoom centered on cursor (0.35x - 2.5x)"]
        DblClick["Double-Click / ↺ Reset"] --> ResetCam["Reset to default (0, 0, 1.0)"]
        UpdatePan --> Transform["Apply CSS transform: translate(panX, panY) scale(zoom)"]
        UpdateZoom --> Transform
        ResetCam --> Transform
    end
```

---

## 4. Historical Navigation (Clicking [ Previous ])

When a student wants to see what the state was 2 steps ago:

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Webview as Webview (app.ts)
    participant Provider as LinkedListViewProvider
    participant Snapshots as SnapshotManager
    participant Editor as VS Code Active Editor
    participant WebviewApp as Webview DOM & Physics

    User->>Webview: Clicks [ Previous ]
    Webview->>Provider: postMessage({ command: 'prev' })
    Provider->>Snapshots: prev()
    Snapshots-->>Provider: historicalSnapshot (isHistorical: true)

    Provider->>Editor: Highlight source line with dashed blue border
    Provider->>Webview: postMessage({ command: 'updateState', snapshot, isHistorical: true })
    Webview->>WebviewApp: Render previous nodes & show "Viewing historical snapshot" banner
    WebviewApp-->>User: Historical state shown (GDB remains untouched!)
```

---

## 5. Reaching Program Completion & CRT Boundary Guard

When execution hits `return 0;` or the closing brace:

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant ExecCtrl as ExecutionController
    participant GDB as Native GDB / LLDB
    participant Extractor as StateExtractor
    participant Provider as LinkedListViewProvider
    participant Webview as Webview (app.ts)

    User->>ExecCtrl: Clicks [ Next ]
    ExecCtrl->>GDB: Step line
    GDB-->>Extractor: Stack Frame: return 0 or CRT startup/exit
    Extractor->>Extractor: Detects CRT / exit frame
    Extractor-->>Provider: Snapshot marked changeType: 'final' (keeps completed chain)
    Provider->>Provider: Sets canStepNext: false, canContinue: false
    Provider->>Webview: postMessage({ command: 'updateState', canStepNext: false, ... })
    Webview->>Webview: Disable Next button & show "Program execution finished."
    Webview-->>User: Completed linked list remains cleanly on screen for review!
```
