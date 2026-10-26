import { LinkedListSnapshot } from '../visualization/linkedListModel';
import { GraphSnapshot, isGraphSnapshot } from '../visualization/graphModel';
import { ExampleEntry } from './exampleCatalog';
import { TutorialManifest } from '../tutorial/tutorialModel';
import type { GraphEdge, GraphNodeMeta, EdgeLinkResult } from './edgeLinkHandler';
import type { SourceEdit } from '../visualization/codePatcher';

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
  | { command: 'visualizeExample'; example: string }
  | { command: 'getExamples' }
  | { command: 'goHome' }
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
  | { command: 'requestState' }
  | { command: 'importTutorial'; url?: string }
  | { command: 'selectLesson'; lessonId: string }
  | { command: 'closeTutorial' }
  | {
      command: 'createEdge';
      edge: GraphEdge;
    }
  | {
      command: 'requestAST';
      filePath: string;
    }
  | {
      command: 'creativeAddNode';
      nodeType: 'linkedlist' | 'stack' | 'queue';
      varName: string;
      value: number;
    }
  | {
      command: 'creativeConnect';
      sourceVar: string;
      targetVar: string;
    }
  | {
      command: 'creativeDisconnect';
      sourceVar: string;
    }
  | {
      command: 'creativeUpdateValue';
      varName: string;
      newValue: number;
    }
  | {
      command: 'creativeDeleteNode';
      varName: string;
    }
  | {
      command: 'creativeStackPush';
      varName: string;
      value: number;
    }
  | {
      command: 'creativeQueuePush';
      varName: string;
      value: number;
    }
  | {
      command: 'creativeRequestSync';
    }
  | {
      command: 'creativeStart';
    };

export type ExtensionMessage =
  | { command: 'examples'; examples: ExampleEntry[] }
  | { command: 'home' }
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
    }
  | {
      command: 'tutorialLoaded';
      manifest: TutorialManifest;
      activeLessonId: string;
      guideMarkdown?: string;
      warnings?: string[];
    }
  | {
      command: 'lessonChanged';
      lessonId: string;
      guideMarkdown?: string;
    }
  | {
      command: 'tutorialClosed';
    }
  | {
      command: 'edgeApplied';
      filePath: string;
      sourceNodeId?: string;
      targetNodeId?: string;
      edit: SourceEdit;
      highlighted: { startLine: number; endLine: number };
      message: string;
    }
  | {
      command: 'edgeError';
      message: string;
      details?: string;
    }
  | {
      command: 'astRefreshed';
      filePath: string;
      nodeCount: number;
    }
  | {
      command: 'creativeSyncState';
      nodes: Array<{ id: string; varName: string; value: number; x: number; y: number; nextVar?: string | null }>;
      stacks: Array<{ id: string; varName: string; elements: number[]; x: number; y: number }>;
      queues: Array<{ id: string; varName: string; elements: number[]; x: number; y: number }>;
    }
  | {
      command: 'creativeFeedback';
      ok: boolean;
      message: string;
      highlightLine?: number;
    };

/**
 * Convenience: narrow a GraphEdgeLinker result into the messages the extension
 * host sends back to the webview UI.
 */
export function edgeResultMessages(result: EdgeLinkResult): ExtensionMessage[] {
  if (!result.ok) {
    return [
      {
        command: 'edgeError',
        message: result.error ?? 'Link could not be applied to source code.',
        details: result.message,
      },
    ];
  }
  return [
    {
      command: 'edgeApplied',
      filePath: result.filePath!,
      edit: result.edit!,
      highlighted: result.highlighted!,
      message: result.message ?? 'Edge wired into source code.',
    },
  ];
}

export type { GraphEdge, GraphNodeMeta, EdgeLinkResult };
