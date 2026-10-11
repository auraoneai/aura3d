/**
 * QR lane-01 perf job specs (PRD-01 §16.3, row 01-S13). Same built harness
 * and server as playwright.config.ts; `perf/**` only, one worker, and
 * `--enable-precise-memory-info` so `performance.memory` is not quantized
 * (the heap ≤ 16 KB/frame budget needs byte resolution).
 * Chromium on GitHub macos-14 (the only GPU path).
 */

import { defineConfig } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: here,
  testMatch: ["perf/**/*.spec.ts"],
  timeout: 300_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5299",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ["--ignore-gpu-blocklist", "--enable-precise-memory-info"] }
  },
  webServer: {
    command: `node ${resolve(here, "serve.mjs")} --root ${resolve(here, "harness/dist")} --port 5299`,
    url: "http://127.0.0.1:5299/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  reporter: [["list"], ["json", { outputFile: resolve(here, "out/perf.json") }]]
});
