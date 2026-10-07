// apps/showcase-neon-swarm/src/v2/boot.ts — T2.1–T2.6 v2 shell.
// §6.9.8 "neon plaza at night overrun by a swarm": typed arena + courier mech,
// two live instanced drone pools (360 grunt / 96 elite), seeded five-wave
// campaign with intermission upgrade doors, pulse overlap fire, radial burst.
// Gameplay modules (arena/swarm/waves/player/pickups/run) are unchanged;
// audio plays through the legacy cue controller until C-25 lands (R-14-10).
import { game as engineGame, scene } from "@aura3d/engine";
import { createGame, type Game } from "@aura3d/game";
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

const ROUTE_FLAG = "A3D_QR_ROUTE_NEON_SWARM" as const;
const SEED_DEFAULT = 20260821;
const COMBO_WINDOW_SECONDS = 2;
const INTERMISSION_FIRST_SECONDS = 3.2;

type RunState = "booting" | "intermission" | "wave-active" | "dead" | "complete";

const target = document.getElementById("app") ?? document.body;

// ---------------------------------------------------------------- sim state --

const arenaLayout = createArenaLayout();
const rect = playRect(arenaLayout.bounds);
const swarm = createSwarmSimulation();
const combatFeel = createCombatFeel({ reducedMotion: false, reducedFlash: false });
const player: PlayerState = createPlayerState(6);
const upgrades: PlayerUpgrades = createPlayerUpgrades();

let runState: RunState = "booting";
let seed = SEED_DEFAULT;
let wave = 0;
let score = 0;
let kills = 0;
let killsThisWave = 0;
let combo = 0;
let maxCombo = 0;
let comboDecayRemaining = 0;
let burstCharge = 0;
let intermissionRemaining = 0;
let waveElapsed = 0;
let schedule: readonly SpawnEvent[] = [];
let spawnedCount = 0;
let chosenDoor: string | null = null;
let pickupActive = false;
let pickupPosition: RiskPickup = riskPickupForWave(1);
let grazeAccumulator = 0;
let burstFxRemaining = 0;
let pulseFxRemaining = 0;
let burstFxOrigin = { x: 0, z: 0 };
let frame = 0;
const bootedAtMs = performance.now();

// ------------------------------------------------------------------ world ----

const world = swarmWorldNodes(swarm, combatFeel);

function buildScene() {
  return scene()
    .background("#070a14")
    .camera(fallbackCameraNode())
    .addMany(world.nodes)
    .addMany(lightingNodes());
}

// ----------------------------------------------------------------- audio -----

const audio = createSwarmAudio();
const audioCueLog: string[] = [];
let audioUnlocked = false;
function pushCue(cue: SwarmCue): void {
  audioCueLog.push(cue);
  if (audioCueLog.length > 64) audioCueLog.shift();
  void audio.cue(cue).catch(() => undefined);
}
const unlockAudio = () => {
  if (audioUnlocked) return;
  void audio.unlock().then(() => { audioUnlocked = true; }).catch(() => undefined);
};
window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio, { passive: true });

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
  qualityRebuild: { flags: [ROUTE_FLAG] }
});

const fx = wireSwarmFx(game);

type NodeHandle = ReturnType<Game["app"]["nodes"]["get"]>;
const handles = new Map<string, NodeHandle>();
function handle(name: string): NodeHandle {
  if (!handles.has(name)) handles.set(name, game.app.nodes.get(name));
  return handles.get(name);
}

// ------------------------------------------------------------- input ---------

const input = engineGame.input({
  actions: {
    up: ["KeyW", "ArrowUp"],
    down: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    fire: ["KeyJ"],
    burst: ["Space", "KeyK"],
    dash: ["ShiftLeft", "ShiftRight"],
    pause: ["KeyP", "Escape"],
    reset: ["KeyR"]
  },
  axes: {
    moveX: { negative: "left", positive: "right" },
    moveZ: { negative: "up", positive: "down" }
  },
  bufferMs: 120
});

window.addEventListener("keydown", (e) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
}, { passive: false });

