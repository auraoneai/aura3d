// Arena shooter: WASD moves the ship on the deck plane, Space fires bolts at
// the aim direction (last movement direction; up-screen by default). Waves of
// drones spawn on a 1.8 s cadence and converge on the ship — contact costs one
// shield (shield 5, brief invulnerability between hits). Bolts are pooled
// primitives; drones are pooled typed GLB models toggled by the wave spawner,
// because runtime nodes must exist at scene-build time.
import {
  camera,
  game,
  instances,
  lights,
  looks,
  material,
  model,
  primitives,
  scene,
  ui,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";
import { createGame } from "@aura3d/engine/contracts";
import { assets } from "./aura-assets";

declare global {
  interface Window {
    __AURA3D_ARENA_SHOOTER__?: ArenaShooterEvidence;
    __AURA3D_GAME_SOURCE__?: unknown;
    __AURA3D_ROUTE_READY__?: unknown;
  }
}

interface ArenaShooterEvidence {
  readonly status: "playing" | "paused" | "game-over" | "wave-cleared";
  readonly frame: number;
  readonly score: number;
  readonly wave: number;
  readonly shield: number;
  readonly kills: number;
  readonly dronesAlive: number;
  readonly dronesQueued: number;
  readonly boltsLive: number;
  readonly ship: {
    readonly assetId: string;
    readonly url: string;
    readonly metres: readonly [number, number, number];
    readonly position: readonly [number, number, number];
    readonly aim: readonly [number, number];
  };
  readonly assets: {
    readonly drone: { readonly assetId: string; readonly url: string };
    readonly planet: { readonly assetId: string; readonly url: string };
    readonly typedAssets: number;
  };
  readonly waves: {
    readonly spawnIntervalSeconds: number;
    readonly shieldMax: number;
    readonly invulnSeconds: number;
  };
  readonly look: { readonly id: string; readonly category: string };
  readonly camera: { readonly rig: string; readonly pitchDegrees: number; readonly presented: boolean };
  readonly events: readonly string[];
  readonly evidence: { readonly entry: string };
}

// The look supplies the space backdrop (#000 background exception), hard key
// light and contrast grade; the scene adds deck, props, actors and an accent
// rim — no ambient/fill overrides. Genre row (aura3d-browser-game):
// arena-shooter → space.
const LOOK_ID = "space" as const;

const ARENA = {
  minX: -7,
  maxX: 7,
  minZ: -4.5,
  maxZ: 4.5,
  shipY: 0.45
} as const;

const TUNING = {
  shipSpeed: 5.6,
  boltSpeed: 18,
  boltTtlSeconds: 1.1,
  fireCooldownSeconds: 0.22,
  spawnIntervalSeconds: 1.8,
  waveDroneBase: 2,
  droneSpeedBase: 2.2,
  droneSpeedPerWave: 0.18,
  shieldMax: 5,
  invulnSeconds: 0.8,
  contactRadius: 0.95,
  boltHitRadius: 0.85,
  scorePerKill: 100,
  scorePerWave: 250
} as const;

const DRONE_POOL = 16;
const BOLT_POOL = 14;
const STAR_COUNT = 140;

// Top-down at a 60° pitch: the camera sits 60° above the deck plane behind
// the ship, so offset = (0, sin60, cos60) * distance.
const CAMERA = {
  distance: 5.4,
  pitchRadians: Math.PI / 3,
  targetLeadZ: -1.4,
  fov: 50
} as const;
const cameraYOffset = CAMERA.distance * Math.sin(CAMERA.pitchRadians); // ≈4.68
const cameraZOffset = CAMERA.distance * Math.cos(CAMERA.pitchRadians); // ≈2.7

const input = game.input({
  actions: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    up: ["KeyW", "ArrowUp"],
    down: ["KeyS", "ArrowDown"],
    fire: ["Space", "KeyJ"],
    pause: ["Escape"],
    reset: ["KeyR"]
  },
  axes: {
    moveX: { negative: "left", positive: "right" },
    moveZ: { negative: "up", positive: "down" }
  },
  bufferMs: 120,
  gamepad: true
});
const routeEvents = game.eventLog({ label: "arena shooter events", maxEvents: 18 });
const hudBindings = game.hud.bindings([
  game.hud.score({ valuePath: "appState.score" }),
  game.hud.objective({ valuePath: "appState.objective" }),
  game.hud.eventLog({ valuePath: "appState.events" }),
  game.hud.health({ actorId: "ship", label: "Shield", a11yLabel: "ship shield" }),
  game.hud.round({ label: "Wave", valuePath: "appState.wave", a11yLabel: "wave index" })
]);
const runtimeEffects = game.effects({ poolSize: 64 });

