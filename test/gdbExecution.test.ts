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
    // At line 10: Node* head = nullptr;
    'next',
    'print head',
    // At line 11: Node* first = new Node{10, nullptr};
    'next',
    'print first',
    'print first->data',
    'print first->next',
    // At line 12: head = first;
    'next',
    'print head',
    'print head->data',
    // At line 13: Node* second = new Node{20, nullptr};
    'next',
    'print second',
    'print second->data',
    // At line 14: first->next = second;
    'next',
    'print first->next',
    // At line 15: Node* third = new Node{30, nullptr};
    'next',
    'print third',
    'print third->data',
    // At line 16: second->next = third;
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
    assert.ok(stdout.includes('$1 = (Node *) 0x0'), 'Head should initially be null (0x0)');
    assert.ok(stdout.includes('= 10'), 'First node data should be 10');
    assert.ok(stdout.includes('= 20'), 'Second node data should be 20');
    assert.ok(stdout.includes('= 30'), 'Third node data should be 30');

    console.log('\n✓ Verified real GDB runtime stops and variable values (10 -> 20 -> 30)');
    console.log('=== Real GDB Execution Test PASSED ===\n');
  } finally {
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
    }
  }
}

testGdbExecution().catch((err) => {
  console.error('❌ GDB Execution Test failed:', err);
  process.exit(1);
});
