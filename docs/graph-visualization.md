# Graph visualization

SimIDE can visualize the supported pointer-based graph registry while stepping
through a C++ program. The graph snapshot is serialized with stable IDs and
values; runtime C++ addresses are used internally to identify objects and
resolve edge endpoints, but are not included in graph snapshots sent to the
webview.

## Supported C++ layout

The source must define these members with the indicated roles and compatible
types:

```cpp
struct Vertex {
  int value;                 // Numeric or std::string/string display value
  Vertex* nextVertex;        // Registry traversal, not a graph edge
};

struct Edge {
  Vertex* source;            // Graph endpoint
  Vertex* target;            // Graph endpoint
  double weight;             // Numeric weight
  bool directed;             // true draws an arrow; false is undirected
  Edge* nextEdge;            // Edge registry traversal
};

struct Graph {
  Vertex* vertexHead;        // Head of the vertex registry
  Edge* edgeHead;            // Head of the edge registry
};
```

`vertexHead -> nextVertex` and `edgeHead -> nextEdge` enumerate canonical
registry objects. Only `Edge::source` and `Edge::target` describe graph
topology. Debugger-visible local, argument, static, and global `Vertex*` and
`Edge*` variables are also inspected: valid objects not yet in a registry are
shown as detached vertices or edges, and registry traversal remains canonical.
An edge appears only when both endpoints, its weight, and its directedness can
be read. The extractor does not inspect pointers whose debugger-reported type
does not match the supported structures. It also supports registry cycles,
bounded to 500 objects per registry.

The debugger can report unreadable or optimized-out fields, which are omitted
with a warning. If a registry read is incomplete, previously captured objects
remain visible until a complete snapshot confirms they are no longer present.
A debugger cannot in general distinguish a readable but uninitialized scalar
from an initialized scalar with the same bit pattern; initialize the required
fields before relying on their displayed values. Likewise, DAP does not expose
allocation lifetime for a non-null typed pointer: unreadable pointees are omitted,
but a dangling pointer into readable memory cannot always be distinguished from
a live object.

STL adjacency lists, adjacency matrices, arbitrary pointer layouts, and
non-numeric weights are not supported by this extractor. `Vertex::value` must
be numeric or a supported string type; `Edge::directed` must be `bool`.

## Run the example

1. Open `examples/graph-registry.cpp` in the SimIDE workspace.
2. Build the extension (`npm run compile`) if its generated extension bundle
   needs updating.
3. Start the SimIDE extension in VS Code's Extension Development Host.
4. Open the SimIDE view and choose **Visualize**.
5. Step through the debugger. The first three stops after `new Vertex{...}`
   show one, two, then three detached vertices. After they join the vertex
   registry, `new Edge{...}` statements reveal edges before `graph.edgeHead`
   links them into the edge registry. A breakpoint at `checkpoint = 1` shows
   the fully linked graph.

The example has three vertices and two weighted directed edges. It prints
checkpoint output for the existing terminal panel.

## Tests

Focused graph model, extraction, renderer, and integration tests are in:

- `test/graphModel.test.ts`
- `test/graphStateExtractor.test.ts`
- `test/graphRenderer.test.ts`
- `test/graphIntegration.test.ts`

Run `npm test` to execute these suites along with debug-output and real GDB tests.
The GDB test compiles the bundled graph example, reads its live registry into the
extractor, verifies three vertices and two weighted directed edges, then verifies
an undirected self-loop, a weight update, an edge removal, stable IDs, and immutable
history. Other suites verify registry cycles, detached objects, invalid reads,
parallel edges, camera bounds, and source highlighting.

The Graph quick-launch button opens the bundled example and updates Target File.
Press Visualize to begin. Existing example files in the workspace are preserved.
Graph snapshots follow SimIDE's executed-line policy: after stepping, the highlight
identifies the previous debugger stop that produced the displayed state.
