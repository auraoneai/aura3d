/**
 * Neon Swarm route entry.
 *
 * One mounted Aura app through the createAuraApp root safe API. Systems:
 * - two native instances.* drone pools (grunt capsules, elite boxes) plus one
 *   spark pool - hundreds of simultaneous enemies in <=2 enemy draw
 *   submissions, updated per frame by mutating live transform objects;
 * - authored kinematic courier movement with dash i-frames and overlap-query
 *   pulse fire (no projectiles);
 * - seeded wave escalation with intermission pickup doors and combo scoring;
 * - DOM HUD (UI only) and a typed-audio cue set on sfx/ambient buses.
 *
 * Evidence: window.__NEON_SWARM_EVIDENCE__ (schema in README).
 */
import {
  camera,
  createAuraApp,
  distanceLod,
  effects,
  game,
  instances,
  lights,
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import { createArenaLayout, playRect, spawnPointOnEdge } from "./arena";
import { createNeonSwarmEnvironment } from "./environment";
import {
  isEliteWave,
  scheduleChecksum,
  waveSpawnSchedule,
  waveSpec,
  type SpawnEvent
} from "./waves";
import { createSwarmSimulation } from "./swarm";
import {
  DEFAULT_PLAYER_TUNING,
  PLAYER_RADIUS,
  applyContactDamage,
  createPlayerState,
  createPlayerUpgrades,
  stepPlayer,
  type PlayerState,
  type PlayerUpgrades
} from "./player";
import { PICKUP_DOORS, riskPickupForWave, sensePickupDoors, senseRiskPickup } from "./pickups";
import { createCombatFeel } from "./combat-feel";
import { createSwarmAudio, type SwarmAudioController, type SwarmAudioProof } from "./swarm-audio";
import { setupHud, type HudController } from "./hud";
import {
  FINALE_SURVIVAL_SECONDS,
  MAX_CAMPAIGN_WAVES,
  arenaInsetForWave,
  campaignStage,
  outcomeHash,
  stateAfterWaveClear,
  upgradedPlayer,
  type CampaignStage
} from "./run";
type RunState = "booting" | "intermission" | "wave-active" | "complete" | "dead";

interface NeonSwarmEvidence {
  readonly schema: "aura3d-showcase-neon-swarm/1.0";
  readonly mounted: boolean;
  readonly appId: "showcase-neon-swarm";
  readonly status: "ready";
  readonly state: RunState;
  readonly wave: number;
  readonly alive: number;
  readonly aliveGrunt: number;
  readonly aliveElite: number;
  readonly instanceCount: number;
  readonly drawCalls: number;
  readonly nativeInstancedSubmissions: number;
  readonly score: number;
  readonly combo: number;
  readonly maxCombo: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly kills: number;
  readonly seed: number;
  readonly paused: boolean;
  readonly reducedMotion: boolean;
  readonly audioCues: readonly string[];
  readonly audioCueCount: number;
  readonly waveChecksum: number;
  readonly waveChecksums: readonly number[];
  readonly stage: CampaignStage;
  readonly arenaInset: number;
  readonly finaleSurvivalRemaining: number;
  readonly outcomeHash: string | null;
  readonly upgrades: Readonly<PlayerUpgrades>;
  readonly playerPosition: { readonly x: number; readonly z: number };
  readonly burstCharge: number;
  readonly bursts: number;
  readonly grazes: number;
  readonly comboBreaks: number;
  readonly damageEvents: number;
  readonly pickupActive: boolean;
  readonly pickupPosition: { readonly x: number; readonly z: number };
  readonly pickupsCollected: number;
  readonly audio: SwarmAudioProof;
  readonly primaryAssets: readonly string[];
  readonly typedAssets: readonly {
    readonly id: string;
    readonly typedRef: string;
    readonly role: string;
  }[];
  readonly systems: Readonly<Record<string, string>>;
  readonly controls: readonly string[];
  readonly claimBoundary: string;
}

declare global {
  interface Window {
    __NEON_SWARM_EVIDENCE__?: NeonSwarmEvidence;
    __AURA3D_SHOWCASE_NEON_SWARM__?: NeonSwarmEvidence;
    __NEON_SWARM_DEBUG__?: NeonSwarmDebugHooks;
    __AURA3D_COMPOSITION_PROBE__?: {
      readonly category: "application";
      readonly subject: {
        readonly position: readonly [number, number, number];
        readonly rotation: readonly [number, number, number];
        readonly targetSize: number;
      };
      setSubjectSuppressed(suppressed: boolean): void;
      settleSubjectPose(): void;
    };
  }
}

/** Test hooks: deterministic stepping + staged states so browser specs run fast. */
interface NeonSwarmDebugHooks {
  stepFixed(frames: number): void;
  startWaveNow(): void;
  drainPlayerHp(): void;
  chooseDoor(kind: string): void;
  /** Evidence staging: fill both pools with live drones immediately. */
  spawnTestSwarm(total: number): void;
  /** Evidence staging: ring of drones within pulse reach of the courier. */
  stageKillCluster(count?: number): void;
  /** Evidence staging: begin a specific wave immediately. */
  jumpToWave(target: number): void;
  /** Evidence staging: clear the active wave through the normal transition. */
  clearActiveWave(): void;
  /** Evidence staging: satisfy the authored finale survival clock. */
  finishFinale(): void;
  /** Replay fixture reset without changing the requested seed. */
  resetWithSeed(value: number): void;
  /** Evidence staging: one orbiting elite inside the graze annulus. */
  stageGraze(): void;
  /** Evidence staging: a charged burst with nearby simulation-owned targets. */
  stageBurstCluster(count?: number): void;
  /** Evidence staging: move the real collectible onto the courier sensor. */
  stagePickupAtPlayer(): void;
  /** Evidence staging: stationary simulation-owned contact target. */
  stageContact(): void;
  /** Full renderer diagnostics dump for telemetry debugging/evidence. */
  dumpDiagnostics(): unknown;
}

const SEED_DEFAULT = 20260821;
const COMBO_WINDOW_SECONDS = 2;
const INTERMISSION_FIRST_SECONDS = 3.2;

const reducedMotion = typeof window !== "undefined"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const controls = [
  "WASD / arrows move",
  "mouse aims the courier",
  "J / left-click pulse fire",
  "Shift dash (0.25s i-frames)",
  "Space / K radial burst when charged",
  "P pause, R reset five-wave run"
] as const;

const claimBoundary =
  "Prototype label. Root-safe createAuraApp route: two native instances.* enemy pools " +
  "(<=2 enemy draw submissions) with route-local seek/separation/orbit/flee/elite steering, a finite " +
  "five-wave seeded run with a real 320-drone finale, combo scoring, and typed " +
  "courier/prop assets. Drones are explicitly abstract instanced geometry, not character models. " +
  "Steering is route-local; no Recast/crowd-sim, physics-kit, WebGPU, postprocess-parity, or " +
  "production-rendering claims.";

// ---------------------------------------------------------------------------
// Scene construction
// ---------------------------------------------------------------------------

const arenaLayout = createArenaLayout();
const rect = playRect(arenaLayout.bounds);

const swarm = createSwarmSimulation();
const combatFeel = createCombatFeel({ reducedMotion, reducedFlash: reducedMotion });

function buildLaneStrips(): Array<{ position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }> {
  const strips: Array<{ position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }> = [];
  for (let i = 0; i < 9; i += 1) {
    strips.push({ position: [-22 + i * 5.5, -0.01, -8.5], rotation: [0, 0, 0], scale: [1, 1, 1] });
    strips.push({ position: [-19.25 + i * 5.5, -0.01, 8.5], rotation: [0, 0, 0], scale: [1, 1, 1] });
  }
  // Cross streets so the asphalt reads as a city grid under the lamps.
  for (let i = 0; i < 5; i += 1) {
    strips.push({ position: [-13 + i * 6.5, -0.01, 0], rotation: [0, Math.PI / 2, 0], scale: [0.9, 1, 0.9] });
  }
  return strips;
}

const laneStripTransforms = buildLaneStrips();

const appScene = scene()
  .background("#05060d")
  .addMany(createNeonSwarmEnvironment())
  .add(primitives.box({
    name: "wet asphalt street plane",
    size: [57, 0.5, 39],
    position: [0, -0.26, 0],
    material: material.pbr({ color: "#1a2340", roughness: 0.36, metallic: 0.5 })
  }))
  .add(instances.box({
    name: "neon lane strips",
    transforms: laneStripTransforms,
    colors: laneStripTransforms.map((_, index) => (index % 2 === 0 ? "#ff4fd8" : "#35e6ff")),
    material: material.emissive({ color: "#101527", emissive: "#35e6ff" }),
    size: [3.4, 0.06, 0.16]
  }));

for (const obstacle of arenaLayout.obstacles) {
  appScene.add(
    model(assets.neonBarricadeProp, {
      name: "street barricade " + obstacle.x + ":" + obstacle.z,
      role: "primaryWorld",
      scaleMode: "fit",
      targetMaxDimension: 2.7
    })
      .position(obstacle.x, 0, obstacle.z)
      .rotate(0, obstacle.rotationY, 0)
  );
}

let lampIndex = 0;
for (const lamp of arenaLayout.lamps) {
  appScene.add(
    model(assets.neonStreetLampProp, {
      name: "street lamp " + lampIndex,
      role: "primaryWorld",
      scaleMode: "fit",
      targetMaxDimension: 4.2
    }).position(lamp.x, 0, lamp.z)
  );
  appScene.add(
    lights.point({
      position: [lamp.x, 3.6, lamp.z],
      color: lampIndex % 2 === 0 ? "#35e6ff" : "#ff4fd8",
      intensity: 16
    })
  );
  lampIndex += 1;
}

// Mid-street glow pools so the courier corridor stays readable mid-swarm.
appScene.add(lights.point({ position: [-12, 3, 0], color: "#ff4fd8", intensity: 9 }));
appScene.add(lights.point({ position: [12, 3, 0], color: "#35e6ff", intensity: 9 }));

// distanceLod relay beacon: near reads as a glowing sphere, far collapses to a
// compact box - the documented root-safe LOD helper used as set dressing.
appScene.add(
  distanceLod({
    name: "risky charge pickup",
    hysteresis: 0.5,
    levels: [
      { name: "beacon near", maxDistance: 11, primitive: "sphere", material: material.emissive({ color: "#241a33", emissive: "#ffc857" }) },
      { name: "beacon far", primitive: "box", material: material.emissive({ color: "#241a33", emissive: "#ffc857" }) }
    ],
    position: [0, 1.1, 0],
    scale: 0.62
  }).runtime(game.runtimeNode("swarm-pickup", { tags: ["pickup", "collectible", "gameplay-state"] }))
);

for (const door of PICKUP_DOORS) {
  appScene.add(
    primitives.torus({
      name: "pickup gate " + door.kind,
      material: material.emissive({ color: "#131c2e", emissive: "#ffc857" }),
      position: [door.x, 1.05, door.z],
      rotation: [Math.PI / 2, 0, 0],
      scale: [0.85, 0.85, 0.85]
    }).runtime(game.runtimeNode("pickup-gate-" + door.kind, { tags: ["pickup-sensor"] }))
  );
}

appScene.add(
  model(assets.neonCourierAvatar, {
    name: "courier avatar",
    role: "primaryCharacter",
    scaleMode: "fit",
    targetHeight: 1.65
  })
    .position(0, 0, 3)
    .runtime(game.runtimeNode("neon-player", { tags: ["primary-actor", "typed-primary-asset"] }))
);

// Renderer-owned player grammar. The typed courier remains the primary actor;
// these abstract guides make its location, aim, and pulse reach readable when
// 320 instanced enemies fill the arena. They are world geometry, not DOM FX.
appScene.add(
  primitives.torus({
    name: "courier burst radius",
    material: material.emissive({ color: "#153944", emissive: "#bffcff" }),
    position: [0, 0.12, 3],
    rotation: [Math.PI / 2, 0, 0],
    scale: [3.4, 3.4, 3.4]
  }).runtime(game.runtimeNode("neon-player-burst-radius", { tags: ["player-readability", "burst-radius"] }))
);

appScene.add(
  primitives.torus({
    name: "charged burst event ring",
    material: material.emissive({ color: "#5d3c08", emissive: "#ffc857" }),
    position: [0, 0.18, 3],
    rotation: [Math.PI / 2, 0, 0],
    scale: [0.25, 0.25, 0.25]
  }).runtime(game.runtimeNode("neon-burst-event-ring", { tags: ["actual-event-feedback", "burst"] }))
);

appScene.add(
  primitives.box({
    name: "courier aim vector",
    size: [0.13, 0.1, 2.4],
    material: material.emissive({ color: "#e9ffff", emissive: "#35e6ff" }),
    position: [0, 0.22, 1.6]
  }).runtime(game.runtimeNode("neon-player-aim-vector", { tags: ["player-readability", "aim-vector"] }))
);

for (const edge of ["north", "south", "east", "west"] as const) {
  appScene.add(
    primitives.box({
      name: "arena pressure boundary " + edge,
      size: [1, 0.08, 1],
      material: material.emissive({ color: "#4a160f", emissive: "#ff5a36" }),
      position: [0, 0.08, 0]
    }).runtime(game.runtimeNode("arena-pressure-" + edge, { tags: ["arena-boundary", "danger"] }))
  );
}

appScene.add(
  instances.capsule({
    name: "drone swarm grunt pool",
    transforms: swarm.gruntTransforms,
    colors: swarm.gruntColors,
    material: material.pbr({ color: "#3a1438", emissive: "#e847ff", roughness: 0.4, metallic: 0.2 }),
    size: [0.36, 0.58, 0.36]
  })
);

appScene.add(
  instances.box({
    name: "drone swarm elite pool",
    transforms: swarm.eliteTransforms,
    colors: swarm.eliteColors,
    material: material.pbr({ color: "#42131c", emissive: "#ff3864", roughness: 0.38, metallic: 0.24 }),
    size: [0.52, 0.52, 0.52]
  })
);

appScene.add(
  instances.sphere({
    name: "impact spark pool",
    transforms: combatFeel.sparkTransforms,
    colors: combatFeel.sparkColors,
    material: material.emissive({ color: "#201409", emissive: "#ffd166" }),
    size: 0.16
  })
);

appScene.add(effects.fog({ density: 0.02, color: "#070a14" }));
if (!reducedMotion) {
  appScene.add(effects.bloom({ intensity: 0.42, color: "#35e6ff" }));
}

appScene.camera(
  camera.follow({
    targetNode: "neon-player",
    distance: 18,
    offset: [0, 13.5, 9.5],
    fov: 46,
    smoothing: 0.14
  })
);

// ---------------------------------------------------------------------------
// App + systems
// ---------------------------------------------------------------------------

const app = createAuraApp("#app", {
  scene: appScene,
  diagnostics: { overlay: false, performancePanel: false }
});

const input = game.input({
  actions: {
    up: ["KeyW", "ArrowUp"],
    down: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    fire: ["KeyJ"],
    burst: ["Space", "KeyK"],
    dash: ["ShiftLeft", "ShiftRight"],
    pause: ["KeyP"],
    reset: ["KeyR"]
  },
  axes: {
    moveX: { negative: "left", positive: "right" },
    moveZ: { negative: "up", positive: "down" }
  },
  bufferMs: 120
});

const touchLayout = game.touchControls({
  width: typeof window !== "undefined" ? window.innerWidth : 1280,
  height: typeof window !== "undefined" ? window.innerHeight : 720,
  stick: { id: "move-stick", kind: "stick", action: "move", label: "Move", side: "left", radius: 64 },
  buttons: [{ id: "fire-stick", kind: "stick", action: "fire", label: "Aim/Fire", side: "right", radius: 72 }]
});

const hud: HudController = setupHud(
  requireHudElement(),
  PICKUP_DOORS.map((door) => ({ kind: door.kind, label: door.label, detail: door.detail })),
  (kind) => chooseDoor(kind),
  () => { burstRequested = true; unlockAudioOnce(); }
);

const audio: SwarmAudioController = createSwarmAudio();
const cameraDirector = game.cameraDirector({ baseFov: 41, distance: 19, reducedMotion });
const gameEffects = game.effects({ poolSize: 48, reducedMotion, reducedFlash: reducedMotion });

// ---------------------------------------------------------------------------
// Run state
// ---------------------------------------------------------------------------

const player: PlayerState = createPlayerState(6);
const upgrades: PlayerUpgrades = createPlayerUpgrades();

let runState: RunState = "booting";
let wave = 0;
let score = 0;
let kills = 0;
let combo = 0;
let maxCombo = 0;
let comboDecayRemaining = 0;
let seed = SEED_DEFAULT;
let paused = false;
let intermissionRemaining = 0;
let waveElapsed = 0;
let schedule: readonly SpawnEvent[] = [];
let spawnedCount = 0;
let waveChecksum = 0;
let waveChecksums: number[] = [];
let chosenDoor: string | null = null;
let lastTime = 0;
let elapsedSeconds = 0;
let mouseAim = { x: 0, z: -1 };
let lastMoveDir = { x: 0, z: -1 };
let touchMove = { x: 0, z: 0 };
let touchAimFire = false;
let burstRequested = false;
let unlockedAudio = false;
let burstCharge = 0;
let bursts = 0;
let grazes = 0;
let grazeAccumulator = 0;
let comboBreaks = 0;
let damageEvents = 0;
let pickupActive = false;
let pickupPosition = riskPickupForWave(1);
let pickupsCollected = 0;
let compositionSubjectSuppressed = false;
let burstFxRemaining = 0;
let burstFxOrigin = { x: 0, z: 3 };

const BEST_KEY = "neon-swarm-best-score";

function readBestScore(): number {
  try {
    return Number(window.localStorage.getItem(BEST_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

function writeBestScore(value: number): void {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    /* in-page persistence is best-effort */
  }
}

let bestScore = readBestScore();

function beginIntermission(seconds: number): void {
  runState = "intermission";
  pickupActive = false;
  app.nodes.get("swarm-pickup")?.setVisible(false);
  intermissionRemaining = seconds;
  chosenDoor = null;
  if (wave > 0) {
    hud.showDoors();
    audio.cue("wave-clear").catch(() => undefined);
    hud.showBanner("Wave " + wave + " clear", "Choose an upgrade door before the next wave");
  } else {
    hud.hideDoors();
  }
}

function startWave(next: number): void {
  wave = next;
  const spec = waveSpec(wave);
  schedule = waveSpawnSchedule(spec, seed);
  waveChecksum = scheduleChecksum(schedule);
  waveChecksums[wave - 1] = waveChecksum;
  waveElapsed = 0;
  spawnedCount = 0;
  runState = "wave-active";
  pickupPosition = riskPickupForWave(wave);
  pickupActive = true;
  app.nodes.get("swarm-pickup")
    ?.setPosition(pickupPosition.x, 1.1, pickupPosition.z)
    .setVisible(true);
  chosenDoor = null;
  hud.hideDoors();
  hud.hideBanner();
  audio.cue("wave-start").catch(() => undefined);
  hud.showBanner(
    wave === MAX_CAMPAIGN_WAVES
      ? "Finale - vector panic"
      : isEliteWave(wave)
        ? "Wave " + wave + " - mixed roles inbound"
        : "Wave " + wave + " - opening flow",
    spec.droneCount + " drones over " + spec.spawnWindowSeconds + "s · " + campaignStage(wave)
  );
}

function resetRun(newSeed?: number): void {
  if (typeof newSeed === "number") seed = newSeed >>> 0;
  player.hp = player.maxHp;
  player.x = 0;
  player.z = 3;
  player.vx = 0;
  player.vz = 0;
  player.contactDebt = 0;
  player.invulnerableRemaining = 0.8;
  player.dashCooldownRemaining = 0;
  player.dashRemaining = 0;
  upgrades.fireRateMultiplier = 1;
  upgrades.dashCooldownMultiplier = 1;
  upgrades.shieldCharges = 0;
  swarm.reset();
  combatFeel.reset();
  score = 0;
  kills = 0;
  combo = 0;
  maxCombo = 0;
  comboDecayRemaining = 0;
  wave = 0;
  waveChecksum = 0;
  waveChecksums = [];
  burstCharge = 0;
  bursts = 0;
  grazes = 0;
  grazeAccumulator = 0;
  comboBreaks = 0;
  damageEvents = 0;
  pickupActive = false;
  pickupPosition = riskPickupForWave(1);
  pickupsCollected = 0;
  burstFxRemaining = 0;
  app.nodes.get("neon-burst-event-ring")?.setVisible(false);
  burstRequested = false;
  paused = false;
  beginIntermission(INTERMISSION_FIRST_SECONDS);
  hud.showBanner("Neon Swarm", "Five escalating waves. Read the opening, choose upgrades, survive the 320-drone finale.");
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
  hud.markDoorChosen(kind);
  audio.cue("pickup").catch(() => undefined);
  gameEffects.spawn("ring-shockwave", [door.x, 0.6, door.z], { color: "#ffc857", intensity: 0.8, duration: 0.5, radius: 2.2 });
}

function collectRiskPickup(): void {
  if (!pickupActive || runState !== "wave-active") return;
  pickupActive = false;
  pickupsCollected += 1;
  score += 250;
  burstCharge = Math.min(100, burstCharge + 25);
  app.nodes.get("swarm-pickup")?.setVisible(false);
  gameEffects.spawn("ring-shockwave", [pickupPosition.x, 0.55, pickupPosition.z], {
    color: "#ffc857", intensity: 0.9, duration: 0.48, radius: 2.1
  });
  combatFeel.spawnSparks({ x: pickupPosition.x, z: pickupPosition.z, count: 14, strength: 0.8 });
  audio.cue("pickup").catch(() => undefined);
}

function firePulse(): void {
  const aim = resolveAim();
  const result = swarm.firePulse(player, aim.x, aim.z, DEFAULT_PLAYER_TUNING.pulseDamage, {
    onDroneKilled: handleDroneKilled
  });
  if (result.hits > 0) {
    combatFeel.spawnSparks({ x: player.x + aim.x * 1.4, z: player.z + aim.z * 1.4, count: 4, strength: 0.55 });
    audio.cue("drone-hit").catch(() => undefined);
  }
  gameEffects.spawn("shockwave", [player.x + aim.x * 2.2, 0.5, player.z + aim.z * 2.2], {
    color: "#35e6ff",
    intensity: 0.7,
    duration: 0.28,
    radius: 3.2
  });
  audio.cue("pulse-fire").catch(() => undefined);
}

function handleDroneKilled(drone: { readonly x: number; readonly z: number }): void {
  kills += 1;
  combo += 1;
  maxCombo = Math.max(maxCombo, combo);
  comboDecayRemaining = COMBO_WINDOW_SECONDS;
  score += 100 * Math.max(1, combo);
  burstCharge = Math.min(100, burstCharge + 10);
  combatFeel.spawnSparks({ x: drone.x, z: drone.z, count: 10, strength: 1 });
  audio.cue("drone-die").catch(() => undefined);
}

function fireBurst(): void {
  if (runState !== "wave-active" || paused || burstCharge < 100) return;
  burstCharge = 0;
  bursts += 1;
  burstFxRemaining = 0.55;
  burstFxOrigin = { x: player.x, z: player.z };
  app.nodes.get("neon-burst-event-ring")
    ?.setPosition(player.x, 0.18, player.z)
    .setScale([0.25, 0.25, 0.25])
    .setVisible(true);
  swarm.radialBurst(player, 4.25, 99, { onDroneKilled: handleDroneKilled });
  gameEffects.spawn("ring-shockwave", [player.x, 0.45, player.z], {
    color: "#ffc857", intensity: 1, duration: 0.55, radius: 4.25
  });
  combatFeel.spawnSparks({ x: player.x, z: player.z, count: 24, strength: 1 });
  cameraDirector.impact(1.2, 0.22);
  audio.cue("burst").catch(() => undefined);
}

function resolveAim(): { x: number; z: number } {
  if (mouseAim.x !== 0 || mouseAim.z !== 0) return mouseAim;
  return lastMoveDir;
}

function killPlayer(): void {
  runState = "dead";
  combo = 0;
  audio.cue("death-sting").catch(() => undefined);
  if (score > bestScore) {
    bestScore = score;
    writeBestScore(bestScore);
  }
  hud.showSummary(score, wave, kills, bestScore);
}

function completeRun(): void {
  runState = "complete";
  paused = false;
  combo = 0;
  audio.cue("wave-clear").catch(() => undefined);
  if (score > bestScore) {
    bestScore = score;
    writeBestScore(bestScore);
  }
  hud.hideDoors();
  hud.showVictory(score, kills, maxCombo, seed, bestScore);
}

// ---------------------------------------------------------------------------
// Input plumbing
// ---------------------------------------------------------------------------

window.addEventListener("pointermove", (event) => {
  const canvasRect = app.canvas?.getBoundingClientRect();
  if (!canvasRect) return;
  // Top-down world estimate: camera rides ~16.9u above the courier at fov 41.
  const worldPerPixel = (2 * 16.9 * Math.tan((41 * Math.PI) / 360)) / canvasRect.height;
  const ndcX = (event.clientX - canvasRect.left) / canvasRect.width - 0.5;
  const ndcZ = (event.clientY - canvasRect.top) / canvasRect.height - 0.5;
  const wx = ndcX * canvasRect.width * worldPerPixel;
  const wz = ndcZ * canvasRect.height * worldPerPixel;
  const len = Math.hypot(wx, wz);
  if (len > 0.08) mouseAim = { x: wx / len, z: wz / len };
});

function unlockAudioOnce(): void {
  if (unlockedAudio) return;
  unlockedAudio = true;
  audio.unlock().catch(() => undefined);
}

window.addEventListener("pointerdown", unlockAudioOnce);
window.addEventListener("keydown", unlockAudioOnce);

window.addEventListener("mousedown", (event) => {
  if (event.button === 0 && !paused && runState === "wave-active" && player.fireCooldownRemaining <= 0) {
    firePulse();
    player.fireCooldownRemaining = DEFAULT_PLAYER_TUNING.fireCooldownSeconds * upgrades.fireRateMultiplier;
  }
});

function bindTouchStick(elementId: string, onDrag: (dx: number, dz: number, active: boolean) => void): void {
  let pointerId: number | null = null;
  let centerX = 0;
  let centerY = 0;
  let radius = 64;
  const attach = () => {
    const element = document.querySelector("[data-stick='" + elementId + "']");
    if (!(element instanceof HTMLElement)) return;
    element.addEventListener("pointerdown", (event) => {
      pointerId = event.pointerId;
      const box = element.getBoundingClientRect();
      centerX = box.left + box.width / 2;
      centerY = box.top + box.height / 2;
      radius = Math.max(1, box.width / 2);
      event.preventDefault();
    });
  };
  attach();
  window.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    const dx = (event.clientX - centerX) / radius;
    const dz = (event.clientY - centerY) / radius;
    const len = Math.hypot(dx, dz);
    const k = len > 1 ? 1 / len : 1;
    onDrag(dx * k, dz * k, true);
  });
  window.addEventListener("pointerup", (event) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    onDrag(0, 0, false);
  });
}

function renderTouchSticks(): void {
  const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  if (!coarse) {
    hud.renderTouchSticks([]);
    return;
  }
  hud.renderTouchSticks(touchLayout.controls.map((region) => ({
    id: region.id,
    label: region.label,
    centerX: region.center[0],
    centerY: region.center[1],
    radius: region.radius
  })));
}
renderTouchSticks();

// Render first, then bind: coarse-pointer controls do not exist in the DOM
// until `renderTouchSticks` materializes them.
bindTouchStick(touchLayout.controls[0]?.id ?? "move-stick", (dx, dz, active) => {
  touchMove = active ? { x: dx, z: dz } : { x: 0, z: 0 };
});
bindTouchStick(touchLayout.controls[1]?.id ?? "fire-stick", (dx, dz, active) => {
  if (active && (dx !== 0 || dz !== 0)) {
    mouseAim = { x: dx, z: dz };
    touchAimFire = true;
  } else {
    touchAimFire = false;
  }
});

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------

function update(dt: number): void {
  input.update(dt);
  hud.tickBanner(dt);
  if (input.pressed("pause") && runState !== "dead" && runState !== "complete") paused = !paused;
  if (input.pressed("reset")) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    resetRun(seed);
  }
  if (input.pressed("burst") || burstRequested) {
    burstRequested = false;
    fireBurst();
  }

  if (paused) {
    publishEvidence();
    return;
  }

  elapsedSeconds += dt;

  if (burstFxRemaining > 0) {
    burstFxRemaining = Math.max(0, burstFxRemaining - dt);
    const progress = 1 - burstFxRemaining / 0.55;
    // Begin near the persistent white radius and expand beyond it immediately;
    // the gold actual-event ring must read in the first retained burst frame.
    const scale = 1.4 + progress * 6;
    app.nodes.get("neon-burst-event-ring")
      ?.setPosition(burstFxOrigin.x, 0.18, burstFxOrigin.z)
      .setScale([scale, scale, scale])
      .setVisible(true);
    if (burstFxRemaining <= 0) app.nodes.get("neon-burst-event-ring")?.setVisible(false);
  }

  const axisX = Math.max(-1, Math.min(1, input.axis("moveX") + touchMove.x));
  const axisZ = Math.max(-1, Math.min(1, input.axis("moveZ") + touchMove.z));
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
  app.nodes.get("arena-pressure-north")?.setPosition(runMidX, 0.08, runRect.minZ).setScale([runWidth, 1, 0.16]);
  app.nodes.get("arena-pressure-south")?.setPosition(runMidX, 0.08, runRect.maxZ).setScale([runWidth, 1, 0.16]);
  app.nodes.get("arena-pressure-east")?.setPosition(runRect.maxX, 0.08, runMidZ).setScale([0.16, 1, runDepth]);
  app.nodes.get("arena-pressure-west")?.setPosition(runRect.minX, 0.08, runMidZ).setScale([0.16, 1, runDepth]);

  // Combo truth persists across the wave-clear transition, so its two-second
  // decay and distinct break event cannot be skipped by entering intermission.
  if (comboDecayRemaining > 0 && runState !== "dead" && runState !== "complete") {
    comboDecayRemaining -= dt;
    if (comboDecayRemaining <= 0 && combo > 0) {
      combo = 0;
      comboBreaks += 1;
      gameEffects.spawn("impact-flash", [player.x, 0.4, player.z], {
        color: "#ff5a36", intensity: 0.5, duration: 0.22, radius: 0.9
      });
      audio.cue("combo-break").catch(() => undefined);
    }
  }
  const stepResult = stepPlayer(player, DEFAULT_PLAYER_TUNING, upgrades, {
    moveX: axisX,
    moveZ: axisZ,
    aimX: resolveAim().x,
    aimZ: resolveAim().z,
    firePressed: false,
    dashPressed: input.pressed("dash")
  }, dt, runRect);
  if (stepResult.dashed) {
    audio.cue("dash").catch(() => undefined);
    cameraDirector.impact(0.5, 0.14);
    if (!reducedMotion) hud.flashVignette();
    gameEffects.spawn("dash-trail", [player.x, 0.5, player.z], { color: "#35e6ff", duration: 0.3, ownerId: "courier" });
  }

  const playerNode = app.nodes.get("neon-player");
  if (playerNode) {
    const bob = Math.sin(elapsedSeconds * 9) * 0.04;
    const hurtScale = player.hurtFlashRemaining > 0 ? 1.16 : 1;
    playerNode.setPosition(player.x, 0.06 + bob, player.z).setScale([hurtScale, hurtScale, hurtScale]);
    playerNode.setRotation(0, Math.atan2(resolveAim().x, resolveAim().z), 0);
  }
  const aim = resolveAim();
  app.nodes.get("neon-player-burst-radius")?.setPosition(player.x, 0.12, player.z);
  app.nodes.get("neon-player-aim-vector")
    ?.setPosition(player.x + aim.x * 1.35, 0.22, player.z + aim.z * 1.35)
    .setRotation(0, Math.atan2(aim.x, aim.z), 0);

  if (runState === "intermission") {
    intermissionRemaining -= dt;
    for (const door of PICKUP_DOORS) {
      app.nodes.get("pickup-gate-" + door.kind)?.setVisible(true);
    }
    const sensed = sensePickupDoors(player);
    if (sensed.door && !chosenDoor) chooseDoor(sensed.door.kind);
    if (intermissionRemaining <= 0) startWave(wave + 1);
  } else {
    for (const door of PICKUP_DOORS) {
      app.nodes.get("pickup-gate-" + door.kind)?.setVisible(false);
    }
  }

  if (runState === "wave-active") {
    waveElapsed += dt;
    while (spawnedCount < schedule.length && schedule[spawnedCount]!.atSeconds <= waveElapsed) {
      const event = schedule[spawnedCount]!;
      const point = spawnPointOnEdge(event.edge, event.t);
      swarm.spawn({ x: point.x, z: point.z, archetype: event.archetype, speedMultiplier: waveSpec(wave).speedMultiplier });
      spawnedCount += 1;
    }

    if ((input.pressed("fire") || touchAimFire) && player.fireCooldownRemaining <= 0) {
      firePulse();
    }

    swarm.step(dt, player, arenaLayout.obstacles, undefined, inset);
    combatFeel.stepSparks(dt);

    if (pickupActive && senseRiskPickup(player, pickupPosition)) collectRiskPickup();

    const grazeCount = swarm.countWithin(player, PLAYER_RADIUS + 0.55, 2.35);
    if (grazeCount > 0 && !swarm.contactOverlap({ x: player.x, z: player.z, radius: PLAYER_RADIUS })) {
      grazeAccumulator += dt;
      if (grazeAccumulator >= 0.5) {
        grazeAccumulator -= 0.5;
        grazes += 1;
        score += 15;
        burstCharge = Math.min(100, burstCharge + Math.min(8, 2 + grazeCount));
        gameEffects.spawn("aura-burst", [player.x, 0.45, player.z], {
          color: "#ffc857", intensity: 0.45, duration: 0.18, radius: 1.25
        });
        audio.cue("graze").catch(() => undefined);
      }
    } else {
      grazeAccumulator = 0;
    }

    if (swarm.contactOverlap({ x: player.x, z: player.z, radius: PLAYER_RADIUS })) {
      const dealt = applyContactDamage(player, upgrades, 3.4, dt);
      if (dealt > 0) {
        damageEvents += 1;
        audio.cue("player-hurt").catch(() => undefined);
        cameraDirector.impact(1, 0.2);
        if (!reducedMotion) hud.flashVignette();
        combatFeel.spawnSparks({ x: player.x, z: player.z, count: 6, strength: 0.6 });
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
      if (score > bestScore) {
        bestScore = score;
        writeBestScore(bestScore);
      }
      if (stateAfterWaveClear(wave) === "complete") completeRun();
      else beginIntermission(waveSpec(wave).intermissionSeconds);
    }
  } else {
    combatFeel.stepSparks(dt);
  }

  const cameraState = cameraDirector.update(dt, [{
    id: "courier",
    position: [player.x, 0.6, player.z] as const
  }]);
  void cameraState;

  hud.update({
    state: runState,
    wave: Math.max(1, wave),
    score,
    bestScore,
    combo,
    maxCombo,
    burstCharge,
    comboFraction: comboDecayRemaining / COMBO_WINDOW_SECONDS,
    hp: player.hp,
    maxHp: player.maxHp,
    alive: swarm.aliveCount(),
    shieldCharges: upgrades.shieldCharges,
    dashReadyFraction: 1 - player.dashCooldownRemaining /
      Math.max(0.001, DEFAULT_PLAYER_TUNING.dashCooldownSeconds * upgrades.dashCooldownMultiplier),
    paused,
    intermissionRemaining: runState === "intermission" ? intermissionRemaining : 0
  });

  publishEvidence();
}

function publishEvidence(): void {
  const diagnostics = safeDiagnostics();
  const audioProof = audio.proof();
  const aliveGrunt = swarm.aliveGruntCount();
  const aliveElite = swarm.aliveEliteCount();
  const terminalHash = runState === "dead" || runState === "complete"
    ? outcomeHash({
      seed,
      state: runState,
      wave: Math.max(1, wave),
      score,
      kills,
      maxCombo,
      hp: player.hp,
      upgrades,
      waveChecksums
    })
    : null;
  const evidence: NeonSwarmEvidence = {
    schema: "aura3d-showcase-neon-swarm/1.0",
    mounted: true,
    appId: "showcase-neon-swarm",
    status: "ready",
    state: runState,
    wave: Math.max(1, wave),
    alive: aliveGrunt + aliveElite,
    aliveGrunt,
    aliveElite,
    instanceCount: aliveGrunt + aliveElite,
    drawCalls: diagnostics.drawCalls,
    nativeInstancedSubmissions: diagnostics.nativeInstancedSubmissions,
    score,
    combo,
    maxCombo,
    hp: player.hp,
    maxHp: player.maxHp,
    kills,
    seed,
    paused,
    reducedMotion,
    audioCues: audioProof.recentCues,
    audioCueCount: audioProof.cueCount,
    waveChecksum,
    waveChecksums: waveChecksums.slice(),
    stage: campaignStage(Math.max(1, wave)),
    arenaInset: arenaInsetForWave(Math.max(1, wave)),
    finaleSurvivalRemaining: wave === MAX_CAMPAIGN_WAVES && runState === "wave-active"
      ? Math.max(0, FINALE_SURVIVAL_SECONDS - waveElapsed)
      : 0,
    outcomeHash: terminalHash,
    upgrades: { ...upgrades },
    playerPosition: { x: player.x, z: player.z },
    burstCharge,
    bursts,
    grazes,
    comboBreaks,
    damageEvents,
    pickupActive,
    pickupPosition: { ...pickupPosition },
    pickupsCollected,
    audio: audioProof,
    primaryAssets: ["neonCourierAvatar", "neonBarricadeProp", "neonStreetLampProp"],
    typedAssets: [
      { id: "neonCourierAvatar", typedRef: "assets.neonCourierAvatar", role: "primaryCharacter" },
      { id: "neonBarricadeProp", typedRef: "assets.neonBarricadeProp", role: "primaryWorld" },
      { id: "neonStreetLampProp", typedRef: "assets.neonStreetLampProp", role: "primaryWorld" }
    ],
    systems: {
      runtime: "createAuraApp root safe API",
      input: "game.input + game.touchControls",
      instancing: "instances.capsule + instances.box",
      steering: "route-local deterministic typed-array steering",
      audio: "createGameAudio typed assets"
    },
    controls,
    claimBoundary
  };
  window.__NEON_SWARM_EVIDENCE__ = evidence;
  window.__AURA3D_SHOWCASE_NEON_SWARM__ = evidence;
  document.body.dataset.aura3dShowcaseReady = "true";
}

interface SafeDiagnostics {
  drawCalls: number;
  nativeInstancedSubmissions: number;
}

function safeDiagnostics(): SafeDiagnostics {
  try {
    const report = app.diagnostics() as unknown as {
      drawCalls?: number;
      renderer?: { runtime?: { nativeInstancedSubmissions?: number } };
    };
    return {
      drawCalls: Number(report.drawCalls ?? 0),
      nativeInstancedSubmissions: Number(report.renderer?.runtime?.nativeInstancedSubmissions ?? 0)
    };
  } catch {
    return { drawCalls: 0, nativeInstancedSubmissions: 0 };
  }
}

// Deterministic hooks so browser evidence specs can stage states quickly.
window.__NEON_SWARM_DEBUG__ = {
  stepFixed(frames) {
    for (let i = 0; i < frames; i += 1) update(1 / 60);
  },
  startWaveNow() {
    if (runState === "intermission") startWave(wave + 1);
  },
  drainPlayerHp() {
    player.hp = 0;
    killPlayer();
  },
  chooseDoor(kind) {
    chooseDoor(kind);
  },
  spawnTestSwarm(total) {
    // Evidence staging for the instancing spec: deterministic grid across the
    // arena so both pools hold live instances without waiting for waves.
    swarm.reset();
    // This hook stages an exact retained-density fixture; suppress the normal
    // schedule so the next frame cannot add a 321st drone behind the evidence.
    if (runState === "wave-active") spawnedCount = schedule.length;
    let spawned = 0;
    const columns = 22;
    const rows = Math.max(1, Math.ceil(total / columns));
    for (let i = 0; i < total; i += 1) {
      const column = i % columns;
      const row = Math.floor(i / columns);
      const x = rect.minX + 2 + column * ((rect.maxX - rect.minX - 4) / (columns - 1));
      const z = rect.minZ + 2 + row * ((rect.maxZ - rect.minZ - 4) / Math.max(1, rows - 1));
      const archetype = i % 8 === 0 ? "elite" : "grunt";
      if (swarm.spawn({ x, z, archetype, speedMultiplier: waveSpec(Math.max(1, wave)).speedMultiplier })) {
        spawned += 1;
      }
    }
    void spawned;
  },
  stageKillCluster(count = 6) {
    // Ring just inside pulse reach (3.6) but outside contact range (~1.0).
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const x = Math.min(rect.maxX - 0.5, Math.max(rect.minX + 0.5, player.x + Math.cos(angle) * 2.1));
      const z = Math.min(rect.maxZ - 0.5, Math.max(rect.minZ + 0.5, player.z + Math.sin(angle) * 2.1));
      swarm.spawn({ x, z, archetype: "grunt", speedMultiplier: 1 });
    }
  },
  jumpToWave(target) {
    // Evidence staging for mid-wave captures: begin wave N with its seeded
    // schedule and elite mix immediately.
    if (target >= 1) startWave(Math.floor(target));
  },
  clearActiveWave() {
    if (runState !== "wave-active") return;
    swarm.reset();
    spawnedCount = schedule.length;
    update(1 / 60);
  },
  finishFinale() {
    if (runState !== "wave-active" || wave !== MAX_CAMPAIGN_WAVES) return;
    spawnedCount = schedule.length;
    waveElapsed = Math.max(waveElapsed, FINALE_SURVIVAL_SECONDS);
    update(1 / 60);
  },
  resetWithSeed(value) {
    resetRun(value >>> 0);
  },
  stageGraze() {
    if (runState !== "wave-active") return;
    swarm.reset();
    spawnedCount = schedule.length;
    player.vx = 0;
    player.vz = 0;
    // Place the fixture one fixed frame before the half-second award. The
    // browser still proves the live annulus decides whether that award fires.
    grazeAccumulator = 0.49;
    swarm.spawn({ x: player.x + 2.05, z: player.z, archetype: "elite", speedMultiplier: 1 });
    publishEvidence();
  },
  stageBurstCluster(count = 10) {
    if (runState !== "wave-active") return;
    swarm.reset();
    spawnedCount = schedule.length;
    burstCharge = 100;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      // Keep one target beyond the 4.25-unit radius so the real burst does not
      // immediately clear the staged wave before its retained effect frame.
      const radius = i === count - 1 ? 6 : 2.15;
      swarm.spawn({
        x: player.x + Math.cos(angle) * radius,
        z: player.z + Math.sin(angle) * radius,
        archetype: i % 5 === 0 ? "elite" : "grunt",
        speedMultiplier: 1
      });
    }
    publishEvidence();
  },
  stagePickupAtPlayer() {
    if (runState !== "wave-active") return;
    pickupPosition = { x: player.x, z: player.z };
    pickupActive = true;
    app.nodes.get("swarm-pickup")
      ?.setPosition(pickupPosition.x, 1.1, pickupPosition.z)
      .setVisible(true);
    publishEvidence();
  },
  stageContact() {
    if (runState !== "wave-active") return;
    swarm.reset();
    spawnedCount = schedule.length;
    player.invulnerableRemaining = 0;
    player.contactDebt = 0;
    swarm.spawn({ x: player.x, z: player.z, archetype: "grunt", speedMultiplier: 0 });
    publishEvidence();
  },
  dumpDiagnostics() {
    try {
      return app.diagnostics() as unknown as Record<string, unknown>;
    } catch (error) {
      return { error: String(error) };
    }
  }
};

