import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GraphEdgeLinker, type AstSource, type GraphEdge, type GraphNodeMeta } from '../src/sidebar/edgeLinkHandler';
import { AstCodePatcher } from '../src/visualization/codePatcher';
import { ClangAstParser, type ASTNode } from '../src/parser/clangAstParser';

const realParser = new ClangAstParser();

const FIXTURE = `class Node {
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

// Line map: 1 class Node {, 3 int data;, 4 Node* next;, 8 int main() {,
// 9 head, 10 node2, 11 return 0;, 12 }
const FIXTURE_AST: ASTNode = {
	kind: 'TranslationUnit',
	range: { begin: { line: 1, col: 1, file: 'fixture.cpp' }, end: { line: 12, col: 1, file: 'fixture.cpp' } },
	inner: [
		{
			kind: 'CXXRecordDecl',
			name: 'Node',
			type: { qualType: 'Node' },
			range: { begin: { line: 1, col: 1, file: 'fixture.cpp' }, end: { line: 6, col: 3, file: 'fixture.cpp' } },
			inner: [
				{ kind: 'FieldDecl', name: 'data', type: { qualType: 'int' } },
				{ kind: 'FieldDecl', name: 'next', type: { qualType: 'Node *' } },
			],
		},
		{ kind: 'VarDecl', name: 'head', type: { qualType: 'Node *' }, range: { begin: { line: 9, col: 1, file: 'fixture.cpp' }, end: { line: 9, col: 20, file: 'fixture.cpp' } } },
		{ kind: 'VarDecl', name: 'node2', type: { qualType: 'Node' }, range: { begin: { line: 10, col: 1, file: 'fixture.cpp' }, end: { line: 10, col: 16, file: 'fixture.cpp' } } },
	],
};

function metaOver(name: string, file: string, beginLine: number): GraphNodeMeta {
	return { id: name, name, file, range: { begin: { line: beginLine, col: 1, file }, end: { line: beginLine, col: 40, file } } };
}

function makeStub(ast: ASTNode): AstSource {
	return {
		parseFile: async () => ast,
		queryNodes: (root: ASTNode, predicate: (n: ASTNode) => boolean) => realParser.queryNodes(root, predicate),
	};
}

async function run() {
	const linker = new GraphEdgeLinker(makeStub(FIXTURE_AST), new AstCodePatcher());
	const fixturePath = path.join(os.tmpdir(), `simide-edge-${process.pid}.cpp`);
	fs.writeFileSync(fixturePath, FIXTURE);

	try {
		// --- 1. distinct nodes required ---
		const same = await linker.handleEdgeCreated({
			source: metaOver('head', fixturePath, 9),
			target: metaOver('head', fixturePath, 9),
		});
		assert.strictEqual(same.ok, false);
		assert.ok(/distinct/.test(same.error!));

		// --- 2. source file required ---
		const noFile = await linker.handleEdgeCreated({ source: metaOver('ghost', '', 1), target: metaOver('head', '', 9) });
		assert.strictEqual(noFile.ok, false);
		assert.ok(/no source file/i.test(noFile.error!));

		// --- 3. clang unavailability surfaces gracefully ---
		const brokenParser: AstSource = {
			parseFile: async () => {
				throw new Error('Clang is not installed or not on PATH.');
			},
			queryNodes: () => [],
		};
		const broken = new GraphEdgeLinker(brokenParser, new AstCodePatcher());
		broken.setSourceFile(fixturePath);
		const clangErr = await broken.handleEdgeCreated({
			source: metaOver('head', fixturePath, 9),
			target: metaOver('node2', fixturePath, 10),
		});
		assert.strictEqual(clangErr.ok, false);
		assert.ok(/clang/.test(clangErr.error!));

		// --- 4. unresolved symbols are rejected, not silently wired ---
		const unresolved = await linker.handleEdgeCreated({
			source: metaOver('ghost', fixturePath, 99),
			target: metaOver('head', fixturePath, 9),
		});
		assert.strictEqual(unresolved.ok, false);
		assert.ok(/bind|symbol/i.test(unresolved.error!));

		// --- 5. successful member-bind wiring (source resolved to the Node class via range) ---
		const memberBind = await linker.handleEdgeCreated({
			source: { id: 'Node-class', name: 'Node', file: fixturePath, range: { begin: { line: 1, col: 1, file: fixturePath }, end: { line: 6, col: 3, file: fixturePath } } },
			target: metaOver('node2', fixturePath, 10),
			kind: 'member-bind',
		});
		assert.strictEqual(memberBind.ok, true, JSON.stringify(memberBind.error));
		assert.ok(memberBind.edit && typeof memberBind.edit.newText === 'string');
		assert.ok(/next\s*=\s*node2/.test(memberBind.edit.newText), `wiring should use the next pointer field: ${memberBind.edit.newText}`);
		assert.ok(memberBind.modifiedSource!.includes('node2 = nullptr;') && memberBind.modifiedSource!.includes(memberBind.edit.newText));
		assert.strictEqual(memberBind.highlighted?.startLine, 11); // inserted right after line 10's statement
		assert.ok(memberBind.message!.includes('node2'));

		// --- 6. pointer-assignment fallback (head: Node*, node2: Node) ---
		const pointerAssign = await linker.handleEdgeCreated({
			source: metaOver('head', fixturePath, 9),
			target: metaOver('node2', fixturePath, 10),
			kind: 'member-bind',
		});
		assert.strictEqual(pointerAssign.ok, true, JSON.stringify(pointerAssign.error));
		assert.ok(/head\s*=\s*node2;/.test(pointerAssign.edit!.newText), `fallback wiring: ${pointerAssign.edit!.newText}`);
		// insertion must be after the later-declared symbol (node2 on line 10)
		assert.ok(pointerAssign.modifiedSource!.match(/node2 = nullptr;[\s\S]{0,40}head = node2;/), 'wiring must follow the later declaration');

		// --- 7. user-supplied wiring code takes precedence ---
		const custom = await linker.handleEdgeCreated({
			source: metaOver('head', fixturePath, 9),
			target: metaOver('node2', fixturePath, 10),
			wiringCode: 'head->next = node2;',
		});
		assert.strictEqual(custom.ok, true);
		assert.strictEqual(custom.edit!.newText.trim(), 'head->next = node2;');

		// --- 8. apply the edit through the patcher directly (round trip) ---
		if (memberBind.ok && memberBind.edit) {
			const applied = AstCodePatcher.applyEdit(FIXTURE, memberBind.edit);
			assert.strictEqual(applied, memberBind.modifiedSource);
			assert.ok(applied.includes('next = node2;'));
		}

		console.log('✓ edgeLinkHandler: validation, error handling, and wiring rules passed');
	} finally {
		fs.unlinkSync(fixturePath);
	}
}

run().catch((error) => { console.error(error); process.exit(1); });
