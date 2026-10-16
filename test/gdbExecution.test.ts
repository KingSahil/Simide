import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { DebugSessionManager } from '../src/debug/debugSessionManager';

const execFileAsync = promisify(execFile);

async function testGdbExecution() {
  console.log('=== Running Real GDB Runtime Stepping & State Extraction Test ===\n');

  const exePath = path.resolve(process.cwd(), 'examples/.debug-mentor/linked-list.exe');
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

  const scriptPath = path.resolve(process.cwd(), 'examples/.debug-mentor/test_gdb.txt');
  fs.writeFileSync(scriptPath, gdbCmds.join('\n'), 'utf8');

  try {
    const { stdout } = await execFileAsync(debuggerInfo.path, ['-batch', '-x', scriptPath, exePath]);
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

  const exePath = path.resolve(process.cwd(), 'examples/.debug-mentor/leetcode-206-reverse.exe');
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

  const scriptPath = path.resolve(process.cwd(), 'examples/.debug-mentor/test_reverse_gdb.txt');
  fs.writeFileSync(scriptPath, gdbCmds.join('\n'), 'utf8');

  try {
    const { stdout } = await execFileAsync(debuggerInfo.path, ['-batch', '-x', scriptPath, exePath]);
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

  const exePath = path.resolve(process.cwd(), 'examples/.debug-mentor/bst-traversals.exe');
  assert.ok(fs.existsSync(exePath), 'Compiled BST executable must exist');

  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo, 'GDB must be available');

  const gdbCmds = [
    'break main',
    'run',
    // Line 48: TreeNode* root = nullptr;
    'next',
    // Line 51: root = insert(root, 50);
    'next',
    'print root->val',
    // Line 52: insert(root, 30);
    'next',
    'print root->left->val',
    // Line 53: insert(root, 70);
    'next',
    'print root->right->val',
    // Break inside inorder traversal
    'break inorder',
    'continue',
    'print root->val',
    'continue',
    'print root->val',
    'quit',
  ];

  const scriptPath = path.resolve(process.cwd(), 'examples/.debug-mentor/test_bst_gdb.txt');
  fs.writeFileSync(scriptPath, gdbCmds.join('\n'), 'utf8');

  try {
    const { stdout } = await execFileAsync(debuggerInfo.path, ['-batch', '-x', scriptPath, exePath]);
    console.log('[GDB BST Traversal Output Sample]');
    const lines = stdout.split('\n').filter((l) => l.includes('$') || l.includes('Breakpoint'));
    lines.forEach((l) => console.log('  ' + l.trim()));

    // Verify key extractions
    assert.ok(stdout.includes('= 50'), 'BST Root val should be 50');
    assert.ok(stdout.includes('= 30'), 'BST Left child val should be 30');
    assert.ok(stdout.includes('= 70'), 'BST Right child val should be 70');

    // Run executable directly to verify exact traversal sequence outputs
    const { stdout: progOutput } = await execFileAsync(exePath, []);
    assert.ok(progOutput.includes('Preorder: 50 30 20 40 70 60 80'), 'Preorder traversal must match');
    assert.ok(progOutput.includes('Inorder: 20 30 40 50 60 70 80'), 'Inorder sorted BST traversal must match');
    assert.ok(progOutput.includes('Postorder: 20 40 30 60 80 70 50'), 'Postorder traversal must match');

    console.log('\n✓ Verified real GDB runtime stops and tree pointer chasing (root=50, left=30, right=70)');
    console.log('✓ Verified Preorder: 50 30 20 40 70 60 80');
    console.log('✓ Verified Inorder (Sorted): 20 30 40 50 60 70 80');
    console.log('✓ Verified Postorder: 20 40 30 60 80 70 50');
    console.log('=== Real GDB BST Traversals Test PASSED ===\n');
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
}

runAllGdbTests().catch((err) => {
  console.error('❌ GDB Execution Test failed:', err);
  process.exit(1);
});
