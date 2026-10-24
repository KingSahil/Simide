# AI Agent Developer Guide

This guide is specifically designed for **AI coding assistants** and automated tools working on the `simide-ide` (`SimIDE`) codebase. It outlines key conventions, testing strategies, common pitfalls, and recipes for extending the extension.

---

## 1. Quick Facts for AI Agents

- **Project Name**: SimIDE (*Simulation + IDE*) (`simide-ide`).
- **Publisher**: `kingsahil`.
- **Repository**: [https://github.com/KingSahil/Simide](https://github.com/KingSahil/Simide).
- **Target Platform**: Visual Studio Code Extension (`v1.85.0+`).
- **Primary Language**: TypeScript (`strict: true`, target ES2020).
- **Physics Engine**: `d3-force` simulation (`d3-force: ^3.0.0`, `@types/d3-force: ^3.0.10`).
- **Packaging**: `@vscode/vsce package` produces `simide-ide-0.1.0.vsix`.
- **Bundler**: `esbuild` via [`esbuild.js`](file:///c:/Projects/vscode-extension/esbuild.js). Bundles both Extension Host (`dist/extension.js`) and Webview UI (`dist/webview.js`, `dist/webview.css`, `dist/webview.html`).
- **Test Runner**: Custom Node.js runner [`test/runAll.js`](file:///c:/Projects/vscode-extension/test/runAll.js) running both unit tests, compiler validations, and headless GDB automation (`test/runTests.ts` and `test/gdbExecution.test.ts`).

---

## 2. Essential Commands

| Command | What it does | When to run |
| :--- | :--- | :--- |
| `npm run compile` | Compiles TypeScript and bundles webview assets via `esbuild.js` into `dist/`. | After modifying any `.ts`, `.html`, or `.css` file. |
| `npm test` | Runs the full test suite (7 core tests + 2 real GDB headless runtime tests including BST). | Always run to verify changes before concluding tasks! |
| `npx @vscode/vsce package` | Packages extension into installable `simide-ide-0.1.0.vsix`. | When preparing extension releases. |
| `npm run watch` | Runs `esbuild` in watch mode for live updates. | During interactive development sessions. |

---

## 3. Critical Architecture Gotchas

### Container Classes Are Not Node Records

Keep node identity/type selection tied to the record that supplies the link fields.
A `LinkedList` object containing `Node* head` must not replace `Node` as the traversal
cast type merely because it appears later in the file. Resolve object-owned heads
through DAP member variables (including private access groups) or member evaluation
in the owning frame. Never interpret a container object's address as a node address.
A verified null head is different from a failed read and must not revive a prior head.
`test/oopExtraction.test.ts` and the real GDB lifecycle test cover these cases.

### Intentional Executed-Line Highlighting — Owner Requirement

SimIDE highlights the line whose execution produced the displayed snapshot: after
stepping, the previous debugger stop location. The native debugger arrow may already
point at the next pending instruction. This difference is intentional teaching behavior.
Preserve it in live stepping, recursive returns, and historical snapshots. Do not
switch the highlight to the next pending line when fixing failed debugger reads.
The regression in `test/stateExtraction.test.ts` checks this distinction.

### Array Comparison Arrows

For bubble sort, show `j` and `j+1`, the indices of the compared adjacent cells.
`i` is the pass counter and `temp` stores an element value; neither is an array
index arrow in that example. Use actual subscript expressions, including supported
constant offsets, rather than integer magnitude or a whitelist of variable names.
Keep the original canvas layout; no separate scalar-variable panel was requested.
`test/arrayIndices.test.ts` checks initialization, bounds, movement, and traversal.

### Gotcha 1: Dynamic Pointer & Function Discovery
`StateExtractor` does not hardcode variable names. It reads the C++ source lines and matches pointer declarations and functions:
- User-defined functions: discovered via `getUserDefinedFunctions()`, allowing stepping into `printList`, `reverseList`, `push`, `deleteNode`, and class methods.
- Pointer declarations: matched via regex and declaration line numbers.
- **Rule**: Never query uninitialized local variables before their declaration line completes execution!

### Gotcha 2: D3 Force Link Filtering
In `webview/app.ts`:
- When nodes are deleted or disconnected, links pointing to nonexistent IDs must be filtered out before calling `simulation.force('link')`.
- **Rule**: Always pass `validLinks = d3Links.filter(l => d3NodesMap.has(source) && d3NodesMap.has(target))` to prevent D3 from throwing uncaught particle reference errors.

### Gotcha 3: C Runtime (CRT) Boundary Protection
When stepping past `return 0;`, GDB transitions into C Runtime startup/teardown functions (e.g. `__tmainCRTStartup`).
- **Rule**: Never allow CRT frames to trigger an empty snapshot or error state. [`StateExtractor`](file:///c:/Projects/vscode-extension/src/debug/stateExtractor.ts#L166) checks if `funcName` or `path` contains `crt` or is outside user source. When detected, it preserves the completed snapshot and marks `changeType: 'final'`, and `LinkedListViewProvider` disables the Next/Continue controls.

### Gotcha 4: Windows File Locking on Executables
On Windows, if a C++ process was previously running under GDB or an unexpected termination occurred, the operating system locks the `.exe` file. Recompiling to the exact same file path will throw `EBUSY: resource busy or locked`.
- **Rule**: [`CppCompiler.compile`](file:///c:/Projects/vscode-extension/src/debug/compiler.ts#L68) checks for open file descriptors and dynamically falls back to an alternate timestamped executable name (`linked-list_1792051440937.exe`). Always preserve this logic.

### Gotcha 5: The `-O0` Compiler Optimization Flag
Always ensure `-O0` is passed during C++ compilation:
```typescript
const args = ['-g', '-O0', '-std=c++17', sourcePath, '-o', executablePath];
```
If `-O1`, `-O2`, or `-O3` are passed, GCC will optimize local temporary pointers directly into CPU registers or inline them, preventing GDB's `Locals` scope from inspecting them.

### Gotcha 6: Uninitialized Stack Pointer Protection (Step 1 Ghost Nodes)
On Step 1 at `main()`, local pointer variables reside on the stack and hold arbitrary uninitialized garbage memory addresses before their declaration lines execute.
- **Rule**: [`StateExtractor.hasSteppedPastFirstPointerDecl`](file:///c:/Projects/vscode-extension/src/debug/stateExtractor.ts) verifies whether execution has crossed the declaration line (`rawLine > declLine`). Never parse stack pointer values or evaluate dereferences before their declaration lines have completed!

### Gotcha 7: Recursive Frame Root Resolution in BSTs
In recursive tree algorithms (like `insert(root, val)` or `inorder(root)`), helper functions pass node pointers by value. When recursion hits a base case (`root == nullptr`), querying `root` in the topmost stack frame yields `0x0`, which would wipe out the entire tree visualization.
- **Rule**: When `root == nullptr` inside recursive frames, [`StateExtractor.extractTreeNodes`](file:///c:/Projects/vscode-extension/src/debug/stateExtractor.ts) inspects caller stack frames to retrieve the canonical root pointer from `main()`, preserving complete tree topology throughout recursion.

### Gotcha 8: Active Editor vs Visualized File Decoupling
In multi-file workflows, a user may switch tabs to inspect another file (e.g., from `linked-list.cpp` to `bst-traversals.cpp`).
- **Rule**: Never call `vscode.window.showTextDocument()` inside `onDidChangeActiveTextEditor`! Doing so creates an inescapable redirect loop that snaps the user's cursor back to the previously active file. Use `updateEditorActiveLineHighlight(snap, false)` with `openIfNotVisible: false`.

### Gotcha 9: Terminal & AI Sidebar Popup Suppression
When a debug session starts, default VS Code configurations may pop open the Debug Console or bottom terminal panel, and third-party AI extensions may open sidebars that crush the user's workspace layout.
- **Rule**: Always pass `internalConsoleOptions: 'neverOpen'` and `suppressDebugView: true` in the launch configuration, and invoke `vscode.commands.executeCommand('workbench.action.closePanel')` upon visualization to ensure an unobstructed canvas.

---

## 4. Test Suite Map

When running `npm test`, the following 9 validations are executed:

1. **Compiler Detection**: Validates `g++` / `clang++` in PATH.
2. **Debugger Discovery**: Validates `gdb.exe` in PATH or MinGW.
3. **Pedagogical Explanation Generator**: Validates all `changeType` cases (creation, linking, deletion, traversal, bypass, terminal print, in-place value update, BST root/child/traversals).
4. **SnapshotManager History**: Validates non-destructive time-travel scrubbing.
5. **StateExtractor Pointer Parsing**: Validates handling of C++ references, type casts, nulls, BST struct detection, and user-defined functions.
6. **Compilation of Real-World Examples**: Compiles `leetcode-206-reverse.cpp`, `gfg-push-delete.cpp`, `oop-linked-list.cpp`, and `bst-traversals.cpp`.
7. **Headless GDB Stepping**: Real line-by-line GDB stepping and state extraction on `linked-list.cpp`.
8. **Headless GDB LeetCode Reversal**: Real GDB execution of LeetCode 206 `reverseList` validating in-place reversed chain (`3 -> 2 -> 1`).
9. **Headless GDB BST Traversals**: Real GDB execution of `bst-traversals.cpp` verifying BFS node discovery, preorder/inorder/postorder stepping, and Case A deletions.

---

## 5. Pre-Commit Checklist for AI Agents

Before declaring any task complete:
- [ ] Run `npm run compile` and verify clean build with zero TypeScript or bundling errors.
- [ ] Run `npm test` and verify that all tests (including both real GDB headless tests) pass.
- [ ] Verify that no console errors or uncaught promises are logged.
- [ ] Ensure all modified or created files include clickable Markdown links with `file:///` paths.
- [ ] Preserve existing comments and docstrings.
