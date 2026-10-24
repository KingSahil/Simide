import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  describeGraphSnapshotChange,
  discoverGraphLayout,
  preservePreviousGraphObjects,
} from '../src/debug/graphStateExtractor';
import { GraphSnapshot, isGraphSnapshot } from '../src/visualization/graphModel';
import { LinkedListSnapshot } from '../src/visualization/linkedListModel';
import { SnapshotManager } from '../src/visualization/snapshotManager';
import { prepareGraphLayoutLinks } from '../webview/graphRenderer';
import {
  createUpdateStateMessage,
  isGraphUpdateStateMessage,
} from '../src/sidebar/messages';
import { selectVisualizationMode } from '../src/sidebar/visualizationMode';

const graphSource = `
struct Vertex { int value; Vertex* nextVertex; };
struct Edge {
  Vertex* source;
  Vertex* target;
  double weight;
  bool directed;
  Edge* nextEdge;
};
struct Graph { Vertex* vertexHead; Edge* edgeHead; };
`;

const legacySource = `
struct Node { int data; Node* next; };
int main() { Node* head = nullptr; }
`;

const graphSnapshot: GraphSnapshot = {
  stepNumber: 1,
  graph: {
    vertices: [{ id: 'vertex_1', value: 5 }, { id: 'vertex_2', value: 8 }],
    edges: [{ id: 'edge_1', sourceId: 'vertex_1', targetId: 'vertex_2', directed: true, weight: 2 }],
  },
  source: { file: 'graph.cpp', line: 10, functionName: 'main' },
  explanation: 'Graph state captured.',
  changeType: 'init',
  terminalOutput: 'Graph ready\n',
  warnings: ['One edge was omitted.'],
};

const listSnapshot: LinkedListSnapshot = {
  stepNumber: 2,
  structureType: 'linked_list',
  hasHead: true,
  headId: null,
  nodes: [],
  explanation: 'Empty linked list.',
  changeType: 'init',
};

const treeSnapshot: LinkedListSnapshot = {
  ...listSnapshot,
  structureType: 'tree',
  explanation: 'Empty binary tree.',
};

const updatePayload = {
  canStepNext: true,
  canStepPrev: false,
  canContinue: false,
  canPause: false,
  canRestart: true,
  isPaused: true,
  isRunning: false,
  totalSnapshots: 1,
  currentSnapshotIndex: 0,
};

