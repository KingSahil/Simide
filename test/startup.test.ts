import * as assert from 'assert';
import * as path from 'path';
import { LinkedListViewProvider } from '../src/sidebar/linkedListViewProvider';
import { CppCompiler } from '../src/debug/compiler';
import { StateExtractor } from '../src/debug/stateExtractor';
import { DebugSessionManager } from '../src/debug/debugSessionManager';

async function testStartup() {
  const messages: any[] = [];
  const provider = new LinkedListViewProvider({} as any);
  // Capture the real startup flow without requiring the VS Code webview renderer.
  (provider as any).view = {
    show() {},
    webview: { postMessage: (message: any) => messages.push(message) },
  };
  const original = {
    resolve: CppCompiler.resolveSourceFile,
    compile: CppCompiler.compile,
    launch: DebugSessionManager.startDebugging,
    reset: StateExtractor.reset,
  };
  const source = path.resolve('examples/array-operations.cpp');
  let launched = 0;
  try {
    CppCompiler.resolveSourceFile = () => source;
    CppCompiler.compile = async () => ({ success: true, sourcePath: source, executablePath: 'array.exe' });
    DebugSessionManager.startDebugging = async () => { launched++; return { success: true }; };
    await provider.startVisualization();
    assert.strictEqual(launched, 1, 'Successful compilation must reach debugger launch');
    assert.ok(messages.some(m => m.step === 'launching'));
    assert.ok(messages.some(m => m.step === 'waiting'));
    assert.ok(!messages.some(m => m.command === 'error'));

    messages.length = 0;
    StateExtractor.reset = () => { throw new Error('Extractor initialization failed'); };
    await provider.startVisualization();
    assert.strictEqual(launched, 1, 'Failed initialization must not launch the debugger');
    assert.strictEqual(messages.at(-1).command, 'error', 'Failure must replace the compiling indicator');
    assert.match(messages.at(-1).details, /Extractor initialization failed/);

    messages.length = 0;
    StateExtractor.reset = original.reset;
    await provider.startVisualization();
    assert.strictEqual(launched, 2, 'Retry must work after a failed startup');
    assert.strictEqual(messages.at(-1).step, 'waiting');
    console.log('✓ Simulation startup, visible errors, and retry regression tests passed');
  } finally {
    CppCompiler.resolveSourceFile = original.resolve;
    CppCompiler.compile = original.compile;
    DebugSessionManager.startDebugging = original.launch;
    StateExtractor.reset = original.reset;
    provider.dispose();
  }
}

testStartup().catch(error => { console.error(error); process.exit(1); });
