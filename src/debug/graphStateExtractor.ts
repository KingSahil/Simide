import {
  Edge,
  Graph,
  GraphPointerVariable,
  GraphSnapshot,
  Vertex,
} from '../visualization/graphModel';
import { SourceLocation } from '../visualization/linkedListModel';

export interface GraphLayout {
  graphType: string;
  vertexType: string;
  edgeType: string;
  vertexValueField: string;
}

export interface GraphSnapshotChange {
  changeType: GraphSnapshot['changeType'];
  explanation: string;
}

export function preservePreviousGraphObjects(
  previous: GraphSnapshot | undefined,
  current: GraphSnapshot
): GraphSnapshot {
  if (!previous || current.isComplete !== false) return current;

  const vertices = [...current.graph.vertices];
  const vertexIds = new Set(vertices.map((vertex) => vertex.id));
  for (const vertex of previous.graph.vertices) {
    if (!vertexIds.has(vertex.id)) {
      vertices.push(vertex);
      vertexIds.add(vertex.id);
    }
  }

  const edges = [...current.graph.edges];
  const edgeIds = new Set(edges.map((edge) => edge.id));
  for (const edge of previous.graph.edges) {
    if (
      !edgeIds.has(edge.id) &&
      vertexIds.has(edge.sourceId) &&
      vertexIds.has(edge.targetId)
    ) {
      edges.push(edge);
      edgeIds.add(edge.id);
    }
  }

  return {
    ...current,
    graph: { vertices, edges },
    warnings: [...new Set([
      ...(current.warnings || []),
      'Registry state could not be fully read; previously observed objects are retained until removal is confirmed.',
    ])],
  };
}

export interface DebuggerPointerVariable {
  name: string;
  type?: string;
  value: string;
}

export type GraphExpressionEvaluator = (expression: string) => Promise<string | null>;

const MAX_REGISTRY_OBJECTS = 500;
const INVALID_POINTER_VALUES = new Set([
  '0xbaadf00d',
  '0xcccccccc',
  '0xcdcdcdcd',
  '0xfeeefeee',
  '0xabababab',
]);

function getTypeBody(source: string, typeName: string): string | null {
  const escapedName = typeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declaration = new RegExp(`(?:struct|class)\\s+${escapedName}\\s*\\{`, 'g');
  const match = declaration.exec(source);
  if (!match) return null;

  const openBrace = source.indexOf('{', match.index);
  let depth = 1;
  for (let i = openBrace + 1; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) {
      return source.slice(openBrace + 1, i);
    }
  }
  return null;
}

function getMemberType(body: string, memberName: string): string | null {
  for (const statement of body.split(';')) {
    const clean = statement
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/.*$/gm, ' ')
      .replace(/^\s*(public|private|protected)\s*:\s*/gm, '')
      .trim();
    const match = clean.match(
      new RegExp(`^(?:struct\\s+)?((?:const\\s+)?[\\w:]+(?:\\s*<[^;>]+>)?)\\s*([*&]+)?\\s*${memberName}\\s*(?:=[\\s\\S]*)?$`)
    );
    if (match) {
      return `${match[1].replace(/^const\s+/, '').trim()}${(match[2] || '').replace(/\s/g, '')}`;
    }
  }
  return null;
}

function baseType(type: string | null): string | null {
  if (!type) return null;
  return type.replace(/\s*[*&]+\s*$/, '').replace(/^struct\s+/, '').trim();
}

function isPointerToType(type: string | null, typeName: string): boolean {
  if (!type) return false;
  const normalized = type
    .replace(/\b(?:const|volatile)\b/g, '')
    .replace(/^struct\s+/, '')
    .replace(/\s+/g, '')
    .trim();
  return normalized === `${typeName}*`;
}

export interface GraphVariableDeclaration {
  line: number;
  initialized: boolean;
}

