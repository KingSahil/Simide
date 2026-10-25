import * as fs from 'fs';
import { StructureType } from '../visualization/linkedListModel';
import { discoverGraphLayout } from './graphStateExtractor';

export interface CachedStructMembers {
  dataField: string;
  nextField: string;
  leftField: string;
  rightField: string;
  structureType: StructureType;
  nodeType?: string;
}

export interface CachedArrayDeclaration {
  name: string;
  line: number;
  size?: number;
  type: string;
  isDynamic: boolean;
}

export interface CachedFunctionRange {
  name: string;
  startLine: number;
  endLine: number;
  params?: string[];
}

export interface CachedSourceAnalysis {
  filePath: string;
  mtimeMs: number;
  content: string;
  lines: string[];
  sanitizedContent: string;
  sanitizedLines: string[];
  visualizationMode: 'graph' | 'linked_list';
  structMembers: CachedStructMembers;
  nodeTypes: Set<string>;
  declaredVariables: Map<string, number[]>;
  functionRanges: CachedFunctionRange[];
  arrayDeclarations: CachedArrayDeclaration[];
  userDefinedFunctions: Set<string>;
}

export class SourceAnalysisCache {
  private static cache = new Map<string, CachedSourceAnalysis>();

  public static get(filePath?: string): CachedSourceAnalysis | null {
    if (!filePath) return null;
    try {
      if (!fs.existsSync(filePath)) return null;
      const stat = fs.statSync(filePath);
      const existing = this.cache.get(filePath);
      if (existing && existing.mtimeMs === stat.mtimeMs) {
        return existing;
      }
      const analyzed = this.analyze(filePath, stat.mtimeMs);
      this.cache.set(filePath, analyzed);
      return analyzed;
    } catch {
      return null;
    }
  }

  public static getRawContent(filePath?: string): string {
    if (!filePath) return '';
    const cached = this.get(filePath);
    if (cached) return cached.content;
    try {
      return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    } catch {
      return '';
    }
  }

  public static getLines(filePath?: string): string[] {
    if (!filePath) return [];
    const cached = this.get(filePath);
    return cached ? cached.lines : [];
  }

  public static getLineText(filePath: string, lineNum: number): string {
    const lines = this.getLines(filePath);
    if (lineNum >= 1 && lineNum <= lines.length) {
      return lines[lineNum - 1].trim();
    }
    return '';
  }

  public static invalidate(filePath?: string): void {
    if (filePath) {
      this.cache.delete(filePath);
    } else {
      this.cache.clear();
    }
  }

  public static clear(): void {
    this.cache.clear();
  }

