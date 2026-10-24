import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  ArrayElement,
  ArrayVariable,
  IndexPointer,
  LinkedListSnapshot,
  ListNode,
  PointerVariable,
  SourceLocation,
  StackElement,
  StackModel,
  StructureType,
} from '../visualization/linkedListModel';
import { ExplanationGenerator } from '../visualization/explanationGenerator';

export class StateExtractor {
  private static addressToIdMap = new Map<string, string>();
  private static nextIdCounter = 1;
  private static activeSourceFile: string | null = null;
  private static lastPausedLine: number | null = null;
  private static deletedAddresses = new Set<string>();
  private static cachedDataField: string | null = null;
  private static cachedNextField: string | null = null;
  private static cachedLeftField: string | null = null;
  private static cachedRightField: string | null = null;
  private static cachedStructureType: StructureType | null = null;
  private static cachedStackTopExpr: string | null = null;
  private static cachedStackCapExpr: string | null = null;
  private static cachedStackArrExpr: string | null = null;
  private static accumulatedTerminalOutput: string = '';
  private static hasInitializedList: boolean = false;

  public static setActiveSourceFile(filePath: string): void {
    this.activeSourceFile = filePath;
  }

  public static getAccumulatedTerminalOutput(): string {
    return this.accumulatedTerminalOutput;
  }

  public static appendDapOutput(_text: string): void {
    // Intentionally no-op: pure cout/printf statements in student code generate terminal output.
    // This completely cuts off any GDB banner, copyright, thread, or debugger chatter.
  }

  public static reset(): void {
    this.addressToIdMap.clear();
    this.nextIdCounter = 1;
    this.lastPausedLine = null;
    this.deletedAddresses.clear();
    this.cachedDataField = null;
    this.cachedNextField = null;
    this.cachedLeftField = null;
    this.cachedRightField = null;
    this.cachedStructureType = null;
    this.cachedStackTopExpr = null;
    this.cachedStackCapExpr = null;
    this.cachedStackArrExpr = null;
    this.accumulatedTerminalOutput = '';
    this.hasInitializedList = false;
  }

