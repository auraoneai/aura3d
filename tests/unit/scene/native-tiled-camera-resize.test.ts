import { describe, expect, it, vi } from "vitest";
import { Vector3 } from "@aura3d/math";
import { OrthographicCamera, PerspectiveCamera } from "@aura3d/scene";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";

const leftTile = { fullWidth: 800, fullHeight: 400, x: 0, y: 0, width: 400, height: 400 };
const rightTile = { ...leftTile, x: 400 };

function project(matrix: ArrayLike<number>, x: number, y: number, z: number): readonly [number, number, number] {
  const w = matrix[3]! * x + matrix[7]! * y + matrix[11]! * z + matrix[15]!;
  return [
    (matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!) / w,
    (matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!) / w,
    (matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!) / w
  ];
}

function expectIdentityProduct(matrix: ArrayLike<number>, inverse: ArrayLike<number>): void {
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      let value = 0;
      for (let k = 0; k < 4; k += 1) value += matrix[k * 4 + row]! * inverse[column * 4 + k]!;
      expect(value).toBeCloseTo(row === column ? 1 : 0, 7);
    }
  }
}

describe("perspective full-image tile aspect", () => {
  it("uses the full image at construction and keeps the separately authored aspect", () => {
    const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 2, aspect: 0.75, near: 1, far: 20, viewOffset: leftTile });
    expect(camera.aspect).toBe(0.75);
    // Full near-plane rectangle is [-2, 2] x [-1, 1]; the left tile is [-2, 0].
    expect(project(camera.projectionMatrix, -2, 0, -1)[0]).toBeCloseTo(-1, 7);
    expect(project(camera.projectionMatrix, 0, 0, -1)[0]).toBeCloseTo(1, 7);
    expect(camera.projectionMatrix[0]).toBeCloseTo(1, 7);
    expect(camera.projectionMetadata.viewOffset).toEqual(leftTile);
    expectIdentityProduct(camera.projectionMatrix, camera.projectionMatrixInverse);
    expect(camera.frustum.containsPoint(new Vector3(-3, 0, -2))).toBe(true);
    expect(camera.frustum.containsPoint(new Vector3(-5, 0, -2))).toBe(false);
  });

  it("sets and clears offsets without losing the authored aspect, then retains ordinary resize semantics", () => {
    const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 2, aspect: 0.75, near: 1, far: 20 });
    const original = [...camera.projectionMatrix];
    camera.setViewOffset(leftTile);
    expect(camera.aspect).toBe(0.75);
    expect(camera.projectionMatrix[0]).toBeCloseTo(1, 7);
    camera.clearViewOffset();
    expect(camera.aspect).toBe(0.75);
    expect(camera.projectionMatrix).toEqual(original);

    camera.setViewOffset(rightTile);
    camera.resize(400, 400);
    expect(camera.aspect).toBe(1);
    expect(project(camera.projectionMatrix, 0, 0, -1)[0]).toBeCloseTo(-1, 7);
    expect(project(camera.projectionMatrix, 2, 0, -1)[0]).toBeCloseTo(1, 7);
    camera.clearViewOffset();
    expect(camera.aspect).toBe(1);
    expect(camera.projectionMatrix[0]).toBeCloseTo(1, 7);
    camera.resize(1200, 600);
    expect(camera.aspect).toBe(2);
    expect(camera.projectionMatrix[0]).toBeCloseTo(0.5, 7);
  });

  it("uses the full portrait image for an off-center tile through repeated viewport resize", () => {
    const tile = { fullWidth: 400, fullHeight: 800, x: 100, y: 200, width: 200, height: 400 };
    const camera = new PerspectiveCamera({ fovYRadians: Math.PI / 2, aspect: 3, near: 1, far: 20, viewOffset: tile });
    const assertTile = () => {
      // Full near plane [-0.5, 0.5] x [-1, 1], crop [-0.25, 0.25] x [-0.5, 0.5].
      expect(project(camera.projectionMatrix, -0.25, -0.5, -1)[0]).toBeCloseTo(-1, 7);
      expect(project(camera.projectionMatrix, -0.25, -0.5, -1)[1]).toBeCloseTo(-1, 7);
      expect(project(camera.projectionMatrix, 0.25, 0.5, -1)[0]).toBeCloseTo(1, 7);
      expect(project(camera.projectionMatrix, 0.25, 0.5, -1)[1]).toBeCloseTo(1, 7);
    };
    assertTile();
    camera.resize(200, 200);
    assertTile();
    camera.resize(800, 300);
    assertTile();
  });

  it("computes physical gate and film shift from the full image and restores them after clearing", () => {
    const camera = new PerspectiveCamera({ aspect: 0.75, focalLength: 50, filmGauge: 36, filmOffset: 9, near: 1, far: 20 });
    expect(camera.getFilmWidth()).toBeCloseTo(27, 7);
    expect(camera.getFilmHeight()).toBeCloseTo(36, 7);
    camera.setViewOffset(leftTile);
    expect(camera.aspect).toBe(0.75);
    expect(camera.getFilmWidth()).toBeCloseTo(36, 7);
    expect(camera.getFilmHeight()).toBeCloseTo(18, 7);
    expect(camera.getFocalLength()).toBeCloseTo(50, 7);
    expect(camera.fovYRadians).toBeCloseTo(2 * Math.atan(18 / 100), 7);
    // 50 mm lens, 36 mm film and a 9 mm shift: the left tile spans [-0.18, 0.18] at near=1.
    expect(project(camera.projectionMatrix, -0.18, 0, -1)[0]).toBeCloseTo(-1, 7);
    expect(project(camera.projectionMatrix, 0.18, 0, -1)[0]).toBeCloseTo(1, 7);
    camera.clearViewOffset();
    expect(camera.getFilmWidth()).toBeCloseTo(27, 7);
    expect(camera.getFilmHeight()).toBeCloseTo(36, 7);
    expect(camera.getFocalLength()).toBeCloseTo(50, 7);
  });

  it("preserves projection depth and inverse behavior with a tile", () => {
    const camera = new PerspectiveCamera({ aspect: 1, near: 1, far: Infinity,
      depth: { mode: "reversed", clipRange: "zero-to-one" }, viewOffset: leftTile });
    camera.resize(400, 400);
    expect(camera.projectionMetadata).toMatchObject({ mode: "reversed", clipRange: "zero-to-one", far: Infinity, viewOffset: leftTile });
    expect(project(camera.projectionMatrix, 0, 0, -1)[2]).toBeCloseTo(1, 7);
    expect(project(camera.projectionMatrix, 0, 0, -1e9)[2]).toBeCloseTo(0, 7);
    expectIdentityProduct(camera.projectionMatrix, camera.projectionMatrixInverse);
    expect(camera.frustum.activePlanes).toHaveLength(5);
  });

  it("leaves an existing offset and matrices intact after rejected changes", () => {
    const camera = new PerspectiveCamera({ aspect: 0.75, viewOffset: leftTile });
    const before = [...camera.projectionMatrix];
    expect(() => camera.setViewOffset({ ...leftTile, x: 401 })).toThrow(/offset/i);
    expect(() => camera.resize(0, 400)).toThrow(/resize/i);
    expect(camera.viewOffset).toEqual(leftTile);
    expect(camera.aspect).toBe(0.75);
    expect(camera.projectionMatrix).toEqual(before);
  });
});

