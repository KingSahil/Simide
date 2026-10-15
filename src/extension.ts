import * as vscode from 'vscode';
import { LinkedListViewProvider } from './sidebar/linkedListViewProvider';
import { DebugTrackerFactory } from './debug/debugAdapterTracker';
import { DebugSessionManager } from './debug/debugSessionManager';

export function activate(context: vscode.ExtensionContext) {
  console.log('[SimIDE] Activating SimIDE extension...');

  // Register Webview Provider for the sidebar view
  const provider = new LinkedListViewProvider(context.extensionUri);
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
    vscode.debug.onDidStartDebugSession((session) => {
      if (
        session.name.includes('SimIDE') ||
        session.name.includes('Debug Mentor') ||
        session.type === 'cppdbg'
      ) {
        DebugSessionManager.setActiveSession(session);
        provider.reveal();
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
      await vscode.commands.executeCommand('debug-mentor.sidebar.focus');
      await provider.startVisualization();
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
