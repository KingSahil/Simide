# VS Code Debug Mentor

> **A Real-Time C++ Debugging and DSA Visualization Extension for Visual Studio Code.**

**VS Code Debug Mentor** (`vscode-debug-mentor`) helps students understand C++ data structures and algorithms by watching their own code execute and seeing the corresponding data structures update visually in the VS Code sidebar.

This is a real developer tool, not a disconnected simulation or pre-recorded mockup. The user writes standard C++ code, clicks **Visualize**, and the extension compiles the code with debug flags, launches the actual C++ debugger (GDB/LLDB via DAP), steps through execution, and extracts runtime state to render live visual data structure diagrams.

---

## Key Features

- **Genuine Debugger Execution**: Uses VS Code's Debug Adapter Protocol (DAP) connected to real GDB or LLDB. When you click **Next**, the actual C++ program advances, VS Code's editor highlights the real execution location, and the diagram updates from newly inspected runtime state.
- **Dark Mode Design System**: Refined `#0D1117` palette with rounded pill buttons, subtle borders (`#2A3441`), `#0066FF` accent highlights, and crisp SVG pointer diagrams designed for VS Code sidebars.
- **Detached Allocation Tracking**: Observes local unlinked node allocations (`first`, `second`, `third`) before they are linked into `head`, allowing students to visually see the creation of a node before pointer assignment.
- **Pedagogical Step Explanations**: Generates concise, educational explanations of each mutation (e.g., *"The first node is now connected. head points to the node containing 10."*).
- **Non-Destructive History Navigation**: Step backwards with **Previous** to review past states without claiming to reverse the running C++ process. Step forward again to return to live debugging.
- **Native Debugger Integration**: Does not duplicate the source editor, call stack, or variable inspector; VS Code's native debugging panes handle those while Debug Mentor focuses on the visual representation of the data structure.

---

## Visual Design System (Dark Mode)

The interface strictly implements the following design tokens:

| Token | Color | Purpose |
| :--- | :--- | :--- |
| **Main background** | `#0D1117` | Main editor-adjacent surfaces |
| **Sidebar background** | `#11161D` | Extension sidebar view container |
| **Card background** | `#151B23` | Visualization and explanation cards |
| **Elevated surface** | `#1C232D` | Secondary controls and status badge |
| **Primary text** | `#F5F7FA` | Headings, values, and primary labels |
| **Secondary text** | `#A7B0BC` | Supporting explanations and step labels |
| **Muted text** | `#737D8C` | Subtle hints and null indicators |
| **Border** | `#2A3441` | Card outlines and node boundaries |
| **Main accent** | `#0066FF` | Primary button, active arrows, node highlights |
| **Accent tint** | `#142B4D` | Subtle highlighted node backgrounds |
| **Success indicator** | `#36C779` | Debugger paused status indicator |

---

## 8 Distinct UI States

1. **Screen 1 — Initial IDE State**: Clean sidebar displaying brand title, subtitle *"Understand your C++ code visually."*, and a single prominent `[ ▶ Visualize ]` pill button. No diagrams, execution controls, or duplicate panels are shown.
2. **Screen 2 — Starting Debugging Session**: Informative loading state with an animated spinner and real-time status updates: *"Preparing C++ program"*, *"Compiling source"*, *"Starting debugger"*, *"Waiting for initial stop"*.
3. **Screen 3 — Debugger Paused, Initial Visualization**: Debugger paused at `main()`, step indicator showing `Step 1`, `head ──▶ nullptr`, and explanation: *"head is null, so the linked list is empty."* Execution controls are enabled.
4. **Screen 4 — First Node Visualized**: Local node `first` allocated (`data: 10, next: ∅`) displayed in the detached allocations section. Explanation: *"A new node has been created. The node stores 10, and its next pointer is null. It is not yet connected to head."*
5. **Screen 5 — First Node Connected**: `head = first;` executed. Node 10 is connected to `head`. Explanation: *"The first node is now connected. head points to the node containing 10."*
6. **Screen 6 — Second Node Added**: Node 20 allocated and connected. Diagram: `head ──▶ 10 ──▶ 20 ──▶ nullptr`. Explanation: *"The first node now points to the second node: head → 10 → 20 → nullptr."*
7. **Screen 7 — Final Linked List**: All 3 nodes connected: `head ──▶ 10 ──▶ 20 ──▶ 30 ──▶ nullptr`. Explanation: *"The linked list is complete: head → 10 → 20 → 30 → nullptr."*
8. **Screen 8 — Error State**: Appears if compilation fails, compiler/debugger is missing, or launch configuration fails. Displays concise error title, scrollable diagnostic details, and a `[ Retry ]` button.

---

## C++ Sample Acceptance Test Program

Located at `examples/linked-list.cpp`:

```cpp
#include <iostream>
using namespace std;

struct Node {
    int data;
    Node* next;
};

int main() {
    Node* head = nullptr;
    Node* first = new Node{10, nullptr};
    head = first;
    Node* second = new Node{20, nullptr};
    first->next = second;
    Node* third = new Node{30, nullptr};
    second->next = third;
    return 0;
}
```

---

## Project Structure

