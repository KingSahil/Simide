import * as assert from 'assert';
import { AstCodePatcher, type SourceEdit, type PatchResult } from '../src/visualization/codePatcher';
import { type SourceRange } from '../src/parser/clangAstParser';

const MULTILINE = `class Node {
public:
    int data;
    Node* next;
    Node(int val) : data(val), next(nullptr) {}
};

int main() {
    Node* head = nullptr;
    Node* node2 = nullptr;
    return 0;
}
`;

// Line map: 1 class Node {, 2 public:, 3 int data;, 4 Node* next;,
// 5 ctor, 6 };, 7 empty, 8 int main() {, 9 head, 10 node2, 11 return, 12 };

function rangeOf(text: string, beginLine: number, beginCol: number, endLine: number, endCol: number): SourceRange {
	return { begin: { line: beginLine, col: beginCol, file: 'x.cpp' }, end: { line: endLine, col: endCol, file: 'x.cpp' } };
}

async function run() {
	// --- lineColToOffset / offsetToPosition round-trip ---
	assert.strictEqual(AstCodePatcher.lineColToOffset(MULTILINE, 1, 1), 0);
	assert.strictEqual(AstCodePatcher.lineColToOffset(MULTILINE, 2, 1), 'class Node {\n'.length);
	assert.strictEqual(AstCodePatcher.lineColToOffset(MULTILINE, 3, 5), MULTILINE.indexOf('int data;'));
	const retOffset = MULTILINE.indexOf('return 0;');
	const pos = AstCodePatcher.offsetToPosition(MULTILINE, retOffset);
	assert.strictEqual(pos.line, MULTILINE.slice(0, retOffset).split('\n').length - 1);
	assert.strictEqual(AstCodePatcher.positionToOffset(MULTILINE, pos), retOffset);

	// --- statementEndOffset ignores semicolons inside strings / braces ---
	assert.strictEqual(
		AstCodePatcher.statementEndOffset('char* s = "a;b"; int c = 1;', 0),
		'char* s = "a;b";'.length
	);
	assert.strictEqual(
		AstCodePatcher.statementEndOffset('if (x) { y = 1; } z = 2;', 0),
		'if (x) { y = 1; }'.length
	); // returns offset just after the compound statement's closing brace

	// --- applyEdit ---
	assert.strictEqual(AstCodePatcher.applyEdit('abcdef', { start: 3, end: 5, newText: 'XY' }), 'abcXYf');
	assert.strictEqual(AstCodePatcher.applyEdit('abc', { start: 2, end: 2, newText: 'INSERTED' }), 'abINSERTEDc');

	// --- insertAfterStatement places code right after the anchored statement ---
	const after = AstCodePatcher.insertAfterStatement(MULTILINE, rangeOf(MULTILINE, 9, 1, 9, 20), 'Node* node3 = nullptr;');
	const afterLines = after.source.split('\n');
	assert.ok(afterLines.some((l) => l.trim() === 'Node* node3 = nullptr;'), 'inserted code must be present');
	const headIdx = afterLines.findIndex((l) => l.includes('Node* head'));
	const insIdx = afterLines.findIndex((l) => l.includes('Node* node3'));
	assert.ok(insIdx > headIdx, 'insertion must be after the anchored statement');
	assert.strictEqual(afterLines[insIdx - 1]?.trim(), 'Node* head = nullptr;');
	assert.strictEqual(after.highlighted.startLine, insIdx + 1); // 1-based line of inserted code

	// --- insertAtScopeStart lands inside braces ---
	const scopeStart = AstCodePatcher.insertAtScopeStart(MULTILINE, rangeOf(MULTILINE, 8, 1, 8, 11), 'Node* wired = nullptr;');
	assert.ok(scopeStart.source.includes('int main() {\nNode* wired = nullptr;'), 'scope-start insertion must land inside braces');

	// --- insertAtScopeEnd lands before closing brace ---
	const scopeEnd = AstCodePatcher.insertAtScopeEnd(MULTILINE, rangeOf(MULTILINE, 8, 1, 12, 2), 'Node* wired = nullptr;');
	assert.ok(scopeEnd.source.includes('Node* wired = nullptr;'), 'scope-end insertion must insert the wiring code');
	const braceIdx = scopeEnd.source.lastIndexOf('}');
	const codeIdx = scopeEnd.source.indexOf('Node* wired = nullptr;');
	assert.ok(codeIdx > 0 && codeIdx < braceIdx, 'wiring code must precede the closing brace');

	// --- missing range degrades gracefully ---
	const degraded = AstCodePatcher.insertAfterStatement(MULTILINE, undefined!, 'int x = 0;');
	assert.ok(degraded.source.includes('int x = 0;'));

	// --- edit round-trip reproduces patched source ---
	assert.strictEqual(AstCodePatcher.applyEdit(MULTILINE, after.edit), after.source);

	console.log('✓ codePatcher: offset conversion, statement/scope insertion, applyEdit passed');
}

run().catch((error) => { console.error(error); process.exit(1); });
