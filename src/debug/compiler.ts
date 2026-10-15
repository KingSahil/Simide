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

  public static async findCompiler(): Promise<string | null> {
    if (this.cachedCompiler) {
      return this.cachedCompiler;
    }

    const candidates = ['g++', 'clang++', 'gcc'];
    for (const cmd of candidates) {
      try {
        await execFileAsync(cmd, ['--version']);
        this.cachedCompiler = cmd;
        return cmd;
      } catch {
        // Try next candidate
      }
    }
    return null;
  }

  public static resolveSourceFile(): string | null {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const doc = activeEditor.document;
      if (
        (doc.languageId === 'cpp' ||
          doc.languageId === 'c' ||
          doc.fileName.endsWith('.cpp') ||
          doc.fileName.endsWith('.cc')) &&
        fs.existsSync(doc.fileName)
      ) {
        return doc.fileName;
      }
    }

    // Fallback to workspace example
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
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
    const args = ['-g', '-O0', '-std=c++17', sourcePath, '-o', executablePath];

    try {
      await execFileAsync(compiler, args);
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
