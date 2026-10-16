"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// test/mockVscode.ts
var window, workspace, extensions, debug;
var init_mockVscode = __esm({
  "test/mockVscode.ts"() {
    "use strict";
    window = {
      activeTextEditor: void 0,
      visibleTextEditors: [],
      createTextEditorDecorationType: () => ({ dispose: () => {
      } }),
      showWarningMessage: () => {
      },
      showErrorMessage: () => {
      },
      showInformationMessage: () => {
      }
    };
    workspace = {
      workspaceFolders: [
        {
          uri: {
            fsPath: process.cwd()
          }
        }
      ]
    };
    extensions = {
      getExtension: (id) => ({ id })
    };
    debug = {
      startDebugging: async () => true,
      stopDebugging: async () => {
      }
    };
  }
});

// src/visualization/explanationGenerator.ts
var ExplanationGenerator;
var init_explanationGenerator = __esm({
  "src/visualization/explanationGenerator.ts"() {
    "use strict";
    ExplanationGenerator = class {
      static generate(currentNodes, headId, previousSnapshot, hasHead = true, pointers = [], printedInStep, accumulatedOutput, structureType = "linked_list", activeVisitingNodeId, currentFuncName) {
        if (structureType === "tree") {
          if (!hasHead) {
            return {
              explanation: "Program paused at main(). Click Next to execute: TreeNode* root = nullptr;",
              changeType: "init"
            };
          }
          if (printedInStep) {
            const cleanPrint = printedInStep.replace(/\n$/, "");
            const totalClean = (accumulatedOutput || "").trim();
            const summaryText = totalClean.length > 0 ? ` Program output: ${totalClean}` : "";
            return {
              explanation: `Printed to terminal: "${cleanPrint}".${summaryText}`,
              changeType: "print"
            };
          }
          const prevNodes2 = previousSnapshot?.nodes || [];
          if (previousSnapshot) {
            const newNodes = currentNodes.filter((c) => !prevNodes2.some((p) => p.id === c.id));
            if (newNodes.length > 0) {
              const newest = newNodes[newNodes.length - 1];
              const parent = currentNodes.find((n) => n.leftId === newest.id || n.rightId === newest.id);
              if (parent) {
                const isLeft = parent.leftId === newest.id;
                return {
                  explanation: `Node containing ${newest.data} inserted as ${isLeft ? "LEFT" : "RIGHT"} child of node ${parent.data}.`,
                  changeType: "tree_child_linked"
                };
              } else if (newest.id === headId) {
                return {
                  explanation: `Tree root initialized to node containing ${newest.data}.`,
                  changeType: "tree_root_assigned"
                };
              } else {
                return {
                  explanation: `Created new tree node containing ${newest.data}.`,
                  changeType: "tree_node_created"
                };
              }
            }
          }
          if (activeVisitingNodeId) {
            const visitingNode = currentNodes.find((n) => n.id === activeVisitingNodeId);
            if (visitingNode) {
              const fnInfo = currentFuncName ? ` in ${currentFuncName}()` : "";
              return {
                explanation: `Visiting tree node containing ${visitingNode.data}${fnInfo}.`,
                changeType: "tree_traversal_visit"
              };
            }
          }
          if (currentNodes.length === 0) {
            return {
              explanation: "root is initialized to nullptr. The tree is currently empty.",
              changeType: "init"
            };
          }
          if (headId) {
            const rootNode = currentNodes.find((n) => n.id === headId);
            return {
              explanation: `Binary tree with root containing ${rootNode?.data ?? ""} (${currentNodes.length} node${currentNodes.length > 1 ? "s" : ""}).`,
              changeType: "step"
            };
          }
          return {
            explanation: `Binary tree state updated (${currentNodes.length} node${currentNodes.length > 1 ? "s" : ""}).`,
            changeType: "step"
          };
        }
        if (!hasHead) {
          return {
            explanation: "Program paused at main(). Click Next to execute: Node* head = nullptr;",
            changeType: "init"
          };
        }
        if (printedInStep) {
          const cleanPrint = printedInStep.replace(/\n$/, "");
          const totalClean = (accumulatedOutput || "").trim();
          const summaryText = totalClean.length > 0 ? ` Program output: ${totalClean}` : "";
          return {
            explanation: `Printed to terminal: "${cleanPrint}".${summaryText}`,
            changeType: "print"
          };
        }
        const chain = [];
        let currId = headId;
        const visited = /* @__PURE__ */ new Set();
        while (currId && !visited.has(currId)) {
          visited.add(currId);
          const found = currentNodes.find((n) => n.id === currId);
          if (found) {
            chain.push(found);
            currId = found.nextId;
          } else {
            break;
          }
        }
        const prevNodes = previousSnapshot?.nodes || [];
        if (previousSnapshot && prevNodes.length > 0) {
          const deletedNodes = prevNodes.filter((p) => !currentNodes.some((c) => c.id === p.id));
          if (deletedNodes.length > 0) {
            const delNode = deletedNodes[0];
            const ptr = previousSnapshot.pointers?.find((p) => p.targetNodeId === delNode.id && p.name !== "head");
            const ptrRef = ptr ? ` ('${ptr.name}')` : "";
            return {
              explanation: `Freed heap memory for node containing ${delNode.data}${ptrRef} via delete.`,
              changeType: "node_deleted"
            };
          }
        }
        if (previousSnapshot) {
          for (const currNode of currentNodes) {
            const prevNode = prevNodes.find((p) => p.id === currNode.id);
            if (prevNode && prevNode.data !== currNode.data) {
              const ptr = pointers.find((p) => p.targetNodeId === currNode.id);
              const ref = ptr ? ` ('${ptr.name}')` : "";
              return {
                explanation: `Assigned value ${currNode.data} to node${ref} (data updated: ${prevNode.data} \u2192 ${currNode.data}).`,
                changeType: "step"
              };
            }
          }
        }
        if (previousSnapshot) {
          for (const currNode of currentNodes) {
            const prevNode = prevNodes.find((p) => p.id === currNode.id);
            if (prevNode && prevNode.nextId !== currNode.nextId) {
              const oldTarget = prevNodes.find((p) => p.id === prevNode.nextId);
              const newTarget = currentNodes.find((c) => c.id === currNode.nextId);
              if (oldTarget && newTarget && oldTarget.id !== newTarget.id) {
                return {
                  explanation: `Node containing ${currNode.data} unlinked from node ${oldTarget.data} and now points directly to node ${newTarget.data} (bypassing node ${oldTarget.data}).`,
                  changeType: "node_bypassed"
                };
              }
              if (oldTarget && !newTarget) {
                return {
                  explanation: `Node containing ${currNode.data} disconnected from node ${oldTarget.data} (next pointer set to nullptr).`,
                  changeType: "node_bypassed"
                };
              }
              if (!oldTarget && newTarget) {
                return {
                  explanation: `The node containing ${currNode.data} now points to the node containing ${newTarget.data}.`,
                  changeType: "node_linked"
                };
              }
            }
          }
        }
        if (previousSnapshot && previousSnapshot.headId !== headId) {
          if (!previousSnapshot.headId && headId) {
            const headNode = currentNodes.find((n) => n.id === headId);
            const aliasPtrs = pointers.filter((p) => p.targetNodeId === headId && p.name !== "head").map((p) => p.name);
            const aliasText = aliasPtrs.length > 0 ? `head points to the node containing ${headNode?.data ?? ""} (aliasing pointer '${aliasPtrs.join(", ")}' at address ${headNode?.address ?? ""}).` : `head points to the node containing ${headNode?.data ?? ""}.`;
            return {
              explanation: aliasText,
              changeType: "head_assigned"
            };
          } else if (previousSnapshot.headId && headId) {
            const headNode = currentNodes.find((n) => n.id === headId);
            return {
              explanation: `head pointer updated to point to node containing ${headNode?.data ?? ""}.`,
              changeType: "head_assigned"
            };
          } else if (!headId) {
            return {
              explanation: "head is now nullptr. The linked list is empty.",
              changeType: "step"
            };
          }
        }
        if (previousSnapshot) {
          const newNodes = currentNodes.filter((c) => !prevNodes.some((p) => p.id === c.id));
          if (newNodes.length > 0) {
            const newest = newNodes[newNodes.length - 1];
            const ptr = pointers.find((p) => p.targetNodeId === newest.id && p.name !== "head");
            const ptrName = ptr ? ptr.name : "pointer";
            if (newest.isDetached) {
              return {
                explanation: `${ptrName} pointer created, pointing to a new Node containing ${newest.data}. It is not yet connected to the list.`,
                changeType: "node_created"
              };
            } else {
              return {
                explanation: `New node containing ${newest.data} allocated and connected to the list.`,
                changeType: "node_linked"
              };
            }
          }
        }
        if (previousSnapshot) {
          for (const currPtr of pointers) {
            if (currPtr.name === "head")
              continue;
            const prevPtr = previousSnapshot.pointers?.find((p) => p.name === currPtr.name);
            if (prevPtr && prevPtr.targetNodeId !== currPtr.targetNodeId) {
              if (currPtr.isNull || !currPtr.targetNodeId) {
                return {
                  explanation: `Pointer '${currPtr.name}' updated to nullptr (reached end of list).`,
                  changeType: "pointer_moved"
                };
              } else {
                const targetNode = currentNodes.find((n) => n.id === currPtr.targetNodeId);
                return {
                  explanation: `Pointer '${currPtr.name}' advanced to node containing ${targetNode?.data ?? ""}.`,
                  changeType: "pointer_moved"
                };
              }
            } else if (!prevPtr && !currPtr.isNull && currPtr.targetNodeId) {
              const targetNode = currentNodes.find((n) => n.id === currPtr.targetNodeId);
              return {
                explanation: `Pointer '${currPtr.name}' initialized, pointing to node containing ${targetNode?.data ?? ""}.`,
                changeType: "pointer_moved"
              };
            }
          }
        }
        if (!headId) {
          const detachedNodes = currentNodes.filter((n) => n.isDetached);
          if (detachedNodes.length === 0) {
            return {
              explanation: structureType === "tree" ? "root is initialized to nullptr. The binary tree is currently empty." : "head is initialized to nullptr. The linked list is currently empty.",
              changeType: "init"
            };
          } else {
            const newest = detachedNodes[detachedNodes.length - 1];
            const ptr = pointers.find((p) => p.targetNodeId === newest.id);
            const ptrName = ptr ? ptr.name : "first";
            return {
              explanation: `${ptrName} pointer created, pointing to a new Node containing ${newest.data}. head is still null.`,
              changeType: "node_created"
            };
          }
        }
        if (chain.length === 1) {
          return {
            explanation: `The first node is connected. head points to the node containing ${chain[0].data}.`,
            changeType: "head_assigned"
          };
        } else if (chain.length === 2) {
          return {
            explanation: `The first node now points to the second node: head \u2192 ${chain[0].data} \u2192 ${chain[1].data} \u2192 nullptr.`,
            changeType: "node_linked"
          };
        } else if (chain.length >= 3) {
          return {
            explanation: `Linked list: head \u2192 ${chain.map((n) => n.data).join(" \u2192 ")} \u2192 nullptr.`,
            changeType: "node_linked"
          };
        }
        return {
          explanation: `Current list: head points to ${chain.length} node(s).`,
          changeType: "step"
        };
      }
    };
  }
});

