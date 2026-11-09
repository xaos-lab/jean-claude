// The "Set Theme for This Folder" list: the installed themes, grouped like in
// VS Code's own theme picker. Moving through the list previews each theme in
// this window; Enter keeps it, Esc puts the previous theme back.
import * as vscode from "vscode";
import { ThemeKind, installedColorThemes, themeLabel } from "./themes";
import {
  FolderThemeSettings,
  FolderThemeWriter,
  folderSettingsFor,
  globalTheme,
  hasFolder,
  readFolderTheme,
  rememberSettingsFile,
  sameSettings,
} from "./folderSettings";

/** A theme to pick; `theme` undefined = the global theme. */
type Item = vscode.QuickPickItem & { theme: string | undefined };

const GROUP_NAMES: Record<ThemeKind, string> = {
  light: "light themes",
  dark: "dark themes",
  highContrast: "high contrast themes",
};

export async function pickFolderTheme(log: vscode.LogOutputChannel): Promise<void> {
  if (!hasFolder()) {
    vscode.window.showInformationMessage(
      "Jean Claude: open a folder first. Its theme is saved in the folder's .vscode/settings.json."
    );
    return;
  }

  const original = readFolderTheme();
  const removeCreatedFile = await rememberSettingsFile();
  const { items, current } = buildItems(original);
  const settingsFor = (item: Item): FolderThemeSettings =>
    item === current ? original : folderSettingsFor(item.theme, original);

  const writer = new FolderThemeWriter();
  let errorShown = false;
  const showError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`folderTheme: ${message}`);
    if (!errorShown) {
      errorShown = true;
      vscode.window.showErrorMessage(`Jean Claude: can't change the folder theme: ${message}`);
    }
  };

  const pick = vscode.window.createQuickPick<Item>();
  pick.title = `Theme for ${vscode.workspace.name ?? "this folder"} (only this window)`;
  pick.placeholder = "Use ↑↓ to preview, Enter to keep, Esc to cancel";
  pick.matchOnDescription = true;
  pick.items = items;
  pick.activeItems = [current];

  return new Promise<void>((resolve) => {
    let done = false;
    const finish = async (settings: FolderThemeSettings) => {
      try {
        await writer.write(settings);
        if (sameSettings(settings, original)) {
          await removeCreatedFile();
        }
      } catch (err) {
        showError(err);
      }
      resolve();
    };

    pick.onDidChangeActive(([item]) => {
      if (item && !done) {
        writer.write(settingsFor(item)).catch(showError);
      }
    });
    pick.onDidAccept(() => {
      const [item] = pick.activeItems;
      if (!item) {
        return;
      }
      done = true;
      pick.hide();
      finish(settingsFor(item));
    });
    pick.onDidHide(() => {
      pick.dispose();
      if (!done) {
        done = true;
        finish(original);
      }
    });
    pick.show();
  });
}

/** The list: "Global theme" first, then the installed themes by kind. */
function buildItems(original: FolderThemeSettings): { items: Item[]; current: Item } {
  const themes = installedColorThemes();
  const global = globalTheme();

  const globalItem: Item = {
    label: "$(globe) Global theme",
    description: global.followsOs
      ? "follows the OS light/dark mode, like the other windows"
      : `${themeLabel(global.theme, themes)}, like the other windows`,
    theme: undefined,
  };
  const items: Item[] = [globalItem];

  // A folder theme whose extension was uninstalled is not in the list: add it.
  if (original.theme !== undefined && !themes.some((theme) => theme.id === original.theme)) {
    items.push({ label: original.theme, description: "not installed", theme: original.theme });
  }

  for (const kind of groupOrder()) {
    const group = themes.filter((theme) => theme.kind === kind);
    if (group.length > 0) {
      items.push({ label: GROUP_NAMES[kind], kind: vscode.QuickPickItemKind.Separator, theme: undefined });
      items.push(...group.map((theme) => ({ label: theme.label, theme: theme.id })));
    }
  }

  const current =
    (original.theme !== undefined && items.find((item) => item.theme === original.theme)) || globalItem;
  current.description = current.description ? `${current.description} · current` : "current";
  return { items, current };
}

/** Themes of the current kind first, like VS Code's own theme picker. */
function groupOrder(): ThemeKind[] {
  switch (vscode.window.activeColorTheme.kind) {
    case vscode.ColorThemeKind.Dark:
      return ["dark", "light", "highContrast"];
    case vscode.ColorThemeKind.HighContrast:
    case vscode.ColorThemeKind.HighContrastLight:
      return ["highContrast", "light", "dark"];
    default:
      return ["light", "dark", "highContrast"];
  }
}
