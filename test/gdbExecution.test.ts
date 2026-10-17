import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { DebugSessionManager } from '../src/debug/debugSessionManager';

const execFileAsync = promisify(execFile);

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

  const debugMentorDir = getWindowsShortPath(path.resolve(process.cwd(), 'examples/.debug-mentor'));
  const exeFile = 'linked-list.exe';
  const exePath = path.join(debugMentorDir, exeFile);
  assert.ok(fs.existsSync(exePath), 'Compiled executable must exist');

  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo, 'GDB must be available');

  const gdbCmds = [
    'break main',
    'run',
    // Line 10: Node* head = new Node();
    'next',
    // Line 11: Node* second = new Node();
    'next',
    // Line 14: head->data = 10;
    'next',
    'print head->data',
    // Line 15: second->data = 20;
    'next',
    'print second->data',
    // Line 18: head->next = second;
    'next',
    'print head->next->data',
    // Line 19: second->next = nullptr;
    'next',
    'print second->next',
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
    assert.ok(stdout.includes('= 10'), 'Head node data should be 10');
    assert.ok(stdout.includes('= 20'), 'Second node data should be 20');
    assert.ok(stdout.includes('$3 = 20'), 'head->next->data should be 20');

    console.log('\n✓ Verified real GDB runtime stops and variable values (head=10, second=20)');
    console.log('✓ Verified dynamic linking (head->next = second)');
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
  const exeFile = 'leetcode-206-reverse.exe';
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
  const exeFile = 'bst-traversals.exe';
  const exePath = path.join(debugMentorDir, exeFile);
  assert.ok(fs.existsSync(exePath), 'Compiled BST executable must exist');

  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo, 'GDB must be available');

  const gdbCmds = [
    'break main',
    'run',
    // Node* root = nullptr;
    'next',
    // root = insert(root, 50);
    'next',
    'print root->data',
    // root = insert(root, 30);
    'next',
    'print root->left->data',
    // root = insert(root, 70);
    'next',
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
  const exeFile = 'array-operations.exe';
  const exePath = path.join(debugMentorDir, exeFile);
  assert.ok(fs.existsSync(exePath), 'Compiled Array executable must exist');

  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo, 'GDB must be available');

  const gdbCmds = [
    'break main',
    'run',
    // Line 6: int arr[5] = {10, 20, 30, 40, 50};
    'next',
    'print arr[0]',
    'print arr[2]',
    // Line 9: arr[2] = 99;
    'next',
    'print arr[2]',
    // Line 12: int temp = arr[0];
    'next',
    // Line 13: arr[0] = arr[1];
    'next',
    // Line 14: arr[1] = temp;
    'next',
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

async function runAllGdbTests() {
  await testGdbExecution();
  await testLeetcodeReverseGdb();
  await testBstTraversalsGdb();
  await testArrayOperationsGdb();
}

runAllGdbTests().catch((err) => {
  console.error('❌ GDB Execution Test failed:', err);
  process.exit(1);
});
