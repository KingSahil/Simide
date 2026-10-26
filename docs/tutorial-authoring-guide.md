# SimIDE Tutorial Authoring Guide for AI Agents & Educators

This document is the authoritative technical reference for **AI agents** and **human educators** creating interactive C++ Data Structures & Algorithms (DSA) tutorials for **SimIDE**.

Any GitHub repository that adheres to this specification can be imported into SimIDE via the command palette (`SimIDE: Import Tutorial from GitHub`) or sidebar UI, providing real-time native GDB visual simulation, interactive stepping, and synchronized pedagogical checkpoints.

---

## 1. Core Architecture & Mental Model

SimIDE does **not** interpret C++ in JavaScript and does **not** play pre-rendered animations. It compiles real C++ code using native `g++`/`clang++` (`-g -O0 -std=c++17`) and attaches **GDB/LLDB** over the **Debug Adapter Protocol (DAP)**.

Upon every debugger pause, SimIDE's `StateExtractor` queries stack frames, resolves heap addresses, maps pointers to visual nodes, and updates the interactive canvas.

### The Executed-Line Policy
SimIDE associates visual state with the **line that just finished executing** (the previous debugger stop), not the next pending instruction. Design lesson guides around what *has just happened* after stepping.

---

## 2. Tutorial Repository Layout

A valid tutorial repository must follow this layout:

```
my-dsa-tutorial/
├── simide.json                 # Tutorial Manifest (Required)
├── README.md                   # Repository landing page
└── lessons/
    ├── 01-intro/
    │   ├── main.cpp            # Compilable C++ source code (Required)
    │   └── guide.md            # Markdown explanation & checkpoints (Required)
    ├── 02-operations/
    │   ├── main.cpp
    │   └── guide.md
    └── ...
```

---

## 3. The `simide.json` Manifest Contract

The root `simide.json` file must validate against [`schemas/v1/tutorial.schema.json`](../schemas/v1/tutorial.schema.json):

```json
{
  "$schema": "https://simide.dev/schemas/v1/tutorial.schema.json",
  "name": "mastering-bst",
  "version": "1.0.0",
  "title": "Mastering Binary Search Trees in C++",
  "author": "Your Name / Organization",
  "description": "Interactive visual walkthrough of BST allocation, insertion, and traversals.",
  "difficulty": "beginner",
  "structureType": "tree",
  "compiler": {
    "standard": "c++17",
    "flags": ["-g", "-O0"]
  },
  "lessons": [
    {
      "id": "bst-insertion",
      "title": "1. Dynamic Node Insertion",
      "description": "Learn how left and right child pointers are linked.",
      "path": "lessons/01-insert/main.cpp",
      "guide": "lessons/01-insert/guide.md"
    },
    {
      "id": "inorder-traversal",
      "title": "2. Inorder Traversal Recursion",
      "description": "Observe green visiting pulses during recursion.",
      "path": "lessons/02-traversal/main.cpp",
      "guide": "lessons/02-traversal/guide.md"
    }
  ]
}
```

### Manifest Field Rules
| Field | Type | Description / Constraints |
| :--- | :--- | :--- |
| `name` | `string` | Unique slug: lowercase letters, numbers, underscores, or hyphens (`^[a-z0-9_-]+$`). |
| `version` | `string` | Semantic versioning (`X.Y.Z`). |
| `title` | `string` | Human-readable title displayed in the curriculum header. |
| `author` | `string` | Author name or organization handle. |
| `difficulty` | `string` | One of: `"beginner"`, `"intermediate"`, `"advanced"`. |
| `structureType`| `string` | Primary visualization engine: `"linked_list"`, `"tree"`, `"array"`, `"stack"`, `"queue"`, `"graph"`. |
| `compiler` | `object` | Optional compiler flags. Default: `standard: "c++17"`, `flags: ["-g", "-O0"]`. |
| `lessons` | `array` | Non-empty array of lesson objects (`id`, `title`, `path`, optional `guide`). |

---

## 4. Supported Data Structures & C++ Coding Rules

To ensure SimIDE's inspection engine extracts state seamlessly, adhere to these structural conventions for each `structureType`:

