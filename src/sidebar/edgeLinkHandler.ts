import { SourceRange, ASTNode } from '../parser/clangAstParser';
import { AstCodePatcher, PatchResult, SourceEdit, HighlightedLines } from '../visualization/codePatcher';

/**
 * Minimal structural interface for an AST source so the linker can be unit-tested
 * with a stub parser (no clang installation required). ClangAstParser satisfies it.
 */
export interface AstSource {
	parseFile(filePath: string): Promise<ASTNode>;
	queryNodes(root: ASTNode, predicate: (n: ASTNode) => boolean): ASTNode[];
}

/**
 * Metadata for a canvas node that participates in a visual link.
 * `name` is the source symbol (variable / function / class name).
 * `range` is the optional clang source range mapped via clangAstParser.
 */
export interface GraphNodeMeta {
	id: string;          // canvas node id (e.g. 'node-abc') — used for identity checks
	label?: string;      // human readable label shown on the canvas
	name?: string;       // source symbol name resolved against the AST
	kind?: string;       // clang AST kind, e.g. 'VarDecl', 'CallExpr', 'CXXConstructExpr'
	type?: string;       // qualified type, e.g. 'Node *', 'LinkedList'
	file?: string;       // source file path containing the symbol
	range?: SourceRange; // declaration/use range mapped via clangAstParser
	data?: number | string;
}

/**
 * A user-created visual edge between two canvas nodes.
 */
export interface GraphEdge {
	source: GraphNodeMeta;
	target: GraphNodeMeta;
	kind?: 'member-bind' | 'call' | 'assign' | 'custom';
	/**
	 * Optional hand-written wiring snippet. When provided it takes precedence over
	 * the rule-based wiring code generated from the resolved AST types.
	 */
	wiringCode?: string;
}

/**
 * Result of handling a created edge.
 */
export interface EdgeLinkResult {
	ok: boolean;
	filePath?: string;
	edit?: SourceEdit;
	modifiedSource?: string;
	highlighted?: HighlightedLines;
	message?: string;
	error?: string;
}

const DISTINCT_NODES_ERROR = 'Cannot create a link: source and target must be two distinct nodes.';
const NO_FILE_ERROR = 'Cannot create a link: no source file is associated with the canvas nodes.';
const NO_CLANG_ERROR = 'Clang AST parser is unavailable (clang/clang++ not on PATH). Install clang to enable AST-guided wiring.';
const UNRESOLVED_ERROR = 'Could not bind both canvas nodes to source symbols in the AST. Make sure the nodes correspond to declared variables/functions in the active file.';
const NO_INSERTION_POINT_ERROR = 'Could not determine a safe insertion point in the source file for the wiring code.';

/**
 * GraphEdgeLinker listens for graph edge creation events and translates a visual
 * link between Node A and Node B into a precise code modification in the backing
 * C++ source file, using clang AST ranges to locate the insertion point.
 */
export class GraphEdgeLinker {
	private sourceFile: string | null = null;

	constructor(private readonly parser: AstSource, private readonly patcher: AstCodePatcher) {}

	/**
	 * Set the backing source file that canvas nodes refer to.
	 */
	setSourceFile(filePath: string): void {
		this.sourceFile = filePath;
	}

