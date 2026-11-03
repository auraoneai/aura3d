import { Box3, Frustum, Matrix4, Sphere, Vector3, type ProjectionClipRange, type ProjectionDepthMode } from "@aura3d/math";
import { Camera, identityMat4, OrthographicCamera, PerspectiveCamera, type Mat4 } from "@aura3d/scene";
import { describe, expect, it } from "vitest";
import { createCameraProjection } from "../../../packages/engine/src/agent-api/CameraProjection.js";
import {
  encodeViewDepth,
  linearizeDepth,
  negotiateDepthConvention,
  reconstructViewPosition,
  remapDepthCompare,
  resolveDepthDrawState,
  toStandardWindowDepth
} from "../../../packages/rendering/src/DepthConvention.js";
import { resolveProductionCameraDepth } from "../../../packages/engine/src/agent-api/compiler/cameraDepth.js";
import { createCameraProjection as createRootCameraProjection } from "../../../packages/engine/src/agent-api/RootRuntimeSupport.js";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags.js";
import { Geometry } from "../../../packages/rendering/src/Geometry.js";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial.js";
import { Renderer } from "../../../packages/rendering/src/Renderer.js";
import { withStandardDeviceDepth, standardizeDepthReadback } from "../../../packages/rendering/src/renderer/FrameDepthConvention.js";
import { createRendererFrameHooks, toFrameCamera } from "../../../packages/rendering/src/renderer/FrameGraph.js";
import { registerFrameContributor, type FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph.js";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice.js";
import { RenderGraph } from "../../../packages/rendering/src/RenderGraph.js";
import { Texture } from "../../../packages/rendering/src/Texture.js";

const ranges: ProjectionClipRange[] = ["minus-one-to-one", "zero-to-one"];
const modes: ProjectionDepthMode[] = ["standard", "reversed", "logarithmic"];

function expectPoint(actual: readonly number[], expected: readonly number[], precision = 8): void {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < actual.length; i += 1) expect(actual[i]).toBeCloseTo(expected[i], precision);
}

function ndc(matrix: Matrix4, x: number, y: number, z: number): Vector3 {
  return matrix.transformPoint(new Vector3(x, y, z));
}

function coordinateSystem(clipRange: ProjectionClipRange): "webgl" | "webgpu" {
  return clipRange === "minus-one-to-one" ? "webgl" : "webgpu";
}

