import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * PRD-2 WP-6 exposure attribution. Mounts the bench scenes (cube, PBR viewer, forest) for both libraries, as written and with one term
 * changed at a time, and prints mean luma (640x360, software WebGL2) per variant. Nothing is asserted: the rows are the evidence for
 * evidence/exposure-parity/README.md, and the CPU model is tests/unit/rendering/exposure-cases.test.ts.
 *
 * EXPOSURE_CASES_ONLY=<comma list of variant ids> narrows a run; EXPOSURE_CASES_GROUP=cube|pbr|forest picks a group.
 */
const reportDir = process.env.EXPOSURE_REPORT_DIR ?? "tests/reports/exposure-cases";
const GLB = readFileSync(new URL("../../fixtures/threejs-parity/assets/physics/cesium-milk-truck.glb", import.meta.url));
const HDR = readFileSync(new URL("../../fixtures/environment-corpus/hdri/studio_small_08_1k.hdr", import.meta.url));
const SHA = createHash("sha256").update(GLB).digest("hex");

/** 64x32 flat RGBE image of constant radiance 0.5 (mantissa 128, exponent 128): a uniform environment, so lobes and orientation drop out. */
function uniformHdr(): Buffer {
  const header = Buffer.from("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 32 +X 64\n", "latin1");
  const pixels = Buffer.alloc(64 * 32 * 4);
  for (let i = 0; i < pixels.length; i += 4) { pixels[i] = 128; pixels[i + 1] = 128; pixels[i + 2] = 128; pixels[i + 3] = 128; }
  return Buffer.concat([header, pixels]);
}
const UNIFORM_HDR = uniformHdr();

interface Variant { readonly id: string; readonly frames: number; readonly group: "cube" | "pbr" | "forest" }
const variants: Variant[] = [
  // Cube: ambient 1, #d86a3a. bench = as written; cube:three-aces adds the tone map three's bench source leaves off.
  ...["bench:baseline:aura", "bench:baseline:three", "cube:three-aces", "cube:#000000:default", "cube:#000000:none", "cube:default:none"].map((id) => ({ id, frames: 24, group: "cube" as const })),
  // PBR viewer: pbr:<lib>:<sun>:<environment intensity>:<bloom|nobloom>. 2.5 / 1 is the Aura bench source, 1.1 / 0.7 the three one.
  ...["aura:2.5:1:bloom", "three:1.1:0.7:bloom", "aura:1.1:0.7:bloom", "aura:1.1:0.7:nobloom", "three:1.1:0.7:nobloom", "aura:0:0.7:nobloom", "three:0:0.7:nobloom", "aura:1.1:0:nobloom", "three:1.1:0:nobloom", "aura:2.5:1:nobloom", "aura:0:1:nobloom", "aura:2.5:0:nobloom",
    // Uniform environment (constant radiance 0.5, no sun): isolates the IBL unit from the HDRI's lobes and orientation.
    "aura:0:0.7:nobloom:uniform", "three:0:0.7:nobloom:uniform", "aura:0:1:nobloom:uniform", "three:0:1:nobloom:uniform",
    // Ground roughness sweep under the real HDRI, environment only: separates the diffuse term from the specular one.
    "aura:0:0.7:nobloom:g1", "three:0:0.7:nobloom:g1", "aura:0:0.7:nobloom:g0.5", "three:0:0.7:nobloom:g0.5",
    // The bench's bare { type, format, url } texture is not an asset ref; the same scene with a real ref (defineAuraAssets) loads the HDRI.
    "aura:2.5:1:bloom:ref", "aura:1.1:0.7:bloom:ref", "aura:1.1:0.7:nobloom:ref", "aura:0:0.7:nobloom:ref", "aura:0:1:nobloom:ref", "aura:1.1:0:nobloom:ref",
    "aura:0:0.7:nobloom:uniform:ref", "aura:0:0.7:nobloom:g1:ref", "aura:0:0.7:nobloom:g0.5:ref"]
    .map((id) => ({ id: `pbr:${id}`, frames: 24, group: "pbr" as const })),
  // Forest: forest:<lib>:<colour reading>:<shadow|noshadow>:<fog|nofog>. "css" reads hsl() numbers as sRGB, "linear" as three's linear working space.
  ...["bench:forest:aura", "bench:forest:three", "forest:aura:linear:shadow:fog", "forest:three:css:shadow:fog", "forest:aura:css:shadow:fog", "forest:three:linear:shadow:fog",
    "forest:aura:linear:noshadow:fog", "forest:three:linear:noshadow:fog", "forest:aura:linear:shadow:nofog", "forest:three:linear:shadow:nofog"]
    .map((id) => ({ id, frames: 4, group: "forest" as const }))
];

