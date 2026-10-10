import { defineConfig } from "@playwright/test";
import baseConfig from "../../../playwright.config";

/**
 * Lane prd13 Playwright config: the 13-SPECS browser specs under
 * tests/qr/prd13/browser (looks-expansion, template-look-floor,
 * prompt-plan-render). Run by the `browser` job of qr-prd13-authoring.yml on
 * macos-14.
 *
 *  - forbidOnly: a stray `test.only` fails the run instead of silently
 *    narrowing it; retries: 0 so a flaky failure is reported, never retried
 *    into a pass.
 *  - PRD13_CHROMIUM_ARGS (space-separated) appends GPU args — the workflow
 *    passes `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`, the
 *    template-lookdev.yml pattern.
 */
const extraArgs = (process.env.PRD13_CHROMIUM_ARGS ?? "").split(" ").filter(Boolean);
const baseLaunch = (baseConfig.use?.launchOptions ?? {}) as { args?: string[] };

export default defineConfig({
  ...baseConfig,
  testDir: ".",
  testMatch: ["browser/**/*.spec.ts"],
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 240_000,
  use: {
    ...baseConfig.use,
    launchOptions: {
      ...baseLaunch,
      args: [...(baseLaunch.args ?? []), ...extraArgs]
    }
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: "../../reports/prd13-browser/html", open: "never" }],
    ["json", { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? "../../reports/prd13-browser/results.json" }]
  ],
  outputDir: "../../reports/prd13-browser/test-results"
});
