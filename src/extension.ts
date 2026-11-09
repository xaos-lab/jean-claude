// Entry point: sets up what all features share, then hands over to the
// FeatureManager, which turns each feature on or off from its setting.
// Features live in src/features/ and are listed in src/features/index.ts.
import * as vscode from "vscode";
import * as crypto from "crypto";
import { EventMonitor, ClaudeEventType } from "./core/eventMonitor";
import { FeatureManager } from "./core/featureManager";
import { hasOurHooks, installHooks, WINDOW_ENV } from "./core/hooks";
import { FEATURES } from "./features";
import { setupNotifications } from "./features/notificationSound";

/**
 * An ID for this window that stays the same across reloads (VS Code never opens
 * the same workspace in two windows), so restored terminals keep a valid ID.
 */
function computeWindowId(): string {
  const workspace =
    vscode.workspace.workspaceFile?.toString() ??
    (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.toString()).join("|");
  if (!workspace) {
    return "empty-" + crypto.randomBytes(6).toString("hex");
  }
  return crypto.createHash("sha1").update(workspace).digest("hex").slice(0, 12);
}

/**
 * Tags every Claude Code session started from this window with the window ID,
 * so the hooks can report where they came from:
 * - the Claude Code panel runs `claude` from this extension host process,
 * - the Claude CLI runs in an integrated terminal of this window.
 */
function tagSessionsWithWindowId(context: vscode.ExtensionContext, windowId: string): void {
  process.env[WINDOW_ENV] = windowId;
  const env = context.environmentVariableCollection;
  env.description = "Lets Jean Claude tell which window a Claude Code session belongs to";
  env.replace(WINDOW_ENV, windowId);
}

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel("Jean Claude", { log: true });
  context.subscriptions.push(log);

  // Claude Code events (question / done) of this window's sessions, for any feature.
  const windowId = computeWindowId();
  tagSessionsWithWindowId(context, windowId);
  const claudeEvents = new vscode.EventEmitter<ClaudeEventType>();
  context.subscriptions.push(
    claudeEvents,
    new EventMonitor(windowId, (type) => claudeEvents.fire(type))
  );

  // Upgrade hooks written by older versions (they reacted to every Claude
  // session on the machine, including the desktop app and other terminals).
  if (hasOurHooks()) {
    try {
      installHooks();
    } catch {
      // settings.json unreadable: leave it alone
    }
  }

  context.subscriptions.push(
    new FeatureManager(FEATURES, { extension: context, onClaudeEvent: claudeEvents.event, log }),
    vscode.commands.registerCommand("jeanClaude.setupNotifications", setupNotifications)
  );
}

export function deactivate(): void {
  // Everything is disposed through context.subscriptions.
}
