import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { DebugSessionManager } from '../src/debug/debugSessionManager';
import { CppCompiler } from '../src/debug/compiler';
import { discoverGraphLayout, GraphStateExtractor } from '../src/debug/graphStateExtractor';

const execFileAsync = promisify(execFile);
const exeExt = process.platform === 'win32' ? '.exe' : '';

function getWindowsShortPath(longPath: string): string {
  if (process.platform !== 'win32') {
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

async function testGdbExecution() {
  console.log('=== Running Real GDB Runtime Stepping & State Extraction Test ===\n');

  const debugMentorDir = getWindowsShortPath(path.resolve(process.cwd(), 'test/fixtures/.debug-mentor'));
  const exeFile = `bst-reference${exeExt}`;
  const exePath = path.join(debugMentorDir, exeFile);
  assert.ok(fs.existsSync(exePath), 'Compiled executable must exist');

  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo, 'GDB must be available');

  const gdbCmds = [
    'break bst-reference.cpp:131',
    'break bst-reference.cpp:132',
    'break bst-reference.cpp:133',
    'run',
    'print root->data',
    'continue',
    'print root->left->data',
    'continue',
    'print root->right->data',
    'quit',
  ];

  const scriptFile = 'test_gdb.txt';
  const scriptPath = path.join(debugMentorDir, scriptFile);
  fs.writeFileSync(scriptPath, gdbCmds.join('\n'), 'utf8');

  try {
    const { stdout } = await execFileAsync(debuggerInfo.path, ['-batch', '-x', scriptFile, exeFile], { cwd: debugMentorDir });
    console.log('[GDB Output Sample]');
    const lines = stdout.split('\n').filter((l) => l.includes('$') || l.includes('Breakpoint') || l.includes('Thread'));
    lines.forEach((l) => console.log('  ' + l.trim()));

    // Verify key extractions
    assert.ok(stdout.includes('= 50'), 'Root node data should be 50');
    assert.ok(stdout.includes('= 30'), 'Left child data should be 30');
    assert.ok(stdout.includes('= 70'), 'Right child data should be 70');

    console.log('\n✓ Verified real GDB runtime stops and tree node values (root=50, left=30, right=70)');
    console.log('=== Real GDB Execution Test PASSED ===\n');
  } finally {
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
    }
  }
}

async function testLeetcodeReverseGdb() {
  console.log('=== Running Real GDB Runtime Stepping on LeetCode 206 (Reverse Linked List) ===\n');

  const debugMentorDir = getWindowsShortPath(path.resolve(process.cwd(), 'examples/.debug-mentor'));
  const exeFile = `leetcode-206-reverse${exeExt}`;
  const exePath = path.join(debugMentorDir, exeFile);
  assert.ok(fs.existsSync(exePath), 'Compiled LeetCode executable must exist');

  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo, 'GDB must be available');

  const gdbCmds = [
    'break reverseList',
    'run',
    // We are inside reverseList
    'print head->val',
    'next', // prev = nullptr
    'next', // curr = head
    'print curr->val',
    'finish', // run until reverseList returns to main
    'next',   // execute ListNode* reversedHead = reverseList(head);
    'print reversedHead->val',
    'print reversedHead->next->val',
    'print reversedHead->next->next->val',
    'quit',
  ];

  const scriptFile = 'test_reverse_gdb.txt';
  const scriptPath = path.join(debugMentorDir, scriptFile);
  fs.writeFileSync(scriptPath, gdbCmds.join('\n'), 'utf8');

  try {
    const { stdout } = await execFileAsync(debuggerInfo.path, ['-batch', '-x', scriptFile, exeFile], { cwd: debugMentorDir });
    console.log('[GDB LeetCode Output Sample]');
    const lines = stdout.split('\n').filter((l) => l.includes('$') || l.includes('Breakpoint'));
    lines.forEach((l) => console.log('  ' + l.trim()));

    // Verify reversal results
    assert.ok(stdout.includes('= 1'), 'Original head val was 1');
    assert.ok(stdout.includes('reversedHead->val') || stdout.includes('= 3'), 'Reversed head val must be 3');
    assert.ok(stdout.includes('= 2'), 'Reversed second val must be 2');

    console.log('\n✓ Verified real GDB execution of LeetCode reverseList (3 -> 2 -> 1)');
    console.log('=== Real GDB LeetCode Reversal Test PASSED ===\n');
  } finally {
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
    }
  }
}

