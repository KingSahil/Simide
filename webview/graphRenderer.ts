import {
  Edge,
  Graph,
  GraphSnapshot,
  isGraphSnapshot,
} from '../src/visualization/graphModel';

export interface GraphLayoutLink {
  source: string;
  target: string;
  distance: number;
  strength: number;
}

export interface GraphEdgeLane {
  index: number;
  count: number;
  offset: number;
}

export interface GraphEdgeGeometry {
  path: string;
  labelX: number;
  labelY: number;
  controlPoints: Array<{ x: number; y: number }>;
}

export interface GraphBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GraphCameraFit {
  scale: number;
  panX: number;
  panY: number;
}

export interface GraphNodePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function hasNewGraphVertices(previous: Graph | undefined, current: Graph): boolean {
  if (!current.vertices.length) return false;
  if (!previous) return true;
  const previousIds = new Set(previous.vertices.map((vertex) => vertex.id));
  return current.vertices.some((vertex) => !previousIds.has(vertex.id));
}

export function getGraphEdgeMarker(edge: Edge, highlighted: boolean): string | null {
  if (!edge.directed) return null;
  return highlighted ? 'url(#arrowHeadGreen)' : 'url(#arrowHead)';
}

export function getGraphEdgeLabel(edge: Edge): string | null {
  if (edge.label && edge.weight !== undefined) {
    return `${edge.label} (${edge.weight})`;
  }
  return edge.label || (edge.weight !== undefined ? String(edge.weight) : null);
}

export function prepareGraphLayoutLinks(graph: Graph): GraphLayoutLink[] {
  const vertexIds = new Set(graph.vertices.map((vertex) => vertex.id));
  const seenPairs = new Set<string>();
  const links: GraphLayoutLink[] = [];

  for (const edge of graph.edges) {
    if (
      edge.sourceId === edge.targetId ||
      !vertexIds.has(edge.sourceId) ||
      !vertexIds.has(edge.targetId)
    ) {
      continue;
    }

    const pair = [edge.sourceId, edge.targetId].sort().join('\u0000');
    if (seenPairs.has(pair)) continue;
    seenPairs.add(pair);
    links.push({
      source: edge.sourceId,
      target: edge.targetId,
      distance: 130,
      strength: 0.5,
    });
  }

  return links;
}

export function prepareGraphEdgeLanes(edges: Edge[]): Map<string, GraphEdgeLane> {
  const groups = new Map<string, Edge[]>();
  for (const edge of edges) {
    const pair = [edge.sourceId, edge.targetId].sort().join('\u0000');
    const group = groups.get(pair) || [];
    group.push(edge);
    groups.set(pair, group);
  }

  const lanes = new Map<string, GraphEdgeLane>();
  for (const group of groups.values()) {
    group.forEach((edge, index) => {
      const orderedEndpoints = [edge.sourceId, edge.targetId].sort();
      const orientation = edge.sourceId === orderedEndpoints[0] ? 1 : -1;
      const offset = (index - (group.length - 1) / 2) * 30 * orientation;
      lanes.set(edge.id, { index, count: group.length, offset });
    });
  }
  return lanes;
}

