/**
 * Lane prd02 playwright config (PRD-02 §15): the root testMatch does not cover
 * tests/qr/**, so lane browser specs run via
 * `playwright test --config tests/qr/prd02/playwright.prd02.config.ts`.
 * Reuses the root launch options (system Chrome / WebGPU flags) unchanged,
 * unless `QR_PRD02_CHROME_ARGS` is set (the lighting-quality `gpu` job:
 * `--headless=new --use-angle=vulkan ...`). Then those args replace the
 * root ones, and Playwright's own headless flag is dropped when the args
 * carry `--headless=...`.
 */
import { defineConfig, type ReporterDescription } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import rootConfig from "../../../playwright.config";

const gpuArgs = (process.env.QR_PRD02_CHROME_ARGS ?? "").split(/\s+/).filter(Boolean);
const rootUse = rootConfig.use ?? {};

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
/** Root reporters other than the built-ins this config replaces, with relative paths anchored at the repo root. */
const rootCustomReporters: ReporterDescription[] = (Array.isArray(rootConfig.reporter) ? (rootConfig.reporter as ReporterDescription[]) : [])
  .filter(([name]) => name.startsWith("./") || name.startsWith("../"))
  .map(([name, options]) => (options === undefined ? [resolve(REPO_ROOT, name)] : [resolve(REPO_ROOT, name), options]));

export default defineConfig({
  ...rootConfig,
  testDir: "../../..",
  testMatch: ["tests/qr/prd02/browser/**/*.spec.ts"],
  ...(gpuArgs.length > 0
    ? {
        use: {
          ...rootUse,
          headless: !gpuArgs.some((arg) => arg.startsWith("--headless")),
          launchOptions: { ...rootUse.launchOptions, args: gpuArgs }
        }
      }
    : {}),
  // outputFile resolves against this config's directory: "../../reports" is
  // the repo-root tests/reports/ path the workflow artifacts upload (a bare
  // "tests/reports/..." landed in tests/qr/prd02/tests/reports/).
  // The root's custom reporters (P-22 `./tests/support/noSkipInCiReporter.ts`)
  // are kept, re-anchored at the repo root: Playwright resolves a relative
  // reporter path against this config's directory (as lane 04 did in #1151).
  reporter: [
    ["list"],
    ["json", { outputFile: "../../reports/qr-prd02-browser.json" }],
    ...rootCustomReporters
  ]
});
