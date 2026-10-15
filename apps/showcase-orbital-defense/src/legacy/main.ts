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
import { assets } from "../../../../src/aura-assets";
import "../styles.css";
import { maybeWriteHud } from "./hud-diff";
import {
  createWaveState,
  enemyIds,
  polar,
  playerRadius,
  projectileIds,
  resetGame,
  shieldIds,
  updateWaves,
  type EnemyState,
  type ProjectileState,
  type WaveState
} from "../gameplay/waves";

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
  "Space fires interceptors",
  "KeyQ places shield pulse",
  "KeyR resets deterministic wave",
  "KeyP pauses"
] as const;

const systems = [
  "one mounted Aura app",
  "runtime player/enemy/projectile nodes",
  "deterministic wave script",
  "input buffer and replay checksum",
  "heat and shield economy",
  "HUD evidence",
  "accessibility-safe pause/reset"
] as const;

function orbitalHash(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const appScene = scene()
  .background("#040915")
  .add(
    model(assets.orbitalPlanetGlobeMeshy, {
      name: "defended planet globe",
      role: "primaryWorld",
      scaleMode: "fit",
      targetMaxDimension: 2.35
    }).position(0, -1.175, 0)
  )
  .add(
    primitives.torus({
      name: "planetary defense orbital grid ring",
      material: material.emissive({
        color: "#082f49",
        emissive: "#38bdf8",
        emissiveIntensity: 0.65,
        opacity: 0.55
      })
    })
      .position(0, 0, -0.08)
      .scale([playerRadius, playerRadius, 0.012])
  )
  .add(
    model(assets.orbitalDefenseTurretMeshy, {
      name: "orbital defense turret alpha",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.76
    })
      .position(-2.45, 0.88, 0.18)
      .rotate(1.15, 1.32, -0.38)
  )
  .add(
    model(assets.gravityOrbitalRelayMeshy, {
      name: "orbital defense relay beta",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.68
    })
      .position(2.42, -1.02, 0.18)
      .rotate(-1.12, -1.28, 0.35)
  )
  .add(
    model(assets.gravityCargoContainerPodMeshy, {
      name: "orbital defense supply pod",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.48
    })
      .position(-1.92, -1.52, 0.24)
      .rotate(0.45, 0.95, 0.32)
  )
  .add(
    instances.sphere({
      name: "orbital-star-shell",
      material: material.emissive({ color: "#e2e8f0", emissive: "#93c5fd", emissiveIntensity: 0.75 }),
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
      targetMaxDimension: 0.88
    })
      .position(playerRadius, 0, 0.28)
      .rotate(0.35, 0.6, -0.2)
      .runtime(game.runtimeNode("player-interceptor"))
  )
  .add(
    primitives.torus({
      name: "player interceptor cyan shield halo",
      material: material.emissive({
        color: "#083344",
        emissive: "#22d3ee",
        emissiveIntensity: 1.45,
        opacity: 0.82
      })
    })
      .position(playerRadius, 0, 0.26)
      .scale([0.42, 0.42, 0.018])
      .runtime(game.runtimeNode("player-interceptor-shield"))
  )
  .add(
    primitives.sphere({
      name: "player interceptor thruster core",
      material: material.emissive({
        color: "#06b6d4",
        emissive: "#67e8f9",
        emissiveIntensity: 1.85
      })
    })
      .position(playerRadius, 0, 0.28)
      .scale(0.068)
      .runtime(game.runtimeNode("player-interceptor-thruster"))
  )
  .add(primitives.sphere({ name: "player aiming bead", material: material.emissive({ color: "#2b2109", emissive: "#facc15", emissiveIntensity: 1.25 }) }).position(playerRadius + 0.38, 0, 0.24).scale(0.055).runtime(game.runtimeNode("player-aim")))
  .add(lights.ambient({ intensity: 0.92, color: "#93c5fd" }))
  .add(lights.directional({ position: [2.6, 4.2, 5.6], intensity: 2.1, color: "#e0f2fe" }))
  .add(lights.directional({ position: [-3.8, -2.8, 4.8], intensity: 1.65, color: "#fb923c" }))
  .add(lights.directional({ position: [0.4, 5.2, -3.4], intensity: 1.45, color: "#38bdf8" }))
  .add(lights.point({ position: [-2.4, 2.2, 3.2], color: "#38bdf8", intensity: 2.6 }))
  .add(lights.point({ position: [2.6, -1.6, 3.2], color: "#fbbf24", intensity: 2.4 }))
  .add(lights.point({ position: [0, 2.6, 2.8], color: "#fb7185", intensity: 2.2 }))
  .add(lights.point({ position: [0, -2.6, 2.8], color: "#f97316", intensity: 2.2 }))
  .add(effects.bloom({ intensity: 0.16, color: "#38bdf8" }))
  .add(effects.fog({ density: 0.004, color: "#060d1d" }))
  .add(interactions.orbit())
  .camera(camera.perspective({ position: [0, -0.15, 5.85], target: [0, 0, 0], fov: 44 }));

let builtScene = appScene;
for (const [index, id] of enemyIds.entries()) {
  const isCrimsonVariant = index % 2 === 0;
  builtScene = builtScene
    .add(
      model(assets.orbitalStrikeDroneMeshy, {
        name: `${id} wave drone`,
        role: "enemy",
        scaleMode: "fit",
        targetMaxDimension: 0.74
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
        .scale([0.34, 0.34, 0.022])
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
        .scale(0.065)
        .runtime(game.runtimeNode(`${id}-core-beacon`))
    );
}
for (const id of projectileIds) {
  builtScene = builtScene.add(
    primitives.sphere({ name: `${id} interceptor bolt`, material: material.emissive({ color: "#112a2a", emissive: "#67e8f9", emissiveIntensity: 1.45 }) })
      .position(8, 8, 0)
      .scale(0.065)
      .runtime(game.runtimeNode(id))
  );
}
for (const id of shieldIds) {
  builtScene = builtScene.add(
    primitives.torus({ name: `${id} shield segment`, material: material.emissive({ color: "#11261f", emissive: "#75f2cf", emissiveIntensity: 1.15 }) })
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
    fire: ["Space"],
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
const enemies: readonly EnemyState[] = state.enemies;
const projectiles: readonly ProjectileState[] = state.projectiles;
const player = state.player;

let paused = false;
let lastTime = 0;

const hud = document.querySelector<HTMLElement>("#hud");
if (!hud) throw new Error("Orbital Defense requires #hud.");
const lastHudHtml = { value: undefined as string | undefined };
renderHud();

function update(dt: number): void {
  input.update(dt);
  if (input.pressed("pause")) paused = !paused;
  if (input.pressed("reset")) {
    resetGame(state);
    paused = false;
  }
  if (paused) {
    publishEvidence("ready");
    return;
  }

  updateWaves(state, dt, {
    rotate: input.axis("rotate"),
    fire: input.pressed("fire"),
    shield: input.pressed("shield")
  });

  syncRuntimeNodes();
  renderHud();
  publishEvidence("running");
}

function syncRuntimeNodes(): void {
  const playerPosition = polar(player.angle, playerRadius, 0.28);
  app.nodes.require("player-interceptor")
    .setPosition(playerPosition[0], playerPosition[1] - 0.24, playerPosition[2])
    .setRotation(0.35, 0.6, player.angle + Math.PI / 2 - 0.2);
  app.nodes.require("player-interceptor-shield")
    .setPosition(playerPosition[0], playerPosition[1], playerPosition[2] - 0.02)
    .setRotation(0.22, 0.35, player.angle);
  const thrusterPos = polar(player.angle - 0.08, playerRadius - 0.06, 0.28);
  app.nodes.require("player-interceptor-thruster")
    .setPosition(thrusterPos[0], thrusterPos[1], thrusterPos[2]);
  const aimPosition = polar(player.angle, playerRadius + 0.42, 0.24);
  app.nodes.require("player-aim").setPosition(aimPosition[0], aimPosition[1], aimPosition[2]);

  for (const enemy of state.enemies) {
    const pos = enemy.active ? polar(enemy.angle, enemy.radius, 0.18 + enemy.lane * 0.06) : ([8, 8, 0] as const);
    app.nodes.require(enemy.id)
      .setPosition(pos[0], enemy.active ? pos[1] - 0.22 : pos[1], pos[2])
      .setRotation(0.42, 0.52, -enemy.angle + Math.PI * 0.25);
    app.nodes.require(`${enemy.id}-core-ring`)
      .setPosition(pos[0], pos[1], pos[2] - 0.02)
      .setRotation(0.25, 0.2, -enemy.angle)
      .setVisible(enemy.active);
    app.nodes.require(`${enemy.id}-core-beacon`)
      .setPosition(pos[0], pos[1], pos[2] + 0.04)
      .setVisible(enemy.active);
  }
  for (const projectile of state.projectiles) {
    const pos = projectile.active ? polar(projectile.angle, projectile.radius, 0.24) : ([8, 8, 0] as const);
    app.nodes.require(projectile.id).setPosition(pos[0], pos[1], pos[2]);
  }
  for (let index = 0; index < shieldIds.length; index += 1) {
    const pulse = player.shieldPulses[index];
    const pos = pulse ? polar(pulse.angle, 2.04, 0.18) : ([8, 8, 0] as const);
    const scale = pulse ? 0.42 + (1.2 - pulse.ttl) * 0.34 : 0.01;
    app.nodes.require(shieldIds[index]!).setPosition(pos[0], pos[1], pos[2]).setScale([scale, scale, 0.02]);
  }
}

function renderHud(): void {
  const html = `
    <section class="panel">
      <span class="eyebrow">Orbital Defense</span>
      <h1>Planetary intercept grid</h1>
      <div class="readout">
        <div class="metric"><span>Score</span><strong>${state.score}</strong></div>
        <div class="metric"><span>Wave</span><strong>${state.wave}</strong></div>
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
        <b>Active drones: ${enemies.filter((enemy) => enemy.active).length}</b>
        <span>Interceptors: ${projectiles.filter((projectile) => projectile.active).length} | Shields: ${player.shieldPulses.length}</span>
      </div>
    </section>
  `;
  if (!maybeWriteHud(hud, html, lastHudHtml)) return;
  hud.querySelector("#reset")?.addEventListener("click", () => resetGame(state));
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
    claimBoundary: "Typed 3D drone/interceptor assets + instanced orbital starfield and asteroid belt; proves Aura3D runtime-node game loop, deterministic wave state, and HUD evidence."
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
