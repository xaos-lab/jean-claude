import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { EVENTS_DIR } from "./hooks";

export type ClaudeEventType = "question" | "done";

interface ClaudeEvent {
  event: ClaudeEventType;
  entrypoint: string;
  window: string;
  cwd: string;
}

const MAX_EVENT_AGE_MS = 60_000;
const SAME_EVENT_COOLDOWN_MS = 1500;

/**
 * Watches the event files written by the Claude Code hooks and reports only
 * events from sessions that belong to this VS Code window. Sessions from the
 * Claude desktop app, a separate terminal, or another VS Code window are ignored.
 */
export class EventMonitor implements vscode.Disposable {
  private watcher: fs.FSWatcher | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private seen = new Set<string>();
  private lastFired = new Map<ClaudeEventType, number>();

  constructor(
    private readonly windowId: string,
    private readonly onEvent: (type: ClaudeEventType) => void
  ) {
    try {
      fs.mkdirSync(EVENTS_DIR, { recursive: true });
      // Ignore whatever was there before this window started.
      for (const name of fs.readdirSync(EVENTS_DIR)) {
        this.seen.add(name);
      }
    } catch {
      // ignore: the poll below keeps retrying
    }

    try {
      this.watcher = fs.watch(EVENTS_DIR, () => this.scheduleScan());
    } catch {
      this.watcher = null;
    }
    // Fallback in case fs.watch misses changes.
    this.pollTimer = setInterval(() => this.scan(), 1000);
  }

  private scheduleScan(): void {
    if (this.scanTimer) {
      return;
    }
    // Short delay so the hook finishes writing the file.
    this.scanTimer = setTimeout(() => {
      this.scanTimer = null;
      this.scan();
    }, 100);
  }

  private scan(): void {
    let names: string[];
    try {
      names = fs.readdirSync(EVENTS_DIR);
    } catch {
      return;
    }

    const present = new Set(names);
    for (const name of this.seen) {
      if (!present.has(name)) {
        this.seen.delete(name);
      }
    }

    const now = Date.now();
    for (const name of names) {
      if (!name.endsWith(".evt")) {
        continue;
      }
      const filePath = path.join(EVENTS_DIR, name);

      if (!this.seen.has(name)) {
        const ev = readEvent(filePath);
        if (!ev) {
          continue; // still being written, retry on the next scan
        }
        this.seen.add(name);
        if (this.belongsHere(ev)) {
          this.fire(ev.event);
        }
      }

      // Every window reads each file; whoever sees an old one deletes it.
      try {
        if (now - fs.statSync(filePath).mtimeMs > MAX_EVENT_AGE_MS) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // ignore: another window may have deleted it already
      }
    }
  }

  private belongsHere(ev: ClaudeEvent): boolean {
    // Sessions started from this window carry its ID (see extension.ts).
    if (ev.window) {
      return ev.window === this.windowId;
    }
    // Claude Code panels opened before this extension activated have no ID:
    // accept them if they run inside one of this window's folders.
    if (ev.entrypoint !== "claude-vscode" || !ev.cwd) {
      return false;
    }
    const cwd = normalizePath(ev.cwd);
    return (vscode.workspace.workspaceFolders ?? []).some((folder) => {
      const root = normalizePath(folder.uri.fsPath);
      return cwd === root || cwd.startsWith(root + "/");
    });
  }

  private fire(type: ClaudeEventType): void {
    const now = Date.now();
    if (now - (this.lastFired.get(type) ?? 0) < SAME_EVENT_COOLDOWN_MS) {
      return;
    }
    this.lastFired.set(type, now);
    this.onEvent(type);
  }

  dispose(): void {
    this.watcher?.close();
    this.watcher = null;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
  }
}

function readEvent(filePath: string): ClaudeEvent | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  const fields: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq > 0) {
      fields[line.slice(0, eq)] = line.slice(eq + 1).trim();
    }
  }
  if (fields.event !== "question" && fields.event !== "done") {
    return null;
  }
  return {
    event: fields.event,
    entrypoint: fields.entrypoint ?? "",
    window: fields.window ?? "",
    cwd: fields.cwd ?? "",
  };
}

/** Makes "C:\\Foo", "c:/foo/" and Git Bash's "/c/foo" compare equal. */
function normalizePath(p: string): string {
  let result = p.replace(/\\/g, "/").replace(/\/+$/, "");
  if (process.platform !== "win32") {
    return result;
  }
  const msys = /^\/([a-zA-Z])(\/|$)/.exec(result);
  if (msys) {
    result = `${msys[1]}:/${result.slice(3)}`.replace(/\/+$/, "");
  }
  return result.toLowerCase();
}
