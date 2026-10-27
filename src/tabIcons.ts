// Makes the status dot on Claude Code session tabs blink.
//
// The Claude Code extension already marks the exact session tab that needs you:
// it swaps the tab icon to claude-logo-pending.svg (blue dot = waiting for your
// answer/permission) or claude-logo-done.svg (orange dot = finished, unread).
// VS Code's API can't change another extension's tab, so we add a small CSS
// animation to those two SVG files instead. Claude Code installs every update
// into a new folder, so this has to be re-applied after each update.
//
// No "vscode" import: this module is also used by the uninstall script.
import * as fs from "fs";
import * as path from "path";

const ICON_FILES = ["claude-logo-pending.svg", "claude-logo-done.svg"];
const STYLE_ID = "jean-claude-blink";
const STYLE =
  `<style id="${STYLE_ID}">` +
  "@keyframes jcBlink{0%,100%{opacity:1}50%{opacity:.1}}" +
  // Only the badge dot is a direct child of <svg>; the mask circle is not.
  "svg>circle{animation:jcBlink 1s ease-in-out infinite}" +
  "</style>";
const STYLE_PATTERN = new RegExp(`<style id="${STYLE_ID}">[\\s\\S]*?</style>`, "g");

/** All installed Claude Code extension folders (old and new versions). */
export function findClaudeCodeDirs(extensionsRoot: string): string[] {
  try {
    return fs
      .readdirSync(extensionsRoot)
      .filter((name) => /^anthropic\.claude-code-\d/.test(name))
      .map((name) => path.join(extensionsRoot, name));
  } catch {
    return [];
  }
}

/**
 * Adds (enabled) or removes (disabled) the blink animation in one Claude Code
 * folder. Returns true if any file changed.
 */
export function setBlinking(claudeCodeDir: string, enabled: boolean): boolean {
  let changed = false;
  for (const file of ICON_FILES) {
    const iconPath = path.join(claudeCodeDir, "resources", file);
    try {
      const original = fs.readFileSync(iconPath, "utf8");
      const clean = original.replace(STYLE_PATTERN, "");
      const next = enabled ? clean.replace(/<svg\b[^>]*>/, (tag) => tag + STYLE) : clean;
      if (next !== original) {
        fs.writeFileSync(iconPath, next, "utf8");
        changed = true;
      }
    } catch {
      // Icon missing or read-only (e.g. a future Claude Code layout): skip it.
    }
  }
  return changed;
}
