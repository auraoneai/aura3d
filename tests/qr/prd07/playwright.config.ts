// PRD-07 lane playwright config — same launch surface as the root config, with
// testMatch pointed at tests/qr/prd07/browser/** (the root match is custodian-
// owned and fixed to tests/{browser,visual}). Run:
//   pnpm exec playwright test --config tests/qr/prd07/playwright.config.ts

import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const defaultMacChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromiumExecutablePath = process.env.A3D_WEBGPU_BROWSER_EXECUTABLE ||
  (process.env.A3D_DISABLE_SYSTEM_WEBGPU_BROWSER === "true" ? undefined : existsSync(defaultMacChromePath) ? defaultMacChromePath : undefined);
const chromiumLaunchOptions = {
  ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
  args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"],
};

export default defineConfig({
  testDir: ".",
  testMatch: ["browser/**/*.spec.ts"],
  timeout: 60_000,
  workers: 1,
  use: {
    // §19/§20 — browser engine + mobile emulation come from env so the same
    // spec set can run under Chromium (prd07-vfx.yml), WebKit/Firefox
    // (qr-prd07-browsers.yml) and a 390×844 DPR-3 touch profile.
    browserName: (process.env.PRD07_BROWSER as "chromium" | "webkit" | "firefox" | undefined) ?? "chromium",
    headless: true,
    viewport:
      process.env.PRD07_MOBILE === "1"
        ? { width: 390, height: 844 }
        : { width: 800, height: 600 },
    ...(process.env.PRD07_MOBILE === "1"
      ? { deviceScaleFactor: 3, isMobile: true, hasTouch: true }
      : {}),
    launchOptions: chromiumLaunchOptions,
  },
  reporter: [["list"], ["json", { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? "tests/reports/prd07-browser.json" }]]
});
