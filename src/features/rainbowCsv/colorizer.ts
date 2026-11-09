// Colors the columns of CSV/TSV files with editor decorations. Only the visible
// lines (plus a margin) are decorated, so big files stay fast while scrolling.
import * as vscode from "vscode";
import * as path from "path";
import { detectDelimiter, LineState, nextLineState, parseLine, RECORD_START } from "./parser";

/** Column colors for dark and light themes, repeated when there are more columns. */
const PALETTE = [
  { dark: "#4FC1FF", light: "#0067B8" }, // blue
  { dark: "#F0A35E", light: "#B35900" }, // orange
  { dark: "#8BD17C", light: "#2E7D32" }, // green
  { dark: "#D68CF0", light: "#8E24AA" }, // purple
  { dark: "#E8D06A", light: "#8D6E00" }, // yellow
  { dark: "#4ED6C9", light: "#00796B" }, // teal
  { dark: "#FF7B7B", light: "#C62828" }, // red
  { dark: "#A9B7FF", light: "#3949AB" }, // indigo
];

const CSV_EXTENSIONS = new Set([".csv", ".tsv", ".tab"]);
const TAB_EXTENSIONS = new Set([".tsv", ".tab"]);
/** Lines decorated above and below the visible ones. */
const MARGIN = 200;
/** Lines used to detect the delimiter. */
const SAMPLE_LINES = 50;
/** In bigger files, quoted fields spanning several lines are not followed. */
const MAX_LINES_FOR_MULTILINE = 100_000;
/** Wait this long after typing before coloring again. */
const EDIT_DELAY_MS = 150;

interface DocInfo {
  version: number;
  delimiter: string;
  /** Lines that start inside a quoted field; all other lines start a new record. */
  continued: Map<number, LineState>;
}

interface Decorated {
  version: number;
  from: number;
  to: number;
}

export class CsvColorizer implements vscode.Disposable {
  private readonly types = PALETTE.map((color) =>
    vscode.window.createTextEditorDecorationType({
      light: { color: color.light },
      dark: { color: color.dark },
    })
  );
  private readonly docs = new Map<vscode.TextDocument, DocInfo>();
  private readonly decorated = new WeakMap<vscode.TextEditor, Decorated>();
  private readonly timers = new Map<vscode.TextDocument, NodeJS.Timeout>();
  private readonly disposables: vscode.Disposable[];

  constructor() {
    this.disposables = [
      // Disposing a decoration type removes its colors from all editors.
      ...this.types,
      vscode.window.onDidChangeVisibleTextEditors((editors) => editors.forEach((e) => this.update(e))),
      vscode.window.onDidChangeTextEditorVisibleRanges((e) => this.update(e.textEditor)),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.contentChanges.length > 0 && isCsv(e.document)) {
          this.updateLater(e.document);
        }
      }),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        clearTimeout(this.timers.get(doc));
        this.timers.delete(doc);
        this.docs.delete(doc);
      }),
    ];
    vscode.window.visibleTextEditors.forEach((e) => this.update(e));
  }

  private updateLater(doc: vscode.TextDocument): void {
    clearTimeout(this.timers.get(doc));
    this.timers.set(
      doc,
      setTimeout(() => {
        this.timers.delete(doc);
        vscode.window.visibleTextEditors.filter((e) => e.document === doc).forEach((e) => this.update(e));
      }, EDIT_DELAY_MS)
    );
  }

  /** Colors the visible lines of the editor, unless they are colored already. */
  private update(editor: vscode.TextEditor): void {
    const doc = editor.document;
    if (!isCsv(doc)) {
      return;
    }
    const visible = editor.visibleRanges;
    const first = visible.length > 0 ? visible[0].start.line : 0;
    const last = visible.length > 0 ? visible[visible.length - 1].end.line : 0;

    const done = this.decorated.get(editor);
    if (done && done.version === doc.version && first >= done.from && last <= done.to) {
      return;
    }

    const from = Math.max(0, first - MARGIN);
    const to = Math.min(doc.lineCount - 1, last + MARGIN);
    this.decorate(editor, from, to);
    this.decorated.set(editor, { version: doc.version, from, to });
  }

  private decorate(editor: vscode.TextEditor, from: number, to: number): void {
    const doc = editor.document;
    const info = this.info(doc);
    const ranges: vscode.Range[][] = this.types.map(() => []);
    for (let line = from; line <= to; line++) {
      const state = info.continued.get(line) ?? RECORD_START;
      parseLine(doc.lineAt(line).text, info.delimiter, state, (start, end, column) => {
        ranges[column % ranges.length].push(new vscode.Range(line, start, line, end));
      });
    }
    this.types.forEach((type, i) => editor.setDecorations(type, ranges[i]));
  }

  private info(doc: vscode.TextDocument): DocInfo {
    let info = this.docs.get(doc);
    if (!info || info.version !== doc.version) {
      info = analyze(doc);
      this.docs.set(doc, info);
    }
    return info;
  }

  dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.docs.clear();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}

function isCsv(doc: vscode.TextDocument): boolean {
  return CSV_EXTENSIONS.has(extension(doc)) || doc.languageId === "csv" || doc.languageId === "tsv";
}

function extension(doc: vscode.TextDocument): string {
  return path.posix.extname(doc.uri.path).toLowerCase();
}

/** Finds the delimiter and the lines that continue a quoted field from the line above. */
function analyze(doc: vscode.TextDocument): DocInfo {
  const delimiter =
    TAB_EXTENSIONS.has(extension(doc)) || doc.languageId === "tsv" ? "\t" : detectDelimiter(sampleLines(doc));

  const continued = new Map<number, LineState>();
  if (doc.lineCount <= MAX_LINES_FOR_MULTILINE) {
    let state = RECORD_START;
    for (let line = 0; line < doc.lineCount; line++) {
      if (state.inQuotes) {
        continued.set(line, state);
      }
      state = nextLineState(parseLine(doc.lineAt(line).text, delimiter, state));
    }
    // A quote that never closes is a stray one, not a multi-line field:
    // read every line on its own instead of coloring the rest of the file as one field.
    if (state.inQuotes) {
      continued.clear();
    }
  }
  return { version: doc.version, delimiter, continued };
}

function sampleLines(doc: vscode.TextDocument): string[] {
  const lines: string[] = [];
  for (let line = 0; line < doc.lineCount && lines.length < SAMPLE_LINES; line++) {
    const text = doc.lineAt(line).text;
    if (text.trim() !== "") {
      lines.push(text);
    }
  }
  return lines;
}