### A. Singly & Doubly Linked Lists (`structureType: "linked_list"`)
* **Node Struct Convention:**
  ```cpp
  struct Node {
      int val;        // or data, value, item, key
      Node* next;     // Forward pointer
      Node* prev;     // Optional: Backward pointer for Doubly Linked Lists
      Node(int v) : val(v), next(nullptr), prev(nullptr) {}
  };
  ```
* **Supported Features:**
  * **Detached Heap Nodes:** `Node* newNode = new Node(10);` appears floating in amber until connected to `head`.
  * **Pointer Aliasing:** Multiple pointers (`head`, `curr`, `first`) targeting the same address stack their badges.
  * **Bidirectional Wiring:** When `node->prev` is assigned, SimIDE renders a dedicated green reverse arrow (`#36C779`).
  * **Node Deletion & Bypassing:** When unlinking (`prev->next = curr->next; delete curr;`), SimIDE draws a bypass curve and fades out the freed node.
  * **LeetCode ListNode:** Standard `struct ListNode { int val; ListNode* next; };` is natively recognized.

### B. Binary Search Trees (`structureType: "tree"`)
* **Tree Node Struct Convention:**
  ```cpp
  struct TreeNode {
      int val;            // or data, value
      TreeNode* left;     // Left child pointer
      TreeNode* right;    // Right child pointer
      TreeNode(int v) : val(v), left(nullptr), right(nullptr) {}
  };
  ```
* **Supported Features:**
  * **Automatic Layout:** In-order horizontal column indexing (`treeColumn`) and recursive depth levels (`treeDepth`).
  * **Visiting Indicators:** During recursive calls (`inorder(root->left)`), the node passed as argument pulses green (`.visiting`).
  * **Caller Root Recovery:** If a helper function receives a by-value copy or `nullptr`, SimIDE looks up caller frames to ensure the root tree doesn't vanish.

### C. Linear Arrays & Vectors (`structureType: "array"`)
* **Supported Declarations:**
  * Fixed C-arrays: `int arr[5] = {10, 20, 30, 40, 50};`
  * Dynamic arrays: `int* arr = new int[5];`
  * Vectors: `std::vector<int> nums = {10, 20, 30};`
* **Supported Features:**
  * **Index Pointer Pills:** Variables named `i`, `j`, `k`, `low`, `high`, `mid` automatically float above their current index.
  * **Swapping & Updates:** Swaps lift cells with physics (`.cell-thrust`) and animate horizontally.

### D. Stacks (`structureType: "stack"`)
* **Struct Convention:**
  ```cpp
  struct Stack {
      int arr[6];     // buffer array: arr, items, data
      int top;        // top pointer (starts at -1)
      int capacity;   // total capacity
  };
  ```
* **Supported Features:**
  * Renders vertical tube/beaker container with open top indicator (`↓ PUSH | POP ↑`).
  * Tracks `push()`, `pop()`, and `peek()` operations with live capacity bars and `TOP` pill badges.

### E. Circular Queues (`structureType: "queue"`)
* **Struct Convention:**
  ```cpp
  struct CircularQueue {
      int arr[5];     // buffer
      int front;      // front index (starts at -1)
      int rear;       // rear index (starts at -1)
      int capacity;
      int count;      // or size
  };
  ```
* **Supported Features:**
  * Persistent `FRONT` and `REAR` badges across all frames.
  * Automatic wrap-around detection (`rear = (rear + 1) % capacity`) with wrap celebration alerts.

### F. Graphs (`structureType: "graph"`)
* **Supported Representations:**
  1. **Standard Adjacency List (Recommended):**
     ```cpp
     class Graph {
     public:
         int V;
         std::vector<std::vector<int>> adj;
         Graph(int v) : V(v), adj(v) {}
         void addEdge(int u, int v) {
             adj[u].push_back(v);
             adj[v].push_back(u); // or directed
         }
     };
     ```
  2. **Array of Adjacency Vectors:** `std::vector<int> adj[N];`
  3. **Pointer Registry Layout:** Structs with `Vertex` (`nextVertex`, `value`), `Edge` (`source`, `target`, `weight`, `directed`, `nextEdge`), and `Graph` (`vertexHead`, `edgeHead`).
* **Supported Features:**
  * D3-force physical graph with interactive draggable vertices.
  * Curvature lanes for parallel edges, directed arrowheads, self-loops, and numeric edge weights.

---

## 5. Crafting the `guide.md` Lesson Guide

