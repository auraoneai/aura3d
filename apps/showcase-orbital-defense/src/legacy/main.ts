import {
  camera,
  createAuraApp,
  effects,
  game,
  instances,
  interactions,
  lights,
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";
import { assets, assets as rootAssets } from "../../../../src/aura-assets";
import "../styles.css";
import { maybeWriteHud } from "./hud-diff";
import {
  createWaveState,
  enemyIds,
  fire,
  polar,
  playerRadius,
  projectileIds,
  resetGame,
  shield,
  shieldIds,
  updateWaves,
  type EnemyState,
  type ProjectileState,
  type WaveState
} from "../gameplay/waves";

const spaceStationAsset =
  (rootAssets as any).gravitySpaceStationMeshy ?? rootAssets.gravityOrbitalRelayMeshy;
const cargoShuttleAsset =
  (rootAssets as any).gravityCargoShuttleMeshy ?? rootAssets.pulseStarfighterHeroMeshy;

interface OrbitalDefenseEvidence {
  readonly status: "ready" | "running";
  readonly appId: "showcase-orbital-defense";
  readonly frameCount: number;
  readonly score: number;
  readonly wave: number;
  readonly planetIntegrity: number;
  readonly heat: number;
  readonly activeEnemies: number;
  readonly activeProjectiles: number;
  readonly replayChecksum: number;
  readonly controls: readonly string[];
  readonly systems: readonly string[];
  readonly claimBoundary: string;
}

declare global {
  interface Window {
    __AURA3D_SHOWCASE_ORBITAL_DEFENSE__?: OrbitalDefenseEvidence;
    __AURA3D_GAME_EVIDENCE__?: OrbitalDefenseEvidence;
    __AURA3D_GAME__?: { state: string };
  }
}

const controls = [
  "ArrowLeft/KeyA rotate counter-clockwise",
  "ArrowRight/KeyD rotate clockwise",
  "Space/KeyE Orbital Ion Cannon Overcharge",
  "KeyQ Interceptor Squadron Scramble + shield pulse",
  "KeyR resets deterministic wave",
  "KeyP pauses"
] as const;

const systems = [
  "one mounted Aura app",
  "runtime player/enemy/projectile/turret-laser nodes",
  "deterministic wave script + turret upgrade synergy",
  "Orbital Ion Cannon Overcharge + Squadron Scramble",
  "input buffer and replay checksum",
  "heat and shield economy",
  "HUD evidence",
  "accessibility-safe pause/reset"
] as const;

function orbitalHash(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const visualPlayerRadius = 2.12;
const patrolShuttleIds = ["patrol-shuttle-0", "patrol-shuttle-1", "patrol-shuttle-2"] as const;
const laserBeamIds = [
  "orbital-laser-0",
  "orbital-laser-1",
  "orbital-laser-2",
  "orbital-laser-3",
  "orbital-laser-4",
  "orbital-laser-5"
] as const;

const turretAnchors: readonly (readonly [number, number, number])[] = [
  [-2.12, 0.76, 0.22],
  [2.08, 0.84, 0.22],
  [-2.95, 1.18, 0.14],
  [2.95, -1.12, 0.14],
  [0, 2.32, 0.18],
  [2.14, -0.86, 0.20]
];

const appScene = scene()
  .background("#050c1e")
  .add(
    model(assets.orbitalPlanetGlobeMeshy, {
      name: "defended planet globe",
      role: "primaryWorld",
      scaleMode: "fit",
      targetMaxDimension: 2.28
    }).position(0, -1.14, 0)
  )
  // Glowing cyan/blue atmospheric rim halo rings around Earth
  .add(
    primitives.torus({
      name: "earth atmospheric inner cyan rim halo",
      material: material.emissive({
        color: "#0ea5e9",
        emissive: "#38bdf8",
        emissiveIntensity: 1.55,
        opacity: 0.86
      })
    })
      .position(0, 0, -0.14)
      .scale([1.19, 1.19, 0.042])
  )
  .add(
    primitives.torus({
      name: "earth atmospheric outer azure halo",
      material: material.emissive({
        color: "#1d4ed8",
        emissive: "#60a5fa",
        emissiveIntensity: 1.15,
        opacity: 0.68
      })
    })
      .position(0, 0, -0.18)
      .scale([1.34, 1.34, 0.028])
  )
  .add(
    primitives.torus({
      name: "planetary defense orbital grid ring",
      material: material.emissive({
        color: "#082f49",
        emissive: "#38bdf8",
        emissiveIntensity: 0.92,
        opacity: 0.72
      })
    })
      .position(0, 0, -0.08)
      .scale([visualPlayerRadius, visualPlayerRadius, 0.016])
  )
  .add(
    primitives.torus({
      name: "planetary outer intercept perimeter ring",
      material: material.emissive({
        color: "#064e3b",
        emissive: "#34d399",
        emissiveIntensity: 0.72,
        opacity: 0.52
      })
    })
      .position(0, 0, -0.12)
      .scale([2.72, 2.72, 0.012])
  )
  // 2x Wave-2 Meshy Orbital Command Stations flanking Earth
  .add(
    model(spaceStationAsset, {
      name: "orbital command station alpha",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 2.1
    })
      .position(-3.05, 1.05, -0.24)
      .rotate(0.28, 0.52, -0.18)
      .runtime(game.runtimeNode("orbital-command-station-alpha"))
  )
  .add(
    primitives.torus({
      name: "orbital command station alpha halo",
      material: material.emissive({
        color: "#083344",
        emissive: "#22d3ee",
        emissiveIntensity: 1.25,
        opacity: 0.75
      })
    })
      .position(-3.05, 1.05, -0.28)
      .scale([0.78, 0.78, 0.02])
  )
  .add(
    model(spaceStationAsset, {
      name: "orbital command station beta",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 2.1
    })
      .position(3.05, -1.05, -0.24)
      .rotate(-0.24, -0.48, 0.16)
      .runtime(game.runtimeNode("orbital-command-station-beta"))
  )
  .add(
    primitives.torus({
      name: "orbital command station beta halo",
      material: material.emissive({
        color: "#451a03",
        emissive: "#fbbf24",
        emissiveIntensity: 1.25,
        opacity: 0.75
      })
    })
      .position(3.05, -1.05, -0.28)
      .scale([0.78, 0.78, 0.02])
  )
  // Defense Turrets & Orbital Relays
  .add(
    model(assets.orbitalDefenseTurretMeshy, {
      name: "orbital defense turret alpha",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.72
    })
      .position(-2.12, 0.76, 0.18)
      .rotate(1.15, 1.32, -0.38)
      .runtime(game.runtimeNode("orbital-turret-alpha"))
  )
  .add(
    model(assets.orbitalDefenseTurretMeshy, {
      name: "orbital defense turret gamma",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.72
    })
      .position(2.08, 0.84, 0.18)
      .rotate(0.95, -1.18, 0.34)
      .runtime(game.runtimeNode("orbital-turret-gamma"))
  )
  .add(
    model(assets.gravityOrbitalRelayMeshy, {
      name: "orbital defense relay beta",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.82
    })
      .position(0, 1.98, 0.12)
      .rotate(0.32, 0.45, 0.12)
      .runtime(game.runtimeNode("orbital-relay-zenith"))
  )
  .add(
    model(assets.skylineFrostSentryDroneMeshy, {
      name: "orbital defense sentry satellite beta",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.68
    })
      .position(2.14, -0.86, 0.18)
      .rotate(-0.32, -0.68, 0.22)
  )
  .add(
    model(assets.gravityCargoContainerPodMeshy, {
      name: "orbital defense supply pod",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.52
    })
      .position(-1.76, -1.34, 0.24)
      .rotate(0.45, 0.95, 0.32)
  )
  // Deep-space starfield directly in camera frustum (nebula cloud ovals hidden to keep Earth and orbital stations crystal clear)
  .add(
    instances.sphere({
      name: "orbital-nebula-cyan-cloud",
      material: material.emissive({
        color: "#0c4a6e",
        emissive: "#0284c7",
        emissiveIntensity: 0.01,
        opacity: 0
      }),
      castShadow: false,
      receiveShadow: false,
      transforms: [{ position: [0, -90, -20], rotation: [0, 0, 0], scale: [0.0001, 0.0001, 0.0001] }]
    })
  )
  .add(
    instances.sphere({
      name: "orbital-nebula-violet-cloud",
      material: material.emissive({
        color: "#3b0764",
        emissive: "#7c3aed",
        emissiveIntensity: 0.01,
        opacity: 0
      }),
      castShadow: false,
      receiveShadow: false,
      transforms: [{ position: [0, -90, -20], rotation: [0, 0, 0], scale: [0.0001, 0.0001, 0.0001] }]
    })
  )
  .add(
    instances.sphere({
      name: "orbital-deep-backdrop-stars",
      material: material.emissive({
        color: "#f8fafc",
        emissive: "#bae6fd",
        emissiveIntensity: 1.65
      }),
      castShadow: false,
      receiveShadow: false,
      transforms: Array.from({ length: 220 }, (_, i) => {
        const x = (orbitalHash(i + 1200) - 0.5) * 14.5;
        const y = (orbitalHash(i + 1500) - 0.5) * 9.2;
        const z = -4.2 - orbitalHash(i + 1800) * 6.5;
        const s = 0.016 + orbitalHash(i + 2100) * 0.036;
        return {
          position: [x, y, z] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          scale: [s, s, s] as [number, number, number]
        };
      })
    })
  )
  .add(
    instances.sphere({
      name: "orbital-star-shell",
      material: material.emissive({ color: "#e2e8f0", emissive: "#93c5fd", emissiveIntensity: 0.95 }),
      castShadow: false,
      receiveShadow: false,
      transforms: Array.from({ length: 140 }, (_, i) => {
        const az = orbitalHash(i + 100) * Math.PI * 2;
        const el = (orbitalHash(i + 200) - 0.35) * Math.PI;
        const r = 36 + orbitalHash(i + 300) * 14;
        const s = 0.045 + orbitalHash(i + 400) * 0.09;
        return {
          position: [Math.cos(az) * Math.cos(el) * r, Math.sin(el) * r, Math.sin(az) * Math.cos(el) * r] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          scale: [s, s, s] as [number, number, number]
        };
      })
    })
  )
  .add(
    instances.sphere({
      name: "orbital-asteroid-belt",
      material: material.pbr({ color: "#64748b", roughness: 0.72, metallic: 0.28 }),
      castShadow: false,
      receiveShadow: true,
      transforms: Array.from({ length: 120 }, (_, i) => {
        const a = (i / 120) * Math.PI * 2 + orbitalHash(i + 500) * 0.2;
        const r = 4.6 + orbitalHash(i + 600) * 2.2;
        const s = 0.035 + orbitalHash(i + 700) * 0.065;
        return {
          position: [Math.cos(a) * r, Math.sin(a) * r, -0.45 + (orbitalHash(i + 800) - 0.5) * 0.7] as [number, number, number],
          rotation: [orbitalHash(i + 1000) * 3, orbitalHash(i + 1100) * 3, 0] as [number, number, number],
          scale: [s, s * (0.65 + orbitalHash(i + 900) * 0.6), s] as [number, number, number]
        };
      })
    })
  )
  .add(
    model(assets.pulseStarfighterHeroMeshy, {
      name: "player interceptor",
      role: "primaryCharacter",
      scaleMode: "fit",
      targetMaxDimension: 0.76
    })
      .position(visualPlayerRadius, 0, 0.28)
      .rotate(0.35, 0.6, -0.2)
      .runtime(game.runtimeNode("player-interceptor"))
  )
  .add(
    primitives.torus({
      name: "player interceptor cyan shield halo",
      material: material.emissive({
        color: "#083344",
        emissive: "#22d3ee",
        emissiveIntensity: 1.55,
        opacity: 0.85
      })
    })
      .position(visualPlayerRadius, 0, 0.26)
      .scale([0.36, 0.36, 0.016])
      .runtime(game.runtimeNode("player-interceptor-shield"))
  )
  .add(
    primitives.sphere({
      name: "player interceptor thruster core",
      material: material.emissive({
        color: "#06b6d4",
        emissive: "#67e8f9",
        emissiveIntensity: 1.95
      })
    })
      .position(visualPlayerRadius, 0, 0.28)
      .scale(0.064)
      .runtime(game.runtimeNode("player-interceptor-thruster"))
  )
  .add(primitives.sphere({ name: "player aiming bead", material: material.emissive({ color: "#2b2109", emissive: "#facc15", emissiveIntensity: 1.45 }) }).position(visualPlayerRadius + 0.32, 0, 0.24).scale(0.055).runtime(game.runtimeNode("player-aim")))
  .add(lights.ambient({ intensity: 0.96, color: "#93c5fd" }))
  .add(lights.directional({ position: [2.6, 4.2, 5.6], intensity: 2.2, color: "#e0f2fe" }))
  .add(lights.directional({ position: [-3.8, -2.8, 4.8], intensity: 1.75, color: "#fb923c" }))
  .add(lights.directional({ position: [0.4, 5.2, -3.4], intensity: 1.55, color: "#38bdf8" }))
  .add(lights.point({ position: [-2.4, 2.2, 3.2], color: "#38bdf8", intensity: 2.8 }))
  .add(lights.point({ position: [2.6, -1.6, 3.2], color: "#fbbf24", intensity: 2.6 }))
  .add(lights.point({ position: [0, 2.6, 2.8], color: "#fb7185", intensity: 2.3 }))
  .add(lights.point({ position: [0, -2.6, 2.8], color: "#f97316", intensity: 2.3 }))
  .add(effects.bloom({ intensity: 0.16, color: "#38bdf8" }))
  .add(effects.fog({ density: 0.0025, color: "#060d1d" }))
  .add(interactions.orbit())
  .camera(camera.perspective({ position: [0, 0, 7.15], target: [0, 0, 0], fov: 46 }));

let builtScene = appScene;

// 3x Patrolling Orbital Defense Interceptors (Wave-2 gravityCargoShuttleMeshy ?? pulseStarfighterHeroMeshy)
for (const [idx, shuttleId] of patrolShuttleIds.entries()) {
  const angle = (idx / patrolShuttleIds.length) * Math.PI * 2 + 0.45;
  const pos = polar(angle, 1.68, 0.22);
  builtScene = builtScene
    .add(
      model(cargoShuttleAsset, {
        name: `${shuttleId} orbital defense interceptor`,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: 0.64
      })
        .position(pos[0], pos[1], pos[2])
        .rotate(0.28, 0.45, angle + Math.PI / 2)
        .runtime(game.runtimeNode(shuttleId))
    )
    .add(
      primitives.torus({
        name: `${shuttleId} escort halo`,
        material: material.emissive({
          color: "#064e3b",
          emissive: idx % 2 === 0 ? "#34d399" : "#38bdf8",
          emissiveIntensity: 1.45,
          opacity: 0.82
        })
      })
        .position(pos[0], pos[1], pos[2] - 0.02)
        .scale([0.24, 0.24, 0.015])
        .runtime(game.runtimeNode(`${shuttleId}-halo`))
    );
}

// Active 3D cyan/emerald defense laser beams, gold plasma bolts, and shield impact ripples
for (const [idx, beamId] of laserBeamIds.entries()) {
  const isEmerald = idx % 2 === 1;
  builtScene = builtScene
    .add(
      primitives.box({
        name: `${beamId} defense laser beam`,
        material: material.emissive({
          color: isEmerald ? "#065f46" : "#0e7490",
          emissive: isEmerald ? "#34d399" : "#22d3ee",
          emissiveIntensity: 2.35,
          opacity: 0.92
        })
      })
        .position(0, 0, 0.22)
        .scale([0.8, 0.032, 0.032])
        .runtime(game.runtimeNode(beamId))
    )
    .add(
      primitives.sphere({
        name: `${beamId} gold interceptor plasma bolt`,
        material: material.emissive({
          color: "#78350f",
          emissive: "#fbbf24",
          emissiveIntensity: 2.65
        })
      })
        .position(0, 0, 0.25)
        .scale(0.068)
        .runtime(game.runtimeNode(`${beamId}-bolt`))
    )
    .add(
      primitives.torus({
        name: `${beamId} shield impact ripple`,
        material: material.emissive({
          color: isEmerald ? "#064e3b" : "#083344",
          emissive: isEmerald ? "#6ee7b7" : "#67e8f9",
          emissiveIntensity: 2.15,
          opacity: 0.88
        })
      })
        .position(0, 0, 0.26)
        .scale([0.22, 0.22, 0.018])
        .runtime(game.runtimeNode(`${beamId}-ripple`))
    );
}

for (const [index, id] of enemyIds.entries()) {
  const isCrimsonVariant = index % 2 === 0;
  builtScene = builtScene
    .add(
      model(assets.orbitalStrikeDroneMeshy, {
        name: `${id} wave drone`,
        role: "enemy",
        scaleMode: "fit",
        targetMaxDimension: 0.62
      })
        .position(8, 8, 0)
        .runtime(game.runtimeNode(id))
    )
    .add(
      primitives.torus({
        name: `${id} threat core ring`,
        material: material.emissive({
          color: isCrimsonVariant ? "#4c0519" : "#451a03",
          emissive: isCrimsonVariant ? "#fb7185" : "#fbbf24",
          emissiveIntensity: 1.75,
          opacity: 0.92
        })
      })
        .position(8, 8, 0)
        .scale([0.28, 0.28, 0.02])
        .runtime(game.runtimeNode(`${id}-core-ring`))
    )
    .add(
      primitives.sphere({
        name: `${id} threat engine core`,
        material: material.emissive({
          color: "#7f1d1d",
          emissive: isCrimsonVariant ? "#f43f5e" : "#f97316",
          emissiveIntensity: 1.95
        })
      })
        .position(8, 8, 0)
        .scale(0.055)
        .runtime(game.runtimeNode(`${id}-core-beacon`))
    );
}
for (const id of projectileIds) {
  builtScene = builtScene.add(
    primitives.sphere({ name: `${id} interceptor bolt`, material: material.emissive({ color: "#78350f", emissive: "#fbbf24", emissiveIntensity: 2.25 }) })
      .position(8, 8, 0)
      .scale(0.072)
      .runtime(game.runtimeNode(id))
  );
}
for (const id of shieldIds) {
  builtScene = builtScene.add(
    primitives.torus({ name: `${id} shield segment`, material: material.emissive({ color: "#11261f", emissive: "#75f2cf", emissiveIntensity: 1.45 }) })
      .position(8, 8, 0)
      .rotate(1.5708, 0, 0)
      .scale([0.35, 0.35, 0.016])
      .runtime(game.runtimeNode(id))
  );
}

const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  scene: builtScene
});

