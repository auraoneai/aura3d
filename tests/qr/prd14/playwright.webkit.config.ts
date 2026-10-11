// tests/qr/prd14/playwright.webkit.config.ts — PRD-14 §18: WebKit (Safari 17+) coverage.
// Runs the S1 dispatch specs and the S2/S11 v2 specs against the same built
// dists the chromium lane job serves (pattern copied from
// tests/qr/prd14/playwright.config.ts; browsers are installed by the job).
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./browser",
  testMatch: ["**/*-dispatch.spec.ts", "**/*-v2.spec.ts"],
  timeout: 120_000,
  workers: 1,
  // P-22: fail CI on stray test.only/describe.only committed to the lane.
  forbidOnly: !!process.env.CI,
  use: {
    browserName: "webkit",
    headless: true,
    viewport: { width: 1920, height: 1080 }
  },
  // P-22: a skipped test fails the run on CI (no-skip-reporter.ts).
  reporter: [["list"], ["./no-skip-reporter.ts"], ["json", { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? "tests/qr/prd14/reports/browser-webkit.json" }]]
});
