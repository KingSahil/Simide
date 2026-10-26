import * as vscode from 'vscode';
import * as path from 'path';

export interface CreativeNode {
  id: string;
  varName: string;
  value: number;
  x: number;
  y: number;
  nextVar?: string | null;
}

export interface CreativeStack {
  id: string;
  varName: string;
  elements: number[];
  x: number;
  y: number;
}

export interface CreativeQueue {
  id: string;
  varName: string;
  elements: number[];
  x: number;
  y: number;
}

export interface CreativeString {
  id: string;
  varName: string;
  value: string;
  x: number;
  y: number;
}

export interface CreativeState {
  nodes: CreativeNode[];
  stacks: CreativeStack[];
  queues: CreativeQueue[];
  strings: CreativeString[];
}

export interface CreativeEditResult {
  ok: boolean;
  message?: string;
  highlightLine?: number;
  error?: string;
}

export class CreativeCodeManager {
  /**
   * Parse existing C++ code in the active editor to populate initial visual elements
   */
  public static parseExistingCode(code: string): CreativeState {
    const nodes: CreativeNode[] = [];
    const stacks: CreativeStack[] = [];
    const queues: CreativeQueue[] = [];
    const strings: CreativeString[] = [];

    // Parse Linked List Nodes: e.g. Node* head = new Node(10); or ListNode* n1 = new ListNode{20};
    const nodeRegex = /(?:Node|ListNode)\s*\*\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*new\s+(?:Node|ListNode)(?:\s*(?:\(|\{)\s*(-?\d+)?\s*(?:\)|\}))?\s*;/g;
    let match: RegExpExecArray | null;
    let index = 0;
    while ((match = nodeRegex.exec(code)) !== null) {
      const varName = match[1];
      const valStr = match[2];
      const val = valStr !== undefined ? parseInt(valStr, 10) : 0;
      nodes.push({
        id: `node-${varName}`,
        varName,
        value: isNaN(val) ? 0 : val,
        x: 60 + (index % 4) * 160,
        y: 80 + Math.floor(index / 4) * 130,
        nextVar: null,
      });
      index++;
    }

    // Parse connections: e.g. head->next = node2;
    const nextRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*->\s*next\s*=\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*;/g;
    while ((match = nextRegex.exec(code)) !== null) {
      const srcVar = match[1];
      const tgtVar = match[2];
      if (tgtVar === 'nullptr' || tgtVar === 'NULL') {
        const srcNode = nodes.find((n) => n.varName === srcVar);
        if (srcNode) srcNode.nextVar = null;
      } else {
        const srcNode = nodes.find((n) => n.varName === srcVar);
        if (srcNode) {
          srcNode.nextVar = tgtVar;
        }
      }
    }

    // Parse explicit value mutations: e.g. head->data = 50; or head->val = 50;
    const valUpdateRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*->\s*(?:data|val)\s*=\s*(-?\d+)\s*;/g;
    while ((match = valUpdateRegex.exec(code)) !== null) {
      const varName = match[1];
      const newVal = parseInt(match[2], 10);
      const n = nodes.find((node) => node.varName === varName);
      if (n && !isNaN(newVal)) {
        n.value = newVal;
      }
    }

    // Parse Stacks: std::stack<int> s; or stack<int> s;
    const stackRegex = /(?:\bstd::)?stack\s*<\s*int\s*>\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*;/g;
    let stackIdx = 0;
    while ((match = stackRegex.exec(code)) !== null) {
      const varName = match[1];
      // Find pushes for this stack: s.push(10); or s.emplace(10);
      const pushRegex = new RegExp(`\\b${varName}\\.(?:push|emplace)\\s*\\(\\s*(-?\\d+)\\s*\\)\\s*;`, 'g');
      const elements: number[] = [];
      let pushMatch: RegExpExecArray | null;
      while ((pushMatch = pushRegex.exec(code)) !== null) {
        elements.push(parseInt(pushMatch[1], 10));
      }
      stacks.push({
        id: `stack-${varName}`,
        varName,
        elements,
        x: 60 + stackIdx * 180,
        y: 280,
      });
      stackIdx++;
    }

    // Parse Queues: std::queue<int> q; or queue<int> q;
    const queueRegex = /(?:\bstd::)?queue\s*<\s*int\s*>\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*;/g;
    let queueIdx = 0;
    while ((match = queueRegex.exec(code)) !== null) {
      const varName = match[1];
      const pushRegex = new RegExp(`\\b${varName}\\.(?:push|emplace)\\s*\\(\\s*(-?\\d+)\\s*\\)\\s*;`, 'g');
      const elements: number[] = [];
      let pushMatch: RegExpExecArray | null;
      while ((pushMatch = pushRegex.exec(code)) !== null) {
        elements.push(parseInt(pushMatch[1], 10));
      }
      queues.push({
        id: `queue-${varName}`,
        varName,
        elements,
        x: 60 + queueIdx * 200,
        y: 420,
      });
      queueIdx++;
    }

    // Parse Strings: std::string str = "hello"; or string s = "cat"; or std::string s;
    const stringRegex = /(?:\bstd::)?string\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?\s*;/g;
    let strIdx = 0;
    while ((match = stringRegex.exec(code)) !== null) {
      const varName = match[1];
      if (varName === 'main') continue;
      let initialVal = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : '';

      // Check appends / mutations for this string: str += 'c'; or str += "abc"; or str.push_back('c');
      const appendRegex = new RegExp(`\\b${varName}\\s*(?:\\+=\\s*(?:"([^"]*)"|'([^']*)')|\\.(?:push_back|append)\\s*\\(\\s*(?:"([^"]*)"|'([^']*)')\\s*\\))\\s*;`, 'g');
      let appendMatch: RegExpExecArray | null;
      while ((appendMatch = appendRegex.exec(code)) !== null) {
        const added = appendMatch[1] || appendMatch[2] || appendMatch[3] || appendMatch[4] || '';
        initialVal += added;
      }

      // Check index assignments: str[0] = 'H';
      const indexAssignRegex = new RegExp(`\\b${varName}\\s*\\[\\s*(\\d+)\\s*\\]\\s*=\\s*'([^']*)'\\s*;`, 'g');
      let idxAssignMatch: RegExpExecArray | null;
      while ((idxAssignMatch = indexAssignRegex.exec(code)) !== null) {
        const atIdx = parseInt(idxAssignMatch[1], 10);
        const newChar = idxAssignMatch[2];
        if (atIdx >= 0 && atIdx < initialVal.length) {
          initialVal = initialVal.substring(0, atIdx) + newChar + initialVal.substring(atIdx + 1);
        }
      }

      strings.push({
        id: `string-${varName}`,
        varName,
        value: initialVal,
        x: 60 + strIdx * 240,
        y: 200,
      });
      strIdx++;
    }

    return { nodes, stacks, queues, strings };
  }