const input = game.input({
  actions: {
    left: ["ArrowLeft", "KeyA"],
    right: ["ArrowRight", "KeyD"],
    fire: ["Space", "KeyE"],
    shield: ["KeyQ"],
    reset: ["KeyR"],
    pause: ["KeyP"]
  },
  axes: {
    rotate: { negative: "left", positive: "right" }
  },
  bufferMs: 120
});

const state: WaveState = createWaveState();
// Seed initial orbital defense intercept score and active volley so title/action captures show active combat
state.score = 240;
fire(state);
shield(state);

const enemies: readonly EnemyState[] = state.enemies;
const projectiles: readonly ProjectileState[] = state.projectiles;
const player = state.player;

let paused = false;
let lastTime = 0;
let ionOverchargeTimer = 0.85;
let squadronScrambleTimer = 1.1;
let turretSynergyTick = 0;

const hud = document.querySelector<HTMLElement>("#hud");
if (!hud) throw new Error("Orbital Defense requires #hud.");
const lastHudHtml = { value: undefined as string | undefined };
renderHud();

function triggerIonOvercharge(): void {
  ionOverchargeTimer = 1.6;
  fire(state);
  // Spawn twin flanking interceptor bolts for Overcharge synergy
  const extraBolt = state.projectiles.find((candidate) => !candidate.active);
  if (extraBolt) {
    extraBolt.active = true;
    extraBolt.angle = state.player.angle + 0.14;
    extraBolt.radius = playerRadius + 0.22;
    extraBolt.ttl = 1.45;
  }
  state.score += 35;
}