The companion `guide.md` is rendered in the sidebar's **Lesson Guide & Checkpoints Card** right beside the visualization canvas.

### Guide Writing Best Practices
1. **Clear Objectives:** State the 1-2 core pointer/memory mechanics being demonstrated.
2. **Concept Explanations:** Explain *why* links are rewired or *why* recursion branches.
3. **Checkpoints Section:** Explicitly list what students should observe as they click `[ Next → ]`.

### Markdown Format Rules
SimIDE's native markdown parser supports:
* Headings: `# Title`, `## Subheading`, `### Section`
* Lists: `* Bullet item` or `- Bullet item`
* Code chips: `` `Node* curr = head;` ``
* Text emphasis: `**Bold text**`, `*Italic text*`

### Example `guide.md`:
```markdown
# Lesson 1: Doubly Linked List Wiring

A **Doubly Linked List** links every node both forward (`next`) and backward (`prev`).

### Memory Concepts
- `head` points to the first node.
- `tail` points to the last node.
- Mutual wiring: `tail->next = newNode` and `newNode->prev = tail`.

### Step-by-Step Checkpoints
- **Checkpoint 1:** Notice `head` and `tail` initialize to `nullptr`.
- **Checkpoint 2:** Node `10` is allocated; both `head` and `tail` point to it.
- **Checkpoint 3:** When `20` is added, observe the green reverse arrow connecting `20` back to `10`.
- **Checkpoint 4:** When deleting node `20`, watch both forward and backward arrows bypass node `20` before memory is freed.
```

---

## 6. Security & Sandboxing Requirements

Because SimIDE compiles and executes native C++ binaries on the student's operating system, all tutorials undergo an automated static security audit during ingestion.

### Prohibited Patterns (Will Trigger Security Warnings):
* **Execution System Calls:** `system()`, `popen()`, `execvp()`, `execlp()`
* **Low-Level Platform Headers:** `<windows.h>`, `<unistd.h>`, `<direct.h>`
* **Raw Network Sockets:** `<sys/socket.h>`, `<arpa/inet.h>`, `<winsock2.h>`
* **Arbitrary File Deletion:** `remove()`, `unlink()`, `rmdir()`

Keep all tutorial code strictly self-contained using standard C++ library headers (`<iostream>`, `<vector>`, `<string>`, `<queue>`, `<stack>`, `<algorithm>`).

---

## 7. Validating Your Tutorial Locally (`@simide/cli`)

Before publishing your tutorial to GitHub, validate it using SimIDE's authoring CLI:

```bash
# In your tutorial repository root:
npx @simide/cli test .
# or
node /path/to/simide/bin/simide.js test .
```

### What the Validator Verifies:
1. `simide.json` validates against the official JSON Schema.
2. All referenced C++ source files and Markdown guides exist on disk.
3. Security linter confirms no prohibited syscalls or platform headers exist.
4. Compiles each lesson with `g++ -g -O0 -std=c++17` to guarantee debug symbols and syntax validity.

### Automated GitHub Actions CI Workflow
Add `.github/workflows/validate.yml` to your tutorial repo:

```yaml
name: Validate SimIDE Tutorial
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install g++
        run: sudo apt-get update && sudo apt-get install -y g++
      - name: Validate Tutorial
        run: npx @simide/cli test .
```

---

## 8. AI Prompt Template for Generating Tutorials

You can use the following prompt with any LLM to generate a complete, valid SimIDE tutorial repository:

```
You are an expert Computer Science educator. Create a complete, multi-lesson C++ Data Structures & Algorithms tutorial repository for SimIDE.

Topic: [e.g. Doubly Linked List / AVL Trees / Graph BFS]
Structure Type: [linked_list | tree | array | stack | queue | graph]

Requirements:
1. Provide a valid `simide.json` following https://simide.dev/schemas/v1/tutorial.schema.json.
2. For each lesson, provide:
   - A complete, self-contained `main.cpp` using standard C++17.
   - Struct definitions using SimIDE conventions (e.g. int val, Node* next, Node* prev).
   - An engaging `guide.md` with concepts, step checkpoints, and what to observe.
3. No prohibited syscalls (system, windows.h, sockets).
4. Code must compile cleanly with `g++ -g -O0 -std=c++17`.
```
