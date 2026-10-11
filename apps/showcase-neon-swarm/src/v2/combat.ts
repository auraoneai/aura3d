// Combat — extracted from boot.ts for 14-LOC. Aim resolution, kill accounting,
// pulse/burst fire, death/complete transitions — verbatim.
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import type { Game } from "@aura3d/game";
import { DEFAULT_PLAYER_TUNING, type PlayerState, type PlayerUpgrades } from "../gameplay/player";
import type { createSwarmSimulation } from "../gameplay/swarm";
import type { createCombatFeel } from "../legacy/combat-feel";
import type { SwarmCue } from "../legacy/swarm-audio";
import type { wireSwarmFx } from "./scene/fx";
import { COMBO_WINDOW_SECONDS, type SwarmRunCtx } from "./state";

export function wireSwarmCombat(ctx: SwarmRunCtx, deps: {
  handle(name: string): AuraRuntimeNodeHandle | null;
  pushCue(cue: SwarmCue): void;
  fx: ReturnType<typeof wireSwarmFx>;
  player: PlayerState;
  upgrades: PlayerUpgrades;
  swarm: ReturnType<typeof createSwarmSimulation>;
  combatFeel: ReturnType<typeof createCombatFeel>;
  game: Game;
}) {
  const { handle, pushCue, fx, player, swarm, combatFeel, game } = deps;

  function resolveAim(): { x: number; z: number } {
    if (ctx.mouseAim.x !== 0 || ctx.mouseAim.z !== 0) return ctx.mouseAim;
    return ctx.lastMoveDir;
  }

  function handleDroneKilled(drone: { readonly x: number; readonly z: number }): void {
    ctx.kills += 1;
    ctx.killsThisWave += 1;
    ctx.combo += 1;
    ctx.maxCombo = Math.max(ctx.maxCombo, ctx.combo);
    ctx.comboDecayRemaining = COMBO_WINDOW_SECONDS;
    ctx.score += 100 * Math.max(1, ctx.combo);
    ctx.burstCharge = Math.min(100, ctx.burstCharge + 10);
    combatFeel.spawnSparks({ x: drone.x, z: drone.z, count: 10, strength: 1 });
    fx.droneDied([drone.x, 0.5, drone.z], false);
    pushCue("drone-die");
  }

  function firePulse(): void {
    const aim = resolveAim();
    const result = swarm.firePulse(player, aim.x, aim.z, DEFAULT_PLAYER_TUNING.pulseDamage, {
      onDroneKilled: handleDroneKilled
    });
    if (result.hits > 0) {
      combatFeel.spawnSparks({ x: player.x + aim.x * 1.4, z: player.z + aim.z * 1.4, count: 4, strength: 0.55 });
      pushCue("drone-hit");
      fx.droneHit([player.x + aim.x * 1.4, 0.4, player.z + aim.z * 1.4]);
    }
    const pulseYaw = Math.atan2(aim.x, aim.z);
    handle("neon-pulse-shot-ray")
      ?.setPosition(player.x + aim.x * 1.55, 0.34, player.z + aim.z * 1.55)
      .setRotation(0, pulseYaw, 0)
      .setVisible(true);
    handle("neon-pulse-impact-ring")
      ?.setPosition(player.x + aim.x * 3.15, 0.12, player.z + aim.z * 3.15)
      .setRotation(Math.PI / 2, 0, 0)
      .setVisible(true);
    const pulseRightX = Math.cos(pulseYaw);
    const pulseRightZ = -Math.sin(pulseYaw);
    handle("neon-courier-pulse-muzzle-flash")
      ?.setPosition(player.x + aim.x * 1.14 + pulseRightX * 0.24, 1.48, player.z + aim.z * 1.14 + pulseRightZ * 0.24)
      .setRotation(0, pulseYaw, 0)
      .setVisible(true);
    for (let index = 0; index < 6; index += 1) {
      const angle = index * Math.PI / 3 + 0.25;
      handle(`neon-pulse-impact-shard-${index}`)
        ?.setPosition(player.x + aim.x * 3.15 + Math.sin(angle) * 0.38, 0.18, player.z + aim.z * 3.15 + Math.cos(angle) * 0.38)
        .setRotation(0, -angle, index % 2 === 0 ? 0.45 : -0.45)
        .setVisible(true);
    }
    ctx.pulseFxRemaining = 0.3;
    fx.pulseFired([player.x + aim.x * 1.1, 0.7, player.z + aim.z * 1.1]);
    pushCue("pulse-fire");
  }

  function fireBurst(): void {
    if (ctx.runState !== "wave-active" || game.session.paused || ctx.burstCharge < 100) return;
    ctx.burstCharge = 0;
    ctx.burstFxRemaining = 0.55;
    ctx.burstFxOrigin = { x: player.x, z: player.z };
    handle("neon-player-burst-radius")?.setVisible(false);
    handle("neon-player-aim-vector")?.setVisible(false);
    handle("neon-burst-event-ring")
      ?.setPosition(player.x, 0.02, player.z)
      .setScale([0.25, 0.25, 0.25])
      .setVisible(true);
    for (let index = 0; index < 8; index += 1) {
      handle(`neon-burst-spoke-${index}`)
        ?.setPosition(player.x, 0.03, player.z)
        .setScale([0.85, 0.85, 0.65])
        .setVisible(true);
    }
    swarm.radialBurst(player, 4.25, 99, { onDroneKilled: handleDroneKilled });
    combatFeel.spawnSparks({ x: player.x, z: player.z, count: 24, strength: 1 });
    fx.burstFired([player.x, 0.45, player.z]);
    pushCue("burst");
  }

  function killPlayer(): void {
    ctx.runState = "dead";
    ctx.combo = 0;
    fx.playerDied([player.x, 0.5, player.z]);
    pushCue("death-sting");
  }

  function completeRun(): void {
    ctx.runState = "complete";
    ctx.combo = 0;
    pushCue("wave-clear");
  }

  return { resolveAim, handleDroneKilled, firePulse, fireBurst, killPlayer, completeRun };
}
