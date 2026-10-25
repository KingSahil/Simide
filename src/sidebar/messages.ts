import { LinkedListSnapshot } from '../visualization/linkedListModel';
import type { GraphEdge, GraphNodeMeta, EdgeLinkResult } from './edgeLinkHandler';
import type { SourceEdit } from '../visualization/codePatcher';

export type WebviewMessage =
  | { command: 'visualize'; filePath?: string }
  | { command: 'visualizeExample'; example: 'stack' | 'array' | 'linkedlist' | 'tree' }
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
  | {
      command: 'createEdge';
      edge: GraphEdge;
    }
  | {
      command: 'requestAST';
      filePath: string;
    };

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
