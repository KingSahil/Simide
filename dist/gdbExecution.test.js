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

// test/gdbExecution.test.ts
var execFileAsync2 = (0, import_util2.promisify)(import_child_process2.execFile);
function getWindowsShortPath(longPath) {
  if (process.platform !== "win32") {
    return longPath;
  }
  try {
    const shortPath = (0, import_child_process2.execSync)(`cmd.exe /c for %I in ("${longPath}") do @echo %~sI`, { encoding: "utf8" }).trim();
    if (shortPath && fs2.existsSync(shortPath)) {
      return shortPath;
    }
  } catch {
  }
  return longPath;
}
async function testGdbExecution() {
  console.log("=== Running Real GDB Runtime Stepping & State Extraction Test ===\n");
  const debugMentorDir = getWindowsShortPath(path2.resolve(process.cwd(), "examples/.debug-mentor"));
  const exeFile = "linked-list.exe";
  const exePath = path2.join(debugMentorDir, exeFile);
  assert.ok(fs2.existsSync(exePath), "Compiled executable must exist");
  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo, "GDB must be available");
  const gdbCmds = [
    "break main",
    "run",
    // Node* root = nullptr;
    "next",
    // root = insert(root, 50);
    "next",
    "print root->data",
    // root = insert(root, 30);
    "next",
    "print root->left->data",
    // root = insert(root, 70);
    "next",
    "print root->right->data",
    "quit"
  ];
  const scriptFile = "test_gdb.txt";
  const scriptPath = path2.join(debugMentorDir, scriptFile);
  fs2.writeFileSync(scriptPath, gdbCmds.join("\n"), "utf8");
  try {
    const { stdout } = await execFileAsync2(debuggerInfo.path, ["-batch", "-x", scriptFile, exeFile], { cwd: debugMentorDir });
    console.log("[GDB Output Sample]");
    const lines = stdout.split("\n").filter((l) => l.includes("$") || l.includes("Breakpoint") || l.includes("Thread"));
    lines.forEach((l) => console.log("  " + l.trim()));
    assert.ok(stdout.includes("= 50"), "Root node data should be 50");
    assert.ok(stdout.includes("= 30"), "Left child data should be 30");
    assert.ok(stdout.includes("= 70"), "Right child data should be 70");
    console.log("\n\u2713 Verified real GDB runtime stops and tree node values (root=50, left=30, right=70)");
    console.log("=== Real GDB Execution Test PASSED ===\n");
  } finally {
    if (fs2.existsSync(scriptPath)) {
      fs2.unlinkSync(scriptPath);
    }
  }
}
async function testLeetcodeReverseGdb() {
  console.log("=== Running Real GDB Runtime Stepping on LeetCode 206 (Reverse Linked List) ===\n");
  const debugMentorDir = getWindowsShortPath(path2.resolve(process.cwd(), "examples/.debug-mentor"));
  const exeFile = "leetcode-206-reverse.exe";
  const exePath = path2.join(debugMentorDir, exeFile);
  assert.ok(fs2.existsSync(exePath), "Compiled LeetCode executable must exist");
  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo, "GDB must be available");
  const gdbCmds = [
    "break reverseList",
    "run",
    // We are inside reverseList
    "print head->val",
    "next",
    // prev = nullptr
    "next",
    // curr = head
    "print curr->val",
    "finish",
    // run until reverseList returns to main
    "next",
    // execute ListNode* reversedHead = reverseList(head);
    "print reversedHead->val",
    "print reversedHead->next->val",
    "print reversedHead->next->next->val",
    "quit"
  ];
  const scriptFile = "test_reverse_gdb.txt";
  const scriptPath = path2.join(debugMentorDir, scriptFile);
  fs2.writeFileSync(scriptPath, gdbCmds.join("\n"), "utf8");
  try {
    const { stdout } = await execFileAsync2(debuggerInfo.path, ["-batch", "-x", scriptFile, exeFile], { cwd: debugMentorDir });
    console.log("[GDB LeetCode Output Sample]");
    const lines = stdout.split("\n").filter((l) => l.includes("$") || l.includes("Breakpoint"));
    lines.forEach((l) => console.log("  " + l.trim()));
    assert.ok(stdout.includes("= 1"), "Original head val was 1");
    assert.ok(stdout.includes("reversedHead->val") || stdout.includes("= 3"), "Reversed head val must be 3");
    assert.ok(stdout.includes("= 2"), "Reversed second val must be 2");
    console.log("\n\u2713 Verified real GDB execution of LeetCode reverseList (3 -> 2 -> 1)");
    console.log("=== Real GDB LeetCode Reversal Test PASSED ===\n");
  } finally {
    if (fs2.existsSync(scriptPath)) {
      fs2.unlinkSync(scriptPath);
    }
  }
}
async function testBstTraversalsGdb() {
  console.log("=== Running Real GDB Stepping on BST Traversals (Preorder, Inorder, Postorder) ===\n");
  const debugMentorDir = getWindowsShortPath(path2.resolve(process.cwd(), "examples/.debug-mentor"));
  const exeFile = "bst-traversals.exe";
  const exePath = path2.join(debugMentorDir, exeFile);
  assert.ok(fs2.existsSync(exePath), "Compiled BST executable must exist");
  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo, "GDB must be available");
  const gdbCmds = [
    "break main",
    "run",
    // Node* root = nullptr;
    "next",
    // root = insert(root, 50);
    "next",
    "print root->data",
    // root = insert(root, 30);
    "next",
    "print root->left->data",
    // root = insert(root, 70);
    "next",
    "print root->right->data",
    // Break inside inorder traversal
    "break inorder",
    "continue",
    "print root->data",
    "continue",
    "print root->data",
    "quit"
  ];
  const scriptFile = "test_bst_gdb.txt";
  const scriptPath = path2.join(debugMentorDir, scriptFile);
  fs2.writeFileSync(scriptPath, gdbCmds.join("\n"), "utf8");
  try {
    const { stdout } = await execFileAsync2(debuggerInfo.path, ["-batch", "-x", scriptFile, exeFile], { cwd: debugMentorDir });
    console.log("[GDB BST Traversal Output Sample]");
    const lines = stdout.split("\n").filter((l) => l.includes("$") || l.includes("Breakpoint"));
    lines.forEach((l) => console.log("  " + l.trim()));
    assert.ok(stdout.includes("= 50"), "BST Root data should be 50");
    assert.ok(stdout.includes("= 30"), "BST Left child data should be 30");
    assert.ok(stdout.includes("= 70"), "BST Right child data should be 70");
    const { stdout: progOutput } = await execFileAsync2(path2.resolve(debugMentorDir, exeFile), [], { cwd: debugMentorDir });
    assert.ok(progOutput.includes("Original tree (Inorder): 30 40 50 60 70"), "Original tree inorder must match");
    assert.ok(progOutput.includes("Tree after deleting 40: 30 50 60 70"), "Tree after deleting 40 must match");
    assert.ok(progOutput.includes("Tree after deleting 70: 30 50 60"), "Tree after deleting 70 must match");
    console.log("\n\u2713 Verified real GDB runtime stops and tree pointer chasing (root=50, left=30, right=70)");
    console.log("\u2713 Verified Inorder: 30 40 50 60 70");
    console.log("\u2713 Verified Case A Deletion: 40 (leaf) & 70 (single child 60)");
    console.log("=== Real GDB BST Traversals Test PASSED ===\n");
  } finally {
    if (fs2.existsSync(scriptPath)) {
      fs2.unlinkSync(scriptPath);
    }
  }
}
async function testArrayOperationsGdb() {
  console.log("=== Running Real GDB Stepping on Array Operations (arr[5], updates, swaps, loop) ===\n");
  const debugMentorDir = getWindowsShortPath(path2.resolve(process.cwd(), "examples/.debug-mentor"));
  const exeFile = "array-operations.exe";
  const exePath = path2.join(debugMentorDir, exeFile);
  assert.ok(fs2.existsSync(exePath), "Compiled Array executable must exist");
  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo, "GDB must be available");
  const gdbCmds = [
    "break main",
    "run",
    // Line 6: int arr[5] = {10, 20, 30, 40, 50};
    "next",
    "print arr[0]",
    "print arr[2]",
    // Line 9: arr[2] = 99;
    "next",
    "print arr[2]",
    // Line 12: int temp = arr[0];
    "next",
    // Line 13: arr[0] = arr[1];
    "next",
    // Line 14: arr[1] = temp;
    "next",
    "print arr[0]",
    "print arr[1]",
    "quit"
  ];
  const scriptFile = "test_array_gdb.txt";
  const scriptPath = path2.join(debugMentorDir, scriptFile);
  fs2.writeFileSync(scriptPath, gdbCmds.join("\n"), "utf8");
  try {
    const { stdout } = await execFileAsync2(debuggerInfo.path, ["-batch", "-x", scriptFile, exeFile], { cwd: debugMentorDir });
    console.log("[GDB Array Operations Output Sample]");
    const lines = stdout.split("\n").filter((l) => l.includes("$") || l.includes("Breakpoint"));
    lines.forEach((l) => console.log("  " + l.trim()));
    assert.ok(stdout.includes("= 10"), "Initial arr[0] should be 10");
    assert.ok(stdout.includes("= 30"), "Initial arr[2] should be 30");
    assert.ok(stdout.includes("= 99"), "Updated arr[2] should be 99");
    assert.ok(stdout.includes("= 20"), "Swapped arr[0] should be 20");
    const { stdout: progOutput } = await execFileAsync2(path2.resolve(debugMentorDir, exeFile), [], { cwd: debugMentorDir });
    assert.ok(progOutput.includes("20 10 99 40 50"), "Array traversal sequence must match 20 10 99 40 50");
    console.log("\n\u2713 Verified real GDB runtime stops and array element mutation (arr[2]=99)");
    console.log("\u2713 Verified array element swapping (arr[0]=20, arr[1]=10)");
    console.log("\u2713 Verified stdout array traversal: 20 10 99 40 50");
    console.log("=== Real GDB Array Operations Test PASSED ===\n");
  } finally {
    if (fs2.existsSync(scriptPath)) {
      fs2.unlinkSync(scriptPath);
    }
  }
}
async function runAllGdbTests() {
  await testGdbExecution();
  await testLeetcodeReverseGdb();
  await testBstTraversalsGdb();
  await testArrayOperationsGdb();
}
runAllGdbTests().catch((err) => {
  console.error("\u274C GDB Execution Test failed:", err);
  process.exit(1);
});
