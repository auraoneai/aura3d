// Lane 06 animation-matrix Playwright config (PRD-06 T0.0, CONTRACTS.md §6).
// Projects: chromium (Chrome channel via the --use-angle=metal wrapper script
// pattern of remote-browser-301.yml:128-133, picked up through
// A3D_WEBGPU_BROWSER_EXECUTABLE), webkit and firefox. testMatch covers the
// PRD-06 spec tree (§16) plus the animated-character baseline spec that T0.0
// requires to run green on all three projects before P0 browser work merges.

import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const defaultMacChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromiumExecutablePath = process.env.A3D_WEBGPU_BROWSER_EXECUTABLE ||
  (process.env.A3D_DISABLE_SYSTEM_WEBGPU_BROWSER === "true" ? undefined : existsSync(defaultMacChromePath) ? defaultMacChromePath : undefined);
const chromiumLaunchOptions = {
  ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
  // `--use-angle=metal` is a macOS-only switch (the lane workflow runs the
  // browser matrix on macos-14); on Linux it leaves the GL context dead and
  // every captured frame renders black. Keep the WebGPU flags on all hosts.
  args: [
    ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
    "--enable-unsafe-webgpu",
    "--ignore-gpu-blocklist",
  ],
};

export default defineConfig({
  testDir: ".",
  testMatch: ["tests/qr/prd06/**/*.spec.ts", "tests/browser/animated-character-browser.spec.ts"],
  testIgnore: ["release-artifacts/**"],
  timeout: 60_000,
  workers: 2,
  use: {
    headless: true,
    viewport: { width: 800, height: 600 },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", launchOptions: chromiumLaunchOptions },
    },
    { name: "webkit", use: { browserName: "webkit" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
  reporter: [["list"], ["json", { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? "tests/reports/prd06-animation-matrix.json" }]]
});
