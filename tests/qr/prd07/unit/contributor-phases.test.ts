// QR-07 — lane-07 contributor hooks must be reachable from the frame graph.
// FrameGraph only calls `collect()` on contributors that list "collect" and
// only asks `transparentItems()` from those listing "transparent". prd07.fog
// declared `phases: ["background"]` while implementing `collect`, so the
// real Renderer never ran it: no forward fog, no fogged sky, no volumetric
// fog input — vfx frames matched -vfx byte for byte on the L4
// (run 38189250898, prd07-fog-height / prd07-outdoor-sky). The existing fog
// unit tests called `collect` directly and could not see this.

import { afterEach, describe, expect, it } from "vitest";
import "../../../../packages/engine/src";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { frameContributors } from "../../../../packages/rendering/src/contracts/frameGraph";
import { createRendererFrameHooks } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { prd07ForwardFog, setPrd07ForwardFog } from "../../../../packages/rendering/src/atmosphere/fogUniformStore";

const ALL_VFX = resolveQrFlags({ options: ["vfx", "vfx.sky", "vfx.fog", "vfx.volumetric", "vfx.decals"] });

afterEach(() => setPrd07ForwardFog(null));

describe("prd07 contributors vs frame-graph phases", () => {
  it("every implemented hook is reachable through its declared phase", () => {
    const lane = frameContributors(ALL_VFX).filter((c) => c.id.startsWith("prd07."));
    expect(lane.map((c) => c.id)).toEqual(expect.arrayContaining(["prd07.particles", "prd07.fog", "prd07.sky", "prd07.decals", "prd07.volumetric"]));
    for (const c of lane) {
      if (c.collect) expect(c.phases, `${c.id} implements collect`).toContain("collect");
      if (c.transparentItems) expect(c.phases, `${c.id} implements transparentItems`).toContain("transparent");
    }
  });

  it("FrameGraph.collect runs prd07.fog and publishes the forward fog store", () => {
    const device = new MockRenderDevice();
    const source = {
      renderItems: [],
      atmosphere: {
        resolveFog: () => ({ mode: "height", color: "#a9bccf", density: 0.004, heightDensity: 0.008, heightFalloff: 0.2 }),
        fogVolumes: () => [],
        sky: null
      }
    };
    const hooks = createRendererFrameHooks({
      device,
      width: 64,
      height: 64,
      source: source as never,
      camera: {
        position: [0, 1.6, 10],
        viewMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1.6, -10, 1]),
        projectionMatrix: new Float32Array(16),
        viewProjectionMatrix: new Float32Array(16),
        near: 0.05,
        far: 300
      } as never
    });
    // createRendererFrameHooks reads the device-bound flags.
    (hooks as unknown as { flags: unknown }).flags = ALL_VFX;
    expect(prd07ForwardFog()).toBeNull();
    hooks.collect([]);
    expect(prd07ForwardFog(), "prd07.fog collect did not run").not.toBeNull();
    expect(hooks.blackboardValue("prd07.fog")).toBeTruthy();
  });
});
