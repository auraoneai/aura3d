import type { Game } from "@aura3d/game";
import type { PatrolCtx } from "./state";
import type { wirePatrolCombat } from "./combat";
import { game as engineGame } from "@aura3d/engine";

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;

export function wirePatrolSync(ctx: PatrolCtx, deps: {
  game: Game;
  handle: (name: string) => NodeHandle;
  reducedMotion: boolean;
  collisionWorld: ReturnType<typeof engineGame.collisionWorld>;
}) {
  const { game, handle, reducedMotion, collisionWorld } = deps;
// ------------------------------------------------------------- per-ctx.frame ----

function syncPlaneVisual(): void {
  const euler = ctx.flight.euler;
  const p = ctx.flight.position;
  const plane = handle("plane");
  plane?.setPosition(p[0], p[1], p[2]).setRotation(euler.x, euler.y, euler.z);
  const forward = ctx.flight.forward;
  const right = ctx.flight.right;
  const up = ctx.flight.up;
  const airborne = ctx.flight.grounded === "airborne";
  // Wingtip contrails + engine glow follow body axes (local offsets), only
  // while airborne at speed.
  for (const [id, side] of [["contrail-left", -1.9], ["contrail-right", 1.9]] as const) {
    const h = handle(id);
    if (!h) continue;
    const visible = airborne && ctx.flight.speed > 9 && !reducedMotion;
    h.setPosition(
      p[0] + right[0] * side - forward[0] * 1.4 + up[0] * 0.1,
      p[1] + right[1] * side - forward[1] * 1.4 + up[1] * 0.1,
      p[2] + right[2] * side - forward[2] * 1.4 + up[2] * 0.1
    )
      .setRotation(euler.x, euler.y, euler.z)
      .setVisible(visible);
  }
  const glow = handle("engine-glow");
  if (glow) {
    glow.setPosition(
      p[0] - forward[0] * 2.1 + up[0] * 0.15,
      p[1] - forward[1] * 2.1 + up[1] * 0.15,
      p[2] - forward[2] * 2.1 + up[2] * 0.15
    ).setVisible(airborne && ctx.flight.throttle > 0.55);
  }
}

function syncGhostVisual(): void {
  const h = handle("ghost-plane");
  if (!h) return;
  if (!ctx.ghostPlayer?.playing) {
    h.setVisible(false);
    return;
  }
  const g = ctx.ghostPlayer.flight;
  const e = g.euler;
  h.setPosition(g.position[0], g.position[1], g.position[2])
    .setRotation(e.x, e.y, e.z)
    .setVisible(true);
}

function syncDroneVisuals(): void {
  const positions = new Map(ctx.swarm.liveDrones().map((drone) => [drone.id, drone.position]));
  for (const [id, slot] of ctx.droneSlotById) {
    const h = handle(`drone-${slot}`);
    const wake = handle(`drone-wake-${slot}`);
    const pos = positions.get(id);
    if (!pos || !h) {
      h?.setVisible(false);
      wake?.setVisible(false);
      continue;
    }
    // Face the drone toward the player (pursuit read).
    const dx = ctx.flight.position[0] - pos[0];
    const dz = ctx.flight.position[2] - pos[2];
    const yaw = Math.atan2(dx, dz);
    h.setPosition(pos[0], pos[1], pos[2]).setRotation(0, yaw, 0).setVisible(true);
    if (wake) {
      const horizontal = Math.max(0.01, Math.hypot(dx, dz));
      const dy = ctx.flight.position[1] - pos[1];
      wake.setPosition(
        pos[0] + (dx / horizontal) * 0.9,
        pos[1] + dy * 0.1,
        pos[2] + (dz / horizontal) * 0.9
      )
        .setRotation(-Math.atan2(dy, horizontal), yaw, 0)
        .setVisible(ctx.stateValue === "patrol");
    }
  }
  // Lead-drone lock ring on the nearest live drone.
  const lock = handle("lead-drone-lock");
  if (lock) {
    const lead = ctx.swarm.liveDrones()[0];
    if (lead && ctx.stateValue === "patrol") {
      lock.setPosition(lead.position[0], lead.position[1] + 1.0, lead.position[2])
        .setRotation(0, ctx.flight.euler.y, 0)
        .setVisible(true);
    } else {
      lock.setVisible(false);
    }
  }
}

function syncOrbVisuals(): void {
  ctx.orbs.forEach((orb, index) => {
    const h = handle(`orb-${index}`);
    const trail = handle(`orb-trail-${index}`);
    if (!h) return;
    if (orb.active) {
      const p = collisionWorld.require(orb.bodyId).position;
      h.setPosition(p[0], p[1], p[2]).setVisible(true);
      const [dx, dy, dz] = orb.direction;
      const horizontal = Math.max(0.01, Math.hypot(dx, dz));
      trail?.setPosition(p[0] - dx * 0.42, p[1] - dy * 0.42, p[2] - dz * 0.42)
        .setRotation(-Math.atan2(dy, horizontal), Math.atan2(dx, dz), 0)
        .setVisible(true);
    } else {
      h.setVisible(false);
      trail?.setVisible(false);
    }
  });
}

  return { syncPlaneVisual, syncGhostVisual, syncDroneVisuals, syncOrbVisuals };
}
