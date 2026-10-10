// Evidence publish — extracted from boot.ts for 14-LOC. appliedLook derives
// from the C-31 runtime manifest (T2.2-post).
import { lookManifest, type Prd09Game } from "@aura3d/game";
import direction from "../../art/direction";
import { campaignStage } from "../gameplay/run";
import type { PlayerState, PlayerUpgrades } from "../gameplay/player";
import type { createSwarmSimulation } from "../gameplay/swarm";
import { publishSwarmEvidence } from "./evidence";
import type { SwarmRunCtx } from "./state";

export function publishSwarmEvidenceBlock(ctx: SwarmRunCtx, deps: {
  game: Prd09Game<string, string>;
  swarm: ReturnType<typeof createSwarmSimulation>;
  player: PlayerState;
  upgrades: PlayerUpgrades;
  audioCueLog: () => readonly string[];
  bootedAtMs: number;
}): void {
  const { game, swarm, player, upgrades } = deps;
  const appliedLook: Record<string, unknown> = Object.freeze({
    ...lookManifest(game.lookSource()),
    postPreset: "neon-night",
    exposureEV: direction.lighting.exposureEV,
    hdri: direction.lighting.environment.hdri,
    rig: "neon-swarm.topdown"
  });
  publishSwarmEvidence({
    game,
    run: () => ({
      state: ctx.runState,
      wave: ctx.wave,
      stage: campaignStage(Math.max(1, ctx.wave)),
      intermissionRemaining: ctx.intermissionRemaining,
      score: ctx.score,
      combo: ctx.combo,
      maxCombo: ctx.maxCombo,
      burstCharge: ctx.burstCharge,
      kills: ctx.kills,
      killsThisWave: ctx.killsThisWave,
      spawned: ctx.spawnedCount,
      scheduled: ctx.schedule.length
    }),
    swarm: () => ({ aliveGrunt: swarm.aliveGruntCount(), aliveElite: swarm.aliveEliteCount() }),
    player: () => player,
    upgrades: () => upgrades,
    appliedLook,
    frameCount: () => ctx.frame,
    bootedAtMs: deps.bootedAtMs,
    audioCueLog: () => deps.audioCueLog()
  });
}
