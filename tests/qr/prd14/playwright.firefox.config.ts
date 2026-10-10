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
  use: {
    browserName: "firefox",
    headless: true,
    viewport: { width: 1920, height: 1080 }
  },
  reporter: [["list"], ["json", { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? "tests/qr/prd14/reports/browser-firefox.json" }]]
});
