/**
 * PRD-15 §15-SPECS — `renderer-single-path.spec.ts`.
 *
 * One mount, one renderer: the lit scene mounts once on webgl2 with an empty
 * degradation list and draws non-blank pixels, and no served rendering module
 * references the removed `u_lightDirection` uniform (T4.x/T5.x surface). Runs
 * on chromium/webkit/firefox via playwright.prd15-specs.config.ts.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startPrd15DevServer as startExampleDevServer, type ExampleDevServer } from "../dev-server";
import { loadProbe, probeFrame, type Prd15ProbePayload } from "./probe";

const FLAGS = (process.env.PRD15_FLAGS ?? "none").split(",").filter(Boolean);
const url = (flags: readonly string[], extra = "") =>
  `/tests/qr/prd15/harness/prd15-mount.html?mode=lit&flags=${encodeURIComponent(flags.join(","))}&pixels=1${extra}`;

test.describe("PRD-15 renderer single-path (webgl2)", () => {
  let server: ExampleDevServer;
  const probes: Record<string, unknown>[] = [];

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    mkdirSync(resolve("tests/reports/prd15"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/prd15/renderer-single-path.json"),
      `${JSON.stringify({ spec: "renderer-single-path", flags: FLAGS, probes }, null, 2)}\n`
    );
    await server.close();
  });

  test("single mount, empty degradations, non-blank frame", async ({ page }) => {
    const payload: Prd15ProbePayload = await loadProbe(page, `${server.origin}${url(FLAGS)}`);
    probes.push({ test: "single-path", payload });
    expect(payload.mountFailed).toBe(false);
    expect(payload.backend).toBe("webgl2");
    expect(payload.degradations ?? [], "no degradations on a clean mount").toHaveLength(0);
    const frame = probeFrame(payload);
    const lit = frame.pixels.filter((_, i) => i % 4 !== 3).reduce((max, v) => Math.max(max, v), 0);
    expect(lit, "frame has lit pixels (non-blank render)").toBeGreaterThan(40);
  });

  test("no u_lightDirection in served rendering modules", async ({ page }) => {
    const payload: Prd15ProbePayload = await loadProbe(page, `${server.origin}${url(FLAGS)}`);
    probes.push({ test: "u-light-direction", payload });
    const scan = payload.shaderScan!;
    expect(scan.files, "rendering modules were served and scanned").toBeGreaterThan(0);
    expect(scan.hits, `u_lightDirection found in served modules: ${scan.hits.join(",")}`).toHaveLength(0);
  });
});
