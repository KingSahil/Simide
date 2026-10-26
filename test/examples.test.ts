import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { LinkedListViewProvider } from '../src/sidebar/linkedListViewProvider';
import { CppCompiler } from '../src/debug/compiler';
import { listExamples } from '../src/sidebar/exampleCatalog';
import { DebugSessionManager } from '../src/debug/debugSessionManager';

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'simide-examples-'));
  const folders = vscode.workspace.workspaceFolders;
  const errors: string[] = [];
  const originalError = vscode.window.showErrorMessage;
  (vscode.window as any).showErrorMessage = (message: string) => errors.push(message);
  const provider = new LinkedListViewProvider(vscode.Uri.file(process.cwd()), vscode.Uri.file(path.join(root, 'storage')));
  const messages: any[] = [];
  const launches: string[] = [];
  provider.startVisualization = async (source?: string) => {
    assert.strictEqual(CppCompiler.resolveSourceFile(), source, 'The target must update before launch');
    assert.strictEqual(vscode.window.activeTextEditor?.document.fileName, source, 'The example must open before launch');
    launches.push(source!);
  };
  (provider as any).view = { webview: { postMessage: (message: any) => messages.push(message) } };
  try {
    (vscode.workspace as any).workspaceFolders = [{ uri: vscode.Uri.file(root) }];
    const catalog = listExamples(process.cwd());
    const cppFiles = fs.readdirSync('examples').filter(file => /\.(cpp|cc|cxx)$/.test(file)).sort();
    assert.deepStrictEqual(catalog.map(entry => entry.fileName).sort(), cppFiles);
    assert.strictEqual(catalog.find(entry => entry.fileName === 'bubble-sort.cpp')?.category, 'Arrays & Sorting');
    assert.strictEqual(catalog.find(entry => entry.fileName === 'gfg-push-delete.cpp')?.category, 'Linked Lists');
    await (provider as any).handleMessage({ command: 'getExamples' });
    assert.strictEqual(messages.at(-1).command, 'examples');
    assert.strictEqual(messages.at(-1).examples.length, cppFiles.length);
    for (const entry of catalog) {
      await (provider as any).handleMessage({ command: 'visualizeExample', example: entry.fileName });
      assert.strictEqual(CppCompiler.resolveSourceFile(), path.join(root, 'examples', entry.fileName));
      assert.strictEqual(launches.at(-1), path.join(root, 'examples', entry.fileName));
    }
    assert.strictEqual(launches.length, catalog.length, 'Every example click launches once');
    fs.mkdirSync(path.join(root, 'examples', 'custom'));
    fs.writeFileSync(path.join(root, 'examples', 'custom', 'strings.cpp'), 'int main() {}');
    await provider.openExample('custom/strings.cpp');
    assert.strictEqual(CppCompiler.resolveSourceFile(), path.join(root, 'examples', 'custom/strings.cpp'));
    const launchesBeforeInvalid = launches.length;
    await (provider as any).handleMessage({ command: 'visualizeExample', example: '../package.json' });
    assert.strictEqual(launches.length, launchesBeforeInvalid, 'Failed selection must not launch the old target');
    assert.strictEqual(errors.length, 1, 'Only catalog files may be opened');
    errors.length = 0;
    DebugSessionManager.setActiveSession({ id: 'home-test' } as any);
    await (provider as any).handleMessage({ command: 'goHome' });
    assert.strictEqual(DebugSessionManager.getActiveSession(), null);
    assert.strictEqual(messages.at(-1).command, 'home');
    assert.strictEqual((provider as any).snapshotManager.totalSnapshots, 0);
    for (const [example, file] of Object.entries({ stack: 'stack-operations.cpp', array: 'array-operations.cpp', linkedlist: 'linked-list.cpp', tree: 'bst-traversals.cpp', graph: 'graph-registry.cpp' })) {
      await (provider as any).handleMessage({ command: 'visualizeExample', example });
      const expected = path.join(root, 'examples', file);
      assert.ok(fs.existsSync(expected));
      assert.strictEqual(vscode.window.activeTextEditor?.document.fileName, expected);
      assert.strictEqual(CppCompiler.resolveSourceFile(), expected);
      assert.strictEqual(messages.at(-1).filePath, expected);
    }
    const existing = path.join(root, 'examples', 'array-operations.cpp');
    fs.writeFileSync(existing, '// learner edits');
    await provider.openExample('array');
    assert.strictEqual(fs.readFileSync(existing, 'utf8'), '// learner edits');
    (vscode.workspace as any).workspaceFolders = undefined;
    await provider.openExample('stack');
    assert.strictEqual(messages.at(-1).filePath, path.join(root, 'storage', 'examples', 'stack-operations.cpp'));
    assert.deepStrictEqual(errors, []);
    (provider as any).extensionUri = vscode.Uri.file(path.join(root, 'missing-extension'));
    await provider.openExample('tree');
    assert.strictEqual(errors.length, 1, 'Missing packaged files must produce a visible error');
    console.log('✓ Example buttons open files, update targets, preserve edits, and work without a workspace');
  } finally {
    (vscode.workspace as any).workspaceFolders = folders;
    vscode.window.showErrorMessage = originalError;
    provider.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
}
run().catch(error => { console.error(error); process.exit(1); });
