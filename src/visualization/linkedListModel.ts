export type StructureType = 'linked_list' | 'tree' | 'array' | 'stack';

export interface ArrayElement {
  index: number;
  value: number | string;
  address?: string;
  isModified?: boolean;
  isActive?: boolean;
  isCapacitySlot?: boolean;
  isCompared?: boolean;
}

export interface ArrayVariable {
  name: string;
  type: string;
  size: number;
  capacity?: number;
  elements: ArrayElement[];
  address?: string;
  isDynamic?: boolean;
}

export interface IndexPointer {
  name: string;
  targetIndex: number;
  targetArrayName: string;
  value?: number | string;
}

export interface StackElement {
  id: string;
  value: number | string;
  index: number;
  isTop?: boolean;
  isHighlighted?: boolean;
  isPopping?: boolean;
  isPushing?: boolean;
}

export interface StackModel {
  name: string;
  elements: StackElement[];
  topIndex: number; // -1 when empty
  capacity: number;
  activeMethod?: 'push' | 'pop' | 'peek' | 'init' | null;
  methodParam?: number | string;
  methodReturnValue?: number | string;
  isOverflow?: boolean;
  isUnderflow?: boolean;
}

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
  | 'array_initialized'
  | 'array_element_updated'
  | 'array_element_swapped'
  | 'array_pointer_moved'
  | 'stack_push'
  | 'stack_pop'
  | 'stack_peek'
  | 'stack_initialized'
  | 'final';

export interface LinkedListSnapshot {
  stepNumber: number;
  structureType?: StructureType;
  source?: SourceLocation;
  hasHead: boolean; // Also represents hasRoot when structureType === 'tree', hasArray when array, hasStack when stack
  headId: string | null; // Also represents rootId when structureType === 'tree'
  activeVisitingNodeId?: string | null;
  nodes: ListNode[];
  pointers?: PointerVariable[];
  arrays?: ArrayVariable[];
  indexPointers?: IndexPointer[];
  stack?: StackModel;
  explanation: string;
  changeType: ChangeType;
  terminalOutput?: string;
  printedInStep?: string;
  isHistorical?: boolean;
}

