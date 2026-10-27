// Runs via "vscode:uninstall" (plain Node, no VS Code API) after the extension
// is uninstalled: removes our hooks, the event folder and the tab icon patch.
import * as fs from "fs";
import * as path from "path";
import { EVENTS_DIR, removeHooks } from "./hooks";
import { findClaudeCodeDirs, setBlinking } from "./tabIcons";

try {
  removeHooks();
} catch {
  // settings.json unreadable: leave it alone
}

try {
  fs.rmSync(EVENTS_DIR, { recursive: true, force: true });
} catch {
  // ignore
}

// This file lives in <extensions>/tomasjanu.jean-claude-x.y.z/out/
const extensionsRoot = path.resolve(__dirname, "..", "..");
for (const dir of findClaudeCodeDirs(extensionsRoot)) {
  setBlinking(dir, false);
}