  /**
   * Add a new Linked List Node directly into the active C++ file
   */
  public static async addLinkedListNode(
    editor: vscode.TextEditor,
    varName: string,
    value: number
  ): Promise<CreativeEditResult> {
    const doc = editor.document;
    const text = doc.getText();

    // 1. If file is completely empty or has no main(), scaffold a complete runnable program
    if (!text.trim() || !text.includes('main(')) {
      const boilerplate = `#include <iostream>

struct Node {
    int data;
    Node* next;
    Node(int val) : data(val), next(nullptr) {}
};

int main() {
    Node* ${varName} = new Node(${value});

    return 0;
}
`;
      const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
      const applied = await editor.edit((b) => b.replace(fullRange, boilerplate));
      if (!applied) return { ok: false, error: 'Failed to write C++ boilerplate' };
      return { ok: true, message: `Created ${varName} with value ${value}`, highlightLine: 10 };
    }

    // 2. File exists and has code. Ensure struct Node is defined.
    let workingText = text;
    let structOffset = 0;
    if (!/\bstruct\s+Node\b|\bclass\s+Node\b/.test(workingText)) {
      const structSnippet = `struct Node {
    int data;
    Node* next;
    Node(int val) : data(val), next(nullptr) {}
};

`;
      const mainIndex = workingText.indexOf('int main');
      const insertPos = mainIndex >= 0 ? mainIndex : 0;
      const pos = doc.positionAt(insertPos);
      await editor.edit((b) => b.insert(pos, structSnippet));
      workingText = editor.document.getText();
    }

    // 3. Find insertion point in main()
    const insertion = this.findMainInsertionPosition(editor.document);
    if (!insertion) {
      return { ok: false, error: 'Could not find a valid insertion location in main()' };
    }

    const statement = `    Node* ${varName} = new Node(${value});\n`;
    const success = await editor.edit((b) => {
      b.insert(insertion.position, statement);
    });

    if (!success) return { ok: false, error: 'Could not insert node into editor' };
    return {
      ok: true,
      message: `Added Node* ${varName} = new Node(${value});`,
      highlightLine: insertion.position.line + 1,
    };
  }

