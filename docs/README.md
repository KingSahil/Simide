# SimIDE — Architecture & Developer Documentation

Welcome to the internal architecture and developer documentation for **SimIDE** (*Simulation + IDE*).

This documentation is written in clear, plain language to provide human developers and AI coding agents with a complete mental model of the codebase, its subsystems, data flows, physics canvas, algorithm tracing, and extension patterns.

---

## Documentation Map

- [Graph visualization](./graph-visualization.md) Map

| Document | Purpose | Audience |
| :--- | :--- | :--- |
| **[System Architecture](./architecture.md)** | High-level system overview, 4 core subsystems, physics canvas, technology stack, and state machine (Linked Lists, Binary Trees, Arrays, Stacks, Circular Queues, Strings, and Graphs). | All Developers & AI Agents |
| **[Tutorial Authoring Guide (AI & Educators)](./tutorial-authoring-guide.md)** | Complete specification for creating community DSA tutorials on GitHub, schema reference, and validator CLI. | AI Agents & Educators |
| **[Component Deep-Dive](./components.md)** | File-by-file breakdown of every module across debug, visualization, AI service, audio TTS, sidebar, and webview layers. | Developers extending features |
| **[Data Flow & Lifecycles](./data-flow.md)** | Step-by-step traces with sequence diagrams for session launch, stepping, traversals, deletions, stacks, and circular queues. | Debugging & Protocol Engineers |
| **[Graph Visualization](./graph-visualization.md)** | Force-directed graph visualization, adjacency representations, and stable vertex tracking. | Algorithm & Graph Developers |
| **[AI Agent Guide](./agent-guide.md)** | Guidelines, conventions, testing recipes, and instructions for adding new data structures (Trees, Arrays, Stacks, Queues, Strings). | AI Agents & Automations |

---

## What is SimIDE?

**SimIDE** is a Visual Studio Code extension that bridges the gap between raw C++ debugging and visual data structure comprehension.

When students or developers learn C++ data structures (like linked lists, trees, arrays, stacks, queues, strings, and graphs), they often struggle with pointers, dynamic heap allocations (`new Node`), address assignments (`first->next = second;`), in-place pointer reversals (LeetCode 206), memory deletions (`delete temp;`), stack overflow/underflow, and circular queue pointer wrap-around (`(rear + 1) % capacity`). Traditional debuggers only show tabular hexadecimal memory addresses (such as `0x74a3b0`) and variable names in a small sidebar, which is hard for beginners to parse.

SimIDE solves this by:
1. **Compiling real C++ code** with debug flags (`-g -O0 -std=c++17`).
2. **Connecting directly to GDB or LLDB** via VS Code's native Debug Adapter Protocol (DAP).
3. **Dynamically discovering pointer variables and user functions** (`printList`, `reverseList`, `push`, `pop`, `enqueue`, `dequeue`, `deleteNode`, OOP methods) from the user's source code without hardcoding.
4. **Extracting runtime heap variables and pointer references** across function boundaries and stack frames upon every single step.
5. **Rendering dynamic, interactive visualizations**:
   - **Linked Lists**: Spring-damper physics canvas (`d3-force`), draggable cards, SVG arrows, and detached node staging.
   - **Binary Search Trees (BST)**: Depth levels, in-order non-overlapping column layout, visiting node pulse, and Case A deletions.
   - **Linear Arrays**: Interactive strip with cell elevation, value mutations, swapping animations, and active index pointers (`i`, `j`, `k`, `low`, `high`, `mid`).
   - **Stacks (LIFO)**: Vertical tray with spring elevation, active `TOP` pointer badge, push/pop animations, and overflow/underflow detection.
   - **Circular Queues (FIFO)**: Horizontal ring buffer with persistent `FRONT` and `REAR` badges across all function traversals, real-time wrap-around indicator (`(rear + 1) % capacity = 0`), and empty/full state protection.
   - **Strings**: Character cell arrays with ASCII tags, null terminators, two-pointer movement tracking (`left`, `right`), and sliding window slice visualization.
   - **Graphs**: Force-directed layout of vertices and weighted directed/undirected edges.
