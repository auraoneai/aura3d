import { describe, expect, it } from "vitest";
import { createProductionParitySurfaces } from "../../../packages/engine/src/agent-api/compiler/paritySurfaces";
import { createProductionRuntimeRendererInput } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import { cameras } from "../../../packages/engine/src/agent-api/nodes/cameras";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import type { AuraCameraSpec, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import { Renderer } from "../../../packages/rendering/src/Renderer";

type CameraOptions = Omit<AuraCameraSpec, "mode">;
type MovingBuilder = {
  readonly mode: AuraCameraSpec["mode"];
  readonly defaultFov: number;
  readonly build: (options: CameraOptions) => AuraCameraSpec;
};

const builders: readonly MovingBuilder[] = [
  { mode: "orbit", defaultFov: 45, build: (options) => camera.orbit(options) },
  { mode: "dolly", defaultFov: 45, build: (options) => camera.dolly({ ...options, from: [0, 1, 4], to: [0, 1, 2] }) },
  { mode: "follow", defaultFov: 50, build: (options) => camera.follow({ ...options, targetNode: "subject" }) },
  { mode: "path", defaultFov: 45, build: (options) => camera.path({ ...options, from: [0, 1, 4], to: [0, 1, 2] }) },
  { mode: "flythrough", defaultFov: 54, build: (options) => camera.flythrough(options) }
];

function productionInput(snapshot: AuraSceneSnapshot, width = 600, height = 400) {
  return createProductionRuntimeRendererInput(
    snapshot,
    { width, height } as HTMLCanvasElement,
    [], [], 0, undefined, new Set(), { color: [0, 0, 0], intensity: 0 }, []
  );
}

function productionProjection(snapshot: AuraSceneSnapshot, width = 600, height = 400): ArrayLike<number> {
  const projection = productionInput(snapshot, width, height).camera?.shaderProjectionMatrix;
  if (!projection) throw new Error("The production input did not provide a projection matrix.");
  return projection;
}

function projectCameraPoint(matrix: ArrayLike<number>, x: number, y: number, z: number): readonly [number, number, number] {
  const w = matrix[3]! * x + matrix[7]! * y + matrix[11]! * z + matrix[15]!;
  return [
    (matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!) / w,
    (matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!) / w,
    (matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!) / w
  ];
}

function tile(x: number) {
  return { fullWidth: 800, fullHeight: 400, x, y: 0, width: 400, height: 400 };
}

describe("moving perspective camera projection options", () => {
  for (const { mode, defaultFov, build } of builders) {
    it(`${mode} carries physical lens options through the scene into production projection`, () => {
      const options = {
        near: 0.05,
        far: 100,
        fov: 10,
        focalLength: 50,
        filmGauge: 36,
        filmOffset: 3,
        depth: { mode: "standard" as const, allowFallback: false }
      };
      const spec = build(options);
      const snapshot = scene().camera(spec).toJSON();
      expect(spec).toMatchObject({ mode, ...options });
      expect(snapshot.camera).toMatchObject({ mode, ...options });

      const input = productionInput(snapshot);
      const projection = input.camera!.shaderProjectionMatrix!;
      expect(input.camera!.projectionMetadata).toMatchObject({ kind: "perspective", near: 0.05, far: 100, mode: "standard" });
      // At aspect 1.5, a 36 mm gate and 50 mm lens give a 24 mm film height.
      expect(projection[0]).toBeCloseTo(2.7777778, 5);
      expect(projection[5]).toBeCloseTo(4.1666667, 5);
      expect(projection[8]).toBeCloseTo(1 / 6, 5);
      expect(projection[5]).not.toBeCloseTo(1 / Math.tan(5 * Math.PI / 180), 3);
    });

    it(`${mode} composes physical film shift with adjoining production tiles`, () => {
      const base = { near: 1, far: 100, fov: 10, focalLength: 50, filmGauge: 36, filmOffset: 9 };
      const leftSpec = build({ ...base, viewOffset: tile(0) });
      const rightSpec = build({ ...base, viewOffset: tile(400) });
      const leftSnapshot = scene().camera(leftSpec).toJSON();
      const rightSnapshot = scene().camera(rightSpec).toJSON();
      expect(leftSnapshot.camera.viewOffset).toEqual(tile(0));
      expect(rightSnapshot.camera.viewOffset).toEqual(tile(400));

      // The physical gate's shifted seam is x=0.18 at near=1, or x=0.9 at z=-5.
      const left = projectCameraPoint(productionProjection(leftSnapshot, 400, 400), 0.9, 0.25, -5);
      const right = projectCameraPoint(productionProjection(rightSnapshot, 400, 400), 0.9, 0.25, -5);
      expect(left[0]).toBeCloseTo(1, 5);
      expect(right[0]).toBeCloseTo(-1, 5);
      expect(left[1]).toBeCloseTo(right[1], 5);
      expect(left[2]).toBeCloseTo(right[2], 5);
    });

    it(`${mode} preserves defaults and an explicitly zero film offset`, () => {
      const spec = build({});
      expect(spec).toMatchObject({ mode, fov: defaultFov, near: 0.05, far: 100 });
      for (const key of ["viewOffset", "focalLength", "filmGauge", "filmOffset", "depth"]) {
        expect(spec).not.toHaveProperty(key);
      }
      const zeroOffset = scene().camera(build({ filmOffset: 0 })).toJSON();
      expect(zeroOffset.camera).toHaveProperty("filmOffset", 0);
      expect(productionProjection(zeroOffset)[8]).toBeCloseTo(0);
    });

    it(`${mode} preserves invalid projection inputs for production validation`, () => {
      const cases: readonly { options: CameraOptions; error: RegExp }[] = [
        { options: { focalLength: 0 }, error: /focal length/i },
        { options: { filmGauge: 0 }, error: /film gauge/i },
        { options: { filmOffset: Number.NaN }, error: /film offset/i },
        { options: { viewOffset: tile(401) }, error: /view offset/i }
      ];
      for (const { options, error } of cases) {
        const snapshot = scene().camera(build(options)).toJSON();
        expect(() => productionProjection(snapshot)).toThrow(error);
      }
    });
  }

  it("inherits a moving-camera tile in array views and applies an independent override", async () => {
    const snapshot = scene()
      .camera(camera.orbit({ near: 1, far: 100, fov: 90, viewOffset: tile(0) }))
      .add(cameras.array({ cameras: [
        { viewport: { x: 0, y: 0, width: 0.5, height: 1 } },
        { viewport: { x: 0.5, y: 0, width: 0.5, height: 1 }, camera: { viewOffset: tile(400) } }
      ] }))
      .toJSON();
    const renderer = await Renderer.create({ backend: "mock", width: 800, height: 400 });
    const parity = createProductionParitySurfaces(renderer, () => {});
    try {
      const source = productionInput(snapshot, 800, 400).source;
      const views = parity.prepare(source, snapshot, undefined, 0, 2, { width: 800, height: 400 }).views;
      expect(views).toHaveLength(2);
      const left = views?.[0]?.camera.projectionMatrix;
      const right = views?.[1]?.camera.projectionMatrix;
      if (!left || !right) throw new Error("The array did not produce both view projections.");
      const leftPoint = projectCameraPoint(left, 0, 0.25, -5);
      const rightPoint = projectCameraPoint(right, 0, 0.25, -5);
      expect(leftPoint[0]).toBeCloseTo(1, 5);
      expect(rightPoint[0]).toBeCloseTo(-1, 5);
      expect(leftPoint[1]).toBeCloseTo(rightPoint[1], 5);
      expect(leftPoint[2]).toBeCloseTo(rightPoint[2], 5);
    } finally {
      parity.dispose();
      renderer.dispose();
    }
  });
});
