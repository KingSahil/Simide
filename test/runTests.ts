import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { CppCompiler } from '../src/debug/compiler';
import { ExplanationGenerator } from '../src/visualization/explanationGenerator';
import { SnapshotManager } from '../src/visualization/snapshotManager';
import {
  ArrayVariable,
  IndexPointer,
  LinkedListSnapshot,
  ListNode,
  StackModel,
  QueueModel,
} from '../src/visualization/linkedListModel';
import { DebugSessionManager } from '../src/debug/debugSessionManager';

async function runTests() {
  console.log('=== Running VS Code Debug Mentor Test Suite ===\n');

  // Test 1: Compiler detection and C++ compilation
  console.log('[Test 1] Testing Compiler Detection & Real C++ Build...');
  const compiler = await CppCompiler.findCompiler();
  assert.ok(compiler, 'Compiler (g++ or clang++) should be detected in PATH');
  console.log(`  ✓ Detected compiler: ${compiler}`);

  // A stable fixture: examples/linked-list.cpp is intentionally editable by learners.
  const samplePath = path.resolve(process.cwd(), 'test', 'fixtures', 'bst-reference.cpp');
  assert.ok(fs.existsSync(samplePath), 'The BST reference fixture must exist');

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

  // State 13 (Array): Array Initialization
  const arr1: ArrayVariable = {
    name: 'arr',
    type: 'int [5]',
    size: 5,
    elements: [
      { index: 0, value: 10 },
      { index: 1, value: 20 },
      { index: 2, value: 30 },
      { index: 3, value: 40 },
      { index: 4, value: 50 },
    ],
  };
  const arrayInitRes = ExplanationGenerator.generate(
    [],
    null,
    undefined,
    true,
    [],
    null,
    '',
    'array',
    null,
    undefined,
    [arr1],
    [{ name: 'i', targetIndex: 0, targetArrayName: 'arr', value: 0 }]
  );
  assert.strictEqual(arrayInitRes.changeType, 'array_initialized');
  assert.ok(arrayInitRes.explanation.includes("Initialized array 'arr' of size 5: [10, 20, 30, 40, 50]"));
  console.log(`  ✓ Array Initialized state: "${arrayInitRes.explanation}"`);

  // State 14 (Array): Element update (arr[2] = 99)
  const arrSnap1: LinkedListSnapshot = {
    stepNumber: 1,
    structureType: 'array',
    hasHead: true,
    headId: null,
    nodes: [],
    arrays: [arr1],
    indexPointers: [{ name: 'i', targetIndex: 0, targetArrayName: 'arr', value: 0 }],
    explanation: arrayInitRes.explanation,
    changeType: 'array_initialized',
  };
  const arr2: ArrayVariable = {
    ...arr1,
    elements: arr1.elements.map((e) => (e.index === 2 ? { ...e, value: 99, isModified: true } : e)),
  };
  const arrayUpdateRes = ExplanationGenerator.generate(
    [],
    null,
    arrSnap1,
    true,
    [],
    null,
    '',
    'array',
    null,
    undefined,
    [arr2],
    [{ name: 'i', targetIndex: 2, targetArrayName: 'arr', value: 2 }]
  );
  assert.strictEqual(arrayUpdateRes.changeType, 'array_element_updated');
  assert.ok(arrayUpdateRes.explanation.includes('Updated arr[2] from 30 to 99'));
  console.log(`  ✓ Array Element Update state: "${arrayUpdateRes.explanation}"`);

  // State 15 (Array): Element swap (swap arr[0] and arr[1])
  const arrSnap2: LinkedListSnapshot = {
    stepNumber: 2,
    structureType: 'array',
    hasHead: true,
    headId: null,
    nodes: [],
    arrays: [arr2],
    explanation: arrayUpdateRes.explanation,
    changeType: 'array_element_updated',
  };
  const arr3: ArrayVariable = {
    ...arr2,
    elements: arr2.elements.map((e) => {
      if (e.index === 0) return { ...e, value: 20 };
      if (e.index === 1) return { ...e, value: 10 };
      return e;
    }),
  };
  const arraySwapRes = ExplanationGenerator.generate(
    [],
    null,
    arrSnap2,
    true,
    [],
    null,
    '',
    'array',
    null,
    undefined,
    [arr3]
  );
  assert.strictEqual(arraySwapRes.changeType, 'array_element_swapped');
  assert.ok(arraySwapRes.explanation.includes('Swapped elements arr[0] (20) and arr[1] (10)'));
  console.log(`  ✓ Array Element Swap state: "${arraySwapRes.explanation}"`);

  // State 16 (Array): Index Pointer Movement (i moved to index 3)
  const arrSnap3: LinkedListSnapshot = {
    stepNumber: 3,
    structureType: 'array',
    hasHead: true,
    headId: null,
    nodes: [],
    arrays: [arr3],
    indexPointers: [{ name: 'i', targetIndex: 2, targetArrayName: 'arr', value: 2 }],
    explanation: arraySwapRes.explanation,
    changeType: 'array_element_swapped',
  };
  const arrayPtrRes = ExplanationGenerator.generate(
    [],
    null,
    arrSnap3,
    true,
    [],
    null,
    '',
    'array',
    null,
    undefined,
    [arr3],
    [{ name: 'i', targetIndex: 3, targetArrayName: 'arr', value: 3 }]
  );
  assert.strictEqual(arrayPtrRes.changeType, 'array_pointer_moved');
  assert.ok(arrayPtrRes.explanation.includes("Index pointer 'i' moved to index 3"));
  console.log(`  ✓ Array Pointer Moved state: "${arrayPtrRes.explanation}"`);

  // State 17 (Stack): Initialization
  const stackModelInit: StackModel = {
    name: 's',
    elements: [],
    topIndex: -1,
    capacity: 6,
    activeMethod: 'init',
  };
  const stackInitRes = ExplanationGenerator.generate(
    [], null, undefined, true, [], null, '', 'stack', null, undefined, undefined, undefined,
    stackModelInit
  );
  assert.strictEqual(stackInitRes.changeType, 'stack_initialized');
  assert.ok(stackInitRes.explanation.includes('initialized to empty'));
  console.log(`  ✓ Stack Initialized state: "${stackInitRes.explanation}"`);

  // State 18 (Stack): Push 10
  const stackSnap1: LinkedListSnapshot = {
    stepNumber: 1,
    structureType: 'stack',
    hasHead: true,
    headId: null,
    nodes: [],
    stack: stackModelInit,
    explanation: stackInitRes.explanation,
    changeType: 'stack_initialized',
  };
  const stackModelPush: StackModel = {
    name: 's',
    elements: [{ id: 'elem_0', index: 0, value: 10, isTop: true, isPushing: true }],
    topIndex: 0,
    capacity: 6,
    activeMethod: 'push',
    methodParam: 10,
  };
  const stackPushRes = ExplanationGenerator.generate(
    [], null, stackSnap1, true, [], null, '', 'stack', null, undefined, undefined, undefined,
    stackModelPush
  );
  assert.strictEqual(stackPushRes.changeType, 'stack_push');
  assert.ok(stackPushRes.explanation.includes('Pushed value 10'));
  console.log(`  ✓ Stack Push state: "${stackPushRes.explanation}"`);

  // State 19 (Stack): Peek
  const stackSnap2: LinkedListSnapshot = {
    stepNumber: 2,
    structureType: 'stack',
    hasHead: true,
    headId: null,
    nodes: [],
    stack: stackModelPush,
    explanation: stackPushRes.explanation,
    changeType: 'stack_push',
  };
  const stackModelPeek: StackModel = {
    ...stackModelPush,
    activeMethod: 'peek',
    methodReturnValue: 10,
  };
  const stackPeekRes = ExplanationGenerator.generate(
    [], null, stackSnap2, true, [], null, '', 'stack', null, undefined, undefined, undefined,
    stackModelPeek
  );
  assert.strictEqual(stackPeekRes.changeType, 'stack_peek');
  assert.ok(stackPeekRes.explanation.includes('Peeked at top'));
  console.log(`  ✓ Stack Peek state: "${stackPeekRes.explanation}"`);

  // State 20 (Stack): Pop
  const stackModelPop: StackModel = {
    name: 's',
    elements: [],
    topIndex: -1,
    capacity: 6,
    activeMethod: 'pop',
    methodReturnValue: 10,
  };
  const stackPopRes = ExplanationGenerator.generate(
    [], null, stackSnap2, true, [], null, '', 'stack', null, undefined, undefined, undefined,
    stackModelPop
  );
  assert.strictEqual(stackPopRes.changeType, 'stack_pop');
  assert.ok(stackPopRes.explanation.includes('Popped value 10'));
  console.log(`  ✓ Stack Pop state: "${stackPopRes.explanation}"`);

  // State 21 (Queue): Initialization
  const queueModelInit: QueueModel = {
    name: 'q',
    slots: [
      { index: 0, value: null, hasValue: false },
      { index: 1, value: null, hasValue: false },
      { index: 2, value: null, hasValue: false },
      { index: 3, value: null, hasValue: false },
      { index: 4, value: null, hasValue: false },
    ],
    front: -1,
    rear: -1,
    capacity: 5,
    size: 0,
    isCircular: true,
    activeMethod: 'init',
  };
  const queueInitRes = ExplanationGenerator.generate(
    [], null, undefined, true, [], null, '', 'queue', null, undefined, undefined, undefined,
    undefined, queueModelInit
  );
  assert.strictEqual(queueInitRes.changeType, 'queue_initialized');
  assert.ok(queueInitRes.explanation.includes('initialized to empty'));
  console.log(`  ✓ Queue Initialized state: "${queueInitRes.explanation}"`);

  // State 22 (Queue): Enqueue 10
  const queueSnap1: LinkedListSnapshot = {
    stepNumber: 1,
    structureType: 'queue',
    hasHead: true,
    headId: null,
    nodes: [],
    queue: queueModelInit,
    explanation: queueInitRes.explanation,
    changeType: 'queue_initialized',
  };
  const queueModelEnq: QueueModel = {
    ...queueModelInit,
    slots: [
      { index: 0, value: 10, hasValue: true, isFront: true, isRear: true, isEnqueuing: true },
      { index: 1, value: null, hasValue: false },
      { index: 2, value: null, hasValue: false },
      { index: 3, value: null, hasValue: false },
      { index: 4, value: null, hasValue: false },
    ],
    front: 0,
    rear: 0,
    size: 1,
    activeMethod: 'enqueue',
    methodParam: 10,
  };
  const queueEnqRes = ExplanationGenerator.generate(
    [], null, queueSnap1, true, [], null, '', 'queue', null, undefined, undefined, undefined,
    undefined, queueModelEnq
  );
  assert.strictEqual(queueEnqRes.changeType, 'queue_enqueue');
  assert.ok(queueEnqRes.explanation.includes('Enqueued value 10'));
  console.log(`  ✓ Queue Enqueue state: "${queueEnqRes.explanation}"`);

  // State 23 (Queue): Wrap-Around Enqueue
  const queueModelWrap: QueueModel = {
    ...queueModelInit,
    slots: [
      { index: 0, value: 60, hasValue: true, isRear: true, isEnqueuing: true },
      { index: 1, value: null, hasValue: false },
      { index: 2, value: 30, hasValue: true, isFront: true },
      { index: 3, value: 40, hasValue: true },
      { index: 4, value: 50, hasValue: true },
    ],
    front: 2,
    rear: 0,
    size: 4,
    justWrapped: true,
    status: 'wrapped',
    activeMethod: 'enqueue',
    methodParam: 60,
  };
  const queueWrapRes = ExplanationGenerator.generate(
    [], null, queueSnap1, true, [], null, '', 'queue', null, undefined, undefined, undefined,
    undefined, queueModelWrap
  );
  assert.strictEqual(queueWrapRes.changeType, 'queue_wrap');
  assert.ok(queueWrapRes.explanation.includes('Wrap-Around'));
  console.log(`  ✓ Queue Circular Wrap-Around state: "${queueWrapRes.explanation}"`);

  // State 24 (Queue): Dequeue
  const queueModelDeq: QueueModel = {
    ...queueModelInit,
    front: 3,
    rear: 0,
    size: 3,
    activeMethod: 'dequeue',
    methodReturnValue: 30,
  };
  const queueDeqRes = ExplanationGenerator.generate(
    [], null, queueSnap1, true, [], null, '', 'queue', null, undefined, undefined, undefined,
    undefined, queueModelDeq
  );
  assert.strictEqual(queueDeqRes.changeType, 'queue_dequeue');
  assert.ok(queueDeqRes.explanation.includes('Dequeued value 30'));
  console.log(`  ✓ Queue Dequeue state: "${queueDeqRes.explanation}"`);

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

  const arrayOpsPath = path.resolve(process.cwd(), 'examples', 'array-operations.cpp');
  const structInfoArray = StateExtractor.parseStructMembers(arrayOpsPath);
  assert.strictEqual(structInfoArray.structureType, 'array');
  const arrDecls = StateExtractor.discoverArrayDeclarations(arrayOpsPath);
  assert.strictEqual(arrDecls.length, 1);
  assert.strictEqual(arrDecls[0].name, 'arr');
  assert.strictEqual(arrDecls[0].size, 5);
  console.log('  ✓ Verified array structure discovery & declaration parsing for array-operations.cpp');

  const stackOpsPath = path.resolve(process.cwd(), 'examples', 'stack-operations.cpp');
  const structInfoStack = StateExtractor.parseStructMembers(stackOpsPath);
  assert.strictEqual(structInfoStack.structureType, 'stack');

  const circularQueuePath = path.resolve(process.cwd(), 'examples', 'circular-queue.cpp');
  const structInfoQueue = StateExtractor.parseStructMembers(circularQueuePath);
  assert.strictEqual(structInfoQueue.structureType, 'queue');
  console.log('  ✓ Verified stack and circular queue structure discovery for stack-operations.cpp & circular-queue.cpp');

  const stringPalinPath = path.resolve(process.cwd(), 'examples', 'string-palindrome.cpp');
  const structInfoString = StateExtractor.parseStructMembers(stringPalinPath);
  assert.strictEqual(structInfoString.structureType, 'string');
  const strDecls = StateExtractor.discoverStringDeclarations(stringPalinPath);
  assert.ok(strDecls.some((s) => s.name === 'word' && s.type === 'std_string'));
  const palinPattern = StateExtractor.detectStringAlgorithmPattern(stringPalinPath);
  assert.strictEqual(palinPattern.pattern, 'two_pointer');
  assert.strictEqual(palinPattern.leftPtr, 'left');
  assert.strictEqual(palinPattern.rightPtr, 'right');

  const cStringRevPath = path.resolve(process.cwd(), 'examples', 'c-string-reverse.cpp');
  const structInfoCString = StateExtractor.parseStructMembers(cStringRevPath);
  assert.strictEqual(structInfoCString.structureType, 'string');
  const cStrDecls = StateExtractor.discoverStringDeclarations(cStringRevPath);
  assert.ok(cStrDecls.some((s) => s.name === 'str' && s.type === 'char_array' && s.size === 10));
  const cStrPattern = StateExtractor.detectStringAlgorithmPattern(cStringRevPath);
  assert.strictEqual(cStrPattern.pattern, 'two_pointer');

  const slidingWinPath = path.resolve(process.cwd(), 'examples', 'sliding-window-string.cpp');
  const slidingWinPattern = StateExtractor.detectStringAlgorithmPattern(slidingWinPath);
  assert.strictEqual(slidingWinPattern.pattern, 'sliding_window');

  console.log('  ✓ Verified string structure discovery & algorithm pattern detection (two-pointer & sliding window)');

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
  console.log('  ✓ Verified getUserDefinedFunctions discovers helper functions (insert, inorder, findNodeAndParent, caseA)');

  // Verify multi-pointer parameter and reference declarations in samplePath
  const declMap = StateExtractor.getVariableDeclarations(samplePath);
  assert.ok(declMap.has('loc'), 'Must detect loc in variable declarations');
  assert.ok(declMap.get('loc')!.includes(40), 'loc must be declared at line 40');
  assert.ok(declMap.has('par'), 'Must detect par in variable declarations');
  assert.ok(declMap.get('par')!.includes(40), 'par must be declared at line 40');
  assert.ok(declMap.has('child'), 'Must detect child in variable declarations');
  assert.ok(declMap.get('child')!.includes(58), 'child must be declared at line 58');
  assert.ok(declMap.has('parSuccessor'), 'Must detect parSuccessor in variable declarations');
  assert.ok(declMap.get('parSuccessor')!.includes(82), 'parSuccessor must be declared at line 82');
  assert.ok(declMap.has('successor'), 'Must detect successor in variable declarations');
  assert.ok(declMap.get('successor')!.includes(83), 'successor must be declared at line 83 (loc->right)');

  const fnRanges = StateExtractor.getFunctionRanges(samplePath);
  const findFn = fnRanges.find((f) => f.name === 'findNodeAndParent');
  assert.ok(findFn, 'findNodeAndParent must be found in function ranges');
  assert.ok(findFn!.params?.includes('loc'), 'findNodeAndParent params must include loc');
  assert.ok(findFn!.params?.includes('par'), 'findNodeAndParent params must include par');

  // Verify variable initialization inside findNodeAndParent
  assert.strictEqual(StateExtractor.isVariableInitialized('loc', 47, declMap, findFn!), true);
  assert.strictEqual(StateExtractor.isVariableInitialized('par', 47, declMap, findFn!), true);
  assert.strictEqual(StateExtractor.isVariableInitialized('loc', 40, declMap, findFn!), true);

  const delFn = fnRanges.find((f) => f.name === 'deleteNode');
  assert.ok(delFn, 'deleteNode must be found in function ranges');
  assert.strictEqual(StateExtractor.isVariableInitialized('loc', 100, declMap, delFn!), false);
  assert.strictEqual(StateExtractor.isVariableInitialized('loc', 102, declMap, delFn!), true);
  console.log('  ✓ Verified multi-pointer parameters (loc, par, child, successor) and initialization checks');

  // Test 6: Compiling all internet examples
  console.log('\n[Test 6] Testing Compilation of All Internet Examples, BST, Arrays, Stack & Circular Queue...');
  for (const file of [leetcodePath, gfgPath, oopPath, bstPath, arrayOpsPath, stackOpsPath, circularQueuePath]) {
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
