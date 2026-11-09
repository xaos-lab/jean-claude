// Lists the color themes installed in VS Code. VS Code has no API for this, so
// the themes are read from what each extension contributes in its package.json.
import * as vscode from "vscode";
import * as path from "path";

export type ThemeKind = "light" | "dark" | "highContrast";

export interface ColorTheme {
  /** The value of `workbench.colorTheme` that selects this theme. */
  readonly id: string;
  /** The name people see. */
  readonly label: string;
  readonly kind: ThemeKind;
}

interface ThemeContribution {
  id?: unknown;
  label?: unknown;
  uiTheme?: unknown;
  path?: unknown;
}

/** All installed color themes, sorted by name. */
export function installedColorThemes(): ColorTheme[] {
  const themes = new Map<string, ColorTheme>();
  for (const extension of vscode.extensions.all) {
    const contributed: unknown = extension.packageJSON?.contributes?.themes;
    if (!Array.isArray(contributed)) {
      continue;
    }
    for (const theme of contributed as ThemeContribution[]) {
      const label = text(theme.label);
      const file = text(theme.path);
      // The same rule VS Code uses for the value of `workbench.colorTheme`.
      const id = text(theme.id) ?? label ?? (file && path.basename(file));
      if (!id || themes.has(id)) {
        continue;
      }
      themes.set(id, {
        id,
        // Built-in themes may come with an untranslated "%key%" label.
        label: label && !/^%.*%$/.test(label) ? label : id,
        kind: kindOf(theme.uiTheme),
      });
    }
  }
  return [...themes.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** The name of the theme with this `workbench.colorTheme` value. */
export function themeLabel(id: string, themes: readonly ColorTheme[] = installedColorThemes()): string {
  return themes.find((theme) => theme.id === id)?.label ?? id;
}

function kindOf(uiTheme: unknown): ThemeKind {
  switch (uiTheme) {
    case "vs":
      return "light";
    case "hc-black":
    case "hc-light":
      return "highContrast";
    default:
      return "dark";
  }
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
