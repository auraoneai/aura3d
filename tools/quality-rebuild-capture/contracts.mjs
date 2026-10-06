/**
 * C-33 — capture step plugin contract (CONTRACTS.md). Provider: PRD 12.
 * JSDoc-typed; `capture-games.mjs` loads step plugins from `./steps/*.mjs` (PR 0b).
 *
 * pnpm quality:capture --scenes <ids|all> [--flags <qr-list>|all] [--out <dir>]   (benchmarks)
 * pnpm quality:games  --routes <ids|all> [--flags <qr-list>|all] [--strict] [--pr-build]  (games)
 * Both dispatch .github/workflows/quality-rebuild-capture.yml (workflow_call +
 * workflow_dispatch, input `qr_flags`, input `strict`).
 */

/**
 * @typedef {Object} CaptureStepPlugin
 * @property {string} name
 * @property {string} owner
 * @property {(page: unknown, step: Readonly<Record<string, unknown>>, ctx: { outDir: string, route: string, log: (m: string) => void }) => Promise<{ files: readonly string[], data?: unknown }>} run
 */

// steps/burst.mjs (PRD 06): { burst: { frames: number; intervalMs: number; region: "character" | "full" } }
// steps/strip.mjs (PRD 12): { strip: { frames: 12; intervalMs: number } }
// steps/webm.mjs  (PRD 12): { webm: { seconds: 5 } }

/** @type {Map<string, CaptureStepPlugin>} */
const stepPlugins = new Map();

/**
 * Register a capture step plugin. Duplicate names throw.
 * @param {CaptureStepPlugin} plugin
 */
export function registerCaptureStepPlugin(plugin) {
  if (stepPlugins.has(plugin.name)) throw new Error(`CAPTURE_STEP_DUPLICATE:${plugin.name}`);
  stepPlugins.set(plugin.name, plugin);
}

/**
 * Look up a step plugin by step key (the first key of the step object).
 * @param {string} name
 * @returns {CaptureStepPlugin | undefined}
 */
export function captureStepPluginFor(name) {
  return stepPlugins.get(name);
}

/** @returns {readonly string[]} registered step plugin names */
export function captureStepPluginNames() {
  return [...stepPlugins.keys()].sort();
}
