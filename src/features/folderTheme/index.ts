// Gives the folder open in this window its own color theme, so windows of
// different projects are easy to tell apart. Changing the theme the usual way
// changes it in every window; this one is saved in the folder's settings.
import * as vscode from "vscode";
import type { Feature } from "../../core/feature";
import { AUTO_DETECT, THEME, hasFolder, readFolderTheme, settingsLocation } from "./folderSettings";
import { pickFolderTheme } from "./picker";
import { themeLabel } from "./themes";

const PICK_COMMAND = "jeanClaude.folderTheme.pick";

export const folderTheme: Feature = {
  id: "folderTheme",
  title: "Folder theme",
  description:
    "Gives the folder in this window its own color theme, so project windows are easy to tell apart. " +
    "Click the palette icon in the status bar.",
  restartOn: ["folderTheme.showInStatusBar"],

  activate(ctx) {
    ctx.subscriptions.push(
      vscode.commands.registerCommand(PICK_COMMAND, () => pickFolderTheme(ctx.log))
    );
    if (ctx.settings().get<boolean>("showInStatusBar", true)) {
      ctx.subscriptions.push(new FolderThemeStatusItem());
    }
  },
};

/** Status bar item with the folder's theme; click it to change the theme. */
class FolderThemeStatusItem implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(
    "jeanClaude.folderTheme",
    vscode.StatusBarAlignment.Right,
    51 // just left of the Jean Claude item
  );
  private readonly disposables: vscode.Disposable[];

  constructor() {
    this.item.name = "Jean Claude: Folder theme";
    this.item.command = PICK_COMMAND;
    this.disposables = [
      this.item,
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(THEME) || e.affectsConfiguration(AUTO_DETECT)) {
          this.update();
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.update()),
      vscode.extensions.onDidChange(() => this.update()),
    ];
    this.update();
  }

  private update(): void {
    if (!hasFolder()) {
      this.item.hide();
      return;
    }
    const { theme } = readFolderTheme();
    if (theme === undefined) {
      this.item.text = "$(symbol-color)";
      this.item.tooltip =
        "This folder uses the global theme.\nClick to give it its own theme (only this window changes).";
    } else {
      const label = themeLabel(theme);
      this.item.text = `$(symbol-color) ${label}`;
      this.item.tooltip =
        `This folder's theme: ${label} (saved in ${settingsLocation()}).\n` +
        "Click to change it or go back to the global theme.";
    }
    this.item.show();
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
