/**
 * QR lane-01 browser specs. Serves the built harness
 * (tests/qr/prd01/harness/dist — build with
 * `pnpm exec vite build --config tests/qr/prd01/harness/vite.config.ts`).
 * Chromium on macos-14, same runner class as the bench capture workflows.
 */

import { defineConfig } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: here,
  testMatch: ["browser/**/*.spec.ts"],
  timeout: 120_000,
  workers: 1,
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"] }
  },
  webServer: {
    command: `node ${resolve(here, "serve.mjs")} --root ${resolve(here, "harness/dist")} --port 5299`,
    url: "http://127.0.0.1:5299/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  reporter: [["list"], ["json", { outputFile: resolve(here, "out/browser.json") }]]
});
