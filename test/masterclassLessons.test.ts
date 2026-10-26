import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { CppCompiler } from '../src/debug/compiler';
import { StateExtractor } from '../src/debug/stateExtractor';

export async function runMasterclassTests() {
  console.log('=== Running Masterclass Lessons State Extraction Tests ===\n');

  // Test 1: Doubly Linked List field parsing
  console.log('[Test 1] Testing Doubly Linked List struct member parsing...');
  const l1Code = `
    struct Node {
        int val;
        Node* prev;
        Node* next;
        Node(int v) : val(v), prev(nullptr), next(nullptr) {}
    };
    class DoublyLinkedList {
    public:
        Node* head;
        Node* tail;
    };
  `;
  const l1Path = path.resolve('test/fixtures/test_l1_doubly.cpp');
  fs.writeFileSync(l1Path, l1Code);

  try {
    const structMembers = StateExtractor.parseStructMembers(l1Path);
    assert.strictEqual(structMembers.structureType, 'linked_list');
    assert.strictEqual(structMembers.dataField, 'val');
    assert.strictEqual(structMembers.nextField, 'next');
    assert.strictEqual(structMembers.nodeType, 'Node');
    console.log('  ✓ Verified Doubly Linked List struct recognized: nodeType=Node, data=val, next=next');
  } finally {
    if (fs.existsSync(l1Path)) fs.unlinkSync(l1Path);
  }

  // Test 2: In-place reversal struct member parsing (ListNode)
  console.log('[Test 2] Testing ListNode struct member parsing...');
  const l3Code = `
    struct ListNode {
        int val;
        ListNode* next;
        ListNode(int x) : val(x), next(nullptr) {}
    };
  `;
  const l3Path = path.resolve('test/fixtures/test_l3_listnode.cpp');
  fs.writeFileSync(l3Path, l3Code);

  try {
    const structMembers = StateExtractor.parseStructMembers(l3Path);
    assert.strictEqual(structMembers.structureType, 'linked_list');
    assert.strictEqual(structMembers.dataField, 'val');
    assert.strictEqual(structMembers.nextField, 'next');
    assert.strictEqual(structMembers.nodeType, 'ListNode');
    console.log('  ✓ Verified ListNode struct recognized: nodeType=ListNode, data=val, next=next');
  } finally {
    if (fs.existsSync(l3Path)) fs.unlinkSync(l3Path);
  }

  console.log('\n=== All Masterclass Field & Struct Tests PASSED ===\n');
}

if (require.main === module) {
  runMasterclassTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
