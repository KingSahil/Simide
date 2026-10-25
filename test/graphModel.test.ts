import * as assert from 'assert';
import { Edge, Graph, GraphSnapshot, Vertex } from '../src/visualization/graphModel';

function createSnapshot(graph: Graph): GraphSnapshot {
  return {
    stepNumber: 1,
    graph,
    pointers: [{ name: 'current', targetNodeId: null, isNull: true }],
    explanation: 'Graph state',
    changeType: graph.vertices.length === 0 ? 'init' : 'step',
  };
}

function assertEdgeReferences(graph: Graph): void {
  const vertexIds = new Set(graph.vertices.map((vertex) => vertex.id));
  for (const edge of graph.edges) {
    assert.ok(vertexIds.has(edge.sourceId), `Unknown edge source: ${edge.sourceId}`);
    assert.ok(vertexIds.has(edge.targetId), `Unknown edge target: ${edge.targetId}`);
  }
}

function runGraphModelTests(): void {
  const emptySnapshot = createSnapshot({ vertices: [], edges: [] });
  assert.deepStrictEqual(emptySnapshot.graph.vertices, []);
  assert.deepStrictEqual(emptySnapshot.graph.edges, []);
  assert.strictEqual(emptySnapshot.changeType, 'init');

  const vertices: Vertex[] = [
    { id: 'vertex_1', value: 'A' },
    { id: 'vertex_2', value: 'B' },
    { id: 'vertex_3', value: 'C', isDetached: true },
    { id: 'vertex_4', value: 'D', isDetached: true },
  ];
  const directedEdge: Edge = {
    id: 'edge_1',
    sourceId: 'vertex_1',
    targetId: 'vertex_2',
    directed: true,
    weight: 4,
  };
  const undirectedEdge: Edge = {
    id: 'edge_2',
    sourceId: 'vertex_2',
    targetId: 'vertex_1',
    directed: false,
    label: 'two-way',
  };
  const selfLoop: Edge = {
    id: 'edge_3',
    sourceId: 'vertex_1',
    targetId: 'vertex_1',
    directed: true,
  };
  const parallelEdge: Edge = {
    id: 'edge_4',
    sourceId: 'vertex_1',
    targetId: 'vertex_2',
    directed: true,
    weight: 7,
  };
  const disconnectedEdge: Edge = {
    id: 'edge_5',
    sourceId: 'vertex_3',
    targetId: 'vertex_4',
    directed: false,
  };
  const graph: Graph = {
    vertices,
    edges: [directedEdge, undirectedEdge, selfLoop, parallelEdge, disconnectedEdge],
  };

  assertEdgeReferences(graph);
  assert.strictEqual(directedEdge.directed, true);
  assert.strictEqual(directedEdge.weight, 4);
  assert.strictEqual(undirectedEdge.directed, false);
  assert.strictEqual(undirectedEdge.weight, undefined);
  assert.strictEqual(selfLoop.sourceId, selfLoop.targetId);
  assert.notStrictEqual(directedEdge.id, parallelEdge.id);
  assert.strictEqual(directedEdge.sourceId, parallelEdge.sourceId);
  assert.strictEqual(directedEdge.targetId, parallelEdge.targetId);
  assert.strictEqual(vertices[2].isDetached, true);
  assert.deepStrictEqual([disconnectedEdge.sourceId, disconnectedEdge.targetId], [
    'vertex_3',
    'vertex_4',
  ]);

  const snapshot = createSnapshot(graph);
  const serialized = JSON.stringify(snapshot);
  assert.deepStrictEqual(JSON.parse(serialized), snapshot);
  assert.ok(!serialized.includes('[object Object]'));
  assert.ok(!serialized.includes('0x'), 'Snapshots must not contain runtime pointer addresses');
  assert.strictEqual(snapshot.pointers?.[0].targetNodeId, null);

  console.log('Graph model tests passed.');
}

runGraphModelTests();
