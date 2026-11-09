// What a Jean Claude feature looks like. Every feature can be turned on and off
// with the setting `jeanClaude.<id>.enabled`, from the Settings UI or from the
// Jean Claude menu in the status bar. See "Adding a feature" in README.md.
import * as vscode from "vscode";
import type { ClaudeEventType } from "./eventMonitor";

export interface Feature {
  /**
   * Unique ID. Also the feature's folder name (src/features/<id>/) and its
   * settings prefix: the on/off switch is `jeanClaude.<id>.enabled`, which must
   * be declared in package.json.
   */
  readonly id: string;
  /** Short name shown in the Jean Claude menu. */
  readonly title: string;
  /** One sentence shown under the title in the Jean Claude menu. */
  readonly description: string;
  /**
   * Other settings (relative to `jeanClaude.`) that restart the feature when
   * they change while it is on, e.g. ["myFeature.interval"].
   */
  readonly restartOn?: string[];

  /**
   * Starts the feature: at startup if it is on, and whenever it is turned on.
   * Put everything that must stop when it is turned off (timers, listeners,
   * commands, status bar items) into `ctx.subscriptions`.
   */
  activate(ctx: FeatureContext): void | Promise<void>;

  /**
   * Undoes lasting changes the feature made outside VS Code (e.g. patched
   * files). Called whenever the feature is off: at startup and when it is
   * turned off. Not called when VS Code just closes. Must be safe to call
   * repeatedly.
   */
  revert?(): void | Promise<void>;
}

export interface FeatureContext {
  /** Disposed when the feature is turned off or restarted, or VS Code closes. */
  readonly subscriptions: vscode.Disposable[];
  /** The extension's context: extensionPath, globalState, secrets, ... */
  readonly extension: vscode.ExtensionContext;
  /** Fires when a Claude Code session of this VS Code window asks for input or finishes. */
  readonly onClaudeEvent: vscode.Event<ClaudeEventType>;
  /** The "Jean Claude" output channel. */
  readonly log: vscode.LogOutputChannel;
  /** This feature's settings, `jeanClaude.<id>.*` (read it fresh each time). */
  settings(): vscode.WorkspaceConfiguration;
}
