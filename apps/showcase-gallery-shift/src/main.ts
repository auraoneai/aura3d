// Gallery Shift — rebuilt single-path on the salvaged vision core.
// Every URL boots this module; the former legacy/v2 dispatcher is deleted.
//
// PORT (B5): `src/gameplay/{vision,guard,thief,floor}.ts` travel WHOLE from
// the trashed route — floor.ts included (see art/direction.ts note): it
// imports nothing but public `physics` and carries the Rapier builder whose
// real `world.raycast` occlusion is vision.ts's headline proof. Only
// `gallery-world-candidate.ts` (the GLB-interior catalog binding) and the
// v2 scene were trashed. The museum interior below is fresh construction
// from the salvaged FloorLayout rects — the same rects that build the
// physics colliders — rendered with the two typed Quaternius props.
import {
  camera,
  game,
  looks,
  material,
  model,
  scene,
  type AuraNodeInput,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";
import { createGame } from "@aura3d/engine/game";
import { assets } from "./aura-assets";
import {
  createFloorWorld,
  FLOOR_LAYOUTS,
  layoutCircles,
  layoutRects,
  type FloorLayout,
  type FloorWorld
} from "./gameplay/floor";
import { GuardAgent } from "./gameplay/guard";
import { ThiefPlayer, type ThiefGait } from "./gameplay/thief";
import {
  advanceDetection,
  ALERT_THRESHOLD,
  brightnessAt,
  cameraYawAt,
  CAMERA_HALF_FOV,
  CAUGHT_THRESHOLD,
  GUARD_HALF_FOV,
  sampleVision,
  SUSPICIOUS_THRESHOLD,
  worldRaycast,
  type DetectionMeterState,
  type VisionCounters,
  type WatcherPose
} from "./gameplay/vision";
import { CAMERA_RANGE, GUARD_RANGE } from "./gameplay/floor";
import { guardHearsNoise } from "./gameplay/guard";

declare global {
  interface Window {
    __aura3dGameSnapshot?: GalleryShiftEvidence;
    /** `?debug=1` only: the salvaged thief's documented test teleport. */
    __aura3dGalleryDebug?: { readonly teleport: (x: number, z: number) => void };
  }
}

type Phase = "playing" | "caught" | "won";

interface GalleryShiftEvidence {
  readonly framed: boolean;
  readonly state: Phase;
  readonly frame: number;
  /** Real detection-meter value from the salvaged vision system (0..1). */
  readonly detection: number;
  readonly seen: boolean;
  readonly score: number;
  readonly caught: number;
  readonly escaped: number;
  readonly guards: readonly { readonly id: string; readonly x: number; readonly z: number; readonly yaw: number; readonly state: string }[];
  readonly thief: { readonly x: number; readonly z: number; readonly gait: string; readonly carrying: boolean };
  readonly lifted: readonly string[];
  readonly events: readonly string[];
  readonly look: { readonly id: string; readonly category: string };
  readonly drawCalls: number;
  readonly evidence: unknown;
}

const LOOK_ID = "interior-warm" as const;
const LAYOUT: FloorLayout = FLOOR_LAYOUTS[0]!;
const FIXED_DT = 1 / 60;
const EYE_Y = 1.55;
const THIEF_EYE_Y = 1.1;
const BASE_ORTHO_SIZE = 8.6;
const MIN_HALF_WIDTH = 10.8;

function viewportAspect(): number {
  const w = typeof window !== "undefined" && window.innerWidth > 0 ? window.innerWidth : 1280;
  const h = typeof window !== "undefined" && window.innerHeight > 0 ? window.innerHeight : 720;
  const aspect = w / h;
  return Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
}

function viewportOrthoSize(): number {
  return Math.max(BASE_ORTHO_SIZE, MIN_HALF_WIDTH / viewportAspect());
}

// Same scale convention as the Blockfall rebuild: GLBs were authored
// against a 1.082 m reference cube, so RENORM keeps rendered sizes true.
const RENORM = 1.082 / assets.quaterniusCubeCrate.bounds[1];
const bs = (metres: number) => (metres / 2) * RENORM;
const WALL_RENORM_X = 1.082 / assets.quaterniusWallModular.bounds[0];
const WALL_RENORM_Y = 1.082 / assets.quaterniusWallModular.bounds[1];
const WALL_RENORM_Z = 1.082 / assets.quaterniusWallModular.bounds[2];

const inputOptions = {
  actions: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    up: ["KeyW", "ArrowUp"],
    down: ["KeyS", "ArrowDown"],
    sneak: ["KeyC"],
    sprint: ["ShiftLeft", "ShiftRight"],
    interact: ["KeyE"],
    reset: ["KeyR"]
  },
  bufferMs: 100
} as const;

