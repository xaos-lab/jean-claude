// Makes the status dot on Claude Code session tabs blink (see tabIcons.ts).
import * as vscode from "vscode";
import * as path from "path";
import type { Feature } from "../../core/feature";
import { findClaudeCodeDirs, setBlinking } from "./tabIcons";

const CLAUDE_CODE_ID = "anthropic.claude-code";

export const blinkingTabs: Feature = {
  id: "blinkingTabs",
  title: "Blinking session tabs",
  description:
    "Makes the dot on Claude Code session tabs blink: blue = waiting for you, " +
    "orange = finished and not seen yet. Needs a window reload.",

  activate(ctx) {
    applyToAllVersions(true);
    // Claude Code installs each update into a new folder: patch it right away.
    ctx.subscriptions.push(vscode.extensions.onDidChange(() => applyToAllVersions(true)));
  },

  revert() {
    applyToAllVersions(false);
  },
};

/** Adds or removes the blink animation in every installed Claude Code version. */
function applyToAllVersions(enabled: boolean): void {
  const claudeCode = vscode.extensions.getExtension(CLAUDE_CODE_ID);
  if (!claudeCode) {
    return;
  }

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
