import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { playSound } from "./sound";

const NOTIFY_FILENAME = "claude-notify";
const STOP_FILENAME = "claude-stop";

export class FileMonitor implements vscode.Disposable {
  private notifyWatcher: fs.FSWatcher | null = null;
  private stopWatcher: fs.FSWatcher | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastNotifyMtime = 0;
  private lastStopMtime = 0;
  private notifyPath: string;
  private stopPath: string;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    const claudeDir = path.join(os.homedir(), ".claude");
    this.notifyPath = path.join(claudeDir, NOTIFY_FILENAME);
    this.stopPath = path.join(claudeDir, STOP_FILENAME);

    this.ensureFile(this.notifyPath);
    this.ensureFile(this.stopPath);
    this.startWatching();
  }

  private ensureFile(filePath: string): void {
    try {
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, "", "utf8");
      }
    } catch {
      // ignore - file might be in a read-only location
    }
  }

  private startWatching(): void {
    this.notifyWatcher = this.watchFile(this.notifyPath, "notify");
    this.stopWatcher = this.watchFile(this.stopPath, "stop");

    // Fallback polling in case fs.watch misses changes
    this.pollInterval = setInterval(() => this.poll(), 1000);
  }

  private watchFile(
    filePath: string,
    type: "notify" | "stop"
  ): fs.FSWatcher | null {
    try {
      return fs.watch(filePath, () => {
        this.debouncedTrigger(filePath, type);
      });
    } catch {
      return null;
    }
  }

  private debouncedTrigger(filePath: string, type: "notify" | "stop"): void {
    const key = type;
    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    // Small delay to let the write finish before reading
    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.handleTrigger(filePath, type);
    }, 150);
    this.debounceTimers.set(key, timer);
  }

  private poll(): void {
    this.checkMtime(this.notifyPath, "notify");
    this.checkMtime(this.stopPath, "stop");
  }

  private checkMtime(filePath: string, type: "notify" | "stop"): void {
    try {
      if (!fs.existsSync(filePath)) {
        return;
      }
      const stats = fs.statSync(filePath);
      const lastMtime = type === "notify" ? this.lastNotifyMtime : this.lastStopMtime;
      if (stats.mtimeMs > lastMtime && lastMtime !== 0) {
        this.debouncedTrigger(filePath, type);
      }
      if (type === "notify") {
        this.lastNotifyMtime = stats.mtimeMs;
      } else {
        this.lastStopMtime = stats.mtimeMs;
      }
    } catch {
      // ignore
    }
  }

  private handleTrigger(filePath: string, type: "notify" | "stop"): void {
    const config = vscode.workspace.getConfiguration(
      "jeanClaude.notificationSound"
    );
    if (!config.get<boolean>("enabled", false)) {
      return;
    }

    try {
      const message = fs.readFileSync(filePath, "utf8").trim();
      if (!message) {
        return;
      }

      // Clear the file first to prevent re-triggering
      fs.writeFileSync(filePath, "", "utf8");

      if (type === "notify") {
        if (config.get<boolean>("onQuestion", true)) {
          playSound("question");
          vscode.window.showWarningMessage(`Claude Code: ${message}`);
        }
      } else {
        if (config.get<boolean>("onTaskComplete", true)) {
          playSound("taskComplete");
          vscode.window.showInformationMessage(`Claude Code: ${message}`);
        }
      }
    } catch {
      // ignore read/write errors
    }
  }

  dispose(): void {
    if (this.notifyWatcher) {
      this.notifyWatcher.close();
      this.notifyWatcher = null;
    }
    if (this.stopWatcher) {
      this.stopWatcher.close();
      this.stopWatcher = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}
