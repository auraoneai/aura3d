import { describe, expect, test } from "vitest";
import {
  computeCameraClearance,
  type AuraCameraClearanceObstacle,
  type AuraCameraClearanceResult
} from "../../../packages/engine/src/public/index.js";

const target = [0, 1, 0] as const;
// 6 m straight behind (+Z) and 2 m up
const desired = [0, 3, 6] as const;
const len = Math.hypot(0, 2, 6);

const dist = (p: readonly number[]): number => Math.hypot(p[0]! - target[0], p[1]! - target[1], p[2]! - target[2]);
const onLine = (r: AuraCameraClearanceResult): void => {
  for (let k = 0; k < 3; k++) expect(r.position[k]).toBeCloseTo(target[k]! + (desired[k]! - target[k]!) * r.fraction, 9);
};

describe("computeCameraClearance", () => {
  test("no obstacles leaves the camera unchanged", () => {
    const r = computeCameraClearance(target, desired, []);
    expect(r).toEqual({ position: [0, 3, 6], fraction: 1, distance: len, mode: "clear", clamped: false, occluder: -1 });
  });

  test("obstacles beside, in front of, or under the line are ignored", () => {
    const obstacles: AuraCameraClearanceObstacle[] = [
      { shape: "circle", x: 3, z: 3, radius: 0.5 },
      { shape: "circle", x: 0, z: -3, radius: 1 },
      { shape: "box", x: 0, z: 3, halfX: 1, halfZ: 0.5, maxY: 0.5 },
      { shape: "box", x: 0, z: 3, halfX: 1, halfZ: 0.5, minY: 5, maxY: 9 }
    ];
    const r = computeCameraClearance(target, desired, obstacles);
    expect(r.mode).toBe("clear");
    expect(r.position).toEqual([0, 3, 6]);
  });

  test("an obstacle that contains the target is ignored", () => {
    const r = computeCameraClearance(target, desired, [{ shape: "circle", x: 0, z: 0.3, radius: 1 }]);
    expect(r.mode).toBe("clear");
  });

  test("a circle occluder pulls the camera in along the line of sight", () => {
    const obstacles: AuraCameraClearanceObstacle[] = [{ shape: "circle", x: 0, z: 4, radius: 0.5, baseY: 0, height: 4 }];
    const r = computeCameraClearance(target, desired, obstacles, { padding: 0.2 });
    expect(r.mode).toBe("pull-in");
    expect(r.clamped).toBe(true);
    expect(r.occluder).toBe(0);
    // front face at z = 4 - 0.5 - 0.2 = 3.3 -> fraction 3.3 / 6
    expect(r.fraction).toBeCloseTo(3.3 / 6, 9);
    expect(r.position[2]).toBeCloseTo(3.3, 9);
    expect(r.distance).toBeCloseTo(len * (3.3 / 6), 9);
    onLine(r);
  });

  test("backoff keeps the camera that many metres in front of the blocker", () => {
    const obstacles: AuraCameraClearanceObstacle[] = [{ shape: "circle", x: 0, z: 4, radius: 0.5 }];
    const r = computeCameraClearance(target, desired, obstacles, { padding: 0, backoff: 0.5 });
    expect(r.fraction).toBeCloseTo(3.5 / 6 - 0.5 / len, 9);
    onLine(r);
  });

  test("an axis-aligned box occluder pulls the camera in", () => {
    const obstacles: AuraCameraClearanceObstacle[] = [{ shape: "box", x: 0, z: 4.5, halfX: 2, halfZ: 0.5, minY: 0, maxY: 5 }];
    const r = computeCameraClearance(target, desired, obstacles, { padding: 0 });
    expect(r.mode).toBe("pull-in");
    expect(r.fraction).toBeCloseTo(4 / 6, 9);
    onLine(r);
  });

  test("a yaw-rotated box uses the node rotation convention", () => {
    // A thin wall 4 m wide along local X, rotated 90 deg about +Y: its long side now runs along world Z.
    const wall: AuraCameraClearanceObstacle = { shape: "box", x: 0, z: 4, halfX: 2, halfZ: 0.1, yaw: Math.PI / 2 };
    const r = computeCameraClearance(target, desired, [wall], { padding: 0 });
    expect(r.mode).toBe("pull-in");
    expect(r.fraction).toBeCloseTo(2 / 6, 9);
    // Unrotated, the same wall is crossed at its thin side.
    const flat = computeCameraClearance(target, desired, [{ ...wall, yaw: 0 }], { padding: 0 });
    expect(flat.fraction).toBeCloseTo(3.9 / 6, 9);
  });

  test("the nearest of several blockers wins", () => {
    const obstacles: AuraCameraClearanceObstacle[] = [
      { shape: "box", x: 0, z: 5, halfX: 1, halfZ: 0.2 },
      { shape: "circle", x: 0, z: 3, radius: 0.3 }
    ];
    const r = computeCameraClearance(target, desired, obstacles, { padding: 0 });
    expect(r.occluder).toBe(1);
    expect(r.fraction).toBeCloseTo(2.7 / 6, 9);
  });

  test("min distance stops the pull-in short", () => {
    const obstacles: AuraCameraClearanceObstacle[] = [{ shape: "circle", x: 0, z: 1.5, radius: 0.5 }];
    const free = computeCameraClearance(target, desired, obstacles, { padding: 0 });
    expect(free.distance).toBeLessThan(3);
    const r = computeCameraClearance(target, desired, obstacles, { padding: 0, minDistance: 3 });
    expect(r.mode).toBe("pull-in");
    expect(r.distance).toBeCloseTo(3, 9);
    expect(r.fraction).toBeCloseTo(3 / len, 9);
    onLine(r);
    // a desired camera already inside min distance is left alone
    const near = computeCameraClearance(target, desired, obstacles, { padding: 0, minDistance: 10 });
    expect(near.mode).toBe("clear");
    expect(near.position).toEqual([0, 3, 6]);
    expect(near.occluder).toBe(0);
  });

  test("a camera boxed in behind the target rises at min distance", () => {
    // A wall just behind the target: no room to pull in above minDistance.
    const obstacles: AuraCameraClearanceObstacle[] = [{ shape: "box", x: 0, z: 1, halfX: 4, halfZ: 0.3, minY: 0, maxY: 3.5 }];
    const r = computeCameraClearance(target, desired, obstacles, { padding: 0, minDistance: 4, allowVerticalRise: true, riseMinHorizontal: 1 });
    expect(r.mode).toBe("rise");
    expect(r.clamped).toBe(true);
    expect(r.distance).toBeCloseTo(4, 9);
    expect(dist(r.position)).toBeCloseTo(4, 9);
    // keeps the view direction horizontally and at least riseMinHorizontal of offset
    expect(r.position[0]).toBeCloseTo(0, 12);
    expect(r.position[2]).toBeCloseTo(1, 9);
    expect(r.position[1]).toBeCloseTo(target[1] + Math.sqrt(15), 9);
    expect(r.position[1]).toBeGreaterThan(3.5);
  });

  test("maxFraction places an eased boom with the same pull-in / rise rules", () => {
    const pull = computeCameraClearance(target, desired, [], { maxFraction: 0.75, minDistance: 2, allowVerticalRise: true });
    expect(pull.mode).toBe("pull-in");
    expect(pull.fraction).toBe(0.75);
    onLine(pull);
    const rise = computeCameraClearance(target, desired, [], { maxFraction: 0.1, minDistance: 2, allowVerticalRise: true });
    expect(rise.mode).toBe("rise");
    expect(rise.fraction).toBe(0.1);
    expect(rise.distance).toBeCloseTo(2, 9);
  });

  test("degenerate segment returns the desired position", () => {
    const r = computeCameraClearance(target, target, [{ shape: "circle", x: 0, z: 0, radius: 1 }]);
    expect(r.mode).toBe("clear");
    expect(r.position).toEqual([0, 1, 0]);
  });

  test("is deterministic and reuses out without allocating a new result", () => {
    const obstacles: AuraCameraClearanceObstacle[] = [
      { shape: "box", x: 0.3, z: 3.2, halfX: 1.4, halfZ: 0.6, yaw: 0.37, baseY: 0, height: 4 },
      { shape: "circle", x: -0.2, z: 2.4, radius: 0.35, maxY: 6 }
    ];
    const opts = { padding: 0.16, backoff: 0.2, minDistance: 1.5, allowVerticalRise: true };
    const first = computeCameraClearance(target, desired, obstacles, opts);
    const out: AuraCameraClearanceResult = { position: [9, 9, 9], fraction: 0, distance: 0, mode: "rise", clamped: true, occluder: 7 };
    const position = out.position;
    for (let i = 0; i < 100; i++) {
      const r = computeCameraClearance(target, desired, obstacles, opts, out);
      expect(r).toBe(out);
      expect(r.position).toBe(position);
      expect(r).toEqual(first);
    }
  });
});