  /**
   * Connect two linked list nodes in code: sourceVar->next = targetVar;
   */
  public static async connectNodes(
    editor: vscode.TextEditor,
    sourceVar: string,
    targetVar: string
  ): Promise<CreativeEditResult> {
    const doc = editor.document;
    const text = doc.getText();

    // Check if sourceVar->next = ... is already present. If so, update it.
    const existingNextRegex = new RegExp(`^(\\s*${sourceVar}\\s*->\\s*next\\s*=\\s*)[^;]+(;.*)$`, 'm');
    const match = existingNextRegex.exec(text);

    if (match) {
      const lineIdx = text.substring(0, match.index).split('\n').length - 1;
      const line = doc.lineAt(lineIdx);
      const newStatement = `${match[1]}${targetVar}${match[2]}`;
      const success = await editor.edit((b) => {
        b.replace(line.range, newStatement);
      });
      return {
        ok: success,
        message: `Updated link: ${sourceVar}->next = ${targetVar};`,
        highlightLine: lineIdx + 1,
      };
    }

    // Otherwise, insert sourceVar->next = targetVar; inside main after both variables are declared
    const sourceDeclIdx = text.search(new RegExp(`\\b${sourceVar}\\s*=\\s*new\\s+(?:Node|ListNode)`));
    const targetDeclIdx = text.search(new RegExp(`\\b${targetVar}\\s*=\\s*new\\s+(?:Node|ListNode)`));
    const laterIdx = Math.max(sourceDeclIdx, targetDeclIdx);

    let insertPos: vscode.Position;
    if (laterIdx !== -1) {
      const lineAfterLater = doc.positionAt(laterIdx).line + 1;
      insertPos = new vscode.Position(lineAfterLater, 0);
    } else {
      const mainPos = this.findMainInsertionPosition(doc);
      if (!mainPos) return { ok: false, error: 'Could not locate main() to insert wiring' };
      insertPos = mainPos.position;
    }

    const wiring = `    ${sourceVar}->next = ${targetVar};\n`;
    const success = await editor.edit((b) => {
      b.insert(insertPos, wiring);
    });

    if (!success) return { ok: false, error: 'Failed to insert link into editor' };
    return {
      ok: true,
      message: `Connected: ${sourceVar}->next = ${targetVar};`,
      highlightLine: insertPos.line + 1,
    };
  }

  /**
   * Disconnect a node's next pointer in code
   */
  public static async disconnectNode(
    editor: vscode.TextEditor,
    sourceVar: string
  ): Promise<CreativeEditResult> {
    const doc = editor.document;
    const text = doc.getText();

    const existingNextRegex = new RegExp(`^[ \t]*${sourceVar}\\s*->\\s*next\\s*=[^;]+;[ \t]*\r?\n?`, 'm');
    const match = existingNextRegex.exec(text);
    if (!match) {
      return { ok: true, message: `${sourceVar}->next is already unlinked.` };
    }

    const startPos = doc.positionAt(match.index);
    const endPos = doc.positionAt(match.index + match[0].length);
    const success = await editor.edit((b) => {
      b.delete(new vscode.Range(startPos, endPos));
    });

    return {
      ok: success,
      message: `Unlinked ${sourceVar}->next`,
      highlightLine: startPos.line + 1,
    };
  }

