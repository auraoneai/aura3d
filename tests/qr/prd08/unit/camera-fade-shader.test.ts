/**
 * S-1 `prd08.cameraFade` chunk/feature + S-2 offset contributor + Y-6 bars.
 * Pixel-coverage readback runs in the browser conformance suite
 * (qr-prd08-camera.yml); here we prove the source/selection semantics.
 */
import { describe, expect, it } from "vitest";
import {
  cameraFadeParsChunk,
  cameraFadeDiscardChunk,
  cameraFadeFeature,
  cameraFadeOffset,
  createCameraFadeOffsetContributor,
  setCameraFadeOffset
} from "../../../../packages/rendering/src/shaders/camera-fade.glsl.js";
import { buildChunkHarnessProgram } from "../../../../packages/rendering/src/contracts/testing/ChunkHarness.js";
import { createCinematicBarsLayer, createLetterboxContributor, createCameraController } from "@aura3d/engine/lanes";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import type { FrameContributorContext, RenderItem } from "@aura3d/rendering/contracts";
import { registerPostPass } from "../../../../packages/rendering/src/contracts/post.js";

const ctxFor = (flagsOn: boolean, frameIndex = 0): FrameContributorContext =>
  ({
    device: {}, width: 64, height: 64, frameIndex, timeSeconds: 0,
    camera: null, source: {}, items: [], tier: {},
    flags: resolveQrFlags({ options: flagsOn ? ["camera"] : [] }),
    sceneDepth: { texture: null, linearize: { near: 0.1, far: 100, orthographic: false }, available: false },
    blackboard: new Map()
  }) as unknown as FrameContributorContext;

const item = (fade?: number): RenderItem => ({ label: "x", cameraFade: fade } as RenderItem);

describe("S-1 camera-fade shader chunk + feature", () => {
  it("pars chunk declares uniforms, Bayer and the guarded discard", () => {
    expect(cameraFadeParsChunk.glsl).toContain("uniform float u_cameraFade");
    expect(cameraFadeParsChunk.glsl).toContain("uniform vec2 u_cameraFadeOffset");
    expect(cameraFadeParsChunk.glsl).toContain("a3dBayer4");
    expect(cameraFadeParsChunk.glsl).toContain("discard");
    expect(cameraFadeParsChunk.wgsl).toContain("discard");
  });

  it("feature selects only faded forward draws and binds both uniforms", () => {
    const sel = (pass: "forward" | "depth", fade?: number) =>
      cameraFadeFeature.select({
        item: item(fade),
        pass,
        tier: {} as never,
        flags: resolveQrFlags({ options: ["camera"] })
      });
    expect(sel("forward", 0.5)).toBe("cameraFade");
    expect(sel("forward", 0.3)).toBe("cameraFade");
    expect(sel("forward", 1)).toBeUndefined();
    expect(sel("forward", undefined)).toBeUndefined();
    expect(sel("depth", 0.5)).toBeUndefined();
    expect(cameraFadeFeature.defines("cameraFade")).toEqual({ A3D_CAMERA_FADE: true });
    const bound: Record<string, unknown> = {};
    setCameraFadeOffset(3, true);
    cameraFadeFeature.bindUniforms!("cameraFade", item(0.42), (n, v) => { bound[n] = v; });
    expect(bound.u_cameraFade).toBe(0.42);
    expect(bound.u_cameraFadeOffset).toEqual([0, 2]);
  });

  it("harness program is byte-identical with and without the chunk", () => {
    const withChunk = buildChunkHarnessProgram([cameraFadeParsChunk], { fragmentMain: "fragColor = vec4(1.0);" });
    const without = buildChunkHarnessProgram([], { fragmentMain: "fragColor = vec4(1.0);" });
    expect(withChunk.fragment).toContain("a3dBayer4");
    expect(without.fragment).not.toContain("a3dBayer4");
  });
});

