export interface ListNode {
  id: string;
  address?: string;
  data: number | string;
  nextId: string | null;
  nextAddress?: string | null;
  isHead: boolean;
  isDetached: boolean;
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
  | 'final';

export interface LinkedListSnapshot {
  stepNumber: number;
  source?: SourceLocation;
  hasHead: boolean;
  headId: string | null;
  nodes: ListNode[];
  pointers?: PointerVariable[];
  explanation: string;
  changeType: ChangeType;
  terminalOutput?: string;
  printedInStep?: string;
  isHistorical?: boolean;
}
