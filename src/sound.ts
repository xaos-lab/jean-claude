import { execFile, exec } from "child_process";
import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";
import type { ClaudeEventType } from "./eventMonitor";

const soundFiles: Record<string, string> = {
  icq: "icq.mp3",
  pop: "pop.mp3",
};

const messages: Record<ClaudeEventType, string> = {
  question: "Claude Code is waiting for your input",
  done: "Claude Code has finished the task",
};

function getSoundFile(): string {
  const config = vscode.workspace.getConfiguration("jeanClaude");
  const sound = config.get<string>("notificationSound.sound", "icq");
  const filename = soundFiles[sound] || soundFiles.icq;

  const extensionPath = vscode.extensions.getExtension("tomasjanu.jean-claude")?.extensionPath;
  if (extensionPath) {
    return path.join(extensionPath, "sounds", filename);
  }
  return path.join(__dirname, "..", "sounds", filename);
}

function getPowerShellPath(): string {
  const sysRoot = process.env.SystemRoot || "C:\\Windows";
  return path.join(sysRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

/** Runs a PowerShell script; values go in through env vars so nothing needs quoting. */
function runPowerShell(script: string, env: Record<string, string>): void {
  execFile(
    getPowerShellPath(),
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { env: { ...process.env, ...env }, windowsHide: true },
    () => {}
  );
}

export function playSound(): void {
  const soundFile = getSoundFile();
  const platform = os.platform();

  if (platform === "win32") {
    runPowerShell(
      "Add-Type -AssemblyName PresentationCore; " +
        "$p = New-Object System.Windows.Media.MediaPlayer; " +
        "$p.Open([uri]$env:JC_SOUND); $p.Play(); Start-Sleep -Milliseconds 3000",
      { JC_SOUND: soundFile }
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

export function showToast(type: ClaudeEventType): void {
  const workspace = vscode.workspace.name;
  const text = workspace ? `${messages[type]} (${workspace})` : messages[type];

  if (os.platform() !== "win32") {
    vscode.window.showInformationMessage(text);
    return;
  }

  runPowerShell(
    [
      "$t = [System.Security.SecurityElement]::Escape($env:JC_TITLE)",
      "$m = [System.Security.SecurityElement]::Escape($env:JC_TEXT)",
      "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
      "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null",
      "$xml = New-Object Windows.Data.Xml.Dom.XmlDocument",
      `$xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>' + $t + '</text><text>' + $m + '</text></binding></visual></toast>')`,
      "$toast = New-Object Windows.UI.Notifications.ToastNotification $xml",
      "$appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'",
      "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)",
    ].join("; "),
    { JC_TITLE: "Jean Claude", JC_TEXT: text }
  );
}

// Finds the visible windows of the VS Code main process whose title shows this
// workspace's name and flashes them until they come to the foreground.
// Prefers titles where the name is a whole " - " separated part; then any title
// containing it; and if nothing matches but VS Code has one window, that one.
const FLASH_CS = `
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class JeanClaudeFlash {
  [StructLayout(LayoutKind.Sequential)]
  public struct FLASHWINFO { public uint cbSize; public IntPtr hwnd; public uint dwFlags; public uint uCount; public uint dwTimeout; }
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool FlashWindowEx(ref FLASHWINFO info);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int max);
  public static int Flash(uint pid, string needle) {
    List<IntPtr> all = new List<IntPtr>();
    List<IntPtr> exact = new List<IntPtr>();
    List<IntPtr> loose = new List<IntPtr>();
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      uint p;
      GetWindowThreadProcessId(h, out p);
      if (p != pid || !IsWindowVisible(h)) return true;
      StringBuilder sb = new StringBuilder(512);
      GetWindowText(h, sb, 512);
      string title = sb.ToString();
      if (title.Length == 0) return true;
      all.Add(h);
      if (needle.Length == 0) return true;
      string padded = " - " + title + " - ";
      if (padded.IndexOf(" - " + needle + " - ", StringComparison.OrdinalIgnoreCase) >= 0) exact.Add(h);
      else if (title.IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0) loose.Add(h);
      return true;
    }, IntPtr.Zero);
    List<IntPtr> hits = exact.Count > 0 ? exact : loose;
    if (hits.Count == 0 && all.Count == 1) hits.Add(all[0]);
    foreach (IntPtr h in hits) {
      FLASHWINFO info = new FLASHWINFO();
      info.cbSize = (uint)Marshal.SizeOf(info);
      info.hwnd = h;
      info.dwFlags = 15; // FLASHW_ALL | FLASHW_TIMERNOFG
      FlashWindowEx(ref info);
    }
    return hits.Count;
  }
}`;

/** Flashes this VS Code window's taskbar button (Windows only). */
export function flashWindow(): void {
  if (os.platform() !== "win32") {
    return;
  }
  const mainPid = process.env.VSCODE_PID || String(process.ppid);
  runPowerShell(
    "Add-Type -TypeDefinition $env:JC_CS; [JeanClaudeFlash]::Flash([uint32]$env:JC_PID, [string]$env:JC_TITLE) | Out-Null",
    { JC_CS: FLASH_CS, JC_PID: mainPid, JC_TITLE: vscode.workspace.name ?? "" }
  );
}