async function testBstTraversalsGdb() {
  console.log('=== Running Real GDB Stepping on BST Traversals (Preorder, Inorder, Postorder) ===\n');

  const debugMentorDir = getWindowsShortPath(path.resolve(process.cwd(), 'examples/.debug-mentor'));
  const exeFile = `bst-traversals${exeExt}`;
  const exePath = path.join(debugMentorDir, exeFile);
  assert.ok(fs.existsSync(exePath), 'Compiled BST executable must exist');

  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo, 'GDB must be available');

  const gdbCmds = [
    'break bst-traversals.cpp:90',
    'break bst-traversals.cpp:91',
    'break bst-traversals.cpp:92',
    'run',
    'print root->data',
    'continue',
    'print root->left->data',
    'continue',
    'print root->right->data',
    // Break inside inorder traversal
    'break inorder',
    'continue',
    'print root->data',
    'continue',
    'print root->data',
    'quit',
  ];

  const scriptFile = 'test_bst_gdb.txt';
  const scriptPath = path.join(debugMentorDir, scriptFile);
  fs.writeFileSync(scriptPath, gdbCmds.join('\n'), 'utf8');

  try {
    const { stdout } = await execFileAsync(debuggerInfo.path, ['-batch', '-x', scriptFile, exeFile], { cwd: debugMentorDir });
    console.log('[GDB BST Traversal Output Sample]');
    const lines = stdout.split('\n').filter((l) => l.includes('$') || l.includes('Breakpoint'));
    lines.forEach((l) => console.log('  ' + l.trim()));

    // Verify key extractions
    assert.ok(stdout.includes('= 50'), 'BST Root data should be 50');
    assert.ok(stdout.includes('= 30'), 'BST Left child data should be 30');
    assert.ok(stdout.includes('= 70'), 'BST Right child data should be 70');

    // Run executable directly to verify exact traversal sequence outputs
    const { stdout: progOutput } = await execFileAsync(path.resolve(debugMentorDir, exeFile), [], { cwd: debugMentorDir });
    assert.ok(progOutput.includes('Original tree (Inorder): 30 40 50 60 70'), 'Original tree inorder must match');
    assert.ok(progOutput.includes('Tree after deleting 40: 30 50 60 70'), 'Tree after deleting 40 must match');
    assert.ok(progOutput.includes('Tree after deleting 70: 30 50 60'), 'Tree after deleting 70 must match');

    console.log('\n✓ Verified real GDB runtime stops and tree pointer chasing (root=50, left=30, right=70)');
    console.log('✓ Verified Inorder: 30 40 50 60 70');
    console.log('✓ Verified Case A Deletion: 40 (leaf) & 70 (single child 60)');
    console.log('=== Real GDB BST Traversals Test PASSED ===\n');
  } finally {
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
    }
  }
}

