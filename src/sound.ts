import { execFile, exec } from "child_process";
import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";

export type SoundType = "taskComplete" | "question";

function getSoundFile(): string {
  const extensionPath = vscode.extensions.getExtension("tomasjanu.jean-claude")?.extensionPath;
  if (extensionPath) {
    return path.join(extensionPath, "src", "icq.mp3");
  }
  return path.join(__dirname, "..", "src", "icq.mp3");
}

function getPowerShellPath(): string {
  const sysRoot = process.env.SystemRoot || "C:\\Windows";
  return path.join(sysRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

export function playSound(_type: SoundType): void {
  const platform = os.platform();
  const soundFile = getSoundFile();

  if (platform === "win32") {
    execFile(
      getPowerShellPath(),
      ["-NoProfile", "-Command", `Add-Type -AssemblyName PresentationCore; $p = New-Object System.Windows.Media.MediaPlayer; $p.Open([uri]'${soundFile}'); $p.Play(); Start-Sleep -Milliseconds 3000`],
      () => {}
    );
  } else if (platform === "darwin") {
    execFile("afplay", [soundFile], () => {});
  } else {
    exec(
      `mpv --no-video "${soundFile}" 2>/dev/null || ffplay -nodisp -autoexit "${soundFile}" 2>/dev/null || paplay "${soundFile}" 2>/dev/null`,
      () => {}
    );
  }
}
