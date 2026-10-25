import { SourceRange, ASTNode } from '../parser/clangAstParser';

/**
 * A single source-text replacement, expressed in 0-based character offsets.
 * `end` is exclusive. When start === end the edit is a pure insertion.
 */
export interface SourceEdit {
	start: number;
	end: number;
	newText: string;
}

/**
 * 1-based screen lines affected by an edit, used for editor highlight decorations.
 */
export interface HighlightedLines {
	startLine: number;
	endLine: number;
}

/**
 * Outcome of a patch operation: the rewritten source, the edit that produced it,
 * and the 1-based line range that should be highlighted in the editor.
 */
export interface PatchResult {
	source: string;
	edit: SourceEdit;
	highlighted: HighlightedLines;
}

/**
 * AstCodePatcher performs AST-guided, syntax-safe text rewrites on C++ source.
 *
 * It never touches a real AST compiler: it works purely on text offsets derived
 * from `clangAstParser.SourceRange` (line/column) data, so it is safe to unit test
 * without a clang installation. All offsets are 0-based character positions;
 * clang ranges use 1-based lines and (usually) 0-based columns, which this class
 * normalizes defensively.
 */
export class AstCodePatcher {
	// ------------------------------------------------------------------
	// Offset / position conversion
	// ------------------------------------------------------------------

	/**
	 * Convert a 1-based (line, column) source location into a 0-based character
	 * offset. Columns below 1 are treated as 0-based already (defensive for
	 * clang emitters that report column 0).
	 */
	static lineColToOffset(text: string, line: number, col: number): number {
		if (line < 1) line = 1;
		const lines = text.split('\n');
		if (line > lines.length) line = lines.length;
		let offset = 0;
		for (let i = 1; i < line; i++) {
			offset += lines[i - 1].length + 1; // +1 for the newline
		}
		const column = col >= 1 ? col - 1 : col;
		return offset + Math.max(0, Math.min(column, lines[line - 1].length));
	}

	/**
	 * Convert a 0-based character offset into a 0-based { line, character }
	 * position suitable for VS Code `Position` / `Range`.
	 */
	static offsetToPosition(text: string, offset: number): { line: number; character: number } {
		const safe = Math.max(0, Math.min(offset, text.length));
		let line = 0;
		let remaining = safe;
		const lines = text.split('\n');
		while (line < lines.length - 1 && remaining >= lines[line].length + 1) {
			remaining -= lines[line].length + 1;
			line++;
		}
		return { line, character: remaining };
	}

	/**
	 * Convert a 0-based { line, character } VS Code position into a character offset.
	 */
	static positionToOffset(text: string, pos: { line: number; character: number }): number {
		const lines = text.split('\n');
		const line = Math.max(0, Math.min(pos.line, lines.length - 1));
		let offset = 0;
		for (let i = 0; i < line; i++) offset += lines[i].length + 1;
		return offset + Math.max(0, Math.min(pos.character, lines[line].length));
	}

	// ------------------------------------------------------------------
	// Statement / scope boundary scanning
	// ------------------------------------------------------------------

	/** Scan forward from `from` to the end of the current statement. */
	static statementEndOffset(text: string, from: number): number {
		const len = text.length;
		let i = Math.max(0, Math.min(from, len));
		let depth = 0; // brace depth; stop at ';' only when not inside braces
		let startedInBrace = false; // true once we cross a '{' at depth 0 — the statement is a compound block
		let inString = false;
		let stringQuote = '';
		let inBlockComment = false;
		let inLineComment = false;

		while (i < len) {
			const ch = text[i];
			const next = text[i + 1];

			if (inLineComment) {
				if (ch === '\n') inLineComment = false;
				i++;
				continue;
			}
			if (inBlockComment) {
				if (ch === '*' && next === '/') { inBlockComment = false; i += 2; continue; }
				i++;
				continue;
			}
			if (inString) {
				if (ch === '\\') { i += 2; continue; } // skip escaped char
				else if (ch === stringQuote) inString = false;
				i++;
				continue;
			}

			if (ch === '/' && next === '/') { inLineComment = true; i += 2; continue; }
			if (ch === '/' && next === '*') { inBlockComment = true; i += 2; continue; }
			if (ch === '"' || ch === "'") { inString = true; stringQuote = ch; i++; continue; }
			if (ch === '{') { if (depth === 0) startedInBrace = true; depth++; i++; continue; }
			if (ch === '}') {
				depth = Math.max(0, depth - 1);
				if (depth === 0 && startedInBrace) return i + 1; // offset just after the compound statement's '}'
				i++;
				continue;
			}
			if (ch === ';' && depth === 0) return i + 1; // offset just after ';'
			i++;
		}

		// No terminating semicolon found: end at the end of the current line or block.
		const nl = text.indexOf('\n', i);
		return nl === -1 ? len : nl;
	}

