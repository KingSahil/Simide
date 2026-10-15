import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { CppCompiler } from '../src/debug/compiler';
import { ExplanationGenerator } from '../src/visualization/explanationGenerator';
import { SnapshotManager } from '../src/visualization/snapshotManager';
import { LinkedListSnapshot, ListNode } from '../src/visualization/linkedListModel';
import { DebugSessionManager } from '../src/debug/debugSessionManager';

async function runTests() {
  console.log('=== Running VS Code Debug Mentor Test Suite ===\n');

  // Test 1: Compiler detection and C++ compilation
  console.log('[Test 1] Testing Compiler Detection & Real C++ Build...');
  const compiler = await CppCompiler.findCompiler();
  assert.ok(compiler, 'Compiler (g++ or clang++) should be detected in PATH');
  console.log(`  ✓ Detected compiler: ${compiler}`);

  const samplePath = path.resolve(process.cwd(), 'examples', 'linked-list.cpp');
  assert.ok(fs.existsSync(samplePath), 'examples/linked-list.cpp must exist');

  const compileResult = await CppCompiler.compile(samplePath);
  assert.strictEqual(compileResult.success, true, `Compilation should succeed: ${compileResult.errorMessage}`);
  assert.ok(compileResult.executablePath && fs.existsSync(compileResult.executablePath), 'Executable must exist');
  console.log(`  ✓ Successfully compiled to: ${compileResult.executablePath}`);

  // Test 2: Debugger discovery (GDB/LLDB)
  console.log('\n[Test 2] Testing Debugger Discovery...');
  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo, 'Debugger (GDB or LLDB) should be detected');
  console.log(`  ✓ Detected debugger: ${debuggerInfo.miMode} at ${debuggerInfo.path}`);

  // Test 3: ExplanationGenerator across all 5 key linked-list lifecycle states
  console.log('\n[Test 3] Testing Pedagogical Explanation Generator...');
  
  // State 0: Entry before head is declared (hasHead = false)
  const entryRes = ExplanationGenerator.generate([], null, undefined, false);
  assert.strictEqual(entryRes.changeType, 'init');
  assert.ok(entryRes.explanation.includes('Node* head = nullptr'), 'Should explain waiting to execute head declaration');
  console.log(`  ✓ State 0 (entry before head declaration): "${entryRes.explanation}"`);

  // State 1: Initial empty list (head = nullptr)
  const emptyRes = ExplanationGenerator.generate([], null, undefined, true);
  assert.strictEqual(emptyRes.changeType, 'init');
  assert.ok(emptyRes.explanation.includes('empty'), 'Should explain empty list');
  console.log(`  ✓ Empty state: "${emptyRes.explanation}"`);

  // State 2: First node created locally (detached: 10)
  const node1: ListNode = {
    id: 'node_1',
    address: '0x1000',
    data: 10,
    nextId: null,
    isHead: false,
    isDetached: true,
    variableName: 'first',
    isNewlyCreated: true
  };
  const detachedRes = ExplanationGenerator.generate([node1], null);
  assert.strictEqual(detachedRes.changeType, 'node_created');
  assert.ok(detachedRes.explanation.includes('10'), 'Should mention node value 10');
  console.log(`  ✓ Node created state: "${detachedRes.explanation}"`);

  // State 3: Head assigned to first node (head -> 10 -> nullptr)
  const snap1: LinkedListSnapshot = {
    stepNumber: 1,
    hasHead: true,
    headId: null,
    nodes: [node1],
    explanation: detachedRes.explanation,
    changeType: 'node_created'
  };
  const node1Connected: ListNode = { ...node1, isHead: true, isDetached: false };
  const headRes = ExplanationGenerator.generate([node1Connected], 'node_1', snap1);
  assert.strictEqual(headRes.changeType, 'head_assigned');
  assert.ok(headRes.explanation.includes('head points to the node containing 10'));
  console.log(`  ✓ Head connected state: "${headRes.explanation}"`);

  // State 4: Second node created and linked (head -> 10 -> 20 -> nullptr)
  const snap2: LinkedListSnapshot = {
    stepNumber: 2,
    hasHead: true,
    headId: 'node_1',
    nodes: [node1Connected],
    explanation: headRes.explanation,
    changeType: 'head_assigned'
  };
  const node2: ListNode = {
    id: 'node_2',
    address: '0x2000',
    data: 20,
    nextId: null,
    isHead: false,
    isDetached: false,
    variableName: 'second'
  };
  const node1To2: ListNode = { ...node1Connected, nextId: 'node_2' };
  const linkedRes = ExplanationGenerator.generate([node1To2, node2], 'node_1', snap2);
  assert.strictEqual(linkedRes.changeType, 'node_linked');
  assert.ok(linkedRes.explanation.includes('10 now points to the node containing 20'));
  console.log(`  ✓ Second node linked: "${linkedRes.explanation}"`);

  // State 5: Third node linked (head -> 10 -> 20 -> 30 -> nullptr)
  const snap3: LinkedListSnapshot = {
    stepNumber: 3,
    hasHead: true,
    headId: 'node_1',
    nodes: [node1To2, node2],
    explanation: linkedRes.explanation,
    changeType: 'node_linked'
  };
  const node3: ListNode = {
    id: 'node_3',
    address: '0x3000',
    data: 30,
    nextId: null,
    isHead: false,
    isDetached: false,
    variableName: 'third'
  };
  const node2To3: ListNode = { ...node2, nextId: 'node_3' };
  const finalRes = ExplanationGenerator.generate([node1To2, node2To3, node3], 'node_1', snap3);
  assert.strictEqual(finalRes.changeType, 'final');
  assert.ok(finalRes.explanation.includes('complete'));
  assert.ok(finalRes.explanation.includes('10 → 20 → 30 → nullptr'));
  console.log(`  ✓ Final linked list: "${finalRes.explanation}"`);

  // Test 4: SnapshotManager historical navigation
  console.log('\n[Test 4] Testing SnapshotManager Non-Destructive History...');
  const manager = new SnapshotManager();
  assert.strictEqual(manager.canGoPrev(), false);
  assert.strictEqual(manager.totalSnapshots, 0);

  manager.addSnapshot(snap1);
  manager.addSnapshot(snap2);
  manager.addSnapshot(snap3);
  assert.strictEqual(manager.totalSnapshots, 3);
  assert.strictEqual(manager.currentSnapshotIndex, 2);
  assert.strictEqual(manager.getCurrentSnapshot()?.isHistorical, false);

  // Go to previous
  const prevSnap = manager.prev();
  assert.ok(prevSnap);
  assert.strictEqual(prevSnap.stepNumber, 2);
  assert.strictEqual(prevSnap.isHistorical, true);
  console.log(`  ✓ Navigated backward to historical step: ${prevSnap.stepNumber} (isHistorical: ${prevSnap.isHistorical})`);

  // Go forward in history
  const nextHistSnap = manager.nextHistory();
  assert.ok(nextHistSnap);
  assert.strictEqual(nextHistSnap.stepNumber, 3);
  assert.strictEqual(nextHistSnap.isHistorical, false);
  console.log(`  ✓ Navigated forward in history back to live step: ${nextHistSnap.stepNumber}`);

  console.log('\n=== All VS Code Debug Mentor Core Tests PASSED ===\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
