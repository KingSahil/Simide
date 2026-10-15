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
│   │   └── stateExtractor.ts        # Dynamic pointer discovery, multi-function & terminal tracing
│   ├── visualization/
│   │   ├── linkedListModel.ts       # TypeScript interfaces (ListNode, PointerVariable, Snapshot)
│   │   ├── explanationGenerator.ts  # Pedagogical rule engine generating plain explanations
│   │   └── snapshotManager.ts       # Time-travel buffer & history scrubbing engine
│   └── sidebar/
│       ├── linkedListViewProvider.ts# WebviewViewProvider, IPC dispatcher & editor decorator
│       └── messages.ts              # Strongly typed message contracts between extension & UI
├── webview/
│   ├── index.html                   # Sidebar HTML template with terminal & canvas
│   ├── styles.css                   # Dark mode design tokens, dot-grid canvas & terminal styling
│   └── app.ts                       # D3 force physics simulation, pan/zoom camera & live terminal
├── test/
│   ├── mockVscode.ts                # Standalone mock implementation of vscode API
│   ├── runTests.ts                  # Unit & integration tests for compiler, model, GFG & LeetCode
│   ├── gdbExecution.test.ts         # Real GDB stepping & LeetCode 206 reversal headless tests
│   └── runAll.js                    # Test bundle builder & orchestrator
├── examples/
│   ├── linked-list.cpp              # Singly linked list with printList traversal
│   ├── leetcode-206-reverse.cpp     # LeetCode 206 in-place three-pointer reversal
│   ├── gfg-push-delete.cpp          # GeeksforGeeks push(&head_ref) and deleteNode
│   └── oop-linked-list.cpp          # Object-Oriented C++ class LinkedList
├── esbuild.js                       # Fast build script bundling extension and webview
└── package.json                     # Extension manifest, commands & dependencies
```

---

## 1. Extension Core

### [`src/extension.ts`](file:///c:/Projects/vscode-extension/src/extension.ts)
* **What it does**: The entry point registered in `package.json` (`main: "./dist/extension.js"`).
* **Key Responsibilities**:
  1. Instantiates [`LinkedListViewProvider`](file:///c:/Projects/vscode-extension/src/sidebar/linkedListViewProvider.ts#L13) and registers it with `vscode.window.registerWebviewViewProvider`.
  2. Sets `retainContextWhenHidden: true` so the webview preserves its diagram, camera pan/zoom offsets, physics state, terminal output, and memory nodes even if the user temporarily switches tabs or collapses the sidebar.
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
  - **Output Sandboxing**: Places executables in a `.debug-mentor/` directory inside the source file's folder.
  - **Flag Selection**: Compiles with `-g -O0 -std=c++17`. Disabling optimization (`-O0`) guarantees that local node pointers are not optimized away into CPU registers.
  - **Windows Executable Lock Handling**: On Windows, running binaries cannot be overwritten if still held open by GDB. `CppCompiler` checks if the output file is locked; if locked, it generates a timestamped alternative (`linked-list_1792051440937.exe`) to prevent compiler crashes.

### [`src/debug/debugSessionManager.ts`](file:///c:/Projects/vscode-extension/src/debug/debugSessionManager.ts)
* **What it does**: Finds the native debugger and configures VS Code's `cppdbg` debug adapter.
* **Key Features**:
  - **Debugger Discovery**: Looks in system PATH and common installation directories (MinGW-w64, MSYS2, LLVM) for `gdb.exe` or `lldb.exe`.
  - **Dynamic Launch Configuration**: Generates a runtime `vscode.DebugConfiguration` object with `stopAtEntry: true` and `-enable-pretty-printing`.
  - **`suppressDebugView: true`**: Launches debugging without aggressively forcing open the default VS Code Call Stack / Breakpoints sidebars, keeping user focus on SimIDE's simulation.

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
* **What it does**: The central inspection engine. Extracts variables, resolves structs, tracks multi-function call stacks, emulates terminal output, and manages memory lifetimes.
* **Extraction Pipeline**:
  1. **Multi-Function Stack Frame Inspection**: Identifies user-defined functions (`printList`, `reverseList`, `deleteNode`, OOP methods) versus CRT internal routines.
  2. **Struct & Field Discovery**: Automatically discovers data fields (`data`, `val`) and pointer fields (`next`) across standard and custom struct definitions.
  3. **Declaration Line Thresholding**: Ignores variables whose declaration line has not yet executed.
  4. **Pointer Translation**: Reads memory addresses, checks for null (`0x0`, `nullptr`), and maps valid addresses to stable node IDs (`node_1`, `node_2`).
  5. **Chain Traversal & Detached Detection**: Traverses chains from `head` as well as disconnected pointer variables.
  6. **Memory Deallocation Tracking**: Detects heap deallocations via `delete` statements, recording freed addresses in `deletedAddresses`.
  7. **Terminal Output Emulation**: Evaluates `cout` and `printf` statements in real time, appending output to `accumulatedTerminalOutput`.

---

## 3. Visualization Subsystem (`src/visualization/`)

### [`src/visualization/linkedListModel.ts`](file:///c:/Projects/vscode-extension/src/visualization/linkedListModel.ts)
* **What it does**: Defines pure data models used across the extension and webview.
* **Core Interfaces**:
  - `ChangeType`:
    ```typescript
    export type ChangeType =
      | 'init'
      | 'node_created'
      | 'head_assigned'
      | 'node_linked'
      | 'node_bypassed'
      | 'node_deleted'
      | 'pointer_moved'
      | 'print'
      | 'step'
      | 'final';
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
      terminalOutput?: string;
      printedInStep?: string;
      isHistorical?: boolean;
    }
    ```

### [`src/visualization/explanationGenerator.ts`](file:///c:/Projects/vscode-extension/src/visualization/explanationGenerator.ts)
* **What it does**: A pedagogical teacher in code. Generates natural, understandable explanations for every mutation.
* **Key Handlers**:
  - **Node Creation**: *"first pointer created, pointing to a new Node containing 10."*
  - **Head Assignment & Aliasing**: *"head points to the node containing 10 (aliasing pointer 'first' at address 0x74a3b0)."*
  - **Linking**: *"The node containing 10 now points to the node containing 20."*
  - **Node Bypassed**: *"Node containing 10 unlinked from node 20 and now points directly to node 30 (bypassing node 20)."*
  - **Node Deleted**: *"Freed heap memory for node containing 20 ('second') via delete."*
  - **Pointer Traversal**: *"Pointer 'curr' advanced to node containing 20."*
  - **Terminal Output**: *"Printed to terminal: "10 -> ". Program output: 10 -> "*

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
  1. Header: Brand title (`SimIDE`), session badge (`Idle`, `Running`, `Paused`), and Restart button.
  2. Initial View: Hero icon, tagline, and `[ Visualize ]` button.
  3. Loading View: Animated spinner and progress messages.
  4. Active View:
     - Card header with `↺ Reset` layout button and step chip.
     - Canvas hint indicating drag-and-drop capability.
     - `.graph-viewport` containing `.graph-canvas`, `.arrows-svg-layer`, and `.nodes-layer`.
     - **Program Output Terminal Card**: Live-streams stdout text with a clear button.
     - Pedagogical explanation card with historical review banner.
     - Controls container with `Previous` and `Next` buttons.
  5. Error View: Diagnostic title, scrollable error log, and `[ Retry ]` button.

### [`webview/styles.css`](file:///c:/Projects/vscode-extension/webview/styles.css)
* **What it does**: Dark-mode design system, dot-grid canvas, and terminal styling.
* **Design Principles**:
  - Color palette matches VS Code's dark theme: Background `#0D1117`, Cards `#151B23`, Borders `#2A3441`.
  - Terminal styling: Monospace font, dark elevated background, scrollable console output.
  - Dot-grid viewport: `radial-gradient(#202936 1.2px, transparent 1.2px)` with 16px grid spacing.
  - Zero scrollbars on viewport with intuitive grab/grabbing cursors.

### [`webview/app.ts`](file:///c:/Projects/vscode-extension/webview/app.ts)
* **What it does**: Client-side rendering, D3 force physics simulation, terminal output updater, and infinite canvas camera.
* **Key Features**:
  - **D3 Force Simulation**: Uses `d3.forceManyBody()`, `d3.forceLink()`, and `d3.forceCenter()` to maintain natural spacing between nodes and badges.
  - **Link Filtering**: Ensures only links between currently active physics bodies are passed to the simulation (`validLinks`), preventing D3 crash edge-cases during deletions.
  - **Live Terminal Updates**: Updates `#terminalText` live with auto-scrolling to bottom.
  - **Infinite Pan/Zoom Camera**:
    - **Pan**: Right-Click Drag, Middle-Click Drag, or Space + Left-Click Drag.
    - **Zoom**: Mouse wheel zooms smoothly centered on the cursor position (range: 0.35x to 2.5x).
    - **Reset**: Double-click canvas or click `↺ Reset` to return to default scale and origin.
