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
  private starting = false;

  constructor(private readonly extensionUri: vscode.Uri) {
    this.registerDebugListeners();
  }

  private registerDebugListeners(): void {
    // Re-apply highlight if student clicks back into editor
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!editor) return;
        const filePath = editor.document.fileName;
        if (
          filePath.endsWith('.cpp') ||
          filePath.endsWith('.cc') ||
          filePath.endsWith('.cxx') ||
          filePath.endsWith('.h') ||
          filePath.endsWith('.hpp')
        ) {
          CppCompiler.setLastActiveSourceFile(filePath);
          this.sendTargetFileUpdate();
        }

        const curr = this.snapshotManager.getCurrentSnapshot();
        if (curr && curr.source?.file && DebugSessionManager.getActiveSession()) {
          const normDoc = editor.document.fileName.replace(/\\/g, '/').toLowerCase();
          const normSource = curr.source.file.replace(/\\/g, '/').toLowerCase();
          if (
            normDoc.endsWith(normSource) ||
            path.basename(normDoc) === path.basename(normSource)
          ) {
            this.updateEditorActiveLineHighlight(curr, false);
          } else {
            // Student switched to a different file (e.g. bst-traversals.cpp)
            // Do NOT redirect or force open the previous file!
            editor.setDecorations(this.activeLineDecorationType, []);
          }
        }
      })
    );

    // Stopped listener
    this.disposables.push(
      DebugTrackerFactory.onStopped(async (event: DebuggerStopEvent) => {
        ExecutionController.setPaused(true);
        // Minimal delay to ensure DAP stack frames are completely populated
        await new Promise((r) => setTimeout(r, 10));
        vscode.commands.executeCommand('workbench.action.closePanel');

        // Inspect call stack to see if we stepped into library or CRT internals
        try {
          const stackRes = await event.session.customRequest('stackTrace', {
            threadId: event.threadId,
            startFrame: 0,
            levels: 10,
          });
          const frames = stackRes?.stackFrames || [];
          if (frames.length > 0) {
            const topPath = frames[0].source?.path || frames[0].source?.name || '';
            const topFunc = (frames[0].name || '').toLowerCase();
            const isTopUser =
              StateExtractor.isUserSource(topPath) &&
              !topFunc.includes('crt') &&
              !topFunc.includes('startup');
            const hasUserCaller = frames.some((f: any) => {
              const p = f.source?.path || f.source?.name || '';
              const n = (f.name || '').toLowerCase();
              return StateExtractor.isUserSource(p) && !n.includes('crt') && !n.includes('startup');
            });

            // If we are inside an internal library function (e.g. non-user file or CRT),
            // automatically step out back into user source code
            if (!isTopUser && hasUserCaller) {
              await ExecutionController.stepOut();
              return;
            }
          }
        } catch {
          // Ignore and continue
        }

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
      DebugTrackerFactory.onTerminated(async (session) => {
        this.clearEditorHighlight();
        await this.restoreNativeStackFrameHighlight();
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

    this.sendTargetFileUpdate();
  }

  public sendTargetFileUpdate(): void {
    const target = CppCompiler.resolveSourceFile();
    this.postMessage({
      command: 'targetFile',
      fileName: target ? path.basename(target) : 'stack-operations.cpp',
      filePath: target || '',
    });
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.command) {
      case 'visualize':
        await this.startVisualization(message.filePath);
        break;

      case 'retry':
        await this.startVisualization();
        break;

      case 'visualizeExample':
        if (message.example) {
          const wsFolders = vscode.workspace.workspaceFolders;
          if (wsFolders && wsFolders.length > 0) {
            const map: Record<string, string> = {
              stack: 'examples/stack-operations.cpp',
              array: 'examples/array-operations.cpp',
              linkedlist: 'examples/linked-list.cpp',
              tree: 'examples/bst-traversals.cpp',
            };
            const rel = map[message.example] || 'examples/stack-operations.cpp';
            const fullPath = path.join(wsFolders[0].uri.fsPath, rel);
            if (fs.existsSync(fullPath)) {
              await this.startVisualization(fullPath);
            }
          }
        }
        break;

      case 'getTargetFile':
        this.sendTargetFileUpdate();
        break;

      case 'next':
        await this.stepNext();
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

  public async stepNext(): Promise<void> {
    if (this.snapshotManager.canGoNextHistory()) {
      const nextSnap = this.snapshotManager.nextHistory();
      if (nextSnap) {
        this.broadcastState(nextSnap);
      }
    } else {
      const curr = this.snapshotManager.getCurrentSnapshot();
      if (curr && curr.changeType === 'final' && !DebugSessionManager.getActiveSession()) {
        return;
      }
      await this.executeSmartStep();
    }
  }

  private async executeSmartStep(): Promise<void> {
    const session = DebugSessionManager.getActiveSession();
    if (!session) return;

    const threadId = DebugTrackerFactory.getLastThreadId();

    try {
      const stackRes = await session.customRequest('stackTrace', {
        threadId,
        startFrame: 0,
        levels: 10,
      });
      const frames = stackRes?.stackFrames || [];
      const userFrame =
        frames.find((f: any) => {
          const p = f.source?.path || f.source?.name || '';
          const name = (f.name || '').toLowerCase();
          return StateExtractor.isUserSource(p) && !name.includes('crt') && !name.includes('startup');
        }) || frames[0];

      if (!userFrame) {
        await ExecutionController.next();
        return;
      }

      const rawPath = userFrame.source?.path || userFrame.source?.name || '';
      const resolvedFile = StateExtractor.resolveFilePath(rawPath) || rawPath;
      const currentLine = userFrame.line;
      const lineText = StateExtractor.getLineText(resolvedFile, currentLine);

      // Check user-defined helper functions in this file (e.g. printList, deleteNode, insertAtHead)
      const userFunctions = StateExtractor.getUserDefinedFunctions(resolvedFile);

      // If current line is a function definition header (e.g. `void printList(Node* node) {`), don't treat it as a function call
      const isDefHeader =
        /^\s*(?:void|int|bool|char|double|float|auto|Node\*?|ListNode\*?)\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\)\s*\{?$/.test(
          lineText
        ) || /^\s*#/.test(lineText);

      let callsUserFunction = false;
      if (!isDefHeader) {
        for (const fnName of userFunctions) {
          // Skip trivial 1-line getter/predicate checks so execution stays inside the main algorithm/method
          const isTrivialHelper = [
            'isfull',
            'isempty',
            'getfront',
            'getrear',
            'peek',
            'front',
            'rear',
            'top',
            'size',
          ].includes(fnName.toLowerCase());

          if (isTrivialHelper) {
            continue;
          }

          const regex = new RegExp(`\\b${fnName}\\s*\\(`);
          if (regex.test(lineText)) {
            callsUserFunction = true;
            break;
          }
        }
      }

      // If current line calls a user helper function (like printList(head) or deleteNode(head, 30)),
      // step INTO the helper function!
      if (callsUserFunction) {
        await ExecutionController.stepIn();
      } else {
        // Otherwise step OVER (so new Node(...) constructors, cout statements, and queue/stack operations execute cleanly in 1 step)
        await ExecutionController.next();
      }
    } catch {
      await ExecutionController.next();
    }
  }

  public reveal(): void {
    if (this.view) {
      this.view.show(true);
    } else {
      vscode.commands.executeCommand('debug-mentor.sidebar.focus');
    }
  }

  public async startVisualization(explicitSource?: string): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    try {
      await this.prepareVisualization(explicitSource);
    } catch (error) {
      await this.restoreNativeStackFrameHighlight();
      ExecutionController.setPaused(true);
      this.postMessage({
        command: 'error',
        message: 'Could not start simulation',
        details: error instanceof Error ? error.message : String(error),
        canRetry: true,
      });
    } finally {
      this.starting = false;
    }
  }

  private async prepareVisualization(explicitSource?: string): Promise<void> {
    this.reveal();
    await vscode.commands.executeCommand('workbench.action.closePanel');
    if (DebugSessionManager.getActiveSession()) {
      await DebugSessionManager.stopDebugging();
      await new Promise((r) => setTimeout(r, 150));
    }

    this.postMessage({
      command: 'status',
      text: 'Preparing C++ program...',
      step: 'compiling',
    });

    const sourceFile = CppCompiler.resolveSourceFile(explicitSource);
    if (!sourceFile) {
      this.postMessage({
        command: 'error',
        message: 'No active C++ file detected',
        details:
          'Please open a valid C++ file (such as examples/stack-operations.cpp) in the editor and try again.',
        canRetry: true,
      });
      return;
    }

    // Ensure source file is opened in editor beside webview
    try {
      const doc = await vscode.workspace.openTextDocument(sourceFile);
      await vscode.window.showTextDocument(doc, { preserveFocus: true, preview: false });
    } catch {
      // ignore
    }
    this.sendTargetFileUpdate();

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

    // Suppress VS Code's native stack frame highlight so there are not two highlights
    await this.suppressNativeStackFrameHighlight();

    // Reset session trackers
    this.snapshotManager.reset();
    StateExtractor.reset();
    StateExtractor.setActiveSourceFile(sourceFile);
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
      await this.restoreNativeStackFrameHighlight();
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

  private originalColors: Record<string, any> | undefined = undefined;

  // Single unified amber highlight for both live stepping and history navigation
  private activeLineDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(235, 155, 30, 0.22)',
    isWholeLine: true,
    border: '1px solid rgba(235, 155, 30, 0.55)',
    overviewRulerColor: '#EB9B1E',
    overviewRulerLane: vscode.OverviewRulerLane.Full,
  });

  private async suppressNativeStackFrameHighlight(): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('workbench');
      this.originalColors = config.get<Record<string, any>>('colorCustomizations');
      const target = vscode.workspace.workspaceFolders
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;

      await config.update(
        'colorCustomizations',
        {
          ...(this.originalColors || {}),
          'editor.stackFrameHighlightBackground': '#00000000',
          'editor.focusedStackFrameHighlightBackground': '#00000000',
        },
        target
      );
    } catch {
      // Ignore if user environment restricts setting writes
    }
  }

  private async restoreNativeStackFrameHighlight(): Promise<void> {
    try {
      if (this.originalColors !== undefined) {
        const config = vscode.workspace.getConfiguration('workbench');
        const target = vscode.workspace.workspaceFolders
          ? vscode.ConfigurationTarget.Workspace
          : vscode.ConfigurationTarget.Global;
        await config.update('colorCustomizations', this.originalColors, target);
        this.originalColors = undefined;
      }
    } catch {
      // Ignore
    }
  }

  private updateEditorActiveLineHighlight(
    snapshot: LinkedListSnapshot,
    openIfNotVisible: boolean = false
  ): void {
    const line = snapshot.source?.line;
    const filePath = snapshot.source?.file;

    if (!line || line <= 0) {
      this.clearEditorHighlight();
      return;
    }

    const targetLine = line - 1;
    const range = new vscode.Range(targetLine, 0, targetLine, 0);

    let foundEditor = false;
    for (const editor of vscode.window.visibleTextEditors) {
      const isMatchingDoc =
        !filePath ||
        editor.document.fileName.endsWith(filePath) ||
        path.basename(editor.document.fileName) === path.basename(filePath);

      if (isMatchingDoc) {
        editor.setDecorations(this.activeLineDecorationType, [range]);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);

        if (editor.document.lineCount > targetLine) {
          const pos = new vscode.Position(targetLine, 0);
          editor.selection = new vscode.Selection(pos, pos);
        }
        foundEditor = true;
      }
    }

    if (!foundEditor && openIfNotVisible && filePath && fs.existsSync(filePath)) {
      vscode.workspace.openTextDocument(filePath).then((doc) => {
        vscode.window.showTextDocument(doc, { preserveFocus: true }).then((editor) => {
          editor.setDecorations(this.activeLineDecorationType, [range]);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        });
      });
    }
  }

  private clearEditorHighlight(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(this.activeLineDecorationType, []);
    }
  }

  private broadcastState(snapshot: LinkedListSnapshot): void {
    this.reveal();
    this.updateEditorActiveLineHighlight(snapshot, true);
    const isHistorical = !!snapshot.isHistorical;
    const isFinal = snapshot.changeType === 'final';
    const isPaused = ExecutionController.status.isPaused;
    const isRunning = ExecutionController.status.isRunning;

    this.postMessage({
      command: 'updateState',
      snapshot,
      canStepNext: isHistorical ? true : ((!isFinal || !!DebugSessionManager.getActiveSession()) && isPaused),
      canStepPrev: this.snapshotManager.canGoPrev(),
      canContinue: isPaused && !isHistorical && (!isFinal || !!DebugSessionManager.getActiveSession()),
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

  public async dispose(): Promise<void> {
    this.clearEditorHighlight();
    this.activeLineDecorationType.dispose();
    await this.restoreNativeStackFrameHighlight();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
