import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

/**
 * Quality-gate Playwright config (PRD-12 T3.9). Runs the three analytic pixel
 * specs — tests/visual/rendering-pixels.spec.ts, shadow-cascade-motion.spec.ts,
 * skinned-animation-pixels.spec.ts — unchanged on macos-14 inside
 * quality-gate.yml. Global setup fails the run when the GPU string matches a
 * software rasterizer, the same guard --strict captures use.
 */
const defaultMacChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromiumExecutablePath = process.env.A3D_WEBGPU_BROWSER_EXECUTABLE ||
  (existsSync(defaultMacChromePath) ? defaultMacChromePath : undefined);

export default defineConfig({
  testDir: ".",
  testMatch: [
    "tests/visual/rendering-pixels.spec.ts",
    "tests/visual/shadow-cascade-motion.spec.ts",
    "tests/visual/skinned-animation-pixels.spec.ts",
  ],
  timeout: 60_000,
  workers: 1,
  globalSetup: "./tests/quality-gate.global-setup.ts",
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 800, height: 600 },
    launchOptions: {
      ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
      args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
    },
  },
  reporter: [["list"], ["json", { outputFile: "tests/reports/quality-gate-pixels.json" }]],
});
