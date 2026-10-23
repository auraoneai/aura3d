import { describe, expect, it } from "vitest";
import {
  COURSE_LENGTH, GAPS, biomeAt, districtAt, gapAhead, gapAt, groundFrame, groundHeight, laneOffset, nearGap, pathWidth, routeFrame, smooth
} from "../../../examples/ninja-runner-port/course";
import { MeshBuilder, buildProps, buildRoute, buildSheet, buildWater, type MeshData } from "../../../examples/ninja-runner-port/meshes";
import { chakraPickups, drawFlame, modelMatrix } from "../../../examples/ninja-runner-port/world";
import { createState } from "../../../examples/ninja-runner-port/sim";

const valid = (m: MeshData): void => {
  const v = m.positions.length / 3;
  expect(v).toBeGreaterThan(0);
  expect(m.normals.length).toBe(m.positions.length);
  expect(m.tones.length).toBe(m.positions.length);
  expect(m.uvs.length / 2).toBe(v);
  expect(m.indices.length % 3).toBe(0);
  expect(Math.max(...m.indices)).toBeLessThan(v);
  expect(m.positions.every(Number.isFinite)).toBe(true);
  expect(m.normals.every(Number.isFinite)).toBe(true);
};

describe("ninja-runner-port course", () => {
  it("the route is exactly 2640 m long and its tangent is a unit vector", () => {
    expect(COURSE_LENGTH).toBe(2640);
    for (const d of [0, 100, 777, 1500, 2639]) {
      const f = routeFrame(d);
      expect(Math.hypot(f.dx, f.dz)).toBeCloseTo(1, 9);
    }
    const a = routeFrame(0), b = routeFrame(2640);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(1000);
  });

  it("the route extrapolates past both ends along the tangent", () => {
    const e = routeFrame(2650), end = routeFrame(2640), t = routeFrame(2639.99);
    expect(Math.hypot(e.x - end.x, e.z - end.z)).toBeCloseTo(10, 4);
    expect(e.dx).toBeCloseTo(t.dx, 3);
  });

  it("biomes, districts, widths, lane offsets and ground height follow the original's tables", () => {
    expect(biomeAt(50)).toBe("village");
    expect(biomeAt(700)).toBe("rooftops");
    expect(biomeAt(1300)).toBe("bridge");
    expect(biomeAt(1800)).toBe("forest");
    expect(biomeAt(2500)).toBe("water");
    expect(districtAt(10)).toBe("Hidden Leaf Village");
    expect(districtAt(2400)).toBe("Valley of the End");
    expect(pathWidth(0)).toBeCloseTo(8.6, 6);
    expect(laneOffset(0)).toBeCloseTo(2.322, 6);
    expect(laneOffset(300)).toBeLessThan(laneOffset(0));
    expect(laneOffset(2300)).toBeLessThanOrEqual(2.35);
    expect(groundHeight(0)).toBeCloseTo(2, 6);
    expect(groundHeight(600)).toBeGreaterThan(groundHeight(0));
    expect(smooth(0, 10, 5)).toBeCloseTo(0.5, 12);
    expect(smooth(0, 10, -3)).toBe(0);
    expect(smooth(0, 10, 99)).toBe(1);
  });

  it("the ten rooftop/branch gaps are findable, bounded and detected ahead of the runner", () => {
    expect(GAPS.length).toBe(10);
    expect(gapAt(596)).toEqual([594, 600]);
    expect(gapAt(500)).toBeUndefined();
    expect(gapAhead(588, 9)).toEqual([594, 600]);
    expect(gapAhead(570, 9)).toBeUndefined();
    expect(nearGap(590, 12)).toBe(true);
    expect(nearGap(300, 12)).toBe(false);
  });

  it("groundFrame places a point across the path at the route's height", () => {
    const centre = groundFrame(300, 0, 0), left = groundFrame(300, -2, 0);
    expect(Math.hypot(centre.x - left.x, centre.z - left.z)).toBeCloseTo(2, 6);
    expect(groundFrame(300, 0, 1.5).y - centre.y).toBeCloseTo(1.5, 9);
  });
});

describe("ninja-runner-port meshes", () => {
  it("MeshBuilder boxes and frustums produce finite, indexed, flat-lit geometry", () => {
    const b = new MeshBuilder();
    b.box(0, 0, 0, 2, 3, 4, 0.7, [1, 0, 0]);
    b.frustum(5, 0, 5, 1, 0.2, 3, 8, [0, 1, 0]);
    valid(b.data);
    expect(b.vertexCount).toBe(20 + 32); // 5 box faces (no underside) + 8 frustum sides
    expect(b.data.indices.length).toBe((10 + 16) * 3);
    const n = b.data.normals;
    for (let i = 0; i < n.length; i += 3) expect(Math.hypot(n[i]!, n[i + 1]!, n[i + 2]!)).toBeCloseTo(1, 5);
  });

  it("the route ribbon is a valid mesh with real holes at the gaps", () => {
    const m = buildRoute(2);
    valid(m);
    const full = (m.indices.length / 3);
    const rows = Math.ceil((COURSE_LENGTH + 24) / 2);
    const stride = 15;
    expect(full).toBeLessThan(rows * (stride - 1) * 2);
    const gapRows = GAPS.reduce((n, [a, c]) => n + Math.round((c - a) / 2), 0);
    expect(rows * (stride - 1) * 2 - full).toBeGreaterThanOrEqual(gapRows * (stride - 1) * 2 * 0.8);
  });

  it("props, water and the falls sheet are valid meshes and deterministic", () => {
    const a = buildProps(), b = buildProps();
    valid(a);
    expect(a.positions).toEqual(b.positions);
    valid(buildWater());
    const sheet = buildSheet(56, 63);
    valid(sheet);
    expect(Math.max(...sheet.positions.filter((_, i) => i % 3 === 1))).toBeCloseTo(63, 9);
  });
});

describe("ninja-runner-port world helpers", () => {
  it("modelMatrix is a column-major scaled yaw + translation", () => {
    const m = modelMatrix(1, 2, 3, Math.PI / 2, 2);
    expect(m.slice(12, 15)).toEqual([1, 2, 3]);
    expect(m[0]).toBeCloseTo(0, 12);
    expect(m[2]).toBeCloseTo(-2, 12);
    expect(m[5]).toBe(2);
    expect(m[8]).toBeCloseTo(2, 12);
  });

  it("chakra pickups cover every chakra entity with a position above the ground", () => {
    const z = createState();
    const pickups = chakraPickups(z.entities);
    expect(pickups.length).toBe(262);
    expect(new Set(pickups.map((p) => p.id)).size).toBe(262);
    const p = pickups[0]!;
    expect(p.position[1]).toBeGreaterThan(groundFrame(p.s, 0, 0).y);
  });

  it("the flame sprite draws on a canvas context (radial glow + bezier flame)", () => {
    const calls: string[] = [];
    const ctx = new Proxy({}, { get: (_t, k) => (typeof k === "string" && !["fillStyle", "strokeStyle", "lineWidth", "lineCap", "lineJoin", "shadowColor", "shadowBlur"].includes(k) ? (..._a: unknown[]) => { calls.push(k); return { addColorStop() {} }; } : undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
    drawFlame(ctx);
    for (const op of ["createRadialGradient", "fillRect", "bezierCurveTo", "fill", "stroke", "save", "restore"]) expect(calls).toContain(op);
  });
});
