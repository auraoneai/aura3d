// Orbital Defense — rebuilt on the arena-shooter template scaffold.
// Single code path: every URL boots this module; the former legacy/v2
// dispatcher is deleted. The template's pooled drones/bolts, finite wave
// quotas and reset shape are kept, retuned to orbital identity: the player
// interceptor rides a station ring around the defense-core planet, fires
// radially outward, and drones converge on the core instead of the ship.
// A drone that reaches the core leaks integrity; integrity 0 loses, and
// clearing the final wave wins (the old route had neither terminal state).
// Deviations from the template, by necessity: the template imports the
// stub shell from the contracts entry, while this route mounts the real
// createGame shell (the Blockfall pilot pattern) so the HUD widgets,
// session lifecycle and evidence channel below are live; the template's
// free WASD movement becomes ring rotation; and two deterministic
// `?scenario=` openings (`low-integrity`, `final-wave`) exist so the
// lose/win paths are reachable in short scripted play — a scenario only
// chooses the opening state, every terminal state is still reached
// through the real update loop. Reset always returns to the standard
// wave-1 opening.
import {
  camera,
  game,
  instances,
  lights,
  looks,
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";
import { createGame, type GameHudWidgetSpec } from "@aura3d/engine/game";
import { assets } from "./aura-assets";

declare global {
  interface Window {
    __aura3dGameSnapshot?: OrbitalDefenseEvidence;
  }
}

type GameState = "playing" | "won" | "lost";

interface OrbitalDefenseEvidence {
  readonly framed: boolean;
  readonly frame: number;
  readonly state: GameState;
  readonly paused: boolean;
  readonly score: number;
  readonly wave: number;
  readonly wavesTotal: number;
  readonly integrity: number;
  readonly integrityMax: number;
  readonly enemiesAlive: number;
  readonly enemiesQueued: number;
  readonly boltsLive: number;
  readonly kills: number;
  readonly leaks: number;
  readonly shotsFired: number;
  readonly playerAngle: number;
  readonly look: { readonly id: string; readonly category: string };
  readonly camera: { readonly rig: string; readonly presented: boolean };
  readonly drawCalls: number;
  readonly ship: { readonly assetId: string; readonly url: string; readonly metres: readonly [number, number, number] };
  readonly core: { readonly assetId: string; readonly url: string };
  readonly assets: {
    readonly drone: { readonly assetId: string; readonly url: string };
    readonly typedAssets: number;
  };
  readonly events: readonly string[];
  readonly evidence: unknown;
}

// The look supplies the space backdrop, hard key light and contrast grade;
// the scene adds deck, ring, core, actors and an accent rim. Genre row
// (aura3d-browser-game): arena-shooter → space.
const LOOK_ID = "space" as const;

const PLANE_Y = 0.45;
const ORBIT_RADIUS = 3.4;
const SPAWN_RADIUS = 8.5;
const CORE_RADIUS = 1.4;
const WAVES_TOTAL = 3;

const TUNING = {
  rotateSpeed: 2.6,
  boltSpeed: 18,
  boltTtlSeconds: 0.8,
  fireCooldownSeconds: 0.22,
  spawnIntervalSeconds: 1.2,
  waveDroneBase: 2,
  droneSpeedBase: 1.5,
  droneSpeedPerWave: 0.3,
  integrityMax: 100,
  leakDamage: 10,
  boltHitRadius: 0.85,
  scorePerKill: 100,
  scorePerWave: 250
} as const;

const DRONE_POOL = 16;
const BOLT_POOL = 14;
const STAR_COUNT = 140;
const RING_TICKS = 28;

const CAMERA = {
  position: [0, 10.5, 8.5] as const,
  target: [0, PLANE_Y, 0] as const,
  fov: 50
} as const;

// Deterministic openings for scripted play (see header). Anything else in
// the `scenario` parameter is ignored and the standard opening runs.
const scenario = new URLSearchParams(window.location.search).get("scenario");
const START_INTEGRITY = scenario === "low-integrity" ? TUNING.leakDamage : TUNING.integrityMax;
const START_WAVE = scenario === "final-wave" ? WAVES_TOTAL : 1;
const START_QUOTA = scenario === "final-wave" ? 1 : undefined;

const inputOptions = {
  actions: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    fire: ["Space", "KeyJ"],
    pause: ["Escape", "KeyP"],
    reset: ["KeyR"]
  },
  bufferMs: 120
} as const;

