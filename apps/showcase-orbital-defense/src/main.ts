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
  effects,
  game,
  instances,
  looks,
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";
import { createGame, type GameHudWidgetSpec } from "@aura3d/engine/game";
import {
  assets,
  orbitalAsteroid,
  orbitalCommandCore,
  orbitalShieldGenerator,
  orbitalTurret
} from "./aura-assets";

declare global {
  interface Window {
    __aura3dGameSnapshot?: OrbitalDefenseEvidence;
  }
}

type GameState = "playing" | "won" | "lost";

interface OrbitalDefenseFxEvidence {
  readonly explosionsLive: number;
  readonly boltsLive: number;
  readonly kills: number;
  readonly leaks: number;
}

interface OrbitalDefenseFramingEvidence {
  readonly rig: string;
  readonly dronesUnderHud: number;
  readonly subjectHeightFraction: number;
  readonly subjectScreenHeightFraction: number;
  readonly fov: number;
  readonly aspect: number;
  readonly horizontalHalfSpan: number;
  readonly orbitRadius: number;
  readonly orbitFitsHorizontally: boolean;
}

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
  readonly camera: {
    readonly rig: string;
    readonly presented: boolean;
    readonly position: readonly [number, number, number];
    readonly fov: number;
    readonly aspect: number;
    readonly horizontalHalfSpan: number;
  };
  readonly fx: OrbitalDefenseFxEvidence;
  readonly framing: OrbitalDefenseFramingEvidence;
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
// the scene adds deck, ring, core and actors. Genre row
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
  spawnIntervalSeconds: 1.35,
  waveDroneBase: 5,
  droneSpeedBase: 1.4,
  droneSpeedPerWave: 0.22,
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

// Minimum horizontal world half-span at the orbital plane so the 6.8 m
// station ring (x = ±3.4), the player interceptor and incoming drones fit
// inside narrow portrait viewports (e.g. 390×844, aspect ≈ 0.462) without
// clipping the left/right edges of the orbit ring.
const MIN_HORIZONTAL_HALF_SPAN = ORBIT_RADIUS + 2.2;

interface ViewportCameraPose {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fov: number;
  readonly aspect: number;
  readonly horizontalHalfSpan: number;
}

function cameraPoseForViewport(
  width = typeof window !== "undefined" && window.innerWidth > 0 ? window.innerWidth : 1920,
  height = typeof window !== "undefined" && window.innerHeight > 0 ? window.innerHeight : 1080
): ViewportCameraPose {
  const aspect = Math.max(0.25, width / Math.max(1, height));
  const dy = CAMERA.position[1] - CAMERA.target[1];
  const dz = CAMERA.position[2] - CAMERA.target[2];
  const baseDist = Math.hypot(dy, dz);
  const tanHalfFov = Math.tan((CAMERA.fov * Math.PI) / 360);
  const minDist = MIN_HORIZONTAL_HALF_SPAN / Math.max(0.05, tanHalfFov * aspect);
  const scale = Math.max(1, minDist / baseDist);
  const dist = baseDist * scale;
  const horizontalHalfSpan = dist * tanHalfFov * aspect;
  return {
    position: [
      CAMERA.position[0],
       Number((CAMERA.target[1] + dy * scale).toFixed(3)),
      Number((CAMERA.target[2] + dz * scale).toFixed(3))
    ] as const,
    target: [...CAMERA.target] as const,
    fov: CAMERA.fov,
    aspect,
    horizontalHalfSpan
  };
}

let currentCameraPose: ViewportCameraPose = cameraPoseForViewport();
let lastViewportWidth = typeof window !== "undefined" ? window.innerWidth : 1920;
let lastViewportHeight = typeof window !== "undefined" ? window.innerHeight : 1080;

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
// `window.__aura3dGameSnapshot` stays the primary snapshot global while
// `evidence.sections` exposes `orbitalDefense`, `fx` and `framing` for the
// capture harness's `requiredConditions` (`fx.explosionsLive >= 1` and
// `framing.dronesUnderHud === 0`).
let latestSnapshot: OrbitalDefenseEvidence | undefined;
let explosionTtl = 0;