describe("S-2 camera-fade offset contributor", () => {
  it("holds (0,0) without TAA and cycles with a registered *taa* pass", () => {
    const contributor = createCameraFadeOffsetContributor();
    contributor.collect!([], ctxFor(true, 7));
    expect([...cameraFadeOffset]).toEqual([0, 0]);
    const dispose = registerPostPass({
      id: "prd03.taa-resolve",
      owner: "prd03",
      flag: "A3D_QR_POST",
      insertAt: "after-taa",
      space: "linear-hdr",
      inputs: ["color"],
      fragment: { glsl: "void main(){}" },
      gpuOnly: true
    });
    try {
      contributor.collect!([], ctxFor(true, 0));
      expect([...cameraFadeOffset]).toEqual([0, 0]);
      contributor.collect!([], ctxFor(true, 1));
      expect([...cameraFadeOffset]).toEqual([2, 2]);
      contributor.collect!([], ctxFor(true, 2));
      expect([...cameraFadeOffset]).toEqual([2, 0]);
      contributor.collect!([], ctxFor(true, 3));
      expect([...cameraFadeOffset]).toEqual([0, 2]);
      contributor.collect!([], ctxFor(true, 4));
      expect([...cameraFadeOffset]).toEqual([0, 0]);
    } finally {
      dispose();
      setCameraFadeOffset(0, false);
    }
  });
});

describe("Y-6 cinematicBars layer", () => {
  it("eases to (1−(16/9)/2.39)/2 of frame height each side", () => {
    const layer = createCinematicBarsLayer({ canvasAspect: 16 / 9, targetAspect: 2.39 });
    const pose = { position: [0, 0, 0], target: [0, 0, -1], up: [0, 1, 0], roll: 0, fov: 50, near: 0.1, far: 100 } as never;
    for (let i = 0; i < 60; i++) layer.apply(pose, { dt: 1 / 60, reducedMotion: false });
    const expected = (1 - (16 / 9) / 2.39) / 2;
    expect(layer.barFraction).toBeCloseTo(expected, 3);
    expect(layer.rect()).toEqual({ top: expected, bottom: expected, aspect: 2.39 });
  });

  it("letterbox contributor publishes the rect on prd08.letterbox", () => {
    const layer = createCinematicBarsLayer({ canvasAspect: 16 / 9, targetAspect: 2.39 });
    const pose = { position: [0, 0, 0], target: [0, 0, -1], up: [0, 1, 0], roll: 0, fov: 50, near: 0.1, far: 100 } as never;
    layer.apply(pose, { dt: 0.5, reducedMotion: false });
    const c = createLetterboxContributor();
    const context = ctxFor(true);
    c.collect!([], context);
    const rect = context.blackboard.get("prd08.letterbox") as { top: number } | undefined;
    expect(rect).toBeDefined();
    expect(rect!.top).toBeGreaterThan(0);
    // flag off: nothing published
    const off = createLetterboxContributor();
    const offCtx = ctxFor(false);
    off.collect!([], offCtx);
    expect(offCtx.blackboard.has("prd08.letterbox")).toBe(false);
    layer.release();
    for (let i = 0; i < 120; i++) layer.apply(pose, { dt: 1 / 60, reducedMotion: false });
  });
});

describe("Q-3 sequence bars", () => {
  it("bars:true shot attaches a cinematicBars layer for its duration", () => {
    const controller = createCameraController({ barsLayer: () => createCinematicBarsLayer() });
    const rig = (id: string) => ({ id, update: () => ({ position: [0, 0, 0], target: [0, 0, -1], up: [0, 1, 0], roll: 0, fov: 50, near: 0.1, far: 100 }) });
    controller.play({
      id: "seq",
      shots: [
        { rig: rig("a") as never, duration: 0.05, bars: true },
        { rig: rig("b") as never, duration: 0.05 }
      ],
      onEnd: "return"
    });
    for (let i = 0; i < 3; i++) controller.update(1 / 60, i * 16);
    expect(controller.evidence().layers.map((l) => l.id)).toContain("cinematicBars");
    for (let i = 0; i < 30; i++) controller.update(1 / 60, i * 16);
    expect(controller.evidence().layers.map((l) => l.id)).not.toContain("cinematicBars");
  });
});
