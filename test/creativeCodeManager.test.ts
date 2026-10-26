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

  console.log('✓ CreativeCodeManager parsing tests passed!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