  /**
   * Update a node's numeric value: e.g. new Node(10) -> new Node(99)
   */
  public static async updateNodeValue(
    editor: vscode.TextEditor,
    varName: string,
    newValue: number
  ): Promise<CreativeEditResult> {
    const doc = editor.document;
    const text = doc.getText();

    const declRegex = new RegExp(`(\\b${varName}\\s*=\\s*new\\s+(?:Node|ListNode)\\s*\\()\\s*(-?\\d+)(\\s*\\))`, 'm');
    const match = declRegex.exec(text);
    if (!match) {
      return { ok: false, error: `Could not find declaration of ${varName}` };
    }

    const startPos = doc.positionAt(match.index + match[1].length);
    const endPos = doc.positionAt(match.index + match[1].length + match[2].length);
    const success = await editor.edit((b) => {
      b.replace(new vscode.Range(startPos, endPos), String(newValue));
    });

    return {
      ok: success,
      message: `Updated ${varName} value to ${newValue}`,
      highlightLine: startPos.line + 1,
    };
  }

  /**
   * Delete a node from C++ code
   */
  public static async deleteNode(
    editor: vscode.TextEditor,
    varName: string
  ): Promise<CreativeEditResult> {
    const doc = editor.document;
    const text = doc.getText();

    // 1. Delete declaration line
    const declRegex = new RegExp(`^[ \t]*(?:Node|ListNode)\\s*\\*\\s*${varName}\\s*=[^;]+;[ \t]*\r?\n?`, 'm');
    const match = declRegex.exec(text);

    // 2. Delete any next assignments involving varName
    const nextAssignRegex = new RegExp(
      `^[ \t]*(?:${varName}\\s*->\\s*next\\s*=[^;]+;|[a-zA-Z_][a-zA-Z0-9_]*\\s*->\\s*next\\s*=\\s*${varName}\\s*;)[ \t]*\r?\n?`,
      'gm'
    );

    let editsMade = 0;
    const success = await editor.edit((b) => {
      if (match) {
        const start = doc.positionAt(match.index);
        const end = doc.positionAt(match.index + match[0].length);
        b.delete(new vscode.Range(start, end));
        editsMade++;
      }
      let nMatch: RegExpExecArray | null;
      while ((nMatch = nextAssignRegex.exec(text)) !== null) {
        const start = doc.positionAt(nMatch.index);
        const end = doc.positionAt(nMatch.index + nMatch[0].length);
        b.delete(new vscode.Range(start, end));
        editsMade++;
      }
    });

    return {
      ok: success,
      message: `Deleted ${varName} from source code`,
    };
  }

  /**
   * Create or push onto a Stack
   */
  public static async handleStackPush(
    editor: vscode.TextEditor,
    varName: string,
    value: number
  ): Promise<CreativeEditResult> {
    const doc = editor.document;
    let text = doc.getText();

    // 1. If file is completely empty or has no main(), scaffold a complete runnable program
    if (!text.trim() || !text.includes('main(')) {
      const boilerplate = `#include <iostream>
#include <stack>

int main() {
    std::stack<int> ${varName};
    ${varName}.push(${value});

    return 0;
}
`;
      const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
      const applied = await editor.edit((b) => b.replace(fullRange, boilerplate));
      if (!applied) return { ok: false, error: 'Failed to write C++ stack boilerplate' };
      return { ok: true, message: `Created std::stack<int> ${varName} and pushed ${value}`, highlightLine: 6 };
    }

    // 2. File exists and has main(). Ensure #include <stack> is present at top
    let workingText = text;
    if (!workingText.includes('#include <stack>')) {
      await editor.edit((b) => b.insert(new vscode.Position(0, 0), '#include <stack>\n'));
      workingText = editor.document.getText();
    }

    // 3. Insert declaration (if missing) and push statement in main()
    const stackDeclRegex = new RegExp(`\\b(?:std::)?stack\\s*<\\s*int\\s*>\\s*${varName}\\s*;`);
    const mainPos = this.findMainInsertionPosition(editor.document);
    if (!mainPos) return { ok: false, error: 'Could not find insertion position in main()' };

    let codeToInsert = '';
    if (!stackDeclRegex.test(workingText)) {
      codeToInsert += `    std::stack<int> ${varName};\n`;
    }
    codeToInsert += `    ${varName}.push(${value});\n`;

    const success = await editor.edit((b) => {
      b.insert(mainPos.position, codeToInsert);
    });

    return {
      ok: success,
      message: `Added: ${varName}.push(${value});`,
      highlightLine: mainPos.position.line + 1,
    };
  }

