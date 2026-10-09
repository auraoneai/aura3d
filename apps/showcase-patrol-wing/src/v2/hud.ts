import type { Game } from "@aura3d/game";
import { PATROL_COUNT, WAVES_PER_PATROL } from "../gameplay/patrol";
import { RING_COUNT, terrainSurface } from "../legacy/sky";
import type { PatrolCtx } from "./state";

let lastHudKey = "";

export function wirePatrolHud(ctx: PatrolCtx, deps: {
  game: Game;
  objectiveComplete: () => boolean;
}) {
  const { game } = deps;
// ---------------------------------------------------------------- HUD -------

let lastHudKey = "";
function syncHud(): void {
  let mission: string;
  if (ctx.stateValue === "preflight") mission = "THROTTLE UP / TAKE OFF";
  else if (ctx.stateValue === "graded") mission = `PATROL GRADED ${ctx.lastGrade ?? ""} — NEXT SOON`;
  else if (ctx.stateValue === "campaign-complete") mission = "ALL PATROLS FLOWN — R TO RESTART";
  else if (!ctx.rings.complete) mission = `RING ${ctx.rings.nextRing + 1} OF ${RING_COUNT}${ctx.rings.validity ? "" : " — SKIPPED, REFLY"}`;
  else if (!deps.objectiveComplete()) mission = "CLEAR THE DRONE WAVES";
  else mission = "RETURN TO PAD — LAND GENTLE";
  const hud = {
    mission,
    patrol: `${Math.min(ctx.patrolValue, PATROL_COUNT)} OF ${PATROL_COUNT} · ${ctx.lastGrade ?? ctx.bestRun?.grade ?? "—"}`,
    hull: `${Math.max(0, Math.round(ctx.hullValue))}%`,
    rings: `${ctx.rings.passedCount} / ${RING_COUNT} · ${ctx.timeInPatrol.toFixed(1)}s`,
    speed: `${ctx.flight.speed.toFixed(1)} kt · ALT ${(ctx.flight.position[1] - terrainSurface(ctx.flight.position[0], ctx.flight.position[2])).toFixed(1)}m`,
    wave: ctx.currentWave < 0 ? "STANDBY" : `WAVE ${ctx.currentWave + 1}/${WAVES_PER_PATROL} · ${ctx.swarm.liveCount} LIVE`
  };
  const key = JSON.stringify(hud);
  if (key === lastHudKey) return;
  lastHudKey = key;
  game.hud.set("mission", hud.mission);
  game.hud.set("patrol", hud.patrol);
  game.hud.set("hull", hud.hull);
  game.hud.set("rings", hud.rings);
  game.hud.set("speed", hud.speed);
  game.hud.set("wave", hud.wave);
}

  return { syncHud };
}