describe("camera projections and frustum conventions", () => {
  it("maps near and far to the declared endpoints and reconstructs view space", () => {
    for (const clipRange of ranges) for (const mode of modes) {
      const options = { clipRange, mode };
      const low = clipRange === "zero-to-one" ? 0 : -1;
      const nearDepth = mode === "reversed" ? 1 : low;
      const farDepth = mode === "reversed" ? low : 1;
      const near = 0.25;
      const far = 1_000_000;
      for (const projection of [
        Matrix4.perspective(Math.PI / 3, 1.8, near, far, options),
        Matrix4.orthographic(-5, 7, -3, 4, near, far, options)
      ]) {
        expect(ndc(projection, 0, 0, -near).z).toBeCloseTo(nearDepth, 10);
        expect(ndc(projection, 0, 0, -far).z).toBeCloseTo(farDepth, 10);
        const original = new Vector3(0.03, -0.07, -100);
        const roundTrip = projection.inverse().transformPoint(projection.transformPoint(original));
        expectPoint(roundTrip.toArray(), original.toArray(), 6);
      }
    }
  });

  it("culls against the correct near and far planes for both depth intervals and directions", () => {
    for (const clipRange of ranges) for (const mode of modes) {
      const projection = Matrix4.perspective(Math.PI / 2, 1, 1, 10, { clipRange, mode });
      const frustum = Frustum.setFromProjectionMatrix(projection, coordinateSystem(clipRange), mode === "reversed");
      expect(frustum.containsPoint(new Vector3(0, 0, -0.5))).toBe(false);
      expect(frustum.containsPoint(new Vector3(0, 0, -5))).toBe(true);
      expect(frustum.containsPoint(new Vector3(0, 0, -11))).toBe(false);
      expect(frustum.containsPoint(new Vector3(6, 0, -5))).toBe(false);
      expect(frustum.intersectsSphere(new Sphere(new Vector3(0, 0, -10.5), 0.25))).toBe(false);
      expect(frustum.intersectsBox(new Box3(new Vector3(-0.2, -0.2, -11), new Vector3(0.2, 0.2, -10.5)))).toBe(false);
      const ortho = Matrix4.orthographic(-2, 2, -1, 1, mode === "logarithmic" ? 0.5 : 0, 10, { clipRange, mode });
      const orthoFrustum = Frustum.setFromProjectionMatrix(ortho, coordinateSystem(clipRange), mode === "reversed");
      expect(orthoFrustum.containsPoint(new Vector3(0, 0, 1))).toBe(false);
      expect(orthoFrustum.containsPoint(new Vector3(0, 0, -5))).toBe(true);
      expect(orthoFrustum.containsPoint(new Vector3(0, 0, -11))).toBe(false);
      expect(orthoFrustum.containsPoint(new Vector3(3, 0, -5))).toBe(false);
    }
  });

  it("keeps the near plane and side bounds while removing an infinite far plane", () => {
    for (const clipRange of ranges) for (const mode of ["standard", "reversed"] as const) {
      const projection = Matrix4.perspective(Math.PI / 2, 1, 0.1, Infinity, { clipRange, mode });
      const frustum = Frustum.setFromProjectionMatrix(projection, coordinateSystem(clipRange), mode === "reversed");
      expect(frustum.infiniteFar).toBe(true);
      expect(frustum.activePlanes).toHaveLength(5);
      expect(frustum.clone().infiniteFar).toBe(true);
      expect(frustum.containsPoint(new Vector3(0, 0, -0.05))).toBe(false);
      expect(frustum.containsPoint(new Vector3(0, 0, -1e12))).toBe(true);
      expect(frustum.containsPoint(new Vector3(2e12, 0, -1e12))).toBe(false);
      const camera = new PerspectiveCamera({ far: Infinity, depth: { clipRange, mode } });
      expect(camera.frustumPlanes).toHaveLength(5);
      expect(camera.frustum.containsPoint(new Vector3(0, 0, -1e12))).toBe(true);
      expect(camera.projectionMetadata.far).toBe(Infinity);
    }
    expect(() => Matrix4.perspective(1, 1, 0.1, Infinity, { mode: "logarithmic" })).toThrow(/finite far/i);
    expect(() => Matrix4.orthographic(-1, 1, -1, 1, 0, Infinity)).toThrow(/orthographic/i);
  });

  it("constructs asymmetric projections and adjoining tiled views without seams", () => {
    const projection = Matrix4.frustum(-2, 4, -1, 3, 2, 50);
    expectPoint(ndc(projection, -2, -1, -2).toArray(), [-1, -1, -1]);
    expectPoint(ndc(projection, 4, 3, -2).toArray(), [1, 1, -1]);
    expectPoint(ndc(projection, -6, -3, -6).toArray().slice(0, 2), [-1, -1]);

    const left = new PerspectiveCamera({ fovYRadians: Math.PI / 2, aspect: 2, near: 1, far: 20 });
    const right = new PerspectiveCamera({ fovYRadians: Math.PI / 2, aspect: 2, near: 1, far: 20 });
    left.setViewOffset(800, 400, 0, 0, 400, 400);
    right.setViewOffset(800, 400, 400, 0, 400, 400);
    const seam = new Vector3(0, 0.25, -5);
    const leftClip = new Matrix4(left.projectionMatrix).transformPoint(seam);
    const rightClip = new Matrix4(right.projectionMatrix).transformPoint(seam);
    expect(leftClip.x).toBeCloseTo(1);
    expect(rightClip.x).toBeCloseTo(-1);
    expect(leftClip.y).toBeCloseTo(rightClip.y);
    expect(leftClip.z).toBeCloseTo(rightClip.z);
    expect(left.projectionMetadata.viewOffset).toEqual({ fullWidth: 800, fullHeight: 400, x: 0, y: 0, width: 400, height: 400 });

    const top = new OrthographicCamera({ left: -4, right: 4, bottom: -2, top: 2, near: 0, far: 20 });
    const bottom = new OrthographicCamera({ left: -4, right: 4, bottom: -2, top: 2, near: 0, far: 20 });
    top.setViewOffset(800, 400, 0, 0, 800, 200);
    bottom.setViewOffset(800, 400, 0, 200, 800, 200);
    expect(new Matrix4(top.projectionMatrix).transformPoint(seam).y).toBeCloseTo(-0.75);
    expect(new Matrix4(top.projectionMatrix).transformPoint(new Vector3(0, 0, -5)).y).toBeCloseTo(-1);
    expect(new Matrix4(bottom.projectionMatrix).transformPoint(new Vector3(0, 0, -5)).y).toBeCloseTo(1);
    expect(() => left.setViewOffset(800, 400, 600, 0, 400, 400)).toThrow(/offset/i);
  });

  it("uses a physical lens when specified and preserves explicit FOV defaults", () => {
    const camera = new PerspectiveCamera({ fovYRadians: 1, focalLength: 50, filmGauge: 36, aspect: 1.5 });
    expect(camera.getFilmHeight()).toBeCloseTo(24);
    expect(camera.getFilmWidth()).toBeCloseTo(36);
    expect(camera.fovYRadians).toBeCloseTo(2 * Math.atan(24 / 100));
    expect(camera.getFocalLength()).toBeCloseTo(50);
    const centered = [...camera.projectionMatrix];
    camera.filmOffset = 9;
    camera.updateCameraMatrices();
    expect(camera.projectionMatrix[8]).not.toBeCloseTo(centered[8]);
    const shifted = new PerspectiveCamera({ filmGauge: 36, focalLength: 50, aspect: 2, filmOffset: 9, near: 1 });
    expect(new Matrix4(shifted.projectionMatrix).transformPoint(new Vector3(0, 0, -1)).x).toBeCloseTo(-0.5);
    camera.setFieldOfView(Math.PI / 2);
    expect(camera.focalLength).toBeUndefined();
    expect(camera.fovYRadians).toBeCloseTo(Math.PI / 2);
    expect(new PerspectiveCamera().fovYRadians).toBeCloseTo(Math.PI / 3);
    expect(() => camera.setFocalLength(0)).toThrow(/focal/i);
  });

  it("updates inverse and culling metadata atomically and validates projection-specific ranges", () => {
    const camera = new PerspectiveCamera({ near: 0.001, far: 1e12 });
    camera.setDepth({ mode: "reversed", clipRange: "zero-to-one" });
    const identity = new Matrix4(camera.projectionMatrix).multiply(new Matrix4(camera.projectionMatrixInverse));
    expectPoint(identity.elements, Matrix4.identity().elements, 8);
    expect(camera.projectionMetadata).toMatchObject({ kind: "perspective", near: 0.001, far: 1e12, mode: "reversed", clipRange: "zero-to-one" });
    expect(camera.frustum.containsPoint(new Vector3(0, 0, -5))).toBe(true);
    const tinyNear = new PerspectiveCamera({ near: 1e-14, far: 1e12 });
    const tinyIdentity = new Matrix4(tinyNear.projectionMatrix).multiply(new Matrix4(tinyNear.projectionMatrixInverse));
    expectPoint(tinyIdentity.elements, Matrix4.identity().elements, 8);
    const before = [...camera.projectionMatrix];
    expect(() => camera.setDepth({ mode: "invalid" as ProjectionDepthMode })).toThrow(/depth mode/i);
    expect(camera.projectionMatrix).toEqual(before);
    expect(camera.depth.mode).toBe("reversed");

    expect(() => new PerspectiveCamera({ near: 0 })).toThrow(/near/i);
    expect(() => new OrthographicCamera({ near: 0, far: 10 })).not.toThrow();
    // Orthographic projections can include geometry behind the camera plane.
    expect(() => new OrthographicCamera({ near: -1, far: 10 })).not.toThrow();
    expect(() => new OrthographicCamera({ near: 0, far: Infinity })).toThrow(/far/i);
    expect(() => new OrthographicCamera({ near: 0, far: 10, depth: { mode: "logarithmic" } })).toThrow(/near/i);
    expect(() => Matrix4.orthographic(-1, 1, -1, 1, 0, 10, { mode: "logarithmic" })).toThrow(/near/i);
    expect(() => Matrix4.perspective(Math.PI, 1, 0.1, 10)).toThrow(/perspective/i);
    expect(() => Matrix4.frustum(-1, 1, -1, 1, 0.1, 10, { mode: "other" as ProjectionDepthMode })).toThrow(/depth mode/i);
  });

  it("preserves custom Camera subclasses without inventing near and far planes", () => {
    class CustomCamera extends Camera {
      constructor() { super("custom"); }
      computeProjectionMatrix(): Mat4 { return identityMat4(); }
    }
    const camera = new CustomCamera();
    camera.updateCameraMatrices();
    expect(camera.projectionMetadata).toEqual({ kind: "custom", mode: "standard", clipRange: "minus-one-to-one" });
    expect(camera.frustum.containsPoint(new Vector3(0, 0, 0))).toBe(true);
    expect(() => camera.setDepth({ mode: "reversed" })).toThrow(/projection controls/i);
    expect(() => camera.setViewOffset(100, 100, 0, 0, 50, 50)).toThrow(/projection controls/i);
  });
});

