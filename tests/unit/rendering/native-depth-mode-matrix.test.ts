import { Matrix4, Vector3, type ProjectionClipRange } from "@aura3d/math";
import { describe, expect, it } from "vitest";
import { resolveProductionCameraDepth } from "../../../packages/engine/src/agent-api/compiler/cameraDepth.js";
import { DepthPass } from "../../../packages/rendering/src/DepthPass.js";
import { encodeViewDepth, linearizeDepth, negotiateDepthConvention, type DepthConvention, type DepthMode } from "../../../packages/rendering/src/DepthConvention.js";
import { Geometry } from "../../../packages/rendering/src/Geometry.js";
import { MockRenderDevice, type DrawCommand } from "../../../packages/rendering/src/RenderDevice.js";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial.js";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer.js";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat.js";
import { applyFrameDepthConvention, withStandardDeviceDepth } from "../../../packages/rendering/src/renderer/FrameDepthConvention.js";

/**
 * WP-30 depth-mode matrix (CPU and mock device): every depth mode crossed with
 * both clip ranges for near/far mapping over large ranges, tiled seams,
 * clipped depth submission, depth-aware effect linearization and explicit
 * unsupported-device fallback.
 */
const modes: DepthMode[] = ["standard", "reversed", "logarithmic"];
const ranges: ProjectionClipRange[] = ["minus-one-to-one", "zero-to-one"];
const full = { reversed: true, logarithmic: true };

const convention = (mode: DepthMode, clipRange: ProjectionClipRange): DepthConvention =>
  negotiateDepthConvention({ mode }, { clipRange, ...full });

describe("depth mode matrix: near/far mapping over large ranges", () => {
  const near = 0.01, far = 1e6;
  const distances = [0.01, 0.02, 1, 1000, 5e5, 1e6];

  it.each(modes.flatMap((mode) => ranges.map((clipRange) => ({ mode, clipRange }))))(
    "$mode / $clipRange: maps near and far to the declared endpoints, orders monotonically and linearizes",
    ({ mode, clipRange }) => {
      const depth = convention(mode, clipRange);
      const projection = Matrix4.frustum(-0.01, 0.01, -0.01, 0.01, near, far, { clipRange, mode });
      const inverse = projection.inverse().elements;
      const stored = distances.map((distance) => encodeViewDepth(distance, projection.elements, depth, { near, far }));
      expect(stored[0]).toBeCloseTo(mode === "reversed" ? 1 : 0, 9);
      expect(stored.at(-1)).toBeCloseTo(mode === "reversed" ? 0 : 1, 9);
      for (let index = 1; index < stored.length; index += 1) {
        expect(mode === "reversed" ? stored[index]! < stored[index - 1]! : stored[index]! > stored[index - 1]!).toBe(true);
      }
      // Depth-aware effects reconstruct distance from the stored value.
      distances.forEach((distance, index) => {
        // The far endpoint can round a few ulps past 1 in double precision.
        const value = Math.min(1, Math.max(0, stored[index]!));
        expect(linearizeDepth(value, inverse, depth, { near, far }) / distance).toBeCloseTo(1, 5);
      });
    }
  );

  it("separates far surfaces in a 32-bit float buffer only with zero-to-one reversed or logarithmic depth", () => {
    const store = (mode: DepthMode, clipRange: ProjectionClipRange, distance: number) => Math.fround(encodeViewDepth(distance,
      Matrix4.frustum(-0.01, 0.01, -0.01, 0.01, near, far, { clipRange, mode }).elements, convention(mode, clipRange), { near, far }));
    const separated = (mode: DepthMode, clipRange: ProjectionClipRange) => store(mode, clipRange, 5e5) !== store(mode, clipRange, 1e6);
    expect(separated("reversed", "zero-to-one")).toBe(true);
    expect(separated("logarithmic", "minus-one-to-one")).toBe(true);
    // Standard depth crowds the far range against 1.0 and loses the distinction.
    expect(separated("standard", "minus-one-to-one")).toBe(false);
    expect(separated("standard", "zero-to-one")).toBe(false);
  });
});

describe("depth mode matrix: tiled seams", () => {
  it.each(modes.flatMap((mode) => ranges.map((clipRange) => ({ mode, clipRange }))))(
    "$mode / $clipRange: adjoining tiles agree on the shared edge's position and depth",
    ({ mode, clipRange }) => {
      const near = 0.1, far = 5000;
      const depth = convention(mode, clipRange);
      const left = Matrix4.frustum(-0.06, 0.02, -0.03, 0.04, near, far, { clipRange, mode });
      const right = Matrix4.frustum(0.02, 0.09, -0.03, 0.04, near, far, { clipRange, mode });
      for (const distance of [0.1, 3, 700, 5000]) {
        // A point on the shared tile edge x = 0.02 * distance / near.
        const point = new Vector3(0.02 * distance / near, 0.01 * distance / near, -distance);
        const a = left.transformPoint(point), b = right.transformPoint(point);
        expect(a.x).toBeCloseTo(1, 9);
        expect(b.x).toBeCloseTo(-1, 9);
        expect(a.y).toBeCloseTo(b.y, 12);
        expect(encodeViewDepth(distance, left.elements, depth, { near, far }))
          .toBeCloseTo(encodeViewDepth(distance, right.elements, depth, { near, far }), 12);
      }
    }
  );
});

