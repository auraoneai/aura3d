import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIRECTORY = resolve("tests/reports/parity-compute");

interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: Record<string, unknown>;
  readonly error?: string;
}

interface ComputeLabState {
  readonly status: "loading" | "ready" | "error";
  readonly adapter: Record<string, unknown>;
  readonly results: readonly CheckResult[];
  readonly error?: string;
}

/**
 * threejs-parity SH-04 / L1-12: the public WebGPU-only `compute.*` surface on a REAL
 * GPUDevice. The lab never configures or presents a canvas, so the R-22 runner
 * limitation (Chromium + SwiftShader destroys a device at the first presented frame)
 * does not apply. Every check compares GPU read-back against the JS result exactly.
 */
test.describe("parity compute (SH-04)", () => {
  test.setTimeout(240_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_DIRECTORY, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("compute pipelines, buffers and dispatch execute correctly on a real GPUDevice", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

    await page.goto(`${server.origin}/examples/compute-lab/`, { waitUntil: "domcontentloaded" });
    const preflight = await page.evaluate(async () => {
      const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<{ isFallbackAdapter?: boolean } | null> } }).gpu;
      if (!gpu) return { ok: false, reason: "navigator.gpu missing" };
      const adapter = await gpu.requestAdapter();
      return adapter ? { ok: true, reason: "adapter", fallbackAdapter: adapter.isFallbackAdapter ?? null } : { ok: false, reason: "no adapter" };
    });
    test.info().annotations.push({ type: "webgpu-adapter", description: JSON.stringify(preflight) });
    test.skip(!preflight.ok, `runner has no WebGPU adapter: ${preflight.reason}`);

    await page.waitForFunction(
      () => {
        const lab = (window as unknown as { __AURA_COMPUTE_LAB__?: ComputeLabState }).__AURA_COMPUTE_LAB__;
        return lab?.status === "ready" || lab?.status === "error";
      },
      undefined,
      { timeout: 150_000 }
    );
    const lab = await page.evaluate(() => (window as unknown as { __AURA_COMPUTE_LAB__: ComputeLabState }).__AURA_COMPUTE_LAB__);
    writeFileSync(resolve(REPORT_DIRECTORY, "compute-lab.json"), JSON.stringify(lab, null, 2));
    // Printed so the remote run log carries the measured values (the line reporter shows no annotations).
    console.log(`[parity-compute] ${JSON.stringify(lab)}`);

    expect(lab.status, lab.error ?? "lab error").toBe("ready");
    const byName = new Map(lab.results.map((result) => [result.name, result]));
    for (const result of lab.results) expect(result.ok, `${result.name}: ${result.error ?? JSON.stringify(result.detail)}`).toBe(true);
    for (const expected of [
      "1 vector add N=65536 exact",
      "2 workgroup shared-memory reduction",
      "3a 2D dispatch writes indices (items mode)",
      "3b 3D dispatch writes indices",
      "3c write() updates a buffer between dispatches",
      "4 dispose idempotence",
      "4b validation errors surface as named ComputeError",
      "5a engine surface: compute.bind(realDevice) vector add",
      "5b createAuraApp (WebGL2) rejects with compute-requires-webgpu",
      "device stayed alive"
    ]) expect(byName.has(expected), `missing check "${expected}"`).toBe(true);

    expect(byName.get("1 vector add N=65536 exact")!.detail.invocations).toBe(65536);
    expect(byName.get("2 workgroup shared-memory reduction")!.detail.total).toBe(byName.get("2 workgroup shared-memory reduction")!.detail.expectedTotal);
    expect(byName.get("4b validation errors surface as named ComputeError")!.detail.codes).toEqual(["compute-wgsl-required", "compute-invalid-spec", "compute-invalid-spec"]);
    expect(byName.get("5b createAuraApp (WebGL2) rejects with compute-requires-webgpu")!.detail).toMatchObject({ backend: "webgl2", code: "compute-requires-webgpu", mentionsBackend: true, available: false });
    expect(errors).toEqual([]);
  });
});