function runGraphIntegrationTests(): void {
  const graphExamplePath = path.resolve(process.cwd(), 'examples', 'graph-registry.cpp');
  assert.ok(
    discoverGraphLayout(fs.readFileSync(graphExamplePath, 'utf8')),
    'The example must match the runtime-supported C++ registry layout'
  );
  assert.strictEqual(selectVisualizationMode(graphSource), 'graph');
  assert.strictEqual(
    selectVisualizationMode(`${legacySource}\nGraph* unrelatedName = nullptr;`),
    'linked_list',
    'Graph mode must be selected from the validated registry layout, not variable names'
  );
  assert.strictEqual(selectVisualizationMode(legacySource), 'linked_list');

  const graphMessage = createUpdateStateMessage(graphSnapshot, updatePayload);
  const listMessage = createUpdateStateMessage(listSnapshot, updatePayload);
  const treeMessage = createUpdateStateMessage(treeSnapshot, updatePayload);
  assert.strictEqual(graphMessage.visualizationMode, 'graph');
  assert.strictEqual(listMessage.visualizationMode, 'linked_list');
  assert.strictEqual(treeMessage.visualizationMode, 'linked_list');
  assert.strictEqual(
    treeMessage.visualizationMode === 'linked_list' &&
      treeMessage.snapshot.structureType === 'tree',
    true,
    'Tree snapshots retain their legacy structure discriminator and payload'
  );
  assert.strictEqual(isGraphUpdateStateMessage(graphMessage), true);
  assert.strictEqual(isGraphUpdateStateMessage(listMessage), false);
  assert.strictEqual(isGraphSnapshot(graphMessage.snapshot), true);
  assert.strictEqual(isGraphSnapshot(listMessage.snapshot), false);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(graphMessage)), graphMessage);
  assert.strictEqual(graphMessage.snapshot.source?.line, 10);
  assert.strictEqual(graphMessage.snapshot.terminalOutput, 'Graph ready\n');

  const incompleteGraphState: GraphSnapshot = {
    ...graphSnapshot,
    stepNumber: 2,
    graph: { vertices: [], edges: [] },
    isComplete: false,
  };
  const preservedGraphState = preservePreviousGraphObjects(
    graphSnapshot,
    incompleteGraphState
  );
  assert.deepStrictEqual(
    preservedGraphState.graph,
    graphSnapshot.graph,
    'A partial registry read retains previously observed graph objects'
  );
  assert.ok(
    preservedGraphState.warnings?.some((warning) => warning.includes('retained until removal is confirmed')),
    'Retained objects are explained as last-known state'
  );
  const completeEmptyGraph: GraphSnapshot = {
    ...incompleteGraphState,
    isComplete: true,
  };
  assert.deepStrictEqual(
    preservePreviousGraphObjects(graphSnapshot, completeEmptyGraph).graph,
    { vertices: [], edges: [] },
    'A complete empty registry confirms graph-object removal'
  );

  const incrementalHistory = new SnapshotManager();
  const incrementalStates: GraphSnapshot[] = [
    {
      ...graphSnapshot,
      stepNumber: 1,
      graph: { vertices: [{ id: 'vertex_1', value: 1 }], edges: [] },
      changeType: 'vertex_created',
    },
    {
      ...graphSnapshot,
      stepNumber: 2,
      graph: {
        vertices: [
          { id: 'vertex_1', value: 1 },
          { id: 'vertex_2', value: 2 },
        ],
        edges: [],
      },
      changeType: 'vertex_created',
    },
    {
      ...graphSnapshot,
      stepNumber: 3,
      graph: {
        vertices: [
          { id: 'vertex_1', value: 1 },
          { id: 'vertex_2', value: 2 },
        ],
        edges: [
          {
            id: 'edge_1',
            sourceId: 'vertex_1',
            targetId: 'vertex_2',
            directed: true,
            weight: 5,
          },
        ],
      },
      changeType: 'edge_created',
    },
  ];
  const sentMessages = incrementalStates.map((state) => {
    incrementalHistory.addSnapshot(state);
    return createUpdateStateMessage(state, {
      ...updatePayload,
      totalSnapshots: incrementalHistory.totalSnapshots,
      currentSnapshotIndex: incrementalHistory.currentSnapshotIndex,
      canStepPrev: incrementalHistory.canGoPrev(),
    });
  });
  assert.deepStrictEqual(
    sentMessages.map((message) => {
      assert.strictEqual(message.visualizationMode, 'graph');
      return [
        message.snapshot.graph.vertices.length,
        message.snapshot.graph.edges.length,
      ];
    }),
    [[1, 0], [2, 0], [2, 1]],
    'Each provider update carries the graph state captured at that debugger stop'
  );
  assert.deepStrictEqual(
    sentMessages.map((message) => message.snapshot.stepNumber),
    [1, 2, 3],
    'The webview protocol preserves the order of incremental graph snapshots'
  );
  assert.deepStrictEqual(
    sentMessages.map((message) =>
      prepareGraphLayoutLinks(message.snapshot.graph).length
    ),
    [0, 0, 1],
    'The renderer receives no edge before it exists and adds it on the matching snapshot'
  );
  assert.strictEqual(incrementalHistory.prev()?.stepNumber, 2);
  assert.strictEqual(incrementalHistory.nextHistory()?.stepNumber, 3);

  const manager = new SnapshotManager();
  manager.addSnapshot(graphSnapshot);
  const secondGraphSnapshot: GraphSnapshot = {
    ...graphSnapshot,
    stepNumber: 2,
    source: { file: 'graph.cpp', line: 14, functionName: 'main' },
    graph: {
      vertices: [
        { id: 'vertex_1', value: 5 },
        { id: 'vertex_2', value: 8 },
        { id: 'vertex_3', value: 13 },
      ],
      edges: [
        { id: 'edge_1', sourceId: 'vertex_1', targetId: 'vertex_2', directed: true, weight: 3 },
        { id: 'edge_2', sourceId: 'vertex_2', targetId: 'vertex_1', directed: false, weight: 4 },
        { id: 'edge_3', sourceId: 'vertex_3', targetId: 'vertex_3', directed: true },
      ],
    },
  };
  const change = describeGraphSnapshotChange(graphSnapshot, secondGraphSnapshot);
  assert.strictEqual(change.changeType, 'edge_created');
  assert.ok(change.explanation.includes('1 vertex added'));
  assert.ok(change.explanation.includes('2 edges added'));
  assert.ok(change.explanation.includes('self-loop'));
  assert.ok(change.explanation.includes('disconnected component'));

  const edgeUpdateSnapshot: GraphSnapshot = {
    ...graphSnapshot,
    stepNumber: 4,
    graph: {
      ...graphSnapshot.graph,
      edges: [{
        id: 'edge_1',
        sourceId: 'vertex_1',
        targetId: 'vertex_2',
        directed: false,
        weight: 9,
      }],
    },
  };
  const edgeUpdate = describeGraphSnapshotChange(graphSnapshot, edgeUpdateSnapshot);
  assert.strictEqual(edgeUpdate.changeType, 'edge_updated');
  assert.ok(edgeUpdate.explanation.includes('direction, endpoint, or weight update'));

  const thirdGraphSnapshot: GraphSnapshot = {
    ...secondGraphSnapshot,
    stepNumber: 3,
    source: { file: 'graph.cpp', line: 18, functionName: 'main' },
    graph: {
      vertices: [{ id: 'vertex_1', value: 9 }, { id: 'vertex_2', value: 8 }],
      edges: [],
    },
  };
  const removalChange = describeGraphSnapshotChange(secondGraphSnapshot, thirdGraphSnapshot);
  assert.strictEqual(removalChange.changeType, 'edge_removed');
  assert.ok(removalChange.explanation.includes('vertex removed'));
  assert.ok(removalChange.explanation.includes('vertex value changed'));
  assert.ok(removalChange.explanation.includes('edges removed'));
  const detachedVertexState: GraphSnapshot = {
    ...graphSnapshot,
    graph: {
      vertices: [{ id: 'vertex_1', value: 5, isDetached: true }],
      edges: [],
    },
  };
  const registeredVertexState: GraphSnapshot = {
    ...detachedVertexState,
    stepNumber: detachedVertexState.stepNumber + 1,
    graph: {
      vertices: [{ id: 'vertex_1', value: 5, isDetached: false }],
      edges: [],
    },
  };
  const registrationChange = describeGraphSnapshotChange(
    detachedVertexState,
    registeredVertexState
  );
  assert.strictEqual(registrationChange.changeType, 'vertex_updated');
  assert.ok(registrationChange.explanation.includes('registry membership update'));

  manager.addSnapshot(secondGraphSnapshot);
  manager.addSnapshot(thirdGraphSnapshot);
  assert.strictEqual(manager.getCurrentSnapshot()?.stepNumber, 3);
  assert.strictEqual(manager.prev()?.stepNumber, 2);
  assert.strictEqual(isGraphSnapshot(manager.getCurrentSnapshot()), true);
  assert.strictEqual(manager.getCurrentSnapshot()?.isHistorical, true);
  assert.strictEqual(manager.getCurrentSnapshot()?.source?.line, 14);
  assert.strictEqual(manager.nextHistory()?.stepNumber, 3);
  assert.strictEqual(manager.getCurrentSnapshot()?.source?.line, 18);
  assert.strictEqual(isGraphSnapshot(manager.getCurrentSnapshot()), true);
  assert.strictEqual(manager.getCurrentSnapshot()?.isHistorical, false);
  manager.prev();
  const liveAfterHistory: GraphSnapshot = {
    ...thirdGraphSnapshot,
    stepNumber: 4,
    source: { file: 'graph.cpp', line: 19, functionName: 'main' },
  };
  manager.addSnapshot(liveAfterHistory);
  assert.strictEqual(manager.totalSnapshots, 4);
  assert.strictEqual(manager.getCurrentSnapshot()?.stepNumber, 4);
  assert.strictEqual(manager.canGoPrev(), true);

  console.log('Graph integration tests passed.');
}

runGraphIntegrationTests();
