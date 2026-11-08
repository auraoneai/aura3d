/**
 * W4: the pre-mount WebGPU gap check no longer sends volumetric light, god rays or motion blur to WebGL2, because the
 * WebGPU native chain serves them from the forward depth attachment. SSAO still needs the public depth capability.
 */
import { describe, expect, it } from "vitest";
import { createProductionRuntimePostprocess } from "../../../packages/engine/src/agent-api/compiler/postprocess";
import { effects } from "../../../packages/engine/src/agent-api/nodes/effects.composite";
import type { RendererPostProcessOptions } from "../../../packages/rendering/src/Renderer";

type Gap = { readonly code: string; readonly missing: readonly string[] } | undefined;
type GapCheck = (snapshot: unknown, canvas: HTMLCanvasElement, dofGap?: (post: RendererPostProcessOptions) => Gap) => Gap;

const gapCheck = (createProductionRuntimePostprocess as unknown as Record<symbol, GapCheck>)[Symbol.for("@aura3d/root-postprocess/webgpu-post-gap/v1")]!;
const canvas = (): HTMLCanvasElement => ({ width: 640, height: 360 }) as HTMLCanvasElement;
const scene = (...nodes: { toJSON(): unknown }[]) => ({ nodes: nodes.map((node) => node.toJSON()), camera: { near: 0.1, far: 100 } });

describe("WebGPU post gap: natively served depth readers", () => {
  it("passes volumetric fog and motion blur, which compile to volumetric light and temporal motion blur", () => {
    const snapshot = scene(effects.volumetricFog({ density: 0.4, intensity: 0.5 }), effects.motionBlur({ intensity: 0.5 }));
    const post = createProductionRuntimePostprocess(snapshot as never, [], 640, 360, true, { canvas: canvas() });
    expect(post.volumetricLight).toBeTruthy();
    expect(post.motionBlur).toBeTruthy();
    expect(gapCheck(snapshot, canvas())).toBeUndefined();
  });

  it("still reports the depth gap for ambient occlusion", () => {
    const snapshot = scene(effects.volumetricFog({ density: 0.4 }), effects.ambientOcclusion({ intensity: 0.5 }));
    expect(gapCheck(snapshot, canvas())).toEqual({ code: "DEPTH_POSTPROCESS_UNSUPPORTED", missing: ["depth-textures"] });
  });
});
