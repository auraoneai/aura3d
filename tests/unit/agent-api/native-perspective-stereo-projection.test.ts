import { describe, expect, it, vi } from "vitest";
import { createProductionParitySurfaces } from "../../../packages/engine/src/agent-api/compiler/paritySurfaces";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import { cameras } from "../../../packages/engine/src/agent-api/nodes/cameras";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { surfaces } from "../../../packages/engine/src/agent-api/nodes/surfaces";
import type { AuraCameraSpec, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";

const size = { width: 100, height: 50 };
const tile = (x: number) => ({ fullWidth: 800, fullHeight: 400, x, y: 0, width: 400, height: 400 });

function projectX(matrix: ArrayLike<number>, x: number, z: number): number {
  return (matrix[0]! * x + matrix[8]! * z + matrix[12]!) / (matrix[3]! * x + matrix[11]! * z + matrix[15]!);
}

function projectWorldX(matrix: ArrayLike<number>, point: readonly [number, number, number]): number {
  const [x, y, z] = point;
  return (matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!)
    / (matrix[3]! * x + matrix[7]! * y + matrix[11]! * z + matrix[15]!);
}

async function fixture(snapshot: AuraSceneSnapshot) {
  const renderer = await Renderer.create({ backend: "mock", ...size });
  const render = vi.spyOn(renderer, "render");
  const probe = vi.spyOn(renderer, "renderProbeFace");
  const collect = vi.fn(() => []);
  const source = { collectRenderItems: collect, cameraPolicy: "require" as const, frustumCulling: false };
  const parity = createProductionParitySurfaces(renderer, () => {});
  return {
    renderer, render, probe, collect, source,
    prepare: (dimensions = size) => parity.prepare(source, snapshot, undefined, 0, dimensions.width / dimensions.height, dimensions),
    dispose: () => { parity.dispose(); renderer.dispose(); }
  };
}

function withCaptures(spec: AuraCameraSpec, node: ReturnType<typeof cameras.stereo>): AuraSceneSnapshot {
  return scene().camera(spec).add(node).add(cameras.cube({ resolution: 4 })).add(surfaces.mirror({ resolution: 4 })).toJSON();
}

function expectNoCapture(f: Awaited<ReturnType<typeof fixture>>): void {
  expect(f.render).not.toHaveBeenCalled();
  expect(f.probe).not.toHaveBeenCalled();
  expect(f.collect).not.toHaveBeenCalled();
  expect((f.renderer.device as MockRenderDevice).drawCommands).toHaveLength(0);
  expect("views" in f.source).toBe(false);
}

describe("perspective stereo projection preflight", () => {
  it.each([
    { name: "Float32 overflow", zoom: Number.MAX_VALUE },
    { name: "Float32 inverse overflow", zoom: 1e-40 },
    { name: "Float32 underflow to a singular matrix", zoom: Number.MIN_VALUE }
  ])("rejects $name before capture", async ({ zoom }) => {
    const f = await fixture(withCaptures(camera.perspective(), cameras.stereo({ zoom })));
    try {
      expect(() => f.prepare()).toThrow(/CAMERA_STEREO_INVALID/);
      expectNoCapture(f);
    } finally { f.dispose(); }
  });

  it("rejects a right-eye-only overflow without publishing the valid first eye or capturing", async () => {
    const snapshot = withCaptures(camera.perspective({ fov: 90 }), cameras.stereo({
      zoom: 5e37,
      views: [{ camera: { fov: 90 } }, { camera: { fov: 10 } }]
    }));
    const f = await fixture(snapshot);
    try {
      expect(() => f.prepare()).toThrow(/CAMERA_STEREO_INVALID/);
      expectNoCapture(f);
    } finally { f.dispose(); }
  });

  it("rejects a finite eye projection whose Float32 view-projection overflows", async () => {
    const snapshot = withCaptures(camera.perspective({ position: [10, 0, 5], target: [10, 0, 0], fov: 90 }),
      cameras.stereo({ zoom: 1e38 }));
    const f = await fixture(snapshot);
    try {
      expect(() => f.prepare()).toThrow(/CAMERA_STEREO_INVALID/);
      expectNoCapture(f);
    } finally { f.dispose(); }
  });

  it.each([
    {
      name: "eye separation below Float32 precision",
      spec: camera.perspective({ position: [0, 0, 5], target: [0, 0, 0] }),
      stereo: cameras.stereo({ eyeSeparation: 1e-50, focus: 5 })
    },
    {
      name: "eye translation lost beside a large camera translation",
      spec: camera.perspective({ position: [1e9, 0, 5], target: [1e9, 0, 0] }),
      stereo: cameras.stereo({ eyeSeparation: 0.2, focus: 5 })
    },
    {
      name: "convergence shift lost beside an asymmetric tile offset",
      spec: camera.perspective({ position: [0, 0, 5], target: [0, 0, 0], near: 1, far: 1e9,
        fov: 90, viewOffset: tile(0) }),
      stereo: cameras.stereo({ eyeSeparation: 0.2, focus: 1e8 })
    }
  ])("rejects $name before capture", async ({ spec, stereo }) => {
    const f = await fixture(withCaptures(spec, stereo));
    try {
      expect(() => f.prepare()).toThrow(/CAMERA_STEREO_PRECISION_UNSUPPORTED/);
      expectNoCapture(f);
    } finally { f.dispose(); }
  });

  it("retains a representable subnormal eye displacement and convergence shift", async () => {
    const spec = camera.perspective({ position: [0, 0, 5], target: [0, 0, 0] });
    const f = await fixture(scene().camera(spec).add(cameras.stereo({ eyeSeparation: 1e-40, focus: 5 })).toJSON());
    try {
      const [left, right] = f.prepare().views!;
      expect(left!.camera.viewMatrix![12]).toBeGreaterThan(0);
      expect(right!.camera.viewMatrix![12]).toBeLessThan(0);
      expect(left!.camera.projectionMatrix![8]).toBeGreaterThan(0);
      expect(right!.camera.projectionMatrix![8]).toBeLessThan(0);
    } finally { f.dispose(); }
  });

  it("preserves rotated eye poses and physical tiled seams at normal zoom through resize", async () => {
    const makeSnapshot = (x: number) => scene().camera(camera.perspective({
      position: [5, 3, 7], target: [1, 1, 2], near: 1, far: 100,
      fov: 0, focalLength: 50, filmGauge: 36, filmOffset: 9, viewOffset: tile(x)
    })).add(cameras.stereo({ eyeSeparation: 0.3, focus: 5, zoom: 2 })).toJSON();
    const leftTile = await fixture(makeSnapshot(0));
    const rightTile = await fixture(makeSnapshot(400));
    const distance = Math.sqrt(45);
    const focusPoint: readonly [number, number, number] = [5 - 20 / distance, 3 - 10 / distance, 7 - 25 / distance];
    try {
      for (const dimensions of [size, { width: 200, height: 125 }]) {
        const leftViews = leftTile.prepare(dimensions).views!;
        const rightViews = rightTile.prepare(dimensions).views!;
        for (const index of [0, 1] as const) {
          const left = leftViews[index]!;
          const right = rightViews[index]!;
          const sign = index === 0 ? 1 : -1;
          const seam = 0.09 + sign * 0.03;
          expect(left.camera.viewMatrix![12]).toBeCloseTo(Math.fround(3 / Math.sqrt(41)) + sign * 0.15, 5);
          expect(left.camera.projectionMatrix![0]).toBeCloseTo(100 / 9, 5);
          expect(projectX(left.camera.projectionMatrix!, seam, -1)).toBeCloseTo(1, 5);
          expect(projectX(right.camera.projectionMatrix!, seam, -1)).toBeCloseTo(-1, 5);
        }
        for (const views of [leftViews, rightViews]) {
          expect(projectWorldX(views[0]!.camera.viewProjectionMatrix!, focusPoint))
            .toBeCloseTo(projectWorldX(views[1]!.camera.viewProjectionMatrix!, focusPoint), 4);
        }
      }
    } finally { leftTile.dispose(); rightTile.dispose(); }
  });

  it.each([0, Number.NaN, Infinity])("uses a valid physical lens when inactive FOV is %s", async (fov) => {
    const spec = camera.perspective({ position: [0, 0, 5], target: [0, 0, 0], near: 1, far: 100,
      fov, focalLength: 50, filmGauge: 36, filmOffset: 9 });
    const node = cameras.stereo({ eyeSeparation: 0.2, focus: 5, views: [
      { camera: { fov, viewOffset: tile(0) } },
      { camera: { fov, viewOffset: tile(400) } }
    ] });
    const f = await fixture(scene().camera(spec).add(node).toJSON());
    try {
      const views = f.prepare().views!;
      expect(views).toHaveLength(2);
      const left = views[0]!.camera.projectionMatrix!;
      const right = views[1]!.camera.projectionMatrix!;
      expect(Array.from(left).every(Number.isFinite)).toBe(true);
      expect(Array.from(right).every(Number.isFinite)).toBe(true);
      // 50 mm focal length and a 36 mm gate at aspect 2 give a 0.18-unit
      // half-height; the 9 mm shift and eye convergence move these tile edges.
      expect(left[0]).toBeCloseTo(50 / 9, 5);
      expect(left[5]).toBeCloseTo(50 / 9, 5);
      expect(right[0]).toBeCloseTo(50 / 9, 5);
      expect(projectX(left, -0.16, -1)).toBeCloseTo(-1, 5);
      expect(projectX(left, 0.20, -1)).toBeCloseTo(1, 5);
      expect(projectX(right, 0.16, -1)).toBeCloseTo(-1, 5);
      expect(projectX(right, 0.52, -1)).toBeCloseTo(1, 5);
      expect(views.map((view) => view.camera.projectionMetadata)).toEqual([
        { kind: "perspective", near: 1, far: 100, mode: "standard", clipRange: "minus-one-to-one" },
        { kind: "perspective", near: 1, far: 100, mode: "standard", clipRange: "minus-one-to-one" }
      ]);
    } finally { f.dispose(); }
  });

  it("continues rejecting an invalid FOV when no physical lens takes precedence", async () => {
    const snapshot = withCaptures(camera.perspective({ fov: 0 }), cameras.stereo());
    const f = await fixture(snapshot);
    try {
      expect(() => f.prepare()).toThrow(/field of view/i);
      expectNoCapture(f);
    } finally { f.dispose(); }
  });
});
