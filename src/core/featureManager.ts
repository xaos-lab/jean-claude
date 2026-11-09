// Turns features on and off to match their `jeanClaude.<id>.enabled` setting,
// and owns the "Jean Claude" status bar item that opens the on/off menu.
import * as vscode from "vscode";
import type { Feature, FeatureContext } from "./feature";

const SECTION = "jeanClaude";
export const FEATURES_COMMAND = "jeanClaude.features";

/** What every feature gets from the extension, besides its own subscriptions and settings. */
export type SharedContext = Pick<FeatureContext, "extension" | "onClaudeEvent" | "log">;

type MenuItem = vscode.QuickPickItem & { feature: Feature };

export class FeatureManager implements vscode.Disposable {
  private readonly features: Feature[] = [];
  /** Subscriptions of the features that are running. */
  private readonly running = new Map<string, vscode.Disposable[]>();
  /** Features that failed to start. */
  private readonly failed = new Set<string>();
  /** Per-feature chain, so on/off/restart of one feature never overlap. */
  private readonly queues = new Map<string, Promise<void>>();
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private disposed = false;

  constructor(features: readonly Feature[], private readonly shared: SharedContext) {
    const config = vscode.workspace.getConfiguration(SECTION);
    for (const feature of features) {
      if (this.features.some((f) => f.id === feature.id)) {
        shared.log.error(`Feature "${feature.id}" is registered twice; ignoring the second one.`);
        continue;
      }
      if (config.inspect(`${feature.id}.enabled`)?.defaultValue === undefined) {
        shared.log.warn(
          `Setting "${SECTION}.${feature.id}.enabled" is not declared in package.json, ` +
            `so feature "${feature.id}" can't be turned on.`
        );
      }
      this.features.push(feature);
    }

    this.item = vscode.window.createStatusBarItem(
      "jeanClaude.status",
      vscode.StatusBarAlignment.Right,
      50
    );
    this.item.name = "Jean Claude";
    this.item.command = FEATURES_COMMAND;
    this.item.show();

    this.disposables.push(
      this.item,
      vscode.commands.registerCommand(FEATURES_COMMAND, () => this.showMenu()),
      vscode.workspace.onDidChangeConfiguration((e) => this.onConfigChange(e))
    );

    for (const feature of this.features) {
      this.sync(feature);
    }
    this.updateStatusBar();
  }

  isEnabled(feature: Feature): boolean {
    return vscode.workspace.getConfiguration(SECTION).get<boolean>(`${feature.id}.enabled`, false);
  }

  private onConfigChange(e: vscode.ConfigurationChangeEvent): void {
    if (!e.affectsConfiguration(SECTION)) {
      return;
    }
    for (const feature of this.features) {
      if (e.affectsConfiguration(`${SECTION}.${feature.id}.enabled`)) {
        this.sync(feature);
      } else if (
        this.isEnabled(feature) &&
        feature.restartOn?.some((key) => e.affectsConfiguration(`${SECTION}.${key}`))
      ) {
        this.restart(feature);
      }
    }
    this.updateStatusBar();
  }

  /** Starts or stops the feature to match its setting. */
  private sync(feature: Feature): void {
    this.enqueue(feature, async () => {
      if (this.isEnabled(feature)) {
        if (!this.running.has(feature.id)) {
          await this.start(feature);
        }
      } else {
        this.stop(feature);
        this.failed.delete(feature.id);
        await feature.revert?.();
      }
    });
  }

  private restart(feature: Feature): void {
    this.enqueue(feature, async () => {
      this.stop(feature);
      if (this.isEnabled(feature)) {
        await this.start(feature);
      }
    });
  }

  private enqueue(feature: Feature, task: () => Promise<void>): void {
    const previous = this.queues.get(feature.id) ?? Promise.resolve();
    const next = previous
      .then(() => (this.disposed ? undefined : task()))
      .catch((err: unknown) => this.report(feature, err))
      .finally(() => {
        if (!this.disposed) {
          this.updateStatusBar();
        }
      });
    this.queues.set(feature.id, next);
  }

