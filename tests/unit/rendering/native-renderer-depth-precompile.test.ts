import { describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd02";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { identityMat4, PerspectiveCamera, Scene } from "@aura3d/scene";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import type { RenderItem } from "../../../packages/rendering/src/ForwardPass";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import type { DepthConvention } from "../../../packages/rendering/src/DepthConvention";
import { registerFrameContributor, type FrameCamera } from "../../../packages/rendering/src/contracts/frameGraph";

const FLAGS = resolveQrFlags({ options: { A3D_QR_CORE: true, A3D_QR_LIGHTING: true } });
const IDENTITY = identityMat4();
const STANDARD = { kind: "perspective", near: 0.1, far: 100, mode: "standard", clipRange: "minus-one-to-one" } as const;

async function fixture() {
  const renderer = await Renderer.create({ backend: "mock", width: 32, height: 16, qrFlags: FLAGS });
  const geometry = Geometry.litCube(0.25);
  const material = new PBRMaterial({ name: "depth-precompile" });
  const collectRenderItems = vi.fn((): RenderItem[] => [{ geometry, material, label: "cube" }]);
  const source = { collectRenderItems };
  const compile = vi.spyOn(renderer.device, "createShaderProgram");
  const begin = vi.spyOn(renderer.device, "beginFrame");
  const draw = vi.spyOn(renderer.device, "draw");
  return { renderer, geometry, material, source, collectRenderItems, compile, begin, draw,
    dispose() { renderer.dispose(); geometry.dispose(); material.dispose(); } };
}

describe("renderer depth preflight", () => {
  it.each([
    { mode: "standard", clipRange: "zero-to-one" },
    { mode: "reversed", clipRange: "zero-to-one" },
    { mode: "logarithmic", clipRange: "zero-to-one" }
  ] as const)("rejects $mode / $clipRange before source collection or compilation", async (depth) => {
    const f = await fixture();
    try {
      const camera = { viewProjectionMatrix: IDENTITY, projectionMetadata: { ...STANDARD, ...depth } };
      await expect(f.renderer.precompile(f.source, camera)).rejects.toMatchObject({ code: "DEPTH_MODE_UNSUPPORTED" });
      expect(f.collectRenderItems).not.toHaveBeenCalled();
      expect(f.compile).not.toHaveBeenCalled();
      expect(f.begin).not.toHaveBeenCalled();
      expect(f.draw).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it.each(["reversed", "logarithmic"] as const)("negotiates native %s depth on the device and warms the matching program variant", async (mode) => {
    const f = await fixture();
    try {
      const camera = { viewProjectionMatrix: IDENTITY, viewMatrix: IDENTITY, projectionMetadata: { ...STANDARD, mode } };
      const result = await f.renderer.precompile(f.source, camera);
      expect(result.compiledPrograms).toBeGreaterThan(0);
      expect(f.renderer.device.getDepthConvention?.()).toMatchObject(mode === "reversed"
        ? { mode, clearValue: 0, compare: "greater-equal", biasSign: -1 }
        : { mode, clearValue: 1, compare: "less-equal", biasSign: 1, logRange: { near: 0.1, far: 100, kind: "perspective" } });
      const sources = f.compile.mock.calls.map((call) => JSON.stringify(call[0]));
      expect(sources.some((source) => source.includes("#define A3D_LOG_DEPTH 1"))).toBe(mode === "logarithmic");
      // A later standard camera restores the standard convention.
      await f.renderer.precompile(f.source, { viewProjectionMatrix: IDENTITY, projectionMetadata: STANDARD });
      expect(f.renderer.device.getDepthConvention?.()).toMatchObject({ mode: "standard", clearValue: 1 });
      expect(f.begin).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it("rejects logarithmic depth without a finite near/far range before compilation", async () => {
    const f = await fixture();
    try {
      await expect(f.renderer.precompile(f.source, { viewProjectionMatrix: IDENTITY,
        projectionMetadata: { kind: "custom", mode: "logarithmic", clipRange: "minus-one-to-one" } })).rejects.toMatchObject({ code: "DEPTH_MODE_UNSUPPORTED" });
      expect(f.collectRenderItems).not.toHaveBeenCalled();
      expect(f.compile).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it("no longer rejects logarithmic depth for a WebGPU device kind (generated WGSL writes frag_depth)", async () => {
    const f = await fixture();
    try {
      Object.defineProperty(f.renderer.device, "kind", { configurable: true, value: "webgpu" });
      const camera = { viewProjectionMatrix: IDENTITY, viewMatrix: IDENTITY, projectionMetadata: { ...STANDARD, mode: "logarithmic" as const } };
      await expect(f.renderer.precompile(f.source, camera)).resolves.toMatchObject({ compiledPrograms: expect.any(Number) });
      expect(f.renderer.device.getDepthConvention?.()).toMatchObject({ mode: "logarithmic", logRange: { near: 0.1, far: 100 } });
    } finally { f.dispose(); }
  });

  it("checks the updated scene camera rather than its previous published metadata", async () => {
    const f = await fixture();
    const scene = new Scene();
    const camera = scene.createPerspectiveCamera();
    scene.root.addChild(camera);
    const collect = vi.spyOn(scene, "collectRenderables");
    try {
      expect(camera.projectionMetadata.mode).toBe("standard");
      camera.depth = { mode: "standard", clipRange: "zero-to-one" };
      await expect(f.renderer.precompile(scene)).rejects.toMatchObject({ code: "DEPTH_MODE_UNSUPPORTED" });
      expect(camera.projectionMetadata.clipRange).toBe("zero-to-one");
      expect(collect).not.toHaveBeenCalled();
      expect(f.compile).not.toHaveBeenCalled();
      expect(f.begin).not.toHaveBeenCalled();
    } finally { scene.dispose(); f.dispose(); }
  });

  it("rejects a camera projection and depth convention that disagree before compilation", async () => {
    const f = await fixture();
    try {
      const camera = { viewProjectionMatrix: IDENTITY, projectionMetadata: STANDARD,
        depthConvention: { requestedMode: "reversed", mode: "reversed", clipRange: "minus-one-to-one",
          clearValue: 0, compare: "greater-equal", biasSign: -1 } as const };
      await expect(f.renderer.precompile(f.source, camera)).rejects.toMatchObject({ code: "FRAME_DEPTH_CONVENTION_MISMATCH" });
      expect(f.collectRenderItems).not.toHaveBeenCalled();
      expect(f.compile).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it("permits a standard camera with a standard zero-to-one device depth convention", async () => {
    const f = await fixture();
    try {
      Object.defineProperty(f.renderer.device, "getDepthConvention", { configurable: true, value: () => ({
        requestedMode: "standard", mode: "standard", clipRange: "zero-to-one", clearValue: 1, compare: "less-equal", biasSign: 1
      }) });
      const result = await f.renderer.precompile(f.source, { viewProjectionMatrix: IDENTITY, projectionMetadata: STANDARD });
      expect(result.compiledPrograms).toBeGreaterThan(0);
      expect(f.begin).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it("accepts a camera rebuilt to standard depth and actually warms its generated program", async () => {
    const f = await fixture();
    try {
      const camera = new PerspectiveCamera({ depth: { mode: "reversed" } });
      camera.depth = { mode: "standard", clipRange: "minus-one-to-one" };
      expect(camera.projectionMetadata.mode).toBe("reversed");
      const result = await f.renderer.precompile(f.source, camera);
      expect(camera.projectionMetadata.mode).toBe("standard");
      expect(f.collectRenderItems).toHaveBeenCalledTimes(1);
      expect(result.compiledPrograms).toBeGreaterThan(0);
      expect(f.compile).toHaveBeenCalled();
      expect(f.begin).not.toHaveBeenCalled();
      expect(f.draw).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it("checks every updated view before collecting a shared source or warming the first view", async () => {
    const f = await fixture();
    try {
      const left = new PerspectiveCamera();
      const right = new PerspectiveCamera();
      right.depth = { mode: "reversed", clipRange: "zero-to-one" };
      const views = [
        { camera: left, viewport: { x: 0, y: 0, width: 16, height: 16 } },
        { camera: right, viewport: { x: 16, y: 0, width: 16, height: 16 } }
      ];
      await expect(f.renderer.precompile({ source: f.source, views })).rejects.toMatchObject({ code: "DEPTH_MODE_UNSUPPORTED" });
      expect(right.projectionMetadata).toMatchObject({ mode: "reversed", clipRange: "zero-to-one" });
      expect(f.collectRenderItems).not.toHaveBeenCalled();
      expect(f.compile).not.toHaveBeenCalled();
      expect(f.begin).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it("keeps each shared camera view's own frustum while warming both views", async () => {
    const f = await fixture();
    try {
      const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 3, near: 0.1, far: 20 });
      const modelMatrix = identityMat4();
      modelMatrix[12] = 1;
      modelMatrix[14] = -2;
      f.collectRenderItems.mockReturnValue([{ geometry: f.geometry, material: f.material, label: "right-only", modelMatrix }]);
      const source = { ...f.source, frustumCulling: true };
      const internals = f.renderer as unknown as { warmGeneratedPrograms(...args: unknown[]): Promise<void> };
      const warm = vi.spyOn(internals, "warmGeneratedPrograms");
      const result = await f.renderer.precompile({ source, views: [
        { camera, viewport: { x: 0, y: 0, width: 4, height: 8 } },
        { camera, viewport: { x: 4, y: 0, width: 16, height: 8 } }
      ] });
      expect(f.collectRenderItems).toHaveBeenCalledTimes(1);
      expect(warm.mock.calls.map((call) => (call[0] as Array<{ label?: string }>).map(item => item.label)))
        .toEqual([[], ["right-only"]]);
      expect(result.compiledPrograms).toBeGreaterThan(0);
      expect(f.begin).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it.each(["sync", "async"] as const)("checks later updated views before any %s draw", async (mode) => {
    const f = await fixture();
    try {
      const right = new PerspectiveCamera();
      right.depth = { mode: "reversed", clipRange: "zero-to-one" };
      const input = { source: f.source, views: [
        { camera: new PerspectiveCamera(), viewport: { x: 0, y: 0, width: 16, height: 16 } },
        { camera: right, viewport: { x: 16, y: 0, width: 16, height: 16 } }
      ] };
      if (mode === "sync") {
        let failure: unknown;
        try { f.renderer.render(input); } catch (error) { failure = error; }
        expect(failure).toMatchObject({ code: "DEPTH_MODE_UNSUPPORTED" });
      } else await expect(f.renderer.renderAsync(input)).rejects.toMatchObject({ code: "DEPTH_MODE_UNSUPPORTED" });
      expect(f.collectRenderItems).not.toHaveBeenCalled();
      expect(f.compile).not.toHaveBeenCalled();
      expect(f.begin).not.toHaveBeenCalled();
      expect(f.draw).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });
});

describe("updated camera frame metadata", () => {
  it.each(["sync", "async"] as const)("reuses each shared concrete camera snapshot for the %s view", async (mode) => {
    const flags = { values: { A3D_QR_POST: true }, on: (name: string) => name === "A3D_QR_POST" };
    const renderer = await Renderer.create({ backend: "mock", width: 32, height: 16, qrFlags: flags });
    const geometry = Geometry.litCube(0.25);
    const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 3, near: 0.1, far: 20 });
    const originalResize = camera.resize.bind(camera);
    const updates = vi.spyOn(camera, "updateCameraMatrices");
    const resizes = vi.spyOn(camera, "resize").mockImplementation((width, height) => {
      camera.near = width === 4 ? 0.1 : 0.5;
      camera.transform.setPosition(width === 4 ? 0.25 : -0.25, 0, 0);
      originalResize(width, height);
    });
    const frames: Array<{ camera: FrameCamera | null; labels: Array<string | undefined> }> = [];
    const unregister = registerFrameContributor({ id: "prd03.shared-camera-snapshot-test", owner: "prd03", flag: "A3D_QR_POST", phases: ["collect"],
      collect: (items, context) => { frames.push({ camera: context.camera, labels: items.map(item => item.label) }); return items; } });
    const modelMatrix = identityMat4(); modelMatrix[12] = 1; modelMatrix[14] = -2;
    const input = { source: { frustumCulling: true, renderItems: [{ geometry, modelMatrix, label: "wide-only" }] }, views: [
      { camera, viewport: { x: 0, y: 0, width: 4, height: 8 } },
      { camera, viewport: { x: 4, y: 0, width: 16, height: 8 } }
    ] };
    try {
      if (mode === "sync") renderer.render(input); else await renderer.renderAsync(input);
      expect(resizes.mock.calls).toEqual([[4, 8], [16, 8]]);
      // PerspectiveCamera.resize rebuilds once; the renderer requests one final update.
      expect(updates).toHaveBeenCalledTimes(4);
      expect(frames.map(frame => frame.labels)).toEqual([[], ["wide-only"]]);
      expect(frames.map(frame => frame.camera?.near)).toEqual([0.1, 0.5]);
      expect(frames.map(frame => frame.camera?.position[0])).toEqual([0.25, -0.25]);
      expect(frames[0]!.camera!.projectionMatrix[0]).toBeGreaterThan(frames[1]!.camera!.projectionMatrix[0]!);
      for (const frame of frames) {
        expect(frame.camera!.projectionMatrix[0]! * frame.camera!.projectionMatrixInverse![0]!).toBeCloseTo(1);
      }
    } finally { unregister(); renderer.dispose(); geometry.dispose(); }
  });

  it.each(["sync", "async"] as const)("publishes the updated inverse, depth and layer to the %s frame", async (mode) => {
    const flags = { values: { A3D_QR_POST: true }, on: (name: string) => name === "A3D_QR_POST" };
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: flags });
    const geometry = Geometry.triangle();
    let frame: FrameCamera | null = null;
    let itemCount = -1;
    const unregister = registerFrameContributor({ id: "prd03.depth-metadata-test", owner: "prd03", flag: "A3D_QR_POST", phases: ["collect"],
      collect: (items, context) => { frame = context.camera; itemCount = items.length; return items; } });
    const projection = identityMat4(); projection[0] = 2;
    const inverse = identityMat4(); inverse[0] = 0.5;
    const events: string[] = [];
    const standardDepth: DepthConvention = { requestedMode: "standard", mode: "standard", clipRange: "minus-one-to-one",
      clearValue: 1, compare: "less-equal", biasSign: 1 };
    const reversedDepth: DepthConvention = { requestedMode: "reversed", mode: "reversed", clipRange: "minus-one-to-one",
      clearValue: 0, compare: "greater-equal", biasSign: -1 };
    const camera = {
      viewMatrix: identityMat4(), projectionMatrix: identityMat4(), viewProjectionMatrix: identityMat4(),
      projectionMatrixInverse: identityMat4(), projectionMetadata: { ...STANDARD, near: 0.1 as number, far: 100 as number, mode: "reversed" as "standard" | "reversed" }, layerMask: 1,
      depthConvention: reversedDepth,
      resize(width: number, height: number) { events.push(`resize:${width}x${height}`); },
      updateCameraMatrices() {
        events.push("update");
        this.projectionMatrix = projection;
        this.viewProjectionMatrix = projection;
        this.projectionMatrixInverse = inverse;
        this.projectionMetadata = { ...STANDARD, near: 2, far: 11 };
        this.depthConvention = standardDepth;
        this.layerMask = 2;
      }
    };
    const source = { renderItems: [{ geometry, layerMask: 2 }] };
    try {
      if (mode === "sync") renderer.render(source, camera); else await renderer.renderAsync(source, camera);
      expect(events).toEqual(["resize:8x8", "update"]);
      expect(itemCount).toBe(1);
      expect(frame).not.toBeNull();
      const observed = frame as unknown as FrameCamera;
      expect(observed.near).toBe(2);
      expect(observed.far).toBe(11);
      expect(observed.depth).toMatchObject({ mode: "standard", clipRange: "minus-one-to-one" });
      expect(observed.projectionMatrix[0]).toBe(2);
      expect(observed.projectionMatrixInverse?.[0]).toBe(0.5);
    } finally { unregister(); renderer.dispose(); geometry.dispose(); }
  });
});