const routeEvents = game.eventLog({ label: "orbital defense events", maxEvents: 18 });
const runtimeEffects = game.effects({ poolSize: 64 });
// HUD bindings as descriptor literals for the app.evidence channel; the
// live widgets are declared in the createGame `hud` option below and
// driven through hud.set every frame.
const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "score", id: "hud:score", label: "score", source: "app-state", valuePath: "appState.score", format: "number", a11yLabel: "score" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event log", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event log", debugOnly: true }
] as const;

interface DroneState { alive: boolean; x: number; z: number }
interface BoltState { live: boolean; x: number; z: number; dx: number; dz: number; ttl: number }

// Declared before createGame: the shell calls `scene` eagerly inside
// createGame(), and buildScene maps these pools into nodes — leaving them
// below the call site throws a TDZ error before the app mounts.
const drones: DroneState[] = Array.from({ length: DRONE_POOL }, () => ({ alive: false, x: 0, z: 0 }));
const bolts: BoltState[] = Array.from({ length: BOLT_POOL }, () => ({ live: false, x: 0, z: 0, dx: 0, dz: 0, ttl: 0 }));

// Latest published snapshot, read by the createGame evidence section below.
// `window.__aura3dGameSnapshot` stays the sole evidence global.
let latestSnapshot: OrbitalDefenseEvidence | undefined;

const orbitalGame = createGame({
  id: "orbital-defense",
  target: "#app",
  scene: () => buildScene(),
  input: inputOptions,
  hud: {
    theme: "sci-fi-telemetry",
    // Typed as the HudKit's real widget specs: the C-24 contract type
    // carries no meter `max`, but mountHud reads it as the full-scale
    // value (a meter without max > 0 is a gate failure, T0-29).
    widgets: [
      { id: "score", kind: "score", anchor: "top-left", label: "SCORE" },
      { id: "wave", kind: "score", anchor: "top", label: "WAVE" },
      { id: "integrity", kind: "meter", max: 100, anchor: "top-right", label: "CORE" },
      { id: "objective", kind: "objective", anchor: "bottom", label: "OBJECTIVE" }
    ] as readonly GameHudWidgetSpec[]
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: { orbitalDefense: () => latestSnapshot ?? { status: "unbound" } }
  }
});
const app = orbitalGame.app;
const input = orbitalGame.input;
if (!input) throw new Error("orbital-defense failed to create runtime-owned input.");
// Drive the createGame lifecycle the way the arena-shooter template does:
// start() transitions the session booting -> loading, starts the runtime,
// and ready() lands it in "playing" after the first presented draw.
orbitalGame.start();

const shipNode = app.nodes.require("player-ship");
const droneNodes = Array.from({ length: DRONE_POOL }, (_, i) => app.nodes.require(`drone-${i}`));
const boltNodes = Array.from({ length: BOLT_POOL }, (_, i) => app.nodes.require(`bolt-${i}`));

// Fixed wide rig over the whole arena: core, ring and spawn radius stay in
// frame at every viewport, so no per-frame camera tracking is needed.
app.camera?.use(
  camera.rigs.fromSpec({
    position: [...CAMERA.position],
    target: [...CAMERA.target],
    fov: CAMERA.fov
  })
);

const hudRoot = createHud();

let playerAngle = 0;
let score = 0;
let wave = 0;
let integrity: number = START_INTEGRITY;
let kills = 0;
let leaks = 0;
let shotsFired = 0;
let fireCooldown = 0;
let spawnTimer = 0;
let enemiesQueued = 0;
let spawnCounter = 0;
let paused = false;
let gameState: GameState = "playing";
let frame = 0;
let objective = "Defend the core. Rotate A/D, fire Space.";

