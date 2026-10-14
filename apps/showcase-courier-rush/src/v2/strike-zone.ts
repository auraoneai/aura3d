// Strike/zone helpers — extracted from boot.ts for 14-LOC. The factory takes
// accessors for boot-owned mutable state (dropLookbackRemaining, dispatch,
// lastVan) so evaluation order and behavior are unchanged.
import type { GameArcadeVehicle } from "@aura3d/engine";
import type { PropCollider, ZoneSite } from "../legacy/city";
import type { CourierEvent, DispatchState } from "../gameplay/dispatch";
import { currentDelivery } from "../gameplay/dispatch";
import type { createTrafficSimulation } from "../gameplay/traffic";
import type { CourierAudioCue } from "../legacy/courier-audio";
import type { wireCourierFx } from "./scene/fx";

export interface StrikeZoneDeps {
  propColliders: readonly PropCollider[];
  trafficSim: ReturnType<typeof createTrafficSimulation>;
  vanColliderRadius: number;
  vanVehicle: GameArcadeVehicle;
  spawnPose: { x: number; z: number; heading: number };
  pushCue(cue: CourierAudioCue): void;
  fx: ReturnType<typeof wireCourierFx>;
  lastVanHeading(): number;
  setDropLookback(v: number): void;
  resetDispatch(): void;
}

export function createStrikeZoneTools(deps: StrikeZoneDeps) {
  const {
    propColliders, trafficSim, vanColliderRadius, vanVehicle, spawnPose,
    pushCue, fx, lastVanHeading, setDropLookback, resetDispatch,
  } = deps;

  function collisionHits(vanX: number, vanZ: number, vanSpeed: number): PropCollider[] {
    const hits: PropCollider[] = [];
    for (const collider of [...propColliders, ...trafficSim.staticColliders()]) {
      const reach = collider.radius + vanColliderRadius;
      const dx = vanX - collider.x;
      const dz = vanZ - collider.z;
      if (dx * dx + dz * dz >= reach * reach) continue;
      // Adjacent-lane passes at matched pace are city driving, not crashes.
      if (collider.speed !== undefined && Math.abs(vanSpeed - collider.speed) < 1.35) continue;
      hits.push(collider);
    }
    return hits;
  }

  function pushOut(vanX: number, vanZ: number, collider: PropCollider): { x: number; z: number } {
    const dx = vanX - collider.x;
    const dz = vanZ - collider.z;
    const distance = Math.max(0.001, Math.hypot(dx, dz));
    const reach = collider.radius + vanColliderRadius;
    return { x: collider.x + (dx / distance) * reach, z: collider.z + (dz / distance) * reach };
  }

  function activeTargetSite(state: DispatchState): ZoneSite | null {
    const plan = currentDelivery(state);
    if (!plan) return null;
    return state.phase === "awaitingPickup" ? plan.pickup : plan.drop;
  }

  function consumeEvents(events: readonly CourierEvent[], vanX: number, vanZ: number): void {
    for (const event of events) {
      switch (event.type) {
        case "dispatch":
          pushCue("dispatch");
          break;
        case "pickup":
          pushCue("pickup");
          fx.onPickup([vanX, 0.5, vanZ]);
          break;
        case "drop":
          pushCue("drop");
          if (event.early) pushCue("early-bonus");
          fx.onDrop([vanX, 0.5, vanZ]);
          setDropLookback(0.9);
          break;
        case "strike":
          pushCue("strike");
          fx.onStrike([vanX, 0, vanZ], lastVanHeading());
          break;
        case "timerFail":
        case "strikesExhausted":
          pushCue("shift-fail");
          fx.onShiftFail();
          break;
        case "shiftClear":
          pushCue("shift-clear");
          fx.onShiftClear();
          break;
        default:
          break;
      }
    }
  }

  function fullReset(): void {
    resetDispatch();
    trafficSim.reset();
    vanVehicle.reset({ x: spawnPose.x, z: spawnPose.z, heading: spawnPose.heading, speed: 0, drift: 0 });
    setDropLookback(0);
  }

  return { collisionHits, pushOut, activeTargetSite, consumeEvents, fullReset };
}