// Mouse aim: unproject the pointer through the top-down offset length.
let mouseAim = { x: 0, z: -1 };
let lastMoveDir = { x: 0, z: -1 };
target.addEventListener("pointermove", (event) => {
  const r = target.getBoundingClientRect();
  const worldPerPixel = (2 * 10.2 * Math.tan((44 * Math.PI) / 360)) / Math.max(1, r.height);
  const ndcX = (event.clientX - r.left) / Math.max(1, r.width) - 0.5;
  const ndcZ = (event.clientY - r.top) / Math.max(1, r.height) - 0.5;
  const wx = ndcX * r.width * worldPerPixel;
  const wz = ndcZ * r.height * worldPerPixel;
  const len = Math.hypot(wx, wz);
  if (len > 0.08) mouseAim = { x: wx / len, z: wz / len };
});

// Touch twin-stick: left half drag = move, right half drag = aim + auto-fire.
const sticks = {
  moveId: -1, moveCx: 0, moveCy: 0, moveX: 0, moveZ: 0,
  aimId: -1, aimCx: 0, aimCy: 0, aimX: 0, aimZ: 0, aimFire: false
};
target.addEventListener("pointerdown", (e) => {
  unlockAudio();
  const half = e.clientX < target.clientWidth / 2;
  if (half && sticks.moveId < 0) {
    sticks.moveId = e.pointerId;
    sticks.moveCx = e.clientX;
    sticks.moveCy = e.clientY;
  } else if (!half && sticks.aimId < 0) {
    sticks.aimId = e.pointerId;
    sticks.aimCx = e.clientX;
    sticks.aimCy = e.clientY;
  }
});
target.addEventListener("pointermove", (e) => {
  const dx = (e.clientX - (e.pointerId === sticks.moveId ? sticks.moveCx : sticks.aimCx)) / 56;
  const dy = (e.clientY - (e.pointerId === sticks.moveId ? sticks.moveCy : sticks.aimCy)) / 56;
  const len = Math.hypot(dx, dy);
  const k = len > 1 ? 1 / len : 1;
  if (e.pointerId === sticks.moveId) {
    sticks.moveX = dx * k;
    sticks.moveZ = dy * k;
  } else if (e.pointerId === sticks.aimId) {
    sticks.aimX = dx * k;
    sticks.aimZ = dy * k;
    sticks.aimFire = len > 0.35;
    if (len > 0.08) mouseAim = { x: (dx * k) / Math.max(0.001, len), z: (dy * k) / Math.max(0.001, len) };
  }
});
const endStick = (e: PointerEvent) => {
  if (e.pointerId === sticks.moveId) {
    sticks.moveId = -1;
    sticks.moveX = 0;
    sticks.moveZ = 0;
  }
  if (e.pointerId === sticks.aimId) {
    sticks.aimId = -1;
    sticks.aimFire = false;
  }
};
target.addEventListener("pointerup", endStick);
target.addEventListener("pointercancel", endStick);

// LMB also fires (desktop twin-stick convention).
target.addEventListener("mousedown", (e) => {
  if (e.button === 0 && runState === "wave-active" && !game.session.paused && player.fireCooldownRemaining <= 0) {
    firePulse();
    player.fireCooldownRemaining = DEFAULT_PLAYER_TUNING.fireCooldownSeconds * upgrades.fireRateMultiplier;
  }
});

// T2.6: hidden tab auto-pauses the session.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.session.pause("visibility");
  else game.session.resume();
});

// ------------------------------------------------------------ wave flow ------

function beginIntermission(seconds: number): void {
  runState = "intermission";
  pickupActive = false;
  handle("swarm-pickup")?.setVisible(false);
  intermissionRemaining = seconds;
  chosenDoor = null;
  if (wave > 0) {
    pushCue("wave-clear");
    fx.waveCleared();
  }
}

