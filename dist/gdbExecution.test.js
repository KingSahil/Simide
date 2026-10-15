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

// test/gdbExecution.test.ts
var assert = __toESM(require("assert"));
var path2 = __toESM(require("path"));
var fs2 = __toESM(require("fs"));
var import_child_process2 = require("child_process");
var import_util2 = require("util");

// test/mockVscode.ts
var window = {
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

// src/debug/debugSessionManager.ts
var path = __toESM(require("path"));
var fs = __toESM(require("fs"));
var import_child_process = require("child_process");
var import_util = require("util");
var execFileAsync = (0, import_util.promisify)(import_child_process.execFile);
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
    if (this.cachedGdbPath && fs.existsSync(this.cachedGdbPath)) {
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
        if (fs.existsSync(candidate)) {
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
        await execFileAsync(d.name, ["--version"]);
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
    const cwd = folder ? folder.uri.fsPath : path.dirname(sourcePath);
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

// test/gdbExecution.test.ts
var execFileAsync2 = (0, import_util2.promisify)(import_child_process2.execFile);
async function testGdbExecution() {
  console.log("=== Running Real GDB Runtime Stepping & State Extraction Test ===\n");
  const exePath = path2.resolve(process.cwd(), "examples/.debug-mentor/linked-list.exe");
  assert.ok(fs2.existsSync(exePath), "Compiled executable must exist");
  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo, "GDB must be available");
  const gdbCmds = [
    "break main",
    "run",
    // At line 10: Node* head = nullptr;
    "next",
    "print head",
    // At line 11: Node* first = new Node{10, nullptr};
    "next",
    "print first",
    "print first->data",
    "print first->next",
    // At line 12: head = first;
    "next",
    "print head",
    "print head->data",
    // At line 13: Node* second = new Node{20, nullptr};
    "next",
    "print second",
    "print second->data",
    // At line 14: first->next = second;
    "next",
    "print first->next",
    // At line 15: Node* third = new Node{30, nullptr};
    "next",
    "print third",
    "print third->data",
    // At line 16: second->next = third;
    "next",
    "print second->next",
    "quit"
  ];
  const scriptPath = path2.resolve(process.cwd(), "examples/.debug-mentor/test_gdb.txt");
  fs2.writeFileSync(scriptPath, gdbCmds.join("\n"), "utf8");
  try {
    const { stdout } = await execFileAsync2(debuggerInfo.path, ["-batch", "-x", scriptPath, exePath]);
    console.log("[GDB Output Sample]");
    const lines = stdout.split("\n").filter((l) => l.includes("$") || l.includes("Breakpoint") || l.includes("Thread"));
    lines.forEach((l) => console.log("  " + l.trim()));
    assert.ok(stdout.includes("$1 = (Node *) 0x0"), "Head should initially be null (0x0)");
    assert.ok(stdout.includes("= 10"), "First node data should be 10");
    assert.ok(stdout.includes("= 20"), "Second node data should be 20");
    assert.ok(stdout.includes("= 30"), "Third node data should be 30");
    console.log("\n\u2713 Verified real GDB runtime stops and variable values (10 -> 20 -> 30)");
    console.log("=== Real GDB Execution Test PASSED ===\n");
  } finally {
    if (fs2.existsSync(scriptPath)) {
      fs2.unlinkSync(scriptPath);
    }
  }
}
testGdbExecution().catch((err) => {
  console.error("\u274C GDB Execution Test failed:", err);
  process.exit(1);
});