6. **Live-streaming console output** from `std::cout` and `printf` in a dedicated sidebar terminal card.
7. **Tracking heap memory freeing** via `delete`, visually explaining unlinking, bypassing, and deletions.
8. **Audio Narration (TTS) & Auto-Play**: Synchronous speech synthesis describing mutations in natural English with variable simulation speeds (1x, 1.5x, 2.5x).
9. **Pedagogical AI Tutor & Problem Statement Helper**: Socratic guidance ("Where am I stuck?", "Explain State", "Generate Fix") comparing the student's target problem statement with visual heap invariants and code.
10. **Bidirectional Creative Mode**: Drag-and-drop visual data structure construction with real-time bidirectional C++ code generation.
11. **Enabling non-destructive time-travel scrubbing**, allowing learners to walk backward and forward through previous snapshots without restarting the C++ process.

---

## 30-Second Mental Model

```
+------------------------------------------------------------------------+
| 1. USER INITIATION                                                    |
|    User opens any C++ DSA file (e.g. examples/linked-list.cpp)          |
|    and clicks [ Visualize ] in the SimIDE sidebar                      |
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
|    - StateExtractor inspects source code for pointer decls & functions |
|    - Reads runtime stack frames, inspects `head`, unrolls pointers     |
|    - Maps raw memory (0x74a3b0) to stable IDs (node_1)                 |
|    - Tracks deleted nodes, pointer traversals, & live terminal output  |
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
| 5. WEBVIEW PHYSICS & TERMINAL (sidebar/provider & webview/app.ts)      |
|    - Sends IPC message `updateState` to Webview                       |
|    - Webview simulates spring-damper physics (d3-force & links)       |
|    - Renders SVG pointer arrows, draggable cards, and badges          |
|    - Streams live output to Terminal Card & supports Infinite Pan/Zoom|
+------------------------------------------------------------------------+
```

---

## Key Terms & Concepts

- **DAP (Debug Adapter Protocol)**: The standard JSON-RPC wire protocol used by Visual Studio Code to talk to language debuggers like GDB, LLDB, and LLVM.
- **Dynamic Pointer Discovery**: Rather than searching for hardcoded names (`first`, `second`), `StateExtractor` dynamically scans the active C++ source file for `Node*`, `ListNode*`, `auto*`, and class methods, tracking variables only when execution crosses their declaration lines.
- **Detached Allocation**: A node allocated on the heap (e.g., `Node* second = new Node{20, nullptr};`) before it has been connected to the list's `head` pointer. SimIDE visually highlights these with dedicated green badges.
- **Stable Node ID**: Raw memory addresses change across executions or between allocations. The `StateExtractor` maps addresses like `0x74a3b0` to stable identifiers (`node_1`, `node_2`) so UI animations, drag positions, and physics simulations remain smooth.
- **Spring-Damper Physics Engine**: The webview uses a hybrid physics engine (integrated with `d3-force`) that models pointer connections as elastic springs and nodes as repulsive charged bodies.
- **Terminal Output Stream**: Intercepts `std::cout` / `printf` in real-time step-by-step and displays live program output in the sidebar.
- **Non-Destructive Time Travel**: The ability to inspect past steps (`SnapshotManager.prev()`) without executing reverse-step GDB commands (which require specialized hardware record/replay support).

---

## Next Steps

- Read **[System Architecture](file:///c:/Projects/vscode-extension/docs/architecture.md)** to see how the subsystems are wired.
- Review **[Component Deep-Dive](file:///c:/Projects/vscode-extension/docs/components.md)** for detailed file-level explanations.
- Check **[Data Flow & Lifecycles](file:///c:/Projects/vscode-extension/docs/data-flow.md)** for sequence diagrams.
- Consult the **[AI Agent Guide](file:///c:/Projects/vscode-extension/docs/agent-guide.md)** before writing code or adding new features.
