/**
 * C-06 Euler -> quaternion, split out of `sceneGraph.ts` as a dependency-free leaf so world-pose publishers
 * (`app/actorAnimationHandle.ts` bone attachments, `GameSceneBridge.ts` body sync) need not import the scene graph,
 * which reaches `sceneMath.ts` and the compiler. `sceneGraph.ts` re-exports it unchanged.
 */
import type { AuraVec3 } from "./nodes/types.js";
import type { AuraEulerOrder, AuraQuat } from "../contracts/sceneGraph.js";

/** Euler -> quaternion. `order` defaults to "ZYX" (engine/three.js "ZYX" = Rz·Ry·Rx). */
export function eulerToQuaternion(euler: AuraVec3, order: AuraEulerOrder = "ZYX"): AuraQuat {
  const [x, y, z] = euler;
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  switch (order) {
    case "XYZ":
      return [
        s1 * c2 * c3 + c1 * s2 * s3,
        c1 * s2 * c3 - s1 * c2 * s3,
        c1 * c2 * s3 + s1 * s2 * c3,
        c1 * c2 * c3 - s1 * s2 * s3
      ];
    case "YXZ":
      return [
        s1 * c2 * c3 + c1 * s2 * s3,
        c1 * s2 * c3 - s1 * c2 * s3,
        c1 * c2 * s3 - s1 * s2 * c3,
        c1 * c2 * c3 + s1 * s2 * s3
      ];
    case "ZXY":
      return [
        s1 * c2 * c3 - c1 * s2 * s3,
        c1 * s2 * c3 + s1 * c2 * s3,
        c1 * c2 * s3 + s1 * s2 * c3,
        c1 * c2 * c3 - s1 * s2 * s3
      ];
    case "ZYX":
      return [
        s1 * c2 * c3 - c1 * s2 * s3,
        c1 * s2 * c3 + s1 * c2 * s3,
        c1 * c2 * s3 - s1 * s2 * c3,
        c1 * c2 * c3 + s1 * s2 * s3
      ];
    case "YZX":
      return [
        s1 * c2 * c3 + c1 * s2 * s3,
        c1 * s2 * c3 + s1 * c2 * s3,
        c1 * c2 * s3 - s1 * s2 * c3,
        c1 * c2 * c3 - s1 * s2 * s3
      ];
    case "XZY":
      return [
        s1 * c2 * c3 - c1 * s2 * s3,
        c1 * s2 * c3 - s1 * c2 * s3,
        c1 * c2 * s3 + s1 * s2 * c3,
        c1 * c2 * c3 + s1 * s2 * s3
      ];
  }
}
