import * as vscode from "vscode";
import { fetchUsage } from "./api";
import { StatusBarManager } from "./statusBar";
import { TerminalMonitor } from "./terminalMonitor";
import { FileMonitor } from "./fileMonitor";

let statusBar: StatusBarManager;
let terminalMonitor: TerminalMonitor;
let fileMonitor: FileMonitor;
let timer: ReturnType<typeof setInterval> | undefined;

async function refresh(): Promise<void> {
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

  // React to config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("jeanClaude")) {
        startPolling();
        refresh();
      }
    })
  );

  // Initial fetch and start polling
  refresh();
  startPolling();

  context.subscriptions.push({ dispose: stopPolling });
}

export function deactivate(): void {
  stopPolling();
}
