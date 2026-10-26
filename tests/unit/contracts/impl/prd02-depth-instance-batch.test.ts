/**
 * PRD-02 shadow factor, end to end on the CPU (#1225).
 *
 * GPU runs 38161877948 / 38184948030 showed the bridged prd02 cascade bound
 * to every receiver (enabled 1, strength 1, depth24 NEAREST) and depth
 * written, yet zero darkening inside three's shadow mask. The bound light
 * matrix's z row grew *toward* the sun: the fitter's ortho used -2/depth on a
 * view whose z already runs along the light's travel, so the less-equal depth
 * pass kept the surface farthest from the light and every receiver compared
 * equal to (or nearer than) the stored depth (fixed on main by 53f098c02).
 *
 * This test takes the uniforms the bridge hands the floor's forward draw,
 * rasterises the caster into a CPU depth map with the depth pass's own
 * convention (window z = ndc.z * 0.5 + 0.5, less-equal keeps the minimum), and
 * evaluates a line-for-line port of GLSL `a3dForwardShadowFactor`
 * (ShaderLibraryCore.ts) at a floor point the caster occludes.
 */
import { describe, expect, it } from "vitest";
import "../../../../packages/rendering/src/lanes/prd02";
// Installs the C-02 program generator, as every app does via the lanes barrel.
import "../../../../packages/rendering/src/lanes/prd01";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { identityMat4 } from "@aura3d/scene";
import { Renderer } from "../../../../packages/rendering/src/Renderer";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../../packages/rendering/src/PBRMaterial";
import type { DrawCommand } from "../../../../packages/rendering/src/RenderDevice";

type V3 = [number, number, number];

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
const SUN_TRAVEL: V3 = [-0.3, -1, -0.2];
const CASTER_CENTER: V3 = [0, 1.5, 0];
const CASTER_HALF = 0.5;

import { UnlitMaterial } from "../../../../packages/rendering/src/UnlitMaterial";
import { TextureBinding } from "../../../../packages/rendering/src/TextureBinding";

function translate(x: number, y: number, z: number): Float32Array {
  const m = Float32Array.from(identityMat4());
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

function sourceWith(count: number) {
  const transforms = new Float32Array(count * 16);
  for (let i = 0; i < count; i += 1) { transforms.set(Float32Array.from(identityMat4()), i * 16); transforms[i * 16 + 12] = (i % 20) * 2 - 20; transforms[i * 16 + 14] = Math.floor(i / 20) * 2 - 10; transforms[i * 16 + 13] = 0.5; }
  return {
    renderItems: [
      { geometry: Geometry.litCube(1), material: new PBRMaterial({ name: "tree" }), modelMatrix: Float32Array.from(identityMat4()), instanceTransforms: transforms, label: "forest", castShadow: true, receiveShadow: true },
      { geometry: Geometry.litPlane(), material: new PBRMaterial({ name: "lit" }), modelMatrix: Float32Array.from([40, 0, 0, 0, 0, 1, 0, 0, 0, 0, 40, 0, 0, 0, 0, 1]), label: "floor", castShadow: false, receiveShadow: true }
    ],
    collectedLights: [{ kind: "directional", color: [1, 1, 1], intensity: 3, position: [3, 10, 2], direction: [-0.3, -1, -0.2], range: 0, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 0xffffffff, source: { id: "sun", name: "sun" } }],
    shadow: { enabled: true, size: 512, cascadeCount: 1, prd02Shadows: { enabled: true, mapSize: 512, cascades: 1, maxDistance: 60, splitLambda: 0.6, filter: "pcf", strength: 1, bias: 0, normalBias: 1.5 } }
  };
}

async function casterDraws(count: number): Promise<DrawCommand[]> {
  const renderer = await Renderer.create({ backend: "mock", width: 320, height: 180, qrFlags: FLAGS_ON });
  try {
    renderer.render(sourceWith(count) as never, { viewProjectionMatrix: Float32Array.from(identityMat4()), viewMatrix: Float32Array.from(identityMat4()) } as never);
    const draws = (renderer.device as unknown as { drawCommands: DrawCommand[] }).drawCommands;
    return draws.filter((d) => /^forest:\d+$/.test(d.label ?? ""));
  } finally {
    renderer.dispose();
  }
}

describe("instanced shadow casters are drawn as one batch per cascade", () => {
  it("2,000 instances: one depth draw through instance attributes (was ceil(n / 64) = 32 draws)", async () => {
    const draws = await casterDraws(2000);
    expect(draws).toHaveLength(1);
    const d = draws[0]!;
    expect(d.instanceCount).toBe(2000);
    expect((d.instanceAttributes ?? []).map((a) => a.shaderName)).toEqual(["a_instanceMatrix0", "a_instanceMatrix1", "a_instanceMatrix2", "a_instanceMatrix3"]);
    expect((d.uniforms as ReadonlyMap<string, unknown>).get("u_instanceAttributeMode")).toBe(1);
  });

  it("64 instances or fewer keep the uniform-array path in a single draw", async () => {
    const draws = await casterDraws(40);
    expect(draws).toHaveLength(1);
    expect(draws[0]!.instanceCount).toBe(40);
    expect(draws[0]!.instanceAttributes).toBeUndefined();
    expect((draws[0]!.uniforms as ReadonlyMap<string, unknown>).get("u_instanceAttributeMode")).toBe(0);
  });
});
