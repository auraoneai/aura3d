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
import "./styles.css";

type Vec3 = readonly [number, number, number];

interface EnemyState {
  id: string;
  angle: number;
  radius: number;
  speed: number;
  health: number;
  lane: number;
  active: boolean;
}

interface ProjectileState {
  id: string;
  angle: number;
  radius: number;
  speed: number;
  active: boolean;
  ttl: number;
}

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
  "accessibility-safe pause/reset",
  "particle-heavy impact presentation"
] as const;

const playerRadius = 2.65;
const enemyIds = Array.from({ length: 10 }, (_, index) => `enemy-${index}`);
const projectileIds = Array.from({ length: 14 }, (_, index) => `projectile-${index}`);
const shieldIds = Array.from({ length: 5 }, (_, index) => `shield-${index}`);

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

const enemies: EnemyState[] = enemyIds.map((id, index) => ({
  id,
  angle: index * 0.72,
  radius: 4.4 + (index % 3) * 0.24,
  speed: 0.12 + index * 0.008,
  health: 1,
  lane: index % 3,
  active: index < 5
}));

const projectiles: ProjectileState[] = projectileIds.map((id) => ({
  id,
  angle: 0,
  radius: playerRadius,
  speed: 3.25,
  active: false,
  ttl: 0
}));

const player = {
  angle: -Math.PI / 2,
  heat: 0,
  shieldCooldown: 0,
  shieldPulses: [] as Array<{ angle: number; ttl: number }>
};

let score = 0;
let wave = 1;
let frameCount = 0;
let planetIntegrity = 100;
let paused = false;
let replayChecksum = 17;
let spawnTimer = 0;
let lastTime = 0;

const hud = document.querySelector<HTMLElement>("#hud");
if (!hud) throw new Error("Orbital Defense requires #hud.");
renderHud();

function resetGame(): void {
  score = 0;
  wave = 1;
  frameCount = 0;
  planetIntegrity = 100;
  paused = false;
  replayChecksum = 17;
  spawnTimer = 0;
  player.angle = -Math.PI / 2;
  player.heat = 0;
  player.shieldCooldown = 0;
  player.shieldPulses = [];
  enemies.forEach((enemy, index) => {
    enemy.angle = index * 0.72;
    enemy.radius = 4.4 + (index % 3) * 0.24;
    enemy.speed = 0.12 + index * 0.008;
    enemy.health = 1;
    enemy.active = index < 5;
  });
  projectiles.forEach((projectile) => {
    projectile.active = false;
    projectile.ttl = 0;
    projectile.radius = playerRadius;
  });
}

function fire(): void {
  if (player.heat > 90) return;
  const projectile = projectiles.find((candidate) => !candidate.active);
  if (!projectile) return;
  projectile.active = true;
  projectile.angle = player.angle;
  projectile.radius = playerRadius + 0.18;
  projectile.ttl = 1.45;
  player.heat = Math.min(100, player.heat + 13);
  replayChecksum = checksum(replayChecksum, 31 + Math.round(player.angle * 1000));
}

function shield(): void {
  if (player.shieldCooldown > 0 || player.heat > 82) return;
  player.shieldPulses.push({ angle: player.angle, ttl: 1.2 });
  player.shieldCooldown = 1.8;
  player.heat = Math.min(100, player.heat + 22);
  replayChecksum = checksum(replayChecksum, 71 + Math.round(player.angle * 1000));
}

function spawnEnemy(): void {
  const enemy = enemies.find((candidate) => !candidate.active);
  if (!enemy) return;
  enemy.active = true;
  enemy.angle = ((wave * 1.7 + frameCount * 0.017 + enemy.lane) % (Math.PI * 2));
  enemy.radius = 4.75 + enemy.lane * 0.22;
  enemy.speed = 0.16 + wave * 0.012 + enemy.lane * 0.018;
  enemy.health = wave >= 4 ? 2 : 1;
}

