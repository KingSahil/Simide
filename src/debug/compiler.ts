import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface CompilerResult {
  success: boolean;
  executablePath?: string;
  sourcePath: string;
  errorMessage?: string;
}

export class CppCompiler {
  private static cachedCompiler: string | null = null;
  private static lastActiveSourceFile: string | null = null;

  public static setLastActiveSourceFile(filePath: string): void {
    if (filePath && fs.existsSync(filePath)) {
      this.lastActiveSourceFile = filePath;
    }
  }

  public static getLastActiveSourceFile(): string | null {
    return this.lastActiveSourceFile;
  }

  public static async findCompiler(): Promise<string | null> {
    if (this.cachedCompiler) {
      return this.cachedCompiler;
    }

    const candidates = ['g++', 'clang++', 'gcc'];
    for (const cmd of candidates) {
      try {
        await execFileAsync(cmd, ['--version'], { timeout: 5000 });
        this.cachedCompiler = cmd;
        return cmd;
      } catch {
        // Try next candidate
      }
    }
    return null;
  }

  public static resolveSourceFile(explicitPath?: string): string | null {
    if (explicitPath && fs.existsSync(explicitPath)) {
      this.lastActiveSourceFile = explicitPath;
      return explicitPath;
    }

    // 1. Check active text editor
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const doc = activeEditor.document;
      if (
        (doc.languageId === 'cpp' ||
          doc.languageId === 'c' ||
          doc.fileName.endsWith('.cpp') ||
          doc.fileName.endsWith('.cc') ||
          doc.fileName.endsWith('.cxx')) &&
        fs.existsSync(doc.fileName)
      ) {
        this.lastActiveSourceFile = doc.fileName;
        return doc.fileName;
      }
    }

    // 2. Check visible text editors (in case focus shifted to webview/sidebar)
    for (const editor of vscode.window.visibleTextEditors) {
      const doc = editor.document;
      if (
        (doc.languageId === 'cpp' ||
          doc.languageId === 'c' ||
          doc.fileName.endsWith('.cpp') ||
          doc.fileName.endsWith('.cc') ||
          doc.fileName.endsWith('.cxx')) &&
        fs.existsSync(doc.fileName)
      ) {
        this.lastActiveSourceFile = doc.fileName;
        return doc.fileName;
      }
    }

    // 3. Check open tabs across all tab groups
    try {
      const openCppTabs: string[] = [];
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          const input = tab.input as { uri?: vscode.Uri };
          if (input?.uri?.fsPath) {
            const p = input.uri.fsPath;
            if (
              (p.endsWith('.cpp') || p.endsWith('.cc') || p.endsWith('.cxx')) &&
              fs.existsSync(p)
            ) {
              if (tab.isActive) {
                this.lastActiveSourceFile = p;
                return p;
              }
              openCppTabs.push(p);
            }
          }
        }
      }
      // If stack-operations.cpp is open in tabs, prefer it!
      const stackTab = openCppTabs.find((p) => p.includes('stack-operations.cpp'));
      if (stackTab) {
        this.lastActiveSourceFile = stackTab;
        return stackTab;
      }
      if (openCppTabs.length > 0) {
        this.lastActiveSourceFile = openCppTabs[0];
        return openCppTabs[0];
      }
    } catch {
      // ignore
    }

    // 4. Check tracked last active C++ source file
    if (this.lastActiveSourceFile && fs.existsSync(this.lastActiveSourceFile)) {
      return this.lastActiveSourceFile;
    }

    // 5. Fallback to workspace example
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const stackExample = path.join(
        workspaceFolders[0].uri.fsPath,
        'examples',
        'stack-operations.cpp'
      );
      if (fs.existsSync(stackExample)) {
        return stackExample;
      }
      const examplePath = path.join(
        workspaceFolders[0].uri.fsPath,
        'examples',
        'linked-list.cpp'
      );
      if (fs.existsSync(examplePath)) {
        return examplePath;
      }
    }

    return null;
  }

  public static async compile(sourcePath: string): Promise<CompilerResult> {
    const compiler = await this.findCompiler();
    if (!compiler) {
      return {
        success: false,
        sourcePath,
        errorMessage:
          'No C++ compiler found (g++ or clang++). Please install MinGW-w64 or Clang and ensure it is in your PATH.',
      };
    }

    const dir = path.dirname(sourcePath);
    const baseName = path.basename(sourcePath, path.extname(sourcePath));
    const outDir = path.join(dir, '.debug-mentor');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const outExt = process.platform === 'win32' ? '.exe' : '';
    let executablePath = path.join(outDir, `${baseName}${outExt}`);

    // If file exists and is locked by a running process on Windows, use an alternate executable name
    if (fs.existsSync(executablePath)) {
      try {
        const fd = fs.openSync(executablePath, 'r+');
        fs.closeSync(fd);
      } catch (err: any) {
        if (err.code === 'EBUSY' || err.code === 'EPERM') {
          executablePath = path.join(outDir, `${baseName}_${Date.now()}${outExt}`);
        }
      }
    }

    // Arguments: -g (debug symbols), -O0 (no optimization so variables are not eliminated), -std=c++17
    // Use relative paths with cwd to safely support non-ASCII characters in directory paths on Windows
    const relSource = path.basename(sourcePath);
    const relOut = path.join('.debug-mentor', path.basename(executablePath));
    const args = ['-g', '-O0', '-std=c++17', relSource, '-o', relOut];

    try {
      await execFileAsync(compiler, args, { cwd: dir, timeout: 60000 });
      return {
        success: true,
        executablePath,
        sourcePath,
      };
    } catch (err: any) {
      const stderr = err.stderr ? err.stderr.toString() : err.message;
      return {
        success: false,
        sourcePath,
        errorMessage: `Compilation failed:\n${stderr}`,
      };
    }
  }
}
