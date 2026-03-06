import * as vscode from "vscode";
import { playSound } from "./sound";

// Patterns that indicate Claude Code is asking the user a question
const QUESTION_PATTERNS = [
  /\(y\/n\)/i,
  /\(Y\/n\)/,
  /\(yes\/no\)/i,
  /Allow .+\?/,
  /Do you want to/i,
  /Would you like to/i,
  /\? \(y\)/i,
  // Claude Code permission prompt patterns
  /Approve\?/i,
  /Press Enter to/i,
  /waiting for input/i,
];

// ANSI escape code stripper
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}

function isClaudeCommand(commandLine: string): boolean {
  const cmd = commandLine.trim().toLowerCase();
  return cmd === "claude" || cmd.startsWith("claude ");
}

function matchesQuestionPattern(text: string): boolean {
  const clean = stripAnsi(text);
  return QUESTION_PATTERNS.some((p) => p.test(clean));
}

export class TerminalMonitor implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private activeReaders = new Set<AbortController>();

  constructor() {
    this.disposables.push(
      vscode.window.onDidStartTerminalShellExecution((event) => {
        this.onCommandStart(event);
      })
    );

    this.disposables.push(
      vscode.window.onDidEndTerminalShellExecution((event) => {
        this.onCommandEnd(event);
      })
    );
  }

  private getConfig() {
    return vscode.workspace.getConfiguration("jeanClaude.notificationSound");
  }

  private onCommandStart(event: vscode.TerminalShellExecutionStartEvent): void {
    const config = this.getConfig();
    if (!config.get<boolean>("enabled", false)) {
      return;
    }
    if (!config.get<boolean>("onQuestion", true)) {
      return;
    }

    const cmdValue = event.execution.commandLine.value;
    if (!isClaudeCommand(cmdValue)) {
      return;
    }

    // Read terminal output stream and watch for question patterns
    this.watchExecutionOutput(event.execution);
  }

  private async watchExecutionOutput(
    execution: vscode.TerminalShellExecution
  ): Promise<void> {
    const controller = new AbortController();
    this.activeReaders.add(controller);

    try {
      const stream = execution.read();
      for await (const data of stream) {
        if (controller.signal.aborted) {
          break;
        }
        if (matchesQuestionPattern(data)) {
          playSound("question");
        }
      }
    } catch {
      // stream ended or was aborted
    } finally {
      this.activeReaders.delete(controller);
    }
  }

  private onCommandEnd(event: vscode.TerminalShellExecutionEndEvent): void {
    const config = this.getConfig();
    if (!config.get<boolean>("enabled", false)) {
      return;
    }
    if (!config.get<boolean>("onTaskComplete", true)) {
      return;
    }

    const cmdValue = event.execution.commandLine.value;
    if (!isClaudeCommand(cmdValue)) {
      return;
    }

    playSound("taskComplete");
  }

  dispose(): void {
    for (const controller of this.activeReaders) {
      controller.abort();
    }
    this.activeReaders.clear();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
