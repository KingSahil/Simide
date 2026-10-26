import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  createUpdateStateMessage,
  ExtensionMessage,
  WebviewMessage,
} from './messages';
import { CppCompiler } from '../debug/compiler';
import { DebugSessionManager } from '../debug/debugSessionManager';
import { DebugTrackerFactory, DebuggerStopEvent } from '../debug/debugAdapterTracker';
import { ExecutionController } from '../debug/executionController';
import { StateExtractor } from '../debug/stateExtractor';
import {
  describeGraphSnapshotChange,
  preservePreviousGraphObjects,
} from '../debug/graphStateExtractor';
import { SnapshotManager } from '../visualization/snapshotManager';
import { isGraphSnapshot, VisualizationSnapshot } from '../visualization/graphModel';
import { selectVisualizationMode } from './visualizationMode';
import { listExamples } from './exampleCatalog';
import { TutorialManager } from '../tutorial/tutorialManager';
import { LinkedListSnapshot } from '../visualization/linkedListModel';
import { AstCodePatcher } from '../visualization/codePatcher';
import { ClangAstParser } from '../parser/clangAstParser';
import { GraphEdgeLinker, GraphEdge } from './edgeLinkHandler';
import { CreativeCodeManager } from '../creative/creativeCodeManager';
import { AiSecretManager } from '../ai/secretManager';
import { AiService } from '../ai/aiService';

