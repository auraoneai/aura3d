/**
 * PRD-15 §15-SPECS — `pack-consumer-smoke.spec.ts`.
 *
 * Consumer-path smoke: mount the lit product-style scene through the public
 * `@aura3d/engine` surface exactly as a packed app consumer does (no deep
 * imports — the same specifier a vite-preview build of product-viewer
 * resolves), assert a non-blank frame and zero console errors.
 *
 * NOTE (acceptance intent): the packed-product-viewer judgement is that the
 * consumer surface is clean — the lane workflow first runs `pnpm build:raw`
 * so the workspace dists this dev-server serves match what a packed app
 * ships; a real `vite preview` spin-up isn't expressible inside a spec.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { startPrd15DevServer as startExampleDevServer, type ExampleDevServer } from "../dev-server";
import { loadProbe, probeFrame, type Prd15ProbePayload } from "./probe";

const FLAGS = (process.env.PRD15_FLAGS ?? "none").split(",").filter(Boolean);
const url = () =>
  `/tests/qr/prd15/harness/prd15-mount.html?mode=pack&flags=${encodeURIComponent(FLAGS.join(","))}&pixels=1`;

test.describe("PRD-15 pack consumer smoke", () => {
  let server: ExampleDevServer;
  const probes: Record<string, unknown>[] = [];
  const consoleErrors: string[] = [];

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    mkdirSync(resolve("tests/reports/prd15"), { recursive: true });
    writeFileSync(
      resolve("tests/reports/prd15/pack-consumer-smoke.json"),
      `${JSON.stringify({ spec: "pack-consumer-smoke", flags: FLAGS, probes, consoleErrors }, null, 2)}\n`
    );
    await server.close();
  });

  test("consumer mount: non-blank frame, zero console errors", async ({ page }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
    const payload: Prd15ProbePayload = await loadProbe(page, `${server.origin}${url()}`);
    probes.push({ test: "consumer-smoke", drawCalls: payload.drawCalls });
    expect(payload.mountFailed).toBe(false);
    const frame = probeFrame(payload);
    const lit = frame.pixels.filter((_, i) => i % 4 !== 3).reduce((max, v) => Math.max(max, v), 0);
    expect(lit, "packed consumer frame is non-blank").toBeGreaterThan(40);
    expect(consoleErrors.filter((e) => !/favicon/i.test(e)), "zero console errors").toHaveLength(0);
  });
});