const auraGame = createGame({
  id: "arena-shooter",
  target: document.querySelector<HTMLElement>("#app")!,
  scene: buildScene,
  qualityRebuild: { flags: [] }
});
const app = auraGame.app;
auraGame.start();

const shipNode = app.nodes.require("player-ship");
const droneNodes = Array.from({ length: DRONE_POOL }, (_, i) => app.nodes.require(`drone-${i}`));
const boltNodes = Array.from({ length: BOLT_POOL }, (_, i) => app.nodes.require(`bolt-${i}`));

// Mount the C-22 camera surface once (fromSpec pins the presented pose); the
// per-frame setPose below keeps it tracking the ship at the fixed 60° pitch.
app.camera?.use(
  camera.rigs.fromSpec({
    position: [0, cameraYOffset, cameraZOffset],
    target: [0, ARENA.shipY, CAMERA.targetLeadZ],
    fov: CAMERA.fov
  })
);

ui.html(
  "#hud",
  `
    <section class="hud__panel hud__panel--status" aria-label="Arena status">
      <p>Aura3D game runtime starter</p>
      <h1>Arena Shooter</h1>
      <div class="hud__bars" aria-label="Ship status">
        <span class="hud__bar"><b>Score</b><span id="hud-score">0</span></span>
        <span class="hud__bar"><b>Shield</b><span id="hud-shield">█████</span></span>
        <span class="hud__bar"><b>Wave</b><span id="hud-wave">1</span></span>
        <span class="hud__bar"><b>Drones</b><span id="hud-drones">0</span></span>
      </div>
    </section>
    <section class="hud__panel hud__panel--meta" aria-label="Runtime evidence">
      <span id="hud-status">Wave 1 inbound</span>
      <span id="hud-kills">Kills 0</span>
      <span id="hud-frame">Frame 0</span>
      <span id="hud-camera">Camera 60° top-down</span>
      <span id="hud-assets">Typed assets 3/3</span>
    </section>
    <section id="hud-controls" class="hud__panel hud__panel--controls" aria-label="Controls">
      <button id="hud-pause-button" type="button" aria-pressed="false">Pause</button>
      <span class="hud__help">Move WASD/arrows — fire Space/J — pause Esc — reset R</span>
    </section>
  `
);
const hudScore = ui.text("#hud-score");
const hudShield = ui.text("#hud-shield");
const hudWave = ui.text("#hud-wave");
const hudDrones = ui.text("#hud-drones");
const hudStatus = ui.text("#hud-status");
const hudKills = ui.text("#hud-kills");
const hudFrame = ui.text("#hud-frame");
const hudCamera = ui.text("#hud-camera");
const hudAssets = ui.text("#hud-assets");
const pauseButton = ui.button("#hud-pause-button");

interface DroneState { alive: boolean; x: number; z: number }
interface BoltState { live: boolean; x: number; z: number; dx: number; dz: number; ttl: number }

const drones: DroneState[] = Array.from({ length: DRONE_POOL }, () => ({ alive: false, x: 0, z: 0 }));
const bolts: BoltState[] = Array.from({ length: BOLT_POOL }, () => ({ live: false, x: 0, z: 0, dx: 0, dz: 0, ttl: 0 }));

let shipX = 0;
let shipZ = 1.6;
let aimX = 0;
let aimZ = -1;
let score = 0;
let wave = 0;
let shield = TUNING.shieldMax;
let kills = 0;
let invuln = 0;
let fireCooldown = 0;
let spawnTimer = 0;
let dronesQueued = 0;
let paused = false;
let gameOver = false;
let frame = 0;
let status: ArenaShooterEvidence["status"] = "playing";
let objective = "Survive the waves. Move WASD/arrows, fire Space.";