	/** Find the offset of the matching closing brace for an opening brace at `openOffset`. */
	static matchingCloseBrace(text: string, openOffset: number): number {
		const len = text.length;
		let depth = 0;
		let i = openOffset;
		let inString = false;
		let stringQuote = '';
		let inBlockComment = false;
		let inLineComment = false;
		while (i < len) {
			const ch = text[i];
			const next = text[i + 1];
			if (inLineComment) { if (ch === '\n') inLineComment = false; i++; continue; }
			if (inBlockComment) { if (ch === '*' && next === '/') { inBlockComment = false; i += 2; continue; } i++; continue; }
			if (inString) { if (ch === '\\') { i += 2; continue; } if (ch === stringQuote) inString = false; i++; continue; }
			if (ch === '/' && next === '/') { inLineComment = true; i += 2; continue; }
			if (ch === '/' && next === '*') { inBlockComment = true; i += 2; continue; }
			if (ch === '"' || ch === "'") { inString = true; stringQuote = ch; i++; continue; }
			if (ch === '{') { depth++; i++; continue; }
			if (ch === '}') { depth--; if (depth === 0) return i + 1; i++; continue; }
			i++;
		}
		return len;
	}

	// ------------------------------------------------------------------
	// SourceRange helpers
	// ------------------------------------------------------------------

	/**
	 * Resolve a `SourceRange` (possibly partial) into a 0-based [start, end)
	 * offset pair. Missing boundaries fall back to the other boundary or zero.
	 */
	static rangeOffsets(text: string, range?: SourceRange): [number, number] {
		const beginLine = range?.begin?.line;
		const beginCol = range?.begin?.col;
		const endLine = range?.end?.line;
		const endCol = range?.end?.col;

		const start = (beginLine != null) ? this.lineColToOffset(text, beginLine, beginCol != null ? beginCol : 1) : 0;
		const end = (endLine != null) ? this.lineColToOffset(text, endLine, endCol != null ? endCol : 1) : start;
		return [Math.min(start, text.length), Math.min(Math.max(end, start), text.length)];
	}

	// ------------------------------------------------------------------
	// Patch primitives
	// ------------------------------------------------------------------

	/**
	 * Apply a single edit to source text. Edits must be non-overlapping if
	 * multiple are applied; callers are responsible for ordering.
	 */
	static applyEdit(text: string, edit: SourceEdit): string {
		const start = Math.max(0, Math.min(edit.start, text.length));
		const end = Math.max(start, Math.min(edit.end, text.length));
		return text.slice(0, start) + edit.newText + text.slice(end);
	}

	/**
	 * Insert `code` immediately after the statement that contains `range.end`,
	 * on its own line. Returns the patched source and the highlighted lines.
	 */
	static insertAfterStatement(text: string, range: SourceRange, code: string): PatchResult {
		const [, end] = this.rangeOffsets(text, range);
		const insertAt = this.statementEndOffset(text, end);
		const indentation = this.lineIndentation(text, insertAt);
		const newText = `\n${indentation}${code}`;
		const edit: SourceEdit = { start: insertAt, end: insertAt, newText };
		const source = this.applyEdit(text, edit);
		return { source, edit, highlighted: this.highlightInserted(source, insertAt, newText) };
	}

	/**
	 * Insert `code` at the start of the scope (right after the opening `{`) described
	 * by `range`, or at `range.start` if no braces are present.
	 */
	static insertAtScopeStart(text: string, range: SourceRange, code: string): PatchResult {
		const [start] = this.rangeOffsets(text, range);
		let insertAt = start;
		const open = text.indexOf('{', start);
		// Search up to the end of the line containing `start` so a signature
		// range whose reported end lands just before the `{` still finds it.
		const lineEnd = text.indexOf('\n', start);
		const searchEnd = lineEnd === -1 ? text.length : lineEnd;
		if (open !== -1 && open <= searchEnd) {
			insertAt = open + 1;
		}
		const indentation = this.lineIndentation(text, insertAt);
		const newText = `\n${indentation}${code}`;
		const edit: SourceEdit = { start: insertAt, end: insertAt, newText };
		const source = this.applyEdit(text, edit);
		return { source, edit, highlighted: this.highlightInserted(source, insertAt, newText) };
	}

