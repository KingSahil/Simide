import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  describeGraphSnapshotChange,
  discoverGraphLayout,
  findGraphVariableDeclaration,
  GraphExpressionEvaluator,
  GraphStateExtractor,
  isGraphPointerInitializedAtSource,
  matchesGraphType,
  parseGraphPointerValue,
} from '../src/debug/graphStateExtractor';
import { StateExtractor } from '../src/debug/stateExtractor';

const graphSource = `
struct Vertex {
  int value;
  Vertex* nextVertex;
};

struct Edge {
  Vertex* source;
  Vertex* target;
  double weight;
  bool directed;
  Edge* nextEdge;
};

struct Graph {
  Vertex* vertexHead;
  Edge* edgeHead;
};

int main() {
  Graph g{nullptr, nullptr};
  Vertex* current = nullptr;
  return g.vertexHead != nullptr;
}
`;

const incrementalDebuggerSource = `
struct Vertex {
  int value;
  Vertex* nextVertex;
};
struct Edge {
  Vertex* source;
  Vertex* target;
  double weight;
  bool directed;
  Edge* nextEdge;
};
struct Graph {
  Vertex* vertexHead;
  Edge* edgeHead;
};
int main() {
  Graph graph{nullptr, nullptr};
  Vertex* v1 = new Vertex{1, nullptr};
  Vertex* v2 = new Vertex{2, nullptr};
  Vertex* v3 = new Vertex{3, nullptr};
  Edge* e1 = new Edge{v1, v2, 1, true, nullptr};
  Edge* e2 = new Edge{v2, v3, 2, true, nullptr};
  return 0;
}
`;

