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

// GPU job (qr-prd01-core.yml `gpu`): QR_PRD01_CHROME_ARGS appends the runner's
// Chromium GPU flags (vars.QR_AZURE_GPU_CHROME_ARGS) and QR_PRD01_CHANNEL picks
// the browser channel; both unset = the macos-14 defaults below.
const extraArgs = (process.env.QR_PRD01_CHROME_ARGS ?? "").split(/\s+/).filter(Boolean);
const channel = process.env.QR_PRD01_CHANNEL || undefined;

export default defineConfig({
  testDir: here,
  testMatch: ["browser/**/*.spec.ts"],
  timeout: 120_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5299",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 720 },
    ...(channel ? { channel } : {}),
    launchOptions: { args: [...new Set(["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", ...extraArgs])] }
  },
  webServer: {
    command: `node ${resolve(here, "serve.mjs")} --root ${resolve(here, "harness/dist")} --port 5299`,
    url: "http://127.0.0.1:5299/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  reporter: [["list"], ["json", { outputFile: resolve(here, "out/browser.json") }]]
});
