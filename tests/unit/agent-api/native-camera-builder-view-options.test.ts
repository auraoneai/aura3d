import { describe, expect, it } from "vitest";
import { resolveCameraFrame } from "../../../packages/engine/src/agent-api/compiler/camera";
import { createProductionParitySurfaces } from "../../../packages/engine/src/agent-api/compiler/paritySurfaces";
import { createProductionRuntimeRendererInput } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import { cameras } from "../../../packages/engine/src/agent-api/nodes/cameras";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import type { AuraCameraSpec, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import { Renderer } from "../../../packages/rendering/src/Renderer";

type Options = Omit<AuraCameraSpec, "mode">;
const movingBuilders: readonly { name: string; build: (options: Options) => AuraCameraSpec }[] = [
  { name: "orbit", build: (options) => camera.orbit(options) },
  { name: "dolly", build: (options) => camera.dolly({ ...options, from: [0, 0, 5], to: [0, 0, 4] }) },
  { name: "follow", build: (options) => camera.follow({ ...options, targetNode: "subject" }) },
  { name: "path", build: (options) => camera.path({ ...options, from: [0, 0, 5], to: [0, 0, 4] }) },
  { name: "flythrough", build: (options) => camera.flythrough({ ...options, from: [0, 0, 5], to: [0, 0, 4] }) }
];

function productionInput(snapshot: AuraSceneSnapshot) {
  return createProductionRuntimeRendererInput(
    snapshot,
    { width: 100, height: 50 } as HTMLCanvasElement,
    [], [], 0, undefined, new Set(), { color: [0, 0, 0], intensity: 0 }, []
  );
}

describe("moving camera builder view options", () => {
  it.each(movingBuilders)("forwards authored options from $name into the scene and root camera", ({ build }) => {
    const options: Options = {
      target: [0, 0, 0], up: [1, 0, 0], layers: 0,
      viewOffset: { fullWidth: 100, fullHeight: 50, x: 0, y: 0, width: 50, height: 50 },
      focalLength: 40, filmGauge: 36, filmOffset: 1, depth: { mode: "standard" }
    };
    const spec = build(options);
    const snapshot = scene().camera(spec).toJSON();
    expect(snapshot.camera).toMatchObject(options);
    expect(productionInput(snapshot).camera?.layerMask).toBe(0);

    const defaults = build({});
    expect(defaults).not.toHaveProperty("up");
    expect(defaults).not.toHaveProperty("layers");
  });

  it.each(["array", "stereo"] as const)("uses inherited up and layers in %s views while retaining per-view overrides", async (kind) => {
    const spec = camera.orbit({ position: [0, 0, 5], target: [0, 0, 0], up: [1, 0, 0], layers: 0 });
    const node = kind === "array"
      ? cameras.array({ cameras: [
          { viewport: { x: 0, y: 0, width: 0.5, height: 1 } },
          { viewport: { x: 0.5, y: 0, width: 0.5, height: 1 }, camera: { up: [0, 1, 0], layers: 8 } }
        ] })
      : cameras.stereo({ views: [{}, { camera: { up: [0, 1, 0], layers: 8 } }] });
    const snapshot = scene().camera(spec).add(node).toJSON();
    const renderer = await Renderer.create({ backend: "mock", width: 100, height: 50 });
    const parity = createProductionParitySurfaces(renderer, () => {});
    try {
      const views = parity.prepare(
        { renderItems: [], cameraPolicy: "require", frustumCulling: false },
        snapshot, undefined, 0, 2, { width: 100, height: 50 }
      ).views!;
      expect(views.map((view) => view.camera.layerMask)).toEqual([0, 8]);
      // The first view's camera-up axis points along world X; the override
      // on the second view restores world Y as camera-up.
      expect(views[0]!.camera.viewMatrix![1]).toBeCloseTo(1);
      expect(views[0]!.camera.viewMatrix![5]).toBeCloseTo(0);
      expect(views[1]!.camera.viewMatrix![1]).toBeCloseTo(0);
      expect(views[1]!.camera.viewMatrix![5]).toBeCloseTo(1);
    } finally { parity.dispose(); renderer.dispose(); }
  });

  it("retains zero and negative orbit values and resolves fixed capture time independently of frame time", () => {
    expect(camera.orbit({ autoRotate: 0, captureTime: 0 })).toMatchObject({ autoRotate: 0, captureTime: 0 });
    expect(camera.orbit({ autoRotate: -2, captureTime: 0 })).toMatchObject({ autoRotate: -2, captureTime: 0 });

    const dynamic = scene().camera(camera.orbit({ position: [1, 0, 0], target: [0, 0, 0], autoRotate: Math.PI / 2 })).toJSON();
    const movingEye = resolveCameraFrame(dynamic, dynamic.camera, 1000).eye;
    expect(movingEye[0]).toBeCloseTo(0);
    expect(movingEye[2]).toBeCloseTo(-1);

    const fixed = scene().camera(camera.orbit({
      position: [1, 0, 0], target: [0, 0, 0], autoRotate: Math.PI / 2, captureTime: 0.5
    })).toJSON();
    expect(fixed.camera.captureTime).toBe(0.5);
    const fixedEye = resolveCameraFrame(fixed, fixed.camera, 1000).eye;
    expect(fixedEye[0]).toBeCloseTo(Math.SQRT1_2);
    expect(fixedEye[2]).toBeCloseTo(-Math.SQRT1_2);
    expect(resolveCameraFrame(fixed, fixed.camera, 9000).eye).toEqual(fixedEye);
  });
});
