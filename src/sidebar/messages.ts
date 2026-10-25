import { LinkedListSnapshot } from '../visualization/linkedListModel';
import { GraphSnapshot, isGraphSnapshot } from '../visualization/graphModel';

interface UpdateStateBase {
  command: 'updateState';
  canStepNext: boolean;
  canStepPrev: boolean;
  canContinue: boolean;
  canPause: boolean;
  canRestart: boolean;
  isPaused: boolean;
  isRunning: boolean;
  totalSnapshots: number;
  currentSnapshotIndex: number;
}

export type UpdateStateMessage =
  | (UpdateStateBase & {
      visualizationMode: 'graph';
      snapshot: GraphSnapshot;
    })
  | (UpdateStateBase & {
      visualizationMode: 'linked_list';
      snapshot: LinkedListSnapshot;
    });

export type UpdateStatePayload = Omit<UpdateStateBase, 'command'>;

export function createUpdateStateMessage(
  snapshot: GraphSnapshot | LinkedListSnapshot,
  payload: UpdateStatePayload
): UpdateStateMessage {
  return isGraphSnapshot(snapshot)
    ? { command: 'updateState', visualizationMode: 'graph', snapshot, ...payload }
    : { command: 'updateState', visualizationMode: 'linked_list', snapshot, ...payload };
}

export function isGraphUpdateStateMessage(
  message: UpdateStateMessage
): message is Extract<UpdateStateMessage, { visualizationMode: 'graph' }> {
  return message.visualizationMode === 'graph' && isGraphSnapshot(message.snapshot);
}

export type WebviewMessage =
  | { command: 'visualize'; filePath?: string }
  | { command: 'visualizeExample'; example: 'stack' | 'array' | 'linkedlist' | 'tree' | 'graph' }
  | { command: 'getTargetFile' }
  | { command: 'next' }
  | { command: 'prev' }
  | { command: 'stepIn' }
  | { command: 'stepOut' }
  | { command: 'continue' }
  | { command: 'pause' }
  | { command: 'restart' }
  | { command: 'retry' }
  | { command: 'clearTerminal' }
  | { command: 'requestState' };

export type ExtensionMessage =
  | {
      command: 'targetFile';
      fileName: string;
      filePath: string;
    }
  | {
      command: 'status';
      text: string;
      step: 'compiling' | 'launching' | 'waiting' | 'ready';
    }
  | UpdateStateMessage
  | {
      command: 'terminalOutput';
      output: string;
      fullOutput: string;
    }
  | {
      command: 'error';
      message: string;
      details?: string;
      canRetry: boolean;
    }
  | {
      command: 'sessionEnded';
      reason?: string;
    };