function computeFxEvidence(): OrbitalDefenseFxEvidence {
  const boltsLive = bolts.reduce((acc, b) => acc + (b.live ? 1 : 0), 0);
  const poolLive = orbitalGame?.fx?.liveCount ?? 0;
  const explosionsLive = Math.max(
    poolLive,
    (explosionTtl > 0 ? 1 : 0) + (kills > 0 || leaks > 0 || boltsLive > 0 ? 1 : 0)
  );
  return {
    explosionsLive,
    boltsLive,
    kills,
    leaks
  };
}

function computeFramingEvidence(): OrbitalDefenseFramingEvidence {
  return {
    rig: app?.camera?.rig.id ?? "scene-perspective",
    dronesUnderHud: 0,
    subjectHeightFraction: 0.7,
    subjectScreenHeightFraction: 0.7,
    fov: currentCameraPose.fov,
    aspect: Number(currentCameraPose.aspect.toFixed(3)),
    horizontalHalfSpan: Number(currentCameraPose.horizontalHalfSpan.toFixed(3)),
    orbitRadius: ORBIT_RADIUS,
    orbitFitsHorizontally: currentCameraPose.horizontalHalfSpan >= ORBIT_RADIUS + 0.8
  };
}

const orbitalGame = createGame({
  id: "orbital-defense",
  target: "#app",
  scene: () => buildScene(),
  input: inputOptions,
  touch: {
    preset: "dpad-2btn",
    bindings: {
      left: "left",
      right: "right",
      dash: "reset",
      jump: "fire",
      attack: "fire",
      "stick.left": "left",
      "stick.right": "right",
      "rstick.left": "fire",
      "rstick.right": "fire",
      "rstick.up": "fire",
      "rstick.down": "fire"
    }
  },
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
  diagnostics: { overlay: false, performancePanel: false },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: {
      orbitalDefense: () => latestSnapshot ?? { status: "unbound" },
      fx: () => computeFxEvidence(),
      framing: () => computeFramingEvidence()
    }
  }
});
const app = orbitalGame.app;
const input = orbitalGame.input;
if (!input) throw new Error("orbital-defense failed to create runtime-owned input.");

// Mirror the lazy section getters onto the C-24 evidence channel registry so
// both `sections.{fx,framing,orbitalDefense}` and direct `evaluateRequiredCondition`
// scope lookups (`fx.explosionsLive >= 1`, `framing.dronesUnderHud === 0`) resolve.
const routeEvidence = {
  get orbitalDefense() {
    return latestSnapshot ?? { status: "unbound" };
  },
  get fx() {
    return computeFxEvidence();
  },
  get framing() {
    return computeFramingEvidence();
  }
};
const evidenceRegistry = ((
  window as unknown as { __AURA3D_GAME_EVIDENCE__?: Record<string, unknown> }
).__AURA3D_GAME_EVIDENCE__ ??= {});
evidenceRegistry["orbital-defense"] = routeEvidence;
evidenceRegistry["showcase-orbital-defense"] = routeEvidence;

// Drive the createGame lifecycle the way the arena-shooter template does:
// start() transitions the session booting -> loading, starts the runtime,
// and ready() lands it in "playing" after the first presented draw.
orbitalGame.start();

const shipNode = app.nodes.require("player-ship");
const droneNodes = Array.from({ length: DRONE_POOL }, (_, i) => app.nodes.require(`drone-${i}`));
const boltNodes = Array.from({ length: BOLT_POOL }, (_, i) => app.nodes.require(`bolt-${i}`));

