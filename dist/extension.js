"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode6 = __toESM(require("vscode"));

// src/sidebar/linkedListViewProvider.ts
var vscode5 = __toESM(require("vscode"));
var path4 = __toESM(require("path"));
var fs4 = __toESM(require("fs"));

// src/debug/compiler.ts
var vscode = __toESM(require("vscode"));
var path = __toESM(require("path"));
var fs = __toESM(require("fs"));
var import_child_process = require("child_process");
var import_util = require("util");
var execFileAsync = (0, import_util.promisify)(import_child_process.execFile);
var CppCompiler = class {
  static cachedCompiler = null;
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
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const doc = activeEditor.document;
      if ((doc.languageId === "cpp" || doc.languageId === "c" || doc.fileName.endsWith(".cpp") || doc.fileName.endsWith(".cc")) && fs.existsSync(doc.fileName)) {
        return doc.fileName;
      }
    }
    const workspaceFolders = vscode.workspace.workspaceFolders;
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

// src/debug/debugSessionManager.ts
var vscode2 = __toESM(require("vscode"));
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
    const workspaceFolders = vscode2.workspace.workspaceFolders;
    const folder = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0] : void 0;
    const cwd = folder ? folder.uri.fsPath : path2.dirname(sourcePath);
    const cppExtension = vscode2.extensions.getExtension("ms-vscode.cpptools");
    if (!cppExtension) {
      vscode2.window.showWarningMessage(
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
      const started = await vscode2.debug.startDebugging(folder, debugConfig, {
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
      await vscode2.debug.stopDebugging(this.activeSession);
      this.activeSession = null;
    }
  }
};

// src/debug/debugAdapterTracker.ts
var DebugTrackerFactory = class _DebugTrackerFactory {
  static stopListeners = [];
  static continueListeners = [];
  static terminateListeners = [];
  static outputListeners = [];
  static lastThreadId = 1;
  static getLastThreadId() {
    return this.lastThreadId;
  }
  static onOutput(listener) {
    this.outputListeners.push(listener);
    return {
      dispose: () => {
        const idx = this.outputListeners.indexOf(listener);
        if (idx !== -1)
          this.outputListeners.splice(idx, 1);
      }
    };
  }
  static onStopped(listener) {
    this.stopListeners.push(listener);
    return {
      dispose: () => {
        const idx = this.stopListeners.indexOf(listener);
        if (idx !== -1)
          this.stopListeners.splice(idx, 1);
      }
    };
  }
  static onContinued(listener) {
    this.continueListeners.push(listener);
    return {
      dispose: () => {
        const idx = this.continueListeners.indexOf(listener);
        if (idx !== -1)
          this.continueListeners.splice(idx, 1);
      }
    };
  }
  static onTerminated(listener) {
    this.terminateListeners.push(listener);
    return {
      dispose: () => {
        const idx = this.terminateListeners.indexOf(listener);
        if (idx !== -1)
          this.terminateListeners.splice(idx, 1);
      }
    };
  }
  createDebugAdapterTracker(session) {
    return {
      onWillReceiveMessage: (m) => {
      },
      onDidSendMessage: (m) => {
        if (!m)
          return;
        if (m.type === "event") {
          if (m.event === "stopped") {
            const threadId = m.body?.threadId ?? 1;
            const reason = m.body?.reason ?? "step";
            _DebugTrackerFactory.lastThreadId = threadId;
            for (const listener of _DebugTrackerFactory.stopListeners) {
              try {
                listener({ session, threadId, reason });
              } catch (e) {
                console.error("[DebugTracker] Error in stop listener", e);
              }
            }
          } else if (m.event === "continued") {
            const threadId = m.body?.threadId;
            for (const listener of _DebugTrackerFactory.continueListeners) {
              try {
                listener({ session, threadId });
              } catch (e) {
                console.error("[DebugTracker] Error in continue listener", e);
              }
            }
          } else if (m.event === "output") {
            const outputText = m.body?.output;
            const category = m.body?.category || "console";
            if (outputText) {
              for (const listener of _DebugTrackerFactory.outputListeners) {
                try {
                  listener(outputText, category);
                } catch (e) {
                  console.error("[DebugTracker] Error in output listener", e);
                }
              }
            }
          } else if (m.event === "terminated" || m.event === "exited") {
            for (const listener of _DebugTrackerFactory.terminateListeners) {
              try {
                listener(session);
              } catch (e) {
                console.error("[DebugTracker] Error in terminate listener", e);
              }
            }
          }
        }
      }
    };
  }
};

// src/debug/executionController.ts
var vscode3 = __toESM(require("vscode"));
var ExecutionController = class {
  static isOperating = false;
  static isPaused = true;
  static isRunning = false;
  static get status() {
    return {
      isOperating: this.isOperating,
      isPaused: this.isPaused,
      isRunning: this.isRunning
    };
  }
  static setPaused(paused) {
    this.isPaused = paused;
    this.isRunning = !paused;
    if (paused) {
      this.isOperating = false;
    }
  }
  static setRunning(running) {
    this.isRunning = running;
    this.isPaused = !running;
  }
  static async next() {
    if (this.isOperating || this.isRunning) {
      return false;
    }
    const session = DebugSessionManager.getActiveSession();
    if (!session) {
      return false;
    }
    this.isOperating = true;
    this.isRunning = true;
    this.isPaused = false;
    const threadId = DebugTrackerFactory.getLastThreadId();
    try {
      await session.customRequest("next", { threadId });
      return true;
    } catch {
      try {
        await vscode3.commands.executeCommand("workbench.action.debug.stepOver");
        return true;
      } catch (err) {
        this.isOperating = false;
        this.isRunning = false;
        this.isPaused = true;
        return false;
      }
    }
  }
  static async stepIn() {
    if (this.isOperating || this.isRunning)
      return false;
    const session = DebugSessionManager.getActiveSession();
    if (!session)
      return false;
    this.isOperating = true;
    this.isRunning = true;
    this.isPaused = false;
    const threadId = DebugTrackerFactory.getLastThreadId();
    try {
      await session.customRequest("stepIn", { threadId });
      return true;
    } catch {
      try {
        await vscode3.commands.executeCommand("workbench.action.debug.stepInto");
        return true;
      } catch {
        this.isOperating = false;
        this.isRunning = false;
        this.isPaused = true;
        return false;
      }
    }
  }
  static async stepOut() {
    if (this.isOperating || this.isRunning)
      return false;
    const session = DebugSessionManager.getActiveSession();
    if (!session)
      return false;
    this.isOperating = true;
    this.isRunning = true;
    this.isPaused = false;
    const threadId = DebugTrackerFactory.getLastThreadId();
    try {
      await session.customRequest("stepOut", { threadId });
      return true;
    } catch {
      try {
        await vscode3.commands.executeCommand("workbench.action.debug.stepOut");
        return true;
      } catch {
        this.isOperating = false;
        this.isRunning = false;
        this.isPaused = true;
        return false;
      }
    }
  }
  static async continue() {
    if (this.isOperating || this.isRunning)
      return false;
    const session = DebugSessionManager.getActiveSession();
    if (!session)
      return false;
    this.isOperating = true;
    this.isRunning = true;
    this.isPaused = false;
    const threadId = DebugTrackerFactory.getLastThreadId();
    try {
      await session.customRequest("continue", { threadId });
      return true;
    } catch {
      try {
        await vscode3.commands.executeCommand("workbench.action.debug.continue");
        return true;
      } catch {
        this.isOperating = false;
        this.isRunning = false;
        this.isPaused = true;
        return false;
      }
    }
  }
  static async pause() {
    const session = DebugSessionManager.getActiveSession();
    if (!session)
      return false;
    const threadId = DebugTrackerFactory.getLastThreadId();
    try {
      await session.customRequest("pause", { threadId });
      return true;
    } catch {
      try {
        await vscode3.commands.executeCommand("workbench.action.debug.pause");
        return true;
      } catch {
        return false;
      }
    }
  }
  static async restart() {
    this.isOperating = false;
    try {
      await vscode3.commands.executeCommand("workbench.action.debug.restart");
      return true;
    } catch {
      return false;
    }
  }
};

// src/debug/stateExtractor.ts
var vscode4 = __toESM(require("vscode"));
var fs3 = __toESM(require("fs"));
var path3 = __toESM(require("path"));

// src/visualization/explanationGenerator.ts
var ExplanationGenerator = class {
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
          explanation: "head is initialized to nullptr. The linked list is currently empty.",
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

// src/debug/stateExtractor.ts
var StateExtractor = class {
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
    const folders = vscode4.workspace.workspaceFolders;
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
    const folders = vscode4.workspace.workspaceFolders;
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
      return true;
    }
    const relevantDecls = funcRange ? declLines.filter((l) => l >= funcRange.startLine && l <= funcRange.endLine) : declLines;
    if (relevantDecls.length === 0) {
      return true;
    }
    const executedDecl = relevantDecls.filter((l) => l < rawLine);
    return executedDecl.length > 0;
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
          hasHead = this.isVariableInitialized("head", rawLine, varDecls, funcRange) || this.isVariableInitialized("root", rawLine, varDecls, funcRange) || this.isVariableInitialized("tree", rawLine, varDecls, funcRange);
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
          if (!this.isVariableInitialized(varName, rawLine, varDecls, funcRange)) {
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

// src/sidebar/linkedListViewProvider.ts
var LinkedListViewProvider = class {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
    this.registerDebugListeners();
  }
  static viewType = "debug-mentor.sidebar";
  view;
  snapshotManager = new SnapshotManager();
  stepCounter = 1;
  disposables = [];
  registerDebugListeners() {
    this.disposables.push(
      vscode5.window.onDidChangeActiveTextEditor(() => {
        const curr = this.snapshotManager.getCurrentSnapshot();
        if (curr) {
          this.updateEditorActiveLineHighlight(curr);
        }
      })
    );
    this.disposables.push(
      DebugTrackerFactory.onStopped(async (event) => {
        ExecutionController.setPaused(true);
        await new Promise((r) => setTimeout(r, 60));
        try {
          const stackRes = await event.session.customRequest("stackTrace", {
            threadId: event.threadId,
            startFrame: 0,
            levels: 10
          });
          const frames = stackRes?.stackFrames || [];
          if (frames.length > 0) {
            const topPath = frames[0].source?.path || frames[0].source?.name || "";
            const topFunc = (frames[0].name || "").toLowerCase();
            const isTopUser = StateExtractor.isUserSource(topPath) && !topFunc.includes("crt") && !topFunc.includes("startup");
            const hasUserCaller = frames.some((f) => {
              const p = f.source?.path || f.source?.name || "";
              const n = (f.name || "").toLowerCase();
              return StateExtractor.isUserSource(p) && !n.includes("crt") && !n.includes("startup");
            });
            if (!isTopUser && hasUserCaller) {
              await ExecutionController.stepOut();
              return;
            }
          }
        } catch {
        }
        const prev = this.snapshotManager.getLatestSnapshot();
        const snapshot = await StateExtractor.extractState(
          event.session,
          event.threadId,
          this.stepCounter++,
          prev
        );
        if (snapshot) {
          this.snapshotManager.addSnapshot(snapshot);
          this.broadcastState(snapshot);
        }
      })
    );
    this.disposables.push(
      DebugTrackerFactory.onContinued(() => {
        ExecutionController.setRunning(true);
        const curr = this.snapshotManager.getCurrentSnapshot();
        if (curr) {
          this.broadcastState(curr);
        }
      })
    );
    this.disposables.push(
      DebugTrackerFactory.onTerminated(async (session) => {
        this.clearEditorHighlight();
        await this.restoreNativeStackFrameHighlight();
        DebugSessionManager.setActiveSession(null);
        ExecutionController.setPaused(true);
        this.postMessage({
          command: "sessionEnded",
          reason: "Program execution completed."
        });
      })
    );
  }
  resolveWebviewView(webviewView, _context, _token) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this.extensionUri,
        vscode5.Uri.joinPath(this.extensionUri, "dist"),
        vscode5.Uri.joinPath(this.extensionUri, "webview")
      ]
    };
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(
      async (message) => {
        await this.handleMessage(message);
      },
      void 0,
      this.disposables
    );
  }
  async handleMessage(message) {
    switch (message.command) {
      case "visualize":
      case "retry":
        await this.startVisualization();
        break;
      case "next":
        await this.stepNext();
        break;
      case "prev":
        if (this.snapshotManager.canGoPrev()) {
          const prevSnap = this.snapshotManager.prev();
          if (prevSnap) {
            this.broadcastState(prevSnap);
          }
        }
        break;
      case "stepIn":
        await ExecutionController.stepIn();
        break;
      case "stepOut":
        await ExecutionController.stepOut();
        break;
      case "continue":
        await ExecutionController.continue();
        break;
      case "pause":
        await ExecutionController.pause();
        break;
      case "restart":
        await this.restartSession();
        break;
      case "requestState":
        const curr = this.snapshotManager.getCurrentSnapshot();
        if (curr) {
          this.broadcastState(curr);
        }
        break;
    }
  }
  async stepNext() {
    if (this.snapshotManager.canGoNextHistory()) {
      const nextSnap = this.snapshotManager.nextHistory();
      if (nextSnap) {
        this.broadcastState(nextSnap);
      }
    } else {
      const curr = this.snapshotManager.getCurrentSnapshot();
      if (curr && curr.changeType === "final" && !DebugSessionManager.getActiveSession()) {
        return;
      }
      await this.executeSmartStep();
    }
  }
  async executeSmartStep() {
    const session = DebugSessionManager.getActiveSession();
    if (!session)
      return;
    const threadId = DebugTrackerFactory.getLastThreadId();
    try {
      const stackRes = await session.customRequest("stackTrace", {
        threadId,
        startFrame: 0,
        levels: 10
      });
      const frames = stackRes?.stackFrames || [];
      const userFrame = frames.find((f) => {
        const p = f.source?.path || f.source?.name || "";
        const name = (f.name || "").toLowerCase();
        return StateExtractor.isUserSource(p) && !name.includes("crt") && !name.includes("startup");
      }) || frames[0];
      if (!userFrame) {
        await ExecutionController.next();
        return;
      }
      const rawPath = userFrame.source?.path || userFrame.source?.name || "";
      const resolvedFile = StateExtractor.resolveFilePath(rawPath) || rawPath;
      const currentLine = userFrame.line;
      const lineText = StateExtractor.getLineText(resolvedFile, currentLine);
      const userFunctions = StateExtractor.getUserDefinedFunctions(resolvedFile);
      const isDefHeader = /^\s*(?:void|int|bool|char|double|float|auto|Node\*?|ListNode\*?)\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\)\s*\{?$/.test(
        lineText
      ) || /^\s*#/.test(lineText);
      let callsUserFunction = false;
      if (!isDefHeader) {
        for (const fnName of userFunctions) {
          const regex = new RegExp(`\\b${fnName}\\s*\\(`);
          if (regex.test(lineText)) {
            callsUserFunction = true;
            break;
          }
        }
      }
      if (callsUserFunction) {
        await ExecutionController.stepIn();
      } else {
        await ExecutionController.next();
      }
    } catch {
      await ExecutionController.next();
    }
  }
  reveal() {
    if (this.view) {
      this.view.show(true);
    } else {
      vscode5.commands.executeCommand("debug-mentor.sidebar.focus");
    }
  }
  async startVisualization() {
    this.reveal();
    if (DebugSessionManager.getActiveSession()) {
      await DebugSessionManager.stopDebugging();
      await new Promise((r) => setTimeout(r, 150));
    }
    this.postMessage({
      command: "status",
      text: "Preparing C++ program...",
      step: "compiling"
    });
    const sourceFile = CppCompiler.resolveSourceFile();
    if (!sourceFile) {
      this.postMessage({
        command: "error",
        message: "No active C++ file detected",
        details: "Please open a valid C++ file (such as examples/linked-list.cpp) in the editor and try again.",
        canRetry: true
      });
      return;
    }
    this.postMessage({
      command: "status",
      text: `Compiling ${path4.basename(sourceFile)}...`,
      step: "compiling"
    });
    const compileResult = await CppCompiler.compile(sourceFile);
    if (!compileResult.success) {
      this.postMessage({
        command: "error",
        message: "Compilation Failed",
        details: compileResult.errorMessage,
        canRetry: true
      });
      return;
    }
    await this.suppressNativeStackFrameHighlight();
    this.snapshotManager.reset();
    StateExtractor.reset();
    StateExtractor.setActiveSourceFile(sourceFile);
    this.stepCounter = 1;
    this.postMessage({
      command: "status",
      text: "Starting debugger...",
      step: "launching"
    });
    const debugLaunch = await DebugSessionManager.startDebugging(
      compileResult.executablePath,
      sourceFile
    );
    if (!debugLaunch.success) {
      await this.restoreNativeStackFrameHighlight();
      this.postMessage({
        command: "error",
        message: "Debugger Launch Failed",
        details: debugLaunch.error,
        canRetry: true
      });
      return;
    }
    this.postMessage({
      command: "status",
      text: "Waiting for debugger to pause at entry...",
      step: "waiting"
    });
  }
  async restartSession() {
    await DebugSessionManager.stopDebugging();
    await this.startVisualization();
  }
  originalColors = void 0;
  // Single unified amber highlight for both live stepping and history navigation
  activeLineDecorationType = vscode5.window.createTextEditorDecorationType({
    backgroundColor: "rgba(235, 155, 30, 0.22)",
    isWholeLine: true,
    border: "1px solid rgba(235, 155, 30, 0.55)",
    overviewRulerColor: "#EB9B1E",
    overviewRulerLane: vscode5.OverviewRulerLane.Full
  });
  async suppressNativeStackFrameHighlight() {
    try {
      const config = vscode5.workspace.getConfiguration("workbench");
      this.originalColors = config.get("colorCustomizations");
      const target = vscode5.workspace.workspaceFolders ? vscode5.ConfigurationTarget.Workspace : vscode5.ConfigurationTarget.Global;
      await config.update(
        "colorCustomizations",
        {
          ...this.originalColors || {},
          "editor.stackFrameHighlightBackground": "#00000000",
          "editor.focusedStackFrameHighlightBackground": "#00000000"
        },
        target
      );
    } catch {
    }
  }
  async restoreNativeStackFrameHighlight() {
    try {
      if (this.originalColors !== void 0) {
        const config = vscode5.workspace.getConfiguration("workbench");
        const target = vscode5.workspace.workspaceFolders ? vscode5.ConfigurationTarget.Workspace : vscode5.ConfigurationTarget.Global;
        await config.update("colorCustomizations", this.originalColors, target);
        this.originalColors = void 0;
      }
    } catch {
    }
  }
  updateEditorActiveLineHighlight(snapshot) {
    const line = snapshot.source?.line;
    const filePath = snapshot.source?.file;
    if (!line || line <= 0) {
      this.clearEditorHighlight();
      return;
    }
    const targetLine = line - 1;
    const range = new vscode5.Range(targetLine, 0, targetLine, 0);
    let foundEditor = false;
    for (const editor of vscode5.window.visibleTextEditors) {
      const isMatchingDoc = !filePath || editor.document.fileName.endsWith(filePath) || path4.basename(editor.document.fileName) === path4.basename(filePath);
      if (isMatchingDoc) {
        editor.setDecorations(this.activeLineDecorationType, [range]);
        editor.revealRange(range, vscode5.TextEditorRevealType.InCenterIfOutsideViewport);
        if (editor.document.lineCount > targetLine) {
          const pos = new vscode5.Position(targetLine, 0);
          editor.selection = new vscode5.Selection(pos, pos);
        }
        foundEditor = true;
      }
    }
    if (!foundEditor && filePath && fs4.existsSync(filePath)) {
      vscode5.workspace.openTextDocument(filePath).then((doc) => {
        vscode5.window.showTextDocument(doc, { preserveFocus: true }).then((editor) => {
          editor.setDecorations(this.activeLineDecorationType, [range]);
          editor.revealRange(range, vscode5.TextEditorRevealType.InCenterIfOutsideViewport);
        });
      });
    }
  }
  clearEditorHighlight() {
    for (const editor of vscode5.window.visibleTextEditors) {
      editor.setDecorations(this.activeLineDecorationType, []);
    }
  }
  broadcastState(snapshot) {
    this.reveal();
    this.updateEditorActiveLineHighlight(snapshot);
    const isHistorical = !!snapshot.isHistorical;
    const isFinal = snapshot.changeType === "final";
    const isPaused = ExecutionController.status.isPaused;
    const isRunning = ExecutionController.status.isRunning;
    this.postMessage({
      command: "updateState",
      snapshot,
      canStepNext: isHistorical ? true : (!isFinal || !!DebugSessionManager.getActiveSession()) && isPaused,
      canStepPrev: this.snapshotManager.canGoPrev(),
      canContinue: isPaused && !isHistorical && (!isFinal || !!DebugSessionManager.getActiveSession()),
      canPause: isRunning,
      canRestart: true,
      isPaused,
      isRunning,
      totalSnapshots: this.snapshotManager.totalSnapshots,
      currentSnapshotIndex: this.snapshotManager.currentSnapshotIndex
    });
  }
  postMessage(message) {
    if (this.view) {
      this.view.webview.postMessage(message);
    }
  }
  getHtmlForWebview(webview) {
    const htmlPath = path4.join(this.extensionUri.fsPath, "dist", "webview.html");
    let htmlContent = "";
    if (fs4.existsSync(htmlPath)) {
      htmlContent = fs4.readFileSync(htmlPath, "utf8");
    } else {
      const fallbackPath = path4.join(this.extensionUri.fsPath, "webview", "index.html");
      htmlContent = fs4.readFileSync(fallbackPath, "utf8");
    }
    const scriptUri = webview.asWebviewUri(
      vscode5.Uri.joinPath(this.extensionUri, "dist", "webview.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode5.Uri.joinPath(this.extensionUri, "dist", "webview.css")
    );
    htmlContent = htmlContent.replace("webview.js", scriptUri.toString());
    htmlContent = htmlContent.replace("webview.css", styleUri.toString());
    return htmlContent;
  }
  async dispose() {
    this.clearEditorHighlight();
    this.activeLineDecorationType.dispose();
    await this.restoreNativeStackFrameHighlight();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
};

// src/extension.ts
function activate(context) {
  console.log("[SimIDE] Activating SimIDE extension...");
  const provider = new LinkedListViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode6.window.registerWebviewViewProvider(
      LinkedListViewProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );
  const trackerFactory = new DebugTrackerFactory();
  context.subscriptions.push(
    vscode6.debug.registerDebugAdapterTrackerFactory("*", trackerFactory)
  );
  context.subscriptions.push(
    vscode6.debug.onDidStartDebugSession((session) => {
      if (session.name.includes("SimIDE") || session.name.includes("Debug Mentor") || session.type === "cppdbg") {
        DebugSessionManager.setActiveSession(session);
        provider.reveal();
      }
    })
  );
  context.subscriptions.push(
    vscode6.debug.onDidTerminateDebugSession((session) => {
      if (DebugSessionManager.getActiveSession()?.id === session.id) {
        DebugSessionManager.setActiveSession(null);
      }
    })
  );
  context.subscriptions.push(
    vscode6.commands.registerCommand("debug-mentor.visualize", async () => {
      await vscode6.commands.executeCommand("debug-mentor.sidebar.focus");
      await provider.startVisualization();
    })
  );
  context.subscriptions.push(
    vscode6.commands.registerCommand("debug-mentor.next", async () => {
      await provider.stepNext();
    })
  );
  context.subscriptions.push(
    vscode6.commands.registerCommand("debug-mentor.prev", async () => {
    })
  );
  context.subscriptions.push(
    vscode6.commands.registerCommand("debug-mentor.restart", async () => {
      await provider.restartSession();
    })
  );
  console.log("[DebugMentor] VS Code Debug Mentor successfully activated.");
}
function deactivate() {
  DebugSessionManager.stopDebugging();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
