import { defineConfig } from "@playwright/test";
import baseConfig from "../../../playwright.config";

/**
 * Lane prd05 playwright config: specs under tests/qr/prd05/browser.
 *
 * Projects (05-BROWSERS / §15): chromium is the reference renderer; webkit
 * and firefox re-verify decode correctness (meshopt/ktx2 worker transcoding,
 * sRGB ΔE) on the other engines. GPU-launch args apply to Chromium only —
 * PRD05_CHROMIUM_ARGS (space-separated) appends them, the lane workflow
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
    ...baseConfig.use
  },
  projects: [
    {
      name: "chromium",
      use: {
        launchOptions: {
          ...baseLaunch,
          args: [...(baseLaunch.args ?? []), ...extraArgs]
        }
      }
    },
    { name: "webkit", use: {} },
    { name: "firefox", use: {} }
  ]
});