  private static analyze(filePath: string, mtimeMs: number): CachedSourceAnalysis {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Sanitized version replacing comments & string literals with spaces (preserves line/column indices)
    const sanitizedContent = content.replace(
      /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
      (text) => text.replace(/[^\n]/g, ' ')
    );
    const sanitizedLines = sanitizedContent.split('\n');

    // 1. Visualization mode
    const visualizationMode: 'graph' | 'linked_list' = discoverGraphLayout(content)
      ? 'graph'
      : 'linked_list';

    // 2. Discover node types
    const nodeTypes = new Set<string>([
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
    const structMatches = content.matchAll(/(?:struct|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g);
    for (const m of structMatches) {
      nodeTypes.add(m[1]);
    }

    // 3. Struct Members Analysis
    let dataField = 'data';
    let nextField = 'next';
    let leftField = 'left';
    let rightField = 'right';
    let structureType: StructureType = 'linked_list';
    let hasNodePointer = false;
    let nodeType: string | undefined;

    const allStructs = Array.from(
      content.matchAll(/(?:struct|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g)
    );
    for (const sm of allStructs) {
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
      const ptrMatches = Array.from(
        body.matchAll(
          /(?:(?:struct\s+)?(?:[a-zA-Z_][a-zA-Z0-9_]*|<[a-zA-Z0-9_,\s]+>)\s*\*+|\*+\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*;/g
        )
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
        nodeType = structName;
      } else if (hasNext) {
        structureType = 'linked_list';
        hasNodePointer = true;
        nextField = hasNext;
        nodeType = structName;
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

    if (!hasNodePointer) {
      const isStack =
        content.includes('<stack>') ||
        /(?:class|struct)\s+(?:Array)?Stack/i.test(content) ||
        /\bstack\s*<\s*[^>]+\s*>/i.test(content) ||
        (/\btop\b/i.test(content) &&
          (/\bpush\b/i.test(content) || /\bpop\b/i.test(content)));

      const isQueue =
        content.includes('<queue>') ||
        /(?:class|struct)\s+(?:Circular|Array)?Queue/i.test(content) ||
        /\bqueue\s*<\s*[^>]+\s*>/i.test(content) ||
        ((/\bfront\b/i.test(content) || /\brear\b/i.test(content)) &&
          (/\benqueue\b/i.test(content) || /\bdequeue\b/i.test(content)));

      if (isStack) {
        structureType = 'stack';
      } else if (isQueue) {
        structureType = 'queue';
      }
    }

    // 4. Array Declarations
    const arrayDeclarations: CachedArrayDeclaration[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;
      if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('#')) {
        continue;
      }

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
        arrayDeclarations.push({
          name,
          line: lineNum,
          size: parsedSize,
          type: 'int[]',
          isDynamic: false,
        });
        continue;
      }

      const dynamicMatch = line.match(
        /(?:(?:int|long|short|char|double|float|string|bool)\s*\*|auto)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*new\s+[a-zA-Z0-9_]+\s*\[([^\]]+)\]/
      );
      if (dynamicMatch) {
        const name = dynamicMatch[1];
        const sizeExpr = dynamicMatch[2].trim();
        const parsedSize = parseInt(sizeExpr, 10);
        arrayDeclarations.push({
          name,
          line: lineNum,
          size: isNaN(parsedSize) ? undefined : parsedSize,
          type: 'int*',
          isDynamic: true,
        });
      }
    }

    if (!hasNodePointer && structureType !== 'stack' && structureType !== 'queue') {
      if (arrayDeclarations.length > 0) {
        structureType = 'array';
      }
    }

    // 5. Variable Declarations Map
    const declaredVariables = new Map<string, number[]>();
    const typePattern = Array.from(nodeTypes).join('|');
    const declRegex = new RegExp(
      `(?:(?:struct\\s+)?\\b(?:${typePattern})\\b\\s*(?:\\*\\s*&?|&\\s*\\*?)|\\bauto\\b\\s*\\*?|,\\s*(?:\\*\\s*&?|&\\s*\\*?))\\s*([a-zA-Z_][a-zA-Z0-9_]*)`,
      'g'
    );
    let inStructDef = false;
    let braceDepth = 0;

    for (let i = 0; i < sanitizedLines.length; i++) {
      const lineText = sanitizedLines[i].trim();
      const lineNum = i + 1;

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
          varName &&
          varName !== 'nullptr' &&
          varName !== 'NULL' &&
          varName !== 'return' &&
          varName !== 'new' &&
          !nodeTypes.has(varName)
        ) {
          if (!declaredVariables.has(varName)) {
            declaredVariables.set(varName, []);
          }
          declaredVariables.get(varName)!.push(lineNum);
        }
      }
    }

    // 6. Function Ranges
    const functionRanges: CachedFunctionRange[] = [];
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
              functionRanges.push({
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

    // 7. User-defined functions set
    const userDefinedFunctions = new Set<string>();
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
        continue;
      }
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
          userDefinedFunctions.add(name);
        }
      }
    }

    return {
      filePath,
      mtimeMs,
      content,
      lines,
      sanitizedContent,
      sanitizedLines,
      visualizationMode,
      structMembers: {
        dataField,
        nextField,
        leftField,
        rightField,
        structureType,
        nodeType,
      },
      nodeTypes,
      declaredVariables,
      functionRanges,
      arrayDeclarations,
      userDefinedFunctions,
    };
  }
}