export function isGraphPointerInitializedAtSource(
  source: string,
  pointerType: string,
  variableName: string,
  currentLine: number
): boolean {
  const sourceWithoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, (comment) => comment.replace(/[^\n]/g, ' '));
  const escapedType = pointerType
    .replace(/^struct\s+/, '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedName = variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declarationPattern = new RegExp(
    `\\b(?:struct\\s+)?${escapedType}\\s*\\*+\\s*${escapedName}\\b`,
    'g'
  );
  const declarations: Array<{ line: number; initialized: boolean; end: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = declarationPattern.exec(sourceWithoutComments)) !== null) {
    const tail = sourceWithoutComments.slice(match.index + match[0].length);
    const nextToken = tail.match(/^\s*([=;,)])/);
    if (!nextToken) continue;
    declarations.push({
      line: sourceWithoutComments.slice(0, match.index).split('\n').length,
      initialized: nextToken[1] === '=',
      end: match.index + match[0].length,
    });
  }

  const declaration = declarations
    .filter((candidate) => candidate.line <= currentLine)
    .sort((left, right) => right.line - left.line)[0];
  if (!declaration) return false;

  let initialized = declaration.initialized;
  const declarationLineEnd = sourceWithoutComments.indexOf('\n', declaration.end);
  let scanOffset = declarationLineEnd === -1 ? sourceWithoutComments.length : declarationLineEnd + 1;
  const assignmentPattern = new RegExp(
    `(?:^|[;{}\\n])\\s*${escapedName}\\s*=(?!=)`,
    'gm'
  );
  assignmentPattern.lastIndex = scanOffset;
  while ((match = assignmentPattern.exec(sourceWithoutComments)) !== null) {
    const assignmentOffset = match.index + match[0].lastIndexOf(variableName);
    const line = sourceWithoutComments.slice(0, assignmentOffset).split('\n').length;
    if (line >= currentLine) break;
    initialized = true;
  }
  return initialized && declaration.line < currentLine;
}

export function findGraphVariableDeclaration(
  source: string,
  graphType: string,
  variableName: string,
  currentLine: number
): GraphVariableDeclaration | null {
  const sourceWithoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');
  const escapedType = graphType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedName = variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declarationPattern = new RegExp(
    `\\b(?:const\\s+)?${escapedType}\\s*(?:[*&]\\s*)*\\b${escapedName}\\b`,
    'g'
  );
  const candidates: GraphVariableDeclaration[] = [];
  let match: RegExpExecArray | null;

  while ((match = declarationPattern.exec(sourceWithoutComments)) !== null) {
    const tail = sourceWithoutComments.slice(match.index + match[0].length);
    const nextToken = tail.match(/^\s*([=({;,)])/);
    if (!nextToken) continue;

    let initialized = ['=', '{', '('].includes(nextToken[1]);
    if (nextToken[1] === ',' || nextToken[1] === ')') {
      const openingParen = sourceWithoutComments.lastIndexOf('(', match.index);
      const priorBoundary = Math.max(
        sourceWithoutComments.lastIndexOf(';', match.index),
        sourceWithoutComments.lastIndexOf('{', match.index),
        sourceWithoutComments.lastIndexOf('}', match.index)
      );
      initialized = openingParen > priorBoundary;
    }

    const line = sourceWithoutComments.slice(0, match.index).split('\n').length;
    candidates.push({ line, initialized });
  }

  const preceding = candidates
    .filter((candidate) => candidate.line <= currentLine)
    .sort((left, right) => right.line - left.line)[0];
  return preceding || candidates.sort((left, right) => left.line - right.line)[0] || null;
}

function isNumericType(type: string | null): boolean {
  if (!type) return false;
  const normalized = type.replace(/\s+/g, ' ').trim();
  return /^(?:(?:unsigned|signed)\s+)?(?:(?:short|long)(?:\s+long)?\s+)?(?:int|long|short|char|float|double|size_t|std::size_t|std::u?int\d+_t)$/.test(
    normalized
  );
}

export function discoverGraphLayout(source: string): GraphLayout | null {
  const sourceWithoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');
  const graphBody = getTypeBody(sourceWithoutComments, 'Graph');
  if (!graphBody) return null;

  const vertexHeadType = getMemberType(graphBody, 'vertexHead');
  const edgeHeadType = getMemberType(graphBody, 'edgeHead');
  const vertexType = baseType(vertexHeadType);
  const edgeType = baseType(edgeHeadType);
  if (
    !vertexType ||
    !edgeType ||
    !isPointerToType(vertexHeadType, vertexType) ||
    !isPointerToType(edgeHeadType, edgeType)
  ) {
    return null;
  }

  const vertexBody = getTypeBody(sourceWithoutComments, vertexType);
  const edgeBody = getTypeBody(sourceWithoutComments, edgeType);
  if (!vertexBody || !edgeBody) return null;

  const nextVertexType = getMemberType(vertexBody, 'nextVertex');
  const sourceType = getMemberType(edgeBody, 'source');
  const targetType = getMemberType(edgeBody, 'target');
  const nextEdgeType = getMemberType(edgeBody, 'nextEdge');
  const valueFieldType = getMemberType(vertexBody, 'value');
  const weightType = getMemberType(edgeBody, 'weight');
  const directedType = getMemberType(edgeBody, 'directed');

  if (
    !isPointerToType(nextVertexType, vertexType) ||
    !isPointerToType(sourceType, vertexType) ||
    !isPointerToType(targetType, vertexType) ||
    !isPointerToType(nextEdgeType, edgeType) ||
    !valueFieldType ||
    (!isNumericType(valueFieldType) && !/^(?:std::)?string$/.test(valueFieldType)) ||
    !isNumericType(weightType) ||
    directedType !== 'bool'
  ) {
    return null;
  }

  return { graphType: 'Graph', vertexType, edgeType, vertexValueField: 'value' };
}

export function matchesGraphType(type: string | undefined, graphType: string): boolean {
  if (!type) return false;
  const normalized = type
    .replace(/\b(?:const|volatile)\b/g, '')
    .replace(/^struct\s+/, '')
    .replace(/\s+/g, '')
    .trim();
  return normalized === graphType || normalized === `${graphType}*`;
}

export function parseGraphPointerValue(
  value: string | null
): { valid: boolean; address: string | null } {
  if (value === null) return { valid: false, address: null };
  let candidate = value.trim();
  if (candidate.includes(':')) {
    candidate = candidate.slice(candidate.lastIndexOf(':') + 1).trim();
  }
  // (nil) is a null value, not a C++ type cast.
  candidate = candidate.replace(/^\((?!nil\))[^)]*\)\s*/i, '');

  if (/^(?:nullptr|NULL|\(nil\)|0|0x0+)(?:\s+<[^>]*>)?$/i.test(candidate)) {
    return { valid: true, address: null };
  }
  if (/error|cannot access|not defined|optimized out|incomplete/i.test(candidate)) {
    return { valid: false, address: null };
  }

  const match = candidate.match(/^(?:\([^)]*\)\s*)?(0x[0-9a-f]+)(?:\s+<[^>]*>)?$/i);
  if (!match || INVALID_POINTER_VALUES.has(match[1].toLowerCase())) {
    return { valid: false, address: null };
  }
  return { valid: true, address: match[1].toLowerCase() };
}