Object.defineProperty(window, "__AURA3D_COMPOSITION_PROBE__", {
  value: {
    category: "application" as const,
    get subject() {
      return {
        position: [player.x, 0.88, player.z] as const,
        rotation: [0, Math.atan2(resolveAim().x, resolveAim().z), 0] as const,
        targetSize: 2.2
      };
    },
    setSubjectSuppressed(suppressed: boolean) {
      compositionSubjectSuppressed = suppressed;
      app.nodes.get("neon-player")?.setVisible(!suppressed);
      app.nodes.get("neon-player-burst-radius")?.setVisible(!suppressed);
      app.nodes.get("neon-player-aim-vector")?.setVisible(!suppressed);
    },
    settleSubjectPose() {
      paused = true;
      player.x = 0;
      player.z = 3;
      const node = app.nodes.get("neon-player");
      node?.setPosition(player.x, 0.06, player.z).setRotation(0, 0, 0).setScale([1.34, 1.34, 1.34]);
      node?.setVisible(!compositionSubjectSuppressed);
    }
  },
  configurable: true
});

function requireHudElement(): HTMLElement {
  const el = document.querySelector("#hud");
  if (!(el instanceof HTMLElement)) throw new Error("Neon Swarm requires #hud.");
  return el;
}

app.onFrame(({ time }) => {
  const dt = lastTime === 0 ? 1 / 60 : Math.min(0.05, Math.max(0.001, time - lastTime));
  lastTime = time;
  update(dt);
});

resetRun(SEED_DEFAULT);
publishEvidence();
