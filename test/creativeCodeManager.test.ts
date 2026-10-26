import * as assert from 'assert';
import { CreativeCodeManager } from '../src/creative/creativeCodeManager';

async function run() {
  console.log('Testing CreativeCodeManager parseExistingCode...');

  const sampleCpp = `
#include <iostream>
#include <stack>
#include <queue>

struct Node {
    int data;
    Node* next;
    Node(int val) : data(val), next(nullptr) {}
};

int main() {
    Node* head = new Node(10);
    Node* node2 = new Node(20);
    Node* node3 = new Node(30);

    head->next = node2;
    node2->next = node3;

    std::stack<int> s;
    s.push(100);
    s.push(200);

    std::queue<int> q;
    q.push(1);
    q.push(2);

    return 0;
}
`;

  const state = CreativeCodeManager.parseExistingCode(sampleCpp);

  // 1. Verify Nodes
  assert.strictEqual(state.nodes.length, 3, 'Should discover 3 linked list nodes');
  assert.strictEqual(state.nodes[0].varName, 'head');
  assert.strictEqual(state.nodes[0].value, 10);
  assert.strictEqual(state.nodes[0].nextVar, 'node2', 'head should point to node2');

  assert.strictEqual(state.nodes[1].varName, 'node2');
  assert.strictEqual(state.nodes[1].value, 20);
  assert.strictEqual(state.nodes[1].nextVar, 'node3', 'node2 should point to node3');

  assert.strictEqual(state.nodes[2].varName, 'node3');
  assert.strictEqual(state.nodes[2].value, 30);
  assert.strictEqual(state.nodes[2].nextVar, null, 'node3 should have no nextVar');

  // 2. Verify Stacks
  assert.strictEqual(state.stacks.length, 1, 'Should discover 1 stack');
  assert.strictEqual(state.stacks[0].varName, 's');
  assert.deepStrictEqual(state.stacks[0].elements, [100, 200]);

  // 3. Verify Queues
  assert.strictEqual(state.queues.length, 1, 'Should discover 1 queue');
  assert.strictEqual(state.queues[0].varName, 'q');
  assert.deepStrictEqual(state.queues[0].elements, [1, 2]);

  // 4. Test handleStackPush in a completely blank file
  const blankDoc = new (class {
    text = '';
    getText() { return this.text; }
    get lineCount() { return this.text.split('\n').length; }
    positionAt(offset: number) {
      const lines = this.text.substring(0, offset).split('\n');
      return { line: lines.length - 1, character: lines[lines.length - 1].length };
    }
  })();
  const blankEditor: any = {
    document: blankDoc,
    edit: async (cb: any) => {
      const b = {
        replace: (_range: any, val: string) => { blankDoc.text = val; },
        insert: (pos: any, val: string) => {
          const lines = blankDoc.text.split('\n');
          const line = lines[pos.line] || '';
          lines[pos.line] = line.slice(0, pos.character) + val + line.slice(pos.character);
          blankDoc.text = lines.join('\n');
        },
      };
      cb(b);
      return true;
    },
  };

  const stackRes = await CreativeCodeManager.handleStackPush(blankEditor, 's', 10);
  assert.strictEqual(stackRes.ok, true, 'Stack push to blank file should succeed');
  assert.ok(blankDoc.text.includes('std::stack<int> s;'), 'Should create stack declaration');
  assert.ok(blankDoc.text.includes('s.push(10);'), 'Should insert initial push');

  // Push second element
  const stackRes2 = await CreativeCodeManager.handleStackPush(blankEditor, 's', 20);
  assert.strictEqual(stackRes2.ok, true, 'Second stack push should succeed');
  assert.ok(blankDoc.text.includes('s.push(20);'), 'Should insert second push');

  // 5. Test handleQueuePush in a completely blank file
  const blankQueueDoc = new (class {
    text = '';
    getText() { return this.text; }
    get lineCount() { return this.text.split('\n').length; }
    positionAt(offset: number) {
      const lines = this.text.substring(0, offset).split('\n');
      return { line: lines.length - 1, character: lines[lines.length - 1].length };
    }
  })();
  const blankQueueEditor: any = {
    document: blankQueueDoc,
    edit: async (cb: any) => {
      const b = {
        replace: (_range: any, val: string) => { blankQueueDoc.text = val; },
        insert: (pos: any, val: string) => {
          const lines = blankQueueDoc.text.split('\n');
          const line = lines[pos.line] || '';
          lines[pos.line] = line.slice(0, pos.character) + val + line.slice(pos.character);
          blankQueueDoc.text = lines.join('\n');
        },
      };
      cb(b);
      return true;
    },
  };

  const queueRes = await CreativeCodeManager.handleQueuePush(blankQueueEditor, 'q', 10);
  assert.strictEqual(queueRes.ok, true, 'Queue push to blank file should succeed');
  assert.ok(blankQueueDoc.text.includes('std::queue<int> q;'), 'Should create queue declaration');
  assert.ok(blankQueueDoc.text.includes('q.push(10);'), 'Should insert initial push');

  const parsedQueue = CreativeCodeManager.parseExistingCode(blankQueueDoc.text);
  assert.strictEqual(parsedQueue.queues.length, 1);
  assert.strictEqual(parsedQueue.queues[0].elements[0], 10);

  console.log('✓ CreativeCodeManager parsing & code generation tests passed!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