const spawnAngleFor = (index: number) => (index * 2.39996 + wave * 0.731) % (Math.PI * 2);

function startWave(next: number): void {
  wave = next;
  dronesQueued = TUNING.waveDroneBase + next;
  spawnTimer = 0.2; // first drone lands quickly, then every 1.8 s
  routeEvents.push({ type: "wave", label: `wave ${wave} spawn x${dronesQueued}`, frame: wave });
  objective = `Wave ${wave}: clear ${dronesQueued} drones`;
}

function spawnDrone(): void {
  const slot = drones.findIndex((d) => !d.alive);
  if (slot < 0) return;
  const angle = spawnAngleFor(slot + dronesQueued);
  drones[slot] = {
    alive: true,
    x: Math.cos(angle) * (ARENA.maxX + 1.5),
    z: Math.sin(angle) * (ARENA.maxZ + 1.5)
  };
}

function fireBolt(): void {
  const slot = bolts.findIndex((b) => !b.live);
  if (slot < 0) return;
  bolts[slot] = {
    live: true,
    x: shipX + aimX * 1.1,
    z: shipZ + aimZ * 1.1,
    dx: aimX,
    dz: aimZ,
    ttl: TUNING.boltTtlSeconds
  };
}

function resetGame(): void {
  score = 0;
  kills = 0;
  shield = TUNING.shieldMax;
  invuln = 0;
  gameOver = false;
  shipX = 0;
  shipZ = 1.6;
  aimX = 0;
  aimZ = -1;
  for (const d of drones) d.alive = false;
  for (const b of bolts) b.live = false;
  shipNode.setVisible(true);
  routeEvents.push({ type: "reset", label: "route reset" });
  objective = "Survive the waves. Move WASD/arrows, fire Space.";
  startWave(1);
}

ui.onClick(pauseButton, () => setPaused(!paused));

startWave(1);
publishEvidence(0);

