# Component Deep-Dive

This document provides a component-by-component tour of the codebase. Each file's purpose, design decisions, public methods, and relationships are explained in clear, approachable language.

---

```
Simide/
├── src/
│   ├── extension.ts                 # Main extension activator & command registrar
│   ├── ai/
│   │   ├── aiService.ts             # Multi-provider LLM client (Gemini, OpenAI, Ollama), prompt builder
│   │   └── secretManager.ts         # Encrypted API key storage via VS Code SecretStorage
│   ├── creative/
│   │   └── creativeCodeManager.ts   # Bidirectional visual-to-code sync (Lists, Stacks, Queues, Strings)
│   ├── debug/
│   │   ├── compiler.ts              # C++ compiler detection, build runner & file lock safety
│   │   ├── debugSessionManager.ts   # Debugger discovery & cppdbg launch configuration
│   │   ├── debugAdapterTracker.ts   # DAP message listener for stopped/continued events
│   │   ├── executionController.ts   # Stepping, continuing & pausing operations
│   │   └── stateExtractor.ts        # Dynamic pointer discovery, multi-function & terminal tracing
│   ├── parser/
│   │   └── clangAstParser.ts        # Clang AST inspection for struct models and variable scopes
│   ├── tutorial/
│   │   ├── tutorialManager.ts       # GitHub tarball downloader, path sanitizer, lesson manager
│   │   └── tutorialModel.ts         # simide.json manifest schema validation & security auditing
│   ├── cli/
│   │   └── validator.ts             # CLI validator for standalone tutorial authors (bin/simide.js)
│   ├── visualization/
│   │   ├── linkedListModel.ts       # TypeScript interfaces (ListNode, Stack, Queue, String, Graph)
│   │   ├── explanationGenerator.ts  # Pedagogical rule engine generating plain explanations
│   │   └── snapshotManager.ts       # Time-travel buffer & history scrubbing engine
│   └── sidebar/
│       ├── linkedListViewProvider.ts# WebviewViewProvider, IPC dispatcher & editor decorator
│       └── messages.ts              # Strongly typed message contracts between extension & UI
├── webview/
│   ├── index.html                   # Sidebar HTML template with AI drawer, settings modal, canvas
│   ├── styles.css                   # Glassmorphic dark mode styling, typography, canvas tokens
│   └── app.ts                       # D3 force physics, audio TTS, auto-play, AI assistant client
├── test/                            # 19 standalone & integration test suites (GDB, AI, strings, etc.)
├── examples/                        # Reference C++ DSA algorithms (lists, trees, arrays, stacks, strings)
├── esbuild.js                       # Fast build script bundling extension, webview, and CLI validator
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
  - **Active Editor File Tracking**: Exposes `setLastActiveSourceFile()`, `getLastActiveSourceFile()`, and `resolveSourceFile()`. When switching between files (e.g. `linked-list.cpp` and `bst-traversals.cpp`), it dynamically inspects `vscode.window.activeTextEditor` and `vscode.window.visibleTextEditors` to compile whichever file the user is currently working on.

### [`src/debug/debugSessionManager.ts`](file:///c:/Projects/vscode-extension/src/debug/debugSessionManager.ts)
* **What it does**: Finds the native debugger and configures VS Code's `cppdbg` debug adapter.
* **Key Features**:
  - **Debugger Discovery**: Looks in system PATH and common installation directories (MinGW-w64, MSYS2, LLVM) for `gdb.exe` or `lldb.exe`.
  - **Dynamic Launch Configuration**: Generates a runtime `vscode.DebugConfiguration` object with `stopAtEntry: true` and `-enable-pretty-printing`.
  - **Distraction-Free Launch**: Sets `suppressDebugView: true` and `internalConsoleOptions: 'neverOpen'`, preventing VS Code's Call Stack sidebar and internal Debug Console from aggressively stealing focus.

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
  1. **Multi-Function Stack Frame Inspection**: Identifies user-defined functions (`printList`, `reverseList`, `push`, `pop`, `enqueue`, `dequeue`, `deleteNode`, `insert`, `inorder`, OOP methods) versus CRT internal routines.
  2. **Struct & Field Discovery**: Automatically discovers data fields (`data`, `val`), pointer fields (`next` for lists, `left` and `right` for trees), and member elements for stack/queue buffers (`arr`, `items`, `data`).
  3. **Structure Type Detection**: Detects structure type dynamically:
     - `'tree'`: Struct contains `left` and `right` pointer fields.
     - `'stack'`: Name/type indicates stack (has `top`, `push`, `pop`).
     - `'queue'`: Name/type indicates queue (has `front`, `rear`, `enqueue`, `dequeue`, `count`).
     - `'array'`: Direct array declaration (`int arr[5]`, `int* arr = new int[5]`).
     - `'linked_list'`: Pointer chain with `next` pointers.
  4. **Multi-Frame Evaluation for Stack & Queue**: In `extractStackState` and `extractQueueState`, walks up the call stack frames (`frameIdsToTry`), ensuring member variables (`this->front`, `this->top`) or object members (`q.front`, `s.top`) resolve accurately whether stopped in `main()` or stepped inside helper methods.
  5. **Continuous Queue Pointer Preservation**: Does not wipe `front` or `rear` to `-1` when `size == 0`, preserving their active slot positions throughout execution.
  6. **Uninitialized Stack Pointer Protection**: Validates `rawLine > declLine` and enforces `hasSteppedPastFirstPointerDecl` so uninitialized stack garbage is never parsed as real nodes on Step 1.
  7. **Pointer Translation**: Reads memory addresses, checks for null (`0x0`, `nullptr`), and maps valid addresses to stable node IDs (`node_1`, `node_2`).
  8. **Tree Topology & In-Order Column Calculation**: For trees, executes BFS `traverseTree(rootAddr)` to harvest all reachable nodes, measures `treeDepth`, and applies in-order traversal to calculate deterministic `treeColumn` positions.
  9. **Recursive Stack Frame Root Resolution**: In recursive functions, looks up caller frames if the current frame receives a by-value `nullptr` parameter, preventing the tree root from vanishing.
  10. **GDB Error String Filtering**: Filters out internal GDB error responses (such as `-var-create: unable to create variable object`) from being parsed as integer values.
  11. **Memory Deallocation Tracking**: Detects heap deallocations via `delete` statements, recording freed addresses in `deletedAddresses` (supporting both linked-list node deletions and BST Case A deletions).
  12. **Terminal Output Emulation**: Evaluates `cout` and `printf` statements in real time, appending output to `accumulatedTerminalOutput`.

---

## 3. Visualization Subsystem (`src/visualization/`)

### [`src/visualization/linkedListModel.ts`](file:///c:/Projects/vscode-extension/src/visualization/linkedListModel.ts)
* **What it does**: Defines pure data models used across the extension and webview.
* **Core Interfaces**:
  - `StructureType`: `'linked_list' | 'tree' | 'array' | 'stack' | 'queue'`.
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
      | 'final'
      | 'tree_root_assigned'
      | 'tree_node_created'
      | 'tree_child_linked'
      | 'tree_traversal_visit'
      | 'array_initialized'
      | 'array_element_updated'
      | 'array_element_swapped'
      | 'array_pointer_moved'
      | 'stack_push'
      | 'stack_pop'
      | 'stack_peek'
      | 'stack_initialized'
      | 'queue_enqueue'
      | 'queue_dequeue'
      | 'queue_front'
      | 'queue_rear'
      | 'queue_wrap'
      | 'queue_initialized';
    ```
  - `StackModel` & `QueueModel`:
    ```typescript
    export interface StackModel {
      name: string;
      elements: StackElement[];
      topIndex: number;
      capacity: number;
      activeMethod?: 'push' | 'pop' | 'peek' | 'init' | null;
      methodParam?: number | string;
      isOverflow?: boolean;
      isUnderflow?: boolean;
    }

    export interface QueueModel {
      name: string;
      slots: QueueSlot[];
      front: number;
      rear: number;
      capacity: number;
      size: number;
      isCircular: boolean;
      justWrapped?: boolean;
      activeMethod?: 'enqueue' | 'dequeue' | 'front' | 'rear' | 'init' | null;
      methodParam?: number | string;
      isOverflow?: boolean;
      isUnderflow?: boolean;
    }
    ```
  - `ListNode`:
    ```typescript
    export interface ListNode {
      id: string;
      value: number | string;
      address: string;
      nextId: string | null;
      // Tree extensions:
      leftId?: string | null;
      rightId?: string | null;
      treeDepth?: number;
      treeColumn?: number;
      isRoot?: boolean;
      isVisiting?: boolean;
    }
    ```
  - `LinkedListSnapshot`:
    ```typescript
    export interface LinkedListSnapshot {
      stepNumber: number;
      source?: SourceLocation;
      hasHead: boolean;
      headId: string | null;
      structureType?: StructureType;
      nodes: ListNode[];
      pointers?: PointerVariable[];
      arrays?: ArrayVariable[];
      indexPointers?: IndexPointer[];
      stack?: StackModel;
      queue?: QueueModel;
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
  - **Head / Root Assignment**: *"head points to the node containing 10."* or *"Assigned node containing 50 as the root of the Binary Search Tree."*
  - **Linking**: *"The node containing 10 now points to the node containing 20."* or *"Node containing 30 attached as left child of 50."*
  - **Tree Traversal Visits**: *"Visiting node containing 30 during inorder traversal."*
  - **Node Bypassed**: *"Node containing 10 unlinked from node 20 and now points directly to node 30 (bypassing node 20)."*
  - **Node Deleted**: *"Freed heap memory for node containing 20 ('second') via delete."* or *"Case A deletion: removed leaf node containing 20."*
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
  - Sets active source file in `StateExtractor` and synchronizes with `CppCompiler`.
  - **Non-Redirecting Editor Tab Listener**: Listens to `onDidChangeActiveTextEditor` to update current source paths, but deliberately avoids calling `showTextDocument` when the user navigates between files, eliminating tab redirection loops.
  - **Panel Dismissal**: Automatically closes the bottom panel (`workbench.action.closePanel`) upon clicking Visualize.
  - Guards against overstepping: if `changeType === 'final'`, disables **Next** and **Continue** to prevent entering C runtime cleanup routines.
  - Injects compiled `webview.js` and `webview.css` bundles into `webview.html`.
  - Dispatches `postMessage` calls with `ExtensionMessage` types.
  - Handles incoming user button clicks (`visualize`, `next`, `prev`, `restart`, `retry`).
  - **Historical Line Highlighting**: When navigating past snapshots, decorates the relevant source code line in the VS Code editor using a blue dashed border (`updateEditorActiveLineHighlight(snap, false)`).

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
* **What it does**: Dark-mode design system, dot-grid canvas, terminal styling, and BST components.
* **Design Principles**:
  - Color palette matches VS Code's dark theme: Background `#0D1117`, Cards `#151B23`, Borders `#2A3441`.
  - Circular tree nodes: `.tree-node-card` (46px diameter circle, centered value display).
  - Visiting indicator: `.tree-node-card.visiting` with glowing green pulse animation.
  - Staging row: Detached unlinked nodes styled with dashed amber borders in staging row.
  - Terminal styling: Monospace font, dark elevated background, scrollable console output.
  - Dot-grid viewport: `radial-gradient(#202936 1.2px, transparent 1.2px)` with 16px grid spacing.
  - Zero scrollbars on viewport with intuitive grab/grabbing cursors.