function playerPosition(): [number, number] {
  return [Math.cos(playerAngle) * ORBIT_RADIUS, Math.sin(playerAngle) * ORBIT_RADIUS];
}

function startWave(next: number, quota?: number): void {
  wave = next;
  enemiesQueued = quota ?? TUNING.waveDroneBase + next;
  spawnTimer = 0.2; // first drone lands quickly, then every spawn interval
  routeEvents.push({ type: "wave", label: `wave ${wave} spawn x${enemiesQueued}`, frame: wave });
  objective = `Wave ${wave}/${WAVES_TOTAL}: stop ${enemiesQueued} drones before they reach the core`;
}

function spawnDrone(): void {
  const slot = drones.findIndex((d) => !d.alive);
  if (slot < 0) return;
  // The first drone of a run arrives on the player's starting bearing so
  // the opening shot is deterministic; later arrivals fan out on the
  // template's golden-angle sequence.
  const angle = spawnCounter === 0 ? 0 : (spawnCounter * 2.39996 + wave * 0.731) % (Math.PI * 2);
  spawnCounter += 1;
  drones[slot] = {
    alive: true,
    x: Math.cos(angle) * SPAWN_RADIUS,
    z: Math.sin(angle) * SPAWN_RADIUS
  };
}

function fireBolt(): void {
  const slot = bolts.findIndex((b) => !b.live);
  if (slot < 0) return;
  const aimX = Math.cos(playerAngle);
  const aimZ = Math.sin(playerAngle);
  const [shipX, shipZ] = playerPosition();
  bolts[slot] = {
    live: true,
    x: shipX + aimX * 1.0,
    z: shipZ + aimZ * 1.0,
    dx: aimX,
    dz: aimZ,
    ttl: TUNING.boltTtlSeconds
  };
  shotsFired += 1;
}

function resetGame(): void {
  score = 0;
  kills = 0;
  leaks = 0;
  shotsFired = 0;
  integrity = TUNING.integrityMax;
  playerAngle = 0;
  fireCooldown = 0;
  spawnCounter = 0;
  gameState = "playing";
  if (paused) setPaused(false);
  for (const d of drones) d.alive = false;
  for (const b of bolts) b.live = false;
  shipNode.setVisible(true);
  routeEvents.push({ type: "reset", label: "route reset" });
  objective = "Defend the core. Rotate A/D, fire Space.";
  startWave(1);
}

function setPaused(next: boolean): void {
  paused = next;
  if (paused) orbitalGame.session.pause();
  else orbitalGame.session.resume();
}

startWave(START_WAVE, START_QUOTA);
renderHud();
publishEvidence(0);