app.onFrame(({ dt }) => {
  input.update(dt);
  const seconds = Math.min(0.05, Math.max(0, dt));
  frame += 1;

  if (input.pressed("pause")) setPaused(!paused);
  if (input.pressed("reset")) resetGame();

  if (!paused && !gameOver) {
    // Move: ship stays inside the arena; aim tracks the last move direction.
    const moveX = input.axis("moveX");
    const moveZ = input.axis("moveZ");
    if (Math.abs(moveX) > 0.05 || Math.abs(moveZ) > 0.05) {
      const len = Math.hypot(moveX, moveZ) || 1;
      shipX += (moveX / len) * TUNING.shipSpeed * seconds;
      shipZ += (moveZ / len) * TUNING.shipSpeed * seconds;
      shipX = Math.max(ARENA.minX, Math.min(ARENA.maxX, shipX));
      shipZ = Math.max(ARENA.minZ, Math.min(ARENA.maxZ, shipZ));
      aimX = moveX / len;
      aimZ = moveZ / len;
    }

    // Fire: bolts travel the aim direction; cooldown caps the rate.
    fireCooldown -= seconds;
    if (input.held("fire") && fireCooldown <= 0) {
      fireCooldown = TUNING.fireCooldownSeconds;
      fireBolt();
    }

    // Wave spawner: a drone lands every 1.8 s while the wave has queued ships.
    if (dronesQueued > 0) {
      spawnTimer -= seconds;
      if (spawnTimer <= 0) {
        spawnTimer = TUNING.spawnIntervalSeconds;
        dronesQueued -= 1;
        spawnDrone();
      }
    }

    // Drones chase the ship; bolts kill on contact; drones cost a shield on
    // contact with the ship (brief invulnerability between hits).
    invuln = Math.max(0, invuln - seconds);
    const droneSpeed = TUNING.droneSpeedBase + (wave - 1) * TUNING.droneSpeedPerWave;
    for (let i = 0; i < drones.length; i += 1) {
      const drone = drones[i];
      if (!drone.alive) continue;
      const toX = shipX - drone.x;
      const toZ = shipZ - drone.z;
      const dist = Math.hypot(toX, toZ);
      if (dist > 0.001) {
        drone.x += (toX / dist) * droneSpeed * seconds;
        drone.z += (toZ / dist) * droneSpeed * seconds;
      }
      if (dist < TUNING.contactRadius && invuln <= 0) {
        shield -= 1;
        invuln = TUNING.invulnSeconds;
        drone.alive = false;
        runtimeEffects.hitSpark([shipX, ARENA.shipY + 0.3, shipZ], { ownerId: `drone-${i}`, intensity: 1.2 });
        routeEvents.push({ type: "hit", label: `shield ${shield}`, severity: "warning" });
        if (shield <= 0) {
          gameOver = true;
          shipNode.setVisible(false);
          runtimeEffects.auraBurst([shipX, ARENA.shipY + 0.4, shipZ], { ownerId: "player-ship", intensity: 1.6 });
          routeEvents.push({ type: "game-over", label: "ship destroyed", severity: "error" });
          objective = "Ship destroyed. Press R to restart.";
        }
      }
    }

    for (const bolt of bolts) {
      if (!bolt.live) continue;
      bolt.x += bolt.dx * TUNING.boltSpeed * seconds;
      bolt.z += bolt.dz * TUNING.boltSpeed * seconds;
      bolt.ttl -= seconds;
      if (bolt.ttl <= 0 || bolt.x < ARENA.minX - 2 || bolt.x > ARENA.maxX + 2 || bolt.z < ARENA.minZ - 2 || bolt.z > ARENA.maxZ + 2) {
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
          runtimeEffects.hitSpark([drone.x, ARENA.shipY + 0.3, drone.z], { ownerId: `drone-${i}`, intensity: 0.9 });
          routeEvents.push({ type: "kill", label: `drone ${kills}`, severity: "success" });
          break;
        }
      }
    }

    if (dronesQueued === 0 && drones.every((d) => !d.alive)) {
      score += TUNING.scorePerWave * wave;
      routeEvents.push({ type: "clear", label: `wave ${wave} +${TUNING.scorePerWave * wave}`, severity: "success" });
      startWave(wave + 1);
    }
  }

  // Present the actors: ship yaw tracks aim, banked into lateral movement.
  const shipYaw = Math.atan2(aimX, aimZ);
  const strafe = input.axis("moveX");
  shipNode
    .setPosition(shipX, ARENA.shipY, shipZ)
    .setRotation(0, shipYaw, -strafe * 0.32);
  for (let i = 0; i < drones.length; i += 1) {
    const drone = drones[i];
    const node = droneNodes[i];
    node.setVisible(drone.alive);
    if (drone.alive) {
      const yaw = Math.atan2(shipX - drone.x, shipZ - drone.z);
      node.setPosition(drone.x, ARENA.shipY, drone.z).setRotation(0, yaw, 0);
    }
  }
  for (let i = 0; i < bolts.length; i += 1) {
    const bolt = bolts[i];
    const node = boltNodes[i];
    node.setVisible(bolt.live).setScale(bolt.live ? 1 : 0);
    if (bolt.live) node.setPosition(bolt.x, ARENA.shipY, bolt.z).setRotation(0, Math.atan2(bolt.dx, bolt.dz), 0);
  }

  // 60° top-down camera: behind-above the ship, aimed just ahead of it.
  app.camera?.setPose(
    {
      position: [shipX * 0.7, cameraYOffset, shipZ + cameraZOffset],
      target: [shipX, ARENA.shipY, shipZ + CAMERA.targetLeadZ],
      fov: CAMERA.fov
    },
    { cut: true }
  );

  runtimeEffects.update(seconds);
  status = gameOver ? "game-over" : paused ? "paused" : drones.every((d) => !d.alive) && dronesQueued === 0 ? "wave-cleared" : "playing";
  renderHud();
  publishEvidence(frame);
});

void auraGame.ready().then(() => {
  const diagnostics = app.diagnostics();
  document.body.dataset.aura3dReady = "true";
  document.body.dataset.aura3dRuntimeBackend = diagnostics.backend;
  document.body.dataset.aura3dDrawCalls = String(diagnostics.drawCalls);
  window.__AURA3D_ROUTE_READY__ = { ready: true, diagnostics };
}).catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
});