const routeEvents = game.eventLog({ label: "gallery shift events", maxEvents: 18 });
const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "score", id: "hud:score", label: "score", source: "app-state", valuePath: "appState.score", format: "number", a11yLabel: "score" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event log", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event log", debugOnly: true }
] as const;

let latestSnapshot: GalleryShiftEvidence | undefined;

const galleryGame = createGame({
  id: "gallery-shift",
  target: "#app",
  diagnostics: { overlay: true, performancePanel: true },
  scene: () => buildScene(),
  input: inputOptions,
  hud: {
    theme: "arcade-neon",
    widgets: [
      { id: "score", kind: "score", anchor: "top-left", label: "LOOT" },
      // Detection meter over the real 0..1 vision value. HudKit requires a
      // numeric max > 0 (prd14 T0-29); the C-24 contract spec omits the
      // field, so the entry asserts through the contract shape — createGame
      // forwards the object verbatim to mountHud, which reads `max`.
      { id: "alert", kind: "meter", max: 1, anchor: "top-right", label: "DETECTION" } as { id: string; kind: string; anchor: "top-right"; label: string },
      { id: "objective", kind: "objective", anchor: "bottom", label: "OBJECTIVE" }
    ]
  },
  touch: {
    preset: "dpad-2btn",
    bindings: { left: "left", right: "right", up: "up", down: "down", dash: "sprint", jump: "interact", attack: "sneak" }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: { galleryShift: () => latestSnapshot ?? { status: "unbound" } }
  }
});
const app = galleryGame.app;
if (!galleryGame.input) throw new Error("gallery-shift failed to create runtime-owned input.");
const input = galleryGame.input;
// createGame lifecycle (Blockfall precedent): start() runs the session
// booting -> loading -> playing; without it the beacon never leaves booting.
galleryGame.start();

// ------------------------------------------------------------- round state --
let floorWorld: FloorWorld = createFloorWorld(LAYOUT);
let thief = makeThief();
let guards: GuardAgent[] = LAYOUT.guards.map((spawn) => new GuardAgent(spawn));
let detection: DetectionMeterState = { value: 0, secondsSinceSeen: 0 };
let counters: VisionCounters = { losRayCount: 0, occlusionCount: 0 };
let phase: Phase = "playing";
let score = 0;
let caughtCount = 0;
let escapedCount = 0;
let liftedIds: string[] = [];
let frame = 0;
let simTime = 0;
let thiefSeen = false;
let objective = "Lift both exhibits (hold E by a pedestal), then reach the north exit. Avoid the guard cones.";

function makeThief(): ThiefPlayer {
  return new ThiefPlayer(LAYOUT, layoutRects(LAYOUT), layoutCircles(LAYOUT), floorWorld.thiefBody, LAYOUT.thiefSpawn);
}

function resetRound(): void {
  floorWorld = createFloorWorld(LAYOUT);
  thief = makeThief();
  guards = LAYOUT.guards.map((spawn) => new GuardAgent(spawn));
  detection = { value: 0, secondsSinceSeen: 0 };
  counters = { losRayCount: 0, occlusionCount: 0 };
  phase = "playing";
  score = 0;
  liftedIds = [];
  simTime = 0;
  thiefSeen = false;
  objective = "Lift both exhibits (hold E by a pedestal), then reach the north exit. Avoid the guard cones.";
  exhibitNodes.forEach((node) => node.setVisible(true));
  routeEvents.push({ type: "reset", label: "reset" });
}

if (typeof location !== "undefined" && /(?:^\?|&)debug=1(?:&|$)/.test(location.search)) {
  window.__aura3dGalleryDebug = { teleport: (x, z) => thief.teleport(x, z) };
}

