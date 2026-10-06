/**
 * Lane prd02 browser conformance — mip-mapped env bindings (PRD-02 Phase 3).
 * Runs on macos-14 in lighting-quality.yml once the lane harness lands.
 * Asserts the roughness→lod curve is identical CPU↔chunk, the neutral
 * probe's specular cube is mip-mapped, and A3DEnvironment binds it with the
 * right sampler/mip count.
 */
import { expect, test } from "@playwright/test";

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
