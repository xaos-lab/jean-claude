import { execFile, exec } from "child_process";
import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";

export type SoundType = "taskComplete" | "question";

const soundFiles: Record<string, string> = {
  icq: "icq.mp3",
  pop: "pop.mp3",
};

function getSoundFile(): string {
  const config = vscode.workspace.getConfiguration("jeanClaude");
  const sound = config.get<string>("notificationSound.sound", "pop");
  const filename = soundFiles[sound] || soundFiles.icq;

  const extensionPath = vscode.extensions.getExtension("tomasjanu.jean-claude")?.extensionPath;
  if (extensionPath) {
    return path.join(extensionPath, "src", filename);
  }
  return path.join(__dirname, "..", "src", filename);
}

function getPowerShellPath(): string {
  const sysRoot = process.env.SystemRoot || "C:\\Windows";
  return path.join(sysRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

const notificationMessages: Record<SoundType, string> = {
  question: "Claude Code is waiting for your input",
  taskComplete: "Claude Code has finished the task",
};

export function playSound(_type: SoundType): void {
  const config = vscode.workspace.getConfiguration("jeanClaude");
  if (config.get<boolean>("notificationSound.showNotification", true) && !vscode.window.state.focused) {
    if (os.platform() === "win32") {
      const msg = notificationMessages[_type];
      const toastXml = `<toast><visual><binding template="ToastGeneric"><text>Jean Claude</text><text>${msg}</text></binding></visual></toast>`;
      // Toast notification
      execFile(
        getPowerShellPath(),
        ["-NoProfile", "-Command", [
          `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null`,
          `[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null`,
          `$xml = New-Object Windows.Data.Xml.Dom.XmlDocument`,
          `$xml.LoadXml('${toastXml}')`,
          `$toast = New-Object Windows.UI.Notifications.ToastNotification $xml`,
          `$AppId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'`,
          `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show($toast)`,
        ].join("; ")],
        () => {}
      );
      // Flash VS Code taskbar
      execFile(
        getPowerShellPath(),
        ["-NoProfile", "-Command",
          `Add-Type 'using System; using System.Runtime.InteropServices; public struct FLASHWINFO { public uint cbSize; public IntPtr hwnd; public uint dwFlags; public uint uCount; public uint dwTimeout; } public class FlashHelper { [DllImport("user32.dll")] public static extern bool FlashWindowEx(ref FLASHWINFO pwfi); }'; $v = Get-Process -Name "Code" -EA SilentlyContinue | ? { $_.MainWindowHandle -ne 0 } | Select -First 1; if ($v) { $fi = New-Object FLASHWINFO; $fi.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($fi); $fi.hwnd = $v.MainWindowHandle; $fi.dwFlags = 3; $fi.uCount = 5; $fi.dwTimeout = 0; [FlashHelper]::FlashWindowEx([ref]$fi) }`,
        ],
        () => {}
      );
    } else {
      vscode.window.showInformationMessage(notificationMessages[_type]);
    }
  }

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
