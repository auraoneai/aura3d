/**
 * WP-9: in the default (4.2.0) shadow fit, dense instanced casters (1,024+ instances in one node that the engine gave an instanced
 * shadow proxy: builtin primitive, qr core path) draw their depth through the per-instance attribute buffer, one draw per node per
 * cascade (the forest benchmark was 282 draws per cascade at 64 instances each). Nodes below the threshold, and dense nodes with no
 * proxy (GLB or model instancing, custom geometry, boxes), keep the uniform-array batches, and `__A3D_DENSE_DEPTH_DRAWS__ = "off"`
 * restores them for the proxied ones.
 */
import { afterEach, describe, expect, it } from "vitest";
import "../../../../packages/rendering/src/lanes/prd02";
import "../../../../packages/rendering/src/lanes/prd01";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { identityMat4 } from "@aura3d/scene";
import { Renderer } from "../../../../packages/rendering/src/Renderer";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../../packages/rendering/src/PBRMaterial";
import type { DrawCommand } from "../../../../packages/rendering/src/RenderDevice";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });

function sourceWith(count: number, withProxy = true) {
  const transforms = new Float32Array(count * 16);
  for (let i = 0; i < count; i += 1) {
    transforms.set(Float32Array.from(identityMat4()), i * 16);
    transforms[i * 16 + 12] = (i % 20) * 2 - 20;
    transforms[i * 16 + 14] = Math.floor(i / 20) * 2 - 10;
    transforms[i * 16 + 13] = 0.5;
  }
  return {
    renderItems: [
      { geometry: Geometry.litCube(1), material: new PBRMaterial({ name: "tree" }), modelMatrix: Float32Array.from(identityMat4()), instanceTransforms: transforms, label: "forest", castShadow: true, receiveShadow: true, ...(withProxy ? { shadowGeometry: Geometry.litCube(1) } : {}) },
      { geometry: Geometry.litPlane(), material: new PBRMaterial({ name: "lit" }), modelMatrix: Float32Array.from([40, 0, 0, 0, 0, 1, 0, 0, 0, 0, 40, 0, 0, 0, 0, 1]), label: "floor", castShadow: false, receiveShadow: true }
    ],
    collectedLights: [{ kind: "directional", color: [1, 1, 1], intensity: 3, position: [3, 10, 2], direction: [-0.3, -1, -0.2], range: 0, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 0xffffffff, source: { id: "sun", name: "sun" } }],
    shadow: { enabled: true, size: 512, cascadeCount: 1, prd02Shadows: { enabled: true, mapSize: 512, cascades: 1, maxDistance: 60, splitLambda: 0.6, filter: "pcf", strength: 1, bias: 0, normalBias: 1.5 } }
  };
}

async function casterDraws(count: number, withProxy = true): Promise<DrawCommand[]> {
  const renderer = await Renderer.create({ backend: "mock", width: 320, height: 180, qrFlags: FLAGS_ON });
  try {
    renderer.render(sourceWith(count, withProxy) as never, { viewProjectionMatrix: Float32Array.from(identityMat4()), viewMatrix: Float32Array.from(identityMat4()) } as never);
    const draws = (renderer.device as unknown as { drawCommands: DrawCommand[] }).drawCommands;
    return draws.filter((d) => /^forest:\d+$/.test(d.label ?? ""));
  } finally {
    renderer.dispose();
  }
}

afterEach(() => { delete (globalThis as { __A3D_DENSE_DEPTH_DRAWS__?: string }).__A3D_DENSE_DEPTH_DRAWS__; });

describe("dense instanced casters in the default shadow fit", () => {
  it("2,000 instances: one depth draw through instance attributes (was 32)", async () => {
    const draws = await casterDraws(2000);
    expect(draws).toHaveLength(1);
    expect(draws[0]!.instanceCount).toBe(2000);
    expect((draws[0]!.uniforms as ReadonlyMap<string, unknown>).get("u_instanceAttributeMode")).toBe(1);
  });

  it("500 instances keep the 4.2.0 uniform-array batches (ceil(500 / 64) = 8 draws)", async () => {
    const draws = await casterDraws(500);
    expect(draws).toHaveLength(8);
    expect(draws.every((d) => d.instanceAttributes === undefined)).toBe(true);
  });

  it("2,000 instances without a shadow proxy keep the 4.2.0 uniform-array batches (32 draws, no vertex attributes)", async () => {
    const draws = await casterDraws(2000, false);
    expect(draws).toHaveLength(32);
    expect(draws.every((d) => d.instanceAttributes === undefined)).toBe(true);
  });

  it("the opt-out restores uniform-array batches for dense nodes", async () => {
    (globalThis as { __A3D_DENSE_DEPTH_DRAWS__?: string }).__A3D_DENSE_DEPTH_DRAWS__ = "off";
    const draws = await casterDraws(2000);
    expect(draws).toHaveLength(32);
  });
});
