import { describe, expect, it } from "vitest";
import { Matrix4, Quaternion, Vector3 } from "@galileo3d/math";
import { Matrix4Compat, QuaternionCompat, Vector3Compat } from "../../../packages/three-compat/src";

describe("Three.js math parity surface", () => {
  it("keeps Vector3-compatible mutation semantics alongside immutable G3D math", () => {
    const compat = new Vector3Compat(1, 2, 3).add(new Vector3Compat(4, 5, 6)).sub(new Vector3Compat(1, 1, 1));
    const g3d = new Vector3(1, 2, 3).add(new Vector3(4, 5, 6)).subtract(new Vector3(1, 1, 1));

    expect([compat.x, compat.y, compat.z]).toEqual(g3d.toArray());
    expect(compat.normalize().length()).toBeCloseTo(1);
  });

  it("preserves Matrix4 identity and quaternion tuple defaults used by Three.js ports", () => {
    expect(new Matrix4Compat().identity().elements).toEqual(Matrix4.identity().elements);
    expect(new QuaternionCompat()).toMatchObject({ x: 0, y: 0, z: 0, w: 1 });
    expect([Quaternion.identity.x, Quaternion.identity.y, Quaternion.identity.z, Quaternion.identity.w]).toEqual([0, 0, 0, 1]);
  });
});
