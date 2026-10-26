import * as vscode from 'vscode';

export interface DebuggerStopEvent {
  session: vscode.DebugSession;
  threadId: number;
  reason: string;
}

export interface DebuggerContinueEvent {
  session: vscode.DebugSession;
  threadId?: number;
}

export type StopListener = (event: DebuggerStopEvent) => void;
export type ContinueListener = (event: DebuggerContinueEvent) => void;
export type TerminateListener = (session: vscode.DebugSession) => void;
export type OutputListener = (
  session: vscode.DebugSession,
  output: string,
  category?: string
) => void;

export class DebugTrackerFactory implements vscode.DebugAdapterTrackerFactory {
  private static stopListeners: StopListener[] = [];
  private static continueListeners: ContinueListener[] = [];
  private static terminateListeners: TerminateListener[] = [];
  private static outputListeners: OutputListener[] = [];
  private static lastThreadId: number = 1;

  public static getLastThreadId(): number {
    return this.lastThreadId;
  }

  public static onOutput(listener: OutputListener): vscode.Disposable {
    this.outputListeners.push(listener);
    return {
      dispose: () => {
        const idx = this.outputListeners.indexOf(listener);
        if (idx !== -1) this.outputListeners.splice(idx, 1);
      },
    };
  }

  public static onStopped(listener: StopListener): vscode.Disposable {
    this.stopListeners.push(listener);
    return {
      dispose: () => {
        const idx = this.stopListeners.indexOf(listener);
        if (idx !== -1) this.stopListeners.splice(idx, 1);
      },
    };
  }

  public static onContinued(listener: ContinueListener): vscode.Disposable {
    this.continueListeners.push(listener);
    return {
      dispose: () => {
        const idx = this.continueListeners.indexOf(listener);
        if (idx !== -1) this.continueListeners.splice(idx, 1);
      },
    };
  }

  public static onTerminated(listener: TerminateListener): vscode.Disposable {
    this.terminateListeners.push(listener);
    return {
      dispose: () => {
        const idx = this.terminateListeners.indexOf(listener);
        if (idx !== -1) this.terminateListeners.splice(idx, 1);
      },
    };
  }

  private static processedMessageKeys = new Set<string>();

  public createDebugAdapterTracker(session: vscode.DebugSession): vscode.DebugAdapterTracker {
    const sessionId = session.id;

    return {
      onWillStopSession: () => {
        for (const key of DebugTrackerFactory.processedMessageKeys) {
          if (key.startsWith(sessionId + ':')) {
            DebugTrackerFactory.processedMessageKeys.delete(key);
          }
        }
      },
      onWillReceiveMessage: (m) => {
        // Can track client-sent requests if needed
      },
      onDidSendMessage: (m) => {
        if (!m) return;
        const msgKey =
          m.seq !== undefined
            ? `${sessionId}:${m.seq}`
            : `${sessionId}:${m.type}:${m.event || ''}:${JSON.stringify(m.body || '')}`;
        if (DebugTrackerFactory.processedMessageKeys.has(msgKey)) {
          return;
        }
        DebugTrackerFactory.processedMessageKeys.add(msgKey);
        if (DebugTrackerFactory.processedMessageKeys.size > 2000) {
          const it = DebugTrackerFactory.processedMessageKeys.values().next();
          if (!it.done) DebugTrackerFactory.processedMessageKeys.delete(it.value);
        }
        if (m.type === 'event') {
          if (m.event === 'stopped') {
            const threadId = m.body?.threadId ?? 1;
            const reason = m.body?.reason ?? 'step';
            DebugTrackerFactory.lastThreadId = threadId;
            for (const listener of DebugTrackerFactory.stopListeners) {
              try {
                Promise.resolve(listener({ session, threadId, reason })).catch((e) => {
                  console.error('[DebugTracker] Error in async stop listener', e);
                });
              } catch (e) {
                console.error('[DebugTracker] Error in stop listener', e);
              }
            }
          } else if (m.event === 'continued') {
            const threadId = m.body?.threadId;
            for (const listener of DebugTrackerFactory.continueListeners) {
              try {
                listener({ session, threadId });
              } catch (e) {
                console.error('[DebugTracker] Error in continue listener', e);
              }
            }
          } else if (m.event === 'output') {
            const outputText = m.body?.output;
            const category = m.body?.category || 'console';
            if (outputText) {
              for (const listener of DebugTrackerFactory.outputListeners) {
                try {
                  listener(session, outputText, category);
                } catch (e) {
                  console.error('[DebugTracker] Error in output listener', e);
                }
              }
            }
          } else if (m.event === 'terminated' || m.event === 'exited') {
            for (const listener of DebugTrackerFactory.terminateListeners) {
              try {
                listener(session);
              } catch (e) {
                console.error('[DebugTracker] Error in terminate listener', e);
              }
            }
          }
        }
      },
    };
  }
}
