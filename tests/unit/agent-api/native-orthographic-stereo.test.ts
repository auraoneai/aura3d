import { describe, expect, it } from "vitest";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import { cameras } from "../../../packages/engine/src/agent-api/nodes/cameras";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { createProductionParitySurfaces } from "../../../packages/engine/src/agent-api/compiler/paritySurfaces";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";

// These checks use points and matrices in Aura's documented column-major
// convention. They do not rely on another engine's stereo implementation.
type Vec3 = readonly [number, number, number];
const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const source = () => ({ renderItems: [], cameraPolicy: "require" as const, frustumCulling: false });

function project(matrix: ArrayLike<number>, point: Vec3): Vec3 {
  const [x, y, z] = point;
  const w = matrix[3]! * x + matrix[7]! * y + matrix[11]! * z + matrix[15]!;
  return [
    (matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!) / w,
    (matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!) / w,
    (matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!) / w
  ];
}

function expectInverse(matrix: ArrayLike<number>, inverse: ArrayLike<number>): void {
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      let value = 0;
      for (let k = 0; k < 4; k += 1) value += matrix[k * 4 + row]! * inverse[column * 4 + k]!;
      expect(value).toBeCloseTo(row === column ? 1 : 0, 5);
    }
  }
}

async function fixture(
  cameraSpec: ReturnType<typeof camera.orthographic>,
  options: Parameters<typeof cameras.stereo>[0] = {},
  size = { width: 100, height: 50 }
) {
  const renderer = await Renderer.create({ backend: "mock", width: size.width, height: size.height });
  const warnings: string[] = [];
  const surfaces = createProductionParitySurfaces(renderer, (message) => warnings.push(message));
  const snapshot = scene().camera(cameraSpec).add(cameras.stereo(options)).toJSON();
  const prepare = (dimensions = size) => surfaces.prepare(source(), snapshot as never, undefined, 0, dimensions.width / dimensions.height, dimensions);
  const dispose = () => { surfaces.dispose(); renderer.dispose(); };
  return { renderer, surfaces, snapshot, warnings, prepare, dispose };
}

