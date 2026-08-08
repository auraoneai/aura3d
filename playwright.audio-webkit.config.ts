import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["tests/browser/audio-browser.spec.ts"],
  timeout: 60_000,
  workers: 1,
  use: {
    browserName: "webkit",
    headless: true,
    viewport: { width: 800, height: 600 }
  },
  reporter: [["list"], ["json", { outputFile: "tests/reports/audio-webkit.json" }]]
});
