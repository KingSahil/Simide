# Component Deep-Dive

This document provides a component-by-component tour of the codebase. Each file's purpose, design decisions, public methods, and relationships are explained in clear, approachable language.

---

## Codebase Map

```
c:\Projects\vscode-extension\
├── src/
│   ├── extension.ts                 # Main extension activator & command registrar
│   ├── debug/
│   │   ├── compiler.ts              # C++ compiler detection, build runner & file lock safety
│   │   ├── debugSessionManager.ts   # Debugger discovery & cppdbg launch configuration
│   │   ├── debugAdapterTracker.ts   # DAP message listener for stopped/continued events
│   │   ├── executionController.ts   # Stepping, continuing & pausing operations
│   │   └── stateExtractor.ts        # Dynamic pointer discovery, memory inspection & CRT guards
│   ├── visualization/
│   │   ├── linkedListModel.ts       # TypeScript interfaces (ListNode, PointerVariable, Snapshot)
│   │   ├── explanationGenerator.ts  # Pedagogical rule engine generating plain explanations
│   │   └── snapshotManager.ts       # Time-travel buffer & history scrubbing engine
│   └── sidebar/
│       ├── linkedListViewProvider.ts# WebviewViewProvider, IPC dispatcher & editor decorator
│       └── messages.ts              # Strongly typed message contracts between extension & UI
├── webview/
│   ├── index.html                   # Sidebar HTML template
│   ├── styles.css                   # Dark mode design tokens, dot-grid canvas & typography
│   └── app.ts                       # Physics simulation engine, pan/zoom camera & SVG renderer
├── test/
│   ├── mockVscode.ts                # Standalone mock implementation of vscode API
│   ├── runTests.ts                  # Unit & integration tests for compiler, model & history
│   ├── gdbExecution.test.ts         # Real GDB stepping & state extraction headless test
│   └── runAll.js                    # Test bundle builder & orchestrator
├── esbuild.js                       # Fast build script bundling extension and webview
└── package.json                     # Extension manifest, commands & dependencies
```

---

## 1. Extension Core