describe("negotiated depth encoding and reconstruction", () => {
  it("fails unsupported modes or explicitly reports standard fallback", () => {
    const capabilities = { clipRange: "zero-to-one" as const, reversed: false, logarithmic: false };
    expect(() => negotiateDepthConvention({ mode: "reversed" }, capabilities)).toThrow(/DEPTH_MODE_UNSUPPORTED/);
    const fallback = negotiateDepthConvention({ mode: "logarithmic", allowFallback: true }, capabilities);
    expect(fallback).toMatchObject({ requestedMode: "logarithmic", mode: "standard", clipRange: "zero-to-one", clearValue: 1, compare: "less-equal", biasSign: 1 });
    expect(fallback.fallbackReason).toContain("logarithmic");
  });

  it("round-trips actual off-axis positions for each projection, interval, and depth mode", () => {
    for (const clipRange of ranges) for (const mode of modes) {
      const convention = negotiateDepthConvention({ mode }, { clipRange, reversed: true, logarithmic: true });
      expect(convention.clearValue).toBe(mode === "reversed" ? 0 : 1);
      expect(convention.biasSign).toBe(mode === "reversed" ? -1 : 1);
      const near = 0.5, far = 1000;
      const range = { near, far };
      const projections = [
        Matrix4.frustum(-0.4, 0.8, -0.3, 0.6, near, far, { clipRange, mode }),
        Matrix4.orthographic(-2, 3, -1, 2, near, far, { clipRange, mode })
      ];
      for (const projection of projections) {
        const inverse = projection.inverse().elements;
        for (const distance of [near, 5, far]) {
          const point = new Vector3(0.2, -0.1, -distance);
          const projected = projection.transformPoint(point);
          const rawDepth = encodeViewDepth(distance, projection.elements, convention, range);
          const depth = Math.min(1, Math.max(0, rawDepth));
          expectPoint(reconstructViewPosition(depth, projected.x, projected.y, inverse, convention, range), point.toArray(), 6);
          expect(linearizeDepth(depth, inverse, convention, range)).toBeCloseTo(distance, 6);
        }
        expect(encodeViewDepth(near, projection.elements, convention, range)).toBeCloseTo(mode === "reversed" ? 1 : 0);
        expect(encodeViewDepth(far, projection.elements, convention, range)).toBeCloseTo(mode === "reversed" ? 0 : 1);
      }
    }
  });

  it("reconstructs unbounded perspective depth and rejects invalid log ranges", () => {
    for (const clipRange of ranges) for (const mode of ["standard", "reversed"] as const) {
      const convention = negotiateDepthConvention({ mode }, { clipRange, reversed: true, logarithmic: true });
      const projection = Matrix4.perspective(Math.PI / 2, 1, 0.1, Infinity, { clipRange, mode });
      const inverse = projection.inverse().elements;
      const depth = encodeViewDepth(100_000, projection.elements, convention);
      expect(linearizeDepth(depth, inverse, convention)).toBeCloseTo(100_000, 3);
      expect(linearizeDepth(mode === "reversed" ? 0 : 1, inverse, convention)).toBe(Infinity);
    }
    const reversed = negotiateDepthConvention({ mode: "reversed" }, { clipRange: "zero-to-one", reversed: true, logarithmic: false });
    const vast = Matrix4.perspective(1, 1, 0.1, Infinity, { mode: "reversed", clipRange: "zero-to-one" });
    const farDepth = encodeViewDepth(1e16, vast.elements, reversed);
    expect(linearizeDepth(farDepth, vast.inverse().elements, reversed) / 1e16).toBeCloseTo(1, 12);

    const ordinary = negotiateDepthConvention({}, { clipRange: "zero-to-one", reversed: false, logarithmic: false });
    const orthographic = Matrix4.orthographic(-1, 1, -1, 1, -2, 10, { clipRange: "zero-to-one" });
    const behind = encodeViewDepth(-1, orthographic.elements, ordinary);
    expect(linearizeDepth(behind, orthographic.inverse().elements, ordinary)).toBeCloseTo(-1);
    const convention = negotiateDepthConvention({ mode: "logarithmic" }, { clipRange: "zero-to-one", reversed: true, logarithmic: true });
    const projection = Matrix4.perspective(1, 1, 1, 10, { clipRange: "zero-to-one" });
    expect(() => encodeViewDepth(2, projection.elements, convention, { near: 0, far: 10 })).toThrow(/near/i);
    expect(() => linearizeDepth(0.5, projection.inverse().elements, convention, { near: 1, far: Infinity })).toThrow(/finite/i);
  });
});

