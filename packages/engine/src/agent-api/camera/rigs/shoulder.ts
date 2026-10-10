/**
 * `rigs.shoulder` (PRD-08 §6.4, §7.1 R-5): wraps `createShoulderCamera`
 * (GameCameraRigs.ts:94-153, same lane file) and adds C-10 collision. With no
 * collider the pose equals the legacy helper bit-for-bit (test: 1e-6).
 */
import type { AuraVec3 } from "../../index.js";
import type { AuraCameraRig } from "../../../contracts/camera.js";
import { createShoulderCamera } from "../../GameCameraRigs.js";
import { createCollisionDamper, type CollisionDamper } from "../collision.js";
import { distanceForFractionInContext } from "../framing.js";
import { subjectHeight } from "./rigUtils.js";

export interface ShoulderRigOptions {
  readonly target: string;
  readonly side?: "left" | "right";
  readonly distance?: number;
  readonly collision?: boolean | { readonly radius?: number };
  readonly fov?: number;
  /** When set, the back-off is solved so the subject fills this fraction of frame height (#76). */
  readonly framing?: { readonly subjectHeightFraction: number };
}

export function createShoulderRig(o: ShoulderRigOptions): AuraCameraRig {
  const fov = o.fov ?? 55;
  const inner = createShoulderCamera({
    side: o.side ?? "right",
    distance: o.distance,
    fov: o.fov
  });
  let damper: CollisionDamper | undefined;

  return {
    id: "shoulder",
    continuous: true,
    reset(pose) {
      damper?.reset();
      if (pose) inner.reset([...pose.position] as [number, number, number]);
    },
    update(ctx) {
      const subject = ctx.subject(o.target);
      if (!subject) return ctx.previous;
      // createShoulderCamera's facing convention: forward = [sin(yaw),0,-cos(yaw)].
      const facing = Math.atan2(subject.forward[0], -subject.forward[2]);
      const snap = inner.update(
        ctx.dt,
        { position: [...subject.position] as [number, number, number], facing },
        // Framing solver wins over the fixed back-off when set (#76).
        o.framing === undefined
          ? undefined
          : {
              distance: distanceForFractionInContext(subjectHeight(subject), fov, o.framing.subjectHeightFraction, { aspect: ctx.aspect })
            }
      );

      let eye = snap.position as AuraVec3;
      const look = snap.target as AuraVec3;
      if (o.collision) {
        damper ??= createCollisionDamper(
          ctx.probe,
          typeof o.collision === "object" ? o.collision : {}
        );
        eye = damper.resolve(look, eye, ctx.dt);
      }
      return {
        position: eye,
        target: look,
        up: [0, 1, 0],
        roll: 0,
        fov: snap.fov,
        near: ctx.previous.near,
        far: ctx.previous.far
      };
    }
  };
}