### [`webview/app.ts`](file:///c:/Projects/vscode-extension/webview/app.ts)
* **What it does**: Client-side rendering, D3 force physics simulation, BST tree geometry, terminal output updater, and infinite canvas camera.
* **Key Features**:
  - **Dual Structure Support**:
    - **Linked List Mode**: Uses `d3.forceManyBody()`, `d3.forceLink()`, and `d3.forceCenter()` for spring-damper node connections and interactive dragging.
    - **Tree Mode**: Computes deterministic tree coordinates using in-order columns (`node.treeColumn * 64px`) and depth levels (`node.treeDepth * 70px`), placing detached nodes in a top staging area.
  - **Circular Perimeter Arrow Clipping**: Uses `getCirclePerimeterIntersection()` to anchor smooth downward cubic bezier branch arrows precisely to the circular boundaries of parent and child tree nodes.
  - **Link Filtering**: Ensures only links between currently active physics bodies are passed to the simulation (`validLinks`), preventing D3 crash edge-cases during deletions.
  - **Live Terminal Updates**: Updates `#terminalText` live with auto-scrolling to bottom.
  - **Infinite Pan/Zoom Camera**:
    - **Pan**: Right-Click Drag, Middle-Click Drag, or Space + Left-Click Drag.
    - **Zoom**: Mouse wheel zooms smoothly centered on the cursor position (range: 0.35x to 2.5x).
    - **Reset**: Double-click canvas or click `↺ Reset` to return to default scale and origin.
  - **Speech Synthesis (TTS) & Auto-Play Engine**:
    - Generates spoken descriptions via `window.speechSynthesis` with code token normalization (`->` to "points to", `*` to "dereference", `[i]` to "at index i").
    - Provides automatic forward stepping with 1x, 1.5x, and 2.5x speed options.
  - **AI Assistant Drawer & Markdown Engine**:
    - Dispatches Socratic queries ("Where am I stuck?", "Explain State", "Generate Fix") to `AiService`.
    - Renders streaming responses using custom markdown parser supporting headers `h1-h6`, bullet/numbered lists, inline code, and LaTeX math symbols.
    - Provides one-click `⚡ Apply to Code` button to patch fixes directly into the active editor.

