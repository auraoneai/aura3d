/**
 * Shadow pixels — end-to-end on the mock backend: a `Renderer` with
 * A3D_QR_LIGHTING on, a compiled-style RenderSource (collectedLights + sun
 * with castsShadow + `shadow.prd02Shadows`) and a caster above a receiver
 * must hand the receiver's forward draw a bound shadow map, and the
 * flag-off renderer keeps its legacy behaviour.
 */
import { describe, expect, it } from "vitest";
import { prd02ShadowBridgeReason, prd02ShadowDepthProbe } from "../../../../packages/rendering/src/shadows/Prd02ShadowBridge";
import "../../../../packages/rendering/src/lanes/prd02";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { identityMat4, PerspectiveCamera } from "@aura3d/scene";
import { Renderer } from "../../../../packages/rendering/src/Renderer";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../../packages/rendering/src/PBRMaterial";
import type { DrawCommand } from "../../../../packages/rendering/src/RenderDevice";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });

function translate(x: number, y: number, z: number): Float32Array {
  const m = Float32Array.from(identityMat4());
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

function source(prd02 = true) {
  const material = new PBRMaterial({ name: "lit" });
  return {
    renderItems: [
      { geometry: Geometry.litCube(1), material, modelMatrix: translate(0, 1.5, 0), label: "caster", castShadow: true, receiveShadow: true },
      { geometry: Geometry.litPlane(), material, modelMatrix: Float32Array.from([10, 0, 0, 0, 0, 1, 0, 0, 0, 0, 10, 0, 0, 0, 0, 1]), label: "floor", castShadow: false, receiveShadow: true }
    ],
    collectedLights: [
      {
        kind: "directional", color: [1, 1, 1], intensity: 3, position: [3, 10, 2], direction: [-0.3, -1, -0.2],
        range: 0, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 0xffffffff, source: { id: "sun", name: "sun" }
      }
    ],
    shadow: {
      enabled: true,
      size: 1024,
      cascadeCount: 2,
      ...(prd02
        ? { prd02Shadows: { enabled: true, mapSize: 1024, cascades: 2, maxDistance: 30, splitLambda: 0.6, filter: "pcf", strength: 1, bias: 0, normalBias: 1.5 } }
        : {})
    }
  };
}

function camera() {
  const cam = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 16 / 9, near: 0.1, far: 50 });
  cam.transform.setPosition(0, 4, 8);
  cam.updateCameraMatrices();
  return cam;
}

async function floorDraws(flags: typeof FLAGS_ON | undefined, prd02 = true, structural = false): Promise<DrawCommand[]> {
  const renderer = await Renderer.create({ backend: "mock", width: 320, height: 180, ...(flags ? { qrFlags: flags } : {}) });
  const cam = camera();
  // Compiled sources (engine compiler/renderer.ts) pass a structural CameraLike.
  const camArg = structural ? { viewProjectionMatrix: cam.viewProjectionMatrix, viewMatrix: cam.viewMatrix } : cam;
  try {
    renderer.render(source(prd02) as never, camArg as never);
    const draws = [...(renderer.device as unknown as { drawCommands: DrawCommand[] }).drawCommands];
    return draws.filter((d) => (d.label ?? "").includes("floor"));
  } finally {
    renderer.dispose();
  }
}

function shadowBinding(draws: readonly DrawCommand[]) {
  const forward = draws[draws.length - 1]!;
  const uniforms = forward.uniforms as ReadonlyMap<string, unknown>;
  const texture = uniforms.get("u_shadowMapTexture") as { texture?: { label?: string } } | undefined;
  return { enabled: uniforms.get("u_shadowMapEnabled"), label: texture?.texture?.label ?? null };
}

describe("shadow bindings reach the forward pass", () => {
  for (const structural of [false, true]) {
    it(`flag on + prd02Shadows (${structural ? "structural CameraLike" : "concrete Camera"}): receiver gets the prd02 cascade`, async () => {
      const draws = await floorDraws(FLAGS_ON, true, structural);
      expect(draws.length).toBeGreaterThan(0);
      const binding = shadowBinding(draws);
      expect(binding.enabled).toBe(1);
      expect(binding.label).toMatch(/^prd02-cascade-/);
    });
  }
});


describe("shadow bridge depth diagnostics", () => {
  it("reports current cascades and restores the previous render target", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 320, height: 180, qrFlags: FLAGS_ON });
    try {
      renderer.render(source() as never, camera());
      const previous = renderer.device.getRenderTarget?.() ?? null;
      expect(prd02ShadowBridgeReason(renderer.device)).toBe("rendered");
      const stats = prd02ShadowDepthProbe(renderer.device);
      expect(stats.map((entry) => entry.index)).toEqual([0, 1]);
      for (const stat of stats) {
        expect(stat.width).toBe(1024);
        expect(stat.covered).toBeGreaterThanOrEqual(0);
        expect(stat.covered).toBeLessThanOrEqual(1);
        expect(stat.min).toBeLessThanOrEqual(stat.max);
      }
      expect(renderer.device.getRenderTarget?.() ?? null).toBe(previous);
    } finally {
      renderer.dispose();
    }
  });
});
