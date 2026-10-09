import { defineConfig, devices } from "@playwright/test";

// PRD-09 §18/§19 browser matrix for `qr-prd09-game` (macos-14 only — no visual
// gate runs on ubuntu/SwiftShader). Specs self-serve the repo root via
// tests/browser/example-dev-server.ts, so packages/game/fixtures/* is
// reachable as a route.

const chromiumLaunchArgs = ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"];

export default defineConfig({
  testDir: "tests/browser",
  timeout: 60_000,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? "tests/reports/browser-prd09.json" }]
  ],
  projects: [
    {
      // §18 Chromium (primary): every game-shell spec plus the lane's layout,
      // touch and audio-live gates.
      name: "chromium",
      use: {
        browserName: "chromium",
        headless: true,
        viewport: { width: 800, height: 600 },
        launchOptions: { args: chromiumLaunchArgs }
      },
      testMatch: [
        "game-shell/**/*.spec.ts",
        "layout.spec.ts",
        "touch.spec.ts",
        "audio-live.spec.ts"
      ]
    },
    {
      // §18 WebKit desktop: shell-flow, layout, audio-live (gesture unlock,
      // AAC fallback path).
      name: "webkit",
      use: { ...devices["Desktop Safari"], browserName: "webkit" },
      testMatch: [
        "game-shell/shell-flow.spec.ts",
        "layout.spec.ts",
        "audio-live.spec.ts"
      ]
    },
    {
      // §18/§19 WebKit mobile emulation: touch on iPhone 13 (390×844, DPR 3).
      name: "webkit-mobile",
      use: { ...devices["iPhone 13"], browserName: "webkit" },
      testMatch: ["touch.spec.ts", "game-shell/touch.spec.ts"]
    },
    {
      // §19 Chromium mobile emulation: touch on Pixel 7 (412×915, DPR 2.625).
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"], browserName: "chromium", launchOptions: { args: chromiumLaunchArgs } },
      testMatch: ["touch.spec.ts", "game-shell/touch.spec.ts"]
    },
    {
      // §18 Firefox: shell-flow, audio-live (Opus path), layout.
      name: "firefox",
      use: { ...devices["Desktop Firefox"], browserName: "firefox" },
      testMatch: [
        "game-shell/shell-flow.spec.ts",
        "audio-live.spec.ts",
        "layout.spec.ts"
      ]
    }
  ]
});
