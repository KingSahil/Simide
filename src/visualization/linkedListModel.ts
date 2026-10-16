export type StructureType = 'linked_list' | 'tree';

export interface ListNode {
  id: string;
  address?: string;
  data: number | string;
  // Linked list pointers
  nextId?: string | null;
  nextAddress?: string | null;
  // Binary tree pointers
  leftId?: string | null;
  leftAddress?: string | null;
  rightId?: string | null;
  rightAddress?: string | null;
  // Role & placement
  isHead: boolean;
  isRoot?: boolean;
  isDetached: boolean;
  treeDepth?: number;
  treeColumn?: number;
  isVisiting?: boolean;
  variableName?: string;
  isNewlyCreated?: boolean;
  isNewlyConnected?: boolean;
}

export interface SourceLocation {
  file: string;
  line: number;
  functionName?: string;
}

export interface PointerVariable {
  name: string;
  targetNodeId: string | null;
  targetAddress?: string | null;
  isNull: boolean;
}

export type ChangeType =
  | 'init'
  | 'node_created'
  | 'head_assigned'
  | 'node_linked'
  | 'node_bypassed'
  | 'node_deleted'
  | 'pointer_moved'
  | 'print'
  | 'step'
  | 'tree_root_assigned'
  | 'tree_node_created'
  | 'tree_child_linked'
  | 'tree_traversal_visit'
  | 'final';

export interface LinkedListSnapshot {
  stepNumber: number;
  structureType?: StructureType;
  source?: SourceLocation;
  hasHead: boolean; // Also represents hasRoot when structureType === 'tree'
  headId: string | null; // Also represents rootId when structureType === 'tree'
  activeVisitingNodeId?: string | null;
  nodes: ListNode[];
  pointers?: PointerVariable[];
  explanation: string;
  changeType: ChangeType;
  terminalOutput?: string;
  printedInStep?: string;
  isHistorical?: boolean;
}

