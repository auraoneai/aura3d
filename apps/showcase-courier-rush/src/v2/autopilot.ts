// apps/showcase-courier-rush/src/v2/autopilot.ts — diagnostic autopilot port.
// Projects the van onto the authored pickup/drop leg polyline and pursues a
// look-ahead carrot at capped speed — same VanDriveInput contract as keyboard
// play. Evidence marks autopilot=true; nothing here reads as human play.
import type { DispatchState } from "../gameplay/dispatch";
import { currentDelivery } from "../gameplay/dispatch";
import type { VanDriveInput } from "../gameplay/van";
import { COURIER_ROUTES, ZONE_SITES, type GridPoint, type PropCollider, type ZoneSite } from "../legacy/city";

export interface AutopilotOptions {
  readonly colliderRadius: number;
  readonly colliders: () => readonly PropCollider[];
}

function activeTargetSite(state: DispatchState): ZoneSite | null {
  const plan = currentDelivery(state);
  if (!plan) return null;
  return state.phase === "awaitingPickup" ? plan.pickup : plan.drop;
}

export interface CourierAutopilot {
  drive(vanX: number, vanZ: number, heading: number, speed: number, dispatch: DispatchState): VanDriveInput;
  readonly aim: { x: number; z: number; left: number };
}

export function createCourierAutopilot(options: AutopilotOptions): CourierAutopilot {
  let activeLeg: readonly GridPoint[] = [];
  let activeLegKey = "";
  let legProgressIndex = 0;
  const aim = { x: 0, z: 0, left: 0 };

  function projectOntoLeg(vanX: number, vanZ: number): void {
    let guard = 0;
    while (activeLeg && legProgressIndex < activeLeg.length - 1 && guard < 64) {
      guard += 1;
      const a = activeLeg[legProgressIndex]!;
      const b = activeLeg[legProgressIndex + 1]!;
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const lengthSq = abx * abx + abz * abz;
      if (lengthSq === 0) {
        legProgressIndex += 1;
        continue;
      }
      const t = ((vanX - a.x) * abx + (vanZ - a.z) * abz) / lengthSq;
      if (t > 1) {
        legProgressIndex += 1;
        continue;
      }
      break;
    }
  }

  return {
    get aim() { return aim; },
    drive(vanX, vanZ, heading, speed, dispatch) {
      const target = activeTargetSite(dispatch);
      if (!target) return { throttle: 0, brake: 1, steer: 0, handbrake: false };

      const jobIndex = Math.min(dispatch.deliveryIndex, COURIER_ROUTES.length - 1);
      const key = jobIndex + ":" + (dispatch.phase === "carrying" ? "d" : "p");
      if (key !== activeLegKey || !activeLeg) {
        activeLegKey = key;
        const legs = COURIER_ROUTES[jobIndex]!;
        activeLeg = dispatch.phase === "carrying" ? legs.dropLeg : legs.pickupLeg;
        legProgressIndex = 0;
      }
      projectOntoLeg(vanX, vanZ);

      const LOOKAHEAD = 5.2;
      let remaining = LOOKAHEAD;
      let aimX = target.x;
      let aimZ = target.z;
      let index = legProgressIndex;
      let anchorX = activeLeg[index]!.x;
      let anchorZ = activeLeg[index]!.z;
      {
        const a = activeLeg[index]!;
        const b = (activeLeg[index + 1] ?? a)!;
        const abx = b.x - a.x;
        const abz = b.z - a.z;
        const lengthSq = abx * abx + abz * abz;
        const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((vanX - a.x) * abx + (vanZ - a.z) * abz) / lengthSq));
        anchorX = a.x + abx * t;
        anchorZ = a.z + abz * t;
        const segLeft = Math.hypot(b.x - anchorX, b.z - anchorZ);
        if (segLeft >= remaining || index >= activeLeg.length - 1) {
          const denom = Math.max(0.001, segLeft);
          aimX = anchorX + ((b.x - anchorX) / denom) * remaining;
          aimZ = anchorZ + ((b.z - anchorZ) / denom) * remaining;
        } else {
          remaining -= segLeft;
          index += 1;
          while (index < activeLeg.length) {
            const node = activeLeg[index]!;
            const d = Math.hypot(node.x - anchorX, node.z - anchorZ);
            if (d >= remaining || index === activeLeg.length - 1) {
              const denom = Math.max(0.001, d);
              aimX = anchorX + ((node.x - anchorX) / denom) * remaining;
              aimZ = anchorZ + ((node.z - anchorZ) / denom) * remaining;
              break;
            }
            remaining -= d;
            anchorX = node.x;
            anchorZ = node.z;
            index += 1;
          }
        }
      }
      aim.x = Math.round(aimX * 1000) / 1000;
      aim.z = Math.round(aimZ * 1000) / 1000;
      aim.left = activeLeg.length - legProgressIndex;

      const dx = aimX - vanX;
      const dz = aimZ - vanZ;
      const bearingToAim = Math.atan2(dz, dx);
      let delta = bearingToAim - heading;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      let steer = Math.max(-1, Math.min(1, delta * 1.15));

      const fx = Math.cos(heading);
      const fz = Math.sin(heading);
      let avoid = 0;
      let blockedAhead = false;
      for (const collider of options.colliders()) {
        const ox = collider.x - vanX;
        const oz = collider.z - vanZ;
        const dist = Math.hypot(ox, oz);
        const reach = collider.radius + options.colliderRadius + 1.15;
        if (dist > reach || dist < 1e-3) continue;
        const aheadDot = (ox * fx + oz * fz) / dist;
        if (aheadDot < 0.25) continue;
        const side = ox * -fz + oz * fx;
        avoid += (side >= 0 ? -1 : 1) * (1 - dist / reach) * (0.55 + 0.45 * aheadDot);
        if (aheadDot > 0.8 && dist < collider.radius + options.colliderRadius + 0.25) blockedAhead = true;
      }
      steer = Math.max(-1, Math.min(1, steer + avoid * 0.9));

      let vertexTurnSharpness = 0;
      {
        const a = activeLeg[legProgressIndex]!;
        const b = activeLeg[legProgressIndex + 1] ?? a;
        const c = activeLeg[legProgressIndex + 2] ?? b;
        if (c !== b) {
          const abx = b.x - a.x;
          const abz = b.z - a.z;
          const bcx = c.x - b.x;
          const bcz = c.z - b.z;
          const cross = Math.abs(abx * bcz - abz * bcx);
          const denom = Math.hypot(abx, abz) * Math.hypot(bcx, bcz);
          if (denom > 0.001) vertexTurnSharpness = Math.max(0, Math.min(1, cross / denom));
        }
      }
      const finalDistance = Math.hypot(target.x - vanX, target.z - vanZ);
      const cornerBrake = vertexTurnSharpness > 0.35 && Math.abs(delta) < 0.6 && speed > 5.4 ? 0.75 : 0;
      const approachBrake = finalDistance < 3.4 && speed > 3 ? 0.8 : blockedAhead ? 0.6 : cornerBrake;
      const throttle = blockedAhead
        ? 0
        : Math.abs(delta) > 0.95
          ? 0.3
          : finalDistance < 2.8 ? 0.14 : vertexTurnSharpness > 0.35 && speed > 7.6 ? 0 : 0.52;
      return { throttle, brake: approachBrake, steer, handbrake: false };
    }
  };
}
