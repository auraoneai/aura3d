import { describe, expect, it } from "vitest";
import { PerspectiveCamera } from "@aura3d/scene";
import { fitDirectionalCascades } from "../../../../packages/rendering/src/shadows/DirectionalCascadeFitter";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem";

const LIGHT_DIR = [0, -1, 0] as const;
const MAP_SIZE = 512;

const cameraAt = (x = 0, yawRadians = 0) => {
  const cam = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 1, near: 0.5, far: 60 });
  cam.transform.setPosition(x, 4, 10);
  const half = yawRadians / 2;
  cam.transform.setRotation(0, Math.sin(half), 0, Math.cos(half));
  cam.updateCameraMatrices();
  return {
    viewProjectionMatrix: cam.viewProjectionMatrix,
    near: cam.near,
    far: cam.far
  };
};

const casterAt = (p: readonly [number, number, number], halfExtent = 0.5): RenderItem => ({
  geometry: { bounds: { min: [-halfExtent, -halfExtent, -halfExtent], max: [halfExtent, halfExtent, halfExtent] } },
  modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, p[0], p[1], p[2], 1]),
  label: "caster"
} as never);

const fit = (x = 0, yawRadians = 0, casters: readonly RenderItem[] = []) =>
  fitDirectionalCascades({
    camera: cameraAt(x, yawRadians),
    lightDirection: [...LIGHT_DIR],
    casters,
    mapSize: MAP_SIZE,
    cascadeCount: 3
  });

/** Column-major mat4 × vec3 with perspective divide. */
const transformPoint = (m: Float32Array, p: readonly [number, number, number]) => {
  const [x, y, z] = p;
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  return [
    (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w,
    (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w,
    (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) / w
  ];
};

describe("PRD-02 §6.4 cascade fitter (prd02-17 invariants)", () => {
  it("10° camera yaw leaves each cascade radius unchanged within 1e-5 relative", () => {
    const yaw = (10 * Math.PI) / 180;
    const a = fit(0, 0);
    const b = fit(0, yaw);
    for (let i = 0; i < a.length; i += 1) {
      const rel = Math.abs(b[i]!.radius - a[i]!.radius) / a[i]!.radius;
      expect(rel).toBeLessThanOrEqual(1e-5);
    }
  });

  it("0.3-texel camera translation moves the snapped origin by 0 or 1 texel", () => {
    const a = fit(0);
    const b = fit(a[0]!.texelWorld * 0.3);
    for (let i = 0; i < a.length; i += 1) {
      const dx = (b[i]!.center[0] - a[i]!.center[0]) / a[i]!.texelWorld;
      const dy = (b[i]!.center[1] - a[i]!.center[1]) / a[i]!.texelWorld;
      expect(Math.abs(dx - Math.round(dx))).toBeLessThan(1e-6);
      expect(Math.abs(dy - Math.round(dy))).toBeLessThan(1e-6);
      expect(Math.abs(Math.round(dx))).toBeLessThanOrEqual(1);
      expect(Math.abs(Math.round(dy))).toBeLessThanOrEqual(1);
    }
  });

  it("a caster 50 m behind the camera along the light stays inside the depth range", () => {
    // Light travels straight down; "behind the camera along the light" = on the
    // opposite side of the camera from light travel → 50 m above it.
    const behind: [number, number, number] = [0, 4 + 50, 10];
    const fits = fit(0, 0, [casterAt(behind)]);
    for (const cascade of fits) {
      const uvz = transformPoint(cascade.viewProjection, behind);
      expect(uvz[0]).toBeGreaterThanOrEqual(0);
      expect(uvz[0]).toBeLessThanOrEqual(1);
      expect(uvz[1]).toBeGreaterThanOrEqual(0);
      expect(uvz[1]).toBeLessThanOrEqual(1);
      expect(uvz[2]).toBeGreaterThanOrEqual(0);
      expect(uvz[2]).toBeLessThanOrEqual(1);
      expect(cascade.casterCount).toBe(1);
    }
  });
});
