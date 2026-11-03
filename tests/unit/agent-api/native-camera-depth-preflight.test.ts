import { describe, expect, it, vi } from "vitest";
import { createProductionParitySurfaces } from "../../../packages/engine/src/agent-api/compiler/paritySurfaces";
import { createProductionRuntimeRendererInput } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import { cameras } from "../../../packages/engine/src/agent-api/nodes/cameras";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { surfaces } from "../../../packages/engine/src/agent-api/nodes/surfaces";
import type { AuraCameraSpec, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const source = () => ({ renderItems: [], cameraPolicy: "require" as const, frustumCulling: false });
const dimensions = { width: 100, height: 50 };

function productionInput(snapshot: AuraSceneSnapshot) {
  return createProductionRuntimeRendererInput(
    snapshot,
    { ...dimensions } as HTMLCanvasElement,
    [], [], 0, undefined, new Set(), { color: [0, 0, 0], intensity: 0 }, []
  );
}

/** NDC depth for a camera-space point on the optical axis. */
function projectDepth(projection: ArrayLike<number>, distance: number): number {
  const z = -distance;
  return (projection[10]! * z + projection[14]!) / (projection[11]! * z + projection[15]!);
}

async function prepareFixture(snapshot: AuraSceneSnapshot) {
  const renderer = await Renderer.create({ backend: "mock", ...dimensions });
  const render = vi.spyOn(renderer, "render");
  const probe = vi.spyOn(renderer, "renderProbeFace");
  const parity = createProductionParitySurfaces(renderer, () => {});
  return {
    renderer,
    render,
    probe,
    prepare: (withSize = true) => parity.prepare(source(), snapshot, undefined, 0, 2, withSize ? dimensions : undefined),
    dispose: () => { parity.dispose(); renderer.dispose(); }
  };
}

describe("production camera depth preflight", () => {
  it.each([
    { mode: "reversed", nearNdc: 1, farNdc: -1, clearValue: 0, compare: "greater-equal", biasSign: -1, precision: "reduced" },
    { mode: "logarithmic", nearNdc: -1, farNdc: 1, clearValue: 1, compare: "less-equal", biasSign: 1, precision: "extended" }
  ] as const)("publishes native root $mode depth with a matching projection and convention", (expected) => {
    for (const allowFallback of [undefined, true, false]) {
      const depth = allowFallback === undefined ? { mode: expected.mode } : { mode: expected.mode, allowFallback };
      const output = productionInput(scene().camera(camera.perspective({ near: 0.2, far: 30, depth })).toJSON()).camera!;
      expect(output.projectionMetadata).toEqual({ kind: "perspective", near: 0.2, far: 30, mode: expected.mode, clipRange: "minus-one-to-one" });
      expect(output.depthConvention).toMatchObject({ requestedMode: expected.mode, mode: expected.mode, clipRange: "minus-one-to-one",
        clearValue: expected.clearValue, compare: expected.compare, biasSign: expected.biasSign, precision: expected.precision });
      expect(output.depthConvention).not.toHaveProperty("fallbackReason");
      expect(projectDepth(output.shaderProjectionMatrix!, 0.2)).toBeCloseTo(expected.nearNdc, 5);
      expect(projectDepth(output.shaderProjectionMatrix!, 30)).toBeCloseTo(expected.farNdc, 5);
    }
  });

  it("rejects logarithmic depth without a positive orthographic near plane", () => {
    expect(() => camera.orthographic({ near: 0, far: 30, depth: { mode: "logarithmic" } })).toThrow(/logarithmic depth require near > 0/);
    // A runtime snapshot that bypassed the builder is rejected by production lowering.
    const spec = { ...camera.orthographic({ near: 0, far: 30 }), depth: { mode: "logarithmic" } } as AuraCameraSpec;
    expect(() => productionInput(scene().camera(camera.orthographic()).toJSON()) && productionInput({ ...scene().camera(camera.orthographic()).toJSON(), camera: spec }))
      .toThrow(/logarithmic depth require near > 0|logarithmic depth requires finite 0 < near < far/);
  });

  it("rejects a runtime zero-to-one root projection instead of interpreting it as standard", () => {
    const depth = { mode: "standard" as const, clipRange: "zero-to-one" as const };
    const snapshot = scene().camera(camera.perspective({ depth })).toJSON();
    expect(() => productionInput(snapshot)).toThrow(/CAMERA_DEPTH_UNSUPPORTED/);
  });

  it.each([
    camera.perspective({ near: 0.2, far: 30 }),
    camera.orthographic({ near: 0.2, far: 30 }),
    camera.isometric({ near: 0.2, far: 30 })
  ])("publishes root projection metadata matching the $mode matrix", (spec) => {
    const input = productionInput(scene().camera(spec).toJSON());
    const output = input.camera!;
    expect(output.projectionMetadata).toEqual({
      kind: spec.mode === "perspective" ? "perspective" : "orthographic",
      near: 0.2, far: 30, mode: "standard", clipRange: "minus-one-to-one"
    });
    expect(projectDepth(output.shaderProjectionMatrix!, 0.2)).toBeCloseTo(-1, 5);
    expect(projectDepth(output.shaderProjectionMatrix!, 30)).toBeCloseTo(1, 5);
  });

  it.each(["reversed", "logarithmic"] as const)("carries an inherited %s request to every eye while captures stay standard", async (mode) => {
    const snapshot = scene()
      .camera(camera.perspective({ depth: { mode, allowFallback: true } }))
      .add(cameras.stereo())
      .add(cameras.cube({ resolution: 4 }))
      .add(surfaces.mirror({ resolution: 4 }))
      .toJSON();
    const f = await prepareFixture(snapshot);
    try {
      const views = f.prepare().views!;
      expect(views).toHaveLength(2);
      for (const view of views) {
        expect(view.camera.projectionMetadata?.mode).toBe(mode);
        expect(view.camera.depthConvention?.mode).toBe(mode);
      }
      // Cube faces and the mirror own their targets and render standard depth.
      expect(f.probe).toHaveBeenCalled();
      for (const call of f.render.mock.calls) expect((call[1] as { projectionMetadata?: unknown } | undefined)?.projectionMetadata).toBeUndefined();
      expect(f.renderer.device.getDepthConvention?.().mode).toBe("standard");
    } finally { f.dispose(); }
  });

  it("accepts a reversed scene camera when both array views override it to standard", async () => {
    const snapshot = scene().camera(camera.perspective({ depth: { mode: "reversed" } })).add(cameras.array({ cameras: [
      { viewport: rect(0, 0, 0.5, 1), camera: { depth: { mode: "standard" } } },
      { viewport: rect(0.5, 0, 0.5, 1), camera: { depth: { mode: "standard" } } }
    ] })).add(surfaces.mirror({ resolution: 4 })).toJSON();
    const f = await prepareFixture(snapshot);
    try {
      const views = f.prepare().views!;
      expect(views.map((view) => view.camera.depthConvention?.mode)).toEqual(["standard", "standard"]);
      expect(views.map((view) => view.camera.projectionMetadata?.mode)).toEqual(["standard", "standard"]);
    } finally { f.dispose(); }
  });

  it.each(["reversed", "logarithmic"] as const)("publishes a second array view's own %s convention", async (mode) => {
    const snapshot = scene()
      .camera(camera.perspective({ near: 0.1, far: 50 }))
      .add(cameras.array({ cameras: [
        { viewport: rect(0, 0, 0.5, 1) },
        { viewport: rect(0.5, 0, 0.5, 1), camera: { depth: { mode, allowFallback: true } } }
      ] }))
      .add(cameras.cube({ resolution: 4 }))
      .add(surfaces.mirror({ resolution: 4 }))
      .toJSON();
    const f = await prepareFixture(snapshot);
    try {
      const [left, right] = f.prepare().views!;
      expect(left!.camera.depthConvention?.mode).toBe("standard");
      expect(right!.camera.depthConvention?.mode).toBe(mode);
      expect(right!.camera.projectionMetadata?.mode).toBe(mode);
      expect(projectDepth(right!.camera.projectionMatrix!, 0.1)).toBeCloseTo(mode === "reversed" ? 1 : -1, 5);
      expect(projectDepth(right!.camera.projectionMatrix!, 50)).toBeCloseTo(mode === "reversed" ? -1 : 1, 5);
    } finally { f.dispose(); }
  });

  it.each(["reversed", "logarithmic"] as const)("publishes a second perspective eye's own %s convention", async (mode) => {
    const snapshot = scene()
      .camera(camera.perspective())
      .add(cameras.stereo({ views: [{}, { camera: { depth: { mode, allowFallback: true } } }] }))
      .add(cameras.cube({ resolution: 4 }))
      .add(surfaces.mirror({ resolution: 4 }))
      .toJSON();
    const f = await prepareFixture(snapshot);
    try {
      const [left, right] = f.prepare().views!;
      expect(left!.camera.depthConvention?.mode).toBe("standard");
      expect(right!.camera.depthConvention?.mode).toBe(mode);
    } finally { f.dispose(); }
  });

  it.each(["array", "stereo"] as const)("rejects a runtime zero-to-one override on the second %s view", async (kind) => {
    const depth = { mode: "standard" as const, clipRange: "zero-to-one" as const };
    const node = kind === "array"
      ? cameras.array({ cameras: [
          { viewport: rect(0, 0, 0.5, 1) },
          { viewport: rect(0.5, 0, 0.5, 1), camera: { depth } }
        ] })
      : cameras.stereo({ views: [{}, { camera: { depth } }] });
    const f = await prepareFixture(scene().camera(camera.perspective()).add(node).toJSON());
    try {
      expect(() => f.prepare()).toThrow(new RegExp(`CAMERA_${kind.toUpperCase()}_DEPTH_UNSUPPORTED`));
      expect((f.renderer.device as MockRenderDevice).drawCommands).toHaveLength(0);
    } finally { f.dispose(); }
  });

  it("publishes independent array projection metadata with matching projection matrices", async () => {
    const snapshot = scene().camera(camera.perspective({ near: 0.1, far: 100 })).add(cameras.array({ cameras: [
      { viewport: rect(0, 0, 0.5, 1), scissor: rect(0.1, 0.1, 0.3, 0.8), postprocess: false,
        camera: { mode: "orthographic", orthographicSize: 2, near: 0.2, far: 20 } },
      { viewport: rect(0.5, 0, 0.5, 1), camera: { near: 0.3, far: 30 } }
    ] })).toJSON();
    const f = await prepareFixture(snapshot);
    try {
      const [left, right] = f.prepare().views!;
      expect(left!.camera.projectionMetadata).toEqual({ kind: "orthographic", near: 0.2, far: 20, mode: "standard", clipRange: "minus-one-to-one" });
      expect(right!.camera.projectionMetadata).toEqual({ kind: "perspective", near: 0.3, far: 30, mode: "standard", clipRange: "minus-one-to-one" });
      expect(left).toMatchObject({ viewport: rect(0, 0, 50, 50), scissor: rect(10, 5, 30, 40), postprocess: false });
      expect(right!.viewport).toEqual(rect(50, 0, 50, 50));
      expect(projectDepth(left!.camera.projectionMatrix!, 0.2)).toBeCloseTo(-1, 5);
      expect(projectDepth(left!.camera.projectionMatrix!, 20)).toBeCloseTo(1, 5);
      expect(projectDepth(right!.camera.projectionMatrix!, 0.3)).toBeCloseTo(-1, 5);
      expect(projectDepth(right!.camera.projectionMatrix!, 30)).toBeCloseTo(1, 5);
    } finally { f.dispose(); }
  });

  it("publishes each perspective eye's clipping metadata for the final shifted matrix", async () => {
    const snapshot = scene().camera(camera.perspective({ position: [0, 0, 6], target: [0, 0, 0] })).add(cameras.stereo({
      eyeSeparation: 0.2,
      focus: 6,
      views: [{ camera: { near: 0.2, far: 20 } }, { camera: { near: 0.3, far: 30 } }]
    })).toJSON();
    const f = await prepareFixture(snapshot);
    try {
      const [left, right] = f.prepare().views!;
      expect(left!.camera.projectionMetadata).toEqual({ kind: "perspective", near: 0.2, far: 20, mode: "standard", clipRange: "minus-one-to-one" });
      expect(right!.camera.projectionMetadata).toEqual({ kind: "perspective", near: 0.3, far: 30, mode: "standard", clipRange: "minus-one-to-one" });
      expect(projectDepth(left!.camera.projectionMatrix!, 0.2)).toBeCloseTo(-1, 5);
      expect(projectDepth(left!.camera.projectionMatrix!, 20)).toBeCloseTo(1, 5);
      expect(projectDepth(right!.camera.projectionMatrix!, 0.3)).toBeCloseTo(-1, 5);
      expect(projectDepth(right!.camera.projectionMatrix!, 30)).toBeCloseTo(1, 5);
      expect(left!.camera.projectionMatrix![8]).toBeGreaterThan(0);
      expect(right!.camera.projectionMatrix![8]).toBeLessThan(0);
    } finally { f.dispose(); }
  });

  it("rejects malformed runtime depth options before preparing a frame", () => {
    const spec = { ...camera.perspective(), depth: null } as unknown as AuraCameraSpec;
    expect(() => productionInput(scene().camera(spec).toJSON())).toThrow(/CAMERA_DEPTH_UNSUPPORTED/);
  });
});
