// Reads and writes the theme of the folder open in this window: the
// `workbench.colorTheme` setting in the workspace settings (.vscode/settings.json,
// or the .code-workspace file of a multi-root workspace). Other windows keep
// their theme, because they don't read this file.
import * as vscode from "vscode";

export const THEME = "workbench.colorTheme";
/** When on, VS Code picks the theme by the OS light/dark mode and ignores THEME. */
export const AUTO_DETECT = "window.autoDetectColorScheme";
const WORKSPACE = vscode.ConfigurationTarget.Workspace;

/** The theme settings in the folder's settings file (undefined = not set there). */
export interface FolderThemeSettings {
  readonly theme: string | undefined;
  readonly autoDetect: boolean | undefined;
}

/** True when the window has a folder (or workspace) that can have its own settings. */
export function hasFolder(): boolean {
  return (
    vscode.workspace.workspaceFile !== undefined ||
    (vscode.workspace.workspaceFolders?.length ?? 0) > 0
  );
}

/** Where the folder theme is saved, for messages. */
export function settingsLocation(): string {
  return vscode.workspace.workspaceFile ? "the .code-workspace file" : ".vscode/settings.json";
}

export function readFolderTheme(): FolderThemeSettings {
  const config = vscode.workspace.getConfiguration();
  return {
    theme: config.inspect<string>(THEME)?.workspaceValue,
    autoDetect: config.inspect<boolean>(AUTO_DETECT)?.workspaceValue,
  };
}

/** The theme of windows that have no theme of their own. */
export function globalTheme(): { theme: string; followsOs: boolean } {
  const config = vscode.workspace.getConfiguration();
  const theme = config.inspect<string>(THEME);
  const autoDetect = config.inspect<boolean>(AUTO_DETECT);
  return {
    theme: theme?.globalValue ?? theme?.defaultValue ?? "",
    followsOs: autoDetect?.globalValue ?? autoDetect?.defaultValue ?? false,
  };
}

/**
 * The folder settings that give the folder `theme`, or make it use the global
 * theme again (`theme` undefined), starting from the folder settings `from`.
 */
export function folderSettingsFor(
  theme: string | undefined,
  from: FolderThemeSettings
): FolderThemeSettings {
  const { followsOs } = globalTheme();
  if (theme === undefined) {
    // Drop the auto-detect switch-off that was only there for the folder theme.
    return {
      theme: undefined,
      autoDetect: from.autoDetect === false && followsOs ? undefined : from.autoDetect,
    };
  }
  // While auto-detect is on, VS Code would ignore the folder theme.
  return { theme, autoDetect: (from.autoDetect ?? followsOs) ? false : from.autoDetect };
}

export function sameSettings(a: FolderThemeSettings, b: FolderThemeSettings): boolean {
  return a.theme === b.theme && a.autoDetect === b.autoDetect;
}

/**
 * Writes folder settings one at a time. A request made while a write is running
 * replaces any request still waiting, so fast previews only write the latest one.
 */
export class FolderThemeWriter {
  private next: FolderThemeSettings | undefined;
  private running: Promise<void> | undefined;

  /** Resolves once `settings` (or a newer request) is written; rejects if that write failed. */
  write(settings: FolderThemeSettings): Promise<void> {
    this.next = settings;
    this.running ??= this.drain();
    return this.running;
  }

  private async drain(): Promise<void> {
    try {
      let failure: { error: unknown } | undefined;
      while (this.next) {
        const settings = this.next;
        this.next = undefined;
        try {
          await writeFolderTheme(settings);
          failure = undefined;
        } catch (error) {
          failure = { error };
        }
      }
      if (failure) {
        throw failure.error;
      }
    } finally {
      this.running = undefined;
    }
  }
}

async function writeFolderTheme(settings: FolderThemeSettings): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const now = readFolderTheme();
  const writeTheme = () =>
    now.theme === settings.theme ? undefined : config.update(THEME, settings.theme, WORKSPACE);
  const writeAutoDetect = () =>
    now.autoDetect === settings.autoDetect
      ? undefined
      : config.update(AUTO_DETECT, settings.autoDetect, WORKSPACE);
  // In this order the window goes straight to the new theme, without showing another one first.
  if (settings.theme !== undefined) {
    await writeTheme();
    await writeAutoDetect();
  } else {
    await writeAutoDetect();
    await writeTheme();
  }
}

/**
 * Notes whether .vscode/settings.json exists now. The returned function deletes
 * it again (and an empty .vscode folder) if it was created since and is empty,
 * so a cancelled preview leaves nothing behind.
 */
export async function rememberSettingsFile(): Promise<() => Promise<void>> {
  const folders = vscode.workspace.workspaceFolders;
  if (vscode.workspace.workspaceFile || folders?.length !== 1) {
    return async () => undefined;
  }
  const dir = vscode.Uri.joinPath(folders[0].uri, ".vscode");
  const file = vscode.Uri.joinPath(dir, "settings.json");
  const hadDir = await exists(dir);
  const hadFile = hadDir && (await exists(file));

  return async () => {
    if (hadFile) {
      return;
    }
    try {
      const content = Buffer.from(await vscode.workspace.fs.readFile(file)).toString("utf8");
      if (content.replace(/\s/g, "") !== "{}") {
        return;
      }
      await vscode.workspace.fs.delete(file);
      if (!hadDir && (await vscode.workspace.fs.readDirectory(dir)).length === 0) {
        await vscode.workspace.fs.delete(dir);
      }
    } catch {
      // Not there (nothing was written) or not readable: leave it alone.
    }
  };
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}
