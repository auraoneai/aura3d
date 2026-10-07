import { defineConfig } from "@playwright/test";

// Lane-08 scoped Playwright config (remote-only; see qr-prd08-camera.yml).
// Mirrors the root config's use block; the lane owns this file.
export default defineConfig({
  testDir: "../../..",
  testMatch: ["tests/qr/prd08/browser/**/*.spec.ts"],
  timeout: 180_000,
  workers: 1,
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 800, height: 600 },
    launchOptions: {
      args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"],
    },
  },
  reporter: [["list"], ["json", { outputFile: "tests/reports/prd08/browser.json" }]],
});
