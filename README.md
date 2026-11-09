# Jean Claude - VS Code Extension

Jean Claude is XAOS Lab's own VS Code extension: one place for all the small tools we miss in VS Code. Instead of looking for (or writing) a separate extension every time, we add what we need to Jean Claude as a new feature, so the extension keeps growing over time.

- **Features are independent.** Turn on only the ones you want; a feature that is off does nothing.
- **Not only for Claude Code.** Many features help with work in Claude Code (hence the name), but a feature can be anything that makes daily work in VS Code easier.
- **New features are easy to add.** Each one lives in its own folder and plugs into a shared core; see [Adding a feature](#adding-a-feature).

## Features

What Jean Claude can do today (more will come as XAOS Lab needs them):

| Feature | Default | What it does |
|---------|---------|--------------|
| [Blinking session tabs](#blinking-session-tabs) | on | The dot on a Claude Code session tab blinks while that session needs you |
| [Notifications](#notifications) | off | Sound, notification and taskbar flash when a Claude Code session in this window needs you or finishes |
| [Rainbow CSV](#rainbow-csv) | on | Each column of a CSV/TSV file gets its own color |

### Turning features on and off

Click **Jean Claude** in the status bar (bottom right), check the features you want and press `Enter`. That is all the setup there is: each feature starts or stops right away and prepares whatever it needs by itself. Only blinking tabs needs a window reload, and Jean Claude offers a button for it.

- Hover over **Jean Claude** in the status bar to see which features are on
- A ⚠️ in the status bar means a feature failed to start; the error is in `View → Output → Jean Claude`
- The ⚙️ button in the menu opens all Jean Claude settings
- The same on/off switches are in Settings as `jeanClaude.<feature>.enabled`

### Blinking session tabs

- The Claude Code extension already puts a dot on the icon of the exact session tab that needs you: **blue** = waiting for your answer or permission, **orange** = finished and not seen yet
- Jean Claude makes that dot **blink**, so you can spot the right session among many tabs
- After you turn it on or off, Jean Claude asks you to reload the window (VS Code caches tab icons)
- How it works: Jean Claude adds a small CSS animation to two icon files of the Claude Code extension (`claude-logo-pending.svg`, `claude-logo-done.svg`). Claude Code installs every update into a new folder, so Jean Claude re-applies it after each update
- Turning it off, or uninstalling Jean Claude, restores the original icons

### Notifications

When a Claude Code session in this window:

- **needs you**: asks for permission (tool approval), asks you a question, or has been waiting for your reply for a while
- **finishes**: is done with its reply

Jean Claude plays a sound, and if VS Code is not focused, it also shows a Windows notification and flashes **this** VS Code window's taskbar button. On macOS and Linux you get the sound and a VS Code message; the taskbar does not flash.

Each VS Code window reacts **only to its own sessions**: the Claude Code panel and the `claude` CLI in its integrated terminal. Sessions in the Claude desktop app, in a separate terminal (cmd, PowerShell, Windows Terminal) or in another VS Code window are ignored.

**Setup:** just turn it on in the Jean Claude menu. Jean Claude adds two hooks to `~/.claude/settings.json` by itself (keeping a backup as `~/.claude/settings.json.jean-claude.bak`) and tells you when it did. There is nothing to copy or edit by hand. In [Settings](#settings) you can pick the sound, choose which events alert you, and turn off the notification or the taskbar flash.

<details>
<summary>How it works (what Jean Claude adds to <code>~/.claude/settings.json</code>)</summary>

Claude Code runs hooks when a session needs you (`Notification`) and when it finishes (`Stop`). Jean Claude adds one hook to each (shown here with `C:/Users/you` as the home folder):

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

- Each hook call writes one small file into `~/.claude/jean-claude-events/` saying which app the session runs in (`CLAUDE_CODE_ENTRYPOINT`) and which VS Code window started it (`JEAN_CLAUDE_WINDOW`)
- Jean Claude sets `JEAN_CLAUDE_WINDOW` for the Claude Code panel and the integrated terminal of its own window; sessions without it (desktop app, external terminals) are ignored
- Every VS Code window reads the files, reacts only to its own sessions, and deletes files older than a minute
- If the folder does not exist (Jean Claude not installed), the hooks do nothing
- The hooks are bash commands; on Windows, Claude Code runs them in Git Bash
- Your other hooks are kept. Hooks written by older versions of Jean Claude are upgraded when the extension starts
- Turning notifications off leaves the hooks in place (they are harmless); uninstalling Jean Claude removes them
- If the hooks get lost (e.g. you rewrote `settings.json`), run **Jean Claude: Setup Notifications** to add them again

</details>

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
| **B** | [Build .vsix from source](#b-build-vsix-from-source) | You want the latest code (a release can be older than the code here) |
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
2. Link the project folder into the VS Code extensions folder:
   - **Windows** (a directory junction, no admin rights needed):
     ```cmd
     mklink /J "%USERPROFILE%\.vscode\extensions\tomasjanu.jean-claude" "C:\path\to\jean-claude"
     ```
   - **macOS / Linux**:
     ```bash
     ln -s /path/to/jean-claude ~/.vscode/extensions/tomasjanu.jean-claude
     ```
3. Restart VS Code

After making changes, run `npm run compile` and reload VS Code.

## Settings

Open Settings (`Ctrl+,`) and search for "Jean Claude", or click ⚙️ in the Jean Claude menu:

| Setting | Default | Description |
|---------|---------|-------------|
| `jeanClaude.blinkingTabs.enabled` | `true` | Blink the blue/orange dot on Claude Code session tabs |
| `jeanClaude.notificationSound.enabled` | `false` | Turn notifications on (adds the hooks automatically) |
| `jeanClaude.notificationSound.sound` | `icq` | Sound to play: `icq` or `pop` |
| `jeanClaude.notificationSound.onQuestion` | `true` | Alert when a session needs you |
| `jeanClaude.notificationSound.onTaskComplete` | `true` | Alert when a session finishes |
| `jeanClaude.notificationSound.showNotification` | `true` | Also show a notification when VS Code is not focused |
| `jeanClaude.notificationSound.flashTaskbar` | `true` | Also flash this window's taskbar button when VS Code is not focused (Windows) |
| `jeanClaude.rainbowCsv.enabled` | `true` | Color each column of CSV/TSV files in its own color |

## Commands

Open Command Palette (`Ctrl+Shift+P`):

- **Jean Claude: Turn Features On/Off** - the same checkbox menu as clicking **Jean Claude** in the status bar
- **Jean Claude: Setup Notifications** - turns notifications on and adds the hooks again if they are missing or outdated

## Uninstall

Via VS Code: `Ctrl+Shift+X` → find "Jean Claude" → **Uninstall**.

After VS Code restarts, an uninstall script removes the Jean Claude hooks from `~/.claude/settings.json`, deletes `~/.claude/jean-claude-events/` and restores the original Claude Code tab icons.

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
│   │   ├── notificationSound/    # Sound, notification, taskbar flash
│   │   └── rainbowCsv/           # CSV parser + column colors (editor decorations)
│   └── uninstall.ts              # Cleanup when the extension is uninstalled
├── sounds/                       # Notification sounds (icq.mp3, pop.mp3)
├── out/                          # Compiled JavaScript (generated)
├── package.json                  # Extension manifest
└── tsconfig.json                 # TypeScript configuration
```

### Adding a feature

This is how Jean Claude grows: every new need becomes a new feature, without touching the existing ones.

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
| `onClaudeEvent` | Fires when a Claude Code session of this window needs you (`question`) or finishes (`done`). Needs the Jean Claude hooks; see how `notificationSound` installs them |
| `log` | The **Jean Claude** output channel (`View → Output`); errors of features are logged here too |
| `extension` | The VS Code `ExtensionContext` (extension path, storage, secrets) |

Other options on `Feature`: `restartOn` restarts the feature when one of the listed settings changes, and `revert()` runs whenever the feature is off (at startup and when turned off, not when VS Code just closes). If `activate` throws, the feature is stopped, the error is shown and the status bar shows a warning; the other features keep working.

### Useful Commands

```bash
npm run compile          # Compile TypeScript
npm run watch            # Compile with file watching
npx @vscode/vsce package # Package as .vsix
```
