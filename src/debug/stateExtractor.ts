import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  LinkedListSnapshot,
  ListNode,
  SourceLocation,
} from '../visualization/linkedListModel';
import { ExplanationGenerator } from '../visualization/explanationGenerator';

export class StateExtractor {
  private static addressToIdMap = new Map<string, string>();
  private static nextIdCounter = 1;
  private static initLinesCache = new Map<string, Map<string, number>>();

  public static reset(): void {
    this.addressToIdMap.clear();
    this.nextIdCounter = 1;
    this.initLinesCache.clear();
  }

  private static getVariableInitLines(sourceFilePath: string): Map<string, number> {
    let resolvedPath = sourceFilePath;
    if (!fs.existsSync(resolvedPath)) {
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        const candidate = path.join(folders[0].uri.fsPath, sourceFilePath);
        if (fs.existsSync(candidate)) {
          resolvedPath = candidate;
        }
      }
    }

    if (this.initLinesCache.has(resolvedPath)) {
      return this.initLinesCache.get(resolvedPath)!;
    }

    const map = new Map<string, number>();
    try {
      if (fs.existsSync(resolvedPath)) {
        const content = fs.readFileSync(resolvedPath, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i].trim();
          const lineNum = i + 1;
          const match = lineText.match(/(?:(?:\w+\s*\*|\b))([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
          if (match) {
            const varName = match[1];
            if (!map.has(varName)) {
              map.set(varName, lineNum);
            }
          }
        }
      }
    } catch {
      // Ignore read errors
    }

    this.initLinesCache.set(resolvedPath, map);
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
      const sourceLoc: SourceLocation = {
        file: topFrame.source?.path || topFrame.source?.name || 'source.cpp',
        line: topFrame.line,
        functionName: topFrame.name,
      };

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

      // Parse variable initialization lines from source code
      const initLines = this.getVariableInitLines(sourceLoc.file);
      const currentLine = sourceLoc.line;

      // 'head' is only valid after its declaration line has completed execution
      const headInitLine = initLines.get('head');
      const isHeadInitialized = headInitLine !== undefined ? currentLine > headInitLine : true;

      // 3. Inspect 'head'
      let headAddr: string | null = null;
      let headId: string | null = null;
      if (isHeadInitialized) {
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

      // 5. Detect Detached Local Nodes (e.g. first, second, third, temp)
      const detachedCandidates = ['first', 'second', 'third', 'temp', 'newNode', 'curr', 'prev'];
      const detachedNodes: ListNode[] = [];

      for (const varName of detachedCandidates) {
        // Skip uninitialized variables if current line hasn't completed their declaration line
        const varInitLine = initLines.get(varName);
        if (varInitLine !== undefined && currentLine <= varInitLine) {
          continue;
        }

        const varValStr = localVars[varName]?.value ?? (await evalExpr(varName));
        const varAddr = this.parsePointer(varValStr);

        if (varAddr && !reachableNodes.has(varAddr)) {
          // Check if already processed in detached
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
              variableName: varName,
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
      const { explanation, changeType } = ExplanationGenerator.generate(
        allNodes,
        headId,
        previousSnapshot
      );

      const snapshot: LinkedListSnapshot = {
        stepNumber,
        source: sourceLoc,
        headId,
        nodes: allNodes,
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
