// Wave flow — extracted from boot.ts for 14-LOC. Intermission/wave/reset/door
// and risk-pickup logic, verbatim behavior.
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import { waveSpawnSchedule, waveSpec, INTERMISSION_SECONDS } from "../gameplay/waves";
import { riskPickupForWave, PICKUP_DOORS } from "../gameplay/pickups";
import { upgradedPlayer } from "../gameplay/run";
import type { PlayerState, PlayerUpgrades } from "../gameplay/player";
import type { createSwarmSimulation } from "../gameplay/swarm";
import type { createCombatFeel } from "../legacy/combat-feel";
import type { SwarmCue } from "../legacy/swarm-audio";
import type { wireSwarmFx } from "./scene/fx";
import { INTERMISSION_FIRST_SECONDS, type SwarmRunCtx } from "./state";

export function wireSwarmFlow(ctx: SwarmRunCtx, deps: {
  handle(name: string): AuraRuntimeNodeHandle | null;
  pushCue(cue: SwarmCue): void;
  fx: ReturnType<typeof wireSwarmFx>;
  player: PlayerState;
  upgrades: PlayerUpgrades;
  swarm: ReturnType<typeof createSwarmSimulation>;
  combatFeel: ReturnType<typeof createCombatFeel>;
}) {
  const { handle, pushCue, fx, player, upgrades, swarm, combatFeel } = deps;

  function beginIntermission(seconds: number): void {
    ctx.runState = "intermission";
    ctx.pickupActive = false;
    handle("swarm-pickup")?.setVisible(false);
    ctx.intermissionRemaining = seconds;
    ctx.chosenDoor = null;
    if (ctx.wave > 0) {
      pushCue("wave-clear");
      fx.waveCleared();
    }
  }

  function startWave(next: number): void {
    ctx.wave = next;
    const spec = waveSpec(ctx.wave);
    ctx.schedule = waveSpawnSchedule(spec, ctx.seed);
    ctx.spawnedCount = 0;
    ctx.waveElapsed = 0;
    ctx.killsThisWave = 0;
    ctx.runState = "wave-active";
    ctx.pickupPosition = riskPickupForWave(ctx.wave);
    ctx.pickupActive = true;
    handle("swarm-pickup")?.setPosition(ctx.pickupPosition.x, 1.1, ctx.pickupPosition.z).setVisible(true);
    ctx.chosenDoor = null;
    pushCue("wave-start");
    fx.waveStarted();
  }

  function resetRun(newSeed?: number): void {
    if (typeof newSeed === "number") ctx.seed = newSeed >>> 0;
    player.hp = player.maxHp;
    player.x = 0;
    player.z = 3;
    player.vx = 0;
    player.vz = 0;
    player.dashRemaining = 0;
    player.dashCooldownRemaining = 0;
    player.invulnerableRemaining = 0;
    upgrades.fireRateMultiplier = 1;
    upgrades.dashCooldownMultiplier = 1;
    upgrades.shieldCharges = 0;
    swarm.reset();
    combatFeel.reset();
    ctx.score = 0;
    ctx.kills = 0;
    ctx.killsThisWave = 0;
    ctx.combo = 0;
    ctx.maxCombo = 0;
    ctx.comboDecayRemaining = 0;
    ctx.wave = 0;
    ctx.burstCharge = 0;
    ctx.pickupActive = false;
    ctx.pickupPosition = riskPickupForWave(1);
    ctx.burstFxRemaining = 0;
    ctx.pulseFxRemaining = 0;
    for (const id of [
      "neon-burst-event-ring", "neon-pulse-shot-ray", "neon-pulse-impact-ring",
      "neon-courier-pulse-muzzle-flash", "swarm-pickup"
    ]) handle(id)?.setVisible(false);
    for (let index = 0; index < 8; index += 1) handle(`neon-burst-spoke-${index}`)?.setVisible(false);
    for (let index = 0; index < 6; index += 1) handle(`neon-pulse-impact-shard-${index}`)?.setVisible(false);
    for (const door of PICKUP_DOORS) handle(`pickup-gate-${door.kind}`)?.setVisible(false);
    beginIntermission(INTERMISSION_FIRST_SECONDS);
  }

  function chooseDoor(kind: string): void {
    if (ctx.runState !== "intermission" || ctx.wave <= 0 || ctx.chosenDoor) return;
    const door = PICKUP_DOORS.find((entry) => entry.kind === kind);
    if (!door) return;
    ctx.chosenDoor = kind;
    const next = upgradedPlayer(upgrades, door.kind);
    upgrades.fireRateMultiplier = next.fireRateMultiplier;
    upgrades.dashCooldownMultiplier = next.dashCooldownMultiplier;
    upgrades.shieldCharges = next.shieldCharges;
    pushCue("pickup");
    fx.pickupTaken([door.x, 0.6, door.z]);
  }

  function collectRiskPickup(): void {
    if (!ctx.pickupActive || ctx.runState !== "wave-active") return;
    ctx.pickupActive = false;
    ctx.score += 250;
    ctx.burstCharge = Math.min(100, ctx.burstCharge + 25);
    handle("swarm-pickup")?.setVisible(false);
    combatFeel.spawnSparks({ x: ctx.pickupPosition.x, z: ctx.pickupPosition.z, count: 14, strength: 0.8 });
    fx.pickupTaken([ctx.pickupPosition.x, 0.55, ctx.pickupPosition.z]);
    pushCue("pickup");
  }

  return { beginIntermission, startWave, resetRun, chooseDoor, collectRiskPickup };
}