	/**
	 * Main entry point invoked when the user finishes creating an edge between
	 * two distinct canvas nodes.
	 */
	async handleEdgeCreated(edge: GraphEdge): Promise<EdgeLinkResult> {
		const { source, target } = edge;

		if (!source || !target || source.id === target.id) {
			return { ok: false, error: DISTINCT_NODES_ERROR };
		}

		const filePath = source.file || target.file || this.sourceFile;
		if (!filePath) {
			return { ok: false, error: NO_FILE_ERROR };
		}

		let ast: ASTNode;
		try {
			ast = await this.parser.parseFile(filePath);
		} catch (err: any) {
			if (err.message && /clang|Clang|PATH/.test(err.message)) {
				return { ok: false, filePath, error: NO_CLANG_ERROR };
			}
			return { ok: false, filePath, error: `AST parse failed: ${err.message ?? String(err)}` };
		}

		const resolvedSource = this.resolveEndpoint(ast, source);
		const resolvedTarget = this.resolveEndpoint(ast, target);

		if (!resolvedSource || !resolvedTarget) {
			return { ok: false, filePath, error: UNRESOLVED_ERROR };
		}

		let wiringCode: string;
		try {
			wiringCode = this.buildWiringCode(edge, resolvedSource, resolvedTarget);
		} catch (err: any) {
			return {
				ok: false,
				filePath,
				error: err.message ?? `Wiring rule failed: ${String(err)}`,
			};
		}

		// Insert the wiring right after the declaration of whichever endpoint is
		// declared later in the file — this keeps the wiring close to the symbols
		// it connects and avoids referencing symbols before they exist.
		const later = this.laterDeclared(resolvedSource.node, resolvedTarget.node);
		const insertRange = later.range || resolvedSource.node.range || resolvedTarget.node.range;
		if (!insertRange || insertRange.begin == null || insertRange.begin.line == null) {
			return { ok: false, filePath, error: NO_INSERTION_POINT_ERROR };
		}

		// Read the real file text so the patcher works on true offsets.
		let fileText: string;
		try {
			const fs = await import('fs');
			fileText = fs.readFileSync(filePath, 'utf8');
		} catch (err: any) {
			return { ok: false, filePath, error: `Cannot read source file: ${err.message ?? String(err)}` };
		}

		let patch: PatchResult;
		try {
			patch = AstCodePatcher.insertAfterStatement(fileText, insertRange, wiringCode);
		} catch {
			// fall back to scope start if statement scanning fails
			patch = AstCodePatcher.insertAtScopeStart(fileText, insertRange, wiringCode);
		}

		const highlighted: HighlightedLines = {
			startLine: patch.highlighted.startLine,
			endLine: patch.highlighted.endLine,
		};

		return {
			ok: true,
			filePath,
			edit: patch.edit,
			modifiedSource: patch.source,
			highlighted,
			message: `Wired ${source.label ?? source.name ?? source.id} → ${target.label ?? target.name ?? target.id}: ${wiringCode}`,
		};
	}

	// ------------------------------------------------------------------
	// Endpoint resolution
	// ------------------------------------------------------------------

	private resolveEndpoint(ast: ASTNode, meta: GraphNodeMeta): { node: ASTNode; meta: GraphNodeMeta } | null {
		// 1. Exact range match: innermost AST node containing the mapped range.
		if (meta.range?.begin?.line != null) {
			const byRange = AstCodePatcher.findNodeAtLine(ast, meta.range.begin.line);
			if (byRange && byRange !== ast) {
				return {
					node: byRange,
					meta: { ...meta, kind: byRange.kind, type: byRange.type?.qualType, range: byRange.range },
				};
			}
		}

		// 2. Name match against declaration-like AST nodes.
		if (meta.name) {
			const candidates = this.parser.queryNodes(ast, (n) => {
				const kind = String(n.kind || '');
				const isDecl = /^(VarDecl|ParmVarDecl|FieldDecl|FunctionDecl|CXXMethodDecl|CXXConstructorDecl|ClassTemplateDecl|ClassDecl|StructDecl)$/.test(kind);
				return isDecl && (n.name === meta.name || n.name === meta.id);
			});
			if (candidates.length > 0) {
				// Prefer the candidate whose type matches meta.type when given.
				const node = meta.type
				? candidates.find((n) => meta.type && String(n.type?.qualType || '').includes(meta.type)) ?? candidates[0]
				: candidates[0];
				return { node, meta: { ...meta, kind: node.kind, type: node.type?.qualType, range: node.range } };
			}
		}

		return null;
	}

	/**
	 * Return the node whose range starts later in the file (later declaration).
	 */
	private laterDeclared(a: ASTNode, b: ASTNode): ASTNode {
		const aLine = a.range?.begin?.line ?? -1;
		const bLine = b.range?.begin?.line ?? -1;
		return bLine > aLine ? b : a;
	}

	// ------------------------------------------------------------------
	// Wiring rule resolution
	// ------------------------------------------------------------------

