/**
 * Lane prd02 browser conformance — mip-mapped env bindings (PRD-02 Phase 3).
 * Runs on macos-14 in lighting-quality.yml once the lane harness lands.
 * Asserts the roughness→lod curve is identical CPU↔chunk, the neutral
 * probe's specular cube is mip-mapped, A3DEnvironment binds it with the
 * right sampler/mip count, and (02-S10) the prd02-06 sweep pixels.
 */
import { expect, test } from "@playwright/test";
import { emptyMask, fillDisc, projectDisc, type PixelBuffer } from "../../../../benchmarks/quality-rebuild/scenes/prd02/masks";
import { getPrd02Spec } from "../../../../benchmarks/quality-rebuild/scenes/prd02/specs";
import { hfEnergy } from "../metrics/regionMetrics";
import { captureLaneScene, startLaneServer, type LaneServer } from "./lane-page";

test("a3dRoughnessToLod chunk formula matches workers/cpuPrefilter exactly", async () => {
  const { roughnessToLod } = await import("../../../../packages/rendering/src/environment/workers/cpuPrefilter.js");
  const { shaderChunk } = await import("../../../../packages/rendering/src/contracts/index.js");
  await import("../../../../packages/rendering/src/lanes/prd02.js");
  const chunk = shaderChunk("a3d_prd02_lighting_ibl");
  expect(chunk?.glsl).toContain("(u_envMipCount - 1.0) * r * (2.0 - r)");
  const jsEval = (r: number, n: number) => (n - 1) * Math.min(Math.max(r, 0), 1) * (2 - Math.min(Math.max(r, 0), 1));
  for (const mipCount of [1, 5, 7]) {
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      expect(roughnessToLod(r, mipCount)).toBeCloseTo(jsEval(r, mipCount), 10);
    }
  }
  // monotonic, hits the roughest mip at r=1
  expect(roughnessToLod(1, 5)).toBe(4);
  expect(roughnessToLod(0, 5)).toBe(0);
});

test("neutral probe specular cube binds mip-mapped linear via A3DEnvironment", async () => {
  const { MockRenderDevice } = await import("../../../../packages/rendering/src/RenderDevice.js");
  const { createEnvironmentProbeFactory } = await import("../../../../packages/rendering/src/environment/EnvironmentProbeFactory.js");
  const { packA3DEnvironmentUniforms } = await import("../../../../packages/rendering/src/environment/EnvUniforms.js");
  const device = new MockRenderDevice();
  const factory = createEnvironmentProbeFactory(device);
  const probe = factory.neutral("medium");
  expect(probe.specularCube.dimension).toBe("cube");
  expect(probe.mipCount).toBeGreaterThan(1);
  expect(probe.specularCube.mipLevels.length).toBe(0); // levels live under cubeFaces
  expect(probe.specularCube.cubeFaces.length).toBe(6);
  for (const face of probe.specularCube.cubeFaces) {
    expect(face.mipLevels.length).toBe(probe.mipCount);
  }
  const { uniforms, shBound } = packA3DEnvironmentUniforms({ probe });
  expect(shBound).toBe(1);
  expect(uniforms.get("u_envMipCount")).toBe(probe.mipCount);
  const binding = uniforms.get("u_envSpecular") as { texture: unknown; sampler: { minFilter: string } };
  expect(binding.texture).toBe(probe.specularCube);
  expect(binding.sampler.minFilter).toBe("linear-mipmap-linear");
});

// ---------------------------------------------------------------------------
// 02-S10 — pixel test on prd02-06 (metal roughness sweep) with `lighting`:
// specular high-frequency energy inside each metal sphere must fall strictly
// with roughness, the mirror sphere carries ≥ 4× the HF energy of the r=0.8
// sphere, and the flag-off render must NOT meet the criterion (discrimination
// control: the legacy path flattens the sweep).
// ---------------------------------------------------------------------------

const SWEEP_SCENE = "prd02-06-metal-roughness-sweep";
/** Inner fraction of each projected sphere disc: keeps silhouette edges out of the HF sum. */
const INNER_DISC = 0.6;

function metalSphereHf(pixels: PixelBuffer): { roughness: number; hf: number }[] {
  const spec = getPrd02Spec(SWEEP_SCENE);
  const size = { width: pixels.width, height: pixels.height };
  const rows: { roughness: number; hf: number }[] = [];
  for (const object of spec.objects) {
    if (object.kind !== "primitive" || object.material.metalness < 1) continue;
    const radius = 0.5 * Math.max(...object.size);
    const disc = projectDisc(spec.camera, size, object.position, radius);
    if (!disc) throw new Error(`${object.name} projects behind the camera`);
    const mask = emptyMask(size);
    fillDisc(mask, size, disc.x, disc.y, disc.r * INNER_DISC);
    rows.push({ roughness: object.material.roughness, hf: hfEnergy(pixels, mask) });
  }
  return rows.sort((a, b) => a.roughness - b.roughness);
}

function sweepCriterion(rows: readonly { roughness: number; hf: number }[]): { monotonic: boolean; ratio: number } {
  const monotonic = rows.every((row, index) => index === 0 || row.hf < rows[index - 1]!.hf);
  const smooth = rows[0]!;
  const rough = rows.find((row) => Math.abs(row.roughness - 0.8) < 1e-6);
  if (!rough) throw new Error("prd02-06 has no r=0.8 metal sphere");
  return { monotonic, ratio: rough.hf > 0 ? smooth.hf / rough.hf : Number.POSITIVE_INFINITY };
}

test.describe("02-S10 IBL roughness sweep pixels (prd02-06)", () => {
  let server: LaneServer;
  test.beforeAll(async () => {
    server = await startLaneServer();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("lighting on: HF energy strictly decreasing and mirror/r0.8 >= 4x", async ({ page }) => {
    test.setTimeout(300_000);
    const { pixels } = await captureLaneScene(page, server, { scene: SWEEP_SCENE, flags: "lighting" });
    const rows = metalSphereHf(pixels);
    expect(rows.length).toBe(6);
    const { monotonic, ratio } = sweepCriterion(rows);
    expect(monotonic, `HF by roughness: ${JSON.stringify(rows)}`).toBe(true);
    expect(ratio, `HF by roughness: ${JSON.stringify(rows)}`).toBeGreaterThanOrEqual(4);
  });

  test("flag off (control): the legacy render does not meet the sweep criterion", async ({ page }) => {
    test.setTimeout(300_000);
    const { pixels } = await captureLaneScene(page, server, { scene: SWEEP_SCENE, flags: "none" });
    const rows = metalSphereHf(pixels);
    const { monotonic, ratio } = sweepCriterion(rows);
    expect(monotonic && ratio >= 4, `flag-off HF by roughness: ${JSON.stringify(rows)}`).toBe(false);
  });
});