describe("orthographic full-image tile aspect", () => {
  it("crops explicitly authored full frustum bounds at construction and after set/clear", () => {
    const options = { left: -5, right: 3, bottom: -2, top: 2, near: 0, far: 20, zoom: 2 };
    const camera = new OrthographicCamera({ ...options, viewOffset: leftTile });
    expect([camera.left, camera.right, camera.bottom, camera.top]).toEqual([-5, 3, -2, 2]);
    expect(project(camera.projectionMatrix, -2.5, 0, -1)[0]).toBeCloseTo(-1, 7);
    expect(project(camera.projectionMatrix, -0.5, 0, -1)[0]).toBeCloseTo(1, 7);
    camera.clearViewOffset();
    expect(project(camera.projectionMatrix, -2.5, 0, -1)[0]).toBeCloseTo(-1, 7);
    expect(project(camera.projectionMatrix, 1.5, 0, -1)[0]).toBeCloseTo(1, 7);
    camera.setViewOffset(rightTile);
    expect(project(camera.projectionMatrix, -0.5, 0, -1)[0]).toBeCloseTo(-1, 7);
    expect(project(camera.projectionMatrix, 1.5, 0, -1)[0]).toBeCloseTo(1, 7);
    expect([camera.left, camera.right, camera.bottom, camera.top]).toEqual([-5, 3, -2, 2]);
  });

  it.each([
    { mode: "fit-vertical" as const, bounds: [-1, 3, -1, 1], edge: -0.5, seam: 0.5 },
    { mode: "fit-horizontal" as const, bounds: [-2, 4, -1.5, 1.5], edge: -1, seam: 0.5 },
    { mode: "preserve-frustum" as const, bounds: [-2, 4, -1.5, 1.5], edge: -1, seam: 0.5 }
  ])("fits the full frustum before a tile crop for $mode", ({ mode, bounds, edge, seam }) => {
    const camera = new OrthographicCamera({ left: -2, right: 4, bottom: -1, top: 1, near: 0, far: 20,
      zoom: 2, resizeMode: mode, viewOffset: leftTile });
    camera.resize(400, 400);
    expect([camera.left, camera.right, camera.bottom, camera.top]).toEqual(bounds);
    expect(project(camera.projectionMatrix, edge, 0, -1)[0]).toBeCloseTo(-1, 7);
    expect(project(camera.projectionMatrix, seam, 0, -1)[0]).toBeCloseTo(1, 7);
    expectIdentityProduct(camera.projectionMatrix, camera.projectionMatrixInverse);
    camera.resize(1000, 1000);
    expect([camera.left, camera.right, camera.bottom, camera.top]).toEqual(bounds);
    camera.clearViewOffset();
    expect([camera.left, camera.right, camera.bottom, camera.top]).toEqual(bounds);
    expect(project(camera.projectionMatrix, bounds[0]! / 2, 0, -1)[0]).toBeCloseTo(-1, 7);
    expect(project(camera.projectionMatrix, bounds[1]! / 2, 0, -1)[0]).toBeCloseTo(1, 7);
  });

  it.each([
    { mode: "fit-vertical" as const, bounds: [0, 2, -1, 1] },
    { mode: "fit-horizontal" as const, bounds: [-2, 4, -3, 3] },
    { mode: "preserve-frustum" as const, bounds: [-2, 4, -3, 3] }
  ])("keeps ordinary no-offset $mode resizing", ({ mode, bounds }) => {
    const camera = new OrthographicCamera({ left: -2, right: 4, bottom: -1, top: 1, near: 0, far: 20, resizeMode: mode });
    camera.resize(400, 400);
    expect([camera.left, camera.right, camera.bottom, camera.top]).toEqual(bounds);
  });
});

