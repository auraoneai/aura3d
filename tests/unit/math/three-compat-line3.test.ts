import { describe, expect, it } from "vitest";
import { Line3 } from "../../../packages/math/src/Line3";
import { Vector3 as ImmutableVector3 } from "../../../packages/math/src/Vector3";
import { Plane, Vector3 } from "../../../packages/math/src/three";

// Review finding: the Plane golden fixture uses a plain { start, end, delta } object, so nothing exercised a compat
// Plane against the real @aura3d/math Line3 that the `Line3` codemod row points migrated projects at.
// The immutable Line3.delta() takes no target and returns a new vector, and its endpoints are immutable vectors,
// so the call crosses the type boundary through a cast. These tests pin what actually happens at runtime.
type PlaneLine = Parameters<Plane["intersectLine"]>[0];
const asPlaneLine = (line: Line3): PlaneLine => line as unknown as PlaneLine;

describe("@aura3d/math/three Plane with the real @aura3d/math Line3", () => {
  const plane = new Plane().setFromNormalAndCoplanarPoint(new Vector3(0, 1, 0), new Vector3(0, 2, 0));

  it("intersectLine accepts the immutable Line3 and fills the target", () => {
    const line = new Line3(new ImmutableVector3(0, 0, 0), new ImmutableVector3(0, 5, 0));
    const target = new Vector3();
    const hit = plane.intersectLine(asPlaneLine(line), target);
    expect(hit).toBe(target);
    expect([target.x, target.y, target.z]).toEqual([0, 2, 0]);
  });

  it("returns null on a miss, and intersectsLine agrees with the immutable Line3", () => {
    const miss = new Line3(new ImmutableVector3(0, 3, 0), new ImmutableVector3(0, 5, 0));
    expect(plane.intersectLine(asPlaneLine(miss), new Vector3())).toBeNull();
    expect(plane.intersectsLine(asPlaneLine(miss))).toBe(false);
    const cross = new Line3(new ImmutableVector3(0, 0, 0), new ImmutableVector3(0, 5, 0));
    expect(plane.intersectsLine(asPlaneLine(cross))).toBe(true);
  });

  it("matches the plain-object line the golden fixture uses", () => {
    const a = new Vector3(1, -1, 4);
    const b = new Vector3(2, 6, -3);
    const plain: PlaneLine = { start: a, end: b, delta: (t: Vector3) => t.subVectors(b, a) };
    const real = new Line3(new ImmutableVector3(1, -1, 4), new ImmutableVector3(2, 6, -3));
    const t1 = new Vector3();
    const t2 = new Vector3();
    plane.intersectLine(plain, t1);
    plane.intersectLine(asPlaneLine(real), t2);
    expect(t2.toArray()).toEqual(t1.toArray());
  });
});
