import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export class DebugSessionManager {
  private static activeSession: vscode.DebugSession | null = null;
  private static cachedGdbPath: string | null = null;

  public static getWindowsShortPath(longPath: string): string {
    if (process.platform !== 'win32' || !longPath) {
      return longPath;
    }
    try {
      const shortPath = execSync(`cmd.exe /c for %I in ("${longPath}") do @echo %~sI`, { encoding: 'utf8' }).trim();
      if (shortPath && fs.existsSync(shortPath)) {
        return shortPath;
      }
    } catch {
      // fallback
    }
    return longPath;
  }

  public static getActiveSession(): vscode.DebugSession | null {
    return this.activeSession;
  }

  public static setActiveSession(session: vscode.DebugSession | null): void {
    this.activeSession = session;
  }

  public static async findDebuggerPath(): Promise<{ path: string; miMode: 'gdb' | 'lldb' } | null> {
    if (this.cachedGdbPath && fs.existsSync(this.cachedGdbPath)) {
      return { path: this.cachedGdbPath, miMode: 'gdb' };
    }

    // Windows specific common paths
    const winCandidates = [
      'C:\\ProgramData\\mingw64\\mingw64\\bin\\gdb.exe',
      'C:\\msys64\\mingw64\\bin\\gdb.exe',
      'C:\\MinGW\\bin\\gdb.exe',
      'C:\\Program Files\\LLVM\\bin\\lldb.exe',
    ];

    if (process.platform === 'win32') {
      for (const candidate of winCandidates) {
        if (fs.existsSync(candidate)) {
          this.cachedGdbPath = candidate;
          return {
            path: candidate,
            miMode: candidate.toLowerCase().includes('lldb') ? 'lldb' : 'gdb',
          };
        }
      }
    }

    // Check system PATH
    const debuggers: Array<{ name: string; miMode: 'gdb' | 'lldb' }> = [
      { name: 'gdb', miMode: 'gdb' },
      { name: 'lldb', miMode: 'lldb' },
    ];

    for (const d of debuggers) {
      try {
        await execFileAsync(d.name, ['--version']);
        this.cachedGdbPath = d.name;
        return { path: d.name, miMode: d.miMode };
      } catch {
        // try next
      }
    }

    return null;
  }

  public static async startDebugging(
    executablePath: string,
    sourcePath: string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.activeSession) {
      return {
        success: false,
        error: 'A debugging session is already active. Please stop or restart it.',
      };
    }

    const debuggerInfo = await this.findDebuggerPath();
    if (!debuggerInfo) {
      return {
        success: false,
        error:
          'Could not locate GDB or LLDB debugger in PATH. Please install GDB (e.g. MinGW-w64) or LLVM and ensure it is available.',
      };
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    const folder = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0] : undefined;
    const rawCwd = folder ? folder.uri.fsPath : path.dirname(sourcePath);
    const cwd = this.getWindowsShortPath(rawCwd);
    const prog = this.getWindowsShortPath(executablePath);
    const dbgPath = this.getWindowsShortPath(debuggerInfo.path);

    // Ensure C/C++ extension is installed (support both ms-vscode.cpptools and Antigravity's kylinideteam.cppdebug)
    const cppExtension =
      vscode.extensions.getExtension('ms-vscode.cpptools') ||
      vscode.extensions.getExtension('kylinideteam.cppdebug');
    if (!cppExtension) {
      vscode.window.showWarningMessage(
        'The C/C++ extension (ms-vscode.cpptools) is recommended for best debugger support.'
      );
    }

    const debugConfig: vscode.DebugConfiguration = {
      name: 'SimIDE (C++)',
      type: 'cppdbg',
      request: 'launch',
      program: prog,
      args: [],
      stopAtEntry: true,
      cwd: cwd,
      environment: [],
      externalConsole: false,
      avoidWindowsConsoleRedirection: true,
      internalConsoleOptions: 'neverOpen',
      MIMode: debuggerInfo.miMode,
      miDebuggerPath: dbgPath,
      setupCommands: [
        {
          description: 'Enable pretty-printing for gdb',
          text: '-enable-pretty-printing',
          ignoreFailures: true,
        },
      ],
    };

    try {
      const started = await vscode.debug.startDebugging(undefined, debugConfig, {
        suppressDebugView: true,
      });
      if (!started) {
        return {
          success: false,
          error: 'VS Code could not launch the debug adapter. Please verify C/C++ extension settings.',
        };
      }
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to start debugger: ${err.message || String(err)}`,
      };
    }
  }

  public static async stopDebugging(): Promise<void> {
    if (this.activeSession) {
      await vscode.debug.stopDebugging(this.activeSession);
      this.activeSession = null;
    }
  }
}
