# AI Agent Developer Guide

This guide is specifically designed for **AI coding assistants** and automated tools working on the `vscode-debug-mentor` codebase. It outlines key conventions, testing strategies, common pitfalls, and recipes for extending the extension.

---

## 1. Quick Facts for AI Agents

- **Project Type**: Visual Studio Code Extension (`v1.85.0+`).
- **Primary Language**: TypeScript (`strict: true`, target ES2020).
- **Physics & Visualization**: Hybrid spring-damper physics engine integrated with `d3-force` (`d3-force: ^3.0.0`, `@types/d3-force: ^3.0.10`).
- **Bundler**: `esbuild` via [`esbuild.js`](file:///c:/Projects/vscode-extension/esbuild.js). Bundles both Extension Host (`dist/extension.js`) and Webview UI (`dist/webview.js`, `dist/webview.css`, `dist/webview.html`).
- **Test Runner**: Custom Node.js runner [`test/runAll.js`](file:///c:/Projects/vscode-extension/test/runAll.js) using [`test/mockVscode.ts`](file:///c:/Projects/vscode-extension/test/mockVscode.ts) and headless GDB automation in [`test/gdbExecution.test.ts`](file:///c:/Projects/vscode-extension/test/gdbExecution.test.ts).
- **Primary Debug Adapter**: VS Code `cppdbg` (C/C++ Tools extension) connected to native `gdb` or `lldb`.

---

## 2. Essential Commands

| Command | What it does | When to run |
| :--- | :--- | :--- |
| `npm run compile` | Compiles TypeScript and bundles webview assets via `esbuild.js` into `dist/`. | After modifying any `.ts`, `.html`, or `.css` file. |
| `npm test` | Builds test bundles and executes both unit tests and headless GDB runtime tests. | Always run to verify changes before concluding tasks! |
| `npm run watch` | Runs `esbuild` in watch mode for live updates. | During interactive development sessions. |

---

## 3. Critical Architecture Gotchas

### Gotcha 1: Dynamic Pointer Discovery & Declaration Line Thresholds
`StateExtractor` does not use hardcoded variable names. Instead, it reads the C++ file lines and regex-matches pointer definitions:
```typescript
const match = lineText.match(/(?:Node\s*\*|auto\s*\*?)\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
```
* **Rule**: Always respect the line threshold (`currentLine <= varInitLine`). In C++, evaluating an uninitialized local pointer before its declaration line executes will yield garbage values or crash the inspection.

### Gotcha 2: C Runtime (CRT) Startup and Exit Frames
When stepping past `return 0;`, GDB transitions into C Runtime startup/teardown functions (e.g. `__tmainCRTStartup`).
* **Rule**: Never allow CRT frames to trigger an empty snapshot or error state. [`StateExtractor`](file:///c:/Projects/vscode-extension/src/debug/stateExtractor.ts#L166) checks if `funcName` or `path` contains `crt` or is outside `main()`. When detected, it preserves the completed snapshot and marks `changeType: 'final'`, and `LinkedListViewProvider` disables the Next/Continue controls.

### Gotcha 3: Asynchronous DAP Stack Population
When GDB pauses, it fires an `{ "event": "stopped" }` event over DAP. However, GDB needs several milliseconds to populate stack frames and local scopes.
* **Rule**: In [`LinkedListViewProvider.registerDebugListeners`](file:///c:/Projects/vscode-extension/src/sidebar/linkedListViewProvider.ts#L25), maintain a small async pause (`await new Promise((r) => setTimeout(r, 80));`) before calling [`StateExtractor.extractState`](file:///c:/Projects/vscode-extension/src/debug/stateExtractor.ts#L34). Removing this causes empty variable lists on fast machines.

### Gotcha 4: Windows File Locking on Executables
On Windows, if a C++ process was previously running under GDB or an unexpected termination occurred, the operating system locks the `.exe` file. Recompiling to the exact same file path will throw `EBUSY: resource busy or locked`.
* **Rule**: [`CppCompiler.compile`](file:///c:/Projects/vscode-extension/src/debug/compiler.ts#L68) checks for open file descriptors and dynamically falls back to an alternate timestamped executable name (`linked-list_1792051440937.exe`). Always preserve this logic.

### Gotcha 5: The `-O0` Compiler Optimization Flag
Always ensure `-O0` is passed during C++ compilation:
```typescript
const args = ['-g', '-O0', '-std=c++17', sourcePath, '-o', executablePath];
```
If `-O1`, `-O2`, or `-O3` are passed, GCC will optimize local temporary pointers directly into CPU registers or inline them, preventing GDB's `Locals` scope from inspecting them.

### Gotcha 6: Webview Context Retention
In [`src/extension.ts`](file:///c:/Projects/vscode-extension/src/extension.ts#L17), always set:
```typescript
{ webviewOptions: { retainContextWhenHidden: true } }
```
Without this, if the user switches to the file explorer or source control tab and back, the webview DOM reloads, destroying the canvas state, physics simulation, and camera pan/zoom offsets.

---

## 4. How to Add a New Data Structure (e.g., Doubly Linked List, Binary Tree)

Follow this 5-step recipe to add support for a new data structure:

### Step 1: Extend Data Models (`src/visualization/linkedListModel.ts`)
Add support for additional pointers (e.g., `prevId`, `leftId`, `rightId`):
```typescript
export interface TreeNode {
  id: string;
  data: number | string;
  leftId: string | null;
  rightId: string | null;
  isRoot: boolean;
}
```

### Step 2: Update State Extractor (`src/debug/stateExtractor.ts`)
In `StateExtractor.extractState`:
1. Check the struct type definition returned by DAP `variables` (e.g., `TreeNode*` vs `Node*`).
2. Evaluate children pointer names (`left`, `right` for trees; `prev`, `next` for doubly linked lists).
3. Translate pointer addresses using `getStableId(address)`.

### Step 3: Extend Pedagogical Explanations (`src/visualization/explanationGenerator.ts`)
Add explanation cases in `ExplanationGenerator`:
- Tree: Root initialized, left child attached, right child attached, tree traversal.
- Doubly Linked List: Back-link established (`curr->next->prev = curr`).

### Step 4: Update Webview Physics & Rendering (`webview/app.ts`)
In `webview/app.ts`:
- Configure spring links: For trees, configure dual spring connections (`node -> leftChild`, `node -> rightChild`).
- Add appropriate resting lengths and repulsion parameters to keep subtrees apart.

### Step 5: Add Automated Tests
1. Create a sample C++ file in `examples/` (e.g., `examples/binary-tree.cpp`).
2. Add test cases in `test/runTests.ts` validating state extraction and explanation generation.
3. Run `npm test` to verify.

---

## 5. Design Token Reference

When modifying UI components in `webview/styles.css` or `webview/app.ts`, strictly respect the dark mode palette:

```css
:root {
  --bg-primary: #0D1117;       /* Main editor-adjacent background */
  --bg-sidebar: #11161D;       /* Sidebar background */
  --bg-card: #151B23;          /* Diagram & explanation cards */
  --bg-elevated: #1C232D;      /* Secondary pill buttons, badge pills */
  --border-color: #2A3441;     /* Node borders and card outlines */
  --border-subtle: #21262D;    /* Inner node dividing lines */
  --text-primary: #F5F7FA;     /* Primary labels, node data */
  --text-secondary: #A7B0BC;   /* Step numbers, subtitles */
  --text-muted: #737D8C;       /* Null indicators, drag hints */
  --accent: #0066FF;           /* Primary button, active SVG arrows */
  --accent-tint: #142B4D;      /* Selected/active node background */
  --success: #36C779;          /* Paused indicator, detached nodes, complete status */
  --danger: #F85149;           /* Error badges and failure text */
}
```

---

## 6. Pre-Commit Checklist for AI Agents

Before declaring any task complete:
- [ ] Run `npm run compile` and verify clean build with zero TypeScript or bundling errors.
- [ ] Run `npm test` and verify that all 5 tests (including real GDB runtime execution) pass.
- [ ] Verify that no console errors or uncaught promises are logged.
- [ ] Ensure all modified or created files include clickable Markdown links with `file:///` paths.
- [ ] Preserve existing comments and docstrings.