function runGraphStateExtractorTests(): Promise<void> {
  return (async () => {
    const layout = discoverGraphLayout(graphSource);
    assert.deepStrictEqual(layout, {
      graphType: 'Graph',
      vertexType: 'Vertex',
      edgeType: 'Edge',
      vertexValueField: 'value',
    });
    assert.strictEqual(
      discoverGraphLayout('struct Node { int value; Node* next; };'),
      null,
      'A linked node type must not be inferred as a graph'
    );
    assert.strictEqual(
      discoverGraphLayout(graphSource.replace('Vertex* nextVertex;', 'Vertex** nextVertex;')),
      null,
      'Unsupported pointer depth must not be accepted as a graph vertex link'
    );
    assert.strictEqual(matchesGraphType('Graph *', 'Graph'), true);
    assert.strictEqual(matchesGraphType('Graph **', 'Graph'), false);
    assert.strictEqual(matchesGraphType('Vertex *', 'Graph'), false);
    assert.deepStrictEqual(
      findGraphVariableDeclaration(graphSource, 'Graph', 'g', 42),
      { line: 21, initialized: true }
    );
    assert.deepStrictEqual(
      findGraphVariableDeclaration('int main() { Graph g; }', 'Graph', 'g', 1),
      { line: 1, initialized: false },
      'Default-initialized local graph objects are unsafe to inspect'
    );
    assert.strictEqual(
      isGraphPointerInitializedAtSource(
        'int main() {\n  Vertex* v1 = new Vertex{1, nullptr};\n  return 0;\n}',
        'Vertex',
        'v1',
        2
      ),
      false,
      'A typed local is not initialized while stopped on its initializer statement'
    );
    assert.strictEqual(
      isGraphPointerInitializedAtSource(
        'int main() {\n  Vertex* v1 = new Vertex{1, nullptr};\n  return 0;\n}',
        'Vertex',
        'v1',
        3
      ),
      true,
      'A local pointer initializer is complete after execution advances beyond its line'
    );
    assert.strictEqual(
      isGraphPointerInitializedAtSource(
        'int main() {\n  Vertex* v1;\n  v1 = nullptr;\n  return 0;\n}',
        'Vertex',
        'v1',
        2
      ),
      false,
      'An uninitialized declaration is skipped until its assignment executes'
    );
    assert.strictEqual(
      isGraphPointerInitializedAtSource(
        'int main() {\n  Vertex* v1;\n  v1 = nullptr;\n  return 0;\n}',
        'Vertex',
        'v1',
        4
      ),
      true,
      'An uninitialized pointer becomes eligible after its assignment line'
    );

    assert.deepStrictEqual(parseGraphPointerValue('(Vertex *) 0x1000 <vertex>'), {
      valid: true,
      address: '0x1000',
    });
    assert.deepStrictEqual(
      parseGraphPointerValue('(Vertex *&) @0x5000: (Vertex *) 0x2000 <vertex>'),
      { valid: true, address: '0x2000' }
    );
    assert.deepStrictEqual(parseGraphPointerValue('(Vertex *) 0x0'), {
      valid: true,
      address: null,
    });
    assert.strictEqual(
      parseGraphPointerValue('<error: Cannot access memory at address 0x1000>').valid,
      false
    );
    assert.strictEqual(parseGraphPointerValue('1077940').valid, false);

    const values = new Map<string, string>([
      ['g.vertexHead', '(Vertex *) 0x1000'],
      ['g.edgeHead', '(Edge *) 0x5000'],
      ['((Vertex*)0x1000)->value', '10'],
      ['((Vertex*)0x1000)->nextVertex', '0x2000'],
      ['((Vertex*)0x2000)->value', '20'],
      ['((Vertex*)0x2000)->nextVertex', '0x3000'],
      ['((Vertex*)0x3000)->value', '"C"'],
      ['((Vertex*)0x3000)->nextVertex', '0x4000'],
      ['((Vertex*)0x4000)->value', '(int) 40'],
      ['((Vertex*)0x4000)->nextVertex', '0x1000'],
      ['((Edge*)0x5000)->source', '0x1000'],
      ['((Edge*)0x5000)->target', '0x2000'],
      ['((Edge*)0x5000)->weight', '(double) 1.5'],
      ['((Edge*)0x5000)->directed', '(bool) true'],
      ['((Edge*)0x5000)->nextEdge', '0x6000'],
      ['((Edge*)0x6000)->source', '0x1000'],
      ['((Edge*)0x6000)->target', '0x2000'],
      ['((Edge*)0x6000)->weight', '-2'],
      ['((Edge*)0x6000)->directed', 'false'],
      ['((Edge*)0x6000)->nextEdge', '0x7000'],
      ['((Edge*)0x7000)->source', '0x3000'],
      ['((Edge*)0x7000)->target', '0x3000'],
      ['((Edge*)0x7000)->weight', '0'],
      ['((Edge*)0x7000)->directed', 'true'],
      ['((Edge*)0x7000)->nextEdge', '0x8000'],
      ['((Edge*)0x8000)->source', '0x1000'],
      ['((Edge*)0x8000)->target', '0x9999'],
      ['((Edge*)0x8000)->weight', '3'],
      ['((Edge*)0x8000)->directed', 'true'],
      ['((Edge*)0x8000)->nextEdge', '0x9000'],
      ['((Edge*)0x9000)->source', 'nullptr'],
      ['((Edge*)0x9000)->target', '0x4000'],
      ['((Edge*)0x9000)->weight', '4'],
      ['((Edge*)0x9000)->directed', 'true'],
      ['((Edge*)0x9000)->nextEdge', '0xa000'],
      ['((Edge*)0xa000)->source', '0x3000'],
      ['((Edge*)0xa000)->target', '0x4000'],
      ['((Edge*)0xa000)->weight', '<error: optimized out>'],
      ['((Edge*)0xa000)->directed', 'false'],
      ['((Edge*)0xa000)->nextEdge', '0x5000'],
      ['((Vertex*)0xd000)->value', '99'],
      ['((Vertex*)0xd000)->nextVertex', 'nullptr'],
    ]);
    const evaluate: GraphExpressionEvaluator = async (expression) =>
      values.get(expression) ?? null;
    const extractor = new GraphStateExtractor();
    const pointers = [
      { name: 'current', type: 'Vertex *', value: '(Vertex *) 0x2000 <vertex>' },
      { name: 'empty', type: 'Vertex *', value: 'nullptr' },
      { name: 'notVertex', type: 'Edge *', value: '0x5000' },
      { name: 'outside', type: 'Vertex *', value: '0x9999' },
    ];

    const snapshot = await extractor.extract(
      layout!,
      'g',
      false,
      7,
      evaluate,
      pointers,
      { file: 'graph.cpp', line: 42, functionName: 'main' }
    );
    assert.deepStrictEqual(
      snapshot.graph.vertices.map(({ id, value }) => [id, value]),
      [
        ['vertex_1', 10],
        ['vertex_2', 20],
        ['vertex_3', 'C'],
        ['vertex_4', 40],
      ]
    );
    assert.deepStrictEqual(
      snapshot.graph.edges.map(({ id, sourceId, targetId, directed, weight }) => [
        id,
        sourceId,
        targetId,
        directed,
        weight,
      ]),
      [
        ['edge_1', 'vertex_1', 'vertex_2', true, 1.5],
        ['edge_2', 'vertex_1', 'vertex_2', false, -2],
        ['edge_3', 'vertex_3', 'vertex_3', true, 0],
      ]
    );
    assert.deepStrictEqual(snapshot.pointers, [
      { name: 'current', targetNodeId: 'vertex_2', isNull: false },
      { name: 'empty', targetNodeId: null, isNull: true },
      { name: 'outside', targetNodeId: null, isNull: false },
    ]);
    assert.ok(
      !JSON.stringify(snapshot).includes('0x'),
      'Graph snapshots must not serialize runtime pointer addresses'
    );
    assert.ok(snapshot.warnings?.some((warning) =>
      warning.includes('An edge endpoint could not be read as a supported vertex')
    ));
    assert.ok(snapshot.warnings?.some((warning) => warning.includes('null or unreadable endpoint')));
    assert.ok(snapshot.warnings?.some((warning) => warning.includes('required fields')));
    assert.ok(snapshot.warnings?.some((warning) => warning.includes('supported vertex')));
    assert.strictEqual(
      new Set(snapshot.warnings || []).size,
      snapshot.warnings?.length,
      'Each distinct extraction warning is reported only once per snapshot'
    );

    const warningSnapshot = {
      ...snapshot,
      graph: { vertices: [], edges: [] },
      changeType: 'init' as const,
      warnings: ['A vertex could not be read.', 'A vertex could not be read.'],
    };
    const firstWarningExplanation = describeGraphSnapshotChange(undefined, warningSnapshot);
    assert.strictEqual(
      (firstWarningExplanation.explanation.match(/A vertex could not be read\./g) || []).length,
      1,
      'Repeated warnings are deduplicated in the explanation'
    );
    const repeatedWarningExplanation = describeGraphSnapshotChange(
      warningSnapshot,
      { ...warningSnapshot, stepNumber: warningSnapshot.stepNumber + 1 }
    );
    assert.ok(
      !repeatedWarningExplanation.explanation.includes('Warnings:'),
      'Unchanged warnings are not repeated at every debugger stop'
    );

    const repeated = await extractor.extract(
      layout!,
      'g',
      false,
      8,
      evaluate,
      pointers
    );
    assert.deepStrictEqual(
      repeated.graph.vertices.map((vertex) => vertex.id),
      snapshot.graph.vertices.map((vertex) => vertex.id),
      'Vertex IDs must remain stable between extracted states'
    );
    assert.deepStrictEqual(
      repeated.graph.edges.map((edge) => edge.id),
      snapshot.graph.edges.map((edge) => edge.id),
      'Edge IDs must remain stable between extracted states'
    );

    const liveGraphValues = new Map<string, string>([
      ['live.vertexHead', '0x1100'],
      ['live.edgeHead', '0x5100'],
      ['((Vertex*)0x1100)->value', '1'],
      ['((Vertex*)0x1100)->nextVertex', '0x1200'],
      ['((Vertex*)0x1200)->value', '2'],
      ['((Vertex*)0x1200)->nextVertex', 'nullptr'],
      ['((Edge*)0x5100)->source', '0x1100'],
      ['((Edge*)0x5100)->target', '0x1200'],
      ['((Edge*)0x5100)->weight', '1'],
      ['((Edge*)0x5100)->directed', 'true'],
      ['((Edge*)0x5100)->nextEdge', 'nullptr'],
    ]);
    const liveExtractor = new GraphStateExtractor();
    const firstLiveSnapshot = await liveExtractor.extract(
      layout!,
      'live',
      false,
      20,
      async (expression) => liveGraphValues.get(expression) ?? null,
      [],
      { file: 'graph.cpp', line: 20, functionName: 'main' }
    );
    liveGraphValues.set('live.edgeHead', 'nullptr');
    liveGraphValues.set('((Vertex*)0x1200)->nextVertex', '0x1300');
    liveGraphValues.set('((Vertex*)0x1300)->value', '3');
    liveGraphValues.set('((Vertex*)0x1300)->nextVertex', 'nullptr');
    const secondLiveSnapshot = await liveExtractor.extract(
      layout!,
      'live',
      false,
      21,
      async (expression) => liveGraphValues.get(expression) ?? null,
      [],
      { file: 'graph.cpp', line: 21, functionName: 'main' }
    );
    assert.deepStrictEqual(
      firstLiveSnapshot.graph.vertices.map((vertex) => vertex.id),
      secondLiveSnapshot.graph.vertices.slice(0, 2).map((vertex) => vertex.id),
      'Objects retained across debugger stops keep stable IDs'
    );
    assert.strictEqual(firstLiveSnapshot.graph.edges.length, 1);
    assert.strictEqual(secondLiveSnapshot.graph.vertices.length, 3);
    assert.strictEqual(secondLiveSnapshot.graph.edges.length, 0);
    assert.strictEqual(secondLiveSnapshot.source?.line, 21);

    const pointerRootValues = new Map([
      ['gp->vertexHead', '0x1000'],
      ['gp->edgeHead', '0x5000'],
    ]);
    const pointerRoot = await extractor.extract(
      layout!,
      'gp',
      true,
      9,
      async (expression) => pointerRootValues.get(expression) ?? values.get(expression) ?? null
    );
    assert.strictEqual(pointerRoot.graph.vertices.length, 4);
    assert.strictEqual(
      pointerRoot.graph.edges.length,
      3,
      'Edges without readable required fields are omitted'
    );

    const emptyValues = new Map([
      ['emptyGraph.vertexHead', 'nullptr'],
      ['emptyGraph.edgeHead', '0x0'],
    ]);
    const empty = await extractor.extract(
      layout!,
      'emptyGraph',
      false,
      9,
      async (expression) => emptyValues.get(expression) ?? null
    );
    assert.deepStrictEqual(empty.graph, { vertices: [], edges: [] });
    assert.strictEqual(empty.warnings, undefined, 'Null registry heads are a valid empty graph');

    const unreadablePointer = await extractor.extract(
      layout!,
      'unreadableGraph',
      false,
      9,
      async (expression) => {
        if (expression === 'unreadableGraph.vertexHead' ||
            expression === 'unreadableGraph.edgeHead') return 'nullptr';
        if (expression === '((Vertex*)0xbad0)->value') return '1077940';
        if (expression === '((Vertex*)0xbad0)->nextVertex') {
          return '<error: Cannot access memory at address 0xbad0>';
        }
        return null;
      },
      [{ name: 'uninitialized', type: 'Vertex *', value: '0xbad0' }]
    );
    assert.deepStrictEqual(unreadablePointer.graph.vertices, []);
    assert.ok(
      unreadablePointer.warnings?.some((warning) =>
        warning.includes('unreadable required fields')
      ),
      'A vertex with an unreadable required field is omitted with a diagnostic'
    );

    const rawPointerValue = await extractor.extract(
      layout!,
      'rawPointerGraph',
      false,
      9,
      async (expression) =>
        expression.endsWith('vertexHead') || expression.endsWith('edgeHead')
          ? 'nullptr'
          : null,
      [{ name: 'garbage', type: 'Vertex *', value: '1077940' }]
    );
    assert.deepStrictEqual(rawPointerValue.graph.vertices, []);
    assert.ok(
      rawPointerValue.warnings?.some((warning) => warning.includes('Pointer variable')),
      'Unreadable pointer values remain available as concise diagnostics'
    );

    const earlyGraphValues = new Map([
      ['earlyGraph.vertexHead', '0x1000'],
      ['earlyGraph.edgeHead', '0x0'],
      ['((Vertex*)0x1000)->value', '1'],
      ['((Vertex*)0x1000)->nextVertex', 'nullptr'],
    ]);
    const earlyGraph = await extractor.extract(
      layout!,
      'earlyGraph',
      false,
      10,
      async (expression) => earlyGraphValues.get(expression) ?? null
    );
    assert.deepStrictEqual(earlyGraph.graph.vertices.map((vertex) => vertex.value), [1]);
    assert.deepStrictEqual(earlyGraph.graph.edges, []);
    assert.strictEqual(
      earlyGraph.warnings,
      undefined,
      'A partially populated registry with valid null links is a valid early snapshot'
    );

    const incrementalValues = new Map<string, string>([
      ['incremental.vertexHead', 'nullptr'],
      ['incremental.edgeHead', 'nullptr'],
      ['((Vertex*)0x1100)->value', '1'],
      ['((Vertex*)0x1100)->nextVertex', 'nullptr'],
      ['((Vertex*)0x1200)->value', '2'],
      ['((Vertex*)0x1200)->nextVertex', 'nullptr'],
      ['((Vertex*)0x1300)->value', '3'],
      ['((Vertex*)0x1300)->nextVertex', 'nullptr'],
      ['((Edge*)0x5100)->source', 'nullptr'],
      ['((Edge*)0x5100)->target', '0x1200'],
      ['((Edge*)0x5100)->nextEdge', 'nullptr'],
      ['((Edge*)0x5200)->source', '0x1200'],
      ['((Edge*)0x5200)->target', '0x1300'],
      ['((Edge*)0x5200)->weight', '10'],
      ['((Edge*)0x5200)->directed', 'true'],
      ['((Edge*)0x5200)->nextEdge', 'nullptr'],
    ]);
    const incrementalExtractor = new GraphStateExtractor();
    const evalIncremental: GraphExpressionEvaluator = async (expression) =>
      incrementalValues.get(expression) ?? null;
    const allocatedVertices = (count: number) =>
      [0x1100, 0x1200, 0x1300]
        .slice(0, count)
        .map((address, index) => ({
          name: `v${index + 1}`,
          type: 'Vertex *',
          value: `0x${address.toString(16)}`,
        }));

    const firstAllocated = await incrementalExtractor.extract(
      layout!,
      'incremental',
      false,
      1,
      evalIncremental,
      allocatedVertices(1)
    );
    const secondAllocated = await incrementalExtractor.extract(
      layout!,
      'incremental',
      false,
      2,
      evalIncremental,
      allocatedVertices(2)
    );
    const thirdAllocated = await incrementalExtractor.extract(
      layout!,
      'incremental',
      false,
      3,
      evalIncremental,
      allocatedVertices(3)
    );
    assert.deepStrictEqual(
      [firstAllocated, secondAllocated, thirdAllocated].map((state) =>
        state.graph.vertices.map((vertex) => vertex.value)
      ),
      [[1], [1, 2], [1, 2, 3]],
      'Allocated vertices appear on successive stops before registry linking'
    );
    assert.ok(
      thirdAllocated.graph.vertices.every((vertex) => vertex.isDetached),
      'Vertices outside the registry are marked detached'
    );
    assert.deepStrictEqual(
      firstAllocated.graph.vertices.map((vertex) => vertex.id),
      [secondAllocated.graph.vertices[0].id],
      'A vertex keeps its ID across snapshots'
    );
    assert.strictEqual(
      new Set(secondAllocated.graph.vertices.map((vertex) => vertex.id)).size,
      2,
      'The registry and pointer views must not duplicate vertices'
    );

    incrementalValues.set('incremental.vertexHead', '0x1100');
    incrementalValues.set('((Vertex*)0x1100)->nextVertex', '0x1200');
    incrementalValues.set('((Vertex*)0x1200)->nextVertex', '0x1300');
    const registeredVertices = await incrementalExtractor.extract(
      layout!,
      'incremental',
      false,
      4,
      evalIncremental,
      allocatedVertices(3)
    );
    assert.deepStrictEqual(
      registeredVertices.graph.vertices.map((vertex) => vertex.id),
      thirdAllocated.graph.vertices.map((vertex) => vertex.id),
      'Vertices retain their IDs as registry traversal takes over'
    );
    assert.ok(
      registeredVertices.graph.vertices.every((vertex) => !vertex.isDetached),
      'Registry membership clears detached state'
    );

    const edgePointer = [{ name: 'e1', type: 'Edge *', value: '0x5100' }];
    const uninitializedEdge = await incrementalExtractor.extract(
      layout!,
      'incremental',
      false,
      5,
      evalIncremental,
      [...allocatedVertices(3), ...edgePointer]
    );
    assert.deepStrictEqual(uninitializedEdge.graph.edges, []);
    assert.ok(
      uninitializedEdge.warnings?.some((warning) => warning.includes('null or unreadable endpoint')),
      'An edge with unavailable endpoint fields is omitted with a warning'
    );

    incrementalValues.set('((Edge*)0x5100)->source', '0x1100');
    const edgeWithoutWeight = await incrementalExtractor.extract(
      layout!,
      'incremental',
      false,
      6,
      evalIncremental,
      [...allocatedVertices(3), ...edgePointer]
    );
    assert.deepStrictEqual(edgeWithoutWeight.graph.edges, []);
    assert.ok(
      edgeWithoutWeight.warnings?.some((warning) => warning.includes('required fields')),
      'An edge is omitted until required fields are readable'
    );

    incrementalValues.set('((Edge*)0x5100)->weight', '5');
    incrementalValues.set('((Edge*)0x5100)->directed', 'true');
    const edgeReadyValues = [
      ...allocatedVertices(3),
      ...edgePointer,
    ];
    const detachedEdge = await incrementalExtractor.extract(
      layout!,
      'incremental',
      false,
      7,
      evalIncremental,
      edgeReadyValues
    );
    assert.deepStrictEqual(
      detachedEdge.graph.edges.map(({ sourceId, targetId, weight }) => [
        sourceId,
        targetId,
        weight,
      ]),
      [['vertex_1', 'vertex_2', 5]],
      'A detached edge appears when endpoints and required fields are readable'
    );
    assert.deepStrictEqual(
      detachedEdge.graph.vertices.map((vertex) => vertex.id),
      thirdAllocated.graph.vertices.map((vertex) => vertex.id),
      'Adding an edge does not duplicate its endpoint vertices'
    );

    incrementalValues.set('incremental.edgeHead', '0x5100');
    const registeredEdge = await incrementalExtractor.extract(
      layout!,
      'incremental',
      false,
      8,
      evalIncremental,
      edgeReadyValues
    );
    assert.strictEqual(registeredEdge.graph.edges.length, 1);
    assert.strictEqual(
      registeredEdge.graph.edges[0].id,
      detachedEdge.graph.edges[0].id,
      'Registering an already visible edge preserves its ID and avoids duplicates'
    );

    const secondEdgePointer = [
      { name: 'e1', type: 'Edge *', value: '0x5100' },
      { name: 'e2', type: 'Edge *', value: '0x5200' },
    ];
    const secondDetachedEdge = await incrementalExtractor.extract(
      layout!,
      'incremental',
      false,
      9,
      evalIncremental,
      [...allocatedVertices(3), ...secondEdgePointer]
    );
    assert.strictEqual(secondDetachedEdge.graph.edges.length, 2);
    assert.deepStrictEqual(
      secondDetachedEdge.graph.edges.map((edge) => edge.isDetached),
      [undefined, undefined],
      'Edges are represented from their actual fields regardless of registry membership'
    );
    incrementalValues.set('((Edge*)0x5100)->nextEdge', '0x5200');
    const linkedEdges = await incrementalExtractor.extract(
      layout!,
      'incremental',
      false,
      10,
      evalIncremental,
      [...allocatedVertices(3), ...secondEdgePointer]
    );
    assert.deepStrictEqual(
      linkedEdges.graph.edges.map((edge) => edge.id),
      secondDetachedEdge.graph.edges.map((edge) => edge.id),
      'Linking an existing edge into the registry preserves its stable ID'
    );

    const invalidRegistryValues = new Map([
      ['invalidGraph.vertexHead', '0x1000'],
      ['invalidGraph.edgeHead', 'nullptr'],
      ['((Vertex*)0x1000)->nextVertex', '0xcccccccc'],
      ['((Vertex*)0x1000)->value', '1'],
    ]);
    const invalidRegistry = await extractor.extract(
      layout!,
      'invalidGraph',
      false,
      10,
      async (expression) => invalidRegistryValues.get(expression) ?? null
    );
    assert.deepStrictEqual(
      invalidRegistry.graph.vertices,
      [],
      'A vertex with an unreadable required link field is omitted'
    );
    assert.ok(
      invalidRegistry.warnings?.some((warning) =>
        warning.includes('unreadable required fields')
      )
    );
    assert.strictEqual(invalidRegistry.isComplete, false);

    const graphSourcePath = path.join(os.tmpdir(), `simide-graph-${process.pid}.cpp`);
    const initialGraphSourcePath = path.join(
      os.tmpdir(),
      `simide-initial-graph-${process.pid}.cpp`
    );
    const initialGraphSource = graphSource.replace(
      'Graph g{nullptr, nullptr};',
      'Graph graph{nullptr, nullptr};'
    );
    fs.writeFileSync(graphSourcePath, graphSource, 'utf8');
    fs.writeFileSync(initialGraphSourcePath, initialGraphSource, 'utf8');
    try {
      StateExtractor.reset();
      StateExtractor.setActiveSourceFile(graphSourcePath);
      let debuggerLine = 42;
      let debuggerSourcePath = graphSourcePath;
      let graphVariableName = 'g';
      let graphVisible = true;
      let garbagePointersVisible = false;
      let evaluationCount = 0;
      const evaluatedExpressions: string[] = [];
      const session = {
        customRequest: async (command: string, args: Record<string, unknown>) => {
          if (command === 'stackTrace') {
            return {
              stackFrames: [
                {
                  id: 1,
                  name: 'main',
                  line: debuggerLine,
                  source: { path: debuggerSourcePath },
                },
              ],
            };
          }
          if (command === 'scopes') {
            return {
              scopes: [
                { name: 'Locals', variablesReference: 1 },
                { name: 'Globals', variablesReference: 2 },
              ],
            };
          }
          if (command === 'variables') {
            if (args.variablesReference === 2) {
              return {
                variables: garbagePointersVisible
                  ? []
                  : [{ name: 'globalVertex', type: 'Vertex *', value: '0xd000' }],
              };
            }
            return {
              variables: [
                ...(graphVisible
                  ? [{ name: graphVariableName, type: 'Graph', value: '{...}' }]
                  : []),
                ...(garbagePointersVisible
                  ? [
                      { name: 'v1', type: 'Vertex *', value: '1077940' },
                      { name: 'v2', type: 'Vertex *', value: '6422404' },
                      { name: 'v3', type: 'Vertex *', value: '1528349' },
                    ]
                  : []),
                ...(!garbagePointersVisible
                  ? [{ name: 'current', type: 'Vertex *', value: '0x2000' }]
                  : []),
              ],
            };
          }
          if (command === 'evaluate') {
            evaluationCount++;
            evaluatedExpressions.push(args.expression as string);
            return { result: values.get(args.expression as string) ?? null };
          }
          throw new Error(`Unexpected DAP request: ${command}`);
        },
      };
      const debuggerSnapshot = await StateExtractor.extractGraphState(
        session as never,
        1,
        11
      );
      assert.ok(debuggerSnapshot);
      assert.strictEqual(debuggerSnapshot.stepNumber, 11);
      assert.strictEqual(debuggerSnapshot.graph.vertices.length, 5);
      assert.strictEqual(debuggerSnapshot.graph.vertices[4].value, 99);
      assert.strictEqual(debuggerSnapshot.graph.vertices[4].isDetached, true);
      assert.strictEqual(debuggerSnapshot.graph.edges.length, 3);
      assert.strictEqual(debuggerSnapshot.pointers?.[0].targetNodeId, 'vertex_2');
      assert.strictEqual(debuggerSnapshot.source?.line, 42);

      const completedEvaluationCount = evaluationCount;
      debuggerLine =
        initialGraphSource.split('\n').findIndex((line) => line.includes('Graph graph{')) + 1;
      debuggerSourcePath = initialGraphSourcePath;
      graphVariableName = 'graph';
      StateExtractor.setActiveSourceFile(initialGraphSourcePath);
      garbagePointersVisible = true;
      const initialGraphSnapshot = await StateExtractor.extractGraphState(
        session as never,
        1,
        12
      );
      assert.ok(initialGraphSnapshot);
      assert.deepStrictEqual(initialGraphSnapshot.graph, { vertices: [], edges: [] });
      assert.strictEqual(initialGraphSnapshot.explanation, 'Graph not initialized yet.');
      assert.strictEqual(
        evaluationCount,
        completedEvaluationCount,
        'The graph registry is not dereferenced before its initializer has executed'
      );
      assert.ok(
        !JSON.stringify(initialGraphSnapshot.graph).match(/1077940|6422404|1528349/),
        'Uninitialized pointer values must never appear as graph vertex labels'
      );

      debuggerSourcePath = graphSourcePath;
      graphVariableName = 'g';
      StateExtractor.setActiveSourceFile(graphSourcePath);
      garbagePointersVisible = false;
      debuggerLine = 20;
      const prematureSnapshot = await StateExtractor.extractGraphState(
        session as never,
        1,
        13
      );
      assert.ok(prematureSnapshot);
      assert.deepStrictEqual(
        prematureSnapshot.graph.vertices.map((vertex) => vertex.value),
        [99],
        'Local pointer declarations after the current source line are not inspected'
      );
      assert.ok(prematureSnapshot.explanation.includes('not initialized'));
      assert.ok(prematureSnapshot.graph.vertices.every((vertex) => vertex.isDetached));
      assert.strictEqual(prematureSnapshot.source?.line, 20);
      assert.ok(
        !evaluatedExpressions.slice(completedEvaluationCount).some((expression) =>
          expression.startsWith('g.')
        ),
        'An uninitialized graph registry must not be dereferenced'
      );

      graphVisible = false;
      const pointersWithoutGraph = await StateExtractor.extractGraphState(
        session as never,
        1,
        13
      );
      assert.ok(pointersWithoutGraph);
      assert.deepStrictEqual(
        pointersWithoutGraph.graph.vertices.map((vertex) => vertex.value),
        [99],
        'Only safely initialized global vertices remain visible before local declarations'
      );
      assert.ok(
        pointersWithoutGraph.graph.vertices.every((vertex) => vertex.isDetached),
        'Pointer-only snapshots clearly mark vertices as detached'
      );
      assert.strictEqual(pointersWithoutGraph.isComplete, false);
    } finally {
      if (fs.existsSync(graphSourcePath)) fs.unlinkSync(graphSourcePath);
      if (fs.existsSync(initialGraphSourcePath)) fs.unlinkSync(initialGraphSourcePath);
      StateExtractor.reset();
    }

    const incrementalSourcePath = path.join(
      os.tmpdir(),
      `simide-incremental-graph-${process.pid}.cpp`
    );
    fs.writeFileSync(incrementalSourcePath, incrementalDebuggerSource, 'utf8');
    try {
      StateExtractor.reset();
      StateExtractor.setActiveSourceFile(incrementalSourcePath);
      const lines = incrementalDebuggerSource.split('\n');
      const lineOf = (statement: string) =>
        lines.findIndex((line) => line.includes(statement)) + 1;
      let debuggerLine = lineOf('Graph graph{');
      const evaluations: string[] = [];
      const valuesByExpression = new Map<string, string>([
        ['graph.vertexHead', 'nullptr'],
        ['graph.edgeHead', 'nullptr'],
        ['((Vertex*)0x1100)->value', '1'],
        ['((Vertex*)0x1100)->nextVertex', 'nullptr'],
        ['((Vertex*)0x1200)->value', '2'],
        ['((Vertex*)0x1200)->nextVertex', 'nullptr'],
        ['((Vertex*)0x1300)->value', '3'],
        ['((Vertex*)0x1300)->nextVertex', 'nullptr'],
        ['((Edge*)0x5100)->source', '0x1100'],
        ['((Edge*)0x5100)->target', '0x1200'],
        ['((Edge*)0x5100)->weight', '1'],
        ['((Edge*)0x5100)->directed', 'true'],
        ['((Edge*)0x5100)->nextEdge', 'nullptr'],
        ['((Edge*)0x5200)->source', '0x1200'],
        ['((Edge*)0x5200)->target', '0x1300'],
        ['((Edge*)0x5200)->weight', '2'],
        ['((Edge*)0x5200)->directed', 'true'],
        ['((Edge*)0x5200)->nextEdge', 'nullptr'],
      ]);
      const locals = [
        { name: 'graph', type: 'Graph', value: '{...}' },
        { name: 'v1', type: 'Vertex *', value: '0x1100' },
        { name: 'v2', type: 'Vertex *', value: '0x1200' },
        { name: 'v3', type: 'Vertex *', value: '0x1300' },
        { name: 'e1', type: 'Edge *', value: '0x5100' },
        { name: 'e2', type: 'Edge *', value: '0x5200' },
      ];
      const session = {
        customRequest: async (command: string, args: Record<string, unknown>) => {
          if (command === 'stackTrace') {
            return {
              stackFrames: [{
                id: 1,
                name: 'main',
                line: debuggerLine,
                source: { path: incrementalSourcePath },
              }],
            };
          }
          if (command === 'scopes') {
            return { scopes: [{ name: 'Locals', variablesReference: 1 }] };
          }
          if (command === 'variables') return { variables: locals };
          if (command === 'evaluate') {
            const expression = args.expression as string;
            evaluations.push(expression);
            return { result: valuesByExpression.get(expression) ?? null };
          }
          throw new Error(`Unexpected DAP request: ${command}`);
        },
      };
      const capture = (step: number) =>
        StateExtractor.extractGraphState(session as never, 1, step);
      const graphInitializerStop = await capture(1);
      assert.ok(graphInitializerStop);
      assert.deepStrictEqual(graphInitializerStop.graph, { vertices: [], edges: [] });

      debuggerLine = lineOf('Vertex* v1');
      const v1InitializerStop = await capture(2);
      assert.ok(v1InitializerStop);
      assert.deepStrictEqual(v1InitializerStop.graph.vertices, []);
      assert.ok(
        !evaluations.some((expression) => expression.includes('0x1100')),
        'v1 is not dereferenced while stopped on its initializer'
      );

      debuggerLine = lineOf('Vertex* v2');
      const v1AvailableStop = await capture(3);
      assert.ok(v1AvailableStop);
      assert.deepStrictEqual(v1AvailableStop.graph.vertices.map((vertex) => vertex.value), [1]);
      assert.ok(v1AvailableStop.graph.vertices[0].isDetached);
      assert.ok(
        !evaluations.some((expression) => expression.includes('0x1200')),
        'v2 is not dereferenced before its initializer executes'
      );

      debuggerLine = lineOf('Vertex* v3');
      const v2AvailableStop = await capture(4);
      assert.ok(v2AvailableStop);
      assert.deepStrictEqual(v2AvailableStop.graph.vertices.map((vertex) => vertex.value), [1, 2]);
      assert.ok(
        !evaluations.some((expression) => expression.includes('0x1300')),
        'v3 is not dereferenced before its initializer executes'
      );

      debuggerLine = lineOf('Edge* e1');
      const v3AvailableStop = await capture(5);
      assert.ok(v3AvailableStop);
      assert.deepStrictEqual(v3AvailableStop.graph.vertices.map((vertex) => vertex.value), [1, 2, 3]);
      assert.deepStrictEqual(v3AvailableStop.graph.edges, []);

      debuggerLine = lineOf('Edge* e2');
      const e1AvailableStop = await capture(6);
      assert.ok(e1AvailableStop);
      assert.strictEqual(e1AvailableStop.graph.edges.length, 1);
      assert.ok(
        !evaluations.some((expression) => expression.includes('0x5200')),
        'e2 is not dereferenced before its initializer executes'
      );

      debuggerLine = lineOf('return 0');
      const allObjectsAvailable = await capture(7);
      assert.ok(allObjectsAvailable);
      assert.deepStrictEqual(allObjectsAvailable.graph.vertices.map((vertex) => vertex.value), [1, 2, 3]);
      assert.strictEqual(allObjectsAvailable.graph.edges.length, 2);
      assert.ok(
        allObjectsAvailable.graph.vertices.every((vertex) => vertex.isDetached),
        'Valid unregistered vertices remain incrementally visible as detached'
      );
    } finally {
      if (fs.existsSync(incrementalSourcePath)) fs.unlinkSync(incrementalSourcePath);
      StateExtractor.reset();
    }

    const nullGraph = await extractor.extract(
      layout!,
      'nullGraph',
      true,
      10,
      async () => {
        throw new Error('Null graph pointers must not be dereferenced');
      },
      [],
      undefined,
      true
    );
    assert.deepStrictEqual(nullGraph.graph, { vertices: [], edges: [] });
    assert.strictEqual(nullGraph.isComplete, true);
    assert.strictEqual(
      nullGraph.warnings,
      undefined,
      'A null Graph pointer is a valid empty early state, not a malformed graph'
    );

    console.log('Graph state extraction tests passed.');
  })();
}

runGraphStateExtractorTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
