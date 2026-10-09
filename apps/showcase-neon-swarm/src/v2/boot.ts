// apps/showcase-neon-swarm/src/v2/boot.ts — T2.1–T2.6 v2 shell.
// §6.9.8 "neon plaza at night overrun by a swarm": typed arena + courier mech,
// two live instanced drone pools (360 grunt / 96 elite), seeded five-ctx.wave
// campaign with intermission upgrade doors, pulse overlap fire, radial burst.
// Gameplay modules (arena/swarm/waves/player/pickups/run) are unchanged;
// audio plays through the legacy cue controller until C-25 lands (R-14-10).
import { game as engineGame, scene } from "@aura3d/engine";
import { createGame, type Game, lookManifest } from "@aura3d/game";
import { createArenaLayout, playRect, spawnPointOnEdge } from "../gameplay/arena";
import { createSwarmSimulation } from "../gameplay/swarm";
import {
  INTERMISSION_SECONDS, waveSpawnSchedule, waveSpec, type SpawnEvent
} from "../gameplay/waves";
import {
  DEFAULT_PLAYER_TUNING, PLAYER_RADIUS, applyContactDamage, createPlayerState,
  createPlayerUpgrades, stepPlayer, type PlayerState, type PlayerUpgrades
} from "../gameplay/player";
import {
  PICKUP_DOORS, riskPickupForWave, sensePickupDoors, senseRiskPickup,
  type RiskPickup
} from "../gameplay/pickups";
import {
  FINALE_SURVIVAL_SECONDS, MAX_CAMPAIGN_WAVES, arenaInsetForWave,
  campaignStage, stateAfterWaveClear, upgradedPlayer
} from "../gameplay/run";
import { createCombatFeel } from "../legacy/combat-feel";
import { createSwarmAudio, type SwarmCue } from "../legacy/swarm-audio";
import direction from "../../art/direction";
import { swarmWorldNodes } from "./scene/world";
import { lightingNodes } from "./scene/lighting";
import { createSwarmRig, fallbackCameraNode } from "./scene/camera";
import { wireSwarmFx } from "./scene/fx";
import { publishSwarmEvidence } from "./evidence";
import { applySwarmScenario } from "./scenarios";
import { createSwarmRunCtx, INTERMISSION_FIRST_SECONDS } from "./state";
import { createSwarmAudioBlock } from "./audio";
import { createSwarmInput } from "./input";
import { wireSwarmSticks } from "./sticks";
import { wireSwarmFlow } from "./flow";
import { wireSwarmCombat } from "./combat";
import { createSwarmHud } from "./hud";
import { createSwarmWorld, createSwarmHandle } from "./nodes";
import { publishSwarmEvidenceBlock } from "./evidence-block";
import { buildSwarmScene } from "./scene-build";
import { applyNeonScenario } from "./scenario";

const ROUTE_FLAG = "A3D_QR_ROUTE_NEON_SWARM" as const;


const target = document.getElementById("app") ?? document.body;

// ---------------------------------------------------------------- sim state --

const arenaLayout = createArenaLayout();
const rect = playRect(arenaLayout.bounds);
const swarm = createSwarmSimulation();
const combatFeel = createCombatFeel({ reducedMotion: false, reducedFlash: false });
const player: PlayerState = createPlayerState(6);
const upgrades: PlayerUpgrades = createPlayerUpgrades();

const ctx = createSwarmRunCtx();
const bootedAtMs = performance.now();

// ------------------------------------------------------------------ world ----

const world = createSwarmWorld({ swarm, combatFeel });
const buildScene = () => buildSwarmScene(world);

// ----------------------------------------------------------------- audio -----

const audioBlock = createSwarmAudioBlock();
const { audio, audioCueLog, pushCue, unlockAudio } = audioBlock;

// ------------------------------------------------------------------ game -----

