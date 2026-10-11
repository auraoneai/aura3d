/**
 * #91 (lane-01 half; PRD-11 §12.3, C-28): the Renderer's post-hdr phase and
 * postprocess chain run under the frameStats "post" scope. The forward and
 * shadow phases already report under their own scopes (#90). Lane 03 owns
 * the chain internals (guardPostprocessPlan, C-28 target pool).
 */

import { describe, expect, it } from "vitest";
import { PBRMaterial, Renderer } from "@aura3d/rendering";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { registerFrameContributor } from "../../../../packages/rendering/src/contracts/frameGraph";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { BaseRenderPass, type RenderPassContext } from "../../../../packages/rendering/src/RenderPass";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { VertexBuffer } from "../../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../../packages/rendering/src/VertexFormat";
import type { RenderItem } from "../../../../packages/rendering/src/ForwardPass";

const V2 = resolveQrFlags({ env: { A3D_QR_CORE: "v2" } });
const OFF = resolveQrFlags({ env: {} });

function item(): RenderItem {
  const vertices = new VertexBuffer(VertexFormat.P3N3, 3);
  vertices.setAttribute(0, "position", [-1, -1, 0]);
  vertices.setAttribute(1, "position", [3, -1, 0]);
  vertices.setAttribute(2, "position", [-1, 3, 0]);
  for (let i = 0; i < 3; i++) vertices.setAttribute(i, "normal", [0, 0, 1]);
  const geometry = new Geometry(vertices, null, "triangles", { min: [-1, -1, 0], max: [3, 3, 0] });
  return { geometry, material: new PBRMaterial({}), modelMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } as RenderItem;
}

/** Records which frameStats scopes are open whenever a probe pass executes. */
function instrument(renderer: Renderer): { open: string[]; seen: string[][]; probe: () => void } {
  const stats = renderer.frameStats!;
  const open: string[] = [];
  const seen: string[][] = [];
  const original = stats.scope.bind(stats);
  stats.scope = <T>(name: string, fn: () => T): T => {
    open.push(name);
    try {
      return original(name, fn);
    } finally {
      open.pop();
    }
  };
  return { open, seen, probe: () => seen.push([...open]) };
}

class ProbePass extends BaseRenderPass {
  constructor(private readonly onExecute: () => void) {
    super("prd01.test.post-probe", [], ["aura.scene.color"]);
  }
  execute(_context: RenderPassContext): void {
    this.onExecute();
  }
}

describe("#91 frameStats 'post' scope", () => {
  for (const mode of ["render", "renderAsync"] as const) {
    it(`post-hdr work reports under the "post" scope (${mode})`, async () => {
      setRendererQrFlags(V2);
      const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16, resolution: { dynamic: true } });
      const watch = instrument(renderer);
      const unregister = registerFrameContributor({
        id: "prd01.test-post-scope",
        owner: "prd01",
        flag: "A3D_QR_CORE",
        phases: ["post-hdr"],
        passes: () => [new ProbePass(watch.probe)]
      });
      try {
        if (mode === "render") renderer.render([item()]);
        else await renderer.renderAsync([item()]);
        expect(watch.seen).toEqual([["post"]]);
        // The forward phase stays in its own scope, not "post".
        expect(watch.open).toEqual([]);
      } finally {
        unregister();
        renderer.dispose();
        setRendererQrFlags(OFF);
      }
    });
  }

  it("no monitor (no resolution option): post-hdr still runs, with no scope", async () => {
    setRendererQrFlags(V2);
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16 });
    let ran = 0;
    const unregister = registerFrameContributor({
      id: "prd01.test-post-noscope",
      owner: "prd01",
      flag: "A3D_QR_CORE",
      phases: ["post-hdr"],
      passes: () => [new ProbePass(() => { ran += 1; })]
    });
    try {
      expect(renderer.frameStats).toBeUndefined();
      renderer.render([item()]);
      expect(ran).toBe(1);
    } finally {
      unregister();
      renderer.dispose();
      setRendererQrFlags(OFF);
    }
  });
});
