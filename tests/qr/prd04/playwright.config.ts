import { defineConfig } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import baseConfig from "../../../playwright.config";

/**
 * Lane prd04 playwright config: Chromium specs under tests/qr/prd04/browser.
 * PRD04_CHROMIUM_ARGS (space-separated) appends GPU args — the lane workflow
 * passes `--use-angle=metal --enable-gpu --ignore-gpu-blocklist` on macos-14.
 */
const extraArgs = (process.env.PRD04_CHROMIUM_ARGS ?? "").split(" ").filter(Boolean);
const baseLaunch = (baseConfig.use?.launchOptions ?? {}) as { args?: string[] };

/**
 * Playwright resolves a relative custom reporter path against the directory of
 * the config file that declares it, and this config lives in tests/qr/prd04.
 * The root config's `./tests/support/noSkipInCiReporter.ts` (P-22) therefore
 * failed to load ("Cannot find module") and aborted every lane browser/GPU run
 * (main run 38134912113). Re-anchor relative reporter paths at the repo root,
 * keeping the same reporters.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
type ReporterEntry = string | readonly [string, ...unknown[]];
const reporter = (Array.isArray(baseConfig.reporter) ? (baseConfig.reporter as ReporterEntry[]) : []).map((entry) => {
  const [name, ...rest] = typeof entry === "string" ? [entry] : entry;
  const anchored = name.startsWith("./") || name.startsWith("../") ? resolve(REPO_ROOT, name) : name;
  return [anchored, ...rest];
}) as NonNullable<Parameters<typeof defineConfig>[0]["reporter"]>;

export default defineConfig({
  ...baseConfig,
  ...(Array.isArray(baseConfig.reporter) ? { reporter } : {}),
  testDir: ".",
  testMatch: ["browser/**/*.spec.ts"],
  timeout: 180_000,
  use: {
    ...baseConfig.use,
    launchOptions: {
      ...baseLaunch,
      args: [...(baseLaunch.args ?? []), ...extraArgs]
    }
  }
});
