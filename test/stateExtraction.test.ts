import * as assert from 'assert';
import * as path from 'path';
import { StateExtractor } from '../src/debug/stateExtractor';

async function testRecursiveTreeInspection() {
  const source = path.resolve('examples/bst-traversals.cpp');
  const heap: Record<string, { data: number; left: string; right: string }> = {
    '0x1000': { data: 50, left: '0x2000', right: '0x3000' },
    '0x2000': { data: 30, left: '0x0', right: '0x4000' },
    '0x3000': { data: 70, left: '0x5000', right: '0x0' },
    '0x4000': { data: 40, left: '0x0', right: '0x0' },
    '0x5000': { data: 60, left: '0x0', right: '0x0' },
  };
  let mode: 'readable' | 'return-frame-error' | 'all-frames-error' = 'readable';
  let currentLine = 26;
  const session = {
    customRequest: async (command: string, args: any) => {
      if (command === 'stackTrace') return { stackFrames: [
        { id: 1, name: currentLine === 26 ? 'insert' : 'inorder', line: currentLine, source: { path: source } },
        { id: 2, name: 'main', line: 89, source: { path: source } },
      ] };
      if (command === 'scopes') return { scopes: [{ name: 'Arguments', variablesReference: 10 }] };
      if (command === 'variables') return { variables: [
        { name: 'root', value: '0x2000', type: 'Node *', variablesReference: 0 },
      ] };
      if (command === 'evaluate') {
        if (args.expression === 'root') return { result: args.frameId === 2 ? '0x1000' : '0x2000' };
        const match = args.expression.match(/^\(\(Node\*\)(0x[0-9a-f]+)\)->(data|left|right)$/);
        if (match) {
          if (mode === 'all-frames-error') return { result: '<error: Cannot access memory>' };
          if (mode === 'return-frame-error' && args.frameId === 1) throw new Error('No symbol Node in current context');
          return { result: String(heap[match[1]][match[2] as 'data' | 'left' | 'right']) };
        }
        throw new Error('No symbol in current context');
      }
      throw new Error(`Unexpected debugger request: ${command}`);
    },
  };
  StateExtractor.reset();
  StateExtractor.setActiveSourceFile(source);
  const first = await StateExtractor.extractState(session as any, 1, 1);
  assert.ok(first);
  assert.deepStrictEqual(first.nodes.map(n => n.data).sort((a, b) => Number(a) - Number(b)), [30, 40, 50, 60, 70]);
  const original = JSON.stringify(first);

  mode = 'return-frame-error';
  currentLine = 35;
  const returned = await StateExtractor.extractState(session as any, 1, 2, first);
  assert.ok(returned);
  assert.deepStrictEqual(returned.nodes.map(n => n.data).sort((a, b) => Number(a) - Number(b)), [30, 40, 50, 60, 70],
    'Returning-frame evaluation failures must not turn every node into zero');
  assert.ok(returned.nodes.find(n => n.id === returned.headId)?.leftId, 'Tree links must survive a return-frame context failure');
  assert.strictEqual(returned.source?.line, 26, 'Highlight must show the previously stopped line that produced the displayed state, not the next pending line');

  mode = 'all-frames-error';
  const unavailable = await StateExtractor.extractState(session as any, 1, 3, returned);
  assert.ok(unavailable);
  assert.deepStrictEqual(unavailable.nodes.map(n => n.data), returned.nodes.map(n => n.data));
  assert.match(unavailable.explanation, /last verified|previous.*state/i, 'Retained data must be labeled as previous state');

  mode = 'readable';
  heap['0x1000'].data = 0;
  heap['0x1000'].left = '0x0';
  const changed = await StateExtractor.extractState(session as any, 1, 4, unavailable);
  assert.ok(changed);
  const root = changed.nodes.find(n => n.id === changed.headId)!;
  assert.strictEqual(root.data, 0, 'An actual zero remains a valid value');
  assert.strictEqual(root.leftId, null, 'An actual null child must remove the edge');
  assert.strictEqual(JSON.stringify(first), original, 'Later inspections must not mutate historical snapshots');
  StateExtractor.reset();
  console.log('✓ Recursive BST frame fallback, unavailable reads, actual zero/null changes, and snapshot history passed');
}

testRecursiveTreeInspection().catch(error => { console.error(error); process.exit(1); });