### [`src/extension.ts`](file:///c:/Projects/vscode-extension/src/extension.ts)
* **What it does**: The entry point registered in `package.json` (`main: "./dist/extension.js"`).
* **Key Responsibilities**:
  1. Instantiates [`LinkedListViewProvider`](file:///c:/Projects/vscode-extension/src/sidebar/linkedListViewProvider.ts#L13) and registers it with `vscode.window.registerWebviewViewProvider`.
  2. Sets `retainContextWhenHidden: true` so the webview preserves its diagram, camera pan/zoom offsets, physics state, and memory nodes even if the user temporarily switches tabs or collapses the sidebar.
  3. Registers the [`DebugTrackerFactory`](file:///c:/Projects/vscode-extension/src/debug/debugAdapterTracker.ts#L18) globally using `vscode.debug.registerDebugAdapterTrackerFactory('*', trackerFactory)`.
  4. Listens for debug session lifecycle events (`onDidStartDebugSession`, `onDidTerminateDebugSession`).
  5. Registers user commands:
     - `debug-mentor.visualize`: Focuses the sidebar and starts compilation/launch.
     - `debug-mentor.next`: Steps forward one line in C++.
     - `debug-mentor.prev`: Steps backward in time-travel history.
     - `debug-mentor.restart`: Restarts the debugging session.

---

## 2. Debug Subsystem (`src/debug/`)

### [`src/debug/compiler.ts`](file:///c:/Projects/vscode-extension/src/debug/compiler.ts)
* **What it does**: Compiles user C++ source files safely into native executables.
* **Key Features**:
  - **Compiler Discovery**: Searches system PATH for `g++`, `clang++`, or `gcc`.
  - **Output Sandboxing**: Places executables in a `.debug-mentor/` directory inside the source file's folder, keeping the user's workspace tidy.
  - **Flag Selection**: Compiles with `-g -O0 -std=c++17`. Disabling optimization (`-O0`) guarantees that local node pointers are not optimized away into CPU registers.
  - **Windows Executable Lock Handling**: On Windows, running binaries cannot be overwritten if still held open by GDB. `CppCompiler` checks if the output file is locked; if locked, it generates a timestamped alternative (`linked-list_1792051440937.exe`) to prevent compiler crashes.

### [`src/debug/debugSessionManager.ts`](file:///c:/Projects/vscode-extension/src/debug/debugSessionManager.ts)
* **What it does**: Finds the native debugger and configures VS Code's `cppdbg` debug adapter.
* **Key Features**:
  - **Debugger Discovery**: Looks in system PATH and common installation directories (MinGW-w64, MSYS2, LLVM) for `gdb.exe` or `lldb.exe`.
  - **Dynamic Launch Configuration**: Generates a runtime `vscode.DebugConfiguration` object with `stopAtEntry: true` and `-enable-pretty-printing`.
  - **`suppressDebugView: true`**: Launches debugging without aggressively forcing open the default VS Code Call Stack / Breakpoints sidebars, keeping user focus on the Debug Mentor visualization.

### [`src/debug/debugAdapterTracker.ts`](file:///c:/Projects/vscode-extension/src/debug/debugAdapterTracker.ts)
* **What it does**: Intercepts the raw Debug Adapter Protocol (DAP) JSON messages flowing between VS Code and GDB.
* **Listeners exposed**:
  - `onStopped(listener)`: Called whenever the C++ program pauses at a line. Passes the `threadId` and pause reason.
  - `onContinued(listener)`: Called when the program resumes execution.
  - `onTerminated(listener)`: Called when the program finishes or exits `main()`.

### [`src/debug/executionController.ts`](file:///c:/Projects/vscode-extension/src/debug/executionController.ts)
* **What it does**: Exposes clean async stepping commands.
* **Methods**:
  - `next()`: Steps over the current line using DAP `session.customRequest('next', { threadId })` with a fallback to `workbench.action.debug.stepOver`.
  - `stepIn()`, `stepOut()`, `continue()`, `pause()`.
  - **Safety Lock**: Sets `isOperating = true` during steps to prevent rapid-click race conditions from corrupting debugger state.

### [`src/debug/stateExtractor.ts`](file:///c:/Projects/vscode-extension/src/debug/stateExtractor.ts)
* **What it does**: The central inspection engine. When GDB pauses, this class extracts variables, discovers pointer declarations, and unrolls memory links.
* **Extraction Pipeline**:
  1. **CRT & Boundary Guard**: Checks if the active frame is in CRT startup/exit or outside `main()`. If so, preserves the completed snapshot and marks `changeType: 'final'` to prevent diagram flickering.
  2. **Dynamic Pointer Discovery**: Reads source code and extracts all variable declarations matching `(?:Node\s*\*|auto\s*\*?)\s*([a-zA-Z_][a-zA-Z0-9_]*)`.
  3. **Declaration Line Thresholding**: Ignores variables whose declaration line has not yet executed. If `head` has not executed its declaration line, returns a clean initial state.
  4. **Stack Frame Inspection**: Queries DAP `stackTrace`, `scopes`, and `variables`.
  5. **Pointer Translation**: Reads memory addresses, checks for null (`0x0`, `nullptr`), and maps valid addresses to stable node IDs (`node_1`, `node_2`).
  6. **Reachable Chain Traversal**: Follows `head` through its `next` pointers to form the connected list.
  7. **Detached Node Detection**: Finds local pointer variables that point to allocated nodes that are not yet reachable from `head`.
  8. **Active Pointer Collection**: Assembles all pointer variables currently in scope into a `PointerVariable[]` list with target node IDs and alias tracking.

---

## 3. Visualization Subsystem (`src/visualization/`)

### [`src/visualization/linkedListModel.ts`](file:///c:/Projects/vscode-extension/src/visualization/linkedListModel.ts)
* **What it does**: Defines pure data models used across the extension and webview.
* **Core Interfaces**:
  - `PointerVariable`:
    ```typescript
    export interface PointerVariable {
      name: string;               // e.g. "head", "first", "curr"
      targetNodeId: string | null;// e.g. "node_1" or null
      targetAddress?: string | null;
      isNull: boolean;
    }
    ```
  - `ListNode`:
    ```typescript
    export interface ListNode {
      id: string;               // e.g. "node_1"
      address?: string;         // e.g. "0x74a3b0"
      data: number | string;    // e.g. 10
      nextId: string | null;    // e.g. "node_2" or null
      isHead: boolean;          // true if pointed to by head
      isDetached: boolean;      // true if allocated but not in head chain
      isNewlyCreated?: boolean;
    }
    ```
  - `LinkedListSnapshot`:
    ```typescript
    export interface LinkedListSnapshot {
      stepNumber: number;
      source?: SourceLocation;
      hasHead: boolean;
      headId: string | null;
      nodes: ListNode[];
      pointers?: PointerVariable[];
      explanation: string;
      changeType: ChangeType;
      isHistorical?: boolean;
    }
    ```

### [`src/visualization/explanationGenerator.ts`](file:///c:/Projects/vscode-extension/src/visualization/explanationGenerator.ts)
* **What it does**: A pedagogical teacher in code. Generates natural, understandable explanations for each mutation.
* **How it works**:
  - Evaluates snapshot differences and active pointers:
    - Pre-head: *"Program paused at main(). Click Next to execute: Node* head = nullptr;"*
    - Empty list: *"head is initialized to nullptr. The linked list is currently empty."*
    - Detached allocation: *"`first` pointer created, pointing to a new Node containing 10. head is still null."*
    - Head assignment / aliasing: *"head points to the node containing 10 (aliasing pointer 'first' at address 0x74a3b0)."*
    - Pointer linking: *"The node containing 10 now points to the node containing 20."*
    - Chain complete: *"The linked list is complete: head → 10 → 20 → 30 → nullptr."*

### [`src/visualization/snapshotManager.ts`](file:///c:/Projects/vscode-extension/src/visualization/snapshotManager.ts)
* **What it does**: Stores an append-only list of every `LinkedListSnapshot`.
* **Methods**:
  - `addSnapshot(snap)`: Records a new step and sets `currentIndex` to latest.
  - `canGoPrev()`: Returns `true` if `currentIndex > 0`.
  - `prev()`: Decrements `currentIndex` and returns the snapshot with `isHistorical: true`.
  - `canGoNextHistory()`: Returns `true` if currently looking at past history and forward steps exist.
  - `nextHistory()`: Moves forward toward live execution.

---

## 4. Sidebar & IPC Subsystem (`src/sidebar/`)

### [`src/sidebar/linkedListViewProvider.ts`](file:///c:/Projects/vscode-extension/src/sidebar/linkedListViewProvider.ts)
* **What it does**: Bridges the VS Code extension host with the Webview HTML UI.
* **Key Features**:
  - Sets active source file in `StateExtractor`.
  - Guards against overstepping: if `changeType === 'final'`, disables **Next** and **Continue** to prevent entering C runtime cleanup routines.
  - Injects compiled `webview.js` and `webview.css` bundles into `webview.html`.
  - Dispatches `postMessage` calls with `ExtensionMessage` types.
  - Handles incoming user button clicks (`visualize`, `next`, `prev`, `restart`, `retry`).
  - **Historical Line Highlighting**: When navigating past snapshots, decorates the relevant source code line in the VS Code editor using a blue dashed border.

### [`src/sidebar/messages.ts`](file:///c:/Projects/vscode-extension/src/sidebar/messages.ts)
* **What it does**: Discriminated union types defining all IPC communication between Extension and Webview (`WebviewMessage` and `ExtensionMessage`).

---

## 5. Webview UI & Physics Layer (`webview/`)

### [`webview/index.html`](file:///c:/Projects/vscode-extension/webview/index.html)
* **What it does**: Sidebar DOM structure.
* **Key Sections**:
  1. Header: Brand title, session badge (`Idle`, `Running`, `Paused`), and Restart button.
  2. Initial View: Hero icon, tagline, and `[ Visualize ]` button.
  3. Loading View: Animated spinner and progress messages.
  4. Active View:
     - Card header with `↺ Reset` layout button and step chip.
     - Canvas hint indicating drag-and-drop capability.
     - `.graph-viewport` containing `.graph-canvas`, `.arrows-svg-layer`, and `.nodes-layer`.
     - Pedagogical explanation card with historical review banner.
     - Controls container with `Previous` and `Next` buttons.
  5. Error View: Diagnostic title, scrollable error log, and `[ Retry ]` button.

### [`webview/styles.css`](file:///c:/Projects/vscode-extension/webview/styles.css)
* **What it does**: Dark-mode design system and canvas styles.
* **Design Principles**:
  - Color palette matches VS Code's dark theme: Background `#0D1117`, Cards `#151B23`, Borders `#2A3441`.
  - Dot-grid viewport: `radial-gradient(#202936 1.2px, transparent 1.2px)` with 16px grid spacing.
  - Zero scrollbars: Viewport uses `overflow: hidden` and custom pan/zoom instead of clunky browser scrollbars.
  - Grab/grabbing cursors during node dragging and canvas panning.

### [`webview/app.ts`](file:///c:/Projects/vscode-extension/webview/app.ts)
* **What it does**: Client-side rendering, spring-damper physics, and infinite canvas camera.
* **Key Features**:
  - **Spring-Damper Physics Engine**: Uses physical particles (`registerPhysicsBody`), hookean springs (`springLinks`), velocity damping, and repulsion to keep nodes naturally spaced.
  - **SVG Pointer Generation**: Calculates bounding boxes of node cards and dynamically generates crisp SVG paths with arrowheads pointing from `next` fields to target nodes.
  - **Interactive Drag-and-Drop**: Users can click and drag any node card; connecting springs react live.
  - **Infinite Pan/Zoom Camera**:
    - **Pan**: Right-Click Drag, Middle-Click Drag, or Space + Left-Click Drag.
    - **Zoom**: Mouse wheel zooms smoothly centered on the cursor position (range: 0.35x to 2.5x).
    - **Reset**: Double-click canvas or click `↺ Reset` to return to default scale and origin.