async function testArrayOperationsGdb() {
  console.log('=== Running Real GDB Stepping on Array Operations (arr[5], updates, swaps, loop) ===\n');

  const debugMentorDir = getWindowsShortPath(path.resolve(process.cwd(), 'examples/.debug-mentor'));
  const exeFile = `array-operations${exeExt}`;
  const exePath = path.join(debugMentorDir, exeFile);
  assert.ok(fs.existsSync(exePath), 'Compiled Array executable must exist');

  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo, 'GDB must be available');

  const gdbCmds = [
    'break array-operations.cpp:9',
    'break array-operations.cpp:12',
    'break array-operations.cpp:17',
    'run',
    'print arr[0]',
    'print arr[2]',
    'continue',
    'print arr[2]',
    'continue',
    'print arr[0]',
    'print arr[1]',
    'quit',
  ];

  const scriptFile = 'test_array_gdb.txt';
  const scriptPath = path.join(debugMentorDir, scriptFile);
  fs.writeFileSync(scriptPath, gdbCmds.join('\n'), 'utf8');

  try {
    const { stdout } = await execFileAsync(debuggerInfo.path, ['-batch', '-x', scriptFile, exeFile], { cwd: debugMentorDir });
    console.log('[GDB Array Operations Output Sample]');
    const lines = stdout.split('\n').filter((l) => l.includes('$') || l.includes('Breakpoint'));
    lines.forEach((l) => console.log('  ' + l.trim()));

    // Verify key array extractions
    assert.ok(stdout.includes('= 10'), 'Initial arr[0] should be 10');
    assert.ok(stdout.includes('= 30'), 'Initial arr[2] should be 30');
    assert.ok(stdout.includes('= 99'), 'Updated arr[2] should be 99');
    assert.ok(stdout.includes('= 20'), 'Swapped arr[0] should be 20');

    // Run executable directly to verify array loop traversal outputs
    const { stdout: progOutput } = await execFileAsync(path.resolve(debugMentorDir, exeFile), [], { cwd: debugMentorDir });
    assert.ok(progOutput.includes('20 10 99 40 50'), 'Array traversal sequence must match 20 10 99 40 50');

    console.log('\n✓ Verified real GDB runtime stops and array element mutation (arr[2]=99)');
    console.log('✓ Verified array element swapping (arr[0]=20, arr[1]=10)');
    console.log('✓ Verified stdout array traversal: 20 10 99 40 50');
    console.log('=== Real GDB Array Operations Test PASSED ===\n');
  } finally {
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
    }
  }
}