const game = createGame({
  id: "showcase-neon-swarm",
  target,
  layout: "full-bleed",
  scene: buildScene,
  hud: {
    theme: "arcade-neon",
    maxScreenFraction: 0.15,
    widgets: [
      { id: "wave", kind: "label", anchor: "top", label: "WAVE" },
      { id: "score", kind: "score", anchor: "top-left", label: "SCORE" },
      { id: "combo", kind: "label", anchor: "top-right", label: "COMBO" },
      { id: "hp", kind: "label", anchor: "bottom-left", label: "HP" },
      { id: "burst", kind: "label", anchor: "bottom-right", label: "BURST" }
    ]
  },
  touch: {
    preset: "twin-stick",
    bindings: { move: "move-stick", aimFire: "fire-stick", dash: "dash-btn", burst: "burst-btn", pause: "menu" }
  },
  sound: {
    cues: {
      "pulse-fire": { asset: "neonPulseFireSfx" },
      "drone-hit": { asset: "neonDroneHitSfx" },
      "drone-die": { asset: "neonDroneDieSfx" },
      "player-hurt": { asset: "neonPlayerHurtSfx" },
      "dash": { asset: "neonDashSfx" },
      "pickup": { asset: "neonPickupSfx" },
      "wave-start": { asset: "neonWaveStartSfx" },
      "wave-clear": { asset: "neonWaveClearSfx" },
      "death-sting": { asset: "neonDeathStingSfx" },
      "burst": { asset: "neonBurstSfx" },
      "graze": { asset: "neonGrazeSfx" },
      "combo-break": { asset: "neonComboBreakSfx" },
      "ambient": { asset: "neonAmbientHumSfx" }
    }
  },
  juice: {
    "burst": { hitStopMs: 50, trauma: 0.2 },
    "player-death": { hitStopMs: 90, trauma: 0.28 },
    "wave-clear": { hitStopMs: 40, trauma: 0.12 }
  },
  qualityRebuild: {
    // FLAG-1: arm the engine features this route uses — `game` selects the
    // real C-24 impl (beacon/evidence/HUD/touch); the rest cover the
    // art/direction.ts sections. `route_neon_swarm` uses the engine-parseable
    // underscore form (URL/dispatch form is `route-neon-swarm`).
    flags: ["route_neon_swarm", "game", "camera", "lighting", "post", "materials", "vfx", "world", "tiers", "looks"]
  }
});

const fx = wireSwarmFx(game);

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;
const handle = createSwarmHandle(game);

// ------------------------------------------------------------- input ---------

const input = createSwarmInput();

window.addEventListener("keydown", (e) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
}, { passive: false });

// Mouse aim: unproject the pointer through the top-down offset length.
const sticks = wireSwarmSticks(ctx, { target, unlockAudio, player, upgrades, game, firePulse: () => firePulse() });

const flow = wireSwarmFlow(ctx, { handle, pushCue, fx, player, upgrades, swarm, combatFeel });
const { beginIntermission, startWave, resetRun, chooseDoor, collectRiskPickup } = flow;

const combat = wireSwarmCombat(ctx, { handle, pushCue, fx, player, upgrades, swarm, combatFeel, game });
const { resolveAim, handleDroneKilled, firePulse, fireBurst, killPlayer, completeRun } = combat;

// ------------------------------------------------------------- frame loop ----

const syncHud = createSwarmHud(ctx, { game, player });

const rigState = { player: { x: player.x, z: player.z }, aim: { x: 0, z: -1 } };

