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
  const thirdLinkedRes = ExplanationGenerator.generate([node1To2, node2To3, node3], 'node_1', snap3);
  assert.strictEqual(thirdLinkedRes.changeType, 'node_linked');
  assert.ok(thirdLinkedRes.explanation.includes('20 now points to the node containing 30'));
  console.log(`  ✓ Third node linked: "${thirdLinkedRes.explanation}"`);

  // State 6: Bypass second node (first->next = third)
  const snap4: LinkedListSnapshot = {
    stepNumber: 4,
    hasHead: true,
    headId: 'node_1',
    nodes: [node1To2, node2To3, node3],
    explanation: thirdLinkedRes.explanation,
    changeType: 'node_linked',
  };
  const node1To3: ListNode = { ...node1Connected, nextId: 'node_3' };
  const bypassRes = ExplanationGenerator.generate([node1To3, node2To3, node3], 'node_1', snap4);
  assert.strictEqual(bypassRes.changeType, 'node_bypassed');
  assert.ok(bypassRes.explanation.includes('bypassing node 20'));
  console.log(`  ✓ Node bypassed state: "${bypassRes.explanation}"`);

  // State 7: Deletion of second node (delete second;)
  const snap5: LinkedListSnapshot = {
    stepNumber: 5,
    hasHead: true,
    headId: 'node_1',
    nodes: [node1To3, node2To3, node3],
    pointers: [
      { name: 'head', targetNodeId: 'node_1', isNull: false },
      { name: 'first', targetNodeId: 'node_1', isNull: false },
      { name: 'second', targetNodeId: 'node_2', isNull: false },
      { name: 'third', targetNodeId: 'node_3', isNull: false },
    ],
    explanation: bypassRes.explanation,
    changeType: 'node_bypassed',
  };
  const deleteRes = ExplanationGenerator.generate([node1To3, node3], 'node_1', snap5);
  assert.strictEqual(deleteRes.changeType, 'node_deleted');
  assert.ok(deleteRes.explanation.includes('Freed heap memory for node containing 20'));
  console.log(`  ✓ Node deleted state: "${deleteRes.explanation}"`);

  // State 8: Pointer movement (temp traversal in while loop)
  const snap6: LinkedListSnapshot = {
    stepNumber: 6,
    hasHead: true,
    headId: 'node_1',
    nodes: [node1To3, node3],
    pointers: [
      { name: 'head', targetNodeId: 'node_1', isNull: false },
      { name: 'temp', targetNodeId: 'node_1', isNull: false },
    ],
    explanation: deleteRes.explanation,
    changeType: 'node_deleted',
  };
  const moveRes = ExplanationGenerator.generate(
    [node1To3, node3],
    'node_1',
    snap6,
    true,
    [
      { name: 'head', targetNodeId: 'node_1', isNull: false },
      { name: 'temp', targetNodeId: 'node_3', isNull: false },
    ]
  );
  assert.strictEqual(moveRes.changeType, 'pointer_moved');
  assert.ok(moveRes.explanation.includes("Pointer 'temp' advanced to node containing 30"));
  console.log(`  ✓ Pointer moved state: "${moveRes.explanation}"`);

  // State 9: Print statement execution (cout << temp->data << " -> ")
  const snap7: LinkedListSnapshot = {
    stepNumber: 7,
    hasHead: true,
    headId: 'node_1',
    nodes: [node1To3, node3],
    pointers: [
      { name: 'head', targetNodeId: 'node_1', isNull: false },
      { name: 'temp', targetNodeId: 'node_3', isNull: false },
    ],
    explanation: moveRes.explanation,
    changeType: 'pointer_moved',
    terminalOutput: '10 -> ',
  };
  const printRes = ExplanationGenerator.generate(
    [node1To3, node3],
    'node_1',
    snap7,
    true,
    snap7.pointers,
    '30 -> ',
    '10 -> 30 -> '
  );
  assert.strictEqual(printRes.changeType, 'print');
  assert.ok(printRes.explanation.includes('Printed to terminal: "30 -> "'));
  console.log(`  ✓ Terminal print state: "${printRes.explanation}"`);

  // Test 3.5: In-place data value update (e.g. head->data = 10 or second->data = 20)
  const nodeUpdated: ListNode = { ...node1Connected, data: 99 };
  const valUpdateRes = ExplanationGenerator.generate([nodeUpdated], 'node_1', snap1, true, [
    { name: 'head', targetNodeId: 'node_1', isNull: false },
  ]);
  assert.strictEqual(valUpdateRes.changeType, 'step');
  assert.ok(valUpdateRes.explanation.includes('data updated: 10 → 99'));
  console.log(`  ✓ In-place value update state: "${valUpdateRes.explanation}"`);

  // State 10 (Tree): Tree Root Initialization
  const treeRootNode: ListNode = {
    id: 'tree_1',
    address: '0x3000',
    data: 50,
    isHead: true,
    isRoot: true,
    isDetached: false,
    leftId: null,
    rightId: null,
  };
  const treeRootRes = ExplanationGenerator.generate(
    [treeRootNode],
    'tree_1',
    {
      stepNumber: 1,
      structureType: 'tree',
      hasHead: true,
      headId: null,
      nodes: [],
      explanation: 'Empty tree',
      changeType: 'init',
    },
    true,
    [{ name: 'root', targetNodeId: 'tree_1', isNull: false }],
    null,
    '',
    'tree'
  );
  assert.strictEqual(treeRootRes.changeType, 'tree_root_assigned');
  assert.ok(treeRootRes.explanation.includes('Tree root initialized to node containing 50'));
  console.log(`  ✓ Tree Root Connected state: "${treeRootRes.explanation}"`);

  // State 11 (Tree): Left and Right child insertions in BST
  const treeLeftNode: ListNode = {
    id: 'tree_2',
    address: '0x3040',
    data: 30,
    isHead: false,
    isRoot: false,
    isDetached: false,
    leftId: null,
    rightId: null,
  };
  const treeRootLinked: ListNode = { ...treeRootNode, leftId: 'tree_2' };
  const treeChildRes = ExplanationGenerator.generate(
    [treeRootLinked, treeLeftNode],
    'tree_1',
    {
      stepNumber: 2,
      structureType: 'tree',
      hasHead: true,
      headId: 'tree_1',
      nodes: [treeRootNode],
      explanation: treeRootRes.explanation,
      changeType: 'tree_root_assigned',
    },
    true,
    [{ name: 'root', targetNodeId: 'tree_1', isNull: false }],
    null,
    '',
    'tree'
  );
  assert.strictEqual(treeChildRes.changeType, 'tree_child_linked');
  assert.ok(treeChildRes.explanation.includes('Node containing 30 inserted as LEFT child of node 50'));
  console.log(`  ✓ BST Child Connected state: "${treeChildRes.explanation}"`);

  // State 12 (Tree): Active Traversal Visiting Node State (inorder visit)
  const treeVisitRes = ExplanationGenerator.generate(
    [treeRootLinked, treeLeftNode],
    'tree_1',
    {
      stepNumber: 3,
      structureType: 'tree',
      hasHead: true,
      headId: 'tree_1',
      nodes: [treeRootLinked, treeLeftNode],
      explanation: treeChildRes.explanation,
      changeType: 'tree_child_linked',
    },
    true,
    [{ name: 'root', targetNodeId: 'tree_1', isNull: false }],
    null,
    '',
    'tree',
    'tree_2',
    'inorder'
  );
  assert.strictEqual(treeVisitRes.changeType, 'tree_traversal_visit');
  assert.ok(treeVisitRes.explanation.includes('Visiting tree node containing 30 in inorder()'));
  console.log(`  ✓ BST Traversal Visit state: "${treeVisitRes.explanation}"`);

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

  // Test 5: StateExtractor robust pointer parsing and structure discovery
  console.log('\n[Test 5] Testing StateExtractor Robust Discovery & Pointer Parsing...');
  const { StateExtractor } = await import('../src/debug/stateExtractor');

  // Pointer parsing test cases
  assert.strictEqual(StateExtractor.parsePointer('0x78ed20'), '0x78ed20');
  assert.strictEqual(StateExtractor.parsePointer('(Node *) 0x78ed20'), '0x78ed20');
  // C++ reference to pointer: target address is after the colon!
  assert.strictEqual(StateExtractor.parsePointer('(Node *&) @0x16fdee0: 0x7da3a0'), '0x7da3a0');
  assert.strictEqual(StateExtractor.parsePointer('@0x5ffe68: 0xec960'), '0xec960');
  assert.strictEqual(StateExtractor.parsePointer('(Node *&) @0x5ffe68: 0x0'), null);
  // Null pointer variations
  assert.strictEqual(StateExtractor.parsePointer('0x0'), null);
  assert.strictEqual(StateExtractor.parsePointer('nullptr'), null);
  assert.strictEqual(StateExtractor.parsePointer('NULL'), null);
  assert.strictEqual(StateExtractor.parsePointer('(nil)'), null);
  assert.strictEqual(StateExtractor.parsePointer('0x00000000'), null);
  // Error message and uninitialized heap rejection
  assert.strictEqual(StateExtractor.parsePointer('<error: Cannot access memory at address 0xbaadf00d>'), null);
  assert.strictEqual(StateExtractor.parsePointer('0xbaadf00d'), null);
  assert.strictEqual(StateExtractor.parsePointer('0xcccccccc'), null);
  console.log('  ✓ Verified parsePointer handles C++ references, type casts, nulls, and rejects error strings/debug fills');

  // User source detection
  assert.strictEqual(StateExtractor.isUserSource('c:/Projects/vscode-extension/examples/linked-list.cpp'), true);
  assert.strictEqual(StateExtractor.isUserSource('C:/msys64/mingw64/include/c++/13.2.0/bits/stl_vector.h'), false);
  assert.strictEqual(StateExtractor.isUserSource('C:/msys64/mingw64/include/c++/13.2.0/iostream'), false);
  assert.strictEqual(StateExtractor.isUserSource('C:/msys64/mingw64/x86_64-w64-mingw32/include/crtdefs.h'), false);
  console.log('  ✓ Verified isUserSource distinguishes student source from CRT/MinGW headers');

  // Struct member discovery across diverse internet formats
  const leetcodePath = path.resolve(process.cwd(), 'examples', 'leetcode-206-reverse.cpp');
  const gfgPath = path.resolve(process.cwd(), 'examples', 'gfg-push-delete.cpp');
  const oopPath = path.resolve(process.cwd(), 'examples', 'oop-linked-list.cpp');
  const bstPath = path.resolve(process.cwd(), 'examples', 'bst-traversals.cpp');

  const structInfoBasic = StateExtractor.parseStructMembers(samplePath);
  assert.strictEqual(structInfoBasic.dataField, 'data');
  assert.strictEqual(structInfoBasic.nextField, 'next');

  const structInfoLeetcode = StateExtractor.parseStructMembers(leetcodePath);
  assert.strictEqual(structInfoLeetcode.dataField, 'val');
  assert.strictEqual(structInfoLeetcode.nextField, 'next');

  const structInfoGfg = StateExtractor.parseStructMembers(gfgPath);
  assert.strictEqual(structInfoGfg.dataField, 'data');
  assert.strictEqual(structInfoGfg.nextField, 'next');

  const structInfoBst = StateExtractor.parseStructMembers(bstPath);
  assert.strictEqual(structInfoBst.structureType, 'tree');
  assert.strictEqual(structInfoBst.dataField, 'data');
  assert.strictEqual(structInfoBst.leftField, 'left');
  assert.strictEqual(structInfoBst.rightField, 'right');
  console.log('  ✓ Verified parseStructMembers discovers data/val, next, and BST left/right tree fields');

  // User defined functions discovery (including free functions and class member methods)
  const leetcodeFns = StateExtractor.getUserDefinedFunctions(leetcodePath);
  assert.ok(leetcodeFns.has('reverseList'), 'Must detect reverseList');

  const gfgFns = StateExtractor.getUserDefinedFunctions(gfgPath);
  assert.ok(gfgFns.has('push'), 'Must detect push');
  assert.ok(gfgFns.has('deleteNode'), 'Must detect deleteNode');

  const oopFns = StateExtractor.getUserDefinedFunctions(oopPath);
  assert.ok(oopFns.has('insertAtHead'), 'Must detect insertAtHead');
  assert.ok(oopFns.has('display'), 'Must detect display');

  const bstFns = StateExtractor.getUserDefinedFunctions(bstPath);
  assert.ok(bstFns.has('insert'), 'Must detect insert');
  assert.ok(bstFns.has('inorder'), 'Must detect inorder');
  assert.ok(bstFns.has('findNodeAndParent'), 'Must detect findNodeAndParent');
  assert.ok(bstFns.has('caseA'), 'Must detect caseA');
  console.log('  ✓ Verified getUserDefinedFunctions discovers helper functions (insert, inorder, findNodeAndParent, caseA)');

  // Test 6: Compiling all internet examples
  console.log('\n[Test 6] Testing Compilation of All Internet Examples & BST...');
  for (const file of [leetcodePath, gfgPath, oopPath, bstPath]) {
    const res = await CppCompiler.compile(file);
    assert.strictEqual(res.success, true, `Should compile ${path.basename(file)}: ${res.errorMessage}`);
    console.log(`  ✓ Successfully compiled ${path.basename(file)}`);
  }

  console.log('\n=== All VS Code Debug Mentor Core Tests PASSED ===\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