app.onFrame(({ dt }) => {
  const seconds = Math.min(0.05, Math.max(0, dt));
  frame += 1;

  if (input.pressed("pause") && gameState === "playing") setPaused(!paused);
  if (input.pressed("reset")) resetGame();

  if (!paused && gameState === "playing") {
    // Ring rotation: the interceptor stays on the station ring; its aim is
    // always radial, away from the core.
    if (input.held("left")) playerAngle -= TUNING.rotateSpeed * seconds;
    if (input.held("right")) playerAngle += TUNING.rotateSpeed * seconds;

    // Fire: bolts travel radially outward; cooldown caps the rate.
    fireCooldown -= seconds;
    if (input.held("fire") && fireCooldown <= 0) {
      fireCooldown = TUNING.fireCooldownSeconds;
      fireBolt();
    }

    // Wave spawner: a drone lands on cadence while the wave has queued ships.
    if (enemiesQueued > 0) {
      spawnTimer -= seconds;
      if (spawnTimer <= 0) {
        spawnTimer = TUNING.spawnIntervalSeconds;
        enemiesQueued -= 1;
        spawnDrone();
      }
    }

    // Drones converge on the core; one that arrives leaks integrity.
    const droneSpeed = TUNING.droneSpeedBase + (wave - 1) * TUNING.droneSpeedPerWave;
    for (let i = 0; i < drones.length; i += 1) {
      const drone = drones[i];
      if (!drone.alive) continue;
      const dist = Math.hypot(drone.x, drone.z);
      if (dist > 0.001) {
        drone.x -= (drone.x / dist) * droneSpeed * seconds;
        drone.z -= (drone.z / dist) * droneSpeed * seconds;
      }
      if (Math.hypot(drone.x, drone.z) <= CORE_RADIUS) {
        drone.alive = false;
        leaks += 1;
        integrity = Math.max(0, integrity - TUNING.leakDamage);
        runtimeEffects.hitSpark([drone.x, PLANE_Y + 0.3, drone.z], { ownerId: `drone-${i}`, intensity: 1.2 });
        routeEvents.push({ type: "leak", label: `core integrity ${integrity}`, severity: "warning" });
        if (integrity <= 0) {
          gameState = "lost";
          runtimeEffects.auraBurst([0, PLANE_Y + 0.4, 0], { ownerId: "defense-core", intensity: 1.6 });
          routeEvents.push({ type: "game-over", label: "core destroyed", severity: "error" });
          objective = "Core destroyed. Press R to restart.";
        }
      }
    }

    for (const bolt of bolts) {
      if (!bolt.live) continue;
      bolt.x += bolt.dx * TUNING.boltSpeed * seconds;
      bolt.z += bolt.dz * TUNING.boltSpeed * seconds;
      bolt.ttl -= seconds;
      if (bolt.ttl <= 0 || Math.hypot(bolt.x, bolt.z) > SPAWN_RADIUS + 2.5) {
        bolt.live = false;
        continue;
      }
      for (let i = 0; i < drones.length; i += 1) {
        const drone = drones[i];
        if (!drone.alive) continue;
        if (Math.hypot(drone.x - bolt.x, drone.z - bolt.z) < TUNING.boltHitRadius) {
          bolt.live = false;
          drone.alive = false;
          kills += 1;
          score += TUNING.scorePerKill;
          runtimeEffects.hitSpark([drone.x, PLANE_Y + 0.3, drone.z], { ownerId: `drone-${i}`, intensity: 0.9 });
          routeEvents.push({ type: "kill", label: `drone ${kills}`, severity: "success" });
          break;
        }
      }
    }

    if (gameState === "playing" && enemiesQueued === 0 && drones.every((d) => !d.alive)) {
      score += TUNING.scorePerWave * wave;
      routeEvents.push({ type: "clear", label: `wave ${wave} +${TUNING.scorePerWave * wave}`, severity: "success" });
      if (wave >= WAVES_TOTAL) {
        gameState = "won";
        routeEvents.push({ type: "victory", label: "all waves cleared", severity: "success" });
        objective = "All waves cleared — core held. Press R to replay.";
      } else {
        startWave(wave + 1);
      }
    }
  }

  // Present the actors: ship yaw tracks the radial aim, banked into turns.
  const [shipX, shipZ] = playerPosition();
  const turn = (input.held("right") ? 1 : 0) - (input.held("left") ? 1 : 0);
  shipNode
    .setPosition(shipX, PLANE_Y, shipZ)
    .setRotation(0, Math.atan2(Math.cos(playerAngle), Math.sin(playerAngle)), -turn * 0.32);
  for (let i = 0; i < drones.length; i += 1) {
    const drone = drones[i];
    const node = droneNodes[i];
    node.setVisible(drone.alive);
    if (drone.alive) {
      node.setPosition(drone.x, PLANE_Y, drone.z).setRotation(0, Math.atan2(-drone.x, -drone.z), 0);
    }
  }
  for (let i = 0; i < bolts.length; i += 1) {
    const bolt = bolts[i];
    const node = boltNodes[i];
    node.setVisible(bolt.live).setScale(bolt.live ? 1 : 0);
    if (bolt.live) node.setPosition(bolt.x, PLANE_Y, bolt.z).setRotation(0, Math.atan2(bolt.dx, bolt.dz), 0);
  }

  runtimeEffects.update(seconds);
  renderHud();
  publishEvidence(frame);
});