game.app.onFrame?.(({ dt: rawDt }) => {
  const stepSeconds = Math.min(0.05, Math.max(1 / 240, game.session.scaledDt(rawDt) || 1 / 60));
  ctx.frame += 1;
  input.update(stepSeconds);
  if (game.session.paused || stepSeconds <= 0) return;

  if (input.pressed("pause") && ctx.runState !== "dead" && ctx.runState !== "complete") {
    game.session.paused ? game.session.resume() : game.session.pause("user");
  }
  if (input.pressed("reset")) {
    ctx.seed = (ctx.seed * 1664525 + 1013904223) >>> 0;
    resetRun(ctx.seed);
  }
  if (input.pressed("burst")) fireBurst();

  if (ctx.burstFxRemaining > 0) {
    ctx.burstFxRemaining = Math.max(0, ctx.burstFxRemaining - stepSeconds);
    const progress = 1 - ctx.burstFxRemaining / 0.55;
    const scale = 0.45 + progress * 0.95;
    handle("neon-burst-event-ring")
      ?.setPosition(ctx.burstFxOrigin.x, 0.02, ctx.burstFxOrigin.z)
      .setScale([scale, scale, scale]);
    const spokeScale = 0.55 + progress * 0.95;
    for (let index = 0; index < 8; index += 1) {
      handle(`neon-burst-spoke-${index}`)
        ?.setPosition(ctx.burstFxOrigin.x, 0.03, ctx.burstFxOrigin.z)
        .setScale([0.9, 0.9, spokeScale]);
    }
    if (ctx.burstFxRemaining <= 0) {
      handle("neon-burst-event-ring")?.setVisible(false);
      for (let index = 0; index < 8; index += 1) handle(`neon-burst-spoke-${index}`)?.setVisible(false);
      handle("neon-player-burst-radius")?.setVisible(true);
      handle("neon-player-aim-vector")?.setVisible(true);
    }
  }
  if (ctx.pulseFxRemaining > 0) {
    ctx.pulseFxRemaining = Math.max(0, ctx.pulseFxRemaining - stepSeconds);
    if (ctx.pulseFxRemaining <= 0) {
      handle("neon-pulse-shot-ray")?.setVisible(false);
      handle("neon-pulse-impact-ring")?.setVisible(false);
      handle("neon-courier-pulse-muzzle-flash")?.setVisible(false);
      for (let index = 0; index < 6; index += 1) handle(`neon-pulse-impact-shard-${index}`)?.setVisible(false);
    }
  }

  const axisX = Math.max(-1, Math.min(1, input.axis("moveX") + sticks.moveX));
  const axisZ = Math.max(-1, Math.min(1, input.axis("moveZ") + sticks.moveZ));
  if (axisX !== 0 || axisZ !== 0) ctx.lastMoveDir = { x: axisX, z: axisZ };

  const inset = arenaInsetForWave(Math.max(1, ctx.wave));
  const runRect = {
    minX: rect.minX + inset,
    maxX: rect.maxX - inset,
    minZ: rect.minZ + inset,
    maxZ: rect.maxZ - inset
  };
  const runWidth = runRect.maxX - runRect.minX;
  const runDepth = runRect.maxZ - runRect.minZ;
  const runMidX = (runRect.minX + runRect.maxX) / 2;
  const runMidZ = (runRect.minZ + runRect.maxZ) / 2;
  handle("arena-pressure-north")?.setPosition(runMidX, 0.08, runRect.minZ).setScale([runWidth, 1, 0.16]).setVisible(true);
  handle("arena-pressure-south")?.setPosition(runMidX, 0.08, runRect.maxZ).setScale([runWidth, 1, 0.16]).setVisible(true);
  handle("arena-pressure-east")?.setPosition(runRect.maxX, 0.08, runMidZ).setScale([0.16, 1, runDepth]).setVisible(true);
  handle("arena-pressure-west")?.setPosition(runRect.minX, 0.08, runMidZ).setScale([0.16, 1, runDepth]).setVisible(true);

  if (ctx.comboDecayRemaining > 0 && ctx.runState !== "dead" && ctx.runState !== "complete") {
    ctx.comboDecayRemaining -= stepSeconds;
    if (ctx.comboDecayRemaining <= 0 && ctx.combo > 0) {
      ctx.combo = 0;
      pushCue("combo-break");
    }
  }

  const stepResult = stepPlayer(player, DEFAULT_PLAYER_TUNING, upgrades, {
    moveX: axisX,
    moveZ: axisZ,
    aimX: resolveAim().x,
    aimZ: resolveAim().z,
    firePressed: false,
    dashPressed: input.pressed("dash")
  }, stepSeconds, runRect);
  if (stepResult.dashed) {
    pushCue("dash");
    fx.dashed([player.x, 0.5, player.z]);
  }

  // Courier node + accents + carbine follow the real state.
  const aim = resolveAim();
  const playerYaw = Math.atan2(aim.x, aim.z);
  const forwardX = Math.sin(playerYaw);
  const forwardZ = Math.cos(playerYaw);
  const rightX = Math.cos(playerYaw);
  const rightZ = -Math.sin(playerYaw);
  const bob = Math.sin(ctx.frame * stepSeconds * 9) * 0.04;
  const hurtScale = player.hurtFlashRemaining > 0 ? 1.16 : 1;
  handle("neon-player")
    ?.setPosition(player.x, 0.06 + bob, player.z)
    .setRotation(0, playerYaw, 0)
    .setScale([hurtScale * 0.6, hurtScale, hurtScale * 0.82]);
  handle("neon-courier-visor-accent")
    ?.setPosition(player.x + forwardX * 0.34, 2.22 + bob, player.z + forwardZ * 0.34)
    .setRotation(0, playerYaw, 0)
    .setVisible(true);
  handle("neon-courier-chest-core")
    ?.setPosition(player.x + forwardX * 0.34, 1.18 + bob, player.z + forwardZ * 0.34)
    .setRotation(0, playerYaw, 0)
    .setVisible(true);
  handle("neon-courier-shoulder-ctx.frame")
    ?.setPosition(player.x + forwardX * 0.34, 1.48 + bob, player.z + forwardZ * 0.34)
    .setRotation(Math.PI / 2, playerYaw, 0)
    .setVisible(true);
  handle("neon-courier-pulse-emitter")
    ?.setPosition(player.x + forwardX * 0.22, 0.84 + bob, player.z + forwardZ * 0.22)
    .setRotation(0, playerYaw, 0)
    .setVisible(true);
  handle("neon-courier-pulse-carbine")
    ?.setPosition(player.x + forwardX * 0.52 + rightX * 0.24, 1.54 + bob, player.z + forwardZ * 0.52 + rightZ * 0.24)
    .setRotation(0, playerYaw, 0)
    .setVisible(true);
  handle("neon-courier-pulse-carbine-core")
    ?.setPosition(player.x + forwardX * 0.76 + rightX * 0.24, 1.54 + bob, player.z + forwardZ * 0.76 + rightZ * 0.24)
    .setRotation(0, playerYaw, 0)
    .setVisible(true);
  handle("neon-courier-pulse-muzzle-ring")
    ?.setPosition(player.x + forwardX * 1.02 + rightX * 0.24, 1.54 + bob, player.z + forwardZ * 1.02 + rightZ * 0.24)
    .setRotation(0, playerYaw, 0)
    .setVisible(true);
  handle("neon-player-burst-radius")?.setPosition(player.x, 0.12, player.z).setVisible(true);
  handle("neon-courier-core-ring")
    ?.setPosition(player.x + forwardX * 0.34, 0.26, player.z + forwardZ * 0.34)
    .setVisible(true);
  handle("neon-player-aim-vector")
    ?.setPosition(player.x + aim.x * 1.35, 0.22, player.z + aim.z * 1.35)
    .setRotation(0, Math.atan2(aim.x, aim.z), 0)
    .setVisible(true);

  rigState.player = { x: player.x, z: player.z };
  rigState.aim = { x: aim.x, z: aim.z };

  if (ctx.runState === "intermission") {
    ctx.intermissionRemaining -= stepSeconds;
    for (const door of PICKUP_DOORS) {
      handle(`pickup-gate-${door.kind}`)?.setVisible(ctx.wave > 0);
    }
    const sensed = sensePickupDoors(player);
    if (sensed.door && !ctx.chosenDoor) chooseDoor(sensed.door.kind);
    if (ctx.intermissionRemaining <= 0) startWave(ctx.wave + 1);
  } else {
    for (const door of PICKUP_DOORS) {
      handle(`pickup-gate-${door.kind}`)?.setVisible(false);
    }
  }

  if (ctx.runState === "wave-active") {
    ctx.waveElapsed += stepSeconds;
    while (ctx.spawnedCount < ctx.schedule.length && ctx.schedule[ctx.spawnedCount]!.atSeconds <= ctx.waveElapsed) {
      const event = ctx.schedule[ctx.spawnedCount]!;
      const point = spawnPointOnEdge(event.edge, event.t);
      swarm.spawn({ x: point.x, z: point.z, archetype: event.archetype, speedMultiplier: waveSpec(ctx.wave).speedMultiplier });
      ctx.spawnedCount += 1;
    }

    if ((input.pressed("fire") || sticks.aimFire) && player.fireCooldownRemaining <= 0) {
      firePulse();
      player.fireCooldownRemaining = DEFAULT_PLAYER_TUNING.fireCooldownSeconds * upgrades.fireRateMultiplier;
    }

    swarm.step(stepSeconds, player, arenaLayout.obstacles, undefined, inset);
    combatFeel.stepSparks(stepSeconds);

    if (ctx.pickupActive && senseRiskPickup(player, ctx.pickupPosition)) collectRiskPickup();

    const grazeCount = swarm.countWithin(player, PLAYER_RADIUS + 0.55, 2.35);
    if (grazeCount > 0 && !swarm.contactOverlap({ x: player.x, z: player.z, radius: PLAYER_RADIUS })) {
      ctx.grazeAccumulator += stepSeconds;
      if (ctx.grazeAccumulator >= 0.5) {
        ctx.grazeAccumulator -= 0.5;
        ctx.score += 15;
        ctx.burstCharge = Math.min(100, ctx.burstCharge + Math.min(8, 2 + grazeCount));
        pushCue("graze");
      }
    } else {
      ctx.grazeAccumulator = 0;
    }

    if (swarm.contactOverlap({ x: player.x, z: player.z, radius: PLAYER_RADIUS })) {
      const dealt = applyContactDamage(player, upgrades, 3.4, stepSeconds);
      if (dealt > 0) {
        pushCue("player-hurt");
        combatFeel.spawnSparks({ x: player.x, z: player.z, count: 6, strength: 0.6 });
        fx.playerHurt([player.x, 0.5, player.z]);
      }
    }

    if (player.hp <= 0) {
      killPlayer();
    } else if (
      ctx.wave === MAX_CAMPAIGN_WAVES
      && ctx.spawnedCount >= ctx.schedule.length
      && ctx.waveElapsed >= FINALE_SURVIVAL_SECONDS
    ) {
      completeRun();
    } else if (ctx.spawnedCount >= ctx.schedule.length && swarm.aliveCount() === 0) {
      if (stateAfterWaveClear(ctx.wave) === "complete") completeRun();
      else beginIntermission(waveSpec(ctx.wave).intermissionSeconds || INTERMISSION_SECONDS);
    }
  } else {
    combatFeel.stepSparks(stepSeconds);
  }

  if (ctx.frame % 6 === 0) syncHud();
});

// T2.2-post: appliedLook derives from the C-31 runtime manifest.
publishSwarmEvidenceBlock(ctx, {
  game, swarm, player, upgrades,
  audioCueLog: () => audioCueLog,
  bootedAtMs
});

applyNeonScenario(ctx, { startWave, syncHud, beginIntermission });

// ------------------------------------------------------------------- boot ----

game.start();
void game.ready().then(() => {
  game.app.camera?.use?.(createSwarmRig(rigState), { blend: 0.4 });
  game.app.setOutput?.({ preset: "neon-night", exposure: Math.pow(2, direction.lighting.exposureEV) });
  const firstFrameAt = performance.now();
  const w = window as unknown as Record<string, unknown>;
  w.__AURA3D_GAME__ = {
    route: "showcase-neon-swarm",
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get session() { return game.session; },
    get frame() { return ctx.frame; },
    firstFrameAt,
    sessionStartedAt: bootedAtMs
  };
});