	/**
	 * Determine *how* two nodes should be wired based on their resolved types:
	 * - pointer member assignment  (head->next = node2;)
	 * - method call binding        (objA.connect(objB);)
	 * - plain assignment           (a = b;)
	 * - user-supplied snippet      (takes precedence)
	 */
	private buildWiringCode(edge: GraphEdge, src: { node: ASTNode; meta: GraphNodeMeta }, tgt: { node: ASTNode; meta: GraphNodeMeta }): string {
		const sMeta = src.meta;
		const tMeta = tgt.meta;
		const sName = sMeta.name || sMeta.label || sMeta.id;
		const tName = tMeta.name || tMeta.label || tMeta.id;

		if (edge.wiringCode && edge.wiringCode.trim()) {
			return edge.wiringCode.trim();
		}
		if (edge.kind === 'custom' && edge.wiringCode) {
			return edge.wiringCode;
		}

		const sType = String(sMeta.type || src.node.type?.qualType || '');
		const tType = String(tMeta.type || tgt.node.type?.qualType || '');
		const sBase = this.baseTypeName(sType);
		const tBase = this.baseTypeName(tType);

		// Rule 1: member-bind — source is a node-like object whose class has a
		// pointer field (next / left / right ...) pointing to target's type.
		if (sBase && tBase && this.hasPointerFieldTo(src.node, sBase, tBase)) {
			const field = this.findPointerFieldName(src.node, sBase, tBase);
			const accessor = sType.includes('*') || sType.includes('&') ? '->' : '.';
			return `${sName}${accessor}${field} = ${tName};`;
		}

		// Rule 2: method call — source exposes a linking method (connect / linkTo / bind).
		const method = this.findLinkMethod(src.node, sBase);
		if (method) {
			return `${sName}.${method}(${tName});`;
		}

		// Rule 3: generic pointer assignment.
		if (sType.includes('*') || tType.includes('*')) {
			return `${sName} = ${tName};`;
		}

		// Rule 4: default — explicit connect call.
		return `${sName}.connect(${tName});`;
	}

	/** Strip const/volatile/ref/pointer qualifiers for comparison. */
	private baseTypeName(type: string): string {
		return type
			.replace(/\b(?:const|volatile|struct|class|enum)\b/g, '')
			.replace(/[*&\s]+/g, ' ')
			.trim();
	}

	/** True if `fieldType` is a pointer-to-`targetBase` type (e.g. 'Node *' → 'Node'). */
	private isPointerTo(fieldType: string, targetBase: string): boolean {
		const t = fieldType.replace(/\b(?:const|volatile|struct|class|enum)\b/g, '').trim();
		return /\*|\&/.test(t) && this.baseTypeName(t) === targetBase;
	}

	/**
	 * Check whether the AST node for `recordType` declares a field whose
	 * desugared type is a pointer to `targetBase`.
	 */
	private hasPointerFieldTo(recordNode: ASTNode, recordType: string, targetBase: string): boolean {
		if (!recordType) return false;
		const records = AstCodePatcher.findAll(recordNode, (n) => {
			const kind = String(n.kind || '');
			return /^(CXXRecordDecl|StructDecl|ClassDecl|RecordDecl)$/.test(kind) && (n.name === recordType || this.baseTypeName(String(n.type?.qualType || '')) === recordType);
		});
		if (records.length === 0) return false;
		for (const rec of records) {
			const field = this.findPointerFieldName(rec, recordType, targetBase);
			if (field) return true;
		}
		return false;
	}

	/**
	 * Name of a pointer field on `recordNode` whose pointee type matches targetBase,
	 * preferring canonical list/tree fields (next, left, right).
	 */
	private findPointerFieldName(recordNode: ASTNode, recordType: string, targetBase: string): string | null {
		const preferred = ['next', 'left', 'right', 'prev', 'head', 'tail'];
		const fields: { name: string; match: boolean }[] = [];
		const visit = (node: ASTNode) => {
			if (!node || typeof node !== 'object') return;
			if (node.kind === 'FieldDecl' && node.name) {
				const fType = String(node.type?.qualType || '');
				fields.push({ name: String(node.name), match: this.isPointerTo(fType, targetBase) });
			}
			if (Array.isArray(node.inner)) {
				for (const child of node.inner) visit(child);
			}
		};
		visit(recordNode);
		for (const pref of preferred) {
			const hit = fields.find((f) => f.name === pref && f.match);
			if (hit) return hit.name;
		}
		const any = fields.find((f) => f.match);
		return any ? any.name : null;
	}

	/**
	 * Heuristic: does the record declare a method that looks like a link/connect operation?
	 */
	private findLinkMethod(recordNode: ASTNode, recordType: string): string | null {
		const candidates: string[] = [];
		const visit = (node: ASTNode) => {
			if (!node || typeof node !== 'object') return;
			if (node.kind === 'CXXMethodDecl' && node.name) {
				const nm = String(node.name);
				if (/connect|link|bind|attach|setNext|setLeft|setRight/i.test(nm)) candidates.push(nm);
			}
			if (Array.isArray(node.inner)) {
				for (const child of node.inner) visit(child);
			}
		};
		visit(recordNode);
		if (candidates.length === 0) return null;
		for (const c of ['connect', 'linkTo', 'bind', 'attach', 'setNext', 'setLeft', 'setRight']) {
			if (candidates.includes(c)) return c;
		}
		return candidates[0];
	}
}