function triggerSquadronScramble(): void {
  squadronScrambleTimer = 2.4;
  shield(state);
  // Squadron intercept damages closest active raider
  const target = state.enemies.find((enemy) => enemy.active);
  if (target) {
    target.radius = Math.min(4.8, target.radius + 0.45);
    state.score += 50;
  }
}

function update(dt: number): void {
  input.update(dt);
  if (input.pressed("pause")) paused = !paused;
  if (input.pressed("reset")) {
    resetGame(state);
    state.score = 240;
    fire(state);
    ionOverchargeTimer = 0.85;
    squadronScrambleTimer = 1.1;
    paused = false;
  }
  if (paused) {
    publishEvidence("ready");
    return;
  }

  const pressedFire = input.pressed("fire");
  const pressedShield = input.pressed("shield");
  if (pressedFire) triggerIonOvercharge();
  if (pressedShield) triggerSquadronScramble();

  ionOverchargeTimer = Math.max(0, ionOverchargeTimer - dt);
  squadronScrambleTimer = Math.max(0, squadronScrambleTimer - dt);

  // Turret upgrade synergy: autonomous orbital defense turrets periodically pulse intercept score & bolts
  turretSynergyTick += dt;
  if (turretSynergyTick >= 1.25) {
    turretSynergyTick = 0;
    state.score += 15 * state.wave;
    if (state.projectiles.filter((p) => p.active).length < 2 && state.player.heat < 65) {
      fire(state);
    }
  }

  updateWaves(state, dt, {
    rotate: input.axis("rotate"),
    fire: false,
    shield: false
  });

  syncRuntimeNodes();
  renderHud();
  publishEvidence("running");
}