export class LinkedListViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'debug-mentor.sidebar';

  private view?: vscode.WebviewView;
  private snapshotManager = new SnapshotManager();
  private stepCounter = 1;
  private disposables: vscode.Disposable[] = [];
  private starting = false;
  private openingExample = false;
  private visualizationMode: 'graph' | 'linked_list' = 'linked_list';

  private isCreativeMode = false;
  private creativeFilePath: string | null = null;
  private aiSecretManager: AiSecretManager;

  // Wiring engine: parses the backing source file with clang and turns a visual
  // graph edge into a precise source-text edit.
  private astParser = new ClangAstParser();
  private codePatcher = new AstCodePatcher();
  private edgeLinker!: GraphEdgeLinker;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly exampleStorageUri: vscode.Uri = extensionUri,
    edgeLinker?: GraphEdgeLinker,
    secrets?: vscode.SecretStorage,
    globalState?: vscode.Memento
  ) {
    this.edgeLinker = edgeLinker ?? new GraphEdgeLinker(this.astParser, this.codePatcher);
    this.aiSecretManager = new AiSecretManager(secrets, globalState);
    this.registerDebugListeners();
  }

  // Highlight for lines that received wiring code after a visual link was made.
  private linkEditDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(54, 199, 121, 0.18)',
    isWholeLine: true,
    border: '1px solid rgba(54, 199, 121, 0.6)',
    overviewRulerColor: '#36C779',
    overviewRulerLane: vscode.OverviewRulerLane.Full,
  });

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

    // Live sync for Creative Mode: user typing in editor updates simulation in real-time
    let syncDebounceTimer: NodeJS.Timeout | null = null;
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (!this.isCreativeMode) return;
        const creativePath = this.creativeFilePath;
        if (!creativePath) return;

        const eventNorm = event.document.fileName.replace(/\\/g, '/').toLowerCase();
        const targetNorm = creativePath.replace(/\\/g, '/').toLowerCase();
        if (eventNorm !== targetNorm && !eventNorm.endsWith(path.basename(targetNorm))) {
          return;
        }

        if (syncDebounceTimer) {
          clearTimeout(syncDebounceTimer);
        }
        syncDebounceTimer = setTimeout(() => {
          if (!this.isCreativeMode) return;
          const code = event.document.getText();
          const state = CreativeCodeManager.parseExistingCode(code);
          this.postMessage({
            command: 'creativeSyncState',
            nodes: state.nodes,
            stacks: state.stacks,
            queues: state.queues,
            strings: state.strings,
          });
        }, 120);
      })
    );

    // Stopped listener
    this.disposables.push(
      DebugTrackerFactory.onStopped(async (event: DebuggerStopEvent) => {
        await new Promise((r) => setTimeout(r, 10));
        await this.extractAndBroadcastCurrentState(event.session, event.threadId, event.reason);
      })
    );

    // Active stack item listener: triggers immediately when VS Code pauses at entry/breakpoint
    if (typeof vscode.debug?.onDidChangeActiveStackItem === 'function') {
      this.disposables.push(
        vscode.debug.onDidChangeActiveStackItem(async () => {
          const session = DebugSessionManager.getActiveSession();
          if (session && this.snapshotManager.totalSnapshots === 0) {
            try {
              const threadId = DebugTrackerFactory.getLastThreadId();
              await this.extractAndBroadcastCurrentState(session, threadId, 'entry');
            } catch (err) {
              console.warn('[LinkedListViewProvider] onDidChangeActiveStackItem extraction error:', err);
            }
          }
        })
      );
    }

    this.disposables.push(
      DebugTrackerFactory.onOutput((session, output, category) => {
        const activeSession = DebugSessionManager.getActiveSession();
        if (!activeSession || activeSession.id !== session.id) return;
        // Legacy modes already reconstruct output while stepping. Capture actual
        // DAP output for graphs without printing legacy output twice.
        if (this.visualizationMode !== 'graph') return;
        if (!StateExtractor.appendDapOutput(output, category)) return;

        this.postMessage({
          command: 'terminalOutput',
          output,
          fullOutput: StateExtractor.getAccumulatedTerminalOutput(),
        });
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
    this.sendAiKeyStatus();
  }

  public async sendAiKeyStatus(): Promise<void> {
    const config = await this.aiSecretManager.getConfig();
    this.postMessage({
      command: 'aiKeyStatus',
      hasKey: Boolean(config && config.apiKey.length > 0),
      provider: config?.provider,
      model: config?.model,
    });
  }

  private buildSnapshotSummary(snapshot: VisualizationSnapshot | null | undefined): string {
    if (!snapshot) return 'No active debugger or visualization step.';
    if (isGraphSnapshot(snapshot)) {
      const v = snapshot.graph.vertices.map((vx) => `${vx.id}(val=${vx.value})`).join(', ');
      const e = snapshot.graph.edges.map((ed) => `${ed.sourceId}->${ed.targetId}`).join(', ');
      return `Graph (step ${snapshot.stepNumber}): Vertices: [${v}], Edges: [${e}]. Explanation: ${snapshot.explanation}`;
    }
    const snap = snapshot as LinkedListSnapshot;
    const parts: string[] = [`Step ${snap.stepNumber}: ${snap.explanation}`];
    if (snap.structureType === 'string' && snap.strings && snap.strings.length > 0) {
      for (const s of snap.strings) {
        const chars = s.elements.map((el) => `'${el.char}'`).join(', ');
        parts.push(`String "${s.name}" (len ${s.length}): [${chars}]`);
      }
    } else if (snap.structureType === 'stack' && snap.stack) {
      parts.push(`Stack "${snap.stack.name}" (topIndex=${snap.stack.topIndex}): [${snap.stack.elements.map(el => el.value).join(', ')}]`);
    } else if (snap.structureType === 'queue' && snap.queue) {
      const vals = snap.queue.slots.filter(sl => sl.hasValue).map(sl => sl.value).join(', ');
      parts.push(`Queue "${snap.queue.name}" (front=${snap.queue.front}, rear=${snap.queue.rear}): [${vals}]`);
    } else if (snap.structureType === 'array' && snap.arrays && snap.arrays.length > 0) {
      for (const a of snap.arrays) {
        parts.push(`Array "${a.name}": [${a.elements.map(el => el.value).join(', ')}]`);
      }
    } else if (snap.nodes && snap.nodes.length > 0) {
      const chain = snap.nodes.map(n => `${n.variableName || n.id}(data=${n.data}, next=${n.nextId || 'null'})`).join(' -> ');
      parts.push(`Linked List: ${chain}`);
    }
    return parts.join('\n');
  }

  public sendTargetFileUpdate(): void {
    const target = CppCompiler.resolveSourceFile();
    this.postMessage({
      command: 'targetFile',
      fileName: target ? path.basename(target) : 'stack-operations.cpp',
      filePath: target || '',
    });
  }

  public async openExample(example: string): Promise<string | undefined> {
    const files: Record<string, string> = {
      stack: 'stack-operations.cpp',
      array: 'array-operations.cpp',
      linkedlist: 'linked-list.cpp',
      tree: 'bst-traversals.cpp',
      graph: 'graph-registry.cpp',
      string: 'string-palindrome.cpp',
    };
    const fileName = Object.prototype.hasOwnProperty.call(files, example) ? files[example] : example;
    try {
      const workspaceRoots = (vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath);
      const workspaceRoot = workspaceRoots[0];
      const catalog = listExamples(this.extensionUri.fsPath, ...workspaceRoots);
      if (!catalog.some(entry => entry.fileName === fileName)) {
        throw new Error('This example is unavailable. Return Home to refresh the list.');
      }
      const existingRoot = workspaceRoots.find(root => fs.existsSync(path.join(root, 'examples', fileName)));
      const directory = path.join(existingRoot || workspaceRoot || this.exampleStorageUri.fsPath, 'examples');
      const destination = path.join(directory, fileName);
      if (!fs.existsSync(destination)) {
        await fs.promises.mkdir(path.dirname(destination), { recursive: true });
        try {
          // Keep any example the learner has already edited.
          await fs.promises.copyFile(
            path.join(this.extensionUri.fsPath, 'examples', fileName),
            destination,
            fs.constants.COPYFILE_EXCL
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
      }
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(destination));
      await vscode.window.showTextDocument(document, { preview: false });
      CppCompiler.setLastActiveSourceFile(destination);
      this.sendTargetFileUpdate();
      return destination;
    } catch (error) {
      await vscode.window.showErrorMessage(`Could not open the SimIDE example: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async handleImportTutorial(inputUrl?: string): Promise<void> {
    let url = inputUrl;
    if (!url) {
      url = await vscode.window.showInputBox({
        prompt: 'Enter GitHub repository (e.g. "owner/repo" or "https://github.com/owner/repo")',
        placeHolder: 'owner/repo',
      });
    }
    if (!url) return;

    this.postMessage({
      command: 'status',
      text: 'Downloading tutorial from GitHub...',
      step: 'waiting',
    });

    const storagePath = this.exampleStorageUri.fsPath;
    const result = await TutorialManager.importFromGitHub(url, storagePath);

    if (!result.success || !result.tutorial) {
      await vscode.window.showErrorMessage(result.error || 'Failed to import tutorial.');
      this.postMessage({
        command: 'error',
        message: 'Import Failed',
        details: result.error,
        canRetry: true,
      });
      return;
    }

    const { tutorial, securityAudit } = result;

    if (securityAudit && !securityAudit.isSafe) {
      const choice = await vscode.window.showWarningMessage(
        `Security Notice: This tutorial from "${tutorial.manifest.author || url}" contains sensitive headers or syscalls:\n` +
          securityAudit.warnings.join(', ') +
          '\n\nDo you want to proceed and allow compilation?',
        { modal: true },
        'Proceed',
        'Cancel'
      );
      if (choice !== 'Proceed') {
        TutorialManager.setActiveTutorial(null);
        this.sendTargetFileUpdate();
        return;
      }
    }

    const firstLesson = tutorial.manifest.lessons[0];
    const selection = TutorialManager.selectLesson(firstLesson.id);

    if (selection) {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(selection.codePath));
      await vscode.window.showTextDocument(doc, { preview: false });
      CppCompiler.setLastActiveSourceFile(selection.codePath);
      this.sendTargetFileUpdate();

      this.postMessage({
        command: 'tutorialLoaded',
        manifest: tutorial.manifest,
        activeLessonId: firstLesson.id,
        guideMarkdown: selection.guideMarkdown,
        warnings: securityAudit?.warnings,
      });

      // Auto-start visualization for seamless tutorial onboarding
      await this.startVisualization(selection.codePath);
    }
  }

  public async handleSelectLesson(lessonId: string): Promise<void> {
    const selection = TutorialManager.selectLesson(lessonId);
    if (!selection) return;

    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(selection.codePath));
      await vscode.window.showTextDocument(doc, { preview: false });
      CppCompiler.setLastActiveSourceFile(selection.codePath);
      this.sendTargetFileUpdate();

      this.postMessage({
        command: 'lessonChanged',
        lessonId,
        guideMarkdown: selection.guideMarkdown,
      });

      // Automatically launch visualization for the newly selected lesson
      await this.startVisualization(selection.codePath);
    } catch (err: any) {
      await vscode.window.showErrorMessage(`Could not open lesson: ${err.message}`);
    }
  }

  public async handleCloseTutorial(): Promise<void> {
    TutorialManager.setActiveTutorial(null);
    this.postMessage({
      command: 'tutorialClosed',
    });
    this.sendTargetFileUpdate();
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.command) {
      case 'getExamples': {
        const roots = (vscode.workspace.workspaceFolders || []).map(folder => folder.uri.fsPath);
        this.postMessage({ command: 'examples', examples: listExamples(this.extensionUri.fsPath, ...roots) });
        break;
      }

      case 'goHome':
        this.isCreativeMode = false;
        if (DebugSessionManager.getActiveSession()) await DebugSessionManager.stopDebugging();
        this.clearEditorHighlight();
        this.snapshotManager.reset();
        this.sendTargetFileUpdate();
        this.postMessage({ command: 'home' });
        break;

      case 'visualize':
        this.isCreativeMode = false;
        await this.startVisualization(message.filePath);
        break;

      case 'retry':
        this.isCreativeMode = false;
        await this.startVisualization();
        break;

      case 'visualizeExample': {
        this.isCreativeMode = false;
        if (this.starting || this.openingExample) break;
        this.openingExample = true;
        try {
          const source = await this.openExample(message.example);
          if (source) await this.startVisualization(source);
        } finally {
          this.openingExample = false;
        }
        break;
      }

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

      case 'importTutorial':
        await this.handleImportTutorial(message.url);
        break;

      case 'selectLesson':
        await this.handleSelectLesson(message.lessonId);
        break;

      case 'closeTutorial':
        await this.handleCloseTutorial();
        break;

      case 'createEdge':
        await this.handleCreateEdge(message.edge);
        break;

      case 'creativeAddNode': {
        const editor = await this.getOrCreateCppEditor();
        if (!editor) {
          this.postMessage({
            command: 'creativeFeedback',
            ok: false,
            message: 'No open C++ file found. Please open or create a .cpp file.',
          });
          return;
        }
        if (message.nodeType === 'linkedlist') {
          const res = await CreativeCodeManager.addLinkedListNode(editor, message.varName, message.value);
          this.postMessage({
            command: 'creativeFeedback',
            ok: res.ok,
            message: res.message || res.error || '',
            highlightLine: res.highlightLine,
          });
          if (res.highlightLine) {
            this.highlightLinkEdit(editor.document.fileName, { startLine: res.highlightLine, endLine: res.highlightLine });
          }
        }
        break;
      }

      case 'creativeConnect': {
        const editor = await this.getOrCreateCppEditor();
        if (!editor) return;
        const res = await CreativeCodeManager.connectNodes(editor, message.sourceVar, message.targetVar);
        this.postMessage({
          command: 'creativeFeedback',
          ok: res.ok,
          message: res.message || res.error || '',
          highlightLine: res.highlightLine,
        });
        if (res.highlightLine) {
          this.highlightLinkEdit(editor.document.fileName, { startLine: res.highlightLine, endLine: res.highlightLine });
        }
        break;
      }

      case 'creativeDisconnect': {
        const editor = await this.getOrCreateCppEditor();
        if (!editor) return;
        const res = await CreativeCodeManager.disconnectNode(editor, message.sourceVar);
        this.postMessage({
          command: 'creativeFeedback',
          ok: res.ok,
          message: res.message || res.error || '',
        });
        break;
      }

      case 'creativeUpdateValue': {
        const editor = await this.getOrCreateCppEditor();
        if (!editor) return;
        const res = await CreativeCodeManager.updateNodeValue(editor, message.varName, message.newValue);
        this.postMessage({
          command: 'creativeFeedback',
          ok: res.ok,
          message: res.message || res.error || '',
          highlightLine: res.highlightLine,
        });
        if (res.highlightLine) {
          this.highlightLinkEdit(editor.document.fileName, { startLine: res.highlightLine, endLine: res.highlightLine });
        }
        break;
      }

      case 'creativeDeleteNode': {
        const editor = await this.getOrCreateCppEditor();
        if (!editor) return;
        const res = await CreativeCodeManager.deleteNode(editor, message.varName);
        this.postMessage({
          command: 'creativeFeedback',
          ok: res.ok,
          message: res.message || res.error || '',
        });
        break;
      }

      case 'creativeStackPush': {
        const editor = await this.getOrCreateCppEditor();
        if (!editor) return;
        const res = await CreativeCodeManager.handleStackPush(editor, message.varName, message.value);
        this.postMessage({
          command: 'creativeFeedback',
          ok: res.ok,
          message: res.message || res.error || '',
          highlightLine: res.highlightLine,
        });
        if (res.highlightLine) {
          this.highlightLinkEdit(editor.document.fileName, { startLine: res.highlightLine, endLine: res.highlightLine });
        }
        break;
      }

      case 'creativeQueuePush': {
        const editor = await this.getOrCreateCppEditor();
        if (!editor) return;
        const res = await CreativeCodeManager.handleQueuePush(editor, message.varName, message.value);
        this.postMessage({
          command: 'creativeFeedback',
          ok: res.ok,
          message: res.message || res.error || '',
          highlightLine: res.highlightLine,
        });
        if (res.highlightLine) {
          this.highlightLinkEdit(editor.document.fileName, { startLine: res.highlightLine, endLine: res.highlightLine });
        }
        break;
      }

      case 'creativeStringCreate': {
        const editor = await this.getOrCreateCppEditor();
        if (!editor) return;
        const res = await CreativeCodeManager.handleStringCreate(editor, message.varName, message.initialValue);
        this.postMessage({
          command: 'creativeFeedback',
          ok: res.ok,
          message: res.message || res.error || '',
          highlightLine: res.highlightLine,
        });
        if (res.highlightLine) {
          this.highlightLinkEdit(editor.document.fileName, { startLine: res.highlightLine, endLine: res.highlightLine });
        }
        break;
      }

      case 'creativeStringAppend': {
        const editor = await this.getOrCreateCppEditor();
        if (!editor) return;
        const res = await CreativeCodeManager.handleStringAppend(editor, message.varName, message.char);
        this.postMessage({
          command: 'creativeFeedback',
          ok: res.ok,
          message: res.message || res.error || '',
          highlightLine: res.highlightLine,
        });
        if (res.highlightLine) {
          this.highlightLinkEdit(editor.document.fileName, { startLine: res.highlightLine, endLine: res.highlightLine });
        }
        break;
      }

      case 'creativeStringMutate': {
        const editor = await this.getOrCreateCppEditor();
        if (!editor) return;
        const res = await CreativeCodeManager.handleStringMutate(editor, message.varName, message.index, message.char);
        this.postMessage({
          command: 'creativeFeedback',
          ok: res.ok,
          message: res.message || res.error || '',
          highlightLine: res.highlightLine,
        });
        if (res.highlightLine) {
          this.highlightLinkEdit(editor.document.fileName, { startLine: res.highlightLine, endLine: res.highlightLine });
        }
        break;
      }

      case 'creativeStringDelete': {
        const editor = await this.getOrCreateCppEditor();
        if (!editor) return;
        const res = await CreativeCodeManager.handleStringDelete(editor, message.varName);
        this.postMessage({
          command: 'creativeFeedback',
          ok: res.ok,
          message: res.message || res.error || '',
        });
        break;
      }

      case 'creativeRequestSync': {
        const editor = await this.getOrCreateCppEditor();
        if (editor) {
          const state = CreativeCodeManager.parseExistingCode(editor.document.getText());
          this.postMessage({
            command: 'creativeSyncState',
            nodes: state.nodes,
            stacks: state.stacks,
            queues: state.queues,
            strings: state.strings,
          });
        }
        break;
      }

      case 'creativeStart': {
        this.isCreativeMode = true;
        const wsFolders = vscode.workspace.workspaceFolders;
        let creativeFile = '';
        if (wsFolders && wsFolders.length > 0) {
          creativeFile = path.join(wsFolders[0].uri.fsPath, 'creative.cpp');
        } else {
          creativeFile = path.join(os.tmpdir(), 'creative.cpp');
        }

        // The creative mode should be started with a blank cpp file always
        fs.writeFileSync(creativeFile, '', 'utf8');
        this.creativeFilePath = creativeFile;
        CppCompiler.setLastActiveSourceFile(creativeFile);
        this.sendTargetFileUpdate();

        try {
          const doc = await vscode.workspace.openTextDocument(creativeFile);
          await vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.One,
            preserveFocus: false,
          });
        } catch (err) {
          console.error('[LinkedListViewProvider] Failed to open blank creative.cpp:', err);
        }

        this.postMessage({
          command: 'creativeSyncState',
          nodes: [],
          stacks: [],
          queues: [],
          strings: [],
        });
        break;
      }

      case 'aiCheckKeyStatus': {
        await this.sendAiKeyStatus();
        break;
      }

      case 'aiSaveKey': {
        await this.aiSecretManager.saveConfig({
          provider: message.provider,
          apiKey: message.apiKey,
          customEndpoint: message.customEndpoint,
          model: message.model,
        });
        await this.sendAiKeyStatus();
        this.postMessage({
          command: 'aiTestResult',
          ok: true,
          message: 'AI API credentials saved securely!',
        });
        break;
      }

      case 'aiDeleteKey': {
        await this.aiSecretManager.deleteConfig();
        await this.sendAiKeyStatus();
        this.postMessage({
          command: 'aiTestResult',
          ok: true,
          message: 'AI API key removed.',
        });
        break;
      }

      case 'aiTestKey': {
        const res = await AiService.testKey({
          provider: message.provider,
          apiKey: message.apiKey,
          customEndpoint: message.customEndpoint,
          model: message.model,
        });
        this.postMessage({
          command: 'aiTestResult',
          ok: res.ok,
          message: res.message,
        });
        break;
      }

      case 'aiAsk': {
        const config = await this.aiSecretManager.getConfig();
        if (!config || !config.apiKey) {
          this.postMessage({
            command: 'aiError',
            message: 'No API key configured. Click ⚙️ to configure your Gemini or OpenAI API key.',
          });
          break;
        }

        const editor = vscode.window.activeTextEditor || (await this.getOrCreateCppEditor());
        const activeCode = editor?.document.getText() || '';
        const fileName = editor
          ? path.basename(editor.document.fileName)
          : this.creativeFilePath
          ? path.basename(this.creativeFilePath)
          : 'source.cpp';
        const snap = this.snapshotManager.getCurrentSnapshot();
        const snapSummary = this.buildSnapshotSummary(snap);
        const termOutput = StateExtractor.getAccumulatedTerminalOutput();

        try {
          const answer = await AiService.ask(config, {
            problemStatement: message.problemStatement,
            promptType: message.promptType,
            userMessage: message.userMessage,
            activeCode,
            fileName,
            visualSnapshotSummary: snapSummary,
            terminalOutput: termOutput,
          });
          this.postMessage({
            command: 'aiResponse',
            text: answer,
            promptType: message.promptType,
          });
        } catch (err: any) {
          this.postMessage({
            command: 'aiError',
            message: err.message || 'AI request failed.',
          });
        }
        break;
      }

      case 'aiApplyCode': {
        const editor = vscode.window.activeTextEditor || (await this.getOrCreateCppEditor());
        if (!editor) {
          this.postMessage({
            command: 'aiError',
            message: 'No active C++ editor found to insert solution.',
          });
          break;
        }
        const fullRange = new vscode.Range(0, 0, editor.document.lineCount, 0);
        const success = await editor.edit((b) => b.replace(fullRange, message.code));
        this.postMessage({
          command: 'creativeFeedback',
          ok: success,
          message: success ? 'AI solution applied to editor!' : 'Could not apply code to editor.',
        });
        break;
      }
    }
  }

  private async getOrCreateCppEditor(): Promise<vscode.TextEditor | null> {
    if (this.isCreativeMode && this.creativeFilePath) {
      const normCreative = this.creativeFilePath.replace(/\\/g, '/').toLowerCase();
      for (const vis of vscode.window.visibleTextEditors) {
        if (vis.document.fileName.replace(/\\/g, '/').toLowerCase() === normCreative) {
          return vis;
        }
      }
      try {
        const doc = await vscode.workspace.openTextDocument(this.creativeFilePath);
        return await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preserveFocus: true });
      } catch {
        // Fallback
      }
    }

    let editor = vscode.window.activeTextEditor;
    if (editor && /\.(cpp|cc|cxx|c\+\+|h|hpp)$/i.test(editor.document.fileName)) {
      return editor;
    }

    for (const vis of vscode.window.visibleTextEditors) {
      if (/\.(cpp|cc|cxx|c\+\+|h|hpp)$/i.test(vis.document.fileName)) {
        return vis;
      }
    }

    const resolvedPath = CppCompiler.resolveSourceFile();
    if (resolvedPath && fs.existsSync(resolvedPath)) {
      try {
        const doc = await vscode.workspace.openTextDocument(resolvedPath);
        return await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preserveFocus: true });
      } catch {
        // Fallback
      }
    }

    const wsFolders = vscode.workspace.workspaceFolders;
    if (wsFolders && wsFolders.length > 0) {
      const defaultPath = path.join(wsFolders[0].uri.fsPath, 'creative-list.cpp');
      if (!fs.existsSync(defaultPath)) {
        fs.writeFileSync(defaultPath, '', 'utf8');
      }
      try {
        const doc = await vscode.workspace.openTextDocument(defaultPath);
        CppCompiler.setLastActiveSourceFile(defaultPath);
        return await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preserveFocus: true });
      } catch {
        // Fallback
      }
    }

    return null;
  }

  /**
   * Integration glue: a visual edge was created in the sidebar canvas. Translate
   * it into a source-code edit in the active editor, highlight the touched lines,
   * and re-parse the file so the AST visualization reflects the new wiring.
   */
  private async handleCreateEdge(edge: GraphEdge): Promise<void> {
    const editor = vscode.window.activeTextEditor || (await this.getOrCreateCppEditor());
    if (!editor) {
      this.postMessage({
        command: 'edgeError',
        message: 'No active editor. Open the C++ source file before creating links.',
      });
      return;
    }

    const filePath = editor.document.fileName;
    if (!/\.(cpp|cc|cxx|c\+\+|h|hpp)$/i.test(filePath)) {
      this.postMessage({
        command: 'edgeError',
        message: 'Active file is not a C++ source file.',
      });
      return;
    }

    this.edgeLinker.setSourceFile(filePath);
    const result = await this.edgeLinker.handleEdgeCreated(edge);

    if (!result.ok) {
      // Fallback: connect via CreativeCodeManager directly in the source file!
      const srcName = edge.source?.name || edge.source?.label || edge.source?.id;
      const tgtName = edge.target?.name || edge.target?.label || edge.target?.id;
      if (srcName && tgtName) {
        const fallbackRes = await CreativeCodeManager.connectNodes(editor, srcName, tgtName);
        if (fallbackRes.ok && fallbackRes.highlightLine) {
          this.highlightLinkEdit(filePath, { startLine: fallbackRes.highlightLine, endLine: fallbackRes.highlightLine });
          this.postMessage({
            command: 'edgeApplied',
            filePath,
            edit: { start: 0, end: 0, newText: `${srcName}->next = ${tgtName};\n` },
            sourceNodeId: edge.source.id,
            targetNodeId: edge.target.id,
            highlighted: { startLine: fallbackRes.highlightLine, endLine: fallbackRes.highlightLine },
            message: `Wired ${srcName} → ${tgtName}: ${srcName}->next = ${tgtName};`,
          });
          return;
        }
      }

      this.postMessage({
        command: 'edgeError',
        message: result.error ?? 'Link could not be applied to source code.',
        details: result.message,
      });
      return;
    }

    if (!result.edit || !result.highlighted) {
      this.postMessage({
        command: 'edgeError',
        message: 'The linker produced an empty edit.',
        details: result.message,
      });
      return;
    }

    // Apply the edit to the editor's text buffer (fully undoable via VS Code).
    const docText = editor.document.getText();
    const edit = result.edit!;
    const start = AstCodePatcher.offsetToPosition(docText, edit.start);
    const end = AstCodePatcher.offsetToPosition(docText, edit.end);
    try {
      await editor.edit((builder) => {
        builder.replace(new vscode.Range(
          new vscode.Position(start.line, start.character),
          new vscode.Position(end.line, end.character)
        ), edit.newText);
      });
    } catch (err: any) {
      this.postMessage({
        command: 'edgeError',
        message: 'Failed to apply the wiring edit to the editor buffer.',
        details: err.message ?? String(err),
      });
      return;
    }

    // Highlight the inserted lines across all visible editors of this file.
    this.highlightLinkEdit(filePath, result.highlighted);

    // Background re-parse of the modified code so the AST visualization tree
    // reflects the wiring in real time. Best-effort: failure does not roll back
    // the applied edit.
    let astReparsed = false;
    try {
      const ast = await this.astParser.parseFile(filePath);
      const nodeCount = AstCodePatcher.findAll(ast, () => true).length;
      this.postMessage({ command: 'astRefreshed', filePath, nodeCount });
      astReparsed = true;
    } catch (err: any) {
      // clang may not be installed; the edit itself remains applied.
    }

    this.postMessage({
      command: 'edgeApplied',
      filePath,
      edit: result.edit,
      highlighted: result.highlighted,
      message: result.message ?? `Edge wired into ${path.basename(filePath)}.`,
    });
  }

  /**
   * Paint whole-line decorations over the lines that received wiring code, and
   * scroll the editor to the first highlighted line.
   */
  private highlightLinkEdit(filePath: string, highlighted: { startLine: number; endLine: number }): void {
    const startLine = Math.max(0, highlighted.startLine - 1);
    const endLine = Math.max(startLine, highlighted.endLine - 1);
    const decorations: vscode.Range[] = [];
    for (let line = startLine; line <= endLine; line++) {
      decorations.push(new vscode.Range(line, 0, line, 0));
    }
    const revealRange = new vscode.Range(startLine, 0, endLine + 1, 0);
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.fileName === filePath) {
        editor.setDecorations(this.linkEditDecorationType, decorations);
        editor.revealRange(revealRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      }
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
    this.visualizationMode = selectVisualizationMode(fs.readFileSync(sourceFile, 'utf8'));
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

    // If the debugger has already stopped and created a snapshot during launch,
    // re-broadcast it now so the webview is never left in loading state.
    const latestSnapshot = this.snapshotManager.getCurrentSnapshot();
    if (latestSnapshot) {
      this.broadcastState(latestSnapshot);
    } else {
      this.postMessage({
        command: 'status',
        text: 'Waiting for debugger to pause at entry...',
        step: 'waiting',
      });

      // Polling safety watchdog: checks every 300ms (up to 18 attempts = ~5.4s).
      // As soon as the debugger is paused at entry, extracts & broadcasts state.
      let pollCount = 0;
      const pollInterval = setInterval(async () => {
        pollCount++;
        if (this.snapshotManager.totalSnapshots > 0) {
          clearInterval(pollInterval);
          return;
        }
        const activeSession = DebugSessionManager.getActiveSession();
        if (activeSession) {
          try {
            const threadId = DebugTrackerFactory.getLastThreadId();
            const ok = await this.extractAndBroadcastCurrentState(activeSession, threadId, 'entry');
            if (ok || this.snapshotManager.totalSnapshots > 0) {
              clearInterval(pollInterval);
              return;
            }
          } catch {
            // keep trying until timeout
          }
        }
        if (pollCount >= 18) {
          clearInterval(pollInterval);
          if (this.snapshotManager.totalSnapshots === 0) {
            const fallbackSnapshot: VisualizationSnapshot = {
              stepNumber: 1,
              structureType: (this.visualizationMode === 'graph' ? 'graph' : 'linked_list') as any,
              source: {
                file: sourceFile || '',
                line: 1,
                functionName: 'main',
              },
              hasHead: false,
              headId: null,
              nodes: [],
              pointers: [],
              arrays: [],
              indexPointers: [],
              explanation: 'Program paused at start. Click Next to begin execution.',
              changeType: 'init',
              terminalOutput: '',
              isHistorical: false,
            };
            this.snapshotManager.addSnapshot(fallbackSnapshot);
            this.broadcastState(fallbackSnapshot);
          }
        }
      }, 300);
    }
  }

  public async extractAndBroadcastCurrentState(
    session: vscode.DebugSession,
    threadId: number,
    reason?: string
  ): Promise<boolean> {
    ExecutionController.setPaused(true);
    vscode.commands.executeCommand('workbench.action.closePanel');

    // Inspect call stack to see if we stepped into library or CRT internals
    try {
      const stackRes = await session.customRequest('stackTrace', {
        threadId,
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
        // automatically step out back into user source code (never at entry or initial stop)
        if (this.snapshotManager.totalSnapshots > 0 && reason !== 'entry' && !isTopUser && hasUserCaller) {
          await ExecutionController.stepOut();
          return false;
        }
      }
    } catch {
      // Ignore and continue
    }

    const previousSnapshot = this.snapshotManager.getLatestSnapshot();
    let snapshot: VisualizationSnapshot | null = null;
    let mode: 'graph' | 'linked_list' = 'linked_list';
    const sourceFile = StateExtractor.resolveFilePath();

    if (sourceFile) {
      try {
        mode = selectVisualizationMode(fs.readFileSync(sourceFile, 'utf8'));
      } catch (error) {
        console.warn(
          `[LinkedListViewProvider] Could not inspect '${sourceFile}' for graph registry types.`,
          error
        );
      }
    }

    const stepNumber = this.stepCounter++;
    if (mode === 'graph') {
      try {
        const extractedGraphSnapshot = await StateExtractor.extractGraphState(
          session,
          threadId,
          stepNumber
        );
        if (extractedGraphSnapshot) {
          const graphSnapshot = preservePreviousGraphObjects(
            previousSnapshot && isGraphSnapshot(previousSnapshot)
              ? previousSnapshot
              : undefined,
            extractedGraphSnapshot
          );
          const graphChange = describeGraphSnapshotChange(
            previousSnapshot && isGraphSnapshot(previousSnapshot)
              ? previousSnapshot
              : undefined,
            graphSnapshot
          );
          snapshot = {
            ...graphSnapshot,
            ...graphChange,
            terminalOutput: StateExtractor.getAccumulatedTerminalOutput(),
          };
        } else {
          console.warn(
            '[LinkedListViewProvider] Graph source detected, but no supported graph state was available at this debugger stop.'
          );
          if (previousSnapshot && isGraphSnapshot(previousSnapshot)) {
            try {
              const stackResponse = await session.customRequest('stackTrace', {
                threadId,
                startFrame: 0,
                levels: 25,
              });
              const hasUserFrame = (stackResponse?.stackFrames || []).some((frame: any) => {
                const framePath = frame.source?.path || frame.source?.name || '';
                const frameName = (frame.name || '').toLowerCase();
                return (
                  StateExtractor.isUserSource(framePath) &&
                  !frameName.includes('crt') &&
                  !frameName.includes('startup')
                );
              });
              if (!hasUserFrame) {
                snapshot = {
                  ...previousSnapshot,
                  stepNumber,
                  explanation: 'Program execution completed. This is the final graph state.',
                  changeType: 'final',
                  terminalOutput: StateExtractor.getAccumulatedTerminalOutput(),
                  isHistorical: false,
                };
              }
            } catch (error) {
              console.warn(
                '[LinkedListViewProvider] Could not determine whether graph execution completed.',
                error
              );
            }
          }
        }
      } catch (error) {
        console.error('[LinkedListViewProvider] Graph snapshot extraction failed.', error);
      }
    } else {
      const previousListSnapshot =
        previousSnapshot && !isGraphSnapshot(previousSnapshot)
          ? previousSnapshot
          : undefined;
      snapshot = await StateExtractor.extractState(
        session,
        threadId,
        stepNumber,
        previousListSnapshot
      );
    }

    if (snapshot) {
      this.snapshotManager.addSnapshot(snapshot);
      this.broadcastState(snapshot);
      return true;
    } else if (this.snapshotManager.totalSnapshots === 0) {
      // Fallback entry snapshot to guarantee the webview never hangs in loading state
      const fallbackSnapshot: VisualizationSnapshot = {
        stepNumber: 1,
        structureType: (mode === 'graph' ? 'graph' : 'linked_list') as any,
        source: {
          file: sourceFile || '',
          line: 1,
          functionName: 'main',
        },
        hasHead: false,
        headId: null,
        nodes: [],
        pointers: [],
        arrays: [],
        indexPointers: [],
        explanation: 'Program paused at start. Click Next to begin execution.',
        changeType: 'init',
        terminalOutput: StateExtractor.getAccumulatedTerminalOutput(),
        isHistorical: false,
      };
      this.snapshotManager.addSnapshot(fallbackSnapshot);
      this.broadcastState(fallbackSnapshot);
      return true;
    }
    return false;
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
    snapshot: VisualizationSnapshot,
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
      const docName = editor.document?.fileName || '';
      const isMatchingDoc =
        !filePath ||
        (docName && (docName.endsWith(filePath) || path.basename(docName) === path.basename(filePath)));

      if (isMatchingDoc && editor.setDecorations) {
        editor.setDecorations(this.activeLineDecorationType, [range]);
        editor.revealRange?.(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);

        if (editor.document && editor.document.lineCount > targetLine) {
          const pos = new vscode.Position(targetLine, 0);
          editor.selection = new vscode.Selection(pos, pos);
        }
        foundEditor = true;
      }
    }

    if (!foundEditor && openIfNotVisible && filePath && fs.existsSync(filePath)) {
      vscode.workspace.openTextDocument(filePath).then((doc) => {
        vscode.window.showTextDocument(doc, { preserveFocus: true }).then((editor) => {
          if (editor && typeof editor.setDecorations === 'function') {
            editor.setDecorations(this.activeLineDecorationType, [range]);
            editor.revealRange?.(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
          }
        });
      });
    }
  }

  private clearEditorHighlight(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      editor?.setDecorations?.(this.activeLineDecorationType, []);
    }
  }

  private broadcastState(snapshot: VisualizationSnapshot): void {
    this.reveal();
    this.updateEditorActiveLineHighlight(snapshot, true);
    const isHistorical = !!snapshot.isHistorical;
    const isFinal = snapshot.changeType === 'final';
    const isPaused = ExecutionController.status.isPaused;
    const isRunning = ExecutionController.status.isRunning;

    this.postMessage(
      createUpdateStateMessage(snapshot, {
        canStepNext: isHistorical
          ? true
          : ((!isFinal || !!DebugSessionManager.getActiveSession()) && isPaused),
        canStepPrev: this.snapshotManager.canGoPrev(),
        canContinue:
          isPaused && !isHistorical && (!isFinal || !!DebugSessionManager.getActiveSession()),
        canPause: isRunning,
        canRestart: true,
        isPaused,
        isRunning,
        totalSnapshots: this.snapshotManager.totalSnapshots,
        currentSnapshotIndex: this.snapshotManager.currentSnapshotIndex,
      })
    );
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
    this.linkEditDecorationType.dispose();
    await this.restoreNativeStackFrameHighlight();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
