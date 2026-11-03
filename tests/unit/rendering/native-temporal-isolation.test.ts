import { describe, expect, it } from "vitest";
import type { RenderItem } from "../../../packages/rendering/src/ForwardPass";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { registerFrameContributor } from "../../../packages/rendering/src/contracts/frameGraph";
import { registerPostPass } from "../../../packages/rendering/src/contracts/post";
import { createRendererFrameHooks } from "../../../packages/rendering/src/renderer/FrameGraph";
import { cameraFadeFeature, createCameraFadeOffsetContributor, setCameraFadeOffset } from "../../../packages/rendering/src/shaders/camera-fade.glsl";

describe("temporal fade ownership", () => {
  it("retains each app/view's frame offset across interleaved collects and draw copies", () => {
    const scopeA = {}, scopeB = {};
    const flags = { values: {}, on: (flag: string) => flag === "A3D_QR_CAMERA" };
    const item = { geometry: Geometry.triangle(), cameraFade: 0.5 } as RenderItem;
    const contributor = createCameraFadeOffsetContributor();
    const unregister = registerFrameContributor(contributor);
    const release = registerPostPass({ id: "test.foreign-taa", owner: "prd03", flag: "A3D_QR_POST", insertAt: "before-taa", space: "linear-hdr", inputs: ["color"], fragment: { glsl: "void main() {}" }, gpuOnly: true, postScopeMatches: scope => scope === scopeA });
    const collect = (scope: object | undefined, frameIndex: number, temporalAntialiasing?: boolean) => {
      const hooks = createRendererFrameHooks({ device: new MockRenderDevice(), width: 8, height: 8, source: [], camera: null,
        flags, postScopeId: scope, frameIndex, temporalAntialiasing, timeSeconds: 1 });
      return hooks.collect([item])[0]!;
    };
    const uniform = (value: RenderItem) => {
      const values = new Map<string, unknown>();
      cameraFadeFeature.bindUniforms!(true, value, (name, data) => values.set(name, data));
      return values.get("u_cameraFadeOffset");
    };
    try {
      const leftA = collect(scopeA, 1, true);
      const rightA = collect(scopeA, 1, true);
      const firstB = collect(scopeB, 3, false);
      expect(uniform(leftA)).toEqual([2, 2]);
      expect(uniform(rightA)).toEqual([2, 2]);
      expect(uniform(firstB)).toEqual([0, 0]);
      expect((leftA as RenderItem & { temporalObjectKey: unknown }).temporalObjectKey).toBe(item);
      const nextA = collect(scopeA, 2, true);
      expect(uniform({ ...leftA })).toEqual([2, 2]);
      expect(uniform(nextA)).toEqual([2, 0]);
      expect(uniform(firstB)).toEqual([0, 0]);
      // The no-scope interface retains the existing registry/global behavior.
      const legacy = collect(undefined, 3);
      expect(legacy).toBe(item);
      expect(uniform(legacy)).toEqual([0, 2]);
    } finally { release(); unregister(); setCameraFadeOffset(0, false); item.geometry.dispose(); }
  });
});

describe("temporal raster camera publication", () => {
  it("updates already-planned passes without changing the caller camera or another view", () => {
    const matrix = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const camera = { viewMatrix: matrix, projectionMatrix: matrix, viewProjectionMatrix: matrix,
      previousViewProjectionMatrix: null, near: 0.1, far: 100, projection: "perspective" as const, position: [0, 0, 0] as const };
    const device = new MockRenderDevice();
    const view = (viewId: string) => createRendererFrameHooks({ device, width: 8, height: 8, source: [], camera,
      postScopeId: {}, viewId, frameIndex: 2, timeSeconds: 1, rasterViewportIsFull: true });
    const left = view("left"), right = view("right");
    const planned = left.frameContext([]), other = right.frameContext([]);
    const retained = planned.rasterViewProjectionMatrix!;
    expect(retained).not.toBe(matrix);
    const jittered = Float32Array.from(matrix);
    jittered[8] = 0.125;
    jittered[9] = -0.25;
    left.setRasterViewProjectionMatrix(jittered);
    expect(planned.rasterViewProjectionMatrix).toBe(retained);
    expect(Array.from(retained)).toEqual(Array.from(jittered));
    expect(Array.from(other.rasterViewProjectionMatrix!)).toEqual(Array.from(matrix));
    expect(matrix[8]).toBe(0);
    expect(matrix[9]).toBe(0);
    left.setRasterViewportIsFull(false);
    expect(left.frameContext([]).rasterViewportIsFull).toBe(false);
    expect(other.rasterViewportIsFull).toBe(true);
  });
});