// ------------------------------------------------------------ scene build --
function buildScene() {
  const nodes: AuraNodeInput[] = [];
  const marble = material.pbr({ color: "#1b2230", roughness: 0.35, metalness: 0.15 });
  const wallMat = material.pbr({ color: "#3a4356", roughness: 0.6, metalness: 0.1 });

  // Floor slab spans the walkable bounds of the salvaged layout.
  nodes.push(
    model(assets.quaterniusCubeCrate, { name: "gallery floor slab", material: marble })
      .position(0, -0.06, 0)
      .scale([bs(21.2), bs(0.12), bs(15.2)])
  );
  // Every layout wall rect becomes a visible wall panel — fresh room
  // construction from salvaged layout data (perimeter included; the
  // trashed candidate's interior GLB is not used).
  for (const wall of LAYOUT.walls) {
    nodes.push(
      model(assets.quaterniusWallModular, { name: `wall ${wall.id}`, material: wallMat, castShadow: true })
        .position(wall.x, wall.height / 2, wall.z)
        .scale([(wall.halfX * 2) / 2 * WALL_RENORM_X * 2, (wall.height / 2) * WALL_RENORM_Y * 2, (wall.halfZ * 2) / 2 * WALL_RENORM_Z * 2])
    );
  }
  for (const pedestal of LAYOUT.pedestals) {
    nodes.push(
      model(assets.quaterniusCubeCrate, { name: `pedestal ${pedestal.id}`, material: material.pbr({ color: "#8a7a55", roughness: 0.4, metalness: 0.35 }) })
        .position(pedestal.x, 0.5, pedestal.z)
        .scale([bs(0.7), bs(1.0), bs(0.7)]),
      model(assets.quaterniusCubeCrate, { name: `exhibit ${pedestal.id}`, material: material.neon({ color: "#62f8e7", emissive: "#62f8e7", emissiveIntensity: 0.8 }) })
        .position(pedestal.x, 1.25, pedestal.z)
        .scale(bs(0.42))
        .runtime(game.runtimeNode(`exhibit-${pedestal.id}`, { tags: ["exhibit", "runtime"] }))
    );
  }
  for (const displayCase of LAYOUT.cases) {
    nodes.push(
      model(assets.quaterniusCubeCrate, { name: `case ${displayCase.id}`, material: material.pbr({ color: "#2c3e50", roughness: 0.2, metalness: 0.5 }) })
        .position(displayCase.x, 0.55, displayCase.z)
        .scale([bs(1.1), bs(1.1), bs(1.1)])
    );
  }
  nodes.push(
    model(assets.quaterniusCubeCrate, { name: "service exit pad", material: material.neon({ color: "#4ce8b0", emissive: "#4ce8b0", emissiveIntensity: 1.0 }) })
      .position(LAYOUT.exit.x, 0.04, LAYOUT.exit.z)
      .scale([bs(1.6), bs(0.08), bs(1.0)])
  );
  // Thief + guards: runtime nodes driven every frame from salvaged agents.
  nodes.push(
    model(assets.quaterniusCubeCrate, { name: "thief", material: material.neon({ color: "#d8c9a8", emissive: "#d8c9a8", emissiveIntensity: 0.35 }) })
      .position(LAYOUT.thiefSpawn.x, 0.85, LAYOUT.thiefSpawn.z)
      .scale([bs(0.55), bs(1.7), bs(0.55)])
      .runtime(game.runtimeNode("thief", { tags: ["thief", "runtime"] }))
  );
  LAYOUT.guards.forEach((spawn, index) => {
    nodes.push(
      model(assets.quaterniusCubeCrate, { name: `guard ${spawn.id}`, material: material.neon({ color: "#ff5d7d", emissive: "#ff5d7d", emissiveIntensity: 0.4 }) })
        .position(spawn.x, 0.9, spawn.z)
        .scale([bs(0.6), bs(1.8), bs(0.6)])
        .runtime(game.runtimeNode(`guard-${index}`, { tags: ["guard", "runtime"] })),
      // Authored vision-cone volume: a flattened, elongated translucent
      // wedge laid along the guard's facing. Detection itself is the
      // salvaged cone+raycast math (vision.ts); this mesh only reads it.
      model(assets.quaterniusCubeCrate, { name: `vision cone ${spawn.id}`, material: material.neon({ color: "#ffb454", emissive: "#ffb454", emissiveIntensity: 0.22 }) })
        .position(spawn.x, 0.12, spawn.z)
        .scale([bs(3.2), bs(0.06), bs(6)])
        .runtime(game.runtimeNode(`cone-${index}`, { tags: ["cone", "runtime"] }))
    );
  });

  return scene()
    .add(looks.preset(LOOK_ID))
    .addMany(nodes)
    .camera(camera.orthographic({ position: [0, 17, 10.5], target: [0, 0, 0], orthographicSize: viewportOrthoSize() }));
}

