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

function containsVisibleContent(text: string): boolean {
  const clean = stripAnsi(text);
  return /\S/.test(clean);
}

const INACTIVITY_TIMEOUT_MS = 10_000;

export class TerminalMonitor implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private activeReaders = new Set<AbortController>();
  private inactivityTimers = new Map<vscode.TerminalShellExecution, ReturnType<typeof setTimeout>>();
  private inactivityFired = new Set<vscode.TerminalShellExecution>();

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

  private resetInactivityTimer(execution: vscode.TerminalShellExecution): void {
    const existing = this.inactivityTimers.get(execution);
    if (existing) {
      clearTimeout(existing);
    }
    this.inactivityFired.delete(execution);

    const timer = setTimeout(() => {
      if (!this.inactivityFired.has(execution)) {
        this.inactivityFired.add(execution);
        const config = this.getConfig();
        if (config.get<boolean>("enabled", false) && config.get<boolean>("onQuestion", true)) {
          playSound("question");
        }
      }
    }, INACTIVITY_TIMEOUT_MS);
    this.inactivityTimers.set(execution, timer);
  }

  private clearInactivityTimer(execution: vscode.TerminalShellExecution): void {
    const timer = this.inactivityTimers.get(execution);
    if (timer) {
      clearTimeout(timer);
      this.inactivityTimers.delete(execution);
    }
    this.inactivityFired.delete(execution);
  }

  private async watchExecutionOutput(
    execution: vscode.TerminalShellExecution
  ): Promise<void> {
    const controller = new AbortController();
    this.activeReaders.add(controller);

    this.resetInactivityTimer(execution);

    try {
      const stream = execution.read();
      for await (const data of stream) {
        if (controller.signal.aborted) {
          break;
        }
        // Reset inactivity timer on each output chunk
        if (containsVisibleContent(data)) {
          this.resetInactivityTimer(execution);
        }
        if (matchesQuestionPattern(data)) {
          playSound("question");
        }
      }
    } catch {
      // stream ended or was aborted
    } finally {
      this.clearInactivityTimer(execution);
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
    for (const timer of this.inactivityTimers.values()) {
      clearTimeout(timer);
    }
    this.inactivityTimers.clear();
    this.inactivityFired.clear();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
