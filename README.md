# VS Code Debug Mentor

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](file:///c:/Projects/vscode-extension/test/runAll.js)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-007ACC.svg?logo=visualstudiocode)](https://marketplace.visualstudio.com/)
[![C++](https://img.shields.io/badge/language-C%2B%2B17-00599C.svg?logo=c%2B%2B)](https://isocpp.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](file:///c:/Projects/vscode-extension/LICENSE)
[![Architecture Docs](https://img.shields.io/badge/docs-architecture-blueviolet.svg)](file:///c:/Projects/vscode-extension/docs/README.md)

> **Real-time C++ debugging and interactive Data Structures & Algorithms (DSA) visualization directly in your Visual Studio Code sidebar.**

**VS Code Debug Mentor** (`vscode-debug-mentor`) helps students, educators, and developers master C++ memory management and pointer-based data structures. As you step through your code, the extension dynamically watches the running program, extracts heap state, and renders an interactive, physics-driven canvas with plain English explanations for every pointer assignment.

This is a **real developer tool** connected directly to native GDB/LLDB via VS Code's Debug Adapter Protocol (DAP)—not a pre-recorded animation, disconnected simulation, or static mockup.

---

## Table of Contents

- [Why VS Code Debug Mentor?](#why-vs-code-debug-mentor)
- [Key Features](#key-features)
- [Architecture Overview](#architecture-overview)
- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Usage Walkthrough](#usage-walkthrough)
- [Visual Design System & Physics Canvas](#visual-design-system--physics-canvas)
- [8 Distinct UI States](#8-distinct-ui-states)
- [Testing & Verification](#testing--verification)
- [FAQ & Troubleshooting](#faq--troubleshooting)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

---

## Why VS Code Debug Mentor?

Learning pointer-based data structures in C++ is notoriously challenging:
- Raw memory addresses like `0x74a3b0` and `0x74a3f0` in the debugger's variable pane are difficult to mentally map into a linked chain.
- Learners often confuse **heap allocation** (`new Node{10, nullptr}`) with **linking** (`head = first;` or `first->next = second;`).
- Disconnected browser simulators force students to copy and paste code away from their real IDE, losing access to language servers and compiler diagnostics.

**Debug Mentor solves this right inside VS Code**:
1. You write standard C++ code in the editor.
2. Click **[ Visualize ]** in the Debug Mentor sidebar.
3. The extension compiles your code with debug flags (`-g -O0 -std=c++17`), launches GDB/LLDB, captures state upon every step, and renders interactive diagrams with pedagogical teaching explanations.

---

## Key Features

- **Genuine Debugger Execution**: Runs real native C++ binaries using VS Code's Debug Adapter Protocol (DAP). Stepping in Debug Mentor advances the actual C++ program and highlights the live source line in the VS Code editor.
- **Dynamic Pointer Discovery**: Discovers any pointer variables in the user's code dynamically via source regex and line thresholds—no hardcoded variable names!
- **Pointer Aliasing Tracking**: Visually flags when multiple pointers refer to the same heap node (e.g., `head` aliasing `first` at `0x74a3b0`).
- **Spring-Damper Physics Canvas**: Powered by a hybrid physics engine (integrated with `d3-force`). Nodes behave as physical bodies connected by elastic springs with natural recoil and repulsion.
- **Excalidraw-Style Infinite Pan & Zoom**: Navigate large diagrams with Right-Click Pan, Mouse Wheel Zoom (0.35x to 2.5x), Spacebar drag, double-click reset, and a quick `↺ Reset` layout button—with zero clunky scrollbars!
- **Detached Allocation Tracking**: Uniquely tracks local unlinked node allocations (`first`, `second`, `newNode`) before they are linked into `head`, helping students visualize the moment memory is allocated versus when it is connected.
- **Pedagogical Step Explanations**: Generates clear, plain English teaching explanations for every mutation (e.g., *"The node containing 10 now points to the node containing 20."*).
- **C Runtime (CRT) Boundary Protection**: Detects when execution reaches `return 0;` or C runtime exit routines, cleanly finishing execution and preserving the completed linked list diagram without flickering.
- **Non-Destructive Time Travel**: Review past states by clicking **Previous** without terminating or corrupting the running C++ process. Step forward again to seamlessly resume live debugging.

---

## Architecture Overview

Debug Mentor coordinates four decoupled subsystems across process boundaries:

```
+-------------------------------------------------------------------------+
|                        VS CODE EXTENSION HOST                           |
|                                                                         |
|  [src/extension.ts] ──▶ [LinkedListViewProvider] (Sidebar Webview Hub)  |
|                                │                                        |
|         ┌──────────────────────┼──────────────────────┐                 |
|         ▼                      ▼                      ▼                 |
|  [src/debug/]           [src/visualization/]     [webview/app.ts]       |
|  • CppCompiler          • LinkedListModel        • Spring Physics Engine|
|  • DebugSessionManager  • ExplanationGenerator   • Pan & Zoom Camera    |
|  • DebugAdapterTracker  • SnapshotManager        • SVG Dynamic Arrows   |
|  • ExecutionController  • Pointer Models         • Dot-Grid Canvas      |
|  • StateExtractor                                                       |
+---------│─────────────────────────────────────────────▲-----------------+
          │ (DAP Protocol)                              │ (Typed IPC)
          ▼                                             │
+───────────────────────+                     +──────────────────+
| Native GDB / LLDB     |                     | Sidebar Webview  |
| (Real C++ Process)    |                     | (Chromium View)  |
+───────────────────────+                     +──────────────────+
```

### Complete Documentation

For comprehensive technical deep-dives, please explore the [`docs/`](file:///c:/Projects/vscode-extension/docs/README.md) directory:
- **[System Architecture](file:///c:/Projects/vscode-extension/docs/architecture.md)**: Process boundaries, DAP wire protocol, dynamic pointer discovery, and CRT protection.
- **[Component Deep-Dive](file:///c:/Projects/vscode-extension/docs/components.md)**: Module-by-module breakdown of all source files.
- **[Data Flow & Lifecycles](file:///c:/Projects/vscode-extension/docs/data-flow.md)**: Sequence diagrams for launch, stepping, physics loop, and time-travel.
- **[AI Agent Guide](file:///c:/Projects/vscode-extension/docs/agent-guide.md)**: Developer guide for automated agents and contributors adding new data structures.

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/debug-mentor/vscode-debug-mentor.git
cd vscode-debug-mentor

# 2. Install dependencies
npm install

# 3. Build the extension and webview bundles
npm run compile

# 4. Run the automated test suite (verifies GCC, physics models & real GDB stepping)
npm test
```

To launch and test the extension interactively in VS Code:
1. Open the project folder in VS Code (`code .`).
2. Press `F5` to open the **Extension Development Host**.
3. Open `examples/linked-list.cpp`.
4. Click the **Debug Mentor** icon in the Activity Bar.
5. Click **[ Visualize ]** and step through your code!

---

## Prerequisites

Before running the extension, verify your system has the following tools installed:

1. **Visual Studio Code**: `v1.85.0` or higher.
2. **C++ Compiler**: `g++` (MinGW-w64 on Windows, GCC on Linux) or `clang++` accessible in system `PATH`.
3. **Debugger**: `gdb` or `lldb` accessible in system `PATH`.
4. **C/C++ Extension**: [`ms-vscode.cpptools`](https://marketplace.visualstudio.com/items?itemName=ms-vscode.cpptools) installed in VS Code.
5. **Node.js**: `v18+` (tested on Node `v20` and `v26`).

---

## Installation & Setup

### Building from Source

```bash
# Install Node dependencies (includes d3-force physics)
npm install

# Build bundles via esbuild
npm run compile
```

### Packaging into a VSIX Extension (Optional)

```bash
npx @vscode/vsce package
```
This generates a `.vsix` file that can be installed into any Visual Studio Code instance using:
```bash
code --install-extension vscode-debug-mentor-0.1.0.vsix
```

---

## Usage Walkthrough

Debug Mentor includes a complete singly linked list sample in [`examples/linked-list.cpp`](file:///c:/Projects/vscode-extension/examples/linked-list.cpp):

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

### Step-by-Step Experience

1. **Open File**: Open `examples/linked-list.cpp` in the editor.
2. **Open Sidebar**: Click the **Debug Mentor** icon in the VS Code Activity Bar.
3. **Click Visualize**: Click the large blue **[ Visualize ]** button.
   - The status spinner updates: *"Compiling source..."* → *"Starting debugger..."*.
4. **Paused at Entry (Step 1)**:
   - GDB pauses at `main()`.
   - Sidebar displays prompt: *"Program paused at start of main(). Click Next to execute: Node* head = nullptr;"*
5. **Step 2 (Detached Allocation)**: Click **[ Next ]**.
   - `first = new Node{10, nullptr};` executes.
   - The detached card `first (10)` appears in the physics canvas with a spring connection to `nullptr`.
6. **Step 3 (Head Connected & Aliasing)**: Click **[ Next ]**.
   - `head = first;` executes.
   - `head` points to node 10, aliasing `first`: *"head points to the node containing 10 (aliasing pointer 'first' at address 0x74a3b0)."*
7. **Steps 4–6 (Building the Chain)**: Click **[ Next ]** repeatedly.
   - Watch nodes `20` and `30` allocate and link one by one until the full chain is formed:
     `head ──▶ [ 10 | • ] ──▶ [ 20 | • ] ──▶ [ 30 | • ] ──▶ nullptr`.
8. **Interacting with Canvas**:
   - Click and drag any node card to test the spring elasticity.
   - Right-click drag to pan across the canvas.
   - Scroll mouse wheel to zoom in or out.
   - Click `↺ Reset` to return to default layout.
9. **Time Travel**: Click **[ Previous ]** to rewind back through past states and inspect earlier pointer assignments.

---

## Visual Design System & Physics Canvas

The user interface uses a curated, high-contrast dark theme designed to blend seamlessly with VS Code:

| Design Token | Color Value | Purpose |
| :--- | :--- | :--- |
| `--bg-primary` | `#0D1117` | Main sidebar and editor-adjacent surface |
| `--bg-sidebar` | `#11161D` | Sidebar view container base |
| `--bg-card` | `#151B23` | Diagram, detached nodes, and explanation cards |
| `--bg-elevated` | `#1C232D` | Secondary pill buttons, step chips, and badges |
| `--border-color` | `#2A3441` | Card outlines and node boundaries |
| `--text-primary` | `#F5F7FA` | Primary labels, headers, and node values |
| `--text-secondary`| `#A7B0BC` | Pedagogical explanations and step numbers |
| `--text-muted` | `#737D8C` | Null indicators (`nullptr`) and drag hints |
| `--accent` | `#0066FF` | Primary button, active SVG arrows, and node focus |
| `--accent-tint` | `#142B4D` | Highlighted node backgrounds |
| `--success` | `#36C779` | Paused status indicator, detached nodes, and completion badge |
| `--danger` | `#F85149` | Error state indicators and diagnostic alerts |

---

## 8 Distinct UI States

The sidebar is built as an explicit state machine transitioning through 8 visual states:

1. **Screen 1 — Initial IDE State**: Minimalist welcome view with brand icon, subtitle, and primary `[ Visualize ]` button.
2. **Screen 2 — Loading / Launching**: Animated spinner with live status updates (*"Preparing C++ program"*, *"Compiling source"*, *"Starting debugger"*).
3. **Screen 3 — Debugger Paused, Initial State**: Paused at `main()`, step 1 chip, empty canvas message, execution controls enabled.
4. **Screen 4 — First Node Allocated**: Detached allocation `first (data: 10)` visible in the canvas with spring link to `nullptr`.
5. **Screen 5 — First Node Connected**: `head` connects to node 10, indicating pointer aliasing.
6. **Screen 6 — Second Node Added**: Node 20 connected: `head ──▶ 10 ──▶ 20 ──▶ nullptr`.
7. **Screen 7 — Final Linked List**: Complete 3-node chain: `head ──▶ 10 ──▶ 20 ──▶ 30 ──▶ nullptr`. Program execution finished.
8. **Screen 8 — Error State**: Informative diagnostic card with error title, scrollable compiler/debugger logs, and a `[ Retry ]` button.

---

## Testing & Verification

Debug Mentor includes a dual-layer automated test suite:
- **Unit & Mock Tests** ([`test/runTests.ts`](file:///c:/Projects/vscode-extension/test/runTests.ts)): Verifies compiler path resolution, C++ compilation flags, snapshot history, and explanation generation across all states.
- **Headless GDB Integration Test** ([`test/gdbExecution.test.ts`](file:///c:/Projects/vscode-extension/test/gdbExecution.test.ts)): Spawns real GDB as a child process against compiled C++ binaries, stepping line-by-line and verifying runtime memory values (`10`, `20`, `30`).

### Running Tests

```bash
npm test
```

### Verified Test Matrix

| Test Case | Description | Result |
| :--- | :--- | :--- |
| **Compiler Detection** | Detects MinGW `g++` in system PATH | **PASSED** |
| **C++ Compilation** | Compiles `linked-list.cpp` with `-g -O0 -std=c++17` | **PASSED** |
| **Debugger Discovery** | Locates `gdb.exe` binary | **PASSED** |
| **Explanation Engine** | Generates plain English text for all 6 lifecycle states | **PASSED** |
| **Snapshot History** | Verifies non-destructive `prev()` and `nextHistory()` | **PASSED** |
| **Real GDB Stepping** | Steps through C++ binary and validates runtime values | **PASSED** |

---

## FAQ & Troubleshooting

### Why does the compiler need the `-O0` flag?
Compiler optimization levels (`-O1`, `-O2`, `-O3`) optimize away temporary pointer variables (like `Node* first`) into registers or inline them entirely. Compiling with `-O0` ensures every variable exists in stack memory so the debugger can inspect it.

### Can I pan and zoom the diagram?
Yes! Use **Right-Click Drag**, **Middle-Click Drag**, or **Space + Left-Click Drag** to pan. Use the **Mouse Wheel** to zoom in or out. Double-click the background or click `↺ Reset` to re-center.

### Can I step backwards in the real C++ execution?
Debug Mentor's **Previous** button navigates historical snapshots stored during execution. It does not send reverse-step commands to GDB, because GDB reverse debugging requires hardware record/replay targets that are not universally supported across Windows, Linux, and macOS.

### What should I do if compilation fails with `EBUSY` on Windows?
On Windows, a running debugger locks the output `.exe`. Debug Mentor automatically detects locked files and compiles to an alternate timestamped executable (e.g. `linked-list_1792051440937.exe`). If an issue persists, click **Restart** or close hanging GDB processes.

---

## Roadmap

- [x] **Milestone 1**: Singly Linked List visualization with GDB integration, spring-damper physics canvas, pan/zoom camera, dynamic pointer discovery, and time-travel history.
- [ ] **Milestone 2**: Doubly Linked Lists with bidirectional SVG arrows (`prev` and `next`).
- [ ] **Milestone 3**: Binary Search Trees (BST) with tree layout algorithm and branch visualization.
- [ ] **Milestone 4**: Stacks and Queues with push/pop animations.
- [ ] **Milestone 5**: Memory leak detection highlighting unreferenced heap allocations that fall out of scope without `delete`.

---

## Contributing

Contributions from students, educators, and developers are warmly welcomed!

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/doubly-linked-list`.
3. Check the **[AI Agent & Developer Guide](file:///c:/Projects/vscode-extension/docs/agent-guide.md)** for architecture guidelines and conventions.
4. Make changes and verify that `npm run compile` and `npm test` pass cleanly.
5. Commit your changes: `git commit -m 'feat: Add doubly linked list support'`.
6. Push to your branch and open a Pull Request.

---

## License

This project is licensed under the **MIT License**. See the [LICENSE](file:///c:/Projects/vscode-extension/LICENSE) file for details.

---

## Contact

- **Issues & Bug Reports**: [GitHub Issues](https://github.com/debug-mentor/vscode-debug-mentor/issues)
- **Discussion & Feature Requests**: [GitHub Discussions](https://github.com/debug-mentor/vscode-debug-mentor/discussions)
- **Maintainer**: VS Code Debug Mentor Team
