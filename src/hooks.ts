// Manages the Claude Code hooks that Jean Claude adds to ~/.claude/settings.json.
// No "vscode" import: this module is also used by the uninstall script.
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export const CLAUDE_DIR = path.join(os.homedir(), ".claude");
export const SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.json");
export const EVENTS_DIR = path.join(CLAUDE_DIR, "jean-claude-events");

/** Env var that tells a Claude Code session which VS Code window started it. */
export const WINDOW_ENV = "JEAN_CLAUDE_WINDOW";

const SENTINEL = "# jean-claude";
const NOTIFICATION_MATCHER = "permission_prompt|idle_prompt|elicitation_dialog";

// Hooks written by older versions: `echo ... > ~/.claude/claude-notify` etc.
const LEGACY_COMMAND = /^echo\s.+>\s*"?[^"]*\.claude[\\/]claude-(notify|stop)"?\s*$/;

type HookEntry = { type?: string; command?: string; [key: string]: unknown };
type HookGroup = { matcher?: string; hooks?: HookEntry[]; [key: string]: unknown };
type HooksSection = Record<string, HookGroup[]>;
type Settings = { hooks?: HooksSection; [key: string]: unknown };

/**
 * Bash command that drops one small event file per hook call. Each file says
 * which app (entrypoint) and which VS Code window the session belongs to, so
 * every window can react only to its own sessions.
 */
function hookCommand(event: "question" | "done"): string {
  // Absolute path with forward slashes: works in Git Bash and on macOS/Linux.
  const dir = EVENTS_DIR.replace(/\\/g, "/");
  return (
    `[ -d "${dir}" ] && printf 'event=${event}\\nentrypoint=%s\\nwindow=%s\\ncwd=%s\\n' ` +
    `"$CLAUDE_CODE_ENTRYPOINT" "$${WINDOW_ENV}" "$CLAUDE_PROJECT_DIR" ` +
    `> "${dir}/$$-$RANDOM.evt" || true ${SENTINEL}`
  );
}

function isOurCommand(command: unknown): boolean {
  if (typeof command !== "string") {
    return false;
  }
  return command.includes(SENTINEL) || LEGACY_COMMAND.test(command.trim());
}

function readSettings(): Settings {
  if (!fs.existsSync(SETTINGS_PATH)) {
    return {};
  }
  const raw = fs.readFileSync(SETTINGS_PATH, "utf8").trim();
  if (!raw) {
    return {};
  }
  // Let parse errors propagate: never overwrite a settings file we can't read.
  return JSON.parse(raw) as Settings;
}

function writeSettings(settings: Settings): void {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  if (fs.existsSync(SETTINGS_PATH)) {
    fs.copyFileSync(SETTINGS_PATH, SETTINGS_PATH + ".jean-claude.bak");
  }
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf8");
}

/** Returns a copy of the hooks section without any Jean Claude hooks. */
function withoutOurHooks(hooks: HooksSection): HooksSection {
  const result: HooksSection = {};
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) {
      result[event] = groups;
      continue;
    }
    const kept: HookGroup[] = [];
    for (const group of groups) {
      if (!Array.isArray(group?.hooks)) {
        kept.push(group);
        continue;
      }
      const entries = group.hooks.filter((h) => !isOurCommand(h?.command));
      if (entries.length > 0) {
        kept.push({ ...group, hooks: entries });
      }
    }
    if (kept.length > 0) {
      result[event] = kept;
    }
  }
  return result;
}

export function hasOurHooks(): boolean {
  try {
    const hooks = readSettings().hooks ?? {};
    return Object.values(hooks).some(
      (groups) =>
        Array.isArray(groups) &&
        groups.some((g) => Array.isArray(g?.hooks) && g.hooks.some((h) => isOurCommand(h?.command)))
    );
  } catch {
    return false;
  }
}

/** Adds the current hooks (replacing older Jean Claude hooks). Returns true if the file changed. */
export function installHooks(): boolean {
  const settings = readSettings();
  const before = JSON.stringify(settings.hooks ?? {});

  const hooks = withoutOurHooks(settings.hooks ?? {});
  (hooks.Notification ??= []).push({
    matcher: NOTIFICATION_MATCHER,
    hooks: [{ type: "command", command: hookCommand("question") }],
  });
  (hooks.Stop ??= []).push({
    hooks: [{ type: "command", command: hookCommand("done") }],
  });

  if (JSON.stringify(hooks) === before) {
    return false;
  }
  settings.hooks = hooks;
  writeSettings(settings);
  return true;
}

/** Removes all Jean Claude hooks. Returns true if the file changed. */
export function removeHooks(): boolean {
  const settings = readSettings();
  if (!settings.hooks) {
    return false;
  }
  const hooks = withoutOurHooks(settings.hooks);
  if (JSON.stringify(hooks) === JSON.stringify(settings.hooks)) {
    return false;
  }
  if (Object.keys(hooks).length > 0) {
    settings.hooks = hooks;
  } else {
    delete settings.hooks;
  }
  writeSettings(settings);
  return true;
}
