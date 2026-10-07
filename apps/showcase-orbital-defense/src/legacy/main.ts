import {
  camera,
  createAuraApp,
  effects,
  game,
  interactions,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";
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

const appScene = scene()
  .background("#05080f")
  .add(primitives.sphere({ name: "defended planet core", material: material.pbr({ color: "#1a4862", roughness: 0.62, metallic: 0.04 }) }).scale(1.03))
  .add(primitives.sphere({ name: "planet atmosphere shell", material: material.emissive({ color: "#0b2230", emissive: "#2dd4bf" }) }).scale(1.13))
  .add(primitives.torus({ name: "inner orbital ring", material: material.emissive({ color: "#122536", emissive: "#38bdf8" }) }).rotate(1.5708, 0, 0).scale([2.05, 2.05, 0.03]))
  .add(primitives.torus({ name: "outer orbital ring", material: material.emissive({ color: "#201a33", emissive: "#a78bfa" }) }).rotate(1.5708, 0, 0).scale([3.1, 3.1, 0.025]))
  .add(primitives.box({ name: "north defense station", material: material.pbr({ color: "#d7ecff", roughness: 0.28, metallic: 0.55 }) }).position(0, 1.4, 0).scale([0.28, 0.14, 0.28]))
  .add(primitives.box({ name: "equator defense station", material: material.pbr({ color: "#b8f7d9", roughness: 0.34, metallic: 0.46 }) }).position(1.45, 0, 0).scale([0.14, 0.28, 0.28]))
  .add(primitives.sphere({ name: "player interceptor", material: material.emissive({ color: "#12261f", emissive: "#75f2cf" }) }).position(playerRadius, 0, 0).scale([0.18, 0.18, 0.28]).runtime(game.runtimeNode("player-interceptor")))
  .add(primitives.sphere({ name: "player aiming bead", material: material.emissive({ color: "#2b2109", emissive: "#facc15" }) }).position(playerRadius + 0.32, 0, 0).scale(0.07).runtime(game.runtimeNode("player-aim")))
  .add(lights.ambient({ intensity: 0.18 }))
  .add(lights.point({ position: [-2.8, 3.2, 3.4], color: "#75f2cf", intensity: 2.7 }))
  .add(lights.point({ position: [3.2, -1.6, 2.6], color: "#facc15", intensity: 1.6 }))
  .add(lights.directional({ position: [0.6, 4.4, 5], intensity: 1.1 }))
  .add(effects.bloom({ intensity: 0.32, color: "#75f2cf" }))
  .add(effects.fog({ density: 0.024, color: "#0d1726" }))
  .add(interactions.orbit())
  .camera(camera.perspective({ position: [0, 0.42, 6.6], target: [0, 0, 0], fov: 42 }));

let builtScene = appScene;
for (const id of enemyIds) {
  builtScene = builtScene.add(
    primitives.sphere({ name: `${id} wave drone`, material: material.emissive({ color: "#35111d", emissive: "#fb7185" }) })
      .position(8, 8, 0)
      .scale([0.16, 0.16, 0.22])
      .runtime(game.runtimeNode(id))
  );
}
for (const id of projectileIds) {
  builtScene = builtScene.add(
    primitives.sphere({ name: `${id} interceptor bolt`, material: material.emissive({ color: "#112a2a", emissive: "#67e8f9" }) })
      .position(8, 8, 0)
      .scale(0.055)
      .runtime(game.runtimeNode(id))
  );
}
for (const id of shieldIds) {
  builtScene = builtScene.add(
    primitives.torus({ name: `${id} shield segment`, material: material.emissive({ color: "#11261f", emissive: "#75f2cf" }) })
      .position(8, 8, 0)
      .rotate(1.5708, 0, 0)
      .scale([0.35, 0.35, 0.012])
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
  const playerPosition = polar(player.angle, playerRadius, 0.18);
  app.nodes.require("player-interceptor")
    .setPosition(playerPosition[0], playerPosition[1], playerPosition[2])
    .setRotation(0, 0, player.angle + Math.PI / 2);
  const aimPosition = polar(player.angle, playerRadius + 0.38, 0.18);
  app.nodes.require("player-aim").setPosition(aimPosition[0], aimPosition[1], aimPosition[2]);

  for (const enemy of state.enemies) {
    const pos = enemy.active ? polar(enemy.angle, enemy.radius, 0.06 + enemy.lane * 0.06) : ([8, 8, 0] as const);
    app.nodes.require(enemy.id).setPosition(pos[0], pos[1], pos[2]).setRotation(0, 0, -enemy.angle);
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

const lastHudHtml = { value: undefined as string | undefined };

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
  window.__AURA3D_SHOWCASE_ORBITAL_DEFENSE__ = {
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
    claimBoundary: "Procedural game assets; proves Aura3D runtime-node game loop, deterministic wave state, HUD evidence, and particle-style presentation, not a shipped commercial game."
  };
  document.body.dataset.aura3dShowcaseReady = "true";
}

app.onFrame(({ time }) => {
  const dt = lastTime === 0 ? 1 / 60 : Math.min(0.05, Math.max(0.001, time - lastTime));
  lastTime = time;
  update(dt);
});

syncRuntimeNodes();
publishEvidence("ready");
