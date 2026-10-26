export type StructureType = 'linked_list' | 'tree' | 'array' | 'stack' | 'queue' | 'string';

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

export interface StringElement {
  index: number;
  char: string;             // e.g. "a", "\0", " "
  ascii: number;            // e.g. 97, 0, 32
  isModified?: boolean;     // Highlighted if changed this step
  isCompared?: boolean;     // Highlighted if involved in comparison (e.g. s[i] == s[j])
  isWindow?: boolean;       // Inside current sliding window [start..end]
  isNullTerminator?: boolean; // True for '\0'
  address?: string;         // Memory address of character slot
  isActive?: boolean;       // Targeted by an active index pointer
}

export interface StringVariable {
  name: string;             // e.g. "s", "str", "haystack"
  type: 'std_string' | 'char_array' | 'char_pointer';
  length: number;           // Actual character count (excluding \0 for std::string)
  capacity?: number;        // std::string capacity or allocated buffer size
  elements: StringElement[];
  address?: string;
  hasNullTerminator: boolean;
}

export interface StringWindow {
  stringName: string;
  startIndex: number;
  endIndex: number;
  label?: string;           // e.g. "current window" or "match"
}

export interface StringDeclaration {
  name: string;
  line: number;
  type: 'std_string' | 'char_array' | 'char_pointer';
  size?: number;
  initialValue?: string;
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

export interface QueueSlot {
  index: number;
  value: number | string | null;
  hasValue: boolean;
  isFront?: boolean;
  isRear?: boolean;
  isHighlighted?: boolean;
  isEnqueuing?: boolean;
  isDequeuing?: boolean;
}

export interface QueueModel {
  name: string;
  slots: QueueSlot[];
  front: number; // -1 when empty
  rear: number;  // -1 when empty
  capacity: number;
  size: number;
  isCircular: boolean;
  justWrapped?: boolean;
  activeMethod?: 'enqueue' | 'dequeue' | 'front' | 'rear' | 'init' | null;
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
  | 'queue_enqueue'
  | 'queue_dequeue'
  | 'queue_front'
  | 'queue_rear'
  | 'queue_wrap'
  | 'queue_initialized'
  | 'string_initialized'
  | 'string_char_updated'
  | 'string_char_swapped'
  | 'string_pointer_moved'
  | 'string_window_resized'
  | 'string_concatenated'
  | 'final';

export interface LinkedListSnapshot {
  stepNumber: number;
  structureType?: StructureType;
  source?: SourceLocation;
  hasHead: boolean; // Also represents hasRoot when tree, hasArray when array, hasStack when stack, hasQueue when queue, hasString when string
  headId: string | null; // Also represents rootId when tree
  activeVisitingNodeId?: string | null;
  nodes: ListNode[];
  pointers?: PointerVariable[];
  arrays?: ArrayVariable[];
  indexPointers?: IndexPointer[];
  stack?: StackModel;
  queue?: QueueModel;
  strings?: StringVariable[];
  stringWindows?: StringWindow[];
  explanation: string;
  changeType: ChangeType;
  terminalOutput?: string;
  printedInStep?: string;
  isHistorical?: boolean;
  inspectionWarning?: string;
}


