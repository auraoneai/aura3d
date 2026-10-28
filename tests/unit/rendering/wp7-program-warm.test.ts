/**
 * PRD-2 WP-7: the sync-path program warm is keyed on the shadow map the frame draws with, and no path warms or draws a generated
 * `pass: "depth"` program (shadow casters render through the PRD-02 depth shaders). Before the change a shadowed one-material scene created
 * two extra programs: a forward variant with no shadow bits and a depth variant, neither ever drawn.
 */
import { describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd02";
import "../../../packages/rendering/src/lanes/prd01";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { DirectionalLight, identityMat4, PerspectiveCamera } from "@aura3d/scene";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { rendererProgramCache } from "../../../packages/rendering/src/renderer/qrSubFlags";

const FLAGS = resolveQrFlags({ options: { A3D_QR_CORE: true, A3D_QR_LIGHTING: true } });

function scene() {
  const material = new PBRMaterial({ name: "lit" });
  const cube = Float32Array.from(identityMat4());
  cube[13] = 1.5;
  return {
    renderItems: [
      { geometry: Geometry.litCube(1), material, modelMatrix: cube, label: "caster", castShadow: true, receiveShadow: true },
      { geometry: Geometry.litPlane(), material, modelMatrix: Float32Array.from([10, 0, 0, 0, 0, 1, 0, 0, 0, 0, 10, 0, 0, 0, 0, 1]), label: "floor", receiveShadow: true }
    ],
    collectedLights: [{
      kind: "directional", color: [1, 1, 1], intensity: 3, position: [3, 10, 2], direction: [-0.3, -1, -0.2],
      range: 0, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 0xffffffff, source: new DirectionalLight("sun")
    }],
    shadow: { enabled: true, size: 512, cascadeCount: 2, prd02Shadows: { enabled: true, mapSize: 512, cascades: 2, maxDistance: 30, splitLambda: 0.6, filter: "pcf", strength: 1, bias: 0, normalBias: 1.5 } }
  };
}

function camera() {
  const cam = new PerspectiveCamera({ fovYRadians: 1, aspect: 16 / 9, near: 0.1, far: 50 });
  cam.transform.setPosition(0, 4, 8);
  cam.updateCameraMatrices();
  return cam;
}

interface Key { readonly pass: string; readonly shadows: { readonly cascades: number } }

async function withRenderer<T>(fn: (renderer: Renderer) => Promise<T>): Promise<T> {
  const renderer = await Renderer.create({ backend: "mock", width: 320, height: 180, qrFlags: FLAGS });
  try { return await fn(renderer); } finally { renderer.dispose(); }
}

function programs(renderer: Renderer): Key[] {
  return (rendererProgramCache(renderer.device, FLAGS) as unknown as { keys(): string[] }).keys().map((k: string) => JSON.parse(k) as Key);
}

describe("generated program warm", () => {
  it("sync render creates only the shadowed forward variant the draws use, and nothing compiles after the first frame", () => withRenderer(async (renderer) => {
    renderer.render(scene() as never, camera());
    const first = programs(renderer);
    expect(first).toHaveLength(1);
    expect(first[0]!.pass).toBe("forward");
    expect(first[0]!.shadows.cascades).toBe(2);
    for (let i = 0; i < 3; i += 1) renderer.render(scene() as never, camera());
    expect(programs(renderer)).toHaveLength(1);
    expect(rendererProgramCache(renderer.device, FLAGS).stats().compiledSinceReady).toBe(0);
  }));

  it("no path warms a generated depth program: precompile, renderAsync and render never create one", () => withRenderer(async (renderer) => {
    await renderer.precompile(scene() as never, camera());
    expect(programs(renderer).filter((p) => p.pass !== "forward")).toEqual([]);
    await renderer.renderAsync(scene() as never, camera());
    renderer.render(scene() as never, camera());
    const all = programs(renderer);
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((p) => p.pass !== "forward")).toEqual([]);
  }));
});
