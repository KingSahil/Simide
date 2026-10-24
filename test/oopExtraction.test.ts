import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { StateExtractor } from '../src/debug/stateExtractor';

async function run() {
  let source = path.resolve('examples/oop-linked-list.cpp');
  let mainLine = fs.readFileSync(source, 'utf8').split('\n').findIndex(line => line.includes('list.display();')) + 1;
  const heap: Record<string, { data: number; next: string }> = {
    '0x1000': { data: 10, next: '0x2000' },
    '0x2000': { data: 20, next: '0x3000' },
    '0x3000': { data: 30, next: '0x0' },
  };
  let objectName = 'list';
  let head = '0x1000';
  let inMethod = false;
  let expandPrivate = true;
  let exposeStreamReturn = false;
  const expressions: string[] = [];
  const session = { customRequest: async (command: string, args: any) => {
    if (command === 'stackTrace') return { stackFrames: inMethod ? [
      { id: 2, name: 'LinkedList::display', line: 25, source: { path: source } },
      { id: 1, name: 'main', line: mainLine, source: { path: source } },
    ] : [{ id: 1, name: 'main', line: mainLine, source: { path: source } }] };
    if (command === 'scopes') return { scopes: [{ name: 'Locals', variablesReference: args.frameId === 1 ? 10 : 11 }] };
    if (command === 'variables') {
      if (args.variablesReference === 10) return { variables: [
        { name: objectName, value: '0x9000', type: 'LinkedList', variablesReference: expandPrivate ? 20 : 0 },
      ] };
      if (args.variablesReference === 11) return { variables: [
        { name: 'this', value: '0x9000', type: 'LinkedList *', variablesReference: 20 },
        { name: 'curr', value: '0x1000', type: 'Node *', variablesReference: 0 },
        ...(exposeStreamReturn ? [
          { name: '$Return value', value: '0x7000', type: 'std::basic_ostream<char> &', variablesReference: 0 },
          { name: 'buffer', value: '0x8000', type: 'char *', variablesReference: 0 },
          { name: 'owner', value: '0x9000', type: 'LinkedList *', variablesReference: 20 },
        ] : []),
      ] };
      if (args.variablesReference === 20) return { variables: [{ name: 'private', value: '', variablesReference: 21 }] };
      if (args.variablesReference === 21) return { variables: [{ name: 'head', type: 'Node *', value: head, variablesReference: 0 }] };
      return { variables: [] };
    }
    if (command === 'evaluate') {
      expressions.push(args.expression);
      if (args.expression === `${objectName}.head` && args.frameId === 1) return { result: head };
      if (args.expression === objectName && args.frameId === 1) return { result: '{...}' };
      const match = args.expression.match(/^\(\(Node\*\)(0x[0-9a-f]+)\)->(data|next)$/);
      if (match && heap[match[1]]) return { result: String(heap[match[1]][match[2] as 'data' | 'next']) };
      throw new Error('No symbol or member in this frame');
    }
    throw new Error(`Unexpected request ${command}`);
  } };

  const extract = (step = 1, previous?: any) => StateExtractor.extractState(session as any, 1, step, previous);
  StateExtractor.reset();
  StateExtractor.setActiveSourceFile(source);
  const first = await extract();
  assert.ok(first);
  assert.deepStrictEqual(first.nodes.map(node => node.data), [10, 20, 30], 'Read Node records through the private container head');
  assert.strictEqual(first.headId, first.nodes[0].id);
  assert.strictEqual(first.nodes[0].nextId, first.nodes[1].id);
  assert.ok(!expressions.some(expression => expression.startsWith('((LinkedList*)')), 'The container is not the node type');
  const original = JSON.stringify(first);

  inMethod = true;
  const method = await extract(2, first);
  assert.ok(method);
  assert.deepStrictEqual(method.nodes.map(node => node.data), [10, 20, 30]);
  assert.strictEqual(method.headId, first.headId);
  assert.strictEqual(JSON.stringify(first), original);

  exposeStreamReturn = true;
  const afterPrint = await extract(3, method);
  assert.ok(afterPrint);
  assert.ok(!afterPrint.inspectionWarning, 'An ostream return reference must not invalidate the list snapshot');
  assert.deepStrictEqual(afterPrint.nodes.map(node => node.data), [10, 20, 30]);
  assert.ok(!expressions.some(expression => /\(\(Node\*\)0x(?:7000|8000|9000)\)/.test(expression)),
    'Never cast stream, character-buffer, or owner-object addresses to Node*');
  assert.ok(afterPrint.pointers?.some(pointer => pointer.name === 'curr'), 'Publish the actual traversal pointer');
  assert.ok(!afterPrint.pointers?.some(pointer => pointer.name === '$Return value'));
  exposeStreamReturn = false;

  // A different object name must work without a list.head hardcode, even when
  // debugger children are unavailable and member evaluation is needed.
  StateExtractor.reset();
  objectName = 'collection';
  inMethod = false;
  expandPrivate = false;
  const renamed = await extract();
  assert.ok(renamed);
  assert.deepStrictEqual(renamed.nodes.map(node => node.data), [10, 20, 30]);

  StateExtractor.reset();
  expandPrivate = true;
  head = '0x0';
  const empty = await extract();
  assert.ok(empty);
  assert.strictEqual(empty.headId, null);
  assert.deepStrictEqual(empty.nodes, [], 'An empty object must not be traversed as a node at its own address');

  source = path.resolve('test/fixtures/oop-list-lifecycle.cpp');
  mainLine = fs.readFileSync(source, 'utf8').split('\n').findIndex(line => line.includes('list.printList();')) + 1;
  objectName = 'list';
  head = '0x1000';
  StateExtractor.reset();
  StateExtractor.setActiveSourceFile(source);
  assert.strictEqual(StateExtractor.parseStructMembers(source).nodeType, 'Node', 'Class Node must win over its LinkedList owner');
  assert.ok(!StateExtractor.getVariableDeclarations(source).has('matically'),
    'The word automatically in a comment must not become an auto declaration that blocks initialization');
  const lifecycle = await extract();
  assert.ok(lifecycle);
  assert.deepStrictEqual(lifecycle.nodes.map(node => node.data), [10, 20, 30], JSON.stringify({
    snapshot: lifecycle, declarations: Array.from(StateExtractor.getVariableDeclarations(source)),
    range: StateExtractor.getEnclosingFunction(source, mainLine),
  }));
  StateExtractor.reset();
  console.log('✓ Class-owned list heads, private debugger children, caller frames, object names, and empty containers passed');
}

run().catch(error => { console.error(error); process.exit(1); });
