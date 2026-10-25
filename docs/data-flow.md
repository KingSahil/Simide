# Data Flow & Execution Lifecycles

This document traces the complete step-by-step lifecycle flows of **SimIDE**. Each flow is illustrated with a sequence diagram and accompanied by an easy-to-follow explanation.

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
    Extractor->>Extractor: Discover source declarations, structs & functions (currently regex)
    Extractor->>VSCodeDAP: DAP stackTrace, scopes, variables
    VSCodeDAP->>GDB: Query local variables
    GDB-->>VSCodeDAP: Program at entry of main
    VSCodeDAP-->>Extractor: Locals
    Extractor->>Explainer: generate([], null, undefined, hasHead: false)
    Explainer-->>Extractor: "Program paused at main(). Click Next to allocate and initialize..."
    Extractor-->>Provider: LinkedListSnapshot (step 1)

    Provider->>Snapshots: addSnapshot(snapshot)
    Provider->>Webview: postMessage({ command: 'updateState', snapshot, ... })
    Webview->>Webview: Render clean empty canvas with initial prompt
    Webview-->>User: Displays Screen 3 (Debugger Paused, Initial State)
```

---

## 2. Function Stepping & Traversal Flow (e.g. `printList`)

When execution steps into helper functions and loops across linked nodes:

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Webview as Webview (app.ts)
    participant Provider as LinkedListViewProvider
    participant ExecCtrl as ExecutionController
    participant GDB as Native GDB / LLDB
    participant Extractor as StateExtractor
    participant Explainer as ExplanationGenerator
    participant Terminal as Webview Terminal Card

    User->>Webview: Clicks [ Next ]
    Webview->>Provider: postMessage({ command: 'next' })
    Provider->>ExecCtrl: next()
    ExecCtrl->>GDB: Advance execution into printList()
    GDB-->>Extractor: Paused inside printList(Node* head)
    Extractor->>Extractor: Discovers current = head;
    Extractor->>GDB: Query current->data & current->next
    GDB-->>Extractor: current points to node_1 (data: 10)
    Extractor->>Extractor: Captures cout << current->data << " -> ";
    Extractor->>Explainer: generate(..., printedInStep: "10 -> ")
    Explainer-->>Extractor: "Pointer 'current' advanced to node containing 10. Printed: '10 -> '"
    Extractor-->>Provider: Snapshot with terminalOutput: "10 -> "
    Provider->>Webview: postMessage({ command: 'updateState', snapshot })
    Webview->>Terminal: Appends "10 -> " and auto-scrolls
    Webview->>Webview: Animates 'current' badge over node 10
    Webview-->>User: Visual pointer moves & terminal updates simultaneously!
```

---

## 3. Node Deletion & Bypassing Flow (`delete temp`)

When deleting a node in functions like `deleteNode(&head, key)`:

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant ExecCtrl as ExecutionController
    participant GDB as Native GDB / LLDB
    participant Extractor as StateExtractor
    participant Explainer as ExplanationGenerator
    participant Webview as Webview (app.ts)

    User->>ExecCtrl: Clicks [ Next ] (executes prev->next = temp->next)
    ExecCtrl->>GDB: Step line
    GDB-->>Extractor: Link bypassed: node 10 now points to node 30
    Extractor->>Explainer: Detects nextId changed from node_2 to node_3
    Explainer-->>Extractor: "Node containing 10 unlinked from node 20 and points to node 30 (bypassing node 20)."
    Extractor-->>Webview: Update diagram (node 20 is detached)

    User->>ExecCtrl: Clicks [ Next ] (executes delete temp)
    ExecCtrl->>GDB: Step line
    GDB-->>Extractor: Line contains "delete temp"
    Extractor->>Extractor: Records temp address in deletedAddresses
    Extractor->>Explainer: changeType: 'node_deleted'
    Explainer-->>Extractor: "Freed heap memory for node containing 20 ('temp') via delete."
    Extractor-->>Webview: Node 20 removed from physics simulation
    Webview-->>User: Node 20 disappears; surviving chain springs smoothly into alignment!
```

---

## 4. Webview D3 Physics & Camera Loop

Inside the Webview (`webview/app.ts`), an autonomous animation and interaction loop handles node positioning and camera panning:

```mermaid
flowchart TD
    UpdateMsg["Incoming 'updateState' Message"] --> SetupBodies["Register D3 Force Bodies for Nodes & Badges"]
    SetupBodies --> LinkConfig["Filter validLinks (source & target in active map)"]
    LinkConfig --> ForceInit["initOrUpdateSimulation(nodes, validLinks)"]

    subgraph SimulationForces ["D3 Force System"]
        Charge["d3.forceManyBody().strength(-400) (Repulsion)"]
        Link["d3.forceLink(validLinks).distance(160) (Springs)"]
        Center["d3.forceCenter() (Centering)"]
        Charge --> SimulationTick["Tick Event: Update DOM (x, y) & Redraw SVG Arrows"]
        Link --> SimulationTick
        Center --> SimulationTick
    end

    ForceInit --> SimulationForces

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

