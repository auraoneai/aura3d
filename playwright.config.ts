import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const defaultMacChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromiumExecutablePath = process.env.A3D_WEBGPU_BROWSER_EXECUTABLE ||
  (process.env.A3D_DISABLE_SYSTEM_WEBGPU_BROWSER === "true" ? undefined : existsSync(defaultMacChromePath) ? defaultMacChromePath : undefined);
const chromiumLaunchOptions = {
  ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
  args: [
    "--enable-unsafe-webgpu",
    "--ignore-gpu-blocklist",
    "--enable-unsafe-swiftshader",
    // AURA3D_FORCE_SWIFTSHADER=1 reproduces the CPU-only-runner GL stack locally.
    ...(process.env.AURA3D_FORCE_SWIFTSHADER === "true"
      ? ["--use-gl=angle", "--use-angle=swiftshader"]
      : [])
  ],
};

export default defineConfig({
  testDir: ".",
  testMatch: ["tests/browser/**/*.spec.ts", "tests/visual/**/*.spec.ts"],
  testIgnore: ["release-artifacts/**"],
  timeout: 60_000,
  workers: 1,
  // P-22: a stray test.only must not narrow a CI run to one spec.
  forbidOnly: !!process.env.CI,
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 800, height: 600 },
    launchOptions: chromiumLaunchOptions,
  },
  // P-22: fails CI runs that skip a test not covered by tests/support/integrated-pending.json.
  reporter: [["list"], ["json", { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? "tests/reports/browser.json" }], ["./tests/support/noSkipInCiReporter.ts"]]
});
