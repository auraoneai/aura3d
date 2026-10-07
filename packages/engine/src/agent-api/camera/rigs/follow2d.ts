/**
 * `rigs.follow2d` (PRD-08 §6.4, §7.1 R-3): side-scroll camera with a
 * screen-space dead zone (default 0.18 × 0.22 of the frame), a springed
 * forward lead in the facing direction (default 1.2 u), and platform snap on Y
 * — the camera only re-targets its rest height when the subject leaves the dead
 * zone or comes to rest on a new platform level.
 */
import type { AuraVec3 } from "../../index.js";
import type { AuraCameraRig } from "../../../contracts/camera.js";
import { springDamp } from "../Spring.js";

export interface Follow2dRigOptions {
  readonly target: string;
  /** Normalized dead zone half-extents of the frame (default 0.18 × 0.22). */
  readonly deadZone?: { readonly x: number; readonly y: number };
  /** Forward lead distance in the facing direction (default 1.2). */
  readonly lead?: number;
  /** Only retarget Y on rest/exit — the "platform snap" (default true). */
  readonly platformSnap?: boolean;
  readonly distance?: number;
  readonly fov?: number;
  readonly framing?: { readonly subjectHeightFraction: number };
  readonly leadHalflife?: number;
}

export function createFollow2dRig(o: Follow2dRigOptions): AuraCameraRig {
  const deadZone = o.deadZone ?? { x: 0.18, y: 0.22 };
  const lead = o.lead ?? 1.2;
  const platformSnap = o.platformSnap ?? true;
  const distance = o.distance ?? 10;
  const fov = o.fov ?? 50;
  const leadHalflife = o.leadHalflife ?? 0.2;

  // Camera looks along +Z at the subject plane; eye = centre + [0,0,+d].
  let centreX = Number.NaN;
  let centreY = Number.NaN;
  let leadX = 0;
  // dwell clock for "landed" detection (y velocity ~0 for a stretch).
  let restTime = 0;

  return {
    id: "follow2d",
    reset(pose) {
      centreX = centreY = Number.NaN;
      leadX = 0;
      restTime = 0;
      if (pose) {
        centreX = pose.target[0];
        centreY = pose.target[1];
      }
    },
    update(ctx) {
      const subject = ctx.subject(o.target);
      if (!subject) return ctx.previous;
      const p = subject.position;
      const facing = subject.forward[0] < -1e-4 ? -1 : 1;
      const prev = ctx.previous;

      if (Number.isNaN(centreX)) {
        centreX = p[0] + facing * lead;
        centreY = p[1];
        leadX = facing * lead;
      }

      // World-size dead zone at the subject depth: half-extents = tan(fov/2)·d.
      const halfH = Math.tan(((fov / 2) * Math.PI) / 180) * distance;
      const halfW = halfH * ctx.aspect;
      const dzX = deadZone.x * halfW;
      const dzY = deadZone.y * halfH;

      leadX = springDamp(leadX, facing * lead, leadHalflife, ctx.dt);

      // X: track when the subject exits the horizontal dead zone.
      const dx = p[0] + leadX - centreX;
      if (dx > dzX) centreX = p[0] + leadX - dzX;
      else if (dx < -dzX) centreX = p[0] + leadX + dzX;

      // Y: platform snap — retarget only when leaving the dead zone or at rest.
      const vy = Math.abs(subject.velocity[1]);
      const dy = p[1] - centreY;
      restTime = vy < 0.1 ? restTime + ctx.dt : 0;
      const landed = platformSnap && vy < 0.1 && restTime > 0.1 && Math.abs(dy) > 1e-3;
      if (dy > dzY) centreY = p[1] - dzY;
      else if (dy < -dzY) centreY = p[1] + dzY;
      else if (landed) centreY = springDamp(centreY, p[1], 0.08, ctx.dt);

      return {
        ...prev,
        position: [centreX, centreY, p[2] + distance],
        target: [centreX, centreY, p[2]],
        up: [0, 1, 0],
        roll: 0,
        fov,
        near: Math.max(0.05, distance - 2 * halfW),
        far: ctx.previous.far
      };
    }
  };
}
