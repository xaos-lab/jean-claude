import * as vscode from "vscode";
import * as crypto from "crypto";
import * as path from "path";
import { fetchUsage } from "./api";
import { StatusBarManager } from "./statusBar";
import { EventMonitor, ClaudeEventType } from "./eventMonitor";
import { hasOurHooks, installHooks, WINDOW_ENV } from "./hooks";
import { findClaudeCodeDirs, setBlinking } from "./tabIcons";
import { playSound, showToast, flashWindow } from "./sound";

const CLAUDE_CODE_ID = "anthropic.claude-code";

let statusBar: StatusBarManager;
let timer: ReturnType<typeof setInterval> | undefined;

function isUsageMonitorEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("jeanClaude")
    .get<boolean>("usageMonitor.enabled", false);
}

async function refresh(): Promise<void> {
  if (!isUsageMonitorEnabled()) {
    statusBar.showDisabled();
    return;
  }

  const config = vscode.workspace.getConfiguration("jeanClaude");
  const authMethod = config.get<string>("authMethod", "auto");
  const sessionKey = config.get<string>("sessionKey", "");

  try {
    const data = await fetchUsage(authMethod, sessionKey);
    statusBar.update(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    statusBar.showError(message);
  }
}

function startPolling(): void {
  stopPolling();
  const config = vscode.workspace.getConfiguration("jeanClaude");
  const intervalMin = config.get<number>("refreshInterval", 5);
  timer = setInterval(refresh, intervalMin * 60 * 1000);
}

function stopPolling(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}

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

function handleClaudeEvent(type: ClaudeEventType): void {
  const config = vscode.workspace.getConfiguration("jeanClaude.notificationSound");
  if (!config.get<boolean>("enabled", false)) {
    return;
  }
  const wanted =
    type === "question"
      ? config.get<boolean>("onQuestion", true)
      : config.get<boolean>("onTaskComplete", true);
  if (!wanted) {
    return;
  }

  playSound();
  if (!vscode.window.state.focused) {
    if (config.get<boolean>("showNotification", true)) {
      showToast(type);
    }
    if (config.get<boolean>("flashTaskbar", true)) {
      flashWindow();
    }
  }
}

/** Applies or removes the blinking tab icons in every installed Claude Code version. */
function syncTabIcons(): void {
  const claudeCode = vscode.extensions.getExtension(CLAUDE_CODE_ID);
  if (!claudeCode) {
    return;
  }
  const enabled = vscode.workspace
    .getConfiguration("jeanClaude")
    .get<boolean>("blinkingTabs.enabled", true);

  let activeChanged = false;
  for (const dir of findClaudeCodeDirs(path.dirname(claudeCode.extensionPath))) {
    const changed = setBlinking(dir, enabled);
    if (changed && path.resolve(dir) === path.resolve(claudeCode.extensionPath)) {
      activeChanged = true;
    }
  }

  // VS Code caches tab icons, so the running Claude Code needs a reload.
  if (activeChanged) {
    vscode.window
      .showInformationMessage(
        enabled
          ? "Jean Claude: reload the window to make Claude Code session tabs blink."
          : "Jean Claude: reload the window to stop Claude Code session tabs blinking.",
        "Reload Window"
      )
      .then((choice) => {
        if (choice === "Reload Window") {
          vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      });
  }
}

export function activate(context: vscode.ExtensionContext): void {
  statusBar = new StatusBarManager();
  context.subscriptions.push({ dispose: () => statusBar.dispose() });

  const windowId = computeWindowId();
  tagSessionsWithWindowId(context, windowId);
  context.subscriptions.push(new EventMonitor(windowId, handleClaudeEvent));

  // Upgrade hooks written by older versions (they reacted to every Claude
  // session on the machine, including the desktop app and other terminals).
  if (hasOurHooks()) {
    try {
      installHooks();
    } catch {
      // settings.json unreadable: leave it alone
    }
  }

  syncTabIcons();
  // Claude Code installs each update into a new folder: patch it right away.
  context.subscriptions.push(vscode.extensions.onDidChange(() => syncTabIcons()));

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("jeanClaude.refresh", async () => {
      if (!isUsageMonitorEnabled()) {
        vscode.window.showWarningMessage(
          "Usage monitor is disabled. Enable it in Settings → jeanClaude.usageMonitor.enabled.\n" +
          "Note: This calls the Anthropic API and may incur extra usage charges under the new billing policy."
        );
        return;
      }
      statusBar.showLoading();
      await refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("jeanClaude.setSessionKey", async () => {
      const key = await vscode.window.showInputBox({
        prompt: "Enter your claude.ai sessionKey cookie",
        placeHolder: "sk-ant-sid01-...",
        password: true,
        ignoreFocusOut: true,
      });
      if (key !== undefined) {
        const config = vscode.workspace.getConfiguration("jeanClaude");
        await config.update("sessionKey", key, vscode.ConfigurationTarget.Global);
        if (config.get<string>("authMethod") === "auto") {
          await config.update("authMethod", "cookie", vscode.ConfigurationTarget.Global);
        }
        statusBar.showLoading();
        await refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("jeanClaude.setupNotifications", async () => {
      let changed: boolean;
      try {
        changed = installHooks();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(
          `Jean Claude: could not update ~/.claude/settings.json (${message}). Fix the file and try again.`
        );
        return;
      }

      const config = vscode.workspace.getConfiguration("jeanClaude");
      await config.update("notificationSound.enabled", true, vscode.ConfigurationTarget.Global);

      vscode.window.showInformationMessage(
        changed
          ? "Notifications enabled! Claude hooks added to ~/.claude/settings.json."
          : "Notifications enabled! Claude hooks were already configured."
      );
    })
  );

  // React to config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("jeanClaude.blinkingTabs")) {
        syncTabIcons();
      }
      if (
        e.affectsConfiguration("jeanClaude.usageMonitor") ||
        e.affectsConfiguration("jeanClaude.authMethod") ||
        e.affectsConfiguration("jeanClaude.sessionKey") ||
        e.affectsConfiguration("jeanClaude.refreshInterval")
      ) {
        if (isUsageMonitorEnabled()) {
          startPolling();
          refresh();
        } else {
          stopPolling();
          statusBar.showDisabled();
        }
      }
    })
  );

  // Initial fetch and start polling (only if usage monitor is enabled)
  if (isUsageMonitorEnabled()) {
    refresh();
    startPolling();
  } else {
    statusBar.showDisabled();
  }

  context.subscriptions.push({ dispose: stopPolling });
}

export function deactivate(): void {
  stopPolling();
}
