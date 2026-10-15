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
      name: "Debug Mentor (C++)",
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
  static lastThreadId = 1;
  static getLastThreadId() {
    return this.lastThreadId;
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
  static generate(currentNodes, headId, previousSnapshot) {
    if (!headId) {
      const detachedNodes2 = currentNodes.filter((n) => n.isDetached);
      if (detachedNodes2.length === 0) {
        return {
          explanation: "head is null, so the linked list is empty.",
          changeType: "init"
        };
      } else {
        const newest = detachedNodes2[detachedNodes2.length - 1];
        return {
          explanation: `A new node has been created. The node stores ${newest.data}, and its next pointer is null. It is not yet connected to head.`,
          changeType: "node_created"
        };
      }
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
    const detachedNodes = currentNodes.filter((n) => n.isDetached);
    if (previousSnapshot) {
      const prevDetached = previousSnapshot.nodes.filter((n) => n.isDetached);
      if (detachedNodes.length > prevDetached.length) {
        const newest = detachedNodes[detachedNodes.length - 1];
        return {
          explanation: `A new detached node storing ${newest.data} has been allocated. It is not yet connected to the list.`,
          changeType: "node_created"
        };
      }
      if (!previousSnapshot.headId && headId) {
        const headNode = currentNodes.find((n) => n.id === headId);
        return {
          explanation: `The first node is now connected. head points to the node containing ${headNode?.data ?? ""}.`,
          changeType: "head_assigned"
        };
      }
      const prevChainIds = /* @__PURE__ */ new Set();
      let prevCurrId = previousSnapshot.headId;
      while (prevCurrId && !prevChainIds.has(prevCurrId)) {
        prevChainIds.add(prevCurrId);
        const prevFound = previousSnapshot.nodes.find((n) => n.id === prevCurrId);
        if (prevFound) {
          prevCurrId = prevFound.nextId;
        } else {
          break;
        }
      }
      if (chain.length > prevChainIds.size && chain.length > 1) {
        const lastNode = chain[chain.length - 1];
        const prevNode = chain[chain.length - 2];
        if (chain.length === 3 && lastNode.nextId === null) {
          return {
            explanation: `The linked list is complete: head \u2192 ${chain.map((n) => n.data).join(" \u2192 ")} \u2192 nullptr.`,
            changeType: "final"
          };
        }
        return {
          explanation: `The node containing ${prevNode.data} now points to the node containing ${lastNode.data}.`,
          changeType: "node_linked"
        };
      }
    }
    if (chain.length === 1) {
      return {
        explanation: `The first node is now connected. head points to the node containing ${chain[0].data}.`,
        changeType: "head_assigned"
      };
    } else if (chain.length === 2) {
      return {
        explanation: `The first node now points to the second node: head \u2192 ${chain[0].data} \u2192 ${chain[1].data} \u2192 nullptr.`,
        changeType: "node_linked"
      };
    } else if (chain.length >= 3) {
      return {
        explanation: `The linked list is complete: head \u2192 ${chain.map((n) => n.data).join(" \u2192 ")} \u2192 nullptr.`,
        changeType: "final"
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
  static initLinesCache = /* @__PURE__ */ new Map();
  static reset() {
    this.addressToIdMap.clear();
    this.nextIdCounter = 1;
    this.initLinesCache.clear();
  }
  static getVariableInitLines(sourceFilePath) {
    let resolvedPath = sourceFilePath;
    if (!fs3.existsSync(resolvedPath)) {
      const folders = vscode4.workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        const candidate = path3.join(folders[0].uri.fsPath, sourceFilePath);
        if (fs3.existsSync(candidate)) {
          resolvedPath = candidate;
        }
      }
    }
    if (this.initLinesCache.has(resolvedPath)) {
      return this.initLinesCache.get(resolvedPath);
    }
    const map = /* @__PURE__ */ new Map();
    try {
      if (fs3.existsSync(resolvedPath)) {
        const content = fs3.readFileSync(resolvedPath, "utf8");
        const lines = content.split("\n");
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
    }
    this.initLinesCache.set(resolvedPath, map);
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
    const s = valStr.trim();
    if (s === "0x0" || s === "nullptr" || s === "0" || s.includes("0x0 <") || s.includes("nullptr") || s.includes("NULL") || s.includes("0x00000000")) {
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
    const match = valStr.match(/-?\d+/);
    return match ? parseInt(match[0], 10) : valStr.trim();
  }
  static async extractState(session, threadId, stepNumber, previousSnapshot) {
    try {
      const stackResponse = await session.customRequest("stackTrace", {
        threadId,
        startFrame: 0,
        levels: 1
      });
      const topFrame = stackResponse?.stackFrames?.[0];
      if (!topFrame) {
        return null;
      }
      const frameId = topFrame.id;
      const sourceLoc = {
        file: topFrame.source?.path || topFrame.source?.name || "source.cpp",
        line: topFrame.line,
        functionName: topFrame.name
      };
      let localVars = {};
      try {
        const scopesRes = await session.customRequest("scopes", { frameId });
        const localScope = scopesRes?.scopes?.find(
          (s) => s.name.toLowerCase().includes("local") || s.name.toLowerCase().includes("variables")
        ) || scopesRes?.scopes?.[0];
        if (localScope && localScope.variablesReference > 0) {
          const varsRes = await session.customRequest("variables", {
            variablesReference: localScope.variablesReference
          });
          if (varsRes?.variables) {
            for (const v of varsRes.variables) {
              localVars[v.name] = {
                value: v.value,
                variablesReference: v.variablesReference
              };
            }
          }
        }
      } catch (err) {
      }
      const evalExpr = async (expr) => {
        try {
          const res = await session.customRequest("evaluate", {
            expression: expr,
            frameId,
            context: "watch"
          });
          return res?.result ?? null;
        } catch {
          return null;
        }
      };
      const initLines = this.getVariableInitLines(sourceLoc.file);
      const currentLine = sourceLoc.line;
      const headInitLine = initLines.get("head");
      const isHeadInitialized = headInitLine !== void 0 ? currentLine > headInitLine : true;
      let headAddr = null;
      let headId = null;
      if (isHeadInitialized) {
        const headValStr = localVars["head"]?.value ?? await evalExpr("head");
        headAddr = this.parsePointer(headValStr);
        if (headAddr) {
          headId = this.getStableId(headAddr);
        }
      }
      const reachableNodes = /* @__PURE__ */ new Map();
      let currAddr = headAddr;
      let currExpr = "head";
      const visitedAddrs = /* @__PURE__ */ new Set();
      let depth = 0;
      const MAX_DEPTH = 30;
      while (currAddr && !visitedAddrs.has(currAddr) && depth < MAX_DEPTH) {
        visitedAddrs.add(currAddr);
        depth++;
        const id = this.getStableId(currAddr);
        const dataStr = await evalExpr(`${currExpr}->data`);
        const nextValStr = await evalExpr(`${currExpr}->next`);
        const nextAddr = this.parsePointer(nextValStr);
        const nextId = nextAddr ? this.getStableId(nextAddr) : null;
        reachableNodes.set(currAddr, {
          id,
          address: currAddr,
          data: this.parseData(dataStr || "0"),
          nextId,
          nextAddress: nextAddr,
          isHead: currAddr === headAddr,
          isDetached: false,
          variableName: currAddr === headAddr ? "head" : void 0
        });
        if (nextAddr) {
          currAddr = nextAddr;
          currExpr = `${currExpr}->next`;
        } else {
          break;
        }
      }
      const detachedCandidates = ["first", "second", "third", "temp", "newNode", "curr", "prev"];
      const detachedNodes = [];
      for (const varName of detachedCandidates) {
        const varInitLine = initLines.get(varName);
        if (varInitLine !== void 0 && currentLine <= varInitLine) {
          continue;
        }
        const varValStr = localVars[varName]?.value ?? await evalExpr(varName);
        const varAddr = this.parsePointer(varValStr);
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
              data: this.parseData(dataStr || "0"),
              nextId,
              nextAddress: nextAddr,
              isHead: false,
              isDetached: true,
              variableName: varName,
              isNewlyCreated: true
            });
          }
        }
      }
      const allNodes = [
        ...Array.from(reachableNodes.values()),
        ...detachedNodes
      ];
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
      const { explanation, changeType } = ExplanationGenerator.generate(
        allNodes,
        headId,
        previousSnapshot
      );
      const snapshot = {
        stepNumber,
        source: sourceLoc,
        headId,
        nodes: allNodes,
        explanation,
        changeType,
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
      DebugTrackerFactory.onStopped(async (event) => {
        ExecutionController.setPaused(true);
        await new Promise((r) => setTimeout(r, 80));
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
      DebugTrackerFactory.onTerminated((session) => {
        this.clearEditorHistoryHighlight();
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
        if (this.snapshotManager.canGoNextHistory()) {
          const nextSnap = this.snapshotManager.nextHistory();
          if (nextSnap) {
            this.broadcastState(nextSnap);
          }
        } else {
          await ExecutionController.next();
        }
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
    this.snapshotManager.reset();
    StateExtractor.reset();
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
  historyDecorationType = vscode5.window.createTextEditorDecorationType({
    backgroundColor: "rgba(0, 102, 255, 0.25)",
    isWholeLine: true,
    border: "1px dashed #0066FF",
    overviewRulerColor: "#0066FF",
    overviewRulerLane: vscode5.OverviewRulerLane.Full
  });
  updateEditorHistoryHighlight(snapshot) {
    const isHistorical = !!snapshot.isHistorical;
    const line = snapshot.source?.line;
    const filePath = snapshot.source?.file;
    for (const editor of vscode5.window.visibleTextEditors) {
      const isMatchingDoc = !filePath || editor.document.fileName.endsWith(filePath) || path4.basename(editor.document.fileName) === path4.basename(filePath);
      if (isHistorical && line && line > 0 && isMatchingDoc) {
        const targetLine = line - 1;
        const range = new vscode5.Range(targetLine, 0, targetLine, 0);
        editor.setDecorations(this.historyDecorationType, [range]);
        editor.revealRange(range, vscode5.TextEditorRevealType.InCenterIfOutsideViewport);
        if (editor.document.lineCount > targetLine) {
          const pos = new vscode5.Position(targetLine, 0);
          editor.selection = new vscode5.Selection(pos, pos);
        }
      } else {
        editor.setDecorations(this.historyDecorationType, []);
      }
    }
  }
  clearEditorHistoryHighlight() {
    for (const editor of vscode5.window.visibleTextEditors) {
      editor.setDecorations(this.historyDecorationType, []);
    }
  }
  broadcastState(snapshot) {
    this.reveal();
    this.updateEditorHistoryHighlight(snapshot);
    const isHistorical = !!snapshot.isHistorical;
    const isPaused = ExecutionController.status.isPaused;
    const isRunning = ExecutionController.status.isRunning;
    this.postMessage({
      command: "updateState",
      snapshot,
      canStepNext: isHistorical ? true : isPaused,
      canStepPrev: this.snapshotManager.canGoPrev(),
      canContinue: isPaused && !isHistorical,
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
  dispose() {
    this.clearEditorHistoryHighlight();
    this.historyDecorationType.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
};

// src/extension.ts
function activate(context) {
  console.log("[DebugMentor] Activating VS Code Debug Mentor extension...");
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
      if (session.name.includes("Debug Mentor") || session.type === "cppdbg") {
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
      await vscode6.commands.executeCommand("workbench.action.debug.stepOver");
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