function parseNumericValue(value: string | null): number | null {
  if (value === null) return null;
  const match = value.trim().match(
    /^(?:\([^)]*\)\s*)?([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/
  );
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseVertexValue(value: string | null): number | string | null {
  const numeric = parseNumericValue(value);
  if (numeric !== null) return numeric;
  if (value === null) return null;

  const trimmed = value.trim();
  const quoted = trimmed.match(/(?:=\s*)?("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')$/);
  if (!quoted) return null;
  const literal = quoted[1];
  if (literal.startsWith('"')) {
    try {
      return JSON.parse(literal) as string;
    } catch {
      return null;
    }
  }
  return literal.slice(1, -1).replace(/\\(.)/g, '$1');
}

function parseBooleanValue(value: string | null): boolean | null {
  if (value === null) return null;
  const normalized = value.trim().replace(/^\([^)]*\)\s*/, '').toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return null;
}

function graphHasPath(
  graph: Graph,
  startId: string,
  targetId: string,
  includeEdge?: { sourceId: string; targetId: string; directed: boolean }
): boolean {
  const adjacency = new Map<string, string[]>();
  const addLink = (sourceId: string, targetId: string) => {
    const links = adjacency.get(sourceId) || [];
    links.push(targetId);
    adjacency.set(sourceId, links);
  };

  for (const edge of graph.edges) {
    addLink(edge.sourceId, edge.targetId);
    if (!edge.directed) addLink(edge.targetId, edge.sourceId);
  }
  if (includeEdge) {
    addLink(includeEdge.sourceId, includeEdge.targetId);
    if (!includeEdge.directed) addLink(includeEdge.targetId, includeEdge.sourceId);
  }

  const visited = new Set<string>();
  const pending = [startId];
  while (pending.length) {
    const current = pending.pop()!;
    if (current === targetId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(adjacency.get(current) || []));
  }
  return false;
}

function countNewDisconnectedComponents(previous: Graph, current: Graph): number {
  const previousIds = new Set(previous.vertices.map((vertex) => vertex.id));
  const currentIds = new Set(current.vertices.map((vertex) => vertex.id));
  const adjacency = new Map<string, Set<string>>();
  for (const id of currentIds) adjacency.set(id, new Set());
  for (const edge of current.edges) {
    if (!currentIds.has(edge.sourceId) || !currentIds.has(edge.targetId)) continue;
    adjacency.get(edge.sourceId)!.add(edge.targetId);
    adjacency.get(edge.targetId)!.add(edge.sourceId);
  }

  let count = 0;
  const visited = new Set<string>();
  for (const id of currentIds) {
    if (visited.has(id)) continue;
    const component: string[] = [];
    const pending = [id];
    while (pending.length) {
      const currentId = pending.pop()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      component.push(currentId);
      pending.push(...(adjacency.get(currentId) || []));
    }
    if (component.some((componentId) => !previousIds.has(componentId)) &&
      !component.some((componentId) => previousIds.has(componentId))) {
      count++;
    }
  }
  return count;
}

export function describeGraphSnapshotChange(
  previous: GraphSnapshot | undefined,
  current: GraphSnapshot
): GraphSnapshotChange {
  const vertexById = new Map(current.graph.vertices.map((vertex) => [vertex.id, vertex]));
  const previousVertexById = new Map(
    (previous?.graph.vertices || []).map((vertex) => [vertex.id, vertex])
  );
  const edgeById = new Map(current.graph.edges.map((edge) => [edge.id, edge]));
  const previousEdgeById = new Map(
    (previous?.graph.edges || []).map((edge) => [edge.id, edge])
  );
  const addedVertices = current.graph.vertices.filter(
    (vertex) => !previousVertexById.has(vertex.id)
  );
  const removedVertices = (previous?.graph.vertices || []).filter(
    (vertex) => !vertexById.has(vertex.id)
  );
  const updatedVertices = current.graph.vertices.filter((vertex) => {
    const oldVertex = previousVertexById.get(vertex.id);
    return oldVertex && oldVertex.value !== vertex.value;
  });
  const updatedVertexMembership = current.graph.vertices.filter((vertex) => {
    const oldVertex = previousVertexById.get(vertex.id);
    return oldVertex && oldVertex.isDetached !== vertex.isDetached;
  });
  const addedEdges = current.graph.edges.filter((edge) => !previousEdgeById.has(edge.id));
  const removedEdges = (previous?.graph.edges || []).filter((edge) => !edgeById.has(edge.id));
  const updatedEdges = current.graph.edges.filter((edge) => {
    const oldEdge = previousEdgeById.get(edge.id);
    return oldEdge && (
      oldEdge.sourceId !== edge.sourceId ||
      oldEdge.targetId !== edge.targetId ||
      oldEdge.directed !== edge.directed ||
      oldEdge.weight !== edge.weight ||
      oldEdge.label !== edge.label
    );
  });

  const changes: string[] = [];
  let changeType: GraphSnapshot['changeType'] = 'step';
  const previousWarnings = new Set(previous?.warnings || []);
  const newWarnings = [...new Set(current.warnings || [])].filter(
    (warning) => !previousWarnings.has(warning)
  );
  const explanationWithWarnings = (explanation: string): string =>
    newWarnings.length ? `${explanation} Warnings: ${newWarnings.join(' ')}` : explanation;
  if (
    current.changeType === 'init' &&
    current.graph.vertices.length === 0 &&
    current.graph.edges.length === 0 &&
    (!previous ||
      (previous.graph.vertices.length === 0 && previous.graph.edges.length === 0))
  ) {
    return {
      changeType: 'init',
      explanation: explanationWithWarnings(current.explanation),
    };
  }
  if (!previous) {
    changes.push(
      `Captured ${current.graph.vertices.length} vertices and ${current.graph.edges.length} edges.`
    );
  } else {
    if (addedVertices.length) {
      changes.push(`${addedVertices.length} vertex${addedVertices.length === 1 ? '' : 'es'} added.`);
    }
    if (removedVertices.length) {
      changes.push(`${removedVertices.length} vertex${removedVertices.length === 1 ? '' : 'es'} removed.`);
    }
    if (updatedVertices.length) {
      changes.push(`${updatedVertices.length} vertex value${updatedVertices.length === 1 ? '' : 's'} changed.`);
    }
    if (updatedVertexMembership.length) {
      changes.push(
        `${updatedVertexMembership.length} vertex registry membership update${updatedVertexMembership.length === 1 ? '' : 's'}.`
      );
    }
    if (addedEdges.length) {
      changes.push(`${addedEdges.length} edge${addedEdges.length === 1 ? '' : 's'} added.`);
    }
    if (removedEdges.length) {
      changes.push(`${removedEdges.length} edge${removedEdges.length === 1 ? '' : 's'} removed.`);
    }
    if (updatedEdges.length) {
      changes.push(`${updatedEdges.length} edge direction, endpoint, or weight update${updatedEdges.length === 1 ? '' : 's'}.`);
    }

    if (addedEdges.length) changeType = 'edge_created';
    else if (removedEdges.length) changeType = 'edge_removed';
    else if (addedVertices.length) changeType = 'vertex_created';
    else if (removedVertices.length) changeType = 'vertex_removed';
    else if (updatedEdges.length) changeType = 'edge_updated';
    else if (updatedVertices.length || updatedVertexMembership.length) changeType = 'vertex_updated';

    const addedSelfLoops = addedEdges.filter((edge) => edge.sourceId === edge.targetId);
    if (addedSelfLoops.length) {
      changes.push(`${addedSelfLoops.length} self-loop${addedSelfLoops.length === 1 ? '' : 's'} became visible.`);
    }
    const addedCycles = addedEdges.some((edge) =>
      graphHasPath(previous.graph, edge.targetId, edge.sourceId)
    );
    if (addedCycles) changes.push('A newly added edge closes a cycle.');

    const newDisconnectedComponents = countNewDisconnectedComponents(
      previous.graph,
      current.graph
    );
    if (newDisconnectedComponents) {
      changes.push(
        `${newDisconnectedComponents} disconnected component${newDisconnectedComponents === 1 ? '' : 's'} added.`
      );
    }
    if (changes.length === 0) changes.push('No graph structure changes were detected.');
  }

  if (newWarnings.length) {
    changes.push(`Warnings: ${newWarnings.join(' ')}`);
  }
  return { changeType, explanation: changes.join(' ') };
}

export class GraphStateExtractor {
  private vertexIds = new Map<string, string>();
  private edgeIds = new Map<string, string>();
  private nextVertexId = 1;
  private nextEdgeId = 1;

  public reset(): void {
    this.vertexIds.clear();
    this.edgeIds.clear();
    this.nextVertexId = 1;
    this.nextEdgeId = 1;
  }

  private getStableId(address: string, kind: 'vertex' | 'edge'): string {
    const normalized = address.toLowerCase();
    const ids = kind === 'vertex' ? this.vertexIds : this.edgeIds;
    if (!ids.has(normalized)) {
      const id = kind === 'vertex' ? `vertex_${this.nextVertexId++}` : `edge_${this.nextEdgeId++}`;
      ids.set(normalized, id);
    }
    return ids.get(normalized)!;
  }

  private async readPointer(
    expression: string,
    evaluate: GraphExpressionEvaluator,
    warnings: string[]
  ): Promise<string | null | undefined> {
    const parsed = parseGraphPointerValue(await evaluate(expression));
    if (!parsed.valid) {
      warnings.push('Could not read a valid graph pointer value.');
      return undefined;
    }
    return parsed.address;
  }

  private isPointerToType(pointer: DebuggerPointerVariable, typeName: string): boolean {
    return isPointerToType(pointer.type || null, typeName);
  }

  public async extract(
    layout: GraphLayout,
    graphExpression: string,
    graphIsPointer: boolean,
    stepNumber: number,
    evaluate: GraphExpressionEvaluator,
    pointerVariables: DebuggerPointerVariable[] = [],
    source?: SourceLocation,
    graphPointerIsNull: boolean = false
  ): Promise<GraphSnapshot> {
    const warnings: string[] = [];
    const vertices: Vertex[] = [];
    const edges: Edge[] = [];
    const graph: Graph = { vertices, edges };
    const addressToVertex = new Map<string, Vertex>();
    const attemptedVertices = new Set<string>();
    const attemptedEdges = new Set<string>();
    let isComplete = true;

    if (!graphPointerIsNull) {
      const graphAccess = graphIsPointer ? `${graphExpression}->` : `${graphExpression}.`;
      const vertexHead = await this.readPointer(
        `${graphAccess}vertexHead`,
        evaluate,
        warnings
      );
      const edgeHead = await this.readPointer(`${graphAccess}edgeHead`, evaluate, warnings);
      if (vertexHead === undefined || edgeHead === undefined) isComplete = false;

      if (vertexHead) {
        let address: string | null | undefined = vertexHead;
        const visited = new Set<string>();
        while (address && !visited.has(address) && visited.size < MAX_REGISTRY_OBJECTS) {
          visited.add(address);
          attemptedVertices.add(address);
          const object = `((${layout.vertexType}*)${address})`;
          const next = await this.readPointer(`${object}->nextVertex`, evaluate, warnings);
          if (next === undefined) isComplete = false;
          const warningsBefore = warnings.length;
          await this.addVertex(address, false, layout, evaluate, warnings, addressToVertex, vertices);
          if (warnings.length > warningsBefore) isComplete = false;
          address = next;
        }
        if (address && !visited.has(address) && visited.size >= MAX_REGISTRY_OBJECTS) {
          warnings.push(`Vertex registry traversal stopped at ${MAX_REGISTRY_OBJECTS} objects.`);
          isComplete = false;
        }
      }

      if (edgeHead) {
        let address: string | null | undefined = edgeHead;
        const visited = new Set<string>();
        while (address && !visited.has(address) && visited.size < MAX_REGISTRY_OBJECTS) {
          visited.add(address);
          attemptedEdges.add(address);
          const object = `((${layout.edgeType}*)${address})`;
          const next = await this.readPointer(`${object}->nextEdge`, evaluate, warnings);
          if (next === undefined) isComplete = false;
          const warningsBefore = warnings.length;
          await this.addEdge(
            address,
            layout,
            evaluate,
            warnings,
            addressToVertex,
            attemptedVertices,
            vertices,
            edges
          );
          if (warnings.length > warningsBefore) isComplete = false;
          address = next;
        }
        if (address && !visited.has(address) && visited.size >= MAX_REGISTRY_OBJECTS) {
          warnings.push(`Edge registry traversal stopped at ${MAX_REGISTRY_OBJECTS} objects.`);
          isComplete = false;
        }
      }
    }

    for (const pointer of pointerVariables) {
      if (!this.isPointerToType(pointer, layout.vertexType)) continue;
      const parsed = parseGraphPointerValue(pointer.value);
      if (!parsed.valid) {
        isComplete = false;
        warnings.push(`Pointer variable '${pointer.name}' could not be read.`);
        continue;
      }
      if (!parsed.address || attemptedVertices.has(parsed.address)) continue;
      attemptedVertices.add(parsed.address);
      const warningsBefore = warnings.length;
      await this.addVertex(
        parsed.address,
        true,
        layout,
        evaluate,
        warnings,
        addressToVertex,
        vertices
      );
      if (warnings.length > warningsBefore) isComplete = false;
    }

    for (const pointer of pointerVariables) {
      if (!this.isPointerToType(pointer, layout.edgeType)) continue;
      const parsed = parseGraphPointerValue(pointer.value);
      if (!parsed.valid) {
        warnings.push(`Edge pointer variable '${pointer.name}' could not be read.`);
        isComplete = false;
        continue;
      }
      if (!parsed.address || attemptedEdges.has(parsed.address)) continue;
      attemptedEdges.add(parsed.address);
      const warningsBefore = warnings.length;
      await this.addEdge(
        parsed.address,
        layout,
        evaluate,
        warnings,
        addressToVertex,
        attemptedVertices,
        vertices,
        edges
      );
      if (warnings.length > warningsBefore) isComplete = false;
    }

    const pointers: GraphPointerVariable[] = [];
    const seenPointerNames = new Set<string>();
    for (const pointer of pointerVariables) {
      if (!this.isPointerToType(pointer, layout.vertexType)) continue;
      if (seenPointerNames.has(pointer.name)) continue;
      seenPointerNames.add(pointer.name);

      const parsed = parseGraphPointerValue(pointer.value);
      if (!parsed.valid) {
        warnings.push(`Pointer variable '${pointer.name}' could not be read.`);
        continue;
      }
      const target = parsed.address ? addressToVertex.get(parsed.address) : undefined;
      pointers.push({
        name: pointer.name,
        targetNodeId: target?.id ?? null,
        isNull: !parsed.address,
      });
    }

    const uniqueWarnings = [...new Set(warnings)];
    return {
      stepNumber,
      graph,
      source,
      pointers,
      explanation: uniqueWarnings.length ? 'Graph state extracted with warnings.' : 'Graph state extracted.',
      changeType: vertices.length || edges.length ? 'step' : 'init',
      warnings: uniqueWarnings.length ? uniqueWarnings : undefined,
      isComplete,
    };
  }

  private async addVertex(
    address: string,
    isDetached: boolean,
    layout: GraphLayout,
    evaluate: GraphExpressionEvaluator,
    warnings: string[],
    addressToVertex: Map<string, Vertex>,
    vertices: Vertex[]
  ): Promise<Vertex | null> {
    const existing = addressToVertex.get(address);
    if (existing) {
      if (!isDetached) existing.isDetached = false;
      return existing;
    }

    const object = `((${layout.vertexType}*)${address})`;
    const nextVertex = await this.readPointer(
      `${object}->nextVertex`,
      evaluate,
      warnings
    );
    if (nextVertex === undefined) {
      warnings.push('A vertex has unreadable required fields and was omitted.');
      return null;
    }
    const value = parseVertexValue(
      await evaluate(`${object}->${layout.vertexValueField}`)
    );
    if (value === null) {
      warnings.push('A vertex has no readable supported value and was omitted.');
      return null;
    }

    const vertex: Vertex = {
      id: this.getStableId(address, 'vertex'),
      value,
      isDetached,
    };
    vertices.push(vertex);
    addressToVertex.set(address, vertex);
    return vertex;
  }

  private async addEdge(
    address: string,
    layout: GraphLayout,
    evaluate: GraphExpressionEvaluator,
    warnings: string[],
    addressToVertex: Map<string, Vertex>,
    attemptedVertices: Set<string>,
    vertices: Vertex[],
    edges: Edge[]
  ): Promise<void> {
    const object = `((${layout.edgeType}*)${address})`;
    const nextEdge = await this.readPointer(`${object}->nextEdge`, evaluate, warnings);
    if (nextEdge === undefined) {
      warnings.push('An edge has unreadable required fields and was omitted.');
      return;
    }
    const sourceAddress = await this.readPointer(`${object}->source`, evaluate, warnings);
    const targetAddress = await this.readPointer(`${object}->target`, evaluate, warnings);
    if (!sourceAddress || !targetAddress) {
      warnings.push('An edge has a null or unreadable endpoint and was omitted.');
      return;
    }

    for (const endpoint of [sourceAddress, targetAddress]) {
      if (!addressToVertex.has(endpoint) && !attemptedVertices.has(endpoint)) {
        attemptedVertices.add(endpoint);
        await this.addVertex(
          endpoint,
          true,
          layout,
          evaluate,
          warnings,
          addressToVertex,
          vertices
        );
      }
    }

    const edgeSource = addressToVertex.get(sourceAddress);
    const edgeTarget = addressToVertex.get(targetAddress);
    if (!edgeSource || !edgeTarget) {
      warnings.push('An edge endpoint could not be read as a supported vertex; the edge was omitted.');
      return;
    }

    const weight = parseNumericValue(await evaluate(`${object}->weight`));
    const directed = parseBooleanValue(await evaluate(`${object}->directed`));
    if (weight === null || directed === null) {
      warnings.push('An edge has unreadable required fields and was omitted.');
      return;
    }

    edges.push({
      id: this.getStableId(address, 'edge'),
      sourceId: edgeSource.id,
      targetId: edgeTarget.id,
      directed,
      weight,
    });
  }
}