  /**
   * Create or push onto a Queue
   */
  public static async handleQueuePush(
    editor: vscode.TextEditor,
    varName: string,
    value: number
  ): Promise<CreativeEditResult> {
    const doc = editor.document;
    let text = doc.getText();

    // 1. If file is completely empty or has no main(), scaffold a complete runnable program
    if (!text.trim() || !text.includes('main(')) {
      const boilerplate = `#include <iostream>
#include <queue>

int main() {
    std::queue<int> ${varName};
    ${varName}.push(${value});

    return 0;
}
`;
      const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
      const applied = await editor.edit((b) => b.replace(fullRange, boilerplate));
      if (!applied) return { ok: false, error: 'Failed to write C++ queue boilerplate' };
      return { ok: true, message: `Created std::queue<int> ${varName} and pushed ${value}`, highlightLine: 6 };
    }

    // 2. File exists and has main(). Ensure #include <queue> is present at top
    let workingText = text;
    if (!workingText.includes('#include <queue>')) {
      await editor.edit((b) => b.insert(new vscode.Position(0, 0), '#include <queue>\n'));
      workingText = editor.document.getText();
    }

    // 3. Insert declaration (if missing) and push statement in main()
    const queueDeclRegex = new RegExp(`\\b(?:std::)?queue\\s*<\\s*int\\s*>\\s*${varName}\\s*;`);
    const mainPos = this.findMainInsertionPosition(editor.document);
    if (!mainPos) return { ok: false, error: 'Could not find insertion position in main()' };

    let codeToInsert = '';
    if (!queueDeclRegex.test(workingText)) {
      codeToInsert += `    std::queue<int> ${varName};\n`;
    }
    codeToInsert += `    ${varName}.push(${value});\n`;

    const success = await editor.edit((b) => {
      b.insert(mainPos.position, codeToInsert);
    });

    return {
      ok: success,
      message: `Added: ${varName}.push(${value});`,
      highlightLine: mainPos.position.line + 1,
    };
  }

  /**
   * Create or initialize a std::string in the active C++ file
   */
  public static async handleStringCreate(
    editor: vscode.TextEditor,
    varName: string,
    initialValue: string = "hello"
  ): Promise<CreativeEditResult> {
    const doc = editor.document;
    let text = doc.getText();

    // 1. If file is completely empty or has no main(), scaffold runnable program
    if (!text.trim() || !text.includes('main(')) {
      const boilerplate = `#include <iostream>
#include <string>

int main() {
    std::string ${varName} = "${initialValue}";

    return 0;
}
`;
      const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
      const applied = await editor.edit((b) => b.replace(fullRange, boilerplate));
      if (!applied) return { ok: false, error: 'Failed to write C++ string boilerplate' };
      return { ok: true, message: `Created std::string ${varName} = "${initialValue}";`, highlightLine: 5 };
    }

    // 2. Ensure #include <string> is present at top
    let workingText = text;
    if (!workingText.includes('#include <string>')) {
      await editor.edit((b) => b.insert(new vscode.Position(0, 0), '#include <string>\n'));
      workingText = editor.document.getText();
    }

    // 3. Insert declaration in main()
    const strDeclRegex = new RegExp(`\\b(?:std::)?string\\s+${varName}\\b`);
    const mainPos = this.findMainInsertionPosition(editor.document);
    if (!mainPos) return { ok: false, error: 'Could not find insertion position in main()' };

    let codeToInsert = '';
    if (!strDeclRegex.test(workingText)) {
      codeToInsert += `    std::string ${varName} = "${initialValue}";\n`;
    }

    const success = await editor.edit((b) => {
      b.insert(mainPos.position, codeToInsert);
    });

    return {
      ok: success,
      message: `Added: std::string ${varName} = "${initialValue}";`,
      highlightLine: mainPos.position.line + 1,
    };
  }