export function getGraphEdgeGeometry(
  source: { x: number; y: number },
  target: { x: number; y: number },
  nodeRadius: number,
  lane: GraphEdgeLane
): GraphEdgeGeometry {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.hypot(dx, dy);

  if (distance < 0.001) {
    const loopRadius = nodeRadius + 22 + lane.index * 16;
    const startAngle = (-45 * Math.PI) / 180;
    const endAngle = (-135 * Math.PI) / 180;
    const start = {
      x: source.x + Math.cos(startAngle) * nodeRadius,
      y: source.y + Math.sin(startAngle) * nodeRadius,
    };
    const end = {
      x: source.x + Math.cos(endAngle) * nodeRadius,
      y: source.y + Math.sin(endAngle) * nodeRadius,
    };
    const controlY = source.y - loopRadius * 2;
    return {
      path: `M ${start.x} ${start.y} C ${source.x + loopRadius} ${controlY}, ${
        source.x - loopRadius
      } ${controlY}, ${end.x} ${end.y}`,
      labelX: source.x,
      labelY: controlY,
      controlPoints: [
        { x: source.x + loopRadius, y: controlY },
        { x: source.x - loopRadius, y: controlY },
      ],
    };
  }

  const normalX = -dy / distance;
  const normalY = dx / distance;
  const control = {
    x: (source.x + target.x) / 2 + normalX * lane.offset,
    y: (source.y + target.y) / 2 + normalY * lane.offset,
  };
  const sourceScale =
    nodeRadius / Math.hypot(control.x - source.x, control.y - source.y);
  const targetScale =
    nodeRadius / Math.hypot(control.x - target.x, control.y - target.y);
  const start = {
    x: source.x + (control.x - source.x) * sourceScale,
    y: source.y + (control.y - source.y) * sourceScale,
  };
  const end = {
    x: target.x + (control.x - target.x) * targetScale,
    y: target.y + (control.y - target.y) * targetScale,
  };

  return {
    path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    labelX: (start.x + 2 * control.x + end.x) / 4,
    labelY: (start.y + 2 * control.y + end.y) / 4,
    controlPoints: [control],
  };
}

export function getGraphContentBounds(
  graph: Graph,
  positions: ReadonlyMap<string, GraphNodePosition>
): GraphBounds | null {
  let bounds: GraphBounds | null = null;
  const addPoint = (x: number, y: number, padding: number = 0) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const pointBounds = {
      minX: x - padding,
      minY: y - padding,
      maxX: x + padding,
      maxY: y + padding,
    };
    if (!bounds) {
      bounds = pointBounds;
      return;
    }
    bounds.minX = Math.min(bounds.minX, pointBounds.minX);
    bounds.minY = Math.min(bounds.minY, pointBounds.minY);
    bounds.maxX = Math.max(bounds.maxX, pointBounds.maxX);
    bounds.maxY = Math.max(bounds.maxY, pointBounds.maxY);
  };

  for (const vertex of graph.vertices) {
    const position = positions.get(vertex.id);
    if (!position) continue;
    addPoint(position.x, position.y);
    addPoint(position.x + position.width, position.y + position.height);
  }

  const lanes = prepareGraphEdgeLanes(graph.edges);
  for (const edge of graph.edges) {
    const sourcePosition = positions.get(edge.sourceId);
    const targetPosition = positions.get(edge.targetId);
    const lane = lanes.get(edge.id);
    if (!sourcePosition || !targetPosition || !lane) continue;

    const source = {
      x: sourcePosition.x + sourcePosition.width / 2,
      y: sourcePosition.y + sourcePosition.height / 2,
    };
    const target = {
      x: targetPosition.x + targetPosition.width / 2,
      y: targetPosition.y + targetPosition.height / 2,
    };
    const radius = Math.min(
      sourcePosition.width,
      sourcePosition.height,
      targetPosition.width,
      targetPosition.height
    ) / 2;
    const geometry = getGraphEdgeGeometry(source, target, radius, lane);
    for (const point of geometry.controlPoints) {
      addPoint(point.x, point.y, 10);
    }
    const label = getGraphEdgeLabel(edge);
    if (label) {
      addPoint(geometry.labelX, geometry.labelY, 12);
      addPoint(geometry.labelX - label.length * 3.5, geometry.labelY - 12);
      addPoint(geometry.labelX + label.length * 3.5, geometry.labelY + 12);
    }
  }

  return bounds;
}

export function calculateGraphCameraFit(
  bounds: GraphBounds,
  viewportWidth: number,
  viewportHeight: number,
  padding: number = 24
): GraphCameraFit | null {
  if (
    viewportWidth <= padding * 2 ||
    viewportHeight <= padding * 2 ||
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight)
  ) {
    return null;
  }

  const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(
    2.5,
    (viewportWidth - padding * 2) / contentWidth,
    (viewportHeight - padding * 2) / contentHeight
  );
  return {
    scale,
    panX: (viewportWidth - contentWidth * scale) / 2 - bounds.minX * scale,
    panY: (viewportHeight - contentHeight * scale) / 2 - bounds.minY * scale,
  };
}

export { isGraphSnapshot };
