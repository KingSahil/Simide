import * as vscode from 'vscode';
import { DebugSessionManager } from './debugSessionManager';
import { DebugTrackerFactory } from './debugAdapterTracker';

export class ExecutionController {
  private static isOperating: boolean = false;
  private static isPaused: boolean = true;
  private static isRunning: boolean = false;

  public static get status() {
    return {
      isOperating: this.isOperating,
      isPaused: this.isPaused,
      isRunning: this.isRunning,
    };
  }

  public static setPaused(paused: boolean): void {
    this.isPaused = paused;
    this.isRunning = !paused;
    if (paused) {
      this.isOperating = false;
    }
  }

  public static setRunning(running: boolean): void {
    this.isRunning = running;
    this.isPaused = !running;
  }

  public static async next(): Promise<boolean> {
    if (this.isOperating || this.isRunning) {
      return false;
    }

    const session = DebugSessionManager.getActiveSession();
    if (!session) {
      return false;
    }

    this.isOperating = true;
    this.isRunning = true;
    this.isPaused = false;

    const threadId = DebugTrackerFactory.getLastThreadId();
    try {
      await session.customRequest('next', { threadId });
      return true;
    } catch {
      // Fallback to standard VS Code command if customRequest fails
      try {
        await vscode.commands.executeCommand('workbench.action.debug.stepOver');
        return true;
      } catch (err) {
        this.isOperating = false;
        this.isRunning = false;
        this.isPaused = true;
        return false;
      }
    }
  }

  public static async stepIn(): Promise<boolean> {
    if (this.isOperating || this.isRunning) return false;
    const session = DebugSessionManager.getActiveSession();
    if (!session) return false;

    this.isOperating = true;
    this.isRunning = true;
    this.isPaused = false;
    const threadId = DebugTrackerFactory.getLastThreadId();

    try {
      await session.customRequest('stepIn', { threadId });
      return true;
    } catch {
      try {
        await vscode.commands.executeCommand('workbench.action.debug.stepInto');
        return true;
      } catch {
        this.isOperating = false;
        this.isRunning = false;
        this.isPaused = true;
        return false;
      }
    }
  }

  public static async stepOut(): Promise<boolean> {
    if (this.isOperating || this.isRunning) return false;
    const session = DebugSessionManager.getActiveSession();
    if (!session) return false;

    this.isOperating = true;
    this.isRunning = true;
    this.isPaused = false;
    const threadId = DebugTrackerFactory.getLastThreadId();

    try {
      await session.customRequest('stepOut', { threadId });
      return true;
    } catch {
      try {
        await vscode.commands.executeCommand('workbench.action.debug.stepOut');
        return true;
      } catch {
        this.isOperating = false;
        this.isRunning = false;
        this.isPaused = true;
        return false;
      }
    }
  }

  public static async continue(): Promise<boolean> {
    if (this.isOperating || this.isRunning) return false;
    const session = DebugSessionManager.getActiveSession();
    if (!session) return false;

    this.isOperating = true;
    this.isRunning = true;
    this.isPaused = false;
    const threadId = DebugTrackerFactory.getLastThreadId();

    try {
      await session.customRequest('continue', { threadId });
      return true;
    } catch {
      try {
        await vscode.commands.executeCommand('workbench.action.debug.continue');
        return true;
      } catch {
        this.isOperating = false;
        this.isRunning = false;
        this.isPaused = true;
        return false;
      }
    }
  }

  public static async pause(): Promise<boolean> {
    const session = DebugSessionManager.getActiveSession();
    if (!session) return false;

    const threadId = DebugTrackerFactory.getLastThreadId();
    try {
      await session.customRequest('pause', { threadId });
      return true;
    } catch {
      try {
        await vscode.commands.executeCommand('workbench.action.debug.pause');
        return true;
      } catch {
        return false;
      }
    }
  }

  public static async restart(): Promise<boolean> {
    this.isOperating = false;
    try {
      await vscode.commands.executeCommand('workbench.action.debug.restart');
      return true;
    } catch {
      return false;
    }
  }
}
