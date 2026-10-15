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

export type ChangeType =
  | 'init'
  | 'node_created'
  | 'head_assigned'
  | 'node_linked'
  | 'step'
  | 'final';

export interface LinkedListSnapshot {
  stepNumber: number;
  source?: SourceLocation;
  headId: string | null;
  nodes: ListNode[];
  explanation: string;
  changeType: ChangeType;
  isHistorical?: boolean;
}
