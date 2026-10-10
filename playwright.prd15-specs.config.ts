// Lane 15 specs Playwright config (PRD-15 §15-SPECS). Projects:
// chromium (system Chrome on macos-14 via the --use-angle=metal wrapper
// pattern, picked up through A3D_WEBGPU_BROWSER_EXECUTABLE), webkit, firefox.
// testMatch covers tests/qr/prd15/browser/*.spec.ts only — these are the
// 15-SPECS acceptance specs (renderer single-path, mount-failure overlay,
// lean-shim removal, packed consumer smoke), not the lane's unit tree.

import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const defaultMacChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromiumExecutablePath = process.env.A3D_WEBGPU_BROWSER_EXECUTABLE ||
  (process.env.A3D_DISABLE_SYSTEM_WEBGPU_BROWSER === "true" ? undefined : existsSync(defaultMacChromePath) ? defaultMacChromePath : undefined);
const chromiumLaunchOptions = {
  ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
  args: [
    ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
    "--enable-unsafe-webgpu",
    "--ignore-gpu-blocklist",
  ],
};

export default defineConfig({
  testDir: ".",
  testMatch: ["tests/qr/prd15/browser/**/*.spec.ts"],
  testIgnore: ["release-artifacts/**"],
  timeout: 120_000,
  workers: 2,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", launchOptions: chromiumLaunchOptions },
    },
    { name: "webkit", use: { browserName: "webkit" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
  reporter: [["list"], ["json", { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? "tests/reports/prd15-specs.json" }]]
});
