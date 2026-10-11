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
import { defineConfig } from "@playwright/test";
import rootConfig from "../../../playwright.config";

const gpuArgs = (process.env.QR_PRD02_CHROME_ARGS ?? "").split(/\s+/).filter(Boolean);
const rootUse = rootConfig.use ?? {};

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
  reporter: [["list"], ["json", { outputFile: "../../reports/qr-prd02-browser.json" }]]
});
