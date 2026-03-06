# Jean Claude - VS Code Extension

Displays your current Claude.ai usage limits directly in the VS Code status bar and plays notification sounds when Claude Code needs your attention.

![Status bar example](https://img.shields.io/badge/☁_Claude:_5h_12%25_|_7d_35%25-blue?style=flat-square)

## Features

### Usage Monitor
- **5h** - current 5-hour session usage (%)
- **7d** - weekly usage across all models (%)
- Color coding: green (<50%), yellow (50-80%), red (>80%)
- Tooltip with detailed breakdown (Sonnet, Opus, reset times)

### Notification Sounds
- Plays a sound when Claude Code **asks a question** (tool approval, user input)
- Plays a sound when Claude Code **finishes a task**
- Works with both **Claude Code CLI** (terminal) and **Claude Code Extension** (via hooks)

## Installation

### From .vsix file

1. Download the `.vsix` file from [Releases](https://github.com/xaos-lab/jean-claude/releases)
2. Open VS Code
3. `Ctrl+Shift+X` (Extensions) → click `...` in the top right → **"Install from VSIX..."**
4. Select the downloaded `.vsix` file
5. Restart VS Code (`Ctrl+Shift+P` → "Reload Window")

### From source

```bash
git clone https://github.com/xaos-lab/jean-claude.git
cd jean-claude
npm install
npm run compile
npx @vscode/vsce package
```

## Authentication Setup

The extension needs access to your Claude.ai account for the usage monitor.

### 1. Automatic detection (default)

If you have **Claude Code** installed, the extension will automatically find the OAuth token from `~/.claude/.credentials.json`. No configuration needed.

### 2. Session cookie from browser

If automatic detection doesn't work:

1. Open https://claude.ai and log in
2. Open DevTools (`F12`) → **Application** → **Cookies** → `https://claude.ai`
3. Copy the `sessionKey` cookie value (starts with `sk-ant-sid01-...`)
4. In VS Code: `Ctrl+Shift+P` → **"Jean Claude: Set Session Key"** → paste

> **Note:** The session cookie expires periodically.

## Notification Sound Setup

### 1. Enable in VS Code settings

Set `jeanClaude.notificationSound.enabled` to `true`.

### 2. Configure Claude Code hooks

Add the following to your `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Notification": [
      {
        "type": "command",
        "command": "echo \"$CLAUDE_NOTIFICATION\" > ~/.claude/claude-notify"
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": "echo \"done\" > ~/.claude/claude-stop"
      }
    ]
  }
}
```

### How it works

The extension uses two detection mechanisms:

- **Terminal Monitor** - watches for `claude` commands in VS Code terminal via Shell Integration API, reads output in real-time and detects question patterns. Works automatically with Claude Code CLI.
- **File Monitor** - watches trigger files in `~/.claude/` (`claude-notify`, `claude-stop`). Works with any Claude Code setup when hooks are configured.

## Extension Settings

Open Settings (`Ctrl+,`) and search for "Jean Claude":

| Setting | Default | Description |
|---------|---------|-------------|
| `jeanClaude.authMethod` | `auto` | `auto` = OAuth + fallback to cookie, `cookie` = cookie only |
| `jeanClaude.sessionKey` | (empty) | Session cookie from browser |
| `jeanClaude.refreshInterval` | `5` | Data refresh interval in minutes (1-60) |
| `jeanClaude.notificationSound.enabled` | `false` | Enable notification sounds |
| `jeanClaude.notificationSound.onQuestion` | `true` | Sound when Claude asks for input |
| `jeanClaude.notificationSound.onTaskComplete` | `true` | Sound when Claude finishes a task |

## Commands

Open Command Palette (`Ctrl+Shift+P`):

- **Jean Claude: Refresh** - manually refresh usage data
- **Jean Claude: Set Session Key** - set session cookie

## Development

### Project Structure

```
jean-claude/
├── src/
│   ├── extension.ts        # Entry point, activation, polling
│   ├── api.ts              # API client (OAuth + web cookie)
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

### Testing During Development

1. Open the project in VS Code
2. Press `F5` → a new VS Code window will launch with the extension
3. Edit code, save, restart debug session (`Ctrl+Shift+F5`)

## Uninstall

Via VS Code: `Ctrl+Shift+X` → find "Jean Claude" → **Uninstall**.
