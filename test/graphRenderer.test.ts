import * as assert from 'assert';
import {
  getGraphEdgeGeometry,
  getGraphEdgeLabel,
  getGraphEdgeMarker,
  calculateGraphCameraFit,
  getGraphContentBounds,
  hasNewGraphVertices,
  isGraphSnapshot,
  prepareGraphEdgeLanes,
  prepareGraphLayoutLinks,
} from '../webview/graphRenderer';
import { Graph, GraphSnapshot } from '../src/visualization/graphModel';

function runGraphRendererTests(): void {
  const graph: Graph = {
    vertices: [
      { id: 'a', value: 'A' },
      { id: 'b', value: 'B' },
      { id: 'c', value: 'C' },
    ],
    edges: [
      { id: 'ab-1', sourceId: 'a', targetId: 'b', directed: true },
      { id: 'ab-2', sourceId: 'a', targetId: 'b', directed: false, weight: 3 },
      { id: 'ba', sourceId: 'b', targetId: 'a', directed: true },
      { id: 'loop', sourceId: 'a', targetId: 'a', directed: true },
      { id: 'bc', sourceId: 'b', targetId: 'c', directed: false },
      { id: 'missing', sourceId: 'b', targetId: 'unknown', directed: true },
    ],
  };

  assert.deepStrictEqual(
    prepareGraphLayoutLinks(graph).map(({ source, target }) => [source, target]),
    [
      ['a', 'b'],
      ['b', 'c'],
    ],
    'The force layout should include valid connected pairs once and omit loops or invalid endpoints'
  );

  const lanes = prepareGraphEdgeLanes(graph.edges);
  assert.deepStrictEqual(lanes.get('ab-1'), { index: 0, count: 3, offset: -30 });
  assert.deepStrictEqual(lanes.get('ab-2'), { index: 1, count: 3, offset: 0 });
  assert.deepStrictEqual(lanes.get('ba'), { index: 2, count: 3, offset: -30 });
  assert.strictEqual(getGraphEdgeMarker(graph.edges[0], false), 'url(#arrowHead)');
  assert.strictEqual(getGraphEdgeMarker(graph.edges[0], true), 'url(#arrowHeadGreen)');
  assert.strictEqual(getGraphEdgeMarker(graph.edges[1], false), null);
  assert.strictEqual(getGraphEdgeLabel(graph.edges[1]), '3');
  assert.strictEqual(
    getGraphEdgeLabel({ ...graph.edges[1], label: 'cost' }),
    'cost (3)'
  );

  const firstParallel = getGraphEdgeGeometry(
    { x: 0, y: 0 },
    { x: 120, y: 0 },
    27,
    lanes.get('ab-1')!
  );
  const secondParallel = getGraphEdgeGeometry(
    { x: 0, y: 0 },
    { x: 120, y: 0 },
    27,
    lanes.get('ab-2')!
  );
  assert.notStrictEqual(firstParallel.path, secondParallel.path);
  assert.notStrictEqual(firstParallel.labelY, secondParallel.labelY);
  const reverseParallel = getGraphEdgeGeometry(
    { x: 120, y: 0 },
    { x: 0, y: 0 },
    27,
    lanes.get('ba')!
  );
  assert.notStrictEqual(
    firstParallel.path,
    reverseParallel.path,
    'Opposite directed edges should occupy distinct curves'
  );

  const loop = getGraphEdgeGeometry(
    { x: 20, y: 30 },
    { x: 20, y: 30 },
    27,
    lanes.get('loop')!
  );
  assert.ok(loop.path.includes('C'), 'Self-loops should use a cubic loop path');
  assert.ok(loop.labelY < 30, 'Self-loop labels should appear above the vertex');

  const renderGraph: Graph = {
    vertices: [
      { id: 'left', value: 1 },
      { id: 'right', value: 2 },
      { id: 'isolated', value: 3 },
    ],
    edges: [
      { id: 'parallel-a', sourceId: 'left', targetId: 'right', directed: true, weight: 2.5 },
      { id: 'parallel-b', sourceId: 'right', targetId: 'left', directed: false, weight: 7 },
      { id: 'self', sourceId: 'isolated', targetId: 'isolated', directed: true, weight: 1 },
    ],
  };
  const positions = new Map([
    ['left', { x: 20, y: 20, width: 76, height: 54 }],
    ['right', { x: 220, y: 120, width: 76, height: 54 }],
    ['isolated', { x: 420, y: 360, width: 76, height: 54 }],
  ]);
  const contentBounds = getGraphContentBounds(renderGraph, positions);
  assert.ok(contentBounds);
  assert.ok(contentBounds.minY < 360, 'Self-loop and labels extend the bounds above their node');
  assert.ok(contentBounds.maxX > 496, 'Disconnected vertices are included in the bounds');

  const cameraFit = calculateGraphCameraFit(contentBounds, 300, 220);
  assert.ok(cameraFit);
  for (const coordinate of [
    contentBounds.minX,
    contentBounds.maxX,
  ]) {
    const screenX = coordinate * cameraFit.scale + cameraFit.panX;
    assert.ok(screenX >= 23 && screenX <= 277, 'Fitted graph stays inside horizontal padding');
  }
  for (const coordinate of [
    contentBounds.minY,
    contentBounds.maxY,
  ]) {
    const screenY = coordinate * cameraFit.scale + cameraFit.panY;
    assert.ok(screenY >= 23 && screenY <= 197, 'Fitted graph stays inside vertical padding');
  }
  assert.strictEqual(getGraphContentBounds({ vertices: [], edges: [] }, new Map()), null);
  assert.strictEqual(calculateGraphCameraFit(contentBounds, 20, 20), null);
  const updatedGraph: Graph = {
    vertices: [{ id: 'left', value: 1 }, { id: 'isolated', value: 3 }],
    edges: [],
  };
  assert.deepStrictEqual(
    prepareGraphLayoutLinks(updatedGraph),
    [],
    'A refreshed snapshot must not retain links from the previous graph state'
  );
  assert.strictEqual(
    getGraphContentBounds(updatedGraph, positions)?.maxX,
    496,
    'Refreshed bounds must no longer include removed edges'
  );
  assert.strictEqual(hasNewGraphVertices(undefined, { vertices: [], edges: [] }), false);
  assert.strictEqual(hasNewGraphVertices(undefined, { vertices: [graph.vertices[0]], edges: [] }), true);
  assert.strictEqual(
    hasNewGraphVertices(
      { vertices: [graph.vertices[0]], edges: [] },
      { vertices: [{ ...graph.vertices[0], value: 'updated' }], edges: [] }
    ),
    false,
    'Updating an existing vertex does not request a camera refit'
  );
  assert.strictEqual(
    hasNewGraphVertices(
      { vertices: [graph.vertices[0]], edges: [] },
      { vertices: [graph.vertices[0], graph.vertices[1]], edges: [] }
    ),
    true,
    'Adding a far-away second vertex requests a refit'
  );
  assert.strictEqual(
    hasNewGraphVertices(
      { vertices: [graph.vertices[0], graph.vertices[1]], edges: [] },
      { vertices: [graph.vertices[0], graph.vertices[1], graph.vertices[2]], edges: [] }
    ),
    true,
    'Adding subsequent vertices requests a refit'
  );
  assert.strictEqual(
    hasNewGraphVertices(
      { vertices: [graph.vertices[0], graph.vertices[1]], edges: [] },
      { vertices: [graph.vertices[0], graph.vertices[1]], edges: [graph.edges[0]] }
    ),
    false,
    'Adding or updating edges without new vertices preserves the camera'
  );

  const snapshot: GraphSnapshot = {
    stepNumber: 1,
    graph,
    explanation: 'Graph state',
    changeType: 'step',
  };
  assert.strictEqual(isGraphSnapshot(snapshot), true);
  assert.strictEqual(isGraphSnapshot({ stepNumber: 1, nodes: [] }), false);

  console.log('Graph renderer tests passed.');
}

runGraphRendererTests();
