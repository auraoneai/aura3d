import { describe, expect, it, vi } from "vitest";
import { lookAtMat4, multiplyMat4, perspectiveMat4, type Mat4 } from "@aura3d/scene";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import {
  assertSceneRasterLineUniformsCurrent, assertSceneRasterSnapshotCurrent, createSceneRasterSnapshot, snapshotSceneRasterLineUniforms,
  type SceneRasterLineUniformInput, type SceneRasterSnapshotInput
} from "../../../packages/rendering/src/renderer/SceneRasterSnapshot";

function jitter(matrix: Float32Array, offset: readonly [number, number]): Float32Array {
  const result = new Float32Array(matrix);
  for (let column = 0; column < 4; column += 1) {
    result[column * 4] = result[column * 4]! + offset[0] * result[column * 4 + 3]!;
    result[column * 4 + 1] = result[column * 4 + 1]! + offset[1] * result[column * 4 + 3]!;
  }
  return result;
}

function frame() {
  const device = new MockRenderDevice();
  Object.defineProperty(device, "generation", { value: 1, writable: true, configurable: true });
  device.beginFrame(800, 600);
  const owner = {}, viewId = {}, frameId = 17;
  const view = Float32Array.from(lookAtMat4([3, 4, 8], [0, 0, 0], [0, 1, 0]));
  const projection = Float32Array.from(perspectiveMat4(Math.PI / 3, 4 / 3, 0.1, 80));
  const unjittered = Float32Array.from(multiplyMat4(Array.from(projection) as Mat4, Array.from(view) as Mat4));
  const offset = [0.0025, -0.004] as const;
  const input: SceneRasterSnapshotInput = {
    owner, device, viewId, frameId, viewMatrix: view, projectionMatrix: jitter(projection, offset),
    viewProjectionMatrix: jitter(unjittered, offset), unjitteredViewProjectionMatrix: unjittered, jitterClip: offset,
    depth: { mode: "standard", clipRange: "minus-one-to-one" },
    targetExtent: { width: 800, height: 600 }, viewport: { x: 20, y: 30, width: 720, height: 500 },
    scissor: { x: 40, y: 50, width: 600, height: 400 }, cssExtent: { width: 400, height: 300 }, devicePixelRatio: 2
  };
  return { device, owner, viewId, frameId, input };
}

function expectIdentity(product: readonly number[]): void {
  for (let index = 0; index < 16; index += 1) expect(product[index]).toBeCloseTo(index % 5 === 0 ? 1 : 0, 4);
}

