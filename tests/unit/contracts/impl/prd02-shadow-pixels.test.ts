/**
 * Shadow pixels — end-to-end on the mock backend: a `Renderer` with
 * A3D_QR_LIGHTING on, a compiled-style RenderSource (collectedLights + sun
 * with castsShadow + `shadow.prd02Shadows`) and a caster above a receiver
 * must hand the receiver's forward draw the bridged prd02 cascade, and the
 * lane-page GPU evidence probe (`prd02ShadowDepthProbe`) must report the
 * rendered cascades. The GPU half ("shadowed texel is darker") lives in
 * tests/qr/prd02/browser/shadow-chain.spec.ts.
 */
import { describe, expect, it } from "vitest";
import "../../../../packages/rendering/src/lanes/prd02";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { Renderer } from "../../../../packages/rendering/src/Renderer";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../../packages/rendering/src/PBRMaterial";
import type { DrawCommand } from "../../../../packages/rendering/src/RenderDevice";
import { prd02ShadowBridgeReason, prd02ShadowDepthProbe } from "../../../../packages/rendering/src/shadows/Prd02ShadowBridge";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });

function mat(values: readonly number[]): Float32Array {
  return Float32Array.from(values);
}

/** Column-major multiply a·b. */
function mul(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + r]! * b[c * 4 + k]!;
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

/** Camera at (0, 4, 8) looking at the origin (structural CameraLike, as compiled sources pass). */
function cameraLike() {
  const eye = [0, 4, 8];
  const f = [0 - eye[0]!, 0 - eye[1]!, 0 - eye[2]!];
  const fl = Math.hypot(f[0]!, f[1]!, f[2]!);
  const fz = f.map((v) => v / fl);
  const up = [0, 1, 0];
  const s = [fz[1]! * up[2]! - fz[2]! * up[1]!, fz[2]! * up[0]! - fz[0]! * up[2]!, fz[0]! * up[1]! - fz[1]! * up[0]!];
  const sl = Math.hypot(s[0]!, s[1]!, s[2]!);
  const sx = s.map((v) => v / sl);
  const u = [sx[1]! * fz[2]! - sx[2]! * fz[1]!, sx[2]! * fz[0]! - sx[0]! * fz[2]!, sx[0]! * fz[1]! - sx[1]! * fz[0]!];
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const view = mat([sx[0]!, u[0]!, -fz[0]!, 0, sx[1]!, u[1]!, -fz[1]!, 0, sx[2]!, u[2]!, -fz[2]!, 0, -dot(sx, eye), -dot(u, eye), dot(fz, eye), 1]);
  const near = 0.1;
  const far = 50;
  const t = 1 / Math.tan(Math.PI / 6);
  const aspect = 16 / 9;
  const proj = mat([t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]);
  return { viewProjectionMatrix: mul(proj, view), viewMatrix: view };
}

function source() {
  const material = new PBRMaterial({ name: "lit" });
  return {
    renderItems: [
      { geometry: Geometry.litCube(1), material, modelMatrix: mat([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.5, 0, 1]), label: "caster", castShadow: true, receiveShadow: true },
      { geometry: Geometry.litPlane(), material, modelMatrix: mat([10, 0, 0, 0, 0, 1, 0, 0, 0, 0, 10, 0, 0, 0, 0, 1]), label: "floor", castShadow: false, receiveShadow: true }
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
      prd02Shadows: { enabled: true, mapSize: 1024, cascades: 2, maxDistance: 30, splitLambda: 0.6, filter: "pcf", strength: 1, bias: 0, normalBias: 1.5 }
    }
  };
}

async function renderOnce() {
  const renderer = await Renderer.create({ backend: "mock", width: 320, height: 180, qrFlags: FLAGS_ON });
  renderer.render(source() as never, cameraLike() as never);
  const draws = [...(renderer.device as unknown as { drawCommands: DrawCommand[] }).drawCommands];
  return { renderer, draws };
}

describe("shadow pixels: the bridged prd02 cascade reaches the receiver", () => {
  it("depth passes draw the caster into prd02 cascades; the floor's forward draw samples a prd02 cascade", async () => {
    const { draws } = await renderOnce();
    const depthDraws = draws.filter((d) => (d.shader as { label?: string } | undefined)?.label === "aura3d/prd02-depth");
    expect(depthDraws.length).toBeGreaterThan(0);
    const floor = draws.filter((d) => d.label === "floor");
    expect(floor.length).toBeGreaterThan(0);
    const uniforms = floor[floor.length - 1]!.uniforms as ReadonlyMap<string, unknown>;
    expect(uniforms.get("u_shadowMapEnabled")).toBe(1);
    const binding = uniforms.get("u_shadowMapTexture") as { texture?: { label?: string } } | undefined;
    expect(binding?.texture?.label).toMatch(/^prd02-cascade-\d+-depth$/);
  });

  it("prd02ShadowDepthProbe reports one entry per rendered cascade (lane-page GPU evidence)", async () => {
    const { renderer } = await renderOnce();
    expect(prd02ShadowBridgeReason(renderer.device)).toBe("rendered");
    const stats = prd02ShadowDepthProbe(renderer.device);
    expect(stats.length).toBeGreaterThan(0);
    for (const stat of stats) {
      expect(stat.width).toBe(1024);
      expect(stat.covered).toBeGreaterThanOrEqual(0);
      expect(stat.covered).toBeLessThanOrEqual(1);
      expect(stat.min).toBeLessThanOrEqual(stat.max);
    }
  });
});
