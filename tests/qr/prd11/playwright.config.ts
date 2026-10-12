import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

// P-22: absolute path — Playwright resolves relative custom reporters against
// this config's directory (see tests/qr/prd04/playwright.config.ts).
const noSkipInCiReporter = fileURLToPath(new URL("../../support/noSkipInCiReporter.ts", import.meta.url));

const gpuArgs = (process.env.QR_BENCH_CHROME_ARGS ?? "--use-angle=metal --enable-gpu --ignore-gpu-blocklist")
  .split(/\s+/)
  .filter(Boolean);

export default defineConfig({
  testDir: "browser",
  testMatch: ["**/*.spec.ts"],
  timeout: 120_000,
  workers: 1,
  forbidOnly: !!process.env.CI,
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: gpuArgs }
  },
  reporter: [["list"], ["json", { outputFile: "out/lane-browser.json" }], [noSkipInCiReporter]]
});