function buildScene() {
  // Stars: one instanced sphere draw — 140 tiny emissive points on a backdrop
  // dome behind the arena (the space look keeps a solid #000 background).
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

  return scene()
    .add(looks.preset(LOOK_ID))
    // Deck plate: dark gloss so the key light and emissive bolts read; rim
    // rails carry the space-look accent.
    .add(
      primitives.box({
        name: "arena deck",
        size: [ARENA.maxX - ARENA.minX + 4, 0.1, ARENA.maxZ - ARENA.minZ + 4],
        position: [0, -0.06, 0],
        material: material.pbr({ color: "#101524", roughness: 0.38, metalness: 0.55 }),
        receiveShadow: true
      })
    )
    .addMany([
      primitives.box({
        name: "rim north",
        size: [ARENA.maxX - ARENA.minX + 4.4, 0.16, 0.14],
        position: [0, 0.02, ARENA.minZ - 2.07],
        material: material.emissive({ color: "#9db8ff", emissive: "#9db8ff", emissiveIntensity: 1.4, roughness: 0.4 })
      }),
      primitives.box({
        name: "rim south",
        size: [ARENA.maxX - ARENA.minX + 4.4, 0.16, 0.14],
        position: [0, 0.02, ARENA.maxZ + 2.07],
        material: material.emissive({ color: "#9db8ff", emissive: "#9db8ff", emissiveIntensity: 1.4, roughness: 0.4 })
      }),
      primitives.box({
        name: "rim west",
        size: [0.14, 0.16, ARENA.maxZ - ARENA.minZ + 4.4],
        position: [ARENA.minX - 2.07, 0.02, 0],
        material: material.emissive({ color: "#9db8ff", emissive: "#9db8ff", emissiveIntensity: 1.4, roughness: 0.4 })
      }),
      primitives.box({
        name: "rim east",
        size: [0.14, 0.16, ARENA.maxZ - ARENA.minZ + 4.4],
        position: [ARENA.maxX + 2.07, 0.02, 0],
        material: material.emissive({ color: "#9db8ff", emissive: "#9db8ff", emissiveIntensity: 1.4, roughness: 0.4 })
      }),
      instances.sphere({
        name: "starfield",
        size: 1,
        transforms: starTransforms,
        colors: starColors,
        material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.1 })
      })
    ])
    // Planet setpiece: the detailed meteor GLB scaled into a cratered body
    // hanging over the arena's far edge.
    .add(
      model(assets.planet, { name: "cratered planet", castShadow: false, receiveShadow: false })
        .position(-16, 9, -30)
        .scale(26)
    )
    // Player ship: typed craft_racer GLB, metre scale, feet-origin — it hovers
    // at ARENA.shipY so its own y offset lands the hull mid-air.
    .add(
      model(assets.ship, { name: "player ship", castShadow: true })
        .position(0, ARENA.shipY, 1.6)
        .scale(1)
        .runtime(game.runtimeNode("player-ship", { tags: ["player", "ship"] }))
    )
    // Drone + bolt pools (visibility-toggled at runtime).
    .addMany(
      drones.map((_, i) =>
        model(assets.drone, { name: `drone ${i}`, castShadow: true, visible: false })
          .position(0, ARENA.shipY, 0)
          .runtime(game.runtimeNode(`drone-${i}`, { tags: ["drone", "enemy"] }))
      )
    )
    .addMany(
      bolts.map((_, i) =>
        // scale-0 parked bolt: AuraPrimitiveOptions has no mount-time
        // `visible`, so bolts park collapsed and the runtime handle's
        // setVisible/setScale brings them live on the first frame they fly.
        primitives.box({
          name: `bolt ${i}`,
          size: [0.07, 0.07, 0.62],
          position: [0, ARENA.shipY, 0],
          scale: 0,
          material: material.emissive({ color: "#9db8ff", emissive: "#9db8ff", emissiveIntensity: 3.2, roughness: 0.3 })
        }).runtime(game.runtimeNode(`bolt-${i}`, { tags: ["bolt", "projectile"] }))
      )
    )
    .add(lights.directional({ name: "accent rim", color: "#9db8ff", intensity: 0.9 }).position(-6, 5, 8))
    .camera(
      camera.perspective({
        position: [0, cameraYOffset, cameraZOffset],
        target: [0, ARENA.shipY, CAMERA.targetLeadZ],
        fov: CAMERA.fov
      })
    );
}