```
c:\Projects\vscode-extension\
├── package.json                    # Extension manifest (views, commands, activation)
├── tsconfig.json                   # TypeScript configuration
├── esbuild.js                      # Fast bundler for Extension & Webview
├── README.md                       # Documentation, architecture, setup & test results
├── resources/
│   └── icon.svg                    # Sidebar view container icon
├── examples/
│   └── linked-list.cpp             # 3-node C++ test program
├── src/
│   ├── extension.ts                # Main activator, command handlers, DAP lifecycle
│   ├── debug/
│   │   ├── compiler.ts             # Safe child_process g++/clang++ compiler
│   │   ├── debugSessionManager.ts  # Session management & dynamic cppdbg configuration
│   │   ├── debugAdapterTracker.ts  # DAP tracker for stopped/continued/terminated events
│   │   ├── executionController.ts  # Step, continue, pause, restart operations
│   │   └── stateExtractor.ts       # DAP variable inspection & linked list traversal
│   ├── visualization/
│   │   ├── linkedListModel.ts      # Normalized model (nodes, head, detached nodes)
│   │   ├── explanationGenerator.ts # Generates clear pedagogical explanations
│   │   └── snapshotManager.ts      # Non-destructive historical snapshot manager
│   └── sidebar/
│       ├── linkedListViewProvider.ts # WebviewViewProvider for the sidebar
│       └── messages.ts             # Strongly-typed Webview <-> Extension IPC protocol
├── webview/
│   ├── index.html                  # Sidebar HTML structure
│   ├── styles.css                  # Dark mode design system tokens
│   └── app.ts                      # Webview DOM & SVG rendering engine
└── test/
    ├── mockVscode.ts               # Standalone test mock for VS Code API
    ├── runTests.ts                 # Compiler, model, explanation & snapshot tests
    ├── gdbExecution.test.ts        # Real GDB runtime stepping & extraction test
    └── runAll.js                   # Test orchestrator
```

---

## Prerequisites

1. **Visual Studio Code** (v1.85.0 or later).
2. **C++ Compiler**: `g++` (MinGW-w64 on Windows, GCC on Linux) or `clang++` in system PATH.
3. **Debugger**: `gdb` or `lldb` in system PATH.
4. **C/C++ Extension**: `ms-vscode.cpptools` (installed in VS Code for standard DAP support).
5. **Node.js**: v18+ (tested on Node v20/v26).

---

## Build & Test Instructions

### 1. Compile the Extension
```bash
npm run compile
```
This runs `node esbuild.js` to bundle both the extension host (`dist/extension.js`) and the webview UI (`dist/webview.js`, `dist/webview.css`, `dist/webview.html`).

### 2. Run the Automated Test Suite
```bash
npm test
```
This executes:
- **Test 1**: Compiler detection (`g++`) and real compilation of `examples/linked-list.cpp` with `-g -O0 -std=c++17`.
- **Test 2**: Debugger discovery (`gdb` detected at `C:\ProgramData\mingw64\mingw64\bin\gdb.exe`).
- **Test 3**: Pedagogical explanation generation across all 5 key linked-list lifecycle states.
- **Test 4**: `SnapshotManager` non-destructive history navigation.
- **Test 5 (Real Runtime Test)**: Real GDB execution stepping line-by-line through `examples/linked-list.exe`, verifying that values (`10`, `20`, `30`) and pointer transitions (`0x0`, `next`) are captured accurately.

### 3. Launching in VS Code Extension Development Host
1. Open this repository folder in VS Code:
   ```bash
   code c:\Projects\vscode-extension
   ```
2. Press `F5` (or go to **Run and Debug** and select **Run Extension**).
3. A new Extension Development Host window will open with `examples/linked-list.cpp`.
4. Click on the **Debug Mentor** icon in the Activity Bar to open the sidebar.
5. Click **Visualize** to compile and automatically launch the debugging session.
6. Click **Next** repeatedly to watch the real C++ execution advance and the linked list update!

---

## Verified Test Results

| Test Category | Description | Status |
| :--- | :--- | :--- |
| **Compiler Detection** | Detects MinGW `g++` 16.1.0 in PATH | **PASSED** |
| **Real C++ Compilation** | Compiles `examples/linked-list.cpp` with `-g -O0` into `.exe` | **PASSED** |
| **Debugger Detection** | Detects GNU `gdb` 17.1 at `C:\ProgramData\mingw64\mingw64\bin\gdb.exe` | **PASSED** |
| **Real GDB Runtime Stepping** | Executes breakpoints, stepping, and inspects `head`, `first`, `second`, `third` | **PASSED** |
| **State Extraction Logic** | Maps memory addresses to stable node IDs, identifies detached allocations | **PASSED** |
| **Pedagogical Explanations** | Generates tailored text for empty, created, head-connected, linked, and final states | **PASSED** |
| **Snapshot History** | Stores snapshots, enables `prev()` and `nextHistory()` without mutating live execution | **PASSED** |
| **Extension Packaging / Registration** | Installed and registered under `code --list-extensions` | **PASSED** |

---

## Known Limitations & Scope Boundaries

1. **Data Structure Scope (Milestone 1)**: This milestone focuses exclusively on singly linked lists following the standard `struct Node { int data; Node* next; }` pattern and `head` root pointer. Doubly linked lists, binary trees, graphs, and hash tables will be added in subsequent milestones.
2. **Reverse Stepping**: Clicking **Previous** navigates historical snapshots stored during the active session. It does not issue GDB reverse-execution commands (`reverse-step`), as GDB reverse debugging requires hardware record/replay targets (`target record-full`) which are not universally supported across all platforms.
3. **Optimized Binaries**: Compilation is intentionally forced to `-O0` to prevent compilers from inlining or optimizing away temporary pointer variables (`first`, `second`, `third`).