  public static resolveFilePath(sourceFilePath?: string): string | null {
    if (sourceFilePath && fs.existsSync(sourceFilePath)) {
      return sourceFilePath;
    }
    if (this.activeSourceFile && fs.existsSync(this.activeSourceFile)) {
      return this.activeSourceFile;
    }

    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      const root = folders[0].uri.fsPath;
      const base = sourceFilePath ? path.basename(sourceFilePath) : 'linked-list.cpp';
      const candidates = [
        path.join(root, 'examples', base),
        path.join(root, base),
        path.join(root, 'examples', 'linked-list.cpp'),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          return c;
        }
      }
    }
    return null;
  }

  public static isUserSource(filePath?: string): boolean {
    if (!filePath) return false;
    const norm = filePath.replace(/\\/g, '/').toLowerCase();
    // Exclude CRT, MinGW, standard library headers, Windows system libraries
    if (
      norm.includes('/include/c++/') ||
      norm.includes('/mingw') ||
      norm.includes('crt') ||
      norm.includes('startup') ||
      norm.includes('<built-in>') ||
      norm.includes('/bits/') ||
      norm.includes('/ext/') ||
      norm.includes('ostream') ||
      norm.includes('istream') ||
      norm.includes('streambuf')
    ) {
      return false;
    }
    if (this.activeSourceFile) {
      const activeNorm = this.activeSourceFile.replace(/\\/g, '/').toLowerCase();
      if (norm === activeNorm || norm.endsWith('/' + path.basename(activeNorm))) {
        return true;
      }
    }
    const folders = vscode.workspace.workspaceFolders;
    if (folders) {
      for (const f of folders) {
        const rootNorm = f.uri.fsPath.replace(/\\/g, '/').toLowerCase();
        if (norm.startsWith(rootNorm)) {
          return true;
        }
      }
    }
    return !norm.includes('/mingw') && !norm.includes('crt');
  }

  public static getLineText(filePath: string, lineNum: number): string {
    const resolved = this.resolveFilePath(filePath);
    if (!resolved) return '';
    try {
      const content = fs.readFileSync(resolved, 'utf8');
      const lines = content.split('\n');
      if (lineNum >= 1 && lineNum <= lines.length) {
        return lines[lineNum - 1].trim();
      }
    } catch {
      // ignore
    }
    return '';
  }

  public static discoverNodeTypes(resolvedPath?: string): Set<string> {
    const types = new Set<string>([
      'Node',
      'ListNode',
      'LinkNode',
      'LinkedListNode',
      'SinglyLinkedListNode',
      'DoublyLinkedListNode',
      'TreeNode',
      'BSTNode',
      'BinaryTreeNode',
      'Tree_node',
      'treenode',
      'Node_t',
      'Item',
      'Element',
      'node',
      'listnode',
    ]);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      return types;
    }
    try {
      const content = fs.readFileSync(resolvedPath, 'utf8');
      const structMatches = content.matchAll(/(?:struct|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g);
      for (const m of structMatches) {
        types.add(m[1]);
      }
    } catch {
      // ignore
    }
    return types;
  }

  public static discoverArrayDeclarations(resolvedPath?: string): Array<{
    name: string;
    line: number;
    size?: number;
    type: string;
    isDynamic: boolean;
  }> {
    const arrays: Array<{
      name: string;
      line: number;
      size?: number;
      type: string;
      isDynamic: boolean;
    }> = [];
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      return arrays;
    }
    try {
      const content = fs.readFileSync(resolvedPath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineNum = i + 1;
        if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('#')) {
          continue;
        }

        // 1. Stack array: int arr[5] or int arr[] = {1, 2, 3};
        const stackMatch = line.match(
          /(?:(?:const\s+)?(?:int|long|short|char|double|float|string|bool|uint\d+_t|int\d+_t))\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\[\s*([^\]]*)\s*\]/
        );
        if (stackMatch) {
          const name = stackMatch[1];
          const sizeStr = stackMatch[2]?.trim();
          let parsedSize = sizeStr ? parseInt(sizeStr, 10) : undefined;
          if (parsedSize === undefined || isNaN(parsedSize)) {
            const initMatch = line.match(/=\s*\{([^}]+)\}/);
            if (initMatch) {
              const elements = initMatch[1].split(',').filter((s) => s.trim().length > 0);
              parsedSize = elements.length;
            }
          }
          arrays.push({
            name,
            line: lineNum,
            size: parsedSize && !isNaN(parsedSize) ? parsedSize : undefined,
            type: 'stack_array',
            isDynamic: false,
          });
          continue;
        }

        // 2. Dynamic array: int* arr = new int[5];
        const dynMatch = line.match(
          /(?:int|long|short|char|double|float|string|bool)\s*\*\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*new\s+(?:int|long|short|char|double|float|string|bool)\s*\[\s*([^\]]+)\s*\]/
        );
        if (dynMatch) {
          const name = dynMatch[1];
          const sizeExpr = dynMatch[2].trim();
          const parsedSize = parseInt(sizeExpr, 10);
          arrays.push({
            name,
            line: lineNum,
            size: !isNaN(parsedSize) ? parsedSize : undefined,
            type: 'dynamic_array',
            isDynamic: true,
          });
          continue;
        }

        // 3. Vector: vector<int> arr; or std::vector<int> arr = {...};
        const vecMatch = line.match(
          /(?:std::)?vector\s*<\s*[^>]+\s*>\s*([a-zA-Z_][a-zA-Z0-9_]*)/
        );
        if (vecMatch) {
          const name = vecMatch[1];
          arrays.push({
            name,
            line: lineNum,
            type: 'vector',
            isDynamic: true,
          });
          continue;
        }
      }
    } catch {
      // ignore
    }
    return arrays;
  }

  public static getUserDefinedFunctions(sourceFilePath?: string): Set<string> {
    const resolvedPath = this.resolveFilePath(sourceFilePath) || sourceFilePath || '';
    const funcNames = new Set<string>();
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      return funcNames;
    }
    try {
      const content = fs.readFileSync(resolvedPath, 'utf8');
      const lines = content.split('\n');
      const nodeTypes = this.discoverNodeTypes(resolvedPath);

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
          continue;
        }

        // Match free functions or class member functions:
        // [return_type] [func_name]([args]) [{ or : or newline]
        const fnMatch = trimmed.match(
          /^(?:[a-zA-Z_][a-zA-Z0-9_:*&<>\s]+\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*(?:const\s*)?(?:\{|:\s*|;|$)/
        );
        if (fnMatch) {
          const name = fnMatch[1];
          if (
            name !== 'main' &&
            name !== 'if' &&
            name !== 'while' &&
            name !== 'for' &&
            name !== 'switch' &&
            name !== 'catch' &&
            name !== 'return' &&
            name !== 'sizeof' &&
            name !== 'void' &&
            !nodeTypes.has(name)
          ) {
            funcNames.add(name);
          }
        }
      }
    } catch {
      // ignore
    }
    return funcNames;
  }

  public static parseStructMembers(resolvedPath?: string): {
    dataField: string;
    nextField: string;
    leftField: string;
    rightField: string;
    structureType: StructureType;
  } {
    let dataField = 'data';
    let nextField = 'next';
    let leftField = 'left';
    let rightField = 'right';
    let structureType: StructureType = 'linked_list';
    let hasNodePointer = false;

    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      return { dataField, nextField, leftField, rightField, structureType };
    }
    try {
      const content = fs.readFileSync(resolvedPath, 'utf8');
      const structMatches = content.matchAll(/(?:struct|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g);
      for (const sm of structMatches) {
        const structName = sm[1];
        const isTreeNamed = /tree|bst/i.test(structName);

        const structIdx = sm.index ?? content.indexOf(sm[0]);
        const startBrace = content.indexOf('{', structIdx);
        if (startBrace === -1) continue;

        let depth = 1;
        let endBrace = -1;
        for (let i = startBrace + 1; i < content.length; i++) {
          if (content[i] === '{') depth++;
          else if (content[i] === '}') {
            depth--;
            if (depth === 0) {
              endBrace = i;
              break;
            }
          }
        }
        if (endBrace === -1) continue;

        const body = content.substring(startBrace + 1, endBrace);
        // Find all pointer members: e.g. TreeNode* left; Node *right;
        const ptrMatches = Array.from(
          body.matchAll(/(?:(?:struct\s+)?(?:[a-zA-Z_][a-zA-Z0-9_]*|<[a-zA-Z0-9_,\s]+>)\s*\*+|\*+\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*;/g)
        ).map((m) => m[1]);

        const hasLeft = ptrMatches.find((p) =>
          ['left', 'lchild', 'left_node', 'lc', 'pleft', 'l'].includes(p.toLowerCase())
        );
        const hasRight = ptrMatches.find((p) =>
          ['right', 'rchild', 'right_node', 'rc', 'pright', 'r'].includes(p.toLowerCase())
        );
        const hasNext = ptrMatches.find((p) =>
          ['next', 'next_node', 'link', 'ptr', 'pnext', 'nxt'].includes(p.toLowerCase())
        );

        if (hasLeft || hasRight || isTreeNamed) {
          structureType = 'tree';
          hasNodePointer = true;
          if (hasLeft) leftField = hasLeft;
          if (hasRight) rightField = hasRight;
        } else if (hasNext) {
          structureType = 'linked_list';
          hasNodePointer = true;
          nextField = hasNext;
        }

        const dataMatches = body.matchAll(
          /(?:int|long|short|char|string|double|float|T|uint[0-9]+_t|int[0-9]+_t|auto)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*;/g
        );
        for (const dm of dataMatches) {
          const fn = dm[1];
          if (
            fn !== nextField &&
            fn !== leftField &&
            fn !== rightField &&
            fn !== 'prev' &&
            fn !== 'previous'
          ) {
            dataField = fn;
            break;
          }
        }

        if (dataField && (hasLeft || hasRight || hasNext)) {
          break;
        }
      }

      // If no linked list or tree struct was found, check if this is a stack or array file
      if (!hasNodePointer) {
        const content = fs.readFileSync(resolvedPath, 'utf8');
        const isStack =
          content.includes('<stack>') ||
          /(?:class|struct)\s+(?:Array)?Stack/i.test(content) ||
          /\bstack\s*<\s*[^>]+\s*>/i.test(content) ||
          (/\btop\b/i.test(content) && (/\bpush\b/i.test(content) || /\bpop\b/i.test(content)));

        if (isStack) {
          structureType = 'stack';
        } else {
          const arrayDecls = this.discoverArrayDeclarations(resolvedPath);
          if (arrayDecls.length > 0) {
            structureType = 'array';
          }
        }
      }
    } catch {
      // ignore
    }
    return { dataField, nextField, leftField, rightField, structureType };
  }

  public static getVariableDeclarations(sourceFilePath?: string): Map<string, number[]> {
    const resolvedPath = this.resolveFilePath(sourceFilePath) || sourceFilePath || '';
    const map = new Map<string, number[]>();
    try {
      if (fs.existsSync(resolvedPath)) {
        const content = fs.readFileSync(resolvedPath, 'utf8');
        const lines = content.split('\n');
        const nodeTypes = this.discoverNodeTypes(resolvedPath);
        const typePattern = Array.from(nodeTypes).join('|');
        const declRegex = new RegExp(
          `(?:(?:struct\\s+)?(?:${typePattern})\\s*(?:\\*\\s*&?|&\\s*\\*?)|auto\\s*\\*?|,\\s*(?:\\*\\s*&?|&\\s*\\*?))\\s*([a-zA-Z_][a-zA-Z0-9_]*)`,
          'g'
        );

        let inStructDef = false;
        let braceDepth = 0;

        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i].trim();
          const lineNum = i + 1;

          // Ignore struct / class bodies so struct member pointers aren't treated as local variables
          if (lineText.match(/^(?:struct|class)\s+[a-zA-Z_]/)) {
            inStructDef = true;
          }
          if (inStructDef) {
            if (lineText.includes('{')) braceDepth++;
            if (lineText.includes('}')) {
              braceDepth--;
              if (braceDepth <= 0) {
                inStructDef = false;
                braceDepth = 0;
              }
            }
            continue;
          }

          // Skip pure member assignments without declarations (e.g. first->next = second;)
          if (
            (lineText.startsWith('.') || /^[a-zA-Z_][a-zA-Z0-9_]*->/.test(lineText)) &&
            !lineText.includes('auto') &&
            !Array.from(nodeTypes).some((t) => lineText.startsWith(t))
          ) {
            continue;
          }

          const matches = lineText.matchAll(declRegex);
          for (const match of matches) {
            const varName = match[1];
            if (
              varName === 'nullptr' ||
              varName === 'NULL' ||
              varName === 'return' ||
              varName === 'new'
            ) {
              continue;
            }
            if (!map.has(varName)) {
              map.set(varName, []);
            }
            map.get(varName)!.push(lineNum);
          }
        }
      }
    } catch {
      // ignore
    }
    return map;
  }

  public static getFunctionRanges(
    resolvedPath?: string
  ): Array<{ name: string; startLine: number; endLine: number; params?: string[] }> {
    const ranges: Array<{ name: string; startLine: number; endLine: number; params?: string[] }> = [];
    if (!resolvedPath || !fs.existsSync(resolvedPath)) return ranges;

    try {
      const content = fs.readFileSync(resolvedPath, 'utf8');
      const lines = content.split('\n');

      let currentFunc: { name: string; startLine: number; params?: string[] } | null = null;
      let depth = 0;
      let inStruct = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        const lineNum = i + 1;

        if (trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
          continue;
        }

        if (trimmed.match(/^(?:struct|class)\s+[a-zA-Z_]/)) {
          inStruct = true;
        }
        if (inStruct) {
          if (trimmed.includes('{')) depth++;
          if (trimmed.includes('}')) {
            depth--;
            if (depth <= 0) {
              inStruct = false;
              depth = 0;
            }
          }
          continue;
        }

        if (!currentFunc) {
          const fnMatch = trimmed.match(
            /^(?:[a-zA-Z_][a-zA-Z0-9_:*&<>\s]+\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(?:const\s*)?\{?/
          );
          if (fnMatch) {
            const name = fnMatch[1];
            if (
              name !== 'if' &&
              name !== 'while' &&
              name !== 'for' &&
              name !== 'switch' &&
              name !== 'catch' &&
              name !== 'sizeof'
            ) {
              const paramStr = fnMatch[2] || '';
              const params: string[] = [];
              if (paramStr.trim()) {
                const parts = paramStr.split(',');
                for (const part of parts) {
                  const pMatch = part.trim().match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*$/);
                  if (pMatch) {
                    params.push(pMatch[1]);
                  }
                }
              }
              currentFunc = { name, startLine: lineNum, params };
              depth = 0;
            }
          } else {
            // Check for multi-line function declaration header starting on this line
            const multiLineMatch = trimmed.match(
              /^(?:[a-zA-Z_][a-zA-Z0-9_:*&<>\s]+\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)$/
            );
            if (multiLineMatch) {
              const name = multiLineMatch[1];
              if (
                name !== 'if' &&
                name !== 'while' &&
                name !== 'for' &&
                name !== 'switch' &&
                name !== 'catch' &&
                name !== 'sizeof'
              ) {
                let paramStr = multiLineMatch[2] || '';
                let j = i + 1;
                while (j < lines.length) {
                  const nextLine = lines[j].trim();
                  const closeParenIdx = nextLine.indexOf(')');
                  if (closeParenIdx !== -1) {
                    paramStr += ' ' + nextLine.substring(0, closeParenIdx);
                    break;
                  } else {
                    paramStr += ' ' + nextLine;
                  }
                  j++;
                }
                const params: string[] = [];
                if (paramStr.trim()) {
                  const parts = paramStr.split(',');
                  for (const part of parts) {
                    const pMatch = part.trim().match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*$/);
                    if (pMatch) {
                      params.push(pMatch[1]);
                    }
                  }
                }
                currentFunc = { name, startLine: lineNum, params };
                depth = 0;
              }
            }
          }
        }

        if (currentFunc) {
          for (let c = 0; c < line.length; c++) {
            if (line[c] === '{') depth++;
            else if (line[c] === '}') {
              depth--;
              if (depth <= 0) {
                ranges.push({
                  name: currentFunc.name,
                  startLine: currentFunc.startLine,
                  endLine: lineNum,
                  params: currentFunc.params || [],
                });
                currentFunc = null;
                depth = 0;
                break;
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }

    return ranges;
  }

  public static getEnclosingFunction(
    resolvedPath: string | undefined,
    line: number
  ): { name: string; startLine: number; endLine: number; params?: string[] } | null {
    const ranges = this.getFunctionRanges(resolvedPath);
    return ranges.find((r) => line >= r.startLine && line <= r.endLine) || null;
  }

  public static isVariableInitialized(
    varName: string,
    rawLine: number,
    varDecls: Map<string, number[]>,
    funcRange: { name: string; startLine: number; endLine: number; params?: string[] } | null
  ): boolean {
    if (funcRange?.params?.includes(varName)) {
      return rawLine >= funcRange.startLine;
    }

    const declLines = varDecls.get(varName);
    if (!declLines || declLines.length === 0) {
      return false;
    }

    // Filter declarations to only those within the current function
    const relevantDecls = funcRange
      ? declLines.filter((l) => l >= funcRange.startLine && l <= funcRange.endLine)
      : declLines;

    if (relevantDecls.length === 0) {
      // If the variable belongs to this frame's scope but has no local declaration inside the function body,
      // it is a function parameter/argument passed by caller and is initialized upon function entry.
      return funcRange ? rawLine >= funcRange.startLine : true;
    }

    // For function parameter declarations (on or before function header), they are initialized on entry.
    // For local variable declarations in the function body, execution must have stepped past the line.
    return relevantDecls.some((l) => (funcRange && l <= funcRange.startLine ? rawLine >= l : rawLine > l));
  }

  public static hasSteppedPastFirstPointerDecl(
    rawLine: number,
    varDecls: Map<string, number[]>,
    funcRange: { name: string; startLine: number; endLine: number; params?: string[] } | null
  ): boolean {
    if (!funcRange) return true;
    const declsInFunc: number[] = [];
    for (const lines of varDecls.values()) {
      for (const l of lines) {
        if (l >= funcRange.startLine && l <= funcRange.endLine) {
          declsInFunc.push(l);
        }
      }
    }
    if (declsInFunc.length === 0) {
      return true;
    }
    const minDeclLine = Math.min(...declsInFunc);
    return rawLine > minDeclLine;
  }

  public static getVariableInitLines(sourceFilePath?: string): Map<string, number> {
    const decls = this.getVariableDeclarations(sourceFilePath);
    const map = new Map<string, number>();
    for (const [k, v] of decls.entries()) {
      if (v.length > 0) {
        map.set(k, v[0]);
      }
    }
    return map;
  }

  private static getStableId(address: string): string {
    const norm = address.toLowerCase();
    if (!this.addressToIdMap.has(norm)) {
      this.addressToIdMap.set(norm, `node_${this.nextIdCounter++}`);
    }
    return this.addressToIdMap.get(norm)!;
  }

  public static parsePointer(valStr?: string | null): string | null {
    if (!valStr) return null;
    let s = valStr.trim();
    // In C++ references to pointers, GDB produces: (Node *&) @0x16fdee0: 0x7da3a0
    // The target address is after the colon!
    if (s.includes(':')) {
      s = s.substring(s.lastIndexOf(':') + 1).trim();
    }
    if (
      s === '0x0' ||
      s === 'nullptr' ||
      s === '0' ||
      s.includes('0x0 <') ||
      s.includes('nullptr') ||
      s.includes('NULL') ||
      s.includes('0x00000000') ||
      s.includes('(nil)') ||
      s.includes('error') ||
      s.includes('Cannot access') ||
      s.includes('No symbol') ||
      s.includes('not defined') ||
      s.includes('optimized out') ||
      s.includes('incomplete') ||
      s.includes('baadf00d') ||
      s.includes('cccccccc') ||
      s.includes('cdcdcdcd') ||
      s.includes('feeefeee') ||
      s.includes('abababab')
    ) {
      return null;
    }
    const match = s.match(/0x[0-9a-fA-F]+/);
    if (match && match[0] !== '0x0' && match[0] !== '0x00000000') {
      return match[0].toLowerCase();
    }
    return null;
  }

  private static parseData(valStr?: string | null): number | string {
    if (!valStr) return 0;
    // Reject GDB error strings — they must never appear as node data
    if (
      valStr.includes('-var-create') ||
      valStr.includes('unable to create') ||
      valStr.includes('error:') ||
      valStr.includes('Error:') ||
      valStr.includes('Cannot access') ||
      valStr.includes('No symbol') ||
      valStr.includes('has no member') ||
      valStr.includes('not defined') ||
      valStr.includes('optimized out') ||
      valStr.includes('incomplete')
    ) {
      return 0;
    }
    const match = valStr.match(/-?\d+/);
    if (match) {
      const n = parseInt(match[0], 10);
      // Filter out debug heap fill patterns for uninitialized memory:
      // -1163005939 (0xbaadf00d), -858993460 (0xcccccccc), -842150451 (0xcdcdcdcd), -17895697 (0xfeeefeee)
      if (
        n === -1163005939 ||
        n === -858993460 ||
        n === -842150451 ||
        n === -17895697 ||
        n < -10000000 ||
        n > 100000000
      ) {
        return 0;
      }
      return n;
    }
    return valStr.trim();
  }

  public static isValidEvalNumber(res: string | null): boolean {
    if (!res) return false;
    const lower = res.toLowerCase();
    if (
      lower.includes('error') ||
      lower.includes('no symbol') ||
      lower.includes('cannot access') ||
      lower.includes('unable to create') ||
      lower.includes('-var-create') ||
      lower.includes('has no member') ||
      lower.includes('not defined') ||
      lower.includes('optimized out') ||
      lower.includes('incomplete')
    ) {
      return false;
    }
    return /-?\d+/.test(res);
  }

  private static async resolveDataField(
    evalExpr: (expr: string) => Promise<string | null>,
    ptrExpr: string
  ): Promise<string> {
    if (this.cachedDataField) return this.cachedDataField;
    const candidates = ['data', 'val', 'value', 'item', 'key', 'element', 'info', 'payload', 'num', 'x', 'd'];
    for (const c of candidates) {
      const res = await evalExpr(`${ptrExpr}->${c}`);
      if (
        res !== null &&
        !res.includes('has no member') &&
        !res.includes('error') &&
        !res.includes('Cannot access') &&
        !res.includes('not defined') &&
        !res.includes('No symbol')
      ) {
        this.cachedDataField = c;
        return c;
      }
    }
    return 'data';
  }

  private static async resolveNextField(
    evalExpr: (expr: string) => Promise<string | null>,
    ptrExpr: string
  ): Promise<string> {
    if (this.cachedNextField) return this.cachedNextField;
    const candidates = ['next', 'next_node', 'link', 'ptr', 'pNext', 'nxt', 'succ'];
    for (const c of candidates) {
      const res = await evalExpr(`${ptrExpr}->${c}`);
      if (
        res !== null &&
        !res.includes('has no member') &&
        !res.includes('error') &&
        !res.includes('Cannot access') &&
        !res.includes('not defined') &&
        !res.includes('No symbol')
      ) {
        this.cachedNextField = c;
        return c;
      }
    }
    return 'next';
  }

  private static async resolveLeftField(
    evalExpr: (expr: string) => Promise<string | null>,
    ptrExpr: string
  ): Promise<string> {
    if (this.cachedLeftField) return this.cachedLeftField;
    const candidates = ['left', 'lchild', 'left_node', 'lc', 'pLeft', 'l'];
    for (const c of candidates) {
      const res = await evalExpr(`${ptrExpr}->${c}`);
      if (
        res !== null &&
        !res.includes('has no member') &&
        !res.includes('error') &&
        !res.includes('Cannot access') &&
        !res.includes('not defined') &&
        !res.includes('No symbol')
      ) {
        this.cachedLeftField = c;
        return c;
      }
    }
    return 'left';
  }

  private static async resolveRightField(
    evalExpr: (expr: string) => Promise<string | null>,
    ptrExpr: string
  ): Promise<string> {
    if (this.cachedRightField) return this.cachedRightField;
    const candidates = ['right', 'rchild', 'right_node', 'rc', 'pRight', 'r'];
    for (const c of candidates) {
      const res = await evalExpr(`${ptrExpr}->${c}`);
      if (
        res !== null &&
        !res.includes('has no member') &&
        !res.includes('error') &&
        !res.includes('Cannot access') &&
        !res.includes('not defined') &&
        !res.includes('No symbol')
      ) {
        this.cachedRightField = c;
        return c;
      }
    }
    return 'right';
  }

  private static splitStreamTokens(expr: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (inQuotes) {
        current += ch;
        if (ch === quoteChar && expr[i - 1] !== '\\') {
          inQuotes = false;
        }
      } else if (ch === '"' || ch === "'") {
        inQuotes = true;
        quoteChar = ch;
        current += ch;
      } else if (ch === '<' && expr[i + 1] === '<') {
        tokens.push(current.trim());
        current = '';
        i++; // skip second '<'
      } else {
        current += ch;
      }
    }
    if (current.trim().length > 0) {
      tokens.push(current.trim());
    }
    return tokens;
  }

  private static async evaluatePrintStatement(
    evalExpr: (expr: string) => Promise<string | null>,
    lineText: string
  ): Promise<string | null> {
    const trimmed = lineText.trim();

    // Match std::cout << or cout <<
    const coutIndex = trimmed.search(/(?:std::)?cout\s*<</);
    if (coutIndex !== -1) {
      const exprPart = trimmed
        .substring(coutIndex)
        .replace(/^(?:std::)?cout\s*<<\s*/, '')
        .replace(/;.*$/, '');
      const tokens = this.splitStreamTokens(exprPart);
      let output = '';

      for (const tok of tokens) {
        const t = tok.trim();
        if (t === 'endl' || t === 'std::endl') {
          output += '\n';
        } else if (
          (t.startsWith('"') && t.endsWith('"')) ||
          (t.startsWith("'") && t.endsWith("'"))
        ) {
          output += t
            .slice(1, -1)
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t');
        } else if (t.length > 0) {
          const val = await evalExpr(t);
          if (
            val !== null &&
            !val.includes('error') &&
            !val.includes('No symbol') &&
            !val.includes('Cannot access')
          ) {
            const parsed = this.parseData(val);
            output += String(parsed);
          }
        }
      }
      return output.length > 0 ? output : null;
    }

    // Match printf("...", ...)
    const printfMatch = trimmed.match(/(?:printf)\s*\(\s*(".*?")\s*(?:,\s*(.*?))?\s*\)/);
    if (printfMatch) {
      let format = printfMatch[1]
        .slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t');
      const argsStr = printfMatch[2];
      if (argsStr) {
        const args = argsStr.split(',').map((a) => a.trim());
        for (const arg of args) {
          const val = await evalExpr(arg);
          const parsed = val !== null ? String(this.parseData(val)) : '';
          format = format.replace(/%[a-zA-Z0-9.-]+/, parsed);
        }
      }
      return format;
    }

    return null;
  }

  public static async extractArrays(
    session: vscode.DebugSession,
    frameId: number,
    localVars: Record<
      string,
      { value: string; type?: string; variablesReference: number; isArgument: boolean }
    >,
    evalExpr: (expr: string, targetFrameId?: number) => Promise<string | null>,
    rawLine: number,
    varDecls: Map<string, number[]>,
    funcRange: { name: string; startLine: number; endLine: number } | null,
    resolvedFile?: string,
    previousSnapshot?: LinkedListSnapshot
  ): Promise<{ arrays: ArrayVariable[]; indexPointers: IndexPointer[] }> {
    const discoveredArrays: ArrayVariable[] = [];
    const indexPointers: IndexPointer[] = [];
    const arrayDeclList = this.discoverArrayDeclarations(resolvedFile);
    const arrayDeclMap = new Map<string, { line: number; size?: number; type: string; isDynamic: boolean }>();
    for (const ad of arrayDeclList) {
      arrayDeclMap.set(ad.name, ad);
    }

    // 1. Identify all active array variables
    for (const [varName, varInfo] of Object.entries(localVars)) {
      if (
        varName.startsWith('__') ||
        varName === 'this' ||
        varName === 'argc' ||
        varName === 'argv'
      ) {
        continue;
      }

      // Check if variable is declared as an array in source or has array type in GDB
      const decl = arrayDeclMap.get(varName);
      const typeStr = (varInfo.type || '').toLowerCase();
      const valStr = (varInfo.value || '').trim();

      const isStackArray =
        typeStr.includes('[') ||
        (decl && decl.type === 'stack_array') ||
        (valStr.startsWith('{') && valStr.endsWith('}') && valStr.includes(','));
      const isVector = typeStr.includes('vector') || (decl && decl.type === 'vector');
      const isDynamicArray =
        (decl && decl.type === 'dynamic_array') ||
        (typeStr.includes('*') && (valStr.includes('0x') || valStr.includes('new')));

      if (!isStackArray && !isVector && !isDynamicArray) {
        continue;
      }

      // Check if variable is initialized
      if (!varInfo.isArgument) {
        if (decl && rawLine <= decl.line) {
          continue;
        }
        if (varDecls.has(varName) && !this.isVariableInitialized(varName, rawLine, varDecls, funcRange)) {
          continue;
        }
      }

      // Determine array size
      let size = 0;
      if (decl && decl.size && decl.size > 0) {
        size = decl.size;
      }

      if (isStackArray && size === 0) {
        const sizeEval = await evalExpr(`sizeof(${varName}) / sizeof(${varName}[0])`);
        if (sizeEval) {
          const parsed = parseInt(sizeEval.match(/\d+/)?.[0] || '0', 10);
          if (parsed > 0 && parsed <= 256) {
            size = parsed;
          }
        }
      } else if (isVector) {
        const sizeEval = await evalExpr(`${varName}.size()`);
        if (sizeEval) {
          const parsed = parseInt(sizeEval.match(/\d+/)?.[0] || '0', 10);
          if (parsed >= 0 && parsed <= 256) {
            size = parsed;
          }
        }
      } else if (isDynamicArray && size === 0) {
        for (const [otherName, otherInfo] of Object.entries(localVars)) {
          if (['n', 'size', 'len', 'length', 'count', 'capacity'].includes(otherName.toLowerCase())) {
            const parsed = parseInt(otherInfo.value.match(/\d+/)?.[0] || '0', 10);
            if (parsed > 0 && parsed <= 256) {
              size = parsed;
              break;
            }
          }
        }
      }

      // If DAP variablesReference has children, use child count if size still 0
      let childVars: any[] = [];
      if (varInfo.variablesReference > 0) {
        try {
          const childRes = await session.customRequest('variables', {
            variablesReference: varInfo.variablesReference,
          });
          if (childRes?.variables && Array.isArray(childRes.variables)) {
            childVars = childRes.variables;
            if (size === 0 && childVars.length > 0) {
              size = Math.min(childVars.length, 64);
            }
          }
        } catch {
          // ignore
        }
      }

      if (size === 0) {
        size = 5;
      }

      const effectiveSize = Math.min(size, 64);

      // Base address of the array
      let baseAddress: string | undefined;
      const addrEval = await evalExpr(`&${varName}`);
      if (addrEval) {
        baseAddress = this.parsePointer(addrEval) || undefined;
      }

      // Fetch elements
      const elements: ArrayElement[] = [];
      const prevArray = previousSnapshot?.arrays?.find((a) => a.name === varName);

      for (let idx = 0; idx < effectiveSize; idx++) {
        let elemVal: number | string = 0;
        let elemAddr: string | undefined;

        const child = childVars.find(
          (c) => c.name === `[${idx}]` || c.name === `${idx}`
        );
        if (child) {
          elemVal = this.parseData(child.value);
        } else {
          const elemEval = await evalExpr(`${varName}[${idx}]`);
          if (elemEval !== null) {
            elemVal = this.parseData(elemEval);
          }
        }

        const elemAddrEval = await evalExpr(`&${varName}[${idx}]`);
        if (elemAddrEval) {
          elemAddr = this.parsePointer(elemAddrEval) || undefined;
        }

        const prevElem = prevArray?.elements[idx];
        const isModified = prevElem !== undefined && prevElem.value !== elemVal;

        elements.push({
          index: idx,
          value: elemVal,
          address: elemAddr,
          isModified,
          isActive: false,
        });
      }

      let capacity: number | undefined;
      if (isVector) {
        const capEval = await evalExpr(`${varName}.capacity()`);
        if (capEval) {
          const parsedCap = parseInt(capEval.match(/\d+/)?.[0] || '0', 10);
          if (parsedCap >= size && parsedCap <= 64) {
            capacity = parsedCap;
          }
        }
      }

      // If capacity exceeds effectiveSize, add unallocated capacity buffer slots (VisuAlgo style)
      if (capacity && capacity > effectiveSize) {
        for (let idx = effectiveSize; idx < capacity; idx++) {
          elements.push({
            index: idx,
            value: '∅',
            isCapacitySlot: true,
            isModified: false,
            isActive: false,
          });
        }
      }

      discoveredArrays.push({
        name: varName,
        type: varInfo.type || (isVector ? 'std::vector' : 'array'),
        size: effectiveSize,
        capacity,
        elements,
        address: baseAddress,
        isDynamic: isDynamicArray || isVector,
      });
    }

    // Phase 1b: Search for class/struct member arrays or arrays accessible via scope
    for (const decl of arrayDeclList) {
      if (discoveredArrays.some((a) => a.name === decl.name || a.name.endsWith('.' + decl.name))) {
        continue;
      }

      // Generate candidates:
      // 1. decl.name directly (e.g. inside a member function like shop::setPrice)
      // 2. this->decl.name
      // 3. For each object variable in localVars: objName.decl.name or objName->decl.name
      const candidateExprs: Array<{ expr: string; displayName: string; parentObj?: string }> = [
        { expr: decl.name, displayName: decl.name },
        { expr: `this->${decl.name}`, displayName: decl.name },
      ];

      for (const [objName, objInfo] of Object.entries(localVars)) {
        if (
          objName.startsWith('__') ||
          objName === 'this' ||
          objName === 'argc' ||
          objName === 'argv' ||
          discoveredArrays.some((a) => a.name === objName)
        ) {
          continue;
        }
        const objType = (objInfo.type || '').toLowerCase();
        if (objType.includes('*')) {
          candidateExprs.push({ expr: `${objName}->${decl.name}`, displayName: `${objName}.${decl.name}`, parentObj: objName });
        } else {
          candidateExprs.push({ expr: `${objName}.${decl.name}`, displayName: `${objName}.${decl.name}`, parentObj: objName });
        }
      }

      for (const cand of candidateExprs) {
        // Test if this candidate expression is valid and accessible in GDB
        let isStackArray = false;
        let isVector = false;
        let isDynamic = false;
        let size = decl.size || 0;

        // Try evaluating sizeof(cand.expr) / sizeof(cand.expr[0])
        const sizeEval = await evalExpr(`sizeof(${cand.expr}) / sizeof((${cand.expr})[0])`);
        if (sizeEval) {
          const parsed = parseInt(sizeEval.match(/\d+/)?.[0] || '0', 10);
          if (parsed > 0 && parsed <= 512) {
            isStackArray = true;
            if (size === 0) size = parsed;
          }
        }

        if (!isStackArray) {
          const vecEval = await evalExpr(`${cand.expr}.size()`);
          if (vecEval) {
            const parsed = parseInt(vecEval.match(/\d+/)?.[0] || '0', 10);
            if (parsed >= 0 && parsed <= 512) {
              isVector = true;
              size = parsed;
            }
          }
        }

        if (!isStackArray && !isVector) {
          const ptrVal = await evalExpr(cand.expr);
          if (ptrVal && (ptrVal.includes('0x') || ptrVal.includes('{'))) {
            isDynamic = true;
          }
        }

        if (!isStackArray && !isVector && !isDynamic) {
          continue;
        }

        // Active bound / counter detection for large arrays (e.g. itemId[100])
        let activeCounterVal: number | null = null;
        const counterNames = ['counter', 'count', 'n', 'len', 'length', 'size', 'items', 'total'];
        for (const cName of counterNames) {
          let cValStr: string | null = null;
          if (cand.parentObj) {
            cValStr = await evalExpr(`${cand.parentObj}.${cName}`);
            if (!cValStr) cValStr = await evalExpr(`${cand.parentObj}->${cName}`);
          }
          if (!cValStr) {
            cValStr = await evalExpr(`this->${cName}`);
          }
          if (!cValStr) {
            cValStr = await evalExpr(cName);
          }
          if (cValStr) {
            const parsedC = parseInt(cValStr.match(/-?\d+/)?.[0] || '', 10);
            if (!isNaN(parsedC) && parsedC >= 0 && parsedC <= 1000) {
              activeCounterVal = parsedC;
              break;
            }
          }
        }

        if (size === 0) {
          size = activeCounterVal !== null ? Math.max(5, activeCounterVal) : 5;
        }

        // Display a sensible bounded window if size > 15
        let effectiveSize = size;
        if (size > 15) {
          if (activeCounterVal !== null) {
            effectiveSize = Math.max(5, Math.min(activeCounterVal + 2, 20, size));
          } else {
            effectiveSize = Math.min(size, 10);
          }
        }

        // Base address
        let baseAddress: string | undefined;
        const addrEval = await evalExpr(`&(${cand.expr}[0])`);
        if (addrEval) {
          baseAddress = this.parsePointer(addrEval) || undefined;
        }

        // Fetch elements
        const elements: ArrayElement[] = [];
        const prevArray = previousSnapshot?.arrays?.find(
          (a) => a.name === cand.displayName || a.name === decl.name || a.name.endsWith('.' + decl.name)
        );

        for (let idx = 0; idx < effectiveSize; idx++) {
          let elemVal: number | string = 0;
          let elemAddr: string | undefined;

          const elemEval = await evalExpr(`${cand.expr}[${idx}]`);
          if (elemEval !== null) {
            elemVal = this.parseData(elemEval);
          }

          const elemAddrEval = await evalExpr(`&(${cand.expr}[${idx}])`);
          if (elemAddrEval) {
            elemAddr = this.parsePointer(elemAddrEval) || undefined;
          }

          const prevElem = prevArray?.elements[idx];
          const isModified = prevElem !== undefined && prevElem.value !== elemVal;

          elements.push({
            index: idx,
            value: elemVal,
            address: elemAddr,
            isModified,
            isActive: false,
          });
        }

        let capacity: number | undefined;
        if (isVector) {
          const capEval = await evalExpr(`${cand.expr}.capacity()`);
          if (capEval) {
            const parsedCap = parseInt(capEval.match(/\d+/)?.[0] || '0', 10);
            if (parsedCap >= size && parsedCap <= 64) {
              capacity = parsedCap;
            }
          }
        }

        discoveredArrays.push({
          name: cand.displayName,
          type: isVector ? 'std::vector' : 'array',
          size: size,
          capacity,
          elements,
          address: baseAddress,
          isDynamic: isDynamic || isVector,
        });

        break;
      }
    }

    // 2. Discover Index Pointers (i, j, left, right, mid, counter, etc.)
    const indexVarNames = new Set([
      'i',
      'j',
      'k',
      'idx',
      'index',
      'left',
      'right',
      'low',
      'high',
      'mid',
      'start',
      'end',
      'p',
      'ptr',
      'curr',
      'counter',
      'count',
      'pos',
    ]);

    for (const [varName, varInfo] of Object.entries(localVars)) {
      if (discoveredArrays.some((a) => a.name === varName)) {
        continue;
      }
      if (varName.startsWith('__') || varName === 'argc' || varName === 'argv') {
        continue;
      }

      if (!varInfo.isArgument) {
        if (varDecls.has(varName) && !this.isVariableInitialized(varName, rawLine, varDecls, funcRange)) {
          continue;
        }
      }

      const typeStr = (varInfo.type || '').toLowerCase();
      const isInteger =
        typeStr.includes('int') ||
        typeStr.includes('size_t') ||
        typeStr.includes('short') ||
        typeStr.includes('long') ||
        indexVarNames.has(varName.toLowerCase());

      if (isInteger) {
        const parsed = parseInt(varInfo.value.match(/-?\d+/)?.[0] || '', 10);
        if (!isNaN(parsed)) {
          for (const arr of discoveredArrays) {
            if (parsed >= 0 && parsed < arr.size) {
              indexPointers.push({
                name: varName,
                targetIndex: parsed,
                targetArrayName: arr.name,
                value: parsed,
              });
              if (arr.elements[parsed]) {
                arr.elements[parsed].isActive = true;
              }
            }
          }
        }
      }
    }

    // Probe member counters (e.g. counter, count) on objects or in scope for discovered arrays
    for (const arr of discoveredArrays) {
      for (const cName of ['counter', 'count', 'idx', 'index', 'i', 'j']) {
        if (indexPointers.some((p) => p.name === cName && p.targetArrayName === arr.name)) {
          continue;
        }
        let cValStr: string | null = null;
        if (arr.name.includes('.')) {
          const parentObj = arr.name.split('.')[0];
          cValStr = await evalExpr(`${parentObj}.${cName}`);
          if (!cValStr) cValStr = await evalExpr(`${parentObj}->${cName}`);
        }
        if (!cValStr) {
          cValStr = await evalExpr(`this->${cName}`);
        }
        if (!cValStr && !localVars[cName]) {
          cValStr = await evalExpr(cName);
        }
        if (cValStr) {
          const parsed = parseInt(cValStr.match(/-?\d+/)?.[0] || '', 10);
          if (!isNaN(parsed) && parsed >= 0 && parsed < arr.size) {
            indexPointers.push({
              name: cName,
              targetIndex: parsed,
              targetArrayName: arr.name,
              value: parsed,
            });
            if (arr.elements[parsed]) {
              arr.elements[parsed].isActive = true;
            }
          }
        }
      }
    }

    return { arrays: discoveredArrays, indexPointers };
  }

  public static async extractStackState(
    evalExpr: (expr: string, targetFrameId?: number) => Promise<string | null>,
    localVars: Record<string, any>,
    executedLineText: string,
    previousSnapshot?: LinkedListSnapshot,
    frames?: any[]
  ): Promise<StackModel | undefined> {
    let stackName = 'stack';
    let topVal = -1;
    let capacity = 6;
    let elements: StackElement[] = [];

    for (const k of Object.keys(localVars)) {
      if (k.toLowerCase().includes('stack') || k === 's' || k === 'st') {
        stackName = k;
        break;
      }
    }

    const frameIdsToTry = frames && frames.length > 0 ? frames.map((f) => f.id) : [undefined];

    const evaluateAcrossFrames = async (exprs: string[]): Promise<string | null> => {
      for (const fId of frameIdsToTry) {
        for (const expr of exprs) {
          const res = await evalExpr(expr, fId);
          if (res && this.isValidEvalNumber(res)) {
            return res;
          }
        }
      }
      return null;
    };

    const topCandidates = [
      'this->top',
      'this->topIndex',
      'this->m_top',
      `${stackName}.top`,
      `${stackName}.topIndex`,
      's.top',
      'stack.top',
      'top',
      'topIndex',
    ];
    if (this.cachedStackTopExpr) {
      topCandidates.unshift(this.cachedStackTopExpr);
    }

    const topRes = await evaluateAcrossFrames(topCandidates);
    if (topRes) {
      const parsed = parseInt(topRes.match(/-?\d+/)?.[0] || '', 10);
      if (!isNaN(parsed) && parsed >= -1 && parsed <= 128) {
        topVal = parsed;
      }
    }

    const capCandidates = [
      'this->capacity',
      'this->MAX',
      'this->CAPACITY',
      `${stackName}.capacity`,
      `${stackName}.MAX`,
      `${stackName}.size`,
      'MAX',
      'CAPACITY',
      'capacity',
    ];
    if (this.cachedStackCapExpr) {
      capCandidates.unshift(this.cachedStackCapExpr);
    }
    const capRes = await evaluateAcrossFrames(capCandidates);
    if (capRes) {
      const parsed = parseInt(capRes.match(/\d+/)?.[0] || '', 10);
      if (!isNaN(parsed) && parsed >= 2 && parsed <= 64) {
        capacity = parsed;
      }
    }

    let activeMethod: 'push' | 'pop' | 'peek' | null = null;
    let methodParam: number | string | undefined = undefined;
    const cleanLine = executedLineText.toLowerCase();
    if (cleanLine.includes('push(')) {
      activeMethod = 'push';
      const m = executedLineText.match(/push\s*\(\s*([^)]+)\s*\)/i);
      if (m) {
        const valRes = await evalExpr(m[1].trim());
        methodParam = valRes && this.isValidEvalNumber(valRes) ? this.parseData(valRes) : m[1].trim();
      }
    } else if (cleanLine.includes('pop(')) {
      activeMethod = 'pop';
    } else if (cleanLine.includes('peek(') || cleanLine.includes('.top(')) {
      activeMethod = 'peek';
    }

    if (topVal >= 0) {
      let foundArr = false;
      let targetArrName: string | null = null;
      let targetFrameId: number | undefined = undefined;

      const arrNames = [
        'this->arr',
        'this->items',
        'this->data',
        'this->elements',
        `${stackName}.arr`,
        `${stackName}.items`,
        `${stackName}.data`,
        `${stackName}.elements`,
        's.arr',
        'stack.arr',
        'arr',
        'items',
        'data',
        'elements',
      ];
      if (this.cachedStackArrExpr) {
        arrNames.unshift(this.cachedStackArrExpr);
      }

      for (const fId of frameIdsToTry) {
        for (const aName of arrNames) {
          const testElem = await evalExpr(`${aName}[0]`, fId);
          if (this.isValidEvalNumber(testElem)) {
            targetArrName = aName;
            targetFrameId = fId;
            this.cachedStackArrExpr = aName;
            break;
          }
        }
        if (targetArrName) break;
      }

      if (targetArrName) {
        foundArr = true;
        for (let i = 0; i <= topVal; i++) {
          const elRes = await evalExpr(`${targetArrName}[${i}]`, targetFrameId);
          const val = this.isValidEvalNumber(elRes) ? this.parseData(elRes) : 0;
          elements.push({
            id: `stack_elem_${i}`,
            value: val,
            index: i,
            isTop: i === topVal,
            isHighlighted: i === topVal,
          });
        }
      }

      if (!foundArr && previousSnapshot?.stack) {
        elements = previousSnapshot.stack.elements.map((e) => ({ ...e, isHighlighted: false, isTop: false }));
        if (activeMethod === 'push' && methodParam !== undefined && topVal >= elements.length) {
          elements.push({
            id: `stack_elem_${topVal}`,
            value: methodParam,
            index: topVal,
            isTop: true,
            isHighlighted: true,
          });
        } else if (activeMethod === 'pop') {
          elements = elements.slice(0, Math.max(0, topVal + 1));
          if (elements.length > 0) {
            elements[elements.length - 1].isTop = true;
          }
        }
      }
    }

    return {
      name: stackName,
      elements,
      topIndex: topVal,
      capacity: Math.max(capacity, elements.length, 6),
      activeMethod,
      methodParam,
      isOverflow: topVal >= capacity,
      isUnderflow: topVal === -1 && activeMethod === 'pop',
    };
  }

  public static async extractState(
    session: vscode.DebugSession,
    threadId: number,
    stepNumber: number,
    previousSnapshot?: LinkedListSnapshot
  ): Promise<LinkedListSnapshot | null> {
    try {
      // 1. Get Stack Frames (up to 25 levels)
      const stackResponse = await session.customRequest('stackTrace', {
        threadId,
        startFrame: 0,
        levels: 25,
      });

      const frames = stackResponse?.stackFrames || [];
      if (frames.length === 0) {
        return null;
      }

      // Find the topmost stack frame located in user source code (not CRT, MinGW, or system stdlib)
      const userFrame = frames.find((f: any) => {
        const p = f.source?.path || f.source?.name || '';
        const name = (f.name || '').toLowerCase();
        return this.isUserSource(p) && !name.includes('crt') && !name.includes('startup');
      });

      // If execution has completely exited user code (e.g. into CRT exit/shutdown), conclude session
      if (!userFrame) {
        if (previousSnapshot) {
          let finExp = 'Program execution completed. The linked list is complete.';
          if (previousSnapshot.structureType === 'tree') {
            finExp = 'Binary tree execution complete. Program execution finished.';
          } else if (previousSnapshot.structureType === 'array') {
            finExp = 'Array execution complete. Program execution finished.';
          } else if (previousSnapshot.structureType === 'stack') {
            finExp = 'Stack execution complete. Program execution finished.';
          }
          return {
            ...previousSnapshot,
            stepNumber,
            explanation: finExp,
            changeType: 'final',
            terminalOutput: this.accumulatedTerminalOutput || previousSnapshot.terminalOutput,
            isHistorical: false,
          };
        }
        return null;
      }

      const frameId = userFrame.id;
      const funcName = (userFrame.name || '').trim();
      const rawPath = userFrame.source?.path || userFrame.source?.name || 'source.cpp';
      const rawLine = userFrame.line;
      const resolvedFile = this.resolveFilePath(rawPath) || rawPath;

      // Discover struct fields and structure type
      const {
        dataField: parsedDataField,
        nextField: parsedNextField,
        leftField: parsedLeftField,
        rightField: parsedRightField,
        structureType: parsedStructureType,
      } = this.parseStructMembers(resolvedFile);

      if (!this.cachedDataField && parsedDataField) this.cachedDataField = parsedDataField;
      if (!this.cachedNextField && parsedNextField) this.cachedNextField = parsedNextField;
      if (!this.cachedLeftField && parsedLeftField) this.cachedLeftField = parsedLeftField;
      if (!this.cachedRightField && parsedRightField) this.cachedRightField = parsedRightField;
      if (!this.cachedStructureType && parsedStructureType) this.cachedStructureType = parsedStructureType;
      const structureType = this.cachedStructureType || parsedStructureType || 'linked_list';

      // Check variable declarations across all functions in the file
      const varDecls = this.getVariableDeclarations(resolvedFile);
      const funcRange = this.getEnclosingFunction(resolvedFile, rawLine);

      // Once the list/tree is initialized, hasHead remains true for all subsequent steps/functions
      const isInsideMain =
        funcName === 'main' || funcName.startsWith('main(') || funcName.startsWith('main()');
      let hasHead = this.hasInitializedList;
      if (!hasHead) {
        if (isInsideMain) {
          if (structureType === 'array') {
            const arrayDecls = this.discoverArrayDeclarations(resolvedFile);
            if (arrayDecls.length > 0) {
              const firstArr = arrayDecls[0];
              if (funcRange && firstArr.line < funcRange.startLine) {
                // Class member or global array declared before main function
                hasHead = rawLine > funcRange.startLine;
              } else {
                hasHead = rawLine > firstArr.line;
              }
            } else {
              hasHead = true;
            }
          } else if (structureType === 'stack') {
            const stackVarCandidates = ['s', 'st', 'stack', 's1', 's2', 'myStack'];
            let declaredCandidate: string | null = null;
            for (const cand of stackVarCandidates) {
              const lines = varDecls.get(cand);
              const inFunc = funcRange
                ? lines?.filter((l) => l >= funcRange.startLine && l <= funcRange.endLine)
                : lines;
              if (inFunc && inFunc.length > 0) {
                declaredCandidate = cand;
                break;
              }
            }
            if (declaredCandidate) {
              hasHead = this.isVariableInitialized(declaredCandidate, rawLine, varDecls, funcRange);
            } else {
              hasHead = true;
            }
          } else {
            const candidates =
              structureType === 'tree'
                ? ['root', 'tree', 'bst', 'head', 't', 'r']
                : ['head', 'root', 'first', 'list', 'start', 'dummy', 'headNode'];

            let declaredCandidate: string | null = null;
            for (const cand of candidates) {
              const lines = varDecls.get(cand);
              const inFunc = funcRange
                ? lines?.filter((l) => l >= funcRange.startLine && l <= funcRange.endLine)
                : lines;
              if (inFunc && inFunc.length > 0) {
                declaredCandidate = cand;
                break;
              }
            }

            if (declaredCandidate) {
              hasHead = this.isVariableInitialized(declaredCandidate, rawLine, varDecls, funcRange);
            } else {
              hasHead = this.hasSteppedPastFirstPointerDecl(rawLine, varDecls, funcRange);
            }
          }
        } else {
          hasHead = true;
        }
      }

      // If program has just entered before head/root declaration line executed, return clean entry state
      if (!hasHead) {
        this.lastPausedLine = rawLine;
        const initExplanation =
          structureType === 'tree'
            ? 'Program paused at start. Click Next to allocate and initialize tree: TreeNode* root = ...'
            : structureType === 'array'
            ? 'Program paused at start. Click Next to allocate and initialize array.'
            : structureType === 'stack'
            ? 'Program paused at start. Click Next to initialize stack.'
            : 'Program paused at start. Click Next to execute: Node* head = ...';
        return {
          stepNumber,
          structureType,
          source: {
            file: resolvedFile,
            line: rawLine,
            functionName: userFrame.name,
          },
          hasHead: false,
          headId: null,
          nodes: [],
          pointers: [],
          arrays: [],
          indexPointers: [],
          explanation: initExplanation,
          changeType: 'init',
          terminalOutput: '',
          isHistorical: false,
        };
      }

      // The line that just completed execution is the line GDB was previously paused on
      const executedLine = this.lastPausedLine !== null ? this.lastPausedLine : rawLine;
      this.lastPausedLine = rawLine;

      const sourceLoc: SourceLocation = {
        file: resolvedFile,
        line: executedLine,
        functionName: userFrame.name,
      };

      const lineText = this.getLineText(sourceLoc.file, rawLine);
      const executedLineText = this.getLineText(sourceLoc.file, executedLine);
      const isReturnOrEnd =
        isInsideMain &&
        (lineText.startsWith('return') || lineText === '}');

      // 2. Discover local variables & parameters via Scopes
      let localVars: Record<
        string,
        { value: string; type?: string; variablesReference: number; isArgument: boolean }
      > = {};
      try {
        const scopesRes = await session.customRequest('scopes', { frameId });
        const scopes = scopesRes?.scopes || [];
        for (const scope of scopes) {
          const sName = (scope.name || '').toLowerCase();
          const isArg = sName.includes('arg') || sName.includes('param');
          const isLocal = sName.includes('local') || sName.includes('var');
          if ((isArg || isLocal) && scope.variablesReference > 0) {
            const varsRes = await session.customRequest('variables', {
              variablesReference: scope.variablesReference,
            });
            if (varsRes?.variables) {
              for (const v of varsRes.variables) {
                if (!localVars[v.name]) {
                  const isFuncParam = funcRange?.params?.includes(v.name) ?? false;
                  localVars[v.name] = {
                    value: v.value,
                    type: v.type,
                    variablesReference: v.variablesReference,
                    isArgument: isArg || isFuncParam,
                  };
                }
              }
            }
          }
        }
      } catch (err) {
        // Scopes request might not be supported; we'll evaluate directly
      }

      // Evaluation helper in current frame or specific target frame
      const evalExpr = async (expr: string, targetFrameId: number = frameId): Promise<string | null> => {
        try {
          const res = await session.customRequest('evaluate', {
            expression: expr,
            frameId: targetFrameId,
            context: 'watch',
          });
          return res?.result ?? null;
        } catch {
          return null;
        }
      };

      // Check if the executed line was a deletion / deallocation (e.g. `delete temp;` or `free(temp);`)
      const isDelLine =
        executedLineText.includes('delete') || executedLineText.includes('free');
      const deleteMatch = isDelLine
        ? executedLineText.match(
            /(?:delete\s+(?:\[\s*\]\s*)?|free\s*\(\s*)([a-zA-Z_][a-zA-Z0-9_]*)/
          )
        : null;
      if (deleteMatch) {
        const delVar = deleteMatch[1];
        let delAddr: string | null = null;
        if (previousSnapshot?.pointers) {
          const ptr = previousSnapshot.pointers.find((p) => p.name === delVar);
          if (ptr && ptr.targetAddress) {
            delAddr = ptr.targetAddress;
          }
        }
        if (!delAddr) {
          const delVal = localVars[delVar]?.value ?? (await evalExpr(delVar));
          delAddr = this.parsePointer(delVal);
        }
        if (delAddr) {
          this.deletedAddresses.add(delAddr.toLowerCase());
        }
      }

      let arrays: ArrayVariable[] = [];
      let indexPointers: IndexPointer[] = [];
      let allNodes: ListNode[] = [];
      let activePointers: PointerVariable[] = [];
      let headId: string | null = null;
      let activeVisitingNodeId: string | null = null;

      if (structureType === 'array') {
        const arrData = await this.extractArrays(
          session,
          frameId,
          localVars,
          evalExpr,
          rawLine,
          varDecls,
          funcRange,
          resolvedFile,
          previousSnapshot
        );
        arrays = arrData.arrays;
        indexPointers = arrData.indexPointers;
        if (arrays.length > 0) {
          this.hasInitializedList = true;
        }
      } else if (structureType === 'stack') {
        // Stack models are linear array/buffer structures.
        // We do not chase linked list / tree pointers.
        this.hasInitializedList = true;
      } else {
        // 3. Inspect 'head' / 'root' across current frame and caller frames
        let headAddr: string | null = null;
      const headCandidates = [
        'root',
        'this->root',
        'pRoot',
        'this->pRoot',
        'tree',
        'this->tree',
        't',
        'head',
        'this->head',
        'pHead',
        'this->pHead',
        'headNode',
        'this->headNode',
        'first',
        'this->first',
        'start',
        'list',
        'dummy',
        'dummyHead',
        'h',
        'l1',
        'l2',
        'head_ref',
        'root_ref',
        'top',
        'front',
        'listHead',
        '_head',
        '_root',
        'm_head',
        'm_root',
      ];

      // A: Try current user frame (only if we're in main — in helper functions like insert()
      // the 'root' parameter may be a by-value nullptr copy, not the actual tree root)
      const isInMain = isInsideMain;
      if (isInMain) {
        for (const cand of headCandidates) {
          if (varDecls.has(cand) && !this.isVariableInitialized(cand, rawLine, varDecls, funcRange)) {
            continue;
          }
          let valStr: string | null | undefined = localVars[cand]?.value;
          if (!valStr) {
            valStr = await evalExpr(cand);
          }
          if (valStr) {
            if (cand === 'head_ref' || cand === 'root_ref' || valStr.includes('**')) {
              const derefVal = await evalExpr(`*${cand}`);
              headAddr = this.parsePointer(derefVal);
            } else {
              headAddr = this.parsePointer(valStr);
            }
            if (headAddr && !this.deletedAddresses.has(headAddr)) {
              break;
            } else {
              headAddr = null;
            }
          }
        }
      }

      // B: Check caller frames — required when inside helper functions (insert, traverse, etc.)
      // Prioritize the 'main' frame where the true root/head pointer lives,
      // avoiding local recursive parameters (e.g. insert's 'root') shadowing the real root.
      if (!headAddr) {
        const mainFrame = frames.find((f: any) => {
          const name = (f.name || '').toLowerCase();
          const path = f.source?.path || f.source?.name || '';
          return this.isUserSource(path) && (name === 'main' || name.startsWith('main('));
        });

        if (mainFrame) {
          for (const cand of headCandidates) {
            const valStr = await evalExpr(cand, mainFrame.id);
            if (valStr) {
              let candidate: string | null = null;
              if (cand === 'head_ref' || cand === 'root_ref' || valStr.includes('**')) {
                const derefVal = await evalExpr(`*${cand}`, mainFrame.id);
                candidate = this.parsePointer(derefVal);
              } else {
                candidate = this.parsePointer(valStr);
              }
              if (candidate && !this.deletedAddresses.has(candidate)) {
                headAddr = candidate;
                break;
              }
            }
          }
        }

        // Priority 2: Check caller frames from outermost to innermost
        if (!headAddr) {
          for (let i = frames.length - 1; i >= 0; i--) {
            const callerFrame = frames[i];
            const callerPath = callerFrame.source?.path || callerFrame.source?.name || '';
            if (!this.isUserSource(callerPath)) continue;
            for (const cand of headCandidates) {
              const valStr = await evalExpr(cand, callerFrame.id);
              if (valStr) {
                let candidate: string | null = null;
                if (cand === 'head_ref' || cand === 'root_ref' || valStr.includes('**')) {
                  const derefVal = await evalExpr(`*${cand}`, callerFrame.id);
                  candidate = this.parsePointer(derefVal);
                } else {
                  candidate = this.parsePointer(valStr);
                }
                if (candidate && !this.deletedAddresses.has(candidate)) {
                  headAddr = candidate;
                  break;
                }
              }
            }
            if (headAddr) break;
          }
        }
      }

      // C: Retain previous head address if still valid and not deleted
      if (!headAddr && previousSnapshot?.headId) {
        const prevHeadNode = previousSnapshot.nodes.find((n) => n.id === previousSnapshot.headId);
        if (prevHeadNode && prevHeadNode.address && !this.deletedAddresses.has(prevHeadNode.address)) {
          headAddr = prevHeadNode.address;
        }
      }

      if (headAddr && !this.deletedAddresses.has(headAddr)) {
        headId = this.getStableId(headAddr);
        this.hasInitializedList = true;
      } else {
        headAddr = null;
      }

      // Discovered node struct type name
      // Prefer types actually defined in the source file over hardcoded defaults.
      // discoverNodeTypes() first adds hardcoded fallbacks, then appends source-file structs.
      // We want the LAST entry from the source file (the actual struct in this file).
      let nodeType: string;
      {
        // Re-scan source file for struct/class names to find what's actually declared there
        let sourceDefinedType: string | null = null;
        try {
          if (fs.existsSync(resolvedFile)) {
            const content = fs.readFileSync(resolvedFile, 'utf8');
            // Match struct/class definitions — pick the one that has pointer members (left/right/next)
            const structMatches = Array.from(content.matchAll(/(?:struct|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{([^}]*?)\}/gs));
            for (const sm of structMatches) {
              const body = sm[2] || '';
              // Must have at least one pointer member
              if (body.includes('*')) {
                sourceDefinedType = sm[1];
              }
            }
          }
        } catch {
          // ignore
        }
        nodeType = sourceDefinedType || (structureType === 'tree' ? 'TreeNode' : 'Node');
      }

      // 4. Graph / Tree / Multi-Chain Sublist Traversal Engine
      const allDiscoveredNodes = new Map<string, ListNode>();
      const visitedAddrs = new Set<string>();

      const traverseChain = async (
        startAddr: string,
        isHeadChain: boolean,
        associatedVar?: string
      ): Promise<void> => {
        let currAddr: string | null = startAddr;
        let depth = 0;
        const MAX_DEPTH = 50;

        while (currAddr && !visitedAddrs.has(currAddr) && depth < MAX_DEPTH) {
          if (this.deletedAddresses.has(currAddr)) {
            break;
          }
          visitedAddrs.add(currAddr);
          depth++;

          const id = this.getStableId(currAddr);
          const ptrCast = `((${nodeType}*)${currAddr})`;

          const dataField = await this.resolveDataField(evalExpr, ptrCast);
          const nextField = await this.resolveNextField(evalExpr, ptrCast);

          const dataStr = await evalExpr(`${ptrCast}->${dataField}`);
          const nextValStr = await evalExpr(`${ptrCast}->${nextField}`);
          const nextAddr = this.parsePointer(nextValStr);

          const nextId =
            nextAddr && !this.deletedAddresses.has(nextAddr)
              ? this.getStableId(nextAddr)
              : null;

          const isNodeHead = currAddr === headAddr;

          allDiscoveredNodes.set(currAddr, {
            id,
            address: currAddr,
            data: this.parseData(dataStr || '0'),
            nextId,
            nextAddress: nextAddr,
            isHead: isNodeHead,
            isDetached: !isHeadChain && !isNodeHead,
            variableName: isNodeHead ? 'head' : depth === 1 ? associatedVar : undefined,
          });

          if (nextAddr && !this.deletedAddresses.has(nextAddr)) {
            currAddr = nextAddr;
          } else {
            break;
          }
        }
      };

      const traverseTree = async (
        startAddr: string,
        isRootTree: boolean,
        associatedVar?: string
      ): Promise<void> => {
        const queue: { addr: string; depth: number }[] = [{ addr: startAddr, depth: 0 }];
        const MAX_NODES = 100;
        let count = 0;

        while (queue.length > 0 && count < MAX_NODES) {
          const item = queue.shift()!;
          const currAddr = item.addr;
          const depth = item.depth;

          if (!currAddr || visitedAddrs.has(currAddr) || this.deletedAddresses.has(currAddr)) {
            continue;
          }
          visitedAddrs.add(currAddr);
          count++;

          const id = this.getStableId(currAddr);
          const ptrCast = `((${nodeType}*)${currAddr})`;

          const dataField = await this.resolveDataField(evalExpr, ptrCast);
          const leftField = await this.resolveLeftField(evalExpr, ptrCast);
          const rightField = await this.resolveRightField(evalExpr, ptrCast);

          const dataStr = await evalExpr(`${ptrCast}->${dataField}`);
          const leftValStr = await evalExpr(`${ptrCast}->${leftField}`);
          const rightValStr = await evalExpr(`${ptrCast}->${rightField}`);

          const leftAddr = this.parsePointer(leftValStr);
          const rightAddr = this.parsePointer(rightValStr);

          const leftId =
            leftAddr && !this.deletedAddresses.has(leftAddr) ? this.getStableId(leftAddr) : null;
          const rightId =
            rightAddr && !this.deletedAddresses.has(rightAddr) ? this.getStableId(rightAddr) : null;

          const isNodeRoot = currAddr === headAddr;

          allDiscoveredNodes.set(currAddr, {
            id,
            address: currAddr,
            data: this.parseData(dataStr || '0'),
            leftId,
            leftAddress: leftAddr,
            rightId,
            rightAddress: rightAddr,
            isHead: isNodeRoot,
            isRoot: isNodeRoot,
            isDetached: !isRootTree && !isNodeRoot,
            treeDepth: depth,
            variableName: isNodeRoot ? (structureType === 'tree' ? 'root' : 'head') : depth === 0 ? associatedVar : undefined,
          });

          if (leftAddr && !this.deletedAddresses.has(leftAddr) && !visitedAddrs.has(leftAddr)) {
            queue.push({ addr: leftAddr, depth: depth + 1 });
          }
          if (rightAddr && !this.deletedAddresses.has(rightAddr) && !visitedAddrs.has(rightAddr)) {
            queue.push({ addr: rightAddr, depth: depth + 1 });
          }
        }
      };

      // Traverse from root / head first
      if (headAddr) {
        if (structureType === 'tree') {
          await traverseTree(headAddr, true, 'root');
        } else {
          await traverseChain(headAddr, true, 'head');
        }
      }

      // 5. Track Active Pointer Variables & Traverse any Disconnected Chains
      const activePointers: PointerVariable[] = [];

      // Collect root / head pointer
      if (hasHead) {
        activePointers.push({
          name: structureType === 'tree' ? 'root' : 'head',
          targetNodeId: headId,
          targetAddress: headAddr,
          isNull: headAddr === null,
        });
      }

      for (const [varName, varInfo] of Object.entries(localVars)) {
        if (varName === 'head' || varName === 'root' || varName === 'this') continue;
        if (
          varName === 'data' ||
          varName === 'val' ||
          varName === 'key' ||
          varName === 'argc' ||
          varName === 'argv' ||
          varName === 'count' ||
          varName === 'i' ||
          varName === 'j' ||
          varName === 'k' ||
          varName.startsWith('__')
        ) {
          continue;
        }

        // Variable initialization check
        if (!varInfo.isArgument) {
          if (varDecls.has(varName) && !this.isVariableInitialized(varName, rawLine, varDecls, funcRange)) {
            continue;
          }
        }

        const varAddr = this.parsePointer(varInfo.value);
        const isFreed = varAddr ? this.deletedAddresses.has(varAddr) : false;
        const targetId = varAddr && !isFreed ? this.getStableId(varAddr) : null;

        const isTargetingKnownNode = varAddr ? allDiscoveredNodes.has(varAddr) : false;
        const isDeclaredPointer = varDecls.has(varName);
        const isPointerType =
          isDeclaredPointer ||
          (varInfo.type && (varInfo.type.includes('*') || varInfo.type.includes('&'))) ||
          varName === 'temp' ||
          varName === 'prev' ||
          varName === 'curr' ||
          varName === 'current' ||
          varName === 'forward' ||
          varName === 'next' ||
          varName === 'node' ||
          varName === 'first' ||
          varName === 'second' ||
          varName === 'third' ||
          varName === 'tail' ||
          varName === 'last' ||
          varName === 'p' ||
          varName === 'q' ||
          varName === 'l1' ||
          varName === 'l2' ||
          varName === 'dummy' ||
          varName === 'fast' ||
          varName === 'slow' ||
          varName === 'loc' ||
          varName === 'par' ||
          varName === 'parent' ||
          varName === 'child' ||
          varName === 'successor' ||
          varName === 'parSuccessor' ||
          varName === 'pred' ||
          varName === 'predecessor' ||
          varName === 'succ' ||
          varName === 'newNode' ||
          varName === 'new_node' ||
          varName === 'target' ||
          varName === 'ptr' ||
          varName === 'cur';

        if (isPointerType || isTargetingKnownNode) {
          activePointers.push({
            name: varName,
            targetNodeId: targetId,
            targetAddress: isFreed ? null : varAddr,
            isNull: varAddr === null || isFreed,
          });

          // Traverse disconnected subchains/trees
          if (varAddr && !isFreed && !visitedAddrs.has(varAddr)) {
            if (structureType === 'tree') {
              await traverseTree(varAddr, false, varName);
            } else {
              await traverseChain(varAddr, false, varName);
            }
          }
        }
      }

      // Check if any previous nodes still exist in memory but weren't visited
      if (previousSnapshot?.nodes && previousSnapshot.hasHead && stepNumber > 1) {
        for (const prevNode of previousSnapshot.nodes) {
          if (prevNode.address && !this.deletedAddresses.has(prevNode.address) && !visitedAddrs.has(prevNode.address)) {
            if (structureType === 'tree') {
              await traverseTree(prevNode.address, false);
            } else {
              await traverseChain(prevNode.address, false);
            }
          }
        }
      }

      // 6. Determine Reachability & Tree Coordinate Ordering
      if (structureType === 'tree') {
        const reachableFromRoot = new Set<string>();
        if (headId) {
          const queue = [headId];
          const visitedTree = new Set<string>();
          while (queue.length > 0) {
            const currId = queue.shift()!;
            if (visitedTree.has(currId)) continue;
            visitedTree.add(currId);
            reachableFromRoot.add(currId);
            const foundNode = Array.from(allDiscoveredNodes.values()).find((n) => n.id === currId);
            if (foundNode) {
              if (foundNode.leftId) queue.push(foundNode.leftId);
              if (foundNode.rightId) queue.push(foundNode.rightId);
            }
          }
        }
        for (const node of allDiscoveredNodes.values()) {
          node.isDetached = !reachableFromRoot.has(node.id);
        }

        // In-order traversal to calculate non-overlapping horizontal order (treeColumn) & depth (treeDepth)
        if (headId) {
          let inOrderCol = 0;
          const nodeMap = new Map<string, ListNode>();
          for (const n of allDiscoveredNodes.values()) {
            nodeMap.set(n.id, n);
          }
          const assignInOrder = (nodeId: string | null, depth: number) => {
            if (!nodeId) return;
            const n = nodeMap.get(nodeId);
            if (!n) return;
            n.treeDepth = depth;
            if (n.leftId) assignInOrder(n.leftId, depth + 1);
            n.treeColumn = inOrderCol++;
            if (n.rightId) assignInOrder(n.rightId, depth + 1);
          };
          assignInOrder(headId, 0);
        }
      } else {
        const reachableFromHead = new Set<string>();
        if (headId) {
          let currId: string | null = headId;
          const headVisited = new Set<string>();
          while (currId && !headVisited.has(currId)) {
            headVisited.add(currId);
            reachableFromHead.add(currId);
            const foundNode = Array.from(allDiscoveredNodes.values()).find((n) => n.id === currId);
            if (foundNode && foundNode.nextId) {
              currId = foundNode.nextId;
            } else {
              break;
            }
          }
        }
        for (const node of allDiscoveredNodes.values()) {
          node.isDetached = !reachableFromHead.has(node.id);
        }
      }

      // Check active visiting node during traversals (e.g. inorder, preorder, postorder)
      let activeVisitingNodeId: string | null = null;
      const activeVar =
        localVars['root'] ||
        localVars['node'] ||
        localVars['curr'] ||
        localVars['current'] ||
        localVars['p'] ||
        localVars['temp'];
      if (activeVar) {
        const activeAddr = this.parsePointer(activeVar.value);
        if (activeAddr && allDiscoveredNodes.has(activeAddr)) {
          activeVisitingNodeId = this.getStableId(activeAddr);
          const vNode = allDiscoveredNodes.get(activeAddr);
          if (vNode) {
            vNode.isVisiting = true;
          }
        }
      }

        allNodes = Array.from(allDiscoveredNodes.values());

        // Mark newly connected node
        if (previousSnapshot) {
          const prevReachableIds = new Set(
            previousSnapshot.nodes.filter((n) => !n.isDetached).map((n) => n.id)
          );
          for (const node of allNodes) {
            if (!node.isDetached && !prevReachableIds.has(node.id)) {
              node.isNewlyConnected = true;
            }
          }
        }
      }

      // Check if the executed line printed something (cout / printf)
      const hasPrint =
        executedLineText.includes('cout') || executedLineText.includes('printf');
      const printedInStep = hasPrint
        ? await this.evaluatePrintStatement(evalExpr, executedLineText)
        : null;
      if (printedInStep) {
        this.accumulatedTerminalOutput += printedInStep;
      }

      // 7. Extract Stack State if applicable
      let stackData: StackModel | undefined = undefined;
      if (structureType === 'stack') {
        stackData = await this.extractStackState(evalExpr, localVars, executedLineText, previousSnapshot, frames);
      }

      // 8. Generate Pedagogical Explanation
      let { explanation, changeType } = ExplanationGenerator.generate(
        allNodes,
        headId,
        previousSnapshot,
        hasHead,
        activePointers,
        printedInStep,
        this.accumulatedTerminalOutput,
        structureType,
        activeVisitingNodeId,
        funcName,
        arrays,
        indexPointers,
        stackData
      );

      // If execution reached the return statement or end of main, mark as final
      if (isReturnOrEnd) {
        changeType = 'final';
        if (structureType === 'tree') {
          explanation = `Binary tree execution complete (${allNodes.length} nodes). Program execution finished.`;
        } else if (structureType === 'array') {
          const mainArr = arrays[0];
          if (mainArr) {
            explanation = `Array execution complete: [${mainArr.elements.map((e) => e.value).join(', ')}]. Program execution finished.`;
          } else {
            explanation = 'Program execution finished.';
          }
        } else if (structureType === 'stack') {
          explanation = `Stack execution complete. Program execution finished.`;
        } else {
          const chainNodes = allNodes.filter((n) => !n.isDetached);
          if (chainNodes.length > 0) {
            explanation = `The linked list is complete: head → ${chainNodes.map((n) => n.data).join(' → ')} → nullptr. Program execution finished.`;
          } else {
            explanation = 'Program execution finished.';
          }
        }
      }

      const snapshot: LinkedListSnapshot = {
        stepNumber,
        structureType,
        source: sourceLoc,
        hasHead,
        headId,
        activeVisitingNodeId,
        nodes: allNodes,
        pointers: activePointers,
        arrays,
        indexPointers,
        stack: stackData,
        explanation,
        changeType,
        terminalOutput: this.accumulatedTerminalOutput,
        printedInStep: printedInStep || undefined,
        isHistorical: false,
      };

      return snapshot;
    } catch (err) {
      console.error('[StateExtractor] Extraction failed:', err);
      return null;
    }
  }
}
