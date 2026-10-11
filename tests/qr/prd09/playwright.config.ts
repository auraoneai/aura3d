import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const defaultMacChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromiumExecutablePath = process.env.A3D_WEBGPU_BROWSER_EXECUTABLE ||
  (process.env.A3D_DISABLE_SYSTEM_WEBGPU_BROWSER === "true" ? undefined : existsSync(defaultMacChromePath) ? defaultMacChromePath : undefined);

export default defineConfig({
  testDir: ".",
  testMatch: ["capture-divergence.spec.ts"],
  timeout: 180_000,
  workers: 1,
  // P-22: fail CI on a stray test.only / describe.only committed to the lane.
  forbidOnly: !!process.env.CI,
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 1920, height: 1080 },
    launchOptions: {
      ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
      args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--use-angle=metal", "--enable-gpu", "--mute-audio"],
    },
  },
  // P-22: no-skipped-reporter fails the run on CI when any test is skipped.
  reporter: [["list"], ["json", { outputFile: "tests/qr/prd09/.out/playwright.json" }], ["./no-skipped-reporter.ts"]],
});
