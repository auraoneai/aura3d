import { afterEach, describe, expect, it } from "vitest";
import { effects, primitives, scene } from "@aura3d/engine";
import { Geometry, PBRMaterial, Renderer } from "@aura3d/rendering";
import { createProductionRuntimePostprocess } from "../../../../packages/engine/src/agent-api/compiler/postprocess";
import { recordAuthoredPostContext, resetAuthoredPostContext } from "../../../../packages/engine/src/agent-api/postBridge";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";

/**
 * T0-29 (#979, lane-14 leave-one-out on main 849bb29f6): with `post` on,
 * blockfall-reactor and turbo-drift-circuit drew 0 calls under `all` while
 * the GL context ticked at 60 fps. The capture report's engine errors show
 * why: "production renderer failed to mount: Error: POST_DUPLICATE_STAGE: two
 * AO effect nodes (ambient-occlusion + contact-occlusion) target stage
 * S2-gtao". Six legacy games author both AO nodes (the post-v2 codemod merges
 * them), and the bridge threw at compile time, so the mount failed and nothing
 * was drawn. The bridge now merges at runtime and reports a diagnostic.
 *
 * This unit compiles a legacy-game-shaped scene flag-on and renders the
 * resulting options through the Renderer: the compile must not throw, the
 * v2 bag must carry one AO stage, and the frame must draw and present.
 */

const legacyGameScene = () =>
  scene()
    .add(primitives.box({ name: "cabinet" }))
    .add(effects.bloom({ intensity: 0.4, threshold: 0.8 }))
    .add(effects.ambientOcclusion({ radius: 0.6 }))
    .add(effects.contactOcclusion({ radius: 0.2 }))
    .toJSON();

afterEach(() => resetAuthoredPostContext());

describe("T0-29: ambientOcclusion + contactOcclusion with `post` on", () => {
  it("the flag-on compile does not throw and carries one S2 AO stage", () => {
    recordAuthoredPostContext({ flags: resolveQrFlags({ options: ["post"] }), options: {} });
    const options = createProductionRuntimePostprocess(legacyGameScene(), [], 320, 180);
    expect(options.v2).toBe(true);
    const pipeline = options.pipeline as { ao?: { radius: number } };
    expect(pipeline.ao?.radius).toBeCloseTo(0.6, 6);
  });

  it("the compiled options render: drawCalls > 0 and a presented frame", async () => {
    recordAuthoredPostContext({ flags: resolveQrFlags({ options: ["post"] }), options: {} });
    const postprocess = createProductionRuntimePostprocess(legacyGameScene(), [], 320, 180);
    const renderer = await Renderer.create({ backend: "mock", width: 320, height: 180 });
    try {
      const frame = renderer.captureFrame({
        renderItems: [{
          geometry: Geometry.litCube(),
          material: new PBRMaterial({ name: "t0-29-cabinet", baseColor: [0.4, 0.6, 0.9, 1], roughness: 0.5 })
        }],
        cameraPolicy: "auto-frame",
        // The mock backend has no HDR targets; the HDR v2 path itself is
        // proven on the GPU games run (track0). The chain the bridge compiled
        // still plans, draws and presents here.
        postprocess: { ...postprocess, targetFormat: "rgba8" },
        environmentLighting: false
      });
      expect(frame.diagnostics.lastError).toBeNull();
      expect(frame.diagnostics.drawCalls).toBeGreaterThan(0);
      expect(frame.width).toBe(320);
      expect(frame.height).toBe(180);
      expect(frame.pixels.length).toBe(320 * 180 * 4);
    } finally {
      renderer.dispose();
    }
  });
});
