"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// test/runTests.ts
var assert = __toESM(require("assert"));
var path3 = __toESM(require("path"));
var fs3 = __toESM(require("fs"));

// test/mockVscode.ts
var window = {
  activeTextEditor: void 0,
  showWarningMessage: () => {
  },
  showErrorMessage: () => {
  },
  showInformationMessage: () => {
  }
};
var workspace = {
  workspaceFolders: [
    {
      uri: {
        fsPath: process.cwd()
      }
    }
  ]
};
var extensions = {
  getExtension: (id) => ({ id })
};
var debug = {
  startDebugging: async () => true,
  stopDebugging: async () => {
  }
};

// src/debug/compiler.ts
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
    const activeEditor = window.activeTextEditor;
    if (activeEditor) {
      const doc = activeEditor.document;
      if ((doc.languageId === "cpp" || doc.languageId === "c" || doc.fileName.endsWith(".cpp") || doc.fileName.endsWith(".cc")) && fs.existsSync(doc.fileName)) {
        return doc.fileName;
      }
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
    const executablePath = path.join(outDir, `${baseName}${outExt}`);
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
      const started = await debug.startDebugging(folder, debugConfig);
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
  const samplePath = path3.resolve(process.cwd(), "examples", "linked-list.cpp");
  assert.ok(fs3.existsSync(samplePath), "examples/linked-list.cpp must exist");
  const compileResult = await CppCompiler.compile(samplePath);
  assert.strictEqual(compileResult.success, true, `Compilation should succeed: ${compileResult.errorMessage}`);
  assert.ok(compileResult.executablePath && fs3.existsSync(compileResult.executablePath), "Executable must exist");
  console.log(`  \u2713 Successfully compiled to: ${compileResult.executablePath}`);
  console.log("\n[Test 2] Testing Debugger Discovery...");
  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo, "Debugger (GDB or LLDB) should be detected");
  console.log(`  \u2713 Detected debugger: ${debuggerInfo.miMode} at ${debuggerInfo.path}`);
  console.log("\n[Test 3] Testing Pedagogical Explanation Generator...");
  const emptyRes = ExplanationGenerator.generate([], null);
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
  const finalRes = ExplanationGenerator.generate([node1To2, node2To3, node3], "node_1", snap3);
  assert.strictEqual(finalRes.changeType, "final");
  assert.ok(finalRes.explanation.includes("complete"));
  assert.ok(finalRes.explanation.includes("10 \u2192 20 \u2192 30 \u2192 nullptr"));
  console.log(`  \u2713 Final linked list: "${finalRes.explanation}"`);
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
  console.log(`  \u2713 Navigated forward in history back to live step: ${nextHistSnap.stepNumber}`);
  console.log("\n=== All VS Code Debug Mentor Core Tests PASSED ===\n");
}
runTests().catch((err) => {
  console.error("\n\u274C Test failed with error:", err);
  process.exit(1);
});
