import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

/**
 * Prefer a real GPU-backed browser, matching the root `playwright.config.ts`.
 *
 * Playwright's bundled Chromium falls back to **SwiftShader** (software rasterisation) on this host:
 * `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device ...), SwiftShader driver)`. This route renders 91
 * draw calls of skinned GLB fighters with shadows and postprocess, which software rendering cannot
 * sustain — measured **2 FPS with 97% of profiled time outside JS**. Every timing-sensitive test in
 * `playable-smoke.spec.ts` then missed its window, producing a different set of failures on each run
 * and looking like flaky gameplay logic when it was really a missing GPU.
 */
const defaultMacChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromiumExecutablePath = process.env.AURA_CLASH_BROWSER_EXECUTABLE ||
  (existsSync(defaultMacChromePath) ? defaultMacChromePath : undefined);
const chromiumLaunchOptions = chromiumExecutablePath
  ? { executablePath: chromiumExecutablePath, args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"] }
  : undefined;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:5187",
    trace: "on-first-retry"
  },
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 5187 --strictPort",
    url: "http://127.0.0.1:5187/playable/",
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(chromiumLaunchOptions ? { launchOptions: chromiumLaunchOptions } : {})
      }
    }
  ]
});
