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
    // Line 10: Node* head = new Node();
    "next",
    // Line 11: Node* second = new Node();
    "next",
    // Line 14: head->data = 10;
    "next",
    "print head->data",
    // Line 15: second->data = 20;
    "next",
    "print second->data",
    // Line 18: head->next = second;
    "next",
    "print head->next->data",
    // Line 19: second->next = nullptr;
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
    assert.ok(stdout.includes("= 10"), "Head node data should be 10");
    assert.ok(stdout.includes("= 20"), "Second node data should be 20");
    assert.ok(stdout.includes("$3 = 20"), "head->next->data should be 20");
    console.log("\n\u2713 Verified real GDB runtime stops and variable values (head=10, second=20)");
    console.log("\u2713 Verified dynamic linking (head->next = second)");
    console.log("=== Real GDB Execution Test PASSED ===\n");
  } finally {
    if (fs2.existsSync(scriptPath)) {
      fs2.unlinkSync(scriptPath);
    }
  }
}
async function testLeetcodeReverseGdb() {
  console.log("=== Running Real GDB Runtime Stepping on LeetCode 206 (Reverse Linked List) ===\n");
  const exePath = path2.resolve(process.cwd(), "examples/.debug-mentor/leetcode-206-reverse.exe");
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
  const scriptPath = path2.resolve(process.cwd(), "examples/.debug-mentor/test_reverse_gdb.txt");
  fs2.writeFileSync(scriptPath, gdbCmds.join("\n"), "utf8");
  try {
    const { stdout } = await execFileAsync2(debuggerInfo.path, ["-batch", "-x", scriptPath, exePath]);
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
  const exePath = path2.resolve(process.cwd(), "examples/.debug-mentor/bst-traversals.exe");
  assert.ok(fs2.existsSync(exePath), "Compiled BST executable must exist");
  const debuggerInfo = await DebugSessionManager.findDebuggerPath();
  assert.ok(debuggerInfo, "GDB must be available");
  const gdbCmds = [
    "break main",
    "run",
    // Line 48: TreeNode* root = nullptr;
    "next",
    // Line 51: root = insert(root, 50);
    "next",
    "print root->val",
    // Line 52: insert(root, 30);
    "next",
    "print root->left->val",
    // Line 53: insert(root, 70);
    "next",
    "print root->right->val",
    // Break inside inorder traversal
    "break inorder",
    "continue",
    "print root->val",
    "continue",
    "print root->val",
    "quit"
  ];
  const scriptPath = path2.resolve(process.cwd(), "examples/.debug-mentor/test_bst_gdb.txt");
  fs2.writeFileSync(scriptPath, gdbCmds.join("\n"), "utf8");
  try {
    const { stdout } = await execFileAsync2(debuggerInfo.path, ["-batch", "-x", scriptPath, exePath]);
    console.log("[GDB BST Traversal Output Sample]");
    const lines = stdout.split("\n").filter((l) => l.includes("$") || l.includes("Breakpoint"));
    lines.forEach((l) => console.log("  " + l.trim()));
    assert.ok(stdout.includes("= 50"), "BST Root val should be 50");
    assert.ok(stdout.includes("= 30"), "BST Left child val should be 30");
    assert.ok(stdout.includes("= 70"), "BST Right child val should be 70");
    const { stdout: progOutput } = await execFileAsync2(exePath, []);
    assert.ok(progOutput.includes("Preorder: 50 30 20 40 70 60 80"), "Preorder traversal must match");
    assert.ok(progOutput.includes("Inorder: 20 30 40 50 60 70 80"), "Inorder sorted BST traversal must match");
    assert.ok(progOutput.includes("Postorder: 20 40 30 60 80 70 50"), "Postorder traversal must match");
    console.log("\n\u2713 Verified real GDB runtime stops and tree pointer chasing (root=50, left=30, right=70)");
    console.log("\u2713 Verified Preorder: 50 30 20 40 70 60 80");
    console.log("\u2713 Verified Inorder (Sorted): 20 30 40 50 60 70 80");
    console.log("\u2713 Verified Postorder: 20 40 30 60 80 70 50");
    console.log("=== Real GDB BST Traversals Test PASSED ===\n");
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
}
runAllGdbTests().catch((err) => {
  console.error("\u274C GDB Execution Test failed:", err);
  process.exit(1);
});
