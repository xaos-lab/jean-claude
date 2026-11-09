// Sound, Windows notification and taskbar flash when a Claude Code session of
// this window asks for input or finishes.
import * as vscode from "vscode";
import * as path from "path";
import type { Feature, FeatureContext } from "../../core/feature";
import type { ClaudeEventType } from "../../core/eventMonitor";
import { hasOurHooks, installHooks } from "../../core/hooks";
import { playSound, showToast, flashWindow } from "./sound";

const SOUND_FILES: Record<string, string> = {
  icq: "icq.mp3",
  pop: "pop.mp3",
};

export const notificationSound: Feature = {
  id: "notificationSound",
  title: "Notifications",
  description:
    "Sound, Windows notification and taskbar flash when a Claude Code session " +
    "in this window asks for input or finishes.",

  activate(ctx) {
    // Claude Code reports nothing without our hooks in ~/.claude/settings.json.
    if (!hasOurHooks()) {
      try {
        installHooks();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `could not add hooks to ~/.claude/settings.json (${message}). Fix the file and reload the window.`
        );
      }
      vscode.window.showInformationMessage(
        "Jean Claude: added Claude Code hooks to ~/.claude/settings.json so notifications work."
      );
    }
    ctx.subscriptions.push(ctx.onClaudeEvent((type) => notify(ctx, type)));
  },
};

function notify(ctx: FeatureContext, type: ClaudeEventType): void {
  const config = ctx.settings();
  const wanted =
    type === "question"
      ? config.get<boolean>("onQuestion", true)
      : config.get<boolean>("onTaskComplete", true);
  if (!wanted) {
    return;
  }

  const sound = SOUND_FILES[config.get<string>("sound", "icq")] ?? SOUND_FILES.icq;
  playSound(path.join(ctx.extension.extensionPath, "sounds", sound));
  if (!vscode.window.state.focused) {
    if (config.get<boolean>("showNotification", true)) {
      showToast(type);
    }
    if (config.get<boolean>("flashTaskbar", true)) {
      flashWindow();
    }
  }
}

/** "Jean Claude: Setup Notifications": adds the hooks and turns the feature on. */
export async function setupNotifications(): Promise<void> {
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

  await vscode.workspace
    .getConfiguration("jeanClaude")
    .update("notificationSound.enabled", true, vscode.ConfigurationTarget.Global);

  vscode.window.showInformationMessage(
    changed
      ? "Notifications enabled! Claude hooks added to ~/.claude/settings.json."
      : "Notifications enabled! Claude hooks were already configured."
  );
}
