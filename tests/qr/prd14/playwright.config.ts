// tests/qr/prd14/playwright.config.ts — lane-14 Playwright config.
// The root playwright.config.ts testMatch only covers tests/browser and
// tests/visual; lane specs live under tests/qr/prd14/browser and are run via
// `pnpm exec playwright test -c tests/qr/prd14/playwright.config.ts`.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./browser",
  testMatch: ["**/*.spec.ts"],
  timeout: 120_000,
  workers: 1,
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 1920, height: 1080 }
  },
  reporter: [["list"], ["json", { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? "tests/qr/prd14/reports/browser.json" }]]
});