let appliedOrthoSize = viewportOrthoSize();
app.camera?.use(
  camera.rigs.static({ position: [0, 17, 10.5], target: [0, 0, 0], orthographicSize: appliedOrthoSize })
);

let thiefNode: AuraRuntimeNodeHandle = app.nodes.require("thief");
let guardNodes: AuraRuntimeNodeHandle[] = LAYOUT.guards.map((_, index) => app.nodes.require(`guard-${index}`));
let coneNodes: AuraRuntimeNodeHandle[] = LAYOUT.guards.map((_, index) => app.nodes.require(`cone-${index}`));
let exhibitNodes: AuraRuntimeNodeHandle[] = LAYOUT.pedestals.map((pedestal) => app.nodes.require(`exhibit-${pedestal.id}`));
void thiefNode; void guardNodes; void coneNodes;

const hudRoot = createHud();
let accumulator = 0;

app.onFrame(({ dt }) => {
  if (input.pressed("reset")) resetRound();
  if (phase === "playing") {
    accumulator += Math.min(dt, 0.1);
    while (accumulator >= FIXED_DT) {
      stepFixed();
      accumulator -= FIXED_DT;
    }
  }
  syncVisuals();
  renderHud();
  publishEvidence();
});

renderHud();
publishEvidence();

// ------------------------------------------------------------ fixed step --
function stepFixed(): void {
  frame += 1;
  simTime += FIXED_DT;
  const moveX = (input.held("right") ? 1 : 0) - (input.held("left") ? 1 : 0);
  const moveZ = (input.held("down") ? 1 : 0) - (input.held("up") ? 1 : 0);
  const gait: ThiefGait = input.held("sneak") ? "sneak" : input.held("sprint") ? "sprint" : "walk";
  const unlifted = LAYOUT.pedestals.filter((pedestal) => !liftedIds.includes(pedestal.id));
  const noises = thief.update(FIXED_DT, { moveX, moveZ, gait, liftHeld: input.held("interact") }, unlifted);

  const sensors = floorWorld.stepFixed(1);
  for (const sensor of sensors) {
    if (sensor.kind === "exit" && liftedIds.length >= LAYOUT.pedestals.length) {
      phase = "won";
      escapedCount += 1;
      objective = `Escaped with ${score} loot. Press R to run it again.`;
      routeEvents.push({ type: "escaped", label: "escaped" });
    }
  }

  const lifted = thief.takeCompletedLift();
  if (lifted) {
    liftedIds = [...liftedIds, lifted.id];
    score += lifted.value;
    guards.forEach((guard) => guard.registerLift(liftedIds));
    const exhibitNode = exhibitNodes[LAYOUT.pedestals.findIndex((pedestal) => pedestal.id === lifted.id)];
    exhibitNode?.setVisible(false);
    objective = liftedIds.length >= LAYOUT.pedestals.length
      ? "All exhibits lifted. Reach the north exit."
      : `Lifted ${lifted.id} (+${lifted.value}). One exhibit remains.`;
    routeEvents.push({ type: "lift", label: `lift:${lifted.id}` });
  }

  for (const noise of noises) {
    for (const guard of guards) {
      if (guardHearsNoise(guard, noise)) guard.hearNoise({ x: noise.x, z: noise.z });
    }
  }

  const watchers: WatcherPose[] = [
    ...guards.map((guard) => ({
      kind: "guard" as const, id: guard.id, x: guard.x, z: guard.z, eyeY: EYE_Y,
      yaw: guard.yaw, halfFov: GUARD_HALF_FOV, range: GUARD_RANGE
    })),
    ...LAYOUT.cameras.map((cam) => ({
      kind: "camera" as const, id: cam.id, x: cam.x, z: cam.z, eyeY: cam.height,
      yaw: cameraYawAt(cam, simTime), halfFov: CAMERA_HALF_FOV, range: CAMERA_RANGE
    }))
  ];
  const vision = sampleVision(
    worldRaycast(floorWorld.world), watchers, thief.x, thief.z, THIEF_EYE_Y,
    brightnessAt(LAYOUT.lightPools, thief.x, thief.z), [floorWorld.thiefBodyId], counters, false
  );
  thiefSeen = vision.thiefSeen;
  detection = advanceDetection(detection, vision.totalFillPerSecond, FIXED_DT);

  const lastSeen = vision.thiefSeen ? { x: thief.x, z: thief.z } : null;
  if (lastSeen && detection.value >= ALERT_THRESHOLD) {
    guards.forEach((guard) => guard.reportAlert(lastSeen));
  } else if (lastSeen && detection.value >= SUSPICIOUS_THRESHOLD) {
    guards.forEach((guard) => guard.reportSuspicious(lastSeen));
  }
  for (const guard of guards) {
    guard.update({
      dt: FIXED_DT,
      detection: detection.value,
      suspiciousThreshold: SUSPICIOUS_THRESHOLD,
      alertThreshold: ALERT_THRESHOLD,
      lastSeen,
      laserAlertPoint: null
    });
  }

  if (detection.value >= CAUGHT_THRESHOLD) {
    phase = "caught";
    caughtCount += 1;
    objective = "Caught. Press R to try again.";
    routeEvents.push({ type: "caught", label: "caught" });
  }
}

