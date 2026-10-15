import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  LinkedListSnapshot,
  ListNode,
  PointerVariable,
  SourceLocation,
} from '../visualization/linkedListModel';
import { ExplanationGenerator } from '../visualization/explanationGenerator';

export class StateExtractor {
  private static addressToIdMap = new Map<string, string>();
  private static nextIdCounter = 1;
  private static initLinesCache = new Map<string, Map<string, number>>();
  private static activeSourceFile: string | null = null;
  private static lastPausedLine: number | null = null;

  public static setActiveSourceFile(filePath: string): void {
    this.activeSourceFile = filePath;
  }

  public static reset(): void {
    this.addressToIdMap.clear();
    this.nextIdCounter = 1;
    this.initLinesCache.clear();
    this.lastPausedLine = null;
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

  private static getVariableInitLines(sourceFilePath?: string): Map<string, number> {
    const resolvedPath = this.resolveFilePath(sourceFilePath) || sourceFilePath || '';
    const map = new Map<string, number>();
    try {
      if (fs.existsSync(resolvedPath)) {
        const content = fs.readFileSync(resolvedPath, 'utf8');
        const lines = content.split('\n');
        let insideFunction = false;
        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i].trim();
          const lineNum = i + 1;

          // Only scan variables inside main() or function bodies, ignore struct definitions!
          if (lineText.includes('main(') || lineText.includes('main (')) {
            insideFunction = true;
            continue;
          }
          if (!insideFunction) {
            continue;
          }

          // Skip member pointer assignments like first->next = second;
          if (lineText.includes('->') || lineText.startsWith('.')) {
            continue;
          }
          // Match Node pointer declarations like Node* first = ... or Node *second = ...
          const match = lineText.match(/(?:Node\s*\*|auto\s*\*?)\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
          if (match) {
            const varName = match[1];
            // Blacklist struct members
            if (varName === 'next' || varName === 'data') {
              continue;
            }
            if (!map.has(varName)) {
              map.set(varName, lineNum);
            }
          }
        }
      }
    } catch {
      // Ignore read errors
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

  private static parsePointer(valStr?: string | null): string | null {
    if (!valStr) return null;
    const s = valStr.trim();
    if (
      s === '0x0' ||
      s === 'nullptr' ||
      s === '0' ||
      s.includes('0x0 <') ||
      s.includes('nullptr') ||
      s.includes('NULL') ||
      s.includes('0x00000000')
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
    const match = valStr.match(/-?\d+/);
    return match ? parseInt(match[0], 10) : valStr.trim();
  }

  public static async extractState(
    session: vscode.DebugSession,
    threadId: number,
    stepNumber: number,
    previousSnapshot?: LinkedListSnapshot
  ): Promise<LinkedListSnapshot | null> {
    try {
      // 1. Get Top Stack Frame
      const stackResponse = await session.customRequest('stackTrace', {
        threadId,
        startFrame: 0,
        levels: 1,
      });

      const topFrame = stackResponse?.stackFrames?.[0];
      if (!topFrame) {
        return null;
      }

      const frameId = topFrame.id;
      const funcName = (topFrame.name || '').trim();
      const rawPath = topFrame.source?.path || topFrame.source?.name || 'source.cpp';

      // Check if this frame is outside main() or in CRT startup/exit
      const isMain = funcName === 'main' || funcName.startsWith('main(') || funcName.startsWith('main()');
      const isCrt =
        funcName.toLowerCase().includes('crt') ||
        funcName.toLowerCase().includes('startup') ||
        rawPath.toLowerCase().includes('crt') ||
        rawPath.toLowerCase().includes('startup') ||
        !funcName;

      // If stepping outside main() or into C runtime exit/startup, keep the completed linked list
      if (!isMain || isCrt) {
        if (previousSnapshot) {
          return {
            ...previousSnapshot,
            stepNumber,
            explanation: 'Program execution completed. The linked list is complete.',
            changeType: 'final',
            isHistorical: false,
          };
        }
        return null;
      }

      const rawLine = topFrame.line;
      const resolvedFile = this.resolveFilePath(rawPath) || rawPath;

      // Parse variable initialization lines from source code
      const initLines = this.getVariableInitLines(resolvedFile);
      const currentLine = rawLine;

      // 'head' is only valid after its declaration line has completed execution
      const headInitLine = initLines.get('head');
      const hasHead = headInitLine !== undefined ? currentLine > headInitLine : true;

      // If head declaration line hasn't finished executing, return clean empty canvas!
      if (!hasHead) {
        this.lastPausedLine = rawLine;
        return {
          stepNumber,
          source: {
            file: resolvedFile,
            line: 0,
            functionName: topFrame.name,
          },
          hasHead: false,
          headId: null,
          nodes: [],
          pointers: [],
          explanation: 'Program paused at start of main(). Click Next to execute: Node* head = nullptr;',
          changeType: 'init',
          isHistorical: false,
        };
      }

      // The line that just completed execution is the line GDB was previously paused on
      const executedLine = this.lastPausedLine !== null ? this.lastPausedLine : rawLine;
      this.lastPausedLine = rawLine;

      const sourceLoc: SourceLocation = {
        file: resolvedFile,
        line: executedLine,
        functionName: topFrame.name,
      };

      const lineText = this.getLineText(sourceLoc.file, sourceLoc.line);
      const isReturnOrEnd = lineText.startsWith('return') || lineText === '}';

      // 2. Discover local variables via Scopes or direct evaluation
      let localVars: Record<string, { value: string; variablesReference: number }> = {};
      try {
        const scopesRes = await session.customRequest('scopes', { frameId });
        const localScope = scopesRes?.scopes?.find(
          (s: any) =>
            s.name.toLowerCase().includes('local') ||
            s.name.toLowerCase().includes('variables')
        ) || scopesRes?.scopes?.[0];

        if (localScope && localScope.variablesReference > 0) {
          const varsRes = await session.customRequest('variables', {
            variablesReference: localScope.variablesReference,
          });
          if (varsRes?.variables) {
            for (const v of varsRes.variables) {
              localVars[v.name] = {
                value: v.value,
                variablesReference: v.variablesReference,
              };
            }
          }
        }
      } catch (err) {
        // Scopes request might not be supported; we'll evaluate directly
      }

      // Safe evaluation helper
      const evalExpr = async (expr: string): Promise<string | null> => {
        try {
          const res = await session.customRequest('evaluate', {
            expression: expr,
            frameId,
            context: 'watch',
          });
          return res?.result ?? null;
        } catch {
          return null;
        }
      };

      // 3. Inspect 'head'
      let headAddr: string | null = null;
      let headId: string | null = null;
      if (hasHead) {
        const headValStr = localVars['head']?.value ?? (await evalExpr('head'));
        headAddr = this.parsePointer(headValStr);
        if (headAddr) {
          headId = this.getStableId(headAddr);
        }
      }

      // 4. Traverse reachable linked list from head
      const reachableNodes: Map<string, ListNode> = new Map();
      let currAddr: string | null = headAddr;
      let currExpr = 'head';
      const visitedAddrs = new Set<string>();
      let depth = 0;
      const MAX_DEPTH = 30; // Bound traversal to prevent cycle crashes

      while (currAddr && !visitedAddrs.has(currAddr) && depth < MAX_DEPTH) {
        visitedAddrs.add(currAddr);
        depth++;
        const id = this.getStableId(currAddr);

        // Evaluate data and next
        const dataStr = await evalExpr(`${currExpr}->data`);
        const nextValStr = await evalExpr(`${currExpr}->next`);
        const nextAddr = this.parsePointer(nextValStr);
        const nextId = nextAddr ? this.getStableId(nextAddr) : null;

        reachableNodes.set(currAddr, {
          id,
          address: currAddr,
          data: this.parseData(dataStr || '0'),
          nextId,
          nextAddress: nextAddr,
          isHead: currAddr === headAddr,
          isDetached: false,
          variableName: currAddr === headAddr ? 'head' : undefined,
        });

        if (nextAddr) {
          currAddr = nextAddr;
          currExpr = `${currExpr}->next`;
        } else {
          break;
        }
      }

      // 5. Track Active Pointer Variables (ONLY variables that exist in the student's code)
      const activePointers: PointerVariable[] = [];

      // Collect head pointer
      if (hasHead) {
        activePointers.push({
          name: 'head',
          targetNodeId: headId,
          targetAddress: headAddr,
          isNull: headAddr === null,
        });
      }

      const detachedNodes: ListNode[] = [];

      // ONLY iterate over variables discovered in the source code!
      for (const [varName, varInitLine] of initLines.entries()) {
        if (varName === 'head') continue;
        if (currentLine <= varInitLine) {
          continue;
        }

        const varValStr = localVars[varName]?.value ?? (await evalExpr(varName));
        const varAddr = this.parsePointer(varValStr);
        const targetId = varAddr ? this.getStableId(varAddr) : null;

        activePointers.push({
          name: varName,
          targetNodeId: targetId,
          targetAddress: varAddr,
          isNull: varAddr === null,
        });

        // If this pointer points to an allocated node not yet in reachableNodes, extract it
        if (varAddr && !reachableNodes.has(varAddr)) {
          if (!detachedNodes.some((d) => d.address === varAddr)) {
            const dataStr = await evalExpr(`${varName}->data`);
            const nextValStr = await evalExpr(`${varName}->next`);
            const nextAddr = this.parsePointer(nextValStr);
            const nextId = nextAddr ? this.getStableId(nextAddr) : null;
            const id = this.getStableId(varAddr);

            detachedNodes.push({
              id,
              address: varAddr,
              data: this.parseData(dataStr || '0'),
              nextId,
              nextAddress: nextAddr,
              isHead: false,
              isDetached: true,
              isNewlyCreated: true,
            });
          }
        }
      }

      // 6. Combine nodes
      const allNodes: ListNode[] = [
        ...Array.from(reachableNodes.values()),
        ...detachedNodes,
      ];

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

      // 7. Generate Pedagogical Explanation
      let { explanation, changeType } = ExplanationGenerator.generate(
        allNodes,
        headId,
        previousSnapshot,
        hasHead,
        activePointers
      );

      // If execution reached the return statement or end of main, mark as final
      if (isReturnOrEnd) {
        changeType = 'final';
        const chainNodes = allNodes.filter((n) => !n.isDetached);
        if (chainNodes.length > 0) {
          explanation = `The linked list is complete: head → ${chainNodes.map((n) => n.data).join(' → ')} → nullptr. Program execution finished.`;
        } else {
          explanation = 'Program execution finished.';
        }
      }

      const snapshot: LinkedListSnapshot = {
        stepNumber,
        source: sourceLoc,
        hasHead,
        headId,
        nodes: allNodes,
        pointers: activePointers,
        explanation,
        changeType,
        isHistorical: false,
      };

      return snapshot;
    } catch (err) {
      console.error('[StateExtractor] Extraction failed:', err);
      return null;
    }
  }
}
