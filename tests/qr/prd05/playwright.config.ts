import { defineConfig } from "@playwright/test";
import baseConfig from "../../../playwright.config";

/**
 * Lane prd05 playwright config: Chromium specs under tests/qr/prd05/browser.
 * PRD05_CHROMIUM_ARGS (space-separated) appends GPU args — the lane workflow
 * passes `--use-angle=metal --enable-gpu --ignore-gpu-blocklist` on macos-14.
 */
const extraArgs = (process.env.PRD05_CHROMIUM_ARGS ?? "").split(" ").filter(Boolean);
const baseLaunch = (baseConfig.use?.launchOptions ?? {}) as { args?: string[] };

export default defineConfig({
  ...baseConfig,
  testDir: ".",
  testMatch: ["browser/**/*.spec.ts"],
  timeout: 180_000,
  use: {
    ...baseConfig.use,
    launchOptions: {
      ...baseLaunch,
      args: [...(baseLaunch.args ?? []), ...extraArgs]
    }
  }
});
