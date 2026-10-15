import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ExtensionMessage, WebviewMessage } from './messages';
import { CppCompiler } from '../debug/compiler';
import { DebugSessionManager } from '../debug/debugSessionManager';
import { DebugTrackerFactory, DebuggerStopEvent } from '../debug/debugAdapterTracker';
import { ExecutionController } from '../debug/executionController';
import { StateExtractor } from '../debug/stateExtractor';
import { SnapshotManager } from '../visualization/snapshotManager';
import { LinkedListSnapshot } from '../visualization/linkedListModel';

export class LinkedListViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'debug-mentor.sidebar';

  private view?: vscode.WebviewView;
  private snapshotManager = new SnapshotManager();
  private stepCounter = 1;
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {
    this.registerDebugListeners();
  }

  private registerDebugListeners(): void {
    // Stopped listener
    this.disposables.push(
      DebugTrackerFactory.onStopped(async (event: DebuggerStopEvent) => {
        ExecutionController.setPaused(true);
        // Small delay to ensure DAP stack frames are completely populated
        await new Promise((r) => setTimeout(r, 80));

        const prev = this.snapshotManager.getLatestSnapshot();
        const snapshot = await StateExtractor.extractState(
          event.session,
          event.threadId,
          this.stepCounter++,
          prev
        );

        if (snapshot) {
          this.snapshotManager.addSnapshot(snapshot);
          this.broadcastState(snapshot);
        }
      })
    );

    // Continued listener
    this.disposables.push(
      DebugTrackerFactory.onContinued(() => {
        ExecutionController.setRunning(true);
        const curr = this.snapshotManager.getCurrentSnapshot();
        if (curr) {
          this.broadcastState(curr);
        }
      })
    );

    // Terminated listener
    this.disposables.push(
      DebugTrackerFactory.onTerminated((session) => {
        this.clearEditorHistoryHighlight();
        DebugSessionManager.setActiveSession(null);
        ExecutionController.setPaused(true);
        this.postMessage({
          command: 'sessionEnded',
          reason: 'Program execution completed.',
        });
      })
    );
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this.extensionUri,
        vscode.Uri.joinPath(this.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.extensionUri, 'webview'),
      ],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        await this.handleMessage(message);
      },
      undefined,
      this.disposables
    );
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.command) {
      case 'visualize':
      case 'retry':
        await this.startVisualization();
        break;

      case 'next':
        if (this.snapshotManager.canGoNextHistory()) {
          const nextSnap = this.snapshotManager.nextHistory();
          if (nextSnap) {
            this.broadcastState(nextSnap);
          }
        } else {
          await ExecutionController.next();
        }
        break;

      case 'prev':
        if (this.snapshotManager.canGoPrev()) {
          const prevSnap = this.snapshotManager.prev();
          if (prevSnap) {
            this.broadcastState(prevSnap);
          }
        }
        break;

      case 'stepIn':
        await ExecutionController.stepIn();
        break;

      case 'stepOut':
        await ExecutionController.stepOut();
        break;

      case 'continue':
        await ExecutionController.continue();
        break;

      case 'pause':
        await ExecutionController.pause();
        break;

      case 'restart':
        await this.restartSession();
        break;

      case 'requestState':
        const curr = this.snapshotManager.getCurrentSnapshot();
        if (curr) {
          this.broadcastState(curr);
        }
        break;
    }
  }

  public reveal(): void {
    if (this.view) {
      this.view.show(true);
    } else {
      vscode.commands.executeCommand('debug-mentor.sidebar.focus');
    }
  }

  public async startVisualization(): Promise<void> {
    this.reveal();
    if (DebugSessionManager.getActiveSession()) {
      await DebugSessionManager.stopDebugging();
      await new Promise((r) => setTimeout(r, 150));
    }

    this.postMessage({
      command: 'status',
      text: 'Preparing C++ program...',
      step: 'compiling',
    });

    const sourceFile = CppCompiler.resolveSourceFile();
    if (!sourceFile) {
      this.postMessage({
        command: 'error',
        message: 'No active C++ file detected',
        details:
          'Please open a valid C++ file (such as examples/linked-list.cpp) in the editor and try again.',
        canRetry: true,
      });
      return;
    }

    // Compile
    this.postMessage({
      command: 'status',
      text: `Compiling ${path.basename(sourceFile)}...`,
      step: 'compiling',
    });

    const compileResult = await CppCompiler.compile(sourceFile);
    if (!compileResult.success) {
      this.postMessage({
        command: 'error',
        message: 'Compilation Failed',
        details: compileResult.errorMessage,
        canRetry: true,
      });
      return;
    }

    // Reset session trackers
    this.snapshotManager.reset();
    StateExtractor.reset();
    this.stepCounter = 1;

    // Launch Debugger
    this.postMessage({
      command: 'status',
      text: 'Starting debugger...',
      step: 'launching',
    });

    const debugLaunch = await DebugSessionManager.startDebugging(
      compileResult.executablePath!,
      sourceFile
    );

    if (!debugLaunch.success) {
      this.postMessage({
        command: 'error',
        message: 'Debugger Launch Failed',
        details: debugLaunch.error,
        canRetry: true,
      });
      return;
    }

    this.postMessage({
      command: 'status',
      text: 'Waiting for debugger to pause at entry...',
      step: 'waiting',
    });
  }

  public async restartSession(): Promise<void> {
    await DebugSessionManager.stopDebugging();
    await this.startVisualization();
  }

  private historyDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(0, 102, 255, 0.25)',
    isWholeLine: true,
    border: '1px dashed #0066FF',
    overviewRulerColor: '#0066FF',
    overviewRulerLane: vscode.OverviewRulerLane.Full,
  });

  private updateEditorHistoryHighlight(snapshot: LinkedListSnapshot): void {
    const isHistorical = !!snapshot.isHistorical;
    const line = snapshot.source?.line;
    const filePath = snapshot.source?.file;

    for (const editor of vscode.window.visibleTextEditors) {
      const isMatchingDoc =
        !filePath ||
        editor.document.fileName.endsWith(filePath) ||
        path.basename(editor.document.fileName) === path.basename(filePath);

      if (isHistorical && line && line > 0 && isMatchingDoc) {
        const targetLine = line - 1;
        const range = new vscode.Range(targetLine, 0, targetLine, 0);
        editor.setDecorations(this.historyDecorationType, [range]);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);

        if (editor.document.lineCount > targetLine) {
          const pos = new vscode.Position(targetLine, 0);
          editor.selection = new vscode.Selection(pos, pos);
        }
      } else {
        editor.setDecorations(this.historyDecorationType, []);
      }
    }
  }

  private clearEditorHistoryHighlight(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(this.historyDecorationType, []);
    }
  }

  private broadcastState(snapshot: LinkedListSnapshot): void {
    this.reveal();
    this.updateEditorHistoryHighlight(snapshot);
    const isHistorical = !!snapshot.isHistorical;
    const isPaused = ExecutionController.status.isPaused;
    const isRunning = ExecutionController.status.isRunning;

    this.postMessage({
      command: 'updateState',
      snapshot,
      canStepNext: isHistorical ? true : isPaused,
      canStepPrev: this.snapshotManager.canGoPrev(),
      canContinue: isPaused && !isHistorical,
      canPause: isRunning,
      canRestart: true,
      isPaused,
      isRunning,
      totalSnapshots: this.snapshotManager.totalSnapshots,
      currentSnapshotIndex: this.snapshotManager.currentSnapshotIndex,
    });
  }

  private postMessage(message: ExtensionMessage): void {
    if (this.view) {
      this.view.webview.postMessage(message);
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const htmlPath = path.join(this.extensionUri.fsPath, 'dist', 'webview.html');
    let htmlContent = '';

    if (fs.existsSync(htmlPath)) {
      htmlContent = fs.readFileSync(htmlPath, 'utf8');
    } else {
      // Fallback to webview/index.html
      const fallbackPath = path.join(this.extensionUri.fsPath, 'webview', 'index.html');
      htmlContent = fs.readFileSync(fallbackPath, 'utf8');
    }

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.css')
    );

    // Replace relative assets with webview URIs
    htmlContent = htmlContent.replace('webview.js', scriptUri.toString());
    htmlContent = htmlContent.replace('webview.css', styleUri.toString());

    return htmlContent;
  }

  public dispose(): void {
    this.clearEditorHistoryHighlight();
    this.historyDecorationType.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
