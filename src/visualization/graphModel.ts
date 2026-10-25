import { LinkedListSnapshot, SourceLocation } from './linkedListModel';

export interface Vertex {
  /** Stable ID assigned by the extractor, typically from the runtime address. */
  id: string;
  value: number | string;
  isDetached?: boolean;
  isVisiting?: boolean;
  isNewlyCreated?: boolean;
}

export interface Edge {
  /** Distinguishes separate edge objects, including parallel edges. */
  id: string;
  sourceId: string;
  targetId: string;
  directed: boolean;
  weight?: number;
  label?: string;
  isTraversed?: boolean;
}

/**
 * Serializable projection of the supported C++ registry representation:
 * Graph owns vertexHead and edgeHead; Vertex has nextVertex; Edge has source,
 * target, weight, directed, and nextEdge. Registry links discover objects at
 * runtime but are not included in this transport model.
 */
export interface Graph {
  vertices: Vertex[];
  edges: Edge[];
}

export interface GraphPointerVariable {
  name: string;
  targetNodeId: string | null;
  isNull: boolean;
}

export type GraphChangeType =
  | 'init'
  | 'vertex_created'
  | 'vertex_updated'
  | 'vertex_removed'
  | 'edge_created'
  | 'edge_updated'
  | 'edge_removed'
  | 'vertex_visited'
  | 'edge_visited'
  | 'step'
  | 'final';

export interface GraphSnapshot {
  stepNumber: number;
  graph: Graph;
  source?: SourceLocation;
  pointers?: GraphPointerVariable[];
  activeVertexId?: string | null;
  activeEdgeId?: string | null;
  explanation: string;
  changeType: GraphChangeType;
  terminalOutput?: string;
  isHistorical?: boolean;
  warnings?: string[];
  isComplete?: boolean;
}

export type VisualizationSnapshot = LinkedListSnapshot | GraphSnapshot;

export function isGraphSnapshot(snapshot: unknown): snapshot is GraphSnapshot {
  if (!snapshot || typeof snapshot !== 'object' || !('graph' in snapshot)) return false;
  const graph = snapshot.graph;
  if (
    typeof graph !== 'object' ||
    graph === null ||
    !('vertices' in graph) ||
    !('edges' in graph)
  ) {
    return false;
  }
  return Array.isArray(graph.vertices) && Array.isArray(graph.edges);
}