describe("depth mode matrix: clipped depth submission", () => {
  function draws(device: MockRenderDevice): DrawCommand[] {
    return device.drawCommands;
  }

  it.each(modes.flatMap((mode) => ranges.map((clipRange) => ({ mode, clipRange }))))(
    "$mode / $clipRange: carries the same clipping groups with the convention's compare, range and encoding",
    ({ mode, clipRange }) => {
      const device = new MockRenderDevice();
      const mesh = Geometry.triangle();
      const points = new Geometry(new VertexBuffer(VertexFormat.P3, 2), null, "points");
      points.vertexBuffer.setAttribute(0, "position", [-1, 0, 0]);
      points.vertexBuffer.setAttribute(1, "position", [1, 0, 0]);
      const material = new UnlitMaterial();
      const view = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3, 1];
      try {
        device.beginFrame(8, 8);
        new DepthPass({
          clippingPass: "depth", globalClipping: { planes: [[1, 0, 0, 0]] },
          depthConvention: convention(mode, clipRange),
          ...(mode === "logarithmic" ? { depthViewMatrix: view, depthRange: { near: 0.1, far: 100 } } : {}),
          casters: [{ geometry: mesh, material }, { geometry: points, material }]
        }).execute({ device, width: 8, height: 8 });
        const [meshDraw, pointDraw] = draws(device);
        expect(draws(device)).toHaveLength(2);
        // Mesh fragments are clipped by the program; points by their centres.
        expect(meshDraw!.uniforms!.get("u_a3dClipGroupCount")).toBe(1);
        expect(pointDraw!.indexCount).toBe(1);
        for (const draw of [meshDraw!, pointDraw!]) {
          expect(draw.uniforms!.get("u_a3dClipRange")).toBe(clipRange === "zero-to-one" ? 1 : 0);
          expect(draw.uniforms!.get("u_a3dLogDepthEnabled")).toBe(mode === "logarithmic" ? 1 : 0);
          expect(draw.renderState?.depthCompareV2).toBe(mode === "reversed" ? "greater-equal" : undefined);
          if (mode === "logarithmic") expect(Array.from(draw.uniforms!.get("u_a3dLogDepthRange") as ArrayLike<number>)).toEqual([0.1, 100]);
        }
        device.endFrame();
      } finally { mesh.dispose(); points.dispose(); material.dispose(); device.dispose(); }
    }
  );
});

describe("depth mode matrix: unsupported-device fallback", () => {
  it.each(["reversed", "logarithmic"] as const)("%s: fails without capability unless fallback is explicit, then reports it", (mode) => {
    for (const clipRange of ranges) {
      const none = { clipRange, reversed: false, logarithmic: false };
      expect(() => negotiateDepthConvention({ mode }, none)).toThrow(/DEPTH_MODE_UNSUPPORTED/);
      expect(() => negotiateDepthConvention({ mode, allowFallback: false }, none)).toThrow(/DEPTH_MODE_UNSUPPORTED/);
      const fallback = negotiateDepthConvention({ mode, allowFallback: true }, none);
      expect(fallback).toMatchObject({ requestedMode: mode, mode: "standard", clipRange, clearValue: 1, compare: "less-equal", biasSign: 1 });
      expect(fallback.fallbackReason).toContain(mode);
      // A capable pipeline never reports a fallback, even when one is allowed.
      expect(negotiateDepthConvention({ mode, allowFallback: true }, { clipRange, ...full })).not.toHaveProperty("fallbackReason");
    }
  });

  it.each(["reversed", "logarithmic"] as const)("%s: production cameras publish native depth regardless of allowFallback", (mode) => {
    for (const allowFallback of [undefined, false, true]) {
      const { depthConvention } = resolveProductionCameraDepth({ mode: "perspective", near: 0.1, far: 100,
        depth: allowFallback === undefined ? { mode } : { mode, allowFallback } });
      expect(depthConvention).toMatchObject({ requestedMode: mode, mode });
      expect(depthConvention).not.toHaveProperty("fallbackReason");
    }
  });

  it("rejects nonstandard frames on a device without a depth convention and scopes standard light depth elsewhere", () => {
    const device = new MockRenderDevice();
    const legacy = Object.assign(Object.create(device) as MockRenderDevice, { getDepthConvention: undefined, setDepthConvention: undefined });
    try {
      expect(applyFrameDepthConvention(legacy, "standard")).toBeUndefined();
      for (const mode of ["reversed", "logarithmic"] as const) {
        expect(() => applyFrameDepthConvention(legacy, mode, { near: 0.1, far: 10 })).toThrow(expect.objectContaining({ code: "DEPTH_MODE_UNSUPPORTED" }));
      }
      // A capable device applies the frame mode; standard light passes are scoped inside it.
      expect(applyFrameDepthConvention(device, "reversed")?.mode).toBe("reversed");
      expect(withStandardDeviceDepth(device, () => device.getDepthConvention().mode)).toBe("standard");
      expect(device.getDepthConvention().mode).toBe("reversed");
      expect(() => applyFrameDepthConvention(device, "logarithmic")).toThrow(expect.objectContaining({ code: "DEPTH_MODE_UNSUPPORTED" }));
    } finally { device.dispose(); }
  });
});
