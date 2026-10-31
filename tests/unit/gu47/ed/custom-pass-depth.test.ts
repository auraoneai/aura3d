/**
 * GU47 phase 2 (receipt `outline-targets`, toon depth ink): a C-13 custom post pass that declares `inputs: ["depth"]`
 * (`effects.toon({ inkSource: "depth" })`, `effects.shaderPass({ inputs: ["color", "depth"] })`) gets a sampleable depth
 * attachment on the forward target. Before the fix only authored depth effects (AO, god rays, DOF, SSR, TAA, a targeted
 * outline) asked for one, so in a scene whose only depth reader was the custom pass the v2 HDR driver found no
 * `depthTextureHandle`, recorded `WEBGL_LDR_POSTPROCESS_DEPTH_REQUIRED:v2-hdr-stages` and returned the source untouched:
 * every HDR stage, the custom pass included, was skipped (the receipt's depth toon frame equalled the un-tooned frame).
 * The after-tonemap tail had no `sceneDepth` either. Scenes without a depth-reading custom pass are unchanged.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Renderer } from "../../../../packages/rendering/src/Renderer";
import type { Texture } from "../../../../packages/rendering/src/Texture";
import { registerPostPass, type PostPassDescriptor } from "../../../../packages/rendering/src/contracts/post";
import { postprocessRequiresDepthTexture } from "../../../../packages/rendering/src/renderer/PostprocessExecution";

const GLSL = "void main() { outColor = texture(u_color, v_uv); }";

function descriptor(name: string, inputs: PostPassDescriptor["inputs"], insertAt: PostPassDescriptor["insertAt"] = "before-tonemap"): PostPassDescriptor {
  return {
    id: `prd03.custom.${name}`,
    owner: "prd03",
    flag: "A3D_QR_POST",
    insertAt,
    space: insertAt === "after-tonemap" ? "display" : "linear-hdr",
    inputs,
    fragment: { glsl: GLSL },
    gpuOnly: true
  };
}

const releases: (() => void)[] = [];
afterEach(() => {
  for (const release of releases.splice(0)) release();
});
const register = (pass: PostPassDescriptor): void => { releases.push(registerPostPass(pass)); };

const V2 = { v2: true, pipeline: { antiAliasing: "off", exposure: 1, dither: true } } as const;

describe("GU47 phase 2: a depth-reading custom post pass gets the forward depth texture", () => {
  it("no custom pass, or a colour-only one: no depth texture (unchanged)", () => {
    expect(postprocessRequiresDepthTexture({ ...V2 } as never)).toBe(false);
    register(descriptor("gu47-depth-colour-only", ["color"]));
    expect(postprocessRequiresDepthTexture({ ...V2 } as never)).toBe(false);
  });

  it("a registered pass (app.post.addPostPass) that declares depth, at an HDR anchor or after tonemap", () => {
    register(descriptor("gu47-depth-hdr", ["color", "depth"]));
    expect(postprocessRequiresDepthTexture({ ...V2 } as never)).toBe(true);
    releases.splice(0).forEach((release) => release());
    expect(postprocessRequiresDepthTexture({ ...V2 } as never)).toBe(false);
    register(descriptor("gu47-depth-tail", ["color", "depth"], "after-tonemap"));
    expect(postprocessRequiresDepthTexture({ ...V2 } as never)).toBe(true);
  });

  it("a pipeline-bag custom pass that declares depth", () => {
    const pipeline = { ...V2.pipeline, customPasses: [descriptor("gu47-depth-bag", ["color", "depth"])] };
    expect(postprocessRequiresDepthTexture({ v2: true, pipeline } as never)).toBe(true);
  });

  it("the legacy chain (no v2 plan) never runs custom passes, so it asks for nothing", () => {
    register(descriptor("gu47-depth-legacy", ["color", "depth"]));
    expect(postprocessRequiresDepthTexture({ pipeline: V2.pipeline } as never)).toBe(false);
  });

  it("the renderer allocates the forward target with a depth texture while such a pass is registered", async () => {
    const forwardDepth = async (): Promise<Texture | undefined> => {
      const renderer = await Renderer.create({ backend: "mock", width: 4, height: 3, clearColor: [0.2, 0.3, 0.4, 1] });
      try {
        renderer.render({ renderItems: [], postprocess: { toneMapping: false, ...V2 } as never });
        const targets = [...((renderer.device as unknown as { readonly renderTargets: Set<{ readonly label: string; readonly depthTexture?: Texture }> }).renderTargets)];
        return targets.find((target) => target.label === "renderer-forward-color")?.depthTexture;
      } finally {
        renderer.dispose();
      }
    };
    expect(await forwardDepth()).toBeUndefined();
    register(descriptor("gu47-depth-renderer", ["color", "depth"]));
    expect(await forwardDepth()).toMatchObject({ width: 4, height: 3, label: "renderer-forward-color-depth" });
  });
});