function startWave(next: number): void {
  wave = next;
  const spec = waveSpec(wave);
  schedule = waveSpawnSchedule(spec, seed);
  spawnedCount = 0;
  waveElapsed = 0;
  killsThisWave = 0;
  runState = "wave-active";
  pickupPosition = riskPickupForWave(wave);
  pickupActive = true;
  handle("swarm-pickup")?.setPosition(pickupPosition.x, 1.1, pickupPosition.z).setVisible(true);
  chosenDoor = null;
  pushCue("wave-start");
  fx.waveStarted();
}

function resetRun(newSeed?: number): void {
  if (typeof newSeed === "number") seed = newSeed >>> 0;
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
  score = 0;
  kills = 0;
  killsThisWave = 0;
  combo = 0;
  maxCombo = 0;
  comboDecayRemaining = 0;
  wave = 0;
  burstCharge = 0;
  pickupActive = false;
  pickupPosition = riskPickupForWave(1);
  burstFxRemaining = 0;
  pulseFxRemaining = 0;
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
  if (runState !== "intermission" || wave <= 0 || chosenDoor) return;
  const door = PICKUP_DOORS.find((entry) => entry.kind === kind);
  if (!door) return;
  chosenDoor = kind;
  const next = upgradedPlayer(upgrades, door.kind);
  upgrades.fireRateMultiplier = next.fireRateMultiplier;
  upgrades.dashCooldownMultiplier = next.dashCooldownMultiplier;
  upgrades.shieldCharges = next.shieldCharges;
  pushCue("pickup");
  fx.pickupTaken([door.x, 0.6, door.z]);
}

function collectRiskPickup(): void {
  if (!pickupActive || runState !== "wave-active") return;
  pickupActive = false;
  score += 250;
  burstCharge = Math.min(100, burstCharge + 25);
  handle("swarm-pickup")?.setVisible(false);
  combatFeel.spawnSparks({ x: pickupPosition.x, z: pickupPosition.z, count: 14, strength: 0.8 });
  fx.pickupTaken([pickupPosition.x, 0.55, pickupPosition.z]);
  pushCue("pickup");
}

// ---------------------------------------------------------------- combat -----

function resolveAim(): { x: number; z: number } {
  if (mouseAim.x !== 0 || mouseAim.z !== 0) return mouseAim;
  return lastMoveDir;
}

function handleDroneKilled(drone: { readonly x: number; readonly z: number }): void {
  kills += 1;
  killsThisWave += 1;
  combo += 1;
  maxCombo = Math.max(maxCombo, combo);
  comboDecayRemaining = COMBO_WINDOW_SECONDS;
  score += 100 * Math.max(1, combo);
  burstCharge = Math.min(100, burstCharge + 10);
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
  pulseFxRemaining = 0.3;
  fx.pulseFired([player.x + aim.x * 1.1, 0.7, player.z + aim.z * 1.1]);
  pushCue("pulse-fire");
}

function fireBurst(): void {
  if (runState !== "wave-active" || game.session.paused || burstCharge < 100) return;
  burstCharge = 0;
  burstFxRemaining = 0.55;
  burstFxOrigin = { x: player.x, z: player.z };
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
  runState = "dead";
  combo = 0;
  fx.playerDied([player.x, 0.5, player.z]);
  pushCue("death-sting");
}

function completeRun(): void {
  runState = "complete";
  combo = 0;
  pushCue("wave-clear");
}

// ------------------------------------------------------------- frame loop ----

let lastHudSignature = "";
let lastHudWrite = 0;
function syncHud(): void {
  const signature = `${wave}|${score}|${combo}|${player.hp}|${Math.floor(burstCharge)}|${runState}`;
  if (signature === lastHudSignature && frame - lastHudWrite < 300) return;
  lastHudSignature = signature;
  lastHudWrite = frame;
  game.hud.set("wave", runState === "intermission" ? `W${wave} CLEAR` : `W${Math.max(1, wave)} ${campaignStage(Math.max(1, wave)).toUpperCase()}`);
  game.hud.set("score", `${score}`);
  game.hud.set("combo", combo > 1 ? `x${combo}` : "");
  game.hud.set("hp", `HP ${"▮".repeat(Math.max(0, player.hp))}${"▯".repeat(Math.max(0, player.maxHp - player.hp))}`);
  game.hud.set("burst", burstCharge >= 100 ? "BURST READY (Space)" : `BURST ${Math.floor(burstCharge)}%`);
}

