// All Jean Claude features, in the order they appear in the Jean Claude menu.
// To add a feature, create src/features/<id>/index.ts and list it here
// (see "Adding a feature" in README.md).
import type { Feature } from "../core/feature";
import { blinkingTabs } from "./blinkingTabs";
import { notificationSound } from "./notificationSound";
import { rainbowCsv } from "./rainbowCsv";

export const FEATURES: Feature[] = [blinkingTabs, notificationSound, rainbowCsv];