// ---------------------------------------------------------------- sync/HUD --
function syncVisuals(): void {
  const nextOrthoSize = viewportOrthoSize();
  if (Math.abs(nextOrthoSize - appliedOrthoSize) > 1e-3) {
    appliedOrthoSize = nextOrthoSize;
    app.camera?.setPose({ orthographicSize: appliedOrthoSize });
  }
  const snap = thief.snapshot();
  const yaw = snap.moving ? Math.atan2(snap.moveX, snap.moveZ) : undefined;
  thiefNode.setPosition(snap.x, 0.85, snap.z);
  if (yaw !== undefined) thiefNode.setRotation(0, yaw, 0);
  guards.forEach((guard, index) => {
    guardNodes[index]?.setPosition(guard.x, 0.9, guard.z).setRotation(0, guard.yaw, 0);
    const fx = Math.sin(guard.yaw);
    const fz = Math.cos(guard.yaw);
    coneNodes[index]?.setPosition(guard.x + fx * 3, 0.12, guard.z + fz * 3).setRotation(0, guard.yaw, 0);
  });
}

function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "gallery-shift-hud";
  root.style.cssText = [
    "position:absolute", "left:16px", "top:16px", "z-index:5", "min-width:320px",
    "font:600 13px/1.35 system-ui, sans-serif", "color:#f5fbff",
    "background:rgba(7,9,13,0.74)", "border:1px solid rgba(255,180,84,0.4)",
    "border-radius:8px", "padding:12px", "pointer-events:none"
  ].join(";");
  document.body.append(root);
  return root;
}

function renderHud(): void {
  galleryGame.hud.set("score", score);
  galleryGame.hud.set("alert", detection.value);
  galleryGame.hud.set("objective", objective);
  hudRoot.innerHTML = [
    `<strong>Gallery Shift</strong>`,
    `<div>Loot ${score} | Detection ${Math.round(detection.value * 100)}% | ${phase}</div>`,
    `<div>${objective}</div>`,
    `<div>Move WASD/arrows. Sneak C. Sprint Shift. Lift hold E. Reset R.</div>`
  ].join("");
}

function publishEvidence(): void {
  const snap = thief.snapshot();
  const evidence = app.evidence({
    input,
    events: routeEvents,
    hud: hudBindings,
    appState: {
      score,
      objective,
      events: routeEvents.events().map((event: { readonly label: string }) => event.label)
    },
    assets: { typedAssets: Object.keys(assets).length, missingAssets: [] },
    source: { expectsGame: true }
  });
  const diagnostics = app.diagnostics();
  const snapshot: GalleryShiftEvidence = {
    framed: diagnostics.drawCalls > 0,
    state: phase,
    frame,
    detection: detection.value,
    seen: thiefSeen,
    score,
    caught: caughtCount,
    escaped: escapedCount,
    guards: guards.map((guard) => {
      const guardSnap = guard.snapshot();
      return { id: guardSnap.id, x: guardSnap.x, z: guardSnap.z, yaw: guardSnap.yaw, state: guardSnap.state };
    }),
    thief: { x: snap.x, z: snap.z, gait: snap.gait, carrying: snap.carrying },
    lifted: [...liftedIds],
    events: routeEvents.events().map((event: { readonly label: string }) => event.label),
    look: { id: LOOK_ID, category: "interior" },
    drawCalls: diagnostics.drawCalls,
    evidence
  };
  latestSnapshot = snapshot;
  window.__aura3dGameSnapshot = snapshot;
  Reflect.set(window, "__AURA3D_SHOWCASE_GALLERY_SHIFT__", snapshot);
}