void orbitalGame.ready().then(() => {
  const diagnostics = app.diagnostics();
  document.body.dataset.aura3dReady = "true";
  document.body.dataset.aura3dRuntimeBackend = diagnostics.backend;
  document.body.dataset.aura3dDrawCalls = String(diagnostics.drawCalls);
}).catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
});

function buildScene() {
  // Stars: one instanced sphere draw — tiny emissive points on a backdrop
  // behind the arena (the space look keeps a solid dark background).
  const starTransforms = Array.from({ length: STAR_COUNT }, (_, i) => {
    const a = i * 2.39996;
    const r = 18 + (i % 9) * 2.4;
    return {
      position: [Math.cos(a) * r, 2 + ((i * 7) % 17) * 1.1, -14 - (i % 5) * 3] as readonly [number, number, number],
      scale: 0.05 + ((i * 13) % 5) * 0.018
    };
  });
  const starColors = Array.from({ length: STAR_COUNT }, (_, i) =>
    ["#dfe8ff", "#9db8ff", "#fff3d6", "#ffd6ec"][i % 4]
  );
  // Station ring: emissive ticks marking the interceptor's orbit.
  const ringTicks = Array.from({ length: RING_TICKS }, (_, i) => {
    const a = (i / RING_TICKS) * Math.PI * 2;
    return primitives.box({
      name: `ring tick ${i}`,
      size: [0.34, 0.06, 0.1],
      position: [Math.cos(a) * ORBIT_RADIUS, 0.02, Math.sin(a) * ORBIT_RADIUS],
      rotation: [0, -a, 0],
      material: material.emissive({ color: "#7cf4ff", emissive: "#7cf4ff", emissiveIntensity: 1.2, roughness: 0.4 })
    });
  });

  return scene()
    .add(looks.preset(LOOK_ID))
    // Deck plate: dark gloss so the key light and emissive bolts read.
    .add(
      primitives.box({
        name: "orbital deck",
        size: [(SPAWN_RADIUS + 2) * 2, 0.1, (SPAWN_RADIUS + 2) * 2],
        position: [0, -0.06, 0],
        material: material.pbr({ color: "#101524", roughness: 0.38, metalness: 0.55 }),
        receiveShadow: true
      })
    )
    .addMany(ringTicks)
    .add(
      instances.sphere({
        name: "starfield",
        size: 1,
        transforms: starTransforms,
        colors: starColors,
        material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.1 })
      })
    )
    // Defense core: the cratered planet GLB at the arena centre; its
    // scaled radius (~1.4 m) is the leak boundary drones must not reach.
    .add(
      model(assets.planet, { name: "defense core planet", castShadow: true, receiveShadow: true })
        .position(0, PLANE_Y, 0)
        .scale(3.2)
    )
    // Player interceptor: typed craft_racer GLB on the station ring.
    .add(
      model(assets.ship, { name: "player interceptor", castShadow: true })
        .position(ORBIT_RADIUS, PLANE_Y, 0)
        .scale(1)
        .runtime(game.runtimeNode("player-ship", { tags: ["player", "ship"] }))
    )
    // Drone + bolt pools (visibility-toggled at runtime).
    .addMany(
      drones.map((_, i) =>
        model(assets.drone, { name: `drone ${i}`, castShadow: true, visible: false })
          .position(0, PLANE_Y, 0)
          .runtime(game.runtimeNode(`drone-${i}`, { tags: ["drone", "enemy"] }))
      )
    )
    .addMany(
      bolts.map((_, i) =>
        // Scale-0 parked bolt: primitives have no mount-time `visible`, so
        // bolts park collapsed and the runtime handle brings them live.
        primitives.box({
          name: `bolt ${i}`,
          size: [0.07, 0.07, 0.62],
          position: [0, PLANE_Y, 0],
          scale: 0,
          material: material.emissive({ color: "#7cf4ff", emissive: "#7cf4ff", emissiveIntensity: 3.2, roughness: 0.3 })
        }).runtime(game.runtimeNode(`bolt-${i}`, { tags: ["bolt", "projectile"] }))
      )
    )
    .add(lights.directional({ name: "accent rim", color: "#9db8ff", intensity: 0.9 }).position(-6, 5, 8))
    .camera(
      camera.perspective({
        position: [...CAMERA.position],
        target: [...CAMERA.target],
        fov: CAMERA.fov
      })
    );
}

