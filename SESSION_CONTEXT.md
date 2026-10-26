# SimIDE - Project Context & Session Handover

## 1. Project Overview & Architecture

**SimIDE** is a VS Code / Antigravity extension that combines a C++ compiler (`g++`/`clang++`), GDB debugger backend (DAP / MI), and an interactive Webview canvas (D3 force simulation, SVG overlays, HTML/CSS cards) to visualize Data Structures & Algorithms in real-time as student C++ code executes step-by-step.

### Supported Data Structures

1. **Linked Lists**: Singly linked, doubly linked, LeetCode / GFG patterns, OOP/class structures.
2. **Binary Trees & BST**: Tree node layouts, pointer links, tree traversals (inorder, preorder, postorder).
3. **Arrays**: Fixed and dynamic arrays, multi-index pointer arrows (`i`, `j`, `k`), in-place swaps, element mutations.
4. **Stacks (LIFO)**: Vertical stack buffer, dynamic top index indicator, push/pop/peek operations, overflow/underflow warnings.
5. **Circular Queues (FIFO)**: Linear / circular buffers, front/rear pointer tracking, modulo wrap-around visualization.
6. **Graphs**: Vertex-edge topology, force-directed graph diagrams via D3.
7. **Strings (Newly Added & Verified)**: `std::string`, C-style `char[]`, null terminators (`\0`), ASCII values, two-pointer algorithms (`left`/`right`), sliding window ranges (`[start..end]`), in-place character swaps/mutations.

---

## 2. Key Files & Architecture Map

| File Path | Description |
| --- | --- |
| `src/visualization/linkedListModel.ts` | Complete TypeScript type system and data models: `StructureType`, `StringVariable`, `StringElement`, `StringWindow`, `LinkedListSnapshot`. |
| `src/debug/stateExtractor.ts` | Core runtime inspection engine: extracts stack frames, local variables, pointer addresses, string buffers, and evaluates GDB expressions via DAP. |
| `src/visualization/explanationGenerator.ts` | Pedagogical natural-language explanation engine that computes step-by-step diffs and generates human-friendly explanations. |
| `src/sidebar/linkedListViewProvider.ts` | Extension sidebar WebviewViewProvider: handles compiler orchestration, GDB session lifecycle, DAP stop interception, snapshot broadcasting, and webview messages. |
| `webview/app.ts` | Frontend webview controller: receives snapshot messages, switches UI views, manages D3 force layout, and renders diagrams (including `renderStringDiagram`). |
| `webview/styles.css` | All styling tokens, glassmorphism, animations, string tile styles, pointer badges, and responsive layouts. |
| `examples/` | Test example C++ programs for all data structures (e.g. `string-palindrome.cpp`, `string-reverse.cpp`, `sliding-window-string.cpp`, `c-string-reverse.cpp`, `stack-operations.cpp`, etc.). |
| `.vscode/launch.json` | Debug configurations for launching the Extension Development Host window. |

---

## 3. Work Completed in This Session

### A. Strings Implementation (Phases 1–6)

* **Data Models (`linkedListModel.ts`)**: Added `'string'` to `StructureType`, created `StringVariable`, `StringElement`, `StringWindow`, and extended `LinkedListSnapshot`.
* **Static Discovery (`stateExtractor.ts`)**: Implemented `discoverStringDeclarations` for `std::string` and `char[]`, and `detectStringAlgorithmPattern` for two-pointer and sliding-window heuristics.
* **DAP Runtime Extraction (`stateExtractor.ts`)**: Implemented `extractStrings` with single-roundtrip expression evaluation, character array parsing, ASCII extraction, explicit null terminators, and index pointer mapping.
* **Diffing & Pedagogical Explanations (`explanationGenerator.ts`)**: Added string change types (`string_initialized`, `string_char_swapped`, `string_char_updated`, `string_pointer_moved`, `string_window_resized`).
* **Webview UI (`webview/app.ts` & `styles.css`)**: Built `renderStringDiagram` with character tiles, index labels, ASCII sub-badges, two-pointer badges, and sliding window highlight brackets.
* **Example Programs & Test Suite (`test/stringExtraction.test.ts`)**: Created 5 string example programs and a test suite covering all string functionality (all tests passing 100%).

### B. Critical Fixes Applied

1. **Webview Header & Canvas Dispatch**:
   * Fixed `cardTitle` in `webview/app.ts` to recognize `snapshot.structureType === 'string'` (previously fell through to `'LINKED LIST'`).
   * Moved `renderStringDiagram` and `renderArrayDiagram` to the top of `renderLinkedListDiagram` so they are not blocked by linked-list `!snapshot.hasHead` checks.
2. **String Initialization Bounds**:
   * Fixed `hasHead` calculation in `stateExtractor.ts` so function parameters (like `bool isPalindrome(const std::string& s)`) are not mistaken for global string declarations outside `main`.
   * Guarded root/head pointer assignment so phantom `head -> nullptr` badges are not added to string snapshots.
3. **Optimized Example Signature**:
   * Updated `examples/string-palindrome.cpp` to `bool isPalindrome(const std::string& s)` to eliminate GDB stepping into MinGW's libstdc++ `basic_string.h` copy constructor.
4. **Launch Profiles in `.vscode/launch.json`**:
   * Added `Run Extension (String Demo)` and `Run Extension (Active File)` profiles so launching debug doesn't force `stack-operations.cpp`.

---

## 5. Current State & Immediate Next Steps for the Next Session

1. **Current Code Status**:
   * All TypeScript code compiles cleanly (`npm run compile` succeeds with 0 errors).
   * All 14 test suites pass (`npm test`).
   * Production bundles in `dist/` are up to date (`dist/extension.js`, `dist/webview.js`).

2. **Verification / Testing in a New Session**:
   * **Option A (Interactive Debugger)**: Run `Run Extension (String Demo)` via F5 in VS Code to launch the Extension Development Host with `string-palindrome.cpp`, and click **Visualize**.
   * **Option B (Direct `.vsix` Install)**: Package the extension via:

     ```powershell
     npx @vscode/vsce package --no-dependencies
     code --install-extension simide-ide-0.1.1.vsix --force
     ```

     Then reload window (`Ctrl+Shift+P` -> `Developer: Reload Window`), open `examples/string-palindrome.cpp`, and click **Visualize**.
