import { LinkedListSnapshot } from '../visualization/linkedListModel';

export type WebviewMessage =
  | { command: 'visualize' }
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
      command: 'status';
      text: string;
      step: 'compiling' | 'launching' | 'waiting' | 'ready';
    }
  | {
      command: 'updateState';
      snapshot: LinkedListSnapshot;
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
