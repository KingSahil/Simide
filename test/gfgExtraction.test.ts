import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { StateExtractor } from '../src/debug/stateExtractor';

async function run() {
  const source = path.resolve('examples/gfg-push-delete.cpp');
  const lines = fs.readFileSync(source, 'utf8').split('\n');
  const mainLine = lines.findIndex(line => line.includes('deleteNode(&head')) + 1;
  const deleteLine = lines.findLastIndex(line => line.trim() === 'delete temp;') + 1;
  const declarationLine = lines.findIndex(line => line.includes('Node* new_node =')) + 1;
  const heap: Record<string, { data: number; next: string }> = {
    '0x2000': { data: 2, next: '0x3000' },
    '0x3000': { data: 3, next: '0x1000' },
    '0x1000': { data: 1, next: '0x7000' },
    '0x7000': { data: 7, next: '0x0' },
  };
  let phase: 'uninitialized' | 'push' | 'before-delete' | 'after-delete' = 'uninitialized';
  const reads: string[] = [];
  const variable = (name: string, type: string, value: string) => ({ name, type, value, variablesReference: 0 });
  const session = { customRequest: async (command: string, args: any) => {
    const pushing = phase === 'push' || phase === 'uninitialized';
    if (command === 'stackTrace') return { stackFrames: [
      { id: 1, name: pushing ? 'push' : 'deleteNode', line: phase === 'uninitialized' ? declarationLine : pushing ? declarationLine + 2 : deleteLine + (phase === 'after-delete' ? 1 : 0), source: { path: source } },
      { id: 2, name: 'main', line: mainLine, source: { path: source } },
    ] };
    if (command === 'scopes') return { scopes: [{ name: 'Locals', variablesReference: args.frameId === 1 ? 10 : 20 }] };
    if (command === 'variables') return { variables: args.variablesReference === 20 ? [
      variable('head', 'Node *', phase === 'uninitialized' ? '0x0' : '0x2000'),
    ] : [
      variable('head_ref', 'Node **', '0x8000'),
      ...(pushing ? [variable('new_node', 'Node *', phase === 'uninitialized' ? '0x9000' : '0x2000'),
        variable('new_data', 'int', '2')] : [variable('temp', 'Node *', '0x1000'), variable('prev', 'Node *', '0x3000')]),
      variable('$Return value', 'std::basic_ostream<char> &', '0xa000'),
    ] };
    if (command === 'evaluate') {
      reads.push(args.expression);
      if (args.expression === 'head' && args.frameId === 2) return { result: phase === 'uninitialized' ? '0x0' : '0x2000' };
      if (args.expression === '*head_ref') return { result: phase === 'uninitialized' ? '0x0' : '0x2000' };
      if (args.expression === 'temp' && !pushing) return { result: '0x1000' };
      const match = args.expression.match(/^\(\(Node\*\)(0x[0-9a-f]+)\)->(data|next)$/);
      if (match && heap[match[1]]) return { result: String(heap[match[1]][match[2] as 'data' | 'next']) };
      throw new Error(`Unavailable: ${args.expression}`);
    }
    throw new Error(`Unexpected request ${command}`);
  } };
  StateExtractor.reset();
  StateExtractor.setActiveSourceFile(source);
  const empty = await StateExtractor.extractState(session as any, 1, 1);
  assert.ok(empty);
  assert.deepStrictEqual(empty.nodes, [], 'Do not create a node from an uninitialized new_node or pointer slot');
  phase = 'push';
  const pushed = await StateExtractor.extractState(session as any, 1, 2, empty);
  assert.ok(pushed);
  assert.ok(!pushed.inspectionWarning, pushed.inspectionWarning);
  assert.deepStrictEqual(pushed.nodes.map(node => node.data), [2, 3, 1, 7]);
  assert.strictEqual(pushed.pointers?.find(pointer => pointer.name === 'head_ref')?.targetAddress, '0x2000');
  assert.ok(!reads.some(read => /\(\(Node\*\)0x(?:8000|9000|a000)\)/.test(read)), 'Pointer slots, garbage locals, and streams are not nodes');
  const history = JSON.stringify(pushed);

  phase = 'before-delete';
  heap['0x3000'].next = '0x7000';
  const unlinked = await StateExtractor.extractState(session as any, 1, 3, pushed);
  assert.ok(unlinked);
  assert.ok(!unlinked.inspectionWarning);
  assert.deepStrictEqual(unlinked.nodes.filter(node => !node.isDetached).map(node => node.data), [2, 3, 7]);
  assert.strictEqual(unlinked.nodes.filter(node => node.isDetached).length, 1, 'The allocated node is detached only until delete executes');
  phase = 'after-delete';
  delete heap['0x1000'];
  const deleted = await StateExtractor.extractState(session as any, 1, 4, unlinked);
  assert.ok(deleted);
  assert.ok(!deleted.inspectionWarning);
  assert.deepStrictEqual(deleted.nodes.map(node => node.data), [2, 3, 7]);
  assert.strictEqual(deleted.nodes.filter(node => node.isDetached).length, 0, 'Freed nodes must not reappear as extra lists');
  assert.strictEqual(JSON.stringify(pushed), history, 'Deletion must not mutate history');
  StateExtractor.reset();
  console.log('✓ GFG Node** slots, uninitialized locals, stream returns, unlink/delete, and stable history passed');
}

run().catch(error => { console.error(error); process.exit(1); });