function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "orbital-defense-hud";
  root.style.cssText = [
    "position:absolute",
    "left:16px",
    "top:16px",
    "z-index:5",
    "min-width:310px",
    "font:600 13px/1.35 Inter, system-ui, sans-serif",
    "color:#eef3ff",
    "background:rgba(8,12,24,0.72)",
    "border:1px solid rgba(124,244,255,0.34)",
    "border-radius:8px",
    "padding:12px",
    "pointer-events:none"
  ].join(";");
  document.body.append(root);
  return root;
}

function renderHud(): void {
  // C-24 kit widgets (declared in the createGame `hud` option) mirror the
  // same state the route-local panel below renders.
  orbitalGame.hud.set("score", score);
  orbitalGame.hud.set("wave", wave);
  orbitalGame.hud.set("integrity", integrity);
  orbitalGame.hud.set("objective", objective);
  const alive = drones.reduce((acc, d) => acc + (d.alive ? 1 : 0), 0);
  hudRoot.innerHTML = [
    `<strong>Orbital Defense</strong>`,
    `<div>Score ${score} | Wave ${wave}/${WAVES_TOTAL} | Core ${integrity}/${TUNING.integrityMax}</div>`,
    `<div>Drones ${alive} live / ${enemiesQueued} queued | Kills ${kills} | State ${paused ? "paused" : gameState}</div>`,
    `<div>${objective}</div>`,
    `<div>Rotate A/D or arrows. Fire Space. Pause Esc. Reset R.</div>`
  ].join("");
}

function publishEvidence(currentFrame: number): void {
  const alive = drones.reduce((acc, d) => acc + (d.alive ? 1 : 0), 0);
  const boltsLive = bolts.reduce((acc, b) => acc + (b.live ? 1 : 0), 0);
  const eventLabels = routeEvents.snapshot().events.map((event) => `${event.type}:${event.label}`);
  const evidence = app.evidence({
    input,
    events: routeEvents,
    hud: hudBindings,
    appState: {
      score,
      objective,
      events: eventLabels
    },
    assets: {
      typedAssets: Object.keys(assets).length,
      missingAssets: []
    },
    source: { expectsGame: true }
  });
  const diagnostics = app.diagnostics();
  const snapshot: OrbitalDefenseEvidence = {
    // Framed once the renderer is submitting draw calls for the arena
    // inside the fixed wide rig.
    framed: diagnostics.drawCalls > 0,
    frame: currentFrame,
    state: gameState,
    paused,
    score,
    wave,
    wavesTotal: WAVES_TOTAL,
    integrity,
    integrityMax: TUNING.integrityMax,
    enemiesAlive: alive,
    enemiesQueued,
    boltsLive,
    kills,
    leaks,
    shotsFired,
    playerAngle: Number(playerAngle.toFixed(3)),
    look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
    camera: {
      rig: app.camera?.rig.id ?? "scene-perspective",
      presented: Boolean(app.camera?.presented())
    },
    drawCalls: diagnostics.drawCalls,
    ship: { assetId: assets.ship.id, url: assets.ship.url, metres: assets.ship.bounds },
    core: { assetId: assets.planet.id, url: assets.planet.url },
    assets: {
      drone: { assetId: assets.drone.id, url: assets.drone.url },
      typedAssets: Object.keys(assets).length
    },
    events: eventLabels,
    evidence
  };
  latestSnapshot = snapshot;
  window.__aura3dGameSnapshot = snapshot;
}
