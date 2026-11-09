// Colors each column of CSV/TSV files in its own color (see colorizer.ts).
import type { Feature } from "../../core/feature";
import { CsvColorizer } from "./colorizer";

export const rainbowCsv: Feature = {
  id: "rainbowCsv",
  title: "Rainbow CSV",
  description:
    "Colors each column of CSV and TSV files in its own color, so the columns are easy to follow. " +
    "The delimiter (, ; tab |) is detected automatically.",

  activate(ctx) {
    ctx.subscriptions.push(new CsvColorizer());
  },
};