describe("immutable scene raster values", () => {
  it("copies the actual jittered camera, inverses and distinct physical rectangles", () => {
    const f = frame();
    try {
      const snapshot = createSceneRasterSnapshot(f.input);
      const originalView = [...snapshot.viewMatrix], originalProjection = [...snapshot.projectionMatrix];
      expect(snapshot.jitterClip).toEqual([0.0025, -0.004]);
      expect(snapshot.depth).toEqual({ mode: "standard", clipRange: "minus-one-to-one" });
      expect(snapshot.targetExtent).toEqual({ width: 800, height: 600 });
      expect(snapshot.viewport).toEqual({ x: 20, y: 30, width: 720, height: 500 });
      expect(snapshot.scissor).toEqual({ x: 40, y: 50, width: 600, height: 400 });
      expect(snapshot.cssExtent).toEqual({ width: 400, height: 300 });
      expect(snapshot.devicePixelRatio).toBe(2);
      expectIdentity(multiplyMat4(snapshot.viewMatrix as Mat4, snapshot.inverseViewMatrix as Mat4));
      expectIdentity(multiplyMat4(snapshot.projectionMatrix as Mat4, snapshot.inverseProjectionMatrix as Mat4));
      expectIdentity(multiplyMat4(snapshot.viewProjectionMatrix as Mat4, snapshot.inverseViewProjectionMatrix as Mat4));
      (f.input.viewMatrix as Float32Array)[0] = 99;
      (f.input.projectionMatrix as Float32Array)[0] = 99;
      (f.input.viewport as { x: number }).x = 99;
      expect(snapshot.viewMatrix).toEqual(originalView);
      expect(snapshot.projectionMatrix).toEqual(originalProjection);
      expect(snapshot.viewport.x).toBe(20);
      for (const value of [snapshot, snapshot.viewMatrix, snapshot.inverseViewProjectionMatrix, snapshot.jitterClip,
        snapshot.depth, snapshot.targetExtent, snapshot.viewport, snapshot.scissor, snapshot.cssExtent]) {
        expect(Object.isFrozen(value)).toBe(true);
      }
      expect(() => { (snapshot.viewMatrix as unknown as number[])[0] = 5; }).toThrow();
      expect(() => assertSceneRasterSnapshotCurrent(snapshot, f.owner, f.device, f.viewId, f.frameId)).not.toThrow();
    } finally { f.device.endFrame(); f.device.dispose(); }
  });

  it("binds a packet to its owner, device, view, frame and the device's actual frame token", () => {
    const f = frame(), other = frame();
    try {
      const snapshot = createSceneRasterSnapshot(f.input);
      const check = (owner = f.owner, device = f.device, viewId = f.viewId, frameId = f.frameId) =>
        assertSceneRasterSnapshotCurrent(snapshot, owner, device, viewId, frameId);
      expect(() => check()).not.toThrow();
      expect(() => check({})).toThrow(/stale/);
      expect(() => check(f.owner, other.device)).toThrow(/stale/);
      expect(() => check(f.owner, f.device, {})).toThrow(/stale/);
      expect(() => check(f.owner, f.device, f.viewId, f.frameId + 1)).toThrow(/stale/);
      expect(() => assertSceneRasterSnapshotCurrent({ ...snapshot }, f.owner, f.device, f.viewId, f.frameId)).toThrow(/stale/);
      f.device.endFrame();
      expect(() => check()).toThrow(/stale/);
      f.device.beginFrame(800, 600);
      expect(() => check()).toThrow(/stale/);
    } finally { f.device.endFrame(); f.device.dispose(); other.device.endFrame(); other.device.dispose(); }
  });

  it("expires on a generation change or device loss, and requires a live frame", () => {
    const f = frame();
    try {
      const snapshot = createSceneRasterSnapshot(f.input);
      Object.defineProperty(f.device, "generation", { value: 2, configurable: true });
      expect(() => assertSceneRasterSnapshotCurrent(snapshot, f.owner, f.device, f.viewId, f.frameId)).toThrow(/stale/);
      const replacement = createSceneRasterSnapshot(f.input);
      f.device.contextLost = true;
      expect(() => assertSceneRasterSnapshotCurrent(replacement, f.owner, f.device, f.viewId, f.frameId)).toThrow(/stale/);
      expect(() => createSceneRasterSnapshot(f.input)).toThrow(/active frame/);
    } finally { f.device.dispose(); }
    const missingGeneration = new MockRenderDevice();
    missingGeneration.beginFrame(1, 1);
    try { expect(() => createSceneRasterSnapshot({ ...f.input, device: missingGeneration })).toThrow(/generation/); }
    finally { missingGeneration.endFrame(); missingGeneration.dispose(); }
  });

  it("rejects mismatched camera/jitter, singular values and invalid raster dimensions without GPU work", () => {
    const f = frame();
    const clear = vi.spyOn(f.device, "clearRenderTarget"), draw = vi.spyOn(f.device, "draw");
    try {
      const altered = Float32Array.from(f.input.viewProjectionMatrix); altered[0] += 0.5;
      const singular = new Float32Array(16);
      for (const bad of [
        { ...f.input, viewProjectionMatrix: altered },
        { ...f.input, jitterClip: [0, 0] as const },
        { ...f.input, jitterClip: [f.input.jitterClip[0] + 1e-7, f.input.jitterClip[1]] as const },
        { ...f.input, viewMatrix: singular },
        { ...f.input, projectionMatrix: [1, 2, 3] },
        { ...f.input, viewMatrix: [1e100, ...Array.from(f.input.viewMatrix).slice(1)] },
        { ...f.input, targetExtent: { width: 0, height: 600 } },
        { ...f.input, viewport: { x: 100, y: 0, width: 800, height: 10 } },
        { ...f.input, scissor: { x: 0, y: -1, width: 5, height: 5 } },
        { ...f.input, devicePixelRatio: Infinity },
        { ...f.input, depth: { mode: "standard", clipRange: "unknown" } as never }
      ]) expect(() => createSceneRasterSnapshot(bad)).toThrow();
      const offscreen = createSceneRasterSnapshot({ ...f.input, scissor: null, cssExtent: null });
      expect(offscreen.scissor).toBeNull();
      expect(offscreen.cssExtent).toBeNull();
      expect(clear).not.toHaveBeenCalled();
      expect(draw).not.toHaveBeenCalled();
    } finally { f.device.endFrame(); f.device.dispose(); }
  });

  it("does not publish a camera or line packet if an input changes the active frame during capture", () => {
    const f = frame();
    try {
      const viewport = { get x() { f.device.endFrame(); f.device.beginFrame(800, 600); return 0; }, y: 0, width: 100, height: 100 };
      expect(() => createSceneRasterSnapshot({ ...f.input, viewport })).toThrow(/frame changed/);
      const snapshot = createSceneRasterSnapshot(f.input);
      const values: SceneRasterLineUniformInput = { modelMatrix: f.input.viewMatrix, modelViewProjectionMatrix: f.input.viewProjectionMatrix,
        viewMatrix: f.input.viewMatrix, projectionMatrix: f.input.projectionMatrix, clipInverseLineTransform: null,
        resolution: [800, 600], baseColor: [1, 1, 1, 1], width: 1, worldUnits: 0, pixelRatio: 1,
        squareCaps: 0, roundCaps: 0, dashSize: 0, gapSize: 0,
        get dashOffset() { f.device.endFrame(); f.device.beginFrame(800, 600); return 0; } };
      expect(() => snapshotSceneRasterLineUniforms(snapshot, values)).toThrow(/stale/);
    } finally { f.device.endFrame(); f.device.dispose(); }
  });

  it("retains effective per-item line uniforms independent of target size and DPR", () => {
    const f = frame();
    try {
      const snapshot = createSceneRasterSnapshot(f.input);
      const otherSnapshot = createSceneRasterSnapshot(f.input);
      const resolution: [number, number] = [1200, 900];
      const color: [number, number, number, number] = [0.2, 0.4, 0.6, 0.8];
      const input: SceneRasterLineUniformInput = { modelMatrix: f.input.viewMatrix, modelViewProjectionMatrix: f.input.viewProjectionMatrix,
        viewMatrix: f.input.viewMatrix, projectionMatrix: f.input.projectionMatrix, clipInverseLineTransform: f.input.viewMatrix,
        resolution, baseColor: color, width: 3.25, worldUnits: 0, pixelRatio: 1.5,
        squareCaps: 0, roundCaps: 1, dashSize: 4, gapSize: 2, dashOffset: -0.5 };
      const packet = snapshotSceneRasterLineUniforms(snapshot, input);
      expect(() => assertSceneRasterLineUniformsCurrent(packet, snapshot, f.owner, f.device, f.viewId, f.frameId)).not.toThrow();
      expect(() => assertSceneRasterLineUniformsCurrent(packet, otherSnapshot, f.owner, f.device, f.viewId, f.frameId)).toThrow(/different/);
      expect(() => assertSceneRasterLineUniformsCurrent({ ...packet }, snapshot, f.owner, f.device, f.viewId, f.frameId)).toThrow(/different/);
      const original = [...packet.modelViewProjectionMatrix];
      resolution[0] = 50; color[3] = 0; (f.input.viewProjectionMatrix as Float32Array)[0] = 0;
      expect(packet.resolution).toEqual([1200, 900]);
      expect(packet.pixelRatio).toBe(1.5);
      expect(packet.width).toBe(3.25);
      expect(packet.roundCaps).toBe(1);
      expect(packet.dashSize).toBe(4);
      expect(packet.gapSize).toBe(2);
      expect(packet.dashOffset).toBe(-0.5);
      expect(packet.baseColor[3]).toBeCloseTo(0.8);
      expect(packet.modelViewProjectionMatrix).toEqual(original);
      for (const value of [packet, packet.resolution, packet.baseColor, packet.modelMatrix, packet.clipInverseLineTransform]) {
        expect(Object.isFrozen(value)).toBe(true);
      }
      expect(() => snapshotSceneRasterLineUniforms(snapshot, { ...input, resolution: [0, 5] })).toThrow(/dimensions/);
      expect(() => snapshotSceneRasterLineUniforms(snapshot, { ...input, pixelRatio: Infinity })).toThrow(/finite/);
      expect(() => snapshotSceneRasterLineUniforms(snapshot, { ...input, dashSize: 2, gapSize: 0 })).toThrow(/dash/);
      f.device.endFrame(); f.device.beginFrame(800, 600);
      expect(() => assertSceneRasterLineUniformsCurrent(packet, snapshot, f.owner, f.device, f.viewId, f.frameId)).toThrow(/stale/);
      expect(() => snapshotSceneRasterLineUniforms(snapshot, input)).toThrow(/stale/);
    } finally { f.device.endFrame(); f.device.dispose(); }
  });
});
