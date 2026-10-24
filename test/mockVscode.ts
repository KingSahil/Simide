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

export const Uri = {
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
};

export const workspace = {
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
  window,
  workspace,
  extensions,
  debug,
};
