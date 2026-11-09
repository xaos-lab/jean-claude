// Shows the Claude.ai usage limits (5h / 7d) in the status bar.
import * as vscode from "vscode";
import type { Feature } from "../../core/feature";
import { fetchUsage } from "./api";
import { UsageStatusBar } from "./statusBar";

export const usageMonitor: Feature = {
  id: "usageMonitor",
  title: "Usage monitor",
  description:
    "Shows your Claude.ai usage limits (5h / 7d) in the status bar. " +
    "⚠️ Calls the Anthropic API, which may count as extra usage.",
  // These settings predate the feature system, so they sit directly under jeanClaude.*
  restartOn: ["authMethod", "sessionKey", "refreshInterval"],

  activate(ctx) {
    const bar = new UsageStatusBar();
    ctx.subscriptions.push(bar);

    const refresh = async (): Promise<void> => {
      const config = vscode.workspace.getConfiguration("jeanClaude");
      try {
        bar.update(
          await fetchUsage(config.get<string>("authMethod", "auto"), config.get<string>("sessionKey", ""))
        );
      } catch (err: unknown) {
        bar.showError(err instanceof Error ? err.message : String(err));
      }
    };

    const minutes = vscode.workspace.getConfiguration("jeanClaude").get<number>("refreshInterval", 5);
    const timer = setInterval(refresh, minutes * 60 * 1000);

    ctx.subscriptions.push(
      { dispose: () => clearInterval(timer) },
      vscode.commands.registerCommand("jeanClaude.refresh", async () => {
        bar.showLoading();
        await refresh();
      }),
      vscode.commands.registerCommand("jeanClaude.setSessionKey", setSessionKey)
    );

    refresh();
  },
};

/** Changing the key restarts the feature (see restartOn), which fetches new data. */
async function setSessionKey(): Promise<void> {
  const key = await vscode.window.showInputBox({
    prompt: "Enter your claude.ai sessionKey cookie",
    placeHolder: "sk-ant-sid01-...",
    password: true,
    ignoreFocusOut: true,
  });
  if (key === undefined) {
    return;
  }
  const config = vscode.workspace.getConfiguration("jeanClaude");
  await config.update("sessionKey", key, vscode.ConfigurationTarget.Global);
  if (config.get<string>("authMethod") === "auto") {
    await config.update("authMethod", "cookie", vscode.ConfigurationTarget.Global);
  }
}