  private async start(feature: Feature): Promise<void> {
    const subscriptions: vscode.Disposable[] = [];
    this.running.set(feature.id, subscriptions);
    const ctx: FeatureContext = {
      ...this.shared,
      subscriptions,
      settings: () => vscode.workspace.getConfiguration(`${SECTION}.${feature.id}`),
    };
    try {
      await feature.activate(ctx);
    } catch (err) {
      this.stop(feature);
      this.failed.add(feature.id);
      throw err;
    }
    if (this.disposed) {
      // VS Code closed while the feature was starting.
      this.stop(feature);
      return;
    }
    this.failed.delete(feature.id);
    this.shared.log.info(`${feature.id}: on`);
  }

  private stop(feature: Feature): void {
    const subscriptions = this.running.get(feature.id);
    if (!subscriptions) {
      return;
    }
    this.running.delete(feature.id);
    for (const subscription of subscriptions.reverse()) {
      try {
        subscription.dispose();
      } catch (err) {
        if (!this.disposed) {
          this.shared.log.error(`${feature.id}: error while stopping: ${errorMessage(err)}`);
        }
      }
    }
    if (!this.disposed) {
      this.shared.log.info(`${feature.id}: off`);
    }
  }

  private report(feature: Feature, err: unknown): void {
    if (this.disposed) {
      return;
    }
    const message = errorMessage(err);
    this.shared.log.error(`${feature.id}: ${message}`);
    vscode.window
      .showErrorMessage(`Jean Claude – ${feature.title}: ${message}`, "Show Log")
      .then((choice) => {
        if (choice) {
          this.shared.log.show();
        }
      });
  }

  /** Checkbox list of all features; Enter applies the changes. */
  private showMenu(): void {
    const items: MenuItem[] = this.features.map((feature) => ({
      label: feature.title,
      detail: feature.description,
      feature,
    }));

    const pick = vscode.window.createQuickPick<MenuItem>();
    pick.title = "Jean Claude features";
    pick.placeholder = "Check the features you want on, then press Enter";
    pick.canSelectMany = true;
    pick.matchOnDetail = true;
    pick.items = items;
    pick.selectedItems = items.filter((item) => this.isEnabled(item.feature));
    pick.buttons = [{ iconPath: new vscode.ThemeIcon("gear"), tooltip: "All Jean Claude settings" }];

    pick.onDidTriggerButton(() => {
      pick.hide();
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        `@ext:${this.shared.extension.extension.id}`
      );
    });
    pick.onDidAccept(async () => {
      const wanted = new Set(pick.selectedItems.map((item) => item.feature.id));
      pick.hide();
      for (const feature of this.features) {
        const on = wanted.has(feature.id);
        if (on !== this.isEnabled(feature)) {
          await this.setEnabled(feature, on);
        }
      }
    });
    pick.onDidHide(() => pick.dispose());
    pick.show();
  }

  /** Changes the setting; onConfigChange then starts or stops the feature. */
  private async setEnabled(feature: Feature, on: boolean): Promise<void> {
    const config = vscode.workspace.getConfiguration(SECTION);
    const key = `${feature.id}.enabled`;
    // Change it where it is set, so a workspace value can't override the change.
    const target =
      config.inspect(key)?.workspaceValue !== undefined
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
    try {
      await config.update(key, on, target);
    } catch (err) {
      this.report(feature, err);
    }
  }

  private updateStatusBar(): void {
    const states = this.features.map((feature) => ({
      feature,
      state: this.failed.has(feature.id) ? "error" : this.isEnabled(feature) ? "on" : "off",
    }));
    const anyFailed = states.some((s) => s.state === "error");
    const anyOn = states.some((s) => s.state === "on");

    this.item.text = `$(cloud) Jean Claude: ${anyFailed ? "$(warning)" : anyOn ? "on" : "off"}`;
    this.item.tooltip = [
      "Jean Claude",
      "",
      ...states.map(({ feature, state }) => `${state === "on" ? "●" : "○"} ${feature.title}: ${state}`),
      "",
      "Click to turn features on or off",
    ].join("\n");
  }

  dispose(): void {
    this.disposed = true;
    for (const feature of [...this.features].reverse()) {
      this.stop(feature);
    }
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
