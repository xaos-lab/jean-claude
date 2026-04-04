import * as vscode from "vscode";
import { UsageData, UsageBucket } from "./api";

export class StatusBarManager {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      50
    );
    this.item.command = "jeanClaude.refresh";
    this.item.name = "Jean Claude";
    this.showLoading();
    this.item.show();
  }

  showDisabled(): void {
    this.item.text = "$(cloud) Claude: off";
    this.item.tooltip =
      "Usage monitor is disabled.\n\n" +
      "⚠️ Enabling this calls the Anthropic API using your OAuth token,\n" +
      "which may incur extra usage charges (see billing policy April 2026).\n\n" +
      'To enable: Settings → jeanClaude.usageMonitor.enabled';
    this.item.color = undefined;
  }

  showLoading(): void {
    this.item.text = "$(cloud) Claude: ...";
    this.item.tooltip = "Loading usage data...";
    this.item.color = undefined;
  }

  showError(message: string): void {
    this.item.text = "$(cloud) Claude: $(warning)";
    this.item.tooltip = `Error: ${message}\nClick to retry`;
    this.item.color = new vscode.ThemeColor("statusBarItem.warningForeground");
  }

  update(data: UsageData): void {
    const fiveHour = Math.round(data.five_hour.utilization);
    const sevenDay = Math.round(data.seven_day.utilization);

    // Main text
    this.item.text = `$(cloud) Claude: 5h ${fiveHour}% | 7d ${sevenDay}%`;

    // Color based on highest usage
    const maxUsage = Math.max(fiveHour, sevenDay);
    if (maxUsage >= 80) {
      this.item.color = new vscode.ThemeColor(
        "statusBarItem.errorForeground"
      );
    } else if (maxUsage >= 50) {
      this.item.color = new vscode.ThemeColor(
        "statusBarItem.warningForeground"
      );
    } else {
      this.item.color = undefined;
    }

    // Detailed tooltip
    const lines: string[] = ["Jean Claude", ""];
    lines.push(formatBucket("Current session (5h)", data.five_hour));
    lines.push(formatBucket("Weekly - All models", data.seven_day));

    if (data.seven_day_sonnet) {
      lines.push(formatBucket("Weekly - Sonnet only", data.seven_day_sonnet));
    }
    if (data.seven_day_opus) {
      lines.push(formatBucket("Weekly - Opus only", data.seven_day_opus));
    }

    lines.push("", "Click to refresh");
    this.item.tooltip = lines.join("\n");
  }

  dispose(): void {
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