describe("renderer resolution of public tiled scene cameras", () => {
  it.each(["render", "renderAsync", "precompile"] as const)("retains full-image boundaries in both square views during %s", async (operation) => {
    const renderer = await Renderer.create({ backend: "mock", width: 800, height: 400 });
    const left = new PerspectiveCamera({ fovYRadians: Math.PI / 2, near: 1, far: 20, viewOffset: leftTile });
    const right = new PerspectiveCamera({ fovYRadians: Math.PI / 2, near: 1, far: 20, viewOffset: rightTile });
    const leftResize = vi.spyOn(left, "resize");
    const rightResize = vi.spyOn(right, "resize");
    const source = { renderItems: [{ geometry: Geometry.triangle(), material: new UnlitMaterial() }],
      cameraPolicy: "require" as const, frustumCulling: false, staticBatching: false, staticMeshConsolidation: false };
    const input = { source, views: [
      { id: "left", camera: left, viewport: { x: 0, y: 0, width: 400, height: 400 } },
      { id: "right", camera: right, viewport: { x: 400, y: 0, width: 400, height: 400 } }
    ] };
    try {
      if (operation === "render") renderer.render(input);
      else if (operation === "renderAsync") await renderer.renderAsync(input);
      else await renderer.precompile(input);
      expect(leftResize).toHaveBeenCalledWith(400, 400);
      expect(rightResize).toHaveBeenCalledWith(400, 400);
      expect(project(left.projectionMatrix, -2, 0, -1)[0]).toBeCloseTo(-1, 7);
      expect(project(left.projectionMatrix, 0, 0, -1)[0]).toBeCloseTo(1, 7);
      expect(project(right.projectionMatrix, 0, 0, -1)[0]).toBeCloseTo(-1, 7);
      expect(project(right.projectionMatrix, 2, 0, -1)[0]).toBeCloseTo(1, 7);
      expect(left.frustum.containsPoint(new Vector3(-3, 0, -2))).toBe(true);
      expect(right.frustum.containsPoint(new Vector3(3, 0, -2))).toBe(true);
    } finally { renderer.dispose(); }
  });

  it.each(["render", "precompile"] as const)("fits orthographic full-image bounds during %s", async (operation) => {
    const renderer = await Renderer.create({ backend: "mock", width: 800, height: 400 });
    const base = { left: -4, right: 4, bottom: -2, top: 2, near: 0, far: 20 };
    const left = new OrthographicCamera({ ...base, viewOffset: leftTile });
    const right = new OrthographicCamera({ ...base, viewOffset: rightTile });
    const leftResize = vi.spyOn(left, "resize");
    const rightResize = vi.spyOn(right, "resize");
    const source = { renderItems: [{ geometry: Geometry.triangle(), material: new UnlitMaterial() }],
      cameraPolicy: "require" as const, frustumCulling: false, staticBatching: false, staticMeshConsolidation: false };
    const input = { source, views: [
      { id: "left", camera: left, viewport: { x: 0, y: 0, width: 400, height: 400 } },
      { id: "right", camera: right, viewport: { x: 400, y: 0, width: 400, height: 400 } }
    ] };
    try {
      if (operation === "render") renderer.render(input);
      else await renderer.precompile(input);
      expect(leftResize).toHaveBeenCalledWith(400, 400);
      expect(rightResize).toHaveBeenCalledWith(400, 400);
      expect(project(left.projectionMatrix, -4, 0, -1)[0]).toBeCloseTo(-1, 7);
      expect(project(left.projectionMatrix, 0, 0, -1)[0]).toBeCloseTo(1, 7);
      expect(project(right.projectionMatrix, 0, 0, -1)[0]).toBeCloseTo(-1, 7);
      expect(project(right.projectionMatrix, 4, 0, -1)[0]).toBeCloseTo(1, 7);
      expect(left.frustum.containsPoint(new Vector3(-3, 0, -1))).toBe(true);
      expect(right.frustum.containsPoint(new Vector3(3, 0, -1))).toBe(true);
    } finally { renderer.dispose(); }
  });
});
