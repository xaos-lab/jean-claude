# Jean Claude - VS Code Extension

Makes it obvious which Claude Code session needs you: the session's tab blinks, and a sound, a Windows notification and a taskbar flash point you to the right VS Code window. Optionally shows your Claude.ai usage limits in the status bar. As a bonus, it colors the columns of CSV files.

![Status bar example](https://img.shields.io/badge/☁_Claude:_5h_12%25_|_7d_35%25-blue?style=flat-square)

## Features

Every feature can be turned on or off on its own. Click **Jean Claude** in the status bar (bottom right), check the features you want and press `Enter`. The change applies right away, no reload needed (except for blinking tabs, see below). The same switches are in Settings as `jeanClaude.<feature>.enabled`.

| Feature | Default |
|---------|---------|
| Blinking session tabs | on |
| Notifications | off |
| Usage monitor | off |
| Rainbow CSV | on |

### Usage Monitor
- **Disabled by default** — turn it on in the Jean Claude menu or in settings
- Shown as its own item next to **Jean Claude** in the status bar; click it to refresh
- **5h** - current 5-hour session usage (%)
- **7d** - weekly usage across all models (%)
- Color coding: green (<50%), yellow (50-80%), red (>80%)
- Tooltip with detailed breakdown (Sonnet, Opus, reset times)
- Automatic OAuth token refresh when expired (via Claude Code CLI)

> **⚠️ Billing notice (April 2026):** The usage monitor calls the Anthropic API using your OAuth token or session cookie. Under the [new billing policy](https://claude.ai), third-party API access is no longer covered by your Claude subscription and may incur extra usage charges. Enable at your own discretion.

### Blinking session tabs
- The Claude Code extension already puts a dot on the icon of the exact session tab that needs you: **blue** = waiting for your answer or permission, **orange** = finished and not seen yet
- Jean Claude makes that dot **blink**, so you can spot the right session among many tabs
- It works by adding a small CSS animation to two icon files of the Claude Code extension (`claude-logo-pending.svg`, `claude-logo-done.svg`). Claude Code installs every update into a new folder, so Jean Claude re-applies it automatically after each update
- Reload the window once after installing to see it
- When you turn it off, the original icons are restored (also when you uninstall Jean Claude); reload the window to see the change

### Notification Sounds
- Plays a sound when Claude Code **asks a question** (tool approval, user input)
- Plays a sound when Claude Code **finishes a task**
- When VS Code is not focused: shows a Windows notification and flashes **this** VS Code window in the taskbar
- Works with both the **Claude Code extension** panel and the **Claude Code CLI** in VS Code's integrated terminal (via hooks)
- Each VS Code window reacts **only to its own sessions**. Sessions in the Claude desktop app, in a separate terminal (cmd, PowerShell, Windows Terminal) or in another VS Code window are ignored

### Rainbow CSV
- Colors each column of an open CSV or TSV file (`.csv`, `.tsv`, `.tab`) in its own color, so you can follow a column by eye
- 8 colors that repeat for wider tables, with separate shades for light and dark themes
- The delimiter is detected automatically: `,` `;` tab or `|` (`.tsv` and `.tab` always use tab)
- Quoted fields are respected (`"Prague, CZ"` is one field), including fields that span several lines
- Only the visible part of the file is colored, so large files stay fast; colors update as you type

## Installation

Pick one of the following options:

| # | Option | When to use |
|---|--------|-------------|
| **A** | [Download .vsix from Releases](#a-download-vsix-from-releases) | Easiest — just download and install |
| **B** | [Build .vsix from source](#b-build-vsix-from-source) | You want the latest code or no release is available |
| **C** | [Symlink from source](#c-symlink-from-source) | For development — edit, recompile, reload without re-packaging |

---

### A) Download .vsix from Releases

1. Download the `.vsix` file from [Releases](https://github.com/xaos-lab/jean-claude/releases)
2. In VS Code: `Ctrl+Shift+X` (Extensions) → `...` → **"Install from VSIX..."** → select the file
3. Reload VS Code (`Ctrl+Shift+P` → "Reload Window")

---

### B) Build .vsix from source

```bash
git clone https://github.com/xaos-lab/jean-claude.git
cd jean-claude
npm install
npm run compile
npx @vscode/vsce package
```

This creates a `.vsix` file in the project folder. Then install it the same way as in **A)**.

---

### C) Symlink from source

1. Clone and compile:
   ```bash
   git clone https://github.com/xaos-lab/jean-claude.git
   cd jean-claude
   npm install
   npm run compile
   ```
2. Create a symlink from VS Code extensions directory to the project folder:
   - **Windows** (run as Administrator):
     ```cmd
     mklink /D "%USERPROFILE%\.vscode\extensions\tomasjanu.jean-claude" "C:\path\to\jean-claude"
     ```
   - **macOS / Linux**:
     ```bash
     ln -s /path/to/jean-claude ~/.vscode/extensions/tomasjanu.jean-claude
     ```
3. Restart VS Code

After making changes, run `npm run compile` and reload VS Code.

## Setup

### 1. Authentication (usage monitor)

**If you have Claude Code installed** — nothing to do. The extension automatically reads the OAuth token from `~/.claude/.credentials.json` and refreshes it when expired.

**If automatic detection doesn't work** — set the session cookie manually:

1. Open https://claude.ai and log in
2. DevTools (`F12`) → **Application** → **Cookies** → `https://claude.ai`
3. Copy the `sessionKey` value (starts with `sk-ant-sid01-...`)
4. Either:
   - `Ctrl+Shift+P` → **"Jean Claude: Set Session Key"** → paste
   - Or add to `settings.json`: `"jeanClaude.sessionKey": "sk-ant-sid01-..."`

> **Note:** The session cookie expires periodically. OAuth (automatic) is preferred.

### 2. Notification sounds (optional)

Plays a sound when Claude Code asks a question or finishes a task.

**Quickest way:** click **Jean Claude** in the status bar and check **Notifications** (or `Ctrl+Shift+P` → **"Jean Claude: Setup Notifications"**). Turning the feature on adds the required hooks to `~/.claude/settings.json` automatically. Hooks written by older versions of Jean Claude are upgraded automatically when the extension starts (a backup is saved as `~/.claude/settings.json.jean-claude.bak`).

**Manual setup** — if you prefer to do it yourself:

**A) Enable in VS Code settings:**
- `Ctrl+,` → search `jeanClaude.notificationSound.enabled` → check the box
- Or add to your `settings.json`: `"jeanClaude.notificationSound.enabled": true`

**B) Add Claude Code hooks** to `~/.claude/settings.json` (replace `C:/Users/you` with your home folder):

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "permission_prompt|idle_prompt|elicitation_dialog",
        "hooks": [
          {
            "type": "command",
            "command": "[ -d \"C:/Users/you/.claude/jean-claude-events\" ] && printf 'event=question\\nentrypoint=%s\\nwindow=%s\\ncwd=%s\\n' \"$CLAUDE_CODE_ENTRYPOINT\" \"$JEAN_CLAUDE_WINDOW\" \"$CLAUDE_PROJECT_DIR\" > \"C:/Users/you/.claude/jean-claude-events/$$-$RANDOM.evt\" || true # jean-claude"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "[ -d \"C:/Users/you/.claude/jean-claude-events\" ] && printf 'event=done\\nentrypoint=%s\\nwindow=%s\\ncwd=%s\\n' \"$CLAUDE_CODE_ENTRYPOINT\" \"$JEAN_CLAUDE_WINDOW\" \"$CLAUDE_PROJECT_DIR\" > \"C:/Users/you/.claude/jean-claude-events/$$-$RANDOM.evt\" || true # jean-claude"
          }
        ]
      }
    ]
  }
}
```

How it works:

- Each hook call writes one small file into `~/.claude/jean-claude-events/` saying which app the session runs in (`CLAUDE_CODE_ENTRYPOINT`) and which VS Code window started it (`JEAN_CLAUDE_WINDOW`).
- Jean Claude sets `JEAN_CLAUDE_WINDOW` for the Claude Code panels and integrated terminals of its own window. Sessions without it (desktop app, external terminals) are ignored.
- Every window reads the files, reacts only to its own sessions, and deletes files older than a minute.
- If the folder does not exist (Jean Claude not installed), the hooks do nothing.
- The hooks are bash commands. On Windows, Claude Code runs hooks in Git Bash by default.

## Extension Settings

Open Settings (`Ctrl+,`) and search for "Jean Claude":

| Setting | Default | Description |
|---------|---------|-------------|
| `jeanClaude.usageMonitor.enabled` | `false` | Enable usage monitor (⚠️ calls Anthropic API, may incur extra charges) |
| `jeanClaude.authMethod` | `auto` | `auto` = OAuth + fallback to cookie, `cookie` = cookie only |
| `jeanClaude.sessionKey` | (empty) | Session cookie from browser |
| `jeanClaude.refreshInterval` | `5` | Data refresh interval in minutes (1-60) |
| `jeanClaude.blinkingTabs.enabled` | `true` | Make the blue/orange dot on Claude Code session tabs blink |
| `jeanClaude.notificationSound.enabled` | `false` | Enable notification sounds (only for sessions of this window) |
| `jeanClaude.notificationSound.sound` | `icq` | Which sound to play (`icq` or `pop`) |
| `jeanClaude.notificationSound.showNotification` | `true` | Show a Windows notification when VS Code is not focused |
| `jeanClaude.notificationSound.flashTaskbar` | `true` | Flash this VS Code window in the taskbar when VS Code is not focused (Windows) |
| `jeanClaude.notificationSound.onQuestion` | `true` | Sound when Claude asks for input |
| `jeanClaude.notificationSound.onTaskComplete` | `true` | Sound when Claude finishes a task |
| `jeanClaude.rainbowCsv.enabled` | `true` | Color each column of CSV/TSV files in its own color |

## Commands

Open Command Palette (`Ctrl+Shift+P`):

- **Jean Claude: Turn Features On/Off** - the same checkbox menu as clicking **Jean Claude** in the status bar
- **Jean Claude: Refresh** - manually refresh usage data (only while the usage monitor is on)
- **Jean Claude: Set Session Key** - set session cookie (only while the usage monitor is on)
- **Jean Claude: Setup Notifications** - enable notification sounds and add hooks to `~/.claude/settings.json`

## Development

### Project Structure

```
jean-claude/
├── src/
│   ├── extension.ts              # Entry point: shared services + feature manager
│   ├── core/
│   │   ├── feature.ts            # Feature + FeatureContext interfaces (start here)
│   │   ├── featureManager.ts     # Turns features on/off, status bar item, checkbox menu
│   │   ├── eventMonitor.ts       # Reads hook event files, keeps only this window's sessions
│   │   └── hooks.ts              # Adds/upgrades/removes hooks in ~/.claude/settings.json
│   ├── features/
│   │   ├── index.ts              # List of all features (register new ones here)
│   │   ├── blinkingTabs/         # Blink animation in Claude Code's tab icons
│   │   ├── notificationSound/    # Sound, Windows notification, taskbar flash
│   │   ├── usageMonitor/         # API client + usage status bar item
│   │   └── rainbowCsv/           # CSV parser + column colors (editor decorations)
│   └── uninstall.ts              # Cleanup when the extension is uninstalled
├── out/                          # Compiled JavaScript (generated)
├── package.json                  # Extension manifest
└── tsconfig.json                 # TypeScript configuration
```

### Adding a feature

A feature is one folder in `src/features/`. The feature manager starts it when it is turned on and stops it when it is turned off, so the feature only has to say what to do while it is on.

1. **Create `src/features/<id>/index.ts`.** The `id` is also the settings prefix (`jeanClaude.<id>.*`).

   ```ts
   import * as vscode from "vscode";
   import type { Feature } from "../../core/feature";

   export const myFeature: Feature = {
     id: "myFeature",
     title: "My feature",                          // shown in the Jean Claude menu
     description: "One sentence about what it does.",

     activate(ctx) {
       // Everything in ctx.subscriptions is disposed when the feature is turned off.
       ctx.subscriptions.push(
         ctx.onClaudeEvent((type) => {             // "question" or "done", this window only
           if (ctx.settings().get<boolean>("loud", false)) {
             vscode.window.showInformationMessage(`Claude: ${type}`);
           }
         }),
         vscode.commands.registerCommand("jeanClaude.myFeature.hello", () => {
           vscode.window.showInformationMessage("Hello from my feature");
         })
       );
     },

     // Optional: undo changes made outside VS Code (files etc.) when the feature is off.
     // revert() { ... },
   };
   ```

2. **Register it** in [src/features/index.ts](src/features/index.ts) — the order of `FEATURES` is the order in the menu.

3. **Declare the on/off switch** (and any other settings) in `package.json` under `contributes.configuration.properties`:

   ```json
   "jeanClaude.myFeature.enabled": {
     "type": "boolean",
     "default": false,
     "description": "Turn My feature on or off"
   }
   ```

4. **Commands** (optional): add them to `contributes.commands`, and hide them while the feature is off:

   ```json
   "menus": {
     "commandPalette": [
       { "command": "jeanClaude.myFeature.hello", "when": "config.jeanClaude.myFeature.enabled" }
     ]
   }
   ```

What a feature gets in `ctx` (see [src/core/feature.ts](src/core/feature.ts)):

| Field | What it is |
|-------|-----------|
| `subscriptions` | Put timers, listeners, commands and status bar items here; disposed when the feature is turned off |
| `settings()` | The feature's settings, `jeanClaude.<id>.*` |
| `onClaudeEvent` | Fires when a Claude Code session of this window asks for input (`question`) or finishes (`done`). Needs the Jean Claude hooks; see how `notificationSound` installs them |
| `log` | The **Jean Claude** output channel (`View → Output`); errors of features are logged here too |
| `extension` | The VS Code `ExtensionContext` (extension path, storage, secrets) |

Other options on `Feature`: `restartOn` restarts the feature when one of the listed settings changes, and `revert()` runs whenever the feature is off (at startup and when turned off, not when VS Code just closes). If `activate` throws, the feature is stopped, the error is shown and the status bar shows a warning; the other features keep working.

### Useful Commands

```bash
npm run compile          # Compile TypeScript
npm run watch            # Compile with file watching
npx @vscode/vsce package # Package as .vsix
```

## Uninstall

Via VS Code: `Ctrl+Shift+X` → find "Jean Claude" → **Uninstall**.

After VS Code restarts, an uninstall script removes the Jean Claude hooks from `~/.claude/settings.json`, deletes `~/.claude/jean-claude-events/` and restores the original Claude Code tab icons.
