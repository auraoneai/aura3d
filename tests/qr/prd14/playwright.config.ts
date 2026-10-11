// tests/qr/prd14/playwright.config.ts — lane-14 Playwright config.
// The root playwright.config.ts testMatch only covers tests/browser and
// tests/visual; lane specs live under tests/qr/prd14/browser and are run via
// `pnpm exec playwright test -c tests/qr/prd14/playwright.config.ts`.
import { defineConfig } from "@playwright/test";

// The lane workflow exports the runner's Chromium GPU flags (Metal ANGLE on
// macos-14, Vulkan ANGLE on the L4 pool) as QRC_GPU_ARGS; without them a
// Linux runner would fall back to SwiftShader and frames would not compare
// with the capture job's. Unset locally: Playwright defaults.
const gpuArgs = (process.env.QRC_GPU_ARGS ?? "").split(/\s+/).filter((a) => a.length > 0);
const headlessNew = gpuArgs.includes("--headless=new");

export default defineConfig({
  testDir: "./browser",
  testMatch: ["**/*.spec.ts"],
  timeout: 120_000,
  workers: 1,
  // P-22: fail CI on stray test.only/describe.only committed to the lane.
  forbidOnly: !!process.env.CI,
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 1920, height: 1080 },
    // `--headless=new` is how Playwright's chromium channel selects the new
    // headless mode; the flag itself is passed through with the rest.
    ...(gpuArgs.length > 0 ? { launchOptions: { args: gpuArgs }, ...(headlessNew ? { channel: "chromium" } : {}) } : {})
  },
  // P-22: a skipped test fails the run on CI (no-skip-reporter.ts). The JSON
  // report path is relative to this config (tests/qr/prd14/reports/).
  reporter: [["list"], ["./no-skip-reporter.ts"], ["json", { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? "./reports/browser.json" }]]
});
