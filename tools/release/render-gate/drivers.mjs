// Pluggable capture drivers. A driver is `{ name, capture(target) -> Promise<Capture|null> }` where
// Capture = { url?, finalUrl?, events: [{kind, level, text}], png: Buffer|null } (see normalizeCapture).
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { normalizeCapture } from "./analysis.mjs";

const execFileP = promisify(execFile);
export const DEFAULT_REA = "/opt/homebrew/bin/rea";
export const REA_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** The scenario the 5.0.1 census used: 960x540, reduced motion, one settle wait, screenshot at the end. */
export function buildScenario(url, { width = 960, height = 540, settleMs = 10000, executablePath = REA_CHROME } = {}) {
  return {
    browser: { mode: "launch", executable_path: executablePath, headless: true },
    start_url: { url, query: [] },
    environment: { viewport: { width, height, device_scale_factor: 1 }, locale: "en-US", timezone: "UTC", color_scheme: "light", reduced_motion: "reduce", service_workers: "block" },
    actions: [{ step_id: "settle", action: "wait_for_timeout", duration_ms: settleMs }],
    storage: { cookies: [], local_storage: [], session_storage: [] },
    secrets: [],
    capture: {
      after_each_step: [], at_end: ["screenshot", "url"], events: ["console", "page-errors"],
      network: { request_body: false, response_body: false, header_values: false },
      limits: { max_events: 10000, max_event_allocation_bytes: 4194304, max_total_event_allocation_bytes: 16777216, max_network_transactions: 1024, max_network_body_bytes: 65536, max_network_body_allocation_bytes: 1048576, max_network_header_allocation_bytes: 1048576, max_network_metadata_allocation_bytes: 1048576 }
    }
  };
}

/** Default driver: `rea capture-browser-scenario <file> --format json --full-output` (same engine as the MCP tool). */
export function createReaCliDriver({ reaBin = DEFAULT_REA, settleMs = 10000, width = 960, height = 540, runner = execFileP, timeoutMs = 120000 } = {}) {
  return {
    name: "rea-cli",
    async capture(target) {
      const dir = mkdtempSync(join(tmpdir(), "render-gate-"));
      try {
        const file = join(dir, "scenario.json");
        writeFileSync(file, JSON.stringify(buildScenario(target.url, { width, height, settleMs })));
        let stdout;
        try { ({ stdout } = await runner(reaBin, ["capture-browser-scenario", file, "--format", "json", "--full-output"], { maxBuffer: 1 << 28, timeout: timeoutMs })); }
        catch (e) { throw new Error(`rea capture-browser-scenario ${e.killed ? `timed out after ${timeoutMs}ms` : `failed (${e.code ?? e.signal})`}: ${String(e.stderr || e.message).trim().split("\n").slice(-3).join(" | ").slice(0, 300)}`); }
        return normalizeCapture(JSON.parse(stdout));
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  };
}

/**
 * Analyze mode: read `<dir>/<id>.json` (REA envelope, normalized_result or the slim census JSON) and, when the JSON has
 * no embedded screenshot, `<dir>/<id>.png`. Nothing is launched.
 */
export function createSavedDriver(dir) {
  return {
    name: "saved",
    async capture(target) {
      const json = join(dir, `${target.id}.json`), png = join(dir, `${target.id}.png`);
      if (!existsSync(json)) return null;
      return normalizeCapture(JSON.parse(readFileSync(json, "utf8")), existsSync(png) ? readFileSync(png) : null);
    }
  };
}

/** Test/driver adapter: wraps an async function. */
export function createFunctionDriver(name, fn) { return { name, capture: fn }; }
