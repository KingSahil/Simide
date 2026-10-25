import * as vscode from 'vscode';
import * as path from 'path';
import { LinkedListViewProvider } from './sidebar/linkedListViewProvider';
import { DebugTrackerFactory } from './debug/debugAdapterTracker';
import { DebugSessionManager } from './debug/debugSessionManager';
import { CppCompiler } from './debug/compiler';

export function activate(context: vscode.ExtensionContext) {
  console.log('[SimIDE] Activating SimIDE extension...');

  if (vscode.window.activeTextEditor) {
    const fn = vscode.window.activeTextEditor.document.fileName;
    if (fn.endsWith('.cpp') || fn.endsWith('.cc') || fn.endsWith('.cxx')) {
      CppCompiler.setLastActiveSourceFile(fn);
    }
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        const fn = editor.document.fileName;
        if (fn.endsWith('.cpp') || fn.endsWith('.cc') || fn.endsWith('.cxx')) {
          CppCompiler.setLastActiveSourceFile(fn);
        }
      }
    })
  );

  // Register Webview Provider for the sidebar view
  const provider = new LinkedListViewProvider(context.extensionUri, context.globalStorageUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      LinkedListViewProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  // Register Debug Adapter Tracker Factory to capture stopped/continued events from DAP
  const trackerFactory = new DebugTrackerFactory();
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterTrackerFactory('*', trackerFactory)
  );

  // Monitor active debug sessions
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession(async (session) => {
      if (
        session.name.includes('SimIDE') ||
        session.name.includes('Debug Mentor') ||
        session.type === 'cppdbg'
      ) {
        DebugSessionManager.setActiveSession(session);
        provider.reveal();
        await vscode.commands.executeCommand('workbench.action.closePanel');
        setTimeout(() => {
          vscode.commands.executeCommand('workbench.action.closePanel');
        }, 200);
        setTimeout(() => {
          vscode.commands.executeCommand('workbench.action.closePanel');
        }, 600);
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidOpenTerminal((terminal) => {
      if (
        DebugSessionManager.getActiveSession() ||
        terminal.name.toLowerCase().includes('cppdbg') ||
        terminal.name.toLowerCase().includes('simide')
      ) {
        vscode.commands.executeCommand('workbench.action.closePanel');
      }
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidTerminateDebugSession((session) => {
      if (DebugSessionManager.getActiveSession()?.id === session.id) {
        DebugSessionManager.setActiveSession(null);
      }
    })
  );

  // Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('debug-mentor.visualize', async () => {
      await vscode.commands.executeCommand('workbench.action.closePanel');
      await vscode.commands.executeCommand('debug-mentor.sidebar.focus');
      await provider.startVisualization();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug-mentor.visualizeStack', async () => {
      await vscode.commands.executeCommand('workbench.action.closePanel');
      await vscode.commands.executeCommand('debug-mentor.sidebar.focus');
      const wsFolders = vscode.workspace.workspaceFolders;
      if (wsFolders && wsFolders.length > 0) {
        const fullPath = path.join(wsFolders[0].uri.fsPath, 'examples', 'stack-operations.cpp');
        await provider.startVisualization(fullPath);
      } else {
        await provider.startVisualization();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug-mentor.next', async () => {
      await provider.stepNext();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug-mentor.prev', async () => {
      // Historical navigation
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug-mentor.restart', async () => {
      await provider.restartSession();
    })
  );

  console.log('[DebugMentor] VS Code Debug Mentor successfully activated.');
}

export function deactivate() {
  DebugSessionManager.stopDebugging();
}