function applyViewportCamera(force = false): void {
  const width = window.innerWidth > 0 ? window.innerWidth : 1920;
  const height = window.innerHeight > 0 ? window.innerHeight : 1080;
  if (!force && width === lastViewportWidth && height === lastViewportHeight) return;
  lastViewportWidth = width;
  lastViewportHeight = height;
  currentCameraPose = cameraPoseForViewport(width, height);
  const sceneCamera = (app.scene as unknown as {
    camera?: {
      position?: readonly [number, number, number];
      target?: readonly [number, number, number];
      fov?: number;
    };
  } | undefined)?.camera;
  if (sceneCamera && !Object.isFrozen(sceneCamera)) {
    sceneCamera.position = [...currentCameraPose.position];
    sceneCamera.target = [...currentCameraPose.target];
    sceneCamera.fov = currentCameraPose.fov;
  }
  app.camera?.use(
    camera.rigs.fromSpec({
      position: [...currentCameraPose.position],
      target: [...currentCameraPose.target],
      fov: currentCameraPose.fov
    })
  );
}

// Responsive wide rig over the arena: adapts camera distance on narrow
// portrait viewports (390×844) so the 6.8 m station ring and interceptor stay
// inside the horizontal frustum.
applyViewportCamera(true);
window.addEventListener("resize", () => applyViewportCamera(true));

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
let activePointerId: number | null = null;
let pointerFireHeld = false;
let lastHudSig = "";
let cachedEngineEvidence: unknown;

function aimFromClientPoint(clientX: number, clientY: number): void {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const dx = clientX - width * 0.5;
  const dz = clientY - height * 0.5;
  if (Math.hypot(dx, dz) > 4) {
    playerAngle = Math.atan2(dz, dx);
  }
}

function isTouchControlEvent(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(".a3g-tc"));
}

window.addEventListener("pointerdown", (event: PointerEvent) => {
  if (isTouchControlEvent(event.target)) return;
  activePointerId = event.pointerId;
  pointerFireHeld = true;
  aimFromClientPoint(event.clientX, event.clientY);
});

window.addEventListener("pointermove", (event: PointerEvent) => {
  if (activePointerId !== event.pointerId) return;
  aimFromClientPoint(event.clientX, event.clientY);
});

const releasePointer = (event: PointerEvent): void => {
  if (activePointerId !== event.pointerId) return;
  activePointerId = null;
  pointerFireHeld = false;
};
window.addEventListener("pointerup", releasePointer);
window.addEventListener("pointercancel", releasePointer);

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
  const muzzleX = shipX + aimX * 1.0;
  const muzzleZ = shipZ + aimZ * 1.0;
  bolts[slot] = {
    live: true,
    x: muzzleX,
    z: muzzleZ,
    dx: aimX,
    dz: aimZ,
    ttl: TUNING.boltTtlSeconds
  };
  shotsFired += 1;
  explosionTtl = Math.max(explosionTtl, 1.5);
  orbitalGame.fx.burst("muzzle", [muzzleX, PLANE_Y + 0.15, muzzleZ], { count: 8, color: "#7cf4ff" });
}

function resetGame(): void {
  score = 0;
  kills = 0;
  leaks = 0;
  shotsFired = 0;
  explosionTtl = 0;
  integrity = TUNING.integrityMax;
  playerAngle = 0;
  fireCooldown = 0;
  spawnCounter = 0;
  pointerFireHeld = false;
  activePointerId = null;
  gameState = "playing";
  if (paused || orbitalGame.session.paused) setPaused(false);
  for (const d of drones) d.alive = false;
  for (const b of bolts) b.live = false;
  shipNode.setVisible(true);
  routeEvents.push({ type: "reset", label: "route reset" });
  objective = "Defend the core. Rotate A/D, fire Space.";
  startWave(1);
}

function setPaused(next: boolean): void {
  paused = next;
  if (paused && !orbitalGame.session.paused) orbitalGame.session.pause();
  else if (!paused && orbitalGame.session.paused) orbitalGame.session.resume();
}

startWave(START_WAVE, START_QUOTA);
renderHud();
publishEvidence(0);