const rigState = { player: { x: player.x, z: player.z }, aim: { x: 0, z: -1 } };

game.app.onFrame?.(({ dt: rawDt }) => {
  const stepSeconds = Math.min(0.05, Math.max(1 / 240, game.session.scaledDt(rawDt) || 1 / 60));
  frame += 1;
  input.update(stepSeconds);
  if (game.session.paused || stepSeconds <= 0) return;

  if (input.pressed("pause") && runState !== "dead" && runState !== "complete") {
    game.session.paused ? game.session.resume() : game.session.pause("user");
  }
  if (input.pressed("reset")) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    resetRun(seed);
  }
  if (input.pressed("burst")) fireBurst();

  if (burstFxRemaining > 0) {
    burstFxRemaining = Math.max(0, burstFxRemaining - stepSeconds);
    const progress = 1 - burstFxRemaining / 0.55;
    const scale = 0.45 + progress * 0.95;
    handle("neon-burst-event-ring")
      ?.setPosition(burstFxOrigin.x, 0.02, burstFxOrigin.z)
      .setScale([scale, scale, scale]);
    const spokeScale = 0.55 + progress * 0.95;
    for (let index = 0; index < 8; index += 1) {
      handle(`neon-burst-spoke-${index}`)
        ?.setPosition(burstFxOrigin.x, 0.03, burstFxOrigin.z)
        .setScale([0.9, 0.9, spokeScale]);
    }
    if (burstFxRemaining <= 0) {
      handle("neon-burst-event-ring")?.setVisible(false);
      for (let index = 0; index < 8; index += 1) handle(`neon-burst-spoke-${index}`)?.setVisible(false);
      handle("neon-player-burst-radius")?.setVisible(true);
      handle("neon-player-aim-vector")?.setVisible(true);
    }
  }
  if (pulseFxRemaining > 0) {
    pulseFxRemaining = Math.max(0, pulseFxRemaining - stepSeconds);
    if (pulseFxRemaining <= 0) {
      handle("neon-pulse-shot-ray")?.setVisible(false);
      handle("neon-pulse-impact-ring")?.setVisible(false);
      handle("neon-courier-pulse-muzzle-flash")?.setVisible(false);
      for (let index = 0; index < 6; index += 1) handle(`neon-pulse-impact-shard-${index}`)?.setVisible(false);
    }
  }

  const axisX = Math.max(-1, Math.min(1, input.axis("moveX") + sticks.moveX));
  const axisZ = Math.max(-1, Math.min(1, input.axis("moveZ") + sticks.moveZ));
  if (axisX !== 0 || axisZ !== 0) lastMoveDir = { x: axisX, z: axisZ };

  const inset = arenaInsetForWave(Math.max(1, wave));
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

  if (comboDecayRemaining > 0 && runState !== "dead" && runState !== "complete") {
    comboDecayRemaining -= stepSeconds;
    if (comboDecayRemaining <= 0 && combo > 0) {
      combo = 0;
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
  const bob = Math.sin(frame * stepSeconds * 9) * 0.04;
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
  handle("neon-courier-shoulder-frame")
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

  if (runState === "intermission") {
    intermissionRemaining -= stepSeconds;
    for (const door of PICKUP_DOORS) {
      handle(`pickup-gate-${door.kind}`)?.setVisible(wave > 0);
    }
    const sensed = sensePickupDoors(player);
    if (sensed.door && !chosenDoor) chooseDoor(sensed.door.kind);
    if (intermissionRemaining <= 0) startWave(wave + 1);
  } else {
    for (const door of PICKUP_DOORS) {
      handle(`pickup-gate-${door.kind}`)?.setVisible(false);
    }
  }

  if (runState === "wave-active") {
    waveElapsed += stepSeconds;
    while (spawnedCount < schedule.length && schedule[spawnedCount]!.atSeconds <= waveElapsed) {
      const event = schedule[spawnedCount]!;
      const point = spawnPointOnEdge(event.edge, event.t);
      swarm.spawn({ x: point.x, z: point.z, archetype: event.archetype, speedMultiplier: waveSpec(wave).speedMultiplier });
      spawnedCount += 1;
    }

    if ((input.pressed("fire") || sticks.aimFire) && player.fireCooldownRemaining <= 0) {
      firePulse();
      player.fireCooldownRemaining = DEFAULT_PLAYER_TUNING.fireCooldownSeconds * upgrades.fireRateMultiplier;
    }

    swarm.step(stepSeconds, player, arenaLayout.obstacles, undefined, inset);
    combatFeel.stepSparks(stepSeconds);

    if (pickupActive && senseRiskPickup(player, pickupPosition)) collectRiskPickup();

    const grazeCount = swarm.countWithin(player, PLAYER_RADIUS + 0.55, 2.35);
    if (grazeCount > 0 && !swarm.contactOverlap({ x: player.x, z: player.z, radius: PLAYER_RADIUS })) {
      grazeAccumulator += stepSeconds;
      if (grazeAccumulator >= 0.5) {
        grazeAccumulator -= 0.5;
        score += 15;
        burstCharge = Math.min(100, burstCharge + Math.min(8, 2 + grazeCount));
        pushCue("graze");
      }
    } else {
      grazeAccumulator = 0;
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
      wave === MAX_CAMPAIGN_WAVES
      && spawnedCount >= schedule.length
      && waveElapsed >= FINALE_SURVIVAL_SECONDS
    ) {
      completeRun();
    } else if (spawnedCount >= schedule.length && swarm.aliveCount() === 0) {
      if (stateAfterWaveClear(wave) === "complete") completeRun();
      else beginIntermission(waveSpec(wave).intermissionSeconds || INTERMISSION_SECONDS);
    }
  } else {
    combatFeel.stepSparks(stepSeconds);
  }

  if (frame % 6 === 0) syncHud();
});

// ------------------------------------------------------------- evidence ------

const appliedLook: Record<string, unknown> = Object.freeze({
  postPreset: "neon-night",
  exposureEV: direction.lighting.exposureEV,
  hdri: direction.lighting.environment.hdri,
  rig: "neon-swarm.topdown"
});

publishSwarmEvidence({
  game,
  run: () => ({
    state: runState,
    wave,
    stage: campaignStage(Math.max(1, wave)),
    intermissionRemaining,
    score,
    combo,
    maxCombo,
    burstCharge,
    kills,
    killsThisWave,
    spawned: spawnedCount,
    scheduled: schedule.length
  }),
  swarm: () => ({ aliveGrunt: swarm.aliveGruntCount(), aliveElite: swarm.aliveEliteCount() }),
  player: () => player,
  upgrades: () => upgrades,
  appliedLook,
  frameCount: () => frame,
  bootedAtMs,
  audioCueLog: () => audioCueLog
});

const scenario = new URL(location.href).searchParams.get("scenario");
if (scenario) {
  applySwarmScenario(scenario, {
    beginWave: (w) => startWave(w),
    chargeBurst: () => { burstCharge = 100; },
    sync: () => { syncHud(); }
  });
} else {
  beginIntermission(INTERMISSION_FIRST_SECONDS);
}

// ------------------------------------------------------------------- boot ----

game.start();
void game.ready().then(() => {
  game.app.camera?.use?.(createSwarmRig(rigState), { blend: 0.4 });
  game.app.setOutput?.({ exposure: Math.pow(2, direction.lighting.exposureEV) });
  const firstFrameAt = performance.now();
  const w = window as unknown as Record<string, unknown>;
  w.__AURA3D_GAME__ = {
    route: "showcase-neon-swarm",
    get app() { return game.app; },
    get scene() { return game.app.scene; },
    get state() { return game.session.state; },
    get session() { return game.session; },
    get frame() { return frame; },
    firstFrameAt,
    sessionStartedAt: bootedAtMs
  };
});
