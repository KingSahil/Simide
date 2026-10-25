import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export interface SourceRange {
    begin?: { line?: number; col?: number; file?: string };
    end?: { line?: number; col?: number; file?: string };
}

export interface ASTNode {
    kind?: string;
    name?: string;
    type?: { qualType?: string; desugaredQualType?: string };
    range?: SourceRange;
    isThisDeclarationADefinition?: boolean;
    inner?: ASTNode[];
    [key: string]: any;
}

export interface ParseOptions {
    includeDirs?: string[];
    defines?: string[];
    flags?: string[];
    std?: string;
    clangPath?: string;
}

export class ClangAstParser {
    private cache = new Map<string, { mtime: number; ast: ASTNode }>();

    async findClang(): Promise<string> {
        const candidates = ['clang++', 'clang', '/usr/bin/clang++', '/usr/bin/clang'];
        for (const c of candidates) {
            try {
                await execFileAsync(c, ['--version'], { timeout: 5000 });
                return c;
            } catch {
                // try next
            }
        }
        throw new Error('Clang is not installed or not on PATH. Install clang/clang++ to enable AST-based source analysis.');
    }

    async parseFile(filePath: string, options: ParseOptions = {}): Promise<ASTNode> {
        const abs = path.resolve(filePath);
        if (!fs.existsSync(abs)) {
            throw new Error(`Source file not found: ${abs}`);
        }
        const stat = fs.statSync(abs);
        const cacheKey = abs + JSON.stringify(options);
        const cached = this.cache.get(cacheKey);
        if (cached && cached.mtime === stat.mtimeMs) {
            return cached.ast;
        }

        const clang = options.clangPath || await this.findClang();
        const args: string[] = [
            '-Xclang', '-ast-dump=json',
            '-fsyntax-only',
            `--std=${options.std || 'c++17'}`,
        ];
        for (const inc of options.includeDirs || []) {
            args.push(`-I${inc}`);
        }
        for (const def of options.defines || []) {
            args.push(`-D${def}`);
        }
        for (const f of options.flags || []) {
            args.push(f);
        }
        args.push(abs);

        let stdout: string;
        let stderr: string;
        try {
            const res = await execFileAsync(clang, args, { timeout: 60000, maxBuffer: 50 * 1024 * 1024 });
            stdout = res.stdout;
            stderr = res.stderr;
        } catch (err: any) {
            if (err.stdout) {
                stdout = err.stdout;
            } else {
                throw new Error(`Clang execution failed: ${err.message}${err.stderr ? '\n' + err.stderr : ''}`);
            }
            stderr = err.stderr || '';
        }

        if (stderr && stderr.trim().length > 0) {
            // Report compiler errors but still try to parse partial output
            // If no stdout, throw
            if (!stdout || !stdout.trim()) {
                throw new Error(`Clang reported errors:\n${stderr}`);
            }
        }

        let parsed: ASTNode;
        try {
            parsed = JSON.parse(stdout);
        } catch (e: any) {
            throw new Error(`Failed to parse Clang AST JSON: ${e.message}`);
        }

        this.cache.set(cacheKey, { mtime: stat.mtimeMs, ast: parsed });
        return parsed;
    }

    isLocalNode(node: ASTNode, filePath: string): boolean {
        const abs = path.resolve(filePath);
        const locFile = node?.range?.begin?.file || node?.loc?.file || '';
        if (!locFile) return true;
        try {
            return path.resolve(locFile) === abs;
        } catch {
            return locFile.includes(path.basename(abs));
        }
    }

    queryNodes(root: ASTNode, predicate: (n: ASTNode) => boolean): ASTNode[] {
        const results: ASTNode[] = [];
        const visit = (node: ASTNode) => {
            if (!node || typeof node !== 'object') return;
            if (predicate(node)) results.push(node);
            if (Array.isArray(node.inner)) {
                for (const c of node.inner) visit(c);
            }
        };
        visit(root);
        return results;
    }

    invalidateCache(filePath?: string) {
        if (!filePath) {
            this.cache.clear();
            return;
        }
        const abs = path.resolve(filePath);
        for (const key of this.cache.keys()) {
            if (key.startsWith(abs)) this.cache.delete(key);
        }
    }
}
