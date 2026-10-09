// Visual node sync — extracted from boot.ts for 14-LOC.
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import type { gravityWorldNodes } from "./scene/world";
import { FLYBY_DRONES, SPARK_COUNT, TRAIL_STREAKS } from "./scene/world";
import { PLAY_PLANE_Y, type StationWorld } from "../gameplay/stations";
import type { currentContract } from "./state";
import { flybyBody } from "../gameplay/flyby";
import type { wireGravityFx } from "./scene/fx";
import type { GravityCtx } from "./state";

type NodeHandle = AuraRuntimeNodeHandle | undefined;

export function wireGravitySync(ctx: GravityCtx, deps: {
  handle(name: string): NodeHandle;
  world: ReturnType<typeof gravityWorldNodes>;
  fx: ReturnType<typeof wireGravityFx>;
  rigState: { podX: number; podZ: number; inFlight: boolean };
  reducedMotion: boolean;
  contract(): ReturnType<typeof currentContract>;
  destinationStation(): StationWorld;
  stationWorld(id: string): { readonly x: number; readonly z: number } | StationWorld;
}) {
  const { handle, world, fx, rigState, reducedMotion, contract, destinationStation, stationWorld } = deps;
  function syncPodVisual(): void {
    const podNode = handle("mail-ctx.pod");
    const speed = Math.hypot(ctx.pod.kinematic.velocity[0], ctx.pod.kinematic.velocity[1]);
    const yaw = speed > 1e-4 ? Math.atan2(ctx.pod.kinematic.velocity[0], ctx.pod.kinematic.velocity[1]) : 0;
    podNode?.setPosition(ctx.pod.kinematic.position[0], PLAY_PLANE_Y + 0.06, ctx.pod.kinematic.position[1]);
    if (speed > 1e-4) podNode?.setRotation(0, yaw, 0);
    podNode?.setVisible(ctx.pod.state !== "lost");
    // Thrust cone while a correction burns or launch just fired.
    const cone = handle("ctx.pod-thrust-cone");
    const burning = ctx.pod.state === "coasting" && ctx.pod.correctionsUsed > 0 && ctx.pod.correctionTokensRemaining === 0 && speed > 0;
    if (cone) {
      cone.setVisible(burning);
      if (burning) {
        cone.setPosition(
          ctx.pod.kinematic.position[0] - ctx.pod.kinematic.velocity[0] * 0.14,
          PLAY_PLANE_Y + 0.06,
          ctx.pod.kinematic.position[1] - ctx.pod.kinematic.velocity[1] * 0.14
        ).setRotation(Math.PI / 2, 0, yaw);
      }
    }
    // Trail streaks trail the flown velocity while coasting.
    for (let index = 0; index < TRAIL_STREAKS; index += 1) {
      const streak = handle("mail-ctx.pod-trail-" + index);
      if (!streak) continue;
      const active = ctx.pod.state === "coasting" && speed > 0.05 && ctx.actualPath.length > index + 1;
      streak.setVisible(active);
      if (active) {
        const back = ctx.actualPath[ctx.actualPath.length - 1 - index]!;
        streak.setPosition(back[0], PLAY_PLANE_Y + 0.03, back[1]).setRotation(0, yaw, 0);
      }
    }
  }
  
  function syncStationPulses(): void {
    const destination = destinationStation();
    for (const station of ctx.stations) {
      const pulse = handle(station.pulseNodeId);
      if (!pulse) continue;
      const distance = Math.hypot(ctx.pod.kinematic.position[0] - station.x, ctx.pod.kinematic.position[1] - station.z);
      const isOpen = station.id === destination.id && ctx.pod.state === "coasting"
        && distance < station.dockRadius * 3.2
        && Math.hypot(ctx.pod.kinematic.velocity[0], ctx.pod.kinematic.velocity[1]) < contract().captureLimit * 1.2;
      const breathe = isOpen ? 1.25 + Math.sin(ctx.frame * 0.35) * 0.22 : 1;
      const scale = station.dockRadius * 2.8 * breathe;
      pulse.setScale([scale, scale, 0.014]);
    }
  }
  
  function syncSparks(dt: number): void {
    if (ctx.sparkLife > 0) ctx.sparkLife = Math.max(0, ctx.sparkLife - dt);
    const core = stationWorld(contract().destinationStationId);
    for (let index = 0; index < SPARK_COUNT; index += 1) {
      const node = handle("dock-spark-" + index);
      if (!node) continue;
      if (ctx.sparkLife <= 0) {
        node.setPosition(0, -4, 0).setVisible(false);
        continue;
      }
      const travel = (0.7 - ctx.sparkLife) * 1.4;
      const dir = ctx.sparkDirections[index]!;
      node.setPosition(
        core.x + dir[0] * travel,
        PLAY_PLANE_Y + 0.05 + ctx.sparkLife * 0.3,
        core.z + dir[1] * travel
      ).setVisible(true);
    }
  }
  
  function syncFlybyDrones(progress: number | null): void {
    const body = flybyBody(ctx.flyby.bodyId);
    for (let index = 0; index < FLYBY_DRONES; index += 1) {
      const node = handle("ctx.flyby-drone-" + index);
      if (!node) continue;
      if (progress === null || !body) {
        node.setPosition(0, -4, 0).setVisible(false);
        continue;
      }
      node.setVisible(true);
      const angle = (index / FLYBY_DRONES) * Math.PI * 2 + progress * 2.4;
      const radius = body.visualRadius + 0.32 - progress * 0.12;
      const yLift = reducedMotion ? 0 : Math.sin(progress * Math.PI) * 0.22;
      node.setPosition(
        body.position[0] + Math.cos(angle) * radius,
        PLAY_PLANE_Y + yLift,
        body.position[1] + Math.sin(angle) * radius
      );
    }
  }

  return { syncPodVisual, syncStationPulses, syncSparks, syncFlybyDrones };
}