test.describe("exposure attribution (WP-6)", () => {
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); mkdirSync(resolve(reportDir), { recursive: true }); });
  test.afterAll(async () => { await server.close(); });

  const only = process.env.EXPOSURE_CASES_ONLY?.split(",");
  const group = process.env.EXPOSURE_CASES_GROUP;
  for (const v of variants) {
    if (only && !only.includes(v.id)) continue;
    if (group && v.group !== group) continue;
    test(v.id, async ({ page }) => {
      const problems: string[] = [];
      page.on("console", (m) => { if ((m.type() === "warning" || m.type() === "error") && !/GPU stall due to ReadPixels/.test(m.text())) problems.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
      page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
      await page.route("**/model.glb", (route) => route.fulfill({ status: 200, contentType: "model/gltf-binary", body: GLB }));
      await page.route("**/env.hdr", (route) => route.fulfill({ status: 200, contentType: "application/octet-stream", body: v.id.includes(":uniform") ? UNIFORM_HDR : HDR }));
      await page.goto(`${server.origin}/tests/browser/exposure-cases-harness.html?v=${encodeURIComponent(v.id)}&sha=${SHA}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => {
        const b = (window as { __BENCH__?: { ready?: boolean; errors?: string[] } }).__BENCH__;
        return Boolean(b && (b.ready || (b.errors && b.errors.length > 0)));
      }, undefined, { timeout: 600_000 });
      const result = await page.evaluate(async (n) => {
        const api = (window as unknown as { __BENCH__: { ready: boolean; frame(dt: number): void; state(): unknown; capture(dt: number): { mean: number; std: number; luma: number[]; jpeg: string }; errors: string[] } }).__BENCH__;
        if (!api.ready) return { mean: -1, std: -1, jpeg: "", errors: api.errors, regions: null as null | Record<string, number>, state: null as unknown };
        for (let i = 0; i < n; i += 1) api.frame(1 / 60);
        // A real HDRI upgrades asynchronously (decode, cube, prefilter): keep stepping until the app reports it pixel-backed, 150 more frames at most.
        const hdriPending = (): boolean => {
          const env = (api.state() as { environment?: { hdriStatus?: string } } | null)?.environment;
          return env?.hdriStatus === "pending";
        };
        for (let i = 0; i < 150 && hdriPending(); i += 1) { api.frame(1 / 60); await new Promise((r) => setTimeout(r, 100)); }
        const c = api.capture(1 / 60);
        const W = 640, H = 360;
        const region = (x0: number, y0: number, x1: number, y1: number): number => {
          let s = 0, k = 0;
          for (let y = Math.floor(y0 * H); y < Math.floor(y1 * H); y += 1) for (let x = Math.floor(x0 * W); x < Math.floor(x1 * W); x += 1) { s += c.luma[y * W + x]!; k += 1; }
          return k ? s / k : 0;
        };
        // Coarse luma map: centre block, top strip (sky / background), bottom strip (ground), top-left corner.
        const regions = { centre: region(0.3, 0.3, 0.7, 0.7), top: region(0, 0, 1, 0.12), bottom: region(0, 0.88, 1, 1), corner: region(0, 0, 0.04, 0.06) };
        return { mean: c.mean, std: c.std, jpeg: c.jpeg, errors: api.errors, regions, state: api.state() };
      }, v.frames);
      const safe = v.id.replace(/[^A-Za-z0-9._-]+/g, "_");
      if (result.jpeg) writeFileSync(resolve(reportDir, `${safe}.jpg`), Buffer.from(result.jpeg.replace(/^data:image\/jpeg;base64,/, ""), "base64"));
      console.log(`EXPOSURE_CASE ${JSON.stringify({ id: v.id, mean: result.mean, std: result.std, regions: result.regions, state: result.state, problems, errors: result.errors })}`);
      // The remote artifact upload is not always available; the frame also travels in the log so it can be decoded locally.
      if (result.jpeg) console.log(`EXPOSURE_CASE_FRAME ${v.id} ${result.jpeg.replace(/^data:image\/jpeg;base64,/, "")}`);
    });
  }
});
