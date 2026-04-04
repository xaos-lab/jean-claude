import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { fetchUsage } from "./api";
import { StatusBarManager } from "./statusBar";
import { TerminalMonitor } from "./terminalMonitor";
import { FileMonitor } from "./fileMonitor";

let statusBar: StatusBarManager;
let terminalMonitor: TerminalMonitor;
let fileMonitor: FileMonitor;
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

export function activate(context: vscode.ExtensionContext): void {
  statusBar = new StatusBarManager();
  context.subscriptions.push({ dispose: () => statusBar.dispose() });

  terminalMonitor = new TerminalMonitor();
  context.subscriptions.push(terminalMonitor);

  fileMonitor = new FileMonitor();
  context.subscriptions.push(fileMonitor);

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
      const settingsPath = path.join(os.homedir(), ".claude", "settings.json");

      let settings: Record<string, unknown> = {};
      try {
        if (fs.existsSync(settingsPath)) {
          settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        }
      } catch {
        // ignore parse errors, start fresh
      }

      const hooks = (settings.hooks || {}) as Record<string, unknown>;

      const requiredHooks: Record<string, { command: string }[]> = {
        PermissionRequest: [
          { command: 'echo "Permission needed" > ~/.claude/claude-notify' },
        ],
        Notification: [
          { command: 'echo "$CLAUDE_NOTIFICATION" > ~/.claude/claude-notify' },
        ],
        Stop: [
          { command: "echo done > ~/.claude/claude-stop" },
        ],
      };

      let changed = false;
      for (const [event, hookEntries] of Object.entries(requiredHooks)) {
        if (!hooks[event]) {
          hooks[event] = [
            { hooks: hookEntries.map((h) => ({ type: "command", command: h.command })) },
          ];
          changed = true;
        }
      }

      if (changed) {
        settings.hooks = hooks;
        const claudeDir = path.join(os.homedir(), ".claude");
        if (!fs.existsSync(claudeDir)) {
          fs.mkdirSync(claudeDir, { recursive: true });
        }
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
      }

      // Enable notification sound setting
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
      if (e.affectsConfiguration("jeanClaude")) {
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