	/**
	 * Insert `code` at the end of the scope (right before the closing `}`) described
	 * by `range`, on its own line.
	 */
	static insertAtScopeEnd(text: string, range: SourceRange, code: string): PatchResult {
		const [start] = this.rangeOffsets(text, range);
		// Find the opening brace of the scope that contains the range start
		const open = text.indexOf('{', start);
		let insertAt = start;
		let indent = '';
		if (open !== -1) {
			const close = this.matchingCloseBrace(text, open);
			if (close !== -1 && close > open && close <= text.length) {
				// `close` is the offset just past the `}`. Place the insertion at the
				// start of the line containing the `}` so the code lands on its own
				// line and the brace stays on the next line.
				const braceIdx = close - 1; // offset of the `}` itself
				const braceLineStart = text.lastIndexOf('\n', braceIdx) + 1;
				insertAt = braceLineStart;
				// Indentation should match the closing brace's own line.
				const braceLine = text.slice(braceLineStart, braceIdx);
				const m = braceLine.match(/^[ \t]*/);
				indent = m ? m[0] : '';
			}
		}
		const newText = `${indent}${code}\n`;
		const edit: SourceEdit = { start: insertAt, end: insertAt, newText };
		const source = this.applyEdit(text, edit);
		return { source, edit, highlighted: this.highlightInserted(source, insertAt, newText) };
	}

	/**
	 * Compute the 1-based line range of code that was just inserted. The leading
	 * newlines in `newText` shift the code onto the following line(s) of the
	 * already-patched `source`, so we measure against the final text.
	 */
	private static highlightInserted(source: string, insertAt: number, newText: string): HighlightedLines {
		const leading = (newText.match(/^\n*/) || [''])[0].length;
		const codeStart = insertAt + leading;
		const pos = this.offsetToPosition(source, codeStart);
		const codeLines = newText.replace(/^\n+/, '').replace(/\n+$/, '').split('\n').length;
		return { startLine: pos.line + 1, endLine: pos.line + codeLines };
	}

	// ------------------------------------------------------------------
	// AST-guided helpers
	// ------------------------------------------------------------------

	/**
	 * Find the innermost AST node whose range contains the given 1-based line.
	 * Falls back to the root node when nothing matches.
	 */
	static findNodeAtLine(root: ASTNode, line: number): ASTNode | null {
		let best: ASTNode | null = null;
		const visit = (node: ASTNode) => {
			if (!node || typeof node !== 'object') return;
			const r = node.range;
			const bLine = r?.begin?.line;
			const eLine = r?.end?.line;
			if (bLine != null && eLine != null && line >= bLine && line <= eLine) {
				if (!best || (bLine >= (best.range?.begin?.line ?? -1))) best = node;
			}
			if (Array.isArray(node.inner)) {
				for (const child of node.inner) visit(child);
			}
		};
		visit(root);
		return best ?? root;
	}

	/**
	 * Collect all descendant nodes matching a predicate (delegates to recursive traversal).
	 */
	static findAll(root: ASTNode, predicate: (n: ASTNode) => boolean): ASTNode[] {
		const results: ASTNode[] = [];
		const visit = (node: ASTNode) => {
			if (!node || typeof node !== 'object') return;
			if (predicate(node)) results.push(node);
			if (Array.isArray(node.inner)) {
				for (const child of node.inner) visit(child);
			}
		};
		visit(root);
		return results;
	}

	/**
	 * Return the whitespace indentation of the line on which `offset` sits.
	 */
	private static lineIndentation(text: string, offset: number): string {
		const pos = this.offsetToPosition(text, offset);
		const lineStart = this.positionToOffset(text, { line: pos.line, character: 0 });
		const line = text.slice(lineStart);
		const match = line.match(/^[ \t]*/);
		return match ? match[0] : '';
	}
}
