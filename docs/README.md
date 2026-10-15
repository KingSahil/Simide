# VS Code Debug Mentor — Architecture & Agent Documentation

Welcome to the internal architecture and developer documentation for **VS Code Debug Mentor** (`vscode-debug-mentor`).

This documentation is written in clear, plain language to provide human developers and AI coding agents with a complete mental model of the codebase, its subsystems, data flows, physics canvas, and extension patterns.

---

## Documentation Map

| Document | Purpose | Audience |
| :--- | :--- | :--- |
| **[System Architecture](file:///c:/Projects/vscode-extension/docs/architecture.md)** | High-level system overview, 4 core subsystems, physics canvas, technology stack, and state machine. | All Developers & AI Agents |
| **[Component Deep-Dive](file:///c:/Projects/vscode-extension/docs/components.md)** | File-by-file breakdown of every module across debug, visualization, sidebar, and webview layers. | Developers extending features |
| **[Data Flow & Lifecycles](file:///c:/Projects/vscode-extension/docs/data-flow.md)** | Step-by-step traces with sequence diagrams for session launch, stepping, time travel, physics ticks, and teardown. | Debugging & Protocol Engineers |
| **[AI Agent Guide](file:///c:/Projects/vscode-extension/docs/agent-guide.md)** | Guidelines, conventions, testing recipes, and instructions for adding new data structures (Trees, Doubly Linked Lists). | AI Agents & Automations |

---

## What is VS Code Debug Mentor?

**VS Code Debug Mentor** is a Visual Studio Code extension that bridges the gap between raw C++ debugging and visual data structure comprehension.

When students or developers learn C++ data structures (like linked lists or trees), they often struggle with pointers, dynamic heap allocations (`new Node`), and address assignments (`first->next = second;`). Traditional debuggers only show tabular hexadecimal memory addresses (such as `0x7cfa10`) and variable names in a small sidebar, which is hard for beginners to parse.

Debug Mentor solves this by:
1. **Compiling real C++ code** with debug flags (`-g -O0 -std=c++17`).
2. **Connecting directly to GDB or LLDB** via VS Code's native Debug Adapter Protocol (DAP).
3. **Dynamically discovering pointer variables** from the user's source code (no hardcoded variable names).
4. **Extracting runtime heap variables and pointer references** upon every single step.
5. **Rendering a dynamic, interactive physics canvas** in the sidebar featuring spring-damper node connections, smooth SVG pointer arrows, and Excalidraw-style infinite pan & zoom.
6. **Generating pedagogical teaching explanations** explaining pointer aliasing, heap allocations, and chain mutations.
7. **Enabling non-destructive time-travel scrubbing**, allowing learners to walk backward and forward through previous snapshots without restarting the C++ process.

---

## 30-Second Mental Model

```
+------------------------------------------------------------------------+
| 1. USER INITIATION                                                    |
|    User opens a C++ file (e.g. examples/linked-list.cpp)               |
|    and clicks [ Visualize ] in the Debug Mentor sidebar               |
+------------------------------------------------------------------------+
                                  │
                                  ▼
+------------------------------------------------------------------------+
| 2. COMPILATION & LAUNCH (src/debug/compiler.ts & debugSessionManager)  |
|    - CppCompiler runs `g++ -g -O0 -std=c++17 <file> -o <binary>`       |
|    - DebugSessionManager spins up `cppdbg` DAP session with GDB/LLDB   |
+------------------------------------------------------------------------+
                                  │
                                  ▼
+------------------------------------------------------------------------+
| 3. DAP TRACKING & DYNAMIC STATE EXTRACTION (debugAdapterTracker & extractor)|
|    - DebugTracker intercepts DAP `stopped` event                      |
|    - StateExtractor inspects source code AST/regex for pointer vars    |
|    - Reads runtime stack frames, inspects `head`, unrolls pointers     |
|    - Maps raw memory (0x74a3b0) to stable IDs (node_1)                 |
|    - Detects unlinked detached nodes & aliasing pointers               |
+------------------------------------------------------------------------+
                                  │
                                  ▼
+------------------------------------------------------------------------+
| 4. PEDAGOGY & SNAPSHOTS (visualization/explanationGenerator & snapshot)|
|    - Generates plain English explanation of what just changed         |
|    - Saves immutable snapshot in SnapshotManager for time-travel      |
+------------------------------------------------------------------------+
                                  │
                                  ▼
+------------------------------------------------------------------------+
| 5. WEBVIEW PHYSICS ENGINE (sidebar/linkedListViewProvider & webview/app.ts)|
|    - Sends IPC message `updateState` to Webview                       |
|    - Webview simulates spring-damper physics (d3-force & custom links)|
|    - Renders SVG pointer arrows, draggable cards, and badges          |
|    - Supports infinite pan (Right-Click/Space) & zoom (Mouse Wheel)   |
+------------------------------------------------------------------------+
```

---

## Key Terms & Concepts

- **DAP (Debug Adapter Protocol)**: The standard JSON-RPC wire protocol used by Visual Studio Code to talk to language debuggers like GDB, LLDB, and LLVM.
- **Dynamic Pointer Discovery**: Rather than searching for hardcoded names (`first`, `second`), `StateExtractor` dynamically scans the active C++ source file for `Node*` and `auto*` declarations, tracking variables only when execution crosses their declaration lines.
- **Detached Allocation**: A node allocated on the heap (e.g., `Node* first = new Node{10, nullptr};`) before it has been connected to the list's `head` pointer. Debug Mentor visually highlights these with dedicated green badges.
- **Stable Node ID**: Raw memory addresses change across executions or between allocations. The `StateExtractor` maps addresses like `0x74a3b0` to stable identifiers (`node_1`, `node_2`) so UI animations, drag positions, and physics simulations remain smooth.
- **Spring-Damper Physics Engine**: The webview uses a hybrid physics engine (inspired by `d3-force`) that models pointer connections as elastic springs and nodes as repulsive charged bodies.
- **Infinite Pan/Zoom Canvas**: Viewport navigation allowing learners to pan around complex structures (via Right-Click Drag, Middle-Click, or Space+Drag) and zoom using the mouse wheel.
- **Non-Destructive Time Travel**: The ability to inspect past steps (`SnapshotManager.prev()`) without executing reverse-step GDB commands (which require specialized hardware record/replay support).

---

## Next Steps

- Read **[System Architecture](file:///c:/Projects/vscode-extension/docs/architecture.md)** to see how the subsystems are wired.
- Review **[Component Deep-Dive](file:///c:/Projects/vscode-extension/docs/components.md)** for detailed file-level explanations.
- Check **[Data Flow & Lifecycles](file:///c:/Projects/vscode-extension/docs/data-flow.md)** for sequence diagrams.
- Consult the **[AI Agent Guide](file:///c:/Projects/vscode-extension/docs/agent-guide.md)** before writing code or adding new features.
