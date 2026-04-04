# Jean Claude - VS Code Extension

Displays your current Claude.ai usage limits directly in the VS Code status bar and plays notification sounds when Claude Code needs your attention.

![Status bar example](https://img.shields.io/badge/☁_Claude:_5h_12%25_|_7d_35%25-blue?style=flat-square)

## Features

### Usage Monitor
- **Disabled by default** — must be explicitly enabled in settings
- **5h** - current 5-hour session usage (%)
- **7d** - weekly usage across all models (%)
- Color coding: green (<50%), yellow (50-80%), red (>80%)
- Tooltip with detailed breakdown (Sonnet, Opus, reset times)
- Automatic OAuth token refresh when expired (via Claude Code CLI)

> **⚠️ Billing notice (April 2026):** The usage monitor calls the Anthropic API using your OAuth token or session cookie. Under the [new billing policy](https://claude.ai), third-party API access is no longer covered by your Claude subscription and may incur extra usage charges. Enable at your own discretion.

### Notification Sounds
- Plays a sound when Claude Code **asks a question** (tool approval, user input)
- Plays a sound when Claude Code **finishes a task**
- Works with both **Claude Code CLI** (terminal) and **Claude Code Extension** (via hooks)

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

**Quickest way:** `Ctrl+Shift+P` → **"Jean Claude: Setup Notifications"** — this enables the setting and adds the required hooks to `~/.claude/settings.json` automatically.

**Manual setup** — if you prefer to do it yourself:

**A) Enable in VS Code settings:**
- `Ctrl+,` → search `jeanClaude.notificationSound.enabled` → check the box
- Or add to your `settings.json`: `"jeanClaude.notificationSound.enabled": true`

**B) Add Claude Code hooks** to `~/.claude/settings.json` (or project-level `.claude/settings.local.json`):

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo \"Permission needed\" > ~/.claude/claude-notify"
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo \"$CLAUDE_NOTIFICATION\" > ~/.claude/claude-notify"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo done > ~/.claude/claude-stop"
          }
        ]
      }
    ]
  }
}
```

These hooks write trigger files that the extension watches. Without them, sounds only work for Claude Code CLI in the VS Code terminal (via built-in terminal monitoring), but **not** for the Claude Code VS Code extension or external terminals.

> `PermissionRequest` — fires when the VS Code extension shows a permission dialog.
> `Notification` — fires for CLI permission prompts and idle state.
> `Stop` — fires when Claude finishes a task.

## Extension Settings

Open Settings (`Ctrl+,`) and search for "Jean Claude":

| Setting | Default | Description |
|---------|---------|-------------|
| `jeanClaude.usageMonitor.enabled` | `false` | Enable usage monitor (⚠️ calls Anthropic API, may incur extra charges) |
| `jeanClaude.authMethod` | `auto` | `auto` = OAuth + fallback to cookie, `cookie` = cookie only |
| `jeanClaude.sessionKey` | (empty) | Session cookie from browser |
| `jeanClaude.refreshInterval` | `5` | Data refresh interval in minutes (1-60) |
| `jeanClaude.notificationSound.enabled` | `false` | Enable notification sounds |
| `jeanClaude.notificationSound.sound` | `icq` | Which sound to play (`icq` or `pop`) |
| `jeanClaude.notificationSound.showNotification` | `true` | Show Windows toast notification + flash taskbar when VS Code is not focused |
| `jeanClaude.notificationSound.onQuestion` | `true` | Sound when Claude asks for input |
| `jeanClaude.notificationSound.onTaskComplete` | `true` | Sound when Claude finishes a task |

## Commands

Open Command Palette (`Ctrl+Shift+P`):

- **Jean Claude: Refresh** - manually refresh usage data
- **Jean Claude: Set Session Key** - set session cookie
- **Jean Claude: Setup Notifications** - enable notification sounds and add hooks to `~/.claude/settings.json`

## Development

### Project Structure

```
jean-claude/
├── src/
│   ├── extension.ts        # Entry point, activation, polling
│   ├── api.ts              # API client (OAuth + web cookie, token refresh)
│   ├── statusBar.ts        # Status bar UI, formatting, colors
│   ├── terminalMonitor.ts  # Terminal output watcher for Claude CLI
│   ├── fileMonitor.ts      # Trigger file watcher for hooks
│   └── sound.ts            # Cross-platform sound player
├── out/                    # Compiled JavaScript (generated)
├── package.json            # Extension manifest
└── tsconfig.json           # TypeScript configuration
```

### Useful Commands

```bash
npm run compile          # Compile TypeScript
npm run watch            # Compile with file watching
npx @vscode/vsce package # Package as .vsix
```

## Uninstall

Via VS Code: `Ctrl+Shift+X` → find "Jean Claude" → **Uninstall**.
