// tests/qr/prd14/playwright.firefox.config.ts — PRD-14 §18: Firefox coverage.
// S1 only: the dispatch specs boot each route flag-off (legacy) and flag-on
// (v2). The lane job sets A3D_DISPATCH_SOAK_MS=60000 so the S1 "0 console/page
// errors over 60 s" timeline is measured, per §16.1/§18.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./browser",
  testMatch: ["**/*-dispatch.spec.ts"],
  timeout: 120_000,
  workers: 1,
  // P-22: fail CI on stray test.only/describe.only committed to the lane.
  forbidOnly: !!process.env.CI,
  use: {
    browserName: "firefox",
    headless: true,
    viewport: { width: 1920, height: 1080 },
    launchOptions: {
      firefoxUserPrefs: {
        "webgl.force-enabled": true,
        "webgl.disabled": false
      }
    }
  },
  // P-22: a skipped test fails the run on CI (no-skip-reporter.ts). The JSON
  // report path is relative to this config (tests/qr/prd14/reports/).
  reporter: [["list"], ["./no-skip-reporter.ts"], ["json", { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? "./reports/browser-firefox.json" }]]
});
