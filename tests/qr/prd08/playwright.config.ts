import { defineConfig } from "@playwright/test";

// Lane-08 scoped Playwright config (remote-only; see qr-prd08-camera.yml).
// Mirrors the root config's use block; the lane owns this file.
export default defineConfig({
  testDir: "../../..",
  testMatch: ["tests/qr/prd08/browser/**/*.spec.ts"],
  timeout: 180_000,
  workers: 1,
  // P-22: fail CI on a stray test.only/describe.only committed to the lane.
  forbidOnly: !!process.env.CI,
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 800, height: 600 },
    launchOptions: {
      // CI (qr-prd08-camera.yml browser-gpu) passes the ANGLE Metal GPU flags via CHROME_ARGS.
      args: [
        "--enable-unsafe-webgpu",
        "--ignore-gpu-blocklist",
        ...(process.env.CHROME_ARGS ?? "").split(/\s+/).filter(Boolean)
      ],
    },
  },
  // Reporter output paths resolve against this config's directory, so the
  // JSON lands beside the frame-pacing CSVs in tests/reports/prd08/ and the
  // HTML report in tests/qr/prd08/playwright-report/ (both uploaded by CI).
  // P-22: the no-skip reporter fails a CI run that skipped any test.
  reporter: [
    ["list"],
    ["json", { outputFile: "../../reports/prd08/browser.json" }],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["./no-skip-reporter.ts"]
  ],
});