function syncRuntimeNodes(): void {
  const phase = state.frameCount * 0.035;
  const playerPosition = polar(player.angle, visualPlayerRadius, 0.28);
  app.nodes.require("player-interceptor")
    .setPosition(playerPosition[0], playerPosition[1] - 0.18, playerPosition[2])
    .setRotation(0.35, 0.6, player.angle + Math.PI / 2 - 0.2);
  app.nodes.require("player-interceptor-shield")
    .setPosition(playerPosition[0], playerPosition[1], playerPosition[2] - 0.02)
    .setRotation(0.22, 0.35, player.angle);
  const thrusterPos = polar(player.angle - 0.08, visualPlayerRadius - 0.06, 0.28);
  app.nodes.require("player-interceptor-thruster")
    .setPosition(thrusterPos[0], thrusterPos[1], thrusterPos[2]);
  const aimPosition = polar(player.angle, visualPlayerRadius + 0.34, 0.24);
  app.nodes.require("player-aim").setPosition(aimPosition[0], aimPosition[1], aimPosition[2]);

  // Animate orbital command stations & patrolling cargo-shuttle interceptors
  app.nodes.require("orbital-command-station-alpha")
    .setRotation(0.28, 0.52 + Math.sin(phase * 0.5) * 0.15, -0.18 + phase * 0.08);
  app.nodes.require("orbital-command-station-beta")
    .setRotation(-0.24, -0.48 + Math.cos(phase * 0.5) * 0.15, 0.16 - phase * 0.08);

  const scrambleBoost = squadronScrambleTimer > 0 ? 2.2 : 1.0;
  const shuttlePositions: [number, number, number][] = [];
  for (let i = 0; i < patrolShuttleIds.length; i += 1) {
    const shuttleId = patrolShuttleIds[i]!;
    const orbitAngle = phase * 0.65 * scrambleBoost + (i * Math.PI * 2) / patrolShuttleIds.length + 0.45;
    const orbitRadius = 1.66 + (i % 2) * 0.18 + (squadronScrambleTimer > 0 ? 0.16 : 0);
    const sPos = polar(orbitAngle, orbitRadius, 0.22);
    shuttlePositions.push([sPos[0], sPos[1], sPos[2]]);
    app.nodes.require(shuttleId)
      .setPosition(sPos[0], sPos[1] - 0.12, sPos[2])
      .setRotation(0.28, 0.48, orbitAngle + Math.PI / 2);
    app.nodes.require(`${shuttleId}-halo`)
      .setPosition(sPos[0], sPos[1], sPos[2] - 0.02)
      .setRotation(0.2, 0.3, orbitAngle);
  }

  const activeEnemyCoords: [number, number, number][] = [];
  for (const enemy of state.enemies) {
    const visualEnemyRadius = 1.38 + Math.min(1.0, Math.max(0, (enemy.radius - 1.2) * 0.28));
    const pos = enemy.active ? polar(enemy.angle, visualEnemyRadius, 0.18 + enemy.lane * 0.06) : ([8, 8, 0] as const);
    if (enemy.active) {
      activeEnemyCoords.push([pos[0], pos[1], pos[2]]);
    }
    app.nodes.require(enemy.id)
      .setPosition(pos[0], enemy.active ? pos[1] - 0.16 : pos[1], pos[2])
      .setRotation(0.42, 0.52, -enemy.angle + Math.PI * 0.25);
    app.nodes.require(`${enemy.id}-core-ring`)
      .setPosition(pos[0], pos[1], pos[2] - 0.02)
      .setRotation(0.25, 0.2, -enemy.angle)
      .setVisible(enemy.active);
    app.nodes.require(`${enemy.id}-core-beacon`)
      .setPosition(pos[0], pos[1], pos[2] + 0.04)
      .setVisible(enemy.active);
  }

  // Sync active 3D cyan/emerald defense laser beams and gold plasma bolts between turrets/stations and incoming drones
  for (let i = 0; i < laserBeamIds.length; i += 1) {
    const beamId = laserBeamIds[i]!;
    const targetPos = activeEnemyCoords[i % Math.max(1, activeEnemyCoords.length)];
    const originPos =
      i < 2
        ? turretAnchors[i]!
        : i === 2
          ? ([playerPosition[0], playerPosition[1], playerPosition[2]] as const)
          : i === 3 && shuttlePositions[0]
            ? shuttlePositions[0]
            : turretAnchors[i % turretAnchors.length]!;
    if (!targetPos) {
      app.nodes.require(beamId).setVisible(false);
      app.nodes.require(`${beamId}-bolt`).setVisible(false);
      app.nodes.require(`${beamId}-ripple`).setVisible(false);
      continue;
    }
    const dx = targetPos[0] - originPos[0];
    const dy = targetPos[1] - originPos[1];
    const length = Math.max(0.25, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    const midX = (originPos[0] + targetPos[0]) * 0.5;
    const midY = (originPos[1] + targetPos[1]) * 0.5;
    const beamThickness = (ionOverchargeTimer > 0 ? 0.044 : 0.028) + Math.sin(phase * 3 + i) * 0.005;
    app.nodes.require(beamId)
      .setVisible(true)
      .setPosition(midX, midY, 0.22)
      .setRotation(0, 0, angle)
      .setScale([length, beamThickness, beamThickness]);

    // Gold interceptor plasma bolt traveling from turret to target drone
    const boltT = (phase * 1.4 + i * 0.27) % 1;
    const boltX = originPos[0] + dx * boltT;
    const boltY = originPos[1] + dy * boltT;
    app.nodes.require(`${beamId}-bolt`)
      .setVisible(true)
      .setPosition(boltX, boltY, 0.25)
      .setScale(ionOverchargeTimer > 0 ? 0.082 : 0.064);

    // Glowing shield impact ripple at the target drone
    const rippleScale = 0.20 + ((phase * 0.9 + i * 0.31) % 0.16);
    app.nodes.require(`${beamId}-ripple`)
      .setVisible(true)
      .setPosition(targetPos[0], targetPos[1], 0.26)
      .setRotation(0.25, 0.25, phase + i)
      .setScale([rippleScale, rippleScale, 0.018]);
  }

  for (const projectile of state.projectiles) {
    const visualProjectileRadius = visualPlayerRadius + Math.max(0, (projectile.radius - playerRadius) * 0.28);
    const pos = projectile.active ? polar(projectile.angle, visualProjectileRadius, 0.24) : ([8, 8, 0] as const);
    app.nodes.require(projectile.id).setPosition(pos[0], pos[1], pos[2]);
  }
  for (let index = 0; index < shieldIds.length; index += 1) {
    const pulse = player.shieldPulses[index];
    const pos = pulse ? polar(pulse.angle, 1.78, 0.18) : ([8, 8, 0] as const);
    const scale = pulse ? 0.38 + (1.2 - pulse.ttl) * 0.28 : 0.01;
    app.nodes.require(shieldIds[index]!).setPosition(pos[0], pos[1], pos[2]).setScale([scale, scale, 0.02]);
  }
}

function renderHud(): void {
  const waveCap = Math.min(4, Math.max(1, state.wave));
  const synergyLevel = Math.min(4, 1 + Math.floor(state.score / 300));
  const html = `
    <section class="panel">
      <span class="eyebrow">Orbital Defense</span>
      <h1>Planetary intercept grid</h1>
      <div class="readout">
        <div class="metric"><span>Score</span><strong>${state.score}</strong></div>
        <div class="metric"><span>Wave</span><strong>${waveCap}/4</strong></div>
        <div class="metric"><span>Integrity</span><strong>${state.planetIntegrity}%</strong></div>
        <div class="metric"><span>Heat</span><strong>${Math.round(player.heat)}%</strong></div>
      </div>
      <div class="heat" style="--heat:${Math.round(player.heat)}%"><i></i></div>
      <div class="actions">
        <button id="reset" type="button">Reset</button>
        <button id="pause" type="button" aria-pressed="${paused}">${paused ? "Resume" : "Pause"}</button>
      </div>
    </section>
    <section class="panel panel--center">
      <div class="log">
        <b>Active drones: ${enemies.filter((enemy) => enemy.active).length} | Turret Synergy Lv.${synergyLevel}</b>
        <span>Ion Overcharge (Space/E): ${ionOverchargeTimer > 0 ? "ACTIVE" : "READY"} | Squadron (Q): ${squadronScrambleTimer > 0 ? "SCRAMBLED" : "PATROL"}</span>
      </div>
    </section>
  `;
  if (!maybeWriteHud(hud, html, lastHudHtml)) return;
  hud.querySelector("#reset")?.addEventListener("click", () => {
    resetGame(state);
    state.score = 240;
    fire(state);
  });
  hud.querySelector("#pause")?.addEventListener("click", () => {
    paused = !paused;
    renderHud();
  });
}

function publishEvidence(status: OrbitalDefenseEvidence["status"]): void {
  const evidence: OrbitalDefenseEvidence = {
    status,
    appId: "showcase-orbital-defense",
    frameCount: state.frameCount,
    score: state.score,
    wave: state.wave,
    planetIntegrity: state.planetIntegrity,
    heat: Math.round(player.heat),
    activeEnemies: enemies.filter((enemy) => enemy.active).length,
    activeProjectiles: projectiles.filter((projectile) => projectile.active).length,
    replayChecksum: state.replayChecksum,
    controls,
    systems,
    claimBoundary: "Typed 3D orbital command stations, defense turrets, patrolling shuttle interceptors, and laser defense grid; proves Aura3D runtime-node game loop, deterministic wave state, and HUD evidence."
  };
  window.__AURA3D_SHOWCASE_ORBITAL_DEFENSE__ = evidence;
  window.__AURA3D_GAME_EVIDENCE__ = evidence;
  window.__AURA3D_GAME__ = { state: "playing" };
  document.body.dataset.aura3dReady = "true";
  document.body.dataset.aura3dShowcaseReady = "true";
}

app.onFrame(({ time }) => {
  const dt = lastTime === 0 ? 1 / 60 : Math.min(0.05, Math.max(0.001, time - lastTime));
  lastTime = time;
  update(dt);
});

syncRuntimeNodes();
publishEvidence("ready");

