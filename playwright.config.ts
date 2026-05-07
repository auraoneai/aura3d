import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["tests/browser/**/*.spec.ts", "tests/visual/**/*.spec.ts"],
  timeout: 60_000,
  workers: 1,
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 800, height: 600 }
  },
  reporter: [["list"], ["json", { outputFile: "tests/reports/browser.json" }]]
});