  /**
   * Append a character to an existing std::string in main()
   */
  public static async handleStringAppend(
    editor: vscode.TextEditor,
    varName: string,
    charOrStr: string
  ): Promise<CreativeEditResult> {
    const mainPos = this.findMainInsertionPosition(editor.document);
    if (!mainPos) return { ok: false, error: 'Could not find insertion position in main()' };

    const statement = charOrStr.length === 1 ? `    ${varName} += '${charOrStr}';\n` : `    ${varName} += "${charOrStr}";\n`;
    const success = await editor.edit((b) => {
      b.insert(mainPos.position, statement);
    });

    return {
      ok: success,
      message: `Added: ${varName} += '${charOrStr}';`,
      highlightLine: mainPos.position.line + 1,
    };
  }

  /**
   * Mutate a character at an index: str[idx] = 'c';
   */
  public static async handleStringMutate(
    editor: vscode.TextEditor,
    varName: string,
    index: number,
    char: string
  ): Promise<CreativeEditResult> {
    const mainPos = this.findMainInsertionPosition(editor.document);
    if (!mainPos) return { ok: false, error: 'Could not find insertion position in main()' };

    const statement = `    ${varName}[${index}] = '${char}';\n`;
    const success = await editor.edit((b) => {
      b.insert(mainPos.position, statement);
    });

    return {
      ok: success,
      message: `Added: ${varName}[${index}] = '${char}';`,
      highlightLine: mainPos.position.line + 1,
    };
  }

  /**
   * Delete a string declaration and references from main()
   */
  public static async handleStringDelete(
    editor: vscode.TextEditor,
    varName: string
  ): Promise<CreativeEditResult> {
    const doc = editor.document;
    const text = doc.getText();
    const regex = new RegExp(`^[ \\t]*.*\\b${varName}\\b.*$\\r?\\n?`, 'gm');
    const newText = text.replace(regex, '');
    const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
    const success = await editor.edit((b) => b.replace(fullRange, newText));
    return {
      ok: success,
      message: `Removed std::string ${varName}`,
    };
  }

  /**
   * Helper: Locate insertion position inside main() right before 'return 0;' or closing '}'
   */
  private static findMainInsertionPosition(doc: vscode.TextDocument): { position: vscode.Position } | null {
    const text = doc.getText();
    const mainMatch = /\bint\s+main\s*\([^)]*\)\s*\{/.exec(text);
    if (!mainMatch) return null;

    const mainOpenOffset = mainMatch.index + mainMatch[0].length;
    // Look for 'return ' after mainOpenOffset
    const returnMatch = /\breturn\b[^\n;]*;/.exec(text.substring(mainOpenOffset));

    if (returnMatch) {
      const returnOffset = mainOpenOffset + returnMatch.index;
      const pos = doc.positionAt(returnOffset);
      return { position: new vscode.Position(pos.line, 0) };
    }

    // Fallback: right before the last closing brace '}' of main()
    const lastBraceOffset = text.lastIndexOf('}');
    if (lastBraceOffset > mainOpenOffset) {
      const pos = doc.positionAt(lastBraceOffset);
      return { position: new vscode.Position(pos.line, 0) };
    }

    return { position: new vscode.Position(doc.lineCount, 0) };
  }
}