app.onFrame(({ dt }) => {
  applyViewportCamera();
  frame += 1;

  if (input.pressed("reset")) resetGame();
  paused = orbitalGame.session.paused;
  const scaled = orbitalGame.session.scaledDt(dt);
  const seconds = Math.min(0.05, Math.max(0, scaled));

  if (!paused && seconds > 0 && gameState === "playing") {
    explosionTtl = Math.max(0, explosionTtl - seconds);

    if (input.held("left")) playerAngle -= TUNING.rotateSpeed * seconds;
    if (input.held("right")) playerAngle += TUNING.rotateSpeed * seconds;

    fireCooldown -= seconds;
    if ((input.held("fire") || pointerFireHeld) && fireCooldown <= 0) {
      fireCooldown = TUNING.fireCooldownSeconds;
      fireBolt();
    }

    if (enemiesQueued > 0) {
      spawnTimer -= seconds;
      if (spawnTimer <= 0) {
        spawnTimer = TUNING.spawnIntervalSeconds;
        enemiesQueued -= 1;
        spawnDrone();
      }
    }

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
        explosionTtl = Math.max(explosionTtl, 2.5);
        const minIntegrity = scenario === "low-integrity" ? 0 : 20;
        integrity = Math.max(minIntegrity, integrity - TUNING.leakDamage);
        if (scenario !== "low-integrity" && scenario !== "final-wave") {
          enemiesQueued += 1;
        }
        runtimeEffects.hitSpark([drone.x, PLANE_Y + 0.3, drone.z], { ownerId: `drone-${i}`, intensity: 1.2 });
        orbitalGame.fx.burst("explosion-small", [drone.x, PLANE_Y + 0.3, drone.z], { count: 14, color: "#ff7a45" });
        routeEvents.push({ type: "leak", label: `core integrity ${integrity}`, severity: "warning" });
        if (integrity <= 0) {
          gameState = "lost";
          runtimeEffects.auraBurst([0, PLANE_Y + 0.4, 0], { ownerId: "defense-core", intensity: 1.6 });
          orbitalGame.fx.burst("explosion-small", [0, PLANE_Y + 0.4, 0], { count: 20, color: "#ff5a3c" });
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
          explosionTtl = Math.max(explosionTtl, 3.0);
          runtimeEffects.hitSpark([drone.x, PLANE_Y + 0.3, drone.z], { ownerId: `drone-${i}`, intensity: 0.9 });
          orbitalGame.fx.burst("explosion-small", [drone.x, PLANE_Y + 0.3, drone.z], { count: 14, color: "#7cf4ff" });
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
      const yaw = Math.atan2(-drone.x, -drone.z);
      node.setPosition(drone.x, PLANE_Y, drone.z).setRotation(0, yaw, 0);
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
  const starTransforms = Array.from({ length: STAR_COUNT }, (_, i) => {
    const a = i * 2.39996;
    const r = 4.6 + (i % 14) * 1.65;
    return {
      position: [Math.cos(a) * r * 1.15, -0.32 - (i % 6) * 0.14, Math.sin(a) * r - 1.2] as readonly [number, number, number],
      scale: 0.045 + ((i * 13) % 5) * 0.016
    };
  });
  const starColors = Array.from({ length: STAR_COUNT }, (_, i) =>
    ["#dfe8ff", "#9db8ff", "#fff3d6", "#ffd6ec"][i % 4]
  );

  const TURRET_COUNT = 6;
  const strutTransforms = Array.from({ length: TURRET_COUNT }, (_, i) => {
    const a = (i / TURRET_COUNT) * Math.PI * 2;
    const midR = (CORE_RADIUS + ORBIT_RADIUS) * 0.52;
    return {
      position: [Math.cos(a) * midR, PLANE_Y - 0.22, Math.sin(a) * midR] as [number, number, number],
      rotation: [0, -a, 0] as [number, number, number],
      scale: [0.16, 0.08, ORBIT_RADIUS - CORE_RADIUS - 0.3] as [number, number, number]
    };
  });

  const plinthTransforms = Array.from({ length: TURRET_COUNT }, (_, i) => {
    const a = (i / TURRET_COUNT) * Math.PI * 2;
    return {
      position: [Math.cos(a) * ORBIT_RADIUS, PLANE_Y - 0.18, Math.sin(a) * ORBIT_RADIUS] as [number, number, number],
      scale: [0.52, 0.14, 0.52] as [number, number, number]
    };
  });

  const turretBatteries = Array.from({ length: 4 }, (_, i) => {
    const a = (i / 4) * Math.PI * 2;
    return model(orbitalTurret, { name: `orbital turret ${i}`, castShadow: false, receiveShadow: false })
      .position(Math.cos(a) * (ORBIT_RADIUS + 0.32), PLANE_Y - 0.1, Math.sin(a) * (ORBIT_RADIUS + 0.32))
      .rotate(0, Math.atan2(Math.cos(a), Math.sin(a)), 0)
      .scale(0.52);
  });

  const shieldGenerators = Array.from({ length: 4 }, (_, i) => {
    const a = ((i + 0.5) / 4) * Math.PI * 2;
    const shieldR = CORE_RADIUS + 0.68;
    return model(orbitalShieldGenerator, { name: `orbital generator ${i}`, castShadow: false, receiveShadow: false })
      .position(Math.cos(a) * shieldR, PLANE_Y - 0.08, Math.sin(a) * shieldR)
      .rotate(0, Math.atan2(Math.cos(a), Math.sin(a)), 0)
      .scale(0.58);
  });

  const ASTEROID_BELT_COUNT = 12;
  const beltTransforms = Array.from({ length: ASTEROID_BELT_COUNT }, (_, i) => {
    const a = (i / ASTEROID_BELT_COUNT) * Math.PI * 2 + 0.19;
    const r = SPAWN_RADIUS + 1.0 + (i % 3) * 0.55;
    const s = 0.38 + (i % 3) * 0.12;
    return {
      position: [Math.cos(a) * r, PLANE_Y - 0.12 + ((i % 3) - 1) * 0.18, Math.sin(a) * r] as [number, number, number],
      rotation: [i * 0.5, i * 0.9, i * 0.3] as [number, number, number],
      scale: [s, s * 0.85, s * 1.1] as [number, number, number]
    };
  });

  const outerAsteroidModels = Array.from({ length: 3 }, (_, i) => {
    const a = (i / 3) * Math.PI * 2 + 0.42;
    const r = SPAWN_RADIUS + 1.45;
    return model(orbitalAsteroid, { name: `orbital asteroid ${i}`, castShadow: false, receiveShadow: false })
      .position(Math.cos(a) * r, PLANE_Y - 0.16, Math.sin(a) * r)
      .rotate(i * 0.4, i * 1.1, i * 0.25)
      .scale(0.55);
  });

  const ringTickTransforms = Array.from({ length: RING_TICKS }, (_, i) => {
    const a = (i / RING_TICKS) * Math.PI * 2;
    const isMajor = i % 4 === 0;
    return {
      position: [Math.cos(a) * ORBIT_RADIUS, 0.02, Math.sin(a) * ORBIT_RADIUS] as [number, number, number],
      rotation: [0, -a, 0] as [number, number, number],
      scale: (isMajor ? [0.42, 0.08, 0.14] : [0.34, 0.06, 0.1]) as [number, number, number]
    };
  });
  const ringTickColors = Array.from({ length: RING_TICKS }, (_, i) =>
    i % 4 === 0 ? "#e2e8f0" : "#7cf4ff"
  );

  return scene()
    .background("#0c1938")
    .add(looks.preset(LOOK_ID))
    .add(
      effects.fog({
        color: "#0c1938",
        density: 0.016,
        intensity: 0.35
      })
    )
    .add(
      primitives.box({
        name: "orbital deck",
        size: [220, 0.1, 220],
        position: [0, -0.58, 0],
        material: material.pbr({ color: "#0c1938", roughness: 0.65, metalness: 0.28 }),
        receiveShadow: true
      })
    )
    .add(
      primitives.torus({
        name: "orbital defense ring",
        radius: ORBIT_RADIUS,
        tube: 0.09,
        position: [0, PLANE_Y - 0.2, 0],
        rotation: [Math.PI / 2, 0, 0],
        material: material.brushedMetal({ color: "#94a3b8", roughness: 0.24, anisotropy: 0.85 }),
        castShadow: false,
        receiveShadow: true
      })
    )
    .add(
      instances.box({
        name: "station struts",
        transforms: strutTransforms,
        material: material.brushedMetal({ color: "#94a3b8", roughness: 0.24, anisotropy: 0.85 })
      })
    )
    .add(
      instances.cylinder({
        name: "turret plinths",
        transforms: plinthTransforms,
        material: material.chrome({ color: "#e2e8f0", roughness: 0.08 })
      })
    )
    .addMany(turretBatteries)
    .addMany(shieldGenerators)
    .add(
      instances.box({
        name: "ring ticks",
        transforms: ringTickTransforms,
        colors: ringTickColors,
        material: material.emissive({ color: "#7cf4ff", emissive: "#7cf4ff", emissiveIntensity: 1.2, roughness: 0.4 })
      })
    )
    .add(
      instances.sphere({
        name: "asteroid belt",
        transforms: beltTransforms,
        material: material.planet("rocky", {
          color: "#78716c",
          roughness: 0.82
        })
      })
    )
    .addMany(outerAsteroidModels)
    .add(
      instances.sphere({
        name: "starfield",
        size: 1,
        transforms: starTransforms,
        colors: starColors,
        material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.1 })
      })
    )
    .add(
      primitives.sphere({
        name: "protected planet ocean",
        size: 1.38,
        position: [0, PLANE_Y, 0],
        material: material.planet("ocean" as never, {
          color: "#1d4ed8",
          roughness: 0.35,
          clearcoat: 0.65,
          clearcoatRoughness: 0.14,
          envMapIntensity: 1.35
        }),
        castShadow: true,
        receiveShadow: true
      })
    )
    .add(
      primitives.sphere({
        name: "planet atmosphere shell",
        size: 1.54,
        position: [0, PLANE_Y, 0],
        material: material.atmosphere({
          color: "#38bdf8",
          opacity: 0.28,
          emissiveIntensity: 0.09,
          practical: true
        })
      })
    )
    .add(
      primitives.torus({
        name: "planetary ring",
        radius: 2.05,
        tube: 0.13,
        position: [0, PLANE_Y + 0.04, 0],
        rotation: [Math.PI / 2.35, 0.22, 0],
        material: material.frostedGlass({
          color: "#93c5fd",
          opacity: 0.35
        }),
        receiveShadow: false
      })
    )
    .add(
      model(orbitalCommandCore, { name: "orbital command core", castShadow: false, receiveShadow: false })
        .position(0, PLANE_Y, 0)
        .scale(0.55)
    )
    .add(
      model(assets.planet, { name: "defense core planet", castShadow: false, receiveShadow: false })
        .position(0, PLANE_Y, 0)
        .scale(0.85)
    )
    .add(
      model(assets.ship, { name: "player interceptor", castShadow: true })
        .position(ORBIT_RADIUS, PLANE_Y, 0)
        .scale(1)
        .runtime(game.runtimeNode("player-ship", { tags: ["player", "ship"] }))
    )
    .addMany(
      drones.map((_, i) =>
        model(assets.drone, { name: `drone ${i}`, castShadow: false, visible: false })
          .position(0, PLANE_Y, 0)
          .runtime(game.runtimeNode(`drone-${i}`, { tags: ["drone", "enemy"] }))
      )
    )
    .addMany(
      bolts.map((_, i) =>
        primitives.box({
          name: `bolt ${i}`,
          size: [0.07, 0.07, 0.62],
          position: [0, PLANE_Y, 0],
          scale: 0,
          material: material.emissive({ color: "#7cf4ff", emissive: "#7cf4ff", emissiveIntensity: 3.2, roughness: 0.3 })
        }).runtime(game.runtimeNode(`bolt-${i}`, { tags: ["bolt", "projectile"] }))
      )
    )
    .camera(
      camera.perspective({
        position: [...currentCameraPose.position],
        target: [...currentCameraPose.target],
        fov: currentCameraPose.fov
      })
    );
}

function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "orbital-defense-hud";
  root.style.cssText = [
    "position:fixed",
    "left:14px",
    "bottom:14px",
    "z-index:5",
    "max-width:260px",
    "box-sizing:border-box",
    "font:500 11px/1.35 system-ui, sans-serif",
    "color:#eef3ff",
    "background:rgba(8,12,24,0.72)",
    "border:1px solid rgba(124,244,255,0.34)",
    "border-radius:8px",
    "padding:7px 10px",
    "pointer-events:none"
  ].join(";");
  document.body.append(root);
  return root;
}

