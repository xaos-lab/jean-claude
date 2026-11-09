import * as vscode from "vscode";
import { UsageData, UsageBucket } from "./api";

/** The usage monitor's own status bar item, next to the "Jean Claude" one. */
export class UsageStatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private disposed = false;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      "jeanClaude.usage",
      vscode.StatusBarAlignment.Right,
      49
    );
    this.item.command = "jeanClaude.refresh";
    this.item.name = "Jean Claude: Usage";
    this.showLoading();
    this.item.show();
  }

  showLoading(): void {
    this.set("$(graph) ...", "Loading usage data...");
  }

  showError(message: string): void {
    this.set(
      "$(graph) $(warning)",
      `Error: ${message}\nClick to retry`,
      new vscode.ThemeColor("statusBarItem.warningForeground")
    );
  }

  update(data: UsageData): void {
    const fiveHour = Math.round(data.five_hour.utilization);
    const sevenDay = Math.round(data.seven_day.utilization);

    // Color based on highest usage
    const maxUsage = Math.max(fiveHour, sevenDay);
    const color =
      maxUsage >= 80
        ? new vscode.ThemeColor("statusBarItem.errorForeground")
        : maxUsage >= 50
          ? new vscode.ThemeColor("statusBarItem.warningForeground")
          : undefined;

    // Detailed tooltip
    const lines: string[] = ["Claude usage", ""];
    lines.push(formatBucket("Current session (5h)", data.five_hour));
    lines.push(formatBucket("Weekly - All models", data.seven_day));

    if (data.seven_day_sonnet) {
      lines.push(formatBucket("Weekly - Sonnet only", data.seven_day_sonnet));
    }
    if (data.seven_day_opus) {
      lines.push(formatBucket("Weekly - Opus only", data.seven_day_opus));
    }

    lines.push("", "Click to refresh");
    this.set(`$(graph) 5h ${fiveHour}% | 7d ${sevenDay}%`, lines.join("\n"), color);
  }

  /** Ignores late results that arrive after the feature was turned off. */
  private set(text: string, tooltip: string, color?: vscode.ThemeColor): void {
    if (this.disposed) {
      return;
    }
    this.item.text = text;
    this.item.tooltip = tooltip;
    this.item.color = color;
  }

  dispose(): void {
    this.disposed = true;
    this.item.dispose();
  }
}

function formatBucket(label: string, bucket: UsageBucket): string {
  const pct = Math.round(bucket.utilization);
  const bar = makeBar(pct);
  const reset = bucket.resets_at ? formatResetTime(bucket.resets_at) : "";
  const resetStr = reset ? ` (resets ${reset})` : "";
  return `${label}: ${bar} ${pct}%${resetStr}`;
}

function makeBar(pct: number): string {
  const filled = Math.round(pct / 10);
  return "\u2588".repeat(filled) + "\u2591".repeat(10 - filled);
}

function formatResetTime(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();

    if (diffMs <= 0) {
      return "soon";
    }

    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) {
      return `in ${diffMin}m`;
    }

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) {
      const remainMin = diffMin % 60;
      return `in ${diffHours}h ${remainMin}m`;
    }

    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayName = days[date.getDay()];
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    const h12 = hours % 12 || 12;
    return `${dayName} ${h12}:${minutes} ${ampm}`;
  } catch {
    return "";
  }
}
