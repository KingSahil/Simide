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
  QueueModel,
  QueueSlot,
  SourceLocation,
  StackElement,
  StackModel,
  StructureType,
} from '../visualization/linkedListModel';
import { GraphSnapshot } from '../visualization/graphModel';
import {
  DebuggerPointerVariable,
  discoverGraphLayout,
  findGraphVariableDeclaration,
  GraphStateExtractor,
  isGraphPointerInitializedAtSource,
  matchesGraphType,
  parseGraphPointerValue,
} from './graphStateExtractor';
import { ExplanationGenerator } from '../visualization/explanationGenerator';
import { isExplicitNull, isNodePointerType, resolveObjectHead, RuntimeVariable } from './objectHeadResolver';
import { SourceAnalysisCache } from './sourceAnalysisCache';

class NodeInspectionError extends Error {}

export class StateExtractor {
  private static graphStateExtractor = new GraphStateExtractor();
  private static lastGraphStop: SourceLocation | undefined;
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
  private static cachedQueueFrontExpr: string | null = null;
  private static cachedQueueRearExpr: string | null = null;
  private static cachedQueueCapExpr: string | null = null;
  private static cachedQueueCountExpr: string | null = null;
  private static cachedQueueArrExpr: string | null = null;

  public static setActiveSourceFile(filePath: string): void {
    this.activeSourceFile = filePath;
  }

  public static getAccumulatedTerminalOutput(): string {
    return this.accumulatedTerminalOutput;
  }

  public static appendDapOutput(text: string, category?: string): boolean {
    if (!text || (category !== 'stdout' && category !== 'stderr')) return false;
    this.accumulatedTerminalOutput += text;
    return true;
  }

  public static reset(): void {
    this.addressToIdMap.clear();
    this.nextIdCounter = 1;
    this.graphStateExtractor.reset();
    this.lastGraphStop = undefined;
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
    this.cachedQueueFrontExpr = null;
    this.cachedQueueRearExpr = null;
    this.cachedQueueCapExpr = null;
    this.cachedQueueCountExpr = null;
    this.cachedQueueArrExpr = null;
    SourceAnalysisCache.clear();
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
    return SourceAnalysisCache.getLineText(resolved, lineNum);
  }