function setPaused(next: boolean): void {
  paused = next;
  ui.setPressed(pauseButton, paused);
  ui.setText(pauseButton, paused ? "Resume" : "Pause");
  if (paused) auraGame.session.pause();
  else auraGame.session.resume();
}

function renderHud(): void {
  const alive = drones.reduce((acc, d) => acc + (d.alive ? 1 : 0), 0);
  ui.setText(hudScore, `${score}`);
  ui.setText(hudShield, "█".repeat(Math.max(0, shield)) + "░".repeat(TUNING.shieldMax - Math.max(0, shield)));
  ui.setText(hudWave, `${wave}`);
  ui.setText(hudDrones, `${alive} live / ${dronesQueued} queued`);
  ui.setText(hudStatus, gameOver ? "Game over — press R" : paused ? "Paused" : objective);
  ui.setText(hudKills, `Kills ${kills}`);
  ui.setText(hudFrame, `Frame ${app.runtime.frame}`);
  ui.setText(hudCamera, `Camera ${Math.round((CAMERA.pitchRadians * 180) / Math.PI)}° top-down`);
  ui.setText(hudAssets, `Typed assets ${Object.keys(assets).length}/3 — ${missingAssetNames() || "all mounted"}`);
}

function missingAssetNames(): string {
  return Object.entries(assets)
    .filter(([, asset]) => !asset.url)
    .map(([key]) => key)
    .join(", ");
}

function publishEvidence(currentFrame: number): void {
  const alive = drones.reduce((acc, d) => acc + (d.alive ? 1 : 0), 0);
  const boltsLive = bolts.reduce((acc, b) => acc + (b.live ? 1 : 0), 0);
  window.__AURA3D_ARENA_SHOOTER__ = {
    status,
    frame: currentFrame,
    score,
    wave,
    shield,
    kills,
    dronesAlive: alive,
    dronesQueued,
    boltsLive,
    ship: {
      assetId: assets.ship.id,
      url: assets.ship.url,
      metres: assets.ship.bounds,
      position: [Number(shipX.toFixed(3)), ARENA.shipY, Number(shipZ.toFixed(3))],
      aim: [Number(aimX.toFixed(3)), Number(aimZ.toFixed(3))]
    },
    assets: {
      drone: { assetId: assets.drone.id, url: assets.drone.url },
      planet: { assetId: assets.planet.id, url: assets.planet.url },
      typedAssets: Object.keys(assets).length
    },
    waves: {
      spawnIntervalSeconds: TUNING.spawnIntervalSeconds,
      shieldMax: TUNING.shieldMax,
      invulnSeconds: TUNING.invulnSeconds
    },
    look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
    camera: {
      rig: app.camera?.rig.id ?? "scene-perspective",
      pitchDegrees: Math.round((CAMERA.pitchRadians * 180) / Math.PI),
      presented: Boolean(app.camera?.presented())
    },
    events: routeEvents.snapshot().events.map((event) => `${event.type}:${event.label}`),
    evidence: { entry: "@aura3d/engine + @aura3d/engine/contracts createGame" }
  };
  window.__AURA3D_GAME_SOURCE__ = {
    route: window.location.pathname,
    template: "arena-shooter",
    package: "create-aura3d",
    publicEngineApi: true,
    look: { id: LOOK_ID, category: "space", biome: "space" },
    lifecycle: { kind: "createGame", usesCreateGame: true, runtimeEvidenceGlobal: "__AURA3D_ARENA_SHOOTER__" },
    typedAssetPattern: "src/aura-assets.ts",
    typedAssetKeys: ["ship", "drone", "planet"],
    pools: { drones: DRONE_POOL, bolts: BOLT_POOL, stars: STAR_COUNT },
    hud: hudBindings
  };
}