describe("root projection and frame metadata", () => {
  it("uses the physical lens in preference to FOV and applies its film shift in physical units", () => {
    const lens = { mode: "perspective", near: 1, far: 200, focalLength: 50, filmGauge: 36, filmOffset: 9 };
    const narrowFov = createCameraProjection({ ...lens, fov: 20 }, 2);
    const wideFov = createCameraProjection({ ...lens, fov: 140 }, 2);
    expectPoint(narrowFov, wideFov);
    // A 36 mm gate at aspect 2 is 18 mm high: f_y = 2 * 50 / 18.
    expect(narrowFov[5]).toBeCloseTo(100 / 18);
    expect(narrowFov[0]).toBeCloseTo(50 / 18);
    expect(new Matrix4(narrowFov).transformPoint(new Vector3(0, 0, -1)).x).toBeCloseTo(-0.5);
    const sceneCamera = new PerspectiveCamera({ near: 1, far: 200, aspect: 2, focalLength: 50, filmGauge: 36, filmOffset: 9 });
    expectPoint(narrowFov, sceneCamera.projectionMatrix);
  });

  it("uses full-image aspect for adjoining root tiles even when each tile is square", () => {
    const base = { mode: "perspective", fov: 90, near: 1, far: 100 };
    const left = createCameraProjection({ ...base, viewOffset: { fullWidth: 800, fullHeight: 400, x: 0, y: 0, width: 400, height: 400 } }, 1);
    const right = createCameraProjection({ ...base, viewOffset: { fullWidth: 800, fullHeight: 400, x: 400, y: 0, width: 400, height: 400 } }, 1);
    const seam = new Vector3(0, 0.25, -5);
    const leftPoint = new Matrix4(left).transformPoint(seam);
    const rightPoint = new Matrix4(right).transformPoint(seam);
    expect(leftPoint.x).toBeCloseTo(1);
    expect(rightPoint.x).toBeCloseTo(-1);
    expect(leftPoint.y).toBeCloseTo(rightPoint.y);
    expect(leftPoint.z).toBeCloseTo(rightPoint.z);
    expect(() => createCameraProjection({ ...base, viewOffset: { fullWidth: 800, fullHeight: 400, x: 401, y: 0, width: 400, height: 400 } }, 1)).toThrow(/offset/i);
  });

  it("allows signed and zero orthographic near planes while rejecting invalid logarithmic infinity", () => {
    for (const near of [-2, 0]) for (const mode of ["orthographic", "isometric"]) {
      const matrix = new Matrix4(createCameraProjection({ mode, near, far: 10 }, 1));
      expect(matrix.transformPoint(new Vector3(0, 0, -near)).z).toBeCloseTo(-1);
      expect(matrix.transformPoint(new Vector3(0, 0, -10)).z).toBeCloseTo(1);
    }
    expect(() => createCameraProjection({ mode: "perspective", near: 0.1, far: Infinity }, 1)).not.toThrow();
    expect(() => createCameraProjection({ mode: "perspective", near: 0.1, far: Infinity, depth: { mode: "logarithmic" } }, 1)).toThrow(/infinite|logarithmic/i);
    expect(() => createCameraProjection({ mode: "orthographic", near: 0, far: 10, depth: { mode: "logarithmic" } }, 1)).toThrow(/near/i);
  });

  it("carries explicitly negotiated reversed and infinite depth with the actual inverse", () => {
    const camera = new PerspectiveCamera({ near: 0.25, far: Infinity, depth: { mode: "reversed", clipRange: "zero-to-one" } });
    const convention = negotiateDepthConvention({ mode: "reversed" }, { clipRange: "zero-to-one", reversed: true, logarithmic: true });
    const frame = toFrameCamera({
      viewProjectionMatrix: camera.viewProjectionMatrix,
      projectionMatrix: camera.projectionMatrix,
      projectionMatrixInverse: camera.projectionMatrixInverse,
      projectionMetadata: camera.projectionMetadata,
      depthConvention: convention,
      camera: { near: 4, far: 9, projection: "orthographic" }
    }, undefined, [2, 3, 4]);
    expect(frame).not.toBeNull();
    expect(frame!.near).toBe(0.25);
    expect(frame!.far).toBe(Infinity);
    expect(frame!.projection).toBe("perspective");
    expect(frame!.depth).toEqual(convention);
    expectPoint(Array.from(frame!.projectionMatrixInverse!), camera.projectionMatrixInverse, 6);
    expectPoint(frame!.position, [2, 3, 4]);
    expect(linearizeDepth(0, frame!.projectionMatrixInverse!, convention)).toBe(Infinity);
    expect(linearizeDepth(0.25, frame!.projectionMatrixInverse!, convention)).toBeCloseTo(1);
  });

  it("does not infer near or far from finite standard coefficients when explicit custom metadata is present", () => {
    const projection = Matrix4.perspective(1, 1.5, 0.7, 300).elements as Mat4;
    const frame = toFrameCamera({
      viewProjectionMatrix: projection,
      projectionMatrix: projection,
      projectionMetadata: { kind: "custom", mode: "standard", clipRange: "minus-one-to-one" }
    }, undefined, undefined);
    expect(frame!.near).toBe(0.1);
    expect(frame!.far).toBe(1000);
    expect(frame!.near).not.toBeCloseTo(0.7);
    expect(frame!.far).not.toBeCloseTo(300);
    expectPoint(Array.from(frame!.projectionMatrixInverse!), Array.from(Matrix4.perspective(1, 1.5, 0.7, 300).inverse().elements), 5);
  });

  it("rejects a fallback when the camera still uses the requested projection convention", () => {
    const camera = new PerspectiveCamera({ depth: { mode: "reversed", clipRange: "zero-to-one" } });
    const fallback = negotiateDepthConvention({ mode: "reversed", allowFallback: true }, {
      clipRange: "zero-to-one", reversed: false, logarithmic: false
    });
    expect(() => toFrameCamera({
      viewProjectionMatrix: camera.viewProjectionMatrix,
      projectionMatrix: camera.projectionMatrix,
      projectionMetadata: camera.projectionMetadata,
      depthConvention: fallback
    }, undefined, undefined)).toThrow(/FRAME_DEPTH_CONVENTION_MISMATCH/);
  });

  it("publishes only the actual per-view depth coverage texture to frame consumers", () => {
    const device = new MockRenderDevice();
    const hooks = createRendererFrameHooks({ device, width: 8, height: 8, source: { renderItems: [] }, camera: null, flags: { values: {}, on: () => true } });
    const texture = new Texture({ width: 8, height: 8, format: "rgba8", colorSpace: "linear", data: new Uint8Array(8 * 8 * 4) });
    let observed: FrameContributorContext | undefined;
    const unregister = registerFrameContributor({
      id: "prd01.depthCoverageProbe", owner: "prd01", flag: "A3D_QR_CORE", phases: ["after-opaque"],
      passes: (_phase, context) => { observed = context; return []; }
    });
    try {
      hooks.setSceneDepthCoverage(texture);
      hooks.addPasses(new RenderGraph(), "after-opaque", []);
      expect(observed?.sceneDepth.coverage).toBe(texture);
      const nextTarget = device.createRenderTarget({ width: 4, height: 4 });
      hooks.setForwardTarget(nextTarget);
      hooks.addPasses(new RenderGraph(), "after-opaque", []);
      expect(observed?.sceneDepth.coverage).toBeNull();
      expect(() => hooks.setSceneDepthCoverage(texture)).toThrow(/dimensions/);
      nextTarget.dispose();
    } finally { unregister(); texture.dispose(); device.dispose(); }
  });
});

