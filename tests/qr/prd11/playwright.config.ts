import { defineConfig } from "@playwright/test";

const gpuArgs = (process.env.QR_BENCH_CHROME_ARGS ?? "--use-angle=metal --enable-gpu --ignore-gpu-blocklist")
  .split(/\s+/)
  .filter(Boolean);

export default defineConfig({
  testDir: "browser",
  testMatch: ["**/*.spec.ts"],
  timeout: 120_000,
  workers: 1,
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: gpuArgs }
  },
  reporter: [["list"], ["json", { outputFile: "out/lane-browser.json" }]]
});