// src/debug/stateExtractor.ts
var stateExtractor_exports = {};
__export(stateExtractor_exports, {
  StateExtractor: () => StateExtractor
});
var fs3, path3, StateExtractor;
var init_stateExtractor = __esm({
  "src/debug/stateExtractor.ts"() {
    "use strict";
    init_mockVscode();
    fs3 = __toESM(require("fs"));
    path3 = __toESM(require("path"));
    init_explanationGenerator();
    StateExtractor = class {
      static addressToIdMap = /* @__PURE__ */ new Map();
      static nextIdCounter = 1;
      static activeSourceFile = null;
      static lastPausedLine = null;
      static deletedAddresses = /* @__PURE__ */ new Set();
      static cachedDataField = null;
      static cachedNextField = null;
      static cachedLeftField = null;
      static cachedRightField = null;
      static cachedStructureType = null;
      static accumulatedTerminalOutput = "";
      static hasInitializedList = false;
      static setActiveSourceFile(filePath) {
        this.activeSourceFile = filePath;
      }
      static getAccumulatedTerminalOutput() {
        return this.accumulatedTerminalOutput;
      }
      static appendDapOutput(_text) {
      }
      static reset() {
        this.addressToIdMap.clear();
        this.nextIdCounter = 1;
        this.lastPausedLine = null;
        this.deletedAddresses.clear();
        this.cachedDataField = null;
        this.cachedNextField = null;
        this.cachedLeftField = null;
        this.cachedRightField = null;
        this.cachedStructureType = null;
        this.accumulatedTerminalOutput = "";
        this.hasInitializedList = false;
      }
      static resolveFilePath(sourceFilePath) {
        if (sourceFilePath && fs3.existsSync(sourceFilePath)) {
          return sourceFilePath;
        }
        if (this.activeSourceFile && fs3.existsSync(this.activeSourceFile)) {
          return this.activeSourceFile;
        }
        const folders = workspace.workspaceFolders;
        if (folders && folders.length > 0) {
          const root = folders[0].uri.fsPath;
          const base = sourceFilePath ? path3.basename(sourceFilePath) : "linked-list.cpp";
          const candidates = [
            path3.join(root, "examples", base),
            path3.join(root, base),
            path3.join(root, "examples", "linked-list.cpp")
          ];
          for (const c of candidates) {
            if (fs3.existsSync(c)) {
              return c;
            }
          }
        }
        return null;
      }
      static isUserSource(filePath) {
        if (!filePath)
          return false;
        const norm = filePath.replace(/\\/g, "/").toLowerCase();
        if (norm.includes("/include/c++/") || norm.includes("/mingw") || norm.includes("crt") || norm.includes("startup") || norm.includes("<built-in>") || norm.includes("/bits/") || norm.includes("/ext/") || norm.includes("ostream") || norm.includes("istream") || norm.includes("streambuf")) {
          return false;
        }
        if (this.activeSourceFile) {
          const activeNorm = this.activeSourceFile.replace(/\\/g, "/").toLowerCase();
          if (norm === activeNorm || norm.endsWith("/" + path3.basename(activeNorm))) {
            return true;
          }
        }
        const folders = workspace.workspaceFolders;
        if (folders) {
          for (const f of folders) {
            const rootNorm = f.uri.fsPath.replace(/\\/g, "/").toLowerCase();
            if (norm.startsWith(rootNorm)) {
              return true;
            }
          }
        }
        return !norm.includes("/mingw") && !norm.includes("crt");
      }
      static getLineText(filePath, lineNum) {
        const resolved = this.resolveFilePath(filePath);
        if (!resolved)
          return "";
        try {
          const content = fs3.readFileSync(resolved, "utf8");
          const lines = content.split("\n");
          if (lineNum >= 1 && lineNum <= lines.length) {
            return lines[lineNum - 1].trim();
          }
        } catch {
        }
        return "";
      }
      static discoverNodeTypes(resolvedPath) {
        const types = /* @__PURE__ */ new Set([
          "Node",
          "ListNode",
          "LinkNode",
          "LinkedListNode",
          "SinglyLinkedListNode",
          "DoublyLinkedListNode",
          "TreeNode",
          "BSTNode",
          "BinaryTreeNode",
          "Tree_node",
          "treenode",
          "Node_t",
          "Item",
          "Element",
          "node",
          "listnode"
        ]);
        if (!resolvedPath || !fs3.existsSync(resolvedPath)) {
          return types;
        }
        try {
          const content = fs3.readFileSync(resolvedPath, "utf8");
          const structMatches = content.matchAll(/(?:struct|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g);
          for (const m of structMatches) {
            types.add(m[1]);
          }
        } catch {
        }
        return types;
      }
      static getUserDefinedFunctions(sourceFilePath) {
        const resolvedPath = this.resolveFilePath(sourceFilePath) || sourceFilePath || "";
        const funcNames = /* @__PURE__ */ new Set();
        if (!resolvedPath || !fs3.existsSync(resolvedPath)) {
          return funcNames;
        }
        try {
          const content = fs3.readFileSync(resolvedPath, "utf8");
          const lines = content.split("\n");
          const nodeTypes = this.discoverNodeTypes(resolvedPath);
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("#") || trimmed.startsWith("//") || trimmed.startsWith("/*")) {
              continue;
            }
            const fnMatch = trimmed.match(
              /^(?:[a-zA-Z_][a-zA-Z0-9_:*&<>\s]+\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*(?:const\s*)?(?:\{|:\s*|;|$)/
            );
            if (fnMatch) {
              const name = fnMatch[1];
              if (name !== "main" && name !== "if" && name !== "while" && name !== "for" && name !== "switch" && name !== "catch" && name !== "return" && name !== "sizeof" && name !== "void" && !nodeTypes.has(name)) {
                funcNames.add(name);
              }
            }
          }
        } catch {
        }
        return funcNames;
      }
      static parseStructMembers(resolvedPath) {
        let dataField = "data";
        let nextField = "next";
        let leftField = "left";
        let rightField = "right";
        let structureType = "linked_list";
        if (!resolvedPath || !fs3.existsSync(resolvedPath)) {
          return { dataField, nextField, leftField, rightField, structureType };
        }
        try {
          const content = fs3.readFileSync(resolvedPath, "utf8");
          const structMatches = content.matchAll(/(?:struct|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g);
          for (const sm of structMatches) {
            const structName = sm[1];
            const isTreeNamed = /tree|bst/i.test(structName);
            const structIdx = sm.index ?? content.indexOf(sm[0]);
            const startBrace = content.indexOf("{", structIdx);
            if (startBrace === -1)
              continue;
            let depth = 1;
            let endBrace = -1;
            for (let i = startBrace + 1; i < content.length; i++) {
              if (content[i] === "{")
                depth++;
              else if (content[i] === "}") {
                depth--;
                if (depth === 0) {
                  endBrace = i;
                  break;
                }
              }
            }
            if (endBrace === -1)
              continue;
            const body = content.substring(startBrace + 1, endBrace);
            const ptrMatches = Array.from(
              body.matchAll(/(?:(?:struct\s+)?(?:[a-zA-Z_][a-zA-Z0-9_]*|<[a-zA-Z0-9_,\s]+>)\s*\*+|\*+\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*;/g)
            ).map((m) => m[1]);
            const hasLeft = ptrMatches.find(
              (p) => ["left", "lchild", "left_node", "lc", "pleft", "l"].includes(p.toLowerCase())
            );
            const hasRight = ptrMatches.find(
              (p) => ["right", "rchild", "right_node", "rc", "pright", "r"].includes(p.toLowerCase())
            );
            const hasNext = ptrMatches.find(
              (p) => ["next", "next_node", "link", "ptr", "pnext", "nxt"].includes(p.toLowerCase())
            );
            if (hasLeft || hasRight || isTreeNamed) {
              structureType = "tree";
              if (hasLeft)
                leftField = hasLeft;
              if (hasRight)
                rightField = hasRight;
            } else if (hasNext) {
              structureType = "linked_list";
              nextField = hasNext;
            }
            const dataMatches = body.matchAll(
              /(?:int|long|short|char|string|double|float|T|uint[0-9]+_t|int[0-9]+_t|auto)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*;/g
            );
            for (const dm of dataMatches) {
              const fn = dm[1];
              if (fn !== nextField && fn !== leftField && fn !== rightField && fn !== "prev" && fn !== "previous") {
                dataField = fn;
                break;
              }
            }
            if (dataField && (hasLeft || hasRight || hasNext)) {
              break;
            }
          }
        } catch {
        }
        return { dataField, nextField, leftField, rightField, structureType };
      }
      static getVariableDeclarations(sourceFilePath) {
        const resolvedPath = this.resolveFilePath(sourceFilePath) || sourceFilePath || "";
        const map = /* @__PURE__ */ new Map();
        try {
          if (fs3.existsSync(resolvedPath)) {
            const content = fs3.readFileSync(resolvedPath, "utf8");
            const lines = content.split("\n");
            const nodeTypes = this.discoverNodeTypes(resolvedPath);
            const typePattern = Array.from(nodeTypes).join("|");
            const declRegex = new RegExp(
              `(?:(?:struct\\s+)?(?:${typePattern})\\s*\\*&?|auto\\s*\\*?)\\s*([a-zA-Z_][a-zA-Z0-9_]*)`
            );
            let inStructDef = false;
            let braceDepth = 0;
            for (let i = 0; i < lines.length; i++) {
              const lineText = lines[i].trim();
              const lineNum = i + 1;
              if (lineText.match(/^(?:struct|class)\s+[a-zA-Z_]/)) {
                inStructDef = true;
              }
              if (inStructDef) {
                if (lineText.includes("{"))
                  braceDepth++;
                if (lineText.includes("}")) {
                  braceDepth--;
                  if (braceDepth <= 0) {
                    inStructDef = false;
                    braceDepth = 0;
                  }
                }
                continue;
              }
              if (lineText.includes("->") || lineText.startsWith(".")) {
                continue;
              }
              const match = lineText.match(declRegex);
              if (match) {
                const varName = match[1];
                if (varName === "nullptr" || varName === "NULL" || varName === "return" || varName === "new") {
                  continue;
                }
                if (!map.has(varName)) {
                  map.set(varName, []);
                }
                map.get(varName).push(lineNum);
              }
            }
          }
        } catch {
        }
        return map;
      }
      static getFunctionRanges(resolvedPath) {
        const ranges = [];
        if (!resolvedPath || !fs3.existsSync(resolvedPath))
          return ranges;
        try {
          const content = fs3.readFileSync(resolvedPath, "utf8");
          const lines = content.split("\n");
          let currentFunc = null;
          let depth = 0;
          let inStruct = false;
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            const lineNum = i + 1;
            if (trimmed.startsWith("#") || trimmed.startsWith("//") || trimmed.startsWith("/*")) {
              continue;
            }
            if (trimmed.match(/^(?:struct|class)\s+[a-zA-Z_]/)) {
              inStruct = true;
            }
            if (inStruct) {
              if (trimmed.includes("{"))
                depth++;
              if (trimmed.includes("}")) {
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
                /^(?:[a-zA-Z_][a-zA-Z0-9_:*&<>\s]+\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*(?:const\s*)?\{?/
              );
              if (fnMatch) {
                const name = fnMatch[1];
                if (name !== "if" && name !== "while" && name !== "for" && name !== "switch" && name !== "catch" && name !== "sizeof") {
                  currentFunc = { name, startLine: lineNum };
                  depth = 0;
                }
              }
            }
            if (currentFunc) {
              for (let c = 0; c < line.length; c++) {
                if (line[c] === "{")
                  depth++;
                else if (line[c] === "}") {
                  depth--;
                  if (depth <= 0) {
                    ranges.push({
                      name: currentFunc.name,
                      startLine: currentFunc.startLine,
                      endLine: lineNum
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
        }
        return ranges;
      }
      static getEnclosingFunction(resolvedPath, line) {
        const ranges = this.getFunctionRanges(resolvedPath);
        return ranges.find((r) => line >= r.startLine && line <= r.endLine) || null;
      }
      static isVariableInitialized(varName, rawLine, varDecls, funcRange) {
        const declLines = varDecls.get(varName);
        if (!declLines || declLines.length === 0) {
          return false;
        }
        const relevantDecls = funcRange ? declLines.filter((l) => l >= funcRange.startLine && l <= funcRange.endLine) : declLines;
        if (relevantDecls.length === 0) {
          return false;
        }
        return relevantDecls.some((l) => rawLine > l);
      }
      static hasSteppedPastFirstPointerDecl(rawLine, varDecls, funcRange) {
        if (!funcRange)
          return true;
        const declsInFunc = [];
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
      static getVariableInitLines(sourceFilePath) {
        const decls = this.getVariableDeclarations(sourceFilePath);
        const map = /* @__PURE__ */ new Map();
        for (const [k, v] of decls.entries()) {
          if (v.length > 0) {
            map.set(k, v[0]);
          }
        }
        return map;
      }
      static getStableId(address) {
        const norm = address.toLowerCase();
        if (!this.addressToIdMap.has(norm)) {
          this.addressToIdMap.set(norm, `node_${this.nextIdCounter++}`);
        }
        return this.addressToIdMap.get(norm);
      }
      static parsePointer(valStr) {
        if (!valStr)
          return null;
        let s = valStr.trim();
        if (s.includes(":")) {
          s = s.substring(s.lastIndexOf(":") + 1).trim();
        }
        if (s === "0x0" || s === "nullptr" || s === "0" || s.includes("0x0 <") || s.includes("nullptr") || s.includes("NULL") || s.includes("0x00000000") || s.includes("(nil)") || s.includes("error") || s.includes("Cannot access") || s.includes("No symbol") || s.includes("not defined") || s.includes("optimized out") || s.includes("incomplete") || s.includes("baadf00d") || s.includes("cccccccc") || s.includes("cdcdcdcd") || s.includes("feeefeee") || s.includes("abababab")) {
          return null;
        }
        const match = s.match(/0x[0-9a-fA-F]+/);
        if (match && match[0] !== "0x0" && match[0] !== "0x00000000") {
          return match[0].toLowerCase();
        }
        return null;
      }
      static parseData(valStr) {
        if (!valStr)
          return 0;
        if (valStr.includes("-var-create") || valStr.includes("unable to create") || valStr.includes("error:") || valStr.includes("Error:") || valStr.includes("Cannot access") || valStr.includes("No symbol") || valStr.includes("has no member") || valStr.includes("not defined") || valStr.includes("optimized out") || valStr.includes("incomplete")) {
          return 0;
        }
        const match = valStr.match(/-?\d+/);
        if (match) {
          const n = parseInt(match[0], 10);
          if (n === -1163005939 || n === -858993460 || n === -842150451 || n === -17895697 || n < -1e7 || n > 1e8) {
            return 0;
          }
          return n;
        }
        return valStr.trim();
      }
      static async resolveDataField(evalExpr, ptrExpr) {
        if (this.cachedDataField)
          return this.cachedDataField;
        const candidates = ["data", "val", "value", "item", "key", "element", "info", "payload", "num", "x", "d"];
        for (const c of candidates) {
          const res = await evalExpr(`${ptrExpr}->${c}`);
          if (res !== null && !res.includes("has no member") && !res.includes("error") && !res.includes("Cannot access") && !res.includes("not defined") && !res.includes("No symbol")) {
            this.cachedDataField = c;
            return c;
          }
        }
        return "data";
      }
      static async resolveNextField(evalExpr, ptrExpr) {
        if (this.cachedNextField)
          return this.cachedNextField;
        const candidates = ["next", "next_node", "link", "ptr", "pNext", "nxt", "succ"];
        for (const c of candidates) {
          const res = await evalExpr(`${ptrExpr}->${c}`);
          if (res !== null && !res.includes("has no member") && !res.includes("error") && !res.includes("Cannot access") && !res.includes("not defined") && !res.includes("No symbol")) {
            this.cachedNextField = c;
            return c;
          }
        }
        return "next";
      }
      static async resolveLeftField(evalExpr, ptrExpr) {
        if (this.cachedLeftField)
          return this.cachedLeftField;
        const candidates = ["left", "lchild", "left_node", "lc", "pLeft", "l"];
        for (const c of candidates) {
          const res = await evalExpr(`${ptrExpr}->${c}`);
          if (res !== null && !res.includes("has no member") && !res.includes("error") && !res.includes("Cannot access") && !res.includes("not defined") && !res.includes("No symbol")) {
            this.cachedLeftField = c;
            return c;
          }
        }
        return "left";
      }
      static async resolveRightField(evalExpr, ptrExpr) {
        if (this.cachedRightField)
          return this.cachedRightField;
        const candidates = ["right", "rchild", "right_node", "rc", "pRight", "r"];
        for (const c of candidates) {
          const res = await evalExpr(`${ptrExpr}->${c}`);
          if (res !== null && !res.includes("has no member") && !res.includes("error") && !res.includes("Cannot access") && !res.includes("not defined") && !res.includes("No symbol")) {
            this.cachedRightField = c;
            return c;
          }
        }
        return "right";
      }
      static splitStreamTokens(expr) {
        const tokens = [];
        let current = "";
        let inQuotes = false;
        let quoteChar = "";
        for (let i = 0; i < expr.length; i++) {
          const ch = expr[i];
          if (inQuotes) {
            current += ch;
            if (ch === quoteChar && expr[i - 1] !== "\\") {
              inQuotes = false;
            }
          } else if (ch === '"' || ch === "'") {
            inQuotes = true;
            quoteChar = ch;
            current += ch;
          } else if (ch === "<" && expr[i + 1] === "<") {
            tokens.push(current.trim());
            current = "";
            i++;
          } else {
            current += ch;
          }
        }
        if (current.trim().length > 0) {
          tokens.push(current.trim());
        }
        return tokens;
      }
      static async evaluatePrintStatement(evalExpr, lineText) {
        const trimmed = lineText.trim();
        const coutIndex = trimmed.search(/(?:std::)?cout\s*<</);
        if (coutIndex !== -1) {
          const exprPart = trimmed.substring(coutIndex).replace(/^(?:std::)?cout\s*<<\s*/, "").replace(/;.*$/, "");
          const tokens = this.splitStreamTokens(exprPart);
          let output = "";
          for (const tok of tokens) {
            const t = tok.trim();
            if (t === "endl" || t === "std::endl") {
              output += "\n";
            } else if (t.startsWith('"') && t.endsWith('"') || t.startsWith("'") && t.endsWith("'")) {
              output += t.slice(1, -1).replace(/\\n/g, "\n").replace(/\\t/g, "	");
            } else if (t.length > 0) {
              const val = await evalExpr(t);
              if (val !== null && !val.includes("error") && !val.includes("No symbol") && !val.includes("Cannot access")) {
                const parsed = this.parseData(val);
                output += String(parsed);
              }
            }
          }
          return output.length > 0 ? output : null;
        }
        const printfMatch = trimmed.match(/(?:printf)\s*\(\s*(".*?")\s*(?:,\s*(.*?))?\s*\)/);
        if (printfMatch) {
          let format = printfMatch[1].slice(1, -1).replace(/\\n/g, "\n").replace(/\\t/g, "	");
          const argsStr = printfMatch[2];
          if (argsStr) {
            const args = argsStr.split(",").map((a) => a.trim());
            for (const arg of args) {
              const val = await evalExpr(arg);
              const parsed = val !== null ? String(this.parseData(val)) : "";
              format = format.replace(/%[a-zA-Z0-9.-]+/, parsed);
            }
          }
          return format;
        }
        return null;
      }
      static async extractState(session, threadId, stepNumber, previousSnapshot) {
        try {
          const stackResponse = await session.customRequest("stackTrace", {
            threadId,
            startFrame: 0,
            levels: 25
          });
          const frames = stackResponse?.stackFrames || [];
          if (frames.length === 0) {
            return null;
          }
          const userFrame = frames.find((f) => {
            const p = f.source?.path || f.source?.name || "";
            const name = (f.name || "").toLowerCase();
            return this.isUserSource(p) && !name.includes("crt") && !name.includes("startup");
          });
          if (!userFrame) {
            if (previousSnapshot) {
              return {
                ...previousSnapshot,
                stepNumber,
                explanation: "Program execution completed. The linked list is complete.",
                changeType: "final",
                terminalOutput: this.accumulatedTerminalOutput || previousSnapshot.terminalOutput,
                isHistorical: false
              };
            }
            return null;
          }
          const frameId = userFrame.id;
          const funcName = (userFrame.name || "").trim();
          const rawPath = userFrame.source?.path || userFrame.source?.name || "source.cpp";
          const rawLine = userFrame.line;
          const resolvedFile = this.resolveFilePath(rawPath) || rawPath;
          const {
            dataField: parsedDataField,
            nextField: parsedNextField,
            leftField: parsedLeftField,
            rightField: parsedRightField,
            structureType: parsedStructureType
          } = this.parseStructMembers(resolvedFile);
          if (!this.cachedDataField && parsedDataField)
            this.cachedDataField = parsedDataField;
          if (!this.cachedNextField && parsedNextField)
            this.cachedNextField = parsedNextField;
          if (!this.cachedLeftField && parsedLeftField)
            this.cachedLeftField = parsedLeftField;
          if (!this.cachedRightField && parsedRightField)
            this.cachedRightField = parsedRightField;
          if (!this.cachedStructureType && parsedStructureType)
            this.cachedStructureType = parsedStructureType;
          const structureType = this.cachedStructureType || parsedStructureType || "linked_list";
          const varDecls = this.getVariableDeclarations(resolvedFile);
          const funcRange = this.getEnclosingFunction(resolvedFile, rawLine);
          const isInsideMain = funcName === "main" || funcName.startsWith("main(") || funcName.startsWith("main()");
          let hasHead = this.hasInitializedList;
          if (!hasHead) {
            if (isInsideMain) {
              const candidates = structureType === "tree" ? ["root", "tree", "bst", "head", "t", "r"] : ["head", "root", "first", "list", "start", "dummy", "headNode"];
              let declaredCandidate = null;
              for (const cand of candidates) {
                const lines = varDecls.get(cand);
                const inFunc = funcRange ? lines?.filter((l) => l >= funcRange.startLine && l <= funcRange.endLine) : lines;
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
            } else {
              hasHead = true;
            }
          }
          if (!hasHead) {
            this.lastPausedLine = rawLine;
            const initExplanation = structureType === "tree" ? "Program paused at start. Click Next to allocate and initialize tree: TreeNode* root = ..." : "Program paused at start. Click Next to execute: Node* head = ...";
            return {
              stepNumber,
              structureType,
              source: {
                file: resolvedFile,
                line: rawLine,
                functionName: userFrame.name
              },
              hasHead: false,
              headId: null,
              nodes: [],
              pointers: [],
              explanation: initExplanation,
              changeType: "init",
              terminalOutput: "",
              isHistorical: false
            };
          }
          const executedLine = this.lastPausedLine !== null ? this.lastPausedLine : rawLine;
          this.lastPausedLine = rawLine;
          const sourceLoc = {
            file: resolvedFile,
            line: executedLine,
            functionName: userFrame.name
          };
          const lineText = this.getLineText(sourceLoc.file, rawLine);
          const executedLineText = this.getLineText(sourceLoc.file, executedLine);
          const isReturnOrEnd = isInsideMain && (lineText.startsWith("return") || lineText === "}");
          let localVars = {};
          try {
            const scopesRes = await session.customRequest("scopes", { frameId });
            const scopes = scopesRes?.scopes || [];
            for (const scope of scopes) {
              const sName = (scope.name || "").toLowerCase();
              const isArg = sName.includes("arg") || sName.includes("param");
              const isLocal = sName.includes("local") || sName.includes("var");
              if ((isArg || isLocal) && scope.variablesReference > 0) {
                const varsRes = await session.customRequest("variables", {
                  variablesReference: scope.variablesReference
                });
                if (varsRes?.variables) {
                  for (const v of varsRes.variables) {
                    if (!localVars[v.name]) {
                      localVars[v.name] = {
                        value: v.value,
                        type: v.type,
                        variablesReference: v.variablesReference,
                        isArgument: isArg
                      };
                    }
                  }
                }
              }
            }
          } catch (err) {
          }
          const evalExpr = async (expr, targetFrameId = frameId) => {
            try {
              const res = await session.customRequest("evaluate", {
                expression: expr,
                frameId: targetFrameId,
                context: "watch"
              });
              return res?.result ?? null;
            } catch {
              return null;
            }
          };
          const isDelLine = executedLineText.includes("delete") || executedLineText.includes("free");
          const deleteMatch = isDelLine ? executedLineText.match(
            /(?:delete\s+(?:\[\s*\]\s*)?|free\s*\(\s*)([a-zA-Z_][a-zA-Z0-9_]*)/
          ) : null;
          if (deleteMatch) {
            const delVar = deleteMatch[1];
            let delAddr = null;
            if (previousSnapshot?.pointers) {
              const ptr = previousSnapshot.pointers.find((p) => p.name === delVar);
              if (ptr && ptr.targetAddress) {
                delAddr = ptr.targetAddress;
              }
            }
            if (!delAddr) {
              const delVal = localVars[delVar]?.value ?? await evalExpr(delVar);
              delAddr = this.parsePointer(delVal);
            }
            if (delAddr) {
              this.deletedAddresses.add(delAddr.toLowerCase());
            }
          }
          let headAddr = null;
          let headId = null;
          const headCandidates = [
            "root",
            "this->root",
            "pRoot",
            "this->pRoot",
            "tree",
            "this->tree",
            "t",
            "head",
            "this->head",
            "pHead",
            "this->pHead",
            "headNode",
            "this->headNode",
            "first",
            "this->first",
            "start",
            "list",
            "dummy",
            "dummyHead",
            "h",
            "l1",
            "l2",
            "head_ref",
            "root_ref",
            "top",
            "front",
            "listHead",
            "_head",
            "_root",
            "m_head",
            "m_root"
          ];
          const isInMain = isInsideMain;
          if (isInMain) {
            for (const cand of headCandidates) {
              if (varDecls.has(cand) && !this.isVariableInitialized(cand, rawLine, varDecls, funcRange)) {
                continue;
              }
              let valStr = localVars[cand]?.value;
              if (!valStr) {
                valStr = await evalExpr(cand) || void 0;
              }
              if (valStr) {
                if (cand === "head_ref" || cand === "root_ref" || valStr.includes("**")) {
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
          if (!headAddr) {
            for (let i = isInMain ? 1 : 0; i < frames.length; i++) {
              const callerFrame = frames[i];
              const callerPath = callerFrame.source?.path || callerFrame.source?.name || "";
              if (!this.isUserSource(callerPath))
                continue;
              const callerName = (callerFrame.name || "").toLowerCase();
              const isCallerMain = callerName === "main" || callerName.startsWith("main(");
              for (const cand of headCandidates) {
                const valStr = await evalExpr(cand, callerFrame.id);
                if (valStr) {
                  let candidate = null;
                  if (cand === "head_ref" || cand === "root_ref" || valStr.includes("**")) {
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
              if (headAddr)
                break;
              if (isCallerMain && !headAddr)
                break;
            }
          }
          if (!headAddr && previousSnapshot?.headId) {
            const prevHeadNode = previousSnapshot.nodes.find((n) => n.id === previousSnapshot.headId);
            if (prevHeadNode && !this.deletedAddresses.has(prevHeadNode.address)) {
              headAddr = prevHeadNode.address;
            }
          }
          if (headAddr && !this.deletedAddresses.has(headAddr)) {
            headId = this.getStableId(headAddr);
            this.hasInitializedList = true;
          } else {
            headAddr = null;
          }
          let nodeType;
          {
            let sourceDefinedType = null;
            try {
              if (fs3.existsSync(resolvedFile)) {
                const content = fs3.readFileSync(resolvedFile, "utf8");
                const structMatches = Array.from(content.matchAll(/(?:struct|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{([^}]*?)\}/gs));
                for (const sm of structMatches) {
                  const body = sm[2] || "";
                  if (body.includes("*")) {
                    sourceDefinedType = sm[1];
                  }
                }
              }
            } catch {
            }
            nodeType = sourceDefinedType || (structureType === "tree" ? "TreeNode" : "Node");
          }
          const allDiscoveredNodes = /* @__PURE__ */ new Map();
          const visitedAddrs = /* @__PURE__ */ new Set();
          const traverseChain = async (startAddr, isHeadChain, associatedVar) => {
            let currAddr = startAddr;
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
              const nextId = nextAddr && !this.deletedAddresses.has(nextAddr) ? this.getStableId(nextAddr) : null;
              const isNodeHead = currAddr === headAddr;
              allDiscoveredNodes.set(currAddr, {
                id,
                address: currAddr,
                data: this.parseData(dataStr || "0"),
                nextId,
                nextAddress: nextAddr,
                isHead: isNodeHead,
                isDetached: !isHeadChain && !isNodeHead,
                variableName: isNodeHead ? "head" : depth === 1 ? associatedVar : void 0
              });
              if (nextAddr && !this.deletedAddresses.has(nextAddr)) {
                currAddr = nextAddr;
              } else {
                break;
              }
            }
          };
          const traverseTree = async (startAddr, isRootTree, associatedVar) => {
            const queue = [{ addr: startAddr, depth: 0 }];
            const MAX_NODES = 100;
            let count = 0;
            while (queue.length > 0 && count < MAX_NODES) {
              const item = queue.shift();
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
              const leftId = leftAddr && !this.deletedAddresses.has(leftAddr) ? this.getStableId(leftAddr) : null;
              const rightId = rightAddr && !this.deletedAddresses.has(rightAddr) ? this.getStableId(rightAddr) : null;
              const isNodeRoot = currAddr === headAddr;
              allDiscoveredNodes.set(currAddr, {
                id,
                address: currAddr,
                data: this.parseData(dataStr || "0"),
                leftId,
                leftAddress: leftAddr,
                rightId,
                rightAddress: rightAddr,
                isHead: isNodeRoot,
                isRoot: isNodeRoot,
                isDetached: !isRootTree && !isNodeRoot,
                treeDepth: depth,
                variableName: isNodeRoot ? structureType === "tree" ? "root" : "head" : depth === 0 ? associatedVar : void 0
              });
              if (leftAddr && !this.deletedAddresses.has(leftAddr) && !visitedAddrs.has(leftAddr)) {
                queue.push({ addr: leftAddr, depth: depth + 1 });
              }
              if (rightAddr && !this.deletedAddresses.has(rightAddr) && !visitedAddrs.has(rightAddr)) {
                queue.push({ addr: rightAddr, depth: depth + 1 });
              }
            }
          };
          if (headAddr) {
            if (structureType === "tree") {
              await traverseTree(headAddr, true, "root");
            } else {
              await traverseChain(headAddr, true, "head");
            }
          }
          const activePointers = [];
          if (hasHead) {
            activePointers.push({
              name: structureType === "tree" ? "root" : "head",
              targetNodeId: headId,
              targetAddress: headAddr,
              isNull: headAddr === null
            });
          }
          for (const [varName, varInfo] of Object.entries(localVars)) {
            if (varName === "head" || varName === "root" || varName === "this")
              continue;
            if (varName === "data" || varName === "val" || varName === "key" || varName === "argc" || varName === "argv" || varName === "count" || varName === "i" || varName === "j" || varName === "k" || varName.startsWith("__")) {
              continue;
            }
            if (!varInfo.isArgument) {
              if (varDecls.has(varName) && !this.isVariableInitialized(varName, rawLine, varDecls, funcRange)) {
                continue;
              }
            }
            const varAddr = this.parsePointer(varInfo.value);
            const isFreed = varAddr ? this.deletedAddresses.has(varAddr) : false;
            const targetId = varAddr && !isFreed ? this.getStableId(varAddr) : null;
            const isTargetingKnownNode = varAddr ? allDiscoveredNodes.has(varAddr) : false;
            const isPointerType = varInfo.type && (varInfo.type.includes("*") || varInfo.type.includes("&")) || varName === "temp" || varName === "prev" || varName === "curr" || varName === "current" || varName === "forward" || varName === "next" || varName === "node" || varName === "first" || varName === "second" || varName === "third" || varName === "tail" || varName === "last" || varName === "p" || varName === "q" || varName === "l1" || varName === "l2" || varName === "dummy" || varName === "fast" || varName === "slow";
            if (isPointerType || isTargetingKnownNode) {
              activePointers.push({
                name: varName,
                targetNodeId: targetId,
                targetAddress: isFreed ? null : varAddr,
                isNull: varAddr === null || isFreed
              });
              if (varAddr && !isFreed && !visitedAddrs.has(varAddr)) {
                if (structureType === "tree") {
                  await traverseTree(varAddr, false, varName);
                } else {
                  await traverseChain(varAddr, false, varName);
                }
              }
            }
          }
          if (previousSnapshot?.nodes && previousSnapshot.hasHead && stepNumber > 1) {
            for (const prevNode of previousSnapshot.nodes) {
              if (prevNode.address && !this.deletedAddresses.has(prevNode.address) && !visitedAddrs.has(prevNode.address)) {
                if (structureType === "tree") {
                  await traverseTree(prevNode.address, false);
                } else {
                  await traverseChain(prevNode.address, false);
                }
              }
            }
          }
          if (structureType === "tree") {
            const reachableFromRoot = /* @__PURE__ */ new Set();
            if (headId) {
              const queue = [headId];
              const visitedTree = /* @__PURE__ */ new Set();
              while (queue.length > 0) {
                const currId = queue.shift();
                if (visitedTree.has(currId))
                  continue;
                visitedTree.add(currId);
                reachableFromRoot.add(currId);
                const foundNode = Array.from(allDiscoveredNodes.values()).find((n) => n.id === currId);
                if (foundNode) {
                  if (foundNode.leftId)
                    queue.push(foundNode.leftId);
                  if (foundNode.rightId)
                    queue.push(foundNode.rightId);
                }
              }
            }
            for (const node of allDiscoveredNodes.values()) {
              node.isDetached = !reachableFromRoot.has(node.id);
            }
            if (headId) {
              let inOrderCol = 0;
              const nodeMap = /* @__PURE__ */ new Map();
              for (const n of allDiscoveredNodes.values()) {
                nodeMap.set(n.id, n);
              }
              const assignInOrder = (nodeId, depth) => {
                if (!nodeId)
                  return;
                const n = nodeMap.get(nodeId);
                if (!n)
                  return;
                n.treeDepth = depth;
                if (n.leftId)
                  assignInOrder(n.leftId, depth + 1);
                n.treeColumn = inOrderCol++;
                if (n.rightId)
                  assignInOrder(n.rightId, depth + 1);
              };
              assignInOrder(headId, 0);
            }
          } else {
            const reachableFromHead = /* @__PURE__ */ new Set();
            if (headId) {
              let currId = headId;
              const headVisited = /* @__PURE__ */ new Set();
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
          let activeVisitingNodeId = null;
          const activeVar = localVars["root"] || localVars["node"] || localVars["curr"] || localVars["current"] || localVars["p"] || localVars["temp"];
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
          const allNodes = Array.from(allDiscoveredNodes.values());
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
          const hasPrint = executedLineText.includes("cout") || executedLineText.includes("printf");
          const printedInStep = hasPrint ? await this.evaluatePrintStatement(evalExpr, executedLineText) : null;
          if (printedInStep) {
            this.accumulatedTerminalOutput += printedInStep;
          }
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
            funcName
          );
          if (isReturnOrEnd) {
            changeType = "final";
            if (structureType === "tree") {
              explanation = `Binary tree execution complete (${allNodes.length} nodes). Program execution finished.`;
            } else {
              const chainNodes = allNodes.filter((n) => !n.isDetached);
              if (chainNodes.length > 0) {
                explanation = `The linked list is complete: head \u2192 ${chainNodes.map((n) => n.data).join(" \u2192 ")} \u2192 nullptr. Program execution finished.`;
              } else {
                explanation = "Program execution finished.";
              }
            }
          }
          const snapshot = {
            stepNumber,
            structureType,
            source: sourceLoc,
            hasHead,
            headId,
            activeVisitingNodeId,
            nodes: allNodes,
            pointers: activePointers,
            explanation,
            changeType,
            terminalOutput: this.accumulatedTerminalOutput,
            printedInStep: printedInStep || void 0,
            isHistorical: false
          };
          return snapshot;
        } catch (err) {
          console.error("[StateExtractor] Extraction failed:", err);
          return null;
        }
      }
    };
  }
});

// test/runTests.ts
var assert = __toESM(require("assert"));
var path4 = __toESM(require("path"));
var fs4 = __toESM(require("fs"));

// src/debug/compiler.ts
init_mockVscode();
var path = __toESM(require("path"));
var fs = __toESM(require("fs"));
var import_child_process = require("child_process");
var import_util = require("util");
var execFileAsync = (0, import_util.promisify)(import_child_process.execFile);
var CppCompiler = class {
  static cachedCompiler = null;
  static lastActiveSourceFile = null;
  static setLastActiveSourceFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
      this.lastActiveSourceFile = filePath;
    }
  }
  static getLastActiveSourceFile() {
    return this.lastActiveSourceFile;
  }
  static async findCompiler() {
    if (this.cachedCompiler) {
      return this.cachedCompiler;
    }
    const candidates = ["g++", "clang++", "gcc"];
    for (const cmd of candidates) {
      try {
        await execFileAsync(cmd, ["--version"]);
        this.cachedCompiler = cmd;
        return cmd;
      } catch {
      }
    }
    return null;
  }
  static resolveSourceFile() {
    const activeEditor = window.activeTextEditor;
    if (activeEditor) {
      const doc = activeEditor.document;
      if ((doc.languageId === "cpp" || doc.languageId === "c" || doc.fileName.endsWith(".cpp") || doc.fileName.endsWith(".cc") || doc.fileName.endsWith(".cxx")) && fs.existsSync(doc.fileName)) {
        this.lastActiveSourceFile = doc.fileName;
        return doc.fileName;
      }
    }
    for (const editor of window.visibleTextEditors) {
      const doc = editor.document;
      if ((doc.languageId === "cpp" || doc.languageId === "c" || doc.fileName.endsWith(".cpp") || doc.fileName.endsWith(".cc") || doc.fileName.endsWith(".cxx")) && fs.existsSync(doc.fileName)) {
        this.lastActiveSourceFile = doc.fileName;
        return doc.fileName;
      }
    }
    if (this.lastActiveSourceFile && fs.existsSync(this.lastActiveSourceFile)) {
      return this.lastActiveSourceFile;
    }
    const workspaceFolders = workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const examplePath = path.join(
        workspaceFolders[0].uri.fsPath,
        "examples",
        "linked-list.cpp"
      );
      if (fs.existsSync(examplePath)) {
        return examplePath;
      }
    }
    return null;
  }
  static async compile(sourcePath) {
    const compiler = await this.findCompiler();
    if (!compiler) {
      return {
        success: false,
        sourcePath,
        errorMessage: "No C++ compiler found (g++ or clang++). Please install MinGW-w64 or Clang and ensure it is in your PATH."
      };
    }
    const dir = path.dirname(sourcePath);
    const baseName = path.basename(sourcePath, path.extname(sourcePath));
    const outDir = path.join(dir, ".debug-mentor");
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const outExt = process.platform === "win32" ? ".exe" : "";
    let executablePath = path.join(outDir, `${baseName}${outExt}`);
    if (fs.existsSync(executablePath)) {
      try {
        const fd = fs.openSync(executablePath, "r+");
        fs.closeSync(fd);
      } catch (err) {
        if (err.code === "EBUSY" || err.code === "EPERM") {
          executablePath = path.join(outDir, `${baseName}_${Date.now()}${outExt}`);
        }
      }
    }
    const args = ["-g", "-O0", "-std=c++17", sourcePath, "-o", executablePath];
    try {
      await execFileAsync(compiler, args);
      return {
        success: true,
        executablePath,
        sourcePath
      };
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString() : err.message;
      return {
        success: false,
        sourcePath,
        errorMessage: `Compilation failed:
${stderr}`
      };
    }
  }
};

// test/runTests.ts
init_explanationGenerator();

// src/visualization/snapshotManager.ts
var SnapshotManager = class {
  snapshots = [];
  currentIndex = -1;
  reset() {
    this.snapshots = [];
    this.currentIndex = -1;
  }
  addSnapshot(snapshot) {
    this.snapshots.push(snapshot);
    this.currentIndex = this.snapshots.length - 1;
  }
  getCurrentSnapshot() {
    if (this.currentIndex >= 0 && this.currentIndex < this.snapshots.length) {
      const snap = this.snapshots[this.currentIndex];
      return {
        ...snap,
        isHistorical: this.currentIndex < this.snapshots.length - 1
      };
    }
    return void 0;
  }
  getLatestSnapshot() {
    if (this.snapshots.length > 0) {
      return this.snapshots[this.snapshots.length - 1];
    }
    return void 0;
  }
  canGoPrev() {
    return this.currentIndex > 0;
  }
  canGoNextHistory() {
    return this.currentIndex < this.snapshots.length - 1;
  }
  prev() {
    if (this.canGoPrev()) {
      this.currentIndex--;
      return this.getCurrentSnapshot();
    }
    return void 0;
  }
  nextHistory() {
    if (this.canGoNextHistory()) {
      this.currentIndex++;
      return this.getCurrentSnapshot();
    }
    return void 0;
  }
  get totalSnapshots() {
    return this.snapshots.length;
  }
  get currentSnapshotIndex() {
    return this.currentIndex;
  }
};

// src/debug/debugSessionManager.ts
init_mockVscode();
var path2 = __toESM(require("path"));
var fs2 = __toESM(require("fs"));
var import_child_process2 = require("child_process");
var import_util2 = require("util");
var execFileAsync2 = (0, import_util2.promisify)(import_child_process2.execFile);
var DebugSessionManager = class {
  static activeSession = null;
  static cachedGdbPath = null;
  static getActiveSession() {
    return this.activeSession;
  }
  static setActiveSession(session) {
    this.activeSession = session;
  }
  static async findDebuggerPath() {
    if (this.cachedGdbPath && fs2.existsSync(this.cachedGdbPath)) {
      return { path: this.cachedGdbPath, miMode: "gdb" };
    }
    const winCandidates = [
      "C:\\ProgramData\\mingw64\\mingw64\\bin\\gdb.exe",
      "C:\\msys64\\mingw64\\bin\\gdb.exe",
      "C:\\MinGW\\bin\\gdb.exe",
      "C:\\Program Files\\LLVM\\bin\\lldb.exe"
    ];
    if (process.platform === "win32") {
      for (const candidate of winCandidates) {
        if (fs2.existsSync(candidate)) {
          this.cachedGdbPath = candidate;
          return {
            path: candidate,
            miMode: candidate.toLowerCase().includes("lldb") ? "lldb" : "gdb"
          };
        }
      }
    }
    const debuggers = [
      { name: "gdb", miMode: "gdb" },
      { name: "lldb", miMode: "lldb" }
    ];
    for (const d of debuggers) {
      try {
        await execFileAsync2(d.name, ["--version"]);
        this.cachedGdbPath = d.name;
        return { path: d.name, miMode: d.miMode };
      } catch {
      }
    }
    return null;
  }
  static async startDebugging(executablePath, sourcePath) {
    if (this.activeSession) {
      return {
        success: false,
        error: "A debugging session is already active. Please stop or restart it."
      };
    }
    const debuggerInfo = await this.findDebuggerPath();
    if (!debuggerInfo) {
      return {
        success: false,
        error: "Could not locate GDB or LLDB debugger in PATH. Please install GDB (e.g. MinGW-w64) or LLVM and ensure it is available."
      };
    }
    const workspaceFolders = workspace.workspaceFolders;
    const folder = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0] : void 0;
    const cwd = folder ? folder.uri.fsPath : path2.dirname(sourcePath);
    const cppExtension = extensions.getExtension("ms-vscode.cpptools");
    if (!cppExtension) {
      window.showWarningMessage(
        "The C/C++ extension (ms-vscode.cpptools) is recommended for best debugger support."
      );
    }
    const debugConfig = {
      name: "SimIDE (C++)",
      type: "cppdbg",
      request: "launch",
      program: executablePath,
      args: [],
      stopAtEntry: true,
      cwd,
      environment: [],
      externalConsole: false,
      avoidWindowsConsoleRedirection: true,
      internalConsoleOptions: "neverOpen",
      MIMode: debuggerInfo.miMode,
      miDebuggerPath: debuggerInfo.path,
      setupCommands: [
        {
          description: "Enable pretty-printing for gdb",
          text: "-enable-pretty-printing",
          ignoreFailures: true
        }
      ]
    };
    try {
      const started = await debug.startDebugging(folder, debugConfig, {
        suppressDebugView: true
      });
      if (!started) {
        return {
          success: false,
          error: "VS Code could not launch the debug adapter. Please verify C/C++ extension settings."
        };
      }
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Failed to start debugger: ${err.message || String(err)}`
      };
    }
  }
  static async stopDebugging() {
    if (this.activeSession) {
      await debug.stopDebugging(this.activeSession);
      this.activeSession = null;
    }
  }
};

// test/runTests.ts
async function runTests() {
  console.log("=== Running VS Code Debug Mentor Test Suite ===\n");
  console.log("[Test 1] Testing Compiler Detection & Real C++ Build...");
  const compiler = await CppCompiler.findCompiler();
  assert.ok(compiler, "Compiler (g++ or clang++) should be detected in PATH");
  console.log(`  \u2713 Detected compiler: ${compiler}`);
  const samplePath = path4.resolve(process.cwd(), "examples", "linked-list.cpp");
  assert.ok(fs4.existsSync(samplePath), "examples/linked-list.cpp must exist");
  const compileResult = await CppCompiler.compile(samplePath);
  assert.strictEqual(compileResult.success, true, `Compilation should succeed: ${compileResult.errorMessage}`);
  assert.ok(compileResult.executablePath && fs4.existsSync(compileResult.executablePath), "Executable must exist");
  console.log(`  \u2713 Successfully compiled to: ${compileResult.executablePath}`);
  console.log("\n[Test 2] Testing Debugger Discovery...");
  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo, "Debugger (GDB or LLDB) should be detected");
  console.log(`  \u2713 Detected debugger: ${debuggerInfo.miMode} at ${debuggerInfo.path}`);
  console.log("\n[Test 3] Testing Pedagogical Explanation Generator...");
  const entryRes = ExplanationGenerator.generate([], null, void 0, false);
  assert.strictEqual(entryRes.changeType, "init");
  assert.ok(entryRes.explanation.includes("Node* head = nullptr"), "Should explain waiting to execute head declaration");
  console.log(`  \u2713 State 0 (entry before head declaration): "${entryRes.explanation}"`);
  const emptyRes = ExplanationGenerator.generate([], null, void 0, true);
  assert.strictEqual(emptyRes.changeType, "init");
  assert.ok(emptyRes.explanation.includes("empty"), "Should explain empty list");
  console.log(`  \u2713 Empty state: "${emptyRes.explanation}"`);
  const node1 = {
    id: "node_1",
    address: "0x1000",
    data: 10,
    nextId: null,
    isHead: false,
    isDetached: true,
    variableName: "first",
    isNewlyCreated: true
  };
  const detachedRes = ExplanationGenerator.generate([node1], null);
  assert.strictEqual(detachedRes.changeType, "node_created");
  assert.ok(detachedRes.explanation.includes("10"), "Should mention node value 10");
  console.log(`  \u2713 Node created state: "${detachedRes.explanation}"`);
  const snap1 = {
    stepNumber: 1,
    hasHead: true,
    headId: null,
    nodes: [node1],
    explanation: detachedRes.explanation,
    changeType: "node_created"
  };
  const node1Connected = { ...node1, isHead: true, isDetached: false };
  const headRes = ExplanationGenerator.generate([node1Connected], "node_1", snap1);
  assert.strictEqual(headRes.changeType, "head_assigned");
  assert.ok(headRes.explanation.includes("head points to the node containing 10"));
  console.log(`  \u2713 Head connected state: "${headRes.explanation}"`);
  const snap2 = {
    stepNumber: 2,
    hasHead: true,
    headId: "node_1",
    nodes: [node1Connected],
    explanation: headRes.explanation,
    changeType: "head_assigned"
  };
  const node2 = {
    id: "node_2",
    address: "0x2000",
    data: 20,
    nextId: null,
    isHead: false,
    isDetached: false,
    variableName: "second"
  };
  const node1To2 = { ...node1Connected, nextId: "node_2" };
  const linkedRes = ExplanationGenerator.generate([node1To2, node2], "node_1", snap2);
  assert.strictEqual(linkedRes.changeType, "node_linked");
  assert.ok(linkedRes.explanation.includes("10 now points to the node containing 20"));
  console.log(`  \u2713 Second node linked: "${linkedRes.explanation}"`);
  const snap3 = {
    stepNumber: 3,
    hasHead: true,
    headId: "node_1",
    nodes: [node1To2, node2],
    explanation: linkedRes.explanation,
    changeType: "node_linked"
  };
  const node3 = {
    id: "node_3",
    address: "0x3000",
    data: 30,
    nextId: null,
    isHead: false,
    isDetached: false,
    variableName: "third"
  };
  const node2To3 = { ...node2, nextId: "node_3" };
  const thirdLinkedRes = ExplanationGenerator.generate([node1To2, node2To3, node3], "node_1", snap3);
  assert.strictEqual(thirdLinkedRes.changeType, "node_linked");
  assert.ok(thirdLinkedRes.explanation.includes("20 now points to the node containing 30"));
  console.log(`  \u2713 Third node linked: "${thirdLinkedRes.explanation}"`);
  const snap4 = {
    stepNumber: 4,
    hasHead: true,
    headId: "node_1",
    nodes: [node1To2, node2To3, node3],
    explanation: thirdLinkedRes.explanation,
    changeType: "node_linked"
  };
  const node1To3 = { ...node1Connected, nextId: "node_3" };
  const bypassRes = ExplanationGenerator.generate([node1To3, node2To3, node3], "node_1", snap4);
  assert.strictEqual(bypassRes.changeType, "node_bypassed");
  assert.ok(bypassRes.explanation.includes("bypassing node 20"));
  console.log(`  \u2713 Node bypassed state: "${bypassRes.explanation}"`);
  const snap5 = {
    stepNumber: 5,
    hasHead: true,
    headId: "node_1",
    nodes: [node1To3, node2To3, node3],
    pointers: [
      { name: "head", targetNodeId: "node_1", isNull: false },
      { name: "first", targetNodeId: "node_1", isNull: false },
      { name: "second", targetNodeId: "node_2", isNull: false },
      { name: "third", targetNodeId: "node_3", isNull: false }
    ],
    explanation: bypassRes.explanation,
    changeType: "node_bypassed"
  };
  const deleteRes = ExplanationGenerator.generate([node1To3, node3], "node_1", snap5);
  assert.strictEqual(deleteRes.changeType, "node_deleted");
  assert.ok(deleteRes.explanation.includes("Freed heap memory for node containing 20"));
  console.log(`  \u2713 Node deleted state: "${deleteRes.explanation}"`);
  const snap6 = {
    stepNumber: 6,
    hasHead: true,
    headId: "node_1",
    nodes: [node1To3, node3],
    pointers: [
      { name: "head", targetNodeId: "node_1", isNull: false },
      { name: "temp", targetNodeId: "node_1", isNull: false }
    ],
    explanation: deleteRes.explanation,
    changeType: "node_deleted"
  };
  const moveRes = ExplanationGenerator.generate(
    [node1To3, node3],
    "node_1",
    snap6,
    true,
    [
      { name: "head", targetNodeId: "node_1", isNull: false },
      { name: "temp", targetNodeId: "node_3", isNull: false }
    ]
  );
  assert.strictEqual(moveRes.changeType, "pointer_moved");
  assert.ok(moveRes.explanation.includes("Pointer 'temp' advanced to node containing 30"));
  console.log(`  \u2713 Pointer moved state: "${moveRes.explanation}"`);
  const snap7 = {
    stepNumber: 7,
    hasHead: true,
    headId: "node_1",
    nodes: [node1To3, node3],
    pointers: [
      { name: "head", targetNodeId: "node_1", isNull: false },
      { name: "temp", targetNodeId: "node_3", isNull: false }
    ],
    explanation: moveRes.explanation,
    changeType: "pointer_moved",
    terminalOutput: "10 -> "
  };
  const printRes = ExplanationGenerator.generate(
    [node1To3, node3],
    "node_1",
    snap7,
    true,
    snap7.pointers,
    "30 -> ",
    "10 -> 30 -> "
  );
  assert.strictEqual(printRes.changeType, "print");
  assert.ok(printRes.explanation.includes('Printed to terminal: "30 -> "'));
  console.log(`  \u2713 Terminal print state: "${printRes.explanation}"`);
  const nodeUpdated = { ...node1Connected, data: 99 };
  const valUpdateRes = ExplanationGenerator.generate([nodeUpdated], "node_1", snap1, true, [
    { name: "head", targetNodeId: "node_1", isNull: false }
  ]);
  assert.strictEqual(valUpdateRes.changeType, "step");
  assert.ok(valUpdateRes.explanation.includes("data updated: 10 \u2192 99"));
  console.log(`  \u2713 In-place value update state: "${valUpdateRes.explanation}"`);
  const treeRootNode = {
    id: "tree_1",
    address: "0x3000",
    data: 50,
    isHead: true,
    isRoot: true,
    isDetached: false,
    leftId: null,
    rightId: null
  };
  const treeRootRes = ExplanationGenerator.generate(
    [treeRootNode],
    "tree_1",
    {
      stepNumber: 1,
      structureType: "tree",
      hasHead: true,
      headId: null,
      nodes: [],
      explanation: "Empty tree",
      changeType: "init"
    },
    true,
    [{ name: "root", targetNodeId: "tree_1", isNull: false }],
    null,
    "",
    "tree"
  );
  assert.strictEqual(treeRootRes.changeType, "tree_root_assigned");
  assert.ok(treeRootRes.explanation.includes("Tree root initialized to node containing 50"));
  console.log(`  \u2713 Tree Root Connected state: "${treeRootRes.explanation}"`);
  const treeLeftNode = {
    id: "tree_2",
    address: "0x3040",
    data: 30,
    isHead: false,
    isRoot: false,
    isDetached: false,
    leftId: null,
    rightId: null
  };
  const treeRootLinked = { ...treeRootNode, leftId: "tree_2" };
  const treeChildRes = ExplanationGenerator.generate(
    [treeRootLinked, treeLeftNode],
    "tree_1",
    {
      stepNumber: 2,
      structureType: "tree",
      hasHead: true,
      headId: "tree_1",
      nodes: [treeRootNode],
      explanation: treeRootRes.explanation,
      changeType: "tree_root_assigned"
    },
    true,
    [{ name: "root", targetNodeId: "tree_1", isNull: false }],
    null,
    "",
    "tree"
  );
  assert.strictEqual(treeChildRes.changeType, "tree_child_linked");
  assert.ok(treeChildRes.explanation.includes("Node containing 30 inserted as LEFT child of node 50"));
  console.log(`  \u2713 BST Child Connected state: "${treeChildRes.explanation}"`);
  const treeVisitRes = ExplanationGenerator.generate(
    [treeRootLinked, treeLeftNode],
    "tree_1",
    {
      stepNumber: 3,
      structureType: "tree",
      hasHead: true,
      headId: "tree_1",
      nodes: [treeRootLinked, treeLeftNode],
      explanation: treeChildRes.explanation,
      changeType: "tree_child_linked"
    },
    true,
    [{ name: "root", targetNodeId: "tree_1", isNull: false }],
    null,
    "",
    "tree",
    "tree_2",
    "inorder"
  );
  assert.strictEqual(treeVisitRes.changeType, "tree_traversal_visit");
  assert.ok(treeVisitRes.explanation.includes("Visiting tree node containing 30 in inorder()"));
  console.log(`  \u2713 BST Traversal Visit state: "${treeVisitRes.explanation}"`);
  console.log("\n[Test 4] Testing SnapshotManager Non-Destructive History...");
  const manager = new SnapshotManager();
  assert.strictEqual(manager.canGoPrev(), false);
  assert.strictEqual(manager.totalSnapshots, 0);
  manager.addSnapshot(snap1);
  manager.addSnapshot(snap2);
  manager.addSnapshot(snap3);
  assert.strictEqual(manager.totalSnapshots, 3);
  assert.strictEqual(manager.currentSnapshotIndex, 2);
  assert.strictEqual(manager.getCurrentSnapshot()?.isHistorical, false);
  const prevSnap = manager.prev();
  assert.ok(prevSnap);
  assert.strictEqual(prevSnap.stepNumber, 2);
  assert.strictEqual(prevSnap.isHistorical, true);
  console.log(`  \u2713 Navigated backward to historical step: ${prevSnap.stepNumber} (isHistorical: ${prevSnap.isHistorical})`);
  const nextHistSnap = manager.nextHistory();
  assert.ok(nextHistSnap);
  assert.strictEqual(nextHistSnap.stepNumber, 3);
  assert.strictEqual(nextHistSnap.isHistorical, false);
  console.log("\n[Test 5] Testing StateExtractor Robust Discovery & Pointer Parsing...");
  const { StateExtractor: StateExtractor2 } = await Promise.resolve().then(() => (init_stateExtractor(), stateExtractor_exports));
  assert.strictEqual(StateExtractor2.parsePointer("0x78ed20"), "0x78ed20");
  assert.strictEqual(StateExtractor2.parsePointer("(Node *) 0x78ed20"), "0x78ed20");
  assert.strictEqual(StateExtractor2.parsePointer("(Node *&) @0x16fdee0: 0x7da3a0"), "0x7da3a0");
  assert.strictEqual(StateExtractor2.parsePointer("@0x5ffe68: 0xec960"), "0xec960");
  assert.strictEqual(StateExtractor2.parsePointer("(Node *&) @0x5ffe68: 0x0"), null);
  assert.strictEqual(StateExtractor2.parsePointer("0x0"), null);
  assert.strictEqual(StateExtractor2.parsePointer("nullptr"), null);
  assert.strictEqual(StateExtractor2.parsePointer("NULL"), null);
  assert.strictEqual(StateExtractor2.parsePointer("(nil)"), null);
  assert.strictEqual(StateExtractor2.parsePointer("0x00000000"), null);
  assert.strictEqual(StateExtractor2.parsePointer("<error: Cannot access memory at address 0xbaadf00d>"), null);
  assert.strictEqual(StateExtractor2.parsePointer("0xbaadf00d"), null);
  assert.strictEqual(StateExtractor2.parsePointer("0xcccccccc"), null);
  console.log("  \u2713 Verified parsePointer handles C++ references, type casts, nulls, and rejects error strings/debug fills");
  assert.strictEqual(StateExtractor2.isUserSource("c:/Projects/vscode-extension/examples/linked-list.cpp"), true);
  assert.strictEqual(StateExtractor2.isUserSource("C:/msys64/mingw64/include/c++/13.2.0/bits/stl_vector.h"), false);
  assert.strictEqual(StateExtractor2.isUserSource("C:/msys64/mingw64/include/c++/13.2.0/iostream"), false);
  assert.strictEqual(StateExtractor2.isUserSource("C:/msys64/mingw64/x86_64-w64-mingw32/include/crtdefs.h"), false);
  console.log("  \u2713 Verified isUserSource distinguishes student source from CRT/MinGW headers");
  const leetcodePath = path4.resolve(process.cwd(), "examples", "leetcode-206-reverse.cpp");
  const gfgPath = path4.resolve(process.cwd(), "examples", "gfg-push-delete.cpp");
  const oopPath = path4.resolve(process.cwd(), "examples", "oop-linked-list.cpp");
  const bstPath = path4.resolve(process.cwd(), "examples", "bst-traversals.cpp");
  const structInfoBasic = StateExtractor2.parseStructMembers(samplePath);
  assert.strictEqual(structInfoBasic.dataField, "data");
  assert.strictEqual(structInfoBasic.nextField, "next");
  const structInfoLeetcode = StateExtractor2.parseStructMembers(leetcodePath);
  assert.strictEqual(structInfoLeetcode.dataField, "val");
  assert.strictEqual(structInfoLeetcode.nextField, "next");
  const structInfoGfg = StateExtractor2.parseStructMembers(gfgPath);
  assert.strictEqual(structInfoGfg.dataField, "data");
  assert.strictEqual(structInfoGfg.nextField, "next");
  const structInfoBst = StateExtractor2.parseStructMembers(bstPath);
  assert.strictEqual(structInfoBst.structureType, "tree");
  assert.strictEqual(structInfoBst.dataField, "data");
  assert.strictEqual(structInfoBst.leftField, "left");
  assert.strictEqual(structInfoBst.rightField, "right");
  console.log("  \u2713 Verified parseStructMembers discovers data/val, next, and BST left/right tree fields");
  const leetcodeFns = StateExtractor2.getUserDefinedFunctions(leetcodePath);
  assert.ok(leetcodeFns.has("reverseList"), "Must detect reverseList");
  const gfgFns = StateExtractor2.getUserDefinedFunctions(gfgPath);
  assert.ok(gfgFns.has("push"), "Must detect push");
  assert.ok(gfgFns.has("deleteNode"), "Must detect deleteNode");
  const oopFns = StateExtractor2.getUserDefinedFunctions(oopPath);
  assert.ok(oopFns.has("insertAtHead"), "Must detect insertAtHead");
  assert.ok(oopFns.has("display"), "Must detect display");
  const bstFns = StateExtractor2.getUserDefinedFunctions(bstPath);
  assert.ok(bstFns.has("insert"), "Must detect insert");
  assert.ok(bstFns.has("inorder"), "Must detect inorder");
  assert.ok(bstFns.has("findNodeAndParent"), "Must detect findNodeAndParent");
  assert.ok(bstFns.has("caseA"), "Must detect caseA");
  console.log("  \u2713 Verified getUserDefinedFunctions discovers helper functions (insert, inorder, findNodeAndParent, caseA)");
  console.log("\n[Test 6] Testing Compilation of All Internet Examples & BST...");
  for (const file of [leetcodePath, gfgPath, oopPath, bstPath]) {
    const res = await CppCompiler.compile(file);
    assert.strictEqual(res.success, true, `Should compile ${path4.basename(file)}: ${res.errorMessage}`);
    console.log(`  \u2713 Successfully compiled ${path4.basename(file)}`);
  }
  console.log("\n=== All VS Code Debug Mentor Core Tests PASSED ===\n");
}
runTests().catch((err) => {
  console.error("\n\u274C Test failed with error:", err);
  process.exit(1);
});