describe("production reversed and logarithmic depth (WP-30)", () => {
  const near = 0.5;
  const far = 400;
  const range = { near, far };
  const distances = [0.5, 0.75, 3, 40, 250, 400];
  const productionMode = (mode: "standard" | "reversed" | "logarithmic", kind: "perspective" | "orthographic" = "perspective") =>
    resolveProductionCameraDepth({ mode: kind, fov: 50, orthographicSize: 3, near, far, depth: { mode } });
  /** GPU window depth: NDC z remapped by the default [0, 1] depth range, or the log fragment formula. */
  const stored = (mode: string, projection: ArrayLike<number>, distance: number): number => {
    if (mode === "logarithmic") return Math.log(distance / near) / Math.log(far / near);
    const z = -distance;
    return ((projection[10]! * z + projection[14]!) / (projection[11]! * z + projection[15]!) + 1) / 2;
  };

  it.each(["standard", "reversed", "logarithmic"] as const)("%s: projection, store and reconstruct agree numerically", (mode) => {
    for (const kind of ["perspective", "orthographic"] as const) {
      const { projectionCamera, projectionMetadata, depthConvention } = productionMode(mode, kind);
      expect(projectionMetadata).toMatchObject({ kind, near, far, mode, clipRange: "minus-one-to-one" });
      const projection = createRootCameraProjection(projectionCamera, 1.5);
      const standard = createRootCameraProjection(productionMode("standard", kind).projectionCamera, 1.5);
      const inverse = new Matrix4(projection as unknown as Matrix4["elements"]).inverse().elements;
      // Reversed maps near to +1 and far to -1; logarithmic keeps the standard matrix.
      if (mode === "logarithmic") expectPoint(Array.from(projection), Array.from(standard), 12);
      const nearStored = stored(mode, projection, near);
      const farStored = stored(mode, projection, far);
      expect(nearStored).toBeCloseTo(mode === "reversed" ? 1 : 0, 9);
      expect(farStored).toBeCloseTo(mode === "reversed" ? 0 : 1, 9);
      let previous: number | undefined;
      for (const distance of distances) {
        const value = stored(mode, projection, distance);
        // CPU reference encoding equals the GPU path, and reconstruction inverts it.
        expect(encodeViewDepth(distance, projection, depthConvention, range)).toBeCloseTo(value, 10);
        expect(linearizeDepth(Math.min(1, Math.max(0, value)), inverse, depthConvention, range) / distance).toBeCloseTo(1, 6);
        // Every mode converts to the standard window depth of the same distance.
        expect(toStandardWindowDepth(value, depthConvention, { kind, ...range })).toBeCloseTo(stored("standard", standard, distance), 9);
        // The negotiated compare orders nearer surfaces first against the clear value.
        const compare = remapDepthCompare("less-equal", depthConvention);
        expect(compare).toBe(depthConvention.compare);
        expect(compare === "greater-equal" ? value >= depthConvention.clearValue : value <= depthConvention.clearValue).toBe(true);
        if (previous !== undefined) expect(mode === "reversed" ? value < previous : value > previous).toBe(true);
        previous = value;
      }
    }
  });

  it("gives logarithmic depth more resolution far away than standard depth", () => {
    const standard = createRootCameraProjection(productionMode("standard").projectionCamera, 1);
    const step = (mode: string) => stored(mode, standard, 300.01) - stored(mode, standard, 300);
    expect(step("logarithmic")).toBeGreaterThan(step("standard") * 10);
  });

  it("maps standard-sense draw state to reversed depth exactly once", () => {
    const reversed = { mode: "reversed" as const };
    expect(["less", "less-equal", "greater", "greater-equal", "equal", "not-equal", "always", "never"].map((c) => remapDepthCompare(c as never, reversed)))
      .toEqual(["greater", "greater-equal", "less", "less-equal", "equal", "not-equal", "always", "never"]);
    expect(remapDepthCompare("less", { mode: "logarithmic" })).toBe("less");
    const state = { depthCompare: "less-equal" as const, polygonOffset: { factor: 1.5, units: 2 } };
    const resolved = resolveDepthDrawState(state, reversed);
    expect(resolved).toMatchObject({ depthCompare: "less-equal", depthCompareV2: "greater-equal", polygonOffset: { factor: -1.5, units: -2 }, depthConventionApplied: true });
    expect(resolveDepthDrawState(resolved, reversed)).toBe(resolved);
    expect(resolveDepthDrawState(state, { mode: "standard" })).toBe(state);
    expect(resolveDepthDrawState({ depthCompare: "always" as const }, reversed).depthCompareV2).toBe("always");
  });

  it("standardizes reversed and logarithmic readback for reference depth consumers", () => {
    const reversed = negotiateDepthConvention({ mode: "reversed" }, { clipRange: "minus-one-to-one", reversed: true, logarithmic: true });
    expect(Array.from(standardizeDepthReadback(new Float32Array([1, 0.25, 0]), reversed))).toEqual([0, 0.75, 1]);
    const log = { ...negotiateDepthConvention({ mode: "logarithmic" }, { clipRange: "minus-one-to-one", reversed: true, logarithmic: true }), logRange: { near, far, kind: "perspective" as const } };
    const standard = createRootCameraProjection(productionMode("standard").projectionCamera, 1);
    const out = standardizeDepthReadback(new Float32Array([stored("logarithmic", standard, 40)]), log);
    expect(out[0]).toBeCloseTo(stored("standard", standard, 40), 6);
    expect(() => standardizeDepthReadback(new Float32Array([0.5]), { ...log, logRange: { near, far } })).toThrow(/projection kind/);
  });

  it("clears, compares and draws with the frame convention, and scopes standard light depth", async () => {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: resolveQrFlags({ options: { A3D_QR_CORE: true } }) });
    const device = renderer.device as MockRenderDevice;
    const geometry = Geometry.triangle();
    const material = new UnlitMaterial();
    try {
      const { projectionCamera, projectionMetadata, depthConvention } = productionMode("reversed");
      const projection = createRootCameraProjection(projectionCamera, 1);
      const camera = { viewProjectionMatrix: projection, viewMatrix: identityMat4(), projectionMatrix: projection, projectionMetadata, depthConvention };
      const target = device.createRenderTarget({ width: 8, height: 8, depth: "texture" });
      renderer.render({ renderItems: [{ geometry, material, label: "reversed" }], renderTarget: target, cameraPolicy: "require" }, camera);
      expect(device.getDepthConvention()).toMatchObject({ mode: "reversed", clearValue: 0, compare: "greater-equal", biasSign: -1 });
      const draws = device.drawCommands.filter((command) => command.label === "reversed");
      expect(draws.length).toBeGreaterThan(0);
      for (const draw of draws) expect(draw.renderState).toMatchObject({ depthCompareV2: "greater-equal", depthConventionApplied: true });
      device.beginFrame(8, 8);
      device.setRenderTarget(target);
      device.clear([0, 0, 0, 1]);
      expect(target.depthPixels?.every((value) => value === 0)).toBe(true);
      expect(withStandardDeviceDepth(device, () => {
        device.clear([0, 0, 0, 1]);
        return device.getDepthConvention().mode;
      })).toBe("standard");
      expect(target.depthPixels?.every((value) => value === 1)).toBe(true);
      expect(device.getDepthConvention().mode).toBe("reversed");
      device.endFrame();

      // Logarithmic frames select the log program variant and bind its range.
      device.drawCommands.length = 0;
      const log = productionMode("logarithmic");
      const logProjection = createRootCameraProjection(log.projectionCamera, 1);
      renderer.render({ renderItems: [{ geometry, material, label: "log" }], renderTarget: target, cameraPolicy: "require" },
        { viewProjectionMatrix: logProjection, viewMatrix: identityMat4(), projectionMatrix: logProjection, projectionMetadata: log.projectionMetadata, depthConvention: log.depthConvention });
      const logDraws = device.drawCommands.filter((command) => command.label === "log");
      expect(logDraws.length).toBeGreaterThan(0);
      for (const draw of logDraws) {
        expect(Array.from(draw.uniforms?.get("u_a3dLogDepthRange") as number[])).toEqual([near, far]);
        expect(draw.renderState?.depthCompareV2 ?? draw.renderState?.depthCompare).toBe("less-equal");
      }

      // A later standard camera restores the standard convention.
      renderer.render({ renderItems: [{ geometry, material, label: "standard" }], renderTarget: target, cameraPolicy: "identity" });
      expect(device.getDepthConvention()).toMatchObject({ mode: "standard", clearValue: 1 });
      target.dispose();
    } finally { geometry.dispose(); material.dispose(); renderer.dispose(); }
  });
});