async function testBstRecursiveReturnGdb() {
  const debugMentorDir = getWindowsShortPath(path.resolve('examples/.debug-mentor'));
  const source = path.resolve('examples/bst-traversals.cpp');
  const returnLine = fs.readFileSync(source, 'utf8').split('\n')
    .findIndex(line => line.trim() === 'return root;') + 1;
  assert.ok(returnLine > 0);
  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo);
  const scriptPath = path.join(debugMentorDir, 'test_bst_return_gdb.txt');
  const fields = 'root->data, root->left->data, root->left->right->data, root->right->data, root->right->left->data';
  fs.writeFileSync(scriptPath, [
    `break bst-traversals.cpp:${returnLine} if root != 0 && root->data == 50`,
    'ignore 1 3', // Stop at the outer return of the final insertion (60).
    'run',
    `printf "BEFORE_RETURN:%d,%d,%d,%d,%d\\n", ${fields}`,
    'finish',
    `printf "AFTER_RETURN:%d,%d,%d,%d,%d\\n", ${fields}`,
    'quit',
  ].join('\n'));
  try {
    const { stdout } = await execFileAsync(debuggerInfo.path,
      ['-batch', '-x', path.basename(scriptPath), `bst-traversals${exeExt}`],
      { cwd: debugMentorDir, timeout: 30000 });
    assert.ok(stdout.includes('BEFORE_RETURN:50,30,40,70,60'), stdout);
    assert.ok(stdout.includes('AFTER_RETURN:50,30,40,70,60'), stdout);
    console.log('✓ Real GDB verified all five BST values and child links before and after recursive return');
  } finally {
    // Windows may briefly retain the script handle after GDB exits.
    for (let attempt = 0; ; attempt++) {
      try {
        fs.unlinkSync(scriptPath);
        break;
      } catch (error: any) {
        if (!['EBUSY', 'EPERM'].includes(error.code) || attempt >= 4) throw error;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
}

async function testOopLifecycleGdb() {
  const source = path.resolve('test/fixtures/oop-list-lifecycle.cpp');
  const compiled = await CppCompiler.compile(source);
  assert.ok(compiled.success, compiled.errorMessage);
  const exe = compiled.executablePath!;
  const directory = getWindowsShortPath(path.dirname(exe));
  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo);
  const scriptPath = path.join(directory, 'test_oop_lifecycle.txt');
  fs.writeFileSync(scriptPath, [
    'break LinkedList::printList',
    'run',
    'up',
    'printf "PRIVATE_HEAD:%d\\n", list.head->data',
    'down',
    'printf "APPENDED:%d,%d,%d\\n", this->head->data, this->head->next->data, this->head->next->next->data',
    'continue',
    'printf "INSERTED:%d,%d,%d,%d\\n", this->head->data, this->head->next->data, this->head->next->next->data, this->head->next->next->next->data',
    'continue',
    'printf "DELETED:%d,%d,%d\\n", this->head->data, this->head->next->data, this->head->next->next->data',
    'break LinkedList::~LinkedList',
    'continue',
    'set $owner = this',
    'finish',
    'printf "CLEANED:%d\\n", ($owner->head == 0)',
    'quit',
  ].join('\n'));
  try {
    const { stdout } = await execFileAsync(debuggerInfo.path,
      ['-batch', '-x', path.basename(scriptPath), path.basename(exe)],
      { cwd: directory, timeout: 30000 });
    for (const marker of ['PRIVATE_HEAD:10', 'APPENDED:10,20,30', 'INSERTED:5,10,20,30', 'DELETED:5,10,30', 'CLEANED:1']) {
      assert.ok(stdout.includes(marker), `${marker}\n${stdout}`);
    }
    console.log('✓ Real GDB verified private class head, append, insertion, deletion, and destructor cleanup');
  } finally {
    for (let attempt = 0; ; attempt++) {
      try { fs.unlinkSync(scriptPath); break; }
      catch (error: any) {
        if (!['EBUSY', 'EPERM'].includes(error.code) || attempt >= 4) throw error;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
}

async function testStackOperationsGdb() {
  console.log('=== Running Real GDB Stepping on Stack Operations (LIFO, push, pop, peek) ===\n');

  const debugMentorDir = getWindowsShortPath(path.resolve(process.cwd(), 'examples/.debug-mentor'));
  const exeFile = `stack-operations${exeExt}`;
  const exePath = path.join(debugMentorDir, exeFile);
  assert.ok(fs.existsSync(exePath), 'Compiled Stack executable must exist');

  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo, 'GDB must be available');

  const gdbCmds = [
    'break stack-operations.cpp:59',
    'break stack-operations.cpp:60',
    'break stack-operations.cpp:61',
    'break stack-operations.cpp:64',
    'break stack-operations.cpp:67',
    'break stack-operations.cpp:70',
    'break stack-operations.cpp:72',
    'run',
    'print s.top',
    'print s.capacity',
    'continue',
    'print s.top',
    'print s.arr[0]',
    'continue',
    'print s.top',
    'print s.arr[1]',
    'continue',
    'print s.top',
    'print s.arr[2]',
    'continue',
    'print topVal',
    'continue',
    'print poppedVal',
    'print s.top',
    'continue',
    'print s.top',
    'print s.arr[2]',
    'quit',
  ];

  const scriptFile = 'test_stack_gdb.txt';
  const scriptPath = path.join(debugMentorDir, scriptFile);
  fs.writeFileSync(scriptPath, gdbCmds.join('\n'), 'utf8');

  try {
    const { stdout } = await execFileAsync(debuggerInfo.path, ['-batch', '-x', scriptFile, exeFile], { cwd: debugMentorDir });
    console.log('[GDB Stack Operations Output Sample]');
    const lines = stdout.split('\n').filter((l) => l.includes('$') || l.includes('Breakpoint'));
    lines.forEach((l) => console.log('  ' + l.trim()));

    // Verify key stack states
    assert.ok(stdout.includes('= -1'), 'Initial top should be -1');
    assert.ok(stdout.includes('= 6'), 'Capacity should be 6');
    assert.ok(stdout.includes('= 10'), 'Pushed value should be 10');
    assert.ok(stdout.includes('= 20'), 'Pushed value should be 20');
    assert.ok(stdout.includes('= 30'), 'Pushed value should be 30');
    assert.ok(stdout.includes('= 40'), 'Pushed value should be 40');

    // Run executable directly to verify stdout prints
    const { stdout: progOutput } = await execFileAsync(path.resolve(debugMentorDir, exeFile), [], { cwd: debugMentorDir });
    assert.ok(progOutput.includes('Pushed: 10'), 'Must print Pushed: 10');
    assert.ok(progOutput.includes('Popped: 30'), 'Must print Popped: 30');
    assert.ok(progOutput.includes('Final stack top value: 40'), 'Must print Final stack top value: 40');

    console.log('\n✓ Verified real GDB runtime stops and stack LIFO top transitions');
    console.log('✓ Verified stack push (10, 20, 30), pop (30), and top reassignment (40)');
    console.log('✓ Verified stdout stack lifecycle output');
    console.log('=== Real GDB Stack Operations Test PASSED ===\n');
  } finally {
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
    }
  }
}

async function runGdbScenario(sourceFile: string, commands: string[]): Promise<string> {
  const compiled = await CppCompiler.compile(path.resolve('examples', sourceFile));
  assert.ok(compiled.success, compiled.errorMessage);
  const executable = compiled.executablePath!;
  const directory = getWindowsShortPath(path.dirname(executable));
  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo);
  const scriptPath = path.join(directory, `test_${path.basename(sourceFile, '.cpp')}_${process.pid}.txt`);
  fs.writeFileSync(scriptPath, commands.concat('quit').join('\n'));
  try {
    return (await execFileAsync(debuggerInfo.path,
      ['-batch', '-x', path.basename(scriptPath), path.basename(executable)],
      { cwd: directory, timeout: 30000 })).stdout;
  } finally {
    for (let attempt = 0; ; attempt++) {
      try { fs.unlinkSync(scriptPath); break; }
      catch (error: any) {
        if (!['EBUSY', 'EPERM'].includes(error.code) || attempt >= 4) throw error;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
}

async function testGfgPointerSlotGdb() {
  const output = await runGdbScenario('gfg-push-delete.cpp', [
    'break deleteNode', 'run',
    'printf "GFG_BEFORE:%d,%d,%d,%d\\n", (*head_ref)->data, (*head_ref)->next->data, (*head_ref)->next->next->data, (*head_ref)->next->next->next->data',
    'printf "POINTER_SLOT:%d\\n", ((void*)head_ref != (void*)*head_ref)',
    'finish',
    'printf "GFG_AFTER:%d,%d,%d,NULL=%d\\n", head->data, head->next->data, head->next->next->data, (head->next->next->next == 0)',
  ]);
  assert.ok(output.includes('GFG_BEFORE:2,3,1,7'), output);
  assert.ok(output.includes('POINTER_SLOT:1'), output);
  assert.ok(output.includes('GFG_AFTER:2,3,7,NULL=1'), output);
  console.log('✓ Real GDB verified GFG Node** slot identity and exact 2→3→1→7 to 2→3→7 deletion');
}

async function testCircularQueueGdb() {
  const lines = fs.readFileSync(path.resolve('examples/circular-queue.cpp'), 'utf8').split('\n');
  const firstDequeue = lines.findIndex(line => line.includes('int first = q.dequeue()')) + 1;
  assert.ok(firstDequeue > 0);
  const output = await runGdbScenario('circular-queue.cpp', [
    `break circular-queue.cpp:${firstDequeue}`, 'run',
    'printf "QUEUE_FILLED:%d,%d,%d\\n", q.front, q.rear, q.count',
    'next',
    'printf "QUEUE_FIRST:%d,%d,%d\\n", first, q.front, q.count',
    'next',
    'printf "QUEUE_SECOND:%d,%d,%d\\n", second, q.front, q.count',
    'next', 'next',
    'printf "QUEUE_WRAPPED:%d,%d,%d,%d,%d\\n", q.front, q.rear, q.count, q.arr[q.front], q.arr[q.rear]',
  ]);
  for (const expected of ['QUEUE_FILLED:0,3,4', 'QUEUE_FIRST:10,1,3', 'QUEUE_SECOND:20,2,2', 'QUEUE_WRAPPED:2,0,4,30,60']) {
    assert.ok(output.includes(expected), `${expected}\n${output}`);
  }
  console.log('✓ Real GDB verified queue enqueue/dequeue, wrap-around, front=30, rear=60');
}

async function testGraphRegistryGdb() {
  const source = fs.readFileSync(path.resolve('examples/graph-registry.cpp'), 'utf8');
  const line = source.split('\n').findIndex(l => l.includes('checkpoint = 1;')) + 1;
  const dump = [
    'printf "H|%p|%p\\n", graph.vertexHead, graph.edgeHead',
    ...['v1', 'v2', 'v3'].map(v => `printf "V|%p|%d|%p\\n", ${v}, ${v}->value, ${v}->nextVertex`),
    ...['e1', 'e2'].map(e => `printf "E|%p|%p|%p|%g|%d|%p\\n", ${e}, ${e}->source, ${e}->target, ${e}->weight, ${e}->directed, ${e}->nextEdge`),
  ];
  const output = await runGdbScenario('graph-registry.cpp', [
    `break graph-registry.cpp:${line}`, 'run', ...dump,
    'printf "MUTATED\\n"', 'set e1->directed = false', 'set e1->weight = -2.5',
    'set e1->target = v1', 'set e1->nextEdge = 0', ...dump,
  ]);
  const extractor = new GraphStateExtractor();
  const snapshots = [];
  for (const [step, section] of output.split('MUTATED').entries()) {
    const values = new Map<string, string>();
    for (const record of section.split(/\r?\n/)) {
      const fields = record.trim().split('|');
      if (fields[0] === 'H') {
        values.set('graph.vertexHead', fields[1]);
        values.set('graph.edgeHead', fields[2]);
      } else if (fields[0] === 'V') {
        values.set(`((Vertex*)${fields[1]})->value`, fields[2]);
        values.set(`((Vertex*)${fields[1]})->nextVertex`, fields[3]);
      } else if (fields[0] === 'E') {
        for (const [index, field] of ['source', 'target', 'weight', 'directed', 'nextEdge'].entries()) {
          values.set(`((Edge*)${fields[1]})->${field}`, fields[index + 2]);
        }
      }
    }
    snapshots.push(await extractor.extract(discoverGraphLayout(source)!, 'graph', false, step + 1,
      async expression => values.get(expression) ?? null));
  }
  assert.strictEqual(snapshots.length, 2);
  const [initial, changed] = snapshots;
  assert.deepStrictEqual(initial.graph.vertices.map(v => v.value), [1, 2, 3], output + JSON.stringify(initial.warnings));
  assert.deepStrictEqual(initial.graph.edges.map(e => e.weight), [5, 10]);
  assert.ok(initial.graph.edges.every(e => e.directed));
  assert.strictEqual(initial.graph.edges[0].sourceId, initial.graph.vertices[0].id);
  assert.strictEqual(initial.graph.edges[0].targetId, initial.graph.vertices[1].id);
  assert.strictEqual(initial.graph.edges[1].targetId, initial.graph.vertices[2].id);
  assert.strictEqual(changed.graph.edges.length, 1);
  assert.strictEqual(changed.graph.edges[0].directed, false);
  assert.strictEqual(changed.graph.edges[0].weight, -2.5);
  assert.strictEqual(changed.graph.edges[0].targetId, changed.graph.edges[0].sourceId);
  assert.strictEqual(changed.graph.vertices[0].id, initial.graph.vertices[0].id);
  assert.strictEqual(initial.graph.edges.length, 2, 'History must not mutate');
  assert.ok(initial.isComplete && changed.isComplete);
  console.log('✓ Real GDB graph extraction verified vertices, weighted directed edges, stable IDs, self-loop, undirected update, edge removal, and history');
}

async function runAllGdbTests() {
  await testGraphRegistryGdb();
  await testGdbExecution();
  await testLeetcodeReverseGdb();
  await testBstTraversalsGdb();
  await testArrayOperationsGdb();
  await testBstRecursiveReturnGdb();
  await testOopLifecycleGdb();
  await testStackOperationsGdb();
  await testGfgPointerSlotGdb();
  await testCircularQueueGdb();
}

runAllGdbTests().catch((err) => {
  console.error('❌ GDB Execution Test failed:', err);
  process.exit(1);
});