---

## 6. AI Assistant & Security Subsystem (`src/ai/`)

### [`src/ai/aiService.ts`](./src/ai/aiService.ts)
* **What it does**: Multi-provider LLM orchestration engine connecting student problem statements with runtime C++ invariants.
* **Key Features**:
  - **Supported Providers**: Google Gemini (`gemini-2.5-flash`), OpenAI (`gpt-4o-mini`), and local OpenAI-compatible endpoints (Ollama, LM Studio).
  - **Context Packaging**: Packages active source code, active execution line number, runtime visual DSA snapshot (pointer chains, stack/queue elements, string indices), and target problem statement.
  - **Pedagogical Prompt Engine**: Enforces Socratic hints and invariant checking without prematurely revealing the solution unless explicitly asked via "Generate Fix".

### [`src/ai/secretManager.ts`](./src/ai/secretManager.ts)
* **What it does**: Secure OS keychain storage for sensitive AI API keys using VS Code's `SecretStorage` API.
* **Key Features**:
  - Protects user keys against plaintext exposure in settings files or git repositories.
  - Supports key validation testing, updating, and revoking across providers.

---

## 7. Creative Mode Subsystem (`src/creative/`)

### [`src/creative/creativeCodeManager.ts`](./src/creative/creativeCodeManager.ts)
* **What it does**: Synchronizes visual canvas drag-and-drop actions with real-time C++ code generation and AST parsing.
* **Key Features**:
  - **Visual-to-Code**: Dragging nodes, connecting pointers (`first->next = second;`), pushing stack items, or typing characters in a string generates idiomatic C++ code.
  - **Code-to-Visual**: Edits in the editor automatically rebuild the canvas layout.

