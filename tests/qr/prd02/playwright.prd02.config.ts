/**
 * Lane prd02 playwright config (PRD-02 §15): the root testMatch does not cover
 * tests/qr/**, so lane browser specs run via
 * `playwright test --config tests/qr/prd02/playwright.prd02.config.ts`.
 * Reuses the root launch options (system Chrome / WebGPU flags) unchanged.
 */
import { defineConfig, mergeConfig } from "@playwright/test";
import rootConfig from "../../../playwright.config";

export default mergeConfig(rootConfig, {
  testDir: "../../..",
  testMatch: ["tests/qr/prd02/browser/**/*.spec.ts"],
  reporter: [["list"], ["json", { outputFile: "tests/reports/qr-prd02-browser.json" }]]
});