## 5. Historical Navigation (Clicking [ Previous ])

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
    Webview->>WebviewApp: Render previous nodes, rewind terminal text & show banner
    WebviewApp-->>User: Historical state shown (GDB remains untouched!)
```

---

## 6. Binary Search Tree (BST) Traversal & Visiting Node Flow

When running recursive traversals (such as `inorder(root)` or `caseA` deletions) on a Binary Search Tree:

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant ExecCtrl as ExecutionController
    participant GDB as Native GDB / LLDB
    participant Extractor as StateExtractor
    participant Explainer as ExplanationGenerator
    participant Webview as Webview (app.ts)

    User->>ExecCtrl: Clicks [ Next ]
    ExecCtrl->>GDB: Step line inside inorder(TreeNode* root)
    GDB-->>Extractor: Paused at cout << root->data << " ";
    Extractor->>Extractor: Detects active tree structure (left & right pointers)
    Extractor->>Extractor: BFS traverseTree() collects all tree nodes from root
    Extractor->>Extractor: Calculates in-order columns (treeColumn) & depth levels (treeDepth)
    Extractor->>Extractor: Marks current node as isVisiting = true
    Extractor->>Extractor: Captures cout output "20 "
    Extractor->>Explainer: changeType: 'tree_traversal_visit'
    Explainer-->>Extractor: "Visiting node containing 20 during inorder traversal. Printed: '20 '"
    Extractor-->>Webview: Snapshot with structureType: 'tree', nodes with treeColumn/treeDepth
    Webview->>Webview: Applies .tree-node-card.visiting green pulse animation
    Webview->>Webview: Clips SVG branch arrows to node perimeter via getCirclePerimeterIntersection()
    Webview-->>User: Visiting node pulses green as terminal prints value!
```

---

## 7. Circular Queue Multi-Frame Stepping & Wrap-Around Lifecycle

When executing circular queue operations (`enqueue`, `dequeue`, `wrap-around`) across member functions:

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant ExecCtrl as ExecutionController
    participant GDB as Native GDB / LLDB
    participant Extractor as StateExtractor
    participant Explainer as ExplanationGenerator
    participant Webview as Webview (app.ts)

    User->>ExecCtrl: Clicks [ Next ]
    ExecCtrl->>GDB: Step into q.enqueue(60)
    GDB-->>Extractor: Paused inside CircularQueue::enqueue(val=60)
    Extractor->>Extractor: Evaluates front, rear across call stack frames (this->rear, q.rear)
    Extractor->>Extractor: Rear advances: rear = (4 + 1) % 5 = 0
    Extractor->>Extractor: Detects wrap event (rear wrapped from 4 to 0)
    Extractor->>Explainer: changeType: 'queue_wrap'
    Explainer-->>Extractor: "↺ Circular Queue Wrap-Around! Rear wrapped around... Enqueued 60 at front index 0!"
    Extractor-->>Webview: Snapshot with structureType: 'queue', front: 2, rear: 0, capacity: 5
    Webview->>Webview: Renders FRONT pill at [2] and REAR pill at [0]
    Webview-->>User: Displays real-time wrap-around with persistent pointer pills!
```

---

## 8. Multi-File Switching Lifecycle

When switching between different C++ source files (e.g. from `linked-list.cpp` to `circular-queue.cpp`):

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant VSCode as VS Code Editor Window
    participant Provider as LinkedListViewProvider
    participant Compiler as CppCompiler
    participant Webview as Webview UI

    User->>VSCode: Clicks tab: circular-queue.cpp
    VSCode->>Provider: onDidChangeActiveTextEditor(editor)
    Provider->>Compiler: setLastActiveSourceFile(circular-queue.cpp)
    Note over Provider: Deliberately does NOT call showTextDocument<br/>(avoids redirect loop back to previous tab!)
    
    User->>Webview: Clicks [ Visualize ]
    Webview->>Provider: postMessage({ command: 'visualize' })
    Provider->>Compiler: resolveSourceFile() -> circular-queue.cpp
    Provider->>VSCode: vscode.commands.executeCommand('workbench.action.closePanel')
    Note over VSCode: Dismisses bottom terminal panel for clean canvas
    Provider->>Compiler: compile(circular-queue.cpp)
    Compiler-->>Provider: .debug-mentor/circular-queue.exe
    Provider->>Webview: Starts Circular Queue visualization session cleanly!
```