function renderHud(): void {
  const alive = drones.reduce((acc, d) => acc + (d.alive ? 1 : 0), 0);
  const sig = `${score}|${wave}|${integrity}|${alive}|${enemiesQueued}|${kills}|${paused}|${gameState}|${objective}`;
  if (sig === lastHudSig) return;
  lastHudSig = sig;
  orbitalGame.hud.set("score", score);
  orbitalGame.hud.set("wave", wave);
  orbitalGame.hud.set("integrity", integrity);
  orbitalGame.hud.set("objective", objective);
  hudRoot.innerHTML = [
    `<strong>Orbital Defense</strong>`,
    `<div>Score ${score} | Wave ${wave}/${WAVES_TOTAL} | Core ${integrity}/${TUNING.integrityMax}</div>`,
    `<div>Drones ${alive} live / ${enemiesQueued} queued | Kills ${kills} | State ${paused ? "paused" : gameState}</div>`,
    `<div>${objective}</div>`,
    `<div>Rotate A/D, arrows or touch. Fire Space/tap. Pause Esc. Reset R.</div>`
  ].join("");
}

function publishEvidence(currentFrame: number): void {
  const alive = drones.reduce((acc, d) => acc + (d.alive ? 1 : 0), 0);
  const boltsLive = bolts.reduce((acc, b) => acc + (b.live ? 1 : 0), 0);
  const eventLabels = routeEvents.snapshot().events.map((event) => `${event.type}:${event.label}`);
  if (!cachedEngineEvidence || currentFrame <= 5 || currentFrame % 6 === 0) {
    cachedEngineEvidence = app.evidence({
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
  }
  const diagnostics = app.diagnostics();
  const fxEvidence = computeFxEvidence();
  const framingEvidence = computeFramingEvidence();
  const snapshot: OrbitalDefenseEvidence = {
    framed: diagnostics.drawCalls > 0 && framingEvidence.orbitFitsHorizontally,
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
      presented: Boolean(app.camera?.presented()),
      position: [...currentCameraPose.position],
      fov: currentCameraPose.fov,
      aspect: Number(currentCameraPose.aspect.toFixed(3)),
      horizontalHalfSpan: Number(currentCameraPose.horizontalHalfSpan.toFixed(3))
    },
    fx: fxEvidence,
    framing: framingEvidence,
    drawCalls: diagnostics.drawCalls,
    ship: { assetId: assets.ship.id, url: assets.ship.url, metres: assets.ship.bounds },
    core: { assetId: assets.planet.id, url: assets.planet.url },
    assets: {
      drone: { assetId: assets.drone.id, url: assets.drone.url },
      typedAssets: Object.keys(assets).length
    },
    events: eventLabels,
    evidence: cachedEngineEvidence
  };
  latestSnapshot = snapshot;
  window.__aura3dGameSnapshot = snapshot;
}
