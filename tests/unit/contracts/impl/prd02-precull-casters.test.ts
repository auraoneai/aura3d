/**
 * 02-S5 (prd02-pole-behind-camera): a shadow caster outside the view frustum
 * still casts into view under A3D_QR_LIGHTING.
 *
 * GPU runs 38186424018 / 38187483876 measured `auraShadowPixelsInReceiver: 0`
 * against three's 33.5k: the renderer frustum-culled the pole before the
 * shadow step, so the prd02 cascade never saw it. Under the flag the shadow
 * step now takes the pre-cull casters. Flag-off collection is unchanged
 * (`collectRenderItemsWithDiagnostics` keeps no culled casters).
 */
import { describe, expect, it } from "vitest";
import "../../../../packages/rendering/src/lanes/prd02";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { identityMat4, PerspectiveCamera } from "@aura3d/scene";
import { Renderer } from "../../../../packages/rendering/src/Renderer";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../../packages/rendering/src/PBRMaterial";
import type { DrawCommand } from "../../../../packages/rendering/src/RenderDevice";

function translate(x: number, y: number, z: number): Float32Array {
  const m = Float32Array.from(identityMat4());
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

/** prd02-pole-behind-camera: camera at z=6 looking toward -z, pole at z=9, sun low from behind. */
function source() {
  const material = new PBRMaterial({ name: "lit" });
  const sun = [0, 6, 29];
  const len = Math.hypot(...sun);
  return {
    // The engine compiler (compiler/renderInput.ts) opts explicit items into culling.
    frustumCulling: true,
    renderItems: [
      { geometry: Geometry.litCube(1), material, modelMatrix: Float32Array.from([0.5, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0.5, 0, 0.6, 3, 9, 1]), label: "pole", castShadow: true, receiveShadow: true },
      { geometry: Geometry.litPlane(), material, modelMatrix: Float32Array.from([30, 0, 0, 0, 0, 1, 0, 0, 0, 0, 30, 0, 0, 0, 0, 1]), label: "ground", castShadow: false, receiveShadow: true },
      { geometry: Geometry.litCube(1), material, modelMatrix: translate(0, 0.5, -4), label: "marker", castShadow: true, receiveShadow: true }
    ],
    collectedLights: [
      {
        kind: "directional", color: [1, 1, 1], intensity: 3, position: sun, direction: sun.map((v) => -v / len),
        range: 0, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 0xffffffff, source: { id: "sun", name: "sun" }
      }
    ],
    shadow: {
      enabled: true,
      size: 1024,
      cascadeCount: 1,
      prd02Shadows: { enabled: true, mapSize: 1024, cascades: 1, maxDistance: 60, splitLambda: 0.6, filter: "pcf", strength: 1, bias: 0, normalBias: 1.5 }
    }
  };
}

function camera() {
  const cam = new PerspectiveCamera({ fovYRadians: (50 * Math.PI) / 180, aspect: 16 / 9, near: 0.1, far: 80 });
  cam.transform.setPosition(0, 1.6, 6);
  cam.transform.lookAt?.([0, 0.4, -4]);
  cam.updateCameraMatrices();
  return cam;
}

async function drawLabels(lighting: boolean): Promise<{ depth: string[]; forward: string[] }> {
  const flags = resolveQrFlags({ options: { A3D_QR_LIGHTING: lighting } });
  const renderer = await Renderer.create({ backend: "mock", width: 320, height: 180, qrFlags: flags });
  try {
    renderer.render(source() as never, camera() as never);
    const draws = (renderer.device as unknown as { drawCommands: DrawCommand[] }).drawCommands;
    const isDepth = (d: DrawCommand) => /depth|shadow/i.test((d.shader as { label?: string } | undefined)?.label ?? "");
    return {
      depth: draws.filter(isDepth).map((d) => d.label ?? ""),
      forward: draws.filter((d) => !isDepth(d)).map((d) => d.label ?? "")
    };
  } finally {
    renderer.dispose();
  }
}

describe("02-S5: casters outside the view frustum still cast (A3D_QR_LIGHTING)", () => {
  it("flag on: the culled pole is not drawn forward but is drawn into the sun cascade", async () => {
    const { depth, forward } = await drawLabels(true);
    expect(forward.some((l) => l.startsWith("pole"))).toBe(false);
    expect(forward.some((l) => l.startsWith("marker"))).toBe(true);
    expect(depth.some((l) => l.startsWith("pole"))).toBe(true);
    expect(depth.some((l) => l.startsWith("marker"))).toBe(true);
  });
});
