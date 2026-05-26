import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const defaultMacChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromiumExecutablePath = process.env.A3D_WEBGPU_BROWSER_EXECUTABLE ||
  (process.env.A3D_DISABLE_SYSTEM_WEBGPU_BROWSER === "true" ? undefined : existsSync(defaultMacChromePath) ? defaultMacChromePath : undefined);
const chromiumLaunchOptions = chromiumExecutablePath
  ? {
      executablePath: chromiumExecutablePath,
      args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"],
    }
  : undefined;

export default defineConfig({
  testDir: ".",
  testMatch: ["tests/browser/**/*.spec.ts", "tests/visual/**/*.spec.ts"],
  testIgnore: ["release-artifacts/**"],
  timeout: 60_000,
  workers: 1,
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 800, height: 600 },
    launchOptions: chromiumLaunchOptions,
  },
  reporter: [["list"], ["json", { outputFile: "tests/reports/browser.json" }]]
});