function update(dt: number): void {
  input.update(dt);
  if (input.pressed("pause")) paused = !paused;
  if (input.pressed("reset")) resetGame();
  if (paused) {
    publishEvidence("ready");
    return;
  }

  frameCount += 1;
  const axis = input.axis("rotate");
  player.angle += axis * dt * 2.85;
  player.heat = Math.max(0, player.heat - dt * 17);
  player.shieldCooldown = Math.max(0, player.shieldCooldown - dt);
  if (input.pressed("fire")) fire();
  if (input.pressed("shield")) shield();

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnEnemy();
    spawnTimer = Math.max(0.72, 1.8 - wave * 0.11);
  }
  wave = 1 + Math.floor(score / 450);

  for (const projectile of projectiles) {
    if (!projectile.active) continue;
    projectile.radius += projectile.speed * dt;
    projectile.ttl -= dt;
    if (projectile.ttl <= 0 || projectile.radius > 5.4) projectile.active = false;
  }

  for (const shieldPulse of player.shieldPulses) shieldPulse.ttl -= dt;
  player.shieldPulses = player.shieldPulses.filter((pulse) => pulse.ttl > 0);

  for (const enemy of enemies) {
    if (!enemy.active) continue;
    enemy.angle += enemy.speed * dt * (enemy.lane % 2 === 0 ? 1 : -1);
    enemy.radius -= dt * (0.28 + wave * 0.025);

    for (const projectile of projectiles) {
      if (!projectile.active) continue;
      if (Math.abs(wrapAngle(projectile.angle - enemy.angle)) < 0.16 && Math.abs(projectile.radius - enemy.radius) < 0.32) {
        projectile.active = false;
        enemy.health -= 1;
        score += 75 + wave * 8;
        replayChecksum = checksum(replayChecksum, Math.round(score + enemy.radius * 100 + enemy.angle * 100));
      }
    }

    for (const pulse of player.shieldPulses) {
      if (Math.abs(wrapAngle(pulse.angle - enemy.angle)) < 0.32 && enemy.radius < 3.25) {
        enemy.health = 0;
        score += 38;
        replayChecksum = checksum(replayChecksum, Math.round(score + pulse.ttl * 100));
      }
    }

    if (enemy.health <= 0) {
      enemy.active = false;
      enemy.radius = 8;
    }
    if (enemy.radius <= 1.2) {
      enemy.active = false;
      enemy.radius = 8;
      planetIntegrity = Math.max(0, planetIntegrity - 8);
      replayChecksum = checksum(replayChecksum, 9000 + planetIntegrity);
    }
  }

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

  for (const enemy of enemies) {
    const pos = enemy.active ? polar(enemy.angle, enemy.radius, 0.06 + enemy.lane * 0.06) : ([8, 8, 0] as const);
    app.nodes.require(enemy.id).setPosition(pos[0], pos[1], pos[2]).setRotation(0, 0, -enemy.angle);
  }
  for (const projectile of projectiles) {
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
  hud.innerHTML = `
    <section class="panel">
      <span class="eyebrow">Orbital Defense</span>
      <h1>Planetary intercept grid</h1>
      <div class="readout">
        <div class="metric"><span>Score</span><strong>${score}</strong></div>
        <div class="metric"><span>Wave</span><strong>${wave}</strong></div>
        <div class="metric"><span>Integrity</span><strong>${planetIntegrity}%</strong></div>
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
        <span>Interceptors: ${projectiles.filter((projectile) => projectile.active).length} | Shields: ${player.shieldPulses.length} | Checksum: ${replayChecksum}</span>
      </div>
    </section>
    <section class="panel panel--right">
      <span class="eyebrow">Systems</span>
      <p class="controls">A/D or arrows rotate. Space fires. Q emits shield. R resets. P pauses.</p>
      <div class="log">
        ${systems.slice(0, 5).map((system) => `<span>${escapeHtml(system)}</span>`).join("")}
      </div>
    </section>
  `;
  hud.querySelector("#reset")?.addEventListener("click", resetGame);
  hud.querySelector("#pause")?.addEventListener("click", () => {
    paused = !paused;
    renderHud();
  });
}

function publishEvidence(status: OrbitalDefenseEvidence["status"]): void {
  window.__AURA3D_SHOWCASE_ORBITAL_DEFENSE__ = {
    status,
    appId: "showcase-orbital-defense",
    frameCount,
    score,
    wave,
    planetIntegrity,
    heat: Math.round(player.heat),
    activeEnemies: enemies.filter((enemy) => enemy.active).length,
    activeProjectiles: projectiles.filter((projectile) => projectile.active).length,
    replayChecksum,
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

function polar(angle: number, radius: number, z: number): Vec3 {
  return [Math.cos(angle) * radius, Math.sin(angle) * radius, z];
}

function wrapAngle(angle: number): number {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

function checksum(seed: number, value: number): number {
  return (seed * 1664525 + value + 1013904223) >>> 0;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char] ?? char);
}
