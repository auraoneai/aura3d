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
  it.each(["reversed", "logarithmic"] as const)("rejects root %s depth even when fallback is permitted", (mode) => {
    const snapshot = scene().camera(camera.perspective({ depth: { mode, allowFallback: true } })).toJSON();
    expect(() => productionInput(snapshot)).toThrow(/CAMERA_DEPTH_UNSUPPORTED/);
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

  it.each(["reversed", "logarithmic"] as const)("rejects an inherited %s request before any mirror or cube capture", async (mode) => {
    const snapshot = scene()
      .camera(camera.perspective({ depth: { mode, allowFallback: true } }))
      .add(cameras.stereo())
      .add(cameras.cube({ resolution: 4 }))
      .add(surfaces.mirror({ resolution: 4 }))
      .toJSON();
    const f = await prepareFixture(snapshot);
    try {
      expect(() => f.prepare()).toThrow(/CAMERA_STEREO_DEPTH_UNSUPPORTED/);
      expect(() => f.prepare(false)).toThrow(/CAMERA_STEREO_DEPTH_UNSUPPORTED/);
      expect(f.probe).not.toHaveBeenCalled();
      expect(f.render).not.toHaveBeenCalled();
      expect((f.renderer.device as MockRenderDevice).drawCommands).toHaveLength(0);
    } finally { f.dispose(); }
  });

  it("rejects an unsupported scene camera even when both array views override it to standard", async () => {
    const snapshot = scene().camera(camera.perspective({ depth: { mode: "reversed" } })).add(cameras.array({ cameras: [
      { viewport: rect(0, 0, 0.5, 1), camera: { depth: { mode: "standard" } } },
      { viewport: rect(0.5, 0, 0.5, 1), camera: { depth: { mode: "standard" } } }
    ] })).add(surfaces.mirror({ resolution: 4 })).toJSON();
    const f = await prepareFixture(snapshot);
    try {
      expect(() => f.prepare()).toThrow(/CAMERA_ARRAY_DEPTH_UNSUPPORTED/);
      expect(f.render).not.toHaveBeenCalled();
      expect((f.renderer.device as MockRenderDevice).drawCommands).toHaveLength(0);
    } finally { f.dispose(); }
  });

  it.each(["reversed", "logarithmic"] as const)("rejects an unsupported second array view with %s depth before captures", async (mode) => {
    const snapshot = scene()
      .camera(camera.perspective())
      .add(cameras.array({ cameras: [
        { viewport: rect(0, 0, 0.5, 1) },
        { viewport: rect(0.5, 0, 0.5, 1), camera: { depth: { mode, allowFallback: true } } }
      ] }))
      .add(cameras.cube({ resolution: 4 }))
      .add(surfaces.mirror({ resolution: 4 }))
      .toJSON();
    const f = await prepareFixture(snapshot);
    try {
      expect(() => f.prepare()).toThrow(/CAMERA_ARRAY_DEPTH_UNSUPPORTED/);
      expect(() => f.prepare(false)).toThrow(/CAMERA_ARRAY_DEPTH_UNSUPPORTED/);
      expect(f.probe).not.toHaveBeenCalled();
      expect(f.render).not.toHaveBeenCalled();
      expect((f.renderer.device as MockRenderDevice).drawCommands).toHaveLength(0);
    } finally { f.dispose(); }
  });

  it.each(["reversed", "logarithmic"] as const)("rejects an unsupported second perspective eye with %s depth before captures", async (mode) => {
    const snapshot = scene()
      .camera(camera.perspective())
      .add(cameras.stereo({ views: [{}, { camera: { depth: { mode, allowFallback: true } } }] }))
      .add(cameras.cube({ resolution: 4 }))
      .add(surfaces.mirror({ resolution: 4 }))
      .toJSON();
    const f = await prepareFixture(snapshot);
    try {
      expect(() => f.prepare()).toThrow(/CAMERA_STEREO_DEPTH_UNSUPPORTED/);
      expect(f.probe).not.toHaveBeenCalled();
      expect(f.render).not.toHaveBeenCalled();
      expect((f.renderer.device as MockRenderDevice).drawCommands).toHaveLength(0);
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
