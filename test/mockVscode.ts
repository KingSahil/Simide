export class Position {
  constructor(public line: number, public character: number) {}
}

export class Range {
  public start: Position;
  public end: Position;
  constructor(startLine: number, startChar: number, endLine: number, endChar: number) {
    this.start = new Position(startLine, startChar);
    this.end = new Position(endLine, endChar);
  }
}

export class Selection extends Range {
  public anchor: Position;
  public active: Position;
  constructor(anchor: Position, active: Position) {
    super(anchor.line, anchor.character, active.line, active.character);
    this.anchor = anchor;
    this.active = active;
  }
}

export enum TextEditorRevealType {
  Default = 0,
  InCenter = 1,
  InCenterIfOutsideViewport = 2,
  AtTop = 3,
}

export enum OverviewRulerLane {
  Left = 1,
  Center = 2,
  Right = 4,
  Full = 7,
}

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3,
}

export const Uri = {
  file: (fsPath: string) => ({ fsPath }),
  joinPath: (base: { fsPath: string }, ...parts: string[]) => ({
    fsPath: [base.fsPath, ...parts].join('/'),
  }),
};

export const window = {
  activeTextEditor: undefined,
  visibleTextEditors: [] as any[],
  createTextEditorDecorationType: () => ({ dispose: () => {} }),
  onDidChangeActiveTextEditor: (_listener: unknown) => ({ dispose: () => {} }),
  showWarningMessage: () => {},
  showErrorMessage: () => {},
  showInformationMessage: () => {},
  showTextDocument: async (document: any, _options?: any) => {
    const editor = {
      document,
      selection: new Selection(new Position(0, 0), new Position(0, 0)),
      setDecorations: () => {},
      revealRange: () => {},
    } as any;
    window.activeTextEditor = editor;
    window.visibleTextEditors = [editor];
    return editor;
  },
};

export const workspace = {
  openTextDocument: async (uri: { fsPath: string }) => ({ fileName: uri.fsPath, languageId: 'cpp' }),
  onDidChangeTextDocument: (_listener: unknown) => ({ dispose: () => {} }),
  workspaceFolders: [
    {
      uri: {
        fsPath: process.cwd(),
      },
    },
  ],
};

export const extensions = {
  getExtension: (id: string) => ({ id }),
};

export const debug = {
  startDebugging: async () => true,
  stopDebugging: async () => {},
  onDidChangeActiveStackItem: (_listener: unknown) => ({ dispose: () => {} }),
  registerDebugAdapterTrackerFactory: (_type: string, _factory: unknown) => ({ dispose: () => {} }),
  activeDebugSession: undefined as any,
};

export const commands = {
  executeCommand: async (_command: string) => {},
};

export default {
  Position,
  Range,
  Selection,
  TextEditorRevealType,
  OverviewRulerLane,
  ViewColumn,
  window,
  workspace,
  extensions,
  debug,
  commands,
};