  public static discoverNodeTypes(resolvedPath?: string): Set<string> {
    const defaultTypes = new Set<string>([
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
    if (!resolvedPath) return defaultTypes;
    const cached = SourceAnalysisCache.get(resolvedPath);
    if (cached) return cached.nodeTypes;
    return defaultTypes;
  }

  public static discoverArrayDeclarations(resolvedPath?: string): Array<{
    name: string;
    line: number;
    size?: number;
    type: string;
    isDynamic: boolean;
  }> {
    if (!resolvedPath) return [];
    const cached = SourceAnalysisCache.get(resolvedPath);
    if (cached) {
      return cached.arrayDeclarations;
    }
    return [];
  }

  public static getUserDefinedFunctions(sourceFilePath?: string): Set<string> {
    const resolvedPath = this.resolveFilePath(sourceFilePath) || sourceFilePath || '';
    if (!resolvedPath) return new Set();
    const cached = SourceAnalysisCache.get(resolvedPath);
    if (cached) {
      return cached.userDefinedFunctions;
    }
    return new Set();
  }

  public static parseStructMembers(resolvedPath?: string): {
    dataField: string;
    nextField: string;
    leftField: string;
    rightField: string;
    structureType: StructureType;
    nodeType?: string;
  } {
    if (!resolvedPath) {
      return { dataField: 'data', nextField: 'next', leftField: 'left', rightField: 'right', structureType: 'linked_list' };
    }
    const cached = SourceAnalysisCache.get(resolvedPath);
    if (cached) {
      return cached.structMembers;
    }
    return { dataField: 'data', nextField: 'next', leftField: 'left', rightField: 'right', structureType: 'linked_list' };
  }

  public static getVariableDeclarations(sourceFilePath?: string): Map<string, number[]> {
    const resolvedPath = this.resolveFilePath(sourceFilePath) || sourceFilePath || '';
    if (!resolvedPath) return new Map();
    const cached = SourceAnalysisCache.get(resolvedPath);
    if (cached) {
      return cached.declaredVariables;
    }
    return new Map();
  }

  public static getFunctionRanges(
    resolvedPath?: string
  ): Array<{ name: string; startLine: number; endLine: number; params?: string[] }> {
    if (!resolvedPath) return [];
    const cached = SourceAnalysisCache.get(resolvedPath);
    if (cached) {
      return cached.functionRanges;
    }
    return [];
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

    // 2. Label actual subscript expressions (j, j+1), not every small integer.
    // This is a bounded hint in the legacy source-discovery path: support a
    // variable with an optional constant offset, without executing C++ expressions.
    let sourceHints = '';
    if (resolvedFile) {
      const cached = SourceAnalysisCache.get(resolvedFile);
      if (cached) {
        sourceHints = cached.sanitizedContent;
      }
    }
    const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const arr of discoveredArrays) {
      const sourceName = arr.name.split(/\.|->/).pop()!;
      const subscriptPattern = new RegExp(`\\b${escapePattern(sourceName)}\\s*\\[([^\\]]+)\\]`, 'g');
      const seen = new Set<string>();
      for (const match of sourceHints.matchAll(subscriptPattern)) {
        const sourceLine = sourceHints.slice(0, match.index!).split('\n').length;
        if (arrayDeclList.some(decl => decl.name === sourceName && decl.line === sourceLine)) continue;
        const expression = match[1].match(/^\s*([a-zA-Z_]\w*)\s*(?:([+-])\s*(\d+))?\s*$/);
        if (!expression) continue;
        const [, name, operator, amount] = expression;
        const label = name + (operator ? operator + amount : '');
        if (seen.has(label)) continue;
        seen.add(label);
        const variable = localVars[name];
        const declarations = Array.from(sourceHints.matchAll(new RegExp(
          `\\b(?:int|short|long|(?:std::)?size_t|u?int\\d+_t|auto)\\s+${escapePattern(name)}\\s*(?=[=;,{()])`, 'g'
        )), declaration => sourceHints.slice(0, declaration.index!).split('\n').length);
        const localDeclarations = declarations.filter(line =>
          !funcRange || (line >= funcRange.startLine && line <= funcRange.endLine)
        );
        if (!variable?.isArgument && localDeclarations.length && !localDeclarations.some(line => line < rawLine)) continue;
        // A lexical local that is absent from debugger scope must not be probed:
        // that can resurrect a stale/uninitialized loop variable such as k.
        if (!variable && localDeclarations.length) continue;
        let value: string | undefined = variable?.value;
        if (variable) {
          if (!variable.isArgument && !localDeclarations.some(line => line < rawLine)) continue;
          if (!/\b(?:int|short|long|size_t|u?int\d+_t)\b/.test(variable.type || '') || /\*/.test(variable.type || '')) continue;
        } else {
          // Preserve support for source-referenced class/member indices only.
          const parent = arr.name.includes('.') ? arr.name.slice(0, arr.name.lastIndexOf('.')) : null;
          value = (parent ? await evalExpr(`${parent}.${name}`) || await evalExpr(`${parent}->${name}`) : null)
            || await evalExpr(`this->${name}`) || undefined;
        }
        if (!value || !/^[+-]?\d+$/.test(value.trim())) continue;
        const base = Number(value);
        const offset = operator ? Number(amount) * (operator === '-' ? -1 : 1) : 0;
        const index = base + offset;
        if (!Number.isSafeInteger(index) || index < 0 || index >= arr.size) continue;
        indexPointers.push({ name: label, targetIndex: index, targetArrayName: arr.name, value: index });
        if (arr.elements[index]) arr.elements[index].isActive = true;
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

  public static async extractQueueState(
    evalExpr: (expr: string, targetFrameId?: number) => Promise<string | null>,
    localVars: Record<string, any>,
    executedLineText: string,
    previousSnapshot?: LinkedListSnapshot,
    frames?: any[]
  ): Promise<QueueModel | undefined> {
    let queueName = 'q';
    let frontVal = -1;
    let rearVal = -1;
    let capacity = 5;

    for (const k of Object.keys(localVars)) {
      if (k.toLowerCase().includes('queue') || k.toLowerCase().startsWith('q')) {
        queueName = k;
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

    const frontCands = [
      'this->front',
      'this->m_front',
      `${queueName}.front`,
      `${queueName}.m_front`,
      'q.front',
      'queue.front',
      'front',
      'm_front',
    ];
    if (this.cachedQueueFrontExpr) {
      frontCands.unshift(this.cachedQueueFrontExpr);
    }
    const frontRes = await evaluateAcrossFrames(frontCands);
    if (frontRes) {
      const parsed = parseInt(frontRes.match(/-?\d+/)?.[0] || '', 10);
      if (!isNaN(parsed) && parsed >= -1 && parsed <= 128) {
        frontVal = parsed;
      }
    }

    const rearCands = [
      'this->rear',
      'this->m_rear',
      `${queueName}.rear`,
      `${queueName}.m_rear`,
      'q.rear',
      'queue.rear',
      'rear',
      'm_rear',
    ];
    if (this.cachedQueueRearExpr) {
      rearCands.unshift(this.cachedQueueRearExpr);
    }
    const rearRes = await evaluateAcrossFrames(rearCands);
    if (rearRes) {
      const parsed = parseInt(rearRes.match(/-?\d+/)?.[0] || '', 10);
      if (!isNaN(parsed) && parsed >= -1 && parsed <= 128) {
        rearVal = parsed;
      }
    }

    const capCands = [
      'this->capacity',
      'this->MAX',
      'this->CAPACITY',
      `${queueName}.capacity`,
      `${queueName}.MAX`,
      `${queueName}.CAPACITY`,
      'q.capacity',
      'queue.capacity',
      'capacity',
      'MAX',
      'CAPACITY',
    ];
    if (this.cachedQueueCapExpr) {
      capCands.unshift(this.cachedQueueCapExpr);
    }
    const capRes = await evaluateAcrossFrames(capCands);
    if (capRes) {
      const parsed = parseInt(capRes.match(/\d+/)?.[0] || '', 10);
      if (!isNaN(parsed) && parsed >= 2 && parsed <= 128) {
        capacity = parsed;
      }
    }

    let countVal: number | null = null;
    const countCands = [
      'this->count',
      'this->size',
      'this->m_count',
      `${queueName}.count`,
      `${queueName}.size`,
      'q.count',
      'queue.count',
      'count',
      'size',
    ];
    if (this.cachedQueueCountExpr) {
      countCands.unshift(this.cachedQueueCountExpr);
    }
    const countRes = await evaluateAcrossFrames(countCands);
    if (countRes) {
      const parsed = parseInt(countRes.match(/\d+/)?.[0] || '', 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 128) {
        countVal = parsed;
      }
    }

    // If unresolved in current step, preserve previous pointers if valid
    if (frontVal === -1 && previousSnapshot?.queue?.front !== undefined && previousSnapshot.queue.front >= 0) {
      frontVal = previousSnapshot.queue.front;
    }
    if (rearVal === -1 && previousSnapshot?.queue?.rear !== undefined && previousSnapshot.queue.rear >= 0) {
      rearVal = previousSnapshot.queue.rear;
    }

    let activeMethod: 'enqueue' | 'dequeue' | 'front' | 'rear' | null = null;
    let methodParam: number | string | undefined = undefined;
    const cleanLine = executedLineText.toLowerCase();
    if (cleanLine.includes('enqueue(') || cleanLine.includes('push(')) {
      activeMethod = 'enqueue';
      const m = executedLineText.match(/(?:enqueue|push)\s*\(\s*([^)]+)\s*\)/i);
      if (m) {
        const valRes = await evalExpr(m[1].trim());
        methodParam = valRes && this.isValidEvalNumber(valRes) ? this.parseData(valRes) : m[1].trim();
      }
    } else if (cleanLine.includes('dequeue(') || cleanLine.includes('pop(')) {
      activeMethod = 'dequeue';
    } else if (cleanLine.includes('front(') || cleanLine.includes('getfront(')) {
      activeMethod = 'front';
    } else if (cleanLine.includes('rear(') || cleanLine.includes('getrear(')) {
      activeMethod = 'rear';
    }

    const slots: QueueSlot[] = [];
    let foundArrName: string | null = null;
    let foundArrFrameId: number | undefined = undefined;

    const arrNames = [
      'this->arr',
      'this->items',
      'this->data',
      'this->elements',
      `${queueName}.arr`,
      `${queueName}.items`,
      `${queueName}.data`,
      `${queueName}.elements`,
      'q.arr',
      'queue.arr',
      'arr',
      'items',
      'data',
      'elements',
    ];
    if (this.cachedQueueArrExpr) {
      arrNames.unshift(this.cachedQueueArrExpr);
    }

    for (const fId of frameIdsToTry) {
      for (const aName of arrNames) {
        const test = await evalExpr(`${aName}[0]`, fId);
        if (this.isValidEvalNumber(test)) {
          foundArrName = aName;
          foundArrFrameId = fId;
          this.cachedQueueArrExpr = aName;
          break;
        }
      }
      if (foundArrName) break;
    }

    let size = 0;
    if (countVal !== null) {
      size = countVal;
    } else if (frontVal !== -1 && rearVal !== -1) {
      if (rearVal >= frontVal) {
        size = rearVal - frontVal + 1;
      } else {
        size = capacity - frontVal + rearVal + 1;
      }
    }

    // Only if BOTH frontVal and rearVal are explicitly -1 (and count is 0 or null) do we consider the queue completely uninitialized/empty
    if (frontVal === -1 && rearVal === -1) {
      size = 0;
    }

    if (foundArrName) {
      for (let i = 0; i < capacity; i++) {
        const elRes = await evalExpr(`${foundArrName}[${i}]`, foundArrFrameId);
        const val = this.isValidEvalNumber(elRes) ? this.parseData(elRes) : null;
        let hasVal = false;
        if (size > 0 && frontVal !== -1 && rearVal !== -1) {
          if (countVal !== null) {
            const offsetFromFront = (i - frontVal + capacity) % capacity;
            hasVal = offsetFromFront < countVal;
          } else if (frontVal <= rearVal) {
            hasVal = i >= frontVal && i <= rearVal;
          } else {
            hasVal = i >= frontVal || i <= rearVal;
          }
        }
        slots.push({
          index: i,
          value: hasVal ? val : null,
          hasValue: hasVal,
          isFront: frontVal >= 0 && i === frontVal,
          isRear: rearVal >= 0 && i === rearVal,
          isHighlighted:
            (activeMethod === 'enqueue' && i === rearVal) ||
            (activeMethod === 'dequeue' && i === frontVal),
        });
      }
    } else {
      for (let i = 0; i < capacity; i++) {
        let hasVal = false;
        if (size > 0 && frontVal !== -1 && rearVal !== -1) {
          if (countVal !== null) {
            const offsetFromFront = (i - frontVal + capacity) % capacity;
            hasVal = offsetFromFront < countVal;
          } else if (frontVal <= rearVal) {
            hasVal = i >= frontVal && i <= rearVal;
          } else {
            hasVal = i >= frontVal || i <= rearVal;
          }
        }
        const prevVal = previousSnapshot?.queue?.slots[i]?.value ?? null;
        slots.push({
          index: i,
          value: hasVal ? prevVal : null,
          hasValue: hasVal,
          isFront: frontVal >= 0 && i === frontVal,
          isRear: rearVal >= 0 && i === rearVal,
        });
      }
    }

    const justWrapped =
      (activeMethod === 'enqueue' && rearVal === 0 && (previousSnapshot?.queue?.rear === capacity - 1)) ||
      (frontVal > rearVal && previousSnapshot?.queue?.front !== undefined && previousSnapshot.queue.front <= previousSnapshot.queue.rear);

    return {
      name: queueName,
      slots,
      front: frontVal,
      rear: rearVal,
      capacity,
      size,
      isCircular: true,
      justWrapped,
      activeMethod,
      methodParam,
      isOverflow: size >= capacity && activeMethod === 'enqueue',
      isUnderflow: size === 0 && activeMethod === 'dequeue',
    };
  }

  public static async extractGraphState(
    session: vscode.DebugSession,
    threadId: number,
    stepNumber: number
  ): Promise<GraphSnapshot | null> {
    try {
      const stackResponse = await session.customRequest('stackTrace', {
        threadId,
        startFrame: 0,
        levels: 25,
      });
      const frames = stackResponse?.stackFrames || [];
      const userFrames = frames.filter((frame: any) => {
        const file = frame.source?.path || frame.source?.name || '';
        const name = (frame.name || '').toLowerCase();
        return this.isUserSource(file) && !name.includes('crt') && !name.includes('startup');
      });
      if (userFrames.length === 0) return null;

      const sourceFile =
        this.resolveFilePath(userFrames[0].source?.path || userFrames[0].source?.name) ||
        this.resolveFilePath();
      if (!sourceFile) return null;

      const sourceText = SourceAnalysisCache.getRawContent(sourceFile);
      const layout = discoverGraphLayout(sourceText);
      if (!layout) return null;

      const currentStop: SourceLocation = {
        file: sourceFile,
        line: userFrames[0].line,
        functionName: userFrames[0].name || '',
      };
      // Match the executed-line policy used by every other visualization.
      const executedSource = this.lastGraphStop || currentStop;
      this.lastGraphStop = currentStop;

      const frameLocals: Array<{
        frameId: number;
        frameName: string;
        line: number;
        sourceText: string;
        variables: Array<{ name: string; type?: string; value: string; scopeName: string }>;
      }> = [];
      for (const frame of userFrames) {
        try {
          const frameSourceFile =
            this.resolveFilePath(frame.source?.path || frame.source?.name) || sourceFile;
          const scopesResponse = await session.customRequest('scopes', { frameId: frame.id });
          const variables: Array<{
            name: string;
            type?: string;
            value: string;
            scopeName: string;
          }> = [];
          for (const scope of scopesResponse?.scopes || []) {
            const scopeName = (scope.name || '').toLowerCase();
            if (
              (!scopeName.includes('arg') && !scopeName.includes('param') &&
                !scopeName.includes('local') && !scopeName.includes('var') &&
                !scopeName.includes('global') && !scopeName.includes('static')) ||
              scope.variablesReference <= 0
            ) {
              continue;
            }
            const variablesResponse = await session.customRequest('variables', {
              variablesReference: scope.variablesReference,
            });
            for (const variable of variablesResponse?.variables || []) {
              variables.push({
                name: variable.name,
                type: variable.type,
                value: variable.value,
                scopeName,
              });
            }
          }
          frameLocals.push({
            frameId: frame.id,
            frameName: frame.name || '',
            line: frame.line || 0,
            sourceText:
              frameSourceFile === sourceFile
                ? sourceText
                : SourceAnalysisCache.getRawContent(frameSourceFile),
            variables,
          });
        } catch (err) {
          console.warn(
            `[StateExtractor] Could not inspect debugger scopes for frame '${frame.name || frame.id}'.`,
            err
          );
        }
      }

      const pointerVariables: DebuggerPointerVariable[] = frameLocals.flatMap((locals) =>
        locals.variables
          .filter((variable) => {
            if (
              !variable.scopeName.includes('local') &&
              !variable.scopeName.includes('var')
            ) {
              return true;
            }
            const pointerType = variable.type
              ?.replace(/\b(?:const|volatile)\b/g, '')
              .replace(/\s*\*+\s*$/, '')
              .replace(/^struct\s+/, '')
              .trim();
            return !!pointerType && isGraphPointerInitializedAtSource(
              locals.sourceText,
              pointerType,
              variable.name,
              locals.line
            );
          })
          .map((variable) => ({
            name: variable.name,
            type: variable.type,
            value: variable.value,
          }))
      );
      const createEvaluator = (frameId: number) => async (
        expression: string
      ): Promise<string | null> => {
        try {
          const response = await session.customRequest('evaluate', {
            expression,
            frameId,
            context: 'watch',
          });
          return response?.result ?? null;
        } catch {
          return null;
        }
      };
      const extractWithoutRegistry = async (
        frameId: number,
        source: SourceLocation,
        explanation: string
      ): Promise<GraphSnapshot> => {
        const snapshot = await this.graphStateExtractor.extract(
          layout,
          '',
          false,
          stepNumber,
          createEvaluator(frameId),
          pointerVariables,
          source,
          true
        );
        return {
          ...snapshot,
          isComplete: false,
          explanation:
            snapshot.graph.vertices.length === 0 && snapshot.graph.edges.length === 0 &&
            explanation !== 'Graph not initialized yet.'
              ? 'Graph registry unavailable.'
              : explanation,
        };
      };

      let pendingGraph: {
        name: string;
        declaration: ReturnType<typeof findGraphVariableDeclaration>;
        line: number;
        frameId: number;
        frameName: string;
      } | undefined;
      for (const frame of frameLocals) {
        const graphVariable = frame.variables.find((variable) =>
          matchesGraphType(variable.type, layout.graphType)
        );
        if (!graphVariable) continue;

        const declaration = findGraphVariableDeclaration(
          sourceText,
          layout.graphType,
          graphVariable.name,
          frame.line
        );
        if (
          !declaration ||
          !declaration.initialized ||
          frame.line <= declaration.line
        ) {
          pendingGraph = {
            name: graphVariable.name,
            declaration,
            line: frame.line,
            frameId: frame.frameId,
            frameName: frame.frameName,
          };
          continue;
        }

        const graphIsPointer = graphVariable.type?.includes('*') ?? false;
        const graphPointer = graphIsPointer
          ? parseGraphPointerValue(graphVariable.value)
          : { valid: true, address: 'object' };
        if (!graphPointer.valid) {
          console.warn(
            `[StateExtractor] Could not read Graph pointer variable '${graphVariable.name}'.`
          );
          continue;
        }

        const source: SourceLocation = {
          ...executedSource,
        };

        return this.graphStateExtractor.extract(
          layout,
          graphVariable.name,
          graphIsPointer,
          stepNumber,
          createEvaluator(frame.frameId),
          pointerVariables,
          source,
          graphIsPointer && graphPointer.address === null
        );
      }
      if (pendingGraph) {
        return extractWithoutRegistry(
          pendingGraph.frameId,
          {
            ...executedSource,
          },
          'Graph not initialized yet.'
        );
      }
      return extractWithoutRegistry(
        frameLocals[0]?.frameId ?? userFrames[0].id,
        {
          ...executedSource,
        },
        'Graph registry unavailable; safely readable typed vertices are shown.'
      );
    } catch (err) {
      console.error('[StateExtractor] Graph extraction failed:', err);
      return null;
    }
  }

  public static async extractState(
    session: vscode.DebugSession,
    threadId: number,
    stepNumber: number,
    previousSnapshot?: LinkedListSnapshot
  ): Promise<LinkedListSnapshot | null> {
    let inspectionSource: SourceLocation | undefined;
    let inspectionStructure: StructureType = 'linked_list';
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
        nodeType: parsedNodeType,
      } = this.parseStructMembers(resolvedFile);

      if (!this.cachedDataField && parsedDataField) this.cachedDataField = parsedDataField;
      if (!this.cachedNextField && parsedNextField) this.cachedNextField = parsedNextField;
      if (!this.cachedLeftField && parsedLeftField) this.cachedLeftField = parsedLeftField;
      if (!this.cachedRightField && parsedRightField) this.cachedRightField = parsedRightField;
      if (!this.cachedStructureType && parsedStructureType) this.cachedStructureType = parsedStructureType;
      const structureType = this.cachedStructureType || parsedStructureType || 'linked_list';
      const nodeType = parsedNodeType || (structureType === 'tree' ? 'TreeNode' : 'Node');
      inspectionStructure = structureType;

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
        // Intentional SimIDE teaching behavior: show the line whose execution
        // produced this snapshot, not the debugger's next pending instruction.
        line: executedLine,
        functionName: userFrame.name,
      };
      inspectionSource = { ...sourceLoc };

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

      // Step 2.1: Fast lookup registry of in-scope variable names
      const availableNames = new Set<string>(Object.keys(localVars));

      // Evaluation helper in current frame or specific target frame
      const evalExpr = async (expr: string, targetFrameId: number = frameId): Promise<string | null> => {
        try {
          const res = await session.customRequest('evaluate', {
            expression: expr,
            frameId: targetFrameId,
            context: 'watch',
          });
          const value = res?.result;
          if (typeof value !== 'string' || !value.trim() ||
              /(?:<error|error:|cannot access|no symbol|optimized out|not available|not defined|unable to create|has no member|incomplete type)/i.test(value)) {
            return null;
          }
          return value;
        } catch {
          return null;
        }
      };

      // Absolute-address heap reads are safe to retry in another user frame.
      // Do not do this for local expressions: recursive frames can shadow names.
      const heapFrameIds = Array.from(new Set<number>([
        frameId,
        ...frames.filter((f: any) => this.isUserSource(f.source?.path || f.source?.name || ''))
          .map((f: any) => f.id).reverse(),
      ]));
      let heapFrameId = frameId;
      const evalHeapExpr = async (expression: string): Promise<string | null> => {
        for (const id of [heapFrameId, ...heapFrameIds.filter(id => id !== heapFrameId)]) {
          const value = await evalExpr(expression, id);
          if (value !== null) {
            heapFrameId = id;
            return value;
          }
        }
        return null;
      };
      const requireNodeValue = (value: string | null, expression: string, pointer = false): string => {
        const isNullPointer = value !== null &&
          /(?:\bnullptr\b|\bNULL\b|\(nil\)|\b0x0+\b|^0$)/.test(value.trim());
        if (value === null || (pointer && !isNullPointer && !this.parsePointer(value))) {
          throw new NodeInspectionError(`Debugger could not read ${expression} in the available user frames.`);
        }
        return value;
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
      } else if (structureType === 'stack' || structureType === 'queue') {
        // Stack and queue models are linear/circular array/buffer structures.
        // Skip linked-list and binary-tree pointer chasing to eliminate 30+ redundant GDB roundtrips.
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

      // Resolve actual node-pointer members from objects in main/caller frames.
      // An object value may contain an address; that does not make it a Node*.
      let headResolved = false;
      const frameVariables = new Map<number, RuntimeVariable[]>();
      frameVariables.set(frameId, Object.entries(localVars).map(([name, variable]) => ({ name, ...variable })));

      const ensureFrameVariables = async (targetFrameId: number): Promise<RuntimeVariable[]> => {
        const existing = frameVariables.get(targetFrameId);
        if (existing) return existing;
        const variables: RuntimeVariable[] = [];
        try {
          const response = await session.customRequest('scopes', { frameId: targetFrameId });
          for (const scope of response?.scopes || []) {
            if (!/local|var|arg|param/i.test(scope.name || '') || !scope.variablesReference) continue;
            const res = await session.customRequest('variables', { variablesReference: scope.variablesReference });
            variables.push(...(res?.variables || []));
          }
        } catch { /* Existing expression-based discovery remains available */ }
        frameVariables.set(targetFrameId, variables);
        return variables;
      };

      const mainFrameForObjects = frames.find((frame: any) =>
        frame.name === 'main' || frame.name?.startsWith('main(')
      );
      const objectFrames = [mainFrameForObjects, ...[...frames].reverse()].filter((frame: any, index, all) =>
        frame && this.isUserSource(frame.source?.path || frame.source?.name || '') &&
        all.findIndex(candidate => candidate?.id === frame.id) === index
      );
      const recordTypes = this.discoverNodeTypes(resolvedFile);
      const memberNames = headCandidates.filter(candidate => !candidate.includes('->'));
      for (const frame of objectFrames) {
        const vars = await ensureFrameVariables(frame.id);
        const result = await resolveObjectHead(
          vars, nodeType, recordTypes, memberNames,
          async reference => (await session.customRequest('variables', { variablesReference: reference }))?.variables || [],
          expression => evalExpr(expression, frame.id), value => this.parsePointer(value)
        );
        if (result) {
          headAddr = result.address;
          headResolved = true; // A verified nullptr is distinct from a failed read.
          break;
        }
      }
      const isNonNodeVariable = (name: string, id: number) => {
        const variable = frameVariables.get(id)?.find(variable => variable.name === name);
        return !!variable?.type && !isNodePointerType(variable.type, nodeType);
      };

      // Step 2.2: Build targeted candidate list dynamically based on in-scope variables
      const getTargetedCandidates = (targetFrameId: number, vars: RuntimeVariable[]): string[] => {
        if (!vars || vars.length === 0) {
          return headCandidates;
        }

        const varMap = new Map<string, RuntimeVariable>();
        for (const v of vars) {
          varMap.set(v.name, v);
        }

        const candidates: string[] = [];
        const added = new Set<string>();

        const addCandidate = (name: string) => {
          if (!added.has(name)) {
            added.add(name);
            candidates.push(name);
          }
        };

        const treePriority = [
          'root', 'pRoot', 'tree', 't', '_root', 'm_root', 'root_ref',
          'head', 'pHead', 'first', 'start', 'head_ref', 'dummy', 'list'
        ];
        const listPriority = [
          'head', 'pHead', 'headNode', 'first', 'start', 'listHead',
          '_head', 'm_head', 'head_ref', 'l1', 'l2', 'dummy', 'dummyHead',
          'h', 'list', 'root', 'pRoot', 'tree', 't', 'root_ref'
        ];
        const priorityList = structureType === 'tree' ? treePriority : listPriority;

        // Stage 1: Standard head names present in frame scope
        for (const name of priorityList) {
          if (varMap.has(name)) {
            addCandidate(name);
          }
        }

        // Stage 2: Pointer / node-like variables in frame scope
        for (const v of vars) {
          if (added.has(v.name)) continue;
          const vType = v.type || '';
          const cleanType = vType.replace(/\b(?:const|volatile|struct|class)\b|[*&\s]/g, '');
          if (
            isNodePointerType(vType, nodeType) ||
            (vType.includes('*') && (recordTypes.has(cleanType) || varDecls.has(v.name)))
          ) {
            addCandidate(v.name);
          }
        }

        // Stage 3: Class member pointers if 'this' is in scope
        if (varMap.has('this')) {
          const thisPriority = structureType === 'tree'
            ? ['this->root', 'this->pRoot', 'this->tree', 'this->head', 'this->first']
            : ['this->head', 'this->first', 'this->pHead', 'this->headNode', 'this->root', 'this->tree'];
          for (const expr of thisPriority) {
            addCandidate(expr);
          }
        }

        return candidates.length > 0 ? candidates : headCandidates;
      };

      // A: Try current user frame (only if we're in main — in helper functions like insert()
      // the 'root' parameter may be a by-value nullptr copy, not the actual tree root)
      const isInMain = isInsideMain;
      if (isInMain && !headResolved) {
        const currentVars = await ensureFrameVariables(frameId);
        const candidates = getTargetedCandidates(frameId, currentVars);
        for (const cand of candidates) {
          if (isNonNodeVariable(cand, frameId)) continue;
          if (varDecls.has(cand) && !this.isVariableInitialized(cand, rawLine, varDecls, funcRange)) {
            continue;
          }
          let valStr: string | null | undefined = localVars[cand]?.value;
          if (!valStr || cand.includes('->')) {
            valStr = await evalExpr(cand);
          }
          if (valStr) {
            let isNull = false;
            if (cand === 'head_ref' || cand === 'root_ref' || valStr.includes('**')) {
              const derefVal = await evalExpr(`*${cand}`);
              headAddr = this.parsePointer(derefVal);
              isNull = derefVal ? isExplicitNull(derefVal) : false;
            } else {
              headAddr = this.parsePointer(valStr);
              isNull = isExplicitNull(valStr);
            }
            // Step 2.3: Fast early-exit on explicit null
            if (isNull) {
              headResolved = true;
              headAddr = null;
              break;
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
      if (!headAddr && !headResolved) {
        const mainFrame = frames.find((f: any) => {
          const name = (f.name || '').toLowerCase();
          const path = f.source?.path || f.source?.name || '';
          return this.isUserSource(path) && (name === 'main' || name.startsWith('main('));
        });

        if (mainFrame) {
          const mainVars = await ensureFrameVariables(mainFrame.id);
          const mainCandidates = getTargetedCandidates(mainFrame.id, mainVars);
          for (const cand of mainCandidates) {
            if (isNonNodeVariable(cand, mainFrame.id)) continue;
            const valStr = await evalExpr(cand, mainFrame.id);
            if (valStr) {
              let candidate: string | null = null;
              let isNull = false;
              if (cand === 'head_ref' || cand === 'root_ref' || valStr.includes('**')) {
                const derefVal = await evalExpr(`*${cand}`, mainFrame.id);
                candidate = this.parsePointer(derefVal);
                isNull = derefVal ? isExplicitNull(derefVal) : false;
              } else {
                candidate = this.parsePointer(valStr);
                isNull = isExplicitNull(valStr);
              }
              // Step 2.3: Fast early-exit on explicit null
              if (isNull) {
                headResolved = true;
                headAddr = null;
                break;
              }
              if (candidate && !this.deletedAddresses.has(candidate)) {
                headAddr = candidate;
                break;
              }
            }
          }
        }

        // Priority 2: Check caller frames from outermost to innermost
        if (!headAddr && !headResolved) {
          for (let i = frames.length - 1; i >= 0; i--) {
            const callerFrame = frames[i];
            const callerPath = callerFrame.source?.path || callerFrame.source?.name || '';
            if (!this.isUserSource(callerPath)) continue;
            if (mainFrame && callerFrame.id === mainFrame.id) continue;

            const callerVars = await ensureFrameVariables(callerFrame.id);
            const callerCandidates = getTargetedCandidates(callerFrame.id, callerVars);
            for (const cand of callerCandidates) {
              if (isNonNodeVariable(cand, callerFrame.id)) continue;
              const valStr = await evalExpr(cand, callerFrame.id);
              if (valStr) {
                let candidate: string | null = null;
                let isNull = false;
                if (cand === 'head_ref' || cand === 'root_ref' || valStr.includes('**')) {
                  const derefVal = await evalExpr(`*${cand}`, callerFrame.id);
                  candidate = this.parsePointer(derefVal);
                  isNull = derefVal ? isExplicitNull(derefVal) : false;
                } else {
                  candidate = this.parsePointer(valStr);
                  isNull = isExplicitNull(valStr);
                }
                // Step 2.3: Fast early-exit on explicit null
                if (isNull) {
                  headResolved = true;
                  headAddr = null;
                  break;
                }
                if (candidate && !this.deletedAddresses.has(candidate)) {
                  headAddr = candidate;
                  break;
                }
              }
            }
            if (headAddr || headResolved) break;
          }
        }
      }

      // C: Retain previous head address if still valid and not deleted
      if (!headAddr && !headResolved && previousSnapshot?.headId) {
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

          const dataField = await this.resolveDataField(evalHeapExpr, ptrCast);
          const nextField = await this.resolveNextField(evalHeapExpr, ptrCast);

          const dataStr = requireNodeValue(await evalHeapExpr(`${ptrCast}->${dataField}`), `${ptrCast}->${dataField}`);
          const nextValStr = requireNodeValue(await evalHeapExpr(`${ptrCast}->${nextField}`), `${ptrCast}->${nextField}`, true);
          const nextAddr = this.parsePointer(nextValStr);

          const nextId =
            nextAddr && !this.deletedAddresses.has(nextAddr)
              ? this.getStableId(nextAddr)
              : null;

          const isNodeHead = currAddr === headAddr;

          allDiscoveredNodes.set(currAddr, {
            id,
            address: currAddr,
            data: this.parseData(dataStr),
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

          const dataField = await this.resolveDataField(evalHeapExpr, ptrCast);
          const leftField = await this.resolveLeftField(evalHeapExpr, ptrCast);
          const rightField = await this.resolveRightField(evalHeapExpr, ptrCast);

          const dataStr = requireNodeValue(await evalHeapExpr(`${ptrCast}->${dataField}`), `${ptrCast}->${dataField}`);
          const leftValStr = requireNodeValue(await evalHeapExpr(`${ptrCast}->${leftField}`), `${ptrCast}->${leftField}`, true);
          const rightValStr = requireNodeValue(await evalHeapExpr(`${ptrCast}->${rightField}`), `${ptrCast}->${rightField}`, true);

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
            data: this.parseData(dataStr),
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
      activePointers = [];

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

        const isDeclaredPointer = varDecls.has(varName);
        // A pointer/reference to an ostream, buffer, or container is not a Node*.
        // In particular, debugger return values after cout must not be traversed.
        const pointedType = (varInfo.type || '')
          .replace(/\b(?:const|volatile|struct|class)\b|[*&]/g, '').trim();
        const isPointerType = varInfo.type?.trim()
          ? varInfo.type.includes('*') && (pointedType === nodeType || pointedType.endsWith('::' + nodeType))
          : isDeclaredPointer;
        let varAddr = this.parsePointer(varInfo.value);
        if (isPointerType && varInfo.type) {
          const depth = (varInfo.type.match(/\*/g) || []).length;
          if (depth > 1) {
            // Node** stores a pointer slot, not a node. Resolve the slot first.
            if (!/^[a-zA-Z_]\w*$/.test(varName) || depth > 3) continue;
            const value = await evalExpr(`${'*'.repeat(depth - 1)}${varName}`);
            if (value === null) continue;
            varAddr = this.parsePointer(value);
          }
        }
        const isFreed = varAddr ? this.deletedAddresses.has(varAddr) : false;
        const targetId = varAddr && !isFreed ? this.getStableId(varAddr) : null;
        const isTargetingKnownNode = varAddr ? allDiscoveredNodes.has(varAddr) : false;

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
      activeVisitingNodeId = null;
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

      // 7. Extract Stack or Queue State if applicable
      let stackData: StackModel | undefined = undefined;
      let queueData: QueueModel | undefined = undefined;
      if (structureType === 'stack') {
        stackData = await this.extractStackState(evalExpr, localVars, executedLineText, previousSnapshot, frames);
      } else if (structureType === 'queue') {
        queueData = await this.extractQueueState(evalExpr, localVars, executedLineText, previousSnapshot, frames);
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
        stackData,
        queueData
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
        } else if (structureType === 'queue') {
          explanation = `Circular queue execution complete. Program execution finished.`;
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
        queue: queueData,
        explanation,
        changeType,
        terminalOutput: this.accumulatedTerminalOutput,
        printedInStep: printedInStep || undefined,
        isHistorical: false,
      };

      return snapshot;
    } catch (err) {
      if (err instanceof NodeInspectionError) {
        console.warn('[StateExtractor] Node inspection unavailable:', err.message);
        return {
          ...(previousSnapshot || {
            structureType: inspectionStructure,
            hasHead: false,
            headId: null,
          }),
          stepNumber,
          source: inspectionSource,
          nodes: (previousSnapshot?.nodes || []).map(node => ({
            ...node, isVisiting: false, isNewlyCreated: false, isNewlyConnected: false,
          })),
          pointers: previousSnapshot?.pointers?.map(pointer => ({ ...pointer })),
          activeVisitingNodeId: null,
          explanation: previousSnapshot
            ? 'Debugger inspection is temporarily unavailable. Showing the last verified state; step again to retry.'
            : 'Debugger inspection is unavailable at this stop. Step again to retry; no verified structure is available yet.',
          changeType: 'step',
          inspectionWarning: err.message,
          printedInStep: undefined,
          isHistorical: false,
        };
      }
      console.error('[StateExtractor] Extraction failed:', err);
      return null;
    }
  }
}