describe("orthographic stereo scene cameras", () => {
  it.each([
    {
      name: "front-facing orthographic",
      spec: () => camera.orthographic({ position: [0, 0, 6], target: [0, 0, 0], orthographicSize: 2, near: 0.1, far: 50 }),
      eye: [0, 0, 6] as Vec3,
      right: [1, 0, 0] as Vec3
    },
    {
      name: "rotated orthographic",
      spec: () => camera.orthographic({ position: [6, 0, 0], target: [0, 0, 0], orthographicSize: 2, near: 0.1, far: 50 }),
      eye: [6, 0, 0] as Vec3,
      right: [0, 0, -1] as Vec3
    },
    {
      name: "isometric",
      spec: () => camera.isometric({ distance: 6, target: [0, 0, 0], orthographicSize: 2, near: 0.1, far: 50 }),
      eye: [Math.sqrt(12), Math.sqrt(12), Math.sqrt(12)] as Vec3,
      right: [Math.SQRT1_2, 0, -Math.SQRT1_2] as Vec3
    }
  ])("projects the focus plane with zero disparity and opposite depth disparity ($name)", async ({ spec, eye, right }) => {
    const f = await fixture(spec(), { eyeSeparation: 0.2, focus: 6 });
    const views = f.prepare().views!;
    expect(f.warnings).toEqual([]);
    expect(views).toHaveLength(2);
    for (let axis = 0; axis < 3; axis += 1) {
      expect(views[0]!.cameraPosition![axis]).toBeCloseTo(eye[axis]! - 0.1 * right[axis]!, 5);
      expect(views[1]!.cameraPosition![axis]).toBeCloseTo(eye[axis]! + 0.1 * right[axis]!, 5);
    }
    const focus: Vec3 = [0, 0, 0];
    const front: Vec3 = [eye[0] / 2, eye[1] / 2, eye[2] / 2];
    const back: Vec3 = [-eye[0], -eye[1], -eye[2]];
    const left = views[0]!.camera.viewProjectionMatrix!;
    const rightMatrix = views[1]!.camera.viewProjectionMatrix!;
    const focusLeft = project(left, focus), focusRight = project(rightMatrix, focus);
    const frontLeft = project(left, front), frontRight = project(rightMatrix, front);
    const backLeft = project(left, back), backRight = project(rightMatrix, back);
    expect(focusLeft[0]).toBeCloseTo(focusRight[0], 5);
    expect(frontLeft[0] - frontRight[0]).toBeGreaterThan(0.001);
    expect(backLeft[0] - backRight[0]).toBeLessThan(-0.001);
    for (const [a, b] of [[focusLeft, focusRight], [frontLeft, frontRight], [backLeft, backRight]]) {
      expect(a![1]).toBeCloseTo(b![1], 5);
      expect(a![2]).toBeCloseTo(b![2], 5);
    }
    for (const view of views) {
      expect(view.camera.projectionMetadata).toEqual({ kind: "orthographic", near: 0.1, far: 50, mode: "standard", clipRange: "minus-one-to-one" });
      expect(view.camera.projectionMatrixInverse).toBeDefined();
      expectInverse(view.camera.projectionMatrix!, view.camera.projectionMatrixInverse!);
    }
    f.dispose();
  });

  it.each([
    { layout: "side-by-side" as const, initial: [rect(0, 0, 50, 51), rect(50, 0, 51, 51)], resized: [rect(0, 0, 100, 101), rect(100, 0, 101, 101)] },
    { layout: "over-under" as const, initial: [rect(0, 25, 101, 26), rect(0, 0, 101, 25)], resized: [rect(0, 50, 201, 51), rect(0, 0, 201, 50)] }
  ])("preserves odd pixels and eye IDs after resize ($layout)", async ({ layout, initial, resized }) => {
    const f = await fixture(camera.orthographic(), { name: "stereo", layout }, { width: 101, height: 51 });
    const before = f.prepare().views!;
    const after = f.prepare({ width: 201, height: 101 }).views!;
    expect(before.map((view) => view.viewport)).toEqual(initial);
    expect(after.map((view) => view.viewport)).toEqual(resized);
    expect(before.map((view) => view.id)).toEqual(after.map((view) => view.id));
    expect(before[0]!.id).not.toEqual(before[1]!.id);
    f.dispose();
  });

  it("lowers independent eye options, zoom and tiled projection before and after resize", async () => {
    const f = await fixture(camera.orthographic({ position: [0, 0, 6], target: [0, 0, 0], orthographicSize: 4 }), {
      name: "eyes", eyeSeparation: 0.2, focus: 6, zoom: 2,
      views: [
        {
          id: "left", viewport: rect(0, 0, 0.4, 1), scissor: rect(0.1, 0.2, 0.2, 0.6), postprocess: false,
          camera: { layers: 1, near: 1, far: 11, viewOffset: { fullWidth: 100, fullHeight: 50, x: 50, y: 0, width: 50, height: 50 } }
        },
        {
          id: "right", viewport: rect(0.4, 0.2, 0.6, 0.8),
          camera: { position: [4, 0, 6], target: [4, 0, 0], orthographicSize: 6, near: 2, far: 42, layers: 4 },
          postprocess: { colorGrade: { saturation: 0.2 } }
        }
      ]
    });
    const [left, right] = f.prepare().views!;
    expect(left).toMatchObject({ id: "eyes:id:left", viewport: rect(0, 0, 40, 50), scissor: rect(10, 10, 20, 30), postprocess: false, camera: { layerMask: 1 } });
    expect(right).toMatchObject({ id: "eyes:id:right", viewport: rect(40, 10, 60, 40), postprocess: { colorGrade: { saturation: 0.2 } }, camera: { layerMask: 4 } });
    expect(left!.cameraPosition![0]).toBeCloseTo(-0.1, 5);
    expect(right!.cameraPosition![0]).toBeCloseTo(4.1, 5);
    expect(left!.camera.projectionMetadata).toEqual({ kind: "orthographic", near: 1, far: 11, mode: "standard", clipRange: "minus-one-to-one" });
    expect(right!.camera.projectionMetadata).toEqual({ kind: "orthographic", near: 2, far: 42, mode: "standard", clipRange: "minus-one-to-one" });
    // Zoom first yields a full window [-4,4] x [-2,2]; the selected
    // right-half tile is [0,4] x [-2,2], independent of viewport aspect.
    expect(left!.camera.projectionMatrix![0]).toBeCloseTo(0.5, 6);
    expect(left!.camera.projectionMatrix![5]).toBeCloseTo(0.5, 6);
    expect(left!.camera.projectionMatrix![12]).toBeCloseTo(-1, 6);
    expect(right!.camera.projectionMatrix![5]).toBeCloseTo(1 / 3, 6);
    expectInverse(left!.camera.projectionMatrix!, left!.camera.projectionMatrixInverse!);
    expectInverse(right!.camera.projectionMatrix!, right!.camera.projectionMatrixInverse!);
    const resized = f.prepare({ width: 200, height: 100 }).views!;
    expect(resized.map((view) => view.id)).toEqual([left!.id, right!.id]);
    expect(resized[0]).toMatchObject({ viewport: rect(0, 0, 80, 100), scissor: rect(20, 20, 40, 60) });
    expect(resized[1]!.viewport).toEqual(rect(80, 20, 120, 80));
    f.dispose();
  });

  it("inherits scene postprocessing only for an eye without an override", async () => {
    const f = await fixture(camera.orthographic(), { views: [{ postprocess: false }, {}] });
    const inherited = { colorGrade: { contrast: 1.2 } };
    const prepared = f.surfaces.prepare({ ...source(), postprocess: inherited }, f.snapshot as never, undefined, 0, 2, { width: 100, height: 50 });
    expect(prepared.postprocess).toBe(inherited);
    expect(prepared.views![0]!.postprocess).toBe(false);
    expect(prepared.views![1]!.postprocess).toBeUndefined();
    f.dispose();
  });

  it("inherits the public scene camera's orientation, tile and layers in each eye", async () => {
    const f = await fixture(camera.orthographic({
      position: [0, 0, 6], target: [0, 0, 0], up: [1, 0, 0], orthographicSize: 2, layers: 8,
      viewOffset: { fullWidth: 100, fullHeight: 50, x: 0, y: 0, width: 50, height: 50 },
      depth: { mode: "standard" }
    }), { eyeSeparation: 0.2, focus: 6 });
    const [left, right] = f.prepare().views!;
    expect(left!.cameraPosition![0]).toBeCloseTo(0, 5);
    expect(left!.cameraPosition![1]).toBeCloseTo(0.1, 5);
    expect(right!.cameraPosition![1]).toBeCloseTo(-0.1, 5);
    expect(left!.camera.layerMask).toBe(8);
    expect(right!.camera.layerMask).toBe(8);
    // The left half of the full orthographic window is [-4, 0].
    expect(left!.camera.projectionMatrix![0]).toBeCloseTo(0.5, 6);
    expect(left!.camera.projectionMatrix![12]).toBeCloseTo(1, 6);
    expect(right!.camera.projectionMatrix![12]).toBeCloseTo(1, 6);
    f.dispose();
  });

  it.each(["reversed", "logarithmic"] as const)("publishes native per-eye %s depth without drawing", async (mode) => {
    // Logarithmic depth needs a positive orthographic near plane.
    const f = await fixture(camera.orthographic({ near: 0.1 }), { views: [{}, { camera: { depth: { mode } } }] });
    const [left, right] = f.prepare().views!;
    expect(left!.camera.depthConvention?.mode).toBe("standard");
    expect(right!.camera.depthConvention?.mode).toBe(mode);
    expect(right!.camera.projectionMetadata).toMatchObject({ kind: "orthographic", mode });
    expect((f.renderer.device as MockRenderDevice).drawCommands).toHaveLength(0);
    f.dispose();
  });

  it("rejects a runtime zero-to-one scene-camera clip range before drawing", async () => {
    const f = await fixture(camera.orthographic({ depth: { mode: "reversed", clipRange: "zero-to-one" } as never }));
    expect(() => f.prepare()).toThrow(/CAMERA_STEREO_DEPTH_UNSUPPORTED/);
    expect((f.renderer.device as MockRenderDevice).drawCommands).toHaveLength(0);
    f.dispose();
  });

  it("rejects a stereo or per-eye field of view for a parallel projection", async () => {
    const stereoFov = await fixture(camera.orthographic(), { fov: 45 });
    expect(() => stereoFov.prepare()).toThrow(/CAMERA_STEREO_FOV_UNSUPPORTED/);
    stereoFov.dispose();

    const eyeFov = await fixture(camera.orthographic(), { views: [{ camera: { fov: 45 } }, {}] });
    expect(() => eyeFov.prepare()).toThrow(/CAMERA_STEREO_FOV_UNSUPPORTED/);
    eyeFov.dispose();
  });

  it("rejects a mixed orthographic and perspective eye pair before drawing", async () => {
    const f = await fixture(camera.orthographic(), { views: [{}, { camera: { mode: "perspective" } }] });
    expect(() => f.prepare()).toThrow(/CAMERA_STEREO_PROJECTION_MIXED/);
    expect((f.renderer.device as MockRenderDevice).drawCommands).toHaveLength(0);
    f.dispose();

    const perspective = await fixture(camera.perspective(), { views: [{}, { camera: { mode: "orthographic" } }] });
    expect(() => perspective.prepare()).toThrow(/CAMERA_STEREO_PROJECTION_MIXED/);
    expect((perspective.renderer.device as MockRenderDevice).drawCommands).toHaveLength(0);
    perspective.dispose();
  });

  it("supports two parallel-projection eye overrides on a perspective scene camera", async () => {
    const f = await fixture(camera.perspective({ position: [0, 0, 6], target: [0, 0, 0] }), {
      focus: 6, views: [
        { camera: { mode: "orthographic", orthographicSize: 2 } },
        { camera: { mode: "isometric", orthographicSize: 2 } }
      ]
    });
    const views = f.prepare().views!;
    expect(views.map((view) => view.camera.projectionMetadata?.kind)).toEqual(["orthographic", "orthographic"]);
    expect(project(views[0]!.camera.viewProjectionMatrix!, [0, 0, 0])[0]).toBeCloseTo(project(views[1]!.camera.viewProjectionMatrix!, [0, 0, 0])[0], 5);
    f.dispose();
  });

  it("rejects eye shear lost to Float32 precision", async () => {
    const f = await fixture(camera.orthographic(), { eyeSeparation: 0.2, focus: Number.MAX_VALUE });
    expect(() => f.prepare()).toThrow(/CAMERA_STEREO_PRECISION_UNSUPPORTED/);
    expect((f.renderer.device as MockRenderDevice).drawCommands).toHaveLength(0);
    f.dispose();
  });

  it("rejects a projection that overflows the renderer's Float32 matrix", async () => {
    const f = await fixture(camera.orthographic(), { views: [{ camera: { orthographicSize: 1e-40 } }, {}] });
    expect(() => f.prepare()).toThrow(/CAMERA_STEREO_INVALID/);
    expect((f.renderer.device as MockRenderDevice).drawCommands).toHaveLength(0);
    f.dispose();
  });

  it("renders each eye using its own sheared frustum and layer mask", async () => {
    const f = await fixture(camera.orthographic({ position: [0, 0, 6], target: [0, 0, 0], orthographicSize: 1 }), {
      eyeSeparation: 2, focus: 6, views: [{ camera: { layers: 1 } }, { camera: { layers: 2 } }]
    });
    const device = f.renderer.device as MockRenderDevice;
    const frames: Array<Array<string | undefined>> = [];
    const endFrame = device.endFrame.bind(device);
    device.endFrame = () => { frames.push(device.drawCommands.map((command) => command.label)); endFrame(); };
    const geometry = Geometry.litCube(0.1);
    const material = new UnlitMaterial();
    const item = (label: string, x: number, layerMask: number) => ({
      label, geometry, material, layerMask, includeInAutoFrame: false,
      modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 3, 1])
    });
    const renderSource = {
      renderItems: [item("left-edge", -1, 3), item("right-edge", 1, 3), item("left-layer", 0, 1), item("right-layer", 0, 2)],
      cameraPolicy: "require" as const, frustumCulling: true, staticBatching: false, staticMeshConsolidation: false
    };
    const prepared = f.surfaces.prepare(renderSource, f.snapshot as never, undefined, 0, 2, { width: 100, height: 50 });
    f.renderer.render(prepared);
    expect(frames).toHaveLength(3);
    expect(frames[0]!.sort()).toEqual(["left-edge", "left-layer"]);
    expect(frames[1]!.sort()).toEqual(["right-edge", "right-layer"]);
    f.dispose();
    geometry.dispose();
    material.dispose();
  });
});
